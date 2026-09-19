// ═══════════════════════════════════════════════════════════════
// tests/semana-visitas.test.js — calendario semanal de Inicio (utils.js).
//
// Contrato del que depende semana-visitas.jsx: el componente solo pinta.
// La regla que más se puede romper sin que nadie lo note es la del §3 del
// plan: una visita se queda en SU día. Registrar no es visitar, así que
// nada puede reubicarse en "hoy".
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rangoSemana, fechaAgendaVisita, agruparSemana, diasSinIniciar, offsetSemanaDe } = require('../utils.js');

const dd = (d) => (d ? d.getDate() + '/' + (d.getMonth() + 1) : null);

// ── rangoSemana ────────────────────────────────────────────────

test('rangoSemana — devuelve lunes a viernes, sin fin de semana', () => {
  const r = rangoSemana(new Date(2026, 8, 16), 0); // miércoles 16/09/2026
  assert.equal(r.dias.length, 5);
  assert.deepEqual(r.dias.map(dd), ['14/9', '15/9', '16/9', '17/9', '18/9']);
  assert.equal(r.lunes.getDay(), 1);
});

test('rangoSemana — el domingo cierra la semana que termina, no abre la siguiente', () => {
  const r = rangoSemana(new Date(2026, 8, 20), 0); // domingo 20/09/2026
  assert.deepEqual(r.dias.map(dd), ['14/9', '15/9', '16/9', '17/9', '18/9']);
});

test('rangoSemana — el sábado también pertenece a la semana que termina', () => {
  const r = rangoSemana(new Date(2026, 8, 19), 0); // sábado 19/09/2026
  assert.deepEqual(r.dias.map(dd), ['14/9', '15/9', '16/9', '17/9', '18/9']);
});

test('rangoSemana — cruza fin de mes', () => {
  const r = rangoSemana(new Date(2026, 8, 30), 0); // miércoles 30/09/2026
  assert.deepEqual(r.dias.map(dd), ['28/9', '29/9', '30/9', '1/10', '2/10']);
});

test('rangoSemana — cruza fin de año', () => {
  const r = rangoSemana(new Date(2026, 11, 31), 0); // jueves 31/12/2026
  assert.deepEqual(r.dias.map(dd), ['28/12', '29/12', '30/12', '31/12', '1/1']);
  assert.equal(r.dias[4].getFullYear(), 2027);
});

test('rangoSemana — el offset navega semanas completas', () => {
  assert.deepEqual(rangoSemana(new Date(2026, 8, 16), -1).dias.map(dd),
    ['7/9', '8/9', '9/9', '10/9', '11/9']);
  assert.deepEqual(rangoSemana(new Date(2026, 8, 16), 1).dias.map(dd),
    ['21/9', '22/9', '23/9', '24/9', '25/9']);
});

// ── fechaAgendaVisita ──────────────────────────────────────────

test('fechaAgendaVisita — la asignada vive en su fecha de asignación', () => {
  const f = { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '17/09/2026' };
  assert.equal(dd(fechaAgendaVisita(f)), '17/9');
});

test('fechaAgendaVisita — la iniciada vive en la fecha de visita, no en la de asignación', () => {
  const f = {
    'ESTADO VISITA': 'INICIADO',
    'FECHA ASIGNACION VISITA': '14/09/2026',
    'FECHA DE VISITA': '16/09/2026',
  };
  assert.equal(dd(fechaAgendaVisita(f)), '16/9');
});

test('fechaAgendaVisita — iniciada sin fecha de visita cae en la de asignación', () => {
  const f = { 'ESTADO VISITA': 'INICIADO', 'FECHA ASIGNACION VISITA': '14/09/2026' };
  assert.equal(dd(fechaAgendaVisita(f)), '14/9');
});

test('fechaAgendaVisita — sin fechas legibles devuelve null y no lanza', () => {
  assert.equal(fechaAgendaVisita({ 'ESTADO VISITA': 'ASIGNADO' }), null);
  assert.equal(fechaAgendaVisita({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': 'N/A' }), null);
  assert.equal(fechaAgendaVisita(null), null);
});

// ── agruparSemana ──────────────────────────────────────────────

const DIAS = rangoSemana(new Date(2026, 8, 16), 0).dias; // 14–18 sep

test('agruparSemana — reparte por día y respeta el día propio de cada visita', () => {
  const filas = [
    { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '14/09/2026', 'VISITADOR(ES)': 'MAURICIO' },
    { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '17/09/2026', 'VISITADOR(ES)': 'MAURICIO' },
    { 'ESTADO VISITA': 'COMPLETADO', 'FECHA ASIGNACION VISITA': '14/09/2026', 'FECHA DE VISITA': '15/09/2026', 'VISITADOR(ES)': 'MAURICIO' },
  ];
  const r = agruparSemana(filas, DIAS, { esAdmin: true });
  assert.deepEqual(r.porDia.map(l => l.length), [1, 1, 0, 1, 0]);
  assert.equal(r.sinFecha, 0);
});

test('agruparSemana — lo de fuera de la semana no entra ni cuenta como sin fecha', () => {
  const filas = [
    { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '09/09/2026', 'VISITADOR(ES)': 'MAURICIO' },
    { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '22/09/2026', 'VISITADOR(ES)': 'MAURICIO' },
  ];
  const r = agruparSemana(filas, DIAS, { esAdmin: true });
  assert.deepEqual(r.porDia.map(l => l.length), [0, 0, 0, 0, 0]);
  assert.equal(r.sinFecha, 0);
});

test('agruparSemana — sin fecha ubicable se cuenta, pero la PENDIENTE de bandeja no', () => {
  const filas = [
    { 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'MAURICIO' },
    { 'ESTADO VISITA': 'INICIADO', 'VISITADOR(ES)': 'MAURICIO' },
    { 'ESTADO VISITA': 'PENDIENTE', 'VISITADOR(ES)': '' },
    { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': 'no es fecha', 'VISITADOR(ES)': 'MAURICIO' },
  ];
  const r = agruparSemana(filas, DIAS, { esAdmin: true });
  assert.equal(r.sinFecha, 3);
});

test('agruparSemana — el inspector solo ve las suyas', () => {
  const filas = [
    { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '15/09/2026', 'VISITADOR(ES)': 'MAURICIO' },
    { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '15/09/2026', 'VISITADOR(ES)': 'ALEJANDRO' },
  ];
  const r = agruparSemana(filas, DIAS, { esAdmin: false, miNombre: 'MAURICIO' });
  assert.equal(r.porDia[1].length, 1);
  assert.equal(r.porDia[1][0]['VISITADOR(ES)'], 'MAURICIO');
});

test('agruparSemana — regla del diligenciador: el co-asignado no ve la INICIADA ajena', () => {
  const asignada = { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '15/09/2026', 'VISITADOR(ES)': 'MAURICIO / ALEJANDRO' };
  const iniciada = { 'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '16/09/2026', 'VISITADOR(ES)': 'MAURICIO / ALEJANDRO' };
  const co = agruparSemana([asignada, iniciada], DIAS, { esAdmin: false, miNombre: 'ALEJANDRO' });
  assert.equal(co.porDia[1].length, 1, 'la asignada sí la ve el co-asignado');
  assert.equal(co.porDia[2].length, 0, 'la iniciada es solo del diligenciador');

  const dil = agruparSemana([asignada, iniciada], DIAS, { esAdmin: false, miNombre: 'MAURICIO' });
  assert.equal(dil.porDia[2].length, 1);
});

test('agruparSemana — el filtro de inspector del admin usa la misma regla', () => {
  const filas = [
    { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '15/09/2026', 'VISITADOR(ES)': 'MAURICIO' },
    { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '15/09/2026', 'VISITADOR(ES)': 'ALEJANDRO' },
  ];
  assert.equal(agruparSemana(filas, DIAS, { esAdmin: true }).porDia[1].length, 2);
  assert.equal(agruparSemana(filas, DIAS, { esAdmin: true, inspector: 'ALEJANDRO' }).porDia[1].length, 1);
});

test('agruparSemana — dentro del día ordena por comuna y luego por radicado', () => {
  const filas = [
    { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '15/09/2026', 'COMUNA': 'C9', 'RADICADO': '2026-1900' },
    { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '15/09/2026', 'COMUNA': 'C3', 'RADICADO': '2026-1999' },
    { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '15/09/2026', 'COMUNA': 'C3', 'RADICADO': '2026-1901' },
  ];
  const r = agruparSemana(filas, DIAS, { esAdmin: true });
  assert.deepEqual(r.porDia[1].map(f => f['COMUNA'] + '/' + f['RADICADO']),
    ['C3/2026-1901', 'C3/2026-1999', 'C9/2026-1900']);
});

test('agruparSemana — semana vacía y entrada vacía no rompen', () => {
  assert.deepEqual(agruparSemana([], DIAS, { esAdmin: true }).porDia.map(l => l.length), [0, 0, 0, 0, 0]);
  assert.deepEqual(agruparSemana(null, DIAS, {}).porDia.map(l => l.length), [0, 0, 0, 0, 0]);
});

// ── diasSinIniciar ─────────────────────────────────────────────
// El umbral de la alerta son 5 días hábiles. 11/09/2026 es viernes.

test('diasSinIniciar — cuenta hábiles y salta el fin de semana', () => {
  const f = { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '11/09/2026' };
  assert.equal(diasSinIniciar(f, new Date(2026, 8, 17)), 4, 'viernes a jueves = 4 hábiles');
  assert.equal(diasSinIniciar(f, new Date(2026, 8, 18)), 5, 'viernes a viernes = 5, alerta');
});

test('diasSinIniciar — el mismo día es 0', () => {
  const f = { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '18/09/2026' };
  assert.equal(diasSinIniciar(f, new Date(2026, 8, 18)), 0);
});

test('diasSinIniciar — una asignación a futuro no acumula días', () => {
  const f = { 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '25/09/2026' };
  assert.equal(diasSinIniciar(f, new Date(2026, 8, 18)), 0);
});

test('diasSinIniciar — solo aplica a lo que no ha empezado', () => {
  const base = { 'FECHA ASIGNACION VISITA': '01/09/2026' };
  assert.equal(diasSinIniciar({ ...base, 'ESTADO VISITA': 'PENDIENTE' }, new Date(2026, 8, 18)), 13);
  assert.equal(diasSinIniciar({ ...base, 'ESTADO VISITA': 'INICIADO' }, new Date(2026, 8, 18)), null);
  assert.equal(diasSinIniciar({ ...base, 'ESTADO VISITA': 'COMPLETADO' }, new Date(2026, 8, 18)), null);
});

test('diasSinIniciar — sin fecha legible no alerta', () => {
  assert.equal(diasSinIniciar({ 'ESTADO VISITA': 'ASIGNADO' }, new Date(2026, 8, 18)), null);
  assert.equal(diasSinIniciar({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': 'N/A' }, new Date(2026, 8, 18)), null);
  assert.equal(diasSinIniciar(null, new Date(2026, 8, 18)), null);
});

// -- offsetSemanaDe --------------------------------------------
// Alimenta «Ver en su semana»: la visita no se mueve, se mueve la semana.

test('offsetSemanaDe -- misma semana es 0 aunque cambie el día', () => {
  const hoy = new Date(2026, 8, 16); // miércoles 16/09
  assert.equal(offsetSemanaDe('14/09/2026', hoy), 0);
  assert.equal(offsetSemanaDe('18/09/2026', hoy), 0);
});

test('offsetSemanaDe -- semanas atrás y adelante', () => {
  const hoy = new Date(2026, 8, 16);
  assert.equal(offsetSemanaDe('09/09/2026', hoy), -1);
  assert.equal(offsetSemanaDe('02/09/2026', hoy), -2);
  assert.equal(offsetSemanaDe('25/09/2026', hoy), 1);
});

test('offsetSemanaDe -- el fin de semana cuenta con la semana que cierra', () => {
  const hoy = new Date(2026, 8, 16);
  assert.equal(offsetSemanaDe('19/09/2026', hoy), 0, 'sábado 19 va con la semana del 14');
  assert.equal(offsetSemanaDe('20/09/2026', hoy), 0, 'domingo 20 también');
  assert.equal(offsetSemanaDe('21/09/2026', hoy), 1, 'el lunes 21 ya es la siguiente');
});

test('offsetSemanaDe -- cruza el año', () => {
  assert.equal(offsetSemanaDe('05/01/2027', new Date(2026, 11, 31)), 1);
});

test('offsetSemanaDe -- sin fecha legible devuelve null', () => {
  assert.equal(offsetSemanaDe('', new Date(2026, 8, 16)), null);
  assert.equal(offsetSemanaDe('N/A', new Date(2026, 8, 16)), null);
});
