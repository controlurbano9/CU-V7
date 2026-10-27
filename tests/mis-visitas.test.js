// ═══════════════════════════════════════════════════════════════
// tests/mis-visitas.test.js — lista de deuda de Mis visitas (utils.js).
//
// Contrato del que depende mis-visitas.jsx: el componente solo pinta. Lo que
// más se puede romper sin que se note es (1) que una visita iniciada por otro
// aparezca como propia, (2) que una asignada a futuro cuente como deuda de hoy
// y (3) que la lista y las alertas de Inicio digan días distintos para la
// misma visita.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ordenPoliciaDe, idArchivoDrive, entregablesFaltantes, agruparMisVisitas,
  mesesMisVisitas, recorridoVisita, diasSinIniciar, diasSinCompletar,
  pendientesMisVisitas, citaVisitaTexto,
} = require('../utils.js');

const HOY = new Date(2026, 8, 18); // viernes 18/09/2026
const YO = 'DANIEL PEDRAZA';
const fila = (extra) => Object.assign({ 'VISITADOR(ES)': YO, 'RADICADO': '20261000001' }, extra);

// ── ordenPoliciaDe / idArchivoDrive ────────────────────────────

test('ordenPoliciaDe — con y sin «°», y el N/A de las filas migradas no es una orden', () => {
  assert.equal(ordenPoliciaDe({ 'N° ORDEN DE POLICIA': ' 2026-09-015 ' }), '2026-09-015');
  assert.equal(ordenPoliciaDe({ 'N ORDEN DE POLICIA': '2026-09-015' }), '2026-09-015');
  assert.equal(ordenPoliciaDe({ 'N° ORDEN DE POLICIA': 'N/A' }), '');
  assert.equal(ordenPoliciaDe({ 'N° ORDEN DE POLICIA': 'no aplica' }), '');
  assert.equal(ordenPoliciaDe({}), '');
  assert.equal(ordenPoliciaDe(null), '');
});

test('idArchivoDrive — saca el id de /d/<id>/ y de ?id=<id>', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz_0123-45';
  assert.equal(idArchivoDrive('https://drive.google.com/file/d/' + id + '/view?usp=drivesdk'), id);
  assert.equal(idArchivoDrive('https://drive.google.com/open?id=' + id), id);
  assert.equal(idArchivoDrive('https://drive.google.com/uc?export=download&id=' + id), id);
  assert.equal(idArchivoDrive('https://drive.google.com/drive/folders/' + id), '', 'una carpeta no es un archivo');
  assert.equal(idArchivoDrive(''), '');
  assert.equal(idArchivoDrive(null), '');
});

// ── entregablesFaltantes ───────────────────────────────────────

test('entregablesFaltantes — iniciada sin nada: acta y registro; la orden solo si tiene número real', () => {
  const base = { 'ESTADO VISITA': 'INICIADO' };
  assert.deepEqual(entregablesFaltantes(base), ['Acta', 'Registro fotográfico']);
  assert.deepEqual(entregablesFaltantes({ ...base, 'N° ORDEN DE POLICIA': '2026-09-015' }),
    ['Acta', 'Orden escaneada', 'Registro fotográfico']);
  assert.deepEqual(entregablesFaltantes({ ...base, 'N° ORDEN DE POLICIA': 'N/A' }),
    ['Acta', 'Registro fotográfico']);
});

test('entregablesFaltantes — el acta cuenta en Sheet o en PDF; con todo, lista vacía', () => {
  const base = { 'ESTADO VISITA': 'INICIADO', 'LINK_REGISTRO_FOTOS': 'https://drive/rf' };
  assert.deepEqual(entregablesFaltantes({ ...base, 'LINK_XLSX_ACTA': 'https://drive/x' }), []);
  assert.deepEqual(entregablesFaltantes({ ...base, 'LINK_PDF_ACTA': 'https://drive/p' }), []);
  assert.deepEqual(entregablesFaltantes({
    ...base, 'LINK_PDF_ACTA': 'https://drive/p',
    'N° ORDEN DE POLICIA': '2026-09-015', 'LINK_ORDEN_POLICIA': 'https://drive/o',
  }), []);
});

test('entregablesFaltantes — el informe no se lista y solo aplica a las iniciadas', () => {
  assert.ok(!entregablesFaltantes({ 'ESTADO VISITA': 'INICIADO' }).includes('Informe'));
  assert.deepEqual(entregablesFaltantes({ 'ESTADO VISITA': 'ASIGNADO' }), []);
  assert.deepEqual(entregablesFaltantes({ 'ESTADO VISITA': 'COMPLETADO' }), []);
  assert.deepEqual(entregablesFaltantes(null), []);
});

test('entregablesFaltantes — visita que se documenta con informe: falta el informe, no el acta', () => {
  const { documentoVisita } = require('../utils.js');
  const base = { 'ESTADO VISITA': 'INICIADO', 'DOCUMENTO_VISITA': 'INFORME' };
  assert.deepEqual(entregablesFaltantes(base), ['Informe']);
  assert.deepEqual(entregablesFaltantes({ ...base, 'N° ORDEN DE POLICIA': '2026-09-015' }), ['Informe', 'Orden escaneada']);
  assert.deepEqual(entregablesFaltantes({ ...base, 'LINK_DOCX_INFORME': 'https://drive/i' }), []);
  // Columna vacía o desconocida = acta, como todas las visitas de antes.
  assert.equal(documentoVisita({}), 'ACTA');
  assert.equal(documentoVisita({ 'DOCUMENTO_VISITA': 'informe' }), 'INFORME');
  assert.equal(documentoVisita('ACTA'), 'ACTA');
});

test('entregablesFaltantes — acta o informe: con uno de los dos basta (ficha v2)', () => {
  // Modo ACTA: el informe existente también cierra el renglón del acta.
  assert.deepEqual(
    entregablesFaltantes({ 'ESTADO VISITA': 'INICIADO', 'LINK_DOCX_INFORME': 'https://drive/i' }),
    ['Registro fotográfico'], 'sin acta pero con informe, el acta no falta');
  // Modo INFORME: el acta existente también cierra el renglón del informe.
  assert.deepEqual(entregablesFaltantes({
    'ESTADO VISITA': 'INICIADO', 'DOCUMENTO_VISITA': 'INFORME', 'LINK_XLSX_ACTA': 'https://drive/x',
  }), [], 'sin informe pero con acta, el informe no falta');
});

// ── agruparMisVisitas ──────────────────────────────────────────

test('agruparMisVisitas — reparte por estado y deja fuera lo que no es visita', () => {
  const g = agruparMisVisitas([
    fila({ 'ESTADO VISITA': 'PENDIENTE' }),
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '11/09/2026' }),
    fila({ 'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '11/09/2026' }),
    fila({ 'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '01/09/2026' }),
    fila({ 'ESTADO VISITA': 'REITERADO' }),
    fila({ 'ESTADO VISITA': 'DESCARGADA GESTION' }),
  ], YO, HOY);
  assert.equal(g.hacer.length, 2);
  assert.equal(g.curso.length, 1);
  assert.equal(g.hechas.length, 1);
});

test('agruparMisVisitas — regla del diligenciador: iniciada o completada solo para el primero', () => {
  const g = agruparMisVisitas([
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'OTRO INSPECTOR / ' + YO }),
    fila({ 'ESTADO VISITA': 'INICIADO', 'VISITADOR(ES)': 'OTRO INSPECTOR / ' + YO }),
    fila({ 'ESTADO VISITA': 'COMPLETADO', 'VISITADOR(ES)': 'OTRO INSPECTOR / ' + YO }),
    fila({ 'ESTADO VISITA': 'INICIADO', 'VISITADOR(ES)': YO + ' / OTRO INSPECTOR' }),
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'VISITADOR(ES)': 'OTRO INSPECTOR' }),
  ], YO, HOY);
  assert.equal(g.hacer.length, 1, 'co-asignado ve la asignada');
  assert.equal(g.curso.length, 1, 'solo la que él diligencia');
  assert.equal(g.hechas.length, 0);
});

test('agruparMisVisitas — una asignada para más adelante no es deuda de hoy', () => {
  const g = agruparMisVisitas([
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '21/09/2026' }),
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '18/09/2026' }),
  ], YO, HOY);
  assert.equal(g.hacer.length, 1);
  assert.equal(g.hacer[0].f['FECHA ASIGNACION VISITA'], '18/09/2026');
});

test('agruparMisVisitas — la más demorada primero y la que no tiene fecha al final', () => {
  const g = agruparMisVisitas([
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'RADICADO': 'SIN-FECHA' }),
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'RADICADO': 'RECIENTE', 'FECHA ASIGNACION VISITA': '16/09/2026' }),
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'RADICADO': 'VIEJA', 'FECHA ASIGNACION VISITA': '03/08/2026' }),
    fila({ 'ESTADO VISITA': 'INICIADO', 'RADICADO': 'C-RECIENTE', 'FECHA DE VISITA': '17/09/2026' }),
    fila({ 'ESTADO VISITA': 'INICIADO', 'RADICADO': 'C-VIEJA', 'FECHA DE VISITA': '11/09/2026' }),
  ], YO, HOY);
  assert.deepEqual(g.hacer.map(x => x.f['RADICADO']), ['VIEJA', 'RECIENTE', 'SIN-FECHA']);
  assert.equal(g.hacer[2].dias, null);
  assert.deepEqual(g.curso.map(x => x.f['RADICADO']), ['C-VIEJA', 'C-RECIENTE']);
});

test('agruparMisVisitas — los días son los mismos de las alertas de Inicio', () => {
  const a = fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '11/09/2026' });
  const c = fila({ 'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '11/09/2026' });
  const g = agruparMisVisitas([a, c], YO, HOY);
  assert.equal(g.hacer[0].dias, diasSinIniciar(a, HOY));
  assert.equal(g.curso[0].dias, diasSinCompletar(c, HOY));
  assert.equal(g.curso[0].dias, 5);
  assert.deepEqual(g.curso[0].faltan, ['Acta', 'Registro fotográfico']);
});

test('agruparMisVisitas — completadas: la más reciente primero, por fecha de visita', () => {
  const g = agruparMisVisitas([
    fila({ 'ESTADO VISITA': 'COMPLETADO', 'RADICADO': 'A', 'FECHA DE VISITA': '01/08/2026' }),
    fila({ 'ESTADO VISITA': 'COMPLETADO', 'RADICADO': 'B', 'FECHA DE VISITA': '15/09/2026' }),
    fila({ 'ESTADO VISITA': 'COMPLETADO', 'RADICADO': 'C' }),
    fila({ 'ESTADO VISITA': 'COMPLETADO', 'RADICADO': 'D', 'FECHA DEVOLUCION': '02/09/2026' }),
  ], YO, HOY);
  assert.deepEqual(g.hechas.map(x => x.f['RADICADO']), ['B', 'D', 'A', 'C']);
});

test('agruparMisVisitas — sin nombre no devuelve las visitas de todos', () => {
  const g = agruparMisVisitas([fila({ 'ESTADO VISITA': 'ASIGNADO' })], '', HOY);
  assert.deepEqual(g, { hacer: [], curso: [], hechas: [] });
  assert.deepEqual(agruparMisVisitas(null, YO, HOY), { hacer: [], curso: [], hechas: [] });
});

// ── mesesMisVisitas ────────────────────────────────────────────

const hecha = (rad, fecha) => ({ f: { 'RADICADO': rad }, fecha: fecha });

test('mesesMisVisitas — un grupo por mes, con el año solo si no es el actual', () => {
  const m = mesesMisVisitas([
    hecha('A', new Date(2026, 8, 15)), hecha('B', new Date(2026, 8, 2)),
    hecha('C', new Date(2026, 7, 20)), hecha('D', new Date(2025, 11, 10)), hecha('E', null),
  ], null, HOY);
  assert.deepEqual(m.map(g => g.rotulo), [
    'Completadas en septiembre', 'Completadas en agosto',
    'Completadas en diciembre de 2025', 'Completadas sin fecha de visita',
  ]);
  assert.deepEqual(m.map(g => g.total), [2, 1, 1, 1]);
});

test('mesesMisVisitas — el límite corta lo pintado, no el conteo del mes', () => {
  const m = mesesMisVisitas([
    hecha('A', new Date(2026, 8, 15)), hecha('B', new Date(2026, 8, 2)),
    hecha('C', new Date(2026, 8, 1)), hecha('D', new Date(2026, 7, 20)),
  ], 2, HOY);
  assert.equal(m.length, 1, 'agosto no se pinta: quedó tras «Mostrar más»');
  assert.equal(m[0].items.length, 2);
  assert.equal(m[0].total, 3);
});

// ── recorridoVisita ────────────────────────────────────────────

test('recorridoVisita — asignada: detenida en la visita, con los días sin iniciar', () => {
  const f = { 'ESTADO VISITA': 'ASIGNADO', 'FECHA RADICADO': '23/01/2026', 'FECHA ASIGNACION VISITA': '11/09/2026' };
  const p = recorridoVisita(f, HOY);
  assert.deepEqual(p.map(x => x.clave), ['radicada', 'asignada', 'visita', 'completada']);
  assert.deepEqual(p.map(x => x.hecho), [true, true, false, false]);
  assert.deepEqual(p.map(x => x.espera), [false, false, true, false]);
  assert.equal(p[0].valor, '23/01/2026');
  assert.equal(p[2].valor, 'Sin iniciar');
  assert.equal(p[2].dias, 5);
  assert.equal(p[3].valor, '');
});

test('recorridoVisita — pendiente tomada sin asignar: el paso de asignación queda vacío', () => {
  const p = recorridoVisita({ 'ESTADO VISITA': 'PENDIENTE', 'FECHA RADICADO': '23/01/2026' }, HOY);
  assert.equal(p[1].hecho, false);
  assert.equal(p[2].espera, true);
  assert.equal(p[2].dias, null);
});

test('recorridoVisita — iniciada: detenida en completar', () => {
  const f = { 'ESTADO VISITA': 'INICIADO', 'FECHA RADICADO': '02/06/2026',
    'FECHA ASIGNACION VISITA': '08/09/2026', 'FECHA DE VISITA': '11/09/2026' };
  const p = recorridoVisita(f, HOY);
  assert.deepEqual(p.map(x => x.hecho), [true, true, true, false]);
  assert.equal(p[2].valor, '11/09/2026');
  assert.equal(p[3].espera, true);
  assert.equal(p[3].valor, 'Sin completar');
  assert.equal(p[3].dias, 5);
});

test('recorridoVisita — completada: nada en espera; sin fecha de devolución sigue hecha', () => {
  const f = { 'ESTADO VISITA': 'COMPLETADO', 'FECHA RADICADO': '02/06/2026',
    'FECHA ASIGNACION VISITA': '08/09/2026', 'FECHA DE VISITA': '11/09/2026', 'FECHA DEVOLUCION': '14/09/2026' };
  const p = recorridoVisita(f, HOY);
  assert.ok(p.every(x => x.hecho && !x.espera));
  assert.equal(p[3].valor, '14/09/2026');
  const vieja = recorridoVisita({ ...f, 'FECHA DEVOLUCION': '' }, HOY);
  assert.equal(vieja[3].hecho, true);
  assert.equal(vieja[3].valor, '');
  assert.deepEqual(recorridoVisita(null, HOY), []);
});

// ── pendientesMisVisitas / citaVisitaTexto (arquitectura 2026-10-27) ──

test('pendientes — la siguiente es una asignada de hoy; el resto va por demora, sin repetirla', () => {
  const datos = [
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '18/09/2026', 'RADICADO': 'HOY' }),
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '01/09/2026', 'RADICADO': 'VIEJA' }),
    fila({ 'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '10/09/2026', 'RADICADO': 'CURSO' }),
  ];
  const p = pendientesMisVisitas(agruparMisVisitas(datos, YO, HOY), YO, HOY);
  assert.equal(p.siguiente.x.f['RADICADO'], 'HOY');
  assert.equal(p.siguiente.n, 1);
  assert.equal(p.siguiente.de, 1);
  assert.deepEqual(p.lista.map(x => x.f['RADICADO']), ['VIEJA', 'CURSO']);
  assert.deepEqual(p.lista.map(x => x.tipo), ['hacer', 'curso']);
});

test('pendientes — sin visitas para hoy no hay siguiente', () => {
  const datos = [fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '01/09/2026' })];
  const p = pendientesMisVisitas(agruparMisVisitas(datos, YO, HOY), YO, HOY);
  assert.equal(p.siguiente, null);
  assert.equal(p.lista.length, 1);
});

test('pendientes — la siguiente respeta el orden del día guardado a mano', () => {
  const datos = [
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '18/09/2026', 'RADICADO': 'A', 'ORDEN_DIA': '18/09/2026#2' }),
    fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '18/09/2026', 'RADICADO': 'B', 'ORDEN_DIA': '18/09/2026#1' }),
  ];
  const p = pendientesMisVisitas(agruparMisVisitas(datos, YO, HOY), YO, HOY);
  assert.equal(p.siguiente.x.f['RADICADO'], 'B');
  assert.equal(p.siguiente.de, 2);
  assert.deepEqual(p.lista.map(x => x.f['RADICADO']), ['A']);
});

test('pendientes — la que diligencia otro va aparte, aunque sea de hoy', () => {
  const datos = [fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '18/09/2026',
    'VISITADOR(ES)': 'ALEJANDRO HENAO / ' + YO })];
  const p = pendientesMisVisitas(agruparMisVisitas(datos, YO, HOY), YO, HOY);
  assert.equal(p.siguiente, null);
  assert.equal(p.lista.length, 0);
  assert.equal(p.acompanas.length, 1);
});

test('citaVisitaTexto — hoy, mañana, día de la semana; pasadas no; urgente a ≤3 días hábiles', () => {
  assert.deepEqual(citaVisitaTexto({ 'FECHA CITACION': '18/09/2026 · 9:00 a. m.' }, HOY),
    { texto: 'Audiencia hoy · 9:00 a. m.', urgente: true });
  assert.equal(citaVisitaTexto({ 'FECHA CITACION': '19/09/2026' }, HOY).texto, 'Audiencia mañana');
  const lejos = citaVisitaTexto({ 'FECHA CITACION': '30/09/2026 · 2:00 p. m.' }, HOY);
  assert.equal(lejos.texto, 'Audiencia mié 30 · 2:00 p. m.');
  assert.equal(lejos.urgente, false);
  assert.equal(citaVisitaTexto({ 'FECHA CITACION': '10/09/2026' }, HOY), null);
  assert.equal(citaVisitaTexto({ 'FECHA CITACION': 'No se deja citación' }, HOY), null);
  assert.equal(citaVisitaTexto({}, HOY), null);
});
