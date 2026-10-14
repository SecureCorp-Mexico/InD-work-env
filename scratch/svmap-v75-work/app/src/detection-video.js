/**
 * Ventana dedicada: grabación del instante de una detección (placa LPR / objeto).
 * Se abre desde «Grabación» en Detecciones.
 *
 * No genera export en SecureVu ni abre la UI del servidor: reutiliza el proxy
 * acotado GET /api/recording/clip (el mismo de la barra Grabación del float),
 * que devuelve un mp4 centrado en el instante capturado.
 */
import './style.css';

const params = new URLSearchParams(location.search);
const server = params.get('server') || '';
const camera = params.get('camera') || '';
const plate = params.get('plate') || '';
const label = params.get('label') || '';
const baseAt = Number(params.get('at') || 0);

/** Display-only (misma tabla que detections.js). Valores API sin tocar. */
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
function labelFor(raw) {
  const key = String(raw ?? '').trim();
  if (!key || key === '?') return 'Desconocido';
  return DETECTION_LABELS[key.toLowerCase()] || key;
}

// Arrancar unos segundos antes de la captura para ver la aproximación.
const LEAD_S = 3;

let at = Number.isFinite(baseAt) ? Math.floor(baseAt) : 0;
let objectUrl = null;
let loading = false;

const titleEl = document.getElementById('av-title');
const metaEl = document.getElementById('av-meta');
const muteEl = document.getElementById('av-mute');
const video = document.getElementById('dv-video');
const statusEl = document.getElementById('dv-status');
const whenEl = document.getElementById('dv-when');

const fmtEpoch = (s) => (s
  ? new Date(s * 1000).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  : '');

function setStatus(msg, { retry = false } = {}) {
  statusEl.classList.remove('hidden');
  statusEl.textContent = msg || '';
  if (!retry) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dv-retry';
  btn.textContent = 'Reintentar';
  btn.addEventListener('click', () => load());
  statusEl.append(' ', btn);
}

/** Nunca mostrar JSON/errores crudos del NVR al operador. */
function friendlyError(status) {
  if (status === 403) return 'Esta cámara está fuera de tu alcance.';
  if (status === 404) return 'No hay grabación de servidor para ese momento.';
  if (status === 413) return 'El clip de ese momento es demasiado grande.';
  return 'No se pudo cargar la grabación de ese momento.';
}

function revoke() {
  if (!objectUrl) return;
  try { URL.revokeObjectURL(objectUrl); } catch { /* */ }
  objectUrl = null;
}

function paintHeader() {
  const what = plate || labelFor(label) || 'Detección';
  titleEl.textContent = plate ? `Placa ${plate}` : `Grabación · ${what}`;
  // Sin IP: server sigue usándose en /api/recording/clip.
  metaEl.textContent = camera || '';
  document.title = `${plate || what} · Grabación · SecureVu Map`;
  whenEl.textContent = at
    ? `Captura: ${fmtEpoch(baseAt)}${at !== baseAt ? ` · viendo ${fmtEpoch(at)}` : ''}`
    : '';
}

/** El clip viene centrado en `at`; el instante capturado queda a la mitad. */
function seekToMoment() {
  const d = Number(video.duration);
  if (!Number.isFinite(d) || d <= 0) return;
  video.currentTime = Math.max(0, d / 2 - LEAD_S);
}

async function load() {
  if (loading) return;
  if (!server || !camera || !at) {
    setStatus('Faltan datos de la detección.');
    return;
  }
  loading = true;
  paintHeader();
  video.classList.add('hidden');
  video.removeAttribute('src');
  revoke();
  setStatus('Cargando la grabación del momento…');

  const q = new URLSearchParams({ server, stream: camera, at: String(at) });
  try {
    const resp = await fetch(`/api/recording/clip?${q}`, { credentials: 'same-origin' });
    if (!resp.ok) {
      setStatus(friendlyError(resp.status), { retry: true });
      return;
    }
    const blob = await resp.blob();
    if (!blob.size) {
      setStatus('No hay grabación de servidor para ese momento.', { retry: true });
      return;
    }
    objectUrl = URL.createObjectURL(blob);
    video.src = objectUrl;
    video.muted = !!muteEl?.checked;
    video.classList.remove('hidden');
    statusEl.classList.add('hidden');
    video.play().catch(() => { /* autoplay puede requerir gesto */ });
  } catch {
    setStatus('No se pudo cargar la grabación de ese momento.', { retry: true });
  } finally {
    loading = false;
  }
}

function shift(seconds) {
  at += seconds;
  load();
}

video.addEventListener('loadedmetadata', seekToMoment);
muteEl?.addEventListener('change', () => { video.muted = !!muteEl.checked; });
document.getElementById('av-reload')?.addEventListener('click', () => load());
document.getElementById('dv-back')?.addEventListener('click', () => shift(-10));
document.getElementById('dv-fwd')?.addEventListener('click', () => shift(10));
document.getElementById('dv-moment')?.addEventListener('click', () => {
  if (at !== baseAt) { at = baseAt; load(); return; }
  seekToMoment();
  video.play().catch(() => { /* */ });
});
window.addEventListener('beforeunload', revoke);

paintHeader();
load();
