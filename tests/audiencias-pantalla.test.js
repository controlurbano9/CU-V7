// ═══════════════════════════════════════════════════════════════
// tests/audiencias-pantalla.test.js — lógica de la pestaña
// «Audiencias» (TASK 3a, 2026-10-20). utils.js → agrupar por día y por
// sustanciador, próximo día con audiencias, filtro de «Lista» y fila TSV.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normNombreAudiencias, horaAudienciasMin, horaBonitaAudiencias,
  agruparAudienciasPorDia, agruparAudienciasPorSustanciador,
  proximoDiaAudiencias, filtrarListaAudiencias,
  normOrdenAudiencias, mismoCasoAudiencias, opcionesPedirCita, casosAgendaHoyAudiencias,
  sugerirCasosAudiencias, citaVigenteDelCaso, pedidasHoyAudiencias,
} = require('../utils.js');

// Cita de prueba con la forma de agendaAudiencias.
function cita(extra) {
  return Object.assign({
    idCupo: '20270405-0900-PATRICIA', fecha: '05/04/2027', dia: 'lunes', hora: '9:00AM',
    sustanciador: 'PATRICIA LÓPEZ', estado: 'RESERVADO', radicado: '20272041228',
    expediente: '2201', citado: 'Carlos Ramírez', documentoCitado: '',
    reservadoPor: 'Alejandro Hernandez', enviadoExcel: '', visitaCompletada: true,
    direccion: 'CL 50 # 32-10'
  }, extra);
}

test('normNombreAudiencias: mayúsculas sin tildes', () => {
  assert.equal(normNombreAudiencias('Juanse Pinzón'), 'JUANSE PINZON');
  assert.equal(normNombreAudiencias(' JUANSE PINZON '), 'JUANSE PINZON');
  assert.equal(normNombreAudiencias(''), '');
  assert.equal(normNombreAudiencias(null), '');
});

test('horaAudienciasMin y horaBonitaAudiencias: AM/PM y 24h', () => {
  assert.equal(horaAudienciasMin('9:00AM'), 540);
  assert.equal(horaAudienciasMin('2:00 PM'), 840);
  assert.equal(horaAudienciasMin('2:00PM'), 840);
  assert.equal(horaAudienciasMin('14:00'), 840);
  assert.equal(horaAudienciasMin('12:00PM'), 720);
  assert.ok(horaAudienciasMin('') >= 24 * 60); // ilegible al final
  assert.equal(horaBonitaAudiencias('9:00AM'), '9:00 a. m.');
  assert.equal(horaBonitaAudiencias('2:00PM'), '2:00 p. m.');
  assert.equal(horaBonitaAudiencias('12:00PM'), '12:00 p. m.');
});

test('agruparAudienciasPorDia: ordena por fecha y hora, agrupa sustanciadores', () => {
  const dias = agruparAudienciasPorDia([
    cita({ fecha: '06/04/2027', hora: '2:00PM', sustanciador: 'JUANSE PEREZ' }),
    cita({ fecha: '05/04/2027', hora: '2:00PM', sustanciador: 'VICTOR QUIROZ' }),
    cita({ fecha: '05/04/2027', hora: '9:00AM' }),
    { idCupo: 'x', fecha: '', estado: 'LIBRE' }, // sin fecha, fuera
  ]);
  assert.deepEqual(dias.map(d => d.fecha), ['05/04/2027', '06/04/2027']);
  assert.deepEqual(dias[0].cupos.map(c => c.hora), ['9:00AM', '2:00PM']);
  const grupos = agruparAudienciasPorSustanciador(dias[0].cupos);
  assert.deepEqual(grupos.map(g => g.sustanciador), ['PATRICIA LÓPEZ', 'VICTOR QUIROZ']);
  assert.equal(grupos[0].cupos.length, 1);
});

test('proximoDiaAudiencias: hoy si tiene cupos; si no, el próximo', () => {
  const dias = agruparAudienciasPorDia([
    cita({ fecha: '05/04/2027' }),
    cita({ fecha: '12/04/2027' }),
  ]);
  // Hoy lunes 05/04: ese mismo día.
  assert.equal(proximoDiaAudiencias(dias, new Date(2027, 3, 5)).fecha, '05/04/2027');
  // Jueves 08/04 (sin audiencias jue/vie): el próximo día con cupos es el lunes 12.
  assert.equal(proximoDiaAudiencias(dias, new Date(2027, 3, 8)).fecha, '12/04/2027');
  // Después del último día: null.
  assert.equal(proximoDiaAudiencias(dias, new Date(2027, 4, 1)), null);
});

test('filtrarListaAudiencias: solo citas, de hoy en adelante, búsqueda y estado', () => {
  const cupos = [
    cita({}), // 05/04, pasar
    cita({ idCupo: 'a2', fecha: '10/03/2027', radicado: '20272125870', expediente: '2312',
      citado: 'Diana Restrepo', visitaCompletada: false }),
    cita({ idCupo: 'a3', fecha: '12/04/2027', radicado: '20272146102', expediente: '2345',
      citado: 'Jorge Berrío', documentoCitado: '5566778', reservadoPor: 'Mauricio Herrera' }),
    { idCupo: 'a4', fecha: '05/04/2027', estado: 'LIBRE', sustanciador: 'VICTOR QUIROZ' }, // libre, fuera
  ];
  const hoy = '05/04/2027';
  // Por defecto: de hoy en adelante (la del 10/03 queda fuera), sin las libres.
  assert.deepEqual(filtrarListaAudiencias(cupos, { hoy }).map(c => c.idCupo), ['20270405-0900-PATRICIA', 'a3']);
  // Incluir pasadas la devuelve.
  assert.ok(filtrarListaAudiencias(cupos, { hoy, incluirPasadas: true })
    .some(c => c.idCupo === 'a2'));
  // Búsqueda por nombre, radicado, expediente y documento.
  const q = (t) => filtrarListaAudiencias(cupos, { hoy, incluirPasadas: true, q: t }).map(c => c.idCupo);
  assert.deepEqual(q('jorge'), ['a3']);
  assert.deepEqual(q('20272041228'), ['20270405-0900-PATRICIA']);
  assert.deepEqual(q('2201'), ['20270405-0900-PATRICIA']);
  assert.deepEqual(q('5566778'), ['a3']);
  assert.deepEqual(q('nada-que-calcule'), []);
  // «Mis citas» del inspector: solo las que reservó él.
  assert.deepEqual(
    filtrarListaAudiencias(cupos, { hoy, deQuien: 'MAURICIO HERRERA' }).map(c => c.idCupo), ['a3']);
});

// ── Pedir cita (TASK 3b) ──

test('normOrdenAudiencias y mismoCasoAudiencias: por radicado o por orden', () => {
  assert.equal(normOrdenAudiencias('2026-09-015'), '2026-9-15');
  assert.equal(normOrdenAudiencias('N/A'), '');
  assert.equal(mismoCasoAudiencias(cita({ radicado: '', ordenPolicia: '2026-09-386' }),
    { radicado: '', ordenPolicia: '2026-9-386' }), true);
  assert.equal(mismoCasoAudiencias(cita({}), { radicado: '20272041228' }), true);
  assert.equal(mismoCasoAudiencias(cita({}), { radicado: '20272041229' }), false);
});

test('opcionesPedirCita: una por fecha y hora, las 5 primeras', () => {
  const cupos = [
    cita({ idCupo: 'v', estado: 'LIBRE', sustanciador: 'VICTOR' }),
    cita({ idCupo: 'j', estado: 'LIBRE', sustanciador: 'JUANSE' }),       // misma fecha y hora
    cita({ idCupo: 't', estado: 'LIBRE', hora: '2:00PM' }),
    cita({ idCupo: 'm1', estado: 'LIBRE', fecha: '06/04/2027' }),
    cita({ idCupo: 'm2', estado: 'LIBRE', fecha: '06/04/2027', hora: '2:00PM' }),
    cita({ idCupo: 'x1', estado: 'LIBRE', fecha: '07/04/2027' }),
    cita({ idCupo: 'x2', estado: 'LIBRE', fecha: '12/04/2027' }),
  ];
  assert.deepEqual(opcionesPedirCita(cupos, 5).map(c => c.idCupo), ['v', 't', 'm1', 'm2', 'x1']);
});

test('casosAgendaHoyAudiencias: asignadas o iniciadas del inspector con fecha de hoy', () => {
  const hoy = new Date(2027, 3, 5);
  const filas = [
    { 'RADICADO': '20272041228', 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'ALEJANDRO',
      'FECHA ASIGNACION VISITA': '05/04/2027', 'DIRECCION INFRACCION': 'CL 50 # 32-10', 'BARRIO/VEREDA': 'NIQUÍA' },
    { 'RADICADO': '20272041229', 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'MAURICIO',
      'FECHA ASIGNACION VISITA': '05/04/2027' },
    { 'RADICADO': '20272041230', 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'ALEJANDRO',
      'FECHA ASIGNACION VISITA': '06/04/2027' },
    { 'RADICADO': 'OFICIO-2027-09-012', 'ESTADO VISITA': 'INICIADO', 'VISITADOR(ES)': 'ALEJANDRO',
      'FECHA DE VISITA': '05/04/2027', 'N° ORDEN DE POLICIA': '2027-09-012' },
    { 'RADICADO': '20272041231', 'ESTADO VISITA': 'COMPLETADO', 'VISITADOR(ES)': 'ALEJANDRO',
      'FECHA DE VISITA': '05/04/2027' },
  ];
  const r = casosAgendaHoyAudiencias(filas, 'ALEJANDRO', hoy);
  assert.deepEqual(r.map(c => c.radicado), ['20272041228', 'OFICIO-2027-09-012']);
  assert.equal(r[0].direccion, 'CL 50 # 32-10');
  assert.equal(r[1].ordenPolicia, '2027-09-012');
});

test('sugerirCasosAudiencias: por radicado o por orden sin ceros', () => {
  const filas = [
    { 'RADICADO': '20272041228' }, { 'RADICADO': '20272041228' }, // hermanas: una sola
    { 'RADICADO': 'OFICIO-2026-09-386', 'N° ORDEN DE POLICIA': '2026-09-386' },
  ];
  assert.deepEqual(sugerirCasosAudiencias(filas, '204122').map(c => c.radicado), ['20272041228']);
  assert.deepEqual(sugerirCasosAudiencias(filas, '2026-9-386').map(c => c.ordenPolicia), ['2026-09-386']);
  assert.deepEqual(sugerirCasosAudiencias(filas, '20'), []);
});

test('citaVigenteDelCaso y pedidasHoyAudiencias', () => {
  const cupos = [
    cita({ idCupo: 'vieja', fecha: '28/02/2027' }),
    cita({ idCupo: 'buena', reservadoEn: '01/03/2027 10:20' }),
    cita({ idCupo: 'otra', radicado: '1', reservadoEn: '01/03/2027 09:05', reservadoPor: 'Mauricio' }),
    cita({ idCupo: 'ayer', radicado: '2', reservadoEn: '28/02/2027 16:00' }),
    cita({ idCupo: 'libre', estado: 'LIBRE', reservadoEn: '' }),
  ];
  assert.equal(citaVigenteDelCaso(cupos, { radicado: '20272041228' }, '01/03/2027').idCupo, 'buena');
  assert.equal(citaVigenteDelCaso(cupos, { radicado: '99' }, '01/03/2027'), null);
  assert.deepEqual(pedidasHoyAudiencias(cupos, '01/03/2027').map(c => c.idCupo), ['buena', 'otra']);
});
