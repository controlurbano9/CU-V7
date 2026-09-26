// ═══════════════════════════════════════════════════════════════
// tests/direcciones.test.js — normalizarDireccion.
//
// Lo que se vigila aquí no es solo el formato de salida: es que la CLAVE de
// carpeta de Drive no cambie. El backend compara con `_normDir`, que quita
// `#` y expande nada — se replica abajo para comprobar que normalizar la
// dirección deja la misma clave que la grafía original. Si eso deja de
// cumplirse, las visitas viejas dejan de encontrar su carpeta.
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarDireccion, claveBusquedaDireccion } = require('../utils.js');

// Copia literal de _normDir (apps_script_unificado.js).
function normDir(dir) {
  return dir.trim().toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\bCARRERA\b/g, 'CR').replace(/\bCLLE\b/g, 'CL')
    .replace(/\bCALLE\b/g, 'CL').replace(/\bDIAGONAL\b/g, 'DG')
    .replace(/\bTRANSVERSAL\b/g, 'TV').replace(/\bAVENIDA\b/g, 'AV')
    .replace(/N°/g, '').replace(/Nº/g, '').replace(/#/g, '')
    .replace(/\b(NO|NRO|NUM|NUMERO|N)\b\.?/g, '')
    .replace(/[°º]/g, '')
    .replace(/\s+/g, ' ').trim();
}

test('grafías urbanas → CL/CR con separador #', () => {
  assert.equal(normalizarDireccion('CALLE 50 # 32-10'), 'CL 50 # 32-10');
  assert.equal(normalizarDireccion('calle 50 no. 32-10'), 'CL 50 # 32-10');
  assert.equal(normalizarDireccion('CARRERA 50 N° 32-10'), 'CR 50 # 32-10');
  assert.equal(normalizarDireccion('Cra. 50 32-10'), 'CR 50 # 32-10');
  assert.equal(normalizarDireccion('  CL   50   #  32-10 '), 'CL 50 # 32-10');
  assert.equal(normalizarDireccion('TRANSVERSAL 45 # 12-3'), 'TV 45 # 12-3');
});

test('ya normalizada: idempotente', () => {
  const uno = normalizarDireccion('CALLE 51 # 53-68');
  assert.equal(uno, 'CL 51 # 53-68');
  assert.equal(normalizarDireccion(uno), uno);
});

test('rural o sin tipo de vía reconocible: no se toca', () => {
  assert.equal(normalizarDireccion('Vereda Hato Viejo, sector La Loma'),
               'Vereda Hato Viejo, sector La Loma');
  assert.equal(normalizarDireccion(''), '');
  assert.equal(normalizarDireccion(null), '');
});

test('la clave de carpeta de Drive NO cambia al normalizar', () => {
  const casos = [
    'CALLE 51 # 53-68', 'CARRERA 50 N° 32-10', 'CL 45 47-50/52',
    'calle 55 no. 46-21', 'TRANSVERSAL 45 # 12-3',
  ];
  for (const original of casos) {
    assert.equal(normDir(normalizarDireccion(original)), normDir(original),
      'cambia la carpeta de: ' + original);
  }
});

// Búsqueda en Buscar: lo tecleado y lo guardado pasan por la misma clave y se
// comparan con includes. Pedido 2026-09-25: `CL 50 # 32 10` no encontraba nada.
test('búsqueda de dirección insensible al separador', () => {
  const bd = claveBusquedaDireccion('CALLE 50 # 32-10');
  for (const q of ['CL 50 # 32 10', 'cl 50 32-10', 'CL 50 # 3210', 'Cra 50', '32 10', '# 3210', 'calle 50 no. 32-10']) {
    const k = claveBusquedaDireccion(q);
    if (q === 'Cra 50') assert.ok(!bd.includes(k), q + ' no debe encontrar una calle');
    else assert.ok(bd.includes(k), q + ' → ' + k + ' no está en ' + bd);
  }
  assert.equal(claveBusquedaDireccion('#'), '');
  assert.equal(claveBusquedaDireccion('Vda. La China'), 'VDALACHINA');
});
