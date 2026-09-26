// ═══════════════════════════════════════════════════════════════
// tests/rol-supervisor.test.js — rol SUPERVISOR (col E de USUARIOS):
// ve todas las visitas como el admin, sin acciones de gestión
// (utils.js → veTodasLasVisitas).
//
// Pedido 2026-09-25: Víctor, Juanse y Patricia deben ver todas las visitas.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { veTodasLasVisitas, agruparSemana, rangoSemana } = require('../utils.js');

test('admin y supervisor ven todo; inspector y rol vacío no', () => {
  assert.equal(veTodasLasVisitas('ADMIN'), true);
  assert.equal(veTodasLasVisitas('SUPERVISOR'), true);
  assert.equal(veTodasLasVisitas('supervisor'), true);
  assert.equal(veTodasLasVisitas('INSPECTOR'), false);
  assert.equal(veTodasLasVisitas(''), false);
  assert.equal(veTodasLasVisitas(undefined), false);
});

test('la semana de un supervisor incluye visitas iniciadas por otros', () => {
  const dias = rangoSemana(new Date(2026, 8, 21), 0).dias; // lunes 21/09/2026
  const filas = [
    { 'ESTADO VISITA': 'INICIADO', 'VISITADOR(ES)': 'MAURICIO HOYOS', 'FECHA DE VISITA': '22/09/2026' },
    { 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'ANA RUIZ', 'FECHA ASIGNACION VISITA': '23/09/2026' },
  ];
  const r = agruparSemana(filas, dias, { esAdmin: veTodasLasVisitas('SUPERVISOR'), miNombre: 'VICTOR' });
  assert.equal(r.porDia[1].length + r.porDia[2].length, 2);
});
