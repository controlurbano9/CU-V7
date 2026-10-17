// ═══════════════════════════════════════════════════════════════
// tests/id-carpeta-link.test.js — `_idCarpetaDeLink` debe sacar el id de
// carpeta de cualquier forma de URL de Drive que haya en LINK_DRIVE.
//
// Si no lo saca, `idCarpetaVisita` queda vacío con `linkDrive` lleno y la
// visita pierde el control de subida de fotos aunque la carpeta exista.
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'nueva-visita.jsx'), 'utf8');
const fn = /function _idCarpetaDeLink\(url\) \{[\s\S]*?\n\}/.exec(src);
assert.ok(fn, 'no se encontró _idCarpetaDeLink en nueva-visita.jsx');
const ctx = vm.createContext({});
vm.runInContext(fn[0] + '\n', ctx);
const _idCarpetaDeLink = vm.runInContext('_idCarpetaDeLink', ctx);

const ID = '1OyRWvGjhju_cLW8u5PiljXTK888B4ZPv';

test('formato que escribe el backend', () => {
  assert.equal(_idCarpetaDeLink('https://drive.google.com/drive/folders/' + ID), ID);
});

test('con parámetros de compartir', () => {
  assert.equal(_idCarpetaDeLink('https://drive.google.com/drive/folders/' + ID + '?usp=sharing'), ID);
});

test('formas alternas de Drive (carpetas creadas a mano o migradas de V2)', () => {
  assert.equal(_idCarpetaDeLink('https://drive.google.com/open?id=' + ID), ID);
  assert.equal(_idCarpetaDeLink('https://drive.google.com/drive/u/0/folders/' + ID), ID);
  assert.equal(_idCarpetaDeLink('https://drive.google.com/file/d/' + ID + '/view'), ID);
});

test('sin link o sin id no inventa nada', () => {
  assert.equal(_idCarpetaDeLink(''), '');
  assert.equal(_idCarpetaDeLink('https://drive.google.com/'), '');
});
