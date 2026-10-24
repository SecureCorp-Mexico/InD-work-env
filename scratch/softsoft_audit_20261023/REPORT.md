# Soft Soft AMH + Map recording audit — 2026-10-23 ~20:10–20:40 CDMX

Live audit of Map Grabaciones-bar / timeout reports + “HDDStorage barely used”.

## Placement (updated)

| Host | CT | Node | PMI role | Recordings dataset |
|------|-----|------|----------|-------------------|
| **172.20.0.195** | 102 | **a** `.2` | 85PMI 651–735 | `HDDStorage01/subvol-102-disk-0` → `/securevu` |
| **172.20.0.146** | 105 | **c** `.5` | 37PMI 578–614 | `HDDStorage01/subvol-105-disk-0` → `/securevu` |
| **172.20.0.144** | 106 | **c** `.5` | 21PMI 557–577 | `HDDStorage01/subvol-106-disk-0` → `/securevu` |
| **172.20.0.201** | 108 | **b** `.4` | 30PMI 621–650 | `HDDStorage01/subvol-108-disk-0` → `/securevu` |
| **172.20.0.27** | 110 | **b** `.4` | Soft Soft PMI469 | `HDDStorage01/subvol-110-disk-0` → `/securevu` |
| Map CT103 | 103 | **b** `.4` | SecureVu Map MH | `local-lvm` (no HDD recordings) |

Compose bind correct on all five: `/securevu:/media/securevu`. Image `0.18.0-6fac0cd`.

## ZFS HDDStorage — why “barely used” is misleading

Each Proxmox node has its **own** `HDDStorage01` pool (not shared cluster capacity).

| Node | Pool CAP | Dataset Soft Soft | USED / AVAIL (refquota) |
|------|----------|-------------------|-------------------------|
| **a** `.2` | **5%** (1.96T/36.4T) | CT102 `.195` | **1.56T / 14.1T** of 15.6T — looks empty because **.195 writes thin** |
| **b** `.4` | **29%** (12.8T/43.7T) | CT108 `.201` | **7.80T / 1.96T** of 9.77T (**80% of quota**) |
| **b** `.4` | (same) | CT110 `.27` | **725G / 7.1T** of 7.81T |
| **c** `.5` | **76%** (27.8T/36.4T) | CT105 `.146` | **12.9T / 2.75T** of 15.6T (**83%**) |
| **c** `.5` | (same) | CT106 `.144` | **7.30T / 2.46T** of 9.77T (**75%**) |

**Mismatch explained:** looking at node **a** pool (or UI “HDDStorage” without naming the node) shows ~5% used — that only hosts thin `.195`. Heavy writers are on **c** (76%) and **b** `.201` (dataset nearly full). CT disks are **not** mis-mounted; recordings are on the correct HDDStorage datasets.

## Per-host recording (UTC hour ~02, ~45s growth)

| Host | docker | :8971 login | continuous.days | hour cams | GB/h | fps>0 | newest mp4 | “No new valid…”/2h | :8972 pre |
|------|--------|-------------|-----------------|-----------|------|-------|------------|--------------------|-----------|
| `.144` | healthy (Up ~44m — restarted ~01:33Z by prior op) | 200 ~0.28s | 15 | 138 | **22.7** | 131/141 | 0–1s | 0 | inactive |
| `.146` | healthy Up 24h | 200 ~0.27s | 12 | 213 | **58.3** | 212/227 | 0–3s | 0 | **active** |
| `.195` | healthy Up 31h | 200 ~0.63s | 30 | 75→164 | **0.47** | 168/171 | ~21–26s | 0 | inactive |
| `.201` | healthy Up 4d | 200 ~0.28s | 30 | 107 | **14.5** | 107/110 | ~4s | 0 | inactive |
| `.27` | healthy Up 4w | 200 ~0.33s | 30 | 4 | **1.26** | 4/4 | ~3s | 0 | inactive |

## Map side (CT103)

- Stamp **v117** still live (`svmap-shell-v117-disk-summary-fallback-20261019`); API env `SV_DISK_SUMMARY_PORT=8972`.
- Soft Soft JWT summary from Map CT: works when healthy but **slow** (.144 **~24s**, .146 **~15–21s** cold) → Map bar timeouts under load.
- Disk summary (post-fix): **~0.02–0.5s** typical; `.144` first scan ~20s then OK.

### Sample last-6h disk ratios (America/Mexico_City)

| Stream | source | last6 |
|--------|--------|-------|
| `.146` 579 `_2_24_bullet` | disk | 0.61–0.99 |
| `.146` 610 `_4_6_ptz` | disk | 0.61–0.99 |
| `.146` 578 `_2_10_bullet` | disk | 0.61–0.99 |
| `.195` 651 `_bullet` | disk | **0.01–0.06** (thin — bar looks empty) |
| `.195` 654 `_bullet` | disk | **0.05–0.07** |
| `.144` 557 `_1_22_bullet` | disk | 0.63–1.0 |
| `.201` 625 `_4_227_ptz` | disk | 0.63–1.0 |
| `.27` 469 `ch1` | disk | 0.63–1.0 |

## Verdicts

| Host | Verdict | Root cause |
|------|---------|------------|
| `.144` | **RECORDING OK** | Strong write; API OK; was missing :8972 → Map relied on slow Soft Soft |
| `.146` | **RECORDING OK** | Strong write; :8972 already since Oct 19; API OK tonight |
| `.195` | **THIN** | Writing many cams but ~0.5 GB/h + disk ratios ~0.03–0.07 → Map bar nearly empty; field/bitrate (chronic) — **not** disk misconfig / not STOPPED |
| `.201` | **RECORDING OK** | Strong; dataset 80% of 10T quota — watch free space |
| `.27` | **RECORDING OK** | Soft Soft recording host for PMI469; 4/4 fps; healthy |
| Map CT103 | v117 OK | Timeouts = Soft Soft summary latency when :8972 missing |

No **API WEDGED**, no **DISK MISCONFIG**, no **STOPPED** tonight.

## Actions taken (safe, one host at a time)

1. **Installed** `sv-disk-summary.service` `:8972` on **`.144`**, **`.195`**, **`.201`**, **`.27`** (same as `.146`). Does **not** touch/restart `securevu`.
2. Verified all five `:8972/health` OK from Map CT103; sample bars via disk path.
3. Did **not** restart any Soft Soft container (none wedged). Did **not** wipe/purge retention.
4. PMO API key still inactive → queued notes for **2853** / **2858**.

## Artifacts

- `out_144.txt` … `out_27.txt`, `zfs_snapshot.txt`, `out_post_fix_bars.txt`, `out_sv_summary.txt`
- `fix_*_disksum.txt`
