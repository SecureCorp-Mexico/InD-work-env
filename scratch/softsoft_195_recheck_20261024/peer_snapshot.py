#!/usr/bin/env python3
"""Peer Soft Soft snapshot: knobs + write rate + sample record channel + segment sizes."""
from __future__ import annotations

import json
import os
import re
import statistics
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import yaml

NOW = datetime.now(timezone.utc)
CFG = Path("/opt/stacks/securevu/config/config.yaml")


def parse_rtsp_host(url: str):
    m = re.search(r"rtsp://(.+)", url or "", re.I)
    if not m:
        return None, None
    rest = m.group(1)
    authority, _, path = rest.partition("/")
    if "@" in authority:
        authority = authority.rsplit("@", 1)[1]
    host = authority.split(":")[0]
    ch = None
    cm = re.search(r"Channels/(\d+)", "/" + path)
    if cm:
        ch = cm.group(1)
    if re.match(r"^\d+\.\d+\.\d+\.\d+$", host) and not host.startswith("127."):
        return host, ch
    return None, ch


def dir_size(p: Path) -> int:
    if not p.is_dir():
        return 0
    t = 0
    for root, _, files in os.walk(p):
        for fn in files:
            try:
                t += (Path(root) / fn).stat().st_size
            except OSError:
                pass
    return t


def percentile(vals, p):
    if not vals:
        return None
    s = sorted(vals)
    k = (len(s) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(s) - 1)
    return float(s[f] if f == c else s[f] + (s[c] - s[f]) * (k - f))


def main():
    with CFG.open() as f:
        cfg = yaml.safe_load(f)
    cameras = cfg.get("cameras") or {}
    go2 = (cfg.get("go2rtc") or {}).get("streams") or {}
    record_g = cfg.get("record") or {}
    detect_g = cfg.get("detect") or {}
    ffmpeg_g = cfg.get("ffmpeg") or {}

    g2 = {}
    for sn, raw in go2.items():
        urls = raw if isinstance(raw, list) else [raw]
        hosts, chans = [], []
        for u in urls if isinstance(urls, list) else []:
            if not isinstance(u, str):
                continue
            h, ch = parse_rtsp_host(u)
            if h:
                hosts.append(h)
            if ch:
                chans.append(ch)
        g2[sn] = {"hosts": hosts, "channels": chans}

    ch102 = ch101 = 0
    detect_64 = 0
    for name, cam in cameras.items():
        if not isinstance(cam, dict):
            continue
        det = cam.get("detect") or {}
        dw = det.get("width", detect_g.get("width"))
        dh = det.get("height", detect_g.get("height"))
        if dw == 64 and dh == 64:
            detect_64 += 1
        for inp in (cam.get("ffmpeg") or {}).get("inputs") or []:
            if "record" not in (inp.get("roles") or []):
                continue
            path = inp.get("path") or ""
            m = re.search(r"/([A-Za-z0-9_\-]+)$", path)
            sn = m.group(1) if m else ""
            chans = g2.get(sn, {}).get("channels") or []
            if "102" in chans:
                ch102 += 1
            elif "101" in chans:
                ch101 += 1

    rec = Path("/securevu/recordings")
    if not rec.is_dir():
        rec = Path("/media/securevu/recordings")
    today = NOW.strftime("%Y-%m-%d")
    hh = NOW.strftime("%H")
    hour_dir = rec / today / hh
    s1 = dir_size(hour_dir)
    time.sleep(15)
    s2 = dir_size(hour_dir)
    growth = s2 - s1
    gb_h = (growth / 15.0) * 3600 / (1024**3)

    today_total = 0
    today_path = rec / today
    cam_mp4 = defaultdict(list)
    if today_path.is_dir():
        for hdir in today_path.iterdir():
            if not hdir.is_dir():
                continue
            today_total += dir_size(hdir)
            for camdir in hdir.iterdir():
                if not camdir.is_dir():
                    continue
                for mp4 in camdir.glob("*.mp4"):
                    try:
                        st = mp4.stat()
                    except OSError:
                        continue
                    cam_mp4[camdir.name].append((st.st_mtime, st.st_size))

    now_ts = time.time()
    sizes, ages = [], []
    c5 = 0
    for cname, items in cam_mp4.items():
        items.sort(key=lambda x: x[0], reverse=True)
        mtime, size = items[0]
        sizes.append(size)
        ages.append(now_ts - mtime)
        if any(now_ts - m < 300 for m, _ in items):
            c5 += 1

    hours_elapsed = max(int(hh) + NOW.minute / 60.0, 0.1)
    out = {
        "ts": NOW.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "hostname": Path("/etc/hostname").read_text().strip() if Path("/etc/hostname").exists() else "?",
        "knobs": {
            "continuous.days": (record_g.get("continuous") or {}).get("days"),
            "detect.enabled": detect_g.get("enabled"),
            "detect.wh_fps": [detect_g.get("width"), detect_g.get("height"), detect_g.get("fps")],
            "hwaccel": ffmpeg_g.get("hwaccel_args"),
            "cameras": len(cameras),
            "go2rtc": len(go2),
            "detect_64x64": detect_64,
            "record_ch102": ch102,
            "record_ch101": ch101,
        },
        "write": {
            "hour_mb": round(s2 / (1024**2), 1),
            "growth_15s": growth,
            "gb_h_est": round(gb_h, 3),
            "today_gb": round(today_total / (1024**3), 2),
            "gb_h_today": round((today_total / (1024**3)) / hours_elapsed, 3),
            "cams_mp4_5m": c5,
            "cams_today": len(cam_mp4),
            "seg_p50": percentile(sizes, 50),
            "seg_p90": percentile(sizes, 90),
            "age_p50": percentile(ages, 50),
            "age_p90": percentile(ages, 90),
        },
    }
    print(json.dumps(out, indent=2))
    Path("/tmp/peer_snapshot.json").write_text(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
