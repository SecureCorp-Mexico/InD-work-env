
**Soft Soft AMH fleet 0.18.0 bump LIVE 2026-09-20 (Cursor):** All 4 Soft Soft NVRs `0.17.2-72c7732` (`sha256:1ab636c…`) → **`0.18.0-6fac0cd`** (`sha256:308a7ce6…`, GHCR `ghcr.io/securecorp-mexico/securevu2:stable-tensorrt`). Same digest as Nostos/SecureCorp `.185` bump 2026-09-18.
**Order:** `.201` (CT108/node b, healthiest) → `.195` (CT102/node a) → `.144` (CT106/node c) → `.146` (CT105/node c, busiest). Serial; not parallel.
**Procedure per host:** backup `config.yaml` (+ db hardlink/`/root/backups` when `/securevu` full) → `docker pull` + `docker compose up -d` in `/opt/stacks/securevu`. Mounts `/config` + `/securevu` preserved; `hwaccel_args: []` left empty.
**Results:**
| Host | Pre → Post | Health post | Cams live | Notes |
| .201 | 0.17.2→0.18.0 | healthy | 110/98 | SSH via `pct exec 108` on `172.20.0.4` (direct root SSH denied); gap ~container recreate |
| .195 | 0.17.2→0.18.0 | healthy→unhealthy (healthcheck 5s timeout; API sluggish; was unhealthy pre) | API stats timeout | Recordings writing; version confirmed `0.18.0-6fac0cd` |
| .144 | 0.17.2→0.18.0 | healthy | 141/131 same | `/securevu` 100%; yaml bak root+`/securevu/backups` |
| .146 | 0.17.2→0.18.0 | healthy | 227/216 same | `/securevu` 100%; rootfs yaml bak |
**Gotchas:** `.201` needs Proxmox pass + pct (not fleet/direct root). Do not enable hwaccel on Soft Soft record hosts. `.144`/`.146` disk pressure unchanged (retention/cleanup separate).

**CT110 `.27` catch-up LIVE 2026-09-20:** `mxmhvmsl00006` / CT110 on Proxmox `.4` (node b). `0.17.2-72c7732` → `0.18.0-6fac0cd` via pct exec; healthy; 4/4 cams; `/securevu` 3%; hwaccel [].
