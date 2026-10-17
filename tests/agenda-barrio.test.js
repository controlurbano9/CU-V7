// ═══════════════════════════════════════════════════════════════
// tests/agenda-barrio.test.js — jornada de la Agenda agrupada por barrio
// (utils.js). agenda.jsx solo pinta lo que devuelve armarJornadaPorBarrio.
//
// La regla que no se puede romper: la visita más urgente de la comuna
// siempre entra. Agrupar por cercanía no puede dejarla esperando.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { claveBarrio, armarJornadaPorBarrio } = require('../utils.js');

const v = (radicado, barrio) => ({ radicado, barrio });
const rads = (r) => r.items.map(x => x.radicado);

test('claveBarrio — mayúsculas, tildes y puntuación no separan un barrio', () => {
  assert.equal(claveBarrio('La Gabriela'), claveBarrio('LA GABRIELA'));
  assert.equal(claveBarrio('Vda. La Union'), claveBarrio('VDA. LA UNIÓN'));
  assert.equal(claveBarrio('LA CABAÑITA'), 'LA CABANITA');
  assert.equal(claveBarrio('  San   José  Obrero '), 'SAN JOSE OBRERO');
  assert.equal(claveBarrio(''), '');
  assert.equal(claveBarrio(null), '');
});

test('armarJornadaPorBarrio — el barrio de la más urgente va primero', () => {
  const lista = [v('1', 'Paris'), v('2', 'La Pradera'), v('3', 'PARIS'), v('4', 'La Pradera'), v('5', 'Paris')];
  const r = armarJornadaPorBarrio(lista, 4);
  assert.equal(r.barrio, 'PARIS');
  assert.equal(r.sugerido, 'PARIS');
  assert.deepEqual(rads(r), ['1', '3', '5', '2']);
});

test('armarJornadaPorBarrio — si el barrio no alcanza, completa con lo más urgente', () => {
  const lista = [v('1', 'Zamora'), v('2', 'Santa Rita'), v('3', 'Belvedere'), v('4', 'Santa Rita')];
  const r = armarJornadaPorBarrio(lista, 3);
  // 1 de Zamora + las dos más urgentes del resto (2 y 3), no las dos de Santa Rita.
  assert.deepEqual(rads(r), ['1', '2', '3']);
});

test('armarJornadaPorBarrio — lo que completa sale con cada barrio junto', () => {
  const lista = [v('1', 'A'), v('2', 'B'), v('3', 'C'), v('4', 'B')];
  const r = armarJornadaPorBarrio(lista, 4);
  assert.deepEqual(rads(r), ['1', '2', '4', '3']);
});

test('armarJornadaPorBarrio — el admin puede elegir otro barrio', () => {
  const lista = [v('1', 'Paris'), v('2', 'La Pradera'), v('3', 'Paris'), v('4', 'La Pradera')];
  const r = armarJornadaPorBarrio(lista, 2, 'LA PRADERA');
  assert.equal(r.barrio, 'LA PRADERA');
  assert.equal(r.sugerido, 'PARIS');
  assert.deepEqual(rads(r), ['2', '4']);
});

test('armarJornadaPorBarrio — un barrio elegido que ya no tiene pendientes vuelve al sugerido', () => {
  const lista = [v('1', 'Paris'), v('2', 'La Pradera')];
  assert.equal(armarJornadaPorBarrio(lista, 2, 'GIRASOLES').barrio, 'PARIS');
});

test('armarJornadaPorBarrio — lista de barrios con totales, en orden de urgencia', () => {
  const lista = [v('1', 'Paris'), v('2', 'La Pradera'), v('3', 'PARIS'), v('4', '')];
  const r = armarJornadaPorBarrio(lista, 10);
  assert.deepEqual(r.barrios, [
    { clave: 'PARIS', nombre: 'Paris', total: 2 },
    { clave: 'LA PRADERA', nombre: 'La Pradera', total: 1 },
  ]);
});

test('armarJornadaPorBarrio — visitas sin barrio no se agrupan entre sí', () => {
  const lista = [v('1', ''), v('2', 'Paris'), v('3', ''), v('4', 'Paris')];
  const r = armarJornadaPorBarrio(lista, 4);
  assert.equal(r.barrio, '');
  assert.deepEqual(rads(r), ['1', '2', '4', '3']);
});

test('armarJornadaPorBarrio — lista vacía y n fuera de rango', () => {
  assert.deepEqual(armarJornadaPorBarrio([], 4).items, []);
  assert.deepEqual(armarJornadaPorBarrio(null, 4).barrios, []);
  assert.deepEqual(rads(armarJornadaPorBarrio([v('1', 'A')], 0)), []);
});
