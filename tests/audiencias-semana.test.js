// ═══════════════════════════════════════════════════════════════
// tests/audiencias-semana.test.js — bloque «Audiencias de la semana»
// de Inicio (E4a, admin/supervisor).
//
// Lo que más se puede romper sin que se note: (1) contar una citación de
// otra semana (la alerta urgente mira 3 días, esto es la semana entera),
// (2) colar un sábado/domingo cuando rangoSemana no tiene columna para
// ellos, (3) listar una visita que no está iniciada.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { audienciasSemana } = require('../utils.js');

const REF = new Date(2026, 9, 5); // lunes 05/10/2026 → semana lun 5 … vie 9
const fila = (extra) => Object.assign({ 'VISITADOR(ES)': 'DANIEL PEDRAZA', 'RADICADO': '20261000001', 'ESTADO VISITA': 'INICIADO' }, extra);

test('audienciasSemana — solo lunes a viernes de la semana de ref', () => {
  const r = audienciasSemana([
    fila({ 'RADICADO': 'LUN', 'FECHA CITACION': '05/10/2026 · 9:00 a. m.' }),
    fila({ 'RADICADO': 'VIE', 'FECHA CITACION': '09/10/2026' }),
    fila({ 'RADICADO': 'SAB', 'FECHA CITACION': '10/10/2026' }),    // sábado: fuera
    fila({ 'RADICADO': 'DOM', 'FECHA CITACION': '11/10/2026' }),    // domingo: fuera
    fila({ 'RADICADO': 'ANT', 'FECHA CITACION': '28/09/2026' }),    // semana pasada: fuera
    fila({ 'RADICADO': 'PROX', 'FECHA CITACION': '12/10/2026' }),   // lunes siguiente: fuera
  ], REF);
  assert.deepEqual(r.map(x => x.f.RADICADO), ['LUN', 'VIE']);
});

test('audienciasSemana — el domingo de ref cierra la semana que termina', () => {
  // Misma regla que rangoSemana: el domingo no abre la semana siguiente.
  const r = audienciasSemana([fila({ 'FECHA CITACION': '09/10/2026' })], new Date(2026, 9, 11));
  assert.equal(r.length, 1);
});

test('audienciasSemana — solo INICIADO; sin fecha no entra', () => {
  const r = audienciasSemana([
    fila({ 'RADICADO': 'ASIG', 'ESTADO VISITA': 'ASIGNADO', 'FECHA CITACION': '06/10/2026' }),
    fila({ 'RADICADO': 'COMP', 'ESTADO VISITA': 'COMPLETADO', 'FECHA CITACION': '06/10/2026' }),
    fila({ 'RADICADO': 'SF', 'FECHA CITACION': '' }),
    fila({ 'RADICADO': 'OK', 'FECHA CITACION': '06/10/2026' }),
  ], REF);
  assert.deepEqual(r.map(x => x.f.RADICADO), ['OK']);
});

test('audienciasSemana — sin filtrar por inspector (vista de sistema)', () => {
  const r = audienciasSemana([fila({ 'VISITADOR(ES)': 'OTRA PERSONA', 'FECHA CITACION': '06/10/2026' })], REF);
  assert.equal(r.length, 1);
});

test('audienciasSemana — hora tras « · » y orden por fecha y hora', () => {
  const r = audienciasSemana([
    fila({ 'RADICADO': 'B', 'FECHA CITACION': '06/10/2026 · 10:30 a. m.' }),
    fila({ 'RADICADO': 'A', 'FECHA CITACION': '06/10/2026 · 9:00 a. m.' }),
    fila({ 'RADICADO': 'C', 'FECHA CITACION': '06/10/2026' }),          // sin hora: primera del día
    fila({ 'RADICADO': 'P', 'FECHA CITACION': '05/10/2026 · 2:00 p. m.' }),
  ], REF);
  assert.deepEqual(r.map(x => [x.f.RADICADO, x.hora]), [
    ['P', '2:00 p. m.'],
    ['C', ''],
    ['A', '9:00 a. m.'],
    ['B', '10:30 a. m.'],
  ]);
});

test('audienciasSemana — sin datos no revienta', () => {
  assert.deepEqual(audienciasSemana(null, REF), []);
  assert.deepEqual(audienciasSemana([], REF), []);
});
