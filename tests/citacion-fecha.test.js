// ═══════════════════════════════════════════════════════════════
// tests/citacion-fecha.test.js — la citación no puede ser anterior a la
// visita (utils.js → citacionAntesDeVisita).
//
// Caso real (2026-11-05): visita del 21/10/2026 con citación del 02/03/2026;
// no salía en «Citaciones visitas completadas».
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { citacionAntesDeVisita, citacionesCompletadasExcel } = require('../utils.js');

test('el caso real: citación meses antes de la visita se rechaza', () => {
  assert.equal(citacionAntesDeVisita('2026-03-02', '2026-10-21'), true);
});

test('citación el mismo día o después de la visita vale', () => {
  assert.equal(citacionAntesDeVisita('2026-10-21', '2026-10-21'), false);
  assert.equal(citacionAntesDeVisita('2027-03-02', '2026-10-21'), false);
});

test('sin alguna de las dos fechas no hay nada que comparar', () => {
  assert.equal(citacionAntesDeVisita('', '2026-10-21'), false);
  assert.equal(citacionAntesDeVisita('2026-03-02', ''), false);
  assert.equal(citacionAntesDeVisita(undefined, undefined), false);
  assert.equal(citacionAntesDeVisita('02/03/2026', '2026-10-21'), false);
});

test('la cita a mano ya pasada no sale en «Citaciones visitas completadas»', () => {
  const fila = {
    'ESTADO VISITA': 'COMPLETADO', 'RADICADO': 'OFICIO-10-09-2025',
    'FECHA CITACION': '02/03/2026 · 9:00 AM', 'FECHA DE VISITA': '21/10/2026',
  };
  assert.equal(citacionesCompletadasExcel([], [fila], '05/11/2026').length, 0);
  const corregida = Object.assign({}, fila, { 'FECHA CITACION': '02/03/2027 · 9:00 AM' });
  assert.equal(citacionesCompletadasExcel([], [corregida], '05/11/2026').length, 1);
});

test('fila del Excel: FECHA RADICADO en DD/MM/YYYY aunque la celda llegue como ISO', () => {
  const fila = {
    'ESTADO VISITA': 'COMPLETADO', 'RADICADO': 'OFICIO-10-09-2025',
    'FECHA RADICADO': '2025-09-10T05:00:00.000Z',
    'FECHA CITACION': '02/03/2027 · 9:00 AM', 'FECHA DE VISITA': '21/10/2026',
  };
  const [r] = citacionesCompletadasExcel([], [fila], '05/11/2026');
  assert.equal(r.filaTSV.split('\t')[1], '10/09/2025');
});
