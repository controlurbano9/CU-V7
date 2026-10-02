// ═══════════════════════════════════════════════════════════════
// mis-visitas.jsx — Pantalla "Mis visitas" del inspector logueado
//
// Lista de deuda, no archivador por estado (2026-10-02): lo que el inspector
// debe va primero y ordenado por antigüedad — por hacer, en curso (con lo que
// le falta a cada una) y, al final, las completadas por mes.
//   - Desde 1200 px la lista ocupa un tercio y el resto es el panel de la
//     visita elegida: recorrido del caso, mapa, entregables, lo diligenciado
//     y la PQR legible ahí mismo. Por debajo, la lista sola y «Ver datos»
//     abre el modal de siempre.
//   - La regla (quién ve qué, orden, faltantes, recorrido) vive en
//     utils.js y se prueba en tests/mis-visitas.test.js; aquí solo se pinta.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateMV, useEffect: useEffectMV, useMemo: useMemoMV, useRef: useRefMV } = React;

// Cantidad inicial de completadas visibles
const COMPLETADAS_INICIAL = 20;
const COMPLETADAS_PASO = 20;

// El panel de detalle existe desde este ancho: mismo corte que .mv-2col en
// styles.css. Se decide en JS y no solo con CSS porque el panel monta un mapa
// y un visor de PDF que en un teléfono no deben ni cargarse.
const MV_ANCHO_PANEL = '(min-width: 1200px)';

function useAnchoPanelMV() {
  const hayMQ = typeof window.matchMedia === 'function';
  const [ancho, setAncho] = useStateMV(() => hayMQ && window.matchMedia(MV_ANCHO_PANEL).matches);
  useEffectMV(() => {
    if (!hayMQ) return;
    const mq = window.matchMedia(MV_ANCHO_PANEL);
    const alCambiar = () => setAncho(mq.matches);
    alCambiar();
    if (mq.addEventListener) mq.addEventListener('change', alCambiar); else mq.addListener(alCambiar);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', alCambiar); else mq.removeListener(alCambiar);
    };
  }, []);
  return ancho;
}

const _plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
// ¿Pasó el umbral de demora? Mismo umbral de las alertas de Inicio
// (DIAS_ALERTA_DEMORA, home.jsx): una visita no puede estar «en rojo» aquí y
// no alertar allá.
const _demoradaMV = (dias) => dias != null && dias >= DIAS_ALERTA_DEMORA;

function MisVisitasScreen({ usuario, onContinuar }) {
  const [datos, setDatos]       = useStateMV([]);
  const [cargando, setCargando] = useStateMV(true);
  const [error, setError]       = useStateMV('');
  const [refrescando, setRefrescando] = useStateMV(false);

  // Chip de estado activo ('' = todas) y visita elegida para el panel.
  const [filtro, setFiltro] = useStateMV('');
  const [selIdx, setSelIdx] = useStateMV(null);

  // Paginación para completadas
  const [limiteCompletadas, setLimiteCompletadas] = useStateMV(COMPLETADAS_INICIAL);

  const conPanel = useAnchoPanelMV();
  // La prioridad de la PQR la ven solo admin y supervisores (decisión del
  // usuario 2026-10-02), igual que el «N de prioridad alta» de Inicio.
  const verPrioridad = veTodasLasVisitas(usuario.rol);

  // ── Carga de datos ──
  useEffectMV(() => { cargar(); }, []);
  // Re-pinta sin spinner cuando la actualización en segundo plano trae cambios.
  useEffectMV(() => suscribirVisitas(() => cargar(false, true)), []);

  async function cargar(forzar, silencioso) {
    if (!silencioso) { setCargando(true); setError(''); }
    try {
      const { datos: all } = await leerVisitas(forzar ? { forzar: true } : undefined);
      setDatos(all);
    } catch (e) {
      if (!silencioso) setError(e.message);
    }
    setCargando(false);
  }

  // «Recargar» con datos ya pintados no los esconde tras el spinner: siguen a
  // la vista y solo gira el ícono hasta que responde la red. Sin datos, carga normal.
  async function recargar() {
    if (refrescando) return;
    if (!datos.length) return cargar(true);
    setRefrescando(true);
    try {
      const { datos: all } = await leerVisitas({ forzar: true });
      setDatos(all); setError('');
    } catch (e) { setError(e.message); }
    setRefrescando(false);
  }

  // Regla del diligenciador, visibilidad por fecha de asignación y orden por
  // demora: agruparMisVisitas (utils.js).
  const grupos = useMemoMV(() => agruparMisVisitas(datos, usuario.usuario), [datos, usuario]);
  const meses = useMemoMV(() => mesesMisVisitas(grupos.hechas, limiteCompletadas), [grupos, limiteCompletadas]);

  const conteo = { hacer: grupos.hacer.length, curso: grupos.curso.length, hecha: grupos.hechas.length };
  const total = conteo.hacer + conteo.curso + conteo.hecha;
  // Un filtro que se quedó sin visitas (llegaron datos nuevos) vuelve a «Todas».
  const filtroOk = filtro && conteo[filtro] ? filtro : '';
  const ver = (g) => !filtroOk || filtroOk === g;
  const gruposConVisitas = ['hacer', 'curso', 'hecha'].filter(g => conteo[g] > 0).length;
  const ocultas = conteo.hecha - limiteCompletadas;

  // La elegida es siempre una de las que están a la vista: si el filtro la
  // esconde (o es la primera carga), pasa a la primera — la más demorada.
  const visibles = []
    .concat(ver('hacer') ? grupos.hacer : [])
    .concat(ver('curso') ? grupos.curso : [])
    .concat(ver('hecha') ? grupos.hechas.slice(0, limiteCompletadas) : [])
    .map(x => x.f);
  const sel = conPanel ? (visibles.find(f => f._idx === selIdx) || visibles[0] || null) : null;
  const elegir = (f) => setSelIdx(f._idx);

  const listo = !cargando && !error;
  const fila = (x, tipo) => (
    <FilaMV key={x.f._idx} x={x} tipo={tipo} conPanel={conPanel} elegida={sel === x.f}
      verPrioridad={verPrioridad} onElegir={elegir} onContinuar={onContinuar} />
  );

  // ── Render ──
  return (
    <div className="pantalla activa pad-bottom mv-pantalla">
      {/* Título y recargar en un renglón, como en Inicio. */}
      <div className="titulo-fijo mv-cab">
        <div className="page-title">Mis visitas</div>
        <button onClick={recargar} className={'btn-texto mv-recargar' + (refrescando ? ' icono-girando' : '')}
          disabled={refrescando} aria-busy={refrescando}>
          <Icon.Refresh size={14} /> Recargar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ color: 'var(--rojo)', fontSize: 13, marginBottom: 12 }}>
          {error} &middot;{' '}
          <button onClick={() => cargar(true)} style={{
            background: 'none', border: 'none', color: 'var(--brand-accent)',
            cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit',
          }}>Reintentar</button>
        </div>
      )}

      {/* Cargando */}
      {cargando && (
        <div className="cargando"><div className="spinner"></div>Cargando visitas...</div>
      )}

      {/* Sin visitas */}
      {listo && total === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--texto-suave)', padding: 32, fontSize: 13 }}>
          No tienes visitas asignadas.
        </div>
      )}

      {/* Chips de estado: mismos de Alertas; el de conteo 0 no sale, y con un
          solo grupo no hay nada que filtrar. */}
      {listo && gruposConVisitas > 1 && (
        <div className="sv-chips mv-chips" role="group" aria-label="Filtrar por estado">
          {[['', 'Todas', total],
            ['hacer', 'Por hacer', conteo.hacer],
            ['curso', 'En curso', conteo.curso],
            ['hecha', 'Completadas', conteo.hecha],
          ].filter(c => c[2] > 0).map(c => (
            <button key={c[0]} type="button" aria-pressed={filtroOk === c[0]}
              className={'sv-chip' + (filtroOk === c[0] ? ' activo' : '')}
              onClick={() => setFiltro(c[0])}>{c[1]} {c[2]}</button>
          ))}
        </div>
      )}

      {listo && total > 0 && (
        <div className="mv-2col">
          <div className="mv-lista">
            {ver('hacer') && conteo.hacer > 0 && (
              <>
                <div className="mv-grupo">Por hacer{conteo.hacer > 1 && <span>la más antigua primero</span>}</div>
                {grupos.hacer.map(x => fila(x, 'hacer'))}
              </>
            )}

            {ver('curso') && conteo.curso > 0 && (
              <>
                <div className="mv-grupo">En curso<span>con lo que le falta a cada una</span></div>
                {grupos.curso.map(x => fila(x, 'curso'))}
              </>
            )}

            {ver('hecha') && meses.map(g => (
              <React.Fragment key={g.clave || 'sin-fecha'}>
                <div className="mv-grupo">{g.rotulo}<span>{g.total}</span></div>
                {g.items.map(x => fila(x, 'hecha'))}
              </React.Fragment>
            ))}
            {ver('hecha') && ocultas > 0 && (
              <button type="button" className="vc-btn mv-mas"
                onClick={() => setLimiteCompletadas(l => l + COMPLETADAS_PASO)}>
                Mostrar más <span>({limiteCompletadas} de {conteo.hecha})</span>
              </button>
            )}
          </div>

          {sel && <PanelVisitaMV f={sel} verPrioridad={verPrioridad} onContinuar={onContinuar} />}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Fila de la lista. Mismo código de estado de la Semana y de Alertas: barra
// de 3 px (ocre = por hacer, azul = en curso, olivo = completada), sin
// etiqueta — el grupo ya nombra el estado.
// Un solo botón lleno por fila. Con panel, la fila entera elige la visita y
// «Cómo llegar» / «Ver datos» viven allá; sin panel se quedan aquí, con
// texto (en campo el icono solo se descubre peor y no hay tooltip).
// ═══════════════════════════════════════════════════════════════
function FilaMV({ x, tipo, conPanel, elegida, verPrioridad, onElegir, onContinuar }) {
  const f = x.f;
  const dir = f['DIRECCION INFRACCION'] || f['DIRECCION'] || 'Sin dirección';
  const barrio = f['BARRIO/VEREDA'] || f['BARRIO'] || '';
  const linkActa = f['LINK_PDF_ACTA'] || f['LINK_XLSX_ACTA'];
  const linkInforme = f['LINK_DOCX_INFORME'] || f['LINK_INFORME_F43'];
  const verDatos = () => window.abrirVisitaDetail && window.abrirVisitaDetail(f);
  const sinPropagar = (fn) => (e) => { e.stopPropagation(); fn(); };
  const conCta = tipo !== 'hecha' && !!onContinuar;

  return (
    <div className={'mv-fila mv-' + tipo + (elegida ? ' sel' : '')}
      onClick={conPanel ? () => onElegir(f) : undefined}>
      {tipo === 'hecha' && <span className="mv-fecha">{_fechaCortaMV(x.fecha)}</span>}
      <div className="mv-txt">
        {/* La dirección es el control de teclado de la fila: con panel elige
            la visita, sin panel abre sus datos. */}
        <button type="button" className="mv-dir" title={dir}
          aria-pressed={conPanel ? elegida : undefined}
          onClick={sinPropagar(conPanel ? () => onElegir(f) : verDatos)}>{dir}</button>
        <div className="vc-ident">
          <span className="vc-rad">{f['RADICADO'] || '—'}</span>
          {!conPanel && <BotonPdfRadicado f={f} />}
          {barrio && <><span className="vc-sep">·</span><span>{barrio}</span></>}
          {f['COMUNA'] && <><span className="vc-sep">·</span><span>C{f['COMUNA']}</span></>}
        </div>
        <NotaFilaMV x={x} tipo={tipo} verPrioridad={verPrioridad} />
      </div>

      {(conCta || !conPanel) && (
        <div className="mv-acc">
          {conCta && (puedeDiligenciar(f)
            ? <button type="button" className="vc-btn vc-btn-cta"
                onClick={sinPropagar(() => onContinuar(f._idx, f))}>
                <Icon.Play size={14} /> {tipo === 'curso' ? 'Continuar' : 'Iniciar'}
              </button>
            // Regla del diligenciador: al co-asignado se le dice quién la lleva.
            : <span className="vc-dilig">Diligencia {primerVisitador(visitadoresBD(f))}</span>)}
          {!conPanel && (
            <>
              {tipo !== 'hecha' && <BotonMapaVisita f={f} variante="vc" />}
              <button type="button" className="vc-btn" onClick={verDatos}>Ver datos</button>
              {tipo === 'hecha' && linkActa && <a className="vc-btn" href={linkActa} target="_blank" rel="noopener noreferrer">Acta</a>}
              {tipo === 'hecha' && linkInforme && <a className="vc-btn" href={linkInforme} target="_blank" rel="noopener noreferrer">Informe</a>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// «29 sep»: el mes ya lo nombra el grupo, pero la fila se lee sola al filtrar.
function _fechaCortaMV(d) {
  return d ? d.getDate() + ' ' + _MESES_ES[d.getMonth()].slice(0, 3) : '—';
}

// Tercer renglón de la fila: por qué está en la lista.
//   por hacer   → hace cuánto está asignada (rojo desde el umbral de demora)
//   en curso    → qué le falta y hace cuánto se visitó
//   completada  → solo lo que quedó sin generar; si está entera, nada
function NotaFilaMV({ x, tipo, verPrioridad }) {
  const f = x.f;
  const partes = [];
  if (tipo === 'hacer') {
    const fAsig = formatearFecha(f['FECHA ASIGNACION VISITA'] || '');
    if (x.dias > 0) {
      partes.push(<b key="d" className={_demoradaMV(x.dias) ? 'demora' : ''}>Asignada hace {_plural(x.dias, 'día', 'días')}</b>);
    } else if (fAsig) {
      partes.push(<span key="d">Asignada {fAsig === hoyDDMMAAAA() ? 'hoy' : 'el ' + fAsig}</span>);
    }
    const fRad = formatearFecha(f['FECHA RADICADO'] || '');
    if (fRad) partes.push(<span key="r">radicada {fRad}</span>);
    if (verPrioridad && /CR[IÍ]TICO|ALTO/i.test(String(f['PRIORIDAD'] || ''))) partes.push(<b key="p">prioridad alta</b>);
  } else if (tipo === 'curso') {
    partes.push(x.faltan.length
      ? <b key="f" className="falta">Falta: {x.faltan.join(' · ')}</b>
      : <span key="f"><b className="ok">Entregables completos</b>, pendiente de cierre</span>);
    const fVis = formatearFecha(f['FECHA DE VISITA'] || '');
    if (x.dias > 0) {
      partes.push(<b key="d" className={_demoradaMV(x.dias) ? 'demora' : ''}>visitada hace {_plural(x.dias, 'día', 'días')}</b>);
    } else if (fVis) {
      partes.push(<span key="d">visitada {fVis === hoyDDMMAAAA() ? 'hoy' : 'el ' + fVis}</span>);
    }
  } else {
    if (!(f['LINK_PDF_ACTA'] || f['LINK_XLSX_ACTA'])) partes.push(<span key="a">Sin acta</span>);
    if (!(f['LINK_DOCX_INFORME'] || f['LINK_INFORME_F43'])) partes.push(<span key="i">Sin informe</span>);
  }
  if (!partes.length) return null;
  return (
    <div className="mv-nota">
      {partes.map((p, i) => <React.Fragment key={i}>{i > 0 && ' · '}{p}</React.Fragment>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Panel de la visita elegida (solo ≥1200). Sustituye a «Ver datos» en
// escritorio: en vez de las diez secciones del modal con sus «—», muestra
// dónde está detenido el caso y solo los campos que tienen dato. El modal
// completo sigue a un clic («Ver datos»), que es donde el admin gestiona los
// reiterados.
// No lleva `key` por visita a propósito: el mapa se reutiliza entre
// selecciones (cada instancia nueva es una carga facturable de Maps).
// ═══════════════════════════════════════════════════════════════
const _ESTADO_PANEL_MV = {
  PENDIENTE:  { cls: '',          label: 'Pendiente' },
  ASIGNADO:   { cls: '',          label: 'Asignada' },
  INICIADO:   { cls: ' mv-e-curso', label: 'Iniciada' },
  COMPLETADO: { cls: ' mv-e-hecha', label: 'Completada' },
};

function PanelVisitaMV({ f, verPrioridad, onContinuar }) {
  const cajaRef = useRefMV(null);
  // Otra visita: el panel vuelve arriba.
  useEffectMV(() => { if (cajaRef.current) cajaRef.current.scrollTop = 0; }, [f._idx]);

  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  const empezada = est === 'INICIADO' || est === 'COMPLETADO';
  const completa = est === 'COMPLETADO';
  const tono = _ESTADO_PANEL_MV[est] || { cls: '', label: est || '—' };
  const dir = f['DIRECCION INFRACCION'] || f['DIRECCION'] || 'Sin dirección';
  const barrio = f['BARRIO/VEREDA'] || f['BARRIO'] || '';
  const nVisita = Number(_g(f, 'N° VISITA', 'N VISITA', 16)) || 0;
  const lugar = [barrio, f['COMUNA'] ? 'Comuna ' + f['COMUNA'] : '', nVisita > 1 ? 'Visita N°' + nVisita : '']
    .filter(Boolean).join(' · ');
  const pasos = recorridoVisita(f);

  // Actuación y conclusiones van juntas en la BD (misma separación del modal).
  const partes = String(_g(f, 'ACTUACION / OBSERVACIONES', 'ACTUACION', 46) || '').split('\n══CONCLUSIONES══\n');
  const actuacion = (partes[0] || '').trim();
  const conclusiones = (partes[1] || '').trim();

  const principal = claveRadicado(String(f['RADICADO'] || '').trim());
  const reiterados = radicadosReiterados(f).filter(r => r !== principal);

  const conDato = (pares) => pares.filter(p => p && p[1] != null && String(p[1]).trim() !== '' && p[1] !== '—');
  const caso = conDato([
    ['Denunciante', _g(f, 'DENUNCIANTE/REMITENTE', 'DENUNCIANTE', 6)],
    verPrioridad && ['Prioridad', f['PRIORIDAD']],
    !completa && ['Días de la PQR', f['ATENCION PQR']],
    ['N° orden de policía', ordenPoliciaDe(f)],
    ['Fecha de citación', f['FECHA CITACION']],
    ['Visitador(es)', visitadoresBD(f), true],
    ['Radicados reiterados', reiterados.join(' · '), true],
  ]);
  const diligenciado = !empezada ? [] : conDato([
    ['Persona que atiende', _g(f, 'NOMBRE PERSONA ATIENDE', 7)],
    ['Teléfono', _g(f, 'TELEFONO PERSONA ATIENDE', 9)],
    ['Relación con el evento', _g(f, 'RELACION CON EL EVENTO', 10)],
    ['Estado de la obra', _g(f, 'ESTADO OBRA', 22)],
    ['Habitado', _siNo(_g(f, 'HABITADO', 27))],
    ['Altura en pisos', _g(f, 'ALTURA EN PISOS', 28)],
    ['Usos actuales', _g(f, 'USOS ACTUALES', 30)],
    ['Se aportó licencia', _siNo(_g(f, 'SE APORTO LICENCIA', 35))],
    ['N° licencia', _g(f, 'N° LICENCIA', 'N LICENCIA', 34)],
    ['Suspensión de obra', _siNo(_g(f, 'SUSPENSION DE LA OBRA', 43))],
    ['Área contravención (m²)', _g(f, 'AREA CONTRAVENCION m2', 'AREA CONTRAVENCION M2', 24)],
    ['Polígono uso de suelo', _g(f, 'POLIGONO USO SUELO', 51)],
    ['Amenaza natural', _siNo(_g(f, 'AMENAZA', 52))],
    ['Suelo de protección', _siNo(_g(f, 'SUELO DE PROTECCION', 53))],
    ['Código catastral', _g(f, 'CODIGO CATASTRAL', 'CATASTRAL', 32)],
    ['Tipo de contravención', _g(f, 'TIPO DE INFRACCION', 23), true],
  ]);

  const idPqr = idArchivoDrive(linkPdfRadicado(f));
  // Segunda columna: lo que se lee (lo diligenciado, la PQR). Si no hay nada
  // que poner ahí —visita de oficio sin iniciar— el cuerpo queda en una.
  const hayLectura = diligenciado.length > 0 || !!actuacion || !!conclusiones || !!idPqr;

  return (
    <section className="mv-panel" ref={cajaRef} aria-label={'Detalle de la visita ' + dir}>
      <div className="mv-p-cab">
        <div className="mv-p-id">
          <span className={'al-estado' + tono.cls}>{tono.label}</span>
          <div className="mv-p-dir">{dir}</div>
          <div className="vc-ident">
            <span className="vc-rad">{f['RADICADO'] || '—'}</span>
            <BotonPdfRadicado f={f} />
            {lugar && <><span className="vc-sep">·</span><span>{lugar}</span></>}
          </div>
        </div>
        <div className="mv-p-acc">
          {!completa && onContinuar && (puedeDiligenciar(f)
            ? <button type="button" className="vc-btn vc-btn-cta" onClick={() => onContinuar(f._idx, f)}>
                <Icon.Play size={14} /> {est === 'INICIADO' ? 'Continuar visita' : 'Iniciar visita'}
              </button>
            : <span className="vc-dilig">Diligencia {primerVisitador(visitadoresBD(f))}</span>)}
          <BotonMapaVisita f={f} variante="vc" />
          {f['LINK_DRIVE'] && (
            <a className="vc-btn" href={f['LINK_DRIVE']} target="_blank" rel="noopener noreferrer">
              <Icon.Folder size={14} /> Carpeta
            </a>
          )}
          <button type="button" className="vc-btn"
            onClick={() => window.abrirVisitaDetail && window.abrirVisitaDetail(f)}>Ver datos</button>
        </div>
      </div>

      {/* Recorrido del caso: el anillo marca dónde está detenido. */}
      <div className="mv-linea" role="list" aria-label="Recorrido del caso">
        {pasos.map((p, i) => {
          const sig = pasos[i + 1];
          const cls = 'mv-paso'
            + (p.hecho ? ' hecho' : '')
            + (p.hecho && sig && sig.hecho ? ' tramo' : '')
            + (p.espera ? ' espera' : '')
            + (p.espera && _demoradaMV(p.dias) ? ' demora' : '')
            + (!p.hecho && !p.espera ? ' futuro' : '');
          return (
            <div key={p.clave} className={cls} role="listitem">
              <div className="mv-paso-rot">{p.rotulo}</div>
              <div className="mv-paso-val">{p.valor || '—'}</div>
              {p.espera && p.dias > 0 && <div className="mv-paso-sub">hace {_plural(p.dias, 'día', 'días')}</div>}
            </div>
          );
        })}
      </div>

      <div className={'mv-p-cuerpo' + (hayLectura ? ' mv-dos' : '')}>
        <div>
          {empezada && (
            <div className="mv-bloque">
              <h3 className="mv-sub">Entregables{!completa && <small>se generan dentro de la visita</small>}</h3>
              {_entregablesMV(f).map(e => (
                <div className="mv-ent" key={e.n}>
                  <span className={'ent-dot' + (e.link ? ' ed-ok' : (completa ? '' : ' ed-pend'))} aria-hidden="true" />
                  <span className="mv-ent-n">{e.n}</span>
                  {e.link
                    ? <a className="vc-btn" href={e.link} target="_blank" rel="noopener noreferrer">Abrir</a>
                    : <span className={'mv-ent-e' + (completa ? '' : ' falta')}>{completa ? 'No se generó' : 'Falta'}</span>}
                </div>
              ))}
            </div>
          )}

          <MapaPanelMV f={f} />

          {caso.length > 0 && (
            <div className="mv-bloque">
              <h3 className="mv-sub">Datos del caso</h3>
              <_DatosMV pares={caso} />
            </div>
          )}

          {!empezada && (
            <div className="mv-bloque">
              <h3 className="mv-sub">Entregables</h3>
              <div className="mv-ent-e">Se habilitan al iniciar la visita.</div>
            </div>
          )}
        </div>

        {hayLectura && (
          <div>
            {diligenciado.length > 0 && (
              <div className="mv-bloque">
                <h3 className="mv-sub">Lo diligenciado<small>solo los campos con dato</small></h3>
                <_DatosMV pares={diligenciado} />
              </div>
            )}
            {actuacion && (
              <div className="mv-bloque">
                <h3 className="mv-sub">Situación encontrada</h3>
                <p className="mv-texto">{actuacion}</p>
              </div>
            )}
            {conclusiones && (
              <div className="mv-bloque">
                <h3 className="mv-sub">Observaciones y conclusiones</h3>
                <p className="mv-texto">{conclusiones}</p>
              </div>
            )}
            {idPqr && <PqrPanelMV id={idPqr} link={linkPdfRadicado(f)} radicado={f['RADICADO']} />}
          </div>
        )}
      </div>
    </section>
  );
}

// Entregables de la visita para el panel. Orden y vigilancia solo si aplican:
// la orden cuando hay N° real; la solicitud cuando ya existe (la genera el
// gestor al completar, no es algo que el inspector deba).
function _entregablesMV(f) {
  const orden = ordenPoliciaDe(f);
  const items = [
    { n: 'Acta de Inspección Ocular', link: f['LINK_PDF_ACTA'] || f['LINK_XLSX_ACTA'] },
    { n: 'Informe de inspección', link: f['LINK_DOCX_INFORME'] || f['LINK_INFORME_F43'] },
    { n: 'Registro fotográfico', link: f['LINK_REGISTRO_FOTOS'] },
  ];
  if (orden) items.push({ n: 'Orden de policía ' + orden, link: f['LINK_ORDEN_POLICIA'] });
  if (f['LINK_SOLICITUD_VIGILANCIA']) items.push({ n: 'Solicitud de vigilancia', link: f['LINK_SOLICITUD_VIGILANCIA'] });
  return items;
}

// Pares [rótulo, valor, ancho?] como lista de definición.
function _DatosMV({ pares }) {
  return (
    <dl className="mv-datos">
      {pares.map(p => (
        <div key={p[0]} className={p[2] ? 'ancho' : undefined}>
          <dt>{p[0]}</dt>
          <dd>{String(p[1])}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Mapa del panel ─────────────────────────────────────────────
// Con coordenadas guardadas, ese punto; sin ellas, el predio de catastro si
// la dirección calza (puntoMapaCatastro: la misma regla de «Cómo llegar», que
// nunca descarga catastro.json por esto). Sin ninguno de los dos el bloque no
// aparece: un mapa de Bello entero no le dice nada al inspector.
// El componente queda montado aunque no haya punto, para conservar la
// instancia del mapa entre visitas. El SDK se pide solo cuando hay algo que
// mostrar, y el contorno del predio solo si catastro ya está a mano.
function MapaPanelMV({ f }) {
  const divRef = useRefMV(null);
  const mapRef = useRefMV(null);
  const markerRef = useRefMV(null);
  const polysRef = useRefMV([]);
  // null = esperando el SDK · true = listo · false = se rindió (sin señal)
  const [gm, setGm] = useStateMV(_googleMapsYaEsta() ? true : null);
  const [punto, setPunto] = useStateMV(null);   // { lat, lon, origen: 'bd' | 'catastro' }

  const dir = String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim();
  const lat = normalizarCoord(f['LATITUD'], 'lat');
  const lon = normalizarCoord(f['LONGITUD'], 'lon');

  useEffectMV(() => {
    if (lat != null && lon != null) { setPunto({ lat: lat, lon: lon, origen: 'bd' }); return; }
    setPunto(null);
    if (!filaNecesitaPuntoCatastro(f) || typeof puntoMapaCatastro !== 'function') return;
    let vivo = true;
    puntoMapaCatastro(dir)
      .then(p => { if (vivo && p) setPunto({ lat: p[0], lon: p[1], origen: 'catastro' }); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [f._idx, lat, lon, dir]);

  useEffectMV(() => {
    if (!punto || gm !== null) return;
    return _cuandoGoogleMapsListo(setGm);
  }, [punto, gm]);

  useEffectMV(() => {
    if (gm !== true || !punto || !divRef.current) return;
    const pos = { lat: punto.lat, lng: punto.lon };
    if (!mapRef.current) {
      mapRef.current = new google.maps.Map(divRef.current, {
        center: pos, zoom: 19, mapTypeId: 'hybrid',
        disableDefaultUI: true, zoomControl: true, clickableIcons: false,
        // 'cooperative': la rueda del ratón sigue desplazando el panel; para
        // acercar el mapa hay que usar Ctrl + rueda o los botones.
        gestureHandling: 'cooperative',
      });
      markerRef.current = new google.maps.Marker({ position: pos, map: mapRef.current });
    } else {
      mapRef.current.setCenter(pos);
      mapRef.current.setZoom(19);
      markerRef.current.setPosition(pos);
    }
    (polysRef.current || []).forEach(pg => pg.setMap(null));
    polysRef.current = [];
    let vivo = true;
    let cancelar = () => {};
    if (typeof _catastroDisponibleSinRed === 'function') {
      _catastroDisponibleSinRed().then(ok => {
        if (vivo && ok && mapRef.current) {
          cancelar = _resaltarPredioCatastral(mapRef.current, polysRef, punto.lat, punto.lon);
        }
      }).catch(() => {});
    }
    return () => { vivo = false; cancelar(); };
  }, [gm, punto]);

  useEffectMV(() => () => {
    if (mapRef.current && typeof google !== 'undefined' && google.maps) {
      google.maps.event.clearInstanceListeners(mapRef.current);
    }
    mapRef.current = null;
    markerRef.current = null;
  }, []);

  return (
    <div className="mv-bloque" hidden={!punto || gm === false}>
      <div className="mv-mapa" ref={divRef} />
      {punto && (
        <div className="mv-mapa-pie">
          {punto.origen === 'bd'
            ? punto.lat.toFixed(6) + ', ' + punto.lon.toFixed(6)
            : 'Predio de catastro para esa dirección; la ubicación se confirma en la visita'}
        </div>
      )}
    </div>
  );
}

// ── La PQR dentro del panel ────────────────────────────────────
// El PDF que el chip «PQR» abre en otra pestaña, legible al lado de la lista
// (vista previa de Drive). Requiere `https://drive.google.com` en el
// frame-src del CSP de index.html, y que los PDF sigan siendo de enlace
// público: si se restringen, este bloque habrá que servirlo por el webhook
// (precedente: obtenerFotoBase64).
function PqrPanelMV({ id, link, radicado }) {
  const enLinea = typeof navigator === 'undefined' || navigator.onLine !== false;
  return (
    <div className="mv-bloque">
      <h3 className="mv-sub">PQR radicada
        <a className="mv-sub-link" href={link} target="_blank" rel="noopener noreferrer">Abrir en otra pestaña</a>
      </h3>
      {enLinea
        ? <div className="mv-pqr">
            <iframe key={id} src={'https://drive.google.com/file/d/' + id + '/preview'}
              title={'PQR radicada ' + (radicado || '')} loading="lazy" referrerPolicy="no-referrer" />
          </div>
        : <div className="mv-ent-e">Sin conexión: el documento no se puede mostrar aquí.</div>}
    </div>
  );
}

// Exponer componente en el scope global
window.MisVisitasScreen = MisVisitasScreen;
