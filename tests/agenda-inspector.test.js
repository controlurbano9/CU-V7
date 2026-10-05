// ═══════════════════════════════════════════════════════════════
// tests/agenda-inspector.test.js — Agenda por inspector (2026-10-03)
// utils.js → nivelPrioridad, motivoPrioridad, ordenarRuta,
// armarBorradorAgenda, diaInicialAgenda, moverDiaHabil, fechaLargaAgenda,
// visitasDelDia; apps_script_unificado.js → _decisionAsignarAgenda.
//
// Reglas del usuario: sin mañana/tarde; meta 3 por inspector aunque salgan
// juntos; cada visita a un solo inspector; la ruta empieza en la visita más
// lejana de la Alcaldía y vuelve hacia ella por el trayecto más corto.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  AGENDA_OFICINA, nivelPrioridad, motivoPrioridad, ordenarRuta, armarBorradorAgenda,
  diaInicialAgenda, moverDiaHabil, fechaLargaAgenda, visitasDelDia,
} = require('../utils.js');

test('nivelPrioridad: escala de la priorización y su plazo', () => {
  assert.deepEqual(nivelPrioridad(10), { nivel: 'Crítica', plazo: 5 });
  assert.deepEqual(nivelPrioridad(8), { nivel: 'Alta', plazo: 20 });
  assert.deepEqual(nivelPrioridad(5), { nivel: 'Media', plazo: 30 });
  assert.deepEqual(nivelPrioridad(3), { nivel: 'Baja', plazo: null });
  assert.deepEqual(nivelPrioridad(1), { nivel: 'Mínima', plazo: null });
  assert.equal(nivelPrioridad(null), null);
  assert.equal(nivelPrioridad(''), null);
  assert.equal(nivelPrioridad('x'), null);
});

test('motivoPrioridad: las tres sugeridas de la captura del 2026-10-03', () => {
  // 5.93 = Alta (8) con 178 días; plazo de Alta 20 → vencida hace 158.
  assert.deepEqual(motivoPrioridad({ prioridad: 8, dias: 178 }),
    { nivel: 'Alta', texto: 'vencida hace 158 días', vencida: true });
  assert.deepEqual(motivoPrioridad({ prioridad: 3, dias: 163 }),
    { nivel: 'Baja', texto: '163 días', vencida: false });
  assert.deepEqual(motivoPrioridad({ prioridad: null, dias: 101 }),
    { nivel: 'Sin análisis', texto: '101 días', vencida: false });
  // Dentro del plazo no está vencida; sin días solo queda el nivel.
  assert.equal(motivoPrioridad({ prioridad: 8, dias: 20 }).vencida, false);
  assert.equal(motivoPrioridad({ prioridad: 8, dias: 21 }).texto, 'vencida hace 1 día');
  assert.deepEqual(motivoPrioridad({ prioridad: 6, dias: null }), { nivel: 'Media', texto: '', vencida: false });
});

test('ordenarRuta: empieza en la más lejana y vuelve por el trayecto más corto', () => {
  // Predios reales de catastro (comuna 6), en orden de urgencia invertido.
  const p = (id, lat, lon) => ({ id, punto: { lat, lon } });
  const ruta = ordenarRuta([
    p('CL 76 # 57B-15', 6.351790, -75.560951),
    p('CL 79 # 58-75', 6.352857, -75.561910),
    p('CL 77 # 63A-08', 6.355075, -75.568055),
  ], AGENDA_OFICINA);
  assert.deepEqual(ruta.map(r => r.id), ['CL 77 # 63A-08', 'CL 79 # 58-75', 'CL 76 # 57B-15']);
});

test('ordenarRuta: las paradas sin punto van al final en su orden', () => {
  const ruta = ordenarRuta([
    { id: 'a', punto: null },
    { id: 'cerca', punto: { lat: 6.336, lon: -75.559 } },
    { id: 'b', punto: null },
    { id: 'lejos', punto: { lat: 6.36, lon: -75.57 } },
  ]);
  assert.deepEqual(ruta.map(r => r.id), ['lejos', 'cerca', 'a', 'b']);
  assert.deepEqual(ordenarRuta([]), []);
  assert.deepEqual(ordenarRuta([{ id: 'x', punto: null }]).map(r => r.id), ['x']);
});

test('ordenarRuta: con más de 8 paradas usa vecino más cercano sin perder ninguna', () => {
  const muchas = Array.from({ length: 10 }, (_, i) => ({ id: i, punto: { lat: 6.33 + i * 0.002, lon: -75.56 } }));
  const ruta = ordenarRuta(muchas);
  assert.equal(ruta.length, 10);
  assert.equal(ruta[0].id, 9); // la más lejana de la oficina
  assert.deepEqual(new Set(ruta.map(r => r.id)).size, 10);
});

test('armarBorradorAgenda: meta por inspector, comunas distintas, sin repetir visitas', () => {
  const v = (fila, comuna, barrio) => ({ fila, comuna, barrio });
  const comunas = [
    { comuna: 6, visitas: [v(1, 6, 'A'), v(2, 6, 'B'), v(3, 6, 'A'), v(4, 6, 'C')] },
    { comuna: 1, visitas: [v(5, 1, 'X'), v(6, 1, 'X')] },
    { comuna: 4, visitas: [v(7, 4, 'Y'), v(8, 4, 'Y'), v(9, 4, 'Z')] },
  ];
  const b = armarBorradorAgenda(comunas, ['ALEJANDRO', 'MAURICIO'], 3, { MAURICIO: 1 });
  // Alejandro: comuna 6, primero el barrio de la más urgente (A).
  assert.deepEqual(b.ALEJANDRO.map(x => x.fila), [1, 3, 2]);
  // Mauricio ya tenía 1: le faltan 2, de la siguiente comuna libre.
  assert.deepEqual(b.MAURICIO.map(x => x.fila), [5, 6]);
  const todas = b.ALEJANDRO.concat(b.MAURICIO).map(x => x.fila);
  assert.equal(new Set(todas).size, todas.length);
});

test('armarBorradorAgenda: si una comuna no alcanza sigue con la siguiente, y al final repite', () => {
  const comunas = [
    { comuna: 6, visitas: [{ fila: 1, barrio: 'A' }, { fila: 2, barrio: 'A' }, { fila: 3, barrio: 'A' }, { fila: 4, barrio: 'A' }] },
    { comuna: 1, visitas: [{ fila: 5, barrio: 'X' }] },
  ];
  const b = armarBorradorAgenda(comunas, ['A1', 'A2'], 3, {});
  assert.deepEqual(b.A1.map(x => x.fila), [1, 2, 3]);
  // Solo queda la 5 en una comuna libre; después repite la comuna 6.
  assert.deepEqual(b.A2.map(x => x.fila), [5, 4]);
  assert.deepEqual(armarBorradorAgenda([], ['A1'], 3, {}), { A1: [] });
});

test('días de la agenda: abre en hoy o en el siguiente día hábil', () => {
  const sabado = new Date(2026, 9, 3);
  assert.equal(diaInicialAgenda(sabado).getDate(), 5); // lunes 5 de octubre
  const martes = new Date(2026, 9, 6, 15, 30);
  assert.equal(diaInicialAgenda(martes).getTime(), new Date(2026, 9, 6).getTime());
  assert.equal(moverDiaHabil(new Date(2026, 9, 5), -1).getDate(), 2); // viernes 2
  assert.equal(moverDiaHabil(new Date(2026, 9, 9), 1).getDate(), 13); // lunes 12 es festivo (Día de la Raza)
  assert.equal(fechaLargaAgenda(new Date(2026, 9, 5)), 'Lunes 5 de octubre');
});

test('visitasDelDia: lo que el inspector ya tiene ese día cuenta para su meta', () => {
  const filas = [
    { 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'MAURICIO HERRERA LOPERA', 'FECHA ASIGNACION VISITA': '05/10/2026' },
    { 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'MAURICIO HERRERA LOPERA', 'FECHA ASIGNACION VISITA': '06/10/2026' },
    { 'ESTADO VISITA': 'PENDIENTE', 'VISITADOR(ES)': 'MAURICIO HERRERA LOPERA', 'FECHA ASIGNACION VISITA': '05/10/2026' },
    { 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'ALEJANDRO HERNANDEZ MUÑOZ', 'FECHA ASIGNACION VISITA': '05/10/2026' },
  ];
  assert.equal(visitasDelDia(filas, new Date(2026, 9, 5), 'MAURICIO HERRERA LOPERA').length, 1);
  assert.equal(visitasDelDia(filas, new Date(2026, 9, 5), 'ALEJANDRO HERNANDEZ MUÑOZ').length, 1);
});

// ── Backend: _decisionAsignarAgenda (extraída con vm) ──────────
const BACKEND = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const hay = fs.existsSync(BACKEND);
const opts = { skip: hay ? false : 'apps_script_unificado.js no está en esta copia' };

function cargarDecision() {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const piezas = [
    /var ESTADOS_AGENDA\s*=[^\n]*/.exec(src),
    /function _decisionAsignarAgenda\([^)]*\) \{[\s\S]*?\n\}/.exec(src),
  ];
  piezas.forEach((p, i) => assert.ok(p, 'falta la pieza ' + i + ' en el backend'));
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(piezas.map(p => p[0]).join('\n'), ctx);
  return ctx._decisionAsignarAgenda;
}

test('backend: solo se asigna lo que sigue pendiente y en su fila', opts, () => {
  // Objeto de otro contexto (vm): se pasa por JSON para comparar por valor.
  const crudo = cargarDecision();
  const decidir = (...a) => JSON.parse(JSON.stringify(crudo(...a)));
  assert.deepEqual(decidir('PENDIENTE', '20261036720', '20261036720'), { ok: true });
  assert.deepEqual(decidir('PQR PENDIENTE', '20261036720', '20261036720.0'), { ok: true });
  assert.deepEqual(decidir('INICIADO', '20261036720', '20261036720'), { ok: false, motivo: 'ya iniciada' });
  assert.deepEqual(decidir('ASIGNADO', '20261036720', '20261036720'), { ok: false, motivo: 'ya asignada' });
  assert.deepEqual(decidir('COMPLETADO', '20261036720', '20261036720'), { ok: false, motivo: 'ya completada' });
  assert.deepEqual(decidir('PENDIENTE', '20261044853', '20261036720'), { ok: false, motivo: 'fila movida' });
  assert.deepEqual(decidir('PENDIENTE', '', ''), { ok: false, motivo: 'sin radicado' });
});
