#!/usr/bin/env python3
"""Disk-based hour coverage for PMI 579 bullets vs 578 neighbor on Soft Soft."""
import os
from datetime import datetime, timedelta, timezone

CAMS = [
    "i150200700_579_2_24_bullet",
    "i150200700_579_2_25_bullet",
    "i150200700_579_2_26_bullet",
    "i150200700_579_2_27_bullet",
    "i150200700_578_2_10_bullet",
    "i150200700_578_2_11_bullet",
]
BASE = "/securevu/recordings"
now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
hours = [now - timedelta(hours=i) for i in range(23, -1, -1)]

print("UTC_now_hour", now.isoformat())
for cam in CAMS:
    ratios = []
    sizes = []
    for h in hours:
        d = os.path.join(BASE, h.strftime("%Y-%m-%d"), h.strftime("%H"), cam)
        if not os.path.isdir(d):
            ratios.append(0.0)
            sizes.append(0)
            continue
        files = [f for f in os.listdir(d) if f.endswith(".mp4")]
        n = len(files)
        dur = min(3600, n * 10)
        elapsed = 3600.0
        if h == now:
            elapsed = max(1.0, (datetime.now(timezone.utc) - h).total_seconds())
        ratios.append(round(min(1.0, dur / elapsed), 2))
        try:
            sizes.append(sum(os.path.getsize(os.path.join(d, f)) for f in files))
        except OSError:
            sizes.append(0)
    avg = sum(ratios) / len(ratios)
    nz = sum(1 for r in ratios if r > 0)
    print(
        f"{cam}: hours_with_data={nz}/24 avg_ratio={avg:.2f} "
        f"last6={ratios[-6:]} last6_MB={[round(s/1e6,1) for s in sizes[-6:]]}"
    )
