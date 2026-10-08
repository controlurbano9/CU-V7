// ═══════════════════════════════════════════════════════════════
// v6/admin.jsx — Pantalla Administración (solo rol ADMIN)
//
// Fase 1 (2026-10-03), solo cliente: Bandeja (vigilancia + guardados
// bloqueados), Equipo (lista de tarjetas + panel de la persona) y Actividad
// (log con filtros). Fase 2 (2026-10-05, backend @134): PIN temporal y rol
// editable en el panel de la persona (se fue Reset PIN), hallazgos por revisar
// e informes rechazados en la Bandeja, log paginado. Las reglas de agenda se
// mudaron a ⚙ Reglas de la Agenda (2026-10-05). La regla vive en utils.js (cargaUsuario,
// ultimaActividad, categoriaLog, parsearFechaHora) y se prueba en
// tests/admin-equipo.test.js; aquí solo se pinta.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA, useRef: useRefA } = React;

// La config de agenda guarda palabras clave («MAURICIO» casa con «Mauricio
// Pérez»). La usa Equipo para saber si una
// persona recibe visitas de la agenda — sin tocar la lógica.
function _casa(nombre, palabra) {
  const n = String(nombre || '').trim().toUpperCase();
  const k = String(palabra || '').trim().toUpperCase();
  if (!n || !k) return false;
  return n === k || n.indexOf(k + ' ') === 0 || n.indexOf(' ' + k + ' ') !== -1 ||
         n.lastIndexOf(' ' + k) === n.length - k.length - 1;
}

// El panel de Equipo existe desde este ancho: mismo corte que .adm-2col en
// styles.css (patrón de mis-visitas.jsx).
const ADM_ANCHO_PANEL = '(min-width: 1200px)';

function useAnchoPanelAdm() {
  const hayMQ = typeof window.matchMedia === 'function';
  const [ancho, setAncho] = useStateA(() => hayMQ && window.matchMedia(ADM_ANCHO_PANEL).matches);
  useEffectA(() => {
    if (!hayMQ) return;
    const mq = window.matchMedia(ADM_ANCHO_PANEL);
    const alCambiar = () => setAncho(mq.matches);
    alCambiar();
    if (mq.addEventListener) mq.addEventListener('change', alCambiar); else mq.addListener(alCambiar);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', alCambiar); else mq.removeListener(alCambiar);
    };
  }, []);
  return ancho;
}

// ── Pantalla ────────────────────────────────────────────────────
// Los tres datos se piden una sola vez al entrar y bajan por props; las
// secciones nuevas no tienen «Recargar». Re-pinta con suscribirVisitas,
// como hacía la vieja pestaña de Vigilancia.
// onAbrirReglasAgenda (app.jsx): lleva a la Agenda con ⚙ Reglas abierto.
// onNavegar (app.jsx): para abrir Buscar con el filtro de una persona.
function AdminScreen({ usuario, onAbrirReglasAgenda, onNavegar }) {
  const [tab, setTab]         = useStateA('equipo');   // equipo | bandeja | actividad
  const [usuarios, setUsuarios] = useStateA([]);
  const [visitas, setVisitas]   = useStateA([]);
  const [log, setLog]           = useStateA([]);
  const [logTotal, setLogTotal] = useStateA(0);
  // Bandeja (backend @134): hallazgos por revisar e informes rechazados. Va
  // aparte de los otros datos: si falla, solo esas secciones lo dicen.
  const [pend, setPend]           = useStateA(null);   // {hallazgos, informesRechazados}
  const [pendError, setPendError] = useStateA('');
  const [cargando, setCargando] = useStateA(true);
  const [error, setError]       = useStateA('');
  const conPanel = useAnchoPanelAdm();
  const esAdmin = usuario.rol === 'ADMIN';

  useEffectA(() => { if (esAdmin) { cargar(); cargarPendientes(); } }, []);
  useEffectA(() => suscribirVisitas(() => {
    leerVisitas().then(r => setVisitas(r.datos || [])).catch(() => {});
  }), []);

  async function cargar() {
    setCargando(true); setError('');
    try {
      const [us, vis, lg] = await Promise.all([
        listarUsuariosAdmin(),
        leerVisitas(),
        // Las últimas 3000 filas bastan para Actividad y para la última
        // actividad de cada persona; antes bajaba la hoja entera.
        leerLogAuditoria(3000),
      ]);
      setUsuarios(us || []);
      setVisitas(vis.datos || []);
      setLog(lg.values || []);
      setLogTotal(lg.total || 0);
    } catch (e) { setError(e.message); }
    setCargando(false);
  }

  function cargarPendientes() {
    setPendError('');
    leerPendientesAdmin().then(setPend).catch(e => setPendError(e.message || 'No se pudo cargar.'));
  }

  async function recargarUsuarios() {
    try { setUsuarios(await listarUsuariosAdmin()); }
    catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
  }

  async function recargarVisitas() {
    const { datos } = await leerVisitas({ forzar: true });
    setVisitas(datos || []);
  }

  const logDesc = useMemoA(() => (log || []).slice(1).reverse(), [log]);

  // Bandeja: mismo filtro de la vieja pestaña Vigilancia (SUSPENSION = SI y
  // orden real), repartido en tres grupos. El conteo de «por generar» viaja
  // al control segmentado, así que se calcula aquí.
  const vig = useMemoA(() => {
    const susp = (visitas || []).filter(d => {
      const s = (d['SUSPENSION DE LA OBRA'] || '').toString().trim().toUpperCase();
      const orden = (d['N ORDEN DE POLICIA'] || d['N° ORDEN DE POLICIA'] || '').toString().trim();
      return s === 'SI' && orden;
    });
    // localeCompare sobre DD/MM/YYYY ordena por día primero; timestamp para
    // que "02/02/2026" > "10/01/2026" como debe ser.
    const ts = (val) => { const d = parsearFecha(val); return d ? d.getTime() : 0; };
    susp.sort((a, b) => ts(b['FECHA DE VISITA']) - ts(a['FECHA DE VISITA']));
    return {
      porGenerar: susp.filter(f => !f['LINK_SOLICITUD_VIGILANCIA']),
      faltaOrden: susp.filter(f => f['LINK_SOLICITUD_VIGILANCIA'] && !f['LINK_SOLICITUD_PDF']),
      listos:     susp.filter(f => f['LINK_SOLICITUD_PDF']),
    };
  }, [visitas]);

  const nPorGenerar = vig.porGenerar.length;
  const nBandeja = nPorGenerar + (pend ? pend.hallazgos.length : 0);

  if (usuario.rol !== 'ADMIN') {
    return <div className="card" style={{ margin: 16 }}>Acceso restringido.</div>;
  }

  return (
    <div className={'pantalla activa pad-bottom' + (conPanel && tab === 'equipo' ? ' adm-pantalla' : '')}>
      <div className="titulo-fijo adm-cab">
        <div className="page-title">Administración</div>
        <div className="adm-tabs" role="tablist" aria-label="Secciones de administración">
          {[
            { k: 'bandeja',   l: <span>Bandeja{nBandeja > 0 && <span className="adm-tab-n">{nBandeja}</span>}</span> },
            { k: 'equipo',    l: 'Equipo' },
            { k: 'actividad', l: 'Actividad' },
          ].map(t => (
            <button key={t.k} role="tab" aria-selected={tab === t.k}
              className={'adm-tab' + (tab === t.k ? ' activo' : '')}
              onClick={() => setTab(t.k)}>{t.l}</button>
          ))}
        </div>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--rojo)', fontSize: 13, marginBottom: 12 }}>
          {error} &middot;{' '}
          <button onClick={cargar} style={{
            background: 'none', border: 'none', color: 'var(--brand-accent)',
            cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit',
          }}>Reintentar</button>
        </div>
      )}
      {cargando && <div className="cargando"><div className="spinner"></div>Cargando…</div>}

      {!cargando && !error && (
        tab === 'bandeja'    ? <TabBandeja vig={vig} logDesc={logDesc} recargarVisitas={recargarVisitas}
          pend={pend} pendError={pendError} onReintentarPend={cargarPendientes}
          onQuitarHallazgo={(fh) => setPend(p => p && Object.assign({}, p, {
            hallazgos: p.hallazgos.filter(h => h._filaHoja !== fh) }))} /> :
        tab === 'actividad'  ? <TabActividad log={log} total={logTotal} /> :
        <TabEquipo usuarios={usuarios} datos={visitas} logDesc={logDesc} conPanel={conPanel}
          yo={usuario.usuario} onAbrirReglas={onAbrirReglasAgenda} onNavegar={onNavegar}
          recargarUsuarios={recargarUsuarios} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Bandeja — oficios de vigilancia por grupo + guardados bloqueados
// ═══════════════════════════════════════════════════════════════
function TabBandeja({ vig, logDesc, recargarVisitas, pend, pendError, onReintentarPend, onQuitarHallazgo }) {
  const [busyFila, setBusyFila] = useStateA(null);
  const [listosAbierto, setListosAbierto] = useStateA(false);
  const [busyHall, setBusyHall] = useStateA(null);   // _filaHoja del hallazgo que se marca
  const [abiertos, setAbiertos] = useStateA({});     // textos desplegados, por clave

  const bloqueadas = useMemoA(() => {
    const desde = Date.now() - 7 * 86400000;
    return (logDesc || []).filter(f => {
      const a = String(f[2] || '');
      // Solo BLOQUEADO (incluye «DUPLICADO bloqueado»). «DUPLICADO ignorado» es
      // el formulario de PQR enviado dos veces, no un guardado bloqueado.
      if (!/bloqueado/i.test(a)) return false;
      const d = parsearFechaHora(f[0]);
      return !!d && d.getTime() >= desde;
    });
  }, [logDesc]);

  // Copia sin cambios de la función generar de la vieja TabVigilancia:
  // payload, armarSolicitudUnificada y apertura del Doc.
  async function generar(f) {
    const idCarpeta = extraerIdCarpetaDrive(f['LINK_DRIVE'] || f[55] || '');
    if (!idCarpeta) { await appAlert('La visita no tiene carpeta de Drive asociada.', { tono: 'aviso', titulo: 'Sin carpeta' }); return; }
    setBusyFila(f._idx);
    try {
      const r = await generarSolicitudVigilancia({
        fila:             f._idx,
        idCarpetaVisita:  idCarpeta,
        radicado:         f['RADICADO'] || '',
        radicadoConocido: f['RADICADO'] || '',
        // Date serializada a ISO rompía el nombre del archivo → DD/MM/YYYY.
        fechaVisita:      formatearFecha(f['FECHA DE VISITA']) || '',
        nOrdenPolicia:    f['N ORDEN DE POLICIA'] || f['N° ORDEN DE POLICIA'] || '',
        direccion:        f['DIRECCION INFRACCION'] || f['DIRECCION'] || '',
        barrio:           f['BARRIO/VEREDA'] || f['BARRIO'] || '',
      });
      // Si la orden ya está escaneada, se arma de una vez el PDF único que se
      // envía a la policía (solicitud + orden). Si no, lo hará el escáner.
      if (r.ok) await armarSolicitudUnificada(f._idx, idCarpeta, f['RADICADO'] || '');
      await recargarVisitas();
      if (r.linkDoc) window.open(r.linkDoc, '_blank', 'noopener,noreferrer');
    } catch (e) {
      await appAlert('Error generando solicitud: ' + e.message, { tono: 'error', titulo: 'Error' });
    }
    setBusyFila(null);
  }

  const totalVig = vig.porGenerar.length + vig.faltaOrden.length + vig.listos.length;
  const hallazgos  = (pend && pend.hallazgos) || [];
  const rechazados = (pend && pend.informesRechazados) || [];
  const alternar = (k) => setAbiertos(a => Object.assign({}, a, { [k]: !a[k] }));
  // El backend une las listas con ' | ' al guardarlas en la hoja.
  const partes = (t) => String(t || '').split(' | ').map(x => x.trim()).filter(Boolean);

  async function marcar(h, estado) {
    if (busyHall != null) return;
    setBusyHall(h._filaHoja);
    try {
      await marcarHallazgoRevisado(h._filaHoja, h.RADICADO, estado);
      onQuitarHallazgo(h._filaHoja);
    } catch (e) {
      await appAlert(e.message, { tono: 'error', titulo: 'No se pudo marcar el hallazgo' });
    }
    setBusyHall(null);
  }

  // Texto largo recortado a 3 líneas con «Ver más».
  const textoLargo = (k, texto) => (
    <>
      <p className={'adm-pend-txt' + (abiertos[k] ? ' abierto' : '')}>{texto || '—'}</p>
      {String(texto || '').length > 180 && (
        <button type="button" className="adm-enlace" aria-expanded={!!abiertos[k]} onClick={() => alternar(k)}>
          {abiertos[k] ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </>
  );
  // Bloque plegado con lo que generó la IA (listas unidas por ' | ').
  const plegado = (k, rotulo, bloques) => {
    const llenos = bloques.filter(b => b[1]);
    if (!llenos.length) return null;
    return (
      <>
        <button type="button" className="adm-enlace" aria-expanded={!!abiertos[k]} onClick={() => alternar(k)}>{rotulo}</button>
        {abiertos[k] && (
          <div className="adm-pend-ia">
            {llenos.map(b => (
              <React.Fragment key={b[0]}>
                <b>{b[0]}</b>
                {b[2] ? <ul>{partes(b[1]).map((x, i) => <li key={i}>{x}</li>)}</ul> : <p>{b[1]}</p>}
              </React.Fragment>
            ))}
          </div>
        )}
      </>
    );
  };
  const item = (f, boton, conRegenerar) => {
    const busy = busyFila === f._idx;
    return (
      <div key={f._idx} className="adm-b-item">
        <div className="adm-b-txt">
          <span className="vc-rad">{f['RADICADO'] || '—'}</span>
          <div className="adm-b-dir">{f['DIRECCION INFRACCION'] || f['DIRECCION'] || '—'}
            {(f['BARRIO/VEREDA'] || f['BARRIO']) && <span> · {f['BARRIO/VEREDA'] || f['BARRIO']}</span>}</div>
          <div className="adm-b-meta">
            <span className="vc-sep">Orden</span> {f['N ORDEN DE POLICIA'] || f['N° ORDEN DE POLICIA'] || '—'}{' '}
            <span className="vc-sep">·</span> {f['FECHA DE VISITA'] || 'sin fecha'}
          </div>
        </div>
        <div className="adm-b-acc">
          {boton}
          {conRegenerar && (
            <button type="button" className="vc-btn adm-b-re" aria-label="Regenerar oficio de vigilancia"
              onClick={() => generar(f)} disabled={busyFila != null}>
              <Icon.Refresh size={14} />
            </button>
          )}
        </div>
      </div>
    );
  };
  const btnGenerar = (f) => (
    <button type="button" className="vc-btn vc-btn-cta" onClick={() => generar(f)} disabled={busyFila != null}>
      {busyFila === f._idx ? 'Generando…' : 'Generar'}
    </button>
  );

  return (
    <div className="adm-bandeja">
      {totalVig === 0 && bloqueadas.length === 0 && !hallazgos.length && !rechazados.length && !pendError ? (
        <div className="card adm-vacio">
          <b>Nada pendiente</b>
          <span>No hay oficios de vigilancia, hallazgos por revisar, informes rechazados ni guardados bloqueados.</span>
        </div>
      ) : (
        <>
          {totalVig > 0 && (
            <div className="card adm-seccion">
              <div className="card-titulo">Oficios de vigilancia</div>
              {vig.porGenerar.length > 0 && (
                <>
                  <div className="mv-grupo">Por generar<span>{vig.porGenerar.length}</span></div>
                  {vig.porGenerar.map(f => item(f, btnGenerar(f), false))}
                </>
              )}
              {vig.faltaOrden.length > 0 && (
                <>
                  <div className="mv-grupo">Falta la orden escaneada<span>{vig.faltaOrden.length}</span></div>
                  {vig.faltaOrden.map(f => item(f,
                    <a className="vc-btn" href={f['LINK_SOLICITUD_VIGILANCIA']} target="_blank" rel="noopener noreferrer">Abrir oficio</a>,
                    true))}
                </>
              )}
              {vig.listos.length > 0 && (
                <>
                  <button type="button" className="adm-grupo-btn" aria-expanded={listosAbierto}
                    onClick={() => setListosAbierto(v => !v)}>
                    Listos para enviar ({vig.listos.length})
                  </button>
                  {listosAbierto && vig.listos.map(f => item(f,
                    <a className="vc-btn vc-btn-cta" href={f['LINK_SOLICITUD_PDF']} target="_blank" rel="noopener noreferrer">PDF para enviar</a>,
                    true))}
                </>
              )}
            </div>
          )}
          {pendError && (
            <div className="card adm-seccion">
              <div className="card-titulo">Hallazgos e informes rechazados</div>
              <p className="adm-nota">No se pudieron cargar: {pendError}{' '}
                <button type="button" className="adm-enlace" onClick={onReintentarPend}>Reintentar</button></p>
            </div>
          )}
          {hallazgos.length > 0 && (
            <div className="card adm-seccion">
              <div className="card-titulo">Hallazgos por revisar<small>{hallazgos.length}</small></div>
              <p className="adm-nota">Observaciones a las que ningún hallazgo del catálogo aplicó. Revisa si falta uno en CATALOGO_HALLAZGOS.</p>
              {hallazgos.map(h => {
                const k = 'h' + h._filaHoja;
                return (
                  <div key={k} className="adm-pend">
                    <div className="adm-pend-cab">
                      <span className="vc-rad">{h.RADICADO || '—'}</span>
                      <span className="adm-pend-meta">{titleCaseNombre(h.INSPECTOR) || '—'} · {h.FECHA}</span>
                    </div>
                    {textoLargo(k + 'o', h.OBSERVACIONES)}
                    {plegado(k + 'g', 'Ver lo que generó la IA', [
                      ['Conclusiones', h.CONCLUSIONES_GENERADAS, true],
                      ['Recomendaciones', h.RECOMENDACIONES_GENERADAS, true],
                    ])}
                    <div className="adm-pend-acc">
                      <button type="button" className="vc-btn" disabled={busyHall != null}
                        onClick={() => marcar(h, 'DESCARTADO')}>Descartar</button>
                      <button type="button" className="vc-btn vc-btn-cta" disabled={busyHall != null}
                        onClick={() => marcar(h, 'REVISADO')}>{busyHall === h._filaHoja ? 'Guardando…' : 'Revisado'}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {rechazados.length > 0 && (
            <div className="card adm-seccion">
              <div className="card-titulo">Informes rechazados por la verificación<small>últimos 30 días</small></div>
              {rechazados.map(r => {
                const k = 'r' + r._filaHoja;
                return (
                  <div key={k} className="adm-pend">
                    <div className="adm-pend-cab">
                      <span className="vc-rad">{r.RADICADO || '—'}</span>
                      <span className="adm-pend-meta">{titleCaseNombre(r.INSPECTOR) || '—'} · {r.FECHA}</span>
                    </div>
                    <ul className="adm-pend-prob">{partes(r.PROBLEMAS).map((x, i) => <li key={i}>{x}</li>)}</ul>
                    {plegado(k + 'g', 'Ver el texto generado', [
                      ['Antecedentes', r.ANTECEDENTES_GENERADOS, false],
                      ['Conclusiones', r.CONCLUSIONES_GENERADAS, true],
                      ['Recomendaciones', r.RECOMENDACIONES_GENERADAS, true],
                    ])}
                  </div>
                );
              })}
            </div>
          )}
          {bloqueadas.length > 0 && (
            <div className="card adm-seccion">
              <div className="card-titulo">Guardados bloqueados<small>últimos 7 días</small></div>
              {bloqueadas.map((f, i) => (
                <div key={i} className="adm-log-fila seg">
                  <div className="adm-log-acc">{f[2]}</div>
                  <div className="adm-log-meta">
                    {titleCaseNombre(f[1]) || 'Sistema'} · {formatearFechaHora(f[0])}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Equipo — tarjetas de carga + panel de la persona
// ═══════════════════════════════════════════════════════════════
// «hace 2 h» / «ayer» / «hace 9 días»: días de calendario, que es lo que se
// promete en pantalla. `dias` alimenta el aviso de inactividad (> 7).
function _actividadRelativa(d, hoy) {
  if (!d) return { texto: 'sin actividad', dias: null };
  const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(hoy) - dia(d)) / 86400000);
  if (dias <= 0) {
    const h = Math.floor((hoy.getTime() - d.getTime()) / 3600000);
    return { texto: h < 1 ? 'hace instantes' : 'hace ' + h + ' h', dias: 0 };
  }
  if (dias === 1) return { texto: 'ayer', dias: 1 };
  return { texto: 'hace ' + dias + ' días', dias: dias };
}

function TabEquipo({ usuarios, datos, logDesc, conPanel, yo, onAbrirReglas, onNavegar, recargarUsuarios }) {
  const [sel, setSel]           = useStateA(null); // nombre de la persona elegida
  const [verInactivos, setVerInactivos] = useStateA(false);
  const hoy = useMemoA(() => new Date(), []);

  const cargas = useMemoA(() => {
    const m = {};
    (usuarios || []).forEach(u => {
      m[u.nombre] = {
        carga: cargaUsuario(datos, u.nombre, hoy),
        act: _actividadRelativa(ultimaActividad(datos, logDesc, u.nombre), hoy),
      };
    });
    return m;
  }, [usuarios, datos, logDesc, hoy]);

  const porDemora = (a, b) => {
    const ca = cargas[a.nombre] || { carga: {} }, cb = cargas[b.nombre] || { carga: {} };
    const da = ca.carga.demoradas || 0, db = cb.carga.demoradas || 0;
    if (db !== da) return db - da;
    const ta = (ca.carga.hacer || 0) + (ca.carga.curso || 0);
    const tb = (cb.carga.hacer || 0) + (cb.carga.curso || 0);
    if (tb !== ta) return tb - ta;
    return String(a.nombre).localeCompare(String(b.nombre), 'es');
  };

  const activos = (usuarios || []).filter(u => u.activo);
  const grupos = [
    { k: 'inspector', rotulo: 'Inspectores',   lista: activos.filter(u => u.rol === 'INSPECTOR').sort(porDemora) },
    { k: 'admin',     rotulo: 'Administración', lista: activos.filter(u => u.rol === 'ADMIN').sort(porDemora) },
    { k: 'sup',       rotulo: 'Supervisión',    lista: activos.filter(u => u.rol === 'SUPERVISOR').sort(porDemora) },
  ].filter(g => g.lista.length);
  const inactivos = (usuarios || []).filter(u => !u.activo).sort(porDemora);
  const plana = grupos.reduce((a, g) => a.concat(g.lista), []);

  // Con panel, siempre hay alguien elegido (la primera tarjeta); sin panel,
  // solo después de tocar una («‹ Equipo» vuelve a la lista).
  const elegido = conPanel
    ? ((sel && (usuarios || []).find(u => u.nombre === sel)) || plana[0] || null)
    : ((sel && (usuarios || []).find(u => u.nombre === sel)) || null);

  const tarjeta = (u) => (
    <TarjetaPersona key={u.fila} u={u} info={cargas[u.nombre]} elegida={elegido === u} onElegir={() => setSel(u.nombre)} />
  );

  return (
    <div className="adm-2col">
      {/* En móvil, con una persona elegida el panel reemplaza a la lista. */}
      {(!elegido || conPanel) && (
      <div className="adm-lista">
        {grupos.map(g => (
          <React.Fragment key={g.k}>
            <div className="mv-grupo">{g.rotulo}<span>{g.lista.length}</span></div>
            {g.lista.map(tarjeta)}
          </React.Fragment>
        ))}
        {inactivos.length > 0 && (
          <>
            <button type="button" className="adm-grupo-btn" aria-expanded={verInactivos}
              onClick={() => setVerInactivos(v => !v)}>Inactivos ({inactivos.length})</button>
            {verInactivos && inactivos.map(tarjeta)}
          </>
        )}
        {!plana.length && !inactivos.length && (
          <div className="card adm-vacio"><b>Sin usuarios</b><span>No hay personas en USUARIOS.</span></div>
        )}
      </div>
      )}

      {elegido && (conPanel ? (
        <PanelPersona u={elegido} info={cargas[elegido.nombre]} logDesc={logDesc} conPanel={conPanel}
          yo={yo} onAbrirReglas={onAbrirReglas} onNavegar={onNavegar} recargarUsuarios={recargarUsuarios} />
      ) : (
        <div className="adm-panel-movil">
          <button type="button" className="adm-volver" onClick={() => setSel(null)}
            aria-label="Volver a la lista de Equipo"><Icon.ArrowLeft size={16} /> Equipo</button>
          <PanelPersona u={elegido} info={cargas[elegido.nombre]} logDesc={logDesc} conPanel={conPanel}
            yo={yo} onAbrirReglas={onAbrirReglas} onNavegar={onNavegar} recargarUsuarios={recargarUsuarios} />
        </div>
      ))}
    </div>
  );
}

function TarjetaPersona({ u, info, elegida, onElegir }) {
  const c = (info && info.carga) || { hacer: 0, curso: 0, demoradas: 0, demoradasHacer: 0, demoradasCurso: 0 };
  const act = (info && info.act) || { texto: 'sin actividad', dias: null };
  const abiertas = c.hacer + c.curso;
  // Barra: por hacer sin demora / en curso sin demora / demoradas. El texto
  // de abajo dice lo mismo con los totales — el color solo no basta.
  const segs = abiertas > 0 ? [
    ['amarillo', Math.max(0, c.hacer - c.demoradasHacer)],
    ['azul',     Math.max(0, c.curso - c.demoradasCurso)],
    ['rojo',     c.demoradas],
  ].filter(s => s[1] > 0) : [];
  const txt = abiertas > 0
    ? [c.hacer > 0 && c.hacer + ' por hacer',
       c.curso > 0 && c.curso + ' en curso',
       c.demoradas > 0 && c.demoradas + ' con +' + DIAS_DEMORA_ADMIN + ' días',
      ].filter(Boolean).join(' · ')
    : 'Sin visitas abiertas';
  // Aviso de inactividad: persona activa, inspectora y más de 7 días.
  const aviso = u.activo && u.rol === 'INSPECTOR' && act.dias != null && act.dias > 7;

  return (
    <div className={'adm-tarjeta' + (elegida ? ' sel' : '')} onClick={onElegir}
      role="button" tabIndex={0} aria-current={elegida ? 'true' : undefined}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onElegir(); } }}>
      <div className="adm-t-top">
        <span className="adm-t-nombre">{titleCaseNombre(u.nombre)}</span>
        <span className={'adm-t-act' + (aviso ? ' aviso' : '')}>{act.texto}</span>
      </div>
      {segs.length > 0 && (
        <div className="adm-t-barra" aria-hidden="true">
          {segs.map(s => <span key={s[0]} className={'adm-t-seg ' + s[0]} style={{ flexGrow: s[1] }} />)}
        </div>
      )}
      <div className="adm-t-txt">{txt}</div>
    </div>
  );
}

const _ROL_ADM = { ADMIN: 'Administrador', SUPERVISOR: 'Supervisor', INSPECTOR: 'Inspector' };

// Abre Buscar con el filtro de visitador de esa persona. Mismo mecanismo que
// _irBuscarConEstados de home.jsx: Buscar restaura sus filtros de
// sessionStorage al montar, así que se le deja escrito lo que debe traer.
function _irBuscarConVisitador(nombre, onNavegar) {
  try {
    sessionStorage.setItem('cu_buscar_v1',
      JSON.stringify({ filtrosVisitador: [String(nombre || '').trim().toUpperCase()] }));
  } catch (e) {}
  onNavegar('buscar');
}

function PanelPersona({ u, info, logDesc, conPanel, yo, onAbrirReglas, onNavegar, recargarUsuarios }) {
  const cajaRef = useRefA(null);
  const [cfg, setCfg] = useStateA(undefined); // undefined cargando · null falló (la fila no aparece)
  const [busy, setBusy] = useStateA(false);
  // PIN temporal recién generado: se muestra una sola vez y nunca se guarda
  // (ni localStorage, ni log, ni consola). Se borra al cambiar de persona.
  const [pinNuevo, setPinNuevo] = useStateA(null);   // {pin, vence}
  const [busyPin, setBusyPin]   = useStateA(false);
  const [busyRol, setBusyRol]   = useStateA(false);
  const c = (info && info.carga) || { hacer: 0, curso: 0, demoradas: 0, completadasMes: 0, completadasMesAnterior: 0, masDemoradas: [], futuras: 0 };

  useEffectA(() => {
    let vivo = true;
    leerConfigAgenda().then(cf => { if (vivo) setCfg(cf); }).catch(() => { if (vivo) setCfg(null); });
    return () => { vivo = false; };
  }, []);
  // Otra persona: el panel vuelve arriba.
  useEffectA(() => { if (cajaRef.current) cajaRef.current.scrollTop = 0; setPinNuevo(null); }, [u.fila]);

  async function togglear() {
    if (busy) return;
    const nombre = titleCaseNombre(u.nombre);
    if (u.activo) {
      // Visitas abiertas contando las asignadas a futuro: mientras esté
      // inactivo nadie las verá en Mis visitas.
      const n = c.hacer + c.curso + c.futuras;
      const extra = n > 0
        ? `\n\nTiene ${n} visitas abiertas (${c.hacer} por hacer, ${c.curso} en curso). ` +
          'Mientras esté inactivo nadie las verá en Mis visitas: reasígnalas desde Buscar.'
        : '';
      if (!(await appConfirm(`¿Desactivar a ${nombre}?${extra}`, {
        titulo: 'Desactivar usuario', btnOk: 'Desactivar', peligro: true }))) return;
    } else {
      if (!(await appConfirm(`¿Activar a ${nombre}?`, {
        titulo: 'Activar usuario', btnOk: 'Activar' }))) return;
    }
    setBusy(true);
    try {
      await toggleActivo(u.fila, u.activo ? 'NO' : 'SI');
      await recargarUsuarios();
    } catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
    setBusy(false);
  }

  // La persona que usa la app: ni su rol ni su PIN temporal se tocan desde
  // aquí (para su PIN está «Cambiar mi PIN» de la cabecera).
  const esYo = String(u.nombre || '').trim().toUpperCase() === String(yo || '').trim().toUpperCase();
  const estadoPin = !u.conPin ? { texto: 'Sin PIN: no entra a la app', tono: '' }
    : u.pinTemporalVencido ? { texto: 'PIN temporal vencido', tono: 'demora' }
    : u.pinTemporalVence ? { texto: 'PIN temporal pendiente · vence ' + u.pinTemporalVence, tono: 'aviso' }
    : { texto: 'PIN propio', tono: '' };

  async function generarPin() {
    if (busyPin) return;
    const nombre = titleCaseNombre(u.nombre);
    if (!(await appConfirm(`Se genera un PIN temporal para ${nombre}. Su PIN actual deja de funcionar y se ` +
      'cierran sus sesiones abiertas. Vale 72 horas; al entrar tendrá que elegir el suyo.', {
      titulo: 'Generar PIN temporal', btnOk: 'Generar', peligro: true }))) return;
    setBusyPin(true);
    try {
      const r = await generarPinTemporal(u.fila, u.nombre);
      setPinNuevo({ pin: r.pin, vence: r.vence });
      recargarUsuarios();
    } catch (e) { await appAlert(e.message, { tono: 'error', titulo: 'No se generó el PIN' }); }
    setBusyPin(false);
  }

  async function elegirRol(nuevo) {
    if (busyRol || esYo || nuevo === u.rol) return;
    if (!(await appConfirm(`¿Cambiar el rol de ${titleCaseNombre(u.nombre)} de ${_ROL_ADM[u.rol] || u.rol} a ` +
      `${_ROL_ADM[nuevo]}? Los permisos cambian de inmediato; lo que ve en pantalla, cuando vuelva a iniciar sesión.`, {
      titulo: 'Cambiar rol', btnOk: 'Cambiar' }))) return;
    setBusyRol(true);
    try {
      await cambiarRol(u.fila, u.nombre, nuevo);
      await recargarUsuarios();
    } catch (e) { await appAlert(e.message, { tono: 'error', titulo: 'No se cambió el rol' }); }
    setBusyRol(false);
  }

  const iniciales = String(u.nombre || '').trim().split(/\s+/).slice(0, 2)
    .map(t => t.charAt(0).toUpperCase()).join('');
  const hoy = new Date();
  const mesActual = _MESES_ES[hoy.getMonth()];
  const mesAnterior = _MESES_ES[hoy.getMonth() === 0 ? 11 : hoy.getMonth() - 1];
  const recibeAgenda = cfg && (cfg.inspectoresAgenda || []).some(k => _casa(u.nombre, k));
  const suLog = (logDesc || []).filter(f => String(f[1] || '').trim().toUpperCase() === String(u.nombre || '').trim().toUpperCase()).slice(0, 5);

  return (
    <section className="adm-panel" ref={cajaRef} aria-label={'Detalle de ' + titleCaseNombre(u.nombre)}>
      <div className="adm-p-cab">
        <span className="adm-iniciales" aria-hidden="true">{iniciales}</span>
        <div className="adm-p-id">
          <div className="adm-p-nombre">{String(u.nombre || '').toLowerCase()}</div>
          <div className="adm-p-sub">
            {u.cargo && <span>{u.cargo}</span>}
            <span className="adm-p-estado">
              <span className={'ent-dot ' + (u.activo ? 'ed-ok' : 'ed-error')} aria-hidden="true" />
              {u.activo ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>
      </div>

      {/* Rol: el backend no deja cambiar el propio (así siempre queda un admin). */}
      <div className="adm-bloque">
        <div className="adm-rol" role="radiogroup" aria-label={'Rol de ' + titleCaseNombre(u.nombre)}>
          {['ADMIN', 'SUPERVISOR', 'INSPECTOR'].map(r => (
            <button key={r} type="button" role="radio" aria-checked={u.rol === r}
              className={'adm-rol-op' + (u.rol === r ? ' activo' : '')}
              disabled={esYo || busyRol} onClick={() => elegirRol(r)}>{_ROL_ADM[r]}</button>
          ))}
        </div>
        {esYo && <div className="adm-nota">No puedes cambiar tu propio rol.</div>}
      </div>

      <div className="adm-cifras">
        <div className="adm-cifra"><b>{c.hacer}</b><span>Asignadas</span></div>
        <div className="adm-cifra"><b>{c.curso}</b><span>Iniciadas</span>
          {c.demoradas > 0 && <small>{c.demoradas} con +{DIAS_DEMORA_ADMIN} días</small>}</div>
        <div className="adm-cifra"><b>{c.completadasMes}</b><span>Completadas en {mesActual}</span></div>
        <div className="adm-cifra"><b>{c.completadasMesAnterior}</b><span>Completadas en {mesAnterior}</span></div>
      </div>

      {/* La lista «Más demoradas» se quitó (E4a): repetía las Alertas de
          Inicio filtradas por inspector. El detalle vivo está en Buscar. */}
      {onNavegar && (
        <button type="button" className="adm-ver-visitas"
          onClick={() => _irBuscarConVisitador(u.nombre, onNavegar)}>Ver sus visitas en Buscar</button>
      )}

      {cfg && (
        <div className="adm-bloque adm-fila-dato">
          <span>Recibe visitas de la agenda</span>
          <b>{recibeAgenda ? 'Sí' : 'No'}</b>
          <button type="button" className="adm-enlace" onClick={onAbrirReglas}>Cambiar en reglas de agenda</button>
        </div>
      )}

      <div className="adm-bloque adm-fila-dato">
        <span>PIN de acceso</span>
        <b className={estadoPin.tono}>{estadoPin.texto}</b>
        {u.activo && !esYo && (
          <button type="button" className="vc-btn" disabled={busyPin} onClick={generarPin}>
            {busyPin ? 'Generando…' : 'Generar PIN temporal'}
          </button>
        )}
      </div>
      {pinNuevo && (
        <div className="adm-pin-tmp" role="status">
          <div className="adm-pin-dig" aria-label={'PIN temporal ' + pinNuevo.pin.split('').join(' ')}>
            {pinNuevo.pin.split('').map((d, i) => <span key={i} aria-hidden="true">{d}</span>)}
          </div>
          <p>Díctaselo a {titleCaseNombre(u.nombre)}. No se vuelve a mostrar.</p>
          <p className="adm-nota">Vence {pinNuevo.vence}. Al entrar tendrá que elegir el suyo.</p>
          <button type="button" className="vc-btn" onClick={() => setPinNuevo(null)}>Listo</button>
        </div>
      )}

      {suLog.length > 0 && (
        <div className="adm-bloque">
          <h3 className="mv-sub">Actividad reciente</h3>
          {suLog.map((f, i) => (
            <div key={i} className="adm-log-fila">
              <div className="adm-log-acc">{f[2]}</div>
              <div className="adm-log-meta">{formatearFechaHora(f[0])}</div>
            </div>
          ))}
        </div>
      )}

      {/* Uno mismo no se desactiva: el backend lo rechaza (quedaría sin admin). */}
      {!esYo && (
        <div className="adm-bloque adm-peligro">
          <button type="button" className={'adm-btn-texto ' + (u.activo ? 'rojo' : 'verde')} disabled={busy}
            onClick={togglear}>
            {busy ? '…' : (u.activo ? 'Desactivar…' : 'Activar')}
          </button>
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Actividad — log de auditoría con filtros y búsqueda
// ═══════════════════════════════════════════════════════════════
function TabActividad({ log, total }) {
  const [filtro, setFiltro] = useStateA('');
  const [q, setQ] = useStateA('');
  const [limite, setLimite] = useStateA(200);

  const filas = useMemoA(() => (log || []).slice(1).reverse(), [log]); // más nueva primero
  const _norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const qn = _norm(q.trim());
  const cat = (f) => categoriaLog(f[1], f[2]);

  const conteo = useMemoA(() => {
    const c = { '': filas.length, accesos: 0, visitas: 0, seguridad: 0, sistema: 0, otros: 0 };
    filas.forEach(f => { c[cat(f)]++; });
    return c;
  }, [filas]);

  const filtradas = filas.filter(f =>
    (!filtro || cat(f) === filtro) &&
    (!qn || _norm(f[2]).indexOf(qn) !== -1 || _norm(f[1]).indexOf(qn) !== -1));
  const visibles = filtradas.slice(0, limite);

  // Rótulo de día: «Hoy», «Ayer» o dd/mm/aaaa.
  const hoy = useMemoA(() => new Date(), []);
  const diaDe = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const HOY_MS = diaDe(hoy), AYER_MS = HOY_MS - 86400000;
  const hhmm = (d) => d ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '';

  const dias = [];
  visibles.forEach(f => {
    const d = parsearFechaHora(f[0]);
    const k = d ? diaDe(d) : 'sin-fecha';
    let g = dias[dias.length - 1];
    if (!g || g.k !== k) {
      g = { k, rotulo: !d ? 'Sin fecha' : (k === HOY_MS ? 'Hoy' : k === AYER_MS ? 'Ayer' : formatearFecha(d)), items: [] };
      dias.push(g);
    }
    g.items.push({ f, d });
  });

  return (
    <div className="adm-actividad">
      <input className="adm-buscar" type="search" value={q} placeholder="Buscar en la acción o el usuario…"
        aria-label="Buscar en la actividad"
        onChange={e => { setQ(e.target.value); setLimite(200); }} />

      <div className="sv-chips adm-chips" role="group" aria-label="Filtrar por categoría">
        {[['', 'Todas'], ['accesos', 'Accesos'], ['visitas', 'Visitas'],
          ['seguridad', 'Seguridad'], ['sistema', 'Sistema'], ['otros', 'Otros'],
        ].filter(cc => conteo[cc[0]] > 0).map(cc => (
          <button key={cc[0]} type="button" aria-pressed={filtro === cc[0]}
            className={'sv-chip' + (filtro === cc[0] ? ' activo' : '')}
            onClick={() => { setFiltro(cc[0]); setLimite(200); }}>{cc[1]} {conteo[cc[0]]}</button>
        ))}
      </div>

      {visibles.length === 0 && <div className="card adm-vacio"><b>Sin registros</b><span>Ninguna fila del log coincide.</span></div>}

      {dias.map(g => (
        <React.Fragment key={g.k}>
          <div className="mv-grupo">{g.rotulo}<span>{g.items.length}</span></div>
          {g.items.map(({ f, d }, i) => (
            <div key={i} className={'adm-log-fila' + (cat(f) === 'seguridad' ? ' seg' : '')}>
              <div className="adm-log-acc">{f[2] || '—'}</div>
              <div className="adm-log-meta">{titleCaseNombre(f[1]) || 'Sistema'}{d ? ' · ' + hhmm(d) : ''}</div>
            </div>
          ))}
        </React.Fragment>
      ))}

      {total > filas.length && (
        <p className="adm-nota adm-log-pie">Se muestran los últimos {filas.length} de {total} registros.</p>
      )}
      {filtradas.length > limite && (
        <button type="button" className="vc-btn adm-mas"
          onClick={() => setLimite(l => l + 200)}>
          Mostrar más <span>({visibles.length} de {filtradas.length})</span>
        </button>
      )}
    </div>
  );
}

window.AdminScreen = AdminScreen;
