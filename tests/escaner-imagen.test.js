// ═══════════════════════════════════════════════════════════════
// tests/escaner-imagen.test.js — cálculo del escáner de órdenes de policía
// (escaner-orden.jsx): detección de la hoja, homografía, proporción de
// salida y blanqueo de sombras.
//
// Las funciones no tocan el DOM, así que se extraen del .jsx por nombre y
// se evalúan en un contexto aislado (mismo truco que orden-pdf.test.js).
// Las imágenes de prueba son sintéticas: una hoja clara girada sobre una
// mesa oscura, con una sombra que oscurece una esquina — el caso real que
// dejaba la orden 2026-09-386 gris y manchada.
//
// Ejecutar: node --test tests/
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'escaner-orden.jsx'), 'utf8');
const ctx = vm.createContext({});
for (const c of ['EO_PROPORCION_OFICIO', 'EO_BORDE', 'EO_NEGRO', 'EO_BLANCO']) {
  const m = new RegExp('const ' + c + ' = [^;]+;').exec(src);
  assert.ok(m, 'no se encontró ' + c);
  vm.runInContext(m[0].replace('const ', 'var '), ctx);
}
for (const f of ['_eoOtsu', '_eoOrdenarEsquinas', '_eoAreaCuad', '_eoDetectarHoja', '_eoHomografia',
                 '_eoAplicarH', '_eoProporcionSalida', '_eoRotarCuad', '_eoEnderezar', '_eoBlanquear']) {
  const m = new RegExp('function ' + f + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}').exec(src);
  assert.ok(m, 'no se encontró ' + f + ' en escaner-orden.jsx');
  vm.runInContext(m[0], ctx);
}
const E = vm.runInContext('({ _eoOrdenarEsquinas, _eoAreaCuad, _eoDetectarHoja, _eoHomografia, _eoAplicarH, ' +
  '_eoProporcionSalida, _eoRotarCuad, _eoEnderezar, _eoBlanquear, EO_PROPORCION_OFICIO })', ctx);

function cerca(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' esperado ' + b + ' ± ' + tol + ', llegó ' + a);
}

// ¿El punto (x,y) está dentro del cuadrilátero convexo q (orden horario)?
function dentro(q, x, y) {
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
  }
  return true;
}

// Foto sintética w x h: mesa oscura con ruido suave, hoja clara con líneas
// de "texto" y una sombra que baja la luz hasta `sombra` en la esquina
// inferior derecha (hoja y mesa por igual, como la sombra real).
// El texto va dentro de un margen (la hoja encogida 15 % hacia su centro),
// como en el papel real: la región crece por ese margen hacia la esquina en
// sombra. Con renglones hasta el filo, cada uno sería un borde que la corta.
function foto(w, h, q, sombra) {
  const g = new Uint8ClampedArray(w * h);
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
  const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  const caja = q.map(p => [cx + (p[0] - cx) * 0.85, cy + (p[1] - cy) * 0.85]);
  let semilla = 7;
  function azar() { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; }
  const ruido = [];
  for (let i = 0; i < 64; i++) ruido.push(azar());
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const luz = 1 - (1 - sombra) * Math.max(0, (x / w + y / h) - 1);
      let v;
      if (dentro(q, x, y)) {
        v = (dentro(caja, x, y) && y % 9 < 2 && x % 13 > 3) ? 70 : 235;   // renglones de texto
      } else {
        v = 60 + 25 * ruido[((x >> 3) * 7 + (y >> 3) * 13) % 64];
      }
      g[y * w + x] = v * luz;
    }
  }
  return g;
}

test('ordenar esquinas: cualquier orden de entrada sale sup-izq, sup-der, inf-der, inf-izq', () => {
  const q = [[10, 12], [90, 8], [95, 120], [5, 115]];
  const r = E._eoOrdenarEsquinas([q[2], q[0], q[3], q[1]]);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), q);
});

test('ordenar esquinas desenreda un cuadrilátero cruzado', () => {
  // El inspector arrastró la esquina inf-der por encima de la inf-izq.
  const cruzado = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const r = E._eoOrdenarEsquinas(cruzado);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), [[0, 0], [1, 0], [1, 1], [0, 1]]);
});

test('homografía: lleva cada esquina a su destino y es consistente en el centro', () => {
  const de = [[0, 0], [100, 0], [100, 150], [0, 150]];
  const a = [[12, 30], [210, 10], [230, 300], [5, 280]];
  const H = E._eoHomografia(de, a);
  for (let i = 0; i < 4; i++) {
    const p = E._eoAplicarH(H, de[i][0], de[i][1]);
    cerca(p[0], a[i][0], 1e-6, 'x esquina ' + i);
    cerca(p[1], a[i][1], 1e-6, 'y esquina ' + i);
  }
  // Las diagonales del rectángulo se cruzan en el centro; su imagen es el
  // cruce de las diagonales del cuadrilátero.
  const c = E._eoAplicarH(H, 50, 75);
  const [p1, p3, p2, p4] = [a[0], a[2], a[1], a[3]];
  const d = (p1[0] - p3[0]) * (p2[1] - p4[1]) - (p1[1] - p3[1]) * (p2[0] - p4[0]);
  const t = ((p1[0] - p2[0]) * (p2[1] - p4[1]) - (p1[1] - p2[1]) * (p2[0] - p4[0])) / d;
  cerca(c[0], p1[0] + t * (p3[0] - p1[0]), 1e-6);
  cerca(c[1], p1[1] + t * (p3[1] - p1[1]), 1e-6);
});

test('homografía degenerada (puntos repetidos) devuelve null', () => {
  assert.equal(E._eoHomografia([[0, 0], [0, 0], [0, 0], [0, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]]), null);
});

test('detecta la hoja girada sobre la mesa', () => {
  const w = 270, h = 360;
  const q = [[60, 30], [230, 55], [215, 330], [40, 305]];
  const r = E._eoDetectarHoja(foto(w, h, q, 1), w, h);
  assert.ok(r, 'no detectó la hoja');
  for (let i = 0; i < 4; i++) {
    cerca(r[i][0] * w, q[i][0], 4, 'x esquina ' + i);
    cerca(r[i][1] * h, q[i][1], 4, 'y esquina ' + i);
  }
});

test('la sombra no se come la esquina: la hoja se sigue hasta su borde', () => {
  // Sombra al 40 % en la esquina inf-der: el papel ahí queda por debajo del
  // umbral de Otsu. Antes esa esquina salía recortada hacia adentro.
  const w = 270, h = 360;
  const q = [[60, 30], [230, 55], [215, 330], [40, 305]];
  const r = E._eoDetectarHoja(foto(w, h, q, 0.4), w, h);
  assert.ok(r, 'no detectó la hoja');
  cerca(r[2][0] * w, q[2][0], 5, 'x inf-der');
  cerca(r[2][1] * h, q[2][1], 5, 'y inf-der');
});

test('sin hoja reconocible devuelve null (se usa la foto completa)', () => {
  const w = 100, h = 140;
  const plano = new Uint8ClampedArray(w * h).fill(180);
  assert.equal(E._eoDetectarHoja(plano, w, h), null);
  // Foto que ya viene recortada: la hoja llena el cuadro.
  const llena = foto(w, h, [[0, 0], [w, 0], [w, h], [0, h]], 1);
  assert.equal(E._eoDetectarHoja(llena, w, h), null);
});

test('proporción de salida: cerca de oficio se fija en oficio; lo demás se respeta', () => {
  // Hoja oficio vista con perspectiva: mide 1.42 y sale 13/8.5.
  assert.equal(E._eoProporcionSalida([[0, 0], [100, 0], [100, 142], [0, 142]]), E.EO_PROPORCION_OFICIO);
  // Recorte apaisado a propósito: no se deforma.
  cerca(E._eoProporcionSalida([[0, 0], [200, 0], [200, 100], [0, 100]]), 0.5, 1e-9);
});

test('girar el recorte 4 veces vuelve al original; 90° lleva sup-izq a sup-der', () => {
  const q = [[0.1, 0.2], [0.8, 0.15], [0.9, 0.85], [0.05, 0.9]];
  let r = q;
  for (let i = 0; i < 4; i++) r = E._eoRotarCuad(r, 90);
  for (let i = 0; i < 4; i++) { cerca(r[i][0], q[i][0], 1e-12); cerca(r[i][1], q[i][1], 1e-12); }
  const r90 = E._eoRotarCuad(q, 90);
  // La inf-izq (0.05, 0.9) queda arriba a la izquierda tras girar horario.
  cerca(r90[0][0], 1 - 0.9, 1e-12); cerca(r90[0][1], 0.05, 1e-12);
});

test('enderezar: la hoja rellena la salida entera, sin mesa en los bordes', () => {
  const w = 200, h = 260;
  const q = [[40, 20], [180, 40], [170, 240], [25, 225]];
  const g = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = dentro(q, x, y) ? 230 : 30;
  const out = E._eoEnderezar(g, w, h, q, 100, 150);
  let oscuros = 0;
  for (let i = 0; i < out.length; i++) if (out[i] < 128) oscuros++;
  // Solo el antialias del borde puede quedar oscuro.
  assert.ok(oscuros / out.length < 0.01, 'quedó mesa en la salida: ' + oscuros + ' px');
});

test('blanqueo: papel en sombra sale blanco y la tinta negra', () => {
  const w = 320, h = 480;
  const g = new Uint8ClampedArray(w * h);
  const tinta = [], papel = [], reverso = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const luz = 1 - 0.55 * (x / w);                 // sombra: la derecha a 45 %
      const k = y * w + x;
      let r = 1;                                       // proporción sobre el papel
      if (y % 12 < 2 && x % 7 < 5) { r = 0.3; tinta.push(k); }          // texto
      else if (y % 12 === 6 && x % 7 < 5) { r = 0.9; reverso.push(k); } // reverso transparentado
      else papel.push(k);
      g[k] = 230 * luz * r;
    }
  }
  const out = E._eoBlanquear(g, w, h);
  const blancos = papel.filter(k => out[k] >= 250).length / papel.length;
  const negros = tinta.filter(k => out[k] <= 5).length / tinta.length;
  const reversoBorrado = reverso.filter(k => out[k] >= 250).length / reverso.length;
  assert.ok(blancos > 0.99, 'papel blanco: ' + blancos);
  assert.ok(negros > 0.99, 'tinta negra: ' + negros);
  assert.ok(reversoBorrado > 0.99, 'reverso borrado: ' + reversoBorrado);
});

test('blanqueo: un bloque negro grande (sello, logo) no se vuelve blanco', () => {
  const w = 320, h = 480;
  const g = new Uint8ClampedArray(w * h).fill(230);
  const bloque = [];
  for (let y = 100; y < 220; y++) for (let x = 100; x < 220; x++) { g[y * w + x] = 25; bloque.push(y * w + x); }
  const out = E._eoBlanquear(g, w, h);
  const negros = bloque.filter(k => out[k] <= 5).length / bloque.length;
  assert.ok(negros > 0.95, 'el bloque se lavó: ' + negros);
});
