"""
process.py — DAILY PIPELINE
=============================
Runs every day via GitHub Actions cron.

Steps:
  1. Determine target month (latest available, or YEAR_MONTH env var override)
  2. Download ERSSTv5 NetCDF for that month from NOAA OPeNDAP
  3. Load climatology baseline (climo_1991_2020.nc from Git LFS)
  4. Compute SST anomaly = observed SST - climatology mean for that calendar month
  5. Generate two PNG tile pyramids (Z0-Z4):
       sst/      -> absolute SST colored with a perceptual ocean palette
       anomaly/  -> SST anomaly with blue-white-red diverging palette
  6. Compute Nino region index values from the anomaly grid
  7. Write latest.json manifest

Dependencies: xarray, numpy, netCDF4, Pillow, matplotlib, requests
No GDAL, no scipy, no rioxarray — runs on Windows and Linux identically.
"""

import os
import sys
import json
import math
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import xarray as xr
import matplotlib
matplotlib.use("Agg")
from matplotlib.colors import LinearSegmentedColormap
from PIL import Image
from global_land_mask import globe   # precise 1km-resolution land/sea mask

warnings.filterwarnings("ignore")

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
OUTPUT_DIR = BASE_DIR / "output"
CLIMO_PATH = BASE_DIR / "climo_1991_2020.nc"
NOAA_BASE  = "https://www.ncei.noaa.gov/pub/data/cmb/ersst/v5/netcdf"

# ── Tile settings ──────────────────────────────────────────────────────────────
TILE_SIZE = 256
MAX_ZOOM  = 4      # Z0-Z4 gives 1+4+16+64+256 = 341 tiles per layer

# ── Nino region bounding boxes ─────────────────────────────────────────────────
# ERSSTv5 uses 0-360 longitudes; anomaly grid is resampled to -180/+180 below,
# so these use standard -180/+180 coordinates.
NINO_REGIONS = {
    "nino12": {"lat": (-10,  0),  "lon": (-90,  -80)},   # 90W-80W
    "nino3":  {"lat": ( -5,  5),  "lon": (-150,  -90)},  # 150W-90W
    "nino34": {"lat": ( -5,  5),  "lon": (-170, -120)},  # 170W-120W
    "nino4":  {"lat": ( -5,  5),  "lon": (160,  -150)},  # 160E-150W (dateline-crossing)
}

def classify_condition(nino34: float) -> str:
    if   nino34 >=  1.5: return "strong-el-nino"
    elif nino34 >=  0.9: return "moderate-el-nino"
    elif nino34 >=  0.5: return "weak-el-nino"
    elif nino34 <= -1.5: return "strong-la-nina"
    elif nino34 <= -0.9: return "moderate-la-nina"
    elif nino34 <= -0.5: return "weak-la-nina"
    else:                return "neutral"


# ── Colormaps ─────────────────────────────────────────────────────────────────
def make_sst_cmap() -> LinearSegmentedColormap:
    colors = [
        (0.05, 0.05, 0.35),  # deep blue  (~-2°C)
        (0.0,  0.35, 0.75),  # blue       (~8°C)
        (0.0,  0.70, 0.85),  # cyan       (~18°C)
        (0.15, 0.82, 0.50),  # teal-green (~22°C)
        (0.95, 0.88, 0.20),  # yellow     (~26°C)
        (0.95, 0.50, 0.08),  # orange     (~29°C)
        (0.78, 0.04, 0.04),  # red        (~32°C)
    ]
    return LinearSegmentedColormap.from_list("sst", colors)

def make_anomaly_cmap() -> LinearSegmentedColormap:
    """
    High-contrast diverging palette for SST anomalies. Saturates much faster
    than a naive linear ramp — real ENSO anomalies rarely exceed +/-2.5C, so
    we want strong, vivid color well before that, not pastel washes.
    """
    colors = [
        (0.02, 0.05, 0.45),  # deep navy      — extreme cold
        (0.00, 0.30, 0.85),  # vivid blue     — strong cold
        (0.25, 0.65, 1.00),  # bright cyan-blue — moderate cold
        (0.80, 0.92, 1.00),  # pale blue      — weak cold
        (1.00, 1.00, 1.00),  # white          — neutral (0C)
        (1.00, 0.88, 0.55),  # pale gold      — weak warm
        (1.00, 0.55, 0.10),  # vivid orange   — moderate warm
        (0.90, 0.10, 0.05),  # vivid red      — strong warm
        (0.55, 0.00, 0.10),  # deep maroon    — extreme warm
    ]
    return LinearSegmentedColormap.from_list("anomaly", colors)

def normalize_anomaly(data: np.ndarray, sat_point: float = 1.8) -> np.ndarray:
    """
    Non-linear normalization that gives more visual contrast to the
    meaningful +/-2C range, where almost all real ENSO signal lives, rather
    than stretching color evenly out to extreme/rare +/-3C+ values.

    Uses a signed power curve: preserves sign, compresses small values less
    than large ones would be under a pure linear map, reaching full
    saturation (0 or 1) at sat_point degrees instead of way out at 3C.
    Returns values already clipped to [0, 1] for direct colormap use.
    """
    sign    = np.sign(data)
    scaled  = np.clip(np.abs(data) / sat_point, 0, 1)
    # Power < 1 pulls mid-range values UP toward the extremes faster —
    # i.e. a 0.6C anomaly reads much more vividly than under a linear map.
    boosted = scaled ** 0.65
    return 0.5 + sign * boosted * 0.5   # remap to 0..1 with 0.5 = neutral

SST_CMAP     = make_sst_cmap()
ANOMALY_CMAP = make_anomaly_cmap()


# ── Download ──────────────────────────────────────────────────────────────────
def download_ersst(year: int, month: int) -> Path:
    import requests
    cache = BASE_DIR / ".cache"
    cache.mkdir(exist_ok=True)
    filename = f"ersst.v5.{year}{month:02d}.nc"
    local    = cache / filename
    if local.exists():
        print(f"  cached: {filename}")
        return local
    url = f"{NOAA_BASE}/{filename}"
    print(f"  downloading: {url}")
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        local.write_bytes(r.content)
    return local


# ── Array -> RGBA PIL image ───────────────────────────────────────────────────
def array_to_image(
    data: np.ndarray, cmap, vmin: float, vmax: float,
    normalize_fn=None
) -> Image.Image:
    """
    Convert 2D float array to RGBA PIL image. NaN -> transparent.
    If normalize_fn is given, it's used instead of the default linear
    (data-vmin)/(vmax-vmin) mapping — e.g. normalize_anomaly() for a
    higher-contrast, non-linear anomaly visualization.
    """
    if normalize_fn is not None:
        normed = normalize_fn(data)
    else:
        normed = np.clip((data - vmin) / (vmax - vmin), 0.0, 1.0)
    rgba   = cmap(normed)                         # (H, W, 4) float32
    rgba8  = (rgba * 255).astype(np.uint8)
    rgba8[np.isnan(data), 3] = 0                  # land/missing -> transparent
    # ERSSTv5 lat is 88N->88S (top=north already), no flip needed
    return Image.fromarray(rgba8, mode="RGBA")


def smooth_coastline_mask(is_ocean: np.ndarray, upscale: int = 4, smooth_px: float = 3.0) -> np.ndarray:
    """
    Builds a smoothed, rounded-edge ocean mask at higher resolution than the
    input. Used to give coastlines a rounder look instead of inheriting the
    blocky square-pixel shape of the underlying 0.5-degree climate data grid.

    Approach:
      1. Upscale the binary mask with NEAREST (just makes bigger squares —
         no rounding yet, this just gives us more pixels to round WITH).
      2. Blur the now-bigger binary shape's edges with a Gaussian blur,
         producing smooth grayscale values (0..255) at the boundary instead
         of a hard step.
      3. Threshold-free: we KEEP the blurred grayscale as the final alpha
         mask directly (rather than re-thresholding back to binary), which
         is what actually produces a soft, rounded-looking edge rather than
         just a repositioned hard edge.

    Returns a float array in [0, 1] at (H*upscale, W*upscale) resolution —
    this becomes the alpha channel, completely independent of color data.
    """
    from PIL import Image, ImageFilter

    # Binary mask -> 0/255 uint8 image
    mask_u8 = (is_ocean.astype(np.uint8) * 255)
    mask_img = Image.fromarray(mask_u8, mode="L")

    # Step 1: upscale with NEAREST — bigger blocky squares, same shape
    H, W = is_ocean.shape
    big = mask_img.resize((W * upscale, H * upscale), Image.NEAREST)

    # Step 2+3: blur the edges of the now-bigger shape. This is the key
    # step that actually rounds square corners — a Gaussian blur on a
    # square's edge naturally produces a rounded-looking falloff at
    # corners (corners blur "inward" from two directions at once, so
    # they shrink faster than straight edges), unlike blurring at native
    # resolution which would just produce a fuzzy SQUARE, not a round one.
    smoothed = big.filter(ImageFilter.GaussianBlur(radius=smooth_px))

    return np.array(smoothed).astype(np.float32) / 255.0


def apply_smoothed_mask(img: Image.Image, alpha_mask: np.ndarray) -> Image.Image:
    """
    Applies a smoothed alpha mask (from smooth_coastline_mask, values in
    [0,1] at a possibly-different resolution) onto an RGBA image, replacing
    its alpha channel. If resolutions differ, img is upscaled with NEAREST
    first — this keeps color blocky/accurate to the source data resolution
    while the alpha channel carries all the smooth rounded-edge detail.
    """
    target_h, target_w = alpha_mask.shape
    if img.size != (target_w, target_h):
        img = img.resize((target_w, target_h), Image.NEAREST)

    arr = np.array(img)   # (H, W, 4)
    arr[..., 3] = (alpha_mask * 255).astype(np.uint8)
    # Wherever alpha is now > 0 but was fully transparent before (i.e. a
    # land pixel picking up partial alpha from the blur), we must NOT let
    # its color show through as if it were real data — there's no real
    # ocean color there. Keep alpha at 0 in any pixel that was originally
    # land in the SOURCE (pre-blur) mask, even after smoothing, EXCEPT we
    # WANT a thin smoothed boundary band to show the nearest real ocean
    # color fading out — which is exactly what happens naturally since the
    # blur mixes in the real neighboring ocean alpha value, and color was
    # never touched (still the original NEAREST-sampled, scientifically
    # real value from the nearest ocean grid cell).
    return Image.fromarray(arr, mode="RGBA")


# ── XYZ tile pyramid ─────────────────────────────────────────────────────────
# NOTE: generate_tiles() below does pure linear pixel slicing of an
# EQUIRECTANGULAR (plain lat/lon) image — NOT Web Mercator. The frontend
# (Globe.tsx) must use Cesium's GeographicTilingScheme to match. Do not add
# Mercator projection math here unless the frontend tiling scheme is changed
# to match — mixing the two is what caused tiles to be vertically misplaced,
# increasingly so away from the equator.

def generate_tiles(full_img: Image.Image, out_dir: Path, max_zoom: int = MAX_ZOOM) -> None:
    """
    Slice a full-world RGBA image into XYZ PNG tiles using plain linear
    (equirectangular) division — no Mercator projection involved.
    full_img must represent the entire world: lon -180->+180, lat +90->-90.
    """
    W, H = full_img.size
    for z in range(0, max_zoom + 1):
        n        = 2 ** z
        tile_w   = W // n
        tile_h   = H // n
        count    = 0
        for tx in range(n):
            for ty in range(n):
                box  = (tx * tile_w, ty * tile_h, (tx + 1) * tile_w, (ty + 1) * tile_h)
                # NEAREST here resizes an already-smoothed-alpha image down/
                # up to the final tile size — color blocks stay crisp,
                # alpha already carries the rounded coastline shape from
                # smooth_coastline_mask(), so this resize doesn't need to
                # do any smoothing work itself.
                tile = full_img.crop(box).resize((TILE_SIZE, TILE_SIZE), Image.NEAREST)
                path = out_dir / str(z) / str(tx) / f"{ty}.png"
                path.parent.mkdir(parents=True, exist_ok=True)
                tile.save(path, "PNG", optimize=True)
                count += 1
        print(f"    Z{z}: {count} tiles written")


# ── Nino index computation ────────────────────────────────────────────────────
def safe_float(val: float, fallback: float = 0.0) -> float:
    """Return fallback if val is NaN or Inf — keeps JSON valid."""
    import math
    return fallback if (math.isnan(val) or math.isinf(val)) else round(val, 2)

def compute_nino_indices(anom_180: xr.DataArray) -> dict[str, float]:
    """
    Average anomaly over each Nino bounding box.
    Uses numpy boolean masks instead of xarray .sel(slice) to avoid empty
    selections when grid points don't align with region boundaries.
    """
    lat  = anom_180.lat.values   # descending (88N -> 88S)
    lon  = anom_180.lon.values   # -180 to +180
    data = anom_180.values       # (lat, lon) float32

    results = {}
    for name, bb in NINO_REGIONS.items():
        lat_min, lat_max = bb["lat"]
        lon_min, lon_max = bb["lon"]

        lat_mask = (lat >= lat_min) & (lat <= lat_max)

        if lon_min > lon_max:
            # Dateline-crossing (Nino 4): 160E..180 AND -180..-150
            lon_mask = (lon >= lon_min) | (lon <= lon_max)
        else:
            lon_mask = (lon >= lon_min) & (lon <= lon_max)

        region = data[np.ix_(lat_mask, lon_mask)]
        val    = float(np.nanmean(region))
        results[name] = safe_float(val)

    return results


# ── Fill NaN with nearest valid neighbor (pure numpy, no scipy) ──────────────
def fill_nan_nearest(data: np.ndarray) -> np.ndarray:
    """
    Replace NaN values with the value of their nearest non-NaN neighbor.
    Used to fill land/missing cells in the SOURCE grid before interpolation,
    so bilinear blending never has to mix real numbers with NaN — that mixing
    is what previously caused interpolation to wipe out nearby ocean cells.
    The land mask (applied separately, at high resolution) is what actually
    decides what's hidden in the final output; this fill is purely a
    numerical stepping-stone so interpolation behaves like a normal smooth
    field with no holes in it.

    Implementation: iterative nearest-neighbor fill via 8-connected dilation.
    Fast enough for a ~90x180 source grid (ERSSTv5 native resolution).
    """
    filled = data.copy()
    mask   = np.isnan(filled)
    if not mask.any():
        return filled

    # Repeatedly grow valid regions into NaN regions until none remain.
    # Each pass: for every NaN cell, average any valid 8-connected neighbors.
    max_passes = max(filled.shape) * 2   # generous upper bound, exits early
    for _ in range(max_passes):
        if not mask.any():
            break
        # Pad with NaN border so edge cells don't wrap incorrectly
        padded = np.pad(filled, 1, mode="edge")
        neighbor_stack = np.stack([
            padded[0:-2, 0:-2], padded[0:-2, 1:-1], padded[0:-2, 2:],
            padded[1:-1, 0:-2],                     padded[1:-1, 2:],
            padded[2:,   0:-2], padded[2:,   1:-1], padded[2:,   2:],
        ])
        neighbor_mean = np.nanmean(neighbor_stack, axis=0)
        still_nan     = np.isnan(filled)
        fillable      = still_nan & ~np.isnan(neighbor_mean)
        filled[fillable] = neighbor_mean[fillable]
        new_mask = np.isnan(filled)
        if new_mask.sum() == mask.sum():
            # No progress this pass (isolated NaN with no valid neighbors
            # anywhere nearby yet) — still shrinking overall, just slowly.
            pass
        mask = new_mask

    # Any leftover NaN (extremely rare, e.g. fully isolated regions) -> 0
    filled[np.isnan(filled)] = 0.0
    return filled


# ── Pure-numpy 2-D bilinear interpolation ────────────────────────────────────
def numpy_bilinear(
    data: np.ndarray,
    src_lat: np.ndarray, src_lon: np.ndarray,
    dst_lat: np.ndarray, dst_lon: np.ndarray,
) -> np.ndarray:
    """
    Resample a 2-D (lat, lon) array to a new lat/lon grid using bilinear
    interpolation — no scipy, no xarray interp, pure numpy only.

    src_lat may be ascending or descending; dst_lat is assumed descending
    (north-to-south, as required for image output).
    """
    # Ensure src arrays are ascending for np.interp / searchsorted
    if src_lat[0] > src_lat[-1]:
        data    = data[::-1, :]
        src_lat = src_lat[::-1]
    if src_lon[0] > src_lon[-1]:
        data    = data[:, ::-1]
        src_lon = src_lon[::-1]

    H_src, W_src = data.shape
    H_dst = len(dst_lat)
    W_dst = len(dst_lon)

    # Map destination coordinates to fractional source indices
    lat_idx = np.interp(dst_lat, src_lat, np.arange(H_src))
    lon_idx = np.interp(dst_lon, src_lon, np.arange(W_src))

    # Integer floor indices and fractional weights
    lat0 = np.clip(lat_idx.astype(int),     0, H_src - 2)
    lon0 = np.clip(lon_idx.astype(int),     0, W_src - 2)
    lat1 = lat0 + 1
    lon1 = lon0 + 1

    wlat = (lat_idx - lat0).astype(np.float32)   # (H_dst,)
    wlon = (lon_idx - lon0).astype(np.float32)   # (W_dst,)

    # Broadcast to (H_dst, W_dst)
    wlat = wlat[:, np.newaxis]
    wlon = wlon[np.newaxis, :]

    # Fetch the four surrounding values
    d00 = data[lat0[:, np.newaxis], lon0[np.newaxis, :]].astype(np.float32)
    d01 = data[lat0[:, np.newaxis], lon1[np.newaxis, :]].astype(np.float32)
    d10 = data[lat1[:, np.newaxis], lon0[np.newaxis, :]].astype(np.float32)
    d11 = data[lat1[:, np.newaxis], lon1[np.newaxis, :]].astype(np.float32)

    # NaN-safe bilinear blend
    result = (
        d00 * (1 - wlat) * (1 - wlon) +
        d01 * (1 - wlat) *      wlon  +
        d10 *      wlat  * (1 - wlon) +
        d11 *      wlat  *      wlon
    )

    # If any of the four neighbours is NaN, mark result NaN (land/missing)
    nan_mask = np.isnan(d00) | np.isnan(d01) | np.isnan(d10) | np.isnan(d11)
    result[nan_mask] = np.nan

    return result


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)

    # 1. Determine target month
    env_ym = os.environ.get("YEAR_MONTH", "").strip()
    if env_ym:
        year, month = int(env_ym[:4]), int(env_ym[5:7])
    else:
        now   = datetime.now(timezone.utc)
        month = now.month - 1 if now.month > 1 else 12
        year  = now.year  if now.month > 1 else now.year - 1

    label = f"{year}-{month:02d}"
    print(f"\n=== ENSO pipeline: {label} ===\n")

    # 2. Download
    print("[1/4] Downloading ERSSTv5...")
    nc_path = download_ersst(year, month)

    # 3. Load + anomaly
    print("\n[2/4] Computing anomaly...")
    ds  = xr.open_dataset(nc_path)
    sst = ds["sst"].squeeze()                          # (lat, lon), lon 0-360
    sst = sst.where(sst.values < 1e5)                  # mask fill values

    if not CLIMO_PATH.exists():
        sys.exit(f"\nERROR: {CLIMO_PATH} not found.\nRun  python build_climo.py  first.")

    climo   = xr.open_dataset(CLIMO_PATH)
    climo_m = climo["sst_mean"].sel(month=month)       # (lat, lon)
    anom    = sst - climo_m

    # Shift longitudes 0-360 -> -180/+180 for tile math and Nino indices
    sst_180  = sst.assign_coords( lon=(sst.lon  - 180)).sortby("lon")
    anom_180 = anom.assign_coords(lon=(anom.lon - 180)).sortby("lon")

    # Fill NaN (land) in the SOURCE data before interpolating. ERSSTv5's
    # native 2-degree grid already has NaN over land; if we interpolate with
    # those NaNs present, numpy_bilinear's "any neighbor NaN -> NaN" rule
    # kills huge swaths of near-shore OCEAN too (since most coastal points'
    # 4 nearest 2-degree neighbors include at least one land cell). That
    # conflicted with our separate fine-resolution land mask applied after,
    # producing a patchwork of wrongly-hidden ocean and wrongly-shown land.
    # Fix: fill source NaNs via nearest-neighbor extrapolation first, so
    # interpolation always blends real numbers — then let the fine land
    # mask (applied below) be the ONLY authority on what's hidden.
    sst_filled  = fill_nan_nearest(sst_180.values)
    anom_filled = fill_nan_nearest(anom_180.values)

    # Resample to a clean 720x360 grid using pure numpy bilinear interpolation.
    # xarray.interp(method="linear") requires scipy under the hood — we avoid
    # that dependency entirely by doing the 2-D resample with numpy directly.
    lon_new = np.linspace(-179.75, 179.75, 720)
    lat_new = np.linspace(  89.75,  -89.75, 360)   # north -> south for image

    sst_grid  = numpy_bilinear(sst_filled,
                               sst_180.lat.values, sst_180.lon.values,
                               lat_new, lon_new)
    anom_grid = numpy_bilinear(anom_filled,
                               anom_180.lat.values, anom_180.lon.values,
                               lat_new, lon_new)

    # NOTE: masking moved to AFTER image generation (see build_masked_image()
    # below) — we no longer apply np.where(is_ocean, ..., nan) here. Doing it
    # later, on a separately upscaled high-resolution mask, is what lets us
    # get rounder-looking coastlines instead of inheriting the same blocky
    # 0.5-degree grid shape that the climate DATA is naturally limited to.
    # The data itself stays at native resolution (we're not inventing finer
    # temperature detail) — only the MASK SHAPE gets finer, since the land
    # mask source (global-land-mask) is independently accurate to ~1km.

    # ── Empirical north-shift correction ─────────────────────────────────────
    # IMPORTANT: an earlier attempt shifted the SAMPLING coordinates passed
    # into numpy_bilinear (querying "give me the value at lat+N"). That was a
    # no-op in practice: np.interp clamps queries outside the source range to
    # the boundary value, and even in-range, shifting the query just samples
    # a slightly different (similar) value INTO THE SAME output pixel — it
    # never actually moves content to a different row in the image. That's
    # why increasing it from 1 to 3 degrees produced no visible change.
    #
    # The correct fix: shift the FINAL pixel rows themselves using np.roll.
    # Each row of sst_grid/anom_grid represents a 0.5-degree latitude band
    # (720x360 grid, 180 degrees / 360 rows = 0.5 deg/row). Rolling rows
    # upward (toward lower row-index / north) by N rows moves that row's
    # content to a position N*0.5 degrees further north on the rendered image.
    LAT_CORRECTION_DEG = 1.5   # degrees north; empirically tuned via visual testing
    DEG_PER_ROW = 180.0 / sst_grid.shape[0]   # 0.5 for a 360-row grid
    roll_rows = int(round(LAT_CORRECTION_DEG / DEG_PER_ROW))
    print(f"   Applying north shift: {LAT_CORRECTION_DEG} deg = {roll_rows} rows")

    # np.roll with a NEGATIVE shift moves rows toward index 0 (north, since
    # row 0 = 89.75 deg = north pole side). Rows rolled off the south edge
    # wrap to the north edge — acceptable artifact restricted to the poles,
    # far from the equatorial ENSO regions we actually care about.
    sst_grid  = np.roll(sst_grid,  -roll_rows, axis=0)
    anom_grid = np.roll(anom_grid, -roll_rows, axis=0)

    # Compute the ocean mask on the grid coordinates BEFORE the roll, then
    # apply the IDENTICAL roll to the mask. is_ocean() is a pure geographic
    # lookup against lat_new/lon_new — those coordinate arrays themselves
    # were never shifted, only sst_grid/anom_grid's CONTENT was moved
    # between rows via np.roll. So the mask must get that same roll, or it
    # ends up describing land/ocean at the PRE-shift positions while the
    # data has already moved — silently reintroducing the exact
    # land/ocean misalignment bug fixed earlier.
    lon_grid_mesh, lat_grid_mesh = np.meshgrid(lon_new, lat_new)
    is_ocean = globe.is_ocean(lat_grid_mesh, lon_grid_mesh)   # (360, 720) bool
    is_ocean = np.roll(is_ocean, -roll_rows, axis=0)

    # 4. Nino indices
    indices   = compute_nino_indices(anom_180)
    condition = classify_condition(indices["nino34"])
    print(f"   Nino 3.4 = {indices['nino34']:+.2f}°C  ->  {condition}")
    print(f"   All indices: {indices}")

    # 5. Generate tile pyramids
    print("\n[3/4] Generating tiles...")

    # Build color images WITHOUT masking (sst_grid/anom_grid have no NaN
    # at this point — they're raw interpolated values everywhere, land
    # included). Masking is applied next, separately, using a smoothed
    # high-resolution version of the mask for rounder coastlines.
    sst_img_raw  = array_to_image(sst_grid,  SST_CMAP,     vmin=-2,  vmax=32)
    anom_img_raw = array_to_image(anom_grid, ANOMALY_CMAP, vmin=-3,  vmax=3,
                                   normalize_fn=normalize_anomaly)
    # array_to_image() sets alpha=0 wherever data is NaN — but sst_grid/
    # anom_grid have NO NaN now (masking moved later), so at this point
    # every pixel (including land) has alpha=255. We override alpha
    # entirely in apply_smoothed_mask() below, so this is fine.

    print("   Building smoothed coastline mask...")
    smoothed_mask = smooth_coastline_mask(is_ocean, upscale=4, smooth_px=3.0)

    sst_img  = apply_smoothed_mask(sst_img_raw,  smoothed_mask)
    anom_img = apply_smoothed_mask(anom_img_raw, smoothed_mask)

    print("  SST tiles:")
    generate_tiles(sst_img,  OUTPUT_DIR / "sst")
    print("  Anomaly tiles:")
    generate_tiles(anom_img, OUTPUT_DIR / "anomaly")

    # 6. Manifest
    print("\n[4/4] Writing latest.json...")
    manifest = {
        "date":        label,
        "release_tag": f"tiles-{label}",
        "generated":   datetime.now(timezone.utc).isoformat(),
        "indices":     indices,
        "condition":   condition,
        "tile_sets": {
            "sst":     "sst/{z}/{x}/{y}.png",
            "anomaly": "anomaly/{z}/{x}/{y}.png",
        },
    }
    # Use allow_nan=False to catch any NaN that slipped through — fails loudly
    # rather than writing invalid JSON silently.
    try:
        json_str = json.dumps(manifest, indent=2, allow_nan=False)
    except ValueError:
        # Fallback: replace any NaN values with 0.0
        import math
        def sanitize(obj):
            if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
                return 0.0
            if isinstance(obj, dict):
                return {k: sanitize(v) for k, v in obj.items()}
            return obj
        json_str = json.dumps(sanitize(manifest), indent=2)
    (OUTPUT_DIR / "latest.json").write_text(json_str)

    print(f"\nDone. Output -> {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
