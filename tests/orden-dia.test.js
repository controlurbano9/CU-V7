// ═══════════════════════════════════════════════════════════════
// tests/orden-dia.test.js — orden de las visitas de un día en la Semana
// (2026-10-22). Sin orden manual: el recorrido más corto desde la Alcaldía;
// con orden manual, ese orden (y lo que no tenga, después, por ruta).
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ordenDiaDe, ordenarVisitasDia } = require('../utils.js');

// Alcaldía ≈ 6.3355, -75.5585. Cerca, medio y lejos hacia el norte.
const cerca = { _idx: 1, RADICADO: 'cerca', LATITUD: '6.3365', LONGITUD: '-75.5585' };
const medio = { _idx: 2, RADICADO: 'medio', LATITUD: '6.3455', LONGITUD: '-75.5585' };
const lejos = { _idx: 3, RADICADO: 'lejos', LATITUD: '6.3555', LONGITUD: '-75.5585' };
const sinPunto = { _idx: 4, RADICADO: 'sin', 'DIRECCION INFRACCION': 'CL 50 # 32-10' };
const dia = '05/04/2027';

test('ordenDiaDe: solo vale para su día', () => {
  assert.equal(ordenDiaDe({ ORDEN_DIA: '05/04/2027#2' }, dia), 2);
  assert.equal(ordenDiaDe({ ORDEN_DIA: '06/04/2027#2' }, dia), null);
  assert.equal(ordenDiaDe({}, dia), null);
});

test('ordenarVisitasDia: sin orden manual, la ruta desde la Alcaldía; sin punto al final', () => {
  const r = ordenarVisitasDia([lejos, sinPunto, cerca, medio], dia).map(f => f.RADICADO);
  assert.deepEqual(r, ['cerca', 'medio', 'lejos', 'sin']);
});

test('ordenarVisitasDia: el orden manual manda y lo demás sigue por ruta', () => {
  const l = Object.assign({}, lejos, { ORDEN_DIA: '05/04/2027#1' });
  const r = ordenarVisitasDia([cerca, medio, l], dia).map(f => f.RADICADO);
  assert.deepEqual(r, ['lejos', 'cerca', 'medio']);
  // Un orden de otro día no cuenta.
  const viejo = Object.assign({}, lejos, { ORDEN_DIA: '01/04/2027#1' });
  assert.deepEqual(ordenarVisitasDia([viejo, cerca], dia).map(f => f.RADICADO), ['cerca', 'lejos']);
});
