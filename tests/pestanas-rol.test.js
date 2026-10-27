// ═══════════════════════════════════════════════════════════════
// tests/pestanas-rol.test.js — «Mis visitas» condicional para admin y
// supervisor (utils.js, arquitectura 2026-10-27, punto 9).
//
// Lo que se puede romper: que un supervisor sin visitas vea la pestaña vacía,
// o que un admin que también visita la pierda.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tieneVisitasPropias } = require('../utils.js');

const HOY = new Date(2026, 9, 27);
const v = (vis, estado, fechaVisita) => ({ 'VISITADOR(ES)': vis, 'ESTADO VISITA': estado, 'FECHA DE VISITA': fechaVisita || '' });

test('sin ninguna visita: no hay pestaña', () => {
  assert.equal(tieneVisitasPropias([v('ALEJANDRO HENAO', 'ASIGNADO')], 'VICTOR QUIROZ', HOY), false);
});

test('asignada o iniciada propia: sí', () => {
  assert.equal(tieneVisitasPropias([v('DANIEL PEDRAZA', 'ASIGNADO')], 'DANIEL PEDRAZA', HOY), true);
  assert.equal(tieneVisitasPropias([v('DANIEL PEDRAZA', 'INICIADO')], 'DANIEL PEDRAZA', HOY), true);
});

test('co-asignado de una asignada: sí (como en Mis visitas)', () => {
  assert.equal(tieneVisitasPropias([v('ALEJANDRO HENAO / DANIEL PEDRAZA', 'ASIGNADO')], 'DANIEL PEDRAZA', HOY), true);
});

test('acompañante de una iniciada: no (la diligencia otro)', () => {
  assert.equal(tieneVisitasPropias([v('ALEJANDRO HENAO / DANIEL PEDRAZA', 'INICIADO')], 'DANIEL PEDRAZA', HOY), false);
});

test('completada este año: sí; de un año anterior: no', () => {
  assert.equal(tieneVisitasPropias([v('DANIEL PEDRAZA', 'COMPLETADO', '15/03/2026')], 'DANIEL PEDRAZA', HOY), true);
  assert.equal(tieneVisitasPropias([v('DANIEL PEDRAZA', 'COMPLETADO', '15/03/2025')], 'DANIEL PEDRAZA', HOY), false);
});

test('pendiente sin inspector no cuenta para nadie', () => {
  assert.equal(tieneVisitasPropias([v('', 'PENDIENTE')], 'DANIEL PEDRAZA', HOY), false);
});
