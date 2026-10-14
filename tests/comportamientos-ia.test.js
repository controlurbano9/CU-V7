// Chips del art. 135 → lista que viaja a «Mejorar con IA» (perfil 'actuacion').
const test = require('node:test');
const assert = require('node:assert');
const { citaArt135, comportamientosParaIA } = require('../utils.js');

test('citaArt135: literal y numeral con su texto literal', () => {
  assert.equal(citaArt135('A', 3),
    'literal A «Parcelar, urbanizar, demoler, intervenir o construir», numeral 3 ' +
    '«En bienes de uso público y terrenos afectados al espacio público»');
  assert.equal(citaArt135('D', '13').indexOf('literal D «Incumplir'), 0);
});

test('citaArt135: literal o numeral inexistente → vacío', () => {
  assert.equal(citaArt135('E', 1), '');
  assert.equal(citaArt135('A', 99), '');
});

test('comportamientosParaIA: nada marcado → []', () => {
  assert.deepEqual(comportamientosParaIA(''), []);
  assert.deepEqual(comportamientosParaIA(null), []);
});

test('comportamientosParaIA: «No se evidencia infracción» → NINGUNO', () => {
  assert.deepEqual(comportamientosParaIA('No se evidencia infracción'), ['NINGUNO']);
});

test('comportamientosParaIA: un renglón con código y cita por chip', () => {
  const r = comportamientosParaIA('A3: Bienes uso público (Antejardín) | D13: Materiales en vía');
  assert.equal(r.length, 2);
  assert.equal(r[0], 'A3 — ' + citaArt135('A', 3));
  assert.equal(r[1], 'D13 — ' + citaArt135('D', 13));
});

test('comportamientosParaIA: textos de V2 sin código se ignoran', () => {
  assert.deepEqual(comportamientosParaIA('CONSTRUCCION SIN LICENCIA'), []);
  assert.deepEqual(comportamientosParaIA('#9,11 Y 12 | A4: Sin licencia o caducada'),
    ['A4 — ' + citaArt135('A', 4)]);
});
