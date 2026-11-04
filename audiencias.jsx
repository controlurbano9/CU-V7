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

// ── Hoja «Pedir cita» ──────────────────────────────────────────
// Caso (agenda de hoy del inspector o escrito) y uno de los 5 cupos más
// próximos; sin señal, sus cupos apartados. Al reservar, la fecha, la hora y
// el sustanciador en grande para copiarlos a la citación de papel.
// `casoInicial` (opcional): el caso ya puesto, cuando se pide desde la visita.
function PedirCitaHoja({ usuario, agenda, cuposIniciales, casoInicial, onCerrar, onReservada }) {
  const hojaRef = useHojaTecladoAU(onCerrar);
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
    <div ref={hojaRef} className="au-ovl au-hoj-ovl on" role="dialog" aria-modal="true" aria-label="Pedir cita"
      onClick={function (e) { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="au-hoj au-pedir">
        <div className="au-hoj-cab">
          <div className="t"><b>Pedir cita</b></div>
          <button type="button" className="au-x" aria-label="Cerrar" onClick={onCerrar}>×</button>
        </div>

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
              <p className="au-vacio-hoy">Cargando…</p>
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
      </div>
    </div>
  );
}

// «Pedir cita» fuera de la pantalla de Audiencias: desde el «+» (y, en las
// piezas siguientes, desde la ficha y el formulario). El inspector ya no tiene
// esa pestaña (arquitectura 2026-10-27, decisión 4). La agenda, que la hoja usa
// para avisar «Ya tiene cita», sale de la copia local de Audiencias y se
// refresca por detrás; sin señal, la hoja ofrece los cupos apartados.
function PedirCitaGlobal({ usuario, casoInicial, onCerrar }) {
  const [agenda, setAgenda] = useStateAU(function () {
    const c = _auLeerCopia(usuario.rol);
    return (c && c.cupos) || [];
  });
  useEffectAU(function () {
    if (!navigator.onLine) return;
    let vivo = true;
    agendaAudiencias({}).then(function (r) {
      if (vivo && r && r.ok && !r.sinCambios) setAgenda(r.cupos || []);
    }).catch(function () {});
    return function () { vivo = false; };
  }, []);
  return <PedirCitaHoja usuario={usuario} agenda={agenda} casoInicial={casoInicial}
    onCerrar={onCerrar} onReservada={function () {}} />;
}

// ── Detalle de una cita ────────────────────────────────────────
// Lo que se toca en Hoy, Semana o Lista. Es el único lugar desde donde el
// admin libera una cita (antes estaba a un toque en cada fila). El
// sustanciador abre de aquí el acta y el informe para preparar la audiencia.
function CitaHoja({ cita, esAdmin, ocupado, onCerrar, onVerVisita, onLiberar, onDecretar }) {
  const hojaRef = useHojaTecladoAU(onCerrar);
  // Inspección al lugar decretada en la audiencia (2026-11-03): el caso queda
  // en «Por programar» de la Agenda › Inspecciones, sin fecha todavía.
  const [decreto, setDecreto] = useStateAU('');   // '' | 'enviando' | 'ok' | mensaje de error
  const c = cita;
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
    <div ref={hojaRef} className="au-ovl au-hoj-ovl on" role="dialog" aria-modal="true" aria-label="Cita"
      onClick={function (e) { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="au-hoj au-cita">
        <div className="au-hoj-cab">
          <div className="t"><b>Cita</b></div>
          <button type="button" className="au-x" aria-label="Cerrar" onClick={onCerrar}>×</button>
        </div>
        <div className="au-pconf ok">
          <p className="est">✓ Cita confirmada</p>
          <p className="f">{_auMayus(_auFechaLarga(c.fecha))}</p>
          <p className="h">{horaBonitaAudiencias(c.hora)}</p>
          <p className="s">{titleCaseNombre(c.sustanciador)}</p>
        </div>
        <dl className="au-cita-datos">
          <dt>Caso</dt><dd>{_auCaso(c)}{c.expediente && c.radicado ? ' · ' + c.radicado : ''}</dd>
          {c.citado && <><dt>Citado</dt><dd>{c.citado}{c.documentoCitado ? <> · {_auDocTxt(c)}</> : null}</dd></>}
          {c.direccion && <><dt>Dirección</dt><dd>{c.direccion}</dd></>}
          <dt>Pedida por</dt><dd>{titleCaseNombre(c.reservadoPor || '')}{c.reservadoEn ? ' · ' + String(c.reservadoEn).slice(0, 10) : ''}</dd>
        </dl>
        <div className="au-cita-acc">
          {c.linkActa && <a className="btn-neutro" href={c.linkActa} target="_blank" rel="noopener">Acta</a>}
          {c.linkInforme && <a className="btn-neutro" href={c.linkInforme} target="_blank" rel="noopener">Informe</a>}
          {!c.sinVisita && <button type="button" className="btn-neutro" onClick={onVerVisita}>Ver visita</button>}
        </div>
        {onDecretar && !c.sinVisita && (
          decreto === 'ok'
            ? <p className="au-decreto ok">Inspección al lugar en «Por programar» de la Agenda</p>
            : <>
                <button type="button" className="btn-neutro au-decreto-btn" disabled={decreto === 'enviando'} onClick={decretar}>
                  {decreto === 'enviando' ? 'Enviando…' : 'Decretar inspección al lugar'}
                </button>
                {decreto && decreto !== 'enviando' && <p className="au-decreto error" role="alert">{decreto}</p>}
              </>
        )}
        {esAdmin && (
          <button type="button" className="au-cita-liberar" disabled={ocupado} onClick={onLiberar}>Liberar cita</button>
        )}
      </div>
    </div>
  );
}

// ── «Cupos» como lista (2026-11-03) ──────────────────────────
// El chip «Cupos» dejó de ser la semana y pasó a la lista de la maqueta
// propuesta-cupos.html: resumen, filtros, agregar/bloquear/eliminar y
// selección múltiple. Solo el admin acciona; el supervisor ve la lista sin
// casillas ni acciones.

var _AU_ESTADOS_CUPOS = {
  POR_APARTAR: { texto: 'Por apartar', anillo: 'pendiente' },
  RESERVADO:   { texto: 'Citado',     anillo: 'iniciado' },
  LIBRE:       { texto: 'Libre',      anillo: 'completado' },
  BLOQUEADO:   { texto: 'Bloqueado',  anillo: 'cerrado' },
};

function _auPluralCupo(n) { return n === 1 ? 'cupo' : 'cupos'; }

// Copia al portapapeles con el respaldo de copiarFilaExcel: si el
// portapapeles falla, el texto sale en una hoja para copiarlo a mano.
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
  const hojaRef = useHojaTecladoAU(onCerrar);
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

  async function confirmar() {
    if (incompleto || !prev.crear.length || enviando) return;
    setEnviando(true); setError('');
    try {
      const r = await agregarCuposAudiencias(prev.crear);
      if (!r.ok) { setError(r.error || 'No se pudieron crear los cupos.'); setEnviando(false); return; }
      setEnviando(false);
      onListo(r);
    } catch (e) {
      setError(e.message || 'No se pudieron crear los cupos.'); setEnviando(false);
    }
  }

  const chip = function (on, txt, fn, clave) {
    return <button type="button" key={clave} className={'au-chip' + (on ? ' on' : '')}
      aria-pressed={on ? 'true' : 'false'} onClick={fn}>{txt}</button>;
  };

  return (
    <div ref={hojaRef} className="au-hoj-ovl on" role="dialog" aria-modal="true" aria-label="Agregar cupos"
      onClick={function (e) { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="au-hoj">
        <div className="au-hoj-cab">
          <div className="t"><b>Agregar cupos</b></div>
          <button type="button" className="au-x" aria-label="Cerrar" onClick={onCerrar}>×</button>
        </div>
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
              return chip(!!dias[p[0]], p[1], function () {
                setDias(function (d) { const n = Object.assign({}, d); if (n[p[0]]) delete n[p[0]]; else n[p[0]] = true; return n; });
              }, 'dia' + p[0]);
            })}
          </div>
        </div>
        <div className="au-cl-campo">
          <span>Horas</span>
          <div className="au-cl-chips">
            {[['9:00AM', '9:00 a. m.'], ['2:00PM', '2:00 p. m.']].map(function (p) {
              return chip(!!horas[p[0]], p[1], function () {
                setHoras(function (h) { const n = Object.assign({}, h); if (n[p[0]]) delete n[p[0]]; else n[p[0]] = true; return n; });
              }, 'hora' + p[0]);
            })}
            {chip(otra, 'Otra hora', function () { setOtra(!otra); }, 'otra')}
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
              return chip(susts === null || !!susts[s.nombre], titleCaseNombre(s.nombre), function () {
                setSusts(function (prev) {
                  const actuales = prev === null
                    ? sustanciadores.map(function (x) { return x.nombre; })
                    : Object.keys(prev);
                  const n = {};
                  let hay = false;
                  actuales.forEach(function (x) { if (x === s.nombre) hay = true; else n[x] = true; });
                  if (!hay) n[s.nombre] = true;
                  return n;
                });
              }, 'sust' + s.norm);
            })}
          </div>
        </div>
        <div className="au-cl-pre">
          {incompleto ? (
            <p className="au-cl-err">{problema}</p>
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
            disabled={incompleto || !prev.crear.length || enviando} onClick={confirmar}>
            {enviando ? 'Creando…' : (incompleto ? 'Crear cupos' : 'Crear ' + prev.crear.length + ' ' + _auPluralCupo(prev.crear.length))}
          </button>
          <button type="button" className="au-cl-texto" onClick={onCerrar}>Volver</button>
        </div>
      </div>
    </div>
  );
}

// Hoja «Bloquear»: motivo obligatorio, lista de cupos y aviso de citaciones
// afectadas (no se cancelan).
function BloquearCuposHoja({ cupos, citados, onCerrar, onListo }) {
  const hojaRef = useHojaTecladoAU(onCerrar);
  const [motivo, setMotivo] = useStateAU('');
  const [enviando, setEnviando] = useStateAU(false);
  const [error, setError] = useStateAU('');
  if (!cupos.length) {
    return (
      <div ref={hojaRef} className="au-hoj-ovl on" role="dialog" aria-modal="true" aria-label="Bloquear"
        onClick={function (e) { if (e.target === e.currentTarget) onCerrar(); }}>
        <div className="au-hoj">
          <div className="au-hoj-cab">
            <div className="t"><b>Bloquear</b></div>
            <button type="button" className="au-x" aria-label="Cerrar" onClick={onCerrar}>×</button>
          </div>
          <p className="au-cl-info">No hay cupos por bloquear en esa selección.</p>
          <div className="au-cl-acc">
            <button type="button" className="au-cl-texto" onClick={onCerrar}>Volver</button>
          </div>
        </div>
      </div>
    );
  }
  async function confirmar() {
    if (!motivo.trim() || enviando) return;
    setEnviando(true); setError('');
    try {
      const r = await bloquearCuposAudiencias(cupos.map(function (c) { return c.idCupo; }), motivo.trim());
      if (!r.ok) { setError(r.error || 'No se pudieron bloquear los cupos.'); setEnviando(false); return; }
      setEnviando(false);
      onListo();
    } catch (e) {
      setError(e.message || 'No se pudieron bloquear los cupos.'); setEnviando(false);
    }
  }
  return (
    <div ref={hojaRef} className="au-hoj-ovl on" role="dialog" aria-modal="true" aria-label="Bloquear"
      onClick={function (e) { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="au-hoj">
        <div className="au-hoj-cab">
          <div className="t"><b>Bloquear</b></div>
          <button type="button" className="au-x" aria-label="Cerrar" onClick={onCerrar}>×</button>
        </div>
        <p className="au-cl-info">Se bloquean <b>{cupos.length}</b> {_auPluralCupo(cupos.length)}:</p>
        <div className="au-cl-lineas">
          {cupos.map(function (c) {
            return <div key={c.idCupo}>{c.fecha} · {horaBonitaAudiencias(c.hora)} · {titleCaseNombre(c.sustanciador)}</div>;
          })}
        </div>
        {citados.length > 0 && (
          <p className="au-cl-err"><b>{citados.length} citaci{citados.length === 1 ? 'ón cae' : 'ones caen'} en esos días.</b> No se cancelan.</p>
        )}
        <div className="au-cl-campo">
          <span>Motivo (obligatorio)</span>
          <div className="au-cl-chips">
            {['Vacaciones', 'Comisión', 'Capacitación', 'Festivo local'].map(function (m) {
              return <button type="button" key={m} className={'au-chip' + (motivo === m ? ' on' : '')}
                onClick={function () { setMotivo(m); }}>{m}</button>;
            })}
          </div>
          <input type="text" placeholder="Escribe el motivo" value={motivo}
            onChange={function (e) { setMotivo(e.target.value); }} />
        </div>
        {error && <p className="au-cl-err">{error}</p>}
        <div className="au-cl-acc">
          <button type="button" className="btn-principal btn-chico" disabled={!motivo.trim() || enviando} onClick={confirmar}>
            {enviando ? 'Bloqueando…' : 'Bloquear'}
          </button>
          <button type="button" className="au-cl-texto" onClick={onCerrar}>Volver</button>
        </div>
      </div>
    </div>
  );
}

// Hoja «Bloquear el día»: novedad TODOS/DIA de un solo día (reutiliza
// guardarNovedadAudiencias). Avisa si ese día hay citaciones.
function BloquearDiaHoja({ fecha, citados, onCerrar, onListo }) {
  const hojaRef = useHojaTecladoAU(onCerrar);
  const [motivo, setMotivo] = useStateAU('');
  const [enviando, setEnviando] = useStateAU(false);
  const [error, setError] = useStateAU('');
  async function confirmar() {
    if (!motivo.trim() || enviando) return;
    setEnviando(true); setError('');
    try {
      const r = await guardarNovedadAudiencias({ desde: fecha, hasta: fecha, sustanciador: 'TODOS', franja: 'DIA', motivo: motivo.trim() });
      if (!r.ok) { setError(r.error || 'No se pudo bloquear el día.'); setEnviando(false); return; }
      setEnviando(false);
      onListo();
    } catch (e) {
      setError(e.message || 'No se pudo bloquear el día.'); setEnviando(false);
    }
  }
  return (
    <div ref={hojaRef} className="au-hoj-ovl on" role="dialog" aria-modal="true" aria-label="Bloquear el día"
      onClick={function (e) { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="au-hoj">
        <div className="au-hoj-cab">
          <div className="t"><b>Bloquear el día</b></div>
          <button type="button" className="au-x" aria-label="Cerrar" onClick={onCerrar}>×</button>
        </div>
        <p className="au-cl-info"><b>{_auMayus(_auFechaLarga(fecha))}</b></p>
        {citados.length > 0 && (
          <p className="au-cl-err"><b>{citados.length} citaci{citados.length === 1 ? 'ón cae' : 'ones caen'} en ese día.</b> No se cancelan.</p>
        )}
        <div className="au-cl-campo">
          <span>Motivo (obligatorio)</span>
          <div className="au-cl-chips">
            {['Vacaciones', 'Comisión', 'Capacitación', 'Festivo local'].map(function (m) {
              return <button type="button" key={m} className={'au-chip' + (motivo === m ? ' on' : '')}
                onClick={function () { setMotivo(m); }}>{m}</button>;
            })}
          </div>
          <input type="text" placeholder="Escribe el motivo" value={motivo}
            onChange={function (e) { setMotivo(e.target.value); }} />
        </div>
        {error && <p className="au-cl-err">{error}</p>}
        <div className="au-cl-acc">
          <button type="button" className="btn-principal btn-chico" disabled={!motivo.trim() || enviando} onClick={confirmar}>
            {enviando ? 'Bloqueando…' : 'Bloquear'}
          </button>
          <button type="button" className="au-cl-texto" onClick={onCerrar}>Volver</button>
        </div>
      </div>
    </div>
  );
}

// Hoja «Eliminar»: confirma; si alguno era libre (ya en el Excel), recuerda
// liberarlo allá con «Copiar lista».
function EliminarCuposHoja({ cupos, onCerrar, onListo }) {
  const hojaRef = useHojaTecladoAU(onCerrar);
  const [enviando, setEnviando] = useStateAU(false);
  const [error, setError] = useStateAU('');
  const [copiado, setCopiado] = useStateAU(false);
  const hayLibre = cupos.some(function (c) { return c.estado === 'LIBRE'; });
  const tsv = cupos.map(function (c) {
    return c.fecha + '\t' + horaBonitaAudiencias(c.hora) + '\t' + titleCaseNombre(c.sustanciador);
  }).join('\n');
  async function confirmar() {
    if (enviando) return;
    setEnviando(true); setError('');
    try {
      const r = await eliminarCuposAudiencias(cupos.map(function (c) { return c.idCupo; }));
      if (!r.ok) { setError(r.error || 'No se pudieron eliminar los cupos.'); setEnviando(false); return; }
      setEnviando(false);
      onListo();
    } catch (e) {
      setError(e.message || 'No se pudieron eliminar los cupos.'); setEnviando(false);
    }
  }
  async function copiar() {
    const ok = await _auCopiarConRespaldo(tsv, 'Cupos para liberar en el Excel');
    if (ok) setCopiado(true);
  }
  return (
    <div ref={hojaRef} className="au-hoj-ovl on" role="dialog" aria-modal="true" aria-label="Eliminar cupos"
      onClick={function (e) { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="au-hoj">
        <div className="au-hoj-cab">
          <div className="t"><b>Eliminar {cupos.length > 1 ? 'cupos' : 'cupo'}</b></div>
          <button type="button" className="au-x" aria-label="Cerrar" onClick={onCerrar}>×</button>
        </div>
        <p className="au-cl-info">{cupos.length > 1 ? 'Los turnos dejan de existir.' : 'El turno deja de existir.'}</p>
        <div className="au-cl-lineas">
          {cupos.map(function (c) {
            return <div key={c.idCupo}>{c.fecha} · {horaBonitaAudiencias(c.hora)} · {titleCaseNombre(c.sustanciador)}</div>;
          })}
        </div>
        {hayLibre && <p className="au-cl-info"><b>Ya estaba apartado en el Excel: libéralo también allá.</b></p>}
        {error && <p className="au-cl-err">{error}</p>}
        <div className="au-cl-acc">
          <button type="button" className="btn-principal btn-chico" disabled={enviando} onClick={confirmar}>
            {enviando ? 'Eliminando…' : 'Eliminar'}
          </button>
          {hayLibre && <button type="button" className="au-cl-texto" onClick={copiar}>{copiado ? '✓ Copiado' : 'Copiar lista'}</button>}
          <button type="button" className="au-cl-texto" onClick={onCerrar}>Volver</button>
        </div>
      </div>
    </div>
  );
}

// ── Hoja «Días sin audiencias» (admin y supervisor) ──────────────
// Componente propio para tener el teclado de las demás hojas (foco, Escape,
// Tab dentro): como función de render no tenía nada de eso.
function NovedadesHoja({ mias, esAdmin, usuario, sustanciadores, ocupado, novForm, afectadas,
  onCerrar, onQuitar, onAbrirForm, onCancelarForm, onGuardar }) {
  const hojaRef = useHojaTecladoAU(onCerrar);
  return (
    <div ref={hojaRef} className="au-hoj-ovl on" role="dialog" aria-modal="true" aria-label="Días sin audiencias"
      onClick={function (e) { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="au-hoj au-hoj-nov">
        <div className="au-hoj-cab">
          <div className="t"><b>Días sin audiencias</b></div>
          <button type="button" className="au-x" aria-label="Cerrar" onClick={onCerrar}>×</button>
        </div>
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
        {!novForm && <button type="button" className="au-mas" onClick={onAbrirForm}>+ Agregar</button>}
        {novForm && (
          <form className="au-form on" onSubmit={onGuardar}>
            <div className="fila">
              <div>
                <label htmlFor="au-nv-sus">Sustanciador</label>
                {esAdmin ? (
                  <select id="au-nv-sus" defaultValue="TODOS">
                    <option value="TODOS">Todos</option>
                    {sustanciadores.map(function (s) { return <option key={s.norm} value={s.nombre}>{titleCaseNombre(s.nombre)}</option>; })}
                  </select>
                ) : <input type="text" defaultValue={usuario.usuario} disabled />}
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
              <button type="button" className="btn-neutro btn-chico" onClick={onCancelarForm}>Cancelar</button>
              <button type="submit" className="btn-accion btn-chico" disabled={ocupado}>Guardar novedad</button>
            </div>
          </form>
        )}
        {afectadas && !!afectadas.length && (
          <div className="au-aviso">
            <b>{afectadas.length} citaci{afectadas.length === 1 ? 'ón cae' : 'ones caen'} en esos días</b>
            <ul>
              {afectadas.slice(0, 10).map(function (c) {
                return <li key={c.idCupo}>{c.fecha} · {horaBonitaAudiencias(c.hora)} · {titleCaseNombre(c.sustanciador)} · {_auCaso(c)} · {c.citado}</li>;
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pantalla ────────────────────────────────────────────────────
function AudienciasScreen({ usuario }) {
  const [datos, setDatos] = useStateAU(null); // {cupos, novedadesActivas, ultimaFechaConCupo}
  const [novedades, setNovedades] = useStateAU([]);
  const [excel, setExcel] = useStateAU(null); // solo admin: {lista}
  const [cargando, setCargando] = useStateAU(true);
  const [error, setError] = useStateAU('');
  const [sinConexion, setSinConexion] = useStateAU(false);
  const [vista, setVista] = useStateAU('agenda');
  const [filtroSus, setFiltroSus] = useStateAU(''); // '' = todos; norm(nombre)
  const [misCitas, setMisCitas] = useStateAU(true); // inspector: «Mis citas» al entrar
  // «Cupos» como lista (2026-11-03): filtros, selección y hoja de gestión.
  const [fMes, setFMes] = useStateAU('todos');        // 'todos' | 'YYYY-MM'
  const [fEstado, setFEstado] = useStateAU('todos');  // 'todos' | estado del cupo
  const [fCuposAbiertos, setFCuposAbiertos] = useStateAU(false);
  const [selCupos, setSelCupos] = useStateAU({});     // idCupo → true
  const [hojaCupo, setHojaCupo] = useStateAU(null);   // {t, ids} | {t:'agregar'} | {t:'dia', fecha}
  const [copiadoApartar, setCopiadoApartar] = useStateAU(false);
  const [lis, setLis] = useStateAU({ q: '' });
  const [novAbierta, setNovAbierta] = useStateAU(false);
  const [novForm, setNovForm] = useStateAU(false);
  const [afectadas, setAfectadas] = useStateAU(null);
  const [copiado, setCopiado] = useStateAU('');
  const [ocupado, setOcupado] = useStateAU(false); // escritura en curso
  const [pedirAbierto, setPedirAbierto] = useStateAU(false);
  const [cuposPedir, setCuposPedir] = useStateAU(null);    // precargados para «Pedir cita»
  const [pendientes, setPendientes] = useStateAU([]);      // citas pedidas sin señal
  const [citaAbierta, setCitaAbierta] = useStateAU(null);
  const [filas, setFilas] = useStateAU([]);        // BD VISITAS: citas viejas de la vista Hoy

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
    if (esAdmin) setExcel({ lista: r.completadas || [] });
  }

  // Abre con la copia local y la actualiza por detrás. Trae todas las citas,
  // también las pasadas: la Lista las muestra todas en orden (decisión del usuario).
  async function cargar() {
    const copia = _auLeerCopia(usuario.rol);
    if (copia) { aplicar(copia); setCargando(false); }
    else if (!datos) setCargando(true);
    if (!navigator.onLine) {
      setSinConexion(true);
      if (!copia && !datos) setError('Sin conexión y sin datos guardados en este equipo.');
      setCargando(false);
      return;
    }
    try {
      const r = await agendaAudiencias({ incluirPasadas: true, firma: copia && copia.firma });
      if (!r.ok) throw new Error(r.error || 'No se pudo leer la agenda.');
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
    if (esInsp && navigator.onLine) apartarCuposAudiencias().catch(function () {});
  }, []);

  // La vista «Hoy» cruza los cupos con las citas viejas de BD VISITAS
  // (FECHA CITACION): carga al montar y se re-pinta con el refresco.
  useEffectAU(() => {
    const leer = () => leerVisitas().then(function (r) { setFilas((r && r.datos) || []); }).catch(function () {});
    leer();
    return suscribirVisitas(leer);
  }, []);

  // Meses con cupos para el filtro de la lista («abril 2027»…).
  const mesesCupos = useMemoAU(function () {
    const vistos = {}; const out = [];
    const hoyM = parsearFecha(formatearFecha(_auHoy()));
    ((datos && datos.cupos) || []).forEach(function (c) {
      const d = parsearFecha(c.fecha);
      if (!d || (hoyM && d < hoyM)) return;   // como la lista: de hoy en adelante
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (vistos[k]) return;
      vistos[k] = 1;
      out.push({ k: k, d: d, txt: _AU_MESES[d.getMonth()] + ' ' + d.getFullYear() });
    });
    return out.sort(function (a, b) { return a.d - b.d; });
  }, [datos]);
  const hoyTxt = formatearFecha(_auHoy());

  // Lo que muestra la vista Cupos con los filtros de ahora. Solo de hoy en
  // adelante: la agenda trae también las pasadas para la Lista, y un cupo
  // pasado ya no se agrega, bloquea ni elimina. La barra de selección actúa
  // solo sobre lo que está aquí (seleccionCuposVisible).
  const cuposVisibles = useMemoAU(function () {
    if (!datos) return [];
    const hoyCupos = parsearFecha(hoyTxt);
    return filtrarCuposLista((datos.cupos || []).filter(function (c) {
      const d = parsearFecha(c.fecha);
      return !d || !hoyCupos || d >= hoyCupos;
    }), {
      mes: fMes === 'todos' ? '' : fMes,
      estado: fEstado === 'todos' ? '' : fEstado,
      sustanciador: filtroSus
    });
  }, [datos, hoyTxt, fMes, fEstado, filtroSus]);

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

  // ── Escrituras ──
  async function liberarCupoDe(c) {
    if (ocupado) return;
    const ok = await appConfirm(
      '¿Liberar la cita del ' + c.fecha + ' a las ' + horaBonitaAudiencias(c.hora) + '?\n\n' +
      'El cupo vuelve a estar libre y la visita queda sin fecha de citación.',
      { titulo: 'Liberar cita', btnOk: 'Sí, liberar', btnCancel: 'Cancelar', peligro: true });
    if (!ok) return;
    setOcupado(true);
    try {
      const r = await liberarCupoAudiencias(c.idCupo, 'Liberado desde la pestaña Audiencias');
      if (!r.ok) await appAlert(r.error || 'No se pudo liberar el cupo.', { tono: 'error' });
      setCitaAbierta(null);
      await cargar();
    } catch (e) {
      await appAlert('No se pudo liberar el cupo: ' + (e.message || e), { tono: 'error' });
    }
    setOcupado(false);
  }

  // «Decretar inspección al lugar» (hoja de la cita): marca el caso para la
  // bandeja «Por programar» de la Agenda. La fila es la última visita del caso.
  // La visita de la cita: por ID_VISITA y, si no, por radicado o N° de orden
  // (visitaDeCitaAudiencias, utils.js). Antes solo por radicado.
  function _casoTxtAU(c) {
    return c.radicado ? 'del radicado ' + c.radicado : (c.ordenPolicia ? 'de la orden ' + c.ordenPolicia : 'de esta cita');
  }

  async function decretarInspeccionDe(c) {
    const filas = (await leerVisitas()).datos || [];
    const f = visitaDeCitaAudiencias(filas, c);
    if (!f) throw new Error('No se encontró la visita ' + _casoTxtAU(c) + '.');
    await decretarInspeccionAudiencias(f);
  }

  async function abrirCita(c) {
    try {
      const filas = (await leerVisitas()).datos || [];
      const f = visitaDeCitaAudiencias(filas, c);
      if (f && window.abrirVisitaDetail) window.abrirVisitaDetail(f);
      else await appAlert('No se encontró la visita ' + _casoTxtAU(c) +
        '. Puede haberse cerrado como NO COMPETENCIA.');
    } catch (e) {
      await appAlert('No se pudo abrir la visita: ' + (e.message || e), { tono: 'error' });
    }
  }

  async function quitarNovedad(n) {
    if (ocupado) return;
    const ok = await appConfirm('¿Quitar «' + (n.motivo || 'esta novedad') + '» (' + n.desde +
      (n.hasta !== n.desde ? ' – ' + n.hasta : '') + ')? Sus cupos vuelven a estar disponibles.',
      { titulo: 'Quitar novedad', btnOk: 'Quitar', btnCancel: 'Cancelar' });
    if (!ok) return;
    setOcupado(true);
    try {
      const r = await desactivarNovedadAudiencias(n.id);
      if (!r.ok) await appAlert(r.error || 'No se pudo quitar la novedad.', { tono: 'error' });
      else await cargar();
    } catch (e) {
      await appAlert('No se pudo quitar la novedad: ' + (e.message || e), { tono: 'error' });
    }
    setOcupado(false);
  }

  async function guardarNovedad(ev) {
    ev.preventDefault();
    if (ocupado) return;
    const isoADdmmaaaa = function (iso) {
      return String(iso || '').split('-').reverse().join('/');
    };
    const form = ev.target;
    const payload = {
      desde: isoADdmmaaaa(form['au-nv-desde'].value),
      hasta: isoADdmmaaaa(form['au-nv-hasta'].value),
      sustanciador: esAdmin ? form['au-nv-sus'].value : usuario.usuario,
      franja: form['au-nv-franja'].value,
      motivo: form['au-nv-motivo'].value.trim()
    };
    if (!payload.desde || payload.desde.length < 8) {
      await appAlert('Falta la fecha inicial.', { tono: 'error' }); return;
    }
    if (!payload.hasta || payload.hasta.length < 8) {
      await appAlert('Falta la fecha final.', { tono: 'error' }); return;
    }
    setOcupado(true);
    try {
      const r = await guardarNovedadAudiencias(payload);
      if (!r.ok) {
        await appAlert(r.error || 'No se pudo guardar la novedad.', { tono: 'error' });
      } else {
        setAfectadas(r.afectadas || []);
        setNovForm(false);
        await cargar();
      }
    } catch (e) {
      await appAlert('No se pudo guardar la novedad: ' + (e.message || e), { tono: 'error' });
    }
    setOcupado(false);
  }

  // La app no sabe cuándo se pegó en el Excel: solo copia (✓ un momento).
  async function copiarFilaExcel(r) {
    try {
      await navigator.clipboard.writeText(r.filaTSV);
    } catch (e) {
      await appAlert(r.filaTSV.replace(/\t/g, ' · '), { titulo: 'Copiar fila' });
      return;
    }
    setCopiado(r.idCupo);
    setTimeout(function () { setCopiado(''); }, 1500);
  }

  // ── Escrituras de «Cupos» como lista (solo admin) ──
  // Desbloquear = quitar la novedad que bloquea esos cupos (puede abarcar
  // muchos); el texto dice cuál se quita y cuántos cupos libera.
  async function desbloquearCupo(c) {
    if (ocupado) return;
    const nov = novedades.find(function (n) { return String(n.id) === String(c.novedadId); });
    if (!nov) {
      await appAlert('Este bloqueo no tiene una novedad asociada: no se puede quitar desde aquí.', { tono: 'error' });
      return;
    }
    const n = (datos.cupos || []).filter(function (x) { return String(x.novedadId) === String(nov.id); }).length;
    const ok = await appConfirm(
      'Quita el bloqueo «' + (nov.motivo || '') + '» de ' +
      (nov.sustanciador === 'TODOS' ? 'todos' : titleCaseNombre(nov.sustanciador)) +
      ' del ' + nov.desde + (nov.hasta !== nov.desde ? ' al ' + nov.hasta : '') + ': ' +
      n + ' cupo' + (n === 1 ? '' : 's') + '.',
      { titulo: 'Desbloquear', btnOk: 'Sí, desbloquear', btnCancel: 'Cancelar' });
    if (!ok) return;
    setOcupado(true);
    try {
      const r = await desactivarNovedadAudiencias(nov.id);
      if (!r.ok) await appAlert(r.error || 'No se pudo quitar el bloqueo.', { tono: 'error' });
      else await cargar();
    } catch (e) {
      await appAlert('No se pudo quitar el bloqueo: ' + (e.message || e), { tono: 'error' });
    }
    setOcupado(false);
  }

  // «Copiar lista para el Excel» del aviso de por apartar: una fila por cupo,
  // fecha, hora y sustanciador separados por tabulador.
  async function copiarApartarTSV() {
    const tsv = (datos.cupos || []).filter(function (c) { return c.estado === 'POR_APARTAR'; })
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
    const ids = (datos.cupos || []).filter(function (c) { return c.estado === 'POR_APARTAR'; })
      .map(function (c) { return c.idCupo; });
    const ok = await appConfirm('¿Ya apartaste los ' + ids.length + ' cupos en el Excel del despacho?',
      { titulo: 'Apartar cupos', btnOk: 'Sí, ya los aparté', btnCancel: 'Cancelar' });
    if (!ok) return;
    setOcupado(true);
    try {
      const r = await confirmarCuposAudiencias(ids);
      if (!r.ok) {
        await appAlert(r.error || 'No se pudieron confirmar los cupos.', { tono: 'error' });
      } else {
        const nc = (r.noConfirmados || []).length;
        if (nc) await appAlert('El servidor no confirmó ' + nc + ' cupo' + (nc === 1 ? '' : 's') +
          ' (ya no estaban por apartar).', { tono: 'error' });
        await cargar();
      }
    } catch (e) {
      await appAlert('No se pudieron confirmar los cupos: ' + (e.message || e), { tono: 'error' });
    }
    setOcupado(false);
  }

  // Lo que el servidor omitió al crear cupos (ya existían, festivo…).
  function avisarOmitidosCupos(r) {
    const om = (r && r.omitidos) || [];
    if (!om.length) return;
    const lista = om.slice(0, 10).map(function (o) {
      return o.fecha + ' · ' + horaBonitaAudiencias(o.hora) + ' · ' + titleCaseNombre(o.sustanciador) +
        (o.motivo ? ' (' + o.motivo + ')' : '');
    }).join('\n');
    appAlert(lista + (om.length > 10 ? '\n…' : ''),
      { titulo: 'El servidor omitió ' + om.length + ' cupo' + (om.length === 1 ? '' : 's') });
  }

  // ── Derivados de vista ──
  const soloMias = esInsp && misCitas;

  const listaRows = useMemoAU(function () {
    if (!datos) return [];
    return filtrarListaAudiencias(datos.cupos, {
      q: lis.q, incluirPasadas: true, hoy: hoyTxt,
      deQuien: esInsp && !misCitas ? '' : (esInsp ? yo : '')
    });
  }, [datos, lis, hoyTxt, esInsp, misCitas, yo]);

  // Vista Agenda: filtros vigentes («Mis citas» del inspector, chip de
  // sustanciador — con sustanciador elegido las citas viejas no salen).
  const agendaDias = useMemoAU(function () {
    const opts = { soloDe: soloMias ? usuario.usuario : '', sustanciador: filtroSus };
    return agendaAudienciasDias(filas, (datos && datos.cupos) || [], hoyTxt, opts);
  }, [filas, datos, hoyTxt, soloMias, filtroSus]);

  const quedanCupos = esAdmin && datos && datos.ultimaFechaConCupo &&
    (function () {
      const n = diasHabilesHasta(parsearFecha(datos.ultimaFechaConCupo));
      return n != null && n < 30;
    })();

  // ── Render helpers ──
  function clicableCita(c) {
    if (esAdmin || esSup) return true;
    return normNombreAudiencias(c.reservadoPor) === yo;
  }

  // ═ early returns: todos los hooks ya corrieron ═
  if (cargando) {
    return <div className="au-pantalla"><p className="au-cargando">Cargando audiencias…</p></div>;
  }
  if (error) {
    return (
      <div className="au-pantalla">
        <header className="au-cab"><h1>{esInsp ? 'Citaciones' : 'Audiencias'}</h1></header>
        <div className="au-vacio"><b>No se pudo cargar</b>{error}
          <button type="button" className="btn-accion" onClick={function () { cargar(); }}>Reintentar</button>
        </div>
      </div>
    );
  }
  if (!datos) return null;

  if (!datos.cupos.length) {
    return (
      <div className="au-pantalla">
        <header className="au-cab"><h1>{esInsp ? 'Citaciones' : 'Audiencias'}</h1></header>
        <div className="au-vacio">
          <b>Sin cupos cargados</b>
          La hoja AUDIENCIAS está vacía: falta pegar la lista CUPOS_CU del Excel del despacho.
          <button type="button" className="btn-accion" onClick={function () { cargar(); }}>Reintentar</button>
        </div>
      </div>
    );
  }

  // ── Vista Agenda (arquitectura 2026-10-27, punto 5) ──
  // Une «Hoy» y «Programadas»: de hoy en adelante, un grupo por día con
  // audiencias, hoy arriba (si no hay hoy, arranca en el siguiente día con
  // audiencias). Las dos fuentes, como la vieja «Hoy»: los cupos del bloque
  // (traen sustanciador) y las citas anotadas en FECHA CITACION de la visita
  // (sin sustanciador: no se inventa). Nada se reubica en «hoy».
  function filaCitaAgenda(r, clave) {
    const clicable = r.fuente === 'bloque' ? clicableCita(r.cupo) : !!r.fila;
    const Tag = clicable ? 'button' : 'div';
    const alClic = !clicable ? undefined : (r.fuente === 'bloque'
      ? function () { setCitaAbierta(r.cupo); }
      : function () { window.abrirVisitaDetail(r.fila); });
    return (
      <div className="au-row" key={clave}>
        <span className="hora">{r.hora ? horaBonitaAudiencias(r.hora) : 'Sin hora'}</span>
        <Tag className="t" type={clicable ? 'button' : undefined} onClick={alClic}>
          <b>{r.citado || _auCaso(r.caso)}</b>{r.citado ? <> · {_auCaso(r.caso)}</> : null}
          <small>{[r.direccion, r.inspector ? titleCaseNombre(r.inspector) : '',
            filtroSus ? '' : (r.sustanciador ? titleCaseNombre(r.sustanciador) : 'sin sustanciador')].filter(Boolean).join(' · ')}</small>
        </Tag>
      </div>
    );
  }

  function renderAgenda() {
    if (!agendaDias.length) return <p className="au-vacio-hoy">Sin audiencias de hoy en adelante</p>;
    return (
      <div>
        {agendaDias.map(function (g) {
          return (
            <div className={'au-grupo' + (g.fecha === hoyTxt ? ' hoy' : '')} key={g.fecha}>
              <h2>{g.fecha === hoyTxt ? 'Hoy · ' : ''}{_auMayus(_auFechaLarga(g.fecha))}
                <span className="au-grupo-n"> · {g.citas.length} audiencia{g.citas.length === 1 ? '' : 's'}</span></h2>
              {g.citas.map(function (r, i) { return filaCitaAgenda(r, g.fecha + i); })}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Vista Cupos (2026-11-03): la lista de la maqueta propuesta-cupos.html ──
  function accionesCupo(c) {
    const btn = function (act, txt) {
      return (
        <button type="button" key={act} className="btn-neutro btn-chico au-cl-act-btn"
          onClick={function () {
            if (act === 'bloquear') setHojaCupo({ t: 'bloquear', ids: [c.idCupo] });
            else if (act === 'eliminar') setHojaCupo({ t: 'eliminar', ids: [c.idCupo] });
            else if (act === 'cita') setCitaAbierta(c);
            else if (act === 'desbloquear') desbloquearCupo(c);
          }}>
          {txt}
        </button>
      );
    };
    if (c.estado === 'LIBRE') return [btn('bloquear', 'Bloquear'), btn('eliminar', 'Eliminar')];
    if (c.estado === 'POR_APARTAR') return [btn('eliminar', 'Eliminar')];
    if (c.estado === 'RESERVADO') return [btn('cita', 'Ver cita')];
    if (c.estado === 'BLOQUEADO') return [btn('desbloquear', 'Desbloquear')];
    return null;
  }

  function filaCupo(c) {
    const E = _AU_ESTADOS_CUPOS[c.estado] || { texto: c.estado, anillo: 'pendiente' };
    const on = !!selCupos[c.idCupo];
    // _auCaso puede devolver la etiqueta del expediente (JSX): se intercala con
    // « · », no con join, que la volvía «[object Object]».
    const det = c.estado === 'RESERVADO'
      ? [_auCaso(c), c.citado, c.reservadoPor ? titleCaseNombre(c.reservadoPor) : ''].filter(Boolean)
          .map(function (p, i) { return <React.Fragment key={i}>{i ? ' · ' : ''}{p}</React.Fragment>; })
      : c.estado === 'BLOQUEADO' ? (c.motivoBloqueo || '') : '';
    return (
      <div className={'au-cl-cupo' + (on ? ' sel' : '')} key={c.idCupo}>
        {esAdmin && (
          <label className="au-cl-sel">
            <input type="checkbox" checked={on}
              aria-label={'Seleccionar ' + c.fecha + ', ' + horaBonitaAudiencias(c.hora) + ', ' + titleCaseNombre(c.sustanciador)}
              onChange={function () {
                setSelCupos(function (prev) {
                  const n = Object.assign({}, prev);
                  if (n[c.idCupo]) delete n[c.idCupo]; else n[c.idCupo] = true;
                  return n;
                });
              }} />
          </label>
        )}
        <span className="au-cl-hora">{horaBonitaAudiencias(c.hora)}</span>
        <span className="au-cl-sust">{titleCaseNombre(c.sustanciador)}</span>
        <span className="au-cl-estado"><EstadoAnillo estado={E.anillo} /><b>{E.texto}</b></span>
        <span className="au-cl-det">{det}</span>
        {esAdmin && <div className="au-cl-act">{accionesCupo(c)}</div>}
      </div>
    );
  }

  function renderCupos() {
    const filtrados = cuposVisibles;
    const res = resumenCuposLista(filtrados);
    const porDia = [];
    const porFecha = {};
    filtrados.forEach(function (c) {
      if (!porFecha[c.fecha]) { porFecha[c.fecha] = []; porDia.push(c.fecha); }
      porFecha[c.fecha].push(c);
    });
    const porApartar = (datos.cupos || []).filter(function (c) { return c.estado === 'POR_APARTAR'; });
    const nFiltros = (fMes !== 'todos' ? 1 : 0) + (fEstado !== 'todos' ? 1 : 0);
    const chip = function (on, txt, fn, clave) {
      return <button type="button" key={clave} className={'au-chip' + (on ? ' on' : '')}
        aria-pressed={on ? 'true' : 'false'} onClick={fn}>{txt}</button>;
    };
    return (
      <div className={esAdmin ? '' : 'au-cl-sinadm'}>
        <p className="au-cl-resumen">
          <b>{res.libres}</b> {res.libres === 1 ? 'libre' : 'libres'} · <b>{res.citados}</b> {res.citados === 1 ? 'citado' : 'citados'} ·
          {' '}<b>{res.bloqueados}</b> {res.bloqueados === 1 ? 'bloqueado' : 'bloqueados'}
          {res.porApartar > 0 && <> · <b>{res.porApartar}</b> por apartar</>}
          {res.hasta && <> · hasta el {res.hasta}</>}
        </p>
        <div className="au-cl-fila">
          <div className={'au-cl-filtros' + (fCuposAbiertos ? ' abierta' : '')} id="au-cl-filtros">
            <span className="au-cl-filtro">
              <span>Mes</span>
              {chip(fMes === 'todos', 'Todos', function () { setFMes('todos'); }, 'mes-todos')}
              {mesesCupos.map(function (m) { return chip(fMes === m.k, m.txt, function () { setFMes(m.k); }, m.k); })}
            </span>
            <span className="au-cl-filtro">
              <span>Estado</span>
              {chip(fEstado === 'todos', 'Todos', function () { setFEstado('todos'); }, 'est-todos')}
              {[['POR_APARTAR', 'Por apartar'], ['LIBRE', 'Libre'], ['RESERVADO', 'Citado'], ['BLOQUEADO', 'Bloqueado']]
                .map(function (p) { return chip(fEstado === p[0], p[1], function () { setFEstado(p[0]); }, p[0]); })}
            </span>
          </div>
          <button type="button" className="au-chip au-cl-btn-filtros" aria-expanded={fCuposAbiertos ? 'true' : 'false'}
            aria-controls="au-cl-filtros" onClick={function () { setFCuposAbiertos(!fCuposAbiertos); }}>
            {nFiltros ? 'Filtros · ' + nFiltros : 'Filtros'}
          </button>
          {esAdmin && (
            <button type="button" className="btn-principal au-cl-agregar" onClick={function () { setHojaCupo({ t: 'agregar' }); }}>
              Agregar cupos
            </button>
          )}
        </div>
        {esAdmin && porApartar.length > 0 && (
          <div className="au-cl-aviso">
            <span className="au-cl-aviso-txt">
              <b>{porApartar.length} {porApartar.length === 1 ? 'cupo' : 'cupos'} por apartar en el Excel.</b> Hasta confirmarlos, nadie puede pedirlos.
            </span>
            <span className="au-cl-aviso-btn">
              <button type="button" className="btn-neutro btn-chico" disabled={ocupado} onClick={copiarApartarTSV}>
                {copiadoApartar ? '✓ Copiado' : 'Copiar lista para el Excel'}
              </button>
              <button type="button" className="btn-neutro btn-chico" disabled={ocupado} onClick={confirmarApartar}>Ya los aparté</button>
            </span>
          </div>
        )}
        {!filtrados.length && <p className="au-vacio-hoy">No hay cupos con esos filtros.</p>}
        {porDia.map(function (fecha) {
          const dia = porFecha[fecha];
          // El conteo dice todos los estados de lo que se ve (antes un día mixto
          // escondía bloqueados y por apartar). «Bloquear el día» bloquea a todos
          // los sustanciadores: mira el día entero y no sale si ya no queda
          // ningún cupo que pedir (resumenDiaCupos, puedeBloquearDiaCupos).
          const diaEntero = (datos.cupos || []).filter(function (c) { return c.fecha === fecha; });
          return (
            <div className="au-cl-dia" key={fecha}>
              <div className="au-cl-dia-cab">
                <h2>{_auMayus(_auFechaLarga(fecha))}</h2>
                <span className="au-cl-dia-n">{resumenDiaCupos(dia)}</span>
                {esAdmin && puedeBloquearDiaCupos(diaEntero) && (
                  <button type="button" className="au-cl-texto" onClick={function () { setHojaCupo({ t: 'dia', fecha: fecha }); }}>
                    Bloquear el día
                  </button>
                )}
              </div>
              {dia.map(filaCupo)}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Vista Lista ──
  function renderLista() {
    const n = listaRows.length;
    return (
      <div>
        <div className="au-lis-tools">
          <input className="au-lis-buscar" type="search" value={lis.q}
            placeholder="Nombre, radicado, orden, expediente o documento"
            aria-label="Buscar citación"
            onChange={function (e) { setLis(Object.assign({}, lis, { q: e.target.value })); }} />
        </div>
        <p className="au-hoy-libres">{n} citaci{n === 1 ? 'ón' : 'ones'}</p>
        {!n ? <p className="au-vacio-hoy">Sin resultados</p> : (<>
          <div className="au-tabla">
            <table>
              <thead><tr><th>Fecha</th><th>Hora</th><th>Sustanciador</th><th>Exp./Radicado</th>
                <th>Citado</th><th>Documento</th><th>Inspector</th></tr></thead>
              <tbody>
                {listaRows.map(function (c) {
                  // Con teclado se abre desde el botón de la fecha (la fila
                  // sigue siendo clicable con el puntero): un <tr> con onClick
                  // no recibe foco y la cita no se podía abrir sin mouse.
                  const clic = clicableCita(c);
                  return (
                    <tr key={c.idCupo} className={clic ? 'clic' : ''}
                      onClick={clic ? function () { setCitaAbierta(c); } : undefined}>
                      <td>{clic
                        ? <button type="button" className="au-tabla-abrir"
                            aria-label={'Abrir la cita del ' + c.fecha + ', ' + horaBonitaAudiencias(c.hora) + (c.citado ? ', ' + c.citado : '')}
                            onClick={function (e) { e.stopPropagation(); setCitaAbierta(c); }}>{c.fecha}</button>
                        : c.fecha}</td>
                      <td>{horaBonitaAudiencias(c.hora)}</td>
                      <td>{titleCaseNombre(c.sustanciador)}</td>
                      <td>{_auCaso(c)}</td>
                      <td><b>{c.citado}</b></td>
                      <td>{c.citado ? _auDocTxt(c) : null}</td>
                      <td>{titleCaseNombre(c.reservadoPor || '')}{esAdmin && c.sinVisita && <span className="au-sindoc"> · sin visita asociada</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="au-lrows">
            {listaRows.map(function (c) {
              // Clicable = botón (foco y Enter/Espacio); si no, un div.
              const clic = clicableCita(c);
              const Fila = clic ? 'button' : 'div';
              return (
                <Fila className={'au-lrow' + (clic ? ' clic' : '')} key={c.idCupo}
                  type={clic ? 'button' : undefined}
                  onClick={clic ? function () { setCitaAbierta(c); } : undefined}>
                  <span className="l1"><span>{c.fecha} · {horaBonitaAudiencias(c.hora)}</span></span>
                  <span className="l2"><b>{c.citado || _auCaso(c)}</b>{c.citado ? <> · {_auDocTxt(c)}</> : null}</span>
                  <span className="l3">{_auCaso(c)} · {titleCaseNombre(c.sustanciador)} · {titleCaseNombre(c.reservadoPor || '')}
                    {esAdmin && c.sinVisita ? ' · sin visita asociada' : ''}</span>
                </Fila>
              );
            })}
          </div>
        </>)}
      </div>
    );
  }

  // ── Días sin audiencias (ventana; admin y supervisor) ──
  function renderNovedades() {
    const hoyD = parsearFecha(hoyTxt);
    const mias = novedades.filter(function (n) {
      if (n.activa === false) return false;
      const h = parsearFecha(n.hasta);
      if (h && hoyD && h < hoyD) return false;   // vencida: ya no bloquea nada
      return !esSup || normNombreAudiencias(n.sustanciador) === yo;
    }).sort(function (a, b) { return (parsearFecha(a.desde) || 0) - (parsearFecha(b.desde) || 0); });
    return (
      <NovedadesHoja mias={mias} esAdmin={esAdmin} usuario={usuario} sustanciadores={sustanciadores}
        ocupado={ocupado} novForm={novForm} afectadas={afectadas}
        onCerrar={function () { setNovAbierta(false); }}
        onQuitar={quitarNovedad}
        onAbrirForm={function () { setNovForm(true); setAfectadas(null); }}
        onCancelarForm={function () { setNovForm(false); }}
        onGuardar={guardarNovedad} />
    );
  }

  // ── Citaciones visitas completadas (solo admin): copiar y pegar en el Excel ──
  function renderCompletadas() {
    if (!excel) return null;
    // Las del backend (cupos del bloque) + las citas escritas a mano en una visita completada.
    const lista = citacionesCompletadasExcel(excel.lista, filas, hoyTxt);
    return (
      <section className="au-caja" aria-labelledby="au-t-exc">
        <h2 id="au-t-exc">Citaciones visitas completadas</h2>
        {!lista.length ? <p className="au-vacio-hoy">Sin citaciones</p> : lista.map(function (r) {
          return (
            <div className="au-row" key={r.idCupo}>
              <span className="t">
                <b>{_auDiaCorto(r.fecha)}/{String(r.fecha).slice(-4)} · {horaBonitaAudiencias(r.hora)}</b>
                {r.fechaCompletada && <small>Completada {formatearFecha(r.fechaCompletada)}</small>}
                <small>{r.sustanciador ? titleCaseNombre(r.sustanciador) : 'sin sustanciador'} · {r.expediente === 'NUEVO' ? r.radicado : <span className="exp-tag">Exp. {r.expediente}</span>}{r.citado ? ' · ' + r.citado : ''}</small>
              </span>
              <button type="button" className={'au-copy' + (copiado === r.idCupo ? ' ok' : '')}
                aria-label="Copiar fila para el Excel" title="Copiar fila para el Excel"
                onClick={function () { copiarFilaExcel(r); }}>
                {copiado === r.idCupo ? '✓' : _AU_SVG_COPIAR}
              </button>
            </div>
          );
        })}
      </section>
    );
  }

  // ── Pedidas hoy: lo que reservaron hoy todos los inspectores ──
  function renderPedidasHoy() {
    const lista = pedidasHoyAudiencias(datos.cupos, hoyTxt);
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
            <small>{titleCaseNombre(c.sustanciador)} · {mia ? 'tú' : titleCaseNombre(c.reservadoPor)}
              {estado === 'cola' ? ' · en cola' : estado === 'fallo' ? ' · no se pudo: pide otra' : ''}</small>
          </Tag>
        </div>
      );
    };
    const pend = pendientes.map(function (p) {
      return fila(Object.assign({}, p.cupo, { radicado: p.caso.radicado, ordenPolicia: p.caso.ordenPolicia }),
        p.estado, 'p' + p.requestId);
    });
    return (
      <section className="au-caja au-pedidas" aria-labelledby="au-t-ped">
        <h2 id="au-t-ped">Pedidas hoy</h2>
        {!lista.length && !pend.length ? <p className="au-vacio-hoy">Ninguna</p> : null}
        {pend}
        {lista.map(function (c) {
          return fila(c, 'ok', c.idCupo, clicableCita(c) ? function () { setCitaAbierta(c); } : undefined);
        })}
      </section>
    );
  }

  // ── Pantalla ──
  const franjaNovTxt = esAdmin || esSup ? (datos.novedadesActivas ? ' · ' + datos.novedadesActivas : '') : '';
  // Solo lo elegido que se ve: un filtro puede esconder cupos ya marcados.
  const selCuposLista = vista === 'sem' ? seleccionCuposVisible(selCupos, cuposVisibles) : [];
  const selCuposIds = selCuposLista.map(function (c) { return c.idCupo; });
  const selCitados = selCuposLista.filter(function (c) { return c.estado === 'RESERVADO'; });
  const hojaCuposLista = hojaCupo && hojaCupo.ids
    ? hojaCupo.ids.map(function (id) { return (datos.cupos || []).find(function (c) { return c.idCupo === id; }); }).filter(Boolean)
    : [];
  const hojaDiaCitados = hojaCupo && hojaCupo.t === 'dia'
    ? (datos.cupos || []).filter(function (c) { return c.fecha === hojaCupo.fecha && c.estado === 'RESERVADO'; })
    : [];
  const barraCuposVisible = vista === 'sem' && selCuposIds.length > 0;
  return (
    <div className={'au-pantalla' + (barraCuposVisible ? ' au-cl-con-barra' : '')}>
      <header className="au-cab">
        <h1>{esInsp ? 'Citaciones' : 'Audiencias'}</h1>
        {!esSup && (
          <button type="button" className="btn-principal au-btn-pedir" onClick={function () { setPedirAbierto(true); }}>
            Pedir cita
          </button>
        )}
        {(esAdmin || esSup) && (
          <button type="button" className="btn-neutro btn-chico au-btn-nov" aria-haspopup="dialog"
            onClick={function () { setNovAbierta(true); setNovForm(false); setAfectadas(null); }}>
            <Icon.Admin size={14} aria-hidden="true" />
            <span>Días sin audiencias{franjaNovTxt}</span>
          </button>
        )}
      </header>

      {sinConexion && <p className="au-aviso-linea">Sin conexión</p>}
      {quedanCupos && (
        <p className="au-aviso-linea">Quedan cupos solo hasta el <b>{datos.ultimaFechaConCupo}</b>. Hay que apartar más en el Excel.</p>
      )}

      {esInsp && renderPedidasHoy()}

      <div className={esAdmin ? 'au-grid' : ''}>
      <div className="au-principal">
      <div className="au-topbar">
        <button type="button" className={'au-chip' + (vista === 'agenda' ? ' on' : '')}
          onClick={function () { setVista('agenda'); setSelCupos({}); }}>Agenda</button>
        {!esInsp && <button type="button" className={'au-chip' + (vista === 'sem' ? ' on' : '')}
          onClick={function () { setVista('sem'); setFCuposAbiertos(false); }}>Cupos</button>}
        <button type="button" className={'au-chip' + (vista === 'lis' ? ' on' : '')}
          onClick={function () { setVista('lis'); setSelCupos({}); }}>Lista</button>
        <span className="sp"></span>
        {esInsp
          ? [['mias', 'Mis citas'], ['todas', 'Todas']].map(function (par) {
              return <button type="button" key={par[0]} className={'au-chip' + ((misCitas === (par[0] === 'mias')) ? ' on' : '')}
                onClick={function () { setMisCitas(par[0] === 'mias'); }}>{par[1]}</button>;
            })
          : [<button type="button" key="todos" className={'au-chip' + (!filtroSus ? ' on' : '')}
              onClick={function () { setFiltroSus(''); }}>Todos</button>].concat(
              sustanciadores.map(function (s) {
                const corto = titleCaseNombre(s.nombre.split(' ')[0]);
                return <button type="button" key={s.norm} className={'au-chip' + (filtroSus === s.norm ? ' on' : '')}
                  onClick={function () { setFiltroSus(s.norm); }}>{corto}</button>;
              }))}
      </div>

      {vista === 'agenda' && renderAgenda()}
      {vista === 'sem' && renderCupos()}
      {vista === 'lis' && renderLista()}
      </div>

      {esAdmin && (
        <aside className="au-riel">
          {renderCompletadas()}
          {renderPedidasHoy()}
        </aside>
      )}
      </div>

      {novAbierta && renderNovedades()}
      {pedirAbierto && (
        <PedirCitaHoja usuario={usuario} agenda={datos.cupos} cuposIniciales={cuposPedir}
          onCerrar={function () { setPedirAbierto(false); }}
          onReservada={function () { cargar(); precargarCupos(); }} />
      )}
      {barraCuposVisible && (
        <div className="au-cl-barra" role="region" aria-label="Cupos seleccionados">
          <span className="au-cl-barra-cuenta">{selCuposIds.length} {selCuposIds.length === 1 ? 'seleccionado' : 'seleccionados'}</span>
          {selCitados.length > 0 && (
            <span className="au-cl-ignora">{selCitados.length} {selCitados.length === 1 ? 'citado se ignora' : 'citados se ignoran'}</span>
          )}
          <span className="au-cl-barra-acc">
            <button type="button" className="btn-neutro" onClick={function () { setHojaCupo({ t: 'bloquear', ids: selCuposIds }); }}>Bloquear</button>
            <button type="button" className="btn-neutro" onClick={function () { setHojaCupo({ t: 'eliminar', ids: selCuposIds }); }}>Eliminar</button>
            <button type="button" className="au-cl-texto" onClick={function () { setSelCupos({}); }}>Quitar selección</button>
          </span>
        </div>
      )}
      {hojaCupo && hojaCupo.t === 'agregar' && (
        <AgregarCuposHoja existentes={datos.cupos} sustanciadores={sustanciadores} hoy={_auHoy()}
          onCerrar={function () { setHojaCupo(null); }}
          onListo={function (r) { setHojaCupo(null); avisarOmitidosCupos(r); cargar(); }} />
      )}
      {hojaCupo && hojaCupo.t === 'bloquear' && (
        <BloquearCuposHoja
          cupos={hojaCuposLista.filter(function (c) { return c.estado !== 'RESERVADO' && c.estado !== 'BLOQUEADO'; })}
          citados={hojaCuposLista.filter(function (c) { return c.estado === 'RESERVADO'; })}
          onCerrar={function () { setHojaCupo(null); }}
          onListo={function () { setHojaCupo(null); setSelCupos({}); cargar(); }} />
      )}
      {hojaCupo && hojaCupo.t === 'eliminar' && (
        <EliminarCuposHoja cupos={hojaCuposLista.filter(function (c) { return c.estado !== 'RESERVADO'; })}
          onCerrar={function () { setHojaCupo(null); }}
          onListo={function () { setHojaCupo(null); setSelCupos({}); cargar(); }} />
      )}
      {hojaCupo && hojaCupo.t === 'dia' && (
        <BloquearDiaHoja fecha={hojaCupo.fecha} citados={hojaDiaCitados}
          onCerrar={function () { setHojaCupo(null); }}
          onListo={function () { setHojaCupo(null); cargar(); }} />
      )}
      {citaAbierta && (
        <CitaHoja cita={citaAbierta} esAdmin={esAdmin} ocupado={ocupado}
          onCerrar={function () { setCitaAbierta(null); }}
          onVerVisita={function () { const c = citaAbierta; setCitaAbierta(null); abrirCita(c); }}
          onLiberar={function () { liberarCupoDe(citaAbierta); }}
          onDecretar={(esAdmin || esSup) ? decretarInspeccionDe : null} />
      )}
    </div>
  );
}
