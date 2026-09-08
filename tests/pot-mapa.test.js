// ═══════════════════════════════════════════════════════════════
// tests/pot-mapa.test.js — Cobertura de los dos arreglos de 2026-09-08:
//   · consultarPOT: UsoGeneralSuelo también aplica en rural (polígono de uso
//     del suelo no puede quedar vacío) y en rural no se reporta comuna.
//   · sw.js claveTile: normaliza la URL de tile de Maps a zoom/x/y/capa.
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');

// Cuadrado que cubre todo Bello: cualquier punto de prueba cae dentro.
function cuadrado(props) {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature', properties: props,
      geometry: { type: 'Polygon', coordinates: [[
        [-75.70, 6.28], [-75.50, 6.28], [-75.50, 6.44], [-75.70, 6.44], [-75.70, 6.28],
      ]] },
    }],
  };
}

// turf mínimo: sólo lo que consultarPOT usa (point, booleanPointInPolygon,
// buffer/booleanIntersects en el retiro de quebradas). Ray-casting simple.
const turfStub = {
  point: c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c } }),
  booleanPointInPolygon: (pt, feat) => {
    const [x, y] = pt.geometry.coordinates;
    const anillo = feat.geometry.coordinates[0];
    let dentro = false;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  },
  buffer: f => f,
  booleanIntersects: () => false,
  lineString: c => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: c } }),
};

// Carga api.js en un sandbox con fetch simulado. `capas` mapea nombre de
// archivo → GeoJSON; lo no listado responde 404 (la capa queda en null).
function cargarApi(capas) {
  const pedidas = [];
  const sandbox = {
    console: { warn() {}, log() {}, error() {} },
    turf: turfStub,
    setTimeout, clearTimeout, Promise, JSON, Object, Array, String, Number, Math, Date, RegExp, Error,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    crypto: require('node:crypto').webcrypto,
    TextEncoder,
    fetch: async (url) => {
      const nombre = String(url).split('/').pop();
      pedidas.push(nombre);
      if (!capas[nombre]) return { ok: false, status: 404 };
      return { ok: true, json: async () => capas[nombre] };
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'api.js'), 'utf-8'), sandbox, { filename: 'api.js' });
  return { consultarPOT: sandbox.consultarPOT, pedidas };
}

test('consultarPOT — en rural sí resuelve el polígono de uso del suelo', async () => {
  const { consultarPOT, pedidas } = cargarApi({
    'ClasificacionSueloMunicipal.geojson': cuadrado({ CLASE: 'Suelo rural' }),
    'Comunas.geojson': cuadrado({ CODIGO_COM: '04', Nombre: 'COMUNA 4' }),
    'UsoGeneralSuelo.geojson': cuadrado({ CATEG_1: 'ZCV-SUB-2' }),
  });
  const r = await consultarPOT(6.42, -75.62);
  assert.equal(r.ambito, 'Rural');
  assert.ok(pedidas.includes('UsoGeneralSuelo.geojson'),
    'UsoGeneralSuelo debe cargarse también en rural: cubre todo el municipio');
  assert.equal(r.poligono, 'ZCV-SUB-2');
});

test('consultarPOT — en rural no se reporta comuna (las comunas son urbanas)', async () => {
  const { consultarPOT } = cargarApi({
    'ClasificacionSueloMunicipal.geojson': cuadrado({ CLASE: 'Suelo rural' }),
    'Comunas.geojson': cuadrado({ CODIGO_COM: '04', Nombre: 'COMUNA 4' }),
  });
  const r = await consultarPOT(6.42, -75.62);
  assert.equal(r.comuna, '');
  assert.equal(r.comunaNombre, '');
});

test('consultarPOT — en urbano la comuna sí se conserva', async () => {
  const { consultarPOT } = cargarApi({
    'ClasificacionSueloMunicipal.geojson': cuadrado({ CLASE: 'Suelo urbano' }),
    'Comunas.geojson': cuadrado({ CODIGO_COM: '04', Nombre: 'COMUNA 4' }),
  });
  const r = await consultarPOT(6.33, -75.55);
  assert.equal(r.ambito, 'Urbano');
  assert.equal(r.comuna, '4');
});

test('sw.js claveTile — normaliza el tile ignorando los IDs de experimento', () => {
  const src = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf-8');
  const m = /const TILE_PREFIX[\s\S]*?\r?\n\}\r?\n/.exec(src);
  assert.ok(m, 'no se encontró claveTile en sw.js');
  const claveTile = new Function(m[0] + '; return claveTile;')();

  const base = 'https://maps.googleapis.com/maps/vt?pb=!1m5!1m4!1i18!2i76054!3i126447!4i256!2m1!1e1!3m7!2ses-419!3sUS!5e18';
  const esperado = 'https://maps.googleapis.com/__cu_tile/1/18/76054/126447/256';
  assert.equal(claveTile(base), esperado);
  // Mismo tile, otro release de Maps: debe dar la misma clave (si no, el
  // precache y el modo offline no sirven de nada).
  assert.equal(claveTile(base + '!23i99999999!23i12345678'), esperado);
  // Distinta capa → distinta clave.
  assert.notEqual(claveTile(base.replace('!2m1!1e1', '!2m1!1e0')), esperado);
  assert.equal(claveTile('https://maps.googleapis.com/maps/api/js?key=x'), null);
});
