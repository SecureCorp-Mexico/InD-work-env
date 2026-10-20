# Soft Soft calm-window restart — 2026-10-19 ~19:25 CDMX / 01:25Z

Deferred restart after Map v117 disk-summary papered over wedged `.146` `:8971`.

## Before (live ~01:14–01:25Z)

| Host | CT | docker health | POST :8971/login | Recording (UTC hour 01) | Notes |
|------|-----|---------------|------------------|-------------------------|-------|
| **172.20.0.146** | 105 | healthy (was unhealthy earlier today) | **401 ~20ms** (recovered vs earlier timeout) | **217 cams / ~25G**, pulse ~65 MB/5s | summary `:5000` ~8.5s; load dropping 35/72/100; `sv-disk-summary` **active** `:8972` 200 |
| **172.20.0.144** | 106 | healthy (Up 2h) | 401 ~20ms | **136 cams / 9.8G**, pulse ~13 MB/3s | OK — **no restart** |
| **172.20.0.195** | 102 | healthy (Up 8h) | 401 ~0.25s | **72 cams / 213M**, pulse ~0 | thin (field) — API OK — **no restart** |
| **172.20.0.201** | 108 | healthy (Up 9h) via `pct exec` on node b `.4` | 401 ~20ms | **107 cams / 6.1G**, pulse ~11 MB/3s | direct SSH `proxmox.pass` **denied**; OK via pct — **no restart** |

Layout reminder: recordings = `/securevu/recordings/YYYY-MM-DD/HH/<cam>/`.

## Action

1. **Restarted only `.146`:** `docker restart securevu` @ **2026-10-20T01:25:45Z**
2. Did **not** touch `sv-disk-summary.service` / `:8972`
3. Peers left alone (healthy + `:8971` answering)

## After `.146`

| Check | Result |
|-------|--------|
| Health | **healthy @ ~20s** (`started=2026-10-20T01:26:18Z`) |
| POST login | **401 ~16ms** |
| GET `/` | **200** |
| `sv-disk-summary` | **active**; `:8972/health` **200** `{"ok":true…}` |
| summary `:5000` | **200 ~7.1s** (still heavy but not timeout) |
| Hour dir | **218 cams**, pulse **~181 MB/8s** (~80 GB/h instantaneous) |
| PMI 579/578 | files growing; newest segment age **~7s** |
| go2rtc | **454** streams; **`_1` with bytes = 218** |

## Verdict

- **Restarted:** `.146` only
- **Not restarted:** `.144` / `.195` / `.201` (healthy + API live)
- Disk-summary sidecar survived restart as intended
- Map v117 fallback still available; Soft Soft API usable again for login/stats

No email sent. No retention/config changes.
EOF
