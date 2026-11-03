// tests/escaner-pdf.test.js — _eoPaginasPdf (escaner-orden.jsx): cuántas páginas trae
// el PDF de una app de escaneo. La orden de policía tiene 2 páginas y un PDF de 1 no
// se sube (decisión del usuario 2026-11-03); si no se puede saber, devuelve null.
// La función se extrae del .jsx con el método de escaner-imagen.test.js. Ejecutar: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'escaner-orden.jsx'), 'utf8');
const m = /function _eoPaginasPdf\([^)]*\) \{[\s\S]*?\n\}/.exec(src);
assert.ok(m, 'no se encontró _eoPaginasPdf en escaner-orden.jsx');
const ctx = vm.createContext({});
vm.runInContext(m[0], ctx);
const paginasPdf = vm.runInContext('_eoPaginasPdf', ctx);

// Esqueleto de PDF sin comprimir, como el de jsPDF o una app de escaneo.
const pdf = (n) => '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
  '2 0 obj\n<< /Type /Pages /Kids [' + Array.from({ length: n }, (_, i) => (3 + i) + ' 0 R').join(' ') +
  '] /Count ' + n + ' >>\nendobj\n' +
  Array.from({ length: n }, (_, i) => (3 + i) + ' 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox [0 0 612 936]>>\nendobj\n').join('') +
  '%%EOF';

test('cuenta las páginas de un PDF sin comprimir (con y sin espacios)', () => {
  assert.equal(paginasPdf(pdf(1)), 1);
  assert.equal(paginasPdf(pdf(2)), 2);
  assert.equal(paginasPdf(pdf(3)), 3);
});

test('el árbol /Pages no cuenta como página', () => {
  assert.equal(paginasPdf('<< /Type /Pages /Count 2 >> << /Type /Page >> << /Type /Page >>'), 2);
});

test('con los objetos comprimidos usa el /Count del árbol de páginas', () => {
  const comprimido = '%PDF-1.5\n5 0 obj\n<< /Type /ObjStm /N 4 /First 20 /Filter /FlateDecode >>\nstream\nxx\nendstream\n' +
    '9 0 obj\n<< /Type /Pages /Count 1 /Kids [10 0 R] >>\nendobj\n';
  assert.equal(paginasPdf(comprimido), 1);
  // Un /Count de los marcadores (/Outlines) no se toma por páginas.
  assert.equal(paginasPdf('<< /Type /Outlines /Count 7 >>'), null);
});

test('si no se puede saber, null (se sube igual)', () => {
  assert.equal(paginasPdf('%PDF-1.5\n<< /Type /ObjStm /Filter /FlateDecode >>\nstream\n...\nendstream'), null);
  assert.equal(paginasPdf(''), null);
});
