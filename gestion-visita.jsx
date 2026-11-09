// ═══════════════════════════════════════════════════════════════
// gestion-visita.jsx — La gestión del admin sobre una visita
//
//   useGestionVisita   estado (fila ocupada, panel de inspectores abierto) y
//                      las acciones: asignar, crear el seguimiento ya
//                      asignado, desasignar y completar. Quien la aloja da
//                      la lista de visitas y cómo recargarla.
//   GestionVisita      la barra que la ficha pone al pie (prop `gestion` de
//                      FichaVisita).
//
// Salió de buscar.jsx el 2026-11-03 (decisión del usuario: el admin gestiona
// también desde la ficha que abre Inicio). La usan Buscar (panel y «Ver
// datos») y el modal «Ver datos» de las demás pantallas
// (visita-detail-modal.jsx), con las mismas confirmaciones.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateGV, useRef: useRefGV, useMemo: useMemoGV } = React;

function useGestionVisita({ datos, recargar }) {
  const [busyFila, setBusyFila] = useStateGV(null);           // _idx de fila en proceso
  const [asignandoFila, setAsignandoFila] = useStateGV(null); // _idx con panel de inspector abierto
  // La barra vive en un elemento que el modal guarda: las acciones leen la
  // lista y la recarga vigentes por ref, no las del render que la creó.
  const datosRef = useRefGV(datos);
  datosRef.current = datos;
  const recargarRef = useRefGV(recargar);
  recargarRef.current = recargar;
  const filaDe = (fila) => (datosRef.current || []).find(x => x._idx === fila);

  // La respuesta puede perderse en el segundo salto de Google con la
  // escritura ya hecha: ante un error se recarga igual para mostrar lo que
  // quedó en BD.
  async function avisarError(e) {
    invalidarCache('visitas'); recargarRef.current();
    await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' });
  }

  async function asignar(fila, inspector, f, fechaAsignacion, expediente) {
    // La confirmación del relevo de una INICIADA va en asignarVisitaAdmin
    // (visita-card.jsx), compartida con la Semana de Inicio.
    setBusyFila(fila);
    try {
      if (await asignarVisitaAdmin(fila, inspector, f, fechaAsignacion, expediente)) {
        setAsignandoFila(null);
        await recargarRef.current();
      }
    } catch (e) { await avisarError(e); }
    setBusyFila(null);
  }

  async function asignarNuevaVisita(filaOrigen, inspector, fechaAsignacion, expediente) {
    setBusyFila(filaOrigen);
    try {
      const fOrigen = filaDe(filaOrigen);
      // La visita nueva es del mismo predio: no va a un día con inspección de
      // otra zona (choqueZonaInspeccion). Sin DILIGENCIA, cuenta como visita.
      const bd = await leerVisitas().catch(() => null);
      const cruce = fOrigen ? choqueZonaInspeccion((bd && bd.datos) || [], inspector, fechaAsignacion || hoyDDMMAAAA(),
        Object.assign({}, fOrigen, { _idx: null }), { inspeccion: false }) : '';
      if (cruce) {
        await appAlert(cruce, { titulo: 'Se cruza con una inspección', tono: 'error' });
        setBusyFila(null);
        return;
      }
      const r = await gasPost({
        accion: 'crearNuevaVisitaAsignada',
        radicadoConocido: (fOrigen && fOrigen['RADICADO']) || '',
        idVisita: (fOrigen && fOrigen['ID_VISITA']) || '',
        fila: filaOrigen, inspector,
        fechaAsignacion: fechaAsignacion || hoyDDMMAAAA(),
        // Sin expediente explícito la visita nueva hereda el de su hermana.
        expediente: expediente || '',
      });
      if (r && r.ok === false) throw new Error(r.error || 'Error desconocido');
      invalidarCache('visitas');
      setAsignandoFila(null);
      await recargarRef.current();
      await appAlert('Visita N°' + (r.nVisita || '?') + ' creada y asignada a ' + inspector + '.',
        { tono: 'exito', titulo: 'Nueva visita asignada' });
    } catch (e) { await avisarError(e); }
    setBusyFila(null);
  }

  async function desasignar(fila, rad, idVisita) {
    const ok = await appConfirm(
      '¿Quitar asignación de ' + (rad || 'este radicado') + '?\nVolverá a estado PENDIENTE.',
      { titulo: 'Desasignar', btnOk: 'Desasignar', peligro: true }
    );
    if (!ok) return;
    setBusyFila(fila);
    try {
      await gasPost({ accion: 'desasignarRadicado', fila, radicadoConocido: rad || '', idVisita: idVisita || '' });
      invalidarCache('visitas');
      await recargarRef.current();
    } catch (e) { await avisarError(e); }
    setBusyFila(null);
  }

  async function completar(fila, fechaAsig) {
    // Paridad V2: si la visita tiene orden de suspensión preventiva
    // (SUSPENSION=SI + N° ORDEN DE POLICIA) y NO tiene oficio de vigilancia
    // generado aún, ofrecer generarlo antes de completar.
    const f = filaDe(fila);
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
            idVisita: f['ID_VISITA'] || '',
            // La celda puede llegar como Date serializada a ISO: el nombre del
            // archivo salía «…_20260924T05:00:00.000Z». Se manda DD/MM/YYYY.
            fechaVisita:     formatearFecha(f['FECHA DE VISITA']) || '',
            nOrdenPolicia:   f['N° ORDEN DE POLICIA'] || f['N ORDEN DE POLICIA'] || '',
            direccion:       f['DIRECCION INFRACCION'] || f['DIRECCION'] || '',
            barrio:          f['BARRIO/VEREDA'] || f['BARRIO'] || '',
          });
          // Con la orden ya escaneada, deja armado el PDF único para la
          // policía (solicitud + orden). Sin orden todavía no arma nada.
          await armarSolicitudUnificada(f._idx, idCarpeta, f['RADICADO'] || '', f['ID_VISITA'] || '');
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

    // Si no está lista para cerrar, se dice qué falta antes de confirmar.
    const faltan = entregablesFaltantes(f);
    const ok = await appConfirm(faltan.length
      ? 'A esta visita le falta: ' + faltan.join(' · ') + '.\n\n¿Marcarla como COMPLETADO de todas formas?'
      : '¿Marcar como COMPLETADO?', {
      tono: faltan.length ? 'aviso' : 'info', titulo: 'Completar visita',
      btnOk: faltan.length ? 'Completar igual' : 'Completar',
    });
    if (!ok) return;
    setBusyFila(fila);
    try {
      const dias = fechaAsig ? diasDesde(fechaAsig) : '';
      await gasPost({
        accion: 'completarRegistro', fila,
        radicadoConocido: (f && f['RADICADO']) || '',
        idVisita: (f && f['ID_VISITA']) || '',
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
          extraerIdCarpetaDrive(f['LINK_DRIVE'] || ''),
          f['ID_VISITA'] || ''
        ).catch(e => console.warn('[completar] pdf acta best-effort:', e.message));
      }
      invalidarCache('visitas');
      await recargarRef.current();
    } catch (e) { await avisarError(e); }
    setBusyFila(null);
  }

  return { busyFila, asignandoFila, setAsignandoFila, asignar, asignarNuevaVisita, desasignar, completar };
}

// ═══════════════════════════════════════════════════════════════
// La barra de gestión: se inyecta en la ficha (prop `gestion` de
// FichaVisita), en el panel de Buscar y en «Ver datos».
// Reasignar conserva el estado de una INICIADA (con confirmación);
// completar ofrece el oficio de vigilancia; el seguimiento («+ Nueva
// visita») se apoya en la última visita del caso.
//   f            la visita que muestra la ficha
//   todas        las visitas de su caso (f incluida)
//   acciones     lo que devuelve useGestionVisita
//   onNuevaVisita(filaBase, nVisita)  abre el formulario del seguimiento
// ═══════════════════════════════════════════════════════════════
function GestionVisita({ f, todas, inspectores, acciones, onNuevaVisita }) {
  const { busyFila, asignandoFila, setAsignandoFila } = acciones;
  // El estado como lo agrupa Buscar (estadoBuscarDe): «PQR PENDIENTE» es una
  // pendiente y una fila CERRADO (V2 cerrada por otra vía o NO COMPETENCIA)
  // no se gestiona.
  const est = estadoBuscarDe(f);
  const busy = busyFila === f._idx;
  const abierto = asignandoFila === f._idx;

  // El caso completo (todas las visitas del radicado) decide si puede abrir
  // un seguimiento: una visita en curso bloquea crear otra sobre el mismo
  // radicado, y una PENDIENTE no lo habilita (sobre ella va «Asignar»).
  const abierta = todas.find(x => {
    const e = estadoBuscarDe(x);
    return e === 'ASIGNADO' || e === 'INICIADO';
  });
  const pendiente = todas.find(x => estadoBuscarDe(x) === 'PENDIENTE');
  const ordenadas = useMemoGV(() => numerarVisitasRadicado(todas), [todas]);
  const filaBase = ordenadas.length ? ordenadas[ordenadas.length - 1].f : null;
  const radicadoReal = esRadicadoDeCaso(String(f['RADICADO'] || '').trim().toUpperCase());
  const totalVisitas = ordenadas.filter(x => x.n != null).length;
  const puedeNueva = !!filaBase && radicadoReal;
  const panelNuevaAbierto = !!filaBase && asignandoFila === ('nueva:' + filaBase._idx);

  const abrirPanel = (id) => setAsignandoFila(asignandoFila === id ? null : id);
  // La inspección al lugar sin iniciar no se asigna ni se reasigna aquí: su
  // día, hora e inspector se cambian en Agenda › Inspecciones, que revisa los
  // cruces (2026-11-09). Asignar desde aquí movía su día sin mirar la hora.
  const inspSinIniciar = esInspeccionLugar(f) && est !== 'INICIADO';
  const irAgendaInsp = () => window.dispatchEvent(new CustomEvent('cu-ir-agenda-inspeccion',
    { detail: { fecha: formatearFecha(f['FECHA ASIGNACION VISITA'] || ''), fila: f._idx } }));
  // Sin acciones (p. ej. completada con otra visita pendiente) no hay barra.
  const conNueva = puedeNueva && (abierta || (!pendiente && est === 'COMPLETADO'));
  if (est !== 'PENDIENTE' && est !== 'ASIGNADO' && est !== 'INICIADO' && !conNueva) return null;

  return (
    <section className="bq-gestion" aria-label="Gestión">
      <div className="bq-seg">
        <span className="bq-gestion-tit" aria-hidden="true">Gestión</span>
        {inspSinIniciar && (est === 'PENDIENTE' || est === 'ASIGNADO') && (
          <button type="button" className="vc-btn" onClick={irAgendaInsp}>Cambiar en la Agenda</button>
        )}
        {est === 'PENDIENTE' && !inspSinIniciar && (
          <button type="button" className="vc-btn" disabled={busy} onClick={() => abrirPanel(f._idx)}>
            {abierto ? 'Cancelar' : 'Asignar'}
          </button>
        )}
        {(est === 'ASIGNADO' || est === 'INICIADO') && (
          <>
            {!inspSinIniciar && (
              <button type="button" className="vc-btn" disabled={busy} onClick={() => abrirPanel(f._idx)}>
                {abierto ? 'Cancelar' : 'Reasignar'}
              </button>
            )}
            <button type="button" className="vc-btn" disabled={busy}
              onClick={() => acciones.desasignar(f._idx, f['RADICADO'], f['ID_VISITA'])}>
              <Icon.Undo size={14} /> Desasignar
            </button>
          </>
        )}
        {/* Lleno solo con la visita lista para cerrar; si falta algo es un
            botón normal y el aviso dice qué (completar). Así no compite
            con «Continuar visita» de la cabecera. */}
        {est === 'INICIADO' && (
          <button type="button" className={'vc-btn' + (entregablesFaltantes(f).length ? '' : ' vc-btn-cta')} disabled={busy}
            onClick={() => acciones.completar(f._idx, f['FECHA ASIGNACION VISITA'])}>
            <Icon.Check size={14} /> Completar
          </button>
        )}
        {puedeNueva && (abierta
          // `abierta` es la fila cruda: el número sale de la numeración del caso.
          ? <span className="vc-dilig" title="Completa la visita en curso antes de abrir otra">
              Visita {(ordenadas.find(x => x.f === abierta) || {}).n || ''} en curso
            </span>
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
      {est !== 'COMPLETADO' && !inspSinIniciar && (
        <PanelSeleccionInspector
          f={f} busy={busy} abierto={abierto} inspectores={inspectores}
          accion="asignar" conFecha conExpediente onAsignar={acciones.asignar} />
      )}
      {puedeNueva && !abierta && !pendiente && est === 'COMPLETADO' && (
        <PanelSeleccionInspector
          f={filaBase} busy={busyFila === filaBase._idx} abierto={panelNuevaAbierto}
          inspectores={inspectores} accion="nueva" conFecha conExpediente
          onAsignar={acciones.asignar} onAsignarNuevaVisita={acciones.asignarNuevaVisita} />
      )}
    </section>
  );
}

window.useGestionVisita = useGestionVisita;
window.GestionVisita    = GestionVisita;
