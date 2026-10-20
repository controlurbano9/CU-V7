// ═══════════════════════════════════════════════════════════════
// tests/expediente.test.js — expediente del caso (TASK 2 audiencias,
// 2026-10-19): se diligencia al asignar, y donde hay expediente la app
// muestra «Exp. N» en lugar del radicado (el radicado pasa al title).
//
// utils.js → expedienteDe, identificadorVisita, y Buscar encuentra
// también por expediente (prepararCasoBuscar + coincideBuscar).
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { expedienteDe, identificadorVisita, prepararCasoBuscar, coincideBuscar } = require('../utils.js');

test('expedienteDe: vacío y NUEVO no son expediente', () => {
  assert.equal(expedienteDe({ EXPEDIENTE: '2201' }), '2201');
  assert.equal(expedienteDe({ EXPEDIENTE: ' NUEVO ' }), '');
  assert.equal(expedienteDe({ EXPEDIENTE: '' }), '');
  assert.equal(expedienteDe({}), '');
  assert.equal(expedienteDe(null), '');
  // Sheets puede entregar el número como número.
  assert.equal(expedienteDe({ EXPEDIENTE: 2201 }), '2201');
});

test('identificadorVisita: con expediente «Exp. N» y el radicado de secundario', () => {
  assert.deepEqual(
    identificadorVisita({ RADICADO: '20261041205', EXPEDIENTE: '2201' }),
    { principal: 'Exp. 2201', secundario: '20261041205' });
  // Sin expediente: el radicado como siempre, sin secundario.
  assert.deepEqual(
    identificadorVisita({ RADICADO: '20261041205' }),
    { principal: '20261041205', secundario: '' });
  assert.deepEqual(
    identificadorVisita({ RADICADO: '20261041205', EXPEDIENTE: 'NUEVO' }),
    { principal: '20261041205', secundario: '' });
});

test('Buscar encuentra por expediente y no confunde sin él', () => {
  const con = prepararCasoBuscar({ _idx: 1, RADICADO: '20261041205', EXPEDIENTE: '2201',
    'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'Alejandro' }, null, new Date(2026, 9, 19));
  const sin = prepararCasoBuscar({ _idx: 2, RADICADO: '20261041206',
    'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'Alejandro' }, null, new Date(2026, 9, 19));
  assert.equal(coincideBuscar(con, '2201'), 'exp');
  assert.equal(coincideBuscar(con, 'exp 2201'), '');   // solo dígitos calzan
  assert.equal(coincideBuscar(sin, '2201'), '');
  // El radicado sigue encontrándose aunque haya expediente.
  assert.equal(coincideBuscar(con, '20261041205'), 'rad');
});
