// ═══════════════════════════════════════════════════════════════
// tests/radicado-oficio.test.js — radicados sin distinguir mayúsculas y
// radicado fijo en visitas de oficio de seguimiento
// (utils.js → claveRadicado, radicadoDeOficio).
//
// Caso real (2026-09-29): «Oficio-2026-09-239» tecleado en el modal no
// encontró «OFICIO-2026-09-239» y la 2ª visita quedó como radicado aparte.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { claveRadicado, radicadoDeOficio } = require('../utils.js');

test('claveRadicado ignora mayúsculas y espacios', () => {
  assert.equal(claveRadicado('Oficio-2026-09-239'), claveRadicado('OFICIO-2026-09-239'));
  assert.equal(claveRadicado(' 20261026273 '), '20261026273');
  assert.equal(claveRadicado(null), '');
});

test('1ª visita de oficio: el radicado sale de la orden', () => {
  assert.equal(radicadoDeOficio('', '2026-09-239', 1), 'OFICIO-2026-09-239');
  assert.equal(radicadoDeOficio('OFICIO-2026-09-239', '2026-09-240', '1'), 'OFICIO-2026-09-240');
  assert.equal(radicadoDeOficio('', '', 1), '');
});

test('seguimiento de oficio: conserva el radicado del caso aunque no tenga orden o tenga otra', () => {
  assert.equal(radicadoDeOficio('Oficio-2026-09-239', '', '2'), 'OFICIO-2026-09-239');
  assert.equal(radicadoDeOficio('OFICIO-2026-09-239', '2026-09-301', 2), 'OFICIO-2026-09-239');
});

test('seguimiento sin radicado de oficio previo: cae a la orden', () => {
  assert.equal(radicadoDeOficio('', '2026-09-301', 2), 'OFICIO-2026-09-301');
});
