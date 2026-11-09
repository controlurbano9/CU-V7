// tests/impresion-norma.test.js — hoja impresa de Consulta norma (utils.js).
// Ejecutar: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  codificarPolilinea, simplificarAnillo, zoomMapaEstatico, escalaMapaEstatico,
  urlMapaEstatico, filasNormaImpresion,
} = require('../utils.js');

test('codificarPolilinea — ejemplo de la documentación de Google', () => {
  assert.equal(codificarPolilinea([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]),
    '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.equal(codificarPolilinea([]), '');
});

test('simplificarAnillo — recorta vértices y deja el anillo cerrado', () => {
  const a = Array.from({ length: 500 }, (_, i) => [6.3 + i * 1e-5, -75.5 - i * 1e-5]);
  const s = simplificarAnillo(a, 100);
  assert.ok(s.length <= 101);
  assert.deepEqual(s[0], s[s.length - 1]);
  // Ya cerrado: no agrega otro vértice.
  const c = [[1, 1], [1, 2], [2, 2], [1, 1]];
  assert.equal(simplificarAnillo(c, 100).length, 4);
});

test('zoomMapaEstatico — predio chico va cerca, lote grande va lejos', () => {
  const chico = [[6.32760, -75.56500], [6.32780, -75.56480]];   // ~25 m
  const grande = [[6.320, -75.570], [6.336, -75.556]];          // ~1,7 km
  assert.equal(zoomMapaEstatico(chico, 640, 590), 20);
  assert.equal(zoomMapaEstatico(grande, 640, 590), 15);
  assert.equal(zoomMapaEstatico([], 640, 590), 18);
  assert.equal(zoomMapaEstatico([[6.33, -75.56]], 640, 590), 18);
});

test('escalaMapaEstatico — longitud redonda cerca de un quinto del ancho', () => {
  const e = escalaMapaEstatico(6.33, 20, 640);
  assert.ok([5, 10, 20, 25, 50].includes(e.metros));
  assert.ok(e.fraccion > 0.08 && e.fraccion <= 0.2, 'fracción ' + e.fraccion);
});

test('urlMapaEstatico — contorno doble, pin y largo dentro del límite', () => {
  const anillo = Array.from({ length: 900 }, (_, i) => {
    const t = (i / 900) * 2 * Math.PI;
    return [6.3277 + 0.0002 * Math.sin(t), -75.5649 + 0.0002 * Math.cos(t)];
  });
  const r = urlMapaEstatico({ lat: 6.327679, lon: -75.564901, anillos: [anillo], clave: 'K' });
  assert.match(r.url, /^https:\/\/maps\.googleapis\.com\/maps\/api\/staticmap\?/);
  assert.equal((r.url.match(/&path=/g) || []).length, 2);
  assert.match(r.url, /markers=color%3Ared/);
  assert.match(r.url, /maptype=hybrid/);
  assert.ok(r.url.length < 16384, 'largo ' + r.url.length);
  assert.ok(r.escala.metros > 0);
  // Sin contorno: solo el pin.
  const s = urlMapaEstatico({ lat: 6.33, lon: -75.56, anillos: [], clave: 'K' });
  assert.equal((s.url.match(/&path=/g) || []).length, 0);
  assert.equal(s.zoom, 18);
  assert.match(r.url, /style=feature%3Apoi/);
});

test('filasNormaImpresion — marca lo que condiciona el predio', () => {
  const f = filasNormaImpresion({
    clasificacion: 'Suelo urbano', tratamiento: 'P, Protección', intensidad: 'DENSIDAD MEDIA',
    sueloProt: 'SI', sueloProtCategoria: 'ZIM-4: Zona de Interes Municipal',
    amenaza: 'NO', enRetiro: 'NO', barrioSugerido: 'SANTA ANA',
  }, 'Comuna 3');
  const cond = f.filter(x => x.condiciona).map(x => x.corto);
  assert.deepEqual(cond, ['Tratamiento de protección', 'Suelo de protección (ZIM-4)']);
  assert.equal(f.find(x => x.etiqueta === 'Polígono uso del suelo').valor, '—');
  assert.equal(f.find(x => x.etiqueta === 'Comuna').valor, 'Comuna 3');
  assert.equal(f.length, 9);
});

test('filasNormaImpresion — DRMI y amenaza solo cuando caen', () => {
  const f = filasNormaImpresion({
    clasificacion: 'Suelo rural', amenaza: 'SI', amenazaTipo: 'Movimiento en masa', amenazaCategoria: 'Alta',
    enRetiro: 'SI', enDRMI: 'SI', drmiNombre: 'Cerro Quitasol - La Holanda', tratamiento: 'CN2',
  }, 'No aplica (rural)');
  const drmi = f.find(x => x.etiqueta === 'DRMI');
  assert.ok(drmi && drmi.condiciona && drmi.ancho);
  assert.equal(f.find(x => x.etiqueta === 'Amenaza natural').valor, 'Movimiento en masa (Alta)');
  assert.ok(!f.find(x => x.etiqueta === 'Tratamiento urbanístico').condiciona);
  assert.deepEqual(filasNormaImpresion(null), []);
});
