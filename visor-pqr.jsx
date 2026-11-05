// ═══════════════════════════════════════════════════════════════
// visor-pqr.jsx — el PDF de la PQR dentro de la app (2026-11-05)
//
// Los PDF de las PQR traen nombre, cédula y teléfono del denunciante y ya no
// se abren con el enlace de Drive (decisión del usuario): la app los pide al
// webhook (obtenerPdfPqr, api.js) y los muestra aquí con pdf.js. Dentro de la
// app y no en pestaña porque Chrome en Android no muestra un PDF de `blob:`:
// lo descarga, y la PQR quedaría copiada en el teléfono.
//
// Cualquier pantalla lo abre con abrirPqr(radicado): un evento que escucha
// VisorPqrHost, montado una vez en app.jsx (como «cu-ir-semana»).
//
// «Atrás» del celular cierra el visor, no la pantalla de debajo: misma
// mecánica que VisorFotos y el escáner (_cuVisorFotos en app.jsx).
// ═══════════════════════════════════════════════════════════════
const { useState: useStateVP, useEffect: useEffectVP, useRef: useRefVP } = React;

const VP_ZOOM_MIN = 1;
const VP_ZOOM_MAX = 4;
const VP_ANCHO_MAX = 900;    // ancho de la página con zoom 1 en pantallas grandes
const VP_CANVAS_MAX = 4096;  // ancho máximo del lienzo: más reventaría la memoria de un Android barato

function abrirPqr(radicado) {
  const r = String(radicado || '').trim();
  if (!r) return;
  window.dispatchEvent(new CustomEvent('cu-abrir-pqr', { detail: { radicado: r } }));
}

function VisorPqrHost() {
  const [rad, setRad] = useStateVP('');
  useEffectVP(function () {
    function abrir(e) { setRad((e.detail && e.detail.radicado) || ''); }
    window.addEventListener('cu-abrir-pqr', abrir);
    return function () { window.removeEventListener('cu-abrir-pqr', abrir); };
  }, []);
  if (!rad) return null;
  return <VisorPqr key={rad} radicado={rad} onCerrar={function () { setRad(''); }} />;
}

function VisorPqr({ radicado, onCerrar }) {
  const [estado, setEstado] = useStateVP('cargando'); // cargando | listo | error
  const [mensaje, setMensaje] = useStateVP('');
  const [reintentable, setReintentable] = useStateVP(false);
  const [paginas, setPaginas] = useStateVP(0);
  const [zoom, setZoom] = useStateVP(1);
  const [intento, setIntento] = useStateVP(0);
  const docRef = useRefVP(null);
  const hojaRef = useRefVP(null);
  const lienzoRef = useRefVP(null);
  const cerrarRef = useRefVP(null);
  const cerrandoRef = useRefVP(false);
  const genRef = useRefVP(0);
  const zoomRef = useRefVP(zoom);
  zoomRef.current = zoom;
  const onCerrarRef = useRefVP(onCerrar);
  onCerrarRef.current = onCerrar;

  function cerrar() {
    if (cerrandoRef.current) return;
    cerrandoRef.current = true;
    history.back();
  }

  // Capa en el historial + Esc + sin desplazamiento del fondo.
  useEffectVP(function () {
    history.pushState(history.state, '');
    window._cuVisorFotos = true;
    function alVolver() { onCerrarRef.current(); }
    function tecla(e) { if (e.key === 'Escape') cerrar(); }
    window.addEventListener('popstate', alVolver);
    window.addEventListener('keydown', tecla);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (cerrarRef.current) cerrarRef.current.focus();
    return function () {
      window._cuVisorFotos = false;
      window.removeEventListener('popstate', alVolver);
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = previo;
      if (docRef.current) { try { docRef.current.destroy(); } catch (e) { /* ya cerrado */ } }
    };
  }, []);

  // Traer el PDF y abrirlo con pdf.js.
  useEffectVP(function () {
    let vivo = true;
    setEstado('cargando'); setMensaje(''); setReintentable(false);
    (async function () {
      try {
        if (navigator.onLine === false) {
          throw Object.assign(new Error('Sin señal: la PQR se abre cuando vuelva la conexión.'), { red: true });
        }
        const [res, pdfjs] = await Promise.all([obtenerPdfPqr(radicado), cargarPdfJs()]);
        if (!vivo) return;
        if (!res || !res.ok) {
          setEstado('error');
          setMensaje((res && res.error) || 'No se pudo abrir la PQR.');
          setReintentable(!(res && res.sinPdf));
          return;
        }
        // pdf.js se queda con el buffer que recibe: se le pasa una copia para
        // que la que guarda api.js en memoria siga sirviendo al reabrir.
        const doc = await pdfjs.getDocument({ data: res.bytes.slice() }).promise;
        if (!vivo) { doc.destroy(); return; }
        docRef.current = doc;
        setPaginas(doc.numPages);
        setEstado('listo');
      } catch (e) {
        if (!vivo) return;
        setEstado('error');
        setMensaje(e && e.red ? e.message : 'No se pudo traer la PQR. Revisa la señal y vuelve a intentar.');
        setReintentable(true);
        console.warn('[visor-pqr]', e && e.message);
      }
    })();
    return function () { vivo = false; };
  }, [radicado, intento]);

  // Pintar las páginas (de nuevo con cada zoom). Una generación nueva corta
  // la anterior a media página.
  useEffectVP(function () {
    const doc = docRef.current;
    const hoja = hojaRef.current;
    const lienzo = lienzoRef.current;
    if (estado !== 'listo' || !doc || !hoja || !lienzo) return;
    const gen = ++genRef.current;
    const dpr = window.devicePixelRatio || 1;
    const base = Math.min(hoja.clientWidth - 24, VP_ANCHO_MAX);
    lienzo.innerHTML = '';
    (async function () {
      for (let n = 1; n <= doc.numPages; n++) {
        if (gen !== genRef.current) return;
        const pag = await doc.getPage(n);
        if (gen !== genRef.current) return;
        const v1 = pag.getViewport({ scale: 1 });
        const anchoCss = base * zoom;
        const escalaPx = Math.min(anchoCss * dpr, VP_CANVAS_MAX) / v1.width;
        const vp = pag.getViewport({ scale: escalaPx });
        const c = document.createElement('canvas');
        c.className = 'vp-pag';
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        c.style.width = anchoCss + 'px';
        c.style.height = (anchoCss * v1.height / v1.width) + 'px';
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', 'Página ' + n + ' de ' + doc.numPages);
        lienzo.appendChild(c);
        try {
          await pag.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        } catch (e) { if (gen === genRef.current) console.warn('[visor-pqr] página ' + n, e && e.message); }
      }
    })();
  }, [estado, zoom]);

  // Pellizcar para acercar: mientras se pellizca se escala el lienzo con CSS
  // y al soltar se vuelve a pintar nítido con el zoom nuevo.
  useEffectVP(function () {
    const hoja = hojaRef.current;
    const lienzo = lienzoRef.current;
    if (!hoja || !lienzo) return;
    let d0 = 0, z0 = 1, r = 1;
    const dist = function (t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); };
    function ini(e) {
      if (e.touches.length !== 2) return;
      d0 = dist(e.touches); z0 = zoomRef.current; r = 1;
    }
    function mover(e) {
      if (e.touches.length !== 2 || !d0) return;
      e.preventDefault();
      r = Math.max(VP_ZOOM_MIN / z0, Math.min(VP_ZOOM_MAX / z0, dist(e.touches) / d0));
      lienzo.style.transformOrigin = 'top center';
      lienzo.style.transform = 'scale(' + r + ')';
    }
    function fin(e) {
      if (!d0 || e.touches.length >= 2) return;
      d0 = 0;
      lienzo.style.transform = '';
      if (Math.abs(r - 1) > 0.05) setZoom(Math.round(z0 * r * 4) / 4);
    }
    hoja.addEventListener('touchstart', ini, { passive: true });
    hoja.addEventListener('touchmove', mover, { passive: false });
    hoja.addEventListener('touchend', fin);
    hoja.addEventListener('touchcancel', fin);
    return function () {
      hoja.removeEventListener('touchstart', ini);
      hoja.removeEventListener('touchmove', mover);
      hoja.removeEventListener('touchend', fin);
      hoja.removeEventListener('touchcancel', fin);
    };
  }, []);
  function cambiarZoom(paso) {
    setZoom(function (z) { return Math.max(VP_ZOOM_MIN, Math.min(VP_ZOOM_MAX, Math.round((z + paso) * 4) / 4)); });
  }

  return ReactDOM.createPortal(
    <div className="rfm vp" role="dialog" aria-modal="true" aria-labelledby="vp-titulo">
      <header className="rfm-top">
        <button ref={cerrarRef} type="button" className="btn-icono" onClick={cerrar} aria-label="Cerrar la PQR">
          <Icon.Close size={20} />
        </button>
        <div className="vp-tit">
          <h2 id="vp-titulo" className="rfm-titulo">{'PQR ' + radicado}</h2>
          {paginas > 0 && <p className="vp-ayuda">{paginas === 1 ? '1 página' : paginas + ' páginas'}</p>}
        </div>
      </header>

      <div className="vp-cuerpo">
        <div ref={hojaRef} className="vp-hoja">
          <div ref={lienzoRef} className="vp-lienzo" />
        </div>
        {estado === 'cargando' && <div className="rfm-fallo" role="status">Abriendo la PQR…</div>}
        {estado === 'error' && (
          <div className="rfm-fallo vp-error" role="alert">
            <span>{mensaje}</span>
            {reintentable && (
              <button type="button" className="vp-reintentar" onClick={function () { setIntento(function (i) { return i + 1; }); }}>
                Reintentar
              </button>
            )}
          </div>
        )}
        {estado === 'listo' && (
          <div className="rfm-zoom" role="group" aria-label="Tamaño de la página">
            <button type="button" onClick={function () { cambiarZoom(-0.5); }} disabled={zoom <= VP_ZOOM_MIN} aria-label="Alejar">−</button>
            <span aria-live="polite">{Math.round(zoom * 100) + ' %'}</span>
            <button type="button" onClick={function () { cambiarZoom(0.5); }} disabled={zoom >= VP_ZOOM_MAX} aria-label="Acercar">+</button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

window.abrirPqr = abrirPqr;
window.VisorPqrHost = VisorPqrHost;
