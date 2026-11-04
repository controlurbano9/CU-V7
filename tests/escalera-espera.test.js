// ═══════════════════════════════════════════════════════════════
// tests/escalera-espera.test.js — peldaños de espera (utils.js).
//
// Toda espera de la app sube por los mismos peldaños (propuesta de esperas,
// 2026-11-04): nada → forma (0,4 s) → dice (3 s) → lenta (10 s). Lo que más
// se puede romper: que una respuesta rápida haga parpadear el indicador, o
// que un borde caiga en el peldaño equivocado.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { escalonEspera, ESPERA_PELDANOS } = require('../utils.js');

test('los peldaños son 0,4 s, 3 s y 10 s', () => {
  assert.deepEqual(ESPERA_PELDANOS, { forma: 400, dice: 3000, lenta: 10000 });
});

test('una respuesta rápida no pinta nada', () => {
  assert.equal(escalonEspera(0), 'nada');
  assert.equal(escalonEspera(399), 'nada');
});

test('cada borde sube al peldaño siguiente', () => {
  assert.equal(escalonEspera(400), 'forma');
  assert.equal(escalonEspera(2999), 'forma');
  assert.equal(escalonEspera(3000), 'dice');
  assert.equal(escalonEspera(9999), 'dice');
  assert.equal(escalonEspera(10000), 'lenta');
  assert.equal(escalonEspera(45000), 'lenta');
});

test('un valor raro cuenta como cero', () => {
  assert.equal(escalonEspera(undefined), 'nada');
  assert.equal(escalonEspera('x'), 'nada');
  assert.equal(escalonEspera(-5), 'nada');
});
