// ═══════════════════════════════════════════════════════════════
// v6/buscar.jsx — Pantalla Buscar (E5c1, 2026-10-08)
//
// Un caso = una fila. La lógica (caso preparado, filtros facetados, orden
// «Más urgente») vive en utils.js (E5b) y se prueba en tests/buscar-e5.test.js;
// aquí solo se pinta y se maneja el estado de la pantalla.
//   - Casilla que filtra en vivo y sugiere convertir el texto en filtro
//     (barrio del POT, comuna, fecha, visitador o el caso mismo).
//   - Lo vivo marcado por defecto; las completadas se piden con su chip
//     (con aviso «también coinciden N completadas»). Un radicado completo
//     sale siempre y sube con «Coincidencia exacta».
//   - Vistas fijas + propias (localStorage) + enlace con los filtros (hash).
//   - ≥1600: filtros · lista · ficha. 1200–1599: filtros en cajón.
//     <1200: lista sola y la ficha abre como «Ver datos».
//   - La gestión del admin (asignar / reasignar / desasignar / completar /
//     seguimiento) vive en la ficha (prop `gestion` de FichaVisita), no en
//     cada fila: la fila lleva un solo botón lleno.
// Fuera de E5c1 (van en E5c2/E5d): mapa «Dónde», «Cuándo» con histograma,
// resumen de lo filtrado y exportar.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateB, useEffect: useEffectB, useMemo: useMemoB, useCallback: useCallbackB, useRef: useRefB } = React;

// ── Constantes de presentación ────────────────────────────────
const BQ_EST_L = {
  PENDIENTE: 'Pendientes', ASIGNADO: 'Asignadas',
  INICIADO: 'Iniciadas', COMPLETADO: 'Completadas',
};
const BQ_EST_DOT = { PENDIENTE: 'pend', ASIGNADO: 'asig', INICIADO: 'curso', COMPLETADO: 'hecha' };
const BQ_TIPO_L = { PQR: 'PQR', OFICIO: 'De oficio', V2: 'Sin radicado (V2)' };
const BQ_ORDENES = [
  ['urg', 'Más urgente'], ['rec', 'Más reciente'], ['rad', 'Radicado'],
  ['dir', 'Dirección'], ['mod', 'Última edición'],
];
const BQ_FALTA_FILA = { acta: 'Acta', orden: 'Orden escaneada', rf: 'Registro fotográfico' };

// Vistas propias y preferencia de Inicio («Ver en Buscar» con estados).
const BQ_VISTAS_KEY = 'cu_buscar_vistas_v1';
const BUSCAR_PREFS_KEY = 'cu_buscar_v1';

const BQ_LIMITE_INICIAL = 50;
const BQ_LIMITE_PASO = 50;

// El panel (ficha) existe desde este ancho: monta mapa y visor de PDF que en
// un teléfono no deben ni cargarse. 1200–1599 lista+ficha; ≥1600 tres columnas.
const BQ_ANCHO_PANEL = '(min-width: 1200px)';

function useMinAnchoBQ(media) {
  const hayMQ = typeof window.matchMedia === 'function';
  const [ancho, setAncho] = useStateB(() => hayMQ && window.matchMedia(media).matches);
  useEffectB(() => {
    if (!hayMQ) return;
    const mq = window.matchMedia(media);
    const alCambiar = () => setAncho(mq.matches);
    alCambiar();
    if (mq.addEventListener) mq.addEventListener('change', alCambiar); else mq.addListener(alCambiar);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', alCambiar); else mq.removeListener(alCambiar);
    };
  }, []);
  return ancho;
}

// ── Barrios del POT: índice compartido (E5a), cargado una vez ──
var _idxBarriosBQPromesa = null;
function _cargarIdxBarriosBQ() {
  if (_idxBarriosBQPromesa) return _idxBarriosBQPromesa;
  _idxBarriosBQPromesa = Promise.all([
    fetch('barrios-mapa.json').then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('comunas-mapa.json').then(r => r.ok ? r.json() : null).catch(() => null),
  ]).then(([barr, com]) => {
    if (!barr || !barr.barrios || !com || !com.proj) return null;
    registrarBarriosBuscar(barr.barrios);
    const idx = crearIndiceBarriosPot(barr.barrios, com.proj);
    // Los trazos de comunas y barrios para el mapa «Dónde» (E5c2).
    idx.mapas = { w: com.w, h: com.h, comunas: com.comunas, barrios: barr.barrios };
    return idx;
  });
  return _idxBarriosBQPromesa;
}

// ── Utilidades pequeñas de la pantalla ────────────────────────
function _normBQ(s) {
  let t = String(s == null ? '' : s).toUpperCase();
  if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return t.replace(/\s+/g, ' ').trim();
}
const _n0BQ = n => Number(n || 0).toLocaleString('es-CO');
const _pluralBQ = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
const _isoBQ = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const _iniMesBQ = (y, m) => new Date(y, m, 1);
const _finMesBQ = (y, m) => new Date(y, m + 1, 0);

// «sep 2026» / «09/2026» / «20/09/2026» / «2026» / «sep» → rango y rótulo.
function _interpretarFechaBQ(t, hoy) {
  const s = _normBQ(t).replace(/\./g, '');
  let m;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return { a: d, b: d, l: 'el ' + formatearFecha(d) };
  }
  if ((m = s.match(/^(\d{1,2})\/(\d{4})$/)) && +m[1] >= 1 && +m[1] <= 12) {
    const y = +m[2], k = +m[1] - 1;
    return { a: _iniMesBQ(y, k), b: _finMesBQ(y, k), l: 'en ' + _MESES_ES[k] + ' ' + y };
  }
  if ((m = s.match(/^([A-Z]{3,})\s*(?:DE\s*)?(\d{4})?$/))) {
    const k = _MESES_ES.findIndex(x => _normBQ(x).startsWith(m[1]));
    if (k >= 0) {
      let y = m[2] ? +m[2] : hoy.getFullYear();
      if (!m[2] && k > hoy.getMonth()) y--;
      return { a: _iniMesBQ(y, k), b: _finMesBQ(y, k), l: 'en ' + _MESES_ES[k] + ' ' + y };
    }
  }
  if ((m = s.match(/^(20[2-3]\d)$/)) && +m[1] >= 2024 && +m[1] <= hoy.getFullYear()) {
    const y = +m[1];
    return { a: new Date(y, 0, 1), b: new Date(y, 11, 31), l: 'en ' + y };
  }
  return null;
}

// Resalta la parte que coincidió. El índice se calcula sobre el texto
// normalizado con un mapa de posiciones: los acentos no descuadran el corte.
function MarcarBQ({ texto, q }) {
  const t = String(texto || '');
  const n = _normBQ(q);
  if (!n || !t) return t;
  let norm = '';
  const map = [];
  for (let i = 0; i < t.length; i++) {
    const nn = _normBQ(t[i]);
    for (let j = 0; j < nn.length; j++) { norm += nn[j]; map.push(i); }
  }
  const idx = norm.indexOf(n);
  if (idx < 0) return t;
  const ini = map[idx];
  const fin = (map[idx + n.length - 1] != null ? map[idx + n.length - 1] : ini) + 1;
  return <>{t.slice(0, ini)}<mark>{t.slice(ini, fin)}</mark>{t.slice(fin)}</>;
}

// ── Agrupación por caso ───────────────────────────────────────
// Un radicado con número es un caso (esRadicadoDeCaso); las filas V2 sin
// número van sueltas: cada una con clave propia (fase 0). La clave va en
// mayúsculas: «Oficio-…» y «OFICIO-…» son el mismo radicado.
function _claveGrupoBQ(c) {
  return c.tipo === 'V2' ? 'v2:' + c.id : c.nRad;
}
// La fila que representa al grupo en la lista: la viva. Si hay varias vivas,
// la iniciada; entre completadas, la más reciente.
const _ORDEN_REP_BQ = { INICIADO: 0, ASIGNADO: 1, PENDIENTE: 2, COMPLETADO: 3 };
function _repDeBQ(filas) {
  let mejor = null;
  for (let i = 0; i < filas.length; i++) {
    const c = filas[i];
    if (!mejor) { mejor = c; continue; }
    const a = _ORDEN_REP_BQ[c.estado] != null ? _ORDEN_REP_BQ[c.estado] : 9;
    const b = _ORDEN_REP_BQ[mejor.estado] != null ? _ORDEN_REP_BQ[mejor.estado] : 9;
    const ta = (c.fCierre || c.fVis) ? (c.fCierre || c.fVis).getTime() : 0;
    const tb = (mejor.fCierre || mejor.fVis) ? (mejor.fCierre || mejor.fVis).getTime() : 0;
    if (a < b || (a === b && a === 3 && ta > tb)) mejor = c;
  }
  return mejor;
}
// Cuántos casos (grupos) cumplen el predicado: cuenta una vez por radicado.
function _nGruposBQ(universo, pred) {
  const visto = new Map();
  let n = 0;
  for (let i = 0; i < universo.length; i++) {
    const c = universo[i];
    if (visto.get(c.clave) === 1) continue;
    if (pred(c)) { visto.set(c.clave, 1); n++; }
    else if (!visto.has(c.clave)) visto.set(c.clave, 0);
  }
  return n;
}

// ── Vistas ────────────────────────────────────────────────────
// Las fijas de uso diario, SIN «Suspensiones sin vigilancia» (se quita en
// E5c1 por decisión del TASK). `soloTodo`: solo para quien ve todo.
function _vistasBaseBQ(veTodo, hoy) {
  const pm = _iniMesBQ(hoy.getFullYear(), hoy.getMonth() - 1);
  const v = [
    { id: 'vivo', n: 'Lo vivo', s: {} },
    { id: 'asignar', n: 'Por asignar', s: { estados: ['PENDIENTE'] }, soloTodo: true },
    { id: 'inf', n: 'Completadas sin informe', s: { estados: ['COMPLETADO'], falta: ['informe'] } },
    { id: 'mes', n: 'Completadas en ' + _MESES_ES[pm.getMonth()], s: { estados: ['COMPLETADO'], campo: 'cierre', desde: _isoBQ(pm), hasta: _isoBQ(_finMesBQ(pm.getFullYear(), pm.getMonth())) } },
    { id: 'mias', n: 'Mías en curso', s: { estados: ['ASIGNADO', 'INICIADO'], mias: true } },
  ];
  return v.filter(x => !x.soloTodo || veTodo);
}
function _leerVistasPropiasBQ() {
  try { return JSON.parse(localStorage.getItem(BQ_VISTAS_KEY)) || []; } catch (e) { return []; }
}
function _guardarVistasPropiasBQ(lista) {
  try { localStorage.setItem(BQ_VISTAS_KEY, JSON.stringify(lista)); } catch (e) { /* sin almacenamiento */ }
}
// Lo que cambia respecto de los filtros vacíos (sin `yo`, que es de sesión):
// la firma de una vista y lo que viaja en el enlace.
function _diffBQ(S) {
  const d = filtrosBuscarVacios();
  const o = {};
  Object.keys(d).forEach(k => {
    if (k === 'yo') return;
    if (JSON.stringify(S[k]) !== JSON.stringify(d[k])) o[k] = S[k];
  });
  return o;
}

// ── Estado inicial ────────────────────────────────────────────
// Orden: enlace (#f=) > preferencia de Inicio (cu_buscar_v1, solo estados).
function _initSBQ(usuario) {
  const S = filtrosBuscarVacios();
  S.yo = String(usuario && usuario.usuario || '').toUpperCase().trim();
  try {
    const prefs = JSON.parse(sessionStorage.getItem(BUSCAR_PREFS_KEY));
    if (prefs && Array.isArray(prefs.filtrosEstado)) {
      S.estados = prefs.filtrosEstado.filter(e => BUSCAR_ESTADOS.indexOf(e) !== -1);
    }
  } catch (e) { /* modo privado */ }
  const m = (location.hash || '').match(/(?:^|[#&])f=([^&]+)/);
  if (m) {
    try {
      const diff = JSON.parse(decodeURIComponent(m[1]));
      if (diff && typeof diff === 'object') {
        Object.keys(filtrosBuscarVacios()).forEach(k => {
          if (k !== 'yo' && diff[k] !== undefined) S[k] = diff[k];
        });
      }
    } catch (e) { /* enlace roto: se ignora */ }
  }
  return S;
}

// ═══════════════════════════════════════════════════════════════
// BuscarScreen
// ═══════════════════════════════════════════════════════════════
function BuscarScreen({ usuario, onContinuar, onNuevaVisita }) {
  const [datos, setDatos]       = useStateB([]);
  const [cargando, setCargando] = useStateB(true);
  const [error, setError]       = useStateB('');

  const [S, setS]               = useStateB(() => _initSBQ(usuario));
  const [qInput, setQInput]     = useStateB(S.q);
  const [orden, setOrden]       = useStateB('urg');
  const [selClave, setSelClave] = useStateB(null);
  const [limite, setLimite]     = useStateB(BQ_LIMITE_INICIAL);
  const [idxBarrios, setIdxBarrios] = useStateB(null);
  const [vistasPropias, setVistasPropias] = useStateB(_leerVistasPropiasBQ);
  const [guardandoVista, setGuardandoVista] = useStateB(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useStateB(false);
  const [toastBQ, setToastBQ]   = useStateB('');
  const [exportando, setExportando] = useStateB(false);
  const [modalIdx, setModalIdx] = useStateB(null);   // visita abierta en «Ver datos»
  const toastRef = useRefB(null);

  // Sugerencias de la casilla: lista + índice activo.
  const [sug, setSug] = useStateB([]);
  const [sugAct, setSugAct] = useStateB(-1);

  // ── Estado para acciones de gestión admin ──
  const [inspectores, setInspectores] = useStateB([]);
  const [busyFila, setBusyFila] = useStateB(null);           // _idx de fila en proceso
  const [asignandoFila, setAsignandoFila] = useStateB(null); // _idx con panel de inspector abierto

  const inputBuscarRef = useRefB(null);
  const conPanel = useMinAnchoBQ(BQ_ANCHO_PANEL);
  const esAdmin = usuario.rol === 'ADMIN';
  const veTodo = veTodasLasVisitas(usuario.rol);
  const hoy = useMemoB(() => new Date(), []);

  const activos = activosBuscar(S);
  const nQuien = S.visitador.length + (S.mias ? 1 : 0);   // el resto de «quien» va en «Más filtros»
  const nActivos = activos.total;

  // ── Carga de datos ──
  useEffectB(() => { cargar(); }, []);
  useEffectB(() => suscribirVisitas(() => cargar(false, true)), []);
  useEffectB(() => {
    _cargarIdxBarriosBQ().then(setIdxBarrios).catch(() => {});
  }, []);

  async function cargar(forzar, silencioso) {
    if (!silencioso) { setCargando(true); setError(''); }
    try {
      const { datos: all } = await leerVisitas(forzar ? { forzar: true } : undefined);
      setDatos(all);
    } catch (e) { if (!silencioso) setError(e.message); }
    setCargando(false);
  }

  // Visitadores activos (filtro Quién y sugerencias) desde USUARIOS.
  useEffectB(() => {
    if (!veTodo) return;
    listarInspectoresActivos().then(lista => setInspectores(lista || []))
      .catch(() => {});
  }, [veTodo]);

  // Escucha del generador F-GGO-43 (pestaña hija): registra el link en BD.
  useEffectB(() => {
    function onMsg(ev) {
      if (ev.origin !== window.location.origin) return;
      var m = ev && ev.data;
      if (m && m.tipo === 'informe-f43-subido' && m.link) {
        setDatos(prev => prev.map(r =>
          r._idx === parseInt(m.fila, 10)
            ? { ...r, 'LINK_DOCX_INFORME': m.link }
            : r
        ));
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // ── Casos y filtrado ──
  // Un caso preparado por fila (E5b), con su clave de grupo. `hoy` fijo por
  // sesión: los días no cambian a mitad de lista.
  const casos = useMemoB(() => {
    const l = datos.map(f => prepararCasoBuscar(f, idxBarrios, hoy));
    l.forEach(c => { c.clave = _claveGrupoBQ(c); });
    return l;
  }, [datos, idxBarrios, hoy]);

  // El inspector ve lo suyo, las pendientes y las completadas (regla de
  // siempre); admin y supervisor, todo.
  const universo = useMemoB(
    () => universoBuscar(casos, usuario.rol, usuario.usuario),
    [casos, usuario]);

  // Filas que pasan → grupos → representante. La lista es de casos, no de
  // visitas: un radicado con varias visitas ocupa una fila.
  const lista = useMemoB(() => {
    const pasan = filtrarBuscar(universo, S);
    const g = new Map();
    pasan.forEach(c => {
      if (!g.has(c.clave)) g.set(c.clave, []);
      g.get(c.clave).push(c);
    });
    const todas = new Map();
    universo.forEach(c => {
      if (!todas.has(c.clave)) todas.set(c.clave, []);
      todas.get(c.clave).push(c);
    });
    const reps = [];
    g.forEach((filas, clave) => {
      const rep = _repDeBQ(filas);
      rep.todas = todas.get(clave) || filas;
      rep.nVisitasGrupo = rep.todas.filter(c => c.estado !== 'PENDIENTE').length;
      reps.push(rep);
    });
    return ordenarCasosBuscar(reps, orden, S.q);
  }, [universo, S, orden]);

  // Conteos por estado SIN la selección de estado (facetas): cuentan casos,
  // sobre los grupos del universo base.
  const conteosEstado = useMemoB(() => {
    const base = filtrarBuscar(universo, S, 'estado');
    const contados = new Map();
    const c = { PENDIENTE: 0, ASIGNADO: 0, INICIADO: 0, COMPLETADO: 0 };
    base.forEach(x => {
      if (contados.get(x.clave)) return;
      contados.set(x.clave, true);
      if (c[x.estado] != null) c[x.estado]++;
    });
    return c;
  }, [universo, S]);
  // Bases de «Dónde» y «Cuándo»: todo menos su propio filtro (E5c2).
  const baseLugar = useMemoB(() => filtrarBuscar(universo, S, 'lugar'), [universo, S]);
  const baseFecha = useMemoB(() => filtrarBuscar(universo, S, 'fecha'), [universo, S]);
  const totalGrupos = useMemoB(() => new Set(universo.map(c => c.clave)).size, [universo]);

  // «También coinciden N completadas»: no se esconden en silencio. Cuenta los
  // casos que ya no están en la lista (ni por estado ni por coincidencia exacta).
  const completadasOcultas = useMemoB(() => {
    if (!S.q || !S.estados.length || S.estados.indexOf('COMPLETADO') !== -1) return 0;
    const visibles = new Set(lista.map(c => c.clave));
    return _nGruposBQ(universo, c =>
      c.estado === 'COMPLETADO' && !visibles.has(c.clave) && pasaBuscar(c, S, 'estado'));
  }, [universo, S, lista]);

  // ── Filtros del panel, con conteo facetado (cuentan casos) ──
  const faceta = useCallbackB((pred) => _nGruposBQ(universo, pred), [universo]);
  const conteoGrupo = useCallbackB((valor, grupo, coincideValor) =>
    faceta(c => pasaBuscar(c, S, grupo) && coincideValor(c, valor)), [faceta, S]);

  // Valores presentes para los grupos sin lista fija.
  const valoresInfr = useMemoB(() => {
    const m = new Map();
    universo.forEach(c => c.infr.forEach(x => { if (x) m.set(x, (m.get(x) || 0) + 1); }));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  }, [universo]);
  const valoresObra = useMemoB(() => {
    const s = new Set();
    universo.forEach(c => { if (c.obra) s.add(c.obra); });
    return [...s];
  }, [universo]);
  const veredasU = useMemoB(() => {
    const s = new Set();
    universo.forEach(c => { if (c.vereda) s.add(c.vereda); });
    return [...s].sort();
  }, [universo]);
  const barriosPot = idxBarrios ? idxBarrios.lista.map(b => b.n) : [];

  // ── Selección (ficha) ──
  const sel = conPanel ? (lista.find(c => c.clave === selClave) || lista[0] || null) : null;
  const elegir = (c) => setSelClave(c.clave);

  // ── Acciones sobre S ──
  const parcharS = (parche) => setS(prev => Object.assign({}, prev, parche));
  const toggleEnArr = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  function limpiarTodo() {
    setQInput(''); setSug([]); setSugAct(-1);
    setS(() => { const base = filtrosBuscarVacios(); base.yo = String(usuario.usuario || '').toUpperCase(); return base; });
  }

  // Debounce: cada tecla filtra la lista (barato) pero no reordena 2000 filas
  // por golpe. Las sugerencias se recalculan en el mismo lapso.
  useEffectB(() => {
    const id = setTimeout(() => {
      setS(prev => prev.q === qInput.trim() ? prev : Object.assign({}, prev, { q: qInput.trim() }));
    }, 160);
    return () => clearTimeout(id);
  }, [qInput]);

  // Cambió un filtro: la paginación vuelve al inicio.
  useEffectB(() => { setLimite(BQ_LIMITE_INICIAL); }, [S, orden]);

  // La preferencia de Inicio («Ver en Buscar» con estados) sigue viva: se
  // escribe al cambiar la selección de estado para que volver de otra
  // pantalla no la pise con la vieja.
  useEffectB(() => {
    try { sessionStorage.setItem(BUSCAR_PREFS_KEY, JSON.stringify({ filtrosEstado: S.estados })); } catch (e) {}
  }, [S.estados]);

  // "/" enfoca la casilla; Esc la limpia. ↑/↓ recorren la lista con panel.
  useEffectB(() => {
    function onKey(e) {
      const t = e.target;
      const escribiendo = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '/' && !escribiendo) {
        e.preventDefault();
        inputBuscarRef.current && inputBuscarRef.current.focus();
      } else if (e.key === 'Escape' && filtrosAbiertos) {
        setFiltrosAbiertos(false);
      } else if (e.key === 'Escape' && t === inputBuscarRef.current && !sug.length) {
        // Con sugerencias abiertas, el primer Escape solo las cierra
        // (lo hace el onKeyDown del input).
        setQInput(''); parcharS({ q: '' });
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && conPanel && !escribiendo && lista.length) {
        e.preventDefault();
        const i = lista.findIndex(c => c.clave === (sel ? sel.clave : ''));
        const j = Math.max(0, Math.min(lista.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        if (lista[j] && j !== i) {
          setSelClave(lista[j].clave);
          const f = document.querySelector('.bq-fila.sel');
          f && f.scrollIntoView({ block: 'nearest' });
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtrosAbiertos, conPanel, lista, sel, sug]);

  // Al abrir el cajón de filtros con la lista recorrida, subirlo a la vista
  // (queda oculto tras el bloque fijo). <900 scrollea el documento;
  // 900–1599 scrollea #content-desktop.
  useEffectB(() => {
    if (!filtrosAbiertos) return;
    const panel = document.getElementById('buscar-filtros');
    const fijo = document.querySelector('.buscar-fijo');
    if (!panel || !fijo) return;
    const delta = panel.getBoundingClientRect().top - fijo.getBoundingClientRect().bottom;
    if (delta >= 0) return;
    const cont = panel.closest('#content-desktop');
    if (cont && cont.scrollHeight > cont.clientHeight) cont.scrollBy(0, delta);
    else window.scrollBy(0, delta);
  }, [filtrosAbiertos]);

  function toast(msg) {
    setToastBQ(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToastBQ(''), 2600);
  }

  // ── Acciones admin: asignar, desasignar, completar, nueva visita ──
  const datosRef = useRefB(datos);
  datosRef.current = datos;
  const adminAsignar = useCallbackB(async (fila, inspector, f, fechaAsignacion) => {
    // Relevar una visita INICIADA no es lo mismo que asignar una pendiente:
    // el backend conserva el estado, pero por la regla del diligenciador el
    // inspector anterior deja de verla, y su borrador local (localStorage)
    // no viaja — lo que no haya guardado se queda en su dispositivo.
    const estActual = normalizarEstado(f ? (f['ESTADO VISITA'] || f[13] || '') : '');
    if (estActual === 'INICIADO') {
      const actual = primerVisitador(visitadoresBD(f));
      const ok = await appConfirm(
        'Esta visita está INICIADA' + (actual ? ' por ' + actual : '') + '.\n\n' +
        'Al pasarla a ' + inspector + ' conserva el estado y todo lo guardado en BD, ' +
        'pero ' + (actual || 'el inspector actual') + ' dejará de verla y se perderá lo que ' +
        'aún no haya guardado en su dispositivo.',
        { titulo: 'Reasignar visita iniciada', btnOk: 'Reasignar', peligro: true }
      );
      if (!ok) return;
    }
    setBusyFila(fila);
    try {
      await gasPost({
        accion: 'asignarRadicado', fila, inspector,
        radicadoConocido: (f && f['RADICADO']) || '',
        fechaAsignacion: fechaAsignacion || hoyDDMMAAAA(),
      });
      invalidarCache('visitas');
      setAsignandoFila(null);
      await cargar(true);
    } catch (e) {
      // La respuesta puede perderse en el segundo salto de Google con la
      // escritura ya hecha: se recarga igual para mostrar lo que quedó en BD.
      invalidarCache('visitas'); cargar(true);
      await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' });
    }
    setBusyFila(null);
  }, [cargar]);

  const adminAsignarNuevaVisita = useCallbackB(async (filaOrigen, inspector, fechaAsignacion) => {
    setBusyFila(filaOrigen);
    try {
      const fOrigen = datosRef.current.find(x => x._idx === filaOrigen);
      const r = await gasPost({
        accion: 'crearNuevaVisitaAsignada',
        radicadoConocido: (fOrigen && fOrigen['RADICADO']) || '',
        fila: filaOrigen, inspector,
        fechaAsignacion: fechaAsignacion || hoyDDMMAAAA(),
      });
      if (r && r.ok === false) throw new Error(r.error || 'Error desconocido');
      invalidarCache('visitas');
      setAsignandoFila(null);
      await cargar(true);
      await appAlert('Visita N°' + (r.nVisita || '?') + ' creada y asignada a ' + inspector + '.',
        { tono: 'exito', titulo: 'Nueva visita asignada' });
    } catch (e) {
      // La respuesta puede perderse en el segundo salto de Google con la
      // escritura ya hecha: se recarga igual para mostrar lo que quedó en BD.
      invalidarCache('visitas'); cargar(true);
      await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' });
    }
    setBusyFila(null);
  }, [cargar]);

  const adminDesasignar = useCallbackB(async (fila, rad) => {
    const ok = await appConfirm(
      '¿Quitar asignación de ' + (rad || 'este radicado') + '?\nVolverá a estado PENDIENTE.',
      { titulo: 'Desasignar', btnOk: 'Desasignar', peligro: true }
    );
    if (!ok) return;
    setBusyFila(fila);
    try {
      await gasPost({ accion: 'desasignarRadicado', fila, radicadoConocido: rad || '' });
      invalidarCache('visitas');
      await cargar(true);
    } catch (e) {
      // La respuesta puede perderse en el segundo salto de Google con la
      // escritura ya hecha: se recarga igual para mostrar lo que quedó en BD.
      invalidarCache('visitas'); cargar(true);
      await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' });
    }
    setBusyFila(null);
  }, [cargar]);

  const adminCompletar = useCallbackB(async (fila, fechaAsig) => {
    // Paridad V2: si la visita tiene orden de suspensión preventiva
    // (SUSPENSION=SI + N° ORDEN DE POLICIA) y NO tiene oficio de vigilancia
    // generado aún, ofrecer generarlo antes de completar.
    const f = datos.find(x => x._idx === fila);
    const suspSi = f && (f['SUSPENSION DE LA OBRA'] || '').toString().trim().toUpperCase() === 'SI';
    const tieneOrden = f && (f['N° ORDEN DE POLICIA'] || f['N ORDEN DE POLICIA'] || '').toString().trim();
    const sinOficio = f && !(f['LINK_SOLICITUD_VIGILANCIA'] || '').toString().trim();
    const requiereVigilancia = !!(f && suspSi && tieneOrden && sinOficio);

    let oficioGenerado = null;
    if (requiereVigilancia) {
      const generar = await appConfirm(
        'Esta visita tiene orden de suspensión preventiva y aún no se ha generado el oficio de Vigilancia Policía.\n\n¿Generar el oficio antes de completar?',
        { tono: 'aviso', titulo: 'Solicitud de vigilancia pendiente', btnOk: 'Generar oficio', btnCancel: 'Completar sin oficio' }
      );
      if (generar) {
        setBusyFila(fila);
        try {
          const idCarpeta = extraerIdCarpetaDrive(f['LINK_DRIVE'] || '');
          if (!idCarpeta) {
            await appAlert('La visita no tiene carpeta de Drive asociada.', { tono: 'aviso', titulo: 'Sin carpeta' });
            setBusyFila(null);
            return;
          }
          oficioGenerado = await generarSolicitudVigilancia({
            fila: f._idx,
            idCarpetaVisita: idCarpeta,
            radicado:        f['RADICADO'] || '',
            radicadoConocido: f['RADICADO'] || '',
            // La celda puede llegar como Date serializada a ISO: el nombre del
            // archivo salía «…_20260924T05:00:00.000Z». Se manda DD/MM/YYYY.
            fechaVisita:     formatearFecha(f['FECHA DE VISITA']) || '',
            nOrdenPolicia:   f['N° ORDEN DE POLICIA'] || f['N ORDEN DE POLICIA'] || '',
            direccion:       f['DIRECCION INFRACCION'] || f['DIRECCION'] || '',
            barrio:          f['BARRIO/VEREDA'] || f['BARRIO'] || '',
          });
          // Con la orden ya escaneada, deja armado el PDF único para la
          // policía (solicitud + orden). Sin orden todavía no arma nada.
          await armarSolicitudUnificada(f._idx, idCarpeta, f['RADICADO'] || '');
        } catch (e) {
          await appAlert('Error generando oficio: ' + e.message + '\n\nLa visita NO se marcó como completada.', { tono: 'error', titulo: 'Error' });
          setBusyFila(null);
          return;
        }
        setBusyFila(null);
      }
    }

    // Antes el oficio se generaba en silencio y se pasaba directo a
    // «¿Marcar como COMPLETADO?»: parecía que no se había generado. Se avisa
    // y se ofrece abrirlo — el clic en «Abrir oficio» es un gesto nuevo, así
    // que window.open no lo bloquea el navegador (tras la espera sí lo haría).
    if (oficioGenerado && oficioGenerado.linkDoc) {
      const avisos = [oficioGenerado.aviso, oficioGenerado.avisoLink].filter(Boolean).join('\n\n');
      const abrir = await appConfirm(
        (oficioGenerado.yaExistia
          ? 'El oficio de Vigilancia Policía ya existía en la carpeta de la visita.'
          : 'Oficio de Vigilancia Policía generado en la carpeta de la visita.')
        + (avisos ? '\n\n' + avisos : ''),
        { tono: avisos ? 'aviso' : 'info', titulo: 'Oficio de vigilancia', btnOk: 'Abrir oficio', btnCancel: 'Seguir' }
      );
      if (abrir) window.open(oficioGenerado.linkDoc, '_blank', 'noopener,noreferrer');
    }

    const ok = await appConfirm('¿Marcar como COMPLETADO?', {
      tono: 'info', titulo: 'Completar visita', btnOk: 'Completar',
    });
    if (!ok) return;
    setBusyFila(fila);
    try {
      const dias = fechaAsig ? diasDesde(fechaAsig) : '';
      await gasPost({
        accion: 'completarRegistro', fila,
        radicadoConocido: (f && f['RADICADO']) || '',
        dias: dias || '',
        fecha: hoyDDMMAAAA(),
      });
      // PDF del acta al cierre (best-effort): sin esto, LINK_PDF_ACTA nunca
      // se poblaba y el botón "Acta" abría el Sheet en vez del PDF.
      if (f && (f['LINK_XLSX_ACTA'] || '').trim() && !(f['LINK_PDF_ACTA'] || '').trim()) {
        generarPdfActaDesdeSheet(
          f._idx,
          f['LINK_XLSX_ACTA'],
          f['RADICADO'] || '',
          extraerIdCarpetaDrive(f['LINK_DRIVE'] || '')
        ).catch(e => console.warn('[completar] pdf acta best-effort:', e.message));
      }
      invalidarCache('visitas');
      await cargar(true);
    } catch (e) {
      // La respuesta puede perderse en el segundo salto de Google con la
      // escritura ya hecha: se recarga igual para mostrar lo que quedó en BD.
      invalidarCache('visitas'); cargar(true);
      await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' });
    }
    setBusyFila(null);
  }, [cargar, datos]);

  // ── Sugerencias de la casilla ──
  function calcularSugerencias(texto) {
    const n = _normBQ(texto);
    if (n.length < 2) return [];
    const out = [];
    const enLugar = c => pasaBuscar(c, S, ['lugar', 'q']);
    const f = _interpretarFechaBQ(texto, hoy);
    if (f) [['rad', 'Radicados', 'fRad'], ['vis', 'Visitados', 'fVis'], ['cierre', 'Cerrados', 'fCierre']].forEach(par => {
      const campo = par[2];
      const k = _nGruposBQ(universo, c => {
        const d = c[campo];
        return d && d >= f.a && d <= f.b && pasaBuscar(c, S, ['fecha', 'q']);
      });
      out.push({ g: 'Fecha', titulo: par[1] + ' ' + f.l, n: k, aplicar: () => parcharS({ campo: par[0], desde: _isoBQ(f.a), hasta: _isoBQ(f.b) }) });
    });
    const mc = n.match(/^(?:COMUNA|C)\s*(\d{1,2})$/);
    if (mc) {
      const k = String(+mc[1]);
      const existe = universo.some(c => !c.rural && c.comuna === k);
      if (existe) out.push({ g: 'Comuna', titulo: 'Comuna ' + k, n: _nGruposBQ(universo, c => c.comuna === k && enLugar(c)), aplicar: () => parcharS({ comunas: S.comunas.indexOf(k) === -1 ? S.comunas.concat([k]) : S.comunas }) });
    }
    barriosPot.filter(b => _normBQ(b).indexOf(n) !== -1).slice(0, 5).forEach(b =>
      out.push({ g: 'Barrio del POT', titulo: b, sub: 'Comuna ' + _comunaDeBarrioBuscar(b), n: _nGruposBQ(universo, c => c.barrio === b && enLugar(c)), aplicar: () => parcharS({ barrios: S.barrios.indexOf(b) === -1 ? S.barrios.concat([b]) : S.barrios }) }));
    veredasU.filter(v => _normBQ(v).indexOf(n) !== -1).slice(0, 3).forEach(v =>
      out.push({ g: 'Vereda', titulo: 'Vda. ' + v, n: _nGruposBQ(universo, c => c.vereda === v && enLugar(c)), aplicar: () => parcharS({ veredas: S.veredas.indexOf(v) === -1 ? S.veredas.concat([v]) : S.veredas }) }));
    if (veTodo) inspectores.map(u => String(u.nombre || '').toUpperCase())
      .filter(v => _normBQ(v).split(' ').some(p => p.startsWith(n)))
      .forEach(v => out.push({
        g: 'Visitador', titulo: titleCaseNombre(v),
        n: _nGruposBQ(universo, c => c.vis.indexOf(v) !== -1 && pasaBuscar(c, S, ['visitador', 'q'])),
        aplicar: () => parcharS({ visitador: S.visitador.indexOf(v) === -1 ? S.visitador.concat([v]) : S.visitador }),
      }));
    if (/\d{4,}/.test(n)) {
      const vistos = new Set();
      for (const c of universo) {
        if (vistos.has(c.clave)) continue;
        if (c.nRad.startsWith(n) || c.nReit.some(r => r.startsWith(n))) {
          vistos.add(c.clave);
          out.push({
            g: 'Caso', titulo: c.rad, sub: c.dir + ' · ' + (BQ_EST_L[c.estado] || c.estado || '').toLowerCase().replace(/s$/, ''), n: null,
            aplicar: () => { setQInput(c.rad); parcharS({ q: c.rad }); setSelClave(c.clave); },
          });
          if (vistos.size >= 4) break;
        }
      }
    }
    return out;
  }

  const onChangeQ = (v) => {
    setQInput(v);
    setSugAct(-1);
    setSug(calcularSugerencias(v));
  };
  const aplicarSug = (i) => {
    const s = sug[i];
    if (!s) return;
    if (s.g !== 'Caso') { setQInput(''); parcharS({ q: '' }); }
    s.aplicar();
    setSug([]); setSugAct(-1);
  };
  const onKeyQ = (e) => {
    if (e.key === 'ArrowDown' && sug.length) { e.preventDefault(); setSugAct((sugAct + 1) % sug.length); }
    else if (e.key === 'ArrowUp' && sug.length) { e.preventDefault(); setSugAct((sugAct - 1 + sug.length) % sug.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (sugAct >= 0) aplicarSug(sugAct);
      else { setSug([]); }
    } else if (e.key === 'Escape' && sug.length) { setSug([]); setSugAct(-1); }
  };

  // ── Vistas ──
  const firmaVista = v => JSON.stringify(_diffBQ(Object.assign(filtrosBuscarVacios(), v.s)));
  const firmaActual = JSON.stringify(_diffBQ(S));
  const vistasTodas = _vistasBaseBQ(veTodo, hoy).concat(vistasPropias.map(v => Object.assign({ propia: true }, v)));
  const contarVista = (v) => _nGruposBQ(universo, c => pasaBuscar(c, Object.assign(filtrosBuscarVacios(), v.s)));
  function aplicarVista(v) {
    setQInput(v.s.q || '');
    setS(prev => Object.assign(filtrosBuscarVacios(), { yo: prev.yo }, v.s));
  }
  function guardarVista(nombre) {
    nombre = (nombre || '').trim();
    if (!nombre) return false;
    const nuevas = vistasPropias.concat([{ id: 'p' + Date.now(), n: nombre, s: _diffBQ(S) }]);
    setVistasPropias(nuevas);
    _guardarVistasPropiasBQ(nuevas);
    toast('Vista «' + nombre + '» guardada en este equipo');
    return true;
  }
  function quitarVistaPropia(id) {
    const nuevas = vistasPropias.filter(v => v.id !== id);
    setVistasPropias(nuevas);
    _guardarVistasPropiasBQ(nuevas);
  }
  function copiarEnlace() {
    const diff = _diffBQ(S);
    let ok = false;
    try {
      history.replaceState(null, '', '#f=' + encodeURIComponent(JSON.stringify(diff)));
      navigator.clipboard.writeText(location.href);
      ok = true;
    } catch (e) { /* sin portapapeles */ }
    toast(ok ? 'Enlace copiado: abre Buscar con estos mismos filtros'
             : 'No se pudo copiar; la dirección quedó en la barra');
  }

  // ── Ver datos (<1200) con la gestión del admin dentro ──
  const gestionDe = (rep) => !esAdmin ? null : (
    <GestionBQ f={rep.f} todas={rep.todas.map(c => c.f)}
      inspectores={inspectores} busyFila={busyFila} asignandoFila={asignandoFila}
      setAsignandoFila={setAsignandoFila} onNuevaVisita={onNuevaVisita}
      onAsignar={adminAsignar} onAsignarNuevaVisita={adminAsignarNuevaVisita}
      onDesasignar={adminDesasignar} onCompletar={adminCompletar} />
  );
  const verDatos = (rep) => {
    setModalIdx(rep.f._idx);
    window.abrirVisitaDetail && window.abrirVisitaDetail(rep.f, gestionDe(rep));
  };
  // «Ver datos» guarda una copia de la fila y de la gestión: sin esto, tras
  // completar o asignar desde ahí seguía mostrando el estado de antes, y el
  // panel de inspectores no abría (sus props quedaban congeladas).
  useEffectB(() => {
    if (modalIdx == null || !window.refrescarVisitaDetail) return;
    const c = universo.find(x => x.f._idx === modalIdx);
    if (!c) return;
    window.refrescarVisitaDetail(c.f, gestionDe({ f: c.f, todas: universo.filter(x => x.clave === c.clave) }));
  }, [universo, modalIdx, busyFila, asignandoFila, inspectores]);
  // «Asignar» en la fila: elige el caso y deja el panel de inspectores abierto.
  const asignarDesdeFila = (rep) => {
    setAsignandoFila(rep.f._idx);
    if (conPanel) elegir(rep);
    else verDatos(rep);
  };

  // ── Chips activos de la cabecera de resultados ──
  const chipsActivos = useMemoB(() => {
    const ch = [];
    if (S.q) ch.push({ k: 'q', l: '«' + S.q + '»', quitar: () => { setQInput(''); parcharS({ q: '' }); } });
    S.comunas.forEach(k => ch.push({ k: 'com' + k, l: 'Comuna ' + k, quitar: () => parcharS({ comunas: S.comunas.filter(x => x !== k), barrios: S.barrios.filter(b => _comunaDeBarrioBuscar(b) !== k) }) }));
    S.barrios.forEach(b => ch.push({ k: 'bar' + b, l: b, quitar: () => parcharS({ barrios: S.barrios.filter(x => x !== b) }) }));
    if (S.rural) ch.push({ k: 'rural', l: 'Rural', quitar: () => parcharS({ rural: false, veredas: [] }) });
    S.veredas.forEach(v => ch.push({ k: 'ver' + v, l: 'Vda. ' + v, quitar: () => parcharS({ veredas: S.veredas.filter(x => x !== v) }) }));
    if (S.sinPot) ch.push({ k: 'sinpot', l: 'Sin barrio POT', quitar: () => parcharS({ sinPot: false }) });
    if (S.desde || S.hasta) {
      const campos = { rad: 'Radicado', asig: 'Asignación', vis: 'Visita', cierre: 'Cierre', cit: 'Citación' };
      const fmt = iso => iso ? formatearFecha(new Date(iso.split('-')[0], iso.split('-')[1] - 1, iso.split('-')[2])) : '';
      ch.push({ k: 'fecha', l: (campos[S.campo] || 'Radicado') + ': ' + (S.desde ? fmt(S.desde) : '…') + ' – ' + (S.hasta ? fmt(S.hasta) : 'hoy'), quitar: () => parcharS({ desde: '', hasta: '' }) });
    }
    S.visitador.forEach(v => ch.push({ k: 'opv' + v, l: titleCaseNombre(v), quitar: () => parcharS({ visitador: S.visitador.filter(x => x !== v) }) }));
    if (S.mias) ch.push({ k: 'mias', l: 'Mías', quitar: () => parcharS({ mias: false }) });
    S.tipo.forEach(v => ch.push({ k: 'tipo' + v, l: BQ_TIPO_L[v] || v, quitar: () => parcharS({ tipo: S.tipo.filter(x => x !== v) }) }));
    S.nvis.forEach(v => ch.push({ k: 'nvis' + v, l: v === 'seg' ? 'Seguimiento' : 'Primera visita', quitar: () => parcharS({ nvis: S.nvis.filter(x => x !== v) }) }));
    if (S.reit) ch.push({ k: 'reit', l: 'Con reiterados', quitar: () => parcharS({ reit: false }) });
    S.prio.forEach(v => ch.push({ k: 'prio' + v, l: 'Prioridad ' + v.toLowerCase(), quitar: () => parcharS({ prio: S.prio.filter(x => x !== v) }) }));
    S.infr.forEach(v => ch.push({ k: 'infr' + v, l: (v.split(':')[0] || v).trim(), quitar: () => parcharS({ infr: S.infr.filter(x => x !== v) }) }));
    if (S.susp) ch.push({ k: 'susp', l: 'Con suspensión', quitar: () => parcharS({ susp: false }) });
    if (S.orden) ch.push({ k: 'orden', l: 'Con orden', quitar: () => parcharS({ orden: false }) });
    S.lic.forEach(v => ch.push({ k: 'lic' + v, l: 'Licencia ' + (v === 'SI' ? 'sí' : 'no'), quitar: () => parcharS({ lic: S.lic.filter(x => x !== v) }) }));
    S.obra.forEach(v => ch.push({ k: 'obra' + v, l: v === 'Terminada' ? 'Obra terminada' : 'Obra en proceso', quitar: () => parcharS({ obra: S.obra.filter(x => x !== v) }) }));
    S.falta.forEach(v => {
      const f = BUSCAR_FALTAS.find(x => x[0] === v);
      ch.push({ k: 'falta' + v, l: f ? f[1] : v, quitar: () => parcharS({ falta: S.falta.filter(x => x !== v) }) });
    });
    return ch;
  }, [S]);

  const listo = !cargando && !error;
  const visibles = lista.slice(0, limite);
  const ocultos = Math.max(0, lista.length - limite);

  // Divider «Completadas» en orden urg: las completadas van al final.
  let enCompletadas = false;

  // ── Render ──
  return (
    <div className="pantalla activa pad-bottom buscar-pantalla">
      {/* Título + casilla + estados en un bloque fijo (.titulo-fijo): en
          móvil la casilla queda a mano mientras se recorre la lista. */}
      <div className="titulo-fijo buscar-fijo bq-cab-fija">
        <div className="bq-cab">
          <div className="page-title">Buscar</div>
          <div className="bq-omni">
            <span className="bq-lupa" aria-hidden="true"><Icon.Search size={16} /></span>
            <input type="text" ref={inputBuscarRef} value={qInput}
              aria-label="Buscar radicado, orden de policía, dirección, barrio, fecha o visitador"
              placeholder={conPanel ? 'Radicado, dirección, barrio, «sep 2026», «c4», nombre…' : 'Radicado, dirección, barrio…'}
              onChange={e => onChangeQ(e.target.value)}
              onKeyDown={onKeyQ}
              onBlur={() => setTimeout(() => { setSug([]); setSugAct(-1); }, 150)} />
            <span className="bq-kbd" aria-hidden="true">/</span>
            {qInput && (
              <button type="button" className="bq-q-x" aria-label="Limpiar búsqueda"
                onClick={() => { setQInput(''); parcharS({ q: '' }); setSug([]); inputBuscarRef.current && inputBuscarRef.current.focus(); }}>
                <Icon.Close size={14} />
              </button>
            )}
            {sug.length > 0 && (
              <div className="bq-sug" role="listbox" aria-label="Sugerencias"
                onMouseDown={e => e.preventDefault()}>
                <div className="bq-sug-ayuda">La lista ya se filtra por el texto. Para convertirlo en filtro: <kbd>↑</kbd><kbd>↓</kbd> y <kbd>Enter</kbd></div>
                {sug.map((s, i) => (
                  <React.Fragment key={i}>
                    {(i === 0 || sug[i - 1].g !== s.g) && <div className="bq-sug-g">{s.g}</div>}
                    <button type="button" role="option" aria-selected={i === sugAct}
                      className={'bq-sug-i' + (i === sugAct ? ' act' : '')}
                      onClick={() => aplicarSug(i)}>
                      <span><MarcarBQ texto={s.titulo} q={s.g === 'Caso' || s.g === 'Fecha' ? '' : qInput} />{s.sub && <span className="bq-sug-sub"> · {s.sub}</span>}</span>
                      {s.n != null && <small>{_n0BQ(s.n)}</small>}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Estados: lo vivo marcado; las completadas se piden. El conteo es
            facetado (respeta los demás filtros, ignora la selección). */}
        <div className="bq-estados">
          {BUSCAR_ESTADOS.map(est => (
            <React.Fragment key={est}>
              <button type="button" className={'bq-est' + (S.estados.includes(est) ? ' on' : '')}
                aria-pressed={S.estados.includes(est)}
                onClick={() => parcharS({ estados: toggleEnArr(S.estados, est) })}>
                <span className={'bq-dot ' + BQ_EST_DOT[est]} aria-hidden="true" />
                {BQ_EST_L[est]} <i>{_n0BQ(conteosEstado[est])}</i>
              </button>
              {est === 'INICIADO' && <span className="bq-sep-v" aria-hidden="true" />}
            </React.Fragment>
          ))}
          {/* Solo <1600: abre el cajón de filtros. El número dice cuántos hay
              activos aunque esté cerrado. */}
          <button type="button" className="bq-est bq-btn-filtros"
            aria-expanded={filtrosAbiertos} aria-controls="buscar-filtros"
            onClick={() => setFiltrosAbiertos(!filtrosAbiertos)}>
            Filtros{nActivos > 0 && <i> · {nActivos}</i>}
          </button>
        </div>
      </div>{/* .bq-cab-fija */}

      <div className="bq-cuerpo">
        {/* ── Columna / cajón de filtros ── */}
        <aside id="buscar-filtros" className={'bq-filtros' + (filtrosAbiertos ? ' abierto' : '')} aria-label="Filtros">
          <div className="bq-filtros-cab">
            <span>Filtros</span>
            <button type="button" className="vc-btn bq-filtros-x" aria-label="Cerrar filtros"
              onClick={() => setFiltrosAbiertos(false)}><Icon.Close size={16} /></button>
          </div>

          {/* Vistas: las de uso diario + las propias de este equipo. */}
          <div className="bq-sec">
            <div className="bq-sec-tit">Vistas</div>
            <div className="bq-vistas">
              {vistasTodas.map(v => (
                <div key={v.id} className="bq-vista-fila">
                  <button type="button" className={'bq-vista' + (firmaVista(v) === firmaActual ? ' on' : '')}
                    onClick={() => aplicarVista(v)}>
                    {v.n}{v.propia && <span className="bq-mia"> · tuya</span>}
                    <i>{_n0BQ(contarVista(v))}</i>
                  </button>
                  {v.propia && (
                    <button type="button" className="bq-vista-x" aria-label={'Quitar vista ' + v.n}
                      title={'Quitar vista ' + v.n} onClick={() => quitarVistaPropia(v.id)}>×</button>
                  )}
                </div>
              ))}
              {guardandoVista ? (
                <VistaNuevaBQ onGuardar={guardarVista} onCancelar={() => setGuardandoVista(false)} />
              ) : (
                <button type="button" className="bq-vista bq-vista-nueva"
                  onClick={() => setGuardandoVista(true)}>＋ Guardar esta vista</button>
              )}
            </div>
          </div>

          <BQSeccion titulo="Dónde" n={activos.donde}>
            <DondeBQ S={S} parcharS={parcharS} base={baseLugar} veredas={veredasU}
              mapas={idxBarrios && idxBarrios.mapas} />
          </BQSeccion>
          <BQSeccion titulo="Cuándo" n={activos.cuando}>
            <CuandoBQ S={S} parcharS={parcharS} base={baseFecha} hoy={hoy} />
          </BQSeccion>

          <BQSeccion titulo="Quién" n={nQuien}>
            {veTodo && (
              <>
                <div className="bq-lbl">Visitador</div>
                <div className="bq-opts">
                  {inspectores.map(u => {
                    const v = String(u.nombre || '').toUpperCase();
                    const n = conteoGrupo(v, 'visitador', (c, x) => c.vis.indexOf(x) !== -1);
                    return (
                      <button key={v} type="button" className={'bq-op' + (S.visitador.includes(v) ? ' on' : '') + (n === 0 && !S.visitador.includes(v) ? ' cero' : '')}
                        aria-pressed={S.visitador.includes(v)}
                        onClick={() => parcharS({ visitador: toggleEnArr(S.visitador, v) })}>
                        <span>{titleCaseNombre(v)}</span><i>{_n0BQ(n)}</i>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {!!S.yo && (
              <>
                <div className="bq-lbl">Mías</div>
                <div className="bq-opts">
                  <button type="button" className={'bq-op' + (S.mias ? ' on' : '')} aria-pressed={S.mias}
                    onClick={() => parcharS({ mias: !S.mias })}>
                    <span>Visitas que me llevan</span><i>{_n0BQ(faceta(c => pasaBuscar(c, S, 'mias') && c.vis.indexOf(S.yo) !== -1))}</i>
                  </button>
                </div>
              </>
            )}
          </BQSeccion>

          {/* «Más filtros» (2026-10-12, decisión del usuario): lo de uso
              ocasional, plegado. Arriba quedan Vistas, Dónde, Cuándo y Quién. */}
          <BQSeccion titulo="Más filtros" n={activos.total - activos.donde - activos.cuando - nQuien}>
            <div className="bq-lbl">Tipo de caso</div>
            <div className="bq-opts">
              {['PQR', 'OFICIO', 'V2'].map(v => (
                <button key={v} type="button" className={'bq-op' + (S.tipo.includes(v) ? ' on' : '')} aria-pressed={S.tipo.includes(v)}
                  onClick={() => parcharS({ tipo: toggleEnArr(S.tipo, v) })}>
                  <span>{BQ_TIPO_L[v]}</span><i>{_n0BQ(conteoGrupo(v, 'tipo', (c, x) => c.tipo === x))}</i>
                </button>
              ))}
            </div>
            <div className="bq-lbl">Visita</div>
            <div className="bq-opts">
              {[['pri', 'Primera visita'], ['seg', 'Seguimiento']].map(par => (
                <button key={par[0]} type="button" className={'bq-op' + (S.nvis.includes(par[0]) ? ' on' : '')} aria-pressed={S.nvis.includes(par[0])}
                  onClick={() => parcharS({ nvis: toggleEnArr(S.nvis, par[0]) })}>
                  <span>{par[1]}</span><i>{_n0BQ(conteoGrupo(par[0], 'nvis', (c, x) => (c.nvis > 1 ? 'seg' : 'pri') === x))}</i>
                </button>
              ))}
              <button type="button" className={'bq-op' + (S.reit ? ' on' : '')} aria-pressed={S.reit}
                onClick={() => parcharS({ reit: !S.reit })}>
                <span>Con reiterados</span><i>{_n0BQ(faceta(c => pasaBuscar(c, S, 'reit') && c.reit.length > 0))}</i>
              </button>
            </div>
            {veTodo && (
              <>
                <div className="bq-lbl">Prioridad de la PQR</div>
                <div className="bq-opts">
                  {['Crítica', 'Alta', 'Media', 'Baja', 'Sin análisis'].map(v => (
                    <button key={v} type="button" className={'bq-op' + (S.prio.includes(v) ? ' on' : '')} aria-pressed={S.prio.includes(v)}
                      onClick={() => parcharS({ prio: toggleEnArr(S.prio, v) })}>
                      <span>{v}</span><i>{_n0BQ(conteoGrupo(v, 'prio', (c, x) => c.prio === x))}</i>
                    </button>
                  ))}
                </div>
              </>
            )}
            {valoresInfr.length > 0 && (
              <>
                <div className="bq-lbl">Infracción</div>
                <div className="bq-opts">
                  {valoresInfr.map(v => (
                    <button key={v} type="button" title={v}
                      className={'bq-op' + (S.infr.includes(v) ? ' on' : '')} aria-pressed={S.infr.includes(v)}
                      onClick={() => parcharS({ infr: toggleEnArr(S.infr, v) })}>
                      <span>{(v.split(':')[0] || v).trim()}</span><i>{_n0BQ(conteoGrupo(v, 'infr', (c, x) => c.infr.indexOf(x) !== -1))}</i>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="bq-lbl">Obra</div>
            <div className="bq-opts">
              <button type="button" className={'bq-op' + (S.susp ? ' on' : '')} aria-pressed={S.susp}
                onClick={() => parcharS({ susp: !S.susp })}>
                <span>Con suspensión</span><i>{_n0BQ(faceta(c => pasaBuscar(c, S, 'susp') && c.susp))}</i>
              </button>
              <button type="button" className={'bq-op' + (S.orden ? ' on' : '')} aria-pressed={S.orden}
                onClick={() => parcharS({ orden: !S.orden })}>
                <span>Con orden de policía</span><i>{_n0BQ(faceta(c => pasaBuscar(c, S, 'orden') && !!c.orden))}</i>
              </button>
              {['SI', 'NO'].map(v => (
                <button key={v} type="button" className={'bq-op' + (S.lic.includes(v) ? ' on' : '')} aria-pressed={S.lic.includes(v)}
                  onClick={() => parcharS({ lic: toggleEnArr(S.lic, v) })}>
                  <span>Licencia {v === 'SI' ? 'sí' : 'no'}</span><i>{_n0BQ(conteoGrupo(v, 'lic', (c, x) => c.lic === x))}</i>
                </button>
              ))}
              {valoresObra.map(v => (
                <button key={v} type="button" className={'bq-op' + (S.obra.includes(v) ? ' on' : '')} aria-pressed={S.obra.includes(v)}
                  onClick={() => parcharS({ obra: toggleEnArr(S.obra, v) })}>
                  <span>{v === 'Terminada' ? 'Obra terminada' : 'Obra en proceso'}</span><i>{_n0BQ(conteoGrupo(v, 'obra', (c, x) => c.obra === x))}</i>
                </button>
              ))}
            </div>
            <div className="bq-lbl">Qué falta</div>
            <div className="bq-opts">
              {BUSCAR_FALTAS.map(par => (
                <button key={par[0]} type="button" className={'bq-op' + (S.falta.includes(par[0]) ? ' on' : '')} aria-pressed={S.falta.includes(par[0])}
                  onClick={() => parcharS({ falta: toggleEnArr(S.falta, par[0]) })}>
                  <span>{par[1]}</span><i>{_n0BQ(conteoGrupo(par[0], 'falta', (c, x) => c.faltas.indexOf(x) !== -1))}</i>
                </button>
              ))}
            </div>
            <p className="bq-nota">Solo visitas de <b>{BUSCAR_FALTAS_DESDE_ANIO}</b> en adelante: antes la app no generaba entregables.</p>
          </BQSeccion>
        </aside>

        {filtrosAbiertos && <div className="bq-velo" onClick={() => setFiltrosAbiertos(false)} aria-hidden="true" />}

        {exportando && veTodo && (
          <ExportarBQ casos={lista} toast={toast} onCerrar={() => setExportando(false)}
            resumenFiltros={[S.estados.join('+')].concat(chipsActivos.map(c => c.l), S.q ? ['texto: ' + S.q] : []).join(' · ')} />
        )}

        {/* ── Lista ── */}
        <div className="bq-lista">
          {listo && (
            <div className="bq-res-cab">
              <span className="bq-conteo">
                <b>{_n0BQ(lista.length)}</b> {lista.length === 1 ? 'caso' : 'casos'} de {_n0BQ(totalGrupos)}
              </span>
              <div className="bq-res-acc">
                <label className="bq-orden">Ordenar
                  <select value={orden} onChange={e => setOrden(e.target.value)} aria-label="Ordenar resultados">
                    {BQ_ORDENES.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
                  </select>
                </label>
                {veTodo && (
                  <button type="button" className="vc-btn" onClick={() => setExportando(true)}
                    disabled={!lista.length} title="Exportar lo filtrado a Excel">Exportar</button>
                )}
                <button type="button" className="vc-btn bq-ico" onClick={copiarEnlace}
                  title="Copiar enlace con estos filtros" aria-label="Copiar enlace con estos filtros">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                  </svg>
                </button>
              </div>
              {chipsActivos.length > 0 && (
                <div className="bq-activos">
                  {chipsActivos.map(c => (
                    <button key={c.k} type="button" className="chip-filtro-activo"
                      onClick={c.quitar} title={'Quitar filtro ' + c.l} aria-label={'Quitar filtro ' + c.l}>
                      {c.l}<Icon.Close size={12} />
                    </button>
                  ))}
                  {chipsActivos.length > 1 && (
                    <button type="button" className="bq-limpiar-todo" onClick={limpiarTodo}>Limpiar todo</button>
                  )}
                </div>
              )}
            </div>
          )}

          {cargando && (
            <div className="cargando"><div className="spinner"></div>Cargando registros...</div>
          )}
          {error && (
            <div className="card" style={{ color: 'var(--rojo)' }}>Error: {error}</div>
          )}
          {listo && lista.length === 0 && (
            <div className="bq-vacio">
              <b>Ningún caso con estos filtros</b>
              Quita alguno de los chips de arriba o <button type="button" className="bq-volver" onClick={limpiarTodo}>limpia todo</button>.
            </div>
          )}
          {listo && lista.length > 0 && (chipsActivos.length > 0 || !!S.q) && (
            <ResumenBQ casos={lista} veTodo={veTodo} />
          )}
          {listo && completadasOcultas > 0 && (
            <div className="bq-tambien">
              También coinciden <b>{_n0BQ(completadasOcultas)}</b> completadas
              <button type="button" className="vc-btn"
                onClick={() => parcharS({ estados: S.estados.concat(['COMPLETADO']) })}>Ver</button>
            </div>
          )}
          {listo && lista.length > 0 && visibles.map((c, i) => {
            const esExacta = i === 0 && S.q && esExactaBuscar(c, S.q);
            const divisor = orden === 'urg' && c.estado === 'COMPLETADO' && !enCompletadas && i > 0;
            if (divisor) enCompletadas = true;
            return (
              <React.Fragment key={c.clave}>
                {divisor && <div className="bq-div">Completadas <span>la más reciente primero</span></div>}
                <FilaBQ key={c.clave} c={c} q={S.q} exacta={esExacta}
                  sel={sel && sel.clave === c.clave} conPanel={conPanel}
                  esAdmin={esAdmin} yo={S.yo} veTodo={veTodo}
                  onElegir={elegir} onContinuar={onContinuar} onVerDatos={verDatos}
                  onAsignarFila={asignarDesdeFila} />
              </React.Fragment>
            );
          })}
          {listo && ocultos > 0 && (
            <button type="button" className="vc-btn mv-mas" onClick={() => setLimite(l => l + BQ_LIMITE_PASO)}>
              Mostrar {Math.min(BQ_LIMITE_PASO, ocultos)} más <span>({limite} de {_n0BQ(lista.length)})</span>
            </button>
          )}
        </div>

        {/* ── Ficha del caso elegido (≥1200) ──
            Sin key por visita: cada mapa nuevo se factura (misma regla del
            panel de Mis visitas). La gestión del admin va dentro. */}
        {conPanel && sel && (
          <section className="mv-panel bq-caso" aria-label={'Ficha de ' + (sel.dir || 'la visita')}>
            <FichaVisita f={sel.f} usuario={usuario} verPrioridad={veTodo}
              onContinuar={onContinuar} gestion={gestionDe(sel)} />
          </section>
        )}
      </div>{/* .bq-cuerpo */}

      <div className="bq-toast" role="status" hidden={!toastBQ}>{toastBQ}</div>
    </div>
  );
}

// ── Sección plegable del panel de filtros ─────────────────────
function BQSeccion({ titulo, n, children }) {
  const [plegada, setPlegada] = useStateB(true);
  return (
    <div className={'bq-sec' + (plegada ? ' bq-plegada' : '')}>
      <button type="button" className="bq-sec-tit" aria-expanded={!plegada}
        onClick={() => setPlegada(!plegada)}>
        {titulo}{n > 0 && <span className="bq-sec-n">· {n}</span>}
        <span className="bq-chev" aria-hidden="true">▾</span>
      </button>
      <div className="bq-sec-cuerpo">{children}</div>
    </div>
  );
}

// ── Formulario de vista nueva ─────────────────────────────────
function VistaNuevaBQ({ onGuardar, onCancelar }) {
  const [nombre, setNombre] = useStateB('');
  const ref = useRefB(null);
  useEffectB(() => { ref.current && ref.current.focus(); }, []);
  return (
    <div className="bq-vista-form">
      <input ref={ref} value={nombre} placeholder="Nombre de la vista" maxLength={40}
        onChange={e => setNombre(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (onGuardar(nombre)) onCancelar(); } }} />
      <button type="button" className="vc-btn vc-btn-cta"
        onClick={() => { if (onGuardar(nombre)) onCancelar(); }}>Guardar</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Fila de la lista: un caso por fila, con el código de Mis visitas
// (barra de estado, un solo botón lleno, demora en rojo).
// ═══════════════════════════════════════════════════════════════
function FilaBQ({ c, q, exacta, sel, conPanel, esAdmin, yo, veTodo, onElegir, onContinuar, onVerDatos, onAsignarFila }) {
  const f = c.f;
  const estCls = { PENDIENTE: 'bq-pend', ASIGNADO: '', INICIADO: 'mv-curso', COMPLETADO: 'mv-hecha' }[c.estado] || '';
  const m = q ? coincideBuscar(c, q) : '';

  // CTA único por estado: Asignar (admin, pendiente), Iniciar o Continuar.
  let cta = null;
  if (c.estado === 'PENDIENTE') {
    cta = esAdmin ? { t: 'Asignar', fn: () => onAsignarFila(c) } : { t: 'Iniciar', fn: () => onContinuar(f._idx, f) };
  } else if ((c.estado === 'ASIGNADO' || c.estado === 'INICIADO') && puedeDiligenciar(f)) {
    cta = { t: c.estado === 'INICIADO' ? 'Continuar' : 'Iniciar', fn: () => onContinuar(f._idx, f) };
  }
  const sinPropagar = fn => e => { e.stopPropagation(); fn(); };

  return (
    <React.Fragment>
      {exacta && <div className="bq-exacta">Coincidencia exacta</div>}
      <div className={'mv-fila bq-fila ' + estCls + (sel ? ' sel' : '')}
        aria-current={sel || undefined}
        onClick={conPanel ? () => onElegir(c) : undefined}>
        {c.estado === 'COMPLETADO' && (
          <span className="mv-fecha">{c.fCierre ? c.fCierre.getDate() + ' ' + _MESES_ES[c.fCierre.getMonth()].slice(0, 3) : '—'}</span>
        )}
        <div className="mv-txt">
          <button type="button" className="mv-dir" title={c.dir}
            aria-pressed={conPanel ? sel : undefined}
            onClick={sinPropagar(conPanel ? () => onElegir(c) : () => onVerDatos(c))}>
            <MarcarBQ texto={c.dir} q={q} />
          </button>
          <div className="vc-ident">
            {c.tipo === 'V2'
              ? <span className="bq-v2" title="Fila migrada de V2 sin número de radicado"><span className="bq-tag">V2</span> <MarcarBQ texto={c.rad} q={q} /></span>
              : <span className="vc-rad"><MarcarBQ texto={c.rad} q={q} /></span>}
            {!conPanel && <BotonPdfRadicado f={f} />}
            {c.rural
              ? <><span className="vc-sep">·</span><span>Vda. <MarcarBQ texto={c.vereda} q={q} /></span></>
              : c.barrio
                ? <><span className="vc-sep">·</span><span><MarcarBQ texto={c.barrio} q={q} /></span></>
                : c.barrioTxt
                  ? <><span className="vc-sep">·</span>{c.pot
                      ? <span title="El nombre escrito no calza con ningún barrio del POT"><MarcarBQ texto={c.barrioTxt} q={q} /> <span className="bq-tag">sin POT</span></span>
                      /* Sin barrios-mapa.json (sin red ni caché) no se sabe: no marcar «sin POT». */
                      : <span><MarcarBQ texto={c.barrioTxt} q={q} /></span>}</>
                  : null}
            {!c.rural && c.comuna && <><span className="vc-sep">·</span><span>C{c.comuna}</span></>}
            {c.nVisitasGrupo > 1 && <span className="bq-tag">{c.nVisitasGrupo} visitas</span>}
          </div>
          <NotaFilaBQ c={c} q={q} yo={yo} veTodo={veTodo} donde={m} />
        </div>
        <div className="mv-acc">
          {cta
            ? <button type="button" className="vc-btn vc-btn-cta" onClick={sinPropagar(cta.fn)}>
                {cta.t !== 'Asignar' && <Icon.Play size={14} />}{cta.t}
              </button>
            : (c.estado === 'ASIGNADO' || c.estado === 'INICIADO') && !conPanel && (
              <span className="vc-dilig">Diligencia {titleCaseNombre(c.vis[0] || '')}</span>)}
          {!conPanel && c.estado !== 'COMPLETADO' && <BotonMapaVisita f={f} variante="vc" />}
          {!conPanel && (
            <button type="button" className="vc-btn" onClick={sinPropagar(() => onVerDatos(c))}>Ver datos</button>
          )}
        </div>
      </div>
    </React.Fragment>
  );
}

// Tercer renglón de la fila: por qué está en la lista y qué le falta.
function NotaFilaBQ({ c, q, yo, veTodo, donde }) {
  const partes = [];
  const dias = n => n === 0 ? 'hoy' : 'hace ' + _pluralBQ(n, 'día', 'días');
  if (c.estado === 'PENDIENTE') {
    if (veTodo) {
      const vencida = c.exceso != null && c.exceso > 0 && c.tier >= 2;
      partes.push(
        <b key="p" className={vencida ? 'demora' : ''}>
          {c.prio}{c.exceso != null && c.tier >= 1 ? ' · ' + (vencida ? 'vencida hace ' + c.exceso + ' días' : 'a ' + (-c.exceso) + ' días del plazo') : ''}
        </b>);
      partes.push(<span key="s">sin asignar</span>);
    } else {
      partes.push(<span key="r">Radicada hace {_pluralBQ(c.dCal, 'día', 'días')} · sin asignar</span>);
    }
  } else if (c.estado === 'ASIGNADO') {
    const d = diasSinIniciar(c.f);
    partes.push(<span key="q">Asignada a {titleCaseNombre(c.vis[0] || '')}</span>);
    partes.push(<b key="d" className={d != null && d >= DIAS_ALERTA_DEMORA ? 'demora' : ''}>{dias(d || 0)}</b>);
  } else if (c.estado === 'INICIADO') {
    const d = diasSinCompletar(c.f);
    const faltan = ['acta', 'orden', 'rf'].filter(k => c.faltas.indexOf(k) !== -1).map(k => BQ_FALTA_FILA[k]);
    partes.push(<span key="q">Iniciada por {titleCaseNombre(c.vis[0] || '')}</span>);
    partes.push(<b key="d" className={d != null && d >= DIAS_ALERTA_DEMORA ? 'demora' : ''}>visitada {dias(d || 0)}</b>);
    partes.push(faltan.length
      ? <b key="f" className="falta">Falta: {faltan.join(' · ')}</b>
      : <b key="f" className="ok">Entregables completos</b>);
  } else {
    partes.push(<span key="q">{titleCaseNombre(c.vis[0] || '')}{c.vis.length > 1 ? ' +1' : ''}</span>);
    if (c.faltas.indexOf('informe') !== -1) partes.push(<b key="i" className="falta">Sin informe</b>);
    if (c.susp) partes.push(<span key="s">suspensión</span>);
  }
  // En qué campo no evidente calzó el texto (orden, persona que atiende, reiterado).
  if (donde === 'orden') partes.push(<span key="o">coincide en orden de policía: <MarcarBQ texto={c.orden} q={q} /></span>);
  if (donde === 'atiende') partes.push(<span key="a">coincide en persona que atiende: <MarcarBQ texto={c.atiende} q={q} /></span>);
  if (donde === 'reit') {
    const r = c.reit.find(x => _normBQ(x).indexOf(_normBQ(q)) !== -1) || c.reit[0];
    partes.push(<span key="r">reitera <MarcarBQ texto={r} q={q} /></span>);
  }
  return (
    <div className="mv-nota">
      {partes.map((p, i) => <React.Fragment key={i}>{i > 0 && ' · '}{p}</React.Fragment>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Gestión del admin: se inyecta en la ficha (prop `gestion` de
// FichaVisita), en el panel de Buscar y en «Ver datos» sin panel.
// Reasignar conserva el estado de una INICIADA (con confirmación);
// completar ofrece el oficio de vigilancia; el seguimiento («+ Nueva
// visita») se apoya en la última visita del caso.
// ═══════════════════════════════════════════════════════════════
function GestionBQ({ f, todas, inspectores, busyFila, asignandoFila, setAsignandoFila,
  onNuevaVisita, onAsignar, onAsignarNuevaVisita, onDesasignar, onCompletar }) {
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  const busy = busyFila === f._idx;
  const abierto = asignandoFila === f._idx;

  // El caso completo (todas las visitas del radicado) decide si puede abrir
  // un seguimiento: una visita en curso bloquea crear otra sobre el mismo
  // radicado, y una PENDIENTE no lo habilita (sobre ella va «Asignar»).
  const abierta = todas.find(x => {
    const e = normalizarEstado(x['ESTADO VISITA'] || '');
    return e === 'ASIGNADO' || e === 'INICIADO';
  });
  const pendiente = todas.find(x => normalizarEstado(x['ESTADO VISITA'] || '') === 'PENDIENTE');
  const ordenadas = useMemoB(() => numerarVisitasRadicado(todas), [todas]);
  const filaBase = ordenadas.length ? ordenadas[ordenadas.length - 1].f : null;
  const radicadoReal = esRadicadoDeCaso(String(f['RADICADO'] || '').trim().toUpperCase());
  const totalVisitas = ordenadas.filter(x => x.n != null).length;
  const puedeNueva = !!filaBase && radicadoReal;
  const panelNuevaAbierto = !!filaBase && asignandoFila === ('nueva:' + filaBase._idx);

  const abrirPanel = (id) => setAsignandoFila(asignandoFila === id ? null : id);
  // Sin acciones (p. ej. completada con otra visita pendiente) no hay barra.
  const conNueva = puedeNueva && (abierta || (!pendiente && est === 'COMPLETADO'));
  if (est !== 'PENDIENTE' && est !== 'ASIGNADO' && est !== 'INICIADO' && !conNueva) return null;

  return (
    <section className="bq-gestion" aria-label="Gestión">
      <div className="bq-seg">
        <span className="bq-gestion-tit" aria-hidden="true">Gestión</span>
        {est === 'PENDIENTE' && (
          <button type="button" className="vc-btn" disabled={busy} onClick={() => abrirPanel(f._idx)}>
            {abierto ? 'Cancelar' : 'Asignar'}
          </button>
        )}
        {(est === 'ASIGNADO' || est === 'INICIADO') && (
          <>
            <button type="button" className="vc-btn" disabled={busy} onClick={() => abrirPanel(f._idx)}>
              {abierto ? 'Cancelar' : 'Reasignar'}
            </button>
            <button type="button" className="vc-btn" disabled={busy}
              onClick={() => onDesasignar(f._idx, f['RADICADO'])}>
              <Icon.Undo size={14} /> Desasignar
            </button>
          </>
        )}
        {est === 'INICIADO' && (
          <button type="button" className="vc-btn vc-btn-cta" disabled={busy}
            onClick={() => onCompletar(f._idx, f['FECHA ASIGNACION VISITA'])}>
            <Icon.Check size={14} /> Completar
          </button>
        )}
        {puedeNueva && (abierta
          ? <span className="vc-dilig" title="Completa la visita en curso antes de abrir otra">Visita {abierta.n} en curso</span>
          : !pendiente && est === 'COMPLETADO' && (
            <>
              {/* Dos botones, un trabajo cada uno: «+ Nueva visita» abre el
                  formulario; «Asignar» crea la fila ya asignada. */}
              <button type="button" className="vc-btn" style={{ borderStyle: 'dashed', borderColor: 'var(--brand-accent)' }}
                disabled={busyFila === filaBase._idx}
                onClick={() => onNuevaVisita && onNuevaVisita(filaBase, totalVisitas + 1)}>
                + Nueva visita
              </button>
              <button type="button" className="vc-btn" disabled={busyFila === filaBase._idx}
                onClick={() => abrirPanel('nueva:' + filaBase._idx)}>
                {panelNuevaAbierto ? 'Cancelar' : 'Asignar'}
              </button>
            </>
          ))}
      </div>
      {/* Panel de inspectores: debajo de los botones, como en la fila vieja. */}
      {est !== 'COMPLETADO' && (
        <PanelSeleccionInspector
          f={f} busy={busy} abierto={abierto} inspectores={inspectores}
          accion="asignar" conFecha onAsignar={onAsignar} />
      )}
      {puedeNueva && !abierta && !pendiente && est === 'COMPLETADO' && (
        <PanelSeleccionInspector
          f={filaBase} busy={busyFila === filaBase._idx} abierto={panelNuevaAbierto}
          inspectores={inspectores} accion="nueva" conFecha
          onAsignar={onAsignar} onAsignarNuevaVisita={onAsignarNuevaVisita} />
      )}
    </section>
  );
}

// ── Dónde · Cuándo · Resumen (E5c2) ──────────────────────────
// Cuentan casos (grupos por radicado) sobre la base que pasa todos los filtros
// menos el del propio bloque: el mapa no se vacía al tocar una comuna.
function _contarPorBQ(base, clavesDe) {
  const visto = new Set(), m = new Map();
  base.forEach(c => clavesDe(c).forEach(k => {
    const id = k + '|' + c.clave;
    if (visto.has(id)) return;
    visto.add(id); m.set(k, (m.get(k) || 0) + 1);
  }));
  return m;
}
const BQ_ESCALA = ['#F1EADF', '#EBD3C2', '#DDAE93', '#C9805F', '#AC5031'];
const _tonoBQ = (n, max) => !n ? 0 : Math.min(4, 1 + Math.floor(Math.sqrt(n / Math.max(1, max)) * 3.999));
const _normLugarBQ = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

function DondeBQ({ S, parcharS, base, mapas, veredas }) {
  const [buscaBarrio, setBuscaBarrio] = useStateB('');
  const [anchoSvg, setAnchoSvg] = useStateB(268);
  const svgRef = useRefB(null);
  useEffectB(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setAnchoSvg(el.getBoundingClientRect().width || 268));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapas]);
  const porCom = useMemoB(() => _contarPorBQ(base, c => [c.rural ? 'R' : String(c.comuna || '')]), [base]);
  const porBar = useMemoB(() => _contarPorBQ(base, c => [c.rural ? 'V:' + _normLugarBQ(c.vereda) : (c.barrio || 'SIN')]), [base]);
  const sinPotCom = useMemoB(() => _contarPorBQ(base, c => (!c.rural && !c.barrio) ? [String(c.comuna || '')] : []), [base]);
  if (!mapas) return <p className="bq-nota">El mapa de barrios no está disponible sin conexión.</p>;

  const n = (m, k) => m.get(k) || 0;
  const comBarrio = {};
  mapas.barrios.forEach(b => { comBarrio[b.n] = b.c; });
  // Acercar a las comunas elegidas y a las de los barrios elegidos.
  const comZoom = [...new Set(S.comunas.concat(S.barrios.map(b => comBarrio[b]).filter(Boolean)))];
  const zoom = comZoom.length > 0;
  const visibles = mapas.barrios.filter(b => comZoom.includes(b.c));
  let vb = [0, 0, mapas.w, mapas.h];
  if (zoom && visibles.length) {
    const bb = visibles.reduce((a, b) => [Math.min(a[0], b.b[0]), Math.min(a[1], b.b[1]), Math.max(a[2], b.b[2]), Math.max(a[3], b.b[3])], [1e9, 1e9, -1e9, -1e9]);
    let w = bb[2] - bb[0], h = bb[3] - bb[1];
    const pad = Math.max(w, h) * .08; let x = bb[0] - pad, y = bb[1] - pad; w += 2 * pad; h += 2 * pad;
    const r = mapas.w / mapas.h;   // conservar la proporción del recuadro
    if (w / h > r) { const nh = w / r; y -= (nh - h) / 2; h = nh; } else { const nw = h * r; x -= (nw - w) / 2; w = nw; }
    vb = [x, y, w, h];
  }
  const u = vb[2] / anchoSvg;   // unidades del mapa por píxel: las etiquetas no crecen al acercar
  const maxC = Math.max(1, ...mapas.comunas.map(k => n(porCom, k.c)));
  const maxB = Math.max(1, ...visibles.map(b => n(porBar, b.n)));
  const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : arr.concat([v]);
  const tocarComuna = k => parcharS(S.comunas.includes(k)
    ? { comunas: S.comunas.filter(x => x !== k), barrios: S.barrios.filter(b => comBarrio[b] !== k) }
    : { comunas: S.comunas.concat([k]) });
  const teclado = fn => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

  const etiquetas = zoom
    ? [...new Map(visibles.map(b => [b.n, b])).values()].map(b => ({ k: b.n, x: b.cx, y: b.cy, n: n(porBar, b.n), t: _tonoBQ(n(porBar, b.n), maxB) })).filter(e => e.n)
    : mapas.comunas.map(k => ({ k: k.c, x: k.cx, y: k.cy, top: 'C' + k.c, n: n(porCom, k.c), t: _tonoBQ(n(porCom, k.c), maxC) }));

  const q = _normLugarBQ(buscaBarrio);
  const sugBarrios = q.length < 2 ? [] : [...new Set(mapas.barrios.map(b => b.n))]
    .filter(b => _normLugarBQ(b).includes(q)).map(b => ['bar', b, b + ' · Comuna ' + comBarrio[b], n(porBar, b)])
    .concat(veredas.filter(v => _normLugarBQ(v).includes(q)).map(v => ['ver', v, 'Vda. ' + v, n(porBar, 'V:' + _normLugarBQ(v))]))
    .slice(0, 8);
  const elegirSug = ([tipo, v]) => {
    setBuscaBarrio('');
    if (tipo === 'bar' && !S.barrios.includes(v)) parcharS({ barrios: S.barrios.concat([v]) });
    if (tipo === 'ver' && !S.veredas.includes(v)) parcharS({ veredas: S.veredas.concat([v]), rural: true });
  };

  const barriosZoom = zoom
    ? [...new Set(visibles.map(b => b.n))].map(b => [b, n(porBar, b)]).filter(x => x[1] || S.barrios.includes(x[0])).sort((a, b) => b[1] - a[1])
    : [];
  const sinPotZ = comZoom.reduce((a, k) => a + n(sinPotCom, k), 0);
  const nRural = n(porCom, 'R'), nSin = n(porBar, 'SIN');
  const opcion = (clave, on, texto, cuenta, onClick, title) => (
    <button key={clave} type="button" className={'bq-op' + (on ? ' on' : '')} aria-pressed={on} onClick={onClick} title={title}>
      <span>{texto}</span> <i>{_n0BQ(cuenta)}</i>
    </button>
  );

  return (
    <>
      <div className="bq-barrio-caja">
        <input type="search" value={buscaBarrio} onChange={e => setBuscaBarrio(e.target.value)}
          placeholder="Buscar barrio o vereda" aria-label="Buscar barrio o vereda del POT"
          onKeyDown={e => { if (e.key === 'Enter' && sugBarrios[0]) { e.preventDefault(); elegirSug(sugBarrios[0]); } }} />
        {q.length >= 2 && (
          <div className="bq-sug bq-sug-barrio" role="listbox">
            {sugBarrios.length ? sugBarrios.map(x => (
              <button key={x[0] + x[1]} type="button" className="bq-sug-i" role="option"
                onMouseDown={e => e.preventDefault()} onClick={() => elegirSug(x)}>
                <span>{x[2]}</span><small>{_n0BQ(x[3])}</small>
              </button>
            )) : <div className="bq-sug-vacio">Ningún barrio ni vereda del POT con «{buscaBarrio}».</div>}
          </div>
        )}
      </div>

      <div className={'bq-mapa' + (zoom ? ' zoom' : '')}>
        <svg ref={svgRef} viewBox={vb.join(' ')} role="group" aria-label="Mapa de comunas de Bello">
          <g>
            {mapas.comunas.map(k => {
              const cn = n(porCom, k.c), on = S.comunas.includes(k.c);
              return (
                <path key={k.c} className={'bq-com' + (on ? ' on' : '')} d={k.d} tabIndex={0} role="button"
                  aria-pressed={on} aria-label={'Comuna ' + k.c + ', ' + cn + ' casos'}
                  style={{ fill: BQ_ESCALA[_tonoBQ(cn, maxC)] }}
                  onClick={() => tocarComuna(k.c)} onKeyDown={teclado(() => tocarComuna(k.c))}>
                  <title>{'Comuna ' + k.c + ' · ' + cn + ' casos'}</title>
                </path>
              );
            })}
          </g>
          {zoom && (
            <g>
              {visibles.map((b, i) => {
                const bn = n(porBar, b.n), on = S.barrios.includes(b.n);
                return (
                  <path key={b.n + i} className={'bq-barr vis' + (on ? ' on' : '')} d={b.d} tabIndex={0} role="button"
                    aria-pressed={on} aria-label={b.n + ', ' + bn + ' casos'} style={{ fill: BQ_ESCALA[_tonoBQ(bn, maxB)] }}
                    onClick={() => parcharS({ barrios: toggle(S.barrios, b.n) })}
                    onKeyDown={teclado(() => parcharS({ barrios: toggle(S.barrios, b.n) }))}>
                    <title>{b.n + ' · ' + bn + ' casos'}</title>
                  </path>
                );
              })}
            </g>
          )}
          <g aria-hidden="true">
            {etiquetas.map(e => (
              <text key={e.k} className="bq-lbl-c" x={e.x} y={e.y} fill={e.t >= 3 ? '#fff' : 'var(--ink)'}>
                {e.top && <tspan x={e.x} dy={-2 * u} fontSize={9 * u} opacity=".75">{e.top}</tspan>}
                <tspan x={e.x} dy={(e.top ? 11 : 4) * u} fontSize={11 * u} fontWeight="600">{e.n}</tspan>
              </text>
            ))}
          </g>
        </svg>
      </div>

      {zoom ? (
        <>
          <div className="bq-mapa-pie">
            <button type="button" className="bq-volver" onClick={() => parcharS({ comunas: [], barrios: [] })}>← Todas las comunas</button>
            <span>Toca un barrio para acotar</span>
          </div>
          <div className="bq-opts">
            {barriosZoom.map(([b, cn]) => opcion('b' + b, S.barrios.includes(b), b, cn, () => parcharS({ barrios: toggle(S.barrios, b) })))}
            {sinPotZ > 0 && opcion('sinpot', S.sinPot, 'Sin barrio POT', sinPotZ, () => parcharS({ sinPot: !S.sinPot }), 'Filas cuyo barrio escrito no calza con el POT')}
          </div>
        </>
      ) : (
        <>
          <div className="bq-mapa-pie">
            <span>Menos</span>
            <span className="bq-escala" aria-hidden="true">{BQ_ESCALA.map(c => <span key={c} style={{ background: c }} />)}</span>
            <span>más casos, con los demás filtros</span>
          </div>
          <div className="bq-opts">
            {opcion('rural', S.rural, 'Rural · veredas', nRural, () => parcharS(S.rural ? { rural: false, veredas: [] } : { rural: true }))}
            {nSin > 0 && opcion('sinpot', S.sinPot, 'Sin barrio POT', nSin, () => parcharS({ sinPot: !S.sinPot }), 'Filas cuyo barrio escrito no calza con el POT')}
          </div>
          {S.rural && (
            <>
              <div className="bq-lbl">Veredas</div>
              <div className="bq-opts">
                {veredas.map(v => [v, n(porBar, 'V:' + _normLugarBQ(v))]).filter(x => x[1]).sort((a, b) => b[1] - a[1])
                  .map(([v, cn]) => opcion('v' + v, S.veredas.includes(v), v, cn, () => parcharS({ veredas: toggle(S.veredas, v) })))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

const BQ_CAMPOS = [['rad', 'Radicado', 'de radicado'], ['vis', 'Visita', 'de visita'],
  ['asig', 'Asignación', 'de asignación'], ['cierre', 'Cierre', 'de cierre'], ['cit', 'Citación', 'de citación']];
const BQ_CAMPOS_BASICOS = 2;   // Radicado y Visita; el resto, tras «Otras fechas»
const BQ_CAMPO_FECHA = { rad: 'fRad', asig: 'fAsig', vis: 'fVis', cierre: 'fCierre', cit: 'fCit' };
const BQ_MES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const BQ_ANIO0 = 2024;

function CuandoBQ({ S, parcharS, base, hoy }) {
  const [arrastre, setArrastre] = useStateB(null);   // { a, b } índices de mes
  const [otrasFechas, setOtrasFechas] = useStateB(false);
  const nMes = (hoy.getFullYear() - BQ_ANIO0) * 12 + hoy.getMonth() + 1;
  const idxMes = d => (d.getFullYear() - BQ_ANIO0) * 12 + d.getMonth();
  const deISO = t => { const p = t.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const campo = BQ_CAMPO_FECHA[S.campo] ? S.campo : 'rad';
  const hist = useMemoB(() => {
    const b = new Array(nMes).fill(0), visto = new Set(); let sinF = 0;
    base.forEach(c => {
      if (visto.has(c.clave)) return; visto.add(c.clave);
      const d = c[BQ_CAMPO_FECHA[campo]];
      if (!d) { sinF++; return; }
      const i = idxMes(d); if (i >= 0 && i < nMes) b[i]++;
    });
    return { barras: b, sin: sinF };
  }, [base, campo, nMes]);
  const barras = hist.barras, sin = hist.sin;
  const max = Math.max(1, ...barras);
  const y = hoy.getFullYear(), m = hoy.getMonth();
  const presets = [
    ['Este mes', _iniMesBQ(y, m), hoy],
    [BQ_MES_L[(m + 11) % 12].replace(/^./, x => x.toUpperCase()), _iniMesBQ(y, m - 1), _finMesBQ(y, m - 1)],
    ['Últimos 30 días', new Date(y, m, hoy.getDate() - 30), hoy],
    ['Este año', new Date(y, 0, 1), hoy],
    [String(y - 1), new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)],
  ];
  const rango = !!(S.desde || S.hasta);
  const enArrastre = arrastre ? [Math.min(arrastre.a, arrastre.b), Math.max(arrastre.a, arrastre.b)] : null;
  const ia = enArrastre ? enArrastre[0] : (S.desde ? idxMes(deISO(S.desde)) : -1);
  const ib = enArrastre ? enArrastre[1] : (S.hasta ? idxMes(deISO(S.hasta)) : nMes);
  const marcado = !!enArrastre || rango;
  const idxDe = e => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(nMes - 1, Math.floor((e.clientX - r.left) / r.width * nMes)));
  };
  const soltar = () => {
    if (!arrastre) return;
    const i = Math.min(arrastre.a, arrastre.b), j = Math.max(arrastre.a, arrastre.b);
    setArrastre(null);
    const fin = _finMesBQ(BQ_ANIO0 + Math.floor(j / 12), j % 12);
    parcharS({ desde: _isoBQ(new Date(BQ_ANIO0 + Math.floor(i / 12), i % 12, 1)), hasta: _isoBQ(fin > hoy ? hoy : fin) });
  };
  const campoL = (BQ_CAMPOS.find(x => x[0] === campo) || BQ_CAMPOS[0])[2];
  const ejes = [];
  for (let a = BQ_ANIO0; a <= y; a++) ejes.push(<span key={a} style={{ left: ((a - BQ_ANIO0) * 12 / nMes * 100) + '%' }}>{a}</span>);

  return (
    <>
      <div className="adm-tabs bq-campo" role="group" aria-label="Qué fecha">
        {BQ_CAMPOS.filter((x, i) => i < BQ_CAMPOS_BASICOS || otrasFechas || x[0] === campo).map(([k, l]) => (
          <button key={k} type="button" className={'adm-tab' + (campo === k ? ' activo' : '')} aria-pressed={campo === k}
            onClick={() => parcharS({ campo: k })}>{l}</button>
        ))}
        {!otrasFechas && (
          <button type="button" className="adm-tab bq-campo-mas" onClick={() => setOtrasFechas(true)}>Otras fechas…</button>
        )}
      </div>
      <div className="bq-opts" style={{ marginTop: 8 }}>
        {presets.map(([l, a, b]) => {
          const on = S.desde === _isoBQ(a) && S.hasta === _isoBQ(b);
          return (
            <button key={l} type="button" className={'bq-op' + (on ? ' on' : '')} aria-pressed={on}
              onClick={() => parcharS(on ? { desde: '', hasta: '' } : { desde: _isoBQ(a), hasta: _isoBQ(b) })}><span>{l}</span></button>
          );
        })}
      </div>
      <div className={'bq-hist' + (marcado ? ' rango' : '')}>
        <svg viewBox={'0 0 ' + nMes + ' 100'} preserveAspectRatio="none" aria-label={'Casos por mes, fecha ' + campoL}
          onPointerDown={e => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* puntero ya liberado */ } const i = idxDe(e); setArrastre({ a: i, b: i }); }}
          onPointerMove={e => { if (arrastre) { const i = idxDe(e); if (i !== arrastre.b) setArrastre({ a: arrastre.a, b: i }); } }}
          onPointerUp={soltar} onPointerCancel={() => setArrastre(null)}>
          {barras.map((cn, i) => {
            const h = cn ? Math.max(3, cn / max * 96) : 0;
            const d = new Date(BQ_ANIO0, i, 1);
            return (
              <g key={i}>
                <rect className={'bq-hb' + (marcado && i >= ia && i <= ib ? ' in' : '')} x={i + .12} y={100 - h} width=".76" height={h} pointerEvents="none" />
                <rect x={i} y="0" width="1" height="100" fill="transparent">
                  <title>{BQ_MES_L[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + cn + ' casos'}</title>
                </rect>
              </g>
            );
          })}
        </svg>
        <div className="bq-hist-ejes">{ejes}</div>
      </div>
      <div className="bq-rango-in">
        <label>Desde<input type="date" value={S.desde} max={_isoBQ(hoy)} onChange={e => parcharS({ desde: e.target.value })} /></label>
        <label>Hasta<input type="date" value={S.hasta} max={_isoBQ(hoy)} onChange={e => parcharS({ hasta: e.target.value })} /></label>
      </div>
      <p className="bq-nota">
        {rango
          ? <>{sin > 0 && <><b>{_n0BQ(sin)}</b> casos sin fecha {campoL} quedan fuera. </>}
              <button type="button" className="bq-volver" onClick={() => parcharS({ desde: '', hasta: '' })}>Quitar el periodo</button></>
          : 'Arrastra sobre las barras para elegir un periodo, o usa un atajo.'}
      </p>
    </>
  );
}

const BQ_EST_RES = [['PENDIENTE', 'Pendientes', 'var(--brand)'], ['ASIGNADO', 'Asignadas', 'var(--amarillo)'],
  ['INICIADO', 'Iniciadas', 'var(--azul)'], ['COMPLETADO', 'Completadas', 'var(--verde)']];

// Lo filtrado se lee como informe (nota 8): estados, suspensiones, mediana
// radicado → visita (solo PQR con visita) y reparto por inspector (quien ve todo).
function ResumenBQ({ casos, veTodo }) {
  if (!casos.length) return null;
  const porE = {}; casos.forEach(c => { porE[c.estado] = (porE[c.estado] || 0) + 1; });
  const susp = casos.filter(c => c.susp).length;
  const lapsos = casos.filter(c => c.fVis && c.fRad && c.tipo === 'PQR')
    .map(c => Math.round((c.fVis - c.fRad) / 86400000)).filter(d => d >= 0).sort((a, b) => a - b);
  const med = lapsos.length ? lapsos[Math.floor(lapsos.length / 2)] : null;
  const porI = {}; casos.forEach(c => { if (c.vis[0]) porI[c.vis[0]] = (porI[c.vis[0]] || 0) + 1; });
  const insp = Object.entries(porI).sort((a, b) => b[1] - a[1]);
  const est = BQ_EST_RES.filter(e => porE[e[0]]);
  const nombre = k => { const p = k.split(' ')[0]; return p.charAt(0) + p.slice(1).toLowerCase(); };
  return (
    <div className="bq-resumen">
      <div className="bq-resumen-tit">Lo filtrado</div>
      <div className="bq-barra" aria-hidden="true">
        {est.map(e => <span key={e[0]} style={{ width: (porE[e[0]] / casos.length * 100) + '%', background: e[2] }} />)}
      </div>
      <div className="bq-cifras">
        {est.map(e => <span key={e[0]}><span className="bq-res-dot" style={{ background: e[2] }} />{e[1]} <b>{_n0BQ(porE[e[0]])}</b></span>)}
        {susp > 0 && <span>Con suspensión <b>{_n0BQ(susp)}</b></span>}
        {med !== null && <span>Radicado → visita <b>{med} días</b> (mediana)</span>}
        {veTodo && insp.length > 0 && (
          <span className="bq-insp">Por inspector: {insp.slice(0, 4).map(([k, cn], i) => (
            <React.Fragment key={k}>{i > 0 && ' · '}{nombre(k)} <b>{_n0BQ(cn)}</b></React.Fragment>
          ))}{insp.length > 4 && ' · +' + (insp.length - 4)}</span>
        )}
      </div>
    </div>
  );
}

// ── Exportar (E5d) ────────────────────────────────────────────
// Solo admin y supervisor. Exporta los casos de la lista (lo filtrado) a Excel
// con las columnas elegidas. Antes de armar el archivo, el backend deja la
// exportación en LOG_AUDITORIA; si eso falla, no se descarga nada.
const _fmtFechaBQ = d => d instanceof Date && !isNaN(d) ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() : '';
const _colF = (c, ...nombres) => { for (const n of nombres) { const v = c.f && c.f[n]; if (v != null && String(v).trim() !== '') return String(v).trim(); } return ''; };
const BQ_EXP_COLS = [
  ['Caso', 'rad', 'Radicado', c => c.rad],
  ['Caso', 'frad', 'Fecha de radicado', c => _fmtFechaBQ(c.fRad)],
  ['Caso', 'tipo', 'Tipo de caso', c => ({ PQR: 'PQR', OFICIO: 'De oficio', V2: 'Sin radicado (V2)' })[c.tipo] || c.tipo],
  ['Caso', 'estado', 'Estado', c => (BQ_EST_RES.find(e => e[0] === c.estado) || [, c.estado])[1].replace(/s$/, '')],
  ['Caso', 'prio', 'Prioridad', c => c.prio],
  ['Caso', 'reit', 'Radicados reiterados', c => (c.reit || []).join(' / ')],
  ['Caso', 'nvis', 'N° de visita', c => c.nvis || ''],
  ['Ubicación', 'dir', 'Dirección', c => c.dir],
  ['Ubicación', 'barrio', 'Barrio (POT)', c => c.rural ? 'Vda. ' + c.vereda : (c.barrio || c.barrioTxt)],
  ['Ubicación', 'comuna', 'Comuna', c => c.rural ? 'Rural' : c.comuna],
  ['Ubicación', 'latlon', 'Latitud y longitud', c => (c.lat && c.lon) ? c.lat + ', ' + c.lon : ''],
  ['Ubicación', 'cat', 'Código catastral', c => _colF(c, 'CODIGO CATASTRAL', 'CATASTRAL')],
  ['Visita', 'vis', 'Visitador(es)', c => (c.vis || []).join(' / ')],
  ['Visita', 'fasig', 'Fecha de asignación', c => _fmtFechaBQ(c.fAsig)],
  ['Visita', 'fvis', 'Fecha de visita', c => _fmtFechaBQ(c.fVis)],
  ['Visita', 'fcierre', 'Fecha de cierre', c => _fmtFechaBQ(c.fCierre)],
  ['Visita', 'fcit', 'Fecha de citación', c => _colF(c, 'FECHA CITACION')],
  ['Hallazgos', 'infr', 'Tipo de infracción', c => (c.infr || []).join(' | ')],
  ['Hallazgos', 'obra', 'Estado de la obra', c => c.obra],
  ['Hallazgos', 'susp', 'Suspensión de obra', c => _colF(c, 'SUSPENSION DE LA OBRA')],
  ['Hallazgos', 'orden', 'N° orden de policía', c => c.orden],
  ['Hallazgos', 'lic', 'Licencia aportada', c => c.lic],
  ['POT', 'poli', 'Polígono uso del suelo', c => _colF(c, 'POLIGONO USO SUELO')],
  ['POT', 'sp', 'Suelo de protección', c => _colF(c, 'SUELO DE PROTECCION')],
  ['POT', 'amen', 'Amenaza', c => _colF(c, 'AMENAZA')],
  ['POT', 'ret', 'Cumple retiro de quebrada', c => _colF(c, 'CUMPLE RETIRO QUEBRADA')],
  ['Entregables', 'l_carpeta', 'Carpeta de Drive', c => _colF(c, 'LINK_DRIVE')],
  ['Entregables', 'l_acta', 'Acta', c => _colF(c, 'LINK_PDF_ACTA', 'LINK_XLSX_ACTA')],
  ['Entregables', 'l_inf', 'Informe', c => _colF(c, 'LINK_DOCX_INFORME', 'LINK_INFORME_F43')],
  ['Entregables', 'l_rf', 'Registro fotográfico', c => _colF(c, 'LINK_REGISTRO_FOTOS')],
  ['Entregables', 'obs', 'Actuación / observaciones', c => _colF(c, 'ACTUACION / OBSERVACIONES', 'ACTUACION')],
  ['Datos personales', 'denun', 'Denunciante', c => _colF(c, 'DENUNCIANTE', 'DENUNCIANTE/REMITENTE'), 1],
  ['Datos personales', 'atiende', 'Persona que atiende', c => _colF(c, 'NOMBRE PERSONA ATIENDE'), 1],
  ['Datos personales', 'cc', 'Cédula de quien atiende', c => _colF(c, 'ID PERSONA ATIENDE'), 1],
  ['Datos personales', 'tel', 'Teléfono', c => _colF(c, 'TELEFONO PERSONA ATIENDE'), 1],
  ['Datos personales', 'mail', 'Correo', c => _colF(c, 'CORREO ELECTRONICO'), 1],
  ['Datos personales', 'notif', 'Dirección de notificación', c => _colF(c, 'DIR NOTIFICACION'), 1],
];
const BQ_EXP_PRESETS = [
  ['Informe mensual', ['rad', 'frad', 'estado', 'dir', 'barrio', 'comuna', 'vis', 'fvis', 'fcierre', 'infr', 'susp']],
  ['Para jurídica', ['rad', 'dir', 'barrio', 'vis', 'fvis', 'infr', 'susp', 'orden', 'lic', 'l_acta', 'l_inf', 'atiende']],
  ['Ubicación y POT', ['rad', 'dir', 'barrio', 'comuna', 'latlon', 'cat', 'poli', 'sp', 'amen', 'ret']],
];
const BQ_EXP_KEY = 'cu_buscar_export_cols_v1';

function ExportarBQ({ casos, resumenFiltros, onCerrar, toast }) {
  const [sel, setSel] = useStateB(() => {
    try { const g = JSON.parse(localStorage.getItem(BQ_EXP_KEY)); if (Array.isArray(g) && g.length) return new Set(g); } catch (e) { /* sin almacenamiento */ }
    return new Set(BQ_EXP_PRESETS[0][1]);
  });
  const [ocupado, setOcupado] = useStateB(false);
  const [error, setError] = useStateB('');
  useEffectB(() => {
    const onKey = e => { if (e.key === 'Escape' && !ocupado) onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ocupado, onCerrar]);

  const grupos = [...new Set(BQ_EXP_COLS.map(c => c[0]))];
  const personales = BQ_EXP_COLS.filter(c => c[4] && sel.has(c[1]));
  const nPers = personales.length ? casos.filter(c => personales.some(k => k[3](c))).length : 0;
  const actual = [...sel].sort().join();
  const cambiar = (k, on) => setSel(prev => { const s = new Set(prev); on ? s.add(k) : s.delete(k); return s; });
  const toggleGrupo = g => {
    const cs = BQ_EXP_COLS.filter(c => c[0] === g), todas = cs.every(c => sel.has(c[1]));
    setSel(prev => { const s = new Set(prev); cs.forEach(c => todas ? s.delete(c[1]) : s.add(c[1])); return s; });
  };

  async function descargar() {
    const cols = BQ_EXP_COLS.filter(c => sel.has(c[1]));
    if (!cols.length || ocupado) return;
    setOcupado(true); setError('');
    try {
      // Primero el registro: sin él no hay archivo (decisión del usuario 2026-10-05).
      await registrarExportacion(casos.length, cols.map(c => c[2]), personales.map(c => c[2]), resumenFiltros);
      const XLSX = await cargarXLSX();
      const filas = [cols.map(c => c[2])].concat(casos.map(c => cols.map(k => { const v = k[3](c); return v == null ? '' : v; })));
      const hoja = XLSX.utils.aoa_to_sheet(filas);
      hoja['!cols'] = cols.map(c => ({ wch: Math.min(48, Math.max(10, c[2].length + 2)) }));
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Casos');
      const hoy = new Date();
      XLSX.writeFile(libro, 'buscar_' + _isoBQ(hoy) + '_' + casos.length + '-casos.xlsx');
      try { localStorage.setItem(BQ_EXP_KEY, JSON.stringify([...sel])); } catch (e) { /* sin almacenamiento */ }
      toast('Excel descargado · quedó registrado en la auditoría');
      onCerrar();
    } catch (e) {
      setError((e && e.message) || 'No se pudo exportar.');
    }
    setOcupado(false);
  }

  return (
    <div className="bq-export-velo" onClick={e => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
      <div className="bq-export" role="dialog" aria-modal="true" aria-labelledby="bq-export-tit">
        <div className="bq-export-cab">
          <h2 id="bq-export-tit">Exportar {_n0BQ(casos.length)} {casos.length === 1 ? 'caso' : 'casos'}</h2>
          <button type="button" className="vc-btn bq-ico" onClick={onCerrar} disabled={ocupado} aria-label="Cerrar">×</button>
        </div>
        <div className="bq-opts bq-export-presets">
          <span>Atajos:</span>
          {BQ_EXP_PRESETS.map(([l, ks]) => {
            const on = ks.slice().sort().join() === actual;
            return <button key={l} type="button" className={'bq-op' + (on ? ' on' : '')} aria-pressed={on} onClick={() => setSel(new Set(ks))}><span>{l}</span></button>;
          })}
        </div>
        <div className="bq-export-cols">
          {grupos.map(g => {
            const cs = BQ_EXP_COLS.filter(c => c[0] === g), todas = cs.every(c => sel.has(c[1]));
            return (
              <div key={g} className={'bq-colg' + (g === 'Datos personales' ? ' personal' : '')}>
                <h3>{g}<button type="button" onClick={() => toggleGrupo(g)}>{todas ? 'Ninguna' : 'Todas'}</button></h3>
                <div className="bq-colg-items">
                  {cs.map(c => (
                    <label key={c[1]}><input type="checkbox" checked={sel.has(c[1])} onChange={e => cambiar(c[1], e.target.checked)} />{c[2]}</label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {personales.length > 0 && (
          <div className="bq-aviso">
            Incluye datos personales de <b>{_n0BQ(nPers)}</b> ciudadanos ({personales.map(c => c[2].toLowerCase()).join(', ')}).
            Úsalo solo para el trámite del caso; el archivo no se comparte por fuera de la Inspección.
          </div>
        )}
        {error && <div className="bq-aviso bq-aviso-error" role="alert">{error}</div>}
        <div className="bq-export-pie">
          <span>La exportación queda registrada en la auditoría.</span>
          <button type="button" className="vc-btn vc-btn-cta" onClick={descargar} disabled={!sel.size || ocupado || !casos.length}>
            {ocupado ? 'Preparando…' : 'Descargar ' + _n0BQ(casos.length) + ' filas · ' + sel.size + ' columnas'}
          </button>
        </div>
      </div>
    </div>
  );
}

window.BuscarScreen = BuscarScreen;
