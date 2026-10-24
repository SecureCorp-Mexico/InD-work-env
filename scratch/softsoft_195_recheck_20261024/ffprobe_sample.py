#!/usr/bin/env python3
"""ffprobe stratified sample of REACHABLE .195 cams + go2rtc API stats."""
from __future__ import annotations

import json
import re
import subprocess
import urllib.request
from pathlib import Path

REPORT = Path("/tmp/ss195_recheck/report.json")
CFG = Path("/opt/stacks/securevu/config/config.yaml")
OUT = Path("/tmp/ss195_recheck/ffprobe_sample.json")


def sh(cmd, timeout=25):
    p = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout, p.stderr


def parse_host(url: str):
    m = re.search(r"rtsp://(.+)", url or "", re.I)
    if not m:
        return None, None, None
    rest = m.group(1)
    authority, _, path = rest.partition("/")
    userpass = None
    if "@" in authority:
        userpass, authority = authority.rsplit("@", 1)
    host = authority.split(":")[0]
    port = authority.split(":")[1] if ":" in authority else "554"
    ch = None
    cm = re.search(r"Channels/(\d+)", "/" + path)
    if cm:
        ch = cm.group(1)
    return host, ch, f"rtsp://{userpass}@{host}:{port}/{path}" if userpass else f"rtsp://{host}:{port}/{path}"


def ffprobe_url(url: str, label: str) -> dict:
    # mask password in output
    safe = re.sub(r":([^:@/]+)@", ":***@", url)
    cmd = (
        f'timeout 12 ffprobe -v error -select_streams v:0 '
        f'-show_entries stream=codec_name,width,height,bit_rate,avg_frame_rate,r_frame_rate '
        f'-show_entries format=bit_rate,duration,size '
        f'-of json {json.dumps(url)}'
    )
    # try docker exec first
    rc, out, err = sh(
        f"docker exec securevu bash -lc {json.dumps(cmd)}",
        timeout=20,
    )
    if rc != 0 or not out.strip():
        # host ffprobe
        rc, out, err = sh(cmd, timeout=20)
    try:
        data = json.loads(out) if out.strip() else {}
    except json.JSONDecodeError:
        data = {}
    streams = data.get("streams") or [{}]
    fmt = data.get("format") or {}
    s0 = streams[0] if streams else {}
    return {
        "label": label,
        "url_safe": safe,
        "ok": bool(s0.get("width")),
        "codec": s0.get("codec_name"),
        "width": s0.get("width"),
        "height": s0.get("height"),
        "stream_bit_rate": s0.get("bit_rate"),
        "format_bit_rate": fmt.get("bit_rate"),
        "avg_frame_rate": s0.get("avg_frame_rate"),
        "err": (err or "")[:200] if not s0.get("width") else None,
        "rc": rc,
    }


def main():
    import yaml

    report = json.loads(REPORT.read_text())
    candidates = report.get("ffprobe_candidates") or []
    with CFG.open() as f:
        cfg = yaml.safe_load(f)
    go2 = (cfg.get("go2rtc") or {}).get("streams") or {}

    results = []
    for cr in candidates:
        cam = cr["cam"]
        # find record stream _1
        rec_sn = None
        cam_cfg = (cfg.get("cameras") or {}).get(cam) or {}
        for inp in (cam_cfg.get("ffmpeg") or {}).get("inputs") or []:
            if "record" in (inp.get("roles") or []):
                m = re.search(r"/([A-Za-z0-9_\-]+)$", inp.get("path") or "")
                rec_sn = m.group(1) if m else None
                break
        if not rec_sn:
            # guess
            rec_sn = cam + "_1"
        raw = go2.get(rec_sn)
        urls = raw if isinstance(raw, list) else [raw]
        field_url = None
        ch = None
        for u in urls:
            if isinstance(u, str) and "rtsp://" in u:
                host, ch, field_url = parse_host(u)
                break
        # probe via go2rtc restream (no auth needed locally) AND field if possible
        local = f"rtsp://127.0.0.1:8554/{rec_sn}"
        row = {"cam": cam, "reach": cr["class"], "record_stream": rec_sn, "channel": ch}
        row["go2rtc_local"] = ffprobe_url(local, "go2rtc_local")
        if field_url:
            row["field_direct"] = ffprobe_url(field_url, "field_direct")
        results.append(row)
        print(f"probed {cam} local_ok={row['go2rtc_local'].get('ok')} "
              f"{row['go2rtc_local'].get('width')}x{row['go2rtc_local'].get('height')} "
              f"br={row['go2rtc_local'].get('format_bit_rate')}", flush=True)

    # go2rtc API streams summary
    g2_api = {}
    try:
        with urllib.request.urlopen("http://127.0.0.1:1984/api/streams", timeout=10) as r:
            streams = json.loads(r.read().decode())
        # only _1 record-ish
        active = 0
        producers = 0
        bytes_recv_gt0 = 0
        sample = []
        for name, st in streams.items():
            if not name.endswith("_1"):
                continue
            producers += 1
            # go2rtc schema varies
            recv = 0
            if isinstance(st, dict):
                for p in st.get("producers") or []:
                    if isinstance(p, dict):
                        recv += int(p.get("bytes_recv") or p.get("recv") or 0)
                cons = st.get("consumers") or []
                if cons:
                    active += 1
            if recv > 0:
                bytes_recv_gt0 += 1
            if len(sample) < 8:
                sample.append({"name": name, "raw_keys": list(st.keys()) if isinstance(st, dict) else type(st).__name__, "recv": recv})
        g2_api = {
            "streams_total": len(streams),
            "streams_ending_1": producers,
            "with_consumers": active,
            "bytes_recv_gt0_approx": bytes_recv_gt0,
            "sample": sample,
        }
    except Exception as e:
        g2_api = {"error": str(e)}

    out = {"ffprobe": results, "go2rtc_api": g2_api}
    OUT.write_text(json.dumps(out, indent=2))
    print(json.dumps({"n": len(results), "go2rtc_api": g2_api}, indent=2))


if __name__ == "__main__":
    main()
