// «¿Las obras requieren licencia?» (2026-10-15): guardado en dos columnas,
// lectura con compatibilidad de la AA vieja (REPARACION LOCATIVA), la AA
// derivada que siguen leyendo el acta y R04/R05, faltantes y R14/R15.
const test = require('node:test');
const assert = require('node:assert');
const {
  formatearRequiereLicencia, parsearRequiereLicencia, repLocativaDesdeRequiere,
  faltantesRequiereLicencia, revisarTextoLocal, REQUIERE_INDETERMINADO,
} = require('../utils.js');

const A4 = 'A4: Sin licencia o caducada';
const ids = s => s.map(x => x.id).sort();

test('SI: guarda las modalidades exigibles y las vuelve a leer', () => {
  const g = formatearRequiereLicencia({ respuesta: 'SI', modalidades: ['Ampliación', 'Modificación'] });
  assert.deepEqual(g, { requiere: 'SI', detalle: 'Ampliación, Modificación' });
  const l = parsearRequiereLicencia(g.requiere, g.detalle, '');
  assert.equal(l.respuesta, 'SI');
  assert.deepEqual(l.modalidades, ['Ampliación', 'Modificación']);
});

test('NO: motivos con «Otro» y su texto, ida y vuelta', () => {
  const g = formatearRequiereLicencia({ respuesta: 'NO', motivos: ['Reparación locativa', 'Otro'], otro: 'cambio de puerta' });
  assert.equal(g.detalle, 'Reparación locativa | Otro: cambio de puerta');
  const l = parsearRequiereLicencia(g.requiere, g.detalle, '');
  assert.deepEqual(l.motivos, ['Reparación locativa', 'Otro']);
  assert.equal(l.otro, 'cambio de puerta');
});

test('No se pudo determinar: guarda el motivo', () => {
  const g = formatearRequiereLicencia({ respuesta: REQUIERE_INDETERMINADO, motivoIndeterminado: 'no se tuvo acceso' });
  assert.deepEqual(g, { requiere: REQUIERE_INDETERMINADO, detalle: 'no se tuvo acceso' });
  assert.equal(parsearRequiereLicencia(g.requiere, g.detalle).motivoIndeterminado, 'no se tuvo acceso');
});

test('visita vieja: AA en SI se lee como NO por reparación locativa; AA en NO no se adivina', () => {
  const l = parsearRequiereLicencia('', '', 'SI');
  assert.equal(l.respuesta, 'NO');
  assert.deepEqual(l.motivos, ['Reparación locativa']);
  assert.equal(parsearRequiereLicencia('', '', 'NO').respuesta, '');
});

test('AA derivada: SI solo con NO por reparación locativa', () => {
  assert.equal(repLocativaDesdeRequiere({ respuesta: 'NO', motivos: ['Reparación locativa'] }), 'SI');
  assert.equal(repLocativaDesdeRequiere({ respuesta: 'NO', motivos: ['Mantenimiento o cambio de acabados'] }), 'NO');
  assert.equal(repLocativaDesdeRequiere({ respuesta: 'SI', modalidades: ['Ampliación'] }), 'NO');
  assert.equal(repLocativaDesdeRequiere({ respuesta: '' }), '');
});

test('faltantes', () => {
  assert.equal(faltantesRequiereLicencia({}).length, 1);
  assert.equal(faltantesRequiereLicencia({ respuesta: 'SI', modalidades: [] }).length, 1);
  assert.equal(faltantesRequiereLicencia({ respuesta: 'NO', motivos: ['Otro'], otro: '' }).length, 1);
  assert.equal(faltantesRequiereLicencia({ respuesta: REQUIERE_INDETERMINADO, motivoIndeterminado: ' ' }).length, 1);
  assert.deepEqual(faltantesRequiereLicencia({ respuesta: 'NO', motivos: ['Reparación locativa'] }), []);
});

test('R14: requiere licencia, no se aportó y no está A4', () => {
  assert.deepEqual(ids(revisarTextoLocal({ actuacion: 'Ampliación en el segundo piso.', requiereLicencia: 'SI', licenciaAportada: 'NO' })), ['R14']);
  assert.deepEqual(ids(revisarTextoLocal({ actuacion: 'Ampliación en el segundo piso.', requiereLicencia: 'SI', licenciaAportada: 'NO', infraccion: A4, area: '20' })), []);
});

test('R15: no requiere licencia con A4 marcado', () => {
  assert.deepEqual(ids(revisarTextoLocal({ actuacion: 'Cambio de enchape en el segundo piso.', requiereLicencia: 'NO', infraccion: A4, area: '20' })), ['R15']);
});
