// ═══════════════════════════════════════════════════════════════
// tests/asignacion-fecha.test.js — asignar para una fecha posterior.
//
// Tres piezas que, si fallan, lo hacen en silencio y en producción:
//   · _fechaAsignacionValida (backend): lo que no sea DD/MM/YYYY real cae a
//     la fecha del servidor. Sin esta validación una cadena rara entraba
//     tal cual a FECHA ASIGNACION VISITA y rompía el conteo de DIAS.
//   · diasDesde: con fecha programada a futuro y visita completada antes,
//     daba negativo y ese número iba a la columna DIAS al completar.
//   · clonarParaSeguimiento: si los links de la visita anterior viajan, la
//     visita nueva nace apuntando al acta y al informe de la otra.
//
// El backend vive FUERA de este repo (claves en texto plano); si no está,
// esa parte se salta en vez de fallar.
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ── utils.js (cliente) ─────────────────────────────────────────
const utilsSrc = fs.readFileSync(path.join(__dirname, '..', 'utils.js'), 'utf8');
const ctxU = vm.createContext({ Date, Math, String, Object, Number, isNaN, Intl });
for (const re of [
  /function _padFecha\([\s\S]*?\r?\n\}/,
  /function parsearFecha\(valor\) \{[\s\S]*?\r?\n\}/,
  /function diasDesde\(fecha\) \{[\s\S]*?\r?\n\}/,
  /function clonarParaSeguimiento\(filaBase, nVisita\) \{[\s\S]*?\r?\n\}/,
]) {
  const m = re.exec(utilsSrc);
  assert.ok(m, 'no se encontró en utils.js: ' + re);
  vm.runInContext(m[0], ctxU);
}
const diasDesde = vm.runInContext('diasDesde', ctxU);
const clonar = vm.runInContext('clonarParaSeguimiento', ctxU);

function ddmmaaaaDesplazado(dias) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  const p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
}

test('diasDesde nunca devuelve negativo con una fecha programada a futuro', () => {
  assert.equal(diasDesde(ddmmaaaaDesplazado(5)), 0);
  assert.equal(diasDesde(ddmmaaaaDesplazado(0)), 0);
  assert.equal(diasDesde(ddmmaaaaDesplazado(-3)), 3);
});

test('diasDesde sigue devolviendo null con una fecha ilegible', () => {
  assert.equal(diasDesde(''), null);
  assert.equal(diasDesde('31/02/2026'), null);
});

test('clonarParaSeguimiento conserva los datos fijos del radicado', () => {
  const base = {
    'RADICADO': '20261143210', 'DIRECCION INFRACCION': 'CL 50 # 32-10',
    'BARRIO/VEREDA': 'Niquia', 'COMUNA': '1', 'LATITUD': '6.34', 'LONGITUD': '-75.55',
  };
  const d = clonar(base, 3);
  assert.equal(d['RADICADO'], '20261143210');
  assert.equal(d['DIRECCION INFRACCION'], 'CL 50 # 32-10');
  assert.equal(d['LATITUD'], '6.34');
  assert.equal(d['N° VISITA'], '3');
  assert.equal(d['N VISITA'], '3');
  assert.equal(d['ESTADO VISITA'], 'PENDIENTE');
});

test('clonarParaSeguimiento no hereda visitador ni entregables de la anterior', () => {
  const base = {
    'RADICADO': '1', 'VISITADOR(ES)': 'MAURICIO RESTREPO / ALEJANDRO RUIZ',
    'LINK_PDF_ACTA': 'https://drive/acta', 'LINK_DOCX_INFORME': 'https://drive/informe',
    'LINK_DRIVE': 'https://drive/carpeta', 'LINK_ORDEN_POLICIA': 'https://drive/orden',
    'LINK_REGISTRO_FOTOS': 'https://drive/rf', 'LINK_SOLICITUD_VIGILANCIA': 'https://drive/of',
    'FECHA DE VISITA': '12/09/2026', 'FECHA ASIGNACION VISITA': '10/09/2026',
    'N° ORDEN DE POLICIA': '2026-09-015', 'ACTUACION / OBSERVACIONES': 'texto viejo',
    'ULTIMA_MODIFICACION': '2026-09-12T10:00:00Z',
  };
  const d = clonar(base, 2);
  assert.equal(d['VISITADOR(ES)'], '');
  assert.equal(d['_seguimiento'], true);
  for (const k of ['LINK_PDF_ACTA', 'LINK_DOCX_INFORME', 'LINK_DRIVE', 'LINK_ORDEN_POLICIA',
    'LINK_REGISTRO_FOTOS', 'LINK_SOLICITUD_VIGILANCIA', 'FECHA DE VISITA',
    'FECHA ASIGNACION VISITA', 'N° ORDEN DE POLICIA', 'ACTUACION / OBSERVACIONES',
    'ULTIMA_MODIFICACION']) {
    assert.equal(d[k], '', k + ' no debería viajar a la visita de seguimiento');
  }
});

test('clonarParaSeguimiento no muta el original', () => {
  const base = { 'RADICADO': '1', 'VISITADOR(ES)': 'MAURICIO' };
  clonar(base, 2);
  assert.equal(base['VISITADOR(ES)'], 'MAURICIO');
  assert.equal(base['_seguimiento'], undefined);
});

// ── apps_script_unificado.js (backend, fuera del repo) ─────────
const BACKEND = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const hay = fs.existsSync(BACKEND);
let validar = null;
if (hay) {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const re = /function _fechaAsignacionValida\(s\) \{[\s\S]*?\r?\n\}/;
  const m = re.exec(src);
  assert.ok(m, 'no se encontró _fechaAsignacionValida en apps_script_unificado.js');
  // Utilities.formatDate es de Apps Script: se sustituye por un equivalente
  // mínimo (solo se usa para normalizar a DD/MM/YYYY con dos dígitos).
  const ctxB = vm.createContext({
    Date, String, parseInt,
    Utilities: {
      formatDate(d) {
        const p = n => String(n).padStart(2, '0');
        return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
      },
    },
  });
  vm.runInContext(m[0], ctxB);
  validar = vm.runInContext('_fechaAsignacionValida', ctxB);
}

test('el backend acepta DD/MM/YYYY y la normaliza a dos dígitos', { skip: !hay }, () => {
  assert.equal(validar('22/09/2026'), '22/09/2026');
  assert.equal(validar('1/9/2026'), '01/09/2026');
  assert.equal(validar('  05/10/2026  '), '05/10/2026');
});

test('el backend rechaza lo que no es una fecha real', { skip: !hay }, () => {
  for (const malo of ['', null, undefined, '2026-09-22', '31/02/2026', '32/01/2026',
    '12/13/2026', 'mañana', '22/09/26', '22-09-2026']) {
    assert.equal(validar(malo), '', JSON.stringify(malo) + ' no debería pasar');
  }
});
