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

// Última lectura en memoria: sin señal se muestra esto con «Sin conexión».
var _AU_ULTIMO = null;

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
  if (c.expediente && c.expediente !== 'NUEVO') return 'Exp. ' + c.expediente;
  return c.radicado || (c.ordenPolicia ? 'Orden ' + c.ordenPolicia : '');
}

var _AU_SVG_COPIAR = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="12" height="12" rx="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);
var _AU_SVG_QUITAR = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>
  </svg>
);

// ── Hoja «Pedir cita» ──────────────────────────────────────────
// Caso (agenda de hoy del inspector o escrito) y uno de los 5 cupos más
// próximos; sin señal, sus cupos apartados. Al reservar, la fecha, la hora y
// el sustanciador en grande para copiarlos a la citación de papel.
function PedirCitaHoja({ usuario, agenda, onCerrar, onReservada }) {
  const [filas, setFilas] = useStateAU([]);
  const [caso, setCaso] = useStateAU(null);
  const [texto, setTexto] = useStateAU('');
  const [cupos, setCupos] = useStateAU(null);    // null = cargando
  const [sinSenal, setSinSenal] = useStateAU(!navigator.onLine);
  const [elegido, setElegido] = useStateAU(null);
  const [enviando, setEnviando] = useStateAU(false);
  const [error, setError] = useStateAU('');
  const [hecha, setHecha] = useStateAU(null);    // {cupo, caso, encolado}

  async function cargarCupos() {
    setCupos(null); setError('');
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
    cargarCupos();
    leerVisitas().then(function (f) { setFilas(f || []); }).catch(function () {});
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
          <div className="t"><b>{hecha ? 'Cita reservada' : 'Pedir cita'}</b></div>
          <button type="button" className="au-x" aria-label="Cerrar" onClick={onCerrar}>×</button>
        </div>

        {hecha ? (<>
          <div className="au-pconf">
            <p className="f">{_auMayus(_auFechaLarga(hecha.cupo.fecha))}</p>
            <p className="h">{horaBonitaAudiencias(hecha.cupo.hora)}</p>
            <p className="s">{titleCaseNombre(hecha.cupo.sustanciador)}</p>
            <p className="caso">{hecha.caso.radicado ? 'Rad. ' + hecha.caso.radicado : 'Orden ' + hecha.caso.ordenPolicia}</p>
            {hecha.encolado && <p className="cola">⇡ En cola</p>}
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
                    <small>{[etiquetaCaso(c), c.barrio, cita ? 'cita ' + _auDiaCorto(cita.fecha) : ''].filter(Boolean).join(' · ')}</small>
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
                    <small>{titleCaseNombre(c.sustanciador)}</small></span>
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

// ── Pantalla ────────────────────────────────────────────────────
function AudienciasScreen({ usuario }) {
  const [datos, setDatos] = useStateAU(null); // {cupos, novedadesActivas, ultimaFechaConCupo}
  const [novedades, setNovedades] = useStateAU([]);
  const [excel, setExcel] = useStateAU(null); // solo admin: {lista}
  const [cargando, setCargando] = useStateAU(true);
  const [error, setError] = useStateAU('');
  const [sinConexion, setSinConexion] = useStateAU(false);
  const [vista, setVista] = useStateAU('hoy');
  const [filtroSus, setFiltroSus] = useStateAU(''); // '' = todos; norm(nombre)
  const [misCitas, setMisCitas] = useStateAU(true); // inspector: «Mis citas» al entrar
  const [offsetSem, setOffsetSem] = useStateAU(0);
  const [diaCel, setDiaCel] = useStateAU(0);
  const [lis, setLis] = useStateAU({ q: '', pas: false });
  const [novAbierta, setNovAbierta] = useStateAU(false);
  const [novForm, setNovForm] = useStateAU(false);
  const [afectadas, setAfectadas] = useStateAU(null);
  const [copiado, setCopiado] = useStateAU('');
  const [ocupado, setOcupado] = useStateAU(false); // escritura en curso
  const [pedirAbierto, setPedirAbierto] = useStateAU(false);

  const esAdmin = usuario.rol === 'ADMIN';
  const esSup = !esAdmin && veTodasLasVisitas(usuario.rol);
  const esInsp = !esAdmin && !esSup;
  const yo = normNombreAudiencias(usuario.usuario);

  async function cargar() {
    setCargando(true);
    if (!navigator.onLine && _AU_ULTIMO) {
      setDatos(_AU_ULTIMO.datos); setNovedades(_AU_ULTIMO.novedades);
      if (esAdmin) setExcel(_AU_ULTIMO.excel);
      setSinConexion(true); setCargando(false);
      return;
    }
    try {
      const pedidos = [agendaAudiencias({ incluirPasadas: true }), listarNovedadesAudiencias()];
      if (esAdmin) pedidos.push(listaDiariaExcelAudiencias());
      const rs = await Promise.all(pedidos);
      if (!rs[0].ok) throw new Error(rs[0].error || 'No se pudo leer la agenda.');
      const d = {
        cupos: rs[0].cupos || [],
        novedadesActivas: rs[0].novedadesActivas || 0,
        ultimaFechaConCupo: rs[0].ultimaFechaConCupo || ''
      };
      _AU_ULTIMO = { datos: d, novedades: rs[1] || [], excel: esAdmin ? rs[2] : null };
      setDatos(d); setNovedades(rs[1] || []);
      if (esAdmin) setExcel(rs[2]);
      setSinConexion(false); setError('');
    } catch (e) {
      if (_AU_ULTIMO) {
        setDatos(_AU_ULTIMO.datos); setNovedades(_AU_ULTIMO.novedades);
        if (esAdmin) setExcel(_AU_ULTIMO.excel);
        setSinConexion(true);
      } else {
        setError(e.message || 'No se pudo cargar la agenda de audiencias.');
      }
    }
    setCargando(false);
  }

  useEffectAU(() => {
    _AU_ULTIMO = null;
    cargar();
    // Cupos apartados para pedir citas sin señal en campo (se repiten sin daño).
    if (!esSup && navigator.onLine) apartarCuposAudiencias().catch(function () {});
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
      '¿Liberar el cupo del ' + c.fecha + ' a las ' + horaBonitaAudiencias(c.hora) + '?\n\n' +
      'La cita queda sin agendar (el citado ya tiene la fecha en papel si se le entregó) ' +
      'y el cupo vuelve a estar disponible.',
      { titulo: 'Liberar cupo', btnOk: 'Sí, liberar', btnCancel: 'Cancelar', peligro: true });
    if (!ok) return;
    setOcupado(true);
    try {
      const r = await liberarCupoAudiencias(c.idCupo, 'Liberado desde la pestaña Audiencias');
      if (!r.ok) await appAlert(r.error || 'No se pudo liberar el cupo.', { tono: 'error' });
      await cargar();
    } catch (e) {
      await appAlert('No se pudo liberar el cupo: ' + (e.message || e), { tono: 'error' });
    }
    setOcupado(false);
  }

  async function abrirCita(c) {
    try {
      const filas = await leerVisitas();
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
  const diaHoyObj = dias.find(function (d) { return d.fecha === hoyTxt; }) || null;
  const diaMostrar = diaHoyObj || proximoDiaAudiencias(dias, _auHoy());
  const soloMias = esInsp && misCitas;

  const cuposDeDiaFiltrados = function (dia) {
    if (!dia) return [];
    return dia.cupos.filter(function (c) {
      return !filtroSus || normNombreAudiencias(c.sustanciador) === filtroSus;
    });
  };

  const semanas = useMemoAU(function () {
    // Días agrupados por semana (lunes a domingo), indexados por offset
    // desde la semana actual. Los días pasados caen en el offset 0.
    const hoy = _auHoy();
    const lunesHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const out = [];
    dias.forEach(function (d) {
      const f = parsearFecha(d.fecha);
      if (!f) return;
      const k = Math.max(0, Math.floor((f - lunesHoy) / (7 * 86400000)));
      if (!out[k]) out[k] = [];
      out[k].push(d);
    });
    for (var i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
    return out;
  }, [dias]);

  const diasSem = semanas[Math.min(offsetSem, semanas.length - 1)] || [];
  const semanaInfo = useMemoAU(function () {
    let cupos = 0, citados = 0;
    diasSem.forEach(function (d) { cupos += d.cupos.length; citados += d.cupos.filter(function (c) { return c.estado === 'RESERVADO'; }).length; });
    const primera = diasSem[0] ? diasSem[0].fecha : '';
    const ultima = diasSem.length ? diasSem[diasSem.length - 1].fecha : '';
    return { cupos: cupos, citados: citados, primera: primera, ultima: ultima };
  }, [diasSem]);

  const listaRows = useMemoAU(function () {
    if (!datos) return [];
    return filtrarListaAudiencias(datos.cupos, {
      q: lis.q, incluirPasadas: lis.pas, hoy: hoyTxt,
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
        <Tag className="t" type={clicable ? 'button' : undefined} onClick={clicable ? function () { abrirCita(c); } : undefined}>
          <b>{c.citado || _auCaso(c)}</b>{c.citado ? ' · ' + _auCaso(c) : ''}
          <small>{[c.direccion, c.reservadoPor].filter(Boolean).join(' · ')}</small>
        </Tag>
        {esAdmin && c.estado === 'RESERVADO' && (
          <button type="button" className="au-lib" disabled={ocupado}
            onClick={function (e) { e.stopPropagation(); liberarCupoDe(c); }}
            title="Liberar este cupo (vuelve a estar disponible)">Liberar</button>
        )}
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
        <header className="au-cab"><h1>Audiencias</h1></header>
        <div className="au-vacio"><b>No se pudo cargar</b>{error}
          <button type="button" className="btn-accion" onClick={cargar}>Reintentar</button>
        </div>
      </div>
    );
  }
  if (!datos) return null;

  if (!datos.cupos.length) {
    return (
      <div className="au-pantalla">
        <header className="au-cab"><h1>Audiencias</h1></header>
        <div className="au-vacio">
          <b>Sin cupos cargados</b>
          La hoja AUDIENCIAS está vacía: falta pegar la lista CUPOS_CU del Excel del despacho.
          <button type="button" className="btn-accion" onClick={cargar}>Reintentar</button>
        </div>
      </div>
    );
  }

  // ── Vista Hoy ──
  function renderHoy() {
    if (!diaMostrar) return <p className="au-vacio-hoy">No hay días con audiencias.</p>;
    const esHoy = diaMostrar.fecha === hoyTxt;
    const vis = cuposDeDiaFiltrados(diaMostrar);
    const citas = vis.filter(function (c) {
      return c.estado === 'RESERVADO' && (!soloMias || normNombreAudiencias(c.reservadoPor) === yo);
    });
    const todoBloqueado = vis.length > 0 && vis.every(function (c) { return c.estado === 'BLOQUEADO'; });
    const libres = vis.filter(function (c) { return c.estado === 'LIBRE'; }).length;
    const grupos = agruparAudienciasPorSustanciador(vis);
    return (
      <div>
        <div className="au-hoy-tit">
          {esHoy ? 'Hoy · ' + _auFechaLarga(diaMostrar.fecha) : _auFechaLarga(diaMostrar.fecha)}
        </div>
        {todoBloqueado ? (
          <div style={{ marginTop: 10 }}>
            {bloqueoLinea(vis[0].motivoBloqueo, filtroSus ? '' : 'Todos')}
          </div>
        ) : (<>
          {!soloMias && (
            <p className="au-hoy-libres">
              {libres + ' cupo' + (libres === 1 ? '' : 's') + ' libre' + (libres === 1 ? '' : 's')}
            </p>
          )}
          {grupos.map(function (g) {
            const delGrupo = g.cupos.filter(function (c) {
              return c.estado === 'RESERVADO' && (!soloMias || normNombreAudiencias(c.reservadoPor) === yo);
            });
            const grupoBloqueado = g.cupos.length > 0 && g.cupos.every(function (c) { return c.estado === 'BLOQUEADO'; });
            if (!delGrupo.length && !grupoBloqueado) return null;
            return (
              <div className="au-grupo" key={g.sustanciador}>
                <h3>{g.sustanciador}</h3>
                {grupoBloqueado && !delGrupo.length
                  ? bloqueoLinea(g.cupos[0].motivoBloqueo)
                  : delGrupo.map(function (c, i) { return filaCita(c, g.sustanciador + i); })}
              </div>
            );
          })}
          {!citas.length && <p className="au-vacio-hoy">Sin citas</p>}
        </>)}
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
        onClick={clicable ? function () { abrirCita(c); } : undefined}
        title={c.estado === 'BLOQUEADO' ? 'Día sin audiencias · ' + c.motivoBloqueo : undefined}>
        <span className="h1l">
          <span className="hora">{horaBonitaAudiencias(c.hora)}</span>
          <span className="au-estado">{etiqueta}</span>
        </span>
        {c.estado === 'RESERVADO' ? <>
          <span className="exp">{_auCaso(c)}</span>
          <span className="quien">{[c.citado, c.reservadoPor].filter(Boolean).join(' · ')}</span>
        </> : <span className="sus">{c.sustanciador}</span>}
      </Tag>
    );
  }

  function renderSemana() {
    const idxCel = Math.max(0, Math.min(diaCel, diasSem.length - 1));
    return (
      <div>
        <div className="au-sem-bar">
          <button type="button" className="au-flecha" disabled={offsetSem === 0}
            onClick={function () { setOffsetSem(offsetSem - 1); setDiaCel(0); }} aria-label="Semana anterior">‹</button>
          <div className="au-sem-tit">
            {semanaInfo.primera
              ? 'Semana del ' + semanaInfo.primera + ' al ' + semanaInfo.ultima
              : 'Semana sin audiencias'}
            <small>{semanaInfo.cupos} cupo{semanaInfo.cupos === 1 ? '' : 's'} · {semanaInfo.citados} citado{semanaInfo.citados === 1 ? '' : 's'}</small>
          </div>
          <button type="button" className="au-flecha" onClick={function () { setOffsetSem(offsetSem + 1); setDiaCel(0); }} aria-label="Semana siguiente">›</button>
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
                      : (vis.length ? libres + ' de ' + vis.length + ' libres' : 'sin cupos')}</span>
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
          <button type="button" className={'au-chip' + (lis.pas ? ' on' : '')}
            aria-pressed={String(lis.pas)}
            onClick={function () { setLis(Object.assign({}, lis, { pas: !lis.pas })); }}>Incluir pasadas</button>
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
                    <tr key={c.idCupo}>
                      <td>{c.fecha}</td>
                      <td>{horaBonitaAudiencias(c.hora)}</td>
                      <td>{c.sustanciador}</td>
                      <td>{_auCaso(c)}</td>
                      <td><b>{c.citado}</b></td>
                      <td>{_auDocTxt(c)}</td>
                      <td>{c.reservadoPor}{esAdmin && c.sinVisita && <span className="au-sindoc"> · sin visita asociada</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="au-lrows">
            {listaRows.map(function (c) {
              return (
                <div className="au-lrow" key={c.idCupo}>
                  <div className="l1"><span>{c.fecha} · {horaBonitaAudiencias(c.hora)}</span></div>
                  <div className="l2"><b>{c.citado || _auCaso(c)}</b>{c.citado ? <> · {_auDocTxt(c)}</> : null}</div>
                  <div className="l3">{_auCaso(c)} · {c.sustanciador} · {c.reservadoPor}
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
    const mias = novedades.filter(function (n) {
      return !esSup || normNombreAudiencias(n.sustanciador) === yo;
    });
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
                  <b>{n.sustanciador === 'TODOS' ? 'Todos' : n.sustanciador}</b> · {n.desde}{n.hasta !== n.desde ? ' – ' + n.hasta : ''} · {n.franja === 'DIA' ? 'Todo el día' : n.franja}
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
                      {sustanciadores.map(function (s) { return <option key={s.norm} value={s.nombre}>{s.nombre}</option>; })}
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
                  return <li key={c.idCupo}>{c.fecha} · {horaBonitaAudiencias(c.hora)} · {c.sustanciador} · {c.expediente ? 'Exp. ' + c.expediente : c.radicado} · {c.citado}</li>;
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
                <b>{r.fecha} · {horaBonitaAudiencias(r.hora)}</b> · {r.sustanciador} · {r.expediente === 'NUEVO' ? r.radicado : 'Exp. ' + r.expediente}
                <small>{[r.citado, r.direccion, r.filaExcel ? 'fila ' + r.filaExcel + ' del Excel' : ''].filter(Boolean).join(' · ')}</small>
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
    return (
      <section className="au-caja au-pedidas" aria-labelledby="au-t-ped">
        <h2 id="au-t-ped">Pedidas hoy</h2>
        {!lista.length ? <p className="au-vacio-hoy">Ninguna</p> : lista.map(function (c) {
          const mia = normNombreAudiencias(c.reservadoPor) === yo;
          return (
            <div className="au-row" key={c.idCupo}>
              <span className="hora">{horaBonitaAudiencias(c.hora)}</span>
              <span className="t"><b>{_auDiaCorto(c.fecha)}</b> · {_auCaso(c)}
                <small>{titleCaseNombre(c.sustanciador)} · {mia ? 'tú' : titleCaseNombre(c.reservadoPor)}</small></span>
              {esAdmin && (
                <button type="button" className="au-copy" disabled={ocupado}
                  aria-label="Liberar cita" title="Liberar cita"
                  onClick={function () { liberarCupoDe(c); }}>{_AU_SVG_QUITAR}</button>
              )}
            </div>
          );
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

      {!esSup && renderPedidasHoy()}

      <div className="au-topbar">
        <button type="button" className={'au-chip' + (vista === 'hoy' ? ' on' : '')} onClick={function () { setVista('hoy'); }}>Hoy</button>
        <button type="button" className={'au-chip' + (vista === 'sem' ? ' on' : '')} onClick={function () { setVista('sem'); }}>Semana</button>
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

      {vista === 'hoy' && renderHoy()}
      {vista === 'sem' && renderSemana()}
      {vista === 'lis' && renderLista()}

      {esAdmin && (
        <div className="au-bajo">{renderCompletadas()}</div>
      )}

      {novAbierta && renderNovedades()}
      {pedirAbierto && (
        <PedirCitaHoja usuario={usuario} agenda={datos.cupos}
          onCerrar={function () { setPedirAbierto(false); }}
          onReservada={function () { cargar(); }} />
      )}
    </div>
  );
}
