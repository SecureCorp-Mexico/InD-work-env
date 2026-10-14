# SecureVu Map CT107 — SecureCorp internal rebuild (2026-10-14)

Target: **https://10.0.2.42/** on HQ Proxmox node B `10.0.2.6` CT107 (`securevu-map-mh-dev` hostname cosmetic).
Stamp unchanged: **v114** / `svmap-shell-v114-recording-summary-timeout-20261002` (`ad31abc` origin/main). MH prod CT103 `172.20.0.9` **not touched**.

## Backup

`/var/lib/securevu-map/backups/pre-hq-internal-rebuild-20261014-201436/`
- `data-snapshot.tgz` (full data minus nested backups)
- `config.json`, `.env` copies

## Removed (this instance only)

| Item | Action |
|------|--------|
| MH Soft Soft servers `172.20.0.195/.146/.144/.201/.27` | Dropped from `config.servers` |
| Howen VSS | `howen.enabled=false`; `HOWEN_PASS` blanked |
| SecureTrax / Traccar | `traccar.enabled=false`; `TRACCAR_PASS` blanked |
| UCM / Fanvil intercom | `intercom` cleared/disabled; `UCM_*` blanked |
| FreshService key | `FS_API_KEY` removed from `.env` (was already `enabled:false`) |
| Chat → MH Ollama `.146` | `chat.provider=none`, URL cleared |
| MH PMI inventory / intercom-pmi | Cleared |
| MH coordinates (~648 of 750) | Filtered out |
| alarms/events/status/audit/chat/recording_exports DBs | Wiped (recreated empty on API start) |
| Derived `cameras.geojson` / `streams.json` / `unmatched.json` | Regenerated via `/api/refresh` |

## Remaining servers

1. **10.0.2.185** — SecureCorp HQ / Bodega (go2rtc `CORPORATIVO_*` + `BODEGA_*`; HTTPS UI needs SNI `securecorp.secure.vu`)
2. **10.0.6.40** — Nostos Artz
3. **10.1.6.3** — Nostos Guadalajara

## Camera counts after refresh

| Site | Matched on map | Notes |
|------|----------------|-------|
| CORPORATIVO (HQ) | **17** | on `.185` |
| BODEGA (WH) | **21** | on `.185` |
| Nostos Artz (+ Casa_Athos) | **36** | on `.40` (GDL restreams prefer `.3`) |
| Nostos GDL | **28** | on `.3` |
| **Total matched** | **102** | discovered 116; unmatched 14 |

Unmatched on `.185` only (no coords / out of scope pins): `HOWEN_00232_CH*`, `BODYCAM_*`, `Petorius_Gimbal_01`, `BODEGA_PTZ_22`.

## Reachability (from CT107)

| Host | ping | `:1984` go2rtc | `:8971` HTTPS |
|------|------|----------------|---------------|
| 10.0.2.185 | OK | 200 | **needs SNI** `securecorp.secure.vu` → 200; bare IP → fail |
| 10.0.6.40 | OK | 200 | 200 |
| 10.1.6.3 | OK | 200 | 200 |

## Blockers / gaps

- **Lomas:** not wired — no verified NVR IP in memory / NetBird networks (Artz `10.0.6`, GDL `10.1.6`, WH `10.0.4`, Mochila Artz `10.0.11.0/29`). Documented in `config.notes.lomas`.
- **Certs:** HQ map still uses internal `securevu-map.crt` SAN `10.0.2.42` (+ symlinks for `mh.map.secure.vu.*` nginx names). `.185` UI cert is `securecorp.secure.vu`.
- **Howen:** disabled in config; Howen *streams* still exist on NVR `.185` go2rtc but are unmatched (not map pins).
- **Local MQTT:** stack mosquitto still runs; API still subscribes to topic `securetrax/alarms` (empty DB, no Trax poll). No MH Soft Soft servers remain.
- **PMO:** `pmo_sync.py auth` → API key inactive; update queued in `~/scratchpad/pmo_pending_updates.json` for activity **2858** / level **8.3**.

## Ops notes

- Local admin user `admin` upserted from existing `ADMIN_PASSWORD` for refresh; SSO `gmacay@securewitness.com` kept.
- No map code fork; site-local config/data only. Redeploy not required (v114 already live).
- Do **not** copy MH prod `.env` into this site.
