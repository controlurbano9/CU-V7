// tests/visitas-del-caso.test.js — visitasDelCaso (utils.js): las visitas del caso
// que la gestión del admin mira en «Ver datos» (Inicio, Audiencias…), con la misma
// clave con que Buscar agrupa. Decide si se ofrece «+ Nueva visita». Ejecutar: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const U = require('../utils.js');

const fila = (idx, rad, estado) => ({ _idx: idx, RADICADO: rad, 'ESTADO VISITA': estado || 'COMPLETADO' });

test('trae las filas del mismo radicado, sin distinguir mayúsculas ni espacios', () => {
  const f = fila(10, 'OFICIO-2026-09-239');
  const datos = [fila(10, 'OFICIO-2026-09-239'), fila(11, ' Oficio-2026-09-239 ', 'PENDIENTE'),
    fila(12, '20261041285')];
  const r = U.visitasDelCaso(datos, f);
  assert.deepEqual(r.map(x => x._idx), [10, 11]);
  assert.equal(r[0], f, 'la fila abierta va primero y es la misma, no la copia de la lista');
});

test('una fila sin radicado real es un caso sola', () => {
  for (const rad of ['OPERATIVO', 'QUEJA VERBAL', '']) {
    const f = fila(20, rad);
    assert.deepEqual(U.visitasDelCaso([f, fila(21, rad), fila(22, rad)], f), [f], '«' + rad + '»');
  }
});

test('sin lista devuelve la fila sola; sin fila, nada', () => {
  const f = fila(30, '20261092195');
  assert.deepEqual(U.visitasDelCaso(null, f), [f]);
  assert.deepEqual(U.visitasDelCaso([], null), []);
});
