// ═══════════════════════════════════════════════════════════════
// tests/utils.test.js — Cobertura para utils.js (fechas, festivos CO, Pascua)
// Auditoría 2026-07, hallazgo QA#3: "cero cobertura sobre festivos
// colombianos y cálculo de Pascua". Fase 0.7 del plan de implementación.
//
// Ejecutar: node --test tests/
// (usa el test runner nativo de Node, sin dependencias nuevas)
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatearFecha, parsearFecha, esDiaHabil, diasHabilesHasta, diasDesde,
  _festivosColombia, _calcularPascua, _alLunes, formatearFechaHora, titleCaseNombre,
  linkPdfRadicado, numerarVisitasRadicado,
} = require('../utils.js');

test('_calcularPascua — fechas de Pascua conocidas y verificables', () => {
  // Domingos de Pascua (calendario gregoriano occidental), fechas públicas conocidas.
  const p2024 = _calcularPascua(2024);
  assert.equal(p2024.getMonth(), 2, '2024: Pascua debe ser en marzo (mes índice 2)');
  assert.equal(p2024.getDate(), 31, '2024: Pascua debe ser 31 de marzo');

  const p2025 = _calcularPascua(2025);
  assert.equal(p2025.getMonth(), 3, '2025: Pascua debe ser en abril (mes índice 3)');
  assert.equal(p2025.getDate(), 20, '2025: Pascua debe ser 20 de abril');
});

test('_calcularPascua — siempre cae en domingo', () => {
  for (const anio of [2023, 2024, 2025, 2026, 2027, 2030, 2050]) {
    assert.equal(_calcularPascua(anio).getDay(), 0, `Pascua ${anio} debe ser domingo`);
  }
});

test('_alLunes — mueve cualquier fecha al lunes siguiente (o la deja igual si ya es lunes)', () => {
  // 2026-01-01 es jueves -> debe mover al lunes 2026-01-05
  const jueves = new Date(2026, 0, 1);
  const movido = _alLunes(jueves);
  assert.equal(movido.getDay(), 1, 'resultado debe ser lunes');
  assert.ok(movido >= jueves, 'el lunes resultante no puede ser anterior a la fecha original');

  // Un lunes debe quedar igual
  const lunes = new Date(2026, 0, 5);
  assert.equal(lunes.getDay(), 1, 'fixture: 2026-01-05 debe ser lunes');
  const igual = _alLunes(lunes);
  assert.equal(igual.getTime(), lunes.getTime(), 'un lunes no debe moverse');
});

test('_festivosColombia — Jueves y Viernes Santo son Pascua-3 y Pascua-2', () => {
  const anio = 2026;
  const pascua = _calcularPascua(anio);
  const festivos = _festivosColombia(anio);
  const ts = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const tsSet = festivos.map(ts);

  const juevesSanto = new Date(pascua.getTime() - 3 * 86400000);
  const viernesSanto = new Date(pascua.getTime() - 2 * 86400000);
  assert.ok(tsSet.includes(ts(juevesSanto)), 'Jueves Santo debe estar en la lista de festivos');
  assert.ok(tsSet.includes(ts(viernesSanto)), 'Viernes Santo debe estar en la lista de festivos');
});

test('_festivosColombia — festivos fijos (1 ene, 25 dic) siempre presentes', () => {
  for (const anio of [2025, 2026, 2027]) {
    const festivos = _festivosColombia(anio);
    const tieneFijo = (mes, dia) => festivos.some((f) => f.getMonth() === mes && f.getDate() === dia);
    assert.ok(tieneFijo(0, 1), `${anio}: 1 de enero debe ser festivo`);
    assert.ok(tieneFijo(11, 25), `${anio}: 25 de diciembre debe ser festivo`);
  }
});

test('esDiaHabil — sábados y domingos nunca son día hábil', () => {
  // 2026-01-03 es sábado, 2026-01-04 es domingo
  assert.equal(esDiaHabil(new Date(2026, 0, 3)), false);
  assert.equal(esDiaHabil(new Date(2026, 0, 4)), false);
});

test('esDiaHabil — 1 de enero nunca es día hábil (festivo fijo)', () => {
  for (const anio of [2025, 2026, 2027]) {
    assert.equal(esDiaHabil(new Date(anio, 0, 1)), false, `1 ene ${anio} no debe ser día hábil`);
  }
});

test('esDiaHabil — un martes cualquiera que no sea festivo sí es día hábil', () => {
  // 2026-01-13 es martes, no está en ningún festivo fijo/Emiliani/Pascua de 2026
  assert.equal(esDiaHabil(new Date(2026, 0, 13)), true);
});

test('diasHabilesHasta — 0 cuando la fecha objetivo es hoy', () => {
  const hoy = new Date();
  assert.equal(diasHabilesHasta(hoy), 0);
});

test('diasHabilesHasta — signo positivo a futuro, negativo a pasado', () => {
  const hoy = new Date();
  const futuro = new Date(hoy.getTime() + 30 * 86400000);
  const pasado = new Date(hoy.getTime() - 30 * 86400000);
  assert.ok(diasHabilesHasta(futuro) > 0, 'una fecha futura debe dar un conteo positivo');
  assert.ok(diasHabilesHasta(pasado) < 0, 'una fecha pasada debe dar un conteo negativo');
});

test('formatearFecha / parsearFecha — round-trip DD/MM/YYYY', () => {
  assert.equal(formatearFecha('2026-01-05'), '05/01/2026');
  assert.equal(formatearFecha('05/01/2026'), '05/01/2026');
  const d = parsearFecha('05/01/2026');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 0);
  assert.equal(d.getDate(), 5);
});

test('formatearFecha — vacío/null no lanza excepción', () => {
  assert.equal(formatearFecha(null), '');
  assert.equal(formatearFecha(''), '');
  assert.equal(formatearFecha(undefined), '');
});

test('formatearFechaHora — ISO del backend a hora de Bogotá', () => {
  // ULTIMA_MODIFICACION llega en UTC; Bogotá es UTC-5 todo el año.
  assert.equal(formatearFechaHora('2026-09-09T19:05:00.000Z'), '09/09/2026 14:05');
  assert.equal(formatearFechaHora('2026-09-10T02:30:00.000Z'), '09/09/2026 21:30');
  assert.equal(formatearFechaHora(''), '');
  assert.equal(formatearFechaHora(null), '');
  // Basura no parseable: cae a formatearFecha, que devuelve el valor tal cual.
  assert.equal(formatearFechaHora('no es fecha'), 'no es fecha');
});

test('titleCaseNombre — primeros 2 tokens del nombre de USUARIOS', () => {
  assert.equal(titleCaseNombre('ALEJANDRO HERNANDEZ MUÑOZ'), 'Alejandro Hernandez');
  assert.equal(titleCaseNombre('DANIEL'), 'Daniel');
  assert.equal(titleCaseNombre(''), '');
});

test('linkPdfRadicado — link del PDF de la PQR, con variantes de encabezado', () => {
  const url = 'https://drive.google.com/file/d/ABC123/view';
  assert.equal(linkPdfRadicado({ 'LINK_PDF_RADICADO': url }), url);
  assert.equal(linkPdfRadicado({ 'LINK PDF RADICADO': url }), url, 'variante con espacios');
  assert.equal(linkPdfRadicado({ 'LINK_PDF_RADICADO': '  ' + url + ' ' }), url, 'recorta espacios');
  // Sin PDF: el caso normal en visitas de oficio y en radicados no descargados.
  assert.equal(linkPdfRadicado({ 'RADICADO': '20251143210' }), '');
  assert.equal(linkPdfRadicado({ 'LINK_PDF_RADICADO': '' }), '');
  assert.equal(linkPdfRadicado(null), '', 'fila nula no lanza');
  assert.equal(linkPdfRadicado(undefined), '');
});

// ── numerarVisitasRadicado (Buscar: numeración de visitas por radicado) ──
test('numerarVisitasRadicado — respeta los N° VISITA explícitos de BD', () => {
  const filas = [
    { 'ESTADO VISITA': 'COMPLETADO', 'N° VISITA': 2, _idx: 12 },
    { 'ESTADO VISITA': 'COMPLETADO', 'N° VISITA': 1, _idx: 5 },
  ];
  const res = numerarVisitasRadicado(filas);
  assert.deepEqual(res.map(x => x.n), [1, 2], 'ordenadas por número explícito');
  assert.ok(res.every(x => x.n != null), 'sin PENDIENTE, todas numeradas');
});

test('numerarVisitasRadicado — fila V2 sin número recibe el primer número libre', () => {
  // La fila migrada (sin N° VISITA) y la nueva (N° VISITA = 1 del backend)
  // no pueden quedar las dos con el mismo número.
  const filas = [
    { 'ESTADO VISITA': 'COMPLETADO', 'N° VISITA': '', _idx: 3 },  // migrada de V2
    { 'ESTADO VISITA': 'INICIADO', 'N° VISITA': 1, _idx: 40 },
  ];
  const nums = numerarVisitasRadicado(filas).map(x => x.n);
  assert.equal(nums.length, 2);
  assert.equal(new Set(nums).size, 2, 'números distintos, ninguno repetido');
  assert.ok(nums.includes(1), 'el explícito de BD se respeta tal cual');
});

test('numerarVisitasRadicado — una fila PENDIENTE única no es visita', () => {
  const res = numerarVisitasRadicado([{ 'ESTADO VISITA': 'PENDIENTE', _idx: 7 }]);
  assert.equal(res.length, 1);
  assert.equal(res[0].n, null, 'PENDIENTE → n = null');
  assert.equal(res.filter(x => x.n != null).length, 0, 'visitas reales = 0');
});

test('numerarVisitasRadicado — COMPLETADO + PENDIENTE: la PENDIENTE no cuenta', () => {
  const res = numerarVisitasRadicado([
    { 'ESTADO VISITA': 'COMPLETADO', 'N° VISITA': 1, _idx: 2 },
    { 'ESTADO VISITA': 'PENDIENTE', _idx: 9 },
  ]);
  assert.equal(res.find(x => x.f['ESTADO VISITA'] === 'PENDIENTE').n, null, 'la PENDIENTE da null');
  assert.equal(res.filter(x => x.n != null).length, 1, 'visitas reales = 1');
  assert.equal(res.find(x => x.n != null).n, 1);
});

test('numerarVisitasRadicado — orden estable, no depende del orden de entrada', () => {
  const mk = (e, n, idx) => ({ 'ESTADO VISITA': e, 'N° VISITA': n, _idx: idx });
  const a = [mk('COMPLETADO', 1, 5), mk('INICIADO', '', 12), mk('COMPLETADO', '', 3), mk('PENDIENTE', '', 20)];
  const b = [mk('PENDIENTE', '', 20), mk('COMPLETADO', '', 3), mk('INICIADO', '', 12), mk('COMPLETADO', 1, 5)];
  const ra = numerarVisitasRadicado(a);
  const rb = numerarVisitasRadicado(b);
  const clave = (r) => r.map(x => (x.n == null ? 'P' : x.n) + '@' + x.f._idx).join('|');
  assert.equal(clave(ra), clave(rb), 'mismo array ordenado por n (desempate _idx)');
  assert.deepEqual(ra.map(x => x.n), [1, 2, 3, null]);
});

// ── normalizarCoord (2026-09-10) ──────────────────────────────
// El locale del Sheet se comía el punto decimal de las coordenadas escritas
// como texto; cada reguardado repetía el daño (×10^6 acumulativo).
test('normalizarCoord — repara coordenadas con el decimal comido por el Sheet', () => {
  const { normalizarCoord } = require('../utils.js');
  // Caso real reportado: CR 52 64-134, lat dañada dos veces y lon una.
  assert.equal(normalizarCoord(6345587000000, 'lat').toFixed(6), '6.345587');
  assert.equal(normalizarCoord(-75559763, 'lon').toFixed(6), '-75.559763');
  assert.equal(normalizarCoord(6345587, 'lat').toFixed(6), '6.345587');
  // Una coordenada sana pasa intacta, venga como número, texto o con coma.
  assert.equal(normalizarCoord(6.345587, 'lat'), 6.345587);
  assert.equal(normalizarCoord('-75.559763', 'lon'), -75.559763);
  assert.equal(normalizarCoord('6,345587', 'lat').toFixed(6), '6.345587');
  // Vacíos y basura no inventan un punto en el mapa.
  assert.equal(normalizarCoord('', 'lat'), null);
  assert.equal(normalizarCoord(null, 'lon'), null);
  assert.equal(normalizarCoord(0, 'lat'), null);
});
