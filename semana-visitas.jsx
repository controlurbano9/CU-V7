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

// Estado → color de la barra lateral. La completada además va atenuada por
// CSS: el color solo no basta (misma regla que .ent-dot en los entregables).
function _svClaseEstado(f) {
  const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  if (e === 'COMPLETADO') return 'sv-completada';
  if (e === 'INICIADO') return 'sv-iniciada';
  return 'sv-asignada';
}

function _svTextoEstado(f) {
  const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  if (e === 'COMPLETADO') return 'completada';
  if (e === 'INICIADO') return 'iniciada';
  return 'asignada';
}

// "MAURICIO RESTREPO GOMEZ" → "Mauricio R." — en la tarjeta no hay ancho para
// el nombre completo y el apellido inicial basta para distinguir a dos.
function _svNombreCorto(fila) {
  const n = titleCaseNombre(primerVisitador(visitadoresBD(fila)));
  if (!n) return '';
  const partes = n.split(/\s+/);
  return partes.length > 1 ? partes[0] + ' ' + partes[1].charAt(0) + '.' : partes[0];
}

function _svDDMM(valor) {
  const d = parsearFecha(valor || '');
  if (!d) return '';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
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

// «Barrio · C3», o «Rural». En rural la vereda ya viene dentro de la
// dirección: repetirla gasta la única línea de contexto que hay. La comuna
// sola («3 · …») no se entendía sin saber qué era: «C3».
function _svUbic(f) {
  const dir = String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim();
  const barrio = String(f['BARRIO'] || '').trim();
  const comuna = String(f['COMUNA'] || '').trim();
  const esRural = /rural/i.test(comuna) || (!barrio && /^v(da|ereda)\b/i.test(dir));
  const comunaTxt = /^\d+$/.test(comuna) ? 'C' + comuna : comuna;
  return esRural ? 'Rural' : [barrio, comunaTxt].filter(Boolean).join(' · ');
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
  const [origen, setOrigen] = useStateSV(null);
  const [gps, setGps] = useStateSV('buscando'); // buscando | ok | sin
  const [puntosCat, setPuntosCat] = useStateSV({});
  const cerrarRef = React.useRef(null);

  useEffectSV(() => {
    if (cerrarRef.current) cerrarRef.current.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Para ordenar basta una ubicación aproximada y reciente; Maps afina la suya.
  useEffectSV(() => {
    let vivo = true;
    if (!navigator.geolocation) { setGps('sin'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { if (vivo) { setOrigen({ lat: p.coords.latitude, lon: p.coords.longitude }); setGps('ok'); } },
      () => { if (vivo) setGps('sin'); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 });
    return () => { vivo = false; };
  }, []);

  // Sin coordenadas, el punto del predio si catastro ya está en el equipo
  // (puntoMapaCatastro nunca lo descarga), igual que «Cómo llegar».
  useEffectSV(() => {
    let vivo = true;
    equipo.forEach((f) => {
      if (!filaNecesitaPuntoCatastro(f)) return;
      const dir = String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim();
      puntoMapaCatastro(dir).then((p) => {
        if (vivo && p) setPuntosCat((prev) => Object.assign({}, prev, { [dir]: { lat: p[0], lon: p[1] } }));
      }).catch(() => {});
    });
    return () => { vivo = false; };
  }, [equipo]);

  const lista = alcance === 'mias' ? mias : equipo;
  const nHechas = hechas[alcance];
  const orden = useMemoSV(() => rutaMasCortaDesde(lista.map((f) => {
    const dir = String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim();
    return { f, dir, punto: _svPuntoFila(f) || puntosCat[dir] || null };
  }), origen), [lista, puntosCat, origen]);
  const tramos = linksRutaMaps(orden);

  const titulo = 'Ruta del ' + SV_DIAS_LARGOS[dia.getDay() - 1] + ' ' + dia.getDate();
  const sub = gps === 'buscando' ? 'Buscando tu ubicación…'
    : gps === 'ok' ? 'El recorrido más corto desde donde estás'
    : 'Sin tu ubicación: el orden sale desde la Alcaldía';

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
                  <div className="ruta-meta">
                    {[_svUbic(p.f), alcance === 'equipo' ? _svNombreCorto(p.f) : ''].filter(Boolean).join(' · ')}
                    {!p.punto && <span className="ruta-aprox">{_svUbic(p.f) || alcance === 'equipo' ? ' · ' : ''}ubicación por dirección</span>}
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
function SemanaCard({ f, movil, onAbrir }) {
  const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  const dir = String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim() || 'Sin dirección';
  const rad = String(f['RADICADO'] || '').trim();
  const fRad = _svDDMM(f['FECHA RADICADO']);
  const ubic = _svUbic(f);

  let accion = 'Iniciar';
  if (e === 'INICIADO') accion = 'Continuar';
  else if (e === 'COMPLETADO') accion = movil ? 'Ver datos' : 'Ver';
  else if (movil) accion = 'Iniciar visita';
  // Un supervisor ve la semana de todos: en visita ajena solo consulta, no
  // abre el formulario (se guardaría sobre la fila de otro inspector).
  const soloVer = e !== 'COMPLETADO' && !puedeDiligenciar(f);
  if (soloVer) accion = movil ? 'Ver datos' : 'Ver';

  return (
    <div className={'sv-card ' + _svClaseEstado(f)}
      aria-label={dir + ', ' + _svTextoEstado(f)}>
      <div className="sv-dir">{dir}</div>
      <div className="sv-meta">
        {ubic && <span>{ubic} · </span>}
        {rad && <span className="sv-rad">{rad}</span>}
        {rad && fRad && ' · '}
        {fRad}
      </div>
      <div className="sv-pie">
        <span className="sv-insp">{_svNombreCorto(f)}</span>
        <span className="sv-acc">
          {/* Firma (fila, datos): la misma de BotonContinuarVisita y AlertaCard.
              Con solo (f) el router recibe la fila donde espera el _idx y el
              formulario abre sin datos. */}
          <button className={'sv-btn' + (e === 'COMPLETADO' || soloVer ? '' : ' sv-btn-acc')} onClick={() => soloVer
            ? (window.abrirVisitaDetail && window.abrirVisitaDetail(f))
            : (onAbrir && onAbrir(f._idx, f))}>{accion}</button>
          <BotonMapaVisita f={f} variante="icono" />
        </span>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────
function SemanaVisitas({ datos, esAdmin, miNombre, inspectores, onAbrir, inspector: inspectorExt, onInspector, onAbrirDia,
  offset: offsetExt, onOffset }) {
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

  const { dias, porDia, hoyIdx, conRuta } = useMemoSV(() => {
    const r = rangoSemana(new Date(), offset);
    const g = agruparSemana(datos, r.dias, { esAdmin, miNombre, inspector });
    const hoy = new Date();
    let idx = -1;
    r.dias.forEach((d, i) => { if (_svMismoDia(d, hoy)) idx = i; });
    // «Ruta» en hoy y días por venir con algo del equipo por visitar: la
    // ruta de las ajenas existe aunque la columna (filtrada) esté vacía.
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const eq = agruparSemana(datos, r.dias, { esAdmin: true, inspector: '' }).porDia;
    const conRuta = r.dias.map((d, i) => d >= inicioHoy && eq[i].some(_svPorVisitar));
    return { dias: r.dias, porDia: g.porDia, hoyIdx: idx, conRuta };
  }, [datos, esAdmin, miNombre, inspector, offset]);

  const hojaRuta = rutaDia && (
    <RutaDia dia={rutaDia} datos={datos} miNombre={miNombre} onCerrar={() => setRutaDia(null)} />
  );

  // Sin selección explícita se abre en hoy; fuera de la semana actual (o en
  // fin de semana, que no tiene columna) cae en el lunes.
  const sel = diaSel == null ? (hoyIdx >= 0 ? hoyIdx : 0) : diaSel;

  function irSemana(delta) {
    setOffset(offset + delta);
    setDiaSel(null);
  }

  const cabecera = controlada ? null : (
    <div className="sv-head">
      <div className="sv-nav">
        <button className="sv-nav-btn" aria-label="Semana anterior" onClick={() => irSemana(-1)}>‹</button>
        <span className="sv-rango">{_svRango(dias)}</span>
        <button className="sv-nav-btn" aria-label="Semana siguiente" onClick={() => irSemana(1)}>›</button>
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
          {porDia[sel].map((f, i) => (
            <SemanaCard key={f._idx || i} f={f} movil onAbrir={onAbrir} />
          ))}
        </div>
        {pie}
        {hojaRuta}
      </div>
    );
  }

  // ── Escritorio: cinco columnas ──
  return (
    <div className="sv">
      {cabecera}
      <div className="sv-grid">
        {dias.map((d, i) => (
          <div key={i} className={'sv-col' + (i === hoyIdx ? ' hoy' : '')}>
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
              <SemanaCard key={f._idx || j} f={f} onAbrir={onAbrir} />
            ))}
          </div>
        ))}
      </div>
      {pie}
      {hojaRuta}
    </div>
  );
}

if (typeof window !== 'undefined') {
  window.SemanaVisitas = SemanaVisitas;
}
