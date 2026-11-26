// ═══════════════════════════════════════════════════════════════
// tests/agenda-v3.test.js — Agenda v3 (2026-11-26, decisiones del usuario;
// maqueta propuesta-agenda-audiencias-v3.html): las vencidas primero, el
// estado de cada tarjeta de «El día», lo hecho en los días pasados y el
// siguiente día con cupo.
//
// utils.js → gruposUrgenciaAgenda, estadoItemAgenda, resumenDiaEquipo,
// siguienteDiaConCupo, semanaEquipo (con completadas).
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { gruposUrgenciaAgenda, estadoItemAgenda, resumenDiaEquipo, siguienteDiaConCupo,
  semanaEquipo, cuposDiaEquipo } = require('../utils.js');

test('vencidas primero aunque el puntaje ponga antes casos viejos sin prioridad', () => {
  // Orden de entrada = puntaje (como llega de porAgendarDia).
  const visitas = [
    { fila: 1, prioridad: null, dias: 673 },
    { fila: 2, prioridad: null, dias: 666 },
    { fila: 3, prioridad: 9, dias: 412 },  // Crítica (plazo 5): vencida
    { fila: 4, prioridad: 7, dias: 10 },   // Alta (plazo 20): no vencida
    { fila: 5, prioridad: null, dias: 800 },
    { fila: 6, prioridad: 5, dias: 40 },   // Media (plazo 30): vencida
  ];
  const g = gruposUrgenciaAgenda(visitas);
  assert.deepEqual(g.vencidas.map(v => v.fila), [3, 6]);
  // El resto, de la más antigua a la más nueva.
  assert.deepEqual(g.resto.map(v => v.fila), [5, 1, 2, 4]);
});

test('grupos: sin antigüedad al final y empates en el orden de llegada', () => {
  const g = gruposUrgenciaAgenda([
    { fila: 1, prioridad: null, dias: null },
    { fila: 2, prioridad: null, dias: 30 },
    { fila: 3, prioridad: null, dias: 30 },
  ]);
  assert.deepEqual(g.vencidas, []);
  assert.deepEqual(g.resto.map(v => v.fila), [2, 3, 1]);
  assert.deepEqual(gruposUrgenciaAgenda(null), { vencidas: [], resto: [] });
});

test('estado de la tarjeta: nueva, asignada, iniciada, completada', () => {
  assert.equal(estadoItemAgenda({ nueva: true, f: { 'ESTADO VISITA': 'ASIGNADO' } }), 'nueva');
  assert.equal(estadoItemAgenda({ f: { 'ESTADO VISITA': 'ASIGNADO' } }), 'asignada');
  assert.equal(estadoItemAgenda({ f: { 'ESTADO VISITA': 'iniciado' } }), 'iniciada');
  assert.equal(estadoItemAgenda({ f: { 'ESTADO VISITA': 'COMPLETADO' } }), 'completada');
  assert.equal(estadoItemAgenda({ f: { 'ESTADO VISITA': 'COMPLETADA' } }), 'completada');
});

const AH = 'ALEJANDRO HERNANDEZ', MH = 'MAURICIO HERRERA';
const F = o => Object.assign({ COMUNA: '10', DIRECCION: 'CL 1 # 2-3' }, o);

test('semana del equipo: las completadas del día entran y cuentan para la meta', () => {
  const datos = [
    F({ _idx: 1, 'ESTADO VISITA': 'COMPLETADO', 'VISITADOR(ES)': AH, 'FECHA DE VISITA': '23/11/2026', 'FECHA ASIGNACION VISITA': '23/11/2026' }),
    F({ _idx: 2, 'ESTADO VISITA': 'INICIADO', 'VISITADOR(ES)': AH, 'FECHA DE VISITA': '23/11/2026', 'FECHA ASIGNACION VISITA': '20/11/2026' }),
    F({ _idx: 3, 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': MH, 'FECHA ASIGNACION VISITA': '23/11/2026' }),
    F({ _idx: 4, 'ESTADO VISITA': 'PENDIENTE', 'FECHA ASIGNACION VISITA': '23/11/2026' }),
  ];
  const s = semanaEquipo(datos, new Date(2026, 10, 23), [AH, MH]);
  const ah = s.filas[0].dias[0], mh = s.filas[1].dias[0];
  assert.equal(ah.total, 2);
  assert.equal(ah.hechas, 1);
  assert.deepEqual(ah.items.map(it => it.estado).sort(), ['completada', 'iniciada']);
  assert.equal(mh.items[0].estado, 'asignada');
  assert.deepEqual(resumenDiaEquipo(s, 0), { hechas: 1, sinTerminar: 2, total: 3 });
  assert.deepEqual(cuposDiaEquipo(s, 0, [AH, MH], 2), { total: 4, usados: 3, libres: 1 });
  assert.deepEqual(resumenDiaEquipo(null, 0), { hechas: 0, sinTerminar: 0, total: 0 });
});

test('siguiente día con cupo: salta pasados, festivos y llenos', () => {
  const dia = (n, habil) => ({ date: new Date(2026, 10, n), habil: habil !== false });
  const dias = [dia(23), dia(24), dia(25), dia(26), dia(27)];
  const hoy = new Date(2026, 10, 25);
  const libres = [4, 4, 4, 0, 2];
  assert.equal(siguienteDiaConCupo(dias, 0, hoy, k => libres[k]), 2);
  assert.equal(siguienteDiaConCupo(dias, 3, hoy, k => libres[k]), 4);
  dias[4].habil = false;
  assert.equal(siguienteDiaConCupo(dias, 3, hoy, k => libres[k]), -1);
});
