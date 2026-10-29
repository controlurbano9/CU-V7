// ═══════════════════════════════════════════════════════════════
// informe/editor.js — Editor del F-GGO-43 con forma de documento.
// Ronda 1 (docs/PLAN_2026-10-15_editor-informe.md): la hoja en el orden
// del informe, editable en su sitio, + sugerencias deterministas «De la
// visita». Ronda 2: sugerencias «Del catálogo» y «Propuesta», revisión
// final de 3 pasos (crítica+preguntas → correcciones → sello por huella)
// y «Generar Word» con revisión vigente.
//
// Solo actúa con ?ui=doc: el asistente queda vivo y oculto
// (body.modo-doc .shell{display:none}) como almacén de datos — campos,
// fotos (#fotos-list), mapa (setLocPreview) y select de inspectores —
// así todo lo que ya funciona se reutiliza sin tocarlo.
//
// La lógica testeable vive en funciones puras al inicio, exportadas al
// final con el patrón de utils.js (tests/editor-informe.test.js).
// Comentarios en español, identificadores en inglés.
// ═══════════════════════════════════════════════════════════════
(function () {
'use strict';

// ── Puras: antecedentes ──────────────────────────────────────────────

var _MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function _fmtFechaLargo(iso) {
  if (!iso) return 'N/D';
  var p = String(iso).split('-');
  var mes = parseInt(p[1], 10), dia = parseInt(p[2], 10);
  if (!mes || !dia || !p[0]) return 'N/D';
  return dia + ' de ' + _MESES[mes - 1] + ' de ' + p[0];
}

function _esOficio(radicado) {
  return /^oficio[-\s]/i.test(radicado || '');
}

// Origen de la actuación: diligencia en audiencia · oficio · PQR.
function detectarOrigenAntecedentes(d) {
  if (d.es_diligencia) return 'diligencia';
  if (_esOficio(d.radicado)) return 'oficio';
  return 'pqr';
}

// Frase de ANTECEDENTES armada con los datos de la visita (Mapa del plan):
// fecha, dirección, barrio, comuna, código catastral y origen, más el
// objeto fijo de la diligencia. A partir de aquí se edita en el documento.
function fraseAntecedentes(d, origen) {
  origen = origen || detectarOrigenAntecedentes(d);
  var partes = ['El ' + _fmtFechaLargo(d.fecha_visita) + ' se realizó diligencia de inspección ocular al inmueble ubicado en ' + ((d.direccion || '').trim() || 'dirección sin registrar')];
  if ((d.barrio || '').trim()) partes.push('barrio ' + d.barrio.trim());
  // Rural no es comuna: el select del asistente trae «Rural (sin comuna)».
  if ((d.comuna || '').trim() && !/rural/i.test(d.comuna)) partes.push('comuna ' + String(d.comuna).trim());
  if ((d.catastral || '').trim()) partes.push('código catastral ' + d.catastral.trim());
  var motivo;
  if (origen === 'diligencia') {
    motivo = 'decretada en audiencia por el inspector de convivencia';
  } else if (origen === 'oficio') {
    motivo = 'de oficio' + (_esOficio(d.radicado) ? ' con radicado ' + d.radicado : '');
  } else {
    motivo = d.radicado ? 'en atención a la PQR con radicado ' + d.radicado : 'en atención a la PQR radicada en esta dependencia';
  }
  return partes.join(', ') + ', ' + motivo + '. El objeto de la diligencia fue verificar las condiciones urbanísticas del inmueble.';
}

// Conclusiones del inspector → un punto por párrafo. La numeración que traía
// el texto de la visita («1. Durante…») se quita: la lista ya numera y el
// punto salía «1. 1. Durante…» en pantalla y en el Word.
function quitarNumeracion(s) {
  return String(s || '').replace(/^\s*(?:\d{1,2}\s*[.)-]|[-•–])\s+/, '').trim();
}
function dividirPuntos(texto) {
  return String(texto || '').split(/\n+/).map(quitarNumeracion).filter(Boolean);
}

// ── Puras: sugerencias «De la visita» (deterministas, sin IA) ────────

// Área en contravención — mismos tres estados que construirPromptF43().
function _estadoAreaVisita(d) {
  var v = (d.areas || '').trim();
  if (!v || /^(no\s+aplica|n\/?a|na)$/i.test(v)) return 'noAplica';
  if (/no\s+se\s+pudo\s+medir/i.test(v)) return 'noMedible';
  return 'cuantificable';
}

// CONCLUSIONES. citaArt135: (literal, numeral) → 'literal A «…», numeral 4 «…»'
// (inyectada para que esto siga siendo puro y testeable desde node).
// «¿Las obras requieren licencia?» de la visita → frases fijas (2026-10-15).
// Van primero: es lo primero que determina la conclusión (regla 4a del prompt).
var FRASES_NO_REQUIERE = {
  'Reparación locativa': 'Las obras observadas corresponden a reparaciones locativas, que no requieren licencia urbanística (Decreto 1077 de 2015, art. 2.2.6.1.1.10).',
  'Mantenimiento o cambio de acabados': 'Las obras observadas corresponden a mantenimiento o cambio de acabados, que no requieren licencia urbanística.',
  'Obra amparada por licencia o reconocimiento anterior': 'Las obras observadas se encuentran amparadas por una licencia o un reconocimiento anterior.'
};
function _unirConY(lista) {
  if (lista.length < 2) return lista.join('');
  return lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
}
function sugerenciasRequiereLicencia(d) {
  var r = String(d.requiere_licencia || '').trim().toUpperCase();
  var det = String(d.requiere_detalle || '').trim();
  if (r === 'SI') {
    var mods = det.split(/\s*,\s*/).filter(Boolean).map(function (m) { return m.toLowerCase(); });
    if (!mods.length) return [];
    return [{
      texto: 'Las obras corresponden a ' + _unirConY(mods) + ' y requieren licencia de construcción en ' +
        (mods.length > 1 ? 'esas modalidades' : 'esa modalidad') + ' (Decreto 1077 de 2015, art. 2.2.6.1.1.7).',
      motivo: '¿Requiere licencia? SI'
    }];
  }
  if (r === 'NO') {
    return det.split(/\s*\|\s*/).filter(Boolean).map(function (m) {
      var otro = /^otro\s*:\s*/i.test(m);
      var texto = otro
        ? 'Las obras observadas no requieren licencia urbanística: ' + m.replace(/^otro\s*:\s*/i, '').replace(/\.?\s*$/, '') + '.'
        : FRASES_NO_REQUIERE[m];
      return texto ? { texto: texto, motivo: '¿Requiere licencia? NO' } : null;
    }).filter(Boolean);
  }
  if (r === 'NO SE PUDO DETERMINAR' && det) {
    return [{
      texto: 'No se pudo determinar si las obras requieren licencia urbanística: ' + det.replace(/\.?\s*$/, '') + '.',
      motivo: '¿Requiere licencia? No se pudo determinar'
    }];
  }
  return [];
}

function sugerenciasConclusionesDeLaVisita(d, citaArt135) {
  citaArt135 = citaArt135 || function () { return ''; };
  var out = sugerenciasRequiereLicencia(d);
  if (d.sin_infraccion) {
    out.push({
      texto: 'Las obras observadas no constituyen un comportamiento contrario a la integridad urbanística según el artículo 135 de la Ley 1801 de 2016.',
      motivo: 'Marcaste «No se evidencia infracción»'
    });
  }
  (d.comportamientos || []).forEach(function (c) {
    var m = /^([ABCD])(\d{1,2})/.exec(c);
    if (!m) return;
    var cita = citaArt135(m[1], m[2]);
    out.push({
      texto: 'Las obras descritas constituyen un comportamiento contrario a la integridad urbanística según el artículo 135' + (cita ? ', ' + cita : '') + ', de la Ley 1801 de 2016.',
      motivo: 'Comportamiento marcado en la visita (' + m[1] + parseInt(m[2], 10) + ')'
    });
  });
  // Si las obras no requieren licencia, decir que no se aportó sobra.
  var noRequiere = String(d.requiere_licencia || '').trim().toUpperCase() === 'NO';
  if ((d.sin_licencia || d.estado_licencia === 'SIN_LICENCIA') && !noRequiere) {
    out.push({
      texto: 'No fue aportada ni exhibida documentación urbanística que acredite licencia de construcción.',
      motivo: '¿Se aportó licencia? NO'
    });
  } else if (d.estado_licencia === 'VENCIDA') {
    out.push({
      texto: 'La licencia aportada tenía su término de vigencia vencido a la fecha de la visita.',
      motivo: 'Vigencia vencida a la fecha de la visita'
    });
  }
  var area = _estadoAreaVisita(d);
  if (area === 'cuantificable') {
    out.push({ texto: 'El área en contravención es de ' + d.areas.trim() + '.', motivo: 'Área en contravención de la visita' });
  } else if (area === 'noMedible') {
    out.push({ texto: 'El área en contravención no pudo determinarse durante la visita.', motivo: 'Área sin medir en la visita' });
  }
  return out;
}

// RECOMENDACIONES — las mismas reglas de recLicencia en construirPromptF43:
// sin comportamientos → solo la preventiva; sin licencia con
// comportamientos → reconocimiento/licencia + abstenerse; vencida →
// abstenerse hasta licencia vigente; aportada → ajustarse a lo aprobado.
var REC_PREVENTIVA = 'Abstenerse de ejecutar obras que requieran licencia urbanística sin haberla obtenido.';
var REC_RECONOCIMIENTO = 'Tramitar ante una curaduría urbana el reconocimiento de la edificación existente (Decreto 1077 de 2015, arts. 2.2.6.4.1.1 y siguientes, con el peritaje técnico que exige el art. 2.2.6.4.2.2) y la licencia de construcción para las obras inconclusas o por ejecutar; si la curaduría no los concede, restituir la edificación demoliendo las obras no amparadas.';
var REC_ABSTENERSE_SIN_LIC = 'Abstenerse de continuar (o de reanudar, si la obra estaba inactiva en la visita) y de ejecutar nuevas obras de construcción, ampliación o modificación hasta contar con licencia urbanística.';
var REC_ABSTENERSE_VENCIDA = 'Abstenerse de ejecutar nuevas obras de construcción, ampliación, modificación o adecuación en el inmueble hasta contar con licencia urbanística vigente, y garantizar que toda intervención se ajuste estrictamente a lo aprobado por la curaduría urbana.';
var REC_AJUSTE_APROBADO = 'Garantizar que la ejecución de las obras se ajuste estrictamente a lo aprobado por la curaduría urbana.';

function sugerenciasRecomendacionesDeLaVisita(d) {
  var sinComportamientos = !(d.comportamientos || []).length;
  var sinLic = d.sin_licencia || d.estado_licencia === 'SIN_LICENCIA';
  if (sinComportamientos) {
    return [{
      texto: REC_PREVENTIVA,
      motivo: d.sin_infraccion ? 'Marcaste «No se evidencia infracción»' : 'Sin comportamientos marcados'
    }];
  }
  if (sinLic) {
    return [
      { texto: REC_RECONOCIMIENTO, motivo: 'Sin licencia aportada, con comportamientos marcados' },
      { texto: REC_ABSTENERSE_SIN_LIC, motivo: 'Sin licencia aportada, con comportamientos marcados' }
    ];
  }
  if (d.estado_licencia === 'VENCIDA') {
    return [{ texto: REC_ABSTENERSE_VENCIDA, motivo: 'Licencia vencida a la fecha de la visita' }];
  }
  return [{ texto: REC_AJUSTE_APROBADO, motivo: 'Licencia aportada en la visita' }];
}

// ── Puras: deduplicación (comparación normalizada, Jaccard ≥ 0,6) ────

function _normTexto(s) {
  return (s || '').toString().toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function jaccardPalabras(a, b) {
  var A = _normTexto(a).split(' ').filter(Boolean);
  var B = _normTexto(b).split(' ').filter(Boolean);
  if (!A.length || !B.length) return 0;
  var setB = {};
  B.forEach(function (w) { setB[w] = true; });
  var inter = 0;
  A.forEach(function (w) { if (setB[w]) inter++; });
  return inter / (A.length + B.length - inter);
}

// Quita las sugerencias que ya están (casi) en los textos aplicados.
function quitarDuplicados(sugerencias, textosAplicados) {
  var aplicados = (textosAplicados || []).map(_normTexto).filter(Boolean);
  return (sugerencias || []).filter(function (s) {
    var n = _normTexto(s.texto);
    return !aplicados.some(function (t) { return jaccardPalabras(n, t) >= 0.6; });
  });
}

// ── Puras: sugerencias «Del catálogo» (frases aprobadas de hallazgos) ──
// claves = HALLAZGOS_CONFIRMADOS + HALLAZGOS_PENDIENTES_SUGERIDOS. Usa
// conclusion_sugerida / recomendacion_sugerida del catálogo y salta las que
// tengan marcadores por sustituir («[AREA]», «[SUPERFICIE]»…): esas frases
// no están listas. El motivo visible es el nombre del hallazgo.
function _tieneMarcador(s) {
  return /\[[^\]\n]+\]/.test(s);
}

function sugerenciasDelCatalogo(claves, catalogo) {
  var porClave = {};
  (catalogo || []).forEach(function (h) { if (h && h.clave_api) porClave[h.clave_api] = h; });
  var out = { concl: [], rec: [] };
  var vistos = {};
  (claves || []).forEach(function (clave) {
    if (!clave || vistos[clave]) return;
    vistos[clave] = true;
    var h = porClave[clave];
    if (!h) return;
    var motivo = 'Hallazgo: ' + String(h.hallazgo || clave).trim();
    var c = String(h.conclusion_sugerida || '').trim();
    var r = String(h.recomendacion_sugerida || '').trim();
    if (c && !_tieneMarcador(c)) out.concl.push({ texto: c, motivo: motivo });
    if (r && !_tieneMarcador(r)) out.rec.push({ texto: r, motivo: motivo });
  });
  return out;
}

// ── Puras: revisión final — los dos mensajes (plan § «Revisión final») ──

// Datos de la visita que viajan en ambos mensajes: la misma forma compacta
// del DATOS de construirPromptF43, sin fotos ni campos internos.
function _datosVisitaParaRevision(d) {
  d = d || {};
  return JSON.stringify({
    fecha_visita: d.fecha_visita, direccion: d.direccion, barrio: d.barrio, comuna: d.comuna,
    catastral: d.catastral, radicado: d.radicado, es_diligencia: d.es_diligencia,
    sin_licencia: d.sin_licencia, estado_licencia: d.estado_licencia, num_res: d.num_res,
    fecha_ejec: d.fecha_ejec, tipo_tramite: d.tipo_tramite, modalidad: d.modalidad,
    titular: d.titular, area_apro: d.area_apro, pisos: d.pisos, sist: d.sist, dest: d.dest,
    cubierta: d.cubierta, curaduria: d.curaduria, areas: d.areas,
    comportamientos: d.comportamientos, sin_infraccion: d.sin_infraccion,
    conclusiones_inspector: d.conclusiones_inspector, clasificacion: d.clasificacion,
    requiere_licencia: d.requiere_licencia, requiere_detalle: d.requiere_detalle,
    polig_uso: d.polig_uso, polig_trat: d.polig_trat, franja: d.franja, proteccion: d.proteccion
  });
}

function _informeParaMensaje(informe) {
  informe = informe || {};
  return JSON.stringify({
    antecedentes: informe.antecedentes || '',
    observaciones: informe.observaciones || '',
    conclusiones: informe.conclusiones_items || [],
    recomendaciones: informe.recomendaciones_items || []
  });
}

// Bloques opcionales de los mensajes de revisión por secciones (2026-10-16):
// con `secciones`, la IA solo crítica lo que cambió; con `respuestasPrevias`,
// no vuelve a preguntar lo ya respondido.
function _bloqueSecciones(opts) {
  if (!opts || !opts.secciones || !opts.secciones.length) return '';
  return 'Revisa SOLO estas secciones: ' + opts.secciones.map(function (s) { return NOMBRES_SECCION[s] || s; }).join(', ')
    + '; las demás van como contexto, no las critiques ni propongas cambios en ellas.\n\n';
}
function _bloqueRespuestasPrevias(opts) {
  if (!opts || !opts.respuestasPrevias || !opts.respuestasPrevias.length) return '';
  var resp = opts.respuestasPrevias.filter(function (r) { return r && (r.respuesta || '').toString().trim(); })
    .map(function (r) { return { pregunta: r.pregunta || '', respuesta: String(r.respuesta).trim() }; });
  if (!resp.length) return '';
  return 'RESPUESTAS YA DADAS POR EL INSPECTOR (no vuelvas a preguntar esto):\n' + JSON.stringify(resp) + '\n\n';
}

// Mensaje 1: crítica + preguntas. Devuelve bien/falta/no_coincide/forma/preguntas.
function armarMensajeCritica(informe, d, opts) {
  return 'Eres el revisor técnico de la Inspección N.° 9 de Control Urbano de Bello. Revisa el borrador '
    + 'del informe F-GGO-43 contra los datos de la visita y devuelve SOLO JSON válido, sin texto previo ni markdown.\n\n'
    + 'DATOS DE LA VISITA (única fuente de hechos): ' + _datosVisitaParaRevision(d) + '\n\n'
    + 'INFORME COMPLETO EN REVISIÓN:\n' + _informeParaMensaje(informe) + '\n\n'
    + _bloqueSecciones(opts)
    + _bloqueRespuestasPrevias(opts)
    + 'JSON exacto requerido:\n'
    + '{"bien":[],"falta":[],"no_coincide":[],"forma":[],"preguntas":[{"pregunta":"","opciones":["",""]}]}\n\n'
    + 'REGLAS:\n'
    + '1. Cada punto cita la sección a la que se refiere: Antecedentes, Observaciones de campo, Conclusiones o Recomendaciones.\n'
    + '2. "bien": lo que está correcto y bien sustentado (frases cortas; puede ser una lista vacía).\n'
    + '3. "falta": hechos de los DATOS que sostienen una conclusión del informe y no aparecen en él.\n'
    + '4. "no_coincide": afirmaciones contrarias a los DATOS DE LA VISITA o contradictorias entre secciones del informe.\n'
    + '5. "forma": problemas de redacción u orden, MÁXIMO 4. Va siempre aquí la frase que deja la verificación para '
    + 'después ("deberá ser objeto de verificación", "deberán ser contrastadas con los documentos") o pone en duda lo que '
    + 'se vio ("aparentemente", "posible diferencia", "aproximadamente" con un conteo): la visita es la verificación.\n'
    + '6. "preguntas": SOLO cuando tengas una DUDA REAL que los DATOS DE LA VISITA y el informe no permiten resolver '
    + 'y cuya respuesta cambiaría el texto del informe. MÁXIMO 2, con 2 a 4 opciones cortas cada una. PROHIBIDO preguntar '
    + 'para confirmar un hecho que ya está en los DATOS o en el informe, preguntar sobre la forma, o volver a preguntar algo '
    + 'ya respondido. Si el problema se corrige con los DATOS, va en "falta" o "no_coincide" sin pregunta. Sin dudas reales, '
    + '"preguntas" va vacía.\n'
    + '7. No juzgues ni corrijas la decisión jurídica del inspector.\n'
    + '8. PROHIBIDO proponer plazos: los concede el Inspector de Policía.\n'
    + '9. Si el informe está bien, devuelve las cuatro listas vacías y sin preguntas.\n';
}

// Mensaje 2: correcciones. Solo lo que cambia, con informe + respuestas + datos.
function armarMensajeCorrecciones(informe, d, critica, respuestas, opts) {
  var resp = (respuestas || []).filter(function (r) { return r && (r.respuesta || '').toString().trim(); })
    .map(function (r) { return { pregunta: r.pregunta || '', respuesta: String(r.respuesta).trim() }; });
  return 'Eres el corrector técnico de la Inspección N.° 9 de Control Urbano de Bello. Corrige el borrador '
    + 'del informe F-GGO-43 con base en la revisión y las respuestas del inspector, y devuelve SOLO JSON válido.\n\n'
    + 'DATOS DE LA VISITA: ' + _datosVisitaParaRevision(d) + '\n\n'
    + 'INFORME COMPLETO (actual):\n' + _informeParaMensaje(informe) + '\n\n'
    + _bloqueSecciones(opts)
    + _bloqueRespuestasPrevias(opts)
    + 'REVISIÓN (crítica previa):\n' + JSON.stringify(critica || {}) + '\n\n'
    + (resp.length ? 'RESPUESTAS DEL INSPECTOR (hechos suyos, misma validez que los DATOS):\n' + JSON.stringify(resp) + '\n\n' : '')
    + 'JSON exacto requerido:\n'
    + '{"cambios":[{"seccion":"antecedentes|observaciones|conclusion|recomendacion","numero":N,"texto":"texto corregido completo"}]}\n\n'
    + 'REGLAS:\n'
    + '1. Corrige SOLO lo que cambia: un cambio por punto o sección que se modifique. "numero" es el ordinal del punto '
    + 'dentro de su sección (1 para Conclusiones/Recomendaciones); para Antecedentes y Observaciones entrega el texto '
    + 'completo corregido con numero 1.\n'
    + '2. Nada nuevo que no esté en el informe, las RESPUESTAS o los DATOS.\n'
    + '3. Corrige la forma señalada sin quitar hechos, cifras ni salvedades.\n'
    + '4. Conserva la cita literal del artículo 135 de la Ley 1801 de 2016 donde esté.\n'
    + '5. PROHIBIDA la palabra «infractor» y proponer plazos.\n'
    + '6. Recomendaciones en imperativo, dirigidas al propietario o responsable.\n';
}

// Cambios de la revisión → lista con el original al que reemplazan. Fuera los
// que no cambian nada y los que apuntan a un punto que no existe en la hoja.
// Con `secciones` (revisión parcial), fuera también los de otra sección.
function normalizarCambios(cambios, informe, secciones) {
  informe = informe || {};
  // La IA usa los nombres singulares del JSON; el sello, los plurales de A.
  var mapaSeccion = { antecedentes: 'antecedentes', observaciones: 'observaciones',
    conclusion: 'conclusiones', recomendacion: 'recomendaciones' };
  var permitidas = secciones ? secciones.map(function (s) { return mapaSeccion[s] || s; }) : null;
  var out = [];
  (cambios || []).forEach(function (c) {
    if (!c) return;
    var sec = String(c.seccion || '').trim().toLowerCase();
    var texto = String(c.texto || '').trim();
    if (!texto) return;
    if (permitidas && permitidas.indexOf(mapaSeccion[sec] || sec) < 0) return;
    var numero = parseInt(c.numero, 10) || 1;
    var original;
    if (sec === 'antecedentes') original = String(informe.antecedentes || '');
    else if (sec === 'observaciones') original = String(informe.observaciones || '');
    else if (sec === 'conclusion') original = (informe.conclusiones_items || [])[numero - 1];
    else if (sec === 'recomendacion') original = (informe.recomendaciones_items || [])[numero - 1];
    else return;
    if (original === undefined || original === null) return;
    original = String(original);
    if (!original.trim()) return; // el punto no existe: no se inventa
    if (original.trim() === texto) return; // sin cambio real
    out.push({ seccion: sec, numero: numero, original: original, texto: texto });
  });
  return out;
}

// Cada cambio debe pasar el validador en el contexto de su sección (se
// inyecta validarInformeIA para mantener la pureza en las pruebas).
function filtrarCambiosRevision(cambios, ctx, validar) {
  validar = validar || function () { return { ok: true, problemas: [] }; };
  return (cambios || []).filter(function (c) {
    var json;
    if (c.seccion === 'antecedentes') json = { antecedentes: c.texto, observaciones: '', conclusiones_items: [], recomendaciones_items: [] };
    else if (c.seccion === 'observaciones') json = { antecedentes: '', observaciones: c.texto, conclusiones_items: [], recomendaciones_items: [] };
    else if (c.seccion === 'conclusion') json = { antecedentes: '', observaciones: '', conclusiones_items: [c.texto], recomendaciones_items: [] };
    else json = { antecedentes: '', observaciones: '', conclusiones_items: [], recomendaciones_items: [c.texto] };
    return validar(json, ctx, { sinCantidades: true, sinCobertura: true }).ok;
  });
}

// Una corrección puede contradecir una casilla de la visita (el informe va
// en otra ventana y no puede cambiarla): el aviso se lo recuerda al inspector.
function avisoCasillaVisita(cambio, d) {
  d = d || {};
  var t = _normTexto(cambio && cambio.texto);
  if (!t) return '';
  if (d.sin_licencia && (t.indexOf('se aporto') >= 0 || t.indexOf('aporto licencia') >= 0 ||
      t.indexOf('licencia aportada') >= 0 || t.indexOf('licencia vigente') >= 0)) {
    return 'Corrige también la visita: en Verificación documental, «¿Se aportó licencia?» = NO.';
  }
  if (!d.sin_licencia && t.indexOf('no fue aportada ni exhibida') >= 0) {
    return 'Corrige también la visita: en Verificación documental, «¿Se aportó licencia?» = SI.';
  }
  // La negación también en voz pasiva: «no se requiere(n) licencia» (2026-10-17).
  var niega = /\bno (se )?requieren?\b/.test(t);
  if (d.requiere_licencia === 'SI' && niega) {
    return 'Corrige también la visita: en Verificación documental, «¿Las obras requieren licencia?» = SI.';
  }
  if (d.requiere_licencia === 'NO' && /requieren? licencia/.test(t) && !niega) {
    return 'Corrige también la visita: en Verificación documental, «¿Las obras requieren licencia?» = NO.';
  }
  return '';
}

// Huella del informe completo (reutiliza huellaRevision de utils.js, inyectada
// para seguir siendo puro en node). Cualquier edición posterior la vence.
function huellaInforme(informe, huellaFn) {
  huellaFn = huellaFn || function () { return ''; };
  var i = informe || {};
  return huellaFn(i.antecedentes || '', i.observaciones || '',
    (i.conclusiones_items || []).join('\n\n'), (i.recomendaciones_items || []).join('\n\n'));
}

function revisionInformeVigente(rev, informe, huellaFn) {
  return seccionesCambiadas(rev, informe, huellaFn).length === 0;
}

// ── Puras: revisión por secciones (2026-10-16) ──────────────────────
// La revisión ya no es una huella única de todo el informe: cada sección
// guarda la huella de su texto la última vez que se revisó. Lo que no
// cambió no se vuelve a revisar (decisión del usuario).

var SECCIONES_REVISION = ['antecedentes', 'observaciones', 'conclusiones', 'recomendaciones'];
var NOMBRES_SECCION = {
  antecedentes: 'Antecedentes', observaciones: 'Observaciones',
  conclusiones: 'Conclusiones', recomendaciones: 'Recomendaciones'
};

// FNV-1a propio (mismo algoritmo que huellaRevision de utils.js) para no
// depender de utils.js en node. Una sección vacía tiene la huella de ''.
function _hashSeccion(s) {
  var h = 0x811c9dc5;
  s = String(s || '');
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

function huellasSecciones(informe) {
  var inf = informe || {};
  return {
    antecedentes: _hashSeccion(_normTexto(inf.antecedentes || '')),
    observaciones: _hashSeccion(_normTexto(inf.observaciones || '')),
    conclusiones: _hashSeccion((inf.conclusiones_items || []).map(_normTexto).filter(Boolean).join('\n')),
    recomendaciones: _hashSeccion((inf.recomendaciones_items || []).map(_normTexto).filter(Boolean).join('\n'))
  };
}

// Secciones cuya huella en el sello falta o difiere. Sin sello: las 4.
// Sello viejo (solo huella completa): la comparación de hoy — vigente → [],
// vencido → las 4.
function seccionesCambiadas(rev, informe, huellaFn) {
  if (!rev) return SECCIONES_REVISION.slice();
  if (!rev.secciones) {
    return (rev.huella && rev.huella === huellaInforme(informe, huellaFn))
      ? [] : SECCIONES_REVISION.slice();
  }
  var actuales = huellasSecciones(informe);
  return SECCIONES_REVISION.filter(function (s) { return rev.secciones[s] !== actuales[s]; });
}

// Sello inicial (C): hereda la revisión de la visita. Devuelve el objeto
// `secciones` SOLO con las que nacen revisadas (las demás quedan pendientes).
// origen = { observaciones, conclusiones: [puntos], antecedentes, aprobadas: [frases] }.
function selloInicialSecciones(informe, origen) {
  var inf = informe || {};
  origen = origen || {};
  var actuales = huellasSecciones(inf);
  var aprobadas = (origen.aprobadas || []).map(_normTexto).filter(Boolean);
  function igual(texto, origenTexto) {
    if (!String(texto || '').trim()) return true; // vacía nace revisada
    return _normTexto(texto) === _normTexto(origenTexto || '');
  }
  function todosAprobados(items, extra) {
    var normas = (extra || []).map(_normTexto).filter(Boolean).concat(aprobadas);
    return (items || []).every(function (t) {
      if (!String(t || '').trim()) return true;
      return normas.indexOf(_normTexto(t)) >= 0;
    });
  }
  var out = {};
  if (igual(inf.observaciones, origen.observaciones)) out.observaciones = actuales.observaciones;
  if (igual(inf.antecedentes, origen.antecedentes)) out.antecedentes = actuales.antecedentes;
  if (todosAprobados(inf.conclusiones_items, origen.conclusiones)) out.conclusiones = actuales.conclusiones;
  if (todosAprobados(inf.recomendaciones_items, [])) out.recomendaciones = actuales.recomendaciones;
  return out;
}

// Quita las preguntas que ya fueron respondidas en una revisión anterior
// (Jaccard ≥ 0,5 con la pregunta de alguna respuesta guardada).
// Dos preguntas son «la misma» si comparten las palabras con contenido (más de
// 3 letras): con todas las palabras, «¿El muro está en el antejardín?» y «¿El
// muro está en el retiro?» daban 0,71 y la segunda se perdía como repetida.
function preguntaParecida(a, b) {
  function palabras(s) {
    var set = {};
    _normTexto(s).split(' ').forEach(function (w) { if (w.length > 3) set[w] = true; });
    return Object.keys(set);
  }
  var A = palabras(a), B = palabras(b);
  if (!A.length || !B.length) return false;
  var inter = A.filter(function (w) { return B.indexOf(w) >= 0; }).length;
  return inter / (A.length + B.length - inter) >= 0.6;
}
function filtrarPreguntasRepetidas(preguntas, revResp) {
  return (preguntas || []).filter(function (p) {
    return !(revResp || []).some(function (r) {
      return r && (r.respuesta || '').toString().trim() && preguntaParecida(p.pregunta, r.pregunta);
    });
  });
}

// Acumula respuestas entre revisiones: una nueva reemplaza a la guardada si
// le preguntan lo mismo (Jaccard ≥ 0,5). Tope 20, las más recientes.
function acumularRespuestas(revResp, nuevas) {
  var out = (revResp || []).slice();
  (nuevas || []).forEach(function (n) {
    if (!n || !(n.respuesta || '').toString().trim()) return;
    var idx = -1;
    for (var i = 0; i < out.length; i++) {
      if (preguntaParecida(n.pregunta, out[i].pregunta)) { idx = i; break; }
    }
    if (idx >= 0) out[idx] = n; else out.push(n);
  });
  return out.length > 20 ? out.slice(out.length - 20) : out;
}

// Condición de «Generar Word»: validador limpio + cierre grave cuando hay
// comportamientos marcados + revisión vigente. `huboRevision` distingue
// «falta revisar» de «revisión vencida». `tipo` dice cómo pintarlo:
// 'problema' es algo del texto que hay que corregir (bloqueo en rojo, con
// «Ver dónde»); 'revision' solo pide revisar.
// Los problemas van ANTES que la revisión (2026-10-16): corregirlos cambia el
// texto y vence la revisión, así que pedir revisar primero obligaba a revisar
// dos veces. `avisos` (redacción) viajan tal cual: se pintan pero no bloquean.
function condicionGenerarWord(o) {
  var problemas = (o.problemas || []).slice();
  var avisos = (o.avisos || []).slice();
  if (o.requiereCierre && !o.tieneCierre) problemas.push('Con comportamientos marcados falta la frase de cierre grave.');
  // Sin observaciones no hay informe: antes decía «Todo listo para generar» (revisión 2026-10-28).
  if (o.observacionesVacias) problemas.unshift('Faltan las observaciones de la visita.');
  if (problemas.length) return { ok: false, tipo: 'problema', motivo: problemas[0], problemas: problemas, avisos: avisos };
  if (!o.vigente) return { ok: false, tipo: 'revision', motivo: o.huboRevision ? 'Revisión vencida: vuelve a revisar' : 'Falta la revisión final', avisos: avisos };
  return { ok: true, motivo: '', avisos: avisos };
}

// Dónde buscar en el documento un problema del validador: la sección
// (antecedentes · obs · concl · rec), el punto si el mensaje lo nombra
// («Recomendacion 2 usa…») y la frase citada entre comillas tal como la
// compara el validador (minúscula, sin tildes). Sin pista: seccion null.
function ubicarProblema(problema) {
  var p = String(problema || '');
  var pn = _normTexto(p);
  var mFrase = /"([^"]+)"/.exec(p);
  var r = { seccion: null, numero: null, frase: mFrase ? _normTexto(mFrase[1]) : '' };
  var mRec = /^recomendacion (\d+)\b/.exec(pn);
  if (mRec) { r.seccion = 'rec'; r.numero = parseInt(mRec[1], 10); return r; }
  if (/^las observaciones de campo|^observaciones\b/.test(pn)) { r.seccion = 'obs'; return r; }
  if (/^conclusiones recomendaciones\b/.test(pn)) { r.seccion = 'concl-rec'; return r; }
  if (/^la conclusion\b/.test(pn)) { r.seccion = 'concl'; return r; }
  if (r.frase) return r; // se busca en todo el documento
  if (/\bconclusion/.test(pn) || /cierre grave/.test(pn)) r.seccion = 'concl';
  else if (/\brecomendacion/.test(pn)) r.seccion = 'rec';
  return r;
}

// ── Export (patrón de utils.js) / arranque solo en modo documento ────

var _export = {
  detectarOrigenAntecedentes: detectarOrigenAntecedentes,
  fraseAntecedentes: fraseAntecedentes,
  dividirPuntos: dividirPuntos,
  quitarNumeracion: quitarNumeracion,
  ubicarProblema: ubicarProblema,
  sugerenciasConclusionesDeLaVisita: sugerenciasConclusionesDeLaVisita,
  sugerenciasRequiereLicencia: sugerenciasRequiereLicencia,
  sugerenciasRecomendacionesDeLaVisita: sugerenciasRecomendacionesDeLaVisita,
  jaccardPalabras: jaccardPalabras,
  quitarDuplicados: quitarDuplicados,
  sugerenciasDelCatalogo: sugerenciasDelCatalogo,
  armarMensajeCritica: armarMensajeCritica,
  armarMensajeCorrecciones: armarMensajeCorrecciones,
  normalizarCambios: normalizarCambios,
  filtrarCambiosRevision: filtrarCambiosRevision,
  avisoCasillaVisita: avisoCasillaVisita,
  huellaInforme: huellaInforme,
  revisionInformeVigente: revisionInformeVigente,
  condicionGenerarWord: condicionGenerarWord,
  SECCIONES_REVISION: SECCIONES_REVISION,
  huellasSecciones: huellasSecciones,
  seccionesCambiadas: seccionesCambiadas,
  selloInicialSecciones: selloInicialSecciones,
  filtrarPreguntasRepetidas: filtrarPreguntasRepetidas,
  acumularRespuestas: acumularRespuestas
};
if (typeof module !== 'undefined' && module.exports) { module.exports = _export; return; }
if (typeof document === 'undefined' || typeof UI_MODE === 'undefined' || UI_MODE !== 'doc') return;

// ═══════════════════════════════════════════════════════════════
// Modo documento. Todo lo de abajo toca DOM del generador.
// ═══════════════════════════════════════════════════════════════

function _esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _el(id) { return document.getElementById(id); }

function _fechaCorta(iso) {
  var p = String(iso || '').split('-');
  return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : (iso || '');
}

// Purga de borradores del editor con más de 7 días — mismo criterio del
// init del generador (que solo conoce fggo43_datos_/fggo43_borrador_ia_).
function _purgarBorradoresEditor() {
  try {
    var limite = Date.now() - 7 * 24 * 60 * 60 * 1000, borrar = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || k.indexOf('fggo43_editor_') !== 0) continue;
      try {
        var obj = JSON.parse(localStorage.getItem(k) || '{}');
        if (!obj || typeof obj._ts !== 'number' || obj._ts < limite) borrar.push(k);
      } catch (e) { borrar.push(k); }
    }
    borrar.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
  } catch (e) { /* localStorage no disponible: silencio */ }
}

// Clave por-visita (patrón de _storageKeyBorrador).
function _claveEditor() {
  return 'fggo43_editor_' + (V6_CTX.fila || _idEfimeroInforme());
}

document.body.classList.add('modo-doc');
_purgarBorradoresEditor();

var _ctx = recolectarDatosWizard();
var _d = _ctx.d;
// recolectarDatosWizard() no trae el radicado (vive en V6_CTX): sin esto los
// antecedentes salían sin número y un OFICIO-… nunca se detectaba como oficio.
_d.radicado = _d.radicado || V6_CTX.radicado || '';

var _borrador = null, _propuesta = null, _revSello = null, _revResp = [];
try { _borrador = JSON.parse(localStorage.getItem(_claveEditor()) || 'null'); } catch (e) {}
if (!_borrador || !_borrador._ts || !_borrador.antecedentes) _borrador = null;
// Ronda 2: la última «Propuesta» (para no volver a pedirla) y el sello de la
// revisión (por secciones: heredado de la visita o de la última revisión;
// lo que no cambió no se vuelve a revisar). `_revResp`: respuestas dadas a
// las preguntas de revisiones anteriores, para no repetirlas.
if (_borrador) {
  _propuesta = _borrador.propuesta || null;
  _revSello = _borrador.rev || null;
  _revResp = Array.isArray(_borrador.revResp) ? _borrador.revResp : [];
}

// Borrador en el servidor (2026-10-15, [SEC:BorradorInforme] del backend):
// lo diligenciado no se pierde al cambiar de equipo. `version` es la última
// guardada que conoce este equipo; `cargado` = ya se leyó el servidor (antes
// no se sube nada, para no pisar lo guardado desde otro equipo).
var _srv = { version: (_borrador && _borrador._srvVersion) || 0, estado: '', hora: '', pendiente: false, cargado: false };
var _guardadoTxt = '';
// Lo que no deja generar (_pintarBloqueos): [{ texto, loc: { el, inicio, fin } | null }]
// y los avisos en línea pintados [{ el, texto, nodo }].
var _bloqueos = [], _notasBloqueo = [];
// Avisos de redacción (no bloquean): mismo formato que _bloqueos, solo para
// el «Ver dónde» de la nota bajo «Generar Word».
var _avisos = [];
// Word ya generado (_pintarAbrirWord).
var _linkWord = _linkGoogle(_SESION_QS.get('linkInforme'));
var _fotosQuitadas = (_borrador && _borrador.fotos && _borrador.fotos.quitadas) || [];
var _fotosPendientes = null, _aplicandoFotos = false;
var _qgis = { id: '', base64: '', mime: '' }, _qgisSubiendo = false;
// Huella de lo que trajo la visita: si cambia después de empezar el informe, se avisa.
// Los chips, con el nombre anterior al 2026-10-29 (chipsConNombreSellado,
// utils.js): renombrarlos no es un cambio de la visita.
var _huellaVisitaActual = _hashTexto(['observaciones', 'conclusiones', 'infraccion', 'areas', 'seAportoLicencia',
  'requiereLicencia', 'requiereDetalle'].map(function (k) {
    var v = _SESION_QS.get(k) || '';
    return k === 'infraccion' && typeof chipsConNombreSellado === 'function' ? chipsConNombreSellado(v) : v;
  }).join('\u0001'));
var _baseVisita = (_borrador && _borrador.baseVisita) || _huellaVisitaActual;
function _hashTexto(s) {
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

// El mapa del generador se repinta aquí envolviendo setLocPreview. La captura
// QGIS guardada manda sobre el mapa automático que se genera al abrir.
var _setLocPreviewOrig = window.setLocPreview;
window.setLocPreview = function (dataUrl, fuenteLabel) {
  if (!dataUrl && !locImg.fuente && _qgis.id) {
    // «Volver al mapa automático»: se olvida la captura.
    _qgis = { id: '', base64: '', mime: '' };
    _programarGuardar();
  } else if (_qgis.id && _qgis.base64 && locImg.fuente !== 'qgis') {
    _ponerQgis();
    return;
  }
  _setLocPreviewOrig(dataUrl, fuenteLabel);
  _pintarMapa();
  if (locImg.fuente === 'qgis' && locImg.base64 && locImg.base64 !== _qgis.base64) _subirQgis();
};

// ── Contenedor ───────────────────────────────────────────────────────
var root = document.createElement('div');
root.id = 'ed-root';
root.innerHTML =
  '<header class="ed-top">' +
    '<div class="ed-tit"><b>Informe de inspección</b><span id="ed-sub"></span></div>' +
    '<div class="ed-top-acc">' +
      '<a class="ed-btn ed-btn-neutro ed-btn-abrir" id="ed-abrir-top" target="_blank" rel="noopener" hidden>Abrir Word</a>' +
      '<button type="button" class="ed-btn ed-btn-lleno" id="ed-gen" disabled>Generar Word</button>' +
    '</div>' +
  '</header>' +
  '<div class="ed-error" id="ed-error" hidden></div>' +
  '<div class="ed-aviso" id="ed-aviso" hidden></div>' +
  '<div class="ed-aviso" id="ed-aviso-visita" hidden></div>' +
  '<main class="ed-shell">' +
    '<article class="ed-hoja" aria-label="Informe F-GGO-43">' +
      '<div class="ed-membrete">' +
        '<div class="ed-m-logo">Escudo</div>' +
        '<div class="ed-m-tit">INFORME TÉCNICO DE VIGILANCIA Y CONTROL</div>' +
        '<div class="ed-m-iso">ICONTEC · IQNET<br>ISO 9001</div>' +
      '</div>' +
      '<div class="ed-ui ed-ui-fecha"><label for="ed-fecha">Fecha del informe</label><input type="date" id="ed-fecha"></div>' +
      '<div id="ed-fecha-linea"></div>' +
      '<div class="ed-dep">SECRETARÍA DE SEGURIDAD Y CONVIVENCIA CIUDADANA<br>SUBSECRETARÍA DE GOBERNABILIDAD<br>INSPECCIÓN N.° 9 DE CONVIVENCIA CON FUNCIONES DE CONTROL URBANO</div>' +

      '<div class="ed-h">Antecedentes.</div>' +
      '<div class="ed-ui">' +
        '<label for="ed-origen">Origen</label>' +
        '<select id="ed-origen">' +
          '<option value="pqr">PQR radicada</option>' +
          '<option value="oficio">Oficio</option>' +
          '<option value="diligencia">Diligencia decretada en audiencia</option>' +
        '</select>' +
        '<span class="ed-ui-nota">Armado con los datos de la visita; edítalo en su lugar.</span>' +
      '</div>' +
      '<div class="ed-ed" contenteditable="true" id="ed-antecedentes"></div>' +

      '<div class="ed-h">Localización.</div>' +
      '<div class="ed-mapa" id="ed-mapa">Generando mapa…</div>' +
      '<div class="ed-pie" id="ed-mapa-pie"></div>' +
      '<div class="ed-ui" id="ed-mapa-acc"></div>' +

      '<div class="ed-h">Observaciones de campo.</div>' +
      '<div class="ed-ui"><span class="ed-ui-nota">Sin límite de largo. Lo que cambies aquí se revisa al final.</span></div>' +
      '<div class="ed-ed" contenteditable="true" id="ed-obs"></div>' +

      '<div class="ed-h">Resumen de lo aprobado por curaduría.</div>' +
      '<div class="ed-ui"><span class="ed-chip ed-chip-neutro">Solo lectura · se corrige en la visita</span></div>' +
      '<div id="ed-licencia"></div>' +

      '<div class="ed-h">Verificación de obligaciones — art. 135, literales C y D.</div>' +
      '<div id="ed-art135"></div>' +

      '<div class="ed-h">Registro fotográfico.</div>' +
      '<div class="ed-ui"><span class="ed-chip ed-chip-neutro" id="ed-fotos-n"></span><span class="ed-ui-nota">Los pies son los del registro; edítalos, quita o reordena.</span></div>' +
      '<div class="ed-fotos" id="ed-fotos"></div>' +

      '<div class="ed-h">Conclusiones.</div>' +
      '<div id="ed-concl-cab"></div>' +
      '<div class="ed-ui"><span class="ed-chip ed-chip-ok">Tus conclusiones de la visita</span></div>' +
      '<ol class="ed-lista" id="ed-concl"></ol>' +
      '<button type="button" class="ed-agregar" data-ed-agregar="ed-concl">+ Agregar otra</button>' +
      '<div class="ed-sug" id="ed-sug-concl"></div>' +

      '<div class="ed-h">Recomendaciones.</div>' +
      '<ol class="ed-lista" id="ed-rec"></ol>' +
      '<button type="button" class="ed-agregar" data-ed-agregar="ed-rec">+ Agregar otra</button>' +
      '<div class="ed-sug" id="ed-sug-rec"></div>' +

      '<div class="ed-firma">' +
        '<p>Atentamente,</p>' +
        '<div class="ed-firma-cols">' +
          '<div class="ed-firma-col" id="ed-firma-ins"><label for="inspector">Inspector que firma</label></div>' +
          '<div class="ed-firma-col" id="ed-firma-cargo"><label for="cargo">Cargo</label></div>' +
        '</div>' +
      '</div>' +
    '</article>' +
    '<aside class="ed-rail" aria-label="Estado del informe">' +
      '<div class="ed-panel">' +
        '<h2>Estado del informe</h2>' +
        '<div class="ed-guardado" id="ed-guardado" aria-live="polite"></div>' +
        '<ul class="ed-est" id="ed-est"></ul>' +
        '<button type="button" class="ed-btn ed-btn-tinte" id="ed-revisar">Revisar informe</button>' +
        '<button type="button" class="ed-btn ed-btn-lleno" id="ed-gen-rail" disabled>Generar Word</button>' +
        '<div class="ed-nota" id="ed-gen-nota" aria-live="polite"></div>' +
        '<a class="ed-btn ed-btn-neutro ed-btn-abrir" id="ed-abrir" target="_blank" rel="noopener" hidden>Abrir el Word generado</a>' +
      '</div>' +
    '</aside>' +
  '</main>' +
  '<div class="ed-barra" id="ed-barra">' +
    '<div class="ed-barra-txt" id="ed-barra-txt"></div>' +
    '<button type="button" class="ed-btn ed-btn-tinte" id="ed-revisar-movil">Revisar</button>' +
    // <1200 la cabecera oculta sus botones: sin este, en el celular no había cómo generar.
    '<button type="button" class="ed-btn ed-btn-lleno" id="ed-gen-movil" disabled>Generar Word</button>' +
    '<a class="ed-btn ed-btn-neutro ed-btn-abrir" id="ed-abrir-movil" target="_blank" rel="noopener" hidden>Abrir Word</a>' +
  '</div>' +
  '<div class="ed-modal" id="ed-modal" hidden></div>';
document.body.appendChild(root);

// La firma reutiliza el select inspector y el input cargo del asistente
// (cargarInspectoresDesdeBD y el prefill siguen funcionando por id).
(function () {
  var selIns = _el('inspector'), cargoEl = _el('cargo');
  if (selIns) _el('ed-firma-ins').appendChild(selIns);
  if (cargoEl) _el('ed-firma-cargo').appendChild(cargoEl);
})();

// ── Encabezado: subtítulo y fecha del informe ────────────────────────
(function () {
  var sub = [];
  if (V6_CTX.radicado) sub.push('RAD ' + V6_CTX.radicado);
  if (_d.direccion) sub.push(_d.direccion);
  if (_d.barrio) sub.push(_d.barrio);
  if (_d.fecha_visita) sub.push('Visita ' + _fechaCorta(_d.fecha_visita));
  _el('ed-sub').textContent = sub.join(' · ');

  var edFecha = _el('ed-fecha');
  edFecha.value = gv('fechaInforme');
  function pintarLinea() {
    _el('ed-fecha-linea').textContent = 'Bello, ' + fmtFecha(edFecha.value);
  }
  edFecha.addEventListener('change', function () {
    _el('fechaInforme').value = edFecha.value;
    guardar && guardar();
    pintarLinea();
  });
  pintarLinea();
})();

// ── Antecedentes ─────────────────────────────────────────────────────
// El origen también marca la casilla interna «diligencia decretada en
// audiencia»: la leen el prompt, el validador y la revisión (d.es_diligencia).
function _sincronizarDiligencia(origen) {
  var ch = _el('esDiligencia');
  if (ch) ch.checked = (origen === 'diligencia');
  _d.es_diligencia = (origen === 'diligencia');
}
(function () {
  var origenInicial = (_borrador && _borrador.origen) || detectarOrigenAntecedentes(_d);
  _el('ed-origen').value = origenInicial;
  _sincronizarDiligencia(origenInicial);
  _el('ed-antecedentes').textContent = (_borrador && _borrador.antecedentes) || fraseAntecedentes(_d, origenInicial);
  // Cambiar el origen re-arma la frase («cambia el origen», plan).
  _el('ed-origen').addEventListener('change', function () {
    _sincronizarDiligencia(_el('ed-origen').value);
    _el('ed-antecedentes').textContent = fraseAntecedentes(_d, _el('ed-origen').value);
    _programarGuardar();
    _el('ed-antecedentes').focus();
  });
})();

// ── Observaciones: el texto de la visita, editable y sin tope ────────
_el('ed-obs').textContent = (_borrador && _borrador.obs) || (_d.obs || '');

// ── Mapa ─────────────────────────────────────────────────────────────
function _pintarMapa() {
  var caja = _el('ed-mapa');
  if (!caja) return;
  if (locImg.base64) {
    caja.innerHTML = '';
    var img = document.createElement('img');
    img.src = 'data:' + (locImg.mimeType || 'image/png') + ';base64,' + locImg.base64;
    img.alt = 'Localización de la edificación';
    caja.appendChild(img);
    _el('ed-mapa-pie').textContent = 'Imagen 1. Localización de la edificación. (Imagen tomada de ' + (locImg.fuente === 'qgis' ? 'QGIS' : 'Google Maps') + ')';
  } else {
    caja.textContent = (V6_CTX.lat || V6_CTX.lon || gv('direccion')) ? 'Generando mapa…' : 'Sin imagen de localización (la visita no trae dirección ni coordenadas).';
    _el('ed-mapa-pie').textContent = '';
  }
}
_pintarMapa();

// Captura QGIS: el botón y «Volver al mapa automático» del asistente.
(function () {
  var acc = _el('ed-mapa-acc');
  var input = _el('input-loc-qgis'), restaurar = _el('btn-loc-restaurar');
  if (!acc || !input) return;
  var lab = input.closest('label');
  if (lab) { lab.textContent = 'Reemplazar por captura QGIS'; lab.appendChild(input); acc.appendChild(lab); }
  if (restaurar) acc.appendChild(restaurar);
})();

// ── Licencia y POT: lo de la visita en solo lectura ──────────────────
// Solo dos campos editables, que la visita no captura: fecha de ejecutoria
// y vigencia (enlazados a los #fechaEjec / #vigenciaLic del asistente
// oculto, que son los que alimentan sugerencias y Word).
function _fechaEjecISO() {
  var v = String(gv('fechaEjec') || '').trim();
  var m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(v);
  if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

function _pintarLicencia(d) {
  var el = _el('ed-licencia');
  var aporto = V6_CTX.seAportoLicencia;
  if (!aporto) {
    el.innerHTML = '<div class="ed-nota-bloque">La visita no dice si se aportó licencia. Corrígelo en la visita y vuelve a abrir el informe.</div>';
    return;
  }
  if (aporto === 'NO' || d.sin_licencia) {
    el.innerHTML = '<div class="ed-nota-bloque">No se aportó licencia: este cuadro no va en el informe.</div>';
    return;
  }
  var tts = [], mods = [];
  document.querySelectorAll('.tt-chk:checked').forEach(function (c) { tts.push(c.value); });
  document.querySelectorAll('.mod-chk:checked').forEach(function (c) { mods.push(c.value); });
  var filas = [
    ['N.º de resolución', d.num_res],
    ['Fecha de expedición', V6_CTX.fechaExpedicion ? _fechaCorta(V6_CTX.fechaExpedicion) : ''],
    ['Tipo de trámite', tts.join(', ')],
    ['Modalidad', mods.join(', ')],
    ['Titular', d.titular],
    ['Pisos aprobados', d.pisos],
    ['Área aprobada (m²)', d.area_apro],
    ['Sistema estructural', d.sist],
    ['Destinaciones aprobadas', d.dest],
    ['Cubierta aprobada', d.cubierta],
    ['Curaduría', d.curaduria]
  ].filter(function (f) { return (f[1] || '').toString().trim(); });
  if ((V6_CTX.obsLicencia || '').trim()) {
    filas.push(['Observaciones de la licencia', V6_CTX.obsLicencia.trim()]);
  }
  var html = filas.length
    ? '<table class="ed-tabla">' + filas.map(function (f) {
        return '<tr><th>' + _esc(f[0]) + '</th><td>' + _esc(f[1]) + '</td></tr>';
      }).join('') + '</table>'
    : '';
  html +=
    '<div class="ed-ui"><label for="ed-lic-fejec">Fecha de ejecutoria</label>' +
      '<input type="date" id="ed-lic-fejec"><span class="ed-ui-nota">La visita trae la fecha de expedición; la ejecutoria se escribe aquí.</span></div>' +
    '<div class="ed-ui"><label for="ed-lic-vig">Vigencia a la fecha de la visita</label>' +
      '<select id="ed-lic-vig"><option value="">Sin verificar</option><option value="VIGENTE">Vigente</option><option value="VENCIDA">Vencida</option></select></div>';
  var faltan = [];
  if (!V6_CTX.fechaExpedicion) faltan.push('fecha de expedición');
  if (!tts.length) faltan.push('tipo de trámite');
  if (!(d.titular || '').toString().trim()) faltan.push('titular');
  if (!(d.area_apro || '').toString().trim()) faltan.push('área aprobada');
  if (!(d.curaduria || '').toString().trim()) faltan.push('curaduría');
  if (faltan.length) {
    html += '<div class="ed-nota-bloque">Falta en la visita: ' + _esc(faltan.join(', ')) + '. Corrígelo en la visita y vuelve a abrir el informe.</div>';
  }
  el.innerHTML = html;

  var fe = _el('ed-lic-fejec');
  fe.value = _fechaEjecISO();
  fe.addEventListener('change', function () {
    var p = fe.value.split('-');
    _el('fechaEjec').value = p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : '';
    sugerirVigenciaLic();
    _el('ed-lic-vig').value = gv('vigenciaLic') || '';
    _pintarSugerencias();
  });
  var vg = _el('ed-lic-vig');
  vg.value = gv('vigenciaLic') || '';
  vg.addEventListener('change', function () {
    var sel = _el('vigenciaLic');
    sel.value = vg.value;
    sel.dataset.auto = '';
    _pintarSugerencias();
  });
}
_pintarLicencia(_d);

// ── Verificación art. 135, literales C y D (bloque opcional del Word) ──
// Se trae al documento la casilla y la tabla del asistente (mismos ids:
// la generación del Word las sigue leyendo). Al activarla, las filas de los
// comportamientos C/D marcados en la visita arrancan en «No cumple».
var ART135_FILAS = ['C9', 'C10', 'C11', 'C12', 'D13', 'D14', 'D15', 'D16', 'D17', 'D18',
  'D19', 'D20', 'D21', 'D22', 'D23', 'D24'];
function _filasArt135() {
  return Array.prototype.filter.call(document.querySelectorAll('#art-table tbody tr'), function (tr) {
    return !tr.classList.contains('cbrow');
  });
}
(function () {
  var caja = _el('ed-art135');
  var chk = _el('incluirArt'), tabla = _el('art-table');
  if (!caja || !chk || !tabla) return;
  caja.innerHTML = '<div class="ed-ui"><span class="ed-ui-nota">Solo en proyectos que lo necesiten, ' +
    'especialmente de más de 2.000 m².</span></div>';
  caja.appendChild(chk.closest('label') || chk);
  caja.appendChild(tabla);
  chk.addEventListener('change', function () {
    if (!chk.checked) return;
    var marcados = {};
    (recolectarDatosWizard().d.comportamientos || []).forEach(function (c) {
      var m = /^([CD])(\d{1,2})/.exec(c);
      if (m) marcados[m[1] + parseInt(m[2], 10)] = true;
    });
    _filasArt135().forEach(function (tr, i) {
      var c = tr.querySelector('.sel-c'), nc = tr.querySelector('.sel-nc');
      if (marcados[ART135_FILAS[i]] && c && nc && !c.value && !nc.value) nc.value = 'Si';
    });
  });
})();

(function () {
  var pot = [
    ['Clasificación general del suelo', _d.clasificacion],
    ['Polígono uso del suelo', _d.polig_uso],
    ['Polígono de tratamiento', _d.polig_trat],
    ['Franja de intensidad', _d.franja],
    ['Suelo de protección o amenaza', _d.proteccion]
  ].filter(function (f) { return (f[1] || '').toString().trim(); });
  var html = '<div class="ed-sololectura"><p>Acorde con lo establecido en el Plan de Ordenamiento Territorial Acuerdo 033 de 2009, la ubicación del predio posee la siguiente normatividad:</p></div>';
  // Completa desde la visita: solo lectura. Si falta algún dato (visita sin
  // GPS o sin consulta POT), se escriben aquí con los campos del asistente.
  var editable = pot.length < 5;
  if (pot.length && !editable) {
    html += '<table class="ed-tabla ed-tabla-pot"><caption>CONSULTA NORMA DEL PREDIO SEGÚN POT</caption>' +
      pot.map(function (f) { return '<tr><th>' + _esc(f[0]) + '</th><td>' + _esc(f[1]) + '</td></tr>'; }).join('') + '</table>';
  }
  if (editable) {
    html += '<div class="ed-nota-bloque">La visita no trajo la norma POT completa: complétala aquí.</div><div id="ed-pot-campos"></div>';
  }
  html += '<div class="ed-sololectura"><p>' + _esc(_construirConclusionIntro(_d)) + '</p></div>';
  _el('ed-concl-cab').innerHTML = html;
  var campos = editable && document.querySelector('#card-pot .fg');
  if (campos) _el('ed-pot-campos').appendChild(campos);
})();

// ── Registro fotográfico: espejo de #fotos-list ──────────────────────
function _fotosAsistentes() {
  return document.querySelectorAll('#fotos-list > div[id^="foto-"]');
}
function _nFotosConPie() {
  var n = 0;
  Array.prototype.forEach.call(_fotosAsistentes(), function (div) {
    var desc = _el('desc-' + div.id);
    if (desc && desc.value.trim()) n++;
  });
  return n;
}
function _pintarFotos() {
  var grid = _el('ed-fotos');
  if (!grid) return;
  // Las fotos llegan de Drive después de abrir: el orden, los pies y las
  // quitadas del borrador se aplican apenas están.
  if (_fotosPendientes && !_aplicandoFotos && _fotosAsistentes().length) { _aplicarFotos(_fotosPendientes); return; }
  grid.innerHTML = '';
  var tarjetas = _fotosAsistentes();
  Array.prototype.forEach.call(tarjetas, function (div, i) {
    var n = i + 1;
    var url = (_el('url-' + div.id) || {}).value || '';
    var descEl = _el('desc-' + div.id);
    var desc = descEl ? descEl.value : '';

    var fig = document.createElement('figure');
    fig.className = 'ed-foto';
    // El número va encima de la miniatura a propósito: sin señal la celda
    // debe seguir diciendo cuántas hay (misma regla de nueva-visita).
    var num = document.createElement('div');
    num.className = 'ed-foto-n';
    num.textContent = String(n);
    var imgBox = document.createElement('div');
    imgBox.className = 'ed-foto-img';
    if (url) {
      var img = document.createElement('img');
      img.src = url;
      img.alt = 'Foto ' + n;
      img.loading = 'lazy';
      img.onerror = function () { imgBox.textContent = String(n); };
      imgBox.appendChild(img);
    } else {
      imgBox.textContent = String(n);
    }
    var pie = document.createElement('div');
    pie.className = 'ed-ed ed-foto-pie';
    pie.setAttribute('contenteditable', 'true');
    pie.textContent = desc ? ('Fotografía ' + n + '. ' + desc) : '';
    pie.addEventListener('input', function () {
      if (!descEl) return;
      var t = pie.textContent;
      var prefijo = 'Fotografía ' + n + '. ';
      if (t.indexOf(prefijo) === 0) t = t.slice(prefijo.length);
      descEl.value = t.trim();
      _pintarEstado();
    });
    var acc = document.createElement('div');
    acc.className = 'ed-foto-acc';
    acc.innerHTML =
      '<button type="button" class="ed-ico" data-ed-foto="' + div.id + '" data-ed-dir="arriba" aria-label="Subir foto" title="Subir">↑</button>' +
      '<button type="button" class="ed-ico" data-ed-foto="' + div.id + '" data-ed-dir="abajo" aria-label="Bajar foto" title="Bajar">↓</button>' +
      '<button type="button" class="ed-ico" data-ed-foto="' + div.id + '" data-ed-dir="quitar" aria-label="Quitar foto" title="Quitar del informe">✕</button>';
    fig.appendChild(num);
    fig.appendChild(imgBox);
    fig.appendChild(pie);
    fig.appendChild(acc);
    grid.appendChild(fig);
  });
  var total = tarjetas.length, conPie = _nFotosConPie();
  _el('ed-fotos-n').textContent = total
    ? (total + (total === 1 ? ' foto del registro' : ' fotos del registro') + (conPie === total ? '' : ' · ' + (total - conPie) + ' sin pie'))
    : 'Sin fotos cargadas';
  _pintarEstado();
}
new MutationObserver(_pintarFotos).observe(_el('fotos-list'), { childList: true });
_pintarFotos();

// ── Listas editables (conclusiones y recomendaciones) ────────────────
function _item(texto, esNuevo) {
  var li = document.createElement('li');
  li.className = 'ed-item' + (esNuevo ? ' ed-nuevo' : '');
  var div = document.createElement('div');
  div.className = 'ed-ed';
  div.setAttribute('contenteditable', 'true');
  div.textContent = texto || '';
  var acc = document.createElement('div');
  acc.className = 'ed-item-acc';
  acc.innerHTML =
    '<button type="button" class="ed-ico" data-ed-mover="-1" aria-label="Subir" title="Subir">↑</button>' +
    '<button type="button" class="ed-ico" data-ed-mover="1" aria-label="Bajar" title="Bajar">↓</button>' +
    '<button type="button" class="ed-ico" data-ed-quitar aria-label="Quitar" title="Quitar">✕</button>';
  li.appendChild(div);
  li.appendChild(acc);
  return li;
}

// Frase de cierre grave: último punto FIJO, no editable (decisión
// 2026-10-14 — con comportamientos marcados, obligatoria e intocable).
function _itemFijo(texto) {
  var li = document.createElement('li');
  li.className = 'ed-item ed-item-fijo';
  var div = document.createElement('div');
  div.className = 'ed-ed';
  div.textContent = texto;
  var nota = document.createElement('div');
  nota.className = 'ed-item-fijo-nota';
  nota.title = 'Frase fija pre-aprobada; va sola con comportamientos marcados';
  nota.textContent = 'fija';
  li.appendChild(div);
  li.appendChild(nota);
  return li;
}

function _refrescarLista(id, textos) {
  var ol = _el(id);
  Array.prototype.slice.call(ol.children).forEach(function (li) {
    if (!li.classList.contains('ed-item-fijo')) li.remove();
  });
  var fijo = ol.querySelector('.ed-item-fijo');
  // quitarNumeracion también aquí: los borradores guardados antes traen «1. …».
  textos.forEach(function (t) { ol.insertBefore(_item(quitarNumeracion(t)), fijo || null); });
  _pintarVacio(id);
}

function _textosLista(id) {
  return Array.prototype.slice.call(document.querySelectorAll('#' + id + ' > .ed-item:not(.ed-item-fijo)'))
    .map(function (li) { return li.querySelector('.ed-ed').textContent.trim(); })
    .filter(Boolean);
}

function _pintarVacio(id) {
  var ol = _el(id);
  var prev = ol.previousElementSibling;
  var vacio = prev && prev.classList && prev.classList.contains('ed-vacio') ? prev : null;
  var hay = ol.querySelectorAll('.ed-item:not(.ed-item-fijo)').length;
  if (!hay && !vacio) {
    var v = document.createElement('div');
    v.className = 'ed-vacio';
    v.textContent = id === 'ed-rec' ? 'Sin recomendaciones. Aplica una sugerencia o agrega la tuya.' : 'Sin conclusiones. Aplica una sugerencia o agrega la tuya.';
    ol.parentNode.insertBefore(v, ol);
  } else if (hay && vacio) {
    vacio.remove();
  }
}

function _pintarCierreFijo() {
  var ol = _el('ed-concl');
  var existente = ol.querySelector('.ed-item-fijo');
  var hay = document.querySelectorAll('.comp-ac:checked').length > 0;
  if (hay && !existente) ol.appendChild(_itemFijo(CIERRE_GRAVE_TEXTO));
  else if (!hay && existente) existente.remove();
}

_refrescarLista('ed-concl', (_borrador && _borrador.concl) || dividirPuntos(V6_CTX.conclusionesInspector));
_refrescarLista('ed-rec', (_borrador && _borrador.rec) || []);
_pintarCierreFijo();

// ── Sello inicial: hereda la revisión de la visita (2026-10-16) ──────
// Sin borrador que traiga un sello propio, las secciones que nacen iguales a
// lo que la visita ya revisó (observaciones, conclusiones, antecedentes
// armados con sus datos y las frases deterministas) nacen revisadas. Las
// demás quedan pendientes hasta la primera «Revisar». No se guarda solo por
// esto: viaja con el siguiente cambio del inspector.
if (!_revSello) {
  // `_d`, no recolectarDatosWizard() de nuevo: trae el radicado parchado con el
  // que se armaron los antecedentes; sin él la frase no coincidía y
  // «Antecedentes» nacía vencida (QA GLM 2026-10-16).
  var _dVisita = _d;
  _revSello = {
    secciones: selloInicialSecciones(_informeActual(), {
      observaciones: _SESION_QS.get('observaciones') || '',
      conclusiones: dividirPuntos(V6_CTX.conclusionesInspector),
      antecedentes: fraseAntecedentes(_dVisita, detectarOrigenAntecedentes(_dVisita)),
      // Frases deterministas: REC_* y las conclusiones «De la visita».
      aprobadas: sugerenciasConclusionesDeLaVisita(_dVisita, _citaArt135).map(function (s) { return s.texto; })
        .concat(sugerenciasRecomendacionesDeLaVisita(_dVisita).map(function (s) { return s.texto; }))
    }),
    modo: 'VISITA',
    fecha: new Date().toISOString().slice(0, 10)
  };
}

// ── Sugerencias: «De la visita» + «Del catálogo» + «Propuesta» ───────
function _sugerenciasActuales(idLista) {
  var d = recolectarDatosWizard().d;
  return idLista === 'ed-concl'
    ? sugerenciasConclusionesDeLaVisita(d, _citaArt135)
    : sugerenciasRecomendacionesDeLaVisita(d);
}
var _catalogoSugs = null;   // { concl, rec } tras la única llamada al abrir
var _propuestaCargando = false;

function _pintarSugerencias() {
  ['ed-concl', 'ed-rec'].forEach(function (idLista) {
    var caja = _el('ed-sug-' + idLista.slice(3));
    // Deduplicación acumulativa: contra lo aplicado y contra las otras fuentes.
    var aplicados = _textosLista(idLista).slice();
    var fuentes = [
      { etiqueta: 'De la visita', chip: 'ed-chip-ok', sugs: _sugerenciasActuales(idLista) },
      { etiqueta: 'Del catálogo', chip: 'ed-chip-info', sugs: _catalogoSugs ? (idLista === 'ed-concl' ? _catalogoSugs.concl : _catalogoSugs.rec) : [] },
      { etiqueta: 'Propuesta', chip: 'ed-chip-neutro', sugs: _propuesta && !_propuesta.error ? (idLista === 'ed-concl' ? _propuesta.concl : _propuesta.rec) : [] }
    ];
    var planas = [];
    fuentes.forEach(function (f) {
      quitarDuplicados(f.sugs, aplicados).forEach(function (s) {
        planas.push({ texto: s.texto, motivo: s.motivo, origen: f.etiqueta, chip: f.chip });
        aplicados.push(s.texto);
      });
    });
    var estado = '';
    if (_propuestaCargando) estado = 'Buscando sugerencias…';
    else if (_propuesta && _propuesta.error) estado = 'No se pudieron traer propuestas.';
    if (!planas.length && !estado) { caja.style.display = 'none'; caja._sugs = []; return; }
    caja.style.display = '';
    caja._sugs = planas;
    caja.innerHTML = (planas.length
        ? '<div class="ed-sug-t">Sugerencias · ' + planas.length +
          ' <span>No salen en el informe hasta que las apliques.</span>' +
          '<button type="button" class="ed-btn ed-btn-neutro ed-btn-chico" data-ed-repropuesta>Pedir otra propuesta</button></div>'
        : '') +
      (estado
        ? '<div class="ed-sug-estado">' + _esc(estado) +
          (_propuesta && _propuesta.error
            ? ' <button type="button" class="ed-btn ed-btn-tinte ed-btn-chico" data-ed-repropuesta>Reintentar</button>'
            : '') + '</div>'
        : '') +
      planas.map(function (s, i) {
        return '<div class="ed-card"><div><span class="ed-chip ' + s.chip + '">' + s.origen + '</span> ' +
          (s.motivo ? '<small class="ed-card-porque">' + _esc(s.motivo) + '</small>' : '') +
          '<p>' + _esc(s.texto) + '</p></div>' +
          '<button type="button" class="ed-btn ed-btn-tinte ed-btn-chico" data-ed-aplicar="' + idLista + '" data-ed-i="' + i + '">Aplicar</button></div>';
      }).join('');
  });
}
_pintarSugerencias();

// «Del catálogo»: una sola llamada al abrir — hallazgos confirmados más los
// que proponga sugerirHallazgosDesdeObs sobre las observaciones (deja
// HALLAZGOS_PENDIENTES_SUGERIDOS). Si el texto ya se analizó en esta visita,
// la función vuelve sin gastar la llamada.
(function () {
  var obs = (_el('obs').value || '').trim();
  if (obs.length < 80 && !HALLAZGOS_CONFIRMADOS.length) return;
  Promise.resolve(sugerirHallazgosDesdeObs()).then(function () {
    return cargarCatalogoHallazgos();
  }).then(function (cat) {
    _catalogoSugs = sugerenciasDelCatalogo(
      HALLAZGOS_CONFIRMADOS.concat(HALLAZGOS_PENDIENTES_SUGERIDOS), cat);
    _pintarSugerencias();
  }).catch(function () { /* sin catálogo: el grupo no aparece */ });
})();

// «Propuesta»: una llamada al abrir (y «Pedir otra propuesta»), cacheada en el
// borrador por una huella simple de observaciones + comportamientos: se vuelve
// a pedir solo si esos cambian. Cada punto pasa el validador suelto.
function _huellaContextoPropuesta() {
  var d = recolectarDatosWizard().d;
  return huellaRevision(d.obs || '', (d.comportamientos || []).join(' | '), '', '');
}
function _cargarPropuesta(forzar) {
  if (_propuestaCargando) return;
  var huellaCtx = _huellaContextoPropuesta();
  if (!forzar && _propuesta && _propuesta.huella === huellaCtx && !_propuesta.error) { _pintarSugerencias(); return; }
  _propuestaCargando = true;
  _pintarSugerencias();
  construirPromptF43(recolectarDatosWizard()).then(function (prompt) {
    return pedirJsonIA(prompt);
  }).then(function (ia) {
    _propuestaCargando = false;
    if (!ia.ok) {
      _propuesta = { huella: huellaCtx, error: true };
      _pintarSugerencias();
      return;
    }
    var ctx = recolectarDatosWizard();
    function limpiar(arr, esConcl) {
      return (Array.isArray(arr) ? arr : []).map(function (t) { return String(t || '').trim(); })
        .filter(Boolean)
        .filter(function (t) {
          return validarInformeIA(esConcl ? { conclusiones_items: [t] } : { recomendaciones_items: [t] },
            ctx, { sinCantidades: true, sinCobertura: true }).ok;
        });
    }
    var j = ia.json || {};
    _propuesta = {
      huella: huellaCtx,
      concl: limpiar(j.conclusiones_items, true).map(function (t) { return { texto: t, motivo: 'Redactada para este informe' }; }),
      rec: limpiar(j.recomendaciones_items, false).map(function (t) { return { texto: t, motivo: 'Redactada para este informe' }; })
    };
    _guardarEditor();
    _pintarSugerencias();
  }).catch(function () {
    _propuestaCargando = false;
    _propuesta = { huella: huellaCtx, error: true };
    _pintarSugerencias();
  });
}
_cargarPropuesta(false);

// Si cambian observaciones o comportamientos, la propuesta en caché vence:
// se re-pide (con calma — es una llamada de IA) en cuanto el texto se asiente.
var _tPropuesta = null;
function _programarPropuesta() {
  clearTimeout(_tPropuesta);
  _tPropuesta = setTimeout(function () {
    if (_propuesta && _propuesta.huella !== _huellaContextoPropuesta()) _cargarPropuesta(false);
  }, 3000);
}

// ── Estado (rail ≥1200 y barra inferior <1200) ───────────────────────
function _informeActual() {
  return {
    antecedentes: _el('ed-antecedentes').textContent.trim(),
    observaciones: _el('ed-obs').textContent.trim(),
    conclusiones_items: _textosLista('ed-concl'),
    recomendaciones_items: _textosLista('ed-rec')
  };
}

// tFinal del documento. La ruta de plantilla NO agrega el cierre grave por sí
// misma (lo agrega el cliente en generarInformeV2/confirmarYGenerarInforme):
// el punto fijo del editor no está en _textosLista, se suma aquí — sin
// duplicarlo si el inspector ya lo tiene como punto propio.
function _tFinalDesdeDocumento() {
  var informe = _informeActual();
  var concl = informe.conclusiones_items.slice();
  if (_requiereCierreGrave() && concl.indexOf(CIERRE_GRAVE_TEXTO) < 0) concl.push(CIERRE_GRAVE_TEXTO);
  return {
    antecedentes: informe.antecedentes,
    observaciones: informe.observaciones,
    conclusiones_items: concl,
    recomendaciones_items: informe.recomendaciones_items,
    _d: recolectarDatosWizard().d
  };
}

function _condicionWord() {
  var informe = _informeActual();
  var validacion = validarInformeIA(_tFinalDesdeDocumento(), recolectarDatosWizard(), { sinCantidades: true });
  return condicionGenerarWord({
    vigente: revisionInformeVigente(_revSello, informe, huellaRevision),
    huboRevision: !!_revSello,
    problemas: validacion.problemas,
    avisos: validacion.avisos,
    requiereCierre: _requiereCierreGrave(),
    observacionesVacias: !String(informe.observaciones || '').trim(),
    // El cierre está en la hoja si existe el punto fijo o uno igual del inspector.
    tieneCierre: !!_el('ed-concl').querySelector('.ed-item-fijo') ||
      informe.conclusiones_items.indexOf(CIERRE_GRAVE_TEXTO) >= 0
  });
}

function _pintarEstado() {
  var informe = _informeActual();
  var nc = informe.conclusiones_items.length;
  var nr = informe.recomendaciones_items.length;
  var total = _fotosAsistentes().length, conPie = _nFotosConPie();
  var obs = informe.observaciones;
  var cambiadas = seccionesCambiadas(_revSello, informe, huellaRevision);
  var vigente = cambiadas.length === 0;
  var hubo = !!_revSello;
  var cond = _condicionWord();
  _pintarBloqueos(cond.tipo === 'problema' ? cond.problemas : []);
  _avisos = (cond.avisos || []).map(function (t) { return { texto: t, loc: _ubicarEnDocumento(t) }; });
  // La sección donde está lo que bloquea se marca en rojo en la lista.
  var secBloq = {};
  _bloqueos.forEach(function (b) { var s = b.loc && _seccionDeBloque(b.loc.el); if (s) secBloq[s] = true; });
  var txtRevision;
  if (vigente) {
    txtRevision = _revSello.modo === 'LOCAL' ? 'Revisado sin conexión'
      : (_revSello.modo === 'VISITA' ? 'Revisado en la visita' : 'Vigente');
  } else if (hubo) {
    txtRevision = 'Cambió: ' + cambiadas.map(function (s) { return NOMBRES_SECCION[s] || s; }).join(', ');
  } else {
    txtRevision = 'Pendiente';
  }
  var filas = [
    ['ok', 'Antecedentes', 'Armados con los datos de la visita'],
    [obs ? 'ok' : 'pend', 'Observaciones de campo', obs ? 'Texto de la visita, editable' : 'Vacías'],
    [total && conPie === total ? 'ok' : (total ? 'pend' : 'no'), 'Registro fotográfico', total ? (total + ' fotos · ' + conPie + ' con pie') : 'Sin fotos'],
    [nc ? 'ok' : 'pend', 'Conclusiones', nc ? (nc + ' en el informe') : 'Ninguna todavía'],
    [nr ? 'ok' : 'pend', 'Recomendaciones', nr ? (nr + ' en el informe') : 'Ninguna todavía'],
    [vigente ? 'ok' : (hubo ? 'pend' : 'no'), 'Revisión final', txtRevision]
  ].map(function (f) { return secBloq[f[1]] ? ['err', f[1], 'No deja generar el Word'] : f; });
  _el('ed-est').innerHTML = filas.map(function (f) {
    return '<li><span class="ed-dot ' + f[0] + '"></span><div>' + _esc(f[1]) + '<small>' + _esc(f[2]) + '</small></div></li>';
  }).join('');
  ['ed-gen', 'ed-gen-rail', 'ed-gen-movil'].forEach(function (id) { var b = _el(id); if (b) b.disabled = !cond.ok; });
  // «Revisar lo que cambió» solo si hay sello y queda una parte por revisar;
  // si no cambió nada, el botón sigue habilitado como hoy.
  ['ed-revisar', 'ed-revisar-movil'].forEach(function (id) {
    var b = _el(id);
    if (b) b.textContent = (hubo && cambiadas.length && cambiadas.length < SECCIONES_REVISION.length)
      ? 'Revisar lo que cambió' : 'Revisar informe';
  });
  _pintarNotaGenerar(cond, hubo);
  var barra = cond.ok ? 'listo para generar'
    : (cond.tipo === 'revision' ? _esc(cond.motivo) : '');
  var nAvisos = (cond.avisos || []).length;
  var txtAvisos = nAvisos ? nAvisos + (nAvisos === 1 ? ' aviso' : ' avisos') + ' de redacción' : '';
  _el('ed-barra-txt').innerHTML = '<b>' + nc + (nc === 1 ? ' conclusión · ' : ' conclusiones · ') +
    nr + (nr === 1 ? ' recomendación' : ' recomendaciones') + '</b> ' +
    total + (total === 1 ? ' foto' : ' fotos') + (barra ? ' · ' + barra : '') +
    (_guardadoTxt ? ' · ' + _esc(_guardadoTxt) : '') +
    // <1200 no hay panel: el bloqueo va en su propia línea, con «Ver dónde»;
    // sin bloqueo, los avisos de redacción (D, 2026-10-16).
    (cond.tipo === 'problema'
      ? '<span class="ed-barra-bloqueo">No se puede generar el Word: ' +
        (_bloqueos.length === 1 ? 'hay una frase por corregir.' : 'hay ' + _bloqueos.length + ' cosas por corregir.') +
        (_bloqueos[0] && _bloqueos[0].loc ? ' <button type="button" class="ed-bloqueo-ir" data-ed-ir-problema="0">Ver dónde</button>' : '') +
        (txtAvisos ? ' · ' + txtAvisos : '') +
        '</span>'
      : (nAvisos
        ? '<span class="ed-barra-aviso">Revisa la redacción: ' + nAvisos + (nAvisos === 1 ? ' aviso.' : ' avisos.') +
          (_avisos[0] && _avisos[0].loc ? ' <button type="button" class="ed-bloqueo-ir" data-ed-ir-aviso="0">Ver dónde</button>' : '') +
          '</span>'
        : ''));
}

// La nota bajo «Generar Word» dice qué falta. Un problema del texto es un
// BLOQUEO (caja roja con cada problema y su «Ver dónde»); la revisión
// pendiente es solo una nota. Los avisos de redacción van debajo, en ámbar:
// no impiden generar (2026-10-16). Se reescribe solo si cambió: es aria-live.
function _pintarNotaGenerar(cond, huboRevision) {
  var nota = _el('ed-gen-nota');
  var cls, html;
  if (cond.ok) {
    cls = 'ed-nota ed-nota-ok';
    html = _esc(_linkWord ? 'Todo listo. Generarlo otra vez reemplaza el Word anterior.' : 'Todo listo para generar.');
  } else if (cond.tipo === 'revision') {
    cls = 'ed-nota';
    html = _esc(huboRevision
      ? 'Cambiaste el informe después de revisarlo: vuelve a usar «Revisar informe».'
      : 'Falta la revisión final: usa «Revisar informe».');
  } else {
    cls = 'ed-nota ed-bloqueo';
    html = '<b>No se puede generar el Word</b><ul>' + _bloqueos.map(function (b, i) {
      return '<li>' + _esc(b.texto) +
        (b.loc ? ' <button type="button" class="ed-bloqueo-ir" data-ed-ir-problema="' + i + '">Ver dónde</button>' : '') +
        '</li>';
    }).join('') + '</ul>';
  }
  if (cond.avisos && cond.avisos.length) {
    html += '<div class="ed-nota-avisos"><b>Revisa la redacción (no impide generar)</b><ul>' +
      cond.avisos.map(function (t, i) {
        return '<li>' + _esc(t) +
          (_avisos[i] && _avisos[i].loc ? ' <button type="button" class="ed-bloqueo-ir" data-ed-ir-aviso="' + i + '">Ver dónde</button>' : '') +
          '</li>';
      }).join('') + '</ul></div>';
  }
  if (nota.className !== cls) nota.className = cls;
  if (nota.innerHTML !== html) nota.innerHTML = html;
}

// ── Lo que no deja generar: dónde está en el documento ───────────────
// _bloqueos y _notasBloqueo se declaran arriba: _pintarFotos repinta el
// estado antes de llegar aquí.

// Minúscula y sin tildes SIN cambiar el largo (a diferencia de _normTexto):
// una posición en este texto es la misma en el texto del documento.
function _normMismoLargo(s) {
  return String(s || '').toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
}

// Bloques editables en el orden en que el validador los recibe: las listas
// sin los puntos vacíos (_textosLista los descarta, y «Recomendacion 2» cuenta así).
function _bloquesDe(seccion, numero) {
  function lleno(e) { return e.textContent.trim(); }
  var concl = Array.prototype.slice.call(document.querySelectorAll('#ed-concl > .ed-item .ed-ed')).filter(lleno);
  var rec = Array.prototype.slice.call(document.querySelectorAll('#ed-rec > .ed-item .ed-ed')).filter(lleno);
  if (seccion === 'obs') return [_el('ed-obs')];
  if (seccion === 'rec') return numero ? rec.slice(numero - 1, numero) : rec;
  if (seccion === 'concl') return concl;
  if (seccion === 'concl-rec') return concl.concat(rec);
  return [_el('ed-antecedentes'), _el('ed-obs')].concat(concl, rec);
}

function _ubicarEnDocumento(problema) {
  var u = ubicarProblema(problema);
  var bloques = _bloquesDe(u.seccion, u.numero);
  if (u.frase) {
    // Palabra por palabra: entre ellas, cualquier signo o espacio.
    var rx = new RegExp(u.frase.split(' ').map(function (w) {
      return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('[^a-z0-9]+'));
    for (var i = 0; i < bloques.length; i++) {
      var m = rx.exec(_normMismoLargo(bloques[i].textContent));
      if (m) return { el: bloques[i], inicio: m.index, fin: m.index + m[0].length };
    }
  }
  // Sin frase (o no apareció): el punto o la sección entera.
  if (u.seccion === 'rec' && u.numero && bloques[0]) return { el: bloques[0] };
  if (u.seccion === 'obs') return { el: _el('ed-obs') };
  if (u.seccion === 'concl' || u.seccion === 'concl-rec') return { el: _el('ed-concl') };
  if (u.seccion === 'rec') return { el: _el('ed-rec') };
  return null;
}

function _rangoTexto(el, inicio, fin) {
  var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n, pos = 0, ini = false;
  var r = document.createRange();
  while ((n = w.nextNode())) {
    var largo = n.nodeValue.length;
    if (!ini && inicio <= pos + largo) { r.setStart(n, inicio - pos); ini = true; }
    if (ini && fin <= pos + largo) { r.setEnd(n, fin - pos); return r; }
    pos += largo;
  }
  return null;
}

function _seccionDeBloque(el) {
  if (!el) return '';
  if (el.id === 'ed-antecedentes') return 'Antecedentes';
  if (el.id === 'ed-obs') return 'Observaciones de campo';
  if (el.closest('#ed-concl')) return 'Conclusiones';
  if (el.closest('#ed-rec')) return 'Recomendaciones';
  return '';
}

// Marca en el documento lo que bloquea: borde rojo en el bloque, la frase
// resaltada (CSS Custom Highlight: no toca el texto editable) y un aviso
// en línea justo debajo, para quien llega bajando por la hoja.
function _pintarBloqueos(problemas) {
  document.querySelectorAll('.ed-bloquea').forEach(function (e) { e.classList.remove('ed-bloquea'); });
  var rangos = [];
  _bloqueos = (problemas || []).map(function (p) {
    var loc = _ubicarEnDocumento(p);
    if (loc && loc.el) {
      loc.el.classList.add('ed-bloquea');
      if (loc.inicio != null) {
        loc.rango = _rangoTexto(loc.el, loc.inicio, loc.fin);
        if (loc.rango) rangos.push(loc.rango);
      }
    }
    return { texto: p, loc: loc };
  });
  try {
    if (window.CSS && CSS.highlights && typeof Highlight === 'function') {
      if (rangos.length) {
        var h = new Highlight();
        rangos.forEach(function (r) { h.add(r); });
        CSS.highlights.set('ed-bloqueo', h);
      } else CSS.highlights.delete('ed-bloqueo');
    }
  } catch (e) { /* sin resaltado: quedan el borde y el aviso */ }

  // Avisos en línea: solo se rehacen si cambiaron (se repinta a cada tecla).
  var deseadas = _bloqueos.filter(function (b) { return b.loc && b.loc.el; })
    .map(function (b) { return { el: b.loc.el, texto: b.texto }; });
  var iguales = deseadas.length === _notasBloqueo.length && deseadas.every(function (d, i) {
    return d.el === _notasBloqueo[i].el && d.texto === _notasBloqueo[i].texto && _notasBloqueo[i].nodo.isConnected;
  });
  if (iguales) return;
  _notasBloqueo.forEach(function (n) { n.nodo.remove(); });
  _notasBloqueo = deseadas.map(function (d) {
    var nodo = document.createElement('div');
    nodo.className = 'ed-bloqueo-linea';
    nodo.setAttribute('contenteditable', 'false');
    nodo.innerHTML = '<b>No deja generar el Word.</b> ' + _esc(d.texto);
    var li = d.el.closest('.ed-item');
    if (li) li.appendChild(nodo);                       // debajo del punto, dentro de su renglón
    else d.el.parentNode.insertBefore(nodo, d.el.nextSibling);
    return { el: d.el, texto: d.texto, nodo: nodo };
  });
}

// «Ver dónde»: lleva al bloque y deja la frase seleccionada para corregirla.
// Sirve para bloqueos y avisos (misma lógica, distinta lista).
function _irAProblema(i, lista) {
  var b = (lista || _bloqueos)[i];
  var loc = b && _ubicarEnDocumento(b.texto);
  if (!loc || !loc.el) return;
  loc.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (loc.inicio != null && loc.el.isContentEditable) {
    var r = _rangoTexto(loc.el, loc.inicio, loc.fin);
    if (!r) return;
    loc.el.focus({ preventScroll: true });
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

// ── Word ya generado ──────────────────────────────────────────────────
// Llega de la visita (?linkInforme=) o de «Generar Word». Viaja en la URL:
// solo se aceptan enlaces de Google.
function _linkGoogle(u) {
  u = String(u || '').trim();
  return /^https:\/\/(?:docs|drive)\.google\.com\//.test(u) ? u : '';
}
function _pintarAbrirWord() {
  ['ed-abrir', 'ed-abrir-top', 'ed-abrir-movil'].forEach(function (id) {
    var a = _el(id);
    if (!a) return;
    a.hidden = !_linkWord;
    if (_linkWord) a.href = _linkWord;
  });
  _el('ed-barra').classList.toggle('con-abrir', !!_linkWord);
}
_pintarAbrirWord();
_pintarEstado();

// ── Persistencia: este equipo (localStorage) + servidor (por ID_VISITA) ──
// Se guarda TODO lo que el inspector toca en el informe, no solo los textos:
// fechas, vigencia, firma, tabla del art. 135, POT escrita a mano, fotos
// (orden, pies, quitadas) y la captura QGIS (en Drive; aquí solo su id).
var POT_IDS = ['clasificacion', 'poligUso', 'poligTrat', 'franja', 'proteccion'];

function _fidDe(divId) { return (_el('fid-' + divId) || {}).value || ''; }

function _estadoFotos() {
  var orden = [], pies = {};
  Array.prototype.forEach.call(_fotosAsistentes(), function (div) {
    var fid = _fidDe(div.id);
    if (!fid) return;
    orden.push(fid);
    pies[fid] = (_el('desc-' + div.id) || {}).value || '';
  });
  return { orden: orden, quitadas: _fotosQuitadas.slice(), pies: pies };
}

function _aplicarFotos(f) {
  if (!f) return;
  if (!_fotosAsistentes().length) { _fotosPendientes = f; return; }
  _aplicandoFotos = true;
  var porFid = {};
  Array.prototype.forEach.call(_fotosAsistentes(), function (div) { var fid = _fidDe(div.id); if (fid) porFid[fid] = div; });
  _fotosQuitadas = (f.quitadas || []).slice();
  _fotosQuitadas.forEach(function (fid) { if (porFid[fid]) { porFid[fid].remove(); delete porFid[fid]; } });
  // Primero las del borrador en su orden; después las que se subieron luego.
  var lista = _el('fotos-list');
  var enOrden = (f.orden || []).filter(function (fid) { return porFid[fid]; });
  Object.keys(porFid).forEach(function (fid) { if (enOrden.indexOf(fid) < 0) enOrden.push(fid); });
  enOrden.forEach(function (fid) {
    lista.appendChild(porFid[fid]);
    var desc = _el('desc-' + porFid[fid].id);
    if (desc && f.pies && typeof f.pies[fid] === 'string') desc.value = f.pies[fid];
  });
  _fotosPendientes = null;
  _aplicandoFotos = false;
  _pintarFotos();
}

function _artEstado() {
  return {
    incluir: !!(_el('incluirArt') || {}).checked,
    filas: _filasArt135().map(function (tr) {
      return [(tr.querySelector('.sel-c') || {}).value || '', (tr.querySelector('.sel-nc') || {}).value || '',
              (tr.querySelector('.obs-inp') || {}).value || ''];
    })
  };
}

function _snapshotEditor() {
  var pot = {};
  POT_IDS.forEach(function (id) { pot[id] = gv(id); });
  return {
    _ts: Date.now(),
    baseVisita: _baseVisita,
    origen: _el('ed-origen').value,
    antecedentes: _el('ed-antecedentes').textContent,
    obs: _el('ed-obs').textContent,
    concl: _textosLista('ed-concl'),
    rec: _textosLista('ed-rec'),
    propuesta: _propuesta || null,
    rev: _revSello || null,
    revResp: _revResp,
    fechaInforme: gv('fechaInforme'),
    fechaEjec: gv('fechaEjec'),
    vigencia: gv('vigenciaLic'),
    inspector: gv('inspector'),
    cargo: gv('cargo'),
    art: _artEstado(),
    pot: pot,
    fotos: _fotosPendientes || _estadoFotos(),
    qgisId: _qgis.id
  };
}

function _ponerValor(id, v) {
  var el = _el(id);
  if (el && typeof v === 'string') el.value = v;
}

// Lo inverso de _snapshotEditor: deja el documento y el asistente oculto como
// estaban al guardar (al abrir, o al traer la versión de otro equipo).
function _aplicarSnapshot(s) {
  if (!s) return;
  if (s.origen) { _el('ed-origen').value = s.origen; _sincronizarDiligencia(s.origen); }
  if (typeof s.antecedentes === 'string' && s.antecedentes) _el('ed-antecedentes').textContent = s.antecedentes;
  if (typeof s.obs === 'string') _el('ed-obs').textContent = s.obs;
  if (s.concl) _refrescarLista('ed-concl', s.concl);
  if (s.rec) _refrescarLista('ed-rec', s.rec);
  _propuesta = s.propuesta || _propuesta;
  // El sello heredado de la visita (modo VISITA) se conserva aunque el
  // borrador que llega no traiga `rev` (los viejos no lo tienen): lo que no
  // cambió sigue revisado por la visita.
  _revSello = s.rev || (_revSello && _revSello.modo === 'VISITA' ? _revSello : null);
  if (Array.isArray(s.revResp)) _revResp = s.revResp;
  if (s.fechaInforme) {
    _ponerValor('fechaInforme', s.fechaInforme);
    _el('ed-fecha').value = s.fechaInforme;
    _el('ed-fecha-linea').textContent = 'Bello, ' + fmtFecha(s.fechaInforme);
  }
  if (typeof s.fechaEjec === 'string') _ponerValor('fechaEjec', s.fechaEjec);
  if (typeof s.vigencia === 'string') { _ponerValor('vigenciaLic', s.vigencia); (_el('vigenciaLic') || {}).dataset && (_el('vigenciaLic').dataset.auto = ''); }
  _pintarLicencia(recolectarDatosWizard().d);
  if (s.inspector) {
    var sel = _el('inspector');
    // Las opciones llegan después (cargarInspectoresDesdeBD): data-prefill las elige al llegar.
    if (sel) { sel.dataset.prefill = s.inspector; sel.value = s.inspector; }
  }
  if (typeof s.cargo === 'string' && s.cargo) _ponerValor('cargo', s.cargo);
  if (s.art) {
    var chk = _el('incluirArt');
    if (chk) { chk.checked = !!s.art.incluir; toggleArt(chk); }
    _filasArt135().forEach(function (tr, i) {
      var f = (s.art.filas || [])[i];
      if (!f) return;
      var c = tr.querySelector('.sel-c'), nc = tr.querySelector('.sel-nc'), o = tr.querySelector('.obs-inp');
      if (c) c.value = f[0]; if (nc) nc.value = f[1]; if (o) o.value = f[2];
    });
  }
  if (s.pot) POT_IDS.forEach(function (id) { if (s.pot[id]) _ponerValor(id, s.pot[id]); });
  if (s.fotos) _aplicarFotos(s.fotos);
  if (s.qgisId) _restaurarQgis(s.qgisId);
  if (s.baseVisita) _baseVisita = s.baseVisita;
  _pintarCierreFijo();
  _pintarSugerencias();
  _pintarEstado();
}

var _tGuardar = null;
// `opts.desdeServidor`: copia local de lo que vino del servidor (no hay nada
// que subir). Si no, hay cambios del inspector: se suben en ~3 s.
function _guardarEditor(opts) {
  opts = opts || {};
  // El asistente oculto sigue siendo el almacén: #obs al día antes de guardar
  // (y antes de generar: de ahí salen prompt, validador y Word).
  var obsAsistente = _el('obs');
  if (obsAsistente && obsAsistente.value !== _el('ed-obs').textContent) {
    obsAsistente.value = _el('ed-obs').textContent;
    guardar && guardar();
  }
  var s = _snapshotEditor();
  s._srvVersion = _srv.version;
  s._sinSubir = !opts.desdeServidor;
  try { localStorage.setItem(_claveEditor(), JSON.stringify(s)); } catch (e) { /* sin espacio: seguir igual */ }
  if (!opts.desdeServidor) {
    _srv.pendiente = true;
    _programarSubida();
  }
}
function _programarGuardar() {
  _srv.pendiente = true; // hay cambios, aunque el guardado local espere 400 ms
  clearTimeout(_tGuardar);
  _tGuardar = setTimeout(_guardarEditor, 400);
  _pintarEstado();
}

// ── Servidor ──────────────────────────────────────────────────────────
function _postWebhook(obj, keepalive) {
  return fetch(WH, {
    method: 'POST', keepalive: !!keepalive,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(_bodyConSesion(obj))
  }).then(function (r) { return r.json(); });
}

function _horaCorta(d) {
  return (d || new Date()).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}
// El servidor manda «dd/MM/yyyy HH:mm:ss»: misma forma que la hora local.
function _horaServidor(txt) {
  var m = /(\d{1,2}):(\d{2})/.exec(String(txt || ''));
  if (!m) return '';
  var d = new Date();
  d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  return _horaCorta(d);
}

function _pintarGuardado() {
  var t;
  if (!V6_CTX.idVisita) t = 'Guardado solo en este equipo';
  else if (_srv.estado === 'cargando') t = 'Trayendo lo guardado…';
  else if (_srv.estado === 'guardando') t = 'Guardando…';
  else if (_srv.estado === 'ok') t = 'Guardado' + (_srv.hora ? ' · ' + _srv.hora : '');
  else if (_srv.estado === 'offline') t = 'Sin conexión: guardado en este equipo';
  else if (_srv.estado === 'conflicto') t = 'Modificado en otro equipo: elige arriba qué versión queda';
  else t = '';
  _guardadoTxt = t;
  // Un punto de color con el estado (2026-10-16): reemplaza al aviso verde
  // flotante del asistente (#save-ind), que parpadeaba «Guardado» a cada
  // tecla en una esquina y en el celular tapaba los botones de la barra.
  var tono = !V6_CTX.idVisita ? 'no'
    : ({ ok: 'ok', guardando: 'mov', cargando: 'mov', offline: 'pend', conflicto: 'err' }[_srv.estado] || 'no');
  var el = _el('ed-guardado');
  if (el) el.innerHTML = t ? '<span class="ed-g-dot ' + tono + '" aria-hidden="true"></span><span>' + _esc(t) + '</span>' : '';
  _pintarEstado();
}

var _tSubir = null, _subiendo = false;
function _programarSubida() {
  clearTimeout(_tSubir);
  _tSubir = setTimeout(function () { _subirBorrador(false); }, 3000);
}

function _jsonParaServidor() {
  var s = _snapshotEditor();
  var j = JSON.stringify(s);
  // Una celda admite 50.000 caracteres: la «Propuesta» se vuelve a pedir.
  if (j.length > 44000) { s.propuesta = null; j = JSON.stringify(s); }
  return j;
}

function _marcarLocalSubido() {
  try {
    var s = JSON.parse(localStorage.getItem(_claveEditor()) || 'null');
    if (!s) return;
    s._sinSubir = false;
    s._srvVersion = _srv.version;
    localStorage.setItem(_claveEditor(), JSON.stringify(s));
  } catch (e) {}
}

function _subirBorrador(forzar, keepalive) {
  if (!V6_CTX.idVisita) { _pintarGuardado(); return; }
  if (!_srv.cargado) return; // aún no se leyó el servidor: no pisar lo de otro equipo
  if (_subiendo && !keepalive) { _programarSubida(); return; }
  _subiendo = true;
  _srv.estado = 'guardando';
  _pintarGuardado();
  return _postWebhook({
    accion: 'guardarBorradorInforme', idVisita: V6_CTX.idVisita, radicado: V6_CTX.radicado || '',
    borrador: _jsonParaServidor(), versionBase: _srv.version, forzar: !!forzar
  }, keepalive).then(function (r) {
    _subiendo = false;
    if (r && r.ok) {
      _srv.version = r.version;
      _srv.pendiente = false;
      _srv.estado = 'ok';
      _srv.hora = _horaCorta();
      _marcarLocalSubido();
    } else if (r && r.conflicto) {
      _srv.estado = 'conflicto';
      _mostrarConflicto(r);
    } else {
      _srv.estado = 'offline'; // error del servidor: se reintenta
    }
    _pintarGuardado();
  }).catch(function () {
    _subiendo = false;
    _srv.estado = 'offline';
    _pintarGuardado();
  });
}

function _cargarServidor() {
  if (!V6_CTX.idVisita) { _pintarGuardado(); return; }
  _srv.estado = 'cargando';
  _pintarGuardado();
  _postWebhook({ accion: 'leerBorradorInforme', idVisita: V6_CTX.idVisita }).then(function (r) {
    if (!r || !r.ok) throw new Error((r && r.error) || 'sin respuesta');
    _srv.cargado = true;
    var remoto = null;
    try { remoto = r.borrador ? JSON.parse(r.borrador) : null; } catch (e) {}
    var local = null;
    try { local = JSON.parse(localStorage.getItem(_claveEditor()) || 'null'); } catch (e) {}
    var verLocal = (local && local._srvVersion) || 0;
    if (remoto && !(local && local._sinSubir)) {
      // Lo del servidor es lo último: se trae (incluye lo hecho en otro equipo).
      _srv.version = r.version;
      _aplicarSnapshot(remoto);
      _guardarEditor({ desdeServidor: true });
      _srv.pendiente = false;
      _srv.estado = 'ok';
      _srv.hora = _horaServidor(r.actualizado);
      _revisarCambioVisita();
    } else if (remoto && verLocal !== r.version) {
      // Cambios sin subir en este equipo Y alguien guardó en otro: decide el inspector.
      _srv.version = verLocal;
      _srv.estado = 'conflicto';
      _mostrarConflicto({ version: r.version, actualizado: r.actualizado, usuario: r.usuario, borrador: r.borrador });
    } else {
      // Sin borrador en el servidor, o este equipo va adelante sobre la misma versión.
      _srv.version = r.version || 0;
      if (local && local._sinSubir) _subirBorrador(false);
      else _srv.estado = remoto ? 'ok' : '';
    }
    _pintarGuardado();
  }).catch(function () {
    _srv.estado = 'offline';
    _pintarGuardado();
  });
}

function _mostrarConflicto(r) {
  var aviso = _el('ed-aviso');
  aviso._conflicto = r;
  aviso.hidden = false;
  aviso.innerHTML = '<span>Este informe se modificó en otro equipo' +
    (r.usuario ? ' (' + _esc(r.usuario) + ')' : '') + (r.actualizado ? ', ' + _esc(r.actualizado) : '') + '.</span>' +
    '<button type="button" class="ed-btn ed-btn-tinte ed-btn-chico" data-ed-conf="traer">Traer esa versión</button>' +
    '<button type="button" class="ed-btn ed-btn-neutro ed-btn-chico" data-ed-conf="mia">Quedarme con la mía</button>';
}

function _resolverConflicto(opcion) {
  var aviso = _el('ed-aviso');
  var r = aviso._conflicto || {};
  aviso.hidden = true;
  aviso.innerHTML = '';
  if (opcion === 'traer') {
    var remoto = null;
    try { remoto = r.borrador ? JSON.parse(r.borrador) : null; } catch (e) {}
    _srv.version = r.version || _srv.version;
    _srv.pendiente = false;
    if (remoto) _aplicarSnapshot(remoto);
    _guardarEditor({ desdeServidor: true });
    _srv.estado = 'ok';
    _srv.hora = _horaServidor(r.actualizado);
    _pintarGuardado();
  } else {
    _srv.version = r.version || _srv.version;
    _subirBorrador(true);
  }
}

// ── La visita cambió después de empezar el informe ─────────────────────
function _revisarCambioVisita() {
  var caja = _el('ed-aviso-visita');
  if (!caja) return;
  if (_baseVisita === _huellaVisitaActual) { caja.hidden = true; return; }
  caja.hidden = false;
  caja.innerHTML = '<span>La visita cambió desde que empezaste el informe (descripción, conclusiones o datos).</span>' +
    '<button type="button" class="ed-btn ed-btn-tinte ed-btn-chico" data-ed-visita="traer">Traer observaciones y conclusiones de la visita</button>' +
    '<button type="button" class="ed-btn ed-btn-neutro ed-btn-chico" data-ed-visita="mio">Conservar lo mío</button>';
}

function _resolverCambioVisita(opcion) {
  if (opcion === 'traer') {
    _el('ed-obs').textContent = _SESION_QS.get('observaciones') || '';
    _refrescarLista('ed-concl', dividirPuntos(V6_CTX.conclusionesInspector));
    _pintarCierreFijo();
    _pintarSugerencias();
  }
  _baseVisita = _huellaVisitaActual;
  _el('ed-aviso-visita').hidden = true;
  _guardarEditor();
  _pintarEstado();
}

// ── Captura QGIS en Drive ─────────────────────────────────────────────
function _ponerQgis() {
  locImg.fuente = 'qgis';
  locImg.base64 = _qgis.base64;
  locImg.mimeType = _qgis.mime;
  locImg.fuenteLabel = 'Captura propia (QGIS)';
  _setLocPreviewOrig('data:' + _qgis.mime + ';base64,' + _qgis.base64, locImg.fuenteLabel);
  _pintarMapa();
}

function _restaurarQgis(id) {
  if (!id || _qgis.id === id) return;
  fetch(WH + '?' + _qsConSesion({ accion: 'obtenerFotoBase64', fileId: id }).toString())
    .then(function (r) { return r.json(); })
    .then(function (r) {
      if (!r || !r.ok || !r.base64) return;
      _qgis = { id: id, base64: r.base64, mime: r.mime || 'image/jpeg' };
      _ponerQgis();
    }).catch(function () {});
}

function _subirQgis() {
  if (!V6_CTX.idCarpeta || _qgisSubiendo) return; // sin carpeta: queda solo en este equipo
  var b64 = locImg.base64, mime = locImg.mimeType || 'image/png';
  _qgisSubiendo = true;
  _postWebhook({ accion: 'guardarImagenLocalizacion', idCarpeta: V6_CTX.idCarpeta, base64: b64, mimeType: mime })
    .then(function (r) {
      _qgisSubiendo = false;
      if (r && r.ok) { _qgis = { id: r.fileId, base64: b64, mime: mime }; _programarGuardar(); }
    }).catch(function () { _qgisSubiendo = false; });
}

window.addEventListener('beforeunload', function () {
  if (!_srv.pendiente) return; // sin cambios: nada que guardar ni subir
  clearTimeout(_tGuardar);
  _guardarEditor();
  if (_srv.cargado) _subirBorrador(false, true);
});
window.addEventListener('online', function () {
  if (!_srv.cargado) _cargarServidor();
  else if (_srv.pendiente) _subirBorrador(false);
});
setInterval(function () {
  if (_srv.cargado && _srv.pendiente && _srv.estado === 'offline') _subirBorrador(false);
}, 30000);

// ── Eventos ──────────────────────────────────────────────────────────
root.addEventListener('input', function (e) {
  if (e.target.classList && e.target.classList.contains('ed-ed')) {
    _pintarSugerencias(); // la deduplicación compara contra lo ya aplicado
    _programarGuardar();
    if (e.target.id === 'ed-obs') _programarPropuesta();
  }
  // Campos de texto del asistente traídos al documento (observaciones de la
  // tabla del art. 135, POT escrita a mano, cargo): también se guardan.
  if (_esCampoDelDocumento(e.target) && !(e.target.classList && e.target.classList.contains('ed-ed'))) _programarGuardar();
});
// Selects, casillas y fechas (firma, vigencia, ejecutoria, tabla del art. 135, POT).
root.addEventListener('change', function (e) {
  if (_esCampoDelDocumento(e.target)) _programarGuardar();
});
function _esCampoDelDocumento(t) {
  return !!(t && t.closest && t.closest('.ed-hoja') && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName));
}

root.addEventListener('click', function (e) {
  var b = e.target.closest ? e.target.closest('button') : null;
  if (!b) return;
  if (b.hasAttribute('data-ed-ir-problema')) { _irAProblema(parseInt(b.getAttribute('data-ed-ir-problema'), 10)); return; }
  if (b.hasAttribute('data-ed-ir-aviso')) { _irAProblema(parseInt(b.getAttribute('data-ed-ir-aviso'), 10), _avisos); return; }
  if (b.hasAttribute('data-ed-conf')) { _resolverConflicto(b.getAttribute('data-ed-conf')); return; }
  if (b.hasAttribute('data-ed-visita')) { _resolverCambioVisita(b.getAttribute('data-ed-visita')); return; }
  if (b.hasAttribute('data-ed-agregar')) {
    var ol = _el(b.getAttribute('data-ed-agregar'));
    var li = _item('', true);
    ol.insertBefore(li, ol.querySelector('.ed-item-fijo') || null);
    _pintarVacio(ol.id);
    li.querySelector('.ed-ed').focus();
    _programarGuardar();
  } else if (b.hasAttribute('data-ed-quitar')) {
    var olQ = b.closest('ol');
    b.closest('li').remove();
    _pintarVacio(olQ.id);
    _pintarSugerencias();
    _programarGuardar();
  } else if (b.getAttribute('data-ed-mover')) {
    var l = b.closest('li'), dir = parseInt(b.getAttribute('data-ed-mover'), 10);
    if (dir < 0 && l.previousElementSibling) {
      l.parentNode.insertBefore(l, l.previousElementSibling);
    } else if (dir > 0 && l.nextElementSibling && !l.nextElementSibling.classList.contains('ed-item-fijo')) {
      l.parentNode.insertBefore(l.nextElementSibling, l);
    }
    _programarGuardar();
  } else if (b.getAttribute('data-ed-foto')) {
    var divId = b.getAttribute('data-ed-foto'), dirF = b.getAttribute('data-ed-dir');
    if (dirF === 'quitar') {
      var fidQ = _fidDe(divId);
      if (fidQ && _fotosQuitadas.indexOf(fidQ) < 0) _fotosQuitadas.push(fidQ);
      _el(divId).remove(); // el MutationObserver repinta
    } else moverFoto(divId, dirF);
    _programarGuardar();
  } else if (b.getAttribute('data-ed-aplicar')) {
    var idLista = b.getAttribute('data-ed-aplicar');
    var caja = _el('ed-sug-' + idLista.slice(3));
    var s = (caja._sugs || [])[parseInt(b.getAttribute('data-ed-i'), 10)];
    if (!s) return;
    var olA = _el(idLista);
    var liA = _item(s.texto, true);
    olA.insertBefore(liA, olA.querySelector('.ed-item-fijo') || null);
    _pintarVacio(idLista);
    _pintarSugerencias();
    _programarGuardar();
    liA.querySelector('.ed-ed').focus();
  } else if (b.hasAttribute('data-ed-repropuesta')) {
    _cargarPropuesta(true);
  } else if (b.id === 'ed-gen' || b.id === 'ed-gen-rail' || b.id === 'ed-gen-movil' || b.hasAttribute('data-ed-gen-reintentar')) {
    _generarWord();
  } else if (b.id === 'ed-revisar' || b.id === 'ed-revisar-movil') {
    _abrirRevision();
  } else if (b.hasAttribute('data-ed-rev-cerrar')) {
    _cerrarPanelRevision();
  } else if (b.hasAttribute('data-ed-rev-continuar') || b.hasAttribute('data-ed-rev-reintentar2')) {
    _continuarRevision();
  } else if (b.hasAttribute('data-ed-usar')) {
    _usarTextoRevision(parseInt(b.getAttribute('data-ed-usar'), 10), b.getAttribute('data-ed-cual'));
  } else if (b.hasAttribute('data-ed-rev-aplicar')) {
    _aplicarCambiosRevision();
  }
});

// Texto editado de una tarjeta elegida del paso 2 (revisión).
root.addEventListener('input', function (e) {
  if (e.target.hasAttribute && e.target.hasAttribute('data-ed-c-txt') && _revPanel && _revPanel.textos) {
    _revPanel.textos[parseInt(e.target.getAttribute('data-ed-c-txt'), 10)] = e.target.value;
  }
});

// Cambios en el asistente oculto que mueven sugerencias o el cierre fijo.
document.querySelectorAll('.comp-ac').forEach(function (cb) {
  cb.addEventListener('change', function () {
    _pintarCierreFijo();
    _pintarSugerencias();
    _programarGuardar();
    _programarPropuesta(); // cambió el contexto de la «Propuesta»
  });
});
['sinLic', 'vigenciaLic', 'areas'].forEach(function (id) {
  var el = _el(id);
  if (!el) return;
  ['change', 'input'].forEach(function (ev) {
    el.addEventListener(ev, function () {
      _pintarLicencia(recolectarDatosWizard().d);
      _pintarSugerencias();
    });
  });
});

// ── Revisión final: una sola, al final (3 pasos + sello por huella) ──
var _revPanel = null; // { critica, respuestas, cambios, eleccion, textos, avisos }

function _cabModal(titulo) {
  return '<div class="ed-modal-cab"><b>' + titulo + '</b>' +
    '<button type="button" class="ed-ico" data-ed-rev-cerrar aria-label="Cerrar revisión">✕</button></div>';
}

function _modalRevision(html, ancha) {
  var m = _el('ed-modal');
  m.hidden = false;
  m.innerHTML = '<div class="ed-modal-caja' + (ancha ? ' ed-modal-ancha' : '') +
    '" role="dialog" aria-modal="true" aria-label="Revisión del informe">' + html + '</div>';
}

function _cerrarPanelRevision() {
  _revPanel = null;
  var m = _el('ed-modal');
  m.hidden = true;
  m.innerHTML = '';
}

// La revisión queda vigente con la huella de cada sección; cualquier edición
// posterior vence la de su sección (la comparación en _pintarEstado). La
// huella completa se conserva por compatibilidad con los borradores viejos.
function _sellarRevision(modo) {
  _revSello = {
    huella: huellaInforme(_informeActual(), huellaRevision),
    secciones: huellasSecciones(_informeActual()),
    // Los textos sellados viajan en el borrador: permiten detectar el retoque
    // menor la próxima vez (2026-10-17). Los sellos viejos no lo traen y todo
    // se comporta como antes.
    textos: _informeActual(),
    modo: modo, fecha: new Date().toISOString().slice(0, 10)
  };
  _guardarEditor();
  _pintarEstado();
}

// El texto de una sección del informe: las listas van unidas por saltos.
function _textoDeSeccion(informe, s) {
  var inf = informe || {};
  if (s === 'conclusiones') return (inf.conclusiones_items || []).join('\n');
  if (s === 'recomendaciones') return (inf.recomendaciones_items || []).join('\n');
  return inf[s] || '';
}

function _abrirRevision() {
  if (_revPanel) return;
  _guardarEditor(); // #obs al día antes de mandar el informe
  _revPanel = {};
  // Revisión por secciones (2026-10-16): con sello y cambios parciales, la
  // IA solo crítica lo que cambió y no repite preguntas ya respondidas.
  // Retoques menores (2026-10-17): una coma o una tilde no vuelven a pasar
  // por la IA — la sección cuenta como revisada.
  var opts = {};
  if (_revSello) {
    var cambiadas = seccionesCambiadas(_revSello, _informeActual(), huellaRevision);
    if (_revSello.textos) cambiadas = cambiadas.filter(function (s) {
      return !cambioMenorRevision(_textoDeSeccion(_revSello.textos, s), _textoDeSeccion(_informeActual(), s));
    });
    if (!cambiadas.length) {
      // Nada cambió de verdad: solo el chequeo local. Limpio → se sella y se
      // cierra sin mostrar nada (decisión del usuario 2026-10-17).
      var problemas = validarInformeIA(_informeActual(), recolectarDatosWizard(), { sinCantidades: true }).problemas;
      if (!problemas.length) {
        _sellarRevision(_revSello.modo);
        _cerrarPanelRevision();
        return;
      }
      return _criticaLocal();
    }
    if (cambiadas.length && cambiadas.length < SECCIONES_REVISION.length) opts.secciones = cambiadas;
    if (_revResp.length) opts.respuestasPrevias = _revResp;
  }
  _revPanel.opts = opts;
  _modalRevision(_cabModal('Revisión del informe') +
    '<div class="ed-modal-cuerpo"><p class="ed-rev-estado">Revisando el informe…</p></div>' +
    '<div class="ed-modal-pie"><button type="button" class="ed-btn ed-btn-neutro" data-ed-rev-cerrar>Cancelar</button></div>');
  pedirJsonIA(armarMensajeCritica(_informeActual(), recolectarDatosWizard().d, opts)).then(function (ia) {
    if (!_revPanel) return; // cerró mientras llegaba
    if (!ia.ok) return _criticaLocal();
    var c = ia.json || {};
    function arr(x) {
      return Array.isArray(x) ? x.map(function (s) { return String(s || '').trim(); }).filter(Boolean) : [];
    }
    var preguntas = (Array.isArray(c.preguntas) ? c.preguntas : []).slice(0, 2).map(function (p) {
      return (p && typeof p === 'object') ? {
        pregunta: String(p.pregunta || '').trim(),
        opciones: arr(p.opciones).slice(0, 4)
      } : null;
    }).filter(function (p) { return p && p.pregunta; });
    preguntas = filtrarPreguntasRepetidas(preguntas, opts.respuestasPrevias || _revResp);
    _revPanel.critica = {
      bien: arr(c.bien), falta: arr(c.falta), no_coincide: arr(c.no_coincide),
      forma: arr(c.forma).slice(0, 4), preguntas: preguntas
    };
    _pintarPaso1();
  });
}

// Sin servicio: chequeo local del validador, sin preguntas; sin problemas se
// sella en modo local («Revisado sin conexión»).
function _criticaLocal() {
  var problemas = validarInformeIA(_informeActual(), recolectarDatosWizard(), { sinCantidades: true }).problemas;
  if (!problemas.length) {
    // Sin problemas: se sella y se cierra, sin modal de solo confirmación
    // (decisión del usuario 2026-10-17).
    _sellarRevision('LOCAL');
    _cerrarPanelRevision();
    return;
  }
  _modalRevision(_cabModal('Revisión del informe · sin conexión') +
    '<div class="ed-modal-cuerpo"><div class="ed-crit"><h3>Corrige esto en el informe</h3><ul>' +
    problemas.map(function (p) { return '<li>' + _esc(p) + '</li>'; }).join('') +
    '</ul></div></div>' +
    '<div class="ed-modal-pie"><button type="button" class="ed-btn ed-btn-lleno" data-ed-rev-cerrar>Cerrar</button></div>');
}

function _respuestaPregunta(i) {
  var sel = document.querySelector('input[name="ed-preg-' + i + '"]:checked');
  if (!sel) return '';
  if (sel.value === 'otra') {
    var t = document.querySelector('[data-ed-preg-otra="' + i + '"]');
    return t ? t.value.trim() : '';
  }
  var p = _revPanel.critica.preguntas[i];
  return p ? (p.opciones[parseInt(sel.value, 10)] || '') : '';
}

// Las preguntas de la revisión son opcionales (2026-10-16): «Continuar»
// siempre está habilitado.
function _pintarPaso1() {
  var cr = _revPanel.critica;
  var grupos = [
    ['Está bien', cr.bien],
    ['Falta en el informe', cr.falta],
    ['No coincide con los datos de la visita', cr.no_coincide],
    ['Forma', cr.forma]
  ].filter(function (g) { return g[1].length; });
  var limpia = !cr.falta.length && !cr.no_coincide.length && !cr.forma.length;
  if (limpia && !cr.preguntas.length) {
    // Sin hallazgos ni preguntas: revisión limpia → sello directo y cierre,
    // sin modal de solo confirmación (decisión del usuario 2026-10-17).
    _sellarRevision('IA');
    _cerrarPanelRevision();
    return;
  }
  var html = _cabModal('Revisión del informe · 1 de 2') +
    '<div class="ed-modal-cuerpo"><div class="ed-crit">' +
    (grupos.length ? grupos.map(function (g) {
      return '<h3>' + _esc(g[0]) + '</h3><ul>' + g[1].map(function (s) { return '<li>' + _esc(s) + '</li>'; }).join('') + '</ul>';
    }).join('') : '<p class="ed-rev-ok">✓ La revisión no encontró problemas.</p>') +
    '</div>';
  if (cr.preguntas.length) {
    html += '<div class="ed-pregs">' + cr.preguntas.map(function (p, i) {
      return '<div class="ed-preg"><p>' + _esc(p.pregunta) + '</p>' +
        p.opciones.map(function (o, j) {
          return '<label><input type="radio" name="ed-preg-' + i + '" value="' + j + '"> ' + _esc(o) + '</label>';
        }).join('') +
        '<label><input type="radio" name="ed-preg-' + i + '" value="otra"> Otra respuesta</label>' +
        '<input type="text" class="ed-preg-otra" data-ed-preg-otra="' + i + '" placeholder="Escribe tu respuesta">' +
        '</div>';
    }).join('') + '</div>';
  }
  html += '</div>' +
    '<div class="ed-modal-pie"><button type="button" class="ed-btn ed-btn-lleno" data-ed-rev-continuar>Continuar</button></div>';
  _modalRevision(html);
}

// Paso 2: pide las correcciones con informe + respuestas + datos de la visita.
function _continuarRevision() {
  if (!_revPanel || !_revPanel.critica) return;
  _revPanel.respuestas = _revPanel.critica.preguntas.map(function (p, i) {
    return { pregunta: p.pregunta, respuesta: _respuestaPregunta(i) };
  }).filter(function (r) { return r.respuesta; });
  // Las respuestas se acumulan entre revisiones: no se vuelven a pedir.
  _revResp = acumularRespuestas(_revResp, _revPanel.respuestas);
  var opts = _revPanel.opts || {};
  _modalRevision(_cabModal('Revisión del informe · 2 de 2') +
    '<div class="ed-modal-cuerpo"><p class="ed-rev-estado">Preparando correcciones…</p></div>' +
    '<div class="ed-modal-pie"><button type="button" class="ed-btn ed-btn-neutro" data-ed-rev-cerrar>Cancelar</button></div>');
  pedirJsonIA(armarMensajeCorrecciones(_informeActual(), recolectarDatosWizard().d, _revPanel.critica, _revPanel.respuestas, opts)).then(function (ia) {
    if (!_revPanel) return;
    if (!ia.ok) {
      _modalRevision(_cabModal('Revisión del informe · 2 de 2') +
        '<div class="ed-modal-cuerpo"><p class="ed-rev-err">No se pudieron traer las correcciones.</p></div>' +
        '<div class="ed-modal-pie"><button type="button" class="ed-btn ed-btn-tinte" data-ed-rev-reintentar2>Reintentar</button>' +
        '<button type="button" class="ed-btn ed-btn-neutro" data-ed-rev-cerrar>Cerrar</button></div>');
      return;
    }
    var cambios = filtrarCambiosRevision(
      normalizarCambios((ia.json || {}).cambios, _informeActual(), opts.secciones),
      recolectarDatosWizard(), validarInformeIA)
      // Fuera los cambios que no aportan nada (2026-10-17): casi idénticos y
      // sin pérdidas — no se hacen elegir al inspector.
      .filter(function (c) { return propuestaAporta(c.original, c.texto); });
    if (!cambios.length) {
      _sellarRevision('IA');
      _cerrarPanelRevision();
      return;
    }
    _revPanel.cambios = cambios;
    _pintarPaso2();
  });
}

function _seccionNombre(sec) {
  return { antecedentes: 'Antecedentes', observaciones: 'Observaciones de campo',
    conclusion: 'Conclusiones', recomendacion: 'Recomendaciones' }[sec] || sec;
}

// Paso 2 con tarjetas elegibles (rediseño 2026-10-17, misma forma que el
// panel de revisión de la visita): sin opción por defecto, la elegida se
// vuelve el editor en su sitio y la otra queda al lado del mismo tamaño
// para seguir comparando. Elegir otra vez descarta lo editado antes.
function _tachadoIA(t) {
  t = String(t || '');
  if (typeof expresionesIA !== 'function') return { html: _esc(t), alguna: false };
  var expr = expresionesIA(t);
  if (!expr.length) return { html: _esc(t), alguna: false };
  var html = '', pos = 0;
  expr.forEach(function (x) {
    if (x.inicio > pos) html += _esc(t.slice(pos, x.inicio));
    html += '<del>' + _esc(t.slice(x.inicio, x.fin)) + '</del>';
    pos = x.fin;
  });
  if (pos < t.length) html += _esc(t.slice(pos));
  return { html: html, alguna: true };
}

// Una tarjeta («Tu texto» o «Propuesta»). Elegida → textarea editable.
function _tarjetaRevision(i, c, cual, elegida, otraElegida) {
  var titulo = cual === 'ia' ? 'Propuesta' : 'Tu texto';
  var usar = otraElegida ? 'Usar este' : (cual === 'ia' ? 'Usar la propuesta' : 'Usar mi texto');
  var html = '<div class="ed-op' + (elegida ? ' elegida' : '') + '">' +
    '<div class="ed-op-cab"><b>' + titulo + '</b>' +
    (elegida ? '<span class="ed-op-ok">✓ Queda este</span>'
      : '<button type="button" class="ed-btn ed-btn-neutro ed-btn-chico" data-ed-usar="' + i +
        '" data-ed-cual="' + cual + '">' + usar + '</button>') +
    '</div>';
  if (cual === 'ia') {
    var qc = resumenCambios(c.original, c.texto);
    html += '<ul class="ed-qc">' + (qc.length
      ? qc.map(function (x) { return '<li>' + _esc(x.texto) + '</li>'; }).join('')
      : '<li>Solo la redacción; el contenido queda igual.</li>') + '</ul>';
  }
  if (elegida) {
    html += '<textarea class="ed-op-txt" data-ed-c-txt="' + i + '" aria-label="' + titulo +
      ': texto que queda">' + _esc(_revPanel.textos[i]) + '</textarea>';
  } else if (cual === 'propio') {
    var tac = _tachadoIA(c.original);
    html += '<div class="ed-op-txt">' + tac.html + '</div>' +
      (tac.alguna ? '<div class="ed-op-nota">Lo tachado son expresiones típicas de textos generados por IA.</div>' : '');
  } else {
    html += '<div class="ed-op-txt">' + _esc(c.texto) + '</div>';
  }
  return html + '</div>';
}

function _htmlCambioRevision(i, c) {
  var el = _revPanel.eleccion[i];
  var aviso = _revPanel.avisos[i];
  return '<div class="ed-cambio" data-ed-c="' + i + '">' +
    '<div class="ed-cambio-cab">' + _esc(_seccionNombre(c.seccion) +
      ((c.seccion === 'conclusion' || c.seccion === 'recomendacion') ? ' · punto ' + c.numero : '')) + '</div>' +
    '<div class="ed-ops">' +
    _tarjetaRevision(i, c, 'propio', el === 'propio', el === 'ia') +
    _tarjetaRevision(i, c, 'ia', el === 'ia', el === 'propio') +
    '</div>' +
    (aviso ? '<div class="ed-aviso-casilla">' + _esc(aviso) + '</div>' : '') +
    '</div>';
}

function _piePaso2() {
  var n = _revPanel.eleccion.filter(Boolean).length;
  var m = _revPanel.cambios.length;
  return '<span class="ed-rev-falta">' + (n < m ? 'Falta elegir ' + (m - n) + ' de ' + m + '.' : 'Todo listo.') + '</span>' +
    '<button type="button" class="ed-btn ed-btn-lleno" data-ed-rev-aplicar' + (n < m ? ' disabled' : '') + '>Aplicar</button>';
}

function _pintarPaso2() {
  var d = recolectarDatosWizard().d;
  _revPanel.eleccion = _revPanel.cambios.map(function () { return null; });
  _revPanel.textos = _revPanel.cambios.map(function () { return ''; });
  _revPanel.avisos = _revPanel.cambios.map(function (c) { return avisoCasillaVisita(c, d); });
  _modalRevision(_cabModal('Revisión del informe · 2 de 2') +
    '<div class="ed-modal-cuerpo"><p class="ed-rev-estado">Elige en cada cambio: tu texto o la propuesta. Nada se cambia solo.</p>' +
    _revPanel.cambios.map(function (c, i) { return _htmlCambioRevision(i, c); }).join('') +
    '</div><div class="ed-modal-pie">' + _piePaso2() + '</div>', true);
}

// Elegir «Usar mi texto» / «Usar la propuesta»: repinta SOLO ese bloque y el
// pie (repintar el modal entero devuelve el scroll del cuerpo a cero).
function _usarTextoRevision(i, cual) {
  if (!_revPanel || !_revPanel.cambios) return;
  var c = _revPanel.cambios[i];
  if (!c || (cual !== 'propio' && cual !== 'ia')) return;
  _revPanel.eleccion[i] = cual;
  _revPanel.textos[i] = cual === 'ia' ? c.texto : c.original;
  var bloque = document.querySelector('[data-ed-c="' + i + '"]');
  if (bloque) bloque.outerHTML = _htmlCambioRevision(i, c);
  var pie = document.querySelector('#ed-modal .ed-modal-pie');
  if (pie) pie.innerHTML = _piePaso2();
  var t = document.querySelector('[data-ed-c-txt="' + i + '"]');
  if (t) {
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }
}

function _aplicarCambiosRevision() {
  if (!_revPanel || !_revPanel.cambios) return;
  var usoIA = false;
  _revPanel.cambios.forEach(function (c, i) {
    var cual = _revPanel.eleccion[i];
    if (!cual) return;
    if (cual === 'ia') usoIA = true;
    var texto = _revPanel.textos[i];
    // Comparación exacta (2026-10-17): la normalizada ignoraba una corrección
    // de solo puntuación o tildes y no la aplicaba.
    if (String(texto).trim() === String(c.original).trim()) return; // no cambió nada
    if (c.seccion === 'antecedentes') _el('ed-antecedentes').textContent = texto;
    else if (c.seccion === 'observaciones') _el('ed-obs').textContent = texto;
    else {
      var id = c.seccion === 'conclusion' ? 'ed-concl' : 'ed-rec';
      var ol = _el(id);
      var items = document.querySelectorAll('#' + id + ' > .ed-item:not(.ed-item-fijo)');
      var li = items[c.numero - 1];
      if (li) li.querySelector('.ed-ed').textContent = texto;
      else ol.insertBefore(_item(texto, true), ol.querySelector('.ed-item-fijo') || null);
      _pintarVacio(id);
    }
  });
  _sellarRevision(usoIA ? 'IA' : 'PROPIO'); // huella del informe ya corregido
  _pintarSugerencias();
  _programarGuardar();
  _cerrarPanelRevision();
}

// ── Generar Word ─────────────────────────────────────────────────────
function _pintarErrorGenerar(msg) {
  var el = _el('ed-error');
  el.hidden = !msg;
  el.innerHTML = msg
    ? '<span>No se pudo generar el informe: ' + _esc(msg) + '</span>' +
      '<button type="button" class="ed-btn ed-btn-tinte ed-btn-chico" data-ed-gen-reintentar>Reintentar</button>'
    : '';
}

async function _generarWord() {
  if (!_condicionWord().ok) return;
  _pintarErrorGenerar('');
  // El asistente oculto sigue siendo el almacén: #obs, #fechaInforme y pies
  // de foto quedan al día antes de leer el payload.
  _guardarEditor();
  var tFinal = _tFinalDesdeDocumento();
  mostrarModalEmision('generando', { fase: 2 });
  try {
    var resultado = USAR_PLANTILLA_F43
      ? await generarInformeF43ViaPlantilla(tFinal)
      : await _finalizarInformeRenderDocx(tFinal);
    // El Word queda a mano en el panel («Abrir el Word generado»), no solo en el aviso.
    _linkWord = _linkGoogle(resultado && resultado.link) || _linkWord;
    _pintarAbrirWord();
    _pintarEstado();
    mostrarModalEmision('exito', { link: resultado && resultado.link });
  } catch (e) {
    // Sin mostrarModalEmision('error'): su «Reintentar» llama generarInformeV2()
    // y pisaría el documento editado. El error se muestra aquí, en el editor.
    mostrarModalEmision('cerrar');
    _pintarErrorGenerar(e.message || 'error desconocido');
  }
}

// ── Arranque del borrador ─────────────────────────────────────────────
// 1) lo de este equipo (al instante, también sin señal); 2) aviso si la
// visita cambió; 3) el servidor decide si hay algo más nuevo de otro equipo.
if (_borrador) _aplicarSnapshot(_borrador);
_revisarCambioVisita();
_cargarServidor();

})();
