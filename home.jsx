// ═══════════════════════════════════════════════════════════════
// v6/home.jsx — Pantalla Inicio: dashboard tipo Asana
//   - Indicadores: el recorrido de una visita (por realizar → por completar
//     → completadas del mes anterior y del actual)
//   - Semana de visitas
//   - Alertas (audiencia en ≤3 días hábiles, +5 días sin iniciar o completar)
// ═══════════════════════════════════════════════════════════════
const { useState: useStateH, useEffect: useEffectH, useMemo: useMemoH } = React;

// Días hábiles que una asignada puede estar sin iniciarse, o una iniciada sin
// completarse, antes de alertar. Un solo umbral para las dos. En pantalla se
// lee «días» a secas (decisión del usuario 2026-10-02): la cuenta sigue hábil.
const DIAS_ALERTA_DEMORA = 5;

// Abre Buscar con un filtro de estado ya puesto. Buscar restaura sus filtros
// de sessionStorage al montar, así que se le deja escrito lo que debe traer.
function _irBuscarConEstados(estados, onNavegar) {
  try { sessionStorage.setItem('cu_buscar_v1', JSON.stringify({ filtrosEstado: estados })); } catch (e) {}
  onNavegar('buscar');
}

function HomeScreen({ usuario, onContinuar, onNavegar }) {
  const [datos, setDatos] = useStateH([]);
  const [cargando, setCargando] = useStateH(true);
  const [error, setError] = useStateH('');
  const [refrescando, setRefrescando] = useStateH(false);

  // Admin y supervisor ven todo (stats, alertas y semana globales); el resto,
  // la regla del diligenciador. Aquí no hay acciones de gestión que separar.
  const veTodo = veTodasLasVisitas(usuario.rol);
  const miNombre = usuario.usuario.toUpperCase();

  // Filtro de inspector: uno solo para la Semana y para Alertas (los chips
  // viven en la cabecera de la Semana). Arranca del que la Semana recordaba.
  const [inspector, setInspector] = useStateH(() => _svPrefs().inspector || '');
  // Filtro por tipo de alerta: '' | 'urgente' | 'sinIniciar' | 'sinCompletar'.
  const [filtroAlerta, setFiltroAlerta] = useStateH('');

  useEffectH(() => { cargar(); }, []);
  // La lista sale de la copia local al instante; si la red trae cambios se
  // re-pinta sin spinner.
  useEffectH(() => suscribirVisitas(() => cargar(false, true)), []);

  async function cargar(forzar, silencioso) {
    if (!silencioso) { setCargando(true); setError(''); }
    try {
      const { datos: all } = await leerVisitas(forzar ? { forzar: true } : undefined);
      setDatos(all);
    } catch (e) { if (!silencioso) setError(e.message); }
    setCargando(false);
  }

  // «Recargar» con datos ya pintados no los esconde tras el spinner: siguen a
  // la vista y solo gira el ícono hasta que responde la red. Sin datos, carga normal.
  async function recargar() {
    if (refrescando) return;
    if (!datos.length) return cargar(true);
    setRefrescando(true);
    try {
      const { datos: all } = await leerVisitas({ forzar: true });
      setDatos(all); setError('');
    } catch (e) { setError(e.message); }
    setRefrescando(false);
  }

  // ── Estadísticas ──
  // Para inspector se aplica la regla diligenciador (igual que mis-visitas.jsx):
  //   PENDIENTE/ASIGNADO → cualquier co-asignado
  //   INICIADO/COMPLETADO → solo el diligenciador (primer nombre en VISITADOR(ES))
  // Para admin las stats son globales (vista de sistema). Antes todas eran
  // globales y daban inconsistencia con la sección "Asignadas hoy" debajo.
  // Cada visita abierta cae en una sola ficha: PENDIENTE (sin inspector) es
  // «por realizar»; ASIGNADO e INICIADO son «por completar».
  const stats = useMemoH(() => {
    const r = { porRealizar: 0, asignadas: 0, iniciadas: 0, mesActual: 0, mesAnterior: 0 };
    if (!datos.length) return r;
    const hoy = new Date();
    const mesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);

    datos.forEach(f => {
      const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
      // Filtro por rol — admin ve todo, inspector aplica regla diligenciador.
      if (!veTodo) {
        const vis = visitadoresBD(f).toUpperCase();
        if (!vis.includes(miNombre)) return;
        if (e === 'INICIADO' || e === 'COMPLETADO') {
          const principal = primerVisitador(vis);
          if (principal !== miNombre) return;
        }
        // Lo asignado para un día futuro no es trabajo de hoy y no se cuenta:
        // el inspector no puede verlo en sus listas, así que un contador que
        // lo sume manda a buscar una visita que no aparece por ninguna parte
        // (ver asignadaVisibleHoy en utils.js). El admin sí lo ve: sus stats
        // son la vista de sistema.
        if (!asignadaVisibleHoy(f)) return;
      }
      if (e === 'PENDIENTE') {
        r.porRealizar++;
      } else if (e === 'ASIGNADO') {
        r.asignadas++;
      } else if (e === 'INICIADO') {
        r.iniciadas++;
      } else if (e === 'COMPLETADO') {
        // Por FECHA DE VISITA (el día que el inspector salió), no por FECHA
        // DEVOLUCION: una visita de fin de mes devuelta en el siguiente
        // contaba en el mes equivocado.
        const dVis = parsearFecha(f['FECHA DE VISITA'] || '');
        if (!dVis) return;
        if (dVis.getMonth() === hoy.getMonth() && dVis.getFullYear() === hoy.getFullYear()) r.mesActual++;
        else if (dVis.getMonth() === mesAnt.getMonth() && dVis.getFullYear() === mesAnt.getFullYear()) r.mesAnterior++;
      }
    });
    return r;
  }, [datos, veTodo, miNombre]);

  // ── Alertas urgentes ──
  const alertas = useMemoH(() => {
    const rojas = [];   // audiencia en ≤3 días hábiles
    const amarillas = []; // +5 días sin iniciar o sin completar

    datos.forEach(f => {
      const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');

      // Filtro por rol (regla diligenciador, ver CLAUDE.md):
      //  PENDIENTE/ASIGNADO → cualquier co-asignado ve la alerta.
      //  INICIADO/COMPLETADO → solo el primero en VISITADOR(ES).
      if (!veTodo) {
        const vis = visitadoresBD(f).toUpperCase();
        if (!vis.includes(miNombre)) return;
        if (e === 'INICIADO' || e === 'COMPLETADO') {
          const principal = primerVisitador(vis);
          if (principal !== miNombre) return;
        }
        // Tampoco alerta por una visita que todavía no se le ha entregado.
        if (!asignadaVisibleHoy(f)) return;
      } else if (inspector && !_esVisitaDe(f, inspector)) {
        // Admin/supervisor con un inspector elegido en la Semana: misma regla
        // del diligenciador que aplica la rejilla (agruparSemana).
        return;
      }

      // Urgente es solo la audiencia cercana (decisión del usuario 2026-10-02).
      // La alerta de «PQR por vencer» se quitó: comparaba ATENCION PQR con
      // 'SI' y esa columna es una fórmula que trae días, así que nunca disparó.

      // Alerta: asignada que nadie inicia. Va ANTES del corte de abajo a
      // propósito: ese `return` descarta todo lo que no esté en INICIADO, así
      // que hasta 2026-09-19 una visita entregada y olvidada no podía alertar
      // nunca. Umbral 5 días hábiles, el mismo de "lleva N días sin completar":
      // una sola noción de "se está demorando" en toda la pantalla.
      const sinIniciar = diasSinIniciar(f);
      if (sinIniciar !== null && sinIniciar >= DIAS_ALERTA_DEMORA) {
        amarillas.push({
          f: f,
          cat: 'sinIniciar',
          mensaje: 'Sin iniciar · ' + sinIniciar + ' días',
          detalle: 'asignada ' + formatearFecha(f['FECHA ASIGNACION VISITA'] || ''),
          dias: sinIniciar,
          // La alerta NO mueve la visita a hoy: lleva al usuario a la semana
          // en que está programada.
          irSemana: f['FECHA ASIGNACION VISITA'] || '',
        });
      }

      if (e !== 'INICIADO') return;

      // Alerta roja: audiencia/citación en ≤3 días hábiles
      const fechaCit = f['FECHA CITACION'] || '';
      if (fechaCit) {
        const dCit = parsearFecha(fechaCit);
        if (dCit) {
          const diasH = diasHabilesHasta(dCit);
          if (diasH !== null && diasH >= 0 && diasH <= 3) {
            rojas.push({
              f: f,
              mensaje: diasH === 0
                ? 'Tiene audiencia HOY'
                : 'Audiencia en ' + diasH + ' día' + (diasH > 1 ? 's' : ''),
              diasH: diasH,
            });
          }
        }
      }

      // Alerta: iniciada hace ≥5 días hábiles sin completar. Hábiles, igual
      // que «sin iniciar»: las dos se ordenan juntas por días.
      const sinCompletar = diasSinCompletar(f);
      if (sinCompletar !== null && sinCompletar >= DIAS_ALERTA_DEMORA) {
        amarillas.push({
          f: f,
          cat: 'sinCompletar',
          mensaje: 'Sin completar · ' + sinCompletar + ' días',
          detalle: 'visita ' + formatearFecha(f['FECHA DE VISITA'] || f['FECHA ASIGNACION VISITA'] || ''),
          dias: sinCompletar,
        });
      }
    });

    // Ordenar: más urgentes primero
    rojas.sort((a, b) => a.diasH - b.diasH);
    amarillas.sort((a, b) => b.dias - a.dias);

    // Una misma visita puede disparar varias alertas a la vez (PQR por vencer
    // + audiencia próxima + días sin completar). Antes se renderizaba una
    // tarjeta por alerta, con keys React duplicadas ('r' + mismo _idx) y el
    // mismo predio repetido 2-3 veces en pantalla. Se conserva solo la alerta
    // más urgente de cada visita: la roja mejor rankeada; y ninguna amarilla
    // si la visita ya tiene una roja.
    const vistas = new Set();
    const rojasU = rojas.filter(a => {
      const k = a.f._idx || a.f['RADICADO'] || a.f;
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
    const amarillasU = amarillas.filter(a => !vistas.has(a.f._idx || a.f['RADICADO'] || a.f));

    // Una sola lista, urgentes primero. El conteo por tipo alimenta los chips.
    const lista = rojasU.map(a => Object.assign({ cat: 'urgente' }, a)).concat(amarillasU);
    const conteo = { urgente: 0, sinIniciar: 0, sinCompletar: 0 };
    lista.forEach(a => { conteo[a.cat]++; });
    return { lista, conteo, total: lista.length };
  }, [datos, veTodo, miNombre, inspector]);

  // Un filtro que se quedó sin alertas (cambió el inspector o llegaron datos
  // nuevos) no deja la lista vacía: vuelve a «Todas».
  const filtroAl = alertas.conteo[filtroAlerta] ? filtroAlerta : '';
  const alertasVisibles = filtroAl ? alertas.lista.filter(a => a.cat === filtroAl) : alertas.lista;

  // Inspectores activos para los chips de filtro de la semana. Misma fuente
  // que Buscar (USUARIOS vía listarInspectoresActivos, cacheado 60 s): sacar
  // los nombres de las filas mostraría gente que ya no trabaja aquí.
  const [inspectores, setInspectores] = useStateH([]);
  useEffectH(() => {
    if (!veTodo) return;
    listarInspectoresActivos()
      .then(l => setInspectores((l || []).map(u => u.nombre)))
      .catch(() => {});
  }, [veTodo]);

  // ── Render ──
  const hoyR = new Date();
  const fechaHoy = hoyR.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  const mesNombre = d => d.toLocaleDateString('es-CO', { month: 'long' });
  const mesActualTxt = mesNombre(hoyR);
  const mesAnteriorTxt = mesNombre(new Date(hoyR.getFullYear(), hoyR.getMonth() - 1, 1));
  const num = n => (cargando ? '—' : n);
  const porCompletar = stats.asignadas + stats.iniciadas;

  return (
    <div className="pantalla activa pad-bottom home-pantalla">
      {/* ── Título, fecha y recargar en un renglón ── */}
      <div className="titulo-fijo home-cab">
        <div className="page-title">Inicio</div>
        <span className="home-fecha">{fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)}</span>
        <button onClick={recargar} className={'btn-texto home-recargar' + (refrescando ? ' icono-girando' : '')}
          disabled={refrescando} aria-busy={refrescando}>
          <Icon.Refresh size={14} /> Recargar
        </button>
      </div>

      {/* ── Indicadores: el recorrido de una visita. «Por realizar» es lo que
          no tiene inspector, así que solo lo ve quien ve todas las visitas. ── */}
      <div className={'ind-fila' + (veTodo ? '' : ' ind-3')}>
        {veTodo && (
          <button type="button" className="ind ind-realizar" title="Visitas sin inspector asignado. Abre Buscar"
            onClick={() => _irBuscarConEstados(['PENDIENTE'], onNavegar)}>
            <div className="ind-cab"><span className="ind-num">{num(stats.porRealizar)}</span><span className="ind-rot">Por realizar</span></div>
          </button>
        )}
        <button type="button" className="ind ind-completar" title="Asignadas e iniciadas sin completar"
          onClick={() => veTodo ? _irBuscarConEstados(['ASIGNADO', 'INICIADO'], onNavegar) : onNavegar('mis-visitas')}>
          <div className="ind-cab"><span className="ind-num">{num(porCompletar)}</span><span className="ind-rot">Por completar</span></div>
        </button>
        <div className="ind ind-hecho">
          <div className="ind-cab"><span className="ind-num">{num(stats.mesAnterior)}</span><span className="ind-rot">Completadas en {mesAnteriorTxt}</span></div>
          <div className="ind-sub ind-sub-ancho">Mes anterior</div>
        </div>
        <div className="ind ind-hecho">
          <div className="ind-cab"><span className="ind-num">{num(stats.mesActual)}</span><span className="ind-rot">Completadas en {mesActualTxt}</span></div>
          <div className="ind-sub ind-sub-ancho">Mes actual</div>
        </div>
      </div>

      {/* ── Urgentes (audiencia en ≤3 días): franja solo cuando hay ── */}
      {!cargando && alertas.conteo.urgente > 0 && (
        <div className="home-urg" role="status">
          <span><b>{alertas.conteo.urgente} urgente{alertas.conteo.urgente === 1 ? '' : 's'}:</b> audiencia en 3 días o menos</span>
          <button type="button" className="al-btn" onClick={() => setFiltroAlerta('urgente')}>Ver urgentes</button>
        </div>
      )}

      {error && (
        <div className="card" style={{ color: 'var(--rojo)', fontSize: 13, marginBottom: 12 }}>
          {error} · <button onClick={() => cargar(true)} style={{ background: 'none', border: 'none', color: 'var(--brand-accent)', cursor: 'pointer', textDecoration: 'underline' }}>Reintentar</button>
        </div>
      )}

      {/* ── Semana + Alertas en dos columnas ≥1200 (ver
          .home-2col en styles.css); en móvil van apiladas como siempre ── */}
      <div className="home-2col">
      {/* ── Semana de visitas: sustituye a «Asignadas por hacer», que era
          exactamente su columna de hoy. Cada visita se queda en SU día —
          registrar no es visitar, el inspector puede registrar al día
          siguiente, y reubicarla en hoy sería reagendarla. ── */}
      <div style={{ marginBottom: 18 }}>
        {cargando && <div className="cargando"><div className="spinner"></div>Cargando...</div>}
        {!cargando && (
          <SemanaVisitas
            datos={datos}
            esAdmin={veTodo}
            miNombre={miNombre}
            inspectores={inspectores}
            onAbrir={onContinuar}
            inspector={inspector}
            onInspector={setInspector}
          />
        )}
      </div>

      {/* ── Alertas ── Con un inspector elegido la columna se queda aunque
          no tenga alertas: si desapareciera, la rejilla saltaría de ancho al
          cambiar de chip. */}
      {!cargando && (alertas.total > 0 || (veTodo && inspector)) && (
        <div style={{ marginBottom: 8 }}>
          <div className="al-head">
            <SeccionHeader
              titulo="Alertas"
              count={alertas.total}
              tono={alertas.conteo.urgente > 0 ? 'rojo' : 'amarillo'}
            />
            {alertas.total > 0 && (
              <div className="sv-chips al-chips">
                {[['', 'Todas', alertas.total],
                  ['urgente', 'Urgentes', alertas.conteo.urgente],
                  ['sinIniciar', 'Sin iniciar', alertas.conteo.sinIniciar],
                  ['sinCompletar', 'Sin completar', alertas.conteo.sinCompletar],
                ].filter(c => c[2] > 0).map(c => (
                  <button key={c[0]} type="button" aria-pressed={filtroAl === c[0]}
                    className={'sv-chip' + (filtroAl === c[0] ? ' activo' : '')}
                    onClick={() => setFiltroAlerta(c[0])}>{c[1]} {c[2]}</button>
                ))}
              </div>
            )}
          </div>
          {alertas.total === 0 && (
            <div className="sv-vacio">Sin alertas para {titleCaseNombre(inspector).split(/\s+/)[0]}</div>
          )}
          {alertasVisibles.map((a, i) => (
            <AlertaCard key={a.cat + (a.f._idx || i)} alerta={a}
              mostrarInspector={veTodo && !inspector} onContinuar={onContinuar} />
          ))}
        </div>
      )}
      </div>{/* .home-2col */}
    </div>
  );
}

// ── Header de sección (Alertas, Asignadas hoy, etc.) ──────────
// Estilo editorial: tipografía serif, contador en chip suave.
function SeccionHeader({ titulo, count, tono }) {
  const tonos = {
    rojo:     { bg: 'var(--rojo-bg)',    fg: 'var(--rojo)',    border: 'rgba(180,58,46,0.18)' },
    amarillo: { bg: 'var(--amarillo-bg)',fg: 'var(--cafe)',    border: 'rgba(184,135,58,0.22)' },
    acento:   { bg: 'var(--brand-bg)',   fg: 'var(--brand-ink)', border: 'rgba(201,100,66,0.18)' },
    neutro:   { bg: 'var(--gris-bg)',    fg: 'var(--texto-suave)', border: 'var(--borde)' },
  };
  const t = tonos[tono] || tonos.neutro;
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10,
      paddingBottom: 6, borderBottom: '0.5px solid var(--borde)',
    }}>
      <h2 style={{
        fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 600,
        color: 'var(--texto)', margin: 0, letterSpacing: '-0.2px',
      }}>{titulo}</h2>
      {count != null && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
          background: t.bg, color: t.fg, border: '0.5px solid ' + t.border,
          fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
        }}>{count}</span>
      )}
    </div>
  );
}

// Lleva la rejilla de la semana a la fecha indicada. Va por evento y no por
// prop porque el offset es estado interno de SemanaVisitas: subirlo hasta
// HomeScreen solo para esto obligaría a pasarlo por dos componentes que no lo
// usan para nada más.
function irASemana(fecha) {
  const off = offsetSemanaDe(fecha);
  if (off === null) return;
  window.dispatchEvent(new CustomEvent('cu-ir-semana', { detail: { offset: off, fecha: fecha } }));
  const rejilla = document.querySelector('.sv');
  if (rejilla && rejilla.scrollIntoView) rejilla.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Tarjeta de alerta, compacta (3 renglones, acción a la derecha): la columna
// es una lista de trabajo y deben verse muchas de un vistazo.
// La barra lateral y la etiqueta dicen el ESTADO con el mismo código de la
// Semana (ocre = asignada, azul = iniciada); el color solo no basta, por eso
// la etiqueta va en texto. La urgencia (PQR, audiencia) va en el motivo, en rojo.
function AlertaCard({ alerta, mostrarInspector, onContinuar }) {
  const f = alerta.f;
  const iniciada = normalizarEstado(f['ESTADO VISITA'] || f[13] || '') === 'INICIADO';
  const dir = f['DIRECCION INFRACCION'] || f['DIRECCION'] || 'Sin dirección';
  // Sin barrio: la dirección ya ubica el caso y el renglón se leía como una
  // fila de la hoja. Un RADICADO con varios valores muestra el primero + «+N».
  const rads = String(f['RADICADO'] || '').split(/\s*[\/,;\n]\s*/).filter(Boolean);
  const rad = rads.length ? rads[0] + (rads.length > 1 ? ' +' + (rads.length - 1) : '') : '—';
  const meta = [mostrarInspector && _svNombreCorto(f), alerta.detalle].filter(Boolean).join(' · ');
  // «Sin iniciar»/«Sin completar» repetían la etiqueta de estado: queda solo el
  // conteo. La urgente conserva su motivo (PQR, audiencia), que es lo que importa.
  const motivo = alerta.cat === 'urgente' ? alerta.mensaje : alerta.dias + ' días';
  // Un supervisor ve alertas de visitas ajenas: para esas solo consulta.
  const puede = puedeDiligenciar(f);

  return (
    <article className={'al-card' + (iniciada ? ' al-iniciada' : '') + (alerta.cat === 'urgente' ? ' al-urgente' : '')}>
      <div className="al-txt">
        <div className="al-motivo">
          <span className="al-estado">{iniciada ? 'Iniciada' : 'Asignada'}</span>
          <span className="al-msg" title={alerta.mensaje}>{motivo}</span>
        </div>
        <div className="al-dir" title={dir}>{dir}</div>
        <div className="al-meta" title={[f['RADICADO'], meta].filter(Boolean).join(' · ')}>
          <span className="sv-rad">{rad}</span>
          {meta && ' · ' + meta}
        </div>
      </div>
      <div className="al-acc">
        {alerta.irSemana && (
          <button type="button" className="al-icono" title="Ver en su semana"
            aria-label="Ver en su semana" onClick={() => irASemana(alerta.irSemana)}>
            <Icon.Agenda size={14} />
          </button>
        )}
        <button type="button" className="al-btn" onClick={() => puede
          ? onContinuar(f._idx, f)
          : (window.abrirVisitaDetail && window.abrirVisitaDetail(f))}>
          {!puede ? 'Ver datos' : (iniciada ? 'Continuar' : 'Iniciar')}
        </button>
      </div>
    </article>
  );
}

window.HomeScreen = HomeScreen;
