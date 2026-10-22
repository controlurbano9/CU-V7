// ═══════════════════════════════════════════════════════════════
// v6/audiencias.jsx — Pestaña «Audiencias» (TASK 3a, 2026-10-20).
//   La agenda del bloque de cupos de Control Urbano, según la maqueta v4
//   (propuesta-audiencias.html). La citación que diligencia el inspector
//   (componente «Citación», cupos apartados) NO está construida: va en otra
//   tarea. Aquí no se toca nueva-visita.jsx.
//
//   Vistas: Hoy · Semana · Lista. ADMIN ve todo (novedades y «Pasar al
//   Excel»); SUPERVISOR entra filtrado por su nombre como sustanciador y
//   solo gestiona sus novedades; INSPECTOR solo lectura, en «Mis citas».
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

// ── Pantalla ────────────────────────────────────────────────────
function AudienciasScreen({ usuario }) {
  const [datos, setDatos] = useStateAU(null); // {cupos, novedadesActivas, ultimaFechaConCupo}
  const [novedades, setNovedades] = useStateAU([]);
  const [excel, setExcel] = useStateAU(null); // solo admin: {lista, sinCompletar, yaPasadas}
  const [cargando, setCargando] = useStateAU(true);
  const [error, setError] = useStateAU('');
  const [sinConexion, setSinConexion] = useStateAU(false);
  const [vista, setVista] = useStateAU('hoy');
  const [filtroSus, setFiltroSus] = useStateAU(''); // '' = todos; norm(nombre)
  const [misCitas, setMisCitas] = useStateAU(true); // inspector: «Mis citas» al entrar
  const [offsetSem, setOffsetSem] = useStateAU(0);
  const [diaCel, setDiaCel] = useStateAU(0);
  const [lis, setLis] = useStateAU({ q: '', est: 'todos', pas: false });
  const [novAbierta, setNovAbierta] = useStateAU(false);
  const [novForm, setNovForm] = useStateAU(false);
  const [afectadas, setAfectadas] = useStateAU(null);
  const [copiado, setCopiado] = useStateAU('');
  const [ocupado, setOcupado] = useStateAU(false); // escritura en curso

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

  useEffectAU(() => { _AU_ULTIMO = null; cargar(); }, []);

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

  async function copiarFilaExcel(r) {
    const tsv = r.filaTSV || filaTsvAudiencias(r);
    try {
      await navigator.clipboard.writeText(tsv);
    } catch (e) {
      await appAlert('No se pudo copiar automáticamente. Cópiala a mano:\n\n' +
        tsv.replace(/\t/g, ' · '), { tono: 'error', titulo: 'Copiar fila' });
      return;
    }
    setCopiado(r.idCupo);
    try {
      const resp = await marcarCitacionExcelAudiencias(r.idCupo, true);
      if (!resp.ok) {
        setCopiado('');
        await appAlert(resp.error || 'La fila se copió pero no se pudo marcar como pasada.', { tono: 'error' });
        return;
      }
    } catch (e) {
      setCopiado('');
      await appAlert('La fila se copió pero no se pudo marcar como pasada: ' + (e.message || e), { tono: 'error' });
      return;
    }
    // ✓ 1,5 s y la fila baja a «Ya pasadas» (misma pausa de la maqueta).
    setTimeout(function () {
      setExcel(function (prev) {
        if (!prev) return prev;
        return {
          lista: prev.lista.filter(function (x) { return x.idCupo !== r.idCupo; }),
          sinCompletar: prev.sinCompletar,
          yaPasadas: [Object.assign({}, r, { enviadoExcel: hoyTxt })].concat(prev.yaPasadas)
        };
      });
      setCopiado('');
    }, 1500);
  }

  async function devolverExcel(r) {
    if (ocupado) return;
    setOcupado(true);
    try {
      const resp = await marcarCitacionExcelAudiencias(r.idCupo, false);
      if (!resp.ok) {
        await appAlert(resp.error || 'No se pudo devolver la citación.', { tono: 'error' });
      } else {
        setExcel(function (prev) {
          if (!prev) return prev;
          const devuelta = Object.assign({}, r, { filaTSV: filaTsvAudiencias(r) });
          delete devuelta.enviadoExcel;
          return {
            lista: prev.lista.concat([devuelta]),
            sinCompletar: prev.sinCompletar,
            yaPasadas: prev.yaPasadas.filter(function (x) { return x.idCupo !== r.idCupo; })
          };
        });
      }
    } catch (e) {
      await appAlert('No se pudo devolver la citación: ' + (e.message || e), { tono: 'error' });
    }
    setOcupado(false);
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
      q: lis.q, estado: lis.est, incluirPasadas: lis.pas, hoy: hoyTxt,
      deQuien: esInsp && !misCitas ? '' : (esInsp ? yo : '')
    });
  }, [datos, lis, hoyTxt, esInsp, misCitas, yo]);

  const quedanCupos = esAdmin && datos && datos.ultimaFechaConCupo &&
    (function () {
      const n = diasHabilesHasta(parsearFecha(datos.ultimaFechaConCupo));
      return n != null && n < 30;
    })();

  // ── Render helpers ──
  function citaPend(c) { return c.estado === 'RESERVADO' && !c.visitaCompletada; }
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
          <b>{c.citado || 'Sin nombre'}</b> · {_auDocTxt(c)} · {c.expediente ? 'Exp. ' + c.expediente : (c.radicado || '')}
          <small>{c.direccion ? c.direccion + ' · ' : ''}citó {c.reservadoPor}</small>
        </Tag>
        {citaPend(c) && <span className="au-chip-pend">Visita sin completar</span>}
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
          {esHoy ? 'Hoy · ' + _auFechaLarga(diaMostrar.fecha)
                 : <>Próximo día con audiencias: <b>{_auFechaLarga(diaMostrar.fecha)}</b></>}
          <small>{esHoy ? '' : 'Hoy es ' + _auFechaLarga(hoyTxt) + ' y no tiene audiencias · '}
            Audiencias{soloMias ? ' · tus citas' : ' de Control Urbano'}</small>
        </div>
        {todoBloqueado ? (
          <div style={{ marginTop: 10 }}>
            {bloqueoLinea(vis[0].motivoBloqueo, filtroSus ? '' : 'Todos')}
          </div>
        ) : (<>
          <p className="au-hoy-libres">
            {soloMias
              ? (citas.length ? citas.length + ' cita' + (citas.length === 1 ? '' : 's') + ' tuya' + (citas.length === 1 ? '' : 's')
                              : 'Sin citas tuyas este día')
              : libres + ' cupo' + (libres === 1 ? '' : 's') + ' libre' + (libres === 1 ? '' : 's') +
                (filtroSus ? ' de ' + (sustanciadores.find(function (s) { return s.norm === filtroSus; }) || {}).nombre : '')}
          </p>
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
          {!citas.length && <p className="au-vacio-hoy">{soloMias ? 'Sin citas tuyas este día.' : 'Sin citaciones este día.'}</p>}
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
          <span className="exp">{c.expediente ? 'Exp. ' + c.expediente : (c.radicado || '')}
            {citaPend(c) && <i className="au-pend-txt"> · visita sin completar</i>}</span>
          <span className="quien">{c.citado} · citó {c.reservadoPor}</span>
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
  var _AU_EST_LIS = { pasar: 'Por pasar al Excel', excel: 'En el Excel', pend: 'Visita sin completar' };
  function renderLista() {
    const n = listaRows.length;
    return (
      <div>
        <div className="au-lis-tools">
          <input className="au-lis-buscar" type="search" value={lis.q}
            placeholder="Buscar nombre, radicado, expediente o documento"
            aria-label="Buscar citación"
            onChange={function (e) { setLis(Object.assign({}, lis, { q: e.target.value })); }} />
          {[['todos', 'Todos'], ['pasar', 'Por pasar al Excel'], ['excel', 'En el Excel'], ['pend', 'Visita sin completar']]
            .map(function (par) {
              return <button type="button" key={par[0]}
                className={'au-chip' + (lis.est === par[0] ? ' on' : '')}
                onClick={function () { setLis(Object.assign({}, lis, { est: par[0] })); }}>{par[1]}</button>;
            })}
          <button type="button" className={'au-chip' + (lis.pas ? ' on' : '')}
            aria-pressed={String(lis.pas)}
            onClick={function () { setLis(Object.assign({}, lis, { pas: !lis.pas })); }}>Incluir pasadas</button>
        </div>
        <p className="au-hoy-libres">{n} citaci{n === 1 ? 'ón' : 'ones'}{esInsp ? ' tuyas' : ''}
          {lis.pas ? ' · incluyendo pasadas' : ' · de hoy en adelante'}</p>
        {!n ? <p className="au-vacio-hoy">Nada que coincida con el filtro.</p> : (<>
          <div className="au-tabla">
            <table>
              <thead><tr><th>Fecha</th><th>Hora</th><th>Sustanciador</th><th>Exp./Radicado</th>
                <th>Citado</th><th>Documento</th><th>Inspector que citó</th><th>Estado</th></tr></thead>
              <tbody>
                {listaRows.map(function (c) {
                  const est = estadoListaAudiencias(c);
                  return (
                    <tr key={c.idCupo}>
                      <td>{c.fecha}</td>
                      <td>{horaBonitaAudiencias(c.hora)}</td>
                      <td>{c.sustanciador}</td>
                      <td>{c.expediente ? 'Exp. ' + c.expediente : ''} {c.radicado}</td>
                      <td><b>{c.citado}</b></td>
                      <td>{_auDocTxt(c)}</td>
                      <td>{c.reservadoPor}</td>
                      <td><span className={'au-lest ' + est}>{_AU_EST_LIS[est]}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="au-lrows">
            {listaRows.map(function (c) {
              const est = estadoListaAudiencias(c);
              return (
                <div className="au-lrow" key={c.idCupo}>
                  <div className="l1"><span>{c.fecha} · {horaBonitaAudiencias(c.hora)}</span>
                    <span className="sp"></span>
                    <span className={'au-lest ' + est}>{_AU_EST_LIS[est]}</span></div>
                  <div className="l2"><b>{c.citado}</b> · {_auDocTxt(c)}</div>
                  <div className="l3">{c.expediente ? 'Exp. ' + c.expediente : c.radicado} · {c.sustanciador} · citó {c.reservadoPor}</div>
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
            <div className="t"><b>Días sin audiencias</b>
              <small>Novedades: vacaciones, jornadas, comisiones. No borran cupos: al quitarlas vuelven.</small></div>
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
                  ) : <input type="text" defaultValue={usuario.usuario} disabled
                      title="Como sustanciador solo agregas tus propias novedades" />}
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
              <b>{afectadas.length} citaci{afectadas.length === 1 ? 'ón' : 'ones'} caen en esos días</b>
              {' '}(el citado ya tiene la fecha en papel, no se mueven solas):
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

  // ── Pasar al Excel (solo admin) ──
  function renderExcel() {
    if (!excel) return null;
    const SVG_COPIAR = (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="12" height="12" rx="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    );
    const filaExcel = function (r) {
      return (
        <div className="au-row" key={r.idCupo}>
          <span className="t">
            <b>{r.fecha} · {horaBonitaAudiencias(r.hora)}</b> · {r.sustanciador} · {r.expediente ? 'Exp. ' + r.expediente : r.radicado}
            <small>{r.citado} · {r.documentoCitado && !/^NO\s*APORT/i.test(r.documentoCitado)
              ? 'C.C. ' + _auDocPuntos(r.documentoCitado) : 'Sin documento'} · {r.direccion}</small>
          </span>
          <button type="button" className={'au-copy' + (copiado === r.idCupo ? ' ok' : '')}
            aria-label="Copiar fila para el Excel" title="Copiar fila para el Excel"
            disabled={copiado === r.idCupo}
            onClick={function () { copiarFilaExcel(r); }}>
            {copiado === r.idCupo ? '✓' : SVG_COPIAR}
          </button>
        </div>
      );
    };
    const pend = excel.lista || [];
    const sinCompletar = excel.sinCompletar || [];
    const yaPasadas = excel.yaPasadas || [];
    return (
      <section className="au-caja" aria-labelledby="au-t-exc">
        <h2 id="au-t-exc">Pasar al Excel</h2>
        <p className="sub">Solo citas de visitas ya completadas. El icono copia la fila en el formato del Excel y
          la baja a «Ya pasadas»; si no se llegó a pegar, «Devolver».</p>
        {!pend.length ? (
          <div className="au-vacio"><b>Todo al día</b>No hay citaciones pendientes de pasar al Excel.</div>
        ) : pend.map(filaExcel)}
        {!!yaPasadas.length && (
          <details className="au-det">
            <summary>Ya pasadas (últimos 7 días) · {yaPasadas.length}</summary>
            <div className="au-det-cuerpo">
              {yaPasadas.map(function (r) {
                return (
                  <div className="au-row" key={r.idCupo}>
                    <span className="t">
                      <b>{r.fecha} · {horaBonitaAudiencias(r.hora)}</b> · {r.sustanciador} · {r.expediente ? 'Exp. ' + r.expediente : r.radicado}
                      <small>{r.citado} · pasada el {r.enviadoExcel}</small>
                    </span>
                    <button type="button" className="btn-neutro btn-chico" disabled={ocupado}
                      onClick={function () { devolverExcel(r); }}>Devolver</button>
                  </div>
                );
              })}
            </div>
          </details>
        )}
        {!!sinCompletar.length && (
          <details className="au-det amber">
            <summary>{sinCompletar.length} citaci{sinCompletar.length === 1 ? 'ón tiene' : 'ones tienen'} la visita sin completar</summary>
            <div className="au-det-cuerpo">
              {sinCompletar.map(function (r) {
                return (
                  <div className="au-row" key={r.idCupo}>
                    <span className="t">
                      <b>{r.fecha} · {horaBonitaAudiencias(r.hora)}</b> · {r.sustanciador} · {r.expediente ? 'Exp. ' + r.expediente : r.radicado}
                      <small>{r.citado} · {r.direccion}</small>
                    </span>
                    <span className="au-chip-pend">Visita sin completar</span>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </section>
    );
  }

  // ── Pantalla ──
  const franjaNovTxt = esAdmin || esSup ? (datos.novedadesActivas ? ' · ' + datos.novedadesActivas : '') : '';
  return (
    <div className="au-pantalla">
      <header className="au-cab">
        <h1>Audiencias</h1>
        {(esAdmin || esSup) && (
          <button type="button" className="btn-neutro btn-chico au-btn-nov" aria-haspopup="dialog"
            onClick={function () { setNovAbierta(true); setNovForm(false); setAfectadas(null); }}>
            <Icon.Admin size={14} aria-hidden="true" />
            <span>Días sin audiencias{franjaNovTxt}</span>
          </button>
        )}
      </header>

      {sinConexion && (
        <p className="au-aviso-linea">Sin conexión — se muestra lo último que se leyó.</p>
      )}
      {quedanCupos && (
        <p className="au-aviso-linea">Quedan cupos solo hasta el <b>{datos.ultimaFechaConCupo}</b>. Hay que apartar más en el Excel.</p>
      )}

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
        <div className="au-bajo">{renderExcel()}</div>
      )}

      {novAbierta && renderNovedades()}
    </div>
  );
}
