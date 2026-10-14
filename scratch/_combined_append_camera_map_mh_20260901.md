

**CARTO API KEY REQUIRED watermark 2026-09-01 (Cursor):** Mapa mostraba leyenda «API KEY REQUIRED» en tiles — CARTO empezó a exigir API key en **raster** legacy (`basemaps.cartocdn.com/light_all/...png` sin `?key=`). No es FreshService/Mapbox. Fix: basemap → **Positron vector** `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json` (sin key; recomendado por CARTO). Build **v78-carto-vector-basemap-20260901** — `app/src/main.js`, `index.html`, `sw.js`. Gerardo: desde Mac con ruta ZT a 172.20.0.4 → `cd ~/camera-map-mh && SSHPASS=… ./deploy.sh` (snapshot CT103 antes). Hard refresh / unregister SW post-deploy. CT107 no tocado.

**Deploy follow-up 2026-09-01 (Cursor agent):** SSH `root@172.20.0.4` → `Operation timed out` (no ZT/LAN from agent). `https://mh.map.secure.vu/` curl: no v78 stamp (deploy not live). PMO `apply-updates`: DNS fail `pmo.securecorp.com` from agent — run locally. Obsidian append: file read timeout (iCloud?). Paste this block into `project_camera_map_mh.md` if not already present.


**v78 CARTO Positron vector basemap LIVE 2026-09-01 (Cursor, post-deploy follow-up):** PROD CT103 — `https://mh.map.secure.vu/` build stamp **v78-carto-vector-basemap-20260901**; basemap **positron-gl-style** (vector GL), **no** raster `light_all`. Root cause: CARTO **API KEY REQUIRED** watermark on legacy raster tiles. Fix: Positron vector basemap (no API key). Snapshot rollback: **`preV78CartoVector20260901`**. Helper script fix: `deploy-v78-carto-vector.sh` `cd` → `$(dirname "$0")` (was `..`, missed `deploy.sh`). PMO patch 2858 @100% pending if `pmo.securecorp.com` resolves locally.



**Deploy v78 follow-up 2026-09-01 (Cursor, user Mac):** SSH `root@172.20.0.4` / ping 172.20.0.4 / 172.20.0.9 → timeout. ZT Bololongo OK (`10.242.3.72`) but no route to `172.20.0.0/16` (only `192.168.200/24` via ZT). `SSHPASS` unset — deploy script not run. Live: `https://mh.map.secure.vu/` → HTTP 000. **Deployed: NO.** PMO: `pmo.securecorp.com` NXDOMAIN from this host even with `~/.config/securecorp/pmo.env`. Obsidian `project_camera_map_mh.md` append → iCloud write timeout; paste from `InD-work-env/scratch/memory_bank_append_camera_map_mh_20260901.md` + this block when vault syncs.

**Deploy v78 retry 2026-09-01 (Cursor, user Mac):** Red OK — ping 172.20.0.4/.9; ruta `172.20/24` vía ZT AMH (`feth2896`, gw 172.25.27.55). Bololongo `10.242.3.72/16`. `https://mh.map.secure.vu/` HTTP 200; meta **v77-detecciones-search-20260815**; bundle `light_all` (sin positron). SSH `root@172.20.0.4`: Permission denied (BatchMode; sshpass probó `fleet.pass`, `securevu-185.pass`, `map-hq-mqtt.pass`, HQ default — ninguno). `SSHPASS` unset; `./deploy-v78-carto-vector.sh` no corrido. PMO: `pmo.securecorp.com` NXDOMAIN. **Deployed: NO.** Acción: `export SSHPASS=<Proxmox root CT103 PVE>` luego `cd ~/camera-map-mh && ./deploy-v78-carto-vector.sh` (snapshot `pct snapshot 103 preV78CartoVector20260901` opcional).

**VoIP pill v79 2026-09-01 (Cursor):** Restored top-bar label **VoIP** (regression: `app/index.html` hardcoded `IC`; v71 rename never committed). Green state fix: `paintTopbarIntercomPill()` + post-`initIntercom` refresh — `onIntercomState` fired while `intercomFeatureOn` was still false, so pill stayed hidden/muted. Deploy CT103 web-only **v79-voip-label-20260901**.

**v78 regression + v80 restore 2026-09-01 (Cursor):** `deploy.sh` overwrote CT103 with stale local tree, losing v74–v77 PROD patches (panel mutual exclusion, ES labels/no IP, collapsible «Actividad (N)», detecciones search). Merge base: scratch `svmap-v77-det-search` + v76 alarms notes + v75 labels; layered v78 Positron vector + v79 VoIP fixes. Build **v80-merge-preV78-plus-carto-20260901**; snapshot `preV80MergeRestore20260901`. API md5 unchanged (FS sync intact); web-only rebuild.

**Credentials 2026-09-01:** `~/camera-map-mh/proxmox.pass` created for CT103 deploy (Proxmox root); do not commit. Prior attempts used wrong pass files (`fleet.pass`, etc.).
