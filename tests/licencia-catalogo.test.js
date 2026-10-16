// ═══════════════════════════════════════════════════════════════
// tests/licencia-catalogo.test.js — catálogo común de trámites y
// modalidades de licencia (utils.js → parsearTipoModalidad,
// formatearTipoModalidad). La columna AL sigue siendo un solo texto.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LICENCIA_TRAMITES, LICENCIA_MODALIDADES,
  parsearTipoModalidad, formatearTipoModalidad,
} = require('../utils.js');

test('vacío y null', () => {
  assert.deepEqual(parsearTipoModalidad(''), { tramites: [], modalidades: [], otros: [] });
  assert.deepEqual(parsearTipoModalidad(null), { tramites: [], modalidades: [], otros: [] });
  assert.equal(formatearTipoModalidad({}), '');
  assert.equal(formatearTipoModalidad(null), '');
});

test('lee los valores viejos del select de una sola opción', () => {
  assert.deepEqual(parsearTipoModalidad('Licencia de construcción — Obra nueva'),
    { tramites: ['Licencia de construcción'], modalidades: ['Obra nueva'], otros: [] });
  assert.deepEqual(parsearTipoModalidad('Licencia de urbanización'),
    { tramites: ['Licencia de urbanización'], modalidades: [], otros: [] });
});

test('compara sin tildes ni mayúsculas y deduplica', () => {
  assert.deepEqual(parsearTipoModalidad('licencia de construcción, Licencia de Construccion — obra nueva, Obra Nueva'),
    { tramites: ['Licencia de construcción'], modalidades: ['Obra nueva'], otros: [] });
});

test('lo que no casa con el catálogo va a otros sin adivinar', () => {
  var p = parsearTipoModalidad('Licencia de construcción — Demolición');
  assert.deepEqual(p.tramites, ['Licencia de construcción']);
  assert.deepEqual(p.modalidades, []);
  assert.deepEqual(p.otros, ['Demolición']); // no es «Demolición total/parcial»: no se adivina
});

test('formatear: sin modalidades no va el «—»', () => {
  assert.equal(formatearTipoModalidad({ tramites: ['Licencia de parcelación'] }), 'Licencia de parcelación');
});

test('formatear conserva otros al final de las modalidades', () => {
  assert.equal(formatearTipoModalidad(parsearTipoModalidad('Licencia de construcción — Demolición')),
    'Licencia de construcción — Demolición');
});

test('ida y vuelta', () => {
  var casos = [
    'Licencia de construcción, Reconocimiento — Obra nueva, Ampliación',
    'Licencia de urbanización',
    'Reconocimiento — Demolición parcial',
  ];
  casos.forEach(t => {
    assert.equal(formatearTipoModalidad(parsearTipoModalidad(t)), t);
  });
});

test('las listas del informe y de la visita son las mismas', () => {
  assert.ok(LICENCIA_TRAMITES.includes('Licencia de subdivisión'));
  assert.ok(LICENCIA_MODALIDADES.includes('Reforzamiento estructural'));
  assert.ok(LICENCIA_MODALIDADES.includes('Adecuación'));
  assert.ok(LICENCIA_MODALIDADES.includes('Restauración'));
});
