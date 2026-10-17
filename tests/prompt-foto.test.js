// Prompt de visión de las fotos del registro (_promptVisionFoto, backend).
// Se salta si apps_script_unificado.js no está (no va al repo: tiene claves).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BACKEND = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const hay = fs.existsSync(BACKEND);
const ctx = vm.createContext({ String });
if (hay) {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const fn = /function _promptVisionFoto\([^)]*\) \{[\s\S]*?\r?\n\}/.exec(src);
  assert.ok(fn, 'no se encontró _promptVisionFoto en apps_script_unificado.js');
  vm.runInContext(fn[0], ctx);
}
const prompt = hay ? vm.runInContext('_promptVisionFoto', ctx) : null;
const opts = { skip: hay ? false : 'apps_script_unificado.js no está en esta copia' };

test('sin situación no hay bloque SITUACIÓN pero sí los ejemplos', opts, () => {
  const p = prompt('');
  assert.ok(!p.includes('SITUACIÓN ENCONTRADA'));
  assert.ok(p.includes('Ejemplos de salida correcta'));
});

test('la situación va entre comillas angulares', opts, () => {
  assert.ok(prompt('Voladizo sobre el retiro').includes('«Voladizo sobre el retiro»'));
});

test('la situación se recorta a 1500 caracteres + …', opts, () => {
  const m = /«([^»]*)»/.exec(prompt('x'.repeat(3000)));
  assert.ok(m && m[1].length <= 1501 && m[1].endsWith('…'));
});

test('colapsa espacios y saltos de línea', opts, () => {
  assert.ok(prompt('a\n\n b').includes('«a b»'));
});

test('«hormigón» solo aparece en la prohibición', opts, () => {
  for (const p of [prompt(''), prompt('muro')]) {
    assert.equal(p.split('hormigón').length - 1, 1);
    assert.ok(p.includes('Nunca hormigón ni baldosa'));
  }
});
