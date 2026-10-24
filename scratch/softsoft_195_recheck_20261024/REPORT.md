# Soft Soft .195 (85PMI) recheck — 2026-10-24 ~22:50–23:10Z

Live measurement. **Do not assume connectivity** — TCP:554 probed for every field IP.

| Host | Role | CT / node |
|------|------|-----------|
| **172.20.0.195** | 85PMI 651–735 | CT102 / node **a** `.2` |
| 172.20.0.144 | 21PMI (peer) | CT106 / node c |
| 172.20.0.146 | 37PMI (peer) | CT105 / node c |
| Map CT103 | MH map `:8972` | node b |

Image `.195`: `0.18.0-6fac0cd`, docker **healthy**, uptime ~2d (started 2026-10-22T19:06Z). **No Soft Soft restart** this pass.

---

## 1) Inventory (.195)

| Metric | Value |
|--------|-------|
| cameras in `config.yaml` | **171** (0 disabled) |
| go2rtc streams | **342** (`_1` + `_2` per cam) |
| stub inputs (`sv_nvr_detect_stub`) | **0** |
| roles | all cams: `detect`+`record` on `_1` restream; `_2` roles `[]` |
| record channel | **171/171 → Hikvision Channels/102 (sub)**; main 101 wired but unused for record |
| detect global | **enabled:false**, residual **64×64 @ fps 1** (170 cams inherit) |
| record.continuous.days | **30** |
| hwaccel | `[]` |

Peer shape: same restream+roles pattern; peers use detect **640×360@3** (not 64×64@1). Recording sub (102) is normal for this Hik lot — **not** a stub/role bug like Oct 2.

---

## 2) Write rate

| Metric | .195 | .144 peer | .146 peer |
|--------|------|-----------|-----------|
| GB/h today avg | **0.83** | **20.0** | 33.1 (hist.) |
| GB/h est (short growth) | **0.17** | **27.0** | 0 (stalled now) |
| hour folder MB | ~727 | ~20765 | — |
| cams mp4 last **5m** | **16** /168 today | **137** /138 | **0** /225 |
| newest seg bytes p50/p90 | 291K / 623K | 345K / 733K | 416K / 3.1M |
| newest seg age p50/p90 | **1373s / 2196s** | **23s / 28s** | ~8h (stalled) |

Segment **size** when written is similar to `.144` (substream). Difference is **freshness / continuity**, not codec stub.

Frigate stats `.195`: **168/171** `camera_fps>0`, p50 **1.0** fps (matches leftover `detect.fps:1`). Peer `.144`: p50 **3.0** fps. CT loadavg `.195` **~173**; `.144` **~25**.

Logs 2h: `Unable to keep up with recording segments` **700**; `Too many unprocessed…` **257**; `Ffmpeg process crashed` **1204**; `No new valid recording segments` **0**.

---

## 3) Reachability (EVERY cam, from CT102)

TCP connect to parsed field IP:**554**, timeout 1.5s. Password `@` in `P@55word` handled via `rsplit`.

| Class | Cams | % | Unique IPs |
|-------|------|---|------------|
| **REACHABLE** | **168** | **98.2%** | 167 |
| **TIMEOUT** | **3** | **1.8%** | 3 |
| NO_ROUTE / REFUSED / AUTH_FAIL | 0 | 0 | — |

TIMEOUT only: `172.19.7.147` (668_ptz), `172.19.11.163` (733_ptz), `172.19.11.164` (733_bullet). All `no_route` log spam (1659 lines/2h) is **retries on these 3 IPs** — zero overlap with the 167 REACHABLE set.

**Verdict A is tiny.** Prior “field mostly down” does **not** hold on this recheck.

---

## 4) Stream sample (REACHABLE)

ffprobe field RTSP (tcp) — 5 stratified cams, both channels:

| Cam | sub `_1` /102 | main `_2` /101 |
|-----|---------------|----------------|
| 651_bullet | 640×360 h264 OK | 1280×720 hevc OK |
| 670_bullet | 640×480 h264 OK | 2560×1440 hevc OK |
| 690_ptz | 704×480 h264 OK | 2560×1440 h264 OK |
| 710_bullet | 640×360 h264 OK | 1280×720 h264 OK |
| 725_bullet | 640×360 hevc OK | 2560×1440 hevc OK |

go2rtc API: **167/171** `_1` streams with consumers + `bytes_recv>0`. Local restream ffprobe also 640×360. **Streams are live**; disk continuous coverage is not.

---

## 5) Config knobs vs peer (~20+ GB/h)

| Knob | .195 | .144 (healthy) |
|------|------|----------------|
| continuous.days | 30 | 15 |
| detect enabled | false | false |
| detect w×h@fps | **64×64@1** | **640×360@3** |
| hwaccel | [] | [] |
| stubs | 0 | 0 |
| camera_fps p50 | **1.0** | **3.0** |
| loadavg | **~173** | **~25** |
| GB/h | **~0.8** | **~20–27** |

---

## 6) Map CT103 `:8972` (source=disk)

API: `http://{host}:8972/api/{cam}/recordings/summary?timezone=America/Mexico_City`  
Health OK. Ratios = `duration/3600` for last hours today:

| Stream | mean last-6h ratio |
|--------|-------------------|
| .195 651/654/670/690/710/730 | **~0.05–0.06** (50–400s/h) |
| .144 557_1_22_bullet | **~0.84–1.0** (≈3600s/h; current hour partial) |
| .146 579_2_24_bullet | **~0.97** through hour 08 — then **no further hours** (stall side-note) |

Thin Map bars on .195 = **real thin disk content**, not API/map failure.

---

## 7) ABC % breakdown + ranked root cause

| Bucket | % | Evidence |
|--------|---|----------|
| **A unreachable field** | **1.8%** (3/171) | TCP:554 TIMEOUT only those 3 IPs |
| **B reachable but thin/stale write** | **~98%** | 168 REACHABLE; only **16** cams mp4 in 5m; map ratios ~0.05; maintainer discard storm; age p50 ~23 min |
| **C config/role/stub** | residual | **0 stubs**, **0 role bugs**; **170/171** leftover detect **64×64@1** (detect off but still drives capture fps); record-on-102 matches Hik peer practice |

### What is NOT connectivity

- 98.2% field :554 REACHABLE from CT  
- Field main+sub ffprobe OK on sample  
- go2rtc receiving (167 consumers / bytes_recv)  
- Map `:8972` healthy; ratios prove thin **files**, not empty API

### Primary root cause (ranked)

1. **Record pipeline overload / segment discard** on .195 (load ~173, 700× “Unable to keep up…”, 257× unprocessed cache) → continuous duration ~5% of hour.  
2. **Leftover detect 64×64@1** (stub-era residual vs peer 640×360@3) → `camera_fps` p50=1 vs peer 3; align config in calm window.  
3. **Minor field**: 3 TIMEOUT cams (668/733).  
4. **Not**: mass unreachability, stubs, missing record roles, wrong HDD mount, Map `:8972` bug.

### Recommended fixes (report-first; **not applied**)

1. Calm-window: set `.195` `detect.width/height/fps` → **640/360/3** (match `.144`/`.146`); backup yaml; validate; restart SecureVu only in calm window.  
2. After restart: re-measure GB/h, mp4@5m, map ratios, loadavg.  
3. Field ops: only **172.19.7.147**, **172.19.11.163**, **172.19.11.164**.  
4. Side observation: **`.146` look stalled** after ~08:00 local today (disk summary stops; mp4 age ~8h) — separate from .195; do not restart unless confirmed dead / approved.

---

## Artifacts

- `audit_195b.py`, `peer_snapshot.py`, `ffprobe_sample.py`
- `ss195_report.json`, `ss195_SUMMARY.txt`, `ss195_bitrate.json`
- `map_ratios.txt`, `stats_bitrate2.txt`, `peer144_fps.txt`
