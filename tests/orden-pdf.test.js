// ═══════════════════════════════════════════════════════════════
// tests/orden-pdf.test.js — el escáner debe reconocer como PDF lo que
// entregan las apps de escaneo del teléfono.
//
// El tipo MIME no es de fiar: según la app, Android manda el PDF con
// `type` vacío o `application/octet-stream`. Si no se reconoce, el archivo
// cae en la rama de imágenes, `_eoLeerImagen` falla y el inspector ve
// «No se pudo procesar ninguna de las imágenes».
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'escaner-orden.jsx'), 'utf8');
const fn = /function _eoEsPdf\(f\) \{[\s\S]*?\n\}/.exec(src);
assert.ok(fn, 'no se encontró _eoEsPdf en escaner-orden.jsx');
const ctx = vm.createContext({});
vm.runInContext(fn[0], ctx);
const esPdf = vm.runInContext('_eoEsPdf', ctx);

test('PDF con MIME correcto', () => {
  assert.equal(esPdf({ type: 'application/pdf', name: 'scan.pdf' }), true);
});

test('PDF sin MIME o con octet-stream: manda el nombre', () => {
  assert.equal(esPdf({ type: '', name: 'ORDEN_2026-09-371.PDF' }), true);
  assert.equal(esPdf({ type: 'application/octet-stream', name: 'doc.pdf' }), true);
});

test('una foto no es PDF', () => {
  assert.equal(esPdf({ type: 'image/jpeg', name: 'IMG_0021.jpg' }), false);
  assert.equal(esPdf({ type: 'image/jpeg', name: '' }), false);
});

test('no basta con que el nombre contenga «pdf»', () => {
  assert.equal(esPdf({ type: 'image/jpeg', name: 'pdf_escaneado.jpg' }), false);
});
