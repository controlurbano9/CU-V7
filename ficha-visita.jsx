// ═══════════════════════════════════════════════════════════════
// ficha-visita.jsx — FichaVisita: la ficha única de la visita (E2b)
//
// Arriba, fija (sticky), solo lo básico: estado y desde cuándo, dirección,
// radicado + PQR + barrio + comuna + inspector, y máximo dos botones.
// Debajo, un solo scroll en el orden del formulario: recorrido ·
// entregables · gestión (la inyecta quien llama, E5) · las secciones de
// seccionesFicha (utils.js — esa decide QUÉ se muestra; aquí solo se pinta)
// · mapa · campos crudos (admin). Con PQR y ≥900 px de contenedor, la PQR
// queda fija en su columna mientras se recorren los datos.
// Solo lectura: no edita nada.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateFV, useEffect: useEffectFV, useRef: useRefFV, useMemo: useMemoFV } = React;

// El scroller de la ficha depende de quién la aloja: el panel de Mis visitas
// (.mv-panel) o, más adelante, la hoja del modal (E2c). Misma búsqueda de la
// maqueta: closest('.mv-panel, .fv-hoja').
function _scrollerFV(el) {
  return el && el.closest ? el.closest('.mv-panel, .fv-hoja') : null;
}

function FichaVisita({ f, usuario, verPrioridad, onContinuar, onCerrar, gestion }) {
  const raizRef = useRefFV(null);
  const fijaRef = useRefFV(null);

  const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
  const empezada = est === 'INICIADO' || est === 'COMPLETADO';
  const completa = est === 'COMPLETADO';
  const tono = _ESTADO_PANEL_MV[est] || { cls: '', label: est || '—' };
  const dir = f['DIRECCION INFRACCION'] || f['DIRECCION'] || 'Sin dirección';
  const barrio = f['BARRIO/VEREDA'] || f['BARRIO'] || '';
  // visitadoresBD devuelve el texto de la columna («A / B»), no una lista.
  const quienes = String(visitadoresBD(f) || '').split(/\s*[\/,]\s*/).map(s => s.trim()).filter(Boolean);

  // Otra visita: la ficha vuelve arriba y la cabecera se re-mide.
  useEffectFV(() => {
    const raiz = raizRef.current;
    if (!raiz) return;
    const scroller = _scrollerFV(raiz);
    if (scroller) scroller.scrollTop = 0;
  }, [f._idx]);

  // El alto real de la cabecera va a --fv-fija-h: la columna de la PQR se
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
  // demora de las alertas. Completada → la fecha de la visita.
  let estadoTxt = '', estadoCls = '';
  if (completa) {
    estadoTxt = 'Completada el ' + (formatearFecha(f['FECHA DE VISITA'] || '') || '—');
  } else {
    const dias = est === 'INICIADO' ? diasSinCompletar(f) : diasSinIniciar(f);
    if (dias != null) {
      estadoTxt = dias > 0 ? 'hace ' + _plural(dias, 'día', 'días') : 'hoy';
      estadoCls = _demoradaMV(dias) ? ' demora' : ' espera';
    }
  }

  const idPqr = idArchivoDrive(linkPdfRadicado(f));
  const secciones = seccionesFicha(f, usuario && usuario.rol);

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
      <div className="fv-fija" ref={fijaRef}>
        {onCerrar && (
          <button type="button" className="vc-btn fv-cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        )}
        <div className="fv-fija-fila">
          <div className="fv-fija-id">
            <div className="fv-estado">
              <span className={'al-estado' + tono.cls}>{tono.label}</span>
              {estadoTxt && <span className={'fv-estado-txt' + estadoCls}>{estadoTxt}</span>}
            </div>
            <div className="fv-dir">{dir}</div>
            <div className="vc-ident">
              <span className="vc-rad">{f['RADICADO'] || '—'}</span>
              <BotonPdfRadicado f={f} />
              {barrio && <><span className="vc-sep">·</span><span>{barrio}</span></>}
              {f['COMUNA'] && <><span className="vc-sep">·</span><span>C{f['COMUNA']}</span></>}
              {quienes.length > 0 && <><span className="vc-sep">·</span><span>{titleCaseNombre(quienes[0])}{quienes.length > 1 ? ' +' + (quienes.length - 1) : ''}</span></>}
            </div>
          </div>
          <div className="fv-fija-acc">
            {!completa && onContinuar && (puedeDiligenciar(f)
              ? <button type="button" className="vc-btn vc-btn-cta" onClick={() => onContinuar(f._idx, f)}>
                  <Icon.Play size={14} /> {est === 'INICIADO' ? 'Continuar visita' : 'Iniciar visita'}
                </button>
              // Regla del diligenciador: al co-asignado se le dice quién la lleva.
              : <span className="vc-dilig">Diligencia {quienes[0]}</span>)}
            <BotonMapaVisita f={f} variante="vc" />
          </div>
        </div>
      </div>

      {/* Recorrido del caso: el anillo marca dónde está detenido. */}
      <_RecorridoFV f={f} />

      <div className={'fv-cuerpo' + (idPqr ? ' con-pqr' : '')}>
        <div>
          {/* Entregables: la carpeta de la visita primero; solo si la visita
              empezó (las reglas del panel: «Falta» / «No se generó»). */}
          {empezada && (
            <section className="fv-sec">
              <h3 className="mv-sub">Entregables{!completa && <small>se generan dentro de la visita</small>}</h3>
              {f['LINK_DRIVE'] && (
                <div className="mv-ent">
                  <span className="fv-ico"><Icon.Folder size={12} /></span>
                  <span className="mv-ent-n">Carpeta de la visita</span>
                  <a className="vc-btn" href={f['LINK_DRIVE']} target="_blank" rel="noopener noreferrer">Abrir</a>
                </div>
              )}
              {_entregablesMV(f).map(e => (
                <div className="mv-ent" key={e.n}>
                  <span className={'ent-dot' + (e.link ? ' ed-ok' : (completa ? '' : ' ed-pend'))} aria-hidden="true" />
                  <span className="mv-ent-n">{e.n}</span>
                  {e.link
                    ? <a className="vc-btn" href={e.link} target="_blank" rel="noopener noreferrer">Abrir</a>
                    : <span className={'mv-ent-e' + (completa ? '' : ' falta')}>{completa ? 'No se generó' : 'Falta'}</span>}
                </div>
              ))}
            </section>
          )}

          {/* Gestión (E5 la inyecta): sin envoltorio. */}
          {gestion}

          {secciones.map(s => <_SecFV key={s.clave} s={s} f={f} />)}

          <MapaPanelMV f={f} />

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

        {idPqr && (
          <div className="fv-col-pqr">
            <PqrPanelMV id={idPqr} link={linkPdfRadicado(f)} radicado={f['RADICADO']} />
          </div>
        )}
      </div>
    </div>
  );
}

// Recorrido radicada → asignada → visita → completada (recorridoVisita,
// utils.js): mismo bloque que tenía el panel de Mis visitas.
function _RecorridoFV({ f }) {
  const pasos = recorridoVisita(f);
  return (
    <div className="mv-linea fv-linea" role="list" aria-label="Recorrido del caso">
      {pasos.map((p, i) => {
        const sig = pasos[i + 1];
        const cls = 'mv-paso'
          + (p.hecho ? ' hecho' : '')
          + (p.hecho && sig && sig.hecho ? ' tramo' : '')
          + (p.espera ? ' espera' : '')
          + (p.espera && _demoradaMV(p.dias) ? ' demora' : '')
          + (!p.hecho && !p.espera ? ' futuro' : '');
        return (
          <div key={p.clave} className={cls} role="listitem">
            <div className="mv-paso-rot">{p.rotulo}</div>
            <div className="mv-paso-val">{p.valor || '—'}</div>
            {p.espera && p.dias > 0 && <div className="mv-paso-sub">hace {_plural(p.dias, 'día', 'días')}</div>}
          </div>
        );
      })}
    </div>
  );
}

// Una sección de seccionesFicha: número + título, campos con dato y, al pie,
// «Sin dato: …». Con resumen («Se llena en la visita.»), solo esa línea.
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
    <section className={'fv-sec' + (s.resumen ? ' fv-luego' : '')} data-sec={s.clave}>
      <h3 className="mv-sub"><span className="fv-num" aria-hidden="true">{s.n}</span>{s.titulo}</h3>
      {s.resumen
        ? <p className="fv-vacios"><b>{s.resumen}</b></p>
        : <>
            {bloques}
            {s.sinDato.length > 0 && (
              <p className="fv-vacios"><b>Sin dato:</b> {s.sinDato.join(', ')}</p>
            )}
          </>}
      {/* Sección 1: los radicados reiterados del caso (ReiteradosVD decide
          solo si hay o quién mira es admin). */}
      {s.n === 1 && <ReiteradosVD key={String(f._idx) + '|' + f['RADICADO']} f={f} />}
    </section>
  );
}

// Exponer componente en el scope global
window.FichaVisita = FichaVisita;
