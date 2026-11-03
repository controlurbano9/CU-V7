// ═══════════════════════════════════════════════════════════════
// tests/cupos-lista.test.js — lógica de «Cupos» como lista
// (2026-11-03). utils.js → vista previa de «Agregar cupos» (las
// mismas reglas que el backend), filtro y resumen de la lista.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { previsualizarCupos, filtrarCuposLista, resumenCuposLista } = require('../utils.js');

// «Hoy» del banco: lunes 05/04/2027.
const HOY = new Date(2027, 3, 5);

function cupo(extra) {
  return Object.assign({
    idCupo: 'x', fecha: '05/04/2027', hora: '9:00AM',
    sustanciador: 'VICTOR QUIROZ', estado: 'LIBRE'
  }, extra);
}

test('previsualizarCupos: crea los días hábiles del rango', () => {
  const r = previsualizarCupos([], {
    desde: '05/04/2027', hasta: '09/04/2027', dias: [1, 2, 3, 4, 5],
    horas: ['9:00AM'], sustanciadores: ['VICTOR QUIROZ']
  }, HOY);
  assert.equal(r.crear.length, 5);
  assert.equal(r.omitidos.length, 0);
  assert.equal(r.crear[0].fecha, '05/04/2027');
  assert.equal(r.crear[4].fecha, '09/04/2027');
});

test('previsualizarCupos: fin de semana se omite', () => {
  // Semana del lunes 05/04 al domingo 11/04: Sáb 10 y Dom 11 se omiten.
  const r = previsualizarCupos([], {
    desde: '05/04/2027', hasta: '11/04/2027', dias: [0, 1, 2, 3, 4, 5, 6],
    horas: ['9:00AM'], sustanciadores: ['VICTOR QUIROZ']
  }, HOY);
  const motivos = r.omitidos.map(function (o) { return o.motivo; });
  assert.equal(r.crear.length, 5);
  assert.deepEqual(motivos, ['fin de semana', 'fin de semana']);
});

test('previsualizarCupos: fecha pasada se omite', () => {
  // Jue 01/04 a dom 04/04: todo es anterior al «hoy» del banco.
  const r = previsualizarCupos([], {
    desde: '01/04/2027', hasta: '04/04/2027', dias: [0, 1, 2, 3, 4, 5, 6],
    horas: ['9:00AM'], sustanciadores: ['VICTOR QUIROZ']
  }, HOY);
  const motivos = r.omitidos.map(function (o) { return o.motivo; });
  assert.equal(r.crear.length, 0);
  assert.deepEqual(motivos, ['fecha pasada', 'fecha pasada', 'fecha pasada', 'fecha pasada']);
});

test('previsualizarCupos: festivo se omite (Ascensión, lunes 10/05/2027)', () => {
  const r = previsualizarCupos([], {
    desde: '10/05/2027', hasta: '10/05/2027', dias: [1],
    horas: ['9:00AM'], sustanciadores: ['VICTOR QUIROZ']
  }, HOY);
  assert.equal(r.crear.length, 0);
  assert.equal(r.omitidos[0].motivo, 'festivo');
});

test('previsualizarCupos: el que ya existe se omite', () => {
  const existentes = [cupo({ idCupo: 'e1', fecha: '05/04/2027', hora: '9:00AM', sustanciador: 'VICTOR QUIROZ' })];
  const r = previsualizarCupos(existentes, {
    desde: '05/04/2027', hasta: '06/04/2027', dias: [1, 2],
    horas: ['9:00AM', '2:00PM'], sustanciadores: ['VICTOR QUIROZ']
  }, HOY);
  assert.equal(r.crear.length, 3);   // 2PM lun + 9AM/2PM mar
  assert.equal(r.omitidos.filter(function (o) { return o.motivo === 'ya existe'; }).length, 1);
});

test('previsualizarCupos: repetido en la misma selección no duplica', () => {
  const r = previsualizarCupos([], {
    desde: '05/04/2027', hasta: '05/04/2027', dias: [1],
    horas: ['2:00PM', '2:00PM'], sustanciadores: ['VICTOR QUIROZ']
  }, HOY);
  assert.equal(r.crear.length, 1);
  assert.equal(r.omitidos.length, 1);
  assert.equal(r.omitidos[0].motivo, 'ya existe');
});

test('previsualizarCupos: el sustanciador se compara sin tildes', () => {
  const existentes = [cupo({ sustanciador: 'PATRICIA LÓPEZ' })];
  const r = previsualizarCupos(existentes, {
    desde: '05/04/2027', hasta: '05/04/2027', dias: [1],
    horas: ['9:00AM'], sustanciadores: ['patricia lopez']
  }, HOY);
  assert.equal(r.crear.length, 0);
  assert.equal(r.omitidos[0].motivo, 'ya existe');
});

test('previsualizarCupos: rango inválido devuelve vacío', () => {
  const r = previsualizarCupos([], {
    desde: '09/04/2027', hasta: '05/04/2027', dias: [1],
    horas: ['9:00AM'], sustanciadores: ['X']
  }, HOY);
  assert.deepEqual(r, { crear: [], omitidos: [] });
});

test('filtrarCuposLista: mes, estado y sustanciador', () => {
  const cupos = [
    cupo({ fecha: '05/04/2027', estado: 'LIBRE', sustanciador: 'VICTOR QUIROZ' }),
    cupo({ fecha: '06/05/2027', estado: 'RESERVADO', sustanciador: 'PATRICIA LÓPEZ' }),
    cupo({ fecha: '05/04/2027', hora: '2:00PM', estado: 'BLOQUEADO', sustanciador: 'JUANSE PEREZ' }),
  ];
  assert.equal(filtrarCuposLista(cupos, { mes: '2027-04' }).length, 2);
  assert.equal(filtrarCuposLista(cupos, { estado: 'RESERVADO' }).length, 1);
  assert.equal(filtrarCuposLista(cupos, { sustanciador: 'patricia lopez' }).length, 1);
  assert.equal(filtrarCuposLista(cupos, {}).length, 3);
});

test('filtrarCuposLista: ordena por fecha y hora', () => {
  const cupos = [
    cupo({ fecha: '06/04/2027' }),
    cupo({ fecha: '05/04/2027', hora: '2:00PM' }),
    cupo({ fecha: '05/04/2027', hora: '9:00AM' }),
  ];
  const r = filtrarCuposLista(cupos, {});
  assert.deepEqual(r.map(function (c) { return c.fecha + c.hora; }),
    ['05/04/20279:00AM', '05/04/20272:00PM', '06/04/20279:00AM']);
});

test('resumenCuposLista: conteos y última fecha', () => {
  const cupos = [
    cupo({ estado: 'LIBRE' }),
    cupo({ estado: 'LIBRE', fecha: '02/04/2027' }),
    cupo({ estado: 'RESERVADO', fecha: '30/12/2027' }),
    cupo({ estado: 'BLOQUEADO' }),
    cupo({ estado: 'POR_APARTAR' }),
  ];
  const r = resumenCuposLista(cupos);
  assert.equal(r.libres, 2);
  assert.equal(r.citados, 1);
  assert.equal(r.bloqueados, 1);
  assert.equal(r.porApartar, 1);
  assert.equal(r.hasta, '30/12/2027');
});
