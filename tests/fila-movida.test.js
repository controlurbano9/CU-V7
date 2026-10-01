// ═══════════════════════════════════════════════════════════════
// tests/fila-movida.test.js — el número de fila no identifica una visita.
//
// Caso real (2026-09-25): alguien borró una fila del Sheet, las de abajo
// subieron una posición y el borrador local `cu_draft_v1_fila_1592` (de
// 20261079955) se restauró sobre la visita que ahora ocupaba la 1592
// (20261084284). La carpeta automática guardó sola y esa visita se perdió.
//
// Dos cierres: el cliente descarta el borrador ajeno (utils.js →
// borradorEsDeLaFila) y el backend no escribe si en la fila hay otro radicado
// (apps_script_unificado.js → _normRadicadoFila, usado por 'actualizar').
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { borradorEsDeLaFila } = require('../utils.js');

test('el caso real: borrador de 20261079955 sobre la fila de 20261084284 → se descarta', () => {
  const borrador = { _d: { radicado: '20261079955', direccion: 'CL 62B 49-34' } };
  assert.equal(borradorEsDeLaFila(borrador, '20261084284'), false);
});

test('borrador nuevo con _radicadoFila manda sobre el radicado del formulario', () => {
  // El inspector corrigió el radicado en el formulario sin guardar: el borrador
  // sigue siendo de esta fila porque _radicadoFila es el de BD.
  const borrador = { _radicadoFila: '20261079955', _d: { radicado: '20261079956' } };
  assert.equal(borradorEsDeLaFila(borrador, '20261079955'), true);
  assert.equal(borradorEsDeLaFila(borrador, '20261084284'), false);
});

test('mismo radicado: se restaura (tolera número, espacios y mayúsculas)', () => {
  assert.equal(borradorEsDeLaFila({ _d: { radicado: ' 20261079955 ' } }, 20261079955), true);
  assert.equal(borradorEsDeLaFila({ _d: { radicado: 'oficio-2026-09-015' } }, 'OFICIO-2026-09-015'), true);
});

test('sin con qué comparar: se acepta (no se pierde un borrador por falta de datos)', () => {
  assert.equal(borradorEsDeLaFila({ _d: { radicado: '' } }, '20261079955'), true);
  assert.equal(borradorEsDeLaFila({ _d: { radicado: '20261079955' } }, ''), true);
  assert.equal(borradorEsDeLaFila(null, '20261079955'), true);
});

// ── Backend: la normalización debe coincidir con la del cliente ──
const BACKEND = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const hay = fs.existsSync(BACKEND);
const opts = { skip: hay ? false : 'apps_script_unificado.js no está en esta copia' };

test('backend: la celda numérica y el texto del cliente comparan igual', opts, () => {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const fn = /function _normRadicadoFila\([^)]*\) \{[\s\S]*?\n\}/.exec(src);
  assert.ok(fn, 'no se encontró _normRadicadoFila');
  const ctx = vm.createContext({});
  vm.runInContext(fn[0], ctx);
  const norm = vm.runInContext('_normRadicadoFila', ctx);
  assert.equal(norm(20261079955), norm('20261079955'));
  assert.notEqual(norm(20261084284), norm('20261079955'));
  assert.equal(norm(null), '');
});

test('backend: actualizar compara el radicado ANTES de escribir la fila', opts, () => {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const ini = src.indexOf("case 'actualizar':");
  const fin = src.indexOf("case 'resetPin':", ini);
  const bloque = src.slice(ini, fin);
  const control = bloque.indexOf('radicadoConocido');
  const escritura = bloque.indexOf('.setValues([datos.valores])');
  assert.ok(control > 0, "'actualizar' no lee radicadoConocido");
  assert.ok(escritura > control, 'el control debe ir antes del setValues');
});

// ── AP-FILA-TODO (2026-10-01): el resto de acciones por número de fila ──
function cargarControl(celdaRadicado, ultimaFila) {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const piezas = [
    /function _colIndex\([^)]*\) \{[\s\S]*?\n\}/.exec(src),
    /function _normRadicadoFila\([^)]*\) \{[\s\S]*?\n\}/.exec(src),
    /var _ACCIONES_FILA_BD = \{[\s\S]*?\};/.exec(src),
    /function _controlFilaVisita\([^)]*\) \{[\s\S]*?\n\}/.exec(src),
  ];
  piezas.forEach((p, i) => assert.ok(p, 'falta la pieza ' + i + ' del control de fila'));
  const logs = [];
  const ctx = vm.createContext({
    HOJA_BD: 'BD VISITAS',
    Utilities: { formatDate: () => '01/10/2026 10:00' },
    registrarLog: (ss, quien, texto) => logs.push(texto),
  });
  vm.runInContext(piezas.map(p => p[0]).join('\n'), ctx);
  const ss = { getSheetByName: () => ({
    getLastColumn: () => 2,
    getLastRow: () => ultimaFila,
    getRange: (f) => f === 1
      ? { getValues: () => [['ATENCION PQR', 'RADICADO']] }
      : { getValue: () => celdaRadicado },
  }) };
  return { control: vm.runInContext('_controlFilaVisita', ctx), ss, logs };
}

test('backend: asignar/completar se niegan si la fila tiene otro radicado', opts, () => {
  const { control, ss, logs } = cargarControl(20261084284, 100);
  for (const accion of ['asignarRadicado', 'desasignarRadicado', 'completarRegistro',
                        'crearNuevaVisitaAsignada', 'subirOrdenPolicia', 'generarSolicitudVigilancia']) {
    const r = control(ss, { accion, fila: 50, radicadoConocido: '20261079955' }, {});
    assert.equal(r && r.ok, false, accion);
    assert.equal(r.filaMovida, true, accion);
  }
  assert.equal(logs.length, 6);
});

test('backend: misma visita → pasa (celda numérica contra texto del cliente)', opts, () => {
  const { control, ss } = cargarControl(20261079955, 100);
  assert.equal(control(ss, { accion: 'completarRegistro', fila: 50, radicadoConocido: ' 20261079955 ' }, {}), null);
});

test('backend: fila vacía o fuera de la hoja también bloquea', opts, () => {
  assert.equal(cargarControl('', 100).control(cargarControl('', 100).ss,
    { accion: 'asignarRadicado', fila: 50, radicadoConocido: '20261079955' }, {}).filaMovida, true);
  const fuera = cargarControl(20261079955, 40);
  assert.equal(fuera.control(fuera.ss,
    { accion: 'asignarRadicado', fila: 50, radicadoConocido: '20261079955' }, {}).filaMovida, true);
});

test('backend: cliente viejo (sin radicadoConocido) y acciones ajenas no se tocan', opts, () => {
  const { control, ss } = cargarControl(20261084284, 100);
  assert.equal(control(ss, { accion: 'asignarRadicado', fila: 50 }, {}), null);
  assert.equal(control(ss, { accion: 'toggleActivo', fila: 50, radicadoConocido: 'X' }, {}), null);
});

test('backend: el control corre antes del dedup y del switch', opts, () => {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const ini = src.indexOf('function doPost(e)');
  const control = src.indexOf('_controlFilaVisita(ss, datos, auth)', ini);
  assert.ok(control > ini);
  assert.ok(control < src.indexOf('_dedupRequestInicio(datos)', ini));
  assert.ok(control < src.indexOf('switch (datos.accion)', ini));
});

test('cliente: asignar, desasignar y completar mandan radicadoConocido', () => {
  const buscar = fs.readFileSync(path.join(__dirname, '..', 'buscar.jsx'), 'utf8');
  for (const accion of ['asignarRadicado', 'crearNuevaVisitaAsignada', 'desasignarRadicado', 'completarRegistro']) {
    const i = buscar.indexOf("accion: '" + accion + "'");
    assert.ok(i > 0, accion);
    assert.ok(buscar.slice(i, i + 160).includes('radicadoConocido'), accion + ' sin radicadoConocido');
  }
  const agenda = fs.readFileSync(path.join(__dirname, '..', 'agenda.jsx'), 'utf8');
  const j = agenda.indexOf("accion: 'asignarRadicado'");
  assert.ok(agenda.slice(j, j + 160).includes('radicadoConocido'));
});
