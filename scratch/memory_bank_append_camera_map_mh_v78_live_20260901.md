
**v78 CARTO Positron vector basemap LIVE 2026-09-01 (Cursor, post-deploy follow-up):** PROD CT103 — `https://mh.map.secure.vu/` build stamp **v78-carto-vector-basemap-20260901**; basemap **positron-gl-style** (vector GL), **no** raster `light_all`. Root cause: CARTO **API KEY REQUIRED** watermark on legacy raster tiles. Fix: Positron vector basemap (no API key). Snapshot rollback: **`preV78CartoVector20260901`**. Helper script fix: `deploy-v78-carto-vector.sh` `cd` → `$(dirname "$0")` (was `..`, missed `deploy.sh`). PMO patch 2858 @100% pending if `pmo.securecorp.com` resolves locally.

