// ═══════════════════════════════════════════════════════════════
// v6/admin.jsx — Pantalla piloto Administración (V5 → React)
// ═══════════════════════════════════════════════════════════════
const { useState: useStateA, useEffect: useEffectA } = React;

function AdminScreen({ usuario }) {
  const [tab, setTab] = useStateA('usuarios'); // usuarios | pin | agenda | vigilancia | log
  if (usuario.rol !== 'ADMIN') {
    return <div className="card" style={{ margin: 16 }}>Acceso restringido.</div>;
  }
  return (
    <div className="pantalla activa pad-bottom">
      <div className="page-title" style={{ marginBottom: 16 }}>Administración</div>

      <div className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--borde)' }}>
          {[
            { k: 'usuarios',   l: 'Usuarios' },
            { k: 'pin',        l: 'Reset PIN' },
            { k: 'vigilancia', l: 'Vigilancia' },
            { k: 'agenda',     l: 'Agenda' },
            { k: 'log',        l: 'Auditoría' },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              flex: 1, padding: '12px 8px', background: 'none', border: 'none',
              borderBottom: tab === t.k ? '2px solid var(--brand-accent)' : '2px solid transparent',
              color: tab === t.k ? 'var(--brand-accent)' : 'var(--texto-suave)',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}>{t.l}</button>
          ))}
        </div>
      </div>

      {tab === 'usuarios'   && <TabUsuarios />}
      {tab === 'pin'        && <TabResetPin />}
      {tab === 'vigilancia' && <TabVigilancia />}
      {tab === 'agenda'     && <TabConfigAgenda />}
      {tab === 'log'        && <TabLog />}
    </div>
  );
}

// ── Pestaña Vigilancia: visitas con orden de suspensión preventiva ───
// Lista las visitas donde SUSPENSION DE LA OBRA === SI y existe
// N ORDEN DE POLICIA. Permite generar (o reabrir) la solicitud de
// vigilancia policial guardada en la carpeta de la visita.
function TabVigilancia() {
  const [filas, setFilas]       = useStateA([]);
  const [cargando, setCargando] = useStateA(true);
  const [error, setError]       = useStateA('');
  const [busyFila, setBusyFila] = useStateA(null);

  useEffectA(() => { cargar(); }, []);

  async function cargar(forzar) {
    setCargando(true); setError('');
    try {
      const { datos } = await leerVisitas({ forzar: !!forzar });
      const susp = datos.filter(d => {
        const s = (d['SUSPENSION DE LA OBRA'] || '').toString().trim().toUpperCase();
        const orden = (d['N ORDEN DE POLICIA'] || d['N° ORDEN DE POLICIA'] || '').toString().trim();
        return s === 'SI' && orden;
      });
      // Ordenar por fecha de visita descendente (más recientes primero).
      // localeCompare sobre DD/MM/YYYY ordena por día primero, no por fecha real;
      // parseamos a timestamp para que "02/02/2026" > "10/01/2026" como debe ser.
      susp.sort((a, b) => _ts(b['FECHA DE VISITA']) - _ts(a['FECHA DE VISITA']));
      setFilas(susp);
    } catch (e) { setError(e.message); }
    setCargando(false);
  }

  // Timestamp para ordenar. parsearFecha() (utils.js) ya cubre Date,
  // DD/MM/YYYY e ISO; antes había aquí una tercera copia del mismo parser.
  function _ts(val) {
    const d = parsearFecha(val);
    return d ? d.getTime() : 0;
  }

  async function generar(f) {
    const idCarpeta = extraerIdCarpetaDrive(f['LINK_DRIVE'] || f[55] || '');
    if (!idCarpeta) { await appAlert('La visita no tiene carpeta de Drive asociada.', { tono: 'aviso', titulo: 'Sin carpeta' }); return; }
    setBusyFila(f._idx);
    try {
      const r = await generarSolicitudVigilancia({
        fila:             f._idx,
        idCarpetaVisita:  idCarpeta,
        radicado:         f['RADICADO'] || '',
        fechaVisita:      f['FECHA DE VISITA'] || '',
        nOrdenPolicia:    f['N ORDEN DE POLICIA'] || f['N° ORDEN DE POLICIA'] || '',
        direccion:        f['DIRECCION INFRACCION'] || f['DIRECCION'] || '',
        barrio:           f['BARRIO/VEREDA'] || f['BARRIO'] || '',
      });
      // Refrescar para mostrar el link recién escrito en BD
      await cargar(true);
      if (r.linkDoc) window.open(r.linkDoc, '_blank', 'noopener,noreferrer');
    } catch (e) {
      await appAlert('Error generando solicitud: ' + e.message, { tono: 'error', titulo: 'Error' });
    }
    setBusyFila(null);
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="card-titulo">Solicitudes de vigilancia policial</div>
        <button onClick={() => cargar(true)} style={{
          background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
          padding: '6px 12px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
        }}>Recargar</button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 10 }}>
        Visitas con orden de suspensión preventiva activa. Generar el oficio crea (o reabre)
        un Google Doc en la carpeta de Drive de la visita.
      </div>
      {cargando && <div style={{ padding: 20, textAlign: 'center', color: 'var(--texto-suave)' }}>Cargando...</div>}
      {error && <div style={{ color: 'var(--rojo)', fontSize: 13 }}>{error}</div>}
      {!cargando && !error && filas.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--texto-suave)', fontSize: 13 }}>
          No hay visitas con orden de suspensión.
        </div>
      )}
      {!cargando && !error && filas.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--gris-bg)' }}>
                <th style={{ padding: 8, textAlign: 'left' }}>Radicado</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Dirección</th>
                <th style={{ padding: 8, textAlign: 'center' }}>Orden</th>
                <th style={{ padding: 8, textAlign: 'center' }}>Fecha visita</th>
                <th style={{ padding: 8, textAlign: 'center' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => {
                const link = f['LINK_SOLICITUD_VIGILANCIA'] || '';
                const busy = busyFila === f._idx;
                return (
                  <tr key={f._idx} style={{ borderBottom: '1px solid var(--borde)' }}>
                    <td style={{ padding: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{f['RADICADO'] || '—'}</td>
                    <td style={{ padding: 8 }}>
                      <div>{f['DIRECCION INFRACCION'] || f['DIRECCION'] || '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--texto-suave)' }}>
                        {f['BARRIO/VEREDA'] || f['BARRIO'] || ''}
                      </div>
                    </td>
                    <td style={{ padding: 8, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {f['N ORDEN DE POLICIA'] || f['N° ORDEN DE POLICIA'] || '—'}
                    </td>
                    <td style={{ padding: 8, textAlign: 'center', fontSize: 11 }}>{f['FECHA DE VISITA'] || '—'}</td>
                    <td style={{ padding: 6, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => generar(f)} disabled={busy} style={{
                          background: 'var(--brand-bg)', color: 'var(--brand-ink)',
                          border: '1px solid var(--brand-accent)', borderRadius: 6,
                          padding: '4px 10px', fontSize: 11, cursor: busy ? 'wait' : 'pointer',
                          fontFamily: 'inherit', fontWeight: 600,
                        }}>{busy ? 'Generando...' : (link ? 'Regenerar' : 'Generar')}</button>
                        {link && (
                          <a href={link} target="_blank" rel="noopener noreferrer" style={{
                            fontSize: 11, color: 'var(--verde-dark)', textDecoration: 'none',
                            alignSelf: 'center',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}><Icon.Check size={12} /> Ver oficio</a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabUsuarios() {
  const [usuarios, setUsuarios] = useStateA([]);
  const [cargando, setCargando] = useStateA(true);
  const [error, setError] = useStateA('');

  useEffectA(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true); setError('');
    try { setUsuarios(await listarUsuariosAdmin()); }
    catch (e) { setError(e.message); }
    setCargando(false);
  }

  // busyFila evita el doble POST si se pulsa dos veces mientras responde el
  // webhook (antes el botón quedaba activo durante toda la petición).
  const [busyFila, setBusyFila] = useStateA(null);

  async function togglear(u) {
    if (busyFila) return;
    const accion = u.activo ? 'desactivar' : 'activar';
    if (!(await appConfirm(`¿${accion} a ${u.nombre}?`, {
      titulo: u.activo ? 'Desactivar usuario' : 'Activar usuario',
      btnOk: u.activo ? 'Desactivar' : 'Activar',
      peligro: u.activo,
    }))) return;
    setBusyFila(u.fila);
    try {
      await toggleActivo(u.fila, u.activo ? 'NO' : 'SI');
      await cargar();
    } catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
    setBusyFila(null);
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="card-titulo">Usuarios del sistema</div>
        <button onClick={cargar} style={{
          background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
          padding: '6px 12px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
        }}>Recargar</button>
      </div>
      {cargando && <div style={{ padding: 20, textAlign: 'center', color: 'var(--texto-suave)' }}>Cargando...</div>}
      {error && <div style={{ color: 'var(--rojo)', fontSize: 13 }}>{error}</div>}
      {!cargando && !error && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--gris-bg)' }}>
                <th style={{ padding: 8, textAlign: 'left' }}>Nombre</th>
                <th style={{ padding: 8 }}>Cargo</th>
                <th style={{ padding: 8 }}>Rol</th>
                <th style={{ padding: 8 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.fila} style={{ borderBottom: '1px solid var(--borde)' }}>
                  <td style={{ padding: 8 }}>{u.nombre}</td>
                  <td style={{ padding: 8, textAlign: 'center', fontSize: 11 }}>{u.cargo}</td>
                  <td style={{ padding: 8, textAlign: 'center' }}>{u.rol}</td>
                  <td style={{ padding: 6, textAlign: 'center' }}>
                    {/* El estado se muestra como texto y el botón nombra la
                        ACCIÓN. Antes el botón decía "Activo"/"Inactivo", así
                        que pulsar "Activo" desactivaba al usuario. */}
                    <span className={'badge-suave ' + (u.activo ? 'badge-verde' : 'badge-rojo')}
                      style={{ marginRight: 8 }}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                    <button onClick={() => togglear(u)} disabled={busyFila != null} style={{
                      background: 'var(--gris-bg)', color: u.activo ? 'var(--rojo)' : 'var(--verde)',
                      border: '1px solid var(--borde)', borderRadius: 6, padding: '4px 10px',
                      fontSize: 11, cursor: busyFila != null ? 'not-allowed' : 'pointer',
                      opacity: busyFila != null ? 0.5 : 1, fontFamily: 'inherit', fontWeight: 600,
                    }}>{busyFila === u.fila ? '...' : (u.activo ? 'Desactivar' : 'Activar')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabResetPin() {
  const [usuarios, setUsuarios] = useStateA([]);
  const [sel, setSel]   = useStateA('');
  const [pin, setPin]   = useStateA('');
  const [pin2, setPin2] = useStateA('');
  const [msg, setMsg]   = useStateA(null);
  const [busy, setBusy] = useStateA(false);
  const [error, setError] = useStateA('');

  useEffectA(() => {
    listarUsuariosAdmin().then(list => setUsuarios(list.filter(u => u.activo)))
      .catch(e => setError(e.message));
  }, []);

  async function ejecutar() {
    setMsg(null);
    if (!sel) { setMsg({ t: 'error', m: 'Selecciona un usuario' }); return; }
    if (!/^\d{4}$/.test(pin)) { setMsg({ t: 'error', m: 'PIN debe ser 4 dígitos' }); return; }
    if (pin !== pin2) { setMsg({ t: 'error', m: 'Los dos PIN no coinciden' }); return; }
    const u = usuarios.find(x => x.fila === parseInt(sel, 10));
    const ok = await appConfirm(`¿Resetear el PIN de ${u?.nombre}?`, {
      titulo: 'Resetear PIN', btnOk: 'Resetear', peligro: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await resetPin(parseInt(sel, 10), pin);
      registrarLog(SESSION_V6.leer()?.usuario || '', `PIN reseteado para: ${u?.nombre}`);
      setMsg({ t: 'ok', m: 'PIN actualizado correctamente' });
      setPin('');
      setPin2('');
    } catch (e) { setMsg({ t: 'error', m: e.message }); }
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="card-titulo" style={{ marginBottom: 12 }}>Resetear PIN</div>
      <label htmlFor="admin-reset-pin-usuario" style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>Usuario</label>
      <select id="admin-reset-pin-usuario" value={sel} onChange={e => setSel(e.target.value)} style={{
        width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--borde)',
        background: 'var(--superficie)', fontFamily: 'inherit', fontSize: 14, marginBottom: 12,
      }}>
        <option value="">Selecciona...</option>
        {usuarios.map(u => <option key={u.fila} value={u.fila}>{u.nombre}</option>)}
      </select>
      <label htmlFor="admin-reset-pin-nuevo" style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>Nuevo PIN (4 dígitos)</label>
      <input id="admin-reset-pin-nuevo" type="password" value={pin} maxLength={4} inputMode="numeric"
        onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--borde)',
          background: 'var(--superficie)', fontFamily: 'var(--font-mono)', fontSize: 16, marginBottom: 12,
        }} />
      <label htmlFor="admin-reset-pin-confirmar" style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>Confirmar PIN</label>
      <input id="admin-reset-pin-confirmar" type="password" value={pin2} maxLength={4} inputMode="numeric"
        onChange={e => setPin2(e.target.value.replace(/\D/g, ''))}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--borde)',
          background: 'var(--superficie)', fontFamily: 'var(--font-mono)', fontSize: 16, marginBottom: 12,
        }} />
      <button onClick={ejecutar} disabled={busy} className="btn-principal secundario" style={{ marginTop: 4 }}>
        {busy ? 'Procesando...' : 'Actualizar PIN'}
      </button>
      {error && <div style={{ color: 'var(--rojo)', fontSize: 13, marginTop: 8 }}>Error al cargar usuarios: {error}</div>}
      {msg && (
        <div style={{
          marginTop: 12, padding: 10, borderRadius: 8, fontSize: 13,
          background: msg.t === 'ok' ? 'rgba(107,122,58,0.12)' : 'rgba(168,52,43,0.12)',
          color: msg.t === 'ok' ? 'var(--verde)' : 'var(--rojo)',
        }}>{msg.m}</div>
      )}
    </div>
  );
}

// ── Pestaña Agenda: reglas de la agenda diaria (hoja CONFIG_AGENDA) ───
// Máx. visitas por jornada, reparto de comunas mañana/tarde e inspectores
// habilitados. La validación real vive en el backend (guardarConfigAgenda);
// la UI solo presenta y muestra el error que aquel devuelva.
function TabConfigAgenda() {
  const COMUNAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  const [maxVisitas, setMaxVisitas]     = useStateA(4);
  const [jornadas, setJornadas]         = useStateA({});   // {comuna: 'manana'|'tarde'}
  const [seleccion, setSeleccion]       = useStateA({});   // {nombreUsuario: bool}
  const [inspectores, setInspectores]   = useStateA([]);
  const [cargando, setCargando]         = useStateA(true);
  const [error, setError]               = useStateA('');
  const [busy, setBusy]                 = useStateA(false);
  const [msg, setMsg]                   = useStateA(null);

  // La config guarda palabras clave ("MAURICIO" casa con "Mauricio Pérez");
  // el checkbox marca al usuario cuyo nombre case con alguna palabra clave.
  function _casa(nombre, palabra) {
    const n = String(nombre || '').trim().toUpperCase();
    const k = String(palabra || '').trim().toUpperCase();
    if (!n || !k) return false;
    return n === k || n.indexOf(k + ' ') === 0 || n.indexOf(' ' + k + ' ') !== -1 ||
           n.lastIndexOf(' ' + k) === n.length - k.length - 1;
  }

  useEffectA(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true); setError(''); setMsg(null);
    try {
      const [cfg, lista] = await Promise.all([
        leerConfigAgenda(),
        listarInspectoresActivos({ forzar: true }),
      ]);
      setMaxVisitas(cfg.maxVisitasJornada);
      const j = {};
      COMUNAS.forEach(c => {
        if ((cfg.comunasManana || []).indexOf(c) !== -1) j[c] = 'manana';
        else if ((cfg.comunasTarde || []).indexOf(c) !== -1) j[c] = 'tarde';
      });
      setJornadas(j);
      const activos = lista || [];
      setInspectores(activos);
      const sel = {};
      activos.forEach(i => {
        sel[i.nombre] = (cfg.inspectoresAgenda || []).some(k => _casa(i.nombre, k));
      });
      setSeleccion(sel);
    } catch (e) { setError(e.message); }
    setCargando(false);
  }

  function cambiarJornada(comuna, valor) {
    setJornadas(j => Object.assign({}, j, { [comuna]: valor }));
  }

  function toggleInspector(nombre) {
    setSeleccion(s => Object.assign({}, s, { [nombre]: !s[nombre] }));
  }

  async function guardar() {
    setMsg(null);
    const manana = COMUNAS.filter(c => jornadas[c] === 'manana');
    const tarde  = COMUNAS.filter(c => jornadas[c] === 'tarde');
    const insp   = inspectores.filter(i => seleccion[i.nombre]).map(i => i.nombre);
    if (!manana.length || !tarde.length) {
      setMsg({ t: 'error', m: 'Cada jornada necesita al menos una comuna.' });
      return;
    }
    if (!insp.length) {
      setMsg({ t: 'error', m: 'Marca al menos un inspector habilitado.' });
      return;
    }
    const ok = await appConfirm(
      `Máx. ${maxVisitas} visitas/jornada\n` +
      `Mañana: comunas ${manana.join(', ')}\n` +
      `Tarde: comunas ${tarde.join(', ')}\n` +
      `Inspectores: ${insp.join(', ')}\n\n¿Guardar?`,
      { titulo: 'Guardar reglas de agenda', btnOk: 'Guardar' });
    if (!ok) return;
    setBusy(true);
    try {
      await guardarConfigAgenda({
        maxVisitasJornada: maxVisitas,
        comunasManana: manana,
        comunasTarde: tarde,
        inspectoresAgenda: insp,
      });
      await cargar();
      setMsg({ t: 'ok', m: 'Reglas de agenda actualizadas.' });
    } catch (e) { setMsg({ t: 'error', m: e.message }); }
    setBusy(false);
  }

  const estiloSelect = {
    padding: '6px 8px', borderRadius: 6, border: '1px solid var(--borde)',
    background: 'var(--superficie)', fontFamily: 'inherit', fontSize: 12,
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="card-titulo" style={{ margin: 0 }}>Reglas de la agenda</div>
        <button onClick={cargar} disabled={cargando} style={{
          background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
          padding: '6px 12px', fontFamily: 'inherit', fontSize: 12,
          cursor: cargando ? 'not-allowed' : 'pointer', opacity: cargando ? 0.5 : 1,
        }}>{cargando ? '...' : 'Recargar'}</button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 12 }}>
        Estos valores definen cómo se arma la agenda diaria (hoja CONFIG_AGENDA).
        La zona rural mantiene su jornada fija: primer viernes del mes.
      </div>
      {cargando && <div style={{ padding: 20, textAlign: 'center', color: 'var(--texto-suave)' }}>Cargando...</div>}
      {error && <div style={{ color: 'var(--rojo)', fontSize: 13 }}>Error al cargar configuración: {error}</div>}
      {!cargando && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <label htmlFor="admin-agenda-max" style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>
              Máximo de visitas por jornada (1–10)
            </label>
            <input id="admin-agenda-max" type="number" min={1} max={10} value={maxVisitas}
              onChange={e => {
                const n = parseInt(e.target.value, 10);
                setMaxVisitas(isNaN(n) ? 1 : Math.min(10, Math.max(1, n)));
              }}
              style={{
                width: 90, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--borde)',
                background: 'var(--superficie)', fontFamily: 'var(--font-mono)', fontSize: 15,
              }} />
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 6 }}>Comunas por jornada</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
              {COMUNAS.map(c => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, width: 22 }}>C{c}</span>
                  <select value={jornadas[c] || ''} onChange={e => cambiarJornada(c, e.target.value)} style={estiloSelect}>
                    <option value="manana">Mañana</option>
                    <option value="tarde">Tarde</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 6 }}>
              Inspectores habilitados para recibir visitas de la agenda
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {inspectores.map(i => (
                <label key={i.nombre} style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                  padding: '6px 8px', background: 'var(--gris-bg)', borderRadius: 8, cursor: 'pointer',
                }}>
                  <input type="checkbox" checked={!!seleccion[i.nombre]}
                    onChange={() => toggleInspector(i.nombre)} style={{ accentColor: 'var(--brand-accent)' }} />
                  <span>{i.nombre}</span>
                  {i.cargo && <span style={{ fontSize: 11, color: 'var(--texto-suave)' }}>· {i.cargo}</span>}
                </label>
              ))}
            </div>
          </div>

          <button onClick={guardar} disabled={busy} className="btn-principal secundario">
            {busy ? 'Guardando...' : 'Guardar reglas'}
          </button>
          {msg && (
            <div style={{
              padding: 10, borderRadius: 8, fontSize: 13,
              background: msg.t === 'ok' ? 'rgba(107,122,58,0.12)' : 'rgba(168,52,43,0.12)',
              color: msg.t === 'ok' ? 'var(--verde)' : 'var(--rojo)',
            }}>{msg.m}</div>
          )}
        </div>
      )}
    </div>
  );
}

function TabLog() {
  const [filas, setFilas] = useStateA([]);
  const [cargando, setCargando] = useStateA(true);
  const [error, setError] = useStateA('');

  // Antes el log se leía una sola vez al montar: un fallo de red dejaba el
  // panel muerto y no había forma de reintentar ni de refrescar.
  function cargar() {
    setCargando(true); setError('');
    leerLogAuditoria().then(v => {
      setFilas((v || []).slice(1).reverse().slice(0, 50));
      setCargando(false);
    }).catch(e => { setError(e.message); setCargando(false); });
  }
  useEffectA(cargar, []);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="card-titulo" style={{ margin: 0 }}>Auditoría · últimos 50</div>
        <button onClick={cargar} disabled={cargando} style={{
          background: 'var(--gris-bg)', border: '1px solid var(--borde)', borderRadius: 8,
          padding: '6px 12px', fontFamily: 'inherit', fontSize: 12,
          cursor: cargando ? 'not-allowed' : 'pointer', opacity: cargando ? 0.5 : 1,
        }}>{cargando ? '...' : 'Recargar'}</button>
      </div>
      {cargando && <div style={{ color: 'var(--texto-suave)' }}>Cargando...</div>}
      {error && <div style={{ color: 'var(--rojo)', fontSize: 13 }}>Error al cargar auditoría: {error}</div>}
      {!cargando && !error && filas.length === 0 && <div style={{ color: 'var(--texto-suave)' }}>Sin registros.</div>}
      {!cargando && !error && filas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filas.map((f, i) => (
            <div key={i} style={{
              padding: '8px 10px', background: 'var(--gris-bg)', borderRadius: 8,
              fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 12,
            }}>
              <div>
                <div style={{ fontWeight: 600 }}>{f[0] || '—'}</div>
                <div style={{ color: 'var(--texto-suave)' }}>{f[1] || ''}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--texto-suave)', whiteSpace: 'nowrap' }}>
                {f[2] || ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

window.AdminScreen = AdminScreen;
