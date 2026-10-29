// ═══════════════════════════════════════════════════════════════
// tests/registrar-radicado.test.js — «Registrar radicado» desde Buscar
// (2026-10-29). Backend: _validarRegistroRadicado, _fechaRadicadoTexto y
// _casoQueReitera (apps_script_unificado.js). Cliente: cuándo ofrece
// registrar (puedeRegistrarRadicado) y el barrio que sale del POT
// (barrioRegistroDesdePot), en utils.js.
//
// Reglas del usuario: se registra solo desde el estado vacío de Buscar, solo
// admin y supervisores, los cinco campos del Formulario son obligatorios y el
// punto del predio se guarda (el inspector confirma la ubicación en la visita).
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { puedeRegistrarRadicado, barrioRegistroDesdePot } = require('../utils.js');

const BACKEND = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const hay = fs.existsSync(BACKEND);
const opts = { skip: hay ? false : 'apps_script_unificado.js no está en esta copia' };

function cargar() {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const fn = n => new RegExp('function ' + n + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}').exec(src);
  const piezas = [
    /var BARRIO_COMUNA = \{[\s\S]*?\n\};/.exec(src),
    /var _VIAS_DIR_BD = \[[\s\S]*?\n\];/.exec(src),
    fn('normalizarDireccionBD'), fn('quitarTildes'), fn('capitalizarNombre'),
    fn('parsearFecha'), fn('parsearFechaVisita'), fn('_normRadicadoFila'),
    fn('_formaRadicadoValida'), fn('_tokensReiterados'),
    fn('_fechaRadicadoTexto'), fn('_validarRegistroRadicado'), fn('_casoQueReitera'),
  ];
  piezas.forEach((p, i) => assert.ok(p, 'falta la pieza ' + i + ' del backend'));
  const ctx = vm.createContext({ Utilities: { formatDate: () => '' } });
  vm.runInContext(piezas.map(p => p[0]).join('\n'), ctx);
  return name => vm.runInContext(name, ctx);
}

const HOY = new Date(2026, 9, 29);
const BUENO = {
  radicado: ' 20261064187 ', fechaRadicado: '27/10/2026', direccion: 'calle 50 32 10',
  barrio: 'Niquia Bifamiliares', comuna: '7', denunciante: 'maría fernanda ospina',
  lat: '6.334512', lon: '-75.556201',
};

test('backend: un registro completo sale limpio y en el formato de la BD', opts, () => {
  const validar = cargar()('_validarRegistroRadicado');
  const r = validar(BUENO, HOY);
  assert.equal(r.ok, true);
  assert.equal(r.datos.radicado, '20261064187');
  assert.equal(r.datos.fecha, '27/10/2026');
  assert.equal(r.datos.direccion, 'CL 50 # 32-10');
  assert.equal(r.datos.denunciante, 'María Fernanda Ospina');
  assert.equal(r.datos.comuna, '7');
  assert.equal(r.datos.lat, 6.334512);
});

test('backend: los cinco campos son obligatorios', opts, () => {
  const validar = cargar()('_validarRegistroRadicado');
  [['radicado', ''], ['fechaRadicado', ''], ['direccion', '  '], ['barrio', ''], ['denunciante', '']]
    .forEach(([k, v]) => {
      const r = validar(Object.assign({}, BUENO, { [k]: v }), HOY);
      assert.equal(r.ok, false, k);
    });
});

test('backend: radicado con forma inválida, fecha imposible o futura', opts, () => {
  const validar = cargar()('_validarRegistroRadicado');
  assert.equal(validar(Object.assign({}, BUENO, { radicado: '2026106418' }), HOY).campo, 'radicado');
  assert.equal(validar(Object.assign({}, BUENO, { radicado: '2026-001234' }), HOY).ok, true);
  assert.equal(validar(Object.assign({}, BUENO, { fechaRadicado: '31/02/2026' }), HOY).campo, 'fecha');
  assert.equal(validar(Object.assign({}, BUENO, { fechaRadicado: '30/10/2026' }), HOY).campo, 'fecha');
  assert.equal(validar(Object.assign({}, BUENO, { fechaRadicado: '29/10/2026' }), HOY).ok, true);
});

test('backend: sin comuna la saca del barrio; punto fuera de Bello no se guarda', opts, () => {
  const validar = cargar()('_validarRegistroRadicado');
  const r = validar(Object.assign({}, BUENO, { barrio: 'París', comuna: '', lat: '4.6', lon: '-74.1' }), HOY);
  assert.equal(r.ok, true);
  assert.equal(r.datos.comuna, '1');
  assert.equal(r.datos.lat, '');
  assert.equal(r.datos.lon, '');
});

test('backend: la fecha del Formulario pasa a DD/MM/YYYY', opts, () => {
  const f = cargar()('_fechaRadicadoTexto');
  assert.equal(f('7/10/2026'), '07/10/2026');
  assert.equal(f('2026-10-07'), '07/10/2026');
  assert.equal(f(''), '');
});

test('backend: un radicado anotado como reiterado no se registra aparte', opts, () => {
  const caso = cargar()('_casoQueReitera');
  const filas = [['', '20261049145', '20261064187\n20261070000'], ['', '20261050000', '']];
  assert.equal(caso(filas, 1, 2, '20261064187'), '20261049145');
  assert.equal(caso(filas, 1, 2, '20261099999'), '');
  assert.equal(caso(filas, 1, -1, '20261064187'), '');
});

// ── Cliente ──────────────────────────────────────────────────

const filasBD = [
  { RADICADO: '20261049145', 'RADICADOS REITERADOS': '20261064187' },
  { RADICADO: '20261050000' },
];

test('cliente: ofrece registrar solo con forma de radicado que no está en la base', () => {
  assert.equal(puedeRegistrarRadicado('20261099999', filasBD, 'ADMIN'), true);
  assert.equal(puedeRegistrarRadicado(' 20261099999 ', filasBD, 'SUPERVISOR'), true);
  assert.equal(puedeRegistrarRadicado('2026-001234', filasBD, 'ADMIN'), true);
  assert.equal(puedeRegistrarRadicado('20261050000', filasBD, 'ADMIN'), false);    // ya está
  assert.equal(puedeRegistrarRadicado('20261064187', filasBD, 'ADMIN'), false);    // reiterado
  assert.equal(puedeRegistrarRadicado('cl 50 32 10', filasBD, 'ADMIN'), false);    // texto libre
  assert.equal(puedeRegistrarRadicado('2026106', filasBD, 'ADMIN'), false);        // a medias
});

test('cliente: el inspector no registra', () => {
  assert.equal(puedeRegistrarRadicado('20261099999', filasBD, 'INSPECTOR'), false);
  assert.equal(puedeRegistrarRadicado('20261099999', filasBD, ''), false);
});

test('cliente: barrio del POT con el nombre de la lista del formulario', () => {
  const lista = ['Niquia Bifamiliares', 'Paris', 'Vda. Hatoviejo'];
  const alias = { NIQUIABIFAMILIAR: 'Niquia Bifamiliares' };
  assert.deepEqual(barrioRegistroDesdePot({ n: 'Paris', c: '1' }, lista, alias), { barrio: 'Paris', comuna: '1' });
  assert.deepEqual(barrioRegistroDesdePot({ n: 'Niquia Bifamiliar', c: '7' }, lista, alias),
    { barrio: 'Niquia Bifamiliares', comuna: '7' });
  // Fuera de la lista: el nombre del POT tal cual, con su comuna.
  assert.deepEqual(barrioRegistroDesdePot({ n: 'Barrio Raro', c: '4' }, lista, alias), { barrio: 'Barrio Raro', comuna: '4' });
  assert.equal(barrioRegistroDesdePot(null, lista, alias), null);
});
