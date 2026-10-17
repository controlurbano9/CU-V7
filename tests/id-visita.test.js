// tests/id-visita.test.js — ID_VISITA (docs/PLAN_2026-10-14_id-visita.md).
// El número de fila no identifica una visita; el ID sí. El backend reescribe
// datos.fila con la fila real del ID antes de cualquier escritura.
// Ejecutar: npm test (se salta si apps_script_unificado.js no está en la copia).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BACKEND = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const hay = fs.existsSync(BACKEND);
const opts = { skip: hay ? false : 'apps_script_unificado.js no está en esta copia' };

function cargar() {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const fns = ['_colIndex', '_filasDeIdVisita', '_resolverFilaPorId', '_planIdsVisita'].map((n) => {
    const m = new RegExp('function ' + n + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}').exec(src);
    assert.ok(m, 'no se encontró ' + n);
    return m[0];
  });
  const log = [];
  const ctx = vm.createContext({
    HOJA_BD: 'BD VISITAS',
    registrarLog: (ss, u, txt) => log.push(txt),
    Utilities: { formatDate: () => 'hoy' },
  });
  vm.runInContext("var COL_ID_VISITA = 'ID_VISITA';\n" + fns.join('\n'), ctx);
  return { ctx, log };
}

// Hoja falsa: fila 1 = encabezados; solo lo que usan estas funciones.
function hoja(filas) {
  const headers = ['RADICADO', 'ID_VISITA'];
  const ws = {
    getLastRow: () => filas.length + 1,
    getLastColumn: () => headers.length,
    getRange: (r, c, nr) => ({
      getValues: () => [headers],
      createTextFinder: (id) => ({
        matchEntireCell: () => ({
          findAll: () => filas.map((f, i) => ({ f, row: i + 2 }))
            .filter((x) => x.row >= r && x.row < r + nr && x.f[c - 1] === id)
            .map((x) => ({ getRow: () => x.row })),
        }),
      }),
    }),
  };
  return { getSheetByName: () => ws };
}

test('resolver: la visita se corrió una fila → escribe en la nueva y lo registra', opts, () => {
  const { ctx, log } = cargar();
  const ss = hoja([['A', 'id-a'], ['B', 'id-b']]);
  const datos = { accion: 'actualizar', fila: 2, idVisita: 'id-b' };
  assert.equal(ctx._resolverFilaPorId(ss, datos, {}), null);
  assert.equal(datos.fila, 3);
  assert.equal(log.length, 1);
});

test('resolver: ID que ya no existe → rechaza sin tocar la fila', opts, () => {
  const { ctx } = cargar();
  const datos = { accion: 'completarRegistro', fila: 2, idVisita: 'id-x' };
  const r = ctx._resolverFilaPorId(hoja([['A', 'id-a']]), datos, {});
  assert.equal(r.ok, false);
  assert.equal(r.filaMovida, true);
  assert.equal(datos.fila, 2);
});

test('resolver: sin ID, ID repetido o agregar → no decide (sigue el control por radicado)', opts, () => {
  const { ctx } = cargar();
  const ss = hoja([['A', 'id-a'], ['B', 'id-a']]);
  for (const datos of [{ accion: 'actualizar', fila: 2 }, { accion: 'actualizar', fila: 3, idVisita: 'id-a' },
    { accion: 'agregar', idVisita: 'id-a' }]) {
    const antes = datos.fila;
    assert.equal(ctx._resolverFilaPorId(ss, datos, {}), null);
    assert.equal(datos.fila, antes);
  }
});

test('plan: ID a filas con radicado sin ID y a la copia de un ID repetido; nunca a filas vacías', opts, () => {
  const { ctx } = cargar();
  let n = 0;
  const p = ctx._planIdsVisita(['A', 'B', '', 'C', 'D'], ['id-a', '', '', 'id-a', 'id-d'], () => 'n' + (++n));
  assert.deepEqual(JSON.parse(JSON.stringify(p.cambios)), [{ i: 1, id: 'n1' }, { i: 3, id: 'n2' }]);
  assert.equal(p.repetidos, 1);
});
