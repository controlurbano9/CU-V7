// ═══════════════════════════════════════════════════════════════
// tests/pdf-pqr.test.js — el PDF de la PQR sin acceso público (2026-11-05)
//
// Decisión del usuario: la PQR trae los datos del denunciante y no se abre
// más con el enlace de Drive. El backend (obtenerPdfPqr) la entrega solo por
// radicado y solo de las carpetas del descargador, y la app la muestra en su
// visor (visor-pqr.jsx).
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const BACKEND = path.join(RAIZ, '..', 'apps_script_unificado.js');
const hay = fs.existsSync(BACKEND);
const opts = { skip: hay ? false : 'apps_script_unificado.js no está en esta copia' };

function cargar(archivos) {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const piezas = [
    /var PQR_PDF_MAX_BYTES\s*=[^\n]*/.exec(src),
    /function _normRadicadoFila\([^)]*\) \{[\s\S]*?\n\}/.exec(src),
    /function _formaRadicadoValida\([^)]*\) \{[\s\S]*?\n\}/.exec(src),
    /function obtenerPdfPqr\([^)]*\) \{[\s\S]*?\n\}/.exec(src),
  ];
  piezas.forEach((p, i) => assert.ok(p, 'falta la pieza ' + i + ' del backend'));
  const log = [];
  const pedidos = [];
  const ctx = {
    log, pedidos,
    Logger: { log() {} },
    Utilities: { base64Encode: b => Buffer.from(b).toString('base64') },
    registrarLog: (ss, quien, accion) => log.push(quien + ': ' + accion),
    _carpetasPdfsRadicados: () => ['carpeta'],
    _buscarPdf: (carpetas, r) => {
      pedidos.push(r);
      const a = archivos[r];
      return a ? { getSize: () => a.tam, getBlob: () => ({ getBytes: () => a.bytes }) } : null;
    },
  };
  vm.createContext(ctx);
  vm.runInContext(piezas.map(p => p[0]).join('\n'), ctx);
  return ctx;
}

const AUTH = { usuario: { nombre: 'MAURICIO HERRERA' } };

test('obtenerPdfPqr entrega el PDF por radicado y deja rastro de quién lo abrió', opts, () => {
  const c = cargar({ '20221071356': { tam: 3, bytes: [1, 2, 3] } });
  const r = c.obtenerPdfPqr({}, ' 20221071356 ', AUTH);
  assert.equal(r.ok, true);
  assert.equal(r.base64, Buffer.from([1, 2, 3]).toString('base64'));
  assert.deepEqual(c.log, ['MAURICIO HERRERA: Abrió el PDF de la PQR 20221071356']);
});

test('obtenerPdfPqr no acepta un id de archivo ni otra cosa que un radicado', opts, () => {
  const c = cargar({});
  for (const malo of ['1Gz7fi5NayAK3VjUgMFnFoOCV-mBqMdArDox90-Wjupo', '../x', '', 'OFICIO-2026-09-239']) {
    const r = c.obtenerPdfPqr({}, malo, AUTH);
    assert.equal(r.ok, false, malo);
  }
  assert.deepEqual(c.pedidos, [], 'no debe buscar en Drive');
  assert.deepEqual(c.log, []);
});

test('obtenerPdfPqr: sin PDF descargado lo dice; demasiado grande, no lo manda', opts, () => {
  const c = cargar({ '2023-004197': { tam: 20 * 1024 * 1024, bytes: [] } });
  const sin = c.obtenerPdfPqr({}, '20251143210', AUTH);
  assert.equal(sin.ok, false);
  assert.equal(sin.sinPdf, true);
  const grande = c.obtenerPdfPqr({}, '2023-004197', AUTH);
  assert.equal(grande.ok, false);
  assert.match(grande.error, /20 MB/);
  assert.deepEqual(c.log, [], 'solo se registra lo que se entregó');
});

test('el router atiende obtenerPdfPqr con la sesión', opts, () => {
  const src = fs.readFileSync(BACKEND, 'utf8');
  assert.match(src, /case 'obtenerPdfPqr':\s*\n\s*resultado = obtenerPdfPqr\(ss, datos\.radicado, auth\);/);
});

test('la app ya no abre la PQR con el enlace de Drive', () => {
  const jsx = fs.readdirSync(RAIZ).filter(f => f.endsWith('.jsx'));
  for (const f of jsx) {
    const s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    assert.doesNotMatch(s, /href=\{\s*(linkPqr|links\[r\]|d\.linkPdfRadicado|link)\s*\}[^>]*target="_blank"[^>]*\n?[^>]*PQR/,
      f + ' abre la PQR con el enlace de Drive');
  }
  const ficha = fs.readFileSync(path.join(RAIZ, 'ficha-visita.jsx'), 'utf8');
  assert.match(ficha, /abrirPqr\(f\['RADICADO'\]\)/);
  const api = fs.readFileSync(path.join(RAIZ, 'api.js'), 'utf8');
  assert.match(api, /obtenerPdfPqr: true,/, 'es una lectura: se reintenta');
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  assert.match(html, /worker-src[^;]*blob:/, 'el worker de pdf.js nace como blob:');
  const build = fs.readFileSync(path.join(RAIZ, 'build.js'), 'utf8');
  assert.match(build, /'visor-pqr\.jsx',\s*\n\s*'app\.jsx'/);
});
