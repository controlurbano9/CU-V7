// ═══════════════════════════════════════════════════════════════
// tests/agenda-cliente.test.js — candidatas de la agenda en el equipo.
//
// candidatasAgenda (utils.js) replica obtenerAgendaDiaria del backend
// (Apps Script, [SEC:Agenda]) sobre la copia local de BD VISITAS. El resultado
// esperado de abajo lo dio la función del SERVIDOR, ejecutada en Node con
// sustitutos de SpreadsheetApp y CacheService, sobre estas mismas filas
// (2026-11-04). Además se comparó con 8 bases al azar de 3.000 filas, con
// fechas, comunas y prioridades en formatos sucios: idénticas.
// Si la regla cambia en el backend, este archivo cambia con ella.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { candidatasAgenda } = require('../utils.js');

const HOY = new Date(2026, 10, 4, 10, 30);
const H = ['RADICADO', 'FECHA RADICADO', 'DIRECCION INFRACCION', 'BARRIO/VEREDA', 'COMUNA', 'ESTADO VISITA', 'PRIORIDAD', 'ATENCION PQR'];
// Como llegan por leerHoja + _procesarVisitas (texto); _idx = fila del Sheet.
const FILAS = [
  ['20251001', '15/01/2025', 'CL 50 # 32-10', 'Centro', '1', 'PENDIENTE', '', ''],
  ['20251002', '2025-03-01', 'CR 48 # 63-21', 'Niquía', '4', 'PQR PENDIENTE', '8 - Alto', ''],
  ['20251003', '01-06-2025', 'DG 55 # 40-12', 'Cabañas', '5.0', 'pendientes', '10 – Crítico', ''],
  ['20251004', '10/10/2025', 'Vereda Hato Viejo', 'Hato Viejo', 'RURAL', 'PENDIENTE', '3 - Baja', ''],
  ['20241005', '10/10/2024', 'CL 1 # 1-1', 'París', '2', 'PENDIENTE', '9 - Alto', ''],       // radicado de 2024: no se sugiere
  ['20251006', '20/02/2025', 'CL 2 # 2-2', 'París', '2', 'ASIGNADO', '', ''],              // ya asignada
  ['20251007', '20/02/2025', 'CL 3 # 3-3', 'París', '2', 'PENDIENTE', '', 'NO COMPETENCIA'],
  ['20251008', '31/02/2025', 'CL 4 # 4-4', 'París', '2', 'PENDIENTE', '', ''],             // fecha que no existe
  ['20251009', '20/02/2025', 'CL 5 # 5-5', 'París', '', 'PENDIENTE', '', ''],              // sin comuna
  ['20251010.0', '20/02/2025', 'CL 6 # 6-6', 'Niquía', '4.4', 'PENDIENTE', 'Sin análisis', ''],
].map((f, i) => { const o = { _idx: i + 2 }; H.forEach((h, j) => { o[h] = f[j]; }); return o; });

// Salida de obtenerAgendaDiaria (servidor) para estas filas.
const ESPERADO = {
  "totalPendientes": 5,
  "comunas": [
    {
      "comuna": 5,
      "total": 1,
      "visitas": [
        {
          "fila": 4,
          "radicado": "20251003",
          "fechaRad": "01/06/2025",
          "direccion": "DG 55 # 40-12",
          "barrio": "Cabañas",
          "comuna": 5,
          "score": 9.14,
          "prioridad": 10,
          "dias": 521
        }
      ]
    },
    {
      "comuna": 4,
      "total": 2,
      "visitas": [
        {
          "fila": 11,
          "radicado": "20251010",
          "fechaRad": "20/02/2025",
          "direccion": "CL 6 # 6-6",
          "barrio": "Niquía",
          "comuna": 4,
          "score": 8.96,
          "prioridad": null,
          "dias": 622
        },
        {
          "fila": 3,
          "radicado": "20251002",
          "fechaRad": "01/03/2025",
          "direccion": "CR 48 # 63-21",
          "barrio": "Niquía",
          "comuna": 4,
          "score": 8.52,
          "prioridad": 8,
          "dias": 613
        }
      ]
    },
    {
      "comuna": 1,
      "total": 1,
      "visitas": [
        {
          "fila": 2,
          "radicado": "20251001",
          "fechaRad": "15/01/2025",
          "direccion": "CL 50 # 32-10",
          "barrio": "Centro",
          "comuna": 1,
          "score": 8.11,
          "prioridad": null,
          "dias": 658
        }
      ]
    },
    {
      "comuna": "RURAL",
      "total": 1,
      "visitas": [
        {
          "fila": 5,
          "radicado": "20251004",
          "fechaRad": "10/10/2025",
          "direccion": "Vereda Hato Viejo",
          "barrio": "Hato Viejo",
          "comuna": "RURAL",
          "score": 3.7,
          "prioridad": 3,
          "dias": 390
        }
      ]
    }
  ]
};

test('da lo mismo que el servidor: comunas, orden, puntajes y campos', () => {
  const r = candidatasAgenda(FILAS, HOY);
  assert.equal(r.totalPendientes, ESPERADO.totalPendientes);
  assert.deepEqual(r.comunas, ESPERADO.comunas);
  assert.equal(r.fecha, '04/11/2026');
});

test('fuera: asignadas, NO COMPETENCIA, radicados viejos, sin comuna y fechas que no existen', () => {
  const filas = candidatasAgenda(FILAS, HOY).comunas.flatMap(g => g.visitas).map(v => v.fila);
  [6, 7, 8, 9, 10].forEach(f => assert.ok(!filas.includes(f), 'la fila ' + f + ' no va'));
});

test('sin filas, agenda vacía', () => {
  assert.deepEqual(candidatasAgenda([], HOY).comunas, []);
  assert.equal(candidatasAgenda(null, HOY).totalPendientes, 0);
});
