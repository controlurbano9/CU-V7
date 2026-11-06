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


// ── Ronda 2: condición de «Generar Word» ──────────────────────
test('Generar Word: validador limpio y cierre grave con comportamientos; la revisión no bloquea', () => {
  const limpio = { problemas: [], requiereCierre: false, tieneCierre: false };
  assert.deepEqual(ed.condicionGenerarWord(limpio), { ok: true, motivo: '', avisos: [] });
  // El validador encontró problemas → bloquea con todos.
  const conProblemas = ed.condicionGenerarWord(Object.assign({}, limpio, { problemas: ['p1', 'p2'] }));
  assert.equal(conProblemas.motivo, 'p1');
  assert.equal(conProblemas.tipo, 'problema');
  assert.deepEqual(conProblemas.problemas, ['p1', 'p2']);
  // Observaciones vacías: bloquea, no «Todo listo».
  const sinObs = ed.condicionGenerarWord(Object.assign({}, limpio, { observacionesVacias: true }));
  assert.equal(sinObs.ok, false);
  assert.equal(sinObs.tipo, 'problema');
  assert.match(sinObs.motivo, /observaciones/);
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
  assert.equal(ed.unidadesPendientes({ secciones: sello }, deLaVisita).total, 0);
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

// ── Revisión única al generar el Word (2026-11-05) ─────────────────────
// Un solo mensaje que devuelve los cambios con su motivo, por párrafo de
// observaciones y por punto; lo ya revisado (o un retoque) no vuelve a la IA.
const INFORME_P = {
  antecedentes: 'El 22 de abril de 2026 se realizó diligencia de inspección ocular…',
  observaciones: 'Se observó una edificación de tres niveles en obra negra.\n\nLa estructura es aporticada, con columnas de 80 cm x 40 cm según la información suministrada.\n\nLa cubierta es en teja termoacústica.',
  conclusiones_items: ['Conclusión primera.', 'Conclusión segunda.'],
  recomendaciones_items: ['Ajuste la obra a los niveles aprobados.', 'Absténgase de construir niveles adicionales.']
};

test('mensaje de revisión: informe por párrafos y puntos, datos y reglas', () => {
  const msg = ed.armarMensajeRevision(INFORME_P, BASE);
  // Observaciones por párrafo, numeradas por posición.
  assert.ok(msg.includes('"observaciones_parrafos":["Se observó una edificación'));
  ['Conclusión segunda.', 'Absténgase de construir', 'CR 54 # 33-32', '20251084835'].forEach(s =>
    assert.ok(msg.includes(s), 'falta en el mensaje: ' + s));
  assert.match(msg, /Revisa todo el informe/);
  // Un solo JSON de cambios con motivo; sin «bien», «falta» ni preguntas.
  assert.match(msg, /"cambios":\[\{"seccion":"antecedentes\|observaciones\|conclusion\|recomendacion","numero":1,"motivo":"","texto":""\}\]/);
  assert.ok(!/"bien"|"preguntas"|"no_coincide"/.test(msg));
  // Las observaciones son fuente de hechos; lo que el Word ya imprime no se pide.
  assert.match(msg, /OBSERVACIONES, que son el texto que el inspector escribió/);
  assert.match(msg, /PROHIBIDO pedir o agregar datos que el Word ya imprime/);
  assert.match(msg, /MÁXIMO 5 cambios/);
  assert.match(msg, /Una MEDIDA aproximada .* NO es duda/);
  assert.match(msg, /quita la palabra y deja el dato/);
  assert.match(msg, /se quita SOLO si la misma idea ya está en Conclusiones o Recomendaciones/);
  assert.match(msg, /PROHIBIDA la palabra «infractor»/);
  assert.match(msg, /PROHIBIDO proponer plazos/);
});

test('mensaje de revisión: solo lo pendiente y las respuestas ya dadas', () => {
  const pend = { antecedentes: [], observaciones: [2], conclusiones: [], recomendaciones: [1, 2], total: 3, todas: false };
  const msg = ed.armarMensajeRevision(INFORME_P, BASE, pend, { respuestasPrevias: [{ pregunta: '¿El área?', respuesta: '75 m2' }] });
  assert.match(msg, /REVISA SOLO: Observaciones, párrafo\(s\) 2; Recomendaciones, punto\(s\) 1, 2\. Lo demás ya fue revisado/);
  assert.ok(msg.includes('75 m2'));
});

test('parrafosObservaciones y reemplazarParrafos: por posición, sin tocar los saltos', () => {
  assert.deepEqual(ed.parrafosObservaciones('A.\n\n  B.  \n \nC.'), ['A.', 'B.', 'C.']);
  assert.equal(ed.reemplazarParrafos('A.\n\nB.\nC.', { 2: 'B corregido.' }), 'A.\n\nB corregido.\nC.');
  assert.equal(ed.reemplazarParrafos('A.\n \nB.', { 2: 'X.' }), 'A.\n \nX.');
  assert.equal(ed.reemplazarParrafos('A.', {}), 'A.');
});

test('normalizarCambios: párrafo o punto con su original, motivo, quitar y tope de 5', () => {
  const out = ed.normalizarCambios([
    { seccion: 'observaciones', numero: 2, motivo: 'Pone en duda lo medido.', texto: 'La estructura es aporticada,\ncon columnas de 80 cm x 40 cm.' },
    { seccion: 'observaciones', numero: 2, texto: 'Repetido.' },                 // mismo párrafo: fuera
    { seccion: 'conclusion', numero: 2, texto: 'Conclusión segunda.' },          // sin cambio real
    { seccion: 'conclusion', numero: 9, texto: 'No existe.' },                   // punto que no existe
    { seccion: 'resumen', numero: 1, texto: 'Sección desconocida.' },
    { seccion: 'observaciones', numero: 1, texto: '' },                          // vacío en observaciones: fuera
    { seccion: 'recomendacion', numero: 2, motivo: 'Dice lo mismo que el 1.', texto: '' }  // quitar el punto
  ], INFORME_P);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { seccion: 'observaciones', numero: 2,
    original: 'La estructura es aporticada, con columnas de 80 cm x 40 cm según la información suministrada.',
    texto: 'La estructura es aporticada, con columnas de 80 cm x 40 cm.', quitar: false, motivo: 'Pone en duda lo medido.' });
  assert.equal(out[1].seccion, 'recomendacion');
  assert.equal(out[1].quitar, true);
  assert.equal(out[1].original, 'Absténgase de construir niveles adicionales.');
  // Tope de 5.
  const muchos = [1, 2, 3].map(n => ({ seccion: 'observaciones', numero: n, texto: 'Otro ' + n + '.' }))
    .concat([1, 2].map(n => ({ seccion: 'conclusion', numero: n, texto: 'Otra ' + n + '.' })))
    .concat([{ seccion: 'recomendacion', numero: 1, texto: 'Otra rec.' }]);
  assert.equal(ed.normalizarCambios(muchos, INFORME_P).length, 5);
});

test('normalizarCambios con pendientes: fuera lo que ya estaba revisado', () => {
  const pend = { antecedentes: [], observaciones: [2], conclusiones: [], recomendaciones: [], total: 1 };
  const out = ed.normalizarCambios([
    { seccion: 'observaciones', numero: 1, texto: 'Primer párrafo cambiado.' },
    { seccion: 'observaciones', numero: 2, texto: 'Segundo párrafo cambiado.' },
    { seccion: 'conclusion', numero: 1, texto: 'Conclusión cambiada.' }
  ], INFORME_P, pend);
  assert.equal(out.length, 1);
  assert.equal(out[0].numero, 2);
});

test('filtrarCambiosRevision: quitar un punto no pasa por el validador', () => {
  const validador = () => ({ ok: false });
  const out = ed.filtrarCambiosRevision([
    { seccion: 'recomendacion', numero: 2, original: 'x', texto: '', quitar: true },
    { seccion: 'conclusion', numero: 1, original: 'y', texto: 'Mala.', quitar: false }
  ], { d: BASE }, validador);
  assert.equal(out.length, 1);
  assert.equal(out[0].quitar, true);
});

test('retoqueRevisado: una frase cambiada no vuelve a la IA; una reescritura o una cifra nueva sí', () => {
  const p = 'La estructura es aporticada en concreto reforzado, con columnas de 80 cm x 40 cm y vigas de amarre.';
  assert.ok(ed.retoqueRevisado(p, 'La estructura es aporticada en concreto reforzado, con columnas de 80 cm x 40 cm.'));
  assert.ok(ed.retoqueRevisado(p, p.replace('concreto reforzado', 'concreto')));
  assert.ok(!ed.retoqueRevisado(p, 'La cubierta es en teja de zinc sobre perfilería metálica.'));
  assert.ok(!ed.retoqueRevisado(p, p.replace('80 cm', '90 cm')));
  assert.ok(!ed.retoqueRevisado('', p));
});

test('unidadesPendientes: sin sello todo; con sello solo lo nuevo o reescrito', () => {
  let pend = ed.unidadesPendientes(null, INFORME_P);
  assert.equal(pend.total, 1 + 3 + 2 + 2);
  assert.equal(pend.todas, true);
  assert.deepEqual(pend.observaciones, [1, 2, 3]);
  // Sello nuevo: con el mismo informe no queda nada.
  const sello = { unidades: ed.unidadesInforme(INFORME_P), modo: 'IA' };
  pend = ed.unidadesPendientes(sello, INFORME_P);
  assert.equal(pend.total, 0);
  assert.equal(pend.todas, false);
  // Retoque en el párrafo 2, un punto nuevo y otro movido de lugar.
  const editado = Object.assign({}, INFORME_P, {
    observaciones: INFORME_P.observaciones.replace(' según la información suministrada', ''),
    recomendaciones_items: ['Absténgase de construir niveles adicionales.', 'Ajuste la obra a los niveles aprobados.',
      'Tramite el reconocimiento de la edificación ante la curaduría urbana.']
  });
  pend = ed.unidadesPendientes(sello, editado);
  assert.deepEqual(pend.observaciones, []);
  assert.deepEqual(pend.recomendaciones, [3]);
  assert.equal(pend.total, 1);
  assert.equal(pend.todas, false);
  // Una frase aprobada (De la visita o del catálogo) nace revisada.
  pend = ed.unidadesPendientes(sello, editado, ['Tramite el reconocimiento de la edificación ante la curaduría urbana.']);
  assert.equal(pend.total, 0);
});

test('unidadesSelladas: sello con textos (2026-10-17) y sello por secciones', () => {
  // Sello con textos: lo que se revisó entonces.
  let s = ed.unidadesSelladas({ textos: INFORME_P }, INFORME_P);
  assert.deepEqual(s.conclusiones, INFORME_P.conclusiones_items);
  // Sello por secciones: cuenta la sección cuya huella sigue igual.
  const h = ed.huellasSecciones(INFORME_P);
  const editado = Object.assign({}, INFORME_P, { conclusiones_items: ['Otra cosa.'] });
  s = ed.unidadesSelladas({ secciones: { observaciones: h.observaciones, conclusiones: h.conclusiones } }, editado);
  assert.equal(s.observaciones.length, 3);
  assert.deepEqual(s.conclusiones, []);
  assert.deepEqual(s.antecedentes, []);
  assert.deepEqual(ed.unidadesSelladas(null, INFORME_P).observaciones, []);
});
