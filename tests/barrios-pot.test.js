// ═══════════════════════════════════════════════════════════════
// tests/barrios-pot.test.js — La lista de barrios del formulario debe
// resolver todo nombre que venga de la capa Barrios/Veredas del POT.
// Si no resuelve, el barrio cae a texto libre (era el síntoma «Otro...»).
//
// Los nombres del POT van fijados aquí a propósito: la prueba no debe
// depender de la red. Fuente: controlurbano9/pot-bello, capas
// Barrios.geojson (NOM_BARRIO) y Veredas.geojson (NOMBRE), 2026-09-13.
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Extrae del JSX solo el bloque de barrios (no hay build de módulos aquí).
// Los patrones toleran CRLF: con core.autocrlf=true el working tree en
// Windows queda con fin de linea CRLF, y un patron anclado al salto de
// linea sin admitirlo no encontraba nada tras un checkout limpio: el test
// fallaba sin que el codigo hubiera cambiado.
function cargarResolutor() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'nueva-visita.jsx'), 'utf8');
  const trozos = [
    /const BARRIOS_POR_COMUNA = \[[\s\S]*?\n\];/,
    /function _quitarTildes\(s\) \{[\s\S]*?\}\r?\n/,
    /function _canonBarrio\(s\) \{[\s\S]*?\n\}/,
    /const _ALIAS_BARRIO_POT = \{[\s\S]*?\n\};/,
    /const _LISTA_BARRIOS = [^\n]*/,
    /const _LISTA_VEREDAS = [^\n]*/,
    /function _barrioDeLista\(nombre, preferirVereda\) \{[\s\S]*?\n\}/,
  ].map(re => {
    const m = src.match(re);
    assert.ok(m, 'no se encontró en nueva-visita.jsx: ' + re);
    return m[0];
  });
  const ctx = { module: {} };
  vm.createContext(ctx);
  vm.runInContext(trozos.join('\n') + '\nmodule.exports = { _barrioDeLista, BARRIOS_POR_COMUNA };', ctx);
  return ctx.module.exports;
}

// NOM_BARRIO de Barrios.geojson que difieren en grafía de la lista, más los
// cuatro que faltaban (HOSPITAL MENTAL, LINEA FERREA…, Cerezales, Croacia).
const POT = [
  'ZONA INDUSTRIAL Nº1', 'ZONA INDUSTRIAL Nº7', 'JOSE A. GALAN', 'CONGOLO',
  'NAZARETH', 'RINCON SANTO', 'LA GRAN AVENIDA', 'NAVARRA',
  'VILLA DE OCCIDENTE', 'NIQUIA BIFAMILIAR', 'HOSPITAL MENTAL',
  'LINEA FERREA Y DOBLE CALZADA', 'ALTOS DE NIQUIA', 'CIUDAD NIQUIA',
  // Veredas (NOMBRE, con tildes y sin prefijo 'Vda.')
  'Cerezales', 'Croacia', 'El Tambo', 'La Unión', 'Quitasol', 'Sabanalarga',
];

test('todo nombre del POT resuelve a una opción de la lista', () => {
  const { _barrioDeLista, BARRIOS_POR_COMUNA } = cargarResolutor();
  const opciones = new Set([].concat(...BARRIOS_POR_COMUNA.map(g => g.barrios)));
  for (const nombre of POT) {
    const r = _barrioDeLista(nombre);
    assert.ok(r, 'sin resolver: ' + nombre);
    assert.ok(opciones.has(r), nombre + ' → "' + r + '" no está en la lista');
  }
});

test('en rural, un nombre que es vereda y barrio a la vez resuelve a la vereda', () => {
  const { _barrioDeLista } = cargarResolutor();
  // 'Tierradentro' es vereda (rural) y barrio de la comuna 6.
  assert.equal(_barrioDeLista('Tierradentro', true), 'Vda. Tierradentro');
  assert.equal(_barrioDeLista('Tierradentro', false), 'Tierradentro');
  assert.equal(_barrioDeLista('Hato Viejo', true), 'Vda. Hatoviejo');
});

test('un barrio inexistente no resuelve (no inventa coincidencias)', () => {
  const { _barrioDeLista } = cargarResolutor();
  assert.equal(_barrioDeLista('Barrio Que No Existe'), '');
  assert.equal(_barrioDeLista(''), '');
  assert.equal(_barrioDeLista(null), '');
});
