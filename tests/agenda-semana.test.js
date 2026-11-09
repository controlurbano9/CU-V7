// ═══════════════════════════════════════════════════════════════
// tests/agenda-semana.test.js — Agenda unificada: la semana del
// equipo (2026-11-09). Lógica pura del borrador y la rejilla días ×
// inspectores antes de construir agenda-semana.jsx.
//
// utils.js → zonaDelDia, textoZonaDia, borradorVacio, borradorAgregar,
// borradorQuitar, borradorResumen, datosConBorrador, semanaEquipo,
// porAgendarDia, envioBorrador.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  zonaDelDia, textoZonaDia, borradorVacio, borradorAgregar, borradorQuitar, borradorResumen,
  datosConBorrador, semanaEquipo, porAgendarDia, envioBorrador,
  candidatasAgenda, bandejaInspecciones, choqueZonaInspeccion, diaGrupoInspeccion,
} = require('../utils.js');

// Semana del lunes 23 al viernes 27 de noviembre de 2026 (sin festivos).
const LUN = new Date(2026, 10, 23);
const MAR = new Date(2026, 10, 24); // martes: comunas 4-5-6
const MIE = new Date(2026, 10, 25); // miércoles: comunas 7-8-9
const JUE = new Date(2026, 10, 26); // jueves: comunas 10-11-12
const VIE = new Date(2026, 10, 27); // viernes: rural
const ALEJANDRO = 'ALEJANDRO HERNANDEZ';
const MAURICIO = 'MAURICIO HERRERA LOPERA';
const INSPECTORES = [ALEJANDRO, MAURICIO, 'DANIEL PEDRAZA'];

// Fila de BD VISITAS como llega por leerVisitas (_idx = fila del Sheet).
const F = (o) => Object.assign({ _idx: 20, RADICADO: '20261100001', 'ESTADO VISITA': 'PENDIENTE',
  'FECHA RADICADO': '10/09/2026', 'DIRECCION INFRACCION': 'CL 50 # 32-10', BARRIO: 'Centro',
  COMUNA: '4' }, o);

test('zonaDelDia: lunes 1 … viernes 5, null el fin de semana; coincide con diaGrupoInspeccion', () => {
  assert.equal(zonaDelDia(LUN), 1);
  assert.equal(zonaDelDia(MAR), 2);
  assert.equal(zonaDelDia(MIE), 3);
  assert.equal(zonaDelDia(JUE), 4);
  assert.equal(zonaDelDia(VIE), 5);
  assert.equal(zonaDelDia(new Date(2026, 10, 28)), null);
  assert.equal(zonaDelDia(new Date(2026, 10, 29)), null);
  assert.equal(zonaDelDia('24/11/2026'), 2); // acepta texto DD/MM/YYYY
  // La zona del día es el grupo de las comunas que lo nombra.
  assert.equal(diaGrupoInspeccion({ COMUNA: '5' }), zonaDelDia(MAR));
  assert.equal(diaGrupoInspeccion({ COMUNA: '10' }), zonaDelDia(JUE));
  assert.equal(diaGrupoInspeccion({ COMUNA: 'RURAL', 'BARRIO/VEREDA': 'VDA HATO VIEJO' }), zonaDelDia(VIE));
});

test('textoZonaDia: largo, corto y rural', () => {
  assert.equal(textoZonaDia(1), 'Comunas 1 · 2 · 3');
  assert.equal(textoZonaDia(2), 'Comunas 4 · 5 · 6');
  assert.equal(textoZonaDia(4), 'Comunas 10 · 11 · 12');
  assert.equal(textoZonaDia(1, true), 'C 1-2-3');
  assert.equal(textoZonaDia(4, true), 'C 10-11-12');
  assert.equal(textoZonaDia(5), 'Rural');
  assert.equal(textoZonaDia(5, true), 'Rural');
  assert.equal(textoZonaDia(null), '');
});

test('borrador: vacío, un caso solo una vez, quitar y resumen (sin mutar)', () => {
  let b = borradorVacio(LUN);
  assert.deepEqual(b, { lunes: '23/11/2026', items: [] });
  b = borradorAgregar(b, { tipo: 'visita', fila: 20, radicado: '20261100001', inspector: MAURICIO, fecha: '24/11/2026' });
  const b1 = b; // para comprobar que agregar no muta
  b = borradorAgregar(b, { tipo: 'insp', fila: 30, radicado: '20261100002', inspector: MAURICIO,
    fecha: '25/11/2026', hora: '9:00AM', modo: 'montar' });
  b = borradorAgregar(b, { tipo: 'mover', fila: 40, radicado: '20261100003', inspector: ALEJANDRO, fecha: '23/11/2026' });
  // La misma fila reemplaza al item anterior: un caso no puede estar dos veces.
  b = borradorAgregar(b, { tipo: 'visita', fila: 20, radicado: '20261100001', inspector: ALEJANDRO, fecha: '25/11/2026' });
  assert.equal(b.items.length, 3);
  assert.equal(b.items.filter((x) => x.fila === 20).length, 1);
  assert.equal(b.items.find((x) => x.fila === 20).inspector, ALEJANDRO);
  assert.equal(b1.items.length, 1); // el borrador anterior quedó igual
  assert.deepEqual(borradorResumen(b), { visitas: 1, inspecciones: 1, movidas: 1, total: 3 });
  b = borradorQuitar(b, 20);
  assert.deepEqual(borradorResumen(b), { visitas: 0, inspecciones: 1, movidas: 1, total: 2 });
  assert.deepEqual(borradorQuitar(borradorVacio(LUN), 99).items, []);
});

test('datosConBorrador: no muta datos; la candidata pasa a ASIGNADA', () => {
  const datos = [F({ _idx: 20, COMUNA: '4' })];
  const antes = JSON.stringify(datos);
  const con = datosConBorrador(datos, borradorAgregar(borradorVacio(LUN),
    { tipo: 'visita', fila: 20, radicado: '20261100001', inspector: MAURICIO, fecha: '24/11/2026' }));
  assert.equal(JSON.stringify(datos), antes);
  assert.equal(datos[0]['ESTADO VISITA'], 'PENDIENTE');
  const f = con[0];
  assert.notEqual(f, datos[0]);
  assert.equal(f['ESTADO VISITA'], 'ASIGNADO');
  assert.equal(f['VISITADOR(ES)'], MAURICIO);
  assert.equal(f['FECHA ASIGNACION VISITA'], '24/11/2026');
  assert.equal(f._borrador, true);
  // Sin items, el arreglo es una copia con las mismas filas.
  assert.equal(datosConBorrador(datos, null)[0], datos[0]);
});

test('una visita del borrador hace que choqueZonaInspeccion bloquee una inspección de otra zona ese día', () => {
  // El borrador le da a Mauricio una visita de la C4 (zona del martes) el
  // miércoles; una inspección de la C8 ese día ya no entra.
  const datos = [F({ _idx: 20, COMUNA: '4' })];
  const caso = { _idx: 50, RADICADO: '20261100009', COMUNA: '8' };
  assert.equal(choqueZonaInspeccion(datos, MAURICIO, MIE, caso, { inspeccion: true }), '');
  const con = datosConBorrador(datos, borradorAgregar(borradorVacio(LUN),
    { tipo: 'visita', fila: 20, radicado: '20261100001', inspector: MAURICIO, fecha: '25/11/2026' }));
  const m = choqueZonaInspeccion(con, MAURICIO, MIE, caso, { inspeccion: true });
  assert.match(m, /^Mauricio ya tiene 1 visita el mié 25 en las comunas 4, 5 y 6/);
});

test('insp montar: la fila toma DILIGENCIA y hora; el caso entero sale de la bandeja', () => {
  const MARCA = '05/11/2026 · JUAN SEBASTIAN PINZON';
  const datos = [
    F({ _idx: 30, RADICADO: '20261100002', COMUNA: '8', INSPECCION_DECRETADA: MARCA }),
    F({ _idx: 31, RADICADO: '20261100002', COMUNA: '8', 'ESTADO VISITA': 'COMPLETADO', INSPECCION_DECRETADA: MARCA }),
  ];
  assert.equal(bandejaInspecciones(datos).length, 1);
  const con = datosConBorrador(datos, borradorAgregar(borradorVacio(LUN),
    { tipo: 'insp', fila: 30, radicado: '20261100002', inspector: MAURICIO,
      fecha: '25/11/2026', hora: '9:00AM', modo: 'montar', programadaConocida: '' }));
  assert.equal(bandejaInspecciones(con).length, 0);
  assert.equal(con[0]['DILIGENCIA'], 'INSPECCIÓN AL LUGAR');
  assert.equal(con[0].HORA_PROGRAMADA, '9:00AM');
  assert.equal(con[0]['ESTADO VISITA'], 'ASIGNADO');
  assert.equal(con[0].INSPECCION_DECRETADA, '');
  // La hermana solo pierde la marca.
  assert.equal(con[1]['ESTADO VISITA'], 'COMPLETADO');
  assert.equal(con[1].INSPECCION_DECRETADA, '');
  assert.equal(con[1]._borrador, undefined);
  // Se ve en el miércoles de Mauricio, marcada nueva.
  const mie = semanaEquipo(con, LUN, INSPECTORES).filas[1].dias[2];
  assert.deepEqual({ visitas: mie.visitas, inspecciones: mie.inspecciones, total: mie.total },
    { visitas: 0, inspecciones: 1, total: 1 });
  assert.equal(mie.items[0].tipo, 'insp');
  assert.equal(mie.items[0].hora, '9:00AM');
  assert.equal(mie.items[0].nueva, true);
  assert.equal(mie.items[0].fueraZona, false);
});

test('insp nueva: fila virtual b:fila; la origen queda igual y sale de la bandeja', () => {
  const datos = [F({ _idx: 40, RADICADO: '20261100005', COMUNA: '8', 'ESTADO VISITA': 'COMPLETADO',
    'VISITADOR(ES)': MAURICIO, 'FECHA ASIGNACION VISITA': '10/09/2026', INSPECCION_DECRETADA: '06/11/2026 · JUANSE' })];
  assert.equal(bandejaInspecciones(datos).length, 1);
  const con = datosConBorrador(datos, borradorAgregar(borradorVacio(LUN),
    { tipo: 'insp', fila: 40, radicado: '20261100005', inspector: ALEJANDRO,
      fecha: '25/11/2026', hora: '1:00PM', modo: 'nueva' }));
  assert.equal(con.length, 2);
  // La origen queda igual, sin la marca.
  assert.equal(con[0]['ESTADO VISITA'], 'COMPLETADO');
  assert.equal(con[0].INSPECCION_DECRETADA, '');
  assert.equal(con[0]._borrador, undefined);
  // La virtual copia el caso y ya está programada.
  const v = con[1];
  assert.equal(v._idx, 'b:40');
  assert.equal(v.RADICADO, '20261100005');
  assert.equal(v['ESTADO VISITA'], 'ASIGNADO');
  assert.equal(v['VISITADOR(ES)'], ALEJANDRO);
  assert.equal(v['DILIGENCIA'], 'INSPECCIÓN AL LUGAR');
  assert.equal(v.HORA_PROGRAMADA, '1:00PM');
  assert.equal(v.INSPECCION_DECRETADA, '');
  assert.equal(v._borrador, true);
  assert.equal(bandejaInspecciones(con).length, 0);
  const mieAle = semanaEquipo(con, LUN, INSPECTORES).filas[0].dias[2];
  assert.equal(mieAle.items.length, 1);
  assert.equal(mieAle.items[0].f._idx, 'b:40');
  assert.equal(mieAle.items[0].nueva, true);
});

test('mover: cambia inspector y día; con hora, también la hora', () => {
  const datos = [
    F({ _idx: 60, 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': MAURICIO, 'FECHA ASIGNACION VISITA': '23/11/2026', COMUNA: '4' }),
    F({ _idx: 61, RADICADO: '20261100007', 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': MAURICIO,
      'FECHA ASIGNACION VISITA': '23/11/2026', COMUNA: '4', DILIGENCIA: 'INSPECCIÓN AL LUGAR', HORA_PROGRAMADA: '9:00AM' }),
  ];
  const b = borradorAgregar(borradorAgregar(borradorVacio(LUN),
    { tipo: 'mover', fila: 60, radicado: '20261100001', inspector: ALEJANDRO, fecha: '25/11/2026' }),
    { tipo: 'mover', fila: 61, radicado: '20261100007', inspector: MAURICIO,
      fecha: '24/11/2026', hora: '2:00PM', programadaConocida: '23/11/2026 9:00AM' });
  const con = datosConBorrador(datos, b);
  assert.equal(con[0]['VISITADOR(ES)'], ALEJANDRO);
  assert.equal(con[0]['FECHA ASIGNACION VISITA'], '25/11/2026');
  assert.equal(con[0]._borrador, true);
  assert.equal(con[1]['FECHA ASIGNACION VISITA'], '24/11/2026');
  assert.equal(con[1].HORA_PROGRAMADA, '2:00PM');
  // La visita dejó el lunes de Mauricio y quedó el miércoles de Alejandro
  // (C4 el día de la 7-8-9: fuera de zona); la inspección pasó al martes de
  // Mauricio, en su zona.
  const sem = semanaEquipo(con, LUN, INSPECTORES);
  assert.equal(sem.filas[1].dias[0].items.length, 0);
  const mieAle = sem.filas[0].dias[2].items;
  assert.equal(mieAle.length, 1);
  assert.equal(mieAle[0].tipo, 'visita');
  assert.equal(mieAle[0].fueraZona, true);
  assert.equal(mieAle[0].nueva, true);
  const marMau = sem.filas[1].dias[1].items;
  assert.equal(marMau.length, 1);
  assert.equal(marMau[0].tipo, 'insp');
  assert.equal(marMau[0].hora, '2:00PM');
  assert.equal(marMau[0].fueraZona, false);
});

test('semanaEquipo: 5 días con su zona e inspecciones primero por hora', () => {
  const datos = [
    F({ _idx: 71, 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': MAURICIO, 'FECHA ASIGNACION VISITA': '25/11/2026', COMUNA: '8' }),
    F({ _idx: 72, RADICADO: '20261100072', 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': MAURICIO,
      'FECHA ASIGNACION VISITA': '25/11/2026', COMUNA: '8', DILIGENCIA: 'INSPECCIÓN AL LUGAR', HORA_PROGRAMADA: '2:00PM' }),
    F({ _idx: 73, RADICADO: '20261100073', 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': MAURICIO,
      'FECHA ASIGNACION VISITA': '25/11/2026', COMUNA: '9', DILIGENCIA: 'INSPECCIÓN AL LUGAR', HORA_PROGRAMADA: '9:00AM' }),
  ];
  const sem = semanaEquipo(datos, LUN, INSPECTORES);
  assert.deepEqual(sem.dias.map((d) => d.fecha),
    ['23/11/2026', '24/11/2026', '25/11/2026', '26/11/2026', '27/11/2026']);
  assert.deepEqual(sem.dias.map((d) => d.zona), [1, 2, 3, 4, 5]);
  assert.ok(sem.dias.every((d) => d.habil)); // esa semana no tiene festivos
  assert.deepEqual(sem.filas.map((f) => f.inspector), INSPECTORES);
  const mie = sem.filas[1].dias[2];
  // La de 9:00 abre, luego la de 2:00, la visita al final.
  assert.deepEqual(mie.items.map((x) => x.f._idx), [73, 72, 71]);
  assert.ok(mie.items.every((x) => !x.fueraZona));
  assert.ok(mie.items.every((x) => !x.nueva));
  assert.deepEqual({ visitas: mie.visitas, inspecciones: mie.inspecciones, total: mie.total },
    { visitas: 1, inspecciones: 2, total: 3 });
  assert.equal(sem.filas[0].dias[0].total, 0);
  // Aunque el lunes que llegue sea otro día, la semana arranca en su lunes.
  assert.equal(semanaEquipo([], MIE, INSPECTORES).dias[0].fecha, '23/11/2026');
});

test('porAgendarDia del martes: solo comunas 4-5-6 por score; inspecciones de la zona primero', () => {
  const HOY = new Date(2026, 10, 20, 8, 0);
  const rad = (idx) => '20261100' + String(idx);
  const pend = (idx, comuna, fechaRad, pri) => F({ _idx: idx, RADICADO: rad(idx),
    COMUNA: comuna, 'FECHA RADICADO': fechaRad, PRIORIDAD: pri || '' });
  const decretada = (idx, comuna, cuando) => F({ _idx: idx, RADICADO: rad(idx),
    COMUNA: comuna, INSPECCION_DECRETADA: cuando + ' · JUANSE' });
  const datos = [
    pend(81, '4', '01/02/2026', '9 - Alto'), // 7.7
    pend(82, '6', '10/01/2026', ''),         // 4.81 (la 6 no es prioritaria)
    pend(83, '5', '05/05/2026', '10 - Crítico'), // 7.82
    pend(84, '9', '01/01/2026', ''), // zona del miércoles: fuera
    pend(85, '1', '01/01/2026', ''), // zona del lunes: fuera
    decretada(86, '8', '06/11/2026'),
    decretada(87, '4', '07/11/2026'),
  ];
  const candidatas = candidatasAgenda(datos, HOY);
  const r = porAgendarDia(datos, candidatas, MAR);
  assert.deepEqual(r.visitas.map((v) => v.fila), [83, 81, 82]); // por score de mayor a menor
  // La decretada de la zona (87) no se repite abajo: está arriba, en la bandeja.
  assert.ok(!r.visitas.some((v) => v.fila === 87));
  // Las inspecciones de la zona del día suben primero (orden estable).
  assert.deepEqual(r.inspecciones.map((x) => x.f._idx), [87, 86]);
  // Lo que el borrador ya usa no vuelve a salir.
  const con = datosConBorrador(datos, borradorAgregar(borradorVacio(LUN),
    { tipo: 'visita', fila: 81, radicado: rad(81), inspector: MAURICIO, fecha: '24/11/2026' }));
  assert.deepEqual(porAgendarDia(con, candidatas, MAR).visitas.map((v) => v.fila), [83, 82]);
  // El viernes trae lo rural.
  const rural = porAgendarDia(datos, candidatasAgenda([pend(88, 'RURAL', '01/06/2026', '')], HOY), VIE);
  assert.deepEqual(rural.visitas.map((v) => v.comuna), ['RURAL']);
});

test('envioBorrador: agrupa por inspector y fecha; el mover de inspección va como reprogramar', () => {
  const b = [
    { tipo: 'visita', fila: 91, radicado: '20261100091', inspector: MAURICIO, fecha: '24/11/2026', expediente: '2294' },
    { tipo: 'visita', fila: 92, radicado: '20261100092', inspector: MAURICIO, fecha: '24/11/2026' },
    { tipo: 'visita', fila: 93, radicado: '20261100093', inspector: ALEJANDRO, fecha: '24/11/2026' },
    { tipo: 'visita', fila: 94, radicado: '20261100094', inspector: MAURICIO, fecha: '25/11/2026' },
    { tipo: 'insp', fila: 95, radicado: '20261100095', inspector: ALEJANDRO, fecha: '25/11/2026',
      hora: '9:00AM', modo: 'montar', programadaConocida: '' },
    { tipo: 'mover', fila: 96, radicado: '20261100096', inspector: MAURICIO, fecha: '26/11/2026' },
    { tipo: 'mover', fila: 97, radicado: '20261100097', inspector: MAURICIO, fecha: '27/11/2026',
      hora: '2:00PM', programadaConocida: '24/11/2026 9:00AM' },
  ].reduce((acc, x) => borradorAgregar(acc, x), borradorVacio(LUN));
  const e = envioBorrador(b);
  // confirmarAgenda: una asignación por inspector + fecha.
  assert.equal(e.confirmarAgenda.accion, 'confirmarAgenda');
  assert.deepEqual(e.confirmarAgenda.asignaciones.map((a) => a.inspector + ' ' + a.fechaAsignacion), [
    MAURICIO + ' 24/11/2026',
    ALEJANDRO + ' 24/11/2026',
    MAURICIO + ' 25/11/2026',
  ]);
  assert.deepEqual(e.confirmarAgenda.asignaciones[0].visitas, [
    { fila: 91, radicado: '20261100091', expediente: '2294' },
    { fila: 92, radicado: '20261100092', expediente: '' },
  ]);
  // programarInspecciones: la inspección y el mover con hora (reprogramar).
  assert.equal(e.programarInspecciones.accion, 'programarInspecciones');
  assert.deepEqual(e.programarInspecciones.items.map((x) => x.modo), ['montar', 'reprogramar']);
  assert.deepEqual(e.programarInspecciones.items[1], {
    modo: 'reprogramar', fila: 97, radicadoConocido: '20261100097', inspector: MAURICIO,
    fecha: '27/11/2026', hora: '2:00PM', expediente: '', programadaConocida: '24/11/2026 9:00AM',
  });
  // mover: solo los que no son inspección.
  assert.deepEqual(e.mover, [
    { fila: 96, radicadoConocido: '20261100096', inspector: MAURICIO, fechaAsignacion: '26/11/2026' },
  ]);
  // Borrador sin items: los tres vacíos.
  const v = envioBorrador(borradorVacio(LUN));
  assert.equal(v.confirmarAgenda, null);
  assert.equal(v.programarInspecciones, null);
  assert.deepEqual(v.mover, []);
});
