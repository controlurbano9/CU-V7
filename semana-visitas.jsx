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

// ── Tarjeta de visita ──────────────────────────────────────────
function SemanaCard({ f, movil, onAbrir }) {
  const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  const dir = String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim() || 'Sin dirección';
  const barrio = String(f['BARRIO'] || '').trim();
  const comuna = String(f['COMUNA'] || '').trim();
  const rad = String(f['RADICADO'] || '').trim();
  const fRad = _svDDMM(f['FECHA RADICADO']);

  // En rural la vereda ya viene dentro de la dirección: repetirla gasta la
  // única línea de contexto que tiene la tarjeta.
  const esRural = /rural/i.test(comuna) || (!barrio && /^v(da|ereda)\b/i.test(dir));
  const ubic = esRural ? 'Rural' : [barrio, comuna].filter(Boolean).join(' · ');

  let accion = 'Iniciar';
  if (e === 'INICIADO') accion = movil ? 'Continuar' : 'Seguir';
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
          <button className="sv-btn" onClick={() => soloVer
            ? (window.abrirVisitaDetail && window.abrirVisitaDetail(f))
            : (onAbrir && onAbrir(f._idx, f))}>{accion}</button>
          <BotonMapaVisita f={f} variante="icono" />
        </span>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────
function SemanaVisitas({ datos, esAdmin, miNombre, inspectores, onAbrir }) {
  const prefs0 = _svPrefs();
  const [offset, setOffset] = useStateSV(prefs0.offset || 0);
  const [inspector, setInspector] = useStateSV(prefs0.inspector || '');
  const [diaSel, setDiaSel] = useStateSV(null);
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

  const { dias, porDia, sinFecha, hoyIdx } = useMemoSV(() => {
    const r = rangoSemana(new Date(), offset);
    const g = agruparSemana(datos, r.dias, { esAdmin, miNombre, inspector });
    const hoy = new Date();
    let idx = -1;
    r.dias.forEach((d, i) => { if (_svMismoDia(d, hoy)) idx = i; });
    return { dias: r.dias, porDia: g.porDia, sinFecha: g.sinFecha, hoyIdx: idx };
  }, [datos, esAdmin, miNombre, inspector, offset]);

  // Sin selección explícita se abre en hoy; fuera de la semana actual (o en
  // fin de semana, que no tiene columna) cae en el lunes.
  const sel = diaSel == null ? (hoyIdx >= 0 ? hoyIdx : 0) : diaSel;

  function irSemana(delta) {
    setOffset(offset + delta);
    setDiaSel(null);
  }

  const cabecera = (
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

  const pie = sinFecha > 0 && (
    <div className="sv-sinfecha">
      {sinFecha === 1 ? '1 visita sin fecha programada' : sinFecha + ' visitas sin fecha programada'}
      {' · se encuentran en Buscar'}
    </div>
  );

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
          {porDia[sel].length === 0 && <div className="sv-vacio">Sin visitas</div>}
          {porDia[sel].map((f, i) => (
            <SemanaCard key={f._idx || i} f={f} movil onAbrir={onAbrir} />
          ))}
        </div>
        {pie}
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
            <div className={'sv-col-head' + (i === hoyIdx ? ' hoy' : '')}>
              {SV_ROTULOS[i]} {d.getDate()}{i === hoyIdx ? ' · hoy' : ''}
            </div>
            {porDia[i].length === 0 && <div className="sv-vacio">Sin visitas</div>}
            {porDia[i].map((f, j) => (
              <SemanaCard key={f._idx || j} f={f} onAbrir={onAbrir} />
            ))}
          </div>
        ))}
      </div>
      {pie}
    </div>
  );
}

if (typeof window !== 'undefined') {
  window.SemanaVisitas = SemanaVisitas;
}
