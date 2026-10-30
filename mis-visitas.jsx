// ═══════════════════════════════════════════════════════════════
// mis-visitas.jsx — Pantalla "Mis visitas" del inspector logueado
//
// Pantalla de entrada del inspector (arquitectura 2026-10-27, decisión 3):
// chips Pendientes · Semana · Completadas, abre en Pendientes. Arriba la
// siguiente visita de hoy (en el orden de la ruta del día); luego lo propio por
// hacer y en curso, de lo más atrasado a lo más reciente, y al final lo que
// acompaña a otros. Las completadas, por mes, en su chip.
//   - Desde 1200 px la lista ocupa un tercio y el resto es la ficha de la
//     visita elegida (FichaVisita, ficha-visita.jsx): lo básico fijo arriba
//     y un solo scroll con el caso entero, la PQR al lado y el mapa. Por
//     debajo, la lista sola y «Ver datos» abre el modal de siempre.
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
// (DIAS_ALERTA_DEMORA, home.jsx). Lo usa la ficha (ficha-visita.jsx).
const _demoradaMV = (dias) => dias != null && dias >= DIAS_ALERTA_DEMORA;

function MisVisitasScreen({ usuario, onContinuar }) {
  const [datos, setDatos]       = useStateMV([]);
  const [cargando, setCargando] = useStateMV(true);
  const [error, setError]       = useStateMV('');

  // Pendientes · Semana · Completadas (arquitectura 2026-10-27, decisión 3).
  // Siempre abre en Pendientes: es la pantalla de entrada del inspector y lo
  // que importa al abrirla es lo que hay por hacer, no lo último que miró.
  const [vista, setVista] = useStateMV('pend');
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

  // Regla del diligenciador, visibilidad por fecha de asignación y orden por
  // demora: agruparMisVisitas; la siguiente visita y los grupos de Pendientes:
  // pendientesMisVisitas (utils.js, tests/mis-visitas.test.js).
  const grupos = useMemoMV(() => agruparMisVisitas(datos, usuario.usuario), [datos, usuario]);
  const pend = useMemoMV(() => pendientesMisVisitas(grupos, usuario.usuario), [grupos, usuario]);
  const meses = useMemoMV(() => mesesMisVisitas(grupos.hechas, limiteCompletadas), [grupos, limiteCompletadas]);

  const nPend = pend.lista.length + (pend.siguiente ? 1 : 0);
  const nHechas = grupos.hechas.length;
  const ocultas = nHechas - limiteCompletadas;

  // Con panel (≥1200), la elegida es siempre una de las que están a la vista;
  // si no hay ninguna elegida, la primera.
  const visibles = vista === 'hechas'
    ? grupos.hechas.slice(0, limiteCompletadas).map(x => x.f)
    : vista === 'pend'
      ? [].concat(pend.siguiente ? [pend.siguiente.x.f] : [], pend.lista.map(x => x.f), pend.acompanas.map(x => x.f))
      : [];
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
      <div className="titulo-fijo mv-cab">
        <div className="page-title">Mis visitas</div>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--rojo)', fontSize: 13, marginBottom: 12 }}>
          {error} &middot;{' '}
          <button onClick={() => cargar(true)} style={{
            background: 'none', border: 'none', color: 'var(--brand-accent)',
            cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit',
          }}>Reintentar</button>
        </div>
      )}

      {cargando && (
        <div className="cargando"><div className="spinner"></div>Cargando visitas...</div>
      )}

      {/* Una sola fila de chips: la Semana es una vista más, no otra capa. */}
      {listo && (
        <div className="sv-chips mv-chips" role="group" aria-label="Vista">
          {[['pend', 'Pendientes', nPend], ['semana', 'Semana', null], ['hechas', 'Completadas', nHechas]]
            .filter(c => c[0] !== 'hechas' || nHechas > 0)
            .map(c => (
              <button key={c[0]} type="button" aria-pressed={vista === c[0]}
                className={'sv-chip' + (vista === c[0] ? ' activo' : '')}
                onClick={() => setVista(c[0])}>{c[1]}{c[2] != null && <> {c[2]}</>}</button>
            ))}
        </div>
      )}

      {/* Semana: cada visita en su día (la regla del diligenciador ya la aplica
          agruparSemana). Sin chips de inspector: es solo lo propio. */}
      {listo && vista === 'semana' && (
        <SemanaVisitas datos={datos} esAdmin={false} miNombre={usuario.usuario.toUpperCase()}
          inspectores={[]} onAbrir={onContinuar} />
      )}

      {listo && vista !== 'semana' && (
        <div className="mv-2col">
          <div className="mv-lista">
            {vista === 'pend' && (<>
              {!nPend && !pend.acompanas.length && (
                <div className="card" style={{ textAlign: 'center', color: 'var(--texto-suave)', padding: 32, fontSize: 13 }}>
                  No tienes visitas pendientes.
                </div>
              )}
              {pend.siguiente && (<>
                <div className="mv-grupo">Siguiente visita
                  <span>hoy{pend.siguiente.de > 1 && <> · {pend.siguiente.n} de {pend.siguiente.de} en la ruta</>}</span>
                </div>
                <SiguienteVisitaMV s={pend.siguiente} conPanel={conPanel} elegida={sel === pend.siguiente.x.f}
                  onElegir={elegir} onContinuar={onContinuar} />
              </>)}
              {pend.lista.length > 0 && (<>
                <div className="mv-grupo">{pend.lista.length > 1 ? 'Lo más atrasado primero' : 'Pendientes'}</div>
                {pend.lista.map(x => fila(x, x.tipo))}
              </>)}
              {pend.acompanas.length > 0 && (<>
                <div className="mv-grupo">Acompañas a otros<span>{pend.acompanas.length}</span></div>
                {pend.acompanas.map(x => fila(x, 'acompana'))}
              </>)}
            </>)}

            {vista === 'hechas' && meses.map(g => (
              <React.Fragment key={g.clave || 'sin-fecha'}>
                <div className="mv-grupo">{g.rotulo}<span>{g.total}</span></div>
                {g.items.map(x => fila(x, 'hecha'))}
              </React.Fragment>
            ))}
            {vista === 'hechas' && ocultas > 0 && (
              <button type="button" className="vc-btn mv-mas"
                onClick={() => setLimiteCompletadas(l => l + COMPLETADAS_PASO)}>
                Mostrar más <span>({limiteCompletadas} de {nHechas})</span>
              </button>
            )}
          </div>

          {sel && (
            <section className="mv-panel" aria-label={'Ficha de la visita ' + (sel['DIRECCION INFRACCION'] || sel['DIRECCION'] || '')}>
              <FichaVisita f={sel} usuario={usuario} verPrioridad={verPrioridad} onContinuar={onContinuar} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Siguiente visita: la primera de hoy en la ruta del día, destacada arriba
// (recoge la «placa de la siguiente visita» de TASK-valla-inicio-movil).
// «Iniciar» y «Cómo llegar» con texto, a 44 px: es lo que se toca en la calle.
// Tocar la placa abre la ficha (o la elige, con panel).
// ═══════════════════════════════════════════════════════════════
function SiguienteVisitaMV({ s, conPanel, elegida, onElegir, onContinuar }) {
  const f = s.x.f;
  const t = tarjetaVisita(f, { puede: puedeDiligenciar(f) });
  const cita = citaVisitaTexto(f);
  const abrir = () => conPanel ? onElegir(f) : (window.abrirVisitaDetail && window.abrirVisitaDetail(f));
  return (
    <article className={'mv-sig' + (conPanel && elegida ? ' sel' : '')} onClick={abrir}>
      <button type="button" className="mv-sig-dir" title={t.dir}
        onClick={(e) => { e.stopPropagation(); abrir(); }}>{t.dirVisible}</button>
      <div className="tv-meta">{[t.ident.principal, t.ubic].filter(Boolean).join(' · ')}</div>
      {cita && <div className={'tv-meta' + (cita.urgente ? ' tv-demora' : '')}>{cita.texto}</div>}
      <div className="mv-sig-acc" onClick={(e) => e.stopPropagation()}>
        {t.accion && <button type="button" className="tv-btn" onClick={() => onContinuar(f._idx, f)}>{t.accion}</button>}
        <BotonMapaVisita f={f} variante="vc" />
      </div>
    </article>
  );
}

// ═══════════════════════════════════════════════════════════════
// Fila de la lista = tarjeta única (visita-card.jsx). Tarjeta en el celular;
// con panel (≥1200) es renglón y tocarla elige la visita en vez de abrir la
// ficha aparte. «Ver datos», el chip PQR y los enlaces de acta e informe se
// fueron a la ficha (arquitectura 2026-10-27, decisión 1).
// Lo propio de Mis visitas va en `aviso`: la cita (en rojo a ≤3 días hábiles),
// quién la lleva si la diligencia otro y, para admin y supervisor, la prioridad
// alta. `tipo` 'acompana' = la diligencia otro: sin acción (ni para el admin).
// ═══════════════════════════════════════════════════════════════
function FilaMV({ x, tipo, conPanel, elegida, verPrioridad, onElegir, onContinuar }) {
  const f = x.f;
  const ajena = tipo === 'acompana';
  const alta = tipo === 'hacer' && verPrioridad && /CR[IÍ]TICO|ALTO/i.test(String(f['PRIORIDAD'] || ''));
  const cita = tipo !== 'hecha' ? citaVisitaTexto(f) : null;
  const aviso = (cita || ajena || alta) ? (<>
    {cita && <div className={'tv-meta tv-cita' + (cita.urgente ? ' tv-demora' : '')}>{cita.texto}</div>}
    {(ajena || alta) && (
      <div className="tv-meta">
        {ajena && <>La lleva {titleCaseNombre(primerVisitador(visitadoresBD(f)))}</>}
        {ajena && alta && ' · '}
        {alta && <b>Prioridad alta</b>}
      </div>
    )}
  </>) : null;
  return (
    <TarjetaVisita f={f} densidad={conPanel || ajena ? 'renglon' : 'tarjeta'}
      sel={conPanel ? elegida : undefined}
      onAbrir={conPanel ? () => onElegir(f) : undefined}
      accion={ajena ? null : undefined}
      onAccion={onContinuar} aviso={aviso} />
  );
}


// ═══════════════════════════════════════════════════════════════
// Piezas del panel que FichaVisita (ficha-visita.jsx) reutiliza. El panel
// en sí se fue con PanelVisitaMV: la ficha única lo sustituye desde E2b.
// ═══════════════════════════════════════════════════════════════
const _ESTADO_PANEL_MV = {
  PENDIENTE:  { cls: '',          label: 'Pendiente' },
  ASIGNADO:   { cls: '',          label: 'Asignada' },
  INICIADO:   { cls: ' mv-e-curso', label: 'Iniciada' },
  COMPLETADO: { cls: ' mv-e-hecha', label: 'Completada' },
};

// Entregables de la visita para el panel. Orden y vigilancia solo si aplican:
// la orden cuando hay N° real; la solicitud cuando ya existe (la genera el
// gestor al completar, no es algo que el inspector deba).
function _entregablesMV(f) {
  const orden = ordenPoliciaDe(f);
  // El informe solo si existe (decisión del usuario 2026-10-13): la mayoría
  // de las visitas no lo lleva y salía siempre como «Falta».
  const informe = f['LINK_DOCX_INFORME'] || f['LINK_INFORME_F43'];
  const items = [
    { n: 'Acta de Inspección Ocular', link: f['LINK_PDF_ACTA'] || f['LINK_XLSX_ACTA'] },
    { n: 'Registro fotográfico', link: f['LINK_REGISTRO_FOTOS'] },
  ];
  if (informe) items.splice(1, 0, { n: 'Informe de inspección', link: informe });
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
    // Dirección que es una coordenada: ese es el punto (catastro no la lee).
    const pc = puntoDesdeTextoCoord(dir);
    if (pc) { setPunto({ lat: pc.lat, lon: pc.lon, origen: 'bd' }); return; }
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

// Exponer componente en el scope global
window.MisVisitasScreen = MisVisitasScreen;
