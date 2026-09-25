// ═══════════════════════════════════════════════════════════════
// tests/visitas-copia-local.test.js — leerVisitas sirve la copia local al
// instante también después de una escritura, con lo guardado ya aplicado.
//
// Antes, tras cualquier guardado la copia quedaba «sucia» y Inicio esperaba la
// descarga completa de BD VISITAS (1,1 MB por el salto /macros/echo de Google)
// con el spinner a la vista. Ahora pinta la copia, parchada con la fila que el
// servidor acaba de confirmar, y refresca por detrás.
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
const ini = src.indexOf('const CACHE_TTL_MS');
const fin = src.indexOf('// Las pantallas que listan visitas');
assert.ok(ini > 0 && fin > ini, 'no se encontró el bloque de caché de visitas en api.js');

const HEADERS = ['ATENCION PQR', 'RADICADO', 'ESTADO VISITA', 'OBS', 'ULTIMA_MODIFICACION'];

// Contexto nuevo por prueba: leerHoja la controla la prueba (pedidos en vuelo).
function montar() {
  const pedidos = [];
  const eventos = [];
  const ctx = vm.createContext({
    CFG: { hoja: 'BD VISITAS' },
    console,
    CustomEvent: function (tipo) { this.type = tipo; },
    window: { dispatchEvent: e => eventos.push(e.type) },
    leerHoja: () => new Promise((resolve, reject) => pedidos.push({ resolve, reject })),
  });
  vm.runInContext(src.slice(ini, fin), ctx);
  const f = n => vm.runInContext(n, ctx);
  return { pedidos, eventos, leerVisitas: f('leerVisitas'), invalidarCache: f('invalidarCache'),
    parchear: f('_parchearVisitaLocal') };
}

const BD = [HEADERS,
  ['', 'R-1', 'PENDIENTE', '', '2026-09-20T10:00:00.000Z'],
  ['', 'R-2', 'ASIGNADO', 'x', '']];

const tic = () => new Promise(r => setImmediate(r));

test('tras guardar, la copia se sirve sin esperar la red y con el cambio aplicado', async () => {
  const m = montar();
  const p0 = m.leerVisitas();
  await tic();
  m.pedidos[0].resolve(BD);
  assert.equal((await p0).datos.length, 2);

  m.invalidarCache('visitas');
  // valores arranca en la columna B: RADICADO, ESTADO VISITA, OBS
  m.parchear(2, ['R-1', 'INICIADO', 'obs nueva'], '2026-09-25T15:00:00.000Z');

  // Ningún pedido se resuelve: si leerVisitas esperara la red, esto vencería.
  const res = await Promise.race([m.leerVisitas(), new Promise((_, rej) =>
    setTimeout(() => rej(new Error('leerVisitas esperó la red con copia local disponible')), 500))]);
  const r1 = res.datos.find(o => o._idx === 2);
  assert.equal(r1['ESTADO VISITA'], 'INICIADO');
  assert.equal(r1['OBS'], 'obs nueva');
  assert.equal(r1[2], 'INICIADO');
  assert.equal(r1['ULTIMA_MODIFICACION'], '2026-09-25T15:00:00.000Z');
  assert.equal(r1['ATENCION PQR'], ''); // columna A: fuera del payload, intacta
  assert.equal(res.datos.find(o => o._idx === 3)['ESTADO VISITA'], 'ASIGNADO');
  assert.equal(m.pedidos.length, 2, 'debe lanzar el refresco por detrás');
  assert.ok(m.eventos.includes('cu-visitas-actualizadas'));
});

test('una visita nueva (agregar) aparece en la copia en su fila', async () => {
  const m = montar();
  const p0 = m.leerVisitas();
  await tic();
  m.pedidos[0].resolve(BD);
  await p0;
  m.invalidarCache('visitas');
  m.parchear(4, ['R-9', 'INICIADO', ''], '');
  const res = await m.leerVisitas();
  assert.deepEqual(res.datos.map(o => o._idx), [2, 3, 4]);
  assert.equal(res.datos[2]['RADICADO'], 'R-9');
  assert.equal(res.datos[2]['ULTIMA_MODIFICACION'], '');
});

test('sin radicado o sin copia no se inventa nada', async () => {
  const m = montar();
  m.parchear(2, ['R-1', 'INICIADO', ''], ''); // aún sin copia: no-op, no revienta
  const p0 = m.leerVisitas();
  await tic();
  m.pedidos[0].resolve(BD);
  await p0;
  m.parchear(9, ['', 'INICIADO', ''], '');
  const res = await m.leerVisitas();
  assert.equal(res.datos.length, 2);
});

test('la descarga posterior reemplaza la copia parchada por la del servidor', async () => {
  const m = montar();
  const p0 = m.leerVisitas();
  await tic();
  m.pedidos[0].resolve(BD);
  await p0;
  m.invalidarCache('visitas');
  m.parchear(2, ['R-1', 'INICIADO', 'local'], '');
  await m.leerVisitas();
  const servidor = BD.map(f => f.slice());
  servidor[1][2] = 'INICIADO'; servidor[1][3] = 'del servidor';
  m.pedidos[1].resolve(servidor);
  await tic(); await tic();
  const res = await m.leerVisitas();
  assert.equal(res.datos.find(o => o._idx === 2)['OBS'], 'del servidor');
});
