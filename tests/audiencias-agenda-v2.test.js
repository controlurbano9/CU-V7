// ═══════════════════════════════════════════════════════════════
// tests/audiencias-agenda-v2.test.js — Audiencias v2 (2026-11-11):
// buscador común de Agenda y Lista, filtro de sustanciador en la Lista,
// Lista partida en próximas/pasadas e inspecciones al lugar en la Agenda.
// Maqueta: cu-v5-dev/propuesta-audiencias-v2.html.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  agendaAudienciasDias, inspeccionesAgendaAudiencias, coincideTextoAudiencias,
  coincideRenglonAudiencias, partirListaAudiencias, filtrarListaAudiencias, normNombreAudiencias
} = require('../utils.js');

function cupo(extra) {
  return Object.assign({
    idCupo: 'c1', fecha: '05/04/2027', hora: '9:00AM', sustanciador: 'PATRICIA LOPEZ', estado: 'RESERVADO',
    radicado: '20271034512', expediente: '2201', citado: 'Carlos Ramírez', documentoCitado: '71234567',
    reservadoPor: 'ALEJANDRO HERNANDEZ', direccion: 'CL 50 # 32-10'
  }, extra);
}
function inspeccion(extra) {
  return Object.assign({
    RADICADO: '20270877120', 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'MAURICIO HERRERA',
    'DIRECCION INFRACCION': 'CL 30 # 45-12', 'BARRIO/VEREDA': 'Niquía',
    DILIGENCIA: 'Inspección al lugar', 'FECHA ASIGNACION VISITA': '05/04/2027',
    HORA_PROGRAMADA: '10:00AM', NOTA_DILIGENCIA: 'Llevar planos aprobados'
  }, extra);
}

test('coincideTextoAudiencias: sin tildes, sin mayúsculas, sin puntos; sin texto todo coincide', () => {
  assert.equal(coincideTextoAudiencias(['Carlos Ramírez'], 'ramirez'), true);
  assert.equal(coincideTextoAudiencias(['71234567'], '71.234.567'), true);
  assert.equal(coincideTextoAudiencias(['exp 2201'], 'Exp. 2201'), true);
  assert.equal(coincideTextoAudiencias(['Carlos'], 'pedro'), false);
  assert.equal(coincideTextoAudiencias([], ''), true);
  assert.equal(coincideTextoAudiencias([null, ''], 'x'), false);
});

test('filtrarListaAudiencias: el chip de sustanciador filtra y la búsqueda alcanza sustanciador, inspector y dirección', () => {
  const cupos = [cupo({}), cupo({ idCupo: 'c2', sustanciador: 'VICTOR QUIROZ', citado: 'María Gómez',
    reservadoPor: 'MAURICIO HERRERA', direccion: 'CR 48 # 63-21' })];
  const ids = (o) => filtrarListaAudiencias(cupos, Object.assign({ hoy: '01/04/2027' }, o)).map(c => c.idCupo);
  assert.deepEqual(ids({ sustanciador: normNombreAudiencias('Víctor Quiroz') }), ['c2']);
  assert.deepEqual(ids({ q: 'patricia' }), ['c1']);
  assert.deepEqual(ids({ q: 'mauricio' }), ['c2']);
  assert.deepEqual(ids({ q: 'CR 48' }), ['c2']);
  assert.deepEqual(ids({}), ['c1', 'c2']);
});

test('partirListaAudiencias: próximas en orden; pasadas del día más reciente al más viejo, por hora dentro del día', () => {
  const rows = [
    cupo({ idCupo: 'viejo', fecha: '01/02/2027', hora: '9:00AM' }),
    cupo({ idCupo: 'ayer-9', fecha: '04/04/2027', hora: '9:00AM' }),
    cupo({ idCupo: 'ayer-2', fecha: '04/04/2027', hora: '2:00PM' }),
    cupo({ idCupo: 'hoy', fecha: '05/04/2027' }),
    cupo({ idCupo: 'manana', fecha: '06/04/2027' }),
  ];
  const p = partirListaAudiencias(rows, '05/04/2027');
  assert.deepEqual(p.proximas.map(c => c.idCupo), ['hoy', 'manana']);
  assert.deepEqual(p.pasadas.map(c => c.idCupo), ['ayer-9', 'ayer-2', 'viejo']);
});

test('inspeccionesAgendaAudiencias: día, hora, inspector y nota; sin día no sale; «Mis citas» filtra', () => {
  const filas = [inspeccion({}), inspeccion({ RADICADO: 'X', 'FECHA ASIGNACION VISITA': '' }),
    { RADICADO: 'Y', 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '05/04/2027' }];
  const r = inspeccionesAgendaAudiencias(filas, {});
  assert.equal(r.length, 1);
  assert.equal(r[0].fuente, 'inspeccion');
  assert.equal(r[0].fechaTxt, '05/04/2027');
  assert.equal(r[0].minutos, 600);
  assert.equal(r[0].inspector, 'MAURICIO HERRERA');
  assert.equal(r[0].nota, 'Llevar planos aprobados');
  assert.equal(r[0].sustanciador, '');
  assert.equal(inspeccionesAgendaAudiencias(filas, { soloDe: 'ALEJANDRO HERNANDEZ' }).length, 0);
  assert.equal(inspeccionesAgendaAudiencias(filas, { soloDe: 'MAURICIO HERRERA' }).length, 1);
});

test('agendaAudienciasDias: las inspecciones se mezclan por hora y suman días propios', () => {
  const filas = [inspeccion({}), inspeccion({ RADICADO: 'Z', 'FECHA ASIGNACION VISITA': '07/04/2027', HORA_PROGRAMADA: '8:00AM' })];
  const cupos = [cupo({}), cupo({ idCupo: 'c2', hora: '2:00PM', radicado: '20272051100' })];
  const g = agendaAudienciasDias(filas, cupos, '05/04/2027', { inspecciones: true });
  assert.deepEqual(g.map(d => d.fecha), ['05/04/2027', '07/04/2027']);
  assert.deepEqual(g[0].citas.map(c => c.fuente + ' ' + c.minutos), ['bloque 540', 'inspeccion 600', 'bloque 840']);
  // Sin la opción no salen (compatibilidad con quien no la pida).
  assert.equal(agendaAudienciasDias(filas, cupos, '05/04/2027', {}).length, 1);
});

test('agendaAudienciasDias: con sustanciador elegido siguen las inspecciones; solo inspecciones deja solo esas', () => {
  const filas = [inspeccion({})];
  const cupos = [cupo({}), cupo({ idCupo: 'c2', hora: '2:00PM', sustanciador: 'VICTOR QUIROZ', radicado: '2' })];
  const sus = agendaAudienciasDias(filas, cupos, '05/04/2027',
    { inspecciones: true, sustanciador: normNombreAudiencias('Patricia López') });
  assert.deepEqual(sus[0].citas.map(c => c.fuente + ' ' + (c.sustanciador || '-')), ['bloque PATRICIA LOPEZ', 'inspeccion -']);
  const solo = agendaAudienciasDias(filas, cupos, '05/04/2027', { soloInspecciones: true });
  assert.deepEqual(solo[0].citas.map(c => c.fuente), ['inspeccion']);
});

test('agendaAudienciasDias: la búsqueda deja solo lo que coincide y quita los días vacíos', () => {
  const filas = [inspeccion({})];
  const cupos = [cupo({}), cupo({ idCupo: 'c2', fecha: '06/04/2027', citado: 'Luz Cano', sustanciador: 'JUANSE PEREZ', radicado: '9',
    documentoCitado: '1000', expediente: '' })];
  const q = (t) => agendaAudienciasDias(filas, cupos, '05/04/2027', { inspecciones: true, q: t })
    .map(d => d.fecha + ':' + d.citas.length);
  assert.deepEqual(q('juanse'), ['06/04/2027:1']);
  assert.deepEqual(q('planos'), ['05/04/2027:1']);       // nota de la inspección
  assert.deepEqual(q('inspección'), ['05/04/2027:1']);   // por el tipo
  assert.deepEqual(q('71.234.567'), ['05/04/2027:1']);   // documento del citado
  assert.deepEqual(q('nadie'), []);
});

test('coincideRenglonAudiencias: expediente con «Exp.» y radicado del caso', () => {
  const r = { citado: 'Ana', caso: { radicado: '2027111', expediente: '2287' }, fuente: 'bloque' };
  assert.equal(coincideRenglonAudiencias(r, 'Exp. 2287'), true);
  assert.equal(coincideRenglonAudiencias(r, '2027111'), true);
  assert.equal(coincideRenglonAudiencias(r, 'inspeccion'), false);
});
