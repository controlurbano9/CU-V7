// ═══════════════════════════════════════════════════════════════
// tests/diligenciador.test.js — quien inicia la visita queda primero en
// VISITADOR(ES) (utils.js → ponerDiligenciadorPrimero).
//
// Caso real (2026-09-25): una visita asignada a Mauricio la inició otro
// inspector y la tarjeta seguía diciendo «Mauricio H.».
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ponerDiligenciadorPrimero, primerVisitador } = require('../utils.js');

test('asignada a otro: quien inicia pasa a primero y el asignado queda de acompañante', () => {
  assert.equal(ponerDiligenciadorPrimero('MAURICIO HOYOS', 'DANIEL PEDRAZA'), 'DANIEL PEDRAZA / MAURICIO HOYOS');
});

test('ya co-asignado en segundo lugar: se mueve al primero sin duplicarse', () => {
  const r = ponerDiligenciadorPrimero('MAURICIO HOYOS / DANIEL PEDRAZA / ANA RUIZ', 'DANIEL PEDRAZA');
  assert.equal(r, 'DANIEL PEDRAZA / MAURICIO HOYOS / ANA RUIZ');
  assert.equal(primerVisitador(r), 'DANIEL PEDRAZA');
});

test('ya primero: no cambia nada', () => {
  assert.equal(ponerDiligenciadorPrimero('DANIEL PEDRAZA / ANA RUIZ', 'DANIEL PEDRAZA'), 'DANIEL PEDRAZA / ANA RUIZ');
});

test('sin nombre (usuario fuera de la lista de inspectores): conserva el orden', () => {
  assert.equal(ponerDiligenciadorPrimero('MAURICIO HOYOS / ANA RUIZ', ''), 'MAURICIO HOYOS / ANA RUIZ');
});

test('campo vacío: queda solo quien inicia', () => {
  assert.equal(ponerDiligenciadorPrimero('', 'DANIEL PEDRAZA'), 'DANIEL PEDRAZA');
});

test('compara sin distinguir mayúsculas y tolera espacios irregulares en el separador', () => {
  assert.equal(ponerDiligenciadorPrimero('MAURICIO HOYOS/Daniel Pedraza', 'DANIEL PEDRAZA'), 'DANIEL PEDRAZA / MAURICIO HOYOS');
});
