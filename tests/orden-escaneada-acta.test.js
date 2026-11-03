// tests/orden-escaneada-acta.test.js — faltaOrdenEscaneadaActa (utils.js): el acta
// espera la orden de policía escaneada cuando la suspensión de la obra se decreta
// por primera vez en el caso (decisión del usuario 2026-11-03). Ejecutar: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const U = require('../utils.js');

const RAD = '20261041285';
const base = (extra) => Object.assign({
  suspension: 'SI', orden: '2026-09-386', linkOrden: '', nVisita: '1', radicado: RAD, fila: 50,
}, extra);
const fila = (idx, n, suspension) => ({ _idx: idx, RADICADO: RAD, 'N° VISITA': String(n), 'SUSPENSION DE LA OBRA': suspension });

test('1.ª visita con suspensión y sin escanear: el acta espera la orden', () => {
  assert.equal(U.faltaOrdenEscaneadaActa(base(), []), true);
  assert.equal(U.faltaOrdenEscaneadaActa(base(), null), true);
});

test('con la orden ya en Drive, o sin suspensión, no falta nada', () => {
  assert.equal(U.faltaOrdenEscaneadaActa(base({ linkOrden: 'https://drive.google.com/file/d/x' }), []), false);
  for (const s of ['NO', 'N/A', '']) assert.equal(U.faltaOrdenEscaneadaActa(base({ suspension: s }), []), false, s);
  // Sin N° de orden real no hay qué escanear (el formulario ya exige el número).
  for (const o of ['', 'N/A', 'NO APLICA']) assert.equal(U.faltaOrdenEscaneadaActa(base({ orden: o }), []), false, o);
});

test('seguimiento: si una visita anterior del caso ya suspendió, no la exige', () => {
  const datos = [fila(40, 1, 'SI'), fila(50, 2, '')];
  assert.equal(U.faltaOrdenEscaneadaActa(base({ nVisita: '2' }), datos), false);
  // Mismo radicado escrito distinto (mayúsculas, espacios): es el mismo caso.
  const otraGrafia = [{ _idx: 40, RADICADO: ' 20261041285 ', 'N° VISITA': '1', 'SUSPENSION DE LA OBRA': 'si' }];
  assert.equal(U.faltaOrdenEscaneadaActa(base({ nVisita: '2' }), otraGrafia), false);
});

test('seguimiento sin suspensión previa en el caso: es la primera, la exige', () => {
  assert.equal(U.faltaOrdenEscaneadaActa(base({ nVisita: '2' }), [fila(40, 1, 'NO'), fila(50, 2, '')]), true);
  // La suspensión de una visita POSTERIOR o de otro caso no cuenta.
  assert.equal(U.faltaOrdenEscaneadaActa(base({ nVisita: '2' }), [fila(60, 3, 'SI')]), true);
  assert.equal(U.faltaOrdenEscaneadaActa(base({ nVisita: '2' }),
    [{ _idx: 41, RADICADO: '20261099999', 'N° VISITA': '1', 'SUSPENSION DE LA OBRA': 'SI' }]), true);
  // La propia fila (ya guardada con SI) no cuenta como «anterior».
  assert.equal(U.faltaOrdenEscaneadaActa(base({ nVisita: '2' }), [fila(50, 2, 'SI')]), true);
});

test('seguimiento sin la lista de visitas: en la duda, la exige', () => {
  assert.equal(U.faltaOrdenEscaneadaActa(base({ nVisita: '2' }), null), true);
});
