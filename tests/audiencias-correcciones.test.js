// ═══════════════════════════════════════════════════════════════
// tests/audiencias-correcciones.test.js — correcciones de la revisión de
// la pantalla «Audiencias» (2026-11-04). Una prueba por error con lógica
// pura (utils.js / api.js); la pantalla solo pinta lo que estas devuelven.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  resumenCuposLista, resumenDiaCupos, puedeBloquearDiaCupos, seleccionCuposVisible,
  horasAgregarCupos, problemaSeleccionCupos, MAX_DIAS_AGREGAR_CUPOS, previsualizarCupos,
  visitaDeCitaAudiencias,
} = require('../utils.js');

const cupo = (id, fecha, estado) => ({ idCupo: id, fecha, hora: '9:00AM', sustanciador: 'PATRICIA LOPEZ', estado });

// ── 1. «hasta el …» del resumen ──
test('resumenCuposLista: «hasta» es la última fecha, no la mayor como texto', () => {
  const r = resumenCuposLista([
    cupo('a', '30/04/2027', 'LIBRE'), cupo('b', '05/05/2027', 'LIBRE'), cupo('c', '12/06/2027', 'RESERVADO'),
  ]);
  // Como texto '30/04/2027' > '12/06/2027': antes salía «hasta el 30/04/2027».
  assert.equal(r.hasta, '12/06/2027');
  assert.equal(r.libres, 2);
  assert.equal(r.citados, 1);
});

test('resumenCuposLista: el cambio de año también cuenta', () => {
  const r = resumenCuposLista([cupo('a', '28/12/2027', 'LIBRE'), cupo('b', '03/01/2028', 'LIBRE')]);
  assert.equal(r.hasta, '03/01/2028');
  assert.equal(resumenCuposLista([]).hasta, '');
});

// ── 2. Cierre de sesión ──
// Se extrae de api.js la función y las dos claves con el método de
// tests/visitas-copia-local.test.js (vm con un localStorage de mentira).
function cargarOlvido() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
  const piezas = [
    /const _CLAVE_APARTADOS = '[^']+';/,
    /const _CLAVE_CITAS_PENDIENTES = '[^']+';/,
    /function _olvidarAudienciasLocales\(\) \{[\s\S]*?\n\}/,
  ].map(re => { const m = re.exec(src); assert.ok(m, 'no se encontró en api.js: ' + re); return m[0]; });
  const datos = new Map();
  const localStorage = {
    get length() { return datos.size; },
    key(i) { return Array.from(datos.keys())[i] || null; },
    getItem(k) { return datos.has(k) ? datos.get(k) : null; },
    setItem(k, v) { datos.set(k, String(v)); },
    removeItem(k) { datos.delete(k); },
  };
  const ctx = vm.createContext({ localStorage });
  vm.runInContext(piezas.join('\n') + '\nthis._olvidar = _olvidarAudienciasLocales;', ctx);
  return { olvidar: ctx._olvidar, datos, src };
}

test('cierre de sesión: borra la copia de la agenda, los apartados y las citas en cola', () => {
  const { olvidar, datos } = cargarOlvido();
  datos.set('cu_audiencias_v1_INSPECTOR', '{"cupos":[{"citado":"Carlos","documentoCitado":"43123456"}]}');
  datos.set('cu_audiencias_v1_ADMIN', '{}');
  datos.set('cu_cupos_apartados_v1', '[{"idCupo":"x"}]');
  datos.set('cu_citas_pendientes_v1', '[{"requestId":"r"}]');
  datos.set('cu_tema', 'claro');   // lo ajeno a Audiencias no se toca
  olvidar();
  assert.deepEqual(Array.from(datos.keys()), ['cu_tema']);
});

test('cierre de sesión: SESSION.borrar llama al olvido de Audiencias', () => {
  const { src } = cargarOlvido();
  const m = /borrar\(\) \{[\s\S]*?\n  \},/.exec(src);
  assert.ok(m, 'no se encontró SESSION.borrar');
  assert.match(m[0], /_olvidarAudienciasLocales\(\)/);
});

// ── 4. Selección y filtros ──
test('seleccionCuposVisible: solo lo marcado que se ve, en el orden de la lista', () => {
  const visibles = [cupo('a', '05/04/2027', 'LIBRE'), cupo('b', '06/04/2027', 'LIBRE'), cupo('c', '07/04/2027', 'LIBRE')];
  // 'z' se marcó y después un filtro lo escondió: no entra en la acción en lote.
  const sel = { c: true, a: true, z: true };
  assert.deepEqual(seleccionCuposVisible(sel, visibles).map(c => c.idCupo), ['a', 'c']);
  assert.deepEqual(seleccionCuposVisible({}, visibles), []);
  assert.deepEqual(seleccionCuposVisible(sel, []), []);
});

// ── 5. «Agregar cupos» ──
test('horasAgregarCupos: «Otra hora» sola cuenta como hora', () => {
  assert.deepEqual(horasAgregarCupos([], true, '10:30'), ['10:30AM']);
  assert.deepEqual(horasAgregarCupos(['9:00AM'], true, '14:00'), ['9:00AM', '2:00PM']);
  assert.deepEqual(horasAgregarCupos([], true, '00:15'), ['12:15AM']);
  assert.deepEqual(horasAgregarCupos([], true, '12:00'), ['12:00PM']);
  // Sin marcar «Otra hora», ilegible o repetida no suma.
  assert.deepEqual(horasAgregarCupos(['9:00AM'], false, '10:30'), ['9:00AM']);
  assert.deepEqual(horasAgregarCupos([], true, ''), []);
  assert.deepEqual(horasAgregarCupos([], true, '25:00'), []);
  assert.deepEqual(horasAgregarCupos(['9:00AM'], true, '09:00'), ['9:00AM']);
});

test('problemaSeleccionCupos: solo con «Otra hora» la selección está completa', () => {
  const sel = { desde: '05/04/2027', hasta: '09/04/2027', dias: [1], horas: horasAgregarCupos([], true, '10:30'), sustanciadores: ['PATRICIA LOPEZ'] };
  assert.equal(problemaSeleccionCupos(sel), '');
  const prev = previsualizarCupos([], sel, new Date(2027, 3, 1));
  assert.deepEqual(prev.crear, [{ fecha: '05/04/2027', hora: '10:30AM', sustanciador: 'PATRICIA LOPEZ' }]);
});

test('problemaSeleccionCupos: dice qué falta, también «Hasta» antes de «Desde»', () => {
  const base = { desde: '05/04/2027', hasta: '09/04/2027', dias: [1], horas: ['9:00AM'], sustanciadores: ['A'] };
  assert.match(problemaSeleccionCupos(Object.assign({}, base, { desde: '' })), /Desde/);
  assert.match(problemaSeleccionCupos(Object.assign({}, base, { hasta: '01/04/2027' })), /anterior/);
  assert.match(problemaSeleccionCupos(Object.assign({}, base, { dias: [] })), /día/);
  assert.match(problemaSeleccionCupos(Object.assign({}, base, { horas: [] })), /hora/);
  assert.match(problemaSeleccionCupos(Object.assign({}, base, { sustanciadores: [] })), /sustanciador/);
});

test('problemaSeleccionCupos: tope de un año por vez', () => {
  const base = { dias: [1, 2, 3, 4, 5], horas: ['9:00AM'], sustanciadores: ['A'] };
  assert.equal(MAX_DIAS_AGREGAR_CUPOS, 366);
  // 2028 es bisiesto: 01/01 a 31/12 son 366 días, justo en el tope.
  assert.equal(problemaSeleccionCupos(Object.assign({ desde: '01/01/2028', hasta: '31/12/2028' }, base)), '');
  assert.match(problemaSeleccionCupos(Object.assign({ desde: '01/01/2027', hasta: '31/12/2029' }, base)), /un año/);
});

// ── 6. La visita de una cita ──
const fila = (idx, extra) => Object.assign({
  _idx: idx, ID_VISITA: '', RADICADO: '', 'N° ORDEN DE POLICIA': '', 'ESTADO VISITA': 'COMPLETADO',
}, extra);

test('visitaDeCitaAudiencias: una cita pedida por N° de orden encuentra su visita', () => {
  const filas = [fila(4, { RADICADO: '20272041228' }), fila(9, { 'N° ORDEN DE POLICIA': '2027-09-031' })];
  // Antes se buscaba solo por radicado: «No se encontró la visita del radicado ?».
  const f = visitaDeCitaAudiencias(filas, { radicado: '', ordenPolicia: '2027-9-31' });
  assert.equal(f && f._idx, 9);
});

test('visitaDeCitaAudiencias: ID_VISITA manda sobre el caso; sin él, la última fila del caso', () => {
  const filas = [
    fila(3, { ID_VISITA: 'V-1', RADICADO: '20272041228' }),
    fila(7, { ID_VISITA: 'V-2', RADICADO: '20272041228' }),
  ];
  assert.equal(visitaDeCitaAudiencias(filas, { idVisita: 'V-1', radicado: '20272041228' })._idx, 3);
  assert.equal(visitaDeCitaAudiencias(filas, { radicado: '20272041228' })._idx, 7);
  // Un ID_VISITA que ya no está cae al caso.
  assert.equal(visitaDeCitaAudiencias(filas, { idVisita: 'V-9', radicado: '20272041228' })._idx, 7);
  assert.equal(visitaDeCitaAudiencias(filas, { radicado: '20279999999' }), null);
  assert.equal(visitaDeCitaAudiencias(filas, null), null);
});

// ── 9. Conteo del día y «Bloquear el día» ──
test('resumenDiaCupos: un día mixto dice todos sus estados', () => {
  const dia = [
    cupo('a', '07/04/2027', 'BLOQUEADO'), cupo('b', '07/04/2027', 'LIBRE'), cupo('c', '07/04/2027', 'LIBRE'),
    cupo('d', '07/04/2027', 'LIBRE'), cupo('e', '07/04/2027', 'BLOQUEADO'),
  ];
  // Antes: «3 libres» (los 2 bloqueados no salían).
  assert.equal(resumenDiaCupos(dia), '3 libres · 2 bloqueados');
  assert.equal(resumenDiaCupos([cupo('a', 'x', 'POR_APARTAR'), cupo('b', 'x', 'RESERVADO'), cupo('c', 'x', 'LIBRE')]),
    '1 libre · 1 por apartar · 1 citado');
  assert.equal(resumenDiaCupos([cupo('a', 'x', 'BLOQUEADO')]), '1 bloqueado');
  assert.equal(resumenDiaCupos([]), '');
});

test('puedeBloquearDiaCupos: no en un día ya bloqueado o lleno de citados', () => {
  assert.equal(puedeBloquearDiaCupos([cupo('a', 'x', 'BLOQUEADO'), cupo('b', 'x', 'BLOQUEADO')]), false);
  assert.equal(puedeBloquearDiaCupos([cupo('a', 'x', 'RESERVADO'), cupo('b', 'x', 'BLOQUEADO')]), false);
  assert.equal(puedeBloquearDiaCupos([cupo('a', 'x', 'RESERVADO'), cupo('b', 'x', 'LIBRE')]), true);
  assert.equal(puedeBloquearDiaCupos([cupo('a', 'x', 'POR_APARTAR')]), true);
  assert.equal(puedeBloquearDiaCupos([]), false);
});
