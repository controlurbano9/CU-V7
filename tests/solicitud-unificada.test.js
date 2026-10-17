// ═══════════════════════════════════════════════════════════════
// tests/solicitud-unificada.test.js — P8: un solo PDF (solicitud + orden).
//
// Lo frágil aquí es el transporte, no la unión (de eso responde pdf-lib):
//   · base64 ↔ bytes tiene que ser EXACTO. Un byte cambiado no da error:
//     da un PDF que Drive acepta y ningún lector abre.
//   · `_bytesAB64` va por trozos porque `String.fromCharCode.apply` revienta
//     la pila con arrays grandes — y un PDF real siempre es grande.
//   · el id de Drive se saca de tres formas de URL distintas.
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function extraer(archivo, nombres, ctx) {
  const src = fs.readFileSync(archivo, 'utf8');
  for (const n of nombres) {
    const re = new RegExp('function ' + n + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}');
    const fn = re.exec(src);
    assert.ok(fn, 'no se encontró ' + n + ' en ' + path.basename(archivo));
    vm.runInContext(fn[0], ctx);
  }
}

const ctx = vm.createContext({ atob, btoa, Uint8Array, String });
extraer(path.join(__dirname, '..', 'api.js'), ['_b64ABytes', '_bytesAB64'], ctx);
const aBytes = vm.runInContext('_b64ABytes', ctx);
const aB64 = vm.runInContext('_bytesAB64', ctx);

// _idDeLinkDrive vive en el backend, que no se puede versionar aquí.
const BACKEND = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const hayBackend = fs.existsSync(BACKEND);
if (hayBackend) extraer(BACKEND, ['_idDeLinkDrive'], ctx);
const idDeLink = hayBackend ? vm.runInContext('_idDeLinkDrive', ctx) : null;
const optsBk = { skip: hayBackend ? false : 'apps_script_unificado.js no está en esta copia' };

test('base64 → bytes → base64 devuelve lo mismo', () => {
  const b64 = Buffer.from('%PDF-1.7\n\x00\x01\x02binario\xff\xfe', 'binary').toString('base64');
  assert.equal(aB64(aBytes(b64)), b64);
});

test('todos los valores de byte sobreviven (0..255)', () => {
  const bytes = new Uint8Array(256);
  for (let i = 0; i < 256; i++) bytes[i] = i;
  const round = aBytes(aB64(bytes));
  assert.deepEqual(Array.from(round), Array.from(bytes));
});

test('un PDF de tamaño real no revienta la pila', () => {
  // 300 KB: por encima del trozo de 8192 y del tamaño donde
  // `fromCharCode.apply` de un solo golpe falla.
  const bytes = new Uint8Array(300 * 1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  const round = aBytes(aB64(bytes));
  assert.equal(round.length, bytes.length);
  assert.deepEqual(Array.from(round.subarray(0, 64)), Array.from(bytes.subarray(0, 64)));
  assert.deepEqual(Array.from(round.subarray(-64)), Array.from(bytes.subarray(-64)));
});

test('id de Drive desde las formas de URL que guarda BD', optsBk, () => {
  const ID = '1zFViqifiCwmDTiFYyWC9jhugN_mk4WQ0';
  assert.equal(idDeLink('https://drive.google.com/file/d/' + ID + '/view'), ID);
  assert.equal(idDeLink('https://docs.google.com/document/d/' + ID + '/edit'), ID);
  assert.equal(idDeLink('https://drive.google.com/open?id=' + ID), ID);
  assert.equal(idDeLink(''), '');
  assert.equal(idDeLink('N/A'), '');
  assert.equal(idDeLink(null), '');
});
