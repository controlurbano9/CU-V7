// ═══════════════════════════════════════════════════════════════
// tests/inicio-inspector.test.js — lo que Mis visitas hereda de Inicio (E3).
//
// Completadas por mes y audiencias a ≤3 días hábiles viven en utils.js para
// que Inicio y Mis visitas no puedan decir números distintos. Lo que más se
// puede romper sin que se note: (1) contar por la fecha equivocada (de
// devolución en vez de la de visita), (2) mostrar la audiencia de otro
// inspector o de una visita que no está iniciada.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { completadasMesesVisita, audienciasProximas, DIAS_ALERTA_AUDIENCIA } = require('../utils.js');

const HOY = new Date(2026, 9, 5); // lunes 05/10/2026
const YO = 'DANIEL PEDRAZA';
const fila = (extra) => Object.assign({ 'VISITADOR(ES)': YO, 'RADICADO': '20261000001', 'ESTADO VISITA': 'INICIADO' }, extra);

// ── completadasMesesVisita ─────────────────────────────────────

test('completadasMesesVisita — cuenta por FECHA DE VISITA, mes actual y anterior', () => {
  const hechas = [
    { f: fila({ 'FECHA DE VISITA': '02/10/2026' }) },
    { f: fila({ 'FECHA DE VISITA': '30/09/2026' }) },
    { f: fila({ 'FECHA DE VISITA': '01/09/2026' }) },
    { f: fila({ 'FECHA DE VISITA': '31/08/2026' }) },   // dos meses atrás: no cuenta
    { f: fila({ 'FECHA DE VISITA': '15/10/2025' }) },   // mismo mes, otro año: no cuenta
    { f: fila({ 'FECHA DE VISITA': '' }) },             // sin fecha: no cuenta
  ];
  assert.deepEqual(completadasMesesVisita(hechas, HOY), { actual: 1, anterior: 2 });
});

test('completadasMesesVisita — enero mira diciembre del año anterior', () => {
  const hechas = [{ f: fila({ 'FECHA DE VISITA': '20/12/2025' }) }, { f: fila({ 'FECHA DE VISITA': '10/01/2026' }) }];
  assert.deepEqual(completadasMesesVisita(hechas, new Date(2026, 0, 12)), { actual: 1, anterior: 1 });
});

test('completadasMesesVisita — sin datos no revienta', () => {
  assert.deepEqual(completadasMesesVisita(null, HOY), { actual: 0, anterior: 0 });
  assert.deepEqual(completadasMesesVisita([], HOY), { actual: 0, anterior: 0 });
});

// ── audienciasProximas ─────────────────────────────────────────

test('audienciasProximas — umbral de 3 días hábiles, la más próxima primero', () => {
  assert.equal(DIAS_ALERTA_AUDIENCIA, 3);
  const r = audienciasProximas([
    fila({ 'RADICADO': 'B', 'FECHA CITACION': '08/10/2026 · 9:00 a. m.' }),  // jue: 3 días hábiles
    fila({ 'RADICADO': 'A', 'FECHA CITACION': '05/10/2026' }),               // hoy: 0
    fila({ 'RADICADO': 'C', 'FECHA CITACION': '09/10/2026' }),               // vie: 4 → fuera
  ], YO, HOY);
  assert.deepEqual(r.map(x => [x.f.RADICADO, x.dias]), [['A', 0], ['B', 3]]);
});

test('audienciasProximas — audiencia pasada no alerta', () => {
  assert.equal(audienciasProximas([fila({ 'FECHA CITACION': '02/10/2026' })], YO, HOY).length, 0);
});

test('audienciasProximas — solo INICIADO y solo del diligenciador', () => {
  const r = audienciasProximas([
    fila({ 'RADICADO': 'ASIG', 'ESTADO VISITA': 'ASIGNADO', 'FECHA CITACION': '06/10/2026' }),
    fila({ 'RADICADO': 'COMP', 'ESTADO VISITA': 'COMPLETADO', 'FECHA CITACION': '06/10/2026' }),
    // iniciada por otro (el primero de VISITADOR(ES) es quien la lleva)
    fila({ 'RADICADO': 'AJENA', 'VISITADOR(ES)': 'OTRA PERSONA / ' + YO, 'FECHA CITACION': '06/10/2026' }),
    fila({ 'RADICADO': 'MIA', 'FECHA CITACION': '06/10/2026' }),
  ], YO, HOY);
  assert.deepEqual(r.map(x => x.f.RADICADO), ['MIA']);
});

test('audienciasProximas — sin nombre no filtra (vista de sistema del admin)', () => {
  const r = audienciasProximas([
    fila({ 'RADICADO': 'X', 'VISITADOR(ES)': 'OTRA PERSONA', 'FECHA CITACION': '06/10/2026' }),
  ], '', HOY);
  assert.equal(r.length, 1);
});
