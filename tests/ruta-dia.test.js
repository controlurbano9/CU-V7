// tests/ruta-dia.test.js — «Ruta del día» de la Semana (utils.js).
// Ejecutar: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rutaMasCortaDesde, linksRutaMaps } = require('../utils.js');

const P = (id, lat, lon) => ({ id, punto: lat == null ? null : { lat, lon }, dir: 'CL ' + id });

test('rutaMasCortaDesde — sale de la ubicación actual y no vuelve', () => {
  // Tres paradas en línea al norte del origen: el orden es de cerca a lejos.
  const r = rutaMasCortaDesde([P('c', 6.33, -75.55), P('a', 6.31, -75.55), P('b', 6.32, -75.55)],
    { lat: 6.30, lon: -75.55 });
  assert.deepEqual(r.map(p => p.id), ['a', 'b', 'c']);
  // Desde el otro extremo se invierte.
  const r2 = rutaMasCortaDesde([P('c', 6.33, -75.55), P('a', 6.31, -75.55), P('b', 6.32, -75.55)],
    { lat: 6.34, lon: -75.55 });
  assert.deepEqual(r2.map(p => p.id), ['c', 'b', 'a']);
});

test('rutaMasCortaDesde — las paradas sin punto van al final, en su orden', () => {
  const r = rutaMasCortaDesde([P('x'), P('a', 6.31, -75.55), P('y'), P('b', 6.32, -75.55)],
    { lat: 6.30, lon: -75.55 });
  assert.deepEqual(r.map(p => p.id), ['a', 'b', 'x', 'y']);
});

test('rutaMasCortaDesde — más de 8 paradas no se cuelga y no pierde ninguna', () => {
  const ps = Array.from({ length: 12 }, (_, i) => P('p' + i, 6.30 + i * 0.003, -75.55 + (i % 3) * 0.002));
  const r = rutaMasCortaDesde(ps, { lat: 6.30, lon: -75.55 });
  assert.equal(r.length, 12);
  assert.equal(r[0].id, 'p0');
});

test('linksRutaMaps — destino = última, intermedias en waypoints, sin origin', () => {
  const t = linksRutaMaps([P('a', 6.31, -75.55), P('x')]);
  assert.equal(t.length, 1);
  const u = new URL(t[0].url);
  assert.equal(u.searchParams.get('origin'), null);
  assert.equal(u.searchParams.get('destination'), 'CL x, Bello, Antioquia, Colombia');
  assert.equal(u.searchParams.get('waypoints'), '6.310000,-75.550000');
});

test('linksRutaMaps — más de 10 paradas se parten en tramos', () => {
  const ps = Array.from({ length: 13 }, (_, i) => P('p' + i, 6.3 + i * 0.001, -75.55));
  const t = linksRutaMaps(ps);
  assert.deepEqual(t.map(x => [x.desde, x.hasta]), [[1, 10], [11, 13]]);
  assert.equal(new URL(t[0].url).searchParams.get('waypoints').split('|').length, 9);
});
