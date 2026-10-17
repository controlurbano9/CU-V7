// ═══════════════════════════════════════════════════════════════
// v6/modal.jsx — Modal in-app + API Promise-based reemplazando
// window.confirm/alert. Expone:
//   await appConfirm(msg, {titulo, btnOk, btnCancel, peligro, tono}) → bool
//   await appAlert(msg,   {titulo, btnOk, tono})                     → true
//
// `tono`: 'info' (defecto) | 'exito' | 'aviso' | 'error'
//   El icono comunica QUÉ PASÓ; el botón comunica QUÉ VAS A HACER.
//   Un aviso de error NO pinta el botón de rojo (el botón solo cierra);
//   el rojo del botón queda reservado a `peligro: true`, donde la acción
//   que se dispara sí destruye algo.
//
// Si <ModalHost /> aún no se ha montado (boot temprano), cae en
// el confirm/alert nativo del browser para no perder mensajes.
// ═══════════════════════════════════════════════════════════════
const { useState: useStateM, useEffect: useEffectM, useRef: useRefM } = React;

// Bridge entre la API global y el state del Host. Se setea al montar
// el ModalHost; null mientras no exista.
let _pushModal = null;

let _modalSeq = 0;   // id estable por modal — el índice cambia al desapilar

function ModalHost() {
  const [modales, setModales] = useStateM([]);

  useEffectM(() => {
    _pushModal = function(m) {
      setModales(function(prev) { return prev.concat([Object.assign({ _id: ++_modalSeq }, m)]); });
    };
    return function() { _pushModal = null; };
  }, []);

  // Bloqueo de scroll del fondo mientras haya algún diálogo abierto.
  // Sin esto, en móvil el dedo arrastra la página detrás del sheet y el
  // formulario pierde la posición de lectura.
  useEffectM(function() {
    if (!modales.length) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return function() { document.body.style.overflow = previo; };
  }, [modales.length]);

  // El resolver de la promesa es un efecto: ejecutarlo dentro del updater de
  // setModales lo hacía correr dos veces en StrictMode y en cualquier
  // re-ejecución del updater. Ahora el efecto va fuera y el updater solo filtra.
  function resolver(id, valor) {
    const m = modales.find(function(x) { return x._id === id; });
    setModales(function(prev) { return prev.filter(function(x) { return x._id !== id; }); });
    if (m && m.resolver) m.resolver(valor);
  }

  if (!modales.length) return null;
  return (
    <>
      {modales.map(function(m, idx) {
        return <ModalUI key={m._id} {...m}
          esUltimo={idx === modales.length - 1}
          onResolver={function(v) { resolver(m._id, v); }} />;
      })}
    </>
  );
}

// Iconos de tono — Heroicons outline, stroke unificado con `.ico` del sistema.
function _DlgIcono({ tono }) {
  const comun = {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
  };
  if (tono === 'exito') {
    return <svg {...comun}><path d="M4.5 12.75l6 6 9-13.5" /></svg>;
  }
  if (tono === 'error') {
    return <svg {...comun}><path d="M6 18L18 6M6 6l12 12" /></svg>;
  }
  if (tono === 'aviso') {
    return (
      <svg {...comun}>
        <path d="M12 9v4.5m0 3.75h.008" />
        <path d="M10.34 3.94a1.92 1.92 0 013.32 0l7.4 12.82a1.92 1.92 0 01-1.66 2.87H4.6a1.92 1.92 0 01-1.66-2.87l7.4-12.82z" />
      </svg>
    );
  }
  // info (defecto)
  return (
    <svg {...comun}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11.25v4.5M12 8.25h.008" />
    </svg>
  );
}

function ModalUI({ tipo, titulo, mensaje, btnOk, btnCancel, peligro, tono, esUltimo, onResolver }) {
  const cardRef  = useRefM(null);
  const okRef    = useRefM(null);
  const previoRef = useRefM(null);

  const esConfirm = tipo === 'confirm';
  // Un confirm destructivo se lee siempre como aviso, aunque no lo declaren.
  const tonoFinal = tono || (peligro ? 'aviso' : 'info');

  // Teclado: Esc cancela (confirm) o cierra (alert); Enter acepta; Tab
  // queda atrapado dentro del diálogo. Solo el modal superior escucha:
  // antes cada modal apilado registraba su propio listener y un Esc los
  // resolvía todos de golpe.
  useEffectM(function() {
    if (esUltimo === false) return;
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onResolver(esConfirm ? false : true); return; }
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); onResolver(true); return; }
      if (e.key !== 'Tab') return;
      // Focus trap: sin esto, Tab saca el foco al formulario de atrás, que
      // sigue en el DOM y es operable con teclado bajo el overlay.
      const foco = cardRef.current && cardRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!foco || !foco.length) return;
      const primero = foco[0], ultimo = foco[foco.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    }
    window.addEventListener('keydown', onKey);
    return function() { window.removeEventListener('keydown', onKey); };
  }, [onResolver, esConfirm, esUltimo]);

  // Foco al abrir y devolución al cerrar.
  // NO se autoenfoca el botón de acción en un confirm destructivo: un Enter
  // reflejo (muy común tras teclear en el formulario) confirmaba el borrado.
  // En ese caso el foco arranca en la tarjeta, y Enter sigue funcionando
  // por el handler de teclado solo si el foco no está en un botón.
  useEffectM(function() {
    if (esUltimo === false) return;
    previoRef.current = document.activeElement;
    const destino = (esConfirm && peligro) ? cardRef.current : okRef.current;
    if (destino) destino.focus();
    return function() {
      const p = previoRef.current;
      if (p && typeof p.focus === 'function' && document.contains(p)) p.focus();
    };
  }, [esUltimo, esConfirm, peligro]);

  const clases = 'dlg dlg-' + tonoFinal + (peligro ? ' dlg-peligro' : '');
  const tituloId  = 'dlg-t-' + tonoFinal;
  const mensajeId = 'dlg-m-' + tonoFinal;

  return (
    <div className="dlg-overlay" onClick={function() { onResolver(esConfirm ? false : true); }}>
      <div ref={cardRef} className={clases} tabIndex={-1}
        role={esConfirm ? 'alertdialog' : 'dialog'} aria-modal="true"
        aria-labelledby={titulo ? tituloId : undefined}
        aria-describedby={mensajeId}
        onClick={function(e) { e.stopPropagation(); }}>
        {/* Grip: pista de que en móvil es un sheet descartable */}
        <div className="dlg-grip" aria-hidden="true" />
        <div className="dlg-head">
          <div className="dlg-icono"><_DlgIcono tono={tonoFinal} /></div>
          <div className="dlg-cuerpo">
            {titulo && <div className="dlg-titulo" id={tituloId}>{titulo}</div>}
            <div className="dlg-mensaje" id={mensajeId}>{mensaje}</div>
          </div>
        </div>
        <div className="dlg-acciones">
          {esConfirm && (
            <button type="button" className="dlg-btn dlg-btn-cancel"
              onClick={function() { onResolver(false); }}>
              {btnCancel || 'Cancelar'}
            </button>
          )}
          <button type="button" ref={okRef} className="dlg-btn dlg-btn-ok"
            onClick={function() { onResolver(true); }}>
            {btnOk || (esConfirm ? 'Aceptar' : 'Entendido')}
          </button>
        </div>
      </div>
    </div>
  );
}

// API global Promise-based — caída a nativo si el host aún no monta.
window.appConfirm = function(mensaje, opts) {
  return new Promise(function(resolver) {
    if (_pushModal) {
      _pushModal(Object.assign({ tipo: 'confirm', mensaje: mensaje, resolver: resolver }, opts || {}));
    } else {
      resolver(window.confirm(mensaje));
    }
  });
};

window.appAlert = function(mensaje, opts) {
  return new Promise(function(resolver) {
    if (_pushModal) {
      _pushModal(Object.assign({ tipo: 'alert', mensaje: mensaje, resolver: resolver }, opts || {}));
    } else {
      window.alert(mensaje);
      resolver(true);
    }
  });
};

window.ModalHost = ModalHost;
