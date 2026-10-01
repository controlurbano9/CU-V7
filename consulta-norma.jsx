// ═══════════════════════════════════════════════════════════════
// v6/consulta-norma.jsx — Consulta norma POT con Google Maps Satellite
//
// Geocoding: Google Maps Geocoder (browser-side)
// Mapa: Google Maps (satellite)
// GPS: Geolocation API para capturar coordenadas
// POT: turf.js + GeoJSONs en GitHub (controlurbano9/pot-bello)
// ═══════════════════════════════════════════════════════════════
const { useState: useStateCN, useEffect: useEffectCN, useRef: useRefCN } = React;

// Reutiliza componentes catastrales definidos en nueva-visita.jsx.
// En el bundle final están en el mismo scope; en modo individual de dev,
// quedan expuestos vía window.X y son accesibles por nombre. No reasignamos
// aquí porque esbuild marca colisión al detectar la declaración previa.

const BELLO_BBOX = { latMin: 6.18, latMax: 6.55, lonMin: -75.75, lonMax: -75.40 };
const BELLO_CENTRO = { lat: 6.337, lng: -75.557 };

function dentroDeBello(lat, lon) {
  return lat >= BELLO_BBOX.latMin && lat <= BELLO_BBOX.latMax &&
         lon >= BELLO_BBOX.lonMin && lon <= BELLO_BBOX.lonMax;
}

function geocodeConGoogle(direccion) {
  return new Promise(function(resolve, reject) {
    if (typeof google === 'undefined' || !google.maps || !google.maps.Geocoder) {
      reject(new Error('Google Maps no cargó'));
      return;
    }
    var geocoder = new google.maps.Geocoder();
    var variantes = [
      direccion + ', Bello, Antioquia, Colombia',
      normalizarDireccionGoogle(direccion) + ', Bello, Antioquia, Colombia',
      direccion + ', Bello, Colombia',
    ];
    var intentar = function(idx) {
      if (idx >= variantes.length) {
        reject(new Error('No se encontró la dirección'));
        return;
      }
      geocoder.geocode({ address: variantes[idx] }, function(results, status) {
        if (status === 'OK' && results && results.length > 0) {
          var loc = results[0].geometry.location;
          var lat = loc.lat(), lon = loc.lng();
          if (dentroDeBello(lat, lon)) {
            resolve({ lat: lat, lon: lon, formatted: results[0].formatted_address });
            return;
          }
        }
        intentar(idx + 1);
      });
    };
    intentar(0);
  });
}

// Intenta parsear un texto como coordenadas. Soporta:
//   Grados decimales (DD): 6.337, -75.557
//   DMS: 6d20m13.2sN 75d33m25.2sW
//   DMM: 6d20.220mN 75d33.420mW
//   Google Maps URL: @6.337,-75.557,17z
// Retorna {lat,lon} o null si no es coordenada.
function _parsearCoordenadas(texto) {
  var txt = texto.trim();
  if (!txt) return null;

  // 1. Extraer de URL de Google Maps (...@lat,lon,zoom...)
  var urlMatch = txt.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (urlMatch) {
    var la = parseFloat(urlMatch[1]), lo = parseFloat(urlMatch[2]);
    if (!isNaN(la) && !isNaN(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) return { lat: la, lon: lo };
  }

  // 2. DMS: grados minutos segundos con cardinal N/S/E/W/O
  var dmsRe = new RegExp('(\\d+)[\\u00b0\\u00ba]\\s*(\\d+)[\\u0027\\u2018\\u2019\\u2032]\\s*([\\d.]+)[\\u0022\\u201c\\u201d\\u2033]?\\s*([NSns])\\s*[,;]?\\s*(\\d+)[\\u00b0\\u00ba]\\s*(\\d+)[\\u0027\\u2018\\u2019\\u2032]\\s*([\\d.]+)[\\u0022\\u201c\\u201d\\u2033]?\\s*([EWOewo])');
  var dmsM = txt.match(dmsRe);
  if (dmsM) {
    var lat = parseInt(dmsM[1]) + parseInt(dmsM[2]) / 60 + parseFloat(dmsM[3]) / 3600;
    if (dmsM[4].toUpperCase() === 'S') lat = -lat;
    var lon = parseInt(dmsM[5]) + parseInt(dmsM[6]) / 60 + parseFloat(dmsM[7]) / 3600;
    if (dmsM[8].toUpperCase() === 'W' || dmsM[8].toUpperCase() === 'O') lon = -lon;
    return { lat: lat, lon: lon };
  }

  // 3. DMM: grados minutos decimales con cardinal
  var dmmRe = new RegExp('(\\d+)[\\u00b0\\u00ba]\\s*([\\d.]+)[\\u0027\\u2018\\u2019\\u2032]\\s*([NSns])\\s*[,;]?\\s*(\\d+)[\\u00b0\\u00ba]\\s*([\\d.]+)[\\u0027\\u2018\\u2019\\u2032]\\s*([EWOewo])');
  var dmmM = txt.match(dmmRe);
  if (dmmM) {
    var lat = parseInt(dmmM[1]) + parseFloat(dmmM[2]) / 60;
    if (dmmM[3].toUpperCase() === 'S') lat = -lat;
    var lon = parseInt(dmmM[4]) + parseFloat(dmmM[5]) / 60;
    if (dmmM[6].toUpperCase() === 'W' || dmmM[6].toUpperCase() === 'O') lon = -lon;
    return { lat: lat, lon: lon };
  }

  // 4. Grados decimales: "6.337, -75.557" o "6.337 -75.557"
  //    También acepta con N/S/E/W/O: "6.337N 75.557W"
  var ddCardinal = txt.match(/([\d.]+)\s*([NSns])\s*[,;\s]+\s*([\d.]+)\s*([EWOewo])/);
  if (ddCardinal) {
    var lat = parseFloat(ddCardinal[1]);
    if (ddCardinal[2].toUpperCase() === 'S') lat = -lat;
    var lon = parseFloat(ddCardinal[3]);
    if (ddCardinal[4].toUpperCase() === 'W' || ddCardinal[4].toUpperCase() === 'O') lon = -lon;
    if (!isNaN(lat) && !isNaN(lon)) return { lat: lat, lon: lon };
  }

  // 5. DD simple: dos números separados por coma/espacio
  var partes = txt.split(/[,;\s]+/).filter(Boolean);
  if (partes.length >= 2) {
    var a = parseFloat(partes[0]), b = parseFloat(partes[1]);
    if (!isNaN(a) && !isNaN(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) {
      return { lat: a, lon: b };
    }
  }

  return null;
}

function ConsultaNormaScreen() {
  const [consulta, setConsulta] = useStateCN('');
  const [punto, setPunto] = useStateCN(null);
  const [resultado, setResultado] = useStateCN(null);
  const [busyGeo, setBusyGeo] = useStateCN(false);
  const [busyGPS, setBusyGPS] = useStateCN(false);
  const [busyPOT, setBusyPOT] = useStateCN(false);
  const [busyCat, setBusyCat] = useStateCN(false);
  const [catastro, setCatastro] = useStateCN(null);  // array de fichas o null
  const [catastroOpen, setCatastroOpen] = useStateCN(true);
  const [error, setError] = useStateCN('');
  // Aviso neutro (no error): la placa no está en catastro y el pin se puso en el vecino.
  const [aviso, setAviso] = useStateCN('');
  // Búsqueda por ficha, matrícula o código catastral (buscarCatastroPorDato).
  // `candidatos`: el dato está en varios predios y el usuario elige cuál.
  // `hallado`: { etiqueta, tcod, catastrales } del predio que se está viendo,
  // para destacar la ficha que calzó sobre el resto de las del predio.
  const [candidatos, setCandidatos] = useStateCN(null);
  const [hallado, setHallado] = useStateCN(null);
  const resultadosRef = useRefCN(null);

  const mapDivRef = useRefCN(null);
  const mapRef = useRefCN(null);
  const markerRef = useRefCN(null);
  // null = esperando el script `async` de Maps · true = listo · false = se rindió.
  // Antes este efecto corría con deps [] y, si Maps aún no había cargado,
  // dejaba el error fijo "Google Maps no cargó. Recarga la página." sin volver
  // a intentarlo nunca. `_cuandoGoogleMapsListo` vive en nueva-visita.jsx
  // (build.js concatena los .jsx en un solo scope, en ese orden).
  const [gmListoCN, setGmListoCN] = useStateCN(
    (typeof google !== 'undefined' && google.maps) ? true : null
  );
  useEffectCN(() => {
    if (gmListoCN !== null) return;
    return _cuandoGoogleMapsListo(setGmListoCN);
  }, [gmListoCN]);
  useEffectCN(() => {
    if (gmListoCN === false) setError('Google Maps no cargó. Revisa la conexión y recarga la página.');
  }, [gmListoCN]);

  // Montar Google Maps (satellite)
  useEffectCN(() => {
    if (gmListoCN !== true) return;
    if (mapRef.current || !mapDivRef.current) return;

    var map = new google.maps.Map(mapDivRef.current, {
      center: BELLO_CENTRO,
      zoom: 13,
      mapTypeId: 'hybrid',
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_RIGHT,
        mapTypeIds: ['hybrid', 'roadmap'],
      },
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: 'greedy',
    });

    map.addListener('click', function(e) {
      var lat = e.latLng.lat(), lon = e.latLng.lng();
      if (!dentroDeBello(lat, lon)) {
        setError('El punto está fuera del municipio de Bello.');
        return;
      }
      colocarPin(lat, lon, true);
    });

    mapRef.current = map;
    return () => {
      google.maps.event.clearInstanceListeners(map);
      if (markerRef.current) google.maps.event.clearInstanceListeners(markerRef.current);
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [gmListoCN]);

  // Contorno catastral del predio bajo el pin (helper en nueva-visita.jsx).
  const predioCNRef = useRefCN([]);
  useEffectCN(() => {
    if (gmListoCN !== true || !mapRef.current) return;
    return _resaltarPredioCatastral(mapRef.current, predioCNRef,
      punto ? punto.lat : null, punto ? punto.lon : null);
  }, [punto, gmListoCN]);

  function colocarPin(lat, lon, consultar) {
    setError(''); setAviso('');
    setPunto({ lat, lon });
    var map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setPosition({ lat, lng: lon });
    } else {
      var m = new google.maps.Marker({
        position: { lat, lng: lon },
        map: map,
        draggable: true,
      });
      m.addListener('dragend', function() {
        var pos = m.getPosition();
        var lt = pos.lat(), ln = pos.lng();
        if (!dentroDeBello(lt, ln)) {
          setError('Punto fuera de Bello.');
          m.setPosition(BELLO_CENTRO);
          setPunto({ lat: BELLO_CENTRO.lat, lon: BELLO_CENTRO.lng });
          return;
        }
        setPunto({ lat: lt, lon: ln });
        setAviso('');
        consultarNorma(lt, ln);
      });
      markerRef.current = m;
    }
    map.setCenter({ lat, lng: lon });
    if (map.getZoom() < 17) map.setZoom(17);
    if (consultar) consultarNorma(lat, lon);
  }

  // Capturar coordenadas GPS — directo, sin paso de confirmación.
  // Para la pestaña Norma (consulta rápida) preferimos getCurrentPosition:
  // un solo intento, sin refinamiento progresivo. El usuario toca el botón
  // → llega la lectura → se consulta la norma de inmediato.
  // En el formulario de Nueva Visita sí usamos watchPosition refinado.
  const [gpsAccCN, setGpsAccCN] = useStateCN(null);
  // getCurrentPosition no se puede cancelar; este ref se mantiene para
  // limpiar en el desmontaje (consistencia con el flujo watchPosition del
  // formulario) — no hay botón de cancelar en esta pantalla.
  const geoWatchCNRef = useRefCN(null);
  function _detenerGeoCN() {
    if (geoWatchCNRef.current != null) {
      try { navigator.geolocation.clearWatch(geoWatchCNRef.current); } catch (e) {}
      geoWatchCNRef.current = null;
    }
  }
  useEffectCN(function() { return _detenerGeoCN; }, []);

  function capturarGPS() {
    if (!navigator.geolocation) {
      setError('Tu dispositivo no soporta geolocalización.');
      return;
    }
    if (busyGPS) return;   // doble-click defensivo
    setBusyGPS(true); setError(''); setGpsAccCN(null);
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        setBusyGPS(false);
        var lat = pos.coords.latitude;
        var lon = pos.coords.longitude;
        var acc = pos.coords.accuracy;
        setGpsAccCN(Math.round(acc));
        if (!dentroDeBello(lat, lon)) {
          setError('Tu ubicación está fuera de Bello.');
          return;
        }
        colocarPin(lat, lon, true);   // consulta norma inmediatamente
      },
      function(err) {
        setBusyGPS(false);
        var msg = err.code === 1 ? 'Permiso de ubicación denegado. Habilítalo en los ajustes del navegador.' :
                  err.code === 2 ? 'GPS no disponible. Verifica que la ubicación esté encendida y estás al aire libre.' :
                  err.code === 3 ? 'Tiempo de espera agotado. Intenta en un lugar con mejor señal.' :
                  'No se pudo obtener la ubicación: ' + (err.message || '');
        setError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // Búsqueda unificada: detecta automáticamente si es coordenada o dirección
  async function buscar() {
    setError(''); setAviso(''); setResultado(null);
    setCandidatos(null); setHallado(null);
    var txt = consulta.trim();
    if (!txt) { setError('Ingresa una dirección, coordenadas o un dato catastral.'); return; }

    // Dato catastral antes que coordenadas: un código escrito con espacios
    // (`05 088 01 …`) se leería como latitud y longitud.
    var claveCat = claveBusquedaCatastral(txt);
    if (claveCat) { await buscarPorDatoCatastral(claveCat, txt); return; }

    // Intentar parsear como coordenadas
    var coords = _parsearCoordenadas(txt);
    if (coords) {
      if (!dentroDeBello(coords.lat, coords.lon)) {
        setError('Las coordenadas están fuera del municipio de Bello.');
        return;
      }
      colocarPin(coords.lat, coords.lon, true);
      return;
    }

    // No son coordenadas → geocodificar como dirección
    setBusyGeo(true);
    // Catastro primero: si la dirección está tal cual, el pin va dentro de su
    // predio (exacto y sin red). Si la placa no existe pero hay vecinas en la
    // misma cuadra, el pin va al vecino del mismo costado: el geocoder de
    // Google interpola sobre la vía y se iba decenas de metros (DG 58 45-16
    // caía en 45-84, a 63 m). Solo sin nada en catastro se usa el geocoder.
    if (typeof buscarCatastroPorDireccion === 'function') {
      try {
        var pc = await buscarCatastroPorDireccion(txt);
        var t0 = null;
        if (pc && pc.exacta && pc.terrenos.length) t0 = pc.terrenos[0];
        else if (pc && pc.terrenos.length) t0 = terrenoVecinoPreferido(claveDireccionCatastro(txt), pc.terrenos);
        var q0 = t0 && puntoInteriorAnillo(t0.anillo);
        if (q0) {
          colocarPin(q0[0], q0[1], true);
          if (!pc.exacta) {
            setAviso('La placa no está en catastro. El pin quedó en el predio vecino ' +
              t0.direccion + '; si no es el de la visita, toca el mapa sobre el correcto.');
          }
          setBusyGeo(false);
          return;
        }
      } catch (eCat) { /* sin catastro.json: se sigue con el geocoder */ }
    }
    try {
      var res = await geocodeConGoogle(txt);
      colocarPin(res.lat, res.lon, true);
    } catch (e1) {
      try {
        var variantes = [
          normalizarDireccionGoogle(txt) + ', Bello, Antioquia, Colombia',
          txt + ', Bello, Antioquia, Colombia',
          txt + ', Bello',
        ];
        var encontrado = null;
        for (var q of variantes) {
          var r = await geocodeDireccion(q);
          var c = r.data || r;
          if (c && c.lat && c.lng && dentroDeBello(c.lat, c.lng)) {
            encontrado = { lat: c.lat, lon: c.lng };
            break;
          }
        }
        if (encontrado) {
          colocarPin(encontrado.lat, encontrado.lon, true);
        } else {
          setError('No se encontró dentro de Bello. Verifica la dirección (ej: CL 50 32-10) o pega coordenadas (ej: 6.337, -75.557).');
        }
      } catch (e2) {
        // e2 (fallback del webhook) es más específico que e1 (el geocoder del
        // navegador, siempre "No se encontró la dirección"): mostrar e2 primero.
        setError('Error buscando: ' + (e2.message || e1.message));
      }
    }
    setBusyGeo(false);
  }

  // Ficha, matrícula o código catastral → predio. Con un solo predio va
  // directo; con varios (matrícula repetida, o un número que es ficha de uno
  // y matrícula de otro) se listan para elegir.
  async function buscarPorDatoCatastral(clave, txt) {
    setBusyGeo(true);
    try {
      var res = await buscarCatastroPorDato(clave);
      var que = clave.tipo === 'matricula' ? 'matrícula'
        : clave.tipo === 'numero' ? 'ficha o matrícula' : 'código catastral';
      if (!res.predios.length) {
        // Sin resultado no queda a la vista el predio de la consulta anterior:
        // se leería como si fuera el del dato que se acaba de teclear.
        quitarPin(); setCatastro(null);
        setError(clave.tipo === 'codigo'
          ? 'Ese código catastral no está en el catastro 2026. Revisa los dígitos: son 30 (o los 21 del terreno).'
          : 'No hay ningún predio con ' + que + ' ' + txt + ' en el catastro 2026.');
      } else if (res.predios.length === 1) {
        irAPredio(res.predios[0], res.unidadNoHallada
          ? 'Esa unidad no está en catastro, pero el terreno sí: se muestran todas sus fichas.'
          : '');
      } else {
        setCandidatos({ titulo: res.predios.length + ' predios con ' + que + ' ' + txt, predios: res.predios });
      }
    } catch (e) {
      setError('No se pudo consultar el catastro. Revisa la conexión e intenta de nuevo.');
    }
    setBusyGeo(false);
  }

  // En una columna (móvil) la ficha y la norma quedan debajo del mapa: al
  // elegir un candidato no se veía cambiar nada. Si ya están a la vista
  // (dos columnas), no se mueve la pantalla.
  function mostrarResultados() {
    setTimeout(function () {
      var el = resultadosRef.current;
      if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 0);
  }

  function quitarPin() {
    setPunto(null);
    if (markerRef.current) { markerRef.current.setMap(null); markerRef.current = null; }
  }

  function irAPredio(p, avisoExtra) {
    var numero = function (campo) {
      var f = p.fichas.filter(function (r) { return p.halladas.indexOf(r.catastral) >= 0; })[0];
      return f ? ' ' + f[campo] : '';
    };
    setHallado({
      tcod: p.tcod,
      catastrales: p.halladas,
      etiqueta: p.por === 'ficha' ? 'Ficha' + numero('ficha')
        : p.por === 'matricula' ? 'Matrícula' + numero('matricula') : 'Código catastral',
    });
    setCatastroOpen(true);
    var q = p.anillo && puntoInteriorAnillo(p.anillo);
    if (q) {
      colocarPin(q[0], q[1], false);
      consultarNorma(q[0], q[1], p);
      if (avisoExtra) setAviso(avisoExtra);
      return;
    }
    // Terreno sin contorno en catastro.json: hay ficha, pero no dónde poner
    // el pin ni con qué punto cruzar el POT.
    setError(''); setResultado(null);
    quitarPin();
    setCatastro(p.fichas);
    setAviso('Este predio está en catastro pero sin contorno en el mapa: se muestra su ficha. ' +
      'Para la norma POT, toca el mapa sobre el predio.');
  }

  // `predio` (búsqueda por dato catastral): sus fichas ya se conocen, no se
  // vuelven a buscar por el punto. Sin él —mapa, GPS, dirección— la consulta
  // deja de ser la de ese dato y se olvidan el destacado y los candidatos.
  async function consultarNorma(lat, lon, predio) {
    setBusyPOT(true); setResultado(null); setCatastro(null);
    consultarPOT(lat, lon)
      .then(r => setResultado(r))
      .catch(e => setError('Error consultando POT: ' + e.message))
      .finally(() => setBusyPOT(false));
    if (predio) { setCatastro(predio.fichas); setBusyCat(false); return; }
    setHallado(null); setCandidatos(null);
    setBusyCat(true);
    buscarCatastroGPS(lat, lon)
      .then(r => setCatastro(r))
      .catch(e => { console.warn('Catastro:', e); setCatastro([]); })
      .finally(() => setBusyCat(false));
  }

  function limpiar() {
    setConsulta(''); setError(''); setAviso('');
    setPunto(null); setResultado(null); setCatastro(null);
    setCandidatos(null); setHallado(null);
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    if (mapRef.current) {
      mapRef.current.setCenter(BELLO_CENTRO);
      mapRef.current.setZoom(13);
    }
  }

  return (
    <div className="pantalla activa pad-bottom cn-pantalla">
      {/* Dos columnas ≥1440 (ver .cn-pantalla en styles.css): búsqueda y
          mapa a la izquierda, resultados (alerta municipal, catastro y
          norma POT) a la derecha. Solo JSX movido, la lógica no cambia. */}
      <div className="page-title" style={{ marginBottom: 6 }}>Consultar norma POT</div>
      <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginBottom: 14 }}>
        Busca por dirección, coordenadas, ficha, matrícula o código catastral; captura tu ubicación GPS o toca el mapa.
      </div>

      <div className="cn-col">

      {/* Campo unificado: dirección, coordenadas o dato catastral */}
      <div className="card" style={{ marginBottom: 12 }}>
        <label htmlFor="cn-direccion-coordenadas" style={{ display: 'block', fontSize: 12, color: 'var(--texto-suave)', marginBottom: 4 }}>
          Dirección, coordenadas o dato catastral
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="cn-direccion-coordenadas"
            value={consulta}
            onChange={e => setConsulta(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') buscar(); }}
            placeholder="CL 50 32-10, ficha o matrícula"
            aria-describedby="cn-busqueda-ayuda"
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--borde)', background: 'var(--superficie)',
              fontFamily: 'inherit', fontSize: 14,
            }}
          />
          <button onClick={buscar} disabled={busyGeo} className="btn-principal"
            style={{ padding: '0 18px', fontSize: 13, width: 'auto' }}>
            {busyGeo ? '...' : 'Buscar'}
          </button>
        </div>
        <div id="cn-busqueda-ayuda" style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 4 }}>
          Catastro: ficha, matrícula (con o sin 01N-) o código de 30 dígitos. Coordenadas: decimales, DMS, DMM o link de Google Maps.
        </div>
        <button onClick={capturarGPS} disabled={busyGPS} style={{
          marginTop: 8, width: '100%', padding: '10px 14px', borderRadius: 8,
          border: '1.5px solid var(--brand-accent)', background: 'var(--superficie)',
          color: 'var(--brand-accent)', fontSize: 13, fontWeight: 600,
          fontFamily: 'inherit', cursor: busyGPS ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: busyGPS ? 0.7 : 1,
        }}>
          {busyGPS
            ? <><Icon.Clock size={16} /> Capturando ubicación…</>
            : <><Icon.Pin size={16} /> Capturar mis coordenadas</>}
        </button>
        {/* Precisión solo se muestra tras una captura exitosa */}
        {!busyGPS && gpsAccCN != null && React.createElement('div', {
          style: { textAlign: 'center', marginTop: 4, fontSize: 12, fontWeight: 600,
            color: gpsAccCN <= 10 ? 'var(--verde-dark)' : gpsAccCN <= 25 ? 'var(--cafe)' : 'var(--rojo)' }
        }, 'Precisión: ±' + gpsAccCN + 'm')}
      </div>

      {/* El dato catastral está en varios predios: se elige uno. La lista se
          queda a la vista para poder pasar de uno a otro sin volver a buscar. */}
      {candidatos && (
        <div className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px 10px' }}>
            <div className="card-titulo" style={{ margin: 0 }}>{candidatos.titulo}</div>
            <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginTop: 2 }}>
              Elige el predio que buscas.
            </div>
          </div>
          <div className="cn-cand-lista">
            {candidatos.predios.map(p => {
              var f = p.fichas.filter(r => p.halladas.indexOf(r.catastral) >= 0)[0] || p.fichas[0];
              var activo = !!hallado && hallado.tcod === p.tcod;
              return (
                <button type="button" key={p.tcod} className="cn-cand"
                  aria-pressed={activo} onClick={() => { irAPredio(p); mostrarResultados(); }}>
                  <span className="cn-cand-txt">
                    <span className="cn-cand-dir">{f.direccion || 'Sin dirección'}</span>
                    <span className="cn-cand-meta">
                      {p.por === 'ficha' ? 'Ficha ' + f.ficha : 'Matrícula ' + f.matricula}
                      {p.por === 'ficha' ? (f.matricula ? ' · Matrícula ' + f.matricula : '') : ' · Ficha ' + f.ficha}
                      {p.halladas.length > 1 ? ' · ' + p.halladas.length + ' fichas' : ''}
                    </span>
                  </span>
                  <span className="cn-cand-ir"><Icon.Chevron size={14} /></span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mapa Google Maps */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        <div ref={mapDivRef} className="mapa-norma"></div>
        {punto && (
          <div style={{
            padding: '8px 12px', borderTop: '1px solid var(--borde)',
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--texto-suave)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          }}>
            <span>{punto.lat.toFixed(6)}, {punto.lon.toFixed(6)}</span>
            <a href={`https://maps.google.com/?q=${punto.lat},${punto.lon}`} target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--brand-accent)', textDecoration: 'none', fontSize: 11 }}>
              Abrir en Google Maps ↗
            </a>
          </div>
        )}
      </div>

      {aviso && !error && (
        <div className="card" style={{
          color: 'var(--cafe)', background: 'var(--amarillo-bg)',
          marginBottom: 12, fontSize: 13,
        }}>
          {aviso}
        </div>
      )}
      {error && (
        <div className="card" style={{
          color: 'var(--rojo)', background: 'var(--rojo-bg)',
          borderColor: 'rgba(180,58,46,0.3)', marginBottom: 12, fontSize: 13,
        }}>
          {error}
        </div>
      )}
      </div>{/* .cn-col */}

      {/* Alerta predio municipal: fuera del panel de catastro, justo después del mapa */}
      <div className="cn-col cn-col-der" ref={resultadosRef} style={{ scrollMarginTop: 12 }}>
      {!busyCat && catastro && catastro.some(r => r.municipal) && (
        <div style={{
          padding: '12px 14px', borderRadius: 'var(--r-md)', marginBottom: 12,
          background: 'var(--rojo-bg)', border: '1.5px solid var(--rojo)',
          color: 'var(--brand-ink)', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <Icon.Alert size={18} />
          <div>Predio del <strong>Municipio de Bello</strong></div>
        </div>
      )}

      {/* Consulta Catastro — acordeón, encima del panel POT */}
      {(busyCat || catastro) && (
        <div className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
          <button type="button" className="btn-cabecera"
            onClick={() => setCatastroOpen(!catastroOpen)}
            aria-expanded={catastroOpen}
            style={{
              padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: catastroOpen ? '1px solid var(--borde)' : 'none',
              userSelect: 'none',
            }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="card-titulo" style={{ margin: 0 }}>Consulta Catastro</span>
              {catastro && catastro.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                  background: 'var(--azul-bg)', color: 'var(--azul)',
                }}>{catastro.length} {catastro.length === 1 ? 'ficha' : 'fichas'}</span>
              )}
            </span>
            <span style={{ color: 'var(--texto-suave)', display: 'inline-flex' }}>
              {catastroOpen ? <Icon.ChevronUp size={14} /> : <Icon.Chevron size={14} />}
            </span>
          </button>
          {catastroOpen && (
            <div style={{ padding: '12px 16px' }}>
              {busyCat && (
                <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--texto-suave)', fontSize: 13 }}>
                  Consultando catastro...
                </div>
              )}
              {!busyCat && catastro && catastro.length === 0 && (
                <div style={{ color: 'var(--texto-suave)', fontSize: 13, textAlign: 'center', padding: '14px 0' }}>
                  El punto no cae dentro de ningún predio del catastro 2026.
                </div>
              )}
              {!busyCat && catastro && catastro.length > 0 && (() => {
                // Búsqueda por ficha o matrícula en una PH: la que calzó va
                // arriba y abierta; el resto del predio, debajo y aparte.
                var cats = hallado ? hallado.catastrales : [];
                var halladas = catastro.filter(r => cats.indexOf(r.catastral) >= 0);
                if (!halladas.length) {
                  return catastro.length === 1
                    ? <_TarjetaFichaCatastral r={catastro[0]} expandida={true} />
                    : <_ListaFichasCatastrales fichas={catastro} maxAlto={420} />;
                }
                var resto = catastro.filter(r => cats.indexOf(r.catastral) < 0);
                return (
                  <>
                    <div className="cn-cat-rotulo">Coincide con tu búsqueda · {hallado.etiqueta}</div>
                    {halladas.map(r => (
                      <_TarjetaFichaCatastral key={r.catastral} r={r} expandida={halladas.length <= 3} />
                    ))}
                    {resto.length > 0 && (
                      <>
                        <div className="cn-cat-rotulo" style={{ marginTop: 12 }}>
                          {resto.length === 1 ? 'Otra ficha del mismo predio' : 'Otras ' + resto.length + ' fichas del mismo predio'}
                        </div>
                        <_ListaFichasCatastrales key={hallado.tcod} fichas={resto} maxAlto={320} />
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Resultado POT — siempre visible */}
      <div className="card">
        <div className="card-titulo" style={{ marginBottom: 12 }}>Norma POT</div>
        {!resultado && !busyPOT && (
          <div style={{ color: 'var(--texto-suave)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            {catastro && catastro.length > 0 && !punto
              ? 'Sin punto en el mapa — toca el mapa sobre el predio para ver su norma.'
              : 'Sin consulta — busca un predio o toca el mapa.'}
          </div>
        )}
        {busyPOT && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--texto-suave)', fontSize: 13 }}>
            Consultando norma POT...
          </div>
        )}
        {resultado && !busyPOT && (() => {
          // Comuna: preferir el valor del Comunas.geojson (point-in-polygon, más exacto);
          // si no está, derivar del barrio sugerido.
          // En rural no hay comuna: las 12 comunas del POT son urbanas. El
          // fallback por barrio también se salta (devolvería la comuna de una
          // vereda homónima).
          var esRuralCN = resultado.ambito === 'Rural';
          var comuna = esRuralCN ? '' : (resultado.comuna ||
            ((typeof window._lookupComunaPorBarrio === 'function')
              ? window._lookupComunaPorBarrio(resultado.barrioSugerido) : ''));
          var comunaLabel = esRuralCN ? 'No aplica (rural)'
            : comuna ? (comuna === 'Vereda' ? 'Vereda' : 'Comuna ' + comuna) : '—';
          return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
            <CampoResultado label="Clasificación del suelo" valor={resultado.clasificacion || '—'} />
            <CampoResultado label="Polígono uso suelo" valor={resultado.poligono || '—'} />
            <CampoResultado label="Tratamiento urbanístico" valor={resultado.tratamiento || '—'} />
            <CampoResultado label="Franja de intensidad" valor={resultado.intensidad || '—'} />
            <CampoResultado
              label="Suelo de protección"
              valor={resultado.sueloProt === 'SI'
                ? (resultado.sueloProtCategoria || 'SI')
                : 'NO'}
            />
            <CampoResultado
              label="Amenaza natural"
              valor={resultado.amenaza === 'SI'
                ? (resultado.amenazaTipo
                    ? (resultado.amenazaTipo + (resultado.amenazaCategoria ? ' (' + resultado.amenazaCategoria + ')' : ''))
                    : 'SI')
                : 'NO'}
            />
            <CampoResultado label="Retiro corrientes" valor={resultado.enRetiro || 'NO'} />
            <CampoResultado label="Comuna" valor={comunaLabel} />
            <CampoResultado label="Barrio / Vereda" valor={resultado.barrioSugerido || '—'} />
            {/* DRMI: solo se muestra cuando el predio cae dentro */}
            {resultado.enDRMI === 'SI' && (
              <CampoResultado
                label="DRMI"
                valor={resultado.drmiNombre || 'Cerro Quitasol - La Holanda'}
                span={2}
              />
            )}
          </div>
          );
        })()}

        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={limpiar} style={{
            background: 'var(--gris-bg)', border: '1px solid var(--borde)',
            borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>Limpiar</button>
        </div>
      </div>
      </div>{/* .cn-col-der */}
    </div>
  );
}

function CampoResultado({ label, valor, span }) {
  var positivo = valor === 'SI';
  var negativo = valor === 'NO';
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8, background: 'var(--gris-bg)',
      border: '1px solid var(--borde)', gridColumn: span === 2 ? 'span 2' : undefined,
    }}>
      <div style={{ fontSize: 10, color: 'var(--texto-suave)', textTransform: 'uppercase',
        letterSpacing: 0.4, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 600,
        color: positivo ? 'var(--rojo)' : negativo ? 'var(--verde)' : 'var(--texto)',
      }}>
        {valor}
      </div>
    </div>
  );
}

function normalizarDireccionGoogle(dir) {
  var d = String(dir || '').trim().toUpperCase();
  d = d.replace(/^CL\s+/i, 'Calle ')
       .replace(/^CR\s+/i, 'Carrera ')
       .replace(/^KR\s+/i, 'Carrera ')
       .replace(/^TV\s+/i, 'Transversal ')
       .replace(/^AV\s+/i, 'Avenida ')
       .replace(/^DG\s+/i, 'Diagonal ')
       .replace(/^CQ\s+/i, 'Circular ');
  d = d.replace(/(\d+[A-Z]?)\s+(\d+[A-Z]?-\d+)/, '$1 #$2');
  return d;
}

window.ConsultaNormaScreen = ConsultaNormaScreen;
