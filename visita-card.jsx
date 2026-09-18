// ═══════════════════════════════════════════════════════════════
// visita-card.jsx — Componentes compartidos para "tarjeta de visita"
//
// Antes había 3 implementaciones casi idénticas:
//   home.jsx (asignadas hoy)        — variante compacta
//   mis-visitas.jsx (TarjetaVisitaMV) — variante con fecha
//   buscar.jsx (FilaVisitaBase)     — variante con fecha+inspector+asignado+botones admin
//
// Acá los unificamos. VisitaCard solo dibuja header (radicado+dir+badge+meta);
// los botones se pasan como children. Helpers separados:
//   BotonContinuarVisita      ▶ Iniciar / Continuar (verde secundario)
//   BotonesEntregables        👁 Ver datos + 📂 Carpeta + 📄 Acta + 📝 Informe
//   BotonMapaVisita           📍 Cómo llegar (Google Maps: GPS o dirección)
//   BotonesAdminVisita        Asignar / Reasignar / Desasignar / Completar / + Nueva visita
//   PanelSeleccionInspector   Panel inline de elección de inspector (abierto=true)
//
// NO wrapper interno — el caller decide cómo envolver (.card / borderTop / borderBottom).
// Esto permite reusar el mismo componente dentro de acordeones, grupos, listas planas, etc.
// ═══════════════════════════════════════════════════════════════

// Aliasing por archivo (regla de la app): cada .jsx desestructura los hooks
// con su propio sufijo para que el bundle no colisione.
const { useState: useStateVC } = React;

// ── Tonos por estado para badge-suave ─────────────────────────
// Capitalizado en español, igual que mis-visitas.jsx
const TONOS_VISITA = {
  PENDIENTE:  { cls: 'badge-amarillo', label: 'Pendiente' },
  ASIGNADO:   { cls: 'badge-amarillo', label: 'Asignada' },
  INICIADO:   { cls: 'badge-azul',     label: 'Iniciada' },
  COMPLETADO: { cls: 'badge-verde',    label: 'Completada' },
};

// Diligenciador = primer nombre en VISITADOR(ES); ver visitadoresBD/primerVisitador en utils.js
function _primerVisitador(f) {
  return primerVisitador(visitadoresBD(f));
}

// ═══════════════════════════════════════════════════════════════
// BotonPdfRadicado — abre el PDF de la PQR original en pestaña nueva.
//
// Va pegado al radicado (no en la fila de botones de abajo): es una
// propiedad del radicado, no un entregable de la visita, y ahí lo
// encuentra el inspector antes de salir a campo.
//
// Se renderiza null si la fila no tiene link — el caso normal en visitas
// de oficio y en radicados que el scraper no alcanzó a descargar.
// stopPropagation porque la tarjeta puede vivir dentro de contenedores
// clickeables (acordeones, filas de resultado).
// ═══════════════════════════════════════════════════════════════
function BotonPdfRadicado({ f, titulo }) {
  const link = linkPdfRadicado(f);
  if (!link) return null;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={titulo || 'Abrir el PDF de la PQR radicada (pestaña nueva)'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '1px 7px', borderRadius: 8,
        background: 'var(--brand-bg)', color: 'var(--brand-ink)',
        border: '1px solid var(--brand-accent)',
        fontFamily: 'inherit', fontSize: 10, fontWeight: 700,
        textDecoration: 'none', lineHeight: 1.6, whiteSpace: 'nowrap',
      }}>
      <Icon.File size={11} /> PQR
    </a>
  );
}

// ═══════════════════════════════════════════════════════════════
// VisitaCard — header de tarjeta de visita (info + badge + meta).
//
// NO envuelve en wrapper externo. El caller decide:
//   <div className="card">...<VisitaCard .../>...</div>
//   <div style={{ borderBottom: ... }}><VisitaCard ... /></div>
//
// Props:
//   f                fila de datos del Sheet (objeto plano)
//   mostrarFecha     bool — meta línea "Fecha: dd/mm/yyyy"
//   mostrarInspector bool — meta línea "Inspector: <primero>"
//   mostrarAsignado  bool — meta línea "Asignado: dd/mm/yyyy"
//   mostrarOrden     bool — meta línea "Orden: YYYY-09-XXX" (solo si hay orden real)
//   mostrarPersonaAtiende bool — meta línea "Atiende: <nombre>" (solo Buscar:
//                    ahí se busca por ese campo y la tarjeta debe decir
//                    cuál visita del grupo lo tiene; Home y Mis visitas no)
//   labelBadge      string opcional override del label del badge
//                    (ej: en home pasamos 'Asignada' fijo aunque sea PENDIENTE/ASIGNADO)
//   children         JSX adicional (botones, panel) — se renderiza debajo del header
//   accionesMt       margin-top del bloque de children (default 12)
// ═══════════════════════════════════════════════════════════════
// N° de orden de policía de la fila, '' si no tiene. El encabezado llega con
// y sin "°" según la hoja, y las filas migradas de V2 traen 'N/A' en vez de
// vacío (mismo criterio que _hayOrdenReal de nueva-visita.jsx).
function ordenPoliciaDe(f) {
  const s = ((f && (f['N° ORDEN DE POLICIA'] || f['N ORDEN DE POLICIA'])) || '').toString().trim();
  const u = s.toUpperCase();
  return (u === 'N/A' || u === 'NA' || u === 'NO APLICA') ? '' : s;
}

function VisitaCard({ f, mostrarFecha, mostrarInspector, mostrarAsignado, mostrarOrden, mostrarPersonaAtiende, labelBadge, children, accionesMt }) {
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  const tono = TONOS_VISITA[est] || { cls: '', label: est || '—' };
  const textoBadge = labelBadge != null ? labelBadge : tono.label;

  const fechaVisita = mostrarFecha
    ? formatearFecha(f['FECHA DE VISITA'] || f['FECHA ASIGNACION VISITA'] || '')
    : '';
  const fechaAsig = mostrarAsignado
    ? formatearFecha(f['FECHA ASIGNACION VISITA'] || '')
    : '';
  const inspector = mostrarInspector && f['VISITADOR(ES)']
    ? _primerVisitador(f)
    : '';
  const orden = mostrarOrden ? ordenPoliciaDe(f) : '';
  const personaAtiende = mostrarPersonaAtiende
    ? ((f['NOMBRE PERSONA ATIENDE'] || '').toString().trim())
    : '';
  // Fecha del radicado — siempre visible junto al número, no depende de prop.
  // Para Oficio, FECHA RADICADO = fecha de la visita (mismo valor, ver CLAUDE.md).
  const fechaRadicado = formatearFecha(f['FECHA RADICADO'] || '');

  const tieneMeta = fechaVisita || inspector || fechaAsig || orden || personaAtiende;
  const mt = (accionesMt != null) ? accionesMt : 12;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Dirección primero: es por lo que el inspector reconoce el caso.
              El radicado es el identificador, pero no es lo que se busca al
              barrer la lista con la vista. */}
          <div className="vc-dir">
            {f['DIRECCION INFRACCION'] || f['DIRECCION'] || 'Sin dirección'}
          </div>

          {/* Línea de identidad, sin etiquetas: radicado · PQR · barrio · comuna
              · fecha de radicado. El radicado conserva peso (mono 12/600
              terracota) frente al resto en 11 regular — es el identificador
              único y tiene que localizarse de un vistazo. */}
          <div className="vc-ident">
            <span className="vc-rad">{f['RADICADO'] || '—'}</span>
            <BotonPdfRadicado f={f} />
            <span className="vc-sep">·</span>
            <span>{f['BARRIO/VEREDA'] || f['BARRIO'] || '—'}</span>
            {f['COMUNA'] && <><span className="vc-sep">·</span><span>C{f['COMUNA']}</span></>}
            {fechaRadicado && <><span className="vc-sep">·</span><span>{fechaRadicado}</span></>}
          </div>

          {/* Línea administrativa: quién la tiene, desde cuándo, con qué orden.
              Es lo que permite decidir sin abrir "Ver datos". "Editado · quién"
              se quedó fuera a propósito (vive en el detalle); "Atiende" solo
              aparece cuando la búsqueda coincidió con ese campo. */}
          {tieneMeta && (
            <div className="vc-admin">
              {inspector   && <span className="vc-insp">{inspector}</span>}
              {fechaVisita && <span>visita {fechaVisita}</span>}
              {fechaAsig   && <span>asignada {fechaAsig}</span>}
              {orden       && <span>Orden {orden}</span>}
              {personaAtiende && <span>atiende {personaAtiende}</span>}
            </div>
          )}
        </div>

        {/* Badge de estado a la derecha */}
        <span className={'badge-suave ' + tono.cls}>{textoBadge}</span>
      </div>

      {/* Children: botones, panel admin, lo que sea */}
      {children && <div style={{ marginTop: mt }}>{children}</div>}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// BotonContinuarVisita — botón verde-secundario Iniciar/Continuar
//
// Visible solo si est ≠ COMPLETADO y onContinuar existe.
// Texto cambia según estado: INICIADO → "Continuar", resto → "Iniciar".
//
// Props:
//   f, onContinuar       — datos + callback estándar (fila, datos)
//   busy                 — desactiva el botón
//   tamaño               — 'sm' (en lista compacta: "Iniciar"/"Continuar") |
//                          'md' (default — "Iniciar visita"/"Continuar visita")
// ═══════════════════════════════════════════════════════════════
function BotonContinuarVisita({ f, onContinuar, busy, tamaño }) {
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  if (!onContinuar) return null;
  if (est === 'COMPLETADO') return null;

  // Regla del diligenciador aplicada también al CTA (puedeDiligenciar en utils.js):
  // en vez del botón se dice quién la diligencia. "Ver datos" sigue disponible, así
  // que el co-asignado no pierde acceso a la información.
  if (!puedeDiligenciar(f)) {
    return (
      <span style={{ fontSize: 12, color: 'var(--texto-suave)', alignSelf: 'center' }}>
        Diligencia {_primerVisitador(f)}
      </span>
    );
  }

  const esSm = tamaño === 'sm';
  const texto = est === 'INICIADO'
    ? (esSm ? 'Continuar' : 'Continuar visita')
    : (esSm ? 'Iniciar'   : 'Iniciar visita');

  return (
    <button type="button" onClick={() => onContinuar(f._idx, f)} disabled={busy}
      className="btn-principal secundario"
      style={esSm
        ? { flex: 1, minWidth: 100, margin: 0, padding: '8px 12px', fontSize: 12 }
        : { margin: 0, padding: '10px 14px', fontSize: 13 }
      }>
      <Icon.Play size={esSm ? 14 : 16} /> {texto}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// BotonVerDatos — abre el detalle de solo lectura.
// Extraído de BotonesEntregables para que también las visitas NO
// completadas tengan una forma de consultar sus datos sin abrir el
// formulario completo (antes solo existía en COMPLETADO).
// ═══════════════════════════════════════════════════════════════
function BotonVerDatos({ f }) {
  return (
    <button type="button"
      onClick={() => window.abrirVisitaDetail && window.abrirVisitaDetail(f)}
      className="btn-principal secundario"
      style={{ flex: 1, minWidth: 100, margin: 0, padding: '8px 12px', fontSize: 12 }}>
      <Icon.Eye size={14} /> Ver datos
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
// BotonMapaVisita — abre la ubicación de la visita en Google Maps.
//
// Va en la fila de acciones, con texto y no solo icono (criterio de las
// tarjetas): en campo el icono se descubre peor y en móvil no hay tooltip.
// Con GPS abre el punto exacto; sin GPS — lo normal en una asignada que
// nadie ha visitado — abre la dirección como búsqueda en Bello
// (ver linkMapaVisita en utils.js). Si no hay ni una ni otra, no se pinta.
//
// variante 'vc' usa el botón chico de la fila de Buscar; el resto usa el
// botón de las listas de Inicio y Mis visitas, para que quede del mismo
// alto que "Iniciar visita" y "Ver datos".
// ══════════════════════════════════════════════════════════════
function BotonMapaVisita({ f, variante }) {
  const link = linkMapaVisita(f);
  if (!link) return null;
  const titulo = 'Abrir la ubicación en Google Maps (pestaña nueva)';
  if (variante === 'vc') {
    return (
      <a className="vc-btn" href={link} target="_blank" rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()} title={titulo}>
        <Icon.Pin size={14} /> Cómo llegar
      </a>
    );
  }
  return (
    <a className="btn-principal secundario" href={link} target="_blank" rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()} title={titulo}
      style={{ flex: 1, minWidth: 100, margin: 0, padding: '8px 12px', fontSize: 12,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        textDecoration: 'none' }}>
      <Icon.Pin size={14} /> Cómo llegar
    </a>
  );
}

// ═══════════════════════════════════════════════════════════════
// MenuAccionesVisita — el "···" de la fila compacta de acciones.
//
// Se despliega INLINE (debajo de la fila), no como popover absoluto: la
// tarjeta del grupo tiene overflow:hidden y un panel posicionado se
// recortaría; además así funciona igual con el dedo y sin listeners
// globales de clic-fuera.
//
// Props: children = los botones del menú. Se oculta solo si no hay ninguno.
// ═══════════════════════════════════════════════════════════════
function MenuAccionesVisita({ children }) {
  const [abierto, setAbierto] = useStateVC(false);
  const items = React.Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return (
    <>
      <button type="button" className="vc-btn vc-btn-mas"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto} aria-label="Más acciones" title="Más acciones">
        <Icon.More size={16} />
      </button>
      {abierto && <div className="vc-menu">{items}</div>}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// BotonesEntregables — para visitas COMPLETADO
// 👁 Ver datos (siempre) + 📂 Carpeta + 📄 Acta + 📝 Informe (si hay link)
// El informe se genera durante la visita; una vez COMPLETADA solo se consulta.
// ═══════════════════════════════════════════════════════════════
function BotonesEntregables({ f }) {
  const linkDrive   = f['LINK_DRIVE'];
  const linkActaPdf = f['LINK_PDF_ACTA'] || f['LINK_XLSX_ACTA'];
  const linkInforme = f['LINK_DOCX_INFORME'] || f['LINK_INFORME_F43'];

  // Mismo estilo que tenían home/mis-visitas/buscar antes (pill gris-bg)
  const btnSty = {
    background: 'var(--gris-bg)', color: 'var(--texto)',
    border: '1px solid var(--borde)', borderRadius: 10,
    padding: '8px 12px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'none', display: 'inline-flex',
    alignItems: 'center', gap: 6, flex: 1, minWidth: 100,
    justifyContent: 'center',
  };

  return (
    <>
      <BotonVerDatos f={f} />
      {linkDrive   && <a href={linkDrive}   target="_blank" rel="noopener noreferrer" style={btnSty}><Icon.Folder size={14} /> Carpeta</a>}
      {linkActaPdf && <a href={linkActaPdf} target="_blank" rel="noopener noreferrer" style={btnSty}><Icon.File   size={14} /> Acta</a>}
      {linkInforme && <a href={linkInforme} target="_blank" rel="noopener noreferrer" style={btnSty}><Icon.Edit   size={14} /> Informe</a>}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// BotonesAdminVisita — botones admin contextuales según estado
//
// Aparecen SIDE-BY-SIDE con BotonContinuarVisita / BotonesEntregables.
// El caller decide envolverlos en el mismo flex row.
//
// Matriz de visibilidad:
//   PENDIENTE   → Asignar
//   ASIGNADO    → Reasignar + Desasignar
//   INICIADO    → Reasignar + Desasignar + Completar
//   COMPLETADO  → + Nueva visita (solo si onAsignarNuevaVisita existe)
//
// Estados:
//   busy=true   → todos disabled, "..." en Asignar (pendiente)
//   abierto=true → texto cambia a "Cancelar" en Asignar/Reasignar/Nueva visita
//
// Props:
//   f, esAdmin, busy, abierto
//   onAbrirAsignar          toggle del panel
//   onDesasignar(fila, rad) callback
//   onCompletar(fila, fechaAsig) callback
//   onAsignarNuevaVisita    callback (presencia define si "+Nueva visita" se muestra)
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// AccionesFilaVisita — la fila compacta de acciones de Buscar.
//
// Una sola fila, con TEXTO, no iconos: el inspector la usa en campo y un
// icono sin rótulo se descubre peor, sobre todo en móvil, donde el tooltip
// no existe. En móvil envuelve a dos filas; se acepta esa altura.
//
//   [ CTA ] [ Ver datos ] [ Acta ] [ Informe ] [ ··· ]
//
// El CTA es uno solo según el estado: Asignar (PENDIENTE, admin) o
// Iniciar/Continuar. Dentro del "···" van Carpeta de Drive y las acciones
// administrativas — Carpeta no es acción cotidiana y las de admin son
// secundarias frente a entrar a la visita.
// ═══════════════════════════════════════════════════════════════
function AccionesFilaVisita({ f, esAdmin, busy, abierto, onContinuar,
  onAbrirAsignar, onDesasignar, onCompletar }) {
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  const linkDrive   = f['LINK_DRIVE'];
  const linkActaPdf = f['LINK_PDF_ACTA'] || f['LINK_XLSX_ACTA'];
  const linkInforme = f['LINK_DOCX_INFORME'] || f['LINK_INFORME_F43'];
  const puedeDilig  = puedeDiligenciar(f);

  return (
    <div className="vc-acciones">
      {/* CTA: una sola acción principal por estado */}
      {est === 'PENDIENTE' && esAdmin && (
        <button type="button" className="vc-btn vc-btn-cta" onClick={onAbrirAsignar} disabled={busy}>
          {busy ? '...' : (abierto ? 'Cancelar' : 'Asignar')}
        </button>
      )}
      {est !== 'PENDIENTE' && est !== 'COMPLETADO' && onContinuar && puedeDilig && (
        <button type="button" className="vc-btn vc-btn-cta" disabled={busy}
          onClick={() => onContinuar(f._idx, f)}>
          <Icon.Play size={14} /> {est === 'INICIADO' ? 'Continuar' : 'Iniciar'}
        </button>
      )}
      {/* Regla del diligenciador: al co-asignado se le dice quién la lleva
          en vez del botón. Tiene que caber en esta fila sin romperla. */}
      {est !== 'PENDIENTE' && est !== 'COMPLETADO' && onContinuar && !puedeDilig && (
        <span className="vc-dilig">Diligencia {_primerVisitador(f)}</span>
      )}

      {/* "Cómo llegar" antes de "Ver datos": mientras la visita no esté
          completada, lo que decide el inspector desde acá es salir a ella. */}
      {est !== 'COMPLETADO' && <BotonMapaVisita f={f} variante="vc" />}
      <button type="button" className="vc-btn"
        onClick={() => window.abrirVisitaDetail && window.abrirVisitaDetail(f)}>
        Ver datos
      </button>
      {linkActaPdf && <a className="vc-btn" href={linkActaPdf} target="_blank" rel="noopener noreferrer">Acta</a>}
      {linkInforme && <a className="vc-btn" href={linkInforme} target="_blank" rel="noopener noreferrer">Informe</a>}

      <MenuAccionesVisita>
        {linkDrive && (
          <a key="drive" className="vc-btn" href={linkDrive} target="_blank" rel="noopener noreferrer">
            <Icon.Folder size={14} /> Carpeta
          </a>
        )}
        {esAdmin && (est === 'ASIGNADO' || est === 'INICIADO') && (
          <button key="rea" type="button" className="vc-btn" onClick={onAbrirAsignar} disabled={busy}>
            {abierto ? 'Cancelar' : 'Reasignar'}
          </button>
        )}
        {esAdmin && (est === 'ASIGNADO' || est === 'INICIADO') && (
          <button key="des" type="button" className="vc-btn" disabled={busy}
            onClick={() => onDesasignar(f._idx, f['RADICADO'])}>
            <Icon.Undo size={14} /> Desasignar
          </button>
        )}
        {esAdmin && est === 'INICIADO' && (
          <button key="com" type="button" className="vc-btn" disabled={busy}
            onClick={() => onCompletar(f._idx, f['FECHA ASIGNACION VISITA'])}>
            <Icon.Check size={14} /> Completar
          </button>
        )}
      </MenuAccionesVisita>
    </div>
  );
}

function BotonesAdminVisita({ f, esAdmin, busy, abierto,
  onAbrirAsignar, onDesasignar, onCompletar, onAsignarNuevaVisita }) {
  if (!esAdmin) return null;
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');

  // Estilo base de botón gris (legacy del refactor)
  function btnGris(extra) {
    return Object.assign({
      flex: 1, minWidth: 100,
      background: 'var(--gris-bg)', color: 'var(--texto)',
      border: '1px solid var(--borde)', borderRadius: 10,
      padding: '8px 12px',
      fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
      cursor: busy ? 'not-allowed' : 'pointer',
    }, extra || {});
  }

  return (
    <>
      {/* PENDIENTE: Asignar */}
      {est === 'PENDIENTE' && (
        <button type="button" onClick={onAbrirAsignar} disabled={busy} style={btnGris()}>
          {busy ? '...' : (abierto ? 'Cancelar' : 'Asignar')}
        </button>
      )}

      {/* ASIGNADO / INICIADO: Reasignar + Desasignar */}
      {(est === 'ASIGNADO' || est === 'INICIADO') && (
        <>
          <button type="button" onClick={onAbrirAsignar} disabled={busy} style={btnGris()}>
            {abierto ? 'Cancelar' : 'Reasignar'}
          </button>
          <button type="button" onClick={() => onDesasignar(f._idx, f['RADICADO'])} disabled={busy}
            style={btnGris({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 })}>
            <Icon.Undo size={14} /> Desasignar
          </button>
        </>
      )}

      {/* INICIADO: Completar */}
      {est === 'INICIADO' && (
        <button type="button"
          onClick={() => onCompletar(f._idx, f['FECHA ASIGNACION VISITA'])} disabled={busy}
          className="btn-principal secundario"
          style={{ flex: 1, minWidth: 100, margin: 0, padding: '8px 12px', fontSize: 12 }}>
          <Icon.Check size={14} /> Completar
        </button>
      )}

      {/* COMPLETADO: + Nueva visita (solo si la pantalla soporta) */}
      {est === 'COMPLETADO' && onAsignarNuevaVisita && (
        <button type="button" onClick={onAbrirAsignar} disabled={busy}
          style={btnGris({ border: '1px dashed var(--brand-accent)' })}>
          {abierto ? 'Cancelar' : '+ Nueva visita'}
        </button>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// PanelSeleccionInspector — panel inline (abierto=true) con la lista
// de inspectores. Click llama onAsignar o onAsignarNuevaVisita según
// estado de la fila.
//
// Va DEBAJO del row de botones (no inline con ellos).
//
// Props:
//   f, busy, abierto, inspectores
//   onAsignar(fila, nombre, f)           — usado para PENDIENTE/ASIGNADO/INICIADO
//   onAsignarNuevaVisita(fila, nombre)   — usado solo para COMPLETADO
//
// El 3er argumento de onAsignar (la fila completa) es opcional para el caller:
// Buscar lo usa para advertir antes de relevar una visita INICIADA; Agenda,
// donde todo está en PENDIENTE, lo ignora.
// ═══════════════════════════════════════════════════════════════
function PanelSeleccionInspector({ f, busy, abierto, inspectores,
  onAsignar, onAsignarNuevaVisita, accion, conFecha }) {
  // Hooks antes de cualquier early return (React #310).
  const [fecha, setFecha] = useStateVC('');
  const [aviso, setAviso] = useStateVC('');

  if (!abierto || !inspectores || inspectores.length === 0) return null;
  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  // La acción llega explícita desde el caller. Antes se deducía del estado
  // de la fila ("si está COMPLETADO, crear visita nueva"), que es la raíz de
  // que un botón rotulado "+ Nueva visita" terminara asignando: el panel
  // adivinaba. `accion` se impone; el fallback conserva el comportamiento
  // viejo para los callers que todavía no la pasan (Agenda).
  const esNueva = accion ? accion === 'nueva' : (est === 'COMPLETADO' && !!onAsignarNuevaVisita);

  const hoyIso = _hoyIso();
  const maxIso = _isoSumandoDias(90);

  function elegir(nombre) {
    const ddmmaaaa = fecha ? _isoADDMMAAAA(fecha) : hoyDDMMAAAA();
    if (esNueva && onAsignarNuevaVisita) onAsignarNuevaVisita(f._idx, nombre, ddmmaaaa);
    else onAsignar(f._idx, nombre, f, ddmmaaaa);
  }

  function cambiarFecha(v) {
    setFecha(v);
    if (!v) { setAviso(''); return; }
    // Fin de semana y festivos no se bloquean: el inspector a veces va un
    // sábado. Solo se avisa, la decisión es del admin.
    const d = parsearFecha(_isoADDMMAAAA(v));
    if (!d) { setAviso(''); return; }
    const dow = d.getDay();
    if (dow === 0 || dow === 6) setAviso('Cae en fin de semana.');
    else if (typeof esDiaHabil === 'function' && !esDiaHabil(d)) setAviso('Es festivo.');
    else setAviso('');
  }

  return (
    <div style={{
      marginTop: 10, padding: 10, background: 'var(--gris-bg)', borderRadius: 8,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 2 }}>
        {esNueva ? 'Crear nueva visita y asignar a:'
          : est === 'INICIADO' ? 'Reasignar (conserva el avance) a:'
          : 'Asignar a:'}
      </div>

      {/* Fecha programada: asignar hoy para un día posterior. Vacío = hoy.
          Solo donde el caller lo pide: en Agenda la jornada se programa desde
          la agenda misma y un segundo selector ahí confundiría. */}
      {conFecha && (
      <div className="psi-fecha">
        <label htmlFor={'psi-f-' + f._idx}>Para el día</label>
        <input id={'psi-f-' + f._idx} type="date" value={fecha}
          min={hoyIso} max={maxIso}
          onChange={e => cambiarFecha(e.target.value)} />
        <button type="button" className="vc-btn"
          onClick={() => { setFecha(''); setAviso(''); }}
          aria-pressed={!fecha}>Hoy</button>
      </div>
      )}
      {conFecha && aviso && <div className="psi-aviso">{aviso}</div>}

      {inspectores.map(i => (
        <button key={i.nombre} type="button"
          onClick={() => elegir(i.nombre)} disabled={busy} style={{
            background: 'var(--superficie)', border: '1px solid var(--borde)', borderRadius: 6,
            padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, textAlign: 'left',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}>
          {i.nombre}
          {i.cargo && <span style={{ color: 'var(--texto-suave)', fontSize: 11 }}> · {i.cargo}</span>}
        </button>
      ))}
    </div>
  );
}

// El <input type="date"> habla ISO; BD habla DD/MM/YYYY (regla de fechas).
// La conversión se hace acá y nunca se manda un Date ni un ISO al backend.
function _hoyIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
}
function _isoSumandoDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
}
function _isoADDMMAAAA(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : '';
}


// Exponer al scope global del bundle (mismo patrón que el resto de los componentes)
window.VisitaCard              = VisitaCard;
window.BotonPdfRadicado        = BotonPdfRadicado;
window.BotonContinuarVisita    = BotonContinuarVisita;
window.BotonesEntregables      = BotonesEntregables;
window.BotonVerDatos           = BotonVerDatos;
window.BotonesAdminVisita      = BotonesAdminVisita;
window.PanelSeleccionInspector = PanelSeleccionInspector;
