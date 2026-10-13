// tests/buscar-e5.test.js — lógica pura del rediseño de Buscar (E5): caso preparado,
// filtros con facetas y orden «Más urgente». Filas pequeñas armadas a mano con las
// columnas que lee prepararCasoBuscar. Ejecutar: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const U = require('../utils.js');

const RAIZ = path.join(__dirname, '..');
const BARRIOS = JSON.parse(fs.readFileSync(path.join(RAIZ, 'barrios-mapa.json'), 'utf8')).barrios;
const PROJ = JSON.parse(fs.readFileSync(path.join(RAIZ, 'comunas-mapa.json'), 'utf8')).proj;
const IDX = U.crearIndiceBarriosPot(BARRIOS, PROJ);
// Inversa de la proyección: un punto del mapa a lat/lon (misma de barrio-pot.test.js).
const aLatLon = (x, y) => ({ lat: PROJ.maxY - y / PROJ.s, lon: (x / PROJ.s + PROJ.minX) / PROJ.k });

// «Hoy» fija para todas las pruebas: jueves 8 de octubre de 2026.
const HOY = new Date(2026, 9, 8);

// Fila de BD VISITAS a mano, con valores por omisión sensatos.
function fila(extra) {
  return Object.assign({
    _idx: 100,
    RADICADO: '20261041285',
    'ESTADO VISITA': 'PENDIENTE',
    'FECHA RADICADO': '01/08/2026',
    PRIORIDAD: '',
    'DIRECCION INFRACCION': 'CALLE 50 # 32-10',
    'BARRIO/VEREDA': 'Paris',
    COMUNA: '2',
  }, extra);
}

test('filtrosBuscarVacios arranca con los tres estados vivos', () => {
  const S = U.filtrosBuscarVacios();
  assert.deepEqual(S.estados, ['PENDIENTE', 'ASIGNADO', 'INICIADO']);
});

test('prepararCasoBuscar: tipo PQR / OFICIO / V2 y estado PROGRAMADA → PENDIENTE', () => {
  const pqr = U.prepararCasoBuscar(fila({}), null, HOY);
  assert.equal(pqr.tipo, 'PQR');
  assert.equal(pqr.estado, 'PENDIENTE');
  const oficio = U.prepararCasoBuscar(fila({ RADICADO: 'OFICIO-2026-09-010' }), null, HOY);
  assert.equal(oficio.tipo, 'OFICIO');
  const v2 = U.prepararCasoBuscar(fila({ RADICADO: 'QUEJA VERBAL', 'FECHA RADICADO': '' }), null, HOY);
  assert.equal(v2.tipo, 'V2');
  const prog = U.prepararCasoBuscar(fila({ 'ESTADO VISITA': 'PROGRAMADA' }), null, HOY);
  assert.equal(prog.estado, 'PENDIENTE');
});

test('prepararCasoBuscar: vis en mayúsculas separando por « / »', () => {
  const c = U.prepararCasoBuscar(fila({ 'VISITADOR(ES)': 'Ana Pérez / Juan López' }), null, HOY);
  assert.deepEqual(c.vis, ['ANA PÉREZ', 'JUAN LÓPEZ']);
});

test('prepararCasoBuscar: reit excluye el propio radicado', () => {
  const c = U.prepararCasoBuscar(fila({ RADICADOS_REITERADOS: '' , 'RADICADOS REITERADOS': '20261041285 / 20261011111' }), null, HOY);
  assert.deepEqual(c.reit, ['20261011111']);
});

test('prepararCasoBuscar: prio «7 - Alto» → Alta y vacío → Sin análisis', () => {
  assert.equal(U.prepararCasoBuscar(fila({ PRIORIDAD: '7 - Alto' }), null, HOY).prio, 'Alta');
  assert.equal(U.prepararCasoBuscar(fila({ PRIORIDAD: '' }), null, HOY).prio, 'Sin análisis');
  assert.equal(U.prepararCasoBuscar(fila({ PRIORIDAD: '2 - Mínima' }), null, HOY).prio, 'Baja');
});

test('prepararCasoBuscar: rural Vda. X → rural, vereda y comuna vacía', () => {
  const c = U.prepararCasoBuscar(fila({ 'BARRIO/VEREDA': 'Vda. La Paz', COMUNA: '4' }), null, HOY);
  assert.equal(c.rural, true);
  assert.equal(c.vereda, 'La Paz');
  assert.equal(c.comuna, '');
  // Urbano: la comuna viene de la fila
  const u = U.prepararCasoBuscar(fila({}), null, HOY);
  assert.equal(u.comuna, '2');
});

test('prepararCasoBuscar: faltas solo en INICIADO/COMPLETADO desde 2026', () => {
  // Completada de 2025 sin acta: no falta nada (antes no había entregables).
  const vieja = U.prepararCasoBuscar(fila({
    'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '10/06/2025',
  }), null, HOY);
  assert.deepEqual(vieja.faltas, []);

  // Iniciada de 2026 sin acta ni registro: faltan los dos. El informe no
  // cuenta como faltante (decisión 2026-10-13: la mayoría no lo lleva).
  const iniciada = U.prepararCasoBuscar(fila({
    'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '05/03/2026', UBICACION_CONFIRMADA: 'GPS',
  }), null, HOY);
  assert.deepEqual(iniciada.faltas, ['acta', 'rf']);
  assert.equal(iniciada.lista, false);

  // La orden solo falta con N° real, no con N/A.
  const sinOrden = U.prepararCasoBuscar(fila({
    'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '05/03/2026', UBICACION_CONFIRMADA: 'GPS',
    'N° ORDEN DE POLICIA': 'N/A',
  }), null, HOY);
  assert.equal(sinOrden.faltas.includes('orden'), false);
  const conOrden = U.prepararCasoBuscar(fila({
    'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '05/03/2026', UBICACION_CONFIRMADA: 'GPS',
    'N° ORDEN DE POLICIA': '2026-09-015',
  }), null, HOY);
  assert.equal(conOrden.faltas.includes('orden'), true);
});

test('prepararCasoBuscar: «lista para cerrar» = acta + registro + orden si hay, sin informe', () => {
  const base = { 'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '05/03/2026',
    LINK_XLSX_ACTA: 'https://drive/acta', LINK_REGISTRO_FOTOS: 'https://drive/rf' };
  const lista = U.prepararCasoBuscar(fila(base), null, HOY);
  assert.equal(lista.lista, true);
  assert.deepEqual(lista.faltanCierre, []);
  // Con orden real, falta escanearla.
  const conOrden = U.prepararCasoBuscar(fila(Object.assign({}, base, { 'N° ORDEN DE POLICIA': '2026-09-015' })), null, HOY);
  assert.equal(conOrden.lista, false);
  assert.deepEqual(conOrden.faltanCierre, ['Orden escaneada']);
  // Completada: nunca «lista para cerrar».
  const hecha = U.prepararCasoBuscar(fila(Object.assign({}, base, { 'ESTADO VISITA': 'COMPLETADO' })), null, HOY);
  assert.equal(hecha.lista, false);
  // El filtro de la vista.
  const S = Object.assign(U.filtrosBuscarVacios(), { estados: ['INICIADO'], listas: true });
  assert.deepEqual(U.filtrarBuscar([lista, conOrden], S), [lista]);
});

test('seccionesFicha: «Persona que atiende» sin atención va en una sola línea', () => {
  const t = 'No Se Atiende / No Suministra Datos';
  const s3 = U.seccionesFicha({ 'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '05/03/2026',
    'NOMBRE PERSONA ATIENDE': t, 'ID PERSONA ATIENDE': 'no se atiende / no suministra datos',
    'TELEFONO PERSONA ATIENDE': t }).find(s => s.clave === 'persona');
  assert.equal(s3.campos.length, 1);
  assert.equal(s3.campos[0].v, 'No se atendió ni suministró datos.');
  assert.deepEqual(s3.sinDato, []);
  // Con un dato real, se muestran todos tal cual.
  const s3b = U.seccionesFicha({ 'ESTADO VISITA': 'INICIADO', 'FECHA DE VISITA': '05/03/2026',
    'NOMBRE PERSONA ATIENDE': 'Ana Pérez', 'ID PERSONA ATIENDE': t }).find(s => s.clave === 'persona');
  assert.equal(s3b.campos.length, 2);
});

test('prepararCasoBuscar: tier de urgencia', () => {
  // PENDIENTE crítica vencida → 3
  const critica = U.prepararCasoBuscar(fila({ PRIORIDAD: '9 - Crítica' }), null, HOY);
  assert.equal(critica.tier, 3);
  // PENDIENTE de 2024 → 0 (no compite, regla de la Agenda)
  const vieja2024 = U.prepararCasoBuscar(fila({ 'FECHA RADICADO': '04/05/2024', PRIORIDAD: '9 - Crítica' }), null, HOY);
  assert.equal(vieja2024.tier, 0);
  // PENDIENTE sin análisis → 0 (sin plazo)
  const sinAnalisis = U.prepararCasoBuscar(fila({ PRIORIDAD: '' }), null, HOY);
  assert.equal(sinAnalisis.tier, 0);
  // ASIGNADO con 5+ días hábiles → 3; con menos → 2
  const vieja = U.prepararCasoBuscar(fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '24/08/2026' }), null, HOY);
  assert.equal(vieja.tier, 3);
  const reciente = U.prepararCasoBuscar(fila({ 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '06/10/2026' }), null, HOY);
  assert.equal(reciente.tier, 2);
  // COMPLETADO → -1
  const completa = U.prepararCasoBuscar(fila({ 'ESTADO VISITA': 'COMPLETADO' }), null, HOY);
  assert.equal(completa.tier, -1);
});

test('prepararCasoBuscar con idxBarrios real: el punto manda sobre «PARIS»', () => {
  const b = IDX.lista.find(x => x.n === 'Los Sauces');
  const p = aLatLon(BARRIOS[b.i].cx, BARRIOS[b.i].cy);
  const c = U.prepararCasoBuscar(fila({
    LATITUD: String(p.lat), LONGITUD: String(p.lon), 'BARRIO/VEREDA': 'PARIS',
  }), IDX, HOY);
  assert.equal(c.barrio, 'Los Sauces');
  assert.equal(c.comuna, c.pot.comuna);
});

test('una completada no pasa con los filtros de fábrica; su radicado tecleado completo sí', () => {
  const pendiente = U.prepararCasoBuscar(fila({}), null, HOY);
  const completada = U.prepararCasoBuscar(fila({ 'ESTADO VISITA': 'COMPLETADO' }), null, HOY);
  const casos = [pendiente, completada];

  const S = U.filtrosBuscarVacios();
  assert.deepEqual(U.filtrarBuscar(casos, S).map(c => c.rad), ['20261041285']);

  const Sq = U.filtrosBuscarVacios();
  Sq.q = '20261041285';
  assert.equal(U.filtrarBuscar(casos, Sq).length, 2);   // esExactaBuscar deja pasar la completada
});

test('coincideBuscar: radicado, dirección sin separadores, barrio, orden sin ceros, atiende y reiterado', () => {
  const c = U.prepararCasoBuscar(fila({
    'N° ORDEN DE POLICIA': '2026-09-015',
    'NOMBRE PERSONA ATIENDE': 'María Gómez',
    'RADICADOS REITERADOS': '20261011111',
  }), null, HOY);

  assert.equal(U.coincideBuscar(c, '20261041'), 'rad');
  assert.equal(U.coincideBuscar(c, 'CL 50 32 10'), 'dirk');   // clave sin separadores: CL503210
  assert.equal(U.coincideBuscar(c, 'paris'), 'barrio');
  assert.equal(U.coincideBuscar(c, '2026-9-15'), 'orden');    // sin ceros a la izquierda
  assert.equal(U.coincideBuscar(c, 'maria'), 'atiende');
  assert.equal(U.coincideBuscar(c, '20261011111'), 'reit');
  assert.equal(U.coincideBuscar(c, 'zzz inexistente'), '');
});

test('filtrarBuscar con excepto: el estado ignorado deja contar las alternativas', () => {
  const casos = [
    U.prepararCasoBuscar(fila({ _idx: 1 }), null, HOY),
    U.prepararCasoBuscar(fila({ _idx: 2, RADICADO: '20261050101' }), null, HOY),
    U.prepararCasoBuscar(fila({ _idx: 3, 'ESTADO VISITA': 'COMPLETADO' }), null, HOY),
  ];
  const S = U.filtrosBuscarVacios();
  S.estados = ['PENDIENTE'];

  assert.equal(U.filtrarBuscar(casos, S).length, 2);
  // Excepto estado: se ven los tres (así la faceta cuenta lo que verías al elegirlo)
  assert.equal(U.filtrarBuscar(casos, S, 'estado').length, 3);
  const m = U.conteoFacetaBuscar(casos, S, 'estado', c => [c.estado]);
  assert.equal(m.get('PENDIENTE'), 2);
  assert.equal(m.get('COMPLETADO'), 1);
});

test('filtrarBuscar: rango de fechas por campo vis; sin fecha no pasa', () => {
  const casos = [
    U.prepararCasoBuscar(fila({ _idx: 1, 'FECHA DE VISITA': '05/03/2026' }), null, HOY),
    U.prepararCasoBuscar(fila({ _idx: 2, 'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '20/09/2026', 'FECHA DEVOLUCION': '25/09/2026' }), null, HOY),
    U.prepararCasoBuscar(fila({ _idx: 3, 'ESTADO VISITA': 'COMPLETADO' }), null, HOY),   // sin FECHA DE VISITA
  ];
  const S = U.filtrosBuscarVacios();
  S.estados = U.BUSCAR_ESTADOS.slice();   // se piden las completadas a mano
  S.campo = 'vis'; S.desde = '2026-09-01';
  assert.deepEqual(U.filtrarBuscar(casos, S).map(c => c.id), [2]);
  S.hasta = '2026-09-30';
  assert.deepEqual(U.filtrarBuscar(casos, S).map(c => c.id), [2]);
});

test('lugar: comuna vale entera salvo que se elija un barrio suyo', () => {
  // Barrios reales del POT: dos de comuna 1 y uno de otra comuna.
  const b1 = 'Los Sauces';
  const b2 = IDX.lista.find(x => x.c === '1' && x.n !== b1).n;
  const bx = IDX.lista.find(x => x.c !== '1').n;
  U.registrarBarriosBuscar([{ n: b1, c: '1' }, { n: b2, c: '1' }, { n: bx, c: IDX.lista.find(x => x.n === bx).c }]);
  const centro = n => {
    const x = IDX.lista.find(z => z.n === n);
    return aLatLon(BARRIOS[x.i].cx, BARRIOS[x.i].cy);
  };
  const p1 = centro(b1), p2 = centro(b2);
  const sinBarrio = U.prepararCasoBuscar(fila({ _idx: 1, COMUNA: '1' }), null, HOY);
  const deB1 = U.prepararCasoBuscar(fila({ _idx: 2, LATITUD: String(p1.lat), LONGITUD: String(p1.lon) }), IDX, HOY);
  const deB2 = U.prepararCasoBuscar(fila({ _idx: 3, LATITUD: String(p2.lat), LONGITUD: String(p2.lon) }), IDX, HOY);

  // Solo comuna 1: pasa toda la comuna (los tres puntos caen en ella).
  let S = U.filtrosBuscarVacios();
  S.comunas = ['1'];
  assert.deepEqual(U.filtrarBuscar([sinBarrio, deB1, deB2], S).map(c => c.id), [1, 2, 3]);

  // Comuna 1 + un barrio suyo: acota a ese barrio (el resto de la comuna sale).
  S = U.filtrosBuscarVacios();
  S.comunas = ['1']; S.barrios = [b1];
  assert.deepEqual(U.filtrarBuscar([sinBarrio, deB1, deB2], S).map(c => c.id), [2]);

  U.registrarBarriosBuscar([]);   // limpiar para las demás pruebas
});

test('lugar: sinPot encuentra lo que el POT no identificó', () => {
  const sinBarrio = U.prepararCasoBuscar(fila({ _idx: 1, COMUNA: '3' }), null, HOY);   // sin POT no lo identifica
  const b = IDX.lista.find(x => x.n === 'Los Sauces');
  const p = aLatLon(BARRIOS[b.i].cx, BARRIOS[b.i].cy);
  const conBarrio = U.prepararCasoBuscar(fila({ _idx: 2, LATITUD: String(p.lat), LONGITUD: String(p.lon) }), IDX, HOY);

  const S = U.filtrosBuscarVacios();
  S.sinPot = true;
  assert.deepEqual(U.filtrarBuscar([sinBarrio, conBarrio], S).map(c => c.id), [1]);
});

test('lugar: rural por vereda', () => {
  const r1 = U.prepararCasoBuscar(fila({ _idx: 1, 'BARRIO/VEREDA': 'Vda. La Paz' }), null, HOY);
  const r2 = U.prepararCasoBuscar(fila({ _idx: 2, 'BARRIO/VEREDA': 'Vda. El Chorrillo' }), null, HOY);
  const urbano = U.prepararCasoBuscar(fila({ _idx: 3, 'BARRIO/VEREDA': 'Paris', COMUNA: '2' }), null, HOY);

  let S = U.filtrosBuscarVacios();
  S.veredas = ['LA PAZ'];
  assert.deepEqual(U.filtrarBuscar([r1, r2, urbano], S).map(c => c.id), [1]);

  S = U.filtrosBuscarVacios();
  S.rural = true;
  assert.deepEqual(U.filtrarBuscar([r1, r2, urbano], S).map(c => c.id), [1, 2]);
});

test('universoBuscar: inspector ve lo suyo + pendientes + completadas; admin ve todo', () => {
  const casos = [
    U.prepararCasoBuscar(fila({ _idx: 1, 'VISITADOR(ES)': 'Ana Pérez / Juan López' }), null, HOY),   // PENDIENTE
    U.prepararCasoBuscar(fila({ _idx: 2, 'ESTADO VISITA': 'INICIADO', 'VISITADOR(ES)': 'Juan López' }), null, HOY),
    U.prepararCasoBuscar(fila({ _idx: 3, 'ESTADO VISITA': 'COMPLETADO' }), null, HOY),
  ];
  // Inspector Ana: ve la pendiente (aunque sea de otro), la completada y la suya, no la iniciada ajena.
  assert.deepEqual(U.universoBuscar(casos, 'INSPECTOR', 'Ana Pérez').map(c => c.id), [1, 3]);
  assert.equal(U.universoBuscar(casos, 'ADMIN', 'Cualquiera').length, 3);
});

test('ordenarCasosBuscar «urg»: tier 3 antes que 2 y completadas al final', () => {
  const casos = [
    U.prepararCasoBuscar(fila({ _idx: 1, 'ESTADO VISITA': 'COMPLETADO' }), null, HOY),
    U.prepararCasoBuscar(fila({ _idx: 2, 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '24/08/2026' }), null, HOY),   // tier 3
    U.prepararCasoBuscar(fila({ _idx: 3, 'ESTADO VISITA': 'ASIGNADO', 'FECHA ASIGNACION VISITA': '06/10/2026' }), null, HOY),   // tier 2
  ];
  const l = U.ordenarCasosBuscar(casos, 'urg');
  assert.deepEqual(l.map(c => c.id), [2, 3, 1]);
});

test('ordenarCasosBuscar «rad»: V2 al final y por fecha de radicado, no por texto', () => {
  const casos = [
    U.prepararCasoBuscar(fila({ _idx: 1, RADICADO: 'OFICIO-2026-09-010', 'FECHA RADICADO': '15/09/2026' }), null, HOY),
    U.prepararCasoBuscar(fila({ _idx: 2, RADICADO: '20261050101', 'FECHA RADICADO': '01/10/2026' }), null, HOY),
    U.prepararCasoBuscar(fila({ _idx: 3, RADICADO: 'QUEJA VERBAL', 'FECHA RADICADO': '' }), null, HOY),
  ];
  const l = U.ordenarCasosBuscar(casos, 'rad');
  assert.deepEqual(l.map(c => c.id), [2, 1, 3]);
});

test('ordenarCasosBuscar: un radicado exacto tecleado sube arriba', () => {
  const casos = [
    U.prepararCasoBuscar(fila({ _idx: 1 }), null, HOY),
    U.prepararCasoBuscar(fila({ _idx: 2, RADICADO: '20261050101' }), null, HOY),
  ];
  const l = U.ordenarCasosBuscar(casos, 'urg', '20261050101');
  assert.equal(l[0].id, 2);
});
