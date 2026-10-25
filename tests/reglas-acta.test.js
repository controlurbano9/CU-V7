// Fase 1 de docs/PROPUESTA_2026-10-14_coherencia-acta.md: reglas que
// bloquean el acta (reglasBloqueoActa), las que piden justificación
// (revisarTextoLocal). Casos sacados de la línea base del 2026-10-14.
const test = require('node:test');
const assert = require('node:assert');
const { reglasBloqueoActa, revisarTextoLocal, alternarContravencion, _infraccionSoloCatalogo } = require('../utils.js');

const ids = s => s.map(x => x.id).sort();
const A3 = 'A3: Bienes uso público (Antejardín)';
const A4 = 'A4: Sin licencia o caducada';

// ── Bloqueos ─────────────────────────────────────────────────
test('R02: «No se evidencia infracción» con otro chip', () => {
  assert.deepEqual(ids(reglasBloqueoActa({ infraccion: 'No se evidencia infracción | ' + A4 })), ['R02']);
});

test('R03: comportamiento marcado con área «No aplica»', () => {
  assert.deepEqual(ids(reglasBloqueoActa({ infraccion: A4, areaNoAplica: true })), ['R03']);
  assert.deepEqual(reglasBloqueoActa({ infraccion: 'No se evidencia infracción', areaNoAplica: true }), []);
});

test('R04: reparación locativa con cualquier comportamiento del literal A', () => {
  assert.deepEqual(ids(reglasBloqueoActa({ infraccion: A3, repLocativa: 'SI' })), ['R04']);
  assert.deepEqual(reglasBloqueoActa({ infraccion: 'D13: Materiales en vía', repLocativa: 'SI' }), []);
});

test('R09: A2 / C9 / C10 sin licencia aportada, sin excepción', () => {
  assert.deepEqual(ids(reglasBloqueoActa({ infraccion: 'A2: Diferente a lo aprobado', licenciaAportada: 'NO' })), ['R09']);
  assert.deepEqual(ids(reglasBloqueoActa({ infraccion: 'C9: Uso distinto licencia', licenciaAportada: '' })), ['R09']);
  assert.deepEqual(reglasBloqueoActa({ infraccion: 'A2: Diferente a lo aprobado', licenciaAportada: 'SI' }), []);
});

test('R10: obra terminada con suspensión', () => {
  assert.deepEqual(ids(reglasBloqueoActa({ estadoObra: 'Terminada', suspension: 'SI' })), ['R10']);
  assert.deepEqual(reglasBloqueoActa({ estadoObra: 'En proceso / iniciada', suspension: 'SI' }), []);
});

test('R11: quebrada o protección con literal A y sin A1', () => {
  assert.deepEqual(ids(reglasBloqueoActa({ infraccion: A4, quebrada: 'SI' })), ['R11']);
  assert.deepEqual(ids(reglasBloqueoActa({ infraccion: A4, sueloProt: 'SI' })), ['R11']);
  assert.deepEqual(reglasBloqueoActa({ infraccion: 'A1: Áreas protegidas | ' + A4, quebrada: 'SI' }), []);
  // Sin comportamiento de construcción no se exige A1.
  assert.deepEqual(reglasBloqueoActa({ infraccion: 'No se evidencia infracción', quebrada: 'SI' }), []);
});

test('R16: A1 y A4 juntos no bloquean; piden justificación', () => {
  const A1 = 'A1: Áreas protegidas';
  assert.deepEqual(reglasBloqueoActa({ infraccion: A1 + ' | ' + A4, quebrada: 'SI' }), []);
  const s = revisarTextoLocal({ actuacion: 'Ampliación en el lote, parte en el retiro de la quebrada.',
    infraccion: A1 + ' | ' + A4, area: '40' });
  const r16 = s.filter(x => x.id === 'R16');
  assert.equal(r16.length, 1);
  assert.equal(r16[0].tipo, 'coherencia');
  assert.equal(revisarTextoLocal({ actuacion: 'Ampliación en el retiro de la quebrada.', infraccion: A1, area: '40' })
    .filter(x => x.id === 'R16').length, 0);
});

test('alternarContravencion: A1 convive con A4 y va primero', () => {
  const A1 = 'A1: Áreas protegidas';
  assert.equal(_infraccionSoloCatalogo(A4 + ' | ' + A1), A1 + ' | ' + A4);
  assert.deepEqual(alternarContravencion([A4, A3], A1), [A1, A4, A3]);
  assert.deepEqual(alternarContravencion([A1], A4), [A1, A4]);
  assert.deepEqual(alternarContravencion([A1, A3], A3), [A1]);
  assert.deepEqual(alternarContravencion([A1], 'No se evidencia infracción'), ['No se evidencia infracción']);
  assert.deepEqual(alternarContravencion(['No se evidencia infracción'], A4), [A4]);
});

// ── Con justificación ────────────────────────────────────────
test('R05: reparación locativa con área', () => {
  assert.deepEqual(ids(revisarTextoLocal({ actuacion: 'Se cambió el enchape del baño.', repLocativa: 'SI', area: '12' })), ['R05']);
});

test('R06 / R06b: antejardín con construcción o con materiales', () => {
  assert.deepEqual(ids(revisarTextoLocal({
    actuacion: 'Sobre el antejardín se levantó un cerramiento en mampostería.', infraccion: A4, area: '10',
  })), ['R06']);
  assert.deepEqual(ids(revisarTextoLocal({
    actuacion: 'Hay escombros y arena acopiados en el antejardín y en el andén.', infraccion: A4, area: '', areaNoMedible: true,
  })), ['R06b']);
  // Una intención a futuro no es un hecho.
  assert.deepEqual(revisarTextoLocal({
    actuacion: 'Los propietarios manifiestan su intención de hacer un cerramiento en el antejardín.',
    infraccion: 'No se evidencia infracción',
  }), []);
});

test('R07: A3 y se recomienda tramitar la licencia', () => {
  assert.deepEqual(ids(revisarTextoLocal({
    actuacion: 'Sobre el antejardín hay una cubierta en teja.', infraccion: A3, area: '16',
    conclusion: 'Se recomienda al propietario tramitar la licencia de construcción.',
  })), ['R07']);
  // Contar que se pidió la licencia en la visita no es recomendarla.
  assert.deepEqual(revisarTextoLocal({
    actuacion: 'Sobre el antejardín hay una cubierta. Durante la visita se solicita la licencia de construcción.',
    infraccion: A3, area: '16',
  }), []);
});

test('R08: licencia aportada con A4', () => {
  assert.deepEqual(ids(revisarTextoLocal({ actuacion: 'Ampliación en el segundo piso.', infraccion: A4, licenciaAportada: 'SI', area: '30' })), ['R08']);
});

test('R12: más pisos que los aprobados sin A2', () => {
  assert.deepEqual(ids(revisarTextoLocal({
    actuacion: 'Edificación de dos pisos.', licenciaAportada: 'SI', alturaPisos: '2', pisos: '1',
  })), ['R12']);
});

test('R13: uso comercial o industrial sin C11/C12', () => {
  assert.deepEqual(ids(revisarTextoLocal({ actuacion: 'Taller en el primer piso.', usos: 'Residencial · Comercial' })), ['R13']);
  assert.deepEqual(revisarTextoLocal({ actuacion: 'Vivienda.', usos: 'Residencial' }), []);
  assert.deepEqual(revisarTextoLocal({
    actuacion: 'Taller en el primer piso.', usos: 'Industrial', infraccion: 'C11: Usos suelo prohibidos',
  }), []);
});


