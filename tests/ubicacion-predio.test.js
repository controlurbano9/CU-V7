// ═══════════════════════════════════════════════════════════════
// tests/ubicacion-predio.test.js — dirección + GPS + catastro.
//
// Lo que se vigila: que la dirección que escribe el inspector y la que trae
// catastro den la MISMA clave (si no, el predio no se encuentra y el
// inspector queda solo con el GPS), y la regla de los 10 m que decide si el
// pin y la dirección son el mismo predio. Formatos tomados de catastro.json y
// de BD VISITAS (Fase 0, docs/PLAN_2026-09-29_ubicacion-predio.md).
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  claveDireccionCatastro, clavesCercanasCatastro, terrenoVecinoPreferido, direccionDesdeClave, unidadCatastroCalza, puntoEnAnillo,
  distanciaPuntoAnilloM, puntoInteriorAnillo, compararUbicacion,
  origenUbicacionConfirmada, ubicacionConfirmadaVigente, codigoPredioMatriz, esCodigoPredioMatriz,
} = require('../utils.js');

const base = d => (claveDireccionCatastro(d) || {}).base;

// ── Clave de dirección ────────────────────────────────────────

test('catastro e inspector dan la misma clave', () => {
  const k = 'CL|54A|45|85';
  assert.equal(base('CL 54A N 45-85'), k);            // catastro
  assert.equal(base('CL 54A # 45-85'), k);            // formato de la app
  assert.equal(base('CALLE 54A # 45-85'), k);
  assert.equal(base('calle 54 a no. 45-085'), k);     // letra suelta, cero a la izquierda
  assert.equal(base('CL 54A N° 45 - 85'), k);
  assert.equal(base('CL 54A 45-85'), k);              // sin separador
  assert.equal(base('CL 54A # 45 85'), k);            // placa sin guion
});

test('tipos de vía: KR/CARRERA → CR, AV, DG, TV', () => {
  assert.equal(base('KR 50 N 32-10'), 'CR|50|32|10');
  assert.equal(base('Carrera 50 # 32-10'), 'CR|50|32|10');
  assert.equal(base('AV 26 N 52-140 AP 1807'), 'AV|26|52|140');
  assert.equal(base('DIAGONAL 55 # 31-37'), 'DG|55|31|37');
  assert.equal(base('TV 45 # 12-3'), 'TV|45|12|3');
});

test('letras y BIS en la vía y en la placa', () => {
  assert.equal(base('DG 58 N 19 A-26 AP 9948'), 'DG|58|19A|26');
  assert.equal(base('CR 66BB 55-51 PQ MOTO'), 'CR|66BB|55|51');
  assert.equal(base('CL 52C N 67B-30 BL7 AP 402'), 'CL|52C|67B|30');
  assert.equal(base('CL 50 BIS # 32-10'), 'CL|50BIS|32|10');
  assert.equal(base('CL 50 # 32 BIS-10'), 'CL|50|32BIS|10');
});

test('unidad normalizada: AP/APTO, IN/INT, CA/CASA', () => {
  assert.equal(claveDireccionCatastro('CR 47 N 45-38 AP 102').unidad, 'AP102');
  assert.equal(claveDireccionCatastro('CR 47 # 45-38 APTO 102').unidad, 'AP102');
  assert.equal(claveDireccionCatastro('CR 40 N 20C-18 IN 148 AP 201').unidad, 'IN148AP201');
  assert.equal(claveDireccionCatastro('CR 40 # 20C-18 INT 148 APTO 201').unidad, 'IN148AP201');
  assert.equal(claveDireccionCatastro('CL 52B N 65-93 CA 48').unidad, 'CS48');
  assert.equal(claveDireccionCatastro('CL 52B # 65-93 CASA 48').unidad, 'CS48');
  assert.equal(claveDireccionCatastro('CL 50 # 32-10').unidad, '');
});

test('unidad: catastro agrega el piso que el inspector no escribe', () => {
  const u = d => claveDireccionCatastro(d).unidad;
  assert.equal(unidadCatastroCalza(u('CR 47 N 45-38 AP 102 PI2'), u('CR 47 # 45-38 APTO 102')), true);
  assert.equal(unidadCatastroCalza('AP102', 'AP102'), true);
  assert.equal(unidadCatastroCalza('AP102', 'AP10'), false);      // otro dígito: otra unidad
  assert.equal(unidadCatastroCalza('AP102PI2', 'AP103'), false);
  assert.equal(unidadCatastroCalza('AP102', ''), false);
  assert.equal(unidadCatastroCalza('', 'AP102'), false);
});

test('consecutivo pegado delante (visto en BD) se descarta', () => {
  assert.equal(base('12 - CR 50 # 32-10 INT 201'), 'CR|50|32|10');
});

test('no reconocibles → null', () => {
  assert.equal(claveDireccionCatastro(''), null);
  assert.equal(claveDireccionCatastro(null), null);
  assert.equal(claveDireccionCatastro('S.N'), null);
  assert.equal(claveDireccionCatastro('VDA. LA UNIÓN, SECTOR LA CRUZ'), null);
  assert.equal(claveDireccionCatastro('CR 34C X DG 42F'), null);   // cruce, sin placa
  assert.equal(claveDireccionCatastro('CR 50'), null);
  assert.equal(claveDireccionCatastro('6.3263, -75.5617'), null);
});

test('cuadra y placa para la búsqueda aproximada', () => {
  const c = claveDireccionCatastro('CL 54A # 45-85');
  assert.equal(c.cuadra, 'CL|54A|45');
  assert.equal(c.placa, 85);
  const cerca = clavesCercanasCatastro(c, 2).map(x => x.base);
  assert.deepEqual(cerca, ['CL|54A|45|84', 'CL|54A|45|86', 'CL|54A|45|83', 'CL|54A|45|87']);
  // Nunca placas negativas.
  const c0 = claveDireccionCatastro('CL 54A # 45-1');
  assert.deepEqual(clavesCercanasCatastro(c0, 2).map(x => x.base),
    ['CL|54A|45|0', 'CL|54A|45|2', 'CL|54A|45|3']);
  assert.deepEqual(clavesCercanasCatastro(null), []);
});

test('dirección con formato de la app desde la clave de catastro', () => {
  assert.equal(direccionDesdeClave(base('CL 54A N 45-85 AP 402')), 'CL 54A # 45-85');
  assert.equal(direccionDesdeClave(base('KR 50 N 32-010')), 'CR 50 # 32-10');
  assert.equal(direccionDesdeClave(base('CL 50 BIS N 32 BIS-10')), 'CL 50 BIS # 32 BIS-10');
  // Ida y vuelta: la dirección generada vuelve a dar la misma clave.
  const k = base('DG 58 N 19 A-26 AP 9948');
  assert.equal(base(direccionDesdeClave(k)), k);
  assert.equal(direccionDesdeClave(''), '');
});

// ── Geometría ─────────────────────────────────────────────────
// Unidad = 1e-4° ≈ 11 m. Anillos en el formato de catastro: [lat, lon].
const LAT0 = 6.33, LON0 = -75.56, U = 1e-4;
const P = (x, y) => [LAT0 + y * U, LON0 + x * U];
const cuadrado = [P(0, 0), P(1, 0), P(1, 1), P(0, 1), P(0, 0)];
// U: barra de abajo 3×1 y dos patas 1×2; el centroide cae en el hueco.
const enU = [P(0, 0), P(3, 0), P(3, 3), P(2, 3), P(2, 1), P(1, 1), P(1, 3), P(0, 3), P(0, 0)];

test('punto en anillo', () => {
  assert.equal(puntoEnAnillo(...P(0.5, 0.5), cuadrado), true);
  assert.equal(puntoEnAnillo(...P(1.5, 0.5), cuadrado), false);
  assert.equal(puntoEnAnillo(...P(1.5, 2), enU), false);   // hueco de la U
  assert.equal(puntoEnAnillo(...P(0.5, 2), enU), true);    // pata
});

test('distancia al borde en metros', () => {
  assert.equal(distanciaPuntoAnilloM(...P(0.5, 0.5), cuadrado), 0);
  // 1 unidad al este del borde derecho ≈ 11 m.
  const d = distanciaPuntoAnilloM(...P(2, 0.5), cuadrado);
  assert.ok(d > 10.5 && d < 11.5, 'esperaba ~11 m, dio ' + d);
  assert.equal(distanciaPuntoAnilloM(0, 0, []), Infinity);
});

test('punto interior: centroide si cae dentro, si no el tramo más ancho', () => {
  const pc = puntoInteriorAnillo(cuadrado);
  assert.ok(puntoEnAnillo(pc[0], pc[1], cuadrado));
  assert.ok(Math.abs(pc[0] - P(0.5, 0.5)[0]) < 1e-9 && Math.abs(pc[1] - P(0.5, 0.5)[1]) < 1e-9);
  // Precondición del caso: el centroide de la U queda afuera.
  const pu = puntoInteriorAnillo(enU);
  assert.ok(puntoEnAnillo(pu[0], pu[1], enU), 'el punto de la U tiene que quedar dentro');
  // Anillo sin orientación de catastro (horario): mismo resultado.
  const pr = puntoInteriorAnillo(enU.slice().reverse());
  assert.ok(puntoEnAnillo(pr[0], pr[1], enU));
  assert.equal(puntoInteriorAnillo([]), null);
});

// ── Dirección ↔ pin ───────────────────────────────────────────
const terreno = { tcod: 'T1', anillo: cuadrado };
const vecino = { tcod: 'T2', anillo: [P(1, 0), P(2, 0), P(2, 1), P(1, 1), P(1, 0)] };

test('pin dentro del predio de la dirección → coincide', () => {
  const r = compararUbicacion([terreno], ...P(0.5, 0.5));
  assert.deepEqual(r, { estado: 'coincide', tcod: 'T1', distM: 0 });
});

test('pin en la calle o en el vecino a ≤ 10 m → coincide y la ficha es la de la dirección', () => {
  // 0,5 unidades (~5,5 m) al este: dentro del vecino, pegado al lindero.
  const r = compararUbicacion([terreno], ...P(1.5, 0.5));
  assert.equal(r.estado, 'coincide');
  assert.equal(r.tcod, 'T1');
  // Al sur, en la calle (~5,5 m).
  assert.equal(compararUbicacion([terreno], ...P(0.5, -0.5)).estado, 'coincide');
});

test('pin a más de 10 m → distinto, con la distancia', () => {
  const r = compararUbicacion([terreno], ...P(3, 0.5));   // ~22 m
  assert.equal(r.estado, 'distinto');
  assert.equal(r.tcod, 'T1');
  assert.ok(r.distM >= 21 && r.distM <= 23, 'distM ' + r.distM);
  // Umbral configurable.
  assert.equal(compararUbicacion([terreno], ...P(3, 0.5), 25).estado, 'coincide');
});

test('dirección con varios terrenos: gana el que contiene o está más cerca del pin', () => {
  const r = compararUbicacion([terreno, vecino], ...P(1.5, 0.5));
  assert.equal(r.tcod, 'T2');
  assert.equal(r.distM, 0);
});

test('sin dirección o sin pin', () => {
  assert.equal(compararUbicacion([], ...P(0.5, 0.5)).estado, 'sin-dir');
  assert.equal(compararUbicacion(null, 1, 1).estado, 'sin-dir');
  assert.deepEqual(compararUbicacion([terreno], null, null), { estado: 'sin-pin', tcod: 'T1', distM: null });
  assert.equal(compararUbicacion([terreno], '', '').estado, 'sin-pin');
  // Varios terrenos sin pin: no se elige ninguno.
  assert.equal(compararUbicacion([terreno, vecino], null, null).tcod, null);
  // Coordenadas como texto (así vienen de BD).
  assert.equal(compararUbicacion([terreno], String(P(0.5, 0.5)[0]), String(P(0.5, 0.5)[1])).estado, 'coincide');
});

// ── Confirmación ──────────────────────────────────────────────

test('origen desde la columna UBICACION_CONFIRMADA', () => {
  assert.equal(origenUbicacionConfirmada('GPS · 29/09/2026 · DANIEL PEDRAZA'), 'GPS');
  assert.equal(origenUbicacionConfirmada('DIRECCION · 29/09/2026 · X'), 'DIRECCION');
  assert.equal(origenUbicacionConfirmada('mapa'), 'MAPA');
  assert.equal(origenUbicacionConfirmada(''), '');
  assert.equal(origenUbicacionConfirmada(null), '');
  assert.equal(origenUbicacionConfirmada('OTRA COSA · 29/09/2026'), '');
});

test('la confirmación vale mientras no cambien punto, dirección ni ficha', () => {
  const conf = { origen: 'GPS', lat: 6.3263, lon: -75.5617, direccion: 'CL 50 # 32-10', catastral: '050880100030900010074000000000' };
  const d = { lat: '6.3263', lon: '-75.5617', direccion: 'cl 50 #  32-10 ', catastral: '050880100030900010074000000000' };
  assert.equal(ubicacionConfirmadaVigente(conf, d), true);   // texto vs número, mayúsculas, espacios
  assert.equal(ubicacionConfirmadaVigente(conf, { ...d, lat: '6.32631' }), false);
  assert.equal(ubicacionConfirmadaVigente(conf, { ...d, direccion: 'CL 50 # 32-12' }), false);
  assert.equal(ubicacionConfirmadaVigente(conf, { ...d, catastral: '050880100030900010075000000000' }), false);
  assert.equal(ubicacionConfirmadaVigente(conf, { ...d, lat: '' }), false);
  // Sin ficha no hay confirmación posible.
  assert.equal(ubicacionConfirmadaVigente({ ...conf, catastral: '' }, { ...d, catastral: '' }), false);
  assert.equal(ubicacionConfirmadaVigente(null, d), false);
  assert.equal(ubicacionConfirmadaVigente({ ...conf, origen: '' }, d), false);
});

// PH sin la unidad identificada: se confirma con el código del predio matriz.
test('código del predio matriz en PH', () => {
  const tcod = '050880100010200280019';
  assert.equal(codigoPredioMatriz(tcod), '050880100010200280019900000000');
  assert.equal(esCodigoPredioMatriz(codigoPredioMatriz(tcod)), true);
  assert.equal(esCodigoPredioMatriz(tcod + '901010003'), false);   // una unidad
  assert.equal(esCodigoPredioMatriz(''), false);
  assert.equal(codigoPredioMatriz('123'), '');
  // Confirma sin ficha: basta el código.
  const d = { lat: 6.3, lon: -75.5, direccion: 'CL 21C # 40B-42', catastral: codigoPredioMatriz(tcod), ficha: '' };
  assert.equal(ubicacionConfirmadaVigente({ origen: 'MAPA', lat: 6.3, lon: -75.5, direccion: d.direccion, catastral: d.catastral }, d), true);
});

// ── Vecino preferido (placa que no está en catastro) ──────────
// Caso real: DG 58 # 45-16 no existe; hay 45-14, 45-15 y 45-19. El 45-15
// está a 1 de placa pero en la acera de enfrente: gana el 45-14.
test('vecino preferido: mismo costado antes que placa más cercana', () => {
  const c = claveDireccionCatastro('DG 58 45-16');
  const ts = [
    { direccion: 'DG 58 N 45-15', dif: 1 },
    { direccion: 'DG 58 N 45-14', dif: 2 },
    { direccion: 'DG 58 N 45-19', dif: 3 },
  ];
  assert.equal(terrenoVecinoPreferido(c, ts).direccion, 'DG 58 N 45-14');
  // Sin nadie del mismo costado, el más cercano del otro.
  assert.equal(terrenoVecinoPreferido(c, ts.filter(t => !t.direccion.endsWith('14'))).direccion, 'DG 58 N 45-15');
  assert.equal(terrenoVecinoPreferido(c, []), null);
  assert.equal(terrenoVecinoPreferido(null, ts), null);
});

// ── Búsqueda por dato catastral (Consulta norma) ──────────────
// Lo que se vigila: que una dirección o unas coordenadas nunca se tomen por
// ficha (dejarían de buscarse como lo que son), y que un código escrito con
// espacios no se lea como latitud y longitud.
test('dato catastral: ficha, matrícula y código', () => {
  const { claveBusquedaCatastral: k } = require('../utils.js');
  assert.deepEqual(k('15093'), { tipo: 'numero', numero: 15093 });
  assert.deepEqual(k(' 5358461 '), { tipo: 'numero', numero: 5358461 });
  assert.deepEqual(k('01N-5358461'), { tipo: 'matricula', numero: 5358461 });
  assert.deepEqual(k('01n 5358461'), { tipo: 'matricula', numero: 5358461 });
  const tcod = '050880100030100150006';
  assert.deepEqual(k(tcod), { tipo: 'codigo', tcod, sufijo: '' });
  assert.deepEqual(k(tcod + '901040004'), { tipo: 'codigo', tcod, sufijo: '901040004' });
  // Como viene impreso, y sin el 05088 del municipio.
  assert.deepEqual(k('05088 01 00 03 01 0015 0006 9 01 04 0004'), { tipo: 'codigo', tcod, sufijo: '901040004' });
  assert.deepEqual(k('0100030100150006901040004'), { tipo: 'codigo', tcod, sufijo: '901040004' });
  assert.deepEqual(k('0100030100150006'), { tipo: 'codigo', tcod, sufijo: '' });
});

test('dato catastral: direcciones y coordenadas no lo son', () => {
  const { claveBusquedaCatastral: k } = require('../utils.js');
  assert.equal(k('6.337, -75.557'), null);
  assert.equal(k('6.337 -75.557'), null);
  assert.equal(k('6 -75'), null);
  assert.equal(k('CL 50 32-10'), null);
  assert.equal(k('50 32-10'), null);
  assert.equal(k('50A 3210'), null);    // placa sin tipo de vía, no matrícula
  assert.equal(k('50A-3210'), null);
  assert.equal(k('50'), null);          // número de vía a medio escribir
  assert.equal(k('123'), null);
  assert.equal(k('1234567890'), null);  // 10 dígitos: ni ficha ni código
  assert.equal(k(''), null);
  assert.equal(k(null), null);
});
