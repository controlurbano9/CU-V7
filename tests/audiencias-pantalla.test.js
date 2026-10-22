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
  proximoDiaAudiencias, estadoListaAudiencias,
  filtrarListaAudiencias, filaTsvAudiencias,
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

test('estadoListaAudiencias: excel > pend > pasar', () => {
  assert.equal(estadoListaAudiencias(cita({})), 'pasar');
  assert.equal(estadoListaAudiencias(cita({ visitaCompletada: false })), 'pend');
  assert.equal(estadoListaAudiencias(cita({ enviadoExcel: '20/04/2027' })), 'excel');
  assert.equal(estadoListaAudiencias(cita({ enviadoExcel: '20/04/2027', visitaCompletada: false })), 'excel');
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
  // Chip de estado.
  assert.deepEqual(filtrarListaAudiencias(cupos, { hoy, incluirPasadas: true, estado: 'pend' })
    .map(c => c.idCupo), ['a2']);
  // «Mis citas» del inspector: solo las que reservó él.
  assert.deepEqual(
    filtrarListaAudiencias(cupos, { hoy, deQuien: 'MAURICIO HERRERA' }).map(c => c.idCupo), ['a3']);
});

test('filaTsvAudiencias: 8 columnas tabuladas', () => {
  const tsv = filaTsvAudiencias(cita());
  assert.equal(tsv.split('\t').length, 8);
  assert.equal(tsv, '05/04/2027\t9:00AM\tPATRICIA LÓPEZ\t20272041228\t2201\tCarlos Ramírez\t\tCL 50 # 32-10');
  assert.equal(filaTsvAudiencias(null), '\t\t\t\t\t\t\t');
});
