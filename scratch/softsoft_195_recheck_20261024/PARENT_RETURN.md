# Parent return — Soft Soft .195 recheck 2026-10-24

## Evidence table

| Item | .195 (85PMI) | Peer .144 |
|------|--------------|-----------|
| Cams | 171 | 141 |
| TCP:554 REACHABLE | **168 (98.2%)** | — |
| TCP:554 TIMEOUT | **3 (1.8%)** | — |
| GB/h today | **0.83** | **20.0** |
| mp4 last 5m | **16** | **137** |
| newest seg age p50 | **~23 min** | **~23 s** |
| camera_fps p50 | **1.0** | **3.0** |
| detect dims | **64×64@1** leftover | 640×360@3 |
| stubs / role bugs | **0 / 0** | 0 |
| Map :8972 last6h ratio | **~0.05** | **~1.0** |
| loadavg | **~173** | **~25** |

TIMEOUT only: `172.19.7.147`, `172.19.11.163`, `172.19.11.164`.

## % breakdown (ABC)

| Bucket | % | What |
|--------|---|------|
| **A unreachable** | **1.8%** | 3 cams TIMEOUT :554 |
| **B reachable thin/stale** | **~98%** | Live RTSP/go2rtc but sparse disk (maintainer discard; map ~0.05) |
| **C config residual** | dims only | leftover detect **64×64@1** (detect off); **not** stub/role Oct-2 class |

## What is NOT connectivity

- 98.2% field IPs answer TCP:554 from CT102  
- Field ffprobe main+sub OK (640×360 … 2560×1440) on stratified sample  
- go2rtc: 167/171 `_1` with consumers + bytes_recv  
- Map thin bars = real thin `duration` on disk via `:8972`, not API failure  

## Ranked root cause

1. Record pipeline overload / segment discard (load ~173; 700× keep-up warnings)  
2. Leftover detect **64×64@1** → capture fps~1 vs peer ~3  
3. Three dead field endpoints only  
4. **Not** mass field down / stubs / wrong mount  

## Actions taken

- **Report only** — no Soft Soft restart, no YAML edit  
- Memory bank appended; PMO 2853 queued (API key inactive)  
- Scratch: `scratch/softsoft_195_recheck_20261024/REPORT.md`  
- Git: `cursor/softsoft-195-recheck-7dea` @ `b01357b`

## Recommended next (calm window)

Align `.195` detect → 640×360@3 like peers, then restart SecureVu; re-measure GB/h + map ratios. Field ops only for the 3 TIMEOUT IPs. Side: `.146` may be stalled after ~08:00 local — separate check.
