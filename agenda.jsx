// ═══════════════════════════════════════════════════════════════
// v6/agenda.jsx — Agenda (admin y supervisores). Desde 2026-11-09 es una
//   sola pantalla, la semana del equipo (agenda-semana.jsx; maqueta
//   propuesta-agenda-unificada.html): visitas e inspecciones por día de
//   zona. Aquí queda el montaje (AgendaScreen), el panel ⚙ Reglas y los
//   ayudantes de nombres que usan las dos. Las vistas viejas «Visitas»
//   (AgendaVisitasScreen) e «Inspecciones» (inspecciones-agenda.jsx) se
//   borraron: su historia está en CLAUDE.md § Agenda por inspector.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateG, useEffect: useEffectG, useRef: useRefG } = React;

// Marca que deja Administración › Equipo para abrir ⚙ Reglas al llegar.
const AGENDA_ABRIR_REGLAS_KEY = 'cu_agenda_abrir_reglas';
// Día (YYYY-MM-DD) que deja Inicio al tocar un día de la Semana: se consume
// una sola vez, como la marca de ⚙ Reglas.
const AGENDA_DIA_KEY = 'cu_agenda_dia';

// La config guarda palabras clave; se casa por palabra completa,
// case-insensitive, para que "MAURICIO" también pase con "Mauricio Pérez".
function esInspectorAgenda(nombre, palabrasClave) {
  const n = String(nombre || '').trim().toUpperCase();
  if (!n) return false;
  return (palabrasClave || []).some(k => {
    k = String(k || '').trim().toUpperCase();
    return n === k || n.indexOf(k + ' ') === 0 || n.indexOf(' ' + k + ' ') !== -1 || n.lastIndexOf(' ' + k) === n.length - k.length - 1;
  });
}

function etiquetaComuna(c) {
  return c === 'RURAL' ? 'Rural' : 'C' + c;
}

function _capitalizar(p) {
  return p ? p.charAt(0) + p.slice(1).toLowerCase() : '';
}
// «ALEJANDRO HERNANDEZ MUÑOZ» → «Alejandro Hernandez», «Alejandro», «AH».
function nombreCorto(n) {
  const p = String(n || '').trim().split(/\s+/);
  return [_capitalizar(p[0]), _capitalizar(p[1])].filter(Boolean).join(' ');
}
function nombrePila(n) { return _capitalizar(String(n || '').trim().split(/\s+/)[0]); }
function inicialesInsp(n) {
  const p = String(n || '').trim().split(/\s+/);
  return ((p[0] || '').charAt(0) + (p[1] || '').charAt(0)).toUpperCase();
}

// Admin y supervisores (veTodasLasVisitas). El supervisor ve la semana y
// programa inspecciones; asignar visitas y ⚙ Reglas son del admin
// (agenda-semana.jsx lo decide).
function AgendaScreen({ usuario }) {
  if (!usuario || !veTodasLasVisitas(usuario.rol)) {
    return <div className="card" style={{ margin: 16 }}>Acceso restringido.</div>;
  }
  return <div className="pantalla activa pad-bottom"><AgendaSemana usuario={usuario} /></div>;
}

// ⚙ Reglas: quién recibe visitas de la agenda y la meta por inspector. Es el
// único sitio que escribe CONFIG_AGENDA (antes, Administración › Agenda).
function PanelReglasAgenda({ activos, cfg, onCerrar, onGuardado }) {
  const [sel, setSel] = useStateG(() => {
    const s = {};
    activos.forEach(i => { s[i.nombre] = esInspectorAgenda(i.nombre, cfg && cfg.inspectoresAgenda); });
    return s;
  });
  const [n, setN] = useStateG((cfg && cfg.visitasPorInspector) || 3);
  const [busy, setBusy] = useStateG(false);
  const [msg, setMsg] = useStateG('');
  const ref = useRefG(null);

  useEffectG(() => {
    function onKey(e) { if (e.key === 'Escape') onCerrar(); }
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[aria-expanded]')) onCerrar();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, []);

  async function guardar() {
    const insp = activos.filter(i => sel[i.nombre]).map(i => i.nombre);
    if (!insp.length) { setMsg('Marca al menos a una persona.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await guardarConfigAgenda({ visitasPorInspector: n, inspectoresAgenda: insp });
      if (r && r.ok === false) throw new Error(r.error || 'Error desconocido');
      onGuardado({ visitasPorInspector: n, inspectoresAgenda: insp });
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  return (
    <div className="ag-reglas" ref={ref} role="dialog" aria-labelledby="ag-reglas-t">
      <h3 id="ag-reglas-t">Reglas de la agenda</h3>
      <div className="ag-reglas-t">Quién recibe visitas de la agenda</div>
      {activos.map(i => (
        <label key={i.nombre} className="ag-hab">
          <input type="checkbox" checked={!!sel[i.nombre]}
            onChange={() => setSel(s => Object.assign({}, s, { [i.nombre]: !s[i.nombre] }))} />
          <b>{i.nombre}</b>
        </label>
      ))}
      <div className="ag-reglas-fila">
        <div><b>Visitas por inspector al día</b><small>Es la meta: puedes asignar más o menos.</small></div>
        <div className="agenda-stepper">
          <button type="button" aria-label="Una menos" disabled={n <= 1} onClick={() => setN(n - 1)}>−</button>
          <span aria-live="polite">{n}</span>
          <button type="button" aria-label="Una más" disabled={n >= 10} onClick={() => setN(n + 1)}>+</button>
        </div>
      </div>
      {msg && <div className="ag-reglas-msg" role="alert">{msg}</div>}
      <div className="ag-reglas-pie">
        <button type="button" className="ag-bar-btn" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="vc-btn" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>
  );
}

window.AgendaScreen = AgendaScreen;
