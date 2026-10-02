// ═══════════════════════════════════════════════════════════════
// tests/reiterados-backend.test.js — agregar un radicado reiterado a un caso
// (apps_script_unificado.js → _evaluarReiterado, _tokensReiterados,
// _formaRadicadoValida, _esFilaReiterada) y su forma en el cliente
// (utils.js → formaRadicadoValida).
//
// Reglas del usuario (2026-10-02): un reiterado radicado MÁS de 3 meses
// después del principal no es reiteración, es un radicado nuevo con su propia
// fila; y uno que ya tiene visita iniciada o completada es un caso aparte.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { formaRadicadoValida, radicadosReiterados } = require('../utils.js');

const BACKEND = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const hay = fs.existsSync(BACKEND);
const opts = { skip: hay ? false : 'apps_script_unificado.js no está en esta copia' };

function cargar() {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const piezas = [
    /var ESTADO_REITERADO\s*=[^\n]*\nvar REITERADO_MESES_MAX\s*=[^\n]*/.exec(src),
    /function _formaRadicadoValida\([^)]*\) \{[\s\S]*?\n\}/.exec(src),
    /function _tokensReiterados\([^)]*\) \{[\s\S]*?\n\}/.exec(src),
    /function _evaluarReiterado\([^)]*\) \{[\s\S]*?\n\}/.exec(src),
    /function _esFilaReiterada\([^)]*\) \{[\s\S]*?\n\}/.exec(src),
  ];
  piezas.forEach((p, i) => assert.ok(p, 'falta la pieza ' + i + ' de reiterados en el backend'));
  const ctx = vm.createContext({});
  vm.runInContext(piezas.map(p => p[0]).join('\n'), ctx);
  return name => vm.runInContext(name, ctx);
}

const base = { principal: '20261050000', reiterado: '20261060001', estadosFilaPropia: [], casoQueYaLoTiene: '' };
const d = (a, m, dia) => new Date(a, m - 1, dia);

test('dentro de los 3 meses: se acepta (el día límite incluido)', opts, () => {
  const ev = cargar()('_evaluarReiterado');
  assert.equal(ev({ ...base, fechaPrincipal: d(2026, 5, 15), fechaReiterado: d(2026, 6, 1) }).ok, true);
  assert.equal(ev({ ...base, fechaPrincipal: d(2026, 5, 15), fechaReiterado: d(2026, 8, 15) }).ok, true);
  // Una hora del día en la celda no corre el límite.
  assert.equal(ev({ ...base, fechaPrincipal: d(2026, 5, 15), fechaReiterado: new Date(2026, 7, 15, 18, 30) }).ok, true);
});

test('más de 3 meses después: se rechaza como radicado nuevo', opts, () => {
  const ev = cargar()('_evaluarReiterado');
  const r = ev({ ...base, fechaPrincipal: d(2026, 5, 15), fechaReiterado: d(2026, 8, 16) });
  assert.equal(r.ok, false);
  assert.equal(r.fueraDePlazo, true);
  assert.match(r.error, /propia fila/);
  // Cruza el año.
  assert.equal(ev({ ...base, fechaPrincipal: d(2025, 11, 20), fechaReiterado: d(2026, 2, 21) }).fueraDePlazo, true);
  assert.equal(ev({ ...base, fechaPrincipal: d(2025, 11, 20), fechaReiterado: d(2026, 2, 20) }).ok, true);
});

test('radicado anterior al principal: no es «más de 3 meses después», se acepta', opts, () => {
  const ev = cargar()('_evaluarReiterado');
  assert.equal(ev({ ...base, fechaPrincipal: d(2026, 5, 15), fechaReiterado: d(2026, 1, 10) }).ok, true);
});

test('sin fecha del reiterado no se anota; sin la del principal se avisa', opts, () => {
  const ev = cargar()('_evaluarReiterado');
  assert.equal(ev({ ...base, fechaPrincipal: d(2026, 5, 15), fechaReiterado: null }).ok, false);
  const r = ev({ ...base, fechaPrincipal: null, fechaReiterado: d(2026, 6, 1) });
  assert.equal(r.ok, true);
  assert.match(r.aviso, /no se pudo comprobar/);
});

test('forma, radicado propio y reiterado de otro caso', opts, () => {
  const ev = cargar()('_evaluarReiterado');
  const f = { fechaPrincipal: d(2026, 5, 15), fechaReiterado: d(2026, 6, 1) };
  assert.equal(ev({ ...base, ...f, reiterado: '2026106' }).ok, false);
  assert.equal(ev({ ...base, ...f, reiterado: 'OFICIO-2026-09-300' }).ok, false);
  assert.equal(ev({ ...base, ...f, reiterado: '2026-004197' }).ok, true);
  assert.equal(ev({ ...base, ...f, reiterado: base.principal }).ok, false);
  assert.match(ev({ ...base, ...f, casoQueYaLoTiene: '20261040000' }).error, /20261040000/);
  // Ya anotado en ESTE caso (otra visita): no es conflicto.
  assert.equal(ev({ ...base, ...f, casoQueYaLoTiene: base.principal }).ok, true);
});

test('con fila propia iniciada o completada es un caso aparte', opts, () => {
  const ev = cargar()('_evaluarReiterado');
  const f = { fechaPrincipal: d(2026, 5, 15), fechaReiterado: d(2026, 6, 1) };
  for (const e of ['INICIADO', 'COMPLETADO', ' completada ']) {
    assert.equal(ev({ ...base, ...f, estadosFilaPropia: ['PENDIENTE', e] }).ok, false, e);
  }
  for (const e of ['PENDIENTE', 'ASIGNADO', '', 'REITERADO']) {
    assert.equal(ev({ ...base, ...f, estadosFilaPropia: [e] }).ok, true, e);
  }
});

test('la fila propia marcada REITERADO sale de la respuesta compacta', opts, () => {
  const g = cargar();
  assert.equal(g('_esFilaReiterada')(' reiterado '), true);
  assert.equal(g('_esFilaReiterada')('PENDIENTE'), false);
  const src = fs.readFileSync(BACKEND, 'utf8');
  const compactar = /function _compactarBdVisitas\([^)]*\) \{[\s\S]*?\n\}/.exec(src)[0];
  assert.ok(compactar.includes('_esFilaReiterada('), '_compactarBdVisitas no filtra REITERADO');
});

test('guardar el formulario conserva los reiterados que hay en la hoja', opts, () => {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const ini = src.indexOf("case 'actualizar':");
  const bloque = src.slice(ini, src.indexOf("case 'resetPin':", ini));
  const conserva = bloque.indexOf("'RADICADOS REITERADOS'");
  assert.ok(conserva > 0, "'actualizar' no conserva RADICADOS REITERADOS");
  assert.ok(conserva < bloque.indexOf('.setValues([datos.valores])'), 'debe leerse antes de escribir la fila');
});

test('backend y cliente separan la celda igual y validan la misma forma', opts, () => {
  const g = cargar();
  const celda = '20261060001, 20261070002 / oficio-2026-09-300 y 2025-123456\nRPTA';
  assert.deepEqual(Array.from(g('_tokensReiterados')(celda)), radicadosReiterados({ 'RADICADOS REITERADOS': celda }));
  for (const r of ['20261060001', '2026-004197', '2026106', 'OFICIO-2026-09-300', '', '202610600012']) {
    assert.equal(g('_formaRadicadoValida')(r), formaRadicadoValida(r), JSON.stringify(r));
  }
});

test('solo el admin: el router lo comprueba antes de gestionarReiterado', opts, () => {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const ini = src.indexOf("case 'agregarReiterado':");
  const bloque = src.slice(ini, src.indexOf("case 'linksPdfReiterados':", ini));
  assert.ok(bloque.indexOf("rol === 'ADMIN'") > 0);
  assert.ok(bloque.indexOf("rol === 'ADMIN'") < bloque.indexOf('gestionarReiterado('));
});

test('cliente: la fila REITERADO tampoco se lista si la hoja llega entera', () => {
  const api = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
  const fn = /function _procesarVisitas\([^)]*\) \{[\s\S]*?\n\}/.exec(api)[0];
  assert.ok(fn.includes("'REITERADO'"));
});
