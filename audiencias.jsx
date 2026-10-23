// ═══════════════════════════════════════════════════════════════
// v6/audiencias.jsx — Pestaña «Audiencias» («Citaciones» para el inspector).
//   La agenda del bloque de cupos de Control Urbano (maqueta v5,
//   propuesta-audiencias.html). TASK 3a + 3b (2026-10-21).
//
//   El inspector pide la cita en campo («Pedir cita»: caso de su agenda de hoy
//   o escrito, y uno de los 5 cupos más próximos; sin señal, sus 3 apartados).
//   Vistas: Hoy · Semana · Lista. ADMIN ve todo, libera cupos y copia las
//   «Citaciones visitas completadas» para pegarlas en el Excel; SUPERVISOR
//   entra filtrado por su nombre y solo gestiona sus novedades; INSPECTOR
//   solo lectura, en «Mis citas». No es una pestaña de alertas.
//
//   Datos: agendaAudiencias (todos los cupos con estado, una lectura),
//   listarNovedades y, solo admin, listaDiariaExcel. La lógica va en
//   utils.js (tests/audiencias-pantalla.test.js); aquí solo se pinta.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateAU, useEffect: useEffectAU, useMemo: useMemoAU } = React;

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

function _auMismoRad(a, b) {
  const da = String(a || '').replace(/\D/g, '');
  const db = String(b || '').replace(/\D/g, '');
  return !!(da && db && da === db);
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
function PedirCitaHoja({ usuario, agenda, cuposIniciales, onCerrar, onReservada }) {
  const [filas, setFilas] = useStateAU([]);
  const [caso, setCaso] = useStateAU(null);
  const [texto, setTexto] = useStateAU('');
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
    <div className="au-ovl au-hoj-ovl on" role="dialog" aria-modal="true" aria-label="Pedir cita"
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

// ── Detalle de una cita ────────────────────────────────────────
// Lo que se toca en Hoy, Semana o Lista. Es el único lugar desde donde el
// admin libera una cita (antes estaba a un toque en cada fila). El
// sustanciador abre de aquí el acta y el informe para preparar la audiencia.
function CitaHoja({ cita, esAdmin, ocupado, onCerrar, onVerVisita, onLiberar }) {
  const c = cita;
  return (
    <div className="au-ovl au-hoj-ovl on" role="dialog" aria-modal="true" aria-label="Cita"
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
        {esAdmin && (
          <button type="button" className="au-cita-liberar" disabled={ocupado} onClick={onLiberar}>Liberar cita</button>
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
  const [vista, setVista] = useStateAU('prog');
  const [filtroSus, setFiltroSus] = useStateAU(''); // '' = todos; norm(nombre)
  const [misCitas, setMisCitas] = useStateAU(true); // inspector: «Mis citas» al entrar
  const [offsetSem, setOffsetSem] = useStateAU(0);
  const [diaCel, setDiaCel] = useStateAU(0);
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

  const dias = useMemoAU(() => agruparAudienciasPorDia((datos && datos.cupos) || []), [datos]);
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

  // El supervisor entra filtrado por su nombre como sustanciador.
  useEffectAU(() => {
    if (esSup && !filtroSus) {
      const mio = sustanciadores.find(function (s) { return s.norm === yo; });
      if (mio) setFiltroSus(mio.norm);
    }
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

  async function abrirCita(c) {
    try {
      const filas = (await leerVisitas()).datos || [];
      const idv = String(c.idVisita || '').trim();
      const f = filas.find(function (x) {
          return idv && String(x['ID_VISITA'] || '').trim() === idv; }) ||
        filas.find(function (x) { return _auMismoRad(x['RADICADO'], c.radicado); });
      if (f && window.abrirVisitaDetail) window.abrirVisitaDetail(f);
      else await appAlert('No se encontró la visita del radicado ' + (c.radicado || '?') +
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

  // ── Derivados de vista ──
  const soloMias = esInsp && misCitas;

  const cuposDeDiaFiltrados = function (dia) {
    if (!dia) return [];
    return dia.cupos.filter(function (c) {
      return !filtroSus || normNombreAudiencias(c.sustanciador) === filtroSus;
    });
  };

  const semanas = useMemoAU(function () {
    // Días agrupados por semana (lunes a domingo), por offset desde la semana
    // actual: las pasadas quedan en offsets negativos (antes se amontonaban en la 0).
    const hoy = _auHoy();
    const lunesHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const out = { min: 0, max: 0 };
    dias.forEach(function (d) {
      const f = parsearFecha(d.fecha);
      if (!f) return;
      const k = Math.floor((f - lunesHoy) / (7 * 86400000));
      (out[k] = out[k] || []).push(d);
      out.min = Math.min(out.min, k); out.max = Math.max(out.max, k);
    });
    return out;
  }, [dias]);

  const diasSem = semanas[offsetSem] || [];
  const semanaInfo = useMemoAU(function () {
    let cupos = 0, citados = 0;
    diasSem.forEach(function (d) {
      const vis = cuposDeDiaFiltrados(d);
      cupos += vis.length;
      citados += vis.filter(function (c) { return c.estado === 'RESERVADO'; }).length;
    });
    const primera = diasSem[0] ? diasSem[0].fecha : '';
    const ultima = diasSem.length ? diasSem[diasSem.length - 1].fecha : '';
    return { cupos: cupos, citados: citados, primera: primera, ultima: ultima };
  }, [diasSem, filtroSus]);

  const listaRows = useMemoAU(function () {
    if (!datos) return [];
    return filtrarListaAudiencias(datos.cupos, {
      q: lis.q, incluirPasadas: true, hoy: hoyTxt,
      deQuien: esInsp && !misCitas ? '' : (esInsp ? yo : '')
    });
  }, [datos, lis, hoyTxt, esInsp, misCitas, yo]);

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

  function filaCita(c, clave) {
    const clicable = clicableCita(c);
    const Tag = clicable ? 'button' : 'div';
    return (
      <div className="au-row" key={clave}>
        <span className="hora">{horaBonitaAudiencias(c.hora)}</span>
        <Tag className="t" type={clicable ? 'button' : undefined} onClick={clicable ? function () { setCitaAbierta(c); } : undefined}>
          <b>{c.citado || _auCaso(c)}</b>{c.citado ? <> · {_auCaso(c)}</> : null}
          <small>{[filtroSus ? '' : titleCaseNombre(c.sustanciador), c.direccion, soloMias ? '' : titleCaseNombre(c.reservadoPor || '')].filter(Boolean).join(' · ')}</small>
        </Tag>
      </div>
    );
  }

  function bloqueoLinea(texto, extra) {
    return <div className="au-dia-bloq">{texto}{extra ? ' · ' + extra : ''}</div>;
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

  // ── Vista Programadas (2026-10-22, decisión del usuario) ──
  // Las audiencias ya agendadas, de hoy en adelante, agrupadas por día desde
  // la más próxima (sea cuando sea). Solo días con citas: los cupos libres se
  // ven en «Cupos» (admin y supervisor) y en «Pedir cita».
  function renderProgramadas() {
    const hoyD = parsearFecha(hoyTxt);
    const grupos = dias.map(function (d) {
      const f = parsearFecha(d.fecha);
      if (!f || (hoyD && f < hoyD)) return null;
      const citas = d.cupos.filter(function (c) {
        return c.estado === 'RESERVADO' &&
          (!filtroSus || normNombreAudiencias(c.sustanciador) === filtroSus) &&
          (!soloMias || normNombreAudiencias(c.reservadoPor) === yo);
      });
      return citas.length ? { fecha: d.fecha, citas: citas } : null;
    }).filter(Boolean);
    if (!grupos.length) return <p className="au-vacio-hoy">Sin audiencias programadas</p>;
    return (
      <div>
        {grupos.map(function (g) {
          return (
            <div className="au-grupo" key={g.fecha}>
              <h3>{g.fecha === hoyTxt ? 'Hoy · ' : ''}{_auMayus(_auFechaLarga(g.fecha))}
                <span className="au-grupo-n"> · {g.citas.length} cita{g.citas.length === 1 ? '' : 's'}</span></h3>
              {g.citas.map(function (c) { return filaCita(c, c.idCupo); })}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Vista Semana ──
  function tarjetaCupo(c, clave) {
    const mia = normNombreAudiencias(c.reservadoPor) === yo;
    const clicable = c.estado === 'RESERVADO' && (esAdmin || esSup || mia);
    const Tag = clicable ? 'button' : 'div';
    const clase = 'au-cupo ' + (c.estado === 'RESERVADO' ? 'citado' : c.estado === 'BLOQUEADO' ? 'novedad' : 'libre');
    const etiqueta = c.estado === 'RESERVADO' ? 'Citado' : c.estado === 'BLOQUEADO' ? 'Sin audiencia' : 'Libre';
    return (
      <Tag className={clase} key={clave} type={clicable ? 'button' : undefined}
        onClick={clicable ? function () { setCitaAbierta(c); } : undefined}
        title={c.estado === 'BLOQUEADO' ? 'Día sin audiencias · ' + c.motivoBloqueo : undefined}>
        <span className="h1l">
          <span className="hora">{horaBonitaAudiencias(c.hora)}</span>
          <span className="au-estado">{etiqueta}</span>
        </span>
        {c.estado === 'RESERVADO' ? <>
          <span className="exp">{_auCaso(c)}</span>
          <span className="quien">{[c.citado, soloMias ? '' : titleCaseNombre(c.reservadoPor || '')].filter(Boolean).join(' · ')}</span>
        </> : (filtroSus ? null : <span className="sus">{titleCaseNombre(c.sustanciador)}</span>)}
      </Tag>
    );
  }

  function renderSemana() {
    const idxCel = Math.max(0, Math.min(diaCel, diasSem.length - 1));
    return (
      <div>
        <div className="au-sem-bar">
          <button type="button" className="au-flecha" disabled={offsetSem <= semanas.min}
            onClick={function () { setOffsetSem(offsetSem - 1); setDiaCel(0); }} aria-label="Semana anterior">‹</button>
          <div className="au-sem-tit">
            {semanaInfo.primera
              ? 'Semana del ' + semanaInfo.primera + ' al ' + semanaInfo.ultima
              : 'Semana sin audiencias'}
            <small>{semanaInfo.citados} cita{semanaInfo.citados === 1 ? '' : 's'} · {semanaInfo.cupos - semanaInfo.citados} libre{semanaInfo.cupos - semanaInfo.citados === 1 ? '' : 's'}</small>
          </div>
          <button type="button" className="au-flecha" disabled={offsetSem >= semanas.max}
            onClick={function () { setOffsetSem(offsetSem + 1); setDiaCel(0); }} aria-label="Semana siguiente">›</button>
        </div>
        {!diasSem.length ? (
          <p className="au-vacio-hoy">Sin cupos esta semana (festivo o sin audiencias del bloque).</p>
        ) : (<>
          <div className="au-dia-tabs" role="group" aria-label="Elegir día">
            {diasSem.map(function (d, i) {
              return <button type="button" key={d.fecha} className={'au-chip' + (i === idxCel ? ' on' : '')}
                onClick={function () { setDiaCel(i); }}>{_auDiaCorto(d.fecha)}</button>;
            })}
          </div>
          <div className="au-dias">
            {diasSem.map(function (d, i) {
              const vis = cuposDeDiaFiltrados(d);
              const todoBloqueado = vis.length > 0 && vis.every(function (c) { return c.estado === 'BLOQUEADO'; });
              const libres = vis.filter(function (c) { return c.estado === 'LIBRE'; }).length;
              const mostrar = soloMias ? vis.filter(function (c) {
                return c.estado === 'RESERVADO' && normNombreAudiencias(c.reservadoPor) === yo;
              }) : vis;
              return (
                <div className={'au-dia' + (i === idxCel ? ' on' : '')} key={d.fecha}>
                  <div className="au-dia-cab">
                    <b>{_auDiaCorto(d.fecha)}</b>
                    <span>{todoBloqueado ? 'sin audiencias'
                      : soloMias ? (mostrar.length ? mostrar.length + ' tuya' + (mostrar.length === 1 ? '' : 's') : 'sin citas tuyas')
                      : (vis.length ? (vis.length - libres) + ' cita' + (vis.length - libres === 1 ? '' : 's') + ' · ' + libres + ' libre' + (libres === 1 ? '' : 's') : 'sin cupos')}</span>
                  </div>
                  {todoBloqueado
                    ? bloqueoLinea(vis[0].motivoBloqueo)
                    : mostrar.map(function (c, j) { return tarjetaCupo(c, d.fecha + j); })}
                </div>
              );
            })}
          </div>
        </>)}
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
                  return (
                    <tr key={c.idCupo} className={clicableCita(c) ? 'clic' : ''}
                      onClick={clicableCita(c) ? function () { setCitaAbierta(c); } : undefined}>
                      <td>{c.fecha}</td>
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
              return (
                <div className={'au-lrow' + (clicableCita(c) ? ' clic' : '')} key={c.idCupo}
                  onClick={clicableCita(c) ? function () { setCitaAbierta(c); } : undefined}>
                  <div className="l1"><span>{c.fecha} · {horaBonitaAudiencias(c.hora)}</span></div>
                  <div className="l2"><b>{c.citado || _auCaso(c)}</b>{c.citado ? <> · {_auDocTxt(c)}</> : null}</div>
                  <div className="l3">{_auCaso(c)} · {titleCaseNombre(c.sustanciador)} · {titleCaseNombre(c.reservadoPor || '')}
                    {esAdmin && c.sinVisita ? ' · sin visita asociada' : ''}</div>
                </div>
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
      <div className="au-ovl au-hoj-ovl on" role="dialog" aria-modal="true" aria-label="Días sin audiencias"
        onClick={function (e) { if (e.target === e.currentTarget) setNovAbierta(false); }}>
        <div className="au-hoj au-hoj-nov">
          <div className="au-hoj-cab">
            <div className="t"><b>Días sin audiencias</b></div>
            <button type="button" className="au-x" aria-label="Cerrar" onClick={function () { setNovAbierta(false); }}>×</button>
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
                  disabled={ocupado} onClick={function () { quitarNovedad(n); }}>×</button>
              </div>
            );
          })}
          {!novForm && <button type="button" className="au-mas" onClick={function () { setNovForm(true); setAfectadas(null); }}>+ Agregar</button>}
          {novForm && (
            <form className="au-form on" onSubmit={guardarNovedad}>
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
                <button type="button" className="btn-neutro btn-chico" onClick={function () { setNovForm(false); }}>Cancelar</button>
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

  // ── Citaciones visitas completadas (solo admin): copiar y pegar en el Excel ──
  function renderCompletadas() {
    if (!excel) return null;
    const lista = excel.lista || [];
    return (
      <section className="au-caja" aria-labelledby="au-t-exc">
        <h2 id="au-t-exc">Citaciones visitas completadas</h2>
        {!lista.length ? <p className="au-vacio-hoy">Sin citaciones</p> : lista.map(function (r) {
          return (
            <div className="au-row" key={r.idCupo}>
              <span className="t">
                <b>{_auDiaCorto(r.fecha)}/{String(r.fecha).slice(-4)} · {horaBonitaAudiencias(r.hora)}</b>
                <small>{titleCaseNombre(r.sustanciador)} · {r.expediente === 'NUEVO' ? r.radicado : <span className="exp-tag">Exp. {r.expediente}</span>}{r.citado ? ' · ' + r.citado : ''}</small>
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
  return (
    <div className="au-pantalla">
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
        <button type="button" className={'au-chip' + (vista === 'prog' ? ' on' : '')} onClick={function () { setVista('prog'); }}>Programadas</button>
        {!esInsp && <button type="button" className={'au-chip' + (vista === 'sem' ? ' on' : '')} onClick={function () { setVista('sem'); }}>Cupos</button>}
        <button type="button" className={'au-chip' + (vista === 'lis' ? ' on' : '')} onClick={function () { setVista('lis'); }}>Lista</button>
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

      {vista === 'prog' && renderProgramadas()}
      {vista === 'sem' && renderSemana()}
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
      {citaAbierta && (
        <CitaHoja cita={citaAbierta} esAdmin={esAdmin} ocupado={ocupado}
          onCerrar={function () { setCitaAbierta(null); }}
          onVerVisita={function () { const c = citaAbierta; setCitaAbierta(null); abrirCita(c); }}
          onLiberar={function () { liberarCupoDe(citaAbierta); }} />
      )}
    </div>
  );
}
