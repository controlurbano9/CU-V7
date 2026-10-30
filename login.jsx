// ═══════════════════════════════════════════════════════════════
// v6/login.jsx — Pantalla de login con webhook real
// ═══════════════════════════════════════════════════════════════
const { useState: useStateLG, useEffect: useEffectLG } = React;

// Marca del login: tres escenas de una cuadra de Bello al pie del Quitasol
// (maqueta propuesta-login-rotacion.html, aprobada 2026-10-29). Rotan en
// orden, una por entrada: la cuadra en regla (la obra encaja en el plano
// aprobado y se encienden las ventanas), amanece (el sol sale por el oriente
// y las ventanas se apagan) y pasa el Metro (la Línea A cruza detrás y la
// cuadra se enciende). Una sola vez, ~3 s, decorativa; el formulario se usa
// desde el primer instante. El estado base de cada escena es su cuadro final
// y con «reducir movimiento» no se mueve (styles.css, «Login como valla»).
const ESCENAS_LOGIN = ['cuadra', 'amanecer', 'metro'];
// Se elige una vez por carga de página: el login se monta más de una vez al
// arrancar y cada montaje avanzaba la rotación.
let _escenaLoginElegida = null;
function _escenaLogin() {
  if (_escenaLoginElegida) return _escenaLoginElegida;
  let i = 0;
  try {
    i = ((parseInt(localStorage.getItem('cu_login_escena'), 10) + 1) || 0) % ESCENAS_LOGIN.length;
    localStorage.setItem('cu_login_escena', String(i));
  } catch (e) {}
  return (_escenaLoginElegida = ESCENAS_LOGIN[i]);
}

// El Quitasol, imponente, al occidente (izquierda).
const _CERRO_D = 'M0 92C8 78 18 56 30 38C42 20 56 7 72 4C86 2 98 9 110 20C124 33 140 44 160 50C176 55 190 58 200 60V109H0Z';

function _VecinosLogin({ cls = '' }) {
  // El último, con la chimenea de ladrillo de Fabricato.
  return (
    <>
      <path className={'vecino ' + cls + '1'} d="M18 108V78h26v30" />
      <path className={'vecino ' + cls + '2'} d="M48 108V62l13-9 13 9v46" />
      <path className={'vecino ' + cls + '3'} d="M136 108V70h22v38M162 108V84h22v24M168 84V52h6v32M166.5 52h9" />
    </>
  );
}

function _EdificioLogin({ conPiso }) {
  // Cuatro pisos de abajo arriba; las ventanas se numeran w1…w8 en ese orden.
  return [90, 71, 52, 33].map((y, i) => (
    <g key={y} className={conPiso ? 'piso p' + (i + 1) : undefined}>
      <rect className="losa" x="82" y={y} width="46" height="17" rx="1" />
      <rect className={'vano w' + (2 * i + 1)} x="90" y={y + 5} width="10" height="8" />
      <rect className={'vano w' + (2 * i + 2)} x="110" y={y + 5} width="10" height="8" />
    </g>
  ));
}

function MarcaLogin() {
  const [escena] = useStateLG(_escenaLogin);
  const calle = <line className="calle" x1="8" y1="109" x2="192" y2="109" />;
  return (
    <div className={'login-marca lm-' + escena} aria-hidden="true">
      <svg viewBox="0 0 200 120">
        {escena === 'amanecer' && (
          <>
            <defs>
              <radialGradient id="lm-resplandor">
                <stop offset="0" stopColor="#FFF4C2" stopOpacity=".34" />
                <stop offset="1" stopColor="#FFF4C2" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle className="resplandor" cx="184" cy="60" r="80" fill="url(#lm-resplandor)" />
            <g className="astro"><circle className="sol" cx="184" cy="60" r="12" /></g>
          </>
        )}
        <path className="cerro" d={_CERRO_D} />
        {escena === 'metro' && (
          <>
            <line className="pila" x1="12" y1="66" x2="12" y2="108" />
            <line className="pila" x1="160" y1="66" x2="160" y2="108" />
            <line className="pila" x1="196" y1="66" x2="196" y2="108" />
            <line className="viaducto" x1="0" y1="65.5" x2="200" y2="65.5" />
            <g className="tren"><g transform="translate(28 45)">
              <path className="vagon" d="M96 19V11.5Q96 9 98.5 9H128V19Z" />
              <path className="vagon" d="M130 19V9H157.5Q162 9 164 13L166 19Z" />
              {[101, 109, 117, 135, 143, 151].map(x => (
                <rect key={x} className="ventanilla" x={x} y="12" width="5" height="3.5" rx=".6" />
              ))}
            </g></g>
          </>
        )}
        {escena === 'cuadra' ? (
          <>
            <_VecinosLogin cls="v" />
            <rect className="plano" x="80" y="31" width="50" height="77" />
            <_EdificioLogin conPiso />
          </>
        ) : (
          <g className="escenario">
            <_VecinosLogin />
            <_EdificioLogin />
          </g>
        )}
        {calle}
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
