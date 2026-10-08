// ═══════════════════════════════════════════════════════════════
// v6/visita-detail-modal.jsx — Modal «Ver datos»: solo el cascarón.
//
// El contenido es la ficha única (FichaVisita, ficha-visita.jsx): la misma
// del panel de Mis visitas. Aquí quedan el velo, la hoja, Esc / clic fuera
// para cerrar, y ReiteradosVD (que la ficha monta en su sección 1).
//
// API global:
//   window.abrirVisitaDetail(filaBD)
//
// Recibe el objeto crudo de BD VISITAS (mismo shape que devuelve
// listarVisitas): las claves son los nombres de columna del Sheet.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateVD, useEffect: useEffectVD, useRef: useRefVD } = React;

let _pushVisitaDetail = null;

// «Continuar» desde el modal: se cierra primero y luego se abre el formulario,
// para que el velo no quede tapando la pantalla nueva.
function VisitaDetailModalHost({ onContinuar }) {
  const [fila, setFila] = useStateVD(null);

  useEffectVD(() => {
    _pushVisitaDetail = function(f) { setFila(f); };
    return function() { _pushVisitaDetail = null; };
  }, []);

  useEffectVD(() => {
    if (!fila) return;
    function onKey(e) { if (e.key === 'Escape') setFila(null); }
    window.addEventListener('keydown', onKey);
    return function() { window.removeEventListener('keydown', onKey); };
  }, [fila]);

  if (!fila) return null;
  return <VisitaDetailUI f={fila} onCerrar={() => setFila(null)}
    onContinuar={onContinuar ? (idx, f) => { setFila(null); onContinuar(idx, f); } : null} />;
}

// ── Helper de lectura tolerante a variantes de nombre de columna ──
function _g(f, ...keys) {
  for (const k of keys) {
    if (f && f[k] != null && f[k] !== '') return f[k];
  }
  return '';
}

function VisitaDetailUI({ f, onCerrar, onContinuar }) {
  const hojaRef = useRefVD(null);
  // La sesión da el rol (regla de quién ve qué y el panel de campos crudos).
  const usuario = (typeof SESSION_V6 !== 'undefined' && SESSION_V6.leer()) || {};
  const verPrioridad = veTodasLasVisitas(usuario.rol);
  const dir = f['DIRECCION INFRACCION'] || f['DIRECCION'] || 'visita';

  // Foco en la hoja al abrir: Esc y el teclado funcionan sin tocar nada.
  useEffectVD(() => { if (hojaRef.current) hojaRef.current.focus(); }, []);

  return (
    <div className="fv-velo" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="fv-hoja" ref={hojaRef} tabIndex={-1} role="dialog" aria-modal="true"
        aria-label={'Datos de la visita ' + dir}>
        <FichaVisita f={f} usuario={usuario} verPrioridad={verPrioridad}
          onContinuar={onContinuar} onCerrar={onCerrar} />
      </div>
    </div>
  );
}

// ── Radicados reiterados del caso (2026-10-02) ─────────────────
// Otras PQR sobre el mismo caso, anotadas en la col RADICADOS REITERADOS de
// todas sus visitas. Cada una con su PDF, que se busca por nombre en Drive al
// abrir (no hay columna de enlaces). Solo el admin agrega o quita; el backend
// rechaza el que se radicó más de 3 meses después del principal: ese es un
// caso nuevo, con su propia fila. La sección no aparece si no hay reiterados
// y quien mira no es admin.
function ReiteradosVD({ f }) {
  const principal = String(_g(f, 'RADICADO') || '').trim();
  const [lista, setLista] = useStateVD(() => radicadosReiterados(f).filter(r => r !== claveRadicado(principal)));
  const [links, setLinks] = useStateVD({});
  const [buscandoPdf, setBuscandoPdf] = useStateVD(false);
  const [rad, setRad] = useStateVD('');
  const [fecha, setFecha] = useStateVD('');      // yyyy-mm-dd (input date)
  const [ocupado, setOcupado] = useStateVD(false);
  const [msg, setMsg] = useStateVD(null);        // { error: bool, texto }

  const claveLista = lista.join(',');
  useEffectVD(() => {
    if (!lista.length) return;
    let vivo = true;
    setBuscandoPdf(true);
    linksPdfReiterados(lista)
      .then(r => { if (vivo && r && r.links) setLinks(r.links); })
      .catch(() => {})
      .finally(() => { if (vivo) setBuscandoPdf(false); });
    return () => { vivo = false; };
  }, [claveLista]);

  let esAdmin = false;
  try {
    const s = (typeof SESSION_V6 !== 'undefined') ? SESSION_V6.leer() : null;
    esAdmin = !!s && s.rol === 'ADMIN';
  } catch (e) {}
  if (!lista.length && !esAdmin) return null;

  const radLimpio = claveRadicado(rad);
  const puedeAgregar = !ocupado && formaRadicadoValida(radLimpio) && !!fecha;
  // Las listas de detrás (Buscar, Inicio) tienen la fila vieja: se refrescan
  // por detrás y se re-pintan solas con `cu-visitas-actualizadas`.
  const refrescarListas = () => { leerVisitas({ forzar: true }).catch(() => {}); };

  async function agregar() {
    if (!puedeAgregar) return;
    setOcupado(true); setMsg(null);
    try {
      const r = await agregarReiterado(principal, radLimpio, _isoADDMMAAAA(fecha));
      setLista(r.reiterados || lista.concat([radLimpio]));
      setRad(''); setFecha('');
      const partes = [r.yaEstaba ? 'Ya estaba anotado.' : 'Reiterado agregado.'];
      if (r.filaPropiaOcultada) partes.push('Su fila propia salió de la lista de visitas.');
      if (r.aviso) partes.push(r.aviso);
      setMsg({ error: false, texto: partes.join(' ') });
      refrescarListas();
    } catch (e) {
      setMsg({ error: true, texto: e.message || 'No se pudo agregar.' });
    }
    setOcupado(false);
  }

  async function quitar(r) {
    const ok = await appConfirm('¿Quitar ' + r + ' de los reiterados de este caso?',
      { titulo: 'Quitar reiterado', btnOk: 'Quitar', peligro: true });
    if (!ok) return;
    setOcupado(true); setMsg(null);
    try {
      const res = await quitarReiterado(principal, r);
      setLista(res.reiterados || lista.filter(x => x !== r));
      setMsg({ error: false, texto: res.filaPropiaDevuelta
        ? 'Reiterado quitado. Su fila volvió a la lista de visitas.' : 'Reiterado quitado.' });
      refrescarListas();
    } catch (e) {
      setMsg({ error: true, texto: e.message || 'No se pudo quitar.' });
    }
    setOcupado(false);
  }

  const estiloChipPdf = {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 8,
    background: 'var(--brand-bg)', color: 'var(--brand-ink)', border: '1px solid var(--brand-accent)',
    fontSize: 10, fontWeight: 700, textDecoration: 'none', lineHeight: 1.6, whiteSpace: 'nowrap',
  };

  return (
    <_SeccionVD titulo={'Radicados reiterados' + (lista.length ? ' (' + lista.length + ')' : '')}>
      <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!lista.length && (
          <div style={{ color: 'var(--texto-suave, #5C5142)' }}>Este caso no tiene radicados reiterados.</div>
        )}
        {lista.map(r => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 32 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r}</span>
            {links[r]
              ? <a href={links[r]} target="_blank" rel="noopener noreferrer" style={estiloChipPdf}
                  title="Abrir el PDF de la PQR reiterada (pestaña nueva)"><Icon.File size={11} /> PQR</a>
              : <span style={{ fontSize: 11, color: 'var(--texto-suave, #5C5142)' }}>
                  {buscandoPdf ? 'Buscando PDF…' : 'PDF aún sin descargar'}
                </span>}
            {esAdmin && (
              <button type="button" onClick={() => quitar(r)} disabled={ocupado}
                aria-label={'Quitar el reiterado ' + r} title="Quitar de los reiterados"
                style={{ marginLeft: 'auto', minWidth: 44, minHeight: 44, background: 'transparent',
                  border: 'none', color: 'var(--texto-suave, #5C5142)', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon.Close size={14} />
              </button>
            )}
          </div>
        ))}

        {esAdmin && (
          <div style={{ borderTop: lista.length ? '1px solid var(--borde, rgba(31,27,22,0.08))' : 'none',
            paddingTop: lista.length ? 10 : 0, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <label htmlFor="vd-rei-rad" style={{ display: 'block', fontSize: 11, marginBottom: 3, color: 'var(--texto-suave, #5C5142)' }}>
                Radicado reiterado
              </label>
              <input id="vd-rei-rad" type="text" className="input-campo" inputMode="numeric" autoComplete="off"
                placeholder="20261012345" value={rad} disabled={ocupado}
                onChange={e => setRad(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agregar()}
                style={{ width: '100%', minHeight: 44, fontSize: 16, padding: 10 }} />
            </div>
            <div style={{ flex: '0 1 170px' }}>
              <label htmlFor="vd-rei-fecha" style={{ display: 'block', fontSize: 11, marginBottom: 3, color: 'var(--texto-suave, #5C5142)' }}>
                Fecha de ese radicado
              </label>
              <input id="vd-rei-fecha" type="date" className="input-campo" value={fecha} disabled={ocupado}
                onChange={e => setFecha(e.target.value)}
                style={{ width: '100%', minHeight: 44, fontSize: 16, padding: 10 }} />
            </div>
            <button type="button" className="btn-principal" onClick={agregar} disabled={!puedeAgregar}
              style={{ margin: 0, width: 'auto', minHeight: 44, padding: '0 16px', fontSize: 14 }}>
              {ocupado ? '…' : 'Agregar'}
            </button>
            <div style={{ flexBasis: '100%', fontSize: 11, color: 'var(--texto-suave, #5C5142)', lineHeight: 1.4 }}>
              Solo si se radicó hasta 3 meses después del caso principal; pasado ese plazo es un
              radicado nuevo y se ingresa con su propia fila.
            </div>
          </div>
        )}

        {msg && (
          <div role={msg.error ? 'alert' : 'status'} style={{ fontSize: 12, lineHeight: 1.4,
            color: msg.error ? 'var(--rojo, #B42318)' : 'var(--verde-dark, #1B6B3A)' }}>
            {msg.texto}
          </div>
        )}
      </div>
    </_SeccionVD>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────
function _SeccionVD({ titulo, children }) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- falso positivo: función `_SeccionVD`, convención guion bajo del archivo
  const [open, setOpen] = useStateVD(true);
  return (
    <div style={{ marginBottom: 14, border: '1px solid var(--borde, rgba(31,27,22,0.08))', borderRadius: 10, overflow: 'hidden' }}>
      <button type="button" className="btn-cabecera" onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          padding: '10px 14px', background: 'var(--gris-bg, #F5F1EB)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 13, fontWeight: 600, color: 'var(--texto, #1F1B16)',
          userSelect: 'none',
        }}>
        <span>{titulo}</span>
        <span style={{ color: 'var(--texto-suave, #5C5142)', display: 'inline-flex' }}>
          {open ? <Icon.ChevronUp size={12} /> : <Icon.Chevron size={12} />}
        </span>
      </button>
      {open && (
        <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Coordenadas + enlace a Google Maps. El detalle es la única vía del
// co-asignado (que no tiene botón de Continuar) para llegar al sitio, y
// ahí las coordenadas sueltas no sirven de nada en un teléfono.
// API global ─────────────────────────────────────────────────────
window.abrirVisitaDetail = function(filaBD) {
  if (_pushVisitaDetail) {
    _pushVisitaDetail(filaBD);
  } else {
    // Fallback: si el host no está montado, abrir Drive de la visita
    const link = filaBD && (filaBD['LINK_DRIVE'] || filaBD['LINK_PDF_ACTA']);
    if (link) window.open(link, '_blank', 'noopener');
  }
};

window.VisitaDetailModalHost = VisitaDetailModalHost;
