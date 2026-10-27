// ═══════════════════════════════════════════════════════════════
// tests/tarjeta-visita.test.js — tarjeta única de visita (utils.js).
//
// Contrato de TarjetaVisita (visita-card.jsx): la misma visita dice lo mismo
// en Semana, Alertas, Mis visitas y Buscar (arquitectura 2026-10-27,
// decisión 1). Lo que más se puede romper: que el tiempo de una asignada no
// sea el de las alertas, que una visita ajena ofrezca acción, o que «Cómo
// llegar» salga en una completada.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tarjetaVisita, nombreCortoVisita, ubicacionCortaVisita, diasSinIniciar } = require('../utils.js');

const HOY = new Date(2026, 9, 27); // martes 27/10/2026

function fila(extra) {
  return Object.assign({
    'DIRECCION INFRACCION': 'CL 53A # 64-86', 'BARRIO': 'Hato Viejo', 'COMUNA': '5',
    'RADICADO': '20261006648', 'FECHA RADICADO': '23/01/2026',
    'VISITADOR(ES)': 'DANIEL PEDRAZA / ALEJANDRO HENAO',
  }, extra);
}

test('asignada: tiempo en días hábiles igual al de las alertas y acción Iniciar', () => {
  const f = fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '13/10/2026' });
  const t = tarjetaVisita(f, { hoy: HOY });
  assert.equal(t.estadoTxt, 'Asignada');
  assert.equal(t.tiempo, 'hace ' + diasSinIniciar(f, HOY) + ' días');
  assert.equal(t.demora, true);
  assert.equal(t.accion, 'Iniciar');
  assert.equal(t.mapa, true);
});

test('asignada hoy: «hoy», sin demora', () => {
  const t = tarjetaVisita(fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '27/10/2026' }), { hoy: HOY });
  assert.equal(t.tiempo, 'hoy');
  assert.equal(t.demora, false);
});

test('iniciada: Continuar y lo que falta', () => {
  const t = tarjetaVisita(fila({ 'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '20/10/2026' }), { hoy: HOY });
  assert.equal(t.accion, 'Continuar');
  assert.ok(t.falta.indexOf('Acta') !== -1);
  assert.ok(t.falta.indexOf('Registro fotográfico') !== -1);
});

test('completada: fecha corta, sin acción ni «Cómo llegar»', () => {
  const t = tarjetaVisita(fila({ 'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '29/09/2026',
    'LINK_PDF_ACTA': 'https://x' }), { hoy: HOY });
  assert.equal(t.tiempo, '29 sep');
  assert.equal(t.accion, null);
  assert.equal(t.mapa, false);
  assert.deepEqual(t.falta, []);
});

test('completada sin acta (V2 en papel): la tarjeta no dice «Falta»', () => {
  const t = tarjetaVisita(fila({ 'ESTADO VISITA': 'COMPLETADO' }), { hoy: HOY });
  assert.deepEqual(t.falta, []);
});

test('pendiente sin inspector: días calendario desde el radicado, sin acción propia', () => {
  const t = tarjetaVisita(fila({ 'ESTADO VISITA': 'PENDIENTE', 'FECHA RADICADO': '20/10/2026', 'VISITADOR(ES)': '' }), { hoy: HOY });
  assert.equal(t.tiempo, 'radicada hace 7 días');
  assert.equal(t.accion, null);
  assert.equal(t.mapa, false);
});

test('pendiente con inspector: se inicia y tiene «Cómo llegar», como una asignada', () => {
  const t = tarjetaVisita(fila({ 'ESTADO VISITA': 'PENDIENTE' }), { hoy: HOY });
  assert.equal(t.estadoTxt, 'Pendiente');
  assert.equal(t.accion, 'Iniciar');
  assert.equal(t.mapa, true);
});

test('visita ajena (puede: false): sin acción', () => {
  const t = tarjetaVisita(fila({ 'ESTADO VISITA': 'INICIADO' }), { hoy: HOY, puede: false });
  assert.equal(t.accion, null);
});

test('inspector solo para quien ve a todo el equipo', () => {
  const f = fila({ 'ESTADO VISITA': 'ASIGNADO' });
  assert.equal(tarjetaVisita(f, { hoy: HOY }).inspector, '');
  assert.equal(tarjetaVisita(f, { hoy: HOY, veTodo: true }).inspector, 'Daniel P.');
  assert.equal(nombreCortoVisita(f), 'Daniel P.');
});

test('estado forzado por la pantalla (Buscar: cerrada sin visita)', () => {
  const t = tarjetaVisita(fila({ 'ESTADO VISITA': 'NO COMPETENCIA' }), { hoy: HOY, estado: 'CERRADO' });
  assert.equal(t.estadoTxt, 'Cerrada sin visita');
  assert.equal(t.accion, null);
});

test('ubicación corta: barrio y comuna, o Rural', () => {
  assert.equal(ubicacionCortaVisita(fila({})), 'Hato Viejo · C5');
  assert.equal(ubicacionCortaVisita({ 'DIRECCION INFRACCION': 'Vda. La China', 'COMUNA': 'RURAL' }), 'Rural');
  assert.equal(ubicacionCortaVisita({ 'BARRIO/VEREDA': 'Prado', 'COMUNA': '3' }), 'Prado · C3');
});

test('dirección que es coordenada: se ve «Punto GPS»', () => {
  const t = tarjetaVisita(fila({ 'DIRECCION INFRACCION': '6.3456, -75.5512', 'ESTADO VISITA': 'ASIGNADO' }), { hoy: HOY });
  assert.equal(t.dirVisible, 'Punto GPS');
  assert.equal(t.dir, '6.3456, -75.5512');
});
