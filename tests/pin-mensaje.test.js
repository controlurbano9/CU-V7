// ═══════════════════════════════════════════════════════════════
// tests/pin-mensaje.test.js — mensaje del PIN temporal y enlace al login
// (utils.js: enlaceLoginUsuario, usuarioDeEnlace, mensajePinTemporal).
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { enlaceLoginUsuario, usuarioDeEnlace, mensajePinTemporal } = require('../utils.js');

test('enlaceLoginUsuario — el nombre va en el fragmento, nunca el PIN', () => {
  const e = enlaceLoginUsuario('https://controlurbano9.github.io/CU-V7/', 'Ana Gómez Muñoz');
  assert.equal(e, 'https://controlurbano9.github.io/CU-V7/#usuario=ANA%20G%C3%93MEZ%20MU%C3%91OZ');
  // Un fragmento previo (Buscar, Tablero) no se arrastra.
  assert.equal(enlaceLoginUsuario('https://x.test/app/#f=abc', 'PEDRO RUIZ'), 'https://x.test/app/#usuario=PEDRO%20RUIZ');
});

test('usuarioDeEnlace — lee lo que escribe enlaceLoginUsuario y nada más', () => {
  const e = enlaceLoginUsuario('https://x.test/', 'ana   gomez muñoz');
  assert.equal(usuarioDeEnlace(e.slice(e.indexOf('#'))), 'ANA GOMEZ MUÑOZ');
  assert.equal(usuarioDeEnlace(''), '');
  assert.equal(usuarioDeEnlace('#f=%7B%7D'), '');
  assert.equal(usuarioDeEnlace('#usuario=%E0%A4%A'), '', 'un fragmento roto no revienta');
});

test('mensajePinTemporal — saludo, enlace, PIN y vencimiento', () => {
  const t = mensajePinTemporal({ nombre: 'ANA GOMEZ MUÑOZ', pin: '7315', vence: '29/11/2026 10:00',
    enlace: 'https://x.test/#usuario=ANA' });
  assert.match(t, /^Hola, Ana\./);
  assert.match(t, /Entra a https:\/\/x\.test\/#usuario=ANA\n/);
  assert.match(t, /PIN temporal: 7315\n/);
  assert.match(t, /vence el 29\/11\/2026 a las 10:00\./);
  assert.doesNotMatch(t.split('\n').find(l => l.includes('https://')), /7315/, 'el PIN no va pegado al enlace');
  assert.match(mensajePinTemporal({ nombre: 'X Y', pin: '1', vence: '', enlace: 'u' }), /vence en 72 horas/);
});
