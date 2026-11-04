// ═══════════════════════════════════════════════════════════════
// tests/audiencias-mejoras.test.js — lógica pura del cliente agregada con la
// revisión de lógica y arquitectura de Audiencias (2026-11-04): tope de 400
// cupos por pedido, motivo de los cupos rechazados, citaciones pegadas en el
// Excel y cuándo pedir apartados. Las acciones del backend se prueban en
// tests/audiencias-backend.test.js.
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
  MAX_CUPOS_POR_PEDIDO, problemaCantidadCupos, textoRechazoCupo, separarPegadasExcel,
} = require('../utils.js');

test('problemaCantidadCupos: hasta 400 por pedido, como el servidor', () => {
  assert.equal(MAX_CUPOS_POR_PEDIDO, 400);
  assert.equal(problemaCantidadCupos(0), '');
  assert.equal(problemaCantidadCupos(400), '');
  assert.match(problemaCantidadCupos(401), /Son 401 cupos.*hasta 400/);
});

test('textoRechazoCupo: el motivo del servidor en palabras', () => {
  assert.match(textoRechazoCupo('Estado APARTADO'), /apartado por un inspector/);
  assert.match(textoRechazoCupo('Está apartado por un inspector'), /apartado por un inspector/);
  assert.match(textoRechazoCupo('Estado POR_APARTAR'), /confírmalo en el Excel o elimínalo/);
  assert.match(textoRechazoCupo('Tiene una cita: libérala primero'), /libérala primero/);
  assert.equal(textoRechazoCupo('No existe'), 'ya no existe');
  assert.equal(textoRechazoCupo('Fecha ilegible'), 'fecha ilegible');
  assert.equal(textoRechazoCupo(''), 'no se pudo');
});

test('separarPegadasExcel: pendientes y pegadas, en el orden de la lista', () => {
  const lista = [{ idCupo: 'a' }, { idCupo: 'visita-V-2' }, { idCupo: 'c' }];
  const r = separarPegadasExcel(lista, { 'visita-V-2': { en: '05/04/2027 10:00', por: 'DANIEL PEDRAZA' } });
  assert.deepEqual(r.pendientes.map(x => x.idCupo), ['a', 'c']);
  assert.equal(r.pegadas.length, 1);
  assert.equal(r.pegadas[0].idCupo, 'visita-V-2');
  assert.equal(r.pegadas[0].pegada.por, 'DANIEL PEDRAZA');
  // Sin marcas (inspector, o backend sin desplegar): todas pendientes.
  assert.equal(separarPegadasExcel(lista, null).pendientes.length, 3);
  assert.deepEqual(separarPegadasExcel([], {}), { pendientes: [], pegadas: [] });
});

// _hayQueApartarCupos vive en api.js: se extrae con vm, como en
// tests/audiencias-correcciones.test.js.
function hayQueApartar() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
  const piezas = [/const _APARTADOS_MAX = \d+;/, /function _hayQueApartarCupos\([^)]*\) \{[\s\S]*?\n\}/]
    .map(re => { const m = re.exec(src); assert.ok(m, 'no se encontró en api.js: ' + re); return m[0]; });
  const ctx = vm.createContext({});
  vm.runInContext(piezas.join('\n') + '\nthis.f = _hayQueApartarCupos;', ctx);
  return ctx.f;
}

test('apartar: una vez al día por equipo, salvo que falten apartados', () => {
  const f = hayQueApartar();
  assert.equal(f('', '05/04/2027', 0), true, 'nunca se pidieron');
  assert.equal(f('04/04/2027', '05/04/2027', 3), true, 'se pidieron ayer');
  assert.equal(f('05/04/2027', '05/04/2027', 3), false, 'hoy ya, y están los 3');
  assert.equal(f('05/04/2027', '05/04/2027', 2), true, 'hoy ya, pero usó uno');
});
