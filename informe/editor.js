// ═══════════════════════════════════════════════════════════════
// informe/editor.js — Editor del F-GGO-43 con forma de documento.
// Ronda 1 (docs/PLAN_2026-10-15_editor-informe.md): la hoja en el orden
// del informe, editable en su sitio, + sugerencias deterministas «De la
// visita». La revisión final, el catálogo, la «Propuesta» y «Generar
// Word» son ronda 2 (el botón queda deshabilitado).
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

// Conclusiones del inspector → un punto por párrafo.
function dividirPuntos(texto) {
  return String(texto || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
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
function sugerenciasConclusionesDeLaVisita(d, citaArt135) {
  citaArt135 = citaArt135 || function () { return ''; };
  var out = [];
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
  if (d.sin_licencia || d.estado_licencia === 'SIN_LICENCIA') {
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

// ── Export (patrón de utils.js) / arranque solo en modo documento ────

var _export = {
  detectarOrigenAntecedentes: detectarOrigenAntecedentes,
  fraseAntecedentes: fraseAntecedentes,
  dividirPuntos: dividirPuntos,
  sugerenciasConclusionesDeLaVisita: sugerenciasConclusionesDeLaVisita,
  sugerenciasRecomendacionesDeLaVisita: sugerenciasRecomendacionesDeLaVisita,
  jaccardPalabras: jaccardPalabras,
  quitarDuplicados: quitarDuplicados
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

var _borrador = null;
try { _borrador = JSON.parse(localStorage.getItem(_claveEditor()) || 'null'); } catch (e) {}
if (!_borrador || !_borrador._ts || !_borrador.antecedentes) _borrador = null;

// El mapa del generador se repinta aquí envolviendo setLocPreview.
var _setLocPreviewOrig = window.setLocPreview;
window.setLocPreview = function (dataUrl, fuenteLabel) {
  _setLocPreviewOrig(dataUrl, fuenteLabel);
  _pintarMapa();
};

// ── Contenedor ───────────────────────────────────────────────────────
var root = document.createElement('div');
root.id = 'ed-root';
root.innerHTML =
  '<header class="ed-top">' +
    '<div class="ed-tit"><b>Informe de inspección</b><span id="ed-sub"></span></div>' +
    '<div class="ed-top-acc">' +
      '<button type="button" class="ed-btn ed-btn-neutro" id="ed-anterior">Usar el generador anterior</button>' +
      '<button type="button" class="ed-btn ed-btn-lleno" disabled title="Disponible pronto">Generar Word</button>' +
    '</div>' +
  '</header>' +
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

      '<div class="ed-h">Observaciones de campo.</div>' +
      '<div class="ed-ui"><span class="ed-chip ed-chip-ok">✓ Revisado en la visita</span><span class="ed-ui-nota">Sin límite de largo. Lo que cambies aquí se revisa al final.</span></div>' +
      '<div class="ed-ed" contenteditable="true" id="ed-obs"></div>' +

      '<div class="ed-h">Resumen de lo aprobado por curaduría.</div>' +
      '<div class="ed-ui"><span class="ed-chip ed-chip-neutro">Solo lectura · se corrige en la visita</span></div>' +
      '<div id="ed-licencia"></div>' +

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
        '<ul class="ed-est" id="ed-est"></ul>' +
        '<button type="button" class="ed-btn ed-btn-lleno" disabled title="Disponible pronto">Generar Word</button>' +
        '<div class="ed-nota">Disponible pronto.</div>' +
      '</div>' +
    '</aside>' +
  '</main>' +
  '<div class="ed-barra">' +
    '<div class="ed-barra-txt" id="ed-barra-txt"></div>' +
    '<button type="button" class="ed-btn ed-btn-neutro" id="ed-anterior-movil">Generador anterior</button>' +
  '</div>';
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
(function () {
  var origenInicial = (_borrador && _borrador.origen) || detectarOrigenAntecedentes(_d);
  _el('ed-origen').value = origenInicial;
  _el('ed-antecedentes').textContent = (_borrador && _borrador.antecedentes) || fraseAntecedentes(_d, origenInicial);
  // Cambiar el origen re-arma la frase («cambia el origen», plan).
  _el('ed-origen').addEventListener('change', function () {
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

(function () {
  var pot = [
    ['Clasificación general del suelo', _d.clasificacion],
    ['Polígono uso del suelo', _d.polig_uso],
    ['Polígono de tratamiento', _d.polig_trat],
    ['Franja de intensidad', _d.franja],
    ['Suelo de protección o amenaza', _d.proteccion]
  ].filter(function (f) { return (f[1] || '').toString().trim(); });
  var html = '<div class="ed-sololectura"><p>Acorde con lo establecido en el Plan de Ordenamiento Territorial Acuerdo 033 de 2009, la ubicación del predio posee la siguiente normatividad:</p></div>';
  if (pot.length) {
    html += '<table class="ed-tabla ed-tabla-pot"><caption>CONSULTA NORMA DEL PREDIO SEGÚN POT</caption>' +
      pot.map(function (f) { return '<tr><th>' + _esc(f[0]) + '</th><td>' + _esc(f[1]) + '</td></tr>'; }).join('') + '</table>';
  }
  html += '<div class="ed-sololectura"><p>' + _esc(_construirConclusionIntro(_d)) + '</p></div>';
  _el('ed-concl-cab').innerHTML = html;
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
  textos.forEach(function (t) { ol.insertBefore(_item(t), fijo || null); });
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

// ── Sugerencias «De la visita» ───────────────────────────────────────
function _sugerenciasActuales(idLista) {
  var d = recolectarDatosWizard().d;
  return idLista === 'ed-concl'
    ? sugerenciasConclusionesDeLaVisita(d, _citaArt135)
    : sugerenciasRecomendacionesDeLaVisita(d);
}
function _pintarSugerencias() {
  ['ed-concl', 'ed-rec'].forEach(function (idLista) {
    var caja = _el('ed-sug-' + idLista.slice(3));
    var sugs = quitarDuplicados(_sugerenciasActuales(idLista), _textosLista(idLista));
    caja._sugs = sugs;
    if (!sugs.length) { caja.style.display = 'none'; return; }
    caja.style.display = '';
    caja.innerHTML = '<div class="ed-sug-t">Sugerencias · ' + sugs.length +
      ' <span>De la visita. No salen en el informe hasta que las apliques.</span></div>' +
      sugs.map(function (s, i) {
        return '<div class="ed-card"><div><span class="ed-chip ed-chip-info">De la visita</span> ' +
          '<small class="ed-card-porque">' + _esc(s.motivo) + '</small>' +
          '<p>' + _esc(s.texto) + '</p></div>' +
          '<button type="button" class="ed-btn ed-btn-tinte ed-btn-chico" data-ed-aplicar="' + idLista + '" data-ed-i="' + i + '">Aplicar</button></div>';
      }).join('');
  });
}
_pintarSugerencias();

// ── Estado (rail ≥1200 y barra inferior <1200) ───────────────────────
function _pintarEstado() {
  var nc = document.querySelectorAll('#ed-concl > .ed-item:not(.ed-item-fijo)').length;
  var nr = document.querySelectorAll('#ed-rec > .ed-item:not(.ed-item-fijo)').length;
  var total = _fotosAsistentes().length, conPie = _nFotosConPie();
  var obs = _el('ed-obs').textContent.trim();
  var filas = [
    ['ok', 'Antecedentes', 'Armados con los datos de la visita'],
    [obs ? 'ok' : 'pend', 'Observaciones de campo', obs ? 'Texto de la visita, editable' : 'Vacías'],
    [total && conPie === total ? 'ok' : (total ? 'pend' : 'no'), 'Registro fotográfico', total ? (total + ' fotos · ' + conPie + ' con pie') : 'Sin fotos'],
    [nc ? 'ok' : 'pend', 'Conclusiones', nc ? (nc + ' en el informe') : 'Ninguna todavía'],
    [nr ? 'ok' : 'pend', 'Recomendaciones', nr ? (nr + ' en el informe') : 'Ninguna todavía'],
    ['no', 'Revisión final', 'Pendiente']
  ];
  _el('ed-est').innerHTML = filas.map(function (f) {
    return '<li><span class="ed-dot ' + f[0] + '"></span><div>' + _esc(f[1]) + '<small>' + _esc(f[2]) + '</small></div></li>';
  }).join('');
  _el('ed-barra-txt').innerHTML = '<b>' + nc + ' conclusiones · ' + nr + ' recomendaciones</b>' +
    total + ' fotos · falta la revisión final';
}
_pintarEstado();

// ── Persistencia (localStorage fggo43_editor_<fila>) ─────────────────
var _tGuardar = null;
function _guardarEditor() {
  // El asistente oculto sigue siendo el almacén: #obs al día antes de guardar.
  var obsAsistente = _el('obs');
  if (obsAsistente && obsAsistente.value !== _el('ed-obs').textContent) {
    obsAsistente.value = _el('ed-obs').textContent;
    guardar && guardar();
  }
  try {
    localStorage.setItem(_claveEditor(), JSON.stringify({
      _ts: Date.now(),
      origen: _el('ed-origen').value,
      antecedentes: _el('ed-antecedentes').textContent,
      obs: _el('ed-obs').textContent,
      concl: _textosLista('ed-concl'),
      rec: _textosLista('ed-rec')
    }));
  } catch (e) { /* sin espacio: seguir editando igual */ }
}
function _programarGuardar() {
  clearTimeout(_tGuardar);
  _tGuardar = setTimeout(_guardarEditor, 400);
  _pintarEstado();
}
window.addEventListener('beforeunload', _guardarEditor);

// ── Eventos ──────────────────────────────────────────────────────────
root.addEventListener('input', function (e) {
  if (e.target.classList && e.target.classList.contains('ed-ed')) {
    _pintarSugerencias(); // la deduplicación compara contra lo ya aplicado
    _programarGuardar();
  }
});

root.addEventListener('click', function (e) {
  var b = e.target.closest ? e.target.closest('button') : null;
  if (!b) return;
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
    if (dirF === 'quitar') _el(divId).remove(); // el MutationObserver repinta
    else moverFoto(divId, dirF);
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
  }
});

// Cambios en el asistente oculto que mueven sugerencias o el cierre fijo.
document.querySelectorAll('.comp-ac').forEach(function (cb) {
  cb.addEventListener('change', function () {
    _pintarCierreFijo();
    _pintarSugerencias();
    _programarGuardar();
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

// ── «Usar el generador anterior»: recarga con ui=legacy (sin recordar) ──
function _usarGeneradorAnterior() {
  _guardarEditor();
  var p = new URLSearchParams(window.location.search);
  p.set('ui', 'legacy');
  window.location.href = window.location.pathname + '?' + p.toString();
}
_el('ed-anterior').addEventListener('click', _usarGeneradorAnterior);
_el('ed-anterior-movil').addEventListener('click', _usarGeneradorAnterior);

})();
