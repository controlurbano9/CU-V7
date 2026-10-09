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

function _usarMinAnchoBQ(media) {
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
    return crearIndiceBarriosPot(barr.barrios, com.proj);
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
  const toastRef = useRefB(null);

  // Sugerencias de la casilla: lista + índice activo.
  const [sug, setSug] = useStateB([]);
  const [sugAct, setSugAct] = useStateB(-1);

  // ── Estado para acciones de gestión admin ──
  const [inspectores, setInspectores] = useStateB([]);
  const [busyFila, setBusyFila] = useStateB(null);           // _idx de fila en proceso
  const [asignandoFila, setAsignandoFila] = useStateB(null); // _idx con panel de inspector abierto

  const inputBuscarRef = useRefB(null);
  const conPanel = _usarMinAnchoBQ(BQ_ANCHO_PANEL);
  const esAdmin = usuario.rol === 'ADMIN';
  const veTodo = veTodasLasVisitas(usuario.rol);
  const hoy = useMemoB(() => new Date(), []);

  const activos = activosBuscar(S);
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
    } catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
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
    } catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
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
    } catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
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
    } catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
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
  const verDatos = (rep) => window.abrirVisitaDetail && window.abrirVisitaDetail(rep.f, gestionDe(rep));
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
              placeholder="Radicado, dirección, barrio, «sep 2026», «c4», nombre…"
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

          {/* Hueco deliberado: «Dónde» (mapa de comunas/barrios del POT) va en
              E5c2 y «Cuándo» (fecha + histograma por mes) en E5d. Mientras
              tanto, los barrios y comunas que sugiere la casilla se quitan
              como chips en la cabecera de resultados. */}

          <BQSeccion titulo="Quién" n={activos.quien}>
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
          </BQSeccion>

          <BQSeccion titulo="Qué se encontró" n={activos.que}>
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
          </BQSeccion>

          <BQSeccion titulo="Qué falta" n={activos.falta}>
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
                  ? <><span className="vc-sep">·</span><span title="El nombre escrito no calza con ningún barrio del POT"><MarcarBQ texto={c.barrioTxt} q={q} /> <span className="bq-tag">sin POT</span></span></>
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

  return (
    <section className="fv-sec bq-gestion">
      <h3 className="mv-sub">Gestión</h3>
      <div className="bq-seg">
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

window.BuscarScreen = BuscarScreen;
