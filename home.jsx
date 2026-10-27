// ═══════════════════════════════════════════════════════════════
// v6/home.jsx — Pantalla Inicio (admin y supervisor), tres bloques
// (revisión de arquitectura 2026-10-27, decisión 2):
//   - Indicadores: el recorrido de una visita (por realizar → por completar
//     → completadas del mes anterior y del actual)
//   - Semana de visitas, con un punto en las que están en Atención
//   - Atención: audiencia en ≤3 días hábiles, +5 días sin iniciar o completar
// Salieron la franja «N urgentes» y «Audiencias de la semana»: repetían la
// misma visita de Atención.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateH, useEffect: useEffectH, useMemo: useMemoH } = React;

// Días hábiles que una asignada puede estar sin iniciarse, o una iniciada sin
// completarse, antes de alertar. Un solo umbral para las dos. En pantalla se
// lee «días» a secas (decisión del usuario 2026-10-02): la cuenta sigue hábil.
const DIAS_ALERTA_DEMORA = 5;

// Abre Buscar con un filtro de estado ya puesto. Buscar restaura sus filtros
// de sessionStorage al montar, así que se le deja escrito lo que debe traer.
function _irBuscarConEstados(estados, onNavegar) {
  try { sessionStorage.setItem('cu_buscar_v2', JSON.stringify({ filtrosEstado: estados })); } catch (e) {}
  onNavegar('buscar');
}

// La Semana abre la Agenda en el día tocado (solo admin; el supervisor no
// gestiona). La fecha viaja por sessionStorage porque la Agenda se monta
// después de navegar: mismo patrón que cu_buscar_v2 y cu_agenda_abrir_reglas.
function _abrirAgendaEnDia(fecha, onNavegar) {
  const d = fecha instanceof Date ? fecha : parsearFecha(fecha);
  if (!d) return;
  try {
    sessionStorage.setItem('cu_agenda_dia', d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  } catch (e) {}
  onNavegar('agenda');
}

function HomeScreen({ usuario, onContinuar, onNavegar }) {
  const [datos, setDatos] = useStateH([]);
  const [cargando, setCargando] = useStateH(true);
  const [error, setError] = useStateH('');

  // Admin y supervisor ven todo (stats, alertas y semana globales); el resto,
  // la regla del diligenciador. Aquí no hay acciones de gestión que separar.
  const veTodo = veTodasLasVisitas(usuario.rol);
  const miNombre = usuario.usuario.toUpperCase();

  // Filtro de inspector: uno solo para la Semana y para Atención, en la barra
  // común a las dos (no toca los indicadores). Arranca del que la Semana
  // recordaba. La semana visible también vive aquí: su navegación va en esa
  // misma barra.
  const [inspector, setInspector] = useStateH(() => _svPrefs().inspector || '');
  const [offsetSemana, setOffsetSemana] = useStateH(() => _svPrefs().offset || 0);

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

  // ── Atención ── La regla (qué entra, en qué orden, una tarjeta por visita)
  // vive en utils.js: atencionInicio, tests/atencion-inicio.test.js. La Semana
  // marca con un punto las visitas que están aquí, sin repetirlas.
  const atencion = useMemoH(() => atencionInicio(datos, { veTodo, miNombre, inspector }),
    [datos, veTodo, miNombre, inspector]);
  const enAtencion = useMemoH(() => new Set(atencion.map(a => a.f._idx)), [atencion]);

  // Inspectores activos para los chips de filtro de la semana. Misma fuente
  // que Buscar (USUARIOS vía listarInspectoresActivos, cacheado 60 s): sacar
  // los nombres de las filas mostraría gente que ya no trabaja aquí.
  const [inspectores, setInspectores] = useStateH([]);
  useEffectH(() => {
    if (!veTodo) return;
    listarInspectoresActivos()
      // Sin nombre (fila de USUARIOS incompleta) no hay chip: salía en blanco.
      .then(l => setInspectores((l || []).map(u => u.nombre).filter(n => String(n || '').trim())))
      .catch(() => {});
  }, [veTodo]);

  // Reasignar desde la tarjeta de la Semana (solo ADMIN; el supervisor ve,
  // no gestiona). Misma acción y confirmación que Buscar.
  async function reasignarDesdeSemana(fila, nombre, f, fecha) {
    try {
      if (!(await asignarVisitaAdmin(fila, nombre, f, fecha))) return false;
      await cargar(true, true);
      return true;
    } catch (e) {
      // La escritura pudo hacerse y perderse la respuesta: se recarga igual.
      invalidarCache('visitas'); cargar(true, true);
      await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' });
      return false;
    }
  }

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
      {/* ── Título y fecha en un renglón (el «Actualizar» global vive en la
          barra superior de app.jsx desde E3) ── */}
      <div className="titulo-fijo home-cab">
        <div className="page-title">Inicio</div>
        <span className="home-fecha">{fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)}</span>
      </div>

      {/* ── Indicadores: el recorrido de una visita. «Pendientes» es lo que
          no tiene inspector, así que solo lo ve quien ve todas las visitas.
          Sin «Mes anterior/actual»: el rótulo ya nombra el mes. Los que abren
          Buscar muestran una flecha al pasar el ratón. ── */}
      <div className={'ind-fila' + (veTodo ? '' : ' ind-3')}>
        {veTodo && (
          <button type="button" className="ind ind-realizar" title="Visitas sin inspector asignado. Abre Buscar"
            onClick={() => _irBuscarConEstados(['PENDIENTE'], onNavegar)}>
            <span className="ind-num">{num(stats.porRealizar)}</span><span className="ind-rot">Pendientes</span>
            <span className="ind-flecha" aria-hidden="true">→</span>
          </button>
        )}
        <button type="button" className="ind ind-completar" title="Asignadas e iniciadas sin completar"
          onClick={() => veTodo ? _irBuscarConEstados(['ASIGNADO', 'INICIADO'], onNavegar) : onNavegar('mis-visitas')}>
          <span className="ind-num">{num(porCompletar)}</span><span className="ind-rot">Asignadas e iniciadas</span>
          <span className="ind-flecha" aria-hidden="true">→</span>
        </button>
        <div className="ind ind-hecho">
          <span className="ind-num">{num(stats.mesAnterior)}</span><span className="ind-rot">Completadas en {mesAnteriorTxt}</span>
        </div>
        <div className="ind ind-hecho">
          <span className="ind-num">{num(stats.mesActual)}</span><span className="ind-rot">Completadas en {mesActualTxt}</span>
        </div>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--rojo)', fontSize: 13, marginBottom: 12 }}>
          {error} · <button onClick={() => cargar(true)} style={{ background: 'none', border: 'none', color: 'var(--brand-accent)', cursor: 'pointer', textDecoration: 'underline' }}>Reintentar</button>
        </div>
      )}

      {/* ── Barra del área de trabajo: semana visible a la izquierda y filtro
          de inspector a la derecha. Va encima de la Semana y de Atención
          porque el filtro afecta a las dos (y a los indicadores no). ── */}
      <div className="home-barra">
        <div className="sv-nav">
          <button className="sv-nav-btn" aria-label="Semana anterior" onClick={() => setOffsetSemana(offsetSemana - 1)}>‹</button>
          <span className="sv-rango">{_svRango(rangoSemana(new Date(), offsetSemana).dias)}</span>
          <button className="sv-nav-btn" aria-label="Semana siguiente" onClick={() => setOffsetSemana(offsetSemana + 1)}>›</button>
          {offsetSemana !== 0 && (
            <button className="sv-hoy" onClick={() => setOffsetSemana(0)}>Hoy</button>
          )}
        </div>
        {veTodo && inspectores.length > 0 && (
          <div className="sv-chips home-insp">
            <button className={'sv-chip' + (inspector === '' ? ' activo' : '')} aria-pressed={inspector === ''}
              onClick={() => setInspector('')}>Todos</button>
            {inspectores.map(n => (
              <button key={n} className={'sv-chip' + (inspector === n ? ' activo' : '')} aria-pressed={inspector === n}
                onClick={() => setInspector(n)}>{titleCaseNombre(n).split(/\s+/)[0]}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Semana + Atención: carriles del mismo alto ≥1440 (ver .home-2col
          en styles.css); por debajo, Atención va debajo de la semana ── */}
      <div className="home-2col">
      {/* ── Semana de visitas: sustituye a «Asignadas por hacer», que era
          exactamente su columna de hoy. Cada visita se queda en SU día —
          registrar no es visitar, el inspector puede registrar al día
          siguiente, y reubicarla en hoy sería reagendarla. ── */}
      <div className="home-sem">
        {cargando && <div className="cargando"><div className="spinner"></div>Cargando...</div>}
        {!cargando && (
          <SemanaVisitas
            datos={datos}
            esAdmin={veTodo}
            miNombre={miNombre}
            inspectores={inspectores}
            onAbrir={onContinuar}
            onReasignar={usuario.rol === 'ADMIN' ? reasignarDesdeSemana : undefined}
            inspector={inspector}
            onInspector={setInspector}
            offset={offsetSemana}
            onOffset={setOffsetSemana}
            onAbrirDia={usuario.rol === 'ADMIN' ? (f) => _abrirAgendaEnDia(f, onNavegar) : undefined}
            enAtencion={enAtencion}
          />
        )}
      </div>

      {/* ── Atención (decisión 2 de la revisión de arquitectura): una sola
          lista, una tarjeta por visita — audiencias a ≤3 días hábiles primero,
          luego lo que lleva ≥5 días sin iniciar o sin completar. Sin chips: la
          tarjeta dice el motivo. Con un inspector elegido la columna se queda
          aunque esté vacía: si desapareciera, la rejilla saltaría de ancho al
          cambiar de chip. Es un carril como los días: la cabecera queda fija y
          la lista desplaza dentro. */}
      {!cargando && (atencion.length > 0 || (veTodo && inspector)) && (
        <div className="home-al">
          <div className="al-head">
            <h2 className="home-al-tit">
              Atención
              <span className={'home-al-n' + (atencion.some(a => a.cat === 'urgente') ? ' urg' : '')}>{atencion.length}</span>
            </h2>
          </div>
          {atencion.length === 0 && (
            <div className="sv-vacio">Nada pendiente de {titleCaseNombre(inspector).split(/\s+/)[0]}</div>
          )}
          {atencion.map((a, i) => (
            <AlertaCard key={a.cat + (a.f._idx || i)} alerta={a}
              mostrarInspector={veTodo && !inspector} onContinuar={onContinuar} />
          ))}
        </div>
      )}
      </div>{/* .home-2col */}
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

// Tarjeta de Atención = tarjeta única en renglón (visita-card.jsx). El tiempo
// es el motivo (atencionInicio): «Audiencia mañana · 9:00 a. m.» en rojo, o
// «132 días sin iniciar». Una visita ajena (supervisor) no ofrece acción:
// tocarla abre la ficha.
function AlertaCard({ alerta, mostrarInspector, onContinuar }) {
  const urgente = alerta.cat === 'urgente';
  return (
    <TarjetaVisita f={alerta.f} densidad="renglon" opts={{ veTodo: !!mostrarInspector }}
      onAccion={onContinuar} urgente={urgente} tiempo={alerta.motivo}
      extra={alerta.irSemana ? (
        <button type="button" className="al-icono" title="Ver en su semana"
          aria-label="Ver en su semana" onClick={() => irASemana(alerta.irSemana)}>
          <Icon.Agenda size={14} />
        </button>
      ) : null} />
  );
}

window.HomeScreen = HomeScreen;
