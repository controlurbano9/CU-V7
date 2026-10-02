// ═══════════════════════════════════════════════════════════════
// tests/asignada-visible.test.js — visibilidad por fecha de asignación
// y enlace a Google Maps de la visita (utils.js).
//
// Ronda 2026-09-18: el visitador veía en "Asignadas" lo programado para
// días futuros, y no tenía forma de abrir la ubicación desde la app.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { asignadaVisibleHoy, linkMapaVisita, filaNecesitaPuntoCatastro, diagonalAnilloM,
  puntoMapaDesdeCatastro, puntoEnAnillo } = require('../utils.js');

const HOY = new Date(2026, 8, 18); // 18/09/2026

test('asignadaVisibleHoy — la asignada de hoy se ve', () => {
  assert.equal(asignadaVisibleHoy({ 'FECHA ASIGNACION VISITA': '18/09/2026' }, HOY), true);
});

test('asignadaVisibleHoy — la asignada a futuro NO se ve', () => {
  assert.equal(asignadaVisibleHoy({ 'FECHA ASIGNACION VISITA': '19/09/2026' }, HOY), false);
  assert.equal(asignadaVisibleHoy({ 'FECHA ASIGNACION VISITA': '01/12/2026' }, HOY), false);
});

test('asignadaVisibleHoy — la asignada de días pasados sigue viéndose (pendiente de hacer)', () => {
  assert.equal(asignadaVisibleHoy({ 'FECHA ASIGNACION VISITA': '17/09/2026' }, HOY), true);
  assert.equal(asignadaVisibleHoy({ 'FECHA ASIGNACION VISITA': '02/01/2025' }, HOY), true);
});

test('asignadaVisibleHoy — sin fecha, ilegible o sin fila: se ve (nunca se oculta de más)', () => {
  assert.equal(asignadaVisibleHoy({ 'FECHA ASIGNACION VISITA': '' }, HOY), true);
  assert.equal(asignadaVisibleHoy({}, HOY), true);
  assert.equal(asignadaVisibleHoy({ 'FECHA ASIGNACION VISITA': 'N/A' }, HOY), true);
  assert.equal(asignadaVisibleHoy(null, HOY), true);
});

test('asignadaVisibleHoy — compara por día, no por hora', () => {
  // Hoy a las 23:00 contra una asignación de hoy a las 00:00: sigue siendo hoy.
  const hoyTarde = new Date(2026, 8, 18, 23, 0, 0);
  assert.equal(asignadaVisibleHoy({ 'FECHA ASIGNACION VISITA': '18/09/2026' }, hoyTarde), true);
  // Y un Date como valor de celda (Sheets lo devuelve así a veces).
  assert.equal(asignadaVisibleHoy({ 'FECHA ASIGNACION VISITA': new Date(2026, 8, 18, 9, 30) }, HOY), true);
  assert.equal(asignadaVisibleHoy({ 'FECHA ASIGNACION VISITA': new Date(2026, 8, 19, 0, 1) }, HOY), false);
});

test('linkMapaVisita — con GPS abre el punto exacto', () => {
  const url = linkMapaVisita({
    'LATITUD': 6.345587, 'LONGITUD': -75.553412,
    'DIRECCION INFRACCION': 'CL 50 # 32-10',
  });
  assert.equal(url, 'https://www.google.com/maps/search/?api=1&query=6.345587,-75.553412');
});

test('linkMapaVisita — repara la coordenada con el decimal comido por el Sheet', () => {
  const url = linkMapaVisita({ 'LATITUD': 6345587, 'LONGITUD': -75553412 });
  assert.equal(url, 'https://www.google.com/maps/search/?api=1&query=6.345587,-75.553412');
});

test('linkMapaVisita — sin GPS busca la dirección acotada a Bello, SIN el barrio', () => {
  // El barrio se dejó fuera a propósito: medido contra Google Maps, mandarlo
  // hace que la consulta caiga en Medellín o no resuelva. Ver el comentario
  // de linkMapaVisita en utils.js con las cuatro mediciones.
  const url = linkMapaVisita({
    'DIRECCION INFRACCION': 'CL 50 # 32-10', 'BARRIO/VEREDA': 'Niquía',
  });
  assert.equal(
    url,
    'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent('CL 50 # 32-10, Bello, Antioquia, Colombia')
  );
  assert.ok(!url.includes('Niqu'), 'el barrio no puede viajar en la consulta');
});

test('linkMapaVisita — en rural la vereda ya viene en la dirección, no se repite', () => {
  const url = linkMapaVisita({
    'DIRECCION INFRACCION': 'Vereda Hato Viejo sector La Loma',
    'BARRIO/VEREDA': 'Hato Viejo',
  });
  assert.equal(
    url,
    'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent('Vereda Hato Viejo sector La Loma, Bello, Antioquia, Colombia')
  );
  assert.equal(url.match(/Hato\+?%20?Viejo|Hato%20Viejo/g).length, 1,
    'la vereda aparece dos veces en la consulta');
});

test('linkMapaVisita — sin barrio sigue sirviendo', () => {
  const url = linkMapaVisita({ 'DIRECCION': 'CR 50 # 32-10' });
  assert.equal(
    url,
    'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent('CR 50 # 32-10, Bello, Antioquia, Colombia')
  );
});

test('linkMapaVisita — sin coordenadas ni dirección devuelve vacío (el botón no se pinta)', () => {
  assert.equal(linkMapaVisita({ 'BARRIO/VEREDA': 'Niquía' }), '');
  assert.equal(linkMapaVisita({}), '');
  assert.equal(linkMapaVisita(null), '');
});

test('linkMapaVisita — una sola coordenada no basta: cae a la dirección', () => {
  const url = linkMapaVisita({ 'LATITUD': 6.345587, 'DIRECCION': 'CL 50 # 32-10' });
  assert.ok(url.indexOf('CL%2050') !== -1, 'debe usar la dirección, no media coordenada');
});

// ── «Cómo llegar» con el predio de catastro (2026-10-01) ──────────
// Cuadrado de ~20 m y de ~200 m de lado alrededor de un punto de Bello.
function cuadrado(ladoM) {
  const dLat = ladoM / 110540, dLon = ladoM / (111320 * Math.cos(6.34 * Math.PI / 180));
  return [[6.34, -75.55], [6.34 + dLat, -75.55], [6.34 + dLat, -75.55 + dLon], [6.34, -75.55 + dLon]];
}
const PREDIO_CHICO = { tcod: 'A', anillo: cuadrado(20) };
const PREDIO_GRANDE = { tcod: 'B', anillo: cuadrado(200) };

test('linkMapaVisita — sin GPS y con punto de catastro abre el punto, no el texto', () => {
  const url = linkMapaVisita({ 'DIRECCION INFRACCION': 'CL 50 # 32-10' }, [6.3401, -75.5499]);
  assert.equal(url, 'https://www.google.com/maps/search/?api=1&query=6.340100,-75.549900');
});

test('linkMapaVisita — las coordenadas guardadas mandan sobre el punto de catastro', () => {
  const url = linkMapaVisita({ 'LATITUD': 6.345587, 'LONGITUD': -75.553412, 'DIRECCION': 'CL 50 # 32-10' }, [6.3401, -75.5499]);
  assert.equal(url, 'https://www.google.com/maps/search/?api=1&query=6.345587,-75.553412');
});

test('filaNecesitaPuntoCatastro — solo sin coordenadas y con dirección urbana legible', () => {
  assert.equal(filaNecesitaPuntoCatastro({ 'DIRECCION INFRACCION': 'CL 50 # 32-10' }), true);
  assert.equal(filaNecesitaPuntoCatastro({ 'LATITUD': 6.345587, 'LONGITUD': -75.553412, 'DIRECCION': 'CL 50 # 32-10' }), false);
  assert.equal(filaNecesitaPuntoCatastro({ 'DIRECCION': 'VEREDA POTRERITO, FINCA LA ESPERANZA' }), false);
  assert.equal(filaNecesitaPuntoCatastro({}), false);
  assert.equal(filaNecesitaPuntoCatastro(null), false);
});

test('diagonalAnilloM — mide el predio de punta a punta', () => {
  assert.ok(Math.abs(diagonalAnilloM(cuadrado(20)) - 28.3) < 0.5);
  assert.ok(Math.abs(diagonalAnilloM(cuadrado(200)) - 282.8) < 2);
  assert.equal(diagonalAnilloM([]), 0);
});

test('puntoMapaDesdeCatastro — dirección exacta en un predio chico: punto dentro del predio', () => {
  const p = puntoMapaDesdeCatastro({ exacta: true, terrenos: [PREDIO_CHICO] }, 3);
  assert.ok(p && puntoEnAnillo(p[0], p[1], PREDIO_CHICO.anillo));
});

test('puntoMapaDesdeCatastro — predio grande o con muchas fichas va por texto a Google', () => {
  assert.equal(puntoMapaDesdeCatastro({ exacta: true, terrenos: [PREDIO_GRANDE] }, 3), null);
  assert.equal(puntoMapaDesdeCatastro({ exacta: true, terrenos: [PREDIO_CHICO] }, 51), null);
  assert.ok(puntoMapaDesdeCatastro({ exacta: true, terrenos: [PREDIO_CHICO] }, 50));
});

test('puntoMapaDesdeCatastro — placas vecinas, varios predios o nada: no se adivina', () => {
  assert.equal(puntoMapaDesdeCatastro({ exacta: false, terrenos: [PREDIO_CHICO] }, 1), null);
  assert.equal(puntoMapaDesdeCatastro({ exacta: true, terrenos: [PREDIO_CHICO, PREDIO_CHICO] }, 1), null);
  assert.equal(puntoMapaDesdeCatastro({ exacta: true, terrenos: [] }, 0), null);
  assert.equal(puntoMapaDesdeCatastro(null, 0), null);
});
