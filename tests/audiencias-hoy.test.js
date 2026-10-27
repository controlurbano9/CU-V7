// ═══════════════════════════════════════════════════════════════
// tests/audiencias-hoy.test.js — lógica de la vista «Hoy» de la
// pestaña Audiencias (2026-10-25): citas del día de las dos fuentes
// (bloque de cupos y FECHA CITACION de BD VISITAS), dedup, orden por
// hora y días con audiencias.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { audienciasDelDia, diasConAudiencias, agendaAudienciasDias } = require('../utils.js');

// Fila de BD VISITAS con cita manual (FECHA CITACION).
function visita(extra) {
  return Object.assign({
    RADICADO: '20272041299', 'ESTADO VISITA': 'INICIADO', 'VISITADOR(ES)': 'ALEJANDRO HERNANDEZ',
    'DIRECCION INFRACCION': 'CL 50 # 32-10', 'BARRIO/VEREDA': 'Niquía',
    'FECHA CITACION': '05/04/2027 · 9:00 a. m.'
  }, extra);
}

// Cupo del bloque nuevo, como viene de agendaAudiencias.
function cupo(extra) {
  return Object.assign({
    idCupo: '05/04/2027-0900-PATRICIA', fecha: '05/04/2027', hora: '9:00AM',
    sustanciador: 'PATRICIA LOPEZ', estado: 'RESERVADO', radicado: '20272041228',
    citado: 'Carlos Ramírez', reservadoPor: 'MAURICIO HERRERA', direccion: 'CR 48 # 63-21'
  }, extra);
}

test('audienciasDelDia: mezcla bloque y visita; dedup por radicado y por ID_VISITA', () => {
  const filas = [
    // Mismo radicado que el cupo de las 9:00 → sale una sola vez (la del bloque).
    visita({ RADICADO: '20272041228' }),
    // Mismo caso por ID_VISITA con otro radicado vacío en el cupo.
    visita({ RADICADO: '20272041500', 'ID_VISITA': 'ID-X', 'FECHA CITACION': '05/04/2027 · 2:00 p. m.' }),
  ];
  const cupos = [
    cupo({}),
    cupo({ idCupo: '05/04/2027-1400-VICTOR', hora: '2:00PM', sustanciador: 'VICTOR QUIROZ',
      radicado: '', idVisita: 'ID-X', citado: 'Ana Toro' }),
  ];
  const out = audienciasDelDia(filas, cupos, '05/04/2027');
  assert.equal(out.length, 2);
  assert.ok(out.every(c => c.fuente === 'bloque'));
  // La cita de las 9:00 conserva su citado del bloque, no aparece dos veces.
  assert.equal(out.filter(c => c.hora === '9:00AM').length, 1);
  assert.equal(out[1].citado, 'Ana Toro');
});

test('audienciasDelDia: orden por hora real («10:30» después de «9:00»), sin hora al final', () => {
  const filas = [
    visita({ RADICADO: 'A1', 'FECHA CITACION': '05/04/2027 · 10:30 a. m.' }),
    visita({ RADICADO: 'A2', 'FECHA CITACION': '05/04/2027 · 9:00 a. m.' }),
    visita({ RADICADO: 'A3', 'FECHA CITACION': '05/04/2027 · 2:00 p. m.' }),
    visita({ RADICADO: 'A4', 'FECHA CITACION': '05/04/2027' }),
  ];
  const out = audienciasDelDia(filas, [], '05/04/2027');
  assert.deepEqual(out.map(c => c.caso.radicado), ['A2', 'A1', 'A3', 'A4']);
  assert.equal(out[3].minutos, null);
});

test('audienciasDelDia: filtro soloDe (visitas por _esVisitaDe, bloque por reservadoPor)', () => {
  const filas = [
    visita({ RADICADO: 'V1', 'VISITADOR(ES)': 'ALEJANDRO HERNANDEZ' }),
    visita({ RADICADO: 'V2', 'VISITADOR(ES)': 'MAURICIO HERRERA' }),
  ];
  const cupos = [
    cupo({ reservadoPor: 'ALEJANDRO HERNANDEZ' }),
    cupo({ idCupo: 'x2', reservadoPor: 'MAURICIO HERRERA', radicado: '20272041300', citado: 'Otro' }),
  ];
  const deAlejandro = audienciasDelDia(filas, cupos, '05/04/2027', { soloDe: 'ALEJANDRO HERNANDEZ' });
  assert.equal(deAlejandro.length, 2);
  assert.ok(deAlejandro.every(c => normInsp(c.inspector) === 'ALEJANDRO HERNANDEZ'));
  // Sin filtro las ve todas.
  assert.equal(audienciasDelDia(filas, cupos, '05/04/2027').length, 4);

  function normInsp(n) { return String(n || '').toUpperCase().trim(); }
});

test('audienciasDelDia: celda sin fecha («No se deja citación») y PENDIENTE ignoradas', () => {
  const filas = [
    visita({ 'FECHA CITACION': 'No se deja citación' }),
    visita({ 'ESTADO VISITA': 'PENDIENTE' }),
    visita({ RADICADO: 'OK', 'CITADO': 'Luz Cano' }),
  ];
  const out = audienciasDelDia(filas, [], '05/04/2027');
  assert.deepEqual(out.map(c => c.caso.radicado), ['OK']);
  // Citado de la visita: CITADO y, si no, quien atendió.
  assert.equal(out[0].citado, 'Luz Cano');
  const sinCitado = audienciasDelDia(
    [visita({ RADICADO: 'OK2', 'NOMBRE PERSONA ATIENDE': 'Perla Ríos' })], [], '05/04/2027');
  assert.equal(sinCitado[0].citado, 'Perla Ríos');
  assert.equal(sinCitado[0].sustanciador, '');
});

test('audienciasDelDia: con sustanciador elegido las citas viejas no salen', () => {
  const out = audienciasDelDia(
    [visita({ RADICADO: 'V1' })],
    [cupo({ sustanciador: 'PATRICIA LOPEZ' })],
    '05/04/2027', { sustanciador: 'PATRICIA LOPEZ' });
  assert.deepEqual(out.map(c => c.fuente), ['bloque']);
});

test('diasConAudiencias: sin repetidos, de hoy en adelante, con los filtros', () => {
  const filas = [
    visita({ 'FECHA CITACION': '05/04/2027 · 9:00 a. m.' }),
    visita({ RADICADO: 'V2', 'FECHA CITACION': '05/04/2027 · 2:00 p. m.' }),
    visita({ RADICADO: 'V3', 'FECHA CITACION': '01/04/2027 · 9:00 a. m.' }), // antes de hoy
  ];
  const cupos = [cupo({}), cupo({ fecha: '12/04/2027', idCupo: '12/04/2027-0900-PATRICIA' })];
  assert.deepEqual(diasConAudiencias(filas, cupos, '05/04/2027'), ['05/04/2027', '12/04/2027']);
  // «Mis citas» de quien no reservó nada: solo sus visitas viejas.
  assert.deepEqual(
    diasConAudiencias(filas, cupos, '05/04/2027', { soloDe: 'ALEJANDRO HERNANDEZ' }),
    ['05/04/2027']);
});

// ── agendaAudienciasDias: vista «Agenda» (arquitectura 2026-10-27) ──

test('agendaAudienciasDias: un grupo por día desde la fecha pedida, en orden; sin hoy arranca en el siguiente', () => {
  const filas = [visita({ RADICADO: '20272041228', 'FECHA CITACION': '07/04/2027 · 2:00 p. m.' })];
  const cupos = [
    cupo({ fecha: '05/04/2027', radicado: '20272041228' }),
    cupo({ idCupo: 'otro', fecha: '01/04/2027', radicado: '20272040001' }),
  ];
  const g = agendaAudienciasDias(filas, cupos, '02/04/2027', {});
  assert.deepEqual(g.map(x => x.fecha), ['05/04/2027', '07/04/2027']);
  assert.equal(g[0].citas.length, 1);
  assert.equal(g[0].citas[0].fuente, 'bloque');
});

test('agendaAudienciasDias: sin audiencias por delante, lista vacía', () => {
  assert.deepEqual(agendaAudienciasDias([], [cupo({ fecha: '01/04/2027' })], '02/04/2027', {}), []);
});
