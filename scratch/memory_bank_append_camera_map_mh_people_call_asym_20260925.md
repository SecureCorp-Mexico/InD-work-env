**People-call asymmetry 5002→módulos 2026-09-25 (Cursor):** Read-only UCM admin CGI + CDR `cdrapi_filtered` Sep 17–25. **No PBX config changed.**

### Verdict (ranked)
1. **Primary — callee not answering / Base early abandon (ops + device alert), not PBX routing.** `5002→{5003,5006,5007}` **59/66 NO ANSWER (89%)**; reverse `{5003,5006,5007}→5002` **9/266 fail (3.4%)**. Every NO ANSWER has `dstchannel=PJSIP/5xxx-…` (phone Invited / registered). Dial always `…,60,…` but **0 calls hit ~60s timeout**; NA median duration **3s** (66% ≤5s). Control: **`5002→5004` Legaria 12/12 ANSWERED** with identical extension settings.
2. **Not UCM DND / CF / hunt / Unavailable.** Exts 5002/5003/5004/5006/5007: `dnd=no`, `en_ringboth=no`, `ring_timeout=''`, `presence=available`, `out_of_service=no`, Idle Fanvil addrs; no CFU/CFB/CFNA fields set; FollowMe empty; **no ring-group in path** (direct `Dial(PJSIP/ext)`). RGs exist (6400 SOS, 6401/6404 voceo) but unrelated to Base↔módulo people dials.
3. **PBX settings do not explain site split.** Among 5002–5007 the only material diffs are identity/`secret`/`vmsecret` and `auto_record` (5002 `off`, módulos `all`). Codec/NAT/`max_contacts=3`/WebRTC flags identical. Fail≠busy overlap (0 concurrent answered legs on callee).
4. **Secondary — device/site alert or habit on Granada/Tacubaya/Duraznos.** Same PBX profile as Legaria (works). Recommend Fanvil UI check: ring volume / silent / headset / local DND softkey / missed-call log while Base places a supervised test call; staff procedure “answer Base inbound”.
5. **Ruled out as main cause:** night-only pattern (afternoon fails e.g. 5003 6/6, 5006 7/7); codec mismatch; dialplan asymmetry (lastdata mirror reverse); SIP Unavailable at dial time.

### Live registration (audit moment)
| Ext | Name | Status | Addr |
|-----|------|--------|------|
| 5002 | BASE SOMBRA2 | Idle | 172.16.30.200 Fanvil |
| 5003 | Granada | Idle | 172.25.27.33 |
| 5006 | Duraznos | Idle | 172.25.27.65 |
| 5007 | Tacubaya | Idle | 172.25.27.35 |
| 5004 | Legaria (control) | Idle | 172.25.27.180 |

Artifacts: `/tmp/ucm_people_asym_20260925/` (`extensions_detail.json`, `pair_summary.json`, `people_cdr_rows.json`, ring groups). Paste into [[project_camera_map_mh_append_20260901]]. PMO **2860**.
