// tests/verificacion-aplazada.test.js — informe de 20231121436 (2026-10-29):
// la visita es la verificación (aplazamientosTexto, R20), C12 marcado por las
// unidades de más (R19, nombres nuevos de los chips) y el número de
// destinaciones del texto contra la casilla (R21). Ejecutar: npm test
const test = require('node:test');
const assert = require('node:assert');
const U = require('../utils.js');

const ids = s => s.map(x => x.id).sort();
const frases = t => U.aplazamientosTexto(t).map(x => x.tipo + ':' + x.frase.toLowerCase());

// ── aplazamientosTexto ───────────────────────────────────────
test('detecta lo que deja la verificación para después', () => {
  assert.deepEqual(frases('Esta circunstancia deberá ser objeto de verificación mediante la revisión de la licencia.'),
    ['aplaza:deberá ser objeto de verificación']);
  assert.deepEqual(frases('Las condiciones descritas deberán ser contrastadas con los documentos urbanísticos.'),
    ['aplaza:deberán ser contrastadas']);
  assert.deepEqual(frases('No se aportó licencia, por lo que queda pendiente la verificación de los planos.'),
    ['aplaza:queda pendiente la verificación']);
});

test('detecta la duda sobre lo que se vio', () => {
  assert.deepEqual(frases('Se advierte que, aparentemente, sus dimensiones no corresponden.'), ['duda:aparentemente']);
  assert.deepEqual(frases('Se identifica una posible diferencia entre las unidades.'), ['duda:posible diferencia']);
  assert.deepEqual(frases('Se advierte la existencia de aproximadamente quince (15) destinaciones.'),
    ['duda:aproximadamente quince (15) destinaciones']);
});

test('la duda con su motivo se queda; «presunto» y medidas aproximadas no cuentan', () => {
  assert.deepEqual(frases('El local aparentemente es una unidad, pero no se tuvo acceso a su interior.'), []);
  assert.deepEqual(frases('Se evidenció un presunto incumplimiento de la licencia.'), []);
  assert.deepEqual(frases('La cubierta mide aproximadamente 20 m2.'), []);
});

test('posiciones sobre el texto original, sin solapes', () => {
  const t = 'Aparentemente hay 15. Cuya verificación deberá efectuarse después.';
  U.aplazamientosTexto(t).forEach(x => assert.equal(t.slice(x.inicio, x.fin), x.frase));
});

// ── R20 / aplaza ─────────────────────────────────────────────
const A2 = 'A2: Desconociendo la licencia';
const APLAZA = 'Hay quince (15) destinaciones. Esta circunstancia deberá ser objeto de verificación.';

test('R20: con licencia aportada pide justificación', () => {
  const s = U.revisarTextoLocal({ actuacion: APLAZA, infraccion: A2, licenciaAportada: 'SI' });
  const r20 = s.find(x => x.id === 'R20');
  assert.ok(r20);
  assert.equal(r20.tipo, 'coherencia');
  assert.match(r20.mensaje, /«deberá ser objeto de verificación»/);
});

test('aplaza: sin licencia es solo aviso', () => {
  const s = U.revisarTextoLocal({ actuacion: APLAZA, infraccion: 'A4: Sin licencia o caducada', licenciaAportada: 'NO' });
  assert.deepEqual(s.filter(x => /R20|aplaza/.test(x.id)).map(x => x.id + ':' + x.tipo), ['aplaza:forma']);
});

test('R20 también en las conclusiones', () => {
  const s = U.revisarTextoLocal({ actuacion: 'Hay seis niveles.', conclusion: 'Las unidades aparentemente exceden lo aprobado.',
    infraccion: A2, licenciaAportada: 'SI' });
  assert.deepEqual(s.filter(x => x.id === 'R20').map(x => x.donde), ['conclusion']);
});

// ── R19: literal C con usos solo residenciales ──────────────
test('R19: C12 con usos residenciales', () => {
  const s = U.revisarTextoLocal({ actuacion: 'Seis niveles con quince apartamentos.',
    infraccion: A2 + ' | C12: Facilitar usos del suelo no autorizados', usos: 'Residencial', licenciaAportada: 'SI' });
  assert.ok(ids(s).includes('R19'));
});

test('R19: no con un uso comercial, ni sin chips del literal C, ni sin usos', () => {
  const C12 = 'C12: Facilitar usos del suelo no autorizados';
  assert.ok(!ids(U.revisarTextoLocal({ actuacion: 'Taller.', infraccion: C12, usos: 'Residencial · Comercial' })).includes('R19'));
  assert.ok(!ids(U.revisarTextoLocal({ actuacion: 'Seis niveles.', infraccion: A2, usos: 'Residencial' })).includes('R19'));
  assert.ok(!ids(U.revisarTextoLocal({ actuacion: 'Taller.', infraccion: C12, usos: '' })).includes('R19'));
});

// ── R21: destinaciones del texto contra la casilla ──────────
test('R21: el texto cuenta otras destinaciones que la casilla', () => {
  const s = U.revisarTextoLocal({ infraccion: A2, licenciaAportada: 'SI', destActuales: '13', destinaciones: '11',
    actuacion: 'La licencia autoriza once (11) destinaciones y se contaron quince (15) destinaciones.' });
  const r21 = s.find(x => x.id === 'R21');
  assert.ok(r21);
  assert.match(r21.mensaje, /dice 15 destinaciones.*= 13/);
});

test('R21: no cuenta la cifra de la licencia, la diferencia ni las adicionales', () => {
  const base = { infraccion: A2, licenciaAportada: 'SI', destActuales: '13', destinaciones: '11' };
  const sin = t => !ids(U.revisarTextoLocal(Object.assign({ actuacion: t }, base))).includes('R21');
  assert.ok(sin('La licencia autoriza 11 destinaciones y hay 13 destinaciones.'));
  assert.ok(sin('Hay 2 destinaciones de más.'));
  assert.ok(sin('Se construyeron 4 destinaciones adicionales.'));
  assert.ok(!ids(U.revisarTextoLocal({ actuacion: 'Hay 15 destinaciones.', destActuales: 'Se desconocen' })).includes('R21'));
});

// ── Chips renombrados ────────────────────────────────────────
test('lo guardado con el nombre viejo se lee con el nuevo', () => {
  assert.equal(U._infraccionSoloCatalogo('A2: Diferente a lo aprobado | C12: Destinación no autorizada'),
    A2 + ' | C12: Facilitar usos del suelo no autorizados');
  assert.equal(U._infraccionSoloCatalogo('C9: Uso distinto licencia | C10: Ubicación incorrecta | C11: Usos suelo prohibidos'),
    'C9: Uso diferente al de la licencia | C10: Ubicación diferente a la de la licencia | C11: Contravenir usos del suelo');
  assert.equal(U.nombreChipVigente('A1: Áreas protegidas'), 'A1: Área protegida o afectada');
  // Nombre intermedio (2026-10-29) y nombre vigente llegan al mismo chip.
  assert.equal(U.nombreChipVigente('A2: Distinto a la licencia (pisos, unidades, áreas)'), A2);
  assert.equal(U.nombreChipVigente('A4: Sin licencia o caducada'), 'A4: Sin licencia o caducada');
});

test('renombrar no vence la revisión sellada con el nombre viejo', () => {
  const viejo = 'A2: Diferente a lo aprobado | C12: Destinación no autorizada';
  const nuevo = U._infraccionSoloCatalogo(viejo);
  assert.notEqual(nuevo, viejo);
  assert.equal(U.huellaRevision('texto', '', nuevo, ''), U.huellaRevision('texto', '', viejo, ''));
  assert.equal(U.chipsConNombreSellado(nuevo), viejo);
});

test('renombrar el 2026-10-30 tampoco vence revisiones: A1, D13 y los nombres intermedios', () => {
  const viejo = 'A1: Áreas protegidas | D13: Materiales en vía';
  const nuevo = U._infraccionSoloCatalogo(viejo);
  assert.equal(nuevo, 'A1: Área protegida o afectada | D13: Materiales o escombros en espacio público');
  assert.equal(U.huellaRevision('t', '', nuevo, ''), U.huellaRevision('t', '', viejo, ''));
  assert.equal(U.chipsConNombreSellado('A2: Distinto a la licencia (pisos, unidades, áreas)'), 'A2: Diferente a lo aprobado');
  assert.equal(U.chipsConNombreSellado(A2), 'A2: Diferente a lo aprobado');
  assert.equal(U.chipsConNombreSellado('A1: Área protegida o afectada'), 'A1: Áreas protegidas');
});

test('Buscar: A2 entero aunque lleve comas, y el texto libre de V2 se parte', () => {
  const c = U.prepararCasoBuscar({ _idx: 1, RADICADO: '20231121436', 'ESTADO VISITA': 'INICIADO',
    'TIPO DE INFRACCION': 'A2: Diferente a lo aprobado | C12: Destinación no autorizada' }, null, new Date(2026, 9, 29));
  assert.deepEqual(c.infr, [A2, 'C12: Facilitar usos del suelo no autorizados']);
  const v2 = U.prepararCasoBuscar({ _idx: 2, RADICADO: '20201', 'ESTADO VISITA': 'COMPLETADO',
    'TIPO DE INFRACCION': '#9,11 Y 12' }, null, new Date(2026, 9, 29));
  assert.deepEqual(v2.infr, ['#9', '11 Y 12']);
});

test('textoLeyChip: encabezado del literal + numeral, como se lee en la ley', () => {
  assert.match(U.textoLeyChip('C12: Facilitar usos del suelo no autorizados'),
    /^Usar o destinar un inmueble a facilitar, en cualquier clase de inmueble, el desarrollo de usos o destinaciones del suelo/);
  assert.equal(U.textoLeyChip(A2), 'Parcelar, urbanizar, demoler, intervenir o construir con desconocimiento a lo preceptuado en la licencia');
  assert.match(U.textoLeyChip('D13: Materiales en vía'), /^Incumplir cualquiera de las siguientes obligaciones: destinar/);
  assert.equal(U.textoLeyChip('No se evidencia infracción'), '');
});
