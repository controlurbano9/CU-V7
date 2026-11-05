// ═══════════════════════════════════════════════════════════════
// tests/completadas-copiar.test.js — partirCitadoExcel, el helper de
// «Citaciones visitas completadas» (2026-11-05): el renglón rotula sus datos
// y «Citado» parte «Nombre - C.C. 123» (como lo arma _filaExcelCitacion en
// el backend) en nombre y documento. La pantalla vive en audiencias.jsx
// (CompletadasCaja); aquí solo la lógica pura.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { partirCitadoExcel } = require('../utils.js');

test('partirCitadoExcel: «Nombre - C.C. 1020412418» parte nombre y documento', () => {
  assert.deepEqual(partirCitadoExcel('Santiago Andres Gomez Zapata - C.C. 1020412418'),
    { nombre: 'Santiago Andres Gomez Zapata', documento: '1020412418' });
});

test('partirCitadoExcel: sin documento, solo el nombre', () => {
  assert.deepEqual(partirCitadoExcel('María F. Gómez'), { nombre: 'María F. Gómez', documento: '' });
});

test('partirCitadoExcel: vacío o nulo no explota', () => {
  assert.deepEqual(partirCitadoExcel(''), { nombre: '', documento: '' });
  assert.deepEqual(partirCitadoExcel(null), { nombre: '', documento: '' });
  assert.deepEqual(partirCitadoExcel(undefined), { nombre: '', documento: '' });
});

test('partirCitadoExcel: «NO APORTA» no es un documento', () => {
  // La constancia de «No aportó documento» llega como NO APORTA: sin dígitos.
  assert.deepEqual(partirCitadoExcel('Marta Ospina - C.C. NO APORTA'),
    { nombre: 'Marta Ospina', documento: '' });
  assert.deepEqual(partirCitadoExcel('NO APORTA'), { nombre: 'NO APORTA', documento: '' });
});

test('partirCitadoExcel: apellido con guion queda en el nombre', () => {
  assert.deepEqual(partirCitadoExcel('María Pérez-Gómez - C.C. 123456'),
    { nombre: 'María Pérez-Gómez', documento: '123456' });
});

test('partirCitadoExcel: documento con puntos o espacios, solo dígitos', () => {
  assert.deepEqual(partirCitadoExcel('Jorge Berrío - C.C. 1.020.412'),
    { nombre: 'Jorge Berrío', documento: '1020412' });
  assert.deepEqual(partirCitadoExcel('Luz Cano - CC 43 123 456'),
    { nombre: 'Luz Cano', documento: '43123456' });
});

test('partirCitadoExcel: parte por el último « - C.C. » si el nombre lo trae', () => {
  assert.deepEqual(partirCitadoExcel('Ana - C.C. 1 - C.C. 2'),
    { nombre: 'Ana - C.C. 1', documento: '2' });
});

test('partirCitadoExcel: un « - » sin C.C. no parte nada', () => {
  assert.deepEqual(partirCitadoExcel('Juan Perez - Maria Gomez'),
    { nombre: 'Juan Perez - Maria Gomez', documento: '' });
});
