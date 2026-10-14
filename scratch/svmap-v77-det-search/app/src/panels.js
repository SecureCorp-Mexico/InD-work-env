/**
 * Carril derecho del mapa: Alarmas y Detecciones ocupan el MISMO espacio
 * (position:fixed; top:--topbar-h; right:0; width:400px). Sólo uno puede estar
 * abierto a la vez: abrir uno cierra el otro.
 *
 * Este módulo es la ÚNICA fuente de verdad de «qué drawer del carril derecho
 * está abierto». Expone `showRightDrawer()` y, además, instala un
 * MutationObserver sobre el atributo `class` de ambos drawers: si CUALQUIER
 * otra ruta los abre saltándose el módulo (una vía nueva, o una reintroducida
 * por un rebase, o un `classList.remove('hidden')` suelto), el observer cierra
 * el otro en el mismo microtask — antes de pintar, así que el operador nunca
 * llega a ver los dos encimados.
 *
 * Es decir: la exclusión es un INVARIANTE del DOM, no una convención que cada
 * autor tenga que recordar. Es a propósito: ya se «arregló» en v50/v51 y volvió
 * a reportarse, porque nada obligaba a pasar por aquí.
 *
 * El estado se refleja en `<body data-right-rail="alarm|det">` para que el CSS
 * pueda garantizar la exclusión SIN depender del orden del DOM (las reglas de
 * hermanos `~` sí dependen de él y se rompen si alguien reordena el markup).
 *
 * En las ventanas pop-out (`/notifications.html`, `/detections.html`) sólo
 * existe uno de los dos drawers → no hay nada que excluir y el módulo no toca
 * nada: un panel desacoplado nunca fuerza el cierre del otro en el mapa.
 */

const RIGHT_RAIL = ['alarm-drawer', 'det-drawer'];
/** Si hay empate y no se sabe cuál acaba de abrirse, gana Alarmas (es crítica). */
const FALLBACK_WINNER = 'alarm-drawer';
const BODY_ATTR = 'data-right-rail';
const SHORT = { 'alarm-drawer': 'alarm', 'det-drawer': 'det' };

let observer = null;
/** Drawer abierto según el módulo (`null` = carril cerrado). */
let current = null;

const byId = (id) => document.getElementById(id);
const isShown = (node) => !!node && !node.classList.contains('hidden');
const railNodes = () => RIGHT_RAIL.map(byId).filter(Boolean);

/** Publica el estado en <body> para las reglas CSS de respaldo. */
function syncBody() {
  const body = document.body;
  if (!body) return;
  if (current && SHORT[current]) body.setAttribute(BODY_ATTR, SHORT[current]);
  else body.removeAttribute(BODY_ATTR);
}

/**
 * Impone «como mucho un drawer abierto».
 * Gana `winner` si está abierto; si no, el último que abrió el módulo; si no,
 * Alarmas. Recalcula `current` y sincroniza <body> en cualquier caso.
 */
function enforce(winner) {
  const open = railNodes().filter(isShown);

  if (open.length > 1) {
    const keep = [winner, current, FALLBACK_WINNER]
      .find((id) => id && open.some((n) => n.id === id)) || open[0].id;
    for (const node of open) {
      if (node.id !== keep) node.classList.add('hidden');
    }
    current = keep;
    // Señal de diagnóstico: si esto aparece, alguna ruta abre un drawer sin
    // pasar por showRightDrawer(). El solape ya está corregido, pero conviene
    // enrutar esa vía por el módulo.
    console.warn('[svmap] carril derecho: dos drawers abiertos a la vez; se cerró el otro.', { keep });
  } else {
    current = open[0]?.id || null;
  }

  syncBody();
}

function startObserver() {
  const nodes = railNodes();
  if (observer || !nodes.length) return;
  observer = new MutationObserver((records) => {
    // El drawer cuya clase acaba de pasar a visible es el que el operador quiso
    // abrir → ése gana, aunque la ruta que lo abrió no pasara por el módulo.
    let opened = null;
    for (const rec of records) {
      const el = rec.target;
      if (el instanceof Element && RIGHT_RAIL.includes(el.id) && isShown(el)) opened = el.id;
    }
    enforce(opened);
    observer.takeRecords(); // descarta las mutaciones que acabamos de provocar
  });
  for (const node of nodes) {
    observer.observe(node, { attributes: true, attributeFilter: ['class'] });
  }
}

/** Muestra el drawer `id` y cierra los demás del carril. */
export function showRightDrawer(id) {
  for (const other of RIGHT_RAIL) {
    if (other !== id) byId(other)?.classList.add('hidden');
  }
  byId(id)?.classList.remove('hidden');
  if (byId(id)) current = id;
  syncBody();
  observer?.takeRecords(); // este cambio es intencional: no lo re-proceses
}

/** Cierra el drawer `id` (equivalente a `.classList.add('hidden')`, pero sincroniza <body>). */
export function hideRightDrawer(id) {
  byId(id)?.classList.add('hidden');
  if (current === id) current = null;
  syncBody();
  observer?.takeRecords();
}

export function isRightDrawerOpen(id) {
  return isShown(byId(id));
}

function init() {
  startObserver();
  enforce();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}
