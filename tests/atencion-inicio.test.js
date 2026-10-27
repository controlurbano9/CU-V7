// ═══════════════════════════════════════════════════════════════
// tests/atencion-inicio.test.js — bloque «Atención» de Inicio (utils.js,
// arquitectura 2026-10-27, decisión 2).
//
// Lo que se puede romper: que una visita salga dos veces (la audiencia y la
// demora), que las urgentes no vayan primero o que el filtro de inspector deje
// pasar visitas ajenas.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { atencionInicio } = require('../utils.js');

const HOY = new Date(2026, 9, 27); // martes 27/10/2026
let n = 0;
const fila = (extra) => Object.assign({ _idx: ++n, 'VISITADOR(ES)': 'DANIEL PEDRAZA', 'RADICADO': 'R' + n }, extra);

test('audiencia cercana primero; la demora después, de la más atrasada a la menos', () => {
  const aud = fila({ 'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '26/10/2026', 'FECHA CITACION': '28/10/2026 · 9:00 a. m.' });
  const vieja = fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '01/09/2026' });
  const menos = fila({ 'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '13/10/2026' });
  const al = atencionInicio([menos, vieja, aud], { veTodo: true, hoy: HOY });
  assert.deepEqual(al.map(a => a.cat), ['urgente', 'sinIniciar', 'sinCompletar']);
  assert.equal(al[0].motivo, 'Audiencia mañana · 9:00 a. m.');
  assert.match(al[1].motivo, /^\d+ días sin iniciar$/);
});

test('una visita con audiencia cercana y demora sale una sola vez, como urgente', () => {
  const f = fila({ 'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '01/09/2026', 'FECHA CITACION': '28/10/2026' });
  const al = atencionInicio([f], { veTodo: true, hoy: HOY });
  assert.equal(al.length, 1);
  assert.equal(al[0].cat, 'urgente');
});

test('lo reciente no entra (umbral de 5 días hábiles)', () => {
  const f = fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '23/10/2026' });
  assert.equal(atencionInicio([f], { veTodo: true, hoy: HOY }).length, 0);
});

test('filtro de inspector: solo las de ese inspector', () => {
  const mia = fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '01/09/2026' });
  const otra = fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '01/09/2026', 'VISITADOR(ES)': 'ALEJANDRO HENAO' });
  const al = atencionInicio([mia, otra], { veTodo: true, inspector: 'ALEJANDRO HENAO', hoy: HOY });
  assert.deepEqual(al.map(a => a.f), [otra]);
});

test('sin veTodo: lo asignado a futuro no alerta', () => {
  const futura = fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '30/10/2026' });
  assert.equal(atencionInicio([futura], { miNombre: 'DANIEL PEDRAZA', hoy: HOY }).length, 0);
});
