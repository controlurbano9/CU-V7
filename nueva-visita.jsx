// ═══════════════════════════════════════════════════════════════
// v6/nueva-visita.jsx — Pantalla "Nueva visita" / "Continuar visita"
//
// Diseño plano: todas las secciones desplegadas, scroll continuo.
// Guardado en un solo POST al final ("Guardar visita").
// Tras guardar (y crear carpeta Drive), aparece la sección de fotos
// y el botón "Generar acta F-GGO-46".
//
// Modos de entrada:
//   - filaInicial null  →  visita nueva (puede venir de Home, sin radicado previo)
//   - filaInicial num   →  continuar visita existente (Buscar / Gestión)
//   - datosIniciales obj → prefill desde una fila PENDIENTE (radicado ya existe en BD)
// ═══════════════════════════════════════════════════════════════
const { useEffect: useEffectNV, useMemo: useMemoNV } = React;

// ── Helpers de fecha ───────────────────────────────────────────
function _hoyDDMMYYYY_nv() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' +
         String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
function _hoyISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _isoAFecha(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
// Normaliza CUALQUIER valor de fecha que venga de BD (ISO "YYYY-MM-DD",
// ISO timestamp "YYYY-MM-DDTHH:mm:ss.sssZ", Date object serializado,
// "DD/MM/YYYY", etc.) a la forma canónica DD/MM/YYYY que esperamos en BD.
// Sin esto, los fallbacks que pasaban el valor crudo de BD (FECHA ASIGNACION,
// FECHA DEVOLUCION, FECHA RADICADO) perpetuaban formatos inconsistentes.
function _normalizarFechaCelda(valor) {
  if (!valor) return '';
  const s = String(valor).trim();
  if (!s) return '';
  // Ya está en D/M/YYYY → conservar rellenando (acepta también con hora).
  // Los tramos sin padding importan: con `\d{2}` el valor «1/9/2026» caía al
  // fallback `new Date(s)`, que lo interpreta como M/D (9 de ENERO) y cambiaba
  // la fecha en silencio.
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return m[1].padStart(2, '0') + '/' + m[2].padStart(2, '0') + '/' + m[3];
  // YYYY-MM-DD o ISO timestamp YYYY-MM-DDTHH... → DD/MM/YYYY
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[3] + '/' + m[2] + '/' + m[1];
  // Fallback: intentar parsear como Date — cubre "Wed Apr 10 2026 ..." etc.
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return String(d.getDate()).padStart(2, '0') + '/' +
           String(d.getMonth() + 1).padStart(2, '0') + '/' +
           d.getFullYear();
  }
  return s; // ininteligible: dejar como vino para no perder dato
}
function _fechaAIso(valor) {
  if (!valor) return '';
  // Date object → ISO local
  if (valor instanceof Date && !isNaN(valor)) {
    const yyyy = valor.getFullYear();
    const mm = String(valor.getMonth() + 1).padStart(2, '0');
    const dd = String(valor.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const s = String(valor);
  // D/M/YYYY o DD/MM/YYYY → YYYY-MM-DD. Los tramos van sin padding a
  // propósito: la regla es que BD guarde `DD/MM/YYYY`, pero las filas viejas
  // de V2 y las que se editan a mano en el Sheet traen `1/9/2026`. Exigiendo
  // dos dígitos esto devolvía '' y el campo salía VACÍO en el formulario con
  // el dato presente en BD — el inspector guardaba encima y lo borraba, y el
  // acta se generaba sin fecha de radicado.
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // ISO timestamp o YYYY-MM-DD → YYYY-MM-DD
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

// ── Capitalización utilitaria ──────────────────────────────────
function _capPalabras(s) {
  if (!s) return '';
  return s.toString().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
function _primeraMayus(s) {
  s = (s || '').toString();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function _soloMin(s) { return (s || '').toString().toLowerCase().trim(); }
function _soloMay(s) { return (s || '').toString().toUpperCase().trim(); }

// ── Helper para N° Orden de Policía (prefijo YYYY-09-XXX) ─────
// Regla de negocio: una orden, una vez asignada, NO cambia de año aunque
// la visita se reabra años después. Por eso el año se trata como un
// dato del state (ordenAnio) que se extrae de la orden cargada desde BD
// y queda bloqueado. Para órdenes nuevas (sin año previo) se usa el año
// del calendario actual.
function _ordenPrefijo(anio) {
  return (anio || new Date().getFullYear()) + '-09-';
}
function _formatearOrden(consecutivo, anio) {
  // Recibe número 1-999, devuelve "YYYY-09-XXX" con cero-relleno
  const n = parseInt(consecutivo, 10);
  if (isNaN(n) || n <= 0) return '';
  return _ordenPrefijo(anio) + String(n).padStart(3, '0');
}
function _extraerConsecutivoOrden(ordenCompleta) {
  // Extrae el consecutivo numérico de "YYYY-09-XXX" u otro formato.
  // QW14: "-0?9-" tolera formatos legados sin el cero del mes ("YYYY-9-XXX") —
  // antes esos casos no matcheaban y el fallback devolvía la orden completa,
  // que luego parseInt() reinterpretaba como si el año fuera el consecutivo.
  if (!ordenCompleta) return '';
  const m = /(\d{4})-0?9-(\d+)/.exec(ordenCompleta);
  if (m) return String(parseInt(m[2], 10)); // sin ceros a la izquierda para el input
  // Fallback: formato no reconocido — '' en vez de la orden completa, para
  // no propagar un valor no numérico a _formatearOrden()/parseInt() más adelante.
  return '';
}
function _extraerAnioOrden(ordenCompleta) {
  // Extrae el año "YYYY" de una orden tipo "YYYY-09-XXX". '' si no aplica.
  // QW14: mismo ajuste "-0?9-" que _extraerConsecutivoOrden.
  if (!ordenCompleta) return '';
  const m = /(\d{4})-0?9-\d+/.exec(ordenCompleta);
  return m ? m[1] : '';
}
// ¿La visita tiene realmente una orden de policía? La columna AS puede traer
// 'N/A' en filas viejas migradas de V2, y ese texto no es una orden: sin esto
// el escáner aparecería en visitas donde no hay nada que escanear.
function _hayOrdenReal(orden) {
  const s = String(orden || '').trim().toUpperCase();
  return !!s && s !== 'N/A' && s !== 'NA' && s !== 'NO APLICA';
}

// ── Catálogos ──────────────────────────────────────────────────
// VISITADORES_FALLBACK se usa si el endpoint público listarInspectoresActivos()
// falla (por red caída o primera carga sin cache). La lista real se carga
// dinámicamente al montar el formulario — alta/baja de inspectores ya no
// requiere editar este archivo.
const VISITADORES_FALLBACK = [
  { val: 'ALEJANDRO HERNANDEZ MUÑOZ',   l: 'Alejandro Hernández' },
  { val: 'MAURICIO HERRERA LOPERA',     l: 'Mauricio Herrera'    },
  { val: 'DIEGO ALEJANDRO MUNERA OSSA', l: 'Diego Munera'        },
  { val: 'DANIEL PEDRAZA ARANGO',       l: 'Daniel Pedraza'      },
  { val: 'VICTOR HUGO QUIROZ PORTILLA', l: 'Víctor Hugo Quiroz'  },
  { val: 'CARLOS ANDRES MEJIA',         l: 'Carlos Mejía'        },
  { val: 'JUAN SEBASTIAN PINZON GAONA', l: 'Juan Sebastián Pinzón' },
];

// Helper para generar label legible del nombre completo en mayúsculas.
// "ALEJANDRO HERNANDEZ MUÑOZ" → "Alejandro Hernández" (2 primeros tokens, title-case).
function _labelInspector(nombre) {
  return String(nombre || '').trim().split(/\s+/).slice(0, 2)
    .map(t => t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '')
    .join(' ');
}

const HORAS_CITACION = [
  { val: '08:00', l: '8:00 AM' }, { val: '09:00', l: '9:00 AM' },
  { val: '10:00', l: '10:00 AM' }, { val: '11:00', l: '11:00 AM' },
  { val: '14:00', l: '2:00 PM' }, { val: '15:00', l: '3:00 PM' },
  { val: '16:00', l: '4:00 PM' },
];

// ── Barrios agrupados por comuna ──────────────────────────────
// Comunas según la capa Barrios del POT (barrios-mapa.json). 2026-10-12: Zona
// Industrial #1 y #3 pasaron a la comuna 3 y La Meseta a la 5 (antes 2, 4 y 4).
// Guasimalito está en la 9 y la 10: aquí va en la 9, y con punto manda la
// comuna del POT (ejecutarPOT).
const BARRIOS_POR_COMUNA = [
  { comuna: '1', label: 'Comuna 1', barrios: ['El Cafetal','Jose Antonio Galan','La Esmeralda','La Maruchenga','La Pradera','Los Sauces','Paris','Salvador Allende'] },
  { comuna: '2', label: 'Comuna 2', barrios: ['Barrio Nuevo','Gran Avenida','La Cabana','La Cabanita','La Florida','La Madera','San Jose Obrero'] },
  { comuna: '3', label: 'Comuna 3', barrios: ['Amazonia','Hospital Mental','Los Bucaros','Molinares','Salento','San Simon','Santa Ana','Serramonte','Villas de Occidente','Zona Industrial #1','Zona Industrial #2','Zona Industrial #3'] },
  { comuna: '4', label: 'Comuna 4', barrios: ['Andalucia','Central','Centro','El Cairo','El Congolo','El Rosario','Espiritu Santo','La Estacion','La Milagrosa','Las Granjas','Lopez de Mesa','Manchester','Nazaret','Perez','Prado','Puerto Bello','Rincon Santos','Suarez'] },
  { comuna: '5', label: 'Comuna 5', barrios: ['Altavista','Aralias','Briceno','Buenos Aires','El Carmelo','El Paraiso','El Porvenir','El Trapiche','Hato Viejo','La Cumbre','La Meseta','La Primavera','Riachuelos','Urapanes','Valadares','Villa Maria','Villas de Comfenalco'] },
  { comuna: '6', label: 'Comuna 6', barrios: ['Bellavista','El Ducado','Girasoles','La Aldea','Los Alpes','Pachelly','Playa Rica','San Gabriel','San Martin','Tierradentro','Villa Linda','Villas del Sol'] },
  { comuna: '7', label: 'Comuna 7', barrios: ['Altos de Niquia','Altos de Quitasol','El Mirador','La Selva','Niquia Bifamiliares'] },
  { comuna: '8', label: 'Comuna 8', barrios: ['Ciudad Niquia','Ciudadela del Norte','Hermosa Provincia','Panamericano','Terranova','Zona Industrial #4'] },
  { comuna: '9', label: 'Comuna 9', barrios: ['El Trebol','Guasimalito','La Navarra','Linea Ferrea y Doble Calzada','Zona Industrial #5'] },
  { comuna: '10', label: 'Comuna 10', barrios: ['Alcala','Cinco Estrellas','Estacion Primera','Fontidueno','La Camila','La Mina','La Virginia','Las Vegas','Los Ciruelos','Marco Fidel Suarez','Zona Industrial #6'] },
  { comuna: '11', label: 'Comuna 11', barrios: ['Acevedo','Alpes del Norte','Belvedere','La Gabriela','Santa Rita','Zamora','Zona Industrial #7'] },
  { comuna: 'Vereda', label: 'Veredas', barrios: ['Vda. Buenavista','Vda. Cerezales','Vda. Charco Verde','Vda. Croacia','Vda. Cuartas','Vda. El Carmelo','Vda. El Tambo','Vda. Granizal','Vda. Hatoviejo','Vda. Jalisco','Vda. La China','Vda. La Meneses','Vda. La Palma','Vda. La Primavera','Vda. La Union','Vda. Los Espejos','Vda. Potrerito','Vda. Quitasol','Vda. Sabanalarga','Vda. Tierradentro'] },
];

// Mapa plano barrio → comuna para lookup rápido
const _BARRIO_A_COMUNA = {};
BARRIOS_POR_COMUNA.forEach(g => {
  g.barrios.forEach(b => { _BARRIO_A_COMUNA[b.toUpperCase()] = g.comuna; });
});
// Variante sin tildes para tolerar barrios provenientes del GeoJSON con/sin acentos
const _BARRIO_A_COMUNA_NORM = {};
function _quitarTildes(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// Fotos del modal del RF que aún no tienen pie definitivo: sin descripción o
// con la IA trabajando en ella (un ↻ en curso va a reemplazar el texto).
function _fotosSinDescripcion(fotos) {
  return (fotos || []).filter(function(f) { return f.descBusy || !String(f.descripcion || '').trim(); }).length;
}

// ── Registro fotográfico: revisión antes de generar (2026-10-26) ─────
// Pantalla completa: la foto en grande con zoom, el pie ya sugerido para
// editar y el orden en una tira de miniaturas (una fila si caben, si no dos).
// Maqueta: propuesta-registro-fotografico.html. Antes era una lista de
// miniaturas de 64 px donde no se veía lo que se describía.
// Quitar saca la foto del documento, nunca la borra de Drive.
const RFM_MINI_MIN = 72;        // ancho mínimo de miniatura (escritorio)
const RFM_MINI_MIN_MOVIL = 59;  // en <900 px: 4:3 → 44 px de alto (toque en campo, crítica P1 2026-10-26)
const RFM_MINI_GAP = 6;
const RFM_ZOOM_MAX = 8;         // veces el tamaño ajustado

function _rfmThumb(id, w) { return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + w; }

function ModalRegistroFotos({ fotos, onCambiar, onDescribir, onCancelar, onGenerar, puedeGenerar, etiquetaGenerar }) {
  const [sel, setSel] = React.useState(0);
  const [cols, setCols] = React.useState(0);
  const [quitada, setQuitada] = React.useState(null);   // { foto, idx } para «Deshacer»
  const [arrastre, setArrastre] = React.useState(null); // { desde, hasta } al reordenar
  const [grande, setGrande] = React.useState(null);     // { id, w, h } de la versión grande ya cargada
  const visorRef = React.useRef(null);
  const imgRef = React.useRef(null);
  const pctRef = React.useRef(null);
  const tiraRef = React.useRef(null);
  const txtRef = React.useRef(null);
  const vistaRef = React.useRef({ e: 1, x: 0, y: 0, a: 1 });
  const punterosRef = React.useRef({});
  const gestoRef = React.useRef(null);      // arrastre o pellizco en el visor
  const toqueRef = React.useRef(0);         // hora del último toque (doble toque = zoom)
  const miniGestoRef = React.useRef(null);  // reordenar en la tira
  const sinClicRef = React.useRef(false);
  const toastRef = React.useRef(null);

  const n = fotos.length;
  const idx = Math.min(sel, Math.max(0, n - 1));
  const foto = fotos[idx] || null;
  const fotoId = foto ? foto.id : '';
  const listaGrande = !!(grande && foto && grande.id === foto.id);

  // Posición del zoom: en un ref y aplicada directo al DOM (re-renderizar en
  // cada movimiento del dedo se nota en un Android barato).
  function aplicar() {
    const v = vistaRef.current, el = visorRef.current, img = imgRef.current;
    if (!el || !img || !grande) return;
    const r = el.getBoundingClientRect(), w = grande.w * v.e, h = grande.h * v.e;
    v.x = w <= r.width ? (r.width - w) / 2 : Math.min(0, Math.max(r.width - w, v.x));
    v.y = h <= r.height ? (r.height - h) / 2 : Math.min(0, Math.max(r.height - h, v.y));
    img.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.e + ')';
    if (pctRef.current) pctRef.current.textContent = Math.round(v.e / v.a * 100) + ' %';
  }
  function ajustar() {
    const el = visorRef.current;
    if (!el || !grande) return;
    const r = el.getBoundingClientRect();
    const a = Math.min(r.width / grande.w, r.height / grande.h) || 1;
    vistaRef.current = { e: a, x: 0, y: 0, a: a };
    aplicar();
  }
  function zoomEn(px, py, factor) {
    const v = vistaRef.current;
    const nueva = Math.min(v.a * RFM_ZOOM_MAX, Math.max(v.a, v.e * factor));
    v.x = px - (px - v.x) * nueva / v.e;
    v.y = py - (py - v.y) * nueva / v.e;
    v.e = nueva;
    aplicar();
  }
  function zoomCentro(factor) {
    const el = visorRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    zoomEn(r.width / 2, r.height / 2, factor);
  }

  React.useEffect(function() { ajustar(); }, [listaGrande, grande]);
  React.useEffect(function() {
    const el = visorRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(function() { ajustar(); });
    ro.observe(el);
    return function() { ro.disconnect(); };
  });
  // Rueda: listener propio porque React registra wheel como pasivo.
  React.useEffect(function() {
    const el = visorRef.current; if (!el) return;
    function rueda(e) {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomEn(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.2 : 1 / 1.2);
    }
    el.addEventListener('wheel', rueda, { passive: false });
    return function() { el.removeEventListener('wheel', rueda); };
  });

  // Una fila si todas caben al ancho mínimo; si no, dos.
  React.useEffect(function() {
    const el = tiraRef.current;
    if (!el) return;
    function medir() {
      const min = window.innerWidth < 900 ? RFM_MINI_MIN_MOVIL : RFM_MINI_MIN;
      const cabeUna = n * min + (n - 1) * RFM_MINI_GAP <= el.clientWidth - 24;
      setCols(cabeUna ? n : Math.ceil(n / 2));
    }
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return function() { ro.disconnect(); };
  }, [n]);

  // El pie crece con el texto, hasta 120 px.
  React.useEffect(function() {
    const t = txtRef.current; if (!t) return;
    t.style.height = 'auto';
    t.style.height = Math.min(120, t.scrollHeight + 2) + 'px';
  }, [foto && foto.descripcion, fotoId]);

  // La miniatura elegida siempre a la vista.
  React.useEffect(function() {
    const b = tiraRef.current && tiraRef.current.querySelector('[data-rfi="' + idx + '"]');
    if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [idx]);

  React.useEffect(function() {
    function tecla(e) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.key === 'ArrowRight') setSel(function(s) { return Math.min(s + 1, n - 1); });
      else if (e.key === 'ArrowLeft') setSel(function(s) { return Math.max(s - 1, 0); });
      else if (e.key === '+' || e.key === '=') zoomCentro(1.6);
      else if (e.key === '-') zoomCentro(1 / 1.6);
    }
    document.addEventListener('keydown', tecla);
    return function() { document.removeEventListener('keydown', tecla); };
  });

  React.useEffect(function() { return function() { clearTimeout(toastRef.current); }; }, []);

  // ── Gestos del visor: arrastrar, pellizcar, doble toque, deslizar ──
  function _dist() {
    const p = punterosRef.current, k = Object.keys(p);
    return Math.hypot(p[k[0]].x - p[k[1]].x, p[k[0]].y - p[k[1]].y);
  }
  function visorDown(e) {
    if (e.target.closest('button')) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* sin captura el gesto sigue */ }
    punterosRef.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    const v = vistaRef.current;
    gestoRef.current = Object.keys(punterosRef.current).length === 2
      ? { pellizco: true, d: _dist(), e: v.e }
      : { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y, movio: false };
  }
  function visorMove(e) {
    const g = gestoRef.current;
    if (!g || !punterosRef.current[e.pointerId]) return;
    punterosRef.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    const v = vistaRef.current;
    if (g.pellizco) {
      if (Object.keys(punterosRef.current).length < 2) return;
      zoomCentro(Math.min(v.a * RFM_ZOOM_MAX, Math.max(v.a, g.e * _dist() / g.d)) / v.e);
      return;
    }
    if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 6) g.movio = true;
    v.x = g.vx + e.clientX - g.x;
    v.y = g.vy + e.clientY - g.y;
    aplicar();
  }
  function visorUp(e) {
    const g = gestoRef.current;
    delete punterosRef.current[e.pointerId];
    if (!g || g.pellizco) { if (!Object.keys(punterosRef.current).length) gestoRef.current = null; return; }
    gestoRef.current = null;
    const v = vistaRef.current, dx = e.clientX - g.x;
    const ajustada = v.e / v.a < 1.05;
    // Sin zoom, deslizar de lado cambia de foto (en el celular no hay flechas).
    if (ajustada && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - g.y)) {
      setSel(function(s) { return Math.max(0, Math.min(n - 1, s + (dx < 0 ? 1 : -1))); });
      return;
    }
    if (g.movio) return;
    const ahora = Date.now();
    if (ahora - toqueRef.current < 320) {
      toqueRef.current = 0;
      if (!ajustada) ajustar();
      else { const r = visorRef.current.getBoundingClientRect(); zoomEn(e.clientX - r.left, e.clientY - r.top, 3); }
    } else toqueRef.current = ahora;
  }

  // ── Reordenar en la tira: con el mouse al mover; con el dedo, mantener presionado ──
  function _soltarMini() {
    const g = miniGestoRef.current;
    miniGestoRef.current = null;
    window.removeEventListener('pointermove', _moverMini);
    window.removeEventListener('pointerup', _soltarMini);
    window.removeEventListener('pointercancel', _soltarMini);
    if (!g) return;
    clearTimeout(g.timer);
    if (g.activo) {
      // El clic que sigue al soltar no debe elegir otra foto; si el navegador
      // no lo dispara (soltó sobre otra miniatura), la marca se borra sola.
      sinClicRef.current = true;
      setTimeout(function() { sinClicRef.current = false; }, 0);
      const desde = g.desde, hasta = g.hasta;
      setArrastre(null);
      if (hasta != null && hasta !== desde) {
        onCambiar(function(prev) {
          if (!prev) return prev;
          const next = prev.slice();
          const it = next.splice(desde, 1)[0];
          next.splice(hasta, 0, it);
          return next;
        });
        setSel(hasta);
      }
    }
  }
  function _moverMini(e) {
    const g = miniGestoRef.current; if (!g) return;
    const lejos = Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 8;
    if (!g.activo) {
      if (!lejos) return;
      if (g.tipo !== 'mouse') { _soltarMini(); return; }  // el dedo se movió antes: era scroll
      g.activo = true;
      setArrastre({ desde: g.desde, hasta: g.desde });
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const b = el && el.closest && el.closest('[data-rfi]');
    if (b) { g.hasta = +b.dataset.rfi; setArrastre({ desde: g.desde, hasta: g.hasta }); }
  }
  function miniDown(e, i) {
    if (e.button > 0) return;
    const g = { desde: i, hasta: i, x: e.clientX, y: e.clientY, tipo: e.pointerType, activo: false, timer: null };
    if (e.pointerType !== 'mouse') {
      g.timer = setTimeout(function() {
        if (miniGestoRef.current !== g) return;
        g.activo = true;
        if (navigator.vibrate) navigator.vibrate(15);
        setArrastre({ desde: i, hasta: i });
      }, 350);
    }
    miniGestoRef.current = g;
    window.addEventListener('pointermove', _moverMini);
    window.addEventListener('pointerup', _soltarMini);
    window.addEventListener('pointercancel', _soltarMini);
  }

  function editar(val) {
    const id = fotoId;
    onCambiar(function(prev) {
      return prev && prev.map(function(f) { return f.id === id ? Object.assign({}, f, { descripcion: val, descError: false }) : f; });
    });
  }
  function quitar() {
    if (!foto) return;
    const q = { foto: foto, idx: idx };
    onCambiar(function(prev) { return prev && prev.filter(function(f) { return f.id !== q.foto.id; }); });
    setQuitada(q);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(function() { setQuitada(null); }, 5000);
  }
  function deshacer() {
    const q = quitada; if (!q) return;
    onCambiar(function(prev) {
      if (!prev) return prev;
      const next = prev.slice();
      next.splice(Math.min(q.idx, next.length), 0, q.foto);
      return next;
    });
    setSel(q.idx);
    setQuitada(null);
  }

  const minMini = (typeof window !== 'undefined' && window.innerWidth < 900) ? RFM_MINI_MIN_MOVIL : RFM_MINI_MIN;

  return (
    <div className="rfm" role="dialog" aria-modal="true" aria-labelledby="rfm-titulo">
      <header className="rfm-top">
        {/* Sin cierre al tocar afuera ni con Esc: un toque accidental perdía el orden y los pies editados. */}
        <button type="button" className="btn-icono" onClick={onCancelar} aria-label="Cerrar sin generar">
          <Icon.Close size={20} />
        </button>
        <h2 id="rfm-titulo" className="rfm-titulo">Registro fotográfico</h2>
        <button type="button" className="btn-principal rfm-generar" onClick={onGenerar} disabled={!puedeGenerar}>
          {etiquetaGenerar}
        </button>
      </header>

      <div className="rfm-foto">
        <div className="rfm-visor" ref={visorRef}
          onPointerDown={visorDown} onPointerMove={visorMove} onPointerUp={visorUp} onPointerCancel={visorUp}>
          {foto && !listaGrande && (
            <img className="rfm-previa" src={_rfmThumb(foto.id, 400)} alt="" draggable={false} />
          )}
          {foto && (
            <img key={foto.id} ref={imgRef} className="rfm-img" src={_rfmThumb(foto.id, 2000)} alt=""
              draggable={false}
              style={listaGrande ? { width: grande.w, height: grande.h } : { visibility: 'hidden' }}
              onLoad={function(e) {
                const id = foto.id, w = e.currentTarget.naturalWidth, h = e.currentTarget.naturalHeight;
                setGrande({ id: id, w: w, h: h });
              }} />
          )}
          {idx > 0 && (
            <button type="button" className="rfm-nav izq" aria-label="Foto anterior" onClick={function() { setSel(idx - 1); }}>
              <Icon.ArrowLeft size={20} />
            </button>
          )}
          {idx < n - 1 && (
            <button type="button" className="rfm-nav der" aria-label="Foto siguiente" onClick={function() { setSel(idx + 1); }}>
              <span className="rfm-espejo"><Icon.ArrowLeft size={20} /></span>
            </button>
          )}
          <div className="rfm-zoom">
            <button type="button" aria-label="Alejar" onClick={function() { zoomCentro(1 / 1.6); }}>−</button>
            <span ref={pctRef}>100 %</span>
            <button type="button" aria-label="Acercar" onClick={function() { zoomCentro(1.6); }}>+</button>
          </div>
        </div>

        {foto && (
          <div className="rfm-pie">
            <span className="rfm-num">{(idx + 1) + ' / ' + n}</span>
            <textarea ref={txtRef} rows={1} className="input-campo rfm-txt" aria-label={'Pie de la foto ' + (idx + 1)}
              value={foto.descripcion || ''} disabled={!!foto.descBusy}
              placeholder={foto.descBusy ? 'Describiendo…' : 'Escribe el pie'}
              onChange={function(e) { editar(e.target.value); }}
              onKeyDown={function(e) {
                // Enter pasa a la siguiente: el pie es de una línea.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (idx < n - 1) setSel(idx + 1);
                }
              }} />
            <button type="button" className="btn-icono" title="Otra descripción" aria-label="Otra descripción"
              disabled={!!foto.descBusy} onClick={function() { onDescribir([foto.id], true); }}>
              <Icon.Refresh size={18} />
            </button>
            <button type="button" className="btn-icono peligro" title="Quitar del registro" aria-label="Quitar del registro"
              onClick={quitar}>
              <Icon.Close size={18} />
            </button>
          </div>
        )}
      </div>

      <nav className="rfm-tira" ref={tiraRef} aria-label="Orden de las fotos">
        <div className="rfm-grid" style={{ gridTemplateColumns: 'repeat(' + (cols || n || 1) + ', minmax(' + minMini + 'px, 96px))' }}>
          {fotos.map(function(f, i) {
            const estado = f.descBusy ? 'run' : String(f.descripcion || '').trim() ? 'ok' : 'falta';
            const estadoTxt = estado === 'run' ? 'describiendo' : estado === 'ok' ? 'con pie' : 'sin pie';
            const clase = 'rfm-mini' + (i === idx ? ' sel' : '') +
              (arrastre && arrastre.desde === i ? ' arrastra' : '') +
              (arrastre && arrastre.hasta === i && arrastre.desde !== i ? ' destino' : '');
            return (
              <button key={f.id} type="button" className={clase} data-rfi={i}
                aria-current={i === idx} aria-label={'Foto ' + (i + 1) + ', ' + estadoTxt}
                onPointerDown={function(e) { miniDown(e, i); }}
                onContextMenu={function(e) { e.preventDefault(); }}
                onClick={function() { if (sinClicRef.current) { sinClicRef.current = false; return; } setSel(i); }}>
                <img src={_rfmThumb(f.id, 160)} alt="" draggable={false} />
                <span className="rfm-n">{i + 1}</span>
                <span className={'rfm-dot ' + estado} title={estadoTxt} />
              </button>
            );
          })}
        </div>
      </nav>

      {quitada && (
        <div className="rfm-toast" role="status">
          <span>Foto quitada del registro</span>
          <button type="button" onClick={deshacer}>Deshacer</button>
        </div>
      )}
    </div>
  );
}

Object.keys(_BARRIO_A_COMUNA).forEach(k => {
  _BARRIO_A_COMUNA_NORM[_quitarTildes(k).toUpperCase()] = _BARRIO_A_COMUNA[k];
});
window._BARRIO_A_COMUNA = _BARRIO_A_COMUNA;
window._BARRIO_A_COMUNA_NORM = _BARRIO_A_COMUNA_NORM;
window._lookupComunaPorBarrio = function(barrio) {
  if (!barrio) return '';
  var k = _quitarTildes(barrio).toUpperCase().trim();
  return _BARRIO_A_COMUNA_NORM[k] || '';
};

// ── Resolución de nombre de barrio contra la lista ──────────────
// La capa Barrios/Veredas del POT nombra varios barrios distinto a la lista
// de arriba ('ZONA INDUSTRIAL Nº1' vs 'Zona Industrial #1', 'JOSE A. GALAN'
// vs 'Jose Antonio Galan'). Sin resolverlo, la sugerencia del POT y las filas
// viejas de BD no casaban con ninguna opción y el barrio caía a texto libre.
// Clave de comparación: sin tildes, sin 'Vda.', sin 'Nº', sin signos ni
// espacios ('Hatoviejo' ≡ 'Hato Viejo', 'Zona Industrial #1' ≡ '… Nº1').
function _canonBarrio(s) {
  return _quitarTildes(s).toUpperCase()
    .replace(/^VDA\.?\s*/, '')
    .replace(/N[º°]/g, '')
    .replace(/[^A-Z0-9]+/g, '');
}
// Lo que la clave canónica no puede salvar: artículos, plurales y abreviaturas.
const _ALIAS_BARRIO_POT = {
  'JOSEAGALAN': 'Jose Antonio Galan',
  'CONGOLO': 'El Congolo',
  'NAZARETH': 'Nazaret',
  'RINCONSANTO': 'Rincon Santos',
  'LAGRANAVENIDA': 'Gran Avenida',
  'NAVARRA': 'La Navarra',
  'VILLADEOCCIDENTE': 'Villas de Occidente',
  'NIQUIABIFAMILIAR': 'Niquia Bifamiliares',
};
const _LISTA_BARRIOS = BARRIOS_POR_COMUNA.reduce((acc, g) => acc.concat(g.barrios), []);
const _LISTA_VEREDAS = (BARRIOS_POR_COMUNA.find(g => g.comuna === 'Vereda') || { barrios: [] }).barrios;
// Devuelve el nombre tal cual está en la lista, o '' si no existe en ella.
// `preferirVereda` para puntos rurales: cuatro veredas comparten nombre con un
// barrio urbano (Tierradentro, El Carmelo, Hato Viejo, La Primavera) y sin esto
// una visita rural terminaba con la comuna del barrio homónimo.
function _barrioDeLista(nombre, preferirVereda) {
  const c = _canonBarrio(nombre);
  if (!c) return '';
  const donde = preferirVereda ? _LISTA_VEREDAS.concat(_LISTA_BARRIOS) : _LISTA_BARRIOS;
  return _ALIAS_BARRIO_POT[c] || donde.find(b => _canonBarrio(b) === c) || '';
}
window._barrioDeLista = _barrioDeLista;

// ── Catálogo: Usos actuales (chips multi-select) ──────────────
const USOS_OPCIONES = ['Residencial', 'Comercial', 'Industrial', 'Servicios', 'Institucional', 'Otro'];

// ── Catálogo: Tipo cubierta actual (chips multi-select) ───────
const CUBIERTA_ACTUAL_OPCIONES = [
  'Teja de barro', 'Teja termoacústica', 'Teja de zinc', 'Teja de fibrocemento',
  'Losa en concreto', 'Losa en placa fácil', 'Sin cubierta', 'Otro'
];

// ── Catálogo: Sistema estructural (select) ────────────────────
const SISTEMA_ESTRUCTURAL_OPCIONES = [
  'Muros de carga no estructurales',
  'Pórticos de concreto reforzado',
  'Pórticos de acero',
  'Pórticos mixtos acero-concreto',
  'Muros de concreto reforzado',
  'Mampostería estructural reforzada',
  'Mampostería confinada',
];

// ── Catálogo: Cubierta licencia (select) ──────────────────────
const CUBIERTA_LICENCIA_OPCIONES = [
  'Cubierta en techo',
  'Cubierta en losa',
  'Cubierta en techo y losa',
];

// ── Catálogo: Tipo de contravención (chips multi-select por literal) ──
// CONTRAVENCION_GRUPOS, CONTRAVENCION_ESPECIAL y _infraccionSoloCatalogo
// viven en utils.js: el tablero (hallazgosTablero) lee el mismo catálogo.

// Genera un id único para identificar el borrador local de un formulario
// en blanco (sin radicado/orden/fila aún). Antes se usaba la clave
// compartida 'cu_draft_v1_nuevo' y los datos de la persona que atiende se
// filtraban entre visitas distintas.
function _newEphemeralDraftId() {
  return 'eph_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ── Área en contravención: tres estados, no dos ─────────────
// Hasta ahora la única casilla era "No se pudo medir", y el inspector la
// marcaba también cuando NO había nada que medir — que es otra cosa: sin
// infracción no hay área, no es que no se haya podido tomar. El acta
// F-GGO-46 y el informe F-GGO-43 escriben ese texto tal cual, así que
// confundirlos le decía al expediente algo que no pasó.
const AREA_NO_MEDIBLE = 'No se pudo medir';
const AREA_NO_APLICA  = 'No aplica';

// Texto que va a BD (col Y), al acta y al informe.
function _areaTexto(d) {
  if (d.areaNoAplica)  return AREA_NO_APLICA;
  if (d.areaNoMedible) return AREA_NO_MEDIBLE;
  return d.area || '';
}

// Lectura desde BD. 'N/A' y sus variantes (filas migradas de V2) se leen como
// "No aplica": es lo que quisieron decir, y así reabrir una visita vieja no
// la deja trabada en la validación por un campo que ya estaba resuelto.
function _areaDesdeBD(v) {
  const s = (v == null ? '' : String(v)).trim();
  const u = s.toUpperCase();
  if (u === AREA_NO_MEDIBLE.toUpperCase())           return { area: '', noMedible: true,  noAplica: false };
  if (u === 'N/A' || u === 'NA' || u === 'NO APLICA') return { area: '', noMedible: false, noAplica: true  };
  return { area: s, noMedible: false, noAplica: false };
}

// Lo que viaja a UBICACION_CONFIRMADA al guardar: el origen si la
// confirmación sigue vigente, '' si algo cambió (el backend vacía la columna).
function _origenConfirmadoParaGuardar(dObj) {
  return ubicacionConfirmadaVigente(dObj.ubicConf, dObj) ? dObj.ubicConf.origen : '';
}

// Mismo criterio que la huella (utils.js): espacios y saltos no cuentan.
function _normTextoUI(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

// Señales del chequeo local sobre los textos y casillas de un estado del
// formulario (`dObj`). Lo usan _revisionVigenteD (con los textos del
// formulario) y _senalesPanel (con los textos del panel de revisión): una
// sola copia de la lista de casillas que lee revisarTextoLocal.
function _senalesTextoD(dObj) {
  return revisarTextoLocal({
    actuacion: dObj.actuacion, conclusion: dObj.obsConclusion,
    infraccion: _infraccionSoloCatalogo(dObj.infraccion), poligono: dObj.poligono,
    area: dObj.area, areaNoAplica: dObj.areaNoAplica, areaNoMedible: dObj.areaNoMedible,
    repLocativa: dObj.repLocativa, licenciaAportada: dObj.licenciaAportada,
    requiereLicencia: (dObj.reqLicencia || {}).respuesta,
    alturaPisos: dObj.alturaPisos, pisos: dObj.pisos, destActuales: dObj.destActuales,
    destinaciones: dObj.destinaciones, usos: dObj.usos,
  });
}
// Solo las de coherencia (las de forma avisan, no vencen). Si cambian los
// datos y esto queda vacío, la revisión sigue vigente (regla 2026-10-17).
function _senalesCoherenciaD(dObj) {
  return _senalesTextoD(dObj).filter(s => s.tipo !== 'forma');
}
// Claves de las señales de coherencia, para recordar cuáles ya justificó el
// inspector al sellar.
function _clavesSenalesD(dObj) {
  return _senalesCoherenciaD(dObj).map(s => s.id + '|' + s.donde);
}
// ¿Se puede sellar sin preguntar nada? Sin contradicciones, o con las mismas
// que ya se justificaron en el sello anterior (2026-10-17: volver a pedir la
// justificación de lo ya explicado es un paso que sobra).
function _senalesYaJustificadasD(dObj) {
  const claves = _clavesSenalesD(dObj);
  if (!claves.length) return true;
  const previas = dObj.revision && dObj.revision.senales;
  return String(dObj.revisionJustif || '').trim().length >= 20 && Array.isArray(previas) &&
    claves.every(c => previas.indexOf(c) >= 0);
}

// Lo que viaja a REVISION_DESCRIPCION al guardar: la revisión solo si sigue
// vigente (una vencida no se borra de la hoja: el cliente la compara por
// huella y ya no vale). El backend no reescribe si la huella es la misma.
// Revisión vigente = la huella sellada es la de los textos, los chips y las
// casillas que leen las reglas con justificación (camposRevision, utils.js).
// Desde 2026-10-17: si solo cambiaron los datos y el chequeo local no ve
// contradicciones, sigue vigente (6.º argumento de revisionVigente).
function _revisionVigenteD(dObj) {
  // Con informe técnico la conclusión no se revisa aquí (va al informe): que
  // haya cambiado no vence la revisión. Sellos viejos sin partes: huella entera.
  if (documentoVisita(dObj.documento) !== 'ACTA' && dObj.revision && dObj.revision.partes) {
    const c = partesCambiadas(dObj.revision, dObj.actuacion, dObj.obsConclusion,
      _infraccionSoloCatalogo(dObj.infraccion), camposRevision(dObj)).filter(k => k !== 'conc');
    return !c.length || (c.length === 1 && c[0] === 'datos' && _senalesCoherenciaD(dObj).length === 0);
  }
  return revisionVigente(dObj.revision, dObj.actuacion, dObj.obsConclusion,
    _infraccionSoloCatalogo(dObj.infraccion), camposRevision(dObj),
    _senalesCoherenciaD(dObj).length === 0);
}
// Lo que va en la celda de conclusiones del acta (A38): solo el texto del
// inspector. El comportamiento (F36) y el área (F37) tienen casilla propia;
// la frase del art. 135 que iba aquí los repetía y se comía 3 de los 5
// renglones (decisión del usuario 2026-10-17). El informe F-43 la conserva.
function _conclusionesActaD(dObj) {
  return dObj.obsConclusion || '';
}

// Secciones del formulario donde está cada dato de una señal de coherencia
// (revisarTextoLocal, utils.js): el panel de revisión ofrece «Ir a…». Las que
// hablan del propio texto no llevan: ese texto se corrige en el panel.
var SECCIONES_SENAL = {
  R05: ['Verificación documental', 'Tipificación y medidas'],
  R07: ['Tipificación y medidas'],
  R08: ['Verificación documental', 'Tipificación y medidas'],
  R12: ['Características de la edificación', 'Verificación documental'],
  R13: ['Características de la edificación', 'Tipificación y medidas'],
  R14: ['Verificación documental', 'Tipificación y medidas'],
  R15: ['Verificación documental', 'Tipificación y medidas'],
  R16: ['Tipificación y medidas'],
  area: ['Tipificación y medidas'],
};
// Nombre corto de cada sección para la barra «Falta en:» de la cabecera: con
// los títulos completos la barra ocupaba dos renglones a 1440 px.
var _SECCION_CORTA = {
  'Identificación del caso': 'Identificación',
  'Ubicación del inmueble': 'Ubicación',
  'Persona que atiende': 'Persona que atiende',
  'Características de la edificación': 'Edificación',
  'Verificación documental': 'Licencia',
  'Descripción de la situación encontrada': 'Descripción',
  'Tipificación y medidas': 'Tipificación',
  'Funcionarios que realizan la inspección': 'Funcionarios',
  'Conclusiones y revisión': 'Conclusiones',
};
function _irASeccion(titulo) {
  var el = document.querySelector('[data-seccion="' + titulo + '"]');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Medidor bajo la descripción y las conclusiones: cuánto del espacio de la
// celda del acta ocupa el texto (capacidadActa, utils.js). La celda no crece
// y el PDF corta lo que no cabe sin avisar (8 actas cortadas, 2026-10-15).
// Barra + renglones; cerca del tope, ámbar; pasado, rojo con qué hacer
// (revisar, que ajusta la propuesta, o pasar la visita a informe). Dentro del
// panel de revisión va el medidor compacto de cada tarjeta.
function _MedidorActa({ texto, celda, onUsarInforme }) {
  const c = capacidadActa(texto, celda);
  const pct = Math.min(100, Math.round(c.renglones / c.max * 100));
  const cerca = c.cabe && c.renglones >= c.max - 2 && c.renglones > 0;
  const tono = !c.cabe ? 'var(--rojo)' : cerca ? 'var(--amarillo)' : 'var(--verde)';
  const n = Math.abs(c.caracteres).toLocaleString('es-CO');
  const nombre = celda === 'conclusiones' ? 'las conclusiones' : 'la situación encontrada';
  return (
    <div role="status" style={{ gridColumn: '1 / -1', fontSize: 13, marginTop: 2 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ color: 'var(--texto-suave)' }}>Espacio en el acta</span>
        <span style={{ marginLeft: 'auto', fontWeight: 600, color: c.cabe ? 'var(--texto)' : 'var(--rojo)' }}>
          {c.renglones} de {c.max} renglones
        </span>
      </div>
      <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: 'var(--borde)', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: tono, transition: 'width .2s' }} />
      </div>
      {c.cabe ? (
        <div style={{ marginTop: 4, color: cerca ? 'var(--texto)' : 'var(--texto-suave)' }}>
          {c.caracteres > 0 ? 'Caben ≈ ' + n + ' caracteres más.' : 'Está justo en el límite.'}
        </div>
      ) : (
        <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 'var(--r-ctl, 8px)', background: 'var(--rojo-bg)', color: 'var(--texto)' }}>
          <div style={{ fontWeight: 600, color: 'var(--rojo)', marginBottom: 2 }}>No cabe en el acta</div>
          <div>
            El acta tiene {c.max} renglones para {nombre} y este texto ocupa {c.renglones}: lo que sobra
            (≈ {n} caracteres) no saldría en el PDF.
          </div>
          <div style={{ marginTop: 4 }}>
              {/* Con el acta ya generada no se puede pasar a informe: no se ofrece. */}
              {onUsarInforme
                ? 'Puedes acortarlo; o pulsar «Revisar» al final del formulario, que te propone una versión que ' +
                  'cabe; o, si necesitas el texto completo, documentar la visita con informe técnico, que no tiene límite.'
                : 'Puedes acortarlo o pulsar «Revisar» al final del formulario, que te propone una versión que cabe.'}
              {onUsarInforme && (
                <div style={{ marginTop: 6 }}>
                  <button type="button" className="btn-neutro" onClick={onUsarInforme}
                    style={{ minHeight: 36, fontSize: 13, padding: '6px 12px' }}>Usar informe técnico</button>
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

// ¿Ya hay acta? En hoja de cálculo o en PDF: hay filas viejas con solo el PDF
// (mismo criterio que entregablesFaltantes, utils.js; revisión externa 2026-10-15).
function _actaGeneradaD(dObj) {
  return !!(dObj.linkXlsxActa || dObj.linkPdfActa);
}

// Con qué documento se cierra la visita (2026-10-15, decisión del usuario):
// acta (casillas de tamaño fijo) o informe técnico (sin límite; no se genera
// acta). Con el acta ya generada no se cambia: el documento ya existe.
function _DocumentoVisita({ valor, onCambiar, bloqueado }) {
  return (
    <div className="input-grupo full-width" role="group" aria-labelledby="nv-doc-label">
      <span className="input-label" id="nv-doc-label">Esta visita se documenta en</span>
      <_Radio value={valor} onChange={onCambiar} disabled={bloqueado}
        opciones={[{ v: 'ACTA', l: 'Acta de inspección ocular' }, { v: 'INFORME', l: 'Informe técnico' }]} />
      <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginTop: 6 }}>
        {bloqueado
          ? 'El acta ya se generó, así que la visita se documenta con acta.'
          : valor === 'INFORME'
            ? 'Sin límite de largo. No se genera acta: el informe técnico la reemplaza.'
            : 'El acta tiene casillas de tamaño fijo: 22 renglones para la situación encontrada y 5 para las conclusiones.'}
      </div>
    </div>
  );
}

// Lo que diligenció el inspector, en texto, para que «Revisar» proponga las
// conclusiones desde todo lo diligenciado (perfil 'conclusionActa' con
// `contexto`, 2026-10-15). Solo casillas con dato.
function _contextoVisitaD(dObj) {
  const linea = (k, v) => (v && String(v).trim()) ? k + ': ' + String(v).trim() : '';
  const lic = dObj.licenciaAportada === 'SI'
    ? ['SI', dObj.licencia && 'N° ' + dObj.licencia, dObj.tipoLicencia, dObj.pisos && dObj.pisos + ' pisos aprobados']
        .filter(Boolean).join(' · ')
    : dObj.licenciaAportada;
  return [
    linea('Documento', documentoVisita(dObj.documento) === 'INFORME' ? 'informe técnico' : 'acta de inspección ocular'),
    linea('Tipificación', infraccionParaActa(_infraccionSoloCatalogo(dObj.infraccion),
      (dObj.reqLicencia || {}).motivoIndeterminado)),
    linea('Área en contravención', _areaTexto(dObj)),
    linea('Estado de la obra', dObj.estadoObra),
    linea('¿Las obras requieren licencia?', (function () {
      const g = formatearRequiereLicencia(dObj.reqLicencia);
      return g.requiere ? g.requiere + (g.detalle ? ' (' + g.detalle + ')' : '') : '';
    })()),
    linea('¿Se aportó licencia?', lic),
    linea('Altura en pisos', dObj.alturaPisos),
    linea('Destinaciones actuales', dObj.destActuales),
    linea('Usos actuales', dObj.usos),
    linea('Polígono de uso del suelo', dObj.poligono),
    linea('Suelo de protección', dObj.sueloProt),
    linea('Amenaza', dObj.amenaza),
    linea('Retiro de quebrada', dObj.quebrada),
    linea('Suspensión de la obra', dObj.suspension),
    // La situación va al final y en su propio bloque: trae saltos de línea.
    String(dObj.actuacion || '').trim() ? 'Situación encontrada:\n' + String(dObj.actuacion).trim() : '',
  ].filter(Boolean).join('\n');
}

function _revisionParaGuardar(dObj) {
  const rev = dObj.revision;
  if (!rev || !_revisionVigenteD(dObj)) return undefined;
  const out = { modo: rev.modo, huella: huellaParaBD(rev) };
  if (dObj.revisionJustif) out.justificacion = dObj.revisionJustif;
  return out;
}

// Titular, área aprobada y curaduría viajan fuera del payload posicional
// (el backend las escribe por nombre en LICENCIA_TITULAR/_AREA_APROBADA/
// _CURADURIA). Con licencia SI van los valores (aunque estén vacíos: ''
// borra); con NO se borran; sin responder, undefined → el backend no toca.
// «¿Requiere licencia?» viaja siempre que esté respondida, se aporte o no
// licencia (REQUIERE_LICENCIA / _DETALLE).
// Citado de la citación (audiencias 2026-10-21). `{ mismaPersona }` = se cita
// a quien atendió (el backend deja CITADO vacío); sin nombre todavía no se
// manda nada, para no borrar lo que haya.
function _citadoParaGuardar(dObj) {
  if (!dObj.citaOtraPersona && !dObj.noAtiende) return { mismaPersona: true };
  const nombre = String(dObj.citadoNombre || '').trim();
  if (!nombre) return undefined;
  return {
    citado: nombre,
    documentoCitado: dObj.citadoSinDoc ? '' : String(dObj.citadoDocumento || '').replace(/\D/g, ''),
    sinDocumento: !!dObj.citadoSinDoc,
  };
}

// 'lunes 5 de abril de 2027' → 'Lunes 5 de abril de 2027' (tarjeta de la cita).
function _fechaLargaCita(fechaTxt) {
  const d = parsearFecha(fechaTxt);
  if (!d) return fechaTxt;
  const t = d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/,/g, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function _licenciaExtraParaGuardar(dObj) {
  let out;
  if (dObj.licenciaAportada === 'SI') {
    out = {
      titular: dObj.licTitular || '',
      areaAprobada: dObj.licAreaAprobada || '',
      curaduria: dObj.licCuraduria || '',
    };
  } else if (dObj.licenciaAportada === 'NO') {
    out = { titular: '', areaAprobada: '', curaduria: '' };
  }
  const req = formatearRequiereLicencia(dObj.reqLicencia);
  if (req.requiere) {
    out = Object.assign(out || {}, { requiere: req.requiere, requiereDetalle: req.detalle });
  }
  return out;
}

// ── Estado inicial (en blanco o prefill) ───────────────────────
function _estadoInicial(datosIniciales) {
  const d = datosIniciales || {};
  // Separar actuación y conclusiones (almacenados juntos en BD col AU)
  const _rawAct = d['ACTUACION / OBSERVACIONES'] || d['ACTUACION'] || '';
  const _partsAct = _rawAct.split('\n══CONCLUSIONES══\n');
  // Modo oficio: el flag _oficio solo existe al crear la visita; al REABRIR
  // desde BD no viaja, así que se detecta por el prefijo del radicado. Sin
  // esto, una visita de oficio reabierta se mostraba como PQR con el radicado
  // "OFICIO-..." editable y el campo de orden escondido — editar el radicado
  // destruía la identidad de oficio en el siguiente guardado.
  const esOficioDetectado = !!d['_oficio'] || /^OFICIO-/i.test(String(d['RADICADO'] || ''));
  const _areaBD = _areaDesdeBD(d['AREA CONTRAVENCION m2'] || d['AREA CONTRAVENCION M2']);
  const _est = {
    // Identificación
    radicado:       d['RADICADO']             || '',
    // AP2 (auditoría 2026-07): timestamp de última modificación conocido al
    // abrir la visita — se reenvía al guardar para que el backend detecte
    // si otro co-asignado ya guardó cambios en el medio.
    ultimaModConocida: d['ULTIMA_MODIFICACION'] || '',
    fechaRadicado:  _fechaAIso(d['FECHA RADICADO'] || ''),
    // NO se prellenan con hoy: el inspector debe ingresar manualmente la fecha
    // real de la inspección en campo (puede diligenciar después del mismo día).
    fechaVisita:    _fechaAIso(d['FECHA DE VISITA'] || ''),
    denunciante:    d['DENUNCIANTE/REMITENTE'] || d['DENUNCIANTE'] || '',
    nVisita:        d['N° VISITA']           || d['N VISITA']           || 1,
    esOficio:       esOficioDetectado,
    // Ubicación
    direccion:      d['DIRECCION INFRACCION'] || d['DIRECCION']         || '',
    barrio:         d['BARRIO/VEREDA']        || d['BARRIO']            || '',
    comuna:         d['COMUNA']               || '',
    // normalizarCoord repara las filas que quedaron con el decimal comido
    // por el locale del Sheet (ver utils.js); una coordenada sana pasa igual.
    lat:            normalizarCoord(d['LATITUD'], 'lat'),
    lon:            normalizarCoord(d['LONGITUD'], 'lon'),
    // Persona
    noAtiende:      (d['NOMBRE PERSONA ATIENDE'] || '').includes('No se atiende'),
    atiendeNombre:  d['NOMBRE PERSONA ATIENDE']  || '',
    atiendeId:      d['ID PERSONA ATIENDE']       || '',
    atiendeTel:     d['TELEFONO PERSONA ATIENDE']  || '',
    telNoAporta:    (d['TELEFONO PERSONA ATIENDE'] || '').includes('No aporta') || (d['TELEFONO PERSONA ATIENDE'] || '').includes('No se atiende'),
    atiendeRelacion: d['RELACION CON EL EVENTO']  || '',
    atiendeRelacionOtro: '',
    atiendeDir:     d['DIR NOTIFICACION']         || '',
    dirNoAporta:    (d['DIR NOTIFICACION'] || '').includes('No aporta') || (d['DIR NOTIFICACION'] || '').includes('No se atiende'),
    atiendeEmail:   d['CORREO ELECTRONICO']       || '',
    emailNoAporta:  (d['CORREO ELECTRONICO'] || '').includes('No aporta') || (d['CORREO ELECTRONICO'] || '').includes('No se atiende'),
    dirNotifIgual:  true,
    // Características
    estadoObra:     d['ESTADO OBRA']          || '',
    repLocativa:    d['REPARACION LOCATIVA']  || '',
    // «¿Las obras requieren licencia?» (utils.js). Visitas viejas: la AA en SI
    // se lee como NO por reparación locativa.
    reqLicencia:    parsearRequiereLicencia(d['REQUIERE_LICENCIA'], d['REQUIERE_LICENCIA_DETALLE'], d['REPARACION LOCATIVA']),
    habitado:       d['HABITADO']             || '',
    alturaPisos:    d['ALTURA EN PISOS']      || '',
    destActuales:   d['N° DESTINACIONES ACTUALES'] || d['N DESTINACIONES ACTUALES'] || '',
    usos:           d['USOS ACTUALES']        || '',
    queFunciona:    (function() {
                      var raw = (d['USOS ACTUALES'] || '').toString();
                      if (!raw) return '';
                      var partes = raw.split(/\s*[·,]\s*/).filter(Boolean);
                      var conocidos = ['Residencial','Comercial','Industrial','Servicios','Institucional','Otro'];
                      var extras = partes.filter(function(p) { return !conocidos.includes(p.trim()); });
                      return extras.join(', ');
                    })(),
    cubiertaActual: d['TIPO CUBIERTA ACTUAL'] || '',
    catastral:      d['CODIGO CATASTRAL']     || d['CATASTRAL']         || '',
    ficha:          d['N° FICHA PREDIAL']     || d['N FICHA PREDIAL']    || '',
    // Licencia
    licenciaAportada: d['SE APORTO LICENCIA'] || '',
    licencia:         d['N° LICENCIA']        || d['N LICENCIA']         || '',
    fechaLicencia:   _fechaAIso(d['FECHA LICENCIA'] || ''),
    tipoLicencia:    d['TIPO Y MODALIDAD LICENCIA'] || '',
    pisos:           d['PISOS APROBADOS']     || '',
    destinaciones:   d['DESTINACIONES LICENCIA'] || '',
    cubierta:        d['CUBIERTA LICENCIA']   || '',
    sistema:         d['SISTEMA ESTRUCTURAL'] || d['SISTEMA ESTRUCT'] || '',
    obsLicencia:     d['OBS LICENCIA']        || '',
    // Titular, área aprobada y curaduría: columnas propias (licenciaExtra),
    // el payload posicional no las toca.
    licTitular:      d['LICENCIA_TITULAR'] || '',
    licAreaAprobada: d['LICENCIA_AREA_APROBADA'] || '',
    licCuraduria:    d['LICENCIA_CURADURIA'] || '',
    // Descripción + conclusiones
    actuacion:       _partsAct[0] || '',
    obsConclusion:   _partsAct[1] || '',
    infraccion:      _infraccionSoloCatalogo(d['TIPO DE INFRACCION']),
    area:            _areaBD.area,
    areaNoMedible:   _areaBD.noMedible,
    areaNoAplica:    _areaBD.noAplica,
    quebrada:        d['CUMPLE RETIRO QUEBRADA'] || '',
    suspension:      d['SUSPENSION DE LA OBRA'] || '',
    orden:           d['N° ORDEN DE POLICIA'] || d['N ORDEN DE POLICIA'] || '',
    citacionFecha:   _fechaAIso((d['FECHA CITACION'] || '').split(' · ')[0]),
    citacionHora:    (function() {
                       var raw = (d['FECHA CITACION'] || '').toString().trim();
                       if (!raw || raw === 'No se deja citación') return '';
                       var partes = raw.split(' · ');
                       if (partes.length < 2) return '';
                       var horaTexto = partes[1].trim().toUpperCase();
                       var match = HORAS_CITACION.find(function(h) {
                         return h.l.toUpperCase() === horaTexto;
                       });
                       return match ? match.val : '';
                     })(),
    noCitacion:      (d['FECHA CITACION'] || '').toString().trim() === 'No se deja citación',
    // Citado (audiencias 2026-10-21): vacío = se cita a quien atendió.
    citaOtraPersona: !!String(d['CITADO'] || '').trim(),
    citadoNombre:    String(d['CITADO'] || '').trim(),
    citadoDocumento: /^\d+$/.test(String(d['DOCUMENTO_CITADO'] || '').trim()) ? String(d['DOCUMENTO_CITADO']).trim() : '',
    citadoSinDoc:    String(d['DOCUMENTO_CITADO'] || '').trim().toUpperCase() === 'NO APORTA',
    // Visitadores
    visitador:       d['VISITADOR(ES)']       || '',
    // POT
    poligono:        d['POLIGONO USO SUELO']  || '',
    amenaza:         d['AMENAZA']             || '',
    sueloProt:       d['SUELO DE PROTECCION'] || '',
    // Drive
    linkDrive:       d['LINK_DRIVE']          || '',
    idCarpetaVisita: _idCarpetaDeLink(d['LINK_DRIVE'] || ''),
    idCarpetaFotos:  '',
    linkXlsxActa:    d['LINK_XLSX_ACTA']      || '',
    linkPdfActa:     d['LINK_PDF_ACTA']       || '',
    // PDF de la orden de policía escaneada en campo (col LINK_ORDEN_POLICIA).
    // Lo escribe el backend al subir; el formulario solo lo lee para saber si
    // ya existe. No viaja en el array de valores B→BD.
    linkOrdenPolicia: d['LINK_ORDEN_POLICIA'] || '',
    // PDF de la PQR original (col LINK_PDF_RADICADO). Lo llena la
    // sincronización del módulo de priorización desde las carpetas de Drive
    // del scraper; el formulario solo lo lee para ofrecer el botón de consulta.
    linkPdfRadicado: d['LINK_PDF_RADICADO'] || '',
    // Informe F-GGO-43 (col LINK_DOCX_INFORME). Antes no se leía: al reabrir
    // una visita con informe ya generado, la zona de entregables no lo sabía
    // y ofrecía "generar" como si no existiera.
    linkDocxInforme: d['LINK_DOCX_INFORME'] || '',
    // Registro fotográfico (col LINK_REGISTRO_FOTOS, creada por el backend).
    // Antes el link vivía solo en el state de la sesión: al reabrir una
    // visita con RF ya generado el renglón ofrecía «Generar» otra vez.
    linkRegistroFotos: d['LINK_REGISTRO_FOTOS'] || '',
  };
  // Ubicación del predio (docs/PLAN_2026-09-29_ubicacion-predio.md).
  //   origenPunto: de dónde salió el punto (GPS | MAPA | DIRECCION).
  //   ubicConf: lo que el inspector confirmó; vale mientras punto, dirección y
  //     ficha sigan iguales (ubicacionConfirmadaVigente, utils.js). Si BD dice
  //     que estaba confirmada, se confía en los valores tal como se cargan.
  //   ubicPreferirPunto: el inspector eligió el predio del pin aunque la
  //     dirección cayera en otro; vale para ese punto y esa dirección.
  // Viajan en el borrador local; ninguno va en el payload posicional.
  const _origenBD = origenUbicacionConfirmada(d['UBICACION_CONFIRMADA']);
  _est.origenPunto = _origenBD;
  _est.ubicConf = _origenBD ? {
    origen: _origenBD, lat: _est.lat, lon: _est.lon,
    direccion: _est.direccion, catastral: _est.catastral,
  } : null;
  _est.ubicPreferirPunto = null;
  // Revisión obligatoria del texto (REVISION_DESCRIPCION): { modo, huella,
  // fecha, nombre } o null. Vale mientras la huella de descripción,
  // conclusiones y chips no cambie (revisionVigente, utils.js).
  _est.revision = leerSelloRevision(d['REVISION_DESCRIPCION']);
  _est.revisionJustif = '';
  // Con qué documento se cierra la visita (DOCUMENTO_VISITA, 2026-10-15):
  // 'ACTA' | 'INFORME'. Vacío = acta (documentoVisita, utils.js).
  _est.documento = d['DOCUMENTO_VISITA'] ? documentoVisita(d) : '';
  return _est;
}
// El backend siempre escribe `.../drive/folders/<id>`, pero en BD hay links de
// carpetas creadas a mano o migradas de V2 con las otras formas que usa Drive.
// Si el id no se extrae, `idCarpetaVisita` queda vacío mientras `linkDrive` no,
// y la pantalla se contradice: «Carpeta en Drive · Creada» con «Abrir» y, al
// mismo tiempo, el registro fotográfico sin control de subida.
function _idCarpetaDeLink(url) {
  if (!url) return '';
  const m = /(?:folders|\/d)\/([a-zA-Z0-9_-]+)|[?&]id=([a-zA-Z0-9_-]+)/.exec(url);
  return m ? (m[1] || m[2] || '') : '';
}

// ── Estructura del payload (60 cols B → BD) ────────────────────
// Construye el array que se mandará al webhook. Mantiene el orden
// exacto definido en app.js / apps_script_unificado.js.
// Visita de oficio de seguimiento con radicado ya fijado por la 1ª visita.
function _oficioSeguimiento(d) {
  return !!d.esOficio && (parseInt(d.nVisita, 10) || 1) > 1 && !!d.fechaRadicado
    && /^OFICIO-/i.test(String(d.radicado || ''));
}

function _construirPayload(d, estado, linkDriveFinal, filaPendiente) {
  const radicado = d.esOficio
    ? radicadoDeOficio(d.radicado, d.orden, d.nVisita)
    : String(d.radicado || '').trim().toUpperCase();
  const fpRadicado = filaPendiente?.['FECHA RADICADO'] || '';
  // Prioridad: state d.denunciante (que se inicializa desde datosIniciales y se conserva
  // a través del modal) → filaPendiente prop como fallback.
  const fpDenunc   = d.denunciante || filaPendiente?.['DENUNCIANTE/REMITENTE'] || filaPendiente?.[6] || '';
  const fpFechaAsig= filaPendiente?.['FECHA ASIGNACION VISITA'] || filaPendiente?.[14] || '';
  const fpFechaDev = filaPendiente?.['FECHA DEVOLUCION'] || filaPendiente?.[20] || '';

  const denunc = d.esOficio
    ? 'Inspección de Control Urbano'
    : _capPalabras(fpDenunc);

  const horaFmt = HORAS_CITACION.find(h => h.val === d.citacionHora)?.l || d.citacionHora;
  const citFmt  = d.noCitacion
    ? 'No se deja citación'
    : (d.citacionFecha
        ? (_isoAFecha(d.citacionFecha) + (horaFmt ? ' · ' + horaFmt : ''))
        : '');

  // Relación: si es "Otro", enviar el texto del campo libre
  const relacionFinal = d.atiendeRelacion === 'Otro'
    ? (d.atiendeRelacionOtro || 'Otro')
    : (d.atiendeRelacion || '');

  // Dirección de notificación: si es igual al inmueble, usar d.direccion
  const dirNotifFinal = d.dirNotifIgual ? (d.direccion || '') : (d.atiendeDir || '');

  // Para oficio: la fecha radicado = fecha visita (no hay radicado externo previo,
  // el "radicado" se genera al hacer la visita). Para PQR: lo que ingresó el inspector
  // o lo que ya estaba en la fila pendiente del PQR original. El fallback a BD
  // se normaliza para evitar perpetuar formatos ISO o Date crudo.
  // Seguimiento de oficio (N° > 1): conserva la fecha de la 1ª visita.
  const fechaRadicadoFinal = (d.esOficio && !_oficioSeguimiento(d))
    ? _isoAFecha(d.fechaVisita)
    : (_isoAFecha(d.fechaRadicado) || _normalizarFechaCelda(fpRadicado));

  return [
    radicado,                                     // B  RADICADO
    fechaRadicadoFinal,                           // C  FECHA RADICADO
    d.direccion || '',                            // D  DIRECCION INFRACCION
    d.barrio || '',                               // E  BARRIO/VEREDA
    d.comuna || '',                               // F  COMUNA
    denunc,                                       // G  DENUNCIANTE/REMITENTE
    // El nombre se guarda tal como lo tecleó el inspector (solo trim de espacios)
    // para preservar particulas en minúscula como "de la", "del", etc.
    d.noAtiende ? 'No se atiende / No suministra datos' : (d.atiendeNombre || '').toString().trim(),  // H
    d.noAtiende ? 'No se atiende / No suministra datos' : (d.atiendeId || ''),             // I
    d.noAtiende ? 'No se atiende / No suministra datos' : (d.telNoAporta ? 'No aporta' : (d.atiendeTel || '')), // J
    d.noAtiende ? '' : relacionFinal,             // K  RELACION CON EL EVENTO
    d.noAtiende ? 'No se atiende / No suministra datos' : (d.dirNoAporta ? 'No aporta' : dirNotifFinal), // L
    d.noAtiende ? 'No se atiende / No suministra datos' : (d.emailNoAporta ? 'No aporta' : _soloMin(d.atiendeEmail)), // M
    estado,                                       // N  ESTADO VISITA
    _normalizarFechaCelda(fpFechaAsig) || _isoAFecha(d.fechaVisita) || _hoyDDMMYYYY_nv(), // O  FECHA ASIGNACION VISITA
    _isoAFecha(d.fechaVisita),                    // P  FECHA DE VISITA
    d.nVisita || 1,                               // Q  N° VISITA
    d.visitador || '',                            // R  VISITADOR(ES)
    '',                                           // S  FECHA 2DA VISITA
    '',                                           // T  VISITADOR2
    _normalizarFechaCelda(fpFechaDev) || '',      // U  FECHA DEVOLUCION
    '',                                           // V  DIAS
    d.estadoObra || '',                           // W  ESTADO OBRA
    _infraccionSoloCatalogo(d.infraccion),        // X  TIPO DE INFRACCION
    _areaTexto(d),                                // Y  AREA CONTRAVENCION m2
    d.quebrada || '',                             // Z  CUMPLE RETIRO QUEBRADA
    d.repLocativa || '',                          // AA REPARACION LOCATIVA
    d.habitado || '',                             // AB HABITADO
    d.alturaPisos || '',                          // AC ALTURA EN PISOS
    d.destActuales || '',                         // AD N° DESTINACIONES ACTUALES
    (d.usos || '') + (d.queFunciona ? ' · ' + d.queFunciona : ''), // AE USOS ACTUALES (+ que funciona)
    d.cubiertaActual || '',                       // AF TIPO CUBIERTA ACTUAL
    d.catastral || '',                            // AG CODIGO CATASTRAL
    d.ficha || '',                                // AH N° FICHA PREDIAL
    _soloMay(d.licencia),                         // AI N° LICENCIA
    d.licenciaAportada || '',                     // AJ SE APORTO LICENCIA
    d.licenciaAportada === 'SI' ? _isoAFecha(d.fechaLicencia) : '',  // AK FECHA LICENCIA
    d.licenciaAportada === 'SI' ? d.tipoLicencia    : '',            // AL TIPO Y MODALIDAD
    d.licenciaAportada === 'SI' ? d.pisos           : '',            // AM PISOS APROBADOS
    d.licenciaAportada === 'SI' ? d.destinaciones   : '',            // AN DESTINACIONES LICENCIA
    d.licenciaAportada === 'SI' ? d.cubierta        : '',            // AO CUBIERTA LICENCIA
    d.licenciaAportada === 'SI' ? d.sistema         : '',            // AP SISTEMA ESTRUCTURAL
    d.licenciaAportada === 'SI' ? d.obsLicencia     : '',            // AQ OBS LICENCIA
    d.suspension || '',                           // AR SUSPENSION DE LA OBRA
    d.orden || '',                                // AS N° ORDEN DE POLICIA
    citFmt,                                       // AT FECHA CITACION
    _primeraMayus(d.actuacion) + (d.obsConclusion ? '\n══CONCLUSIONES══\n' + d.obsConclusion : ''), // AU ACTUACION / OBSERVACIONES (incluye conclusiones)
    // Se anota a mano en el Sheet y la app no lo edita: se devuelve lo que
    // traía la fila (mandar '' lo borraba en cada guardado). Una visita de
    // seguimiento los hereda de la fila que se clonó: son del caso, y van
    // en cada visita nueva (decisión del usuario 2026-10-01).
    textoReiterados(filaPendiente),               // AV RADICADOS REITERADOS
    // Número, NUNCA string: un "6.345587" escrito como texto lo reinterpreta
    // el locale del Sheet (punto = separador de miles) y queda 6345587.
    d.lat != null ? Number(Number(d.lat).toFixed(6)) : '',  // AW LATITUD
    d.lon != null ? Number(Number(d.lon).toFixed(6)) : '',  // AX LONGITUD
    d.lat != null ? 'https://maps.google.com/?q=' + Number(d.lat).toFixed(6) + ',' + Number(d.lon).toFixed(6) : '', // AY MAPA
    _soloMay(d.poligono),                         // AZ POLIGONO USO SUELO
    d.amenaza || '',                              // BA AMENAZA
    d.sueloProt || '',                            // BB SUELO DE PROTECCION
    '',                                           // BC PRIORIDAD
    // LINK_DRIVE: si el state lo perdió por alguna razón (race condition,
    // restauración parcial de borrador), preservar el valor original de BD
    // para no borrar la carpeta ya creada en un actualizar posterior.
    linkDriveFinal || filaPendiente?.['LINK_DRIVE'] || '',  // BD LINK_DRIVE
  ];
}

// ══════════════════════════════════════════════════════════════
//   PRIMITIVOS DE FORMULARIO
// ══════════════════════════════════════════════════════════════
// `estado`: 'ok' → punto verde; 'pend' → punto ámbar (solo tras un intento
// de generar fallido, ver `mostrarPendientes`); undefined → sin indicador
// (secciones sin campos obligatorios, p. ej. Observaciones).
// `accion`: botón opcional a la derecha de la cabecera (p. ej. «Consultar»).
function _Seccion({ titulo, color, estado, accion, children }) {
  return (
    <div className="form-seccion" data-seccion={titulo}>
      <div className="form-seccion-cabecera">
        <span className={'form-seccion-titulo titulo-' + (color || 'azul')}>{titulo}</span>
        {estado === 'ok' && (
          <span className="sec-ind sec-ind-ok" role="img" aria-label="Sección completa" title="Sección completa" />
        )}
        {estado === 'pend' && (
          <span className="sec-ind sec-ind-pend" role="img" aria-label="Faltan campos en esta sección" title="Faltan campos en esta sección" />
        )}
        {accion && <span className="form-seccion-accion">{accion}</span>}
      </div>
      <div className="form-grid-2col" style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function _Campo({ label, children, hint, fullWidth }) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: el linter espera mayúscula inicial, `_Campo` es la convención de este archivo (CLAUDE.md)
  const autoId = React.useId();
  const esUnicoElemento = React.Children.count(children) === 1 && React.isValidElement(children);
  const inputId = esUnicoElemento ? (children.props.id || autoId) : null;
  const child = esUnicoElemento && !children.props.id
    ? React.cloneElement(children, { id: autoId })
    : children;
  return (
    <div className={'input-grupo' + (fullWidth ? ' full-width' : '')}>
      <label className="input-label" htmlFor={inputId || undefined}>{label}</label>
      {child}
      {hint && <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function _CheckNoAporta({ checked, onChange }) {
  return (
    <span style={{ float: 'right', fontWeight: 400 }}>
      {/* 44 px de toque sin agrandar el renglón de la etiqueta: el margen
          negativo devuelve lo que suma el alto (revisión 2026-10-28). */}
      <label className="check-tap" style={{ fontSize: 13, gap: 6, padding: '2px 0', minHeight: 44, margin: '-12px 0' }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        No aporta
      </label>
    </span>
  );
}

function _Input({ value, onChange, placeholder, type, mono, ...rest }) {
  return (
    <input
      type={type || 'text'}
      className={'input-campo' + (mono ? ' mono' : '')}
      value={value || ''}
      placeholder={placeholder || ''}
      onChange={e => onChange(e.target.value)}
      {...rest}
    />
  );
}

// `autoAlto`: el cuadro crece con el texto en vez de mostrar barra de
// desplazamiento — en «Situación encontrada» el inspector debe ver todo lo que
// irá al acta (2026-10-12). Nunca baja de `rows`; el usuario aún puede estirarlo.
function TextAreaNV({ value, onChange, placeholder, rows, autoAlto, ...rest }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!autoAlto || !el) return;
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight + el.offsetHeight - el.clientHeight) + 'px';
  }, [value, autoAlto]);
  return (
    <textarea
      ref={ref}
      className="input-campo"
      rows={rows || 4}
      value={value || ''}
      placeholder={placeholder || ''}
      onChange={e => onChange(e.target.value)}
      {...rest}
    />
  );
}

// Grupo de opciones excluyentes. Antes cada opción era un <div onClick>:
// sin foco, sin teclado y sin estado anunciado — en un control de captura de
// datos primario. Ahora son <button role="radio"> dentro de un radiogroup.
function _Radio({ value, onChange, opciones, disabled }) {
  return (
    <div className="radio-grupo" role="radiogroup" aria-disabled={disabled || undefined}>
      {opciones.map(o => {
        const v = typeof o === 'string' ? o : o.v;
        const l = typeof o === 'string' ? o : o.l;
        return (
          <button key={v} type="button" role="radio" aria-checked={value === v}
            className={'radio-opcion' + (value === v ? ' sel' : '')}
            disabled={disabled}
            onClick={() => onChange(v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

// ── Chips multi-select genérico ───────────────────────────────
// opciones: string[]  |  valor combinado se une con `separador`
// Soporta opción "Otro" que muestra campo de texto libre.
function _ChipsMulti({ opciones, value, onChange, separador, otroLabel }) {
  const sep = separador || ' · ';
  // Parsear SIN trim para preservar espacios durante la escritura del campo "Otro"
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_ChipsMulti`, convención guion bajo del archivo
  const partes = useMemoNV(() => {
    if (!value) return [];
    return value.split(sep).filter(Boolean);
  }, [value, sep]);

  const opcionesNormales = opciones.filter(o => o !== 'Otro');
  const isActive = (opt) => partes.some(s => s.trim() === opt);
  const valoresOtro = partes.filter(s => !opcionesNormales.includes(s.trim()) && s.trim() !== 'Otro');
  const otroActivo = partes.some(s => s.trim() === 'Otro') || valoresOtro.length > 0;
  const textoOtro = valoresOtro.join(sep);

  function toggle(opt) {
    let next;
    if (opt === 'Otro') {
      if (otroActivo) {
        next = partes.filter(s => opcionesNormales.includes(s.trim()));
      } else {
        next = [...partes.filter(s => opcionesNormales.includes(s.trim())), 'Otro'];
      }
    } else {
      if (isActive(opt)) {
        next = partes.filter(s => s.trim() !== opt);
      } else {
        next = [...partes, opt];
      }
    }
    onChange(next.join(sep));
  }

  function setTextoOtro(texto) {
    const base = partes.filter(s => opcionesNormales.includes(s.trim()));
    if (texto) {
      base.push(texto);
    }
    onChange(base.join(sep));
  }

  return (
    <div>
      <div className="chips">
        {opciones.map(opt => (
          <button key={opt} type="button"
            className={'chip' + ((opt === 'Otro' ? otroActivo : isActive(opt)) ? ' activo' : '')}
            onClick={() => toggle(opt)}>
            {opt}
          </button>
        ))}
      </div>
      {otroActivo && opciones.includes('Otro') && (
        <input
          type="text"
          className="input-campo"
          style={{ marginTop: 8 }}
          placeholder={otroLabel || '¿Cuál?'}
          value={textoOtro}
          onChange={e => setTextoOtro(e.target.value)}
        />
      )}
    </div>
  );
}

// ── Chips contravención (multi-select por grupos de literal) ──
function _ChipsContravencion({ value, onChange, ofrecerIndeterminada }) {
  const sep = ' | ';
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_ChipsContravencion`, convención guion bajo del archivo
  const seleccionados = useMemoNV(() => {
    if (!value) return [];
    return value.split(sep).map(s => s.trim()).filter(Boolean);
  }, [value]);

  const esNoInfraccion = seleccionados.includes(CONTRAVENCION_ESPECIAL);
  const esIndeterminada = seleccionados.includes(CONTRAVENCION_INDETERMINADA);

  // «No se evidencia» y A1 primero, en utils.js.
  function toggle(val) {
    onChange(alternarContravencion(seleccionados, val).join(sep));
  }

  return (
    <div>
      {CONTRAVENCION_GRUPOS.map(grupo => (
        <div key={grupo.literal} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--texto-suave)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {grupo.literal}
          </div>
          <div className="chips chips-rejilla">
            {grupo.opciones.map(opt => (
              <button key={opt.val} type="button"
                className={'chip' + (seleccionados.includes(opt.val) ? ' activo' : '')}
                onClick={() => toggle(opt.val)}>
                {opt.l}
              </button>
            ))}
          </div>
        </div>
      ))}
      {/* Opción especial */}
      <div style={{ marginTop: 6 }}>
        <div className="chips">
          <button type="button"
            className={'chip' + (esNoInfraccion ? ' activo' : '')}
            title="Excluyente: al marcarla se desmarcan los demás comportamientos"
            onClick={() => toggle(CONTRAVENCION_ESPECIAL)}>
            {CONTRAVENCION_ESPECIAL}
          </button>
          {/* Solo con «¿Requiere licencia?» = No se pudo determinar; si ya
              estaba marcada se deja ver para poder quitarla (R17 avisa). */}
          {(ofrecerIndeterminada || esIndeterminada) && (
            <button type="button"
              className={'chip' + (esIndeterminada ? ' activo' : '')}
              title="Excluyente: en Verificación documental no se pudo determinar si las obras requieren licencia"
              onClick={() => toggle(CONTRAVENCION_INDETERMINADA)}>
              {CONTRAVENCION_INDETERMINADA}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Select de barrio con optgroup por comuna ──────────────────
function _SelectBarrio({ barrio, barrioOtro, comuna, onChangeBarrio, onChangeBarrioOtro, onChangeComuna }) {
  const esOtro = barrio === '__otro__';

  function handleChange(val) {
    if (val === '__otro__') {
      onChangeBarrio('__otro__');
      return;
    }
    onChangeBarrio(val);
    // Auto-asignar comuna
    if (val && _BARRIO_A_COMUNA[val.toUpperCase()]) {
      onChangeComuna(_BARRIO_A_COMUNA[val.toUpperCase()]);
    }
  }

  // Determinar si el valor actual viene de la lista o es personalizado.
  // `_barrioDeLista` ignora mayúsculas, tildes y la grafía del POT: la BD
  // guarda 'NIQUIA' y la lista dice 'Niquía', y con `includes` exacto todo
  // barrio venido de BD caía a texto libre como si no se reconociera.
  const barrioDeLista = _barrioDeLista(barrio);
  const valorEnLista = !!barrioDeLista;
  // El <select> necesita el texto exacto de la opción, no el de la BD.
  const valorSelect = valorEnLista ? barrioDeLista : (barrio === '__otro__' ? '' : barrio);
  // Barrio heredado (filas V2, borradores viejos) que no está en la lista: se
  // pinta como opción propia para no perderlo ni dejar el <select> en blanco.
  const barrioHeredado = (!valorEnLista && barrio && barrio !== '__otro__') ? barrio : '';

  return (
    <div>
      <select className="input-campo" aria-label="Barrio" value={valorSelect} onChange={e => handleChange(e.target.value)}>
        <option value="">Seleccionar barrio...</option>
        {BARRIOS_POR_COMUNA.map(grupo => (
          <optgroup key={grupo.comuna} label={grupo.label}>
            {grupo.barrios.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </optgroup>
        ))}
        {barrioHeredado && <option value={barrioHeredado}>{barrioHeredado}</option>}
      </select>
      {(esOtro || (!valorEnLista && barrio && barrio !== '')) && (
        <input
          type="text"
          className="input-campo"
          style={{ marginTop: 8 }}
          aria-label="Nombre del barrio"
          placeholder="Escribir nombre del barrio"
          value={esOtro ? (barrioOtro || '') : barrio}
          onChange={e => {
            if (esOtro) {
              onChangeBarrioOtro(e.target.value);
            } else {
              onChangeBarrio(e.target.value);
            }
          }}
        />
      )}
    </div>
  );
}

// Botón de acción de campo (geocode, mejorar IA, dictar, consultar POT).
// Estilo en `.btn-accion` (styles.css): antes se construía entero inline y
// medía ~26px de alto, en una app que se usa de pie y con una mano.
// `busy` muestra un spinner además de deshabilitar: el archivo no tenía
// ni un solo indicador de carga — todo estado ocupado era cambio de texto.
function _BtnAccion({ children, onClick, busy, className, ...rest }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} aria-busy={!!busy}
      className={'btn-accion' + (className ? ' ' + className : '')} {...rest}>
      {busy && <span className="spinner-btn" aria-hidden="true" />}
      {children}
    </button>
  );
}

// Ejecuta cb(true) cuando la API JS de Google Maps esté disponible.
// El <script> de Maps en index.html es `async`: puede llegar DESPUÉS de que
// React monte la vista. Antes los efectos de mapa salían sin construir nada y
// NO reintentaban (Nueva visita se quedaba con el recuadro vacío hasta la
// primera captura GPS; Norma dejaba fijo "Google Maps no cargó").
// Sondea cada 300 ms y se rinde a los timeoutMs (20 s por defecto) con
// cb(false). Devuelve la función para cancelar el sondeo.
// Compartida con consulta-norma.jsx (build.js concatena los .jsx en un solo
// scope; nueva-visita.jsx va antes que consulta-norma.jsx).
function _cuandoGoogleMapsListo(cb, timeoutMs) {
  if (typeof google !== 'undefined' && google.maps) { cb(true); return function () {}; }
  // El SDK ya no viene en index.html: esta es la primera pantalla que lo
  // necesita, así que aquí se dispara la descarga. `cargarMapsJS` es
  // idempotente — varias pantallas montándose a la vez comparten una sola
  // etiqueta <script>. El sondeo de abajo sigue igual porque el SDK se
  // anuncia listo por su cuenta, no por el onload del script.
  if (typeof cargarMapsJS === 'function') cargarMapsJS();
  // Sin señal no hay SDK que esperar: rendirse ya en vez de tener al inspector
  // 20 s frente a un recuadro gris vacío. `_MapaGPS` reintenta al reconectar.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { cb(false); return function () {}; }
  var limite = Date.now() + (timeoutMs || 20000);
  var id = setInterval(function () {
    if (typeof google !== 'undefined' && google.maps) { clearInterval(id); cb(true); }
    else if (Date.now() > limite) { clearInterval(id); cb(false); }
  }, 300);
  return function () { clearInterval(id); };
}

function _googleMapsYaEsta() {
  return typeof google !== 'undefined' && !!google.maps;
}

// Resalta en el mapa el contorno catastral del predio que contiene el punto.
// polysRef guarda los google.maps.Polygon dibujados para poder quitarlos al
// mover el pin. Devuelve una función de cancelación: la búsqueda es async
// (puede estar bajando catastro.json) y un punto viejo no debe pintar encima
// del nuevo. Lo usan el formulario de visita y Consulta Norma.
// `excluir`: terrenos que ya se dibujan como predio de la dirección (no se
// repite el contorno cuando pin y dirección son el mismo predio).
// Colores de contorno: amarillo = predio bajo el pin, celeste = predio de la
// dirección. Los dos se leen sobre la foto aérea ('hybrid') y el callejero.
// El amarillo es el VALOR de --valla (styles.css): Google Maps no resuelve
// var(--…), así que va copiado aquí — si cambia el token, se repite. El
// celeste no es de la Valla: es un color de mapa (trazo de catastro).
var COLOR_PREDIO_PIN = '#F2C200', COLOR_PREDIO_DIR = '#00E5FF';
function _dibujarAnillos(map, anillos, color) {
  return anillos.map(function (anillo) {
    return new google.maps.Polygon({
      paths: anillo.map(function (c) { return { lat: c[0], lng: c[1] }; }),
      map: map,
      strokeColor: color, strokeOpacity: 1, strokeWeight: 2,
      fillColor: color, fillOpacity: 0.15,
      // No clicable: tocar dentro del predio tiene que seguir moviendo el pin.
      clickable: false,
      // Encima de las afectaciones POT (zIndex 1–8): el lindero manda.
      zIndex: 10,
    });
  });
}

// Afectaciones POT (retiro de quebrada, amenaza, suelo de protección, DRMI)
// alrededor del pin, recortadas por afectacionesPOTCerca (api.js). Va debajo
// del contorno catastral y no es clicable: tocar sigue moviendo el pin.
// onLeyenda recibe [{ etiqueta, color, contiene }] para pintar la leyenda.
function _pintarAfectacionesPOT(map, capaRef, lat, lon, onLeyenda) {
  if (capaRef.current) { capaRef.current.setMap(null); capaRef.current = null; }
  if (!map || lat == null || lon == null || typeof afectacionesPOTCerca !== 'function') {
    if (onLeyenda) onLeyenda([]);
    return function () {};
  }
  let vigente = true;
  afectacionesPOTCerca(Number(lat), Number(lon)).then(function (items) {
    if (!vigente) return;
    const capa = new google.maps.Data({ map: map });
    items.forEach(function (it) {
      it.features.forEach(function (f) { try { capa.addGeoJson(f); } catch (e) {} });
    });
    capa.setStyle(function (f) {
      const borde = f.getProperty('_tipo') === 'borde';
      const c = f.getProperty('_color');
      const z = f.getProperty('_z') || 1;
      // Bordes por encima de todos los rellenos; el retiro (z 4) se rellena
      // más fuerte para que el azul no se pierda bajo el verde.
      return {
        clickable: false, zIndex: borde ? 4 + z : z,
        strokeColor: c, strokeOpacity: borde ? 0.95 : 0, strokeWeight: borde ? (z === 4 ? 3 : 2) : 0,
        fillColor: c, fillOpacity: borde ? 0 : (z === 4 ? 0.35 : 0.18),
      };
    });
    capaRef.current = capa;
    if (onLeyenda) onLeyenda(items.map(function (it) {
      return { etiqueta: it.etiqueta, color: it.color, contiene: it.contiene };
    }));
  }).catch(function (e) {
    // Sin capas POT (offline sin precarga) el mapa sigue sirviendo sin ellas.
    console.warn('[Mapa] sin afectaciones POT:', e.message);
  });
  return function () { vigente = false; };
}

// Renglones de la leyenda POT, a continuación de los del predio: uno por
// capa (un color = un renglón) y, si cae en el pin, qué categoría
// (leyendaPOTPorCapa, utils.js). Antes, uno por categoría: 4 rojos y 7
// verdes iguales que no había cómo emparejar con el mapa.
function _LeyendaPOT({ items }) {
  return leyendaPOTPorCapa(items).map(function (c) {
    return (
      <span key={c.capa} className={c.contiene ? 'mapa-leyenda-pot-en' : ''}>
        <i style={{ borderColor: c.color, background: c.color + '38' }} />
        {c.nombre}
        {c.contiene && (c.enPin.length ? ' · en el pin: ' + c.enPin.join('; ') : ' · en el pin')}
      </span>
    );
  });
}
function _resaltarPredioCatastral(map, polysRef, lat, lon, excluir) {
  (polysRef.current || []).forEach(function (pg) { pg.setMap(null); });
  polysRef.current = [];
  if (!map || lat == null || lon == null || typeof poligonosCatastroGPS !== 'function') {
    return function () {};
  }
  let vigente = true;
  poligonosCatastroGPS(Number(lat), Number(lon)).then(function (terrenos) {
    if (!vigente) return;
    const ex = excluir || [];
    polysRef.current = _dibujarAnillos(map, terrenos
      .filter(function (t) { return ex.indexOf(t.tcod) < 0; })
      .map(function (t) { return t.anillo; }), COLOR_PREDIO_PIN);
  }).catch(function (e) {
    // Sin catastro.json (offline sin precarga) el mapa sigue sirviendo sin contorno.
    console.warn('[Mapa] sin contorno catastral:', e.message);
  });
  return function () { vigente = false; };
}

// Mapa Google Maps con pin arrastrable para corregir coordenadas.
// Sin coordenadas muestra vista general de Bello; con coords, zoom 18 + pin.
function _MapaGPS({ lat, lon, onMove, direccion, terrenosDir, conflicto }) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_MapaGPS`, convención guion bajo del archivo (3 refs seguidas)
  const mapRef = React.useRef(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const gMapRef = React.useRef(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const markerRef = React.useRef(null);
  // onMove en ref: el listener 'dragend' se registra UNA sola vez (al crear el
  // marcador) y capturaba el onMove de aquel render. Como es una arrow inline,
  // el closure quedaba congelado con las funciones de ese primer render.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const onMoveRef = React.useRef(onMove);
  onMoveRef.current = onMove;
  // null = esperando el script de Maps · true = listo · false = se rindió
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [gmListo, setGmListo] = React.useState(_googleMapsYaEsta() ? true : null);
  const tieneCoords = lat != null && lon != null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffectNV(() => {
    if (gmListo !== null) return;
    return _cuandoGoogleMapsListo(setGmListo);
  }, [gmListo]);

  // Reintentar al recuperar señal: el caso de campo es entrar sin cobertura y
  // recuperarla después, y hasta ahora el mapa se quedaba rendido para siempre.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffectNV(() => {
    function _alVolver() { setGmListo(function (prev) { return prev === false ? null : prev; }); }
    window.addEventListener('online', _alVolver);
    return function () { window.removeEventListener('online', _alVolver); };
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffectNV(() => {
    if (gmListo !== true || !mapRef.current) return;
    const pos = tieneCoords
      ? { lat: Number(lat), lng: Number(lon) }
      : { lat: 6.338, lng: -75.556 };
    const zoom = tieneCoords ? 18 : 14;

    if (!gMapRef.current) {
      gMapRef.current = new google.maps.Map(mapRef.current, {
        // 'hybrid' y no 'satellite': el satélite puro no trae rótulos y el
        // inspector no ve los nombres de las calles sobre la foto aérea.
        center: pos, zoom, mapTypeId: 'hybrid',
        disableDefaultUI: true, zoomControl: true,
        gestureHandling: 'greedy',
        // Cruz y no mano: tocar el mapa marca el punto, no solo lo desplaza.
        draggableCursor: 'crosshair',
        // Íconos de negocios visibles (orientan) pero no tocables: el click
        // sobre uno trae la coordenada del negocio, no la del toque, y el pin
        // caía en otro predio.
        clickableIcons: false,
      });
      // Tocar el mapa coloca (o mueve) el pin: sirve cuando el GPS no da señal
      // o cuando se diligencia después, lejos del predio. Pasa por onMove igual
      // que arrastrar, así re-consulta POT y catastro con el punto nuevo.
      gMapRef.current.addListener('click', (e) => {
        if (!e.latLng || !onMoveRef.current) return;
        onMoveRef.current(e.latLng.lat(), e.latLng.lng());
      });
    } else {
      gMapRef.current.setCenter(pos);
      // No alejar a quien ya acercó más para afinar el punto.
      if (!tieneCoords || gMapRef.current.getZoom() < zoom) gMapRef.current.setZoom(zoom);
    }

    if (tieneCoords) {
      if (!markerRef.current) {
        markerRef.current = new google.maps.Marker({
          position: pos, map: gMapRef.current, draggable: true,
          title: 'Arrastra para corregir ubicación',
        });
        markerRef.current.addListener('dragend', () => {
          const p = markerRef.current.getPosition();
          if (onMoveRef.current) onMoveRef.current(p.lat(), p.lng());
        });
      } else {
        markerRef.current.setPosition(pos);
        markerRef.current.setMap(gMapRef.current);
      }
    } else if (markerRef.current) {
      markerRef.current.setMap(null);
    }
  }, [lat, lon, gmListo]);

  // Sin pin, centrar el mapa en la dirección escrita para que el inspector
  // encuentre el predio y lo toque. Solo centra: el geocoding de direcciones
  // de Bello es aproximado (vive del fallback Nominatim/Photon), así que nunca
  // se toma como la ubicación — esa la pone el GPS o el toque en el mapa.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_MapaGPS`
  const [centradoEnDir, setCentradoEnDir] = React.useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_MapaGPS`
  useEffectNV(() => {
    if (gmListo !== true || tieneCoords || !direccion || direccion.length < 8) return;
    // Si catastro encontró el predio de la dirección, el mapa ya se centra en
    // él (efecto de abajo): el geocoder es aproximado y lo movería.
    if (terrenosDir && terrenosDir.length) return;
    if (typeof geocodeDireccion !== 'function' || !navigator.onLine) return;
    let vigente = true;
    // Debounce: la dirección se escribe tecla a tecla.
    const t = setTimeout(async () => {
      try {
        const r = await geocodeDireccion(direccion);
        const c = r && (r.data || r);
        if (!vigente || !gMapRef.current || !c || c.lat == null || c.lng == null) return;
        const la = Number(c.lat), lo = Number(c.lng);
        // Resultado fuera de Bello (el geocoder suele caer en Medellín con
        // direcciones ambiguas): mejor dejar el mapa donde está.
        if (!(la > 6.30 && la < 6.48 && lo > -75.66 && lo < -75.47)) return;
        gMapRef.current.setCenter({ lat: la, lng: lo });
        gMapRef.current.setZoom(18);
        setCentradoEnDir(true);
      } catch (e) {
        console.warn('[Mapa] no se pudo centrar en la dirección:', e.message);
      }
    }, 1200);
    return () => { vigente = false; clearTimeout(t); };
  }, [direccion, tieneCoords, gmListo, terrenosDir]);

  // Contorno del predio de la dirección (celeste). Sin pin, además centra el
  // mapa en él: es la ubicación exacta de catastro, no la aproximada del geocoder.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_MapaGPS`
  const predioDirRef = React.useRef([]);
  const _tcodsDir = (terrenosDir || []).map(function (t) { return t.tcod; });
  const _claveDir = _tcodsDir.join(',');
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_MapaGPS`
  useEffectNV(() => {
    predioDirRef.current.forEach(function (pg) { pg.setMap(null); });
    predioDirRef.current = [];
    if (gmListo !== true || !gMapRef.current || !terrenosDir || !terrenosDir.length) return;
    predioDirRef.current = _dibujarAnillos(gMapRef.current,
      terrenosDir.map(function (t) { return t.anillo; }), COLOR_PREDIO_DIR);
    if (!tieneCoords) {
      const b = new google.maps.LatLngBounds();
      terrenosDir.forEach(function (t) { t.anillo.forEach(function (c) { b.extend({ lat: c[0], lng: c[1] }); }); });
      gMapRef.current.fitBounds(b);
      // fitBounds de un solo lote acerca demasiado: el inspector pierde la cuadra.
      google.maps.event.addListenerOnce(gMapRef.current, 'idle', function () {
        if (gMapRef.current && gMapRef.current.getZoom() > 19) gMapRef.current.setZoom(19);
      });
    }
  }, [_claveDir, gmListo, tieneCoords]);

  // Dirección y pin en predios distintos: se encuadran los dos para que el
  // inspector vea entre qué elige (a 60 m el de la dirección quedaba fuera).
  // Una vez al aparecer el conflicto, no a cada movimiento del pin.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_MapaGPS`
  useEffectNV(() => {
    if (!conflicto || gmListo !== true || !gMapRef.current || !terrenosDir || !terrenosDir.length) return;
    const b = new google.maps.LatLngBounds();
    terrenosDir.forEach(function (t) { t.anillo.forEach(function (c) { b.extend({ lat: c[0], lng: c[1] }); }); });
    b.extend({ lat: Number(lat), lng: Number(lon) });
    gMapRef.current.fitBounds(b, 40);
    google.maps.event.addListenerOnce(gMapRef.current, 'idle', function () {
      if (gMapRef.current && gMapRef.current.getZoom() > 19) gMapRef.current.setZoom(19);
    });
  }, [conflicto, _claveDir, gmListo]);

  // Contorno catastral del predio bajo el pin (se redibuja al moverlo).
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_MapaGPS`
  const predioRef = React.useRef([]);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_MapaGPS`
  useEffectNV(() => {
    if (gmListo !== true || !gMapRef.current) return;
    return _resaltarPredioCatastral(gMapRef.current, predioRef,
      tieneCoords ? lat : null, tieneCoords ? lon : null, _tcodsDir);
  }, [lat, lon, gmListo, _claveDir]);

  // Afectaciones POT alrededor del pin (se redibujan al moverlo).
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_MapaGPS`
  const potRef = React.useRef(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_MapaGPS`
  const [leyendaPOT, setLeyendaPOT] = React.useState([]);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_MapaGPS`
  useEffectNV(() => {
    if (gmListo !== true || !gMapRef.current) return;
    return _pintarAfectacionesPOT(gMapRef.current, potRef,
      tieneCoords ? lat : null, tieneCoords ? lon : null, setLeyendaPOT);
  }, [lat, lon, gmListo]);

  // Limpieza de listeners al desmontar (mapa/marker persisten toda la vida
  // del componente, se crean una sola vez arriba — solo falta esto al final).
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_MapaGPS`
  useEffectNV(() => {
    return () => {
      // Guardado: si el script de Maps nunca cargó, `google` no existe y el
      // propio desmontaje lanzaría.
      if (!_googleMapsYaEsta()) return;
      if (markerRef.current) google.maps.event.clearInstanceListeners(markerRef.current);
      if (gMapRef.current) google.maps.event.clearInstanceListeners(gMapRef.current);
    };
  }, []);

  // Sin mapa, el aviso va DENTRO del recuadro y a su altura: antes quedaba una
  // caja gris alta y vacía con un microtexto suelto encima.
  return (
    <div>
      <div ref={mapRef} className={'mapa-gps' + (gmListo === true ? '' : ' mapa-gps-sin')}>
        {gmListo !== true && (
          <span>
            {gmListo === null
              ? 'Cargando mapa…'
              : 'Mapa no disponible sin conexión. Las coordenadas sí se capturan y se guardan.'}
          </span>
        )}
      </div>
      {/* Bajo el mapa, no encima: así el mapa arranca a la altura del panel
          «Predio» de la derecha. */}
      {gmListo === true && (
        <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginTop: 4 }}>
          {tieneCoords
            ? 'Toca el mapa o arrastra el pin para corregir la ubicación'
            : (terrenosDir && terrenosDir.length)
              ? 'Mapa en el predio de la dirección según catastro: toca el predio para colocar el pin'
            : centradoEnDir
              ? 'Mapa centrado en la dirección escrita (aproximado): toca el predio para colocar el pin'
              : 'Captura tu ubicación o toca el mapa en el predio para colocar el pin'}
        </div>
      )}
      {gmListo === true && (
        <div className="mapa-leyenda" aria-hidden="true">
          <span><i style={{ borderColor: COLOR_PREDIO_DIR }} />Predio de la dirección</span>
          <span><i style={{ borderColor: COLOR_PREDIO_PIN }} />Predio bajo el pin</span>
          <_LeyendaPOT items={leyendaPOT} />
        </div>
      )}
    </div>
  );
}

// Tarjeta de ficha catastral con datos completos. Click → onSeleccionar.
// Reutilizable entre Nueva visita y Consulta de norma.
function _TarjetaFichaCatastral({ r, onSeleccionar, expandida }) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_TarjetaFichaCatastral`, convención guion bajo del archivo
  const [abierta, setAbierta] = React.useState(!!expandida);
  const titular = r.propietario || '—';
  return (
    <div style={{
      borderRadius: 8, border: '1px solid ' + (r.municipal ? 'var(--rojo)' : 'var(--borde)'),
      background: r.municipal ? 'var(--rojo-bg)' : 'var(--superficie)',
      overflow: 'hidden',
      flexShrink: 0,           // evita que se aplaste dentro de flex-column con scroll
      marginBottom: 4,
    }}>
      <button type="button" className="btn-cabecera" style={{ padding: '10px 12px' }} onClick={() => setAbierta(!abierta)}>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
              Ficha <span style={{ fontFamily: 'var(--font-mono)' }}>{r.ficha}</span>
              <span style={{ fontWeight: 400, color: 'var(--texto-suave)', marginLeft: 8, fontSize: 13 }}>
                · {r.destinacion || 'Sin destinación'}
              </span>
            </span>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--texto-suave)' }}>
              {r.direccion || 'Sin dirección'}
            </span>
            <span style={{ display: 'block', fontSize: 13, marginTop: 2 }}>
              <span style={{ color: 'var(--texto-suave)' }}>{r.esRazonSocial ? 'Razón social: ' : 'Titular: '}</span>
              <span style={{ fontWeight: 500 }}>{titular}</span>
            </span>
          </span>
          <span style={{ color: 'var(--texto-suave)', display: 'inline-flex' }}>
            {abierta ? <Icon.ChevronUp size={12} /> : <Icon.Chevron size={12} />}
          </span>
        </span>
      </button>
      {abierta && (
        <div style={{
          borderTop: '1px solid var(--borde)', padding: '10px 12px',
          background: 'var(--gris-bg)', fontSize: 13,
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', alignItems: 'baseline',
        }}>
          <span style={{ color: 'var(--texto-suave)' }}>NPN:</span>
          <span style={{ fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere', minWidth: 0 }}>{r.catastral}</span>
          <span style={{ color: 'var(--texto-suave)' }}>Matrícula:</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{r.matricula || '—'}</span>
          <span style={{ color: 'var(--texto-suave)' }}>Avalúo:</span>
          <span style={{ fontWeight: 600 }}>{formatearCOP(r.avaluo)}</span>
          {onSeleccionar && (
            <>
              <span></span>
              <button type="button" onClick={(e) => { e.stopPropagation(); onSeleccionar(); }}
                className="btn-principal secundario"
                style={{ margin: 0, marginTop: 6, padding: '6px 14px', fontSize: 13, justifySelf: 'start' }}>
                Usar esta ficha
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
window._TarjetaFichaCatastral = _TarjetaFichaCatastral;

// Lista filtrable de fichas catastrales. Reutilizada en Nueva visita y Norma.
// Si hay >10 fichas, muestra input para filtrar por ficha, dirección o titular.
function _ListaFichasCatastrales({ fichas, onSeleccionar, maxAlto }) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_ListaFichasCatastrales`, convención guion bajo del archivo
  const [filtro, setFiltro] = React.useState('');
  // Ordenar por prioridad descendente:
  //   1) fichas con matrícula inmobiliaria (más útiles para el inspector)
  //   2) predios municipales (Municipio de Bello)
  //   3) orden original (estable)
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_ListaFichasCatastrales`
  const fichasOrdenadas = React.useMemo(() => {
    const lista = (fichas || []).map((r, i) => ({ r, i }));
    lista.sort((a, b) => {
      const ma = !!(a.r && String(a.r.matricula || '').trim());
      const mb = !!(b.r && String(b.r.matricula || '').trim());
      if (ma !== mb) return ma ? -1 : 1;
      const mua = !!(a.r && a.r.municipal);
      const mub = !!(b.r && b.r.municipal);
      if (mua !== mub) return mua ? -1 : 1;
      return a.i - b.i;
    });
    return lista.map(x => x.r);
  }, [fichas]);
  const mostrarFiltro = fichasOrdenadas.length > 10;
  const filtroNorm = filtro.trim().toLowerCase();
  const fichasFiltradas = filtroNorm
    ? fichasOrdenadas.filter(r =>
        String(r.ficha).includes(filtroNorm) ||
        (r.direccion || '').toLowerCase().includes(filtroNorm) ||
        (r.propietario || '').toLowerCase().includes(filtroNorm) ||
        (r.catastral || '').includes(filtroNorm))
    : fichasOrdenadas;
  return (
    <div>
      {mostrarFiltro && (
        <input
          type="text"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder={`Filtrar ${fichas.length} fichas por ficha, dirección o titular...`}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: '1px solid var(--borde)', background: 'var(--superficie)',
            fontFamily: 'inherit', fontSize: 13, marginBottom: 8,
          }}
        />
      )}
      <div style={{ maxHeight: maxAlto || 420, overflowY: 'auto', paddingRight: 4 }}>
        {fichasFiltradas.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--texto-suave)', textAlign: 'center', padding: 20 }}>
            Sin coincidencias para "{filtro}".
          </div>
        ) : (
          fichasFiltradas.map((r, i) => (
            <_TarjetaFichaCatastral key={r.ficha != null ? String(r.ficha) : i} r={r}
              onSeleccionar={onSeleccionar ? () => onSeleccionar(r) : null} />
          ))
        )}
      </div>
      {mostrarFiltro && filtroNorm && (
        <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginTop: 6, textAlign: 'center' }}>
          {fichasFiltradas.length} de {fichas.length} fichas
        </div>
      )}
    </div>
  );
}
window._ListaFichasCatastrales = _ListaFichasCatastrales;

// ── Panel «Predio»: dirección ↔ catastro ↔ pin ─────────────────
// Solo pinta: el formulario calcula todo (compararUbicacion y compañía viven
// en utils.js con tests). Arriba el estado y su acción; en el cuerpo, la
// ficha del predio — es con lo que el inspector decide si confirma. Los
// mensajes del proceso solo salen cuando piden algo: si dirección y punto
// cuadran, no se dice (antes eran dos renglones que repetían lo mismo).
// Dirección de catastro en el formato de la app (`TV 56A N 49-15 AP 201` →
// `TV 56A # 49-15`); si no se reconoce, tal cual.
function _dirCatastro(dir) {
  const k = dir && claveDireccionCatastro(dir);
  return (k && direccionDesdeClave(k.base)) || dir || '';
}

function _PanelPredio(p) {
  const bloqueo = !p.hayPin ? 'Falta el punto: toca el predio en el mapa o captura tu ubicación.'
    : p.cmp.estado === 'distinto' ? 'Elige cuál predio es antes de confirmar.'
    : !p.catastral ? (p.faltaUnidad
        ? 'Elige la unidad en la lista, o usa el código del predio si no se identifica.'
        : 'Falta la ficha catastral.')
    : '';
  let lineaDir = null;
  if (p.esRural) lineaDir = 'Zona rural: el predio sale del punto en el mapa.';
  else if (p.estadoBusq === 'buscando') lineaDir = 'Buscando la dirección en catastro…';
  else if (p.estadoBusq === 'no-reconocible') lineaDir = 'La dirección no tiene placa reconocible para catastro: el predio sale del punto.';
  else if (p.estadoBusq === 'sin-catastro') lineaDir = 'Catastro no disponible (sin conexión): el predio sale del punto.';
  else if (p.predioDir && !p.predioDir.exacta && !p.predioDir.terrenos.length) lineaDir = 'Dirección no encontrada en catastro: el predio sale del punto.';
  // Candidatos: placas cercanas (no exacta) o varios terrenos con la misma
  // dirección sin pin que desempate.
  const candidatos = !p.predioDir ? [] :
    !p.predioDir.exacta ? p.predioDir.terrenos :
    (p.predioDir.terrenos.length > 1 && !p.hayPin ? p.predioDir.terrenos : []);
  return (
    <div className={'predio-panel' + (p.vigente ? ' predio-vigente' : '')}>
      <div className="predio-fila predio-titulo">
        <span className={'ent-dot ' + (p.vigente ? 'ed-ok' : 'ed-pend')} aria-hidden="true" />
        <strong className={p.vigente ? 'predio-ok' : ''}>
          {p.vigente ? 'Ubicación confirmada' : 'Ubicación sin confirmar'}
        </strong>
        {!p.vigente && (
          <button type="button" className="btn-accion predio-btn predio-confirmar" disabled={!!bloqueo}
            onClick={p.onConfirmar} title={bloqueo || undefined}>
            Confirmar ubicación
          </button>
        )}
      </div>
      {!p.vigente && bloqueo && <div className="predio-nota">{bloqueo}</div>}
      {p.consultando ? (
        <div className="predio-nota" role="status">
          <span className="spinner-btn" aria-hidden="true" /> Consultando catastro y POT…
        </div>
      ) : p.fallo && p.hayPin && (
        <div className="predio-conflicto" role="alert" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <span style={{ flex: '1 1 auto' }}>No se pudo consultar catastro o POT.</span>
          <button type="button" className="btn-neutro predio-btn" onClick={p.onReintentar}>
            Reintentar
          </button>
        </div>
      )}
      {lineaDir && <div className="predio-nota">{lineaDir}</div>}
      {candidatos.length > 0 && (
        <div>
          <div className="predio-nota">
            {p.predioDir.exacta
              ? p.predioDir.terrenos.length + ' predios con esta dirección. ¿Cuál es?'
              : 'No está exacta en catastro. Cercanas en la misma cuadra:'}
          </div>
          <div className="predio-chips">
            {candidatos.map(function (t) {
              const sel = p.terrenoElegido === t.tcod;
              return (
                <button key={t.tcod} type="button" aria-pressed={sel}
                  className={'chip-predio' + (sel ? ' chip-predio-sel' : '')}
                  onClick={function () { p.onElegir(sel ? null : t.tcod); }}>
                  {t.direccion || t.tcod}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {p.preferirPunto && (
        <div className="predio-nota">Se toma el predio del punto: la dirección cae en otro predio de catastro.</div>
      )}
      {p.cmp.estado === 'coincide' && p.cmp.distM > 0 && (
        <div className="predio-nota">
          El punto está a {p.cmp.distM} m del predio de la dirección (calle o lindero): se toma el predio de la dirección.
        </div>
      )}
      {p.cmp.estado === 'sin-pin' && p.cmp.tcod && (
        <div className="predio-fila">
          <button type="button" className="btn-neutro predio-btn" onClick={p.onUbicarEnDireccion}>
            Ubicar en el predio de la dirección
          </button>
        </div>
      )}
      {/* Conflicto: se pregunta por el predio, no por «dirección o punto».
          Cada opción lleva la dirección que catastro tiene para ese predio y
          el color de su contorno en el mapa, que en conflicto encuadra los
          dos. Elegir el del pin NO cambia la dirección de la visita. */}
      {p.cmp.estado === 'distinto' && (
        <div className="predio-conflicto" role="group" aria-label="¿Cuál es el predio de la visita?">
          <strong>¿Cuál es el predio de la visita?</strong>
          <div className="predio-opcion">
            <i className="predio-muestra" style={{ borderColor: COLOR_PREDIO_DIR }} aria-hidden="true" />
            <div className="predio-opcion-txt">
              <div className="predio-mono">{_dirCatastro(p.dirPredioDir) || p.direccion}</div>
              <div className="predio-nota">El de la dirección escrita · a {p.cmp.distM} m del pin</div>
            </div>
            <button type="button" className="btn-neutro predio-btn" onClick={p.onUsarDireccion}
              aria-label="Es el predio de la dirección escrita (mueve el pin)">
              Es este
            </button>
          </div>
          <div className="predio-opcion">
            <i className="predio-muestra" style={{ borderColor: COLOR_PREDIO_PIN }} aria-hidden="true" />
            <div className="predio-opcion-txt">
              <div className="predio-mono">{_dirCatastro(p.fichasPH[0] && p.fichasPH[0].direccion) || 'Predio sin dirección en catastro'}</div>
              <div className="predio-nota">
                Donde está el pin{p.fichasPH.length > 1 ? ' · ' + p.fichasPH.length + ' unidades' : ''}
              </div>
            </div>
            <button type="button" className="btn-neutro predio-btn" onClick={p.onUsarPunto}
              aria-label="Es el predio donde está el pin">
              Es este
            </button>
          </div>
        </div>
      )}
      {/* Propiedad horizontal: la lista vive solo aquí; elegir la unidad es
          parte de la confirmación. Con la ficha ya elegida, su tarjeta. */}
      {p.cmp.estado === 'distinto' ? null : !p.catastral && p.faltaUnidad ? (
        <div>
          <div className="predio-nota">
            {p.fichasPH.length} unidades en este predio (propiedad horizontal): elige la correcta.
          </div>
          <_ListaFichasCatastrales fichas={p.fichasPH} onSeleccionar={p.onSeleccionarFicha} maxAlto={260} />
          {/* Sin la unidad (placa sin interior, nadie atiende): se confirma
              con el código del predio matriz y sin ficha. Solo aquí, donde
              catastro sí dio el predio pero no dice cuál unidad es. */}
          <div className="predio-fila" style={{ marginTop: 8 }}>
            <button type="button" className="btn-neutro predio-btn" onClick={p.onSinUnidad}>
              No se identifica la unidad: usar el código del predio
            </button>
          </div>
        </div>
      ) : p.sinUnidad ? (
        <div>
          <div className="predio-nota">
            Propiedad horizontal sin la unidad identificada ({p.fichasPH.length} unidades): se usa el código del predio, sin ficha.
          </div>
          <div className="predio-nota predio-mono">{p.catastral}</div>
          <div className="predio-fila">
            <button type="button" className="btn-neutro predio-btn" onClick={p.onElegirUnidad}>
              Elegir la unidad
            </button>
          </div>
        </div>
      ) : p.fichaInfo ? (
        <>
          {p.fichaInfo.municipal && (
            <div className="predio-municipal">
              <Icon.Alert size={16} /> Predio del <strong>Municipio de Bello</strong>
            </div>
          )}
          {/* Con la ubicación confirmada la ficha queda resumida (ficha,
              dirección, titular): NPN, matrícula y avalúo se abren tocándola.
              La `key` la vuelve a montar al confirmar o desconfirmar. */}
          <_TarjetaFichaCatastral key={p.vigente ? 'resumen' : 'detalle'} r={p.fichaInfo} expandida={!p.vigente} />
        </>
      ) : (
        <div className="predio-nota predio-mono">
          {p.catastral
            ? 'Ficha ' + (p.ficha || '—') + ' · ' + p.catastral
            : 'Sin ficha catastral'}
        </div>
      )}
      {/* Coordenadas: en escritorio no hay caja de GPS (no hay GPS), así que
          van aquí en pequeño. En el teléfono ya las muestra esa caja. */}
      <div className="predio-nota predio-mono predio-coords">{p.coords}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//   MODAL INICIO — Elige tipo de visita y busca radicado
// ══════════════════════════════════════════════════════════════
// Rediseño 2026-09-30: la primera pregunta ya no es «¿PQR u oficio?» sino
// «¿el caso ya existe?». Una 2ª visita de un caso de oficio ES un caso con
// radicado (OFICIO-…), y con la pregunta vieja el inspector la abría como
// oficio nuevo (fila 1662). Buscar va primero y acepta radicado, orden de
// policía o dirección (buscarCasos, utils.js); «Abrir caso de oficio nuevo»
// queda como la otra salida, rotulada solo para la primera visita.
// `busquedaInicial`: el aviso «¿Es un seguimiento?» del formulario reabre el
// modal ya buscando el caso que encontró.
function ModalInicioVisita({ onResult, onCancelar, busquedaInicial }) {
  const [paso, setPaso]         = React.useState('inicio');  // 'inicio' | 'lista' | 'vacio' | 'resultado'
  const [texto, setTexto]       = React.useState(busquedaInicial || '');
  const [buscando, setBuscando] = React.useState(false);
  const [casos, setCasos]       = React.useState([]);
  const [tipoBusq, setTipoBusq] = React.useState('');
  const [resultado, setResultado] = React.useState(null);
  // resultado: { encontrado, radicado, visitas[], ultimaVisita, nVisitaSig }

  React.useEffect(() => {
    if (busquedaInicial) buscarCaso(busquedaInicial);
  }, []);

  async function buscarCaso(q) {
    const consulta = String(q == null ? texto : q).trim();
    if (!consulta) return;
    setBuscando(true);
    try {
      const { datos } = await leerVisitas({ forzar: true });
      const r = buscarCasos(datos, consulta);
      setTipoBusq(r.tipo);
      setCasos(r.casos);
      if (r.casos.length === 1) abrirCaso(r.casos[0]);
      else setPaso(r.casos.length ? 'lista' : 'vacio');
    } catch (e) {
      await appAlert('Error al buscar: ' + e.message, { tono: 'error', titulo: 'Error' });
    }
    setBuscando(false);
  }

  function abrirCaso(caso) {
    setResultado({
      encontrado: true,
      radicado: caso.radicado,
      visitas: caso.visitas,
      ultimaVisita: caso.ultima,
      nVisitaSig: caso.nVisitaSig,
      reiterado: caso.reiterado || '',
      sinRadicado: !!caso.sinRadicado,
    });
    setPaso('resultado');
  }

  function volverABuscar() {
    setPaso('inicio'); setResultado(null); setCasos([]);
  }

  // Iniciar visita con datos precargados de una fila existente
  function iniciarConDatos(fila, nVisita) {
    onResult({
      tipo: 'pqr',
      datosIniciales: fila,
      fila: fila._idx,
      nVisita: nVisita || parseInt(fila['N° VISITA'] || fila['N VISITA'] || 1),
      esNueva: false,
    });
  }

  // Crear nueva visita para el mismo radicado (incrementa N° visita).
  // La limpieza de campos vive en clonarParaSeguimiento (utils.js): la
  // comparte con el botón "+ Nueva visita" de la cabecera de grupo en Buscar.
  function crearNuevaVisitaRadicado(filaBase) {
    const n = resultado?.nVisitaSig || 2;
    onResult({
      tipo: 'pqr',
      datosIniciales: clonarParaSeguimiento(filaBase, n),
      fila: null, // nueva fila
      nVisita: n,
      esNueva: true,
    });
  }

  // Radicado no encontrado — formulario manual
  function iniciarSinDatos() {
    onResult({
      tipo: 'pqr_manual',
      radicado: texto.replace(/\s+/g, '').toUpperCase(),
    });
  }

  // Visita de oficio
  function iniciarOficio() {
    onResult({ tipo: 'oficio' });
  }

  const estiloModal = {
    minHeight: '60vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '40px 20px',
  };
  // Sistema visual: panel radio 12 sin borde; opciones en neutro, sin borde.
  const estiloCard = {
    background: 'var(--superficie)', borderRadius: 'var(--r-panel)',
    boxShadow: 'var(--sombra-md)',
    padding: 28, maxWidth: 440, width: '100%',
  };
  // Íconos de la app (icons.jsx, trazo fino) en un cuadro de color, no emojis.
  const cajaIcono = (tono) => ({
    flex: '0 0 auto', width: 40, height: 40, borderRadius: 'var(--r-md)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: tono === 'brand' ? 'var(--brand-bg)' : 'var(--superficie)',
    color: tono === 'brand' ? 'var(--brand-ink)' : 'var(--texto)',
  });
  const estiloOpcion = {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 64,
    padding: '14px 16px', border: 0,
    borderRadius: 'var(--r-card)', background: 'var(--surface-2)',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
    color: 'var(--texto)', textAlign: 'left',
  };
  const textoAyuda = { fontSize: 13, fontWeight: 400, color: 'var(--texto-suave)', marginTop: 2, lineHeight: 1.35 };
  const QUE_SE_BUSCO = { orden: 'esa orden de policía', oficio: 'ese radicado de oficio', direccion: 'esa dirección' };

  const botonOficioNuevo = (
    <button type="button" style={estiloOpcion} onClick={iniciarOficio}>
      <span style={cajaIcono('gris')}><Icon.Plus size={20} /></span>
      <div>
        <div>Abrir caso de oficio nuevo</div>
        <div style={textoAyuda}>
          Solo la <strong>primera</strong> visita, sin radicado. El caso toma el número
          de la orden de policía.
        </div>
      </div>
    </button>
  );

  return (
    <div className="pantalla activa" style={estiloModal}>
      <div style={estiloCard}>
        {/* PASO 1: buscar un caso existente o abrir uno de oficio */}
        {paso === 'inicio' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, textAlign: 'center' }}>
              Nueva visita
            </div>
            <label htmlFor="nv-buscar-caso" style={{ display: 'block', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              Buscar un caso existente
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="nv-buscar-caso"
                type="text"
                className="input-campo"
                placeholder="Radicado, orden o dirección"
                value={texto}
                onChange={e => setTexto(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarCaso()}
                autoFocus
                autoComplete="off"
                style={{ flex: 1, minWidth: 0, fontSize: 17, padding: 12 }}
              />
              <button type="button" onClick={() => buscarCaso()} disabled={buscando || !texto.trim()}
                className="btn-principal" aria-label="Buscar"
                style={{ margin: 0, flex: '0 0 auto', width: 'auto', minWidth: 52, minHeight: 48, padding: '0 14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {buscando ? '…' : <Icon.Search size={20} />}
              </button>
            </div>
            <div style={{ ...textoAyuda, marginTop: 8 }}>
              Una PQR, o la 2ª visita en adelante de un caso de oficio
              (ej. <span className="mono">20251143210</span>, <span className="mono">2026-09-239</span> o <span className="mono">CL 50 # 32-10</span>).
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0', color: 'var(--texto-suave)', fontSize: 13 }}>
              <span style={{ flex: 1, height: 1, background: 'var(--borde)' }} />o
              <span style={{ flex: 1, height: 1, background: 'var(--borde)' }} />
            </div>

            {botonOficioNuevo}

            <button type="button" onClick={onCancelar} className="btn-texto"
              style={{ marginTop: 16, width: '100%' }}>← Volver al inicio</button>
          </>
        )}

        {/* Varios casos coinciden (orden sin año, dirección): elegir */}
        {paso === 'lista' && (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
              {casos.length} casos coinciden
            </div>
            <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginBottom: 14 }}>
              Con «{texto.trim()}». Elige el de esta visita.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
              {casos.slice(0, 20).map(c => {
                const u = c.ultima;
                const est = normalizarEstado(u['ESTADO VISITA']);
                const dir = u['DIRECCION INFRACCION'] || u['DIRECCION'] || '';
                const orden = ordenPoliciaDe(u);
                return (
                  <button key={c.clave || c.radicado} type="button" style={{ ...estiloOpcion, minHeight: 56, padding: '10px 14px' }}
                    onClick={() => abrirCaso(c)}>
                    <span style={cajaIcono(/^OFICIO-/.test(c.radicado) ? 'gris' : 'brand')}>
                      {/^OFICIO-/.test(c.radicado) ? <Icon.Flag size={18} /> : <Icon.File size={18} />}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="mono" style={{ fontSize: 15 }}>{c.radicado}</div>
                      <div style={textoAyuda}>
                        Visita N°{u['N° VISITA'] || u['N VISITA'] || 1} · {est || '—'}
                        {dir ? ' · ' + dir : ''}{orden ? ' · Orden ' + orden : ''}
                        {c.reiterado ? ' · reitera ' + c.reiterado : ''}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {casos.length > 20 && (
              <div style={{ ...textoAyuda, marginTop: 8 }}>Se muestran 20 de {casos.length}: escribe algo más preciso.</div>
            )}
            <button type="button" onClick={volverABuscar} className="btn-neutro" style={{ width: '100%', marginTop: 14 }}>Buscar de nuevo</button>
          </>
        )}

        {/* Ningún caso: un radicado PQR se puede cargar a mano; una orden o
            dirección sin caso es, casi siempre, un oficio nuevo. */}
        {paso === 'vacio' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: 'var(--texto-suave)' }}><Icon.Search size={36} /></div>
            {tipoBusq === 'radicado' ? (
              <>
                <div style={{ fontSize: 17, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
                  Radicado no encontrado
                </div>
                <div style={{ fontSize: 13, color: 'var(--texto-suave)', textAlign: 'center', marginBottom: 20 }}>
                  El radicado <strong className="mono">{texto.trim()}</strong> no está en la base de datos.
                  Los datos deberán ingresarse manualmente.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button type="button" onClick={iniciarSinDatos}
                    className="btn-principal" style={{ margin: 0, fontSize: 15 }}>
                    Continuar sin datos precargados
                  </button>
                  <button type="button" onClick={volverABuscar} className="btn-neutro" style={{ width: '100%' }}>Buscar otro</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 17, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>
                  No hay casos con {QUE_SE_BUSCO[tipoBusq] || 'ese dato'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--texto-suave)', textAlign: 'center', marginBottom: 20 }}>
                  «<strong>{texto.trim()}</strong>» no aparece en la base de datos.
                  Si es la primera visita de un caso de oficio, ábrelo aquí.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {botonOficioNuevo}
                  <button type="button" onClick={volverABuscar} className="btn-neutro" style={{ width: '100%' }}>Buscar otro</button>
                </div>
              </>
            )}
          </>
        )}

        {/* PASO 3: el caso encontrado */}
        {paso === 'resultado' && resultado && (
          <>

            {/* Radicado encontrado */}
            {resultado.encontrado && (() => {
              const u = resultado.ultimaVisita;
              const est = normalizarEstado(u['ESTADO VISITA']);
              const nVis = parseInt(u['N° VISITA'] || u['N VISITA'] || 1);
              const fecha = u['FECHA DE VISITA'] || u['FECHA RADICADO'] || '';
              const dir = u['DIRECCION INFRACCION'] || u['DIRECCION'] || '';
              const esCompletada = est === 'COMPLETADO' || est === 'COMPLETADA';
              const esIniciada = est === 'INICIADO';

              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                    {esCompletada ? <Icon.Check size={36} /> : esIniciada ? <Icon.Refresh size={36} /> : <Icon.File size={36} />}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>
                    Radicado <span className="mono">{resultado.radicado}</span>
                  </div>
                  {resultado.reiterado && (
                    <div style={{ fontSize: 13, color: 'var(--texto-suave)', textAlign: 'center', marginBottom: 10 }}>
                      <span className="mono">{resultado.reiterado}</span> es un radicado reiterado de este caso.
                    </div>
                  )}
                  {/* Resumen de la visita existente */}
                  <div style={{
                    background: 'var(--gris-bg)', borderRadius: 'var(--r-md)',
                    padding: 14, marginBottom: 16, fontSize: 13,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Visita N°{nVis}</span>
                      {/* Mismo código de estado que la Semana y la ficha (ocre / azul / verde). */}
                      <span className={'al-estado' + ((_ESTADO_PANEL_MV[est] || {}).cls || '')}>
                        {(_ESTADO_PANEL_MV[est] || {}).label || est}
                      </span>
                    </div>
                    {dir && <div style={{ color: 'var(--texto-suave)' }} title={dir}>{direccionVisible(dir)}</div>}
                    {fecha && <div style={{ color: 'var(--texto-suave)', marginTop: 2 }}>Fecha: {fecha}</div>}
                  </div>

                  {/* Acciones según estado */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Fila de V2 sin número de radicado («OPERATIVO», «QUEJA
                        VERBAL»…): ese texto lo comparten casos distintos, así
                        que no hay caso que seguir. Una visita nueva va como
                        caso nuevo (mismo criterio que Buscar). */}
                    {esCompletada && resultado.sinRadicado && (
                      <div style={{ fontSize: 13, color: 'var(--texto-suave)', textAlign: 'center', marginBottom: 4 }}>
                        La visita N°{nVis} ya fue completada. Es una fila migrada de V2 sin
                        número de radicado: una visita nueva en este predio se abre como caso nuevo.
                      </div>
                    )}
                    {esCompletada && !resultado.sinRadicado && (
                      <>
                        <div style={{ fontSize: 13, color: 'var(--texto-suave)', textAlign: 'center', marginBottom: 4 }}>
                          La visita N°{nVis} ya fue completada. Puede abrir una visita de
                          seguimiento y asignarla a un inspector.
                        </div>
                        <button type="button" onClick={() => crearNuevaVisitaRadicado(u)}
                          className="btn-principal" style={{ margin: 0, fontSize: 15 }}>
                          Iniciar visita N°{resultado.nVisitaSig} (seguimiento)
                        </button>
                      </>
                    )}
                    {/* Regla del diligenciador: sin ella, buscar el radicado por el FAB
                        dejaba iniciar y guardar sobre la fila de otro inspector. Crear una
                        visita NUEVA del mismo radicado sí es legítimo (visita de seguimiento),
                        y nace a nombre de quien la crea. */}
                    {!puedeDiligenciar(u) ? (
                      <>
                        <div style={{ fontSize: 13, color: 'var(--texto-suave)' }}>
                          La diligencia {primerVisitador(visitadoresBD(u))}. No puedes continuar
                          una visita de otro inspector.
                          {!esCompletada && ' Para hacer una visita de seguimiento, esa debe completarse primero.'}
                        </div>
                      </>
                    ) : (
                      <>
                        {esIniciada && (
                          <>
                            {/* Ya no se ofrece crear el seguimiento aquí: una
                                visita de seguimiento solo tiene sentido con la
                                anterior COMPLETADA (regla del usuario). Antes
                                se podía abrir una N°2 con la N°1 a medias y
                                quedaban dos filas abiertas del mismo radicado. */}
                            <button type="button" onClick={() => iniciarConDatos(u, nVis)}
                              className="btn-principal" style={{ margin: 0, fontSize: 15 }}>
                              Continuar visita N°{nVis}
                            </button>
                          </>
                        )}
                        {!esCompletada && !esIniciada && (
                          <button type="button" onClick={() => iniciarConDatos(u, nVis)}
                            className="btn-principal" style={{ margin: 0, fontSize: 15 }}>
                            Iniciar visita
                          </button>
                        )}
                      </>
                    )}
                    <button type="button" onClick={volverABuscar} className="btn-neutro" style={{ width: '100%' }}>Buscar otro caso</button>
                  </div>
                </>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

// Aviso de casos relacionados (misma dirección u orden de otro radicado).
// Solo avisa (decisión del usuario 2026-09-30). En un oficio nuevo sin
// guardar ofrece «Es un seguimiento», que abre ese caso y registra la visita
// como la siguiente de él; «Es otro caso» oculta el aviso y el guardado crea
// un caso aparte. En una PQR, o con la visita ya guardada, solo informa.
function _AvisoCasosRelacionados({ casos, motivo, ofrecerSeguimiento, onAbrir, onOcultar }) {
  if (!casos || !casos.length) return null;
  const donde = motivo === 'orden' ? 'con esta orden de policía' : 'en esta dirección';
  return (
    <div className="full-width" role="status" style={{
      border: '1px solid var(--amarillo)', background: 'var(--amarillo-bg)',
      borderRadius: 'var(--r-md)', padding: '12px 14px', fontSize: 13, color: 'var(--texto)',
      display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--cafe)' }}>
        <Icon.Alert size={18} />
        {ofrecerSeguimiento ? '¿Es un seguimiento?' : (casos.length === 1 ? 'Hay otro caso ' + donde : 'Hay ' + casos.length + ' casos ' + donde)}
      </div>
      {ofrecerSeguimiento && (
        <div>
          Ya {casos.length === 1 ? 'existe un caso' : 'existen casos'} {donde}. Si esta visita es la
          continuación, ábrela desde ese caso para que quede como su visita siguiente.
        </div>
      )}
      {casos.slice(0, 3).map(c => {
        const u = c.ultima;
        return (
          <div key={c.clave || c.radicado} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <span className="mono" style={{ fontWeight: 600 }}>{c.radicado}</span>
              <span style={{ color: 'var(--texto-suave)' }}>
                {' · Visita N°' + (u['N° VISITA'] || u['N VISITA'] || 1) + ' · ' + (normalizarEstado(u['ESTADO VISITA']) || '—')}
              </span>
            </div>
            {/* Sin radicado real no hay caso que abrir: buscar «OPERATIVO»
                traería todas las filas que comparten ese texto. */}
            {ofrecerSeguimiento && !c.sinRadicado && (
              <button type="button" className="btn-neutro" style={{ minHeight: 44 }}
                onClick={() => onAbrir(c.radicado)}>Abrir ese caso</button>
            )}
          </div>
        );
      })}
      {!ofrecerSeguimiento && (
        <div style={{ color: 'var(--texto-suave)' }}>Esta visita queda como un caso aparte.</div>
      )}
      <div>
        <button type="button" className="btn-texto" style={{ minHeight: 44, padding: '0 4px' }} onClick={onOcultar}>
          {ofrecerSeguimiento ? 'Es otro caso, seguir aquí' : 'Entendido'}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//   CENTRO DE CONTROL DE LA VISITA
//   Panel de estado (arriba) + renglones de entregables (abajo):
//   el inspector lee el estado completo en <5 s sin recorrer el form.
//   Componentes puramente presentacionales — sin hooks ni estado propio.
// ══════════════════════════════════════════════════════════════

// Tono del badge según el punto del ciclo de vida: el mismo código de la
// Semana, Alertas y Mis visitas (ocre asignada, azul iniciada, verde
// completada). Hasta 2026-10-13 aquí iniciada era café y asignada azul, así
// que el inspector veía dos colores para el mismo estado.
function _tonoEstadoVisita(estado) {
  switch (String(estado || '').toUpperCase()) {
    case 'COMPLETADO': return 'verde';
    case 'INICIADO':   return 'azul';
    case 'ASIGNADO':   return 'amarillo';
    default:           return 'gris'; // PENDIENTE o desconocido
  }
}

// Faltantes del panel superior (decisión del usuario 2026-09-30): solo acta,
// orden escaneada y registro fotográfico, y solo con la visita INICIADA —
// en una asignada «falta el acta» es obvio y era ruido. El informe no se
// lista (vive en su renglón de entregables) y la ubicación sin confirmar
// tampoco (la avisa el bloqueo al generar). La orden cuenta solo si la
// visita tiene N° real; el registro, solo si ya hay fotos que lo alimenten.
// Visita que se documenta con informe técnico (2026-10-15): falta el informe,
// no el acta ni su registro fotográfico (mismo criterio que
// entregablesFaltantes, utils.js).
function _pendientesPanel(p) {
  const pendientes = [];
  if (p.documento === 'INFORME') {
    if (!p.tieneInforme) pendientes.push('Informe');
    if (p.ordenRelevante && !p.ordenEscaneada) pendientes.push('Orden escaneada');
    return pendientes;
  }
  if (!p.tieneActa) pendientes.push('Acta');
  if (p.ordenRelevante && !p.ordenEscaneada) pendientes.push('Orden escaneada');
  if (p.fotos && p.fotos.subidas > 0 && !p.tieneRF) pendientes.push('Registro fotográfico');
  return pendientes;
}

// Panel superior, dos renglones como máximo: (1) estado + identidad + lugar,
// (2) qué falta, solo con la visita INICIADA (o el aviso de visita sin
// guardar o sin iniciar). Antes el radicado iba a 12 px gris —lo menos
// legible de la cabecera siendo lo más importante— y la fecha colgaba de la
// dirección sin decir de qué era.
function PanelEstadoVisita(p) {
  const iniciada = String(p.estadoVisita || '').toUpperCase() === 'INICIADO';
  const pendientes = _pendientesPanel(p);
  const lugar = [
    p.direccion,
    p.barrio && p.barrio !== '__otro__' ? p.barrio : '',
    p.comuna ? 'Comuna ' + p.comuna : '',
  ].filter(Boolean).join(' · ');
  return (
    <div className="estado-panel" role="status" aria-label="Estado de la visita">
      <div className="estado-panel-top">
        <span className={'estado-badge ep-' + _tonoEstadoVisita(p.estadoVisita)}>
          {String(p.estadoVisita || '—').toUpperCase()}
        </span>
        {/* El prefijo «RAD» se separa para poder ocultarlo en móvil: ahí
            chip + prefijo + 11 dígitos no caben en un renglón. */}
        <span className="estado-id">
          {/^RAD /.test(p.identificador || '')
            ? <><span className="estado-id-pref">RAD </span>{p.identificador.slice(4)}</>
            : p.identificador}
        </span>
        {p.nVisita > 1 && <span className="estado-visita-n">Visita N°{p.nVisita}</span>}
        {/* Último hijo: ocupa el sobrante del renglón y se corta con «…». */}
        {(lugar || p.fechaVisita) && (
          <div className="estado-dir">
            {lugar}
            {p.fechaVisita && (
              <span className="estado-fecha">{(lugar ? ' · ' : '') + 'Visita ' + p.fechaVisita}</span>
            )}
          </div>
        )}
      </div>
      {!p.filaEditando && (
        <div className="estado-aviso">
          Sin guardar: al guardar se crea la carpeta en Drive y se habilitan los entregables.
        </div>
      )}
      {p.filaEditando && visitaSinIniciar(p.estadoVisita) && (
        <div className="estado-aviso">
          Sin iniciar: al guardar pasa a INICIADO y se habilitan los entregables.
        </div>
      )}
      {p.filaEditando && iniciada && (
        <div className="estado-resumen" aria-label="Entregables pendientes">
          {pendientes.length === 0
            ? <span className="resumen-chip rc-ok">
                <span className="rc-dot" aria-hidden="true" />Entregables completos
              </span>
            : <>
                {/* «Por generar», no «Falta»: debajo va «Campos por llenar»
                    y dos «Falta» apilados no decían cuál era cuál. */}
                <span className="resumen-titulo">Por generar:</span>
                {pendientes.map(function (t) {
                  return (
                    <span key={t} className="resumen-chip rc-pend">
                      <span className="rc-dot" aria-hidden="true" />{t}
                    </span>
                  );
                })}
              </>}
        </div>
      )}
    </div>
  );
}

// Renglón de entregable: nombre+meta a la izquierda, punto de estado y
// acciones a la derecha. Un renglón por pieza en vez de un botón a ancho
// completo por pieza — la pila anterior obligaba a escanear ~4 bloques
// iguales. El estado se lee por color (verde=listo, ámbar=pendiente o en
// cola, gris=todavía no aplica), nunca por texto: el color viaja con
// `title` + sr-only para lector de pantalla. `nota` es el único texto de
// estado visible permitido (el conteo de fotos, solo cuando hay).
// `slot` (opcional) renderiza un widget debajo del renglón (subida de
// fotos, escáner de orden), pegado a la pieza que le da sentido.
function FilaEntregable({ icono, nombre, meta, estadoTono, estadoTexto, nota, procesando, children, slot }) {
  return (
    <div className="ent-fila-wrap">
      <div className="ent-fila">
        <span className="ent-icono" aria-hidden="true">{icono}</span>
        <div className="ent-cuerpo">
          <span className="ent-nombre">{nombre}</span>
          {meta && <span className="ent-meta">{meta}</span>}
        </div>
        {(estadoTexto || nota) && (
          <span className="ent-estado-wrap" title={estadoTexto || undefined} aria-busy={procesando || undefined}>
            {procesando
              ? <span className="spinner-btn" aria-hidden="true" />
              : <span className={'ent-dot ed-' + (estadoTono || 'apagado')} aria-hidden="true" />}
            {nota && <span className="ent-nota">{nota}</span>}
            {estadoTexto && <span className="sr-only"> — {estadoTexto}</span>}
          </span>
        )}
        {children && <div className="ent-acciones">{children}</div>}
      </div>
      {slot && <div className="ent-slot">{slot}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//   PANTALLA
// ══════════════════════════════════════════════════════════════
function NuevaVisitaScreen({ usuario, filaInicial, datosIniciales, onSalir, busquedaInicial, onReabrirConBusqueda }) {
  // ── Fase: 'modal' muestra el selector de tipo, 'formulario' muestra el form ──
  const tieneDatos = filaInicial != null || datosIniciales != null;
  const [fase, setFase] = React.useState(tieneDatos ? 'formulario' : 'modal');

  const [d, setD]               = React.useState(() => _estadoInicial(datosIniciales));
  // Estado inicial real desde BD para no promover PENDIENTE→INICIADO solo por
  // abrir el formulario (la promoción ocurre únicamente al pulsar Guardar).
  const [estadoVisita, setEstV] = React.useState(() => {
    const raw = (datosIniciales || {})['ESTADO VISITA'];
    const norm = (typeof normalizarEstado === 'function' ? normalizarEstado(raw) : (raw || '').toString().toUpperCase().trim());
    return norm || (filaInicial ? 'INICIADO' : 'PENDIENTE');
  });
  const [filaEditando, setFE]   = React.useState(filaInicial || null);
  const [guardando, setGuard]   = React.useState(false);
  const [generandoActa, setGA]  = React.useState(false);
  const [generandoRF,  setGRF]  = React.useState(false);
  // Informe F-GGO-43: la "generación" es abrir informe/index.html (pestaña o
  // iframe); este flag solo marca el tramo validación→apertura.
  const [abriendoInforme, setAI] = React.useState(false);
  // Informe hecho por fuera de la app (Word) que el inspector sube tal cual.
  const [subiendoInforme, setSI] = React.useState(false);
  const inputInformeRef = React.useRef(null);
  const [modalFotos,  setModalFotos] = React.useState(null); // null o [{id, nombre, link, descripcion, mimeType}]
  // Total de fotos que trajo listarFotosActa al abrir el modal. Se fija una sola
  // vez y no se recalcula: la lista se va modificando al quitar fotos y el botón
  // de confirmar necesita el total original para avisar cuántas se excluyeron.
  const [modalFotosTotal, setModalFotosTotal] = React.useState(0);
  const [cargandoFotos, setCargandoFotos] = React.useState(false);
  const [busyGeo, setBusyGeo]   = React.useState(false);
  const [gpsAccuracy, setGpsAccuracy] = React.useState(null); // precisión en metros
  const geoWatchRef = React.useRef(null); // id del watchPosition activo
  // id del setTimeout de 30s que corta el watch. En ref y no en variable local:
  // "Cancelar", el aceptar manual y el desmontaje pasan por _detenerGeoWatch()
  // y deben poder matarlo. Antes solo se limpiaba en el auto-aceptar (≤8m) y en
  // el callback de error, así que cancelar NO cancelaba (30s después el timeout
  // aceptaba igual y disparaba POT+catastro) y el aceptar manual dejaba una
  // segunda aceptación viva capaz de pisar una corrección del pin.
  const geoTimeoutRef = React.useRef(null);
  const mejorPosGeoRef = React.useRef(null); // {lat, lon, acc} de la última lectura del watch activo
  const [busyMejora, setBusyMe] = React.useState(false);
  // Panel de «Revisar» abierto: { ia, origDesc, origConc, desc, conc, justif }
  // o null. `ia` = la IA respondió (si no, la revisión se cierra en modo LOCAL).
  const [revisionPanel, setRevisionPanel] = React.useState(null);
  const [dictando, setDictando] = React.useState(false);    // grabación por voz activa
  const [busyPOT, setBusyPOT]   = React.useState(false);
  const [busyCat, setBusyCat]   = React.useState(false);
  const [catResultados, setCatRes] = React.useState(null);
  // Tecleando código/ficha a mano: las casillas no se esconden a media
  // escritura cuando los dos campos dejan de estar vacíos.
  const [catEditando, setCatEditando] = React.useState(false);
  // La última consulta de catastro o POT falló: el panel «Predio» ofrece
  // «Reintentar» (ya no hay botón «Consultar»: todo lo dispara el pin).
  const [consultaFallida, setConsultaFallida] = React.useState(false);
  // Flag independiente: ¿es predio del Municipio de Bello?
  // catResultados solo se setea cuando hay >1 ficha (propiedad horizontal);
  // este flag se setea SIEMPRE que la búsqueda catastral encuentre fichas
  // municipales, sin importar si es 1 ficha o muchas. Crítico para que la
  // advertencia de tipificación A3 no se "pierda" en predios de 1 sola ficha.
  const [predioMunicipal, setPredioMunicipal] = React.useState(false);
  // Estado para la advertencia de tipificación (predio público / suelo protección).
  // Cuando el inspector toca "Ignorar" no volvemos a mostrarla hasta que cambien
  // las señales (nuevo punto GPS, nueva consulta catastral, etc.).
  const [advertTipifIgnorada, setAdvertTipifIgnorada] = React.useState(false);
  // Estado auxiliar para barrio "Otro" (texto libre)
  const [barrioOtro, setBarrioOtro] = React.useState('');
  // Barrio que puso el POT con el punto (arquitectura 2026-10-27, decisión 5):
  // mientras siga siendo ese, se muestra como texto con «Cambiar» en vez del
  // desplegable de ~120 barrios. Es estado de pantalla: al reabrir la visita
  // vuelve el desplegable hasta que el pin consulte el POT otra vez.
  const [barrioDelPot, setBarrioDelPot] = React.useState('');
  const [editandoBarrio, setEditandoBarrio] = React.useState(false);
  // Confirmación de dirección en línea: la dirección bautiza la carpeta de
  // Drive en el PRIMER guardado, así que el inspector la confirma («Confirmar
  // dirección») antes de que exista la carpeta. dirEnfoque esconde la fila
  // mientras el inspector edita el campo. Los refs apuntan a la fila y al
  // botón «Confirmar dirección» para el bloqueo de guardar() (scroll + foco + parpadeo).
  const [dirConfirmada, setDirConfirmada] = React.useState(false);
  const [dirEnfoque, setDirEnfoque] = React.useState(false);
  const dirFilaRef = React.useRef(null);
  const dirBotonRef = React.useRef(null);
  // ¿Corresponde pedir la confirmación? Solo mientras la carpeta de Drive no
  // exista (primer guardado): reabrir una visita guardada ya no pregunta.
  const requiereDir = !d.linkDrive && direccionRequiereConfirmar(d.direccion, d.comuna, d.barrio);

  // ── Ubicación del predio: dirección ↔ catastro ↔ pin ──────────────
  // docs/PLAN_2026-09-29_ubicacion-predio.md. La lógica que decide vive en
  // utils.js (compararUbicacion, tests); aquí solo se conecta al formulario.
  //   predioDir: lo que catastro tiene para la dirección escrita.
  //   terrenoDirElegido: el inspector eligió entre candidatos (placas
  //     cercanas, o varios terrenos con la misma dirección y sin pin).
  const [predioDir, setPredioDir] = React.useState(null);
  const [predioDirEstado, setPredioDirEstado] = React.useState('idle');
  const [terrenoDirElegido, setTerrenoDirElegido] = React.useState(null);
  const _esRuralUbic = (function () {
    const c = String(d.comuna || '').trim().toUpperCase();
    return c === 'VEREDA' || c === 'RURAL' || /^VDA\./i.test(String(d.barrio || '').trim());
  })();
  // La dirección se escribe tecla a tecla: esperar a que pare. El primer uso
  // baja catastro.json (precargado casi siempre) y arma el índice por tramos.
  useEffectNV(() => {
    if (fase !== 'formulario') return;
    setTerrenoDirElegido(null);
    if (_esRuralUbic || !d.direccion || typeof buscarCatastroPorDireccion !== 'function') {
      setPredioDir(null); setPredioDirEstado('idle');
      return;
    }
    let vigente = true;
    const t = setTimeout(async function () {
      setPredioDirEstado('buscando');
      try {
        const r = await buscarCatastroPorDireccion(d.direccion);
        if (!vigente) return;
        setPredioDir(r);
        setPredioDirEstado(r ? 'ok' : 'no-reconocible');
      } catch (e) {
        if (!vigente) return;
        console.warn('[Predio] catastro por dirección:', e.message);
        setPredioDir(null);
        setPredioDirEstado('sin-catastro');
      }
    }, 700);
    return function () { vigente = false; clearTimeout(t); };
  }, [d.direccion, _esRuralUbic, fase]);

  // Visita guardada con coordenadas: al abrirla nada movía el pin, así que la
  // ficha no aparecía hasta tocar «Consultar». Se consulta catastro una vez,
  // después de la búsqueda por dirección (decide qué predio vale si el pin
  // cae en la calle). El POT no se repite: pisaría lo corregido a mano.
  const consultaAlAbrirRef = React.useRef(false);
  React.useEffect(() => {
    if (consultaAlAbrirRef.current || fase !== 'formulario' || filaInicial == null) return;
    if (d.lat == null || d.lat === '' || d.lon == null || d.lon === '') return;
    if (predioDirEstado === 'buscando') return;
    if (predioDirEstado === 'idle' && d.direccion && !_esRuralUbic) return;
    consultaAlAbrirRef.current = true;
    ejecutarBusquedaCatastral(null, null, false, { alAbrir: true });
    // R11 (regla fundamental, sin justificación): suelo de protección y
    // retiro de quebrada salen del POT en el punto, no de la mano. Del POT
    // solo se toman esas dos casillas (el resto no se repite, como arriba).
    const latA = d.lat, lonA = d.lon;
    consultarPOT(latA, lonA).then(r => _aplicarRefPOT(latA, lonA, r))
      .catch(e => console.warn('[R11] POT al abrir:', e.message));
  }, [fase, predioDirEstado]);

  // Referencia del POT para «¿Suelo de protección?» y «¿Dentro de retiro de
  // quebrada?» en el punto actual: con ella las dos casillas quedan sin
  // edición (para cambiarlas se mueve el pin) y valen lo que dice el POT.
  // Solo se aplica si el punto no se movió mientras se consultaba.
  function _aplicarRefPOT(lat, lon, r) {
    if (!r) return;
    setD(prev => {
      if (String(prev.lat) !== String(lat) || String(prev.lon) !== String(lon)) return prev;
      const ref = { lat: lat, lon: lon, sueloProt: r.sueloProt || '', quebrada: r.enRetiro || '' };
      const next = Object.assign({}, prev, { potProtQueb: ref });
      if (ref.sueloProt && prev.sueloProt !== ref.sueloProt) next.sueloProt = ref.sueloProt;
      if (ref.quebrada && prev.quebrada !== ref.quebrada) next.quebrada = ref.quebrada;
      return next;
    });
  }

  // Terrenos de la dirección que cuentan para comparar con el pin: con
  // coincidencia exacta, todos (el pin desempata) o el elegido; con placas
  // cercanas, solo el que el inspector eligió (nunca se preseleccionan).
  const terrenosDir = !predioDir ? [] :
    terrenoDirElegido ? predioDir.terrenos.filter(function (t) { return t.tcod === terrenoDirElegido; }) :
    predioDir.exacta ? predioDir.terrenos : [];
  const _mismoPuntoYDir = function (x) {
    return !!x && x.lat !== '' && x.lat != null &&
      Number(x.lat) === Number(d.lat) && Number(x.lon) === Number(d.lon) &&
      String(x.direccion || '') === String(d.direccion || '');
  };
  const ubicVigente = ubicacionConfirmadaVigente(d.ubicConf, d);
  // Ficha que describe el código del campo: reescrito a mano, la tarjeta
  // dejaría de ser la de este predio.
  const fichaAplicada = catResultados && catResultados.length === 1 &&
    catResultados[0].catastral === d.catastral ? catResultados[0] : null;
  // Código y ficha se escriben a mano solo si faltan: el panel «Predio» ya
  // los muestra (con tarjeta si catastro los dio en esta sesión, en una línea
  // si vienen de la BD), y con varias unidades (PH) se eligen ahí.
  // Corregirlos = mover el pin o elegir otra ficha.
  const catastralManual = !fichaAplicada && !(catResultados && catResultados.length > 1) &&
    (catEditando || !d.catastral || !d.ficha);
  const _cmpBruto = compararUbicacion(terrenosDir, d.lat, d.lon);
  // Una confirmación vigente con dirección y punto en predios distintos es un
  // «usar el del punto» ya decidido: ubicPreferirPunto no se guarda en BD, así
  // que al reabrir la visita el conflicto volvería a aparecer junto al ✓.
  const preferirPunto = _mismoPuntoYDir(d.ubicPreferirPunto) ||
    (ubicVigente && _cmpBruto.estado === 'distinto');
  const cmpUbic = preferirPunto
    ? { estado: 'punto-elegido', tcod: null, distM: null }
    : _cmpBruto;
  // Terreno del que debe salir la ficha: el de la dirección cuando coincide
  // con el pin (aunque el pin caiga en la calle o en el vecino — Fase 0), o
  // cuando todavía no hay pin. En conflicto o con «usar el del punto», la
  // ficha sale del pin como siempre (ejecutarBusquedaCatastral).
  const tcodFichaObjetivo = (cmpUbic.estado === 'coincide' || cmpUbic.estado === 'sin-pin') ? cmpUbic.tcod : null;
  // ejecutarBusquedaCatastral corre con el punto NUEVO antes del re-render:
  // necesita los terrenos de la dirección vigentes, no los de su closure.
  const terrenosDirRef = React.useRef(terrenosDir);
  terrenosDirRef.current = terrenosDir;
  const fichaAplicadaRef = React.useRef(null);
  useEffectNV(() => {
    if (fase !== 'formulario') return;
    const objetivo = tcodFichaObjetivo;
    if (!objetivo) { fichaAplicadaRef.current = null; return; }
    const actual = String(d.catastral || '').replace(/\D/g, '').slice(0, 21);
    if (actual === objetivo) { fichaAplicadaRef.current = objetivo; return; }
    // Vacía y ya aplicada: se espera a que el inspector elija la unidad (PH).
    if (!actual && fichaAplicadaRef.current === objetivo) return;
    fichaAplicadaRef.current = objetivo;
    _aplicarFichasTerreno(objetivo);
  }, [tcodFichaObjetivo, d.catastral, fase]);
  // Estado auxiliar para consecutivo de orden de policía (solo el número)
  const [ordenConsecutivo, setOrdenConsecutivo] = React.useState(() =>
    _extraerConsecutivoOrden((datosIniciales || {})['N° ORDEN DE POLICIA'] || (datosIniciales || {})['N ORDEN DE POLICIA'] || '')
  );
  // Año de la orden — se extrae al cargar y queda bloqueado para órdenes
  // existentes. Para órdenes nuevas (string vacío) el prefijo cae al año
  // actual del calendario, capturándose efectivamente al guardar.
  const [ordenAnio, setOrdenAnio] = React.useState(() =>
    _extraerAnioOrden((datosIniciales || {})['N° ORDEN DE POLICIA'] || (datosIniciales || {})['N ORDEN DE POLICIA'] || '')
  );
  // Referencia estable al recognition de voz (debe estar ANTES del early return de fase=modal,
  // de lo contrario React lanza error #310 al cambiar de modal a formulario).
  const recognitionRef = React.useRef(null);
  // Sesión del modal de fotos — descarta callbacks de aperturas anteriores
  // (ver abrirModalFotos). DEBE estar antes del early return de fase=modal:
  // tenerlo más abajo causaba React #310 al transicionar modal → formulario.
  const _modalFotosSesionRef = React.useRef(0);

  // Estado online/offline reactivo — el botón Guardar cambia su microcopy
  // cuando no hay red para comunicar que la visita se encolará y enviará
  // automáticamente al recuperar conexión. Refuerza la confianza del inspector
  // en campo (caso típico: zona rural sin señal).
  // DEBE estar ANTES del early return de fase=modal (React #310).
  const [enLinea, setEnLinea] = React.useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  React.useEffect(function() {
    function _on()  { setEnLinea(true); }
    function _off() { setEnLinea(false); }
    window.addEventListener('online',  _on);
    window.addEventListener('offline', _off);
    return function() {
      window.removeEventListener('online',  _on);
      window.removeEventListener('offline', _off);
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // AUTOGUARDADO — borrador local + remoto cada 60 s
  // ═══════════════════════════════════════════════════════════════
  // Antes no existía y los inspectores perdían trabajo al cerrar la
  // pestaña o cambiar de pantalla sin tocar "Guardar". Ahora:
  //   1) Cada cambio en d se persiste en localStorage con debounce 500ms
  //      (clave por identidad de visita: fila / radicado / orden / efímero).
  //      Para visitas en blanco se usa un id efímero único por formulario
  //      (NO la antigua clave compartida 'cu_draft_v1_nuevo') para evitar
  //      que datos de la persona que atiende se filtren entre visitas
  //      distintas al cargar este formulario en blanco.
  //   2) Al reabrir el formulario se restaura automáticamente el borrador
  //      (sin preguntar — decisión de producto).
  //   3) Si ya existe fila en BD Y la visita ya está iniciada (el primer
  //      «Guardar» es siempre manual), cada 60 s se hace un POST silencioso
  //      al webhook (offline cae en la cola IDB).
  //   4) beforeunload advierte al inspector si hay cambios sin guardar.
  //   5) Cuando la clave del borrador cambia (p.ej. al teclear radicado o
  //      al recibir fila tras el primer guardado), el borrador bajo la
  //      clave anterior se elimina para no dejar huérfanos.
  // DEBE estar antes del early return de fase=modal (React #310).
  const [draftEphemeralId, setDraftEphemeralId] = React.useState(_newEphemeralDraftId);

  // clientId: identificador único de esta sesión de formulario, usado solo
  // para 'agregar'. Si el envío falla y se encola varias veces (o se reintenta
  // tras una recarga que restaura el borrador), AS deduplica devolviendo
  // siempre la misma fila. Se persiste con el borrador para sobrevivir reloads.
  const [clientId, setClientId] = React.useState(_newEphemeralDraftId);

  const _draftKey = React.useMemo(function() {
    if (filaEditando) return 'cu_draft_v1_fila_' + filaEditando;
    if (d.radicado)   return 'cu_draft_v1_rad_'  + (d.radicado||'').replace(/[^a-zA-Z0-9_-]/g,'_');
    if (d.orden)      return 'cu_draft_v1_ord_'  + (d.orden||'').replace(/[^a-zA-Z0-9_-]/g,'_');
    return 'cu_draft_v1_' + draftEphemeralId;
  }, [filaEditando, d.radicado, d.orden, draftEphemeralId]);

  // Refs para que el setInterval lea siempre el state más reciente sin
  // tener que recrear el timer en cada keystroke.
  const _dRef          = React.useRef(d);
  const _bOtroRef      = React.useRef(barrioOtro);
  const _lastSavedRef  = React.useRef('');     // JSON del último estado persistido OK
  const _restauradoRef = React.useRef(false);
  const _prevDraftKeyRef = React.useRef(null); // clave bajo la que se hizo el último setItem
  // Radicado que tiene en BD la fila que edita este formulario (el que vino al
  // abrir, o el último que se guardó). Viaja en cada 'actualizar' como
  // `radicadoConocido`: el backend se niega a escribir si en esa fila ahora hay
  // otro radicado (una fila borrada en el Sheet corre todas las de abajo), y
  // también sirve para descartar un borrador local que no es de esta visita.
  const _radicadoFilaRef = React.useRef(String((datosIniciales || {})['RADICADO'] || ''));
  // ID_VISITA de la visita que edita este formulario (2026-10-14). Viaja junto
  // a radicadoConocido: con él el backend escribe en la fila real aunque se
  // haya corrido. Vacío en una visita nueva hasta que `agregar` lo devuelve.
  const _idVisitaRef = React.useRef(String((datosIniciales || {})['ID_VISITA'] || ''));
  // QW25: refs para que el useEffect del autoguardado remoto no dependa de
  // estos flags — cambian seguido (cada guardado manual/acta/RF) y antes
  // reiniciaban el setInterval de 60s en cada toggle.
  const _guardandoRef      = React.useRef(guardando);
  const _generandoActaRef  = React.useRef(generandoActa);
  const _generandoRFRef    = React.useRef(generandoRF);
  // Guarda compartida de documentos: bloquea el doble lanzamiento incluido
  // el doble clic rápido (los flags de estado solo cortan tras el re-render,
  // la ref corta en el mismo tick) y evita correr acta+informe/RF a la vez.
  const _docOcupadoRef     = React.useRef(false);
  React.useEffect(function() {
    _dRef.current     = d;
    _bOtroRef.current = barrioOtro;
    _guardandoRef.current     = guardando;
    _generandoActaRef.current = generandoActa;
    _generandoRFRef.current   = generandoRF;
  }, [d, barrioOtro, guardando, generandoActa, generandoRF]);

  // Compartido entre beforeunload y el botón "Volver" (QW3) — misma
  // definición de "sucio" en los dos sitios.
  // Los campos derivados del servidor (carpetas/links Drive, ultimaModConocida)
  // NO cuentan como cambios del usuario: los efectos de enriquecimiento al
  // reabrir (recuperar idCarpetaFotos, autocrear carpeta) los mutan después
  // del snapshot limpio, y antes eso disparaba el falso positivo
  // "hay cambios sin guardar" sobre un formulario recién abierto.
  function _snapshotLimpia(dObj) {
    const _servidor = ['linkDrive', 'idCarpetaVisita', 'idCarpetaFotos',
                       'linkXlsxActa', 'linkPdfActa', 'linkOrdenPolicia',
                       'linkPdfRadicado', 'linkDocxInforme', 'linkRegistroFotos',
                       'ultimaModConocida'];
    const out = {};
    Object.keys(dObj).forEach(function(k) {
      if (_servidor.indexOf(k) < 0) out[k] = dObj[k];
    });
    return out;
  }
  function _hayCambiosSinGuardar() {
    const snap = JSON.stringify({ d: _snapshotLimpia(_dRef.current), b: _bOtroRef.current });
    return snap !== _lastSavedRef.current;
  }

  const [ultimoGuardadoMs, setUltimoGuardadoMs] = React.useState(null);

  // ═══ Centro de control de la visita ═══
  // Estados que alimentan el panel superior y la barra fija inferior.
  // Todos DEBEN declararse antes del early return de fase=modal (React #310).
  // dirty: hay cambios sin guardar (comparación contra _lastSavedRef).
  // enColaGuardado: el guardado de ESTA visita está en la cola offline.
  // fotosInfo: resumen de evidencia fotográfica para el panel de estado.
  const [dirty, setDirty]               = React.useState(false);
  const [errorGuardar, setErrorGuardar] = React.useState('');
  const [enColaGuardado, setEnColaGuardado] = React.useState(false);
  const [fotosInfo, setFotosInfo]       = React.useState({ subidas: 0, enCola: 0 });
  // Puntos ámbar de sección: ocultos mientras se diligencia (si no, diez
  // secciones marcadas al abrir = decorado que se aprende a ignorar).
  // Se encienden con el primer intento de generar que encuentre faltantes.
  // Estado de sesión de pantalla: no se persiste en el borrador.
  const [mostrarPendientes, setMostrarPendientes] = React.useState(false);

  // (1) Restaurar borrador local en el primer render del formulario.
  React.useEffect(function() {
    if (fase !== 'formulario') return;
    if (_restauradoRef.current) return;
    _restauradoRef.current = true;
    try {
      const raw = localStorage.getItem(_draftKey);
      if (raw) {
        const obj = JSON.parse(raw);
        if (filaEditando && !borradorEsDeLaFila(obj, _radicadoFilaRef.current)) {
          // Borrador de OTRA visita que quedó bajo este número de fila. Nunca
          // restaurarlo: el guardado siguiente la escribiría encima de esta.
          localStorage.removeItem(_draftKey);
          console.warn('[autoguardado] borrador descartado: ' + _draftKey + ' es de otro radicado');
        } else if (obj && obj._d) {
          // Los borradores escritos antes del fix de `_dServidor` todavía
          // contienen `ultimaModConocida`; restaurarlo pisaría el timestamp
          // fresco de BD y provocaría un conflicto falso al guardar. Se
          // descarta aquí para que los borradores viejos no sigan fallando.
          const _dRestaurado = Object.assign({}, obj._d);
          delete _dRestaurado.ultimaModConocida;
          setD(function(prev) { return Object.assign({}, prev, _dRestaurado); });
          if (typeof obj._barrioOtro === 'string') setBarrioOtro(obj._barrioOtro);
          // Restaurar clientId para que un reload tras encolar offline siga
          // produciendo el mismo id y AS deduplique al reintentar.
          if (typeof obj._clientId === 'string' && obj._clientId) setClientId(obj._clientId);
          console.log('[autoguardado] borrador local restaurado: ' + _draftKey);
        }
      }
    } catch(e) { /* localStorage no disponible / corrupto: silencio */ }
    // Snapshot "limpio" tras aterrizar la restauración (o confirmar que no
    // hay borrador): _lastSavedRef arrancaba en '' y NUNCA coincidía con el
    // JSON del state inicial — salir de un formulario sin tocar nada (o del
    // modal de tipo de visita) preguntaba "hay cambios sin guardar", y
    // beforeunload también. El setTimeout deja pasar el commit del setD
    // de arriba para que _dRef ya tenga el estado restaurado.
    setTimeout(function() {
      if (_lastSavedRef.current === '') {
        _lastSavedRef.current = JSON.stringify({ d: _snapshotLimpia(_dRef.current), b: _bOtroRef.current });
        setDirty(false); // el estado restaurado es la línea base, no "cambios"
      }
    }, 0);
  }, [fase, _draftKey, filaEditando]);

  // (2) Persistir borrador local con debounce 500ms en cada cambio.
  // Si la identidad de la visita cambió (p.ej. al teclear el radicado en
  // una visita de oficio, o al recibir `fila` tras el primer guardado),
  // también se elimina el borrador bajo la clave anterior para evitar
  // huérfanos que se restauren en futuras visitas en blanco.
  React.useEffect(function() {
    if (fase !== 'formulario') return;
    if (!_restauradoRef.current) return;
    const t = setTimeout(function() {
      try {
        // El borrador NO persiste metadatos del servidor (enlaces Drive,
        // ids de carpeta, links de acta/informe). Esos vienen de BD y se
        // re-derivan al reabrir; persistirlos en otra pestaña podría pisar
        // los del flujo legítimo si dos dispositivos editan la misma fila.
        // `ultimaModConocida` (AP2) es el timestamp que BD tenía al abrir la
        // visita. Persistirlo en el borrador hacía que al reabrir se enviara
        // un timestamp viejo y el backend rechazara el guardado con un
        // conflicto falso ("Otra persona guardó cambios...") sin que nadie
        // más hubiera tocado la fila. Siempre debe venir fresco de BD.
        const _dServidor = ['linkDrive', 'idCarpetaVisita', 'idCarpetaFotos',
                            'linkXlsxActa', 'linkPdfActa', 'linkOrdenPolicia',
                            'linkPdfRadicado', 'linkDocxInforme', 'linkRegistroFotos',
                            'ultimaModConocida'];
        const _dSafe = {};
        Object.keys(d).forEach(function(k){
          if (_dServidor.indexOf(k) < 0) _dSafe[k] = d[k];
        });
        localStorage.setItem(_draftKey, JSON.stringify({
          _ts: Date.now(),
          _d: _dSafe,
          _barrioOtro: barrioOtro,
          _clientId: clientId,
          _radicadoFila: _radicadoFilaRef.current,
        }));
        if (_prevDraftKeyRef.current && _prevDraftKeyRef.current !== _draftKey) {
          try { localStorage.removeItem(_prevDraftKeyRef.current); } catch(_) {}
        }
        _prevDraftKeyRef.current = _draftKey;
      } catch(e) { /* quota llena / privacidad: silencio */ }
    }, 500);
    return function() { clearTimeout(t); };
  }, [d, barrioOtro, fase, _draftKey, clientId]);

  // (3) Autoguardado remoto cada 60 s — solo si ya existe fila en BD y la
  // visita ya está iniciada. Pasar a INICIADO es un acto explícito del
  // inspector con el botón Guardar (decisión del usuario, 2026-09-16), y el
  // primer guardado nunca puede ser el automático. En PENDIENTE/ASIGNADO este
  // guardaba el formulario sin cambiar el estado, pero apagaba «cambios sin
  // guardar» y la cabecera decía «✓ Guardado», con lo que se habilitaban los
  // entregables: una visita podía quedar diligenciada y seguir ASIGNADA (la
  // del 14/09; el 2026-10-05 se reportó el radicado 2026-015246 en ese estado).
  // Sin iniciar solo vive el borrador local de arriba.
  React.useEffect(function() {
    if (fase !== 'formulario') return;
    if (!filaEditando) return;
    if (visitaSinIniciar(estadoVisita)) return;
    const id = setInterval(async function() {
      if (_guardandoRef.current || _generandoActaRef.current || _generandoRFRef.current) return;
      const snap = JSON.stringify({ d: _snapshotLimpia(_dRef.current), b: _bOtroRef.current });
      if (snap === _lastSavedRef.current) return; // sin cambios
      try {
        const dCur = _dRef.current;
        const bCur = _bOtroRef.current;
        const barrioFinal = dCur.barrio === '__otro__' ? (bCur || '') : dCur.barrio;
        const dFinal = Object.assign({}, dCur, { barrio: barrioFinal });
        // Visita ya iniciada: el estado viaja tal cual. El autoguardado nunca
        // lo cambia (la guarda de arriba deja fuera PENDIENTE/ASIGNADO).
        const vals = _construirPayload(dFinal, estadoVisita, dCur.linkDrive || '', datosIniciales);
        const rAuto = await guardarVisita({ valores: vals, fila: filaEditando, ultimaModConocida: dCur.ultimaModConocida, radicadoConocido: _radicadoFilaRef.current, idVisita: _idVisitaRef.current, ubicacionConfirmada: _origenConfirmadoParaGuardar(dCur), revisionTexto: _revisionParaGuardar(dCur), documentoVisita: dCur.documento || undefined, licenciaExtra: _licenciaExtraParaGuardar(dCur), citadoVisita: _citadoParaGuardar(dCur) });
        _radicadoFilaRef.current = String(vals[0] || '');
        if (rAuto && rAuto.ultimaModConocida) setD(prev => ({ ...prev, ultimaModConocida: rAuto.ultimaModConocida }));
        _lastSavedRef.current = snap;
        setUltimoGuardadoMs(Date.now());
        setErrorGuardar('');
        setDirty(false); // sin este reset la barra seguía en "cambios sin guardar"
      } catch(e) {
        // NO silenciar. Un conflicto de ULTIMA_MODIFICACION falla cada 60 s
        // para siempre, y mientras tanto el acta y el registro fotográfico se
        // generan desde el estado local: documentos correctos, BD vacía. Es
        // exactamente lo que pasó con las visitas del 14/09/2026. La barra de
        // estado del encabezado ya sabe pintar esto en rojo.
        console.warn('[autoguardado] remoto falló (reintenta en 60s):', e.message);
        setErrorGuardar(e && e.message ? e.message : 'error desconocido');
      }
    }, 60000);
    return function() { clearInterval(id); };
  }, [fase, filaEditando, estadoVisita, datosIniciales]);

  // (4) beforeunload — advertir si hay cambios pendientes.
  React.useEffect(function() {
    function _bu(e) {
      if (fase !== 'formulario') return;
      if (!_hayCambiosSinGuardar()) return; // limpio
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
    window.addEventListener('beforeunload', _bu);
    return function() { window.removeEventListener('beforeunload', _bu); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- _hayCambiosSinGuardar solo lee refs; re-suscribir en cada render no aporta nada
  }, [fase]);

  // (5) Estado "dirty" reactivo para la barra fija de guardado: la misma
  // definición de _hayCambiosSinGuardar(), pero como state para poder
  // pintarla. _lastSavedRef muta sin re-render (tras guardar/autoguardar),
  // por eso guardar() y el autoguardado también hacen setDirty(false)
  // explícito.
  // Hasta el primer toque o tecla del inspector, lo que cambie solo es línea
  // base, no un cambio suyo (2026-10-28): al abrir una visita se completan
  // solos la ficha catastral (por dirección y por el pin), las casillas R11
  // del POT y la suspensión «N/A» de una obra terminada, y todo eso llegaba
  // después de fijar la línea base → «● Cambios sin guardar» sin tocar nada.
  // Lo autocompletado se guarda con el siguiente «Guardar».
  const _usuarioTocoRef = React.useRef(false);
  React.useEffect(function() {
    if (fase !== 'formulario') return;
    _usuarioTocoRef.current = false;
    function marcar() { _usuarioTocoRef.current = true; }
    document.addEventListener('pointerdown', marcar, true);
    document.addEventListener('keydown', marcar, true);
    return function() {
      document.removeEventListener('pointerdown', marcar, true);
      document.removeEventListener('keydown', marcar, true);
    };
  }, [fase]);

  React.useEffect(function() {
    if (fase !== 'formulario') return;
    if (!_restauradoRef.current) return; // antes de aterrizar la restauración daría falso positivo
    const snap = JSON.stringify({ d: _snapshotLimpia(d), b: barrioOtro });
    if (!_usuarioTocoRef.current) {
      _lastSavedRef.current = snap;
      setDirty(false);
      return;
    }
    setDirty(snap !== _lastSavedRef.current);
  }, [fase, d, barrioOtro]);

  // Alto real de la cabecera fija → --nv-header-h en la pantalla. El panel
  // mide uno o dos renglones según el estado (los faltantes solo salen con
  // la visita INICIADA), así que una constante dejaba el tablero de
  // entregables (≥1440) descolgado respecto de «Identificación del caso».
  // Mismo patrón que --header-h en app.jsx.
  const nvHeaderRef = React.useRef(null);
  React.useEffect(function() {
    if (fase !== 'formulario') return;
    const cab = nvHeaderRef.current;
    if (!cab || typeof ResizeObserver === 'undefined') return;
    const pantalla = cab.parentElement;
    const medir = function() {
      const alto = Math.round(cab.getBoundingClientRect().height);
      if (alto > 0 && pantalla) pantalla.style.setProperty('--nv-header-h', alto + 'px');
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(cab);
    return function() { ro.disconnect(); };
  }, [fase]);

  // (6) ¿El guardado de ESTA visita está en la cola offline? La barra fija
  // lo anuncia como estado propio (⇡ en cola), no solo como "sin conexión".
  React.useEffect(function() {
    if (fase !== 'formulario') return;
    function _actualizar() {
      if (typeof offlineListar !== 'function') return;
      offlineListar().then(function(lista) {
        const mios = (lista || []).some(function(it) {
          if (!it || it.tipo !== 'guardarVisita' || !it.body) return false;
          return (filaEditando && it.body.fila === filaEditando) ||
                 (it.body.clientId && it.body.clientId === clientId);
        });
        setEnColaGuardado(mios);
      }).catch(function() { /* sin IDB: la barra cae al estado sin conexión */ });
    }
    _actualizar();
    const _off = (typeof offlineOnChange === 'function') ? offlineOnChange(_actualizar) : null;
    return function() { if (typeof _off === 'function') _off(); };
  }, [fase, filaEditando, clientId]);

  // (7) El informe F-GGO-43 se genera en informe/index.html (pestaña o
  // iframe) y al subir avisa por postMessage {tipo:'informe-f43-subido'}.
  // Escucharlo aquí permite marcar el renglón del informe como generado sin
  // recargar la visita (antes nadie escuchaba este mensaje en esta pantalla).
  // `m.fila` llega como texto (sale del query string del generador) y
  // `filaEditando` es número: con === nunca coincidían y al regenerar «Abrir»
  // seguía apuntando al informe anterior, ya en la papelera. En móvil el
  // generador abre en pestaña 'noopener' y el aviso llega por BroadcastChannel.
  React.useEffect(function() {
    function _aplicar(m) {
      if (!m || m.tipo !== 'informe-f43-subido' || !m.link) return;
      if (filaEditando && String(m.fila) === String(filaEditando)) {
        setD(function(prev) { return Object.assign({}, prev, { linkDocxInforme: m.link }); });
      }
    }
    function _onMsg(e) {
      if (e.origin !== window.location.origin) return;
      _aplicar(e && e.data);
    }
    window.addEventListener('message', _onMsg);
    let bc = null;
    try {
      if (typeof BroadcastChannel === 'function') {
        bc = new BroadcastChannel('cu-informe-f43');
        bc.onmessage = function(e) { _aplicar(e && e.data); };
      }
    } catch (eBc) { bc = null; }
    return function() {
      window.removeEventListener('message', _onMsg);
      if (bc) bc.close();
    };
  }, [filaEditando]);

  // (8) El conteo de fotos ya en Drive lo trae SeccionFotos con su propia
  // lectura (las lista, no solo las cuenta) y lo reporta por onFotosChange.

  // (9) Un guardado que salió de la cola trae el timestamp nuevo de BD. Sin
  // esto el formulario abierto seguía con el `ultimaModConocida` de antes de
  // perder la señal, y el siguiente guardado (o el autoguardado, cada 60 s)
  // chocaba contra su propia escritura con un conflicto falso.
  React.useEffect(function() {
    if (typeof offlineOnItemSynced !== 'function') return;
    return offlineOnItemSynced(function(evt) {
      if (evt.tipo !== 'guardarVisita') return;
      const r = evt.resultado;
      if (!r || !r.ultimaModConocida) return;
      // La cola es global: ignorar la sincronización de otra visita.
      if (r.fila && filaEditando && r.fila !== filaEditando) return;
      setD(function(prev) { return Object.assign({}, prev, { ultimaModConocida: r.ultimaModConocida }); });
      setEnColaGuardado(false);
      setUltimoGuardadoMs(Date.now());
    });
  }, [filaEditando]);

  // (10) Casos de otro radicado en la misma dirección o con la misma orden
  // (decisión del usuario 2026-09-30: solo avisa, no bloquea). Solo en la 1ª
  // visita de un caso sin completar: en un seguimiento el caso ya está
  // elegido. La lista sale de la copia local de la BD (sin esperar red) y se
  // recalcula al dejar de teclear.
  const [casosRelac, setCasosRelac] = React.useState([]);
  const [casosRelacVistos, setCasosRelacVistos] = React.useState('');
  // Una sola lectura por formulario: pasado el minuto de caché en memoria,
  // cada leerVisitas() dispara un refresco por red, y esto corre a cada pausa
  // del teclado.
  const casosBDRef = React.useRef(null);
  const _primeraVisita = (parseInt(d.nVisita, 10) || 1) === 1;
  React.useEffect(() => {
    if (fase !== 'formulario' || !_primeraVisita || estadoVisita === 'COMPLETADO'
        || typeof casosRelacionados !== 'function') {
      setCasosRelac([]);
      return;
    }
    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        if (!casosBDRef.current) casosBDRef.current = (await leerVisitas()).datos || [];
        const datos = casosBDRef.current;
        if (cancelado) return;
        // Oficio sin guardar: aún no tiene radicado propio, y si su orden ya
        // es la de otro caso, ese caso es justo el que hay que avisar.
        const propio = d.esOficio
          ? (filaEditando ? radicadoDeOficio(d.radicado, d.orden, d.nVisita) : '')
          : d.radicado;
        setCasosRelac(casosRelacionados(datos, {
          direccion: d.direccion,
          orden: d.esOficio ? d.orden : '',
          radicadoPropio: propio,
          filaPropia: filaEditando,
        }));
      } catch (e) { /* sin copia local ni red: no hay con qué avisar */ }
    }, 700);
    return () => { cancelado = true; clearTimeout(t); };
  }, [fase, _primeraVisita, estadoVisita, d.esOficio, d.direccion, d.orden, d.radicado, filaEditando]);

  // ── Callback del modal: configura el formulario según la elección ──
  function handleModalResult(res) {
    // Borrón y cuenta nueva del autoguardado local: id efímero fresco para
    // que esta nueva sesión de formulario NO restaure datos de un borrador
    // huérfano de una visita anterior (caso: persona que atiende prellenada
    // con los datos del oficio del día pasado).
    setDraftEphemeralId(_newEphemeralDraftId());
    setClientId(_newEphemeralDraftId());
    _restauradoRef.current = false;
    _prevDraftKeyRef.current = null;
    _radicadoFilaRef.current = (res.tipo === 'pqr' && !res.esNueva)
      ? String((res.datosIniciales || {})['RADICADO'] || '') : '';
    _idVisitaRef.current = (res.tipo === 'pqr' && !res.esNueva)
      ? String((res.datosIniciales || {})['ID_VISITA'] || '') : '';
    if (res.tipo === 'oficio') {
      // Visita de oficio — formulario en blanco con flag _oficio
      setD(_estadoInicial({ '_oficio': true }));
      setEstV('PENDIENTE');
      setFE(null);
    } else if (res.tipo === 'pqr') {
      // PQR con datos precargados de BD
      setD(_estadoInicial(res.datosIniciales));
      // Estado real desde BD (no hardcodear INICIADO al continuar: una visita
      // ASIGNADA o PENDIENTE no debe escalar solo por abrir el formulario).
      // Solo el click "Guardar" promueve a INICIADO.
      if (res.esNueva) {
        setEstV('PENDIENTE');
      } else {
        const _rawEst = (res.datosIniciales || {})['ESTADO VISITA'];
        const _normEst = (typeof normalizarEstado === 'function' ? normalizarEstado(_rawEst) : (_rawEst || '').toString().toUpperCase().trim());
        setEstV(_normEst || 'INICIADO');
      }
      setFE(res.esNueva ? null : (res.fila || null));
      if (res.datosIniciales) {
        const _ordRaw = res.datosIniciales['N° ORDEN DE POLICIA'] || res.datosIniciales['N ORDEN DE POLICIA'] || '';
        setOrdenConsecutivo(_extraerConsecutivoOrden(_ordRaw));
        setOrdenAnio(_extraerAnioOrden(_ordRaw));
      }
    } else if (res.tipo === 'pqr_manual') {
      // PQR sin datos en BD — solo radicado precompletado
      setD(_estadoInicial({ 'RADICADO': res.radicado }));
      setEstV('PENDIENTE');
      setFE(null);
    }
    setFase('formulario');
  }

  // Helper para actualizar un campo del form
  function setCampo(k, v) { setD(prev => ({ ...prev, [k]: v })); }

  // Audiencias (TASK 3b): la cita se pide en campo por radicado o N° de orden.
  // Si hay una reserva, la fecha y la hora de citación salen de ella (fijas).
  const [citaReservada, setCitaReservada] = React.useState(null);
  // «Pedir cita» desde la sección Citación; al cerrarla se vuelve a buscar la
  // reserva del caso (citaVuelta) para fijar la fecha y la hora del cupo.
  const [pidiendoCitaNV, setPidiendoCitaNV] = React.useState(false);
  const [citaVuelta, setCitaVuelta] = React.useState(0);
  React.useEffect(() => {
    const caso = { radicado: d.radicado || '', ordenPolicia: normOrdenAudiencias(d.orden) ? d.orden : '' };
    if (!caso.radicado && !caso.ordenPolicia) { setCitaReservada(null); return; }
    let vivo = true;
    // Pedida sin señal y aún en la cola: se muestra «En cola» (o «No se pudo»)
    // aunque el servidor todavía no la tenga.
    const pendiente = () => citasPendientes().then(l => {
      const p = l.find(x => mismoCasoAudiencias({ radicado: x.caso.radicado, ordenPolicia: x.caso.ordenPolicia }, caso));
      return p ? Object.assign({}, p.cupo, { estadoCita: p.estado, reservadoPor: usuario.usuario }) : null;
    }).catch(() => null);
    const t = setTimeout(async () => {
      const pend = await pendiente();
      if (!vivo) return;
      if (pend) { setCitaReservada(pend); if (pend.estadoCita === 'fallo') return; }
      if (!navigator.onLine) return;
      listarCuposAudiencias(caso).then(r => {
        if (!vivo) return;
        const c = (r && r.propias && r.propias[0]) || null;
        if (!c && pend) return;
        setCitaReservada(c ? Object.assign({}, c, { estadoCita: 'ok' }) : null);
        if (!c) return;
        const min = horaAudienciasMin(c.hora);
        const hh = String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
        const iso = _fechaAIso(c.fecha);
        setD(prev => (prev.citacionFecha === iso && prev.citacionHora === hh && !prev.noCitacion)
          ? prev : { ...prev, citacionFecha: iso, citacionHora: hh, noCitacion: false });
      }).catch(() => {});
    }, 800);
    return () => { vivo = false; clearTimeout(t); };
  }, [d.radicado, d.orden, citaVuelta]);
  // Acta ↔ informe cambia qué se revisa (con informe no hay conclusiones): una
  // revisión abierta deja de valer y se cierra. Antes, pasar a informe sin
  // elegir las conclusiones dejaba «Aplicar» deshabilitado para siempre
  // (revisión DeepSeek 2026-10-17); a la inversa, sellaba conclusiones sin revisar.
  function cambiarDocumento(v) { setRevisionPanel(null); setCampo('documento', v); }

  // Chips de licencia («Tipo de trámite» / «Modalidad»): el estado sigue
  // siendo el texto d.tipoLicencia (columna AL); cada toggle parsea, cambia
  // su grupo y vuelve a formatear (parsearTipoModalidad/formatearTipoModalidad,
  // utils.js). Los valores que no casan con el catálogo se muestran abajo
  // como «Valor anterior» para que el inspector los corrija, pero no se pierden.
  function _chipsLicencia(grupo) {
    const lic = parsearTipoModalidad(d.tipoLicencia);
    const opciones = grupo === 'tramites' ? LICENCIA_TRAMITES : LICENCIA_MODALIDADES;
    const activos = lic[grupo] || [];
    return (
      <div>
        <div className="chips">
          {opciones.map(o => (
            <button key={o} type="button"
              className={'chip' + (activos.indexOf(o) >= 0 ? ' activo' : '')}
              onClick={() => setD(prev => {
                // Sobre el estado actual: dos toques seguidos no se pisan.
                const l = parsearTipoModalidad(prev.tipoLicencia);
                const act = l[grupo] || [];
                const nuevos = act.indexOf(o) >= 0 ? act.filter(a => a !== o) : [...act, o];
                return { ...prev, tipoLicencia: formatearTipoModalidad({ ...l, [grupo]: nuevos }) };
              })}>
              {o}
            </button>
          ))}
        </div>
        {lic.otros.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--texto-3)' }}>
            Valor anterior: {lic.otros.join(', ')}
          </div>
        )}
      </div>
    );
  }

  // «¿Las obras requieren licencia?»: cada cambio recalcula la AA
  // (REPARACION LOCATIVA), que siguen leyendo el acta (L25) y R04/R05.
  // `patch` puede ser función del estado actual: dos toques seguidos en los
  // chips no se pisan (cada uno parte de lo que dejó el anterior).
  function _setReqLic(patch) {
    setD(prev => {
      const base = { modalidades: [], motivos: [], otro: '', motivoIndeterminado: '', ...(prev.reqLicencia || {}) };
      const r = { ...base, ...(typeof patch === 'function' ? patch(base) : patch) };
      return { ...prev, reqLicencia: r, repLocativa: repLocativaDesdeRequiere(r) };
    });
  }
  function _chipsReqLic(opciones, campo) {
    const activos = (d.reqLicencia || {})[campo] || [];
    return (
      <div className="chips">
        {opciones.map(o => (
          <button key={o} type="button"
            className={'chip' + (activos.indexOf(o) >= 0 ? ' activo' : '')}
            onClick={() => _setReqLic(r => {
              const act = r[campo] || [];
              return { [campo]: act.indexOf(o) >= 0 ? act.filter(a => a !== o) : [...act, o] };
            })}>
            {o}
          </button>
        ))}
      </div>
    );
  }
  function _preguntaRequiereLicencia() {
    const r = d.reqLicencia || {};
    return (
      <>
        <_Campo label="¿Las obras requieren licencia?" fullWidth>
          <_Radio value={r.respuesta === REQUIERE_INDETERMINADO ? 'No se pudo determinar' : r.respuesta}
            onChange={v => _setReqLic({ respuesta: v === 'No se pudo determinar' ? REQUIERE_INDETERMINADO : v })}
            opciones={['SI', 'NO', 'No se pudo determinar']} />
        </_Campo>
        {r.respuesta === 'SI' && (
          <_Campo label="Modalidad que exige" fullWidth>
            {_chipsReqLic(LICENCIA_MODALIDADES, 'modalidades')}
          </_Campo>
        )}
        {r.respuesta === 'NO' && (
          <>
            <_Campo label="¿Por qué no la requieren?" fullWidth>
              {_chipsReqLic(MOTIVOS_NO_REQUIERE, 'motivos')}
            </_Campo>
            {(r.motivos || []).indexOf('Otro') >= 0 && (
              <_Campo label="Otro motivo" fullWidth>
                <_Input value={r.otro || ''} onChange={v => _setReqLic({ otro: v })} />
              </_Campo>
            )}
          </>
        )}
        {r.respuesta === REQUIERE_INDETERMINADO && (
          <_Campo label="¿Por qué no se pudo determinar?" fullWidth>
            <_Input value={r.motivoIndeterminado || ''} onChange={v => _setReqLic({ motivoIndeterminado: v })} />
          </_Campo>
        )}
      </>
    );
  }

  // Lista dinámica de visitadores (cargada desde USUARIOS vía endpoint).
  // Si falla la carga (sin red o primer arranque sin cache), usa el fallback.
  const [visitadoresDin, setVisitadoresDin] = React.useState(VISITADORES_FALLBACK);
  useEffectNV(() => {
    if (fase !== 'formulario') return;
    if (typeof listarInspectoresActivos !== 'function') return;
    let cancelado = false;
    listarInspectoresActivos().then(lista => {
      if (cancelado || !lista || !lista.length) return;
      setVisitadoresDin(lista.map(u => ({
        val: u.nombre,            // mayúsculas, coincide con BD VISITAS col R
        l: _labelInspector(u.nombre),
      })));
    }).catch(() => { /* mantiene fallback */ });
    return () => { cancelado = true; };
  }, [fase]);

  // Nombre del usuario logueado tal como va en VISITADOR(ES) (col A de
  // USUARIOS), o '' si no es inspector de la lista (p. ej. un admin puro).
  function _miVisitador() {
    if (!usuario || !usuario.usuario) return '';
    const u = String(usuario.usuario).toUpperCase().trim();
    const exacto = visitadoresDin.find(v => v.val.toUpperCase() === u);
    if (exacto) return exacto.val;
    const m = visitadoresDin.find(v => v.val.includes(u.split(' ')[0]));
    return m ? m.val : '';
  }

  // Prefijar visitador con el usuario logueado (si está en la lista).
  // Excepción: las visitas de seguimiento se asignan a alguien a propósito,
  // así que ahí el campo queda vacío y el inspector se elige.
  useEffectNV(() => {
    if (fase !== 'formulario') return; // no ejecutar en fase modal
    if (datosIniciales && datosIniciales['_seguimiento']) return;
    if (!d.visitador && usuario) {
      const m = _miVisitador();
      if (m) setCampo('visitador', m);
    }
  }, [fase, visitadoresDin]); // re-prefija si la lista cambia tras carga dinámica

  // Sincronizar orden completa cuando cambia el consecutivo o el año.
  // El año NO se deriva de d.fechaVisita — las órdenes existentes mantienen
  // su año original; las nuevas usan el año actual del calendario.
  useEffectNV(() => {
    if (ordenConsecutivo) {
      setCampo('orden', _formatearOrden(ordenConsecutivo, ordenAnio));
    } else {
      setCampo('orden', '');
    }
  }, [ordenConsecutivo, ordenAnio]);

  // Auto-recuperación de carpeta Drive faltante.
  // Si la visita se guardó offline, la cola la sincroniza sin LINK_DRIVE
  // (crearCarpetaVisita es GET y falla offline). Al reabrir la visita —o al
  // recuperar conexión con el formulario abierto— creamos la carpeta
  // automáticamente y persistimos el link: `enLinea` (declarado arriba, lo
  // actualizan los eventos online/offline) es dep del efecto, así el
  // reintento no espera a que cambien los demás datos. El backend resuelve
  // con obtenerOCrearCarpeta: un reintento después de un intento a medias
  // no duplica carpetas.
  // No corre en PENDIENTE/ASIGNADO: escribe la fila entera sin que se pulse
  // Guardar (igual que el autoguardado) y dejaba los entregables disponibles
  // en una visita sin iniciar. La carpeta nace en el primer Guardar, que ya
  // la crea (guardar() → crearCarpetaVisita).
  useEffectNV(() => {
    if (fase !== 'formulario') return;
    if (!filaEditando) return;             // solo para visitas ya en BD
    if (visitaSinIniciar(estadoVisita)) return;
    if (d.linkDrive) return;                // ya tiene carpeta
    if (!enLinea) return;                   // sin red: nada que hacer
    if (!d.comuna || !d.direccion || !d.fechaVisita) return;
    let cancelado = false;
    (async () => {
      try {
        const c = await crearCarpetaVisita(d.comuna, d.direccion, d.fechaVisita, d.nVisita || 1, {
          barrio:  d.barrio,
          persona: d.atiendeNombre || '',
          lat:     d.lat || '',
          lon:     d.lon || '',
        });
        if (cancelado) return;
        const linkDrive = c.linkCarpeta || '';
        if (!linkDrive) return;
        // Persistir en BD: re-armar payload con linkDrive y actualizar la fila.
        const vals = _construirPayload(d, estadoVisita, linkDrive, datosIniciales);
        let rBg = null;
        try {
          rBg = await guardarVisita({ valores: vals, fila: filaEditando, ultimaModConocida: d.ultimaModConocida, radicadoConocido: _radicadoFilaRef.current, idVisita: _idVisitaRef.current });
          _radicadoFilaRef.current = String(vals[0] || '');
        } catch (e) { /* silencioso, se reintenta al próximo save */ }
        if (cancelado) return;
        setD(prev => ({
          ...prev,
          linkDrive: linkDrive,
          ultimaModConocida: (rBg && rBg.ultimaModConocida) || prev.ultimaModConocida,
          idCarpetaVisita: _idCarpetaDeLink(linkDrive),
          idCarpetaFotos: c.idFotos || '',
        }));
        console.log('[carpeta-auto] carpeta Drive creada al reabrir visita');
      } catch (e) {
        console.warn('[carpeta-auto] no se pudo crear carpeta:', e.message);
      }
    })();
    return () => { cancelado = true; };
  }, [fase, filaEditando, d.linkDrive, enLinea, d.comuna, d.direccion, d.fechaVisita, estadoVisita, datosIniciales]);

  // Recuperar idCarpetaFotos al reabrir una visita ya guardada.
  // La BD solo persiste LINK_DRIVE (carpeta visita); la subcarpeta de Fotos
  // se descubre vía webhook. Sin esto, la sección Fotos queda oculta al
  // editar una visita INICIADA.
  useEffectNV(() => {
    if (fase !== 'formulario') return;
    if (!filaEditando) return;
    if (d.idCarpetaFotos) return;            // ya está cargada
    if (!d.idCarpetaVisita) return;          // necesita la carpeta padre
    let cancelado = false;
    // `obtenerIdFotos` se traga cualquier error y devuelve '' (api.js:765), y
    // las dependencias no cambian: un solo fallo dejaba la visita sin control
    // de subida hasta recargar. El backend crea /Fotos si no existe, así que
    // vacío siempre es fallo, nunca «no hay carpeta» — reintentamos.
    (async () => {
      for (let intento = 0; intento < 3 && !cancelado; intento++) {
        if (intento > 0) await new Promise(r => setTimeout(r, 3000 * intento));
        if (cancelado) return;
        const idF = await obtenerIdFotos(d.idCarpetaVisita);
        if (cancelado) return;
        if (idF) { setCampo('idCarpetaFotos', idF); return; }
      }
      console.warn('[fotos] no se pudo resolver la subcarpeta /Fotos de', d.idCarpetaVisita);
    })();
    return () => { cancelado = true; };
  }, [fase, filaEditando, d.idCarpetaVisita, d.idCarpetaFotos]);

  // Recuperar links de acta y RF al reabrir una visita que ya los tiene en
  // la carpeta de Drive. Generaciones anteriores a la persistencia
  // server-side dejaron el archivo sin link en BD: el acta dependía de un
  // `actualizarLinks` best-effort del cliente (si ese POST fallaba, la
  // columna quedaba vacía para siempre) y el RF no se persistía nunca — el
  // link vivía solo en el state de la sesión que lo generó. Un solo pedido:
  // el backend mira la carpeta por prefijo de nombre y persiste lo que
  // encuentre. Si no hay nada, no insiste (el «Generar» sigue funcional).
  useEffectNV(() => {
    if (fase !== 'formulario') return;
    if (!filaEditando) return;
    if (!d.idCarpetaVisita) return;
    if (d.linkXlsxActa && d.linkRegistroFotos) return; // nada por recuperar
    if (!enLinea) return;
    let cancelado = false;
    (async () => {
      try {
        const r = await gasPost({
          accion: 'recuperarEntregables',
          fila: filaEditando,
          radicadoConocido: _radicadoFilaRef.current,
          idVisita: _idVisitaRef.current,
          idCarpetaVisita: d.idCarpetaVisita,
        });
        if (cancelado || !r || !r.ok) return;
        if (r.linkXlsxActa && !d.linkXlsxActa) setCampo('linkXlsxActa', r.linkXlsxActa);
        if (r.linkRegistroFotos && !d.linkRegistroFotos) setCampo('linkRegistroFotos', r.linkRegistroFotos);
      } catch (e) {
        console.warn('[entregables] no se pudieron recuperar links de la carpeta:', e.message);
      }
    })();
    return () => { cancelado = true; };
  }, [fase, filaEditando, d.idCarpetaVisita, d.linkXlsxActa, d.linkRegistroFotos, enLinea]);

  // Cuando estadoObra cambia a "Terminada", forzar suspensión a N/A
  useEffectNV(() => {
    if (d.estadoObra === 'Terminada') {
      setCampo('suspension', 'N/A');
    }
  }, [d.estadoObra]);

  // ── Sugerencias de tipificación según POT + catastro ──
  // Predio público (catastro municipal)              → A3: Bienes uso público (Antejardín)
  // Suelo de protección o retiro de quebrada (POT)   → A1: Áreas protegidas
  // Ambas condiciones                                → A1 + A3 (suma)
  // El inspector debe aceptar para aplicarlas. Al aceptar reemplazamos
  // SOLO el grupo A (preservando chips C/D que el inspector haya marcado).
  // Si toca "Ignorar" no insistimos hasta que cambien las señales.
  useEffectNV(() => {
    // Reset al cambiar el contexto del predio (nuevo punto / nueva consulta).
    setAdvertTipifIgnorada(false);
  }, [d.sueloProt, d.quebrada, catResultados, predioMunicipal, d.catastral]);

  // Detección "es público": prioriza el flag predioMunicipal (siempre confiable);
  // como fallback, mira catResultados (caso PH cuando aún no se setea el flag).
  const _esPublico = predioMunicipal || !!(catResultados && catResultados.some(r => r.municipal));
  const _esProtegido = d.sueloProt === 'SI';
  const _enRetiroQ = d.quebrada === 'SI';
  const _sugerenciasA = (function() {
    const s = [];
    if (_esProtegido || _enRetiroQ) {
      const razon = (_esProtegido && _enRetiroQ)
        ? 'el predio está en suelo de protección y retiro de quebrada'
        : (_esProtegido
            ? 'el predio está en suelo de protección'
            : 'el predio está dentro del retiro de quebrada');
      s.push({ val: 'A1: Áreas protegidas', razon: razon });
    }
    if (_esPublico) {
      s.push({ val: 'A3: Bienes uso público (Antejardín)', razon: 'el predio es del Municipio de Bello' });
    }
    return s;
  })();

  // Chips A actuales en d.infraccion
  const _chipsActuales = (d.infraccion || '').split(' | ').map(s => s.trim()).filter(Boolean);
  const _chipsAActuales = _chipsActuales.filter(v => /^A\d/.test(v));
  const _vSugeridos = _sugerenciasA.map(s => s.val);
  // ¿Las sugerencias ya están aplicadas exactamente?
  const _sugerenciasYaAplicadas = _vSugeridos.length > 0
    && _vSugeridos.every(v => _chipsAActuales.includes(v))
    && _chipsAActuales.length === _vSugeridos.length;
  const _mostrarAdvertenciaTipif = _sugerenciasA.length > 0
    && !advertTipifIgnorada
    && !_sugerenciasYaAplicadas;

  // Sin infracción no hay nada que medir: marcar "No se evidencia infracción"
  // deja el área en "No aplica", y tipificar un comportamiento real la suelta
  // (ya hay algo que medir y la validación vuelve a pedir la cifra). Es solo
  // el valor por defecto — las casillas siguen a mano del inspector.
  function _setInfraccion(v) {
    setCampo('infraccion', v);
    const chips = String(v || '').split(' | ').map(x => x.trim()).filter(Boolean);
    if (chips.includes(CONTRAVENCION_ESPECIAL)) {
      setCampo('areaNoAplica', true);
      setCampo('areaNoMedible', false);
      setCampo('area', '');
    } else if (chips.includes(CONTRAVENCION_INDETERMINADA)) {
      // No se sabe si hay algo que medir: el área queda a criterio del inspector.
    } else if (chips.length && d.areaNoAplica) {
      setCampo('areaNoAplica', false);
    }
  }

  function _aplicarSugerenciasTipif() {
    // Quitar chips de literal A; conservar el resto (C, D, "No se evidencia...")
    const noA = _chipsActuales.filter(v => !/^A\d/.test(v));
    // Quitar también "No se evidencia infracción" / "No se pudo determinar" si
    // estaban — ahora SÍ hay infracción.
    const noNoInfr = noA.filter(v => v !== CONTRAVENCION_ESPECIAL && v !== CONTRAVENCION_INDETERMINADA);
    // Lo sugerido (A1/A3) primero: A1 tiene prioridad.
    const final = [..._vSugeridos, ...noNoInfr];
    _setInfraccion(final.join(' | '));
  }

  // Limpiar geoWatch al desmontar (debe estar ANTES del early return para evitar React #310)
  React.useEffect(function() {
    return function() {
      if (geoWatchRef.current != null) {
        navigator.geolocation.clearWatch(geoWatchRef.current);
        geoWatchRef.current = null;
      }
      // También el timeout de 30s: si sobrevive al desmontaje, dispara
      // _aceptarCoordenadas sobre un formulario que ya no existe (POT y
      // catastro incluidos).
      if (geoTimeoutRef.current != null) {
        clearTimeout(geoTimeoutRef.current);
        geoTimeoutRef.current = null;
      }
    };
  }, []);

  // Va aquí, antes del early return de la fase modal: si se declara después, el
  // paso modal→formulario cambia el número de hooks entre renders (React #310).
  // _puedeSalir es una declaración de función, así que está izada.
  useEffectNV(() => {
    window._cuGuardSalir = _puedeSalir;
    return function() { delete window._cuGuardSalir; };
  });

  // ── Si estamos en fase modal, mostrar solo el selector ──
  if (fase === 'modal') {
    return <ModalInicioVisita onResult={handleModalResult} onCancelar={onSalir} busquedaInicial={busquedaInicial} />;
  }

  // ── Geocode botón — al obtener coords dispara consulta POT automática ─
  async function ejecutarGeocode() {
    if (!d.direccion) {
      await appAlert('Ingresa una dirección primero.', { tono: 'aviso', titulo: 'Falta dirección' });
      return;
    }
    // Catastro encontró un solo predio para la dirección: el pin va dentro de
    // él (exacto), no donde lo deje el geocoder (aproximado).
    if (terrenosDir.length === 1) { _pinEnPredioDireccion(terrenosDir[0].tcod); return; }
    setBusyGeo(true);
    try {
      // Dirección-coordenada: sin barrio ni municipio (geocodeDireccion la
      // resuelve sin red si le llega sola).
      const q = puntoDesdeTextoCoord(d.direccion) ? d.direccion : d.direccion + (d.barrio && d.barrio !== '__otro__' ? ', ' + d.barrio : '') + ', Bello, Antioquia';
      const r = await geocodeDireccion(q);
      const c = r.data || r;
      if (c.lat && c.lng) {
        setCampo('lat', c.lat); setCampo('lon', c.lng);
        setCampo('origenPunto', 'DIRECCION');
        ejecutarPOT(c.lat, c.lng);
        ejecutarBusquedaCatastral(c.lat, c.lng, true);
      } else {
        await appAlert('No se encontró la ubicación. Refina la dirección.', { tono: 'aviso', titulo: 'Sin resultado' });
      }
    } catch (e) {
      await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Geocoding' });
    }
    setBusyGeo(false);
  }

  // Sella la revisión en silencio (decisión del usuario 2026-10-17): el texto
  // ya estaba revisado y el retoque no amerita otra propuesta — ni panel, ni
  // IA, ni avisos; el estado pasa a «✓ Revisado…» como siempre.
  function sellarRevisionSilencioso(modo) {
    const hoy = new Date();
    setCampo('revision', {
      modo: modo || 'PROPIO',
      huella: huellaRevision(d.actuacion, d.obsConclusion, _infraccionSoloCatalogo(d.infraccion), camposRevision(d)),
      partes: partesRevision(d.actuacion, d.obsConclusion, _infraccionSoloCatalogo(d.infraccion), camposRevision(d)),
      textos: { desc: d.actuacion, conc: d.obsConclusion },
      senales: _clavesSenalesD(d),
      fecha: String(hoy.getDate()).padStart(2, '0') + '/' + String(hoy.getMonth() + 1).padStart(2, '0') +
        '/' + hoy.getFullYear(),
      nombre: '',
    });
    // La justificación ya dada se conserva si las contradicciones siguen.
    setCampo('revisionJustif', _clavesSenalesD(d).length ? d.revisionJustif : '');
  }

  // ── Revisión obligatoria del texto (antes «Mejorar texto») ──────────
  // docs/PROPUESTA_2026-10-14_coherencia-acta.md § 8. Revisar = propuesta de
  // la IA para la descripción y las conclusiones (con los chips marcados) +
  // chequeo local (revisarTextoLocal). Al cerrar se sella la huella de los
  // textos y los chips; sin ese sello vigente no se genera acta ni informe
  // (_evaluarFormulario). Si quedan señales del chequeo local, cerrar pide
  // una justificación, que va a JUSTIFICACIONES_COHERENCIA y LOG_AUDITORIA.
  // Anti-martilleo: 3 s de enfriamiento tras la petición (rate-limit 429).
  async function ejecutarRevision() {
    if (busyMejora) return;  // doble-click defensivo
    if (!d.actuacion) {
      await appAlert('Escribe algo en la descripción primero.', { tono: 'aviso', titulo: 'Nada que revisar' });
      return;
    }
    // Revisión por campo (2026-10-17): solo se revisa lo que cambió de verdad
    // desde el sello. Nada vencido → ya está revisada, no se llama a la IA.
    // Excepción: revisado pero no cabe en el acta (se selló antes del tope) —
    // hay que volver a pedir la propuesta condensada aunque nada cambiara.
    // Con informe técnico las conclusiones se escriben en el generador del
    // informe (decisión del usuario 2026-10-17): no se revisan ni se proponen.
    const esActaPre = documentoVisita(d.documento) === 'ACTA';
    const cambiadas = partesCambiadas(d.revision, d.actuacion, d.obsConclusion,
      _infraccionSoloCatalogo(d.infraccion), camposRevision(d)).filter(c => esActaPre || c !== 'conc');
    const noCabePre = esActaPre && (!capacidadActa(d.actuacion, 'situacion').cabe ||
      !capacidadActa(_conclusionesActaD(d), 'conclusiones').cabe);
    if (!noCabePre && (!cambiadas.length ||
        (cambiadas.length === 1 && cambiadas[0] === 'datos' && _revisionVigenteD(d)))) {
      await appAlert(esActaPre ? 'La descripción y la conclusión ya están revisadas.' : 'La descripción ya está revisada.', { tono: 'aviso', titulo: 'Nada que revisar' });
      return;
    }
    let pedirDesc = cambiadas.indexOf('desc') >= 0;
    let pedirConc = cambiadas.indexOf('conc') >= 0;
    if (noCabePre) {
      if (!capacidadActa(d.actuacion, 'situacion').cabe) pedirDesc = true;
      if (!capacidadActa(_conclusionesActaD(d), 'conclusiones').cabe) pedirConc = true;
    }
    // Retoque menor sobre un texto ya revisado (2026-10-17, decisión del
    // usuario): no se pide otra propuesta. Solo si la casilla cabe en el acta
    // (si no cabe, toca pedir la versión condensada).
    const previos = d.revision && d.revision.textos;
    if (previos) {
      if (pedirDesc && cambioMenorRevision(previos.desc, d.actuacion) &&
          (!esActaPre || capacidadActa(d.actuacion, 'situacion').cabe)) pedirDesc = false;
      if (pedirConc && cambioMenorRevision(previos.conc, d.obsConclusion) &&
          (!esActaPre || capacidadActa(_conclusionesActaD(d), 'conclusiones').cabe)) pedirConc = false;
    }
    // Nada que pedir y sin contradicciones nuevas: se sella en silencio, sin
    // abrir el panel ni llamar a la IA.
    if (!pedirDesc && !pedirConc && _senalesYaJustificadasD(d)) {
      sellarRevisionSilencioso(d.revision && d.revision.modo);
      return;
    }
    // Solo cambian los datos (con señales de coherencia): sin IA, el panel
    // abre con los dos textos propios y pide la justificación.
    const soloDatos = !pedirDesc && !pedirConc;
    // Sin señal no se abre: generar el acta también necesita conexión, y
    // cerrar «LOCAL» sin red sería una forma de saltarse la IA.
    if (!soloDatos && !navigator.onLine) {
      await appAlert('Sin conexión: la revisión necesita internet. Guarda la descripción tal cual y revísala cuando vuelva la señal.',
        { tono: 'aviso', titulo: 'Sin conexión' });
      return;
    }
    setBusyMe(true);
    const chips = comportamientosParaIA(_infraccionSoloCatalogo(d.infraccion));
    const origDesc = d.actuacion || '';
    const origConc = d.obsConclusion || '';
    // Topes del acta (2026-10-15), solo si la visita va a acta. La descripción
    // lleva siempre el tope que cuenta los párrafos que la propuesta puede
    // abrir (2026-10-26; antes solo viajaba si el original no cabía); las
    // conclusiones siempre van con el tope de su celda. Con informe, sin tope.
    const esActa = esActaPre;
    const parrafos = t => String(t).split(/\n+/).filter(s => s.trim()).length;
    const maxDesc = !esActa ? 0 : topeSituacionRevision(origDesc);
    const maxConc = !esActa ? 0 : caracteresParaActa('conclusiones', 0, parrafos(origConc));
    // El campo que no cambió no se manda a la IA: se revisa solo lo que
    // cambió (regla 2026-10-17). Las conclusiones se piden siempre que toca,
    // con lo diligenciado: si el inspector no escribió, la propuesta sale de
    // los datos y él la aprueba o la edita. Cada casilla falla por su lado:
    // si solo falla la de conclusiones, la descripción conserva su propuesta
    // y el panel avisa (concFallo).
    let ia = !soloDatos, desc = origDesc, conc = origConc, concFallo = false;
    try {
      const [tD, tC] = await Promise.all([
        pedirDesc ? mejorarTexto(origDesc, 'actuacion', chips, maxDesc) : Promise.resolve(origDesc),
        !pedirConc ? Promise.resolve(origConc)
          : mejorarTexto(origConc, 'conclusionActa', chips, maxConc, _contextoVisitaD(d))
              .catch(e => { console.warn('[revisión] conclusiones sin propuesta:', e.message); return ''; }),
      ]);
      if (pedirDesc && !tD) throw new Error('respuesta vacía');
      if (pedirDesc) desc = tD;
      // '' = la IA falló.
      if (pedirConc) { if (tC) conc = tC; else concFallo = true; }
    } catch (e) {
      // DeepSeek y Claude caídos: una caída del proveedor no deja a nadie
      // sin acta. Se cierra solo con el chequeo local (modo LOCAL).
      console.warn('[revisión] la IA no respondió:', e.message);
      ia = false;
    }
    // Propuesta que no aporta nada (casi idéntica y sin pérdidas): no se
    // muestra como opción — la casilla queda «Sin cambios propuestos» y ya
    // viene elegida con el texto propio (2026-10-17).
    const aportaDesc = ia && pedirDesc && propuestaAporta(origDesc, desc);
    const aportaConc = ia && pedirConc && conc !== '' && propuestaAporta(origConc, conc);
    if (ia && pedirDesc && !aportaDesc) desc = origDesc;
    if (ia && pedirConc && !aportaConc) conc = origConc;
    // Ninguna casilla aporta y sin contradicciones: sellar en silencio con el
    // modo que tocaría (modoPrevio || 'PROPIO') y no abrir el panel.
    if (ia && !aportaDesc && !aportaConc && !concFallo && _senalesYaJustificadasD(d)) {
      sellarRevisionSilencioso(d.revision && d.revision.modo);
      setBusyMe(false);
      return;
    }
    // Sin opción por defecto (decisión del usuario 2026-10-15): en cada
    // casilla donde la IA propone algo distinto, el inspector elige entre su
    // texto y la propuesta. Donde no hay propuesta queda su texto.
    const sinCambio = (o, n) => !ia || _normTextoUI(o) === _normTextoUI(n);
    setRevisionPanel({
      ia, origDesc, origConc, iaDesc: desc, iaConc: conc,
      desc: origDesc, conc: origConc, justif: '',
      elDesc: sinCambio(origDesc, desc) ? 'propio' : null,
      elConc: sinCambio(origConc, conc) ? 'propio' : null,
      cambioDesc: pedirDesc, cambioConc: pedirConc, soloDatos,
      modoPrevio: d.revision && d.revision.modo,
      concFallo: ia && concFallo,
      // Las dos casillas llevan tope en acta: «se condensa» solo si el texto
      // del inspector no cabía (si no, salía también sobre una propuesta hecha
      // desde cero o que solo abrió párrafos).
      condensaDesc: esActa && !capacidadActa(origDesc, 'situacion').cabe,
      condensaConc: esActa && !capacidadActa(origConc, 'conclusiones').cabe,
    });
    // Desde Conclusiones el panel queda lejos: llevar la vista hasta él.
    setTimeout(() => {
      const el = document.getElementById('nv-revision');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    setTimeout(() => setBusyMe(false), 3000);
  }

  // Señales del chequeo local sobre lo que hay en el panel (los textos del
  // panel, las casillas del formulario).
  function _senalesPanel(p) {
    return _senalesTextoD(Object.assign({}, d, { actuacion: p.desc, obsConclusion: p.conc }));
  }

  // Solo las señales de coherencia piden justificación; las de forma avisan.
  function _senalesCoherencia(senales) {
    return senales.filter(s => s.tipo !== 'forma');
  }

  function cerrarRevision() {
    const p = revisionPanel;
    if (!p || !p.elDesc || !p.elConc) return;            // falta elegir: el botón ya está deshabilitado
    const senales = _senalesCoherencia(_senalesPanel(p));
    const justif = (p.justif || '').trim();
    if (senales.length && justif.length < 20) return;
    // Modo (regla 2026-10-17): IA = eligió la propuesta en alguna casilla
    // revisada (aunque luego la editara). Si no, se conserva el modo del
    // sello anterior —los campos no revisados ya estaban revisados con él—;
    // sin sello anterior, PROPIO. Sin propuesta de la IA → LOCAL.
    // Solo cambiaron los datos: no se llamó a la IA a propósito, no es LOCAL.
    const modo = p.soloDatos ? (p.modoPrevio || 'PROPIO')
      : !p.ia ? 'LOCAL'
      : (p.elDesc === 'ia' || p.elConc === 'ia') ? 'IA'
      : (p.modoPrevio || 'PROPIO');
    setCampo('actuacion', p.desc);
    setCampo('obsConclusion', p.conc);
    const hoy = new Date();
    setCampo('revision', {
      modo, huella: huellaRevision(p.desc, p.conc, _infraccionSoloCatalogo(d.infraccion), camposRevision(d)),
      partes: partesRevision(p.desc, p.conc, _infraccionSoloCatalogo(d.infraccion), camposRevision(d)),
      // Los textos sellados viajan en el borrador local (no en BD: el sello
      // que guarda `_revisionParaGuardar` es solo modo + huella): permiten
      // detectar el retoque menor la próxima vez.
      textos: { desc: p.desc, conc: p.conc },
      // Las contradicciones que quedan justificadas con este sello.
      senales: senales.map(s => s.id + '|' + s.donde),
      fecha: String(hoy.getDate()).padStart(2, '0') + '/' + String(hoy.getMonth() + 1).padStart(2, '0') +
        '/' + hoy.getFullYear(),
      nombre: '',
    });
    setCampo('revisionJustif', senales.length ? justif : '');
    setRevisionPanel(null);
  }

  // Dictado por voz para la descripción (antes compartía barra con «Revisar»).
  function _botonDictar() {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {dictando && (
          <span style={{ fontSize: 13, color: 'var(--rojo)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rojo)',
              display: 'inline-block', animation: 'pulsar 1s infinite' }} />
            Grabando…
          </span>
        )}
        <_BtnAccion onClick={toggleDictado} aria-pressed={dictando}>
          {dictando ? 'Detener dictado' : 'Dictar'}
        </_BtnAccion>
      </span>
    );
  }

  // Un solo «Revisar», al final del formulario (decisión del usuario
  // 2026-10-15): revisa la descripción y las conclusiones con todo lo
  // diligenciado, y propone las conclusiones si el inspector no escribió.
  // Antes había un botón en la descripción y otro en Conclusiones que hacían
  // lo mismo.
  function _bloqueRevision() {
    const vigente = _revisionVigenteD(d);
    const esActa = documentoVisita(d.documento) === 'ACTA';
    const doc = esActa ? 'el acta' : 'el informe';
    const MODO_TXT = { IA: 'con la propuesta', PROPIO: 'con tu texto', LOCAL: 'sin propuesta (el servicio no respondió)' };
    // Revisado pero más largo de lo que cabe en el acta (revisado antes del
    // tope, o editado después): revisar otra vez para que la propuesta ajuste.
    const noCabe = esActa && (!capacidadActa(d.actuacion, 'situacion').cabe ||
                              !capacidadActa(_conclusionesActaD(d), 'conclusiones').cabe);
    const estado = vigente && noCabe
      ? { tono: 'var(--rojo)', t: 'Revisado, pero no cabe en el acta. Revisa otra vez y elige la propuesta ajustada.' }
      : vigente
      ? { tono: 'var(--verde)', t: '✓ Revisado ' + (MODO_TXT[d.revision.modo] || '') + (d.revision.fecha ? ' · ' + d.revision.fecha : '') }
      : d.revision
        ? { tono: 'var(--texto)', t: 'Cambió el texto, la tipificación o una casilla después de revisar: revisa otra vez antes de generar ' + doc + '.' }
        : { tono: 'var(--texto-suave)', t: 'Sin revisar. Hace falta para generar ' + doc + '.' };
    return (
      // Sin caja: va dentro de la tarjeta de la sección (era tarjeta dentro de
      // tarjeta). Una línea arriba lo separa de los campos.
      <div id="nv-revisar-bloque" style={{
        gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
        paddingTop: 14, borderTop: '1px solid var(--line)',
        scrollMarginTop: 'calc(var(--nv-header-h, 0px) + 12px)',
      }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          {/* Con informe el título de la sección ya lo dice. */}
          {esActa && <div style={{ fontWeight: 600, fontSize: 15 }}>Revisión del texto</div>}
          <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginTop: 2 }}>
            {esActa
              ? 'Revisa la situación encontrada y las conclusiones con todo lo diligenciado. Te propone una versión de cada una —y la conclusión, si no escribiste— y tú eliges.'
              : 'Revisa la situación encontrada con todo lo diligenciado. Te propone una versión y tú eliges. Las conclusiones se escriben en el informe.'}
          </div>
          <div role="status" style={{ fontSize: 13, marginTop: 6, color: estado.tono, fontWeight: vigente ? 600 : 400 }}>
            {estado.t}
          </div>
        </div>
        <_BtnAccion busy={busyMejora} onClick={ejecutarRevision} style={{ minHeight: 44, minWidth: 120 }}>
          {busyMejora ? 'Revisando…' : 'Revisar'}
        </_BtnAccion>
      </div>
    );
  }

  // Panel de la revisión abierta. Por casilla: si la IA propone algo
  // distinto, dos tarjetas («Tu texto» / «Propuesta», sin la palabra IA en
  // pantalla) con el resumen de cambios y nada elegido; el inspector elige una
  // y la edita.
  // «Aplicar» solo se activa con las dos casillas elegidas. Debajo, las
  // señales del chequeo local: las de coherencia piden justificación, las de
  // forma solo avisan.
  function _panelRevision() {
    const p = revisionPanel;
    if (!p) return null;
    const senales = _senalesPanel(p);
    const coherencia = _senalesCoherencia(senales);
    // Las de forma hablan del texto propio: solo con «Usar mi texto» elegido
    // (antes de elegir repetían lo que el resumen de la propuesta ya explica).
    const forma = senales.filter(s => s.tipo === 'forma' &&
      (s.donde === 'conclusion' ? revisionPanel.elConc : revisionPanel.elDesc) === 'propio');
    const justifOk = !coherencia.length || (p.justif || '').trim().length >= 20;
    const elegidas = !!(p.elDesc && p.elConc);
    const set = (k, v) => setRevisionPanel(prev => prev ? Object.assign({}, prev, { [k]: v }) : prev);
    const elegir = (k, elKey, cual, texto) =>
      setRevisionPanel(prev => prev ? Object.assign({}, prev, { [k]: texto, [elKey]: cual }) : prev);
    // Conclusiones vacías y sin propuesta también se muestran si hay algo que
    // decir: la propuesta falló.
    const esActaP = documentoVisita(d.documento) === 'ACTA';
    // Con informe técnico no hay casilla de conclusiones que revisar.
    const hayConc = esActaP && !!(p.origConc.trim() || p.iaConc.trim() || p.concFallo);

    // Rediseño 2026-10-17 (maqueta propuesta-revision.html, aprobada): pasos
    // con su estado arriba, la tarjeta elegida se vuelve el editor en su sitio
    // (antes salía un tercer cuadro con el mismo texto) y la otra se pliega; el
    // espacio del acta va en el pie de cada tarjeta para comparar las dos.
    // En «Tu texto», las expresiones de IA van tachadas (decisión del usuario
    // 2026-10-17): solo se nota, no bloquea nada y el texto guardado no cambia.
    const tachado = t => {
      const expr = expresionesIA(t);
      if (!expr.length) return String(t || '');
      const partes = [];
      let pos = 0;
      expr.forEach((x, i) => {
        if (x.inicio > pos) partes.push(t.slice(pos, x.inicio));
        partes.push(<del key={i} aria-label={'expresión de IA: ' + t.slice(x.inicio, x.fin)}>{t.slice(x.inicio, x.fin)}</del>);
        pos = x.fin;
      });
      if (pos < t.length) partes.push(t.slice(pos));
      return partes;
    };

    function medidor(texto, celda) {
      if (!esActaP) return null;
      const c = capacidadActa(texto, celda);
      const pct = Math.min(100, Math.round(c.renglones / c.max * 100));
      const cerca = c.cabe && c.renglones >= c.max - 2 && c.renglones > 0;
      return (
        <div className={'rv-acta' + (!c.cabe ? ' no' : cerca ? ' cerca' : '')} role="status">
          <span className="rv-barra" aria-hidden="true"><i style={{ width: pct + '%' }} /></span>
          <span>{c.renglones} de {c.max} renglones del acta</span>
          {!c.cabe && (
            <span className="rv-acta-no">
              No cabe: sobran ≈ {Math.abs(c.caracteres).toLocaleString('es-CO')} caracteres, que no saldrían en el PDF. Acórtalo antes de aplicar.
            </span>
          )}
        </div>
      );
    }

    // Una opción. Elegida → editor; la otra queda al lado, del mismo tamaño,
    // para seguir comparando (decisión del usuario 2026-10-17), y solo su botón
    // la recupera (un toque en la tarjeta perdería lo editado).
    function tarjeta(k, elKey, cual, texto, celda, resumen, avisos) {
      const el = p[elKey];
      const elegida = el === cual;
      const plegada = !!el && !elegida;
      const vacio = !String(texto || '').trim();
      const usar = plegada ? 'Usar este'
        : cual === 'ia' ? 'Usar la propuesta' : (vacio ? 'Escribir la mía' : 'Usar mi texto');
      const exprIA = cual === 'propio' && !vacio && !elegida ? expresionesIA(texto) : [];
      return (
        <article className={'rv-op' + (elegida ? ' elegida' : '') + (plegada ? ' plegada' : '')}>
          <div className="rv-op-cab">
            <strong>{cual === 'ia' ? 'Propuesta' : 'Tu texto'}</strong>
            {elegida
              ? <span className="rv-elegida">✓ Queda este</span>
              : <button type="button" className="rv-usar" onClick={() => elegir(k, elKey, cual, texto)}>{usar}</button>}
          </div>
          {resumen && resumen.length > 0 && (
            <ul className="rv-cambia">
              {resumen.map((r, i) => <li key={i} className={r.tipo === 'pierde' ? 'pierde' : ''}>{r.texto}</li>)}
            </ul>
          )}
          {elegida ? (
            <TextAreaNV className="rv-txt" autoAlto rows={3} value={p[k]} onChange={v => set(k, v)}
              aria-label={(celda === 'conclusiones' ? 'Conclusiones' : 'Situación encontrada') + ': texto que queda'}
              placeholder={celda === 'conclusiones' ? 'Escribe la conclusión de la visita y la recomendación.' : ''} />
          ) : (
            <div className="rv-txt">
              {vacio
                ? <span className="rv-vacio">{celda === 'conclusiones' ? 'No escribiste conclusiones.' : 'Sin texto.'}</span>
                : (cual === 'propio' ? tachado(texto) : texto)}
            </div>
          )}
          {exprIA.length > 0 && <div className="rv-nota">Lo tachado son expresiones típicas de textos generados por IA.</div>}
          {elegida && avisos.map(s => <div key={s.id + s.donde} className="rv-forma">{s.mensaje}</div>)}
          {medidor(elegida ? p[k] : texto, celda)}
        </article>
      );
    }

    function bloque(id, titulo, k, elKey, orig, ia, celda, cambio, condensa) {
      const el = p[elKey];
      const hayPropuesta = p.ia && _normTextoUI(ia) !== _normTextoUI(orig);
      const desdeDatos = celda === 'conclusiones' && !orig.trim() && hayPropuesta;
      const sub = desdeDatos ? 'No escribiste: la propuesta sale de lo diligenciado'
        : hayPropuesta || (celda === 'conclusiones' && p.concFallo) ? ''
        : !cambio && d.revision ? 'Sin cambios desde la última revisión'
        : p.ia ? 'Sin cambios propuestos' : '';
      // Las de forma hablan del texto propio: solo bajo «Tu texto» elegido.
      const avisos = forma.filter(s => (s.donde === 'conclusion') === (celda === 'conclusiones'));
      const capOrig = capacidadActa(orig, celda);
      const capIa = capacidadActa(ia, celda);
      return (
        <div className="rv-bloque" id={id}>
          <div className="rv-btit"><h3>{titulo}</h3>{sub && <span>{sub}</span>}</div>
          {celda === 'conclusiones' && p.concFallo && (
            <p className="rv-aviso">No se pudo proponer la conclusión (el servicio no respondió). Escribe la tuya o vuelve a revisar en unos minutos.</p>
          )}
          {esActaP && hayPropuesta && !el && !capOrig.cabe && (
            <p className={'rv-aviso' + (capIa.cabe ? '' : ' no')}>
              {'Tu texto no cabe en el acta. ' + (capIa.cabe ? 'La propuesta está ajustada para que quepa.' : 'La propuesta tampoco cabe: acórtala antes de aplicar.')}
            </p>
          )}
          <div className={'rv-ops' + (!hayPropuesta ? ' sola' : '')}>
            {tarjeta(k, elKey, 'propio', orig, celda, null, avisos)}
            {hayPropuesta && tarjeta(k, elKey, 'ia', ia, celda, resumenCambios(orig, ia, { condensa }), [])}
          </div>
        </div>
      );
    }

    const nDatos = coherencia.length;
    const etiquetaDatos = nDatos > 1 ? nDatos + ' datos no cuadran' : '1 dato no cuadra';
    const irA = id => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    const pasos = [
      { id: 'rv-b-sit', l: 'Situación encontrada', ok: !!p.elDesc },
      hayConc && { id: 'rv-b-con', l: 'Conclusiones', ok: !!p.elConc },
      nDatos > 0 && { id: 'rv-b-dat', l: justifOk ? 'Datos explicados' : etiquetaDatos, ok: justifOk, mal: !justifOk },
    ].filter(Boolean);
    const falta = [
      !p.elDesc && 'elegir la situación encontrada',
      !p.elConc && 'elegir las conclusiones',
      !justifOk && ((p.justif || '').trim() ? 'explicar por qué (mínimo 20 caracteres)' : 'resolver ' + (nDatos > 1 ? nDatos + ' datos' : '1 dato')),
    ].filter(Boolean);
    const dejar = !!(p.dejar || (p.justif || '').trim());
    return (
      <section id="nv-revision" className="rv" aria-label="Revisión del texto">
        <header className="rv-cab">
          <div>
            {/* Con informe el título de la sección ya lo dice. */}
            {esActaP && <h2>Revisión del texto</h2>}
            <p>
              {p.ia
                ? 'Elige en cada casilla qué texto queda. El que elijas se puede editar aquí mismo.'
                : p.soloDatos
                ? 'Los textos no cambiaron desde la última revisión: solo queda explicar por qué cuadran con las casillas.'
                : 'No hubo propuesta (el servicio no respondió): la revisión se cierra solo con el chequeo de la app.'}
            </p>
          </div>
          {pasos.length > 1 && (
            <ol className="rv-pasos" aria-label="Pasos de la revisión">
              {pasos.map(s => (
                <li key={s.id}>
                  <button type="button" className={s.ok ? 'ok' : s.mal ? 'mal' : ''} onClick={() => irA(s.id)}>{s.l}</button>
                </li>
              ))}
            </ol>
          )}
        </header>
        {bloque('rv-b-sit', 'Situación encontrada', 'desc', 'elDesc', p.origDesc, p.iaDesc, 'situacion', p.cambioDesc !== false, p.condensaDesc)}
        {hayConc && bloque('rv-b-con', 'Conclusiones', 'conc', 'elConc', p.origConc, p.iaConc, 'conclusiones', p.cambioConc !== false, p.condensaConc)}
        {nDatos > 0 && (
          <div className="rv-bloque" id="rv-b-dat">
            <div className="rv-btit">
              <h3>{nDatos > 1 ? nDatos + ' datos no cuadran entre sí' : 'Un dato no cuadra con otro'}</h3>
              <span>Corrige uno de los dos, o déjalo así y explica por qué</span>
            </div>
            <ul className="rv-datos">
              {coherencia.map(s => (
                <li key={s.id + s.donde}>
                  <p>{s.mensaje}</p>
                  {s.rapida ? (
                    // Pregunta de un toque (2026-10-26): «No» deja el dato como
                    // está y llena la justificación, que se puede editar.
                    <div className="rv-ir-fila">
                      <button type="button" className="rv-ir" onClick={() => {
                        const actual = (p.justif || '').trim();
                        set('dejar', true);
                        if (actual.indexOf(s.rapida.justificacion) < 0) {
                          set('justif', actual ? actual + ' ' + s.rapida.justificacion : s.rapida.justificacion);
                        }
                      }}>{s.rapida.no}</button>
                      <button type="button" className="rv-ir" onClick={() => _irASeccion('Tipificación y medidas')}>{s.rapida.si}</button>
                    </div>
                  ) : (SECCIONES_SENAL[s.id] || []).length > 0 && (
                    <div className="rv-ir-fila">
                      {SECCIONES_SENAL[s.id].map(sec => (
                        <button key={sec} type="button" className="rv-ir" onClick={() => _irASeccion(sec)}>Ir a {sec}</button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!dejar ? (
              <button type="button" className="rv-dejar" onClick={() => set('dejar', true)}>Dejarlo así</button>
            ) : (
              <div className="rv-justif">
                <label htmlFor="rv-justif">Por qué el acta sale así</label>
                <TextAreaNV id="rv-justif" className="rv-justif-txt" autoAlto rows={2} value={p.justif} onChange={v => set('justif', v)}
                  placeholder="Ej.: La losa nueva requiere licencia; el resto es reparación locativa." />
                <p>No va en el acta: queda en el registro de la visita. Mínimo 20 caracteres.</p>
              </div>
            )}
          </div>
        )}
        <footer className="rv-pie">
          <span className="rv-falta">
            {falta.length
              ? <>Falta: {falta.map((f, i) => <React.Fragment key={f}>{i > 0 && ' · '}<b>{f}</b></React.Fragment>)}</>
              : 'Todo listo.'}
          </span>
          <button type="button" className="rv-cancelar" onClick={() => setRevisionPanel(null)}>Cancelar</button>
          <button type="button" className="rv-aplicar" onClick={cerrarRevision} disabled={!elegidas || !justifOk}>Aplicar revisión</button>
        </footer>
      </section>
    );
  }

  // ── Dictado por voz (Web Speech API) ───────────────────────
  // recognitionRef se declara arriba (antes del early return) para evitar React #310.

  function toggleDictado() {
    // Si ya está dictando, detener
    if (dictando && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    // Verificar soporte
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      appAlert('Tu navegador no soporta dictado por voz. Usa Chrome o Edge.', { tono: 'aviso', titulo: 'Sin soporte' });
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'es-CO';
    rec.continuous = true;
    rec.interimResults = false;
    recognitionRef.current = rec;

    rec.onresult = (ev) => {
      let texto = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) {
          texto += ev.results[i][0].transcript;
        }
      }
      if (texto) {
        // Añadir al final del texto existente con espacio
        setD(prev => ({
          ...prev,
          actuacion: (prev.actuacion ? prev.actuacion + ' ' : '') + texto.trim(),
        }));
      }
    };
    rec.onerror = (ev) => {
      console.warn('[Dictado] error:', ev.error);
      if (ev.error !== 'aborted') {
        appAlert('Error de dictado: ' + ev.error, { tono: 'error', titulo: 'Dictado' });
      }
      setDictando(false);
      recognitionRef.current = null;
    };
    rec.onend = () => {
      setDictando(false);
      recognitionRef.current = null;
    };

    rec.start();
    setDictando(true);
  }

  // ── Consultar norma POT ────────────────────────────────────
  // Cliente puro (turf.js + GeoJSONs en GitHub, igual que producción).
  // Acepta lat/lon opcionales para encadenarse tras geocoding sin
  // depender del state batched de React.
  // «Consultar» de Ubicación: catastro y POT juntos para el punto
  // actual. Sin coordenadas avisa una sola vez (cada función avisaría aparte).
  async function consultarNorma() {
    if (d.lat == null || d.lon == null || d.lat === '' || d.lon === '') {
      await appAlert('Necesitas coordenadas primero: captura tu ubicación o toca el predio en el mapa.', { tono: 'aviso', titulo: 'Sin GPS' });
      return;
    }
    await Promise.all([ejecutarBusquedaCatastral(), ejecutarPOT()]);
  }

  async function ejecutarPOT(latArg, lonArg) {
    const lat = (latArg != null) ? latArg : d.lat;
    const lon = (lonArg != null) ? lonArg : d.lon;
    if (lat == null || lon == null) {
      await appAlert('Necesitas coordenadas primero. Usa "Buscar coordenadas".', { tono: 'aviso', titulo: 'Sin GPS' });
      return;
    }
    setBusyPOT(true);
    setConsultaFallida(false);
    try {
      const r = await consultarPOT(lat, lon);
      // Siempre, aunque venga vacío: si el punto se movió a rural o fuera de la
      // capa, el polígono del punto anterior quedaría pegado.
      setCampo('poligono', r.poligono || '');
      if (r.sueloProt)      setCampo('sueloProt', r.sueloProt);   // 'SI' | 'NO'
      if (r.amenaza)        setCampo('amenaza',   r.amenaza);     // 'SI' | 'NO'
      if (r.enRetiro)       setCampo('quebrada',  r.enRetiro);    // 'SI' | 'NO'
      _aplicarRefPOT(lat, lon, r);   // R11: las dos casillas quedan del POT
      // Barrio sugerido — intentar hacer match con la lista y actualizar comuna
      // El barrio del POT prima sobre lo diligenciado a mano: el polígono
      // manda, el inspector pudo elegir mal en el desplegable. Solo se
      // respeta lo escrito cuando el punto no cae en ninguna capa.
      if (r.barrioSugerido) {
        const match = _barrioDeLista(r.barrioSugerido, r.ambito === 'Rural');
        setCampo('barrio', match || r.barrioSugerido.trim());
        setBarrioDelPot(match || r.barrioSugerido.trim());
        setEditandoBarrio(false);
        // La comuna del punto (capa Comunas) antes que la de la lista: un
        // barrio partido entre dos comunas (Guasimalito) no tiene una sola.
        const com = r.comuna || (match && _BARRIO_A_COMUNA[match.toUpperCase()]);
        if (com) setCampo('comuna', com);
      }
    } catch (e) {
      // Sin conexión: no interrumpir al inspector. «Reintentar» del panel
      // «Predio» vuelve a consultar al volver la señal.
      setConsultaFallida(true);
      if (navigator.onLine) {
        await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Consulta POT' });
      } else {
        console.warn('[POT] sin conexión, consulta diferida:', e.message);
      }
    }
    setBusyPOT(false);
  }

  // ── Búsqueda catastral por GPS ────────────────────────────
  // `puntoNuevo`: la ubicación cambió (GPS o mapa), así que la ficha elegida
  // para el punto anterior ya no aplica — sin borrarla quedaba pegada cuando el
  // punto nuevo cae en varias fichas (hay que elegir) o en ninguna. El botón
  // manual re-busca el mismo punto y no la toca.
  // `opts.ignorarDireccion`: el inspector eligió el predio del pin aunque la
  // dirección caiga en otro («Es este» en el predio del pin).
  async function ejecutarBusquedaCatastral(latArg, lonArg, puntoNuevo, opts) {
    const lat = (latArg != null) ? latArg : d.lat;
    const lon = (lonArg != null) ? lonArg : d.lon;
    if (lat == null || lon == null) {
      await appAlert('Necesitas coordenadas primero. Usa "Buscar coordenadas" o "Mi ubicación".', { tono: 'aviso', titulo: 'Sin GPS' });
      return;
    }
    if (puntoNuevo) {
      setCampo('catastral', '');
      setCampo('ficha', '');
    }
    setBusyCat(true);
    setConsultaFallida(false);
    setCatRes(null);
    setPredioMunicipal(false);   // reset al iniciar nueva búsqueda
    try {
      let res = await buscarCatastroGPS(lat, lon);
      // Si el pin coincide con el predio de la dirección (dentro o a ≤ 10 m:
      // en la calle o en el lindero del vecino), la ficha es la del predio de
      // la dirección y no la del terreno bajo el pin (Fase 0 del plan).
      if (!(opts && opts.ignorarDireccion) && typeof compararUbicacion === 'function') {
        const c = compararUbicacion(terrenosDirRef.current, lat, lon);
        if (c.estado === 'coincide' && c.tcod) {
          const delPredio = res.filter(r => r.terrenoCodigo === c.tcod);
          res = delPredio.length ? delPredio : await fichasCatastroTerreno(c.tcod);
          fichaAplicadaRef.current = c.tcod;
        }
      }
      // Flag municipal: SIEMPRE se setea si alguna ficha del predio
      // pertenece al Municipio de Bello, sin importar cuántas fichas haya.
      // Crítico para que la sugerencia A3 funcione también en predios
      // de 1 sola ficha (la mayoría).
      const esMunicipal = res.some(r => r.municipal);
      setPredioMunicipal(esMunicipal);

      // Al abrir, lo guardado manda: se muestra la ficha guardada si está en
      // el predio y nunca se reescribe el código ni se avisa nada.
      const guardada = opts && opts.alAbrir && d.catastral &&
        res.find(r => r.catastral === d.catastral);
      // Guardada como PH sin unidad: vuelve la lista de unidades de ese predio.
      const phSinUnidad = opts && opts.alAbrir && esCodigoPredioMatriz(d.catastral) &&
        res.filter(r => r.terrenoCodigo === String(d.catastral).trim().slice(0, 21));
      if (guardada) {
        setCatRes([guardada]);
      } else if (phSinUnidad && phSinUnidad.length > 1) {
        setCatRes(phSinUnidad);
      } else if (opts && opts.alAbrir && (d.catastral || !res.length)) {
        // código escrito a mano fuera de este predio, o el punto sin predio
      } else if (!res.length) {
        // Solo avisar si fue invocado manualmente con conexión.
        // Tras GPS auto-disparado y sin red, esto sería ruido.
        if (navigator.onLine) {
          await appAlert('La ubicación GPS no cae dentro de ningún predio registrado en el catastro 2026 de Bello.', { tono: 'aviso', titulo: 'Sin resultados' });
        }
      } else if (res.length === 1) {
        setCampo('catastral', res[0].catastral);
        setCampo('ficha', String(res[0].ficha));
        // También a la vista con una sola ficha: sin la tarjeta el inspector
        // no distinguía «encontró» de «no hizo nada».
        setCatRes(res);
      } else if (!_preseleccionarUnidad(res)) {
        // En propiedad horizontal puede haber muchas unidades en el mismo polígono.
        // Sin tope: el inspector debe poder ver todas y elegir.
        setCatRes(res);
      }
    } catch (e) {
      // Sin conexión, el catastro.json no se pudo cargar — el inspector
      // puede llenar manualmente catastral/ficha y dejar la consulta
      // catastral para cuando vuelva la señal.
      setConsultaFallida(true);
      if (navigator.onLine && !(opts && opts.alAbrir)) {
        await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Catastro' });
      } else {
        console.warn('[Catastro] sin conexión, consulta diferida:', e.message);
      }
    }
    setBusyCat(false);
  }

  // Dirección con unidad (`AP 402`) que calza con una sola ficha: se deja
  // elegida (el inspector la ve en la ficha y la puede cambiar). Devuelve
  // true si eligió.
  function _preseleccionarUnidad(res) {
    const cat = predioDir && predioDir.fichaUnidad;
    const u = cat && res.find(r => r.catastral === cat);
    if (!u) return false;
    setCampo('catastral', u.catastral);
    setCampo('ficha', String(u.ficha));
    setCatRes([u]);
    return true;
  }

  // Fichas del terreno de la dirección (pin en la calle o en el vecino, o
  // todavía sin pin). Mismo reparto que ejecutarBusquedaCatastral: una ficha
  // se llena sola, varias (PH) se listan para elegir.
  async function _aplicarFichasTerreno(tcod) {
    try {
      const res = await fichasCatastroTerreno(tcod);
      if (!res.length) return;
      const esMunicipal = res.some(r => r.municipal);
      setPredioMunicipal(esMunicipal);
      if (res.length === 1) {
        setCampo('catastral', res[0].catastral);
        setCampo('ficha', String(res[0].ficha));
        setCatRes(res);
      } else if (!_preseleccionarUnidad(res)) {
        setCampo('catastral', '');
        setCampo('ficha', '');
        setCatRes(res);
      }
    } catch (e) {
      console.warn('[Predio] fichas del terreno:', e.message);
    }
  }

  // Pone el pin dentro del predio de la dirección (punto interior garantizado)
  // y re-consulta POT y catastro, como cualquier otro cambio de punto.
  function _pinEnPredioDireccion(tcod) {
    const t = terrenosDir.find(x => x.tcod === tcod) || terrenosDir[0];
    if (!t) return;
    const q = puntoInteriorAnillo(t.anillo);
    if (!q) return;
    _detenerGeoWatch(); setBusyGeo(false); setGpsAccuracy(null);
    setCampo('lat', q[0]); setCampo('lon', q[1]);
    setCampo('origenPunto', 'DIRECCION');
    ejecutarPOT(q[0], q[1]);
    ejecutarBusquedaCatastral(q[0], q[1], true);
  }

  // «Es este» en el predio del pin. La dirección de la visita NO se toca
  // (decisión del usuario 2026-09-30): se deja constancia de la elección
  // (ubicPreferirPunto) para no volver a preguntar mientras el punto y la
  // dirección sigan iguales.
  function usarPredioPunto() {
    const lat = d.lat, lon = d.lon;
    setCampo('ubicPreferirPunto', { lat: lat, lon: lon, direccion: d.direccion });
    ejecutarBusquedaCatastral(lat, lon, true, { ignorarDireccion: true });
  }

  // Confirma juntos dirección, punto y ficha. También da por confirmada la
  // dirección («Confirmar dirección»): el inspector la está viendo en el resumen.
  function confirmarUbicacion() {
    setCampo('ubicConf', {
      origen: d.origenPunto || 'MAPA',
      lat: d.lat, lon: d.lon, direccion: d.direccion, catastral: d.catastral,
    });
    if (requiereDir) setDirConfirmada(true);
  }

  function seleccionarCatastral(item) {
    setCampo('catastral', item.catastral);
    setCampo('ficha', String(item.ficha));
    setCatRes([item]);   // queda a la vista la unidad elegida
  }

  // PH sin la unidad identificada: código del predio matriz y ficha vacía.
  // La lista de unidades se conserva para poder volver a elegir.
  function confirmarSinUnidad() {
    const tcod = catResultados && catResultados[0] && catResultados[0].terrenoCodigo;
    const cod = codigoPredioMatriz(tcod);
    if (!cod) return;
    setCampo('catastral', cod);
    setCampo('ficha', '');
  }

  // ── Geolocalización progresiva del dispositivo ─────────────
  // Usa watchPosition para refinar la precisión en tiempo real.
  // Acepta automáticamente cuando la precisión es ≤8m, o el usuario
  // puede aceptar manualmente tocando "✓ Usar esta ubicación".
  // Timeout global de 30s si no se alcanza buena precisión.
  function _detenerGeoWatch() {
    if (geoWatchRef.current != null) {
      navigator.geolocation.clearWatch(geoWatchRef.current);
      geoWatchRef.current = null;
    }
    // Matar también el timeout de 30s — si sobrevive al watch, vuelve a
    // aceptar coordenadas que el inspector ya canceló o ya corrigió.
    if (geoTimeoutRef.current != null) {
      clearTimeout(geoTimeoutRef.current);
      geoTimeoutRef.current = null;
    }
  }
  function _aceptarCoordenadas(lat, lon, acc) {
    _detenerGeoWatch();
    setBusyGeo(false);
    // Redondear aquí y no en cada llamador: el aceptar manual pasaba el float
    // crudo del GPS y el badge salía "±12.3456789m".
    setGpsAccuracy(acc != null && isFinite(acc) ? Math.round(acc) : null);
    setCampo('lat', lat);
    setCampo('lon', lon);
    setCampo('origenPunto', 'GPS');
    ejecutarPOT(lat, lon);
    ejecutarBusquedaCatastral(lat, lon, true);
  }
  async function usarMiUbicacion() {
    if (!navigator.geolocation) {
      await appAlert('Tu dispositivo no soporta geolocalización.', { tono: 'aviso', titulo: 'GPS' });
      return;
    }
    // Si ya hay un watch corriendo, detenerlo y aceptar lo que haya
    if (geoWatchRef.current != null) {
      // El usuario tocó "✓ Usar esta ubicación" — aceptar coordenadas actuales
      // (antes solo detenía el watch sin disparar POT/catastro; el auto-accept
      // a ≤8m y el timeout de 30s sí lo hacían, dejando este camino inconsistente)
      const mejor = mejorPosGeoRef.current;
      _detenerGeoWatch();
      if (mejor && mejor.lat != null) {
        _aceptarCoordenadas(mejor.lat, mejor.lon, mejor.acc);
      } else {
        setBusyGeo(false);
      }
      return;
    }
    setBusyGeo(true);
    setGpsAccuracy(null);
    var mejorPos = { lat: null, lon: null, acc: Infinity };
    mejorPosGeoRef.current = null;
    geoTimeoutRef.current = setTimeout(function() {
      geoTimeoutRef.current = null;   // ya disparó: nada que cancelar
      // Timeout 30s: aceptar la mejor lectura o fallar
      if (mejorPos.lat != null) {
        _aceptarCoordenadas(mejorPos.lat, mejorPos.lon, mejorPos.acc);
      } else {
        _detenerGeoWatch();
        setBusyGeo(false);
        appAlert('Tiempo de espera agotado. Intenta en un lugar con mejor señal GPS.', { tono: 'aviso', titulo: 'GPS' });
      }
    }, 30000);
    var watchId = navigator.geolocation.watchPosition(
      function(pos) {
        var lat = pos.coords.latitude;
        var lon = pos.coords.longitude;
        var acc = pos.coords.accuracy; // metros
        // Solo actualizar si esta lectura es mejor que la anterior
        if (acc < mejorPos.acc) {
          mejorPos = { lat: lat, lon: lon, acc: acc };
          mejorPosGeoRef.current = mejorPos;
          setGpsAccuracy(Math.round(acc));
          // Mostrar coordenadas en tiempo real (sin disparar POT/catastro aún)
          setCampo('lat', lat);
          setCampo('lon', lon);
        }
        // Auto-aceptar cuando la precisión es suficiente (≤8 metros).
        // El clearTimeout lo hace _detenerGeoWatch() dentro de _aceptarCoordenadas.
        if (acc <= 8) {
          _aceptarCoordenadas(lat, lon, Math.round(acc));
        }
      },
      function(err) {
        _detenerGeoWatch();   // detiene watch + timeout
        setBusyGeo(false);
        var msg = err.code === 1 ? 'Permiso de ubicación denegado. Habilítalo en los ajustes del navegador.' :
                  err.code === 2 ? 'GPS no disponible. Verifica que la ubicación esté encendida y estás al aire libre.' :
                  err.code === 3 ? 'Tiempo de espera agotado. Intenta en un lugar con mejor señal.' :
                  'No se pudo obtener ubicación.';
        appAlert(msg, { tono: 'aviso', titulo: 'GPS' });
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
    geoWatchRef.current = watchId;
  }

  // ── Validaciones mínimas antes de guardar ──────────────────
  function _validar() {
    const errs = [];
    const radicadoEfectivo = d.esOficio ? radicadoDeOficio(d.radicado, d.orden, d.nVisita) : d.radicado;
    if (!radicadoEfectivo) errs.push(d.esOficio ? 'N° de orden de policía' : 'Radicado');
    if (!d.direccion)      errs.push('Dirección');
    if (!d.comuna)         errs.push('Comuna');
    if (!d.fechaVisita)    errs.push('Fecha de visita');
    if (!d.visitador)      errs.push('Visitador');
    // Validaciones duras sobre la fecha de visita — capturan errores de tipeo
    // típicos cuando el inspector diligencia días después.
    if (d.fechaVisita) {
      const _hoy = _hoyISO();
      if (d.fechaVisita > _hoy) {
        errs.push('Fecha de visita no puede ser futura (hoy: ' + _isoAFecha(_hoy) + ')');
      } else if (!d.esOficio && d.fechaRadicado && d.fechaVisita < d.fechaRadicado) {
        errs.push('Fecha de visita anterior al radicado (radicado: ' + _isoAFecha(d.fechaRadicado) + ')');
      }
    }
    return errs;
  }

  // ── Guardar (un solo POST) ─────────────────────────────────
  async function guardar() {
    // Doble-tap defensivo: el disabled del botón llega tras el re-render;
    // un segundo toque en esa ventana podía lanzar dos POST 'agregar'.
    if (_guardandoRef.current) return;
    // Dirección sin confirmar (bautiza la carpeta de Drive en este guardado):
    // normalizar, llevar la fila a la vista y pedir la confirmación ahí mismo.
    // Solo el botón Guardar llega aquí — el autoguardado de 60 s hace su POST
    // propio y corre únicamente con filaEditando (carpeta ya existente), así
    // que nunca interfiere con este bloqueo.
    if (requiereDir && !dirConfirmada) {
      const n = normalizarDireccion(d.direccion);
      if (n && n !== d.direccion) setCampo('direccion', n);
      if (dirFilaRef.current) {
        dirFilaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dirFilaRef.current.classList.add('dir-conf-parpadeo');
        setTimeout(function() {
          if (dirFilaRef.current) dirFilaRef.current.classList.remove('dir-conf-parpadeo');
        }, 650);
      }
      if (dirBotonRef.current) dirBotonRef.current.focus();
      return;
    }
    const errs = _validar();
    if (errs.length) {
      await appAlert('Faltan campos:\n• ' + errs.join('\n• '), { tono: 'aviso', titulo: 'Datos incompletos' });
      return;
    }
    setGuard(true);
    setErrorGuardar('');
    try {
      // Resolver barrio final (si es "Otro", usar el texto libre)
      const barrioFinal = d.barrio === '__otro__' ? (barrioOtro || '') : d.barrio;
      // Quien inicia la visita (primer guardado: PENDIENTE/ASIGNADO → INICIADO)
      // queda de diligenciador, aunque estuviera asignada a otro. Después no se
      // toca: un co-asignado que la edite no se la quita al que la empezó.
      const esPrimerInicio = estadoVisita !== 'INICIADO' && estadoVisita !== 'COMPLETADO';
      const visitadorFinal = esPrimerInicio
        ? ponerDiligenciadorPrimero(d.visitador, _miVisitador())
        : d.visitador;
      const dFinal = { ...d, barrio: barrioFinal, visitador: visitadorFinal };

      // 1. Crear carpeta Drive si aún no existe
      let linkDrive = d.linkDrive || '';
      let idCarpetaVisita = d.idCarpetaVisita || '';
      let idCarpetaFotos  = d.idCarpetaFotos  || '';
      if (!linkDrive && d.comuna && d.direccion && d.fechaVisita) {
        try {
          const c = await crearCarpetaVisita(d.comuna, d.direccion, d.fechaVisita, d.nVisita || 1, {
            barrio:  barrioFinal,
            persona: d.atiendeNombre || '',
            lat:     d.lat  || '',
            lon:     d.lon  || '',
          });
          linkDrive       = c.linkCarpeta || '';
          idCarpetaFotos  = c.idFotos     || '';
          idCarpetaVisita = _idCarpetaDeLink(linkDrive);
        } catch (eDrive) {
          // No bloquear el guardado por error en Drive.
          console.warn('crearCarpeta:', eDrive);
          // QW16: mismo tipo de alerta explícita que ya existe para el camino
          // offline (r.encolado más abajo) — antes este caso fallaba en
          // silencio y el inspector solo lo notaba al intentar generar el
          // acta sin carpeta.
          await appAlert(
            'La visita se guardó, pero no se pudo crear la carpeta de Drive ' +
            '(' + (eDrive && eDrive.message ? eDrive.message : 'error de conexión') + ').\n\n' +
            'Vuelve a abrir la visita y toca "Guardar cambios" para reintentar la ' +
            'creación de la carpeta antes de generar acta o subir fotos.',
            { tono: 'aviso', titulo: 'Carpeta Drive no creada' }
          );
        }
      }

      // 2. Armar array de 60 valores
      const vals = _construirPayload(dFinal, 'INICIADO', linkDrive, datosIniciales);

      // 3. POST único — clientId para que AS deduplique reintentos offline
      const r = await guardarVisita({ valores: vals, fila: filaEditando, clientId, ultimaModConocida: dFinal.ultimaModConocida, radicadoConocido: _radicadoFilaRef.current, idVisita: _idVisitaRef.current, ubicacionConfirmada: _origenConfirmadoParaGuardar(dFinal), revisionTexto: _revisionParaGuardar(dFinal), documentoVisita: dFinal.documento || undefined, licenciaExtra: _licenciaExtraParaGuardar(dFinal), citadoVisita: _citadoParaGuardar(dFinal) });
      _radicadoFilaRef.current = String(vals[0] || '');
      if (r && r.idVisita) _idVisitaRef.current = String(r.idVisita);
      if (r && r.fila) setFE(r.fila);

      // 4. Actualizar state local con metadatos derivados
      setEstV('INICIADO');
      const nuevaModConocida = (r && r.ultimaModConocida) || dFinal.ultimaModConocida;
      const dPersistido = { ...dFinal, linkDrive, idCarpetaVisita, idCarpetaFotos, ultimaModConocida: nuevaModConocida };
      setD(prev => ({
        ...prev,
        barrio: barrioFinal,
        visitador: visitadorFinal,
        linkDrive,
        idCarpetaVisita,
        idCarpetaFotos,
        ultimaModConocida: nuevaModConocida,
      }));
      // Sincronizar el snapshot del autoguardado: este estado está "limpio"
      // hasta que el inspector vuelva a tocar un campo.
      _lastSavedRef.current = JSON.stringify({ d: _snapshotLimpia(dPersistido), b: barrioOtro });
      setUltimoGuardadoMs(Date.now());
      setDirty(false);
      if (r && r.encolado) setEnColaGuardado(true);

      if (r && r.encolado) {
        // Visita guardada en cola offline. Acta/RF/informe NO se pueden
        // generar hasta que sincronice (necesitan fila real + Drive).
        // La carpeta Drive tampoco se creó: cuando vuelva la señal, el
        // inspector debe reabrir la visita y tocar "Actualizar" para que
        // se cree la carpeta (la lógica actual de guardar lo hace solo).
        await appAlert(
          'Sin conexión: la visita quedó guardada en este dispositivo (#' + r.localId + ').\n\n' +
          'Se sincronizará automáticamente cuando vuelva la señal. ' +
          'Al recuperar conexión, vuelve a abrir la visita y toca "Guardar cambios" ' +
          'para crear la carpeta Drive y poder generar acta y subir fotos.',
          { tono: 'exito', titulo: 'Guardado local' }
        );
      } else {
        await appAlert(filaEditando
          ? 'Registro actualizado correctamente.'
          : 'Visita guardada. Ya puedes subir fotos y generar los documentos en «Entregables».',
          { tono: 'exito', titulo: 'Guardado' });
      }
    } catch (e) {
      setErrorGuardar(e && e.message ? e.message : 'error desconocido');
      await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error al guardar' });
    }
    setGuard(false);
  }

  // ── Generar acta F-GGO-46 ──────────────────────────────────
  // Construye el payload F-GGO-46 a partir del state del wizard.
  // Lo usan tanto el botón "Generar acta" (paso 1, Sheet caracterización)
  // como "Generar registro fotográfico" (paso 2, Doc RF con fotos).
  function _construirDatosF46() {
    const barrioFinal = d.barrio === '__otro__' ? (barrioOtro || '') : d.barrio;
    const relacionFinal = d.atiendeRelacion === 'Otro'
      ? (d.atiendeRelacionOtro || 'Otro')
      : (d.atiendeRelacion || '');
    const dirNotifFinal = d.dirNotifIgual ? (d.direccion || '') : (d.atiendeDir || '');
    return {
      radicado:       d.esOficio ? radicadoDeOficio(d.radicado, d.orden, d.nVisita) : d.radicado,
      // Oficio: no hay radicado externo previo, el campo de fecha de
      // radicado ni se muestra en el formulario — usar fecha de visita
      // (misma regla que _construirPayload al guardar en BD).
      fechaRadicado:  (d.esOficio && !_oficioSeguimiento(d)) ? _isoAFecha(d.fechaVisita) : _isoAFecha(d.fechaRadicado),
      fechaVisita:    _isoAFecha(d.fechaVisita),
      objetoVisita:   d.esOficio ? 'Inspección de oficio' : 'Atención de PQR',
      direccion:      d.direccion,
      barrio:         barrioFinal,
      comuna:         d.comuna,
      // Persona
      atiendeNombre:  d.noAtiende ? 'No se atiende / No suministra datos' : d.atiendeNombre,
      atiendeId:      d.noAtiende ? 'No se atiende / No suministra datos' : d.atiendeId,
      atiendeTel:     d.noAtiende ? 'No se atiende / No suministra datos' : (d.telNoAporta ? 'No aporta' : d.atiendeTel),
      atiendeRelacion: d.noAtiende ? '' : relacionFinal,
      atiendeDir:     d.noAtiende ? 'No se atiende / No suministra datos' : (d.dirNoAporta ? 'No aporta' : dirNotifFinal),
      atiendeEmail:   d.noAtiende ? 'No se atiende / No suministra datos' : (d.emailNoAporta ? 'No aporta' : d.atiendeEmail),
      // Licencia
      licenciaAportada: d.licenciaAportada || 'NO',
      licenciaN:       d.licencia,
      licenciaFecha:   _isoAFecha(d.fechaLicencia),
      licenciaTipo:    d.tipoLicencia,
      licenciaPisos:   d.pisos,
      licenciaDest:    d.destinaciones,
      licenciaCubierta:d.cubierta,
      licenciaSistema: d.sistema,
      licenciaObs:     d.obsLicencia || '',
      // Caracterización
      estadoObra:     d.estadoObra,
      // L25 de la plantilla dice «¿REQUIERE LICENCIA?» y el backend la llena
      // con este campo. Mandar la AA (reparación locativa) la invertía: obras
      // que requieren licencia salían «NO». Va la respuesta del formulario.
      repLocativa:    (d.reqLicencia || {}).respuesta || '',
      usos:          (d.usos || '') + (d.queFunciona ? ' - ' + d.queFunciona : ''),
      alturaP:        d.alturaPisos,
      destActuales:   d.destActuales,
      cubiertalActual:d.cubiertaActual,
      habitado:       d.habitado,
      situacion:      d.actuacion,
      catastral:      d.catastral,
      // PH sin la unidad identificada: el acta lo dice en vez de quedar en
      // blanco. Solo en el acta; en BD la ficha sigue vacía.
      ficha:          esCodigoPredioMatriz(d.catastral) && !d.ficha ? 'Sin identificar' : d.ficha,
      poligono:       d.poligono,
      amenaza:        d.amenaza,
      sueloProt:      d.sueloProt,
      retiroQuebrada: d.quebrada,
      // F36: «No se pudo determinar» va con su motivo.
      infraccion:     infraccionParaActa(_infraccionSoloCatalogo(d.infraccion),
                        (d.reqLicencia || {}).motivoIndeterminado),
      area:           _areaTexto(d),
      // A38: el texto revisado del inspector (comportamiento y área van en F36/F37).
      obsConclusion:  _conclusionesActaD(d),
      // Citación
      orden:          (d.orden && String(d.orden).trim()) ? d.orden : 'N/A',
      citacion:       d.noCitacion
        ? 'No se deja citación'
        : (d.citacionFecha
            ? (_isoAFecha(d.citacionFecha) + (d.citacionHora ? ' · ' + (HORAS_CITACION.find(h => h.val === d.citacionHora)?.l || d.citacionHora) : ''))
            : ''),
      // Inspectores firmantes: array con todos los seleccionados en
      // los chips "Visitador(es)". AS los expande en filas A47-A50 del
      // acta cruzando con USUARIOS para sacar el cargo.
      visitadores:    (d.visitador || '').split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean),
      // Fallback inspector / cargo del usuario logueado (compat con código viejo).
      inspector:      usuario?.usuario || '',
      cargo:          usuario?.cargo   || 'Inspector',
      // Carpeta de la visita
      idCarpetaVisita: d.idCarpetaVisita,
      idCarpetaFotos:  d.idCarpetaFotos,
      fila:            filaEditando,
      // El backend no escribe el link del acta/RF si en esa fila hay ya otro
      // radicado (fila corrida) — mismo control que `actualizar`.
      radicadoConocido: _radicadoFilaRef.current,
      idVisita: _idVisitaRef.current,
    };
  }

  // Recorrido único de las validaciones del acta. Devuelve dos cosas:
  // los campos que faltan (lista de {nombre, seccion}) y el conjunto de
  // secciones que declararon al menos un campo obligatorio aplicable al
  // estado actual — `req` registra la sección esté o no el campo, así el
  // indicador distingue «completa» de «sin obligatorios». Las reglas
  // condicionales (noAtiende, licencia, suspensión, citación) quedan
  // dentro: si el bloque no corre, la sección no declara obligatorios.
  // `opts.acta`: suma lo que solo exige el acta (que el texto quepa en sus
  // celdas); el informe no tiene tope.
  function _evaluarFormulario(opts) {
    const faltan = [];
    const seccionesConObligatorios = new Set();
    // Cada faltante viaja con la sección donde se diligencia. La sección
    // se declara una vez por bloque en vez de campo por campo: los bloques
    // ya siguen el orden del formulario. El texto debe ser el título
    // exacto de la sección (_Seccion) — es la llave de `estadosSeccion`.
    let sec = 'Identificación del caso';
    function req(cond, nombre) {
      seccionesConObligatorios.add(sec);
      if (!cond) faltan.push({ nombre: nombre, seccion: sec });
    }

    // Identificación
    if (d.esOficio) {
      // Seguimiento: el radicado es el de la 1ª visita; la orden no es obligatoria.
      if (!_oficioSeguimiento(d)) req(d.orden, 'N° Orden de policía');
    } else {
      req(d.radicado, 'Radicado');
      req(d.fechaRadicado, 'Fecha del radicado');
    }
    req(d.fechaVisita, 'Fecha de la visita');

    sec = 'Ubicación del inmueble';
    // Ubicación
    req(d.direccion, 'Dirección');
    req(d.barrio && d.barrio !== '__otro__', 'Barrio / Vereda');
    req(d.comuna, 'Comuna');
    req(d.lat != null && d.lon != null && d.lat !== '' && d.lon !== '' &&
        isFinite(Number(d.lat)) && isFinite(Number(d.lon)),
        'Coordenadas GPS (captúrala o toca el predio en el mapa)');
    // Dirección, punto y ficha confirmados juntos (panel «Predio» junto al
    // mapa). Guardar no lo exige; el acta y el informe sí (decisión 2026-09-29).
    req(ubicacionConfirmadaVigente(d.ubicConf, d),
        'Ubicación confirmada (dirección, punto y ficha catastral, junto al mapa)');

    // Norma POT (franja de Ubicación)
    req(d.catastral, 'Código catastral');
    // PH sin la unidad identificada: basta el código del predio (sin ficha).
    if (!esCodigoPredioMatriz(d.catastral)) req(d.ficha, 'N° ficha predial');
    req(d.poligono, 'Polígono de uso del suelo');
    req(d.amenaza, '¿Amenaza? (SI/NO)');
    req(d.sueloProt, '¿Suelo de protección? (SI/NO)');
    req(d.quebrada, '¿Dentro de retiro de quebrada? (SI/NO)');

    sec = 'Persona que atiende';
    // Persona que atiende (si se marcó "No se atiende", la sección
    // queda cerrada y estos campos no se diligencian — no bloquear).
    if (!d.noAtiende) {
      req(d.atiendeNombre, 'Nombre de la persona que atiende');
      req(d.atiendeId, 'Identificación de la persona que atiende');
      req(d.atiendeRelacion, 'Relación con el evento');
    }

    sec = 'Características de la edificación';
    // Características de la edificación
    req(d.estadoObra, 'Estado de la obra');
    req(d.habitado, 'Habitado');
    req(d.alturaPisos, 'Altura en pisos');
    req(d.destActuales, 'N° destinaciones actuales');
    req(d.usos, 'Usos actuales');
    req(d.cubiertaActual, 'Tipo cubierta actual');

    sec = 'Verificación documental';
    // Verificación documental
    faltantesRequiereLicencia(d.reqLicencia).forEach(function(f) { req(false, f); });
    req(d.licenciaAportada, '¿Se aportó licencia? (SI/NO)');
    if (d.licenciaAportada === 'SI') {
      req(d.licencia, 'N° de licencia');
      req(d.fechaLicencia, 'Fecha de expedición de la licencia');
      // Al menos un trámite (las modalidades son opcionales: la licencia de
      // urbanización, p. ej., no lleva ninguna).
      req(parsearTipoModalidad(d.tipoLicencia).tramites.length, 'Tipo de trámite de la licencia');
      req(d.pisos, 'Pisos aprobados');
      req(d.destinaciones, 'Destinaciones de licencia');
      req(d.cubierta, 'Cubierta de licencia');
      req(d.sistema, 'Sistema estructural');
    }

    sec = 'Descripción de la situación encontrada';
    // Descripción / conclusiones
    req(d.actuacion, 'Descripción de la situación encontrada');
    sec = 'Tipificación y medidas';
    req(_infraccionSoloCatalogo(d.infraccion), 'Tipo de contravención');
    req(d.area || d.areaNoMedible || d.areaNoAplica,
      'Área de contravención (m², "no aplica" o "no se pudo medir")');

    sec = 'Tipificación y medidas';
    // Reglas de coherencia que bloquean (fase 1, reglasBloqueoActa en
    // utils.js): contradicciones entre casillas que no se pasan con
    // justificación. Van como faltantes de esta sección.
    reglasBloqueoActa({
      infraccion: _infraccionSoloCatalogo(d.infraccion), areaNoAplica: d.areaNoAplica,
      repLocativa: d.repLocativa, licenciaAportada: d.licenciaAportada,
      estadoObra: d.estadoObra, suspension: d.suspension,
      sueloProt: d.sueloProt, quebrada: d.quebrada,
      requiereLicencia: formatearRequiereLicencia(d.reqLicencia).requiere,
    }).forEach(function(r) { req(false, r.mensaje); });

    // Suspensión / citación
    if (d.estadoObra !== 'Terminada') {
      req(d.suspension, '¿Se decreta suspensión?');
      if (d.suspension === 'SI') req(d.orden, 'N° Orden de policía');
    }
    if (!d.noCitacion) {
      req(d.citacionFecha, 'Fecha de citación (o marca "no se deja citación")');
      req(d.citacionHora,  'Hora de citación');
    }

    sec = 'Funcionarios que realizan la inspección';
    // Funcionarios
    req(d.visitador, 'Visitador(es) que realizan la inspección');

    // Conclusiones (sección 10): el texto es opcional; la revisión no.
    // Revisión obligatoria (docs/PROPUESTA_2026-10-14_coherencia-acta.md § 8):
    // la huella sellada al aplicar «Revisar» tiene que ser la de la
    // descripción, las conclusiones y los chips actuales. Bloquea acta,
    // regenerar e informe. Desde 2026-10-15 el botón está al final.
    sec = 'Conclusiones y revisión';
    if (d.actuacion) {
      req(_revisionVigenteD(d),
        d.revision ? 'Revisar el texto otra vez (cambió la descripción, las conclusiones, la tipificación o una casilla que revisa)'
                   : 'Revisión del texto (botón «Revisar» al final del formulario)');
    }

    // Lo que no cabe en la celda del acta sale cortado en el PDF: no se
    // genera un acta así. Fuera de `estadosSeccion` a propósito (el medidor
    // bajo la casilla ya lo dice). Solo si la visita va a acta.
    if (opts && opts.acta && documentoVisita(d.documento) === 'ACTA') {
      const cs = capacidadActa(d.actuacion, 'situacion');
      if (!cs.cabe) faltan.push({ seccion: 'Descripción de la situación encontrada',
        nombre: 'La descripción no cabe en el acta (sobran ≈ ' + Math.abs(cs.caracteres).toLocaleString('es-CO') +
          ' caracteres): pulsa «Revisar» para ajustarla' });
      const cc = capacidadActa(_conclusionesActaD(d), 'conclusiones');
      if (!cc.cabe) faltan.push({ seccion: 'Conclusiones y revisión',
        nombre: 'Las conclusiones no caben en el acta (sobran ≈ ' + Math.abs(cc.caracteres).toLocaleString('es-CO') +
          ' caracteres): pulsa «Revisar» para ajustarlas' });
      // Un marcador para completar («[área]», «__ m²») saldría tal cual en el
      // acta (2026-10-26): se completa el dato o se quita.
      const mDesc = marcadoresPendientes(d.actuacion);
      if (mDesc.length) faltan.push({ seccion: 'Descripción de la situación encontrada',
        nombre: 'La descripción tiene datos por completar (' + mDesc.slice(0, 3).join(', ') + '): escribe el dato o quítalo' });
      const mConc = marcadoresPendientes(d.obsConclusion);
      if (mConc.length) faltan.push({ seccion: 'Conclusiones y revisión',
        nombre: 'Las conclusiones tienen datos por completar (' + mConc.slice(0, 3).join(', ') + '): escribe el dato o quítalo' });
    }

    return { faltan: faltan, seccionesConObligatorios: seccionesConObligatorios };
  }

  // Los avisos de generar y regenerar el acta solo necesitan la lista de faltantes.
  function _validarAntesDeActa() {
    return _evaluarFormulario({ acta: true }).faltan;
  }

  // Aviso de lo que falta para `accion` ('generar el acta', 'regenerar el
  // acta', 'generar el informe'). La revisión del texto no es un campo: cuando
  // es lo único que falta se dice qué pasó y se lleva al bloque «Revisión del
  // texto» (2026-10-16; antes decía «faltan 1 campo(s) por diligenciar:
  // • Revisar el texto otra vez (…)» y no se entendía qué hacer).
  async function _avisarFaltantes(faltan, accion) {
    const esRevision = f => f.seccion === 'Conclusiones y revisión' && /^Revis/.test(f.nombre);
    const campos = faltan.filter(f => !esRevision(f));
    const faltaRevisar = faltan.length > campos.length;
    if (!campos.length) {
      const vencida = !!d.revision;
      await appAlert(
        (vencida
          ? 'Después de revisar el texto cambiaste la situación encontrada, las conclusiones, la tipificación ' +
            'o una casilla que la revisión tiene en cuenta (licencia, área, pisos, destinaciones o usos).'
          : 'El texto de la visita todavía no se ha revisado.') +
        '\n\nPulsa «Revisar» en «Revisión del texto», al final del formulario, y vuelve a ' + accion + '.',
        { tono: 'aviso', titulo: vencida ? 'Revisa el texto otra vez' : 'Falta revisar el texto', btnOk: 'Ir a «Revisar»' });
      const el = document.getElementById('nv-revisar-bloque') || document.getElementById('nv-revision');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setMostrarPendientes(true); // enciende los puntos ámbar de sección
    const lista = campos.slice(0, 20).map(f => '• ' + f.nombre + (f.seccion ? ' — ' + f.seccion : '')).join('\n');
    const extra = campos.length > 20 ? '\n… y ' + (campos.length - 20) + ' más' : '';
    await appAlert(
      'Para ' + accion + (campos.length === 1 ? ' falta este dato:' : ' faltan estos ' + campos.length + ' datos:') +
      '\n\n' + lista + extra +
      (faltaRevisar ? '\n\nDespués, pulsa «Revisar» al final del formulario.' : '') +
      '\n\nLas secciones con datos pendientes quedan marcadas con un punto ámbar. Complétalos, guarda y vuelve a intentarlo.',
      { tono: 'aviso', titulo: 'Faltan datos', btnOk: 'Volver al formulario' });
  }

  // Paso 1 del F-GGO-46: Sheet de CARACTERIZACIÓN.
  // No inserta fotos — para el registro fotográfico usar el botón aparte.
  async function generarActa() {
    if (!filaEditando) {
      await appAlert('Primero guarda la visita.', { tono: 'aviso', titulo: 'Visita no guardada' });
      return;
    }
    // Validar todos los campos antes de generar el acta. Estricto:
    // si falta cualquier dato obligatorio, NO se permite generar.
    const faltan = _validarAntesDeActa();
    if (faltan.length > 0) {
      await _avisarFaltantes(faltan, 'generar el acta');
      return;
    }
    await _ejecutarGenerarActa(false);
  }

  // Regenera el acta reemplazando la existente. Misma validacion estricta
  // que generarActa pero pasa flag regenerar=true al webhook para que
  // mande a papelera el acta vieja antes de crear la nueva.
  async function regenerarActa() {
    if (!filaEditando) {
      await appAlert('Primero guarda la visita.', { tono: 'aviso', titulo: 'Visita no guardada' });
      return;
    }
    const faltan = _validarAntesDeActa();
    if (faltan.length > 0) {
      await _avisarFaltantes(faltan, 'regenerar el acta');
      return;
    }
    const ok = await appConfirm(
      'Se reemplazará el acta F-GGO-46 ya generada por una nueva versión.',
      { tono: 'info', titulo: 'Regenerar acta', btnOk: 'Regenerar' }
    );
    if (!ok) return;
    await _ejecutarGenerarActa(true);
  }

  // Informe F-GGO-43: la "generación" abre informe/index.html (pestaña nueva
  // en móvil, iframe en escritorio) con los datos de la visita. Antes era un
  // onClick inline de ~140 líneas sin disabled ni guarda: un doble clic
  // rápido abría el generador dos veces, y podía correr junto al acta o al RF.
  async function generarInforme() {
    if (_docOcupadoRef.current) return;
    if (typeof window.abrirInformeF43 !== 'function') {
      appAlert('El generador de informe no cargó.', { tono: 'error', titulo: 'Error' });
      return;
    }
    // Mismo control estricto que para el acta: el informe F-GGO-43 se nutre
    // de los mismos campos del formulario y un dato faltante se traduce en
    // un placeholder o un párrafo de IA descontextualizado. Mejor bloquear.
    const faltanInf = _evaluarFormulario().faltan;
    if (faltanInf.length > 0) {
      await _avisarFaltantes(faltanInf, 'generar el informe');
      return;
    }
    _docOcupadoRef.current = true;
    setAI(true);
    try {
      // Si hay coordenadas, consultar POT completo para enriquecer
      // (clasificacion, tratamiento, intensidad) además de los campos de BD.
      let potExtra = {};
      if (d.lat != null && d.lon != null && typeof consultarPOT === 'function') {
        try {
          const r = await consultarPOT(d.lat, d.lon);
          // ── Mapear valores GDB → opciones del <select> del informe ──
          const _norm = s => (s||'').toString().toLowerCase()
            .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i')
            .replace(/[óòö]/g,'o').replace(/[úùü]/g,'u');

          // Clasificación: "Suelo urbano" → "Urbano", etc.
          let clas = '';
          const cn = _norm(r.clasificacion);
          if (cn.includes('expansion'))      clas = 'De expansion urbana';
          else if (cn.includes('suburban'))  clas = 'Suburbano';
          else if (cn.includes('urbano'))    clas = 'Urbano';
          else if (cn.includes('rural'))     clas = 'Rural';
          else                               clas = r.clasificacion || '';

          // Tratamiento: GDB devuelve "CN3, Consolidación Nivel 3" o similar
          let trat = '';
          const tn = _norm(r.tratamiento);
          if (tn.includes('consolid')) {
            if (tn.includes('1') || tn.includes('uno'))      trat = 'Consolidacion nivel 1';
            else if (tn.includes('2') || tn.includes('dos')) trat = 'Consolidacion nivel 2';
            else if (tn.includes('3') || tn.includes('tres'))trat = 'Consolidacion nivel 3';
            else                                              trat = 'Consolidacion nivel 3';
          } else if (tn.includes('mejoram')) {
            trat = tn.includes('rural') ? 'Mejoramiento integral rural' : 'Mejoramiento integral';
          } else if (tn.includes('renovac')) {
            if (tn.includes('redesarrollo')) trat = 'Renovacion urbana - redesarrollo';
            else if (tn.includes('reactiv')) trat = 'Renovacion urbana - reactivacion';
            else                              trat = 'Renovacion urbana - redesarrollo';
          } else if (tn.includes('desarrollo')) {
            trat = tn.includes('restring') ? 'Desarrollo restringido' : 'Desarrollo';
          } else if (tn.includes('conserv')) {
            if (tn.includes('historic'))      trat = 'Conservacion historica';
            else if (tn.includes('arquitect'))trat = 'Conservacion arquitectonica';
            else if (tn.includes('activ'))    trat = 'Conservacion activa';
            else if (tn.includes('estric'))   trat = 'Conservacion estricta';
            else                              trat = 'Conservacion activa';
          } else if (tn.includes('restaur'))  trat = 'Restauracion de actividades rurales';
          else if (tn.includes('recupera') && tn.includes('forest')) trat = 'Recuperacion para la produccion forestal';
          else if (tn.includes('recupera'))   trat = 'Recuperacion ambiental';
          else if (tn.includes('suburban'))   trat = 'Suburbanizacion restringida';
          else if (tn.includes('produccion') || tn.includes('agric')) trat = 'Produccion agricola, ganadera y forestal';
          else                                trat = r.tratamiento || '';

          // Franja de intensidad: mapear NMG / densidad → baja/media/alta
          let franja = '';
          const fn = _norm(r.intensidad);
          if (fn.includes('alta'))      franja = 'Franja alta';
          else if (fn.includes('media'))franja = 'Franja media';
          else if (fn.includes('baja')) franja = 'Franja baja';
          else if (r.intensidad)        franja = r.intensidad;  // raw para fallback

          potExtra = {
            poligono:      d.poligono || r.poligono || '',
            amenaza:       d.amenaza || r.amenaza || '',
            sueloProt:     d.sueloProt || r.sueloProt || '',
            clasificacion: clas,
            tratamiento:   trat,
            franja:        franja,
          };
          // Derivar proteccion para el <select> del informe
          const sp = r.sueloProt === 'SI' || d.sueloProt === 'SI';
          const am = r.amenaza === 'SI' || d.amenaza === 'SI';
          if (am) {
            const tipo = _norm(r.amenazaTipo);
            if (tipo.includes('inunda')) potExtra.proteccion = 'Si - amenaza por inundacion';
            else if (tipo.includes('movim') || tipo.includes('masa')) potExtra.proteccion = 'Si - amenaza por movimiento en masa';
            else potExtra.proteccion = 'Si - amenaza por movimiento en masa';
          } else if (sp) {
            potExtra.proteccion = 'Si - area protegida';
          } else if (r.enRetiro === 'SI') {
            potExtra.proteccion = 'Si - ronda hidrica';
          } else {
            potExtra.proteccion = 'No';
          }
        } catch(e) { /* silencioso: el informe queda sin POT auto */ }
      }
      window.abrirInformeF43({
        fila: filaEditando,
        // El radicado que tiene la fila en BD (no el del formulario, que puede
        // estar editado sin guardar): el backend lo compara antes de escribir.
        radicadoFila: _radicadoFilaRef.current,
        idVisita: _idVisitaRef.current,
        idCarpeta: d.idCarpetaVisita,
        // Oficio: el radicado no vive en el state, se deriva de la orden
        // (mismo criterio que _construirPayload y _construirDatosF46).
        // Sin esta derivación, abrirInformeF43 recibe '' y aborta con
        // "faltan params obligatorios" en toda visita de oficio.
        radicado: d.esOficio ? radicadoDeOficio(d.radicado, d.orden, d.nVisita) : d.radicado,
        fechaVisita: d.fechaVisita,
        // Word ya generado: el editor lo deja a mano («Abrir el Word generado»).
        linkInforme: d.linkDocxInforme,
        direccion: d.direccion,
        barrio: d.barrio,
        comuna: d.comuna,
        catastral: d.catastral,
        lat: d.lat, lon: d.lon,
        inspector: usuario?.usuario || '',
        cargo: usuario?.cargo || '',
        seAportoLicencia: d.licenciaAportada,
        numRes:           d.licencia,
        // La fecha que pide la visita es la de EXPEDICIÓN; la ejecutoria se
        // escribe en el informe. Antes viajaba como fechaEjec y el generador
        // la presentaba como «Fecha de ejecutoria».
        fechaExpedicion:  d.fechaLicencia,
        tipoModalidad:    d.tipoLicencia,
        titular:          d.licTitular,
        areaApro:         d.licAreaAprobada,
        curaduria:        d.licCuraduria,
        // ¿Las obras requieren licencia? — hecho del inspector: el informe ya
        // no lo deduce de la descripción.
        requiereLicencia: formatearRequiereLicencia(d.reqLicencia).requiere,
        requiereDetalle:  formatearRequiereLicencia(d.reqLicencia).detalle,
        pisos:            d.pisos,
        dest:             d.destinaciones,
        cubierta:         d.cubierta,
        sist:             d.sistema,
        obsLicencia:      d.obsLicencia,
        poligono:         d.poligono,
        amenaza:          d.amenaza,
        sueloProt:        d.sueloProt,
        observaciones:    d.actuacion,
        // Las conclusiones revisadas en la visita: sin ellas el generador
        // concluía por su cuenta (caso 20251084835, 2026-10-15).
        conclusiones:     d.obsConclusion,
        // Con el texto completo, no solo el número: el informe cierra
        // mencionando el área y "No aplica" / "No se pudo medir" también
        // son respuestas. Antes le llegaba vacío y el validador avisaba.
        areas:            _areaTexto(d),
        // Comportamientos contrarios (Art.135) ya marcados en la visita
        // (columna BD "TIPO DE INFRACCION") — informe/index.html los
        // matchea por codigo (A1, C9, ...) contra sus propios .comp-ac,
        // que usan un texto mas largo/distinto al de estos chips.
        infraccion:       _infraccionSoloCatalogo(d.infraccion),
        ...potExtra,
      });
    } finally {
      _docOcupadoRef.current = false;
      setAI(false);
    }
  }

  // Informe elaborado por fuera de la app: se sube el .docx tal cual (queda
  // editable en Word) a la carpeta de la visita y ocupa el lugar del generado.
  // No pasa por _validarAntesDeActa: el documento ya viene escrito, el
  // formulario no lo alimenta. Mismo nombre que usa el generador
  // (informe/index.html → subirInformeAlDrive) para que el backend mande a la
  // papelera la versión anterior en vez de acumular dos informes.
  async function subirInformeExterno(e) {
    const archivo = e.target.files && e.target.files[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!archivo || _docOcupadoRef.current) return;
    if (!/\.docx$/i.test(archivo.name)) {
      appAlert('El informe debe ser un documento de Word (.docx). Si está en .doc o en otro formato, ábrelo en Word y usa «Guardar como» → Documento de Word (.docx).',
        { tono: 'aviso', titulo: 'Formato no admitido' });
      return;
    }
    if (archivo.size > 20 * 1024 * 1024) {
      appAlert('El archivo pesa más de 20 MB. Comprime las imágenes del documento en Word y vuelve a intentarlo.',
        { tono: 'aviso', titulo: 'Archivo muy grande' });
      return;
    }
    if (d.linkDocxInforme) {
      const seguir = await appConfirm('Esta visita ya tiene un informe. El archivo que subas lo reemplaza.',
        { titulo: '¿Reemplazar el informe?', btnOk: 'Reemplazar' });
      if (!seguir) return;
    }
    _docOcupadoRef.current = true;
    setSI(true);
    try {
      const base64 = await new Promise(function(resolve, reject) {
        const r = new FileReader();
        r.onload  = function() { resolve((r.result || '').toString().split(',')[1] || ''); };
        r.onerror = function() { reject(new Error('No se pudo leer el archivo')); };
        r.readAsDataURL(archivo);
      });
      const rad = d.esOficio ? radicadoDeOficio(d.radicado, d.orden, d.nVisita) : d.radicado;
      const mF = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(d.fechaVisita || '').trim());
      const fechaIso = mF
        ? mF[3] + '-' + ('0' + mF[2]).slice(-2) + '-' + ('0' + mF[1]).slice(-2)
        : String(d.fechaVisita || '').slice(0, 10);
      const r = await gasPost({
        accion: 'subirInformeF43',
        fila: filaEditando,
        radicadoConocido: _radicadoFilaRef.current,
        idVisita: _idVisitaRef.current,
        idCarpeta: d.idCarpetaVisita,
        nombreArchivo: 'F-GGO-43_' + String(rad || 'informe').replace(/[^a-zA-Z0-9._-]/g, '_') +
          '_' + (fechaIso || 'sin_fecha') + '.docx',
        base64: base64,
      });
      if (r.link) setD(function(prev) { return Object.assign({}, prev, { linkDocxInforme: r.link }); });
      if (typeof invalidarCache === 'function') invalidarCache('visitas');
      if (r.avisoLink || r.aviso) appAlert(r.avisoLink || r.aviso, { tono: 'aviso', titulo: 'Informe subido con aviso' });
    } catch (err) {
      appAlert('No se pudo subir el informe: ' + (err && err.message ? err.message : err),
        { tono: 'error', titulo: 'Error' });
    } finally {
      _docOcupadoRef.current = false;
      setSI(false);
    }
  }

  async function _ejecutarGenerarActa(regenerar) {
    // Guarda de doble lanzamiento: cubre el doble clic rápido (disabled
    // llega tras el re-render) y que corra a la vez que el informe o el RF.
    if (_docOcupadoRef.current) return;
    _docOcupadoRef.current = true;
    setGA(true);
    try {
      const payload = Object.assign({ accion: 'generarActa' }, _construirDatosF46());
      if (regenerar) payload.regenerar = true;
      const r = await gasPost(payload);
      const link = r.linkSheet || r.linkActa;
      if (link) {
        setCampo('linkXlsxActa', link);
        if (r.linkPdf) setCampo('linkPdfActa', r.linkPdf);
        // Persistir en BD (columnas LINK_XLSX_ACTA/LINK_PDF_ACTA) para que el
        // botón "Acta" siga apareciendo al reabrir la visita. Best-effort: si
        // falla, el acta ya está en Drive y el link quedó en el state local.
        gasPost({
          accion: 'actualizarLinks',
          fila: filaEditando,
          radicadoConocido: _radicadoFilaRef.current,
          idVisita: _idVisitaRef.current,
          linkXlsxActa: link,
          linkPdfActa: r.linkPdf || d.linkPdfActa || '',
        }).catch(e => console.warn('[actualizarLinks] no se pudo persistir en BD:', e.message));
        await appAlert(
          (regenerar
            ? 'Acta regenerada correctamente.'
            : (r.yaExistia ? 'El acta ya existía en la carpeta.' : 'Acta generada correctamente.')) +
          '\n\nSe abrirá la hoja de caracterización en una pestaña nueva.',
          { tono: 'exito', titulo: 'Acta lista' }
        );
        window.open(link, '_blank', 'noopener');
      } else {
        await appAlert('El acta se generó pero no recibí link. Revisa Drive.', { tono: 'exito', titulo: 'Acta generada' });
      }
    } catch (e) {
      await appAlert('Error: ' + e.message, { titulo: regenerar ? 'Regenerar acta' : 'Generar acta' });
    }
    setGA(false);
    _docOcupadoRef.current = false;
  }

  // Paso 2 del F-GGO-46: Doc REGISTRO FOTOGRÁFICO con las fotos
  // ya subidas a la subcarpeta Fotos de la visita.
  // Abre el modal de fotos: carga la lista de Drive con la descripción ya
  // guardada en cada archivo; las que no tienen se describen al abrir y ↻ pide
  // otra para una foto (describirFotosModal). La pre-descripción al terminar
  // una subida sigue igual (SeccionFotos).

  async function abrirModalFotos() {
    if (!filaEditando) {
      await appAlert('Primero guarda la visita.', { tono: 'aviso', titulo: 'Visita no guardada' });
      return;
    }
    if (!d.idCarpetaFotos) {
      await appAlert('La visita aún no tiene subcarpeta de fotos. Sube fotos primero.', { tono: 'aviso', titulo: 'Sin fotos' });
      return;
    }
    setCargandoFotos(true);
    try {
      const r = await listarFotosActa(d.idCarpetaFotos);
      if (!r.ok || !r.fotos || r.fotos.length === 0) {
        await appAlert('No se encontraron fotos en la carpeta.', { tono: 'aviso', titulo: 'Sin fotos' });
        setCargandoFotos(false);
        return;
      }
      const lista = r.fotos.map(function(f) {
        return { id: f.id, nombre: f.nombre, link: f.link, descripcion: f.descripcion || '', mimeType: f.mimeType, descBusy: false };
      });
      // Nueva sesión: las descripciones en vuelo de una apertura anterior se descartan.
      _modalFotosSesionRef.current++;
      setModalFotos(lista);
      setModalFotosTotal(lista.length);
      setCargandoFotos(false);
      // Las fotos sin pie se describen solas al abrir (2026-10-26): el
      // inspector edita la sugerencia en vez de pedirla. Si la pre-descripción
      // de la última subida sigue corriendo, describirFotosModal la espera.
      const idsVacias = lista.filter(function(f) { return !f.descripcion; }).map(function(f) { return f.id; });
      if (idsVacias.length) describirFotosModal(idsVacias, false);
    } catch (e) {
      await appAlert('Error cargando fotos: ' + e.message, { tono: 'error', titulo: 'Error' });
      setCargandoFotos(false);
    }
  }

  // Por id, no por posición: el inspector puede reordenar o quitar mientras tanto.
  function _marcarFotoModal(fotoId, cambios) {
    setModalFotos(function(prev) {
      if (!prev) return prev;
      return prev.map(function(f) { return f.id === fotoId ? Object.assign({}, f, cambios) : f; });
    });
  }

  // Aplica la respuesta de describirFotos a las fotos `ids` del modal.
  // Devuelve los ids que quedaron sin descripción por 429 (vale reintentar).
  // `pisar` = false: solo llena pies vacíos (pre-descripción que llega tarde,
  // mientras el inspector ya pudo escribir el suyo).
  function _aplicarDescripcionesModal(res, ids, pisar) {
    const porId = {};
    ((res && res.ok && res.resultados) || []).forEach(function(r) { porId[r.id] = r; });
    // Rastro de cada foto que quedó sin pie: el backend manda en `debug` el
    // código HTTP de cada modelo, y sin esto el fallo no quedaba en ninguna parte.
    if (!res || !res.ok) console.warn('[RF] describirFotos falló:', res && res.error);
    ids.forEach(function(id) {
      const r = porId[id];
      if (r && !r.ok) console.warn('[RF] foto sin pie', id, r.error || '', r.debug || '');
    });
    const limitadas = [];
    setModalFotos(function(prev) {
      if (!prev) return prev;
      return prev.map(function(f) {
        if (ids.indexOf(f.id) < 0) return f;
        const r = porId[f.id];
        const desc = r && r.ok ? String(r.descripcion || '').trim() : '';
        if (desc) {
          return Object.assign({}, f, { descBusy: false, descError: false,
            descripcion: (pisar || !f.descripcion) ? desc : f.descripcion });
        }
        return Object.assign({}, f, { descBusy: false, descError: !f.descripcion });
      });
    });
    ids.forEach(function(id) { if (porId[id] && porId[id].rateLimited) limitadas.push(id); });
    return limitadas;
  }

  // Describe con IA las fotos `ids` en tandas de 6 por llamada (el backend las
  // procesa en paralelo; tandas y no todo junto para que los pies vayan
  // apareciendo). La situación encontrada orienta el prompt. `forzar` salta
  // la caché de Drive (↻).
  async function describirFotosModal(ids, forzar) {
    if (!ids.length) return;
    const sesion = _modalFotosSesionRef.current;
    const situacion = d.actuacion || '';
    ids.forEach(function(id) { _marcarFotoModal(id, { descBusy: true, descError: false }); });
    let restantes = ids.slice();
    // Pre-descripción en curso: esperarla en vez de pedir lo mismo dos veces.
    const enCurso = !forzar && descripcionesEnCurso(d.idCarpetaFotos);
    if (enCurso) {
      const res = await enCurso;
      if (_modalFotosSesionRef.current !== sesion) return;
      const resueltas = {};
      ((res && res.ok && res.resultados) || []).forEach(function(r) { if (r.ok && r.descripcion) resueltas[r.id] = true; });
      _aplicarDescripcionesModal(res, restantes.filter(function(id) { return resueltas[id]; }), false);
      restantes = restantes.filter(function(id) { return !resueltas[id]; });
    }
    async function tanda(lote) {
      let res;
      try { res = await describirFotos({ ids: lote, situacion: situacion, forzar: forzar }); }
      catch (e) { res = { ok: false, error: e.message }; }
      if (_modalFotosSesionRef.current !== sesion) return [];
      return _aplicarDescripcionesModal(res, lote, true);
    }
    let limitadas = [];
    for (let i = 0; i < restantes.length; i += 6) {
      limitadas = limitadas.concat(await tanda(restantes.slice(i, i + 6)));
      if (_modalFotosSesionRef.current !== sesion) return;
    }
    // Cuota por minuto de Gemini: una segunda pasada tras una pausa.
    if (limitadas.length) {
      limitadas.forEach(function(id) { _marcarFotoModal(id, { descBusy: true, descError: false }); });
      await new Promise(function(r) { setTimeout(r, 6000); });
      if (_modalFotosSesionRef.current !== sesion) return;
      for (let i = 0; i < limitadas.length; i += 6) {
        await tanda(limitadas.slice(i, i + 6));
        if (_modalFotosSesionRef.current !== sesion) return;
      }
    }
  }

  // Confirmar y generar RF con las fotos en el orden del modal
  async function confirmarYGenerarRF() {
    if (!modalFotos || modalFotos.length === 0) return;
    // Todas las fotos llevan pie: el RF no sale con fotos sin descripción
    // (decisión del usuario, 2026-09-25). El botón ya viene deshabilitado;
    // esto cubre cualquier otra vía.
    if (_fotosSinDescripcion(modalFotos) > 0) return;
    // Misma guarda compartida de documentos que el acta (ver _ejecutarGenerarActa).
    if (_docOcupadoRef.current) return;
    _docOcupadoRef.current = true;
    setGRF(true);
    setModalFotos(null);
    try {
      // seleccionExplicita: un humano revisó esta lista en el modal y la confirmó;
      // el backend la toma como definitiva y NO vuelve a recorrer la carpeta de
      // Drive re-metiendo al final las fotos quitadas. Solo aquí: es el único
      // punto del código donde la lista pasa por revisión humana.
      const payload = Object.assign({ accion: 'generarRegistroFotos', regenerar: true, seleccionExplicita: true }, _construirDatosF46());
      // Enviar array de fotos con fileId y descripcion editada
      payload.fotos = modalFotos.map(function(f) {
        return { fileId: f.id, descripcion: (f.descripcion || '').trim() };
      });
      const r = await gasPost(payload);
      const link = r.linkDoc;
      if (link) {
        // El backend ya persistió el link en LINK_REGISTRO_FOTOS; el setCampo
        // actualiza el renglón de una vez (patrón «Abrir» + ↻) sin esperar
        // a reabrir la visita.
        setCampo('linkRegistroFotos', link);
        await appAlert(
          (r.yaExistia ? 'El registro fotográfico ya existía en la carpeta.' : 'Registro fotográfico generado.') +
          '\n\nSe abrirá en una pestaña nueva.',
          { tono: 'exito', titulo: 'Registro fotográfico listo' }
        );
        window.open(link, '_blank', 'noopener');
      } else {
        await appAlert('Se generó pero no recibí link. Revisa Drive.', { tono: 'exito', titulo: 'Registro generado' });
      }
    } catch (e) {
      await appAlert('Error: ' + e.message, { tono: 'info', titulo: 'Generar registro fotográfico' });
    }
    setGRF(false);
    _docOcupadoRef.current = false;
  }

  // ── Render ─────────────────────────────────────────────────
  // nVisita puede venir como string del Sheet ("2") o number (1). Normalizar
  // antes de comparar para evitar la coerción frágil "10" > 1 (=true) vs "2" > 1 (=true por casualidad).
  const _nVisitaNum = parseInt(d.nVisita, 10) || 0;
  // Aviso de casos relacionados (efecto (10)). «Es otro caso» lo oculta
  // mientras la lista de casos no cambie.
  const _casosRelacClave = casosRelac.map(c => c.radicado).join('|');
  const _verCasosRelac = casosRelac.length > 0 && _casosRelacClave !== casosRelacVistos;
  const _ofrecerSeguimiento = !!d.esOficio && !filaEditando && typeof onReabrirConBusqueda === 'function';
  const _casosRelacPor = motivo => _verCasosRelac ? casosRelac.filter(c => c.motivos.indexOf(motivo) !== -1) : [];
  async function _abrirCasoRelacionado(radicado) {
    const ok = await appConfirm(
      'Se descarta lo que llevas en este formulario y se abre el caso ' + radicado +
      ' para registrar la visita como su seguimiento.',
      { tono: 'info', titulo: '¿Es un seguimiento?', btnOk: 'Abrir el caso' }
    );
    if (ok) onReabrirConBusqueda(radicado);
  }

  // Insumos del centro de control: estado por sección y bloqueo compartido
  // de generadores (una sola acción de documento a la vez).
  const evaluacion = _evaluarFormulario();
  // R11: referencia del POT para el punto actual (null si el pin se movió
  // después de consultar, o si el POT no respondió: entonces se editan a mano).
  const _potRefActual = d.potProtQueb && String(d.potProtQueb.lat) === String(d.lat) &&
    String(d.potProtQueb.lon) === String(d.lon) ? d.potProtQueb : null;
  const estadosSeccion = {};
  evaluacion.seccionesConObligatorios.forEach(function (titulo) {
    const pendiente = evaluacion.faltan.some(f => f.seccion === titulo);
    // El check verde solo en las completas (nunca miente) y se ve siempre;
    // las pendientes no llevan nada hasta que un intento de generar fallido
    // enciende el ámbar — si no, abrir una visita nueva marcaría ocho
    // secciones y la señal se volvería decorado.
    if (!pendiente) estadosSeccion[titulo] = 'ok';
    else if (mostrarPendientes) estadosSeccion[titulo] = 'pend';
  });
  const docOcupado = generandoActa || generandoRF || abriendoInforme || subiendoInforme;
  // La fila en BD y la carpeta en Drive se crean en llamadas distintas: si
  // crearCarpetaVisita falló (típico sin señal en campo) la visita existe
  // pero no hay dónde poner fotos ni documentos. Los renglones que dependen
  // de la carpeta se deshabilitan con tono apagado en vez de ofrecer un
  // botón que el backend rechazaría con «Falta idCarpetaVisita».
  const sinCarpetaVisita = !d.idCarpetaVisita;
  // El acta y el registro fotográfico se arman con el ESTADO LOCAL, no con lo
  // que hay en BD: tener `filaEditando` y carpeta no prueba que lo diligenciado
  // se haya persistido. Si el guardado está pendiente o falló, los documentos
  // saldrían bien y la fila quedaría vacía — el fallo del 14/09/2026. La barra
  // del encabezado explica el motivo ("Cambios sin guardar" / "No se pudo
  // guardar"), así que aquí basta con cerrar la puerta.
  const sinPersistir = dirty || !!errorGuardar;
  const generacionBloqueada = docOcupado || sinCarpetaVisita || sinPersistir;
  // Por qué «Generar» está apagado, dicho junto a los botones (revisión
  // 2026-10-28: se deshabilitaba sin explicar). Mientras se genera algo no
  // hace falta: el spinner ya lo dice.
  const motivoBloqueo = docOcupado ? ''
    : sinCarpetaVisita ? 'Para generar documentos hace falta la carpeta en Drive: guarda con conexión.'
    : errorGuardar ? 'No se pudo guardar: guarda otra vez antes de generar.'
    : dirty ? 'Hay cambios sin guardar: guarda antes de generar.'
    : '';
  // Visita sin iniciar (PENDIENTE/ASIGNADO): hasta el primer «Guardar» manual
  // no hay entregables. No basta con `dirty`: un borrador local restaurado, o
  // una fila que ya trae datos de BD, abren con `dirty` en falso sin que nadie
  // haya iniciado la visita.
  const sinIniciar = visitaSinIniciar(estadoVisita);
  // Callback para que SeccionFotos reporte su conteo al panel de estado. Su
  // lista ya incluye las de Drive y las de esta sesión, así que el número
  // llega completo (sin max()).
  function _reportarFotos(info) {
    setFotosInfo({ subidas: info.subidas || 0, enCola: info.enCola || 0 });
  }

  // Devuelve true si se puede abandonar el formulario. Se usa tanto desde el
  // botón "Volver" como desde el botón atrás del navegador (app.jsx la lee en
  // window._cuGuardSalir): antes el atrás de Android salía de la app entera y
  // se perdía la visita a medio diligenciar. En fase modal (selector de tipo)
  // no hay nada que perder: salir directo, sin preguntar.
  async function _puedeSalir() {
    if (fase !== 'formulario') return true;
    if (!_hayCambiosSinGuardar()) return true;
    return await appConfirm(
      'Hay cambios sin guardar. Si vuelves ahora se perderán.',
      { titulo: 'Salir sin guardar', btnOk: 'Salir sin guardar', peligro: true }
    );
  }

  async function _confirmarVolver() {
    if (await _puedeSalir()) onSalir();
  }

  return (
    <div className="pantalla activa nv-pantalla">
      {/* Header unificado y FIJO (.nv-header en styles.css) — Volver +
          estado/identidad + guardar, todo en una fila. Se queda arriba
          mientras se recorre el formulario: el inspector debe saber
          siempre qué visita está diligenciando, salir sin subir y guardar
          sin ir al fondo del scroll (antes Guardar vivía en una barra
          fija inferior que se comía ~92 px de pantalla). */}
      <div className="nv-header" ref={nvHeaderRef}>
        <div className="nv-header-top">
          {onSalir && (
            <button onClick={_confirmarVolver} className="btn-neutro nv-volver"
              aria-label="Volver" title="Volver"><Icon.ArrowLeft size={20} /></button>
          )}
          {/* Centro de control: estado + identidad + qué falta, visible sin
              scroll. Antes esta caja solo decía qué visita era. */}
          <PanelEstadoVisita
            estadoVisita={estadoVisita}
            identificador={d.esOficio
              ? (_oficioSeguimiento(d) ? d.radicado.toUpperCase().replace('-', ' ')
                 : d.orden ? 'OFICIO ' + d.orden : 'OFICIO')
              : (d.radicado ? 'RAD ' + d.radicado : 'Sin radicado')}
            direccion={d.direccion || ''}
            barrio={d.barrio || ''}
            comuna={d.comuna || ''}
            fechaVisita={_isoAFecha(d.fechaVisita) || ''}
            nVisita={_nVisitaNum}
            filaEditando={filaEditando}
            fotos={fotosInfo}
            ordenRelevante={_hayOrdenReal(d.orden)}
            ordenEscaneada={!!d.linkOrdenPolicia}
            tieneActa={_actaGeneradaD(d)}
            tieneRF={!!d.linkRegistroFotos}
            documento={documentoVisita(d.documento)}
            tieneInforme={!!d.linkDocxInforme}
          />
          {/* Acción principal y estado de guardado: mismo contenido que
              tenía la barra fija inferior, compactado en una columna. El
              texto del botón es corto («Guardar») porque los textos largos
              no caben; el modo offline lo comunica el indicador. */}
          <div className="nv-acciones">
            <div className={
              'barra-estado-gs' +
              (guardando ? ' bgs-guardando' : errorGuardar ? ' bgs-error' : (dirty || sinIniciar) ? ' bgs-pendiente' : enColaGuardado ? ' bgs-cola' : '')
            } aria-live="polite">
              {guardando ? (<>
                <span className="spinner-btn" aria-hidden="true" /> Guardando…
              </>)
              : errorGuardar ? '✕ No se pudo guardar — reintenta con el botón'
              : dirty ? '● Cambios sin guardar'
              : enColaGuardado ? '⇡ Guardado en cola — se envía al recuperar conexión'
              : !enLinea ? 'Sin conexión — guarda y se enviará al recuperar la señal'
              : sinIniciar ? '● Sin iniciar: guarda'
              : ultimoGuardadoMs
                ? '✓ Guardado · ' + new Date(ultimoGuardadoMs).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
                : 'Sin cambios'}
            </div>
            <button onClick={guardar} disabled={guardando} aria-busy={guardando} className="btn-principal"
              style={{ margin: 0, padding: '10px 12px', fontSize: 15 }}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
        {/* Barra «Falta:» (arquitectura 2026-10-27, decisión 5): el formulario
            se queda todo visible — ni plegado ni por pasos —, así que lo que
            falta se nombra aquí, en la cabecera fija, y cada nombre lleva a su
            sección. Desde el primer guardado; antes falta todo y la lista sería
            ruido. Los mismos faltantes de _evaluarFormulario (sin duplicar
            reglas). Por SECCIÓN con su número, no campo por campo (decisión
            del usuario: con 20 campos la barra era una lista que nadie lee);
            los campos van en el title y la sección los muestra. */}
        {filaEditando != null && evaluacion.faltan.length > 0 && (
          <div className="nv-falta" role="navigation" aria-label="Secciones con campos que faltan">
            <b>Campos por llenar:</b>
            {evaluacion.faltan.reduce((acc, fa) => {
              const g = acc.find(x => x.seccion === fa.seccion);
              if (g) g.campos.push(fa.nombre); else acc.push({ seccion: fa.seccion, campos: [fa.nombre] });
              return acc;
            }, []).map(g => (
              <button key={g.seccion} type="button" className="nv-falta-ir"
                title={g.campos.join(' · ')} onClick={() => _irASeccion(g.seccion)}>
                {_SECCION_CORTA[g.seccion] || g.seccion} <span className="nv-falta-n">{g.campos.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {pidiendoCitaNV && (
        <PedirCitaGlobal usuario={usuario}
          casoInicial={{ radicado: d.radicado || '', ordenPolicia: normOrdenAudiencias(d.orden) ? d.orden : '' }}
          onCerrar={() => { setPidiendoCitaNV(false); setCitaVuelta(n => n + 1); }} />
      )}

      {/* 1. IDENTIFICACIÓN ───────────────────────────────── */}
      <_Seccion titulo="Identificación del caso"
        estado={estadosSeccion["Identificación del caso"]} color="azul">
        {/* Sin «Tipo de visita» (decisión del usuario 2026-10-28): se eligió en
            el modal, el campo que sigue ya lo dice (Radicado u Orden de policía)
            y le quitaba la mitad del renglón al radicado, que no se leía. */}
        {!d.esOficio && (
          <>
            {/* Grupo escrito a mano en vez de <_Campo>: _Campo asocia el label
                clonando su ÚNICO hijo con un id, así que envolver el input en
                el flex del botón dejaría el <label for> apuntando al div. */}
            <div className="input-grupo nv-radicado-grupo">
              <label className="input-label" htmlFor="nv-radicado">Radicado</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input id="nv-radicado" type="text" className="input-campo mono"
                  style={{ flex: 1, minWidth: 0 }}
                  value={d.radicado || ''}
                  onChange={e => setCampo('radicado', e.target.value)}
                  placeholder="20251143210" />
                {/* PDF de la PQR original, en pestaña nueva. Solo aparece si BD
                    trae el link: no existe para oficios ni para los radicados
                    que el scraper no alcanzó a descargar del gestor. */}
                {d.linkPdfRadicado && (
                  <a href={d.linkPdfRadicado} target="_blank" rel="noopener noreferrer"
                    title="Abrir el PDF de la PQR radicada (pestaña nueva)"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      minHeight: 'var(--tap)', padding: '10px 12px', borderRadius: 8,
                      background: 'var(--brand-bg)', color: 'var(--brand-ink)',
                      border: '1px solid var(--brand-accent)',
                      fontSize: 13, fontWeight: 600, textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}>
                    <Icon.File size={14} /> Ver PQR
                  </a>
                )}
              </div>
            </div>
            <_Campo label="Fecha radicado">
              <_Input type="date" value={d.fechaRadicado} onChange={v => setCampo('fechaRadicado', v)} />
            </_Campo>
          </>
        )}
        {d.esOficio && (
          <_Campo label="N° Orden de policía">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600,
                color: 'var(--texto-suave)', whiteSpace: 'nowrap',
                padding: '10px 8px', background: 'var(--slate-100)', borderRadius: '8px 0 0 8px',
                border: '1px solid var(--borde-med)', borderRight: 'none',
              }}>{_ordenPrefijo(ordenAnio)}</span>
              <input
                type="number"
                min="1" max="999"
                className="input-campo mono"
                style={{ borderRadius: '0 8px 8px 0', flex: 1 }}
                value={ordenConsecutivo}
                onChange={e => setOrdenConsecutivo(e.target.value)}
                placeholder="001"
              />
            </div>
          </_Campo>
        )}
        <_AvisoCasosRelacionados casos={_casosRelacPor('orden')} motivo="orden"
          ofrecerSeguimiento={_ofrecerSeguimiento} onAbrir={_abrirCasoRelacionado}
          onOcultar={() => setCasosRelacVistos(_casosRelacClave)} />
        <_Campo label="Fecha de visita">
          <_Input type="date" value={d.fechaVisita} onChange={v => setCampo('fechaVisita', v)} />
        </_Campo>
      </_Seccion>

      {/* 2. UBICACIÓN ─────────────────────────────────────── */}
      <_Seccion titulo="Ubicación del inmueble"
        estado={estadosSeccion["Ubicación del inmueble"]} color="azul"
        // Sin botón «Consultar»: el pin dispara catastro y POT, abrir una
        // visita guardada consulta catastro, y si algo falla el panel
        // «Predio» ofrece «Reintentar».
      >
        {/* Grupo escrito a mano en vez de <_Campo>: envolvemos el input para el
            check de confirmación y el <label for> quedaría apuntando al div
            (mismo caso que el Radicado). Se normaliza al salir del campo, no
            mientras se escribe: tecleando «CL 5» el normalizador ya metería el
            `#` y estorbaría. Al salir el inspector ve el resultado, confirma
            «Confirmar dirección» o lo corrige. La clave de carpeta de Drive no
            cambia (tests/direcciones.test.js). */}
        <div className="input-grupo full-width">
          <label className="input-label" htmlFor="nv-direccion">Dirección del inmueble</label>
          {/* «Confirmar dirección» al lado del campo, no debajo: en escritorio
              sobra ancho. Al tocarlo se vuelve el estado «✓ Dirección
              confirmada»; reescribir la dirección lo devuelve a botón. */}
          <div className="dir-conf-linea">
          <div className="dir-conf-wrap">
            <input id="nv-direccion" type="text" className="input-campo"
              value={d.direccion || ''}
              onChange={e => { setCampo('direccion', e.target.value); setDirConfirmada(false); }}
              onFocus={() => setDirEnfoque(true)}
              onBlur={() => {
                setDirEnfoque(false);
                const n = normalizarDireccion(d.direccion);
                if (n && n !== d.direccion) setCampo('direccion', n);
              }}
              placeholder="CL 50 # 32-10" />
          </div>
          {requiereDir && dirConfirmada && (
            <span className="dir-conf-hecha">✓ Dirección confirmada</span>
          )}
          {requiereDir && !dirConfirmada && !dirEnfoque && (
            <div ref={dirFilaRef} className="dir-conf-fila">
              <button type="button" ref={dirBotonRef} className="btn-neutro dir-conf-btn"
                onClick={() => setDirConfirmada(true)}>Confirmar dirección</button>
            </div>
          )}
          </div>
        </div>
        {/* Si el caso ya salió por la orden, no se repite aquí. */}
        <_AvisoCasosRelacionados
          casos={_casosRelacPor('direccion').filter(c => c.motivos.indexOf('orden') === -1)}
          motivo="direccion"
          ofrecerSeguimiento={_ofrecerSeguimiento} onAbrir={_abrirCasoRelacionado}
          onOcultar={() => setCasosRelacVistos(_casosRelacClave)} />
        {barrioDelPot && d.barrio === barrioDelPot && !editandoBarrio ? (
          <div className="input-grupo full-width">
            <span className="input-label">Barrio y comuna</span>
            <div className="barrio-pot">
              <b>{d.barrio}</b>{d.comuna && <> · Comuna {d.comuna}</>}
              <span className="barrio-pot-nota">del POT</span>
              <button type="button" className="btn-link" onClick={() => setEditandoBarrio(true)}>Cambiar</button>
            </div>
          </div>
        ) : (<>
        <_Campo label="Barrio / Vereda">
          <_SelectBarrio
            barrio={d.barrio}
            barrioOtro={barrioOtro}
            comuna={d.comuna}
            onChangeBarrio={v => setCampo('barrio', v)}
            onChangeBarrioOtro={setBarrioOtro}
            onChangeComuna={v => setCampo('comuna', v)}
          />
        </_Campo>
        <_Campo label="Comuna">
          <_Input value={d.comuna} onChange={v => setCampo('comuna', v)}
            placeholder="4" />
        </_Campo>
        </>)}

        {/* Escritorio: el mapa en la columna izquierda del formulario y, a su
            derecha, el panel «Predio» — lo que cambia al mover el pin queda a
            la vista junto al pin. La caja de GPS solo existe en pantallas
            táctiles (CSS): un computador ubica por la red, con cientos de
            metros de error, y el pin caería en la oficina. Móvil: GPS, mapa,
            predio. */}
        <div className="ubic-mapa-grid">
        <div className="gps-box">
          <div style={{ flex: 1 }}>
            <div className="gps-coords">
              {d.lat != null && d.lon != null
                ? `${Number(d.lat).toFixed(6)}, ${Number(d.lon).toFixed(6)}`
                : 'Sin coordenadas'}
              {gpsAccuracy != null && (() => {
                var fg = gpsAccuracy <= 8 ? 'var(--verde-dark)' : gpsAccuracy <= 20 ? 'var(--cafe)' : 'var(--rojo)';
                var bg = gpsAccuracy <= 8 ? 'var(--verde-bg)'   : gpsAccuracy <= 20 ? 'var(--amarillo-bg)' : 'var(--rojo-bg)';
                var label = gpsAccuracy <= 8 ? 'Excelente' : gpsAccuracy <= 20 ? 'Buena' : gpsAccuracy <= 50 ? 'Regular' : 'Baja';
                return React.createElement('span', {
                  style: { marginLeft: 8, fontSize: 13, fontWeight: 600, color: fg,
                    padding: '1px 7px', borderRadius: 8, background: bg }
                }, '±' + gpsAccuracy + 'm · ' + label);
              })()}
            </div>
            {busyGeo && gpsAccuracy != null && React.createElement('div', {
              style: { fontSize: 13, color: 'var(--texto-suave)', marginTop: 2 }
            }, 'Refinando señal GPS… Puedes aceptar la ubicación actual o esperar mayor precisión.')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            {/* NO lleva `busy`: mientras busca, este botón es justamente el que
                acepta la lectura actual ("Usar esta ubicación"). Deshabilitarlo
                dejaría al inspector esperando los 30 s completos sin salida.
                El estado se comunica con el spinner y aria-live, no con disabled. */}
            <_BtnAccion onClick={usarMiUbicacion}
              aria-live="polite"
              style={busyGeo && gpsAccuracy != null
                ? { background: 'var(--green-bg)', borderColor: 'var(--green)', color: 'var(--green-ink)' }
                : undefined}>
              {busyGeo
                ? (gpsAccuracy != null
                    ? React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
                        React.createElement(Icon.Check, { size: 14 }), 'Usar esta ubicación')
                    : React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
                        React.createElement('span', { className: 'spinner-btn', 'aria-hidden': 'true' }), 'Buscando señal…'))
                : React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
                    React.createElement(Icon.Pin, { size: 14 }), 'Capturar mi ubicación')}
            </_BtnAccion>
            {busyGeo && React.createElement('button', {
              onClick: function() { _detenerGeoWatch(); setBusyGeo(false); setGpsAccuracy(null); },
              className: 'btn-texto', type: 'button'
            }, React.createElement(Icon.Close, { size: 14 }), 'Cancelar')}
          </div>
        </div>
        <div className="ubic-mapa">
          <_MapaGPS lat={d.lat} lon={d.lon} terrenosDir={terrenosDir}
            conflicto={cmpUbic.estado === 'distinto'}
            // Sin barrio a propósito: medido en «Cómo llegar», con barrio la
            // consulta cae en Medellín.
            direccion={d.direccion ? d.direccion + ', Bello, Antioquia' : ''}
            onMove={(lat, lon) => {
            // Un GPS aún refinando pisaría el punto marcado a mano con su
            // siguiente lectura (o el timeout de 30 s lo aceptaría encima).
            _detenerGeoWatch(); setBusyGeo(false);
            setCampo('lat', lat); setCampo('lon', lon);
            setCampo('origenPunto', 'MAPA');
            // Arrastrar el pin es una corrección deliberada del punto: hay que
            // re-consultar POT y catastro. Antes solo se movían las coordenadas
            // y AZ/BA/BB (y la sugerencia A1/A3) quedaban calculadas sobre el
            // punto anterior, sin que nada lo advirtiera.
            setGpsAccuracy(null);   // la precisión del GPS ya no describe este punto
            ejecutarPOT(lat, lon);
            ejecutarBusquedaCatastral(lat, lon, true);
          }} />
        </div>
        <div className="ubic-lado">
        <_PanelPredio
          esRural={_esRuralUbic} estadoBusq={predioDirEstado} predioDir={predioDir}
          terrenoElegido={terrenoDirElegido} onElegir={setTerrenoDirElegido}
          cmp={cmpUbic} hayPin={cmpUbic.estado !== 'sin-pin' && d.lat != null && d.lat !== '' && d.lon != null && d.lon !== ''}
          preferirPunto={preferirPunto}
          catastral={d.catastral} ficha={d.ficha} direccion={d.direccion}
          dirPredioDir={((terrenosDir || []).find(t => t.tcod === cmpUbic.tcod) || {}).direccion}
          faltaUnidad={!!(catResultados && catResultados.length > 1)}
          fichasPH={catResultados || []} onSeleccionarFicha={seleccionarCatastral}
          sinUnidad={!!(catResultados && catResultados.length > 1) && esCodigoPredioMatriz(d.catastral)}
          onSinUnidad={confirmarSinUnidad}
          onElegirUnidad={() => { setCampo('catastral', ''); setCampo('ficha', ''); }}
          vigente={ubicVigente}
          fichaInfo={fichaAplicada}
          coords={d.lat != null && d.lat !== '' && d.lon != null && d.lon !== ''
            ? Number(d.lat).toFixed(6) + ', ' + Number(d.lon).toFixed(6) : 'Sin coordenadas'}
          onUsarDireccion={() => _pinEnPredioDireccion(cmpUbic.tcod)}
          onUsarPunto={usarPredioPunto}
          onUbicarEnDireccion={() => _pinEnPredioDireccion(cmpUbic.tcod)}
          onConfirmar={confirmarUbicacion}
          consultando={busyCat || busyPOT}
          fallo={consultaFallida} onReintentar={consultarNorma} />

        {/* Norma POT bajo «Predio», en la columna del mapa: mover el pin la
            vuelve a consultar y así se ve qué cambió sin bajar. Filas de
            etiqueta + control para que quepa junto al mapa. */}
        <div className="norma-panel">
          <div className="norma-panel-titulo">
            Norma POT <span className="predio-nota">· se vuelve a consultar al mover el pin</span>
          </div>
          {catastralManual && (
            <div className="norma-manual">
              <_Campo label="Código catastral">
                <_Input mono value={d.catastral}
                  onChange={v => { setCatEditando(true); setCampo('catastral', v); }} />
              </_Campo>
              <_Campo label="N° ficha predial">
                <_Input mono value={d.ficha}
                  onChange={v => { setCatEditando(true); setCampo('ficha', v); }} />
              </_Campo>
            </div>
          )}
          <_Campo label="Polígono de uso del suelo">
            <_Input mono value={d.poligono} onChange={v => setCampo('poligono', v)}
              placeholder="ZR-CN-1" />
          </_Campo>
          <_Campo label="¿Amenaza?">
            <_Radio value={d.amenaza} onChange={v => setCampo('amenaza', v)}
              opciones={['SI', 'NO']} />
          </_Campo>
          {/* R11: con el POT del punto actual, estas dos casillas no se
              editan a mano (pasarlas a NO esquivaría A1): se mueve el pin. */}
          <_Campo label="¿Suelo de protección?"
            hint={_potRefActual && _potRefActual.sueloProt ? 'Lo da el POT del punto: se cambia moviendo el pin.' : undefined}>
            <_Radio value={d.sueloProt} onChange={v => setCampo('sueloProt', v)}
              disabled={!!(_potRefActual && _potRefActual.sueloProt)}
              opciones={['SI', 'NO']} />
          </_Campo>
          <_Campo label="¿Dentro de retiro de quebrada?"
            hint={_potRefActual && _potRefActual.quebrada ? 'Lo da el POT del punto: se cambia moviendo el pin.' : undefined}>
            <_Radio value={d.quebrada} onChange={v => setCampo('quebrada', v)}
              disabled={!!(_potRefActual && _potRefActual.quebrada)}
              opciones={['SI', 'NO']} />
          </_Campo>
        </div>
        </div>
        </div>
      </_Seccion>

      {/* 3. PERSONA QUE ATIENDE ──────────────────────────── */}
      <_Seccion titulo="Persona que atiende"
        estado={estadosSeccion["Persona que atiende"]} color="azul">
        <div style={{ gridColumn: '1 / -1', marginBottom: 4 }}>
          <label className="check-tap" style={{ fontWeight: 600, color: d.noAtiende ? 'var(--amarillo)' : 'var(--texto-2)' }}>
            <input type="checkbox"
              checked={d.noAtiende}
              onChange={e => setCampo('noAtiende', e.target.checked)}
            />
            No se atiende / No suministra datos
          </label>
        </div>
        {!d.noAtiende && (<>
        <_Campo label="Nombre completo">
          <_Input value={d.atiendeNombre} onChange={v => setCampo('atiendeNombre', v)} />
        </_Campo>
        <_Campo label="Cédula">
          <_Input mono value={d.atiendeId} onChange={v => setCampo('atiendeId', v)} />
        </_Campo>
        <_Campo label={<>Teléfono <_CheckNoAporta checked={d.telNoAporta} onChange={v => setCampo('telNoAporta', v)} /></>}>
          <_Input mono value={d.atiendeTel} onChange={v => setCampo('atiendeTel', v)}
            disabled={d.telNoAporta} placeholder={d.telNoAporta ? 'No aporta' : '3000000000'} />
        </_Campo>
        <_Campo label={<>Correo electrónico <_CheckNoAporta checked={d.emailNoAporta} onChange={v => setCampo('emailNoAporta', v)} /></>}>
          <_Input type="email" value={d.atiendeEmail}
            onChange={v => setCampo('atiendeEmail', v)}
            disabled={d.emailNoAporta} placeholder={d.emailNoAporta ? 'No aporta' : 'correo@ejemplo.com'} />
        </_Campo>
        <_Campo label="Relación con el evento" fullWidth>
          <_Radio value={d.atiendeRelacion} onChange={v => setCampo('atiendeRelacion', v)}
            opciones={['Propietario', 'Arrendatario', 'Constructor', 'Otro']} />
          {d.atiendeRelacion === 'Otro' && (
            <input
              type="text"
              className="input-campo"
              style={{ marginTop: 8 }}
              placeholder="Especifique la relación"
              value={d.atiendeRelacionOtro || ''}
              onChange={e => setCampo('atiendeRelacionOtro', e.target.value)}
            />
          )}
        </_Campo>
        <_Campo label={<>Dirección de notificación <_CheckNoAporta checked={d.dirNoAporta} onChange={v => { setCampo('dirNoAporta', v); if (v) setCampo('dirNotifIgual', false); }} /></>} fullWidth>
          {!d.dirNoAporta && (
            <label className="check-tap" style={{ marginBottom: 4 }}>
              <input type="checkbox"
                checked={d.dirNotifIgual}
                onChange={e => setCampo('dirNotifIgual', e.target.checked)}
              />
              Misma dirección del inmueble
            </label>
          )}
          <_Input
            value={d.dirNoAporta ? '' : (d.dirNotifIgual ? d.direccion : d.atiendeDir)}
            onChange={v => setCampo('atiendeDir', v)}
            aria-label="Dirección de notificación"
            disabled={d.dirNoAporta || d.dirNotifIgual}
            placeholder={d.dirNoAporta ? 'No aporta' : (d.dirNotifIgual ? '' : 'Dirección de notificación')}
          />
        </_Campo>
        </>)}
      </_Seccion>

      {/* 4. CARACTERÍSTICAS ──────────────────────────────── */}
      <_Seccion titulo="Características de la edificación"
        estado={estadosSeccion["Características de la edificación"]} color="cafe">
        <_Campo label="Estado de la obra" fullWidth>
          <_Radio value={d.estadoObra} onChange={v => setCampo('estadoObra', v)}
            opciones={['En proceso / iniciada', 'Terminada']} />
        </_Campo>
        <_Campo label="¿Habitado?">
          <_Radio value={d.habitado} onChange={v => setCampo('habitado', v)}
            opciones={['SI', 'NO']} />
        </_Campo>
        <_Campo label="Altura en pisos">
          <_Input mono value={d.alturaPisos} onChange={v => setCampo('alturaPisos', v)} />
        </_Campo>
        <_Campo label="N° destinaciones actuales">
          <_Input mono value={d.destActuales} onChange={v => setCampo('destActuales', v)} />
        </_Campo>
        <_Campo label="Usos actuales" fullWidth>
          <_ChipsMulti
            opciones={USOS_OPCIONES}
            value={d.usos}
            onChange={v => setCampo('usos', v)}
            separador=" · "
            otroLabel="Especifique uso"
          />
          {/* Campo que funciona: visible cuando hay uso diferente a Residencial */}
          {(d.usos || '').split(/\s*[·,]\s*/).some(function(u) {
            return u.trim() && u.trim() !== 'Residencial' && u.trim() !== 'Otro';
          }) && (
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                className="input-campo"
                placeholder="¿Qué funciona en el predio?"
                value={d.queFunciona || ''}
                onChange={function(e) { setCampo('queFunciona', e.target.value); }}
              />
            </div>
          )}
        </_Campo>
        <_Campo label="Tipo de cubierta actual" fullWidth>
          <_ChipsMulti
            opciones={CUBIERTA_ACTUAL_OPCIONES}
            value={d.cubiertaActual}
            onChange={v => setCampo('cubiertaActual', v)}
            separador=", "
            otroLabel="Especifique tipo de cubierta"
          />
        </_Campo>
      </_Seccion>

      {/* 5. VERIFICACIÓN DOCUMENTAL ──────────────────────── */}
      <_Seccion titulo="Verificación documental"
        estado={estadosSeccion["Verificación documental"]} color="cafe">
        {_preguntaRequiereLicencia()}
        <_Campo label="¿Se aportó licencia?" fullWidth>
          <_Radio value={d.licenciaAportada} onChange={v => setCampo('licenciaAportada', v)}
            opciones={['SI', 'NO']} />
        </_Campo>
        {d.licenciaAportada === 'SI' && (
          <>
            <_Campo label="N° Licencia">
              <_Input mono value={d.licencia} onChange={v => setCampo('licencia', v)} />
            </_Campo>
            <_Campo label="Fecha de expedición">
              <_Input type="date" value={d.fechaLicencia}
                onChange={v => setCampo('fechaLicencia', v)} />
            </_Campo>
            <_Campo label="Tipo de trámite" fullWidth>
              {_chipsLicencia('tramites')}
            </_Campo>
            <_Campo label="Modalidad" fullWidth>
              {_chipsLicencia('modalidades')}
            </_Campo>
            <_Campo label="Titular de la licencia">
              <_Input value={d.licTitular} onChange={v => setCampo('licTitular', v)} />
            </_Campo>
            <_Campo label="Área aprobada (m²)">
              <_Input mono value={d.licAreaAprobada} onChange={v => setCampo('licAreaAprobada', v)} />
            </_Campo>
            <_Campo label="Curaduría urbana">
              <_Input value={d.licCuraduria} onChange={v => setCampo('licCuraduria', v)} />
            </_Campo>
            <_Campo label="Pisos aprobados">
              <_Input mono value={d.pisos} onChange={v => setCampo('pisos', v)} />
            </_Campo>
            <_Campo label="Destinaciones aprobadas">
              <_Input value={d.destinaciones} onChange={v => setCampo('destinaciones', v)} />
            </_Campo>
            <_Campo label="Cubierta aprobada">
              <select className="input-campo" value={d.cubierta}
                onChange={e => setCampo('cubierta', e.target.value)}>
                <option value="">Seleccionar cubierta...</option>
                {CUBIERTA_LICENCIA_OPCIONES.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </_Campo>
            <_Campo label="Sistema estructural">
              <select className="input-campo" value={d.sistema}
                onChange={e => setCampo('sistema', e.target.value)}>
                <option value="">Seleccionar sistema...</option>
                {SISTEMA_ESTRUCTURAL_OPCIONES.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </_Campo>
            <_Campo label="Observaciones de la licencia" fullWidth>
              <TextAreaNV value={d.obsLicencia} onChange={v => setCampo('obsLicencia', v)} rows={3} />
            </_Campo>
          </>
        )}
      </_Seccion>

      {/* 6. DESCRIPCIÓN ──────────────────────────────────── */}
      <_Seccion titulo="Descripción de la situación encontrada"
        estado={estadosSeccion["Descripción de la situación encontrada"]} color="gris">
        {/* Primero el documento: decide si el texto tiene el tope del acta. */}
        <_DocumentoVisita valor={documentoVisita(d.documento)} bloqueado={_actaGeneradaD(d)}
          onCambiar={cambiarDocumento} />
        <_Campo label="Situación encontrada" fullWidth>
          <TextAreaNV value={d.actuacion} onChange={v => setCampo('actuacion', v)} rows={8} autoAlto />
        </_Campo>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            {documentoVisita(d.documento) === 'ACTA' && (
              <_MedidorActa texto={d.actuacion} celda="situacion"
                onUsarInforme={_actaGeneradaD(d) ? null : () => cambiarDocumento('INFORME')} />
            )}
          </div>
          {_botonDictar()}
        </div>
      </_Seccion>

      {/* 7B. TIPIFICACIÓN Y MEDIDAS ──────────────────────── */}
      <_Seccion titulo="Tipificación y medidas"
        estado={estadosSeccion["Tipificación y medidas"]} color="cafe">
        <_Campo label="Tipo de contravención (Art. 135 Ley 1801/2016)" fullWidth>
          {/* Advertencia: si el predio es público o está en área protegida,
              sugerir el comportamiento correcto antes de que el inspector
              tipifique algo incorrecto (ej.: A4 cuando debería ser A1/A3). */}
          {_mostrarAdvertenciaTipif && (
            <div style={{
              padding: '12px 14px', borderRadius: 'var(--r-md)', marginBottom: 12,
              background: 'var(--amarillo-bg)', border: '1.5px solid var(--amarillo)',
              color: 'var(--cafe)', fontSize: 13,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ flexShrink: 0 }}><Icon.Alert size={20} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    Tipificación sugerida
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    Según la consulta POT/catastro:
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
                      {_sugerenciasA.map(s => (
                        <li key={s.val} style={{ marginBottom: 3 }}>
                          {s.razon} → <strong>{s.val}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {_chipsAActuales.length > 0 && _chipsAActuales.some(v => !_vSugeridos.includes(v)) && (
                    <div style={{
                      padding: '6px 10px', borderRadius: 6, marginBottom: 8,
                      background: 'var(--rojo-bg)', color: 'var(--brand-ink)', fontSize: 13,
                      border: '1px solid var(--rojo)',
                    }}>
                      Actualmente marcaste: {_chipsAActuales.join(', ')}.
                      Al aplicar la sugerencia se reemplazarán solo los comportamientos del Literal A.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={_aplicarSugerenciasTipif}
                      className="btn-principal secundario"
                      style={{ margin: 0, padding: '8px 14px', fontSize: 13 }}>
                      <Icon.Check size={14} /> Aplicar sugerencia
                    </button>
                    <button type="button" onClick={() => setAdvertTipifIgnorada(true)}
                      className="btn-neutro" style={{ fontSize: 13, padding: '9px 14px' }}>
                      No aplicar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <_ChipsContravencion
            value={d.infraccion}
            onChange={_setInfraccion}
            ofrecerIndeterminada={(d.reqLicencia || {}).respuesta === REQUIERE_INDETERMINADO}
          />
        </_Campo>
        <_Campo label="Área de contravención (m²)">
          {/* Dos casillas, excluyentes: "No aplica" es que no hay nada que
              medir (sin infracción) y "No se pudo medir" es que sí lo hay
              pero no se pudo tomar la medida — al acta le llegan textos
              distintos porque son hechos distintos. */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 4 }}>
            <label className="check-tap">
              <input type="checkbox"
                checked={!!d.areaNoAplica}
                onChange={e => {
                  setCampo('areaNoAplica', e.target.checked);
                  if (e.target.checked) { setCampo('areaNoMedible', false); setCampo('area', ''); }
                }}
              />
              No aplica (sin infracción)
            </label>
            <label className="check-tap">
              <input type="checkbox"
                checked={!!d.areaNoMedible}
                onChange={e => {
                  setCampo('areaNoMedible', e.target.checked);
                  if (e.target.checked) { setCampo('areaNoAplica', false); setCampo('area', ''); }
                }}
              />
              No se pudo medir
            </label>
          </div>
          <_Input mono value={d.area}
            onChange={v => setCampo('area', v)}
            aria-label="Área de contravención en metros cuadrados"
            disabled={d.areaNoMedible || d.areaNoAplica}
            placeholder={(d.areaNoMedible || d.areaNoAplica) ? 'N/A' : 'm²'}
          />
        </_Campo>

        {/* Suspensión: oculta si obra terminada */}
        {d.estadoObra !== 'Terminada' && (
          <>
            <_Campo label="¿Se decreta suspensión de obra?" fullWidth>
              <_Radio value={d.suspension} onChange={v => setCampo('suspension', v)}
                opciones={['SI', 'NO']} />
            </_Campo>
            {d.suspension === 'SI' && (
              <_Campo label="N° Orden de policía">
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600,
                    color: 'var(--texto-suave)', whiteSpace: 'nowrap',
                    padding: '10px 8px', background: 'var(--slate-100)', borderRadius: '8px 0 0 8px',
                    border: '1px solid var(--borde-med)', borderRight: 'none',
                  }}>{_ordenPrefijo(ordenAnio)}</span>
                  <input
                    type="number"
                    min="1" max="999"
                    className="input-campo mono"
                    style={{ borderRadius: '0 8px 8px 0', flex: 1 }}
                    value={ordenConsecutivo}
                    onChange={e => setOrdenConsecutivo(e.target.value)}
                    placeholder="001"
                  />
                </div>
              </_Campo>
            )}
          </>
        )}

        {citaReservada && citaReservada.estadoCita !== 'fallo' ? (
          <_Campo label="Citación" fullWidth>
            <div className={'cita-reservada ' + (citaReservada.estadoCita === 'cola' ? 'cola' : 'ok')}>
              <span className="est">{citaReservada.estadoCita === 'cola'
                ? '⇡ En cola · se confirma al volver la señal' : '✓ Cita confirmada'}</span>
              <b>{_fechaLargaCita(citaReservada.fecha)} · {horaBonitaAudiencias(citaReservada.hora)}</b>
              <small>{titleCaseNombre(citaReservada.sustanciador)}
                {citaReservada.reservadoPor ? ' · pedida por ' + titleCaseNombre(citaReservada.reservadoPor) +
                  (citaReservada.reservadoEn ? ' el ' + String(citaReservada.reservadoEn).slice(0, 5) : '') : ''}</small>
            </div>
          </_Campo>
        ) : (<>
        {citaReservada && citaReservada.estadoCita === 'fallo' && (
          <_Campo label="Citación" fullWidth>
            <div className="cita-reservada fallo">
              <span className="est">✕ No se pudo reservar la cita del {citaReservada.fecha}</span>
              <small>El cupo lo tomó otra persona. Pide otra con «Pedir cita».</small>
            </div>
          </_Campo>
        )}
        <_Campo label="Citación" fullWidth>
          <label className="check-tap" style={{ marginBottom: 4 }}>
            <input type="checkbox"
              checked={d.noCitacion}
              onChange={e => {
                setCampo('noCitacion', e.target.checked);
                if (e.target.checked) {
                  setCampo('citacionFecha', '');
                  setCampo('citacionHora', '');
                }
              }}
            />
            No se deja citación
          </label>
          {/* «Pedir cita» con el caso ya puesto (decisión 4 de la revisión de
              arquitectura): la misma hoja del «+». Al reservar, la fecha y la
              hora de abajo quedan fijas con la del cupo. */}
          {!d.noCitacion && (d.radicado || normOrdenAudiencias(d.orden)) && (
            <button type="button" className="btn-accion nv-pedir-cita" onClick={() => setPidiendoCitaNV(true)}>
              Pedir cita
            </button>
          )}
        </_Campo>
        <_Campo label="Fecha de citación">
          <_Input type="date" value={d.citacionFecha}
            onChange={v => setCampo('citacionFecha', v)}
            disabled={d.noCitacion} />
        </_Campo>
        <_Campo label="Hora de citación">
          <select className="input-campo" value={d.citacionHora}
            onChange={e => setCampo('citacionHora', e.target.value)}
            disabled={d.noCitacion}>
            <option value="">Sin hora</option>
            {HORAS_CITACION.map(h => <option key={h.val} value={h.val}>{h.l}</option>)}
          </select>
        </_Campo>
        </>)}
        {(citaReservada || (!d.noCitacion && d.citacionFecha)) && (<>
          {!d.noAtiende && (
            <_Campo label="Citado" fullWidth>
              <label className="check-tap">
                <input type="checkbox" checked={!d.citaOtraPersona}
                  onChange={e => setCampo('citaOtraPersona', !e.target.checked)} />
                Se cita a quien atendió la visita{d.atiendeNombre ? ' (' + d.atiendeNombre + ')' : ''}
              </label>
            </_Campo>
          )}
          {(d.citaOtraPersona || d.noAtiende) && (<>
            <_Campo label={d.noAtiende ? 'Citado' : 'Nombre del citado'}>
              <_Input value={d.citadoNombre} onChange={v => setCampo('citadoNombre', v)} />
            </_Campo>
            <_Campo label="Documento"
              hint={!d.citadoSinDoc && String(d.citadoNombre || '').trim() && !/^\d{5,12}$/.test(d.citadoDocumento || '')
                ? <span style={{ color: 'var(--red)' }}>Escribe de 5 a 12 dígitos o marca «No aportó documento»</span> : null}>
              <_Input value={d.citadoDocumento} inputMode="numeric" disabled={!!d.citadoSinDoc}
                onChange={v => setCampo('citadoDocumento', v.replace(/\D/g, ''))} />
            </_Campo>
            <_Campo label="" fullWidth>
              <label className="check-tap">
                <input type="checkbox" checked={!!d.citadoSinDoc}
                  onChange={e => { setCampo('citadoSinDoc', e.target.checked); if (e.target.checked) setCampo('citadoDocumento', ''); }} />
                No aportó documento
              </label>
            </_Campo>
          </>)}
        </>)}
      </_Seccion>

      {/* 8. VISITADORES ──────────────────────────────────── */}
      <_Seccion titulo="Funcionarios que realizan la inspección"
        estado={estadosSeccion["Funcionarios que realizan la inspección"]} color="azul">
        <_Campo label="Visitador(es)" fullWidth>
          <div className="chips">
            {visitadoresDin.map(v => {
              const seleccionados = (d.visitador || '').split(' / ').filter(Boolean);
              const activo = seleccionados.includes(v.val);
              function toggle() {
                const next = activo
                  ? seleccionados.filter(x => x !== v.val)
                  : [...seleccionados, v.val];
                setCampo('visitador', next.join(' / '));
              }
              return (
                <button key={v.val} type="button"
                  className={'chip-vis' + (activo ? ' activo' : '')}
                  data-val={v.val}
                  onClick={toggle}>
                  {v.l}
                </button>
              );
            })}
          </div>
        </_Campo>
      </_Seccion>

      {/* 10. OBSERVACIONES Y CONCLUSIONES (al final) ───────── */}
      {/* Sin indicador a propósito: no declara obligatorios, un check aquí
          sería mentira y un ámbar, peor. No llevar `estado`. */}
      {/* Con informe técnico las conclusiones se escriben en el generador del
          informe (decisión del usuario 2026-10-17): la casilla no sale. Un texto
          que ya existiera se conserva y llega al informe, donde se edita; aquí
          no se puede tocar, así que no vence la revisión. */}
      <_Seccion titulo={documentoVisita(d.documento) === 'ACTA' ? 'Conclusiones y revisión' : 'Revisión del texto'} color="gris">
        {documentoVisita(d.documento) === 'ACTA' && (
          <_Campo label="Conclusiones" fullWidth>
            <TextAreaNV value={d.obsConclusion} onChange={v => setCampo('obsConclusion', v)} rows={4} autoAlto
              placeholder="Opcional. Si la dejas vacía, «Revisar» te propone una con todo lo diligenciado." />
          </_Campo>
        )}
        {documentoVisita(d.documento) === 'ACTA' && (
          <_MedidorActa texto={_conclusionesActaD(d)} celda="conclusiones"
            onUsarInforme={_actaGeneradaD(d) ? null : () => cambiarDocumento('INFORME')} />
        )}
        {/* Un solo «Revisar» para todo, al final: ya está todo diligenciado. */}
        {/* Abierta, la revisión ocupa el sitio del bloque: un solo «Revisión del texto». */}
        {revisionPanel ? _panelRevision() : _bloqueRevision()}
      </_Seccion>

      {/* El botón de guardar ya no vive aquí: pasó a la barra fija inferior
          (ver final del componente). En campo el inspector tenía que recorrer
          ~3000px de formulario para llegar a la acción principal. */}

      {/* ── ENTREGABLES DE LA VISITA ──────────────────────────────
          Centro de control del cierre: evidencia primero (carpeta, PQR,
          fotos, orden), después los documentos que se generan de ella.
          Cada pieza es un renglón con estado + acciones; el único botón
          relleno de la pantalla es "Guardar cambios" (barra fija). Antes
          eran hasta 4 botones a ancho completo compitiendo entre sí. */}
      <div className="form-seccion nv-entregables">
        <span className="form-seccion-titulo">Entregables de la visita</span>

        {/* Antes del primer guardado no hay entregables: la transición se
            cuenta, no se oculta (documentos, fotos y escáner dependen de la
            carpeta de Drive, que nace al guardar). Vale también para una
            visita ya asignada (fila en BD, estado ASIGNADO): el guardado que
            la inicia es siempre manual. */}
        {!filaEditando || sinIniciar ? (
          <div className="ent-aviso">
            Guarda la visita para iniciarla y crear su carpeta en Drive. Después
            podrás subir fotos, escanear la orden de policía y generar el acta y
            el informe.
          </div>
        ) : (<>
          {motivoBloqueo && <div id="nv-motivo-generar" className="ent-motivo" role="status">{motivoBloqueo}</div>}
          {/* Carpeta en Drive — único acceso (antes aparecía dos veces: al
              final del formulario y dentro de la sección de fotos).
              El estado sale de `idCarpetaVisita`, la misma condición que
              habilita acta, informe y fotos (`sinCarpetaVisita`): con
              `linkDrive` este renglón decía «Creada» y ofrecía «Abrir»
              mientras el registro fotográfico decía «Requiere la carpeta en
              Drive» y no montaba el control de subida. */}
          <FilaEntregable
            icono={<Icon.Folder size={18} />}
            nombre="Carpeta en Drive"
            meta="Todos los archivos de la visita"
            estadoTono={d.idCarpetaVisita ? 'ok' : 'pend'}
            estadoTexto={d.idCarpetaVisita ? 'Creada' : 'Pendiente'}
          >
            {d.linkDrive && (
              <a href={d.linkDrive} target="_blank" rel="noopener noreferrer" className="btn-accion ent-btn">Abrir</a>
            )}
          </FilaEntregable>

          {/* Orden de policía escaneada. Va entre los entregables, y no junto
              al campo del N° de orden: `d.orden` se captura en dos sitios
              distintos (arriba en visita de oficio, en Suspensión para PQR) y
              duplicar el componente daría dos escáneres para el mismo PDF.
              El renglón lo renderiza el propio EscanerOrdenPolicia, que es
              quien conoce el link, las páginas y el estado de la sesión. */}
          {_hayOrdenReal(d.orden) && (
            <EscanerOrdenPolicia
              idCarpetaVisita={d.idCarpetaVisita}
              fila={filaEditando}
              radicadoFila={_radicadoFilaRef.current}
              idVisita={_idVisitaRef.current}
              orden={d.orden}
              linkInicial={d.linkOrdenPolicia}
              onSubido={link => setCampo('linkOrdenPolicia', link)}
            />
          )}

          {/* Acta de Inspección Ocular — F-GGO-46, paso 1: hoja de
              caracterización (así la llama la inspección, no "acta de
              caracterización" a secas). El código del formato lleva guiones
              de no separación (U+2011): un código no se parte en dos líneas
              en 390 px (igual en el informe F‑GGO‑43 y el registro). */}
          {/* Con «Informe técnico» no hay acta: el informe la reemplaza. */}
          {documentoVisita(d.documento) === 'ACTA' && (
          <FilaEntregable
            icono={<Icon.File size={18} />}
            nombre="Acta de Inspección Ocular"
            meta={'F‑GGO‑46 · hoja de cálculo + PDF'}
            estadoTono={d.linkXlsxActa ? 'ok' : (sinCarpetaVisita ? 'apagado' : 'pend')}
            estadoTexto={d.linkXlsxActa
              ? 'Generada'
              : (sinCarpetaVisita
                  ? 'Requiere la carpeta en Drive'
                  : (generandoActa ? 'Generando…' : 'Pendiente'))}
            procesando={generandoActa}
          >
            {d.linkXlsxActa ? (<>
              <a href={d.linkXlsxActa} target="_blank" rel="noopener noreferrer" className="btn-accion ent-btn">Abrir</a>
              {/* Regenerar rehace el acta en Drive: separado del acceso de
                  solo lectura y reducido a icono con nombre accesible. */}
              <button type="button" onClick={regenerarActa} disabled={generacionBloqueada}
                aria-describedby={motivoBloqueo ? 'nv-motivo-generar' : undefined}
                className="btn-icono" aria-label="Regenerar el acta F-GGO-46"
                aria-busy={generandoActa} title="Regenerar acta">
                {generandoActa
                  ? <span className="spinner-btn" aria-hidden="true" />
                  : <Icon.Refresh size={18} />}
              </button>
            </>) : sinCarpetaVisita ? null : (
              /* Sin carpeta no hay botón: un «Generar» apagado en cada
                 renglón repetía lo que ya dice el aviso de arriba. */
              <button onClick={generarActa} disabled={generacionBloqueada} aria-busy={generandoActa}
                aria-describedby={motivoBloqueo ? 'nv-motivo-generar' : undefined} title={motivoBloqueo || undefined}
                className="btn-accion ent-btn">
                {generandoActa && <span className="spinner-btn" aria-hidden="true" />}
                Generar
              </button>
            )}
          </FilaEntregable>
          )}

          {/* Informe F-GGO-43: oculto en visitas COMPLETADAS — la visita
              está cerrada y su informe ya se subió (LINK_DOCX_INFORME). */}
          {estadoVisita !== 'COMPLETADO' && (
            <FilaEntregable
              icono={<Icon.File size={18} />}
              nombre="Informe de inspección"
              meta={'F‑GGO‑43 · documento de texto'}
              estadoTono={d.linkDocxInforme ? 'ok' : (sinCarpetaVisita ? 'apagado' : 'pend')}
              estadoTexto={d.linkDocxInforme
                ? 'Generado'
                : (sinCarpetaVisita
                    ? 'Requiere la carpeta en Drive'
                    : (subiendoInforme ? 'Subiendo…' : (abriendoInforme ? 'Abriendo…' : 'Pendiente')))}
              procesando={abriendoInforme || subiendoInforme}
            >
              {/* Sin carpeta, nada: el aviso de arriba ya lo dice. Con carpeta,
                  «Generar»/«Abrir» en la primera celda, alineado con los demás
                  renglones, y en la de 44 px el ↻. El informe hecho por fuera
                  de la app (icono de subir) va a la derecha del ↻, o en su
                  lugar si aún no hay informe: antes iba a la izquierda y
                  corría «Abrir» 50 px respecto de los otros renglones. */}
              {!sinCarpetaVisita && (<>
              {d.linkDocxInforme
                ? <a href={d.linkDocxInforme} target="_blank" rel="noopener noreferrer" className="btn-accion ent-btn">Abrir</a>
                : (
                <button onClick={generarInforme} disabled={generacionBloqueada} aria-busy={abriendoInforme}
                  aria-describedby={motivoBloqueo ? 'nv-motivo-generar' : undefined} title={motivoBloqueo || undefined}
                  className="btn-accion ent-btn">
                  {abriendoInforme && <span className="spinner-btn" aria-hidden="true" />}
                  Generar
                </button>
              )}
              <span className="ent-par">
              {d.linkDocxInforme && (
                /* Mismo patrón de regeneración del acta: el informe ya
                   generado no vuelve a ofrecer un CTA de texto completo. */
                <button type="button" onClick={generarInforme} disabled={generacionBloqueada}
                  className="btn-icono" aria-label="Regenerar el informe F-GGO-43"
                  aria-busy={abriendoInforme} title="Regenerar informe">
                  {abriendoInforme
                    ? <span className="spinner-btn" aria-hidden="true" />
                    : <Icon.Refresh size={18} />}
                </button>
              )}
              {/* No exige lo diligenciado ni el guardado al día — el
                  documento ya viene escrito —, solo la carpeta de Drive. */}
              <button type="button" onClick={() => inputInformeRef.current && inputInformeRef.current.click()}
                disabled={docOcupado}
                className="btn-icono" aria-label="Subir un informe hecho por fuera de la app (Word .docx)"
                aria-busy={subiendoInforme} title="Subir informe hecho por fuera (.docx)">
                {subiendoInforme
                  ? <span className="spinner-btn" aria-hidden="true" />
                  : <Icon.Upload size={18} />}
              </button>
              <input ref={inputInformeRef} type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={subirInformeExterno} style={{ display: 'none' }} />
              </span>
              </>)}
            </FilaEntregable>
          )}

          {/* Va al final de los entregables: es el único renglón con control
              de subida en el slot, así que su alto variable no debe empujar a
              los demás. */}
          {/* Registro fotográfico: fotos y documento en un solo renglón —
              las fotos existen para alimentar el registro, dos renglones
              contaban la misma pieza. La subida vive en el slot; el conteo
              es el único texto de estado visible de toda la zona y solo
              aparece cuando hay fotos. El PDF de la PQR NO va aquí: es un
              insumo de la visita, no algo que esta produzca — su acceso
              sigue junto al campo Radicado. */}
          <FilaEntregable
            icono={<Icon.Camera size={18} />}
            nombre="Registro fotográfico"
            meta={'Fotos de la visita · documento F‑GGO‑46'}
            estadoTono={d.linkRegistroFotos
              ? 'ok'
              : (sinCarpetaVisita
                  ? 'apagado'
                  : ((fotosInfo.enCola > 0 || fotosInfo.subidas > 0) ? 'pend' : 'apagado'))}
            estadoTexto={d.linkRegistroFotos
              ? 'Generado'
              : (sinCarpetaVisita
                  ? 'Requiere la carpeta en Drive'
                  : (fotosInfo.enCola > 0
                      ? 'Fotos en cola'
                      : (fotosInfo.subidas > 0 ? 'Pendiente de generar' : 'Requiere fotos')))}
            nota={fotosInfo.enCola > 0
              ? '⇡ ' + fotosInfo.enCola + ' en cola'
              : (fotosInfo.subidas > 0
                  ? fotosInfo.subidas + ' foto' + (fotosInfo.subidas === 1 ? '' : 's')
                  : null)}
            procesando={generandoRF || cargandoFotos}
            slot={d.idCarpetaFotos ? (
              <SeccionFotos idCarpetaFotos={d.idCarpetaFotos} fila={filaEditando} situacion={d.actuacion} onFotosChange={_reportarFotos} />
            ) : undefined}
          >
            {d.linkRegistroFotos ? (<>
              <a href={d.linkRegistroFotos} target="_blank" rel="noopener noreferrer" className="btn-accion ent-btn">Abrir</a>
              {/* Mismo patrón de regeneración del acta: icono ↻ con nombre
                  accesible. El link del RF no viaja por BD, así que el estado
                  «generado» solo vive en esta sesión; al reabrir la visita
                  vuelve a «Generar» (regenerar es idempotente en el backend). */}
              <button type="button" onClick={abrirModalFotos} disabled={generacionBloqueada || cargandoFotos}
                className="btn-icono" aria-label="Regenerar el registro fotográfico"
                aria-busy={generandoRF || cargandoFotos} title="Regenerar registro fotográfico">
                {(generandoRF || cargandoFotos)
                  ? <span className="spinner-btn" aria-hidden="true" />
                  : <Icon.Refresh size={18} />}
              </button>
            </>) : (fotosInfo.subidas > 0 ? (
              /* Sin fotos en Drive el botón no se pinta: «Generar» abriría un
                 modal vacío (P3-4 del review). Las fotos en cola tampoco
                 cuentan — el modal lista lo que ya está en la carpeta. Antes
                 solo se deshabilitaba si ADEMÁS faltaba la carpeta, así que con
                 carpeta y cero fotos quedaba activo. */
              <button onClick={abrirModalFotos}
                disabled={generacionBloqueada || cargandoFotos}
                aria-busy={generandoRF || cargandoFotos} className="btn-accion ent-btn">
                {(generandoRF || cargandoFotos) && <span className="spinner-btn" aria-hidden="true" />}
                Generar
              </button>
            ) : null)}
          </FilaEntregable>

        </>)}
      </div>

      {/* Revisión de fotos antes de generar el RF (ModalRegistroFotos) */}
      {modalFotos && (function() {
        const faltan = _fotosSinDescripcion(modalFotos);
        const describiendo = modalFotos.some(function(f) { return f.descBusy; });
        return (
          <ModalRegistroFotos
            fotos={modalFotos}
            onCambiar={setModalFotos}
            onDescribir={describirFotosModal}
            onCancelar={function() { setModalFotos(null); }}
            onGenerar={confirmarYGenerarRF}
            puedeGenerar={modalFotos.length > 0 && faltan === 0}
            etiquetaGenerar={modalFotos.length === 0 ? 'Sin fotos'
              : describiendo ? 'Describiendo…'
              // Sin pie no se genera: el texto dice por qué está deshabilitado.
              : faltan > 0 ? (faltan === 1 ? 'Falta 1 pie' : 'Faltan ' + faltan + ' pies')
              // Si se quitaron fotos, el botón lo dice: confirma que la exclusión surte efecto.
              : modalFotos.length < modalFotosTotal ? 'Generar con ' + modalFotos.length + ' de ' + modalFotosTotal
              : 'Generar'} />
        );
      })()}

      {/* El acceso a la carpeta de Drive ya no se duplica al final del
          formulario: vive como renglón de la zona de entregables. */}

      {/* La acción de guardar y su indicador de estado viven en la cabecera
          (.nv-acciones): la barra fija inferior se eliminó para recuperar
          ~92 px de formulario en campo. */}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//   SECCIÓN FOTOS — subida + descripción IA
// ══════════════════════════════════════════════════════════════

// Compresión en el cliente (2026-09-24): la foto de cámara viajaba entera
// (3-10 MB, +33 % por base64) por el salto de Apps Script. A 2000 px de lado
// largo sobra: el registro fotográfico la pone a 10 cm de alto y el informe
// F-GGO-43 usa la miniatura w1200. Queda en ~300-600 KB.
const FOTO_LADO_MAX      = 2000;
const FOTO_CALIDAD_JPEG  = 0.82;
const FOTO_MAX_ORIGINAL  = 40 * 1024 * 1024;
const FOTOS_CONCURRENCIA = 3;

// Decodificar una foto de 12 MP ocupa ~50 MB de memoria: con tres a la vez un
// Android de gama baja mata la pestaña. La compresión va de a una (tarda
// ~200 ms) y lo que corre en paralelo es la subida, que es lo lento.
let _fotoCompresionPrevia = Promise.resolve();
function _comprimirFoto(file) {
  const p = _fotoCompresionPrevia.then(function() { return _comprimirFotoAhora(file); });
  _fotoCompresionPrevia = p.catch(function() {});
  return p;
}

// Devuelve un File JPEG reducido, o el original si no se puede decodificar
// (HEIC en escritorio: el backend lo rechaza igual que antes) o si comprimir
// no lo achica. El <img> aplica la orientación EXIF al dibujar; el EXIF en sí
// se pierde, y nada del sistema lo lee.
async function _comprimirFotoAhora(file) {
  let url = null;
  try {
    url = URL.createObjectURL(file);
    const img = await new Promise(function(resolve, reject) {
      const i = new Image();
      i.onload  = function() { resolve(i); };
      i.onerror = function() { reject(new Error('no se pudo decodificar')); };
      i.src = url;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return file;
    const k = Math.min(1, FOTO_LADO_MAX / Math.max(w, h));
    if (k === 1 && file.type === 'image/jpeg' && file.size <= 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(w * k);
    canvas.height = Math.round(h * k);
    const ctx = canvas.getContext('2d');
    // Fondo blanco: un PNG con transparencia saldría negro en JPEG.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(function(resolve) {
      canvas.toBlob(resolve, 'image/jpeg', FOTO_CALIDAD_JPEG);
    });
    canvas.width = canvas.height = 0;   // Safari iOS libera el buffer solo así
    if (!blob || blob.size >= file.size) return file;
    const nombre = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg' });
  } catch (e) {
    console.warn('[fotos] sin comprimir:', file && file.name, e && e.message);
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

function SeccionFotos({ idCarpetaFotos, fila, situacion, onFotosChange }) {
  const [subiendo, setSubiendo] = React.useState(false);
  const [fotos, setFotos]       = React.useState([]);  // [{ nombre, link, descripcion }]
  const [cola, setCola]         = React.useState([]);   // archivos pendientes de subir
  const [progreso, setProgreso] = React.useState('');   // "Subiendo 2/5..."
  const inputRef = React.useRef(null);
  // La situación al momento de terminar la subida, no la del primer render.
  const situacionRef = React.useRef(situacion);
  situacionRef.current = situacion;

  // Fotos que ya viven en Drive: al reabrir una visita con 18 fotos, la lista
  // arrancaba vacía y el inspector solo podía verlas abriendo el modal del
  // registro fotográfico. Una sola lectura; el conteo del panel de estado sale
  // de aquí vía onFotosChange.
  React.useEffect(function() {
    if (!idCarpetaFotos || typeof listarFotosActa !== 'function') return;
    let cancelado = false;
    listarFotosActa(idCarpetaFotos).then(function(r) {
      if (cancelado || !r || !r.ok) return;
      const previas = (r.fotos || []).map(function(f) {
        return { id: f.id, nombre: f.nombre, link: f.link, descripcion: f.descripcion || '', enDrive: true };
      });
      // Las de esta sesión van después y sin repetir: la lectura puede llegar
      // cuando ya se subió algo (o incluirlo, si Drive alcanzó a indexarlo).
      setFotos(function(prev) {
        const yaEstan = {};
        prev.forEach(function(f) { yaEstan[f.nombre] = true; });
        return previas.filter(function(f) { return !yaEstan[f.nombre]; }).concat(prev);
      });
    }).catch(function() { /* offline: solo se ve lo de esta sesión */ });
    return function() { cancelado = true; };
  }, [idCarpetaFotos]);

  async function _aBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve((r.result || '').toString().split(',')[1] || '');
      r.onerror = () => reject(new Error('No se pudo leer la foto'));
      r.readAsDataURL(file);
    });
  }

  function alSeleccionar(e) {
    const archivos = Array.from(e.target.files || []);
    if (!archivos.length) return;
    // El tope de 8 MB se aplica DESPUÉS de comprimir (ver subirTodos): una
    // foto de cámara de 10 MB queda en ~500 KB. Aquí solo se descarta lo
    // absurdo, que además podría agotar la memoria del teléfono al decodificar.
    const validos = archivos.filter(function(f) { return f.size <= FOTO_MAX_ORIGINAL; });
    const rechazados = archivos.length - validos.length;
    if (rechazados > 0) {
      appAlert(rechazados + ' foto(s) superan 40 MB y fueron excluidas.', { tono: 'aviso', titulo: 'Fotos grandes' });
    }
    if (validos.length === 0) return;
    // `orden` fija el lugar en el registro fotográfico: con subidas en
    // paralelo la fecha de creación en Drive ya no respeta la selección.
    const t0 = Date.now();
    const items = validos.map(function(f, i) { return { file: f, orden: t0 + i }; });
    // Acumular en lugar de sobrescribir: si el inspector selecciona más fotos
    // mientras se está subiendo el batch anterior, las nuevas se agregan a la
    // cola y se procesan a continuación (antes se perdían).
    setCola(function(prev) { return prev.concat(items); });
    // Reset input para poder seleccionar los mismos archivos de nuevo
    if (inputRef.current) inputRef.current.value = '';
  }

  // Ref con la cola actual — los trabajadores leen aquí para detectar nuevas
  // adiciones después de iniciar la subida.
  const colaRef = React.useRef([]);
  React.useEffect(function() { colaRef.current = cola; }, [cola]);

  // Cancelar solo al desmontar. Antes el cleanup del effect de subida marcaba
  // `cancelado` en cada cambio de sus dependencias — el propio
  // setSubiendo(true) lo disparaba — y la subida avanzaba de a una foto por
  // ciclo de render, por accidente.
  const montadoRef = React.useRef(true);
  React.useEffect(function() {
    montadoRef.current = true;
    return function() { montadoRef.current = false; };
  }, []);

  // Subir la cola, FOTOS_CONCURRENCIA a la vez. Cada llamada paga ~2-3 s fijos
  // del salto /exec → /macros/echo de Google, que no dependen del tamaño.
  React.useEffect(function() {
    if (cola.length === 0 || subiendo) return;
    async function subirTodos() {
      setSubiendo(true);
      var siguiente = 0, terminadas = 0, publicadas = 0;
      var fallidas = [];   // fotos que no se pudieron subir (antes fallaban en silencio)
      // Resultado por posición en la cola: terminan en desorden pero la
      // grilla se llena en el orden de selección (null = falló).
      var resultados = [];
      function publicarEnOrden() {
        var nuevas = [];
        while (publicadas < siguiente && resultados[publicadas] !== undefined) {
          if (resultados[publicadas]) nuevas.push(resultados[publicadas]);
          publicadas++;
        }
        if (nuevas.length) setFotos(function(prev) { return prev.concat(nuevas); });
      }
      function pintarProgreso() {
        setProgreso('Subiendo ' + terminadas + '/' + colaRef.current.length + '...');
      }
      async function trabajador() {
        // Loop dinámico: la cola puede crecer mientras subimos (ver alSeleccionar).
        while (montadoRef.current && siguiente < colaRef.current.length) {
          var i = siguiente++;
          var item = colaRef.current[i];
          try {
            var f = await _comprimirFoto(item.file);
            if (f.size > 8 * 1024 * 1024) throw new Error('supera 8 MB aun comprimida');
            var base64 = await _aBase64(f);
            var r = await subirFotoConDescripcion(idCarpetaFotos, base64, f.type, '', f.name, item.orden);
            // Un ok:false del backend (p. ej. tipo no reconocido) antes entraba
            // a la grilla como foto «subida» sin link.
            if (!r || r.ok === false) throw new Error((r && r.error) || 'respuesta inválida');
            resultados[i] = {
              nombre: r.nombre || f.name,
              link:   r.link,
              descripcion: r.descripcion || '',
              pendiente: !!r.encolado,  // sin red: foto pendiente de subir a Drive
              localId: r.localId || null,   // permite parchear el link cuando sincronice offline
            };
          } catch (err) {
            console.warn('Error subiendo foto:', err);
            fallidas.push(item.file.name || 'foto ' + (i + 1));
            resultados[i] = null;
          }
          terminadas++;
          if (montadoRef.current) { publicarEnOrden(); pintarProgreso(); }
        }
      }
      pintarProgreso();
      var trabajadores = [];
      for (var w = 0; w < FOTOS_CONCURRENCIA; w++) trabajadores.push(trabajador());
      await Promise.all(trabajadores);
      if (!montadoRef.current) return;
      // Truncar la cola: si creció después de que los trabajadores terminaron,
      // dejar las nuevas para que el siguiente ciclo las procese.
      var procesadas = siguiente;
      setCola(function(prev) { return prev.slice(procesadas); });
      setProgreso('');
      setSubiendo(false);
      // Pre-descripción en segundo plano (sin esperarla): cuando el inspector
      // abra el registro fotográfico, los pies ya están en la caché de Drive.
      // Solo si algo llegó a Drive (lo encolado sin señal aún no existe allí)
      // y si ya hay situación encontrada: sin ella la descripción sale sin
      // contexto y queda guardada, y «Describir fotografías» ya no la rehace.
      // Sin situación, las fotos quedan para que el inspector las pida.
      var enDrive = resultados.some(function(x) { return x && !x.pendiente; });
      var situacionActual = String(situacionRef.current || '').trim();
      if (enDrive && situacionActual && typeof preDescribirFotosCarpeta === 'function') {
        preDescribirFotosCarpeta(idCarpetaFotos, situacionActual);
      }
      // Antes el error solo iba a console.warn: la foto desaparecía de la lista
      // sin avisar y el inspector creía que estaba en Drive.
      if (fallidas.length) {
        appAlert('No se pudieron subir ' + fallidas.length + ' foto(s):\n• ' + fallidas.join('\n• ') +
                 '\n\nVuelva a seleccionarlas para reintentar.', { tono: 'error', titulo: 'Fotos no subidas' });
      }
    }
    subirTodos();
  }, [cola.length, subiendo, idCarpetaFotos]);

  // Escuchar sincronización offline de fotos individuales
  React.useEffect(function() {
    if (typeof offlineOnItemSynced !== 'function') return;
    var unsub = offlineOnItemSynced(function(evt) {
      if (evt.tipo !== 'subirFoto') return;
      if (!evt.resultado || !evt.resultado.link) return;
      setFotos(function(prev) {
        return prev.map(function(f) {
          return f.localId === evt.id
            ? Object.assign({}, f, { link: evt.resultado.link, pendiente: false, nombre: evt.resultado.nombre || f.nombre })
            : f;
        });
      });
    });
    return unsub;
  }, []);

  // Reportar el conteo (subidas vs en cola) al panel de estado de la
  // visita. En ref con effect: llamar al callback directo dentro del render
  // dispararía setState ajeno durante el render de este componente.
  const onFotosChangeRef = React.useRef(onFotosChange);
  onFotosChangeRef.current = onFotosChange;
  React.useEffect(function() {
    if (typeof onFotosChangeRef.current !== 'function') return;
    onFotosChangeRef.current({
      subidas: fotos.filter(function(f) { return !f.pendiente; }).length,
      enCola:  fotos.filter(function(f) { return !!f.pendiente; }).length,
    });
  }, [fotos]);

  // Una sola fila de miniaturas y una celda «+N» que muestra el resto. Con 18
  // fotos la grilla medía 547 px y era lo que hacía que la columna de
  // entregables no cupiera en la pantalla. Las columnas las decide el CSS
  // (auto-fill): se leen de la grilla ya pintada y se vuelven a leer si
  // cambia su ancho.
  const grillaRef = React.useRef(null);
  const [colsGrilla, setColsGrilla] = React.useState(0);
  const [verTodas, setVerTodas] = React.useState(false);
  React.useEffect(function() {
    const el = grillaRef.current;
    if (!el) return;
    function medir() {
      const n = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      setColsGrilla(n);
    }
    medir();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return function() { ro.disconnect(); };
  }, [fotos.length > 0]);

  // Va embebido en el renglón "Registro fotográfico" de la zona de
  // entregables: sin tarjeta propia (sería tarjeta dentro de tarjeta) y
  // sin título (el renglón ya nombra la pieza) ni link a Drive (el
  // renglón de la carpeta es el único acceso).
  //
  // Las fotos van en grilla de miniaturas, no en lista: con 18 fotos la lista
  // medía ~790 px y empujaba todo el formulario hacia abajo.

  // Id de Drive para la miniatura: `listarFotosActa` lo trae; para una foto
  // recién subida se saca del link (`.../d/<id>/view`) sin pedir nada más.
  function _idFoto(f) {
    if (f.id) return f.id;
    const m = (f.link || '').match(/[-\w]{25,}/);
    return m ? m[0] : '';
  }

  // Miniatura w160, la misma fuente que el modal de registro fotográfico. Una
  // foto en cola no tiene id de Drive todavía: se marca con ⇡ sobre ámbar, que
  // es lo que el inspector necesita saber de ella (falta subirla).
  function _celdaFoto(f, i) {
    const id = f.pendiente ? '' : _idFoto(f);
    const etiqueta = (f.pendiente ? 'Pendiente de subir: ' : '') + f.nombre +
                     (f.descripcion ? ' — ' + f.descripcion : '');
    const clase = 'fg-celda' + (f.pendiente ? ' fg-pendiente' : '');
    const key   = f.link || f.localId || (f.nombre + '_' + i);
    const cuerpo = [
      id ? <img key="i" src={'https://drive.google.com/thumbnail?id=' + id + '&sz=w160'}
                alt="" loading="lazy" /> : null,
      <span key="n" className="fg-num" aria-hidden="true">{f.pendiente ? '⇡' : (i + 1)}</span>,
    ];
    if (f.pendiente || !f.link) {
      return <div key={key} className={clase} title={etiqueta} aria-label={etiqueta}>{cuerpo}</div>;
    }
    return (
      <a key={key} className={clase} title={etiqueta} aria-label={etiqueta}
         href={f.link} target="_blank" rel="noopener noreferrer">{cuerpo}</a>
    );
  }

  return (
    <div className="ent-slot-fotos">
      <div>

        {/* Mismo tinte que «Generar»/«Abrir»: antes llevaba filete amarillo
            y 15 px, más fuerte que las acciones de los documentos. */}
        <label className="btn-accion fotos-elegir" style={{
          cursor: subiendo ? 'wait' : 'pointer', opacity: subiendo ? 0.55 : 1,
        }}>
          {subiendo
            ? <span className="spinner-btn" aria-hidden="true" />
            : <Icon.Plus size={18} />}
          {/* «Seleccionar fotos» y no «Toca para…»: la misma pantalla se usa en
              escritorio, donde no se toca nada. */}
          {subiendo ? progreso : 'Seleccionar fotos'}
          <input ref={inputRef} type="file" accept="image/*" multiple
            onChange={alSeleccionar} disabled={subiendo} style={{ display: 'none' }} />
        </label>

        {fotos.length > 0 && (function() {
          const resumir = !verTodas && colsGrilla > 1 && fotos.length > colsGrilla;
          const vistas = resumir ? fotos.slice(0, colsGrilla - 1) : fotos;
          return (<>
            <div className="fotos-grilla" ref={grillaRef}>
              {vistas.map(_celdaFoto)}
              {resumir && (
                <button type="button" className="fg-celda fg-mas" onClick={function() { setVerTodas(true); }}
                  aria-label={'Ver las ' + fotos.length + ' fotos'}>
                  +{fotos.length - vistas.length}
                </button>
              )}
            </div>
            {verTodas && fotos.length > colsGrilla && (
              <button type="button" className="btn-texto fotos-menos" onClick={function() { setVerTodas(false); }}>
                Mostrar menos
              </button>
            )}
          </>);
        })()}
      </div>
    </div>
  );
}

window.NuevaVisitaScreen = NuevaVisitaScreen;
