import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { StreamPlayer } from './webrtc.js';
import { attachDigitalZoom } from './zoom.js';
import { api, audit } from './api.js';
import { initUserMenu } from './userMenu.js';
import { initImpersonateBanner } from './impersonate.js';
import { maybeAutoStartTour, startTour } from './tour.js';
import './chat.js';
import {
  loadCameraRecording, hideCameraRecording,
  loadCameraEdgeRecording,
} from './stats.js';
import { initAlarms, getActiveAlarms, focusAlarm } from './alarms.js';
import { initDetections } from './detections.js';
import { registerPwa } from './pwa.js';
import {
  initIntercom, callPmi, hangup as hangupIntercom,
  answerIncoming, rejectIncoming,
  onIntercomState, stopIntercom, getIntercomState,
} from './intercom.js';
import { resolveServerNames, serverLabel } from '@shared/serverNames';
import {
  isDownStatus, isOnlineStatus, classifyProducers, bucketFromMapStatus,
} from '@shared/statusBucket';
import { publishLiveStatusCounts } from './liveStatusCounts.js';
import {
  initPtz, attachPtzPill, userCanPtz,
} from './ptz.js';

registerPwa();

{
  const build = document.querySelector('meta[name="svmap-build"]')?.content || '?';
  console.info('[svmap] build', build);
}

// ─── Carga de configuración y datos en runtime ────────────────────────────────
// Safety: hide/fail the overlay even if the initial await never resolves
// (API down during deploy recreate → classic infinite «Cargando dispositivos…»).
const loadingEl = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const hideLoading = () => { if (loadingEl) loadingEl.style.display = 'none'; };
const showLoadError = (msg) => {
  if (!loadingEl) return;
  loadingEl.style.display = 'flex';
  if (loadingText) {
    loadingText.textContent = msg || 'Error al cargar. Recarga la página.';
  }
  let retry = document.getElementById('loading-retry');
  if (!retry) {
    retry = document.createElement('button');
    retry.id = 'loading-retry';
    retry.type = 'button';
    retry.textContent = 'Reintentar';
    retry.style.cssText = 'margin-top:8px;padding:8px 14px;cursor:pointer';
    retry.addEventListener('click', () => location.reload());
    loadingEl.appendChild(retry);
  }
};
// Always clear the spinner eventually — even if map style / API hangs.
setTimeout(() => {
  if (loadingEl && loadingEl.style.display !== 'none' && !document.getElementById('loading-retry')) {
    showLoadError('Tardando demasiado. Comprueba la conexión o reintenta.');
  }
}, 15000);

let config, geojson, me;
try {
  [config, geojson, me] = await Promise.all([
    api('/api/config'),
    api('/api/cameras'),
    api('/api/me'),
  ]);
} catch (err) {
  // 401 → api() already redirects to login; other failures stay on overlay with retry.
  if (!String(err?.message || '').includes('sesión expirada')) {
    showLoadError(err?.message || 'Error al cargar dispositivos.');
  }
  throw err;
}

const SERVERS = config.servers || [];
const SUFFIXES = config.streamSuffixes || { main: '', sub: '_SD' };
// API trae inventario+overrides; geojson refuerza (mismo helper shared/serverNames).
const SERVER_NAMES = {
  ...resolveServerNames((geojson.features || []).map(f => f.properties || {})),
  ...(config.serverNames || {}),
};

document.title = config.title;
/** «SecureVu Map · Miguel Hidalgo» → brand + 3D toggle + suffix (after Map). */
function applyLogoTitle(full) {
  const t = String(full || 'SecureVu Map');
  const m = t.match(/^(.*?Map)(\s*[·•].*)?$/i);
  const brand = (m ? m[1] : t).trim();
  const suffix = (m && m[2] ? m[2] : '').trim();
  const brandEl = document.getElementById('logo-brand');
  const suffixEl = document.getElementById('logo-suffix');
  const mirror = document.getElementById('logo-text');
  if (brandEl) brandEl.textContent = brand;
  if (suffixEl) {
    suffixEl.textContent = suffix;
    suffixEl.hidden = !suffix;
  }
  if (mirror) mirror.textContent = t;
}
applyLogoTitle(config.title);

// Barra de usuario: icono persona → menú (guía / contraseña / salir)
initUserMenu(me, {
  onBeforeLogout: () => stopIntercom(),
  onStartTour: () => startTour({ username: me.username, role: me.role, force: true }),
});
initImpersonateBanner(me);
if (me.role === 'admin') document.getElementById('admin-link').classList.remove('hidden');
// Rol Usuario: oculta los detalles .admin-only del panel (solo "Servidor" queda)
if (me.role !== 'admin') document.body.classList.add('role-visor');
initPtz({ canControl: !!me.ptz_control });

// Intercom softphone (UI always present on floats; softphone no-op if disabled)
const intercomPill = document.getElementById('intercom-pill');
const intercomBox = document.getElementById('intercom-box');
const btnIntercom = document.getElementById('btn-intercom');
const btnIntercomHangup = document.getElementById('btn-intercom-hangup');
const intercomMsg = document.getElementById('intercom-msg');
let intercomActiveProps = null;
let intercomFeatureOn = false;
/** @type {Map<string, {extension:string}|null>} PMI grupo → Fanvil ext (null = none) */
const intercomExtCache = new Map();

async function lookupIntercomExt(props) {
  const grupo = props?.grupo;
  if (!grupo) return null;
  if (intercomExtCache.has(grupo)) return intercomExtCache.get(grupo);
  try {
    const q = new URLSearchParams({ grupo });
    if (props.nombre) q.set('nombre', props.nombre);
    const hit = await api(`/api/intercom/lookup?${q}`);
    const val = hit?.extension ? { extension: String(hit.extension) } : null;
    intercomExtCache.set(grupo, val);
    return val;
  } catch {
    intercomExtCache.set(grupo, null);
    return null;
  }
}

function paintFloatIntercomPill(pill, {
  visible, enabled, inCall, calling, title, label,
} = {}) {
  if (!pill) return;
  pill.classList.toggle('hidden', !visible);
  pill.classList.toggle('fp-intercom-active', !!inCall);
  pill.classList.toggle('fp-intercom-calling', !!calling && !inCall);
  pill.classList.toggle('ptz-blocked', !enabled && visible && !inCall && !calling);
  pill.disabled = !enabled && !inCall && !calling;
  pill.textContent = label || (inCall || calling ? 'Colgar' : 'Hablar');
  pill.title = title || '';
  pill.setAttribute('aria-label', label || (inCall || calling ? 'Colgar' : 'Hablar'));
}

function applyFloatIntercomVisual(inst, st = getIntercomState()) {
  const pill = inst?.el?.querySelector('.fp-intercom-pill');
  if (!pill || inst.kind !== 'camera') {
    paintFloatIntercomPill(pill, { visible: false });
    return;
  }
  const props = inst.props || {};
  const grupo = props.grupo;
  if (!grupo) {
    paintFloatIntercomPill(pill, { visible: false });
    return;
  }

  const inCall = !!st.inCall || st.status === 'in_call';
  const calling = st.status === 'calling';
  const ringing = st.status === 'ringing';
  const inboundGrupo = st.incoming?.grupo || null;
  const activeHere = !!(
    (intercomActiveProps?.grupo && intercomActiveProps.grupo === grupo && (inCall || calling))
    || (inboundGrupo && inboundGrupo === grupo && (inCall || ringing))
  );

  if (!intercomFeatureOn) {
    // Keep chrome visible so ops see Hablar when feature is flipped on later
    paintFloatIntercomPill(pill, {
      visible: true,
      enabled: false,
      title: 'Intercom no disponible',
      label: 'Hablar',
    });
    return;
  }

  const cached = intercomExtCache.has(grupo) ? intercomExtCache.get(grupo) : undefined;
  if (cached === undefined) {
    // Pending lookup — show disabled until result
    paintFloatIntercomPill(pill, {
      visible: true,
      enabled: false,
      title: 'Buscando extensión…',
      label: 'Hablar',
    });
    return;
  }
  if (!cached?.extension) {
    paintFloatIntercomPill(pill, {
      visible: true,
      enabled: false,
      title: 'Sin extensión intercom para este PMI',
      label: 'Hablar',
    });
    return;
  }

  if (activeHere) {
    if (ringing) {
      paintFloatIntercomPill(pill, {
        visible: true,
        enabled: false,
        calling: true,
        title: st.detail || 'Llamada entrante — usa Contestar arriba',
        label: 'Entrante',
      });
      return;
    }
    paintFloatIntercomPill(pill, {
      visible: true,
      enabled: true,
      inCall,
      calling,
      title: st.detail || (inCall ? 'En llamada · clic para colgar' : 'Timbrando… · clic para colgar'),
      label: 'Colgar',
    });
    return;
  }

  // Softphone not ready / another call in progress → disable
  const softReady = st.status === 'ready' || st.status === 'in_call';
  const busyElsewhere = (inCall || calling || ringing) && !activeHere;
  const ok = softReady && !busyElsewhere && !ringing;
  paintFloatIntercomPill(pill, {
    visible: true,
    enabled: ok,
    title: busyElsewhere
      ? 'Ya hay una llamada activa'
      : (!softReady
        ? (st.detail || 'Intercom no registrado')
        : `Hablar · ext ${cached.extension}`),
    label: 'Hablar',
  });
}

function syncFloatIntercom(inst) {
  if (!inst || inst.kind !== 'camera') {
    const pill = inst?.el?.querySelector('.fp-intercom-pill');
    paintFloatIntercomPill(pill, { visible: false });
    return;
  }
  const props = inst.props || {};
  applyFloatIntercomVisual(inst);
  if (!props.grupo) return;
  // Refresh mapping (cached after first hit)
  lookupIntercomExt(props).then(() => {
    if (openPanels.get(inst.key) === inst) applyFloatIntercomVisual(inst);
  });
}

function refreshAllFloatIntercom() {
  for (const inst of openPanels.values()) syncFloatIntercom(inst);
}

/** Late-bound: set once openPanels Map exists.
 *  MUST be declared above onIntercomState(...) — that helper sync-invokes
 *  the callback on register, which reads this binding (TDZ → prod `Wm`). */
let onIntercomStateFloat = null;

const iciBanner = document.getElementById('intercom-incoming');
const iciFrom = document.getElementById('ici-from');
const iciAnswer = document.getElementById('ici-answer');
const iciReject = document.getElementById('ici-reject');

function paintIncomingBanner(st) {
  if (!iciBanner) return;
  const ringing = intercomFeatureOn && st.status === 'ringing';
  iciBanner.classList.toggle('hidden', !ringing);
  if (iciFrom) iciFrom.textContent = st.incoming?.label || st.detail || 'Llamada entrante';
}

onIntercomState(st => {
  if (!intercomFeatureOn) {
    intercomPill?.classList.add('hidden');
    paintIncomingBanner({ status: 'off' });
  } else {
    intercomPill?.classList.remove('hidden');
    if (intercomPill) {
      const ringing = st.status === 'ringing';
      intercomPill.className = 'pill ' + (
        ringing ? 'ringing'
          : st.status === 'ready' || st.status === 'in_call' ? 'green'
            : st.status === 'calling' || st.status === 'connecting' ? 'amber'
              : st.status === 'error' || st.status === 'unconfigured' ? 'red'
                : 'muted'
      );
      intercomPill.title = st.detail
        ? `Intercom: ${st.detail}`
        : (st.extension ? `Intercom ext ${st.extension}` : 'Intercom');
      intercomPill.textContent = ringing ? 'IN' : 'VoIP';
    }
  }
  if (intercomMsg && intercomFeatureOn) {
    intercomMsg.textContent = st.detail || (st.status === 'ready' ? 'Listo' : '');
  }
  const inCall = !!st.inCall || st.status === 'calling' || st.status === 'in_call' || st.status === 'ringing';
  btnIntercom?.classList.toggle('hidden', inCall);
  btnIntercomHangup?.classList.toggle('hidden', !(st.status === 'in_call' || st.status === 'calling'));
  paintIncomingBanner(st);
  // Float pills wired after openPanels exists (see below)
  onIntercomStateFloat?.(st);
});

iciAnswer?.addEventListener('click', async () => {
  try {
    const r = await answerIncoming();
    const grupo = r?.incoming?.grupo || getIntercomState()?.incoming?.grupo;
    if (grupo) {
      try { (window.__focusTower || focusTower)(grupo); } catch { /* mapa aún no listo */ }
    }
  } catch (err) {
    console.warn('[intercom] answer failed:', err?.message || err);
  }
});
iciReject?.addEventListener('click', () => {
  try { rejectIncoming(); } catch { /* */ }
});

(async () => {
  try {
    const sess = await initIntercom();
    intercomFeatureOn = !!(sess && sess.enabled);
    if (!intercomFeatureOn) {
      intercomPill?.classList.add('hidden');
      intercomBox?.classList.add('hidden');
    }
  } catch (err) {
    // UCM caído / red — el mapa sigue; sólo se apaga el softphone
    console.warn('[intercom] no disponible:', err.message);
    intercomFeatureOn = false;
    intercomPill?.classList.add('hidden');
  }
  refreshAllFloatIntercom();
})();

btnIntercom?.addEventListener('click', async () => {
  if (!intercomActiveProps) return;
  if (intercomMsg) intercomMsg.textContent = 'Marcando…';
  try {
    await callPmi({
      grupo: intercomActiveProps.grupo,
      nombre: intercomActiveProps.nombre,
    });
  } catch (err) {
    if (intercomMsg) intercomMsg.textContent = err.message || 'Llamada falló';
  }
});
btnIntercomHangup?.addEventListener('click', () => hangupIntercom());

// Colores de los marcadores del mapa (más brillantes que la paleta de UI
// para que se lean bien sobre el mapa)
const COLOR = {
  online:   '#22c55e',
  offline:  '#ef4444',
  noStream: '#6b7280',
  standby:  '#f59e0b', // url_only / idle — disponible, no muerta
  unknown:  '#f59e0b',
  mixed:    '#f59e0b',
};

function chipDotClass(s) {
  if (s === 'online') return 'green';
  if (isDownStatus(s)) return 'red';
  if (s === 'standby' || s === 'unknown') return 'amber';
  return 'gray';
}
function panelDotClass(s) {
  if (s === 'online') return 'green';
  if (isDownStatus(s)) return 'red';
  return 'amber'; // standby / unknown / missing
}

// Seed: unknown (ámbar) hasta el primer poll — NO rojo (url_only idle ≠ offline).
for (const f of geojson.features) {
  f.properties.status = f.properties.hasStream ? 'unknown' : 'noStream';
}

// ─── Map Setup ────────────────────────────────────────────────────────────────
// Basemap = Carto Positron raster (reliable). “3D” = OpenFreeMap planet vector
// fill-extrusion buildings on top (Liberty’s building-3d). No setStyle swap —
// historical OFM URL hang / empty wipe left markers missing. Toggle only adds
// / removes the extrusion layer + pitch.
const OFM_PLANET_URL = 'https://tiles.openfreemap.org/planet';
const BASEMAP_STORE = 'securevu-map-basemap'; // 'carto' | 'ofm3d'

const CARTO_STYLE = {
  version: 8,
  name: 'securevu-carto-positron',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> '
        + '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxzoom: 20,
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#e8eef5' } },
    { id: 'carto-tiles', type: 'raster', source: 'carto' },
  ],
};

function readBasemapPref() {
  try {
    const v = localStorage.getItem(BASEMAP_STORE);
    if (v === 'ofm3d' || v === 'carto') return v;
  } catch { /* */ }
  return 'carto';
}

let basemapKind = 'carto';
let _mapLoadDone = false;

const map = new maplibregl.Map({
  container: 'map',
  style: CARTO_STYLE,
  center: [-99.13, 19.43],   // fallback; se ajusta a los datos al cargar
  zoom: 5,
  maxZoom: 20,
  maxPitch: 70,
  pitchWithRotate: true,
  attributionControl: { compact: true },
});

map.addControl(new maplibregl.NavigationControl({
  visualizePitch: true,
  showCompass: true,
  showZoom: true,
}), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

function syncBasemapToggle() {
  const btn = document.getElementById('basemap-3d');
  if (!btn) return;
  const on = basemapKind === 'ofm3d';
  btn.classList.toggle('active', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.title = on
    ? 'Mapa 3D activo (clic → vista plana)'
    : 'Activar 3D: edificios sobre el mapa (inclina con brújula)';
}

function view3dOpts(extra = {}) {
  if (basemapKind !== 'ofm3d') return { pitch: 0, bearing: 0, ...extra };
  return { pitch: 52, bearing: -18, ...extra };
}

/** Ensure OFM building extrusions exist under camera markers. */
function ensureOfm3dBuildings() {
  if (!map.getSource('ofm-planet')) {
    map.addSource('ofm-planet', {
      type: 'vector',
      url: OFM_PLANET_URL,
      attribution: '&copy; OpenStreetMap &copy; OpenFreeMap',
    });
  }
  if (!map.getLayer('ofm-buildings-3d')) {
    // Insert below first overlay layer so markers stay on top.
    const before = map.getLayer('cameras') ? 'cameras'
      : (map.getLayer('alarms') ? 'alarms' : undefined);
    // Match OpenFreeMap Liberty `building-3d` (direct render_height — no z-fade to 0).
    map.addLayer({
      id: 'ofm-buildings-3d',
      type: 'fill-extrusion',
      source: 'ofm-planet',
      'source-layer': 'building',
      minzoom: 14,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': '#d6d3d1',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 0],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.8,
      },
    }, before);
  }
}

function removeOfm3dBuildings() {
  if (map.getLayer('ofm-buildings-3d')) map.removeLayer('ofm-buildings-3d');
  if (map.getSource('ofm-planet')) map.removeSource('ofm-planet');
}

async function setBasemap(kind, { persist = true } = {}) {
  const btn = document.getElementById('basemap-3d');
  if (kind === 'ofm3d') {
    if (btn) btn.disabled = true;
    try {
      // Probe TileJSON (same URL MapLibre uses) with timeout.
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      let r;
      try {
        r = await fetch(OFM_PLANET_URL, { signal: ctrl.signal, cache: 'no-cache' });
      } finally {
        clearTimeout(t);
      }
      if (!r.ok) throw new Error(`OFM HTTP ${r.status}`);
      const tj = await r.json();
      if (!tj?.tiles?.length) throw new Error('OFM TileJSON sin tiles');
      ensureOfm3dBuildings();
      basemapKind = 'ofm3d';
      if (persist) try { localStorage.setItem(BASEMAP_STORE, 'ofm3d'); } catch { /* */ }
      // Always pitch; if city-overview (z<15) zoom in so Liberty buildings appear.
      const ease = { pitch: 52, bearing: -18, duration: 700 };
      if (map.getZoom() < 15) ease.zoom = 15;
      map.easeTo(ease);
    } catch (err) {
      console.warn('[svmap] OpenFreeMap 3D no disponible:', err?.message || err);
      removeOfm3dBuildings();
      basemapKind = 'carto';
      map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
      if (persist) try { localStorage.setItem(BASEMAP_STORE, 'carto'); } catch { /* */ }
      if (btn) {
        const prev = btn.title;
        btn.title = `3D no disponible: ${err?.message || err}`;
        setTimeout(() => { if (btn) btn.title = prev; syncBasemapToggle(); }, 4000);
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  } else {
    removeOfm3dBuildings();
    basemapKind = 'carto';
    map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
    if (persist) try { localStorage.setItem(BASEMAP_STORE, 'carto'); } catch { /* */ }
  }
  syncBasemapToggle();
}

document.getElementById('basemap-3d')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  setBasemap(basemapKind === 'ofm3d' ? 'carto' : 'ofm3d');
});
syncBasemapToggle();


// While a float/videowall stream is in digital-zoom fullscreen, block map
// scrollZoom/dragPan so the wheel cannot pan/zoom the map underneath.
document.addEventListener('sv-digital-zoom', (e) => {
  if (e.detail?.active) {
    map.scrollZoom.disable();
    map.dragPan.disable();
  } else {
    map.scrollZoom.enable();
    map.dragPan.enable();
  }
});

// While a float is «Controlando», block MapLibre keyboard pan (arrows).
document.addEventListener('sv-ptz-arm', (e) => {
  if (e.detail?.active) map.keyboard?.disable();
  else map.keyboard?.enable();
});

// Encuadra el mapa a las cámaras cargadas
function fitToData() {
  if (!geojson.features.length) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const f of geojson.features) bounds.extend(f.geometry.coordinates);
  map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 });
}

// ─── State ────────────────────────────────────────────────────────────────────

// key: `${server}:${stream}` → composed status (online|standby|unknown|dead|offline)
const statusMap = {};

let activeFeatureId = null;

// ─── Map Load ─────────────────────────────────────────────────────────────────

// No bloquees la app por tiles lentos: oculta el overlay aunque el mapa siga
// descargando el fondo (los puntos aparecen en cuanto el estilo carga).
setTimeout(hideLoading, 8000);

// Las cámaras se agrupan por la columna "grupo" del CSV (la torre/sitio, p. ej.
// I150200700-558). Si una fila no trae grupo, se cae a la coordenada (~1 m) para
// no fusionar cámaras sin grupo. El marcador se colorea según el conjunto:
// verde=todas en línea, rojo=todas fuera, ámbar=mixto. El panel lista cada cámara.
let currentFiltered = geojson.features;

// Llave de grupo: usa "grupo" si existe; si no, la coordenada redondeada.
function keyOf(grupo, coords) {
  const g = String(grupo || '').trim();
  return g ? `g:${g}` : `c:${coords[0].toFixed(5)},${coords[1].toFixed(5)}`;
}
const groupKey = f => keyOf(f.properties.grupo, f.geometry.coordinates);

function buildGroups(features) {
  const groups = new Map();
  for (const f of features) {
    const k = groupKey(f);
    let g = groups.get(k);
    if (!g) { g = { members: [] }; groups.set(k, g); }
    g.members.push(f);
  }
  const out = [];
  for (const [k, g] of groups) {
    let on = 0, standby = 0, off = 0;
    for (const m of g.members) {
      const s = m.properties.status;
      if (isOnlineStatus(s)) on++;
      else if (isDownStatus(s)) off++;
      else if (s !== 'noStream') standby++; // standby | unknown
    }
    const total = g.members.length;
    const available = on + standby;
    let status;
    if (available > 0 && off > 0)       status = 'mixed';   // algunas caídas
    else if (on === total)              status = 'online';  // todas con productor activo
    else if (available === total && on > 0) status = 'online'; // online + standby (todas con edge)
    else if (standby === total)         status = 'standby'; // edge alive, sin stream activo
    else if (off === total)             status = 'offline';
    else if (available > 0)             status = 'standby';
    else                                status = 'noStream';
    const single = total === 1 ? g.members[0].properties : null;
    // posición = centroide de las cámaras del grupo (idéntico para una torre)
    const coords = [
      g.members.reduce((s, m) => s + m.geometry.coordinates[0], 0) / total,
      g.members.reduce((s, m) => s + m.geometry.coordinates[1], 0) / total,
    ];
    out.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: {
        gkey: k, count: total, status,
        tipo: single ? single.tipo : '',
        nombre: single ? single.nombre : (g.members[0].properties.grupo || `${total} cámaras`),
        grupo: g.members[0].properties.grupo || '',
        online: on, standby, offline: off,
      },
    });
  }
  return { type: 'FeatureCollection', features: out };
}

// ─── Alarmas: ubicación por torre y enfoque ─────────────────────────────────
let towerCoords = null;
function towerCoord(tower) {
  if (!towerCoords) {
    towerCoords = new Map();
    const acc = new Map();
    for (const f of geojson.features) {
      const g = (f.properties.grupo || '').trim();
      if (!g) continue;
      const a = acc.get(g) || { x: 0, y: 0, n: 0 };
      a.x += f.geometry.coordinates[0]; a.y += f.geometry.coordinates[1]; a.n++;
      acc.set(g, a);
    }
    for (const [g, a] of acc) towerCoords.set(g.toUpperCase(), [a.x / a.n, a.y / a.n]);
  }
  return towerCoords.get(String(tower || '').toUpperCase()) || null;
}

// Íconos de alarma generados en canvas: círculo sólido para una alarma, o
// dividido en mitades (color + etiqueta de cada tipo) cuando el sitio tiene
// SOS y Tamper a la vez — un solo marcador exactamente sobre el PMI.
const ALARM_ACK = '#f59e0b';
const ALARM_TYPE_COLOR = { sos: '#dc2626', tamper: '#7c3aed' };
const alarmColor = a => a.status === 'ack' ? ALARM_ACK : (ALARM_TYPE_COLOR[a.type] || '#dc2626');
const alarmLabel = a => a.type === 'tamper' ? 'T' : a.type === 'sos' ? 'SOS' : '!';

const ICON_PX = 48;   // tamaño lógico del icono
function ensureAlarmIcon(parts) {   // parts: [{color, label}] (1 o 2)
  const name = 'al:' + parts.map(p => `${p.color}${p.label}`).join('|');
  if (map.hasImage(name)) return name;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = ICON_PX * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const cx = ICON_PX / 2, cy = ICON_PX / 2, r = ICON_PX / 2 - 2;
  if (parts.length === 1) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = parts[0].color; ctx.fill();
  } else {
    // mitad superior / mitad inferior + divisor blanco (las etiquetas usan
    // el ancho completo del círculo)
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI); ctx.closePath();
    ctx.fillStyle = parts[0].color; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.closePath();
    ctx.fillStyle = parts[1].color; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Match Grabación / --font-sans (Fira); MapLibre symbol glyphs stay Noto Sans SDF.
  if (parts.length === 1) {
    ctx.font = "700 13px 'Fira Sans', system-ui, sans-serif";
    ctx.fillText(parts[0].label, cx, cy + 0.5);
  } else {
    ctx.font = "700 11px 'Fira Sans', system-ui, sans-serif";
    ctx.fillText(parts[0].label, cx, cy - r / 2);
    ctx.fillText(parts[1].label, cx, cy + r / 2);
  }
  map.addImage(name, ctx.getImageData(0, 0, cv.width, cv.height), { pixelRatio: dpr });
  return name;
}

/** Prefer tower id so SOS+Tamper on the same PMI share one marker even if lat/lng differ slightly. */
function alarmSiteKey(a, c) {
  const t = String(a.tower || '').trim().toUpperCase();
  if (t) return `t:${t}`;
  return `c:${Number(c[0]).toFixed(5)},${Number(c[1]).toFixed(5)}`;
}

/** Same pick order as camera-marker click: online → PTZ → first. */
function pickGroupRep(members) {
  if (!members?.length) return null;
  return members.find(m => m.properties.status === 'online')
    || members.find(m => m.properties.tipo === 'PTZ')
    || members[0];
}

function updateAlarmLayer(alarms) {
  const src = map.getSource('alarms');
  if (!src) return;
  // Agrupa por PMI/torre (fallback coord): un sitio = un marcador
  const groups = new Map();
  for (const a of alarms) {
    const c = (a.tower && towerCoord(a.tower)) ||
      (a.lng != null && a.lat != null ? [a.lng, a.lat] : null);
    if (!c) continue;
    const k = alarmSiteKey(a, c);
    if (!groups.has(k)) groups.set(k, { c, items: [] });
    const g = groups.get(k);
    g.items.push(a);
    // Prefer tower centroid when available (keeps badge on the PMI marker).
    if (a.tower) {
      const tc = towerCoord(a.tower);
      if (tc) g.c = tc;
    }
  }
  const feats = [];
  for (const { c, items } of groups.values()) {
    // Dedup by alarm id (MQTT/poll can briefly list the same row twice).
    const seen = new Set();
    const uniq = items.filter(a => {
      const id = a.id;
      if (id == null || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    uniq.sort((x, y) => (x.type === 'sos' ? 0 : 1) - (y.type === 'sos' ? 0 : 1));   // SOS arriba
    // Collapse to one SOS + one Tamper badge (status types, not N opens).
    const byType = new Map();
    for (const a of uniq) {
      if (!byType.has(a.type)) byType.set(a.type, a);
    }
    const badge = [...byType.values()].sort(
      (x, y) => (x.type === 'sos' ? 0 : 1) - (y.type === 'sos' ? 0 : 1),
    );
    if (badge.length <= 2) {
      const icon = ensureAlarmIcon(badge.map(a => ({ color: alarmColor(a), label: alarmLabel(a) })));
      feats.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: [...c] },
        properties: {
          ids: JSON.stringify(uniq.map(a => a.id)),
          tower: uniq[0].tower || badge[0].tower || '',
          icon,
        },
      });
    } else {
      // 3+ tipos distintos (raro): abanico ~5 m
      const R = 0.000045;
      badge.forEach((a, i) => {
        const ang = (2 * Math.PI * i) / badge.length;
        feats.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [c[0] + R * Math.sin(ang), c[1] + R * Math.cos(ang) * 0.92] },
          properties: {
            ids: JSON.stringify([a.id]), tower: a.tower || '',
            icon: ensureAlarmIcon([{ color: alarmColor(a), label: alarmLabel(a) }]),
          },
        });
      });
    }
  }
  src.setData({ type: 'FeatureCollection', features: feats });
}

function focusTower(tower) {
  const key = String(tower || '').toUpperCase();
  const members = geojson.features.filter(f => (f.properties.grupo || '').toUpperCase() === key);
  if (members.length) {
    const rep = pickGroupRep(members);
    map.flyTo({
      center: rep.geometry.coordinates, zoom: 17, duration: 700,
      padding: { right: 380 }, ...view3dOpts(),
    });
    openPanel(rep.properties, rep.id, rep.geometry.coordinates, true, {
      alarmKinds: alarmKindsForTower(tower),
    });
  } else {
    const c = towerCoord(tower);
    if (c) map.flyTo({ center: c, zoom: 16, duration: 700, ...view3dOpts() });
  }
}
window.__focusTower = focusTower;

/** Active SOS / Tamper kinds for a PMI (matches map badge colors). */
function alarmKindsForTower(tower) {
  const key = String(tower || '').toUpperCase();
  const kinds = { sos: false, tamper: false };
  if (!key) return kinds;
  for (const a of getActiveAlarms()) {
    if (String(a.tower || '').toUpperCase() !== key) continue;
    if (a.type === 'sos') kinds.sos = true;
    else if (a.type === 'tamper') kinds.tamper = true;
  }
  return kinds;
}

/** Float frame = marker language: red SOS, purple Tamper, top/bottom split both. */
function applyFloatAlarmChrome(inst, kinds) {
  if (!inst?.el) return;
  const el = inst.el;
  el.classList.remove('fp-alarm-sos', 'fp-alarm-tamper', 'fp-alarm-sos-tamper');
  const sos = !!kinds?.sos;
  const tamper = !!kinds?.tamper;
  inst.alarmKinds = (sos || tamper) ? { sos, tamper } : null;
  if (sos && tamper) el.classList.add('fp-alarm-sos-tamper');
  else if (sos) el.classList.add('fp-alarm-sos');
  else if (tamper) el.classList.add('fp-alarm-tamper');
}

// El panel/insignia de alarmas NO depende del mapa base (SOS es crítico):
// se inicia de inmediato; los marcadores se pintan cuando el mapa cargue.
initAlarms(updateAlarmLayer);

/**
 * Detección (events.db) → feature del mapa. El nombre de cámara de SecureVu no
 * siempre trae el mismo servidor que el inventario (p.ej. la misma LPR vista por
 * `.49` está registrada en `.144`), así que el servidor sólo desempata: primero
 * stream exacto, luego prefijo/substring y por último el PMI del nombre.
 */
function resolveDetectionCamera(server, camera) {
  const cams = (typeof geojson !== 'undefined' && geojson?.features) ? geojson.features : [];
  const base = String(camera || '').toLowerCase();
  if (!base || !cams.length) return null;
  const srv = String(server || '');
  const streamOf = (f) => String(f.properties?.stream || '').toLowerCase();
  const sameSrv = (f) => !srv || !f.properties?.server || f.properties.server === srv;

  let hits = cams.filter(f => streamOf(f) === base && sameSrv(f));
  if (!hits.length) hits = cams.filter(f => streamOf(f) === base);
  if (!hits.length) {
    hits = cams.filter((f) => {
      const s = streamOf(f);
      return s.startsWith(`${base}_`) || s.includes(base);
    });
  }
  if (!hits.length) {
    const pmi = base.match(/i150200700[_\s/-]*(\d{3,4})/);
    if (pmi) {
      const key = `I150200700-${pmi[1]}`;
      hits = cams.filter(f => String(f.properties?.grupo || '').toUpperCase() === key);
    }
  }
  if (!hits.length) return null;
  return hits.length > 1 ? (pickGroupRep(hits) || hits[0]) : hits[0];
}

/** Abre el float de la cámara de una detección (nunca redirige a SecureVu). */
function openDetectionCamera({ server, camera }) {
  const hit = resolveDetectionCamera(server, camera);
  if (!hit) {
    alert(`La cámara «${camera}» no está en el inventario del mapa.`
      + ' Usa el enlace SecureVu de la tarjeta para revisar el evento.');
    return false;
  }
  map.flyTo({
    center: hit.geometry.coordinates, zoom: 17, duration: 700,
    padding: { right: 380 }, ...view3dOpts(),
  });
  openPanel(hit.properties, hit.id, hit.geometry.coordinates, true);
  return true;
}

initDetections({ onViewCamera: openDetectionCamera });

// Deep link desde la ventana de Detecciones: ?cam=<stream>&srv=<ip> abre el float.
// Tras `load` + un frame: openPanel necesita el resto del módulo ya evaluado.
{
  const q = new URLSearchParams(location.search);
  const camParam = q.get('cam');
  if (camParam) {
    map.once('load', () => requestAnimationFrame(() => {
      openDetectionCamera({ server: q.get('srv') || '', camera: camParam });
    }));
  }
}

// Enlace profundo desde un ticket FreshService: ?alarm=<id> abre esa alarma.
const alarmParam = new URLSearchParams(location.search).get('alarm');
if (alarmParam) focusAlarm(Number(alarmParam));


map.on('style.load', () => {
  // Re-add layers if a style swap wiped sources (historical OFM→empty wipe).
  if (_mapLoadDone && !map.getSource('cameras')) map.fire('load');
  // Re-apply 3D buildings after any style reload.
  if (_mapLoadDone && basemapKind === 'ofm3d') {
    try { ensureOfm3dBuildings(); } catch (e) { console.warn('[svmap] 3d buildings:', e); }
  }
});
map.on('load', () => {
  const firstLoad = !_mapLoadDone;
  _mapLoadDone = true;
  if (map.getSource('cameras')) {
    map.getSource('cameras').setData(buildGroups(currentFiltered));
    if (map.getSource('alarms')) updateAlarmLayer(getActiveAlarms());
    hideLoading();
    return;
  }

  fitToData();

  map.addSource('cameras', {
    type: 'geojson',
    data: buildGroups(geojson.features),
  });

  // Marcador por ubicación (agrega cámaras co-localizadas de una misma torre)
  map.addLayer({
    id: 'cameras',
    type: 'circle',
    source: 'cameras',
    paint: {
      'circle-radius': [
        // un poco más grande cuando agrupa varias cámaras
        'interpolate', ['linear'], ['zoom'],
        5,  ['case', ['>', ['get', 'count'], 1], 5, 3],
        13, ['case', ['>', ['get', 'count'], 1], 8, 5],
        17, ['case', ['>', ['get', 'count'], 1], 14, 10],
      ],
      'circle-color': [
        'match', ['get', 'status'],
        'online',  COLOR.online,
        'standby', COLOR.standby,
        'unknown', COLOR.unknown,
        'offline', COLOR.offline,
        'dead',    COLOR.offline, // edge TCP:554 dead = fuera (rojo)
        'mixed',   COLOR.mixed,
        COLOR.noStream,
      ],
      'circle-stroke-width': ['case', ['>', ['get', 'count'], 1], 2, 1.5],
      'circle-stroke-color': 'rgba(255,255,255,0.85)',
    },
  });

  // Anillo de tipo PTZ/LPR — solo cuando la ubicación tiene una sola cámara
  map.addLayer({
    id: 'camera-type',
    type: 'circle',
    source: 'cameras',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'], 13, 8, 17, 14,
      ],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': [
        'case',
        ['==', ['get', 'tipo'], 'PTZ'], '#cbd5e1',
        ['==', ['get', 'tipo'], 'LPR'], '#fdba74',
        'rgba(0,0,0,0)',
      ],
    },
  });

  // Número de cámaras cuando hay más de una en la misma ubicación
  map.addLayer({
    id: 'camera-count',
    type: 'symbol',
    source: 'cameras',
    filter: ['>', ['get', 'count'], 1],
    layout: {
      'text-field': ['to-string', ['get', 'count']],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9, 17, 12],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': 'rgba(0,0,0,0.6)',
      'text-halo-width': 1.2,
    },
  });


  // ─── Alarmas SecureTrax (capa de marcadores) ────────────────────────────────
  map.addSource('alarms', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  // Halo pulsante (círculo transparente con borde blanco) + área de clic
  map.addLayer({
    id: 'alarms',
    type: 'circle',
    source: 'alarms',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 10, 13, 15, 17, 22],
      'circle-color': '#ffffff',
      'circle-opacity': 0,
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
    },
  });
  // Ícono generado en canvas: sólido (una alarma) o mitades SOS|T (ambas)
  map.addLayer({
    id: 'alarm-icon',
    type: 'symbol',
    source: 'alarms',
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.42, 13, 0.62, 17, 0.9],
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
    },
  });
  // pulso del marcador de alarma
  let alarmPulse = 0;
  setInterval(() => {
    if (!map.getLayer('alarms')) return;
    alarmPulse = (alarmPulse + 1) % 2;
    map.setPaintProperty('alarms', 'circle-stroke-width', alarmPulse ? 3 : 6);
  }, 700);

  map.on('click', 'alarms', e => {
    // One PMI click → one float. Merge ids from stacked hit features (SOS+Tamper)
    // but only open the tower panel once.
    const hits = e.features || [];
    const idSet = new Set();
    let tower = '';
    for (const f of hits) {
      const p = f.properties || {};
      if (!tower && p.tower) tower = p.tower;
      try {
        for (const id of JSON.parse(p.ids || '[]')) idSet.add(id);
      } catch { /* ignore bad props */ }
    }
    if (tower) focusTower(tower);
    const ids = [...idSet];
    if (ids.length) focusAlarm(ids.length === 1 ? ids[0] : ids);
  });
  map.on('mouseenter', 'alarms', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'alarms', () => { map.getCanvas().style.cursor = ''; });

  // pinta marcadores con las alarmas ya cargadas por el panel
  updateAlarmLayer(getActiveAlarms());

  // ─── SecureTrax devices (GPS flota) + Howen VSS pairs ───────────────────────
  map.addSource('traccar', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'traccar',
    type: 'circle',
    source: 'traccar',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 13, 5, 17, 8],
      'circle-color': [
        'case',
        ['==', ['get', 'howen'], 1],
        ['match', ['get', 'status'],
          'online', '#7c3aed',
          'offline', '#6b7280',
          '#a78bfa'],
        ['match', ['get', 'status'],
          'online', '#2563eb',
          'offline', '#64748b',
          '#38bdf8'],
      ],
      'circle-stroke-width': [
        'case', ['==', ['get', 'howen'], 1], 2.2, 1.5,
      ],
      'circle-stroke-color': [
        'case', ['==', ['get', 'howen'], 1], '#fbbf24', '#ffffff',
      ],
    },
  });
  map.addLayer({
    id: 'traccar-label',
    type: 'symbol',
    source: 'traccar',
    minzoom: 12,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 10,
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': 'rgba(255,255,255,0.9)',
      'text-halo-width': 1.2,
    },
  });
  let traccarById = new Map();
  map.addSource('howen-orphan', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'howen-orphan',
    type: 'circle',
    source: 'howen-orphan',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 13, 5, 17, 7],
      'circle-color': [
        'match', ['get', 'status'],
        'online', '#c026d3',
        '#9ca3af',
      ],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#f5d0fe',
    },
  });
  let howenOrphanByNo = new Map();
  async function refreshTraccar() {
    try {
      const data = await api('/api/traccar/devices');
      traccarById = new Map();
      const features = (data.devices || []).map(d => {
        const hasHowen = !!(d.howen && d.howen.deviceNo);
        traccarById.set(String(d.id), d);
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
          properties: {
            id: d.id,
            name: d.name,
            status: d.status || 'unknown',
            uniqueId: d.uniqueId || '',
            speed: d.speed ?? '',
            plate: d.plate || d.howen?.plate || '',
            howen: hasHowen ? 1 : 0,
            howenDeviceNo: d.howen?.deviceNo || '',
            howenOnline: d.howen?.online ? 1 : 0,
            howenChannels: d.howen?.channelCount || 0,
          },
        };
      });
      map.getSource('traccar')?.setData({ type: 'FeatureCollection', features });
      const el = document.getElementById('stat-traccar');
      if (el) {
        const n = features.length;
        el.textContent = n ? String(n) : '';
        el.classList.toggle('hidden', !n);
        el.style.display = n ? '' : 'none';
      }
      const hw = document.getElementById('stat-howen');
      if (hw) {
        const n = data.paired ?? features.filter(f => f.properties.howen).length;
        hw.textContent = n ? `${n} VSS` : '';
        hw.classList.toggle('hidden', !n);
      }
    } catch (_) { /* silent — integration may be off */ }
    try {
      const h = await api('/api/howen/devices');
      howenOrphanByNo = new Map();
      const orphans = (h.unpaired || []).map(d => {
        howenOrphanByNo.set(String(d.deviceNo), d);
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
          properties: {
            deviceNo: d.deviceNo,
            name: d.name || d.deviceNo,
            plate: d.plate || '',
            status: d.online ? 'online' : 'offline',
            channelCount: d.channelCount || 0,
          },
        };
      });
      map.getSource('howen-orphan')?.setData({ type: 'FeatureCollection', features: orphans });
    } catch (_) { /* optional */ }
  }
  refreshTraccar();
  setInterval(refreshTraccar, 15000);

  map.on('click', 'traccar', e => {
    const f = e.features[0];
    if (!f) return;
    const d = traccarById.get(String(f.properties.id));
    openFleetPanel(d || {
      id: f.properties.id,
      name: f.properties.name,
      status: f.properties.status,
      uniqueId: f.properties.uniqueId,
      plate: f.properties.plate,
      howen: f.properties.howenDeviceNo ? {
        deviceNo: f.properties.howenDeviceNo,
        plate: f.properties.plate,
        channelCount: f.properties.howenChannels,
        online: !!f.properties.howenOnline,
      } : null,
    }, f.geometry.coordinates);
  });
  map.on('click', 'howen-orphan', e => {
    const f = e.features[0];
    if (!f) return;
    const d = howenOrphanByNo.get(String(f.properties.deviceNo));
    if (!d) return;
    openFleetPanel({
      id: `howen:${d.deviceNo}`,
      name: d.name || `Howen ${d.deviceNo}`,
      status: d.online ? 'online' : 'offline',
      uniqueId: d.deviceNo,
      plate: d.plate,
      howen: {
        deviceNo: d.deviceNo,
        plate: d.plate,
        channelCount: d.channelCount,
        channelNames: d.channelNames,
        online: d.online,
        videoUrl: d.videoUrl,
        group: d.group,
        name: d.name,
      },
    }, f.geometry.coordinates);
  });
  map.on('mouseenter', 'traccar', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'traccar', () => { map.getCanvas().style.cursor = ''; });
  map.on('mouseenter', 'howen-orphan', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'howen-orphan', () => { map.getCanvas().style.cursor = ''; });

  // ─── Interactions ──────────────────────────────────────────────────────────

  map.on('click', 'cameras', e => {
    // Alarm badge sits on the PMI: both layers hit on one click. Alarm handler
    // owns the open — skip here so SOS+Tamper does not stack a second float.
    if (map.getLayer('alarms')) {
      const alarmHits = map.queryRenderedFeatures(e.point, { layers: ['alarms'] });
      if (alarmHits.length) return;
    }
    const g = e.features[0];
    const k = g.properties.gkey;
    const members = currentFiltered.filter(f => groupKey(f) === k);
    if (!members.length) return;
    const rep = pickGroupRep(members);
    openPanel(rep.properties, rep.id, rep.geometry.coordinates);
  });

  // Mantener todos los floats anclados al pan/zoom/resize
  map.on('move', positionAllPanels);
  map.on('zoom', positionAllPanels);
  map.on('resize', positionAllPanels);

  // ── Hover tooltip ──────────────────────────────────────────────────────────
  const hoverPopup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 10,
    className: 'hover-popup',
  });

  map.on('mouseenter', 'cameras', e => {
    map.getCanvas().style.cursor = 'pointer';
    const f = e.features[0];
    const { nombre, grupo, count, online, offline, standby } = f.properties;
    const coords = f.geometry.coordinates.slice();
    const title = count > 1
      ? `${count} cámaras · ${online} en línea` +
        (standby ? `, ${standby} en espera` : '') +
        (offline ? `, ${offline} fuera` : '')
      : nombre;
    hoverPopup
      .setLngLat(coords)
      .setHTML(`<span class="hp-name">${title}</span>${grupo ? `<span class="hp-grupo">${grupo}</span>` : ''}`)
      .addTo(map);
  });

  map.on('mouseleave', 'cameras', () => {
    map.getCanvas().style.cursor = '';
    hoverPopup.remove();
  });

  // ─── Init UI ───────────────────────────────────────────────────────────────
  hideLoading();

  const total = geojson.features.length;
  document.getElementById('stat-total').textContent = `${total} cámaras`;

  // Populate grupo / tipo dropdowns from the data itself
  populateServerSelect(geojson.features.map(f => f.properties.server));
  populateSelect('filter-tipo',     geojson.features.map(f => f.properties.tipo));

  // Kick off status polling immediately, then every 60 s
  pollAllStatus();
  setInterval(pollAllStatus, 60_000);

  // Restore 3D pref after markers exist (fail-soft → stay Carto).
  if (firstLoad && readBasemapPref() === 'ofm3d') {
    setBasemap('ofm3d', { persist: false });
  }

  // First-login spotlight tour (once per username in localStorage).
  if (firstLoad) maybeAutoStartTour(me);
});

function populateSelect(id, values) {
  const sel = document.getElementById(id);
  const unique = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  for (const v of unique) {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  }
}

/** Filtro de servidor: value=IP (filtro), label=proyecto (shared/serverNames). */
function populateServerSelect(values) {
  const sel = document.getElementById('filter-servidor');
  const unique = [...new Set(values.filter(Boolean))];
  unique.sort((a, b) =>
    serverLabel(a, SERVER_NAMES).localeCompare(serverLabel(b, SERVER_NAMES), 'es'));
  for (const ip of unique) {
    const o = document.createElement('option');
    o.value = ip;
    o.textContent = serverLabel(ip, SERVER_NAMES);
    o.title = ip;
    sel.appendChild(o);
  }
}

// ─── Status Polling ───────────────────────────────────────────────────────────

function baseName(stream) {
  for (const suf of [SUFFIXES.main, SUFFIXES.sub]) {
    if (suf && stream.endsWith(suf)) return stream.slice(0, -suf.length);
  }
  return stream;
}

async function pollAllStatusGo2rtcFallback() {
  await Promise.all(SERVERS.map(async server => {
    try {
      const resp = await fetch(`/sv/${server}/api/streams`, {
        signal: AbortSignal.timeout(8000),
      });
      const data = await resp.json();
      const producersByBase = {};
      for (const [name, info] of Object.entries(data)) {
        const base = baseName(name);
        (producersByBase[base] ||= []).push(...(info?.producers || []));
      }
      for (const [base, producers] of Object.entries(producersByBase)) {
        const bucket = classifyProducers(producers);
        if (bucket) statusMap[`${server}:${base}`] = bucket;
      }
    } catch {
      // server unreachable – leave existing status unchanged
    }
  }));
}

/**
 * Canonical: GET /api/status/live (edge+sesión compuesto = «Ahora»).
 * Fallback: go2rtc /api/streams (sesión-only; fuera≈0 sin edge).
 */
async function pollAllStatus() {
  let usedLive = false;
  try {
    const resp = await fetch('/api/status/live', { signal: AbortSignal.timeout(8000) });
    if (resp.ok) {
      const live = await resp.json();
      if (live && typeof live === 'object') {
        for (const [key, v] of Object.entries(live)) {
          const s = (v && typeof v === 'object' ? v.status : v) || 'unknown';
          statusMap[key] = s;
        }
        usedLive = Object.keys(live).length > 0;
      }
    }
  } catch {
    usedLive = false;
  }
  if (!usedLive) await pollAllStatusGo2rtcFallback();

  applyStatusToMap();
  applyFilters();        // re-render after status update (setData resets property reads)
}

function applyStatusToMap() {
  let online = 0, standby = 0, offline = 0;
  for (const f of geojson.features) {
    const { server, stream, hasStream } = f.properties;
    if (!hasStream) continue;
    // Missing key → unknown (ámbar), NUNCA offline por defecto
    const s = statusMap[`${server}:${stream}`] || 'unknown';
    f.properties.status = s;
    // Mismo bucket que overview «Ahora» (dead → fuera)
    const b = bucketFromMapStatus(s);
    if (b === 'online') online++;
    else if (b === 'offline') offline++;
    else standby++;
  }
  document.getElementById('stat-online').textContent  = `${online} en línea`;
  // “fuera” = edge dead / offline real; standby idle ≠ fuera
  document.getElementById('stat-offline').textContent = `${offline} fuera`;
  const el = document.getElementById('stat-standby');
  if (el) el.textContent = standby ? `${standby} en espera` : '';
  // Modal «Ahora» y pills comparten estos números (clasificador compuesto).
  publishLiveStatusCounts({
    online, standby, offline, total: online + standby + offline,
  });
}

// ─── Multi float panels + multi-select → Videowall ───────────────────────────

const panelsLayer = document.getElementById('panels-layer');
const panelTpl = document.getElementById('float-panel-tpl');
const selBar = document.getElementById('sel-bar');
const selCount = document.getElementById('sel-count');
const panelsClearBtn = document.getElementById('panels-clear');

const SELECT_STORE = 'securevu-map-selected';
const VIDEOWALL_STORE = 'securevu-videowall';
/** @type {Map<string, object>} */
const selectedCams = new Map();
/** @type {Map<string, any>} */
const openPanels = new Map();
let zTop = 20;
let focusedPanelKey = null;

onIntercomStateFloat = (st) => {
  if (st.status === 'in_call' && st.incoming?.grupo) {
    intercomActiveProps = {
      grupo: st.incoming.grupo,
      nombre: st.incoming.label || st.incoming.grupo,
      pmi: st.incoming.pmi,
    };
  }
  for (const inst of openPanels.values()) applyFloatIntercomVisual(inst, st);
};

function camSelectKey(p) {
  if (!p?.server || !p?.stream) return null;
  return `${p.server}:${p.stream}`;
}

function panelKeyFromProps(props, featureId) {
  return camSelectKey(props) || (featureId != null ? `feat:${featureId}` : null);
}

function syncPanelPtz(inst) {
  if (!inst || inst.kind !== 'camera') {
    try { inst?.ptz?.destroy?.(); } catch { /* */ }
    inst && (inst.ptz = null);
    return;
  }
  if (!userCanPtz()) return;
  const footer = inst.el.querySelector('.fp-footer');
  if (!footer) return;
  const id = `float:${inst.key}`;
  if (!inst.ptz || inst.ptz.pill?.dataset?.ptzId !== id) {
    try { inst.ptz?.destroy?.(); } catch { /* */ }
    const icPill = footer.querySelector('.fp-intercom-pill');
    inst.ptz = attachPtzPill(footer, {
      id,
      getProps: () => inst.props || {},
      // Keep Hablar immediately after Control disponible / Controlando
      insertBefore: icPill || null,
    });
  }
  inst.ptz?.sync?.(inst.props || {});
  try { inst.zoom?.syncHud?.(); } catch { /* */ }
}

/** Header title text = SecureVu camera link (opens :8971). */
function updatePanelMeta(inst, props) {
  const link = inst.el.querySelector('.fp-title');
  if (!link) return;
  const label = props?.nombre || props?.stream || 'Cámara';
  link.textContent = label;
  if (props?.server && props?.stream) {
    link.href = `https://${props.server}:8971/#${props.stream}`;
    link.title = `Abrir en SecureVu · ${label}`;
    link.classList.remove('fp-title-nolink');
    link.removeAttribute('aria-disabled');
  } else {
    link.removeAttribute('href');
    link.title = label;
    link.classList.add('fp-title-nolink');
    link.setAttribute('aria-disabled', 'true');
  }
  syncPanelPtz(inst);
}

/** Serialize a camera feature/props for Videowall localStorage / #cams=. */
function camSelectPayload(p) {
  return {
    server: p.server,
    stream: p.stream,
    nombre: p.nombre,
    grupo: p.grupo,
    tipo: p.tipo,
    ip: p.ip,
  };
}

/**
 * All geojson members of the same PMI/tower as this camera
 * (same key as map marker clustering: grupo, else ~1 m coords).
 */
function groupMembersForCam(props, coords) {
  if (!props || !coords) return [];
  const k = keyOf(props.grupo, coords);
  return geojson.features.filter(f => groupKey(f) === k);
}

/** Selectable streams in the PMI (server+stream). */
function selectableKeysInGroup(props, coords) {
  return groupMembersForCam(props, coords)
    .map(f => camSelectKey(f.properties))
    .filter(Boolean);
}

function isGroupFullySelected(props, coords) {
  const keys = selectableKeysInGroup(props, coords);
  return keys.length > 0 && keys.every(k => selectedCams.has(k));
}

/** Add every camera of the PMI to Videowall selection. */
function selectPmiGroup(props, coords) {
  for (const f of groupMembersForCam(props, coords)) {
    const p = f.properties;
    const k = camSelectKey(p);
    if (k) selectedCams.set(k, camSelectPayload(p));
  }
}

/** Remove every camera of the PMI from selection. */
function deselectPmiGroup(props, coords) {
  for (const k of selectableKeysInGroup(props, coords)) {
    selectedCams.delete(k);
  }
}

function loadSelectedFromStore() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SELECT_STORE) || '[]');
    if (!Array.isArray(raw)) return;
    for (const p of raw) {
      const k = camSelectKey(p);
      if (k) selectedCams.set(k, p);
    }
  } catch { /* */ }
  renderSelBar();
}

function persistSelected() {
  sessionStorage.setItem(SELECT_STORE, JSON.stringify([...selectedCams.values()]));
  renderSelBar();
}

function renderSelBar() {
  const n = selectedCams.size;
  if (!selBar) return;
  selBar.classList.toggle('hidden', n === 0);
  if (selCount) {
    selCount.textContent = String(n);
    const groups = new Set(
      [...selectedCams.values()].map(c => String(c.grupo || '').trim()).filter(Boolean)
    );
    selCount.title = groups.size
      ? `${n} cámaras · ${groups.size} PMI`
      : (n === 1 ? '1 cámara seleccionada' : `${n} cámaras seleccionadas`);
  }
}

function updatePanelsClearBtn() {
  panelsClearBtn?.classList.toggle('hidden', openPanels.size === 0);
  document.body.classList.toggle('panel-open', openPanels.size > 0);
}

function positionPanelEl(el, coords) {
  if (!coords || !map || !el) return;
  const pt = map.project(coords);
  const wrap = document.getElementById('map-wrap');
  const ww = wrap.clientWidth;
  const wh = wrap.clientHeight;
  const pw = el.offsetWidth || 190;
  const ph = el.offsetHeight || 230;
  let left = pt.x - pw / 2;
  let top = pt.y - ph - 22;
  if (top < 6) top = pt.y + 22;
  left = Math.max(6, Math.min(left, ww - pw - 6));
  top = Math.max(6, Math.min(top, wh - ph - 6));
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function positionAllPanels() {
  for (const inst of openPanels.values()) {
    positionPanelEl(inst.el, inst.coords);
  }
}

function bringToFront(inst) {
  zTop += 1;
  inst.el.style.zIndex = String(zTop);
  focusedPanelKey = inst.key;
  intercomActiveProps = inst.kind === 'camera' ? inst.props : null;
}

function syncPanelCheckbox(inst) {
  const cb = inst.el.querySelector('.fp-select-cb');
  if (!cb) return;
  if (inst.kind !== 'camera') {
    cb.disabled = true;
    cb.checked = false;
    return;
  }
  const k = camSelectKey(inst.props);
  cb.disabled = !k;
  // Checked when the whole PMI/group is in the Videowall selection
  cb.checked = !!(k && isGroupFullySelected(inst.props, inst.coords));
  const n = selectableKeysInGroup(inst.props, inst.coords).length;
  const label = inst.el.querySelector('.fp-select');
  if (label) {
    label.title = n > 1
      ? `Videowall: añadir las ${n} cámaras del PMI`
      : 'Videowall: añadir esta cámara';
  }
}

function syncAllCheckboxes() {
  for (const inst of openPanels.values()) syncPanelCheckbox(inst);
}

function encodeCamsForHash(cams) {
  const json = JSON.stringify(cams);
  return btoa(unescape(encodeURIComponent(json)));
}

function openVideowall() {
  if (!selectedCams.size) return;
  const cams = [...selectedCams.values()];
  const payload = JSON.stringify(cams);
  try { localStorage.setItem(VIDEOWALL_STORE, payload); } catch { /* */ }
  try { sessionStorage.setItem(VIDEOWALL_STORE, payload); } catch { /* */ }
  const hash = `#cams=${encodeCamsForHash(cams)}`;
  audit('videowall.open', { count: cams.length, streams: cams.map(c => c.stream).slice(0, 20) });
  window.open(`/videowall.html${hash}`, '_blank', 'noopener');
}

/** Hooks for guided tour (tour.js) — open live float + hand off to videowall.html?tour=1. */
window.__svmapTourApi = {
  openDemoFloat() {
    const feats = (geojson?.features || []).filter(
      (f) => f?.properties?.server && f?.properties?.stream && f?.geometry?.coordinates,
    );
    if (!feats.length) return null;
    const isPtzCam = (f) => {
      const t = String(f.properties.tipo || '');
      const s = String(f.properties.stream || '');
      return /ptz/i.test(t) || /_ptz/i.test(s);
    };
    const rank = (f) => {
      const st = statusMap[`${f.properties.server}:${f.properties.stream}`];
      const online = st === 'online' ? 0 : (isDownStatus(st) ? 2 : 1);
      // Prefer PTZ so Control disponible is real when the user can PTZ.
      const ptz = isPtzCam(f) ? 0 : 10;
      return ptz * 10 + online;
    };
    const f = [...feats].sort((a, b) => rank(a) - rank(b))[0];
    for (const inst of [...openPanels.values()]) {
      if (inst?.el?.dataset?.tourDemo === '1') closePanelByKey(inst.key);
    }
    openPanel(f.properties, f.id, f.geometry.coordinates, true);
    const key = panelKeyFromProps(f.properties, f.id);
    const inst = key ? openPanels.get(key) : null;
    if (inst?.el) {
      inst.el.dataset.tourDemo = '1';
      bringToFront(inst);
      // Re-sync PTZ/Hablar after open (async intercom lookup may still run).
      try { syncPanelPtz(inst); } catch { /* */ }
      try { syncFloatIntercom(inst); } catch { /* */ }
    }
    return inst?.el || null;
  },
  floatEl() {
    return document.querySelector('.float-panel[data-tour-demo="1"]')
      || document.querySelector('#panels-layer .float-panel')
      || null;
  },
  expandCamsRail() {
    const el = this.floatEl();
    const box = el?.querySelector('.fp-cameras');
    if (!box || box.classList.contains('hidden')) return;
    if (box.classList.contains('fp-cams-collapsed')) {
      box.querySelector('.fp-cams-chevron')?.click();
    }
  },
  expandRecording() {
    const el = this.floatEl();
    const box = el?.querySelector('.fp-recording:not(.fp-recording-edge)');
    if (!box || box.classList.contains('hidden')) return;
    if (box.classList.contains('fp-rec-collapsed')) {
      box.querySelector('.fp-rec-chevron')?.click();
    }
  },
  /** Show PTZ pill for tour (real or demo). */
  ensureTourPtzVisible() {
    const el = this.floatEl();
    const footer = el?.querySelector('.fp-footer');
    if (!footer) return null;
    let pill = [...footer.querySelectorAll('.ptz-pill')].find((p) => !p.classList.contains('hidden'));
    if (pill) return pill;
    pill = footer.querySelector('.ptz-pill');
    if (pill) {
      pill.classList.remove('hidden');
      pill.dataset.tourForced = '1';
      return pill;
    }
    const demo = document.createElement('button');
    demo.type = 'button';
    demo.className = 'ptz-pill';
    demo.dataset.tourDemo = '1';
    demo.textContent = 'Control disponible';
    demo.title = 'Clic para controlar PTZ con el teclado';
    demo.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    const before = footer.querySelector('.fp-intercom-pill') || footer.querySelector('.fp-select');
    footer.insertBefore(demo, before);
    return demo;
  },
  /** Arm PTZ (Controlando) for visual demo when real pill exists. */
  armTourPtz() {
    const pill = this.ensureTourPtzVisible();
    if (!pill || pill.dataset.tourDemo === '1') return pill;
    const label = (pill.textContent || '').trim();
    if (/Control disponible/i.test(label) || pill.getAttribute('aria-label') === 'Control disponible') {
      try { pill.click(); } catch { /* */ }
    }
    return pill;
  },
  disarmTourPtz() {
    const el = this.floatEl();
    const pill = el?.querySelector('.ptz-pill:not(.hidden)');
    if (!pill || pill.dataset.tourDemo === '1') return;
    const label = (pill.textContent || '').trim();
    if (/Controlando/i.test(label)) {
      try { pill.click(); } catch { /* */ }
    }
  },
  /** Show Hablar for tour (real or forced visible). */
  ensureTourIntercomVisible() {
    const el = this.floatEl();
    const pill = el?.querySelector('.fp-intercom-pill');
    if (!pill) return null;
    if (pill.classList.contains('hidden')) {
      pill.classList.remove('hidden');
      pill.dataset.tourForced = '1';
      if (!pill.textContent?.trim()) pill.textContent = 'Hablar';
    }
    return pill;
  },
  cleanupTourChrome() {
    const el = this.floatEl();
    if (!el) return;
    this.disarmTourPtz();
    el.querySelectorAll('.ptz-pill[data-tour-demo="1"]').forEach((p) => p.remove());
    el.querySelectorAll('[data-tour-forced="1"]').forEach((p) => {
      p.classList.add('hidden');
      delete p.dataset.tourForced;
    });
  },
  ensureVideowallChecked() {
    const el = this.floatEl();
    const cb = el?.querySelector('.fp-select-cb');
    if (!cb || cb.disabled) return false;
    if (!cb.checked) {
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  },
  /** Same-tab navigate for tour continuation. @returns {boolean} */
  goVideowallTour() {
    this.ensureVideowallChecked();
    if (!selectedCams.size) {
      const el = this.floatEl();
      const inst = [...openPanels.values()].find((p) => p.el === el);
      if (inst?.props && inst?.coords) selectPmiGroup(inst.props, inst.coords);
      persistSelected();
    }
    if (!selectedCams.size) return false;
    const cams = [...selectedCams.values()];
    const payload = JSON.stringify(cams);
    try { localStorage.setItem(VIDEOWALL_STORE, payload); } catch { /* */ }
    try { sessionStorage.setItem(VIDEOWALL_STORE, payload); } catch { /* */ }
    const hash = `#cams=${encodeCamsForHash(cams)}`;
    audit('videowall.open', {
      count: cams.length,
      streams: cams.map((c) => c.stream).slice(0, 20),
      tour: true,
    });
    location.assign(`/videowall.html?tour=1${hash}`);
    return true;
  },
  cleanupTourFloat() {
    this.cleanupTourChrome();
    for (const inst of [...openPanels.values()]) {
      if (inst?.el?.dataset?.tourDemo === '1') closePanelByKey(inst.key);
    }
  },
};

loadSelectedFromStore();

const selectionPopup = new maplibregl.Popup({
  closeButton: false,
  closeOnClick: false,
  offset: 12,
  className: 'hover-popup',
  anchor: 'bottom',
});

/** Map filter `tipo` → icon kind (same taxonomy as «Todos los tipos»). */
function camIconKind(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t.includes('lpr') || t.includes('placa') || t.includes('anpr')) return 'lpr';
  if (t.includes('ptz')) return 'ptz';
  // All bullet* + BulletInterna / interna variants → bullet silhouette
  if (t.includes('bullet') || t.includes('bala') || t.includes('interna')) return 'bullet';
  return 'cam';
}

/** Flat 2D float mute — same paths as fullscreen HUD / Alarmas (never emoji). */
const FP_SOUND_SVG = `<svg class="fp-mute-ico" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
  <path fill="currentColor" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"
    d="M5 9.25h2.9L12 5.2v13.6l-4.1-4.05H5z"/>
  <path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"
    d="M15.1 9.1a3.1 3.1 0 0 1 0 5.8"/>
  <path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"
    d="M17.55 6.7a6.1 6.1 0 0 1 0 10.6"/>
</svg>`;
const FP_MUTED_SVG = `<svg class="fp-mute-ico" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
  <path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"
    d="M5 9.25h2.9L12 5.2v13.6l-4.1-4.05H5z"/>
  <path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"
    d="M14.8 8.4l6.4 6.4M21.2 8.4l-6.4 6.4"/>
</svg>`;
function setFpMuteIcon(btn, muted) {
  if (!btn) return;
  btn.innerHTML = muted ? FP_MUTED_SVG : FP_SOUND_SVG;
  btn.classList.toggle('fp-sound-on', !muted);
  btn.title = muted ? 'Activar audio' : 'Silenciar';
  btn.setAttribute('aria-label', muted ? 'Activar audio' : 'Silenciar');
}

/** Inline SVGs — flat 2D, same stroke weight as HUD mute/PTZ icons. */
const CAM_TYPE_ICO = {
  ptz: `<svg class="cam-chip-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><circle cx="8" cy="6.5" r="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.2 10.2 L4.2 13.2 H11.8 L10.8 10.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="6.5" r="1.35" fill="currentColor"/><path d="M3.2 5.2 A5.2 5.2 0 0 1 5 3.4 M12.8 5.2 A5.2 5.2 0 0 0 11 3.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  bullet: `<svg class="cam-chip-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><rect x="1.6" y="5.2" width="8.4" height="5.6" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 6.2 H12.4 C13.3 6.2 14 6.9 14 7.8 V8.2 C14 9.1 13.3 9.8 12.4 9.8 H10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="13.1" cy="8" r="1.15" fill="currentColor"/><path d="M3.2 10.8 V12.2 H8.2 V10.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  lpr: `<svg class="cam-chip-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><rect x="1.8" y="4.4" width="12.4" height="7.2" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3.4 7.2 H12.6 M3.4 9.4 H9.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><rect x="10.2" y="8.5" width="2.4" height="1.8" rx="0.3" fill="currentColor"/></svg>`,
  cam: `<svg class="cam-chip-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><rect x="1.8" y="4.6" width="9.2" height="6.8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M11 6.4 L14.2 4.8 V11.2 L11 9.6 Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="6.4" cy="8" r="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`,
};

/**
 * Grow float video/body so the RIGHT cam rail fits all chips without scrolling.
 * Prefer height growth; if natural height would exceed ~90vh, compact chips
 * slightly and clamp body min-height so the list still has no scrollbar.
 */
function syncCamsRailFit(inst, n) {
  const wrap = inst?.el?.querySelector('.fp-video');
  const panel = inst?.el;
  const box = panel?.querySelector('.fp-cameras');
  if (!wrap || !panel) return;
  if (!n || n < 2 || !box || box.classList.contains('hidden')) {
    wrap.style.minHeight = '';
    panel.classList.remove('fp-cams-compact');
    return;
  }
  const HEAD = 22;
  const LIST_PAD = 10;
  const CHIP = 24;
  const GAP = 4;
  const chrome = 16 + 28 + 28;
  const maxBody = Math.max(120, Math.floor(window.innerHeight * 0.9) - chrome);

  const applyMin = (need, compact) => {
    panel.classList.toggle('fp-cams-compact', !!compact);
    wrap.style.minHeight = `${Math.min(Math.max(need, 0), maxBody)}px`;
  };

  let natural = HEAD + LIST_PAD + n * CHIP + Math.max(0, n - 1) * GAP;
  // Prefer measured content (expanded labels wrap taller than icon-only estimate)
  const head = box.querySelector('.fp-cams-head');
  const list = box.querySelector('.fp-cams-list');
  if (list) {
    const measured = (head?.offsetHeight || HEAD) + list.scrollHeight;
    if (measured > natural) natural = measured;
  }

  if (natural <= maxBody) {
    applyMin(natural, false);
    return;
  }
  applyMin(natural, true);
  // After compact CSS applies, remeasure once
  requestAnimationFrame(() => {
    if (!list || !wrap.isConnected) return;
    const measured = (head?.offsetHeight || HEAD) + list.scrollHeight;
    applyMin(Math.max(measured, HEAD + LIST_PAD), true);
  });
}

/**
 * Collapse/expand multi-cam rail names (icons always visible).
 * Same chevron pattern as Grabación: one shared arrow, class toggles width + labels.
 * Rail sits on the RIGHT of the stream; expanded grows leftward.
 * Expanded rows: icon left, name right. Collapsed chevron → ; expanded ← .
 */
function bindCamsCollapse(panel) {
  if (!panel || panel.dataset.camsCollapseBound) return;
  const box = panel.querySelector('.fp-cameras');
  const chevron = box?.querySelector('.fp-cams-chevron');
  if (!box || !chevron) return;
  panel.dataset.camsCollapseBound = '1';

  box.classList.add('fp-cams-collapsed');
  panel.classList.remove('fp-cams-expanded');

  const syncAria = () => {
    const collapsed = box.classList.contains('fp-cams-collapsed');
    panel.classList.toggle('fp-cams-expanded', !collapsed && !box.classList.contains('hidden'));
    chevron.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  };
  syncAria();

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (box.classList.contains('hidden')) return;
    box.classList.toggle('fp-cams-collapsed');
    syncAria();
    const n = box.querySelectorAll('.cam-chip').length;
    // Find owning panel instance for min-height sync (panel === inst.el)
    const inst = [...openPanels.values()].find((p) => p.el === panel);
    if (inst) {
      requestAnimationFrame(() => syncCamsRailFit(inst, n));
    }
    audit('float.cams_toggle', {
      expanded: !box.classList.contains('fp-cams-collapsed'),
    });
  };
  chevron.addEventListener('click', toggle);
  chevron.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    toggle(e);
  });
}

function renderNearby(inst) {
  const box = inst.el.querySelector('.fp-cameras');
  const list = box?.querySelector('.fp-cams-list') || box;
  if (!box || !list || inst.kind !== 'camera') return;
  bindCamsCollapse(inst.el);
  const coords = inst.coords;
  const activeProps = inst.props;
  const k = keyOf(activeProps.grupo, coords);
  const near = geojson.features
    .filter(f => groupKey(f) === k)
    .sort((x, y) => (x.properties.tipo || '').localeCompare(y.properties.tipo || '') ||
                    (x.properties.nombre || '').localeCompare(y.properties.nombre || ''));
  if (near.length < 2) {
    box.classList.add('hidden');
    list.innerHTML = '';
    inst.el.classList.remove('has-cameras', 'fp-cams-expanded');
    syncCamsRailFit(inst, 0);
    return;
  }

  list.innerHTML = '';
  const counts = {};
  for (const f of near) {
    const p = f.properties;
    const tipo = p.tipo || 'CAM';
    counts[tipo] = (counts[tipo] || 0) + 1;
    const dup = near.filter(o => (o.properties.tipo || 'CAM') === tipo).length > 1;
    const label = `${tipo}${dup ? ' ' + counts[tipo] : ''}`;
    const kind = camIconKind(tipo);
    const ico = CAM_TYPE_ICO[kind] || CAM_TYPE_ICO.cam;

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cam-chip' + (p.stream === activeProps.stream ? ' active' : '');
    // Full name always in title — collapsed icons stay usable via tooltip
    chip.title = p.nombre || label;
    chip.setAttribute('aria-label', p.nombre || label);
    const status = statusMap[`${p.server}:${p.stream}`] || (p.hasStream ? 'unknown' : 'noStream');
    chip.innerHTML =
      `<span class="chip-dot ${chipDotClass(status)}"></span>` +
      ico +
      `<span class="cam-chip-label">${label}</span>`;
    // Row visual: icon | name (dot is absolute badge); collapsed hides label
    chip.addEventListener('click', () => {
      // Switch stream in this popup — do not spawn a second panel at the same pin
      switchPanelCamera(inst, p, f.id, f.geometry.coordinates);
    });
    list.appendChild(chip);
  }
  box.classList.remove('hidden');
  inst.el.classList.add('has-cameras');
  // Keep expand/collapse sticky; only sync panel width class with current rail state
  inst.el.classList.toggle(
    'fp-cams-expanded',
    !box.classList.contains('fp-cams-collapsed'),
  );
  syncCamsRailFit(inst, near.length);
}

/** Replace the camera shown in an existing float panel (sibling chip / in-place switch). */
function switchPanelCamera(inst, props, featureId, coords) {
  if (!inst || inst.kind !== 'camera' || !props) return;
  const newKey = panelKeyFromProps(props, featureId);
  if (!newKey) return;
  if (newKey === inst.key && props.stream === inst.props?.stream) {
    renderNearby(inst);
    return;
  }

  // Re-key map entry so later opens/closes track the active stream
  if (newKey !== inst.key) {
    openPanels.delete(inst.key);
    if (focusedPanelKey === inst.key) focusedPanelKey = newKey;
    inst.key = newKey;
    inst.el.dataset.key = newKey;
    openPanels.set(newKey, inst);
  }

  inst.props = props;
  inst.featureId = featureId;
  if (coords) inst.coords = coords;
  activeFeatureId = featureId;
  bringToFront(inst);

  const title = inst.el.querySelector('.fp-title');
  const dot = inst.el.querySelector('.fp-status-dot');
  const status = props.server
    ? (statusMap[`${props.server}:${props.stream}`] || props.status || 'unknown')
    : undefined;
  dot.className = 'fp-status-dot dot ' + panelDotClass(status);
  updatePanelMeta(inst, props);
  syncFloatIntercom(inst);

  clearHowenOn(inst);
  renderNearby(inst);
  syncPanelCheckbox(inst);

  if (props.server && props.stream) {
    // Playback keeps the same selected time when changing cameras in the PMI rail.
    if (inst.mode === 'playback' && inst.playbackAt) {
      enterFloatPlayback(inst, inst.playbackAt);
    } else {
      // reconnect resets AR on .fp-video wrap only; panel width stays locked via CSS
      inst.player.connect(props.server, props.stream);
    }
    inst.video.muted = true;
    inst.muted = true;
    setFpMuteIcon(inst.el.querySelector('.fp-mute'), true);
    loadCameraRecording(props.server, props.stream, inst.el);
    loadCameraEdgeRecording(props.server, props.stream, inst.el, { canOpen: me.role === 'admin' });
  } else {
    inst.player.disconnect();
    hideCameraRecording(inst.el);
    const msg = inst.el.querySelector('.fp-video-msg');
    msg.textContent = 'Sin stream disponible en SecureVu';
    msg.className = 'fp-video-msg type-warn';
    msg.classList.remove('hidden');
  }

  requestAnimationFrame(() => positionPanelEl(inst.el, inst.coords));
}

function clearHowenOn(inst) {
  const frame = inst.el.querySelector('.fp-howen');
  const video = inst.el.querySelector('.fp-video-el');
  const mjpeg = inst.el.querySelector('.fp-mjpeg');
  const howenOpen = inst.el.querySelector('.fp-howen-open');
  if (frame) {
    frame.src = 'about:blank';
    frame.classList.add('hidden');
  }
  video?.classList.remove('hidden');
  mjpeg?.classList.add('hidden');
  if (howenOpen) {
    howenOpen.classList.add('hidden');
    howenOpen.removeAttribute('href');
  }
}

function showHowenOn(inst, howen) {
  if (!howen?.deviceNo) {
    clearHowenOn(inst);
    return false;
  }
  const frame = inst.el.querySelector('.fp-howen');
  const video = inst.el.querySelector('.fp-video-el');
  const mjpeg = inst.el.querySelector('.fp-mjpeg');
  const msg = inst.el.querySelector('.fp-video-msg');
  const howenOpen = inst.el.querySelector('.fp-howen-open');
  const title = inst.el.querySelector('.fp-title');
  const url = howen.videoUrl || null;
  inst.player?.disconnect();
  video?.classList.add('hidden');
  mjpeg?.classList.add('hidden');
  if (url && frame) {
    frame.classList.remove('hidden');
    frame.src = url;
    msg?.classList.add('hidden');
  } else if (frame) {
    frame.classList.add('hidden');
    frame.src = 'about:blank';
    if (msg) {
      msg.textContent = 'Howen emparejado — token VSS no disponible aún';
      msg.className = 'fp-video-msg type-warn';
      msg.classList.remove('hidden');
    }
  }
  if (howenOpen) {
    if (url) {
      howenOpen.href = url;
      howenOpen.classList.remove('hidden');
    } else {
      howenOpen.classList.add('hidden');
    }
  }
  if (title) {
    const label = `Howen ${howen.deviceNo}` +
      (howen.channelCount ? ` · ${howen.channelCount} ch` : '') +
      (howen.plate ? ` · ${howen.plate}` : '') +
      (howen.online ? ' · online' : '');
    title.textContent = label;
    title.title = label;
    if (url) {
      title.href = url;
      title.classList.remove('fp-title-nolink');
    } else {
      title.removeAttribute('href');
      title.classList.add('fp-title-nolink');
    }
  }
  return true;
}

function bindQualityToggle(btn, player) {
  if (!btn || !player) return;
  const sync = () => { btn.dataset.quality = player.quality || 'sd'; };
  sync();
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = player.quality === 'hd' ? 'sd' : 'hd';
    player.setQuality(next);
    sync();
    audit('quality.switch', { quality: next });
  });
}

function playbackLabel(at) {
  return new Date(Number(at) * 1000).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function syncPlaybackToggle(inst) {
  const btn = inst.el.querySelector('.fp-playback-toggle');
  if (!btn) return;
  btn.textContent = inst.video.paused ? 'Reproducir' : 'Pausa';
}

const PLAYBACK_RATES = [1, 2, 4, 8, 16];

function applyPlaybackRate(inst) {
  const rate = PLAYBACK_RATES.includes(inst.playbackRate) ? inst.playbackRate : 1;
  inst.playbackRate = rate;
  try { inst.video.playbackRate = rate; } catch { /* */ }
  const btn = inst.el.querySelector('.fp-playback-speed');
  if (btn) btn.textContent = `${rate}×`;
}

function enterFloatPlayback(inst, at) {
  if (!inst?.props?.server || !inst?.props?.stream || !Number.isFinite(Number(at))) return;
  const token = (inst.playbackToken || 0) + 1;
  inst.playbackToken = token;
  inst.mode = 'playback';
  inst.playbackAt = Math.floor(Number(at));
  inst.el.classList.add('fp-playback');
  inst.player.disconnect();
  inst.el.querySelector('.fp-mjpeg')?.classList.add('hidden');
  inst.video.classList.remove('hidden');
  inst.video.controls = false;
  inst.video.muted = inst.muted;
  const controls = inst.el.querySelector('.fp-playback-controls');
  controls?.classList.remove('hidden');
  const time = inst.el.querySelector('.fp-playback-time');
  if (time) time.textContent = playbackLabel(inst.playbackAt);
  applyPlaybackRate(inst);
  const msg = inst.el.querySelector('.fp-video-msg');
  msg.textContent = 'Cargando grabación…';
  msg.className = 'fp-video-msg type-info';
  msg.classList.remove('hidden');

  const q = new URLSearchParams({
    server: inst.props.server,
    stream: inst.props.stream,
    at: String(inst.playbackAt),
  });
  inst.video.src = `/api/recording/clip?${q}`;
  inst.video.load();
  inst.video.addEventListener('loadeddata', () => {
    if (inst.playbackToken !== token || inst.mode !== 'playback') return;
    msg.classList.add('hidden');
    applyPlaybackRate(inst);
    inst.video.play().catch(() => {});
    syncPlaybackToggle(inst);
  }, { once: true });
  inst.video.addEventListener('error', () => {
    if (inst.playbackToken !== token || inst.mode !== 'playback') return;
    msg.textContent = 'No se pudo cargar la grabación de esa hora. ';
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'fp-rec-retry';
    again.textContent = 'Reintentar';
    again.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      enterFloatPlayback(inst, inst.playbackAt);
    });
    msg.appendChild(again);
    msg.className = 'fp-video-msg type-warn';
    msg.classList.remove('hidden');
    syncPlaybackToggle(inst);
  }, { once: true });
}

function returnFloatLive(inst) {
  if (!inst) return;
  inst.playbackToken = (inst.playbackToken || 0) + 1;
  inst.mode = 'live';
  inst.el.classList.remove('fp-playback');
  inst.el.querySelector('.fp-playback-controls')?.classList.add('hidden');
  inst.playbackRate = 1;
  try { inst.video.pause(); inst.video.playbackRate = 1; } catch { /* */ }
  inst.video.removeAttribute('src');
  inst.video.load();
  if (inst.props?.server && inst.props?.stream) {
    inst.player.connect(inst.props.server, inst.props.stream);
  }
}

function createPanelInstance(key, kind) {
  const el = panelTpl.content.firstElementChild.cloneNode(true);
  el.dataset.key = key;
  panelsLayer.appendChild(el);

  const video = el.querySelector('.fp-video-el');
  const mjpeg = el.querySelector('.fp-mjpeg');
  const msg = el.querySelector('.fp-video-msg');
  const wrap = el.querySelector('.fp-video');
  const player = new StreamPlayer(video, SUFFIXES, mjpeg, { wrap });
  player.onStatus((text, type) => {
    if (!text) { msg.classList.add('hidden'); return; }
    msg.textContent = text;
    msg.className = `fp-video-msg type-${type}`;
    msg.classList.remove('hidden');
  });

  const inst = {
    key, kind, el, player, video, zoom: null, coords: null, props: null, featureId: null,
    device: null, muted: true, mode: 'live', playbackAt: null, playbackToken: 0, playbackRate: 1,
  };
  inst.zoom = attachDigitalZoom(wrap, {
    getPlayer: () => inst.player,
    getMuted: () => inst.muted,
    setMuted: (m) => {
      inst.muted = m;
      video.muted = m;
      setFpMuteIcon(el.querySelector('.fp-mute'), m);
    },
    getPtz: () => {
      if (!userCanPtz() || inst.kind !== 'camera') return null;
      return {
        id: `float:${inst.key}`,
        getProps: () => inst.props || {},
      };
    },
  });
  player.onAspect(() => {
    if (inst.coords) positionPanelEl(el, inst.coords);
  });

  el.addEventListener('pointerdown', () => bringToFront(inst));
  // Use inst.key (not the create-time `key`) — switchPanelCamera re-keys the
  // openPanels Map entry; a stale closure made X a no-op after chip switches.
  el.querySelector('.fp-close').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closePanelByKey(inst.key);
  });
  el.querySelector('.fp-close').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
  el.querySelector('.fp-mute').addEventListener('click', () => {
    inst.muted = !inst.muted;
    video.muted = inst.muted;
    setFpMuteIcon(el.querySelector('.fp-mute'), inst.muted);
    inst.zoom?.syncHud?.();
  });
  bindQualityToggle(el.querySelector('.fp-quality'), player);
  el.querySelector('.fp-fullscreen').addEventListener('click', () => {
    // Always FS the wrap (via zoom helper) — never <video> alone (breaks HUD/wheel).
    // Must use inst.zoom (attachDigitalZoom return) — bare `zoom` is undefined here
    // (videowall binds a local `const zoom`; float stores it on the panel instance).
    audit('fullscreen.enter', {
      stream: inst.props?.stream || null,
      server: inst.props?.server || null,
      context: 'float',
    });
    inst.zoom?.requestFullscreen().catch((err) => {
      console.warn('[zoom] float fullscreen failed', err);
    });
  });
  el.querySelector('.fp-retry').addEventListener('click', () => {
    if (inst.kind === 'camera' && inst.props?.server && inst.props?.stream) {
      if (inst.mode === 'playback' && inst.playbackAt) enterFloatPlayback(inst, inst.playbackAt);
      else player.connect(inst.props.server, inst.props.stream);
    } else if (inst.device?.howen) {
      api(`/api/howen/video/${encodeURIComponent(inst.device.howen.deviceNo)}`)
        .then(r => showHowenOn(inst, { ...inst.device.howen, videoUrl: r.url || inst.device.howen.videoUrl }))
        .catch(() => showHowenOn(inst, inst.device.howen));
    }
  });
  el.addEventListener('svmap:recording-play', (e) => {
    e.preventDefault();
    e.stopPropagation();
    enterFloatPlayback(inst, Number(e.detail?.at));
  });
  el.querySelector('.fp-live')?.addEventListener('click', () => returnFloatLive(inst));
  el.querySelector('.fp-playback-back')?.addEventListener('click', () => {
    inst.video.currentTime = Math.max(0, inst.video.currentTime - 30);
  });
  el.querySelector('.fp-playback-forward')?.addEventListener('click', () => {
    const end = Number.isFinite(inst.video.duration) ? inst.video.duration : inst.video.currentTime + 30;
    inst.video.currentTime = Math.min(end, inst.video.currentTime + 30);
  });
  el.querySelector('.fp-playback-toggle')?.addEventListener('click', () => {
    if (inst.video.paused) inst.video.play().catch(() => {});
    else inst.video.pause();
    syncPlaybackToggle(inst);
  });
  el.querySelector('.fp-playback-speed')?.addEventListener('click', () => {
    const i = PLAYBACK_RATES.indexOf(inst.playbackRate);
    inst.playbackRate = PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
    applyPlaybackRate(inst);
  });
  video.addEventListener('play', () => syncPlaybackToggle(inst));
  video.addEventListener('pause', () => syncPlaybackToggle(inst));
  el.querySelector('.fp-select-cb').addEventListener('change', (e) => {
    const p = inst.props;
    const k = camSelectKey(p);
    if (!k || !inst.coords) return;
    if (e.target.checked) {
      // Expand to every camera of this PMI/tower (same groupKey as map markers)
      selectPmiGroup(p, inst.coords);
    } else {
      deselectPmiGroup(p, inst.coords);
    }
    persistSelected();
    syncAllCheckboxes();
  });

  const callPill = el.querySelector('.fp-intercom-pill');
  callPill?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!inst.props?.grupo) return;
    const st = getIntercomState();
    const activeHere = intercomActiveProps?.grupo === inst.props.grupo
      && (!!st.inCall || st.status === 'calling' || st.status === 'in_call');
    if (activeHere) {
      hangupIntercom();
      return;
    }
    if (callPill.disabled) return;
    intercomActiveProps = inst.props;
    applyFloatIntercomVisual(inst);
    try {
      await callPmi({ grupo: inst.props.grupo, nombre: inst.props.nombre });
    } catch (err) {
      const title = el.querySelector('.fp-title');
      const pill = el.querySelector('.fp-intercom-pill');
      if (pill) {
        const prev = pill.title;
        pill.title = err.message || 'Llamada falló';
        setTimeout(() => { if (pill) pill.title = prev; }, 2800);
      }
      if (title) {
        const prev = title.dataset.icErrPrev;
        if (!prev) title.dataset.icErrPrev = title.textContent || '';
        title.textContent = err.message || 'Llamada falló';
        setTimeout(() => {
          if (title.dataset.icErrPrev != null) {
            title.textContent = title.dataset.icErrPrev;
            delete title.dataset.icErrPrev;
          }
          updatePanelMeta(inst, inst.props);
        }, 2800);
      }
    } finally {
      applyFloatIntercomVisual(inst);
    }
  });

  bindCamsCollapse(el);

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (inst.coords) positionPanelEl(el, inst.coords);
    }).observe(el);
  }

  openPanels.set(key, inst);
  updatePanelsClearBtn();
  return inst;
}

function closePanelByKey(key) {
  const inst = openPanels.get(key);
  if (!inst) return;
  try { inst.ptz?.destroy(); } catch { /* */ }  // destroys → disarm if Controlando
  try { inst.zoom?.destroy(); } catch { /* */ }
  try { inst.player.disconnect(); } catch { /* */ }
  inst.playbackToken = (inst.playbackToken || 0) + 1;
  hideCameraRecording(inst.el);
  clearHowenOn(inst);
  inst.el.remove();
  openPanels.delete(key);
  if (focusedPanelKey === key) {
    focusedPanelKey = null;
    intercomActiveProps = null;
  }
  if (!openPanels.size) {
    selectionPopup.remove();
    try { hangupIntercom(); } catch { /* */ }
  }
  updatePanelsClearBtn();
  const p = inst.props;
  audit('float.close', {
    kind: inst.kind || 'camera',
    stream: p?.stream || null,
    server: p?.server || null,
    nombre: p?.nombre || null,
  });
}

function closeAllPanels() {
  for (const key of [...openPanels.keys()]) closePanelByKey(key);
}

/** Same-cam open guard: ignore a second openPanel for the same stream in one click tick. */
let _openPanelGuard = { key: null, at: 0 };

function openPanel(props, featureId, coords, skipMapMove = false, opts = {}) {
  const key = panelKeyFromProps(props, featureId);
  if (!key) return;

  const now = performance.now();
  if (_openPanelGuard.key === key && (now - _openPanelGuard.at) < 80) {
    const existing = openPanels.get(key);
    if (existing) {
      bringToFront(existing);
      syncPanelCheckbox(existing);
      if (opts.alarmKinds) applyFloatAlarmChrome(existing, opts.alarmKinds);
      else if (!opts.keepAlarmChrome) applyFloatAlarmChrome(existing, null);
      requestAnimationFrame(() => positionPanelEl(existing.el, existing.coords || coords));
    }
    return;
  }
  _openPanelGuard = { key, at: now };

  let inst = openPanels.get(key);
  if (inst) {
    bringToFront(inst);
    syncPanelCheckbox(inst);
    if (opts.alarmKinds) applyFloatAlarmChrome(inst, opts.alarmKinds);
    else if (!opts.keepAlarmChrome) applyFloatAlarmChrome(inst, null);
    requestAnimationFrame(() => positionPanelEl(inst.el, inst.coords || coords));
    if (!skipMapMove && coords) map.easeTo({ center: coords, duration: 400 });
    return;
  }

  inst = createPanelInstance(key, 'camera');
  inst.props = props;
  inst.featureId = featureId;
  inst.coords = coords;
  activeFeatureId = featureId;
  selectionPopup.remove();

  if (!skipMapMove && coords) {
    map.easeTo({ center: coords, duration: 400 });
  }

  const title = inst.el.querySelector('.fp-title');
  const dot = inst.el.querySelector('.fp-status-dot');
  const status = props.server
    ? (statusMap[`${props.server}:${props.stream}`] || props.status || 'unknown')
    : undefined;
  dot.className = 'fp-status-dot dot ' + panelDotClass(status);
  updatePanelMeta(inst, props);
  syncFloatIntercom(inst);
  if (opts.alarmKinds) applyFloatAlarmChrome(inst, opts.alarmKinds);
  else applyFloatAlarmChrome(inst, null);

  clearHowenOn(inst);
  renderNearby(inst);
  syncPanelCheckbox(inst);
  bringToFront(inst);
  requestAnimationFrame(() => positionPanelEl(inst.el, coords));

  if (props.server && props.stream) {
    inst.player.connect(props.server, props.stream);
    inst.video.muted = true;
    inst.muted = true;
    setFpMuteIcon(inst.el.querySelector('.fp-mute'), true);
    loadCameraRecording(props.server, props.stream, inst.el);
    loadCameraEdgeRecording(props.server, props.stream, inst.el, { canOpen: me.role === 'admin' });
  } else {
    inst.player.disconnect();
    hideCameraRecording(inst.el);
    const msg = inst.el.querySelector('.fp-video-msg');
    msg.textContent = 'Sin stream disponible en SecureVu';
    msg.className = 'fp-video-msg type-warn';
    msg.classList.remove('hidden');
  }
  audit('float.open', {
    stream: props.stream || null,
    server: props.server || null,
    nombre: props.nombre || null,
    grupo: props.grupo || null,
    alarm: inst.alarmKinds || null,
  });
}

/** Panel for SecureTrax fleet unit (optional Howen MDVR video). Multi-open ok. */
function openFleetPanel(device, coords) {
  if (!device) return;
  const key = `trax:${device.id}`;
  let inst = openPanels.get(key);
  if (inst) {
    bringToFront(inst);
    requestAnimationFrame(() => positionPanelEl(inst.el, inst.coords || coords));
    return;
  }

  inst = createPanelInstance(key, 'fleet');
  inst.device = device;
  inst.props = null;
  inst.featureId = key;
  inst.coords = coords;
  activeFeatureId = key;

  selectionPopup
    .setLngLat(coords)
    .setHTML(
      `<span class="hp-name">${device.name || device.id}</span>` +
      (device.howen
        ? `<span class="hp-grupo">Howen ${device.howen.deviceNo}${device.plate ? ' · ' + device.plate : ''}</span>`
        : (device.plate ? `<span class="hp-grupo">${device.plate}</span>` : ''))
    )
    .addTo(map);

  if (coords) map.easeTo({ center: coords, duration: 400 });

  const title = inst.el.querySelector('.fp-title');
  const dot = inst.el.querySelector('.fp-status-dot');
  const label = device.name || `Trax ${device.id}`;
  if (title) {
    title.textContent = label;
    title.title = label;
    title.removeAttribute('href');
    title.classList.add('fp-title-nolink');
  }
  dot.className = 'fp-status-dot dot ' + panelDotClass(device.status);
  inst.el.querySelector('.fp-cameras')?.classList.add('hidden');
  inst.el.classList.remove('has-cameras', 'fp-cams-expanded', 'fp-cams-compact');
  const videoWrap = inst.el.querySelector('.fp-video');
  if (videoWrap) videoWrap.style.minHeight = '';
  paintFloatIntercomPill(inst.el.querySelector('.fp-intercom-pill'), { visible: false });
  syncPanelCheckbox(inst);
  bringToFront(inst);
  requestAnimationFrame(() => positionPanelEl(inst.el, coords));

  if (device.howen) {
    hideCameraRecording(inst.el);
    api(`/api/howen/video/${encodeURIComponent(device.howen.deviceNo)}`)
      .then(r => {
        showHowenOn(inst, { ...device.howen, videoUrl: r.url || device.howen.videoUrl });
      })
      .catch(() => showHowenOn(inst, device.howen));
  } else {
    clearHowenOn(inst);
    inst.player.disconnect();
    hideCameraRecording(inst.el);
    const msg = inst.el.querySelector('.fp-video-msg');
    msg.textContent = 'Unidad SecureTrax sin par Howen VSS (solo GPS)';
    msg.className = 'fp-video-msg type-info';
    msg.classList.remove('hidden');
  }
}

document.getElementById('sel-clear')?.addEventListener('click', () => {
  selectedCams.clear();
  persistSelected();
  syncAllCheckboxes();
});

document.getElementById('sel-videowall')?.addEventListener('click', openVideowall);
panelsClearBtn?.addEventListener('click', closeAllPanels);

// ─── Filters ──────────────────────────────────────────────────────────────────

function applyFilters({ ignoreSearch = false } = {}) {
  const servidor = document.getElementById('filter-servidor').value;
  const tipo     = document.getElementById('filter-tipo').value;
  const q        = ignoreSearch ? '' : document.getElementById('search').value.trim().toLowerCase();

  currentFiltered = geojson.features.filter(f => {
    const p = f.properties;
    if (servidor && p.server !== servidor)         return false;
    if (tipo     && p.tipo   !== tipo)             return false;
    if (q && !p.nombre.toLowerCase().includes(q))  return false;
    return true;
  });

  map.getSource('cameras')?.setData(buildGroups(currentFiltered));
}

document.getElementById('filter-servidor').addEventListener('change', applyFilters);
document.getElementById('filter-tipo').addEventListener('change',     applyFilters);

// ─── Search autocomplete (Buscar button → popover, mirrors Videowall Agregar) ─

const searchBtn   = document.getElementById('search-btn');
const searchPanel = document.getElementById('search-panel');
const searchInput = document.getElementById('search');
const searchList  = document.getElementById('search-list');
const searchClear = document.getElementById('search-clear');
const searchWrap  = document.getElementById('search-wrap');
let highlightIdx  = -1;

function updateClearBtn() {
  const has = !!searchInput.value;
  searchClear.classList.toggle('hidden', !has);
  searchBtn.classList.toggle('has-query', has);
}

function setSearchOpen(open) {
  searchPanel.classList.toggle('hidden', !open);
  searchBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    searchInput.focus();
    if (searchInput.value.trim()) buildSearchList(searchInput.value.trim());
  } else {
    searchList.classList.add('hidden');
  }
}

searchBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setSearchOpen(searchPanel.classList.contains('hidden'));
});

document.addEventListener('click', (e) => {
  if (searchPanel.classList.contains('hidden')) return;
  if (searchWrap && !searchWrap.contains(e.target)) setSearchOpen(false);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchList.classList.add('hidden');
  updateClearBtn();
  applyFilters();
  searchInput.focus();
});

function buildSearchList(q) {
  searchList.innerHTML = '';
  highlightIdx = -1;

  if (!q) { searchList.classList.add('hidden'); return; }

  const ql = q.toLowerCase();
  const matches = geojson.features
    .filter(f => f.properties.nombre.toLowerCase().includes(ql))
    .slice(0, 40); // cap at 40 results

  if (!matches.length) { searchList.classList.add('hidden'); return; }

  matches.forEach((f, i) => {
    const p   = f.properties;
    const li  = document.createElement('li');
    li.className = 'sl-item';
    li.dataset.idx = i;

    // Bold the matching part of the name
    const nameLower = p.nombre.toLowerCase();
    const start = nameLower.indexOf(ql);
    const end   = start + ql.length;
    const highlighted =
      p.nombre.slice(0, start) +
      `<mark>${p.nombre.slice(start, end)}</mark>` +
      p.nombre.slice(end);

    li.innerHTML =
      `<span class="sl-name">${highlighted}</span>` +
      `<span class="sl-meta">${[p.grupo, p.tipo].filter(Boolean).join(' · ')}</span>`;

    li.addEventListener('mousedown', e => {
      e.preventDefault(); // keep focus on input
      selectCamera(f);
    });

    searchList.appendChild(li);
  });

  searchList.classList.remove('hidden');
}

function selectCamera(f) {
  const coords = f.geometry.coordinates;
  searchInput.value = f.properties.nombre;
  searchList.classList.add('hidden');
  updateClearBtn();
  setSearchOpen(false);

  // Fly to the camera at ~30 m scale (zoom 18); pass skipMapMove=true so
  // openPanel doesn't issue a second easeTo that would cancel this flyTo.
  map.flyTo({
    center: coords, zoom: 18, duration: 800, padding: { right: 380 }, ...view3dOpts(),
  });
  openPanel(f.properties, f.id, coords, true);
}

function moveHighlight(dir) {
  const items = searchList.querySelectorAll('.sl-item');
  if (!items.length) return;
  items[highlightIdx]?.classList.remove('active');
  highlightIdx = (highlightIdx + dir + items.length) % items.length;
  const active = items[highlightIdx];
  active.classList.add('active');
  active.scrollIntoView({ block: 'nearest' });
}

searchInput.addEventListener('input', () => {
  updateClearBtn();
  const q = searchInput.value.trim();
  // Empty query must reset map filter (same as initial load / X clear).
  // Typing without this left markers stuck after status poll / filter change
  // had applied the previous search string via applyFilters().
  buildSearchList(q);
  applyFilters();
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown')  { e.preventDefault(); moveHighlight(+1); return; }
  if (e.key === 'ArrowUp')    { e.preventDefault(); moveHighlight(-1); return; }
  if (e.key === 'Escape') {
    if (!searchList.classList.contains('hidden')) {
      searchList.classList.add('hidden');
      return;
    }
    setSearchOpen(false);
    return;
  }
  if (e.key === 'Enter') {
    const active = searchList.querySelector('.sl-item.active');
    if (active) {
      const idx = parseInt(active.dataset.idx);
      const ql  = searchInput.value.trim().toLowerCase();
      const f   = geojson.features.filter(ft => ft.properties.nombre.toLowerCase().includes(ql))[idx];
      if (f) selectCamera(f);
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !searchPanel.classList.contains('hidden')
      && document.activeElement !== searchInput) {
    setSearchOpen(false);
  }
});
