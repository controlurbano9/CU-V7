// ═══════════════════════════════════════════════════════════════
// tests/visor-fotos.test.js — qué fotos puede mostrar el visor (utils.js)
// Lo que más se puede romper: que una foto en cola entre al visor (no tiene
// id de Drive) o que una recién subida quede por fuera (su id viene en el link).
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { idFotoDrive, fotosParaVisor } = require('../utils.js');

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';

test('idFotoDrive usa el id que trae la lista de Drive', () => {
  assert.equal(idFotoDrive({ id: 'abc', link: 'https://drive.google.com/file/d/' + ID + '/view' }), 'abc');
});

test('idFotoDrive saca el id del link de una foto recién subida', () => {
  assert.equal(idFotoDrive({ link: 'https://drive.google.com/file/d/' + ID + '/view' }), ID);
});

test('idFotoDrive no da id a una foto en cola ni a una sin link', () => {
  assert.equal(idFotoDrive({ pendiente: true, id: 'abc' }), '');
  assert.equal(idFotoDrive({ nombre: 'IMG_1.jpg', link: '#' }), '');
  assert.equal(idFotoDrive(null), '');
});

test('fotosParaVisor deja fuera las que siguen en cola y conserva el orden y el pie', () => {
  const lista = fotosParaVisor([
    { id: 'a', descripcion: 'Fachada' },
    { nombre: 'en-cola.jpg', pendiente: true, localId: 'x' },
    { nombre: 'nueva.jpg', link: 'https://drive.google.com/file/d/' + ID + '/view' },
  ]);
  assert.deepEqual(lista.map(f => f.id), ['a', ID]);
  assert.equal(lista[0].descripcion, 'Fachada');
});

test('fotosParaVisor no modifica las fotos de la grilla', () => {
  const foto = { link: 'https://drive.google.com/file/d/' + ID + '/view' };
  fotosParaVisor([foto]);
  assert.equal(foto.id, undefined);
  assert.deepEqual(fotosParaVisor(null), []);
});
