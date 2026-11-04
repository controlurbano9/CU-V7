// ═══════════════════════════════════════════════════════════════
// espera.jsx — Las piezas con que la app espera (propuesta de esperas,
// 2026-11-04; DESIGN.md §8d).
//
// Cinco piezas en lugar de ocho indicadores sueltos:
//   Esqueleto       calca la pieza que viene (tarjeta, placa, renglón,
//                   bloque), con su mismo alto: al llegar los datos nada salta.
//   BarraActividad  3 px bajo la cabecera negra (papel sobre negro) o arriba
//                   en escritorio (tinta sobre papel): abrir una visita, ↻.
//   Botón ocupado   ya existía: verbo en gerundio + .spinner-btn.
//   AvisoEspera     flota bajo la cabecera: dice qué se espera desde los 3 s
//                   y que la señal está lenta desde los 10 s (escalonEspera).
//   ErrorCarga      el molde de error de Agenda, para todas: qué pasó, qué
//                   hacer y «Reintentar»; el error técnico va en el title.
//
// Ninguna usa amarillo: esperar no es lo activo ni lo elegido (DESIGN.md §3).
// Tampoco rojo: el rojo es del error que pide hacer algo.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateES, useEffect: useEffectES, useSyncExternalStore: useSyncES } = React;

// ── Estado global de espera ────────────────────────────────────
// `abriendo`: la fila (_idx) de la visita que se está abriendo; la pintan
// todas las tarjetas, estén en la pantalla que estén. `actividad`: cuántas
// esperas globales hay en curso (la barra corre mientras sea > 0).
const _espera = { abriendo: null, actividad: 0 };
const _esperaSubs = new Set();
function _esperaAvisar() { _esperaSubs.forEach((fn) => fn()); }
function _esperaSuscribir(fn) { _esperaSubs.add(fn); return () => _esperaSubs.delete(fn); }

// Devuelve la función que termina esa espera (idempotente).
function iniciarActividad() {
  _espera.actividad++;
  _esperaAvisar();
  let hecho = false;
  return function terminarActividad() {
    if (hecho) return;
    hecho = true;
    _espera.actividad = Math.max(0, _espera.actividad - 1);
    _esperaAvisar();
  };
}
function marcarAbriendoVisita(fila) {
  const v = fila == null ? null : fila;
  if (_espera.abriendo === v) return;
  _espera.abriendo = v;
  _esperaAvisar();
}
function useAbriendoVisita() { return useSyncES(_esperaSuscribir, () => _espera.abriendo); }
function useActividadGlobal() { return useSyncES(_esperaSuscribir, () => _espera.actividad > 0); }

// ── Escalera ───────────────────────────────────────────────────
// 'nada' → 'forma' (0,4 s) → 'dice' (3 s) → 'lenta' (10 s). Vuelve a 'nada'
// en cuanto `activo` es falso.
function useEscalera(activo) {
  const [esc, setEsc] = useStateES('nada');
  useEffectES(() => {
    if (!activo) { setEsc('nada'); return undefined; }
    const t0 = Date.now();
    setEsc(escalonEspera(0));
    const ids = [ESPERA_PELDANOS.forma, ESPERA_PELDANOS.dice, ESPERA_PELDANOS.lenta]
      .map((ms) => setTimeout(() => setEsc(escalonEspera(Date.now() - t0)), ms));
    return () => ids.forEach(clearTimeout);
  }, [activo]);
  return activo ? esc : 'nada';
}

// ── Esqueleto ──────────────────────────────────────────────────
// Usa las cajas reales (.tv, .tv-tarjeta, .tv-renglon) para medir lo mismo.
// Los anchos varían con el índice para que no parezca una rejilla de
// rectángulos iguales.
const _ESQ_ANCHOS = [78, 64, 86, 70, 58];
function _esqAncho(i, menos) { return (_ESQ_ANCHOS[i % _ESQ_ANCHOS.length] - (menos || 0)) + '%'; }
function EsqLineaES({ clase, ancho }) {
  return <span className={'esq ' + clase} style={{ width: ancho }} />;
}

// Antes de 0,4 s no pinta nada: la copia local responde en milisegundos y el
// esqueleto solo parpadearía (escalonEspera, utils.js).
function Esqueleto({ tipo, n }) {
  const escalon = useEscalera(true);
  if (escalon === 'nada') return null;
  const cuantos = n || 1;
  const items = [];
  for (let i = 0; i < cuantos; i++) {
    if (tipo === 'placa') {
      items.push(
        <div key={i} className="esq-placa">
          <EsqLineaES clase="esq-dir-grande" ancho="88%" />
          <EsqLineaES clase="esq-dir-grande" ancho="54%" />
          <EsqLineaES clase="esq-linea esq-meta-grande" ancho="66%" />
          <div className="esq-placa-acc"><span className="esq esq-btn-placa" /><span className="esq esq-btn-placa" /></div>
        </div>
      );
    } else if (tipo === 'renglon') {
      items.push(
        <div key={i} className="tv tv-renglon esq-tv">
          <div className="tv-txt">
            <EsqLineaES clase="esq-linea esq-dir" ancho={_esqAncho(i)} />
            <EsqLineaES clase="esq-linea" ancho={_esqAncho(i + 2, 10)} />
          </div>
        </div>
      );
    } else if (tipo === 'bloque') {
      items.push(
        <div key={i} className="esq-bloque-item">
          <EsqLineaES clase="esq-linea" ancho="36%" />
          <EsqLineaES clase="esq-cifra" ancho="22%" />
          <EsqLineaES clase="esq-linea" ancho={_esqAncho(i)} />
          <EsqLineaES clase="esq-linea" ancho={_esqAncho(i + 1, 8)} />
        </div>
      );
    } else {
      // 'tarjeta' (por defecto): la tarjeta de Mis visitas y Buscar.
      items.push(
        <div key={i} className="tv tv-tarjeta esq-tv">
          <div className="tv-txt">
            <EsqLineaES clase="esq-linea" ancho={_esqAncho(i + 3, 30)} />
            <EsqLineaES clase="esq-linea esq-dir" ancho={_esqAncho(i)} />
            <EsqLineaES clase="esq-linea" ancho={_esqAncho(i + 1, 12)} />
          </div>
          <div className="tv-acc"><span className="esq esq-btn" /></div>
        </div>
      );
    }
  }
  // aria-hidden: lo que se lee en voz es el aria-busy y el texto del aviso.
  return <div className={'esq-grupo esq-g-' + (tipo || 'tarjeta')} aria-hidden="true">{items}</div>;
}

// ── Barra de actividad ─────────────────────────────────────────
// Una sola para la app (app.jsx). `activa` la fuerza; sin ella sigue a las
// esperas globales (iniciarActividad).
function BarraActividad({ activa }) {
  const global = useActividadGlobal();
  const on = activa != null ? !!activa : global;
  return <div className={'barra-actividad' + (on ? ' on' : '')} aria-hidden="true" />;
}

// ── Aviso de espera ────────────────────────────────────────────
// `que`: lo que se espera, con artículo («la agenda», «las audiencias»).
// `onCancelar`: solo donde cancelar deja algo útil (abrir una visita vuelve a
// la lista); una pantalla vacía no tiene a dónde volver.
// Siempre flota bajo la cabecera: dentro de la página empujaba el contenido
// al aparecer (3 s) y al irse, el salto que el esqueleto evita.
function AvisoEspera({ escalon, que, onCancelar }) {
  if (escalon !== 'dice' && escalon !== 'lenta') return null;
  const lenta = escalon === 'lenta';
  const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
  const texto = sinRed ? 'Sin señal. Se reintentará al volver la conexión.'
    : lenta ? 'La señal está lenta. Sigue intentando…'
    : 'Pidiendo ' + (que || 'los datos') + ' al servidor…';
  return (
    <div className="aviso-espera" role="status">
      <span className="spinner-btn" aria-hidden="true" />
      <span className="aviso-espera-txt">{texto}</span>
      {lenta && onCancelar && (
        <button type="button" className="btn-neutro aviso-espera-btn" onClick={onCancelar}>Cancelar</button>
      )}
    </div>
  );
}

// ── Error de carga ─────────────────────────────────────────────
// El molde que ya tenía Agenda (revisión 2026-10-28): una frase clara, el
// error técnico en el title y «Reintentar». `titulo`: «No se pudieron
// cargar las visitas.»
function ErrorCarga({ titulo, detalle, onReintentar, compacto }) {
  const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
  return (
    <div className={'error-carga' + (compacto ? ' compacto' : '')} role="alert">
      <div className="error-carga-txt" title={detalle || undefined}>
        <b>{titulo || 'No se pudo cargar.'}</b>
        <span>{sinRed ? 'No hay señal. Vuelve a intentar cuando tengas conexión.' : 'Revisa la conexión y vuelve a intentar.'}</span>
      </div>
      {onReintentar && <button type="button" className="btn-neutro error-carga-btn" onClick={onReintentar}>Reintentar</button>}
    </div>
  );
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    iniciarActividad, marcarAbriendoVisita, useAbriendoVisita, useActividadGlobal, useEscalera,
    Esqueleto, BarraActividad, AvisoEspera, ErrorCarga,
  });
}
