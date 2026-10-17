// tests/barrio-pot.test.js — barrio POT de cada visita (utils.js), contra los mapas reales
// (barrios-mapa.json + proyección de comunas-mapa.json). Salió de herramientas/barrio-pot.
// Ejecutar: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const BP = require('../utils.js');

const RAIZ = path.join(__dirname, '..');
const BARRIOS = JSON.parse(fs.readFileSync(path.join(RAIZ, 'barrios-mapa.json'), 'utf8')).barrios;
const PROJ = JSON.parse(fs.readFileSync(path.join(RAIZ, 'comunas-mapa.json'), 'utf8')).proj;
const idx = BP.crearIndiceBarriosPot(BARRIOS, PROJ);

// Inversa de la proyección: un punto del mapa a lat/lon.
const aLatLon = (x, y) => ({ lat: PROJ.maxY - y / PROJ.s, lon: (x / PROJ.s + PROJ.minX) / PROJ.k });
// Centro de un barrio que de verdad cae dentro (en polígonos cóncavos el centroide puede quedar fuera).
function puntoDentro(nombre) {
  const b = idx.lista.find(x => x.n === nombre);
  const p = aLatLon(BARRIOS[b.i].cx, BARRIOS[b.i].cy);
  assert.equal(BP.barrioPotPorPunto(idx, p.lat, p.lon)?.n, nombre, 'el centro de ' + nombre + ' no cae dentro: elegir otro barrio para la prueba');
  return p;
}

test('claveBarrio iguala grafías de la BD, el formulario y el POT', () => {
  assert.equal(BP.claveBarrioPot('Zona Industrial #1'), BP.claveBarrioPot('Zona Industrial Nº1'));
  assert.equal(BP.claveBarrioPot('LA CABANA'), BP.claveBarrioPot('La Cabaña'));
  assert.equal(BP.claveBarrioPot('Vda. Hatoviejo'), BP.claveBarrioPot('Hato Viejo'));
  assert.equal(BP.claveBarrioPot('  fontidueño '), 'FONTIDUENO');
  assert.equal(BP.claveBarrioPot(''), '');
  assert.equal(BP.claveBarrioPot(null), '');
});

test('cada alias apunta a un barrio que existe en el POT', () => {
  for (const [k, destino] of Object.entries(BP.ALIAS_BARRIO_POT)) {
    assert.ok(idx.porClave.has(BP.claveBarrioPot(destino)), k + ' → ' + destino + ' no está en barrios-mapa.json');
  }
});

test('todo barrio urbano del desplegable del formulario se resuelve por nombre', () => {
  const src = fs.readFileSync(path.join(RAIZ, 'nueva-visita.jsx'), 'utf8');
  const grupos = [...src.matchAll(/comuna: '(\w+)', label: '[^']+', barrios: \[([^\]]+)\]/g)];
  assert.ok(grupos.length >= 11, 'no se encontró BARRIOS_POR_COMUNA en nueva-visita.jsx');
  const faltan = [];
  for (const [, comuna, lista] of grupos) {
    if (comuna === 'Vereda') continue;
    for (const [, n] of lista.matchAll(/'([^']+)'/g)) if (!BP.barrioPotPorNombre(idx, n, comuna)) faltan.push(n);
  }
  assert.deepEqual(faltan, []);
});

test('con punto dentro de un barrio, manda el punto', () => {
  const p = puntoDentro('Los Sauces');
  const r = BP.barrioPotDe(idx, { lat: p.lat, lon: p.lon, barrio: '', comuna: '' });
  assert.deepEqual(r, { barrio: 'Los Sauces', comuna: '1', fuente: 'punto', conflictoM: null, revisar: false });
});

test('acepta coordenadas como texto con coma decimal (así llegan de la BD)', () => {
  const p = puntoDentro('Los Sauces');
  const r = BP.barrioPotDe(idx, { lat: String(p.lat).replace('.', ','), lon: String(p.lon).replace('.', ','), barrio: '' });
  assert.equal(r.barrio, 'Los Sauces');
  assert.equal(r.fuente, 'punto');
});

test('sin coordenadas, resuelve por nombre con alias', () => {
  assert.equal(BP.barrioPotDe(idx, { barrio: 'EL CONGOLO' }).barrio, 'Congolo');
  assert.equal(BP.barrioPotDe(idx, { barrio: 'NIQUIA BIFAMILIARES' }).barrio, 'Niquia Bifamiliar');
  assert.equal(BP.barrioPotDe(idx, { barrio: 'ZONA INDUSTRIAL #5' }).barrio, 'Zona Industrial Nº5');
  const r = BP.barrioPotDe(idx, { lat: '', lon: '', barrio: 'LA NAVARRA', comuna: '9' });
  assert.equal(r.barrio, 'Navarra');
  assert.equal(r.fuente, 'nombre');
});

test('nombre repetido en el POT: decide la comuna de la fila', () => {
  assert.equal(BP.barrioPotPorNombre(idx, 'Guasimalito', '9').c, '9');
  assert.equal(BP.barrioPotPorNombre(idx, 'Guasimalito', '10').c, '10');
});

test('«NIQUIA» a secas es ambiguo: sin punto no se adivina', () => {
  assert.deepEqual(BP.barrioPotDe(idx, { barrio: 'NIQUIA' }), { barrio: '', comuna: '', fuente: null, conflictoM: null, revisar: false });
});

test('coordenadas fuera de Bello o en cero se ignoran y cae al nombre', () => {
  assert.equal(BP.barrioPotDe(idx, { lat: 0, lon: 0, barrio: 'Paris' }).fuente, 'nombre');
  assert.equal(BP.barrioPotDe(idx, { lat: 6.25, lon: -75.6, barrio: 'Paris' }).fuente, 'nombre'); // Medellín
});

test('punto y nombre distintos: manda el punto y se mide el conflicto', () => {
  const p = puntoDentro('Los Sauces');
  const cerca = BP.barrioPotDe(idx, { lat: p.lat, lon: p.lon, barrio: 'Paris' });          // vecinos
  assert.equal(cerca.barrio, 'Los Sauces');
  assert.ok(cerca.conflictoM > 0 && cerca.conflictoM < BP.UMBRAL_REVISAR_BARRIO_M, 'Paris debería estar a menos de 1 km: ' + cerca.conflictoM);
  assert.equal(cerca.revisar, false);
  const lejos = BP.barrioPotDe(idx, { lat: p.lat, lon: p.lon, barrio: 'Zamora' });          // comuna 11
  assert.equal(lejos.barrio, 'Los Sauces');
  assert.ok(lejos.conflictoM >= BP.UMBRAL_REVISAR_BARRIO_M);
  assert.equal(lejos.revisar, true);
});

test('nombre igual al del punto no es conflicto aunque cambie la grafía', () => {
  const p = puntoDentro('Los Sauces');
  assert.equal(BP.barrioPotDe(idx, { lat: p.lat, lon: p.lon, barrio: 'LOS SAUCES' }).conflictoM, null);
});
