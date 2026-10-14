**UCM CDR re-audit 2026-09-25 (Cursor):** User asked re-check with updated info vs 2026-09-21 audit. Admin CGI OK; `cdrapi` needs ISO stamps (`startTime=2026-09-17T00:00:00` / `endTime=…T23:59:59`) — bare dump still caps ~2026-08-24. **No PBX config changed.**

- **Full window Wed 17→Fri 25 ~10:58:** **692** sessions · ANSWERED **582** · NO ANSWER **102** · FAILED **8** · BUSY **0** (fail rate **16%**). Prior window recount matches Sep-21 audit exactly (**374** / 303/70/1).
- **Delta after Sep-21 10:27:** **318** sessions · ANS **279** · NO ANS **32** · FAILED **7** (fail rate **12%** — slightly better). By day fails: 21st+5 · 22nd 10 · 23rd 8 · 24th 10 · 25th 6 (partial morning).
- **SOS→6400:** full **112** (real talk **100**: **81×5000**, **19×5001**; **0×900x**). Delta **65** SOS (**44×5000**, **16×5001**, **0×900x**); **5** ghost ANSWERED billsec=0 all from Fanvil **1059 / PMI 678** morning Sep-25 (no usable talk); **0** hard misses in delta (vs **6–7** in prior window). Map ops dial legs in delta: **22** to 9000/9001/9002/9003 — **all NO ANSWER/FAILED**.
- **Ring group 6400 NOW:** members `5000,5001,group-1` (group-1 SecureCorp = **9000–9003**), strategy **SIMULTA**, ringtime 25, failover dest **5000**. Same pattern as Sep-21: Base answers; map Contestar never gets an answered SOS.
- **Map softphone NOW:** **9000–9003 all Unavailable** (no JsSIP registered) — unchanged vs Sep-21.
- **Hablar 900x→1xxx:** still **0** CDRs in full window.
- **People Base↔Módulos:** still asymmetric. Full: **5002→5003 ~88%**, **5002→5007 ~87%**, **5002→5006 ~75%** NO ANSWER; reverse Módulo→5002 mostly OK (0–8%). Delta similar (5002→5003/5006 ~83%, 5002→5007 3/3 fail). New FAILED mostly wrong numbers (Mask dialed `5558149393`/`58149393`; Base dialed nonexistent **610/611/648**).
- **Verdict vs prior:** **Same root cause** (map ops never registered; Base takes SOS). Overall fail rate slightly **improved** in delta; SOS Contestar path **not improved**; people-call asymmetry **unchanged**. Reports still match PBX. PMO **2860**.

Paste into [[project_camera_map_mh_append_20260901]] (Obsidian Documents vault write blocked by macOS TCC this session).
