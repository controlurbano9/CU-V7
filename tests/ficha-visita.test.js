// ═══════════════════════════════════════════════════════════════
// tests/ficha-visita.test.js — ficha de la visita (utils.js).
//
// Contrato del que dependerá FichaVisita: el componente solo pinta. Lo que
// más se puede romper sin que se note: que se repita lo de la cabecera,
// que un campo vacío salga como fila de «—», que la licencia sin aporte
// arrastre detalle que no aplica, o que se oculte al inspector un dato que hoy ve.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seccionesFicha } = require('../utils.js');

// Visita INICIADO con todas las secciones llenas.
const FILA_COMPLETA = {
  'RADICADO': '20261000001',
  'ATENCION PQR': 'COMPLETADA',
  'FECHA RADICADO': '23/01/2026',
  'ESTADO VISITA': 'INICIADO',
  'FECHA DE VISITA': '11/09/2026',
  'DENUNCIANTE/REMITENTE': 'Inspección de Control Urbano',
  'N° VISITA': '1',
  'N° ORDEN DE POLICIA': '2026-09-015',
  'DIRECCION INFRACCION': 'CL 50 # 32-10',
  'BARRIO/VEREDA': 'Cabecera',
  'COMUNA': '1',
  'LATITUD': 6.345587,
  'LONGITUD': -75.554321,
  'CODIGO CATASTRAL': '05088 001 01 GG 0001 01 001 00',
  'N° FICHA PREDIAL': '1234567',
  'NOMBRE PERSONA ATIENDE': 'María Pérez',
  'ID PERSONA ATIENDE': 'CC 1.020.334',
  'TELEFONO PERSONA ATIENDE': '310 123 4567',
  'RELACION CON EL EVENTO': 'Propietaria',
  'DIR NOTIFICACION': 'CL 50 # 32-10',
  'CORREO ELECTRONICO': 'maria@ejemplo.co',
  'ESTADO OBRA': 'EN CONSTRUCCION',
  'REPARACION LOCATIVA': 'NO',
  'HABITADO': 'SI',
  'ALTURA EN PISOS': '2',
  'N° DESTINACIONES ACTUALES': '1',
  'USOS ACTUALES': 'Vivienda',
  'TIPO CUBIERTA ACTUAL': 'Teja',
  'SE APORTO LICENCIA': 'SI',
  'N° LICENCIA': '2026-00012345',
  'FECHA LICENCIA': '05/03/2024',
  'TIPO Y MODALIDAD LICENCIA': 'Obra nueva',
  'PISOS APROBADOS': '2',
  'DESTINACIONES LICENCIA': 'Vivienda',
  'CUBIERTA LICENCIA': '120 m²',
  'SISTEMA ESTRUCTURAL': 'Mampostería',
  'OBS LICENCIA': 'Sin observaciones',
  'ACTUACION / OBSERVACIONES': 'Se constató obra sin licencia.\n══CONCLUSIONES══\nConclusión: abstenerse de obras.',
  'TIPO DE INFRACCION': 'A1',
  'AREA CONTRAVENCION m2': '45',
  'SUSPENSION DE LA OBRA': 'SI',
  'CUMPLE RETIRO QUEBRADA': 'NO',
  'FECHA CITACION': '15/09/2026',
  'VISITADOR(ES)': 'DANIEL PEDRAZA',
  'FECHA ASIGNACION VISITA': '08/09/2026',
  'FECHA DEVOLUCION': '',
  'POLIGONO USO SUELO': 'Residencial',
  'AMENAZA': 'NO',
  'SUELO DE PROTECCION': 'NO',
};

const etiquetas = (s) => s.campos.map(c => c.l);

// ── Visita completa ────────────────────────────────────────────

test('seccionesFicha — visita completa: las 10 secciones con sus números', () => {
  const ss = seccionesFicha(FILA_COMPLETA, 'ADMIN');
  assert.deepEqual(ss.map(s => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(ss.map(s => s.clave), [
    'identificacion', 'ubicacion', 'persona', 'edificacion', 'licencia',
    'descripcion', 'conclusiones', 'funcionarios', 'pot', 'observaciones',
  ]);
  assert.ok(ss.every(s => s.titulo && !s.resumen));
});

test('seccionesFicha — visita completa: licencia aporte SI trae el detalle completo', () => {
  const s5 = seccionesFicha(FILA_COMPLETA, 'ADMIN').find(s => s.n === 5);
  assert.deepEqual(etiquetas(s5), [
    'Se aportó licencia', 'N° licencia', 'Fecha licencia', 'Tipo y modalidad',
    'Pisos aprobados', 'Destinaciones', 'Cubierta', 'Sistema estructural',
    'Observaciones licencia',
  ]);
  assert.equal(s5.sinDato.length, 0);
  assert.equal(s5.campos.find(c => c.l === 'Observaciones licencia').ancho, true);
});

test('seccionesFicha — visita completa: sección 7 aplica área y fecha de citación', () => {
  const s7 = seccionesFicha(FILA_COMPLETA, 'ADMIN').find(s => s.n === 7);
  assert.deepEqual(etiquetas(s7), [
    'Tipo de contravención', 'Área contravención (m²)', 'Suspensión de obra',
    'Cumple retiro quebrada', 'Fecha citación',
  ]);
  assert.equal(s7.campos.find(c => c.l === 'Tipo de contravención').ancho, true);
});

test('seccionesFicha — sección 6 y 10: un solo campo largo cada una', () => {
  const ss = seccionesFicha(FILA_COMPLETA, 'ADMIN');
  const s6 = ss.find(s => s.n === 6);
  const s10 = ss.find(s => s.n === 10);
  assert.equal(s6.campos.length, 1);
  assert.equal(s6.campos[0].largo, true);
  assert.equal(s6.campos[0].v, 'Se constató obra sin licencia.');
  assert.equal(s10.campos[0].largo, true);
  assert.equal(s10.campos[0].v, 'Conclusión: abstenerse de obras.');
});

// ── La cabecera no se repite ───────────────────────────────────

test('seccionesFicha — lo de la cabecera fija no se repite abajo', () => {
  const ss = seccionesFicha(FILA_COMPLETA, 'ADMIN');
  const s1 = ss.find(s => s.n === 1);
  const s2 = ss.find(s => s.n === 2);
  const s8 = ss.find(s => s.n === 8);
  const noEstan = (s, nombres) => nombres.forEach(n =>
    assert.ok(!etiquetas(s).includes(n) && !s.sinDato.includes(n), '«' + n + '» no debe aparecer'));
  noEstan(s1, ['Radicado', 'Atención PQR', 'Fecha de visita']);
  noEstan(s2, ['Dirección', 'Barrio / Vereda', 'Comuna']);
  noEstan(s8, ['Visitador(es)']);
  // Lo que sí queda, con dato:
  assert.ok(etiquetas(s1).includes('Denunciante'));
  assert.ok(etiquetas(s8).includes('Fecha asignación'));
});

// ── Campos vacíos van a sinDato ────────────────────────────────

test('seccionesFicha — un campo que aplica y está vacío va a sinDato, no a campos', () => {
  const ss = seccionesFicha({
    'ESTADO VISITA': 'INICIADO',
    'FECHA DE VISITA': '11/09/2026',
    'DENUNCIANTE/REMITENTE': 'Control Urbano',
    'SE APORTO LICENCIA': 'NO',
    'SUSPENSION DE LA OBRA': 'SI',
  }, 'ADMIN');
  const s1 = ss.find(s => s.n === 1);
  assert.ok(!etiquetas(s1).includes('N° orden policía'));
  assert.ok(s1.sinDato.includes('N° orden policía'));
  assert.ok(s1.sinDato.includes('Fecha radicado'));
  const s7 = ss.find(s => s.n === 7);
  assert.ok(s7.sinDato.includes('Fecha citación'),
    'con suspensión SI y sin fecha, la citación falta y aplica');
  assert.ok(!etiquetas(s7).includes('Fecha citación'));
  assert.ok(etiquetas(s7).includes('Suspensión de obra'));
});

// ── Lo que no aplica no se menciona ────────────────────────────

test('seccionesFicha — licencia NO: solo la respuesta, sin detalle', () => {
  const s5 = seccionesFicha({ ...FILA_COMPLETA, 'SE APORTO LICENCIA': 'NO' }, 'ADMIN')
    .find(s => s.n === 5);
  assert.deepEqual(etiquetas(s5), ['Se aportó licencia']);
  assert.equal(s5.campos[0].v, 'No');
  assert.equal(s5.sinDato.length, 0);
});

test('seccionesFicha — sección 7: sin contravención no hay área; sin suspensión ni fecha no hay citación', () => {
  const ss = seccionesFicha({
    ...FILA_COMPLETA,
    'TIPO DE INFRACCION': '', 'AREA CONTRAVENCION m2': '45',
    'SUSPENSION DE LA OBRA': 'NO', 'FECHA CITACION': '',
  }, 'ADMIN');
  const s7 = ss.find(s => s.n === 7);
  const ls = etiquetas(s7);
  assert.ok(!ls.includes('Área contravención (m²)') && !s7.sinDato.includes('Área contravención (m²)'));
  assert.ok(!ls.includes('Fecha citación') && !s7.sinDato.includes('Fecha citación'));
});

test('seccionesFicha — sección 9: solo campos con dato; vacía por completo, la sección no se menciona', () => {
  const con = seccionesFicha({
    'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '11/09/2026',
    'POLIGONO USO SUELO': 'Residencial',
  }, 'ADMIN');
  const s9 = con.find(s => s.n === 9);
  assert.deepEqual(etiquetas(s9), ['Polígono uso suelo']);
  assert.equal(s9.sinDato.length, 0, 'en POT los vacíos no van a sinDato');

  const vacia = seccionesFicha({
    'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '11/09/2026',
  }, 'ADMIN');
  assert.ok(!vacia.some(s => s.n === 9), 'sin datos POT la sección desaparece');
});

// ── Sin visita ─────────────────────────────────────────────────

test('seccionesFicha — sin visita: 3–7 y 9 reducidas a una línea, con número y título', () => {
  const ss = seccionesFicha({
    'RADICADO': '20261000002', 'ESTADO VISITA': 'PENDIENTE',
    'FECHA RADICADO': '23/01/2026',
  }, 'ADMIN');
  assert.deepEqual(ss.map(s => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const reducidas = ss.filter(s => [3, 4, 5, 6, 7, 9].includes(s.n));
  assert.ok(reducidas.every(s =>
    s.resumen === 'Se llena en la visita.' && s.campos.length === 0 && s.sinDato.length === 0));
  const s1 = ss.find(s => s.n === 1);
  assert.equal(s1.resumen, '');
  assert.ok(etiquetas(s1).includes('Fecha radicado'), 'la 1 sí muestra lo que ya existe');
  const s8 = ss.find(s => s.n === 8);
  assert.equal(s8.resumen, '', 'la 8 conserva fecha de asignación si la hay');
});

test('seccionesFicha — INICIADO sin fecha de visita NO es «sin visita»', () => {
  const ss = seccionesFicha({ 'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '' }, 'ADMIN');
  const s3 = ss.find(s => s.n === 3);
  assert.equal(s3.resumen, '');
  assert.ok(s3.sinDato.length > 0, 'los campos aplican y van a sinDato');
});

// ── Inspector vs admin en la sección 3 ─────────────────────────

test('seccionesFicha — la sección 3 es igual para todos los roles (como el modal de hoy)', () => {
  for (const rol of ['ADMIN', 'SUPERVISOR', 'INSPECTOR']) {
    const s3 = seccionesFicha(FILA_COMPLETA, rol).find(s => s.n === 3);
    assert.ok(etiquetas(s3).includes('Identificación'), rol + ' ve Identificación');
    assert.ok(etiquetas(s3).includes('Dirección notificación'), rol + ' ve Dirección notificación');
    assert.ok(etiquetas(s3).includes('Teléfono'), rol + ' ve Teléfono');
  }
});

// ── Robustez ───────────────────────────────────────────────────

test('seccionesFicha — sin fila devuelve vacío y no explota', () => {
  assert.deepEqual(seccionesFicha(null, 'ADMIN'), []);
});
