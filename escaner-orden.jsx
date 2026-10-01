// ═══════════════════════════════════════════════════════════════
// escaner-orden.jsx — Escáner de órdenes de policía (PDF a Drive)
//
// El inspector diligencia y firma la orden de policía en papel, formato
// OFICIO (8.5 x 13 pulgadas). Aquí la fotografía página por página con la
// cámara del teléfono y cada toma pasa por el mismo camino que un escáner
// de documentos (iPhone, Google Drive):
//   1. se detecta la hoja sobre la mesa y se proponen sus 4 esquinas;
//   2. el inspector las ajusta en el editor de recorte (EditorRecorteEO);
//   3. una homografía endereza la hoja a una página oficio (perspectiva);
//   4. se normaliza la iluminación: papel blanco parejo aunque haya sombra,
//      tinta negra y sin el texto que se transparenta del reverso;
// y el conjunto se arma como un PDF de páginas oficio con jsPDF.
//
// Todo en canvas y JS puro: OpenCV.js pesa ~8 MB, inviable en campo.
// Las funciones de cálculo (_eoOtsu, _eoDetectarHoja, _eoHomografia,
// _eoBlanquear...) no tocan el DOM: las prueba tests/escaner-imagen.test.js.
//
// Por qué el PDF se arma en el cliente y no en Apps Script:
//   - El escaneo pasa en campo, muchas veces sin señal. Con el PDF ya
//     ensamblado, la subida se encola en IndexedDB como una foto más y sale
//     sola al recuperar conexión. Si lo armara el backend haría falta estar
//     conectado para cerrar el escaneo.
//   - Una sola llamada al webhook por orden, en vez de N subidas de página
//     más un ensamblado que dejaría JPEG huérfanos si falla a la mitad.
//
// jsPDF se carga bajo demanda (cargarJsPDF en api.js) y app.jsx lo precalienta
// tras el login, igual que turf y el SDK de Maps.
// ═══════════════════════════════════════════════════════════════

const { useState: useStateEO, useEffect: useEffectEO, useRef: useRefEO } = React;

// Página oficio 8.5" x 13" en milímetros — jsPDF no trae este formato
// (su 'legal' es 8.5 x 14"), así que va como [ancho, alto] explícito.
const EO_PAGINA_MM = [215.9, 330.2];
const EO_PROPORCION_OFICIO = 13 / 8.5;

// 150 DPI sobre 8.5" de ancho. Suficiente para leer manuscrito y firmas sin
// inflar el PDF: cada página pesa ~150-250 KB en JPEG q0.75.
const EO_ANCHO_PX = 1275;

// Lado largo del lienzo de trabajo. La foto de un teléfono trae 12 MP; con
// 2600 px la hoja enderezada todavía tiene más resolución que la salida y
// la memoria no se dispara en un Android barato (getImageData de 12 MP son
// 48 MB por página).
const EO_LADO_TRABAJO = 2600;
// Vista previa del editor de recorte y lado largo de la copia de detección.
const EO_LADO_VISTA = 1400;
const EO_LADO_DETECCION = 360;

// Tope del payload. El webhook aguanta más, pero un PDF de campo que pase de
// aquí casi siempre significa demasiadas páginas o fotos sin recortar.
const EO_MAX_BASE64 = 6 * 1024 * 1024;

// ─── Cálculo puro (sin DOM) ────────────────────────────────────

// Umbral de Otsu sobre un histograma de 256 niveles: separa papel de mesa.
function _eoOtsu(hist, total) {
  let suma = 0;
  for (let i = 0; i < 256; i++) suma += i * hist[i];
  let sumaB = 0, pesoB = 0, mejor = 0, umbral = 127;
  for (let t = 0; t < 256; t++) {
    pesoB += hist[t];
    if (!pesoB) continue;
    const pesoF = total - pesoB;
    if (!pesoF) break;
    sumaB += t * hist[t];
    const mB = sumaB / pesoB, mF = (suma - sumaB) / pesoF;
    const entre = pesoB * pesoF * (mB - mF) * (mB - mF);
    if (entre > mejor) { mejor = entre; umbral = t; }
  }
  return umbral;
}

// Ordena 4 puntos como [sup-izq, sup-der, inf-der, inf-izq] por ángulo
// alrededor del centro. Sirve también para "desenredar" un cuadrilátero que
// el inspector cruzó al arrastrar una esquina por encima de otra.
function _eoOrdenarEsquinas(pts) {
  const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
  const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
  const orden = pts.slice().sort(function (a, b) {
    return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx);
  });
  // atan2 con y hacia abajo recorre sup-izq → sup-der → inf-der → inf-izq;
  // se rota la lista para que arranque en la esquina de menor x+y.
  let ini = 0;
  for (let i = 1; i < 4; i++) {
    if (orden[i][0] + orden[i][1] < orden[ini][0] + orden[ini][1]) ini = i;
  }
  return orden.slice(ini).concat(orden.slice(0, ini)).map(function (p) { return [p[0], p[1]]; });
}

function _eoAreaCuad(q) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i], s = q[(i + 1) % 4];
    a += p[0] * s[1] - s[0] * p[1];
  }
  return Math.abs(a) / 2;
}

// Busca la hoja en una imagen de grises pequeña (lado largo ~360 px).
// Devuelve las 4 esquinas normalizadas a [0,1] o null si no hay una hoja
// clara (papel sobre mesa blanca, foto ya recortada...): entonces se usa
// la foto completa y el inspector ajusta a mano.
//
// Otsu separa lo claro (papel) de lo oscuro (mesa); la región clara más
// grande es la hoja, y sus esquinas son los extremos en las diagonales:
// min(x+y) = sup-izq, max(x-y) = sup-der, max(x+y) = inf-der,
// min(x-y) = inf-izq. Vale para hojas giradas hasta ~45° y con perspectiva.
//
// La sombra oscurece una esquina de la hoja por debajo del umbral y Otsu
// sola la tomaría por mesa. Por eso hay dos pasadas:
//   1. Otsu puro: la región clara más grande es la hoja (la mesa casi nunca
//      pasa el umbral, y si pasa queda en manchas sueltas más chicas).
//   2. Solo esa región se extiende hacia píxeles más oscuros que no estén
//      sobre un borde: la sombra es un degradado (casi sin cambio entre
//      vecinos), el borde de la hoja contra la mesa es un salto y ahí se
//      detiene. Extender todas las regiones hacía crecer también la textura
//      de la mesa, que terminaba siendo la región más grande.
// El borde se mide a 2 píxeles (diferencia central) porque en la foto
// reducida el salto se reparte en un píxel mezclado: medido de a 1, cada
// mitad pasaba por "suave".
const EO_BORDE = 14;
function _eoDetectarHoja(gris, w, h) {
  const total = w * h;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < total; i++) hist[gris[i]]++;
  const t = _eoOtsu(hist, total);
  const piso = t * 0.4;
  const visto = new Uint8Array(total);
  const pila = new Int32Array(total);

  // Relleno desde `ini` con el criterio `entra`; devuelve tamaño y los
  // extremos en las dos diagonales.
  function rellenar(ini, entra) {
    let n = 0, top = 0;
    let minS = Infinity, maxS = -Infinity, minD = Infinity, maxD = -Infinity;
    let pMinS, pMaxS, pMinD, pMaxD;
    pila[top++] = ini; visto[ini] = 1;
    while (top) {
      const k = pila[--top];
      const x = k % w, y = (k - x) / w;
      n++;
      const s = x + y, d = x - y;
      if (s < minS) { minS = s; pMinS = [x, y]; }
      if (s > maxS) { maxS = s; pMaxS = [x, y]; }
      if (d < minD) { minD = d; pMinD = [x, y]; }
      if (d > maxD) { maxD = d; pMaxD = [x, y]; }
      if (x > 0     && !visto[k - 1] && entra(k - 1)) { visto[k - 1] = 1; pila[top++] = k - 1; }
      if (x < w - 1 && !visto[k + 1] && entra(k + 1)) { visto[k + 1] = 1; pila[top++] = k + 1; }
      if (y > 0     && !visto[k - w] && entra(k - w)) { visto[k - w] = 1; pila[top++] = k - w; }
      if (y < h - 1 && !visto[k + w] && entra(k + w)) { visto[k + w] = 1; pila[top++] = k + w; }
    }
    return { n: n, q: [pMinS, pMaxD, pMaxS, pMinD] };
  }

  // Pasada 1: región clara más grande.
  function claro(n) { return gris[n] > t; }
  let semilla = -1, mayor = 0;
  for (let ini = 0; ini < total; ini++) {
    if (visto[ini] || gris[ini] <= t) continue;
    const r = rellenar(ini, claro);
    if (r.n > mayor) { mayor = r.n; semilla = ini; }
  }
  if (semilla < 0) return null;

  // Pasada 2: esa región, extendida por la sombra.
  const borde = new Uint8Array(total);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (Math.abs(gris[k + 1] - gris[k - 1]) > EO_BORDE ||
          Math.abs(gris[k + w] - gris[k - w]) > EO_BORDE) borde[k] = 1;
    }
  }
  // Se engruesa 1 píxel: el contorno de la hoja trae huecos sueltos (ruido,
  // esquina doblada) y por uno solo el relleno se escapaba a toda la mesa.
  const grueso = new Uint8Array(total);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (borde[k] || borde[k - 1] || borde[k + 1] || borde[k - w] || borde[k + w] ||
          borde[k - w - 1] || borde[k - w + 1] || borde[k + w - 1] || borde[k + w + 1]) grueso[k] = 1;
    }
  }
  visto.fill(0);
  const mejor = rellenar(semilla, function (n) {
    const g = gris[n];
    return g > t || (g > piso && !grueso[n]);
  });
  if (!mejor || mejor.n < total * 0.15) return null;

  // Las esquinas son el píxel extremo; +0.5 lleva al centro del píxel y +/-
  // medio píxel hacia afuera no importa a esta escala.
  const q = _eoOrdenarEsquinas(mejor.q.map(function (p) {
    return [(p[0] + 0.5) / w, (p[1] + 0.5) / h];
  }));
  const area = _eoAreaCuad(q);
  // Hoja diminuta o cuadrilátero degenerado: mejor la foto entera.
  if (area < 0.15) return null;
  // La hoja ocupa casi toda la foto: ya viene encuadrada, no recortar.
  if (area > 0.97) return null;
  return q;
}

// Homografía que lleva los 4 puntos `de` a los 4 puntos `a` (8 incógnitas,
// eliminación gaussiana con pivoteo). Devuelve 9 coeficientes, h8 = 1.
function _eoHomografia(de, a) {
  const M = [];
  for (let i = 0; i < 4; i++) {
    const x = de[i][0], y = de[i][1], u = a[i][0], v = a[i][1];
    M.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    M.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let f = c + 1; f < 8; f++) if (Math.abs(M[f][c]) > Math.abs(M[piv][c])) piv = f;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    const tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
    for (let f = 0; f < 8; f++) {
      if (f === c) continue;
      const k = M[f][c] / M[c][c];
      if (!k) continue;
      for (let j = c; j < 9; j++) M[f][j] -= k * M[c][j];
    }
  }
  const H = [];
  for (let i = 0; i < 8; i++) H.push(M[i][8] / M[i][i]);
  H.push(1);
  return H;
}

function _eoAplicarH(H, x, y) {
  const d = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
}

// Proporción alto/ancho de la hoja enderezada. La perspectiva acorta un lado
// y la medida directa baila ±15 %, así que si cae cerca de oficio se fija en
// oficio exacto (la orden SIEMPRE es oficio). Fuera de ese rango se respeta
// lo medido: el inspector recortó a propósito otra cosa (media hoja, un
// anexo apaisado) y forzar oficio la deformaría.
function _eoProporcionSalida(q) {
  function dist(p, s) { return Math.hypot(p[0] - s[0], p[1] - s[1]); }
  const ancho = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const alto  = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  if (!ancho) return EO_PROPORCION_OFICIO;
  const r = alto / ancho;
  return (r >= 1.3 && r <= 1.8) ? EO_PROPORCION_OFICIO : r;
}

// Gira las esquinas normalizadas junto con la página (90° horario).
function _eoRotarCuad(q, grados) {
  let r = q;
  for (let g = 0; g < ((grados / 90) % 4 + 4) % 4; g++) {
    r = r.map(function (p) { return [1 - p[1], p[0]]; });
  }
  return _eoOrdenarEsquinas(r);
}

// Endereza: para cada píxel de la salida (ancho x alto) busca su punto en
// la fuente con la homografía y lo interpola (bilineal). Trabaja en grises.
function _eoEnderezar(gris, sw, sh, qPx, ancho, alto) {
  const H = _eoHomografia([[0, 0], [ancho, 0], [ancho, alto], [0, alto]], qPx);
  const out = new Uint8ClampedArray(ancho * alto);
  if (!H) return out.fill(255);
  for (let y = 0; y < alto; y++) {
    const yc = y + 0.5;
    for (let x = 0; x < ancho; x++) {
      const xc = x + 0.5;
      const d = H[6] * xc + H[7] * yc + H[8];
      const u = (H[0] * xc + H[1] * yc + H[2]) / d - 0.5;
      const v = (H[3] * xc + H[4] * yc + H[5]) / d - 0.5;
      if (u < 0 || v < 0 || u > sw - 1 || v > sh - 1) { out[y * ancho + x] = 255; continue; }
      const x0 = u | 0, y0 = v | 0;
      const x1 = x0 < sw - 1 ? x0 + 1 : x0, y1 = y0 < sh - 1 ? y0 + 1 : y0;
      const fx = u - x0, fy = v - y0;
      const a = gris[y0 * sw + x0], b = gris[y0 * sw + x1];
      const c = gris[y1 * sw + x0], e = gris[y1 * sw + x1];
      out[y * ancho + x] = (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
    }
  }
  return out;
}

// Normaliza la iluminación y deja el papel blanco y la tinta negra.
//
// La curva vieja usaba umbrales fijos para toda la hoja: donde había sombra
// el papel quedaba por debajo del punto blanco y salía gris manchado, y el
// texto del reverso que se transparenta sobrevivía. Aquí se estima primero
// el "fondo" (cuánta luz recibe el papel en cada zona) y cada píxel se divide
// por él, como hacen los escáneres de los teléfonos:
//   1. Rejilla de celdas de ~1/160 del lado largo; cada celda guarda su
//      píxel MÁS claro — entre letra y letra siempre asoma papel.
//   2. Máximo sobre las celdas vecinas (tapa firmas y trazos gruesos) y dos
//      pasadas de promedio (el fondo varía suave, no a saltos).
//   3. Piso del fondo en 45 % del nivel del papel: un bloque negro grande
//      (logo, sello) no se toma como "papel en sombra" y no se blanquea.
//   4. Curva sobre la proporción píxel/fondo: <= 0.45 negro, >= 0.82 blanco
//      (ahí cae la transparencia del reverso), lineal en medio para no
//      comerse lápiz ni sello.
const EO_NEGRO = 0.45;
const EO_BLANCO = 0.82;
function _eoBlanquear(gris, w, h) {
  const C = Math.max(4, Math.round(Math.max(w, h) / 160));
  const cols = Math.ceil(w / C), filas = Math.ceil(h / C);
  let celdas = new Float32Array(cols * filas);
  for (let y = 0; y < h; y++) {
    const fy = ((y / C) | 0) * cols;
    for (let x = 0; x < w; x++) {
      const k = fy + ((x / C) | 0);
      const g = gris[y * w + x];
      if (g > celdas[k]) celdas[k] = g;
    }
  }

  // Filtros separables sobre la rejilla (máximo radio 2, promedio radio 2).
  function pasada(src, radio, esMax, horizontal) {
    const dst = new Float32Array(src.length);
    const largo = horizontal ? cols : filas, otro = horizontal ? filas : cols;
    for (let o = 0; o < otro; o++) {
      for (let i = 0; i < largo; i++) {
        let acc = 0, n = 0;
        for (let j = Math.max(0, i - radio); j <= Math.min(largo - 1, i + radio); j++) {
          const v = horizontal ? src[o * cols + j] : src[j * cols + o];
          if (esMax) { if (v > acc) acc = v; } else { acc += v; n++; }
        }
        dst[horizontal ? o * cols + i : i * cols + o] = esMax ? acc : acc / n;
      }
    }
    return dst;
  }
  celdas = pasada(pasada(celdas, 2, true, true), 2, true, false);
  for (let r = 0; r < 2; r++) celdas = pasada(pasada(celdas, 2, false, true), 2, false, false);

  // Nivel del papel = percentil 90 de las celdas.
  const orden = Array.prototype.slice.call(celdas).sort(function (a, b) { return a - b; });
  const papel = orden[Math.floor(orden.length * 0.9)] || 255;
  const piso = papel * 0.45;
  for (let i = 0; i < celdas.length; i++) if (celdas[i] < piso) celdas[i] = piso;

  const out = new Uint8ClampedArray(w * h);
  const rango = EO_BLANCO - EO_NEGRO;
  for (let y = 0; y < h; y++) {
    // Interpolación bilineal del fondo entre centros de celda.
    let gy = (y + 0.5) / C - 0.5; if (gy < 0) gy = 0; if (gy > filas - 1) gy = filas - 1;
    const y0 = gy | 0, y1 = y0 < filas - 1 ? y0 + 1 : y0, fy = gy - y0;
    for (let x = 0; x < w; x++) {
      let gx = (x + 0.5) / C - 0.5; if (gx < 0) gx = 0; if (gx > cols - 1) gx = cols - 1;
      const x0 = gx | 0, x1 = x0 < cols - 1 ? x0 + 1 : x0, fx = gx - x0;
      const a = celdas[y0 * cols + x0], b = celdas[y0 * cols + x1];
      const c = celdas[y1 * cols + x0], d = celdas[y1 * cols + x1];
      const fondo = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
      const r = gris[y * w + x] / fondo;
      out[y * w + x] = r <= EO_NEGRO ? 0 : r >= EO_BLANCO ? 255 : ((r - EO_NEGRO) / rango) * 255;
    }
  }
  return out;
}

// ─── Canvas (navegador) ────────────────────────────────────────

// Lee un File a HTMLImageElement (el navegador aplica la orientación EXIF).
function _eoLeerImagen(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

// Android suele mandar el PDF con type vacío o `application/octet-stream`
// según la app de escaneo, así que el nombre también cuenta.
function _eoEsPdf(f) {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
}

// Archivo → base64 pelado (sin el prefijo data:). Para el PDF que ya trae
// escaneado el inspector: no se reprocesa nada, se sube tal cual llegó.
function _eoBase64(file) {
  return new Promise(function (resolve, reject) {
    const fr = new FileReader();
    fr.onload = function () {
      const s = String(fr.result);
      resolve(s.slice(s.indexOf('base64,') + 7));
    };
    fr.onerror = function () { reject(new Error('no se pudo leer ' + file.name)); };
    fr.readAsDataURL(file);
  });
}

// Dibuja la foto girada `rot` grados con el lado largo en `maxLado` como
// mucho (nunca escala hacia arriba). Fondo blanco: si algo no cubre el
// lienzo, que parezca papel y no transparencia negra al pasar a JPEG.
function _eoLienzo(img, rot, maxLado) {
  const girado = (rot === 90 || rot === 270);
  const ow = girado ? img.height : img.width;
  const oh = girado ? img.width  : img.height;
  const k = Math.min(1, maxLado / Math.max(ow, oh));
  const w = Math.max(1, Math.round(ow * k)), h = Math.max(1, Math.round(oh * k));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rot * Math.PI / 180);
  if (girado) ctx.drawImage(img, -h / 2, -w / 2, h, w);
  else        ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  return cv;
}

function _eoGrisDe(cv) {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const g = new Uint8ClampedArray(cv.width * cv.height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) {
    g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  return g;
}

// Vista previa para el editor + esquinas detectadas (normalizadas) o null.
function _eoPreparar(img, rot) {
  const vista = _eoLienzo(img, rot, EO_LADO_VISTA);
  const k = Math.min(1, EO_LADO_DETECCION / Math.max(vista.width, vista.height));
  const peq = document.createElement('canvas');
  peq.width = Math.max(1, Math.round(vista.width * k));
  peq.height = Math.max(1, Math.round(vista.height * k));
  peq.getContext('2d').drawImage(vista, 0, 0, peq.width, peq.height);
  return {
    vista: { url: vista.toDataURL('image/jpeg', 0.8), w: vista.width, h: vista.height },
    cuad: _eoDetectarHoja(_eoGrisDe(peq), peq.width, peq.height),
  };
}

// Página final: recorta y endereza a `cuad` (si hay), normaliza la luz y
// devuelve el JPEG que va al PDF.
function _eoProcesar(img, rot, cuad) {
  let gris, ancho, alto;
  if (cuad) {
    const src = _eoLienzo(img, rot, EO_LADO_TRABAJO);
    const qPx = cuad.map(function (p) { return [p[0] * src.width, p[1] * src.height]; });
    ancho = EO_ANCHO_PX;
    alto = Math.round(ancho * _eoProporcionSalida(qPx));
    gris = _eoEnderezar(_eoGrisDe(src), src.width, src.height, qPx, ancho, alto);
  } else {
    const cv = _eoLienzo(img, rot, Infinity);
    const k = Math.min(1, EO_ANCHO_PX / cv.width);
    const peq = document.createElement('canvas');
    peq.width = Math.round(cv.width * k); peq.height = Math.round(cv.height * k);
    peq.getContext('2d').drawImage(cv, 0, 0, peq.width, peq.height);
    ancho = peq.width; alto = peq.height;
    gris = _eoGrisDe(peq);
  }

  const v = _eoBlanquear(gris, ancho, alto);
  const cv = document.createElement('canvas');
  cv.width = ancho; cv.height = alto;
  const ctx = cv.getContext('2d');
  const d = ctx.createImageData(ancho, alto);
  for (let i = 0, j = 0; j < v.length; i += 4, j++) {
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v[j];
    d.data[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return { dataUrl: cv.toDataURL('image/jpeg', 0.75), w: ancho, h: alto };
}

// Deja respirar al hilo principal entre páginas: el procesado de una hoja
// son ~0,3-0,6 s de cálculo y sin esto el texto «Procesando…» ni se pinta.
function _eoRespirar() {
  return new Promise(function (r) { setTimeout(r, 30); });
}

// Icono de recorte (no está en Icon.*; va aquí para no tocar icons.jsx).
function _EoIconoRecorte({ size }) {
  return (
    <svg width={size || 16} height={size || 16} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  );
}

// ─── Editor de recorte ─────────────────────────────────────────
// Pantalla completa, foto encajada y 4 esquinas arrastrables sobre ella.
// Al arrastrar, una lupa en la esquina opuesta muestra el punto ampliado:
// el dedo tapa justo la esquina que se está ajustando.
const EO_LUPA = 120, EO_ZOOM = 2.5;

function EditorRecorteEO({ pagina, titulo, onListo, onCancelar }) {
  const [cuad, setCuad]       = useStateEO(pagina.cuad || [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const [caja, setCaja]       = useStateEO({ w: 0, h: 0 });
  const [arrastre, setArrastre] = useStateEO(-1);
  const zonaRef = useRefEO(null);

  useEffectEO(function () {
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return function () { document.body.style.overflow = previo; };
  }, []);

  // Mide el área disponible y encaja la foto (contain) dentro de ella.
  useEffectEO(function () {
    const el = zonaRef.current;
    if (!el) return;
    function medir() {
      const W = el.clientWidth - 32, H = el.clientHeight - 32;
      if (W <= 0 || H <= 0) return;
      const k = Math.min(W / pagina.vista.w, H / pagina.vista.h);
      setCaja({ w: Math.round(pagina.vista.w * k), h: Math.round(pagina.vista.h * k) });
    }
    medir();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir);
      return function () { window.removeEventListener('resize', medir); };
    }
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return function () { ro.disconnect(); };
  }, [pagina.vista.w, pagina.vista.h]);

  function mover(e) {
    if (arrastre < 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setCuad(function (prev) {
      return prev.map(function (p, i) { return i === arrastre ? [x, y] : p; });
    });
  }
  function soltar() { setArrastre(-1); }

  const pts = cuad.map(function (p) { return [p[0] * caja.w, p[1] * caja.h]; });
  const poli = pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
  const activo = arrastre >= 0 ? pts[arrastre] : null;
  // La lupa se va al lado contrario del dedo.
  const lupaIzq = activo && activo[0] > caja.w / 2;

  const cuerpo = (
    <div role="dialog" aria-modal="true" aria-label="Recortar página" style={{
      position: 'fixed', inset: 0, zIndex: 9000, background: '#111',
      display: 'flex', flexDirection: 'column', color: '#fff',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        <button type="button" onClick={onCancelar} className="btn-icono"
          aria-label="Cerrar sin cambiar el recorte" title="Cerrar"
          style={{ color: '#fff' }}>
          <Icon.Close size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{titulo}</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Arrastre las esquinas a los bordes de la hoja</div>
        </div>
      </div>

      <div ref={zonaRef} style={{
        flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        {caja.w > 0 && (
          <div style={{ position: 'relative', width: caja.w, height: caja.h, touchAction: 'none' }}
            onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
            <img src={pagina.vista.url} alt="" draggable={false}
              style={{ width: caja.w, height: caja.h, display: 'block', userSelect: 'none' }} />
            <svg width={caja.w} height={caja.h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
              {/* Oscurece lo que queda fuera del recorte (evenodd). */}
              <path fillRule="evenodd" fill="rgba(0,0,0,0.5)"
                d={'M0,0H' + caja.w + 'V' + caja.h + 'H0Z M' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' L') + 'Z'} />
              <polygon points={poli} fill="none" stroke="#60a5fa" strokeWidth="2" />
              {pts.map(function (p, i) {
                return (
                  <g key={i} style={{ cursor: 'grab' }}
                    onPointerDown={function (e) {
                      e.preventDefault();
                      try { e.currentTarget.ownerSVGElement.parentNode.setPointerCapture(e.pointerId); } catch (err) {}
                      setArrastre(i);
                    }}>
                    {/* Blanco táctil de 44 px; lo visible es el círculo de 11. */}
                    <circle cx={p[0]} cy={p[1]} r="22" fill="transparent" />
                    <circle cx={p[0]} cy={p[1]} r="11" fill="rgba(96,165,250,0.35)"
                      stroke="#fff" strokeWidth="2" />
                  </g>
                );
              })}
            </svg>
            {activo && (
              <div aria-hidden="true" style={{
                position: 'absolute', top: 8, left: lupaIzq ? 8 : undefined, right: lupaIzq ? undefined : 8,
                width: EO_LUPA, height: EO_LUPA, borderRadius: '50%', border: '2px solid #fff',
                boxShadow: '0 2px 10px rgba(0,0,0,0.6)', pointerEvents: 'none',
                backgroundImage: 'url(' + pagina.vista.url + ')', backgroundRepeat: 'no-repeat',
                backgroundSize: (caja.w * EO_ZOOM) + 'px ' + (caja.h * EO_ZOOM) + 'px',
                backgroundPosition: (EO_LUPA / 2 - activo[0] * EO_ZOOM) + 'px ' + (EO_LUPA / 2 - activo[1] * EO_ZOOM) + 'px',
                backgroundColor: '#000',
              }}>
                <div style={{ position: 'absolute', left: EO_LUPA / 2 - 1, top: EO_LUPA / 2 - 10, width: 2, height: 20, background: '#60a5fa' }} />
                <div style={{ position: 'absolute', top: EO_LUPA / 2 - 1, left: EO_LUPA / 2 - 10, height: 2, width: 20, background: '#60a5fa' }} />
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, padding: '10px 12px 14px' }}>
        <button type="button" className="btn-accion" style={{ flex: 1, minHeight: 44 }}
          onClick={function () { setCuad([[0, 0], [1, 0], [1, 1], [0, 1]]); }}>
          Foto completa
        </button>
        <button type="button" className="btn-principal" style={{ flex: 1, minHeight: 44, marginTop: 0 }}
          onClick={function () {
            const q = _eoOrdenarEsquinas(cuad);
            // Recorte = foto entera: no hay nada que enderezar.
            const entera = _eoAreaCuad(q) > 0.995;
            onListo(entera ? null : q);
          }}>
          Listo
        </button>
      </div>
    </div>
  );
  return (typeof ReactDOM !== 'undefined' && ReactDOM.createPortal)
    ? ReactDOM.createPortal(cuerpo, document.body)
    : cuerpo;
}

// ─── Componente ────────────────────────────────────────────────

function EscanerOrdenPolicia({ idCarpetaVisita, fila, radicadoFila, orden, linkInicial, onSubido }) {
  // paginas: [{ id, file, rot, cuad, vista, dataUrl, w, h }] — se guarda el
  // File original para que rotar o recortar reprocese desde la fuente en vez
  // de degradar el JPEG. `cuad` = esquinas de la hoja normalizadas a [0,1]
  // en la foto ya girada (null = foto completa); `vista` = previa del editor.
  const [paginas, setPaginas]     = useStateEO([]);
  const [ocupado, setOcupado]     = useStateEO('');   // texto de estado o ''
  const [link, setLink]           = useStateEO(linkInicial || '');
  const [pendiente, setPendiente] = useStateEO(false);
  // Páginas por revisar en el editor, en orden. Al capturar se abre el
  // editor con cada toma nueva, como el escáner del iPhone.
  const [porRecortar, setPorRecortar] = useStateEO([]);
  const inputRef = useRefEO(null);
  // id del ítem de la cola offline con la orden de esta visita (si lo hay).
  const idColaRef = useRefEO(null);
  const onSubidoRef = useRefEO(onSubido);
  onSubidoRef.current = onSubido;

  // El link puede llegar después: al reabrir una visita el efecto que carga
  // la fila desde BD corre luego del primer render.
  useEffectEO(function () {
    if (linkInicial && linkInicial !== link) { setLink(linkInicial); setPendiente(false); }
  }, [linkInicial]);

  // Orden en cola: al reabrir la visita (o recargar la app) el estado
  // `pendiente` se había perdido y el renglón volvía a ofrecer «Escanear»
  // aunque el PDF estuviera por subirse. Se recupera mirando la cola.
  useEffectEO(function () {
    if (!fila || typeof offlineListar !== 'function') return;
    let vivo = true;
    offlineListar().then(function (lista) {
      if (!vivo) return;
      const item = (lista || []).filter(function (it) {
        return it.tipo === 'subirOrdenPolicia' && it.body && String(it.body.fila) === String(fila);
      }).pop();
      if (item) { idColaRef.current = item.id; setPendiente(true); }
    }).catch(function () {});
    return function () { vivo = false; };
  }, [fila]);

  // Cuando la cola sube la orden, el renglón se entera aquí: antes nadie le
  // avisaba y seguía mostrando «Escanear» + «En cola» con el PDF ya en Drive.
  useEffectEO(function () {
    if (typeof offlineOnItemSynced !== 'function') return;
    return offlineOnItemSynced(function (evt) {
      if (evt.tipo !== 'subirOrdenPolicia' || evt.id !== idColaRef.current) return;
      idColaRef.current = null;
      setPendiente(false);
      const nuevo = (evt.resultado && evt.resultado.link) || '';
      if (nuevo) {
        setLink(nuevo);
        if (typeof onSubidoRef.current === 'function') onSubidoRef.current(nuevo);
      }
    });
  }, []);

  async function alSeleccionar(e) {
    const archivos = Array.from(e.target.files || []);
    if (inputRef.current) inputRef.current.value = '';   // permite reelegir la misma foto
    if (!archivos.length) return;

    // Un PDF ya escaneado (app de escaneo del teléfono) se sube tal cual.
    const pdf = archivos.find(_eoEsPdf);
    if (pdf) {
      if (archivos.length > 1) {
        appAlert('Se seleccionó un PDF: se sube ese archivo y se ignora el resto. ' +
                 'Para armar el PDF desde fotos, seleccione solo imágenes.',
          { tono: 'aviso', titulo: 'Se usa el PDF' });
      }
      setOcupado('Leyendo PDF...');
      try {
        await subirBase64(await _eoBase64(pdf));
      } catch (err) {
        setOcupado('');
        appAlert('No se pudo leer el PDF: ' + (err.message || err),
          { tono: 'error', titulo: 'PDF ilegible' });
      }
      return;
    }

    const validos = archivos.filter(function (f) { return f.size <= 12 * 1024 * 1024; });
    if (validos.length < archivos.length) {
      appAlert((archivos.length - validos.length) + ' imagen(es) superan 12MB y se descartaron.',
        { tono: 'aviso', titulo: 'Imagen muy grande' });
    }
    if (!validos.length) return;

    setOcupado('Procesando páginas...');
    const nuevas = [];
    for (const f of validos) {
      try {
        await _eoRespirar();
        const img  = await _eoLeerImagen(f);
        const prep = _eoPreparar(img, 0);
        const p    = _eoProcesar(img, 0, prep.cuad);
        nuevas.push({ id: 'p' + Date.now() + '_' + nuevas.length, file: f, rot: 0,
                      cuad: prep.cuad, vista: prep.vista,
                      dataUrl: p.dataUrl, w: p.w, h: p.h });
      } catch (err) {
        console.warn('[escaner-orden] no se pudo procesar', f.name, err);
      }
    }
    setPaginas(function (prev) { return prev.concat(nuevas); });
    setPorRecortar(function (prev) { return prev.concat(nuevas.map(function (n) { return n.id; })); });
    setOcupado('');
    if (!nuevas.length) {
      appAlert('No se pudo procesar ninguna de las imágenes seleccionadas.',
        { tono: 'error', titulo: 'Escaneo fallido' });
    }
  }

  // Reprocesa una página desde el File original con giro y recorte nuevos.
  async function reprocesar(id, cambios, texto) {
    const p = paginas.find(function (x) { return x.id === id; });
    if (!p) return;
    setOcupado(texto);
    try {
      await _eoRespirar();
      const img = await _eoLeerImagen(p.file);
      const nueva = Object.assign({}, p, cambios);
      if (cambios.rot !== undefined && cambios.rot !== p.rot) {
        nueva.vista = _eoPreparar(img, nueva.rot).vista;
      }
      const r = _eoProcesar(img, nueva.rot, nueva.cuad);
      nueva.dataUrl = r.dataUrl; nueva.w = r.w; nueva.h = r.h;
      setPaginas(function (prev) { return prev.map(function (x) { return x.id === id ? nueva : x; }); });
    } catch (err) {
      appAlert('No se pudo procesar la página: ' + err.message, { tono: 'error' });
    }
    setOcupado('');
  }

  function rotar(idx) {
    const p = paginas[idx];
    if (!p) return;
    // El recorte gira con la hoja: no hay que volver a ajustar las esquinas.
    reprocesar(p.id, { rot: (p.rot + 90) % 360, cuad: p.cuad ? _eoRotarCuad(p.cuad, 90) : null }, 'Girando...');
  }

  function cerrarEditor(id, cuadNuevo, aplicar) {
    setPorRecortar(function (prev) { return prev.filter(function (x) { return x !== id; }); });
    if (!aplicar) return;
    const p = paginas.find(function (x) { return x.id === id; });
    if (p && JSON.stringify(p.cuad) !== JSON.stringify(cuadNuevo)) {
      reprocesar(id, { cuad: cuadNuevo }, 'Recortando...');
    }
  }

  function eliminar(idx) {
    const id = paginas[idx] && paginas[idx].id;
    setPaginas(function (prev) { return prev.filter(function (_, i) { return i !== idx; }); });
    setPorRecortar(function (prev) { return prev.filter(function (x) { return x !== id; }); });
  }

  function mover(idx, dir) {
    const dest = idx + dir;
    setPaginas(function (prev) {
      if (dest < 0 || dest >= prev.length) return prev;
      const copia = prev.slice();
      const tmp = copia[idx]; copia[idx] = copia[dest]; copia[dest] = tmp;
      return copia;
    });
  }

  // Único camino de subida: lo usan el PDF traído de la app de escaneo y el
  // PDF que armamos con jsPDF desde las fotos. Las guardas, el reemplazo, el
  // tope de tamaño y el encolado sin señal viven aquí una sola vez.
  async function subirBase64(base64) {
    if (!idCarpetaVisita || !fila) {
      setOcupado('');
      appAlert('Guarde la visita primero: la orden se sube a la carpeta de Drive de la visita, que aún no existe.',
        { tono: 'aviso', titulo: 'Falta guardar' });
      return;
    }
    if (link || pendiente) {
      const ok = await appConfirm(link
        ? 'Ya hay una orden escaneada para esta visita. El PDF anterior se reemplaza por este. ¿Continuar?'
        : 'Ya hay una orden en cola para esta visita. Al subirse, la reemplaza este PDF. ¿Continuar?',
        { titulo: 'Reemplazar orden' });
      if (!ok) { setOcupado(''); return; }
    }
    if (base64.length > EO_MAX_BASE64) {
      setOcupado('');
      appAlert('El PDF quedó demasiado pesado (' + (base64.length / 1048576).toFixed(1) +
               ' MB). Elimine páginas repetidas, baje la calidad en la app de escaneo ' +
               'o vuelva a tomar las fotos más de cerca.',
        { tono: 'error', titulo: 'PDF muy pesado' });
      return;
    }

    try {
      const nombre = 'ORDEN_POLICIA_' + String(orden || 'SN').replace(/[\/\\:*?"<>|]/g, '-') + '.pdf';
      setOcupado('Subiendo a Drive...');
      const r = await subirOrdenPolicia(idCarpetaVisita, fila, base64, nombre, orden || '', radicadoFila);

      setOcupado('');
      if (r.encolado) {
        idColaRef.current = r.localId;
        setPendiente(true);
        setPaginas([]);
        appAlert('Sin conexión: la orden quedó en cola y se subirá a Drive automáticamente al recuperar señal.',
          { tono: 'aviso', titulo: 'Orden en cola' });
        return;
      }
      setPendiente(false);
      setLink(r.link || '');
      setPaginas([]);
      if (typeof onSubido === 'function') onSubido(r.link || '');
      // La copia local de la BD no tiene el link nuevo: sin esto Inicio y
      // Buscar seguían mostrando la visita sin orden hasta otro refresco.
      if (typeof invalidarCache === 'function') { try { invalidarCache('visitas'); } catch (eC) {} }

      // Si la solicitud de vigilancia ya existe, el PDF único que se envía a
      // la policía queda desactualizado en cuanto cambia la orden: se rearma.
      // Best-effort y sin bloquear — devuelve '' si no hay solicitud todavía,
      // y entonces lo armará Admin → Vigilancia al generarla.
      armarSolicitudUnificada(fila, idCarpetaVisita, radicadoFila);
      // AP8: el PDF puede haber quedado en Drive sin registrarse en BD o sin
      // permiso de lectura — eso se dice, no se oculta tras un "listo".
      if (r.avisoBD || r.aviso) {
        appAlert('La orden se subió a Drive, pero: ' + (r.avisoBD || r.aviso),
          { tono: 'aviso', titulo: 'Subida con avisos' });
      }
    } catch (err) {
      setOcupado('');
      appAlert('No se pudo subir la orden: ' + (err.message || err),
        { tono: 'error', titulo: 'Error al subir' });
    }
  }

  async function generarYSubir() {
    if (!paginas.length) return;

    try {
      setOcupado('Armando PDF...');
      const JsPDF = await cargarJsPDF();
      const doc = new JsPDF({ unit: 'mm', format: EO_PAGINA_MM, orientation: 'portrait', compress: true });
      const [ANCHO, ALTO] = EO_PAGINA_MM;

      paginas.forEach(function (p, i) {
        if (i > 0) doc.addPage(EO_PAGINA_MM, 'portrait');
        // Encajar sin deformar. Una hoja recortada ya sale en proporción
        // oficio y llena la página; una foto sin recortar queda centrada.
        const escala = Math.min(ANCHO / p.w, ALTO / p.h);
        const w = p.w * escala, h = p.h * escala;
        doc.addImage(p.dataUrl, 'JPEG', (ANCHO - w) / 2, (ALTO - h) / 2, w, h, undefined, 'FAST');
      });

      const uri = doc.output('datauristring');
      await subirBase64(uri.slice(uri.indexOf('base64,') + 7));
    } catch (err) {
      setOcupado('');
      appAlert('No se pudo armar el PDF: ' + (err.message || err),
        { tono: 'error', titulo: 'Error al subir' });
    }
  }

  const bloqueado = !!ocupado;
  // Sesión de escaneo abierta: hay páginas capturadas pendientes de revisar
  // y subir. Solo entonces el slot muestra algo — el escáner no es un
  // bloque permanente colgando del renglón.
  const sesionAbierta = paginas.length > 0;
  // Con la orden subida o en cola, capturar otra es reemplazarla (↻).
  const hayOrden = !!link || pendiente;

  const idEditor = porRecortar[0];
  const paginaEditor = idEditor ? paginas.find(function (x) { return x.id === idEditor; }) : null;
  const numEditor = paginaEditor ? paginas.indexOf(paginaEditor) + 1 : 0;

  // El componente renderiza su propio FilaEntregable: es quien conoce el
  // link, las páginas y el estado de la sesión, así que ser dueño del
  // renglón evita coordinar dos piezas (antes renglón y escáner eran
  // bloques hermanos y el escáner colgaba aparte).
  return (
    <FilaEntregable
      icono={<Icon.File size={18} />}
      nombre={'Orden de policía ' + orden}
      meta={idCarpetaVisita
        ? 'Papel firmado (oficio) — suba el PDF de su app de escaneo o tome fotos'
        : 'Requiere carpeta de Drive'}
      estadoTono={link ? 'ok' : (pendiente ? 'pend' : (idCarpetaVisita ? 'pend' : 'apagado'))}
      estadoTexto={pendiente ? 'En cola' : (link ? 'Escaneada' : 'Sin escanear')}
      procesando={bloqueado && !sesionAbierta}
      slot={(pendiente || sesionAbierta) && idCarpetaVisita ? (
        <div className="ent-slot-orden">
          {pendiente && (
            <div style={{
              marginBottom: 12, padding: '10px 12px', background: 'var(--amarillo-bg)',
              border: '1px dashed var(--amarillo)', borderRadius: 8, fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 8, color: 'var(--cafe)',
            }}>
              <Icon.ArrowUp size={14} />
              Orden en cola — se sube sola al recuperar conexión.
            </div>
          )}

          {sesionAbierta && (<>
            <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginBottom: 8 }}>
              Formato oficio (8.5 × 13"). Tome la hoja entera sobre una superficie oscura; con ✂ ajusta el recorte.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--texto-suave)' }}>
                {paginas.length} página(s) — revise antes de subir
              </div>
              {paginas.map(function (p, i) {
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    padding: 8, background: 'var(--gris-bg)', borderRadius: 8,
                  }}>
                    {/* contain, no cover: la miniatura está para revisar que
                        la hoja salió completa y derecha — recortarla al
                        centro escondería justo los bordes que hay que ver. */}
                    <img src={p.dataUrl} alt={'Página ' + (i + 1)} style={{
                      width: 46, height: 60, objectFit: 'contain',
                      borderRadius: 4, border: '1px solid var(--borde-med)', background: '#fff',
                    }} />
                    <div style={{ flex: '1 1 90px', fontSize: 12, fontWeight: 600 }}>
                      Página {i + 1}
                      <div style={{ fontWeight: 400, color: 'var(--texto-suave)', fontSize: 11 }}>
                        {p.cuad ? 'Recortada' : 'Foto completa'}
                      </div>
                    </div>
                    {/* Los 5 botones de 44px no caben junto a la miniatura en
                        390px: van en su propio grupo para envolver enteros a
                        la línea de abajo en vez de partirse. */}
                    <div style={{ display: 'flex', marginLeft: 'auto' }}>
                      <button type="button" onClick={function () { mover(i, -1); }}
                        disabled={i === 0 || bloqueado} title="Subir"
                        className="btn-icono" aria-label={'Subir página ' + (i + 1)}>
                        <Icon.ChevronUp size={16} />
                      </button>
                      <button type="button" onClick={function () { mover(i, 1); }}
                        disabled={i === paginas.length - 1 || bloqueado} title="Bajar"
                        className="btn-icono" aria-label={'Bajar página ' + (i + 1)}>
                        <Icon.Chevron size={16} />
                      </button>
                      <button type="button"
                        onClick={function () { setPorRecortar(function (prev) { return [p.id].concat(prev.filter(function (x) { return x !== p.id; })); }); }}
                        disabled={bloqueado} title="Recortar"
                        className="btn-icono" aria-label={'Recortar página ' + (i + 1)}>
                        <_EoIconoRecorte size={16} />
                      </button>
                      <button type="button" onClick={function () { rotar(i); }}
                        disabled={bloqueado} title="Girar 90°"
                        className="btn-icono" aria-label={'Girar página ' + (i + 1)}>
                        <Icon.Refresh size={16} />
                      </button>
                      <button type="button" onClick={function () { eliminar(i); }}
                        disabled={bloqueado} title="Eliminar"
                        className="btn-icono peligro" aria-label={'Eliminar página ' + (i + 1)}>
                        <Icon.Close size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button type="button" onClick={generarYSubir} disabled={bloqueado || porRecortar.length > 0}
              aria-busy={bloqueado}
              className="btn-principal secundario" style={{ fontSize: 15, marginTop: 14 }}>
              {bloqueado ? ocupado : 'Generar PDF y subir a Drive'}
            </button>
          </>)}

          {paginaEditor && !bloqueado && (
            <EditorRecorteEO
              key={paginaEditor.id + '_' + paginaEditor.rot}
              pagina={paginaEditor}
              titulo={'Página ' + numEditor + (porRecortar.length > 1 ? ' · faltan ' + (porRecortar.length - 1) : '')}
              onCancelar={function () { cerrarEditor(paginaEditor.id, null, false); }}
              onListo={function (q) { cerrarEditor(paginaEditor.id, q, true); }}
            />
          )}
        </div>
      ) : undefined}
    >
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="btn-accion ent-btn">Abrir</a>
      )}
      {/* Con la orden ya escaneada (o en cola), reemplazarla es la misma
          acción que regenerar un documento: mismo icono ↻ que acta, registro
          e informe, no un botón de texto aparte. Sin escanear sí es acción
          principal. */}
      {idCarpetaVisita && (hayOrden ? (
        <button type="button" className="btn-icono" disabled={bloqueado}
          aria-label="Reemplazar el escaneo de la orden de policía"
          aria-busy={bloqueado} title="Reemplazar escaneo"
          onClick={function () { if (inputRef.current) inputRef.current.click(); }}>
          {bloqueado
            ? <span className="spinner-btn" aria-hidden="true" />
            : <Icon.Refresh size={18} />}
        </button>
      ) : (
        <button type="button" className="btn-accion ent-btn" disabled={bloqueado}
          aria-busy={bloqueado}
          onClick={function () { if (inputRef.current) inputRef.current.click(); }}>
          {bloqueado && <span className="spinner-btn" aria-hidden="true" />}
          Escanear
        </button>
      ))}
      {/* Fuera del botón (input dentro de button es HTML inválido).
          Sin `capture`: aceptar PDF obliga a pasar por el selector del
          sistema, y ahí el inspector elige entre la cámara y el PDF que dejó
          su app de escaneo. Se pierde un toque hacia la cámara y se gana la
          ruta que de verdad usan en campo. */}
      {idCarpetaVisita && (
        <input ref={inputRef} type="file" accept="application/pdf,image/*" multiple
          onChange={alSeleccionar} disabled={bloqueado} style={{ display: 'none' }} />
      )}
    </FilaEntregable>
  );
}
