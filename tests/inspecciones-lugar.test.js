// ═══════════════════════════════════════════════════════════════
// tests/inspecciones-lugar.test.js — inspecciones al lugar (2026-11-03,
// decisiones del usuario): se programan en la app (admin y supervisores),
// no se importan del Excel. La lógica mira todas las visitas del caso
// (inspeccionDelCaso) y la hora va en el formato del Excel en BD.
//
// utils.js → inspeccionDelCaso, horaParaBD, horaParaInput,
// inspeccionVisitaTexto, ordenarVisitasDia (las inspecciones van primero,
// por hora).
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { inspeccionDelCaso, horaParaBD, horaParaInput, inspeccionVisitaTexto,
  ordenarVisitasDia, esNoCompetenciaFila } = require('../utils.js');

const HOY = new Date(2026, 10, 3); // martes 03/11/2026
const V = (o) => Object.assign({ 'N° VISITA': '1', 'ESTADO VISITA': 'COMPLETADO' }, o);

test('horaParaBD / horaParaInput: HH:mm ↔ formato del Excel', () => {
  assert.equal(horaParaBD('14:30'), '2:30PM');
  assert.equal(horaParaBD('09:00'), '9:00AM');
  assert.equal(horaParaBD('00:30'), '12:30AM');
  assert.equal(horaParaBD('12:00'), '12:00PM');
  assert.equal(horaParaBD('9:00'), '9:00AM');
  assert.equal(horaParaBD('25:00'), '');
  assert.equal(horaParaBD(''), '');
  assert.equal(horaParaInput('9:00AM'), '09:00');
  assert.equal(horaParaInput('2:30PM'), '14:30');
  assert.equal(horaParaInput('12:30AM'), '00:30'); // horaAudienciasMin no distingue las 12
  assert.equal(horaParaInput('12:30PM'), '12:30');
  assert.equal(horaParaInput('14:30'), '14:30');   // sin AM/PM pasa igual
  assert.equal(horaParaInput('SE ENTREGA AL INSPECTOR'), '');
});

test('inspeccionDelCaso: rol que no ve todas las visitas → puede:false sin motivo', () => {
  const r = inspeccionDelCaso([V({ _idx: 10, RADICADO: '20251020602' })], 'INSPECTOR');
  assert.equal(r.puede, false);
  assert.equal(r.motivo, '');
  assert.equal(r.modo, null);
  assert.equal(inspeccionDelCaso([V({ _idx: 10, RADICADO: '20251020602' })], 'SUPERVISOR').puede, true);
});

test('inspeccionDelCaso: caso completado → visita nueva con el mismo inspector (fijo)', () => {
  const r = inspeccionDelCaso([V({ _idx: 10, RADICADO: '20251020602', 'VISITADOR(ES)': 'MAURICIO / DANIEL' })], 'ADMIN');
  assert.equal(r.puede, true);
  assert.equal(r.modo, 'nueva');
  assert.equal(r.fila, 10);          // origen = la última visita del caso
  assert.equal(r.nVisita, 2);
  assert.equal(r.inspector, 'MAURICIO');
  assert.equal(r.fijo, true);
  assert.equal(r.actual, null);
  assert.equal(r.radicado, '20251020602');
});

test('inspeccionDelCaso: inspección viva → reprogramar con su fecha y hora', () => {
  const bd = [
    V({ _idx: 19, RADICADO: '20251000381', 'VISITADOR(ES)': 'ALEJANDRO' }),
    V({ _idx: 20, 'N° VISITA': '2', RADICADO: '20251000381', 'ESTADO VISITA': 'ASIGNADO',
      'VISITADOR(ES)': 'ALEJANDRO', DILIGENCIA: 'INSPECCION AL LUGAR', HORA_PROGRAMADA: '10:30AM',
      'FECHA ASIGNACION VISITA': '04/11/2026' }),
  ];
  const r = inspeccionDelCaso(bd, 'ADMIN');
  assert.equal(r.modo, 'reprogramar');
  assert.equal(r.fila, 20);
  assert.equal(r.nVisita, 2);
  assert.equal(r.inspector, 'ALEJANDRO');  // el de la fila de la inspección
  assert.equal(r.fijo, true);              // hubo visita anterior (Alejandro la hizo)
  assert.deepEqual(r.actual, { fecha: '04/11/2026', hora: '10:30AM' });
});

test('inspeccionDelCaso: inspección viva gana sobre la visita iniciada (regla 2 antes que 3)', () => {
  const bd = [
    V({ _idx: 30, RADICADO: '20261087427', 'ESTADO VISITA': 'INICIADO', 'VISITADOR(ES)': 'MAURICIO' }),
    V({ _idx: 31, 'N° VISITA': '2', RADICADO: '20261087427', 'ESTADO VISITA': 'PENDIENTE',
      DILIGENCIA: 'INSPECCIÓN AL LUGAR', HORA_PROGRAMADA: '9:00AM', 'FECHA ASIGNACION VISITA': '05/11/2026' }),
  ];
  const r = inspeccionDelCaso(bd, 'ADMIN');
  assert.equal(r.modo, 'reprogramar');
  assert.equal(r.fila, 31);
  assert.equal(r.inspector, 'MAURICIO');  // la fila no tiene: se propone quien hizo la visita 1
  assert.equal(r.fijo, true);
});

test('inspeccionDelCaso: visita iniciada → no se puede, se completa antes', () => {
  const bd = [V({ _idx: 30, RADICADO: '20261087427', 'ESTADO VISITA': 'INICIADO', 'VISITADOR(ES)': 'MAURICIO' })];
  const r = inspeccionDelCaso(bd, 'ADMIN');
  assert.equal(r.puede, false);
  assert.match(r.motivo, /La visita 1 está iniciada: complétala antes de programar\./);
});

test('inspeccionDelCaso: visita pendiente sin diligencia → se monta en ella; decide quién programa', () => {
  const bd = [V({ _idx: 11, RADICADO: '20261099090', 'ESTADO VISITA': 'PENDIENTE', 'VISITADOR(ES)': '' })];
  const r = inspeccionDelCaso(bd, 'ADMIN');
  assert.equal(r.puede, true);
  assert.equal(r.modo, 'montar');
  assert.equal(r.fila, 11);
  assert.equal(r.nVisita, 1);
  assert.equal(r.inspector, '');
  assert.equal(r.fijo, false);
});

test('inspeccionDelCaso: radicado viejo (NO COMPETENCIA) con visita asignada se monta en ella', () => {
  const bd = [V({ _idx: 50, RADICADO: '20231042120', 'ATENCION PQR': 'NO COMPETENCIA',
    'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'ALEJANDRO' })];
  const r = inspeccionDelCaso(bd, 'ADMIN');
  assert.equal(r.modo, 'montar');
  assert.equal(r.fila, 50);
});

test('inspeccionDelCaso: filas que no son visita no cuentan como última', () => {
  const bd = [
    V({ _idx: 40, RADICADO: '20261049145', 'VISITADOR(ES)': 'DANIEL' }),
    V({ _idx: 41, 'N° VISITA': '', RADICADO: '20261049145', 'ESTADO VISITA': 'REITERADO' }),
  ];
  const r = inspeccionDelCaso(bd, 'ADMIN');
  assert.equal(r.modo, 'nueva');
  assert.equal(r.fila, 40);   // la última visita, no la fila REITERADO
  assert.equal(r.nVisita, 2);
});

test('inspección al lugar: texto de la tarjeta, sale de NO COMPETENCIA y va primero en el día', () => {
  const f = { DILIGENCIA: 'INSPECCION AL LUGAR', HORA_PROGRAMADA: '9:00AM', 'ESTADO VISITA': 'ASIGNADO',
    'FECHA ASIGNACION VISITA': '04/11/2026', NOTA_DILIGENCIA: 'URGENTE', 'ATENCION PQR': 'NO COMPETENCIA' };
  assert.deepEqual(inspeccionVisitaTexto(f, { hoy: HOY }), { texto: 'Inspección al lugar · mañana · 9:00', nota: 'URGENTE' });
  assert.equal(inspeccionVisitaTexto(f, { sinDia: true }).texto, 'Inspección al lugar · 9:00');
  assert.equal(inspeccionVisitaTexto(Object.assign({}, f, { 'ESTADO VISITA': 'COMPLETADO' })), null);
  assert.equal(inspeccionVisitaTexto({ 'ESTADO VISITA': 'ASIGNADO' }), null);
  assert.equal(esNoCompetenciaFila(f), false);

  const once = Object.assign({ _idx: 2, RADICADO: 'once' }, f, { HORA_PROGRAMADA: '11:00AM' });
  const nueve = Object.assign({ _idx: 3, RADICADO: 'nueve' }, f);
  const otra = { _idx: 1, RADICADO: 'otra', LATITUD: '6.3365', LONGITUD: '-75.5585' };
  assert.deepEqual(ordenarVisitasDia([otra, once, nueve], '04/11/2026').map(x => x.RADICADO), ['nueve', 'once', 'otra']);
});

// ── Día y hora sugeridos (2026-11-03): grupos de comunas por día y horas 8-4 ──
const { diaGrupoInspeccion, horaCortaInspeccion, sugerenciasInspeccion, HORAS_INSPECCION } = require('../utils.js');

test('horas de inspección: 8 a 11 y 1 a 4, dichas sin a. m./p. m.', () => {
  assert.deepEqual(HORAS_INSPECCION.map(horaCortaInspeccion), ['8:00', '9:00', '10:00', '11:00', '1:00', '2:00', '3:00', '4:00']);
  assert.equal(horaCortaInspeccion('10:30AM'), '10:30');
});

test('diaGrupoInspeccion: lunes 1-2-3 … jueves 10-11-12, viernes rurales', () => {
  assert.equal(diaGrupoInspeccion({ COMUNA: '2' }), 1);
  assert.equal(diaGrupoInspeccion({ COMUNA: 5 }), 2);
  assert.equal(diaGrupoInspeccion({ COMUNA: '08' }), 3);
  assert.equal(diaGrupoInspeccion({ COMUNA: '12' }), 4);
  assert.equal(diaGrupoInspeccion({ COMUNA: 'Vereda' }), 5);
  assert.equal(diaGrupoInspeccion({ COMUNA: '', 'BARRIO/VEREDA': 'Vda. Hato Viejo' }), 5);
  assert.equal(diaGrupoInspeccion({ COMUNA: '' }), null);
});

test('sugerenciasInspeccion: próximos días del grupo, con anticipación y hora libre', () => {
  const hoy = new Date(2026, 10, 3); // martes 03/11/2026
  const insp = (fecha, hora, vis) => ({ DILIGENCIA: 'INSPECCION AL LUGAR', 'FECHA ASIGNACION VISITA': fecha,
    HORA_PROGRAMADA: hora, 'VISITADOR(ES)': vis, 'ESTADO VISITA': 'ASIGNADO' });
  const datos = [insp('11/11/2026', '8:00AM', 'MAURICIO HERRERA'), insp('11/11/2026', '9:00AM', 'ALEJANDRO HERNANDEZ')];
  // Comuna 8 → miércoles; 3 días hábiles después del martes 03 = viernes 06 → miércoles 11.
  const s = sugerenciasInspeccion({ COMUNA: '8' }, datos, 'MAURICIO HERRERA', hoy);
  assert.deepEqual(s.map(x => x.fecha), ['11/11/2026', '18/11/2026', '25/11/2026']);
  assert.equal(s[0].n, 2);
  assert.equal(s[0].hora, '9:00AM'); // Mauricio ya tiene las 8
  // Sin inspector: la primera hora que nadie tiene.
  assert.equal(sugerenciasInspeccion({ COMUNA: '8' }, datos, '', hoy)[0].hora, '10:00AM');
  // Sin comuna: los próximos días hábiles.
  assert.deepEqual(sugerenciasInspeccion({}, [], '', hoy).map(x => x.fecha), ['06/11/2026', '09/11/2026', '10/11/2026']);
});

// ── Tablero de la semana (Agenda › Inspecciones) ──
const { lunesInspecciones, semanaInspecciones, horaLibreInspeccion, bandejaInspecciones } = require('../utils.js');

test('lunesInspecciones: el lunes de la semana; sábado y domingo saltan al siguiente', () => {
  assert.equal(lunesInspecciones(new Date(2026, 10, 4)).getDate(), 2);  // mié 4 → lun 2
  assert.equal(lunesInspecciones(new Date(2026, 10, 7)).getDate(), 9);  // sáb 7 → lun 9
  assert.equal(lunesInspecciones(new Date(2026, 10, 9)).getDate(), 9);
});

test('semanaInspecciones: ubica cada inspección en su día y marca la que va fuera de zona', () => {
  const ins = (o) => Object.assign({ DILIGENCIA: 'INSPECCION AL LUGAR', 'ESTADO VISITA': 'ASIGNADO' }, o);
  const datos = [
    ins({ 'FECHA ASIGNACION VISITA': '11/11/2026', HORA_PROGRAMADA: '9:00AM', COMUNA: '8', 'VISITADOR(ES)': 'MAURICIO HERRERA' }),
    ins({ 'FECHA ASIGNACION VISITA': '09/11/2026', HORA_PROGRAMADA: '10:00AM', COMUNA: '8', 'VISITADOR(ES)': 'ALEJANDRO H' }),
    ins({ 'FECHA ASIGNACION VISITA': '18/11/2026', HORA_PROGRAMADA: '9:00AM', COMUNA: '8' }),   // otra semana
    { 'FECHA ASIGNACION VISITA': '11/11/2026', 'ESTADO VISITA': 'ASIGNADO' },                  // no es inspección
  ];
  const s = semanaInspecciones(datos, new Date(2026, 10, 10));
  assert.equal(s.dias[0].fecha, '09/11/2026');
  assert.deepEqual(s.items.map(x => [x.dia, x.hora, x.fueraZona]), [[2, '9:00AM', false], [0, '10:00AM', true]]);
  assert.equal(horaLibreInspeccion(s.items, 2, '9:00AM', 'MAURICIO HERRERA LOPERA'), false);
  assert.equal(horaLibreInspeccion(s.items, 2, '9:00AM', 'ALEJANDRO'), true);
  assert.equal(horaLibreInspeccion(s.items, 2, '9:00AM', ''), true);   // queda un inspector libre
});

test('horaLibreInspeccion sin inspector: libre mientras alguno de los tres asignables esté libre', () => {
  const it = (ins, k) => ({ f: { _idx: k }, dia: 2, hora: '9:00AM', inspector: ins });
  const dos = [it('ALEJANDRO HERNANDEZ', 1), it('MAURICIO HERRERA', 2)];
  assert.equal(horaLibreInspeccion(dos, 2, '9:00AM', ''), true);    // Daniel libre
  assert.equal(horaLibreInspeccion(dos.concat([it('DANIEL PEDRAZA', 3)]), 2, '9:00AM', ''), false);
  assert.equal(horaLibreInspeccion(dos, 3, '9:00AM', ''), true);    // otro día
});

test('bandejaInspecciones: un renglón por caso, lo más viejo primero', () => {
  const b = bandejaInspecciones([
    { RADICADO: '20261102233', INSPECCION_DECRETADA: '03/11/2026 · JUAN SEBASTIAN PINZON' },
    { RADICADO: '20261102233', INSPECCION_DECRETADA: '03/11/2026 · JUAN SEBASTIAN PINZON' },
    { RADICADO: '20251110870', INSPECCION_DECRETADA: '01/11/2026 · VICTOR' },
    { RADICADO: '20251110871', INSPECCION_DECRETADA: '' },
  ]);
  assert.deepEqual(b.map(x => x.f.RADICADO), ['20251110870', '20261102233']);
  assert.equal(b[1].quien, 'JUAN SEBASTIAN PINZON');
});

const { inspeccionesDecretadas } = require('../utils.js');

test('inspeccionesDecretadas: radicados con la marca, por clave', () => {
  const m = inspeccionesDecretadas([
    { RADICADO: '20261102233', INSPECCION_DECRETADA: '03/11/2026 · JUAN' },
    { RADICADO: '20261102233', INSPECCION_DECRETADA: '' },
    { RADICADO: '20251110870', INSPECCION_DECRETADA: '' },
    { RADICADO: '', INSPECCION_DECRETADA: '01/11/2026 · VICTOR' },
  ]);
  assert.deepEqual(Object.keys(m), ['20261102233']);
  assert.equal(m['20261102233'], '03/11/2026 · JUAN');
});

// ── Revisión 2026-11-04 ──
const { claveCasoInspeccion, claveCasoInspeccionCita, inspectorConfirmacionInspeccion } = require('../utils.js');

test('inspeccionesDecretadas: un radicado V2 de texto no marca los demás casos con el mismo texto', () => {
  const m = inspeccionesDecretadas([
    { _idx: 5, RADICADO: 'QUEJA VERBAL', INSPECCION_DECRETADA: '03/11/2026 · JUAN' },
    { _idx: 9, RADICADO: 'QUEJA VERBAL', INSPECCION_DECRETADA: '' },
  ]);
  assert.equal(m[claveCasoInspeccion({ _idx: 9, RADICADO: 'QUEJA VERBAL' })], undefined);
  assert.equal(m[claveCasoInspeccion({ _idx: 5, RADICADO: 'QUEJA VERBAL' })], '03/11/2026 · JUAN');
});

test('bandejaInspecciones: dos casos V2 distintos y un caso sin radicado (solo orden) salen todos', () => {
  const b = bandejaInspecciones([
    { _idx: 5, RADICADO: 'OPERATIVO', INSPECCION_DECRETADA: '03/11/2026 · JUAN' },
    { _idx: 9, RADICADO: 'OPERATIVO', INSPECCION_DECRETADA: '04/11/2026 · VICTOR' },
    { _idx: 7, RADICADO: '', 'N° ORDEN DE POLICIA': '2026-09-015', INSPECCION_DECRETADA: '02/11/2026 · JUAN' },
  ]);
  assert.deepEqual(b.map(x => x.f._idx), [7, 5, 9]);
});

test('claveCasoInspeccionCita: la cita pedida por N° de orden (sin radicado) toma la clave de su visita', () => {
  const filas = [{ _idx: 40, RADICADO: '20261102233', 'N° ORDEN DE POLICIA': '2026-09-031',
    INSPECCION_DECRETADA: '03/11/2026 · JUAN' }];
  const cita = { idCupo: 'C1', radicado: '', ordenPolicia: '2026-9-31' };
  const k = claveCasoInspeccionCita(filas, cita);
  assert.equal(k, '20261102233');
  assert.equal(inspeccionesDecretadas(filas)[k], '03/11/2026 · JUAN');
  // Con radicado de caso, el suyo.
  assert.equal(claveCasoInspeccionCita([], { radicado: '2026 1102233' }), '20261102233');
});

test('inspectorConfirmacionInspeccion: el elegido de antes no se cuela si está ocupado a esa hora', () => {
  const nueva = { modo: 'nueva', fijo: false, inspector: '' };
  // VICTOR quedó elegido de la confirmación anterior y ya tiene esa hora.
  assert.equal(inspectorConfirmacionInspeccion(nueva, 'VICTOR', ['MAURICIO']), '');
  assert.equal(inspectorConfirmacionInspeccion(nueva, 'MAURICIO', ['MAURICIO']), 'MAURICIO');
  // Propuesto y libre: va el propuesto.
  assert.equal(inspectorConfirmacionInspeccion({ modo: 'montar', fijo: false, inspector: 'ANA' }, '', ['ANA']), 'ANA');
  // Fijo o reprogramación con inspector: el que se ve es el que va.
  assert.equal(inspectorConfirmacionInspeccion({ modo: 'nueva', fijo: true, inspector: 'ANA' }, 'VICTOR', []), 'ANA');
  assert.equal(inspectorConfirmacionInspeccion({ modo: 'reprogramar', fijo: false, inspector: 'ANA' }, 'VICTOR', ['VICTOR']), 'ANA');
  assert.equal(inspectorConfirmacionInspeccion(null, 'VICTOR', ['VICTOR']), '');
});
