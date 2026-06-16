"""
build_climo.py — ONE-TIME SCRIPT
=================================
Downloads ERSSTv5 monthly data for 1991–2020 from NOAA OPeNDAP
and computes the monthly climatology mean (12 grids, one per calendar month).

Output: climo_1991_2020.nc
  - Dimensions: month (12), lat (89), lon (180)
  - Variable: sst_mean — the reference baseline for anomaly computation

Run once, commit the output to Git LFS:
  python build_climo.py
  git lfs track "pipeline/climo_1991_2020.nc"
  git add pipeline/climo_1991_2020.nc
  git commit -m "feat: add 1991-2020 SST climatology baseline"

This file is checked out by GitHub Actions (lfs: true) and used
by process.py on every daily run.
"""

import numpy as np
import xarray as xr
import requests
from pathlib import Path
import sys

# ERSSTv5 OPeNDAP base URL
# Each file is one month: ersst.v5.YYYYMM.nc
NOAA_BASE = "https://www.ncei.noaa.gov/pub/data/cmb/ersst/v5/netcdf"
OUTPUT_PATH = Path(__file__).parent / "climo_1991_2020.nc"

CLIMO_START = 1991
CLIMO_END   = 2020  # inclusive


def download_month(year: int, month: int, cache_dir: Path) -> xr.Dataset:
    """Download a single ERSSTv5 month to cache_dir and return as xarray Dataset."""
    filename = f"ersst.v5.{year}{month:02d}.nc"
    local = cache_dir / filename
    if not local.exists():
        url = f"{NOAA_BASE}/{filename}"
        print(f"  Downloading {url}")
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        local.write_bytes(r.content)
    return xr.open_dataset(local)


def main():
    cache_dir = Path(__file__).parent / ".cache_climo"
    cache_dir.mkdir(exist_ok=True)

    # Accumulate SST arrays by calendar month
    # Shape per month file: (1, lat, lon) — squeeze the time dim
    monthly_sums  = {}  # key: 1–12, value: accumulated numpy array
    monthly_counts = {}

    total_months = (CLIMO_END - CLIMO_START + 1) * 12
    processed = 0

    for year in range(CLIMO_START, CLIMO_END + 1):
        for month in range(1, 13):
            processed += 1
            print(f"[{processed}/{total_months}] {year}-{month:02d}", end=" ")
            try:
                ds = download_month(year, month, cache_dir)
                # ERSSTv5 variable is 'sst', shape (time=1, lat, lon)
                sst = ds["sst"].values.squeeze()  # → (lat, lon)
                # Store lat/lon coords on first iteration
                if not hasattr(main, "_lat"):
                    main._lat = ds["lat"].values
                    main._lon = ds["lon"].values
                if month not in monthly_sums:
                    monthly_sums[month]   = np.zeros_like(sst, dtype=np.float64)
                    monthly_counts[month] = 0
                # Mask fill values (ERSSTv5 uses 1e20 for land/missing)
                sst = np.where(np.abs(sst) > 1000, np.nan, sst)
                monthly_sums[month]   = np.nansum([monthly_sums[month], sst], axis=0)
                monthly_counts[month] += (~np.isnan(sst)).astype(int)
                ds.close()
                print("✓")
            except Exception as e:
                print(f"✗ WARN: {e}")

    # Compute means
    climo_means = []
    for m in range(1, 13):
        count = monthly_counts[m]
        mean  = np.where(count > 0, monthly_sums[m] / count, np.nan)
        climo_means.append(mean)

    climo = np.stack(climo_means, axis=0)  # (12, lat, lon)

    # Save as NetCDF
    ds_out = xr.Dataset(
        {"sst_mean": (["month", "lat", "lon"], climo.astype(np.float32))},
        coords={
            "month": np.arange(1, 13, dtype=np.int32),
            "lat":   main._lat,
            "lon":   main._lon,
        },
        attrs={
            "title":       "ERSSTv5 monthly climatology 1991–2020",
            "source":      "NOAA Extended Reconstructed Sea Surface Temperature v5",
            "baseline":    "1991-2020",
            "created_by":  "build_climo.py",
        }
    )
    ds_out.to_netcdf(OUTPUT_PATH)
    print(f"\n✅ Climatology saved → {OUTPUT_PATH}")
    print(f"   Shape: {climo.shape}  (months × lat × lon)")


if __name__ == "__main__":
    main()
