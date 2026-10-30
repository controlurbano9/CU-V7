// ═══════════════════════════════════════════════════════════════
// v6/semana-visitas.jsx — Calendario semanal de Inicio (lunes a viernes).
//
// Sustituye a la sección «Asignadas por hacer», que era exactamente su
// columna de hoy. La regla que sostiene todo el componente:
//
//   CADA VISITA SE QUEDA EN SU DÍA.
//
// Registrar no es visitar: el inspector puede hacer la visita el martes y
// registrarla el jueves. Apilar lo atrasado en "hoy" sería reagendarlo, y el
// calendario dejaría de decir cuándo se hizo el trabajo. Lo que lleva días
// sin iniciarse se avisa en Alertas (home.jsx), no moviéndolo de sitio.
//
// Toda la lógica de reparto vive en utils.js (rangoSemana, fechaAgendaVisita,
// agruparSemana) y está cubierta por tests/semana-visitas.test.js: los .jsx
// no se pueden require() desde node, así que aquí solo se pinta.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateSV, useEffect: useEffectSV, useMemo: useMemoSV } = React;

const SV_PREFS = 'cu_semana_v1';
const SV_ROTULOS = ['lun', 'mar', 'mié', 'jue', 'vie'];
const SV_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const SV_MOVIL = '(max-width: 899px)';

function _svPrefs() {
  try { return JSON.parse(sessionStorage.getItem(SV_PREFS)) || {}; } catch (e) { return {}; }
}

// "15 – 19 sep", y "29 sep – 3 oct" cuando la semana cruza de mes.
function _svRango(dias) {
  const a = dias[0], b = dias[dias.length - 1];
  const mesA = SV_MESES[a.getMonth()], mesB = SV_MESES[b.getMonth()];
  if (mesA === mesB) return a.getDate() + ' – ' + b.getDate() + ' ' + mesB;
  return a.getDate() + ' ' + mesA + ' – ' + b.getDate() + ' ' + mesB;
}

function _svMismoDia(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ── Ruta del día (2026-10-14) ──────────────────────────────────
// Decisiones del usuario: dos opciones — las visitas propias o las de todo el
// equipo (salen juntos en el carro) —; las ajenas solo se ven aquí, dirección
// y nombre, sin abrir la ficha; arranca en la ubicación actual y sigue el
// recorrido más corto (rutaMasCortaDesde, utils.js). Entra lo que falta
// visitar: la iniciada ya se visitó (se inicia en el sitio).
const SV_DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];

function _svPorVisitar(f) {
  const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  return e !== 'COMPLETADO' && e !== 'INICIADO';
}

function _svPuntoFila(f) {
  const lat = normalizarCoord(f['LATITUD'], 'lat');
  const lon = normalizarCoord(f['LONGITUD'], 'lon');
  if (lat != null && lon != null) return { lat, lon };
  return puntoDesdeTextoCoord(String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '')) || null;
}

function RutaDia({ dia, datos, miNombre, onCerrar }) {
  const { mias, equipo, hechas } = useMemoSV(() => {
    const eq = agruparSemana(datos, [dia], { esAdmin: true, inspector: '' }).porDia[0];
    const mi = miNombre ? agruparSemana(datos, [dia], { esAdmin: false, miNombre }).porDia[0] : [];
    const mias = mi.filter(_svPorVisitar), equipo = eq.filter(_svPorVisitar);
    return { mias, equipo, hechas: { mias: mi.length - mias.length, equipo: eq.length - equipo.length } };
  }, [datos, dia, miNombre]);
  const [alcance, setAlcance] = useStateSV(mias.length ? 'mias' : 'equipo');
  const cerrarRef = React.useRef(null);

  useEffectSV(() => {
    if (cerrarRef.current) cerrarRef.current.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const lista = alcance === 'mias' ? mias : equipo;
  const nHechas = hechas[alcance];
  // El mismo orden de las tarjetas (2026-10-22): el que le dieron a mano o,
  // si no, el recorrido más corto desde la Alcaldía.
  const orden = useMemoSV(() => ordenarVisitasDia(lista, formatearFecha(dia)).map((f) => {
    const dir = String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim();
    return { f, dir, punto: _svPuntoFila(f) };
  }), [lista, dia]);
  const tramos = linksRutaMaps(orden);

  const titulo = 'Ruta del ' + SV_DIAS_LARGOS[dia.getDay() - 1] + ' ' + dia.getDate();
  const aMano = lista.some((f) => ordenDiaDe(f, formatearFecha(dia)) != null);
  const sub = aMano ? 'En el orden del día' : 'El recorrido más corto desde la Alcaldía';

  return (
    <div className="dlg-overlay" onClick={onCerrar}>
      <div className="dlg ruta" role="dialog" aria-modal="true" aria-labelledby="ruta-tit"
        onClick={(e) => e.stopPropagation()}>
        <div className="dlg-grip" aria-hidden="true" />
        <div className="ruta-head">
          <div>
            <div className="ruta-tit" id="ruta-tit">{titulo}</div>
            <div className="ruta-sub" aria-live="polite">{sub}</div>
          </div>
          <button ref={cerrarRef} type="button" className="ruta-x" aria-label="Cerrar" onClick={onCerrar}>
            <Icon.Close size={18} />
          </button>
        </div>

        {mias.length > 0 && mias.length !== equipo.length && (
          <div className="ruta-seg" role="group" aria-label="Qué visitas entran en la ruta">
            {[['mias', 'Mis visitas', mias.length], ['equipo', 'Todo el equipo', equipo.length]].map(([k, t, n]) => (
              <button key={k} type="button" aria-pressed={alcance === k}
                className={alcance === k ? 'activo' : ''} onClick={() => setAlcance(k)}>
                {t} <span className="ruta-seg-n">{n}</span>
              </button>
            ))}
          </div>
        )}

        {orden.length === 0 ? (
          <div className="ruta-vacio">No queda nada por visitar este día.</div>
        ) : (
          <ol className="ruta-lista">
            {orden.map((p, i) => (
              <li key={p.f._idx || i} className="ruta-parada">
                <span className="ruta-n" aria-hidden="true">{i + 1}</span>
                <div className="ruta-txt">
                  <div className="ruta-dir">{puntoDesdeTextoCoord(p.dir) ? 'Punto GPS' : (p.dir || 'Sin dirección')}</div>
                  {p.f['REFERENCIA_DIRECCION'] && <div className="ruta-ref">{p.f['REFERENCIA_DIRECCION']}</div>}
                  <div className="ruta-meta">
                    {[ubicacionCortaVisita(p.f), alcance === 'equipo' ? nombreCortoVisita(p.f) : ''].filter(Boolean).join(' · ')}
                    {!p.punto && <span className="ruta-aprox">{ubicacionCortaVisita(p.f) || alcance === 'equipo' ? ' · ' : ''}ubicación por dirección</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        {nHechas > 0 && (
          <div className="ruta-nota">
            {nHechas === 1 ? '1 visita ya iniciada o completada no entra.' : nHechas + ' visitas ya iniciadas o completadas no entran.'}
          </div>
        )}

        {tramos.length > 0 && (
          <div className="ruta-acciones">
            {tramos.map((t, k) => (
              <a key={k} className="dlg-btn dlg-btn-ok" href={t.url} target="_blank" rel="noopener noreferrer">
                <Icon.Route size={18} />
                {tramos.length > 1 ? 'Tramo ' + (k + 1) + ' · paradas ' + t.desde + '–' + t.hasta : 'Abrir en Google Maps'}
              </a>
            ))}
            <div className="ruta-ayuda">Maps sale de donde estés y te lleva parada por parada.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tarjeta de visita ──────────────────────────────────────────
function SemanaCard({ f, movil, onAbrir, n, arrastrable, onDragStart, onDragOver, onDrop, onSubir, onBajar, inspectores, onReasignar, marca }) {
  // Reasignar (solo ADMIN): tocar el nombre del inspector abre la lista.
  const [reasignando, setReasignando] = useStateSV(false);
  const [ocupada, setOcupada] = useStateSV(false);
  const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  const puedeReasignar = !!onReasignar && (e === 'ASIGNADO' || e === 'INICIADO') &&
    inspectores && inspectores.length > 0;
  async function reasignar(fila, nombre, fv, fecha) {
    setOcupada(true);
    const hecho = await onReasignar(fila, nombre, fv, fecha);
    setOcupada(false);
    if (hecho) setReasignando(false);
  }
  // Tarjeta única (visita-card.jsx). El día ya es el tiempo: sin «hace N
  // días». El nombre del inspector sale solo donde hay chips de inspector
  // (Inicio); en la Semana de Mis visitas todo es propio. Una visita ajena
  // (supervisor) no ofrece acción: tocarla abre la ficha.
  const arr = !!arrastrable && !movil;
  return (
    <TarjetaVisita f={f} densidad="renglon" sinTiempo n={n} marca={marca}
      opts={{ veTodo: !!(inspectores && inspectores.length) }}
      onAccion={onAbrir}
      inspector={puedeReasignar ? (
        <button type="button" className="sv-insp" title="Reasignar a otro inspector"
          aria-expanded={reasignando} onClick={(ev) => { ev.stopPropagation(); setReasignando(!reasignando); }}
          style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit',
            cursor: 'pointer', textAlign: 'left', textDecoration: 'underline dotted' }}>
          {nombreCortoVisita(f) || 'Reasignar'}
        </button>
      ) : undefined}
      extra={movil && (onSubir || onBajar) ? (<>
        <button type="button" className="sv-orden" aria-label="Subir en el orden del día"
          disabled={!onSubir} onClick={onSubir}>↑</button>
        <button type="button" className="sv-orden" aria-label="Bajar en el orden del día"
          disabled={!onBajar} onClick={onBajar}>↓</button>
      </>) : null}
      pie={puedeReasignar ? (
        <PanelSeleccionInspector f={f} busy={ocupada} abierto={reasignando}
          inspectores={inspectores.map(n => ({ nombre: n }))}
          accion="asignar" conFecha onAsignar={reasignar} />
      ) : null}
      arrastre={{ draggable: arr, onDragStart: arr ? onDragStart : undefined, onDragOver, onDrop }} />
  );
}

// ── Componente principal ───────────────────────────────────────
function SemanaVisitas({ datos, esAdmin, miNombre, inspectores, onAbrir, onReasignar, inspector: inspectorExt, onInspector, onAbrirDia,
  offset: offsetExt, onOffset, enAtencion }) {
  const prefs0 = _svPrefs();
  // Con onOffset la semana la maneja Inicio, que pinta navegación y filtro en
  // una barra común a la Semana y a Alertas; la cabecera propia no se pinta.
  const [offsetLocal, setOffsetLocal] = useStateSV(prefs0.offset || 0);
  const controlada = !!onOffset;
  const offset = controlada ? (offsetExt || 0) : offsetLocal;
  const setOffset = onOffset || setOffsetLocal;
  // «Ver en su semana» cambia la semana Y elige el día; el efecto que suelta
  // el día al navegar no debe deshacer esa elección.
  const offsetRef = React.useRef(offset);
  const saltoRef = React.useRef(false);
  offsetRef.current = offset;
  // El filtro de inspector lo comparte Inicio con la lista de Alertas: si el
  // padre lo maneja (onInspector), manda el suyo; si no, es estado propio.
  const [inspectorLocal, setInspectorLocal] = useStateSV(prefs0.inspector || '');
  const inspector = onInspector ? (inspectorExt || '') : inspectorLocal;
  const setInspector = onInspector || setInspectorLocal;
  const [diaSel, setDiaSel] = useStateSV(null);
  const [rutaDia, setRutaDia] = useStateSV(null);
  // Cambios hechos aquí mientras llega la BD nueva: {[_idx]: {fecha?, orden?}}.
  const [ajustes, setAjustes] = useStateSV({});
  const [arrastre, setArrastre] = useStateSV(null);   // _idx de la tarjeta en vuelo
  const [aviso, setAviso] = useStateSV(null);         // {texto, deshacer}
  const avisoRef = React.useRef(null);
  const gridRef = React.useRef(null);
  const [movil, setMovil] = useStateSV(() => {
    try { return window.matchMedia(SV_MOVIL).matches; } catch (e) { return false; }
  });

  useEffectSV(() => {
    let mq;
    try { mq = window.matchMedia(SV_MOVIL); } catch (e) { return; }
    const on = (ev) => setMovil(ev.matches);
    // addListener: Safari < 14 no tiene addEventListener en MediaQueryList.
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on);
    };
  }, []);

  // «Ver en su semana» (alerta de Inicio). La visita no se mueve de su día:
  // lo que se mueve es la semana visible.
  useEffectSV(() => {
    const on = (ev) => {
      const d = ev.detail || {};
      if (typeof d.offset !== 'number') return;
      if (d.offset !== offsetRef.current) saltoRef.current = true;
      setOffset(d.offset);
      const f = parsearFecha(d.fecha || '');
      if (!f) { setDiaSel(null); return; }
      const dias = rangoSemana(f, 0).dias;
      let idx = -1;
      dias.forEach((x, i) => { if (_svMismoDia(x, f)) idx = i; });
      setDiaSel(idx >= 0 ? idx : null);
    };
    window.addEventListener('cu-ir-semana', on);
    return () => window.removeEventListener('cu-ir-semana', on);
  }, []);

  useEffectSV(() => {
    try { sessionStorage.setItem(SV_PREFS, JSON.stringify({ offset, inspector })); } catch (e) {}
  }, [offset, inspector]);

  // Semana movida desde fuera (barra de Inicio): el día elegido era de la
  // semana anterior, se vuelve a hoy o al lunes.
  const offsetPrevRef = React.useRef(offset);
  useEffectSV(() => {
    if (offsetPrevRef.current === offset) return;
    offsetPrevRef.current = offset;
    if (saltoRef.current) { saltoRef.current = false; return; }
    setDiaSel(null);
  }, [offset]);

  // La BD con los cambios hechos aquí que todavía no han vuelto del servidor.
  const datosEf = useMemoSV(() => {
    if (!Object.keys(ajustes).length) return datos;
    return (datos || []).map((f) => {
      const a = ajustes[f._idx];
      if (!a) return f;
      const g = Object.assign({}, f);
      if (a.fecha) g['FECHA ASIGNACION VISITA'] = a.fecha;
      if (a.orden !== undefined) g['ORDEN_DIA'] = a.orden;
      return g;
    });
  }, [datos, ajustes]);
  // Llegó la BD nueva: los ajustes ya están en ella.
  useEffectSV(() => { setAjustes({}); }, [datos]);

  const { dias, porDia, hoyIdx, conRuta } = useMemoSV(() => {
    const r = rangoSemana(new Date(), offset);
    const g = agruparSemana(datosEf, r.dias, { esAdmin, miNombre, inspector });
    // Cada día en el orden de su ruta (sugerida o la que le dieron a mano).
    g.porDia = g.porDia.map((lista, i) => ordenarVisitasDia(lista, formatearFecha(r.dias[i])));
    const hoy = new Date();
    let idx = -1;
    r.dias.forEach((d, i) => { if (_svMismoDia(d, hoy)) idx = i; });
    // «Ruta» en hoy y días por venir con algo del equipo por visitar: la
    // ruta de las ajenas existe aunque la columna (filtrada) esté vacía.
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const eq = agruparSemana(datosEf, r.dias, { esAdmin: true, inspector: '' }).porDia;
    const conRuta = r.dias.map((d, i) => d >= inicioHoy && eq[i].some(_svPorVisitar));
    return { dias: r.dias, porDia: g.porDia, hoyIdx: idx, conRuta };
  }, [datosEf, esAdmin, miNombre, inspector, offset]);

  const hojaRuta = rutaDia && (
    <RutaDia dia={rutaDia} datos={datosEf} miNombre={miNombre} onCerrar={() => setRutaDia(null)} />
  );

  function mostrarAviso(texto, deshacer) {
    clearTimeout(avisoRef.current);
    setAviso({ texto, deshacer });
    avisoRef.current = setTimeout(() => setAviso(null), 6000);
  }

  // ¿Se puede ordenar? El admin, cualquiera; el inspector, sus visitas. Lo
  // completado no se ordena (ya se hizo).
  function puedeOrdenar(f) {
    if (normalizarEstado(f['ESTADO VISITA'] || f[13] || '') === 'COMPLETADO') return false;
    return esAdmin || String(f['VISITADOR(ES)'] || '').toUpperCase().indexOf(String(miNombre || '').toUpperCase()) >= 0;
  }
  // Mover de día: solo el admin y solo una asignada que no se ha iniciado.
  function puedeMover(f) {
    return esAdmin && normalizarEstado(f['ESTADO VISITA'] || f[13] || '') === 'ASIGNADO';
  }

  async function guardarOrden(dia, lista) {
    const fecha = formatearFecha(dia);
    const previos = {};
    const nuevos = {};
    lista.forEach((f, k) => {
      previos[f._idx] = ajustes[f._idx];
      nuevos[f._idx] = Object.assign({}, ajustes[f._idx], { orden: fecha + '#' + (k + 1) });
    });
    setAjustes((a) => Object.assign({}, a, nuevos));
    try {
      await gasPost({ accion: 'guardarOrdenDia', fecha, visitas: lista.map((f, k) => ({
        fila: f._idx, radicadoConocido: f['RADICADO'] || '', idVisita: f['ID_VISITA'] || '', orden: k + 1 })) });
      invalidarCache('visitas');
    } catch (e) {
      setAjustes((a) => Object.assign({}, a, previos));
      appAlert('No se pudo guardar el orden: ' + e.message, { tono: 'error' });
    }
  }

  async function optimizarDia(dia, lista) {
    const fecha = formatearFecha(dia);
    const nuevos = {};
    lista.forEach((f) => { nuevos[f._idx] = Object.assign({}, ajustes[f._idx], { orden: '' }); });
    setAjustes((a) => Object.assign({}, a, nuevos));
    try {
      await gasPost({ accion: 'guardarOrdenDia', fecha, visitas: lista.map((f) => ({
        fila: f._idx, radicadoConocido: f['RADICADO'] || '', idVisita: f['ID_VISITA'] || '', orden: 0 })) });
      invalidarCache('visitas');
    } catch (e) { appAlert('No se pudo volver a la ruta sugerida: ' + e.message, { tono: 'error' }); }
  }

  async function moverDeDia(f, dia, silencioso) {
    const antes = f['FECHA ASIGNACION VISITA'];
    const nueva = formatearFecha(dia);
    setAjustes((a) => Object.assign({}, a, { [f._idx]: { fecha: nueva } }));
    try {
      await gasPost({ accion: 'asignarRadicado', fila: f._idx, inspector: f['VISITADOR(ES)'] || '',
        radicadoConocido: f['RADICADO'] || '', idVisita: f['ID_VISITA'] || '', fechaAsignacion: nueva });
      invalidarCache('visitas');
      if (!silencioso) {
        mostrarAviso('Movida al ' + SV_ROTULOS[dia.getDay() - 1] + ' ' + dia.getDate(),
          () => moverDeDia(Object.assign({}, f, { 'FECHA ASIGNACION VISITA': nueva }), parsearFecha(antes), true));
      } else setAviso(null);
    } catch (e) {
      setAjustes((a) => { const b = Object.assign({}, a); delete b[f._idx]; return b; });
      appAlert('No se pudo mover la visita: ' + e.message, { tono: 'error' });
    }
  }

  // Arrastrar en escritorio: al mismo día reordena; a otro, mueve (admin).
  function soltar(dia, lista, antesDe) {
    const idx = arrastre;
    setArrastre(null);
    if (idx == null) return;
    const f = datosEf.find((x) => x._idx === idx);
    if (!f) return;
    const enEsteDia = lista.some((x) => x._idx === idx);
    if (!enEsteDia) {
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      if (puedeMover(f) && dia >= hoy) moverDeDia(f, dia);
      return;
    }
    const resto = lista.filter((x) => x._idx !== idx);
    let k = antesDe == null ? resto.length : resto.findIndex((x) => x._idx === antesDe);
    if (k < 0) k = resto.length;
    const nueva = resto.slice(0, k).concat([f], resto.slice(k));
    if (nueva.every((x, i) => x._idx === lista[i]._idx)) return;
    guardarOrden(dia, nueva);
  }

  function mover(dia, lista, i, delta) {
    const j = i + delta;
    if (j < 0 || j >= lista.length) return;
    const nueva = lista.slice();
    const t = nueva[i]; nueva[i] = nueva[j]; nueva[j] = t;
    guardarOrden(dia, nueva);
  }

  const pieOrden = (dia, lista) => lista.some((f) => ordenDiaDe(f, formatearFecha(dia)) != null) && (
    <button type="button" className="sv-optimizar" onClick={() => optimizarDia(dia, lista)}>
      Volver a la ruta sugerida
    </button>
  );

  const avisoUI = aviso && (
    <div className="sv-aviso" role="status">
      {aviso.texto}
      {aviso.deshacer && <button type="button" onClick={() => { aviso.deshacer(); }}>Deshacer</button>}
    </div>
  );

  // Sin selección explícita se abre en hoy; fuera de la semana actual (o en
  // fin de semana, que no tiene columna) cae en el lunes.
  const sel = diaSel == null ? (hoyIdx >= 0 ? hoyIdx : 0) : diaSel;

  // Si los cinco días no caben (pantalla angosta), la rejilla se desplaza de
  // lado: al abrir o cambiar de semana, hoy (o el lunes) queda a la vista.
  useEffectSV(() => {
    const g = gridRef.current;
    if (!g || g.scrollWidth <= g.clientWidth) return;
    const col = g.children[hoyIdx >= 0 ? hoyIdx : 0];
    if (col) g.scrollLeft = col.offsetLeft - g.offsetLeft;
  }, [offset, hoyIdx, movil]);

  function irSemana(delta) {
    setOffset(offset + delta);
    setDiaSel(null);
  }

  const cabecera = controlada ? null : (
    <div className="sv-head">
      <div className="sv-nav">
        <button className="sv-nav-btn" aria-label="Semana anterior" onClick={() => irSemana(-1)}><Icon.ChevronLeft size={16} /></button>
        <span className="sv-rango">{_svRango(dias)}</span>
        <button className="sv-nav-btn" aria-label="Semana siguiente" onClick={() => irSemana(1)}><Icon.ChevronRight size={16} /></button>
        {offset !== 0 && (
          <button className="sv-hoy" onClick={() => { setOffset(0); setDiaSel(null); }}>Hoy</button>
        )}
      </div>
      {esAdmin && inspectores && inspectores.length > 0 && (
        <div className="sv-chips">
          <button className={'sv-chip' + (inspector === '' ? ' activo' : '')}
            onClick={() => setInspector('')}>Todos</button>
          {inspectores.map(n => (
            <button key={n} className={'sv-chip' + (inspector === n ? ' activo' : '')}
              onClick={() => setInspector(n)}>{titleCaseNombre(n).split(/\s+/)[0]}</button>
          ))}
        </div>
      )}
    </div>
  );

  // El pie «N visitas sin fecha programada» se quitó (2026-10-02): contaba
  // filas no pendientes sin fecha de asignación ni de visita — casi todas
  // viejas — y se leía como trabajo por hacer. agruparSemana lo sigue dando.
  const pie = null;

  // ── Móvil: tira de días + lista del día ──
  if (movil) {
    return (
      <div className="sv">
        {cabecera}
        <div className="sv-tira">
          {dias.map((d, i) => (
            <button key={i} className={'sv-dia' + (i === sel ? ' activo' : '') + (i === hoyIdx ? ' hoy' : '')}
              onClick={() => setDiaSel(i)}
              aria-label={SV_ROTULOS[i] + ' ' + d.getDate() + ', ' + porDia[i].length + ' visitas'}>
              <span className="sv-dia-rot">{SV_ROTULOS[i]} {d.getDate()}</span>
              <span className={'sv-dia-num' + (porDia[i].length === 0 ? ' vacio' : '')}>
                {porDia[i].length || '—'}
              </span>
            </button>
          ))}
        </div>
        <div className="sv-lista">
          {/* Solo con onAbrirDia (admin): la tira de días sigue seleccionando;
              agendar tiene su botón propio para no robarle el toque al día. */}
          {(onAbrirDia || conRuta[sel]) && (
            <div className="sv-dia-acc">
              {conRuta[sel] && (
                <button type="button" className="sv-ruta" onClick={() => setRutaDia(dias[sel])}>
                  <Icon.Route size={16} /> Ruta del día
                </button>
              )}
              {onAbrirDia && (
                <button type="button" className="sv-agendar" onClick={() => onAbrirDia(dias[sel])}>
                  Agendar
                </button>
              )}
            </div>
          )}
          {porDia[sel].length === 0 && <div className="sv-vacio">Sin visitas</div>}
          {porDia[sel].map((f, i) => {
            const ord = puedeOrdenar(f) && porDia[sel].length > 1;
            return (
              <SemanaCard key={f._idx || i} f={f} movil onAbrir={onAbrir} n={i + 1} marca={!!enAtencion && enAtencion.has(f._idx)}
                inspectores={inspectores} onReasignar={onReasignar}
                onSubir={ord && i > 0 ? () => mover(dias[sel], porDia[sel], i, -1) : null}
                onBajar={ord && i < porDia[sel].length - 1 ? () => mover(dias[sel], porDia[sel], i, 1) : null} />
            );
          })}
          {pieOrden(dias[sel], porDia[sel])}
        </div>
        {pie}
        {hojaRuta}
        {avisoUI}
      </div>
    );
  }

  // ── Escritorio: cinco columnas ──
  return (
    <div className="sv">
      {cabecera}
      <div className="sv-grid" ref={gridRef}>
        {dias.map((d, i) => (
          <div key={i} className={'sv-col' + (i === hoyIdx ? ' hoy' : '')}
            onDragOver={(e) => { if (arrastre != null) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); soltar(d, porDia[i], null); }}>
            {/* Con onAbrirDia (admin) la cabecera abre la Agenda en ese día. */}
            {onAbrirDia ? (
              <button type="button" className={'sv-col-head' + (i === hoyIdx ? ' hoy' : '')}
                aria-label={'Abrir la agenda del ' + SV_ROTULOS[i] + ' ' + d.getDate()}
                onClick={() => onAbrirDia(d)}>
                {SV_ROTULOS[i]} {d.getDate()}{i === hoyIdx && <span className="sv-pill-hoy">hoy</span>}
                {porDia[i].length > 0 && <span className="sv-col-n">{porDia[i].length}</span>}
              </button>
            ) : (
              <div className={'sv-col-head' + (i === hoyIdx ? ' hoy' : '')}>
                {SV_ROTULOS[i]} {d.getDate()}{i === hoyIdx && <span className="sv-pill-hoy">hoy</span>}
                {porDia[i].length > 0 && <span className="sv-col-n">{porDia[i].length}</span>}
              </div>
            )}
            {conRuta[i] && (
              <button type="button" className="sv-ruta"
                aria-label={'Ruta del ' + SV_DIAS_LARGOS[i] + ' ' + d.getDate()}
                onClick={() => setRutaDia(d)}>
                <Icon.Route size={14} /> Ruta
              </button>
            )}
            {porDia[i].length === 0 && <div className="sv-vacio">Sin visitas</div>}
            {porDia[i].map((f, j) => (
              <SemanaCard key={f._idx || j} f={f} onAbrir={onAbrir} n={j + 1} marca={!!enAtencion && enAtencion.has(f._idx)}
                inspectores={inspectores} onReasignar={onReasignar}
                arrastrable={puedeOrdenar(f) || puedeMover(f)}
                onDragStart={(e) => { setArrastre(f._idx); try { e.dataTransfer.setData('text/plain', String(f._idx)); } catch (x) {} }}
                onDragOver={(e) => { if (arrastre != null) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); soltar(d, porDia[i], f._idx); }} />
            ))}
            {pieOrden(d, porDia[i])}
          </div>
        ))}
      </div>
      {pie}
      {hojaRuta}
      {avisoUI}
    </div>
  );
}

if (typeof window !== 'undefined') {
  window.SemanaVisitas = SemanaVisitas;
}
