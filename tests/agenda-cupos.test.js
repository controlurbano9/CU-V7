// ═══════════════════════════════════════════════════════════════
// tests/agenda-cupos.test.js — Agenda rediseñada (2026-11-10): cupos del
// día sin separar por visitador (meta × visitadores, cuentan visitas e
// inspecciones, no es tope), fecha con año en la confirmación, agrupar
// por barrio y «Proponer».
//
// utils.js → cuposDiaEquipo, fechaLargaConAnio, horaLargaInspeccion,
// agruparPorBarrioAgenda, proponerDiaAgenda.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cuposDiaEquipo, fechaLargaConAnio, horaLargaInspeccion, agruparPorBarrioAgenda,
  proponerDiaAgenda } = require('../utils.js');

const AH = 'ALEJANDRO HERNANDEZ MUÑOZ', MH = 'MAURICIO HERRERA LOPERA', DP = 'DANIEL PEDRAZA';
const semana = { filas: [
  { inspector: AH, dias: [{ total: 2 }, { total: 1 }, { total: 0 }, { total: 3 }, { total: 0 }] },
  { inspector: MH, dias: [{ total: 2 }, { total: 0 }, { total: 1 }, { total: 2 }, { total: 0 }] },
  { inspector: DP, dias: [{ total: 1 }, { total: 4 }, { total: 0 }, { total: 0 }, { total: 0 }] },
] };

test('cupos: 2 por visitador de la agenda, sin contar a quien no está en Reglas', () => {
  assert.deepEqual(cuposDiaEquipo(semana, 0, [AH, MH], 2), { total: 4, usados: 4, libres: 0 });
  assert.deepEqual(cuposDiaEquipo(semana, 1, [AH, MH], 2), { total: 4, usados: 1, libres: 3 });
  assert.deepEqual(cuposDiaEquipo(semana, 4, [AH, MH], 2), { total: 4, usados: 0, libres: 4 });
});

test('cupos: es meta, no tope (pasarse deja libres negativo)', () => {
  assert.deepEqual(cuposDiaEquipo(semana, 3, [AH, MH], 2), { total: 4, usados: 5, libres: -1 });
  assert.deepEqual(cuposDiaEquipo(null, 0, [AH], 2), { total: 2, usados: 0, libres: 2 });
});

test('fecha de la confirmación con año; hora con a. m. / p. m.', () => {
  assert.equal(fechaLargaConAnio('09/11/2026'), 'Lunes 9 de noviembre de 2026');
  assert.equal(fechaLargaConAnio(new Date(2027, 0, 4)), 'Lunes 4 de enero de 2027');
  assert.equal(fechaLargaConAnio(''), '');
  assert.equal(horaLargaInspeccion('9:00AM'), '9:00 a. m.');
  assert.equal(horaLargaInspeccion('2:00PM'), '2:00 p. m.');
  assert.equal(horaLargaInspeccion('10:00 am'), '10:00 a. m.');
  assert.equal(horaLargaInspeccion(''), '');
});

test('agrupar por barrio: en el orden de urgencia del primer caso de cada barrio', () => {
  const g = agruparPorBarrioAgenda([
    { fila: 1, barrio: 'PARÍS' }, { fila: 2, barrio: 'NIQUÍA' }, { fila: 3, barrio: 'parís ' }, { fila: 4, barrio: '' },
  ]);
  assert.deepEqual(g.map(x => [x.barrio, x.visitas.map(v => v.fila)]),
    [['PARÍS', [1, 3]], ['NIQUÍA', [2]], ['Sin barrio', [4]]]);
});

test('proponer: llena lo que falta de la meta, prefiere el barrio que ya visita', () => {
  const visitas = [
    { fila: 10, radicado: 'A', barrio: 'PARÍS' },
    { fila: 11, radicado: 'B', barrio: 'NIQUÍA' },
    { fila: 12, radicado: 'C', barrio: 'LA FLORIDA' },
    { fila: 13, radicado: 'D', barrio: 'PARÍS' },
    { fila: 14, radicado: 'E', barrio: 'LA FLORIDA' },
  ];
  // Alejandro ya va a La Florida (1 de 2); Mauricio no lleva nada.
  const r = proponerDiaAgenda(visitas, { [AH]: { n: 1, barrios: ['La Florida'] } }, [AH, MH], 2);
  assert.deepEqual(r, [
    { fila: 12, radicado: 'C', inspector: AH },
    { fila: 10, radicado: 'A', inspector: MH },
    { fila: 13, radicado: 'D', inspector: MH },
  ]);
});

test('proponer: nada si ya cumplieron la meta o no hay sugeridas', () => {
  assert.deepEqual(proponerDiaAgenda([{ fila: 1, barrio: 'X' }], { [AH]: { n: 2, barrios: [] } }, [AH], 2), []);
  assert.deepEqual(proponerDiaAgenda([], {}, [AH, MH], 2), []);
});
