// ═══════════════════════════════════════════════════════════════
// tests/pot-leyenda.test.js — leyenda POT del mapa (utils.js)
// Un renglón por capa (cada capa se pinta con un solo color) y, por capa,
// solo las categorías que caen en el pin, con nombres limpios.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { nombrePOTLimpio, leyendaPOTPorCapa } = require('../utils.js');

test('nombrePOTLimpio quita el código, pone tildes y minúsculas', () => {
  assert.equal(nombrePOTLimpio('ZRCA-7: Zona de Recuperacion para la Conservacion Ambiental'),
    'Zona de recuperación para la conservación ambiental');
  assert.equal(nombrePOTLimpio('ZSP-4: Zona de Servicios Publicos'), 'Zona de servicios públicos');
  assert.equal(nombrePOTLimpio('ZRNPA: zonas de Retiros a corrientes Naturales'),
    'Zonas de retiros a corrientes naturales');
  assert.equal(nombrePOTLimpio('Amenaza Hidrológica Alta por eventos torrenciales'),
    'Amenaza hidrológica alta por eventos torrenciales');
  assert.equal(nombrePOTLimpio(''), '');
});

test('leyendaPOTPorCapa agrupa por capa y nombra solo lo que cae en el pin', () => {
  const items = [
    { capa: 'proteccion', color: '#34C759', etiqueta: 'ZRA-8: Zona de Recuperacion Ambiental', contiene: false },
    { capa: 'amenaza', color: '#FF3B30', etiqueta: 'Amenaza Moderada por Deslizamiento', contiene: false },
    { capa: 'amenaza', color: '#FF3B30', etiqueta: 'Amenaza Hidrológica Alta por eventos torrenciales', contiene: true },
    { capa: 'proteccion', color: '#34C759', etiqueta: 'ZSP-4: Zona de Servicios Publicos', contiene: false },
    { capa: 'retiro', color: '#2F80ED', etiqueta: 'Retiro de corriente hídrica', contiene: true },
  ];
  const l = leyendaPOTPorCapa(items);
  assert.deepEqual(l.map(c => c.capa), ['retiro', 'amenaza', 'proteccion']);
  assert.deepEqual(l[0].enPin, []);           // el retiro no repite su nombre
  assert.equal(l[0].contiene, true);
  assert.deepEqual(l[1].enPin, ['Amenaza hidrológica alta por eventos torrenciales']);
  assert.equal(l[2].contiene, false);
  assert.deepEqual(l[2].enPin, []);
});

test('leyendaPOTPorCapa sin capas devuelve vacío', () => {
  assert.deepEqual(leyendaPOTPorCapa([]), []);
  assert.deepEqual(leyendaPOTPorCapa(null), []);
});
