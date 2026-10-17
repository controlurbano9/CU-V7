// ═══════════════════════════════════════════════════════════════
// tests/buscar-filtros.test.js — contrato de la pantalla Buscar (E5c1).
//
// La lógica de filtrado/orden vive en utils.js y se prueba en
// buscar-e5.test.js; aquí se vigila lo que se rompe en silencio en
// buscar.jsx:
//   · _claveGrupoBQ: solo un radicado con número agrupa; las filas V2
//     van sueltas (fase 0: «OPERATIVO · 20 visitas» agrupaba casos
//     distintos y «+ Nueva visita» clonaba una cualquiera).
//   · Los conteos de los chips de estado son FACETADOS: se calculan
//     sobre el universo SIN la selección de estado (filtrarBuscar con
//     'estado' como excepción). Si alguien vuelve a meter la cláusula
//     de estado en el universo base, activar «Pendientes» deja los
//     otros tres chips en 0 y el número deja de servir para navegar.
//   · La gestión del admin no ofrece «+ Nueva visita» sobre un caso sin
//     radicado real.
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

// _claveGrupoBQ es pura: recibe un caso preparado y devuelve la clave.
const mClave = /function _claveGrupoBQ\(c\) \{[\s\S]*?\n\}/.exec(srcBuscar);
assert.ok(mClave, 'no se encontró _claveGrupoBQ en buscar.jsx');
const ctx = vm.createContext({ String: String });
vm.runInContext(mClave[0], ctx);
const claveGrupo = vm.runInContext('_claveGrupoBQ', ctx);

// Un caso mínimo con lo que _claveGrupoBQ lee: tipo, id y nRad
// (el radicado normalizado en mayúsculas, como lo deja prepararCasoBuscar).
const caso = (rad, tipo, id) => ({
  rad: rad, nRad: String(rad || '').toUpperCase(),
  tipo: tipo != null ? tipo : 'PQR', id: id || 1,
});

// ── Agrupación por caso ────────────────────────────────────────
test('claveGrupo: solo un radicado con número agrupa; cada fila V2 va sola', () => {
  assert.equal(claveGrupo(caso('20261092195')), '20261092195');
  // «Oficio-…» y «OFICIO-…» son el mismo caso (fila 1662 corregida a mano).
  assert.equal(claveGrupo(caso('Oficio-2026-09-239', 'OFICIO', 5)),
    claveGrupo(caso('OFICIO-2026-09-239', 'OFICIO', 9)));
  for (const rad of ['OPERATIVO', 'QUEJA VERBAL', 'OFICIO', 'Sin radicado', 'SIN RADICADO', '',
    '6.345120, -75.561304', 'LAT 6.34 LON -75.56']) {
    const c = caso(rad, 'V2', 7);
    assert.notEqual(claveGrupo(c), claveGrupo(caso(rad, 'V2', 9)),
      '«' + rad + '» sin radicado real no puede agrupar filas distintas');
    assert.ok(String(claveGrupo(c)).indexOf('v2:') === 0, '«' + rad + '» debe llevar clave V2 propia');
  }
});

// ── Conteo facetado: contrato del código fuente ────────────────
// (la lógica vive dentro de un useMemo del componente y no se puede
// invocar desde Node sin React; lo que se vigila es que el universo base
// NO dependa de la selección de estado).
test('conteosEstado se calcula sobre el universo SIN la selección de estado', () => {
  const m = /const conteosEstado = useMemoB\(\(\) => \{[\s\S]*?\n  \}, \[universo, S\]\);/.exec(srcBuscar);
  assert.ok(m, 'no se encontró el useMemo de conteosEstado (deps [universo, S])');
  assert.ok(/filtrarBuscar\(universo, S, 'estado'\)/.test(m[0]),
    'conteosEstado debe partir de filtrarBuscar(universo, S, \'estado\'): el conteo de cada chip ignora la selección de estado');
});

test('la lista parte de filtrarBuscar con TODOS los grupos (sin excepciones)', () => {
  const m = /const lista = useMemoB\(\(\) => \{[\s\S]*?\n  \}, \[universo, S, orden\]\);/.exec(srcBuscar);
  assert.ok(m, 'no se encontró el useMemo de lista');
  assert.ok(/filtrarBuscar\(universo, S\)/.test(m[0]),
    'la lista visible sí debe aplicar la selección de estado');
  assert.ok(/ordenarCasosBuscar\(/.test(m[0]), 'la lista se ordena con ordenarCasosBuscar (utils.js)');
});

// ── Gestión del admin ───────────────────────────────────────────
test('la gestión no ofrece «+ Nueva visita» sobre un caso sin radicado real', () => {
  const m = /const radicadoReal = [^;]*;/.exec(srcBuscar);
  assert.ok(m, 'no se encontró radicadoReal en buscar.jsx (GestionBQ)');
  assert.ok(/esRadicadoDeCaso\(/.test(m[0]),
    'puedeNueva debe descartar los casos sin radicado real con esRadicadoDeCaso');
});
