# Internal SecureVu Map resume — 2026-10-13

Scratch copy of the Obsidian appends on [[project_securevu_map_hq]] and [[project_securevu_aao]]. No secrets.

## Already done before this session

- HQ map is **not** on `10.0.2.5`. That host is Proxmox node A `mxmhvhstl00001a` (CT101 Ollama, CT102 NVR `10.0.2.185`, VM110).
- Map instance: node B `10.0.2.6` **CT107** `securevu-map-mh-dev` @ **https://10.0.2.42/**. Retired CT106/`10.0.2.40`.
- `config.servers` already had MH `172.20.0.195`, `.146`, `.144`, `.201`, `.27`, plus **HQ/WH `10.0.2.185`**, **Artz `10.0.6.40`**, **GDL `10.1.6.3`**.
- July 2026 pins: Artz `19.314288,-99.219462`, GDL `20.694879,-103.375908`; stream-name prefer so Artz restreams of GDL do not steal the pin.
- AAO cluster inventoried 2026-07-16. Map LXC was still pending. Phase 5 = register both SecureVu servers. No map CT had been created.

## What changed

- SSH: `~/.config/securecorp/proxmox.pass` was rejected on `10.0.2.5`. HQ root accepted `fleet.pass` (documented for this CT).
- Redeployed `/Users/gmacay/camera-map-mh` **`origin/main` `ad31abc165cce067ea9d326dd3b4d83feddc4bd9`** onto CT107 via `./deploy-dev.sh`. Site `.env` and `mosquitto.passwd` left in place. No new git commit (tree already matched origin/main).
- Running build was service-worker **v43** / images about 2 months old. Now stamp **`v114-recording-summary-timeout-20261002`**. `https://10.0.2.42/` → 200, `/api/config` → 401.
- Current nginx also requires `/etc/nginx/ssl/mh.map.secure.vu.crt`. HQ has no Let's Encrypt files. Symlinked those names to the existing internal `securevu-map.crt` / `.key` (SAN `10.0.2.42`) so the web container starts. IP URL still uses the internal-CA default server.
- `config.servers` not edited.

## Reachability from CT107

| NVR | Address | Result |
|---|---|---|
| Artz | `10.0.6.40:8971` | TCP open, HTTP 401 |
| GDL | `10.1.6.3:8971` | TCP open, HTTP 401 |
| HQ + warehouse | `10.0.2.185:8971` | Needs SNI `securecorp.secure.vu` → 401. go2rtc prefixes: CORPORATIVO, BODEGA (same NVR) |
| Lomas | — | **not wired** |

Howen poll `10.0.2.61:9966` was `ECONNREFUSED` when the API started. Left as-is.

## Lomas gap

No Lomas NVR IP in the memory bank. HQ router NetBird announced routes are `10.0.6.0/24` (Artz), `10.1.6.0/24` (GDL), `10.0.4.0/24` (warehouse), `10.0.11.0/29` (Mochila Artz, not Lomas). Stopped rather than guess an address.

## Álvaro Obregón

Reached Proxmox through HQ router `10.0.2.1` (Mac and CT107 cannot route to `10.0.7.0/24`; the router can).

| Guest | Node | IP | Role this check |
|---|---|---|---|
| CT101 `mxaovmsl00001` | b `10.0.7.4` | `10.0.7.118` | SecureVu, listening :8971 and :8554 |
| CT104 `mxaovmsl00003` | b | `10.0.7.59` | SecureVu, listening :8971 and :8554 |
| VM100 `mxaoappl00002` | b | dhcp | not a map |
| CT102 Shinobi | c `10.0.7.5` | `10.0.7.12` | :8080/:8288 |
| CT105 Trax | c | `10.0.7.221` | :8082 |
| CT103 `mxaoappl00001` | c | dhcp | **stopped** |

No map container. Did not create one and did not touch recordings or NVR configs. Blocker: no AO map env file under `~/.config/securecorp/`; copying the MH `.env` is out of bounds.

## PMO

`pmo.securecorp.com` did not resolve from this Mac. Note queued on activity **2858** in `~/scratchpad/pmo_pending_updates.json` (no progress percent change).
