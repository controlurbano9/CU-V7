// ═══════════════════════════════════════════════════════════════
// tests/citaciones.test.js — armado del renglón de la hoja CITACIONES.
//
// Lo que se vigila: que la celda compuesta de BD ("DD/MM/YYYY · HH:MM AM/PM")
// se parta bien en FECHA CITACIÓN + HORA, que una visita sin citación no
// genere renglón, y que el orden de columnas sea el de la hoja real.
//
// Las funciones se extraen de `apps_script_unificado.js`, que vive FUERA de
// este repo (tiene claves en texto plano y no puede versionarse aquí). Si no
// está, la prueba se salta en vez de fallar — así el repo público sigue verde.
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BACKEND = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const hay = fs.existsSync(BACKEND);

const ctx = vm.createContext({ Number });
if (hay) {
  const src = fs.readFileSync(BACKEND, 'utf8');
  for (const nombre of ['_partirFechaCitacion', '_filaCitacion', '_claveCitacion', '_citOrden', '_direccionConBarrio']) {
    const re = new RegExp('function ' + nombre + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}');
    const fn = re.exec(src);
    assert.ok(fn, 'no se encontró ' + nombre + ' en apps_script_unificado.js');
    vm.runInContext(fn[0], ctx);
  }
}
const partir = hay ? vm.runInContext('_partirFechaCitacion', ctx) : null;
const filaCit = hay ? vm.runInContext('_filaCitacion', ctx) : null;
const orden = hay ? vm.runInContext('_citOrden', ctx) : null;
const opts = { skip: hay ? false : 'apps_script_unificado.js no está en esta copia' };

// Lo que sale del `vm` pertenece a otro realm: sus objetos no comparten
// prototipo con los de aquí y `deepStrictEqual` los rechaza aunque el
// contenido sea idéntico. Se recrea en este realm antes de comparar.
const aqui = v => (v === null ? null : JSON.parse(JSON.stringify(v)));

// Encabezados de BD VISITAS en el mínimo necesario, en un orden cualquiera:
// `col()` resuelve por nombre, así que la prueba no depende de las letras.
const HEADERS = ['RADICADO', 'FECHA RADICADO', 'DENUNCIANTE/REMITENTE',
  'NOMBRE PERSONA ATIENDE', 'DIRECCION INFRACCION', 'FECHA CITACION'];
const col = n => HEADERS.indexOf(n) + 1;

test('celda compuesta → fecha y hora separadas', opts, () => {
  assert.deepEqual(aqui(partir('17/09/2026 · 02:30 PM')), { fecha: '17/09/2026', hora: '02:30 PM' });
  assert.deepEqual(aqui(partir('1/9/2026 · 8:00 AM')), { fecha: '1/9/2026', hora: '8:00 AM' });
});

test('fecha sin hora: hora vacía, no null', opts, () => {
  assert.deepEqual(aqui(partir('17/09/2026')), { fecha: '17/09/2026', hora: '' });
});

test('sin citación → null (esa visita no entra a la hoja)', opts, () => {
  assert.equal(partir('No se deja citación'), null);
  assert.equal(partir(''), null);
  assert.equal(partir(null), null);
  assert.equal(partir('pendiente'), null);
});

test('renglón completo en el orden de la hoja', opts, () => {
  const datos = ['2026-123', '01/09/2026', 'JUAN QUEJOSO', 'PEDRO ATIENDE',
    'CL 50 # 32-10', '17/09/2026 · 02:30 PM'];
  assert.deepEqual(aqui(filaCit(col, datos)), [
    '2026-123', '01/09/2026', 'JUAN QUEJOSO', 'PEDRO ATIENDE',
    'CL 50 # 32-10', '17/09/2026', '02:30 PM',
    '', '',   // SUSTANCIADOR y EXPEDIENTE van vacíos a propósito
  ]);
});

test('visita completada sin citación no genera renglón', opts, () => {
  const datos = ['2026-123', '01/09/2026', 'JUAN', 'PEDRO', 'CL 50 # 32-10',
    'No se deja citación'];
  assert.equal(filaCit(col, datos), null);
});

test('orden retroactivo por FECHA DEVOLUCION; sin fecha va al final', opts, () => {
  const fechas = ['15/09/2026', '01/09/2026', '', '02/12/2025'];
  const ordenadas = fechas.slice().sort((a, b) => orden(a) - orden(b));
  assert.deepEqual(ordenadas, ['02/12/2025', '01/09/2026', '15/09/2026', '']);
});
