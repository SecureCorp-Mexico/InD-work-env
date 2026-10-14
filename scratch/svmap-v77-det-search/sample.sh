#!/bin/bash
# Saca una muestra real de events.db (últimas 24 h) con los MISMOS campos que
# /api/detections entrega a la UI, para probar el filtro contra datos de verdad.
docker exec securevu-map-src-api-1 node -e '
const Database = require("better-sqlite3");
const db = new Database("/data/events.db", { readonly: true });
const cutoff = Date.now()/1000 - 24*3600;
const rows = db.prepare("SELECT * FROM events WHERE start_time >= ? ORDER BY start_time DESC LIMIT 80").all(cutoff);
const iso = t => t == null ? null : new Date(t*1000).toLocaleString("sv-SE", { timeZone: "America/Mexico_City" });
function eventPriority(row) {
  const label = String(row.label || "").toLowerCase();
  const score = row.score == null ? null : Number(row.score);
  let zones = row.zones; if (typeof zones === "string") { try { zones = JSON.parse(zones); } catch { zones = []; } }
  if (!Array.isArray(zones)) zones = [];
  const inZone = zones.length > 0;
  if (label === "license_plate" || label === "lpr") return { priority:"medium", priorityLabel:"Media", kind:"lpr" };
  if (label === "person" && inZone) return { priority:"high", priorityLabel:"Alta", kind:"person_zone" };
  if (label === "person" && score != null && score >= 0.85) return { priority:"high", priorityLabel:"Alta", kind:"person_hi" };
  if (["person","car","truck","bus","motorcycle","bicycle"].includes(label)) { if (score == null || score >= 0.5) return { priority:"medium", priorityLabel:"Media", kind:label }; }
  if (score != null && score >= 0.85 && ["car","truck","bus"].includes(label)) return { priority:"high", priorityLabel:"Alta", kind:label };
  return { priority:"low", priorityLabel:"Baja", kind: label || "other" };
}
const out = rows.map(r => {
  const zones = JSON.parse(r.zones || "[]");
  return { id:r.id, server:r.server, camera:r.camera, label:r.label, sub_label:r.sub_label,
    score:r.score, start_time:iso(r.start_time), zones,
    duration_s: r.end_time && r.start_time ? Math.round(r.end_time - r.start_time) : null,
    ...eventPriority({ ...r, zones }) };
});
console.log(JSON.stringify(out));
'
