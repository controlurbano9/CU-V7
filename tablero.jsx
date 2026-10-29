// ═══════════════════════════════════════════════════════════════
// v6/tablero.jsx — Tablero territorial (E7)
//   «¿Cómo va la inspección y dónde está el problema?» No repite Inicio
//   («qué hago hoy») ni Buscar («dónde está este caso»).
//   Toda la regla vive en utils.js (prepararFilaTablero y compañía,
//   pruebas en tests/tablero.test.js): aquí solo se pinta y se filtra.
//   Referencia de comportamiento: herramientas/tablero/propuesta-tablero.html
//   (estructura y textos; ningún dato de ella llega al repo).
// ═══════════════════════════════════════════════════════════════
const { useState: useStateTB, useEffect: useEffectTB, useRef: useRefTB, useMemo: useMemoTB } = React;

// Estados del tablero (§3): color con los tokens existentes.
const TB_ESTADOS = {
  P: { n: 'Pendiente', c: 'var(--brand)' },
  A: { n: 'Asignada', c: 'var(--amber)' },
  I: { n: 'Iniciada', c: 'var(--info)' },
  C: { n: 'Completada', c: 'var(--green)' },
  X: { n: 'Cerrada sin visita', c: 'var(--ink-4)' },
};
const TB_EST_KEYS = ['P', 'A', 'I', 'C', 'X'];
// Rampa secuencial (una tinta, claro→oscuro): --tb-s0 es el neutro (sin dato).
const TB_RAMPA = ['var(--tb-s0)', 'var(--tb-s1)', 'var(--tb-s2)', 'var(--tb-s3)', 'var(--tb-s4)', 'var(--tb-s5)'];
const TB_METRICAS = {
  vivos: { t: 'Casos vivos', u: '' },
  mas30: { t: 'Vivos con más de 30 días', u: '' },
  dias: { t: 'Días a visita (mediana)', u: ' d' },
};
const TB_INFR = {
  A1: 'A1 · Áreas protegidas',
  A2: 'A2 · Diferente a lo aprobado',
  A3: 'A3 · Bienes de uso público',
  A4: 'A4 · Sin licencia o caducada',
  NO: 'No se evidencia infracción',
  X: 'Texto libre de V2 (sin tipificar)',
};
const TB_MES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const TB_TOPE_LISTA = 400;

const _n0TB = n => Number(n || 0).toLocaleString('es-CO');
const _numTB = n => (n == null ? '—' : _n0TB(n));
// Comuna como rótulo: la 12 es la rural (§3).
const _comTB = c => (c === '12' ? 'Rural' : 'Comuna ' + c);
const _isoTB = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const _vivoTB = f => f.est === 'P' || f.est === 'A' || f.est === 'I';

function _filtrosTBVacios() {
  return {
    dim: 'fr', per: 'todo', desde: null, hasta: null,
    com: '', bar: null, ins: '', est: TB_EST_KEYS.slice(),
    vista: 'com', met: 'vivos',
  };
}

// Estado inicial: filtros por defecto + lo que viaje en el hash como JSON
// (§5). `sel` (la visita abierta en el panel) nunca viaja en el enlace.
function _initTB() {
  const S = _filtrosTBVacios();
  try {
    const h = JSON.parse(decodeURIComponent((location.hash || '').slice(1)));
    if (h && typeof h === 'object') {
      // Cada campo se valida: un enlace viejo o editado a mano no rompe la
      // pantalla (revisión DeepSeek 2026-10-17).
      if (h.dim === 'fr' || h.dim === 'fv') S.dim = h.dim;
      if (['todo', '2025', 'anio', '90'].indexOf(h.per) >= 0) S.per = h.per;
      if (typeof h.desde === 'string' || typeof h.desde === 'number') S.desde = h.desde;
      if (typeof h.hasta === 'string' || typeof h.hasta === 'number') S.hasta = h.hasta;
      if (typeof h.com === 'string') S.com = h.com;
      if (typeof h.bar === 'string') S.bar = h.bar;
      if (typeof h.ins === 'string') S.ins = h.ins;
      if (Array.isArray(h.est)) S.est = h.est.filter(k => TB_EST_KEYS.indexOf(k) >= 0);
      if (['com', 'bar', 'pto'].indexOf(h.vista) >= 0) S.vista = h.vista;
      if (TB_METRICAS[h.met]) S.met = h.met;
    }
  } catch (e) { /* enlace roto: se ignora */ }
  S.sel = null;
  return S;
}

// Lleva los filtros al hash (sin `sel`) para que «Copiar enlace» abra la
// misma vista. history.state se conserva: app.jsx lo usa para el botón atrás.
function _urlTB(S) {
  const rest = Object.assign({}, S);
  delete rest.sel;
  history.replaceState(history.state, '', '#' + encodeURIComponent(JSON.stringify(rest)));
}

// Los filtros del tablero traducidos a los de Buscar (claves de
// filtrosBuscarVacios, formato `#f=` de E5) para «Ver en Buscar».
function _aBuscarTB(S, hoy) {
  const d = filtrosBuscarVacios();
  if (S.com) d.comunas = [S.com];
  if (S.bar != null) d.barrios = [S.bar];
  if (S.ins) d.visitador = [S.ins];
  if (Array.isArray(S.est) && S.est.length < TB_EST_KEYS.length) {
    const EST = { P: 'PENDIENTE', A: 'ASIGNADO', I: 'INICIADO', C: 'COMPLETADO', X: 'CERRADO' };
    d.estados = S.est.map(e => EST[e]).filter(Boolean);
  }
  let a = null, b = null;
  if (S.desde != null && S.hasta != null) { a = new Date(S.desde); b = new Date(S.hasta); }
  else if (S.per === '2025') a = new Date(2025, 0, 1);
  else if (S.per === 'anio') a = new Date(hoy.getFullYear(), 0, 1);
  else if (S.per === '90') a = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 90);
  if (a) {
    d.campo = S.dim === 'fv' ? 'vis' : 'rad';
    d.desde = _isoTB(a);
    d.hasta = _isoTB(b || hoy);
  }
  return d;
}

// ═══════════════════════════════════════════════════════════════
// TableroScreen
// ═══════════════════════════════════════════════════════════════
function TableroScreen({ usuario, onNavegar, onContinuar }) {
  const [datos, setDatos] = useStateTB([]);
  const [idxBarrios, setIdxBarrios] = useStateTB(null);
  const [inspectores, setInspectores] = useStateTB([]);
  const [S, setS] = useStateTB(_initTB);
  const [cajon, setCajon] = useStateTB(null);     // { titulo, filas }
  const [toast, setToast] = useStateTB('');
  const toastT = useRefTB(null);
  const panelRef = useRefTB(null);
  const cajonXRef = useRefTB(null);
  const abridorRef = useRefTB(null);   // botón que abrió el cajón: el foco vuelve ahí
  const hoy = useMemoTB(() => new Date(), []);
  useEffectTB(() => () => clearTimeout(toastT.current), []);

  // ── Carga: copia local + re-pintado sin spinner, como Inicio ──
  useEffectTB(() => {
    let vivo = true;
    (async function () {
      try {
        const { datos: all } = await leerVisitas();
        if (vivo) setDatos(all);
      } catch (e) { /* sin red: la copia local ya está o llega vacía */ }
    })();
    const off = suscribirVisitas(async function () {
      try {
        const { datos: all } = await leerVisitas();
        if (vivo) setDatos(all);
      } catch (e) {}
    });
    return function () { vivo = false; off(); };
  }, []);

  // Índice de barrios POT (compartido con Buscar: misma promesa cacheada).
  useEffectTB(() => {
    if (typeof _cargarIdxBarriosBQ === 'function') {
      _cargarIdxBarriosBQ().then(setIdxBarrios).catch(() => {});
    }
  }, []);
  useEffectTB(() => {
    listarInspectoresActivos()
      .then(l => setInspectores((l || []).map(u => u.nombre).filter(n => String(n || '').trim())))
      .catch(() => {});
  }, []);

  function parchar(parcial) {
    setS(prev => Object.assign({}, prev, parcial));
  }
  // Cada cambio de filtros re-escribe el enlace.
  useEffectTB(() => { _urlTB(S); }, [S]);

  function avisar(t) {
    setToast(t);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 2400);
  }

  // ── Filas preparadas (una vez por versión de datos) ──
  const filas = useMemoTB(() => datos
    .filter(f => String(f['RADICADO'] || '').trim())
    .map(f => prepararFilaTablero(f, idxBarrios, hoy)), [datos, idxBarrios, hoy]);

  const base = useMemoTB(() => filtrarTablero(filas, S, null, hoy), [filas, S, hoy]);
  // Cada faceta cuenta sobre los demás filtros, sin el suyo (§4).
  const sinCom = useMemoTB(() => filtrarTablero(filas, S, 'com', hoy), [filas, S, hoy]);

  const sinIns = useMemoTB(() => filtrarTablero(filas, S, 'ins', hoy), [filas, S, hoy]);
  const sinEst = useMemoTB(() => filtrarTablero(filas, S, 'est', hoy), [filas, S, hoy]);
  const sinPer = useMemoTB(() => filtrarTablero(filas, S, 'per', hoy), [filas, S, hoy]);

  const kpis = useMemoTB(() => kpisTablero(sinEst, hoy), [sinEst, hoy]);
  const recorrido = useMemoTB(() => recorridoTablero(base), [base]);
  const equipo = useMemoTB(() => equipoTablero(sinIns, inspectores), [sinIns, inspectores]);
  const hallazgos = useMemoTB(() => hallazgosTablero(base), [base]);
  const calidad = useMemoTB(() => calidadTablero(base), [base]);

  // Opciones con conteo de comuna e inspector.
  const conteoCom = useMemoTB(() => {
    const m = new Map();
    sinCom.forEach(f => m.set(f.com, (m.get(f.com) || 0) + 1));
    return m;
  }, [sinCom]);
  const conteoIns = useMemoTB(() => {
    const m = new Map();
    sinIns.forEach(f => { if (f.ins) m.set(f.ins, (m.get(f.ins) || 0) + 1); });
    return m;
  }, [sinIns]);
  const conteoEst = useMemoTB(() => {
    const m = new Map();
    sinEst.forEach(f => m.set(f.est, (m.get(f.est) || 0) + 1));
    return m;
  }, [sinEst]);
  const nombreIns = useMemoTB(() => {
    // Nombre de pila para selects y tablas: titleCaseNombre ya recorta a
    // «Nombre Apellido» como el resto de la app.
    const m = new Map();
    filas.forEach(f => { if (f.ins && !m.has(f.ins)) m.set(f.ins, titleCaseNombre(f.ins)); });
    return m;
  }, [filas]);

  const sel = S.sel != null ? filas.find(f => f.id === S.sel) : null;

  // ── Acciones ──
  function limpiar() {
    parchar(Object.assign(_filtrosTBVacios(), { vista: S.vista, met: S.met }));
  }
  function copiarEnlace() {
    _urlTB(S);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href)
        .then(() => avisar('Enlace copiado: abre el tablero con estos filtros'))
        .catch(() => avisar('No se pudo copiar el enlace'));
    } else avisar('No se pudo copiar el enlace');
  }
  function verEnBuscar() {
    location.hash = '#f=' + encodeURIComponent(JSON.stringify(_aBuscarTB(S, hoy)));
    onNavegar('buscar');
  }
  function abrirLista(titulo, fs) {
    setCajon({ titulo, filas: fs });
  }
  // Clic en una fila del cajón: ficha en el panel y el mapa en Visitas.
  function elegirFila(f) {
    setCajon(null);
    parchar({ sel: f.id, vista: f.lat != null && f.lon != null ? 'pto' : S.vista });
    if (panelRef.current && panelRef.current.scrollIntoView) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // Esc cierra el cajón (y el foco vuelve al abrirse, §6.9).
  useEffectTB(() => {
    if (!cajon) {
      if (abridorRef.current && abridorRef.current.focus) abridorRef.current.focus();
      abridorRef.current = null;
      return;
    }
    if (!abridorRef.current) abridorRef.current = document.activeElement;
    if (cajonXRef.current) cajonXRef.current.focus();
    const esc = e => { if (e.key === 'Escape') setCajon(null); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [cajon]);

  // ── Indicadores (§6.3): cada uno abre su lista ──
  const sparkTB = (vals) => {
    const v = vals.map(x => (x == null ? null : x));
    const max = Math.max(1, ...v.filter(x => x != null));
    const w = 120, h = 26;
    const pts = v.map((x, i) => (x == null ? null : [i * w / (v.length - 1), h - 3 - (x / max) * (h - 6)]));
    let d = '';
    pts.forEach((p, i) => { if (p) d += (d && pts[i - 1] ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); });
    const last = [...pts].reverse().find(Boolean);
    return (
      <svg width={w} height={h} aria-hidden="true" focusable="false">
        <path d={d} fill="none" stroke="var(--info)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {last && <circle cx={last[0]} cy={last[1]} r="3" fill="var(--info)" stroke="var(--surface)" strokeWidth="1.5" />}
      </svg>
    );
  };
  const mesAct = hoy.getMonth(), mesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).getMonth();
  const tarjetasKpi = [
    { id: 'vivos', t: 'Casos vivos', v: _n0TB(kpis.vivos),
      c: <><b>{_n0TB(kpis.sinAsignar)}</b> sin asignar · {_n0TB(kpis.vivos - kpis.sinAsignar)} con inspector</>,
      filas: sinEst.filter(_vivoTB) },
    { id: 'mas30', t: 'Más de 30 días sin visita', v: _n0TB(kpis.mas30),
      c: <>Mediana de espera: <b>{_numTB(kpis.medEspera)} días</b></>,
      filas: sinEst.filter(f => _vivoTB(f) && f.edad != null && f.edad > 30),
      alerta: kpis.mas30 > 0 },
    { id: 'medvis', t: 'Radicado → visita (mediana)', v: _numTB(kpis.medVisita), sm: 'días',
      c: <>{sparkTB(kpis.serieMedVisita)}<span>12 meses · n={_n0TB(sinEst.filter(f => f.aVisita != null).length)}</span></>,
      filas: sinEst.filter(f => f.aVisita != null) },
    { id: 'mes', t: 'Visitadas en ' + TB_MES_L[mesAct], v: _n0TB(kpis.visitadasMes),
      c: <>{TB_MES_L[mesAnt]} a esta fecha: <b>{_n0TB(kpis.visitadasMesAntAFecha)}</b> · mes completo {_n0TB(kpis.visitadasMesAnt)}</>,
      filas: sinEst.filter(f => f.est === 'C' && f.fv && f.fv.getMonth() === mesAct && f.fv.getFullYear() === hoy.getFullYear()) },
    { id: 'vig', t: 'Órdenes de suspensión sin oficio de vigilancia', v: _n0TB(kpis.ordenesSinVigilancia),
      c: 'Radicados desde 2025, visita iniciada o completada',
      filas: sinEst.filter(f => f.susp === 'SI' && f.orden && !(f.ent & 16) && (f.est === 'I' || f.est === 'C') && f.fr && f.fr >= new Date(2025, 0, 1)),
      alerta: kpis.ordenesSinVigilancia > 0 },
  ];

  // ── Render ──
  const hayFiltros = !!(S.desde != null || S.hasta != null || S.com || S.bar != null || S.ins ||
    (S.est && S.est.length < TB_EST_KEYS.length));

  // Solo admin y supervisor (§ 2): la pestaña ya se oculta, esto cubre la
  // llegada por hash o navegación directa. Después de todos los hooks.
  if (!veTodasLasVisitas(usuario && usuario.rol)) {
    return <div className="tb-vacio">El tablero es solo para administración y supervisión.</div>;
  }

  return (
    <div className="pantalla activa pad-bottom tb-pantalla">
      {/* ── Cabecera ── */}
      <div className="tb-cab">
        <div>
          <div className="tb-titulo">Tablero</div>
          <div className="tb-sub">{_n0TB(base.length)} de {_n0TB(filas.length)} casos en la vista</div>
        </div>
        <div className="tb-cab-der">
          {hayFiltros && <button type="button" className="tb-btn" onClick={limpiar}>Limpiar filtros</button>}
          <button type="button" className="tb-btn prim" onClick={copiarEnlace}>Copiar enlace de esta vista</button>
        </div>
      </div>

      {/* ── Barra de filtros fija (§6.2) ── */}
      <div className="tb-filtros" role="group" aria-label="Filtros del tablero">
        <div className="tb-grupo"><span className="tb-lbl">Periodo por fecha de</span>
          <div className="tb-seg" role="group" aria-label="Fecha del periodo">
            {[['fr', 'radicado'], ['fv', 'visita']].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={S.dim === v} onClick={() => parchar({ dim: v })}>{l}</button>
            ))}
          </div>
        </div>
        <div className="tb-grupo">
          <div className="tb-seg" role="group" aria-label="Periodo">
            {[['todo', 'Todo'], ['2025', 'Desde 2025'], ['anio', String(hoy.getFullYear())], ['90', 'Últimos 90 días']].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={S.desde == null && S.per === v}
                onClick={() => parchar({ per: v, desde: null, hasta: null })}>{l}</button>
            ))}
          </div>
        </div>
        <div className="tb-grupo"><span className="tb-lbl">Comuna</span>
          <select className="tb-select" value={S.com} aria-label="Comuna"
            onChange={e => parchar({ com: e.target.value, bar: null })}>
            <option value="">Todas</option>
            {TB_COMUNAS.map(c => (
              <option key={c} value={c}>{_comTB(c)} ({_n0TB(conteoCom.get(c) || 0)})</option>
            ))}
          </select>
        </div>
        <div className="tb-grupo"><span className="tb-lbl">Inspector</span>
          <select className="tb-select" value={S.ins} aria-label="Inspector"
            onChange={e => parchar({ ins: e.target.value })}>
            <option value="">Todos</option>
            {[...conteoIns.keys()].sort((a, b) => conteoIns.get(b) - conteoIns.get(a)).map(k => (
              <option key={k} value={k}>{nombreIns.get(k) || k} ({_n0TB(conteoIns.get(k))})</option>
            ))}
          </select>
        </div>
        <div className="tb-grupo">
          {TB_EST_KEYS.map(k => (
            <button key={k} type="button" className="tb-chip" aria-pressed={S.est.includes(k)}
              onClick={() => {
                const est = S.est.includes(k) ? S.est.filter(x => x !== k) : S.est.concat([k]);
                parchar({ est: est.length ? est : [k] });
              }}>
              <i className="tb-pt" style={{ background: TB_ESTADOS[k].c }} aria-hidden="true" />
              {TB_ESTADOS[k].n} <span className="tb-chip-n">{_n0TB(conteoEst.get(k) || 0)}</span>
            </button>
          ))}
        </div>
        {(S.desde != null || S.com || S.bar != null || S.ins) && (
          <div className="tb-activos">
            {S.desde != null && (
              <span className="tb-token">
                {(S.dim === 'fr' ? 'Radicado' : 'Visita') + ': ' + formatearFecha(new Date(S.desde)) + ' – ' + formatearFecha(new Date(S.hasta))}
                <button type="button" aria-label="Quitar el periodo"
                  onClick={() => parchar({ desde: null, hasta: null, per: 'todo' })}>×</button>
              </span>
            )}
            {S.com && (
              <span className="tb-token">{_comTB(S.com)}
                <button type="button" aria-label={'Quitar ' + _comTB(S.com)} onClick={() => parchar({ com: '' })}>×</button>
              </span>
            )}
            {S.bar != null && (
              <span className="tb-token">Barrio {S.bar}
                <button type="button" aria-label={'Quitar el barrio ' + S.bar} onClick={() => parchar({ bar: null })}>×</button>
              </span>
            )}
            {S.ins && (
              <span className="tb-token">{nombreIns.get(S.ins) || S.ins}
                <button type="button" aria-label="Quitar el inspector" onClick={() => parchar({ ins: '' })}>×</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Indicadores ── */}
      <div className="tb-kpis">
        {tarjetasKpi.map(k => (
          <button key={k.id} type="button" className={'tb-kpi' + (k.alerta ? ' alerta' : '')}
            onClick={() => abrirLista(k.t, k.filas)}>
            <span className="tb-kpi-t">{k.t}</span>
            <span className="tb-kpi-v">{k.v}{k.sm && <small>{k.sm}</small>}</span>
            <span className="tb-kpi-c">{k.c}</span>
          </button>
        ))}
      </div>

      {/* ── Mapa + panel ── */}
      <div className="tb-fila-mapa">
        <section className="tb-tarj tb-mapa-box">
          <div className="tb-h">
            <h2 className="tb-h2">Mapa de Bello</h2>
            <div className="tb-h-der">
              <div className="tb-seg" role="group" aria-label="Vista del mapa">
                {[['com', 'Comunas'], ['bar', 'Barrios'], ['pto', 'Visitas']].map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={S.vista === v} onClick={() => parchar({ vista: v })}>{l}</button>
                ))}
              </div>
              {S.vista !== 'pto' && (
                <div className="tb-seg" role="group" aria-label="Métrica del mapa">
                  {Object.keys(TB_METRICAS).map(v => (
                    <button key={v} type="button" aria-pressed={S.met === v}
                      onClick={() => parchar({ met: v })}>
                      {v === 'vivos' ? 'Casos vivos' : v === 'mas30' ? '+30 días' : 'Días a visita'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <MapaTB filas={_filasMapaTB(S, sinCom, base)} mapas={idxBarrios && idxBarrios.mapas} proj={idxBarrios && idxBarrios.proj}
            S={S} parchar={parchar} sel={sel} />
        </section>
        <aside className="tb-tarj tb-panel" ref={panelRef} aria-label="Detalle del tablero">
          {sel
            ? <FichaVisita f={sel.f} usuario={usuario} verPrioridad={veTodasLasVisitas(usuario.rol)}
                onContinuar={onContinuar} onCerrar={() => parchar({ sel: null })} />
            : (S.com || S.bar != null)
              ? <FichaAreaTB S={S} base={base} parchar={parchar} abrirLista={abrirLista} />
              : <PanelRankingTB base={base} parchar={parchar} />}
        </aside>
      </div>

      {/* ── Entradas y visitas por mes ── */}
      <section className="tb-tarj tb-fila-tiempo">
        <div className="tb-h">
          <h2 className="tb-h2">Entradas y visitas por mes</h2>
          <div className="tb-mini-ley">
            <span><i className="tb-pt cuadrado" style={{ background: 'var(--info)' }} aria-hidden="true" />Radicadas (barras)</span>
            <span><i className="tb-pt" style={{ background: 'var(--green)' }} aria-hidden="true" />Visitadas (línea)</span>
          </div>
          <div className="tb-ayuda-der">Arrastra sobre los meses para filtrar el periodo · doble clic para quitarlo · flechas para moverte y Mayús+flechas para el rango</div>
        </div>
        <SerieTB filas={sinPer} S={S} parchar={parchar} hoy={hoy} />
      </section>

      {/* ── Recorrido · Equipo · Qué se encuentra ── */}
      <div className="tb-fila-3">
        <RecorridoTB r={recorrido} base={base} abrirLista={abrirLista} />
        <EquipoTB equipo={equipo} S={S} parchar={parchar} abrirLista={abrirLista} nombreIns={nombreIns}
          pendientesSinInspector={sinIns.filter(f => f.est === 'P').length} />
        <HallazgosTB h={hallazgos} base={base} abrirLista={abrirLista} />
      </div>

      {/* ── Calidad del dato ── */}
      <section className="tb-tarj tb-calidad-tarj">
        <div className="tb-h">
          <h2 className="tb-h2">Calidad del dato</h2>
          <span className="tb-nota">Cada vacío es trabajo pendiente: clic para ver los casos</span>
        </div>
        <div className="tb-calidad">
          {calidad.map(q => (
            <button key={q.id} type="button" className="tb-q" onClick={() => abrirLista(q.titulo, q.filas)}>
              <b>{_n0TB(q.filas.length)}</b>{q.titulo}
            </button>
          ))}
        </div>
      </section>

      {/* ── Cajón de lista (§6.9) ── */}
      {cajon && (
        <>
          <div className="tb-cajon-fondo" onClick={() => setCajon(null)} aria-hidden="true" />
          <div className="tb-cajon" role="dialog" aria-modal="true" aria-labelledby="tb-cajon-t">
            <div className="tb-cajon-ch">
              <h3 className="tb-cajon-t" id="tb-cajon-t">{cajon.titulo}</h3>
              <span className="tb-ayuda">
                {_n0TB(cajon.filas.length)} casos{cajon.filas.length > TB_TOPE_LISTA ? ' · se muestran ' + TB_TOPE_LISTA : ''}
              </span>
              <button type="button" className="tb-btn" onClick={verEnBuscar}>Ver en Buscar →</button>
              <button type="button" className="tb-cerrar" ref={cajonXRef} aria-label="Cerrar" onClick={() => setCajon(null)}>×</button>
            </div>
            <div className="tb-cajon-cb">
              <ListaTB filas={cajon.filas} onElegir={elegirFila} />
            </div>
          </div>
        </>
      )}

      {toast && <div className="tb-toast" role="status">{toast}</div>}
    </div>
  );
}

// Las 12 comunas de Bello (la 12 es rural).
const TB_COMUNAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

// Qué filas pinta el mapa: en Comunas, todas las comunas (para elegir otra);
// en Barrios, todos los barrios si ya hay uno elegido, o los de la comuna
// elegida; en Visitas, la vista con todos los filtros.
function _filasMapaTB(S, sinArea, base) {
  if (S.vista === 'com') return sinArea;
  if (S.vista === 'bar') return S.bar != null ? sinArea : base;
  return base;
}

// ── Mapa (§6.4): SVG propio, sin Google Maps ──────────────────
// `mapas` viene del índice compartido con Buscar ({w, h, comunas, barrios})
// y `proj` es la proyección de comunas-mapa.json para pintar los puntos.
function MapaTB({ filas, mapas, proj, S, parchar, sel }) {
  const svgRef = useRefTB(null);
  if (!mapas || !proj) return <div className="tb-mapa-vacio">El mapa de barrios no está disponible sin conexión.</div>;

  const tocarComuna = c => parchar({ com: S.com === c ? '' : c, bar: null, sel: null });
  const tocarBarrio = b => parchar({ bar: S.bar === b ? null : b, com: '', sel: null });
  const teclado = fn => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

  const M = TB_METRICAS[S.met];
  const porCom = agregarPorArea(filas, 'com', S.met);
  const porBar = agregarPorArea(filas, 'bar', S.met);

  let cuerpo = null;
  let leyenda = null;

  if (S.vista === 'com') {
    const vals = mapas.comunas.map(c => porCom.get(String(c.c)) || null);
    const E = escalaMapa(vals);
    cuerpo = <g>
      {mapas.comunas.map((c, i) => {
        const k = String(c.c);
        const v = porCom.get(k) || null;
        const vivos = filas.filter(f => f.com === k);
        const rez = vivos.filter(f => (f.est === 'P' || f.est === 'A' || f.est === 'I') && f.edad > 30).length;
        return (
          <path key={k} className="tb-area" d={c.d} fill={TB_RAMPA[E.colorDe(v)]}
            tabIndex={0} role="button" aria-pressed={S.com === k}
            aria-label={_comTB(k) + ', ' + _numTB(v) + (M.u ? M.u : '') + ' en la métrica ' + M.t}
            onClick={() => tocarComuna(k)} onKeyDown={teclado(() => tocarComuna(k))}>
            <title>{_comTB(k) + ' · ' + _numTB(v) + (M.u || '') + ' · ' + _n0TB(vivos.length) + ' casos en total'}</title>
          </path>
        );
      })}
      {mapas.comunas.map(c => {
        const k = String(c.c);
        const v = porCom.get(k) || null;
        return (
          <text key={'l' + k} className="tb-lbl" x={c.cx} y={c.cy} textAnchor="middle" aria-hidden="true">
            {k === '12' ? 'Rural' : k}
            {v != null && <tspan x={c.cx} dy="13" className="tb-lbl-n">{_n0TB(v)}</tspan>}
          </text>
        );
      })}
    </g>;
    leyenda = <LeyendaRampaTB E={E} M={M} />;
  } else if (S.vista === 'bar') {
    // Lo rural es un solo polígono grande: pinta, pero no fija la escala (§4).
    const vals = mapas.barrios.map(b => porBar.get(b.n) || null);
    const E = escalaMapa(vals);
    const rural = mapas.comunas.find(c => String(c.c) === '12');
    const vr = porCom.get('12') || null;
    cuerpo = <g>
      {rural && (
        <path className="tb-area" d={rural.d} fill={TB_RAMPA[E.colorDe(vr)]}
          tabIndex={0} role="button" aria-pressed={S.com === '12'}
          aria-label={'Rural, ' + _numTB(vr) + (M.u || '')}
          onClick={() => tocarComuna('12')} onKeyDown={teclado(() => tocarComuna('12'))}>
          <title>{'Rural · ' + _numTB(vr) + (M.u || '') + ' · ' + _n0TB(filas.filter(f => f.com === '12').length) + ' casos en total'}</title>
        </path>
      )}
      {mapas.barrios.map((b, i) => {
        const v = porBar.get(b.n) || null;
        return (
          <path key={b.n + i} className="tb-area bar" d={b.d} fill={TB_RAMPA[E.colorDe(v)]}
            tabIndex={0} role="button" aria-pressed={S.bar === b.n}
            aria-label={b.n + ', ' + _numTB(v) + (M.u || '')}
            onClick={() => tocarBarrio(b.n)} onKeyDown={teclado(() => tocarBarrio(b.n))}>
            <title>{b.n + ' · Comuna ' + b.c + ' · ' + _numTB(v) + (M.u || '')}</title>
          </path>
        );
      })}
      {mapas.comunas.map(c => <path key={'b' + c.c} className="tb-borde" d={c.d} aria-hidden="true" />)}
    </g>;
    leyenda = <LeyendaRampaTB E={E} M={M} />;
  } else {
    // Visitas: un punto por fila con coordenadas (§6.4). Los cerrados/completados
    // van abajo y más tenues; los vivos, encima.
    const orden = { C: 0, X: 0, P: 1, A: 2, I: 3 };
    const pts = filas.filter(f => f.lat != null && f.lon != null)
      .slice().sort((a, b) => orden[a.est] - orden[b.est]);
    const xy = f => [(f.lon * proj.k - proj.minX) * proj.s, (proj.maxY - f.lat) * proj.s];
    cuerpo = <g>
      {mapas.comunas.map(c => <path key={c.c} className="tb-area fondo" d={c.d} aria-hidden="true" />)}
      {pts.map(f => {
        const [x, y] = xy(f);
        const viv = _vivoTB(f);
        const aria = f.rad + ', ' + TB_ESTADOS[f.est].n +
          (viv && f.edad != null ? ', ' + f.edad + ' días desde el radicado' : '');
        return (
          <circle key={f.id} className="tb-pto" cx={x.toFixed(1)} cy={y.toFixed(1)} r={viv ? 3.6 : 2.2}
            fill={TB_ESTADOS[f.est].c} fillOpacity={viv ? 1 : .45}
            tabIndex={0} role="button" aria-label={aria}
            onClick={e => { e.stopPropagation(); parchar({ sel: f.id }); }}
            onKeyDown={teclado(() => parchar({ sel: f.id }))}>
            <title>{f.rad + ' · ' + TB_ESTADOS[f.est].n + (f.bar ? ' · ' + f.bar : '')}</title>
          </circle>
        );
      })}
      {sel && sel.lat != null && sel.lon != null && (() => {
        const [x, y] = xy(sel);
        return <circle cx={x} cy={y} r="8" fill="none" stroke="var(--ink)" strokeWidth="2" pointerEvents="none" aria-hidden="true" />;
      })()}
    </g>;
    const sin = filas.length - pts.length;
    leyenda = <span className="tb-ley-txt">
      {TB_EST_KEYS.filter(k => S.est.includes(k)).map(k => (
        <span key={k}><i className="tb-pt" style={{ background: TB_ESTADOS[k].c }} aria-hidden="true" />{TB_ESTADOS[k].n}</span>
      ))}
      <span className="tb-ley-cuenta">{_n0TB(pts.length)} con coordenadas · <b>{_n0TB(sin)} sin punto en el mapa</b></span>
    </span>;
  }

  // Contorno de la selección (comuna o barrio).
  const selPath = S.bar != null
    ? (mapas.barrios.find(b => b.n === S.bar) || null)
    : (S.com ? (mapas.comunas.find(c => String(c.c) === S.com) || null) : null);

  return (
    <div className="tb-mapa-wrap">
      <svg ref={svgRef} className="tb-mapa" viewBox={'0 0 ' + mapas.w + ' ' + mapas.h}
        role="group" aria-label="Mapa de Bello por comuna">
        {cuerpo}
        {selPath && <path className="tb-sel" d={selPath.d} pointerEvents="none" aria-hidden="true" />}
      </svg>
      <div className="tb-leyenda">{leyenda}</div>
    </div>
  );
}

function LeyendaRampaTB({ E, M }) {
  return (
    <>
      <span>{M.t}</span>
      <span className="tb-rampa-caja">
        <span className="tb-rampa" aria-hidden="true">{TB_RAMPA.map(c => <i key={c} style={{ background: c }} />)}</span>
        <span className="tb-rampa-lbl">
          <span>0</span>
          {E.cortes.map(c => <span key={c}>{_n0TB(c)}</span>)}
          <span>{_n0TB(E.max)}{M.u}</span>
        </span>
      </span>
      <span className="tb-ley-ayuda">Clic en un área para filtrar todo el tablero</span>
    </>
  );
}

// ── Panel: ranking de barrios («Dónde está el problema») ──────
function PanelRankingTB({ base, filas, parchar }) {
  const ranking = rankingBarrios(base, 14);
  const max = Math.max(1, ...ranking.map(r => r.vivos));
  return (
    <>
      <div className="tb-h" style={{ margin: 0 }}>
        <h2 className="tb-h2">Dónde está el problema</h2>
      </div>
      <p className="tb-nota-bloque">Casos vivos por barrio · el tono oscuro es lo que lleva más de 30 días</p>
      {ranking.length === 0 && <p className="tb-vacio">Sin casos vivos con estos filtros.</p>}
      {ranking.length > 0 && (
        <div className="tb-rank">
          {ranking.map(r => (
            <React.Fragment key={r.nombre}>
              <button type="button" className="tb-rank-nm" title={r.nombre + ' · Comuna ' + r.com}
                onClick={() => parchar({ bar: r.nombre, com: '' })}>
                {r.nombre} <small>c{r.com}</small>
              </button>
              <span className="tb-rank-b" title={r.vivos + ' vivos, ' + r.mas30 + ' con más de 30 días'}>
                <i style={{ width: (100 * r.vivos / max) + '%', background: 'var(--tb-s2)' }} />
                <i style={{ width: (100 * r.mas30 / max) + '%', background: 'var(--tb-s4)' }} />
              </span>
              <span className="tb-rank-n">{_n0TB(r.vivos)}</span>
            </React.Fragment>
          ))}
        </div>
      )}
      <p className="tb-ayuda-bloque">Clic en un barrio o en el mapa para ver su detalle. En la vista «Visitas», clic en un punto abre su ficha.</p>
    </>
  );
}

// ── Panel: ficha de un área (comuna o barrio) ─────────────────
function FichaAreaTB({ S, base, parchar, abrirLista }) {
  const nombre = S.bar != null ? S.bar : _comTB(S.com);
  const a = fichaAreaTablero(base);
  const vecinos = S.bar == null ? rankingBarrios(base, 6) : null;
  const vivos = base.filter(f => f.est === 'P' || f.est === 'A' || f.est === 'I');
  return (
    <>
      <div className="tb-h" style={{ margin: 0 }}>
        <h2 className="tb-h2-grande">{nombre}</h2>
        <button type="button" className="tb-cerrar" aria-label="Quitar la selección"
          onClick={() => parchar({ com: '', bar: null })}>×</button>
      </div>
      <div>
        <div className="tb-apilada" aria-hidden="true">
          {TB_EST_KEYS.filter(k => a.porEst[k]).map(k => (
            <i key={k} style={{ background: TB_ESTADOS[k].c, width: (100 * a.porEst[k] / (a.n || 1)) + '%' }}
              title={TB_ESTADOS[k].n + ': ' + a.porEst[k]} />
          ))}
        </div>
        <div className="tb-mini-ley">
          {TB_EST_KEYS.filter(k => a.porEst[k]).map(k => (
            <span key={k}><i className="tb-pt" style={{ background: TB_ESTADOS[k].c }} aria-hidden="true" />{TB_ESTADOS[k].n} {_n0TB(a.porEst[k])}</span>
          ))}
        </div>
      </div>
      <div className="tb-stats">
        <div className="tb-stat"><b>{_n0TB(a.vivos)}</b><span>casos vivos</span></div>
        <div className="tb-stat"><b>{a.medEspera == null ? '—' : a.medEspera + ' d'}</b><span>espera mediana de los vivos</span></div>
        <div className="tb-stat"><b>{a.medVisita == null ? '—' : a.medVisita + ' d'}</b><span>radicado → visita</span></div>
      </div>
      {a.porInspector.length > 0 && (
        <div>
          <div className="tb-ayuda-bloque">Casos vivos con inspector</div>
          <div className="tb-mini-ley">
            {a.porInspector.map(p => <span key={p.ins}>{titleCaseNombre(p.ins)} <b>{_n0TB(p.vivos)}</b></span>)}
          </div>
        </div>
      )}
      {vecinos && vecinos.length > 0 && (
        <div>
          <div className="tb-ayuda-bloque">Barrios con más casos vivos</div>
          <div className="tb-rank">
            {vecinos.map(r => (
              <React.Fragment key={r.nombre}>
                <button type="button" className="tb-rank-nm" onClick={() => parchar({ bar: r.nombre, com: '' })}>{r.nombre} <small>c{r.com}</small></button>
                <span className="tb-rank-b"><i style={{ width: Math.min(100, 100 * r.vivos / vecinos[0].vivos) + '%', background: 'var(--tb-s2)' }} /></span>
                <span className="tb-rank-n">{_n0TB(r.vivos)}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
      <button type="button" className="tb-btn" onClick={() => abrirLista('Casos vivos · ' + nombre, vivos)}>
        Ver los {_n0TB(a.vivos)} casos vivos
      </button>
    </>
  );
}

// ── Serie mensual (§6.6): barras + línea, arrastre y teclado ──
function SerieTB({ filas, S, parchar, hoy }) {
  const svgRef = useRefTB(null);
  const [ancho, setAncho] = useStateTB(1000);
  const [arrastrando, setArrastrando] = useStateTB(null);  // { a, b } índices
  const [cursor, setCursor] = useStateTB(null);            // { a, b } teclado

  useEffectTB(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setAncho(el.getBoundingClientRect().width || 1000));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Meses: del primer radicado al mes en curso (sobre la base sin periodo,
  // para poder re-elegir lo que el periodo esconde).
  const minFr = filas.reduce(function (m, f) { return f.fr && (!m || f.fr < m) ? f.fr : m; }, null);
  const desde = minFr ? new Date(minFr.getFullYear(), minFr.getMonth(), 1) : new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const serie = useMemoTB(() => serieMensual(filas, desde, hoy), [filas, desde, hoy]);
  if (!serie.length) return <div className="tb-mapa-vacio">Sin fechas para graficar.</div>;

  const W = ancho, H = 190, ml = 36, mr = 10, mt = 10, mb = 26;
  const max = Math.max(5, ...serie.map(m => Math.max(m.radicadas, m.visitadas)));
  const paso = Math.ceil(max / 4 / 5) * 5, top = paso * 4;
  const bw = (W - ml - mr) / serie.length;
  const y = v => mt + (H - mt - mb) * (1 - v / top);
  const idxDe = ev => {
    const r = svgRef.current.getBoundingClientRect();
    const x = (ev.clientX - r.left) * W / r.width;
    return Math.max(0, Math.min(serie.length - 1, Math.floor((x - ml) / bw)));
  };
  const mesTxt = m => {
    const [a, mm] = m.mes.split('-');
    return TB_MES_L[+mm - 1].slice(0, 3) + ' ' + a.slice(2);
  };
  const aplicarRango = (a, b) => {
    const ini = serie[Math.min(a, b)].mes.split('-').map(Number);
    const fin = serie[Math.max(a, b)].mes.split('-').map(Number);
    parchar({ desde: new Date(ini[0], ini[1] - 1, 1).getTime(), hasta: new Date(fin[0], fin[1], 0).getTime() });
  };
  // El mes toca el periodo si su último día no es anterior al desde y su
  // primero no es posterior al hasta.
  const enRango = i => {
    if (S.desde == null) return true;
    const [a, m] = serie[i].mes.split('-').map(Number);
    return new Date(a, m, 0).getTime() >= S.desde && new Date(a, m - 1, 1).getTime() <= S.hasta;
  };
  const selKB = cursor || arrastrando;

  // Teclado (§6.6): flechas mueven, Mayús+flechas amplían, Enter fija.
  const alTeclado = e => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      const d = k === 'ArrowLeft' ? -1 : 1;
      if (!cursor) { setCursor({ a: serie.length - 1, b: serie.length - 1 }); return; }
      if (e.shiftKey) setCursor(c => ({ a: c.a, b: Math.max(0, Math.min(serie.length - 1, c.b + d)) }));
      else setCursor(c => {
        const b = Math.max(0, Math.min(serie.length - 1, c.b + d));
        return { a: b, b };
      });
    } else if (k === 'Enter' && cursor) {
      e.preventDefault();
      aplicarRango(Math.min(cursor.a, cursor.b), Math.max(cursor.a, cursor.b));
    } else if (k === 'Escape') {
      setCursor(null);
    }
  };

  let dLinea = '';
  serie.forEach((m, i) => { dLinea += (i ? 'L' : 'M') + (ml + i * bw + bw / 2).toFixed(1) + ' ' + y(m.visitadas).toFixed(1); });

  return (
    <svg ref={svgRef} className="tb-tiempo" viewBox={'0 0 ' + W + ' ' + H}
      tabIndex={0} role="img" aria-label="Radicadas y visitadas por mes. Flechas para mover, Mayús más flechas para el rango, Enter para fijar el periodo"
      onKeyUp={alTeclado} onDoubleClick={() => parchar({ desde: null, hasta: null, per: 'todo' })}>
      {[0, 1, 2, 3, 4].map(i => {
        const v = i * paso;
        return (
          <g key={i} aria-hidden="true">
            <line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={i ? '2 3' : ''} />
            <text x={ml - 6} y={y(v) + 4} textAnchor="end" fontSize="10.5" fill="var(--ink-4)">{v}</text>
          </g>
        );
      })}
      {serie.map((m, i) => {
        const x = ml + i * bw;
        const hBarra = y(0) - y(m.radicadas);
        return (
          <g key={m.mes}>
            {m.radicadas > 0 && (
              <path d={'M' + (x + 1) + ' ' + y(0) + 'V' + (y(m.radicadas) + Math.min(3, hBarra)) +
                'q0 -3 3 -3h' + Math.max(0, bw - 8) + 'q3 0 3 3V' + y(0) + 'Z'}
                fill="var(--info)" opacity={enRango(i) ? .85 : .22}>
                <title>{m.mes + ' · Radicadas: ' + m.radicadas + ' · Visitadas: ' + m.visitadas}</title>
              </path>
            )}
            {(m.mes.indexOf('-01') === 5 || i === 0) && (
              <text x={x + bw / 2} y={H - 8} fontSize="10.5" fill="var(--ink-3)" textAnchor="start" aria-hidden="true">
                {m.mes.indexOf('-01') === 5 ? m.mes.slice(0, 4) : mesTxt(m)}
              </text>
            )}
          </g>
        );
      })}
      <path d={dLinea} fill="none" stroke="var(--green)" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" />
      {selKB && (
        <rect x={ml + Math.min(selKB.a, selKB.b) * bw} y={mt} width={(Math.abs(selKB.b - selKB.a) + 1) * bw}
          height={y(0) - mt} fill="var(--ink)" opacity=".08" aria-hidden="true" />
      )}
      {/* Zona de arrastre: captura el mouse para fijar el periodo. */}
      <rect x={ml} y={0} width={W - ml - mr} height={H} fill="transparent"
        onMouseDown={e => { e.preventDefault(); setArrastrando({ a: idxDe(e.nativeEvent), b: idxDe(e.nativeEvent) }); }}
        onMouseMove={e => { if (arrastrando) setArrastrando(d => ({ a: d.a, b: idxDe(e.nativeEvent) })); }}
        onMouseUp={() => {
          if (arrastrando) aplicarRango(Math.min(arrastrando.a, arrastrando.b), Math.max(arrastrando.a, arrastrando.b));
          setArrastrando(null);
        }}
        onMouseLeave={() => setArrastrando(null)} />
    </svg>
  );
}

// ── Recorrido del caso (§6.7) ─────────────────────────────────
function RecorridoTB({ r, base, abrirLista }) {
  const maxN = Math.max(1, ...r.detenidas.map(d => d.n));
  return (
    <section className="tb-tarj">
      <div className="tb-h"><h2 className="tb-h2">Recorrido del caso</h2><span className="tb-nota">Dónde se detiene</span></div>
      <div className="tb-flujo">
        <div className="tb-nodo">Radicada<b>{_n0TB(base.filter(f => f.fr).length)}</b></div>
        <div className="tb-flecha"><span className="tb-flecha-d">{r.radAsig.med == null ? '—' : r.radAsig.med + ' d'}</span><small>n={_n0TB(r.radAsig.n)}</small></div>
        <div className="tb-nodo">Asignada</div>
        <div className="tb-flecha"><span className="tb-flecha-d">{r.asigVis.med == null ? '—' : r.asigVis.med + ' d'}</span><small>n={_n0TB(r.asigVis.n)}</small></div>
        <div className="tb-nodo">Visitada<b>{_n0TB(base.filter(f => f.est === 'C').length)}</b></div>
      </div>
      <p className="tb-ayuda-bloque">
        De punta a punta: <b>{r.radVis.med == null ? '—' : r.radVis.med + ' días'}</b> (mediana). La fecha de
        asignación solo existe desde la app (n pequeño); se excluyen las tomadas sin asignar, que copian la fecha de visita.
      </p>
      <div className="tb-detenidas">
        <span className="tb-det-hd">Hoy detenidas en</span><span className="tb-det-hd" />
        <span className="tb-det-hd num">casos</span><span className="tb-det-hd num">espera</span>
        {r.detenidas.map(d => {
          const fs = base.filter(f => f.est === d.est);
          return (
            <React.Fragment key={d.est}>
              <span className="tb-det-est"><i className="tb-pt" style={{ background: TB_ESTADOS[d.est].c }} aria-hidden="true" />{TB_ESTADOS[d.est].n}</span>
              <button type="button" className="tb-det-b" aria-label={'Ver las ' + d.n + ' ' + TB_ESTADOS[d.est].n.toLowerCase()}
                onClick={() => abrirLista(TB_ESTADOS[d.est].n + 's', fs)}>
                <i style={{ width: (100 * d.n / maxN) + '%', background: TB_ESTADOS[d.est].c }} />
              </button>
              <button type="button" className="tb-det-n num" onClick={() => abrirLista(TB_ESTADOS[d.est].n + 's', fs)}>
                <b>{_n0TB(d.n)}</b>
              </button>
              <span className="tb-det-n num">{d.medEdad == null ? '—' : d.medEdad + ' d'}</span>
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}

// ── Equipo (§6.7): carga y lo que falta, no un ranking ────────
function EquipoTB({ equipo, S, parchar, abrirLista, nombreIns, pendientesSinInspector }) {
  const maxV = Math.max(1, ...equipo.map(r => r.visitadas));
  return (
    <section className="tb-tarj">
      <div className="tb-h"><h2 className="tb-h2">Equipo</h2><span className="tb-nota">Carga actual y lo que falta · clic para filtrar</span></div>
      <table className="tb-eq">
        <thead><tr>
          <th>Inspector</th><th className="num">En curso</th><th>Visitadas</th>
          <th className="num">Rad. → visita</th><th className="num">Iniciadas con faltantes</th>
        </tr></thead>
        <tbody>
          {equipo.map(r => (
            <tr key={r.ins} className={S.ins === r.ins ? 'on' : ''}
              onClick={() => parchar({ ins: S.ins === r.ins ? '' : r.ins })}>
              <td>{r.ins === 'Otros' ? 'Otros' : (nombreIns.get(r.ins) || titleCaseNombre(r.ins))}</td>
              <td className="num"><b>{_n0TB(r.enCurso)}</b></td>
              <td><span className="tb-barra-en"><i style={{ width: Math.round(90 * r.visitadas / maxV) + 'px' }} />{_n0TB(r.visitadas)}</span></td>
              <td className="num">{r.medVisita == null ? '—' : r.medVisita + ' d'}</td>
              {r.conFaltantes.length
                ? <td className="num falta" onClick={e => { e.stopPropagation(); abrirLista('Iniciadas con faltantes · ' + (nombreIns.get(r.ins) || r.ins), r.conFaltantes); }}>
                    {_n0TB(r.conFaltantes.length)}
                  </td>
                : <td className="num">—</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tb-ayuda-bloque">
        {_n0TB(pendientesSinInspector)} casos pendientes no tienen inspector. «Faltantes» = iniciadas sin
        acta, sin registro fotográfico o con orden de suspensión sin escanear.
      </p>
    </section>
  );
}

// ── Qué se encuentra (§6.7) ───────────────────────────────────
function HallazgosTB({ h, base, abrirLista }) {
  const arr = Object.keys(TB_INFR).map(k => ({ k, n: h.porTipo[k] || 0 })).filter(a => a.n);
  const max = Math.max(1, ...arr.map(a => a.n));
  const pct = p => (p == null ? '—' : p + ' %');
  return (
    <section className="tb-tarj">
      <div className="tb-h"><h2 className="tb-h2">Qué se encuentra</h2><span className="tb-nota">Visitas iniciadas y completadas</span></div>
      <div className="tb-rank tres">
        {arr.map(a => (
          <React.Fragment key={a.k}>
            <button type="button" className="tb-rank-nm"
              onClick={() => abrirLista(TB_INFR[a.k], base.filter(f => f.infTxt && (
                (a.k === 'X' && !f.inf.length) ||
                (a.k !== 'X' && f.inf.some(chip =>
                  (a.k === 'NO' ? chip === CONTRAVENCION_ESPECIAL : chip.indexOf(a.k + ':') === 0))))))}>
              {TB_INFR[a.k]}
            </button>
            <span className="tb-rank-b">
              <i style={{ width: (100 * a.n / max) + '%', background: a.k === 'NO' || a.k === 'X' ? 'var(--surface-3)' : 'var(--tb-s4)' }} />
            </span>
            <span className="tb-rank-n">{_n0TB(a.n)}</span>
          </React.Fragment>
        ))}
      </div>
      <p className="tb-ayuda-bloque">{_n0TB(h.sinDato)} sin tipo de infracción registrado.</p>
      <div className="tb-stats">
        <div className="tb-stat"><b>{pct(h.pctSusp.pct)}</b><span>con suspensión (n={_n0TB(h.pctSusp.n)})</span></div>
        <div className="tb-stat"><b>{pct(h.pctLic.pct)}</b><span>aportó licencia (n={_n0TB(h.pctLic.n)})</span></div>
        <div className="tb-stat"><b>{pct(h.pctObraProceso.pct)}</b><span>obra en proceso (n={_n0TB(h.pctObraProceso.n)})</span></div>
      </div>
    </section>
  );
}

// ── Lista del cajón (§6.9) ────────────────────────────────────
function ListaTB({ filas, onElegir }) {
  const vivosSet = { P: 1, A: 1, I: 1 };
  const arr = filas.slice().sort((a, b) =>
    ((vivosSet[b.est] || 0) - (vivosSet[a.est] || 0)) || ((b.edad ?? -1) - (a.edad ?? -1)));
  return (
    <table className="tb-lista">
      <thead><tr>
        <th>Estado</th><th>Radicado</th><th>Barrio</th><th>Com.</th><th>Inspector</th>
        <th className="num">Días</th><th className="num">Prior.</th>
      </tr></thead>
      <tbody>
        {arr.slice(0, TB_TOPE_LISTA).map(f => (
          <tr key={f.id} className="fila" onClick={() => onElegir(f)}>
            <td><span className="tb-est-celda"><i className="tb-pt" style={{ background: TB_ESTADOS[f.est].c }} aria-hidden="true" />{TB_ESTADOS[f.est].n}</span></td>
            <td>{f.rad}</td>
            <td>{f.bar || (f.rural && f.vereda ? 'Vda. ' + f.vereda : '') || '—'}</td>
            <td>{f.com === '12' ? 'R' : f.com || '—'}</td>
            <td>{f.ins ? (titleCaseNombre(f.ins)) : '—'}</td>
            <td className="num">{vivosSet[f.est] ? _numTB(f.edad) : _numTB(f.aVisita)}</td>
            <td className="num">{f.prio ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

window.TableroScreen = TableroScreen;
