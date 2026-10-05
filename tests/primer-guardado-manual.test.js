// ═══════════════════════════════════════════════════════════════
// tests/primer-guardado-manual.test.js — el primer guardado de una visita es
// siempre manual (utils.js → visitaSinIniciar; nueva-visita.jsx).
//
// Caso reportado (2026-10-05, radicado 2026-015246): una visita diligenciada
// por completo seguía ASIGNADA. Del código: el autoguardado de 60 s guardaba
// el formulario sin cambiar el estado, apagaba «cambios sin guardar» y la
// cabecera decía «✓ Guardado», que dejaba generar acta e informe sin pulsar
// Guardar, lo único que pasa PENDIENTE/ASIGNADO a INICIADO. Ese mecanismo
// explica el caso; no se comprobó en la hoja que esa fila haya pasado por ahí.
//
// Los .jsx no se pueden ejecutar acá: lo de la pantalla se fija leyendo el
// fuente (mismo recurso que fila-movida.test.js con buscar.jsx).
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { visitaSinIniciar } = require('../utils.js');

test('visitaSinIniciar: PENDIENTE y ASIGNADO no están iniciadas', () => {
  assert.equal(visitaSinIniciar('PENDIENTE'), true);
  assert.equal(visitaSinIniciar('ASIGNADO'), true);
});

test('visitaSinIniciar: INICIADO y COMPLETADO sí lo están', () => {
  assert.equal(visitaSinIniciar('INICIADO'), false);
  assert.equal(visitaSinIniciar('COMPLETADO'), false);
});

test('visitaSinIniciar: tolera mayúsculas, tildes y espacios como el resto de estados', () => {
  assert.equal(visitaSinIniciar(' asignado '), true);
  assert.equal(visitaSinIniciar('Pendiente'), true);
  assert.equal(visitaSinIniciar(' Iniciado'), false);
});

test('visitaSinIniciar: vacío o desconocido no bloquea (la fila sin estado se trata como iniciada)', () => {
  assert.equal(visitaSinIniciar(''), false);
  assert.equal(visitaSinIniciar(null), false);
  assert.equal(visitaSinIniciar(undefined), false);
  assert.equal(visitaSinIniciar('DEVUELTA'), false);
});

// ── La pantalla: nueva-visita.jsx ────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'nueva-visita.jsx'), 'utf8');

// Texto entre dos marcas; falla con un mensaje claro si una marca se movió.
function bloque(desde, hasta) {
  const i = src.indexOf(desde);
  assert.ok(i >= 0, 'no se encontró la marca: ' + desde);
  const f = src.indexOf(hasta, i);
  assert.ok(f > i, 'no se encontró la marca final: ' + hasta);
  return src.slice(i, f);
}

test('autoguardado remoto: no arranca mientras la visita no esté iniciada', () => {
  const b = bloque('// (3) Autoguardado remoto', '// (4) beforeunload');
  const guarda = b.indexOf('if (visitaSinIniciar(estadoVisita)) return;');
  assert.ok(guarda >= 0, 'falta la guarda de estado');
  // Antes del temporizador: si va después, el POST ya quedó programado.
  assert.ok(guarda < b.indexOf('setInterval('), 'la guarda va después del setInterval');
  // El estado es dependencia del efecto: al primer Guardar (INICIADO) arranca.
  assert.match(b, /\[fase, filaEditando, estadoVisita, datosIniciales\]/);
});

test('carpeta automática de Drive: tampoco escribe la fila de una visita sin iniciar', () => {
  const b = bloque('// Auto-recuperación de carpeta Drive faltante.', '// Recuperar idCarpetaFotos al reabrir');
  const guarda = b.indexOf('if (visitaSinIniciar(estadoVisita)) return;');
  assert.ok(guarda >= 0, 'falta la guarda de estado');
  assert.ok(guarda < b.indexOf('crearCarpetaVisita('), 'la guarda va después de crear la carpeta');
});

test('entregables: sin iniciar no se ofrecen, aunque la fila ya exista en BD', () => {
  assert.match(src, /const sinIniciar = visitaSinIniciar\(estadoVisita\);/);
  assert.ok(src.includes('{!filaEditando || sinIniciar ? ('), 'el aviso de entregables no mira el estado');
});

test('la cabecera no dice «Guardado» de una visita sin iniciar', () => {
  const i = src.indexOf(": sinIniciar ? '● Sin iniciar: guarda'");
  assert.ok(i >= 0, 'falta el texto de «sin iniciar»');
  assert.ok(i < src.indexOf("'✓ Guardado · '"), 'el texto de «Guardado» se evalúa antes');
});

test('solo guardar() promueve a INICIADO: ningún otro envío manda el estado a mano', () => {
  const promueven = src.match(/_construirPayload\([^)]*'INICIADO'/g) || [];
  assert.equal(promueven.length, 1, 'hay ' + promueven.length + ' envíos que fijan INICIADO');
  const i = src.indexOf("_construirPayload(dFinal, 'INICIADO'");
  assert.ok(i > src.indexOf('async function guardar()'), 'el único INICIADO no está en guardar()');
});
