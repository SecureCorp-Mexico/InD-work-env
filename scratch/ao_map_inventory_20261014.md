# AO SecureVu Map readiness inventory — 2026-10-14

**Reachable from Mac:** YES (ZeroTier → 10.0.7.0/24). Router `10.0.7.1` MXAOVPNR00001 up 71d. Proxmox SSH: site password `Alvaro0bregon` (not `proxmox.pass` / `fleet.pass`).

## Cluster

| Node | Host | IPs | Role |
|---|---|---|---|
| b | mxaovhstl00001b | 10.0.7.3 / 10.0.7.4 | Proxmox UI :8006 |
| c | mxmhvhstl00001c | 10.0.7.5 / 10.0.7.6 | 2nd node |

Cluster `Alvaro0bregon` quorate (2 nodes). `pvesh nextid` = **107**. Templates: debian-13 + ubuntu-22.04 on local. Storage headroom OK (local-lvm ~6–10% used).

## CT / VM inventory

| VMID | Type | Status | Node | Name | IP | Role |
|---:|---|---|---|---|---|---|
| 100 | qemu | running | b | mxaoappl00002 | 10.0.7.126 | ZTNet (not map) |
| 101 | lxc | running | b | mxaovmsl00001 | **10.0.7.118** | SecureVu2 project A |
| 102 | lxc | running | c | MXAOVMSL00002 | **10.0.7.12** | Shinobi SecureView AO |
| 103 | lxc | **stopped** | c | mxaoappl00001 | (dhcp) | **Old SecureTrax** (Helper-Scripts) — NOT map |
| 104 | lxc | running | b | mxaovmsl00003 | **10.0.7.59** | SecureVu2 project B |
| 105 | lxc | running | c | MXAOAPPL00001 | **10.0.7.221** | SecureTrax / Traccar live |
| 106 | qemu | running | c | MXAOCADW00001 | 10.0.7.144 | CAD Windows (no ICMP from Mac) |

**Map presence:** NONE. No SecureVu-Map LXC, no `/opt/securevu-map*`, no AO map `.env` under `~/.config/securecorp/`.

## SecureVu health (read-only)

| CT | IP | Image | Docker health | :8971 HTTPS | :8554 TCP | go2rtc streams | cameras.yaml | MQTT |
|---|---|---|---|---|---|---:|---:|---|
| 101 | 10.0.7.118 | stable-tensorrt `0.17.1-eb48504` | **healthy** (restarted ~14:00 CDMX) | 200 (UI); API basic auth not site-pw | OPEN | **446** all producer_ok | **223** | **disabled** |
| 104 | 10.0.7.59 | same | **unhealthy** since 2026-09-12 | UI 200; API **500** (auth :5001 refused) | OPEN | **290** all producer_ok | **227** | **disabled** |

Notes:
- :1984 **not published** on host (only 8971/8554/8555). go2rtc listens inside container; MH map pattern proxies `/sv/<ip>/` → :1984 — AO will need **1984 published** (or equivalent proxy path) on both NVRs for stream discovery/MSE.
- CT104 Frigate/auth process down → recording JWT / `/api/stats` broken; **live RTSP :8554 still OK**.
- Plantilla local: `~/.cursor/Alcaldia AO/plantilla_camaras_AAO_filled.csv` (223 + header; `servidor=10.0.7.118`).

## Adjacent services

| Service | Status |
|---|---|
| Shinobi CT102 | UP :8080 title "SecureView AO"; PM2 camera; DB monitors **427** |
| Trax CT105 | UP :8082 / :5039 / :5055; systemd active |
| CT103 | Stopped leftover Trax — leave stopped; do not confuse with map |

## Gap list vs MH/HQ map deploy

| Item | MH/HQ | AO now | Gap |
|---|---|---|---|
| Proxmox host | yes | **yes** 10.0.7.4 | — |
| Map LXC (Ubuntu, nesting, docker) | CT103 / CT107 | **missing** | Create new CT (nextid 107) |
| Static IP for map | .9 / .42 | **unassigned** | Pick + DHCP reservation / static |
| TLS on map CT | HTTPS nginx | n/a | Self-signed or LE DNS name |
| `.env` (ADMIN/MQTT/SV_API/TRACCAR…) | site-specific | **no AO file** | Create AO env — **do not copy MH** |
| SSO (optional) | MH Entra | none | New Entra app + redirect if wanted |
| MQTT on NVRs → map broker | MH enabled | **mqtt.enabled: false** both | Enable + point to map CT if events wanted |
| Servers in map admin | multi | n/a | Register **10.0.7.118 + 10.0.7.59** |
| Coordinates CSV | MH plantilla | AO plantilla exists locally | Upload after deploy |
| go2rtc :1984 reachability | published/proxied | **not on host** | Publish 1984 or adjust proxy |
| SV API credentials | in `.env` | unknown (site pw ≠ admin API) | User: `SV_API_USER`/`SV_API_PASS` |
| DNS / public name | mh.map.secure.vu | none | Optional FQDN |
| deploy.sh targets | MH defaults | need AO `PVE_HOST`/`PVE_CTID` | Wrapper or env override |
| CT104 API health | — | unhealthy auth | Fix before recording features; live map may still work via :8554/:1984 |

## Need from user before creating map CT

1. **Static IP** for map LXC (candidates free-ish: .8–.11, .13, .30, .50, .100, .107, .150, .200 — confirm with site DHCP).
2. **VMID** OK to use **107** (or other free id; 103 is Trax leftover — do not reuse without wipe).
3. **AO `.env` secrets:** `ADMIN_PASSWORD`, `MQTT_PASS`, `SV_API_PASS` (SecureVu admin JWT), optional `TRACCAR_PASS` for CT105, SSO/FS keys if required.
4. **DNS name** (or IP-only HTTPS like early MH).
5. Whether **MQTT/events** and **SSO** are in scope for v1 or cameras-only first.
6. OK to **publish :1984** on CT101/104 (compose change; no recording wipe) for map proxy.

**Not done this pass:** no CT created, no NVR config writes, CT103 left stopped, HQ CT107 untouched.
