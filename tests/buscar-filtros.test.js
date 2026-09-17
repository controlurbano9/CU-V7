// ═══════════════════════════════════════════════════════════════
// tests/buscar-filtros.test.js — filtros y orden de la pantalla Buscar.
//
// Cubre lo que se rompe en silencio:
//   · El conteo de los chips de estado es FACETADO: se calcula sobre el
//     universo sin la selección de estado. Si alguien vuelve a meter la
//     cláusula de estado en el filtro base, activar "Pendientes" deja los
//     otros tres chips en 0 y el número deja de servir para navegar.
//   · La antigüedad compara por día: con milisegundos, un radicado de hoy
//     a las 18:00 daría "0,3 días" y el redondeo decidiría al azar.
//   · El orden por dirección sin localeCompare manda las tildes al final.
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raizDir = path.join(__dirname, '..');
const srcBuscar = fs.readFileSync(path.join(raizDir, 'buscar.jsx'), 'utf8');
const srcUtils = fs.readFileSync(path.join(raizDir, 'utils.js'), 'utf8');

const ctx = vm.createContext({ Date, Math, isNaN, parseInt, console });

// parsearFecha (utils.js) es la dependencia de _pasaAntiguedad.
const reParsear = /function parsearFecha\(valor\) \{[\s\S]*?\n\}/;
const mParsear = reParsear.exec(srcUtils);
assert.ok(mParsear, 'no se encontró parsearFecha en utils.js');
vm.runInContext(mParsear[0], ctx);

// ANTIGUEDADES + _pasaAntiguedad + _ordenarGrupos (buscar.jsx)
const mAnt = /const ANTIGUEDADES = \[[\s\S]*?\n\];/.exec(srcBuscar);
assert.ok(mAnt, 'no se encontró ANTIGUEDADES en buscar.jsx');
vm.runInContext(mAnt[0], ctx);

for (const nombre of ['_pasaAntiguedad', '_ordenarGrupos']) {
  const re = new RegExp('function ' + nombre + '\\([\\s\\S]*?\\n\\}');
  const fn = re.exec(srcBuscar);
  assert.ok(fn, 'no se encontró ' + nombre + ' en buscar.jsx');
  vm.runInContext(fn[0], ctx);
}
const pasaAntiguedad = vm.runInContext('_pasaAntiguedad', ctx);
const ordenarGrupos = vm.runInContext('_ordenarGrupos', ctx);

// ── Helpers ────────────────────────────────────────────────────
function ddmmaaaaHace(dias) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dias);
  const p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
}
const fila = (rad, extra) => Object.assign({ 'RADICADO': rad }, extra || {});

// ── Conteo facetado: contrato del código fuente ────────────────
//
// La lógica del filtro vive dentro de un useMemo del componente y no se
// puede invocar desde Node sin React. Lo que sí se puede vigilar —y es
// justo lo que se rompe— es que el universo base NO dependa del estado.
test('filtradosSinEstado no filtra por estado ni depende de filtrosEstado', () => {
  const m = /const filtradosSinEstado = useMemoB\(\(\) => \{[\s\S]*?\n  \}, \[([^\]]*)\]\);/.exec(srcBuscar);
  assert.ok(m, 'no se encontró el useMemo de filtradosSinEstado');
  const [cuerpo, deps] = [m[0], m[1]];
  assert.ok(!/filtrosEstado/.test(cuerpo),
    'filtradosSinEstado no puede mencionar filtrosEstado: los conteos dejarían de ser facetados');
  assert.ok(!deps.includes('filtrosEstado'),
    'filtrosEstado no puede estar en las deps de filtradosSinEstado');
  assert.ok(/filtroAntiguedad/.test(deps),
    'filtroAntiguedad sí debe entrar en el universo base (afecta los conteos)');
});

test('conteosEstado se calcula sobre filtradosSinEstado, no sobre filtrados', () => {
  const m = /const conteosEstado = useMemoB\(\(\) => \{[\s\S]*?\n  \}, \[([^\]]*)\]\);/.exec(srcBuscar);
  assert.ok(m, 'no se encontró el useMemo de conteosEstado');
  assert.ok(/filtradosSinEstado\.forEach/.test(m[0]),
    'conteosEstado debe recorrer filtradosSinEstado');
  assert.equal(m[1].trim(), 'filtradosSinEstado');
});

test('filtrados aplica el estado sobre el universo base, sin re-filtrar lo demás', () => {
  const m = /const filtrados = useMemoB\(\(\) => \{[\s\S]*?\n  \}, \[([^\]]*)\]\);/.exec(srcBuscar);
  assert.ok(m, 'no se encontró el useMemo de filtrados');
  assert.ok(/filtradosSinEstado/.test(m[0]), 'filtrados debe partir de filtradosSinEstado');
  assert.ok(!/BARRIO\/VEREDA|COMUNA|visitadoresBD/.test(m[0]),
    'filtrados no debe repetir las cláusulas del universo base');
});

// ── Antigüedad ─────────────────────────────────────────────────
test('un radicado de hace 10 días pasa 30 días pero no 7 ni >1 año', () => {
  const f = fila('1', { 'FECHA RADICADO': ddmmaaaaHace(10) });
  assert.equal(pasaAntiguedad(f, '30'), true);
  assert.equal(pasaAntiguedad(f, '90'), true);
  assert.equal(pasaAntiguedad(f, '7'), false);
  assert.equal(pasaAntiguedad(f, 'hoy'), false);
  assert.equal(pasaAntiguedad(f, '365'), false);
});

test('los bordes son inclusivos hacia abajo y exclusivos en >1 año', () => {
  assert.equal(pasaAntiguedad(fila('1', { 'FECHA RADICADO': ddmmaaaaHace(7) }), '7'), true);
  assert.equal(pasaAntiguedad(fila('1', { 'FECHA RADICADO': ddmmaaaaHace(8) }), '7'), false);
  assert.equal(pasaAntiguedad(fila('1', { 'FECHA RADICADO': ddmmaaaaHace(365) }), '365'), false);
  assert.equal(pasaAntiguedad(fila('1', { 'FECHA RADICADO': ddmmaaaaHace(366) }), '365'), true);
});

test('hoy es hoy aunque el radicado traiga hora', () => {
  assert.equal(pasaAntiguedad(fila('1', { 'FECHA RADICADO': ddmmaaaaHace(0) }), 'hoy'), true);
});

test('sin FECHA RADICADO no pasa ningún filtro activo, pero sí sin filtro', () => {
  const f = fila('1', { 'FECHA RADICADO': '' });
  assert.equal(pasaAntiguedad(f, '30'), false);
  assert.equal(pasaAntiguedad(f, '365'), false);
  assert.equal(pasaAntiguedad(f, ''), true);
});

test('una fecha futura cuenta como 0 días, no desaparece de la lista', () => {
  const f = fila('1', { 'FECHA RADICADO': ddmmaaaaHace(-5) });
  assert.equal(pasaAntiguedad(f, 'hoy'), true);
  assert.equal(pasaAntiguedad(f, '30'), true);
});

// ── Orden de grupos ────────────────────────────────────────────
const grupos = () => [
  ['20261100002', [fila('20261100002', { 'DIRECCION INFRACCION': 'Zarzal', 'ULTIMA_MODIFICACION': '2026-09-01T10:00:00Z' })]],
  ['Sin radicado', [fila('', { 'DIRECCION INFRACCION': 'Aaa', 'ULTIMA_MODIFICACION': '2026-09-17T10:00:00Z' })]],
  ['20261100010', [fila('20261100010', { 'DIRECCION INFRACCION': 'Ávila', 'ULTIMA_MODIFICACION': '2026-09-15T10:00:00Z' })]],
  ['20261100001', [fila('20261100001', { 'DIRECCION INFRACCION': 'Belén', 'ULTIMA_MODIFICACION': '' })]],
];
const claves = arr => arr.map(x => x[0]);

test('radicado descendente por defecto, con Sin radicado al final', () => {
  assert.deepEqual(claves(ordenarGrupos(grupos(), 'rad-desc')),
    ['20261100010', '20261100002', '20261100001', 'Sin radicado']);
});

test('radicado ascendente respeta el orden numérico, no el alfabético', () => {
  assert.deepEqual(claves(ordenarGrupos(grupos(), 'rad-asc')),
    ['20261100001', '20261100002', '20261100010', 'Sin radicado']);
});

test('última edición: la más reciente primero, sin fecha al final', () => {
  const r = claves(ordenarGrupos(grupos(), 'edit'));
  assert.deepEqual(r, ['20261100010', '20261100002', '20261100001', 'Sin radicado']);
});

test('dirección A-Z con tildes en su sitio (Ávila entre Aaa y Belén)', () => {
  // "Sin radicado" (Aaa) queda igualmente al final: la regla del grupo manda.
  const r = ordenarGrupos(grupos(), 'dir')
    .map(([, fs]) => fs[0]['DIRECCION INFRACCION']);
  assert.deepEqual(r, ['Ávila', 'Belén', 'Zarzal', 'Aaa']);
});

test('ordenar no muta el arreglo recibido', () => {
  const g = grupos();
  const antes = claves(g);
  ordenarGrupos(g, 'dir');
  assert.deepEqual(claves(g), antes);
});
