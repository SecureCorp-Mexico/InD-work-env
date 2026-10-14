#!/usr/bin/env python3
"""Idempotent CT103 patch: Alarmas panel search bar (v55).

Web-only. Anchored/idempotent. Safe to re-run.
Build: v55-alarms-search-20260811
"""
from __future__ import annotations

import hashlib
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path("/opt/securevu-map-src")
BUILD = "v55-alarms-search-20260811"
SW = "svmap-shell-v55-alarms-search"

SEARCH_HTML = """    <div id="alarm-search-wrap">
      <input type="search" id="alarm-search" placeholder="Buscar por PMI, tipo, ticket…" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-label="Buscar alarmas" />
      <button type="button" id="alarm-search-clear" class="hidden" title="Limpiar" aria-label="Limpiar búsqueda">×</button>
    </div>
"""


def md5(p: pathlib.Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new.strip() and new in text and old not in text:
        print(f"  SKIP {label} (already present)")
        return text
    if old not in text:
        if new in text:
            print(f"  SKIP {label} (already present)")
            return text
        raise SystemExit(f"ANCHOR MISS {label}")
    return text.replace(old, new, 1)


def patch_html(path: pathlib.Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text
    if 'id="alarm-search"' in text:
        print(f"  SKIP {path.name} search input (already present)")
    else:
        # Insert search wrap just before alarm-list (works for index + notifications)
        old = '    <div id="alarm-list"></div>'
        new = SEARCH_HTML + old
        if old not in text:
            raise SystemExit(f"ANCHOR MISS {path.name} alarm-list")
        text = text.replace(old, new, 1)
        print(f"  OK {path.name} search wrap")

    if text != orig:
        path.write_text(text, encoding="utf-8")
        print(f"  WROTE {path} md5={md5(path)}")
        return True
    print(f"  UNCHANGED {path}")
    return False


def patch_style(path: pathlib.Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text
    css = """
/* Alarmas panel search */
#alarm-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--surface);
}
#alarm-search {
  width: 100%;
  background: var(--surface-muted, #111827);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 28px 7px 10px;
  font: inherit;
  font-size: 13px;
  min-width: 0;
}
#alarm-search:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(79, 70, 229, .14);
}
#alarm-search::placeholder { color: var(--muted, #94a3b8); }
#alarm-search::-webkit-search-cancel-button,
#alarm-search::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
}
#alarm-search-clear {
  position: absolute;
  right: 18px;
  background: none;
  border: none;
  color: var(--muted, #94a3b8);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 4px;
}
#alarm-search-clear:hover { color: var(--text); }
#alarm-search-clear.hidden { display: none; }
body.notifications-page #alarm-search-wrap {
  background: var(--surface);
}
"""
    if "#alarm-search-wrap" in text:
        print("  SKIP style.css alarm-search (already present)")
    else:
        anchor = "#alarm-list { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }"
        if anchor not in text:
            raise SystemExit("ANCHOR MISS style.css #alarm-list")
        text = text.replace(anchor, css + "\n" + anchor, 1)
        print("  OK style.css alarm-search")

    if text != orig:
        path.write_text(text, encoding="utf-8")
        print(f"  WROTE {path} md5={md5(path)}")
        return True
    print(f"  UNCHANGED {path}")
    return False


ALARMS_JS_HELPERS = r'''
/** Fold accents + lowercase for operator-friendly search. */
function foldText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** Build searchable haystack for one alarm (PMI, tipo, ticket, cámara/ext, fechas, notas). */
function alarmSearchBlob(a) {
  const statusEs = a.status === 'active' ? 'activa' : a.status === 'ack' ? 'reconocida' : a.status === 'resolved' ? 'resuelta' : a.status;
  const parts = [
    a.id, a.tower, a.device_name, a.type, TYPE_ES[a.type] || '',
    a.ticket_id, a.ticket_url,
    a.video_camera, a.video_server, a.video_name,
    a.status, statusEs,
    a.count,
    a.first_at, a.last_at, fmt(a.first_at), fmt(a.last_at),
  ];
  for (const x of (a.actions || [])) {
    parts.push(x.note, x.user, x.action, ACTION_ES[x.action] || '', x.at, fmt(x.at));
  }
  return foldText(parts.filter(v => v != null && v !== '').join(' '));
}

function alarmMatchesQuery(a, rawQuery) {
  const q = foldText(rawQuery).trim();
  if (!q) return true;
  const hay = alarmSearchBlob(a);
  return q.split(/\s+/).filter(Boolean).every(tok => hay.includes(tok));
}

function syncAlarmSearchClear() {
  if (!searchClearBtn || !searchInput) return;
  const has = !!(searchInput.value || '').trim();
  searchClearBtn.classList.toggle('hidden', !has);
}

function clearAlarmSearch() {
  if (!searchInput) return;
  searchInput.value = '';
  searchQuery = '';
  syncAlarmSearchClear();
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
  paintAlarmList(null, true);
}

function scheduleAlarmSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQuery = searchInput?.value || '';
    syncAlarmSearchClear();
    paintAlarmList(null, true);
  }, 200);
}

'''

ALARMS_JS_VARS = """let filterSel = null;
let popoutHint = null;
let soundToggle = null;
let bc = null;
"""

ALARMS_JS_VARS_NEW = """let filterSel = null;
let popoutHint = null;
let soundToggle = null;
let bc = null;
let searchInput = null;
let searchClearBtn = null;
/** Raw query from #alarm-search (client-side filter of listCache). */
let searchQuery = '';
let searchTimer = null;
/** Last fetched list for the current status filter (pre-search). */
let listCache = [];
"""


def patch_alarms_js(path: pathlib.Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text

    text = replace_once(text, ALARMS_JS_VARS, ALARMS_JS_VARS_NEW, "alarms.js search vars")

    # Insert helpers before bindUi
    if "function alarmMatchesQuery(" in text:
        print("  SKIP alarms.js helpers (already present)")
    else:
        anchor = "function bindUi() {"
        if anchor not in text:
            raise SystemExit("ANCHOR MISS alarms.js bindUi")
        text = text.replace(anchor, ALARMS_JS_HELPERS + anchor, 1)
        print("  OK alarms.js helpers")

    # Wire search in bindUi
    old_bind = """  filterSel?.addEventListener('change', () => renderList());

  document.getElementById('alarm-popout')?.addEventListener('click', openPopout);"""
    new_bind = """  filterSel?.addEventListener('change', () => renderList());

  searchInput = document.getElementById('alarm-search');
  searchClearBtn = document.getElementById('alarm-search-clear');
  searchInput?.addEventListener('input', scheduleAlarmSearch);
  searchInput?.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      clearAlarmSearch();
    }
  });
  searchClearBtn?.addEventListener('click', () => {
    clearAlarmSearch();
    searchInput?.focus();
  });
  syncAlarmSearchClear();

  document.getElementById('alarm-popout')?.addEventListener('click', openPopout);"""
    text = replace_once(text, old_bind, new_bind, "alarms.js bind search")

    # focusAlarm: clear search so deep-link / marker focus is visible
    old_focus = """export async function focusAlarm(idOrIds) {
  if (!drawer || !filterSel) return;
  showRightDrawer('alarm-drawer');
  // El marcador sólo muestra alarmas no resueltas; garantiza que el filtro la incluya.
  if (filterSel.value === 'resolved') filterSel.value = 'open';
  await renderList(idOrIds);
}"""
    new_focus = """export async function focusAlarm(idOrIds) {
  if (!drawer || !filterSel) return;
  showRightDrawer('alarm-drawer');
  // El marcador sólo muestra alarmas no resueltas; garantiza que el filtro la incluya.
  if (filterSel.value === 'resolved') filterSel.value = 'open';
  // Deep-link / marker focus must not be hidden by an active search.
  if (searchInput && (searchInput.value || '').trim()) {
    searchInput.value = '';
    searchQuery = '';
    syncAlarmSearchClear();
  }
  await renderList(idOrIds);
}"""
    text = replace_once(text, old_focus, new_focus, "alarms.js focusAlarm clear search")

    # Split renderList into fetch + paint with client filter
    old_render = """async function renderList(highlightId, keepScroll) {
  if (!listEl || !filterSel) return;
  const status = filterSel.value;
  const prevScroll = keepScroll ? listEl.scrollTop : 0;
  if (!keepScroll || !listEl.children.length) listEl.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    const { alarms } = await api(`/api/alarms?status=${status}&limit=200`);
    if (!alarms.length) { listEl.innerHTML = '<p class="muted">Sin alarmas.</p>'; return; }
    listEl.innerHTML = '';
    for (const a of alarms) listEl.appendChild(card(a));
    if (highlightId != null) {
      const ids = Array.isArray(highlightId) ? highlightId : [highlightId];
      let first = true;
      for (const id of ids) {
        const sel = listEl.querySelector(`.alarm-card[data-id="${id}"]`);
        if (!sel) continue;
        if (first) { sel.scrollIntoView({ block: 'center', behavior: 'smooth' }); first = false; }
        sel.classList.remove('flash');
        void sel.offsetWidth;
        sel.classList.add('flash');
      }
    } else if (keepScroll) {
      listEl.scrollTop = prevScroll;
    }
  } catch (err) {
    listEl.innerHTML = `<p class="muted">Error: ${err.message}</p>`;
  }
}"""
    new_render = """async function renderList(highlightId, keepScroll) {
  if (!listEl || !filterSel) return;
  const status = filterSel.value;
  const prevScroll = keepScroll ? listEl.scrollTop : 0;
  if (!keepScroll || !listEl.children.length) listEl.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    const { alarms } = await api(`/api/alarms?status=${status}&limit=200`);
    listCache = alarms || [];
    paintAlarmList(highlightId, keepScroll, prevScroll);
  } catch (err) {
    listEl.innerHTML = `<p class="muted">Error: ${err.message}</p>`;
  }
}

/** Paint listCache filtered by #alarm-search (no network). */
function paintAlarmList(highlightId, keepScroll, prevScroll) {
  if (!listEl) return;
  const scroll = prevScroll != null ? prevScroll : (keepScroll ? listEl.scrollTop : 0);
  if (!listCache.length) {
    listEl.innerHTML = '<p class="muted">Sin alarmas.</p>';
    return;
  }
  const q = searchQuery || searchInput?.value || '';
  const filtered = listCache.filter(a => alarmMatchesQuery(a, q));
  if (!filtered.length) {
    listEl.innerHTML = '<p class="muted">Sin resultados.</p>';
    return;
  }
  listEl.innerHTML = '';
  for (const a of filtered) listEl.appendChild(card(a));
  if (highlightId != null) {
    const ids = Array.isArray(highlightId) ? highlightId : [highlightId];
    let first = true;
    for (const id of ids) {
      const sel = listEl.querySelector(`.alarm-card[data-id="${id}"]`);
      if (!sel) continue;
      if (first) { sel.scrollIntoView({ block: 'center', behavior: 'smooth' }); first = false; }
      sel.classList.remove('flash');
      void sel.offsetWidth;
      sel.classList.add('flash');
    }
  } else if (keepScroll) {
    listEl.scrollTop = scroll;
  }
}"""
    text = replace_once(text, old_render, new_render, "alarms.js renderList+paint")

    if text != orig:
        path.write_text(text, encoding="utf-8")
        print(f"  WROTE {path} md5={md5(path)}")
        return True
    print(f"  UNCHANGED {path}")
    return False


def bump_build(index_html: pathlib.Path, sw_js: pathlib.Path) -> bool:
    changed = False
    html = index_html.read_text(encoding="utf-8")
    html2, n = re.subn(
        r'<meta name="svmap-build" content="[^"]*" />',
        f'<meta name="svmap-build" content="{BUILD}" />',
        html,
        count=1,
    )
    if n != 1:
        raise SystemExit("ANCHOR MISS index.html svmap-build")
    if html2 != html:
        index_html.write_text(html2, encoding="utf-8")
        print(f"  WROTE index.html → {BUILD}")
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
        print(f"  WROTE sw.js → {SW}")
        changed = True
    else:
        print(f"  SKIP sw.js already {SW}")
    return changed


def main() -> int:
    print(f"=== patch {BUILD} ===")
    files = {
        "alarms": ROOT / "app/src/alarms.js",
        "style": ROOT / "app/src/style.css",
        "index": ROOT / "app/index.html",
        "notif": ROOT / "app/notifications.html",
        "sw": ROOT / "app/public/sw.js",
    }
    for k, p in files.items():
        if not p.exists():
            raise SystemExit(f"missing {p}")
        print(f"  pre {k}: {md5(p)}")

    # Guard: SOS synthesis from v54 must still be present
    intercom = (ROOT / "app/src/intercom.js").read_text(encoding="utf-8")
    if "raiseSosFromIncoming" not in intercom:
        raise SystemExit("ABORT: v54 raiseSosFromIncoming missing — rebase conflict?")
    alarms_srv = (ROOT / "server/alarms.mjs").read_text(encoding="utf-8")
    if "raiseIntercomSos" not in alarms_srv:
        raise SystemExit("ABORT: v54 raiseIntercomSos missing — rebase conflict?")

    patch_html(files["index"])
    patch_html(files["notif"])
    patch_style(files["style"])
    patch_alarms_js(files["alarms"])
    bump_build(files["index"], files["sw"])

    print("=== post md5 ===")
    for k, p in files.items():
        print(f"  post {k}: {md5(p)}")

    r = subprocess.run(["node", "--check", str(files["alarms"])], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr)
        raise SystemExit("syntax fail alarms.js")
    print("  syntax OK alarms.js")
    print("DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
