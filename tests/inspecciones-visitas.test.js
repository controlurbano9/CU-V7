// ═══════════════════════════════════════════════════════════════
// tests/inspecciones-visitas.test.js — inspecciones y visitas no se cruzan
// (2026-11-09, decisión del usuario: bloquear). El día con inspección al
// lugar es de la zona de la inspección (grupo de comunas): ese día el
// inspector solo lleva visitas de esa zona.
//
// utils.js → choqueZonaInspeccion, ordenarRutaConInspecciones.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { choqueZonaInspeccion, choqueZonaDia, ordenarRutaConInspecciones } = require('../utils.js');

const MIE = '25/11/2026'; // miércoles: comunas 7-8-9
const INSP = (o) => Object.assign({ _idx: 10, RADICADO: '20261000001', 'ESTADO VISITA': 'ASIGNADO',
  'VISITADOR(ES)': 'MAURICIO HERRERA LOPERA', 'FECHA ASIGNACION VISITA': MIE,
  DILIGENCIA: 'INSPECCIÓN AL LUGAR', HORA_PROGRAMADA: '9:00AM', COMUNA: '8' }, o);
const VIS = (o) => Object.assign({ _idx: 20, RADICADO: '20261000002', 'ESTADO VISITA': 'ASIGNADO',
  'VISITADOR(ES)': 'MAURICIO HERRERA LOPERA', 'FECHA ASIGNACION VISITA': MIE, COMUNA: '4' }, o);

test('programar una inspección: choca con visitas de otra zona ese día', () => {
  const datos = [VIS(), VIS({ _idx: 21, RADICADO: '20261000003' })];
  const caso = { _idx: 30, RADICADO: '20261000009', 'ESTADO VISITA': 'COMPLETADO', COMUNA: '7' };
  const m = choqueZonaInspeccion(datos, 'MAURICIO HERRERA LOPERA', MIE, caso, { inspeccion: true });
  assert.match(m, /^Mauricio ya tiene 2 visitas el mié 25 en las comunas 4, 5 y 6/);
});

test('programar una inspección: visitas de la misma zona o de otro inspector no chocan', () => {
  const caso = { _idx: 30, RADICADO: '20261000009', COMUNA: '7' };
  assert.equal(choqueZonaInspeccion([VIS({ COMUNA: '9' })], 'MAURICIO HERRERA LOPERA', MIE, caso, { inspeccion: true }), '');
  assert.equal(choqueZonaInspeccion([VIS({ 'VISITADOR(ES)': 'ALEJANDRO HERNANDEZ' })], 'MAURICIO HERRERA LOPERA', MIE, caso, { inspeccion: true }), '');
  // Otro día tampoco.
  assert.equal(choqueZonaInspeccion([VIS({ 'FECHA ASIGNACION VISITA': '26/11/2026' })], 'MAURICIO HERRERA LOPERA', MIE, caso, { inspeccion: true }), '');
});

test('montar la inspección sobre la visita asignada del mismo caso no es un cruce', () => {
  const v = VIS({ RADICADO: '20261000009' });
  const caso = { _idx: 30, RADICADO: '20261000009', COMUNA: '7' };
  assert.equal(choqueZonaInspeccion([v], 'MAURICIO HERRERA LOPERA', MIE, caso, { inspeccion: true }), '');
});

test('asignar una visita: choca con la inspección de otra zona ese día', () => {
  const m = choqueZonaInspeccion([INSP()], 'MAURICIO HERRERA LOPERA', MIE, VIS({ _idx: 40, 'ESTADO VISITA': 'PENDIENTE' }));
  assert.match(m, /^Mauricio tiene inspección al lugar el mié 25 a las 9:00 en las comunas 7, 8 y 9/);
  // Visita de la misma zona: sí.
  assert.equal(choqueZonaInspeccion([INSP()], 'MAURICIO HERRERA LOPERA', MIE, VIS({ _idx: 40, COMUNA: '9' })), '');
});

test('sin comuna conocida no hay zona y no se bloquea; completadas no cuentan', () => {
  assert.equal(choqueZonaInspeccion([INSP()], 'MAURICIO HERRERA LOPERA', MIE, VIS({ _idx: 40, COMUNA: '' })), '');
  assert.equal(choqueZonaInspeccion([INSP({ COMUNA: '' })], 'MAURICIO HERRERA LOPERA', MIE, VIS({ _idx: 40 })), '');
  assert.equal(choqueZonaInspeccion([INSP({ 'ESTADO VISITA': 'COMPLETADO' })], 'MAURICIO HERRERA LOPERA', MIE, VIS({ _idx: 40 })), '');
});

test('rural es su propia zona', () => {
  const m = choqueZonaInspeccion([INSP({ COMUNA: 'RURAL', 'BARRIO/VEREDA': 'VDA EL ESPÍRITU SANTO' })],
    'MAURICIO HERRERA LOPERA', MIE, VIS({ _idx: 40 }));
  assert.match(m, /en la zona rural/);
});

test('inspección contra inspección no se bloquea (el tablero la marca fuera de zona)', () => {
  const otra = INSP({ _idx: 11, RADICADO: '20261000005', COMUNA: '2', HORA_PROGRAMADA: '2:00PM' });
  assert.equal(choqueZonaInspeccion([otra], 'MAURICIO HERRERA LOPERA', MIE, INSP()), '');
});

test('ordenarRutaConInspecciones: mañana abre, tarde cierra, cada una por hora', () => {
  const r = ordenarRutaConInspecciones([
    { fila: 1 }, { fila: 2, hora: '3:00PM' }, { fila: 3, hora: '10:00AM' }, { fila: 4 }, { fila: 5, hora: '8:00AM' },
  ]);
  const filas = r.map(p => p.fila);
  assert.deepEqual(filas.slice(0, 2), [5, 3]);
  assert.equal(filas[filas.length - 1], 2);
  assert.deepEqual(filas.slice(2, 4).sort(), [1, 4]);
});

test('comunasGrupoInspeccion: las comunas del día de la inspección', () => {
  const { comunasGrupoInspeccion } = require('../utils.js');
  assert.deepEqual(comunasGrupoInspeccion({ COMUNA: '8' }), ['7', '8', '9']);
  assert.deepEqual(comunasGrupoInspeccion({ COMUNA: 'RURAL' }), ['RURAL']);
  assert.deepEqual(comunasGrupoInspeccion({ COMUNA: '' }), ['']);
});

test('choqueZonaDia: el aviso de la Agenda para todo el día', () => {
  // Miércoles (comunas 7-8-9) con inspección en la comuna 4: no recibe visitas del día.
  const datos = [INSP({ COMUNA: '4' })];
  assert.match(choqueZonaDia(datos, 'MAURICIO HERRERA LOPERA', MIE),
    /^Mauricio tiene inspección al lugar el mié 25 a las 9:00 en las comunas 4, 5 y 6/);
  // Inspección en la zona del día, otro inspector o fin de semana: nada.
  assert.equal(choqueZonaDia([INSP()], 'MAURICIO HERRERA LOPERA', MIE), '');
  assert.equal(choqueZonaDia(datos, 'ALEJANDRO HERNANDEZ', MIE), '');
  assert.equal(choqueZonaDia(datos, 'MAURICIO HERRERA LOPERA', '28/11/2026'), '');
  // Viernes rural con inspección urbana.
  const vie = [INSP({ COMUNA: '8', 'FECHA ASIGNACION VISITA': '27/11/2026' })];
  assert.match(choqueZonaDia(vie, 'MAURICIO HERRERA LOPERA', '27/11/2026'), /comunas 7, 8 y 9/);
});
