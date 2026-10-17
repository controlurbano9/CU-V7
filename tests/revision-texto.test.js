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
  // R06 (cubierta en el antejardín sin A3) y R06b (material acopiado en el
  // antejardín sin D13): las reglas de la fase 1 que preguntan por el texto.
  assert.deepEqual(ids(s), ['R06', 'R06b', 'alcance', 'area', 'categoria', 'traslado']);
});

test('huellaRevision: las casillas que revisan también vencen la revisión', () => {
  const { camposRevision } = require('../utils.js');
  const d = { repLocativa: 'NO', area: '16', licenciaAportada: 'NO', usos: 'Residencial' };
  const h = huellaRevision('a', 'b', '', camposRevision(d));
  assert.equal(h, huellaRevision('a', 'b', '', camposRevision(Object.assign({}, d))));
  assert.notEqual(h, huellaRevision('a', 'b', '', camposRevision(Object.assign({}, d, { area: '20' }))));
  assert.notEqual(h, huellaRevision('a', 'b', '', camposRevision(Object.assign({}, d, { repLocativa: 'SI' }))));
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

// ── 2026-10-15: justificación solo por coherencia y capacidad del acta ──

test('chequeo local: cada señal dice si es de coherencia o de forma', () => {
  const s = revisarTextoLocal({
    actuacion: DESC_ACTA, conclusion: CONC_ACTA,
    infraccion: 'No se evidencia infracción', area: '', areaNoAplica: true,
  });
  const tipo = id => s.find(x => x.id === id).tipo;
  assert.equal(tipo('R06'), 'forma');
  assert.equal(tipo('R06b'), 'forma');
  assert.equal(tipo('area'), 'coherencia');
  assert.equal(tipo('alcance'), 'forma');
  assert.equal(tipo('traslado'), 'forma');
  assert.equal(tipo('categoria'), 'forma');
});

test('chequeo local: el largo ya no marca «otra herramienta» (caso 20251084835)', () => {
  // La propuesta de la IA para la visita de Alejandro: 2.273 caracteres, sin
  // muletillas ni oraciones largas. Antes pedía justificación por el largo.
  const parrafo = 'En el primer nivel se encontró el retiro de un ventanal, la instalación de enchape en algunos muros ' +
    'y trabajos de cambio de la red de alcantarillado. ';
  const s = revisarTextoLocal({ actuacion: parrafo.repeat(16), conclusion: '', infraccion: 'No se evidencia infracción' });
  assert.equal(parrafo.repeat(16).length > 2000, true);
  assert.deepEqual(ids(s), []);
});

test('capacidadActa: renglones por párrafo y líneas vacías', () => {
  const { capacidadActa, renglonesActa, ACTA_CAPACIDAD } = require('../utils.js');
  const pr = ACTA_CAPACIDAD.situacion.porRenglon;
  assert.equal(renglonesActa('', pr), 0);
  assert.equal(renglonesActa('Corto.', pr), 1);
  assert.equal(renglonesActa('a'.repeat(pr + 1), pr), 2);
  assert.equal(renglonesActa('Uno.\n\nDos.', pr), 3);           // la línea vacía ocupa renglón
  // Fila 1552 (2025-020054): párrafos de 1501, 1310 y 1318 caracteres; el
  // PDF cortó el tercero en su cuarto renglón (22 renglones en total).
  const texto = ['x'.repeat(1501), 'x'.repeat(1310), 'x'.repeat(1318)].join('\n');
  const c = capacidadActa(texto, 'situacion');
  assert.equal(c.renglones, 28);
  assert.equal(c.cabe, false);
  assert.equal(c.caracteres < 0, true);
  assert.equal(capacidadActa('x'.repeat(1501), 'situacion').cabe, true);
});

test('capacidadActa: las conclusiones cuentan la frase del art. 135', () => {
  const { capacidadActa, conclusionJuridicaActa } = require('../utils.js');
  const jur = conclusionJuridicaActa('A4: Sin licencia o caducada', { valor: '', noMedible: true });
  // Fila 1698 (20191038116): frase + área ocupan 3 renglones, la línea vacía
  // uno, y la conclusión del inspector (296 caracteres) ya no cabe entera.
  const conc = 'x'.repeat(296);
  assert.equal(capacidadActa([jur, conc].join('\n\n'), 'conclusiones').cabe, false);
  assert.equal(capacidadActa([jur, 'x'.repeat(140)].join('\n\n'), 'conclusiones').cabe, true);
});

test('caracteresParaActa: lo que cabe según párrafos y lo ya ocupado', () => {
  const { caracteresParaActa } = require('../utils.js');
  assert.equal(caracteresParaActa('situacion', 0, 1), Math.floor(22 * 152 * 0.9));
  assert.equal(caracteresParaActa('situacion', 0, 3), Math.floor(18 * 152 * 0.9));
  // Conclusiones con A4: la frase y el área ocupan 3, la línea vacía 1.
  assert.equal(caracteresParaActa('conclusiones', 4, 1), Math.floor(1 * 152 * 0.9));
  assert.equal(caracteresParaActa('conclusiones', 5, 1), 0);
});

test('resumenCambios: el caso de Alejandro avisa la salvedad perdida', () => {
  const { resumenCambios } = require('../utils.js');
  const orig = 'Durante la inspección del primer nivel de la edificación de cinco (5) niveles, no se evidenciaron ' +
    'retiros de muros. No obstante, estas actividades no evidencian, por sí mismas, una intervención que requiera ' +
    'licencia urbanística, toda vez que el retiro del ventanal no compromete elementos portantes. Asimismo, se ' +
    'deja constancia de que la apreciación se limita a las áreas inspeccionadas.';
  const prop = 'En el primer nivel de la edificación de cinco niveles no se vieron retiros de muros. Estas actividades ' +
    'no requieren licencia urbanística. El retiro del ventanal no compromete elementos portantes.';
  const r = resumenCambios(orig, prop);
  const tipos = r.map(x => x.tipo);
  assert.deepEqual(tipos.slice(0, 2), ['pierde', 'pierde']);           // lo perdido va primero
  assert.match(r[0].texto, /\b5\b/);                                     // la cifra (5)
  assert.match(r[1].texto, /«por sí mismas»/);                          // con sus tildes
  const m = r.find(x => x.tipo === 'motivo');
  assert.ok(m);
  assert.match(m.texto, /«asimismo»/);                                   // la expresión de IA citada
});

test('resumenCambios: el separador de miles o decimales no cuenta como cifra perdida', () => {
  const { resumenCambios } = require('../utils.js');
  const pierde = (a, b) => resumenCambios(a, b).some(x => /cifras/.test(x.texto));
  assert.equal(pierde('El área es de 1.500 m².', 'El área es de 1500 m².'), false);
  assert.equal(pierde('Muro de 2,5 m de alto.', 'Muro de 2.5 m de alto.'), false);
  assert.equal(pierde('Muro de 2,5 m de alto.', 'Muro de alto.'), true);
});

test('resumenCambios: «segundo piso» no cuenta como atribución («según»)', () => {
  const { resumenCambios } = require('../utils.js');
  const r = resumenCambios('Hay una ampliación en el segundo piso.', 'Hay una ampliación en el 2.º piso.');
  assert.equal(r.some(x => /salvedades/.test(x.texto)), false);
  assert.deepEqual(resumenCambios('Igual.', 'Igual.'), []);
});

// ── 2026-10-17: revisión por campo (una coma, tilde o mayúscula no la vencen) ──
const { partesRevision, huellaParaBD, partesCambiadas, _normTextoSuave } = require('../utils.js');

test('_normTextoSuave: coma, tilde, mayúscula y signo no cambian; una palabra sí; la ñ se conserva', () => {
  const n = _normTextoSuave;
  assert.equal(n('Muro de 16 m2, según el acta.'), n('muro de 16 m2 segun el acta'));
  assert.equal(n('La obra —según el inspector— no tiene licencia.'), n('la obra segun el inspector no tiene licencia'));
  assert.notEqual(n('El muro es nuevo.'), n('El muro es viejo.'));
  assert.equal(n('daño'), 'daño');
  assert.notEqual(n('daño'), n('dano'));
  assert.equal(n('  varios    saltos \n de línea '), 'varios saltos de linea');
});

test('partesRevision: cada parte con su huella de 8 hex y por separado', () => {
  const p1 = partesRevision('El muro, de 2 m.', 'Retirar la cubierta.', 'A3: Bienes uso público (Antejardín)', 'NO||16');
  ['desc', 'conc', 'datos'].forEach(k => assert.match(p1[k], /^[0-9a-f]{8}$/));
  // Coma, tilde y mayúscula no mueven la huella de su parte.
  const p2 = partesRevision('el muro de 2 m', 'RETIRAR LA CUBIERTA!', 'A3: Bienes uso público (Antejardín)', 'NO||16');
  assert.equal(p1.desc, p2.desc);
  assert.equal(p1.conc, p2.conc);
  assert.equal(p1.datos, p2.datos);
  // Cada parte cambia sola.
  assert.notEqual(p1.desc, partesRevision('Otro texto', 'Retirar la cubierta.', 'A3: Bienes uso público (Antejardín)', 'NO||16').desc);
  assert.notEqual(p1.datos, partesRevision('El muro, de 2 m.', 'Retirar la cubierta.', 'A3: Bienes uso público (Antejardín)', 'NO||20').datos);
});

test('huellaParaBD ↔ leerSelloRevision: ida y vuelta; el formato viejo se lee sin partes', () => {
  const rev = { modo: 'IA', huella: 'aaaaaaaa', partes: { desc: 'bbbbbbbb', conc: 'cccccccc', datos: 'dddddddd' } };
  const enBD = huellaParaBD(rev);
  assert.equal(enBD, 'aaaaaaaa.bbbbbbbb.cccccccc.dddddddd');
  const sello = leerSelloRevision('IA · ' + enBD + ' · 14/10/2026 · NOMBRE');
  assert.deepEqual(sello,
    { modo: 'IA', huella: 'aaaaaaaa', partes: { desc: 'bbbbbbbb', conc: 'cccccccc', datos: 'dddddddd' },
      fecha: '14/10/2026', nombre: 'NOMBRE' });
  assert.equal(huellaParaBD(leerSelloRevision(sello.modo + ' · ' + enBD + ' ·  · ')), enBD);
  // Formato viejo (solo huella): sin partes y huellaParaBD lo devuelve tal cual.
  const viejo = leerSelloRevision('IA · abcdef01 · 14/10/2026 · NOMBRE');
  assert.deepEqual(viejo, { modo: 'IA', huella: 'abcdef01', fecha: '14/10/2026', nombre: 'NOMBRE' });
  assert.equal(huellaParaBD(viejo), 'abcdef01');
  // Sello mal armado (grupos de más o de menos) no se lee.
  assert.equal(leerSelloRevision('IA · aaaaaaaa.bbbbbbbb · 14/10/2026 · NOMBRE'), null);
  assert.equal(leerSelloRevision('IA · aaaaaaaz.bbbbbbbb.cccccccc.dddddddd · 14/10/2026'), null);
});

test('partesCambiadas: sello nuevo → solo la parte tocada; viejo vigente → []; viejo vencido y sin sello → las tres', () => {
  const infr = 'A3: Bienes uso público (Antejardín)', campos = 'NO||16';
  const rev = { modo: 'IA', huella: 'aaaaaaaa', partes: partesRevision('El muro.', 'Retirar la cubierta.', infr, campos) };
  assert.deepEqual(partesCambiadas(rev, 'El muro.', 'Retirar la cubierta.', infr, campos), []);
  // Coma y mayúscula no cuentan como cambio.
  assert.deepEqual(partesCambiadas(rev, '¡EL MURO!', 'Retirar la cubierta…', infr, campos), []);
  assert.deepEqual(partesCambiadas(rev, 'Otro texto.', 'Retirar la cubierta.', infr, campos), ['desc']);
  assert.deepEqual(partesCambiadas(rev, 'El muro.', 'Otra conclusión.', infr, campos), ['conc']);
  assert.deepEqual(partesCambiadas(rev, 'El muro.', 'Retirar la cubierta.', 'D13: Materiales en vía', campos), ['datos']);
  assert.deepEqual(partesCambiadas(rev, 'Otro texto.', 'Retirar la cubierta.', 'D13: Materiales en vía', campos), ['desc', 'datos']);
  // Sin sello → las tres.
  assert.deepEqual(partesCambiadas(null, 'a', 'b', '', ''), ['desc', 'conc', 'datos']);
  // Sello viejo (sin partes): la comparación de siempre.
  const hviejo = huellaRevision('a', 'b', '', campos);
  assert.deepEqual(partesCambiadas({ modo: 'IA', huella: hviejo }, 'a', 'b', '', campos), []);
  assert.deepEqual(partesCambiadas({ modo: 'IA', huella: hviejo }, 'a', 'otra', '', campos), ['desc', 'conc', 'datos']);
});

test('revisionVigente: datos solos siguen vigentes solo sin señales de coherencia', () => {
  const rev = { modo: 'IA', huella: 'aaaaaaaa', partes: partesRevision('a', 'b', 'A3: Bienes uso público (Antejardín)', 'c') };
  assert.equal(revisionVigente(rev, 'a', 'b', 'A3: Bienes uso público (Antejardín)', 'c'), true);       // nada cambió
  assert.equal(revisionVigente(rev, 'a', 'b', 'D13: Materiales en vía', 'c'), false);                    // datos, sin 6.º argumento
  assert.equal(revisionVigente(rev, 'a', 'b', 'D13: Materiales en vía', 'c', true), true);               // datos, sin señales
  assert.equal(revisionVigente(rev, 'a', 'b', 'D13: Materiales en vía', 'c', false), false);             // datos, con señales
  assert.equal(revisionVigente(rev, 'otra', 'b', 'A3: Bienes uso público (Antejardín)', 'c', true), false); // desc: el 6.º no salva
});

// ── 2026-10-17: expresiones de IA (tachado en «Tu texto») y motivos cortos ──
const { expresionesIA } = require('../utils.js');

test('expresionesIA: conector al empezar la oración sí, en medio de la oración no', () => {
  const a = expresionesIA('Asimismo, se revisó el muro.');
  assert.deepEqual(a, [{ inicio: 0, fin: 8, frase: 'Asimismo' }]);
  assert.deepEqual(expresionesIA('Se revisó el muro, asimismo la cubierta.'), []);
  // Tras punto y tras salto de línea también cuentan.
  assert.deepEqual(expresionesIA('Se revisó el muro.\nEn consecuencia, se retira.').map(x => x.frase), ['En consecuencia']);
  assert.deepEqual(expresionesIA('Se revisó el muro. En síntesis, todo está bien.').map(x => x.frase), ['En síntesis']);
  // Las posiciones caen sobre el texto original aunque lleve tildes.
  const s = expresionesIA('En síntesis, todo está bien.');
  assert.equal(s[0].frase, 'En síntesis');
  assert.equal(s[0].fin, 11);
  assert.equal('En síntesis, todo está bien.'.slice(s[0].inicio, s[0].fin), 'En síntesis');
});

test('expresionesIA: «reparación integral» no; «integral» suelto sí', () => {
  assert.deepEqual(expresionesIA('Se pidió reparación integral del muro.'), []);
  assert.deepEqual(expresionesIA('La solución integral del predio.').map(x => x.frase), ['integral']);
});

test('expresionesIA: «con el fin de» suelto no; «con el fin de garantizar» sí (traga «garantizar»)', () => {
  assert.deepEqual(expresionesIA('Se cerró con el fin de proteger el muro.'), []);
  assert.deepEqual(expresionesIA('Se cerró con el fin de garantizar la seguridad.').map(x => x.frase), ['con el fin de garantizar']);
});

test('resumenCambios: máximo 2 motivos, por prioridad', () => {
  const { resumenCambios } = require('../utils.js');
  const orig = 'Asimismo, el muro es nuevo. El patio tiene enchape.';
  const prop = 'El patio tiene enchape. El muro es nuevo.';
  const r = resumenCambios(orig, prop, { condensa: true });
  const motivos = r.filter(x => x.tipo === 'motivo');
  assert.equal(motivos.length, 2);                                      // IA y reordenó; «condensa» no cabe
  assert.match(motivos[0].texto, /«asimismo»/);
  assert.match(motivos[1].texto, /ordenan los hechos/);
});

test('resumenCambios: detecta el reordenamiento de los hechos', () => {
  const { resumenCambios } = require('../utils.js');
  const orig = 'El muro está agrietado. La cubierta es de zinc. El patio tiene enchape.';
  const prop = 'El patio tiene enchape. El muro está agrietado. La cubierta es de zinc.';
  const r = resumenCambios(orig, prop);
  assert.equal(r.length, 1);
  assert.match(r[0].texto, /ordenan los hechos como ocurrieron en la visita/);
});

test('resumenCambios: oraciones de más de 35 palabras partidas', () => {
  const { resumenCambios } = require('../utils.js');
  const palabras = Array.from({ length: 38 }, (_, i) => 'palabra' + i);
  const larga = 'Se observó ' + palabras.join(' ') + '.';
  const partida = 'Se observó ' + palabras.slice(0, 20).join(' ') + '. ' + palabras.slice(20).join(' ') + '.';
  const r = resumenCambios(larga, partida);
  assert.equal(r.filter(x => x.tipo === 'motivo').length, 1);
  assert.match(r.find(x => x.tipo === 'motivo').texto, /parten las oraciones muy largas/);
});

test('resumenCambios: condensa solo con la opción (tope del acta)', () => {
  const { resumenCambios } = require('../utils.js');
  const orig = 'El muro está agrietado.', prop = 'El muro está agrietado y es viejo.';
  assert.equal(resumenCambios(orig, prop).some(x => /condensa/.test(x.texto)), false);
  assert.match(resumenCambios(orig, prop, { condensa: true })[0].texto, /Se condensa para que quepa en el acta/);
});
