// ═══════════════════════════════════════════════════════════════
// v6/buscar.jsx — Pantalla Buscar / Visitas (fusionadas como en V5)
//   - Búsqueda libre (radicado / orden de policía / dirección / barrio)
//   - Filtros estado (multi)
//   - Filtros comuna (dinámicos)
//   - Filtro visitador (solo ADMIN)
//   - Filtro rural ("Vda.")
//   - Lista agrupada por radicado
// ═══════════════════════════════════════════════════════════════
const { useState: useStateB, useEffect: useEffectB, useMemo: useMemoB, useCallback: useCallbackB, useRef: useRefB } = React;

// Mapeo estado → tono de chip (clases de styles.css)
const ESTADO_CLASE = {
  PENDIENTE:  'activo-pendiente',
  ASIGNADO:   'activo-iniciado',
  INICIADO:   'activo-iniciado',
  COMPLETADO: 'activo-completado',
};

const ESTADOS_BUSCAR = ['PENDIENTE', 'ASIGNADO', 'INICIADO', 'COMPLETADO'];
const ESTADO_LABEL = {
  PENDIENTE: 'Pendientes', ASIGNADO: 'Asignadas',
  INICIADO: 'Iniciadas', COMPLETADO: 'Completadas',
};

// Antigüedad del radicado — es el criterio con el que se prioriza y hasta
// ahora no se podía filtrar por él. Selección única: son rangos, no suman.
const ANTIGUEDADES = [
  { val: 'hoy', l: 'Hoy',     dias: 0 },
  { val: '7',   l: '7 días',  dias: 7 },
  { val: '30',  l: '30 días', dias: 30 },
  { val: '90',  l: '3 meses', dias: 90 },
  { val: '365', l: '>1 año',  dias: 365, mas: true },
];

// Compara por día, no por milisegundo. Una fila sin FECHA RADICADO parseable
// no pasa ningún filtro activo. Una fecha futura (error de captura en el
// gestor documental) cuenta como 0 días en vez de desaparecer de la lista.
function _pasaAntiguedad(f, val) {
  if (!val) return true;
  const op = ANTIGUEDADES.find(a => a.val === val);
  if (!op) return true;
  const d = parsearFecha(f['FECHA RADICADO'] || '');
  if (!d) return false;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const rad = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dias = Math.max(0, Math.round((hoy - rad) / 86400000));
  return op.mas ? dias > op.dias : dias <= op.dias;
}

const ORDENES = [
  { val: 'rad-desc', l: 'Radicado ↓' },
  { val: 'rad-asc',  l: 'Radicado ↑' },
  { val: 'edit',     l: 'Última edición' },
  { val: 'dir',      l: 'Dirección' },
];

// El orden se aplica a los GRUPOS, no a las filas sueltas: la lista pagina
// por grupo (limite). Para "edit" y "dir" manda la primera fila del grupo.
// "Sin radicado" queda siempre al final, ordene como ordene.
function _ordenarGrupos(entries, orden) {
  const _dir  = ([, fs]) => (fs[0]['DIRECCION INFRACCION'] || fs[0]['DIRECCION'] || '').toString();
  const _edit = ([, fs]) => {
    const t = Date.parse(fs[0]['ULTIMA_MODIFICACION'] || '');
    return isNaN(t) ? 0 : t;
  };
  return entries.slice().sort((a, b) => {
    const aSin = a[0] === 'Sin radicado', bSin = b[0] === 'Sin radicado';
    if (aSin !== bSin) return aSin ? 1 : -1;
    switch (orden) {
      case 'rad-asc': return a[0].localeCompare(b[0], 'es', { numeric: true });
      case 'edit':    return _edit(b) - _edit(a);
      case 'dir':     return _dir(a).localeCompare(_dir(b), 'es', { sensitivity: 'base' });
      default:        return b[0].localeCompare(a[0], 'es', { numeric: true });
    }
  });
}

// Los filtros sobreviven a abrir una visita: BuscarScreen se desmonta al
// navegar al formulario (app.jsx, render condicional) y el admin volvía con
// la búsqueda en blanco. sessionStorage lanza en modo privado — try/catch.
const BUSCAR_PREFS_KEY = 'cu_buscar_v1';
function _leerPrefsBuscar() {
  try { return JSON.parse(sessionStorage.getItem(BUSCAR_PREFS_KEY)) || {}; }
  catch (e) { return {}; }
}

function BuscarScreen({ usuario, onContinuar }) {
  const [datos, setDatos]     = useStateB([]);
  const [cargando, setCargando] = useStateB(true);
  const [error, setError]     = useStateB('');

  // Paginación incremental
  const LIMITE_INICIAL = 50;
  const LIMITE_PASO    = 50;

  // Filtros restaurados de sessionStorage en el initializer perezoso, no en
  // un useEffect: así no hay un primer render con la búsqueda en blanco.
  const prefs0 = useStateB(_leerPrefsBuscar)[0];

  // qInput = lo que el inspector tipea en cada keystroke (binding del input)
  // q      = lo que efectivamente se aplica al filtro (debounce de 300ms)
  // Separarlos evita re-renderizar la lista entera en cada tecla.
  const [qInput, setQInput] = useStateB(prefs0.q || '');
  const [q, setQ]           = useStateB(prefs0.q || '');
  const [filtrosEstado, setFiltrosEstado] = useStateB(prefs0.filtrosEstado || []);
  const [filtroComunas, setFiltroComunas] = useStateB(prefs0.filtroComunas || []);
  const [filtrosVisitador, setFiltrosVisitador] = useStateB(prefs0.filtrosVisitador || []);
  const [filtroRural, setFiltroRural] = useStateB(!!prefs0.filtroRural);
  const [filtroAntiguedad, setFiltroAntiguedad] = useStateB(prefs0.filtroAntiguedad || '');
  const [orden, setOrden] = useStateB(prefs0.orden || 'rad-desc');
  // Lista de visitadores activos (chips de filtro admin). Se carga desde
  // USUARIOS vía endpoint público — sin nombres hardcoded en el bundle.
  const [visitadores, setVisitadores] = useStateB([]);
  const [limite, setLimite] = useStateB(prefs0.limite || LIMITE_INICIAL);
  const inputBuscarRef = useRefB(null);

  const esAdmin = usuario.rol === 'ADMIN';

  // ── Estado para acciones de gestión admin ──
  const [inspectores, setInspectores] = useStateB([]);
  const [busyFila, setBusyFila] = useStateB(null);       // _idx de fila en proceso
  const [asignandoFila, setAsignandoFila] = useStateB(null); // _idx de fila con panel abierto

  useEffectB(() => { cargar(); }, []);

  // Cargar lista de visitadores activos (filtro admin) desde USUARIOS.
  // listarInspectoresActivos() está cacheado en api.js (TTL 60s).
  // Antes los chips se filtraban contra tres nombres escritos a mano
  // (Alejandro, Mauricio, Daniel): un inspector nuevo dado de alta en
  // USUARIOS nunca aparecía como filtro. Ahora se muestran todos los activos,
  // que es la misma lista que alimenta el panel de asignación.
  useEffectB(() => {
    if (!esAdmin) return;
    listarInspectoresActivos().then(lista => {
      const todos = lista || [];
      setVisitadores(todos.map(u => ({ val: u.nombre, l: titleCaseNombre(u.nombre) })));
      setInspectores(todos);
    }).catch(() => {});
  }, [esAdmin]);

  // forzar=true salta el caché (botón "Recargar"). Al primer mount reusa caché.
  // Declarada ANTES de las acciones admin de abajo: sus useCallback dependen
  // de `cargar` en el array de deps, y siendo const, referenciarla antes de
  // su propia declaración revienta con "Cannot access before initialization".
  const cargar = useCallbackB(async (forzar, silencioso) => {
    if (!silencioso) { setCargando(true); setError(''); }
    try {
      const { datos: all } = await leerVisitas(forzar ? { forzar: true } : undefined);
      const mios = esAdmin ? all : all.filter(f => {
        const vis = visitadoresBD(f).toUpperCase();
        const est = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
        return vis.includes(usuario.usuario.toUpperCase()) || est === 'PENDIENTE' || est === 'COMPLETADO';
      });
      setDatos(mios);
    } catch (e) { if (!silencioso) setError(e.message); }
    setCargando(false);
  }, [esAdmin, usuario]);

  // Re-pinta sin spinner cuando la actualización en segundo plano trae cambios.
  useEffectB(() => suscribirVisitas(() => cargar(false, true)), [cargar]);

  // ── Acciones admin: asignar, desasignar, completar ──
  // useCallback: GrupoRadicado/FilaVisita están memoizados con React.memo
  // más abajo — sin esto, cada re-render de BuscarScreen (ej. un keystroke
  // en otro filtro) les pasaba callbacks con identidad nueva y anulaba el memo.
  const adminAsignar = useCallbackB(async (fila, inspector, f) => {
    // Relevar una visita INICIADA no es lo mismo que asignar una pendiente:
    // el backend conserva el estado, pero por la regla del diligenciador el
    // inspector anterior deja de verla, y su borrador local (localStorage)
    // no viaja — lo que no haya guardado se queda en su dispositivo.
    const estActual = normalizarEstado(f ? (f['ESTADO VISITA'] || f[13] || '') : '');
    if (estActual === 'INICIADO') {
      const actual = primerVisitador(visitadoresBD(f));
      const ok = await appConfirm(
        'Esta visita está INICIADA' + (actual ? ' por ' + actual : '') + '.\n\n' +
        'Al pasarla a ' + inspector + ' conserva el estado y todo lo guardado en BD, ' +
        'pero ' + (actual || 'el inspector actual') + ' dejará de verla y se perderá lo que ' +
        'aún no haya guardado en su dispositivo.',
        { titulo: 'Reasignar visita iniciada', btnOk: 'Reasignar', peligro: true }
      );
      if (!ok) return;
    }
    setBusyFila(fila);
    try {
      await gasPost({
        accion: 'asignarRadicado', fila, inspector,
        fechaAsignacion: hoyDDMMAAAA(),
      });
      invalidarCache('visitas');
      setAsignandoFila(null);
      await cargar(true);
    } catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
    setBusyFila(null);
  }, [cargar]);

  // Crea una fila nueva en BD clonando los datos fijos del radicado y
  // dejándola ASIGNADA al inspector elegido. Útil para asignar una segunda
  // visita a un radicado ya COMPLETADO.
  const adminAsignarNuevaVisita = useCallbackB(async (filaOrigen, inspector) => {
    setBusyFila(filaOrigen);
    try {
      const r = await gasPost({
        accion: 'crearNuevaVisitaAsignada',
        fila: filaOrigen, inspector,
      });
      if (r && r.ok === false) throw new Error(r.error || 'Error desconocido');
      invalidarCache('visitas');
      setAsignandoFila(null);
      await cargar(true);
      await appAlert('Visita N°' + (r.nVisita || '?') + ' creada y asignada a ' + inspector + '.',
        { tono: 'exito', titulo: 'Nueva visita asignada' });
    } catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
    setBusyFila(null);
  }, [cargar]);

  const adminDesasignar = useCallbackB(async (fila, rad) => {
    const ok = await appConfirm(
      '¿Quitar asignación de ' + (rad || 'este radicado') + '?\nVolverá a estado PENDIENTE.',
      { titulo: 'Desasignar', btnOk: 'Desasignar', peligro: true }
    );
    if (!ok) return;
    setBusyFila(fila);
    try {
      await gasPost({ accion: 'desasignarRadicado', fila });
      invalidarCache('visitas');
      await cargar(true);
    } catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
    setBusyFila(null);
  }, [cargar]);

  const adminCompletar = useCallbackB(async (fila, fechaAsig) => {
    // Paridad V2: si la visita tiene orden de suspensión preventiva
    // (SUSPENSION=SI + N° ORDEN DE POLICIA) y NO tiene oficio de vigilancia
    // generado aún, ofrecer generarlo antes de completar.
    const f = datos.find(x => x._idx === fila);
    const suspSi = f && (f['SUSPENSION DE LA OBRA'] || '').toString().trim().toUpperCase() === 'SI';
    const tieneOrden = f && (f['N° ORDEN DE POLICIA'] || f['N ORDEN DE POLICIA'] || '').toString().trim();
    const sinOficio = f && !(f['LINK_SOLICITUD_VIGILANCIA'] || '').toString().trim();
    const requiereVigilancia = !!(f && suspSi && tieneOrden && sinOficio);

    if (requiereVigilancia) {
      const generar = await appConfirm(
        'Esta visita tiene orden de suspensión preventiva y aún no se ha generado el oficio de Vigilancia Policía.\n\n¿Generar el oficio antes de completar?',
        { tono: 'aviso', titulo: 'Solicitud de vigilancia pendiente', btnOk: 'Generar oficio', btnCancel: 'Completar sin oficio' }
      );
      if (generar) {
        setBusyFila(fila);
        try {
          const idCarpeta = extraerIdCarpetaDrive(f['LINK_DRIVE'] || '');
          if (!idCarpeta) {
            await appAlert('La visita no tiene carpeta de Drive asociada.', { tono: 'aviso', titulo: 'Sin carpeta' });
            setBusyFila(null);
            return;
          }
          await generarSolicitudVigilancia({
            fila: f._idx,
            idCarpetaVisita: idCarpeta,
            radicado:        f['RADICADO'] || '',
            fechaVisita:     f['FECHA DE VISITA'] || '',
            nOrdenPolicia:   f['N° ORDEN DE POLICIA'] || f['N ORDEN DE POLICIA'] || '',
            direccion:       f['DIRECCION INFRACCION'] || f['DIRECCION'] || '',
            barrio:          f['BARRIO/VEREDA'] || f['BARRIO'] || '',
          });
          // Con la orden ya escaneada, deja armado el PDF único para la
          // policía (solicitud + orden). Sin orden todavía no arma nada.
          await armarSolicitudUnificada(f._idx, idCarpeta);
        } catch (e) {
          await appAlert('Error generando oficio: ' + e.message + '\n\nLa visita NO se marcó como completada.', { tono: 'error', titulo: 'Error' });
          setBusyFila(null);
          return;
        }
        setBusyFila(null);
      }
    }

    const ok = await appConfirm('¿Marcar como COMPLETADO?', {
      tono: 'info', titulo: 'Completar visita', btnOk: 'Completar',
    });
    if (!ok) return;
    setBusyFila(fila);
    try {
      const dias = fechaAsig ? diasDesde(fechaAsig) : '';
      await gasPost({
        accion: 'completarRegistro', fila,
        dias: dias || '',
        fecha: hoyDDMMAAAA(),
      });
      // PDF del acta al cierre (best-effort): sin esto, LINK_PDF_ACTA nunca
      // se poblaba y el botón "Acta" abría el Sheet en vez del PDF.
      if (f && (f['LINK_XLSX_ACTA'] || '').trim() && !(f['LINK_PDF_ACTA'] || '').trim()) {
        generarPdfActaDesdeSheet(
          f._idx,
          f['LINK_XLSX_ACTA'],
          f['RADICADO'] || '',
          extraerIdCarpetaDrive(f['LINK_DRIVE'] || '')
        ).catch(e => console.warn('[completar] pdf acta best-effort:', e.message));
      }
      invalidarCache('visitas');
      await cargar(true);
    } catch (e) { await appAlert('Error: ' + e.message, { tono: 'error', titulo: 'Error' }); }
    setBusyFila(null);
  }, [cargar, datos]);

  // Debounce 300ms: sincroniza qInput → q sin gatillar refiltros por keystroke.
  useEffectB(() => {
    const id = setTimeout(() => setQ(qInput), 300);
    return () => clearTimeout(id);
  }, [qInput]);

  // Resetea la paginación cuando cambia el texto efectivo o cualquier filtro.
  useEffectB(() => { setLimite(LIMITE_INICIAL); },
    [q, filtrosEstado, filtroComunas, filtrosVisitador, filtroRural, filtroAntiguedad]);

  // Persiste filtros + orden + paginación para el regreso desde el formulario.
  useEffectB(() => {
    try {
      sessionStorage.setItem(BUSCAR_PREFS_KEY, JSON.stringify({
        q, filtrosEstado, filtroComunas, filtrosVisitador,
        filtroRural, filtroAntiguedad, orden, limite,
      }));
    } catch (e) { /* modo privado: la búsqueda simplemente no sobrevive */ }
  }, [q, filtrosEstado, filtroComunas, filtrosVisitador, filtroRural, filtroAntiguedad, orden, limite]);

  // "/" enfoca el buscador, Esc lo limpia. Se ignora mientras se escribe en
  // cualquier otro campo (el "/" es carácter válido en una dirección).
  useEffectB(() => {
    function onKey(e) {
      const t = e.target;
      const escribiendo = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === '/' && !escribiendo) {
        e.preventDefault();
        inputBuscarRef.current && inputBuscarRef.current.focus();
      } else if (e.key === 'Escape' && t === inputBuscarRef.current) {
        setQInput(''); setQ('');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Escucha cuando el generador F-GGO-43 (pestaña hija) sube
  //    el informe a Drive y registra el link en BD. Refresca lista.
  useEffectB(() => {
    function onMsg(ev) {
      if (ev.origin !== window.location.origin) return; // el iframe/pestaña hija es same-origin (informe/index.html)
      var m = ev && ev.data;
      if (m && m.tipo === 'informe-f43-subido' && m.link) {
        setDatos(prev => prev.map(r =>
          r._idx === parseInt(m.fila, 10)
            ? { ...r, 'LINK_DOCX_INFORME': m.link }
            : r
        ));
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Comunas únicas presentes en los datos cargados
  const comunas = useMemoB(() => {
    const s = new Set();
    datos.forEach(f => {
      const c = (f['COMUNA'] || f[5] || '').toString().trim();
      if (c && !isNaN(c)) s.add(c);
    });
    return [...s].sort((a, b) => Number(a) - Number(b));
  }, [datos]);

  // Filtros combinados, en DOS pasos a propósito.
  //
  // filtradosSinEstado aplica todo menos el estado; sobre él se cuentan los
  // cuatro chips. Así el conteo de cada estado respeta texto, comuna,
  // visitador, rural y antigüedad, pero IGNORA la selección de estado — que es
  // su propia dimensión. Consecuencia buscada: activar "Pendientes" no deja
  // los otros tres chips en 0, sigue diciendo cuántas verías si los tocas
  // (convención de facetas de GitHub/Linear). Filtrar por C3 sí mueve los cuatro.
  const filtradosSinEstado = useMemoB(() => {
    const lq = q.trim().toUpperCase();
    // La orden se compara además sin ceros a la izquierda en cada tramo
    // numérico: en BD va "2026-09-015" y el inspector suele teclear
    // "2026-9-15" o "15", tal como la escribió en el papel.
    const _sinCeros = s => s.replace(/\d+/g, n => String(parseInt(n, 10)));
    const lqOrden = _sinCeros(lq);
    return datos.filter(f => {
      if (lq) {
        const orden = ordenPoliciaDe(f).toUpperCase();
        const hay = ['RADICADO', 'DIRECCION INFRACCION', 'DIRECCION', 'BARRIO/VEREDA', 'BARRIO', 'NOMBRE PERSONA ATIENDE']
          .some(k => (f[k] || '').toString().toUpperCase().includes(lq))
          || (!!orden && (orden.includes(lq) || _sinCeros(orden).includes(lqOrden)));
        if (!hay) return false;
      }
      if (filtroComunas.length) {
        const c = (f['COMUNA'] || f[5] || '').toString().trim();
        if (!filtroComunas.includes(c)) return false;
      }
      if (filtrosVisitador.length) {
        const v = visitadoresBD(f).toUpperCase();
        if (!filtrosVisitador.some(x => v.includes(x))) return false;
      }
      if (filtroRural) {
        const b = (f['BARRIO/VEREDA'] || f[4] || '').toString().trim();
        if (!b.startsWith('Vda.')) return false;
      }
      if (!_pasaAntiguedad(f, filtroAntiguedad)) return false;
      return true;
    });
  }, [datos, q, filtroComunas, filtrosVisitador, filtroRural, filtroAntiguedad]);

  // Conteo por estado sobre el universo SIN la selección de estado (ver arriba).
  const conteosEstado = useMemoB(() => {
    const c = { PENDIENTE: 0, ASIGNADO: 0, INICIADO: 0, COMPLETADO: 0 };
    filtradosSinEstado.forEach(f => {
      const e = normalizarEstado(f['ESTADO VISITA'] || f[13] || '');
      if (c[e] != null) c[e]++;
    });
    return c;
  }, [filtradosSinEstado]);

  const filtrados = useMemoB(() => {
    if (!filtrosEstado.length) return filtradosSinEstado;
    return filtradosSinEstado.filter(f =>
      filtrosEstado.includes(normalizarEstado(f['ESTADO VISITA'] || f[13] || '')));
  }, [filtradosSinEstado, filtrosEstado]);

  // Agrupar por radicado
  const grupos = useMemoB(() => {
    const g = {};
    filtrados.forEach(f => {
      let rad = (f['RADICADO'] || f[1] || '').toString().trim();
      if (!rad || rad.startsWith('LAT ') || rad.startsWith('6.') || rad.startsWith('-75') || rad.length > 60) {
        rad = 'Sin radicado';
      }
      (g[rad] = g[rad] || []).push(f);
    });
    return g;
  }, [filtrados]);

  function toggleEnArr(arr, v) {
    return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  }

  function limpiar() {
    setQInput(''); setQ(''); setFiltrosEstado([]); setFiltroComunas([]);
    setFiltrosVisitador([]); setFiltroRural(false); setFiltroAntiguedad('');
  }

  const hayFiltros = !!q || filtrosEstado.length || filtroComunas.length
    || filtrosVisitador.length || filtroRural || !!filtroAntiguedad;

  // Filtros activos como chips quitables en la cabecera de resultados: sin
  // esto el contador dice "412 de 2.014" y no hay forma de saber de qué 412
  // se habla sin volver a mirar la columna de la izquierda.
  const chipsActivos = [];
  if (q) chipsActivos.push({ k: 'q', l: '"' + q + '"', quitar: () => { setQInput(''); setQ(''); } });
  filtrosEstado.forEach(e => chipsActivos.push({
    k: 'e' + e, l: ESTADO_LABEL[e] || e,
    quitar: () => setFiltrosEstado(filtrosEstado.filter(x => x !== e)),
  }));
  filtroComunas.forEach(c => chipsActivos.push({
    k: 'c' + c, l: 'C' + c,
    quitar: () => setFiltroComunas(filtroComunas.filter(x => x !== c)),
  }));
  filtrosVisitador.forEach(v => chipsActivos.push({
    k: 'v' + v, l: titleCaseNombre(v),
    quitar: () => setFiltrosVisitador(filtrosVisitador.filter(x => x !== v)),
  }));
  if (filtroRural) chipsActivos.push({ k: 'rural', l: 'Rural', quitar: () => setFiltroRural(false) });
  if (filtroAntiguedad) {
    const op = ANTIGUEDADES.find(a => a.val === filtroAntiguedad);
    chipsActivos.push({ k: 'ant', l: op ? op.l : filtroAntiguedad, quitar: () => setFiltroAntiguedad('') });
  }

  return (
    <div className="pantalla activa pad-bottom buscar-pantalla">
      {/* Mismo nombre que la pestaña del nav: antes la pestaña decía "Buscar"
          y el título de la pantalla "Visitas". */}
      <div className="page-title titulo-fijo" style={{ marginBottom: 12 }}>Buscar</div>

      {/* Barra de búsqueda a todo el ancho, FUERA de .buscar-2col: es el
          control principal de la pantalla, no un campo más de la tarjeta de
          filtros. Fuera del grid porque un sticky dentro se ancla al scroller
          de la columna, no a la pantalla. */}
      <div className="buscar-barra">
        <div className="buscar-barra-input">
          <span className="buscar-barra-lupa" aria-hidden="true"><Icon.Search size={16} /></span>
          <input type="text" className="input-campo" ref={inputBuscarRef}
            aria-label="Buscar radicado, orden de policía, dirección, barrio o persona que atiende"
            placeholder="Radicado, orden de policía, dirección, barrio, persona que atiende...   /"
            value={qInput} onChange={e => setQInput(e.target.value)} />
          {qInput && (
            <button type="button" className="buscar-barra-x" aria-label="Limpiar búsqueda"
              onClick={() => { setQInput(''); setQ(''); }}>
              <Icon.Close size={14} />
            </button>
          )}
        </div>

        {/* Estado chips — "visita" es femenino en toda la app: Asignadas,
            no "Asignados" como decía antes. El número es el conteo facetado
            (respeta los demás filtros, ignora la selección de estado). */}
        <div className="filtros-estado" style={{ marginBottom: 0 }}>
          {ESTADOS_BUSCAR.map(est => {
            const activo = filtrosEstado.includes(est);
            return (
              <button key={est} aria-pressed={activo}
                className={'btn-filtro' + (activo ? ' ' + ESTADO_CLASE[est] : '')}
                onClick={() => setFiltrosEstado(toggleEnArr(filtrosEstado, est))}>
                {ESTADO_LABEL[est]}
                <span className="btn-filtro-num">{conteosEstado[est].toLocaleString('es-CO')}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ≥1200: filtros fijos a la izquierda (.buscar-col-izq), resultados
          con scroll a la derecha (.buscar-col-der); por debajo de 1200 los
          wrappers son divs inertes y todo va apilado como siempre. */}
      <div className="buscar-2col">
      <div className="buscar-col-izq">
      <div className="card" style={{ marginBottom: 12 }}>
        {/* Sin acordeones: a 280px los chips caben abiertos y plegarlos
            escondía el estado del filtro tras un clic. Solo Antigüedad
            conserva pliegue, por ser el último grupo. */}
        {comunas.length > 0 && (
          <div className="filtro-grupo">
            <div className="filtro-grupo-titulo">
              Comuna {filtroComunas.length > 0 && (
                <span style={{ color: 'var(--brand-accent)' }}>· {filtroComunas.length}</span>
              )}
            </div>
            <div className="filtros-comunas">
              {comunas.map(c => (
                <button key={c} aria-pressed={filtroComunas.includes(c)}
                  className={'btn-filtro' + (filtroComunas.includes(c) ? ' activo-comuna' : '')}
                  onClick={() => setFiltroComunas(toggleEnArr(filtroComunas, c))}>
                  C{c}
                </button>
              ))}
              <button aria-pressed={filtroRural}
                className={'btn-filtro' + (filtroRural ? ' activo-pendiente' : '')}
                onClick={() => setFiltroRural(!filtroRural)}>Rural</button>
            </div>
          </div>
        )}

        {/* Visitador — solo ADMIN */}
        {esAdmin && visitadores.length > 0 && (
          <div className="filtro-grupo">
            <div className="filtro-grupo-titulo">
              Visitador {filtrosVisitador.length > 0 && (
                <span style={{ color: 'var(--brand-accent)' }}>· {filtrosVisitador.length}</span>
              )}
            </div>
            <div className="filtros-estado" style={{ marginBottom: 0 }}>
              {visitadores.map(v => (
                <button key={v.val} aria-pressed={filtrosVisitador.includes(v.val)}
                  className={'btn-filtro' + (filtrosVisitador.includes(v.val) ? ' activo-iniciado' : '')}
                  onClick={() => setFiltrosVisitador(toggleEnArr(filtrosVisitador, v.val))}>
                  {v.l}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Antigüedad del radicado — selección única: son rangos, no suman. */}
        <div className="filtro-grupo">
          <div className="filtro-grupo-titulo">Antigüedad del radicado</div>
          <div className="filtros-comunas" style={{ marginBottom: 0 }}>
            {ANTIGUEDADES.map(a => (
              <button key={a.val} aria-pressed={filtroAntiguedad === a.val}
                className={'btn-filtro' + (filtroAntiguedad === a.val ? ' activo-comuna' : '')}
                onClick={() => setFiltroAntiguedad(filtroAntiguedad === a.val ? '' : a.val)}>
                {a.l}
              </button>
            ))}
          </div>
        </div>

        {hayFiltros && (
          <button className="btn-limpiar visible" style={{ marginTop: 12 }}
            onClick={limpiar}>Limpiar filtros</button>
        )}
      </div>
      </div>{/* .buscar-col-izq */}

      <div className="buscar-col-der">
      {/* Cabecera de resultados: cuántas son sobre cuántas, con qué filtros,
          en qué orden. Recargar vive aquí y no en la barra de búsqueda:
          buscar y sincronizar no son lo mismo y no deben pesar igual. */}
      {!cargando && !error && (
        <div className="buscar-resultados-head">
          <span className="buscar-conteo">
            {hayFiltros
              ? `${filtrados.length.toLocaleString('es-CO')} de ${datos.length.toLocaleString('es-CO')} visitas`
              : `${datos.length.toLocaleString('es-CO')} visitas`}
          </span>

          {chipsActivos.map(c => (
            <button key={c.k} type="button" className="chip-filtro-activo"
              onClick={c.quitar} title={'Quitar filtro ' + c.l}
              aria-label={'Quitar filtro ' + c.l}>
              {c.l}<Icon.Close size={12} />
            </button>
          ))}

          <label className="buscar-orden">
            <span className="buscar-orden-lbl">Ordenar</span>
            <select value={orden} onChange={e => setOrden(e.target.value)}
              aria-label="Ordenar resultados">
              {ORDENES.map(o => <option key={o.val} value={o.val}>{o.l}</option>)}
            </select>
          </label>

          <button type="button" className="buscar-recargar" onClick={() => cargar(true)}
            title="Recargar datos (ignora la copia local)" aria-label="Recargar datos">
            <Icon.Refresh size={16} />
          </button>
        </div>
      )}

      {/* Lista */}
      {cargando && (
        <div className="cargando"><div className="spinner"></div>Cargando registros...</div>
      )}
      {error && (
        <div className="card" style={{ color: 'var(--rojo)' }}>Error: {error}</div>
      )}
      {!cargando && !error && filtrados.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--texto-suave)', padding: 24, fontSize: 13 }}>
          No hay registros
        </div>
      )}
      {!cargando && !error && filtrados.length > 0 && (() => {
        const entries = _ordenarGrupos(Object.entries(grupos), orden);
        const totalGrupos = entries.length;
        const visibles    = entries.slice(0, limite);
        const ocultos     = Math.max(0, totalGrupos - limite);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibles.map(([rad, filas]) => (
              <GrupoRadicado key={rad} radicado={rad} filas={filas} usuario={usuario} onContinuar={onContinuar}
                esAdmin={esAdmin} inspectores={inspectores} busyFila={busyFila}
                asignandoFila={asignandoFila} setAsignandoFila={setAsignandoFila}
                onAsignar={adminAsignar} onDesasignar={adminDesasignar} onCompletar={adminCompletar}
                onAsignarNuevaVisita={adminAsignarNuevaVisita} />
            ))}
            {ocultos > 0 && (
              <button
                onClick={() => setLimite(l => l + LIMITE_PASO)}
                style={{
                  background: 'var(--gris-bg)', border: '1px solid var(--borde)',
                  borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: 600, color: 'var(--texto-2)',
                  cursor: 'pointer', marginTop: 4,
                }}
                title={`${ocultos} grupos más sin mostrar`}>
                Mostrar {Math.min(LIMITE_PASO, ocultos)} más
                <span style={{ color: 'var(--texto-suave)', fontWeight: 400, marginLeft: 6 }}>
                  ({limite} de {totalGrupos})
                </span>
              </button>
            )}
          </div>
        );
      })()}
      </div>{/* .buscar-col-der */}
      </div>{/* .buscar-2col */}
    </div>
  );
}

// extraerIdCarpetaDrive() vive en utils.js (compartida con informe-modal.jsx).

// React.memo más abajo. Cada GrupoRadicado se re-renderiza solo si cambian
// sus props (radicado, filas, usuario); un keystroke en el buscador que
// reduce filtros ya no rerenderea todas las tarjetas visibles.
function GrupoRadicadoBase({ radicado, filas, usuario, onContinuar,
  esAdmin, inspectores, busyFila, asignandoFila, setAsignandoFila,
  onAsignar, onDesasignar, onCompletar, onAsignarNuevaVisita }) {
  const [open, setOpen] = useStateB(filas.length === 1);

  // Orden y numeración de visitas del radicado (numerarVisitasRadicado
  // en utils.js): respeta el N° VISITA explícito de BD, asigna el primer
  // número libre a las filas migradas de V2 sin número, y deja fuera de
  // la numeración (n = null) las filas PENDIENTE — una PQR sin asignar
  // no es una visita.
  const ordenadas = useMemoB(() => numerarVisitasRadicado(filas), [filas]);
  // Solo cuentan como visitas reales las numeradas (ASIGNADO/INICIADO/COMPLETADO).
  const totalVisitas = ordenadas.filter(x => x.n != null).length;

  // Una visita en curso (ASIGNADO o INICIADO) bloquea crear otra sobre el
  // mismo radicado: dos visitas vivas a la vez duplican el trabajo y dejan
  // sin definir cuál manda. Se libera al completar la que está en curso.
  // Una PENDIENTE no es visita en curso y no muestra el rótulo — pero
  // tampoco habilita "+ Nueva visita": sobre una PQR sin asignar la acción
  // correcta es Asignar, y ese botón ya vive en la fila.
  const abierta = ordenadas.find(x => {
    const e = normalizarEstado(x.f['ESTADO VISITA'] || '');
    return e === 'ASIGNADO' || e === 'INICIADO';
  });
  const pendiente = ordenadas.find(x =>
    normalizarEstado(x.f['ESTADO VISITA'] || '') === 'PENDIENTE');
  const filaBase = ordenadas.length ? ordenadas[ordenadas.length - 1].f : null;
  const puedeNueva = esAdmin && onAsignarNuevaVisita && filaBase && radicado !== 'Sin radicado';
  const panelNuevaAbierto = !!filaBase && asignandoFila === filaBase._idx;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, paddingRight: 10,
        borderBottom: (open || panelNuevaAbierto) ? '1px solid var(--borde)' : 'none',
      }}>
        <button type="button" className="btn-cabecera" onClick={() => setOpen(!open)}
          aria-expanded={open}
          style={{
            flex: 1, minWidth: 0, padding: '12px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
          <span>
            <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{radicado}</span>
            {/* Solo cuentan las visitas reales (ASIGNADO/INICIADO/COMPLETADO):
                un radicado con única fila PENDIENTE no es visita y no muestra
                nada (2026-09-09, antes decía "1 visita"). */}
            {totalVisitas > 0 && (
              <span style={{ display: 'block', fontSize: 11, color: 'var(--texto-suave)', marginTop: 2 }}>
                {totalVisitas} {totalVisitas === 1 ? 'visita' : 'visitas'}
              </span>
            )}
          </span>
          <span style={{ color: 'var(--texto-suave)', display: 'inline-flex' }}>
            {open ? <Icon.ChevronUp size={14} /> : <Icon.Chevron size={14} />}
          </span>
        </button>

        {/* "+ Nueva visita" es del radicado, no de una fila: vive en la
            cabecera del grupo. Se apoya en la última visita para clonar los
            datos fijos (dirección, barrio, GPS...). */}
        {puedeNueva && (abierta ? (
          <span style={{ fontSize: 11, color: 'var(--texto-suave)', textAlign: 'right' }}
            title="Completa la visita en curso antes de abrir otra">
            Visita {abierta.n} en curso
          </span>
        ) : !pendiente && (
          <button type="button"
            onClick={() => setAsignandoFila(panelNuevaAbierto ? null : filaBase._idx)}
            disabled={busyFila === filaBase._idx}
            style={{
              background: 'var(--gris-bg)', color: 'var(--texto)',
              border: '1px dashed var(--brand-accent)', borderRadius: 10,
              padding: '8px 12px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            {panelNuevaAbierto ? 'Cancelar' : '+ Nueva visita'}
          </button>
        ))}
      </div>

      {/* Panel de inspectores para la nueva visita (filaBase está COMPLETADO,
          así que PanelSeleccionInspector llama a onAsignarNuevaVisita). */}
      {puedeNueva && !abierta && !pendiente && (
        <div style={{ padding: panelNuevaAbierto ? '0 14px 12px' : 0 }}>
          <PanelSeleccionInspector
            f={filaBase} busy={busyFila === filaBase._idx} abierto={panelNuevaAbierto}
            inspectores={inspectores}
            onAsignar={onAsignar} onAsignarNuevaVisita={onAsignarNuevaVisita} />
        </div>
      )}

      {open && (
        <div>
          {ordenadas.map(({ f, n }, i) => <FilaVisita key={f._idx || i} f={f} nVisita={n}
            totalVisitas={totalVisitas}
            usuario={usuario} onContinuar={onContinuar}
            esAdmin={esAdmin} inspectores={inspectores}
            busy={busyFila === f._idx}
            abierto={asignandoFila === f._idx}
            onAbrirAsignar={() => setAsignandoFila(asignandoFila === f._idx ? null : f._idx)}
            onAsignar={onAsignar} onDesasignar={onDesasignar} onCompletar={onCompletar} />)}
        </div>
      )}
    </div>
  );
}

function FilaVisitaBase({ f, nVisita, totalVisitas, usuario, onContinuar,
  esAdmin, inspectores, busy, abierto, onAbrirAsignar, onAsignar, onDesasignar, onCompletar }) {
  const est = normalizarEstado(f['ESTADO VISITA'] || '');

  // En Buscar el badge se renderizaba con el estado raw mayúsculas (PENDIENTE,
  // ASIGNADO, INICIADO, COMPLETADO). Preservamos ese comportamiento pasando
  // el override a VisitaCard.
  return (
    <div style={{ padding: '10px 12px', borderTop: '1px solid var(--borde)' }}>
      {/* Qué visita del radicado es esta — sin esto dos filas idénticas del
          mismo radicado solo se distinguían por la fecha. Una PENDIENTE
          (nVisita = null) no es visita y nunca lleva el rótulo; este solo
          tiene sentido con más de una visita real. */}
      {nVisita != null && totalVisitas > 1 && (
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-suave)', marginBottom: 6 }}>
          Visita {nVisita} de {totalVisitas}
        </div>
      )}
      <VisitaCard f={f}
        mostrarFecha mostrarInspector mostrarAsignado mostrarOrden mostrarPersonaAtiende
        labelBadge={est || '—'}
        accionesMt={10}>
        {/* Botones inline en una sola fila — orden contextual por estado */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Iniciar/Continuar para no completadas */}
          {est !== 'COMPLETADO' && (
            <BotonContinuarVisita f={f} onContinuar={onContinuar} busy={busy} tamaño="sm" />
          )}
          {/* Entregables solo para completadas (Ver datos + Carpeta + Acta + Informe) */}
          {est === 'COMPLETADO' && <BotonesEntregables f={f} />}
          {/* Botones admin contextuales (Asignar / Reasignar / Desasignar / Completar / + Nueva visita) */}
          <BotonesAdminVisita
            f={f} esAdmin={esAdmin} busy={busy} abierto={abierto}
            onAbrirAsignar={onAbrirAsignar}
            onDesasignar={onDesasignar}
            onCompletar={onCompletar}
          />
        </div>
      </VisitaCard>

      {/* Panel de selección de inspector (fuera del flex de botones, va debajo) */}
      {esAdmin && (
        <PanelSeleccionInspector
          f={f} busy={busy} abierto={abierto && est !== 'COMPLETADO'}
          inspectores={inspectores} onAsignar={onAsignar}
        />
      )}
    </div>
  );
}

// Memoizados: React.memo evita re-render si las props no cambian (shallow eq).
// GrupoRadicado.filas es estable porque viene de un useMemo en BuscarScreen;
// FilaVisita.f sale de la misma referencia del array de datos.
const GrupoRadicado = React.memo(GrupoRadicadoBase);
const FilaVisita    = React.memo(FilaVisitaBase);

window.BuscarScreen = BuscarScreen;
