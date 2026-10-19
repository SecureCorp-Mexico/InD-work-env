# Raul Soft Soft storage / recording — 2026-10-19

**Email:** Outlook `rojeda@securewitness.com` 2026-10-19 16:34 UTC  
**Subject:** Re: SecureView+ / Descarga de videos  
**Symptom:** Server recording stops until Soft Soft / SecureVu NVR restart; then little recording returns. Especially “Servidor de los 32+5”. Earlier (Oct 8): projects 21=`.144`, 30/85=`.195`.

## Access path (this agent)

Mac has no direct ZeroTier route to `172.20.0.0/24`. Jump: `fleet.pass` → HQ Proxmox `10.0.2.6` → `proxmox.pass` → BaseSombra nodes → `pct exec`.

| Host | CT | Node | Proxmox name | Cams |
|------|----|------|--------------|------|
| 172.20.0.195 | 102 | a `172.20.0.2` | **85PMI** | 171 |
| 172.20.0.144 | 106 | c `172.20.0.5` | **21PMI** | 141 |
| 172.20.0.146 | 105 | c `172.20.0.5` | **37PMI** | 227 |
| 172.20.0.201 | 108 | b `172.20.0.4` | **30PMI** | 110 |
| 172.20.0.27 | 110 | b `172.20.0.4` | Legacy PMIs | (not in scope) |

**“32+5” mapping:** Soft Soft CT description **37PMI** = **172.20.0.146** (37 = 32+5). Matches Raul’s “sobre todo en el Servidor de los 32+5”.

## Stub / peer-shape audit (live)

All four Soft Soft AMH NVRs already peer-shaped — **no stub fix applied** (would be a no-op / risk).

| Host | Image digest | stub inputs | peer detect+record | detect global | hwaccel |
|------|--------------|-------------|--------------------|---------------|---------|
| .195 | `sha256:308a7ce6…` (=0.18.0-6fac0cd) | **0** | 171/171 | false, **64×64@1** (stub-era leftover) | `[]` |
| .144 | same | **0** | 141/141 | false, 640×360@3 | `[]` |
| .146 | same | **0** | 227/227 | false, 640×360@3 | `[]` |
| .201 | same | **0** | 110/110 | false, 640×360@3 | `[]` |

Bak proving Oct 2 peer fix on .195: `config.yaml.bak-detect-on-live-20261002T075830Z`.

## Recording evidence (UTC 2026-10-19 ~17:20–17:43)

### Before any action

| Host | Disk `/securevu` | Hour 16 size | Hour 17 size | growth ~8s | “No new valid recording segments” 10m | Notes |
|------|------------------|--------------|--------------|------------|----------------------------------------|-------|
| .195 | 13% (2.0T/16T) | **1010M** | **514–676M** | +9.6 MB | 0 | healthy; up 5d; **thin vs peers** |
| .144 | 62% | **20G** | **7.3–9.6G** | +60 MB | 0 | healthy; started ~16:51Z (recent restart) |
| .146 | 81% | **57G** | **22–30G** | +156 MB | 0 | was unhealthy → healthy; started ~16:04Z |
| .201 | 79% | **13G** | **4.8–6.6G** | +38 MB | 0 | healthy; started ~16:21Z |

Yesterday totals: .195 **23G** vs .144 **469G** / .201 **264G** — .195 chronically low volume.

### .195 segment quality (hour 16)

- 163 cams with data, **total ~0.94 GB** for the hour  
- Top cam ~20 MB; bands mostly &lt;20 MB/cam  
- Field samples `172.19.9.84`, `.9.3`, `.7.147`, `.10.163` = **DOWN** (no route)  
- Logs: go2rtc `dial tcp …:554: no route to host` + ffmpeg DESCRIBE **404** on some; watchdog churn on dead cams  
- **No** “No new valid recording segments” storm (that Oct 1/2 signature is gone)

### Action taken

- **Config:** none (already peer-shaped on all four).  
- **Restart:** `docker compose restart securevu` on **.195** only at **17:39:23Z** (healthy by ~30s).  
- Did **not** touch AO CT101/104.

### After .195 restart (~17:42Z)

| Host | growth_30s | hour-17 size | health | no_new_valid 5m |
|------|------------|--------------|--------|-----------------|
| .195 | **+17 MB** | ~831 MB | healthy | 0 |
| .144 | +186 MB | ~14.5 G | healthy | 0 |
| .146 | +554 MB | ~43 G | healthy | 0 |

.195 still ~10× thinner than .144 and ~30× than .146 — restart alone does **not** restore peer bitrate. Remaining drivers: field RTSP reachability on PMI 651–735 lot + leftover detect dims 64×64@1 (optional align later; not done this pass).

## Draft reply to Raul (not sent)

```
Buen día Raúl,

Revisé en vivo los Soft Soft de AMH (.195 / .144 / .146 / .201):

1) El servidor “32+5” es el Soft Soft **37PMI = 172.20.0.146**. Hoy está grabando fuerte (hora UTC ~22–57 GB/h) y sin el stub de detect antiguo.

2) Los cuatro ya tienen el arreglo de configuración (detect+record en el mismo stream live de go2rtc; sin `sv_nvr_detect_stub.mp4`). Imagen `0.18.0-6fac0cd` en todos. No hizo falta re-editar YAML.

3) En **.195 (85PMI / proyectos 30-85)** la carpeta de la hora sí crece, pero el volumen sigue bajo vs los pares (≈0.5–1.5 GB/h vs 7–57 GB/h). Reinicié SecureVu ahí hoy; no hubo tormenta de “No new valid recording segments”. Sí hay cámaras de campo sin ruta RTSP (`no route to host` en 172.19.x) que explican huecos / poca grabación en ese lote.

4) .144 (21PMI) y .201 (30PMI) están grabando bien en este momento.

Siguiente: afinar conectividad de campo del lote .195 (PMI 651–735) y, si hace falta, alinear parámetros detect residuales del .195 con los pares. Avísame si quieres que priorice un PMI concreto.

Saludos,
Gerardo
```

## Open follow-ups

1. Field/backhaul for .195 PMI lot (many `172.19.*:554` unreachable from CT102).  
2. Optional: bump .195 `detect.width/height/fps` from 64×64@1 → 640×360@3 to match peers (detect still disabled).  
3. Node inventory drift vs old notes: CT108/.201 and CT110/.27 now on **node b `172.20.0.4`** (not c); CT106/.144 on **c**.
