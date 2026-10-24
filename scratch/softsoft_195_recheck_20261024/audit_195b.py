#!/usr/bin/env python3
"""Soft Soft .195 recheck v2 — fixed RTSP user:pass@host parsing (password may contain @)."""
from __future__ import annotations

import json
import os
import re
import socket
import statistics
import subprocess
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import yaml

OUT_DIR = Path("/tmp/ss195_recheck")
OUT_DIR.mkdir(parents=True, exist_ok=True)
CFG = Path("/opt/stacks/securevu/config/config.yaml")
NOW = datetime.now(timezone.utc)
TS = NOW.strftime("%Y-%m-%dT%H:%M:%SZ")


def sh(cmd: str, timeout: int = 120) -> tuple[int, str, str]:
    p = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout, p.stderr


def parse_rtsp_host(url: str) -> tuple[str | None, str | None]:
    """Return (host, channel_hint) from rtsp URL. Password may contain @."""
    if not url or not isinstance(url, str):
        return None, None
    m = re.search(r"rtsp://(.+)", url, re.I)
    if not m:
        return None, None
    rest = m.group(1)
    # authority ends at first /
    auth_path = rest.split("/", 1)
    authority = auth_path[0]
    path = "/" + auth_path[1] if len(auth_path) > 1 else ""
    if "@" in authority:
        # rsplit once: user:pass @ host:port
        authority = authority.rsplit("@", 1)[1]
    hostport = authority
    host = hostport.split(":")[0]
    ch = None
    cm = re.search(r"Channels/(\d+)", path)
    if cm:
        ch = cm.group(1)
    if re.match(r"^\d+\.\d+\.\d+\.\d+$", host) and not host.startswith("127."):
        return host, ch
    return None, ch


def stream_name_from_local(url: str) -> str | None:
    m = re.search(r"rtsp://127\.0\.0\.1:\d+/([A-Za-z0-9_\-]+)", url or "")
    return m.group(1) if m else None


def tcp_probe(ip: str, port: int = 554, timeout: float = 1.5) -> dict:
    t0 = time.monotonic()
    try:
        s = socket.create_connection((ip, port), timeout=timeout)
        s.close()
        return {"class": "REACHABLE", "ms": round((time.monotonic() - t0) * 1000, 1)}
    except OSError as e:
        ms = round((time.monotonic() - t0) * 1000, 1)
        errno = getattr(e, "errno", None)
        msg = str(e).lower()
        if errno == 113 or "no route" in msg:
            return {"class": "NO_ROUTE", "ms": ms, "err": str(e)[:120]}
        if errno == 111 or "refused" in msg:
            return {"class": "REFUSED", "ms": ms, "err": str(e)[:120]}
        if "timed out" in msg or errno == 110:
            return {"class": "TIMEOUT", "ms": ms, "err": str(e)[:120]}
        return {"class": "ERROR", "ms": ms, "err": f"errno={errno} {e}"[:120]}


def percentile(vals: list[float], p: float) -> float | None:
    if not vals:
        return None
    s = sorted(vals)
    if len(s) == 1:
        return float(s[0])
    k = (len(s) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(s) - 1)
    return float(s[f] if f == c else s[f] + (s[c] - s[f]) * (k - f))


def dir_size(p: Path) -> int:
    if not p.is_dir():
        return 0
    total = 0
    for root, _, files in os.walk(p):
        for fn in files:
            try:
                total += (Path(root) / fn).stat().st_size
            except OSError:
                pass
    return total


def main() -> None:
    report: dict = {"ts": TS, "host": "172.20.0.195"}
    rc, out, _ = sh(
        "docker inspect securevu --format '{{.State.Health.Status}}|{{.State.StartedAt}}|{{.State.Status}}' 2>/dev/null"
    )
    report["docker"] = out.strip()

    with CFG.open() as f:
        cfg = yaml.safe_load(f)
    cameras = cfg.get("cameras") or {}
    go2 = (cfg.get("go2rtc") or {}).get("streams") or {}
    record_g = cfg.get("record") or {}
    detect_g = cfg.get("detect") or {}
    ffmpeg_g = cfg.get("ffmpeg") or {}

    report["config_knobs"] = {
        "record.enabled": record_g.get("enabled"),
        "record.continuous.days": (record_g.get("continuous") or {}).get("days"),
        "detect.enabled": detect_g.get("enabled"),
        "detect.width": detect_g.get("width"),
        "detect.height": detect_g.get("height"),
        "detect.fps": detect_g.get("fps"),
        "ffmpeg.hwaccel_args": ffmpeg_g.get("hwaccel_args"),
        "cameras_total": len(cameras),
        "go2rtc_streams": len(go2),
    }

    # Build go2rtc stream -> field info
    g2_info = {}
    for sn, raw in go2.items():
        urls = raw if isinstance(raw, list) else [raw]
        urls = [u for u in urls if isinstance(u, str)]
        hosts, chans = [], []
        for u in urls:
            h, ch = parse_rtsp_host(u)
            if h:
                hosts.append(h)
            if ch:
                chans.append(ch)
            if "stub" in u.lower():
                hosts.append("STUB")
        g2_info[sn] = {"urls": urls[:2], "hosts": hosts, "channels": chans}

    cam_rows = []
    stub_count = 0
    detect_64 = 0
    record_on_ch102 = 0
    record_on_ch101 = 0
    record_channel_unknown = 0

    for name, cam in sorted(cameras.items()):
        if not isinstance(cam, dict):
            continue
        enabled = cam.get("enabled", True) is not False
        det = cam.get("detect") or {}
        ffmpeg = cam.get("ffmpeg") or {}
        inputs = ffmpeg.get("inputs") or []
        roles_flat = []
        record_streams = []
        field_ips = []
        record_channels = []
        for inp in inputs:
            if not isinstance(inp, dict):
                continue
            roles = inp.get("roles") or []
            roles_flat.extend(roles)
            path = inp.get("path") or ""
            sn = stream_name_from_local(path)
            info = g2_info.get(sn or "", {})
            if "record" in roles:
                record_streams.append(sn)
                for h in info.get("hosts") or []:
                    if h != "STUB":
                        field_ips.append(h)
                for ch in info.get("channels") or []:
                    record_channels.append(ch)
            else:
                for h in info.get("hosts") or []:
                    if h != "STUB" and h not in field_ips:
                        field_ips.append(h)
            for u in info.get("urls") or []:
                if "stub" in u.lower():
                    stub_count += 1

        dw = det.get("width", detect_g.get("width"))
        dh = det.get("height", detect_g.get("height"))
        if dw == 64 and dh == 64:
            detect_64 += 1

        if "102" in record_channels:
            record_on_ch102 += 1
        elif "101" in record_channels:
            record_on_ch101 += 1
        elif record_channels:
            record_channel_unknown += 1
        else:
            record_channel_unknown += 1

        cam_rows.append(
            {
                "name": name,
                "enabled": enabled,
                "roles": sorted(set(roles_flat)),
                "record_streams": record_streams,
                "record_channels": record_channels,
                "field_ips": sorted(set(field_ips)),
                "detect_wh": [dw, dh],
            }
        )

    report["inventory"] = {
        "cameras": len(cam_rows),
        "disabled": sum(1 for r in cam_rows if not r["enabled"]),
        "stub_inputs": stub_count,
        "detect_64x64": detect_64,
        "record_role_on_ch102_sub": record_on_ch102,
        "record_role_on_ch101_main": record_on_ch101,
        "record_channel_other_or_unknown": record_channel_unknown,
        "note_hik": "Hikvision 101=main 102=sub; Soft Soft record on _1 → often Channels/102",
    }

    # write rate
    rec = Path("/securevu/recordings")
    if not rec.is_dir():
        rec = Path("/media/securevu/recordings")
    today = NOW.strftime("%Y-%m-%d")
    hh = NOW.strftime("%H")
    hour_dir = rec / today / hh
    size1 = dir_size(hour_dir)
    time.sleep(20)
    size2 = dir_size(hour_dir)
    growth = size2 - size1
    gb_h_est = (growth / 20.0) * 3600 / (1024**3)

    today_total = 0
    today_path = rec / today
    if today_path.is_dir():
        for hdir in today_path.iterdir():
            if hdir.is_dir():
                today_total += dir_size(hdir)
    hours_elapsed = max(int(hh) + NOW.minute / 60.0, 0.1)

    cam_mp4: dict[str, list[tuple[float, int]]] = defaultdict(list)
    if today_path.is_dir():
        for hdir in today_path.iterdir():
            if not hdir.is_dir():
                continue
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
    newest_sizes, newest_ages, per_cam_newest = [], [], []
    c5 = c15 = c60 = 0
    for cname, items in cam_mp4.items():
        items.sort(key=lambda x: x[0], reverse=True)
        mtime, size = items[0]
        age = now_ts - mtime
        newest_sizes.append(size)
        newest_ages.append(age)
        per_cam_newest.append({"cam": cname, "newest_bytes": size, "age_s": round(age, 1)})
        if any(now_ts - m < 300 for m, _ in items):
            c5 += 1
        if any(now_ts - m < 900 for m, _ in items):
            c15 += 1
        if any(now_ts - m < 3600 for m, _ in items):
            c60 += 1

    report["write_rate"] = {
        "hour_size_mb": round(size2 / (1024**2), 1),
        "growth_20s_bytes": growth,
        "gb_h_est": round(gb_h_est, 3),
        "today_total_gb": round(today_total / (1024**3), 2),
        "gb_h_today_avg": round((today_total / (1024**3)) / hours_elapsed, 3),
        "cams_with_mp4_today": len(cam_mp4),
        "cams_mp4_last_5m": c5,
        "cams_mp4_last_15m": c15,
        "cams_mp4_last_60m": c60,
        "newest_seg_bytes_p50": percentile(newest_sizes, 50),
        "newest_seg_bytes_p90": percentile(newest_sizes, 90),
        "newest_seg_age_s_p50": percentile(newest_ages, 50),
        "newest_seg_age_s_p90": percentile(newest_ages, 90),
        "newest_seg_bytes_mean": round(statistics.mean(newest_sizes), 1) if newest_sizes else None,
    }

    # reachability EVERY unique IP
    unique_ips = sorted({ip for r in cam_rows for ip in r["field_ips"]})
    probes = {}
    print(f"Probing {len(unique_ips)} unique field IPs:554 ...", flush=True)
    for i, ip in enumerate(unique_ips):
        probes[ip] = tcp_probe(ip, 554, 1.5)
        if (i + 1) % 25 == 0:
            print(f"  probed {i+1}/{len(unique_ips)}", flush=True)

    ip_classes = Counter(v["class"] for v in probes.values())
    cam_reach = []
    reach_classes = Counter()
    for r in cam_rows:
        if not r["enabled"]:
            continue
        ips = r["field_ips"]
        if not ips:
            cls = "NO_IP"
        else:
            results = [probes[ip] for ip in ips if ip in probes]
            classes = [x["class"] for x in results]
            if "REACHABLE" in classes:
                cls = "REACHABLE"
            elif "NO_ROUTE" in classes:
                cls = "NO_ROUTE"
            elif "TIMEOUT" in classes:
                cls = "TIMEOUT"
            elif "REFUSED" in classes:
                cls = "REFUSED"
            else:
                cls = classes[0] if classes else "ERROR"
        reach_classes[cls] += 1
        cam_reach.append({"cam": r["name"], "class": cls, "ips": ips, "record_channels": r["record_channels"]})

    enabled_n = sum(1 for r in cam_rows if r["enabled"])
    report["reachability"] = {
        "unique_field_ips": len(unique_ips),
        "ip_by_class": dict(ip_classes),
        "enabled_cams": enabled_n,
        "cam_by_class": dict(reach_classes),
        "cam_by_class_pct": {k: round(100.0 * v / enabled_n, 1) for k, v in reach_classes.items()},
    }

    newest_by = {x["cam"]: x for x in per_cam_newest}
    thin_bytes = 1_500_000  # substream segments often ~0.5-2MB; peers main often 5-20MB
    # For substream recording, use lower threshold AND age
    A = reach_classes.get("NO_ROUTE", 0) + reach_classes.get("TIMEOUT", 0) + reach_classes.get("REFUSED", 0) + reach_classes.get("ERROR", 0) + reach_classes.get("NO_IP", 0)
    B_thin = 0
    B_noseg = 0
    C_ok = 0
    for cr in cam_reach:
        if cr["class"] != "REACHABLE":
            continue
        ns = newest_by.get(cr["cam"])
        if not ns:
            B_noseg += 1
            cr["seg"] = "NO_SEG"
            continue
        # thin if very small OR stale >5min
        if ns["newest_bytes"] < thin_bytes or ns["age_s"] > 300:
            B_thin += 1
            cr["seg"] = "THIN_OR_STALE"
            cr["newest_bytes"] = ns["newest_bytes"]
            cr["age_s"] = ns["age_s"]
        else:
            C_ok += 1
            cr["seg"] = "OKISH"
            cr["newest_bytes"] = ns["newest_bytes"]
            cr["age_s"] = ns["age_s"]

    report["classification_abc"] = {
        "A_unreachable": A,
        "A_pct": round(100.0 * A / enabled_n, 1),
        "B_reachable_thin_stale_or_noseg": B_thin + B_noseg,
        "B_pct": round(100.0 * (B_thin + B_noseg) / enabled_n, 1),
        "B_detail": {"thin_or_stale": B_thin, "no_seg": B_noseg},
        "C_reachable_okish_seg": C_ok,
        "C_ok_pct": round(100.0 * C_ok / enabled_n, 1),
        "C_config_notes": {
            "stub_inputs": stub_count,
            "detect_64x64_residual": detect_64,
            "record_on_ch102_sub": record_on_ch102,
            "record_on_ch101_main": record_on_ch101,
        },
        "thin_threshold_bytes": thin_bytes,
    }

    # stratified samples
    def pmi(n: str) -> int:
        m = re.search(r"_(\d{3})_", n)
        return int(m.group(1)) if m else 0

    reachable = sorted([c for c in cam_reach if c["class"] == "REACHABLE"], key=lambda x: pmi(x["cam"]))
    unreachable = [c for c in cam_reach if c["class"] != "REACHABLE"]
    samples = []
    if reachable:
        n = min(12, len(reachable))
        step = max(len(reachable) // n, 1)
        for i in range(0, len(reachable), step):
            samples.append(reachable[i])
            if len(samples) >= n:
                break

    report["ffprobe_candidates"] = samples
    report["unreachable_class_breakdown"] = dict(Counter(c["class"] for c in unreachable))

    (OUT_DIR / "cameras.json").write_text(json.dumps(cam_rows, indent=2))
    (OUT_DIR / "cam_reach.json").write_text(json.dumps(cam_reach, indent=2))
    (OUT_DIR / "probes_by_ip.json").write_text(json.dumps(probes, indent=2))
    (OUT_DIR / "newest_segments.json").write_text(json.dumps(per_cam_newest, indent=2))
    (OUT_DIR / "report.json").write_text(json.dumps(report, indent=2))
    summary = json.dumps(
        {
            "ts": TS,
            "docker": report["docker"],
            "knobs": report["config_knobs"],
            "inventory": report["inventory"],
            "write_rate": report["write_rate"],
            "reachability": report["reachability"],
            "ABC": report["classification_abc"],
            "ffprobe_n": len(samples),
        },
        indent=2,
    )
    (OUT_DIR / "SUMMARY.txt").write_text(summary + "\n")
    print(summary)


if __name__ == "__main__":
    main()
