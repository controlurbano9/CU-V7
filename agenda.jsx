// ═══════════════════════════════════════════════════════════════
// v6/agenda.jsx — Agenda por inspector (ADMIN). Rediseño 2026-10-03.
//   Regla del usuario: sin mañana/tarde. El sistema sugiere PQR y el admin
//   decide qué asigna, a quién y para qué día. Cada inspector marcado en
//   ⚙ Reglas tiene su día (meta 3, aunque salgan juntos) y cada visita va a
//   uno solo. El tablero arranca armado con la sugerencia (borrador local);
//   nada se escribe hasta «Asignar». «Iniciar visita» se hace desde Buscar.
//   POST obtenerAgenda → { fecha, metaPorInspector, totalPendientes,
//     comunas: [{ comuna, total, visitas: [candidata] }] }
//   POST confirmarAgenda { asignaciones: [{ inspector, fechaAsignacion, visitas }] }
//   La regla vive en utils.js (armarBorradorAgenda, ordenarRuta,
//   motivoPrioridad…; tests/agenda-inspector.test.js): aquí solo se pinta.
//   Maqueta y decisiones: propuesta-agenda.html (no versionada).
// ═══════════════════════════════════════════════════════════════
const { useState: useStateG, useEffect: useEffectG, useRef: useRefG, useMemo: useMemoG } = React;

// Ediciones del borrador por día: { 'DD/MM/AAAA': { nombre: [fila…] } }.
// Sobrevive a salir y volver; los días pasados se descartan al leer.
const AGENDA_BORRADOR_KEY = 'cu_agenda_borrador_v2';
// Marca que deja Administración › Equipo para abrir ⚙ Reglas al llegar.
const AGENDA_ABRIR_REGLAS_KEY = 'cu_agenda_abrir_reglas';

function _ddmmaaaa(d) {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

function leerEdicionesAgenda() {
  try {
    const g = JSON.parse(localStorage.getItem(AGENDA_BORRADOR_KEY) || '{}') || {};
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    Object.keys(g).forEach(k => { const d = parsearFecha(k); if (!d || d < hoy) delete g[k]; });
    return g;
  } catch (e) { return {}; }
}

function guardarEdicionesAgenda(ed) {
  try { localStorage.setItem(AGENDA_BORRADOR_KEY, JSON.stringify(ed)); } catch (e) {}
}

// Mapa de comunas (POT, simplificado: 11 KB). Uno por sesión.
let _mapaComunasPromesa = null;
function cargarMapaComunas() {
  if (!_mapaComunasPromesa) {
    _mapaComunasPromesa = fetch('comunas-mapa.json').then(r => r.ok ? r.json() : null).catch(() => null);
  }
  return _mapaComunasPromesa;
}

// La config guarda palabras clave; se casa por palabra completa,
// case-insensitive, para que "MAURICIO" también pase con "Mauricio Pérez".
function esInspectorAgenda(nombre, palabrasClave) {
  const n = String(nombre || '').trim().toUpperCase();
  if (!n) return false;
  return (palabrasClave || []).some(k => {
    k = String(k || '').trim().toUpperCase();
    return n === k || n.indexOf(k + ' ') === 0 || n.indexOf(' ' + k + ' ') !== -1 || n.lastIndexOf(' ' + k) === n.length - k.length - 1;
  });
}

function direccionVisita(f) {
  return String((f && (f['DIRECCION INFRACCION'] || f['DIRECCION'])) || '').trim();
}

function etiquetaComuna(c) {
  return c === 'RURAL' ? 'Rural' : 'C' + c;
}

function _capitalizar(p) {
  return p ? p.charAt(0) + p.slice(1).toLowerCase() : '';
}
// «ALEJANDRO HERNANDEZ MUÑOZ» → «Alejandro Hernandez», «Alejandro», «AH».
function nombreCorto(n) {
  const p = String(n || '').trim().split(/\s+/);
  return [_capitalizar(p[0]), _capitalizar(p[1])].filter(Boolean).join(' ');
}
function nombrePila(n) { return _capitalizar(String(n || '').trim().split(/\s+/)[0]); }
function inicialesInsp(n) {
  const p = String(n || '').trim().split(/\s+/);
  return ((p[0] || '').charAt(0) + (p[1] || '').charAt(0)).toUpperCase();
}

// Tono por pendientes de la comuna (1 → 21+), del más claro al más oscuro.
function _tonoComuna(n) {
  return n > 20 ? '#C2AB88' : n > 12 ? '#D3C1A6' : n > 5 ? '#E4D8C6' : n > 0 ? '#F1EBE1' : '#F7F3EC';
}

function AgendaScreen({ usuario }) {
  const [data, setData]               = useStateG(null);
  const [cargando, setCargando]       = useStateG(true);
  const [error, setError]             = useStateG('');
  const [dia, setDia]                 = useStateG(() => diaInicialAgenda(new Date()));
  const [cfg, setCfg]                 = useStateG(null);       // { visitasPorInspector, inspectoresAgenda }
  const [activos, setActivos]         = useStateG([]);         // usuarios activos (para ⚙ Reglas)
  const [filasBD, setFilasBD]         = useStateG([]);
  const [ediciones, setEdiciones]     = useStateG(leerEdicionesAgenda);
  const [filtro, setFiltro]           = useStateG(undefined);  // comuna; undefined = la del borrador; null = todas
  const [verTodasComunas, setVerTodasComunas] = useStateG(false);
  const [verMas, setVerMas]           = useStateG(false);
  const [puntos, setPuntos]           = useStateG({});         // dirección → { lat, lon } | null
  const [mapa, setMapa]               = useStateG(null);
  const [reglasAbiertas, setReglasAbiertas] = useStateG(false);
  const [asignando, setAsignando]     = useStateG(false);
  const pidiendoPuntos = useRefG({});

  const esAdmin = usuario.rol === 'ADMIN';

  useEffectG(() => {
    if (!esAdmin) return;
    cargar();
    cargarMapaComunas().then(setMapa);
    try {
      if (sessionStorage.getItem(AGENDA_ABRIR_REGLAS_KEY)) {
        sessionStorage.removeItem(AGENDA_ABRIR_REGLAS_KEY);
        setReglasAbiertas(true);
      }
    } catch (e) {}
  }, []);

  async function cargar(forzarVisitas) {
    setCargando(true); setError('');
    try {
      const [d, c, lista, bd] = await Promise.all([
        gasPost({ accion: 'obtenerAgenda' }),
        leerConfigAgenda(),
        listarInspectoresActivos(),
        leerVisitas(forzarVisitas ? { forzar: true } : undefined),
      ]);
      setData(d);
      setCfg(c);
      setActivos(lista || []);
      setFilasBD((bd && bd.datos) || []);
    } catch (e) { setError(e.message); }
    setCargando(false);
  }

  // ── Derivados ──
  const meta = (cfg && cfg.visitasPorInspector) || (data && data.metaPorInspector) || 3;
  const inspectores = useMemoG(() => activos
    .map(i => i.nombre)
    .filter(n => esInspectorAgenda(n, cfg && cfg.inspectoresAgenda)), [activos, cfg]);
  const comunas = (data && Array.isArray(data.comunas)) ? data.comunas : null;
  const porFila = useMemoG(() => {
    const m = {};
    (comunas || []).forEach(g => g.visitas.forEach(v => { m[v.fila] = v; }));
    return m;
  }, [comunas]);
  const diaKey = _ddmmaaaa(dia);
  const ya = useMemoG(() => {
    const r = {};
    inspectores.forEach(n => { r[n] = visitasDelDia(filasBD, dia, n); });
    return r;
  }, [filasBD, diaKey, inspectores]);

  // Borrador del día: lo editado o, si no se ha tocado, la sugerencia.
  const borrador = useMemoG(() => {
    const ed = ediciones[diaKey];
    if (ed) {
      const r = {};
      inspectores.forEach(n => { r[n] = (ed[n] || []).map(f => porFila[f]).filter(Boolean); });
      return r;
    }
    const yaN = {};
    inspectores.forEach(n => { yaN[n] = ya[n].length; });
    return armarBorradorAgenda(comunas || [], inspectores, meta, yaN);
  }, [ediciones, diaKey, inspectores, porFila, comunas, meta, ya]);

  const duenoDe = useMemoG(() => {
    const m = {};
    inspectores.forEach(n => (borrador[n] || []).forEach(v => { m[v.fila] = n; }));
    return m;
  }, [borrador, inspectores]);

  // Puntos de los predios (solo si catastro ya está en el equipo: nunca lo
  // descarga por esto). Sin punto, la parada va al final de la ruta.
  const dirsRuta = [];
  inspectores.forEach(n => {
    (borrador[n] || []).forEach(v => dirsRuta.push(v.direccion));
    (ya[n] || []).forEach(f => dirsRuta.push(direccionVisita(f)));
  });
  const claveDirs = dirsRuta.join('|');
  useEffectG(() => {
    if (typeof puntoMapaCatastro !== 'function') return;
    dirsRuta.forEach(dir => {
      if (!dir || dir in pidiendoPuntos.current) return;
      pidiendoPuntos.current[dir] = true;
      puntoMapaCatastro(dir)
        .then(p => setPuntos(prev => Object.assign({}, prev, { [dir]: p ? { lat: p[0], lon: p[1] } : null })))
        .catch(() => {});
    });
  }, [claveDirs]);

  // ── Acciones del borrador ──
  function editar(cambio) {
    setEdiciones(prev => {
      const base = {};
      inspectores.forEach(n => { base[n] = (borrador[n] || []).map(v => v.fila); });
      const nuevo = cambio(base);
      const next = Object.assign({}, prev, { [diaKey]: nuevo });
      guardarEdicionesAgenda(next);
      return next;
    });
  }
  function agregar(nombre, fila) {
    editar(b => {
      Object.keys(b).forEach(n => { b[n] = b[n].filter(f => f !== fila); });
      b[nombre] = (b[nombre] || []).concat([fila]);
      return b;
    });
  }
  function quitar(fila) {
    editar(b => {
      Object.keys(b).forEach(n => { b[n] = b[n].filter(f => f !== fila); });
      return b;
    });
  }
  function volverASugerencia() {
    setEdiciones(prev => {
      const next = Object.assign({}, prev);
      delete next[diaKey];
      guardarEdicionesAgenda(next);
      return next;
    });
  }

  const nuevasTotal = inspectores.reduce((s, n) => s + (borrador[n] || []).length, 0);

  async function asignar() {
    if (!nuevasTotal || asignando) return;
    setAsignando(true);
    try {
      const r = await gasPost({
        accion: 'confirmarAgenda',
        asignaciones: inspectores
          .filter(n => (borrador[n] || []).length)
          .map(n => ({
            inspector: n,
            fechaAsignacion: diaKey,
            visitas: borrador[n].map(v => ({ fila: v.fila, radicado: v.radicado })),
          })),
      });
      if (r && r.ok === false) throw new Error(r.error || 'Error desconocido');
      invalidarCache('visitas');
      setEdiciones(prev => {
        const next = Object.assign({}, prev);
        delete next[diaKey];
        guardarEdicionesAgenda(next);
        return next;
      });
      if (r && r.omitidas && r.omitidas.length) {
        await appAlert(
          'Se asignaron ' + (r.actualizados || 0) + '. No se asignaron:\n' +
          r.omitidas.map(o => '· ' + o.radicado + ': ' + o.motivo).join('\n'),
          { tono: 'aviso', titulo: 'Asignación parcial' });
      }
      await cargar(true);
    } catch (e) {
      await appAlert('No se pudo asignar: ' + e.message, { tono: 'error', titulo: 'Error' });
    }
    setAsignando(false);
  }

  if (!esAdmin) {
    return <div className="card" style={{ margin: 16 }}>Acceso restringido (solo ADMIN).</div>;
  }

  // ── Sugeridas ──
  const comunaBorrador = (() => {
    const v = inspectores.length && (borrador[inspectores[0]] || [])[0];
    return v ? v.comuna : (comunas && comunas[0] ? comunas[0].comuna : null);
  })();
  const comunaFiltro = filtro === undefined ? comunaBorrador : filtro;
  const grupoFiltro = comunas && comunaFiltro != null
    ? comunas.find(g => String(g.comuna) === String(comunaFiltro)) : null;

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const esHoy = dia.getTime() === hoy.getTime();
  const aviso = avisoFechaAsignacion(_ddmmaaaa(dia).split('/').reverse().join('-'));

  return (
    <div className="pantalla activa pad-bottom ag-pantalla">
      <header className="ag-cab">
        <div>
          <div className="ag-dia">
            <h1 className="page-title">{fechaLargaAgenda(dia)}</h1>
            <div className="ag-flechas">
              <button type="button" className="ag-flecha" aria-label="Día hábil anterior"
                onClick={() => setDia(d => moverDiaHabil(d, -1))}>‹</button>
              <button type="button" className="ag-flecha" aria-label="Siguiente día hábil"
                onClick={() => setDia(d => moverDiaHabil(d, 1))}>›</button>
            </div>
          </div>
          <div className="ag-dia-nota">
            Asignas para este día.{aviso ? ' ' + aviso : ''}
            {!esHoy && <> <button type="button" onClick={() => setDia(hoy)}>Ir a hoy</button></>}
          </div>
        </div>
        <div className="ag-cab-der">
          {data && comunas && <span><b>{data.totalPendientes}</b> por agendar</span>}
          <button type="button" className="vc-btn" aria-expanded={reglasAbiertas}
            onClick={() => setReglasAbiertas(v => !v)}>
            <Icon.Admin size={14} /> Reglas
          </button>
          <button type="button" className="vc-btn ag-icono" aria-label="Recargar" title="Recargar"
            onClick={() => cargar(true)} disabled={cargando}>
            <Icon.Refresh size={14} />
          </button>
          {reglasAbiertas && (
            <PanelReglasAgenda
              activos={activos} cfg={cfg}
              onCerrar={() => setReglasAbiertas(false)}
              onGuardado={c => { setCfg(c); setReglasAbiertas(false); }} />
          )}
        </div>
      </header>

      {cargando && !data && <div className="ag-estado">Cargando agenda…</div>}
      {error && (
        <div className="card" style={{ color: 'var(--red)' }}>
          No se pudo cargar la agenda: {error}{' '}
          <button type="button" className="vc-btn" onClick={() => cargar(true)}>Reintentar</button>
        </div>
      )}
      {data && !comunas && !error && (
        <div className="card">Esta agenda necesita el servidor actualizado. Recarga en unos minutos.</div>
      )}

      {comunas && (
        <>
          <div className="ag-grid">
            <MapaAgenda mapa={mapa} comunas={comunas} comunaFiltro={comunaFiltro}
              onComuna={c => { setFiltro(c); setVerMas(false); }}
              inspectores={inspectores} borrador={borrador} ya={ya} puntos={puntos} />

            <section className="ag-caja ag-sug" aria-labelledby="ag-sug-t">
              <div className="ag-caja-cab">
                <h2 id="ag-sug-t">Sugeridas</h2>
                <span>de la más urgente a la menos</span>
              </div>
              <div className="ag-filtros" role="group" aria-label="Comuna">
                <button type="button" className={'sv-chip' + (comunaFiltro == null ? ' activo' : '')}
                  aria-pressed={comunaFiltro == null}
                  onClick={() => { setFiltro(null); setVerMas(false); }}>
                  Todas<span>{data.totalPendientes}</span>
                </button>
                {(verTodasComunas ? comunas : comunas.slice(0, 5)).map(g => {
                  const activo = String(g.comuna) === String(comunaFiltro);
                  return (
                    <button key={g.comuna} type="button" className={'sv-chip' + (activo ? ' activo' : '')}
                      aria-pressed={activo} onClick={() => { setFiltro(g.comuna); setVerMas(false); }}>
                      {etiquetaComuna(g.comuna)}<span>{g.total}</span>
                    </button>
                  );
                })}
                {!verTodasComunas && comunas.length > 5 && (
                  <button type="button" className="sv-chip" onClick={() => setVerTodasComunas(true)}>
                    +{comunas.length - 5}
                  </button>
                )}
              </div>
              <ListaSugeridas
                visitas={grupoFiltro ? grupoFiltro.visitas
                  : [].concat(...comunas.map(g => g.visitas)).sort((a, b) => b.score - a.score)}
                agrupar={!!grupoFiltro} verMas={verMas} onVerMas={() => setVerMas(true)}
                inspectores={inspectores} duenoDe={duenoDe}
                onAgregar={agregar} onQuitar={quitar} />
            </section>

            <div className="ag-plan">
              {!inspectores.length && (
                <div className="ag-caja">
                  Nadie recibe visitas de la agenda. Márcalos en{' '}
                  <button type="button" className="ag-link" onClick={() => setReglasAbiertas(true)}>⚙ Reglas</button>.
                </div>
              )}
              {inspectores.map((n, i) => (
                <DiaInspector key={n} nombre={n} indice={i} meta={meta}
                  nuevas={borrador[n] || []} ya={ya[n] || []} puntos={puntos}
                  onQuitar={quitar} />
              ))}
              {ediciones[diaKey] && (
                <button type="button" className="ag-link ag-restablecer" onClick={volverASugerencia}>
                  Volver a la sugerencia
                </button>
              )}
            </div>
          </div>

          <div className="ag-bar">
            <div className="ag-bar-res">
              <b>{fechaLargaAgenda(dia)}</b>
              {inspectores.map((n, i) => (
                <span key={n}>
                  <i className={'ag-punto i' + ((i % 4) + 1)} aria-hidden="true"></i>
                  {nombrePila(n)} <span className="suave">{(borrador[n] || []).length} nuevas</span>
                </span>
              ))}
            </div>
            <button type="button" className="ag-bar-btn" onClick={asignar}
              disabled={!nuevasTotal || asignando}>
              {asignando ? 'Asignando…'
                : nuevasTotal ? `Asignar ${nuevasTotal} ${nuevasTotal === 1 ? 'visita' : 'visitas'}`
                : 'Nada nuevo para asignar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ListaSugeridas({ visitas, agrupar, verMas, onVerMas, inspectores, duenoDe, onAgregar, onQuitar }) {
  if (!visitas.length) return <div className="ag-vacio">No hay visitas por agendar aquí.</div>;
  const tope = agrupar || verMas ? visitas.length : 25;
  const lista = visitas.slice(0, tope);
  // Agrupadas por barrio, en el orden en que aparece cada uno.
  const grupos = [];
  const porBarrio = {};
  lista.forEach(v => {
    const k = agrupar ? (claveBarrio(v.barrio) || '—') : '';
    if (!porBarrio[k]) { porBarrio[k] = { nombre: v.barrio || 'Sin barrio', items: [] }; grupos.push(porBarrio[k]); }
    porBarrio[k].items.push(v);
  });
  return (
    <>
      {grupos.map((g, gi) => (
        <div key={gi}>
          {agrupar && <div className="ag-barrio">{g.nombre} <span>{g.items.length}</span></div>}
          <ul className="ag-sugs">
            {g.items.map(v => {
              const m = motivoPrioridad(v);
              const dueno = duenoDe[v.fila];
              return (
                <li key={v.fila} className={'ag-s' + (dueno ? ' tomada' : '')}>
                  <div className="ag-s-txt">
                    <div className="ag-dir">{v.direccion || 'Sin dirección'}</div>
                    <div className="ag-por" title={'Puntaje ' + v.score + ' · radicado ' + v.radicado}>
                      <span className="nivel">{m.nivel}</span>
                      {m.texto && <> · <span className={m.vencida ? 'vencida' : ''}>{m.texto}</span></>}
                      {!agrupar && <> · {v.barrio || 'Sin barrio'} · {etiquetaComuna(v.comuna)}</>}
                    </div>
                  </div>
                  <div className="ag-s-acc">
                    {dueno ? (
                      <button type="button" className={'ag-en i' + ((inspectores.indexOf(dueno) % 4) + 1)}
                        title={'Quitar del día de ' + nombrePila(dueno)} onClick={() => onQuitar(v.fila)}>
                        {nombrePila(dueno)}
                      </button>
                    ) : inspectores.map((n, i) => (
                      <button key={n} type="button" className={'ag-mas i' + ((i % 4) + 1)}
                        aria-label={'Agregar al día de ' + nombrePila(n)} title={'Agregar al día de ' + nombreCorto(n)}
                        onClick={() => onAgregar(n, v.fila)}>
                        {inicialesInsp(n)}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {lista.length < visitas.length && (
        <button type="button" className="ag-ver" onClick={onVerMas}>
          Ver las {visitas.length}
        </button>
      )}
    </>
  );
}

function DiaInspector({ nombre, indice, meta, nuevas, ya, puntos, onQuitar }) {
  const paradas = ordenarRuta(
    ya.map(f => ({ ya: true, fila: f._idx, direccion: direccionVisita(f), barrio: f['BARRIO/VEREDA'] || f['BARRIO'] || '', comuna: f['COMUNA'], punto: puntos[direccionVisita(f)] || null }))
      .concat(nuevas.map(v => Object.assign({ punto: puntos[v.direccion] || null }, v))),
    AGENDA_OFICINA);
  const total = paradas.length;
  const clase = 'ag-caja ag-insp i' + ((indice % 4) + 1);
  return (
    <section className={clase} aria-labelledby={'ag-insp-' + indice}>
      <div className="ag-insp-cab">
        <span className="ag-ini" aria-hidden="true">{inicialesInsp(nombre)}</span>
        <div className="ag-insp-nom">
          <h2 id={'ag-insp-' + indice} title={nombre}>{nombreCorto(nombre)}</h2>
          <small>{ya.length ? `ya tenía ${ya.length} ${ya.length === 1 ? 'asignada' : 'asignadas'} ese día` : 'sin otras visitas ese día'}</small>
        </div>
        <div className={'ag-meta' + (total > meta ? ' pasa' : '')}>
          {total}<span>/{meta}</span>
          <small>{total > meta ? 'pasa la meta' : 'meta del día'}</small>
        </div>
      </div>
      {total ? (
        <ol className="ag-ruta">
          {paradas.map((p, i) => (
            <li key={(p.ya ? 'y' : 'n') + p.fila} className="ag-parada">
              <span className="ag-num">{i + 1}</span>
              <div>
                <div className="ag-dir">{p.direccion || 'Sin dirección'}</div>
                <div className="ag-por">
                  {[p.barrio, p.comuna != null && p.comuna !== '' ? etiquetaComuna(p.comuna) : ''].filter(Boolean).join(' · ')}
                  {p.ya && <> · <span className="ag-ya">YA ASIGNADA</span></>}
                  {!p.punto && <> · sin ubicación</>}
                </div>
              </div>
              {p.ya ? <span></span> : (
                <button type="button" className="ag-quitar" aria-label={'Quitar ' + (p.direccion || 'visita')}
                  onClick={() => onQuitar(p.fila)}>×</button>
              )}
            </li>
          ))}
        </ol>
      ) : <div className="ag-vacio">Sin visitas para este día. Agrégalas desde las sugeridas.</div>}
      {total > 0 && <div className="ag-vuelve"><i aria-hidden="true">⌂</i> vuelve hacia la Alcaldía</div>}
    </section>
  );
}

// Mapa de comunas: SVG propio (sin Google Maps: costo cero y funciona sin
// señal). Tono = pendientes; tocar una comuna filtra las sugeridas; encima,
// la ruta de cada inspector con su color.
function MapaAgenda({ mapa, comunas, comunaFiltro, onComuna, inspectores, borrador, ya, puntos }) {
  const totales = {};
  comunas.forEach(g => { totales[String(g.comuna)] = g.total; });
  const rural = comunas.find(g => g.comuna === 'RURAL');
  if (!mapa) {
    return (
      <section className="ag-caja ag-mapa" aria-label="Mapa de comunas">
        <div className="ag-vacio">Cargando el mapa…</div>
      </section>
    );
  }
  const pr = mapa.proj;
  const xy = p => [(p.lon * pr.k - pr.minX) * pr.s, (pr.maxY - p.lat) * pr.s];
  const ofi = xy(AGENDA_OFICINA);
  const sel = mapa.comunas.find(c => String(c.c) === String(comunaFiltro));
  const rutas = inspectores.map((n, i) => {
    const paradas = ordenarRuta(
      (ya[n] || []).map(f => ({ punto: puntos[direccionVisita(f)] || null }))
        .concat((borrador[n] || []).map(v => ({ punto: puntos[v.direccion] || null }))),
      AGENDA_OFICINA).filter(p => p.punto);
    return { clase: 'i' + ((i % 4) + 1), pts: paradas.map(p => xy(p.punto)) };
  });
  return (
    <section className="ag-caja ag-mapa" aria-labelledby="ag-mapa-t">
      <div className="ag-caja-cab">
        <h2 id="ag-mapa-t">Ruta sugerida</h2>
        <div className="ag-ley">
          <span className="ag-escala">pendientes
            <span><i style={{ background: '#F1EBE1' }}></i><i style={{ background: '#E4D8C6' }}></i><i style={{ background: '#D3C1A6' }}></i><i style={{ background: '#C2AB88' }}></i></span>
            1 → 21+</span>
          {inspectores.map((n, i) => (
            <span key={n}><i className={'ag-punto i' + ((i % 4) + 1)}></i>{nombrePila(n)}</span>
          ))}
        </div>
      </div>
      <svg className="ag-svg" viewBox={`-12 -12 ${mapa.w + 24} ${mapa.h + 24}`} role="img"
        aria-label="Comunas de Bello con las visitas pendientes y la ruta de cada inspector">
        {mapa.comunas.map(c => {
          const n = totales[String(c.c)] || 0;
          const etiqueta = 'Comuna ' + c.c + ', ' + n + (n === 1 ? ' pendiente' : ' pendientes');
          return (
            <g key={c.c} className="ag-com" tabIndex={0} role="button" aria-label={etiqueta}
              onClick={() => onComuna(Number(c.c))}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onComuna(Number(c.c)); } }}>
              <title>{etiqueta}</title>
              <path d={c.d} fill={_tonoComuna(n)} />
              <text x={c.cx} y={c.cy - 2}>C{c.c}</text>
              <text className="n" x={c.cx} y={c.cy + 12}>{n}</text>
            </g>
          );
        })}
        {sel && <path className="ag-filtro" d={sel.d} />}
        {rutas.map((r, i) => r.pts.length > 0 && (
          <g key={i} className={'ag-rutamapa ' + r.clase}>
            {r.pts.length > 1 && <polyline className="ag-linea" points={r.pts.map(p => p.join(',')).join(' ')} />}
            <line className="ag-vuelta" x1={r.pts[r.pts.length - 1][0]} y1={r.pts[r.pts.length - 1][1]} x2={ofi[0]} y2={ofi[1]} />
            {r.pts.map((p, j) => (
              <g key={j} className="ag-pin">
                <circle cx={p[0]} cy={p[1]} r="9" />
                <text x={p[0]} y={p[1] + 0.5}>{j + 1}</text>
              </g>
            ))}
          </g>
        ))}
        <g className="ag-ofi">
          <rect x={ofi[0] - 6} y={ofi[1] - 6} width="12" height="12" rx="2" />
          <text x={ofi[0]} y={ofi[1] - 11}>Alcaldía</text>
        </g>
      </svg>
      <div className="ag-mapa-pie">
        {rural && (
          <button type="button" className={'ag-rural' + (comunaFiltro === 'RURAL' ? ' activo' : '')}
            aria-pressed={comunaFiltro === 'RURAL'} onClick={() => onComuna('RURAL')}>
            Zona rural<span>{rural.total}</span>
          </button>
        )}
        <span>Toca una comuna para ver sus sugeridas. Cada ruta empieza en la visita más lejana y vuelve hacia la Alcaldía.</span>
      </div>
    </section>
  );
}

// ⚙ Reglas: quién recibe visitas de la agenda y la meta por inspector. Es el
// único sitio que escribe CONFIG_AGENDA (antes, Administración › Agenda).
function PanelReglasAgenda({ activos, cfg, onCerrar, onGuardado }) {
  const [sel, setSel] = useStateG(() => {
    const s = {};
    activos.forEach(i => { s[i.nombre] = esInspectorAgenda(i.nombre, cfg && cfg.inspectoresAgenda); });
    return s;
  });
  const [n, setN] = useStateG((cfg && cfg.visitasPorInspector) || 3);
  const [busy, setBusy] = useStateG(false);
  const [msg, setMsg] = useStateG('');
  const ref = useRefG(null);

  useEffectG(() => {
    function onKey(e) { if (e.key === 'Escape') onCerrar(); }
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[aria-expanded]')) onCerrar();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, []);

  async function guardar() {
    const insp = activos.filter(i => sel[i.nombre]).map(i => i.nombre);
    if (!insp.length) { setMsg('Marca al menos a una persona.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await guardarConfigAgenda({ visitasPorInspector: n, inspectoresAgenda: insp });
      if (r && r.ok === false) throw new Error(r.error || 'Error desconocido');
      onGuardado({ visitasPorInspector: n, inspectoresAgenda: insp });
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  return (
    <div className="ag-reglas" ref={ref} role="dialog" aria-labelledby="ag-reglas-t">
      <h3 id="ag-reglas-t">Reglas de la agenda</h3>
      <div className="ag-reglas-t">Quién recibe visitas de la agenda</div>
      {activos.map(i => (
        <label key={i.nombre} className="ag-hab">
          <input type="checkbox" checked={!!sel[i.nombre]}
            onChange={() => setSel(s => Object.assign({}, s, { [i.nombre]: !s[i.nombre] }))} />
          <b>{i.nombre}</b>
        </label>
      ))}
      <div className="ag-reglas-fila">
        <div><b>Visitas por inspector al día</b><small>Es la meta: puedes asignar más o menos.</small></div>
        <div className="agenda-stepper">
          <button type="button" aria-label="Una menos" disabled={n <= 1} onClick={() => setN(n - 1)}>−</button>
          <span aria-live="polite">{n}</span>
          <button type="button" aria-label="Una más" disabled={n >= 10} onClick={() => setN(n + 1)}>+</button>
        </div>
      </div>
      {msg && <div className="ag-reglas-msg" role="alert">{msg}</div>}
      <div className="ag-reglas-pie">
        <button type="button" className="ag-bar-btn" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="vc-btn" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  );
}

window.AgendaScreen = AgendaScreen;
