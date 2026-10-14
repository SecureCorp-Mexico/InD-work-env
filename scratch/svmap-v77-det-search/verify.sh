#!/bin/bash
# Verificación post-deploy v77 (Detecciones search) — se ejecuta DENTRO de CT103.
cd /opt/securevu-map-src || exit 1
H='Host: mh.map.secure.vu'
c() { curl -sk -H "$H" "$@"; }

echo "== HTTP status"
for p in / /detections.html /notifications.html /detection-video.html /sw.js; do
  printf '   %-24s %s\n' "$p" "$(curl -sk -o /dev/null -w '%{http_code}' -H "$H" "https://127.0.0.1$p")"
done

echo "== build meta / SW"
c https://127.0.0.1/ | grep -o 'svmap-build" content="[^"]*"'
c https://127.0.0.1/sw.js | grep -m1 CACHE

echo "== markup counts (det-search / alarm-search)"
printf '   /                 det-search=%s alarm-search=%s\n' "$(c https://127.0.0.1/ | grep -c det-search)" "$(c https://127.0.0.1/ | grep -c alarm-search)"
printf '   /detections.html  det-search=%s\n' "$(c https://127.0.0.1/detections.html | grep -c det-search)"
printf '   /notifications    alarm-search=%s\n' "$(c https://127.0.0.1/notifications.html | grep -c alarm-search)"

echo "== chunks servidos"
docker exec securevu-map-src-web-1 ls /usr/share/nginx/html/assets \
  | grep -E '^(detections|detections-page|panels|alarms|main|style|api|detection-video)' | sort | sed 's/^/   /'

echo "== contenido del chunk minificado de detecciones"
for f in $(docker exec securevu-map-src-web-1 ls /usr/share/nginx/html/assets | grep -E '^detections-'); do
  echo "   --- $f"
  for needle in det-search det-search-clear 'Sin resultados' normalize NFD Escape 'Buscar por PMI'; do
    n=$(c "https://127.0.0.1/assets/$f" | grep -o "$needle" | wc -l | tr -d ' ')
    printf '       %-20s %s\n' "$needle" "$n"
  done
  printf '       %-20s %s\n' 'IP-en-blob(172.20)' "$(c "https://127.0.0.1/assets/$f" | grep -o 'data-server' | wc -l | tr -d ' ')"
done

echo "== CSS servido"
for f in $(docker exec securevu-map-src-web-1 ls /usr/share/nginx/html/assets | grep -E '\.css$'); do
  printf '   %-28s #det-search=%s #alarm-search=%s data-right-rail=%s\n' "$f" \
    "$(c "https://127.0.0.1/assets/$f" | grep -o '#det-search' | wc -l | tr -d ' ')" \
    "$(c "https://127.0.0.1/assets/$f" | grep -o '#alarm-search' | wc -l | tr -d ' ')" \
    "$(c "https://127.0.0.1/assets/$f" | grep -o 'data-right-rail' | wc -l | tr -d ' ')"
done

echo "== invariantes que NO debían romperse (chunks)"
for f in $(docker exec securevu-map-src-web-1 ls /usr/share/nginx/html/assets | grep -E '^(panels|alarms|main)-.*\.js$'); do
  printf '   %-26s RIGHT_RAIL=%s alarmSearch=%s EventSource=%s Actividad=%s\n' "$f" \
    "$(c "https://127.0.0.1/assets/$f" | grep -o 'alarm-drawer' | wc -l | tr -d ' ')" \
    "$(c "https://127.0.0.1/assets/$f" | grep -o 'alarm-search' | wc -l | tr -d ' ')" \
    "$(c "https://127.0.0.1/assets/$f" | grep -o 'EventSource' | wc -l | tr -d ' ')" \
    "$(c "https://127.0.0.1/assets/$f" | grep -o 'Actividad' | wc -l | tr -d ' ')"
done

echo "== md5 fuentes (las que NO debí tocar)"
md5sum app/src/panels.js app/src/alarms.js server/index.mjs server/events.mjs | sed 's/^/   /'

echo "== contenedores"
docker ps --format '   {{.Names}} {{.Status}}'
