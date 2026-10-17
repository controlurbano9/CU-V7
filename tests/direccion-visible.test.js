// ═══════════════════════════════════════════════════════════════
// tests/direccion-visible.test.js — direccionVisible (utils.js)
// Dirección que es una coordenada dentro de Bello → «Punto GPS» en
// Semana, Alertas, tarjetas, Bandeja y modal de nueva visita.
// El title de cada sitio conserva la coordenada original.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { direccionVisible } = require('../utils.js');

test('DMS con ° → Punto GPS', () => {
  assert.equal(direccionVisible(`6°25'33.0"N 75°35'25.0"W`), 'Punto GPS');
});

test('decimal → Punto GPS', () => {
  assert.equal(direccionVisible('6.3267, -75.5415'), 'Punto GPS');
});

test('dirección normal → igual', () => {
  assert.equal(direccionVisible('CL 50 # 32-10'), 'CL 50 # 32-10');
});

test('coordenada fuera de Bello → igual', () => {
  assert.equal(direccionVisible('4.6, -74.08'), '4.6, -74.08');
});

test('vacío → tal cual (el default lo pone quien llama)', () => {
  assert.equal(direccionVisible(''), '');
  assert.equal(direccionVisible(null), null);
});
