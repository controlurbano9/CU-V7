// ═══════════════════════════════════════════════════════════════
// tests/reabrir-visita.test.js — el admin reabre una visita completada
// (2026-11-12, decisión del usuario) para corregir datos y volver a generar el
// acta o el informe. Backend: reabrirVisita (apps_script_unificado.js);
// cliente: «Reabrir» en la gestión (gestion-visita.jsx).
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BACKEND = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const hay = fs.existsSync(BACKEND);
const opts = { skip: hay ? false : 'apps_script_unificado.js no está en esta copia' };

// Hoja falsa: fila 1 = encabezados, el resto = datos. getRange(fila, col) de
// una sola celda; getRange(1, 1, 1, n) para los encabezados.
function hojaFalsa(filas) {
  return {
    getLastColumn: () => filas[0].length,
    getLastRow: () => filas.length,
    getRange(r, c, nr, nc) {
      if (nr) return { getValues: () => [filas[r - 1].slice(c - 1, c - 1 + nc)] };
      return {
        getValue: () => filas[r - 1][c - 1],
        setValue: (v) => { filas[r - 1][c - 1] = v; },
      };
    },
  };
}

function cargar(filas) {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const fn = /function reabrirVisita\([^)]*\) \{[\s\S]*?\n\}/.exec(src);
  assert.ok(fn, 'no se encontró reabrirVisita');
  const ws = hojaFalsa(filas);
  const estampadas = [];
  const ctx = vm.createContext({
    SHEETS_ID: 'x', HOJA_BD: 'BD VISITAS',
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => ws }) },
    crearColLookup: (h) => (n) => h.indexOf(n) + 1,
    _estamparModificacion: (w, h, fila) => { estampadas.push(fila); },
    invalidarCacheAgenda: () => {},
    Logger: { log: () => {} },
  });
  vm.runInContext(fn[0], ctx);
  return { reabrir: vm.runInContext('reabrirVisita', ctx), estampadas };
}

const ENC = ['RADICADO', 'ESTADO VISITA', 'FECHA DEVOLUCION', 'LINK_PDF_ACTA', 'LINK_XLSX_ACTA'];

test('backend: una COMPLETADO vuelve a INICIADO, sin PDF del acta y con la fecha de devolución intacta', opts, () => {
  const filas = [ENC, ['20261079955', 'COMPLETADO', '05/11/2026', 'https://pdf', 'https://acta']];
  const { reabrir, estampadas } = cargar(filas);
  const r = reabrir(2, {});
  assert.equal(r.ok, true);
  assert.equal(r.estadoAnterior, 'COMPLETADO');
  assert.equal(filas[1][1], 'INICIADO');
  assert.equal(filas[1][3], '');               // el PDF viejo deja de ser el del acta
  assert.equal(filas[1][2], '05/11/2026');     // completar la reescribe
  assert.equal(filas[1][4], 'https://acta');   // el acta sigue: se regenera con ↻
  assert.deepEqual(estampadas, [2]);
});

test('backend: las COMPLETADA de V2 también se reabren', opts, () => {
  const filas = [ENC, ['2024-001234', 'COMPLETADA', '', '', '']];
  const { reabrir } = cargar(filas);
  assert.equal(reabrir(2, {}).ok, true);
  assert.equal(filas[1][1], 'INICIADO');
});

test('backend: ya iniciada → ok sin escribir (segundo toque o reintento)', opts, () => {
  const filas = [ENC, ['20261079955', 'INICIADO', '', 'https://pdf', '']];
  const { reabrir, estampadas } = cargar(filas);
  const r = reabrir(2, {});
  assert.equal(r.ok, true);
  assert.equal(r.yaAbierta, true);
  assert.equal(filas[1][3], 'https://pdf');
  assert.deepEqual(estampadas, []);
});

test('backend: una asignada o pendiente no se toca', opts, () => {
  for (const est of ['ASIGNADO', 'PENDIENTE', '']) {
    const filas = [ENC, ['20261079955', est, '', '', '']];
    const { reabrir } = cargar(filas);
    assert.equal(reabrir(2, {}).ok, false, est);
    assert.equal(filas[1][1], est);
  }
});

test('backend: reabrirVisita es solo ADMIN, con lock y con control de fila movida', opts, () => {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const lista = /var _ACCIONES_FILA_BD = \{[\s\S]*?\};/.exec(src)[0];
  assert.match(lista, /reabrirVisita: 1/);
  const caso = /case 'reabrirVisita':[\s\S]*?break;\n\n/.exec(src);
  assert.ok(caso, 'no se encontró el case');
  assert.match(caso[0], /_soloAdmin\(auth\)/);
  assert.match(caso[0], /LockService\.getScriptLock\(\)/);
  assert.match(caso[0], /registrarLog\(/);
});

test('cliente: «Reabrir» manda la fila con su radicado y su ID_VISITA', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'gestion-visita.jsx'), 'utf8');
  const fn = /async function reabrir\(fila\) \{[\s\S]*?\n  \}/.exec(src);
  assert.ok(fn, 'no se encontró reabrir');
  assert.match(fn[0], /accion: 'reabrirVisita'/);
  assert.match(fn[0], /radicadoConocido: rad/);
  assert.match(fn[0], /idVisita:/);
  assert.match(fn[0], /appConfirm\(/);
  // Solo una completada y sin otra visita del caso en curso.
  assert.match(src, /const puedeReabrir = est === 'COMPLETADO' && !abierta;/);
});
