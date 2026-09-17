// ═══════════════════════════════════════════════════════════════
// tests/fechas-bd.test.js — leer fechas de BD sin perderlas ni cambiarlas.
//
// La regla dice que BD guarda `DD/MM/YYYY`, pero las filas viejas de V2 y
// las que alguien edita a mano en el Sheet traen `1/9/2026`. Con ese valor:
//   · `_fechaAIso` devolvía '' → el campo salía VACÍO en el formulario con
//     el dato presente en BD, el inspector guardaba encima y lo borraba
//     (acta sin fecha de radicado).
//   · `_normalizarFechaCelda` caía al fallback `new Date(s)`, que lee M/D y
//     convertía el 1 de septiembre en 9 de enero, en silencio.
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'nueva-visita.jsx'), 'utf8');
const ctx = vm.createContext({ Date });
for (const nombre of ['_fechaAIso', '_normalizarFechaCelda']) {
  const re = new RegExp('function ' + nombre + '\\(valor\\) \\{[\\s\\S]*?\\n\\}');
  const fn = re.exec(src);
  assert.ok(fn, 'no se encontró ' + nombre + ' en nueva-visita.jsx');
  vm.runInContext(fn[0], ctx);
}
const aIso = vm.runInContext('_fechaAIso', ctx);
const aCelda = vm.runInContext('_normalizarFechaCelda', ctx);

test('_fechaAIso — DD/MM/YYYY canónico', () => {
  assert.equal(aIso('01/09/2026'), '2026-09-01');
});

test('_fechaAIso — sin ceros a la izquierda (fila vieja o editada a mano)', () => {
  assert.equal(aIso('1/9/2026'), '2026-09-01');
  assert.equal(aIso('1/12/2026'), '2026-12-01');
  assert.equal(aIso('15/9/2026'), '2026-09-15');
});

test('_fechaAIso — Date y formas ISO siguen funcionando', () => {
  assert.equal(aIso(new Date(2026, 8, 1)), '2026-09-01');
  assert.equal(aIso('2026-09-01'), '2026-09-01');
  assert.equal(aIso('2026-09-01T10:00:00.000Z'), '2026-09-01');
  assert.equal(aIso(''), '');
});

test('_normalizarFechaCelda — sin ceros: día y mes NO se intercambian', () => {
  // El fallo: new Date('1/9/2026') es el 9 de enero para JS.
  assert.equal(aCelda('1/9/2026'), '01/09/2026');
  assert.equal(aCelda('3/11/2026'), '03/11/2026');
});

test('_normalizarFechaCelda — canónico, ISO y con hora', () => {
  assert.equal(aCelda('01/09/2026'), '01/09/2026');
  assert.equal(aCelda('2026-09-01'), '01/09/2026');
  assert.equal(aCelda('1/9/2026 14:30'), '01/09/2026');
  assert.equal(aCelda(''), '');
});
