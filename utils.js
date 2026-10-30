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
// También acepta el texto de LOG_AUDITORIA («dd/MM/yyyy HH:mm» o
// «d/M/yyyy, h:mm a. m.»): con new Date(texto), «03/10/2026 08:52» salía 10
// de marzo y con día > 12 se perdía la hora.
function formatearFechaHora(valor) {
  if (!valor) return '';
  var d = parsearFechaHora(valor);
  if (!d) return formatearFecha(valor);
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
    [6, 9],   // 9 jul — Virgen de Chiquinquirá (Ley 2578 de 2026; quitar si la Corte la tumba)
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

// ¿El borrador local guardado bajo `cu_draft_v1_fila_<N>` es de la visita que
// hoy vive en la fila N? El número de fila NO identifica una visita: si alguien
// borra una fila en el Sheet, todas las de abajo suben una posición y el
// borrador queda apuntando a otra visita. Caso real (2026-09-25): el borrador
// de 20261079955 se restauró sobre la fila de 20261084284 y la carpeta
// automática la guardó sola — esa visita desapareció de la BD.
//   - `_radicadoFila`: radicado de BD que tenía la fila al escribir el borrador.
//   - Borradores viejos (sin ese campo): se compara el radicado del formulario.
//   - Si falta alguno de los dos no hay con qué comparar: se acepta.
function _normRadicado(r) {
  return String(r == null ? '' : r).replace(/\s+/g, '').toUpperCase();
}
// Clave para comparar/agrupar radicados: sin espacios y en mayúsculas.
// Caso real (2026-09-29): el inspector tecleó «Oficio-2026-09-239» en el
// modal de nueva visita, la búsqueda exacta no encontró «OFICIO-2026-09-239»
// y la 2ª visita nació como radicado aparte, con N° visita 1.
function claveRadicado(r) { return _normRadicado(r); }

// ¿El RADICADO identifica un caso? Solo si tiene número. Las filas migradas
// de V2 traen textos como «QUEJA VERBAL», «OPERATIVO», «OFICIO» o «SIN
// RADICADO» que comparten casos distintos: agrupar por ellos juntaba visitas
// sin relación («OPERATIVO · 20 visitas») y proponía la visita N° 21.
// Coordenadas pegadas en la celda tampoco son radicado. La usan Buscar
// (_claveGrupo) y la búsqueda de casos de «Nueva visita» (_claveCaso).
function esRadicadoDeCaso(r) {
  var k = String(r == null ? '' : r).trim().toUpperCase();
  return /\d/.test(k) && !/^(LAT|6\.|-75)/.test(k) && k.length <= 60;
}

// RADICADO que se guarda para una visita de oficio. La 1ª visita lo deriva
// de su orden de policía (OFICIO-<orden>). Una visita de seguimiento (N° > 1)
// conserva el del caso: si lo recalculara, una orden nueva (o ninguna) le
// cambiaría el radicado y la sacaría del grupo de la 1ª visita.
function radicadoDeOficio(radicadoBD, orden, nVisita) {
  var bd = String(radicadoBD == null ? '' : radicadoBD).trim().toUpperCase();
  if ((parseInt(nVisita, 10) || 1) > 1 && /^OFICIO-/.test(bd)) return bd;
  var o = String(orden == null ? '' : orden).trim();
  return o ? 'OFICIO-' + o : '';
}

// ── Buscar un caso desde «Nueva visita» (2026-09-30) ───────────
// Un caso = todas las visitas con el mismo RADICADO (PQR u OFICIO-<orden>).
// El inspector llega con uno de tres datos: el radicado, el N° de la orden de
// policía (el papel que tiene en la mano) o la dirección. La orden y el
// radicado de oficio son el mismo dato escrito distinto: `2026-09-239`,
// `2026-9-239`, `239` y `OFICIO-2026-09-239` llevan al mismo caso. Sin esto
// la 2ª visita de un caso de oficio se abría como caso nuevo (fila 1662).
function _ordenDeFila(f) {
  var s = String((f && (f['N° ORDEN DE POLICIA'] || f['N ORDEN DE POLICIA'])) || '').trim();
  var u = s.toUpperCase();
  return (u === 'N/A' || u === 'NA' || u === 'NO APLICA') ? '' : s;
}
// Sin ceros a la izquierda en cada tramo numérico (mismo criterio que Buscar).
function _sinCerosTramos(s) {
  return String(s == null ? '' : s).replace(/\d+/g, function (n) { return String(parseInt(n, 10)); });
}
function _nVisitaDeFila(f) {
  return parseInt(f && (f['N° VISITA'] || f['N VISITA']), 10) || 1;
}
function _direccionDeFila(f) {
  return String((f && (f['DIRECCION INFRACCION'] || f['DIRECCION'])) || '');
}
// Órdenes con que se puede reconocer la fila: la suya y, en un caso de
// oficio, la de la 1ª visita (va dentro del radicado).
function _ordenesDeFila(f) {
  var out = [];
  var o = _ordenDeFila(f);
  if (o) out.push(_sinCerosTramos(o.replace(/\s+/g, '')));
  var rad = String((f && f['RADICADO']) || '').trim().toUpperCase();
  if (/^OFICIO-/.test(rad)) out.push(_sinCerosTramos(rad.slice(7).replace(/\s+/g, '')));
  return out;
}

// ── Radicados reiterados (col AV de BD VISITAS) ────────────────
// Otros radicados que llegaron por el mismo caso, anotados a mano en la fila
// del caso principal. Buscar uno de ellos debe llevar a esa fila, y guardar
// desde la app no puede borrarlos (hasta 2026-10-01 el payload mandaba ''
// en esa posición).
function textoReiterados(f) {
  if (!f) return '';
  var v = f['RADICADOS REITERADOS'];
  if (v == null) v = f['RADICADO REITERADO'];
  if (v == null) {
    // Encabezado escrito distinto en la hoja: cualquiera que diga «REITERAD».
    for (var k in f) {
      if (/REITERAD/i.test(k)) { v = f[k]; break; }
    }
  }
  return String(v == null ? '' : v).trim();
}
// Como claves comparables (claveRadicado). La celda es texto libre: los
// radicados van separados por coma, espacio, salto de línea, «/» o «y».
function radicadosReiterados(f) {
  var t = textoReiterados(f);
  if (!t) return [];
  var out = [];
  t.toUpperCase().split(/[^0-9A-Z-]+/).forEach(function (p) {
    // Sin dígitos es una palabra suelta («Y», «RAD»), no un radicado.
    if (/\d/.test(p) && out.indexOf(p) === -1) out.push(p);
  });
  return out;
}
// Forma de un radicado que puede anotarse como reiterado: 11 dígitos (PQR) o
// AAAA-NNNNNN (memorando). La misma que valida el backend (_formaRadicadoValida)
// y la que sabe descargar el scraper.
function formaRadicadoValida(r) {
  var k = claveRadicado(r);
  return /^\d{11}$/.test(k) || /^\d{4}-\d{4,}$/.test(k);
}
// «Registrar radicado» en el estado vacío de Buscar (2026-10-29): solo admin
// y supervisores, solo si lo tecleado tiene forma de radicado y no está en la
// base ni como radicado ni como reiterado de otro caso. `filas`: todas las de
// la BD que tiene Buscar (también las NO COMPETENCIA), sin filtros.
function puedeRegistrarRadicado(texto, filas, rol) {
  if (rol !== 'ADMIN' && rol !== 'SUPERVISOR') return false;
  var k = claveRadicado(texto);
  if (!formaRadicadoValida(k)) return false;
  return !(filas || []).some(function (f) {
    return claveRadicado(f && f['RADICADO']) === k || radicadosReiterados(f).indexOf(k) !== -1;
  });
}
// Barrio del POT (barrioPotPorPunto) con el nombre que usa la lista del
// formulario de la visita, para que la fila registrada se vea igual que una
// diligenciada. `lista`: barrios del formulario; `alias`: clave canónica del
// POT → nombre de la lista (los que la clave no salva). null si no hay barrio.
function barrioRegistroDesdePot(pot, lista, alias) {
  if (!pot || !pot.n) return null;
  var k = claveBarrioPot(pot.n);
  var nombre = (alias && alias[k]) ||
    (lista || []).find(function (b) { return claveBarrioPot(b) === k; }) || pot.n;
  return { barrio: nombre, comuna: String(pot.c || '') };
}
// ¿La fila tiene `texto` entre sus reiterados? En Buscar se teclea a medias,
// así que basta que un reiterado lo contenga (mínimo 4 caracteres).
function coincideReiterado(f, texto) {
  var q = claveRadicado(texto);
  if (q.length < 4) return false;
  return radicadosReiterados(f).some(function (r) { return r.indexOf(q) !== -1; });
}

// Qué tecleó el inspector: 'radicado' (8+ dígitos), 'oficio' (OFICIO-…),
// 'orden' (AAAA-MM-NNN o solo el consecutivo) o 'direccion'.
function tipoBusquedaCaso(texto) {
  var t = String(texto == null ? '' : texto).trim().toUpperCase();
  if (!t) return '';
  var compacto = t.replace(/\s+/g, '');
  if (/^OFICIO-?\d/.test(compacto)) return 'oficio';
  if (/^\d{8,}$/.test(compacto)) return 'radicado';
  if (/^\d{4}-\d{1,2}-\d{1,4}$/.test(compacto) || /^\d{1,4}$/.test(compacto)) return 'orden';
  return 'direccion';
}

// Clave de caso de una fila: su radicado si identifica un caso; si no (V2
// sin número), la fila sola — no tiene visitas hermanas.
function _claveCaso(f) {
  var k = claveRadicado(f && f['RADICADO']);
  return esRadicadoDeCaso(k) ? k : '#fila' + (f && f._idx);
}

// Agrupa por caso: de cada radicado que coincidió trae TODAS sus visitas (la
// coincidencia pudo ser por la orden de la 1ª y el caso ya va en la 3ª), de
// la más reciente a la más vieja. Casos más nuevos primero (fila más baja).
// `sinRadicado`: fila de V2 sin número, que no admite visita de seguimiento.
function _agruparCasos(coincidentes, todas) {
  var claves = [];
  coincidentes.forEach(function (f) {
    var k = _claveCaso(f);
    if (claves.indexOf(k) === -1) claves.push(k);
  });
  var casos = claves.map(function (k) {
    var visitas = todas.filter(function (f) { return _claveCaso(f) === k; })
      .sort(function (a, b) { return _nVisitaDeFila(b) - _nVisitaDeFila(a); });
    var ultima = visitas[0];
    var maxIdx = Math.max.apply(null, visitas.map(function (f) { return Number(f._idx) || 0; }));
    return {
      radicado: String(ultima['RADICADO']).trim().toUpperCase(),
      clave: k,
      sinRadicado: k.charAt(0) === '#',
      visitas: visitas,
      ultima: ultima,
      nVisitaSig: _nVisitaDeFila(ultima) + 1,
      _maxIdx: maxIdx,
    };
  });
  casos.sort(function (a, b) { return b._maxIdx - a._maxIdx; });
  return casos;
}

function buscarCasos(filas, texto) {
  var tipo = tipoBusquedaCaso(texto);
  if (!tipo) return { tipo: '', casos: [] };
  var t = String(texto).trim().toUpperCase();
  var lista = (filas || []).filter(function (f) { return f && claveRadicado(f['RADICADO']); });
  // 1) Radicado exacto, siempre primero (PQR u OFICIO-…).
  var clave = claveRadicado(t);
  var exactas = lista.filter(function (f) { return claveRadicado(f['RADICADO']) === clave; });
  if (exactas.length) return { tipo: tipo, casos: _agruparCasos(exactas, lista) };
  // 2) Radicado reiterado: no tiene fila propia, está anotado en la del caso
  // principal. `reiterado` le dice al modal por qué salió otro radicado.
  // Sin mirar `tipo`: en la BD hay reiterados `2025-123456` (36 celdas,
  // medido 2026-10-01), que tipoBusquedaCaso toma por dirección.
  if (clave.length >= 8) {
    var conReiterado = lista.filter(function (f) { return radicadosReiterados(f).indexOf(clave) !== -1; });
    if (conReiterado.length) {
      var casosR = _agruparCasos(conReiterado, lista);
      casosR.forEach(function (c) { c.reiterado = clave; });
      return { tipo: tipo, casos: casosR };
    }
  }
  var coincide = null;
  if (tipo === 'oficio' || tipo === 'orden') {
    var q = _sinCerosTramos(t.replace(/\s+/g, '').replace(/^OFICIO-?/, ''));
    var soloConsecutivo = /^\d+$/.test(q);
    coincide = function (f) {
      return _ordenesDeFila(f).some(function (o) {
        return soloConsecutivo ? o.split('-').pop() === q : o === q;
      });
    };
  } else if (tipo === 'direccion') {
    var k = claveBusquedaDireccion(t);
    if (k.length < 4) return { tipo: tipo, casos: [] };
    coincide = function (f) {
      var d = _direccionDeFila(f);
      return !!d && claveBusquedaDireccion(d).indexOf(k) !== -1;
    };
  }
  if (!coincide) return { tipo: tipo, casos: [] };  // 'radicado' sin coincidencia exacta
  return { tipo: tipo, casos: _agruparCasos(lista.filter(coincide), lista) };
}

// Casos de OTRO radicado en la misma dirección (misma placa, sin mirar la
// unidad) o con la misma orden de policía. Solo avisa: dos infracciones
// distintas en el mismo predio son casos distintos (decisión del usuario
// 2026-09-30). `motivos` dice por qué salió cada caso.
function casosRelacionados(filas, opts) {
  var o = opts || {};
  // Un «radicado» V2 sin número no es caso: no excluye a las demás filas que
  // lo comparten (la fila propia la excluye filaPropia).
  var propio = claveRadicado(o.radicadoPropio);
  if (!esRadicadoDeCaso(propio)) propio = '';
  var filaPropia = o.filaPropia != null ? Number(o.filaPropia) : null;
  var cDir = o.direccion ? claveDireccionCatastro(o.direccion) : null;
  var orden = o.orden ? _sinCerosTramos(String(o.orden).replace(/\s+/g, '')) : '';
  if (!cDir && !orden) return [];
  var lista = (filas || []).filter(function (f) { return f && claveRadicado(f['RADICADO']); });
  var motivosPorCaso = {};
  var coincidentes = lista.filter(function (f) {
    var k = _claveCaso(f);
    if (propio && k === propio) return false;
    if (filaPropia != null && Number(f._idx) === filaPropia) return false;
    var m = [];
    if (cDir) {
      var cf = claveDireccionCatastro(_direccionDeFila(f));
      if (cf && cf.base === cDir.base) m.push('direccion');
    }
    if (orden && _ordenesDeFila(f).indexOf(orden) !== -1) m.push('orden');
    if (!m.length) return false;
    motivosPorCaso[k] = (motivosPorCaso[k] || []).concat(m.filter(function (x) {
      return (motivosPorCaso[k] || []).indexOf(x) === -1;
    }));
    return true;
  });
  return _agruparCasos(coincidentes, lista).map(function (c) {
    c.motivos = motivosPorCaso[c.clave] || [];
    return c;
  });
}

function borradorEsDeLaFila(borrador, radicadoFila) {
  var actual = _normRadicado(radicadoFila);
  if (!borrador || !actual) return true;
  var suyo = _normRadicado(borrador._radicadoFila || (borrador._d && borrador._d.radicado));
  if (!suyo) return true;
  return suyo === actual;
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

// ── Primer guardado manual ────────────────────────────────────
// PENDIENTE y ASIGNADO son visitas que nadie ha iniciado: pasan a INICIADO
// solo cuando el inspector pulsa «Guardar» (primer guardado de guardar() en
// nueva-visita.jsx). Mientras sigan así, el formulario no se escribe en BD por
// su cuenta y no se habilitan los entregables. Antes el autoguardado de 60 s
// guardaba el formulario SIN cambiar el estado y la cabecera decía
// «✓ Guardado», así que una visita podía quedar diligenciada por completo y
// seguir ASIGNADA (reportado el 2026-10-05 con el radicado 2026-015246).
function visitaSinIniciar(estado) {
  var e = _normEstadoVisitaBD(estado);
  return e === 'PENDIENTE' || e === 'ASIGNADO';
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

// Coordenadas escritas como dirección (visitas rurales sin nomenclatura):
// «6°25'33.0"N 75°35'25.0"W», «6° 25´33.0 N 75° 35´25.0 W», «6.3456, -75.5612».
// → { lat, lon } o null. Sin hemisferio la longitud se toma oeste (Bello).
// Solo se acepta lo que cae en el rango de Bello: el texto libre de una
// dirección no debe convertirse en un punto inventado.
function puntoDesdeTextoCoord(texto) {
  var s = String(texto || '');
  if (!s) return null;
  var num = function (x) { return x == null || x === '' ? 0 : parseFloat(String(x).replace(',', '.')); };
  var lat = null, lon = null;
  if (s.indexOf('°') !== -1 || s.indexOf('º') !== -1) {
    var re = /(\d{1,3}(?:[.,]\d+)?)\s*[°º]\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['´’′]?\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:["”″]|['´’′]{2})?\s*)?([NSEWOnsewo])?/g;
    var ms = [], m;
    while ((m = re.exec(s)) && ms.length < 2) ms.push(m);
    if (ms.length < 2) return null;
    var dec = function (g) { return num(g[1]) + num(g[2]) / 60 + num(g[3]) / 3600; };
    var hem = function (g) { return String(g[4] || '').toUpperCase(); };
    lat = dec(ms[0]) * (hem(ms[0]) === 'S' ? -1 : 1);
    lon = dec(ms[1]) * (hem(ms[1]) === 'E' ? 1 : -1);
  } else {
    // Grados, minutos y segundos sin el símbolo de grado («6 21'3,858"N
    // 75 33'28,272"W», visto en BD). Exige los dos hemisferios y que el texto
    // sea solo la coordenada: «CL 29 # 55-22» no debe leerse como punto.
    var g = /^\s*(\d{1,3})\s+(\d{1,2})\s*['´’′]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["”″]|['´’′]{2})?\s*([NS])\s*[,;]?\s*(\d{1,3})\s+(\d{1,2})\s*['´’′]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:["”″]|['´’′]{2})?\s*([EWO])\s*$/i.exec(s);
    if (g) {
      lat = (num(g[1]) + num(g[2]) / 60 + num(g[3]) / 3600) * (g[4].toUpperCase() === 'S' ? -1 : 1);
      lon = (num(g[5]) + num(g[6]) / 60 + num(g[7]) / 3600) * (g[8].toUpperCase() === 'E' ? 1 : -1);
    } else {
      var d = /^\s*(-?\d{1,2}\.\d{3,})\s*[,;\s]\s*(-?\d{2,3}\.\d{3,})\s*$/.exec(s);
      if (!d) return null;
      lat = parseFloat(d[1]);
      lon = -Math.abs(parseFloat(d[2]));
    }
  }
  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (lat < _RANGO_COORD.lat[0] || lat > _RANGO_COORD.lat[1] ||
      lon < _RANGO_COORD.lon[0] || lon > _RANGO_COORD.lon[1]) return null;
  return { lat: lat, lon: lon };
}

// Dirección para PINTAR en listas y tarjetas: si el texto es una coordenada
// dentro de Bello se dice «Punto GPS» (la coordenada cruda no cabe en una
// fila y no dice nada al inspector; el title conserva el texto original).
// Solo presentación: búsqueda, Maps y payloads siguen usando la dirección
// tal cual. No toca ''/null: el texto por defecto lo pone quien llama.
function direccionVisible(dir) {
  if (!dir) return dir;
  return puntoDesdeTextoCoord(dir) ? 'Punto GPS' : dir;
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
  // tramos son la misma cosa escrita distinto. Solo antes de un número:
  // «(NO EXISTE)» es texto, no separador.
  s = s.replace(/\b(NO|NRO|NUM|NUMERO)\b\.?(?=\s*\d)/g, '#')
       .replace(/[N#]\s*[°º]/g, '#')
       .replace(/[°º]/g, '#')
       .replace(/#+/g, '#');
  // Un `#` como mucho: si no hay ninguno, se pone donde arranca el segundo
  // tramo numérico (`CL 50 32-10` → `CL 50 # 32-10`).
  if (s.indexOf('#') === -1) s = s.replace(/^(\S+)\s+(\d)/, '$1 # $2');
  s = s.replace(/\s*#\s*/, ' # ').replace(/\s+/g, ' ').trim();
  // Placa sin guion: dos números puros seguidos tras el `#` (`# 32 10`,
  // `# 32 10 INT 201`) se unen con guion. Solo dígitos puros: `32A 10`,
  // `32 BIS 10`, `32 SUR 10` y `# 3210` quedan intactos. Idempotente (un
  // solo reemplazo, sin `g`: `32-10` ya no calza en el patrón).
  s = s.replace(/(#\s*)(\d+)\s+(\d+)(?=\s|$)/, '$1$2-$3');
  return (via + ' ' + s).trim();
}

// ¿La dirección amerita la confirmación explícita del inspector («¿Es
// correcta?») antes del primer guardado? Solo para direcciones urbanas con
// formato reconocible: el rural (veredas, referencias, coordenadas) no tiene
// forma canónica que validar, así que no se le pregunta. La consume
// nueva-visita.jsx para la fila de confirmación y el bloqueo en guardar().
function direccionRequiereConfirmar(dir, comuna, barrio) {
  const s = (dir == null ? '' : String(dir)).trim();
  if (!s) return false;
  // En el formulario la comuna rural es 'Vereda'; 'RURAL' por datos viejos.
  var c = String(comuna || '').trim().toUpperCase();
  if (c === 'RURAL' || c === 'VEREDA') return false;
  if (/^VDA\./i.test(String(barrio || '').trim())) return false;
  // Coordenadas pegadas en el campo: no es una dirección para normalizar.
  if (/-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/.test(s)) return false;
  return _VIAS_DIR.some(function(e) { return e[0].test(s.toUpperCase()); });
}

// Clave para BUSCAR por dirección, no para guardar: tipo de vía unificado y
// sin ningún separador. El inspector teclea `CL 50 # 32 10`, `50 32-10` o
// `# 3210` y en BD está `CALLE 50 # 32-10`: todas dan `CL503210` / `503210`,
// que se comparan con includes. Cubre las filas viejas sin tocar la BD.
function claveBusquedaDireccion(dir) {
  return normalizarDireccion(dir).toUpperCase().replace(/[^0-9A-Z]/g, '');
}

// ── Ubicación del predio: dirección + GPS + catastro ───────────
// Plan: docs/PLAN_2026-09-29_ubicacion-predio.md (raíz de PROYECTO CODE).
// Lógica pura, sin catastro.json ni Maps: api.js arma el índice y el
// formulario pinta; lo que decide si la dirección y el GPS son el mismo
// predio vive aquí para poder probarlo con node.

// Tipos de vía que aparecen en catastro y en BD. Mismo criterio que
// _VIAS_DIR (catastro además escribe KR).
var _VIAS_CAT = [
  [/^(CL|CLL|CLLE|CALLE)\b\.?/, 'CL'],
  [/^(CR|CRA|CRRA|KR|KRA|CARRERA)\b\.?/, 'CR'],
  [/^(DG|DIAG|DIAGONAL)\b\.?/, 'DG'],
  [/^(TV|TRANS|TRANSV|TRANSVERSAL)\b\.?/, 'TV'],
  [/^(AV|AVE|AVENIDA)\b\.?/, 'AV'],
  [/^(CQ|CIRCULAR)\b\.?/, 'CQ'],
];
// Tipos de unidad: catastro escribe `AP 402`, `IN 148`, `CA 48`, `PI1`; el
// inspector `APTO 402`, `INT 148`, `CASA 48`.
var _UNIDADES_CAT = [
  [/\b(APTO|APARTAMENTO)\b\.?/g, 'AP'],
  [/\b(INT|INTERIOR)\b\.?/g, 'IN'],
  [/\b(CA|CASA)\b\.?/g, 'CS'],
  [/\b(LOCAL)\b\.?/g, 'LC'],
  [/\b(PISO)\b\.?/g, 'PI'],
  [/\b(TORRE)\b\.?/g, 'TO'],
  [/\b(BLOQUE)\b\.?/g, 'BL'],
];

// Clave para cruzar una dirección con las de catastro. Devuelve null si no se
// reconoce (rural, referencias, sin placa). Ejemplos:
//   'CL 54A N 45-85 AP 402'  (catastro)  → base 'CL|54A|45|85', unidad 'AP402'
//   'CALLE 54 A # 45-085'    (inspector) → base 'CL|54A|45|85', unidad ''
// `cuadra` = base sin el último número: la usa la búsqueda aproximada
// (placas cercanas en la misma cuadra). Sin ceros a la izquierda: la BD trae
// `45-085` y catastro `45-85`.
function claveDireccionCatastro(dir) {
  var s = (dir == null ? '' : String(dir))
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
  // `12 - CR 50 # 32-10 …`: consecutivo pegado delante (visto en BD); se
  // descarta si detrás viene texto.
  s = s.replace(/^\d+\s*-\s*(?=[A-Z])/, '');
  var via = null;
  for (var i = 0; i < _VIAS_CAT.length; i++) {
    if (_VIAS_CAT[i][0].test(s)) {
      via = _VIAS_CAT[i][1];
      s = s.replace(_VIAS_CAT[i][0], '').trim();
      break;
    }
  }
  if (!via) return null;
  // Separador único `#`: catastro usa `N`, el inspector `#`, `No.`, `N°`.
  s = s.replace(/[N#]\s*[°º]/g, ' # ').replace(/[°º]/g, ' # ')
       .replace(/\b(N|NO|NRO|NUM|NUMERO)\b\.?/g, ' # ')
       .replace(/#(\s*#)+/g, '#');
  var izq, der;
  var k = s.indexOf('#');
  if (k >= 0) {
    izq = s.slice(0, k); der = s.slice(k + 1);
  } else {
    // Sin separador: `CL 50 32-10`, `CR 66BB 55-51`. Corta antes del segundo número.
    var m = s.match(/^(\d+\s*[A-Z]{0,2}(?:\s*BIS)?(?:\s*[A-Z])?)\s+(\d.*)$/);
    if (!m) return null;
    izq = m[1]; der = m[2];
  }
  var vm = izq.trim().match(/^(\d+)\s*([A-Z]{0,2})\s*(BIS)?\s*([A-Z]?)$/);
  if (!vm) return null;
  var pm = der.trim().match(/^(\d+)\s*([A-Z]{0,2})\s*(BIS)?\s*[-\s]\s*(\d+)\s*(.*)$/);
  if (!pm) return null;
  var numVia = String(parseInt(vm[1], 10)) + vm[2] + (vm[3] || '') + vm[4];
  var placa1 = String(parseInt(pm[1], 10)) + pm[2] + (pm[3] || '');
  var placa2 = parseInt(pm[4], 10);
  var cuadra = via + '|' + numVia + '|' + placa1;
  var resto = pm[5] || '';
  for (var u = 0; u < _UNIDADES_CAT.length; u++) {
    resto = resto.replace(_UNIDADES_CAT[u][0], _UNIDADES_CAT[u][1]);
  }
  return {
    base: cuadra + '|' + placa2,
    cuadra: cuadra,
    placa: placa2,
    unidad: resto.replace(/[^0-9A-Z]/g, ''),
  };
}

// Dirección con el formato de la app a partir de la clave de catastro:
// 'CL|54A|45|85' → 'CL 54A # 45-85'. La usa «Usar el del punto» para ofrecer
// la dirección que catastro tiene para el predio donde está el pin.
function direccionDesdeClave(base) {
  var p = String(base || '').split('|');
  if (p.length !== 4) return '';
  var sep = function (t) { return t.replace(/BIS/, ' BIS'); };
  return p[0] + ' ' + sep(p[1]) + ' # ' + sep(p[2]) + '-' + p[3];
}

// Claves de la misma cuadra con placa a ±rango, de la más cercana a la más
// lejana (`45-85` → `45-84`, `45-86`, `45-83`…). La búsqueda aproximada solo
// ofrece candidatos: nunca se preseleccionan.
function clavesCercanasCatastro(clave, rango) {
  if (!clave) return [];
  var r = rango == null ? 10 : rango;
  var out = [];
  for (var d = 1; d <= r; d++) {
    if (clave.placa - d >= 0) out.push({ base: clave.cuadra + '|' + (clave.placa - d), dif: d });
    out.push({ base: clave.cuadra + '|' + (clave.placa + d), dif: d });
  }
  return out;
}

// Entre los candidatos de la búsqueda aproximada (placa inexistente en
// catastro), el vecino más probable: primero el del MISMO costado de la vía
// (misma paridad de placa: pares a un lado, impares al otro), y dentro de él
// el de placa más cercana. `DG 58 # 45-16` no existe → `45-14` (par, dif 2)
// antes que `45-15` (impar, dif 1), que está en la acera de enfrente.
// Lo usa Consulta norma para ubicar el pin; el formulario no preselecciona.
function terrenoVecinoPreferido(clave, terrenos) {
  if (!clave || !terrenos || !terrenos.length) return null;
  var par = clave.placa % 2;
  var mejor = null, mejorPeso = Infinity;
  terrenos.forEach(function (t) {
    var ct = claveDireccionCatastro(t.direccion);
    var dif = ct && ct.cuadra === clave.cuadra ? Math.abs(ct.placa - clave.placa) : (t.dif || 99);
    var otroLado = ct && ct.cuadra === clave.cuadra ? (ct.placa % 2 !== par) : true;
    var peso = (otroLado ? 1000 : 0) + dif;
    if (peso < mejorPeso) { mejorPeso = peso; mejor = t; }
  });
  return mejor;
}

// ¿La unidad que escribió el inspector es la de esta ficha? Catastro suele
// agregar el piso (`AP 102 PI2`) que el inspector no escribe (`APTO 102`):
// calza si la de catastro empieza por la del inspector y lo que sigue es otra
// etiqueta (letra), nunca otro dígito (`AP10` no es `AP102`).
// Solo el número (`CR 62 52-27 (129)`): vale con cualquier tipo de catastro
// (`IN 129`, `AP 129`).
function unidadCatastroCalza(unidadCatastro, unidadInspector) {
  var c = String(unidadCatastro || ''), u = String(unidadInspector || '');
  if (!u || !c) return false;
  if (/^\d+$/.test(u)) c = c.replace(/^[A-Z]+/, '');
  if (c === u) return true;
  return c.indexOf(u) === 0 && /^[A-Z]/.test(c.slice(u.length));
}

// Anillos en el formato de catastro.json: [[lat, lon], ...].
function puntoEnAnillo(lat, lon, anillo) {
  var dentro = false;
  for (var i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    var ai = anillo[i], aj = anillo[j];
    if (((ai[0] > lat) !== (aj[0] > lat)) &&
        (lon < (aj[1] - ai[1]) * (lat - ai[0]) / (aj[0] - ai[0]) + ai[1])) {
      dentro = !dentro;
    }
  }
  return dentro;
}

// Metros del punto al borde más cercano del anillo (0 si está dentro).
// Proyección equirectangular local: a escala de un predio el error es de
// milímetros, y así no depende de turf (que se carga lazy solo para POT).
function distanciaPuntoAnilloM(lat, lon, anillo) {
  if (!anillo || anillo.length < 3) return Infinity;
  if (puntoEnAnillo(lat, lon, anillo)) return 0;
  var kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
  var mejor = Infinity;
  for (var i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    var ax = (anillo[j][1] - lon) * kx, ay = (anillo[j][0] - lat) * ky;
    var bx = (anillo[i][1] - lon) * kx, by = (anillo[i][0] - lat) * ky;
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    var d = Math.sqrt(Math.pow(ax + t * dx, 2) + Math.pow(ay + t * dy, 2));
    if (d < mejor) mejor = d;
  }
  return mejor;
}

// Un punto garantizado DENTRO del anillo, para poner el pin en el predio de
// la dirección. El centroide sirve casi siempre; en un lote en L o en U cae
// afuera, y entonces se toma el centro del tramo más ancho de la horizontal
// que pasa por él. Devuelve [lat, lon].
function puntoInteriorAnillo(anillo) {
  if (!anillo || !anillo.length) return null;
  // Relativo al primer vértice: con coordenadas absolutas (−75,56 × 6,33)
  // la fórmula resta productos de ~480 para obtener áreas de ~1e-8 y el
  // centroide se corre metros.
  var oLat = anillo[0][0], oLon = anillo[0][1];
  var a = 0, cx = 0, cy = 0;
  for (var i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    var xj = anillo[j][1] - oLon, yj = anillo[j][0] - oLat;
    var xi = anillo[i][1] - oLon, yi = anillo[i][0] - oLat;
    var f = xj * yi - xi * yj;
    a += f;
    cx += (xj + xi) * f;
    cy += (yj + yi) * f;
  }
  var lat0, lon0;
  if (Math.abs(a) > 1e-18) {
    lon0 = oLon + cx / (3 * a); lat0 = oLat + cy / (3 * a);
  } else {
    lat0 = 0; lon0 = 0;
    anillo.forEach(function (p) { lat0 += p[0]; lon0 += p[1]; });
    lat0 /= anillo.length; lon0 /= anillo.length;
  }
  if (puntoEnAnillo(lat0, lon0, anillo)) return [lat0, lon0];
  var cortes = [];
  for (var m = 0, n = anillo.length - 1; m < anillo.length; n = m++) {
    var p = anillo[m], q = anillo[n];
    if ((p[0] > lat0) !== (q[0] > lat0)) {
      cortes.push(p[1] + (lat0 - p[0]) * (q[1] - p[1]) / (q[0] - p[0]));
    }
  }
  cortes.sort(function (x, y) { return x - y; });
  var mejor = null, ancho = -1;
  for (var c = 0; c + 1 < cortes.length; c += 2) {
    if (cortes[c + 1] - cortes[c] > ancho) {
      ancho = cortes[c + 1] - cortes[c];
      mejor = (cortes[c] + cortes[c + 1]) / 2;
    }
  }
  return mejor == null ? [anillo[0][0], anillo[0][1]] : [lat0, mejor];
}

// ¿La dirección y el pin son el mismo predio?
//   terrenosDir: [{ tcod, anillo }] — lo que encontró la dirección (1 a 4)
//   lat, lon:    el pin (GPS o mapa), o vacío
// Coinciden si el pin cae dentro de alguno o a ≤ umbralM de su borde: con el
// pin en la calle frente al predio, o en el lindero del vecino, el predio
// inspeccionado es el de la dirección (Fase 0: 66 de 206 visitas 2025+ caían
// así, y la ficha tomada del pin era la del vecino o ninguna). `tcod` es
// siempre el terreno de la dirección más cercano al pin.
function compararUbicacion(terrenosDir, lat, lon, umbralM) {
  var umbral = umbralM == null ? 10 : umbralM;
  var hayDir = !!(terrenosDir && terrenosDir.length);
  var hayPin = lat != null && lon != null && lat !== '' && lon !== '' &&
    isFinite(Number(lat)) && isFinite(Number(lon));
  if (!hayDir) return { estado: 'sin-dir', tcod: null, distM: null };
  if (!hayPin) {
    return { estado: 'sin-pin', tcod: terrenosDir.length === 1 ? terrenosDir[0].tcod : null, distM: null };
  }
  var la = Number(lat), lo = Number(lon);
  var mejor = null, dMin = Infinity;
  terrenosDir.forEach(function (t) {
    var d = distanciaPuntoAnilloM(la, lo, t.anillo);
    if (d < dMin) { dMin = d; mejor = t.tcod; }
  });
  return {
    estado: dMin <= umbral ? 'coincide' : 'distinto',
    tcod: mejor,
    distM: isFinite(dMin) ? Math.round(dMin) : null,
  };
}

// Columna UBICACION_CONFIRMADA: `GPS · 29/09/2026 · NOMBRE`. El servidor
// estampa fecha y nombre; aquí solo se lee el origen.
var ORIGENES_UBICACION = ['GPS', 'MAPA', 'DIRECCION'];
function origenUbicacionConfirmada(valor) {
  var o = String(valor == null ? '' : valor).split('·')[0].trim().toUpperCase();
  return ORIGENES_UBICACION.indexOf(o) >= 0 ? o : '';
}

// La confirmación vale mientras dirección, punto y ficha sean los que se
// confirmaron. Se compara en vez de borrarla en cada evento de edición: así
// ningún camino (arrastrar, tocar, GPS, escribir, elegir ficha) se olvida de
// invalidarla. BD devuelve las coordenadas como texto y el formulario como
// número: se comparan como números con tolerancia (~1 cm).
function ubicacionConfirmadaVigente(conf, d) {
  if (!conf || !conf.origen || !d) return false;
  function mismoNum(a, b) {
    if (a == null || a === '' || b == null || b === '') return false;
    var x = Number(String(a).replace(',', '.')), y = Number(String(b).replace(',', '.'));
    return isFinite(x) && isFinite(y) && Math.abs(x - y) < 1e-7;
  }
  function txt(v) { return String(v == null ? '' : v).trim().toUpperCase().replace(/\s+/g, ' '); }
  return mismoNum(conf.lat, d.lat) && mismoNum(conf.lon, d.lon) &&
    txt(conf.direccion) === txt(d.direccion) &&
    txt(conf.catastral) !== '' && txt(conf.catastral) === txt(d.catastral);
}

// ── Predio en PH sin la unidad identificada ────────────────
// Cuando el inspector no logra saber cuál apartamento o local es (la placa no
// trae interior, nadie atiende), se confirma con el código del predio matriz y
// sin ficha. NPN de 30: 21 del terreno + condición «9» (PH) + 8 ceros de
// edificio/piso/unidad — la misma forma que catastro usa para la matriz.
function codigoPredioMatriz(tcod) {
  var t = String(tcod == null ? '' : tcod).replace(/\D/g, '');
  return t.length === 21 ? t + '900000000' : '';
}
function esCodigoPredioMatriz(catastral) {
  return /^\d{21}900000000$/.test(String(catastral == null ? '' : catastral).trim());
}

// ── Búsqueda por dato catastral (Consulta norma) ───────────
// ¿Lo que se tecleó es un dato de catastro y no una dirección ni coordenadas?
//   '15093'                  → { tipo: 'numero', numero }    ficha O matrícula
//   '01N-5358461'            → { tipo: 'matricula', numero } con círculo registral
//   30 dígitos (NPN)         → { tipo: 'codigo', tcod, sufijo }
//   21 dígitos (terreno)     → { tipo: 'codigo', tcod, sufijo: '' }
// Ficha y matrícula son números del mismo largo (medido en catastro.json:
// fichas de 5 a 9 dígitos, matrículas hasta 7, y 1.127 números existen como
// las dos cosas): un número suelto no se puede clasificar, se busca en ambas.
// El código admite espacios y guiones (así viene impreso) y la forma sin el
// `05088` del municipio. Nada con punto o coma: eso son coordenadas. Menos de
// 4 dígitos no se toma: sería el número de una vía a medio escribir.
function claveBusquedaCatastral(texto) {
  var s = String(texto == null ? '' : texto).trim().toUpperCase();
  if (!s) return null;
  // El círculo registral empieza con 0 (01N, 001); una vía nunca: así «50A 3210»
  // (placa sin tipo de vía) no se toma por matrícula.
  var mm = s.match(/^0\d{1,2}[A-Z]\s*-?\s*(\d{1,9})$/);
  if (mm) return { tipo: 'matricula', numero: Number(mm[1]) };
  if (/^\d{4,9}$/.test(s)) return { tipo: 'numero', numero: Number(s) };
  if (!/^\d[\d\s-]*\d$/.test(s)) return null;
  var d = s.replace(/[\s-]/g, '');
  if (d.length === 25 || d.length === 16) d = '05088' + d;
  if (d.length === 30) return { tipo: 'codigo', tcod: d.slice(0, 21), sufijo: d.slice(21) };
  if (d.length === 21) return { tipo: 'codigo', tcod: d, sufijo: '' };
  return null;
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
//
// `puntoCatastro` ([lat, lon], opcional): el predio que catastro tiene para
// esa dirección (puntoMapaDesdeCatastro). Va DESPUÉS de las coordenadas
// guardadas — esas las fijó alguien — y ANTES del texto, que Google interpola
// sobre la cuadra o resuelve en otro municipio.
function linkMapaVisita(fila, puntoCatastro) {
  if (!fila) return '';
  var base = 'https://www.google.com/maps/search/?api=1&query=';
  var lat = normalizarCoord(fila['LATITUD'], 'lat');
  var lon = normalizarCoord(fila['LONGITUD'], 'lon');
  if (lat != null && lon != null) return base + lat.toFixed(6) + ',' + lon.toFixed(6);
  var dir = String(fila['DIRECCION INFRACCION'] || fila['DIRECCION'] || '').trim();
  if (!dir) return '';
  // Dirección que es una coordenada («6 21'3,858"N 75 33'28,272"W»): se manda
  // el punto tal cual. Con «, Bello, Antioquia…» detrás Google no la resuelve.
  var pc = puntoDesdeTextoCoord(dir);
  if (pc) return base + pc.lat.toFixed(6) + ',' + pc.lon.toFixed(6);
  if (puntoCatastro && isFinite(puntoCatastro[0]) && isFinite(puntoCatastro[1])) {
    return base + Number(puntoCatastro[0]).toFixed(6) + ',' + Number(puntoCatastro[1]).toFixed(6);
  }
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

// ¿«Cómo llegar» de esta fila puede mejorar con catastro? Solo sin
// coordenadas guardadas y con una dirección urbana que se deje leer.
function filaNecesitaPuntoCatastro(fila) {
  if (!fila) return false;
  if (normalizarCoord(fila['LATITUD'], 'lat') != null &&
      normalizarCoord(fila['LONGITUD'], 'lon') != null) return false;
  if (puntoDesdeTextoCoord(fila['DIRECCION INFRACCION'] || fila['DIRECCION'] || '')) return false;
  return !!claveDireccionCatastro(fila['DIRECCION INFRACCION'] || fila['DIRECCION'] || '');
}

// Punta a punta del predio (diagonal de su caja), en metros.
function diagonalAnilloM(anillo) {
  if (!anillo || !anillo.length) return 0;
  var la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
  anillo.forEach(function (p) {
    if (p[0] < la0) la0 = p[0]; if (p[0] > la1) la1 = p[0];
    if (p[1] < lo0) lo0 = p[1]; if (p[1] > lo1) lo1 = p[1];
  });
  var kx = 111320 * Math.cos(((la0 + la1) / 2) * Math.PI / 180), ky = 110540;
  return Math.sqrt(Math.pow((la1 - la0) * ky, 2) + Math.pow((lo1 - lo0) * kx, 2));
}

// Punto de catastro para «Cómo llegar», o null si debe ir el texto a Google.
//   resultado: lo que devuelve buscarCatastroPorDireccion (api.js)
//   nFichas:   fichas del terreno hallado
// Solo dirección EXACTA en UN predio: las placas vecinas son candidatas para
// que el inspector elija en el formulario, no para mandarlo sin preguntar.
// Y solo predio chico: en una urbanización que ocupa la manzana (o varias) el
// centro cae lejos de la portería y la dirección puede estar sobre otra vía;
// ahí Google por texto llega mejor (decisión del usuario 2026-10-01).
// Medido ese día: de 150 visitas por hacer sin coordenadas, 82 calzan exacto
// en un predio y 17 de esas son grandes → 65 usan este punto.
var MAPA_PREDIO_MAX_DIAG_M = 100;
var MAPA_PREDIO_MAX_FICHAS = 50;
function puntoMapaDesdeCatastro(resultado, nFichas) {
  if (!resultado || !resultado.exacta) return null;
  var ts = resultado.terrenos || [];
  if (ts.length !== 1 || !ts[0].anillo || ts[0].anillo.length < 3) return null;
  if ((nFichas || 0) > MAPA_PREDIO_MAX_FICHAS) return null;
  if (diagonalAnilloM(ts[0].anillo) > MAPA_PREDIO_MAX_DIAG_M) return null;
  return puntoInteriorAnillo(ts[0].anillo);
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

// Días hábiles que lleva una visita INICIADA sin completarse, desde la fecha
// de visita (o la de asignación si aquella falta). Misma unidad que
// diasSinIniciar: las dos alertas se ordenan juntas en Inicio y antes esta
// contaba días calendario, así que «145» y «142» no eran comparables.
function diasSinCompletar(fila, hoy) {
  if (!fila) return null;
  var e = _normEstadoVisitaBD(fila['ESTADO VISITA'] || fila[13] || '');
  if (e !== 'INICIADO') return null;
  var d = parsearFecha(fila['FECHA DE VISITA'] || '') ||
          parsearFecha(fila['FECHA ASIGNACION VISITA'] || '');
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

// ── Agenda: jornada agrupada por barrio (2026-10-02) ───────────
// Clave para comparar barrios: en BD el mismo barrio aparece como «LA
// GABRIELA» y «La Gabriela», «Vda. La Union» y «VDA. LA UNIÓN». Medido el
// 2026-10-02 sobre las 161 pendientes sugeribles: 98 textos distintos quedan
// en 77 barrios solo con mayúsculas, tildes y puntuación.
function claveBarrio(texto) {
  var s = String(texto == null ? '' : texto).toUpperCase();
  if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return s.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Arma la jornada de una comuna poniendo juntas las visitas cercanas.
// `visitas` llega en orden de urgencia. La primera es el ancla: su barrio es
// el sugerido, así lo urgente nunca espera por agrupar. Se toman primero las
// del barrio (elegido o sugerido) y, si no alcanzan para `n`, las más
// urgentes del resto de la comuna; lo elegido se pinta con cada barrio junto.
// Una visita sin barrio no forma grupo ni sale como opción.
function armarJornadaPorBarrio(visitas, n, barrioElegido) {
  var lista = visitas || [];
  var barrios = [];
  var porClave = {};
  lista.forEach(function (v) {
    var k = claveBarrio(v && v.barrio);
    if (!k) return;
    if (!porClave[k]) {
      porClave[k] = { clave: k, nombre: String(v.barrio).trim(), total: 0 };
      barrios.push(porClave[k]);
    }
    porClave[k].total++;
  });
  var sugerido = lista.length ? claveBarrio(lista[0].barrio) : '';
  var barrio = (barrioElegido && porClave[barrioElegido]) ? barrioElegido : sugerido;
  var propias = [], resto = [];
  lista.forEach(function (v) {
    (barrio && claveBarrio(v.barrio) === barrio ? propias : resto).push(v);
  });
  var tope = Math.max(0, n || 0);
  var elegidas = propias.concat(resto).slice(0, tope);
  // Cada barrio junto, en el orden en que aparece su primera visita.
  var orden = [];
  var grupos = {};
  elegidas.forEach(function (v, i) {
    var k = claveBarrio(v.barrio) || ('\u0000' + i);
    if (!grupos[k]) { grupos[k] = []; orden.push(k); }
    grupos[k].push(v);
  });
  var items = [];
  orden.forEach(function (k) { items = items.concat(grupos[k]); });
  return { barrios: barrios, barrio: barrio, sugerido: sugerido, items: items };
}

// ── Agenda por inspector (2026-10-03) ───────────────────────────
// Regla del usuario: sin mañana/tarde. Cada inspector tiene su día (meta 3,
// aunque salgan juntos), cada visita va a uno solo y la ruta empieza en la
// visita más lejana de la Alcaldía. agenda.jsx solo pinta;
// tests/agenda-inspector.test.js.
var AGENDA_OFICINA = { lat: 6.335529, lon: -75.558507 }; // Alcaldía de Bello, CR 50 # 51-00 (catastro)

// Nivel de la prioridad de la PQR (1-10) y el plazo de visita de esa escala
// (niveles de _nivelDesdePuntaje en priorizacion_radicados.gs).
function nivelPrioridad(bc) {
  if (bc === null || bc === undefined || bc === '') return null;
  var n = Number(bc);
  if (isNaN(n)) return null;
  if (n >= 9) return { nivel: 'Crítica', plazo: 5 };
  if (n >= 7) return { nivel: 'Alta', plazo: 20 };
  if (n >= 5) return { nivel: 'Media', plazo: 30 };
  if (n >= 3) return { nivel: 'Baja', plazo: null };
  return { nivel: 'Mínima', plazo: null };
}

// El porqué de una sugerida, en vez del puntaje: «Alta · vencida hace 158
// días», «Baja · 163 días», «Sin análisis · 101 días». `c` = candidata de
// obtenerAgenda ({ prioridad, dias }).
function motivoPrioridad(c) {
  var p = nivelPrioridad(c && c.prioridad);
  var nivel = p ? p.nivel : 'Sin análisis';
  var dias = c && typeof c.dias === 'number' && c.dias >= 0 ? c.dias : null;
  if (dias === null) return { nivel: nivel, texto: '', vencida: false };
  if (p && p.plazo !== null && dias > p.plazo) {
    var v = dias - p.plazo;
    return { nivel: nivel, texto: 'vencida hace ' + v + (v === 1 ? ' día' : ' días'), vencida: true };
  }
  return { nivel: nivel, texto: dias + (dias === 1 ? ' día' : ' días'), vencida: false };
}

// Distancia aproximada en metros (equirrectangular: sobra a escala de Bello).
function _distanciaM(a, b) {
  var k = Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);
  var dx = (a.lon - b.lon) * k, dy = a.lat - b.lat;
  return Math.sqrt(dx * dx + dy * dy) * 111320;
}

// Orden del recorrido: primero la más lejana de la oficina; el resto, el
// orden que suma menos trayecto volviendo a la oficina (todas las
// permutaciones hasta 7 restantes; con más, vecino más cercano). Las paradas
// sin punto van al final, en su orden de entrada.
// `paradas`: [{ punto: { lat, lon } | null, ... }].
function ordenarRuta(paradas, oficina) {
  var con = [], sin = [];
  (paradas || []).forEach(function (p) { (p && p.punto ? con : sin).push(p); });
  if (con.length < 2) return con.concat(sin);
  var of = oficina || AGENDA_OFICINA;
  var iLejos = 0;
  con.forEach(function (p, i) {
    if (_distanciaM(p.punto, of) > _distanciaM(con[iLejos].punto, of)) iLejos = i;
  });
  var primera = con[iLejos];
  var resto = con.filter(function (_, i) { return i !== iLejos; });
  var mejor = [];
  if (resto.length <= 7) {
    var mejorCosto = Infinity;
    (function permutar(prefijo, quedan) {
      if (!quedan.length) {
        var costo = 0, prev = primera.punto;
        prefijo.forEach(function (p) { costo += _distanciaM(prev, p.punto); prev = p.punto; });
        costo += _distanciaM(prev, of);
        if (costo < mejorCosto) { mejorCosto = costo; mejor = prefijo; }
        return;
      }
      quedan.forEach(function (p, i) {
        permutar(prefijo.concat([p]), quedan.slice(0, i).concat(quedan.slice(i + 1)));
      });
    })([], resto);
  } else {
    var actual = primera.punto, pendientes = resto.slice();
    while (pendientes.length) {
      var j = 0;
      pendientes.forEach(function (p, i) {
        if (_distanciaM(actual, p.punto) < _distanciaM(actual, pendientes[j].punto)) j = i;
      });
      mejor.push(pendientes[j]);
      actual = pendientes[j].punto;
      pendientes.splice(j, 1);
    }
  }
  return [primera].concat(mejor, sin);
}

// ── Ruta del día (Semana de visitas, 2026-10-14) ────────────────
// Decisiones del usuario: arranca en la ubicación actual del inspector y
// sigue el recorrido más corto (no vuelve a la oficina, a diferencia de
// ordenarRuta, que es el orden de la Agenda). Sin ubicación, desde la Alcaldía.
// Recorrido abierto exacto hasta 8 paradas; con más, vecino más cercano.
// ponytail: vecino más cercano puede quedar ~20 % arriba del óptimo; 2-opt si
// algún día hay días de >8 paradas con punto.
function rutaMasCortaDesde(paradas, origen) {
  var con = [], sin = [];
  (paradas || []).forEach(function (p) { (p && p.punto ? con : sin).push(p); });
  var o = origen || AGENDA_OFICINA;
  if (con.length < 2) return con.concat(sin);
  var mejor = null;
  if (con.length <= 8) {
    var mejorCosto = Infinity;
    (function permutar(prefijo, quedan, costo, prev) {
      if (costo >= mejorCosto) return;
      if (!quedan.length) { mejorCosto = costo; mejor = prefijo; return; }
      quedan.forEach(function (p, i) {
        permutar(prefijo.concat([p]), quedan.slice(0, i).concat(quedan.slice(i + 1)),
          costo + _distanciaM(prev, p.punto), p.punto);
      });
    })([], con, 0, o);
  } else {
    mejor = [];
    var actual = o, pendientes = con.slice();
    while (pendientes.length) {
      var j = 0;
      pendientes.forEach(function (p, i) {
        if (_distanciaM(actual, p.punto) < _distanciaM(actual, pendientes[j].punto)) j = i;
      });
      mejor.push(pendientes[j]);
      actual = pendientes[j].punto;
      pendientes.splice(j, 1);
    }
  }
  return mejor.concat(sin);
}

// Enlaces de Google Maps para un recorrido ya ordenado. Sin `origin`: Maps
// sale de donde está el teléfono. Maps acepta 9 paradas intermedias + destino,
// así que más de 10 paradas se parten en tramos (el 2.º sale de donde termina
// el 1.º, que es donde estará el inspector al abrirlo).
// Parada = { punto: {lat, lon} | null, dir }. Sin punto va la dirección en
// texto, sin barrio (ver linkMapaVisita: el barrio empeora la resolución).
var RUTA_MAX_PARADAS_TRAMO = 10;
function linksRutaMaps(paradas) {
  var lugar = function (p) {
    if (p.punto) return p.punto.lat.toFixed(6) + ',' + p.punto.lon.toFixed(6);
    return String(p.dir || '').trim() + ', Bello, Antioquia, Colombia';
  };
  var validas = (paradas || []).filter(function (p) { return p && (p.punto || String(p.dir || '').trim()); });
  var tramos = [];
  for (var i = 0; i < validas.length; i += RUTA_MAX_PARADAS_TRAMO) {
    var t = validas.slice(i, i + RUTA_MAX_PARADAS_TRAMO).map(lugar);
    var url = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' +
      encodeURIComponent(t[t.length - 1]);
    if (t.length > 1) url += '&waypoints=' + t.slice(0, -1).map(encodeURIComponent).join('%7C');
    tramos.push({ desde: i + 1, hasta: i + t.length, url: url });
  }
  return tramos;
}

// Comuna como clave comparable: 'RURAL', '5' (de 5, '5', '05', '5.0') o ''.
// Mismo criterio que obtenerAgendaDiaria del backend.
function claveComunaAgenda(c) {
  var s = String(c == null ? '' : c).trim().toUpperCase();
  if (s === 'RURAL') return 'RURAL';
  var n = parseFloat(s);
  return isNaN(n) ? '' : String(Math.round(n));
}

// Borrador del día (el tablero arranca armado, decisión del usuario): por
// inspector, en orden, faltan = meta − lo que ya tiene ese día. Toma de la
// primera comuna que ningún otro inspector use, agrupando por barrio
// (armarJornadaPorBarrio); si no alcanza, sigue con la siguiente, y solo al
// final repite comuna. Nunca la misma visita en dos inspectores.
// `comunas` = respuesta de obtenerAgenda, en orden de urgencia;
// `yaPorInspector` = { nombre: cuántas tiene ya ese día }.
// `zonasPorInspector` = { nombre: [comuna de cada visita que ya tiene] }:
// quien ya tiene visitas ese día solo recibe sugerencias de esas mismas
// comunas (o de rural, si las suyas son rurales). Un día con dos veredas y
// una casa en C2 no se puede recorrer (revisión 2026-10-13). Si ahí no queda
// nada, se queda corto: la meta es aviso, no tope. Van primero, para que
// otro inspector no les gaste su zona.
function armarBorradorAgenda(comunas, inspectores, meta, yaPorInspector, zonasPorInspector) {
  var borrador = {};
  var tomadas = {};
  var usadas = {};
  var zonasDe = function (nombre) {
    var z = {};
    ((zonasPorInspector && zonasPorInspector[nombre]) || []).forEach(function (c) {
      var k = claveComunaAgenda(c);
      if (k) z[k] = true;
    });
    return Object.keys(z).length ? z : null;
  };
  var orden = (inspectores || []).filter(function (n) { return zonasDe(n); })
    .concat((inspectores || []).filter(function (n) { return !zonasDe(n); }));
  (inspectores || []).forEach(function (nombre) { borrador[nombre] = []; });
  orden.forEach(function (nombre) {
    var zonas = zonasDe(nombre);
    var faltan = Math.max(0, (meta || 0) - ((yaPorInspector && yaPorInspector[nombre]) || 0));
    if (zonas) Object.keys(zonas).forEach(function (k) { usadas[k] = true; });
    [false, true].forEach(function (repetir) {
      (comunas || []).forEach(function (g) {
        var k = claveComunaAgenda(g.comuna);
        if (zonas) {
          // Solo su zona, en una sola pasada.
          if (repetir || !faltan || !zonas[k]) return;
        } else if (!faltan || (!repetir && usadas[k])) return;
        var libres = (g.visitas || []).filter(function (v) { return !tomadas[v.fila]; });
        if (!libres.length) return;
        var elegidas = armarJornadaPorBarrio(libres, faltan).items;
        elegidas.forEach(function (v) { tomadas[v.fila] = true; borrador[nombre].push(v); });
        usadas[k] = true;
        faltan -= elegidas.length;
      });
    });
  });
  return borrador;
}

function _soloFecha(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

// Día hábil siguiente (delta > 0) o anterior (delta < 0); salta fines de
// semana y festivos.
function moverDiaHabil(fecha, delta) {
  var d = _soloFecha(fecha);
  var paso = delta < 0 ? -1 : 1;
  for (var i = 0; i < 30; i++) {
    d.setDate(d.getDate() + paso);
    if (esDiaHabil(d)) return d;
  }
  return d;
}

// La Agenda abre en hoy; en sábado, domingo o festivo, en el siguiente día
// hábil. El admin cambia el día siempre que quiera.
function diaInicialAgenda(hoy) {
  var d = _soloFecha(hoy || new Date());
  return esDiaHabil(d) ? d : moverDiaHabil(d, 1);
}

var _DIAS_LARGOS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// «Lunes 5 de octubre».
function fechaLargaAgenda(fecha) {
  return _DIAS_LARGOS_ES[fecha.getDay()] + ' ' + fecha.getDate() + ' de ' + _MESES_ES[fecha.getMonth()];
}

// Lo que un inspector ya tiene ese día: asignadas o iniciadas cuya fecha de
// agenda es esa, con la regla del diligenciador. Cuenta para su meta.
function visitasDelDia(filas, fecha, nombre) {
  var t = _soloFecha(fecha).getTime();
  return (filas || []).filter(function (f) {
    var e = _normEstadoVisitaBD(f['ESTADO VISITA'] || '');
    if (e !== 'ASIGNADO' && e !== 'INICIADO') return false;
    var d = fechaAgendaVisita(f);
    return !!d && _soloFecha(d).getTime() === t && _esVisitaDe(f, nombre);
  });
}

// ── Mis visitas: lista de deuda + panel de detalle (2026-10-02) ─
// La pantalla dejó de ser un archivador por estado: es lo que el inspector
// debe, ordenado por antigüedad. Toda la regla vive aquí; mis-visitas.jsx
// solo pinta. tests/mis-visitas.test.js.

// N° de orden de policía de la fila, '' si no tiene. El encabezado llega con
// y sin "°" según la hoja, y las filas migradas de V2 traen 'N/A' en vez de
// vacío (mismo criterio que _hayOrdenReal de nueva-visita.jsx). Vivía en
// visita-card.jsx; se movió aquí porque entregablesFaltantes la necesita.
function ordenPoliciaDe(f) {
  var s = String((f && (f['N° ORDEN DE POLICIA'] || f['N ORDEN DE POLICIA'])) || '').trim();
  var u = s.toUpperCase();
  return (u === 'N/A' || u === 'NA' || u === 'NO APLICA') ? '' : s;
}

// Expediente del caso (col EXPEDIENTE, 2026-10-19): dígitos o vacío. 'NUEVO'
// no es un expediente, es «aún sin expediente» — misma lectura que el campo
// al asignar, donde vacío significa NUEVO. tests/expediente.test.js.
function expedienteDe(f) {
  var s = String((f && f['EXPEDIENTE']) == null ? '' : f['EXPEDIENTE']).trim();
  var u = s.toUpperCase();
  return (!s || u === 'NUEVO') ? '' : s;
}

// Cómo se identifica la visita en pantalla (decisión del usuario 2026-10-19):
// con expediente, la tarjeta muestra «Exp. 2201» en lugar del radicado y el
// radicado pasa al title; sin expediente, el radicado como siempre. En la
// ficha y «Ver datos» se muestran los dos porque ahí se gestiona. `secundario`
// es '' cuando principal ya es el radicado.
function identificadorVisita(f) {
  var exp = expedienteDe(f);
  var rad = String((f && f['RADICADO']) || '').trim();
  return exp ? { principal: 'Exp. ' + exp, secundario: rad } : { principal: rad, secundario: '' };
}

// Id de un archivo de Drive a partir de su enlace (`/d/<id>/` o `?id=<id>`),
// '' si no es un enlace de archivo. Para armar la vista previa embebida.
function idArchivoDrive(link) {
  var s = String(link || '');
  var m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(s) || /[?&]id=([a-zA-Z0-9_-]{20,})/.exec(s);
  return m ? m[1] : '';
}

// Qué le falta a una visita INICIADA para poder cerrarse: acta, orden
// escaneada (solo si la visita tiene N° de orden real) y registro
// fotográfico. Misma lista que la cabecera del formulario (_pendientesPanel),
// con una diferencia decidida por el usuario el 2026-10-02: aquí el registro
// cuenta siempre que no exista, porque la fila no dice si ya hay fotos
// subidas. El informe no se lista, igual que allá.
// Excepción (2026-10-15): la visita que se documenta con informe técnico
// (DOCUMENTO_VISITA = INFORME) no lleva acta ni su registro fotográfico: lo
// que falta es el informe (y la orden, si aplica).
function entregablesFaltantes(fila) {
  if (!fila) return [];
  if (_normEstadoVisitaBD(fila['ESTADO VISITA'] || fila[13] || '') !== 'INICIADO') return [];
  var out = [];
  // Acta o informe: con uno de los dos basta (ficha v2, 2026-10-25) — el que
  // existe documenta la visita y el otro no se pide.
  var tieneActa = !!(fila['LINK_XLSX_ACTA'] || fila['LINK_PDF_ACTA']);
  var tieneInforme = !!fila['LINK_DOCX_INFORME'];
  if (documentoVisita(fila) === 'INFORME') {
    if (!tieneInforme && !tieneActa) out.push('Informe');
    if (ordenPoliciaDe(fila) && !fila['LINK_ORDEN_POLICIA']) out.push('Orden escaneada');
    return out;
  }
  if (!tieneActa && !tieneInforme) out.push('Acta');
  if (ordenPoliciaDe(fila) && !fila['LINK_ORDEN_POLICIA']) out.push('Orden escaneada');
  if (!fila['LINK_REGISTRO_FOTOS']) out.push('Registro fotográfico');
  return out;
}

// Con qué documento se cierra la visita (columna DOCUMENTO_VISITA, decisión
// del usuario 2026-10-15): 'INFORME' (no lleva acta; el texto no tiene el
// tope de la celda del acta) o 'ACTA', que es lo de siempre y lo que vale
// con la columna vacía. Acepta la fila de BD o el valor suelto.
function documentoVisita(fila) {
  var v = fila && typeof fila === 'object' ? fila['DOCUMENTO_VISITA'] : fila;
  return String(v || '').trim().toUpperCase() === 'INFORME' ? 'INFORME' : 'ACTA';
}

// Las visitas de `miNombre` en tres grupos:
//   hacer  [{ f, dias }]          PENDIENTE/ASIGNADO visibles hoy (asignadaVisibleHoy)
//   curso  [{ f, dias, faltan }]  INICIADO
//   hechas [{ f, fecha }]         COMPLETADO, la más reciente primero
// `dias` son días hábiles (diasSinIniciar / diasSinCompletar): la misma
// cuenta de las alertas de Inicio, para que una visita diga el mismo número
// en las dos pantallas. En hacer y curso va primero la más demorada; la que
// no tiene fecha legible (dias null) va al final, no desaparece.
// Regla del diligenciador vía _esVisitaDe. Sin nombre no devuelve nada: aquí
// «sin filtro» serían las visitas de todos.
function agruparMisVisitas(filas, miNombre, hoy) {
  var out = { hacer: [], curso: [], hechas: [] };
  if (!String(miNombre || '').trim()) return out;
  var ref = hoy instanceof Date ? hoy : (parsearFecha(hoy) || new Date());
  (filas || []).forEach(function (f) {
    if (!f || !_esVisitaDe(f, miNombre)) return;
    var e = _normEstadoVisitaBD(f['ESTADO VISITA'] || f[13] || '');
    if (e === 'PENDIENTE' || e === 'ASIGNADO') {
      if (!asignadaVisibleHoy(f, ref)) return;
      out.hacer.push({ f: f, dias: diasSinIniciar(f, ref) });
    } else if (e === 'INICIADO') {
      out.curso.push({ f: f, dias: diasSinCompletar(f, ref), faltan: entregablesFaltantes(f) });
    } else if (e === 'COMPLETADO') {
      out.hechas.push({ f: f, fecha: parsearFecha(f['FECHA DE VISITA'] || '') || parsearFecha(f['FECHA DEVOLUCION'] || '') });
    }
  });
  var porDemora = function (a, b) {
    return (b.dias == null ? -1 : b.dias) - (a.dias == null ? -1 : a.dias);
  };
  out.hacer.sort(porDemora);
  out.curso.sort(porDemora);
  out.hechas.sort(function (a, b) {
    return (b.fecha ? b.fecha.getTime() : 0) - (a.fecha ? a.fecha.getTime() : 0);
  });
  return out;
}

// Completadas por mes de visita, en el orden en que llegan (la más reciente
// primero). `limite` corta cuántas se pintan en total, pero `total` cuenta
// todas las del mes: el rótulo no puede decir «3» porque el resto esté tras
// «Mostrar más». El año solo se escribe si no es el actual.
var _MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function mesesMisVisitas(hechas, limite, hoy) {
  var ref = hoy instanceof Date ? hoy : (parsearFecha(hoy) || new Date());
  var tope = limite == null ? Infinity : limite;
  var out = [], idx = {};
  (hechas || []).forEach(function (h, i) {
    var d = h.fecha;
    var k = d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') : '';
    if (idx[k] === undefined) {
      idx[k] = out.length;
      out.push({
        clave: k, total: 0, items: [],
        rotulo: d
          ? 'Completadas en ' + _MESES_ES[d.getMonth()] + (d.getFullYear() !== ref.getFullYear() ? ' de ' + d.getFullYear() : '')
          : 'Completadas sin fecha de visita',
      });
    }
    out[idx[k]].total++;
    if (i < tope) out[idx[k]].items.push(h);
  });
  return out.filter(function (g) { return g.items.length > 0; });
}

// Recorrido del caso para el panel: radicada → asignada → visita → completada.
// Cada paso: { clave, rotulo, valor, hecho, espera, dias }. `espera` marca el
// paso donde el caso está detenido (uno solo, o ninguno si ya se completó) y
// `dias` los días hábiles que lleva ahí. `valor` es la fecha DD/MM/AAAA, o
// «Sin iniciar» / «Sin completar» en el paso detenido, o '' si no hay dato.
function recorridoVisita(fila, hoy) {
  if (!fila) return [];
  var e = _normEstadoVisitaBD(fila['ESTADO VISITA'] || fila[13] || '');
  var empezada = e === 'INICIADO' || e === 'COMPLETADO';
  var completa = e === 'COMPLETADO';
  var fRad = formatearFecha(fila['FECHA RADICADO'] || '');
  var fAsig = formatearFecha(fila['FECHA ASIGNACION VISITA'] || '');
  var pasos = [
    { clave: 'radicada', rotulo: 'Radicada', valor: fRad, hecho: !!fRad },
    { clave: 'asignada', rotulo: 'Asignada', valor: fAsig, hecho: !!fAsig },
    { clave: 'visita', rotulo: 'Visita', valor: empezada ? formatearFecha(fila['FECHA DE VISITA'] || '') : '', hecho: empezada },
    { clave: 'completada', rotulo: 'Completada', valor: completa ? formatearFecha(fila['FECHA DEVOLUCION'] || '') : '', hecho: completa },
  ];
  pasos.forEach(function (p) { p.espera = false; p.dias = null; });
  if (!empezada) {
    pasos[2].espera = true; pasos[2].valor = 'Sin iniciar'; pasos[2].dias = diasSinIniciar(fila, hoy);
  } else if (!completa) {
    pasos[3].espera = true; pasos[3].valor = 'Sin completar'; pasos[3].dias = diasSinCompletar(fila, hoy);
  }
  return pasos;
}

// ── Inicio del inspector: lo que Mis visitas hereda de Inicio (2026-10-05) ──
// Misma regla que los indicadores de Inicio para que las dos pantallas no
// puedan decir números distintos por una visita que cuenta en una y no en la
// otra.

// Completadas del mes actual y del anterior, por FECHA DE VISITA (el día que
// el inspector salió, no el de devolución: una visita de fin de mes devuelta
// al siguiente contaba en el mes equivocado). Recibe las `hechas` de
// agruparMisVisitas — la regla del diligenciador ya está aplicada.
function completadasMesesVisita(hechas, hoy) {
  var ref = hoy instanceof Date ? hoy : (parsearFecha(hoy) || new Date());
  var ant = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  var out = { actual: 0, anterior: 0 };
  (hechas || []).forEach(function (h) {
    var d = parsearFecha((h && h.f && h.f['FECHA DE VISITA']) || '');
    if (!d) return;
    if (d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear()) out.actual++;
    else if (d.getMonth() === ant.getMonth() && d.getFullYear() === ant.getFullYear()) out.anterior++;
  });
  return out;
}

// Audiencia (FECHA CITACION) a ≤DIAS_ALERTA_AUDIENCIA días hábiles: la única
// alerta urgente que queda. Franja de Inicio y de Mis visitas — una sola regla.
// Solo visitas INICIADO (sin visita no hay citación pendiente de cierre).
// Devuelve [{ f, dias }] con la más próxima primero; 0 = hoy.
var DIAS_ALERTA_AUDIENCIA = 3;
function audienciasProximas(filas, nombre, hoy) {
  var ref = hoy instanceof Date ? hoy : (parsearFecha(hoy) || new Date());
  var out = [];
  (filas || []).forEach(function (f) {
    if (!f || !_esVisitaDe(f, nombre)) return;
    if (_normEstadoVisitaBD(f['ESTADO VISITA'] || f[13] || '') !== 'INICIADO') return;
    var d = parsearFecha(f['FECHA CITACION'] || '');
    if (!d) return;
    var n = _diasHabilesEntre(ref, d);
    if (n == null || n < 0 || n > DIAS_ALERTA_AUDIENCIA) return;
    out.push({ f: f, dias: n });
  });
  out.sort(function (a, b) { return a.dias - b.dias; });
  return out;
}

// ── Barrio oficial del POT de cada visita (E5 «Buscar» y E7 «Tablero», 2026-10-08) ──
// Base compartida; salió de herramientas/barrio-pot (ver su INFORME.md: regla, cifras y
// casos a revisar). Lógica pura. Regla:
//   1. Con coordenadas dentro de un barrio del POT → ese barrio (fuente 'punto'). El punto manda.
//   2. Sin punto (o punto fuera de toda capa) → por el nombre escrito, con clave canónica + alias
//      (fuente 'nombre'). Si el nombre existe en dos comunas (Guasimalito 9 y 10), decide la
//      comuna de la fila.
//   3. Con punto y un nombre escrito que es otro barrio del POT, se informa `conflictoM` (metros
//      del punto al barrio escrito); `revisar` si pasa de UMBRAL_REVISAR_BARRIO_M.
// Datos: barrios-mapa.json (arreglo `barrios`) + `proj` de comunas-mapa.json. claveBarrioPot NO
// es claveBarrio (arriba): esta quita «Vda.» y «Nº» y junta los espacios para comparar con el POT.

var UMBRAL_REVISAR_BARRIO_M = 1000;

// Misma clave que `_canonBarrio` de nueva-visita.jsx: sin tildes, sin «Vda.», sin «Nº», sin signos ni espacios.
// Así 'Zona Industrial #1' ≡ 'Zona Industrial Nº1' y 'Hatoviejo' ≡ 'Hato Viejo' sin alias.
function claveBarrioPot(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/^VDA\.?\s*/, '')
    .replace(/N[º°]/g, '')
    .replace(/[^A-Z0-9]+/g, '');
}

// Lo que la clave no salva: artículos, plurales, abreviaturas y nombres de uso común.
// Clave canónica de lo escrito (BD o lista del formulario) → nombre exacto en el POT.
// Cada alias está respaldado por dónde caen los puntos de esas filas (INFORME.md).
var ALIAS_BARRIO_POT = {
  ELCONGOLO: 'Congolo',
  LANAVARRA: 'Navarra',
  GRANAVENIDA: 'La Gran Avenida',
  NIQUIABIFAMILIARES: 'Niquia Bifamiliar',
  NAZARET: 'Nazareth',
  RINCONSANTOS: 'Rincon Santo',
  JOSEANTONIOGALAN: 'Jose A. Galan',
  VILLASDEOCCIDENTE: 'Villa de Occidente',
  ROSALESDETERRANOVA: 'Terranova',
};
// Nombres que no se pueden resolver sin punto: abarcan varios barrios del POT.
var NOMBRES_BARRIO_AMBIGUOS = new Set(['NIQUIA']);

function _bpAnillos(d) {
  return String(d).split('M').filter(Boolean)
    .map(seg => seg.replace(/Z/gi, '').split('L').map(p => p.trim().split(/[ ,]+/).map(Number)));
}
function _bpDentro(x, y, rings) {
  let ok = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ok = !ok;
    }
  }
  return ok;
}
function _bpDistSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// barrios: arreglo de barrios-mapa.json (`n`, `c`, `d`, `b`); proj: `proj` de comunas-mapa.json.
function crearIndiceBarriosPot(barrios, proj) {
  const lista = barrios.map((b, i) => ({
    i, n: b.n, c: String(b.c), clave: claveBarrioPot(b.n), bb: b.b, rings: _bpAnillos(b.d),
  }));
  const porClave = new Map();
  lista.forEach(b => {
    if (!porClave.has(b.clave)) porClave.set(b.clave, []);
    porClave.get(b.clave).push(b);
  });
  // 1° de latitud ≈ 110,57 km; la proyección usa la misma escala en x (lon·cos lat), así que vale para ambos ejes.
  return { lista, porClave, proj, metrosPorUnidad: 110574 / proj.s };
}

function _bpProyectar(idx, lat, lon) {
  const p = idx.proj;
  return [(lon * p.k - p.minX) * p.s, (p.maxY - lat) * p.s];
}

function _bpCoordValida(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat > 6.2 && lat < 6.45 && lon > -75.65 && lon < -75.45;
}

function barrioPotPorPunto(idx, lat, lon) {
  if (!_bpCoordValida(lat, lon)) return null;
  const [x, y] = _bpProyectar(idx, lat, lon);
  return idx.lista.find(b => x >= b.bb[0] && x <= b.bb[2] && y >= b.bb[1] && y <= b.bb[3] && _bpDentro(x, y, b.rings)) || null;
}

// comuna: la de la fila, para desempatar nombres repetidos en el POT.
function barrioPotPorNombre(idx, nombre, comuna) {
  let k = claveBarrioPot(nombre);
  if (!k || NOMBRES_BARRIO_AMBIGUOS.has(k)) return null;
  if (ALIAS_BARRIO_POT[k]) k = claveBarrioPot(ALIAS_BARRIO_POT[k]);
  const cands = idx.porClave.get(k);
  if (!cands) return null;
  if (cands.length === 1) return cands[0];
  return cands.find(b => b.c === String(comuna || '')) || cands[0];
}

// Metros desde el punto hasta el borde del barrio (0 si cae _bpDentro).
function distanciaABarrioPotM(idx, lat, lon, barrio) {
  const [x, y] = _bpProyectar(idx, lat, lon);
  if (_bpDentro(x, y, barrio.rings)) return 0;
  let m = Infinity;
  for (const r of barrio.rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) m = Math.min(m, _bpDistSegmento(x, y, r[j][0], r[j][1], r[i][0], r[i][1]));
  }
  return Math.round(m * idx.metrosPorUnidad);
}

// fila: { lat, lon, barrio, comuna } (números o textos con coma decimal).
// Devuelve { barrio, comuna, fuente: 'punto'|'nombre'|null, conflictoM: número|null, revisar: bool }.
function barrioPotDe(idx, fila) {
  const lat = typeof fila.lat === 'string' ? parseFloat(fila.lat.replace(',', '.')) : fila.lat;
  const lon = typeof fila.lon === 'string' ? parseFloat(fila.lon.replace(',', '.')) : fila.lon;
  const porNombre = barrioPotPorNombre(idx, fila.barrio, fila.comuna);
  const porPunto = barrioPotPorPunto(idx, lat, lon);
  if (porPunto) {
    let conflictoM = null;
    if (porNombre && porNombre.clave !== porPunto.clave) conflictoM = distanciaABarrioPotM(idx, lat, lon, porNombre);
    return { barrio: porPunto.n, comuna: porPunto.c, fuente: 'punto', conflictoM, revisar: conflictoM != null && conflictoM >= UMBRAL_REVISAR_BARRIO_M };
  }
  if (porNombre) return { barrio: porNombre.n, comuna: porNombre.c, fuente: 'nombre', conflictoM: null, revisar: false };
  return { barrio: '', comuna: '', fuente: null, conflictoM: null, revisar: false };
}

// ── Buscar (E5): caso preparado, filtros con facetas y orden «Más urgente» (2026-10-08) ──
// Lógica pura: la pantalla solo pinta. Sale de la maqueta aprobada (propuesta-buscar.html),
// que trabajaba con datos inventados; aquí cada «caso» se arma desde una fila real de
// BD VISITAS (por nombre de columna, nunca por índice).
//   prepararCasoBuscar(f, idxBarrios, hoy)   → caso con todo lo derivado, una sola vez por fila
//   filtrosBuscarVacios()                    → estado inicial (todos los estados, completadas incluidas)
//   filtrarBuscar(casos, S, excepto)         → casos que pasan; `excepto` deja fuera un grupo
//                                              (así cada faceta cuenta sus alternativas, no «0»)
//   conteoFacetaBuscar(casos, S, grupo, fn)  → Map(valor → cuántos verías si lo eliges)
//   ordenarCasosBuscar(lista, orden, q)      → 'urg' | 'rec' | 'rad' | 'dir' | 'mod'
var BUSCAR_ESTADOS = ['PENDIENTE', 'ASIGNADO', 'INICIADO', 'COMPLETADO', 'CERRADO'];
var BUSCAR_ESTADOS_VIVOS = ['PENDIENTE', 'ASIGNADO', 'INICIADO'];

// Estado de una fila tal como la agrupa Buscar (2026-10-15). La BD trae, sobre
// todo en radicados viejos, estados de V2 que no son ninguno de los cuatro
// (COMPLETADA, PQR PENDIENTE, DESCARGADA GESTION, PQR CADUCIDAD, OPERATIVO,
// NO APLICA, vacío…): antes no pasaban el filtro de estado y Buscar no los
// encontraba nunca. Las variantes se pliegan al estado de la app; lo cerrado
// por otra vía y lo que la columna A da por «NO COMPETENCIA» (más de 3 años
// sin completar) es 'CERRADO', «Cerradas sin visita»: se encuentra, pero no se
// gestiona.
var _PENDIENTE_BUSCAR = { 'PENDIENTE': 1, 'PENDIENTES': 1, 'PROGRAMADA': 1, 'PQR PENDIENTE': 1, 'PENDIENTE PQR': 1 };
function esNoCompetenciaFila(f) {
  return /NO\s+COMPETENCIA/.test(String((f && f['ATENCION PQR']) || '').toUpperCase());
}
function estadoBuscarDe(f) {
  var e = _normEstadoVisitaBD((f && (f['ESTADO VISITA'] || f[13])) || '');
  if (e === 'COMPLETADO' || e === 'COMPLETADA') return 'COMPLETADO';
  if (esNoCompetenciaFila(f)) return 'CERRADO';
  if (_PENDIENTE_BUSCAR[e]) return 'PENDIENTE';
  if (e === 'ASIGNADO' || e === 'ASIGNADA') return 'ASIGNADO';
  if (e === 'INICIADO' || e === 'INICIADA') return 'INICIADO';
  return 'CERRADO';
}
// Por qué una fila está «cerrada sin visita», en palabras de la BD.
function motivoCierreBuscar(f) {
  if (esNoCompetenciaFila(f)) return 'No competencia';
  var e = String((f && (f['ESTADO VISITA'] || f[13])) || '').trim();
  if (!e) return 'Sin estado';
  return e.charAt(0).toUpperCase() + e.slice(1).toLowerCase();
}
// Qué le falta a una visita ya hecha. Solo se exigen en visitas desde este año:
// antes la app no generaba entregables y todas las viejas saldrían «sin acta».
// ponytail: año fijo; sacarlo de la hoja de reglas si cambia la fecha de arranque.
var BUSCAR_FALTAS_DESDE_ANIO = 2026;
// Sin «informe»: la mayoría de las visitas no lo lleva (decisión del usuario
// 2026-10-13); se muestra solo cuando existe, nunca como faltante.
var BUSCAR_FALTAS = [
  ['acta', 'Sin acta'], ['rf', 'Sin registro fotográfico'],
  ['orden', 'Orden sin escanear'], ['vig', 'Vigilancia pendiente'], ['ubic', 'Ubicación sin confirmar'],
];

function _normBuscar(s) {
  var t = String(s == null ? '' : s).toUpperCase();
  if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return t.replace(/\s+/g, ' ').trim();
}
function _sinCerosBuscar(s) { return String(s).replace(/\d+/g, function (n) { return String(parseInt(n, 10)); }); }
function _colBuscar(f, nombre) { return String((f && f[nombre]) == null ? '' : f[nombre]).trim(); }

// Nivel de la prioridad de la PQR → texto de filtro. Mismos cortes de nivelPrioridad.
function prioridadClaveBuscar(prioN) {
  if (!isFinite(prioN)) return 'Sin análisis';
  var p = nivelPrioridad(prioN);
  return p ? (p.nivel === 'Mínima' ? 'Baja' : p.nivel) : 'Sin análisis';
}

function prepararCasoBuscar(f, idxBarrios, hoy) {
  var ref = hoy instanceof Date ? hoy : new Date();
  var refDia = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  var c = { id: f._idx, f: f };
  c.estado = estadoBuscarDe(f);
  c.motivoCierre = c.estado === 'CERRADO' ? motivoCierreBuscar(f) : '';

  // Radicado y tipo de caso
  c.rad = _colBuscar(f, 'RADICADO');
  c.nRad = _normBuscar(c.rad);
  // Expediente: la casilla de texto libre también lo encuentra (TASK 2).
  c.exp = expedienteDe(f);
  c.nExp = _normBuscar(c.exp);
  c.tipo = !esRadicadoDeCaso(c.rad) ? 'V2' : (/^OFICIO-/i.test(c.rad) ? 'OFICIO' : 'PQR');
  var principal = claveRadicado(c.rad);
  c.reit = radicadosReiterados(f).filter(function (r) { return r !== principal; });
  c.nReit = c.reit;   // ya vienen como claves comparables (mayúsculas)
  c.nvis = parseInt(f['N° VISITA'] || f['N VISITA'] || 1, 10) || 1;
  var prioN = parseInt(_colBuscar(f, 'PRIORIDAD'), 10);
  c.prioN = prioN;
  c.prio = prioridadClaveBuscar(prioN);

  // Lugar: el punto manda; sin punto, el nombre escrito (barrioPotDe, E5a)
  c.dir = _colBuscar(f, 'DIRECCION INFRACCION') || _colBuscar(f, 'DIRECCION');
  c.nDir = _normBuscar(c.dir);
  c.kDir = claveBusquedaDireccion(c.dir);
  c.barrioTxt = _colBuscar(f, 'BARRIO/VEREDA') || _colBuscar(f, 'BARRIO');
  c.nBarrio = _normBuscar(c.barrioTxt);
  c.rural = /^VDA\.?/i.test(c.barrioTxt);
  c.vereda = c.rural ? c.barrioTxt.replace(/^VDA\.?\s*/i, '').trim() : '';
  c.lat = normalizarCoord(f['LATITUD'], 'lat');
  c.lon = normalizarCoord(f['LONGITUD'], 'lon');
  c.pot = null; c.barrio = ''; c.comuna = c.rural ? '' : _colBuscar(f, 'COMUNA');
  if (idxBarrios && !c.rural) {
    c.pot = barrioPotDe(idxBarrios, { lat: c.lat, lon: c.lon, barrio: c.barrioTxt, comuna: c.comuna });
    c.barrio = c.pot.barrio;
    if (c.pot.fuente === 'punto' && c.pot.comuna) c.comuna = c.pot.comuna;   // decisión 2026-10-07
  }

  // Quién
  c.vis = String(visitadoresBD(f) || '').toUpperCase().split(/\s*[\/,]\s*/)
    .map(function (s) { return s.trim(); }).filter(Boolean);

  // Cuándo
  c.fRad = parsearFecha(f['FECHA RADICADO'] || '');
  c.fAsig = parsearFecha(f['FECHA ASIGNACION VISITA'] || '');
  c.fVis = parsearFecha(f['FECHA DE VISITA'] || '');
  c.fCierre = parsearFecha(f['FECHA DEVOLUCION'] || '');
  c.fCit = parsearFecha(f['FECHA CITACION'] || '');
  var t = Date.parse(f['ULTIMA_MODIFICACION'] || '');
  c.mod = isNaN(t) ? 0 : t;
  c.dCal = c.fRad ? Math.max(0, Math.round((refDia - new Date(c.fRad.getFullYear(), c.fRad.getMonth(), c.fRad.getDate())) / 86400000)) : 0;

  // Lo encontrado en la visita
  // Un chip del catálogo va entero y con su nombre vigente (el de A2 lleva
  // comas); el texto libre de V2 se parte como antes.
  c.infr = _colBuscar(f, 'TIPO DE INFRACCION').split('|').reduce(function (acc, s) {
    var v = nombreChipVigente(s);
    return acc.concat(_CONTRAVENCION_VALIDAS.has(v) ? [v] : v.split(/[·,;\n]+/));
  }, []).map(function (s) { return s.trim(); }).filter(Boolean);
  c.susp = _normBuscar(f['SUSPENSION DE LA OBRA']) === 'SI';
  c.orden = ordenPoliciaDe(f);
  c.nOrden = _normBuscar(c.orden);
  c.lic = _normBuscar(f['SE APORTO LICENCIA']);
  c.obra = _colBuscar(f, 'ESTADO OBRA');
  c.atiende = _colBuscar(f, 'NOMBRE PERSONA ATIENDE');
  c.nAtiende = _normBuscar(c.atiende);
  c.referencia = _colBuscar(f, 'REFERENCIA_DIRECCION');
  c.nRef = _normBuscar(c.referencia);

  // Qué falta (solo visitas iniciadas o completadas, desde BUSCAR_FALTAS_DESDE_ANIO)
  c.faltas = [];
  if ((c.estado === 'INICIADO' || c.estado === 'COMPLETADO') && c.fVis && c.fVis.getFullYear() >= BUSCAR_FALTAS_DESDE_ANIO) {
    if (!(f['LINK_PDF_ACTA'] || f['LINK_XLSX_ACTA'])) c.faltas.push('acta');
    if (!f['LINK_REGISTRO_FOTOS']) c.faltas.push('rf');
    if (c.orden && !f['LINK_ORDEN_POLICIA']) c.faltas.push('orden');
    if (c.susp && c.orden && !f['LINK_SOLICITUD_VIGILANCIA']) c.faltas.push('vig');
    if (!_colBuscar(f, 'UBICACION_CONFIRMADA')) c.faltas.push('ubic');
  }
  // «Lista para cerrar»: iniciada con acta, registro fotográfico y orden
  // escaneada (si hay orden). Misma cuenta de la cabecera del formulario y de
  // Mis visitas (entregablesFaltantes), sin el corte por año de c.faltas.
  c.faltanCierre = entregablesFaltantes(f);
  c.lista = c.estado === 'INICIADO' && c.faltanCierre.length === 0;

  // «Más urgente»: nivel y días pasados de su propio plazo.
  //   3 = PQR crítica/alta vencida, o visita asignada/iniciada con 5+ días hábiles
  //   2 = PQR media vencida, o visita asignada/iniciada dentro del umbral
  //   1 = PQR con plazo aún vigente · 0 = PQR sin plazo · -1 = completada
  // Misma regla de la Agenda: antes de 2025 el radicado no compite.
  c.tier = -1; c.exceso = null;
  if (c.estado === 'PENDIENTE') {
    var plazo = (c.fRad && c.fRad.getFullYear() < 2025) ? 0 : (c.prioN >= 9 ? 5 : c.prioN >= 7 ? 20 : c.prioN >= 5 ? 30 : 0);
    if (plazo) { c.exceso = c.dCal - plazo; c.tier = c.exceso > 0 ? (c.prioN >= 7 ? 3 : 2) : 1; }
    else { c.exceso = c.dCal; c.tier = 0; }
  } else if (c.estado === 'ASIGNADO' || c.estado === 'INICIADO') {
    var d = c.estado === 'ASIGNADO' ? diasSinIniciar(f, ref) : diasSinCompletar(f, ref);
    d = d == null ? 0 : d;
    c.exceso = (d - 5) * 1.4;           // ×1,4 ≈ hábiles a calendario
    c.tier = d >= 5 ? 3 : 2;
  }
  return c;
}

// Estado inicial: todos los estados (decisión del usuario 2026-10-15), pero
// con ningún chip marcado (2026-10-25): sin selección se ve todo y tocar un
// chip deja solo ese estado. Antes arrancaban los cinco marcados y para ver
// uno había que desmarcar los otros cuatro.
function filtrosBuscarVacios() {
  return {
    q: '', estados: [],
    comunas: [], barrios: [], veredas: [], rural: false, sinPot: false,
    campo: 'rad', desde: '', hasta: '',            // campo: rad | asig | vis | cierre | cit
    visitador: [], mias: false, yo: '', tipo: [], nvis: [], reit: false, prio: [],
    infr: [], susp: false, orden: false, lic: [], obra: [], falta: [], listas: false,
  };
}

// Marcar los cinco estados es lo mismo que no filtrar: se guarda vacío para que
// los chips no queden todos encendidos (selecciones guardadas antes de 2026-10-25).
function normEstadosBuscar(estados) {
  var e = (estados || []).filter(function (x) { return BUSCAR_ESTADOS.indexOf(x) !== -1; });
  return BUSCAR_ESTADOS.every(function (x) { return e.indexOf(x) !== -1; }) ? [] : e;
}

// ¿Qué parte de la fila coincide con el texto? '' si ninguna. Un radicado completo
// o un reiterado exacto sale siempre, sea cual sea su estado (ver esExactaBuscar).
function coincideBuscar(c, q) {
  var n = _normBuscar(q); if (!n) return '';
  if (c.nRad.indexOf(n) !== -1) return 'rad';
  // El expediente son dígitos: cualquier número suelto podría calzar, así que
  // se exige coincidencia por subcadena en el número normalizado, igual que
  // el radicado, pero solo si la fila tiene expediente.
  if (c.nExp && c.nExp.indexOf(n) !== -1) return 'exp';
  if (c.nDir.indexOf(n) !== -1) return 'dir';
  var k = claveBusquedaDireccion(n);
  if (k && k.length >= 3 && c.kDir.indexOf(k) !== -1) return 'dirk';
  if (c.nBarrio.indexOf(n) !== -1) return 'barrio';
  if (c.nOrden && (c.nOrden.indexOf(n) !== -1 || _sinCerosBuscar(c.nOrden).indexOf(_sinCerosBuscar(n)) !== -1)) return 'orden';
  if (c.nAtiende.indexOf(n) !== -1) return 'atiende';
  if (c.nRef && c.nRef.indexOf(n) !== -1) return 'ref';
  if (coincideReiterado(c.f, n)) return 'reit';
  return '';
}
function esExactaBuscar(c, q) {
  var n = _normBuscar(q); if (!n) return false;
  return c.nRad === n || c.nReit.indexOf(claveRadicado(n)) !== -1;
}

function _lugarBuscar(c, S) {
  if (!(S.comunas.length || S.barrios.length || S.veredas.length || S.rural || S.sinPot)) return true;
  if (c.rural) return S.rural || S.veredas.indexOf(_normBuscar(c.vereda)) !== -1;
  if (c.barrio && S.barrios.indexOf(c.barrio) !== -1) return true;
  if (!c.barrio && S.sinPot && (!S.comunas.length || S.comunas.indexOf(c.comuna) !== -1)) return true;
  // Comuna elegida: vale entera, salvo que se haya elegido algún barrio suyo (entonces acota).
  if (S.comunas.indexOf(c.comuna) !== -1) {
    return !S.barrios.some(function (b) { return _comunaDeBarrioBuscar(b) === c.comuna; });
  }
  return false;
}
// Comuna de un barrio del POT: se llena con registrarBarriosBuscar(barrios) al cargar barrios-mapa.json.
var _COMUNA_BARRIO_BUSCAR = {};
function registrarBarriosBuscar(barrios) {
  _COMUNA_BARRIO_BUSCAR = {};
  (barrios || []).forEach(function (b) { if (!_COMUNA_BARRIO_BUSCAR[b.n]) _COMUNA_BARRIO_BUSCAR[b.n] = String(b.c); });
}
function _comunaDeBarrioBuscar(n) { return _COMUNA_BARRIO_BUSCAR[n] || ''; }

var _CAMPO_FECHA_BUSCAR = { rad: 'fRad', asig: 'fAsig', vis: 'fVis', cierre: 'fCierre', cit: 'fCit' };
function _fechaISOaDate(s) {
  if (!s) return null;
  var p = String(s).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

// Un predicado por grupo de filtro. El orden de las claves es el de BUSCAR_GRUPOS.
var BUSCAR_PREDICADOS = {
  estado: function (c, S) { return !S.estados.length || S.estados.indexOf(c.estado) !== -1 || esExactaBuscar(c, S.q); },
  q: function (c, S) { return !S.q || !!coincideBuscar(c, S.q); },
  lugar: _lugarBuscar,
  fecha: function (c, S) {
    if (!S.desde && !S.hasta) return true;
    var d = c[_CAMPO_FECHA_BUSCAR[S.campo] || 'fRad']; if (!d) return false;
    var dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (S.desde && dia < _fechaISOaDate(S.desde)) return false;
    if (S.hasta && dia > _fechaISOaDate(S.hasta)) return false;
    return true;
  },
  visitador: function (c, S) { return !S.visitador.length || S.visitador.some(function (v) { return c.vis.indexOf(v) !== -1; }); },
  mias: function (c, S) { return !S.mias || !S.yo || c.vis.indexOf(S.yo) !== -1; },
  tipo: function (c, S) { return !S.tipo.length || S.tipo.indexOf(c.tipo) !== -1; },
  nvis: function (c, S) { return !S.nvis.length || S.nvis.indexOf(c.nvis > 1 ? 'seg' : 'pri') !== -1; },
  reit: function (c, S) { return !S.reit || c.reit.length > 0; },
  prio: function (c, S) { return !S.prio.length || S.prio.indexOf(c.prio) !== -1; },
  infr: function (c, S) { return !S.infr.length || S.infr.some(function (x) { return c.infr.indexOf(x) !== -1; }); },
  susp: function (c, S) { return !S.susp || c.susp; },
  orden: function (c, S) { return !S.orden || !!c.orden; },
  lic: function (c, S) { return !S.lic.length || S.lic.indexOf(c.lic) !== -1; },
  obra: function (c, S) { return !S.obra.length || S.obra.indexOf(c.obra) !== -1; },
  falta: function (c, S) { return !S.falta.length || S.falta.some(function (x) { return c.faltas.indexOf(x) !== -1; }); },
  listas: function (c, S) { return !S.listas || c.lista; },
};
var BUSCAR_GRUPOS = Object.keys(BUSCAR_PREDICADOS);

// `excepto`: un grupo (texto) o varios (arreglo) que se dejan fuera del cálculo.
function pasaBuscar(c, S, excepto) {
  var ex = excepto == null ? [] : (Array.isArray(excepto) ? excepto : [excepto]);
  for (var i = 0; i < BUSCAR_GRUPOS.length; i++) {
    var g = BUSCAR_GRUPOS[i];
    if (ex.indexOf(g) === -1 && !BUSCAR_PREDICADOS[g](c, S)) return false;
  }
  return true;
}
function filtrarBuscar(casos, S, excepto) {
  return (casos || []).filter(function (c) { return pasaBuscar(c, S, excepto); });
}
// Cuántos casos verías si eliges cada valor de una faceta, con todos los demás filtros puestos
// pero SIN el de esa faceta (convención de GitHub/Linear). `valoresDe(c)` → arreglo de valores.
function conteoFacetaBuscar(casos, S, grupo, valoresDe) {
  var m = new Map();
  filtrarBuscar(casos, S, grupo).forEach(function (c) {
    valoresDe(c).forEach(function (v) { m.set(v, (m.get(v) || 0) + 1); });
  });
  return m;
}
// Filtros puestos en cada bloque del panel (sin texto ni estado, que siempre están a la vista).
function activosBuscar(S) {
  var o = {
    donde: S.comunas.length + S.barrios.length + S.veredas.length + (S.rural ? 1 : 0) + (S.sinPot ? 1 : 0),
    cuando: (S.desde || S.hasta) ? 1 : 0,
    quien: S.visitador.length + (S.mias ? 1 : 0) + S.tipo.length + S.nvis.length + (S.reit ? 1 : 0) + S.prio.length,
    que: S.infr.length + (S.susp ? 1 : 0) + (S.orden ? 1 : 0) + S.lic.length + S.obra.length,
    falta: S.falta.length + (S.listas ? 1 : 0),
  };
  o.total = o.donde + o.cuando + o.quien + o.que + o.falta;
  return o;
}
// El inspector ve lo suyo, las pendientes y lo terminado (completadas y
// cerradas sin visita), como el historial que es.
function universoBuscar(casos, rol, nombre) {
  if (veTodasLasVisitas(rol)) return casos || [];
  var yo = String(nombre || '').toUpperCase().trim();
  return (casos || []).filter(function (c) {
    return c.estado === 'PENDIENTE' || c.estado === 'COMPLETADO' || c.estado === 'CERRADO' ||
      (!!yo && c.vis.indexOf(yo) !== -1);
  });
}

function _fechaDeEstadoBuscar(c) {
  var d = c.estado === 'COMPLETADO' ? (c.fCierre || c.fVis) : c.estado === 'INICIADO' ? c.fVis
    : c.estado === 'ASIGNADO' ? c.fAsig : c.fRad;
  return d ? d.getTime() : 0;
}
// «Más urgente» es la regla de la Agenda (tier/exceso, ver prepararCasoBuscar): una sola forma de decir
// qué se atiende primero. Las completadas, al final y por cierre; detrás, las cerradas sin visita, la
// radicada más reciente primero. Un radicado escrito completo, arriba.
function ordenarCasosBuscar(lista, orden, q) {
  var l = (lista || []).slice();
  var v2 = function (c) { return c.tipo === 'V2' ? 1 : 0; };
  var ts = function (d) { return d ? d.getTime() : 0; };
  switch (orden) {
    case 'rec': l.sort(function (a, b) { return _fechaDeEstadoBuscar(b) - _fechaDeEstadoBuscar(a); }); break;
    // Por fecha de radicado, no por el texto: «OFICIO-…» no queda antes que «2026…»; los V2 sin número, al final.
    case 'rad': l.sort(function (a, b) {
      return (v2(a) - v2(b)) || (ts(b.fRad) - ts(a.fRad)) || b.rad.localeCompare(a.rad, 'es', { numeric: true });
    }); break;
    case 'dir': l.sort(function (a, b) { return a.dir.localeCompare(b.dir, 'es', { numeric: true }); }); break;
    case 'mod': l.sort(function (a, b) { return b.mod - a.mod; }); break;
    default: l.sort(function (a, b) {
      var grupo = function (c) { return c.estado === 'CERRADO' ? 2 : c.estado === 'COMPLETADO' ? 1 : 0; };
      var ga = grupo(a), gb = grupo(b);
      if (ga !== gb) return ga - gb;
      if (ga === 2) return ts(b.fRad) - ts(a.fRad);
      if (ga === 1) return ts(b.fCierre || b.fVis) - ts(a.fCierre || a.fVis);
      return (b.tier - a.tier) || ((b.exceso || 0) - (a.exceso || 0));
    });
  }
  if (q) {
    var i = -1;
    for (var k = 0; k < l.length; k++) { if (esExactaBuscar(l[k], q)) { i = k; break; } }
    if (i > 0) l.unshift(l.splice(i, 1)[0]);
  }
  return l;
}

// ── Catálogo: Tipo de contravención (mudado de nueva-visita.jsx, E7) ──
// Los chips del formulario y el tablero (hallazgosTablero) leen el mismo
// catálogo: una sola definición para que lo marcado en pantalla, lo que va
// al acta/informe y lo que cuenta el tablero no puedan divergir.
const CONTRAVENCION_GRUPOS = [
  { literal: 'Literal A', opciones: [
    { val: 'A1: Áreas protegidas', l: 'A1: Áreas protegidas' },
    { val: 'A2: Distinto a la licencia (pisos, unidades, áreas)', l: 'A2: Distinto a la licencia (pisos, unidades, áreas)' },
    { val: 'A3: Bienes uso público (Antejardín)', l: 'A3: Bienes uso público (Antejardín)' },
    { val: 'A4: Sin licencia o caducada', l: 'A4: Sin licencia o caducada' },
  ]},
  { literal: 'Literal C', opciones: [
    { val: 'C9: Uso distinto al de la licencia', l: 'C9: Uso distinto al de la licencia' },
    { val: 'C10: Ubicación distinta a la licencia', l: 'C10: Ubicación distinta a la licencia' },
    { val: 'C11: Uso del suelo no permitido', l: 'C11: Uso del suelo no permitido' },
    { val: 'C12: Facilitar usos del suelo no autorizados', l: 'C12: Facilitar usos del suelo no autorizados' },
  ]},
  { literal: 'Literal D', opciones: [
    { val: 'D13: Materiales en vía', l: 'D13: Materiales en vía' },
    { val: 'D14: Sanitarios provisionales', l: 'D14: Sanitarios provisionales' },
    { val: 'D15: Protecciones seguridad', l: 'D15: Protecciones seguridad' },
    { val: 'D16: Llantas sucias', l: 'D16: Llantas sucias' },
    { val: 'D17: Residuos inmediatos', l: 'D17: Residuos inmediatos' },
    { val: 'D18: Retiro escombros', l: 'D18: Retiro escombros' },
    { val: 'D19: Seguridad personal', l: 'D19: Seguridad personal' },
    { val: 'D20: Emisión partículas', l: 'D20: Emisión partículas' },
    { val: 'D21: Contaminación agua', l: 'D21: Contaminación agua' },
    { val: 'D22: Reparar daños públicos', l: 'D22: Reparar daños públicos' },
    { val: 'D23: Reparar daños vecinos', l: 'D23: Reparar daños vecinos' },
    { val: 'D24: Horario restringido', l: 'D24: Horario restringido' },
  ]},
];
const CONTRAVENCION_ESPECIAL = 'No se evidencia infracción';
// 2026-10-27 (decisión del usuario): cuando en Verificación documental «¿Las
// obras requieren licencia?» = No se pudo determinar, no se puede afirmar que
// no hay infracción ni marcar A4. Excluyente con todo, como la anterior; solo
// se ofrece con esa respuesta (R17/R18 en reglasBloqueoActa). En el acta, F36
// lleva además el motivo (infraccionParaActa). Sin seguimiento aparte: basta
// lo que dice el acta.
const CONTRAVENCION_INDETERMINADA = 'No se pudo determinar';
const _CONTRAVENCION_EXCLUYENTES = [CONTRAVENCION_ESPECIAL, CONTRAVENCION_INDETERMINADA];

// Deja en TIPO DE INFRACCION solo lo que es un chip del catálogo. Filas
// migradas de V2 o editadas a mano traen textos como "#9,11 Y 12" que no se
// pintan como chip: el inspector no los ve, no los puede quitar, y aun así
// salían en el acta y el informe. Lo que llega a los documentos tiene que ser
// exactamente lo que está marcado en pantalla.
const _CONTRAVENCION_VALIDAS = new Set(
  CONTRAVENCION_GRUPOS.flatMap(g => g.opciones.map(o => o.val)).concat(_CONTRAVENCION_EXCLUYENTES)
);
// Nombres anteriores al 2026-10-29 (decisión del usuario, informe de
// 20231121436): «C12: Destinación no autorizada» se marcaba por las unidades
// de más, porque el formulario llama «destinaciones» a las unidades; C12 es
// de usos del suelo. Lo guardado con el nombre viejo se lee con el nuevo, que
// es el que sale en el acta. La huella de la revisión (_normChipsRevision) y
// la del informe siguen con el viejo: renombrar no vence lo ya revisado.
const _CONTRAVENCION_RENOMBRADAS = {
  'A2: Diferente a lo aprobado': 'A2: Distinto a la licencia (pisos, unidades, áreas)',
  'C9: Uso distinto licencia': 'C9: Uso distinto al de la licencia',
  'C10: Ubicación incorrecta': 'C10: Ubicación distinta a la licencia',
  'C11: Usos suelo prohibidos': 'C11: Uso del suelo no permitido',
  'C12: Destinación no autorizada': 'C12: Facilitar usos del suelo no autorizados',
};
const _CONTRAVENCION_NOMBRE_SELLADO = Object.keys(_CONTRAVENCION_RENOMBRADAS)
  .reduce((m, viejo) => { m[_CONTRAVENCION_RENOMBRADAS[viejo]] = viejo; return m; }, {});
function nombreChipVigente(s) {
  const t = String(s || '').trim();
  return _CONTRAVENCION_RENOMBRADAS[t] || t;
}
// Lista de chips (' | ') con el nombre con que se sellaron las huellas.
function chipsConNombreSellado(v) {
  return String(v || '').split(' | ')
    .map(s => { const t = s.trim(); return _CONTRAVENCION_NOMBRE_SELLADO[t] || t; }).join(' | ');
}
function _infraccionSoloCatalogo(v) {
  const chips = String(v || '').split(' | ').map(nombreChipVigente)
    .filter(s => _CONTRAVENCION_VALIDAS.has(s));
  // A1 primero (prioridad, ver alternarContravencion): filas guardadas antes.
  return chips.filter(s => /^A1:/.test(s)).concat(chips.filter(s => !/^A1:/.test(s))).join(' | ');
}

// Marca o desmarca `val` en la lista de chips y devuelve la lista nueva.
// «No se evidencia infracción» y «No se pudo determinar» desmarcan todo lo
// demás, y viceversa.
// A1 tiene prioridad (decisión del usuario 2026-10-21): va siempre primero,
// también en el acta y el informe, que toman el orden de aquí. A1 + A4 en
// un lote mixto se permite con justificación (R16, revisarTextoLocal); que
// A1 sea obligatorio cuando aplica lo exige R11 (reglasBloqueoActa).
function alternarContravencion(seleccionados, val) {
  const sel = (seleccionados || []).slice();
  if (_CONTRAVENCION_EXCLUYENTES.includes(val)) {
    return sel.includes(val) ? [] : [val];
  }
  const base = sel.filter(s => !_CONTRAVENCION_EXCLUYENTES.includes(s));
  if (base.includes(val)) return base.filter(s => s !== val);
  return /^A1:/.test(val) ? [val].concat(base) : base.concat(val);
}

// Texto de F36 del acta. «No se pudo determinar» suelto no dice qué: se le
// suma el motivo que el inspector escribió en Verificación documental
// (REQUIERE_LICENCIA_DETALLE). Solo en el acta; en BD queda el chip tal cual.
// `infraccion` ya pasado por _infraccionSoloCatalogo; `motivo` = texto libre.
function infraccionParaActa(infraccion, motivo) {
  const v = String(infraccion || '').trim();
  if (v !== CONTRAVENCION_INDETERMINADA) return v;
  const m = String(motivo || '').trim().replace(/[.\s]+$/, '');
  return 'No se pudo determinar si las obras requieren licencia' + (m ? ': ' + m : '') + '.';
}

// ── Tablero territorial (E7): lógica pura (2026-10-16) ────────
// Especificación: docs/ESPEC_E7_tablero.md §3-§4. La pantalla (tablero.jsx,
// parte 2) solo pinta; toda la regla vive aquí y se prueba en
// tests/tablero.test.js. Referencia de comportamiento: la maqueta
// herramientas/tablero/propuesta-tablero.html.
// Estados plegados a una letra (§3): PENDIENTE/PROGRAMADA → P, ASIGNADO → A,
// INICIADO → I, COMPLETADO → C, lo demás → X «Cerrada sin visita».
// estadoBuscarDe ya pliega las variantes de V2 (COMPLETADA, PQR PENDIENTE…)
// y NO COMPETENCIA, que de todos modos no llega en la lectura compacta.
var TB_ESTADO_LETRA = { PENDIENTE: 'P', ASIGNADO: 'A', INICIADO: 'I', COMPLETADO: 'C' };
function _tbVivo(est) { return est === 'P' || est === 'A' || est === 'I'; }

// Bitmask de entregables (§3, mismo orden que la maqueta): acta 1, RF 2,
// informe 4, orden escaneada 8, vigilancia 16, PDF de la PQR 32.
function _tbEnt(f) {
  var e = 0;
  if (f['LINK_PDF_ACTA'] || f['LINK_XLSX_ACTA']) e |= 1;
  if (f['LINK_REGISTRO_FOTOS']) e |= 2;
  if (f['LINK_DOCX_INFORME'] || f['LINK_INFORME_F43']) e |= 4;
  if (f['LINK_ORDEN_POLICIA']) e |= 8;
  if (f['LINK_SOLICITUD_VIGILANCIA'] || f['LINK_SOLICITUD_PDF']) e |= 16;
  if (linkPdfRadicado(f)) e |= 32;
  return e;
}

function _tbDiasEntre(desde, hasta) {
  if (!desde || !hasta) return null;
  return Math.round((new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate())
    - new Date(desde.getFullYear(), desde.getMonth(), desde.getDate())) / 86400000);
}

// Mediana de números (ignora null/vacío); null si no hay datos.
function _tbMediana(vals) {
  var v = (vals || []).filter(function (x) { return x != null; })
    .sort(function (a, b) { return a - b; });
  if (!v.length) return null;
  var m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

function _tbRef(hoy) {
  return hoy instanceof Date ? hoy : (parsearFecha(hoy) || new Date());
}

// Fila preparada (§3): todo lo derivado, una vez por versión de datos.
// Además de las columnas del spec lleva `f` (la fila cruda: la ficha de la
// visita y entregablesFaltantes la leen), `dir`, `rural`, `vereda` e
// `infTxt` (el texto bruto de TIPO DE INFRACCION, para separar en
// hallazgosTablero lo «sin dato» de lo que es texto libre de V2).
function prepararFilaTablero(f, idxBarrios, hoy) {
  var barrioTxt = String((f['BARRIO/VEREDA'] || f['BARRIO']) || '').trim();
  var rural = claveComunaAgenda(f['COMUNA']) === 'RURAL' || /^VDA\.?/i.test(barrioTxt);
  var com = rural ? '12' : claveComunaAgenda(f['COMUNA']);
  var lat = normalizarCoord(f['LATITUD'], 'lat');
  var lon = normalizarCoord(f['LONGITUD'], 'lon');
  var bar = '', fuenteBar = null, conflictoM = null;
  if (idxBarrios && !rural) {
    var pot = barrioPotDe(idxBarrios, { lat: lat, lon: lon, barrio: barrioTxt, comuna: com });
    bar = pot.barrio || '';
    fuenteBar = pot.fuente;
    conflictoM = pot.conflictoM;
    if (pot.fuente === 'punto' && pot.comuna) com = pot.comuna;   // decisión 2026-10-07
  }
  var est = TB_ESTADO_LETRA[estadoBuscarDe(f)] || 'X';
  var fr = parsearFecha(f['FECHA RADICADO'] || '');
  var fa = parsearFecha(f['FECHA ASIGNACION VISITA'] || '');
  var fv = parsearFecha(f['FECHA DE VISITA'] || '');
  var susp = String(f['SUSPENSION DE LA OBRA'] || '').trim().toUpperCase();
  var prio = parseInt(String(f['PRIORIDAD'] == null ? '' : f['PRIORIDAD']).trim(), 10);
  return {
    id: f._idx, f: f,
    rad: String(f['RADICADO'] || '').trim(),
    est: est,
    fr: fr, fa: fa, fv: fv,
    // La espera se cuenta desde el radicado, vivos y cerrados por otra vía;
    // un radicado futuro no espera negativo.
    edad: fr ? Math.max(0, _tbDiasEntre(fr, _tbRef(hoy))) : null,
    aVisita: (est === 'C' && fv && fr && fv >= fr) ? _tbDiasEntre(fr, fv) : null,
    com: com, bar: bar, fuenteBar: fuenteBar, conflictoM: conflictoM,
    rural: rural,
    vereda: rural ? barrioTxt.replace(/^VDA\.?\s*/i, '').trim() : '',
    dir: String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim(),
    lat: lat, lon: lon,
    ins: primerVisitador(visitadoresBD(f)),
    inf: _infraccionSoloCatalogo(f['TIPO DE INFRACCION']).split(' | ').filter(Boolean),
    infTxt: String(f['TIPO DE INFRACCION'] || '').trim(),
    susp: susp === 'SI' ? 'SI' : (susp === 'NO' ? 'NO' : ''),
    orden: ordenPoliciaDe(f),
    lic: String(f['SE APORTO LICENCIA'] || '').trim().toUpperCase(),
    obra: String(f['ESTADO OBRA'] || '').trim().toUpperCase(),
    prio: isNaN(prio) ? null : prio,
    ent: _tbEnt(f),
  };
}

// Aplica periodo (sobre `dim`: 'fr' radicado | 'fv' visita), comuna, barrio,
// inspector y estados. `sin` excluye esa dimensión — es lo que deja a cada
// vista/faceta mostrar sus alternativas (convención de la maqueta: quitar
// 'com' libera comuna Y barrio). `desde`/`hasta` del periodo viajan en ms
// (por el hash de la URL) o como Date. `hoy` inyectable para los periodos
// relativos ('90', 'anio').
function filtrarTablero(filas, S, sin, hoy) {
  var ex = sin == null ? [] : (Array.isArray(sin) ? sin : [sin]);
  var rg = null;
  if (ex.indexOf('per') === -1) {
    var ref = _tbRef(hoy);
    if (S.desde != null || S.hasta != null) rg = [S.desde, S.hasta];
    else if (S.per === '2025') rg = [new Date(2025, 0, 1).getTime(), +ref];
    else if (S.per === 'anio') rg = [new Date(ref.getFullYear(), 0, 1).getTime(), +ref];
    else if (S.per === '90') rg = [new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 90).getTime(), +ref];
  }
  return (filas || []).filter(function (f) {
    if (rg && ex.indexOf('per') === -1) {
      var d = S.dim === 'fv' ? f.fv : f.fr;
      if (!d) return false;
      if (rg[0] != null && d.getTime() < rg[0]) return false;
      if (rg[1] != null && d.getTime() > rg[1]) return false;
    }
    if (ex.indexOf('com') === -1) {
      if (S.com && f.com !== S.com) return false;
      if (S.bar != null && f.bar !== S.bar) return false;
    }
    if (ex.indexOf('ins') === -1 && S.ins && f.ins !== S.ins) return false;
    if (ex.indexOf('est') === -1 && S.est && S.est.length && S.est.indexOf(f.est) === -1) return false;
    return true;
  });
}

// Indicadores de la cabecera. Cada uno define su propio universo: quien llama
// pasa la base SIN filtro de estado (igual que la maqueta, `filtrar('est')`).
function kpisTablero(filas, hoy) {
  var base = filas || [];
  var vivos = base.filter(function (f) { return _tbVivo(f.est); });
  var sinAsignar = vivos.filter(function (f) { return f.est === 'P'; }).length;
  var viejos = vivos.filter(function (f) { return f.edad != null && f.edad > 30; });
  var comp = base.filter(function (f) { return f.aVisita != null; });
  var ref = _tbRef(hoy);
  // Serie de 12 meses: mediana radicado → visita por mes de FECHA DE VISITA.
  var serieMedVisita = [];
  for (var i = 11; i >= 0; i--) {
    var d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    serieMedVisita.push(_tbMediana(comp.filter(function (f) {
      return f.fv.getFullYear() === d.getFullYear() && f.fv.getMonth() === d.getMonth();
    }).map(function (f) { return f.aVisita; })));
  }
  var cs = base.filter(function (f) { return f.est === 'C' && f.fv; });
  var ant = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  var csAnt = cs.filter(function (f) {
    return f.fv.getFullYear() === ant.getFullYear() && f.fv.getMonth() === ant.getMonth();
  });
  // Suspensión SI + orden real (ordenPoliciaDe ya descarta 'N/A') + sin
  // oficio de vigilancia + visita iniciada o completada + radicado desde 2025.
  var sinVig = base.filter(function (f) {
    return f.susp === 'SI' && f.orden && !(f.ent & 16) && (f.est === 'I' || f.est === 'C') &&
      f.fr && f.fr >= new Date(2025, 0, 1);
  });
  return {
    vivos: vivos.length,
    sinAsignar: sinAsignar,
    mas30: viejos.length,
    medEspera: _tbMediana(viejos.map(function (f) { return f.edad; })),
    medVisita: _tbMediana(comp.map(function (f) { return f.aVisita; })),
    serieMedVisita: serieMedVisita,
    visitadasMes: cs.filter(function (f) {
      return f.fv.getFullYear() === ref.getFullYear() && f.fv.getMonth() === ref.getMonth();
    }).length,
    visitadasMesAntAFecha: csAnt.filter(function (f) { return f.fv.getDate() <= ref.getDate(); }).length,
    visitadasMesAnt: csAnt.length,
    ordenesSinVigilancia: sinVig.length,
  };
}

// Map(area → valor) para pintar el mapa. Métricas: 'vivos', 'mas30',
// 'medVisita'. En 'bar' quedan fuera las filas sin barrio POT («Sin barrio
// POT» vive en Calidad del dato).
function agregarPorArea(filas, area, metrica) {
  var g = new Map();
  (filas || []).forEach(function (f) {
    var k = area === 'bar' ? f.bar : f.com;
    if (!k) return;
    var o = g.get(k);
    if (!o) { o = { vivos: 0, mas30: 0, aVis: [] }; g.set(k, o); }
    if (_tbVivo(f.est)) {
      o.vivos++;
      if (f.edad != null && f.edad > 30) o.mas30++;
    }
    if (f.aVisita != null) o.aVis.push(f.aVisita);
  });
  var out = new Map();
  g.forEach(function (v, k) {
    out.set(k, metrica === 'mas30' ? v.mas30
      : metrica === 'medVisita' ? _tbMediana(v.aVis)
      : v.vivos);
  });
  return out;
}

// 5 tramos iguales sobre un máximo redondeado a paso entero (maqueta §escala).
// colorDe(v) → 0 = color neutro (sin dato o cero), 1..5 = tramo de la rampa.
function escalaMapa(valores) {
  var max = 1;
  (valores || []).forEach(function (v) { if (v != null && v > max) max = v; });
  var paso = max <= 5 ? 1 : Math.ceil(max / 5);
  return {
    cortes: [paso, 2 * paso, 3 * paso, 4 * paso],
    max: paso * 5,
    colorDe: function (v) {
      if (v == null || v === 0) return 0;
      return Math.min(5, Math.floor((v - 1) / paso) + 1);
    },
  };
}

// Barrios con más casos vivos: primero por los rezagados (+30 días), luego
// por vivos. «Sin barrio POT» no entra (vive en Calidad del dato); las
// veredas rurales sí, agrupadas por su nombre escrito (§3).
function rankingBarrios(filas, n) {
  var g = new Map();
  (filas || []).forEach(function (f) {
    if (!_tbVivo(f.est) || !f.bar) return;
    var o = g.get(f.bar);
    if (!o) { o = { nombre: f.bar, com: f.com, vivos: 0, mas30: 0 }; g.set(f.bar, o); }
    o.vivos++;
    if (f.edad != null && f.edad > 30) o.mas30++;
  });
  return Array.from(g.values())
    .sort(function (a, b) { return b.mas30 - a.mas30 || b.vivos - a.vivos; })
    .slice(0, n == null ? Infinity : n);
}

// Radicadas (por fr) y visitadas (C con fv) por mes, en un solo eje.
// `mes` es 'YYYY-MM'. Rango inclusivo desde/hasta (Date o texto).
function serieMensual(filas, desde, hasta) {
  var d0 = desde instanceof Date ? desde : parsearFecha(desde);
  var d1 = hasta instanceof Date ? hasta : parsearFecha(hasta);
  var out = [];
  if (!d0 || !d1) return out;
  var a = d0.getFullYear(), m = d0.getMonth();
  while (true) {
    var rad = 0, vis = 0;
    (filas || []).forEach(function (f) {
      if (f.fr && f.fr.getFullYear() === a && f.fr.getMonth() === m) rad++;
      if (f.est === 'C' && f.fv && f.fv.getFullYear() === a && f.fv.getMonth() === m) vis++;
    });
    out.push({ mes: a + '-' + String(m + 1).padStart(2, '0'), radicadas: rad, visitadas: vis });
    if (a === d1.getFullYear() && m === d1.getMonth()) break;
    m++; if (m > 11) { m = 0; a++; }
  }
  return out;
}

// Recorrido del caso: medianas de cada tramo con su n. En asignación → visita
// se excluye fa == fv: la tomaron sin asignar y el payload copió la fecha de
// visita (no es una asignación real). En radicado → asignación, fa < fr es
// dato sucio y no cuenta.
function recorridoTablero(filas) {
  var base = filas || [];
  var comp = base.filter(function (f) { return f.est === 'C'; });
  var radAsig = comp.filter(function (f) { return f.fa && f.fr && f.fa >= f.fr; });
  var asigVis = comp.filter(function (f) { return f.fa && f.fv && f.fv > f.fa; });
  var radVis = comp.filter(function (f) { return f.aVisita != null; });
  return {
    radAsig: { med: _tbMediana(radAsig.map(function (f) { return _tbDiasEntre(f.fr, f.fa); })), n: radAsig.length },
    asigVis: { med: _tbMediana(asigVis.map(function (f) { return _tbDiasEntre(f.fa, f.fv); })), n: asigVis.length },
    radVis: { med: _tbMediana(radVis.map(function (f) { return f.aVisita; })), n: radVis.length },
    detenidas: ['P', 'A', 'I'].map(function (est) {
      var fs = base.filter(function (f) { return f.est === est; });
      return { est: est, n: fs.length, medEdad: _tbMediana(fs.map(function (f) { return f.edad; })) };
    }),
  };
}

// Carga por inspector. NO es un ranking: orden por carga actual (enCurso =
// asignadas + iniciadas, como la maqueta), «Otros» siempre al final.
// `activos` = nombres de listarInspectoresActivos(): lo que no calce va a
// «Otros» (sin la lista, se agrupa solo por el nombre de la fila). Las
// iniciadas con entregablesFaltantes van en conFaltantes (filas preparadas,
// para el cajón de lista). Quien solo tiene pendientes no entra: no tiene
// carga ni visitas.
function equipoTablero(filas, activos) {
  var set = activos && activos.length
    ? new Set(activos.map(function (a) { return String(a).toUpperCase().trim(); })) : null;
  var g = new Map();
  (filas || []).forEach(function (f) {
    var k = f.ins && (!set || set.has(f.ins.toUpperCase())) ? f.ins : 'Otros';
    var o = g.get(k);
    if (!o) { o = { ins: k, enCurso: 0, visitadas: 0, aVis: [], conFaltantes: [] }; g.set(k, o); }
    if (f.est === 'A' || f.est === 'I') o.enCurso++;
    if (f.est === 'C') o.visitadas++;
    if (f.aVisita != null) o.aVis.push(f.aVisita);
    if (f.est === 'I' && entregablesFaltantes(f.f).length > 0) o.conFaltantes.push(f);
  });
  var out = [];
  g.forEach(function (o) {
    if (!o.enCurso && !o.visitadas) return;
    o.medVisita = _tbMediana(o.aVis);
    delete o.aVis;
    out.push(o);
  });
  out.sort(function (a, b) {
    var oa = a.ins === 'Otros', ob = b.ins === 'Otros';
    if (oa !== ob) return oa ? 1 : -1;
    return b.enCurso - a.enCurso || b.visitadas - a.visitadas;
  });
  return out;
}

// Qué se encuentra en las visitas iniciadas y completadas (universo de la
// maqueta). porTipo cuenta chips por literal (A1..A4), «No se evidencia
// infracción» como NO y el texto libre de V2 como X; sinDato es la celda
// vacía. Cada porcentaje lleva su n (el denominador: solo filas con dato).
function hallazgosTablero(filas) {
  var base = (filas || []).filter(function (f) { return f.est === 'I' || f.est === 'C'; });
  var porTipo = { A1: 0, A2: 0, A3: 0, A4: 0, NO: 0, X: 0 };
  var sinDato = 0;
  base.forEach(function (f) {
    if (!f.infTxt) { sinDato++; return; }
    if (!f.inf.length) { porTipo.X++; return; }        // texto libre de V2
    f.inf.forEach(function (chip) {
      var m = /^(A[1-4]):/.exec(chip);
      if (m) porTipo[m[1]]++;
      else if (chip === CONTRAVENCION_ESPECIAL) porTipo.NO++;
      else porTipo.X++;
    });
  });
  var pct = function (num, den) { return den ? Math.round(100 * num / den) : null; };
  var num = function (pred) { return base.filter(pred).length; };
  return {
    porTipo: porTipo,
    sinDato: sinDato,
    pctSusp: { pct: pct(num(function (f) { return f.susp === 'SI'; }), num(function (f) { return f.susp; })), n: num(function (f) { return f.susp; }) },
    pctLic: { pct: pct(num(function (f) { return f.lic === 'SI'; }), num(function (f) { return f.lic; })), n: num(function (f) { return f.lic; }) },
    pctObraProceso: { pct: pct(num(function (f) { return f.obra.indexOf('PROCESO') !== -1; }), num(function (f) { return f.obra; })), n: num(function (f) { return f.obra; }) },
  };
}

// Calidad del dato (§4): vivos sin coordenadas · vivos sin barrio POT · vivos
// sin comuna · punto a ≥ 1 km del barrio escrito · vivos desde 2025 sin PDF
// de la PQR · completadas sin inspector · completadas sin fecha de visita.
// «Sin barrio POT» no cuenta a las rurales: la vereda no tiene barrio POT.
function calidadTablero(filas) {
  var base = filas || [];
  var viv = base.filter(function (f) { return _tbVivo(f.est); });
  return [
    { id: 'sinCoord', titulo: 'Vivos sin coordenadas',
      filas: viv.filter(function (f) { return f.lat == null || f.lon == null; }) },
    { id: 'sinBarrio', titulo: 'Vivos sin barrio POT',
      filas: viv.filter(function (f) { return !f.bar && !f.rural; }) },
    { id: 'sinComuna', titulo: 'Vivos sin comuna',
      filas: viv.filter(function (f) { return !f.com; }) },
    { id: 'conflicto', titulo: 'Punto a más de 1 km del barrio escrito',
      filas: base.filter(function (f) { return f.conflictoM != null && f.conflictoM >= UMBRAL_REVISAR_BARRIO_M; }) },
    { id: 'sinPdfPqr', titulo: 'Vivos desde 2025 sin PDF de la PQR',
      filas: viv.filter(function (f) {
        return f.fr && f.fr >= new Date(2025, 0, 1) && !(f.ent & 32) && /^\d{11}$/.test(f.rad);
      }) },
    { id: 'sinInspector', titulo: 'Completadas sin inspector',
      filas: base.filter(function (f) { return f.est === 'C' && !f.ins; }) },
    { id: 'sinFechaVisita', titulo: 'Completadas sin fecha de visita',
      filas: base.filter(function (f) { return f.est === 'C' && !f.fv; }) },
  ];
}

// Ficha de un área (comuna o barrio) para el panel del tablero: total y
// conteo por estado (la barra apilada), vivos con su espera mediana,
// mediana radicado → visita y casos vivos por inspector (ordenados por
// carga viva, que no es un ranking de competencia).
function fichaAreaTablero(filas) {
  var base = filas || [];
  var porEst = { P: 0, A: 0, I: 0, C: 0, X: 0 };
  base.forEach(function (f) { porEst[f.est]++; });
  var vivos = base.filter(function (f) { return _tbVivo(f.est); });
  var ins = new Map();
  vivos.forEach(function (f) { if (f.ins) ins.set(f.ins, (ins.get(f.ins) || 0) + 1); });
  return {
    n: base.length,
    porEst: porEst,
    vivos: vivos.length,
    medEspera: _tbMediana(vivos.map(function (f) { return f.edad; })),
    medVisita: _tbMediana(base.filter(function (f) { return f.aVisita != null; }).map(function (f) { return f.aVisita; })),
    porInspector: Array.from(ins, function (par) { return { ins: par[0], vivos: par[1] }; })
      .sort(function (a, b) { return b.vivos - a.vivos; }),
  };
}

// ── Administración: Bandeja · Equipo · Actividad (2026-10-03) ──
// La pantalla de admin pinta; la regla vive aquí y se prueba en
// tests/admin-equipo.test.js.

// Fecha + hora a Date, o null si no es parseable. Acepta un Date, un ISO
// (2026-10-02T19:40:00.000Z, los timestamps del backend), «dd/MM/yyyy HH:mm»
// (lo que escribe el backend en LOG_AUDITORIA) y «d/M/yyyy, h:mm:ss a. m.»
// (toLocaleString('es-CO', America/Bogota), ver registrarLog en api.js).
// dd/MM/yyyy se lee como día/mes a mano, nunca con new Date(texto): con día
// ≤ 12 voltea día y mes sin avisar.
function parsearFechaHora(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  var s = String(valor).trim();
  if (!s) return null;
  // ISO: lo resuelve Date nativo (en UTC, que es lo que el timestamp es).
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    var dz = new Date(s);
    return isNaN(dz.getTime()) ? null : dz;
  }
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[^\d]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return null;
  var d = +m[1], mo = +m[2], y = +m[3];
  var h = m[4] == null ? 0 : +m[4], mi = m[5] == null ? 0 : +m[5], se = m[6] == null ? 0 : +m[6];
  // sufijo a. m. / p. m. del formato del cliente (12 → 0 / 12 p. m. → 12).
  var ap = /[ap]\.?\s*m/i.exec(s.slice(m[0].length));
  if (m[4] != null && ap) {
    h = h % 12;
    if (ap[0].charAt(0).toLowerCase() === 'p') h += 12;
  }
  var dt = new Date(y, mo - 1, d, h, mi, se);
  // Igual que parsearFecha: si new Date normalizó un desborde (32/13), la
  // fecha no era real.
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d ||
      dt.getHours() !== h || dt.getMinutes() !== mi) return null;
  return dt;
}

// Umbral de demora de Administración. Es el mismo que las alertas de Inicio
// (DIAS_ALERTA_DEMORA en home.jsx): una visita no puede estar «en rojo» aquí
// y no alertar allá. Constante propia para que el archivo no importe entero.
var DIAS_DEMORA_ADMIN = 5;

// Carga de trabajo de una persona para la pestaña Equipo. Parte de
// agruparMisVisitas (regla del diligenciador + visibilidad por fecha de
// asignación) y agrega lo que la tarjeta y el panel necesitan:
//   hacer / curso        totales abiertos de hoy
//   demoradas            abiertas con dias >= DIAS_DEMORA_ADMIN (y por grupo)
//   futuras              ASIGNADO suyas que asignadaVisibleHoy aún no muestra;
//                        solo avisan al desactivar a la persona
//   completadasMes(_Anterior)  por FECHA DE VISITA contra el mes de `hoy`
//   masDemoradas         hasta 5 abiertas, la más demorada primero
function cargaUsuario(filas, nombre, hoy) {
  var g = agruparMisVisitas(filas, nombre, hoy);
  var ref = hoy instanceof Date ? hoy : (parsearFecha(hoy) || new Date());
  var esDemorada = function (x) { return x.dias != null && x.dias >= DIAS_DEMORA_ADMIN; };
  var demoradasHacer = g.hacer.filter(esDemorada).length;
  var demoradasCurso = g.curso.filter(esDemorada).length;
  var n = String(nombre || '').trim().toUpperCase();
  var futuras = 0;
  if (n) (filas || []).forEach(function (f) {
    if (!f) return;
    if (_normEstadoVisitaBD(f['ESTADO VISITA'] || f[13] || '') !== 'ASIGNADO') return;
    if (_esVisitaDe(f, nombre) && !asignadaVisibleHoy(f, ref)) futuras++;
  });
  // Meses como un número continuo: enero → diciembre del año anterior sale
  // solo con restar 1.
  var mesHoy = ref.getFullYear() * 12 + ref.getMonth();
  var completadasMes = 0, completadasMesAnterior = 0;
  g.hechas.forEach(function (h) {
    if (!h.fecha) return;
    var k = h.fecha.getFullYear() * 12 + h.fecha.getMonth();
    if (k === mesHoy) completadasMes++;
    else if (k === mesHoy - 1) completadasMesAnterior++;
  });
  var abiertas = g.hacer.map(function (x) { return { f: x.f, dias: x.dias, tipo: 'hacer' }; })
    .concat(g.curso.map(function (x) { return { f: x.f, dias: x.dias, tipo: 'curso' }; }));
  abiertas.sort(function (a, b) {
    return (b.dias == null ? -1 : b.dias) - (a.dias == null ? -1 : a.dias);
  });
  return {
    hacer: g.hacer.length,
    curso: g.curso.length,
    demoradas: demoradasHacer + demoradasCurso,
    demoradasHacer: demoradasHacer,
    demoradasCurso: demoradasCurso,
    futuras: futuras,
    completadasMes: completadasMes,
    completadasMesAnterior: completadasMesAnterior,
    masDemoradas: abiertas.slice(0, 5),
  };
}

// Última actividad conocida de una persona: el máximo entre la última visita
// que guardó (ULTIMA_MODIFICACION por ULTIMA_MODIFICACION_POR) y su última
// fila del log. null si no hay ninguna de las dos.
function ultimaActividad(filas, log, nombre) {
  var n = String(nombre || '').trim().toUpperCase();
  if (!n) return null;
  var max = null;
  var mirar = function (d) {
    if (d && (!max || d.getTime() > max.getTime())) max = d;
  };
  (filas || []).forEach(function (f) {
    if (!f) return;
    if (String(f['ULTIMA_MODIFICACION_POR'] || '').trim().toUpperCase() !== n) return;
    mirar(parsearFechaHora(f['ULTIMA_MODIFICACION']));
  });
  (log || []).forEach(function (f, i) {
    if (!i || !f) return; // la fila 0 es el encabezado [FECHA, USUARIO, ACCION]
    if (String(f[1] || '').trim().toUpperCase() !== n) return;
    mirar(parsearFechaHora(f[0]));
  });
  return max;
}

// Categoría de una fila del log para el filtro de Actividad. Se evalúa en
// este orden: lo que es seguridad nunca se pierde en «visitas» aunque la
// acción mencione un radicado.
function categoriaLog(usuario, accion) {
  var a = String(accion || '').toLowerCase();
  if (a.indexOf('bloqueado') !== -1) return 'seguridad';
  if (String(usuario || '').trim().toUpperCase() === 'SISTEMA') return 'sistema';
  if (/^login|^logout/.test(a) || a.indexOf('pin reseteado') !== -1) return 'accesos';
  if (a.indexOf('visita') !== -1 || a.indexOf('reiterado') !== -1 || a.indexOf('radicado') !== -1) return 'visitas';
  return 'otros';
}

// Texto del log para la pantalla: { texto, detalle }. El log guarda frases
// internas («Login V6», «Visita fila 1614: ESTADO ASIGNADO → INICIADO»); aquí
// se dicen como hechos. El número de fila NO identifica la visita (borrar una
// fila corre las de abajo), así que nunca se traduce a un radicado: si el
// registro trae el radicado (backend @136 en adelante) se muestra ese; si no,
// la fila queda como dato de la época. Lo que no se reconoce va tal cual.
var _ESTADO_LOG = { PENDIENTE: 'pendiente', PENDIENTES: 'pendiente', ASIGNADO: 'asignada',
  INICIADO: 'iniciada', COMPLETADO: 'completada', COMPLETADA: 'completada', REITERADO: 'reiterado' };
// Desde 2026-10-27 (revisión de arquitectura, punto 8) cubre todas las clases
// de mensaje que escribe el backend (registrarLog en apps_script_unificado.js)
// y devuelve además `tipo`: 'visita' (lo que la persona hizo con una visita o
// su cita: lo único que muestra el panel de cada persona), 'gestion', 'acceso',
// 'seguridad' (lo que el sistema evitó) o 'sistema' (automático y
// mantenimiento). Si el backend agrega un mensaje nuevo, sale tal cual.
function describirLog(accion) {
  var r = _describirLogBase(String(accion || '').trim());
  if (!r.tipo) r.tipo = 'otro';
  return r;
}
var _MANT_LOG = { normalizarDireccionesBD: 'direcciones normalizadas', repararCoordenadasBD: 'coordenadas reparadas',
  emparejarReiterados: 'reiterados emparejados', regenerarPdfsActas: 'PDF de actas regenerados' };
function _describirLogBase(a) {
  var x;
  if (/^login v\d+$/i.test(a)) return { texto: 'Inició sesión', detalle: '', tipo: 'acceso' };
  if (/^logout v\d+$/i.test(a)) return { texto: 'Cerró sesión', detalle: '', tipo: 'acceso' };
  if (/^(Eligió su PIN|Cambió su PIN)/.test(a)) return { texto: 'Cambió su PIN', detalle: '', tipo: 'acceso' };
  // Lo que el sistema evitó (seguridad). Siempre se nombra el caso esperado.
  if ((x = a.match(/^Guardado BLOQUEADO: fila \d+ tiene el radicado (.+?), el formulario esperaba (.+)$/)))
    return { texto: 'Se evitó guardar en el caso equivocado', detalle: 'Radicado ' + x[2] + ' (la fila ya tenía ' + x[1] + ')', tipo: 'seguridad' };
  // Formato viejo del mismo bloqueo (filas antiguas de LOG_AUDITORIA).
  if ((x = a.match(/^Guardado BLOQUEADO: fila \d+ tiene el radicado (\S+) y llegó (\S+)/)))
    return { texto: 'Se evitó guardar en el caso equivocado', detalle: 'Radicado ' + x[2] + ' (la fila ya tenía ' + x[1] + ')', tipo: 'seguridad' };
  if ((x = a.match(/^Reintento offline BLOQUEADO: la fila \d+ ya no es del radicado (.+?) y/)))
    return { texto: 'Se evitó repetir un guardado sin señal en el caso equivocado', detalle: 'Radicado ' + x[1], tipo: 'seguridad' };
  if ((x = a.match(/^DUPLICADO bloqueado: radicado (\S+) \(visita N°(\d+)\)/)))
    return { texto: 'Se evitó duplicar una visita', detalle: 'Radicado ' + x[1] + ' · visita N° ' + x[2], tipo: 'seguridad' };
  if ((x = a.match(/^\w+ BLOQUEADO: fila \d+ tiene el radicado (.+?), se esperaba (.+)$/)))
    return { texto: 'Se evitó escribir en el caso equivocado', detalle: 'Radicado ' + x[2] + ' (la fila ya tenía ' + x[1] + ')', tipo: 'seguridad' };
  if (/^\w+ BLOQUEADO: no existe la visita/.test(a))
    return { texto: 'Se evitó escribir en una visita que ya no existe', detalle: '', tipo: 'seguridad' };
  if ((x = a.match(/^\w+: la visita \S+ pasó de la fila (\d+) a la (\d+)/)))
    return { texto: 'Encontró la visita en su fila nueva y escribió ahí', detalle: 'Fila ' + x[1] + ' → ' + x[2], tipo: 'sistema' };
  // Visitas.
  if ((x = a.match(/^Visita reescrita por reintento offline — fila (\d+)(?: \(radicado ([^)]+)\))?$/)))
    return { texto: 'Guardó una visita hecha sin señal', detalle: x[2] ? 'Radicado ' + x[2] : 'Fila ' + x[1] + ' de la hoja', tipo: 'visita' };
  if ((x = a.match(/^Revisión del texto cerrada con justificación — fila (\d+)(?: \(radicado ([^)]+)\))?: ([\s\S]*)$/)))
    return { texto: 'Cerró la revisión del texto con justificación', detalle: (x[2] ? 'Radicado ' + x[2] : 'Fila ' + x[1] + ' de la hoja') + ' · ' + x[3], tipo: 'visita' };
  if ((x = a.match(/^Reiterado AGREGADO: (\S+) (?:\(radicado el [^)]+\) al caso|en) (\S+)/)))
    return { texto: 'Agregó un reiterado', detalle: 'Radicado ' + x[2] + ' · reiterado ' + x[1], tipo: 'visita' };
  if ((x = a.match(/^Reiterado QUITADO: (\S+) del caso (\S+)/)))
    return { texto: 'Quitó un reiterado', detalle: 'Radicado ' + x[2] + ' · reiterado ' + x[1], tipo: 'visita' };
  if ((x = a.match(/^Cupo RESERVADO \S+ \((.+)\) para el (radicado|orden) (.+)$/)))
    return { texto: 'Pidió una cita', detalle: (x[2] === 'radicado' ? 'Radicado ' : 'Orden ') + x[3] + ' · ' + x[1], tipo: 'visita' };
  if ((x = a.match(/^Cupo LIBERADO \S+ \((.+?)\)(?: del (radicado|orden) (\S+))?(?: · motivo: ([\s\S]+))?$/)))
    return { texto: 'Liberó una cita', detalle: [x[2] ? (x[2] === 'radicado' ? 'Radicado ' : 'Orden ') + x[3] : '', x[1], x[4] ? 'motivo: ' + x[4] : ''].filter(Boolean).join(' · '), tipo: 'visita' };
  // Gestión.
  if ((x = a.match(/^Usuario (ACTIVADO|DESACTIVADO): (.+)$/)))
    return { texto: (x[1] === 'ACTIVADO' ? 'Activó a ' : 'Desactivó a ') + titleCaseNombre(x[2]), detalle: '', tipo: 'gestion' };
  if ((x = a.match(/^PIN temporal generado para: (.+)$/)))
    return { texto: 'Generó un PIN temporal para ' + titleCaseNombre(x[1]), detalle: '', tipo: 'gestion' };
  if ((x = a.match(/^Rol de (.+?): (.+?) → (.+)$/)))
    return { texto: 'Cambió el rol de ' + titleCaseNombre(x[1]), detalle: x[2].toLowerCase() + ' → ' + x[3].toLowerCase(), tipo: 'gestion' };
  if ((x = a.match(/^Hallazgo pendiente del radicado (\S+) marcado (.+)$/)))
    return { texto: 'Revisó un hallazgo para el catálogo', detalle: 'Radicado ' + x[1] + ' · ' + x[2].toLowerCase(), tipo: 'gestion' };
  if ((x = a.match(/^Orden del día (\S+): (\d+) visitas/)))
    return { texto: 'Ordenó las visitas del ' + x[1], detalle: x[2] + ' visitas', tipo: 'gestion' };
  if ((x = a.match(/^CONFIG_AGENDA actualizada: (\d+) visitas por inspector/)))
    return { texto: 'Cambió las reglas de la agenda', detalle: x[1] + ' visitas por inspector', tipo: 'gestion' };
  if (/^CONFIG_AGENDA actualizada/.test(a))   // formato viejo (jornadas)
    return { texto: 'Cambió las reglas de la agenda', detalle: '', tipo: 'gestion' };
  if ((x = a.match(/^PIN reseteado para: (.+)$/)))   // antes del PIN temporal (2026-10-04)
    return { texto: 'Reseteó el PIN de ' + titleCaseNombre(x[1]), detalle: '', tipo: 'gestion' };
  if ((x = a.match(/^Agenda confirmada: ([\s\S]*)$/)))
    return { texto: 'Confirmó la agenda', detalle: x[1], tipo: 'gestion' };
  if ((x = a.match(/^EXPORTAR Buscar: (\d+) filas/)))
    return { texto: 'Exportó ' + x[1] + ' casos de Buscar a Excel', detalle: /DATOS PERSONALES/.test(a) ? 'con datos personales' : '', tipo: 'gestion' };
  if ((x = a.match(/^Novedad agenda DESACTIVADA: (.+?) \(/)))
    return { texto: 'Quitó días sin audiencias de ' + titleCaseNombre(x[1]), detalle: '', tipo: 'gestion' };
  if ((x = a.match(/^Novedad agenda: (.+?) · (.+?) a (.+?) · /)))
    return { texto: 'Marcó días sin audiencias de ' + titleCaseNombre(x[1]), detalle: x[2] + ' a ' + x[3], tipo: 'gestion' };
  // Automático y mantenimiento.
  if (/^Cupos APARTADOS para reservar sin señal: /.test(a))
    return { texto: 'Apartó cupos para pedir citas sin señal', detalle: '', tipo: 'sistema' };
  if ((x = a.match(/^Forms → Radicado: (\S+) \| .*? \| (.*)$/)))
    return { texto: 'Entró una PQR por el formulario', detalle: 'Radicado ' + x[1] + ' · ' + x[2], tipo: 'sistema' };
  if ((x = a.match(/^PDF radicado (\S+) copiado/)))
    return { texto: 'Copió el PDF de la PQR a la carpeta de la visita', detalle: 'Radicado ' + x[1], tipo: 'sistema' };
  if ((x = a.match(/^Error copiando PDF radicado (\S+): ([\s\S]*)$/)))
    return { texto: 'No se pudo copiar el PDF de la PQR', detalle: 'Radicado ' + x[1] + ' · ' + x[2], tipo: 'sistema' };
  if ((x = a.match(/^DUPLICADO ignorado: (\S+)/)))
    return { texto: 'Se ignoró una PQR repetida', detalle: 'Radicado ' + x[1], tipo: 'sistema' };
  if (/^onFormSubmit ABORTADO/.test(a))
    return { texto: 'No se pudo registrar una PQR del formulario', detalle: 'cambiaron las columnas de la hoja', tipo: 'sistema' };
  if ((x = a.match(/^(\w+): ([\s\S]*)$/)) && _MANT_LOG[x[1]])
    return { texto: 'Mantenimiento: ' + _MANT_LOG[x[1]], detalle: x[2], tipo: 'sistema' };
  if (/^ID_VISITA: /.test(a))
    return { texto: 'Mantenimiento: identificadores de visita', detalle: a.replace(/^ID_VISITA: /, ''), tipo: 'sistema' };
  if (/^\[SYNC_SITUACION\]/.test(a))
    return { texto: 'Mantenimiento: situación encontrada sincronizada', detalle: a.replace(/^\[SYNC_SITUACION\]\s*/, ''), tipo: 'sistema' };
  var est = function (e) {
    var k = String(e || '').trim().toUpperCase();
    return _ESTADO_LOG[k] || String(e || '').trim().toLowerCase();
  };
  var cual = function (fila, rad) { return rad ? 'Radicado ' + rad : 'Fila ' + fila + ' de la hoja'; };
  var m = a.match(/^Visita fila (\d+)(?: \(radicado ([^)]+)\))?: (.*)$/);
  if (m) {
    var resto = m[3];
    var e = resto.match(/^ESTADO (?:(.+?) )?→ (.+)$/);
    if (e) {
      var nuevo = String(e[2]).trim().toUpperCase();
      var texto = nuevo === 'INICIADO' ? 'Inició una visita'
        : (nuevo === 'COMPLETADO' || nuevo === 'COMPLETADA') ? 'Completó una visita'
        : 'Visita pasó a ' + est(nuevo);
      var paso = e[1] && e[1] !== '(vacío)' ? ' · ' + est(e[1]) + ' → ' + est(nuevo) : '';
      return { texto: texto, detalle: cual(m[1], m[2]) + paso, tipo: 'visita' };
    }
    var r = resto.match(/^(?:REASIGNADA de (.+?)|ASIGNADA) → (.+?)(?: \(estado .*\))?$/);
    if (r) {
      return {
        texto: r[1] ? 'Reasignó una visita de ' + titleCaseNombre(r[1]) + ' a ' + titleCaseNombre(r[2])
                    : 'Asignó una visita a ' + titleCaseNombre(r[2]),
        detalle: cual(m[1], m[2]), tipo: 'visita',
      };
    }
    if (/^ASIGNADA$/i.test(resto.trim()))   // formato viejo, sin «→ inspector»
      return { texto: 'Asignó una visita', detalle: cual(m[1], m[2]), tipo: 'visita' };
    return { texto: 'Visita: ' + resto, detalle: cual(m[1], m[2]), tipo: 'visita' };
  }
  var c = a.match(/^Visita creada — fila (\d+)(?: \(radicado ([^)]+)\))?$/);
  if (c) return { texto: 'Creó una visita', detalle: cual(c[1], c[2]), tipo: 'visita' };
  return { texto: a, detalle: '' };
}

// PINes que se rechazan al elegir el propio: los mismos que PINES_DEBILES del
// backend (cambiarMiPin), que vuelve a validar. Esto solo ahorra el viaje.
var PINES_DEBILES = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777',
  '8888', '9999', '1234', '4321', '0123', '1212', '2580', '1010'];

// '' si el PIN nuevo vale; si no, el texto del error para mostrar tal cual.
// pinActual solo llega al cambiarlo por voluntad (con uno temporal no se pide).
function validarPinNuevo(pin, pin2, pinActual) {
  var p = String(pin || '');
  if (!/^\d{4}$/.test(p)) return 'El PIN debe tener 4 dígitos.';
  if (p !== String(pin2 || '')) return 'Los dos PIN no coinciden.';
  if (pinActual && p === String(pinActual)) return 'El PIN nuevo debe ser distinto del actual.';
  if (PINES_DEBILES.indexOf(p) !== -1) return 'Ese PIN es muy fácil de adivinar. Elige otro.';
  return '';
}

// ── Ficha de la visita (E2) — qué secciones y campos mostrar ──
// Lógica pura que sustituye la lista fija de campos de VisitaDetailUI:
// devuelve QUÉ mostrar y la vista (FichaVisita, otro TASK) solo pinta.
//
//   seccionesFicha(f, rol) → [{ n, clave, titulo, campos, sinDato, resumen }]
//
//   n        número de la sección del formulario; se conserva aunque una
//            vecina quede reducida u omitida
//   clave    slug estable para la vista y los estilos
//   campos   [{ l, v, ancho?, largo? }] — solo los que aplican y tienen dato
//   sinDato  etiquetas de los que aplican y están vacíos («Sin dato: …» al
//            pie de la sección; sin filas de «—»)
//   resumen  solo en «sin visita» (FECHA DE VISITA vacía y PENDIENTE/ASIGNADO):
//            las secciones 3, 4, 5, 6, 7 y 9 se reducen a una línea
//
// Reglas (PLAN_2026-10-05 § E2): lo que está en la cabecera fija no se
// repite abajo; lo que no aplica no se menciona; lectura por nombre de
// columna, nunca por índice (los índices numéricos van de últimos, igual
// que en el _g del modal, como último recurso para encabezados variantes).

function _gFicha(f) {
  for (var i = 1; i < arguments.length; i++) {
    var k = arguments[i];
    if (f && f[k] != null && f[k] !== '') return f[k];
  }
  return '';
}

function _siNoFicha(v) {
  if (v == null || v === '') return '';
  var s = String(v).toUpperCase().trim();
  if (s === 'SI' || s === 'SÍ') return 'Sí';
  if (s === 'NO') return 'No';
  return String(v);
}

function seccionesFicha(f, rol) {
  if (!f) return [];

  // Separar actuación y conclusiones (van juntas en BD col AU, con el
  // mismo marcador que separa VisitaDetailUI).
  var partes = String(_gFicha(f, 'ACTUACION / OBSERVACIONES', 'ACTUACION', 46) || '')
    .split('\n══CONCLUSIONES══\n');
  var actuacion = (partes[0] || '').trim();
  var obsConclusion = (partes[1] || '').trim();

  // «Sin visita»: aún no se hizo. Las secciones 3–7 y 9 se reducen a línea.
  var sinVisita = !String(f['FECHA DE VISITA'] || '').trim()
    && visitaSinIniciar(f['ESTADO VISITA']);

  var secciones = [];
  function seccion(n, clave, titulo) {
    var s = { n: n, clave: clave, titulo: titulo, campos: [], sinDato: [], resumen: '' };
    secciones.push(s);
    return s;
  }
  // Aplica y vacío → sinDato; aplica y con dato → campos. Lo que no aplica
  // ni siquiera se construye (no se menciona).
  function campo(s, l, v, extra) {
    if (v == null || v === '') { s.sinDato.push(l); return; }
    var c = { l: l, v: String(v) };
    if (extra) Object.assign(c, extra);
    s.campos.push(c);
  }

  // 1. Identificación del caso — radicado, Atención PQR y fecha de visita
  // van en la cabecera fija; no se repiten.
  var s1 = seccion(1, 'identificacion', 'Identificación del caso');
  campo(s1, 'Fecha radicado', formatearFecha(_gFicha(f, 'FECHA RADICADO', 2)));
  campo(s1, 'Denunciante', _gFicha(f, 'DENUNCIANTE/REMITENTE', 'DENUNCIANTE', 6));
  campo(s1, 'N° visita', _gFicha(f, 'N° VISITA', 'N VISITA', 16));
  // ordenPoliciaDe descarta el «N/A» de las filas migradas de V2: sin orden real, va a «Sin dato».
  campo(s1, 'N° orden policía', ordenPoliciaDe(f));

  // 2. Ubicación del inmueble — dirección, barrio y comuna van en la
  // cabecera. Coordenadas con el mismo saneo que _coordsVD del modal.
  var s2 = seccion(2, 'ubicacion', 'Ubicación del inmueble');
  var lat = normalizarCoord(_gFicha(f, 'LATITUD', 48), 'lat');
  var lon = normalizarCoord(_gFicha(f, 'LONGITUD', 49), 'lon');
  campo(s2, 'Coordenadas', (lat != null && lon != null) ? lat.toFixed(6) + ', ' + lon.toFixed(6) : '');
  campo(s2, 'Código catastral', _gFicha(f, 'CODIGO CATASTRAL', 'CATASTRAL', 32));
  campo(s2, 'N° ficha predial', _gFicha(f, 'N° FICHA PREDIAL', 'N FICHA PREDIAL', 33));

  // 3. Persona que atiende — igual para todos los roles, como el modal de
  // hoy. Ocultarle datos del tercero al inspector sería un cambio de
  // comportamiento que nadie decidió; `rol` queda en la firma por si se decide.
  var s3 = seccion(3, 'persona', 'Persona que atiende');
  campo(s3, 'Nombre', _gFicha(f, 'NOMBRE PERSONA ATIENDE', 7));
  campo(s3, 'Identificación', _gFicha(f, 'ID PERSONA ATIENDE', 8));
  campo(s3, 'Teléfono', _gFicha(f, 'TELEFONO PERSONA ATIENDE', 9));
  campo(s3, 'Relación con el evento', _gFicha(f, 'RELACION CON EL EVENTO', 10));
  campo(s3, 'Dirección notificación', _gFicha(f, 'DIR NOTIFICACION', 11));
  campo(s3, 'Correo electrónico', _gFicha(f, 'CORREO ELECTRONICO', 12));
  // «No se atiende / No suministra datos» copiado en cada casilla: una sola
  // línea en vez de seis repeticiones. Solo pantalla; la BD queda igual.
  var _sinAtencion = /^\s*no\s+se\s+atiende|no\s+suministr/i;
  if (s3.campos.length && s3.campos.every(function (c) { return _sinAtencion.test(c.v); })) {
    s3.campos = [{ l: '', v: 'No se atendió ni suministró datos.', largo: true }];
    s3.sinDato = [];
  }

  // 4. Características de la edificación
  var s4 = seccion(4, 'edificacion', 'Características de la edificación');
  campo(s4, 'Estado de la obra', _gFicha(f, 'ESTADO OBRA', 22));
  campo(s4, 'Reparación locativa', _siNoFicha(_gFicha(f, 'REPARACION LOCATIVA', 26)));
  campo(s4, 'Habitado', _siNoFicha(_gFicha(f, 'HABITADO', 27)));
  campo(s4, 'Altura en pisos', _gFicha(f, 'ALTURA EN PISOS', 28));
  campo(s4, 'Destinaciones actuales', _gFicha(f, 'N° DESTINACIONES ACTUALES', 'N DESTINACIONES ACTUALES', 29));
  campo(s4, 'Usos actuales', _gFicha(f, 'USOS ACTUALES', 30));
  campo(s4, 'Tipo cubierta actual', _gFicha(f, 'TIPO CUBIERTA ACTUAL', 31));

  // 5. Verificación documental (licencia) — sin aporte, todo el detalle
  // (N° licencia … Observaciones licencia) se omite.
  var s5 = seccion(5, 'licencia', 'Verificación documental (licencia)');
  var aportada = String(_gFicha(f, 'SE APORTO LICENCIA', 35)).toUpperCase().trim();
  campo(s5, 'Se aportó licencia', _siNoFicha(aportada));
  if (aportada === 'SI' || aportada === 'SÍ') {
    campo(s5, 'N° licencia', _gFicha(f, 'N° LICENCIA', 'N LICENCIA', 34));
    campo(s5, 'Fecha licencia', formatearFecha(_gFicha(f, 'FECHA LICENCIA', 36)));
    campo(s5, 'Tipo y modalidad', _gFicha(f, 'TIPO Y MODALIDAD LICENCIA', 'TIPO Y MODALIDAD', 37));
    campo(s5, 'Pisos aprobados', _gFicha(f, 'PISOS APROBADOS', 38));
    campo(s5, 'Destinaciones', _gFicha(f, 'DESTINACIONES LICENCIA', 39));
    campo(s5, 'Cubierta', _gFicha(f, 'CUBIERTA LICENCIA', 40));
    campo(s5, 'Sistema estructural', _gFicha(f, 'SISTEMA ESTRUCTURAL', 'SISTEMA ESTRUCT', 41));
    campo(s5, 'Observaciones licencia', _gFicha(f, 'OBS LICENCIA', 42), { ancho: true });
  }

  // 6. Descripción de la situación encontrada (texto largo, sin etiqueta
  // visible en la vista; l vacía = párrafo).
  var s6 = seccion(6, 'descripcion', 'Descripción de la situación encontrada');
  campo(s6, 'Descripción', actuacion, { largo: true });

  // 7. Conclusiones — el área solo con contravención; la fecha de citación
  // solo con suspensión SI o si ya hay fecha.
  var s7 = seccion(7, 'conclusiones', 'Conclusiones');
  var infraccion = String(_gFicha(f, 'TIPO DE INFRACCION', 23)).split(' | ')
    .map(nombreChipVigente).join(' | ').trim();
  campo(s7, 'Tipo de contravención', infraccion, { ancho: true });
  if (infraccion) {
    campo(s7, 'Área contravención (m²)', _gFicha(f, 'AREA CONTRAVENCION m2', 'AREA CONTRAVENCION M2', 24));
  }
  var suspRaw = String(_gFicha(f, 'SUSPENSION DE LA OBRA', 43)).toUpperCase().trim();
  campo(s7, 'Suspensión de obra', _siNoFicha(suspRaw));
  campo(s7, 'Cumple retiro quebrada', _siNoFicha(_gFicha(f, 'CUMPLE RETIRO QUEBRADA', 25)));
  var fechaCit = String(_gFicha(f, 'FECHA CITACION', 45));
  if (suspRaw === 'SI' || suspRaw === 'SÍ' || fechaCit !== '') {
    campo(s7, 'Fecha citación', formatearFecha(fechaCit));
  }

  // 8. Funcionarios — visitador(es) va en la cabecera (inspector).
  var s8 = seccion(8, 'funcionarios', 'Funcionarios');
  campo(s8, 'Fecha asignación', formatearFecha(_gFicha(f, 'FECHA ASIGNACION VISITA', 14)));
  campo(s8, 'Fecha devolución', formatearFecha(_gFicha(f, 'FECHA DEVOLUCION', 20)));

  // 9. Norma POT — solo los campos con dato (los vacíos no son dato faltante
  // del inspector: es que la consulta POT no se guardó). Si con visita hecha
  // ninguno tiene dato, la sección entera no se menciona.
  var s9 = seccion(9, 'pot', 'Norma POT');
  var poligono = String(_gFicha(f, 'POLIGONO USO SUELO', 51)).trim();
  var amenaza = _siNoFicha(String(_gFicha(f, 'AMENAZA', 52)).trim());
  var proteccion = _siNoFicha(String(_gFicha(f, 'SUELO DE PROTECCION', 53)).trim());
  if (poligono) campo(s9, 'Polígono uso suelo', poligono);
  if (amenaza) campo(s9, 'Amenaza natural', amenaza);
  if (proteccion) campo(s9, 'Suelo de protección', proteccion);

  // 10. Observaciones y conclusiones — solo si hay texto tras el marcador.
  if (obsConclusion) {
    var s10 = seccion(10, 'observaciones', 'Observaciones y conclusiones');
    campo(s10, 'Conclusiones', obsConclusion, { largo: true });
  }

  // «Sin visita»: secciones 3–7 y 9 reducidas a una línea, conservando
  // número y título.
  if (sinVisita) {
    var REDUCIR = { 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 9: 1 };
    secciones.forEach(function(s) {
      if (REDUCIR[s.n]) {
        s.campos = []; s.sinDato = []; s.resumen = 'Se llena en la visita.';
      }
    });
    // Sin visita todavía no toca la orden de policía: no cuenta como faltante.
    s1.sinDato = s1.sinDato.filter(function(l) { return l !== 'N° orden policía'; });
  }

  // POT sin ningún dato (y con visita hecha): nada que mostrar.
  secciones = secciones.filter(function(s) {
    return !(s.n === 9 && !s.resumen && !s.campos.length);
  });

  return secciones;
}

// ── Ficha v2: los tres bloques del cuerpo (2026-10-25) ─────────
// Agrupa las secciones de seccionesFicha en los tres bloques de la maqueta
// propuesta-ficha.html. Fuera: identificación (1) y funcionarios (8), que ya
// están en la cabecera; ubicación (2) va a la columna del lugar.
//   bloquesFicha(f, rol) → [{ clave, titulo, campos, sinDato }]
// «Sin dato» solo en la iniciada: la completada (y la cerrada sin visita)
// muestra únicamente lo que existe, y un bloque sin nada no se menciona.
var _GRUPOS_FICHA = [
  { clave: 'encontrado', titulo: 'Lo encontrado',   ns: [3, 4, 6] },
  { clave: 'licencia',   titulo: 'Licencia y norma', ns: [5, 9] },
  { clave: 'decision',   titulo: 'Decisión',         ns: [7, 10] },
];
function bloquesFicha(f, rol) {
  var secciones = seccionesFicha(f, rol);
  if (!secciones.length) return [];
  // Asignada sin visita: el cuerpo es solo el predio y el mapa.
  if (secciones.some(function(s) { return s.resumen; })) return [];
  var est = estadoBuscarDe(f);
  var conFaltantes = est !== 'COMPLETADO' && est !== 'CERRADO';
  var out = [];
  _GRUPOS_FICHA.forEach(function(g) {
    var campos = [], faltan = [];
    secciones.forEach(function(s) {
      if (g.ns.indexOf(s.n) !== -1) {
        campos = campos.concat(s.campos);
        faltan = faltan.concat(s.sinDato);
      }
    });
    if (!conFaltantes) faltan = [];
    if (!campos.length && !faltan.length) return;
    out.push({ clave: g.clave, titulo: g.titulo, campos: campos, sinDato: faltan });
  });
  return out;
}

// ── Artículo 135 de la Ley 1801 de 2016: cita literal ─────────
// Encabezados de literal y numerales (numeración absoluta de la ley),
// tomados del Anexo A del AGENTE EXPERTO URBANÍSTICO, que los cotejó contra
// el PDF oficial. Copia de ART135_LITERALES / ART135_TEXTO del generador del
// informe (informe/index.html): la fase 2 de
// docs/PROPUESTA_2026-10-14_coherencia-acta.md deja una sola, esta.
var ART135_LITERALES = {
  A: 'Parcelar, urbanizar, demoler, intervenir o construir',
  B: 'Actuaciones en los inmuebles declarados de conservación e interés cultural, histórico, urbanístico, paisajístico y arquitectónico',
  C: 'Usar o destinar un inmueble a',
  D: 'Incumplir cualquiera de las siguientes obligaciones'
};
var ART135_TEXTO = {
  1: 'En áreas protegidas o afectadas por el plan vial o de infraestructura de servicios públicos domiciliarios, y las destinadas a equipamientos públicos',
  2: 'Con desconocimiento a lo preceptuado en la licencia',
  3: 'En bienes de uso público y terrenos afectados al espacio público',
  4: 'En terrenos aptos para estas actuaciones, sin licencia o cuando esta hubiere caducado',
  5: 'Demoler sin previa autorización o licencia',
  6: 'Intervenir o modificar sin la licencia',
  7: 'Incumplir las obligaciones para su adecuada conservación',
  8: 'Realizar acciones que puedan generar impactos negativos en el bien de interés cultural',
  9: 'Uso diferente al señalado en la licencia de construcción',
  10: 'Ubicación diferente a la señalada en la licencia de construcción',
  11: 'Contravenir los usos específicos del suelo',
  12: 'Facilitar, en cualquier clase de inmueble, el desarrollo de usos o destinaciones del suelo no autorizados en licencia de construcción o con desconocimiento de las normas urbanísticas sobre usos específicos',
  13: 'Destinar un lugar al interior de la construcción para guardar materiales, maquinaria, escombros o residuos y no ocupar con ellos, ni siquiera de manera temporal, el andén, las vías o espacios públicos circundantes',
  14: 'Proveer de unidades sanitarias provisionales para el personal que labora y visita la obra y adoptar las medidas requeridas para mantenerlas aseadas, salvo que exista una solución viable, cómoda e higiénica en el área',
  15: 'Instalar protecciones o elementos especiales en los frentes y costados de la obra y señalización, semáforos o luces nocturnas para la seguridad de quienes se movilizan por el lugar y evitar accidentes o incomodidades',
  16: 'Limpiar las llantas de los vehículos que salen de la obra para evitar que se arroje barro o cemento en el espacio público',
  17: 'Limpiar el material, cemento y los residuos de la obra, de manera inmediata, cuando caigan en el espacio público',
  18: 'Retirar los andamios, barreras, escombros y residuos de cualquier clase una vez terminada la obra, cuando esta se suspenda por más de dos (2) meses, o cuando sea necesario por seguridad de la misma',
  19: 'Exigir a quienes trabajan y visitan la obra, el uso de cascos e implementos de seguridad industrial y contar con el equipo necesario para prevenir y controlar incendios o atender emergencias de acuerdo con esta ley',
  20: 'Tomar las medidas necesarias para evitar la emisión de partículas en suspensión, provenientes de materiales de construcción, demolición o desecho, de conformidad con las leyes vigentes',
  21: 'Aislar completamente las obras de construcción que se desarrollen aledañas a canales o fuentes de agua, para evitar la contaminación del agua con materiales e implementar las acciones de prevención y mitigación que disponga la autoridad ambiental respectiva',
  22: 'Reparar los daños o averías que en razón de la obra se realicen en el andén, las vías, espacios y redes de servicios públicos',
  23: 'Reparar los daños, averías o perjuicios causados a bienes colindantes o cercanos',
  24: 'Demoler, construir o reparar obras en el horario comprendido entre las 6 de la tarde y las 8 de la mañana, como también los días festivos, en zonas residenciales'
};

// 'A', 3 → 'literal A «Parcelar, …», numeral 3 «En bienes de uso público …»'.
// '' si el literal o el numeral no existen.
function citaArt135(literal, numeral) {
  var enc = ART135_LITERALES[literal], n = parseInt(numeral, 10), txt = ART135_TEXTO[n];
  if (!enc || !txt) return '';
  return 'literal ' + literal + ' «' + enc + '», numeral ' + n + ' «' + txt + '»';
}

// 'C12: …' → 'Usar o destinar un inmueble a facilitar, en cualquier clase de
// inmueble, …' (encabezado del literal + numeral, como se lee en la ley; sin
// punto final: va entre comillas). Va bajo el chip marcado (2026-10-29): el
// nombre corto no basta para decidir.
// El literal D es una lista de obligaciones: va con dos puntos.
function textoLeyChip(val) {
  var m = /^([ABCD])(\d{1,2}):/.exec(String(val || ''));
  if (!m) return '';
  var enc = ART135_LITERALES[m[1]], txt = ART135_TEXTO[parseInt(m[2], 10)];
  if (!enc || !txt) return '';
  return enc + (m[1] === 'D' ? ': ' : ' ') + txt.charAt(0).toLowerCase() + txt.slice(1);
}

var COMPORTAMIENTO_INDETERMINADO_IA ='Ninguno: el inspector marcó «No se pudo determinar» ' +
  '(no pudo determinar si las obras requieren licencia). No hay comportamiento calificado ni se ' +
  'puede afirmar que no hay infracción.';

// Los chips de «Tipificación y medidas» (TIPO DE INFRACCION, separados por
// ' | ', p. ej. 'A3: Bienes uso público (Antejardín) | D13: Materiales en
// vía') en la forma que necesita «Mejorar con IA» para comparar la
// calificación del texto contra lo marcado:
//   []                → no hay nada marcado todavía
//   ['NINGUNO']       → se marcó «No se evidencia infracción»
//   [COMPORTAMIENTO_INDETERMINADO_IA] → se marcó «No se pudo determinar»
//   ['A3 — literal A «…», numeral 3 «…»', …] → un renglón por comportamiento
// Lo que no es un chip con código (textos de V2) se ignora: la IA solo
// compara contra lo que el inspector ve marcado en pantalla.
function comportamientosParaIA(infraccion) {
  var chips = String(infraccion || '').split(' | ')
    .map(function(s) { return s.trim(); }).filter(Boolean);
  if (chips.indexOf('No se evidencia infracción') >= 0) return ['NINGUNO'];
  // El backend pinta cada elemento como un renglón del bloque «comportamientos
  // marcados»: este se explica solo, sin cambio en el backend.
  if (chips.indexOf(CONTRAVENCION_INDETERMINADA) >= 0) return [COMPORTAMIENTO_INDETERMINADO_IA];
  var out = [];
  chips.forEach(function(c) {
    var m = /^([ABCD])(\d{1,2}):/.exec(c);
    if (!m) return;
    var cita = citaArt135(m[1], m[2]);
    if (cita) out.push(m[1] + parseInt(m[2], 10) + ' — ' + cita);
  });
  return out;
}

// ── Capacidad de las celdas del acta F-GGO-46 ─────────────────
// La celda no crece: lo que no cabe no sale en el PDF, y nadie se entera.
// Medido el 2026-10-15 en PDF reales: la situación (A30) se cortó en el
// renglón 23 (fila 1552, 2025-020054) y las conclusiones (A38) en el 6
// (fila 1698, 20191038116, con la frase del art. 135 ocupando 3). Un
// renglón son ≈ 152 caracteres; cada salto de línea abre renglón y una
// línea vacía ocupa uno. Si cambia la plantilla, se vuelve a medir aquí.
var ACTA_CAPACIDAD = {
  situacion:    { renglones: 22, porRenglon: 152 },
  conclusiones: { renglones: 5,  porRenglon: 152 }
};

function renglonesActa(texto, porRenglon) {
  var t = String(texto == null ? '' : texto).replace(/\s+$/, '');
  if (!t.trim()) return 0;
  return t.split('\n').reduce(function(n, linea) {
    return n + Math.max(1, Math.ceil(linea.replace(/\s+$/, '').length / porRenglon));
  }, 0);
}

// `celda`: 'situacion' | 'conclusiones'. `caracteres` ≈ los que aún caben
// (positivo) o los que sobran (negativo).
function capacidadActa(texto, celda) {
  var c = ACTA_CAPACIDAD[celda] || ACTA_CAPACIDAD.situacion;
  var r = renglonesActa(texto, c.porRenglon);
  return { renglones: r, max: c.renglones, cabe: r <= c.renglones,
           caracteres: (c.renglones - r) * c.porRenglon };
}

// Largo al que «Revisar» condensa un texto que no cabe en su celda.
// `ocupados`: renglones que ya usa otra cosa en la celda. Cada párrafo
// después del primero cuesta una línea vacía y un renglón a medias; 10 % de margen por el ajuste de
// palabras. 0 = no queda espacio.
function caracteresParaActa(celda, ocupados, parrafos) {
  var c = ACTA_CAPACIDAD[celda] || ACTA_CAPACIDAD.situacion;
  var p = Math.min(4, Math.max(1, parrafos || 1));
  var libres = c.renglones - (ocupados || 0) - 2 * (p - 1);
  return libres > 0 ? Math.floor(libres * c.porRenglon * 0.9) : 0;
}

// Tope que «Revisar» manda para la situación encontrada cuando la visita va
// a acta (2026-10-26). La propuesta sale en párrafos por tema (hasta 4 de
// hechos y uno de conclusión, que se permite en esta casilla) separados por
// una línea en blanco (2026-10-27, decisión del usuario): cada párrafo
// después del primero cuesta la línea vacía y un renglón a medias, lo de
// caracteresParaActa. Antes solo viajaba el largo del original.
var PARRAFOS_REVISION_MAX = 5;
function topeSituacionRevision(texto) {
  var p = String(texto == null ? '' : texto).split(/\n+/).filter(function (s) { return s.trim(); }).length;
  return caracteresParaActa('situacion', 0, Math.max(p, PARRAFOS_REVISION_MAX));
}

// Marcadores para completar que no pueden llegar al acta (2026-10-26):
// corchetes («[área]», «[ ]») y rayas bajas («__ m²»). Devuelve los que hay,
// tal como aparecen, para nombrarlos en el aviso.
function marcadoresPendientes(texto) {
  var m = String(texto == null ? '' : texto).match(/\[[^\]\n]{0,80}\]|_{2,}/g) || [];
  return m.filter(function (x, i) { return m.indexOf(x) === i; });
}

// Resumen de lo que hace la propuesta de «Revisar» frente al texto del
// inspector. Lo perdido va primero porque es lo que cambia el sentido (caso
// 20251084835: «no evidencian, por sí mismas, una intervención que requiera
// licencia» → «no requieren licencia»). Después, como mucho 2 motivos que
// explican qué hace la propuesta, sin decir que es «mejor» (decisión del
// usuario 2026-10-17).
//   [{ tipo: 'pierde' | 'motivo', texto }]
// Fuentes de regex sobre el texto sin tildes y en minúscula. Con límite de
// palabra: «segun» no puede atrapar «segundo piso».
// «aparente(mente)» salió el 2026-10-29: quitarlo es lo que pide la regla «la
// visita es la verificación» (aplazamientosTexto). La duda con motivo sigue
// protegida por «tuvo acceso», «no se pudo», «no fue posible».
var SALVEDADES_REVISION = [
  '\\bpor si mism\\w*', '\\bpor si sol\\w*', '\\bsiempre que\\b', '\\bsalvo\\b', '\\bexcepto\\b',
  '\\ba menos que\\b', '\\ben las areas\\b', '\\btuvo acceso\\b', '\\bvisibles?\\b',
  '\\bno fue posible\\b', '\\bno se pudo\\b', '\\bno se logro\\b', '\\bpresunt\\w*',
  '\\bsegun\\b', '\\bmanifest\\w*'
];
function resumenCambios(orig, prop, opts) {
  opts = opts || {};
  orig = String(orig || ''); prop = String(prop || '');
  var out = [];
  var on = _sinTildesRev(orig), pn = _sinTildesRev(prop);
  var cuenta = function(t, src) { return (t.match(new RegExp(src, 'g')) || []).length; };
  // Cita el fragmento tal como lo escribió el inspector: sin tildes el texto
  // conserva el largo (NFC → base + marcas → base), así que el índice sirve.
  var cita = function(src) {
    var m = new RegExp(src).exec(on);
    if (!m) return '';
    var trozo = on.length === orig.length ? orig.substr(m.index, m[0].length) : m[0];
    return '«' + trozo.toLowerCase() + '»';
  };

  // Cifras del original que no aparecen en la propuesta (medidas, pisos…).
  // Se comparan solo por sus dígitos («1.500» = «1500», «2,5» = «2.5»: el
  // punto y la coma van de miles o de decimales según quien escriba) y se
  // muestran como las escribió el inspector.
  var crudos = function(t) { return t.match(/\d+(?:[.,]\d+)*/g) || []; };
  var norm = function(n) { return n.replace(/[.,]/g, ''); };
  var numsProp = crudos(prop).map(norm);
  var vistos = {};
  var perdidas = crudos(orig).filter(function(n) {
    var k = norm(n);
    if (vistos[k] || numsProp.indexOf(k) >= 0) return false;
    return (vistos[k] = true);
  });
  if (perdidas.length) out.push({ tipo: 'pierde', texto: 'No aparecen estas cifras: ' + perdidas.slice(0, 6).join(', ') + '.' });

  // Salvedades y atribuciones que la propuesta quita o reduce.
  var quitadas = SALVEDADES_REVISION.filter(function(p) { return cuenta(on, p) > cuenta(pn, p); });
  if (quitadas.length) out.push({ tipo: 'pierde', texto: 'Quita o reduce salvedades: ' + quitadas.slice(0, 4).map(cita).join(', ') + '. Confirma que el sentido no cambia.' });

  // Motivos: máximo 2, por prioridad (2026-10-17).
  var motivos = [];

  // 1. Quitó expresiones de IA (las de orig que ya no están en la propuesta).
  var enProp = {};
  expresionesIA(prop).forEach(function (x) { enProp[_sinTildesRev(x.frase)] = true; });
  var iaFuera = expresionesIA(orig).filter(function (x) { return !enProp[_sinTildesRev(x.frase)]; });
  if (iaFuera.length) {
    var citas = iaFuera.slice(0, 2).map(function (x) { return '«' + x.frase.toLowerCase() + '»'; });
    motivos.push('Se quitan expresiones típicas de textos generados por IA (' + citas.join(', ') + ').');
  }

  // 2. Reordenó: cada oración de orig con la de prop que más palabras suyas
  // (> 3 letras) contiene (≥ 60 %); si las emparejadas cambiaron de orden.
  var oraciones = function (t) { return t.split(/[.!?]+(?:\s+|$)/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 3; }); };
  var palabrasLargas = function (s) {
    var set = {};
    _sinTildesRev(s).split(/[^a-z0-9ñ]+/).forEach(function (w) { if (w.length > 3) set[w] = true; });
    return set;
  };
  var oo = oraciones(orig).map(palabrasLargas), pp = oraciones(prop).map(palabrasLargas);
  var parejas = [];
  oo.forEach(function (po, i) {
    var claves = Object.keys(po);
    if (!claves.length) return;
    var mejor = -1, comunes = 0;
    pp.forEach(function (pq, j) {
      var n2 = claves.filter(function (w) { return pq[w]; }).length;
      if (n2 > comunes && n2 / claves.length >= 0.6) { mejor = j; comunes = n2; }
    });
    if (mejor >= 0) parejas.push(mejor);
  });
  if (parejas.length >= 2 && parejas.some(function (j, i) { return i && j <= parejas[i - 1]; })) {
    motivos.push('Se ordenan los hechos como ocurrieron en la visita.');
  }

  // 3. Partió oraciones largas (> 35 palabras) y quedan menos.
  var largas = function (tt) { return oraciones(tt).filter(function (s) { return s.split(/\s+/).length > 35; }).length; };
  if (largas(orig) > largas(prop)) motivos.push('Se parten las oraciones muy largas para que se lean de una vez.');

  // 4. Condensó (la propuesta se pidió con tope del acta).
  if (opts.condensa === true) motivos.push('Se condensa para que quepa en el acta.');

  // 5. Cambió otra cosa.
  if (!motivos.length && orig.trim() !== prop.trim()) motivos.push(MOTIVO_GENERICO_REVISION);

  motivos.slice(0, 2).forEach(function (t) { out.push({ tipo: 'motivo', texto: t }); });
  return out;
}

// ── Segunda revisión sin propuestas innecesarias (2026-10-17) ──────────
// Palabras comparables: minúsculas, sin tildes, solo [a-z0-9] (mismo
// criterio que _normTexto de informe/editor.js).
function _palabrasRevision(t) {
  return String(t == null ? '' : t).toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}
function _jaccardConjuntos(a, b) {
  var sa = {}, sb = {};
  a.forEach(function (w) { sa[w] = true; });
  b.forEach(function (w) { sb[w] = true; });
  var na = Object.keys(sa).length, nb = Object.keys(sb).length;
  if (!na || !nb) return 0;
  var inter = 0;
  for (var k in sa) if (sb[k]) inter++;
  return inter / (na + nb - inter);
}

// ¿El retoque de un texto ya revisado es menor? (no amerita otra propuesta).
// Decisión del usuario 2026-10-17: coma, tilde o una palabra cambiada en un
// texto largo → el texto se queda como está y la revisión se sella en silencio.
// No es menor si aparece una cifra nueva o una oración más.
function cambioMenorRevision(revisado, actual) {
  revisado = String(revisado == null ? '' : revisado).trim();
  actual = String(actual == null ? '' : actual).trim();
  if (!revisado || !actual) return false;
  if (_jaccardConjuntos(_palabrasRevision(revisado), _palabrasRevision(actual)) < 0.85) return false;
  var cifras = function (t) { var s = {}; (t.match(/\d+([.,]\d+)?/g) || []).forEach(function (n) { s[n] = true; }); return s; };
  var cr = cifras(revisado), ca = cifras(actual);
  for (var k in ca) if (!cr[k]) return false;
  var oraciones = function (t) { return t.split(/[.!?]+\s+/).filter(function (s) { return s.trim().length > 3; }).length; };
  return oraciones(actual) <= oraciones(revisado);
}

// ¿La propuesta aporta algo frente al texto? (si no, no se muestra como
// opción): casi idéntica y sin pérdidas → no aporta.
// Aporta también (2026-10-26) si resuelve lo que el panel le señala al texto
// (parte oraciones largas, quita expresiones de IA, reordena) o corrige 3+
// palabras: la edición mínima casi no cambia el conjunto de palabras, y con
// solo el Jaccard se descartaba la propuesta que partía oraciones de 37
// palabras y corregía «terraza que cubierta» / «efecto la humedad».
var MOTIVO_GENERICO_REVISION = 'Se corrigen ortografía y redacción.';
function _palabrasCambiadasRevision(a, b) {
  var tok = function (t) { return String(t).toLowerCase().split(/[^a-z0-9áéíóúüñ]+/).filter(Boolean); };
  var cuenta = {};
  tok(a).forEach(function (w) { cuenta[w] = (cuenta[w] || 0) + 1; });
  var agregadas = 0;
  tok(b).forEach(function (w) { if (cuenta[w] > 0) cuenta[w]--; else agregadas++; });
  var quitadas = 0;
  for (var k in cuenta) quitadas += cuenta[k];
  return agregadas + quitadas;
}
function propuestaAporta(original, propuesta) {
  original = String(original == null ? '' : original);
  propuesta = String(propuesta == null ? '' : propuesta);
  if (!original.trim()) return !!propuesta.trim();
  if (!propuesta.trim()) return false;
  if (resumenCambios(original, propuesta).some(function (r) {
    return r.tipo === 'pierde' || r.texto !== MOTIVO_GENERICO_REVISION;
  })) return true;
  if (_palabrasCambiadasRevision(original, propuesta) >= 3) return true;
  return _jaccardConjuntos(_palabrasRevision(original), _palabrasRevision(propuesta)) < 0.95;
}

// ── Reglas de coherencia que bloquean el acta (fase 1) ────────
// docs/PROPUESTA_2026-10-14_coherencia-acta.md § 4, con las decisiones del
// usuario: contradicciones entre casillas que no se pasan con justificación.
// _evaluarFormulario las convierte en faltantes, así frenan acta, regenerar
// e informe. Las que admiten justificación van en revisarTextoLocal.
// `e`: { infraccion, areaNoAplica, repLocativa, licenciaAportada, estadoObra,
//        suspension, sueloProt, quebrada }
function reglasBloqueoActa(e) {
  e = e || {};
  var out = [];
  function add(id, mensaje) { out.push({ id: id, mensaje: mensaje }); }
  var chips = String(e.infraccion || '').split(' | ')
    .map(function(s) { return s.trim(); }).filter(Boolean);
  var ninguno = chips.indexOf('No se evidencia infracción') >= 0;
  var indeterminado = chips.indexOf(CONTRAVENCION_INDETERMINADA) >= 0;
  var cod = {};
  chips.forEach(function(c) {
    var m = /^([ABCD])(\d{1,2}):/.exec(c);
    if (m) cod[m[1] + parseInt(m[2], 10)] = true;
  });
  var codigos = Object.keys(cod);
  var literalA = codigos.some(function(c) { return c.charAt(0) === 'A'; });
  var si = function(v) { return String(v || '').trim().toUpperCase() === 'SI'; };

  // R02: «No se evidencia infracción» es excluyente con cualquier otro chip.
  if (ninguno && codigos.length) {
    add('R02', 'Tipificación: «No se evidencia infracción» no puede ir junto con otros comportamientos.');
  }
  if (indeterminado && (codigos.length || ninguno)) {
    add('R02', 'Tipificación: «No se pudo determinar» no puede ir junto con otra opción.');
  }
  // R17 / R18 (2026-10-27): la tipificación contra «¿Las obras requieren
  // licencia?». Sin la respuesta (visitas viejas, acción sin el dato) no se
  // juzga: la pregunta ya es obligatoria para el acta.
  var req = String(e.requiereLicencia || '').trim().toUpperCase();
  if (indeterminado && req && req !== REQUIERE_INDETERMINADO) {
    add('R17', 'Tipificación: «No se pudo determinar» solo vale si en Verificación documental «¿Las obras requieren licencia?» = No se pudo determinar.');
  }
  if (req === REQUIERE_INDETERMINADO && (ninguno || cod.A4)) {
    add('R18', 'En Verificación documental no se pudo determinar si las obras requieren licencia, y en Tipificación está ' +
      (ninguno ? '«No se evidencia infracción»' : 'A4 (sin licencia)') + ': marca «No se pudo determinar» o corrige la respuesta.');
  }
  // R03: con un comportamiento marcado, el área no es «No aplica».
  if (codigos.length && e.areaNoAplica) {
    add('R03', 'Área en contravención: hay comportamientos marcados; pon los m² o marca «No se pudo medir».');
  }
  // R04: una reparación locativa no requiere licencia; no puede ser a la vez
  // construir o intervenir (literal A).
  if (si(e.repLocativa) && literalA) {
    add('R04', 'En Verificación documental, las obras no requieren licencia por ser reparación locativa, y en Tipificación hay un comportamiento del literal A (construir o intervenir): una de las dos sobra.');
  }
  // R09: A2, C9 y C10 comparan contra una licencia aportada (sin excepción).
  var contraLicencia = ['A2', 'C9', 'C10'].filter(function(c) { return cod[c]; });
  if (contraLicencia.length && !si(e.licenciaAportada)) {
    add('R09', contraLicencia.join(', ') + ' compara' + (contraLicencia.length > 1 ? 'n' : '') +
      ' contra una licencia, y no se aportó licencia: corresponde A4 o C11.');
  }
  // R10: no se suspende una obra terminada.
  if (String(e.estadoObra || '').trim() === 'Terminada' && si(e.suspension)) {
    add('R10', 'La obra está terminada y la suspensión dice SI: no se suspende una obra terminada.');
  }
  // R11: suelo de protección o retiro de quebrada con construcción → A1.
  // Regla fundamental: sin justificación. O se marca A1, o se mueve el pin.
  if ((si(e.sueloProt) || si(e.quebrada)) && literalA && !cod.A1) {
    add('R11', 'El predio está en ' + (si(e.sueloProt) ? 'suelo de protección' : 'retiro de quebrada') +
      ' y hay un comportamiento del literal A sin A1: marca A1, o mueve el pin si el punto está mal.');
  }
  return out;
}

// ── Revisión obligatoria del texto del acta ───────────────────
// docs/PROPUESTA_2026-10-14_coherencia-acta.md § 8. Sin una revisión vigente
// no se genera ni el acta ni el informe. «Vigente» = la huella de la
// descripción, las conclusiones y los chips es la misma que se selló al
// cerrar la revisión: cualquier cambio de contenido la vence (decisión del
// usuario). Espacios y saltos de línea no cuentan como cambio.

function _normTextoRevision(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}
function _normChipsRevision(infraccion) {
  return chipsConNombreSellado(infraccion).split(' | ')
    .map(function(c) { return c.trim(); }).filter(Boolean).sort().join(' | ');
}

// Las casillas que leen las reglas con justificación de revisarTextoLocal
// (reparación locativa, área, licencia, pisos, destinaciones, usos): si
// cambian después de revisar, la justificación ya no habla del acta que sale,
// así que también vencen la revisión. `d` = estado del formulario.
function camposRevision(d) {
  d = d || {};
  return ['repLocativa', 'area', 'areaNoAplica', 'areaNoMedible', 'licenciaAportada',
          'alturaPisos', 'pisos', 'destActuales', 'destinaciones', 'usos']
    .map(function(k) { return _normTextoRevision(d[k] === true ? 'si' : d[k] === false ? '' : d[k]); })
    .join('|');
}

// FNV-1a de 32 bits en hexadecimal (8 caracteres). No es criptográfica: solo
// distingue «el texto que se revisó» de «otro texto».
// `campos` = camposRevision(d); vacío en las llamadas que no lo usan.
function _fnv8(s) {
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}
function huellaRevision(actuacion, conclusion, infraccion, campos) {
  var s = _normTextoRevision(actuacion) + '\u0001' + _normTextoRevision(conclusion) +
    '\u0001' + _normChipsRevision(infraccion) + (campos ? '\u0001' + campos : '');
  return _fnv8(s);
}

// ── Revisión por campo (2026-10-17) ─────────────────────────────
// La huella única vencía la revisión por una coma, una tilde o un chip que no
// toca el texto. Ahora cada parte (descripción, conclusiones, datos) lleva su
// propia huella, calculada sobre texto «suave»: minúscula, sin tildes, signos
// fuera y espacios colapsados. La ñ se conserva (NFD la descompondría).
function _normTextoSuave(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ')
    .replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function partesRevision(actuacion, conclusion, infraccion, campos) {
  return {
    desc: _fnv8(_normTextoSuave(actuacion)),
    conc: _fnv8(_normTextoSuave(conclusion)),
    datos: _fnv8(_normChipsRevision(infraccion) + '|' + (campos || '')),
  };
}
// Lo que va en la celda: el sello extendido solo si hay partes (los sellos
// viejos siguen escribiéndose como hoy).
function huellaParaBD(rev) {
  if (!rev) return '';
  if (!rev.partes) return rev.huella;
  return rev.huella + '.' + rev.partes.desc + '.' + rev.partes.conc + '.' + rev.partes.datos;
}
// Qué partes cambiaron desde el sello. Sello viejo (sin partes): la
// comparación de siempre — vigente → [], vencido → las tres (revisión
// completa, como hoy). Sin sello → las tres.
function partesCambiadas(rev, actuacion, conclusion, infraccion, campos) {
  var TODAS = ['desc', 'conc', 'datos'];
  if (!rev || !rev.huella) return TODAS;
  if (!rev.partes) {
    return rev.huella === huellaRevision(actuacion, conclusion, infraccion, campos) ? [] : TODAS;
  }
  var ahora = partesRevision(actuacion, conclusion, infraccion, campos);
  return TODAS.filter(function(k) { return rev.partes[k] !== ahora[k]; });
}

// Columna REVISION_DESCRIPCION: 'IA · 1a2b3c4d · 14/10/2026 · NOMBRE' o, con
// partes, 'IA · 1a2b3c4d.desc.conc.datos · 14/10/2026 · NOMBRE'.
// MODO = IA (usó la versión de la IA) | PROPIO (conservó su texto) | LOCAL
// (la IA no respondió y se cerró solo con el chequeo local).
var MODOS_REVISION = ['IA', 'PROPIO', 'LOCAL'];
function leerSelloRevision(valor) {
  var partes = String(valor || '').split('·').map(function(p) { return p.trim(); });
  var modo = (partes[0] || '').toUpperCase();
  if (MODOS_REVISION.indexOf(modo) < 0) return null;
  var grupos = (partes[1] || '').split('.');
  if ((grupos.length !== 1 && grupos.length !== 4) ||
      grupos.some(function(g) { return !/^[0-9a-f]{8}$/.test(g); })) return null;
  var out = { modo: modo, huella: grupos[0], fecha: partes[2] || '', nombre: partes[3] || '' };
  if (grupos.length === 4) out.partes = { desc: grupos[1], conc: grupos[2], datos: grupos[3] };
  return out;
}

// `sinSenalesCoherencia`: solo cambia `datos` (chips/casillas) y el chequeo
// local no ve contradicción con los textos → la revisión sigue vigente
// (decisión del usuario 2026-10-17: marcar un chip que no contradice el
// texto no obliga a revisar). Sin el 6.º argumento, `['datos']` vence.
function revisionVigente(rev, actuacion, conclusion, infraccion, campos, sinSenalesCoherencia) {
  if (!rev) return false;
  if (!rev.partes) {
    return !!(rev.huella && rev.huella === huellaRevision(actuacion, conclusion, infraccion, campos));
  }
  var cambiadas = partesCambiadas(rev, actuacion, conclusion, infraccion, campos);
  if (!cambiadas.length) return true;
  return cambiadas.length === 1 && cambiadas[0] === 'datos' && sinSenalesCoherencia === true;
}

// Expresiones evidentes de textos generados por IA, medidas en BD VISITAS
// (2026-10-17). `conector: true` = solo cuenta al empezar una oración (inicio
// del texto o tras «.», «;», «:» o salto de línea). Patrones sin tildes y en
// minúscula (se comparan con _sinTildesRev), con límite de palabra.
// Naturales, que NO entran (para que nadie las agregue después): «toda vez
// que», «con el fin de» (suelta), «dicho/dicha», «no obstante», «sin
// embargo», «lo cual», «lo anterior», «se procedió a», «se evidencia»,
// «se observa», «se constató», «durante la visita», «al momento de la
// visita», «respectivamente», «evidenciando».
var EXPRESIONES_IA = [
  // Conectores: solo al empezar la oración.
  { rx: '\\basimismo\\b', conector: true },
  { rx: '\\badicionalmente\\b', conector: true },
  { rx: '\\bde igual manera\\b', conector: true },
  { rx: '\\bde igual forma\\b', conector: true },
  { rx: '\\bigualmente\\b', conector: true },
  { rx: '\\ben consecuencia\\b', conector: true },
  { rx: '\\bpor otro lado\\b', conector: true },
  { rx: '\\bcabe destacar\\b', conector: true },
  { rx: '\\bcabe resaltar\\b', conector: true },
  { rx: '\\bes importante senalar\\b', conector: true },
  { rx: '\\bes fundamental\\b', conector: true },
  { rx: '\\ben este orden de ideas\\b', conector: true },
  { rx: '\\ben sintesis\\b', conector: true },
  { rx: '\\ben conclusion\\b', conector: true },
  // En cualquier parte.
  { rx: '\\bcon el proposito de\\b' },
  { rx: '\\bcon el fin de garantizar\\b' },
  { rx: '\\bcon el fin de salvaguardar\\b' },
  { rx: '\\bsalvaguardar\\b' },
  { rx: '\\bgarantiz\\w*\\b' },
  // «integral» salvo «reparación integral» (modalidad de licencia).
  { rx: '\\bintegral\\b', salvoPrevio: 'reparacion ' },
  { rx: '\\bsignificativ[oa]s?\\b' },
  { rx: '\\bdebidamente\\b' },
  { rx: '\\bpertinente\\b' },
  { rx: '\\bclaramente\\b' },
  { rx: '\\bcontundente\\b' },
  { rx: '\\brobust[oa]s?\\b' },
  { rx: '\\bcrucial\\b' },
  { rx: '\\ben el marco de\\b' },
  { rx: '\\ben virtud de\\b' },
  { rx: '\\blo que permite establecer\\b' },
  { rx: '\\bque permiten establecer\\b' },
  { rx: '\\bsituacion que\\b' },
  { rx: '\\bresulta evidente\\b' },
  { rx: '\\bse procede a\\b' },
  { rx: '\\bel suscrito\\b' },
  { rx: '\\bse permite informar\\b' },
  { rx: '\\ben atencion a lo anteriormente expuesto\\b' },
  { rx: '\\bobjeto de la presente\\b' },
  // Relleno de texto generado (2026-10-17, el prompt también lo prohíbe).
  { rx: '\\bse deja constancia de\\b' },
  { rx: '\\ba que haya lugar\\b' },
  { rx: '\\ben terminos generales\\b' },
  { rx: '\\bcon posterioridad a\\b' },
  // Traslado genérico y categoría que no es de la ley (el prompt las prohíbe).
  { rx: '\\bdependencias correspondientes\\b' },
  { rx: '\\bafectacion publica\\b' }
];
// Esta lista viaja también al backend (apps_script_unificado.js), que la usa
// para nombrarle a la IA las expresiones de cada texto: la copia la escribe
// herramientas/probar-mejora-texto/sincronizar.js. No editar allá a mano.

// ¿Empieza oración en `i`? Inicio del texto o justo tras «.», «;», «:» o
// salto de línea (solo espacios entre el separador y `i`).
function _inicioOracionIA(n, i) {
  if (i === 0) return true;
  var antes = n.slice(0, i);
  var j = Math.max(antes.lastIndexOf('.'), antes.lastIndexOf(';'),
                   antes.lastIndexOf(':'), antes.lastIndexOf('\n'));
  return !/\S/.test(antes.slice(j + 1));
}

// Cada expresión evidente de IA en el texto: [{ inicio, fin, frase }] con
// posiciones sobre el texto original (para tachar). NFD conserva el largo, así
// que el índice del texto normalizado sirve en el original. Con solapes gana
// el match más largo («con el fin de garantizar» traga «garantizar»).
function expresionesIA(texto) {
  var t = String(texto || '');
  var n = _sinTildesRev(t);
  var todos = [];
  EXPRESIONES_IA.forEach(function (e) {
    var m, re = new RegExp(e.rx, 'g');
    while ((m = re.exec(n))) {
      if (e.conector && !_inicioOracionIA(n, m.index)) continue;
      if (e.salvoPrevio && n.slice(Math.max(0, m.index - e.salvoPrevio.length), m.index) === e.salvoPrevio) continue;
      todos.push({ inicio: m.index, fin: m.index + m[0].length, frase: t.substr(m.index, m[0].length) });
    }
  });
  todos.sort(function (a, b) { return a.inicio - b.inicio || (b.fin - b.inicio) - (a.fin - a.inicio); });
  var out = [], ultimoFin = -1;
  todos.forEach(function (x) {
    if (x.inicio >= ultimoFin) { out.push(x); ultimoFin = x.fin; }
  });
  return out;
}
// ── La visita es la verificación (2026-10-29, decisión del usuario) ──
// Informe de 20231121436: «esta circunstancia deberá ser objeto de
// verificación mediante la revisión de la licencia», «deberán ser
// contrastadas con los documentos urbanísticos», «aparentemente». La visita es
// la que verifica: dejarlo para después o dudar de lo que se vio le quita al
// documento su valor de prueba. `aplaza` = deja la verificación para otro;
// `duda` = pone en duda lo observado. «Presunto» no entra (es la forma
// jurídica de nombrar un incumplimiento), ni «aproximadamente» con medidas
// (sin cinta, una medida es aproximada); con un conteo de unidades o pisos sí.
// Patrones sin tildes y en minúscula (se comparan con _sinTildesRev).
var APLAZAMIENTOS_VERIFICACION = [
  { rx: '\\b(?:debera|deberan|deberia|deberian|sera|seran) ser objeto de (?:verificacion|revision|estudio|analisis|confrontacion)\\b', tipo: 'aplaza' },
  { rx: '\\b(?:debera|deberan|deberia|deberian) (?:ser )?(?:contrastad|verificad|confrontad|corroborad|validad|revisad|cotejad)[oa]s?\\b', tipo: 'aplaza' },
  { rx: '\\b(?:debera|deberan|deberia|deberian) (?:contrastarse|verificarse|confrontarse|corroborarse|validarse|cotejarse|efectuarse|establecerse|determinarse)\\b', tipo: 'aplaza' },
  { rx: '\\bcuya (?:verificacion|confrontacion|comprobacion|revision)\\b', tipo: 'aplaza' },
  { rx: '\\bquedan? pendientes? (?:la |de |por )?(?:verificacion|verificar|confirmacion|confirmar|revision|revisar|establecer)\\b', tipo: 'aplaza' },
  { rx: '\\b(?:se requiere|es necesario|sera necesario|se hace necesario|se debe|se deben) (?:verificar|contrastar|confrontar|corroborar|establecer si|determinar si)\\b', tipo: 'aplaza' },
  { rx: '\\baparentemente\\b', tipo: 'duda' },
  { rx: '\\baparentes?\\b', tipo: 'duda' },
  { rx: '\\bal parecer\\b', tipo: 'duda' },
  { rx: '\\bpresumiblemente\\b', tipo: 'duda' },
  { rx: '\\bpareciera\\b', tipo: 'duda' },
  { rx: '\\bposibles? (?:diferencias?|inconsistencias?|discrepancias?|irregularidad(?:es)?|modificaci(?:on|ones)|ampliaci(?:on|ones)|unidad(?:es)?|destinaci(?:on|ones))\\b', tipo: 'duda' },
  { rx: '\\b(?:aproximadamente|alrededor de|cerca de) (?:[a-z]+ )?\\(?\\d+\\)? (?:destinaciones|unidades|apartamentos|viviendas|locales|pisos|niveles)\\b', tipo: 'duda' }
];
// Si la oración dice por qué no se pudo verificar, la duda es honesta.
var _MOTIVO_SIN_VERIFICAR = /no se (?:tuvo|permitio|pudo|logro) (?:el )?(?:acceso|acceder|ingres|ingresar|entrar)|sin acceso|no fue posible (?:acceder|ingresar|entrar)|no se permitio el ingreso|no hubo acceso|estaba cerrad|se encontraba cerrad/;

// [{ inicio, fin, frase, tipo }] con posiciones sobre el texto original, como
// expresionesIA (para marcarlas en «Tu texto»).
function aplazamientosTexto(texto) {
  var t = String(texto || '');
  var n = _sinTildesRev(t);
  var todos = [];
  APLAZAMIENTOS_VERIFICACION.forEach(function (e) {
    var m, re = new RegExp(e.rx, 'g');
    while ((m = re.exec(n))) {
      var ini = Math.max(n.lastIndexOf('.', m.index), n.lastIndexOf('\n', m.index)) + 1;
      var finO = n.indexOf('.', m.index);
      var oracion = n.slice(ini, finO < 0 ? n.length : finO);
      if (e.tipo === 'duda' && _MOTIVO_SIN_VERIFICAR.test(oracion)) continue;
      todos.push({ inicio: m.index, fin: m.index + m[0].length, frase: t.substr(m.index, m[0].length), tipo: e.tipo });
    }
  });
  todos.sort(function (a, b) { return a.inicio - b.inicio || (b.fin - b.inicio) - (a.fin - a.inicio); });
  var out = [], ultimoFin = -1;
  todos.forEach(function (x) {
    if (x.inicio >= ultimoFin) { out.push(x); ultimoFin = x.fin; }
  });
  return out;
}

var _NUMERALES_LITERAL = { A: [1, 4], B: [5, 8], C: [9, 12], D: [13, 24] };

function _sinTildesRev(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Comportamientos del art. 135 que cita un texto: por código («A3», «D13»)
// y por cita completa («literal A … numeral 3»). Se quita antes el polígono
// POT, que trae códigos con la misma forma («ZDI-1-C5»).
function _comportamientosCitados(texto, poligono) {
  var t = String(texto || '');
  if (poligono && String(poligono).trim()) t = t.split(String(poligono).trim()).join(' ');
  var out = {};
  function valido(lit, num) {
    var r = _NUMERALES_LITERAL[lit];
    return r && num >= r[0] && num <= r[1];
  }
  // Sin lookbehind a propósito: Safari anterior a 16.4 no lo entiende y un
  // error de sintaxis aquí tumbaría utils.js entero.
  var rxCod = /(^|[^-\w])([ABCD])\.?\s?(\d{1,2})\b/g, mc;
  while ((mc = rxCod.exec(t))) {
    if (valido(mc[2], parseInt(mc[3], 10))) out[mc[2] + parseInt(mc[3], 10)] = true;
  }
  var rx = /literal\s+([abcd])\b[^.;]{0,400}?numeral\s+(\d{1,2})\b/gi, m;
  var tn = _sinTildesRev(t);
  while ((m = rx.exec(tn))) {
    var lit = m[1].toUpperCase(), num = parseInt(m[2], 10);
    if (valido(lit, num)) out[lit + num] = true;
  }
  return Object.keys(out);
}

// Chequeo local de la revisión (sin IA, sin red). Devuelve las señales:
//   [{ id, tipo: 'coherencia' | 'forma', donde: 'descripcion' | 'conclusion' | 'area', mensaje }]
// Solo las de coherencia (el texto contradice una casilla) piden
// justificación al cerrar; las de forma son avisos (decisión del usuario
// 2026-10-15: a Alejandro se le pidió justificar el largo de la propuesta
// de la propia IA, y escribió una conclusión en la casilla).
// `e`: { actuacion, conclusion, infraccion, poligono, area, areaNoAplica, areaNoMedible }
var SENALES_DE_FORMA = ['externo', 'categoria', 'traslado', 'infractor', 'alcance', 'R06', 'R06b', 'aplaza'];
// Cifra de un área como se escribe en Colombia: decimales con coma
// («58.75» → «58,75»). Un punto con 3 cifras detrás es de miles y se deja.
function numeroAreaCO(n) {
  var s = String(n == null ? '' : n).trim();
  return /^\d+\.\d{1,2}$/.test(s) ? s.replace('.', ',') : s;
}

function revisarTextoLocal(e) {
  e = e || {};
  var senales = [];
  function add(id, donde, mensaje) {
    senales.push({ id: id, tipo: SENALES_DE_FORMA.indexOf(id) >= 0 ? 'forma' : 'coherencia',
                   donde: donde, mensaje: mensaje });
  }
  var lista = comportamientosParaIA(e.infraccion);
  var ninguno = lista[0] === 'NINGUNO';
  var indeterminado = lista[0] === COMPORTAMIENTO_INDETERMINADO_IA;
  var marcados = (ninguno || indeterminado) ? [] : lista.map(function(c) { return c.split(' — ')[0]; });
  // `nombre` encabeza el mensaje («En la descripción: …») para no tener que
  // concordar el verbo con cada casilla.
  var textos = [
    { donde: 'descripcion', nombre: 'En la descripción:', t: String(e.actuacion || '') },
    { donde: 'conclusion', nombre: 'En las conclusiones:', t: String(e.conclusion || '') }
  ];

  // Prosa de otra herramienta (solo la descripción: es la larga). El largo ya
  // no cuenta: lo mide capacidadActa contra la celda real.
  var desc = textos[0].t.trim();
  if (desc) {
    var ia = expresionesIA(desc).map(function(x) { return x.frase.toLowerCase(); });
    var oraciones = desc.split(/[.!?]+\s+/).filter(function(s) { return s.trim().length > 3; });
    var ppo = desc.split(/\s+/).length / Math.max(1, oraciones.length);
    if (ia.length >= 3 || ppo > 35) {
      add('externo', 'descripcion', 'La descripción tiene ' +
        (ia.length >= 3 ? ia.length + ' expresiones de textos generados por IA («' + ia.slice(0, 3).join('», «') + '»)'
                        : 'oraciones de ' + Math.round(ppo) + ' palabras en promedio') + '.');
    }
  }

  textos.forEach(function(x) {
    if (!x.t.trim()) return;
    var n = _sinTildesRev(x.t);
    var citados = _comportamientosCitados(x.t, e.poligono);
    if (ninguno) {
      if (citados.length || /\b(configura|constituye)n?\b[^.]{0,80}\b(comportamiento|infraccion|contravencion)/.test(n)) {
        add('califica-sin-chip', x.donde, x.nombre + ' se califica un comportamiento, pero se marcó «No se evidencia infracción».');
      }
    } else if (indeterminado) {
      if (citados.length || /\b(configura|constituye)n?\b[^.]{0,80}\b(comportamiento|infraccion|contravencion)/.test(n)) {
        add('califica-sin-chip', x.donde, x.nombre + ' se califica un comportamiento, pero se marcó «No se pudo determinar».');
      }
      if (/no se evidencia (ninguna )?(infraccion|comportamiento)|no presenta(n)? (ninguna )?infraccion/.test(n)) {
        add('niega-con-chips', x.donde, x.nombre + ' dice que no hay infracción, pero se marcó «No se pudo determinar».');
      }
    } else if (marcados.length) {
      var sobran = citados.filter(function(c) { return marcados.indexOf(c) < 0; });
      if (sobran.length) {
        add('cita-no-marcada', x.donde, x.nombre + ' se cita ' + sobran.join(', ') + ', que no está marcado en la tipificación.');
      }
      if (/no se evidencia (ninguna )?(infraccion|comportamiento)|no presenta(n)? (ninguna )?infraccion/.test(n)) {
        add('niega-con-chips', x.donde, x.nombre + ' dice que no hay infracción, pero hay comportamientos marcados.');
      }
    }
    if (/afectacion publica|califica como/.test(n)) {
      add('categoria', x.donde, x.nombre + ' hay una calificación que no es de la ley («califica como», «afectación pública»).');
    }
    if (/\btraslad(ar|ado|ada|o|a)\b|dependencias? correspondientes?|autoridad(es)? competentes?/.test(n)) {
      add('traslado', x.donde, x.nombre + ' se traslada el caso a otra dependencia; la inspección es la que lo conoce.');
    }
    if (/\binfractor(a|es)?\b/.test(n)) {
      add('infractor', x.donde, x.nombre + ' dice «infractor»: es el propietario o el responsable.');
    }
    if (/exhaustiv|total ausencia|en su totalidad/.test(n)) {
      add('alcance', x.donde, x.nombre + ' hay un alcance absoluto («exhaustivo», «total ausencia»): decir qué se recorrió.');
    }
  });

  // Área: el texto trae m² y la casilla está vacía o en «No aplica».
  // 2026-10-26 (decisión del usuario): con «No se evidencia infracción» y
  // «¿Las obras requieren licencia?» = NO, el «No aplica» es lo coherente y
  // los m² son la medida de la obra: no se avisa. Con «No aplica», el aviso
  // es una pregunta con respuesta de un toque (`rapida`: el panel llena la
  // justificación con ese texto).
  var todo = textos[0].t + ' ' + textos[1].t;
  var mArea = /(\d+(?:[.,]\d+)?)\s*(m2|m²|mts2|metros cuadrados)/i.exec(todo);
  var areaVacia = !String(e.area || '').trim() && !e.areaNoMedible;
  var sinObraLicenciable = ninguno && String(e.requiereLicencia || '').trim().toUpperCase() === 'NO';
  if (mArea && areaVacia && !(e.areaNoAplica && sinObraLicenciable)) {
    var cifra = numeroAreaCO(mArea[1]) + ' m²';
    if (e.areaNoAplica) {
      add('area', 'area', 'El texto menciona ' + cifra + ' y el área en contravención dice «No aplica». ¿Esa área está en contravención?');
      senales[senales.length - 1].rapida = {
        no: 'No, es el área de la obra',
        si: 'Sí, ir a Tipificación y medidas',
        justificacion: 'Los ' + cifra + ' corresponden al área de la obra; no hay área en contravención.'
      };
    } else {
      add('area', 'area', 'El texto menciona ' + cifra + ' y el área en contravención está vacía: pon los m² en contravención o marca «No aplica».');
    }
  }

  // Comportamiento de construcción marcado y la descripción no dice dónde.
  if (desc && marcados.some(function(c) { return c.charAt(0) === 'A'; }) &&
      !/antejardin|retiro|fachada|cubierta|terraza|piso|nivel|interior|patio|voladizo|anden|lote|azotea|sotano|culata|muro|losa/.test(_sinTildesRev(desc))) {
    add('falta-donde', 'descripcion', 'La descripción no dice dónde está la intervención (antejardín, retiro, piso, fachada…).');
  }

  // ── Reglas de la fase 1 que admiten justificación ─────────────
  // (las que no, en reglasBloqueoActa). Ids con el número de la propuesta.
  var tiene = function(c) { return marcados.indexOf(c) >= 0; };
  var si = function(v) { return String(v || '').trim().toUpperCase() === 'SI'; };
  var num = function(v) { var m = String(v || '').replace(',', '.').match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };

  // R05: una reparación locativa no agrega área.
  if (si(e.repLocativa) && num(e.area) > 0 && !e.areaNoAplica) {
    add('R05', 'area', 'En Verificación documental, las obras no requieren licencia por ser reparación locativa, y en Tipificación hay ' + String(e.area).trim() + ' m² en contravención: una reparación locativa no agrega área.');
  }

  // R16: A1 y A4 juntos solo en un lote mixto: parte de la obra en suelo de
  // protección o retiro (A1) y parte en terreno apto sin licencia (A4). Pide
  // justificación (decisión del usuario 2026-10-21).
  if (tiene('A1') && tiene('A4')) {
    add('R16', 'descripcion', 'En Tipificación están A1 y A4: explica qué parte de la obra está en suelo de protección o retiro (A1) y qué parte está fuera, sin licencia (A4).');
  }

  // R06 / R06b: el antejardín, según lo que diga el texto. Construir o
  // intervenir ahí es A3; materiales o escombros, D13 (decisión del usuario).
  // Son aviso (no piden justificación) porque la detección por texto falla
  // 5 de 7 (fase 0); con el catálogo en el acta (fase 2) pasará a bloquear.
  var oracionesAnte = _sinTildesRev(todo).split(/[.;\n]+/).filter(function(s) {
    return /antejardin/.test(s) && !/intencion|pretende|quiere|planea|proyecta/.test(s);
  });
  var construyeAnte = oracionesAnte.some(function(s) {
    // Con límite de palabra: «antejardín» contiene «teja».
    return /\b(cubiertas?|cubrimiento|techos?|tejas?|cerramientos?|estructuras?|losas?|placas?|muros?|columnas?|ampliaci\w*|constru\w*|voladizos?|rejas?|pergolas?|marquesinas?)\b/.test(s);
  });
  var acopiaAnte = oracionesAnte.some(function(s) {
    return /\b(materiales|material|escombros?|acopi\w*|residuos?|arena|ladrillos?|cemento|agregados?)\b/.test(s);
  });
  // Vale también con «No se evidencia infracción»: es justo el caso del acta
  // 20261083449 (cubierta de 16 m² en el antejardín sin comportamiento).
  if (construyeAnte && !tiene('A3')) {
    add('R06', 'descripcion', 'El texto describe una construcción o intervención en el antejardín y no está marcado A3. Si solo hay materiales, es D13.');
  }
  if (acopiaAnte && !tiene('D13') && !(construyeAnte && tiene('A3'))) {
    add('R06b', 'descripcion', 'El texto describe materiales o escombros en el antejardín y no está marcado D13.');
  }

  // R07: lo construido en el antejardín no es licenciable: la medida es
  // restituir, nunca tramitar la licencia.
  if (tiene('A3')) {
    var recomiendaLicencia = _sinTildesRev(textos[1].t + '. ' + textos[0].t).split(/[.;\n]+/).some(function(s) {
      // «recomienda» y «recomendó»: la raíz cambia.
      return /recomi?end|\bdeben?\b|\bdebera/.test(s) && /(tramit|solicit|obten|gestion|legaliz)\w*[^.]{0,60}licencia/.test(s);
    });
    if (recomiendaLicencia) {
      add('R07', 'conclusion', 'Está marcado A3 y se recomienda tramitar licencia: el antejardín no es licenciable, la medida es restituirlo.');
    }
  }

  // R08: A4 es «sin licencia o caducada».
  if (si(e.licenciaAportada) && tiene('A4')) {
    add('R08', 'area', 'Se aportó licencia y está marcado A4 (sin licencia o caducada): confirma que está caducada o que no ampara lo construido.');
  }

  // R12: más pisos o destinaciones que los aprobados, sin A2.
  if (si(e.licenciaAportada) && !tiene('A2')) {
    var pa = num(e.alturaPisos), pl = num(e.pisos), da = num(e.destActuales), dl = num(e.destinaciones);
    if ((pa > pl) || (da > dl)) {
      add('R12', 'area', 'Hay ' + (pa > pl ? pa + ' pisos y la licencia aprueba ' + pl : da + ' destinaciones y la licencia aprueba ' + dl) +
        ', y no está marcado A2 (distinto a la licencia).');
    }
  }

  // R19 (2026-10-29, informe de 20231121436): el literal C es de usos del
  // suelo. Con usos actuales solo residenciales, un C9-C12 suele ser una
  // vivienda con más unidades que las aprobadas, que es A2: el formulario
  // llama «destinaciones» a las unidades y el chip C12 decía «Destinación no
  // autorizada».
  var usosAct = String(e.usos || '').split(/\s*[·,]\s*/).map(function(u) { return _sinTildesRev(u).trim(); }).filter(Boolean);
  var cUsos = marcados.filter(function(c) { return /^C(9|1[0-2])$/.test(c); });
  if (cUsos.length && usosAct.length && usosAct.every(function(u) { return /^(residencial|vivienda|habitacional)$/.test(u); })) {
    add('R19', 'area', 'Los usos actuales son solo residenciales y está marcado ' + cUsos.join(', ') +
      '. El literal C es de usos del suelo (comercio, taller, bodega…). Más unidades de vivienda que las aprobadas es A2 (distinto a la licencia).');
  }

  // R20 / aplaza (2026-10-29): la visita es la verificación (aplazamientosTexto).
  // Con licencia aportada, contrastarla era el trabajo de la visita: pide
  // justificación. Sin licencia, aviso.
  textos.forEach(function(x) {
    var ap = aplazamientosTexto(x.t);
    if (!ap.length) return;
    var frases = ap.slice(0, 3).map(function(a) { return '«' + a.frase.toLowerCase() + '»'; }).join(', ') +
      (ap.length > 3 ? ' y ' + (ap.length - 3) + ' más' : '');
    add(si(e.licenciaAportada) ? 'R20' : 'aplaza', x.donde, x.nombre + ' ' + frases + '. La visita es la verificación: ' +
      'si lo contaste o lo mediste, escríbelo como hecho («la licencia aprueba 11 destinaciones; se contaron 15»). ' +
      'Si algo no se pudo verificar, di qué y por qué.');
  });

  // R21 (2026-10-29): el texto cuenta otras destinaciones que la casilla
  // (caso 20231121436: la casilla decía 13 y el texto «quince (15)»). No
  // cuentan la cifra de la licencia, la diferencia ni las «adicionales».
  var dAct = num(e.destActuales);
  if (desc && !isNaN(dAct)) {
    var dLic = num(e.destinaciones);
    var rxDest = /(\d+)\)?\s+destinaciones\b(?!\s+(?:adicional|mas\b|de mas|nuevas|no contemplad))/g, mD, otras = [];
    var descN = _sinTildesRev(desc);
    while ((mD = rxDest.exec(descN))) {
      var nD = parseInt(mD[1], 10);
      if (nD !== dAct && nD !== dLic && nD !== Math.abs(dAct - dLic) && otras.indexOf(nD) < 0) otras.push(nD);
    }
    if (otras.length) {
      add('R21', 'descripcion', 'La descripción dice ' + otras.join(' y ') + ' destinaciones, y en Características de la edificación «N° destinaciones actuales» = ' + dAct + '.');
    }
  }

  // R13: uso no residencial sin C11/C12. La app no sabe si el uso está
  // permitido en el polígono: lo decide el inspector.
  var usosNo = (String(e.usos || '').match(/comercial|industrial|servicios/gi) || []);
  if (usosNo.length && !tiene('C11') && !tiene('C12')) {
    add('R13', 'area', 'Usos actuales: ' + usosNo.join(', ').toLowerCase() + '. Si el uso no está permitido en el polígono' +
      (e.poligono ? ' ' + e.poligono : '') + ', marca C11; si lo está, dilo en la justificación.');
  }

  // R14 / R15 (2026-10-15): «¿Las obras requieren licencia?» contra A4.
  var req = String(e.requiereLicencia || '').trim().toUpperCase();
  // Con A1 no se pide A4: la obra en suelo de protección o retiro no es
  // licenciable y A1 tiene prioridad; los dos juntos solo en lote mixto (R16).
  if (req === 'SI' && String(e.licenciaAportada || '').trim().toUpperCase() === 'NO' && !tiene('A4') && !tiene('A1')) {
    add('R14', 'area', 'En Verificación documental: «¿Las obras requieren licencia?» = SI y «¿Se aportó licencia?» = NO, pero en Tipificación no está marcado A4 (sin licencia o caducada).');
  }
  if (req === 'NO' && tiene('A4')) {
    add('R15', 'area', 'En Verificación documental, «¿Las obras requieren licencia?» = NO, y en Tipificación está marcado A4 (sin licencia): una de las dos sobra.');
  }
  return senales;
}

// ── Licencia: catálogo común visita ↔ informe F-GGO-43 ──────────
// La visita los guarda como un solo texto en la columna AL
// («TIPO Y MODALIDAD LICENCIA»): "Trámite 1, Trámite 2 — Modalidad 1".
// Antes era un select de una sola opción y lo que no casaba con las
// listas del informe se perdía en silencio en su prefill.
var LICENCIA_TRAMITES = [
  'Licencia de construcción',
  'Reconocimiento',
  'Modificación de licencia',
  'Licencia de urbanización',
  'Licencia de parcelación',
  'Licencia de subdivisión',
];
var LICENCIA_MODALIDADES = [
  'Obra nueva',
  'Ampliación',
  'Adecuación',
  'Modificación',
  'Restauración',
  'Reforzamiento estructural',
  'Demolición total',
  'Demolición parcial',
  'Cerramiento',
];

// Normaliza sin tildes ni mayúsculas para comparar contra el catálogo.
function _normCatalogoLic(s) {
  return (s || '').toString().toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')
    .replace(/\s+/g, ' ').trim();
}

// Texto de la columna AL → { tramites, modalidades, otros }. Lee también
// los valores viejos del select de una sola opción. Lo que no casa con el
// catálogo (p. ej. el viejo «Demolición» sin total/parcial) va a `otros`
// sin adivinar, para no perder datos al volver a guardar.
function parsearTipoModalidad(texto) {
  var out = { tramites: [], modalidades: [], otros: [] };
  var t = (texto || '').toString().trim();
  if (!t) return out;
  var tramNorm = {}, modNorm = {};
  LICENCIA_TRAMITES.forEach(function (o) { tramNorm[_normCatalogoLic(o)] = o; });
  LICENCIA_MODALIDADES.forEach(function (o) { modNorm[_normCatalogoLic(o)] = o; });
  t.split(/\s*—\s*|\s+-\s+/).forEach(function (lado) {
    lado.split(/\s*,\s*/).forEach(function (tok) {
      var n = _normCatalogoLic(tok);
      if (!n) return;
      var valor = tramNorm[n] || modNorm[n] || tok.trim();
      var grupo = tramNorm[n] ? out.tramites : (modNorm[n] ? out.modalidades : out.otros);
      // Sin duplicados: el mismo token no se apila dos veces.
      if (grupo.indexOf(valor) < 0) grupo.push(valor);
    });
  });
  return out;
}

// { tramites, modalidades, otros } → texto de la columna AL. Los `otros`
// van al final de las modalidades para no perder datos. Sin modalidades
// (ni otros) no va el «—».
function formatearTipoModalidad(o) {
  o = o || {};
  var mods = (o.modalidades || []).concat(o.otros || []);
  var partes = [];
  if ((o.tramites || []).length) partes.push(o.tramites.join(', '));
  if (mods.length) partes.push(mods.join(', '));
  return partes.join(' — ');
}

// ── ¿Las obras requieren licencia? (2026-10-15, decisión del usuario) ──
// Reemplaza en pantalla a «¿Reparación locativa?»: la reparación locativa es
// uno de los motivos del NO. Se guarda en REQUIERE_LICENCIA (SI | NO | NO SE
// PUDO DETERMINAR) y REQUIERE_LICENCIA_DETALLE (modalidades exigibles, motivos
// del NO separados por « | », o por qué no se pudo determinar). La columna AA
// (REPARACION LOCATIVA) se sigue llenando derivada: la leen el acta y R04/R05.
var REQUIERE_INDETERMINADO = 'NO SE PUDO DETERMINAR';
var MOTIVOS_NO_REQUIERE = [
  'Reparación locativa',
  'Mantenimiento o cambio de acabados',
  'Obra amparada por licencia o reconocimiento anterior',
  'Otro',
];

function _respuestaRequiere(v) {
  var n = _normCatalogoLic(v);
  if (n === 'si') return 'SI';
  if (n === 'no') return 'NO';
  if (n === _normCatalogoLic(REQUIERE_INDETERMINADO)) return REQUIERE_INDETERMINADO;
  return '';
}

// { respuesta, modalidades, motivos, otro, motivoIndeterminado } → columnas.
function formatearRequiereLicencia(o) {
  o = o || {};
  var r = _respuestaRequiere(o.respuesta);
  var detalle = '';
  if (r === 'SI') detalle = (o.modalidades || []).join(', ');
  else if (r === 'NO') {
    detalle = (o.motivos || []).map(function (m) {
      return m === 'Otro' ? 'Otro: ' + String(o.otro || '').trim() : m;
    }).join(' | ');
  } else if (r === REQUIERE_INDETERMINADO) detalle = String(o.motivoIndeterminado || '').trim();
  return { requiere: r, detalle: detalle };
}

// Columnas → objeto de pantalla. Visitas anteriores a la pregunta: con la
// AA vieja en SI se lee como NO por reparación locativa.
function parsearRequiereLicencia(requiere, detalle, repLocativaVieja) {
  var out = { respuesta: _respuestaRequiere(requiere), modalidades: [], motivos: [], otro: '', motivoIndeterminado: '' };
  var t = String(detalle || '').trim();
  if (out.respuesta === 'SI') {
    var modNorm = {};
    LICENCIA_MODALIDADES.forEach(function (m) { modNorm[_normCatalogoLic(m)] = m; });
    t.split(/\s*,\s*/).forEach(function (tok) {
      var m = modNorm[_normCatalogoLic(tok)];
      if (m && out.modalidades.indexOf(m) < 0) out.modalidades.push(m);
    });
  } else if (out.respuesta === 'NO') {
    t.split(/\s*\|\s*/).forEach(function (tok) {
      if (!tok) return;
      if (/^otro\s*:/i.test(tok)) {
        if (out.motivos.indexOf('Otro') < 0) out.motivos.push('Otro');
        out.otro = tok.replace(/^otro\s*:\s*/i, '');
        return;
      }
      var m = MOTIVOS_NO_REQUIERE.filter(function (x) { return _normCatalogoLic(x) === _normCatalogoLic(tok); })[0];
      if (m && out.motivos.indexOf(m) < 0) out.motivos.push(m);
    });
  } else if (out.respuesta === REQUIERE_INDETERMINADO) {
    out.motivoIndeterminado = t;
  } else if (_normCatalogoLic(repLocativaVieja) === 'si') {
    out.respuesta = 'NO';
    out.motivos = ['Reparación locativa'];
  }
  return out;
}

// Valor de la columna AA a partir de la respuesta.
function repLocativaDesdeRequiere(o) {
  if (!o || !o.respuesta) return '';
  return (o.respuesta === 'NO' && (o.motivos || []).indexOf('Reparación locativa') >= 0) ? 'SI' : 'NO';
}

// Faltantes para el acta/informe (nombres como los muestra el formulario).
function faltantesRequiereLicencia(o) {
  o = o || {};
  if (!o.respuesta) return ['¿Las obras requieren licencia?'];
  if (o.respuesta === 'SI' && !(o.modalidades || []).length) return ['Modalidad que exige la licencia'];
  if (o.respuesta === 'NO') {
    if (!(o.motivos || []).length) return ['Por qué no requieren licencia'];
    if (o.motivos.indexOf('Otro') >= 0 && !String(o.otro || '').trim()) return ['Motivo «Otro» de por qué no requieren licencia'];
  }
  if (o.respuesta === REQUIERE_INDETERMINADO && !String(o.motivoIndeterminado || '').trim()) {
    return ['Por qué no se pudo determinar si requieren licencia'];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════════
// Audiencias (TASK 3a) — lógica de la pestaña «Audiencias». Solo
// funciones puras sobre la respuesta de agendaAudiencias; la pantalla
// (audiencias.jsx) pinta. Pruebas: tests/audiencias-pantalla.test.js.
// ═══════════════════════════════════════════════════════════════

// Mayúsculas sin tildes, como _normNombre del backend: 'Juanse Pinzón' ===
// 'JUANSE PINZON'. Compara sustanciador, quien reservó y quién mira.
function normNombreAudiencias(n) {
  return String(n || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// '9:00AM' / '2:00 PM' / '14:00' → minutos desde 00:00 (para ordenar).
function horaAudienciasMin(hora) {
  var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(String(hora == null ? '' : hora).trim());
  if (!m) return 24 * 60;
  var h = parseInt(m[1], 10);
  if (m[3] && m[3].toUpperCase() === 'PM') h = (h % 12) + 12;
  return h * 60 + parseInt(m[2], 10);
}

// '9:00AM' → '9:00 a. m.', '2:00PM' → '2:00 p. m.' (como la maqueta v4).
function horaBonitaAudiencias(hora) {
  var min = horaAudienciasMin(hora);
  var m = /^(\d{1,2}):(\d{2})/.exec(String(hora == null ? '' : hora).trim());
  if (!m) return String(hora || '').trim();
  var h24 = Math.floor(min / 60);
  var ap = h24 < 12 ? 'a. m.' : 'p. m.';
  var h12 = h24 % 12 || 12;
  return h12 + ':' + m[2] + ' ' + ap;
}

// Cupos agrupados por día (orden fecha + hora) y, dentro del día, por
// sustanciador. `cupos` viene tal cual de agendaAudiencias.
function agruparAudienciasPorDia(cupos) {
  var porFecha = {};
  var orden = [];
  (cupos || []).forEach(function (c) {
    var f = String(c.fecha || '').trim();
    if (!f) return;
    if (!porFecha[f]) { porFecha[f] = []; orden.push(f); }
    porFecha[f].push(c);
  });
  orden.sort(function (a, b) {
    var da = parsearFecha(a), db = parsearFecha(b);
    return (da && db ? da - db : a.localeCompare(b));
  });
  return orden.map(function (f) {
    var delDia = porFecha[f].slice().sort(function (a, b) {
      return horaAudienciasMin(a.hora) - horaAudienciasMin(b.hora);
    });
    return { fecha: f, cupos: delDia };
  });
}

function agruparAudienciasPorSustanciador(cuposDia) {
  var grupos = {};
  var orden = [];
  (cuposDia || []).forEach(function (c) {
    var s = String(c.sustanciador || '').trim() || 'SIN SUSTANCIADOR';
    if (!grupos[s]) { grupos[s] = []; orden.push(s); }
    grupos[s].push(c);
  });
  return orden.map(function (s) { return { sustanciador: s, cupos: grupos[s] }; });
}

// El próximo día con cupos desde `hoy` (Date). «Hoy» muestra este día cuando
// hoy no tiene: jueves y viernes no hay audiencias del bloque de Control
// Urbano, y nada se reubica en «hoy» (misma regla que la Semana de visitas).
function proximoDiaAudiencias(dias, hoy) {
  var h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  for (var i = 0; i < (dias || []).length; i++) {
    var d = parsearFecha(dias[i].fecha);
    if (d && d >= h) return dias[i];
  }
  return null;
}

// Filtro de «Lista»: solo citas (RESERVADO), de hoy en adelante salvo
// incluirPasadas, con búsqueda por nombre/radicado/orden/expediente/documento
// y, para el inspector, solo las suyas (deQuien normalizado).
function filtrarListaAudiencias(cupos, opts) {
  opts = opts || {};
  var q = String(opts.q || '').trim().toLowerCase();
  var hoyT = String(opts.hoy || '');
  return (cupos || []).filter(function (c) {
    if (c.estado !== 'RESERVADO') return false;
    if (!opts.incluirPasadas && hoyT && parsearFecha(c.fecha) && parsearFecha(c.fecha) < parsearFecha(hoyT)) return false;
    if (opts.deQuien && normNombreAudiencias(c.reservadoPor) !== opts.deQuien) return false;
    if (q) {
      var en = [c.citado, c.radicado, c.ordenPolicia, c.expediente, c.documentoCitado].some(function (v) {
        return v && String(v).toLowerCase().indexOf(q) >= 0;
      });
      if (!en) return false;
    }
    return true;
  }).sort(function (a, b) {
    var da = parsearFecha(a.fecha), db = parsearFecha(b.fecha);
    if (da && db && da - db) return da - db;
    return horaAudienciasMin(a.hora) - horaAudienciasMin(b.hora);
  });
}

// ── «Pedir cita» (TASK 3b, 2026-10-21) ──
// La cita se pide en campo por radicado o por N° de Orden de Policía.

// N° de orden comparable, como el backend: '2026-09-015' = '2026-9-15'.
function normOrdenAudiencias(v) {
  var t = String(v == null ? '' : v).trim();
  if (!/^\d{4}-\d{1,3}-\d{1,4}$/.test(t)) return '';
  return t.split('-').map(function (x) { return String(parseInt(x, 10)); }).join('-');
}

// ¿La cita `c` es del caso {radicado, ordenPolicia}?
function mismoCasoAudiencias(c, caso) {
  if (!c || !caso) return false;
  var ra = claveRadicado(c.radicado), rb = claveRadicado(caso.radicado);
  if (ra && rb && ra === rb) return true;
  var oa = normOrdenAudiencias(c.ordenPolicia), ob = normOrdenAudiencias(caso.ordenPolicia);
  return !!(oa && ob && oa === ob);
}

// Las `n` primeras opciones de cupo, tal como vienen (por fecha y hora, y en la
// misma hora primero el sustanciador con menos citas del mes). Cada cupo es una
// opción: el inspector elige también con quién (decisión del usuario 2026-10-22).
function opcionesPedirCita(cupos, n) {
  return (cupos || []).slice(0, n || 5);
}

// Caso de una fila de BD VISITAS para la hoja «Pedir cita».
function casoDeVisitaAudiencias(f) {
  var orden = ordenPoliciaDe(f);
  return {
    radicado: String(f['RADICADO'] || '').trim(),
    ordenPolicia: normOrdenAudiencias(orden) ? orden : '',
    direccion: direccionVisible(String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim()),
    barrio: String(f['BARRIO/VEREDA'] || f['BARRIO'] || '').trim(),
    expediente: expedienteDe(f)
  };
}

// Visitas del inspector con fecha de hoy (asignadas o iniciadas): lo primero
// que ofrece «Pedir cita». Misma regla del diligenciador que la Semana.
function casosAgendaHoyAudiencias(filas, miNombre, hoy) {
  var h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  return (filas || []).filter(function (f) {
    var e = _normEstadoVisitaBD(f['ESTADO VISITA'] || '');
    if (e !== 'ASIGNADO' && e !== 'INICIADO') return false;
    if (!_esVisitaDe(f, miNombre)) return false;
    var d = fechaAgendaVisita(f);
    return !!d && new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() === h;
  }).map(casoDeVisitaAudiencias);
}

// Sugerencias mientras se escribe el radicado o el N° de orden (máx. `max`).
function sugerirCasosAudiencias(filas, texto, max) {
  var q = String(texto || '').trim();
  if (q.length < 3) return [];
  var qRad = claveRadicado(q), qOrd = normOrdenAudiencias(q);
  var vistos = {}, out = [];
  (filas || []).forEach(function (f) {
    if (out.length >= (max || 5)) return;
    var c = casoDeVisitaAudiencias(f);
    var porRad = c.radicado && claveRadicado(c.radicado).indexOf(qRad) >= 0;
    var porOrd = qOrd ? normOrdenAudiencias(c.ordenPolicia) === qOrd
      : (c.ordenPolicia && c.ordenPolicia.indexOf(q) >= 0);
    if (!porRad && !porOrd) return;
    var k = claveRadicado(c.radicado) || normOrdenAudiencias(c.ordenPolicia);
    if (vistos[k]) return;
    vistos[k] = 1;
    out.push(c);
  });
  return out;
}

// La cita vigente (de hoy en adelante) del caso, o null.
function citaVigenteDelCaso(cupos, caso, hoyTxt) {
  var h = parsearFecha(hoyTxt);
  var vig = (cupos || []).filter(function (c) {
    var f = parsearFecha(c.fecha);
    return c.estado === 'RESERVADO' && f && (!h || f >= h) && mismoCasoAudiencias(c, caso);
  }).sort(function (a, b) { return parsearFecha(a.fecha) - parsearFecha(b.fecha); });
  return vig[0] || null;
}

// «Pedidas hoy»: lo que reservaron hoy todos los inspectores (RESERVADO_EN
// empieza por la fecha de hoy), la más reciente primero.
function pedidasHoyAudiencias(cupos, hoyTxt) {
  return (cupos || []).filter(function (c) {
    return c.estado === 'RESERVADO' && String(c.reservadoEn || '').indexOf(hoyTxt) === 0;
  }).sort(function (a, b) { return String(b.reservadoEn).localeCompare(String(a.reservadoEn)); });
}

// ── Vista «Hoy» (2026-10-25) ─────────────────────────────────────
// Las audiencias citadas de UN día llegan de dos fuentes: los cupos
// RESERVADO del bloque nuevo (traen sustanciador) y las citas viejas
// anotadas a mano en FECHA CITACION de BD VISITAS (no tienen
// sustanciador y no se inventa: varios sustanciadores comparten las
// 9:00 y las 2:00). Una visita en las dos fuentes sale una sola vez,
// la del bloque.

// Cupos RESERVADO que pasan los filtros de la vista (soloDe = nombre de
// usuario como «Mis citas»; sustanciador = norm del chip elegido).
function _cuposBloqueFiltrados(cupos, opts) {
  var solo = opts && opts.soloDe ? normNombreAudiencias(opts.soloDe) : '';
  var sus = (opts && opts.sustanciador) || '';
  return (cupos || []).filter(function (c) {
    if (c.estado !== 'RESERVADO') return false;
    if (sus && normNombreAudiencias(c.sustanciador) !== sus) return false;
    if (solo && normNombreAudiencias(c.reservadoPor) !== solo) return false;
    return true;
  });
}

// ¿El cupo `c` y la fila `f` son la misma visita? Por ID_VISITA o porque
// son el mismo caso (radicado u orden, como mismoCasoAudiencias).
function _mismaCitaBloqueVisita(c, f) {
  var idv = String((f && f['ID_VISITA']) || '').trim();
  if (idv && String(c.idVisita || '').trim() === idv) return true;
  return mismoCasoAudiencias(c, casoDeVisitaAudiencias(f));
}

// Citas viejas de `filas` (todas las fechas): solo INICIADO/COMPLETADO con
// FECHA CITACION legible. Celdas como «No se deja citación» no traen fecha
// (parsearFecha devuelve null) y se ignoran. La hora va normalizada
// ('2:00pm') para que ordenar y pintar no dependan del formato de la celda.
function _citasVisitaViejas(filas, opts) {
  // Con un sustanciador elegido las viejas no salen: no tienen y no se deduce.
  if (opts && opts.sustanciador) return [];
  var nombre = (opts && opts.soloDe) || '';
  return (filas || []).filter(function (f) {
    var e = _normEstadoVisitaBD(f['ESTADO VISITA'] || '');
    if (e !== 'INICIADO' && e !== 'COMPLETADO') return false;
    if (nombre && !_esVisitaDe(f, nombre)) return false;
    return !!parsearFecha(f['FECHA CITACION'] || '');
  }).map(function (f) {
    var t = String(f['FECHA CITACION'] || '');
    var sep = t.indexOf(' · ');
    var caso = casoDeVisitaAudiencias(f);
    return {
      fechaTxt: formatearFecha(parsearFecha(t)),
      hora: sep === -1 ? '' : t.slice(sep + 3).replace(/[\s.]/g, ''),
      citado: String(f['CITADO'] || '').trim() ||
        String(f['NOMBRE PERSONA ATIENDE'] || '').trim().replace(/^no se atiende.*$/i, ''),
      caso: caso,
      direccion: caso.direccion,
      inspector: primerVisitador(visitadoresBD(f)),
      sustanciador: '',
      fuente: 'visita',
      fila: f
    };
  });
}

// Audiencias citadas de `fechaTxt` ('DD/MM/YYYY'), ordenadas por hora (sin
// hora al final). Del bloque traen sustanciador; de la visita, no. Pruebas:
// tests/audiencias-hoy.test.js.
function audienciasDelDia(filas, cupos, fechaTxt, opts) {
  var delBloque = _cuposBloqueFiltrados(cupos, opts).filter(function (c) {
    return c.fecha === fechaTxt;
  });
  var viejas = _citasVisitaViejas(filas, opts).filter(function (v) {
    return v.fechaTxt === fechaTxt &&
      // Una visita que también tiene cupo ese día sale una sola vez: la del bloque.
      !delBloque.some(function (c) { return _mismaCitaBloqueVisita(c, v.fila); });
  });
  return delBloque.map(function (c) {
    return {
      hora: String(c.hora || ''), minutos: horaAudienciasMin(c.hora), citado: c.citado,
      caso: { radicado: c.radicado, ordenPolicia: c.ordenPolicia, expediente: c.expediente },
      direccion: c.direccion, inspector: c.reservadoPor, sustanciador: c.sustanciador,
      fuente: 'bloque', cupo: c
    };
  }).concat(viejas.map(function (v) {
    return Object.assign({}, v, { minutos: v.hora ? horaAudienciasMin(v.hora) : null });
  })).sort(function (a, b) {
    return (a.minutos == null ? 24 * 60 : a.minutos) - (b.minutos == null ? 24 * 60 : b.minutos);
  });
}

// Fechas 'DD/MM/YYYY' con al menos una cita (mismos filtros), de `desdeTxt`
// en adelante y ordenadas. Para las flechas de «Hoy» y su estado vacío.
function diasConAudiencias(filas, cupos, desdeTxt, opts) {
  var desde = parsearFecha(desdeTxt);
  var fechas = {};
  _cuposBloqueFiltrados(cupos, opts).forEach(function (c) {
    var f = String(c.fecha || '').trim();
    if (f) fechas[formatearFecha(f)] = 1;
  });
  _citasVisitaViejas(filas, opts).forEach(function (v) { fechas[v.fechaTxt] = 1; });
  return Object.keys(fechas).filter(function (f) {
    var d = parsearFecha(f);
    return !!d && (!desde || d >= desde);
  }).sort(function (a, b) { return parsearFecha(a) - parsearFecha(b); });
}

// Vista «Agenda» de Audiencias (arquitectura 2026-10-27, punto 5): une «Hoy» y
// «Programadas». De `desdeTxt` en adelante, un grupo por día con audiencias
// (cupos del bloque + FECHA CITACION de las visitas, mismas reglas de
// audienciasDelDia: una visita en las dos fuentes sale una vez). Si hoy no
// hay, el primer grupo es el siguiente día con audiencias.
function agendaAudienciasDias(filas, cupos, desdeTxt, opts) {
  return diasConAudiencias(filas, cupos, desdeTxt, opts).map(function (f) {
    return { fecha: f, citas: audienciasDelDia(filas, cupos, f, opts) };
  }).filter(function (g) { return g.citas.length > 0; });
}

// ── Orden del día en la Semana (2026-10-22) ──────────────────────
// ORDEN_DIA = 'DD/MM/YYYY#n': el orden que el admin o el inspector le dieron a
// la visita ese día. Solo vale para ese día: si la visita cambia de día, se ignora.
function ordenDiaDe(f, fechaTxt) {
  var m = /^(\d{2}\/\d{2}\/\d{4})#(\d+)$/.exec(String((f && f['ORDEN_DIA']) || '').trim());
  return m && m[1] === fechaTxt ? parseInt(m[2], 10) : null;
}

function _puntoVisitaSemana(f) {
  var lat = normalizarCoord(f['LATITUD'], 'lat'), lon = normalizarCoord(f['LONGITUD'], 'lon');
  if (lat != null && lon != null) return { lat: lat, lon: lon };
  return puntoDesdeTextoCoord(String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '')) || null;
}

// Orden en que se muestran (y se recorren) las visitas de un día: primero las
// ordenadas a mano, en su orden; las demás, por el recorrido más corto desde la
// Alcaldía (decisión del usuario: sin ordenar, las tarjetas van como la ruta sugerida).
function ordenarVisitasDia(lista, fechaTxt) {
  var manual = [], resto = [];
  (lista || []).forEach(function (f) { (ordenDiaDe(f, fechaTxt) != null ? manual : resto).push(f); });
  manual.sort(function (a, b) { return ordenDiaDe(a, fechaTxt) - ordenDiaDe(b, fechaTxt); });
  var ruta = rutaMasCortaDesde(resto.map(function (f) { return { f: f, punto: _puntoVisitaSemana(f) }; }))
    .map(function (p) { return p.f; });
  return manual.concat(ruta);
}

// Exportar al scope global (navegador) o CommonJS (Node, tests)
// ── Tarjeta única de visita (arquitectura 2026-10-27, decisión 1) ──
// Lo que dice cualquier tarjeta de visita de la app, siempre en el mismo
// orden: estado y tiempo → dirección → radicado · barrio · comuna → lo que
// falta → una acción. TarjetaVisita (visita-card.jsx) solo pinta.
//   opts.estado → estado ya resuelto por la pantalla (Buscar: CERRADO)
//   opts.veTodo → con el nombre corto del inspector (quien ve a todo el equipo)
//   opts.puede  → false si no puede diligenciarla: entonces no hay acción
//   opts.hoy    → fecha de referencia (pruebas)
// Los días de asignada e iniciada son hábiles (los mismos de las alertas); el
// texto dice «días» a secas (decisión 2026-10-02).
var _TV_DEMORA = 5;
var _TV_ESTADO_TXT = { PENDIENTE: 'Pendiente', ASIGNADO: 'Asignada', INICIADO: 'Iniciada',
  COMPLETADO: 'Completada', CERRADO: 'Cerrada sin visita' };

// "MAURICIO RESTREPO GOMEZ" → "Mauricio R.": en la tarjeta no cabe el nombre
// completo y el apellido inicial basta para distinguir a dos.
function nombreCortoVisita(f) {
  var n = titleCaseNombre(primerVisitador(visitadoresBD(f)));
  if (!n) return '';
  var p = n.split(/\s+/);
  return p.length > 1 ? p[0] + ' ' + p[1].charAt(0) + '.' : p[0];
}

// «Hato Viejo · C5»; «Rural» en vereda (la dirección ya dice cuál).
function ubicacionCortaVisita(f) {
  var dir = String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim();
  var barrio = String(f['BARRIO/VEREDA'] || f['BARRIO'] || '').trim();
  var comuna = String(f['COMUNA'] || '').trim();
  if (/rural/i.test(comuna) || (!barrio && /^v(da|ereda)\b/i.test(dir))) return 'Rural';
  return [barrio, /^\d+$/.test(comuna) ? 'C' + comuna : comuna].filter(Boolean).join(' · ');
}

// Un solo reloj en toda la app (2026-10-28, decisión del usuario): los días
// cuentan desde la asignación y el texto dice qué cuentan, igual que Atención
// en Inicio («136 días sin iniciar»). Antes la pendiente decía «radicada hace
// 278 días» y Atención «136 días sin iniciar» para la misma visita.
function _tvDias(n, que) {
  if (n == null) return '';
  return n === 0 ? 'hoy' : n + (n === 1 ? ' día ' : ' días ') + que;
}

function tarjetaVisita(f, opts) {
  opts = opts || {};
  var ref = opts.hoy instanceof Date ? opts.hoy : new Date();
  var estado = opts.estado || _normEstadoVisitaBD(f['ESTADO VISITA'] || f[13] || '') || 'PENDIENTE';
  var dir = String(f['DIRECCION INFRACCION'] || f['DIRECCION'] || '').trim();
  var t = { estado: estado, estadoTxt: _TV_ESTADO_TXT[estado] || estado, tiempo: '', demora: false,
    dir: dir || 'Sin dirección', dirVisible: dir ? direccionVisible(dir) : 'Sin dirección',
    ident: identificadorVisita(f), ubic: ubicacionCortaVisita(f), falta: [], accion: null,
    mapa: estado === 'ASIGNADO' || estado === 'INICIADO',
    inspector: opts.veTodo ? nombreCortoVisita(f) : '',
    radicada: formatearFecha(f['FECHA RADICADO'] || '') };
  var n = null;
  if (estado === 'PENDIENTE') {
    // Sin asignación no hay reloj: la antigüedad de la PQR la dice su prioridad.
    n = diasSinIniciar(f, ref);
    t.tiempo = n == null ? 'sin asignar' : _tvDias(n, 'sin iniciar');
    t.demora = n != null && n >= _TV_DEMORA;
    // Pendiente que ya tiene inspector (filas viejas, o «Iniciar» sin asignar
    // en Buscar): para él es una visita por hacer, como una asignada.
    if (visitadoresBD(f).length) { t.accion = 'Iniciar'; t.mapa = true; }
  } else if (estado === 'ASIGNADO') {
    n = diasSinIniciar(f, ref);
    t.tiempo = _tvDias(n, 'sin iniciar');
    t.demora = n != null && n >= _TV_DEMORA;
    t.accion = 'Iniciar';
  } else if (estado === 'INICIADO') {
    n = diasSinCompletar(f, ref);
    t.tiempo = _tvDias(n, 'sin completar');
    t.demora = n != null && n >= _TV_DEMORA;
    t.falta = entregablesFaltantes(f);
    t.accion = 'Continuar';
  } else if (estado === 'COMPLETADO') {
    var fv = parsearFecha(f['FECHA DE VISITA'] || '');
    if (fv) t.tiempo = fv.getDate() + ' ' + _MESES_ES[fv.getMonth()].slice(0, 3);
    // Sin «Falta» en la completada: las de V2 tienen el acta en papel y en
    // Buscar todas salían en rojo. Los documentos se ven en la ficha.
  }
  if (opts.puede === false) t.accion = null;
  return t;
}

// ── Mis visitas: lo pendiente (arquitectura 2026-10-27, decisión 3) ──
// A partir de los grupos de agruparMisVisitas:
//   siguiente   la primera visita asignada para HOY, en el orden de la ruta
//               del día (ordenarVisitasDia: orden a mano o recorrido desde la
//               Alcaldía), con su puesto («1 de 3»). Sin visitas hoy, null.
//   lista       el resto de lo propio por hacer y en curso, de lo más
//               atrasado a lo más reciente (sin la siguiente)
//   acompanas   las asignadas en las que figura pero que diligencia otro
// «Propia» = el primer nombre de VISITADOR(ES) es el suyo (regla del
// diligenciador); por nombre y no por rol, para que el admin también vea aparte
// lo que acompaña.
function pendientesMisVisitas(grupos, nombre, hoy) {
  var ref = hoy instanceof Date ? hoy : (parsearFecha(hoy) || new Date());
  var yo = String(nombre || '').toUpperCase().trim();
  var propia = function (x) {
    var p = primerVisitador(visitadoresBD(x.f)).toUpperCase();
    return !p || p === yo;
  };
  var hacer = ((grupos && grupos.hacer) || []).map(function (x) { return Object.assign({ tipo: 'hacer' }, x); });
  var curso = ((grupos && grupos.curso) || []).map(function (x) { return Object.assign({ tipo: 'curso' }, x); });
  var mismoDia = function (d) {
    return d && d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
  };
  var deHoy = hacer.filter(function (x) {
    return propia(x) && mismoDia(parsearFecha(x.f['FECHA ASIGNACION VISITA'] || ''));
  });
  var ruta = ordenarVisitasDia(deHoy.map(function (x) { return x.f; }), formatearFecha(ref));
  var siguiente = ruta.length
    ? { x: deHoy.filter(function (x) { return x.f === ruta[0]; })[0], n: 1, de: ruta.length }
    : null;
  var lista = hacer.concat(curso).filter(function (x) {
    return propia(x) && !(siguiente && x.f === siguiente.x.f);
  });
  lista.sort(function (a, b) { return (b.dias == null ? -1 : b.dias) - (a.dias == null ? -1 : a.dias); });
  return {
    siguiente: siguiente,
    lista: lista,
    acompanas: hacer.concat(curso).filter(function (x) { return !propia(x); }),
  };
}

// La cita de una visita para su tarjeta: «Audiencia mié 28 · 9:00 a. m.»,
// «Audiencia mañana · …», «Audiencia hoy · …». Solo de hoy en adelante;
// urgente (en rojo) a ≤3 días hábiles, la regla de las alertas. null si no hay.
var _DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function citaVisitaTexto(f, hoy) {
  var raw = String((f && f['FECHA CITACION']) || '').trim();
  var d = parsearFecha(raw.split(' · ')[0]);
  if (!d) return null;
  var ref = hoy instanceof Date ? hoy : (parsearFecha(hoy) || new Date());
  var base = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  var dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var dc = Math.round((dia - base) / 86400000);
  if (dc < 0) return null;
  var cuando = dc === 0 ? 'hoy' : dc === 1 ? 'mañana' : _DIAS_CORTOS[dia.getDay()] + ' ' + dia.getDate();
  var hora = raw.split(' · ')[1] || '';
  var habiles = _diasHabilesEntre(base, dia);
  return {
    texto: 'Audiencia ' + cuando + (hora ? ' · ' + hora : ''),
    urgente: habiles != null && habiles <= DIAS_ALERTA_AUDIENCIA,
  };
}

// ── Inicio: Atención (arquitectura 2026-10-27, decisión 2) ──
// Una sola lista, una tarjeta por visita: primero las audiencias a ≤3 días
// hábiles (urgentes, por cercanía) y después lo que lleva ≥5 días hábiles sin
// iniciar o sin completar, de lo más atrasado a lo menos. Reemplaza a las
// Alertas con chips, la franja «N urgentes» y «Audiencias de la semana», que
// repetían la misma visita hasta tres veces.
//   opts.veTodo    admin/supervisor: todo el equipo (o `inspector`, si eligió uno)
//   opts.miNombre  sin veTodo: regla del diligenciador y solo lo ya entregado
//   opts.inspector filtro de inspector de la Semana
// Cada ítem: { f, cat: 'urgente'|'sinIniciar'|'sinCompletar', dias, motivo,
// irSemana } — `motivo` es lo que dice la tarjeta en lugar del tiempo.
var DIAS_DEMORA_ATENCION = 5;
function atencionInicio(datos, opts) {
  opts = opts || {};
  var ref = opts.hoy instanceof Date ? opts.hoy : new Date();
  var yo = String(opts.miNombre || '').toUpperCase();
  var entra = function (f) {
    if (opts.veTodo) return !opts.inspector || _esVisitaDe(f, opts.inspector);
    return _esVisitaDe(f, yo) && asignadaVisibleHoy(f, ref);
  };
  var vistas = {};
  var clave = function (f) { return f._idx != null ? 'i' + f._idx : 'r' + (f['RADICADO'] || ''); };
  var urgentes = audienciasProximas(datos, opts.veTodo ? (opts.inspector || '') : yo, ref)
    .filter(function (a) { return entra(a.f); })
    .map(function (a) {
      vistas[clave(a.f)] = true;
      var c = citaVisitaTexto(a.f, ref);
      return { f: a.f, cat: 'urgente', dias: a.dias, motivo: c ? c.texto : 'Audiencia próxima',
        irSemana: a.f['FECHA DE VISITA'] || a.f['FECHA ASIGNACION VISITA'] || '' };
    });
  var demoras = [];
  (datos || []).forEach(function (f) {
    if (!f || vistas[clave(f)] || !entra(f)) return;
    var si = diasSinIniciar(f, ref);
    if (si != null && si >= DIAS_DEMORA_ATENCION) {
      demoras.push({ f: f, cat: 'sinIniciar', dias: si, motivo: si + ' días sin iniciar',
        irSemana: f['FECHA ASIGNACION VISITA'] || '' });
      return;
    }
    var sc = diasSinCompletar(f, ref);
    if (sc != null && sc >= DIAS_DEMORA_ATENCION) {
      demoras.push({ f: f, cat: 'sinCompletar', dias: sc, motivo: sc + ' días sin completar',
        irSemana: f['FECHA DE VISITA'] || f['FECHA ASIGNACION VISITA'] || '' });
    }
  });
  demoras.sort(function (a, b) { return b.dias - a.dias; });
  return urgentes.concat(demoras);
}

// ¿Le sale la pestaña «Mis visitas» a un admin o supervisor? Solo si figura
// como inspector en alguna visita por hacer o en curso, o en una completada
// este año (arquitectura 2026-10-27, punto 9): antes un supervisor la veía
// siempre vacía. Misma regla de pertenencia que Mis visitas (_esVisitaDe).
function tieneVisitasPropias(filas, nombre, hoy) {
  if (!String(nombre || '').trim()) return false;
  var anio = (hoy instanceof Date ? hoy : new Date()).getFullYear();
  return (filas || []).some(function (f) {
    if (!f || !visitadoresBD(f) || !_esVisitaDe(f, nombre)) return false;
    var e = _normEstadoVisitaBD(f['ESTADO VISITA'] || f[13] || '');
    if (e === 'PENDIENTE' || e === 'ASIGNADO' || e === 'INICIADO') return true;
    if (e !== 'COMPLETADO') return false;
    var d = parsearFecha(f['FECHA DE VISITA'] || '');
    return !!d && d.getFullYear() === anio;
  });
}

var _cuUtilsExports = {
  tieneVisitasPropias: tieneVisitasPropias,
  pendientesMisVisitas: pendientesMisVisitas,
  atencionInicio: atencionInicio,
  agendaAudienciasDias: agendaAudienciasDias,
  citaVisitaTexto: citaVisitaTexto,
  tarjetaVisita: tarjetaVisita,
  nombreCortoVisita: nombreCortoVisita,
  ubicacionCortaVisita: ubicacionCortaVisita,
  ART135_LITERALES: ART135_LITERALES,
  ART135_TEXTO: ART135_TEXTO,
  // Audiencias (TASK 3a)
  normNombreAudiencias: normNombreAudiencias,
  horaAudienciasMin: horaAudienciasMin,
  horaBonitaAudiencias: horaBonitaAudiencias,
  agruparAudienciasPorDia: agruparAudienciasPorDia,
  agruparAudienciasPorSustanciador: agruparAudienciasPorSustanciador,
  proximoDiaAudiencias: proximoDiaAudiencias,
  filtrarListaAudiencias: filtrarListaAudiencias,
  // Pedir cita (TASK 3b)
  normOrdenAudiencias: normOrdenAudiencias,
  mismoCasoAudiencias: mismoCasoAudiencias,
  opcionesPedirCita: opcionesPedirCita,
  casosAgendaHoyAudiencias: casosAgendaHoyAudiencias,
  sugerirCasosAudiencias: sugerirCasosAudiencias,
  citaVigenteDelCaso: citaVigenteDelCaso,
  pedidasHoyAudiencias: pedidasHoyAudiencias,
  // Vista «Hoy»
  audienciasDelDia: audienciasDelDia,
  diasConAudiencias: diasConAudiencias,
  expedienteDe: expedienteDe,
  identificadorVisita: identificadorVisita,
  citaArt135: citaArt135,
  textoLeyChip: textoLeyChip,
  comportamientosParaIA: comportamientosParaIA,
  reglasBloqueoActa: reglasBloqueoActa,
  camposRevision: camposRevision,
  huellaRevision: huellaRevision,
  partesRevision: partesRevision,
  huellaParaBD: huellaParaBD,
  partesCambiadas: partesCambiadas,
  _normTextoSuave: _normTextoSuave,
  leerSelloRevision: leerSelloRevision,
  revisionVigente: revisionVigente,
  revisarTextoLocal: revisarTextoLocal,
  SENALES_DE_FORMA: SENALES_DE_FORMA,
  ACTA_CAPACIDAD: ACTA_CAPACIDAD,
  renglonesActa: renglonesActa,
  capacidadActa: capacidadActa,
  caracteresParaActa: caracteresParaActa,
  documentoVisita: documentoVisita,
  resumenCambios: resumenCambios,
  cambioMenorRevision: cambioMenorRevision,
  propuestaAporta: propuestaAporta,
  topeSituacionRevision: topeSituacionRevision,
  numeroAreaCO: numeroAreaCO,
  marcadoresPendientes: marcadoresPendientes,
  SALVEDADES_REVISION: SALVEDADES_REVISION,
  EXPRESIONES_IA: EXPRESIONES_IA,
  expresionesIA: expresionesIA,
  aplazamientosTexto: aplazamientosTexto,
  AGENDA_OFICINA: AGENDA_OFICINA,
  nivelPrioridad: nivelPrioridad,
  motivoPrioridad: motivoPrioridad,
  ordenarRuta: ordenarRuta,
  ordenDiaDe: ordenDiaDe,
  ordenarVisitasDia: ordenarVisitasDia,
  rutaMasCortaDesde: rutaMasCortaDesde,
  linksRutaMaps: linksRutaMaps,
  armarBorradorAgenda: armarBorradorAgenda,
  moverDiaHabil: moverDiaHabil,
  diaInicialAgenda: diaInicialAgenda,
  fechaLargaAgenda: fechaLargaAgenda,
  visitasDelDia: visitasDelDia,
  ordenPoliciaDe: ordenPoliciaDe,
  idArchivoDrive: idArchivoDrive,
  entregablesFaltantes: entregablesFaltantes,
  agruparMisVisitas: agruparMisVisitas,
  mesesMisVisitas: mesesMisVisitas,
  recorridoVisita: recorridoVisita,
  completadasMesesVisita: completadasMesesVisita,
  audienciasProximas: audienciasProximas,
  DIAS_ALERTA_AUDIENCIA: DIAS_ALERTA_AUDIENCIA,
  claveBarrio: claveBarrio,
  UMBRAL_REVISAR_BARRIO_M: UMBRAL_REVISAR_BARRIO_M,
  ALIAS_BARRIO_POT: ALIAS_BARRIO_POT,
  NOMBRES_BARRIO_AMBIGUOS: NOMBRES_BARRIO_AMBIGUOS,
  claveBarrioPot: claveBarrioPot,
  crearIndiceBarriosPot: crearIndiceBarriosPot,
  barrioPotPorPunto: barrioPotPorPunto,
  barrioPotPorNombre: barrioPotPorNombre,
  distanciaABarrioPotM: distanciaABarrioPotM,
  barrioPotDe: barrioPotDe,
  // Buscar E5: lógica pura del rediseño
  BUSCAR_ESTADOS: BUSCAR_ESTADOS,
  BUSCAR_ESTADOS_VIVOS: BUSCAR_ESTADOS_VIVOS,
  estadoBuscarDe: estadoBuscarDe,
  motivoCierreBuscar: motivoCierreBuscar,
  esNoCompetenciaFila: esNoCompetenciaFila,
  BUSCAR_FALTAS: BUSCAR_FALTAS,
  BUSCAR_FALTAS_DESDE_ANIO: BUSCAR_FALTAS_DESDE_ANIO,
  BUSCAR_GRUPOS: BUSCAR_GRUPOS,
  prioridadClaveBuscar: prioridadClaveBuscar,
  prepararCasoBuscar: prepararCasoBuscar,
  filtrosBuscarVacios: filtrosBuscarVacios,
  normEstadosBuscar: normEstadosBuscar,
  coincideBuscar: coincideBuscar,
  esExactaBuscar: esExactaBuscar,
  registrarBarriosBuscar: registrarBarriosBuscar,
  pasaBuscar: pasaBuscar,
  filtrarBuscar: filtrarBuscar,
  conteoFacetaBuscar: conteoFacetaBuscar,
  activosBuscar: activosBuscar,
  universoBuscar: universoBuscar,
  ordenarCasosBuscar: ordenarCasosBuscar,
  armarJornadaPorBarrio: armarJornadaPorBarrio,
  normalizarDireccion: normalizarDireccion,
  direccionRequiereConfirmar: direccionRequiereConfirmar,
  claveBusquedaDireccion: claveBusquedaDireccion,
  claveDireccionCatastro: claveDireccionCatastro,
  clavesCercanasCatastro: clavesCercanasCatastro,
  terrenoVecinoPreferido: terrenoVecinoPreferido,
  direccionDesdeClave: direccionDesdeClave,
  unidadCatastroCalza: unidadCatastroCalza,
  puntoEnAnillo: puntoEnAnillo,
  distanciaPuntoAnilloM: distanciaPuntoAnilloM,
  puntoInteriorAnillo: puntoInteriorAnillo,
  compararUbicacion: compararUbicacion,
  origenUbicacionConfirmada: origenUbicacionConfirmada,
  ubicacionConfirmadaVigente: ubicacionConfirmadaVigente,
  codigoPredioMatriz: codigoPredioMatriz,
  esCodigoPredioMatriz: esCodigoPredioMatriz,
  claveBusquedaCatastral: claveBusquedaCatastral,
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
  borradorEsDeLaFila: borradorEsDeLaFila,
  claveRadicado: claveRadicado,
  esRadicadoDeCaso: esRadicadoDeCaso,
  radicadoDeOficio: radicadoDeOficio,
  textoReiterados: textoReiterados,
  radicadosReiterados: radicadosReiterados,
  coincideReiterado: coincideReiterado,
  formaRadicadoValida: formaRadicadoValida,
  puedeRegistrarRadicado: puedeRegistrarRadicado,
  barrioRegistroDesdePot: barrioRegistroDesdePot,
  tipoBusquedaCaso: tipoBusquedaCaso,
  buscarCasos: buscarCasos,
  casosRelacionados: casosRelacionados,
  puedeDiligenciar: puedeDiligenciar,
  visitaSinIniciar: visitaSinIniciar,
  veTodasLasVisitas: veTodasLasVisitas,
  extraerIdCarpetaDrive: extraerIdCarpetaDrive,
  linkPdfRadicado: linkPdfRadicado,
  asignadaVisibleHoy: asignadaVisibleHoy,
  linkMapaVisita: linkMapaVisita,
  filaNecesitaPuntoCatastro: filaNecesitaPuntoCatastro,
  diagonalAnilloM: diagonalAnilloM,
  puntoMapaDesdeCatastro: puntoMapaDesdeCatastro,
  normalizarCoord: normalizarCoord,
  numerarVisitasRadicado: numerarVisitasRadicado,
  rangoSemana: rangoSemana,
  fechaAgendaVisita: fechaAgendaVisita,
  agruparSemana: agruparSemana,
  diasSinIniciar: diasSinIniciar,
  diasSinCompletar: diasSinCompletar,
  offsetSemanaDe: offsetSemanaDe,
  parsearFechaHora: parsearFechaHora,
  DIAS_DEMORA_ADMIN: DIAS_DEMORA_ADMIN,
  cargaUsuario: cargaUsuario,
  ultimaActividad: ultimaActividad,
  categoriaLog: categoriaLog,
  describirLog: describirLog,
  puntoDesdeTextoCoord: puntoDesdeTextoCoord,
  direccionVisible: direccionVisible,
  claveComunaAgenda: claveComunaAgenda,
  validarPinNuevo: validarPinNuevo,
  seccionesFicha: seccionesFicha,
  bloquesFicha: bloquesFicha,
  LICENCIA_TRAMITES: LICENCIA_TRAMITES,
  LICENCIA_MODALIDADES: LICENCIA_MODALIDADES,
  parsearTipoModalidad: parsearTipoModalidad,
  formatearTipoModalidad: formatearTipoModalidad,
  REQUIERE_INDETERMINADO: REQUIERE_INDETERMINADO,
  MOTIVOS_NO_REQUIERE: MOTIVOS_NO_REQUIERE,
  formatearRequiereLicencia: formatearRequiereLicencia,
  parsearRequiereLicencia: parsearRequiereLicencia,
  repLocativaDesdeRequiere: repLocativaDesdeRequiere,
  faltantesRequiereLicencia: faltantesRequiereLicencia,
  // Tablero territorial (E7): lógica pura
  prepararFilaTablero: prepararFilaTablero,
  filtrarTablero: filtrarTablero,
  kpisTablero: kpisTablero,
  agregarPorArea: agregarPorArea,
  escalaMapa: escalaMapa,
  rankingBarrios: rankingBarrios,
  serieMensual: serieMensual,
  recorridoTablero: recorridoTablero,
  equipoTablero: equipoTablero,
  hallazgosTablero: hallazgosTablero,
  calidadTablero: calidadTablero,
  fichaAreaTablero: fichaAreaTablero,
  CONTRAVENCION_GRUPOS: CONTRAVENCION_GRUPOS,
  CONTRAVENCION_ESPECIAL: CONTRAVENCION_ESPECIAL,
  CONTRAVENCION_INDETERMINADA: CONTRAVENCION_INDETERMINADA,
  _infraccionSoloCatalogo: _infraccionSoloCatalogo,
  nombreChipVigente: nombreChipVigente,
  chipsConNombreSellado: chipsConNombreSellado,
  alternarContravencion: alternarContravencion,
  infraccionParaActa: infraccionParaActa,
  nombrePOTLimpio: nombrePOTLimpio,
  leyendaPOTPorCapa: leyendaPOTPorCapa,
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
// ── Leyenda POT del mapa (formulario y Consulta norma) ──────────
// Las capas traen las categorías tal cual las escribió quien hizo el POT:
// «ZRCA-7: Zona de Recuperacion para la Conservacion Ambiental». Para la
// leyenda: sin el código, en minúscula salvo la primera letra y con tildes.
var _TILDES_POT = {
  recuperacion: 'recuperación', proteccion: 'protección', conservacion: 'conservación',
  hidrologica: 'hidrológica', hidrica: 'hídrica', hidricas: 'hídricas', publicos: 'públicos',
  publico: 'público', sedimentacion: 'sedimentación', colmatacion: 'colmatación',
  inundacion: 'inundación', socavacion: 'socavación', area: 'área', areas: 'áreas',
  geologica: 'geológica', geotecnica: 'geotécnica', erosion: 'erosión', remocion: 'remoción',
};
function nombrePOTLimpio(etiqueta) {
  var t = String(etiqueta || '').trim()
    // Código al comienzo: «ZRCA-7:», «ZSP-4:», «ZRNPA:».
    .replace(/^[A-ZÁÉÍÓÚÑ]{2,}[A-Z0-9-]*\s*:\s*/, '')
    .replace(/\s+/g, ' ').toLowerCase();
  t = t.replace(/[a-záéíóúñ]+/g, function (w) { return _TILDES_POT[w] || w; });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Una entrada por capa (cada capa se pinta con un solo color, así que una
// entrada por categoría daba renglones del mismo color imposibles de
// emparejar con el mapa) y, por capa, solo las categorías que caen en el pin:
// es lo que pesa en la visita. `items` = salida de afectacionesPOTCerca.
var _CAPAS_POT_LEYENDA = [
  { capa: 'retiro', nombre: 'Retiro de corriente hídrica' },
  { capa: 'amenaza', nombre: 'Amenaza natural' },
  { capa: 'proteccion', nombre: 'Suelo de protección' },
  { capa: 'drmi', nombre: 'DRMI Quitasol-La Holanda' },
];
function leyendaPOTPorCapa(items) {
  var porCapa = {};
  (items || []).forEach(function (it) {
    if (!it || !it.capa) return;
    var c = porCapa[it.capa] || (porCapa[it.capa] = { capa: it.capa, color: it.color, enPin: [] });
    if (!it.contiene) return;
    var n = nombrePOTLimpio(it.etiqueta);
    // El retiro solo tiene una categoría, que es el nombre de la capa.
    if (n && n.toLowerCase() !== 'retiro de corriente hídrica' && c.enPin.indexOf(n) < 0) c.enPin.push(n);
    c.contiene = true;
  });
  var salida = [];
  _CAPAS_POT_LEYENDA.forEach(function (d) {
    var c = porCapa[d.capa];
    if (c) salida.push({ capa: d.capa, nombre: d.nombre, color: c.color, contiene: !!c.contiene, enPin: c.enPin });
  });
  // Lo que toca el pin primero.
  return salida.sort(function (a, b) { return (b.contiene ? 1 : 0) - (a.contiene ? 1 : 0); });
}

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
   // La confirmación de ubicación es de la visita anterior: la nueva la vuelve a pedir.
   'UBICACION_CONFIRMADA',
   // La revisión del texto es de los textos de la visita anterior.
   'REVISION_DESCRIPCION', 'JUSTIFICACIONES_COHERENCIA',
  ].forEach(function (k) { d[k] = ''; });
  return d;
}
