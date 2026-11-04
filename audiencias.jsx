// ═══════════════════════════════════════════════════════════════
// v6/audiencias.jsx — Pestaña «Audiencias» («Citaciones» para el inspector).
//   La agenda del bloque de cupos de Control Urbano (maqueta v5,
//   propuesta-audiencias.html). TASK 3a + 3b (2026-10-21).
//
//   El inspector pide la cita en campo («Pedir cita»: caso de su agenda de hoy
//   o escrito, y uno de los 5 cupos más próximos; sin señal, sus 3 apartados).
//   Vistas: Agenda · Cupos · Lista (Agenda une Hoy y Programadas, 2026-10-27). ADMIN ve todo, libera cupos y copia las
//   «Citaciones visitas completadas» para pegarlas en el Excel; SUPERVISOR
//   entra filtrado por su nombre y solo gestiona sus novedades; INSPECTOR
//   solo lectura, en «Mis citas». No es una pestaña de alertas.
//
//   Datos: agendaAudiencias (todos los cupos con estado, una lectura),
//   listarNovedades y, solo admin, listaDiariaExcel. La lógica va en
//   utils.js (tests/audiencias-pantalla.test.js); aquí solo se pinta.
//
//   Piezas (2026-11-04): HojaAU es el marco de todas las hojas (teclado
//   incluido); VistaAgenda, VistaCupos y VistaLista son las tres vistas;
//   CompletadasCaja y PedidasHoyCaja, las cajas del admin. AudienciasScreen
//   lee los datos, guarda la vista y los filtros, y abre una hoja a la vez.
//   VistaCupos es dueña de sus filtros, su selección y sus hojas.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateAU, useEffect: useEffectAU, useMemo: useMemoAU, useRef: useRefAU } = React;

// Hojas de Audiencias con teclado: el foco entra a la hoja al abrir, Escape
// la cierra, Tab no sale de ella y al cerrar vuelve a donde estaba (mismo
// patrón que la Semana y que appConfirm).
// Solo responde la hoja que tiene el foco: con un appConfirm encima (p. ej.
// «¿Liberar la cita?») el foco está en el diálogo y Escape cierra solo el
// diálogo. Antes cerraba también la hoja de atrás.
var _AU_ENFOCABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function useHojaTecladoAU(onCerrar) {
  const ref = useRefAU(null);
  const cerrarRef = useRefAU(onCerrar);
  cerrarRef.current = onCerrar;
  useEffectAU(function () {
    const previo = document.activeElement;
    const x = ref.current && ref.current.querySelector('.au-x');
    if (x) x.focus();
    const onKey = function (e) {
      const hoja = ref.current;
      if (!hoja) return;
      const act = document.activeElement;
      // El foco en otro diálogo (o en otra hoja): esta no es la de arriba.
      if (act && act !== document.body && !hoja.contains(act)) return;
      // Una hoja abierta dentro de esta («Reprogramar» dentro de «Cita»): el
      // foco está en la de adentro y es ella la que responde.
      const otra = act && act.closest ? act.closest('.au-hoj-ovl') : null;
      if (otra && otra !== hoja) return;
      if (e.key === 'Escape') { cerrarRef.current(); return; }
      if (e.key !== 'Tab') return;
      const foco = hoja.querySelectorAll(_AU_ENFOCABLES);
      if (!foco.length) return;
      const primero = foco[0], ultimo = foco[foco.length - 1];
      if (e.shiftKey && (act === primero || !hoja.contains(act))) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && (act === ultimo || !hoja.contains(act))) { e.preventDefault(); primero.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return function () {
      window.removeEventListener('keydown', onKey);
      if (previo && previo.focus && document.contains(previo)) previo.focus();
    };
  }, []);
  return ref;
}

// Copia local de la agenda por rol (2026-10-22): la pestaña abre al instante
// con lo último que se leyó y se actualiza por detrás; con la firma, el
// backend responde «sin cambios» en ~100 bytes.
var _AU_CLAVE_COPIA = 'cu_audiencias_v1_';
function _auLeerCopia(rol) {
  try { return JSON.parse(localStorage.getItem(_AU_CLAVE_COPIA + rol) || 'null'); } catch (e) { return null; }
}
function _auGuardarCopia(rol, r) {
  try { localStorage.setItem(_AU_CLAVE_COPIA + rol, JSON.stringify(r)); } catch (e) {}
}

// El «hoy» de la pantalla. Los bancos de QA lo fijan con window._AU_HOY
// (fecha ISO) para tener datos estables; en la app es el reloj.
function _auHoy() {
  try {
    if (window._AU_HOY) return new Date(window._AU_HOY + 'T00:00:00');
  } catch (e) {}
  return new Date();
}

var _AU_DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
var _AU_DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var _AU_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// 'Lun 05/04' para las cabeceras de día.
function _auDiaCorto(fechaTxt) {
  const d = parsearFecha(fechaTxt);
  if (!d) return fechaTxt;
  return _AU_DIAS[d.getDay()] + ' ' + String(d.getDate()).padStart(2, '0') + '/' +
    String(d.getMonth() + 1).padStart(2, '0');
}

// 'lunes 5 de abril de 2027' para el título de Hoy.
function _auFechaLarga(fechaTxt) {
  const d = parsearFecha(fechaTxt);
  if (!d) return fechaTxt;
  return _AU_DIAS_LARGO[d.getDay()] + ' ' + d.getDate() + ' de ' + _AU_MESES[d.getMonth()] +
    ' de ' + d.getFullYear();
}

// '43.123.456' a partir de dígitos sueltos.
function _auDocPuntos(doc) {
  return String(doc || '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// 'C.C. 43.123.456' o «Sin documento» en gris. El backend guarda la
// constancia del «No aportó documento» como NO APORTA.
function _auDocTxt(c) {
  const d = String((c && c.documentoCitado) || '').trim();
  if (d && !/^NO\s*APORT/i.test(d)) return 'C.C. ' + _auDocPuntos(d);
  return <span className="au-sindoc">Sin documento</span>;
}

function _auMayus(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

// El caso de una cita como se muestra: «Exp. N», el radicado o la orden.
function _auCaso(c) {
  // Con expediente, una etiqueta con borde (sin color: el color es del estado).
  if (c.expediente && c.expediente !== 'NUEVO') return <span className="exp-tag">Exp. {c.expediente}</span>;
  return c.radicado || (c.ordenPolicia ? 'Orden ' + c.ordenPolicia : '');
}

var _AU_SVG_COPIAR = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="12" height="12" rx="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

// ── Armazón de las hojas ────────────────────────────────────────
// Velo, hoja y cabecera con título y ×, con el teclado de useHojaTecladoAU.
// Antes cada hoja repetía este marco a mano (siete copias).
function HojaAU({ titulo, clase, onCerrar, children }) {
  const hojaRef = useHojaTecladoAU(onCerrar);
  return (
    <div ref={hojaRef} className="au-hoj-ovl on" role="dialog" aria-modal="true" aria-label={titulo}
      onClick={function (e) { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className={'au-hoj' + (clase ? ' ' + clase : '')}>
        <div className="au-hoj-cab">
          <div className="t"><b>{titulo}</b></div>
          <button type="button" className="au-x" aria-label="Cerrar" onClick={onCerrar}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Chip de alternar (filtros, días, horas, motivos): el estado va en aria-pressed.
function ChipAU({ on, onClick, children }) {
  return <button type="button" className={'au-chip' + (on ? ' on' : '')}
    aria-pressed={on ? 'true' : 'false'} onClick={onClick}>{children}</button>;
}

// «Sust. Patricia López» / «Insp. Alejandro Hernández»: en las filas salen dos
// personas y sin rótulo no se sabía cuál era cuál.
function _auSust(nombre) { return nombre ? 'Sust.\u00a0' + titleCaseNombre(nombre) : 'sin sustanciador'; }
function _auInsp(nombre) { return nombre ? 'Insp.\u00a0' + titleCaseNombre(nombre) : ''; }

// ── Hoja «Pedir cita» ──────────────────────────────────────────
// Caso (agenda de hoy del inspector o escrito) y uno de los 5 cupos más
// próximos; sin señal, sus cupos apartados. Al reservar, la fecha, la hora y
// el sustanciador en grande para copiarlos a la citación de papel.
// `casoInicial` (opcional): el caso ya puesto, cuando se pide desde la visita.
function PedirCitaHoja({ usuario, agenda, cuposIniciales, casoInicial, onCerrar, onReservada }) {
  const [filas, setFilas] = useStateAU([]);
  const [caso, setCaso] = useStateAU(casoInicial || null);
  // Con el caso de la visita, la casilla lo muestra (si no está en la agenda de
  // hoy, no habría otra señal de cuál quedó elegido).
  const [texto, setTexto] = useStateAU(casoInicial ? (casoInicial.radicado || casoInicial.ordenPolicia || '') : '');
  const [cupos, setCupos] = useStateAU(cuposIniciales || null);    // null = cargando
  const [sinSenal, setSinSenal] = useStateAU(!navigator.onLine);
  const [elegido, setElegido] = useStateAU(null);
  const [enviando, setEnviando] = useStateAU(false);
  const [error, setError] = useStateAU('');
  const [hecha, setHecha] = useStateAU(null);    // {cupo, caso, encolado}

  async function cargarCupos(enSilencio) {
    if (!enSilencio) setCupos(null);
    setError('');
    if (!navigator.onLine) { setSinSenal(true); setCupos(cuposApartadosGuardados()); return; }
    try {
      const r = await listarCuposAudiencias();
      setSinSenal(false);
      setCupos(opcionesPedirCita(r.cupos || [], 5));
    } catch (e) {
      setSinSenal(true);
      setCupos(cuposApartadosGuardados());
    }
  }
  useEffectAU(function () {
    // Con los cupos ya precargados se abre al instante y se refresca por detrás.
    cargarCupos(!!cuposIniciales);
    leerVisitas().then(function (r) { setFilas((r && r.datos) || []); }).catch(function () {});
  }, []);

  const hoyD = _auHoy();
  const hoyTxt = formatearFecha(hoyD);
  const agendaHoy = useMemoAU(function () {
    return casosAgendaHoyAudiencias(filas, String(usuario.usuario || '').toUpperCase(), hoyD);
  }, [filas]);
  const sugerencias = useMemoAU(function () { return sugerirCasosAudiencias(filas, texto, 5); }, [filas, texto]);
  const casoEscrito = !caso && texto.trim()
    ? (normOrdenAudiencias(texto) ? { radicado: '', ordenPolicia: texto.trim() } : { radicado: texto.trim(), ordenPolicia: '' })
    : null;
  const casoFinal = caso || casoEscrito;
  const yaTiene = casoFinal ? citaVigenteDelCaso(agenda, casoFinal, hoyTxt) : null;
  const noEnBase = !caso && texto.trim().length >= 5 && !sugerencias.length;

  async function reservar() {
    if (!casoFinal || !elegido || enviando) return;
    setEnviando(true); setError('');
    try {
      const r = await reservarCupoAudiencias(casoFinal, elegido);
      setHecha({ cupo: r.cupo || elegido, caso: casoFinal, encolado: !!r.encolado });
      onReservada();
    } catch (e) {
      setError(e.message || 'No se pudo reservar.');
      setElegido(null);
      cargarCupos();
    }
    setEnviando(false);
  }

  function otra() {
    setHecha(null); setCaso(null); setTexto(''); setElegido(null);
    cargarCupos();
  }

  const etiquetaCaso = function (c) {
    return c.expediente ? 'Exp. ' + c.expediente : (c.radicado || 'Orden ' + c.ordenPolicia);
  };

  return (
    <HojaAU titulo="Pedir cita" clase="au-pedir" onCerrar={onCerrar}>
      {hecha ? (<>
        <div className={'au-pconf ' + (hecha.encolado ? 'cola' : 'ok')}>
          <p className="est">{hecha.encolado ? '⇡ En cola · se confirma al volver la señal' : '✓ Cita confirmada'}</p>
          <p className="f">{_auMayus(_auFechaLarga(hecha.cupo.fecha))}</p>
          <p className="h">{horaBonitaAudiencias(hecha.cupo.hora)}</p>
          <p className="s">{titleCaseNombre(hecha.cupo.sustanciador)}</p>
          <p className="caso">{hecha.caso.radicado ? 'Rad. ' + hecha.caso.radicado : 'Orden ' + hecha.caso.ordenPolicia}</p>
          {hecha.encolado && <p className="nota">Es tu cupo apartado: puedes entregarla.</p>}
        </div>
        <div className="au-pbotones">
          <button type="button" className="btn-neutro" onClick={otra}>Pedir otra</button>
          <button type="button" className="btn-principal" onClick={onCerrar}>Listo</button>
        </div>
      </>) : (<>
        <fieldset className="au-pgrupo">
          <legend>Caso</legend>
          {agendaHoy.map(function (c) {
            const on = caso && caso.radicado === c.radicado && caso.ordenPolicia === c.ordenPolicia;
            const cita = citaVigenteDelCaso(agenda, c, hoyTxt);
            return (
              <button type="button" key={c.radicado + c.ordenPolicia} className={'au-pcaso' + (on ? ' on' : '')}
                aria-pressed={on ? 'true' : 'false'}
                onClick={function () { setCaso(on ? null : c); setTexto(''); }}>
                <span className="t">{c.direccion || etiquetaCaso(c)}
                  <small>{c.expediente ? <span className="exp-tag">Exp. {c.expediente}</span> : etiquetaCaso(c)}
                    {[c.barrio, cita ? 'cita ' + _auDiaCorto(cita.fecha) : ''].filter(Boolean).map(function (x) { return ' · ' + x; }).join('')}</small>
                </span>
              </button>
            );
          })}
          <label className="au-potro">Otro caso
            <input type="text" value={texto} autoComplete="off" placeholder="Radicado o N° de orden"
              onChange={function (e) { setTexto(e.target.value); setCaso(null); }} />
          </label>
          {!caso && sugerencias.length > 0 && (
            <div className="au-psugs">
              {sugerencias.map(function (c) {
                return <button type="button" key={c.radicado + c.ordenPolicia} className="au-chip"
                  onClick={function () { setCaso(c); setTexto(c.radicado || c.ordenPolicia); }}>
                  {c.radicado || c.ordenPolicia}</button>;
              })}
            </div>
          )}
          {noEnBase && <p className="au-sindoc">No está en la base</p>}
        </fieldset>

        <div className="au-pgrupo">
          <b className="au-pleg">Fecha</b>
          {sinSenal && <p className="au-aviso-linea">Sin señal · tus cupos apartados</p>}
          {yaTiene ? (
            <p className="au-aviso-linea">Ya tiene cita: {_auDiaCorto(yaTiene.fecha)} · {horaBonitaAudiencias(yaTiene.hora)} · {titleCaseNombre(yaTiene.sustanciador)}</p>
          ) : cupos === null ? (
            <div aria-busy="true"><Esqueleto tipo="renglon" n={3} /></div>
          ) : !cupos.length ? (
            <p className="au-vacio-hoy">{sinSenal ? 'Sin señal y sin cupos apartados' : 'Sin cupos libres'}</p>
          ) : cupos.map(function (c) {
            const on = elegido && elegido.idCupo === c.idCupo;
            return (
              <label className={'au-pcupo' + (on ? ' on' : '')} key={c.idCupo}>
                <input type="radio" name="au-pcupo" checked={!!on} onChange={function () { setElegido(c); }} />
                <span className="t">{_auDiaCorto(c.fecha)}/{(parsearFecha(c.fecha) || hoyD).getFullYear()} · {horaBonitaAudiencias(c.hora)}
                  <span className="sus"> · {titleCaseNombre(c.sustanciador)}</span></span>
              </label>
            );
          })}
        </div>
        {error && <p className="au-perror">{error}</p>}
        <button type="button" className="btn-principal au-preservar"
          disabled={!casoFinal || !elegido || !!yaTiene || enviando}
          onClick={reservar}>{enviando ? 'Reservando…' : 'Reservar'}</button>
      </>)}
    </HojaAU>
  );
}

// «Pedir cita» fuera de la pantalla de Audiencias: desde el «+», la ficha y el
// formulario. El inspector ya no tiene esa pestaña (arquitectura 2026-10-27,
// decisión 4). El aviso «Ya tiene cita» sale de la copia local de Audiencias si
// la hay; si no, lo da el servidor al reservar, con la fecha de la cita
// (2026-11-04: antes esta hoja leía la agenda entera cada vez que se abría).
// Sin señal, la hoja ofrece los cupos apartados.
function PedirCitaGlobal({ usuario, casoInicial, onCerrar }) {
  const agenda = useMemoAU(function () {
    const c = _auLeerCopia(usuario.rol);
    return (c && c.cupos) || [];
  }, []);
  return <PedirCitaHoja usuario={usuario} agenda={agenda} casoInicial={casoInicial}
    onCerrar={onCerrar} onReservada={function () {}} />;
}

// ── Hoja «Reprogramar» (2026-11-04, solo admin) ──────────────────
// Los próximos cupos libres (las mismas reglas de «Pedir cita»: 3 días hábiles
// de anticipación, sin novedades) y un motivo opcional. El servidor mueve la
// cita en un solo paso (reprogramarCupo): no queda un momento sin fecha en que
// otro pueda tomar el cupo.
function ReprogramarHoja({ cita, onCerrar, onListo }) {
  const [cupos, setCupos] = useStateAU(null);   // null = cargando
  const [elegido, setElegido] = useStateAU(null);
  const [motivo, setMotivo] = useStateAU('');
  const [enviando, setEnviando] = useStateAU(false);
  const [error, setError] = useStateAU('');
  async function cargarCupos() {
    setCupos(null);
    try {
      const r = await listarCuposAudiencias();
      setCupos((r.cupos || []).filter(function (c) { return c.idCupo !== cita.idCupo; }).slice(0, 8));
    } catch (e) {
      setCupos([]);
      setError(e.message || 'No se pudieron leer los cupos libres.');
    }
  }
  useEffectAU(function () { cargarCupos(); }, []);
  async function confirmar() {
    if (!elegido || enviando) return;
    setEnviando(true); setError('');
    try {
      const r = await reprogramarCupoAudiencias(cita.idCupo, elegido.idCupo, motivo.trim());
      setEnviando(false);
      onListo(r);
    } catch (e) {
      setEnviando(false);
      setError(e.message || 'No se pudo reprogramar.');
      setElegido(null);
      cargarCupos();
    }
  }
  return (
    <HojaAU titulo="Reprogramar" clase="au-pedir" onCerrar={onCerrar}>
      <p className="au-cl-info">{_auCaso(cita)}{cita.citado ? ' · ' + cita.citado : ''}<br />
        <span className="au-sindoc">Ahora: {_auDiaCorto(cita.fecha)} · {horaBonitaAudiencias(cita.hora)} · {titleCaseNombre(cita.sustanciador)}</span></p>
      <div className="au-pgrupo">
        <b className="au-pleg">Nueva fecha</b>
        {cupos === null ? <p className="au-vacio-hoy">Cargando…</p>
          : !cupos.length ? <p className="au-vacio-hoy">Sin cupos libres</p>
          : cupos.map(function (c) {
            const on = elegido && elegido.idCupo === c.idCupo;
            return (
              <label className={'au-pcupo' + (on ? ' on' : '')} key={c.idCupo}>
                <input type="radio" name="au-repro" checked={!!on} onChange={function () { setElegido(c); }} />
                <span className="t">{_auDiaCorto(c.fecha)}/{String(c.fecha).slice(-4)} · {horaBonitaAudiencias(c.hora)}
                  <span className="sus"> · {titleCaseNombre(c.sustanciador)}</span></span>
              </label>
            );
          })}
      </div>
      <div className="au-cl-campo">
        <label htmlFor="au-repro-motivo">Motivo (opcional)</label>
        <input id="au-repro-motivo" type="text" value={motivo} placeholder="Vacaciones del sustanciador, solicitud del citado…"
          onChange={function (e) { setMotivo(e.target.value); }} />
      </div>
      {error && <p className="au-perror">{error}</p>}
      <button type="button" className="btn-principal au-preservar" disabled={!elegido || enviando} onClick={confirmar}>
        {enviando ? 'Reprogramando…' : 'Reprogramar'}
      </button>
    </HojaAU>
  );
}

// ── Detalle de una cita ────────────────────────────────────────
// Lo que se toca en Agenda, Cupos o Lista. Es el único lugar desde donde el
// admin libera una cita (antes estaba a un toque en cada fila). El
// sustanciador abre de aquí el acta y el informe para preparar la audiencia.
// Una cita de un día ya pasado no dice «Cita confirmada»: dice que ya pasó.
// Una audiencia pasada no se libera ni se reprograma (2026-11-04): liberar
// borraba la fecha de citación real de la visita; el servidor también lo rechaza.
function CitaHoja({ cita, hoyTxt, esAdmin, ocupado, onCerrar, onVerVisita, onLiberar, onDecretar, yaDecretada, onReprogramada }) {
  // Inspección al lugar decretada en la audiencia (2026-11-03): el caso queda
  // en «Por programar» de la Agenda › Inspecciones, sin fecha todavía.
  const [decreto, setDecreto] = useStateAU('');   // '' | 'enviando' | 'ok' | mensaje de error
  const [reprogramando, setReprogramando] = useStateAU(false);
  const c = cita;
  const dC = parsearFecha(c.fecha), dH = parsearFecha(hoyTxt);
  const pasada = !!(dC && dH && dC < dH);
  async function decretar() {
    // Es una escritura con consecuencias (el caso entra a «Por programar»):
    // se confirma, como «Liberar cita».
    const ok = await appConfirm('¿Decretar inspección al lugar para ' +
      (c.radicado ? 'el radicado ' + c.radicado : 'la orden ' + (c.ordenPolicia || '?')) + '?\n\n' +
      'El caso queda en «Por programar» de la Agenda › Inspecciones.',
      { titulo: 'Decretar inspección', btnOk: 'Sí, decretar', btnCancel: 'Cancelar' });
    if (!ok) return;
    setDecreto('enviando');
    try { await onDecretar(c); setDecreto('ok'); } catch (e) { setDecreto(e.message || 'No se pudo.'); }
  }
  return (
    <HojaAU titulo="Cita" clase="au-cita" onCerrar={onCerrar}>
      <div className={'au-pconf ' + (pasada ? 'pasada' : 'ok')}>
        <p className="est">{pasada ? 'Audiencia pasada' : '✓ Cita confirmada'}</p>
        <p className="f">{_auMayus(_auFechaLarga(c.fecha))}</p>
        <p className="h">{horaBonitaAudiencias(c.hora)}</p>
        <p className="s">{titleCaseNombre(c.sustanciador)}</p>
      </div>
      <dl className="au-cita-datos">
        <dt>Caso</dt><dd>{_auCaso(c)}{c.expediente && c.radicado ? ' · ' + c.radicado : ''}</dd>
        {c.citado && <><dt>Citado</dt><dd>{c.citado}{c.documentoCitado ? <> · {_auDocTxt(c)}</> : null}</dd></>}
        {c.direccion && <><dt>Dirección</dt><dd>{c.direccion}</dd></>}
        <dt>Pedida por</dt><dd>{titleCaseNombre(c.reservadoPor || '')}{c.reservadoEn ? ' · ' + String(c.reservadoEn).slice(0, 10) : ''}</dd>
        {c.nota && <><dt>Nota</dt><dd>{c.nota}</dd></>}
      </dl>
      <div className="au-cita-acc">
        {c.linkActa && <a className="btn-neutro" href={c.linkActa} target="_blank" rel="noopener">Acta</a>}
        {c.linkInforme && <a className="btn-neutro" href={c.linkInforme} target="_blank" rel="noopener">Informe</a>}
        {!c.sinVisita && <button type="button" className="btn-neutro" onClick={onVerVisita}>Ver visita</button>}
      </div>
      {onDecretar && !c.sinVisita && (
        decreto === 'ok' || yaDecretada
          ? <p className="au-decreto ok">Inspección al lugar en «Por programar» de la Agenda</p>
          : <>
              <button type="button" className="btn-neutro au-decreto-btn" disabled={decreto === 'enviando'} onClick={decretar}>
                {decreto === 'enviando' ? 'Enviando…' : 'Decretar inspección al lugar'}
              </button>
              {decreto && decreto !== 'enviando' && <p className="au-decreto error" role="alert">{decreto}</p>}
            </>
      )}
      {esAdmin && !pasada && (<>
        <button type="button" className="btn-neutro au-decreto-btn" disabled={ocupado}
          onClick={function () { setReprogramando(true); }}>Reprogramar</button>
        <button type="button" className="au-cita-liberar" disabled={ocupado} onClick={onLiberar}>Liberar cita</button>
      </>)}
      {reprogramando && (
        <ReprogramarHoja cita={c} onCerrar={function () { setReprogramando(false); }}
          onListo={function (r) { setReprogramando(false); onReprogramada(r); }} />
      )}
    </HojaAU>
  );
}

// ── «Cupos» como lista (2026-11-03) ──────────────────────────
// El chip «Cupos» dejó de ser la semana y pasó a la lista de la maqueta
// propuesta-cupos.html: resumen, filtros, agregar/bloquear/eliminar y
// selección múltiple. Solo el admin acciona; el supervisor ve la lista sin
// casillas ni acciones.
//
// El estado del cupo va con un punto de 10 px y su palabra, como las secciones
// del formulario y los entregables. Antes usaba los anillos de la visita y
// «Libre» llevaba el de «Completada» (círculo verde con ✓): se leía como «ya
// está hecho» cuando quiere decir «se puede pedir».
var _AU_ESTADOS_CUPOS = {
  POR_APARTAR: { texto: 'Por apartar' },
  RESERVADO:   { texto: 'Citado' },
  LIBRE:       { texto: 'Libre' },
  BLOQUEADO:   { texto: 'Bloqueado' },
};

function _auPluralCupo(n) { return n === 1 ? 'cupo' : 'cupos'; }

// Copia al portapapeles; si el portapapeles falla, el texto sale en una hoja
// para copiarlo a mano. La usan todas las copias de la pantalla.
async function _auCopiarConRespaldo(texto, titulo) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch (e) {
    await appAlert(texto.replace(/\t/g, ' · '), { titulo: titulo || 'Copiar' });
    return false;
  }
}

// 'yyyy-mm-dd' del input date → 'dd/mm/yyyy' de la BD.
function _auIsoADdmmaaaa(iso) {
  return String(iso || '').split('-').reverse().join('/');
}

// Hoja «Agregar cupos»: rango, días, horas y sustanciadores, con la vista
// previa calculada en el cliente (previsualizarCupos, utils.js).
function AgregarCuposHoja({ existentes, sustanciadores, hoy, onCerrar, onListo }) {
  const [desde, setDesde] = useStateAU('');
  const [hasta, setHasta] = useStateAU('');
  const [dias, setDias] = useStateAU({ 1: true, 2: true, 3: true, 4: true, 5: true });
  const [horas, setHoras] = useStateAU({ '9:00AM': true, '2:00PM': true });
  const [otra, setOtra] = useStateAU(false);
  const [otraHora, setOtraHora] = useStateAU('10:30');
  const [susts, setSusts] = useStateAU(null);   // null = todos marcados
  const [enviando, setEnviando] = useStateAU(false);
  const [error, setError] = useStateAU('');

  const sustElegidos = susts === null
    ? sustanciadores.map(function (s) { return s.nombre; })
    : Object.keys(susts);

  // «Otra hora» cuenta como hora: antes se exigía 9:00 o 2:00 marcada y no se
  // podía crear un cupo solo a otra hora (horasAgregarCupos, utils.js).
  const sel = {
    desde: _auIsoADdmmaaaa(desde),
    hasta: _auIsoADdmmaaaa(hasta),
    dias: Object.keys(dias).map(Number),
    horas: horasAgregarCupos(Object.keys(horas), otra, otraHora),
    sustanciadores: sustElegidos
  };
  const problema = problemaSeleccionCupos(sel);
  const incompleto = !!problema;
  // Sin selección válida no se calcula: un rango de años recorría miles de
  // cupos en cada pulsación.
  const prev = useMemoAU(function () {
    return incompleto ? { crear: [], omitidos: [] } : previsualizarCupos(existentes, sel, hoy);
  }, [existentes, incompleto, sel.desde, sel.hasta, sel.dias.join(), sel.horas.join(), sel.sustanciadores.join()]);
  const porMotivo = {};
  prev.omitidos.forEach(function (o) { porMotivo[o.motivo] = (porMotivo[o.motivo] || 0) + 1; });
  // El servidor acepta hasta 400 por pedido (problemaCantidadCupos, utils.js).
  const exceso = incompleto ? '' : problemaCantidadCupos(prev.crear.length);

  async function confirmar() {
    if (incompleto || exceso || !prev.crear.length || enviando) return;
    setEnviando(true); setError('');
    try {
      const r = await agregarCuposAudiencias(prev.crear);
      setEnviando(false);
      onListo(r);
    } catch (e) {
      setError(e.message || 'No se pudieron crear los cupos.'); setEnviando(false);
    }
  }

  const alternar = function (setter, clave) {
    setter(function (d) { const n = Object.assign({}, d); if (n[clave]) delete n[clave]; else n[clave] = true; return n; });
  };

  return (
    <HojaAU titulo="Agregar cupos" onCerrar={onCerrar}>
      <div className="au-cl-campo">
        <label htmlFor="au-cl-desde">Desde</label>
        <input id="au-cl-desde" type="date" value={desde} onChange={function (e) { setDesde(e.target.value); }} />
      </div>
      <div className="au-cl-campo">
        <label htmlFor="au-cl-hasta">Hasta</label>
        <input id="au-cl-hasta" type="date" value={hasta} onChange={function (e) { setHasta(e.target.value); }} />
      </div>
      <div className="au-cl-campo">
        <span>Días de la semana</span>
        <div className="au-cl-chips">
          {[[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V']].map(function (p) {
            return <ChipAU key={'dia' + p[0]} on={!!dias[p[0]]} onClick={function () { alternar(setDias, p[0]); }}>{p[1]}</ChipAU>;
          })}
        </div>
      </div>
      <div className="au-cl-campo">
        <span>Horas</span>
        <div className="au-cl-chips">
          {[['9:00AM', '9:00 a. m.'], ['2:00PM', '2:00 p. m.']].map(function (p) {
            return <ChipAU key={'hora' + p[0]} on={!!horas[p[0]]} onClick={function () { alternar(setHoras, p[0]); }}>{p[1]}</ChipAU>;
          })}
          <ChipAU on={otra} onClick={function () { setOtra(!otra); }}>Otra hora</ChipAU>
        </div>
      </div>
      {otra && (
        <div className="au-cl-campo">
          <label htmlFor="au-cl-otra">Hora nueva</label>
          <input id="au-cl-otra" type="time" value={otraHora} onChange={function (e) { setOtraHora(e.target.value); }} />
        </div>
      )}
      <div className="au-cl-campo">
        <span>Sustanciadores</span>
        <div className="au-cl-chips">
          {sustanciadores.map(function (s) {
            return <ChipAU key={'sust' + s.norm} on={susts === null || !!susts[s.nombre]} onClick={function () {
              setSusts(function (prev0) {
                const actuales = prev0 === null
                  ? sustanciadores.map(function (x) { return x.nombre; })
                  : Object.keys(prev0);
                const n = {};
                let hay = false;
                actuales.forEach(function (x) { if (x === s.nombre) hay = true; else n[x] = true; });
                if (!hay) n[s.nombre] = true;
                return n;
              });
            }}>{titleCaseNombre(s.nombre)}</ChipAU>;
          })}
        </div>
      </div>
      <div className="au-cl-pre">
        {incompleto || exceso ? (
          <p className="au-cl-err">{problema || exceso}</p>
        ) : (
          <p>
            {'Se crean '}<b>{prev.crear.length}</b>{' ' + _auPluralCupo(prev.crear.length)}
            {porMotivo['ya existe'] ? ' · ' + porMotivo['ya existe'] +
              (porMotivo['ya existe'] === 1 ? ' ya existe (se omite)' : ' ya existen (se omiten)') : null}
            {porMotivo.festivo ? ' · ' + porMotivo.festivo +
              (porMotivo.festivo === 1 ? ' cae en festivo (se omite)' : ' caen en festivo (se omiten)') : null}
            {(porMotivo['fecha pasada'] || porMotivo['fin de semana']) ? ' · ' +
              ((porMotivo['fecha pasada'] || 0) + (porMotivo['fin de semana'] || 0)) + ' fuera de rango o fin de semana (se omiten)' : null}
          </p>
        )}
      </div>
      {error && <p className="au-cl-err">{error}</p>}
      <div className="au-cl-acc">
        <button type="button" className="btn-principal btn-chico"
          disabled={incompleto || !!exceso || !prev.crear.length || enviando} onClick={confirmar}>
          {enviando ? 'Creando…' : (incompleto ? 'Crear cupos' : 'Crear ' + prev.crear.length + ' ' + _auPluralCupo(prev.crear.length))}
        </button>
        <button type="button" className="au-cl-texto" onClick={onCerrar}>Volver</button>
      </div>
    </HojaAU>
  );
}

var _AU_MOTIVOS_BLOQUEO = ['Vacaciones', 'Comisión', 'Capacitación', 'Festivo local'];

// Hoja «Bloquear» (una sola para los dos casos): los cupos elegidos
// (bloquearCuposAudiencias) o, con `fecha`, el día entero para todos los
// sustanciadores (novedad TODOS/DIA). Motivo obligatorio y aviso de las
// citaciones que caen ahí: no se cancelan.
// `sinBloquear`: los marcados que no se pueden bloquear (por apartar): se dice
// cuántos en vez de mandarlos y que el servidor los rechace en silencio.
function BloquearHoja({ cupos, fecha, citados, sinBloquear, onCerrar, onListo }) {
  const [motivo, setMotivo] = useStateAU('');
  const [enviando, setEnviando] = useStateAU(false);
  const [error, setError] = useStateAU('');
  const deDia = !!fecha;
  const nada = !deDia && !cupos.length;
  async function confirmar() {
    if (!motivo.trim() || enviando) return;
    setEnviando(true); setError('');
    try {
      let r = null;
      if (deDia) {
        r = await guardarNovedadAudiencias({ desde: fecha, hasta: fecha, sustanciador: 'TODOS', franja: 'DIA', motivo: motivo.trim() });
      } else {
        r = await bloquearCuposAudiencias(cupos.map(function (c) { return c.idCupo; }), motivo.trim());
      }
      setEnviando(false);
      onListo(r);
    } catch (e) {
      setError(e.message || (deDia ? 'No se pudo bloquear el día.' : 'No se pudieron bloquear los cupos.'));
      setEnviando(false);
    }
  }
  return (
    <HojaAU titulo={deDia ? 'Bloquear el día' : 'Bloquear'} onCerrar={onCerrar}>
      {nada ? <p className="au-cl-info">No hay cupos por bloquear en esa selección{sinBloquear ? ' (los por apartar no se bloquean)' : ''}.</p> : (<>
        {deDia ? <p className="au-cl-info"><b>{_auMayus(_auFechaLarga(fecha))}</b></p> : (<>
          <p className="au-cl-info">Se bloquean <b>{cupos.length}</b> {_auPluralCupo(cupos.length)}:</p>
          <div className="au-cl-lineas">
            {cupos.map(function (c) {
              return <div key={c.idCupo}>{c.fecha} · {horaBonitaAudiencias(c.hora)} · {titleCaseNombre(c.sustanciador)}</div>;
            })}
          </div>
        </>)}
        {citados.length > 0 && (
          <p className="au-cl-err"><b>{citados.length} citaci{citados.length === 1 ? 'ón cae' : 'ones caen'} en {deDia ? 'ese día' : 'esos días'}.</b> No se cancelan.</p>
        )}
        {sinBloquear > 0 && (
          <p className="au-cl-info">{sinBloquear} por apartar no se {sinBloquear === 1 ? 'bloquea' : 'bloquean'}: confírmalos en el Excel o elimínalos.</p>
        )}
        <div className="au-cl-campo">
          <span>Motivo (obligatorio)</span>
          <div className="au-cl-chips">
            {_AU_MOTIVOS_BLOQUEO.map(function (m) {
              return <ChipAU key={m} on={motivo === m} onClick={function () { setMotivo(m); }}>{m}</ChipAU>;
            })}
          </div>
          <input type="text" placeholder="Escribe el motivo" aria-label="Motivo" value={motivo}
            onChange={function (e) { setMotivo(e.target.value); }} />
        </div>
        {error && <p className="au-cl-err">{error}</p>}
      </>)}
      <div className="au-cl-acc">
        {!nada && (
          <button type="button" className="btn-principal btn-chico" disabled={!motivo.trim() || enviando} onClick={confirmar}>
            {enviando ? 'Bloqueando…' : 'Bloquear'}
          </button>
        )}
        <button type="button" className="au-cl-texto" onClick={onCerrar}>Volver</button>
      </div>
    </HojaAU>
  );
}

// Hoja «Eliminar»: confirma; si alguno era libre (ya en el Excel), recuerda
// liberarlo allá con «Copiar lista».
function EliminarCuposHoja({ cupos, onCerrar, onListo }) {
  const [enviando, setEnviando] = useStateAU(false);
  const [error, setError] = useStateAU('');
  const [copiado, setCopiado] = useStateAU(false);
  const nLibres = cupos.filter(function (c) { return c.estado === 'LIBRE'; }).length;
  const tsv = cupos.map(function (c) {
    return c.fecha + '\t' + horaBonitaAudiencias(c.hora) + '\t' + titleCaseNombre(c.sustanciador);
  }).join('\n');
  async function confirmar() {
    if (enviando) return;
    setEnviando(true); setError('');
    try {
      const r = await eliminarCuposAudiencias(cupos.map(function (c) { return c.idCupo; }));
      setEnviando(false);
      onListo(r);
    } catch (e) {
      setError(e.message || 'No se pudieron eliminar los cupos.'); setEnviando(false);
    }
  }
  async function copiar() {
    const ok = await _auCopiarConRespaldo(tsv, 'Cupos para liberar en el Excel');
    if (ok) setCopiado(true);
  }
  return (
    <HojaAU titulo={cupos.length > 1 ? 'Eliminar cupos' : 'Eliminar cupo'} onCerrar={onCerrar}>
      <p className="au-cl-info">{cupos.length > 1 ? 'Los turnos dejan de existir.' : 'El turno deja de existir.'}</p>
      <div className="au-cl-lineas">
        {cupos.map(function (c) {
          return <div key={c.idCupo}>{c.fecha} · {horaBonitaAudiencias(c.hora)} · {titleCaseNombre(c.sustanciador)}</div>;
        })}
      </div>
      {nLibres > 0 && (
        <p className="au-cl-info"><b>{nLibres === 1
          ? 'Uno ya estaba apartado en el Excel: libéralo también allá.'
          : nLibres + ' ya estaban apartados en el Excel: libéralos también allá.'}</b></p>
      )}
      {error && <p className="au-cl-err">{error}</p>}
      <div className="au-cl-acc">
        <button type="button" className="btn-principal btn-chico" disabled={enviando} onClick={confirmar}>
          {enviando ? 'Eliminando…' : 'Eliminar'}
        </button>
        {nLibres > 0 && <button type="button" className="au-cl-texto" onClick={copiar}>{copiado ? '✓ Copiado' : 'Copiar lista'}</button>}
        <button type="button" className="au-cl-texto" onClick={onCerrar}>Volver</button>
      </div>
    </HojaAU>
  );
}

// ── Hoja «Días sin audiencias» (admin y supervisor) ──────────────
// Las novedades por rango, sustanciador y franja. El admin la abre desde la
// vista Cupos, junto a los demás bloqueos; el supervisor, desde la cabecera.
// `onGuardar(payload)` devuelve las citaciones afectadas, o null si falló.
// El admin reprograma desde aquí cada citación que cae en la novedad (antes
// solo se listaban «para reprogramar a mano»).
function NovedadesHoja({ mias, esAdmin, usuario, sustanciadores, ocupado, onCerrar, onQuitar, onGuardar, onReprogramada }) {
  const [abierto, setAbierto] = useStateAU(false);
  const [afectadas, setAfectadas] = useStateAU(null);
  const [reprogramar, setReprogramar] = useStateAU(null);  // la afectada que se reprograma
  const [hechas, setHechas] = useStateAU({});              // idCupo → cupo nuevo

  async function guardar(ev) {
    ev.preventDefault();
    if (ocupado) return;
    const form = ev.target;
    const payload = {
      desde: _auIsoADdmmaaaa(form['au-nv-desde'].value),
      hasta: _auIsoADdmmaaaa(form['au-nv-hasta'].value),
      sustanciador: esAdmin ? form['au-nv-sus'].value : usuario.usuario,
      franja: form['au-nv-franja'].value,
      motivo: form['au-nv-motivo'].value.trim()
    };
    if (!payload.desde || payload.desde.length < 8) { await appAlert('Falta la fecha inicial.', { tono: 'error' }); return; }
    if (!payload.hasta || payload.hasta.length < 8) { await appAlert('Falta la fecha final.', { tono: 'error' }); return; }
    const af = await onGuardar(payload);
    if (af) { setAfectadas(af); setAbierto(false); }
  }

  return (
    <HojaAU titulo="Días sin audiencias" clase="au-hoj-nov" onCerrar={onCerrar}>
      {!mias.length && <p className="au-vacio-hoy">Sin novedades.</p>}
      {mias.map(function (n) {
        return (
          <div className="au-nov" key={n.id}>
            <div className="au-nov-t">
              <b>{n.sustanciador === 'TODOS' ? 'Todos' : titleCaseNombre(n.sustanciador)}</b> · {n.desde}{n.hasta !== n.desde ? ' – ' + n.hasta : ''} · {n.franja === 'DIA' ? 'Todo el día' : n.franja}
              <small>{n.motivo}</small>
            </div>
            <button type="button" className="au-x" aria-label={'Quitar novedad de ' + n.sustanciador}
              disabled={ocupado} onClick={function () { onQuitar(n); }}>×</button>
          </div>
        );
      })}
      {!abierto && <button type="button" className="au-mas" onClick={function () { setAbierto(true); setAfectadas(null); }}>+ Agregar</button>}
      {abierto && (
        <form className="au-form on" onSubmit={guardar}>
          <div className="fila">
            <div>
              <label htmlFor="au-nv-sus">Sustanciador</label>
              {esAdmin ? (
                <select id="au-nv-sus" defaultValue="TODOS">
                  <option value="TODOS">Todos</option>
                  {sustanciadores.map(function (s) { return <option key={s.norm} value={s.nombre}>{titleCaseNombre(s.nombre)}</option>; })}
                </select>
              ) : <input id="au-nv-sus" type="text" defaultValue={usuario.usuario} disabled />}
            </div>
            <div>
              <label htmlFor="au-nv-franja">Franja</label>
              <select id="au-nv-franja" defaultValue="DIA">
                <option value="DIA">Todo el día</option>
                <option value="AM">Mañana</option>
                <option value="PM">Tarde</option>
              </select>
            </div>
          </div>
          <div className="fila">
            <div><label htmlFor="au-nv-desde">Desde</label><input id="au-nv-desde" type="date" required /></div>
            <div><label htmlFor="au-nv-hasta">Hasta</label><input id="au-nv-hasta" type="date" required /></div>
          </div>
          <div><label htmlFor="au-nv-motivo">Motivo</label><input id="au-nv-motivo" type="text" placeholder="Vacaciones, jornada…" /></div>
          <div className="botones">
            <button type="button" className="btn-neutro btn-chico" onClick={function () { setAbierto(false); }}>Cancelar</button>
            <button type="submit" className="btn-accion btn-chico" disabled={ocupado}>Guardar novedad</button>
          </div>
        </form>
      )}
      {afectadas && !!afectadas.length && (
        <div className="au-aviso">
          <b>{afectadas.length} citaci{afectadas.length === 1 ? 'ón cae' : 'ones caen'} en esos días</b>
          <ul>
            {afectadas.slice(0, 10).map(function (c) {
              const nueva = hechas[c.idCupo];
              return (
                <li key={c.idCupo}>{c.fecha} · {horaBonitaAudiencias(c.hora)} · {titleCaseNombre(c.sustanciador)} · {_auCaso(c)}{c.citado ? ' · ' + c.citado : ''}
                  {nueva
                    ? <b className="au-afect-ok"> → {nueva.fecha} · {horaBonitaAudiencias(nueva.hora)}</b>
                    : esAdmin && <> <button type="button" className="au-cl-texto" onClick={function () { setReprogramar(c); }}>Reprogramar</button></>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {reprogramar && (
        <ReprogramarHoja cita={reprogramar} onCerrar={function () { setReprogramar(null); }}
          onListo={function (r) {
            const id = reprogramar.idCupo;
            setHechas(function (h) { const n = Object.assign({}, h); n[id] = (r && r.cupo) || {}; return n; });
            setReprogramar(null);
            onReprogramada(r);
          }} />
      )}
    </HojaAU>
  );
}

// ── Vista Agenda (arquitectura 2026-10-27, punto 5) ──
// Une «Hoy» y «Programadas»: de hoy en adelante, un grupo por día con
// audiencias, hoy arriba (si no hay hoy, arranca en el siguiente día con
// audiencias). Las dos fuentes, como la vieja «Hoy»: los cupos del bloque
// (traen sustanciador) y las citas anotadas en FECHA CITACION de la visita
// (sin sustanciador: no se inventa). Nada se reubica en «hoy».
// `sinInspector`: en «Mis citas» el inspector es quien mira, no se repite.
// `decreto(r, fecha)`: el botón «Decretar inspección» de la fila (o null).
function VistaAgenda({ dias, hoyTxt, filtroSus, sinInspector, clicableCita, onAbrirCita, decreto }) {
  if (!dias.length) return <p className="au-vacio-hoy">Sin audiencias de hoy en adelante</p>;
  function fila(r, clave, fecha) {
    const clicable = r.fuente === 'bloque' ? clicableCita(r.cupo) : !!(r.fila && window.abrirVisitaDetail);
    const Tag = clicable ? 'button' : 'div';
    const alClic = !clicable ? undefined : (r.fuente === 'bloque'
      ? function () { onAbrirCita(r.cupo); }
      : function () { window.abrirVisitaDetail(r.fila); });
    const sub = [r.direccion, sinInspector ? '' : _auInsp(r.inspector), filtroSus ? '' : _auSust(r.sustanciador)];
    const dec = decreto ? decreto(r, fecha) : null;
    return (
      <div className={'au-row' + (dec ? ' au-row-dec' : '')} key={clave}>
        <span className="hora">{r.hora ? horaBonitaAudiencias(r.hora) : 'Sin hora'}</span>
        <Tag className="t" type={clicable ? 'button' : undefined} onClick={alClic}>
          <b>{r.citado || _auCaso(r.caso)}</b>{r.citado ? <> · {_auCaso(r.caso)}</> : null}
          <small>{sub.filter(Boolean).join(' · ')}</small>
        </Tag>
        {dec && <span className="au-dec">{dec}</span>}
      </div>
    );
  }
  return (
    <div>
      {dias.map(function (g) {
        return (
          <div className={'au-grupo' + (g.fecha === hoyTxt ? ' hoy' : '')} key={g.fecha}>
            <h2>{g.fecha === hoyTxt ? 'Hoy · ' : ''}{_auMayus(_auFechaLarga(g.fecha))}
              <span className="au-grupo-n"> · {g.citas.length} audiencia{g.citas.length === 1 ? '' : 's'}</span></h2>
            {g.citas.map(function (r, i) { return fila(r, g.fecha + i, g.fecha); })}
          </div>
        );
      })}
    </div>
  );
}

// ── Vista Cupos (2026-11-03): la lista de la maqueta propuesta-cupos.html ──
// Dueña de sus filtros, su selección y sus hojas: al salir de la vista todo
// eso se descarta solo. Las escrituras de un toque pasan por `escribir` de la
// pantalla (ocupado + aviso de error + recarga); las hojas escriben por su
// cuenta y al terminar llaman `onCambio` (recargar).
// En el celular las filas libres no traen «Bloquear»/«Eliminar»: se marcan y
// se usa la barra de abajo (cada cupo eran tres renglones de botones).
function VistaCupos({ datos, novedades, esAdmin, hoyTxt, filtroSus, sustanciadores, ocupado,
  escribir, onCambio, onAbrirCita, onAbrirNovedades }) {
  const [fMes, setFMes] = useStateAU('todos');        // 'todos' | 'YYYY-MM'
  const [fEstado, setFEstado] = useStateAU('todos');  // 'todos' | estado del cupo
  const [filtrosAbiertos, setFiltrosAbiertos] = useStateAU(false);
  const [sel, setSel] = useStateAU({});               // idCupo → true
  const [hoja, setHoja] = useStateAU(null);           // {t:'agregar'} | {t:'bloquear'|'eliminar', ids} | {t:'dia', fecha}
  const [copiadoApartar, setCopiadoApartar] = useStateAU(false);
  const cupos = datos.cupos || [];

  // Solo de hoy en adelante: la agenda trae también las pasadas para la Lista,
  // y un cupo pasado ya no se agrega, bloquea ni elimina.
  const futuros = useMemoAU(function () {
    const hoyD = parsearFecha(hoyTxt);
    return cupos.filter(function (c) {
      const d = parsearFecha(c.fecha);
      return !d || !hoyD || d >= hoyD;
    });
  }, [cupos, hoyTxt]);

  // Meses con cupos para el filtro («abril 2027»…).
  const meses = useMemoAU(function () {
    const vistos = {}; const out = [];
    futuros.forEach(function (c) {
      const d = parsearFecha(c.fecha);
      if (!d) return;
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (vistos[k]) return;
      vistos[k] = 1;
      out.push({ k: k, d: d, txt: _AU_MESES[d.getMonth()] + ' ' + d.getFullYear() });
    });
    return out.sort(function (a, b) { return a.d - b.d; });
  }, [futuros]);

  // Lo que se ve con los filtros de ahora. La barra de selección actúa solo
  // sobre esto (seleccionCuposVisible).
  const visibles = useMemoAU(function () {
    return filtrarCuposLista(futuros, {
      mes: fMes === 'todos' ? '' : fMes,
      estado: fEstado === 'todos' ? '' : fEstado,
      sustanciador: filtroSus
    });
  }, [futuros, fMes, fEstado, filtroSus]);

  const res = resumenCuposLista(visibles);
  const porDia = [];
  const porFecha = {};
  visibles.forEach(function (c) {
    if (!porFecha[c.fecha]) { porFecha[c.fecha] = []; porDia.push(c.fecha); }
    porFecha[c.fecha].push(c);
  });
  const porApartar = cupos.filter(function (c) { return c.estado === 'POR_APARTAR'; });
  const nFiltros = (fMes !== 'todos' ? 1 : 0) + (fEstado !== 'todos' ? 1 : 0);
  const selLista = seleccionCuposVisible(sel, visibles);
  const selIds = selLista.map(function (c) { return c.idCupo; });
  const selCitados = selLista.filter(function (c) { return c.estado === 'RESERVADO'; });
  const porId = function (ids) {
    return ids.map(function (id) { return cupos.find(function (c) { return c.idCupo === id; }); }).filter(Boolean);
  };
  const hojaCupos = hoja && hoja.ids ? porId(hoja.ids) : [];

  // Lo que el servidor no bloqueó o no eliminó, con el motivo en palabras
  // (textoRechazoCupo). Antes se ignoraba y el admin creía que había quedado.
  function avisarRechazados(r, accion) {
    const rech = (r && r.rechazados) || [];
    if (!rech.length) return;
    const lista = rech.slice(0, 10).map(function (x) {
      const c = cupos.find(function (k) { return k.idCupo === x.idCupo; });
      return (c ? c.fecha + ' · ' + horaBonitaAudiencias(c.hora) + ' · ' + titleCaseNombre(c.sustanciador) : x.idCupo) +
        ': ' + textoRechazoCupo(x.motivo);
    }).join('\n');
    appAlert(lista + (rech.length > 10 ? '\n…' : ''),
      { titulo: rech.length + ' ' + _auPluralCupo(rech.length) + ' sin ' + accion, tono: 'error' });
  }

  function alListo(accion) {
    return function (r) { setHoja(null); setSel({}); avisarRechazados(r, accion); onCambio(); };
  }

  // Desbloquear = quitar la novedad que bloquea esos cupos (puede abarcar
  // muchos); el texto dice cuál se quita y cuántos cupos libera.
  async function desbloquear(c) {
    if (ocupado) return;
    const nov = novedades.find(function (n) { return String(n.id) === String(c.novedadId); });
    if (!nov) {
      await appAlert('Este bloqueo no tiene una novedad asociada: no se puede quitar desde aquí.', { tono: 'error' });
      return;
    }
    const n = cupos.filter(function (x) { return String(x.novedadId) === String(nov.id); }).length;
    const ok = await appConfirm(
      'Quita el bloqueo «' + (nov.motivo || '') + '» de ' +
      (nov.sustanciador === 'TODOS' ? 'todos' : titleCaseNombre(nov.sustanciador)) +
      ' del ' + nov.desde + (nov.hasta !== nov.desde ? ' al ' + nov.hasta : '') + ': ' +
      n + ' cupo' + (n === 1 ? '' : 's') + '.',
      { titulo: 'Desbloquear', btnOk: 'Sí, desbloquear', btnCancel: 'Cancelar' });
    if (!ok) return;
    await escribir(function () { return desactivarNovedadAudiencias(nov.id); }, 'No se pudo quitar el bloqueo');
  }

  // «Copiar lista para el Excel» del aviso de por apartar: una fila por cupo,
  // fecha, hora y sustanciador separados por tabulador.
  async function copiarApartar() {
    const tsv = porApartar
      .map(function (c) { return c.fecha + '\t' + horaBonitaAudiencias(c.hora) + '\t' + titleCaseNombre(c.sustanciador); })
      .join('\n');
    const ok = await _auCopiarConRespaldo(tsv, 'Cupos por apartar');
    if (ok) {
      setCopiadoApartar(true);
      setTimeout(function () { setCopiadoApartar(false); }, 2500);
    }
  }

  async function confirmarApartar() {
    if (ocupado) return;
    const ids = porApartar.map(function (c) { return c.idCupo; });
    const ok = await appConfirm('¿Ya apartaste los ' + ids.length + ' cupos en el Excel del despacho?',
      { titulo: 'Apartar cupos', btnOk: 'Sí, ya los aparté', btnCancel: 'Cancelar' });
    if (!ok) return;
    await escribir(async function () {
      const r = await confirmarCuposAudiencias(ids);
      const nc = (r.noConfirmados || []).length;
      if (nc) await appAlert('El servidor no confirmó ' + nc + ' cupo' + (nc === 1 ? '' : 's') +
        ' (ya no estaban por apartar).', { tono: 'error' });
    }, 'No se pudieron confirmar los cupos');
  }

  // Lo que el servidor omitió al crear cupos (ya existían, festivo…).
  function avisarOmitidos(r) {
    const om = (r && r.omitidos) || [];
    if (!om.length) return;
    const lista = om.slice(0, 10).map(function (o) {
      return o.fecha + ' · ' + horaBonitaAudiencias(o.hora) + ' · ' + titleCaseNombre(o.sustanciador) +
        (o.motivo ? ' (' + o.motivo + ')' : '');
    }).join('\n');
    appAlert(lista + (om.length > 10 ? '\n…' : ''),
      { titulo: 'El servidor omitió ' + om.length + ' cupo' + (om.length === 1 ? '' : 's') });
  }

  // Acciones de una fila. «lote» = las que también están en la barra de
  // selección: en el celular se esconden y se usan desde la barra.
  function acciones(c) {
    const btn = function (txt, fn, lote) {
      return (
        <button type="button" key={txt} className={'btn-neutro btn-chico au-cl-act-btn' + (lote ? ' au-cl-act-lote' : '')}
          onClick={fn}>{txt}</button>
      );
    };
    if (c.estado === 'LIBRE') return [
      btn('Bloquear', function () { setHoja({ t: 'bloquear', ids: [c.idCupo] }); }, true),
      btn('Eliminar', function () { setHoja({ t: 'eliminar', ids: [c.idCupo] }); }, true)];
    if (c.estado === 'POR_APARTAR') return [btn('Eliminar', function () { setHoja({ t: 'eliminar', ids: [c.idCupo] }); }, true)];
    if (c.estado === 'RESERVADO') return [btn('Ver cita', function () { onAbrirCita(c); })];
    if (c.estado === 'BLOQUEADO') return [btn('Desbloquear', function () { desbloquear(c); })];
    return null;
  }

  function fila(c) {
    const E = _AU_ESTADOS_CUPOS[c.estado] || { texto: c.estado };
    const on = !!sel[c.idCupo];
    const soloLote = c.estado === 'LIBRE' || c.estado === 'POR_APARTAR';
    // _auCaso puede devolver la etiqueta del expediente (JSX): se intercala con
    // « · », no con join, que la volvía «[object Object]».
    const det = c.estado === 'RESERVADO'
      ? [_auCaso(c), c.citado, _auInsp(c.reservadoPor)].filter(Boolean)
          .map(function (p, i) { return <React.Fragment key={i}>{i ? ' · ' : ''}{p}</React.Fragment>; })
      : c.estado === 'BLOQUEADO' ? (c.motivoBloqueo || '') : '';
    return (
      <div className={'au-cl-cupo' + (on ? ' sel' : '')} key={c.idCupo}>
        {esAdmin && (
          <label className="au-cl-sel">
            <input type="checkbox" checked={on}
              aria-label={'Seleccionar ' + c.fecha + ', ' + horaBonitaAudiencias(c.hora) + ', ' + titleCaseNombre(c.sustanciador)}
              onChange={function () {
                setSel(function (prev) {
                  const n = Object.assign({}, prev);
                  if (n[c.idCupo]) delete n[c.idCupo]; else n[c.idCupo] = true;
                  return n;
                });
              }} />
          </label>
        )}
        <span className="au-cl-hora">{horaBonitaAudiencias(c.hora)}</span>
        <span className="au-cl-sust">{titleCaseNombre(c.sustanciador)}</span>
        <span className="au-cl-estado"><span className={'au-cl-punto ' + String(c.estado || '').toLowerCase()} aria-hidden="true"></span><b>{E.texto}</b></span>
        <span className="au-cl-det">{det}</span>
        {esAdmin && <div className={'au-cl-act' + (soloLote ? ' solo-lote' : '')}>{acciones(c)}</div>}
      </div>
    );
  }

  return (
    <div className={(esAdmin ? '' : 'au-cl-sinadm') + (selIds.length ? ' au-cl-con-barra' : '')}>
      <p className="au-cl-resumen">
        <b>{res.libres}</b> {res.libres === 1 ? 'libre' : 'libres'} · <b>{res.citados}</b> {res.citados === 1 ? 'citado' : 'citados'} ·
        {' '}<b>{res.bloqueados}</b> {res.bloqueados === 1 ? 'bloqueado' : 'bloqueados'}
        {res.porApartar > 0 && <> · <b>{res.porApartar}</b> por apartar</>}
        {res.hasta && <> · hasta el {res.hasta}</>}
      </p>
      <div className="au-cl-fila">
        <div className={'au-cl-filtros' + (filtrosAbiertos ? ' abierta' : '')} id="au-cl-filtros">
          <span className="au-cl-filtro" role="group" aria-label="Mes">
            <span>Mes</span>
            <ChipAU on={fMes === 'todos'} onClick={function () { setFMes('todos'); }}>Todos</ChipAU>
            {meses.map(function (m) { return <ChipAU key={m.k} on={fMes === m.k} onClick={function () { setFMes(m.k); }}>{m.txt}</ChipAU>; })}
          </span>
          <span className="au-cl-filtro" role="group" aria-label="Estado">
            <span>Estado</span>
            <ChipAU on={fEstado === 'todos'} onClick={function () { setFEstado('todos'); }}>Todos</ChipAU>
            {[['POR_APARTAR', 'Por apartar'], ['LIBRE', 'Libre'], ['RESERVADO', 'Citado'], ['BLOQUEADO', 'Bloqueado']]
              .map(function (p) { return <ChipAU key={p[0]} on={fEstado === p[0]} onClick={function () { setFEstado(p[0]); }}>{p[1]}</ChipAU>; })}
          </span>
        </div>
        <button type="button" className="au-chip au-cl-btn-filtros" aria-expanded={filtrosAbiertos ? 'true' : 'false'}
          aria-controls="au-cl-filtros" onClick={function () { setFiltrosAbiertos(!filtrosAbiertos); }}>
          {nFiltros ? 'Filtros · ' + nFiltros : 'Filtros'}
        </button>
        {esAdmin && (
          <span className="au-cl-gestion">
            <button type="button" className="btn-neutro btn-chico au-btn-nov" aria-haspopup="dialog" onClick={onAbrirNovedades}>
              <Icon.Admin size={14} aria-hidden="true" />
              <span>Días sin audiencias{datos.novedadesActivas ? ' · ' + datos.novedadesActivas : ''}</span>
            </button>
            {/* En tinte: el único botón lleno de la pantalla es «Pedir cita». */}
            <button type="button" className="btn-neutro btn-chico au-cl-agregar" onClick={function () { setHoja({ t: 'agregar' }); }}>
              Agregar cupos
            </button>
          </span>
        )}
      </div>
      {esAdmin && porApartar.length > 0 && (
        <div className="au-cl-aviso">
          <span className="au-cl-aviso-txt">
            <b>{porApartar.length} {_auPluralCupo(porApartar.length)} por apartar en el Excel.</b> Hasta confirmarlos, nadie puede pedirlos.
          </span>
          <span className="au-cl-aviso-btn">
            <button type="button" className="btn-neutro btn-chico" disabled={ocupado} onClick={copiarApartar}>
              {copiadoApartar ? '✓ Copiado' : 'Copiar lista para el Excel'}
            </button>
            <button type="button" className="btn-neutro btn-chico" disabled={ocupado} onClick={confirmarApartar}>Ya los aparté</button>
          </span>
        </div>
      )}
      {esAdmin && visibles.length > 0 && <p className="au-cl-pista">Marca los cupos para bloquearlos o eliminarlos.</p>}
      {!visibles.length && <p className="au-vacio-hoy">No hay cupos con esos filtros.</p>}
      {porDia.map(function (fecha) {
        const dia = porFecha[fecha];
        // El conteo dice todos los estados de lo que se ve. «Bloquear el día»
        // bloquea a todos los sustanciadores: mira el día entero y no sale si
        // ya no queda ningún cupo que pedir (resumenDiaCupos, puedeBloquearDiaCupos).
        const diaEntero = cupos.filter(function (c) { return c.fecha === fecha; });
        return (
          <div className="au-cl-dia" key={fecha}>
            <div className="au-cl-dia-cab">
              <h2>{_auMayus(_auFechaLarga(fecha))}</h2>
              <span className="au-cl-dia-n">{resumenDiaCupos(dia)}</span>
              {esAdmin && puedeBloquearDiaCupos(diaEntero) && (
                <button type="button" className="au-cl-texto" onClick={function () { setHoja({ t: 'dia', fecha: fecha }); }}>
                  Bloquear el día
                </button>
              )}
            </div>
            {dia.map(fila)}
          </div>
        );
      })}

      {selIds.length > 0 && (
        <div className="au-cl-barra" role="region" aria-label="Cupos seleccionados">
          <span className="au-cl-barra-cuenta">{selIds.length} {selIds.length === 1 ? 'seleccionado' : 'seleccionados'}</span>
          {selCitados.length > 0 && (
            <span className="au-cl-ignora">{selCitados.length} {selCitados.length === 1 ? 'citado se ignora' : 'citados se ignoran'}</span>
          )}
          <span className="au-cl-barra-acc">
            <button type="button" className="btn-neutro" onClick={function () { setHoja({ t: 'bloquear', ids: selIds }); }}>Bloquear</button>
            <button type="button" className="btn-neutro" onClick={function () { setHoja({ t: 'eliminar', ids: selIds }); }}>Eliminar</button>
            <button type="button" className="au-cl-texto" onClick={function () { setSel({}); }}>Quitar selección</button>
          </span>
        </div>
      )}
      {hoja && hoja.t === 'agregar' && (
        <AgregarCuposHoja existentes={cupos} sustanciadores={sustanciadores} hoy={_auHoy()}
          onCerrar={function () { setHoja(null); }}
          onListo={function (r) { setHoja(null); avisarOmitidos(r); onCambio(); }} />
      )}
      {hoja && hoja.t === 'bloquear' && (
        // Solo los libres: el servidor rechaza los por apartar (bloquearCupos).
        <BloquearHoja
          cupos={hojaCupos.filter(function (c) { return c.estado === 'LIBRE'; })}
          sinBloquear={hojaCupos.filter(function (c) { return c.estado === 'POR_APARTAR'; }).length}
          citados={hojaCupos.filter(function (c) { return c.estado === 'RESERVADO'; })}
          onCerrar={function () { setHoja(null); }} onListo={alListo('bloquear')} />
      )}
      {hoja && hoja.t === 'dia' && (
        <BloquearHoja cupos={[]} fecha={hoja.fecha} sinBloquear={0}
          citados={cupos.filter(function (c) { return c.fecha === hoja.fecha && c.estado === 'RESERVADO'; })}
          onCerrar={function () { setHoja(null); }} onListo={alListo('bloquear')} />
      )}
      {hoja && hoja.t === 'eliminar' && (
        <EliminarCuposHoja cupos={hojaCupos.filter(function (c) { return c.estado !== 'RESERVADO'; })}
          onCerrar={function () { setHoja(null); }} onListo={alListo('eliminar')} />
      )}
    </div>
  );
}

// ── Vista Lista: todas las citas, también las pasadas ──
// `decreto(c)`: el botón «Decretar inspección» de la fila (o null). Sin
// `decreto` (inspector) la tabla no lleva esa columna.
function VistaLista({ rows, q, setQ, esAdmin, clicableCita, onAbrirCita, decreto }) {
  const n = rows.length;
  return (
    <div>
      <div className="au-lis-tools">
        <input className="au-lis-buscar" type="search" value={q}
          placeholder="Nombre, radicado, orden, expediente o documento"
          aria-label="Buscar citación"
          onChange={function (e) { setQ(e.target.value); }} />
      </div>
      <p className="au-hoy-libres">{n} citaci{n === 1 ? 'ón' : 'ones'}</p>
      {!n ? <p className="au-vacio-hoy">Sin resultados</p> : (<>
        <div className="au-tabla">
          <table>
            <thead><tr><th>Fecha</th><th>Hora</th><th>Sustanciador</th><th>Exp./Radicado</th>
              <th>Citado</th><th>Documento</th><th>Inspector</th>{decreto && <th>Inspección</th>}</tr></thead>
            <tbody>
              {rows.map(function (c) {
                // Con teclado se abre desde el botón de la fecha (la fila
                // sigue siendo clicable con el puntero): un <tr> con onClick
                // no recibe foco y la cita no se podía abrir sin mouse.
                const clic = clicableCita(c);
                return (
                  <tr key={c.idCupo} className={clic ? 'clic' : ''}
                    onClick={clic ? function () { onAbrirCita(c); } : undefined}>
                    <td>{clic
                      ? <button type="button" className="au-tabla-abrir"
                          aria-label={'Abrir la cita del ' + c.fecha + ', ' + horaBonitaAudiencias(c.hora) + (c.citado ? ', ' + c.citado : '')}
                          onClick={function (e) { e.stopPropagation(); onAbrirCita(c); }}>{c.fecha}</button>
                      : c.fecha}</td>
                    <td>{horaBonitaAudiencias(c.hora)}</td>
                    <td>{titleCaseNombre(c.sustanciador)}</td>
                    <td>{_auCaso(c)}</td>
                    <td><b>{c.citado}</b></td>
                    <td>{c.citado ? _auDocTxt(c) : null}</td>
                    <td>{titleCaseNombre(c.reservadoPor || '')}{esAdmin && c.sinVisita && <span className="au-sindoc"> · sin visita asociada</span>}</td>
                    {decreto && <td className="au-dec-td">{decreto(c)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="au-lrows">
          {rows.map(function (c) {
            // Clicable = botón (foco y Enter/Espacio); si no, un div.
            const clic = clicableCita(c);
            const Fila = clic ? 'button' : 'div';
            const cuerpo = (<>
              <span className="l1"><span>{c.fecha} · {horaBonitaAudiencias(c.hora)}</span></span>
              <span className="l2"><b>{c.citado || _auCaso(c)}</b>{c.citado ? <> · {_auDocTxt(c)}</> : null}</span>
              <span className="l3">{_auCaso(c)} · {_auSust(c.sustanciador)}{c.reservadoPor ? ' · ' + _auInsp(c.reservadoPor) : ''}
                {esAdmin && c.sinVisita ? ' · sin visita asociada' : ''}</span>
            </>);
            const dec = decreto ? decreto(c) : null;
            // Con el botón de decretar la fila no puede ser un botón (no se
            // anidan): el borde va afuera y la parte que abre la cita, adentro.
            if (dec) return (
              <div className="au-lrow au-lrow-dec" key={c.idCupo}>
                <Fila className={'au-lrow-b' + (clic ? ' clic' : '')} type={clic ? 'button' : undefined}
                  onClick={clic ? function () { onAbrirCita(c); } : undefined}>{cuerpo}</Fila>
                <span className="au-dec">{dec}</span>
              </div>
            );
            return (
              <Fila className={'au-lrow' + (clic ? ' clic' : '')} key={c.idCupo}
                type={clic ? 'button' : undefined}
                onClick={clic ? function () { onAbrirCita(c); } : undefined}>{cuerpo}</Fila>
            );
          })}
        </div>
      </>)}
    </div>
  );
}

// ── Citaciones visitas completadas (solo admin): copiar y pegar en el Excel ──
// (A2, 2026-11-04) «Copiar las N» copia de una vez las que faltan y pregunta si
// ya se pegaron; cada una se puede marcar o desmarcar como pegada. Las pegadas
// quedan aparte, plegadas, con quién y cuándo (hoja EXCEL_PEGADAS).
function CompletadasCaja({ lista, pegadas, copiado, ocupado, onCopiar, onCopiarTodas, onMarcar }) {
  const [verPegadas, setVerPegadas] = useStateAU(false);
  const sep = separarPegadasExcel(lista, pegadas);
  const fila = function (r) {
    const m = r.pegada;
    return (
      <div className={'au-row' + (m ? ' au-pegada' : '')} key={r.idCupo}>
        <span className="t">
          <b>{_auDiaCorto(r.fecha)}/{String(r.fecha).slice(-4)} · {horaBonitaAudiencias(r.hora)}</b>
          {r.fechaCompletada && <small>Completada {formatearFecha(r.fechaCompletada)}</small>}
          <small>{_auSust(r.sustanciador)} · {r.expediente === 'NUEVO' ? r.radicado : <span className="exp-tag">Exp. {r.expediente}</span>}{r.citado ? ' · ' + r.citado : ''}</small>
          {m && <small>Pegada el {m.en}{m.por ? ' · ' + titleCaseNombre(m.por) : ''}</small>}
          <button type="button" className="au-cl-texto au-peg-btn" disabled={ocupado}
            onClick={function () { onMarcar([r.idCupo], !m); }}>{m ? 'Desmarcar' : 'Marcar pegada'}</button>
        </span>
        <button type="button" className={'au-copy' + (copiado === r.idCupo ? ' ok' : '')}
          aria-label="Copiar fila para el Excel" title="Copiar fila para el Excel"
          onClick={function () { onCopiar(r); }}>
          {copiado === r.idCupo ? '✓' : _AU_SVG_COPIAR}
        </button>
      </div>
    );
  };
  return (
    <section className="au-caja" aria-labelledby="au-t-exc">
      <h2 id="au-t-exc">Citaciones visitas completadas</h2>
      {sep.pendientes.length > 1 && (
        <button type="button" className="btn-neutro btn-chico au-copiar-todas" disabled={ocupado}
          onClick={function () { onCopiarTodas(sep.pendientes); }}>
          {_AU_SVG_COPIAR}<span>Copiar las {sep.pendientes.length} para el Excel</span>
        </button>
      )}
      {!sep.pendientes.length
        ? <p className="au-vacio-hoy">{sep.pegadas.length ? 'Todas están pegadas en el Excel' : 'Sin citaciones'}</p>
        : sep.pendientes.map(fila)}
      {sep.pegadas.length > 0 && (
        <button type="button" className="au-cl-texto au-ver-pegadas" aria-expanded={verPegadas ? 'true' : 'false'}
          onClick={function () { setVerPegadas(!verPegadas); }}>
          {verPegadas ? 'Ocultar las ya pegadas' : 'Ver las ' + sep.pegadas.length + ' ya pegadas'}
        </button>
      )}
      {verPegadas && sep.pegadas.map(fila)}
    </section>
  );
}

// ── Pedidas hoy: lo que reservaron hoy todos los inspectores ──
// Con las pedidas sin señal que la cola todavía no confirmó (`pendientes`).
function PedidasHoyCaja({ cupos, pendientes, hoyTxt, usuario, yo, clicableCita, onAbrirCita }) {
  const lista = pedidasHoyAudiencias(cupos, hoyTxt);
  const fila = function (c, estado, clave, onClic) {
    const mia = normNombreAudiencias(c.reservadoPor || usuario.usuario) === yo;
    const Tag = onClic ? 'button' : 'span';
    return (
      <div className="au-row" key={clave}>
        <span className={'au-est-dot ' + estado} role="img"
          aria-label={estado === 'ok' ? 'Confirmada' : estado === 'cola' ? 'En cola' : 'No se pudo'}></span>
        <span className="hora">{horaBonitaAudiencias(c.hora)}</span>
        <Tag className="t" type={onClic ? 'button' : undefined} onClick={onClic}>
          <b>{_auDiaCorto(c.fecha)}</b> · {_auCaso(c)}
          <small>{_auSust(c.sustanciador)} · {mia ? 'la pediste tú' : _auInsp(c.reservadoPor)}
            {estado === 'cola' ? ' · en cola' : estado === 'fallo' ? ' · no se pudo: pide otra' : ''}</small>
        </Tag>
      </div>
    );
  };
  return (
    <section className="au-caja au-pedidas" aria-labelledby="au-t-ped">
      <h2 id="au-t-ped">Pedidas hoy</h2>
      {!lista.length && !pendientes.length ? <p className="au-vacio-hoy">Ninguna</p> : null}
      {pendientes.map(function (p) {
        return fila(Object.assign({}, p.cupo, { radicado: p.caso.radicado, ordenPolicia: p.caso.ordenPolicia }),
          p.estado, 'p' + p.requestId);
      })}
      {lista.map(function (c) {
        return fila(c, 'ok', c.idCupo, clicableCita(c) ? function () { onAbrirCita(c); } : undefined);
      })}
    </section>
  );
}

// ── Pantalla ────────────────────────────────────────────────────
// Refresco por detrás: al volver a la pestaña, al volver la señal y cada 15
// minutos con la pestaña a la vista. Antes solo se leía al entrar y tras
// escribir, y «Pedidas hoy» del admin se quedaba vieja. 15 y no 5 (2026-11-04):
// cada lectura le cuesta al servidor, aunque ahora la sirva de su caché.
var _AU_REFRESCO_MS = 15 * 60 * 1000;

function AudienciasScreen({ usuario }) {
  const [datos, setDatos] = useStateAU(null); // {cupos, novedadesActivas, ultimaFechaConCupo}
  const [novedades, setNovedades] = useStateAU([]);
  const [excel, setExcel] = useStateAU(null); // solo admin: {lista, pegadas}
  const [cargando, setCargando] = useStateAU(true);
  const [error, setError] = useStateAU('');
  const [sinConexion, setSinConexion] = useStateAU(false);
  const [vista, setVista] = useStateAU('agenda');   // 'agenda' | 'cupos' | 'lista'
  const [filtroSus, setFiltroSus] = useStateAU(''); // '' = todos; norm(nombre)
  const [misCitas, setMisCitas] = useStateAU(true); // inspector: «Mis citas» al entrar
  const [q, setQ] = useStateAU('');                 // búsqueda de la Lista
  const [copiado, setCopiado] = useStateAU('');
  const [ocupado, setOcupado] = useStateAU(false); // escritura en curso
  const [cuposPedir, setCuposPedir] = useStateAU(null);    // precargados para «Pedir cita»
  const [pendientes, setPendientes] = useStateAU([]);      // citas pedidas sin señal
  const [filas, setFilas] = useStateAU([]);        // BD VISITAS: citas viejas de la Agenda
  // «Decretar inspección» en la fila de la cita (2026-11-04): la fila en curso
  // y las recién decretadas (por radicado y por cupo) mientras BD se relee.
  const [decretando, setDecretando] = useStateAU('');
  const [recien, setRecien] = useStateAU({});
  // La hoja abierta de la pantalla, una a la vez: {t:'pedir'} | {t:'cita', cita}
  // | {t:'novedades'}. Las hojas de la vista Cupos viven en VistaCupos.
  const [hoja, setHoja] = useStateAU(null);

  const esAdmin = usuario.rol === 'ADMIN';
  const esSup = !esAdmin && veTodasLasVisitas(usuario.rol);
  const esInsp = !esAdmin && !esSup;
  const yo = normNombreAudiencias(usuario.usuario);

  function aplicar(r) {
    setDatos({
      cupos: r.cupos || [],
      novedadesActivas: r.novedadesActivas || 0,
      ultimaFechaConCupo: r.ultimaFechaConCupo || ''
    });
    setNovedades(r.novedades || []);
    if (esAdmin) setExcel({ lista: r.completadas || [], pegadas: r.pegadas || {} });
  }

  // Abre con la copia local y la actualiza por detrás. Trae todas las citas,
  // también las pasadas: la Lista las muestra todas en orden (decisión del usuario).
  // gasPost ya lanza el error cuando el backend responde ok: false.
  // `fresca` (tras una escritura): no pinta primero la copia guardada, que ya
  // es vieja; antes se veía un instante el estado anterior a lo que se hizo.
  async function cargar(op) {
    const fresca = !!(op && op.fresca);
    const copia = _auLeerCopia(usuario.rol);
    if (copia && !fresca) { aplicar(copia); setCargando(false); }
    else if (!datos) setCargando(true);
    if (!navigator.onLine) {
      setSinConexion(true);
      if (!copia && !datos) setError('Sin conexión y sin datos guardados en este equipo.');
      setCargando(false);
      return;
    }
    try {
      const r = await agendaAudiencias({ incluirPasadas: true, firma: copia && copia.firma });
      if (!r.sinCambios) {
        aplicar(r);
        _auGuardarCopia(usuario.rol, r);
      }
      setSinConexion(false); setError('');
    } catch (e) {
      if (copia || datos) setSinConexion(true);
      else setError(e.message || 'No se pudo cargar la agenda de audiencias.');
    }
    setCargando(false);
    citasPendientes().then(setPendientes).catch(function () {});
  }

  function precargarCupos() {
    if (esSup || !navigator.onLine) return;
    listarCuposAudiencias().then(function (r) { setCuposPedir(opcionesPedirCita(r.cupos || [], 5)); })
      .catch(function () {});
  }

  useEffectAU(() => {
    cargar();
    precargarCupos();
    // Cupos apartados para pedir citas sin señal en campo (se repiten sin daño).
    // Una vez al día por equipo, o si faltan (apartarCuposAudiencias, api.js).
    if (esInsp && navigator.onLine) apartarCuposAudiencias().catch(function () {});
  }, []);

  // Refresco: cada _AU_REFRESCO_MS con la pestaña a la vista, al volver a ella y
  // al volver la señal. Nunca durante una escritura.
  const ocupadoRef = useRefAU(false);
  ocupadoRef.current = ocupado;
  const cargarRef = useRefAU(cargar);
  cargarRef.current = cargar;
  useEffectAU(() => {
    function refrescar() {
      if (document.hidden || ocupadoRef.current || !navigator.onLine) return;
      cargarRef.current();
    }
    function alVolver() { if (!document.hidden) refrescar(); }
    const id = setInterval(refrescar, _AU_REFRESCO_MS);
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', refrescar);
    return function () {
      clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', refrescar);
    };
  }, []);

  // La Agenda cruza los cupos con las citas viejas de BD VISITAS
  // (FECHA CITACION): carga al montar y se re-pinta con el refresco.
  useEffectAU(() => {
    const leer = () => leerVisitas().then(function (r) { setFilas((r && r.datos) || []); }).catch(function () {});
    leer();
    return suscribirVisitas(leer);
  }, []);

  const hoyTxt = formatearFecha(_auHoy());

  const sustanciadores = useMemoAU(() => {
    const vistos = {}; const out = [];
    ((datos && datos.cupos) || []).forEach(function (c) {
      const s = String(c.sustanciador || '').trim();
      const n = normNombreAudiencias(s);
      if (!s || vistos[n]) return;
      vistos[n] = 1;
      out.push({ nombre: s, norm: n });
    });
    return out;
  }, [datos]);

  // El supervisor entra filtrado por su nombre como sustanciador, una sola
  // vez: antes el efecto corría con cada recarga (sustanciadores se recalcula)
  // y si había elegido «Todos» lo devolvía a su nombre.
  const filtroSupAplicado = useRefAU(false);
  useEffectAU(() => {
    if (!esSup || filtroSupAplicado.current) return;
    const mio = sustanciadores.find(function (s) { return s.norm === yo; });
    if (!mio) return;
    filtroSupAplicado.current = true;
    if (!filtroSus) setFiltroSus(mio.norm);
  }, [sustanciadores]);

  // ── Derivados de vista ──
  const soloMias = esInsp && misCitas;

  const listaRows = useMemoAU(function () {
    if (!datos) return [];
    return filtrarListaAudiencias(datos.cupos, {
      q: q, incluirPasadas: true, hoy: hoyTxt, deQuien: soloMias ? yo : ''
    });
  }, [datos, q, hoyTxt, soloMias, yo]);

  // Vista Agenda: filtros vigentes («Mis citas» del inspector, chip de
  // sustanciador — con sustanciador elegido las citas viejas no salen).
  const agendaDias = useMemoAU(function () {
    const opts = { soloDe: soloMias ? usuario.usuario : '', sustanciador: filtroSus };
    return agendaAudienciasDias(filas, (datos && datos.cupos) || [], hoyTxt, opts);
  }, [filas, datos, hoyTxt, soloMias, filtroSus]);

  const decretadas = useMemoAU(function () { return inspeccionesDecretadas(filas); }, [filas]);

  // Las del backend (cupos del bloque) + las citas escritas a mano en una visita completada.
  const completadas = useMemoAU(function () {
    return excel ? citacionesCompletadasExcel(excel.lista, filas, hoyTxt) : [];
  }, [excel, filas, hoyTxt]);

  const quedanCupos = esAdmin && datos && datos.ultimaFechaConCupo &&
    (function () {
      const n = diasHabilesHasta(parsearFecha(datos.ultimaFechaConCupo));
      return n != null && n < 30;
    })();

  // ── Escrituras ──
  // Todas las de un toque pasan por aquí: una a la vez (ocupado), el error en
  // un aviso y la agenda se vuelve a leer. Devuelve si salió bien.
  async function escribir(fn, msgError) {
    if (ocupado) return false;
    setOcupado(true);
    let ok = true;
    try { await fn(); } catch (e) {
      ok = false;
      await appAlert(msgError + ': ' + (e.message || e), { tono: 'error' });
    }
    await cargar({ fresca: true });
    setOcupado(false);
    return ok;
  }

  async function liberarCupoDe(c) {
    if (ocupado) return;
    const ok = await appConfirm(
      '¿Liberar la cita del ' + c.fecha + ' a las ' + horaBonitaAudiencias(c.hora) + '?\n\n' +
      'El cupo vuelve a estar libre y la visita queda sin fecha de citación.',
      { titulo: 'Liberar cita', btnOk: 'Sí, liberar', btnCancel: 'Cancelar', peligro: true });
    if (!ok) return;
    await escribir(async function () {
      await liberarCupoAudiencias(c.idCupo, 'Liberado desde la pestaña Audiencias');
      setHoja(null);
    }, 'No se pudo liberar el cupo');
  }

  async function quitarNovedad(n) {
    if (ocupado) return;
    const ok = await appConfirm('¿Quitar «' + (n.motivo || 'esta novedad') + '» (' + n.desde +
      (n.hasta !== n.desde ? ' – ' + n.hasta : '') + ')? Sus cupos vuelven a estar disponibles.',
      { titulo: 'Quitar novedad', btnOk: 'Quitar', btnCancel: 'Cancelar' });
    if (!ok) return;
    await escribir(function () { return desactivarNovedadAudiencias(n.id); }, 'No se pudo quitar la novedad');
  }

  async function guardarNovedad(payload) {
    let afectadas = null;
    const ok = await escribir(async function () {
      const r = await guardarNovedadAudiencias(payload);
      afectadas = r.afectadas || [];
    }, 'No se pudo guardar la novedad');
    return ok ? afectadas : null;
  }

  // La visita de la cita: por ID_VISITA y, si no, por radicado o N° de orden
  // (visitaDeCitaAudiencias, utils.js).
  function _casoTxtAU(c) {
    return c.radicado ? 'del radicado ' + c.radicado : (c.ordenPolicia ? 'de la orden ' + c.ordenPolicia : 'de esta cita');
  }

  // «Decretar inspección al lugar» (hoja de la cita): marca el caso para la
  // bandeja «Por programar» de la Agenda.
  // También la usa el botón de la fila (`fila`: la visita ya conocida, citas
  // viejas de la Agenda). Al salir bien, la fila y la hoja dicen «decretada».
  async function decretarInspeccionDe(c, fila) {
    const f = fila || visitaDeCitaAudiencias((await leerVisitas()).datos || [], c);
    if (!f) throw new Error('No se encontró la visita ' + _casoTxtAU(c) + '.');
    const r = await decretarInspeccionAudiencias(f);
    if (r && r.ok === false) throw new Error(r.error || 'No se pudo decretar.');
    setRecien(function (prev) {
      const o = Object.assign({}, prev);
      const k = claveRadicado(f['RADICADO']);
      if (k) o[k] = true;
      if (c && c.idCupo) o[c.idCupo] = true;
      return o;
    });
    leerVisitas().then(function (x) { setFilas((x && x.datos) || []); }).catch(function () {});
  }

  // El botón de la fila de la cita: solo admin y supervisor, solo si la cita
  // tiene visita y solo de hoy hacia atrás (se decreta en la audiencia).
  // `r`: cupo (Lista) o renglón de la Agenda ({ fuente, cupo | fila, caso }).
  function decretoDe(r, fechaTxt) {
    if (!(esAdmin || esSup)) return null;
    const cita = r.fuente === 'visita' ? null : (r.fuente === 'bloque' ? r.cupo : r);
    const fila = r.fuente === 'visita' ? r.fila : null;
    if (cita && cita.sinVisita) return null;
    if (!cita && !fila) return null;
    const d = parsearFecha(fechaTxt || (cita && cita.fecha)), h = parsearFecha(hoyTxt);
    if (!d || !h || d > h) return null;
    const rad = claveRadicado(fila ? fila['RADICADO'] : cita.radicado);
    const k = cita ? cita.idCupo : 'fila-' + fila._idx;
    if ((rad && (decretadas[rad] || recien[rad])) || recien[k]) {
      return <span className="au-dec-ok">Inspección decretada</span>;
    }
    const caso = cita ? _casoTxtAU(cita) : 'del radicado ' + fila['RADICADO'];
    async function decretar(e) {
      e.stopPropagation();
      const ok = await appConfirm('¿Decretar inspección al lugar ' + caso + '?\n\n' +
        'El caso queda en «Por programar» de la Agenda › Inspecciones.',
        { titulo: 'Decretar inspección', btnOk: 'Sí, decretar', btnCancel: 'Cancelar' });
      if (!ok) return;
      setDecretando(k);
      try { await decretarInspeccionDe(cita, fila); } catch (err) {
        await appAlert('No se pudo decretar la inspección: ' + (err.message || err), { tono: 'error' });
      }
      setDecretando('');
    }
    return (
      <button type="button" className="btn-neutro btn-chico au-dec-btn" disabled={!!decretando} onClick={decretar}>
        {decretando === k ? 'Enviando…' : 'Decretar inspección'}
      </button>
    );
  }

  async function abrirVisita(c) {
    try {
      const filasBD = (await leerVisitas()).datos || [];
      const f = visitaDeCitaAudiencias(filasBD, c);
      if (f && window.abrirVisitaDetail) window.abrirVisitaDetail(f);
      else await appAlert('No se encontró la visita ' + _casoTxtAU(c) +
        '. Puede haberse cerrado como NO COMPETENCIA.');
    } catch (e) {
      await appAlert('No se pudo abrir la visita: ' + (e.message || e), { tono: 'error' });
    }
  }

  // Una fila al portapapeles (✓ un momento). Marcarla pegada es aparte.
  async function copiarFilaExcel(r) {
    const ok = await _auCopiarConRespaldo(r.filaTSV, 'Copiar fila');
    if (!ok) return;
    setCopiado(r.idCupo);
    setTimeout(function () { setCopiado(''); }, 1500);
  }

  // «Copiar las N»: todas las que faltan, una por renglón, y luego la pregunta
  // de si ya se pegaron (el diálogo queda abierto mientras se pega en el Excel).
  async function copiarTodasExcel(lista) {
    if (!lista.length) return;
    await _auCopiarConRespaldo(lista.map(function (r) { return r.filaTSV; }).join('\n'), 'Citaciones para el Excel');
    const ya = await appConfirm('Se copiaron ' + lista.length + ' citaciones. Pégalas en el Excel del despacho.\n\n' +
      '¿Ya las pegaste? Se marcan como pegadas y pasan a «ya pegadas».',
      { titulo: 'Copiar al Excel', btnOk: 'Sí, ya las pegué', btnCancel: 'Todavía no' });
    if (ya) await marcarPegadas(lista.map(function (r) { return r.idCupo; }), true);
  }

  function marcarPegadas(ids, pegada) {
    return escribir(function () { return marcarPegadasExcelAudiencias(ids, pegada); },
      pegada ? 'No se pudieron marcar como pegadas' : 'No se pudieron desmarcar');
  }

  function clicableCita(c) {
    if (esAdmin || esSup) return true;
    return normNombreAudiencias(c.reservadoPor) === yo;
  }
  const abrirCita = function (c) { setHoja({ t: 'cita', cita: c }); };

  // Desde los 3 s se dice qué se espera (escalonEspera, utils.js).
  const escalon = useEscalera(cargando);

  // ═ early returns: todos los hooks ya corrieron ═
  const titulo = esInsp ? 'Citaciones' : 'Audiencias';
  // Mientras carga, la cabecera ya está: antes la pantalla perdía hasta el
  // título (propuesta de esperas, 2026-11-04).
  if (cargando) {
    return (
      <div className="au-pantalla" aria-busy="true">
        <header className="au-cab"><h1>{titulo}</h1></header>
        <AvisoEspera escalon={escalon} que={esInsp ? 'las citaciones' : 'la agenda de audiencias'} />
        <Esqueleto tipo="renglon" n={6} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="au-pantalla">
        <header className="au-cab"><h1>{titulo}</h1></header>
        <ErrorCarga titulo={esInsp ? 'No se pudieron cargar las citaciones.' : 'No se pudo cargar la agenda de audiencias.'}
          detalle={error} onReintentar={function () { cargar(); }} />
      </div>
    );
  }
  if (!datos) return null;

  if (!datos.cupos.length) {
    return (
      <div className="au-pantalla">
        <header className="au-cab"><h1>{titulo}</h1></header>
        <div className="au-vacio">
          <b>Sin cupos cargados</b>
          La hoja AUDIENCIAS está vacía: falta pegar la lista CUPOS_CU del Excel del despacho.
          <button type="button" className="btn-accion" onClick={function () { cargar(); }}>Reintentar</button>
        </div>
      </div>
    );
  }

  // Novedades vigentes de la hoja «Días sin audiencias»: el supervisor ve solo
  // las suyas.
  const hoyD = parsearFecha(hoyTxt);
  const novedadesVigentes = novedades.filter(function (n) {
    if (n.activa === false) return false;
    const h = parsearFecha(n.hasta);
    if (h && hoyD && h < hoyD) return false;   // vencida: ya no bloquea nada
    return !esSup || normNombreAudiencias(n.sustanciador) === yo;
  }).sort(function (a, b) { return (parsearFecha(a.desde) || 0) - (parsearFecha(b.desde) || 0); });

  const pedidas = (
    <PedidasHoyCaja cupos={datos.cupos} pendientes={pendientes} hoyTxt={hoyTxt} usuario={usuario} yo={yo}
      clicableCita={clicableCita} onAbrirCita={abrirCita} />
  );

  // Vistas en control segmentado y filtros en chips: antes eran el mismo chip
  // y en el celular se mezclaban al saltar de renglón.
  const vistas = [['agenda', 'Agenda']].concat(esInsp ? [] : [['cupos', 'Cupos']]).concat([['lista', 'Lista']]);
  const filtros = esInsp
    ? [['mias', 'Mis citas', misCitas, function () { setMisCitas(true); }],
       ['todas', 'Todas', !misCitas, function () { setMisCitas(false); }]]
    : [['todos', 'Todos', !filtroSus, function () { setFiltroSus(''); }]].concat(sustanciadores.map(function (s) {
        return [s.norm, titleCaseNombre(s.nombre.split(' ')[0]), filtroSus === s.norm, function () { setFiltroSus(s.norm); }];
      }));

  return (
    <div className="au-pantalla">
      <header className="au-cab">
        <h1>{titulo}</h1>
        {!esSup && (
          <button type="button" className="btn-principal au-btn-pedir" onClick={function () { setHoja({ t: 'pedir' }); }}>
            Pedir cita
          </button>
        )}
        {esSup && (
          <button type="button" className="btn-neutro btn-chico au-btn-nov" aria-haspopup="dialog"
            onClick={function () { setHoja({ t: 'novedades' }); }}>
            <Icon.Admin size={14} aria-hidden="true" />
            <span>Días sin audiencias{datos.novedadesActivas ? ' · ' + datos.novedadesActivas : ''}</span>
          </button>
        )}
      </header>

      {sinConexion && <p className="au-aviso-linea">Sin conexión</p>}
      {quedanCupos && (
        <p className="au-aviso-linea">Quedan cupos solo hasta el <b>{datos.ultimaFechaConCupo}</b>. Hay que apartar más en el Excel.</p>
      )}

      {esInsp && pedidas}

      <div className={esAdmin ? 'au-grid' + (vista === 'agenda' ? ' v-agenda' : '') : ''}>
        <div className="au-principal">
          <div className="au-topbar">
            <div className="ag-seg au-seg" role="group" aria-label="Vista">
              {vistas.map(function (v) {
                return <button type="button" key={v[0]} aria-pressed={vista === v[0] ? 'true' : 'false'}
                  onClick={function () { setVista(v[0]); }}>{v[1]}</button>;
              })}
            </div>
            <span className="sp"></span>
            <div className="au-filtro" role="group" aria-label={esInsp ? 'Qué citas' : 'Sustanciador'}>
              {filtros.map(function (f) { return <ChipAU key={f[0]} on={f[2]} onClick={f[3]}>{f[1]}</ChipAU>; })}
            </div>
          </div>

          {vista === 'agenda' && (
            <VistaAgenda dias={agendaDias} hoyTxt={hoyTxt} filtroSus={filtroSus} sinInspector={soloMias}
              clicableCita={clicableCita} onAbrirCita={abrirCita} decreto={(esAdmin || esSup) ? decretoDe : null} />
          )}
          {vista === 'cupos' && (
            <VistaCupos datos={datos} novedades={novedades} esAdmin={esAdmin} hoyTxt={hoyTxt}
              filtroSus={filtroSus} sustanciadores={sustanciadores} ocupado={ocupado}
              escribir={escribir} onCambio={function () { cargar({ fresca: true }); }} onAbrirCita={abrirCita}
              onAbrirNovedades={function () { setHoja({ t: 'novedades' }); }} />
          )}
          {vista === 'lista' && (
            <VistaLista rows={listaRows} q={q} setQ={setQ} esAdmin={esAdmin}
              clicableCita={clicableCita} onAbrirCita={abrirCita}
              decreto={(esAdmin || esSup) ? function (c) { return decretoDe(c); } : null} />
          )}
        </div>

        {/* Escritorio (≥1200): columna lateral fija. Más angosto: arriba de la
            Agenda (es la tarea diaria del admin) y fuera de Cupos y Lista. */}
        {esAdmin && (
          <aside className="au-riel">
            <CompletadasCaja lista={completadas} pegadas={(excel && excel.pegadas) || {}} copiado={copiado}
              ocupado={ocupado} onCopiar={copiarFilaExcel} onCopiarTodas={copiarTodasExcel} onMarcar={marcarPegadas} />
            {pedidas}
          </aside>
        )}
      </div>

      {hoja && hoja.t === 'novedades' && (
        <NovedadesHoja mias={novedadesVigentes} esAdmin={esAdmin} usuario={usuario} sustanciadores={sustanciadores}
          ocupado={ocupado} onCerrar={function () { setHoja(null); }}
          onQuitar={quitarNovedad} onGuardar={guardarNovedad}
          onReprogramada={function () { cargar({ fresca: true }); }} />
      )}
      {hoja && hoja.t === 'pedir' && (
        <PedirCitaHoja usuario={usuario} agenda={datos.cupos} cuposIniciales={cuposPedir}
          onCerrar={function () { setHoja(null); }}
          onReservada={function () { cargar({ fresca: true }); precargarCupos(); }} />
      )}
      {hoja && hoja.t === 'cita' && (
        <CitaHoja cita={hoja.cita} hoyTxt={hoyTxt} esAdmin={esAdmin} ocupado={ocupado}
          onCerrar={function () { setHoja(null); }}
          onVerVisita={function () { const c = hoja.cita; setHoja(null); abrirVisita(c); }}
          onLiberar={function () { liberarCupoDe(hoja.cita); }}
          onDecretar={(esAdmin || esSup) ? decretarInspeccionDe : null}
          yaDecretada={!!(recien[hoja.cita.idCupo] || decretadas[claveRadicado(hoja.cita.radicado)])}
          onReprogramada={function () { setHoja(null); cargar({ fresca: true }); }} />
      )}
    </div>
  );
}
