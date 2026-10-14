#!/usr/bin/env python3
"""Idempotent CT103 patch: Fanvil inbound INVITE → SOS alarm in Alarmas panel.

Build: v54-intercom-sos-alarm-20260811
Safe to re-run. Anchored on unique strings; no-ops if already applied.
"""
from __future__ import annotations

import hashlib
import pathlib
import sys

ROOT = pathlib.Path("/opt/securevu-map-src")
BUILD = "v54-intercom-sos-alarm-20260811"
SW = "svmap-shell-v54-intercom-sos-alarm"


def md5(p: pathlib.Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new.strip() and new in text:
        print(f"  SKIP {label} (already present)")
        return text
    if old not in text:
        raise SystemExit(f"ANCHOR MISS {label}: expected snippet not found")
    return text.replace(old, new, 1)


def patch_alarms_mjs(path: pathlib.Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text

    # 1) Tower-aware dedupe inside ingest() so SecureTrax ↔ intercom don't double
    old_open = """  // Agrega en la alarma abierta (no resuelta) más reciente del mismo equipo+tipo
  const open = db.prepare(
    `SELECT * FROM alarms WHERE device_id IS ? AND type=? AND status!='resolved' ORDER BY last_ts DESC LIMIT 1`
  ).get(deviceId, type);

  if (open) {"""
    new_open = """  // Agrega en la alarma abierta (no resuelta) más reciente del mismo equipo+tipo.
  // También dedupea por torre+tipo para no duplicar si el SOS ya llegó vía
  // intercom Fanvil (u otro device_id del mismo PMI).
  let open = db.prepare(
    `SELECT * FROM alarms WHERE device_id IS ? AND type=? AND status!='resolved' ORDER BY last_ts DESC LIMIT 1`
  ).get(deviceId, type);
  if (!open && tower) {
    open = db.prepare(
      `SELECT * FROM alarms WHERE tower=? AND type=? AND status!='resolved' ORDER BY last_ts DESC LIMIT 1`
    ).get(tower, type);
  }

  if (open) {"""
    text = replace_once(text, old_open, new_open, "alarms.mjs ingest tower-dedupe")

    # 2) Export raiseIntercomSos before alarmCounts (end of file exports)
    marker = "export function alarmCounts() {"
    raise_fn = r'''/** Synthetic Stable device_id for Fanvil intercom SOS (negative; avoids Traccar ids). */
function intercomDeviceId(extension) {
  const n = Number(String(extension || '').replace(/\D/g, ''));
  if (Number.isFinite(n) && n > 0) return -(900_000_000 + n);
  let h = 0;
  for (const c of String(extension || '')) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return -(800_000_000 + (Math.abs(h) % 99_999_999));
}

/**
 * Raise (or bump) an SOS alarm from an inbound Fanvil intercom INVITE.
 * Dedupes against any open SOS on the same tower (SecureTrax or prior intercom).
 */
export function raiseIntercomSos({ extension, grupo, pmi, user = 'sistema' } = {}) {
  if (!db) return { error: 'alarms no inicializado' };
  const ext = String(extension || '').trim();
  let tower = String(grupo || '').trim() || null;
  let pmiNum = pmi != null ? String(pmi).replace(/\D/g, '') : '';
  if (!tower && pmiNum) tower = `I150200700-${pmiNum}`;
  if (!tower) return { error: 'sin PMI/grupo' };
  if (!pmiNum) {
    const m = TOWER_RE.exec(tower);
    if (m) pmiNum = m[1];
  }
  const type = 'sos';
  const ts = Math.floor(Date.now() / 1000);
  const deviceId = intercomDeviceId(ext || pmiNum || tower);
  const deviceName = ext ? `Fanvil/${ext}` : `intercom/${tower}`;

  const result = db.transaction(() => {
    let open = db.prepare(
      `SELECT * FROM alarms WHERE type=? AND status!='resolved' AND tower=? ORDER BY last_ts DESC LIMIT 1`
    ).get(type, tower);
    if (!open) {
      open = db.prepare(
        `SELECT * FROM alarms WHERE device_id IS ? AND type=? AND status!='resolved' ORDER BY last_ts DESC LIMIT 1`
      ).get(deviceId, type);
    }
    if (open) {
      db.prepare('UPDATE alarms SET last_ts=?, count=count+1 WHERE id=?').run(ts, open.id);
      db.prepare(`INSERT INTO alarm_actions(alarm_id,ts,"user",action,note) VALUES(?,?,?,?,?)`)
        .run(open.id, ts, user || 'sistema', 'note',
          `SOS intercom (Fanvil${ext ? ' ext ' + ext : ''}) — repetición`);
      noteRepeat(open.id, ts);
      return { created: false, id: open.id };
    }
    const r = db.prepare(`INSERT INTO alarms(device_id,device_name,tower,type,status,first_ts,last_ts,count,lat,lng)
      VALUES(?,?,?,?, 'active', ?,?,1,?,?)`).run(deviceId, deviceName, tower, type, ts, ts, null, null);
    const id = r.lastInsertRowid;
    db.prepare(`INSERT INTO alarm_actions(alarm_id,ts,"user",action,note) VALUES(?,?,?,?,?)`)
      .run(id, ts, user || 'sistema', 'created',
        `SOS intercom Fanvil${ext ? ' ext ' + ext : ''} en ${tower}`);
    return { created: true, id };
  })();

  if (result.created) {
    log(`[alarms] NUEVA sos · ${tower} (intercom ${ext || '—'})`);
    fileTicket(result.id);
    scheduleAlarmVideo(result.id, 45_000);
  } else {
    log(`[alarms] bump sos · ${tower} (intercom ${ext || '—'}) id=${result.id}`);
  }
  return { created: !!result.created, alarm: withActions(db.prepare('SELECT * FROM alarms WHERE id=?').get(result.id)) };
}

'''
    if "export function raiseIntercomSos(" in text:
        print("  SKIP alarms.mjs raiseIntercomSos (already present)")
    else:
        if marker not in text:
            raise SystemExit("ANCHOR MISS alarms.mjs alarmCounts")
        text = text.replace(marker, raise_fn + marker, 1)
        print("  OK alarms.mjs raiseIntercomSos")

    if text != orig:
        path.write_text(text, encoding="utf-8")
        print(f"  WROTE {path} md5={md5(path)}")
        return True
    print(f"  UNCHANGED {path}")
    return False


def patch_index_mjs(path: pathlib.Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text

    old_imp = "import { initAlarms, listAlarms, actOnAlarm, alarmCounts, integrationStatus, getAlarm } from './alarms.mjs';"
    new_imp = "import { initAlarms, listAlarms, actOnAlarm, alarmCounts, integrationStatus, getAlarm, raiseIntercomSos } from './alarms.mjs';"
    text = replace_once(text, old_imp, new_imp, "index.mjs import raiseIntercomSos")

    route = r'''
// SOS desde intercom Fanvil (INVITE entrante PMI → Alarmas panel).
// Dedup server-side vs SecureTrax open SOS on the same tower.
app.post('/api/alarms/intercom-sos', auth(), (req, res) => {
  const body = req.body || {};
  const extension = String(body.extension || '').trim();
  let grupo = body.grupo ? String(body.grupo).trim() : '';
  let pmi = body.pmi != null ? String(body.pmi).replace(/\D/g, '') : '';

  if (extension) {
    const hit = lookupByExtension(DATA_DIR, extension);
    if (!hit) return res.status(404).json({ error: 'extensión no es un intercom PMI conocido' });
    grupo = hit.grupo || grupo;
    pmi = hit.pmi != null ? String(hit.pmi) : pmi;
  } else if (!grupo && !pmi) {
    return res.status(400).json({ error: 'falta extension o PMI' });
  }

  const tower = grupo || (pmi ? `I150200700-${pmi}` : '');
  const camSet = userAcl(req.userRec);
  if (camSet && tower && !grupoAllowed(tower, camSet, cameraAclIndex())) {
    return res.status(403).json({ error: 'PMI fuera de tu alcance' });
  }

  const r = raiseIntercomSos({
    extension, grupo: tower || grupo, pmi, user: req.user.u,
  });
  if (r.error) return res.status(400).json(r);
  auditLog(req, 'alarm.intercom_sos', {
    alarmId: r.alarm?.id, created: !!r.created,
    extension: extension || null, grupo: tower || null, pmi: pmi || null,
  });
  res.json(r);
});

'''
    anchor = "app.get('/api/alarms', auth(), (req, res) => {"
    if "/api/alarms/intercom-sos" in text:
        print("  SKIP index.mjs intercom-sos route (already present)")
    else:
        if anchor not in text:
            raise SystemExit("ANCHOR MISS index.mjs GET /api/alarms")
        text = text.replace(anchor, route + anchor, 1)
        print("  OK index.mjs POST /api/alarms/intercom-sos")

    if text != orig:
        path.write_text(text, encoding="utf-8")
        print(f"  WROTE {path} md5={md5(path)}")
        return True
    print(f"  UNCHANGED {path}")
    return False


def patch_intercom_js(path: pathlib.Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text

    helper = r'''
/** Raise SOS in Alarmas when an inbound Fanvil INVITE maps to a known PMI. Once per session. */
function raiseSosFromIncoming(s, info) {
  if (!s || s.__svSosRaised) return;
  if (!info?.grupo && !info?.pmi) return; // only known PMI Fanvil extensions
  s.__svSosRaised = true;
  const body = {
    extension: info.extension || null,
    grupo: info.grupo || null,
    pmi: info.pmi || null,
  };
  api('/api/alarms/intercom-sos', { method: 'POST', body: JSON.stringify(body) })
    .then(r => {
      audit('alarm.intercom_sos', {
        alarmId: r?.alarm?.id || null,
        created: !!r?.created,
        callerExtension: body.extension,
        grupo: body.grupo,
        pmi: body.pmi,
      });
    })
    .catch(err => {
      // Non-fatal: Contestar/audio must still work even if alarm create fails.
      console.warn('[intercom] SOS alarm raise failed', err?.message || err);
    });
}

'''
    if "function raiseSosFromIncoming(" in text:
        print("  SKIP intercom.js raiseSosFromIncoming (already present)")
    else:
        anchor = "async function enrichCaller(extension) {"
        if anchor not in text:
            raise SystemExit("ANCHOR MISS intercom.js enrichCaller")
        text = text.replace(anchor, helper + anchor, 1)
        print("  OK intercom.js raiseSosFromIncoming")

    # Call after enrich succeeds (inside the .then)
    old_enrich = """    enrichCaller(callerExt).then(info => {
      if (session !== s || state.status !== 'ringing') return;
      callCtx = {
        direction: 'inbound',
        callerExtension: info.extension,
        destinationExtension: sess.extension,
        grupo: info.grupo,
        pmi: info.pmi,
      };
      setState({
        status: 'ringing',
        detail: `Entrante · ${info.label}`,
        extension: sess.extension,
        incoming: info,
      });
    });"""
    new_enrich = """    enrichCaller(callerExt).then(info => {
      if (session !== s || state.status !== 'ringing') return;
      callCtx = {
        direction: 'inbound',
        callerExtension: info.extension,
        destinationExtension: sess.extension,
        grupo: info.grupo,
        pmi: info.pmi,
      };
      setState({
        status: 'ringing',
        detail: `Entrante · ${info.label}`,
        extension: sess.extension,
        incoming: info,
      });
      raiseSosFromIncoming(s, info);
    });"""
    text = replace_once(text, old_enrich, new_enrich, "intercom.js call raiseSosFromIncoming")

    if text != orig:
        path.write_text(text, encoding="utf-8")
        print(f"  WROTE {path} md5={md5(path)}")
        return True
    print(f"  UNCHANGED {path}")
    return False


def patch_audit_mjs(path: pathlib.Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text
    old = "  'intercom.incoming',\n"
    new = "  'intercom.incoming',\n  'alarm.intercom_sos',\n"
    if "'alarm.intercom_sos'" in text:
        print("  SKIP audit.mjs alarm.intercom_sos (already present)")
    else:
        text = replace_once(text, old, new, "audit.mjs CLIENT_ACTIONS")
    if text != orig:
        path.write_text(text, encoding="utf-8")
        print(f"  WROTE {path} md5={md5(path)}")
        return True
    print(f"  UNCHANGED {path}")
    return False


def bump_build(index_html: pathlib.Path, sw_js: pathlib.Path) -> bool:
    changed = False
    html = index_html.read_text(encoding="utf-8")
    # Replace whatever current build meta is
    import re
    html2, n = re.subn(
        r'<meta name="svmap-build" content="[^"]*" />',
        f'<meta name="svmap-build" content="{BUILD}" />',
        html,
        count=1,
    )
    if n != 1:
        raise SystemExit("ANCHOR MISS index.html svmap-build meta")
    if html2 != html:
        index_html.write_text(html2, encoding="utf-8")
        print(f"  WROTE {index_html} → {BUILD}")
        changed = True
    else:
        print(f"  SKIP index.html already {BUILD}")

    sw = sw_js.read_text(encoding="utf-8")
    sw2, n = re.subn(
        r"const CACHE = 'svmap-shell-[^']+';",
        f"const CACHE = '{SW}';",
        sw,
        count=1,
    )
    if n != 1:
        raise SystemExit("ANCHOR MISS sw.js CACHE")
    if sw2 != sw:
        sw_js.write_text(sw2, encoding="utf-8")
        print(f"  WROTE {sw_js} → {SW}")
        changed = True
    else:
        print(f"  SKIP sw.js already {SW}")
    return changed


def main() -> int:
    print(f"=== patch {BUILD} ===")
    files = {
        "alarms": ROOT / "server/alarms.mjs",
        "index": ROOT / "server/index.mjs",
        "intercom": ROOT / "app/src/intercom.js",
        "audit": ROOT / "server/audit.mjs",
        "html": ROOT / "app/index.html",
        "sw": ROOT / "app/public/sw.js",
    }
    for k, p in files.items():
        if not p.exists():
            raise SystemExit(f"missing {p}")
        print(f"  pre {k}: {md5(p)} {p}")

    patch_alarms_mjs(files["alarms"])
    patch_index_mjs(files["index"])
    patch_intercom_js(files["intercom"])
    patch_audit_mjs(files["audit"])
    bump_build(files["html"], files["sw"])

    print("=== post md5 ===")
    for k, p in files.items():
        print(f"  post {k}: {md5(p)}")

    # Syntax check node files
    import subprocess
    for p in (files["alarms"], files["index"], files["intercom"], files["audit"]):
        r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stderr)
            raise SystemExit(f"syntax fail {p}")
        print(f"  syntax OK {p.name}")
    print("DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
