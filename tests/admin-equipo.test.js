// ═══════════════════════════════════════════════════════════════
// tests/admin-equipo.test.js — Administración fase 1 (utils.js).
//
// Contrato del que depende admin.jsx: el componente solo pinta. Lo que más
// se puede romper sin que se note es (1) leer «05/09» como 9 de mayo, (2)
// contarle a un co-asignado una visita que diligencia otro, y (3) perder
// enero→diciembre al contar las completadas del mes anterior.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
// formatearFechaHora pinta en America/Bogota y parsearFechaHora lee el texto
// como hora local: la prueba fija la zona para no depender de la máquina.
process.env.TZ = 'America/Bogota';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parsearFechaHora, cargaUsuario, ultimaActividad, categoriaLog, describirLog,
  DIAS_DEMORA_ADMIN, formatearFechaHora, validarPinNuevo,
} = require('../utils.js');

const HOY = new Date(2026, 9, 8); // jueves 08/10/2026
const YO = 'DANIEL PEDRAZA';
const fila = (extra) => Object.assign({ 'VISITADOR(ES)': YO, 'RADICADO': '20261000001' }, extra);

// ── parsearFechaHora ───────────────────────────────────────────

test('formatearFechaHora — texto del log sin voltear día y mes ni perder la hora', () => {
  assert.equal(formatearFechaHora('03/10/2026 08:52'), '03/10/2026 08:52');
  assert.equal(formatearFechaHora('23/09/2026 16:05'), '23/09/2026 16:05');
  assert.equal(formatearFechaHora('3/10/2026, 2:14:00 p. m.'), '03/10/2026 14:14');
});

test('parsearFechaHora — Date, ISO y dd/MM/yyyy HH:mm del backend', () => {
  const d = new Date(2026, 9, 3, 8, 30);
  assert.equal(parsearFechaHora(d), d, 'un Date válido pasa tal cual');
  assert.equal(parsearFechaHora(new Date('no')), null);
  const iso = parsearFechaHora('2026-10-02T19:40:00.000Z');
  assert.equal(iso.getTime(), new Date('2026-10-02T19:40:00.000Z').getTime());
  const txt = parsearFechaHora('05/09/2026 08:30');
  assert.ok(txt, 'dd/MM/yyyy HH:mm parsea');
  assert.equal(txt.getDate(), 5, 'día 5');
  assert.equal(txt.getMonth(), 8, 'mes septiembre');
  assert.equal(txt.getFullYear(), 2026);
  assert.equal(txt.getHours(), 8);
  assert.equal(txt.getMinutes(), 30);
});

test('parsearFechaHora — el formato del cliente (toLocaleString es-CO) con a./p. m.', () => {
  const am = parsearFechaHora('5/9/2026, 8:30:00 a. m.');
  assert.equal(am.getDate(), 5);
  assert.equal(am.getMonth(), 8);
  assert.equal(am.getHours(), 8);
  assert.equal(am.getMinutes(), 30);
  const pm = parsearFechaHora('5/10/2026, 9:05:00 p. m.');
  assert.equal(pm.getMonth(), 9);
  assert.equal(pm.getHours(), 21);
  assert.equal(pm.getMinutes(), 5);
  const mediodia = parsearFechaHora('5/10/2026, 12:00:00 p. m.');
  assert.equal(mediodia.getHours(), 12);
  const medianoche = parsearFechaHora('5/10/2026, 12:05:00 a. m.');
  assert.equal(medianoche.getHours(), 0);
});

test('parsearFechaHora — sin hora queda a medianoche; lo ilegible es null', () => {
  const s = parsearFechaHora('05/09/2026');
  assert.equal(s.getHours(), 0);
  assert.equal(parsearFechaHora('no es una fecha'), null);
  assert.equal(parsearFechaHora('32/13/2026 10:00'), null, 'desborde normalizado = fecha irreal');
  assert.equal(parsearFechaHora(''), null);
  assert.equal(parsearFechaHora(null), null);
});

// ── cargaUsuario ───────────────────────────────────────────────

test('cargaUsuario — co-asignado ve la asignada, no la que diligencia otro', () => {
  const c = cargaUsuario([
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'OTRO INSPECTOR / ' + YO,
      'FECHA ASIGNACION VISITA': '07/10/2026' }),
    fila({ 'ESTADO VISITA': 'INICIADO', 'VISITADOR(ES)': 'OTRO INSPECTOR / ' + YO,
      'FECHA DE VISITA': '07/10/2026' }),
  ], YO, HOY);
  assert.equal(c.hacer, 1);
  assert.equal(c.curso, 0);
});

test('cargaUsuario — una de 6 días hábiles es demorada y encabeza masDemoradas', () => {
  const c = cargaUsuario([
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'RADICADO': 'NUEVA', 'FECHA ASIGNACION VISITA': '07/10/2026' }),
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'RADICADO': 'VIEJA', 'FECHA ASIGNACION VISITA': '30/09/2026' }),
    fila({ 'ESTADO VISITA': 'INICIADO', 'RADICADO': 'CURSO', 'FECHA DE VISITA': '01/10/2026' }),
  ], YO, HOY);
  assert.equal(DIAS_DEMORA_ADMIN, 5);
  assert.equal(c.hacer, 2);
  assert.equal(c.demoradas, 2);
  assert.equal(c.demoradasHacer, 1, 'solo VIEJA demora; NUEVA lleva 1 día');
  assert.equal(c.demoradasCurso, 1, 'la iniciada de 01/10 lleva 5 hábiles');
  assert.deepEqual(c.masDemoradas.map(x => x.f['RADICADO']), ['VIEJA', 'CURSO', 'NUEVA']);
  assert.equal(c.masDemoradas[0].dias, 6);
  assert.equal(c.masDemoradas[0].tipo, 'hacer');
  assert.equal(c.masDemoradas[1].tipo, 'curso');
});

test('cargaUsuario — asignada a futuro no es deuda de hoy pero avisa al desactivar', () => {
  const c = cargaUsuario([
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '15/10/2026' }),
  ], YO, HOY);
  assert.equal(c.hacer, 0);
  assert.equal(c.futuras, 1);
});

test('cargaUsuario — completadas de enero y diciembre cuando hoy es enero', () => {
  const ENERO = new Date(2027, 0, 15); // viernes 15/01/2027
  const c = cargaUsuario([
    fila({ 'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '10/01/2027' }),
    fila({ 'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '15/12/2026' }),
    fila({ 'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '20/12/2026' }),
    fila({ 'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '10/11/2026' }),
  ], YO, ENERO);
  assert.equal(c.completadasMes, 1);
  assert.equal(c.completadasMesAnterior, 2, 'diciembre del año anterior');
});

// ── ultimaActividad ────────────────────────────────────────────

test('ultimaActividad — el máximo entre la BD y el log, solo de esa persona', () => {
  const filas = [
    fila({ 'ESTADO VISITA': 'COMPLETADO', 'ULTIMA_MODIFICACION': '02/10/2026 10:00',
      'ULTIMA_MODIFICACION_POR': YO }),
    fila({ 'ESTADO VISITA': 'COMPLETADO', 'ULTIMA_MODIFICACION': '03/10/2026 18:00',
      'ULTIMA_MODIFICACION_POR': '  ' + YO + ' ' }), // trim + mayúsculas
    fila({ 'ESTADO VISITA': 'COMPLETADO', 'ULTIMA_MODIFICACION': '04/10/2026 08:00',
      'ULTIMA_MODIFICACION_POR': 'OTRO INSPECTOR' }),
  ];
  const log = [
    ['FECHA', 'USUARIO', 'ACCION'],
    ['05/10/2026 09:15', 'OTRO INSPECTOR', 'Visita fila 12: ASIGNADA'],
    ['03/10/2026 16:00', YO, 'Logout V6'],
  ];
  const d = ultimaActividad(filas, log, YO.toLowerCase());
  assert.ok(d);
  assert.equal(d.getDate(), 3);
  assert.equal(d.getHours(), 18, 'gana la BD 03/10 18:00 sobre el log 16:00');
  assert.equal(ultimaActividad(filas, log, 'NADIE'), null);
  assert.equal(ultimaActividad(filas, null, YO).getDate(), 3);
});

// ── categoriaLog ───────────────────────────────────────────────

test('categoriaLog — un caso por categoría (textos reales del backend)', () => {
  assert.equal(categoriaLog(YO, 'Guardado BLOQUEADO: fila 252 tiene el radicado 2026…'), 'seguridad');
  assert.equal(categoriaLog('SISTEMA', 'CONFIG_AGENDA actualizada: máx 4/jornada'), 'sistema');
  assert.equal(categoriaLog(YO, 'Login V6'), 'accesos');
  assert.equal(categoriaLog(YO, 'Logout V6'), 'accesos');
  assert.equal(categoriaLog(YO, 'PIN reseteado para: NELSON …'), 'accesos');
  assert.equal(categoriaLog(YO, 'Visita fila 12: ESTADO ASIGNADO → INICIADO'), 'visitas');
  assert.equal(categoriaLog(YO, 'Reiterado AGREGADO: 20261054116 en 20261049145'), 'visitas');
  assert.equal(categoriaLog(YO, 'Usuario DESACTIVADO: NELSON …'), 'otros');
  assert.equal(categoriaLog(YO, 'CONFIG_AGENDA actualizada: máx 4/jornada'), 'otros');
});

// ── validarPinNuevo ────────────────────────────────────────────

test('validarPinNuevo — una regla por rama, en el orden en que se muestran', () => {
  assert.equal(validarPinNuevo('482', '482'), 'El PIN debe tener 4 dígitos.');
  assert.equal(validarPinNuevo('48a6', '48a6'), 'El PIN debe tener 4 dígitos.');
  assert.equal(validarPinNuevo('4826', '4862'), 'Los dos PIN no coinciden.');
  assert.equal(validarPinNuevo('4826', '4826', '4826'), 'El PIN nuevo debe ser distinto del actual.');
  assert.equal(validarPinNuevo('1234', '1234'), 'Ese PIN es muy fácil de adivinar. Elige otro.');
  assert.equal(validarPinNuevo('0000', '0000', '4826'), 'Ese PIN es muy fácil de adivinar. Elige otro.');
  assert.equal(validarPinNuevo('4826', '4826', '7391'), '');
  assert.equal(validarPinNuevo('4826', '4826'), '');
});

// ── describirLog ───────────────────────────────────────────────
// texto y detalle (el tipo se prueba aparte, más abajo).
const _dl = s => { const r = describirLog(s); return { texto: r.texto, detalle: r.detalle }; };

test('describirLog — frases internas del log como hechos, sin inventar el radicado', () => {
  assert.deepEqual(_dl('Login V6'), { texto: 'Inició sesión', detalle: '' });
  assert.deepEqual(_dl('Logout V6'), { texto: 'Cerró sesión', detalle: '' });
  // Registro viejo: solo la fila, que NO se traduce a radicado (la fila pudo correrse).
  assert.deepEqual(_dl('Visita fila 1614: ESTADO ASIGNADO → INICIADO'),
    { texto: 'Inició una visita', detalle: 'Fila 1614 de la hoja · asignada → iniciada' });
  assert.deepEqual(_dl('Visita fila 12 (radicado 20261094702): ESTADO INICIADO → COMPLETADO'),
    { texto: 'Completó una visita', detalle: 'Radicado 20261094702 · iniciada → completada' });
  assert.deepEqual(_dl('Visita fila 12: ESTADO → COMPLETADO'),
    { texto: 'Completó una visita', detalle: 'Fila 12 de la hoja' });
  assert.deepEqual(_dl('Visita fila 12: ESTADO (vacío) → INICIADO'),
    { texto: 'Inició una visita', detalle: 'Fila 12 de la hoja' });
  assert.deepEqual(_dl('Visita fila 40 (radicado 20261000001): REASIGNADA de NELSON CUERVO → MAURICIO HERRERA (estado INICIADO → INICIADO)'),
    { texto: 'Reasignó una visita de Nelson Cuervo a Mauricio Herrera', detalle: 'Radicado 20261000001' });
  assert.deepEqual(_dl('Visita fila 40: ASIGNADA → MAURICIO HERRERA (estado PENDIENTE → ASIGNADO)'),
    { texto: 'Asignó una visita a Mauricio Herrera', detalle: 'Fila 40 de la hoja' });
  assert.deepEqual(_dl('Visita creada — fila 1700 (radicado 20261099999)'),
    { texto: 'Creó una visita', detalle: 'Radicado 20261099999' });
  assert.deepEqual(_dl('Cambió su PIN'), { texto: 'Cambió su PIN', detalle: '' });
});

// ── describirLog: todo lo que escribe el backend (arquitectura 2026-10-27) ──
// Un caso por clase de mensaje de registrarLog (apps_script_unificado.js),
// con el texto tal como lo escribe. Si el backend cambia un texto, la prueba
// lo avisa; si agrega uno nuevo, sale tal cual (último caso).

test('describirLog — cada mensaje del backend en lenguaje del oficio, con su tipo', () => {
  const casos = [
    ['Guardado BLOQUEADO: fila 252 tiene el radicado 20261041285, el formulario esperaba 20261026273',
      'Se evitó guardar en el caso equivocado', 'Radicado 20261026273 (la fila ya tenía 20261041285)', 'seguridad'],
    ['generarActa BLOQUEADO: fila 12 tiene el radicado (vacío), se esperaba 20261000001',
      'Se evitó escribir en el caso equivocado', 'Radicado 20261000001 (la fila ya tenía (vacío))', 'seguridad'],
    ['actualizar BLOQUEADO: no existe la visita abc (fila enviada 12)',
      'Se evitó escribir en una visita que ya no existe', '', 'seguridad'],
    ['Reintento offline BLOQUEADO: la fila 300 ya no es del radicado 20261000002 y no se encontró adónde se movió',
      'Se evitó repetir un guardado sin señal en el caso equivocado', 'Radicado 20261000002', 'seguridad'],
    ['DUPLICADO bloqueado: radicado 20261000003 (visita N°2) ya existe en fila 40',
      'Se evitó duplicar una visita', 'Radicado 20261000003 · visita N° 2', 'seguridad'],
    ['actualizar: la visita abc pasó de la fila 12 a la 11 — se escribió en la 11',
      'Encontró la visita en su fila nueva y escribió ahí', 'Fila 12 → 11', 'sistema'],
    ['Visita reescrita por reintento offline — fila 99 (radicado 20261000004)',
      'Guardó una visita hecha sin señal', 'Radicado 20261000004', 'visita'],
    ['Revisión del texto cerrada con justificación — fila 235 (radicado 20251084835): el área no se pudo medir',
      'Cerró la revisión del texto con justificación', 'Radicado 20251084835 · el área no se pudo medir', 'visita'],
    ['Reiterado AGREGADO: 20261054116 (radicado el 02/09/2026) al caso 20261049145 — 2 fila(s)',
      'Agregó un reiterado', 'Radicado 20261049145 · reiterado 20261054116', 'visita'],
    ['Reiterado QUITADO: 20261054116 del caso 20261049145',
      'Quitó un reiterado', 'Radicado 20261049145 · reiterado 20261054116', 'visita'],
    ['Cupo RESERVADO 05/04/2027-0900-PATRICIA (05/04/2027 9:00 a. m. PATRICIA LOPEZ) para el orden 2026-09-430',
      'Pidió una cita', 'Orden 2026-09-430 · 05/04/2027 9:00 a. m. PATRICIA LOPEZ', 'visita'],
    ['Cupo LIBERADO x (05/04/2027 9:00 a. m. PATRICIA LOPEZ) del radicado 20261000005 · motivo: se reprogramó',
      'Liberó una cita', 'Radicado 20261000005 · 05/04/2027 9:00 a. m. PATRICIA LOPEZ · motivo: se reprogramó', 'visita'],
    ['Usuario DESACTIVADO: NELSON DARIO', 'Desactivó a Nelson Dario', '', 'gestion'],
    ['PIN temporal generado para: VICTOR HUGO', 'Generó un PIN temporal para Victor Hugo', '', 'gestion'],
    ['Eligió su PIN (reemplaza el temporal)', 'Cambió su PIN', '', 'acceso'],
    ['Rol de VICTOR HUGO: INSPECTOR → SUPERVISOR', 'Cambió el rol de Victor Hugo', 'inspector → supervisor', 'gestion'],
    ['Hallazgo pendiente del radicado 20261000006 marcado REVISADO',
      'Revisó un hallazgo para el catálogo', 'Radicado 20261000006 · revisado', 'gestion'],
    ['Orden del día 27/10/2026: 4 visitas', 'Ordenó las visitas del 27/10/2026', '4 visitas', 'gestion'],
    ['CONFIG_AGENDA actualizada: 3 visitas por inspector · inspectores [ALEJANDRO,MAURICIO]',
      'Cambió las reglas de la agenda', '3 visitas por inspector', 'gestion'],
    ['Agenda confirmada: ALEJANDRO 3 (28/10/2026)', 'Confirmó la agenda', 'ALEJANDRO 3 (28/10/2026)', 'gestion'],
    ['EXPORTAR Buscar: 120 filas · 5 columnas (Radicado, Dirección) · DATOS PERSONALES: Atiende',
      'Exportó 120 casos de Buscar a Excel', 'con datos personales', 'gestion'],
    ['Novedad agenda: PATRICIA LOPEZ · 05/04/2027 a 09/04/2027 · todo el día · vacaciones — 2 citaciones caen dentro',
      'Marcó días sin audiencias de Patricia Lopez', '05/04/2027 a 09/04/2027', 'gestion'],
    ['Novedad agenda DESACTIVADA: PATRICIA LOPEZ (n1)', 'Quitó días sin audiencias de Patricia Lopez', '', 'gestion'],
    ['Cupos APARTADOS para reservar sin señal: a, b, c', 'Apartó cupos para pedir citas sin señal', '', 'sistema'],
    ['Forms → Radicado: 20261000007 | Prado (C3) | CL 52 # 38-90',
      'Entró una PQR por el formulario', 'Radicado 20261000007 · CL 52 # 38-90', 'sistema'],
    ['PDF radicado 20261000008 copiado a carpeta de visita',
      'Copió el PDF de la PQR a la carpeta de la visita', 'Radicado 20261000008', 'sistema'],
    ['DUPLICADO ignorado: 20261000009', 'Se ignoró una PQR repetida', 'Radicado 20261000009', 'sistema'],
    ['normalizarDireccionesBD: 286 direcciones normalizadas',
      'Mantenimiento: direcciones normalizadas', '286 direcciones normalizadas', 'sistema'],
    ['Visita fila 12 (radicado 20261094702): ESTADO INICIADO → COMPLETADO',
      'Completó una visita', 'Radicado 20261094702 · iniciada → completada', 'visita'],
    ['Login V6', 'Inició sesión', '', 'acceso'],
    // Formatos viejos que siguen en LOG_AUDITORIA.
    ['Guardado BLOQUEADO: fila 252 tiene el radicado 20261041285 y llegó 20261026273 — el link del acta no se escribió',
      'Se evitó guardar en el caso equivocado', 'Radicado 20261026273 (la fila ya tenía 20261041285)', 'seguridad'],
    ['CONFIG_AGENDA actualizada: máx 4/jornada, mañana C1-C6', 'Cambió las reglas de la agenda', '', 'gestion'],
    ['PIN reseteado para: MAURICIO GOMEZ', 'Reseteó el PIN de Mauricio Gomez', '', 'gestion'],
    ['Visita fila 16: ASIGNADA', 'Asignó una visita', 'Fila 16 de la hoja', 'visita'],
    ['Reiterado AGREGADO: 20261054116 en 20261049145 (fila 1369)', 'Agregó un reiterado', 'Radicado 20261049145 · reiterado 20261054116', 'visita'],
    ['Algo nuevo del backend', 'Algo nuevo del backend', '', 'otro'],
  ];
  casos.forEach(([entrada, texto, detalle, tipo]) => {
    assert.deepEqual(describirLog(entrada), { texto, detalle, tipo }, entrada);
  });
});
