// ═══════════════════════════════════════════════════════════════
// v6/agenda.jsx — Agenda diaria (ADMIN)
//   POST obtenerAgenda → { dia, fecha, esRural, manana[], tarde[], totalPendientes }
//   Por ítem: completar (calcula días) / asignar visitador individual
//   (BotonesAdminVisita + PanelSeleccionInspector, reusados de visita-card.jsx)
//   Por jornada: "Confirmar agenda" — asigna todas de un click (accion confirmarAgenda)
//   Reemplazos: confirm → appConfirm; alert → appAlert
//   Mutaciones invalidan la caché de visitas para que el resto de la app vea el cambio.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateG, useEffect: useEffectG } = React;

function AgendaScreen({ usuario, onContinuar }) {
  const [data, setData]         = useStateG(null);
  const [tab, setTab]           = useStateG('manana');
  const [cargando, setCargando] = useStateG(true);
  const [error, setError]       = useStateG('');
  const [busyFila, setBusyFila] = useStateG(null);

  // ── Asignación de visitador (individual + bulk por jornada) ──
  // inspectores: lista activa desde USUARIOS (mismo endpoint que Buscar).
  // asignandoFila: fila con el panel de "Asignar a:" abierto.
  // inspectorSel: chip elegido por jornada para "Confirmar agenda".
  const [inspectores, setInspectores]   = useStateG([]);
  const [asignandoFila, setAsignandoFila] = useStateG(null);
  const [inspectorSel, setInspectorSel] = useStateG({ manana: '', tarde: '' });
  const [confirmando, setConfirmando]   = useStateG(false);

  useEffectG(() => { cargar(); }, []);

  useEffectG(() => {
    if (usuario.rol !== 'ADMIN') return;
    listarInspectoresActivos().then(lista => setInspectores(lista || [])).catch(() => {});
  }, [usuario.rol]);

  if (usuario.rol !== 'ADMIN') {
    return <div className="card" style={{ margin: 16 }}>Acceso restringido (solo ADMIN).</div>;
  }

  async function cargar() {
    setCargando(true); setError('');
    try {
      const d = await gasPost({ accion: 'obtenerAgenda' });
      setData(d);
    } catch (e) { setError(e.message); }
    setCargando(false);
  }

  // hoyDDMMAAAA() y diasDesde() viven en utils.js. Las copias locales que
  // había aquí no solo duplicaban código: _calcularDias() usaba Math.ceil
  // sobre milisegundos crudos y buscar.jsx usa diasDesde() (días de
  // calendario), así que la misma columna DIAS se escribía con dos criterios
  // distintos según desde dónde se completara la visita.

  async function completar(item) {
    // Paridad con buscar.jsx: SUSPENSION=SI + orden de policía + sin oficio
    // generado aún → ofrecer generarlo antes de completar.
    if (item.requiereVigilancia) {
      const generar = await appConfirm(
        'Esta visita tiene orden de suspensión preventiva y aún no se ha generado el oficio de Vigilancia Policía.\n\n¿Generar el oficio antes de completar?',
        { tono: 'aviso', titulo: 'Solicitud de vigilancia pendiente', btnOk: 'Generar oficio', btnCancel: 'Completar sin oficio' }
      );
      if (generar) {
        setBusyFila(item.fila);
        try {
          const idCarpeta = extraerIdCarpetaDrive(item.linkDrive || '');
          if (!idCarpeta) {
            await appAlert('La visita no tiene carpeta de Drive asociada.', { tono: 'aviso', titulo: 'Sin carpeta' });
            setBusyFila(null);
            return;
          }
          await generarSolicitudVigilancia({
            fila: item.fila,
            idCarpetaVisita: idCarpeta,
            radicado:      item.radicado || '',
            fechaVisita:   item.fechaVisita || '',
            nOrdenPolicia: item.ordenPolicia || '',
            direccion:     item.direccion || '',
            barrio:        item.barrio || '',
          });
        } catch (e) {
          await appAlert('Error generando oficio: ' + e.message + '\n\nLa visita NO se marcó como completada.', { tono: 'error', titulo: 'Error' });
          setBusyFila(null);
          return;
        }
        setBusyFila(null);
      }
    }

    // Todos los ítems de la Agenda están en PENDIENTE (ESTADOS_AGENDA en el
    // backend), así que completar desde aquí cierra una visita que nunca se
    // diligenció: no habrá acta, informe ni fotos. Se avisa explícitamente en
    // vez de esconderlo tras un "¿Marcar como COMPLETADO?" genérico.
    const ok = await appConfirm(
      'Esta visita está PENDIENTE y se cerrará sin diligenciar: no tendrá acta, informe ni fotos.\n\n' +
      'Si la visita se hizo, use "Iniciar visita" y complete el formulario.\n\n¿Cerrarla de todos modos?',
      { titulo: 'Completar sin diligenciar', btnOk: 'Cerrar visita', peligro: true });
    if (!ok) return;
    setBusyFila(item.fila);
    try {
      await gasPost({
        accion: 'completarRegistro',
        fila: item.fila,
        dias: item.fechaAsignacion ? diasDesde(item.fechaAsignacion) : '',
        fecha: hoyDDMMAAAA(),
      });
      invalidarCache('visitas');
      await cargar();
    } catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
    setBusyFila(null);
  }

  // Abrir la visita en el formulario. Los ítems de la Agenda son objetos
  // sintéticos (radicado/direccion/score), no filas de BD, así que hay que
  // resolver la fila real antes de entregarla a NuevaVisitaScreen — si no,
  // el formulario abriría en blanco.
  async function abrirVisita(item) {
    if (!onContinuar) return;
    setBusyFila(item.fila);
    try {
      const { datos } = await leerVisitas();
      const fila = datos.find(f => f._idx === item.fila) || null;
      if (!fila) throw new Error('No se encontró la visita en BD VISITAS.');
      onContinuar(item.fila, fila);
    } catch (e) {
      await appAlert('No se pudo abrir la visita: ' + e.message, { tono: 'error', titulo: 'Error' });
    }
    setBusyFila(null);
  }

  // Asignación individual — misma acción que usa Buscar (asignarRadicado).
  // Como todo ítem de la Agenda ya viene en PENDIENTE, esto es lo único que
  // BotonesAdminVisita puede ofrecer aquí (nunca "Desasignar").
  async function adminAsignar(fila, inspector) {
    setBusyFila(fila);
    try {
      await gasPost({
        accion: 'asignarRadicado', fila, inspector,
        fechaAsignacion: hoyDDMMAAAA(),
      });
      invalidarCache('visitas');
      setAsignandoFila(null);
      await cargar();
    } catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
    setBusyFila(null);
  }

  // Confirmar jornada completa: asigna de un solo click todas las visitas
  // visibles de la jornada al inspector elegido (accion 'confirmarAgenda',
  // ya existente en el backend pero nunca cableada hasta ahora).
  async function confirmarJornada(jornadaKey, items) {
    const inspector = inspectorSel[jornadaKey];
    if (!inspector || !items.length) return;
    const label = jornadaKey === 'manana' ? 'mañana' : 'tarde';
    const ok = await appConfirm(
      `¿Confirmar ${items.length} visita(s) de la jornada de la ${label} y asignarlas a ${inspector}?`,
      { tono: 'info', titulo: 'Confirmar agenda', btnOk: 'Confirmar' }
    );
    if (!ok) return;
    setConfirmando(true);
    try {
      const r = await gasPost({
        accion: 'confirmarAgenda',
        jornadas: { [jornadaKey]: { inspector, visitas: items.map(it => ({ radicado: it.radicado })) } },
      });
      if (r && r.ok === false) throw new Error(r.error || 'Error desconocido');
      invalidarCache('visitas');
      setInspectorSel(s => Object.assign({}, s, { [jornadaKey]: '' }));
      if (r && r.errores && r.errores.length) {
        await appAlert('No se pudieron confirmar: ' + r.errores.join(', '), { tono: 'aviso', titulo: 'Confirmado parcialmente' });
      }
      await cargar();
    } catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
    setConfirmando(false);
  }

  const diasLabel = { lunes: 'Lunes', martes: 'Martes', 'miércoles': 'Miércoles',
    jueves: 'Jueves', viernes: 'Viernes', sábado: 'Sábado', domingo: 'Domingo' };

  return (
    <div className="pantalla activa pad-bottom">
      <div className="page-title" style={{ marginBottom: 16 }}>Agenda del día</div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="card-titulo" style={{ marginBottom: 2 }}>Agenda</div>
            <div style={{ fontSize: 12, color: 'var(--texto-suave)' }}>
              {data
                ? `${diasLabel[data.dia] || data.dia || ''} ${data.fecha || ''}${data.esRural ? ' · Jornada Rural' : ''}`
                : (cargando ? 'Cargando...' : '—')}
            </div>
          </div>
          <button onClick={cargar} title="Regenerar agenda" style={{
            background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
            padding: '6px 12px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}><Icon.Refresh size={14} /> Recargar</button>
        </div>
      </div>

      {cargando && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--texto-suave)', fontSize: 14 }}>
          Cargando agenda...
        </div>
      )}
      {error && (
        <div className="card" style={{ color: 'var(--rojo)' }}>
          Error al cargar agenda: {error}
          <button onClick={cargar} style={{
            marginLeft: 12, background: 'var(--brand-accent)', color: 'white', border: 'none',
            borderRadius: 6, padding: '4px 10px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
          }}>Reintentar</button>
        </div>
      )}

      {!cargando && !error && data && (
        <>
          <div className="agenda-tabs">
            <button className={'agenda-tab' + (tab === 'manana' ? ' activo' : '')} onClick={() => setTab('manana')}>
              Mañana {data.jornadas && `(${data.jornadas.manana.visitas.length})`}
            </button>
            <button className={'agenda-tab' + (tab === 'tarde' ? ' activo' : '')} onClick={() => setTab('tarde')}>
              Tarde {data.jornadas && `(${data.jornadas.tarde.visitas.length})`}
            </button>
          </div>

          {(() => {
            const jornada = data.jornadas && data.jornadas[tab];
            const items = jornada ? jornada.visitas : [];
            return (
              <>
                {jornada && jornada.activa && items.length > 0 && (
                  <div className="card">
                    <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>
                      Confirmar jornada — asignar todas a:
                    </div>
                    <div className="inspector-chips">
                      {inspectores.map(insp => (
                        <button key={insp.nombre} type="button"
                          className={'inspector-chip' + (inspectorSel[tab] === insp.nombre ? ' sel' : '')}
                          onClick={() => setInspectorSel(s => Object.assign({}, s, { [tab]: insp.nombre }))}>
                          {insp.nombre}
                        </button>
                      ))}
                    </div>
                    <div className="agenda-confirmar-bar">
                      <button className="btn-principal" disabled={!inspectorSel[tab] || confirmando}
                        onClick={() => confirmarJornada(tab, items)}
                        style={{ flex: 1, margin: 0 }}>
                        {confirmando ? 'Confirmando...' : `Confirmar agenda (${items.length})`}
                      </button>
                    </div>
                  </div>
                )}

                <ItemsLista
                  items={items}
                  busyFila={busyFila}
                  onAbrir={onContinuar ? abrirVisita : null}
                  onCompletar={completar}
                  inspectores={inspectores}
                  asignandoFila={asignandoFila}
                  setAsignandoFila={setAsignandoFila}
                  onAsignar={adminAsignar}
                />
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}

function ItemsLista({ items, busyFila, onAbrir, onCompletar, inspectores, asignandoFila, setAsignandoFila, onAsignar }) {
  if (!items.length) {
    return (
      <div className="card agenda-empty">
        Sin visitas asignadas en esta jornada.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((it, i) => (
        <div key={it.fila || i} className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--brand-accent)' }}>
                {it.radicado || '—'}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                {it.direccion || 'Sin dirección'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
                {it.barrio || '—'} {it.comuna && `· C${it.comuna}`}
              </div>
              {it.visitador && (
                <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
                  <span style={{ opacity: 0.7 }}>Visitador:</span> {it.visitador}
                </div>
              )}
            </div>
            {it.score != null && (() => {
              // Tier por score (1-10): crítico ≥8, alto 6-7, medio 4-5, bajo <4
              const s = Number(it.score);
              const tier = s >= 8 ? 'score-critico'
                         : s >= 6 ? 'score-alto'
                         : s >= 4 ? 'score-medio'
                         : 'score-bajo';
              return (
                <span className={'score-badge ' + tier} style={{ flexShrink: 0 }}>
                  {it.score}
                </span>
              );
            })()}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {/* Acción principal: el paso real siguiente de una visita PENDIENTE
                es diligenciarla. Antes la Agenda solo ofrecía "Completar", que
                cierra el caso sin haberlo llenado. */}
            {onAbrir && (
              <button onClick={() => onAbrir(it)} disabled={busyFila === it.fila}
                className="btn-principal verde" style={{ flex: 1, minWidth: 120, margin: 0, padding: '8px 12px', fontSize: 13 }}>
                {busyFila === it.fila ? '...' : 'Iniciar visita'}
              </button>
            )}
            <button onClick={() => onCompletar(it)} disabled={busyFila === it.fila}
              className="btn-sm gris" style={{ minWidth: 96, padding: '8px 12px', fontSize: 12.5 }}>
              {busyFila === it.fila ? '...' : 'Cerrar sin visita'}
            </button>
            {/* Reusa BotonesAdminVisita (visita-card.jsx): solo se activa su rama
                "Asignar". Nunca "Desasignar": ESTADOS_AGENDA (backend) admite
                únicamente PENDIENTE, y desasignar deja la fila en PENDIENTE con
                VISITADOR(ES) vacío — no hay asignación que quitar. Por eso aquí
                no se pasa onDesasignar. */}
            <BotonesAdminVisita
              f={{ _idx: it.fila, 'RADICADO': it.radicado,
                   'ESTADO VISITA': it.estado || 'PENDIENTE',
                   'FECHA ASIGNACION VISITA': it.fechaAsignacion || '' }}
              esAdmin={true}
              busy={busyFila === it.fila}
              abierto={asignandoFila === it.fila}
              onAbrirAsignar={() => setAsignandoFila(asignandoFila === it.fila ? null : it.fila)}
              onCompletar={() => onCompletar({ fila: it.fila, radicado: it.radicado,
                                               fechaAsignacion: it.fechaAsignacion })}
            />
          </div>

          <PanelSeleccionInspector
            f={{ _idx: it.fila, 'ESTADO VISITA': it.estado || 'PENDIENTE' }}
            busy={busyFila === it.fila}
            abierto={asignandoFila === it.fila}
            inspectores={inspectores}
            onAsignar={onAsignar}
          />
        </div>
      ))}
    </div>
  );
}

window.AgendaScreen = AgendaScreen;
