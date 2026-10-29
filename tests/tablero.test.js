// ═══════════════════════════════════════════════════════════════
// tests/tablero.test.js — lógica del tablero territorial (E7).
//
// Contrato del que dependerá tablero.jsx (parte 2): la pantalla solo pinta.
// Lo que más se puede romper sin que se note es (1) que la espera se cuente
// desde una fecha distinta del radicado, (2) que el periodo filtre por la
// fecha equivocada, (3) que una toma sin asignar (fa == fv) contamina la
// mediana de asignación → visita y (4) que el catálogo de contravenciones
// diverja entre el formulario y el tablero.
//
// Especificación: docs/ESPEC_E7_tablero.md §3-§4 y §7.
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  prepararFilaTablero, filtrarTablero, kpisTablero, agregarPorArea, escalaMapa,
  rankingBarrios, serieMensual, recorridoTablero, equipoTablero, hallazgosTablero,
  calidadTablero, crearIndiceBarriosPot, _infraccionSoloCatalogo,
} = require('../utils.js');

const HOY = new Date(2026, 9, 16); // viernes 16/10/2026

const fila = (extra) => Object.assign({
  _idx: 1,
  'RADICADO': '20261000001',
  'ESTADO VISITA': 'PENDIENTE',
  'FECHA RADICADO': '01/09/2026',
}, extra);

// ── Índice de barrios sintético para el POT ────────────────────
// Proyección propia (no la de comunas-mapa.json): x = lon + 75.65,
// y = 6.45 - lat; con s = 1, 1 unidad = 110574 m. Punto de prueba:
// lat 6.33 / lon -75.55 → x 0.10, y 0.12 (dentro de «Centro»).
const PROJ = { k: 1, minX: -75.65, maxY: 6.45, s: 1 };
function cuadro(n, c, x0, y0, x1, y1) {
  return {
    n, c,
    d: `M${x0} ${y0}L${x1} ${y0}L${x1} ${y1}L${x0} ${y1}Z`,
    b: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)],
  };
}
const IDX = crearIndiceBarriosPot([
  cuadro('Centro', '7', 0.09, 0.11, 0.11, 0.13),
  cuadro('Vecino', '7', 0.1019, 0.115, 0.1119, 0.125),   // borde a ~210 m del punto
  cuadro('Lejano', '8', 0.1181, 0.115, 0.1281, 0.125),   // borde a ~2000 m del punto
], PROJ);
const PUNTO = { 'LATITUD': '6.33', 'LONGITUD': '-75.55' };

// ── prepararFilaTablero ────────────────────────────────────────

test('prepararFilaTablero — la espera se cuenta desde el radicado y aVisita solo en C sin ser negativo', () => {
  const p = prepararFilaTablero(fila(), IDX, HOY);
  assert.equal(p.edad, 45);                                  // 01/09 → 16/10
  assert.equal(p.aVisita, null, 'pendiente no tiene aVisita');
  const c = prepararFilaTablero(fila({
    'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '20/09/2026',
  }), IDX, HOY);
  assert.equal(c.aVisita, 19);                               // 01/09 → 20/09
  assert.equal(c.edad, 45, 'la espera sigue contando desde el radicado');
  const mal = prepararFilaTablero(fila({
    'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '20/08/2026', // anterior al radicado
  }), IDX, HOY);
  assert.equal(mal.aVisita, null, 'visita anterior al radicado no cuenta');
});

test('prepararFilaTablero — estado plegado a P/A/I/C/X con las variantes de V2', () => {
  const est = (v) => prepararFilaTablero(fila({ 'ESTADO VISITA': v }), IDX, HOY).est;
  assert.equal(est('PENDIENTE'), 'P');
  assert.equal(est('PROGRAMADA'), 'P');
  assert.equal(est('ASIGNADO'), 'A');
  assert.equal(est('INICIADO'), 'I');
  assert.equal(est('COMPLETADO'), 'C');
  assert.equal(est('COMPLETADA'), 'C', 'variante de V2');
  assert.equal(est('PQR PENDIENTE'), 'P', 'variante de V2');
  assert.equal(est('DESCARGADA GESTION'), 'X', 'cerrada sin visita');
  assert.equal(est(''), 'X');
});

test('prepararFilaTablero — coordenadas con el decimal comido dan el punto correcto', () => {
  const p = prepararFilaTablero(fila({ 'LATITUD': '6331234', 'LONGITUD': '-75551234' }), IDX, HOY);
  assert.ok(Math.abs(p.lat - 6.331234) < 1e-9);
  assert.ok(Math.abs(p.lon - (-75.551234)) < 1e-9);
});

test('prepararFilaTablero — la comuna del barrio POT manda sobre la columna (decisión 2026-10-07)', () => {
  const p = prepararFilaTablero(fila({ ...PUNTO, 'COMUNA': '9' }), IDX, HOY);
  assert.equal(p.bar, 'Centro');
  assert.equal(p.com, '7', 'el punto cae en la comuna 7 del POT');
  assert.equal(p.fuenteBar, 'punto');
});

test('prepararFilaTablero — rural: comuna 12 y vereda escrita, sin barrio POT', () => {
  const p = prepararFilaTablero(fila({
    'COMUNA': 'RURAL', 'BARRIO/VEREDA': 'Vda. San José',
  }), IDX, HOY);
  assert.equal(p.com, '12');
  assert.equal(p.vereda, 'San José');
  assert.equal(p.bar, '');
  assert.ok(p.rural);
});

// ── filtrarTablero ─────────────────────────────────────────────

const FILAS = [
  prepararFilaTablero(fila({
    _idx: 1, 'COMUNA': '4', 'VISITADOR(ES)': 'ANA',
  }), IDX, HOY),
  prepararFilaTablero(fila({
    _idx: 2, 'RADICADO': '20261000002', 'ESTADO VISITA': 'INICIADO',
    'COMUNA': '4', 'VISITADOR(ES)': 'LUIS', 'FECHA RADICADO': '01/10/2026',
    'FECHA DE VISITA': '10/10/2026',
  }), IDX, HOY),
  prepararFilaTablero(fila({
    _idx: 3, 'RADICADO': '20261000003', 'ESTADO VISITA': 'COMPLETADO',
    'COMUNA': '7', 'VISITADOR(ES)': 'ANA', 'FECHA RADICADO': '01/04/2026',
    'FECHA DE VISITA': '20/08/2026',
  }), IDX, HOY),
];

test('filtrarTablero — cada dimensión filtra', () => {
  assert.deepEqual(filtrarTablero(FILAS, { est: ['P'] }, null, HOY).map(f => f.id), [1]);
  assert.deepEqual(filtrarTablero(FILAS, { com: '4' }, null, HOY).map(f => f.id), [1, 2]);
  assert.deepEqual(filtrarTablero(FILAS, { ins: 'ANA' }, null, HOY).map(f => f.id), [1, 3]);
  // Periodo sobre fr o fv según dim: 90 días atrás = 17/07/2026, así que la
  // radicada de abril queda fuera por fr pero su visita de agosto entra por fv.
  assert.deepEqual(filtrarTablero(FILAS, { dim: 'fr', per: '90' }, null, HOY).map(f => f.id), [1, 2]);
  assert.deepEqual(filtrarTablero(FILAS, { dim: 'fv', per: '90' }, null, HOY).map(f => f.id), [2, 3]);
});

test('filtrarTablero — `sin` excluye esa dimensión para que la faceta cuente sus alternativas', () => {
  assert.equal(filtrarTablero(FILAS, { est: ['P'] }, 'est', HOY).length, 3);
  assert.equal(filtrarTablero(FILAS, { com: '4' }, 'com', HOY).length, 3);
  assert.equal(filtrarTablero(FILAS, { ins: 'ANA' }, 'ins', HOY).length, 3);
  assert.equal(filtrarTablero(FILAS, { dim: 'fr', per: '90' }, 'per', HOY).length, 3);
});

// ── kpisTablero ────────────────────────────────────────────────

test('kpisTablero — cada indicador define su propio universo, sin filtro de estado', () => {
  // Mezcla con una cerrada sin visita (X) y una completada: los vivos no
  // cuentan X ni C aunque los chips de estado traigan todo.
  const k = kpisTablero(FILAS.concat([
    prepararFilaTablero(fila({
      _idx: 9, 'RADICADO': '20251000009', 'ESTADO VISITA': 'DESCARGADA GESTION',
    }), IDX, HOY),
  ]), HOY);
  assert.equal(k.vivos, 2);          // P + I (la C y la X no)
  assert.equal(k.sinAsignar, 1);     // solo la P
  assert.equal(k.mas30, 1, 'la P de 45 días; la I tiene 15');
  assert.equal(k.visitadasMes, 0, 'la visita fue en agosto, no en octubre');
});

test('kpisTablero — «visitadas» usa FECHA DE VISITA y compara el mes anterior a esta fecha', () => {
  const filas = [
    // fv este mes
    prepararFilaTablero(fila({ _idx: 1, 'RADICADO': '20261000001', 'ESTADO VISITA': 'COMPLETADO',
      'FECHA RADICADO': '01/09/2026', 'FECHA DE VISITA': '05/10/2026' }), IDX, HOY),
    // fv septiembre a más de esta fecha (día 20 > 16)
    prepararFilaTablero(fila({ _idx: 2, 'RADICADO': '20261000002', 'ESTADO VISITA': 'COMPLETADO',
      'FECHA RADICADO': '01/08/2026', 'FECHA DE VISITA': '20/09/2026' }), IDX, HOY),
    // fv septiembre dentro de esta fecha
    prepararFilaTablero(fila({ _idx: 3, 'RADICADO': '20261000003', 'ESTADO VISITA': 'COMPLETADO',
      'FECHA RADICADO': '01/08/2026', 'FECHA DE VISITA': '10/09/2026' }), IDX, HOY),
    // radicada en octubre pero visitada en agosto: no cuenta en ningún mes de visita
    prepararFilaTablero(fila({ _idx: 4, 'RADICADO': '20261000004', 'ESTADO VISITA': 'COMPLETADO',
      'FECHA RADICADO': '01/10/2026', 'FECHA DE VISITA': '15/08/2026' }), IDX, HOY),
  ];
  const k = kpisTablero(filas, HOY);
  assert.equal(k.visitadasMes, 1);
  assert.equal(k.visitadasMesAnt, 2);
  assert.equal(k.visitadasMesAntAFecha, 1);
});

test('kpisTablero — órdenes sin vigilancia: ignora N/A, exige I/C, radicado 2025+ y sin oficio', () => {
  const base = {
    _idx: 1, 'ESTADO VISITA': 'INICIADO', 'FECHA RADICADO': '01/09/2026',
    'SUSPENSION DE LA OBRA': 'SI',
  };
  const de = (extra) => [prepararFilaTablero(fila({ ...base, ...extra }), IDX, HOY)];
  assert.equal(kpisTablero(de({ 'N° ORDEN DE POLICIA': 'N/A' }), HOY).ordenesSinVigilancia, 0,
    'el N/A de las filas migradas no es una orden');
  assert.equal(kpisTablero(de({ 'N° ORDEN DE POLICIA': '2026-09-015' }), HOY).ordenesSinVigilancia, 1);
  assert.equal(kpisTablero(de({
    'N° ORDEN DE POLICIA': '2026-09-015', 'LINK_SOLICITUD_VIGILANCIA': 'https://drive/v',
  }), HOY).ordenesSinVigilancia, 0, 'ya tiene oficio de vigilancia');
  assert.equal(kpisTablero(de({
    'N° ORDEN DE POLICIA': '2026-09-015', 'ESTADO VISITA': 'PENDIENTE',
  }), HOY).ordenesSinVigilancia, 0, 'sin visita iniciada no urge el oficio');
  assert.equal(kpisTablero(de({
    'N° ORDEN DE POLICIA': '2026-09-015', 'FECHA RADICADO': '01/09/2024',
  }), HOY).ordenesSinVigilancia, 0, 'radicado anterior a 2025 fuera');
  assert.equal(kpisTablero(de({}), HOY).ordenesSinVigilancia, 0, 'sin suspensión no aplica');
});

// ── agregarPorArea / escalaMapa / rankingBarrios ───────────────

test('agregarPorArea — vivos, mas30 y medVisita por comuna', () => {
  const m = agregarPorArea(FILAS, 'com', 'vivos');
  assert.equal(m.get('4'), 2);   // P + I
  assert.equal(m.get('7'), 0);   // la C no es viva
  const rez = agregarPorArea(FILAS, 'com', 'mas30');
  assert.equal(rez.get('4'), 1); // solo la P de 45 días
  const med = agregarPorArea(FILAS, 'com', 'medVisita');
  assert.equal(med.get('7'), 141);   // 01/04 → 20/08
  assert.equal(med.get('4'), null, 'sin completadas no hay mediana');
});

test('escalaMapa — 0 da el color neutro y el máximo cae en el último tramo', () => {
  const e = escalaMapa([0, 3, 7]);
  assert.deepEqual(e.cortes, [2, 4, 6, 8]);
  assert.equal(e.max, 10);
  assert.equal(e.colorDe(0), 0);
  assert.equal(e.colorDe(null), 0);
  assert.equal(e.colorDe(3), 2);
  assert.equal(e.colorDe(7), 4);
  assert.equal(e.colorDe(10), 5, 'el máximo cae en el último tramo');
  const chico = escalaMapa([4]);
  assert.deepEqual(chico.cortes, [1, 2, 3, 4], 'con máximo ≤ 5 el paso es 1');
  assert.equal(chico.colorDe(4), 4);
});

test('rankingBarrios — orden por mas30 y luego vivos; sin barrio POT fuera', () => {
  const filas = [
    prepararFilaTablero(fila({ _idx: 1, 'RADICADO': '20261000001', ...PUNTO,
      'COMUNA': '7', 'FECHA RADICADO': '01/09/2026' }), IDX, HOY),          // Centro, 45 días
    prepararFilaTablero(fila({ _idx: 2, 'RADICADO': '20261000002', ...PUNTO,
      'COMUNA': '7', 'FECHA RADICADO': '01/10/2026' }), IDX, HOY),          // Centro, 15 días
    prepararFilaTablero(fila({ _idx: 3, 'RADICADO': '20261000003' }), IDX, HOY), // sin punto ni barrio
  ];
  const r = rankingBarrios(filas);
  assert.deepEqual(r, [{ nombre: 'Centro', com: '7', vivos: 2, mas30: 1 }]);
});

// ── serieMensual ───────────────────────────────────────────────

test('serieMensual — radicadas por fr y visitadas por fv, cruzando el año', () => {
  const filas = [
    prepararFilaTablero(fila({ _idx: 1, 'FECHA RADICADO': '15/12/2025',
      'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '10/01/2026' }), IDX, HOY),
    prepararFilaTablero(fila({ _idx: 2, 'FECHA RADICADO': '05/01/2026' }), IDX, HOY),
    prepararFilaTablero(fila({ _idx: 3, 'FECHA RADICADO': '20/01/2026' }), IDX, HOY),
  ];
  assert.deepEqual(serieMensual(filas, new Date(2025, 11, 1), new Date(2026, 0, 31)), [
    { mes: '2025-12', radicadas: 1, visitadas: 0 },
    { mes: '2026-01', radicadas: 2, visitadas: 1 },
  ]);
});

// ── recorridoTablero ───────────────────────────────────────────

test('recorridoTablero — excluye fa == fv (toma sin asignar) y el n de cada tramo es correcto', () => {
  const filas = [
    prepararFilaTablero(fila({ _idx: 1, 'FECHA RADICADO': '01/10/2026' }), IDX, HOY),
    prepararFilaTablero(fila({ _idx: 2, 'RADICADO': '20261000002', 'ESTADO VISITA': 'COMPLETADO',
      'FECHA RADICADO': '01/08/2026', 'FECHA ASIGNACION VISITA': '10/08/2026',
      'FECHA DE VISITA': '20/08/2026' }), IDX, HOY),
    prepararFilaTablero(fila({ _idx: 3, 'RADICADO': '20261000003', 'ESTADO VISITA': 'COMPLETADO',
      'FECHA RADICADO': '01/08/2026', 'FECHA ASIGNACION VISITA': '05/09/2026',
      'FECHA DE VISITA': '05/09/2026' }), IDX, HOY),                        // fa == fv
  ];
  const r = recorridoTablero(filas);
  assert.equal(r.radAsig.n, 2, 'las dos asignaciones reales');
  assert.equal(r.radAsig.med, 22);   // mediana de [9, 35]
  assert.equal(r.asigVis.n, 1, 'fa == fv no es una asignación real');
  assert.equal(r.asigVis.med, 10);
  assert.equal(r.radVis.n, 2);
  assert.equal(r.radVis.med, 27);    // mediana de [19, 35]
  assert.deepEqual(r.detenidas.map(d => d.est), ['P', 'A', 'I']);
  assert.equal(r.detenidas[0].n, 1);
  assert.equal(r.detenidas[0].medEdad, 15);
});

// ── equipoTablero ──────────────────────────────────────────────

test('equipoTablero — orden por carga en curso, «Otros» al final y faltantes de las iniciadas', () => {
  const filas = [
    prepararFilaTablero(fila({ _idx: 1, 'COMUNA': '4', 'VISITADOR(ES)': 'LUIS' }), IDX, HOY),
    prepararFilaTablero(fila({ _idx: 2, 'RADICADO': '20261000002', 'ESTADO VISITA': 'INICIADO',
      'COMUNA': '4', 'VISITADOR(ES)': 'ANA / LUIS' }), IDX, HOY),
    prepararFilaTablero(fila({ _idx: 3, 'RADICADO': '20261000003', 'ESTADO VISITA': 'INICIADO',
      'COMUNA': '4', 'VISITADOR(ES)': 'ANA', 'FECHA RADICADO': '01/09/2026',
      'LINK_XLSX_ACTA': 'https://drive/a', 'LINK_REGISTRO_FOTOS': 'https://drive/r' }), IDX, HOY),
    prepararFilaTablero(fila({ _idx: 4, 'RADICADO': '20261000004', 'ESTADO VISITA': 'COMPLETADO',
      'COMUNA': '7', 'VISITADOR(ES)': 'LUIS', 'FECHA DE VISITA': '20/08/2026' }), IDX, HOY),
    prepararFilaTablero(fila({ _idx: 5, 'RADICADO': '20261000005', 'ESTADO VISITA': 'INICIADO',
      'VISITADOR(ES)': 'ZOE', 'FECHA RADICADO': '01/09/2026' }), IDX, HOY),
  ];
  const eq = equipoTablero(filas, ['ANA', 'LUIS']);
  assert.deepEqual(eq.map(e => e.ins), ['ANA', 'LUIS', 'Otros'],
    'ANA tiene 2 en curso, LUIS 1; ZOE (sin lista) y lo sin inspector van a «Otros»');
  assert.equal(eq[0].enCurso, 2);
  assert.equal(eq[0].conFaltantes.length, 1, 'una iniciada sin acta completa');
  assert.equal(eq[1].visitadas, 1);
  assert.equal(eq[1].medVisita, null, 'LUIS no tiene completada con fecha válida… ');
  // …la de LUIS es de agosto con radicado 01/09: aVisita nulo, no entra en la mediana.
});

// ── hallazgosTablero ───────────────────────────────────────────

test('hallazgosTablero — chips por literal, texto libre de V2 a X y porcentajes con su n', () => {
  const filas = [
    prepararFilaTablero(fila({ _idx: 1, 'RADICADO': '20261000001', 'ESTADO VISITA': 'INICIADO',
      'TIPO DE INFRACCION': 'A1: Áreas protegidas', 'SUSPENSION DE LA OBRA': 'SI' }), IDX, HOY),
    prepararFilaTablero(fila({ _idx: 2, 'RADICADO': '20261000002', 'ESTADO VISITA': 'INICIADO',
      'TIPO DE INFRACCION': 'A1: Áreas protegidas | A3: Bienes uso público (Antejardín)',
      'SUSPENSION DE LA OBRA': 'NO', 'SE APORTO LICENCIA': 'NO', 'ESTADO OBRA': 'EN PROCESO' }), IDX, HOY),
    prepararFilaTablero(fila({ _idx: 3, 'RADICADO': '20261000003', 'ESTADO VISITA': 'COMPLETADO',
      'TIPO DE INFRACCION': '#9,11 Y 12' }), IDX, HOY),                     // texto libre de V2
    prepararFilaTablero(fila({ _idx: 4, 'RADICADO': '20261000004', 'ESTADO VISITA': 'COMPLETADO',
      'FECHA DE VISITA': '20/08/2026' }), IDX, HOY),                        // sin dato
    prepararFilaTablero(fila({ _idx: 5, 'RADICADO': '20261000005', 'ESTADO VISITA': 'PENDIENTE',
      'TIPO DE INFRACCION': 'A1: Áreas protegidas' }), IDX, HOY),           // pendiente: fuera
  ];
  const h = hallazgosTablero(filas);
  assert.equal(h.porTipo.A1, 2);
  assert.equal(h.porTipo.A3, 1);
  assert.equal(h.porTipo.X, 1, 'el texto libre de V2 no es un chip');
  assert.equal(h.sinDato, 1);
  assert.deepEqual(h.pctSusp, { pct: 50, n: 2 });
  assert.deepEqual(h.pctLic, { pct: 0, n: 1 });
  assert.deepEqual(h.pctObraProceso, { pct: 100, n: 1 });
});

// ── calidadTablero ─────────────────────────────────────────────

test('calidadTablero — el punto a ≥ 1 km del barrio escrito entra; a 200 m no', () => {
  const cerca = prepararFilaTablero(fila({ _idx: 1, ...PUNTO, 'COMUNA': '7',
    'BARRIO/VEREDA': 'Vecino' }), IDX, HOY);
  const lejos = prepararFilaTablero(fila({ _idx: 2, ...PUNTO, 'COMUNA': '7',
    'BARRIO/VEREDA': 'Lejano' }), IDX, HOY);
  assert.ok(cerca.conflictoM < 1000, 'preparador: ~210 m');
  assert.ok(lejos.conflictoM >= 1000, 'preparador: ~2000 m');
  const q = calidadTablero([cerca, lejos]);
  const conflicto = q.find(x => x.id === 'conflicto');
  assert.deepEqual(conflicto.filas.map(f => f.id), [2], 'solo el de 2 km');
});

test('calidadTablero — las siete categorías con su regla', () => {
  const vivas = (extra) => prepararFilaTablero(fila({
    _idx: 8, 'RADICADO': '20251000008', 'LINK_PDF_RADICADO': 'https://drive/p', ...extra,
  }), IDX, HOY);
  const q = calidadTablero([
    vivas({ 'LINK_PDF_RADICADO': '' }),                                     // sin punto, sin barrio, sin comuna, sin PDF
    vivas({ 'LATITUD': '6.33', 'LONGITUD': '-75.55', 'COMUNA': '7' }),      // completo
    vivas({ 'ESTADO VISITA': 'COMPLETADO', 'COMUNA': '7', 'LATITUD': '6.33',
      'LONGITUD': '-75.55' }),                                              // completada sin fv e inspector
  ]);
  const n = (id) => q.find(x => x.id === id).filas.length;
  assert.equal(n('sinCoord'), 1);
  assert.equal(n('sinBarrio'), 1, 'la rural no cuenta como sin barrio POT');
  assert.equal(n('sinComuna'), 1);
  assert.equal(n('sinPdfPqr'), 1, 'viva desde 2025 sin LINK_PDF_RADICADO');
  assert.equal(n('sinInspector'), 1);
  assert.equal(n('sinFechaVisita'), 1);
});

// ── _infraccionSoloCatalogo (mudada de nueva-visita.jsx) ───────

test('_infraccionSoloCatalogo — los chips del catálogo pasan, el texto libre de V2 no', () => {
  assert.equal(_infraccionSoloCatalogo('A1: Áreas protegidas'), 'A1: Áreas protegidas');
  assert.equal(_infraccionSoloCatalogo('A1: Áreas protegidas | D13: Materiales en vía'),
    'A1: Áreas protegidas | D13: Materiales en vía');
  assert.equal(_infraccionSoloCatalogo('No se evidencia infracción'), 'No se evidencia infracción');
  assert.equal(_infraccionSoloCatalogo('#9,11 Y 12'), '');
  assert.equal(_infraccionSoloCatalogo('A1: Áreas protegidas | #9,11 Y 12'),
    'A1: Áreas protegidas', 'mezcla: se queda solo con el chip');
  assert.equal(_infraccionSoloCatalogo(''), '');
  assert.equal(_infraccionSoloCatalogo(null), '');
});

test('fichaAreaTablero: conteo por estado, vivos, medianas e inspectores por carga', () => {
  const { fichaAreaTablero } = require('../utils.js');
  const filas = [
    { est: 'P', edad: 10, ins: '' },
    { est: 'A', edad: 30, ins: 'ANA' },
    { est: 'I', edad: 50, ins: 'ANA' },
    { est: 'I', edad: 20, ins: 'LUIS' },
    { est: 'C', edad: 90, aVisita: 12, ins: 'LUIS' },
    { est: 'X', edad: 200, ins: '' },
  ];
  const r = fichaAreaTablero(filas);
  assert.equal(r.n, 6);
  assert.deepEqual(r.porEst, { P: 1, A: 1, I: 2, C: 1, X: 1 });
  assert.equal(r.vivos, 4, 'vivos = P + A + I');
  assert.equal(r.medVisita, 12);
  assert.deepEqual(r.porInspector, [{ ins: 'ANA', vivos: 2 }, { ins: 'LUIS', vivos: 1 }],
    'solo casos vivos, ordenados por carga; sin inspector no cuenta');
  assert.equal(fichaAreaTablero([]).n, 0);
});
