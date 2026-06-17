"""
build_index.py
================
Scans the `tiles` branch (checked out at repo root when this runs) for every
month folder that has a manifest.json, and builds a lightweight index file
the frontend's date picker dropdown reads.

Called by both pipeline.yml (daily) and backfill.yml (historical backfill)
after tiles for a month have been committed — kept as a standalone script
rather than an inline YAML heredoc, since embedding multi-line Python inside
a YAML block scalar is fragile (indentation requirements for YAML and for
bash heredoc terminators conflict with each other).

Usage (run from repo root, on the `tiles` branch):
    python3 pipeline/build_index.py
"""

import json
import os

months = []
for entry in sorted(os.listdir("tiles")):
    manifest_path = os.path.join("tiles", entry, "manifest.json")
    if os.path.isdir(os.path.join("tiles", entry)) and os.path.exists(manifest_path):
        with open(manifest_path) as f:
            m = json.load(f)
        months.append({
            "date":      m["date"],
            "condition": m["condition"],
            "nino34":    m["indices"]["nino34"],
        })

months.sort(key=lambda x: x["date"])

with open("tiles/available-months.json", "w") as f:
    json.dump(months, f, indent=2)

print(f"Indexed {len(months)} available months")
