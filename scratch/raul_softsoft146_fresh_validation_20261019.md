# Fresh validation — Raúl Soft Soft 32+5 continuous/storage — 2026-10-19 ~20:30Z

**Verdict: PARTIALLY VALID**

One-liner: His “not continuous / what do we need for continuous?” complaint is a **UI/Review interpretation** issue — **recording is continuous on disk right now**; storage-full / recording-stopped is **false**.

## 1) Email + screenshot

| Item | Result |
|------|--------|
| Message | Raúl `rojeda@securewitness.com` **2026-10-19 18:36:27Z** — Re: SecureView+ / Descarga de videos |
| Text | “mira ahora mismo revisando uno de los 32+ 5 nuevamente **no refiere al tema del almacenamiento**” + “**ahi que se necesita pra que sea continua la grabacion?**” |
| Inline | `cid:0cf0393a-9b4e-4284-b863-1561963183ef` PNG **~484 KB** (Graph attachment id `…845e0w==`, size 483726) |
| Download | **FAILED again** — Email MCP `download_attachment` → `PROVIDER_UNAVAILABLE` / MSAL `network_error`. Outlook `get_mail_message` lists 4 inline PNGs (thread history + this one) but returns **no bytes**. |
| Pixels | **Not readable this run.** Inferred from text + live API: Soft Soft History/Review (not Storage), asking why timeline isn’t “continua”. |

Earlier mail 16:34Z was storage/restart-SV; **18:36Z explicitly pivots off storage**.

## 2) Live Soft Soft `.146` / CT105 / 37PMI (direct SSH `proxmox.pass`)

| Check | Fresh result (~20:20–20:30Z) |
|-------|------------------------------|
| Host | `mxmhvmsl00003` 172.20.0.146 |
| Disk `/securevu` | **81%** — 13T/16T, **3.1T free** (ZFS HDDStorage01/subvol-105-disk-0) |
| `record.enabled` / continuous | **True** / **`days: 12`** (motion 7); **227 cams, 0 record.enabled=false** |
| Hour dirs UTC today | 16 **57G**, 17 **61G**, 18 **56G**, 19 **59G**, 20 **29G** (growing) |
| Growth pulse | hour-20 **18.45→19.01G in 20s** (~100 GB/h instantaneous); **6793** mp4 mtime ≤5 min |
| Segment ages (sample) | 578/579/614 cams **0–26s** old; **222** cams with files in hour-20 |
| `No new valid recording segments` (2–4h) | **0** |
| Container | Started 18:11Z; health **flickers unhealthy↔healthy** — healthcheck **timeout 5s** under load, **not** write-stop |
| API stats | **222/227** `camera_fps>0`, ver `0.18.0-6fac0cd` |
| Oct 18 folder | **MISSING** (gap day — separate from “is continuous now”) |

## 3) Soft Soft Review/History API vs disk (PMI cam `i150200700_578_2_10_bullet`)

| Source | Finding |
|--------|---------|
| Disk | h18 **337 segs / 57 min**, h19 **338 / 60**, h20 **~129+ / in progress** |
| `GET /api/{cam}/recordings/summary` | Today h16–19 **duration 3330–3600s**, h20 **~1520–1570s**; **`objects:0` `events:0`** every hour; high **motion** counts |
| `GET /api/review?cameras=…` | **`[]` empty** |
| Meaning | Timeline **has continuous duration** but Review **severity colors stay empty** (detect off / no review items) → UI can look “not continuous green” while files exist |

## 4) Map CT103 Grabaciones

| Item | Result |
|------|--------|
| Host | CT103 `mxmhappl00004` @ **172.20.0.9** (node b); stamp **v115-ptz-onvif-direct-fallback-20261019** |
| Cam wiring | `i150200700_578_2_10_bullet` present in `/data/cameras.geojson` → Soft Soft `.146` |
| Map `/api/recording/camera` | Needs user session (401 unauthenticated) |
| Soft Soft summary via Map’s `SV_API` | Same continuous durations; Map 24h-style ratio on sampled hours **~0.89 → lima (≥80%)**, today complete hours **93–100%** |
| Conclusion | If he were on Map «Grabación · 24 h», bar would look **mostly continuous/green-lima**, not empty. His wording + “qué se necesita para continua” fits Soft Soft **Review/History** better than Map Grabaciones. |

## Reconcile

| Claim | Valid? |
|-------|--------|
| Disk full / storage stop | **NO** (3.1T free) |
| Continuous recording stopped / needs restart now | **NO** (writing hard; 0 segment-stop lines) |
| `record.continuous` not configured | **NO** (days:12, enabled) |
| UI does not look “continua” | **YES plausible** — Review colors ≠ continuous green; objects/events=0; review [] |
| `.146` API overloaded / unhealthy | **YES real** — login/summary 40–90s; healthcheck timeouts (still writing) |
| Oct 18 gap | **YES** (folder missing) — not “right now” |

## Actions taken

- Diagnose only — **no Soft Soft restart**, **no email sent**.
EOF
