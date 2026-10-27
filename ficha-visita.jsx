// ═══════════════════════════════════════════════════════════════
// ficha-visita.jsx — FichaVisita: la ficha única de la visita (v2, 2026-10-25)
//
// Según la maqueta propuesta-ficha.html. Cabecera en cuatro renglones, cada
// uno con una sola cosa (estado · dirección · lugar · datos del caso) y, en
// panel, los botones a la derecha (solo texto). Bajo ella, la banda del caso
// (denunciante · prioridad · reiterados). El cuerpo depende del estado:
// asignada → «El predio» y el mapa; iniciada → entregables (lo pendiente
// primero) y los tres bloques de bloquesFicha (utils.js — esa decide QUÉ se
// muestra; aquí solo se pinta); completada/cerrada → documentos que existen y
// los bloques sin «Sin dato». Con contenedor ≥860 px, el mapa y el predio van
// a su columna derecha, fijos mientras se recorren los datos.
// Solo lectura: no edita nada.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateFV, useEffect: useEffectFV, useRef: useRefFV } = React;

// El scroller de la ficha depende de quién la aloja: el panel de Mis visitas
// (.mv-panel) o la hoja del modal (.fv-hoja).
function _scrollerFV(el) {
  return el && el.closest ? el.closest('.mv-panel, .fv-hoja') : null;
}

// El predio: código, ficha y coordenadas; solo los que tengan dato (en la
// asignada es el bloque izquierdo; con visita hecha, la columna del lugar).
function _predioFV(f) {
  const lat = normalizarCoord(f['LATITUD'], 'lat');
  const lon = normalizarCoord(f['LONGITUD'], 'lon');
  return [
    ['Código catastral', String(f['CODIGO CATASTRAL'] || f['CATASTRAL'] || '').trim()],
    ['Ficha predial', String(f['N° FICHA PREDIAL'] || f['N FICHA PREDIAL'] || '').trim()],
    ['Coordenadas', (lat != null && lon != null) ? lat.toFixed(6) + ', ' + lon.toFixed(6) : ''],
  ].filter(p => p[1]);
}

// Entregables de la ficha v2: lo pendiente primero (entregablesFaltantes —
// la regla de «acta o informe, con uno de los dos basta») y después lo que ya
// existe, la carpeta de la visita al frente. Terminada: solo lo que existe.
function _entregablesFV(f, terminada) {
  const carpeta = f['LINK_DRIVE'] ? [{ n: 'Carpeta de la visita', link: f['LINK_DRIVE'] }] : [];
  const existentes = _entregablesMV(f).filter(e => e.link);
  if (terminada) return carpeta.concat(existentes);
  const orden = ordenPoliciaDe(f);
  const NOMBRE = {
    'Acta': 'Acta de Inspección Ocular',
    'Registro fotográfico': 'Registro fotográfico',
    'Informe': 'Informe de inspección',
  };
  const faltan = entregablesFaltantes(f).map(x => ({
    n: x === 'Orden escaneada' ? 'Orden de policía ' + orden : NOMBRE[x],
    link: '',
  }));
  return faltan.concat(carpeta, existentes);
}

function FichaVisita({ f, usuario, verPrioridad, onContinuar, onCerrar, gestion, visitas, onElegirVisita }) {
  const raizRef = useRefFV(null);
  const fijaRef = useRefFV(null);
  // ¿La ficha es ancha? (≥860 px de contenedor, la misma frontera del CSS):
  // el mapa y el predio pasan a su columna derecha.
  const [dosCols, setDosCols] = useStateFV(false);
  // «Pedir cita» desde la ficha (decisión 4 de la revisión de arquitectura):
  // la misma hoja del «+», con el caso ya puesto.
  const [pidiendoCita, setPidiendoCita] = useStateFV(false);

  // Estado como lo agrupa Buscar (estadoBuscarDe, utils.js): las variantes de
  // V2 se pliegan a las de la app y lo cerrado por otra vía o NO COMPETENCIA
  // es CERRADO — se consulta, no se inicia ni se continúa.
  const est = estadoBuscarDe(f);
  const cerrada = est === 'CERRADO';
  const completa = est === 'COMPLETADO';
  const terminada = completa || cerrada;
  const empezada = est === 'INICIADO' || terminada;
  const esAdmin = usuario && usuario.rol === 'ADMIN';
  const tono = cerrada ? { cls: '', label: motivoCierreBuscar(f) } : (_ESTADO_PANEL_MV[est] || { cls: '', label: est || '—' });
  const dir = f['DIRECCION INFRACCION'] || f['DIRECCION'] || 'Sin dirección';
  const barrio = f['BARRIO/VEREDA'] || f['BARRIO'] || '';
  // visitadoresBD devuelve el texto de la columna («A / B»), no una lista.
  const quienes = String(visitadoresBD(f) || '').split(/\s*[\/,]\s*/).map(s => s.trim()).filter(Boolean);

  // Otra visita: la ficha vuelve arriba.
  useEffectFV(() => {
    const raiz = raizRef.current;
    if (!raiz) return;
    const scroller = _scrollerFV(raiz);
    if (scroller) scroller.scrollTop = 0;
  }, [f._idx]);

  // Columnas según el ancho real de la ficha (la misma frontera de 860 px
  // del @container del CSS: cruzarla mueve el mapa de columna).
  useEffectFV(() => {
    const raiz = raizRef.current;
    if (!raiz) return;
    const aplicar = () => setDosCols(raiz.offsetWidth >= 860);
    aplicar();
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', aplicar);
      return () => window.removeEventListener('resize', aplicar);
    }
    const ro = new ResizeObserver(aplicar);
    ro.observe(raiz);
    return () => ro.disconnect();
  }, []);

  // El alto real de la cabecera va a --fv-fija-h: la columna del lugar se
  // pega justo debajo (los cuatro renglones pueden crecer). Se re-mide al
  // cambiar el ancho del contenedor.
  useEffectFV(() => {
    const raiz = raizRef.current, fija = fijaRef.current;
    if (!raiz || !fija) return;
    const aplicar = () => raiz.style.setProperty('--fv-fija-h', fija.offsetHeight + 'px');
    aplicar();
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', aplicar);
      return () => window.removeEventListener('resize', aplicar);
    }
    const ro = new ResizeObserver(aplicar);
    ro.observe(fija);
    return () => ro.disconnect();
  }, []);

  // Sombra al bajar: sin ella, la cabecera flota sobre el texto sin cortarlo.
  useEffectFV(() => {
    const raiz = raizRef.current;
    if (!raiz) return;
    const scroller = _scrollerFV(raiz);
    if (!scroller) return;
    const alScroll = () => raiz.classList.toggle('fv-bajo', scroller.scrollTop > 4);
    alScroll();
    scroller.addEventListener('scroll', alScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', alScroll);
  }, []);

  // Renglón 1, «desde cuándo»: pendiente/asignada → días sin iniciar;
  // iniciada → días sin completar (ambos en hábiles, utils.js); ocre, rojo
  // desde el umbral de demora de las alertas. Completada → nada (nunca la
  // fecha de completada). Cerrada sin visita → la fecha de radicado.
  let estadoTxt = '', estadoCls = '';
  if (cerrada) {
    const fr = formatearFecha(f['FECHA RADICADO'] || '');
    estadoTxt = fr ? 'radicado el ' + fr : '';
  } else if (!completa) {
    const dias = est === 'INICIADO' ? diasSinCompletar(f) : diasSinIniciar(f);
    if (dias != null) {
      estadoTxt = dias > 0 ? 'hace ' + _plural(dias, 'día', 'días') : 'hoy';
      estadoCls = _demoradaMV(dias) ? ' demora' : ' espera';
    }
  }

  const linkPqr = linkPdfRadicado(f);
  const bloques = bloquesFicha(f, usuario && usuario.rol);
  const predio = _predioFV(f);
  const entItems = empezada ? _entregablesFV(f, terminada) : [];

  // Renglón 4, los datos del caso: cada uno solo si tiene algo que decir.
  const exp = expedienteDe(f);
  const rad = f['RADICADO'] || '';
  const nVisita = String(f['N° VISITA'] || f['N VISITA'] || '').trim();
  const fRadicado = formatearFecha(f['FECHA RADICADO'] || '');
  // Asignada solo mientras está asignada (en pendiente tampoco).
  const fAsignada = est === 'ASIGNADO' ? formatearFecha(f['FECHA ASIGNACION VISITA'] || '') : '';
  const fVisita = formatearFecha(f['FECHA DE VISITA'] || '');

  // «Todos los campos de la BD» salió de la ficha (revisión de arquitectura
  // 2026-10-27, punto 4): era una herramienta de diagnóstico; se revisa en el Sheet.

  // Pedir cita: visita viva, sin cita por delante, y no para el supervisor
  // (no pide citas, como en Audiencias).
  const ordenCita = ordenPoliciaDe(f);
  const puedePedirCita = !terminada && usuario &&
    (usuario.rol === 'ADMIN' || !veTodasLasVisitas(usuario.rol)) &&
    !citaVisitaTexto(f) && !!(rad || normOrdenAudiencias(ordenCita));

  return (
    <div className="fv" ref={raizRef}>
      {pidiendoCita && (
        <PedirCitaGlobal usuario={usuario}
          casoInicial={{ radicado: rad, ordenPolicia: normOrdenAudiencias(ordenCita) ? ordenCita : '' }}
          onCerrar={() => setPidiendoCita(false)} />
      )}
      {/* ── Cabecera: 1 estado · 2 dirección · 3 lugar · 4 datos del caso ── */}
      <div className={'fv-fija' + (onCerrar ? ' con-cerrar' : '')} ref={fijaRef}>
        {onCerrar && (
          <button type="button" className="vc-btn fv-cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        )}
        {visitas && visitas.length > 1 && onElegirVisita && (
          <_VisitasCasoFV visitas={visitas} actual={f} onElegir={onElegirVisita} />
        )}
        <div className="fv-fija-fila">
          <div className="fv-fija-id">
            <div className="fv-estado">
              <span className={'al-estado' + tono.cls}>{tono.label}</span>
              {estadoTxt && <span className={'fv-estado-txt' + estadoCls}>{estadoTxt}</span>}
            </div>
            {/* Una dirección que es una coordenada se dice «Punto GPS», como en Buscar. */}
            <div className="fv-dir" title={dir}>{puntoDesdeTextoCoord(dir) ? 'Punto GPS' : dir}</div>
            <div className="fv-lugar-l">
              {[barrio, f['COMUNA'] ? 'Comuna ' + f['COMUNA'] : ''].filter(Boolean).join(' · ')}
            </div>
            <div className="fv-hechos">
              {/* Con expediente se muestran los dos («Exp. 2201 · Rad. 20261041205»). */}
              <div>
                <div className="l">Radicado</div>
                <div className="v">
                  {exp ? <><span className="exp-tag">Exp. {exp}</span> · Rad. {rad || '—'}</>
                    : (rad || '—')}
                </div>
              </div>
              {nVisita && <div><div className="l">Visita</div><div className="v">{nVisita}</div></div>}
              {fRadicado && <div><div className="l">Radicada</div><div className="v">{fRadicado}</div></div>}
              {fAsignada && <div><div className="l">Asignada</div><div className="v">{fAsignada}</div></div>}
              {fVisita && <div><div className="l">Fecha de visita</div><div className="v">{fVisita}</div></div>}
              {quienes.length > 0 && (
                <div>
                  <div className="l">Inspector</div>
                  <div className="v">{titleCaseNombre(quienes[0])}{quienes.length > 1 ? ' +' + (quienes.length - 1) : ''}</div>
                </div>
              )}
            </div>
          </div>
          {/* Botones solo con texto (decisión del usuario, ficha v2). */}
          <div className="fv-fija-acc">
            {!terminada && onContinuar && (puedeDiligenciar(f)
              ? <button type="button" className="vc-btn vc-btn-cta" onClick={() => onContinuar(f._idx, f)}>
                  {est === 'INICIADO' ? 'Continuar visita' : 'Iniciar visita'}
                </button>
              // Regla del diligenciador: al co-asignado se le dice quién la lleva.
              : <span className="vc-dilig">La lleva {quienes[0]}</span>)}
            {/* La PQR se abre en pestaña nueva, como en las tarjetas. */}
            {linkPqr && (
              <a className="vc-btn" href={linkPqr} target="_blank" rel="noopener noreferrer"
                title="Abrir el PDF de la PQR radicada (pestaña nueva)">Ver PQR</a>
            )}
            <BotonMapaVisita f={f} variante="vc" sinIcono />
            {puedePedirCita && (
              <button type="button" className="vc-btn" onClick={() => setPidiendoCita(true)}>Pedir cita</button>
            )}
          </div>
        </div>
      </div>

      {/* Banda del caso: denunciante · prioridad · reiterados, celda solo si
          hay dato; sin celdas, no hay banda. */}
      <BandaCasoFV f={f} verPrioridad={verPrioridad} />

      <div className="fv-cuerpo">
        <div className="fv-datos">
          {empezada ? (<>
            {/* Iniciada: lo pendiente primero. Completada: «Documentos»,
                solo lo que existe (decisión del usuario 2026-10-14). */}
            {entItems.length > 0 && (
              <section className="fv-ent-caja">
                <h3 className="fv-bt">{terminada ? 'Documentos' : 'Entregables'}</h3>
                {entItems.map(e => (
                  <div className="mv-ent" key={e.n}>
                    <span className={'ent-dot' + (e.link ? ' ed-ok' : ' ed-pend')} aria-hidden="true" />
                    <span className="mv-ent-n">{e.n}</span>
                    {e.link
                      ? <a className="vc-btn" href={e.link} target="_blank" rel="noopener noreferrer">Abrir</a>
                      : <span className="mv-ent-e falta">Falta</span>}
                  </div>
                ))}
              </section>
            )}
            {bloques.map(b => <_BloqueFV key={b.clave} b={b} />)}
          </>) : (<>
            {/* Asignada sin visita: el predio y nada más — ni secciones ni
                «Se llenan en la visita». */}
            {predio.length > 0 && (
              <section className="fv-bloque">
                <h3 className="fv-bt">El predio</h3>
                <_DatosMV pares={predio} />
              </section>
            )}
          </>)}

          {/* Gestión de reiterados (agregar/quitar): solo el admin; los
              demás los ven en la banda. */}
          {esAdmin && <ReiteradosVD key={String(f._idx) + '|' + f['RADICADO']} f={f} />}

          {/* Ficha angosta: el mapa cierra la lista, como siempre. */}
          {!dosCols && <MapaPanelMV f={f} />}
        </div>

        {/* Ficha ancha: mapa y predio en su columna, fijos bajo la cabecera
            mientras se recorren los datos. En la asignada el predio va a la
            izquierda y aquí viaja solo el mapa (como la maqueta). */}
        {dosCols && (
          <div className="fv-lugar">
            <MapaPanelMV f={f} />
            {empezada && predio.length > 0 && <_DatosMV pares={predio} />}
          </div>
        )}
      </div>

      {/* Gestión (E5 la inyecta): barra fija al pie, fuera de la información
          (decisión del usuario 2026-10-12). */}
      {gestion && <div className="fv-gestion-pie">{gestion}</div>}
    </div>
  );
}

// Banda del caso bajo la cabecera: Denunciante · Prioridad (solo admin y
// supervisor, con rojo desde 8) · Reiterados. El «Ver» de un reiterado solo
// si su PDF existe: un solo pedido por visita, el mismo que hace ReiteradosVD.
// Sin PDF no hay aviso — solo el número (decisión del usuario, ficha v2).
function BandaCasoFV({ f, verPrioridad }) {
  const principal = claveRadicado(String(f['RADICADO'] || '').trim());
  const reits = radicadosReiterados(f).filter(r => r !== principal);
  const [links, setLinks] = useStateFV({});
  const claveLista = reits.join(',');
  useEffectFV(() => {
    if (!reits.length) return;
    let vivo = true;
    linksPdfReiterados(reits)
      .then(r => { if (vivo && r && r.links) setLinks(r.links); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [claveLista]);

  const denunciante = String(f['DENUNCIANTE/REMITENTE'] || f['DENUNCIANTE'] || '').trim();
  const prioTxt = String(f['PRIORIDAD'] || '').trim();
  const celdas = [];
  if (denunciante) {
    celdas.push(<div key="den"><div className="l">Denunciante</div><div className="v">{denunciante}</div></div>);
  }
  if (verPrioridad && prioTxt) {
    // «7 - Alto» como viene de la BD, con el guion del medio de la priorización.
    const alta = parseInt(prioTxt, 10) >= 8;
    celdas.push(<div key="pri"><div className="l">Prioridad</div>
      <div className={'v' + (alta ? ' alta' : '')}>{prioTxt.replace(/\s*-\s*/, ' · ')}</div></div>);
  }
  if (reits.length) {
    celdas.push(<div key="rei"><div className="l">Reiterados</div>
      <div className="v fv-reits">{reits.map(r => (
        <span key={r}>{r}{links[r] && (
          <a href={links[r]} target="_blank" rel="noopener noreferrer"
            title="Abrir el PDF de la PQR reiterada (pestaña nueva)">Ver</a>
        )}</span>
      ))}</div></div>);
  }
  if (!celdas.length) return null;
  return <div className="fv-banda">{celdas}</div>;
}

// Un bloque de bloquesFicha (utils.js): título sin número ni raya, campos con
// rótulo arriba, textos largos en recuadro y —solo si es iniciada— «Sin dato»
// al pie (bloquesFicha vacía la lista en las terminadas).
function _BloqueFV({ b }) {
  const piezas = [];
  let pares = [];
  const volcar = () => {
    if (pares.length) {
      piezas.push(<_DatosMV key={'dl' + piezas.length} pares={pares} />);
      pares = [];
    }
  };
  b.campos.forEach(c => {
    if (c.largo) {
      volcar();
      piezas.push(<p key={'tx' + piezas.length} className="fv-texto">{c.v}</p>);
    } else {
      pares.push([c.l, c.v, c.ancho]);
    }
  });
  volcar();

  return (
    <section className="fv-bloque">
      <h3 className="fv-bt">{b.titulo}</h3>
      {piezas}
      {b.sinDato.length > 0 && (
        // Tres y «N más»: la lista entera de una visita a medio diligenciar es
        // un párrafo que tapa los datos (la completa queda en el title).
        <p className="fv-vacios" title={b.sinDato.length > 3 ? b.sinDato.join(', ') : undefined}>
          <b>Sin dato:</b> {b.sinDato.slice(0, 3).join(', ')}{b.sinDato.length > 3 ? ' y ' + (b.sinDato.length - 3) + ' más' : ''}
        </p>
      )}
    </section>
  );
}

// «Visitas del caso»: un radicado con seguimiento tiene varias filas y la
// lista de Buscar muestra una sola (la viva). Este selector, primero en la
// cabecera porque decide de qué visita es todo lo que sigue, pasa de una a
// otra. Cada opción: número, estado en texto + barra de color (código de la
// Semana: el color solo no basta) y la fecha que importa.
const _EST_VC_FV = {
  PENDIENTE:  { cls: ' vcs-pend',  label: 'Pendiente' },
  ASIGNADO:   { cls: ' vcs-asig',  label: 'Asignada' },
  INICIADO:   { cls: ' vcs-curso', label: 'Iniciada' },
  COMPLETADO: { cls: ' vcs-hecha', label: 'Completada' },
};
function _VisitasCasoFV({ visitas, actual, onElegir }) {
  const ord = numerarVisitasRadicado(visitas);
  return (
    <div className="fv-vcaso" role="group" aria-label="Visitas del caso">
      <span className="fv-vcaso-tit">Visitas del caso</span>
      <div className="fv-vcaso-ops">
        {ord.map(({ f: v, n }) => {
          const est = normalizarEstado(v['ESTADO VISITA'] || '');
          const t = _EST_VC_FV[est] || { cls: '', label: est || '—' };
          const fecha = (est === 'INICIADO' || est === 'COMPLETADO')
            ? formatearFecha(v['FECHA DE VISITA'] || '') : '';
          const on = v._idx === actual._idx;
          return (
            <button key={v._idx} type="button" className={'fv-vcaso-op' + t.cls + (on ? ' on' : '')}
              aria-pressed={on} onClick={() => { if (!on) onElegir(v); }}>
              <b>{n != null ? 'Visita ' + n : 'Por hacer'}</b>
              <span>{t.label}{fecha && <i>{fecha}</i>}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Exponer componente en el scope global
window.FichaVisita = FichaVisita;
