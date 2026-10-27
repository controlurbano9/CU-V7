// ═══════════════════════════════════════════════════════════════
// visita-card.jsx — La tarjeta de visita y sus piezas compartidas
//
//   TarjetaVisita             La única tarjeta de visita de la app (Semana,
//                             Alertas, Mis visitas, Buscar). Arquitectura
//                             2026-10-27, decisión 1.
//   BotonPdfRadicado          Chip «PQR» (la ficha lo usa junto al radicado)
//   BotonMapaVisita           Cómo llegar (Google Maps: GPS, catastro o dirección)
//   PanelSeleccionInspector   Lista de inspectores para asignar / reasignar
//   asignarVisitaAdmin        Asignar desde Buscar y desde la Semana
//
// VisitaCard, BotonContinuarVisita, BotonVerDatos, BotonesEntregables,
// MenuAccionesVisita, AccionesFilaVisita y BotonesAdminVisita se quitaron
// el 2026-10-27: ninguna pantalla los usaba ya.
// ═══════════════════════════════════════════════════════════════

// Aliasing por archivo (regla de la app): cada .jsx desestructura los hooks
// con su propio sufijo para que el bundle no colisione.
const { useState: useStateVC, useEffect: useEffectVC } = React;

// ═══════════════════════════════════════════════════════════════
// TarjetaVisita — la misma visita dice lo mismo en toda la app, en el mismo
// orden: estado y tiempo → dirección → radicado · barrio · comuna → lo que
// falta → una acción. Lo que dice sale de tarjetaVisita (utils.js); aquí
// solo se pinta.
//
//   densidad 'tarjeta' (Mis visitas en el celular) o 'renglon' (Semana,
//   Alertas, Buscar y Mis visitas con panel). En renglón el estado va al
//   comienzo del renglón de datos.
//
// Tocar la tarjeta abre la ficha (`onAbrir`, por defecto «Ver datos»): ya no
// hay botón «Ver datos». La acción (Iniciar / Continuar) es la única llena;
// «Cómo llegar» va como icono y solo en asignadas e iniciadas.
//
// Props para lo propio de cada pantalla, sin copiar la tarjeta:
//   opts        se pasan a tarjetaVisita (estado, veTodo, puede)
//   accion      { texto, fn } reemplaza la acción (Buscar: «Asignar»);
//               null la quita (con panel la acción vive en la ficha)
//   onAccion    (fila, f) para la acción por defecto
//   tiempo      reemplaza el texto de tiempo (Alertas: el motivo); urgente
//               lo pinta en rojo
//   sinTiempo   la Semana: el día ya es el tiempo
//   ident, ubic nodos que reemplazan radicado y ubicación (Buscar resalta lo
//               buscado)
//   radicada    con la fecha de radicado (solo Buscar)
//   aviso       renglones extra bajo «Falta» (coincidencias, quién la lleva)
//   inspector   nodo que reemplaza el nombre (la Semana: reasignar)
//   n, extra, pie, sel, arrastre  número de parada, botones extra (↑↓),
//               panel debajo, seleccionada, props de arrastre
// ═══════════════════════════════════════════════════════════════
function TarjetaVisita({ f, densidad, opts, accion, onAccion, onAbrir, tiempo, urgente, sinTiempo,
  ident, ubic, radicada, aviso, inspector, n, extra, pie, sel, arrastre }) {
  const t = tarjetaVisita(f, Object.assign({ puede: puedeDiligenciar(f) }, opts));
  const renglon = densidad === 'renglon';
  const acc = accion === null ? null
    : accion ? accion
    : t.accion ? { texto: t.accion, fn: () => onAccion && onAccion(f._idx, f) } : null;
  const abrir = () => onAbrir ? onAbrir(f) : (window.abrirVisitaDetail && window.abrirVisitaDetail(f));
  const sinPropagar = (fn) => (e) => { e.stopPropagation(); fn(); };
  const tiempoTxt = sinTiempo ? '' : (tiempo != null ? tiempo : t.tiempo);
  const tiempoNodo = tiempoTxt
    ? <span className={(urgente || (tiempo == null && t.demora)) ? 'tv-demora' : ''}>{tiempoTxt}</span>
    : null;
  const estadoNodo = <><b>{t.estadoTxt}</b>{tiempoNodo && <> · {tiempoNodo}</>}</>;
  const identNodo = ident || (t.ident.principal
    ? <span className={'tv-rad' + (t.ident.secundario ? ' exp-tag' : '')} title={t.ident.secundario || undefined}>{t.ident.principal}</span>
    : null);
  const ubicNodo = ubic || (t.ubic ? <span>{t.ubic}</span> : null);
  const inspNodo = inspector || (t.inspector ? <span>{t.inspector}</span> : null);
  const meta = [renglon && <span key="e" className="tv-est">{estadoNodo}</span>, identNodo, ubicNodo,
    // En la pendiente el tiempo ya dice desde cuándo está radicada.
    radicada && t.radicada && t.estado !== 'PENDIENTE' && <span key="r">radicada {t.radicada}</span>, inspNodo].filter(Boolean);

  return (
    <article className={'tv tv-' + (renglon ? 'renglon' : 'tarjeta') + ' tv-e-' + t.estado.toLowerCase() + (sel ? ' sel' : '')}
      aria-current={sel || undefined} onClick={abrir} {...(arrastre || {})}>
      {n && <span className="tv-n" aria-label={'Parada ' + n}>{n}</span>}
      <div className="tv-txt">
        {!renglon && <div className="tv-est">{estadoNodo}</div>}
        {/* La dirección es el control de teclado de la tarjeta. */}
        <button type="button" className="tv-dir" title={t.dir} aria-pressed={sel != null ? !!sel : undefined}
          onClick={sinPropagar(abrir)}>{t.dirVisible}</button>
        <div className="tv-meta">
          {meta.map((m, i) => <React.Fragment key={i}>{i > 0 && <span className="tv-sep"> · </span>}{m}</React.Fragment>)}
        </div>
        {t.falta.length > 0 && <div className="tv-falta">Falta: {t.falta.join(' · ')}</div>}
        {aviso}
      </div>
      {(acc || t.mapa || extra) && (
        <div className="tv-acc" onClick={(e) => e.stopPropagation()}>
          {acc && <button type="button" className="tv-btn" onClick={acc.fn}>{acc.texto}</button>}
          {t.mapa && <BotonMapaVisita f={f} variante="icono" />}
          {extra}
        </div>
      )}
      {pie && <div className="tv-pie" onClick={(e) => e.stopPropagation()}>{pie}</div>}
    </article>
  );
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
// `onAbrir(e)` (opcional): quien lo aloja puede tomar el clic (la ficha
// muestra la PQR a su lado con e.preventDefault()); si no, abre la pestaña.
function BotonPdfRadicado({ f, titulo, onAbrir }) {
  const link = linkPdfRadicado(f);
  if (!link) return null;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer"
      onClick={(e) => { e.stopPropagation(); if (onAbrir) onAbrir(e); }}
      title={titulo || 'Abrir el PDF de la PQR radicada (pestaña nueva)'}
      className="pqr-chip">
      <Icon.File size={11} /> PQR
    </a>
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
// Enlace de «Cómo llegar». Arranca con lo que hay en la fila (coordenadas o
// texto de la dirección) y, si la visita no tiene coordenadas, lo cambia por
// el punto del predio cuando catastro responde (puntoMapaCatastro, api.js).
// Si catastro no está a mano o no calza, se queda en el texto: el botón nunca
// espera. El punto se guarda con su dirección para no servirle a otra fila.
function useLinkMapaVisita(f) {
  const [hallado, setHallado] = useStateVC(null);
  const dir = f ? String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim() : '';
  const necesita = typeof filaNecesitaPuntoCatastro === 'function' && filaNecesitaPuntoCatastro(f);
  useEffectVC(() => {
    if (!necesita || typeof puntoMapaCatastro !== 'function') return;
    let vivo = true;
    puntoMapaCatastro(dir)
      .then((p) => { if (vivo && p) setHallado({ dir, p }); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [dir, necesita]);
  if (typeof linkMapaVisita !== 'function') return '';
  return linkMapaVisita(f, necesita && hallado && hallado.dir === dir ? hallado.p : null);
}

// sinIcono: la ficha de la visita quiere botones solo con texto (v2, 2026-10-25).
function BotonMapaVisita({ f, variante, sinIcono }) {
  const link = useLinkMapaVisita(f);
  if (!link) return null;
  const titulo = 'Abrir la ubicación en Google Maps (pestaña nueva)';
  // Variante icono: la tarjeta de la semana no tiene ancho para el rótulo.
  // El nombre completo sigue llegando al lector de pantalla y al tooltip.
  if (variante === 'icono') {
    return (
      <a className="sv-icono" href={link} target="_blank" rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()} title={titulo} aria-label="Cómo llegar">
        <Icon.Pin size={14} />
      </a>
    );
  }
  if (variante === 'vc') {
    return (
      <a className="vc-btn" href={link} target="_blank" rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()} title={titulo}>
        {!sinIcono && <Icon.Pin size={14} />} Cómo llegar
      </a>
    );
  }
  return (
    <a className="btn-principal secundario" href={link} target="_blank" rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()} title={titulo}
      style={{ flex: 1, minWidth: 100, margin: 0, padding: '8px 12px', fontSize: 13,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        textDecoration: 'none' }}>
      <Icon.Pin size={14} /> Cómo llegar
    </a>
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
//   onAsignar(fila, nombre, f, fechaAsignacion, expediente)  — PENDIENTE/ASIGNADO/INICIADO
//   onAsignarNuevaVisita(fila, nombre, fechaAsignacion, expediente) — solo COMPLETADO
//   conExpediente — campo opcional «Expediente» (solo dígitos, 1-6): quien
//     asigna es quien conoce el caso (decisión 2026-10-19). Vacío = NUEVO.
//
// El 3er argumento de onAsignar (la fila completa) es opcional para el caller:
// Buscar lo usa para advertir antes de relevar una visita INICIADA; Agenda,
// donde todo está en PENDIENTE, lo ignora.
// ═══════════════════════════════════════════════════════════════
function PanelSeleccionInspector({ f, busy, abierto, inspectores,
  onAsignar, onAsignarNuevaVisita, accion, conFecha, conExpediente }) {
  // Hooks antes de cualquier early return (React #310).
  const [fecha, setFecha] = useStateVC('');
  const [aviso, setAviso] = useStateVC('');
  const [expediente, setExpediente] = useStateVC('');

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
    const exp = conExpediente ? expediente : '';
    if (esNueva && onAsignarNuevaVisita) onAsignarNuevaVisita(f._idx, nombre, ddmmaaaa, exp);
    else onAsignar(f._idx, nombre, f, ddmmaaaa, exp);
  }

  function cambiarFecha(v) {
    setFecha(v);
    setAviso(avisoFechaAsignacion(v));
  }

  return (
    <div style={{
      marginTop: 10, padding: 10, background: 'var(--gris-bg)', borderRadius: 8,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginBottom: 2 }}>
        {esNueva ? 'Crear nueva visita y asignar a:'
          : est === 'INICIADO' ? 'Reasignar (conserva el avance) a:'
          : 'Asignar a:'}
      </div>

      {/* Fecha programada: asignar hoy para un día posterior. Vacío = hoy.
          Solo donde el caller lo pide (Buscar y Agenda). */}
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

      {/* Expediente del caso: lo conoce quien asigna, no el visitador en
          campo. Opcional y solo dígitos (el backend valida 1-6); vacío = NUEVO. */}
      {conExpediente && (
        <div className="psi-exp">
          <label htmlFor={'psi-e-' + f._idx}>Expediente <small>(opcional, solo números)</small></label>
          <input id={'psi-e-' + f._idx} type="text" inputMode="numeric" autoComplete="off"
            placeholder="NUEVO" maxLength={6} value={expediente}
            onChange={e => setExpediente(e.target.value.replace(/\D+/g, '').slice(0, 6))} />
        </div>
      )}

      {inspectores.map(i => (
        <button key={i.nombre} type="button"
          onClick={() => elegir(i.nombre)} disabled={busy} style={{
            background: 'var(--superficie)', border: '1px solid var(--borde)', borderRadius: 6,
            padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, textAlign: 'left',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}>
          {i.nombre}
          {i.cargo && <span style={{ color: 'var(--texto-suave)', fontSize: 13 }}> · {i.cargo}</span>}
        </button>
      ))}
    </div>
  );
}

// Asignar o reasignar una visita (admin). Lo usan Buscar y la Semana de
// Inicio. Relevar una INICIADA no es lo mismo que asignar una pendiente: el
// backend conserva el estado, pero por la regla del diligenciador el
// inspector anterior deja de verla, y su borrador local (localStorage) no
// viaja — por eso se confirma. Devuelve false si el admin canceló; lanza si
// el webhook falla.
async function asignarVisitaAdmin(fila, inspector, f, fechaAsignacion, expediente) {
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
    if (!ok) return false;
  }
  await gasPost({
    accion: 'asignarRadicado', fila, inspector,
    radicadoConocido: (f && f['RADICADO']) || '',
    idVisita: (f && f['ID_VISITA']) || '',
    fechaAsignacion: fechaAsignacion || hoyDDMMAAAA(),
    // Vacío no pisa un expediente que ya exista (regla del backend).
    expediente: expediente || '',
  });
  invalidarCache('visitas');
  return true;
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
// Fin de semana y festivos no se bloquean: el inspector a veces va un
// sábado. Solo se avisa, la decisión es del admin. Compartido por
// PanelSeleccionInspector y la confirmación de jornada de Agenda.
function avisoFechaAsignacion(iso) {
  if (!iso) return '';
  const d = parsearFecha(_isoADDMMAAAA(iso));
  if (!d) return '';
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return 'Cae en fin de semana.';
  if (typeof esDiaHabil === 'function' && !esDiaHabil(d)) return 'Es festivo.';
  return '';
}


// Exponer al scope global del bundle (mismo patrón que el resto de los componentes)
window.TarjetaVisita           = TarjetaVisita;
window.BotonPdfRadicado        = BotonPdfRadicado;
window.PanelSeleccionInspector = PanelSeleccionInspector;
