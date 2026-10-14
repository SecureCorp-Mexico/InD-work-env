/** Alarmas SecureTrax (SOS / Tamper): marcadores en el mapa, panel accionable + ventana pop-out. */
import { api, audit } from './api.js';
import { showRightDrawer, isRightDrawerOpen } from './panels.js';

const POPOUT_NAME = 'securevu-notifications';
const POPOUT_FEATURES = 'width=420,height=720,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes';
const BC_NAME = 'securevu-alarms';
const SOUND_MUTE_KEY = 'securevu-alarm-sound-muted';
/** Mild single WAV used for Tamper (and unknown types). */
const CHIME_URL = '/alarm-chime.wav';
/** SOS is a louder multi-beep WebAudio pattern (not the Tamper WAV). */
const SOS_GAIN = 0.42;

/** Flat 2D speaker — currentColor (panel text / black), never emoji. */
const SOUND_ON_SVG = `<svg class="alarm-sound-ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
  <path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"
    d="M5 9.25h2.9L12 5.2v13.6l-4.1-4.05H5z"/>
  <path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"
    d="M15.1 9.1a3.1 3.1 0 0 1 0 5.8"/>
  <path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"
    d="M17.55 6.7a6.1 6.1 0 0 1 0 10.6"/>
</svg>`;

/** Flat 2D speaker muted (slash). */
const SOUND_MUTED_SVG = `<svg class="alarm-sound-ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
  <path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"
    d="M5 9.25h2.9L12 5.2v13.6l-4.1-4.05H5z"/>
  <path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"
    d="M14.8 8.4l6.4 6.4M21.2 8.4l-6.4 6.4"/>
</svg>`;

let onAlarmsUpdate = null;   // callback(alarms) para refrescar el mapa
let lastAlarms = [];
let standalone = false;

let drawer = null;
let listEl = null;
let badge = null;
let filterSel = null;
let popoutHint = null;
let soundToggle = null;
let bc = null;
/** Throttle del refresco push (ms) para no martillar /api/alarms. */
const PUSH_REFRESH_MIN_MS = 1200;
let lastPushRefresh = 0;
let pushRefreshTimer = null;
/** SSE live nudge from /api/alarms/stream (SecureTrax + intercom). */
let alarmEs = null;
let alarmEsRetryTimer = null;
let alarmEsBackoffMs = 1000;
const ALARM_ES_BACKOFF_MAX_MS = 30_000;
let alarmPollTimer = null;
let searchInput = null;
let searchClearBtn = null;
/** Raw query from #alarm-search (client-side filter of listCache). */
let searchQuery = '';
let searchTimer = null;
/** Last fetched list for the current status filter (pre-search). */
let listCache = [];
/** Alarm ids whose activity/notes block the operator has expanded (survives SSE/poll re-paint). */
const expandedLogIds = new Set();

/** @type {Map<number, number>|null} id → count; null hasta el primer poll (baseline sin sonido) */
let knownAlarmCounts = null;
let alarmAudio = null;
let audioCtx = null;
let audioUnlocked = false;
/** @type {false|'sos'|'tamper'} */
let pendingChime = false;
let unlockBound = false;

export function initAlarms(cb) {
  standalone = false;
  onAlarmsUpdate = cb;
  bindUi();
  initAlarmSound();
  refresh();
  startAlarmPollFallback();
  startAlarmStream();
}

/** Página dedicada `/notifications.html` (misma sesión / cookies same-origin). */
export function initNotificationsPage() {
  standalone = true;
  onAlarmsUpdate = null;
  bindUi();
  initAlarmSound();
  drawer?.classList.remove('hidden');
  refresh();
  startAlarmPollFallback();
  startAlarmStream();
  announcePopout('open');
  window.addEventListener('beforeunload', () => announcePopout('close'));
  const alarmParam = new URLSearchParams(location.search).get('alarm');
  if (alarmParam) focusAlarm(Number(alarmParam));
}

export function getActiveAlarms() {
  return lastAlarms.filter(a => a.status !== 'resolved');
}

/** Abre el panel y resalta la(s) alarma(s) del marcador (id o lista de ids). */
export async function focusAlarm(idOrIds) {
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
}


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

function bindUi() {
  drawer = document.getElementById('alarm-drawer');
  listEl = document.getElementById('alarm-list');
  badge = document.getElementById('alarm-badge');
  filterSel = document.getElementById('alarm-filter');
  popoutHint = document.getElementById('alarm-popped-hint');
  soundToggle = document.getElementById('alarm-sound-toggle');

  const bell = document.getElementById('alarm-bell');
  bell?.addEventListener('click', () => {
    if (!drawer) return;
    if (isRightDrawerOpen('alarm-drawer')) {
      drawer.classList.add('hidden');
      return;
    }
    showRightDrawer('alarm-drawer');
    renderList();
  });

  document.getElementById('alarm-close')?.addEventListener('click', () => {
    drawer?.classList.add('hidden');
  });

  filterSel?.addEventListener('change', () => renderList());

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

  document.getElementById('alarm-popout')?.addEventListener('click', openPopout);
  document.getElementById('alarm-popout-reopen')?.addEventListener('click', openPopout);

  soundToggle?.addEventListener('click', () => {
    setSoundMuted(!isSoundMuted());
    unlockAudio();
  });
  syncSoundToggleUi();

  listenPopoutChannel(); // ambas vistas: hints de pop-out + refresco push
}

function isSoundMuted() {
  try { return localStorage.getItem(SOUND_MUTE_KEY) === '1'; } catch { return false; }
}

function setSoundMuted(muted) {
  try { localStorage.setItem(SOUND_MUTE_KEY, muted ? '1' : '0'); } catch { /* */ }
  syncSoundToggleUi();
}

function syncSoundToggleUi() {
  if (!soundToggle) return;
  const muted = isSoundMuted();
  soundToggle.setAttribute('aria-pressed', muted ? 'true' : 'false');
  soundToggle.setAttribute('aria-label', muted ? 'Activar sonido de alarma' : 'Silenciar sonido de alarma');
  soundToggle.title = muted ? 'Sonido de alarma: silenciado (clic para activar)' : 'Sonido de alarma: activo (clic para silenciar)';
  soundToggle.innerHTML = muted ? SOUND_MUTED_SVG : SOUND_ON_SVG;
  soundToggle.classList.toggle('muted-sound', muted);
}

/** Autoplay unlock + chime player (mapa y /notifications.html). */
function initAlarmSound() {
  if (!alarmAudio) {
    alarmAudio = new Audio(CHIME_URL);
    alarmAudio.preload = 'auto';
    alarmAudio.volume = 0.75; // Tamper: mild
  }
  if (unlockBound) return;
  unlockBound = true;
  const unlock = () => unlockAudio();
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true, passive: true });
}

function ensureAudioCtx() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

async function unlockAudio() {
  if (!alarmAudio) initAlarmSound();
  try {
    alarmAudio.muted = true;
    await alarmAudio.play();
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    alarmAudio.muted = false;
    audioUnlocked = true;
  } catch {
    audioUnlocked = false;
  }
  try {
    const ctx = ensureAudioCtx();
    if (ctx && ctx.state === 'suspended') await ctx.resume();
  } catch { /* */ }
  if (audioUnlocked && pendingChime) {
    const kind = pendingChime;
    pendingChime = false;
    playAlarmSound(kind);
  }
}

/**
 * Sonido sólo en ingest nuevo: id desconocido o count mayor que el último visto.
 * Primer poll = baseline (sin sonido). Polls siguientes con mismos ids/counts = silencio.
 * SOS beats Tamper when both arrive in the same poll (play urgent pattern once).
 */
function noteAlarmIngest(alarms) {
  const open = Array.isArray(alarms) ? alarms : [];
  if (knownAlarmCounts === null) {
    knownAlarmCounts = new Map(open.map(a => [a.id, Number(a.count) || 0]));
    return;
  }
  let freshSos = false;
  let freshOther = false;
  for (const a of open) {
    const id = a.id;
    const count = Number(a.count) || 0;
    const prev = knownAlarmCounts.get(id);
    if (prev === undefined || count > prev) {
      if (String(a.type || '').toLowerCase() === 'sos') freshSos = true;
      else freshOther = true;
    }
    knownAlarmCounts.set(id, Math.max(prev ?? 0, count));
  }
  if (freshSos) playAlarmSound('sos');
  else if (freshOther) playAlarmSound('tamper');
}

function playAlarmSound(kind) {
  if (isSoundMuted()) return;
  if (!alarmAudio) initAlarmSound();
  if (!audioUnlocked) {
    pendingChime = kind === 'sos' ? 'sos' : 'tamper';
    return;
  }
  if (kind === 'sos') playSosUrgent();
  else playTamperChime();
}

/** Tamper: existing mild WAV (single chime). */
function playTamperChime() {
  try {
    alarmAudio.volume = 0.75;
    alarmAudio.playbackRate = 1;
    alarmAudio.currentTime = 0;
    const p = alarmAudio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => { pendingChime = 'tamper'; audioUnlocked = false; });
    }
  } catch {
    pendingChime = 'tamper';
    audioUnlocked = false;
  }
}

/**
 * SOS: urgent WebAudio sequence — 3 short high beeps + 3 longer higher beeps
 * (audibly distinct from Tamper's single mild WAV). Mute toggle still gates this.
 */
function playSosUrgent() {
  const ctx = ensureAudioCtx();
  if (!ctx) {
    // Fallback: louder/faster WAV if WebAudio unavailable
    try {
      alarmAudio.volume = 1;
      alarmAudio.playbackRate = 1.35;
      alarmAudio.currentTime = 0;
      const p = alarmAudio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => { pendingChime = 'sos'; audioUnlocked = false; });
      }
    } catch {
      pendingChime = 'sos';
      audioUnlocked = false;
    }
    return;
  }
  try {
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => playSosUrgentPattern(ctx)).catch(() => {
        pendingChime = 'sos';
        audioUnlocked = false;
      });
      return;
    }
    playSosUrgentPattern(ctx);
  } catch {
    pendingChime = 'sos';
    audioUnlocked = false;
  }
}

function playSosUrgentPattern(ctx) {
  const t0 = ctx.currentTime + 0.02;
  // Morse-like urgency: ··· — — —  (short trio then longer trio, rising pitch)
  const beeps = [
    { at: 0.00, freq: 1046, dur: 0.09 }, // C6
    { at: 0.14, freq: 1046, dur: 0.09 },
    { at: 0.28, freq: 1046, dur: 0.09 },
    { at: 0.55, freq: 1319, dur: 0.22 }, // E6
    { at: 0.85, freq: 1319, dur: 0.22 },
    { at: 1.15, freq: 1568, dur: 0.28 }, // G6 — climax
  ];
  for (const b of beeps) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(b.freq, t0 + b.at);
    const start = t0 + b.at;
    const end = start + b.dur;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(SOS_GAIN, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

function openPopout() {
  audit('notifications.open', {});
  const w = window.open('/notifications.html', POPOUT_NAME, POPOUT_FEATURES);
  if (w) {
    try { w.focus(); } catch { /* */ }
    drawer?.classList.add('hidden');
    setPoppedHint(true);
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
    if (!bc) bc = new BroadcastChannel(BC_NAME);
    bc.onmessage = (ev) => {
      const type = ev?.data?.type;
      if (type === 'open' && !standalone) setPoppedHint(true);
      if (type === 'close' && !standalone) setPoppedHint(false);
      // Otra ventana creo/actualizo una alarma: refrescar ya, sin esperar el poll de 30 s.
      if (type === 'refresh') refreshAlarmsNow({ broadcast: false });
    };
  } catch { /* */ }
}

/** Poll de seguridad (30 s) por si cae el SSE / proxy / sleep-wake. No se elimina. */
function startAlarmPollFallback() {
  if (alarmPollTimer) return;
  alarmPollTimer = window.setInterval(refresh, 30_000);
}

/**
 * SSE nudge desde el api: content-free → refetch ACL-checked.
 * EventSource envía la cookie de sesión same-origin automáticamente.
 * Reconnect con backoff; el poll de 30 s cubre el hueco.
 */
function startAlarmStream() {
  if (typeof EventSource === 'undefined') return;
  if (alarmEs) return;
  try {
    const es = new EventSource('/api/alarms/stream', { withCredentials: true });
    alarmEs = es;
    es.addEventListener('alarm', () => {
      alarmEsBackoffMs = 1000;
      // Broadcast para otras ventanas same-origin; throttle evita tormentas de chime.
      refreshAlarmsNow({ broadcast: true });
    });
    es.addEventListener('ready', () => { alarmEsBackoffMs = 1000; });
    es.onerror = () => {
      // Cerrar y reabrir con backoff — EventSource auto-retry a veces martilla el 401.
      try { es.close(); } catch { /* */ }
      if (alarmEs === es) alarmEs = null;
      if (alarmEsRetryTimer) return;
      const wait = alarmEsBackoffMs;
      alarmEsBackoffMs = Math.min(ALARM_ES_BACKOFF_MAX_MS, Math.round(alarmEsBackoffMs * 1.8));
      alarmEsRetryTimer = window.setTimeout(() => {
        alarmEsRetryTimer = null;
        startAlarmStream();
      }, wait);
    };
  } catch {
    // Sin SSE: el poll de 30 s sigue siendo el fallback.
  }
}

/**
 * Refresco inmediato del panel/badge/mapa, fuera del ciclo de 30 s.
 * Lo usa quien ya sabe que acaba de nacer una alarma (p. ej. un INVITE de intercom
 * que sintetiza SOS): el poll normal la mostraria hasta 30 s despues.
 * Se difunde por BroadcastChannel para que el pop-out se actualice al mismo tiempo.
 */
export function refreshAlarmsNow({ broadcast = true } = {}) {
  if (broadcast) {
    try {
      if (!bc) bc = new BroadcastChannel(BC_NAME);
      bc.postMessage({ type: 'refresh' });
    } catch { /* */ }
  }
  // Coalesce rafagas (varios eventos del mismo INVITE) sin retrasar el primero.
  const wait = PUSH_REFRESH_MIN_MS - (Date.now() - lastPushRefresh);
  if (wait > 0) {
    if (!pushRefreshTimer) {
      pushRefreshTimer = window.setTimeout(() => {
        pushRefreshTimer = null;
        lastPushRefresh = Date.now();
        refresh();
      }, wait);
    }
    return;
  }
  lastPushRefresh = Date.now();
  refresh();
}

function setPoppedHint(on) {
  popoutHint?.classList.toggle('hidden', !on);
}

const TYPE_ES = { sos: 'SOS', tamper: 'Tamper' };
const ACTION_ES = { created: 'creada', ack: 'reconocida', resolve: 'resuelta', reopen: 'reabierta', note: 'nota' };
const fmt = iso => iso ? new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

const attrEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Pull human text out of SecureVu / stored video_error (never leave raw JSON for UI). */
function extractVideoErrorText(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const j = JSON.parse(t);
      if (typeof j?.message === 'string' && j.message.trim()) return j.message.trim();
      if (typeof j?.error === 'string' && j.error.trim()) return j.error.trim();
      if (typeof j?.detail === 'string' && j.detail.trim()) return j.detail.trim();
    } catch { /* fall through */ }
  }
  const m = t.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/i);
  if (m) {
    try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
  }
  return t;
}

/** Map known API / internal errors → friendly Spanish tooltip. */
function friendlyVideoError(raw) {
  const rawStr = String(raw || '').trim();
  const fromJson = /^\s*[{\[]/.test(rawStr) || /"success"\s*:/.test(rawStr);
  const msg = extractVideoErrorText(raw);
  const lower = msg.toLowerCase();
  if (/no recordings found|no recording|recordings? not found|sin grabaci[oó]n|no hay grabaciones/.test(lower)) {
    return 'Sin grabación en ese momento';
  }
  if (/time range|rango de tiempo/.test(lower) && /record|grabac/.test(lower)) {
    return 'No hay grabaciones para ese rango de tiempo';
  }
  if (/sin torre|sin pmi|no se puede mapear/.test(lower)) {
    return 'Sin PMI/torre — no hay cámara asociada';
  }
  if (/sin c[aá]maras/.test(lower)) {
    return 'No hay cámaras en el mapa para este PMI';
  }
  if (/sv_api_|no configurad/.test(lower)) {
    return 'Grabación no configurada en el servidor';
  }
  if (/^login\b|sin token|econnrefused|etimedout|fetch failed|network/.test(lower)) {
    return 'No se pudo conectar a SecureVu';
  }
  if (/\bhttp\s*[45]\d\d\b/.test(lower) || /^http\s+\d{3}/i.test(msg)) {
    return 'Error al solicitar el export en SecureVu';
  }
  // Leftover JSON / unmapped English API message → generic (never dump raw JSON)
  if (fromJson || /^\s*[{\[]/.test(msg) || /"\w+"\s*:/.test(msg)) {
    return 'No se pudo obtener la grabación';
  }
  // Short Spanish/internal note already usable
  if (msg && msg.length <= 120) return msg;
  return 'No se pudo obtener la grabación';
}

/** title= for Grabación button — always friendly Spanish. */
function videoButtonTitle(a) {
  // Hard mapping/config failures only — soft vault misses must not claim "sin grabación"
  // because the multi-cam moment page still opens (on-demand clips / Explore).
  if (a.video_warn || (a.export_status === 'unavailable' && a.video_error)) {
    return friendlyVideoError(a.video_error);
  }
  const vault = a.export_status === 'vaulted' || !!a.video_export_id;
  if (vault) return 'Abrir grabación del momento · vault en SecureVu';
  if (a.export_status === 'pending' || (!a.video_at && !a.video_error)) {
    return 'Abrir grabación del momento · comprobando vault…';
  }
  if (a.export_status === 'failed') {
    return 'Abrir grabación del momento · vault pendiente en NVR';
  }
  if (a.playback_available !== false) return 'Abrir grabación del momento';
  return 'Abrir grabación del momento';
}

/** ⚠️ only for hard failures (no PMI/cameras/creds). Soft export miss ≠ no recording. */
function videoButtonWarn(a) {
  if (a.video_warn === true) return true;
  if (a.video_warn === false) return false;
  // Backward-compatible if API predates video_warn
  if (!a.video_error) return false;
  return /sin torre|sin pmi|sin c[aá]maras|no se puede mapear|no configurad/i
    .test(String(a.video_error));
}

async function refresh() {
  try {
    const { counts, alarms } = await api('/api/alarms?status=open');
    lastAlarms = alarms;
    noteAlarmIngest(alarms);
    const n = counts.active || 0;
    if (badge) {
      badge.textContent = n;
      badge.classList.toggle('hidden', n === 0);
      badge.classList.toggle('pulse', n > 0);
    }
    const titleBadge = document.getElementById('notif-badge');
    if (titleBadge) {
      titleBadge.textContent = n ? String(n) : '';
      titleBadge.classList.toggle('hidden', n === 0);
    }
    if (drawer && !drawer.classList.contains('hidden')) renderList(null, true);
    if (onAlarmsUpdate) onAlarmsUpdate(getActiveAlarms());
  } catch { /* sin sesión o sin red: silencioso */ }
}

async function renderList(highlightId, keepScroll) {
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
}

const LOG_CHEVRON_SVG = `<svg class="al-log-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M2.5 4.25 L6 7.75 L9.5 4.25" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function card(a) {
  const el = document.createElement('div');
  el.className = `alarm-card ${a.status} ${a.type}`;
  el.dataset.id = a.id;
  const title = `${TYPE_ES[a.type] || a.type.toUpperCase()} · ${a.tower || a.device_name || 'dispositivo'}`;
  const actions = Array.isArray(a.actions) ? a.actions : [];
  const logCount = actions.length;
  const logOpen = expandedLogIds.has(a.id);
  const log = actions.map(x => {
    const who = !x.user || x.user === 'sistema' ? ''
      : x.user === 'FreshService' ? ' · 🎫 FreshService' : ` · ${x.user}`;
    return `<div class="al-act${x.user === 'FreshService' ? ' fs' : ''}"><span>${fmt(x.at)}</span> <b>${ACTION_ES[x.action] || x.action}</b>${who}${x.note ? `: ${x.note}` : ''}</div>`;
  }).join('');
  const logBlock = logCount
    ? `<div class="al-log${logOpen ? '' : ' al-log-collapsed'}">
        <button type="button" class="al-log-toggle" aria-expanded="${logOpen ? 'true' : 'false'}" title="${logOpen ? 'Ocultar actividad' : 'Mostrar actividad'}">
          ${LOG_CHEVRON_SVG}
          <span class="al-log-label">Actividad (${logCount})</span>
        </button>
        <div class="al-log-body">${log}</div>
      </div>`
    : '';

  el.innerHTML = `
    <div class="al-top">
      <span class="al-badge ${a.status}">${a.status === 'active' ? 'ACTIVA' : a.status === 'ack' ? 'RECONOCIDA' : 'RESUELTA'}</span>
      <span class="al-title">${title}</span>
    </div>
    <div class="al-meta">${a.count}× · última ${fmt(a.last_at)} · desde ${fmt(a.first_at)}</div>
    ${a.ticket_url
      ? `<a class="al-ticket" href="${a.ticket_url}" target="_blank" rel="noopener">🎫 Ticket #${a.ticket_id}</a>`
      : a.ticket_error ? `<div class="al-ticket err" title="${a.ticket_error.replace(/"/g, '&quot;')}">⚠️ Ticket no creado</div>` : ''}
    <div class="al-actions">
      ${a.status !== 'resolved' ? '<button data-a="ack">Reconocer</button>' : ''}
      ${a.status !== 'resolved' ? '<button data-a="resolve" class="primary">Resolver</button>' : '<button data-a="reopen">Reabrir</button>'}
      <button data-a="note">Nota</button>
      ${a.tower ? `<button data-a="cam">${standalone ? 'Ver en mapa' : 'Ver cámaras'}</button>` : ''}
      ${a.tower
        ? (videoButtonWarn(a)
          ? `<button data-a="video" title="${attrEsc(videoButtonTitle(a))}">Grabación ⚠️</button>`
          : `<button data-a="video" class="primary" title="${attrEsc(videoButtonTitle(a))}">Grabación</button>`)
        : ''}
    </div>
    ${logBlock}`;

  el.querySelector('.al-log-toggle')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    const wrap = el.querySelector('.al-log');
    if (!wrap) return;
    const open = wrap.classList.toggle('al-log-collapsed') === false;
    if (open) expandedLogIds.add(a.id);
    else expandedLogIds.delete(a.id);
    const btn = wrap.querySelector('.al-log-toggle');
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.title = open ? 'Ocultar actividad' : 'Mostrar actividad';
    }
  });

  el.querySelectorAll('.al-actions button').forEach(b => b.addEventListener('click', async () => {
    const act = b.dataset.a;
    if (act === 'cam') {
      audit('alarm.view_cameras', { alarmId: a.id, tower: a.tower, type: a.type });
      if (standalone) {
        // Misma origen / cookies; ventana con nombre para reutilizar el mapa.
        window.open(`/?alarm=${a.id}`, 'securevu-map');
      } else {
        window.__focusTower?.(a.tower);
      }
      return;
    }
    if (act === 'video') {
      await openAlarmVideo(a);
      return;
    }
    let note = '';
    if (act === 'note' || act === 'resolve') {
      note = prompt(act === 'resolve' ? 'Nota de resolución (opcional):' : 'Nota:') ?? '';
      if (act === 'note' && !note) return;
    }
    try {
      // After adding a note (or resolving with note), keep the log open so the operador lo vea.
      if (act === 'note' || (act === 'resolve' && note)) expandedLogIds.add(a.id);
      await api(`/api/alarms/${a.id}/action`, { method: 'POST', body: JSON.stringify({ action: act, note }) });
      refresh();
    } catch (err) { alert(`Error: ${err.message}`); }
  }));
  return el;
}

const VIDEO_POPOUT_PREFIX = 'securevu-alarm-video';

/** Fitted pop-out size (like notifications) — wider when multi-cam grid. */
function videoPopoutFeatures(camHint = 4) {
  const n = Math.max(1, Number(camHint) || 4);
  const cols = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const w = Math.min(1400, Math.max(720, cols * 420));
  const h = Math.min(960, Math.max(700, 72 + rows * 300));
  return `width=${w},height=${h},menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes`;
}

/**
 * Abre ventana dedicada con clips del momento para TODAS las cámaras del PMI
 * (no un solo tab Review). Misma origen → cookies de sesión.
 */
async function openAlarmVideo(a) {
  if (!a?.id || !a.tower) {
    alert('Esta alarma no tiene torre/PMI mapeada.');
    return;
  }
  let camHint = 4;
  try {
    const meta = await api(`/api/alarms/${a.id}/video`);
    camHint = meta.camera_count || meta.cameras?.length || 4;
  } catch { /* page will show the error */ }

  const name = `${VIDEO_POPOUT_PREFIX}-${a.id}`;
  audit('alarm.grabacion_open', { alarmId: a.id, tower: a.tower, type: a.type, cameras: camHint });
  const w = window.open(
    `/alarm-video.html?alarm=${a.id}`,
    name,
    videoPopoutFeatures(camHint),
  );
  if (w) {
    try { w.focus(); } catch { /* */ }
  } else {
    alert('El navegador bloqueó la ventana emergente. Permite pop-ups para este sitio.');
  }
}
