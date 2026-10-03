// ═══════════════════════════════════════════════════════════════
// v6/admin.jsx — Pantalla Administración (solo rol ADMIN)
//
// Fase 1 (2026-10-03), solo cliente: Bandeja (vigilancia + guardados
// bloqueados), Equipo (lista de tarjetas + panel de la persona) y Actividad
// (log con filtros). Reset PIN y Reglas de agenda quedan como estaban, tras
// dos botones discretos. La regla vive en utils.js (cargaUsuario,
// ultimaActividad, categoriaLog, parsearFechaHora) y se prueba en
// tests/admin-equipo.test.js; aquí solo se pinta.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA, useRef: useRefA } = React;

// La config de agenda guarda palabras clave («MAURICIO» casa con «Mauricio
// Pérez»). Vivía dentro de TabConfigAgenda; la sube Equipo para saber si una
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
function AdminScreen({ usuario }) {
  const [tab, setTab]         = useStateA('equipo');   // equipo | bandeja | actividad
  const [vista, setVista]     = useStateA('');         // '' | 'pin' | 'agenda'
  const [pinFila, setPinFila] = useStateA(null);       // preselección de TabResetPin
  const [usuarios, setUsuarios] = useStateA([]);
  const [visitas, setVisitas]   = useStateA([]);
  const [log, setLog]           = useStateA([]);
  const [cargando, setCargando] = useStateA(true);
  const [error, setError]       = useStateA('');
  const conPanel = useAnchoPanelAdm();

  useEffectA(() => { cargar(); }, []);
  useEffectA(() => suscribirVisitas(() => {
    leerVisitas().then(r => setVisitas(r.datos || [])).catch(() => {});
  }), []);

  async function cargar() {
    setCargando(true); setError('');
    try {
      const [us, vis, lg] = await Promise.all([
        listarUsuariosAdmin(),
        leerVisitas(),
        leerLogAuditoria(),
      ]);
      setUsuarios(us || []);
      setVisitas(vis.datos || []);
      setLog(lg || []);
    } catch (e) { setError(e.message); }
    setCargando(false);
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

  if (usuario.rol !== 'ADMIN') {
    return <div className="card" style={{ margin: 16 }}>Acceso restringido.</div>;
  }

  const irTab = (k) => { setTab(k); setVista(''); };
  const abrirPin = (fila) => { setPinFila(fila == null ? null : fila); setVista('pin'); };

  return (
    <div className={'pantalla activa pad-bottom' + (conPanel && tab === 'equipo' && !vista ? ' adm-pantalla' : '')}>
      <div className="titulo-fijo adm-cab">
        <div className="page-title">Administración</div>
        <div className="adm-tabs" role="tablist" aria-label="Secciones de administración">
          {[
            { k: 'bandeja',   l: <span>Bandeja{nPorGenerar > 0 && <span className="adm-tab-n">{nPorGenerar}</span>}</span> },
            { k: 'equipo',    l: 'Equipo' },
            { k: 'actividad', l: 'Actividad' },
          ].map(t => (
            <button key={t.k} role="tab" aria-selected={tab === t.k && !vista}
              className={'adm-tab' + (tab === t.k && !vista ? ' activo' : '')}
              onClick={() => irTab(t.k)}>{t.l}</button>
          ))}
        </div>
        <div className="adm-tools">
          <button type="button" className="btn-texto" aria-pressed={vista === 'pin'}
            onClick={() => (vista === 'pin' ? setVista('') : abrirPin(null))}>Reset PIN</button>
          <button type="button" className="btn-texto" aria-pressed={vista === 'agenda'}
            onClick={() => setVista(vista === 'agenda' ? '' : 'agenda')}>Reglas de agenda</button>
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
        vista === 'pin'      ? <TabResetPin filaInicial={pinFila} /> :
        vista === 'agenda'   ? <TabConfigAgenda /> :
        tab === 'bandeja'    ? <TabBandeja vig={vig} logDesc={logDesc} recargarVisitas={recargarVisitas} /> :
        tab === 'actividad'  ? <TabActividad log={log} /> :
        <TabEquipo usuarios={usuarios} datos={visitas} logDesc={logDesc} conPanel={conPanel}
          onAbrirReglas={() => setVista('agenda')} onAbrirPin={abrirPin}
          recargarUsuarios={recargarUsuarios} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Bandeja — oficios de vigilancia por grupo + guardados bloqueados
// ═══════════════════════════════════════════════════════════════
function TabBandeja({ vig, logDesc, recargarVisitas }) {
  const [busyFila, setBusyFila] = useStateA(null);
  const [listosAbierto, setListosAbierto] = useStateA(false);

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
  const item = (f, boton, conRegenerar) => {
    const busy = busyFila === f._idx;
    return (
      <div key={f._idx} className="adm-b-item">
        <div className="adm-b-txt">
          <span className="vc-rad">{f['RADICADO'] || '—'}</span>
          <div className="adm-b-dir">{f['DIRECCION INFRACCION'] || f['DIRECCION'] || '—'}
            {(f['BARRIO/VEREDA'] || f['BARRIO']) && <span> · {f['BARRIO/VEREDA'] || f['BARRIO']}</span>}</div>
          <div className="adm-b-meta">
            <span className="vc-sep">Orden</span> {f['N ORDEN DE POLICIA'] || f['N° ORDEN DE POLICIA'] || '—'}
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
      {totalVig === 0 && bloqueadas.length === 0 ? (
        <div className="card adm-vacio">
          <b>Nada pendiente</b>
          <span>No hay oficios de vigilancia por generar ni guardados bloqueados esta semana.</span>
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

function TabEquipo({ usuarios, datos, logDesc, conPanel, onAbrirReglas, onAbrirPin, recargarUsuarios }) {
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
          onAbrirReglas={onAbrirReglas} onAbrirPin={onAbrirPin} recargarUsuarios={recargarUsuarios} />
      ) : (
        <div className="adm-panel-movil">
          <button type="button" className="adm-volver" onClick={() => setSel(null)}
            aria-label="Volver a la lista de Equipo"><Icon.ArrowLeft size={16} /> Equipo</button>
          <PanelPersona u={elegido} info={cargas[elegido.nombre]} logDesc={logDesc} conPanel={conPanel}
            onAbrirReglas={onAbrirReglas} onAbrirPin={onAbrirPin} recargarUsuarios={recargarUsuarios} />
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

function PanelPersona({ u, info, logDesc, conPanel, onAbrirReglas, onAbrirPin, recargarUsuarios }) {
  const cajaRef = useRefA(null);
  const [cfg, setCfg] = useStateA(undefined); // undefined cargando · null falló (la fila no aparece)
  const [busy, setBusy] = useStateA(false);
  const c = (info && info.carga) || { hacer: 0, curso: 0, demoradas: 0, completadasMes: 0, completadasMesAnterior: 0, masDemoradas: [], futuras: 0 };

  useEffectA(() => {
    let vivo = true;
    leerConfigAgenda().then(cf => { if (vivo) setCfg(cf); }).catch(() => { if (vivo) setCfg(null); });
    return () => { vivo = false; };
  }, []);
  // Otra persona: el panel vuelve arriba.
  useEffectA(() => { if (cajaRef.current) cajaRef.current.scrollTop = 0; }, [u.fila]);

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
            {u.rol && <span className="adm-chip-rol">{_ROL_ADM[u.rol] || u.rol}</span>}
            <span className="adm-p-estado">
              <span className={'ent-dot ' + (u.activo ? 'ed-ok' : 'ed-error')} aria-hidden="true" />
              {u.activo ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>
      </div>

      <div className="adm-cifras">
        <div className="adm-cifra"><b>{c.hacer}</b><span>Por hacer</span></div>
        <div className="adm-cifra"><b>{c.curso}</b><span>En curso</span>
          {c.demoradas > 0 && <small>{c.demoradas} con +{DIAS_DEMORA_ADMIN} días</small>}</div>
        <div className="adm-cifra"><b>{c.completadasMes}</b><span>Completadas en {mesActual}</span></div>
        <div className="adm-cifra"><b>{c.completadasMesAnterior}</b><span>Completadas en {mesAnterior}</span></div>
      </div>

      {c.masDemoradas.length > 0 && (
        <div className="adm-bloque">
          <h3 className="mv-sub">Más demoradas</h3>
          {c.masDemoradas.map(x => (
            <div key={x.f._idx != null ? x.f._idx : x.f['RADICADO']} className="adm-demorada">
              <span className="vc-rad">{x.f['RADICADO'] || '—'}</span>
              <span className="adm-dem-dir">{x.f['DIRECCION INFRACCION'] || x.f['DIRECCION'] || '—'}</span>
              <b className={x.dias != null && x.dias >= DIAS_DEMORA_ADMIN ? 'demora' : ''}>
                {x.dias == null ? 's/f' : x.dias + (x.dias === 1 ? ' día' : ' días')}
              </b>
              <span className="adm-dem-tipo">{x.tipo === 'curso' ? 'En curso' : 'Por hacer'}</span>
            </div>
          ))}
        </div>
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
        <button type="button" className="vc-btn" onClick={() => onAbrirPin(u.fila)}>Restablecer PIN</button>
      </div>

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

      <div className="adm-bloque adm-peligro">
        <button type="button" className={'adm-btn-texto ' + (u.activo ? 'rojo' : 'verde')} disabled={busy}
          onClick={togglear}>
          {busy ? '…' : (u.activo ? 'Desactivar…' : 'Activar')}
        </button>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Actividad — log de auditoría con filtros y búsqueda
// ═══════════════════════════════════════════════════════════════
function TabActividad({ log }) {
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

      {filtradas.length > limite && (
        <button type="button" className="vc-btn adm-mas"
          onClick={() => setLimite(l => l + 200)}>
          Mostrar más <span>({visibles.length} de {filtradas.length})</span>
        </button>
      )}
    </div>
  );
}

function TabResetPin({ filaInicial }) {
  const [usuarios, setUsuarios] = useStateA([]);
  const [sel, setSel]   = useStateA('');
  const [pin, setPin]   = useStateA('');
  const [pin2, setPin2] = useStateA('');
  const [msg, setMsg]   = useStateA(null);
  const [busy, setBusy] = useStateA(false);
  const [error, setError] = useStateA('');

  useEffectA(() => {
    listarUsuariosAdmin().then(list => setUsuarios(list.filter(u => u.activo)))
      .catch(e => setError(e.message));
  }, []);

  // Preselección desde el panel de Equipo («Restablecer PIN»).
  useEffectA(() => {
    if (filaInicial != null) setSel(String(filaInicial));
  }, [filaInicial]);

  async function ejecutar() {
    setMsg(null);
    if (!sel) { setMsg({ t: 'error', m: 'Selecciona un usuario' }); return; }
    if (!/^\d{4}$/.test(pin)) { setMsg({ t: 'error', m: 'PIN debe ser 4 dígitos' }); return; }
    if (pin !== pin2) { setMsg({ t: 'error', m: 'Los dos PIN no coinciden' }); return; }
    const u = usuarios.find(x => x.fila === parseInt(sel, 10));
    const ok = await appConfirm(`¿Resetear el PIN de ${u?.nombre}?`, {
      titulo: 'Resetear PIN', btnOk: 'Resetear', peligro: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await resetPin(parseInt(sel, 10), pin);
      registrarLog(SESSION_V6.leer()?.usuario || '', `PIN reseteado para: ${u?.nombre}`);
      setMsg({ t: 'ok', m: 'PIN actualizado correctamente' });
      setPin('');
      setPin2('');
    } catch (e) { setMsg({ t: 'error', m: e.message }); }
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="card-titulo" style={{ marginBottom: 12 }}>Resetear PIN</div>
      <label htmlFor="admin-reset-pin-usuario" style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>Usuario</label>
      <select id="admin-reset-pin-usuario" value={sel} onChange={e => setSel(e.target.value)} style={{
        width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--borde)',
        background: 'var(--superficie)', fontFamily: 'inherit', fontSize: 14, marginBottom: 12,
      }}>
        <option value="">Selecciona...</option>
        {usuarios.map(u => <option key={u.fila} value={u.fila}>{u.nombre}</option>)}
      </select>
      <label htmlFor="admin-reset-pin-nuevo" style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>Nuevo PIN (4 dígitos)</label>
      <input id="admin-reset-pin-nuevo" type="password" value={pin} maxLength={4} inputMode="numeric"
        onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--borde)',
          background: 'var(--superficie)', fontFamily: 'var(--font-mono)', fontSize: 16, marginBottom: 12,
        }} />
      <label htmlFor="admin-reset-pin-confirmar" style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>Confirmar PIN</label>
      <input id="admin-reset-pin-confirmar" type="password" value={pin2} maxLength={4} inputMode="numeric"
        onChange={e => setPin2(e.target.value.replace(/\D/g, ''))}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--borde)',
          background: 'var(--superficie)', fontFamily: 'var(--font-mono)', fontSize: 16, marginBottom: 12,
        }} />
      <button onClick={ejecutar} disabled={busy} className="btn-principal secundario" style={{ marginTop: 4 }}>
        {busy ? 'Procesando...' : 'Actualizar PIN'}
      </button>
      {error && <div style={{ color: 'var(--rojo)', fontSize: 13, marginTop: 8 }}>Error al cargar usuarios: {error}</div>}
      {msg && (
        <div style={{
          marginTop: 12, padding: 10, borderRadius: 8, fontSize: 13,
          background: msg.t === 'ok' ? 'rgba(107,122,58,0.12)' : 'rgba(168,52,43,0.12)',
          color: msg.t === 'ok' ? 'var(--verde)' : 'var(--rojo)',
        }}>{msg.m}</div>
      )}
    </div>
  );
}

// ── Pestaña Agenda: reglas de la agenda diaria (hoja CONFIG_AGENDA) ───
// Máx. visitas por jornada, reparto de comunas mañana/tarde e inspectores
// habilitados. La validación real vive en el backend (guardarConfigAgenda);
// la UI solo presenta y muestra el error que aquel devuelva.
function TabConfigAgenda() {
  const COMUNAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  const [maxVisitas, setMaxVisitas]     = useStateA(4);
  const [jornadas, setJornadas]         = useStateA({});   // {comuna: 'manana'|'tarde'}
  const [seleccion, setSeleccion]       = useStateA({});   // {nombreUsuario: bool}
  const [inspectores, setInspectores]   = useStateA([]);
  const [cargando, setCargando]         = useStateA(true);
  const [error, setError]               = useStateA('');
  const [busy, setBusy]                 = useStateA(false);
  const [msg, setMsg]                   = useStateA(null);

  useEffectA(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true); setError(''); setMsg(null);
    try {
      const [cfg, lista] = await Promise.all([
        leerConfigAgenda(),
        listarInspectoresActivos({ forzar: true }),
      ]);
      setMaxVisitas(cfg.maxVisitasJornada);
      const j = {};
      COMUNAS.forEach(c => {
        if ((cfg.comunasManana || []).indexOf(c) !== -1) j[c] = 'manana';
        else if ((cfg.comunasTarde || []).indexOf(c) !== -1) j[c] = 'tarde';
      });
      setJornadas(j);
      const activos = lista || [];
      setInspectores(activos);
      const sel = {};
      activos.forEach(i => {
        sel[i.nombre] = (cfg.inspectoresAgenda || []).some(k => _casa(i.nombre, k));
      });
      setSeleccion(sel);
    } catch (e) { setError(e.message); }
    setCargando(false);
  }

  function cambiarJornada(comuna, valor) {
    setJornadas(j => Object.assign({}, j, { [comuna]: valor }));
  }

  function toggleInspector(nombre) {
    setSeleccion(s => Object.assign({}, s, { [nombre]: !s[nombre] }));
  }

  async function guardar() {
    setMsg(null);
    const manana = COMUNAS.filter(c => jornadas[c] === 'manana');
    const tarde  = COMUNAS.filter(c => jornadas[c] === 'tarde');
    const insp   = inspectores.filter(i => seleccion[i.nombre]).map(i => i.nombre);
    if (!manana.length || !tarde.length) {
      setMsg({ t: 'error', m: 'Cada jornada necesita al menos una comuna.' });
      return;
    }
    if (!insp.length) {
      setMsg({ t: 'error', m: 'Marca al menos un inspector habilitado.' });
      return;
    }
    const ok = await appConfirm(
      `Máx. ${maxVisitas} visitas/jornada\n` +
      `Mañana: comunas ${manana.join(', ')}\n` +
      `Tarde: comunas ${tarde.join(', ')}\n` +
      `Inspectores: ${insp.join(', ')}\n\n¿Guardar?`,
      { titulo: 'Guardar reglas de agenda', btnOk: 'Guardar' });
    if (!ok) return;
    setBusy(true);
    try {
      await guardarConfigAgenda({
        maxVisitasJornada: maxVisitas,
        comunasManana: manana,
        comunasTarde: tarde,
        inspectoresAgenda: insp,
      });
      await cargar();
      setMsg({ t: 'ok', m: 'Reglas de agenda actualizadas.' });
    } catch (e) { setMsg({ t: 'error', m: e.message }); }
    setBusy(false);
  }

  const estiloSelect = {
    padding: '6px 8px', borderRadius: 6, border: '1px solid var(--borde)',
    background: 'var(--superficie)', fontFamily: 'inherit', fontSize: 12,
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="card-titulo" style={{ margin: 0 }}>Reglas de la agenda</div>
        <button onClick={cargar} disabled={cargando} style={{
          background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
          padding: '6px 12px', fontFamily: 'inherit', fontSize: 12,
          cursor: cargando ? 'not-allowed' : 'pointer', opacity: cargando ? 0.5 : 1,
        }}>{cargando ? '...' : 'Recargar'}</button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 12 }}>
        Estos valores definen cómo se arma la agenda diaria (hoja CONFIG_AGENDA).
        La zona rural mantiene su jornada fija: primer viernes del mes.
      </div>
      {cargando && <div style={{ padding: 20, textAlign: 'center', color: 'var(--texto-suave)' }}>Cargando...</div>}
      {error && <div style={{ color: 'var(--rojo)', fontSize: 13 }}>Error al cargar configuración: {error}</div>}
      {!cargando && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <label htmlFor="admin-agenda-max" style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>
              Máximo de visitas por jornada (1–10)
            </label>
            <input id="admin-agenda-max" type="number" min={1} max={10} value={maxVisitas}
              onChange={e => {
                const n = parseInt(e.target.value, 10);
                setMaxVisitas(isNaN(n) ? 1 : Math.min(10, Math.max(1, n)));
              }}
              style={{
                width: 90, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--borde)',
                background: 'var(--superficie)', fontFamily: 'var(--font-mono)', fontSize: 15,
              }} />
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 6 }}>Comunas por jornada</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
              {COMUNAS.map(c => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, width: 22 }}>C{c}</span>
                  <select value={jornadas[c] || ''} onChange={e => cambiarJornada(c, e.target.value)} style={estiloSelect}>
                    <option value="manana">Mañana</option>
                    <option value="tarde">Tarde</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 6 }}>
              Inspectores habilitados para recibir visitas de la agenda
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {inspectores.map(i => (
                <label key={i.nombre} style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                  padding: '6px 8px', background: 'var(--gris-bg)', borderRadius: 8, cursor: 'pointer',
                }}>
                  <input type="checkbox" checked={!!seleccion[i.nombre]}
                    onChange={() => toggleInspector(i.nombre)} style={{ accentColor: 'var(--brand-accent)' }} />
                  <span>{i.nombre}</span>
                  {i.cargo && <span style={{ fontSize: 11, color: 'var(--texto-suave)' }}>· {i.cargo}</span>}
                </label>
              ))}
            </div>
          </div>

          <button onClick={guardar} disabled={busy} className="btn-principal secundario">
            {busy ? 'Guardando...' : 'Guardar reglas'}
          </button>
          {msg && (
            <div style={{
              padding: 10, borderRadius: 8, fontSize: 13,
              background: msg.t === 'ok' ? 'rgba(107,122,58,0.12)' : 'rgba(168,52,43,0.12)',
              color: msg.t === 'ok' ? 'var(--verde)' : 'var(--rojo)',
            }}>{msg.m}</div>
          )}
        </div>
      )}
    </div>
  );
}

window.AdminScreen = AdminScreen;
