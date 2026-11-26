// ═══════════════════════════════════════════════════════════════
// tests/pin-mensaje.test.js — mensaje del PIN temporal (utils.js:
// mensajePinTemporal, URL_APP_OFICIAL).
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mensajePinTemporal, URL_APP_OFICIAL } = require('../utils.js');

test('mensajePinTemporal — enlace oficial sin nada agregado, y la persona elige su nombre', () => {
  assert.equal(URL_APP_OFICIAL, 'https://controlurbano9.github.io/CU-V7/');
  const t = mensajePinTemporal({ nombre: 'CARLOS ANDRES MEJIA', pin: '7315', vence: '29/11/2026 15:48' });
  assert.match(t, /^Hola, Carlos\./);
  assert.match(t, /\n1\. Entra a https:\/\/controlurbano9\.github\.io\/CU-V7\/\n/, 'el enlace oficial, tal cual');
  assert.doesNotMatch(t, /#|usuario=/, 'sin fragmento ni nombre en el enlace');
  assert.match(t, /\n2\. Elige tu nombre en la lista \(CARLOS ANDRES MEJIA\) y escribe este PIN temporal: 7315\n/);
  assert.match(t, /vence el 29\/11\/2026 a las 15:48\./);
  assert.match(mensajePinTemporal({ nombre: 'X Y', pin: '1', vence: '' }), /vence en 72 horas/);
});
