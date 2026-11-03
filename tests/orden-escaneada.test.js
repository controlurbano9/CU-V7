// tests/orden-escaneada.test.js — faltaOrdenEscaneada (utils.js): el acta o el informe
// esperan la orden de policía escaneada cuando la orden es nueva en el caso
// (decisiones del usuario 2026-11-03: toda orden nueva se sube, con o sin
// suspensión, y aplica también al informe). Ejecutar: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const U = require('../utils.js');

const RAD = '20261041285';
const base = (extra) => Object.assign({
  orden: '2026-09-386', linkOrden: '', nVisita: '1', radicado: RAD, fila: 50,
}, extra);
const fila = (idx, n, orden, rad) => ({ _idx: idx, RADICADO: rad || RAD, 'N° VISITA': String(n), 'N° ORDEN DE POLICIA': orden });

test('1.ª visita con orden y sin escanear: se espera la orden', () => {
  assert.equal(U.faltaOrdenEscaneada(base(), []), true);
  assert.equal(U.faltaOrdenEscaneada(base(), null), true);
});

test('con la orden ya en Drive, o sin orden real, no falta nada', () => {
  assert.equal(U.faltaOrdenEscaneada(base({ linkOrden: 'https://drive.google.com/file/d/x' }), []), false);
  for (const o of ['', 'N/A', 'NO APLICA', null]) assert.equal(U.faltaOrdenEscaneada(base({ orden: o }), []), false, String(o));
  assert.equal(U.faltaOrdenEscaneada(null, []), false);
});

test('la suspensión no decide: una orden de oficio sin suspender también se sube', () => {
  assert.equal(U.faltaOrdenEscaneada(base({ suspension: 'NO' }), []), true);
});

test('seguimiento con orden nueva (distinta de las anteriores): se espera', () => {
  assert.equal(U.faltaOrdenEscaneada(base({ nVisita: '2', orden: '2026-09-420' }),
    [fila(40, 1, '2026-09-386'), fila(50, 2, '')]), true);
  // Una orden igual en una visita POSTERIOR, en otro caso o en la propia fila no la hace vieja.
  assert.equal(U.faltaOrdenEscaneada(base({ nVisita: '2' }), [fila(60, 3, '2026-09-386')]), true);
  assert.equal(U.faltaOrdenEscaneada(base({ nVisita: '2' }), [fila(41, 1, '2026-09-386', '20261099999')]), true);
  assert.equal(U.faltaOrdenEscaneada(base({ nVisita: '2' }), [fila(50, 2, '2026-09-386')]), true);
});

test('seguimiento que repite la orden de una visita anterior: no la exige', () => {
  assert.equal(U.faltaOrdenEscaneada(base({ nVisita: '2' }), [fila(40, 1, '2026-09-386')]), false);
  // Misma orden escrita sin el cero, y el radicado con otra grafía: el mismo caso.
  assert.equal(U.faltaOrdenEscaneada(base({ nVisita: '2', orden: '2026-9-386' }),
    [fila(40, 1, '2026-09-386', ' 20261041285 ')]), false);
});

test('seguimiento sin la lista de visitas: en la duda, la exige', () => {
  assert.equal(U.faltaOrdenEscaneada(base({ nVisita: '2' }), null), true);
});
