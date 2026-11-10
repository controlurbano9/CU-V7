// ═══════════════════════════════════════════════════════════════
// tests/permisos-rol.test.js — revisión de permisos por rol (2026-11-10).
// Lo que la pantalla deja hacer a cada rol debe calzar con lo que el backend
// le permite (el error de origen: la Agenda del supervisor pedía las reglas,
// que el backend solo daba al ADMIN, y la pantalla entera fallaba).
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const BACK = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const conBack = { skip: fs.existsSync(BACK) ? false : 'sin backend en esta copia' };

test('Semana de Inicio: mover de día y ordenar lo ajeno solo con puedeGestionar (ADMIN)', () => {
  const sv = leer('semana-visitas.jsx');
  assert.match(sv, /function puedeMover\(f\) \{\s*return !!puedeGestionar &&/);
  assert.match(sv, /return !!puedeGestionar \|\| \(!!miNombre &&/);
  assert.match(sv, /r && r\.omitidas/, 'avisa cuando el backend omite filas al ordenar');
  const home = leer('home.jsx');
  assert.match(home, /puedeGestionar=\{usuario\.rol === 'ADMIN'\}/);
  // Quien tiene la Agenda (admin y supervisor) la abre tocando un día.
  assert.match(home, /onAbrirDia=\{veTodo \?/);
});

test('Agenda: no se arrastra una inspección sin hora; el borrador es por usuario', () => {
  const ag = leer('agenda-semana.jsx');
  assert.match(ag, /if \(it\.tipo === 'insp' && !it\.hora\) return false;/);
  assert.match(ag, /function _asClave\(quien\)/);
  assert.match(ag, /_asGuardarBorrador\(borrador, quien\)/);
  // Las reglas no bloquean la pantalla si no se pueden leer.
  assert.match(ag, /leerConfigAgenda\(\{ onActualizado: setCfg \}\)\.catch\(\(\) => null\)/);
});

test('backend: el supervisor lee las reglas de la agenda; guardar sigue siendo del admin', conBack, () => {
  const src = fs.readFileSync(BACK, 'utf8');
  const i = src.indexOf("case 'leerConfigAgenda':");
  assert.match(src.slice(i, i + 300), /rol === 'SUPERVISOR'/);
});

test('backend: guardar no cierra ni reabre una visita si no es ADMIN', conBack, () => {
  const src = fs.readFileSync(BACK, 'utf8');
  const ac = src.slice(src.indexOf("case 'actualizar':"), src.indexOf("case 'resetPin':"));
  assert.match(ac, /_esComplAc\(nuevoEstAc\) !== _esComplAc\(estadoAnteriorAc\)/);
  assert.ok(ac.indexOf('_esComplAc(nuevoEstAc)') < ac.indexOf('.setValues([datos.valores])'), 'el control va antes de escribir');
  const ag = src.slice(src.indexOf("case 'agregar':"), src.indexOf("case 'actualizar':"));
  assert.match(ag, /COMPLETAD\[OA\]/);
});

test('backend: leerHoja solo entrega las hojas que usa la app', conBack, () => {
  const src = fs.readFileSync(BACK, 'utf8');
  const fn = src.slice(src.indexOf('function leerHojaPorNombre('), src.indexOf('function leerHojaPorNombre(') + 1200);
  assert.match(fn, /var HOJAS_LEIBLES = \[HOJA_BD, 'CATALOGO_HALLAZGOS'\];/);
  assert.match(fn, /HOJAS_LEIBLES\.indexOf\(String\(nombreHoja\)\.trim\(\)\) < 0/);
});
