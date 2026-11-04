// ═══════════════════════════════════════════════════════════════
// reporte-evidencias.jsx — Administración › Evidencias (2026-11-04)
//
// Reporte mensual de evidencias: se elige el mes (por FECHA DE VISITA), la
// app sugiere las visitas COMPLETADAS más representativas —primero las que
// tienen orden de suspensión— y genera en Drive una carpeta compartida con
// una subcarpeta por visita (nombre = dirección) con el acta y el registro
// fotográfico en PDF. Queda historial en la hoja REPORTES_EVIDENCIAS.
// La regla (quién puede ir, en qué orden) vive en utils.js
// (candidatasEvidencias) y se prueba en tests/reporte-evidencias.test.js;
// aquí solo se pinta. Solo ADMIN (lo exige también el backend).
// ═══════════════════════════════════════════════════════════════
const { useState: useStateEv, useEffect: useEffectEv, useMemo: useMemoEv } = React;

function TabEvidencias({ visitas }) {
  const [mes, setMes] = useStateEv(() => mesPorDefectoEvidencias(new Date()));
  const [hist, setHist] = useStateEv(null);          // filas de REPORTES_EVIDENCIAS
  const [histError, setHistError] = useStateEv('');
  // Claves elegidas, en el orden del reporte. null = la sugerencia de la app.
  const [sel, setSel] = useStateEv(null);
  const [generando, setGenerando] = useStateEv(false);
  const [resultado, setResultado] = useStateEv(null);
  const [noEligAbierto, setNoEligAbierto] = useStateEv(false);
  const [histAbierto, setHistAbierto] = useStateEv(false);

  useEffectEv(() => { cargarHistorial(); }, []);

  function cargarHistorial() {
    setHistError('');
    return leerReportesEvidencias().then(setHist)
      .catch(e => { setHist([]); setHistError(e.message || 'No se pudo leer el historial.'); });
  }

  const meses = useMemoEv(() => mesesRecientesEvidencias(new Date(), 13), []);
  const cand = useMemoEv(() => candidatasEvidencias(visitas, mes, hist || [], EVIDENCIAS_POR_MES),
    [visitas, mes, hist]);
  const porMes = useMemoEv(() => historialEvidenciasPorMes(hist || []), [hist]);
  const yaGenerado = porMes.find(g => g.mes === mes) || null;

  const elegidas = sel || cand.sugeridas;
  const porClave = useMemoEv(() => {
    const m = {};
    cand.elegibles.forEach(e => { m[e.clave] = e; });
    return m;
  }, [cand]);
  // Una clave elegida que ya no está entre las elegibles (la BD cambió) se cae.
  const elegidasVivas = elegidas.filter(k => porClave[k]);
  const esSugerencia = !sel || (sel.length === cand.sugeridas.length && sel.every((k, i) => k === cand.sugeridas[i]));

  function cambiarMes(m) {
    setMes(m); setSel(null); setResultado(null); setNoEligAbierto(false);
  }

  function alternar(clave) {
    const base = elegidasVivas.slice();
    const i = base.indexOf(clave);
    if (i >= 0) base.splice(i, 1);
    else if (base.length < EVIDENCIAS_MAX) base.push(clave);
    setSel(base);
  }

  async function generar() {
    if (generando || !elegidasVivas.length) return;
    const nombre = nombreMesEvidencias(mes);
    const partes = ['Se crea en Drive la carpeta «Evidencias ' + nombre + '» con ' +
      elegidasVivas.length + (elegidasVivas.length === 1 ? ' visita' : ' visitas') +
      ' (acta y registro fotográfico en PDF), compartida a quien tenga el enlace.'];
    if (elegidasVivas.length < EVIDENCIAS_POR_MES) {
      partes.push('Van menos de ' + EVIDENCIAS_POR_MES + ' visitas.');
    }
    if (yaGenerado) {
      partes.push('Ya hay un reporte de ' + nombre + ' (' + yaGenerado.fecha + '): se reemplaza, y las copias anteriores van a la papelera de Drive.');
    }
    if (!(await appConfirm(partes.join('\n\n'), {
      titulo: yaGenerado ? 'Reemplazar reporte de ' + nombre : 'Generar reporte de ' + nombre,
      btnOk: yaGenerado ? 'Reemplazar' : 'Generar',
    }))) return;

    setGenerando(true); setResultado(null);
    try {
      const r = await generarReporteEvidencias(mes, elegidasVivas.map(k => {
        const f = porClave[k].f;
        return { idVisita: f['ID_VISITA'] || '', fila: f._idx, radicado: f['RADICADO'] || '' };
      }));
      setResultado(r);
      setSel(null);
      await cargarHistorial();
    } catch (e) {
      await appAlert(e.message || 'No se pudo generar el reporte.', { tono: 'error', titulo: 'No se generó el reporte' });
    }
    setGenerando(false);
  }

  const fila = (e, elegible) => {
    const n = elegidasVivas.indexOf(e.clave);
    const marcada = n >= 0;
    const lleno = !marcada && elegidasVivas.length >= EVIDENCIAS_MAX;
    const f = e.f;
    const barrio = f['BARRIO/VEREDA'] || f['BARRIO'] || '';
    const contenido = (
      <>
        {elegible && <span className={'ev-num' + (marcada ? ' activo' : '')} aria-hidden="true">{marcada ? n + 1 : ''}</span>}
        <span className="ev-txt">
          <span className="ev-dir">{direccionVisible(e.dir) || 'Sin dirección'}
            {barrio && <span className="ev-barrio"> · {barrio}</span>}</span>
          <span className="adm-b-meta">
            {e.rad || 'Sin radicado'} · {formatearFecha(f['FECHA DE VISITA']) || '—'}
            {e.ins && <> · {titleCaseNombre(e.ins)}</>}
            {e.com && <> · {e.com === 'RURAL' ? 'Rural' : 'Comuna ' + e.com}</>}
          </span>
          <span className="ev-motivos">
            {e.motivos.map(m => (
              <span key={m} className={'badge-suave ' + (/^Suspensión/.test(m) ? 'badge-rojo'
                : /ya reportada/.test(m) ? 'badge-amarillo' : 'ev-neutro')}>{m}</span>
            ))}
            {e.faltas.map(m => <span key={m} className="badge-suave badge-amarillo">Falta {m.toLowerCase()}</span>)}
          </span>
        </span>
      </>
    );
    if (!elegible) return <div key={e.clave} className="ev-item ev-item-no">{contenido}</div>;
    return (
      <button key={e.clave} type="button" className={'ev-item' + (marcada ? ' sel' : '')}
        aria-pressed={marcada} disabled={lleno || generando} onClick={() => alternar(e.clave)}
        title={lleno ? 'Máximo ' + EVIDENCIAS_MAX + ' visitas por reporte' : ''}>
        {contenido}
      </button>
    );
  };

  const nCompletadas = cand.elegibles.length + cand.noElegibles.length;
  const listaOrdenada = cand.elegibles.slice().sort((a, b) => {
    // Las elegidas arriba, en el orden del reporte; el resto como viene.
    const ia = elegidasVivas.indexOf(a.clave), ib = elegidasVivas.indexOf(b.clave);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return 0;
  });

  return (
    <div className="adm-bandeja">
      <div className="card adm-seccion">
        <div className="card-titulo">Reporte de evidencias</div>
        <p className="adm-nota">
          Visitas completadas del mes (por fecha de visita) con acta y registro fotográfico. La app
          sugiere {EVIDENCIAS_POR_MES}: primero las que tienen orden de suspensión, de distintos
          inspectores y comunas. Toca una visita para quitarla o agregarla.
        </p>
        <div className="ev-cab">
          <label className="ev-mes">
            <span>Mes</span>
            <select className="tb-select" value={mes} onChange={ev => cambiarMes(ev.target.value)} disabled={generando}>
              {meses.map(m => <option key={m} value={m}>{nombreMesEvidencias(m)}</option>)}
            </select>
          </label>
          <span className="ev-resumen">
            {nCompletadas} completadas · {cand.elegibles.length} con acta y registro · {cand.conSuspension} con suspensión
          </span>
        </div>
        {yaGenerado && !resultado && (
          <div className="ev-aviso">
            Ya se generó el {yaGenerado.fecha}{yaGenerado.por && <> por {titleCaseNombre(yaGenerado.por)}</>}
            {' '}({yaGenerado.visitas.length} visitas).{' '}
            {yaGenerado.linkCarpeta && <a href={yaGenerado.linkCarpeta} target="_blank" rel="noopener noreferrer">Abrir carpeta</a>}
            {' '}Generarlo de nuevo lo reemplaza.
          </div>
        )}
        {histError && <div className="ev-aviso ev-aviso-error">Historial: {histError}</div>}
      </div>

      {resultado && (
        <div className="card adm-seccion ev-listo">
          <div className="card-titulo">Carpeta lista: {resultado.nombreCarpeta}</div>
          <p className="adm-nota">
            {resultado.visitas.length} {resultado.visitas.length === 1 ? 'visita' : 'visitas'}
            {resultado.reemplazado ? ' · reemplazó el reporte anterior' : ''}. Cualquiera con el enlace puede verla.
          </p>
          <ol className="ev-ol">
            {resultado.visitas.map(v => (
              <li key={v.linkCarpeta}><a href={v.linkCarpeta} target="_blank" rel="noopener noreferrer">{v.carpeta}</a>
                <span className="adm-b-meta"> · {v.radicado}</span></li>
            ))}
          </ol>
          <div className="ev-acc">
            <a className="vc-btn vc-btn-cta" href={resultado.linkCarpeta} target="_blank" rel="noopener noreferrer">Abrir carpeta en Drive</a>
            <button type="button" className="vc-btn" onClick={() => {
              try { navigator.clipboard.writeText(resultado.linkCarpeta); } catch (e) {}
            }}>Copiar enlace</button>
          </div>
        </div>
      )}

      <div className="card adm-seccion">
        <div className="card-titulo">
          Visitas del reporte
          <small>{elegidasVivas.length} de {EVIDENCIAS_POR_MES}{elegidasVivas.length > EVIDENCIAS_POR_MES ? ' (máx. ' + EVIDENCIAS_MAX + ')' : ''}</small>
        </div>
        {hist === null && <p className="adm-nota">Cargando historial…</p>}
        {!cand.elegibles.length ? (
          <div className="adm-vacio">
            <b>Sin visitas para el reporte</b>
            <span>{nCompletadas
              ? 'Las visitas completadas de ' + nombreMesEvidencias(mes) + ' no tienen acta y registro fotográfico.'
              : 'No hay visitas completadas con fecha de visita en ' + nombreMesEvidencias(mes) + '.'}</span>
          </div>
        ) : (
          <>
            {cand.conSuspension < EVIDENCIAS_POR_MES && (
              <p className="adm-nota">
                {cand.conSuspension === 0 ? 'Ninguna visita del mes tiene' : 'Solo ' + cand.conSuspension +
                  (cand.conSuspension === 1 ? ' visita tiene' : ' visitas tienen')} suspensión de obra: se completa con otras.
              </p>
            )}
            <div className="ev-lista">{listaOrdenada.map(e => fila(e, true))}</div>
            {!esSugerencia && (
              <button type="button" className="adm-enlace ev-restablecer" onClick={() => setSel(null)} disabled={generando}>
                Volver a la sugerencia
              </button>
            )}
          </>
        )}

        {cand.noElegibles.length > 0 && (
          <>
            <button type="button" className="adm-grupo-btn" aria-expanded={noEligAbierto}
              onClick={() => setNoEligAbierto(a => !a)}>
              No pueden ir (falta acta o registro) <span>{cand.noElegibles.length}</span>
            </button>
            {noEligAbierto && <div className="ev-lista">{cand.noElegibles.map(e => fila(e, false))}</div>}
          </>
        )}

        <div className="ev-acc ev-acc-final">
          <button type="button" className="vc-btn vc-btn-cta" onClick={generar}
            disabled={generando || !elegidasVivas.length}>
            {generando ? 'Generando… puede tardar un minuto' :
              (yaGenerado ? 'Reemplazar carpeta de ' : 'Generar carpeta de ') + nombreMesEvidencias(mes)}
          </button>
        </div>
      </div>

      {porMes.length > 0 && (
        <div className="card adm-seccion ev-hist">
          <button type="button" className="adm-grupo-btn" aria-expanded={histAbierto}
            onClick={() => setHistAbierto(a => !a)}>
            Reportes anteriores <span>{porMes.length}</span>
          </button>
          {histAbierto && porMes.map(g => (
            <div key={g.mes} className="adm-b-item">
              <div className="adm-b-txt">
                <span className="ev-dir">{g.nombre}</span>
                <div className="adm-b-meta">{g.fecha}{g.por && <> · {titleCaseNombre(g.por)}</>} · {g.visitas.length} visitas</div>
                <div className="adm-b-meta">{g.visitas.map(v => v.RADICADO).filter(Boolean).join(' · ')}</div>
              </div>
              <div className="adm-b-acc">
                {g.linkCarpeta && <a className="vc-btn" href={g.linkCarpeta} target="_blank" rel="noopener noreferrer">Abrir carpeta</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
