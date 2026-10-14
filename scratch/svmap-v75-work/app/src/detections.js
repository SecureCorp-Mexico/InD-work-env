/** Detecciones SecureVu (MQTT events.db): panel junto a Alarmas + ventana pop-out. */
import { api, audit } from './api.js';
import { showRightDrawer, isRightDrawerOpen } from './panels.js';

const POPOUT_NAME = 'securevu-detections';
const CLIP_FEATURES = 'width=960,height=680,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=no';
const POPOUT_FEATURES = 'width=440,height=760,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes';
const BC_NAME = 'securevu-detections';
/** Ventana con nombre para reutilizar el mapa desde el pop-out (igual que Alarmas). */
const MAP_WINDOW_NAME = 'securevu-map';

/**
 * Nombres amigables (es-MX) sólo para UI. Los value/API siguen en inglés
 * (person, license_plate, …) para filtros y matching upstream.
 */
const DETECTION_LABELS = {
  person: 'Persona',
  car: 'Auto',
  truck: 'Camión',
  bus: 'Autobús',
  motorcycle: 'Moto',
  bicycle: 'Bicicleta',
  license_plate: 'Placa',
  lpr: 'Placa',
  face: 'Rostro',
  motion: 'Movimiento',
  loitering: 'Merodeo',
  intrusion: 'Intrusión',
  line_crossing: 'Cruce de línea',
  crowd: 'Aglomeración',
  abandoned_object: 'Objeto abandonado',
};

/** Display-only: nunca blank/undefined; si no hay mapeo, deja el valor crudo. */
function labelFor(raw) {
  const key = String(raw ?? '').trim();
  if (!key || key === '?') return 'Desconocido';
  return DETECTION_LABELS[key.toLowerCase()] || key;
}

let onViewCamera = null;
let drawer = null;
let listEl = null;
let badge = null;
let pageBadge = null;
let filterPri = null;
let filterLabel = null;
let popoutHint = null;
let lastCount = 0;
let meSecureVu = false;
let standalone = false;
let bc = null;

export function initDetections(opts = {}) {
  standalone = false;
  onViewCamera = opts.onViewCamera || null;
  bindUi();

  api('/api/me').then((m) => { meSecureVu = !!m?.securevuAccess; }).catch(() => {});
  refreshBadge();
  setInterval(refreshBadge, 30_000);
}

/** Página dedicada `/detections.html` (misma sesión / cookies same-origin). */
export function initDetectionsPage() {
  standalone = true;
  onViewCamera = null;
  bindUi();
  drawer?.classList.remove('hidden');

  api('/api/me').then((m) => { meSecureVu = !!m?.securevuAccess; }).catch(() => {});
  refresh();
  setInterval(refresh, 30_000);
  announcePopout('open');
  window.addEventListener('beforeunload', () => announcePopout('close'));
}

function bindUi() {
  drawer = document.getElementById('det-drawer');
  listEl = document.getElementById('det-list');
  badge = document.getElementById('det-badge');
  pageBadge = document.getElementById('det-page-badge');
  filterPri = document.getElementById('det-filter-pri');
  filterLabel = document.getElementById('det-filter-label');
  popoutHint = document.getElementById('det-popped-hint');

  document.getElementById('det-bell')?.addEventListener('click', () => {
    if (isRightDrawerOpen('det-drawer')) closeDrawer();
    else openDrawer();
  });
  document.getElementById('det-close')?.addEventListener('click', closeDrawer);
  filterPri?.addEventListener('change', () => refresh());
  filterLabel?.addEventListener('change', () => refresh());

  document.getElementById('det-popout')?.addEventListener('click', openPopout);
  document.getElementById('det-popout-reopen')?.addEventListener('click', openPopout);

  if (!standalone) listenPopoutChannel();
}

function openDrawer() {
  // Alarmas y Detecciones comparten el carril derecho: abrir uno cierra el otro.
  showRightDrawer('det-drawer');
  audit('detection.open', {});
  refresh();
}

function closeDrawer() {
  drawer?.classList.add('hidden');
}

function openPopout() {
  audit('detections.popout_open', {});
  const w = window.open('/detections.html', POPOUT_NAME, POPOUT_FEATURES);
  if (w) {
    try { w.focus(); } catch { /* */ }
    closeDrawer();
    setPoppedHint(true);
  } else {
    alert('El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.');
  }
}

function announcePopout(type) {
  try {
    if (!bc) bc = new BroadcastChannel(BC_NAME);
    bc.postMessage({ type });
  } catch { /* */ }
}

function listenPopoutChannel() {
  try {
    bc = new BroadcastChannel(BC_NAME);
    bc.onmessage = (ev) => {
      const d = ev?.data || {};
      if (d.type === 'open') setPoppedHint(true);
      if (d.type === 'close') setPoppedHint(false);
      if (d.type === 'view-camera') {
        // El pop-out pidió una cámara: este mapa la abre y confirma.
        try { bc.postMessage({ type: 'view-camera-ack' }); } catch { /* */ }
        onViewCamera?.({ server: d.server, camera: d.camera });
        try { window.focus(); } catch { /* */ }
      }
    };
  } catch { /* */ }
}

/**
 * Desde el pop-out: pide al mapa abierto que abra el float de esa cámara.
 * Si ningún mapa confirma, abre/reutiliza la ventana del mapa con `?cam=`.
 */
function requestMapCamera(server, camera) {
  let acked = false;
  const onAck = (ev) => { if (ev?.data?.type === 'view-camera-ack') acked = true; };
  try {
    if (!bc) bc = new BroadcastChannel(BC_NAME);
    bc.addEventListener('message', onAck);
    bc.postMessage({ type: 'view-camera', server, camera });
  } catch { /* */ }
  setTimeout(() => {
    try { bc?.removeEventListener('message', onAck); } catch { /* */ }
    if (acked) return;
    const q = new URLSearchParams({ cam: camera, srv: server });
    const w = window.open(`/?${q}`, MAP_WINDOW_NAME);
    try { w?.focus(); } catch { /* */ }
  }, 350);
}

function setPoppedHint(on) {
  popoutHint?.classList.toggle('hidden', !on);
}

function paintBadges() {
  if (badge) {
    if (lastCount > 0) {
      badge.textContent = lastCount > 99 ? '99+' : String(lastCount);
      badge.classList.remove('hidden');
    } else badge.classList.add('hidden');
  }
  if (pageBadge) {
    pageBadge.textContent = lastCount > 0 ? (lastCount > 99 ? '99+' : String(lastCount)) : '';
    pageBadge.classList.toggle('hidden', lastCount === 0);
  }
}

async function refreshBadge() {
  try {
    const c = await api('/api/detections/count');
    lastCount = c.recent24h || 0;
    paintBadges();
  } catch { /* */ }
}

async function refresh() {
  if (!listEl) return;
  listEl.innerHTML = '<p class="muted">Cargando…</p>';
  const q = new URLSearchParams();
  q.set('limit', '80');
  const after = new Date(Date.now() - 24 * 3600 * 1000);
  // CDMX-ish ISO without Z → events.mjs treats as -06:00
  const pad = (n) => String(n).padStart(2, '0');
  const local = new Date(after.getTime() - 6 * 3600 * 1000);
  q.set('after', `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:00`);
  if (filterPri?.value && filterPri.value !== 'all') q.set('priority', filterPri.value);
  if (filterLabel?.value) q.set('label', filterLabel.value);
  try {
    const data = await api(`/api/detections?${q}`);
    const items = data.items || [];
    lastCount = data.recent24h ?? items.length;
    paintBadges();
    if (!items.length) {
      listEl.innerHTML = '<p class="muted">Sin detecciones en las últimas 24 h'
        + ' (muchas cámaras MH tienen detect apagado — coordinar con ops).</p>';
      return;
    }
    listEl.innerHTML = items.map(cardHtml).join('');
    listEl.querySelectorAll('[data-a]').forEach((btn) => {
      btn.addEventListener('click', () => onAction(btn));
    });
  } catch (err) {
    listEl.innerHTML = `<p class="muted">Error: ${esc(err.message || String(err))}</p>`;
  }
}

function cardHtml(e) {
  const priClass = e.priority === 'high' ? 'high' : e.priority === 'medium' ? 'med' : 'low';
  const sub = e.sub_label ? ` · ${esc(e.sub_label)}` : '';
  // Meta sin IP de servidor (sigue en data-* para Ver cámara / Grabación).
  const metaBits = [];
  if (e.camera) metaBits.push(esc(e.camera));
  if (e.score != null) metaBits.push(`${(Number(e.score) * 100).toFixed(0)}%`);
  if ((e.zones || []).length) metaBits.push(`zona ${(e.zones || []).slice(0, 2).map(esc).join(', ')}`);
  const meta1 = metaBits.join(' · ');
  return `<div class="det-card pri-${priClass}">
    <div class="det-top">
      <span class="det-pri">${esc(e.priorityLabel || e.priority)}</span>
      <span class="det-title">${esc(labelFor(e.label))}${sub}</span>
    </div>
    <div class="det-meta">${meta1}</div>
    <div class="det-meta">${esc(e.start_time || '')}${e.duration_s != null ? ` · ${e.duration_s}s` : ''}</div>
    <div class="det-actions">
      <button type="button" data-a="cam" data-server="${escAttr(e.server)}" data-camera="${escAttr(e.camera)}" title="Abrir la cámara en el mapa (ventana flotante)">Ver cámara</button>
      ${e.start_epoch != null ? `<button type="button" data-a="clip" data-id="${escAttr(e.id)}" data-server="${escAttr(e.clip_server || e.server)}" data-camera="${escAttr(e.camera)}" data-at="${escAttr(e.start_epoch)}" data-plate="${escAttr(e.sub_label || '')}" data-label="${escAttr(e.label || '')}" title="Ver la grabación del momento (ventana aparte)">Grabación</button>` : ''}
    </div>
  </div>`;
}

function onAction(el) {
  const a = el.dataset.a;
  if (a === 'cam') {
    const server = el.dataset.server || '';
    const camera = el.dataset.camera || '';
    audit('detection.view_camera', { server, camera, standalone });
    if (standalone) {
      requestMapCamera(server, camera);
      return;
    }
    onViewCamera?.({ server, camera });
  } else if (a === 'clip') {
    openClipWindow(el.dataset);
  }
}

/**
 * «Grabación» → ventana aparte con el clip del instante detectado.
 * No abre la UI de SecureVu ni pide export: /detection-video.html reutiliza
 * el proxy acotado /api/recording/clip.
 */
function openClipWindow(d = {}) {
  const q = new URLSearchParams({
    server: d.server || '',
    camera: d.camera || '',
    at: d.at || '',
  });
  if (d.plate) q.set('plate', d.plate);
  if (d.label) q.set('label', d.label);
  audit('detection.clip_open', {
    server: d.server, camera: d.camera, at: Number(d.at) || null,
  });
  const name = `securevu-det-video-${d.id || d.at || 'x'}`;
  const w = window.open(`/detection-video.html?${q}`, name, CLIP_FEATURES);
  if (w) {
    try { w.focus(); } catch { /* */ }
  } else {
    alert('El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.');
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function escAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;');
}
