// Editor del informe F-GGO-43 — ronda 1 (informe/editor.js): la lógica
// pura del editor con forma de documento. La frase de antecedentes (PQR /
// oficio / diligencia), las sugerencias deterministas «De la visita» y la
// deduplicación por Jaccard ≥ 0,6. docs/PLAN_2026-10-15_editor-informe.md.
const test = require('node:test');
const assert = require('node:assert');
const ed = require('../informe/editor.js');

// Sustituto de _citaArt135 del generador (inyectada para mantener pureza).
const cita = (l, n) => 'literal ' + l + ' «…», numeral ' + n + ' «…»';

const BASE = {
  fecha_visita: '2026-04-22', direccion: 'CR 54 # 33-32', barrio: 'San José Obrero',
  comuna: '2', catastral: '050880100020700030007901010002', radicado: '20251084835',
  es_diligencia: false, comportamientos: [], sin_infraccion: false,
  sin_licencia: false, estado_licencia: 'SIN_VERIFICAR', areas: ''
};

const textos = s => s.map(x => x.texto);

// ── Frase de antecedentes ─────────────────────────────────────
test('antecedentes PQR: fecha, predio, radicado y objeto fijo', () => {
  const f = ed.fraseAntecedentes(BASE);
  assert.match(f, /El 22 de abril de 2026 se realizó diligencia de inspección ocular/);
  assert.match(f, /CR 54 # 33-32, barrio San José Obrero, comuna 2/);
  assert.match(f, /código catastral 050880100020700030007901010002/);
  assert.match(f, /en atención a la PQR con radicado 20251084835\. El objeto de la diligencia fue verificar las condiciones urbanísticas del inmueble\.$/);
  assert.equal(ed.detectarOrigenAntecedentes(BASE), 'pqr');
});

test('antecedentes oficio: radicado OFICIO-… y origen detectado', () => {
  const d = Object.assign({}, BASE, { radicado: 'OFICIO-2026-09-239' });
  assert.equal(ed.detectarOrigenAntecedentes(d), 'oficio');
  assert.match(ed.fraseAntecedentes(d), /de oficio con radicado OFICIO-2026-09-239/);
});

test('antecedentes diligencia: decretada en audiencia', () => {
  const d = Object.assign({}, BASE, { es_diligencia: true });
  assert.equal(ed.detectarOrigenAntecedentes(d), 'diligencia');
  assert.match(ed.fraseAntecedentes(d), /decretada en audiencia por el inspector de convivencia/);
  // El origen elegido a mano pisa el detectado.
  assert.match(ed.fraseAntecedentes(d, 'pqr'), /en atención a la PQR/);
});

test('antecedentes: rural no se dice «comuna», sin comuna no sobra coma', () => {
  assert.doesNotMatch(ed.fraseAntecedentes(Object.assign({}, BASE, { comuna: 'Rural (sin comuna)', barrio: 'Vda. El Pinar' })), /comuna/);
  const f = ed.fraseAntecedentes(Object.assign({}, BASE, { barrio: '', comuna: '', catastral: '' }));
  assert.match(f, /CR 54 # 33-32, en atención a la PQR/);
});

// ── Sugerencias «De la visita»: conclusiones ──────────────────
test('conclusiones: sin infracción → la frase negativa del art. 135', () => {
  const s = ed.sugerenciasConclusionesDeLaVisita(Object.assign({}, BASE, { sin_infraccion: true }), cita);
  assert.equal(s.length, 1);
  assert.match(s[0].texto, /no constituyen un comportamiento contrario a la integridad urbanística según el artículo 135 de la Ley 1801 de 2016/);
});

test('conclusiones: un punto por comportamiento marcado, con la cita literal', () => {
  const s = ed.sugerenciasConclusionesDeLaVisita(Object.assign({}, BASE, {
    comportamientos: ['A4 - En terrenos aptos…', 'C9 - Uso diferente…']
  }), cita);
  const a4 = s.find(x => /A4/.test(x.motivo));
  assert.match(a4.texto, /constituyen un comportamiento contrario.*artículo 135, literal A «…», numeral 4 «…», de la Ley 1801 de 2016/);
  assert.ok(s.some(x => /C9/.test(x.motivo)));
  assert.equal(s.length, 2);
});

test('conclusiones: sin licencia y vencida, una cada una', () => {
  const sinLic = ed.sugerenciasConclusionesDeLaVisita(Object.assign({}, BASE, { sin_licencia: true, estado_licencia: 'SIN_LICENCIA' }), cita);
  assert.deepEqual(textos(sinLic), ['No fue aportada ni exhibida documentación urbanística que acredite licencia de construcción.']);
  const vencida = ed.sugerenciasConclusionesDeLaVisita(Object.assign({}, BASE, { estado_licencia: 'VENCIDA' }), cita);
  assert.deepEqual(textos(vencida), ['La licencia aportada tenía su término de vigencia vencido a la fecha de la visita.']);
});

test('conclusiones: área cuantificable, no medible y No aplica', () => {
  const conArea = ed.sugerenciasConclusionesDeLaVisita(Object.assign({}, BASE, { areas: '75 m2' }), cita);
  assert.deepEqual(textos(conArea), ['El área en contravención es de 75 m2.']);
  const sinMedir = ed.sugerenciasConclusionesDeLaVisita(Object.assign({}, BASE, { areas: 'No se pudo medir' }), cita);
  assert.deepEqual(textos(sinMedir), ['El área en contravención no pudo determinarse durante la visita.']);
  const noAplica = ed.sugerenciasConclusionesDeLaVisita(Object.assign({}, BASE, { areas: 'No aplica' }), cita);
  assert.deepEqual(noAplica, []);
});

// ── Sugerencias «De la visita»: recomendaciones ───────────────
test('recomendaciones: sin comportamientos → solo la preventiva (con o sin infracción)', () => {
  const s1 = ed.sugerenciasRecomendacionesDeLaVisita(Object.assign({}, BASE, { sin_infraccion: true }));
  assert.deepEqual(textos(s1), ['Abstenerse de ejecutar obras que requieran licencia urbanística sin haberla obtenido.']);
  const s2 = ed.sugerenciasRecomendacionesDeLaVisita(BASE);
  assert.equal(s2.length, 1);
  assert.match(s2[0].texto, /^Abstenerse de ejecutar obras/);
});

test('recomendaciones: sin licencia con comportamiento → reconocimiento + abstenerse', () => {
  const s = ed.sugerenciasRecomendacionesDeLaVisita(Object.assign({}, BASE, {
    comportamientos: ['A4 - En terrenos aptos…'], sin_licencia: true, estado_licencia: 'SIN_LICENCIA'
  }));
  assert.equal(s.length, 2);
  assert.match(s[0].texto, /Tramitar ante una curaduría urbana el reconocimiento/);
  assert.match(s[1].texto, /^Abstenerse de continuar/);
});

test('recomendaciones: vencida → abstenerse hasta vigente; aportada → ajustarse a lo aprobado', () => {
  const vencida = ed.sugerenciasRecomendacionesDeLaVisita(Object.assign({}, BASE, { comportamientos: ['A4 - …'], estado_licencia: 'VENCIDA' }));
  assert.equal(vencida.length, 1);
  assert.match(vencida[0].texto, /hasta contar con licencia urbanística vigente/);
  const aportada = ed.sugerenciasRecomendacionesDeLaVisita(Object.assign({}, BASE, { comportamientos: ['A4 - …'], estado_licencia: 'VIGENTE' }));
  assert.deepEqual(textos(aportada), ['Garantizar que la ejecución de las obras se ajuste estrictamente a lo aprobado por la curaduría urbana.']);
});

// ── Deduplicación ─────────────────────────────────────────────
test('jaccard: 0,6 exacto y textos distintos', () => {
  assert.equal(ed.jaccardPalabras('a b c d', 'a b c e'), 0.6);
  assert.equal(ed.jaccardPalabras('a b c d', 'a b c d'), 1);
  assert.equal(ed.jaccardPalabras('a b c d', 'e f g h'), 0);
  assert.equal(ed.jaccardPalabras('', 'a b'), 0);
});

test('quitarDuplicados: la sugerencia ya aplicada no se ofrece de nuevo', () => {
  const sugs = ed.sugerenciasConclusionesDeLaVisita(Object.assign({}, BASE, { sin_infraccion: true }), cita);
  const aplicadas = ['Las obras observadas no constituyen un comportamiento contrario a la integridad urbanística según el artículo 135 de la Ley 1801 de 2016.'];
  assert.equal(ed.quitarDuplicados(sugs, aplicadas).length, 0);
  // Una edición leve del punto aplicado sigue contando como duplicado.
  assert.equal(ed.quitarDuplicados(sugs, ['Las obras observadas no constituyen un comportamiento contrario a la integridad urbanística según el artículo 135 de la Ley 1801 (sin punto final)']).length, 0);
  // Otro tema distinto sobrevive.
  const otras = ed.quitarDuplicados(
    ed.sugerenciasConclusionesDeLaVisita(Object.assign({}, BASE, { sin_licencia: true }), cita),
    aplicadas
  );
  assert.equal(otras.length, 1);
  assert.match(otras[0].texto, /No fue aportada ni exhibida/);
});

// ── Puntos desde las conclusiones del inspector ───────────────
test('dividirPuntos: un punto por párrafo, sin vacíos', () => {
  assert.deepEqual(ed.dividirPuntos('Primera.\n\n  Segunda. \n\n\nTercera.'), ['Primera.', 'Segunda.', 'Tercera.']);
  assert.deepEqual(ed.dividirPuntos(''), []);
  assert.deepEqual(ed.dividirPuntos(null), []);
});
