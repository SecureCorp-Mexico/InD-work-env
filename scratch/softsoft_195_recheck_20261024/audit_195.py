#!/usr/bin/env python3
"""Soft Soft .195 live recheck — inventory, write rate, reachability, roles.
Run inside CT102 (85PMI) as root. Outputs JSON + text summary under /tmp/ss195_* .
"""
from __future__ import annotations

import json
import os
import re
import socket
import statistics
import subprocess
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import yaml

OUT_DIR = Path("/tmp/ss195_recheck")
OUT_DIR.mkdir(parents=True, exist_ok=True)
CFG = Path("/opt/stacks/securevu/config/config.yaml")
REC_CANDIDATES = [
    Path("/securevu/recordings"),
    Path("/media/securevu/recordings"),
]
NOW = datetime.now(timezone.utc)
TS = NOW.strftime("%Y-%m-%dT%H:%M:%SZ")


def sh(cmd: str, timeout: int = 60) -> tuple[int, str, str]:
    p = subprocess.run(
        ["bash", "-lc", cmd],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return p.returncode, p.stdout, p.stderr


def find_rec() -> Path:
    for p in REC_CANDIDATES:
        if p.is_dir():
            return p
    raise SystemExit("recordings dir not found")


def parse_field_ip(url: str) -> str | None:
    if not url or not isinstance(url, str):
        return None
    # ffmpeg:rtsp://... or rtsp://...
    m = re.search(r"rtsp://([^/\s]+)", url)
    if not m:
        m = re.search(r"://([^/\s:@]+@)?([^/\s:]+)", url)
        if not m:
            return None
        host = m.group(2) if m.lastindex and m.lastindex >= 2 else m.group(1)
    else:
        hostpart = m.group(1)
        # user:pass@host:port
        if "@" in hostpart:
            hostpart = hostpart.split("@", 1)[1]
        host = hostpart.split(":")[0]
    if not host or host.startswith("127.") or host in ("localhost",):
        return None
    if re.match(r"^\d+\.\d+\.\d+\.\d+$", host):
        return host
    return host


def is_stub(url: str) -> bool:
    if not url:
        return False
    u = url.lower()
    return "stub" in u or "sv_nvr_detect_stub" in u or u.endswith(".mp4") and "file" in u


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
        return {"class": "ERROR", "ms": ms, "err": str(e)[:120]}


def percentile(sorted_vals: list[float], p: float) -> float | None:
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return float(sorted_vals[0])
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    if f == c:
        return float(sorted_vals[f])
    return float(sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f))


def main() -> None:
    report: dict = {"ts": TS, "host": "172.20.0.195", "hostname": socket.gethostname()}

    # --- docker / health ---
    rc, out, _ = sh("docker inspect securevu --format '{{.State.Health.Status}}|{{.State.StartedAt}}|{{.State.Status}}' 2>/dev/null || echo none")
    report["docker"] = out.strip()

    # --- config inventory ---
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
        "record.retain.days": (record_g.get("retain") or {}).get("days"),
        "detect.enabled": detect_g.get("enabled"),
        "detect.width": detect_g.get("width"),
        "detect.height": detect_g.get("height"),
        "detect.fps": detect_g.get("fps"),
        "ffmpeg.hwaccel_args": ffmpeg_g.get("hwaccel_args"),
        "ffmpeg.input_args": ffmpeg_g.get("input_args"),
        "ffmpeg.output_args": ffmpeg_g.get("output_args"),
        "cameras_total": len(cameras),
        "go2rtc_streams": len(go2),
    }

    cam_rows = []
    stub_count = 0
    detect_64 = 0
    role_issues = []
    disabled = 0
    record_off = 0
    detect_on = 0

    for name, cam in sorted(cameras.items()):
        if not isinstance(cam, dict):
            continue
        enabled = cam.get("enabled", True) is not False
        if not enabled:
            disabled += 1
        rec = cam.get("record") or {}
        det = cam.get("detect") or {}
        ffmpeg = cam.get("ffmpeg") or {}
        inputs = ffmpeg.get("inputs") or []
        roles_flat = []
        urls = []
        for inp in inputs:
            if not isinstance(inp, dict):
                continue
            roles = inp.get("roles") or []
            roles_flat.extend(roles)
            path = inp.get("path") or ""
            urls.append(path)
            if is_stub(path):
                stub_count += 1
        # resolve go2rtc refs
        g2_urls = []
        for u in urls:
            if u.startswith("rtsp://127.0.0.1") or u.startswith("rtsp://localhost"):
                # extract stream name
                m = re.search(r"/([A-Za-z0-9_\-]+)$", u.rstrip("/"))
                stream = m.group(1) if m else None
                if stream and stream in go2:
                    raw = go2[stream]
                    if isinstance(raw, list):
                        g2_urls.extend([x for x in raw if isinstance(x, str)])
                    elif isinstance(raw, str):
                        g2_urls.append(raw)
            elif u:
                g2_urls.append(u)

        field_ips = []
        for u in g2_urls:
            ip = parse_field_ip(u)
            if ip:
                field_ips.append(ip)
            if is_stub(u):
                stub_count += 1

        dw = det.get("width", detect_g.get("width"))
        dh = det.get("height", detect_g.get("height"))
        if dw == 64 and dh == 64:
            detect_64 += 1

        if det.get("enabled") is True:
            detect_on += 1
        if rec.get("enabled") is False:
            record_off += 1

        has_record = "record" in roles_flat
        has_detect = "detect" in roles_flat
        # peer-shape: record+detect on same live path preferred
        if enabled and (not has_record or not urls):
            role_issues.append({"cam": name, "issue": "no_record_role_or_input", "roles": roles_flat})

        cam_rows.append(
            {
                "name": name,
                "enabled": enabled,
                "roles": sorted(set(roles_flat)),
                "input_paths": urls,
                "go2rtc_urls": g2_urls[:3],
                "field_ips": sorted(set(field_ips)),
                "detect_wh": [dw, dh],
                "detect_enabled": det.get("enabled", detect_g.get("enabled")),
                "record_enabled": rec.get("enabled", record_g.get("enabled")),
            }
        )

    report["inventory"] = {
        "cameras": len(cam_rows),
        "disabled": disabled,
        "record_explicit_false": record_off,
        "detect_enabled_cams": detect_on,
        "stub_inputs": stub_count,
        "detect_64x64": detect_64,
        "role_issues": len(role_issues),
        "role_issue_samples": role_issues[:20],
    }

    # go2rtc stream names vs cameras
    cam_names = {r["name"] for r in cam_rows}
    g2_names = set(go2.keys())
    report["inventory"]["go2rtc_only"] = sorted(g2_names - cam_names)[:30]
    report["inventory"]["cam_only_no_go2rtc"] = sorted(cam_names - g2_names)[:30]
    report["inventory"]["go2rtc_count"] = len(g2_names)

    # --- write rate / segments ---
    rec = find_rec()
    today = NOW.strftime("%Y-%m-%d")
    hh = NOW.strftime("%H")
    hour_dir = rec / today / hh
    prev_h = (NOW.replace(minute=0, second=0, microsecond=0).timestamp() - 3600)
    prev_dt = datetime.fromtimestamp(prev_h, tz=timezone.utc)
    prev_dir = rec / prev_dt.strftime("%Y-%m-%d") / prev_dt.strftime("%H")

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

    # growth sample ~25s
    size1 = dir_size(hour_dir)
    time.sleep(25)
    size2 = dir_size(hour_dir)
    growth = size2 - size1
    gb_h_est = (growth / 25.0) * 3600 / (1024**3) if growth >= 0 else None

    today_total = 0
    today_path = rec / today
    if today_path.is_dir():
        for hdir in today_path.iterdir():
            if hdir.is_dir():
                today_total += dir_size(hdir)
    hours_elapsed = max(int(hh) + NOW.minute / 60.0, 0.1)
    gb_h_today = (today_total / (1024**3)) / hours_elapsed

    # per-camera newest segment
    newest_sizes = []
    newest_ages = []
    cams_with_mp4_5 = 0
    cams_with_mp4_15 = 0
    cams_with_mp4_60 = 0
    cams_with_any_today = 0
    per_cam_newest = []

    # scan today's hour dirs for each cam
    cam_mp4: dict[str, list[tuple[float, int]]] = defaultdict(list)
    if today_path.is_dir():
        for hdir in today_path.iterdir():
            if not hdir.is_dir():
                continue
            for camdir in hdir.iterdir():
                if not camdir.is_dir():
                    continue
                cname = camdir.name
                for mp4 in camdir.glob("*.mp4"):
                    try:
                        st = mp4.stat()
                    except OSError:
                        continue
                    cam_mp4[cname].append((st.st_mtime, st.st_size))

    now_ts = time.time()
    for cname, items in cam_mp4.items():
        cams_with_any_today += 1
        items.sort(key=lambda x: x[0], reverse=True)
        mtime, size = items[0]
        age = now_ts - mtime
        newest_sizes.append(size)
        newest_ages.append(age)
        per_cam_newest.append({"cam": cname, "newest_bytes": size, "age_s": round(age, 1)})
        # any mp4 in windows
        if any(now_ts - m < 300 for m, _ in items):
            cams_with_mp4_5 += 1
        if any(now_ts - m < 900 for m, _ in items):
            cams_with_mp4_15 += 1
        if any(now_ts - m < 3600 for m, _ in items):
            cams_with_mp4_60 += 1

    newest_sizes_s = sorted(newest_sizes)
    newest_ages_s = sorted(newest_ages)
    report["write_rate"] = {
        "rec_path": str(rec),
        "hour_dir": str(hour_dir),
        "hour_size_bytes": size2,
        "hour_size_mb": round(size2 / (1024**2), 1),
        "growth_25s_bytes": growth,
        "gb_h_est_from_growth": round(gb_h_est, 3) if gb_h_est is not None else None,
        "today_total_bytes": today_total,
        "today_total_gb": round(today_total / (1024**3), 2),
        "gb_h_today_avg": round(gb_h_today, 3),
        "prev_hour_size_mb": round(dir_size(prev_dir) / (1024**2), 1),
        "cams_with_mp4_today": cams_with_any_today,
        "cams_mp4_last_5m": cams_with_mp4_5,
        "cams_mp4_last_15m": cams_with_mp4_15,
        "cams_mp4_last_60m": cams_with_mp4_60,
        "newest_segment_bytes_p50": percentile(newest_sizes_s, 50),
        "newest_segment_bytes_p90": percentile(newest_sizes_s, 90),
        "newest_segment_age_s_p50": percentile(newest_ages_s, 50),
        "newest_segment_age_s_p90": percentile(newest_ages_s, 90),
        "newest_segment_bytes_mean": round(statistics.mean(newest_sizes), 1) if newest_sizes else None,
    }

    # --- reachability for EVERY unique field IP + per-cam ---
    # Prefer primary record stream IP (first field ip)
    probes = {}
    unique_ips = sorted({ip for r in cam_rows for ip in r["field_ips"] if ip.startswith("172.")})
    report["reachability_meta"] = {"unique_field_ips": len(unique_ips), "probe_timeout_s": 1.5}

    for ip in unique_ips:
        probes[ip] = tcp_probe(ip, 554, 1.5)

    class_counts = Counter(v["class"] for v in probes.values())
    # per-camera classification (enabled cams)
    cam_reach = []
    reach_classes = Counter()
    for r in cam_rows:
        if not r["enabled"]:
            continue
        ips = r["field_ips"]
        if not ips:
            cls = "NO_IP"
            reach_classes[cls] += 1
            cam_reach.append({"cam": r["name"], "class": cls, "ips": []})
            continue
        # worst / best?
        results = [probes.get(ip, {"class": "ERROR"}) for ip in ips]
        # if ANY ip REACHABLE → reachable (main or sub)
        if any(x["class"] == "REACHABLE" for x in results):
            cls = "REACHABLE"
        else:
            # prefer NO_ROUTE over TIMEOUT over other
            classes = [x["class"] for x in results]
            if "NO_ROUTE" in classes:
                cls = "NO_ROUTE"
            elif "TIMEOUT" in classes:
                cls = "TIMEOUT"
            elif "REFUSED" in classes:
                cls = "REFUSED"
            else:
                cls = classes[0] if classes else "ERROR"
        reach_classes[cls] += 1
        cam_reach.append(
            {
                "cam": r["name"],
                "class": cls,
                "ips": ips,
                "detail": {ip: probes.get(ip) for ip in ips},
            }
        )

    enabled_n = sum(1 for r in cam_rows if r["enabled"])
    report["reachability"] = {
        "enabled_cams": enabled_n,
        "by_class": dict(reach_classes),
        "by_class_pct": {k: round(100.0 * v / enabled_n, 1) for k, v in reach_classes.items()} if enabled_n else {},
        "unique_ip_by_class": dict(class_counts),
    }

    # join with segment thinness for reachable cams
    newest_by_cam = {x["cam"]: x for x in per_cam_newest}
    thin_threshold = 2_000_000  # 2MB newest segment = thin for ~10s record chunks; peers often 5-20MB+
    # Also use age: if newest > 5 min old while reachable → thin/broken stream
    reachable_thin = 0
    reachable_ok = 0
    reachable_no_seg = 0
    unreachable = reach_classes.get("NO_ROUTE", 0) + reach_classes.get("TIMEOUT", 0) + reach_classes.get("REFUSED", 0) + reach_classes.get("ERROR", 0) + reach_classes.get("NO_IP", 0)
    for cr in cam_reach:
        if cr["class"] != "REACHABLE":
            continue
        ns = newest_by_cam.get(cr["cam"])
        if not ns:
            reachable_no_seg += 1
            cr["seg"] = "NO_SEG_TODAY"
            continue
        if ns["newest_bytes"] < thin_threshold or ns["age_s"] > 300:
            reachable_thin += 1
            cr["seg"] = "THIN_OR_STALE"
            cr["newest_bytes"] = ns["newest_bytes"]
            cr["age_s"] = ns["age_s"]
        else:
            reachable_ok += 1
            cr["seg"] = "OKISH"
            cr["newest_bytes"] = ns["newest_bytes"]
            cr["age_s"] = ns["age_s"]

    report["classification_abc"] = {
        "A_unreachable": unreachable,
        "A_pct": round(100.0 * unreachable / enabled_n, 1) if enabled_n else 0,
        "B_reachable_thin_or_stale": reachable_thin + reachable_no_seg,
        "B_pct": round(100.0 * (reachable_thin + reachable_no_seg) / enabled_n, 1) if enabled_n else 0,
        "B_detail": {"thin_or_stale": reachable_thin, "no_seg_today": reachable_no_seg},
        "C_reachable_okish_segments": reachable_ok,
        "C_ok_pct": round(100.0 * reachable_ok / enabled_n, 1) if enabled_n else 0,
        "C_config": {
            "stub_inputs": stub_count,
            "detect_64x64": detect_64,
            "role_issues": len(role_issues),
            "note": "detect dims residual if 64x64; stubs if >0; role_issues if record missing",
        },
        "thin_threshold_bytes": thin_threshold,
    }

    # samples for later ffprobe
    reachable_cams = [cr for cr in cam_reach if cr["class"] == "REACHABLE"]
    unreachable_cams = [cr for cr in cam_reach if cr["class"] != "REACHABLE"]
    # stratify by PMI number if present in name
    def pmi_num(name: str) -> int:
        m = re.search(r"_(\d{3})_", name) or re.search(r"(\d{3})", name)
        return int(m.group(1)) if m else 0

    reachable_cams.sort(key=lambda x: pmi_num(x["cam"]))
    # pick ~12 stratified
    sample_n = min(12, len(reachable_cams))
    samples = []
    if sample_n:
        step = max(len(reachable_cams) // sample_n, 1)
        for i in range(0, len(reachable_cams), step):
            samples.append(reachable_cams[i])
            if len(samples) >= sample_n:
                break

    report["ffprobe_candidates"] = samples
    report["unreachable_samples"] = unreachable_cams[:25]

    # dump heavy lists
    (OUT_DIR / "cameras.json").write_text(json.dumps(cam_rows, indent=2))
    (OUT_DIR / "cam_reach.json").write_text(json.dumps(cam_reach, indent=2))
    (OUT_DIR / "probes_by_ip.json").write_text(json.dumps(probes, indent=2))
    (OUT_DIR / "newest_segments.json").write_text(json.dumps(per_cam_newest, indent=2))
    (OUT_DIR / "report.json").write_text(json.dumps(report, indent=2))

    # text summary
    lines = [
        f"=== Soft Soft .195 recheck {TS} ===",
        f"docker={report['docker']}",
        f"knobs={json.dumps(report['config_knobs'])}",
        f"inventory={json.dumps(report['inventory'])}",
        f"write_rate={json.dumps(report['write_rate'])}",
        f"reachability={json.dumps(report['reachability'])}",
        f"ABC={json.dumps(report['classification_abc'])}",
        f"ffprobe_candidates={len(samples)} unreachable_samples={len(report['unreachable_samples'])}",
    ]
    summary = "\n".join(lines) + "\n"
    (OUT_DIR / "SUMMARY.txt").write_text(summary)
    print(summary)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FATAL: {e}", file=sys.stderr)
        raise
