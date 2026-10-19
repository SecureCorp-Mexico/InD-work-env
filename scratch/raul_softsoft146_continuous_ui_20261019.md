# Raúl Soft Soft 32+5 continuous UI — 2026-10-19 ~19:00 UTC

**Email:** Raúl `rojeda@securewitness.com` 2026-10-19 **18:36:27Z**  
**Subject:** Re: SecureView+ / Descarga de videos  
**conversationId:** `AAQkADJmNWFkYjRmLTA4ZDQtNGExMy05MzczLWYyZDZmY2Q1MDQzZgAQAMbAHx8qi3ZIqTk7-r_-En8=`  
**messageId:** `…BQAHINnHEwAAAA==`  
**Text:** “mira ahora mismo revisando uno de los 32+ 5 nuevamente no refiere al tema del almacenamiento” + inline PNG + “ahi que se necesita pra que sea continua la grabacion?”

## Screenshot diagnosis (Email MCP download failed; inferred + live)

- Inline PNG `cid:0cf0393a-9b4e-4284-b863-1561963183ef` (~484 KB) — Email `download_attachment` → `PROVIDER_UNAVAILABLE` (MSAL network_error); Outlook `get_mail_message` listed 4 inline PNGs (thread history + this one).
- **Raúl’s own words:** the UI he is looking at is **not** the Storage/disk topic.
- Most likely: Soft Soft **History/Review / Explore timeline** (or per-cam recording scrubber) on one 32+5 camera — asking what makes recording “continua”, not “disco lleno”.
- Prior FAQ still applies: Review colors = alerts/detections/motion; **continuous retention does not paint a solid green bar**.

## Live evidence `.146` / CT105 / 37PMI (via HQ→node c `pct exec`)

| Check | Result |
|-------|--------|
| Disk `/securevu` | **81%** — 13T/16T, **3.2T free** (ZFS `HDDStorage01/subvol-105-disk-0`) |
| Container | `ghcr.io/…/securevu2:stable-tensorrt` **0.18.0-6fac0cd**; Started **18:11Z**; Status **unhealthy** (healthcheck **timeout 5s** under load) |
| Load | ~194–412 (host busy; explains unhealthy ≠ stopped) |
| `record.continuous` | **`days: 12`**; motion `days: 7`; **227 cams, 0 record_disabled** |
| Hour dirs UTC today | 16 **57G**, 17 **61G**, 18 **56G**, 19 growing (**~4.3→5.1G**; **+271 MB / 8s**) |
| Recent mp4 | hour-19 **~6.3k** files mtime ≤5 min |
| `No new valid recording segments` (15–30m) | **0** |
| API stats | **221/227** `camera_fps>0`; detect fps 0 (detect off — expected) |
| Sample `/api/{cam}/recordings/summary` | hours with **duration ≈ full hour**, **events/objects=0**, high **motion** counts |
| Oct 18 folder | **missing** under `/securevu/recordings` (gap day — separate from “is continuous now”) |

## Reconcile

**Recording is continuous on disk right now.** UI can look “not continuous” because Review/History coloring is event/motion-centric, not a continuous-green paint. Not a storage-full stop. Container unhealthy = healthcheck timeout under load, not write stop.

## Draft reply

Outlook **draft created (not sent)**  
**Draft id:** `AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0Au_m3w5KKBk6wKVJ6vYktBQAHINqe9QAA`  
**Drafts folder** · threaded · to Raúl · cc Roberto — reply threaded to Raúl, cc Roberto. Explains already-configured continuous + UI vs disk + ask for PMI/hora if specific gap.

## Tools note

- Jump: `fleet.pass` → `10.0.2.6` → `proxmox.pass` → `172.20.0.5` → `pct exec 105`.
- Avoid `find`/`du` on whole `/securevu/recordings` (13T) — scope to `YYYY-MM-DD/HH`.
