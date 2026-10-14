#!/usr/bin/env python3
"""Remove detect-role sv_nvr_detect_stub inputs from SecureVu config. Host-side."""
import os
import sys

import yaml

cfg_path = "/opt/stacks/securevu/config/config.yaml"
bak = "/opt/stacks/securevu/config/config.yaml.bak-strip-stub-20261002T0604Z"

with open(cfg_path, "rb") as f:
    raw = f.read()
with open(bak, "rb") as f:
    bakb = f.read()
if raw != bakb:
    sys.exit("ABORT: live file differs from bak")

block = (
    "        - path: /config/sv_nvr_detect_stub.mp4\n"
    "          input_args:\n"
    "            - -re\n"
    "            - -stream_loop\n"
    "            - '-1'\n"
    "          roles:\n"
    "            - detect\n"
).encode()

n = raw.count(block)
print("exact_block_count", n)
if n != 171:
    sys.exit(f"ABORT: expected 171 exact blocks, got {n}")

go2 = b"ffmpeg:/config/sv_nvr_detect_stub.mp4"
print("go2rtc_stub_refs_before", raw.count(go2))
new = raw.replace(block, b"")
if new.count(block) != 0:
    sys.exit("ABORT: blocks remain")

text = new.decode()
if "path: /config/sv_nvr_detect_stub.mp4" in text:
    sys.exit("ABORT: camera path key remains")

cfg = yaml.safe_load(text)
cams = cfg["cameras"]
if len(cams) != 171:
    sys.exit(f"ABORT: cam count {len(cams)}")
if cfg["detect"]["enabled"] is not False:
    sys.exit("ABORT: global detect.enabled")
hw = cfg["ffmpeg"].get("hwaccel_args")
if hw not in ([], None):
    sys.exit(f"ABORT: global hwaccel {hw!r}")
if cfg["record"]["continuous"]["days"] != 30:
    sys.exit("ABORT: days")

bad = []
empty_left = 0
for name, cam in cams.items():
    if cam.get("detect", {}).get("enabled") is not False:
        bad.append(("detect", name))
    ff = cam.get("ffmpeg") or {}
    if (ff.get("hwaccel_args") or []) != []:
        bad.append(("hw", name))
    inputs = ff.get("inputs") or []
    rec = 0
    for item in inputs:
        path = str(item.get("path", ""))
        roles = item.get("roles") or []
        if "sv_nvr_detect_stub" in path:
            bad.append(("stub", name, roles))
        if "record" in roles:
            rec += 1
            if not path.startswith("rtsp://127.0.0.1:8554/"):
                bad.append(("recpath", name, path))
        if roles == [] and "sv_nvr_detect_stub" not in path:
            empty_left += 1
    if rec != 1:
        bad.append(("reccount", name, rec))

if bad:
    print("ABORT bad", bad[:20], "count", len(bad))
    sys.exit(1)

streams = cfg.get("go2rtc", {}).get("streams", {})
print("go2rtc_has_stub_stream", "sv_nvr_detect_stub" in streams)
print("empty_role_inputs_left", empty_left)
print("new_bytes", len(new), "delta", len(raw) - len(new))

tmp = cfg_path + ".tmp-strip-stub"
with open(tmp, "wb") as f:
    f.write(new)
    f.flush()
    os.fsync(f.fileno())

with open(tmp) as f:
    cfg2 = yaml.safe_load(f)
assert len(cfg2["cameras"]) == 171
assert cfg2["record"]["continuous"]["days"] == 30
assert cfg2["detect"]["enabled"] is False

os.replace(tmp, cfg_path)

with open(cfg_path) as f:
    final_text = f.read()
    final = yaml.safe_load(final_text)

sample = final["cameras"]["i150200700_651_ptz"]["ffmpeg"]["inputs"]
print("SAMPLE_INPUTS")
for item in sample:
    print(" ", item.get("roles"), item.get("path"), item.get("input_args"))
print("OK cameras", len(final["cameras"]))
print("days", final["record"]["continuous"]["days"])
print("detect", final["detect"]["enabled"])
print("hw", final["ffmpeg"].get("hwaccel_args"))
print("stub_path_left", final_text.count("path: /config/sv_nvr_detect_stub.mp4"))
print("go2rtc_line_left", final_text.count("ffmpeg:/config/sv_nvr_detect_stub.mp4"))
