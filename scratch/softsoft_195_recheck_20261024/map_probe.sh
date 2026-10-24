#!/bin/bash
# Run on Map CT103
set -u
echo "=== map stamp ==="
grep -o 'svmap-shell-v[^"]*' /opt/camera-map/web/index.html 2>/dev/null | head -1 || true
ls /opt/camera-map 2>/dev/null | head -5

echo "=== .195 :8972 health ==="
curl -s --max-time 5 http://172.20.0.195:8972/health; echo
curl -s --max-time 5 http://172.20.0.195:8972/; echo

echo "=== discover :8972 paths ==="
for p in / /health /api/health /openapi.json /docs /coverage /api/coverage /summary /api/summary /disk /api/disk; do
  code=$(curl -s -o /tmp/mbody -w '%{http_code}' --max-time 4 "http://172.20.0.195:8972$p" || echo ERR)
  echo "$p -> $code $(head -c 120 /tmp/mbody | tr '\n' ' ')"
done

# Find how map calls disk summary
echo "=== map code hints ==="
grep -RIn '8972\|disk-summary\|diskSummary\|coverage' /opt/camera-map --include='*.js' --include='*.mjs' --include='*.ts' 2>/dev/null | head -40

echo "=== probe known streams via likely API ==="
STREAMS="i150200700_651_bullet i150200700_654_bullet i150200700_670_bullet i150200700_690_ptz i150200700_710_bullet i150200700_730_bullet"
# also peer for comparison
STREAMS="$STREAMS i150200700_557_1_22_bullet i150200700_579_2_24_bullet"
for s in $STREAMS; do
  for u in \
    "http://172.20.0.195:8972/api/recording/summary?camera=$s&hours=6" \
    "http://172.20.0.195:8972/summary?camera=$s&hours=6" \
    "http://172.20.0.195:8972/coverage?camera=$s&hours=6" \
    "http://172.20.0.144:8972/summary?camera=$s&hours=6" \
    "http://172.20.0.146:8972/summary?camera=$s&hours=6"
  do
    code=$(curl -s -o /tmp/mbody -w '%{http_code}' --max-time 8 "$u" || echo ERR)
    if [ "$code" = "200" ]; then
      echo "OK $u $(head -c 350 /tmp/mbody | tr '\n' ' ')"
      break
    fi
  done
done
