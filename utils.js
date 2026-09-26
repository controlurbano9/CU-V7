// ═══════════════════════════════════════════════════════════════
// utils.js — Utilidades compartidas: fechas, días hábiles, festivos CO
// Cargado antes de cualquier JSX.
// ═══════════════════════════════════════════════════════════════

// ── Formatear cualquier fecha a DD/MM/AAAA ────────────────────
// Acepta: ISO (2025-06-15T05:00:00.000Z), YYYY-MM-DD, DD/MM/YYYY,
//         DD/MM/YYYY · hora, Date objects, vacío/null.
function formatearFecha(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return '';
    return _padFecha(valor.getDate(), valor.getMonth() + 1, valor.getFullYear());
  }
  var s = String(valor).trim();
  if (!s) return '';
  // Quitar parte de hora si viene con separador " · "
  s = s.split(' · ')[0].trim();
  // Formato DD/MM/YYYY (ya correcto, solo validar)
  var m1 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m1) return _padFecha(+m1[1], +m1[2], +m1[3]);
  // Formato YYYY-MM-DD o ISO completo
  var m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m2) return _padFecha(+m2[3], +m2[2], +m2[1]);
  // Intentar con Date nativo
  var d = new Date(s);
  if (!isNaN(d.getTime())) return _padFecha(d.getDate(), d.getMonth() + 1, d.getFullYear());
  return s; // devolver tal cual si no se pudo parsear
}

// Fecha + hora local (America/Bogota) para timestamps del backend, que
// llegan como ISO. Devuelve "DD/MM/YYYY HH:mm" o '' si no es parseable.
function formatearFechaHora(valor) {
  if (!valor) return '';
  var d = (valor instanceof Date) ? valor : new Date(String(valor).trim());
  if (isNaN(d.getTime())) return formatearFecha(valor);
  var f = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce(function(a, p) { a[p.type] = p.value; return a; }, {});
  return f.day + '/' + f.month + '/' + f.year + ' ' + f.hour + ':' + f.minute;
}

// "ALEJANDRO HERNANDEZ MUÑOZ" → "Alejandro Hernandez" (los nombres de
// USUARIOS vienen en mayúsculas sin tildes).
function titleCaseNombre(nombre) {
  return String(nombre || '').trim().split(/\s+/).slice(0, 2)
    .map(function(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ''; })
    .join(' ');
}

function _padFecha(dia, mes, anio) {
  return String(dia).padStart(2, '0') + '/' + String(mes).padStart(2, '0') + '/' + anio;
}

// ── Parsear fecha a Date (sin hora, medianoche local) ─────────
function parsearFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  var s = String(valor).trim().split(' · ')[0].trim();
  var m1 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m1) {
    var dd = +m1[1], mm = +m1[2], aa = +m1[3];
    var dt1 = new Date(aa, mm - 1, dd);
    // new Date() normaliza desbordes (31/02 → 3 de marzo) en vez de fallar;
    // si el resultado no coincide con lo pedido, la fecha no era real.
    if (dt1.getFullYear() !== aa || dt1.getMonth() !== mm - 1 || dt1.getDate() !== dd) return null;
    return dt1;
  }
  var m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ── Festivos colombianos 2025-2026 (Ley Emiliani) ────────────
// Festivos fijos + movibles calculados.
// Ley 51/1983: ciertos festivos se trasladan al lunes siguiente.
function _festivosColombia(anio) {
  var fijos = [
    [0, 1],   // 1 ene — Año nuevo
    [4, 1],   // 1 may — Día del trabajo
    [6, 20],  // 20 jul — Independencia
    [7, 7],   // 7 ago — Batalla de Boyacá
    [11, 8],  // 8 dic — Inmaculada Concepción
    [11, 25], // 25 dic — Navidad
  ];
  // Festivos que se mueven al lunes (Ley Emiliani)
  var emiliani = [
    [0, 6],   // 6 ene — Reyes Magos
    [2, 19],  // 19 mar — San José
    [5, 29],  // 29 jun — San Pedro y San Pablo
    [7, 15],  // 15 ago — Asunción
    [9, 12],  // 12 oct — Día de la Raza
    [10, 1],  // 1 nov — Todos los Santos
    [10, 11], // 11 nov — Independencia de Cartagena
  ];

  var festivos = [];

  // Agregar fijos (no se mueven)
  fijos.forEach(function(f) { festivos.push(new Date(anio, f[0], f[1])); });

  // Agregar Emiliani (se mueven al lunes siguiente si no caen lunes)
  emiliani.forEach(function(f) {
    var d = new Date(anio, f[0], f[1]);
    var dia = d.getDay(); // 0=dom, 1=lun, ... 6=sab
    if (dia === 1) { festivos.push(d); return; } // ya es lunes
    // Mover al siguiente lunes
    var offset = dia === 0 ? 1 : (8 - dia);
    festivos.push(new Date(anio, f[0], f[1] + offset));
  });

  // Festivos basados en Pascua (movibles por definición)
  var pascua = _calcularPascua(anio);
  // Jueves Santo: Pascua - 3
  festivos.push(new Date(pascua.getTime() - 3 * 86400000));
  // Viernes Santo: Pascua - 2
  festivos.push(new Date(pascua.getTime() - 2 * 86400000));
  // Ascensión: Pascua + 43 días (se mueve al lunes)
  var ascension = new Date(pascua.getTime() + 43 * 86400000);
  festivos.push(_alLunes(ascension));
  // Corpus Christi: Pascua + 64 días (se mueve al lunes)
  var corpus = new Date(pascua.getTime() + 64 * 86400000);
  festivos.push(_alLunes(corpus));
  // Sagrado Corazón: Pascua + 71 días (se mueve al lunes)
  var sagrado = new Date(pascua.getTime() + 71 * 86400000);
  festivos.push(_alLunes(sagrado));

  return festivos;
}

// Mover una fecha al lunes siguiente (si no es lunes)
function _alLunes(d) {
  var dia = d.getDay();
  if (dia === 1) return d;
  var offset = dia === 0 ? 1 : (8 - dia);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
}

// Algoritmo de Gauss para Pascua
function _calcularPascua(anio) {
  var a = anio % 19;
  var b = Math.floor(anio / 100);
  var c = anio % 100;
  var d = Math.floor(b / 4);
  var e = b % 4;
  var f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4);
  var k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7;
  var m = Math.floor((a + 11 * h + 22 * l) / 451);
  var mes = Math.floor((h + l - 7 * m + 114) / 31);
  var dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

// Cache de festivos por año
var _cacheFestivos = {};
function _getFestivos(anio) {
  if (!_cacheFestivos[anio]) {
    _cacheFestivos[anio] = _festivosColombia(anio);
  }
  return _cacheFestivos[anio];
}

// ── ¿Es día hábil? ───────────────────────────────────────────
function esDiaHabil(fecha) {
  if (!fecha) return false;
  var d = fecha instanceof Date ? fecha : parsearFecha(fecha);
  if (!d) return false;
  var dia = d.getDay();
  if (dia === 0 || dia === 6) return false; // sáb, dom
  // Verificar festivos
  var festivos = _getFestivos(d.getFullYear());
  var ts = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return !festivos.some(function(f) {
    return f.getFullYear() * 10000 + (f.getMonth() + 1) * 100 + f.getDate() === ts;
  });
}

// ── Días hábiles desde hoy hasta una fecha ────────────────────
// Positivo = la fecha está en el futuro, negativo = en el pasado.
function diasHabilesHasta(fechaTarget) {
  var target = fechaTarget instanceof Date ? fechaTarget : parsearFecha(fechaTarget);
  if (!target) return null;
  var hoy = new Date();
  hoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  target = new Date(target.getFullYear(), target.getMonth(), target.getDate());

  return _diasHabilesEntre(hoy, target);
}

// Hábiles en el intervalo (desde, hasta]. Positivo si hasta es posterior,
// negativo si es anterior. Separado de diasHabilesHasta porque ese toma "hoy"
// del reloj: no se puede probar ni usar con otra referencia.
function _diasHabilesEntre(desde, hasta) {
  var a = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  var b = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  if (a.getTime() === b.getTime()) return 0;
  var adelante = b > a;
  var inicio = adelante ? a : b;
  var fin = adelante ? b : a;
  var count = 0;
  var cursor = new Date(inicio.getTime() + 86400000); // día siguiente
  while (cursor <= fin) {
    if (esDiaHabil(cursor)) count++;
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return adelante ? count : -count;
}

// ── Días calendario desde una fecha hasta hoy ─────────────────
// Nunca negativo: con asignación programada a futuro (el admin asigna hoy
// para el martes) una visita completada antes de ese día daría días
// negativos, y ese número va tal cual a la columna DIAS de BD al completar.
function diasDesde(fecha) {
  var d = fecha instanceof Date ? fecha : parsearFecha(fecha);
  if (!d) return null;
  var hoy = new Date();
  hoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.floor((hoy - d) / 86400000));
}

// ── Hoy en DD/MM/AAAA ────────────────────────────────────────
function hoyDDMMAAAA() {
  var d = new Date();
  return _padFecha(d.getDate(), d.getMonth() + 1, d.getFullYear());
}

// ── VISITADOR(ES): lectura tolerante a mayúsculas + separador unificado ──
// Encabezado case-insensitive (evita fallo silencioso si alguien retitula
// la columna en el Sheet, ej. "Visitador(es)"); conserva el fallback
// posicional [17] para respuestas que no traen el nombre de columna.
function visitadoresBD(fila) {
  if (!fila) return '';
  if (fila['VISITADOR(ES)'] != null && fila['VISITADOR(ES)'] !== '') return String(fila['VISITADOR(ES)']);
  var clave = Object.keys(fila).find(function(k) { return k.toUpperCase() === 'VISITADOR(ES)'; });
  if (clave && fila[clave] != null && fila[clave] !== '') return String(fila[clave]);
  return String(fila[17] || '');
}

// Primer visitador (= diligenciador) de una lista separada por "/" o ","
function primerVisitador(visitadores) {
  return String(visitadores || '').split(/\s*[\/,]\s*/)[0].trim();
}

// Quien inicia la visita queda como diligenciador: se mueve (o se agrega) al
// primer lugar de VISITADOR(ES) y el resto sigue como acompañante, en su orden.
// Sin esto, abrir una visita asignada a otro y guardarla la dejaba a nombre
// del asignado, que nunca la empezó. Formato de salida: "A / B" (col R).
function ponerDiligenciadorPrimero(visitadores, nombre) {
  var partes = String(visitadores || '').split(/\s*\/\s*/)
    .map(function(s) { return s.trim(); }).filter(Boolean);
  var n = String(nombre || '').trim();
  if (!n) return partes.join(' / ');
  var nU = n.toUpperCase();
  var resto = partes.filter(function(p) { return p.toUpperCase() !== nU; });
  return [n].concat(resto).join(' / ');
}

// Regla del diligenciador aplicada a la escritura: solo el primer nombre de
// VISITADOR(ES) puede diligenciar la visita, porque al pasar a INICIADO solo él
// la sigue viendo. Un co-asignado que la iniciara la perdería de su lista y la
// dejaría a nombre de quien nunca la empezó.
//   - Admin: sin restricción (gestiona todas las visitas).
//   - Sin diligenciador asignado: cualquiera puede tomarla.
//   - Sin sesión legible: no bloqueamos; la pantalla ya filtró qué mostrar.
function puedeDiligenciar(fila) {
  var dilig = primerVisitador(visitadoresBD(fila)).toUpperCase();
  if (!dilig) return true;
  var s = null;
  try { s = (typeof SESSION_V6 !== 'undefined') ? SESSION_V6.leer() : null; } catch (e) { s = null; }
  if (!s) return true;
  return s.rol === 'ADMIN' || String(s.usuario || '').toUpperCase() === dilig;
}

// Quién ve TODAS las visitas (Inicio, semana, alertas, Buscar), no solo las
// suyas. SUPERVISOR (col E de USUARIOS, 2026-09-25) ve como el admin pero no
// gestiona: asignar/completar/Agenda/⚙ Admin siguen atados a rol === 'ADMIN'
// y diligenciar a puedeDiligenciar(). Solo lectura por construcción.
function veTodasLasVisitas(rol) {
  var r = String(rol || '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPERVISOR';
}

// Extrae el ID de carpeta Drive desde un link "https://drive.google.com/.../folders/<id>..."
// Antes duplicada de forma idéntica en informe-modal.jsx y buscar.jsx: al concatenar
// el bundle, la segunda declaración pisaba silenciosamente a la primera (mismo scope global).
function extraerIdCarpetaDrive(link) {
  if (!link) return '';
  var m = String(link).match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

// Link al PDF de la PQR tal como la radicó el ciudadano (columna
// LINK_PDF_RADICADO de BD VISITAS, que llena la sincronización del módulo de
// priorización desde las carpetas de Drive donde el scraper deja los PDFs).
//
// Se lee por nombre de columna y con variantes toleradas: la hoja lleva años
// recibiendo columnas de distintos flujos y el encabezado exacto no es un
// contrato estable. Devuelve '' cuando no hay PDF — que es lo normal en las
// visitas de oficio (no nacen de una PQR) y en los radicados que el scraper
// nunca alcanzó a descargar.
function linkPdfRadicado(f) {
  if (!f) return '';
  var claves = ['LINK_PDF_RADICADO', 'LINK PDF RADICADO', 'LINK_PDF_PQR'];
  for (var i = 0; i < claves.length; i++) {
    var v = f[claves[i]];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

// ── Coordenadas de BD ─────────────────────────────────────────
// Durante años lat/lon se escribieron en el Sheet como TEXTO
// ("6.345587"). En una hoja cuyo locale toma el punto como separador de
// miles, Sheets lo interpreta al escribirlo y se come el decimal:
// 6.345587 → 6345587. Cada guardado posterior repite la operación
// (6345587 → 6345587000000), y con esas cifras el mapa queda en gris.
// Desde 2026-09-10 se escriben como número (nueva-visita.jsx y
// actualizarCoordenadasEnBD), así que esto solo repara filas viejas:
// se reescala por potencias de 10 hasta caer en el rango de Bello, que
// es lo bastante estrecho para que solo una potencia encaje.
var _RANGO_COORD = { lat: [5.8, 6.8], lon: [-76.5, -75.0] };
function normalizarCoord(v, tipo) {
  var n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  if (!isFinite(n) || n === 0) return null;
  var r = _RANGO_COORD[tipo === 'lat' ? 'lat' : 'lon'];
  for (var i = 0; i < 15 && (n < r[0] || n > r[1]); i++) n /= 10;
  if (n >= r[0] && n <= r[1]) return n;
  // Fuera de Bello pero geográficamente posible (visita en el límite,
  // dato cargado a mano): se devuelve tal cual, no se inventa nada.
  var orig = parseFloat(String(v).replace(',', '.'));
  return Math.abs(orig) <= (tipo === 'lat' ? 90 : 180) ? orig : null;
}

// ── Numeración de visitas de un radicado (Buscar) ─────────────
// Una fila PENDIENTE es la queja sin atender, no una visita: sale con
// n = null y nunca lleva el rótulo "Visita N de M". Solo ASIGNADO,
// INICIADO y COMPLETADO son visitas reales y se numeran.
// El N° VISITA explícito de BD se respeta tal cual; a las filas sin
// número (migradas de V2) se les asigna el primer número libre del
// radicado — nunca posición+1 a ciegas, que duplicaba números cuando
// otra fila ya traía el suyo.
// El estado se lee SOLO por nombre de columna ('ESTADO VISITA'), nunca
// por índice: insertar una columna en el Sheet no debe cambiar la lectura.
var _ESTADOS_VISITA_REAL = { ASIGNADO: 1, INICIADO: 1, COMPLETADO: 1 };

// Normalización local de estado (misma regla que normalizarEstado de
// api.js, que no está cargada en Node al correr los tests).
function _normEstadoVisitaBD(s) {
  return (s || '').toString().toUpperCase()
    .replace(/[ÁÀÄ]/g, 'A').replace(/[ÉÈË]/g, 'E').replace(/[ÍÌÏ]/g, 'I')
    .replace(/[ÓÒÖ]/g, 'O').replace(/[ÚÙÜ]/g, 'U').trim();
}

// filas: array de filas de BD VISITAS del mismo radicado (con _idx).
// Devuelve [{ f, n }] ordenado por n (las no-visitas al final, desempate
// por _idx): n = número de visita o null si la fila no es visita real.
function numerarVisitasRadicado(filas) {
  if (!Array.isArray(filas)) return [];
  var conN = filas.map(function(f) {
    return {
      f: f,
      esVisita: !!_ESTADOS_VISITA_REAL[_normEstadoVisitaBD(f['ESTADO VISITA'])],
      n: parseInt(f['N° VISITA'] || f['N VISITA'] || 0, 10) || 0,
    };
  });
  // Números ya ocupados explícitamente por otra fila del radicado.
  var usados = {};
  conN.forEach(function(x) { if (x.esVisita && x.n > 0) usados[x.n] = true; });
  // A las visitas sin número: primer número libre, en orden de creación
  // (_idx = fila del Sheet), para que el resultado no dependa del orden
  // en que lleguen las filas.
  var libre = 1;
  conN.slice().sort(function(a, b) { return (a.f._idx || 0) - (b.f._idx || 0); })
    .forEach(function(x) {
      if (!x.esVisita) { x.n = null; return; }
      if (x.n > 0) return;
      while (usados[libre]) libre++;
      x.n = libre; usados[libre] = true;
    });
  conN.sort(function(a, b) {
    var na = a.n == null ? Infinity : a.n, nb = b.n == null ? Infinity : b.n;
    return (na - nb) || ((a.f._idx || 0) - (b.f._idx || 0));
  });
  return conN.map(function(x) { return { f: x.f, n: x.n }; });
}

// ── Normalización de direcciones urbanas ───────────────────────
// Objetivo: que BD guarde siempre `CL 50 # 32-10` / `CR 50 # 32-10` y no las
// diez grafías que hoy conviven (CALLE, CLL, Cra., No., N°, sin separador).
//
// NO afecta la búsqueda de carpetas en Drive: `_normDir` del backend
// normaliza LAS DOS partes que compara (el nombre entrante y el de la carpeta
// existente) y ahí el `#` y la palabra completa se descartan igual, así que
// `CALLE 50 # 32-10` y `CL 50 # 32-10` producen la misma clave `CL 50 32-10`.
// Por eso se puede reescribir la dirección sin que ninguna carpeta se pierda.
//
// Se aplica SOLO a direcciones urbanas reconocibles: si no empieza por un tipo
// de vía conocido (caso rural: veredas, sectores, referencias) se devuelve tal
// cual. Mejor dejarla intacta que inventarle una forma.
var _VIAS_DIR = [
  [/^(CL|CLL|CLLE|CALLE)\b\.?/, 'CL'],
  [/^(CR|CRA|CRRA|KR|KRA|CARRERA)\b\.?/, 'CR'],
  [/^(DG|DIAG|DIAGONAL)\b\.?/, 'DG'],
  [/^(TV|TRANS|TRANSV|TRANSVERSAL)\b\.?/, 'TV'],
  [/^(AV|AVE|AVENIDA)\b\.?/, 'AV'],
  [/^(CQ|CIRCULAR)\b\.?/, 'CQ'],
];
function normalizarDireccion(dir) {
  var s = (dir == null ? '' : String(dir)).trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s) return '';
  var via = null;
  for (var i = 0; i < _VIAS_DIR.length; i++) {
    if (_VIAS_DIR[i][0].test(s)) {
      via = _VIAS_DIR[i][1];
      s = s.replace(_VIAS_DIR[i][0], '').trim();
      break;
    }
  }
  if (!via) return (dir == null ? '' : String(dir)).trim();  // rural u otra cosa: no tocar
  // Separador único `#`. `No.`, `Nro`, `N°` y el guion suelto entre los dos
  // tramos son la misma cosa escrita distinto.
  s = s.replace(/\b(NO|NRO|NUM|NUMERO)\b\.?/g, '#')
       .replace(/[N#]\s*[°º]/g, '#')
       .replace(/[°º]/g, '#')
       .replace(/#+/g, '#');
  // Un `#` como mucho: si no hay ninguno, se pone donde arranca el segundo
  // tramo numérico (`CL 50 32-10` → `CL 50 # 32-10`).
  if (s.indexOf('#') === -1) s = s.replace(/^(\S+)\s+(\d)/, '$1 # $2');
  s = s.replace(/\s*#\s*/, ' # ').replace(/\s+/g, ' ').trim();
  return (via + ' ' + s).trim();
}

// ── Visibilidad por fecha de asignación ───────────────────
// Una visita programada para el jueves no es trabajo del martes: el visitador
// solo debe verla a partir del día de su asignación. Antes aparecían todas
// juntas en "Asignadas" y la lista no distinguía lo de hoy de lo de la otra
// semana, que es justo lo que hay que saber al abrir la app.
//
// Sin fecha legible se muestra igual: las filas viejas (y las migradas de V2)
// no siempre la traen, y ocultar una visita real es peor que mostrar una de
// más. La comparación es por día, nunca por instante.
//
// Dónde se aplica: Mis visitas la usa para todos (esa lista es la jornada
// propia, también la del admin) e Inicio solo para el inspector — las stats
// y alertas del admin son la vista de sistema. Buscar y Agenda NO la usan:
// ahí el admin tiene que ver lo que programó para la semana.
// Tampoco toca INICIADO/COMPLETADO: una visita ya empezada no puede estar
// "en el futuro".
function asignadaVisibleHoy(fila, hoy) {
  if (!fila) return true;
  var d = parsearFecha(fila['FECHA ASIGNACION VISITA'] || '');
  if (!d) return true;
  var ref = null;
  if (hoy instanceof Date) ref = hoy;
  else if (hoy) ref = parsearFecha(hoy);
  if (!ref) ref = new Date();
  var asig = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  var base = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  return asig <= base;
}

// ── Ubicación de la visita en Google Maps ──────────────────
// El visitador sale a campo con la dirección y lo que necesita es llegar.
// Con coordenadas se abre el punto exacto (las visitas de seguimiento heredan
// el GPS de la anterior, ver clonarParaSeguimiento); sin ellas — el caso
// normal de una asignada que nadie ha visitado todavía — se manda la
// dirección como búsqueda, acotada a Bello para que Maps no la resuelva en
// otro municipio del valle (hay CL 50 en todos).
//
// Formato `search/?api=1&query=`: es la URL universal de Google Maps — abre
// la app nativa en el teléfono y la web en escritorio, y deja "Cómo llegar" a
// un toque. `dir/?api=1&destination=` arrancaría la navegación de una vez,
// que es demasiado para un enlace de lista.
//
// Devuelve '' cuando no hay ni coordenadas ni dirección: el botón no se pinta.
function linkMapaVisita(fila) {
  if (!fila) return '';
  var base = 'https://www.google.com/maps/search/?api=1&query=';
  var lat = normalizarCoord(fila['LATITUD'], 'lat');
  var lon = normalizarCoord(fila['LONGITUD'], 'lon');
  if (lat != null && lon != null) return base + lat.toFixed(6) + ',' + lon.toFixed(6);
  var dir = String(fila['DIRECCION INFRACCION'] || fila['DIRECCION'] || '').trim();
  if (!dir) return '';
  // El barrio NO va en la consulta, aunque parezca que ayuda: medido contra
  // Google Maps el 2026-09-18, mandarlo empeora o rompe la resolucion.
  //   "CR 52 # 64-134, Niquia, Bello, Antioquia, Colombia" -> Medellin
  //   "CR 52 # 64-134, Bello, Antioquia, Colombia"         -> Bello, Hatonuevo
  //   "CL 50 # 32-10, Paris, Bello, ..."   -> no resuelve, mapa a zoom 13
  //   "CL 50 # 32-10, Bello, ..."          -> Cl. 50, Perez, Bello
  // En rural da igual (la vereda ya viene en la direccion) y encima acerca el
  // zoom. El barrio le da al geocodificador un termino mas que interpretar y
  // termina reencuadrando la cadena entera en el area metropolitana.
  // Si se vuelve a tocar esto, medirlo con direcciones reales, no suponerlo.
  return base + encodeURIComponent(dir + ', Bello, Antioquia, Colombia');
}

// ── Semana de visitas (calendario de Inicio) ────────────────
// Lunes a viernes: la inspección no agenda fines de semana, y una columna de
// sábado vacía en todas las semanas es ruido.
function rangoSemana(ref, offsetSemanas) {
  var base = ref instanceof Date ? ref : (parsearFecha(ref) || new Date());
  base = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  // getDay(): 0 = domingo. El domingo cierra la semana que termina, no abre la
  // siguiente, así que retrocede 6 días y no 0.
  var dow = base.getDay();
  var aLunes = dow === 0 ? -6 : 1 - dow;
  var off = (offsetSemanas || 0) * 7;
  var lunes = new Date(base.getFullYear(), base.getMonth(), base.getDate() + aLunes + off);
  var dias = [];
  for (var i = 0; i < 5; i++) {
    dias.push(new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i));
  }
  return { lunes: lunes, dias: dias };
}

// Día en que la visita se planta en el calendario. Programado y realizado son
// cosas distintas: una asignada vive en su fecha de asignación y una que ya
// empezó vive en el día en que se hizo. Registrar NO es visitar — el inspector
// puede registrar al día siguiente o en el transcurso de la semana — así que
// una visita nunca se reubica en "hoy": moverla ahí sería reagendarla.
function fechaAgendaVisita(fila) {
  if (!fila) return null;
  var e = _normEstadoVisitaBD(fila['ESTADO VISITA'] || fila[13] || '');
  if (e === 'INICIADO' || e === 'COMPLETADO') {
    return parsearFecha(fila['FECHA DE VISITA'] || '') ||
           parsearFecha(fila['FECHA ASIGNACION VISITA'] || '');
  }
  return parsearFecha(fila['FECHA ASIGNACION VISITA'] || '');
}

// Regla del diligenciador para un nombre dado: en PENDIENTE/ASIGNADO la ve
// cualquier co-asignado; en INICIADO/COMPLETADO solo el primero de
// VISITADOR(ES). Sin nombre no filtra (vista de sistema del admin).
function _esVisitaDe(fila, nombre) {
  var n = String(nombre || '').toUpperCase().trim();
  if (!n) return true;
  var vis = visitadoresBD(fila).toUpperCase();
  if (vis.indexOf(n) === -1) return false;
  var e = _normEstadoVisitaBD(fila['ESTADO VISITA'] || fila[13] || '');
  if (e === 'INICIADO' || e === 'COMPLETADO') return primerVisitador(vis) === n;
  return true;
}

// Reparte las filas en los 5 días de `dias`. Devuelve también cuántas quedaron
// fuera por no tener fecha ubicable: esas no desaparecen (siguen en Buscar),
// pero la rejilla debe poder decirlo en vez de tragárselas en silencio.
// Las PENDIENTE sin fecha de asignación no cuentan: son la bandeja de entrada,
// no un hueco de agenda.
function agruparSemana(filas, dias, opciones) {
  var o = opciones || {};
  var quien = o.esAdmin ? (o.inspector || '') : (o.miNombre || '');
  var porDia = [];
  var i;
  for (i = 0; i < dias.length; i++) porDia.push([]);
  var claves = {};
  for (i = 0; i < dias.length; i++) {
    claves[new Date(dias[i].getFullYear(), dias[i].getMonth(), dias[i].getDate()).getTime()] = i;
  }
  var sinFecha = 0;
  (filas || []).forEach(function(f) {
    if (!_esVisitaDe(f, quien)) return;
    var d = fechaAgendaVisita(f);
    if (!d) {
      var e = _normEstadoVisitaBD(f['ESTADO VISITA'] || f[13] || '');
      if (e !== 'PENDIENTE') sinFecha++;
      return;
    }
    var k = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (claves[k] === undefined) return;
    porDia[claves[k]].push(f);
  });
  // Dentro del día: por comuna (agrupa el recorrido) y luego por radicado.
  porDia.forEach(function(lista) {
    lista.sort(function(a, b) {
      var ca = String(a['COMUNA'] || ''), cb = String(b['COMUNA'] || '');
      if (ca !== cb) return ca.localeCompare(cb, 'es');
      return String(a['RADICADO'] || '').localeCompare(String(b['RADICADO'] || ''), 'es');
    });
  });
  return { porDia: porDia, sinFecha: sinFecha };
}

// Días hábiles que lleva una visita asignada sin que nadie la inicie. null si
// no aplica (ya empezó, o no tiene fecha de asignación legible); 0 si la
// asignación es a futuro. Alimenta la alerta de Inicio: hasta ahora ninguna
// asignada podía alertar, porque el memo de alertas descarta de entrada todo
// lo que no esté en INICIADO.
function diasSinIniciar(fila, hoy) {
  if (!fila) return null;
  var e = _normEstadoVisitaBD(fila['ESTADO VISITA'] || fila[13] || '');
  if (e !== 'ASIGNADO' && e !== 'PENDIENTE') return null;
  var d = parsearFecha(fila['FECHA ASIGNACION VISITA'] || '');
  if (!d) return null;
  var ref = hoy instanceof Date ? hoy : (parsearFecha(hoy) || new Date());
  var n = _diasHabilesEntre(d, ref);
  return n > 0 ? n : 0;
}

// Cuántas semanas separan la semana de `fecha` de la semana de `hoy`. Es lo
// que necesita «Ver en su semana» para saltar del panel de alertas al día en
// que la visita está programada, sin moverla de sitio.
// Se compara lunes contra lunes: dentro de la misma semana el offset es 0
// aunque los días difieran. Colombia no cambia de hora, así que la división
// por 7 días no arrastra error de DST.
function offsetSemanaDe(fecha, hoy) {
  var d = fecha instanceof Date ? fecha : parsearFecha(fecha);
  if (!d) return null;
  var ref = hoy instanceof Date ? hoy : (parsearFecha(hoy) || new Date());
  var lunesObj = rangoSemana(d, 0).lunes;
  var lunesRef = rangoSemana(ref, 0).lunes;
  return Math.round((lunesObj.getTime() - lunesRef.getTime()) / 604800000);
}

// Exportar al scope global (navegador) o CommonJS (Node, tests)
var _cuUtilsExports = {
  normalizarDireccion: normalizarDireccion,
  formatearFecha: formatearFecha,
  formatearFechaHora: formatearFechaHora,
  titleCaseNombre: titleCaseNombre,
  parsearFecha: parsearFecha,
  esDiaHabil: esDiaHabil,
  diasHabilesHasta: diasHabilesHasta,
  diasDesde: diasDesde,
  hoyDDMMAAAA: hoyDDMMAAAA,
  visitadoresBD: visitadoresBD,
  primerVisitador: primerVisitador,
  ponerDiligenciadorPrimero: ponerDiligenciadorPrimero,
  puedeDiligenciar: puedeDiligenciar,
  veTodasLasVisitas: veTodasLasVisitas,
  extraerIdCarpetaDrive: extraerIdCarpetaDrive,
  linkPdfRadicado: linkPdfRadicado,
  asignadaVisibleHoy: asignadaVisibleHoy,
  linkMapaVisita: linkMapaVisita,
  normalizarCoord: normalizarCoord,
  numerarVisitasRadicado: numerarVisitasRadicado,
  rangoSemana: rangoSemana,
  fechaAgendaVisita: fechaAgendaVisita,
  agruparSemana: agruparSemana,
  diasSinIniciar: diasSinIniciar,
  offsetSemanaDe: offsetSemanaDe,
  // expuestas para pruebas unitarias (auditoría 2026-07, QA#3/MP7)
  _festivosColombia: _festivosColombia,
  _calcularPascua: _calcularPascua,
  _alLunes: _alLunes,
};
if (typeof window !== 'undefined') {
  Object.assign(window, _cuUtilsExports);
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = _cuUtilsExports;
}

// ── Clonar un radicado para una visita de seguimiento ─────────
// Copia los datos fijos del radicado (dirección, barrio, GPS, denunciante…)
// y limpia todo lo que pertenece a la visita anterior. Vive acá porque la
// usan dos entradas distintas: el modal de nueva visita (buscar radicado) y
// el botón "+ Nueva visita" de la cabecera de grupo en Buscar. Duplicar la
// lista de campos a limpiar era garantía de que una se quedara corta.
function clonarParaSeguimiento(filaBase, nVisita) {
  var n = String(nVisita || 2);
  var d = Object.assign({}, filaBase);
  d['N° VISITA'] = n;
  d['N VISITA']  = n;
  d['ESTADO VISITA'] = 'PENDIENTE';
  // No heredar el visitador de la visita anterior, ni prefijar al que la
  // crea: una visita de seguimiento se ASIGNA, siempre hay que elegir a
  // quién. `_seguimiento` apaga el prefijado automático.
  d['VISITADOR(ES)'] = '';
  d['_seguimiento'] = true;
  ['FECHA DE VISITA', 'FECHA ASIGNACION VISITA', 'LINK_DRIVE',
   'ACTUACION / OBSERVACIONES', 'TIPO DE INFRACCION',
   'AREA CONTRAVENCION m2', 'AREA CONTRAVENCION M2',
   'SUSPENSION DE LA OBRA', 'N° ORDEN DE POLICIA', 'N ORDEN DE POLICIA',
   'FECHA CITACION',
   // Entregables de la visita anterior: si viajan, la visita nueva nace
   // apuntando al acta y al informe de la otra.
   'LINK_PDF_ACTA', 'LINK_XLSX_ACTA', 'LINK_DOCX_INFORME', 'LINK_INFORME_F43',
   'LINK_REGISTRO_FOTOS', 'LINK_SOLICITUD_VIGILANCIA', 'LINK_SOLICITUD_PDF',
   'LINK_ORDEN_POLICIA', 'ULTIMA_MODIFICACION', 'ULTIMA_MODIFICACION_POR',
  ].forEach(function (k) { d[k] = ''; });
  return d;
}
