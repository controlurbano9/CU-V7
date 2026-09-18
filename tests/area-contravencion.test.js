// ═══════════════════════════════════════════════════════════════
// tests/area-contravencion.test.js — los tres estados del área.
//
// El campo tiene tres respuestas posibles y las tres son informativas:
// una cifra, "No aplica" (no hay infracción, no hay nada que medir) y
// "No se pudo medir" (sí había, no se pudo tomar la medida). El acta
// F-GGO-46 y el informe F-GGO-43 escriben ese texto tal cual, así que
// confundirlos le dice al expediente algo que no pasó.
//
// _areaTexto es el único punto de verdad: alimenta el payload (col Y),
// el acta y el informe. Se extrae de nueva-visita.jsx, que es JSX y no
// se puede requerir desde Node.
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FUENTE = path.join(__dirname, '..', 'nueva-visita.jsx');
const src = fs.readFileSync(FUENTE, 'utf8');

const ctx = vm.createContext({});
for (const re of [
  /const AREA_NO_MEDIBLE = [\s\S]*?;/,
  /const AREA_NO_APLICA\s+= [\s\S]*?;/,
  /function _areaTexto\(d\) \{[\s\S]*?\n\}/,
  /function _areaDesdeBD\(v\) \{[\s\S]*?\n\}/,
]) {
  const m = src.match(re);
  assert.ok(m, 'no encontre en nueva-visita.jsx: ' + re);
  // `const` dentro de un contexto vm no se cuelga del global: se pasa a `var`
  // para poder leerlo desde aqui. No cambia el comportamiento del codigo.
  vm.runInContext(m[0].replace(/^const /, 'var '), ctx);
}
const { _areaTexto, AREA_NO_APLICA, AREA_NO_MEDIBLE } = ctx;
// _areaDesdeBD devuelve un objeto nacido en el contexto vm, y deepStrictEqual
// compara prototipos: se copia al realm de la prueba antes de comparar.
const _areaDesdeBD = (v) => ({ ...ctx._areaDesdeBD(v) });

test('_areaTexto — los tres estados, y "No aplica" manda sobre "no se pudo medir"', () => {
  assert.equal(_areaTexto({ area: '120' }), '120');
  assert.equal(_areaTexto({ areaNoAplica: true }), 'No aplica');
  assert.equal(_areaTexto({ areaNoMedible: true }), 'No se pudo medir');
  // Las casillas son excluyentes en la UI; si por lo que sea llegan las dos,
  // gana "No aplica": decir que no se pudo medir algo que no existe es peor.
  assert.equal(_areaTexto({ areaNoAplica: true, areaNoMedible: true }), 'No aplica');
  // La cifra se ignora si hay casilla marcada: es lo que ve el inspector
  // (el input queda deshabilitado) y debe ser lo que se escribe.
  assert.equal(_areaTexto({ area: '120', areaNoAplica: true }), 'No aplica');
  assert.equal(_areaTexto({ area: '120', areaNoMedible: true }), 'No se pudo medir');
});

test('_areaTexto — sin área devuelve vacío, nunca undefined ni "undefined"', () => {
  // Va a una celda del Sheet: un undefined ahí se escribe como texto.
  for (const d of [{}, { area: '' }, { area: null }, { area: undefined }]) {
    assert.equal(_areaTexto(d), '');
  }
});

test('_areaDesdeBD — el N/A de las filas migradas de V2 se lee como "No aplica"', () => {
  for (const v of ['N/A', 'n/a', 'NA', 'na', 'No aplica', 'NO APLICA', ' N/A ']) {
    assert.deepEqual(_areaDesdeBD(v), { area: '', noMedible: false, noAplica: true },
      'no se interpretó como "No aplica": ' + JSON.stringify(v));
  }
});

test('_areaDesdeBD — "No se pudo medir" no se confunde con "No aplica"', () => {
  assert.deepEqual(_areaDesdeBD('No se pudo medir'),
    { area: '', noMedible: true, noAplica: false });
  assert.deepEqual(_areaDesdeBD('NO SE PUDO MEDIR'),
    { area: '', noMedible: true, noAplica: false });
});

test('_areaDesdeBD — una cifra sigue siendo cifra, y la celda vacía no marca nada', () => {
  assert.deepEqual(_areaDesdeBD('120'), { area: '120', noMedible: false, noAplica: false });
  assert.deepEqual(_areaDesdeBD('12,5'), { area: '12,5', noMedible: false, noAplica: false });
  for (const v of ['', null, undefined, '   ']) {
    assert.deepEqual(_areaDesdeBD(v), { area: '', noMedible: false, noAplica: false });
  }
});

test('ida y vuelta — reabrir una visita no cambia lo que dice el expediente', () => {
  // Es la garantía que importa: lo que se escribió en col Y vuelve al mismo
  // estado del formulario, y volver a guardar escribe exactamente lo mismo.
  for (const d of [
    { area: '120' }, { areaNoAplica: true }, { areaNoMedible: true }, {},
  ]) {
    const enBD = _areaTexto(d);
    const leido = _areaDesdeBD(enBD);
    assert.equal(_areaTexto({
      area: leido.area, areaNoAplica: leido.noAplica, areaNoMedible: leido.noMedible,
    }), enBD, 'no sobrevivió el round-trip: ' + JSON.stringify(d));
  }
});

test('las constantes son el texto exacto que espera el acta', () => {
  assert.equal(AREA_NO_APLICA, 'No aplica');
  assert.equal(AREA_NO_MEDIBLE, 'No se pudo medir');
});

test('los tres consumidores usan _areaTexto, ninguno lee d.area a secas', () => {
  // El bug original: al informe le llegaba `d.area`, así que "No se pudo
  // medir" le llegaba vacío y el validador avisaba de área faltante.
  const consumidores = [
    /_areaTexto\(d\),\s*\/\/ Y {2}AREA CONTRAVENCION m2/,  // payload → col Y
    /area:\s+_areaTexto\(d\),/,                            // acta F-GGO-46
    /areas:\s+_areaTexto\(d\),/,                           // informe F-GGO-43
  ];
  for (const re of consumidores) {
    assert.match(src, re, 'consumidor sin _areaTexto: ' + re);
  }
  // Y que no haya quedado ningún `area: d.area` suelto hacia un entregable.
  assert.doesNotMatch(src, /areas?:\s+d\.area\b/);
});

test('el área cae en la columna Y del payload posicional', () => {
  // El payload es un array por POSICION (el backend hace
  // getRange(fila, 2, 1, len).setValues), asi que insertar un campo en
  // medio corre todas las columnas siguientes sin que nada se queje.
  // Esta prueba cuenta elementos de verdad, no los comentarios `// Y ...`,
  // que no estan todos.
  const marca = src.indexOf('_areaTexto(d),');
  const ini = src.lastIndexOf('return [', marca) + 'return ['.length;
  const BS = String.fromCharCode(92);
  let prof = 0, n = 0, i = ini;
  while (i < marca) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < marca && src[i] !== q) { if (src[i] === BS) i++; i++; }
      i++; continue;
    }
    if (c === '(' || c === '[' || c === '{') prof++;
    if (c === ')' || c === ']' || c === '}') prof--;
    if (c === ',' && prof === 0) n++;
    i++;
  }
  // El array arranca en la columna B, asi que el elemento n cae en 2 + n.
  assert.equal(n + 2, 25, 'el area ya no cae en la columna Y (25), sino en la ' + (n + 2));
});
