#!/usr/bin/env python3
"""Post-restart checks on Soft Soft .195. Read-only."""
import os
import subprocess
import time

def sh(cmd):
    return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.STDOUT)

print("NOW", sh("date -u +%Y-%m-%dT%H:%M:%SZ").strip())
print("---CONTAINER---")
print(sh(
    "docker inspect securevu --format "
    "'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} "
    "started={{.State.StartedAt}} restarts={{.RestartCount}} oom={{.State.OOMKilled}} "
    "image={{.Config.Image}} id={{.Image}}'"
).strip())

def hour_stats(hp):
    cams = 0
    total = 0
    over1 = 0
    over3 = 0
    sizes = []
    if not os.path.isdir(hp):
        print(f"MISSING {hp}")
        return
    for name in os.listdir(hp):
        p = os.path.join(hp, name)
        if not os.path.isdir(p):
            continue
        sz = 0
        for root, dirs, files in os.walk(p):
            for fn in files:
                fp = os.path.join(root, fn)
                try:
                    sz += os.path.getsize(fp)
                except OSError:
                    pass
        cams += 1
        total += sz
        if sz >= 1 * 1024 * 1024:
            over1 += 1
        if sz >= 3 * 1024 * 1024:
            over3 += 1
        sizes.append((sz, name))
    sizes.sort(reverse=True)
    print(
        f"{hp} cams={cams} total_bytes={total} total_mb={total/1024/1024:.1f} "
        f"over_1mb={over1} over_3mb={over3}"
    )
    print("top5", [(n, round(s / 1024 / 1024, 2)) for s, n in sizes[:5]])

print("---HOUR---")
hour_stats("/securevu/recordings/2026-10-02/06")
hour_stats("/securevu/recordings/2026-10-02/05")

print("---STUB PROCS---")
try:
    out = sh("ps -ef | grep sv_nvr_detect_stub.mp4 | grep -v grep || true")
except subprocess.CalledProcessError as e:
    out = e.output
lines = [ln for ln in out.splitlines() if ln.strip()]
print("stub_proc_count", len(lines))
for ln in lines[:8]:
    # trim long cmd
    print(ln[:240])

print("---WATCHDOG SAMPLE 180s---")
log = "/dev/shm/logs/securevu/current"
needle = "No new valid recording"
t0 = time.time()
# count new lines by snapshot delta if file is a ring; also tail -F
proc = subprocess.Popen(
    ["timeout", "180", "tail", "-n", "0", "-F", log],
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL,
    text=True,
)
count = 0
other = 0
assert proc.stdout is not None
for line in proc.stdout:
    if needle in line:
        count += 1
    else:
        other += 1
proc.wait()
elapsed = time.time() - t0
per10 = (count / elapsed) * 600 if elapsed else 0
print(f"watchdog_matches={count} other_lines={other} elapsed_s={elapsed:.1f} per_10min={per10:.1f}")
print("NOW", sh("date -u +%Y-%m-%dT%H:%M:%SZ").strip())
