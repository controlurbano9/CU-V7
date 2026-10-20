// ═══════════════════════════════════════════════════════════════
// tests/audiencias-cupos.test.js — backend de cupos de audiencia
// ([SEC:Audiencias] en apps_script_unificado.js, TASK 1 de
// herramientas/audiencias/README.md).
//
// Las funciones puras se extraen del backend con el mismo método de
// tests/fila-movida.test.js (regex + vm): cierran todas con `}` en columna 0.
//
// Festivos: no aplican en estas pruebas a propósito — los 530 cupos vienen
// del Excel ya sin festivos (el bloqueo `bloquear-cupos-cu.ts` solo marca
// filas precargadas y los festivos no tienen filas).
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BACKEND = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const hay = fs.existsSync(BACKEND);
const opts = { skip: hay ? false : 'apps_script_unificado.js no está en esta copia' };

// ── Contexto con las funciones puras del backend ──
function cargarBackend() {
  const src = fs.readFileSync(BACKEND, 'utf8');
  const nombres = [
    'parsearFechaVisita', '_fechaRadicadoComoDate', '_normRadicadoFila',
    '_normNombre', '_franjaDeHora', '_minutosHora', '_horaCitacionBonita',
    '_novedadActiva', '_novedadCubre', '_cupoBloqueadoPorNovedad',
    '_cuposDisponibles', '_decisionReservaCupo', '_cuposAfectadosPorNovedad'
  ];
  let codigo = '';
  const mEstado = /var ESTADO_CUPO_RESERVADO = 'RESERVADO';/.exec(src);
  assert.ok(mEstado, 'no se encontró ESTADO_CUPO_RESERVADO');
  codigo += mEstado[0] + '\n';
  nombres.forEach(n => {
    const m = new RegExp('function ' + n + '\\([^)]*\\) \\{[\\s\\S]*?\\n}').exec(src);
    assert.ok(m, 'no se encontró ' + n);
    codigo += m[0] + '\n';
  });
  const ctx = vm.createContext({});
  vm.runInContext(codigo, ctx);
  const out = {};
  nombres.forEach(n => { out[n] = vm.runInContext(n, ctx); });
  // Fecha construida DENTRO del reino del vm: un Date del host no pasa el
  // `instanceof Date` de las funciones del backend (artefacto del vm, no bug).
  out.fechaEnVm = (y, m, d) => vm.runInContext('new Date(' + y + ',' + m + ',' + d + ')', ctx);
  return out;
}

// Cupo de prueba: los reales son '20270405-0900-VICTOR' / 05/04/2027 / 9:00AM.
function cupo(extra) {
  return Object.assign({
    idCupo: '20270405-0900-VICTOR',
    fecha: new Date(2027, 3, 5),
    fechaTexto: '05/04/2027',
    hora: '9:00AM',
    sustanciador: 'VICTOR QUIROZ',
    estado: 'LIBRE',
    radicado: ''
  }, extra);
}

const HOY = new Date(2026, 9, 19); // 19/10/2026, fija para que las pruebas no envejezcan

test('backend: la fecha DD/MM/YYYY se parsea por partes (05/09/2025 = 5 de septiembre)', opts, () => {
  const B = cargarBackend();
  const d = B._fechaRadicadoComoDate('05/09/2025');
  assert.equal(d.getDate(), 5);
  assert.equal(d.getMonth(), 8); // septiembre, no mayo (el fallo clásico de new Date(texto))
  assert.equal(d.getFullYear(), 2025);
  // La fecha de la celda puede llegar como Date de Sheets y da lo mismo.
  const celda = B._fechaRadicadoComoDate(B.fechaEnVm(2027, 3, 5));
  assert.equal(celda.getFullYear(), 2027);
  assert.equal(celda.getMonth(), 3);
  // Y la fecha del festivo nuevo que partió el cálculo: 12/07/2027.
  const f = B._fechaRadicadoComoDate('12/07/2027');
  assert.equal(f.getMonth(), 6);
  assert.equal(f.getDate(), 12);
});

test('backend: la franja sale de la hora AM/PM', opts, () => {
  const B = cargarBackend();
  assert.equal(B._franjaDeHora('9:00AM'), 'AM');
  assert.equal(B._franjaDeHora('2:00PM'), 'PM');
  assert.equal(B._franjaDeHora('12:00PM'), 'PM');
  assert.equal(B._franjaDeHora(''), '');
});

test('backend: novedad TODOS · DIA bloquea todo el rango; inactiva no', opts, () => {
  const B = cargarBackend();
  const novedad = {
    desde: new Date(2027, 4, 10), hasta: new Date(2027, 4, 21),
    sustanciador: 'TODOS', franja: 'DIA', activa: true
  };
  // Dentro del rango (Patricia 9AM), fuera, y los bordes.
  assert.equal(B._cupoBloqueadoPorNovedad(cupo({
    idCupo: '20270510-0900-PATRICIA', fecha: new Date(2027, 4, 10),
    sustanciador: 'PATRICIA LÓPEZ', hora: '9:00AM'
  }), [novedad]), true);
  assert.equal(B._cupoBloqueadoPorNovedad(cupo({
    idCupo: '20270521-1400-VICTOR', fecha: new Date(2027, 4, 21),
    sustanciador: 'VICTOR QUIROZ', hora: '2:00PM'
  }), [novedad]), true);
  assert.equal(B._cupoBloqueadoPorNovedad(cupo({
    idCupo: '20270524-0900-VICTOR', fecha: new Date(2027, 4, 24) // lunes siguiente
  }), [novedad]), false);
  // Desactivar la novedad devuelve los cupos.
  assert.equal(B._cupoBloqueadoPorNovedad(cupo(), [Object.assign({}, novedad, { activa: false })]), false);
});

test('backend: novedad de un sustanciador y una sola franja (AM no toca la tarde)', opts, () => {
  const B = cargarBackend();
  const novedad = {
    desde: new Date(2027, 4, 10), hasta: new Date(2027, 4, 10),
    sustanciador: 'Patricia López', franja: 'AM', activa: true // sin tildes da igual
  };
  assert.equal(B._cupoBloqueadoPorNovedad(cupo({
    idCupo: '20270510-0900-PATRICIA', fecha: new Date(2027, 4, 10),
    sustanciador: 'PATRICIA LÓPEZ', hora: '9:00AM'
  }), [novedad]), true);
  // Su propia tarde sí queda libre, y la mañana de otro también.
  assert.equal(B._cupoBloqueadoPorNovedad(cupo({
    idCupo: '20270510-1400-PATRICIA', fecha: new Date(2027, 4, 10),
    sustanciador: 'PATRICIA LÓPEZ', hora: '2:00PM'
  }), [novedad]), false);
  assert.equal(B._cupoBloqueadoPorNovedad(cupo({
    idCupo: '20270510-0900-VICTOR', sustanciador: 'VICTOR QUIROZ'
  }), [novedad]), false);
});

test('backend: novedad que termina el mismo día del cupo sí lo cubre (HASTA inclusivo)', opts, () => {
  const B = cargarBackend();
  const novedad = {
    desde: new Date(2027, 3, 5), hasta: new Date(2027, 3, 5),
    sustanciador: 'TODOS', franja: 'DIA', activa: true
  };
  assert.equal(B._cupoBloqueadoPorNovedad(cupo(), [novedad]), true);
});

test('backend: _cuposDisponibles — libres y futuros, ordenados por fecha y hora', opts, () => {
  const B = cargarBackend();
  const cupos = [
    cupo({ idCupo: '20270412-0900-VICTOR', fecha: new Date(2027, 3, 12) }),
    cupo({ idCupo: '20270405-1400-VICTOR', fecha: new Date(2027, 3, 5), hora: '2:00PM' }),
    cupo({ idCupo: '20270405-0900-VICTOR' }),
    cupo({ idCupo: '20260301-0900-VICTOR', fecha: new Date(2026, 2, 1),
      fechaTexto: '01/03/2026' }), // pasado (antes de HOY)
    cupo({ idCupo: '20270405-0900-JUANSE', fecha: new Date(2027, 3, 5),
      sustanciador: 'JUANSE PINZÓN', estado: 'RESERVADO', radicado: '20261011111' }),
    cupo({ idCupo: '20270405-0900-SINFECHA', fecha: null }) // fecha ilegible
  ];
  const libres = B._cuposDisponibles(cupos, [], HOY);
  assert.deepEqual(Array.from(libres.map(c => c.idCupo)), [
    '20270405-0900-VICTOR',    // primero: 05/04 9:00
    '20270405-1400-VICTOR',    // mismo día, 2:00PM
    '20270412-0900-VICTOR'
  ]);
});

test('backend: empate de fecha y hora — primero el sustanciador con menos reservas del mes', opts, () => {
  const B = cargarBackend();
  const mes = new Date(2027, 3, 5);
  const cupos = [
    cupo({ idCupo: '20270405-0900-VICTOR', sustanciador: 'VICTOR QUIROZ' }),
    cupo({ idCupo: '20270405-0900-JUANSE', fecha: mes, sustanciador: 'JUANSE PINZÓN' }),
    // Víctor ya tiene 2 reservas en abril; Juanse ninguna.
    cupo({ idCupo: '20270401-0900-VICTOR', fecha: new Date(2027, 3, 1),
      sustanciador: 'VICTOR QUIROZ', estado: 'RESERVADO', radicado: '20261000001' }),
    cupo({ idCupo: '20270401-1400-VICTOR', fecha: new Date(2027, 3, 1), hora: '2:00PM',
      sustanciador: 'VICTOR QUIROZ', estado: 'RESERVADO', radicado: '20261000002' })
  ];
  const libres = B._cuposDisponibles(cupos, [], HOY);
  assert.equal(libres[0].idCupo, '20270405-0900-JUANSE');
  assert.equal(libres[1].idCupo, '20270405-0900-VICTOR');
});

test('backend: reservar un cupo libre y futuro → ok', opts, () => {
  const B = cargarBackend();
  const r = B._decisionReservaCupo(cupo(), '20261011111', [], [], HOY);
  // Los objetos vienen del reino del vm: se comparan por campo, no por estructura.
  assert.equal(r.ok, true);
  assert.equal(r.motivo, undefined);
});

test('backend: cupo reservado por otro → ocupado; reservado por el mismo radicado → idempotente', opts, () => {
  const B = cargarBackend();
  const ocupado = cupo({ estado: 'RESERVADO', radicado: '20261022222' });
  const r = B._decisionReservaCupo(ocupado, '20261011111', [], [], HOY);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'ocupado');
  // Reintento del mismo radicado (se coló del dedup): no es error.
  const propio = B._decisionReservaCupo(ocupado, '20261022222', [], [], HOY);
  assert.equal(propio.ok, true);
  assert.equal(propio.yaEraSuyo, true);
  // CANCELADO tampoco se ofrece.
  assert.equal(B._decisionReservaCupo(cupo({ estado: 'CANCELADO' }), '20261011111', [], [], HOY).motivo, 'ocupado');
});

test('backend: cupo pasado → pasado', opts, () => {
  const B = cargarBackend();
  const r = B._decisionReservaCupo(
    cupo({ fecha: new Date(2026, 9, 12), fechaTexto: '12/10/2026' }), '20261011111', [], [], HOY);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'pasado');
  // El mismo día de hoy sí sirve (una audiencia de las 2:00PM se reserva en la mañana).
  assert.equal(B._decisionReservaCupo(
    cupo({ fecha: new Date(2026, 9, 19), hora: '2:00PM' }), '20261011111', [], [], HOY).ok, true);
});

test('backend: cupo dentro de una novedad → novedad', opts, () => {
  const B = cargarBackend();
  const novedad = {
    desde: new Date(2027, 3, 5), hasta: new Date(2027, 3, 5),
    sustanciador: 'TODOS', franja: 'DIA', activa: true
  };
  const r = B._decisionReservaCupo(cupo(), '20261011111', [], [novedad], HOY);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'novedad');
});

test('backend: el radicado ya tiene audiencia futura → yaCitado, con el cupo incluido', opts, () => {
  const B = cargarBackend();
  const propia = cupo({
    idCupo: '20270405-0900-JUANSE', fecha: new Date(2027, 3, 5),
    sustanciador: 'JUANSE PINZÓN', estado: 'RESERVADO', radicado: '20261011111'
  });
  const r = B._decisionReservaCupo(cupo(), '20261011111', [propia], [], HOY);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'yaCitado');
  assert.equal(r.cupo.idCupo, '20270405-0900-JUANSE');
  // Una reserva ya pasada del mismo radicado no cuenta: se puede citar de nuevo.
  const vieja = cupo({
    idCupo: '20260901-0900-JUANSE', fecha: new Date(2026, 8, 1),
    estado: 'RESERVADO', radicado: '20261011111'
  });
  assert.equal(B._decisionReservaCupo(cupo(), '20261011111', [vieja], [], HOY).ok, true);
});

test('backend: _cuposAfectadosPorNovedad — solo reservas dentro del rango (no las libres)', opts, () => {
  const B = cargarBackend();
  const novedad = {
    desde: new Date(2027, 4, 10), hasta: new Date(2027, 4, 21),
    sustanciador: 'TODOS', franja: 'DIA', activa: true
  };
  const cupos = [
    cupo({ idCupo: '20270510-0900-VICTOR', fecha: new Date(2027, 4, 10),
      estado: 'RESERVADO', radicado: '20261011111' }),
    cupo({ idCupo: '20270517-1400-JUANSE', fecha: new Date(2027, 4, 17), hora: '2:00PM',
      sustanciador: 'JUANSE PINZÓN', estado: 'RESERVADO', radicado: '20261022222' }),
    cupo({ idCupo: '20270524-0900-VICTOR', fecha: new Date(2027, 4, 24) }), // fuera del rango
    cupo({ idCupo: '20270510-0900-PATRICIA', fecha: new Date(2027, 4, 10),
      sustanciador: 'PATRICIA LÓPEZ' }) // libre: no es una citación que mover
  ];
  const afectados = B._cuposAfectadosPorNovedad(cupos, novedad);
  assert.deepEqual(Array.from(afectados.map(c => c.idCupo)),
    ['20270510-0900-VICTOR', '20270517-1400-JUANSE']);
});

test('backend: _horaCitacionBonita da el formato con que el formulario escribe FECHA CITACION', opts, () => {
  const B = cargarBackend();
  assert.equal(B._horaCitacionBonita('9:00AM'), '9:00 AM');
  assert.equal(B._horaCitacionBonita('2:00PM'), '2:00 PM');
  assert.equal(B._horaCitacionBonita('10:00AM'), '10:00 AM');
});
