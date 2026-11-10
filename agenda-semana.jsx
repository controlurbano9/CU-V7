// ═══════════════════════════════════════════════════════════════
// v6/agenda-semana.jsx — Agenda unificada: la semana del equipo
// (2026-11-09, maqueta aprobada propuesta-agenda-unificada.html). Reemplaza
// las dos vistas que tenía la Agenda («Visitas» e «Inspecciones»).
//
// Rediseño 2026-11-10 (maqueta propuesta-agenda-dia.html): elegir es lo
// difícil, así que la lista manda. Arriba, la semana en una tira: zona de
// cada día (lunes comunas 1-2-3 … viernes rural), cupos libres (meta ×
// visitadores de ⚙ Reglas, cuentan visitas e inspecciones; es meta, no
// tope) y horas de inspección. Abajo, «Por agendar» del día elegido, ancho,
// un renglón por caso (filtro de comuna, orden por urgencia o por barrio,
// buscador y «Registrar»), y a la derecha «El día»: un bloque por inspector
// que se va llenando, «Proponer» y el borrador con «Asignar». Todo va a un
// borrador (guardado en el equipo, por semana) hasta «Asignar», que lo
// envía con las acciones de siempre (programarInspecciones, confirmarAgenda,
// asignarRadicado); las inspecciones programadas se confirman en una
// ventana con caso, fecha (con año) y hora. La regla del cruce
// (choqueZonaInspeccion) bloquea. Arrastrar (solo escritorio): un caso al
// inspector, o algo del día a otro inspector o a otro día de la tira. La
// lógica vive en utils.js (semanaEquipo, porAgendarDia, cuposDiaEquipo,
// proponerDiaAgenda…; tests/agenda-semana.test.js, agenda-cupos.test.js).
// PanelReglasAgenda y los ayudantes de nombres vienen de agenda.jsx.
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
  const panelRef = useRefAS(null);
  const [abierta, setAbierta] = useStateAS(null);   // clave del caso de la inspección desplegada
  const [horaDe, setHoraDe] = useStateAS(null);     // _idx de la inspección del tablero con sus horas abiertas
  const [elegidos, setElegidos] = useStateAS({});   // clave del caso → inspector elegido
  const [expedientes, setExpedientes] = useStateAS({}); // clave del caso → expediente tecleado
  const [q, setQ] = useStateAS('');
  const [registrando, setRegistrando] = useStateAS(false);
  const [idxBarrios, setIdxBarrios] = useStateAS(null);
  const [com, setCom] = useStateAS('');             // filtro de comuna de la lista ('' = todas)
  const [orden, setOrden] = useStateAS('urg');      // 'urg' | 'barrio'
  const [dropIns, setDropIns] = useStateAS(null);   // visitador bajo el arrastre
  const [confirmadas, setConfirmadas] = useStateAS(null); // { inspecciones, visitas } tras «Asignar»
  const [avisoOk, setAvisoOk] = useStateAS('');     // aviso breve de abajo
  const listoRef = useRefAS(null);
  const volverRef = useRefAS(null);

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

  // «Por agendar» (fijo arriba al bajar) cabe en lo visible: termina 12 px
  // antes del fondo del área que desplaza. La barra del borrador ya no va
  // debajo del panel (está bajo el tablero, en la otra columna), así que no
  // lo tapa.
  useEffectAS(() => {
    if (!hayDatos) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;
    let zona = panel.parentElement;
    while (zona && zona !== document.body) {
      const oy = getComputedStyle(zona).overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      zona = zona.parentElement;
    }
    let raf = 0;
    const ajustar = () => {
      raf = 0;
      if (window.innerWidth < 1280) { panel.style.maxHeight = ''; return; }
      // Sin el relleno inferior del área que desplaza.
      let fondo = window.innerHeight;
      if (zona && zona !== document.body) {
        const cs = getComputedStyle(zona);
        fondo = zona.getBoundingClientRect().bottom - (parseFloat(cs.paddingBottom) || 0) - (parseFloat(cs.borderBottomWidth) || 0);
      }
      const alto = fondo - 12 - panel.getBoundingClientRect().top;
      panel.style.maxHeight = Math.max(240, Math.floor(alto)) + 'px';
    };
    const pedir = () => { if (!raf) raf = requestAnimationFrame(ajustar); };
    ajustar();
    window.addEventListener('scroll', pedir, true);
    window.addEventListener('resize', pedir);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', pedir, true);
      window.removeEventListener('resize', pedir);
    };
  }, [hayDatos]);

  // Otro día: sin filtro de comuna y sin nada desplegado.
  useEffectAS(() => { setCom(''); setAbierta(null); setHoraDe(null); }, [diaSel]);
  // El aviso breve se va solo.
  useEffectAS(() => {
    if (!avisoOk) return undefined;
    const t = setTimeout(() => setAvisoOk(''), 3500);
    return () => clearTimeout(t);
  }, [avisoOk]);
  // Confirmación de inspecciones: el foco va a «Listo»; Esc la cierra.
  useEffectAS(() => {
    if (!confirmadas) return undefined;
    if (listoRef.current) listoRef.current.focus();
    const tecla = e => { if (e.key === 'Escape') cerrarConfirmacion(); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [confirmadas]);
  function cerrarConfirmacion() {
    setConfirmadas(null);
    const v = volverRef.current;
    if (v && typeof v.focus === 'function' && document.body.contains(v)) v.focus();
  }

  // Otra semana, su borrador guardado.
  useEffectAS(() => { setBorrador(_asBorradorDe(lunes)); setAbierta(null); setHoraDe(null); }, [lunes]);
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
  // Meta por visitador (⚙ Reglas). Cupos del día = meta × visitadores (2 × 2 = 4).
  const meta = (cfg && cfg.visitasPorInspector) || 2;
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

  // ── El día elegido ──
  const dia = semana.dias[diaSel];
  const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
  // Día pasado o festivo: se ve lo que hay, pero no se agrega nada.
  const cerrado = !dia.habil ? 'Es festivo: elige otro día.' : dia.date < hoy0 ? 'Ese día ya pasó: elige otro.' : '';
  const pa = porAgendar[diaSel] || { inspecciones: [], visitas: [] };
  const quitar = fila => setBorrador(b => borradorQuitar(b, fila));
  const avisar = m => appAlert(m, { titulo: 'No se puede agregar' });
  const tituloZona = textoZonaDia(dia.zona, false);
  const colorDe = n => 'var(--ag-i' + ((Math.max(0, inspectores.indexOf(n)) % 4) + 1) + ')';
  const filaDelDia = n => semana.filas.find(x => x.inspector === n);
  const delDia = n => { const fi = filaDelDia(n); return (fi && fi.dias[diaSel]) || { items: [], total: 0 }; };

  // Clave del caso para «abierta», el inspector elegido y el expediente.
  const claveIns = f => claveCasoInspeccion(f) || String(f._idx);
  const expedienteCaso = (k, caso) => (expedientes[k] != null ? expedientes[k] : (caso.map(expedienteDe).find(Boolean) || ''));

  // Agregar una visita sugerida al día de un visitador (botón o arrastre).
  function agregarVisita(v, n) {
    const fv = { _idx: v.fila, RADICADO: v.radicado, COMUNA: v.comuna, 'BARRIO/VEREDA': v.barrio };
    const motivo = cerrado || (inspVisitas.indexOf(n) < 0 ? nombrePila(n) + ' no recibe visitas de la agenda (⚙ Reglas).' : '') ||
      choqueZonaInspeccion(datosEf, n, dia.date, fv, { inspeccion: false });
    if (motivo) { avisar(motivo); return; }
    setBorrador(b => borradorAgregar(b, { tipo: 'visita', fila: v.fila, radicado: v.radicado, inspector: n, fecha: dia.fecha }));
  }

  // Lo que se despliega al programar una inspección en el día elegido:
  // inspector (si no es fijo), sus horas libres y el expediente. Lo usan la
  // bandeja, el buscador (cualquier caso) y la fila de una visita pendiente.
  const cuerpoInspeccion = (f, k) => {
    const caso = visitasDelCaso(datosEf, f);
    const plan = inspeccionDelCaso(caso, usuario.rol);
    const exp = expedienteCaso(k, caso);
    // El inspector siempre lo elige quien agenda (admin o supervisor; 2026-11-10,
    // decisión del usuario), entre los visitadores de ⚙ Reglas. Quien hizo la
    // visita anterior solo se muestra. Al cambiar el día u hora de una
    // inspección ya programada, arranca marcado el que la tiene (si está en Reglas).
    const anterior = (numerarVisitasRadicado(caso).filter(x => {
      const e = _normEstadoVisitaBD(x.f['ESTADO VISITA'] || '');
      return (e === 'INICIADO' || e === 'COMPLETADO' || e === 'COMPLETADA') && primerVisitador(visitadoresBD(x.f));
    }).pop() || null);
    const inspAnterior = anterior ? primerVisitador(visitadoresBD(anterior.f)) : '';
    const actual = plan.modo === 'reprogramar' && inspVisitas.indexOf(plan.inspector) >= 0 ? plan.inspector : '';
    const ins = elegidos[k] != null ? elegidos[k] : actual;
    const choque = ins ? choqueZonaInspeccion(datosEf, ins, dia.date, f, { inspeccion: true }) : '';
    const excepto = plan.modo === 'reprogramar' ? plan.fila : null;
    const horas = ins && !choque && !cerrado ? _asHorasLibres(datosEf, ins, dia.date, excepto) : [];
    const fOrig = (datos || []).find(x => x._idx === plan.fila) || null;
    const programar = h => {
      setBorrador(bb => borradorAgregar(bb, { tipo: 'insp', fila: plan.fila, radicado: plan.radicado,
        inspector: ins, fecha: dia.fecha, hora: h, expediente: exp, modo: plan.modo,
        programadaConocida: _asProgramadaConocida(fOrig) }));
      setAbierta(null);
    };
    const cancelar = (
      <button type="button" className="as-btn-txt as-cancelar" onClick={() => setAbierta(null)}>Cancelar</button>
    );
    if (!plan.puede) return <div className="as-prog"><p className="as-motivo">{plan.motivo || 'No se puede programar.'}</p>{cancelar}</div>;
    return (
      <div className="as-prog">
        {inspAnterior && <p className="as-va">Visita anterior: <b>{nombrePila(inspAnterior)}</b></p>}
        <div className="as-elige" role="group" aria-label="Inspector">
          {/* Se elige entre los visitadores de la agenda (Alejandro y Mauricio). */}
          {inspVisitas.map(n => {
            const m = choqueZonaInspeccion(datosEf, n, dia.date, f, { inspeccion: true });
            return (
              <button key={n} type="button" aria-pressed={ins === n} aria-disabled={m ? 'true' : undefined}
                title={m || undefined}
                onClick={() => (m ? avisar(m) : setElegidos(e => Object.assign({}, e, { [k]: n })))}>
                {nombrePila(n)}
              </button>
            );
          })}
        </div>
        {cerrado ? <p className="as-motivo">{cerrado}</p>
          : choque ? <p className="as-motivo">{choque}</p>
          : !ins ? null
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
        {cancelar}
      </div>
    );
  };

  // Renglón de una inspección por programar (b = { f, fecha, quien }: de la
  // bandeja, o un caso del buscador con fecha ''). etiqueta = el botón.
  const filaInspeccion = (b, etiqueta) => {
    const k = claveIns(b.f);
    const exp = expedienteCaso(k, visitasDelCaso(datosEf, b.f));
    const enZona = diaGrupoInspeccion(b.f);
    const diaZona = enZona && enZona !== dia.zona ? semana.dias.findIndex(d => d.zona === enZona) : -1;
    const com = b.f['COMUNA'] ? etiquetaComuna(claveComunaAgenda(b.f['COMUNA']) || b.f['COMUNA']) : '';
    const barrio = String(b.f['BARRIO/VEREDA'] || b.f['BARRIO'] || '').trim();
    const abiertaEsta = abierta === k;
    return (
      <div key={'i' + k} className="as-fila">
        <span className="as-f-dir">{_asDir(b.f)}</span>
        <span className="as-f-bar">{[barrio, com].filter(Boolean).join(' · ')}</span>
        <span className="as-f-urg">
          {b.fecha ? 'decretada el ' + b.fecha : (exp ? 'Exp. ' + exp : '')}
          {diaZona >= 0 && (
            <> · <button type="button" className="as-link" onClick={() => setDiaSel(diaZona)}>
              su día es el {AS_DIAS[semana.dias[diaZona].date.getDay()].toLowerCase()}
            </button></>
          )}
        </span>
        <span className="as-f-rad">{b.f['RADICADO'] || ''}</span>
        <span className="as-f-acc">
          {!abiertaEsta && <button type="button" className="as-btn-t" onClick={() => setAbierta(k)}>{etiqueta || 'Elegir hora'}</button>}
        </span>
        {abiertaEsta && cuerpoInspeccion(b.f, k)}
      </div>
    );
  };

  // Renglón de una visita sugerida (v = candidata). Solo ADMIN asigna visitas.
  // fInsp (desde el buscador): la misma visita se puede programar también
  // como inspección al lugar. Se arrastra (escritorio) al día de un visitador.
  const filaVisita = (v, fInsp) => {
    const m = motivoPrioridad(v);
    const com = claveComunaAgenda(v.comuna);
    const fv = { _idx: v.fila, RADICADO: v.radicado, COMUNA: v.comuna, 'BARRIO/VEREDA': v.barrio };
    const kI = fInsp ? claveIns(fInsp) : null;
    const abiertaI = kI && abierta === kI;
    const arr = conPuntero && !cerrado ? {
      draggable: true,
      onDragStart: e => { arrastre.current = { cand: v }; try { e.dataTransfer.effectAllowed = 'move'; } catch (er) { /* sin dataTransfer */ } },
      onDragEnd: () => { arrastre.current = null; setDropIns(null); setDropCelda(null); },
    } : {};
    return (
      <div key={'v' + v.fila} className="as-fila" {...arr}>
        <span className="as-f-dir">{direccionVisible(v.direccion || '') || 'Sin dirección'}</span>
        <span className="as-f-bar">{[v.barrio || 'Sin barrio', com ? etiquetaComuna(com) : ''].filter(Boolean).join(' · ')}</span>
        <span className="as-f-urg">{nivelPrioridad(v.prioridad) && <b>{m.nivel}</b>}{nivelPrioridad(v.prioridad) && m.texto ? ' · ' : ''}{m.texto}</span>
        <span className="as-f-rad">{v.radicado}</span>
        <span className="as-f-acc">
          {!abiertaI && inspVisitas.map(n => {
            // Cruza con una inspección de otra zona ese día: apagado, y al
            // tocarlo dice por qué (en el celular no hay title).
            const motivo = cerrado || choqueZonaInspeccion(datosEf, n, dia.date, fv, { inspeccion: false });
            return (
              <button key={n} type="button" className="as-mas" style={{ '--c': colorDe(n) }}
                aria-disabled={motivo ? 'true' : undefined}
                aria-label={motivo ? 'No se puede agregar al día de ' + nombrePila(n) + ': ' + motivo : 'Agregar al día de ' + nombrePila(n)}
                title={motivo || 'Agregar al día de ' + nombrePila(n)}
                onClick={() => (motivo ? avisar(motivo) : agregarVisita(v, n))}>
                <i aria-hidden="true"></i>{inicialesInsp(n)}
              </button>
            );
          })}
          {kI && !abiertaI && (
            <button type="button" className="as-btn-t" onClick={() => setAbierta(kI)}>Inspección</button>
          )}
        </span>
        {abiertaI && cuerpoInspeccion(fInsp, kI)}
      </div>
    );
  };

  // Resultado del buscador: inspección decretada → renglón de inspección;
  // última visita PENDIENTE → renglón de visita (solo ADMIN), que también se
  // puede programar como inspección; cualquier otro caso se programa como
  // inspección si inspeccionDelCaso lo deja; si no, su estado y el motivo.
  const filaResultado = (c) => {
    const visitas = visitasDelCaso(datosEf, c.ultima);
    const decr = visitas.find(f => String(f['INSPECCION_DECRETADA'] || '').trim());
    if (decr) {
      const p = String(decr['INSPECCION_DECRETADA']).split(' · ');
      return filaInspeccion({ f: decr, fecha: p[0], quien: p.slice(1).join(' · ') });
    }
    const plan = inspeccionDelCaso(visitas, usuario.rol);
    const est = estadoBuscarDe(c.ultima);
    if (est === 'PENDIENTE' && esAdmin) {
      return filaVisita(_asCandidataDeFila(c.ultima), plan.puede ? c.ultima : null);
    }
    if (plan.puede) {
      return filaInspeccion({ f: c.ultima, fecha: '', quien: '' },
        plan.modo === 'reprogramar' ? 'Cambiar día u hora' : 'Programar inspección');
    }
    const quien = primerVisitador(visitadoresBD(c.ultima));
    const textoEst = { PENDIENTE: 'Pendiente', ASIGNADO: 'Asignada', INICIADO: 'Iniciada', COMPLETADO: 'Completada',
      CERRADO: 'Cerrada sin visita' }[est] || est;
    const barrio = String(c.ultima['BARRIO/VEREDA'] || c.ultima['BARRIO'] || '').trim();
    return (
      <div key={'r' + c.clave} className="as-fila">
        <span className="as-f-dir">{_asDir(c.ultima)}</span>
        <span className="as-f-bar">{barrio}</span>
        <span className="as-f-urg">{textoEst}{quien ? ' · ' + nombrePila(quien) : ''}</span>
        <span className="as-f-rad">{c.radicado}</span>
        <span className="as-f-acc"></span>
        {plan.motivo && <p className="as-motivo as-prog">{plan.motivo}</p>}
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

  // ── Asignar: un solo envío con todo el borrador ──
  const resumen = borradorResumen(borrador);
  const esInspItem = it => it.tipo === 'insp' || (it.tipo === 'mover' && !!it.hora);
  const filaDeDatos = fila => (datos || []).find(x => x._idx === fila) || null;
  const expedienteBorrador = fila => ((borrador.items.find(x => x.fila === fila) || {}).expediente) || '';
  // Casilla de expediente en la tarjeta: visitas nuevas e inspecciones
  // programadas en el borrador (no en un cambio de hora o de día).
  const esNuevaConExp = it => {
    const x = borrador.items.find(y => y.fila === _asFilaBorrador(it.f));
    return !!x && (x.tipo === 'visita' || x.tipo === 'insp');
  };
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
    const items = borrador.items.slice();
    // Lo que irá en la confirmación de cada inspección (caso, fecha y hora),
    // tomado antes de enviar: luego el borrador se vacía.
    const fichas = items.filter(esInspItem).map(it => {
      const f = filaDeDatos(it.fila) || {};
      const exp = it.expediente || expedienteDe(f) || '';
      return { fila: it.fila, fecha: it.fecha, hora: it.hora, inspector: it.inspector, radicado: it.radicado || f['RADICADO'] || '',
        expediente: exp, dir: _asDir(f), barrio: String(f['BARRIO/VEREDA'] || f['BARRIO'] || '').trim(),
        comuna: f['COMUNA'] ? etiquetaComuna(claveComunaAgenda(f['COMUNA']) || f['COMUNA']) : '' };
    });
    const env = envioBorrador(borrador);
    const hechas = {};      // fila → true
    const fallos = [];      // '· radicado: motivo'
    let recargar = false;
    const fallo = (it, motivo) => fallos.push('· ' + (it.radicado || _asDir(filaDeDatos(it.fila) || {})) + ': ' + motivo);
    // 1) Inspecciones (y los cambios de día u hora de una inspección). El
    // resultado viene en el mismo orden que los items enviados.
    if (env.programarInspecciones) {
      const enviados = items.filter(esInspItem);
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
      const enviadas = items.filter(it => it.tipo === 'visita');
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
    // 3) Visitas asignadas que cambian de día o de visitador.
    for (const mv of env.mover) {
      const it = items.find(x => x.fila === mv.fila);
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
    // Inspecciones programadas: confirmación con caso, fecha (con año) y hora.
    // Solo visitas: aviso breve que se va solo.
    const okInsp = fichas.filter(x => hechas[x.fila]);
    const okVis = items.filter(it => !esInspItem(it) && hechas[it.fila]).length;
    if (okInsp.length) {
      volverRef.current = document.activeElement;
      setConfirmadas({ inspecciones: okInsp, visitas: okVis });
    } else if (okVis) {
      setAvisoOk(okVis === 1 ? 'Asignada 1 visita.' : 'Asignadas ' + okVis + ' visitas.');
    }
  }

  async function descartar() {
    if (!borrador.items.length) return;
    const ok = await appConfirm('Se quitan ' + (resumen.total === 1 ? 'el cambio' : 'los ' + resumen.total + ' cambios') +
      ' de esta semana que aún no se asignaron.', { titulo: 'Descartar el borrador', btnOk: 'Descartar', btnCancel: 'Cancelar' });
    if (ok) setBorrador(borradorVacio(lunes));
  }

  // ── Proponer: llena lo que falta de la meta con lo más urgente ──
  function proponer() {
    if (cerrado) { avisar(cerrado); return; }
    const ocupados = {};
    inspVisitas.forEach(n => {
      const c = delDia(n);
      ocupados[n] = { n: c.total || 0, barrios: (c.items || []).map(it => String(it.f['BARRIO/VEREDA'] || it.f['BARRIO'] || '')) };
    });
    const elegibles = inspVisitas.filter(n => !choqueZonaDia(datosEf, n, dia.date));
    const nuevos = proponerDiaAgenda(visitasLista, ocupados, elegibles, meta);
    if (!nuevos.length) {
      setAvisoOk(visitasLista.length ? 'Los visitadores ya tienen su meta de este día.' : 'No quedan visitas por agendar en esta zona.');
      return;
    }
    setBorrador(b => nuevos.reduce((acc, x) =>
      borradorAgregar(acc, { tipo: 'visita', fila: x.fila, radicado: x.radicado, inspector: x.inspector, fecha: dia.fecha }), b));
  }

  // ── Arrastrar (solo escritorio) ──
  // Un caso de la lista → al día de un visitador. Algo del día → a otro
  // visitador (su bloque) o a otro día (la tira), con el mismo visitador.
  const conPuntero = _asConPuntero();
  const sePuedeArrastrar = it => {
    if (!conPuntero) return false;
    if (!esAdmin && it.tipo !== 'insp') return false;
    if (it.nueva) return true;
    return _normEstadoVisitaBD(it.f['ESTADO VISITA'] || '') === 'ASIGNADO';
  };
  function soltar(k, insp) {
    const a = arrastre.current && arrastre.current.it;
    arrastre.current = null;
    setDropCelda(null);
    setDropIns(null);
    if (!a) return;
    const d = semana.dias[k];
    if (!d.habil || d.date < hoy0) return;
    const f = a.f;
    const esInsp = esInspeccionLugar(f);
    const filaB = _asFilaBorrador(f);
    const item = borrador.items.find(x => x.fila === filaB) || null;
    const actualIns = primerVisitador(visitadoresBD(f));
    if (formatearFecha(f['FECHA ASIGNACION VISITA'] || '') === d.fecha && actualIns === insp) return;
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
  // Soltar sobre el bloque de un visitador del día elegido.
  function soltarEnVisitador(n) {
    const a = arrastre.current;
    if (a && a.cand) { arrastre.current = null; setDropIns(null); agregarVisita(a.cand, n); return; }
    soltar(diaSel, n);
  }
  // ── Cambiar la hora de una inspección del día elegido (tocar su hora) ──
  // Mismo día y mismo inspector: va como reprogramar (mover con hora). Si
  // queda igual que en BD, el cambio sale del borrador.
  const puedeCambiarHora = it => it.tipo === 'insp' && !cerrado &&
    (it.nueva || _normEstadoVisitaBD(it.f['ESTADO VISITA'] || '') === 'ASIGNADO');
  function cambiarHora(it, insp, h) {
    setHoraDe(null);
    const f = it.f;
    const filaB = _asFilaBorrador(f);
    const item = borrador.items.find(x => x.fila === filaB) || null;
    const orig = filaDeDatos(filaB);
    const igualBD = x => !!orig && esInspeccionLugar(orig) && formatearFecha(orig['FECHA ASIGNACION VISITA'] || '') === x.fecha &&
      primerVisitador(visitadoresBD(orig)) === x.inspector && horaAudienciasMin(horaProgramadaDe(orig)) === horaAudienciasMin(x.hora);
    if (item) {
      const nuevo = Object.assign({}, item, { hora: h });
      setBorrador(b => (item.tipo === 'mover' && igualBD(nuevo) ? borradorQuitar(b, filaB) : borradorAgregar(b, nuevo)));
      return;
    }
    if (horaAudienciasMin(horaProgramadaDe(f)) === horaAudienciasMin(h)) return;
    setBorrador(b => borradorAgregar(b, { tipo: 'mover', fila: f._idx, radicado: String(f['RADICADO'] || '').trim(),
      inspector: insp, fecha: dia.fecha, hora: h, programadaConocida: _asProgramadaConocida(orig) }));
  }

  const partesResumen = [];
  if (resumen.visitas) partesResumen.push(resumen.visitas === 1 ? '1 visita' : resumen.visitas + ' visitas');
  if (resumen.inspecciones) partesResumen.push(resumen.inspecciones === 1 ? '1 inspección' : resumen.inspecciones + ' inspecciones');
  if (resumen.reprogramadas) partesResumen.push(resumen.reprogramadas === 1 ? '1 inspección reprogramada' : resumen.reprogramadas + ' inspecciones reprogramadas');
  if (resumen.movidas) partesResumen.push(resumen.movidas === 1 ? '1 cambio de día' : resumen.movidas + ' cambios de día');
  const textoResumen = partesResumen.length > 1
    ? partesResumen.slice(0, -1).join(', ') + ' y ' + partesResumen[partesResumen.length - 1] : partesResumen[0];

  // ── La lista de visitas: filtro de comuna (zonas de varias) y orden ──
  const comunasZona = COMUNAS_ZONA_EQUIPO[dia.zona] || [];
  const visitasLista = com ? pa.visitas.filter(v => claveComunaAgenda(v.comuna) === com) : pa.visitas;
  const conDragDia = it => (sePuedeArrastrar(it)
    ? e => { arrastre.current = { it }; try { e.dataTransfer.effectAllowed = 'move'; } catch (er) { /* sin dataTransfer */ } }
    : null);
  const finArrastre = () => { arrastre.current = null; setDropCelda(null); setDropIns(null); };
  const cabeceraCols = (
    <div className="as-cols" aria-hidden="true">
      <span>Dirección</span><span>Barrio</span><span>Urgencia</span><span>Radicado</span><span>Agregar al día de</span>
    </div>
  );

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

      {/* La semana en una tira: zona, cupos libres del día (meta × visitadores,
          cuentan visitas e inspecciones; es meta, no tope) y horas de inspección.
          Con cupo: cifra grande y cuadros vacíos; sin cupo: apagado. */}
      <div className="as-tira" role="group" aria-label="Día de la semana">
        {semana.dias.map((d, k) => {
          const cu = cuposDiaEquipo(semana, k, inspVisitas, meta);
          const usadosVis = Math.min(cu.usados, cu.total);
          const esHoy = d.date.getTime() === hoy0.getTime();
          const horasInsp = semana.filas.reduce((acc, fi) => acc.concat((fi.dias[k].items || []).filter(it => it.tipo === 'insp').map(it => it.hora)), [])
            .sort((a, b) => horaAudienciasMin(a) - horaAudienciasMin(b)).map(horaCortaInspeccion);
          const txt = !d.habil ? 'Festivo'
            : cu.libres > 0 ? <><b>{cu.libres}</b> {cu.libres === 1 ? 'cupo libre' : 'cupos libres'}</>
            : cu.libres === 0 ? 'Sin cupos' : 'Sin cupos · ' + cu.usados + ' de ' + cu.total;
          const clave = 'd' + k;
          return (
            <button key={d.fecha} type="button"
              className={'as-dia' + (d.habil && cu.libres > 0 ? ' con-cupo' : ' lleno') + (dropCelda === clave ? ' as-drop' : '')}
              aria-pressed={k === diaSel} aria-current={esHoy ? 'date' : undefined} disabled={!d.habil} onClick={() => setDiaSel(k)}
              onDragOver={conPuntero ? e => { const a = arrastre.current; if (a && a.it && d.habil && d.date >= hoy0) { e.preventDefault(); if (dropCelda !== clave) setDropCelda(clave); } } : undefined}
              onDragLeave={conPuntero ? e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropCelda(x => (x === clave ? null : x)); } : undefined}
              onDrop={conPuntero ? e => { e.preventDefault(); const a = arrastre.current; if (a && a.it) soltar(k, primerVisitador(visitadoresBD(a.it.f))); } : undefined}>
              <span className="as-dia-1"><b>{AS_DIAS[d.date.getDay()]} {d.date.getDate()}</b>{esHoy && <span className="as-hoy-tag">Hoy</span>}</span>
              <span className="as-dia-zona">{d.habil ? textoZonaDia(d.zona, false) : ''}</span>
              <span className="as-cupos">
                <span className="as-cupos-txt">{txt}</span>
                {d.habil && cu.total > 0 && (
                  <span className="as-cuadros" aria-hidden="true">
                    {Array.from({ length: cu.total }, (_, j) => <i key={j} className={j < usadosVis ? 'on' : undefined}></i>)}
                  </span>
                )}
              </span>
              {horasInsp.length > 0 && <span className="as-dia-insp">Inspección {horasInsp.join(' · ')}</span>}
            </button>
          );
        })}
      </div>

      <div className="as-cuerpo">
        <section className="as-lista" aria-labelledby="as-pa-t">
          <div className="as-lista-cab">
            <h2 id="as-pa-t">Por agendar</h2>
            <p>{AS_DIAS[dia.date.getDay()]} {dia.date.getDate()}{tituloZona ? ' · ' + tituloZona : ''}</p>
          </div>
          <div className="as-filtros">
            <div className="as-buscar">
              <Icon.Search size={16} />
              <input type="search" value={q} autoComplete="off" onChange={e => { setQ(e.target.value); setRegistrando(false); }}
                aria-label="Buscar un caso" placeholder="Radicado, orden o dirección" />
            </div>
            {esAdmin && q.trim().length < 3 && comunasZona.length > 1 && (
              <div className="as-seg" role="group" aria-label="Comuna">
                {[''].concat(comunasZona).map(c => (
                  <button key={c || 'todas'} type="button" aria-pressed={com === c} onClick={() => setCom(c)}>{c ? 'C' + c : 'Todas'}</button>
                ))}
              </div>
            )}
            {esAdmin && q.trim().length < 3 && (
              <div className="as-seg" role="group" aria-label="Orden">
                <button type="button" aria-pressed={orden === 'urg'} onClick={() => setOrden('urg')}>Más urgente</button>
                <button type="button" aria-pressed={orden === 'barrio'} onClick={() => setOrden('barrio')}>Por barrio</button>
              </div>
            )}
          </div>
          <div className="as-lista-cuerpo">
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
                      onRegistrado={rad => { setRegistrando(false); invalidarCache('visitas'); cargar(true);
                        setAvisoOk('Radicado ' + (rad || qRad) + ' registrado. Ya puedes agendarlo.'); }}
                      onRecargar={() => { setRegistrando(false); invalidarCache('visitas'); cargar(true); }} />
                  </div>
                )}
              </>
            ) : (
              <>
                {pa.inspecciones.length > 0 && (
                  <>
                    <h3 className="as-grupo">Inspecciones por programar <span>{pa.inspecciones.length} · decretadas en Audiencias</span></h3>
                    {pa.inspecciones.map(b => filaInspeccion(b))}
                  </>
                )}
                {esAdmin ? (
                  <>
                    <h3 className="as-grupo">Visitas <span>{visitasLista.length === pa.visitas.length ? pa.visitas.length : visitasLista.length + ' de ' + pa.visitas.length}</span></h3>
                    {!visitasLista.length ? (
                      <p className="as-vacio">{pa.visitas.length ? 'Ninguna visita en esa comuna.' : 'No quedan visitas por agendar en esta zona. Busca otro caso arriba si hace falta.'}</p>
                    ) : orden === 'urg' ? (
                      <>{cabeceraCols}{visitasLista.map(v => filaVisita(v, null))}</>
                    ) : agruparPorBarrioAgenda(visitasLista).map(g => {
                      const van = inspVisitas.filter(n => (delDia(n).items || []).some(it =>
                        String(it.f['BARRIO/VEREDA'] || it.f['BARRIO'] || '').trim().toUpperCase() === g.barrio.toUpperCase())).map(nombrePila);
                      return (
                        <React.Fragment key={'b' + g.barrio}>
                          <h4 className="as-barrio">{g.barrio} <span>{g.visitas.length}{g.visitas.length === 1 ? ' caso' : ' casos'}
                            {van.length ? ' · ' + van.join(' y ') + ' ya va a este barrio' : ''}</span></h4>
                          {g.visitas.map(v => filaVisita(v, null))}
                        </React.Fragment>
                      );
                    })}
                    {visitasLista.length > 0 && conPuntero && (
                      <p className="as-pie-lista">Arrastra un caso al visitador, o toca su botón.</p>
                    )}
                  </>
                ) : !pa.inspecciones.length && (
                  <p className="as-vacio">No hay inspecciones decretadas sin hora en esta zona. Busca un caso arriba para programarlo.</p>
                )}
              </>
            )}
          </div>
        </section>

        {/* El día: un bloque por inspector que se va llenando; al pie, el
            borrador con «Asignar» (el único botón lleno de la pantalla). */}
        <aside className="as-dia-panel" aria-labelledby="as-dia-t" ref={panelRef}>
          <div className="as-dia-cab">
            <h2 id="as-dia-t">El día</h2>
            <p>{AS_DIAS[dia.date.getDay()]} {dia.date.getDate()}</p>
            {esAdmin && (
              <button type="button" className="as-btn-t" onClick={proponer}
                title="Llena lo que falta de la meta con lo más urgente, por barrio">Proponer</button>
            )}
          </div>
          <div className="as-insps">
            {/* Solo los visitadores de la agenda (⚙ Reglas: Alejandro y Mauricio).
                Otro inspector sale solo si ya tiene algo ese día, para que nada
                agendado quede sin verse. */}
            {inspectores.filter(n => inspVisitas.indexOf(n) >= 0 || (delDia(n).items || []).length > 0).map(n => {
              const c = delDia(n);
              const recibe = inspVisitas.indexOf(n) >= 0;
              const nuevas = (c.items || []).filter(it => it.nueva).length;
              const pasa = recibe && c.total > meta;
              return (
                <div key={n} className={'as-ins' + (dropIns === n ? ' as-drop' : '')} style={{ '--c': colorDe(n) }}
                  onDragOver={conPuntero ? e => { if (arrastre.current && !cerrado) { e.preventDefault(); if (dropIns !== n) setDropIns(n); } } : undefined}
                  onDragLeave={conPuntero ? e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropIns(x => (x === n ? null : x)); } : undefined}
                  onDrop={conPuntero ? e => { e.preventDefault(); soltarEnVisitador(n); } : undefined}>
                  <div className="as-ins-cab">
                    <span className="as-ini" aria-hidden="true">{inicialesInsp(n)}</span>
                    <b title={n}>{nombrePila(n)}</b>
                    <span className={'as-cuenta' + (pasa ? ' as-pasa' : '')}>
                      <b>{c.total}</b>{recibe ? ' de ' + meta : ''}{pasa ? ' · pasa la meta' : nuevas ? ' · ' + nuevas + (nuevas === 1 ? ' nueva' : ' nuevas') : ''}
                    </span>
                  </div>
                  {(c.items || []).length ? c.items.map((it, j) => (
                    <AsItem key={it.f && it.f._idx != null ? it.f._idx : 'i' + j} it={it} detallado={true} resaltada={resaltada}
                      onQuitar={it.nueva ? () => quitar(_asFilaBorrador(it.f)) : null}
                      expediente={it.nueva && esNuevaConExp(it) ? expedienteBorrador(_asFilaBorrador(it.f)) : null}
                      onExpediente={it.nueva && esNuevaConExp(it) ? v => cambiarExpediente(_asFilaBorrador(it.f), v) : null}
                      horaAbierta={horaDe != null && it.f && horaDe === it.f._idx}
                      onAbrirHora={puedeCambiarHora(it) ? () => setHoraDe(h => (h === it.f._idx ? null : it.f._idx)) : null}
                      horas={horaDe != null && it.f && horaDe === it.f._idx
                        ? _asHorasLibres(datosEf, n, dia.date, _asFilaBorrador(it.f)) : null}
                      onHora={h => cambiarHora(it, n, h)}
                      onArrastrar={conDragDia(it)} onFinArrastre={finArrastre} />
                  )) : <p className="as-libre">Libre</p>}
                </div>
              );
            })}
          </div>
          <div className="as-pie" role="region" aria-label="Borrador de la semana">
            <div className="as-pie-txt" aria-live="polite">
              <b>{resumen.total ? 'Borrador: ' + textoResumen : 'Sin cambios'}</b>
              <small>{resumen.total ? 'Nada se escribe hasta asignar.' : 'Agrega casos desde la lista.'}</small>
            </div>
            {resumen.total > 0 && (
              <button type="button" className="as-btn-txt" onClick={descartar} disabled={asignando}>Descartar</button>
            )}
            <button type="button" className="as-btn-llena" onClick={asignar} disabled={!resumen.total || asignando}
              aria-busy={asignando || undefined}>
              {asignando ? 'Asignando…' : resumen.total ? 'Asignar ' + resumen.total : 'Asignar'}
            </button>
          </div>
        </aside>
      </div>

      {avisoOk && <div className="as-ok" role="status">{avisoOk}</div>}

      {/* Inspecciones programadas: una ficha por inspección con caso, fecha
          (con año, para no equivocarse al citar) y hora. */}
      {confirmadas && ReactDOM.createPortal(
        <div className="as-velo" onClick={e => { if (e.target === e.currentTarget) cerrarConfirmacion(); }}>
          <div className="as-dlg" role="dialog" aria-modal="true" aria-labelledby="as-dlg-t">
            <h2 id="as-dlg-t">{confirmadas.inspecciones.length === 1 ? 'Inspección programada' : confirmadas.inspecciones.length + ' inspecciones programadas'}</h2>
            <p>Quedó en la agenda del inspector. Cita a las partes con estos datos.</p>
            {confirmadas.inspecciones.map(x => (
              <div key={x.fila} className="as-ficha">
                <div className="as-ficha-cuando"><b>{fechaLargaConAnio(x.fecha)}</b><span>{horaLargaInspeccion(x.hora)}</span></div>
                <dl>
                  <dt>Caso</dt><dd>{x.radicado}{x.expediente ? ' · Exp. ' + x.expediente : ''}</dd>
                  <dt>Dirección</dt><dd>{[x.dir, x.barrio, x.comuna].filter(Boolean).join(' · ')}</dd>
                  <dt>Inspector</dt><dd>{titleCaseNombre(x.inspector)}</dd>
                </dl>
              </div>
            ))}
            {confirmadas.visitas > 0 && (
              <p className="as-dlg-otros">Además se {confirmadas.visitas === 1 ? 'asignó 1 visita.' : 'asignaron ' + confirmadas.visitas + ' visitas.'}</p>
            )}
            <div className="as-dlg-acc">
              <button type="button" className="as-btn-llena" ref={listoRef} onClick={cerrarConfirmacion}>Listo</button>
            </div>
          </div>
        </div>,
        document.body)}
    </div>
  );
}

// Un item de la celda: inspección (lleva hora) o visita. Detallado en el
// día elegido (hora · dirección · caso); compacto, solo la hora de la
// inspección. Tocarlo abre la visita (como la tarjeta de Inspecciones).
// onAbrirHora (inspección que se puede reprogramar): la hora es un botón que
// despliega sus horas libres (horas) dentro del item; onHora elige una.
function AsItem({ it, detallado, resaltada, onQuitar, onArrastrar, onFinArrastre, expediente, onExpediente,
  horaAbierta, onAbrirHora, horas, onHora }) {
  const f = it.f;
  const dir = _asDir(f);
  const sub = _asSub(it);
  const hora = it.tipo === 'insp' ? horaCortaInspeccion(it.hora) : '';
  const clase = 'as-it as-it-' + it.tipo + (it.nueva ? ' as-it-nueva' : '') +
    (resaltada != null && f && f._idx === resaltada ? ' as-it-resaltada' : '');
  const title = dir + ' — ' + sub;
  const label = (hora ? hora + ', ' : '') + sub + ', ' + dir;
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
      {onAbrirHora ? (
        <button type="button" className="as-it-h as-it-hbtn" aria-expanded={!!horaAbierta}
          aria-label={'Cambiar la hora, ahora ' + hora} title="Cambiar la hora"
          onClick={e => { e.stopPropagation(); onAbrirHora(); }} onKeyDown={e => e.stopPropagation()}>
          {hora}<Icon.Chevron size={12} />
        </button>
      ) : <span className="as-it-h">{hora}</span>}
      <span className="as-it-d">{dir}</span>
      {onQuitar ? (
        <button type="button" className="as-quitar" aria-label={'Quitar ' + dir + ' del borrador'}
          onClick={e => { e.stopPropagation(); onQuitar(); }} onKeyDown={e => e.stopPropagation()}>
          <Icon.Close size={14} />
        </button>
      ) : <span></span>}
      <span className="as-it-s">
        {it.nueva && <b className="as-nueva">Nueva</b>}
        {it.nueva ? ' · ' : ''}{sub}
      </span>
      {horaAbierta && horas && (
        <div className="as-horas as-it-horas" role="group" aria-label={'Hora de ' + dir}
          onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
          {horas.map(h => {
            const actual = horaAudienciasMin(h) === horaAudienciasMin(it.hora);
            return (
              <button key={h} type="button" className="as-hora" aria-pressed={actual}
                onClick={() => (actual ? onAbrirHora() : onHora(h))}>{horaCortaInspeccion(h)}</button>
            );
          })}
        </div>
      )}
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
