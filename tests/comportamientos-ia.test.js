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

test('comportamientosParaIA: «No se pudo determinar» → un renglón que se explica solo', () => {
  const r = comportamientosParaIA('No se pudo determinar');
  assert.equal(r.length, 1);
  assert.match(r[0], /^Ninguno: el inspector marcó «No se pudo determinar»/);
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

// 2026-11-11: la calificación del art. 135 sale de la propuesta de la
// situación encontrada (va en las conclusiones, párrafo armado).
const { quitarCalificacionArt135, resumenCambios } = require('../utils.js');

test('quitarCalificacionArt135: quita el párrafo final que califica', () => {
  const t = 'Se observa una ampliación de 12 m2 en proceso. No se aportó licencia.\n\n' +
    'Se impuso sello de suspensión de obra.\n\n' +
    'Las modificaciones constatadas corresponden al comportamiento contrario a la integridad urbanística del literal A, numeral 4, del artículo 135 de la Ley 1801 de 2016: parcelar, urbanizar, demoler, intervenir o construir en terrenos aptos para estas actuaciones, sin licencia o cuando esta hubiere caducado.';
  assert.equal(quitarCalificacionArt135(t),
    'Se observa una ampliación de 12 m2 en proceso. No se aportó licencia.\n\nSe impuso sello de suspensión de obra.');
});

test('quitarCalificacionArt135: en un párrafo mixto quita solo la oración', () => {
  const t = 'La obra está terminada. Esto constituye un comportamiento del art. 135 de la ley. Se recomendó tramitar el reconocimiento.';
  assert.equal(quitarCalificacionArt135(t), 'La obra está terminada. Se recomendó tramitar el reconocimiento.');
});

test('quitarCalificacionArt135: sin calificación no toca nada (saltos incluidos)', () => {
  const t = 'Primer párrafo.\nSegundo párrafo, con 3,5 m.\n\nTercero.';
  assert.equal(quitarCalificacionArt135(t), t);
  assert.equal(quitarCalificacionArt135(''), '');
  assert.equal(quitarCalificacionArt135(null), '');
});

test('resumenCambios: quitar la calificación no se avisa como cifras perdidas', () => {
  const orig = 'Se observa un segundo piso de 40 m2. Constituye comportamiento contrario a la integridad urbanística del artículo 135 de la Ley 1801 de 2016.';
  const prop = 'Se observa un segundo piso de 40 m2.';
  const r = resumenCambios(orig, prop);
  assert.ok(!r.some(x => x.tipo === 'pierde'), JSON.stringify(r));
  assert.ok(r.some(x => /artículo 135/.test(x.texto)));
});
