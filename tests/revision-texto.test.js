// Revisión obligatoria del texto del acta (utils.js): huella, sello y
// chequeo local. Caso real: acta 20261083449 (cubierta de 16 m² en el
// antejardín con «No se evidencia infracción»).
const test = require('node:test');
const assert = require('node:assert');
const { huellaRevision, leerSelloRevision, revisionVigente, revisarTextoLocal } = require('../utils.js');

const DESC_ACTA = 'Durante la visita de inspección técnica, en el recorrido exhaustivo por las dependencias ' +
  'internas no se evidenció ninguna infracción urbanística, determinando la total ausencia de construcciones ' +
  'recientes. No obstante, se observó material acopiado en el antejardín. Asimismo, en la parte externa se ' +
  'instaló una cubierta de 16 metros cuadrados sobre el antejardín, que califica como una intervención en el ' +
  'espacio privado de afectación pública.';
const CONC_ACTA = 'En conclusión, el caso debe ser trasladado para verificar la legalidad del techo exterior.';

const ids = s => s.map(x => x.id).sort();

test('huellaRevision: espacios no cuentan, el contenido sí', () => {
  const h = huellaRevision('Se midió el muro.', 'Retirar la cubierta.', 'A3: Bienes uso público (Antejardín)');
  assert.equal(h, huellaRevision('  Se midió   el muro.\n', 'Retirar la cubierta.', 'A3: Bienes uso público (Antejardín)'));
  assert.notEqual(h, huellaRevision('Se midió el muro', 'Retirar la cubierta.', 'A3: Bienes uso público (Antejardín)'));
  assert.notEqual(h, huellaRevision('Se midió el muro.', 'Retirar la cubierta.', 'A4: Sin licencia o caducada'));
  assert.match(h, /^[0-9a-f]{8}$/);
});

test('huellaRevision: el orden de los chips no importa', () => {
  assert.equal(huellaRevision('x', 'y', 'A3: Bienes uso público (Antejardín) | D13: Materiales en vía'),
               huellaRevision('x', 'y', 'D13: Materiales en vía | A3: Bienes uso público (Antejardín)'));
});

test('leerSelloRevision y revisionVigente', () => {
  const h = huellaRevision('a', 'b', '');
  const s = leerSelloRevision('IA · ' + h + ' · 14/10/2026 · MAURICIO HERRERA LOPERA');
  assert.deepEqual(s, { modo: 'IA', huella: h, fecha: '14/10/2026', nombre: 'MAURICIO HERRERA LOPERA' });
  assert.equal(revisionVigente(s, 'a', 'b', ''), true);
  assert.equal(revisionVigente(s, 'a cambiado', 'b', ''), false);
  assert.equal(revisionVigente(null, 'a', 'b', ''), false);
  assert.equal(leerSelloRevision(''), null);
  assert.equal(leerSelloRevision('OTRO · ' + h), null);
});

test('chequeo local: el acta 20261083449 tal como salió', () => {
  const s = revisarTextoLocal({
    actuacion: DESC_ACTA, conclusion: CONC_ACTA,
    infraccion: 'No se evidencia infracción', area: '', areaNoAplica: true,
  });
  assert.deepEqual(ids(s), ['alcance', 'area', 'categoria', 'traslado']);
});

test('chequeo local: prosa de otra herramienta', () => {
  const s = revisarTextoLocal({
    actuacion: 'Cabe destacar que, en el marco de la diligencia, se procede a verificar el inmueble. ' +
      'No obstante, la edificación tiene dos pisos en el patio.',
    conclusion: '', infraccion: '', area: '',
  });
  assert.deepEqual(ids(s), ['externo']);
});

test('chequeo local: texto limpio y coherente con A3 → sin señales', () => {
  const s = revisarTextoLocal({
    actuacion: 'Se recorrió el primer piso. Sobre el antejardín hay una cubierta de 16 m² en teja termoacústica.',
    conclusion: 'Los hechos constituyen un comportamiento contrario a la integridad urbanística según el artículo 135, ' +
      'literal A «Parcelar, urbanizar, demoler, intervenir o construir», numeral 3 «En bienes de uso público», de la Ley 1801 de 2016.',
    infraccion: 'A3: Bienes uso público (Antejardín)', area: '16',
  });
  assert.deepEqual(s, []);
});

test('chequeo local: cita un comportamiento no marcado', () => {
  const s = revisarTextoLocal({
    actuacion: 'Hay una cubierta en el antejardín.',
    conclusion: 'Se configura el comportamiento A4.',
    infraccion: 'A3: Bienes uso público (Antejardín)', area: '16',
  });
  assert.deepEqual(ids(s), ['cita-no-marcada']);
});

test('chequeo local: el polígono POT no cuenta como cita', () => {
  const s = revisarTextoLocal({
    actuacion: 'El predio está en el polígono ZDI-1-C5. Hay una cubierta en el antejardín.',
    conclusion: '', infraccion: 'A3: Bienes uso público (Antejardín)', area: '16', poligono: 'ZDI-1-C5',
  });
  assert.deepEqual(s, []);
});

test('chequeo local: niega la infracción con chips marcados', () => {
  const s = revisarTextoLocal({
    actuacion: 'En el primer piso no se evidencia infracción.', conclusion: '',
    infraccion: 'A4: Sin licencia o caducada', area: '', areaNoMedible: true,
  });
  assert.deepEqual(ids(s), ['niega-con-chips']);
});

test('chequeo local: construcción marcada sin decir dónde', () => {
  const s = revisarTextoLocal({
    actuacion: 'Se observó una obra en ejecución sin licencia.', conclusion: '',
    infraccion: 'A4: Sin licencia o caducada', area: '', areaNoMedible: true,
  });
  assert.deepEqual(ids(s), ['falta-donde']);
});

test('chequeo local: «infractor» y área con «No se pudo medir» no pide área', () => {
  const s = revisarTextoLocal({
    actuacion: 'El infractor construyó 40 m2 en el segundo piso.', conclusion: '',
    infraccion: 'A4: Sin licencia o caducada', area: '', areaNoMedible: true,
  });
  assert.deepEqual(ids(s), ['infractor']);
});
