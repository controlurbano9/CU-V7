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
  parsearFechaHora, cargaUsuario, ultimaActividad, categoriaLog,
  DIAS_DEMORA_ADMIN, formatearFechaHora,
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
