"""
process.py — DAILY PIPELINE
=============================
Runs every day via GitHub Actions cron.

Steps:
  1. Determine target month (latest available, or override via YEAR_MONTH env var)
  2. Download ERSSTv5 NetCDF for that month from NOAA OPeNDAP
  3. Load climatology baseline (climo_1991_2020.nc from Git LFS)
  4. Compute SST anomaly = observed SST − climatology mean for that calendar month
  5. Generate two sets of PNG tile pyramids (Z0–Z4):
       sst/      → absolute SST (°C), colored with a perceptual ocean palette
       anomaly/  → SST anomaly (°C), blue–white–red diverging palette
  6. Compute Niño region index values from the anomaly grid
  7. Write latest.json manifest (tile base URL, date, index values, condition)

All outputs go to pipeline/output/ and are uploaded to a GitHub Release
by the pipeline.yml workflow.
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
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from matplotlib.colors import LinearSegmentedColormap
from PIL import Image

warnings.filterwarnings("ignore")

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
OUTPUT_DIR = BASE_DIR / "output"
CLIMO_PATH = BASE_DIR / "climo_1991_2020.nc"
NOAA_BASE  = "https://www.ncei.noaa.gov/pub/data/cmb/ersst/v5/netcdf"

# ── Tile settings ─────────────────────────────────────────────────────────────
TILE_SIZE  = 256   # px per tile
MAX_ZOOM   = 4     # Z0–Z4 (sufficient for global ocean view)

# ── Niño region definitions: (lat_min, lat_max, lon_min, lon_max) ─────────────
# All ERSSTv5 longitudes are 0–360E
NINO_REGIONS = {
    "nino12":  (-10,  0, 270, 280),   # 90W–80W  → 270–280E
    "nino3":   ( -5,  5, 210, 270),   # 150W–90W → 210–270E
    "nino34":  ( -5,  5, 190, 240),   # 170W–120W→ 190–240E
    "nino4":   ( -5,  5, 160, 210),   # 160E–150W→ 160–210E
}

# ── ENSO condition thresholds (ONI-equivalent, 3-mo rolling not available in  ──
# ── single-month pipeline, so we use the Niño 3.4 anomaly as a proxy)        ──
def classify_condition(nino34_anom: float) -> str:
    if nino34_anom >= 1.5:  return "strong-el-nino"
    if nino34_anom >= 0.9:  return "moderate-el-nino"
    if nino34_anom >= 0.5:  return "weak-el-nino"
    if nino34_anom <= -1.5: return "strong-la-nina"
    if nino34_anom <= -0.9: return "moderate-la-nina"
    if nino34_anom <= -0.5: return "weak-la-nina"
    return "neutral"


# ── Color maps ────────────────────────────────────────────────────────────────
def make_sst_cmap():
    """Perceptual SST colormap: deep blue (cold) → cyan → yellow → red (warm)."""
    colors = [
        (0.05, 0.05, 0.35),  # deep ocean blue  (~0°C)
        (0.0,  0.4,  0.8),   # blue             (~10°C)
        (0.0,  0.75, 0.85),  # cyan             (~18°C)
        (0.2,  0.85, 0.5),   # teal-green       (~22°C)
        (0.95, 0.90, 0.2),   # yellow           (~26°C)
        (0.95, 0.55, 0.1),   # orange           (~29°C)
        (0.80, 0.05, 0.05),  # red              (~32°C)
    ]
    return LinearSegmentedColormap.from_list("sst", colors)

def make_anomaly_cmap():
    """Diverging blue–white–red for anomalies."""
    colors = [
        (0.05, 0.2,  0.75),  # strong cold  (−3°C)
        (0.3,  0.55, 0.95),  # moderate cold
        (0.75, 0.88, 1.0),   # slight cold
        (1.0,  1.0,  1.0),   # neutral (0°C)
        (1.0,  0.75, 0.6),   # slight warm
        (0.95, 0.35, 0.15),  # moderate warm
        (0.65, 0.0,  0.05),  # strong warm  (+3°C)
    ]
    return LinearSegmentedColormap.from_list("anomaly", colors)

SST_CMAP     = make_sst_cmap()
ANOMALY_CMAP = make_anomaly_cmap()


# ── Download ──────────────────────────────────────────────────────────────────
def download_ersst(year: int, month: int) -> Path:
    import requests
    filename  = f"ersst.v5.{year}{month:02d}.nc"
    local     = BASE_DIR / ".cache" / filename
    local.parent.mkdir(exist_ok=True)
    if not local.exists():
        url = f"{NOAA_BASE}/{filename}"
        print(f"  ↓ {url}")
        r   = requests.get(url, timeout=120)
        r.raise_for_status()
        local.write_bytes(r.content)
    else:
        print(f"  ✓ cached {filename}")
    return local


# ── Array → colored RGBA image ────────────────────────────────────────────────
def array_to_image(data: np.ndarray, cmap, vmin: float, vmax: float) -> Image.Image:
    """Convert a 2D float array to a PIL RGBA image using the given colormap."""
    normed = np.clip((data - vmin) / (vmax - vmin), 0, 1)
    rgba   = cmap(normed)           # (H, W, 4) float 0–1
    rgba8  = (rgba * 255).astype(np.uint8)
    # Land/fill values → transparent
    mask   = np.isnan(data)
    rgba8[mask, 3] = 0
    # Flip: ERSSTv5 lat is 88N→88S, image origin is top-left
    return Image.fromarray(rgba8[::-1, :, :], mode="RGBA")


# ── Tile pyramid generation ────────────────────────────────────────────────────
def lon_to_tile_x(lon_deg: float, zoom: int) -> int:
    n = 2 ** zoom
    return int((lon_deg + 180.0) / 360.0 * n)

def lat_to_tile_y(lat_deg: float, zoom: int) -> int:
    n    = 2 ** zoom
    lat_r = math.radians(lat_deg)
    return int((1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi) / 2.0 * n)

def generate_tile_pyramid(full_image: Image.Image, out_dir: Path, zoom_max: int = MAX_ZOOM):
    """
    Generate XYZ PNG tiles from a full-world RGBA image.
    The full_image must span exactly -180→180 lon, -85.05→85.05 lat (Web Mercator).
    """
    W, H = full_image.size
    for z in range(0, zoom_max + 1):
        n = 2 ** z
        tile_w = W // n
        tile_h = H // n
        for x in range(n):
            for y in range(n):
                box = (x * tile_w, y * tile_h, (x + 1) * tile_w, (y + 1) * tile_h)
                tile = full_image.crop(box).resize((TILE_SIZE, TILE_SIZE), Image.LANCZOS)
                tile_path = out_dir / str(z) / str(x) / f"{y}.png"
                tile_path.parent.mkdir(parents=True, exist_ok=True)
                tile.save(tile_path, "PNG", optimize=True)
        print(f"    Z{z}: {n*n} tiles")


# ── Niño index computation ────────────────────────────────────────────────────
def compute_nino_indices(anom: xr.DataArray) -> dict:
    """Average anomaly over each Niño region bounding box."""
    indices = {}
    for name, (lat_min, lat_max, lon_min, lon_max) in NINO_REGIONS.items():
        region = anom.sel(
            lat=slice(lat_max, lat_min),   # ERSSTv5 lat is descending
            lon=slice(lon_min, lon_max)
        )
        val = float(region.mean(skipna=True).values)
        indices[name] = round(val, 2)
    return indices


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    OUTPUT_DIR.mkdir(exist_ok=True)

    # ── Determine target month ────────────────────────────────────────────────
    env_ym = os.environ.get("YEAR_MONTH", "").strip()
    if env_ym:
        year, month = int(env_ym[:4]), int(env_ym[5:7])
    else:
        # Default: previous month (current month isn't complete yet)
        now   = datetime.now(timezone.utc)
        month = now.month - 1 if now.month > 1 else 12
        year  = now.year if now.month > 1 else now.year - 1

    label = f"{year}-{month:02d}"
    print(f"\n🌊 ENSO pipeline — processing {label}")

    # ── Download ──────────────────────────────────────────────────────────────
    print("\n[1/4] Downloading ERSSTv5...")
    nc_path = download_ersst(year, month)

    # ── Load data ─────────────────────────────────────────────────────────────
    print("\n[2/4] Loading data and computing anomaly...")
    ds      = xr.open_dataset(nc_path)
    sst_raw = ds["sst"].squeeze()   # (lat, lon)

    # Mask fill values
    sst = sst_raw.where(np.abs(sst_raw) < 1000)

    # Load climatology
    if not CLIMO_PATH.exists():
        sys.exit(f"❌ Climatology file not found: {CLIMO_PATH}\n   Run build_climo.py first.")
    climo   = xr.open_dataset(CLIMO_PATH)
    climo_m = climo["sst_mean"].sel(month=month)   # (lat, lon) for this calendar month

    # Compute anomaly
    anom = sst - climo_m

    # ── Niño indices ─────────────────────────────────────────────────────────
    indices   = compute_nino_indices(anom)
    condition = classify_condition(indices["nino34"])
    print(f"   Niño 3.4 anomaly: {indices['nino34']:+.2f}°C  → {condition}")

    # ── Generate tiles ────────────────────────────────────────────────────────
    print("\n[3/4] Generating tiles...")

    # Convert to numpy; resample to 720×360 for even tile math
    lat_new = np.linspace(89.5, -89.5, 360)
    lon_new = np.linspace(-179.75, 179.75, 720)
    sst_r   = sst.interp(lat=lat_new, lon=lon_new - 180, method="linear")   # shift 0–360 → -180–180
    anom_r  = anom.interp(lat=lat_new, lon=lon_new - 180, method="linear")

    sst_np  = sst_r.values.astype(np.float32)
    anom_np = anom_r.values.astype(np.float32)

    # SST tiles
    sst_img  = array_to_image(sst_np,  SST_CMAP,     vmin=-2,  vmax=32)
    sst_dir  = OUTPUT_DIR / "sst"
    print("   SST tiles:")
    generate_tile_pyramid(sst_img, sst_dir)

    # Anomaly tiles
    anom_img = array_to_image(anom_np, ANOMALY_CMAP, vmin=-3,  vmax=3)
    anom_dir = OUTPUT_DIR / "anomaly"
    print("   Anomaly tiles:")
    generate_tile_pyramid(anom_img, anom_dir)

    # ── Write manifest ────────────────────────────────────────────────────────
    print("\n[4/4] Writing latest.json...")

    # The GitHub Release tag matches the format tiles-YYYY-MM
    release_tag = f"tiles-{label}"
    # Tile URLs will be resolved by the frontend using the GitHub Releases download URL pattern
    manifest = {
        "date":        label,
        "release_tag": release_tag,
        "generated":   datetime.now(timezone.utc).isoformat(),
        "indices":     indices,
        "condition":   condition,
        "tile_sets": {
            "sst":     f"sst/{{z}}/{{x}}/{{y}}.png",
            "anomaly": f"anomaly/{{z}}/{{x}}/{{y}}.png",
        }
    }

    manifest_path = OUTPUT_DIR / "latest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    print(f"\n✅ Done — {label}")
    print(f"   Output: {OUTPUT_DIR}")
    print(f"   Condition: {condition}")
    print(f"   Niño indices: {indices}")


if __name__ == "__main__":
    main()
