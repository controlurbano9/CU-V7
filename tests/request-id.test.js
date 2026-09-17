// ═══════════════════════════════════════════════════════════════
// tests/request-id.test.js — toda escritura debe salir de gasPost con
// requestId.
//
// Es lo único que vuelve seguro el reintento: sin id, el backend no
// deduplica y el 404 del salto /macros/echo llega al inspector como error
// aunque el script ya hubiera escrito (acta generada dos veces, agenda
// «fallida» pero asignada). Antes esto dependía de que cada llamada se
// acordara de poner el id; ahora lo pone gasPost y esta prueba lo vigila.
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');

const lista = /const _ACCIONES_SOLO_LECTURA = \{[\s\S]*?\};/.exec(src);
assert.ok(lista, 'no se encontró _ACCIONES_SOLO_LECTURA en api.js');
const post = /async function gasPost\(payload\) \{[\s\S]*?\n\}/.exec(src);
assert.ok(post, 'no se encontró gasPost en api.js');

// Sustitutos mínimos: gasPost solo tiene que decidir el payload, no llamar red.
const ctx = vm.createContext({
  CFG: { webhook: 'http://x' },
  fetch: () => {},
  _conCredencialesSesion: p => p,
  _nuevoRequestId: () => 'ID-FIJO',
  _llamarWebhook: (_hacer, body) => body, // devuelve el payload ya decidido
});
vm.runInContext(lista[0] + '\n' + post[0] + '\n', ctx);
const gasPost = vm.runInContext('gasPost', ctx);
const soloLectura = vm.runInContext('_ACCIONES_SOLO_LECTURA', ctx);

// Las que rompieron en campo: acta, registro fotográfico, completar y agenda.
for (const accion of ['generarActa', 'generarRegistroFotos', 'completarRegistro',
                      'confirmarAgenda', 'asignarRadicado', 'mejorarTexto']) {
  test('«' + accion + '» sale con requestId', async () => {
    const body = await gasPost({ accion });
    assert.equal(body.requestId, 'ID-FIJO');
  });
}

test('una lectura no lleva requestId (se reintenta por su propia vía)', async () => {
  const body = await gasPost({ accion: 'leerHoja', hoja: 'BD VISITAS' });
  assert.equal(body.requestId, undefined);
});

test('«agregar» conserva su dedup por clientId y no recibe requestId', async () => {
  const body = await gasPost({ accion: 'agregar', clientId: 'abc' });
  assert.equal(body.requestId, undefined);
  assert.equal(body.clientId, 'abc');
});

test('un requestId ya puesto por quien llama no se pisa', async () => {
  const body = await gasPost({ accion: 'actualizar', requestId: 'MIO' });
  assert.equal(body.requestId, 'MIO');
});

test('gasPost no muta el objeto de quien llama', async () => {
  const original = { accion: 'generarActa' };
  await gasPost(original);
  assert.equal(original.requestId, undefined);
});

// Guarda: si alguien mete una escritura en la lista de solo lectura, se
// reintentaría sin dedup — que es justo el fallo que esto viene a cerrar.
test('la lista de solo lectura no contiene escrituras', () => {
  const escrituras = ['agregar', 'actualizar', 'generarActa', 'completarRegistro',
                      'confirmarAgenda', 'asignarRadicado', 'subirFoto',
                      'subirOrdenPolicia', 'generarRegistroFotos', 'resetPin'];
  for (const a of escrituras) {
    assert.ok(!soloLectura[a], a + ' no puede estar en _ACCIONES_SOLO_LECTURA');
  }
});
