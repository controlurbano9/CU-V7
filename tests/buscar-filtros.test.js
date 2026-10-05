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

// SIN_RADICADO + _radicadoReal/_claveGrupo/_esSinRadicado: dependencias de _ordenarGrupos
const mSin = /const SIN_RADICADO = '[^']*';/.exec(srcBuscar);
assert.ok(mSin, 'no se encontró SIN_RADICADO en buscar.jsx');
vm.runInContext(mSin[0], ctx);

for (const nombre of ['_pasaAntiguedad', '_radicadoReal', '_claveGrupo', '_esSinRadicado', '_ordenarGrupos']) {
  const re = new RegExp('function ' + nombre + '\\([\\s\\S]*?\\n\\}');
  const fn = re.exec(srcBuscar);
  assert.ok(fn, 'no se encontró ' + nombre + ' en buscar.jsx');
  vm.runInContext(fn[0], ctx);
}
const pasaAntiguedad = vm.runInContext('_pasaAntiguedad', ctx);
const ordenarGrupos = vm.runInContext('_ordenarGrupos', ctx);
const claveGrupo = vm.runInContext('_claveGrupo', ctx);
const esSinRadicado = vm.runInContext('_esSinRadicado', ctx);

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

// ── Radicados sin número (filas migradas de V2) ────────────────
// Captura real 2026-10-05: con «Radicado ↓», la lista abría con «SIN
// RADICADO», «QUEJA VERBAL», «ORDEN PREVENTIVA», «OPERATIVO · 20 visitas»…
// (las letras van después de los dígitos) y los casos de 2026 quedaban abajo.
const conFecha = (rad, fecha, extra) => [rad, [fila(rad, Object.assign({ 'FECHA RADICADO': fecha }, extra || {}))]];

test('claveGrupo: solo un radicado con número agrupa; cada fila V2 va sola', () => {
  assert.equal(claveGrupo(fila('20261092195', { _idx: 5 })), '20261092195');
  assert.equal(claveGrupo(fila('Oficio-2026-09-239', { _idx: 5 })), claveGrupo(fila('OFICIO-2026-09-239', { _idx: 9 })));
  assert.notEqual(claveGrupo(fila('OPERATIVO', { _idx: 5 })), claveGrupo(fila('OPERATIVO', { _idx: 9 })));
  for (const rad of ['OPERATIVO', 'QUEJA VERBAL', 'OFICIO', 'OFICIO-SIN ORDEN', 'Sin radicado', 'SIN RADICADO', '', '6.345120, -75.561304', 'LAT 6.34 LON -75.56']) {
    assert.ok(esSinRadicado(claveGrupo(fila(rad, { _idx: 1 }))), rad + ' no es un radicado real');
  }
});

test('«SIN RADICADO» en mayúsculas y los textos de V2 van al final, en cualquier orden', () => {
  const g = [
    ['SIN RADICADO', [fila('SIN RADICADO', { 'DIRECCION INFRACCION': 'Aaa' })]],
    conFecha('20261100002', '01/10/2026', { 'DIRECCION INFRACCION': 'Zarzal' }),
    ['QUEJA VERBAL', [fila('QUEJA VERBAL', { 'DIRECCION INFRACCION': 'Abc' })]],
    conFecha('20251100001', '03/02/2025', { 'DIRECCION INFRACCION': 'Belén' }),
    [claveGrupo(fila('OPERATIVO', { _idx: 7 })), [fila('OPERATIVO', { _idx: 7, 'DIRECCION INFRACCION': 'Aab' })]],
  ];
  for (const orden of ['rad-desc', 'rad-asc', 'edit', 'dir']) {
    const r = claves(ordenarGrupos(g, orden));
    assert.deepEqual(r.slice(0, 2).sort(), ['20251100001', '20261100002'], orden + ': los radicados reales van primero');
    assert.ok(r.slice(2).every(esSinRadicado), orden + ': lo demás va al final');
  }
});

test('por radicado manda la fecha: «OFICIO-…» ya no salta delante de los «2026…»', () => {
  const g = [
    conFecha('OFICIO-2024-09-015', '12/02/2024'),
    conFecha('20261092195', '01/10/2026'),
    conFecha('OFICIO-2026-09-239', '29/09/2026'),
    conFecha('20251031877', '10/03/2025'),
  ];
  assert.deepEqual(claves(ordenarGrupos(g, 'rad-desc')),
    ['20261092195', 'OFICIO-2026-09-239', '20251031877', 'OFICIO-2024-09-015']);
  assert.deepEqual(claves(ordenarGrupos(g, 'rad-asc')),
    ['OFICIO-2024-09-015', '20251031877', 'OFICIO-2026-09-239', '20261092195']);
});

test('a igual fecha, el número; sin fecha legible, al final de los reales en los dos sentidos', () => {
  const g = [
    conFecha('20261100005', ''),
    conFecha('20261100003', '01/10/2026'),
    conFecha('20261100004', '01/10/2026'),
    ['OPERATIVO', [fila('OPERATIVO')]],
  ];
  assert.deepEqual(claves(ordenarGrupos(g, 'rad-desc')), ['20261100004', '20261100003', '20261100005', 'OPERATIVO']);
  assert.deepEqual(claves(ordenarGrupos(g, 'rad-asc')), ['20261100003', '20261100004', '20261100005', 'OPERATIVO']);
});

test('«+ Nueva visita» no se ofrece sobre un grupo sin radicado real', () => {
  const m = /const puedeNueva = [^;]*;/.exec(srcBuscar);
  assert.ok(m, 'no se encontró puedeNueva en buscar.jsx');
  assert.ok(/_esSinRadicado\(radicado\)/.test(m[0]),
    'puedeNueva debe descartar los grupos sin radicado real con _esSinRadicado');
});
