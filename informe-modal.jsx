// ═══════════════════════════════════════════════════════════════
// v6/informe-modal.jsx — Modal in-app del generador F-GGO-43.
//
// Render un <iframe> de informe/index.html dentro de un overlay
// fullscreen-ish. Solo se usa en escritorio (ancho ≥ 900px). En
// móvil se hace fallback a abrir en una pestaña nueva.
//
// API global (idéntica en ambos modos):
//   window.abrirInformeF43({
//     fila, idCarpeta, radicado, direccion,
//     fechaVisita, cargo, inspector, catastral, lat
//   })
//
// Cuando el iframe sube el informe a Drive, el child hace
// postMessage({tipo:'informe-f43-subido', fila, radicado, link}).
// Esto invalida la caché de visitas para que cualquier pantalla la
// refresque al volver a montar.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateIF, useEffect: useEffectIF, useRef: useRefIF } = React;

const INFORME_PATH = 'informe/index.html';
// Subido de 900 a 1200 (auditoría UX 2026-07): el workspace v2 usa 3
// columnas (índice + canvas + panel contextual) que no respiran por
// debajo de ~1200px reales — 900px alcanzaba para el wizard de 1 columna.
const MIN_DESKTOP = 1200;

let _pushInforme = null; // bridge con el host (idéntico al patrón de modal.jsx)

function InformeModalHost() {
  const [params, setParams] = useStateIF(null);

  useEffectIF(() => {
    _pushInforme = function(p) { setParams(p); };
    return function() { _pushInforme = null; };
  }, []);

  // Escuchar mensaje del iframe cuando termina la subida a Drive.
  useEffectIF(() => {
    function onMsg(e) {
      if (e.origin !== window.location.origin) return; // el iframe es same-origin (informe/index.html)
      if (e && e.data && e.data.tipo === 'informe-f43-subido') {
        // El BD cambió (LINK_INFORME_F43, etc.) → invalidar caché.
        if (typeof invalidarCache === 'function') invalidarCache('visitas');
        if (typeof appAlert === 'function') {
          appAlert('Informe subido a Drive correctamente.', { tono: 'exito', titulo: 'Listo' });
        }
      }
    }
    window.addEventListener('message', onMsg);
    // Móvil: el generador va en pestaña 'noopener' y avisa por BroadcastChannel.
    // Sin invalidar, la copia local seguiría con el link del informe anterior.
    let bc = null;
    try {
      if (typeof BroadcastChannel === 'function') {
        bc = new BroadcastChannel('cu-informe-f43');
        bc.onmessage = function(e) {
          if (e && e.data && e.data.tipo === 'informe-f43-subido' && typeof invalidarCache === 'function') {
            invalidarCache('visitas');
          }
        };
      }
    } catch (eBc) { bc = null; }
    return function() {
      window.removeEventListener('message', onMsg);
      if (bc) bc.close();
    };
  }, []);

  // Esc cierra el modal.
  useEffectIF(() => {
    if (!params) return;
    function onKey(e) { if (e.key === 'Escape') setParams(null); }
    window.addEventListener('keydown', onKey);
    return function() { window.removeEventListener('keydown', onKey); };
  }, [params]);

  if (!params) return null;
  return <InformeIframeUI params={params} onCerrar={function() { setParams(null); }} />;
}

function InformeIframeUI({ params, onCerrar }) {
  const iframeRef = useRefIF(null);

  const src = INFORME_PATH + '?' + _toQuery(params);

  return (
    <div onClick={function(e) {
      // Click directo sobre el backdrop cierra; click dentro del frame no.
      if (e.target === e.currentTarget) onCerrar();
    }} style={{
      position: 'fixed', inset: 0, background: 'rgba(31,27,22,0.65)',
      zIndex: 9000, padding: '4vh 4vw',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      backdropFilter: 'blur(2px)',
    }}>
    {/* Contenedor de la "ventana" — ~92vw/92vh, tope 1440px (revisión UX 2026-07) */}
    <div style={{
      width: '100%', height: '100%', maxWidth: 1440,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Barra de la "ventana": el mismo lenguaje de la app (Inter, botón
          común, radio de panel). Es la única cabecera: la página del
          generador oculta su logo cuando va dentro de este marco. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px 10px 20px', background: 'var(--surface)',
        borderRadius: 'var(--r-panel) var(--r-panel) 0 0', borderBottom: '1px solid var(--line)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Informe de inspección</div>
          <div style={{
            fontSize: 13, color: 'var(--ink-3)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {params.radicado || '—'} {params.direccion && '· ' + params.direccion}
          </div>
        </div>
        <button type="button" className="vc-btn" onClick={function() {
          // Abrir en pestaña nueva (mantiene el modal abierto).
          window.open(src, '_blank', 'noopener');
        }} title="Abrir en pestaña nueva">↗ Pestaña nueva</button>
        <button type="button" className="vc-btn" onClick={onCerrar} aria-label="Cerrar" title="Cerrar (Esc)"
          style={{ width: 36, padding: 0 }}><Icon.Close size={16} /></button>
      </div>

      {/* Iframe ocupa todo el alto restante */}
      <iframe
        ref={iframeRef}
        src={src}
        title="Generador F-GGO-43"
        style={{
          flex: 1, width: '100%', border: 'none',
          background: 'var(--paper)',
          borderRadius: '0 0 var(--r-panel) var(--r-panel)',
        }}
      />
    </div>
    </div>
  );
}

// Helpers ────────────────────────────────────────────────────────
function _toQuery(obj) {
  const qs = new URLSearchParams();
  Object.keys(obj || {}).forEach(function(k) {
    const v = obj[k];
    if (v != null && v !== '') qs.set(k, String(v));
  });
  return qs.toString();
}

// extraerIdCarpetaDrive() vive en utils.js (compartida con buscar.jsx).

// API global. Estrategia:
//   - Si hay ModalHost montado y el viewport es desktop → modal.
//   - Si no → window.open en pestaña nueva (móvil o sin host).
// ¿El generador va a ir en pestaña nueva (no en el marco)? La visita lo pregunta
// ANTES de cualquier await: la pestaña tiene que abrirse dentro del toque o el
// navegador la bloquea sin avisar (2026-11-05: «Regenerar informe» no hacía nada
// en el celular porque la pestaña se abría después de consultar el POT).
window.informeF43EnPestana = function() {
  return !(_pushInforme && window.innerWidth >= MIN_DESKTOP);
};

// Abre una pestaña en blanco dentro del toque, para llenarla después del await.
// Sin `noopener` (con él window.open devuelve null y no se puede llenar); se
// corta el opener a mano. Devuelve null si el navegador la bloqueó.
window.preabrirPestanaInforme = function() {
  try {
    const w = window.open('', '_blank');
    if (w) { try { w.opener = null; } catch (e) {} }
    return w || null;
  } catch (e) { return null; }
};

// opts.ventana: pestaña ya abierta por preabrirPestanaInforme (o null si se bloqueó).
window.abrirInformeF43 = function(params, opts) {
  const ventana = opts && opts.ventana;
  if (!params || !params.fila || !params.radicado) {
    console.error('[abrirInformeF43] faltan params obligatorios (fila/radicado):', params);
    if (ventana) { try { ventana.close(); } catch (e) {} }
    if (typeof appAlert === 'function') {
      appAlert('No se pudo abrir el informe: a la visita le falta el radicado o no está guardada.',
        { tono: 'error', titulo: 'Informe de inspección' });
    }
    return;
  }
  // AP1 (auditoría 2026-07): informe/index.html corre fuera de api.js
  // (iframe o pestaña nueva) y no comparte el auto-adjunto de credenciales
  // de gasGet/gasPost — se pasan aquí, una sola vez, vía query string.
  const s = (typeof SESSION_V6 !== 'undefined') ? SESSION_V6.leer() : null;
  const paramsConSesion = (s && s.usuario && s.hash)
    ? Object.assign({ sesionUsuario: s.usuario, sesionHash: s.hash }, params || {})
    : (params || {});
  // Único modo desde el 2026-10-15 (decisión del usuario): el editor con
  // forma de documento. El generador también lo fija por su cuenta.
  paramsConSesion.ui = 'doc';

  const esDesktop = window.innerWidth >= MIN_DESKTOP;
  if (_pushInforme && esDesktop) {
    if (ventana) { try { ventana.close(); } catch (e) {} }
    _pushInforme(paramsConSesion);
    return;
  }
  const url = INFORME_PATH + '?' + _toQuery(paramsConSesion);
  if (ventana && !ventana.closed) {
    ventana.location.href = url;
    return;
  }
  // Sin pestaña preabierta (o el navegador la bloqueó): intentar ahora y, si
  // tampoco sale, pedir un toque nuevo — ese sí cuenta como gesto del usuario.
  const w = window.open(url, '_blank');
  if (w) { try { w.opener = null; } catch (e) {} return; }
  if (typeof appConfirm === 'function') {
    appConfirm('El navegador bloqueó la pestaña del informe.',
      { tono: 'aviso', titulo: 'Informe de inspección', btnOk: 'Abrir el informe' })
      .then(function(ok) {
        if (!ok) return;
        const w2 = window.open(url, '_blank');
        if (w2) { try { w2.opener = null; } catch (e) {} }
      });
  }
};

window.InformeModalHost = InformeModalHost;
