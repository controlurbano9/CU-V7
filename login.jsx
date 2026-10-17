// ═══════════════════════════════════════════════════════════════
// v6/login.jsx — Pantalla de login con webhook real
// ═══════════════════════════════════════════════════════════════
const { useState: useStateLG, useEffect: useEffectLG } = React;

function LoginScreen({ onLogin }) {
  const [inspectores, setInspectores] = useStateLG([]);
  const [cargandoLista, setCargandoLista] = useStateLG(true);
  const [nombre, setNombre] = useStateLG('');
  const [pin, setPin] = useStateLG('');
  const [error, setError] = useStateLG('');
  const [verificando, setVerificando] = useStateLG(false);
  // Usuario que entró con PIN temporal y todavía no eligió el suyo.
  const [pendiente, setPendiente] = useStateLG(null);

  // Cargar inspectores activos al montar.
  // Si falla (sin red al arrancar, webhook caído) el usuario quedaba encerrado
  // en el login sin ninguna forma de reintentar salvo recargar la página.
  const [fallóLista, setFallóLista] = useStateLG(false);

  function cargarInspectores() {
    setCargandoLista(true);
    setFallóLista(false);
    setError('');
    // Sale al instante con la última lista guardada; si el webhook trae una
    // distinta, se reemplaza sin tocar la selección.
    // Solo quien tiene PIN entra. Hay funcionarios activos que existen en
    // USUARIOS únicamente para firmar el acta y para que se les pueda asignar
    // una visita (Nelson Cuervo, Auxiliar Administrativo): sin `conUsuario`
    // aparecían en este desplegable y ningún PIN les servía. `!== false`
    // tolera un backend anterior que no manda el campo.
    const conPin = l => l.filter(i => i.conUsuario !== false);
    listarInspectoresActivos({ onActualizado: l => setInspectores(conPin(l)) })
      .then(lista => {
        const list = conPin(lista);
        setInspectores(list);
        setCargandoLista(false);
        // Pre-seleccionar último usado
        const last = localStorage.getItem('cu_ultimo_usuario');
        if (last && list.some(i => i.nombre === last)) setNombre(last);
      })
      .catch(e => {
        setCargandoLista(false);
        setFallóLista(true);
        setError('No se pudo cargar la lista de inspectores');
      });
  }

  useEffectLG(cargarInspectores, []);

  async function manejarSubmit(e) {
    e.preventDefault();
    setError('');

    if (!nombre) { setError('Selecciona tu nombre'); return; }
    if (!pin || pin.length !== 4) { setError('El PIN debe tener 4 dígitos'); return; }

    setVerificando(true);
    const { ok, error: errorMsg, ...usuario } = await login(nombre, pin);
    if (ok) {
      localStorage.setItem('cu_ultimo_usuario', usuario.usuario);
      SESSION_V6.guardar(usuario);
      registrarLog(usuario.usuario, 'Login V6');
      // PIN temporal: la sesión queda guardada (es la que autoriza cambiarlo),
      // pero no se entra a la app hasta elegir el propio.
      if (usuario.debeCambiarPin) setPendiente(usuario);
      else onLogin(usuario);
    } else {
      setError(errorMsg);
      setPin('');
    }
    setVerificando(false);
  }

  if (pendiente) {
    return (
      <CambiarPinScreen modo="temporal" nombre={pendiente.usuario}
        onListo={() => { const u = SESSION_V6.leer() || pendiente; setPendiente(null); onLogin(Object.assign({}, pendiente, { hash: u.hash })); }}
        onCancelar={() => { SESSION_V6.borrar(); setPendiente(null); setPin(''); }} />
    );
  }

  return (
    <div id="pantalla-login" style={{ display: 'flex' }}>
      <div className="login-logo">
        <img src="logo-login.png" alt="Control Urbano" />
      </div>
      <div className="login-titulo">Control Urbano</div>
      <div className="login-sub">Inspección N°9 · Alcaldía de Bello</div>

      <form className="login-form" onSubmit={manejarSubmit} autoComplete="on">
        <label htmlFor="login-nombre" className="sr-only">Inspector</label>
        <select
          id="login-nombre"
          name="username"
          className="login-input"
          autoComplete="username"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          disabled={cargandoLista}
          style={{
            appearance: 'none',
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23F5F1EB' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 14px center',
            paddingRight: 36,
          }}>
          <option value="">
            {cargandoLista ? 'Cargando inspectores...' : 'Selecciona tu nombre'}
          </option>
          {inspectores.map(i => (
            <option key={i.nombre} value={i.nombre}>{i.nombre}</option>
          ))}
        </select>

        <label htmlFor="login-pin" className="sr-only">PIN</label>
        <input
          type="password"
          id="login-pin"
          name="password"
          className="login-input"
          placeholder="PIN de 4 dígitos"
          maxLength={4}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="current-password"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
        />

        <button type="submit" className="btn-login" disabled={verificando || cargandoLista || fallóLista}>
          {verificando ? 'Verificando...' : 'Ingresar →'}
        </button>

        {fallóLista && (
          <button type="button" onClick={cargarInspectores} className="btn-login"
            style={{ marginTop: 8, background: 'transparent', border: '1px solid rgba(245,241,235,0.35)' }}>
            Reintentar
          </button>
        )}

        {error && (
          <div role="alert" style={{
            color: '#E89B85', fontSize: 12, textAlign: 'center', marginTop: 8,
          }}>{error}</div>
        )}
      </form>

      <div className="login-nota">Acceso restringido · Solo personal autorizado</div>
    </div>
  );
}

// ── Elegir o cambiar el PIN propio (Administración fase 2) ─────────
// 'temporal': pantalla completa con el marco del login. Se llega con el PIN
//   que generó el admin; el backend no deja hacer nada más hasta cambiarlo.
// 'voluntario': modal desde la cabecera; pide también el PIN actual.
// validarPinNuevo (utils.js) evita el viaje; el backend vuelve a validar y
// su mensaje se muestra tal cual.
function CambiarPinScreen({ modo, nombre, onListo, onCancelar }) {
  const [actual, setActual]     = useStateLG('');
  const [pin, setPin]           = useStateLG('');
  const [pin2, setPin2]         = useStateLG('');
  const [error, setError]       = useStateLG('');
  const [enviando, setEnviando] = useStateLG(false);
  const temporal = modo === 'temporal';

  useEffectLG(() => {
    if (temporal) return;
    const onKey = (e) => { if (e.key === 'Escape') onCancelar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [temporal, onCancelar]);

  async function guardar(e) {
    e.preventDefault();
    if (enviando) return;
    if (!temporal && !/^\d{4}$/.test(actual)) { setError('Escribe tu PIN actual.'); return; }
    const err = validarPinNuevo(pin, pin2, temporal ? '' : actual);
    if (err) { setError(err); return; }
    setError('');
    setEnviando(true);
    try {
      await cambiarMiPin(pin, temporal ? '' : actual);
      onListo();
    } catch (ex) {
      setError((ex && ex.message) || 'No se pudo cambiar el PIN.');
      setEnviando(false);
    }
  }

  const campo = (id, etiqueta, valor, set, auto, foco) => (
    <div className="pin-campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4}
        autoComplete={auto} autoFocus={foco} value={valor}
        className={temporal ? 'login-input' : 'pin-input'}
        onChange={e => { set(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }} />
    </div>
  );

  if (temporal) {
    return (
      <div id="pantalla-login" style={{ display: 'flex' }}>
        <div className="login-logo">
          <img src="logo-login.png" alt="Control Urbano" />
        </div>
        <div className="login-titulo">Elige tu PIN</div>
        <div className="login-sub pin-intro">
          Hola, {titleCaseNombre(nombre)}. El PIN que te dieron es temporal: elige uno de 4 dígitos
          que solo tú sepas.
        </div>
        <form className="login-form" onSubmit={guardar}>
          {campo('pin-nuevo', 'Nuevo PIN', pin, setPin, 'new-password', true)}
          {campo('pin-repite', 'Repite el PIN', pin2, setPin2, 'new-password')}
          <button type="submit" className="btn-login" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar mi PIN'}
          </button>
          {error && <div role="alert" className="pin-error-oscuro">{error}</div>}
          <button type="button" className="pin-salir" onClick={onCancelar}>Salir</button>
        </form>
      </div>
    );
  }

  return (
    <div className="dlg-overlay" onClick={onCancelar}>
      <form className="dlg pin-dlg" role="dialog" aria-modal="true" aria-labelledby="pin-dlg-t"
        onClick={e => e.stopPropagation()} onSubmit={guardar}>
        <div className="dlg-titulo" id="pin-dlg-t">Cambiar mi PIN</div>
        <div className="dlg-mensaje">Al cambiarlo se cierran tus sesiones abiertas en otros equipos.</div>
        {campo('pin-actual', 'PIN actual', actual, setActual, 'current-password', true)}
        {campo('pin-nuevo', 'Nuevo PIN', pin, setPin, 'new-password')}
        {campo('pin-repite', 'Repite el PIN', pin2, setPin2, 'new-password')}
        {error && <div role="alert" className="pin-error">{error}</div>}
        <div className="dlg-acciones">
          <button type="button" className="dlg-btn dlg-btn-cancel" onClick={onCancelar}>Cancelar</button>
          <button type="submit" className="dlg-btn dlg-btn-ok" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Cambiar PIN'}
          </button>
        </div>
      </form>
    </div>
  );
}

window.LoginScreen = LoginScreen;
window.CambiarPinScreen = CambiarPinScreen;
