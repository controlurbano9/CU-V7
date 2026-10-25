// ═══════════════════════════════════════════════════════════════
// ficha-visita.jsx — FichaVisita: la ficha única de la visita (E2b)
//
// Arriba, fija (sticky), solo lo básico: estado y desde cuándo, dirección,
// radicado + barrio + comuna + inspector, el recorrido del caso en una línea
// y máximo tres botones (el principal, «Ver PQR» y «Cómo llegar»). Debajo,
// un solo scroll en el orden del formulario: entregables · gestión (la
// inyecta quien llama, E5) · las secciones de seccionesFicha (utils.js — esa
// decide QUÉ se muestra; aquí solo se pinta) · reiterados · campos crudos
// (admin). Con contenedor ≥900 px, la sección «Ubicación del inmueble» y el
// mapa se van a su columna, fijos mientras se recorren los datos.
// Solo lectura: no edita nada.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateFV, useEffect: useEffectFV, useRef: useRefFV, useMemo: useMemoFV } = React;

// El scroller de la ficha depende de quién la aloja: el panel de Mis visitas
// (.mv-panel) o, más adelante, la hoja del modal (E2c). Misma búsqueda de la
// maqueta: closest('.mv-panel, .fv-hoja').
function _scrollerFV(el) {
  return el && el.closest ? el.closest('.mv-panel, .fv-hoja') : null;
}

function FichaVisita({ f, usuario, verPrioridad, onContinuar, onCerrar, gestion, visitas, onElegirVisita }) {
  const raizRef = useRefFV(null);
  const fijaRef = useRefFV(null);
  // ¿La ficha es ancha? (≥900 px de contenedor, la misma medida del CSS):
  // el lugar de la visita (sección 2 + mapa) pasa a su columna derecha.
  const [dosCols, setDosCols] = useStateFV(false);

  // Estado como lo agrupa Buscar (estadoBuscarDe, utils.js): las variantes de
  // V2 se pliegan a las de la app y lo cerrado por otra vía o NO COMPETENCIA
  // es CERRADO — se consulta, no se inicia ni se continúa.
  const est = estadoBuscarDe(f);
  const cerrada = est === 'CERRADO';
  const completa = est === 'COMPLETADO';
  const terminada = completa || cerrada;
  const empezada = est === 'INICIADO' || terminada;
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

  // Columnas según el ancho real de la ficha (la misma frontera de 900 px
  // del @container del CSS: cruzarla reordena el mapa de columna).
  useEffectFV(() => {
    const raiz = raizRef.current;
    if (!raiz) return;
    const aplicar = () => setDosCols(raiz.offsetWidth >= 900);
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
  // pega justo debajo (la dirección puede ocupar dos renglones y un valor
  // fijo la taparía). Se re-mide al cambiar el ancho del contenedor.
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

  // «Desde cuándo»: pendiente/asignada → días sin iniciar; iniciada → días
  // sin completar (ambos en hábiles, utils.js); ocre, rojo desde el umbral de
  // demora de las alertas. Completada → la fecha de la visita. Cerrada sin
  // visita → la fecha de radicado (contar días de espera no tiene sentido).
  let estadoTxt = '', estadoCls = '';
  if (completa) {
    estadoTxt = 'Completada el ' + (formatearFecha(f['FECHA DE VISITA'] || '') || '—');
  } else if (cerrada) {
    const fr = formatearFecha(f['FECHA RADICADO'] || '');
    estadoTxt = fr ? 'radicado el ' + fr : '';
  } else {
    const dias = est === 'INICIADO' ? diasSinCompletar(f) : diasSinIniciar(f);
    if (dias != null) {
      estadoTxt = dias > 0 ? 'hace ' + _plural(dias, 'día', 'días') : 'hoy';
      estadoCls = _demoradaMV(dias) ? ' demora' : ' espera';
    }
  }

  const linkPqr = linkPdfRadicado(f);
  const secciones = seccionesFicha(f, usuario && usuario.rol);
  const secUbic = secciones.find(s => s.clave === 'ubicacion');
  // Recorrido del caso en una línea: solo los pasos cumplidos con fecha —
  // el paso detenido ya lo cuenta la cabecera («hace N días»).
  const recorridoTxt = recorridoVisita(f)
    .filter(p => p.hecho && p.valor)
    .map(p => p.rotulo + ' ' + p.valor)
    .join(' · ');
  // Secciones «se llena en la visita»: una sola línea con sus títulos, en el
  // lugar de la primera.
  const luegoIdx = secciones.findIndex(s => s.resumen);
  const luegoTitulos = secciones.filter(s => s.resumen).map(s => s.titulo).join(' · ');

  // Campos crudos de la BD (solo admin, diagnóstico): pares no vacíos.
  const crudoPares = usuario && usuario.rol === 'ADMIN'
    ? Object.keys(f)
        .filter(k => isNaN(Number(k)) && k !== '_idx')
        .map(k => [k, f[k]])
        .filter(p => p[1] != null && p[1] !== '')
    : null;

  return (
    <div className="fv" ref={raizRef}>
      {/* ── Cabecera fija: lo básico, máximo dos botones ── */}
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
            <div className="vc-ident">
              {/* Aquí se gestiona: con expediente se muestran los dos
                  («Exp. 2201 · Rad. 20261041205», decisión 2026-10-19). */}
              <span className="vc-rad">
                {expedienteDe(f) ? <><span className="exp-tag">Exp. {expedienteDe(f)}</span> · Rad. {f['RADICADO'] || '—'}</>
                  : (f['RADICADO'] || '—')}
              </span>
              {barrio && <><span className="vc-sep">·</span><span>{barrio}</span></>}
              {f['COMUNA'] && <><span className="vc-sep">·</span><span>C{f['COMUNA']}</span></>}
              {quienes.length > 0 && <><span className="vc-sep">·</span><span>{titleCaseNombre(quienes[0])}{quienes.length > 1 ? ' +' + (quienes.length - 1) : ''}</span></>}
            </div>
            {/* Recorrido del caso: los pasos cumplidos, una sola línea. */}
            {recorridoTxt && <div className="fv-recorrido">{recorridoTxt}</div>}
          </div>
          <div className="fv-fija-acc">
            {!terminada && onContinuar && (puedeDiligenciar(f)
              ? <button type="button" className="vc-btn vc-btn-cta" onClick={() => onContinuar(f._idx, f)}>
                  <Icon.Play size={14} /> {est === 'INICIADO' ? 'Continuar visita' : 'Iniciar visita'}
                </button>
              // Regla del diligenciador: al co-asignado se le dice quién la lleva.
              : <span className="vc-dilig">La lleva {quienes[0]}</span>)}
            {/* La PQR se abre en pestaña nueva, como en las tarjetas: fuera
                el visor incrustado de la ficha (decisión del usuario). */}
            {linkPqr && (
              <a className="vc-btn" href={linkPqr} target="_blank" rel="noopener noreferrer"
                title="Abrir el PDF de la PQR radicada (pestaña nueva)">
                <Icon.File size={14} /> Ver PQR <span className="fv-ext" aria-hidden="true">↗</span>
              </a>
            )}
            <BotonMapaVisita f={f} variante="vc" />
          </div>
        </div>
      </div>

      <div className="fv-cuerpo">
        <div className="fv-datos">
          {/* Entregables: la carpeta de la visita primero; solo si la visita
              empezó (las reglas del panel: «Falta» / «No se generó»). */}
          {empezada && (!terminada || f['LINK_DRIVE'] || _entregablesMV(f).some(e => e.link)) && (
            <section className="fv-sec">
              <h3 className="mv-sub">Entregables{!terminada && <small>se generan dentro de la visita</small>}</h3>
              {f['LINK_DRIVE'] && (
                <div className="mv-ent">
                  <span className="fv-ico"><Icon.Folder size={12} /></span>
                  <span className="mv-ent-n">Carpeta de la visita</span>
                  <a className="vc-btn" href={f['LINK_DRIVE']} target="_blank" rel="noopener noreferrer">Abrir</a>
                </div>
              )}
              {/* Completada: solo lo que existe y se puede abrir (decisión del usuario 2026-10-14). */}
              {_entregablesMV(f).filter(e => !terminada || e.link).map(e => (
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

          {secciones.map((s, i) => {
            // Ficha ancha: la ubicación se va a la columna del lugar.
            if (dosCols && s.clave === 'ubicacion') return null;
            // «Se llena en la visita»: todas las secciones vacías en una
            // sola línea, en el lugar de la primera.
            if (s.resumen) {
              if (i !== luegoIdx) return null;
              return (
                <section className="fv-sec" key={s.clave}>
                  <p className="fv-vacios fv-luego-linea"><b>Se llenan en la visita:</b> {luegoTitulos}</p>
                </section>
              );
            }
            return <_SecFV key={s.clave} s={s} f={f} />;
          })}

          {/* Ficha angosta: el mapa cierra la lista, como siempre. */}
          {!dosCols && <MapaPanelMV f={f} />}

          {/* Radicados reiterados al final (decisión del usuario 2026-10-08: se usa
              poco y en la sección 1 quedaba muy a la vista). ReiteradosVD decide
              solo si hay o quién mira es admin. */}
          <ReiteradosVD key={String(f._idx) + '|' + f['RADICADO']} f={f} />

          {crudoPares && crudoPares.length > 0 && (
            <details className="fv-crudo">
              <summary>Todos los campos de la BD <small>admin · diagnóstico</small></summary>
              <dl className="mv-datos">
                {crudoPares.map(p => (
                  <div key={p[0]}><dt>{p[0]}</dt><dd>{String(p[1]).slice(0, 200)}</dd></div>
                ))}
              </dl>
            </details>
          )}
        </div>

        {/* Ficha ancha: ubicación y mapa en su columna, fijos bajo la
            cabecera mientras se recorren los datos. */}
        {dosCols && (
          <div className="fv-lugar">
            {secUbic && <_SecFV s={secUbic} f={f} />}
            <MapaPanelMV f={f} />
          </div>
        )}
      </div>

      {/* Gestión (E5 la inyecta): barra fija al pie, fuera de la información
          (decisión del usuario 2026-10-12; antes iba entre los entregables y
          la sección 1). */}
      {gestion && <div className="fv-gestion-pie">{gestion}</div>}
    </div>
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

// Una sección de seccionesFicha: número + título, campos con dato y, al pie,
// «Sin dato: …». (Las secciones «se llena en la visita» no llegan aquí: la
// ficha las junta en una sola línea.)
function _SecFV({ s, f }) {
  // Campos en orden: los cortos agrupados en la lista de definición, los
  // largos como párrafo suelto (etiqueta en línea si la lleva).
  const bloques = [];
  let pares = [];
  const volcar = () => {
    if (pares.length) {
      bloques.push(<_DatosMV key={'dl' + bloques.length} pares={pares} />);
      pares = [];
    }
  };
  s.campos.forEach(c => {
    if (c.largo) {
      volcar();
      bloques.push(
        <p key={'tx' + bloques.length} className="mv-texto">
          {c.l ? c.l + ': ' : ''}{c.v}
        </p>
      );
    } else {
      pares.push([c.l, c.v, c.ancho]);
    }
  });
  volcar();

  return (
    <section className="fv-sec" data-sec={s.clave}>
      <h3 className="mv-sub"><span className="fv-num" aria-hidden="true">{s.n}</span>{s.titulo}</h3>
      {bloques}
      {s.sinDato.length > 0 && (
        <p className="fv-vacios"><b>Sin dato:</b> {s.sinDato.join(', ')}</p>
      )}
    </section>
  );
}

// Exponer componente en el scope global
window.FichaVisita = FichaVisita;
