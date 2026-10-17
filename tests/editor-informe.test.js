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

// La lista ya numera: «1. Durante…» salía «1. 1. Durante…» (20221031954).
test('dividirPuntos: quita la numeración que traía la visita', () => {
  assert.deepEqual(ed.dividirPuntos('1. Durante la visita.\n2) Se midió.\n- Sin licencia.\n10. Décima.'),
    ['Durante la visita.', 'Se midió.', 'Sin licencia.', 'Décima.']);
  // Un número que es dato se queda.
  assert.equal(ed.quitarNumeracion('3 pisos en concreto.'), '3 pisos en concreto.');
  assert.equal(ed.quitarNumeracion('1.5 m de voladizo.'), '1.5 m de voladizo.');
});

// ── Ronda 2: sugerencias «Del catálogo» ───────────────────────
test('catálogo: confirmadas + sugeridas, sin marcadores y con el nombre del hallazgo', () => {
  const cat = [
    { clave_api: 'A1', hallazgo: 'Construcción sin licencia', conclusion_sugerida: 'No fue aportada licencia.', recomendacion_sugerida: '' },
    { clave_api: 'C9', hallazgo: 'Uso diferente', conclusion_sugerida: 'Uso distinto al aprobado en [AREA].', recomendacion_sugerida: 'Ajustar el uso.' }
  ];
  const s = ed.sugerenciasDelCatalogo(['A1', 'C9', 'C9', 'XX'], cat);
  assert.equal(s.concl.length, 1); // la de C9 se salta por el marcador [AREA]
  assert.equal(s.concl[0].texto, 'No fue aportada licencia.');
  assert.match(s.concl[0].motivo, /Construcción sin licencia/);
  assert.equal(s.rec.length, 1); // la recomendación de C9 no tiene marcador
  assert.equal(s.rec[0].texto, 'Ajustar el uso.');
  assert.match(s.rec[0].motivo, /Uso diferente/);
});

// ── Ronda 2: armadores de los dos mensajes de la revisión ─────
const INFORME_R2 = {
  antecedentes: 'El 22 de abril de 2026 se realizó diligencia de inspección ocular…',
  observaciones: 'Se observó una ampliación en el tercer piso…',
  conclusiones_items: ['Conclusión primera.', 'Conclusión segunda.'],
  recomendaciones_items: ['Recomendación en imperativo.']
};
const huellaFake = (...args) => args.join('§');

test('mensaje de crítica: informe completo, datos de la visita y reglas del plan', () => {
  const msg = ed.armarMensajeCritica(INFORME_R2, BASE);
  // El informe viaja completo, sección por sección…
  ['El 22 de abril de 2026 se realizó diligencia', 'Se observó una ampliación',
   'Conclusión primera.', 'Conclusión segunda.', 'Recomendación en imperativo.'
  ].forEach(s => assert.ok(msg.includes(s), 'falta en el mensaje: ' + s));
  // …y los datos de la visita que sostienen la revisión.
  ['CR 54 # 33-32', '20251084835', '2026-04-22'].forEach(s => assert.ok(msg.includes(s), 'falta el dato: ' + s));
  // Reglas del plan: sin plazos, sin juzgar la decisión jurídica, topes.
  assert.match(msg, /PROHIBIDO proponer plazos/);
  assert.match(msg, /No juzgues ni corrijas la decisión jurídica/);
  assert.match(msg, /MÁXIMO 4/);
  // Preguntas solo ante dudas reales, nunca para confirmar hechos (2026-10-17).
  assert.match(msg, /SOLO cuando tengas una DUDA REAL/);
  assert.match(msg, /PROHIBIDO preguntar para confirmar un hecho/);
  assert.match(msg, /MÁXIMO 2/);
  assert.ok(!msg.includes('obligatoria'));
});

test('mensaje de correcciones: informe, respuestas no vacías y reglas', () => {
  const critica = { bien: [], falta: ['Falta el área en contravención'], no_coincide: [], forma: [], preguntas: [] };
  const respuestas = [
    { pregunta: '¿Cuál es el área?', respuesta: '75 m2' },
    { pregunta: 'Sin responder', respuesta: '   ' },
    { pregunta: '¿De cuándo es la licencia?', respuesta: '' }
  ];
  const msg = ed.armarMensajeCorrecciones(INFORME_R2, BASE, critica, respuestas);
  // Solo las respuestas con contenido viajan como hechos del inspector.
  assert.ok(msg.includes('75 m2'));
  assert.ok(!msg.includes('Sin responder'));
  assert.ok(!msg.includes('De cuándo es la licencia'));
  // La crítica previa también viaja.
  assert.ok(msg.includes('Falta el área en contravención'));
  assert.ok(msg.includes('Conclusión segunda.'));
  // Reglas del plan.
  assert.match(msg, /Corrige SOLO lo que cambia/);
  assert.match(msg, /Conserva la cita literal del artículo 135/);
  assert.match(msg, /PROHIBIDA la palabra «infractor» y proponer plazos/);
  assert.match(msg, /Recomendaciones en imperativo/);
});

// ── Ronda 2: filtro de cambios de la revisión ─────────────────
test('normalizarCambios: original al que reemplaza; fuera los que no aplican', () => {
  const cambios = ed.normalizarCambios([
    { seccion: 'antecedentes', numero: 1, texto: INFORME_R2.antecedentes + ' (corregido)' },
    { seccion: 'conclusion', numero: 2, texto: 'Conclusión segunda corregida.' },
    { seccion: 'conclusion', numero: 2, texto: 'Conclusión segunda.' },   // sin cambio real
    { seccion: 'conclusion', numero: 9, texto: 'No existe.' },            // punto que no existe
    { seccion: 'resumen', numero: 1, texto: 'Sección desconocida.' },     // fuera del informe
    { seccion: 'recomendacion', numero: 1, texto: '' }                    // vacío
  ], INFORME_R2);
  assert.equal(cambios.length, 2);
  assert.equal(cambios[0].seccion, 'antecedentes');
  assert.equal(cambios[0].original, INFORME_R2.antecedentes);
  assert.equal(cambios[1].seccion, 'conclusion');
  assert.equal(cambios[1].numero, 2);
  assert.equal(cambios[1].original, 'Conclusión segunda.');
});

test('filtrarCambiosRevision: cada cambio se valida suelto, en su sección y sin mínimos ni cobertura', () => {
  const vistos = [];
  const validador = (json, ctx, opts) => {
    vistos.push({ json: json, opts: opts });
    return { ok: !/mala/.test(JSON.stringify(json)) };
  };
  const cambios = [
    { seccion: 'conclusion', numero: 1, original: 'a', texto: 'Conclusión buena.' },
    { seccion: 'observaciones', numero: 1, original: 'b', texto: 'Texto mala palabra.' },
    { seccion: 'recomendacion', numero: 1, original: 'c', texto: 'Recomendación buena.' }
  ];
  const ok = ed.filtrarCambiosRevision(cambios, { d: BASE }, validador);
  assert.equal(ok.length, 2);
  // El JSON que recibe el validador es el de la sección de cada cambio.
  assert.deepEqual(vistos[0].json,
    { antecedentes: '', observaciones: '', conclusiones_items: ['Conclusión buena.'], recomendaciones_items: [] });
  assert.deepEqual(vistos[0].opts, { sinCantidades: true, sinCobertura: true });
  assert.equal(vistos[1].json.observaciones, 'Texto mala palabra.');
  assert.deepEqual(vistos[2].json.recomendaciones_items, ['Recomendación buena.']);
});

// ── Ronda 2: vigencia de la revisión por huella ───────────────
test('huella de la revisión: se vence con cualquier edición', () => {
  const h1 = ed.huellaInforme(INFORME_R2, huellaFake);
  assert.equal(h1, huellaFake(INFORME_R2.antecedentes, INFORME_R2.observaciones,
    INFORME_R2.conclusiones_items.join('\n\n'), INFORME_R2.recomendaciones_items.join('\n\n')));
  // Misma huella → vigente; sin revisión previa → no.
  assert.ok(ed.revisionInformeVigente({ huella: h1 }, INFORME_R2, huellaFake));
  assert.ok(!ed.revisionInformeVigente(null, INFORME_R2, huellaFake));
  // Cualquier edición (aunque sea de un solo punto) vence la revisión.
  const editado = Object.assign({}, INFORME_R2,
    { conclusiones_items: ['Conclusión primera editada.', 'Conclusión segunda.'] });
  assert.ok(!ed.revisionInformeVigente({ huella: h1 }, editado, huellaFake));
});

// ── Ronda 2: condición de «Generar Word» ──────────────────────
test('Generar Word: revisión, validador limpio y cierre grave con comportamientos', () => {
  const limpio = { vigente: true, huboRevision: true, problemas: [], requiereCierre: false, tieneCierre: false };
  assert.deepEqual(ed.condicionGenerarWord(limpio), { ok: true, motivo: '', avisos: [] });
  // Nunca revisado.
  const nunca = ed.condicionGenerarWord({ vigente: false, huboRevision: false, problemas: [], requiereCierre: false, tieneCierre: false });
  assert.equal(nunca.ok, false);
  assert.match(nunca.motivo, /Falta la revisión final/);
  assert.equal(nunca.tipo, 'revision');
  // Revisión vencida por una edición posterior.
  const vencida = ed.condicionGenerarWord(Object.assign({}, limpio, { vigente: false }));
  assert.match(vencida.motivo, /Revisión vencida: vuelve a revisar/);
  // Vigente pero el validador encontró problemas → bloquea con todos.
  const conProblemas = ed.condicionGenerarWord(Object.assign({}, limpio, { problemas: ['p1', 'p2'] }));
  assert.equal(conProblemas.motivo, 'p1');
  assert.equal(conProblemas.tipo, 'problema');
  assert.deepEqual(conProblemas.problemas, ['p1', 'p2']);
  // Problemas y revisión vencida: primero los problemas (corregirlos vence
  // la revisión; pedir revisar antes obligaba a revisar dos veces).
  const ambos = ed.condicionGenerarWord(Object.assign({}, limpio, { vigente: false, problemas: ['p1'] }));
  assert.equal(ambos.tipo, 'problema');
  // Con comportamientos marcados, sin la frase de cierre grave no sale.
  const sinCierre = ed.condicionGenerarWord(Object.assign({}, limpio, { requiereCierre: true }));
  assert.equal(sinCierre.ok, false);
  assert.match(sinCierre.motivo, /frase de cierre grave/);
  const conCierre = ed.condicionGenerarWord(Object.assign({}, limpio, { requiereCierre: true, tieneCierre: true }));
  assert.deepEqual(conCierre, { ok: true, motivo: '', avisos: [] });
  // Avisos de redacción (2026-10-16): viajan tal cual y NO bloquean.
  const conAvisos = ed.condicionGenerarWord(Object.assign({}, limpio, { avisos: ['a1'] }));
  assert.equal(conAvisos.ok, true);
  assert.deepEqual(conAvisos.avisos, ['a1']);
  const problemaYAviso = ed.condicionGenerarWord(Object.assign({}, limpio, { problemas: ['p1'], avisos: ['a1'] }));
  assert.equal(problemaYAviso.ok, false);
  assert.equal(problemaYAviso.tipo, 'problema');
  assert.deepEqual(problemaYAviso.avisos, ['a1']);
});

// «Ver dónde»: de un problema del validador a su sección, punto y frase.
test('ubicarProblema: sección, punto y frase citada', () => {
  assert.deepEqual(ed.ubicarProblema('Las observaciones de campo traen una recomendación ("se recomienda"). Pásala a Recomendaciones o quítala: las observaciones solo cuentan lo que se vio.'),
    { seccion: 'obs', numero: null, frase: 'se recomienda' });
  assert.deepEqual(ed.ubicarProblema('Recomendación 2 fija un plazo ("60 dias"): los plazos los da el Inspector de Policía.'),
    { seccion: 'rec', numero: 2, frase: '60 dias' });
  assert.deepEqual(ed.ubicarProblema('Conclusiones/recomendaciones tratan un tema que la inspección no resuelve ("linderos").'),
    { seccion: 'concl-rec', numero: null, frase: 'linderos' });
  assert.deepEqual(ed.ubicarProblema('La conclusión que cita "A4" no menciona la conducta del literal A: parcelar, urbanizar, demoler, intervenir o construir, en cualquier forma del verbo.'),
    { seccion: 'concl', numero: null, frase: 'a4' });
  // Frase sin sección: se busca en todo el documento.
  assert.deepEqual(ed.ubicarProblema('Dice "ficha catastral" donde va el código catastral.'),
    { seccion: null, numero: null, frase: 'ficha catastral' });
  // Sin frase: la sección que nombra.
  assert.equal(ed.ubicarProblema('El comportamiento A4 está marcado, pero ninguna conclusión lo cita (literal, numeral y Ley 1801 de 2016).').seccion, 'concl');
  assert.equal(ed.ubicarProblema('Con comportamientos marcados falta la frase de cierre grave.').seccion, 'concl');
  assert.equal(ed.ubicarProblema('La licencia estaba vencida a la fecha de la visita: falta la recomendación de abstenerse de ejecutar obras hasta contar con licencia urbanística vigente.').seccion, 'rec');
  assert.equal(ed.ubicarProblema('Las observaciones de campo no mencionan la conducta del literal A marcado (A4): parcelar, urbanizar, demoler, intervenir o construir, en cualquier forma del verbo.').seccion, 'obs');
});

// «¿Requiere licencia?» de la visita → primera sugerencia de Conclusiones.
test('requiere licencia: SI, NO por motivo y no se pudo determinar', () => {
  const ed = require('../informe/editor.js');
  const si = ed.sugerenciasRequiereLicencia({ requiere_licencia: 'SI', requiere_detalle: 'Ampliación, Modificación' });
  assert.equal(si.length, 1);
  assert.match(si[0].texto, /^Las obras corresponden a ampliación y modificación y requieren licencia de construcción en esas modalidades \(Decreto 1077 de 2015, art\. 2\.2\.6\.1\.1\.7\)\.$/);
  const no = ed.sugerenciasRequiereLicencia({ requiere_licencia: 'NO', requiere_detalle: 'Reparación locativa | Otro: cambio de una puerta' });
  assert.equal(no.length, 2);
  assert.match(no[0].texto, /2\.2\.6\.1\.1\.10/);
  assert.equal(no[1].texto, 'Las obras observadas no requieren licencia urbanística: cambio de una puerta.');
  const ind = ed.sugerenciasRequiereLicencia({ requiere_licencia: 'NO SE PUDO DETERMINAR', requiere_detalle: 'no se tuvo acceso.' });
  assert.equal(ind[0].texto, 'No se pudo determinar si las obras requieren licencia urbanística: no se tuvo acceso.');
  assert.deepEqual(ed.sugerenciasRequiereLicencia({}), []);
  // Va primero entre las conclusiones «De la visita».
  const todas = ed.sugerenciasConclusionesDeLaVisita({ requiere_licencia: 'SI', requiere_detalle: 'Ampliación', sin_licencia: true });
  assert.match(todas[0].texto, /requieren licencia/);
});

test('no requiere licencia: no sugiere «No fue aportada…»', () => {
  const ed = require('../informe/editor.js');
  const s = ed.sugerenciasConclusionesDeLaVisita({ requiere_licencia: 'NO', requiere_detalle: 'Reparación locativa', sin_licencia: true });
  assert.ok(!s.some(x => /No fue aportada/.test(x.texto)));
});

// ── Revisión por secciones (2026-10-16): lo que no cambió no se revisa ──
const INFORME_SECC = {
  antecedentes: 'El 22 de abril de 2026 se realizó diligencia de inspección ocular…',
  observaciones: 'Se observó una ampliación en concreto en el tercer piso.',
  conclusiones_items: ['Las obras corresponden a ampliación y requieren licencia de construcción en esa modalidad (Decreto 1077 de 2015, art. 2.2.6.1.1.7).'],
  recomendaciones_items: ['Abstenerse de ejecutar obras que requieran licencia urbanística sin haberla obtenido.']
};

test('huellasSecciones: tilde o coma no cambia la huella, una palabra sí', () => {
  const h = ed.huellasSecciones(INFORME_SECC);
  // Tilde y coma: _normTexto las ignora.
  const conTilde = Object.assign({}, INFORME_SECC, { observaciones: 'Se observó una ampliación en concreto, en el tercer piso.' });
  assert.deepEqual(ed.huellasSecciones(conTilde), h);
  // Una palabra más en un punto: cambia la huella de su sección, no las demás.
  const conPalabra = Object.assign({}, INFORME_SECC,
    { conclusiones_items: INFORME_SECC.conclusiones_items.concat('Otra conclusión distinta.') });
  const h2 = ed.huellasSecciones(conPalabra);
  assert.notEqual(h2.conclusiones, h.conclusiones);
  assert.equal(h2.observaciones, h.observaciones);
  assert.equal(h2.antecedentes, h.antecedentes);
  // Sección vacía: huella estable (la de '').
  const vacia = ed.huellasSecciones({ antecedentes: '', observaciones: '', conclusiones_items: [], recomendaciones_items: [] });
  assert.deepEqual(ed.huellasSecciones({}), vacia);
});

test('seccionesCambiadas: sello nuevo solo la tocada; viejo vigente/vencido; sin sello', () => {
  const h = ed.huellasSecciones(INFORME_SECC);
  // Sello nuevo: solo cambia la sección editada.
  const sello = { secciones: h, modo: 'IA', fecha: '2026-10-16' };
  const editado = Object.assign({}, INFORME_SECC, { conclusiones_items: ['Editada.'] });
  assert.deepEqual(ed.seccionesCambiadas(sello, editado), ['conclusiones']);
  assert.deepEqual(ed.seccionesCambiadas(sello, INFORME_SECC), []);
  // Falta una sección en el sello (nació sin revisar): siempre cuenta como cambiada.
  const parcial = { secciones: { antecedentes: h.antecedentes }, modo: 'VISITA' };
  assert.deepEqual(ed.seccionesCambiadas(parcial, INFORME_SECC),
    ['observaciones', 'conclusiones', 'recomendaciones']);
  // Sello viejo (sin secciones): la comparación de hoy por huella completa.
  const huellaVieja = ed.huellaInforme(INFORME_SECC, huellaFake);
  assert.deepEqual(ed.seccionesCambiadas({ huella: huellaVieja }, INFORME_SECC, huellaFake), []);
  assert.deepEqual(ed.seccionesCambiadas({ huella: huellaVieja }, editado, huellaFake), ed.SECCIONES_REVISION);
  // Sin sello: las 4.
  assert.deepEqual(ed.seccionesCambiadas(null, INFORME_SECC), ed.SECCIONES_REVISION);
  // revisionInformeVigente es «sin secciones cambiadas».
  assert.ok(ed.revisionInformeVigente(sello, INFORME_SECC));
  assert.ok(!ed.revisionInformeVigente(sello, editado));
});

test('selloInicialSecciones: hereda lo revisado en la visita', () => {
  const rec = ed.sugerenciasRecomendacionesDeLaVisita(BASE); // la preventiva (REC_*)
  const conclVisita = ed.sugerenciasConclusionesDeLaVisita(Object.assign({}, BASE, { sin_infraccion: true }), cita);
  const origen = {
    observaciones: INFORME_SECC.observaciones,
    conclusiones: ['Conclusión escrita por el inspector en la visita.'],
    antecedentes: INFORME_SECC.antecedentes,
    aprobadas: conclVisita.map(s => s.texto).concat(rec.map(s => s.texto))
  };
  // Todo nace de la visita → las 4 revisadas (y vigentes).
  const deLaVisita = Object.assign({}, INFORME_SECC, { conclusiones_items: origen.conclusiones, recomendaciones_items: [rec[0].texto] });
  let sello = ed.selloInicialSecciones(deLaVisita, origen);
  assert.deepEqual(Object.keys(sello).sort(), ['antecedentes', 'conclusiones', 'observaciones', 'recomendaciones']);
  assert.deepEqual(ed.seccionesCambiadas({ secciones: sello }, deLaVisita), []);
  // Conclusión aprobada (sugerencia «De la visita») también nace revisada.
  sello = ed.selloInicialSecciones(Object.assign({}, INFORME_SECC, { conclusiones_items: [conclVisita[0].texto] }), origen);
  assert.ok(sello.conclusiones);
  // Conclusión extra no aprobada → no; y recomendación REC_* → sí.
  sello = ed.selloInicialSecciones(INFORME_SECC, origen);
  assert.ok(!sello.conclusiones);
  assert.ok(sello.recomendaciones);
  assert.ok(sello.observaciones);
  // Observaciones editadas → no; antecedentes cambiados → no.
  sello = ed.selloInicialSecciones(Object.assign({}, INFORME_SECC, { observaciones: 'Editado.', antecedentes: 'Otro.' }), origen);
  assert.ok(!sello.observaciones);
  assert.ok(!sello.antecedentes);
  // Sección vacía nace revisada.
  sello = ed.selloInicialSecciones({ antecedentes: '', observaciones: '', conclusiones_items: [], recomendaciones_items: [] }, {});
  assert.deepEqual(Object.keys(sello).sort(), ['antecedentes', 'conclusiones', 'observaciones', 'recomendaciones']);
});

test('filtrarPreguntasRepetidas: fuera las ya respondidas (palabras con contenido ≥ 0,6)', () => {
  const previas = [{ pregunta: '¿Cuál es el área en contravención?', respuesta: '75 m2' }];
  const preguntas = [
    { pregunta: '¿Cual es el área en contravención de la visita?' },   // misma pregunta, sin tildes
    { pregunta: '¿Quién es el propietario del inmueble?' }
  ];
  const out = ed.filtrarPreguntasRepetidas(preguntas, previas);
  assert.equal(out.length, 1);
  assert.match(out[0].pregunta, /propietario/);
  // Respuesta vacía guardada no cuenta.
  assert.equal(ed.filtrarPreguntasRepetidas(preguntas, [{ pregunta: '¿Cuál es el área en contravención?', respuesta: '' }]).length, 2);
  assert.equal(ed.filtrarPreguntasRepetidas(preguntas, []).length, 2);
  // Comparten «el», «está», «en»: no son la misma pregunta.
  assert.equal(ed.filtrarPreguntasRepetidas([{ pregunta: '¿El muro está en el retiro?' }],
    [{ pregunta: '¿El muro está en el antejardín?', respuesta: 'Sí' }]).length, 1);
});

test('acumularRespuestas: reemplaza la parecida y recorta a 20', () => {
  let out = ed.acumularRespuestas([], [{ pregunta: '¿Cuál es el área?', respuesta: '75 m2' }]);
  assert.equal(out.length, 1);
  // La misma pregunta respondida de nuevo reemplaza; una nueva se suma.
  out = ed.acumularRespuestas(out, [
    { pregunta: '¿Cual es el área?', respuesta: '80 m2' },
    { pregunta: '¿El propietario?', respuesta: 'Juan' },
    { pregunta: '¿Vacía?', respuesta: '   ' }
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].respuesta, '80 m2');
  assert.equal(out[1].respuesta, 'Juan');
  // Tope 20: se quedan las más recientes. (Preguntas bien distintas entre sí:
  // «pregunta 5» y «pregunta 6» dan Jaccard 1/3, bajo el umbral.)
  const muchas = [];
  for (let i = 0; i < 25; i++) muchas.push({ pregunta: '¿Q' + i + '?', respuesta: 'r' + i });
  out = ed.acumularRespuestas(out, muchas);
  assert.equal(out.length, 20);
  assert.equal(out[0].pregunta, '¿Q5?');
  assert.equal(out[19].pregunta, '¿Q24?');
});

test('armarMensajeCritica con opts: secciones y respuestas previas; sin opts idéntico a hoy', () => {
  const sinOpts = ed.armarMensajeCritica(INFORME_R2, BASE);
  assert.equal(ed.armarMensajeCritica(INFORME_R2, BASE, undefined), sinOpts);
  assert.equal(ed.armarMensajeCritica(INFORME_R2, BASE, {}), sinOpts);
  const opts = {
    secciones: ['observaciones', 'conclusiones'],
    respuestasPrevias: [{ pregunta: '¿El área?', respuesta: '75 m2' }]
  };
  const msg = ed.armarMensajeCritica(INFORME_R2, BASE, opts);
  assert.match(msg, /Revisa SOLO estas secciones: Observaciones, Conclusiones; las demás van como contexto, no las critiques ni propongas cambios en ellas/);
  assert.match(msg, /RESPUESTAS YA DADAS POR EL INSPECTOR \(no vuelvas a preguntar esto\)/);
  assert.ok(msg.includes('75 m2'));
});

test('armarMensajeCorrecciones con opts: mismos bloques; sin opts idéntico a hoy', () => {
  const critica = { bien: [], falta: [], no_coincide: [], forma: [], preguntas: [] };
  const sinOpts = ed.armarMensajeCorrecciones(INFORME_R2, BASE, critica, []);
  assert.equal(ed.armarMensajeCorrecciones(INFORME_R2, BASE, critica, [], undefined), sinOpts);
  assert.equal(ed.armarMensajeCorrecciones(INFORME_R2, BASE, critica, [], {}), sinOpts);
  const msg = ed.armarMensajeCorrecciones(INFORME_R2, BASE, critica, [], {
    secciones: ['conclusiones'],
    respuestasPrevias: [{ pregunta: '¿El área?', respuesta: '75 m2' }]
  });
  assert.match(msg, /Revisa SOLO estas secciones: Conclusiones/);
  assert.match(msg, /RESPUESTAS YA DADAS POR EL INSPECTOR/);
});

test('normalizarCambios con secciones: fuera los cambios de secciones no revisadas', () => {
  const cambios = [
    { seccion: 'observaciones', numero: 1, texto: 'Observaciones corregidas.' },
    { seccion: 'conclusion', numero: 1, texto: 'Conclusión corregida.' },
    { seccion: 'antecedentes', numero: 1, texto: 'Antecedentes corregidos.' }
  ];
  // Nombres del sello (plurales) y de la IA (singular): ambos mapean.
  let out = ed.normalizarCambios(cambios, INFORME_R2, ['conclusiones']);
  assert.equal(out.length, 1);
  assert.equal(out[0].seccion, 'conclusion');
  out = ed.normalizarCambios(cambios, INFORME_R2, ['observaciones', 'antecedentes']);
  assert.equal(out.length, 2);
  // Sin secciones: como hoy.
  assert.equal(ed.normalizarCambios(cambios, INFORME_R2).length, 3);
});

test('avisoCasillaVisita: los 4 mensajes nombran la casilla de la visita', () => {
  const t = s => ({ texto: s });
  // 1. La visita dice que no se aportó licencia y el texto afirma lo contrario.
  assert.equal(ed.avisoCasillaVisita(t('La licencia aportada ampara la obra.'), { sin_licencia: true }),
    'Corrige también la visita: en Verificación documental, «¿Se aportó licencia?» = NO.');
  // 2. La visita aportó licencia y el texto dice que no.
  assert.equal(ed.avisoCasillaVisita(t('La licencia no fue aportada ni exhibida.'), {}),
    'Corrige también la visita: en Verificación documental, «¿Se aportó licencia?» = SI.');
  // 3. Las obras requieren licencia y el texto dice que no.
  assert.equal(ed.avisoCasillaVisita(t('La obra no requiere licencia.'), { requiere_licencia: 'SI' }),
    'Corrige también la visita: en Verificación documental, «¿Las obras requieren licencia?» = SI.');
  // 4. No requieren licencia y el texto afirma que sí (singular y plural).
  assert.equal(ed.avisoCasillaVisita(t('Las obras requieren licencia de construcción.'), { requiere_licencia: 'NO' }),
    'Corrige también la visita: en Verificación documental, «¿Las obras requieren licencia?» = NO.');
  assert.equal(ed.avisoCasillaVisita(t('La obra requiere licencia.'), { requiere_licencia: 'NO' }),
    'Corrige también la visita: en Verificación documental, «¿Las obras requieren licencia?» = NO.');
});

test('avisoCasillaVisita: gana el primero que aplica; sin coincidencia, vacío', () => {
  const t = s => ({ texto: s });
  // Con sin_licencia, el aviso de la licencia aportada gana aunque el texto
  // también diga «no requiere» y la visita tenga requiere_licencia.
  assert.equal(
    ed.avisoCasillaVisita(t('La licencia aportada… y la obra no requiere licencia.'), { sin_licencia: true, requiere_licencia: 'SI' }),
    'Corrige también la visita: en Verificación documental, «¿Se aportó licencia?» = NO.');
  // «no requiere» con requiere_licencia = NO no dispara nada (va con el dato).
  assert.equal(ed.avisoCasillaVisita(t('La obra no requiere licencia.'), { requiere_licencia: 'NO' }), '');
  // Menciona licencia pero ninguna casilla contradice.
  assert.equal(ed.avisoCasillaVisita(t('Se observó una edificación en construcción.'), { sin_licencia: true }), '');
  assert.equal(ed.avisoCasillaVisita(t('Texto cualquiera.'), {}), '');
});

test('avisoCasillaVisita: la negación en voz pasiva («no se requiere») también cuenta', () => {
  const t = s => ({ texto: s });
  // requiere SI y el texto niega en pasiva → avisa.
  assert.equal(ed.avisoCasillaVisita(t('No se requiere licencia urbanística.'), { requiere_licencia: 'SI' }),
    'Corrige también la visita: en Verificación documental, «¿Las obras requieren licencia?» = SI.');
  assert.equal(ed.avisoCasillaVisita(t('No se requieren licencias para la obra.'), { requiere_licencia: 'SI' }),
    'Corrige también la visita: en Verificación documental, «¿Las obras requieren licencia?» = SI.');
  // requiere NO y el texto niega en pasiva → consistente, sin aviso.
  assert.equal(ed.avisoCasillaVisita(t('No se requiere licencia urbanística.'), { requiere_licencia: 'NO' }), '');
});
