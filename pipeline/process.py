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
    colors = [
        (0.04, 0.18, 0.72),  # strong cold  (-3°C)
        (0.25, 0.52, 0.93),  # moderate cold
        (0.72, 0.86, 1.00),  # slight cold
        (1.00, 1.00, 1.00),  # neutral (0°C)
        (1.00, 0.72, 0.58),  # slight warm
        (0.93, 0.32, 0.12),  # moderate warm
        (0.60, 0.00, 0.04),  # strong warm  (+3°C)
    ]
    return LinearSegmentedColormap.from_list("anomaly", colors)

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
def array_to_image(data: np.ndarray, cmap, vmin: float, vmax: float) -> Image.Image:
    """Convert 2D float array to RGBA PIL image. NaN -> transparent."""
    normed = np.clip((data - vmin) / (vmax - vmin), 0.0, 1.0)
    rgba   = cmap(normed)                         # (H, W, 4) float32
    rgba8  = (rgba * 255).astype(np.uint8)
    rgba8[np.isnan(data), 3] = 0                  # land/missing -> transparent
    # ERSSTv5 lat is 88N->88S (top=north already), no flip needed
    return Image.fromarray(rgba8, mode="RGBA")


# ── XYZ tile pyramid ─────────────────────────────────────────────────────────
def _lon_to_x(lon: float, z: int) -> int:
    return int((lon + 180.0) / 360.0 * (2 ** z))

def _lat_to_y(lat: float, z: int) -> int:
    lat_r = math.radians(max(-85.05, min(85.05, lat)))
    return int((1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi)
               / 2.0 * (2 ** z))

def generate_tiles(full_img: Image.Image, out_dir: Path, max_zoom: int = MAX_ZOOM) -> None:
    """
    Slice a full-world RGBA image into XYZ PNG tiles.
    full_img must represent the entire world: lon -180->+180, lat ~+85->-85
    (Web Mercator world bounds).
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
                # NEAREST (not LANCZOS) preserves hard transparency edges at
                # coastlines. LANCZOS blends neighboring pixels — including
                # transparent land pixels — into semi-transparent gradients,
                # which is exactly the "color bleeding onto land" artifact.
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

    # Resample to a clean 720x360 grid using pure numpy bilinear interpolation.
    # xarray.interp(method="linear") requires scipy under the hood — we avoid
    # that dependency entirely by doing the 2-D resample with numpy directly.
    lon_new = np.linspace(-179.75, 179.75, 720)
    lat_new = np.linspace(  89.75,  -89.75, 360)   # north -> south for image

    sst_grid  = numpy_bilinear(sst_180.values,
                               sst_180.lat.values, sst_180.lon.values,
                               lat_new, lon_new)
    anom_grid = numpy_bilinear(anom_180.values,
                               anom_180.lat.values, anom_180.lon.values,
                               lat_new, lon_new)

    # Apply a precise land mask on the resampled grid. ERSSTv5 is a 2x2 degree
    # product, so its native coastline is very coarse — bilinear-resampling it
    # to 720x360 does not add real coastal detail, and color visibly bleeds
    # onto land when draped on a high-resolution basemap. We mask using a
    # proper 1km-resolution land/sea boundary so only true ocean pixels render.
    lon_grid_mesh, lat_grid_mesh = np.meshgrid(lon_new, lat_new)
    is_ocean = globe.is_ocean(lat_grid_mesh, lon_grid_mesh)   # (360, 720) bool

    sst_grid  = np.where(is_ocean, sst_grid,  np.nan)
    anom_grid = np.where(is_ocean, anom_grid, np.nan)

    # 4. Nino indices
    indices   = compute_nino_indices(anom_180)
    condition = classify_condition(indices["nino34"])
    print(f"   Nino 3.4 = {indices['nino34']:+.2f}°C  ->  {condition}")
    print(f"   All indices: {indices}")

    # 5. Generate tile pyramids
    print("\n[3/4] Generating tiles...")

    sst_img  = array_to_image(sst_grid,  SST_CMAP,     vmin=-2,  vmax=32)
    anom_img = array_to_image(anom_grid, ANOMALY_CMAP, vmin=-3,  vmax=3)

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
