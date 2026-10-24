#!/bin/bash
# Soft Soft guest audit — run inside CT (direct SSH or pct exec)
set -u
HOST_LABEL="${1:-unknown}"
OUT="/tmp/ss_audit_${HOST_LABEL}.txt"
exec >"$OUT" 2>&1
echo "=== Soft Soft guest audit $HOST_LABEL $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "hostname=$(hostname)"
echo "ip=$(hostname -I 2>/dev/null | awk '{print $1}')"

echo "--- docker securevu ---"
docker ps -a --filter name=securevu --format 'name={{.Names}} status={{.Status}} image={{.Image}}' 2>&1 | head -20
docker inspect securevu --format 'health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} started={{.State.StartedAt}} restarting={{.State.Restarting}}' 2>&1

echo "--- df mounts ---"
df -h / /securevu /media 2>&1 | head -20
mount | egrep 'securevu|/media' || true
ls -ld /securevu /securevu/recordings 2>&1 | head -5

echo "--- compose bind ---"
grep -E 'media/securevu|media/frigate|/securevu' /opt/stacks/securevu/compose.yaml 2>/dev/null | head -20 || \
  grep -E 'media/securevu|media/frigate|/securevu' /opt/stacks/securevu/docker-compose.yml 2>/dev/null | head -20 || true

echo "--- record.continuous.days ---"
python3 - <<'PY' 2>/dev/null || true
import yaml,sys
for p in ["/opt/stacks/securevu/config/config.yaml","/config/config.yaml"]:
  try:
    with open(p) as f: c=yaml.safe_load(f)
  except Exception: continue
  r=c.get("record") or {}
  cont=(r.get("continuous") or {})
  print(f"path={p}")
  print(f"record.enabled={r.get('enabled')}")
  print(f"record.continuous.days={cont.get('days')}")
  print(f"record.retain.days={(r.get('retain') or {}).get('days')}")
  cams=c.get("cameras") or {}
  en=sum(1 for k,v in cams.items() if isinstance(v,dict) and (v.get("record") or {}).get("enabled", r.get("enabled",True)) is not False and not v.get("enabled") is False)
  disabled=sum(1 for k,v in cams.items() if isinstance(v,dict) and v.get("enabled") is False)
  rec_off=sum(1 for k,v in cams.items() if isinstance(v,dict) and (v.get("record") or {}).get("enabled") is False)
  print(f"cameras_total={len(cams)} cameras_enabledish={en} cameras_disabled={disabled} record_explicit_false={rec_off}")
  break
else:
  print("config_yaml_not_found")
PY

echo "--- :8971 login latency ---"
# Prefer admin pw from env or default fleet
ADMIN_PW="${ADMIN_PW:-***REDACTED***}"
for URL in "https://127.0.0.1:8971/api/login" "http://127.0.0.1:5000/api/login"; do
  START=$(date +%s%3N)
  CODE=$(curl -sk -o /tmp/login_body.txt -w '%{http_code}' --connect-timeout 5 --max-time 45 \
    -H 'Content-Type: application/json' \
    -d "{\"user\":\"admin\",\"password\":\"$ADMIN_PW\"}" "$URL" 2>/dev/null || echo ERR)
  END=$(date +%s%3N)
  MS=$((END-START))
  BODY=$(head -c 120 /tmp/login_body.txt 2>/dev/null | tr '\n' ' ')
  echo "login $URL code=$CODE ms=$MS body=$BODY"
done

echo "--- :8972 disk-summary ---"
systemctl is-active sv-disk-summary.service 2>&1 || true
ss -lntp 2>/dev/null | egrep ':8972|:8971|:5000' || netstat -lntp 2>/dev/null | egrep ':8972|:8971|:5000' || true
curl -sk --connect-timeout 3 --max-time 8 http://127.0.0.1:8972/health 2>&1 | head -c 300; echo
curl -sk --connect-timeout 3 --max-time 8 https://127.0.0.1:8972/health 2>&1 | head -c 200; echo

echo "--- today's hour folders ---"
TODAY=$(date -u +%Y-%m-%d)
HH=$(date -u +%H)
REC=/securevu/recordings
if [ ! -d "$REC" ]; then REC=/media/securevu/recordings; fi
echo "REC=$REC TODAY=$TODAY HH=$HH"
if [ -d "$REC/$TODAY/$HH" ]; then
  CAMS=$(find "$REC/$TODAY/$HH" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
  SIZE=$(du -sh "$REC/$TODAY/$HH" 2>/dev/null | awk '{print $1}')
  echo "hour_dir cams=$CAMS size=$SIZE path=$REC/$TODAY/$HH"
else
  echo "hour_dir MISSING $REC/$TODAY/$HH"
  ls -la "$REC" 2>&1 | head -10
  ls -la "$REC/$TODAY" 2>&1 | head -30
fi

echo "--- GB/h growth sample (~45s) ---"
HDIR="$REC/$TODAY/$HH"
if [ -d "$HDIR" ]; then
  B1=$(du -sb "$HDIR" 2>/dev/null | awk '{print $1}')
  sleep 45
  B2=$(du -sb "$HDIR" 2>/dev/null | awk '{print $1}')
  DELTA=$((B2-B1))
  # bytes/45s -> GB/h = delta * 80 / 1e9
  python3 - <<PY
b1=$B1; b2=$B2; d=b2-b1
gph = d * (3600/45) / 1e9
print(f"bytes_t0={b1} bytes_t45={b2} delta={d} est_GB_per_h={gph:.2f}")
PY
else
  echo "no_hour_dir_for_growth"
fi

echo "--- newest mp4 ages (sample 12) ---"
find "$REC/$TODAY/$HH" -name '*.mp4' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -12 | while read ts path; do
  age=$(python3 -c "import time; print(int(time.time()-$ts))")
  echo "age_s=$age $path"
done

echo "--- No new valid recording segments (recent logs) ---"
docker logs securevu --since 2h 2>&1 | grep -c 'No new valid recording segments' || echo count_fail
docker logs securevu --since 2h 2>&1 | grep -i 'No new valid recording segments' | tail -5

echo "--- fps>0 via stats (if API works) ---"
TOKEN=$(python3 - <<PY 2>/dev/null
import json,urllib.request,ssl
ctx=ssl._create_unverified_context()
req=urllib.request.Request('https://127.0.0.1:8971/api/login',data=json.dumps({"user":"admin","password":"***"}).encode(),headers={"Content-Type":"application/json"},method='POST')
try:
  with urllib.request.urlopen(req,context=ctx,timeout=40) as r:
    print(r.headers.get('X-Current-Token') or r.headers.get('x-current-token') or '')
    body=r.read().decode()
    try:
      j=json.loads(body)
      print(j.get('token') or j.get('access_token') or '', end='')
    except: pass
except Exception as e:
  print('', end='')
PY
)
# cookie jar login
rm -f /tmp/svcookie
curl -sk -c /tmp/svcookie -o /tmp/login2.txt -w 'login2=%{http_code}\n' --max-time 45 \
  -H 'Content-Type: application/json' \
  -d "{\"user\":\"admin\",\"password\":\"$ADMIN_PW\"}" https://127.0.0.1:8971/api/login
START=$(date +%s%3N)
curl -sk -b /tmp/svcookie -o /tmp/stats.json -w 'stats=%{http_code} time=%{time_total}\n' --max-time 60 https://127.0.0.1:8971/api/stats
END=$(date +%s%3N)
echo "stats_wall_ms=$((END-START))"
python3 - <<'PY' 2>/dev/null || echo stats_parse_fail
import json
try:
  d=json.load(open('/tmp/stats.json'))
except Exception as e:
  print('stats_json_err',e); raise SystemExit
cams=d.get('cameras') or {}
fps_pos=sum(1 for v in cams.values() if isinstance(v,dict) and float(v.get('camera_fps') or 0)>0)
fps_zero=sum(1 for v in cams.values() if isinstance(v,dict) and float(v.get('camera_fps') or 0)==0)
print(f"stats_cameras={len(cams)} fps_gt0={fps_pos} fps_eq0={fps_zero}")
det=d.get('detectors') or {}
print('detectors', {k:(v.get('inference_speed') if isinstance(v,dict) else v) for k,v in list(det.items())[:5]})
svc=d.get('service') or {}
print('version', svc.get('version'), 'uptime', svc.get('uptime'))
PY

echo "--- go2rtc producers with bytes (sample) ---"
curl -sk --max-time 20 http://127.0.0.1:1984/api/streams -o /tmp/g2.json
python3 - <<'PY' 2>/dev/null || echo g2_fail
import json
d=json.load(open('/tmp/g2.json'))
live=0; total=0
for name,st in d.items():
  total+=1
  prods=st.get('producers') or []
  br=sum(int(p.get('bytes_recv') or 0) for p in prods if isinstance(p,dict))
  if br>0: live+=1
print(f"go2rtc_streams={total} with_bytes_recv={live}")
# count _1 only
live1=0; tot1=0
for name,st in d.items():
  if not name.endswith('_1'): continue
  tot1+=1
  prods=st.get('producers') or []
  br=sum(int(p.get('bytes_recv') or 0) for p in prods if isinstance(p,dict))
  if br>0: live1+=1
print(f"go2rtc_suffix_1={tot1} with_bytes={live1}")
PY

echo "AUDIT_DONE $HOST_LABEL"
cat "$OUT"
