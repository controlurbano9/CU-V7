// ═══════════════════════════════════════════════════════════════
// v6/agenda-semana.jsx — Agenda unificada: la semana del equipo
// (2026-11-09, maqueta aprobada propuesta-agenda-unificada.html). Reemplaza
// las dos vistas que tenía la Agenda («Visitas» e «Inspecciones»).
//
// Un renglón por inspector, un día por columna (lunes a viernes); cada día
// es una zona para visitas e inspecciones (lunes comunas 1-2-3 … viernes
// rural). El día elegido se abre (2,2 fr) con hora · dirección · caso; los
// demás quedan compactos. A la derecha, «Por agendar» del día elegido:
// inspecciones decretadas sin hora y visitas sugeridas de la zona. Todo va
// a un borrador (guardado en el equipo, por semana) hasta «Asignar», que lo
// envía con las acciones de siempre (programarInspecciones, confirmarAgenda,
// asignarRadicado). La regla del cruce (choqueZonaInspeccion) bloquea.
// Arrastrar (solo escritorio) cambia de día o de inspector. En el celular,
// un día a la vez. La lógica vive en utils.js (semanaEquipo, porAgendarDia,
// datosConBorrador, envioBorrador…; tests/agenda-semana.test.js): aquí solo
// se pinta. PanelReglasAgenda y los ayudantes de nombres vienen de agenda.jsx.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateAS, useEffect: useEffectAS, useMemo: useMemoAS, useRef: useRefAS } = React;

// La misma marca que deja «Ver en la Agenda» desde la ficha de una
// inspección (app.jsx la escribe): { fecha, fila }.
const AS_IR_KEY = 'cu_agenda_inspeccion';
const AS_DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const AS_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function _asIrPendiente() {
  try {
    const v = sessionStorage.getItem(AS_IR_KEY);
    if (v) sessionStorage.removeItem(AS_IR_KEY);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}
// «23 – 27 de noviembre» / «30 de noviembre – 4 de diciembre».
function _asRangoSemana(dias) {
  const a = dias[0].date, b = dias[4].date;
  return a.getMonth() === b.getMonth()
    ? a.getDate() + ' – ' + b.getDate() + ' de ' + AS_MESES[b.getMonth()]
    : a.getDate() + ' de ' + AS_MESES[a.getMonth()] + ' – ' + b.getDate() + ' de ' + AS_MESES[b.getMonth()];
}
function _asDir(f) {
  return direccionVisible(String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim() || 'Sin dirección');
}
// Subrenglón del item: «Inspección · Exp. N» o «Rad. N» (el expediente
// manda sobre el radicado; identificadorVisita ya resuelve cuál hay).
function _asSub(it) {
  const id = identificadorVisita(it.f).principal;
  if (it.tipo === 'insp') return 'Inspección' + (id.indexOf('Exp.') === 0 ? ' · ' + id : '');
  return id.indexOf('Exp.') === 0 ? id : 'Rad. ' + id;
}
// Índice del día inicial (0–4): el de la marca si cae dentro de su
// semana, y si no hoy (si es hábil y está en la semana) o el primer día
// hábil no pasado. Sin candidatos (semana pasada entera o viernes
// festivo), el primero no pasado que haya, y si no el viernes.
function _asDiaInicial(marca) {
  const l = lunesInspecciones(marca && marca.fecha ? parsearFecha(marca.fecha) : new Date());
  const dias = [0, 1, 2, 3, 4].map(k => {
    const d = new Date(l.getFullYear(), l.getMonth(), l.getDate() + k);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  if (marca && marca.fecha) {
    const m = parsearFecha(marca.fecha);
    if (m) {
      m.setHours(0, 0, 0, 0);
      const k = dias.findIndex(d => d.getTime() === m.getTime());
      if (k >= 0) return k;
    }
  }
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  let primeroNoPasado = -1;
  for (let k = 0; k < 5; k++) {
    if (dias[k].getTime() < hoy.getTime()) continue;
    if (esDiaHabil(dias[k])) return k;
    if (primeroNoPasado < 0) primeroNoPasado = k;
  }
  return primeroNoPasado >= 0 ? primeroNoPasado : 4;
}

// Borrador guardado en el equipo, por semana (TASK 04): sobrevive a salir y
// volver. { 'DD/MM/YYYY' (lunes): borrador }. Las semanas ya pasadas se
// descartan al leer.
const AS_BORRADOR_KEY = 'cu_agenda_semana_borrador_v1';
function _asLeerBorradores() {
  try {
    const g = JSON.parse(localStorage.getItem(AS_BORRADOR_KEY) || '{}') || {};
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    Object.keys(g).forEach(k => {
      const l = parsearFecha(k);
      if (!l || new Date(l.getFullYear(), l.getMonth(), l.getDate() + 4) < hoy) delete g[k];
    });
    return g;
  } catch (e) { return {}; }
}
function _asBorradorDe(lunes) {
  const b = _asLeerBorradores()[formatearFecha(lunes)];
  return b && Array.isArray(b.items) ? b : borradorVacio(lunes);
}
function _asGuardarBorrador(b) {
  try {
    const g = _asLeerBorradores();
    if (b.items.length) g[b.lunes] = b; else delete g[b.lunes];
    localStorage.setItem(AS_BORRADOR_KEY, JSON.stringify(g));
  } catch (e) { /* sin espacio: queda en memoria */ }
}
// Arrastrar solo con mouse (en el celular no hay arrastre: TASK 05).
function _asConPuntero() {
  try { return window.matchMedia('(pointer: fine)').matches; } catch (e) { return false; }
}

// Lo que el tablero sabía de la inspección ('DD/MM/YYYY 9:00AM' o '' si no
// tenía): viaja como programadaConocida para que el backend rechace con
// `conflicto` si otro la cambió entretanto. Misma regla que
// _iaProgramadaConocida (inspecciones-agenda.jsx, que se va en la TASK 06).
function _asProgramadaConocida(f) {
  if (!f || !esInspeccionLugar(f)) return '';
  const d = parsearFecha(f['FECHA ASIGNACION VISITA'] || '');
  const fecha = d ? formatearFecha(d) : String(f['FECHA ASIGNACION VISITA'] || '').trim();
  const hora = horaProgramadaDe(f);
  return hora ? fecha + ' ' + hora : fecha;
}
// _idx del item del borrador al que pertenece una fila de datosEf: la
// visita nueva de una inspección es la fila virtual 'b:<fila origen>'.
function _asFilaBorrador(f) {
  const k = f && f._idx;
  return typeof k === 'string' && k.indexOf('b:') === 0 ? Number(k.slice(2)) : k;
}
// Horas de inspección libres de un inspector ese día (sin contar la fila
// que se reprograma): las que no tiene ocupadas con otra inspección.
function _asHorasLibres(datosEf, inspector, date, exceptoFila) {
  const ocupadas = visitasDelDia(datosEf, date, inspector)
    .filter(f => esInspeccionLugar(f) && _asFilaBorrador(f) !== exceptoFila)
    .map(f => horaAudienciasMin(horaProgramadaDe(f)));
  return HORAS_INSPECCION.filter(h => ocupadas.indexOf(horaAudienciasMin(h)) < 0);
}
// Una fila PENDIENTE como candidata (para el buscador): misma forma que
// candidatasAgenda ({ fila, radicado, direccion, barrio, comuna, prioridad }).
function _asCandidataDeFila(f) {
  const p = parseInt(String(f['PRIORIDAD'] || ''), 10);
  return { fila: f._idx, radicado: String(f['RADICADO'] || '').trim(), direccion: String(f['DIRECCION INFRACCION'] || ''),
    barrio: String(f['BARRIO/VEREDA'] || f['BARRIO'] || ''), comuna: f['COMUNA'], prioridad: isNaN(p) ? null : p };
}

function AgendaSemana({ usuario }) {
  // Hooks antes de cualquier early return (React #310). La marca se lee
  // una sola vez (la deja «Ver en la Agenda» desde la ficha).
  const ir = useRefAS(undefined);
  if (ir.current === undefined) {
    ir.current = _asIrPendiente();
    // Inicio deja el día tocado en su Semana (AGENDA_DIA_KEY, YYYY-MM-DD).
    try {
      const s = sessionStorage.getItem(AGENDA_DIA_KEY);
      if (s) sessionStorage.removeItem(AGENDA_DIA_KEY);
      const d = s ? parsearFecha(s) : null;
      if (d && !ir.current) ir.current = { fecha: formatearFecha(d) };
    } catch (e) { /* sin sessionStorage */ }
  }
  const [datos, setDatos] = useStateAS(null);
  const [activos, setActivos] = useStateAS([]);
  const [cfg, setCfg] = useStateAS(null);
  const [lunes, setLunes] = useStateAS(() => lunesInspecciones(ir.current && ir.current.fecha ? parsearFecha(ir.current.fecha) : new Date()));
  const [diaSel, setDiaSel] = useStateAS(() => _asDiaInicial(ir.current));
  // Administración › Equipo deja la marca para abrir ⚙ Reglas al llegar.
  const [reglasAbiertas, setReglasAbiertas] = useStateAS(() => {
    try {
      if (!sessionStorage.getItem(AGENDA_ABRIR_REGLAS_KEY)) return false;
      sessionStorage.removeItem(AGENDA_ABRIR_REGLAS_KEY);
      return usuario && usuario.rol === 'ADMIN';
    } catch (e) { return false; }
  });
  // «Ver en la Agenda»: la inspección de la marca se resalta un momento.
  const [resaltada, setResaltada] = useStateAS(() => (ir.current && ir.current.fila != null ? ir.current.fila : null));
  const [cargando, setCargando] = useStateAS(false);
  const [error, setError] = useStateAS('');
  // Borrador de la semana: guardado en el equipo y enviado con «Asignar».
  const [borrador, setBorrador] = useStateAS(() => _asBorradorDe(lunes));
  const [asignando, setAsignando] = useStateAS(false);
  const [dropCelda, setDropCelda] = useStateAS(null); // 'dia|inspector' bajo el arrastre
  const arrastre = useRefAS(null);
  const [abierta, setAbierta] = useStateAS(null);   // clave del caso de la inspección desplegada
  const [elegidos, setElegidos] = useStateAS({});   // clave del caso → inspector elegido
  const [expedientes, setExpedientes] = useStateAS({}); // clave del caso → expediente tecleado
  const [q, setQ] = useStateAS('');
  const [registrando, setRegistrando] = useStateAS(false);
  const [idxBarrios, setIdxBarrios] = useStateAS(null);

  async function cargar(forzar) {
    setCargando(true);
    try {
      const [bd, lista, c] = await Promise.all([
        leerVisitas(forzar ? { forzar: true } : undefined),
        listarInspectoresActivos(),
        leerConfigAgenda({ onActualizado: setCfg }),
      ]);
      setDatos(((bd && bd.datos) || []).concat((bd && bd.noCompetencia) || []));
      setActivos(lista || []);
      setCfg(c);
    } catch (e) { setError(e.message); }
    setCargando(false);
  }
  useEffectAS(() => {
    cargar();
    const off = typeof suscribirVisitas === 'function' ? suscribirVisitas(() => cargar()) : null;
    return () => { if (off) off(); };
  }, []);

  // «Ver en la Agenda» con la Agenda ya abierta: la app no vuelve a
  // montar la pantalla, así que la marca se toma aquí (app.jsx avisa
  // con este evento; mismo manejo que InspeccionesAgenda).
  useEffectAS(() => {
    const alIr = () => {
      const v = _asIrPendiente();
      if (!v || !v.fecha || !parsearFecha(v.fecha)) return;
      if (v.fila != null) setResaltada(v.fila);
      const m = parsearFecha(v.fecha);
      m.setHours(0, 0, 0, 0);
      setLunes(lunesInspecciones(m));
      setDiaSel(prev => {
        const l = lunesInspecciones(m);
        const k = [0, 1, 2, 3, 4].findIndex(j => {
          const d = new Date(l.getFullYear(), l.getMonth(), l.getDate() + j);
          d.setHours(0, 0, 0, 0);
          return d.getTime() === m.getTime();
        });
        return k >= 0 ? k : prev;
      });
    };
    window.addEventListener('cu-agenda-inspeccion-marca', alIr);
    return () => window.removeEventListener('cu-agenda-inspeccion-marca', alIr);
  }, []);

  // El reloj arranca cuando ya hay datos (si no, se apagaba antes de verse).
  const hayDatos = !!datos;
  useEffectAS(() => {
    if (resaltada == null || !hayDatos) return undefined;
    const t = setTimeout(() => setResaltada(null), 2500);
    return () => clearTimeout(t);
  }, [resaltada, hayDatos]);

  // Otra semana, su borrador guardado.
  useEffectAS(() => { setBorrador(_asBorradorDe(lunes)); setAbierta(null); }, [lunes]);
  // Cada cambio se guarda en el equipo (solo el de la semana a la vista).
  useEffectAS(() => {
    if (borrador.lunes === formatearFecha(lunes)) _asGuardarBorrador(borrador);
  }, [borrador]);
  // Con la BD al día, fuera lo que ya no aplica: la fila no existe o su
  // RADICADO cambió (se borró una fila en el Sheet y las de abajo subieron).
  useEffectAS(() => {
    if (!datos) return;
    setBorrador(b => {
      const vale = b.items.filter(it => {
        const f = datos.find(x => x._idx === it.fila);
        return !!f && claveRadicado(f['RADICADO']) === claveRadicado(it.radicado);
      });
      return vale.length === b.items.length ? b : Object.assign({}, b, { items: vale });
    });
  }, [datos]);
  // Salir con cambios: el borrador queda en este equipo, no en otro.
  useEffectAS(() => {
    if (!borrador.items.length) return undefined;
    const avisar = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [borrador.items.length]);

  // ── Derivados ──
  // Todo se calcula sobre los datos con el borrador aplicado: el tablero,
  // las cuentas, «Por agendar» y la regla del cruce lo ven como si ya
  // estuviera en BD (datosConBorrador, TASK 01).
  const datosEf = useMemoAS(() => datosConBorrador(datos || [], borrador), [datos, borrador]);
  const inspectores = useMemoAS(() => inspectoresAsignables(activos).map(i => i.nombre), [activos]);
  // Visitas: solo quien está en ⚙ Reglas («Quién recibe visitas de la
  // agenda»); las inspecciones, cualquiera de los asignables.
  const inspVisitas = useMemoAS(() => {
    const kw = cfg && cfg.inspectoresAgenda;
    return kw && kw.length ? inspectores.filter(n => esInspectorAgenda(n, kw)) : inspectores;
  }, [inspectores, cfg]);
  const meta = (cfg && cfg.visitasPorInspector) || 3;
  const semana = useMemoAS(() => semanaEquipo(datosEf, lunes, inspectores), [datosEf, lunes, inspectores]);
  // Candidatas una sola vez: porAgendarDia filtra por la zona de cada día.
  const candidatas = useMemoAS(() => candidatasAgenda(datosEf, new Date()), [datosEf]);
  const porAgendar = useMemoAS(
    () => semana.dias.map(d => porAgendarDia(datosEf, candidatas, d.date)),
    [datosEf, candidatas, semana]);
  // Buscador: otro caso (radicado, orden, dirección), desde 3 caracteres.
  const resultados = useMemoAS(() => {
    if (!datos || q.trim().length < 3) return [];
    return (buscarCasos(datosEf, q).casos || []).filter(c => !c.sinRadicado).slice(0, 8);
  }, [datosEf, q]);
  // «N por agendar» de cada cabecera: lo de esa zona (bandeja + sugeridas
  // de la zona), la misma cuenta que usará el panel «Por agendar» (TASK 03).
  const nPorAgendar = useMemoAS(() => semana.dias.map((d, k) => {
    const r = porAgendar[k] || { inspecciones: [], visitas: [] };
    let n = (r.visitas || []).length;
    (r.inspecciones || []).forEach(b => { if (diaGrupoInspeccion(b.f) === d.zona) n++; });
    return n;
  }), [porAgendar, semana]);

  const esAdmin = !!(usuario && usuario.rol === 'ADMIN');
  const escalon = useEscalera(!datos && !error);

  // Sin datos todavía: la forma de la lista o el error con «Reintentar»
  // (mismo molde que InspeccionesAgenda, propuesta de esperas 2026-11-04).
  if (!datos) {
    return (
      <div className="as-pantalla" aria-busy={!error || undefined}>
        {error
          ? <ErrorCarga titulo="No se pudo cargar la agenda." detalle={error} onReintentar={() => { setError(''); cargar(true); }} />
          : <><AvisoEspera escalon={escalon} que="las visitas" /><Esqueleto tipo="renglon" n={5} /></>}
      </div>
    );
  }

  const esEstaSemana = lunes.getTime() === lunesInspecciones(new Date()).getTime();
  const moverSemana = dias => setLunes(d => lunesInspecciones(new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias)));

  // ── «Por agendar» del día elegido ──
  const dia = semana.dias[diaSel];
  const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
  // Día pasado o festivo: se ve lo que hay, pero no se agrega nada.
  const cerrado = !dia.habil ? 'Es festivo: elige otro día.' : dia.date < hoy0 ? 'Ese día ya pasó: elige otro.' : '';
  const pa = porAgendar[diaSel] || { inspecciones: [], visitas: [] };
  const quitar = fila => setBorrador(b => borradorQuitar(b, fila));
  const avisar = m => appAlert(m, { titulo: 'No se puede agregar' });
  const tituloZona = textoZonaDia(dia.zona, false);

  // Fila de una inspección por programar (b = item de la bandeja, { f, fecha, quien }).
  const filaInspeccion = (b) => {
    const k = claveCasoInspeccion(b.f) || String(b.f._idx);
    const caso = visitasDelCaso(datosEf, b.f);
    const plan = inspeccionDelCaso(caso, usuario.rol);
    const enZona = diaGrupoInspeccion(b.f);
    const diaZona = enZona && enZona !== dia.zona ? semana.dias.findIndex(d => d.zona === enZona) : -1;
    const exp = expedientes[k] != null ? expedientes[k] : (caso.map(expedienteDe).find(Boolean) || '');
    const meta1 = [exp ? 'Exp. ' + exp : '', b.f['RADICADO'] || '',
      b.f['COMUNA'] ? etiquetaComuna(claveComunaAgenda(b.f['COMUNA']) || b.f['COMUNA']) : '',
      b.fecha ? 'decretada el ' + b.fecha : ''].filter(Boolean).join(' · ');
    const abiertaEsta = abierta === k;
    let cuerpo = null;
    if (abiertaEsta) {
      // Con inspector fijo (hizo la visita anterior, o la inspección ya lo tiene) no se elige.
      const fijo = plan.fijo || (plan.modo === 'reprogramar' && !!plan.inspector);
      const ins = fijo ? plan.inspector : (elegidos[k] || '');
      const choque = ins ? choqueZonaInspeccion(datosEf, ins, dia.date, b.f, { inspeccion: true }) : '';
      const excepto = plan.modo === 'reprogramar' ? plan.fila : null;
      const horas = ins && !choque && !cerrado ? _asHorasLibres(datosEf, ins, dia.date, excepto) : [];
      const fOrig = (datos || []).find(x => x._idx === plan.fila) || null;
      const programar = h => {
        setBorrador(bb => borradorAgregar(bb, { tipo: 'insp', fila: plan.fila, radicado: plan.radicado,
          inspector: ins, fecha: dia.fecha, hora: h, expediente: exp, modo: plan.modo,
          programadaConocida: _asProgramadaConocida(fOrig) }));
        setAbierta(null);
      };
      cuerpo = !plan.puede ? <p className="as-motivo">{plan.motivo || 'No se puede programar.'}</p> : (
        <>
          {fijo ? (
            <p className="as-va">Va <b>{nombrePila(ins)}</b>{plan.fijo ? ', que hizo la visita anterior.' : '.'}</p>
          ) : (
            <div className="as-elige" role="group" aria-label="Inspector">
              {inspectores.map(n => {
                const m = choqueZonaInspeccion(datosEf, n, dia.date, b.f, { inspeccion: true });
                return (
                  <button key={n} type="button" aria-pressed={ins === n} aria-disabled={m ? 'true' : undefined}
                    title={m || undefined}
                    onClick={() => (m ? avisar(m) : setElegidos(e => Object.assign({}, e, { [k]: n })))}>
                    {nombrePila(n)}
                  </button>
                );
              })}
            </div>
          )}
          {cerrado ? <p className="as-motivo">{cerrado}</p>
            : choque ? <p className="as-motivo">{choque}</p>
            : !ins ? <p className="as-nota">Elige quién va para ver sus horas libres.</p>
            : (
              <div className="as-horas" role="group" aria-label="Hora">
                {horas.length ? horas.map(h => (
                  <button key={h} type="button" className="as-hora" onClick={() => programar(h)}>{horaCortaInspeccion(h)}</button>
                )) : <span className="as-nota">{nombrePila(ins)} no tiene horas libres ese día.</span>}
              </div>
            )}
          {/* Expediente del caso (opcional, solo números): arranca con el que ya tenga. */}
          <input className="as-exp" type="text" inputMode="numeric" autoComplete="off" maxLength={6}
            placeholder="Expediente" aria-label="Expediente (opcional, solo números)" value={exp}
            onChange={e => setExpedientes(x => Object.assign({}, x, { [k]: e.target.value.replace(/\D+/g, '').slice(0, 6) }))} />
        </>
      );
    }
    return (
      <div key={'i' + k} className="as-fila">
        <div className="as-fila-d">{_asDir(b.f)}</div>
        <div className="as-fila-m">
          {meta1}
          {diaZona >= 0 && (
            <> · <b>su día es {AS_DIAS[semana.dias[diaZona].date.getDay()].toLowerCase()}</b>{' '}
              <button type="button" className="as-link" onClick={() => setDiaSel(diaZona)}>
                Ir al {AS_DIAS[semana.dias[diaZona].date.getDay()].toLowerCase()}
              </button></>
          )}
        </div>
        {abiertaEsta ? cuerpo : (
          <div className="as-acc">
            <button type="button" className="as-btn-t" onClick={() => setAbierta(k)}>Elegir hora</button>
          </div>
        )}
      </div>
    );
  };

  // Fila de una visita sugerida (v = candidata). Solo ADMIN asigna visitas.
  const filaVisita = (v, fueraZona) => {
    const m = motivoPrioridad(v);
    const com = claveComunaAgenda(v.comuna);
    const meta1 = [nivelPrioridad(v.prioridad) ? m.nivel : '', m.texto, v.radicado, v.barrio || 'Sin barrio',
      com ? etiquetaComuna(com) : ''].filter(Boolean).join(' · ');
    const fv = { _idx: v.fila, RADICADO: v.radicado, COMUNA: v.comuna, 'BARRIO/VEREDA': v.barrio };
    return (
      <div key={'v' + v.fila} className="as-fila">
        <div className="as-fila-d">{direccionVisible(v.direccion || '') || 'Sin dirección'}</div>
        <div className="as-fila-m">{meta1}{fueraZona && <> · <b>fuera de zona</b></>}</div>
        <div className="as-acc">
          {inspVisitas.map(n => {
            const i = inspectores.indexOf(n);
            // Cruza con una inspección de otra zona ese día: apagado, y al
            // tocarlo dice por qué (en el celular no hay title).
            const motivo = cerrado || choqueZonaInspeccion(datosEf, n, dia.date, fv, { inspeccion: false });
            return (
              <button key={n} type="button" className={'as-mas i' + ((i % 4) + 1)}
                aria-disabled={motivo ? 'true' : undefined}
                aria-label={motivo ? 'No se puede agregar al día de ' + nombrePila(n) + ': ' + motivo : 'Agregar al día de ' + nombrePila(n)}
                title={motivo || 'Agregar al día de ' + nombrePila(n)}
                onClick={() => (motivo ? avisar(motivo)
                  : setBorrador(b => borradorAgregar(b, { tipo: 'visita', fila: v.fila, radicado: v.radicado,
                    inspector: n, fecha: dia.fecha })))}>
                {inicialesInsp(n)}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Resultado del buscador: inspección decretada → fila de inspección;
  // última visita PENDIENTE → fila de visita (solo ADMIN); si no, su estado.
  const filaResultado = (c) => {
    const visitas = visitasDelCaso(datosEf, c.ultima);
    const decr = visitas.find(f => String(f['INSPECCION_DECRETADA'] || '').trim());
    if (decr) {
      const p = String(decr['INSPECCION_DECRETADA']).split(' · ');
      return filaInspeccion({ f: decr, fecha: p[0], quien: p.slice(1).join(' · ') });
    }
    const est = estadoBuscarDe(c.ultima);
    if (est === 'PENDIENTE' && esAdmin) {
      return filaVisita(_asCandidataDeFila(c.ultima), diaGrupoInspeccion(c.ultima) !== dia.zona);
    }
    const quien = primerVisitador(visitadoresBD(c.ultima));
    const textoEst = { PENDIENTE: 'Pendiente', ASIGNADO: 'Asignada', INICIADO: 'Iniciada', COMPLETADO: 'Completada',
      CERRADO: 'Cerrada sin visita' }[est] || est;
    return (
      <div key={'r' + c.clave} className="as-fila">
        <div className="as-fila-d">{_asDir(c.ultima)}</div>
        <div className="as-fila-m">{c.radicado} · {textoEst}{quien ? ' · ' + nombrePila(quien) : ''}</div>
      </div>
    );
  };

  const qRad = claveRadicado(q);
  const noEsta = q.trim().length >= 3 && !resultados.length;
  const puedeRegistrar = noEsta && puedeRegistrarRadicado(q, datos, usuario.rol);
  const abrirRegistro = () => {
    setRegistrando(true);
    if (!idxBarrios && typeof _cargarIdxBarriosBQ === 'function') _cargarIdxBarriosBQ().then(setIdxBarrios).catch(() => {});
  };

  // ── Asignar: un solo envío con todo el borrador (TASK 04) ──
  const resumen = borradorResumen(borrador);
  const esInspItem = it => it.tipo === 'insp' || (it.tipo === 'mover' && !!it.hora);
  const filaDeDatos = fila => (datos || []).find(x => x._idx === fila) || null;
  const expedienteBorrador = fila => ((borrador.items.find(x => x.fila === fila) || {}).expediente) || '';
  const cambiarExpediente = (fila, v) => setBorrador(b => {
    const it = b.items.find(x => x.fila === fila);
    return it ? borradorAgregar(b, Object.assign({}, it, { expediente: v })) : b;
  });

  async function asignar() {
    if (!borrador.items.length || asignando) return;
    // La regla, otra vez, contra los datos sin cada item: un borrador
    // guardado antes puede chocar con lo que se asignó después.
    const cruces = [];
    borrador.items.forEach(it => {
      const f = filaDeDatos(it.fila);
      if (!f) return;
      const m = choqueZonaInspeccion(datosConBorrador(datos, borradorQuitar(borrador, it.fila)), it.inspector,
        parsearFecha(it.fecha), f, { inspeccion: esInspItem(it) });
      if (m) cruces.push(_asDir(f) + ' — ' + m);
    });
    if (cruces.length) {
      await appAlert('Quita estos casos del borrador antes de asignar:\n\n' + cruces.join('\n'),
        { titulo: 'Se cruzan con otra zona', tono: 'error' });
      return;
    }
    setAsignando(true);
    const env = envioBorrador(borrador);
    const hechas = {};      // fila → true
    const fallos = [];      // '· radicado: motivo'
    let recargar = false;
    const fallo = (it, motivo) => fallos.push('· ' + (it.radicado || _asDir(filaDeDatos(it.fila) || {})) + ': ' + motivo);
    // 1) Inspecciones (y los cambios de día de una inspección). El resultado
    // viene en el mismo orden que los items enviados.
    if (env.programarInspecciones) {
      const enviados = borrador.items.filter(esInspItem);
      try {
        const r = await gasPost(env.programarInspecciones);
        enviados.forEach((it, i) => {
          const res = r && r.resultados && r.resultados[i];
          if (r && r.ok && res && res.ok) hechas[it.fila] = true;
          else {
            if (res && res.conflicto) recargar = true;
            fallo(it, (res && res.error) || (r && r.error) || 'no se pudo programar');
          }
        });
      } catch (e) { enviados.forEach(it => fallo(it, e.message)); }
    }
    // 2) Visitas nuevas: confirmarAgenda dice cuáles omitió y por qué.
    if (env.confirmarAgenda) {
      const enviadas = borrador.items.filter(it => it.tipo === 'visita');
      try {
        const r = await gasPost(env.confirmarAgenda);
        if (!r || r.ok === false) throw new Error((r && r.error) || 'no se pudo asignar');
        const omit = {};
        (r.omitidas || []).forEach(o => { omit[claveRadicado(o.radicado)] = o.motivo || 'omitida'; });
        enviadas.forEach(it => {
          const m = omit[claveRadicado(it.radicado)];
          if (m) fallo(it, m); else hechas[it.fila] = true;
        });
      } catch (e) { enviadas.forEach(it => fallo(it, e.message)); }
    }
    // 3) Visitas asignadas que cambian de día o de inspector.
    for (const mv of env.mover) {
      const it = borrador.items.find(x => x.fila === mv.fila);
      try {
        const r = await gasPost(Object.assign({ accion: 'asignarRadicado' }, mv));
        if (r && r.ok === false) throw new Error(r.error || 'no se pudo mover');
        hechas[mv.fila] = true;
      } catch (e) { fallo(it, e.message); }
    }
    // Lo que salió bien sale del borrador; lo que falló se queda.
    setBorrador(b => Object.assign({}, b, { items: b.items.filter(it => !hechas[it.fila]) }));
    invalidarCache('visitas');
    await cargar(true);
    setAsignando(false);
    if (fallos.length) {
      const n = Object.keys(hechas).length;
      await appAlert((n ? 'Se asignaron ' + n + '. ' : '') + 'No se pudieron:\n' + fallos.join('\n') +
        (recargar ? '\n\nOtra persona cambió la agenda: revisa antes de volver a intentarlo.' : ''),
        { titulo: 'Asignación parcial', tono: 'aviso' });
    }
  }

  async function descartar() {
    if (!borrador.items.length) return;
    const ok = await appConfirm('Se quitan ' + (resumen.total === 1 ? 'el cambio' : 'los ' + resumen.total + ' cambios') +
      ' de esta semana que aún no se asignaron.', { titulo: 'Descartar el borrador', btnOk: 'Descartar', btnCancel: 'Cancelar' });
    if (ok) setBorrador(borradorVacio(lunes));
  }

  // ── Arrastrar (solo escritorio): a otro día y/o inspector ──
  const conPuntero = _asConPuntero();
  const sePuedeArrastrar = it => {
    if (!conPuntero) return false;
    if (!esAdmin && it.tipo !== 'insp') return false;
    if (it.nueva) return true;
    return _normEstadoVisitaBD(it.f['ESTADO VISITA'] || '') === 'ASIGNADO';
  };
  function soltar(k, insp) {
    const a = arrastre.current;
    arrastre.current = null;
    setDropCelda(null);
    if (!a) return;
    const d = semana.dias[k];
    if (!d.habil || d.date < hoy0) return;
    const f = a.f;
    const esInsp = esInspeccionLugar(f);
    const filaB = _asFilaBorrador(f);
    const item = borrador.items.find(x => x.fila === filaB) || null;
    const actualIns = primerVisitador(visitadoresBD(f));
    if (formatearFecha(f['FECHA ASIGNACION VISITA'] || '') === d.fecha && actualIns === insp) return;
    // La inspección va con quien hizo la visita anterior.
    if (esInsp && actualIns !== insp) {
      const plan = inspeccionDelCaso(visitasDelCaso(datosEf, f), usuario.rol);
      if (plan.fijo) { avisar('Esta inspección va con ' + nombrePila(plan.inspector) + ', que hizo la visita anterior.'); return; }
    }
    const dEf = datosConBorrador(datos, item ? borradorQuitar(borrador, filaB) : borrador);
    const m = choqueZonaInspeccion(dEf, insp, d.date, f, { inspeccion: esInsp });
    if (m) { avisar(m); return; }
    const hora = esInsp ? (item ? item.hora : horaProgramadaDe(f)) : '';
    if (esInsp && !_asHorasLibres(dEf, insp, d.date, filaB).some(h => horaAudienciasMin(h) === horaAudienciasMin(hora))) {
      avisar(nombrePila(insp) + ' ya tiene inspección a las ' + horaCortaInspeccion(hora) + ' ese día.');
      return;
    }
    const nuevo = item ? Object.assign({}, item, { inspector: insp, fecha: d.fecha })
      : { tipo: 'mover', fila: f._idx, radicado: String(f['RADICADO'] || '').trim(), inspector: insp, fecha: d.fecha,
        hora: hora || undefined, programadaConocida: esInsp ? _asProgramadaConocida(filaDeDatos(f._idx)) : '' };
    setBorrador(b => borradorAgregar(b, nuevo));
  }
  const partesResumen = [];
  if (resumen.visitas) partesResumen.push(resumen.visitas === 1 ? '1 visita' : resumen.visitas + ' visitas');
  if (resumen.inspecciones) partesResumen.push(resumen.inspecciones === 1 ? '1 inspección' : resumen.inspecciones + ' inspecciones');
  if (resumen.movidas) partesResumen.push(resumen.movidas === 1 ? '1 cambio de día' : resumen.movidas + ' cambios de día');
  const textoResumen = partesResumen.length > 1
    ? partesResumen.slice(0, -1).join(', ') + ' y ' + partesResumen[partesResumen.length - 1] : partesResumen[0];

  return (
    <div className="as-pantalla">
      <header className="as-cab">
        <h1 className="page-title">Agenda</h1>
        <div className="as-semana">
          <button type="button" className="as-flecha" aria-label="Semana anterior" onClick={() => moverSemana(-7)}>
            <Icon.ChevronLeft size={16} />
          </button>
          <b className="as-rango">{_asRangoSemana(semana.dias)}</b>
          <button type="button" className="as-flecha" aria-label="Semana siguiente" onClick={() => moverSemana(7)}>
            <Icon.ChevronRight size={16} />
          </button>
          {!esEstaSemana && (
            <button type="button" className="as-hoy" onClick={() => setLunes(lunesInspecciones(new Date()))}>Esta semana</button>
          )}
        </div>
        <div className="as-cab-der">
          {esAdmin && (
            <button type="button" className="vc-btn as-reglas" aria-label="Reglas" aria-expanded={reglasAbiertas}
              onClick={() => setReglasAbiertas(v => !v)}>
              <Icon.Admin size={14} /><span className="as-lbl">Reglas</span>
            </button>
          )}
          {/* Gira mientras recarga, como el ↻ de la cabecera de la Agenda. */}
          <button type="button" className={'vc-btn as-icono' + (cargando ? ' icono-girando' : '')} aria-label="Recargar" title="Recargar"
            onClick={() => cargar(true)} disabled={cargando} aria-busy={cargando || undefined}>
            <Icon.Refresh size={14} />
          </button>
          {reglasAbiertas && (
            <PanelReglasAgenda
              activos={activos} cfg={cfg}
              onCerrar={() => setReglasAbiertas(false)}
              onGuardado={c => { setCfg(c); setReglasAbiertas(false); }} />
          )}
        </div>
      </header>

      {/* Celular (<900): un día a la vez; la tira elige el día (TASK 05). */}
      <div className="as-tira" role="group" aria-label="Día">
        {semana.dias.map((d, k) => (
          <button key={d.fecha} type="button" aria-pressed={k === diaSel} disabled={!d.habil} onClick={() => setDiaSel(k)}>
            <b>{AS_DIAS[d.date.getDay()]} {d.date.getDate()}</b>
            <small>{d.habil ? textoZonaDia(d.zona, true) : 'Festivo'}</small>
            <small>{nPorAgendar[k]} por agendar</small>
          </button>
        ))}
      </div>

      <div className="as-cuerpo">
      <div className="as-tabla">
        <section className="as-tablero" aria-label="Semana del equipo"
          style={{ '--as-dias': semana.dias.map((d, k) => k === diaSel ? '2.2fr' : '1fr').join(' ') }}>
          <div className="as-esq" aria-hidden="true"></div>
          {semana.dias.map((d, k) => (
            <button type="button" key={d.fecha} className={'as-dia' + (k === diaSel ? ' sel' : '')}
              aria-pressed={k === diaSel} disabled={!d.habil} onClick={() => setDiaSel(k)}>
              <b>{AS_DIAS[d.date.getDay()]} {d.date.getDate()}</b>
              <span className="as-dia-zona">{d.habil ? textoZonaDia(d.zona, k !== diaSel) : 'Festivo'}</span>
              <span className="as-dia-n">{nPorAgendar[k]} por agendar</span>
            </button>
          ))}
          {semana.filas.map((fila, fi) => {
            // Cuánto lleva en toda la semana (el pie de cada celda dice el día).
            const lleva = fila.dias.reduce((s, d) => s + d.total, 0);
            return (
              <React.Fragment key={fila.inspector}>
                <div className="as-ins" style={{ '--c': 'var(--ag-i' + ((fi % 4) + 1) + ')' }}>
                  <span className="as-ini" aria-hidden="true">{inicialesInsp(fila.inspector)}</span>
                  <div className="as-ins-nom">
                    <b title={fila.inspector}>{nombrePila(fila.inspector)}</b>
                    <small>{lleva} en la semana</small>
                  </div>
                </div>
                {fila.dias.map((c, k) => {
                  const clave = k + '|' + fila.inspector;
                  const arrastrar = it => (sePuedeArrastrar(it)
                    ? e => { arrastre.current = it; try { e.dataTransfer.effectAllowed = 'move'; } catch (er) { /* sin dataTransfer */ } }
                    : null);
                  return (
                  <div key={semana.dias[k].fecha}
                    className={'as-celda' + (k === diaSel ? ' sel' : ' as-celda-compacta') + (dropCelda === clave ? ' as-drop' : '')}
                    onDragOver={conPuntero ? e => { if (arrastre.current) { e.preventDefault(); if (dropCelda !== clave) setDropCelda(clave); } } : undefined}
                    onDragLeave={conPuntero ? e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropCelda(d => (d === clave ? null : d)); } : undefined}
                    onDrop={conPuntero ? e => { e.preventDefault(); soltar(k, fila.inspector); } : undefined}>
                    {k === diaSel
                      ? c.items.map((it, j) => (
                        <AsItem key={it.f && it.f._idx != null ? it.f._idx : 'i' + j} it={it} detallado={true} resaltada={resaltada}
                          onQuitar={it.nueva ? () => quitar(_asFilaBorrador(it.f)) : null}
                          expediente={it.nueva && it.tipo === 'visita' ? expedienteBorrador(it.f._idx) : null}
                          onExpediente={it.nueva && it.tipo === 'visita' ? v => cambiarExpediente(it.f._idx, v) : null}
                          onArrastrar={arrastrar(it)} onFinArrastre={() => setDropCelda(null)} />))
                      : <>
                        {c.items.filter(it => it.tipo === 'insp').map((it, j) => (
                          <AsItem key={it.f && it.f._idx != null ? it.f._idx : 'i' + j} it={it} detallado={false} resaltada={resaltada}
                            onArrastrar={arrastrar(it)} onFinArrastre={() => setDropCelda(null)} />))}
                        {c.visitas > 0 && (
                          <div className="as-resumen">{c.visitas} {c.visitas === 1 ? 'visita' : 'visitas'}</div>
                        )}
                      </>}
                    <div className="as-cuenta">
                      <span>{c.total ? '' : 'Libre'}</span>
                      <span className={c.total > meta ? 'as-pasa' : undefined}>
                        <b>{c.total}</b>/{meta}{c.total > meta ? ' · pasa la meta' : ''}
                      </span>
                    </div>
                  </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </section>
      </div>

      <aside className="as-panel" aria-labelledby="as-pa-t">
        <div className="as-panel-cab">
          <h2 id="as-pa-t">Por agendar</h2>
          <p>{AS_DIAS[dia.date.getDay()]} {dia.date.getDate()}{tituloZona ? ' · ' + tituloZona : ''}</p>
          <div className="as-buscar">
            <Icon.Search size={16} />
            <input type="search" value={q} autoComplete="off" onChange={e => { setQ(e.target.value); setRegistrando(false); }}
              aria-label="Buscar otro caso" placeholder="Otro caso: radicado, orden o dirección" />
          </div>
        </div>
        <div className="as-panel-lista">
          {q.trim().length >= 3 ? (
            <>
              <h3 className="as-grupo">Resultados <span>{resultados.length}</span></h3>
              {resultados.map(filaResultado)}
              {noEsta && !registrando && (
                puedeRegistrar ? (
                  <div className="as-vacio">
                    <p><b>{qRad} no está en la base.</b> Si es una PQR nueva, regístrala y luego agéndala.</p>
                    <button type="button" className="as-btn-t" onClick={abrirRegistro}>Registrar {qRad}</button>
                  </div>
                ) : (
                  <p className="as-vacio">
                    {formaRadicadoValida(qRad)
                      ? 'Ningún caso coincide. Si es una PQR nueva, pídele al administrador que la registre.'
                      : 'Ningún caso coincide.'}
                  </p>
                )
              )}
              {registrando && typeof RegistrarRadicadoBQ === 'function' && (
                <div className="as-registrar">
                  <RegistrarRadicadoBQ radicado={qRad} idxBarrios={idxBarrios}
                    onCancelar={() => setRegistrando(false)}
                    onRegistrado={() => { setRegistrando(false); invalidarCache('visitas'); cargar(true); }}
                    onRecargar={() => { setRegistrando(false); invalidarCache('visitas'); cargar(true); }} />
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="as-grupo">Inspecciones por programar <span>{pa.inspecciones.length}</span></h3>
              {pa.inspecciones.length ? pa.inspecciones.map(filaInspeccion)
                : <p className="as-vacio">Nada decretado en Audiencias sin hora.</p>}
              {esAdmin && (
                <>
                  <h3 className="as-grupo">Visitas{tituloZona ? ' · ' + tituloZona : ''} <span>{pa.visitas.length}</span></h3>
                  {pa.visitas.length ? pa.visitas.map(v => filaVisita(v, false))
                    : <p className="as-vacio">No quedan visitas por agendar en esta zona. Busca otro caso arriba si hace falta.</p>}
                </>
              )}
            </>
          )}
        </div>
      </aside>
      </div>

      {/* Barra del borrador: «Asignar» es el único botón lleno de la pantalla. */}
      <div className="as-barra" role="region" aria-label="Borrador de la semana">
        <div className="as-barra-txt" aria-live="polite">
          {resumen.total ? <b>Borrador: {textoResumen}</b> : <b>Sin cambios</b>}
          <small>{resumen.total ? 'Nada se escribe hasta asignar.' : 'Elige un día y agrega desde «Por agendar».'}</small>
        </div>
        <div className="as-barra-acc">
          {resumen.total > 0 && (
            <button type="button" className="as-btn-txt" onClick={descartar} disabled={asignando}>Descartar</button>
          )}
          <button type="button" className="as-btn-llena" onClick={asignar} disabled={!resumen.total || asignando}
            aria-busy={asignando || undefined}>
            {asignando ? 'Asignando…' : resumen.total ? 'Asignar ' + resumen.total : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Un item de la celda: inspección (lleva hora) o visita. Detallado en el
// día elegido (hora · dirección · caso); compacto, solo la hora de la
// inspección. Tocarlo abre la visita (como la tarjeta de Inspecciones).
function AsItem({ it, detallado, resaltada, onQuitar, onArrastrar, onFinArrastre, expediente, onExpediente }) {
  const f = it.f;
  const dir = _asDir(f);
  const sub = _asSub(it);
  const hora = it.tipo === 'insp' ? horaCortaInspeccion(it.hora) : '';
  const clase = 'as-it as-it-' + it.tipo + (it.fueraZona ? ' as-it-fuera' : '') + (it.nueva ? ' as-it-nueva' : '') +
    (resaltada != null && f && f._idx === resaltada ? ' as-it-resaltada' : '');
  const title = dir + (it.fueraZona ? ' · fuera de zona' : '') + ' — ' + sub;
  const label = (hora ? hora + ', ' : '') + sub + ', ' + dir + (it.fueraZona ? ', fuera de zona' : '');
  const abrir = () => { if (window.abrirVisitaDetail) window.abrirVisitaDetail(f); };
  const tecla = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } };
  // Arrastrable (escritorio) solo si el tablero lo permite (sePuedeArrastrar).
  const arr = onArrastrar ? { draggable: true, onDragStart: onArrastrar, onDragEnd: onFinArrastre } : {};
  if (!detallado) {
    return (
      <div className={clase} role="button" tabIndex={0} title={title} aria-label={label}
        onClick={abrir} onKeyDown={tecla} {...arr}>
        <span className="as-it-h">{hora}</span>
      </div>
    );
  }
  return (
    <div className={clase} role="button" tabIndex={0} title={title} aria-label={label}
      onClick={abrir} onKeyDown={tecla} {...arr}>
      <span className="as-it-h">{it.tipo === 'insp' ? horaCortaInspeccion(it.hora) : ''}</span>
      <span className="as-it-d">{dir}</span>
      {onQuitar ? (
        <button type="button" className="as-quitar" aria-label={'Quitar ' + dir + ' del borrador'}
          onClick={e => { e.stopPropagation(); onQuitar(); }} onKeyDown={e => e.stopPropagation()}>
          <Icon.Close size={14} />
        </button>
      ) : <span></span>}
      <span className="as-it-s">
        {it.nueva && <b className="as-nueva">Nueva</b>}
        {it.nueva ? ' · ' : ''}
        {it.fueraZona && <b className="as-fz">Fuera de zona</b>}
        {it.fueraZona ? ' · ' : ''}{sub}
      </span>
      {/* Visita nueva: el expediente del caso lo conoce quien asigna (opcional, solo números). */}
      {onExpediente && (
        <input className="as-exp-it" type="text" inputMode="numeric" autoComplete="off" maxLength={6}
          placeholder="Expediente" aria-label={'Expediente de ' + dir + ' (opcional)'} value={expediente || ''}
          onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}
          onChange={e => onExpediente(e.target.value.replace(/\D+/g, '').slice(0, 6))} />
      )}
    </div>
  );
}

window.AgendaSemana = AgendaSemana;
