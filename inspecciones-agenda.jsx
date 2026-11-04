// ═══════════════════════════════════════════════════════════════
// v6/inspecciones-agenda.jsx — Agenda › Inspecciones (2026-11-03, maqueta
// aprobada propuesta-inspecciones.html). Admin y supervisores programan aquí
// las inspecciones al lugar; Buscar queda solo para la gestión del caso.
//
// La semana es una rejilla días × horas. Cada día es la zona de un grupo de
// comunas vecinas (lunes 1-2-3 … viernes rurales): al elegir el caso se
// ilumina su día y las horas libres de su inspector (el de la visita
// anterior, fijo). Tocar una hora libre → confirmar. Arrastrar una tarjeta
// la reprograma. La bandeja «Por programar» trae lo decretado en Audiencias.
// Fuera de la zona del día se puede (urgencias), pero queda marcado.
// Lógica en utils.js (semanaInspecciones, horaLibreInspeccion,
// bandejaInspecciones, inspeccionDelCaso); aquí solo se pinta.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateIA, useEffect: useEffectIA, useMemo: useMemoIA, useRef: useRefIA } = React;

// Marca que deja «Ver en la Agenda» (ficha de la visita): semana y fila a resaltar.
const IA_IR_KEY = 'cu_agenda_inspeccion';
const IA_DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const IA_ZONA = { 1: 'Comunas 1 · 2 · 3', 2: 'Comunas 4 · 5 · 6', 3: 'Comunas 7 · 8 · 9', 4: 'Comunas 10 · 11 · 12', 5: 'Rurales' };
const IA_ZONA_CORTA = { 1: 'C 1-2-3', 2: 'C 4-5-6', 3: 'C 7-8-9', 4: 'C 10-11-12', 5: 'Rurales' };
const IA_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function _iaIrPendiente() {
  try {
    const v = sessionStorage.getItem(IA_IR_KEY);
    if (v) sessionStorage.removeItem(IA_IR_KEY);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}
function _iaRangoSemana(dias) {
  const a = dias[0].date, b = dias[4].date;
  return a.getMonth() === b.getMonth()
    ? a.getDate() + ' – ' + b.getDate() + ' de ' + IA_MESES[b.getMonth()]
    : a.getDate() + ' de ' + IA_MESES[a.getMonth()] + ' – ' + b.getDate() + ' de ' + IA_MESES[b.getMonth()];
}
function _iaDir(f) {
  return direccionVisible(String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim() || 'Sin dirección');
}
function _iaColor(nombre, inspectores) {
  const k = inspectores.findIndex(n => _iaPrimer(n) === _iaPrimer(nombre));
  return k < 0 ? 'var(--ink-4)' : 'var(--it-i' + (k % 4 + 1) + ')';
}
function _iaPrimer(n) { return String(n || '').trim().split(/\s+/)[0].toUpperCase(); }

function InspeccionesAgenda({ usuario, segmento }) {
  // Hooks antes de cualquier early return (React #310).
  const ir = useRefIA(_iaIrPendiente());
  const [datos, setDatos] = useStateIA(null);
  const [activos, setActivos] = useStateIA([]);
  const [lunes, setLunes] = useStateIA(() => lunesInspecciones(ir.current && ir.current.fecha ? parsearFecha(ir.current.fecha) : new Date()));
  const [q, setQ] = useStateIA('');
  const [sel, setSel] = useStateIA(null);       // fila representativa del caso elegido
  const [celda, setCelda] = useStateIA(null);   // { dia, hora } a confirmar
  const [elegido, setElegido] = useStateIA(''); // inspector elegido en la confirmación
  const [ocupado, setOcupado] = useStateIA(false);
  const [error, setError] = useStateIA('');
  const [resaltada, setResaltada] = useStateIA(ir.current ? ir.current.fila : null);
  const [diaM, setDiaM] = useStateIA(0);
  // «Registrar radicado» (el mismo formulario de Buscar) cuando el caso no está en la base.
  const [registrando, setRegistrando] = useStateIA(false);
  const [idxBarrios, setIdxBarrios] = useStateIA(null);
  const [porElegir, setPorElegir] = useStateIA(''); // radicado recién registrado: se elige al llegar
  const arrastre = useRefIA(null);

  async function cargar(forzar) {
    try {
      const [bd, lista] = await Promise.all([leerVisitas(forzar ? { forzar: true } : undefined), listarInspectoresActivos()]);
      setDatos(((bd && bd.datos) || []).concat((bd && bd.noCompetencia) || []));
      setActivos(lista || []);
    } catch (e) { setError(e.message); }
  }
  useEffectIA(() => {
    cargar();
    const off = typeof suscribirVisitas === 'function' ? suscribirVisitas(() => cargar()) : null;
    return () => { if (off) off(); };
  }, []);

  const semana = useMemoIA(() => semanaInspecciones(datos || [], lunes), [datos, lunes]);
  const bandeja = useMemoIA(() => bandejaInspecciones(datos || []), [datos]);
  const inspectores = useMemoIA(() => inspectoresAsignables(activos).map(i => i.nombre), [activos]);
  const caso = useMemoIA(() => sel && datos ? visitasDelCaso(datos, sel) : null, [sel, datos]);
  const plan = caso ? inspeccionDelCaso(caso, usuario.rol) : null;
  const zona = sel ? diaGrupoInspeccion(sel) : null;
  const resultados = useMemoIA(() => {
    if (!datos || q.trim().length < 3) return [];
    return (buscarCasos(datos, q).casos || []).filter(c => !c.sinRadicado).slice(0, 6);
  }, [datos, q]);

  const qRad = claveRadicado(q);
  const noEsta = !!datos && q.trim().length >= 3 && !resultados.length;
  const puedeRegistrar = noEsta && puedeRegistrarRadicado(q, datos, usuario.rol);

  function abrirRegistro() {
    setRegistrando(true);
    if (!idxBarrios && typeof _cargarIdxBarriosBQ === 'function') {
      _cargarIdxBarriosBQ().then(setIdxBarrios).catch(() => {});
    }
  }
  async function alRegistrar(rad) {
    setRegistrando(false); setQ('');
    invalidarCache('visitas');
    setPorElegir(rad);
    await cargar(true);
  }

  // El radicado recién registrado queda elegido para programarle la hora.
  useEffectIA(() => {
    if (!porElegir || !datos) return;
    const f = datos.find(x => claveRadicado(x['RADICADO']) === porElegir);
    if (f) { setPorElegir(''); elegir(f); }
  }, [datos, porElegir]);

  // El día de hoy en el celular; con caso elegido, su día.
  useEffectIA(() => {
    const hoy = new Date().getDay();
    setDiaM(zona ? zona - 1 : (hoy >= 1 && hoy <= 5 ? hoy - 1 : 0));
  }, [zona, lunes]);

  if (!datos) return <div className="it">{segmento}<p className="it-vacio">{error || 'Cargando…'}</p></div>;

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const pasado = (k) => semana.dias[k].date < hoy;
  const libre = (k, h) => !!plan && plan.puede && !pasado(k) && esDiaHabil(semana.dias[k].date) &&
    horaLibreInspeccion(semana.items, k, h, plan.inspector || '',
      plan.modo === 'reprogramar' ? (caso || []).find(x => x._idx === plan.fila) : null);

  function elegir(f) {
    setSel(f); setQ(''); setCelda(null); setError('');
    if (!f) return;
    // Si ya tiene inspección viva, el tablero va a su semana.
    const p = inspeccionDelCaso(visitasDelCaso(datos, f), usuario.rol);
    if (p.actual && p.actual.fecha) { setLunes(lunesInspecciones(parsearFecha(p.actual.fecha))); return; }
    // Si el día de su zona ya pasó en la semana a la vista, va a la siguiente.
    const z = diaGrupoInspeccion(f);
    const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
    const diaZona = z ? new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + z - 1) : null;
    if (diaZona && diaZona < hoy0) setLunes(lunesInspecciones(new Date(hoy0.getFullYear(), hoy0.getMonth(), hoy0.getDate() + 7)));
  }

  async function enviar(item) {
    setOcupado(true); setError('');
    try {
      const r = await gasPost({ accion: 'programarInspecciones', items: [item] });
      const it = r && r.resultados && r.resultados[0];
      if (!(r && r.ok && it && it.ok)) throw new Error((it && it.error) || (r && r.error) || 'No se pudo programar.');
      invalidarCache('visitas');
      setResaltada(it.fila); setSel(null); setCelda(null);
      await cargar(true);
    } catch (e) { setError(e.message); }
    setOcupado(false);
  }

  function programar() {
    const ins = plan.fijo ? plan.inspector : (elegido || plan.inspector);
    if (!ins && plan.modo !== 'reprogramar') return;
    enviar({ modo: plan.modo, fila: plan.fila, radicadoConocido: plan.radicado, inspector: ins || '',
      fecha: semana.dias[celda.dia].fecha, hora: celda.hora, nota: '', expediente: '' });
  }

  async function quitarDeBandeja(b) {
    if (!(await appConfirm('¿Quitar ' + (b.f['RADICADO'] || 'este caso') + ' de «Por programar»?',
      { titulo: 'Por programar', btnOk: 'Quitar', btnCancel: 'Cancelar' }))) return;
    setOcupado(true);
    try {
      const r = await gasPost({ accion: 'decretarInspeccion', fila: b.f._idx, radicadoConocido: b.f['RADICADO'], quitar: true });
      if (r && r.ok === false) throw new Error(r.error);
      invalidarCache('visitas');
      if (sel && claveRadicado(sel['RADICADO']) === claveRadicado(b.f['RADICADO'])) setSel(null);
      await cargar(true);
    } catch (e) { setError(e.message); }
    setOcupado(false);
  }

  // Arrastrar: una tarjeta del tablero (reprograma) o un caso de la bandeja (abre la confirmación).
  function soltar(k, h) {
    const a = arrastre.current; arrastre.current = null;
    if (!a || pasado(k)) return;
    if (a.bandeja) { if (libre(k, h)) setCelda({ dia: k, hora: h }); return; }
    const it = a.item;
    if (!horaLibreInspeccion(semana.items, k, h, it.inspector, it.f)) return;
    if (it.dia === k && it.hora === h) return;
    enviar({ modo: 'reprogramar', fila: it.f._idx, radicadoConocido: it.f['RADICADO'], inspector: '',
      fecha: semana.dias[k].fecha, hora: h, nota: '', expediente: '' });
  }

  // Tarjeta: dirección e «Inspector · Exp. 2201». Sin expediente, el
  // radicado completo (identificadorVisita). Antes decía «Mauricio · 09-304»
  // (los 6 últimos del radicado), que no se entendía.
  const tarjeta = (it) => {
    const completa = /^COMPLETAD/.test(it.estado);
    const mover = !completa && !/^INICIAD/.test(it.estado);
    const id = identificadorVisita(it.f).principal;
    const ins = titleCaseNombre(it.inspector).split(' ')[0] || 'Sin inspector';
    const abrir = () => window.abrirVisitaDetail && window.abrirVisitaDetail(it.f);
    return (
      <div key={it.f._idx} className={'it-tarj' + (it.fueraZona ? ' fuera' : '') + (completa ? ' hecha' : '') +
          (resaltada === it.f._idx ? ' nueva' : '')}
        style={{ '--c': _iaColor(it.inspector, inspectores) }}
        role="button" tabIndex={0}
        title={it.fueraZona ? 'Fuera de la zona del día' : undefined}
        aria-label={_iaDir(it.f) + ', ' + ins + ', ' + (id ? id.replace(/^Exp\./, 'expediente') : 'sin radicado') +
          (it.fueraZona ? ', fuera de la zona del día' : '')}
        draggable={mover} onDragStart={() => { arrastre.current = { item: it }; }}
        onClick={abrir} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } }}>
        <b>{_iaDir(it.f)}</b>
        <span><span className="it-q">{ins}</span>{id ? ' · ' : ''}{id && <span className="it-id">{/^Exp\./.test(id) ? id : 'Rad. ' + id}</span>}</span>
      </div>
    );
  };

  const casilla = (k, h, movil) => {
    const aqui = semana.items.filter(x => x.dia === k && horaAudienciasMin(x.hora) === horaAudienciasMin(h));
    const ok = libre(k, h);
    const enZ = zona === semana.dias[k].date.getDay();
    return (
      <>
        {aqui.map(tarjeta)}
        {ok && (
          <button type="button" className={'it-libre' + (enZ ? '' : ' fuera')}
            aria-label={'Programar ' + IA_DIAS[semana.dias[k].date.getDay()] + ' ' + semana.dias[k].date.getDate() + ' a las ' + horaCortaInspeccion(h) + (enZ ? '' : ', fuera de la zona')}
            onClick={() => { setCelda({ dia: k, hora: h }); setElegido(''); }}>
            {movil ? '+ Programar a las ' + horaCortaInspeccion(h) : enZ ? '+ ' + horaCortaInspeccion(h) : '+'}
          </button>
        )}
      </>
    );
  };

  const fz = semana.items.filter(x => x.fueraZona).length;
  const porIns = inspectores.map(n => ({ n, c: _iaColor(n, inspectores), k: semana.items.filter(x => _iaPrimer(x.inspector) === _iaPrimer(n)).length }));
  const d = celda ? semana.dias[celda.dia] : null;
  const libresConf = celda && plan && !plan.fijo
    ? inspectores.filter(n => horaLibreInspeccion(semana.items, celda.dia, celda.hora, n)) : [];

  return (
    <div className="it">
      <div className="it-cab">
        {segmento}
        <div className="it-semana">
          <button type="button" className="it-flecha" aria-label="Semana anterior"
            onClick={() => setLunes(l => new Date(l.getFullYear(), l.getMonth(), l.getDate() - 7))}><Icon.ChevronLeft size={16} /></button>
          <span>{_iaRangoSemana(semana.dias)}</span>
          <button type="button" className="it-flecha" aria-label="Semana siguiente"
            onClick={() => setLunes(l => new Date(l.getFullYear(), l.getMonth(), l.getDate() + 7))}><Icon.ChevronRight size={16} /></button>
          {lunes.getTime() !== lunesInspecciones(new Date()).getTime() && (
            <button type="button" className="it-hoy" onClick={() => setLunes(lunesInspecciones(new Date()))}>Esta semana</button>
          )}
        </div>
      </div>

      <div className="it-buscar">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} autoComplete="off"
          aria-label="Buscar el caso" placeholder="¿Qué caso? Radicado, N° de orden, expediente o dirección" />
        {resultados.length > 0 && (
          <div className="it-res">
            {resultados.map(c => (
              <button key={c.clave} type="button" onClick={() => elegir(c.ultima)}>
                <b>{_iaDir(c.ultima)}</b>
                <small>{c.radicado} · {c.ultima['BARRIO/VEREDA'] || ''}{c.ultima['COMUNA'] ? ' · C' + c.ultima['COMUNA'] : ''}</small>
              </button>
            ))}
          </div>
        )}
        {noEsta && !registrando && (
          puedeRegistrar ? (
            <div className="it-noesta">
              <p><b>{qRad} no está en la base.</b> Revisa que esté bien escrito; si es una PQR nueva, regístrala aquí y luego elige su hora.</p>
              <button type="button" className="it-btn" onClick={abrirRegistro}>Registrar {qRad}</button>
            </div>
          ) : (
            <p className="it-nota">
              {formaRadicadoValida(qRad)
                ? 'Ningún caso coincide. Si es una PQR nueva, pídele al administrador que la registre.'
                : 'Ningún caso coincide. Para registrar uno nuevo, escribe su radicado completo (11 dígitos o AAAA-NNNNNN).'}
            </p>
          )
        )}
      </div>
      {registrando && typeof RegistrarRadicadoBQ === 'function' && (
        <div className="it-registrar">
          <RegistrarRadicadoBQ radicado={qRad} idxBarrios={idxBarrios}
            onCancelar={() => setRegistrando(false)} onRegistrado={alRegistrar}
            onRecargar={() => { setRegistrando(false); invalidarCache('visitas'); cargar(true); }} />
        </div>
      )}

      {sel && plan && (
        <div className="it-caso">
          <div>
            <b>{_iaDir(sel)}</b>{sel['BARRIO/VEREDA'] ? ' · ' + sel['BARRIO/VEREDA'] : ''}
            <small>
              {plan.radicado} · {zona ? 'su día es ' + IA_DIAS[zona].toLowerCase() + ' (' + IA_ZONA[zona] + ')' : 'sin comuna: cualquier día'}
              {plan.puede && plan.fijo ? ' · va ' + titleCaseNombre(plan.inspector) + ', que hizo la visita anterior' : ''}
              {plan.puede && plan.modo === 'reprogramar' ? ' · ya está el ' + plan.actual.fecha + ': elige la nueva hora' : ''}
            </small>
            {!plan.puede && <small className="it-motivo">{plan.motivo}</small>}
          </div>
          <button type="button" className="it-x" aria-label="Quitar el caso" onClick={() => elegir(null)}><Icon.Close size={18} /></button>
        </div>
      )}
      {error && <p className="it-error" role="alert">{error}</p>}

      <div className="it-cuerpo">
        <aside className="it-bandeja" aria-labelledby="it-b-t">
          <h2 id="it-b-t">Por programar <span>{bandeja.length}</span></h2>
          <p className="it-nota">Decretadas en Audiencias, aún sin hora. Tócala o arrástrala a una hora.</p>
          {bandeja.map(b => (
            <div key={b.f._idx} className={'it-pend' + (sel && claveRadicado(sel['RADICADO']) === claveRadicado(b.f['RADICADO']) ? ' sel' : '')}
              draggable onDragStart={() => { elegir(b.f); arrastre.current = { bandeja: true }; }}>
              <button type="button" className="it-pend-b" onClick={() => elegir(b.f)}>
                <b>{_iaDir(b.f)}</b>
                <small>{b.f['RADICADO']}{b.f['COMUNA'] ? ' · C' + b.f['COMUNA'] : ''}</small>
                <small className="it-hace">Decretada el {b.fecha}{b.quien ? ' · ' + titleCaseNombre(b.quien).split(' ')[0] : ''}</small>
              </button>
              <button type="button" className="it-pend-x" aria-label={'Quitar ' + b.f['RADICADO'] + ' de Por programar'}
                disabled={ocupado} onClick={() => quitarDeBandeja(b)}><Icon.Close size={14} /></button>
            </div>
          ))}
        </aside>

        <section className="it-sec">
          <div className="it-tablero" role="grid" aria-label="Inspecciones de la semana">
            <div />
            {semana.dias.map((dd, k) => {
              const dw = dd.date.getDay();
              return (
                <div key={dd.fecha} className={'it-dia' + (zona === dw ? ' on' : '') + (pasado(k) ? ' pasado' : '')}>
                  <b>{IA_DIAS[dw]} {dd.date.getDate()}</b>
                  <span>{esDiaHabil(dd.date) ? IA_ZONA[dw] : 'Festivo'}</span>
                </div>
              );
            })}
            {HORAS_INSPECCION.map(h => (
              <React.Fragment key={h}>
                <div className="it-hora">{horaCortaInspeccion(h)}</div>
                {semana.dias.map((dd, k) => (
                  <div key={dd.fecha} className={'it-celda' + (zona === dd.date.getDay() ? ' on' : '')}
                    onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); soltar(k, h); }}>
                    {casilla(k, h, false)}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
          <div className="it-pie">
            {porIns.map(p => <span key={p.n} className="it-ins" style={{ '--c': p.c }}><i />{titleCaseNombre(p.n).split(' ')[0]} · {p.k}</span>)}
            {fz > 0 && <span className="it-fz">{fz === 1 ? '1 fuera de zona' : fz + ' fuera de zona'}</span>}
          </div>

          {/* Celular: tira de días + horas del día elegido */}
          <div className="it-movil">
            <div className="it-tira" role="group" aria-label="Días">
              {semana.dias.map((dd, k) => {
                const dw = dd.date.getDay();
                return (
                  <button key={dd.fecha} type="button" aria-pressed={k === diaM} className={zona === dw ? 'on' : ''} onClick={() => setDiaM(k)}>
                    <b>{IA_DIAS[dw]} {dd.date.getDate()}</b>
                    <small>{IA_ZONA_CORTA[dw]}</small>
                    <small>{semana.items.filter(x => x.dia === k).length} insp.</small>
                  </button>
                );
              })}
            </div>
            <div className="it-horas-m">
              {HORAS_INSPECCION.map(h => (
                <div key={h} className="it-hm">
                  <span className="it-hm-h">{horaCortaInspeccion(h)}</span>
                  <div>{casilla(diaM, h, true)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {celda && plan && (
        <div className="it-conf" role="dialog" aria-label="Confirmar inspección">
          <b>{IA_DIAS[d.date.getDay()]} {d.date.getDate()} · {horaCortaInspeccion(celda.hora)}</b>
          {plan.fijo || (plan.modo === 'reprogramar' && plan.inspector) ? (
            <span>{titleCaseNombre(plan.inspector)}</span>
          ) : (
            <select aria-label="Inspector" value={elegido || (libresConf.indexOf(plan.inspector) >= 0 ? plan.inspector : '')}
              onChange={e => setElegido(e.target.value)}>
              <option value="">Elegir inspector</option>
              {libresConf.map(n => <option key={n} value={n}>{titleCaseNombre(n)}</option>)}
            </select>
          )}
          {zona && zona !== d.date.getDay() && <span className="it-conf-fz">Fuera de la zona del día</span>}
          <button type="button" className="it-btn" disabled={ocupado ||
              (!plan.fijo && plan.modo !== 'reprogramar' && !(elegido || (libresConf.indexOf(plan.inspector) >= 0 && plan.inspector)))}
            onClick={programar}>{ocupado ? 'Programando…' : plan.modo === 'reprogramar' ? 'Cambiar' : 'Programar'}</button>
          <button type="button" className="it-btn-txt" onClick={() => setCelda(null)}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
