// ═══════════════════════════════════════════════════════════════
// v6/login.jsx — Pantalla de login con webhook real
// ═══════════════════════════════════════════════════════════════
const { useState: useStateLG, useEffect: useEffectLG } = React;

// Marca del login: «hasta donde dice la licencia». Se traza la altura
// aprobada, suben los pisos y el último se asienta justo en la línea, sin
// pasarla. Una sola vez por carga (~0,85 s); decorativa. Con «reducir
// movimiento» queda el cuadro final (styles.css).
function MarcaLogin() {
  const piso = (k, y, h) => (
    <g key={k} className={'login-piso p' + k}>
      <rect className="losa" x="28" y={y} width="40" height={h} rx="1.5" />
      <rect className="vano" x="35" y={y + 4.5} width="7" height="6" />
      <rect className="vano" x="54" y={y + 4.5} width="7" height="6" />
    </g>
  );
  return (
    <div className="login-marca" aria-hidden="true">
      <svg viewBox="0 0 96 96">
        <line className="limite" x1="4" y1="24" x2="92" y2="24" />
        {piso(1, 72, 15)}{piso(2, 56, 15)}{piso(3, 40, 15)}{piso(4, 25, 14)}
        <line className="suelo" x1="10" y1="89" x2="86" y2="89" />
      </svg>
    </div>
  );
}

// Cabecera de la placa: escudo de Bello (institucional, no se toca) y el
// título de la pantalla.
function CabeceraLogin({ id, titulo, children }) {
  return (
    <header className="login-cab">
      <img className="login-escudo" src="logo.jpg" alt="Escudo del Municipio de Bello" />
      <div>
        <h1 className="login-titulo" id={id}>{titulo}</h1>
        {children}
      </div>
    </header>
  );
}

function LoginScreen({ onLogin }) {
  const [inspectores, setInspectores] = useStateLG([]);
  const [cargandoLista, setCargandoLista] = useStateLG(true);
  const [nombre, setNombre] = useStateLG('');
  const [pin, setPin] = useStateLG('');
  // { campo: 'nombre' | 'pin' | null, msg }: el error va bajo el campo que
  // falla; sin campo (red, backend), bajo el botón.
  const [error, setError] = useStateLG(null);
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
    setError(null);
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
        setError({ campo: null, msg: 'No se pudo cargar la lista de inspectores. Revisa la señal y toca «Reintentar».' });
      });
  }

  useEffectLG(cargarInspectores, []);

  async function manejarSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!nombre) { setError({ campo: 'nombre', msg: 'Elige tu nombre en la lista.' }); return; }
    if (!pin || pin.length !== 4) { setError({ campo: 'pin', msg: 'El PIN tiene 4 dígitos.' }); return; }

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
      setError({ campo: 'pin', msg: errorMsg });
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

  const errNombre = !!(error && error.campo === 'nombre');
  const errPin = !!(error && error.campo === 'pin');

  return (
    <div id="pantalla-login">
      <MarcaLogin />
      <section className="login-placa" aria-labelledby="login-t">
        <CabeceraLogin id="login-t" titulo="Control Urbano">
          <p className="login-sub">Alcaldía de Bello · Inspección N°9</p>
        </CabeceraLogin>

        <form className="login-form" onSubmit={manejarSubmit} autoComplete="on" noValidate>
          <div className="login-campo">
            <label htmlFor="login-nombre" className="login-rotulo">Inspector</label>
            <select
              id="login-nombre"
              name="username"
              className="login-input"
              autoComplete="username"
              value={nombre}
              aria-invalid={errNombre || undefined}
              aria-describedby={errNombre ? 'login-e-nombre' : undefined}
              onChange={e => { setNombre(e.target.value); if (errNombre) setError(null); }}
              disabled={cargandoLista}>
              <option value="">
                {cargandoLista ? 'Cargando inspectores…' : 'Selecciona tu nombre'}
              </option>
              {inspectores.map(i => (
                <option key={i.nombre} value={i.nombre}>{i.nombre}</option>
              ))}
            </select>
            {errNombre && <p id="login-e-nombre" role="alert" className="login-error-campo">{error.msg}</p>}
          </div>

          <div className="login-campo">
            <label htmlFor="login-pin" className="login-rotulo">PIN</label>
            <input
              type="password"
              id="login-pin"
              name="password"
              className="login-input"
              placeholder="4 dígitos"
              maxLength={4}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="current-password"
              value={pin}
              aria-invalid={errPin || undefined}
              aria-describedby={errPin ? 'login-e-pin' : undefined}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); if (errPin) setError(null); }}
            />
            {errPin && <p id="login-e-pin" role="alert" className="login-error-campo">{error.msg}</p>}
          </div>

          <button type="submit" className="btn-login" disabled={verificando || cargandoLista || fallóLista}>
            {verificando ? 'Verificando…' : cargandoLista ? 'Cargando inspectores…' : 'Ingresar'}
          </button>

          {fallóLista && (
            <button type="button" onClick={cargarInspectores} className="btn-login btn-login-alt">
              Reintentar
            </button>
          )}
          {error && !error.campo && (
            <p role="alert" className="login-error">{error.msg}</p>
          )}
        </form>
      </section>

      <p className="login-nota">Acceso restringido · Solo personal autorizado</p>
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
      <div id="pantalla-login">
        <section className="login-placa" aria-labelledby="pin-t">
          <CabeceraLogin id="pin-t" titulo="Elige tu PIN">
            <p className="login-sub pin-intro">
              Hola, {titleCaseNombre(nombre)}. El PIN que te dieron es temporal: elige uno de 4 dígitos
              que solo tú sepas.
            </p>
          </CabeceraLogin>
        <form className="login-form" onSubmit={guardar}>
          {campo('pin-nuevo', 'Nuevo PIN', pin, setPin, 'new-password', true)}
          {campo('pin-repite', 'Repite el PIN', pin2, setPin2, 'new-password')}
          <button type="submit" className="btn-login" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar mi PIN'}
          </button>
          {error && <div role="alert" className="pin-error-oscuro">{error}</div>}
          <button type="button" className="pin-salir" onClick={onCancelar}>Salir</button>
        </form>
        </section>
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
