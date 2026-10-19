# PMI 579 bullet — Map Grabaciones bar empty — 2026-10-19

## Host / stream

| Item | Value |
|------|--------|
| Soft Soft | **172.20.0.146** (CT105 / 37PMI / “32+5”) on node c |
| Field IPs | `172.19.2.24`–`.27` (bullets); also `.22` PTZ / `.23` LPR |
| Map streams | `i150200700_579_2_24_bullet` … `_27_bullet` → `server: 172.20.0.146` |
| Record roles | `detect`+`record` on go2rtc `_1`; unused `_2` input |
| Global record | `enabled: true`, `continuous.days: 12`, motion 7 |
| Neighbor (bar OK once API works) | PMI **578** `_2_10_bullet` same Soft Soft |

## Root cause

**Not** missing config / not dead recording / not wrong Map rempoint.

1. **Disk continuous:** hour folders for all four 579 bullets writing (~65 segs/h, mtime ≤5 min). Last MX hours coverage **~0.65–0.97** — same shape as 578 neighbor.
2. **Soft Soft :8971 API wedged:** `GET /` = 200 (nginx static), but `POST /api/login` and internal `:5000` **timeout** (30–90s+). Main `python3 -u -m securevu` CPU-starved (~134%) / unhealthy; `securevu.recording_manager` + go2rtc + ffmpeg still write.
3. **Map Grabación bar** = `GET /api/recording/camera` → Soft Soft `recordings/summary`. Timeout → empty `buckets` + error → UI looks like “no bar”.

v116 (timeouts/retries/cache + export probe throttle) already on CT103 — **insufficient** while login never returns.

## Fix (no Soft Soft restart)

1. **Host sidecar** on `.146`: `sv-disk-summary.service` → `:8972`  
   - Code: `SecureVu-Map` `deploy/softsoft-disk-summary/`  
   - Builds Frigate-shaped summary from `/securevu/recordings` (UTC dirs → MX hours).  
   - **Does not** touch/restart `securevu` container.
2. **Map v117** `6c3148e` on `main`: prefer disk summary when `:8972` healthy; stale cache if both fail.  
   - Deployed CT103 via `./deploy-api-web.sh` — stamp `v117-disk-summary-fallback-20261019`.

## Retest (Map API container → `.146`)

| Stream | ms | source | withFootage/24 | last6 ratios |
|--------|-----|--------|----------------|--------------|
| `…579_2_24_bullet` | ~1s | **disk** | 8 | ~0.67–0.97 |
| `…579_2_25_bullet` | 747 | **disk** | 8 | 0.65–0.96 |
| `…578_2_10_bullet` | 359 | **disk** | 8 | 0.91–0.97 |

Coverage ~0.25 over 24h = **real gap hours** (incl. missing Oct 18 / retention), not empty bar. Recent hours paint **lima/green**.

## Not done / follow-ups

- Soft Soft `.146` :8971 still wedged — schedule calm-window restart later (recording not dead).
- Optional: install `sv-disk-summary` on `.144` / `.195` / `.201` the same way.
- PMO API key was inactive earlier — queue if needed.
