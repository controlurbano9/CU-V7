// ═══════════════════════════════════════════════════════════════
// tests/buscar-casos.test.js — buscar un caso desde «Nueva visita» por
// radicado, orden de policía o dirección, y el aviso de casos en la misma
// dirección u orden (utils.js → tipoBusquedaCaso, buscarCasos,
// casosRelacionados).
//
// Caso real (2026-09-29): la 2ª visita de OFICIO-2026-09-239 se abrió como
// «Visita de oficio» y nació como caso nuevo con N° visita 1.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tipoBusquedaCaso, buscarCasos, casosRelacionados } = require('../utils.js');

const FILAS = [
  { _idx: 10, 'RADICADO': '20251143210', 'N° VISITA': '1', 'DIRECCION': 'CALLE 50 # 32-10', 'N° ORDEN DE POLICIA': '2025-09-015', 'ESTADO VISITA': 'COMPLETADO' },
  { _idx: 20, 'RADICADO': 'OFICIO-2026-09-239', 'N° VISITA': '1', 'DIRECCION': 'CR 68C # 59E-51', 'N° ORDEN DE POLICIA': '2026-09-239', 'ESTADO VISITA': 'COMPLETADO' },
  { _idx: 30, 'RADICADO': 'OFICIO-2026-09-239', 'N° VISITA': '2', 'DIRECCION': 'CR 68C # 59E-51', 'N° ORDEN DE POLICIA': 'N/A', 'ESTADO VISITA': 'INICIADO' },
  { _idx: 40, 'RADICADO': '20261099999', 'N° VISITA': '1', 'DIRECCION': 'CARRERA 68 C # 59 E - 51 APTO 201', 'N° ORDEN DE POLICIA': '', 'ESTADO VISITA': 'PENDIENTE' },
  { _idx: 50, 'RADICADO': '', 'N° VISITA': '1', 'DIRECCION': 'CR 68C # 59E-51' },  // sin radicado: no es caso
];

test('tipoBusquedaCaso distingue radicado, oficio, orden y dirección', () => {
  assert.equal(tipoBusquedaCaso('20251143210'), 'radicado');
  assert.equal(tipoBusquedaCaso('oficio-2026-09-239'), 'oficio');
  assert.equal(tipoBusquedaCaso('2026-9-239'), 'orden');
  assert.equal(tipoBusquedaCaso('239'), 'orden');
  assert.equal(tipoBusquedaCaso('CL 50 32 10'), 'direccion');
  assert.equal(tipoBusquedaCaso('  '), '');
});

test('radicado exacto: un caso, con todas sus visitas de la más reciente a la más vieja', () => {
  const r = buscarCasos(FILAS, 'Oficio-2026-09-239');
  assert.equal(r.casos.length, 1);
  assert.equal(r.casos[0].radicado, 'OFICIO-2026-09-239');
  assert.deepEqual(r.casos[0].visitas.map(f => f['N° VISITA']), ['2', '1']);
  assert.equal(r.casos[0].nVisitaSig, 3);
});

test('la orden de la 1ª visita encuentra el caso de oficio, con o sin ceros', () => {
  for (const q of ['2026-09-239', '2026-9-239', '239', '0239']) {
    const r = buscarCasos(FILAS, q);
    assert.equal(r.casos.length, 1, q);
    assert.equal(r.casos[0].radicado, 'OFICIO-2026-09-239', q);
  }
});

test('la orden de una visita PQR encuentra su radicado', () => {
  const r = buscarCasos(FILAS, '2025-9-15');
  assert.deepEqual(r.casos.map(c => c.radicado), ['20251143210']);
});

test('dirección escrita distinto encuentra los casos, más nuevo primero', () => {
  const r = buscarCasos(FILAS, 'cr 68c 59e 51');
  assert.equal(r.tipo, 'direccion');
  // La PQR de la misma placa (con apto y escrita en largo) también sale.
  assert.deepEqual(r.casos.map(c => c.radicado), ['20261099999', 'OFICIO-2026-09-239']);
  const r2 = buscarCasos(FILAS, 'CL 50 # 32 10');
  assert.deepEqual(r2.casos.map(c => c.radicado), ['20251143210']);
});

test('radicado PQR inexistente no cae a otras búsquedas', () => {
  assert.equal(buscarCasos(FILAS, '20269999999').casos.length, 0);
});

test('casosRelacionados: misma placa (sin mirar el apto) de otro radicado', () => {
  const c = casosRelacionados(FILAS, { direccion: 'CR 68C # 59E-51', radicadoPropio: '20261099999' });
  assert.deepEqual(c.map(x => x.radicado), ['OFICIO-2026-09-239']);
  assert.deepEqual(c[0].motivos, ['direccion']);
});

test('casosRelacionados: oficio nuevo con una orden ya usada', () => {
  const c = casosRelacionados(FILAS, { orden: '2026-09-239' });
  assert.deepEqual(c.map(x => x.radicado), ['OFICIO-2026-09-239']);
  assert.deepEqual(c[0].motivos, ['orden']);
});

test('casosRelacionados: excluye el caso propio y no avisa sin datos', () => {
  assert.equal(casosRelacionados(FILAS, { direccion: 'CR 68C # 59E-51', radicadoPropio: 'oficio-2026-09-239' })
    .filter(c => c.radicado === 'OFICIO-2026-09-239').length, 0);
  assert.deepEqual(casosRelacionados(FILAS, {}), []);
  assert.deepEqual(casosRelacionados(FILAS, { direccion: 'Vereda La China' }), []);
});
