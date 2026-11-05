// ═══════════════════════════════════════════════════════════════
// tests/inspecciones-backend.test.js — programarInspecciones /
// decretarInspeccion del backend (apps_script_unificado.js,
// [SEC:InspeccionesLugar]), de punta a punta contra hojas falsas.
//
// Cubre la corrección tras la revisión del 2026-11-05: la nota no se borra
// al reprogramar, conflicto si otra persona cambió la inspección
// (programadaConocida), choque de inspector a la misma hora, hora/fecha
// validadas en el backend y la marca INSPECCION_DECRETADA limpia solo donde
// toca (radicado real = todo el caso; texto V2 = solo su fila).
//
// Patrón de tests/audiencias-backend.test.js: se salta si
// apps_script_unificado.js no está junto a la carpeta del repo.
//
// Ejecutar: npm test
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const BACKEND = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const hay = fs.existsSync(BACKEND);
const opts = { skip: hay ? false : 'apps_script_unificado.js no está en esta copia' };

const sha = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');
const dos = (n) => (n < 10 ? '0' : '') + n;

// ── Hoja falsa (misma que tests/audiencias-backend.test.js) ──
function hoja(filas) {
  const s = {
    _v: filas.map(r => r.slice()),
    _fmt: {},
    getLastRow() { return s._v.length; },
    getLastColumn() { return s._v.length ? Math.max(1, ...s._v.map(r => r.length)) : 1; },
    getDataRange() { return s.getRange(1, 1, Math.max(1, s.getLastRow()), s.getLastColumn()); },
    getRange(r, c, nr = 1, nc = 1) {
      const celdas = () => {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = [];
          for (let j = 0; j < nc; j++) { const v = (s._v[r - 1 + i] || [])[c - 1 + j]; row.push(v == null ? '' : v); }
          out.push(row);
        }
        return out;
      };
      const poner = (i, j, v) => {
        while (s._v.length < r + i) s._v.push([]);
        const row = s._v[r - 1 + i];
        while (row.length < c + j) row.push('');
        row[c - 1 + j] = v;
      };
      const rango = {
        getValues() { return celdas(); },
        getDisplayValues() {
          return celdas().map(row => row.map(v => v instanceof Date
            ? dos(v.getDate()) + '/' + dos(v.getMonth() + 1) + '/' + v.getFullYear() : String(v)));
        },
        getValue() { return celdas()[0][0]; },
        setValue(v) { poner(0, 0, v); return rango; },
        setValues(m) { m.forEach((row, i) => row.forEach((v, j) => poner(i, j, v))); return rango; },
        setNumberFormat(f) {
          for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) s._fmt[(r + i) + ',' + (c + j)] = f;
          return rango;
        },
        setFontWeight() { return rango; },
        createTextFinder(t) {
          const busca = {
            matchEntireCell() { return busca; },
            findAll() {
              const out = [];
              celdas().forEach((row, i) => row.forEach(v => {
                if (String(v) === String(t)) out.push({ getRow: () => r + i });
              }));
              return out;
            },
          };
          return busca;
        },
      };
      return rango;
    },
    appendRow(row) { s._v.push(row.slice()); },
    deleteRow(r) { s._v.splice(r - 1, 1); },
    setFrozenRows() {},
  };
  return s;
}

const BD = ['RADICADO', 'N° VISITA', 'ID_VISITA', 'ESTADO VISITA', 'VISITADOR(ES)',
  'FECHA ASIGNACION VISITA', 'DILIGENCIA', 'HORA_PROGRAMADA', 'NOTA_DILIGENCIA',
  'INSPECCION_DECRETADA', 'DIRECCION'];
const fila = (o) => BD.map(h => (o[h] == null ? '' : o[h]));

// Mundo nuevo por prueba. «Hoy» = lunes 05/04/2027 10:00. Filas:
//   2: PENDIENTE sin nada (montar) · 3: inspección de ALEJANDRO el 07/04
//   10:00 con nota URGENTE (reprogramar) · 4: inspección de MAURICIO el
//   07/04 9:00 (choque) · 5-6: dos OPERATIVO decretadas (P2-4) · 7-8: un
//   radicado real decretado en sus dos filas.
function mundo() {
  const hojas = {
    USUARIOS: hoja([
      ['NOMBRE', 'HASH', 'ACTIVO', 'CARGO', 'ROL'],
      ['DANIEL PEDRAZA', sha('4826'), 'SI', 'Profesional', 'ADMIN'],
    ]),
    LOG_AUDITORIA: hoja([['FECHA', 'USUARIO', 'ACCION']]),
    'BD VISITAS': hoja([BD].concat([
      fila({ RADICADO: '20271110010', 'N° VISITA': '1', ID_VISITA: 'V-10', 'ESTADO VISITA': 'PENDIENTE', DIRECCION: 'CL 50 # 32-10' }),
      fila({ RADICADO: '20271110011', 'N° VISITA': '2', ID_VISITA: 'V-11', 'ESTADO VISITA': 'ASIGNADO',
        'VISITADOR(ES)': 'ALEJANDRO HERNANDEZ', 'FECHA ASIGNACION VISITA': '07/04/2027',
        DILIGENCIA: 'INSPECCION AL LUGAR', HORA_PROGRAMADA: '10:00AM', NOTA_DILIGENCIA: 'URGENTE', DIRECCION: 'CR 48 # 63-21' }),
      fila({ RADICADO: '20271110012', 'N° VISITA': '1', ID_VISITA: 'V-12', 'ESTADO VISITA': 'ASIGNADO',
        'VISITADOR(ES)': 'MAURICIO HERRERA', 'FECHA ASIGNACION VISITA': '07/04/2027',
        DILIGENCIA: 'INSPECCION AL LUGAR', HORA_PROGRAMADA: '9:00AM', DIRECCION: 'CL 45 # 75A-12' }),
      fila({ RADICADO: 'OPERATIVO', 'N° VISITA': '1', ID_VISITA: 'V-13', 'ESTADO VISITA': 'PENDIENTE',
        INSPECCION_DECRETADA: '03/04/2027 · JUAN', DIRECCION: 'CL 30 # 5-20' }),
      fila({ RADICADO: 'OPERATIVO', 'N° VISITA': '1', ID_VISITA: 'V-14', 'ESTADO VISITA': 'PENDIENTE',
        INSPECCION_DECRETADA: '04/04/2027 · VICTOR', DIRECCION: 'CL 31 # 6-30' }),
      fila({ RADICADO: '20271110013', 'N° VISITA': '1', ID_VISITA: 'V-15', 'ESTADO VISITA': 'PENDIENTE',
        INSPECCION_DECRETADA: '03/04/2027 · JUAN', DIRECCION: 'CL 32 # 7-40' }),
      fila({ RADICADO: '20271110013', 'N° VISITA': '1', ID_VISITA: 'V-16', 'ESTADO VISITA': 'PENDIENTE',
        INSPECCION_DECRETADA: '03/04/2027 · JUAN', DIRECCION: 'CL 32 # 7-41' }),
      fila({ RADICADO: '20271110014', 'N° VISITA': '1', ID_VISITA: 'V-17', 'ESTADO VISITA': 'ASIGNADO',
        'VISITADOR(ES)': 'ALEJANDRO HERNANDEZ', 'FECHA ASIGNACION VISITA': '08/04/2027',
        DILIGENCIA: 'INSPECCIÓN AL LUGAR', HORA_PROGRAMADA: '2:00PM', DIRECCION: 'CL 33 # 8-50' }),
    ])),
  };
  const ss = { getSheetByName: (n) => hojas[n] || null, insertSheet: (n) => (hojas[n] = hoja([])) };
  const cache = new Map();
  const ctx = vm.createContext({
    SpreadsheetApp: { openById: () => ss },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (a, t) => Array.from(crypto.createHash(a).update(t, 'utf8').digest())
        .map(b => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(bytes.map(b => (b < 0 ? b + 256 : b))).toString('base64'),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, _tz, p) => String(p)
        .replace('yyyy', d.getFullYear()).replace('MM', dos(d.getMonth() + 1))
        .replace('dd', dos(d.getDate())).replace('HH', dos(d.getHours())).replace('mm', dos(d.getMinutes())),
    },
    CacheService: { getScriptCache: () => ({
      get: k => (cache.has(k) ? cache.get(k) : null),
      put: (k, v) => cache.set(k, String(v)),
      remove: k => cache.delete(k),
    }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => ({ s }) }) },
    Logger: { log() {} },
    console,
  });
  vm.runInContext(`(function () {
    var D = Date, fijo = new D(2027, 3, 5, 10, 0).getTime();
    function F() {
      if (!arguments.length) return new D(fijo);
      return new (Function.prototype.bind.apply(D, [null].concat([].slice.call(arguments))))();
    }
    F.prototype = D.prototype; F.now = function () { return fijo; }; F.UTC = D.UTC; F.parse = D.parse;
    Date = F;
  })();`, ctx);
  vm.runInContext(fs.readFileSync(BACKEND, 'utf8'), ctx);
  const post = (datos) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(datos) } }).s);
  const ses = { sesionUsuario: 'DANIEL PEDRAZA', sesionHash: sha('4826') };
  const programar = (item, extra) =>
    post(Object.assign({ accion: 'programarInspecciones', items: [item] }, ses, extra || {}));
  const val = (n, col) => {
    const r = hojas['BD VISITAS']._v[n - 1];
    return r == null ? undefined : r[BD.indexOf(col)];
  };
  return { hojas, post, ses, programar, val };
}

// ── P1: la nota no se borra ──
test('reprogramar sin nota conserva NOTA_DILIGENCIA y cambia la hora', opts, () => {
  const m = mundo();
  const r = m.programar({ modo: 'reprogramar', fila: 3, radicadoConocido: '20271110011',
    fecha: '08/04/2027', hora: '3:00PM', programadaConocida: '07/04/2027 10:00AM' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.resultados[0].ok, true, r.resultados[0].error);
  assert.equal(m.val(3, 'NOTA_DILIGENCIA'), 'URGENTE');
  assert.equal(m.val(3, 'HORA_PROGRAMADA'), '3:00PM');
  assert.equal(m.val(3, 'FECHA ASIGNACION VISITA'), '08/04/2027');
});

test('la hora conocida con espacio («10:00 AM») no da conflicto falso', opts, () => {
  const m = mundo();
  const r = m.programar({ modo: 'reprogramar', fila: 3, radicadoConocido: '20271110011',
    fecha: '08/04/2027', hora: '3:00PM', programadaConocida: '07/04/2027 10:00 AM' });
  assert.equal(r.resultados[0].ok, true, r.resultados[0].error);
  assert.equal(m.val(3, 'HORA_PROGRAMADA'), '3:00PM');
});

// ── P2-2: conflicto entre dos personas ──
test('programadaConocida distinta → conflicto y no escribe; sin ella (cliente viejo), escribe', opts, () => {
  const m = mundo();
  const r = m.programar({ modo: 'reprogramar', fila: 3, radicadoConocido: '20271110011',
    fecha: '08/04/2027', hora: '2:00PM', programadaConocida: '07/04/2027 9:00AM' }); // no es lo que hay
  assert.equal(r.resultados[0].ok, false);
  assert.equal(r.resultados[0].conflicto, true);
  assert.match(r.resultados[0].error, /Otra persona cambi[oó]/);
  assert.equal(m.val(3, 'HORA_PROGRAMADA'), '10:00AM', 'no escribió la hora');
  assert.equal(m.val(3, 'ESTADO VISITA'), 'ASIGNADO');
  // Cliente viejo (sin programadaConocida): comportamiento anterior.
  const r2 = m.programar({ modo: 'reprogramar', fila: 3, radicadoConocido: '20271110011',
    fecha: '08/04/2027', hora: '3:00PM' });
  assert.equal(r2.resultados[0].ok, true, r2.resultados[0].error);
  assert.equal(m.val(3, 'HORA_PROGRAMADA'), '3:00PM');
});

test('montar con programadaConocida vacía en una fila que ya tiene inspección → conflicto', opts, () => {
  const m = mundo();
  const r = m.programar({ modo: 'montar', fila: 3, radicadoConocido: '20271110011',
    inspector: 'DANIEL PEDRAZA', fecha: '08/04/2027', hora: '3:00PM', programadaConocida: '' });
  assert.equal(r.resultados[0].conflicto, true);
  assert.equal(m.val(3, 'HORA_PROGRAMADA'), '10:00AM');
});

// ── P2-2: choque de inspector ──
test('otra inspección del mismo inspector ese día a esa hora → error; otro inspector pasa', opts, () => {
  const m = mundo();
  const r = m.programar({ modo: 'montar', fila: 2, radicadoConocido: '20271110010',
    inspector: 'MAURICIO HERRERA', fecha: '07/04/2027', hora: '9:00AM', programadaConocida: '' });
  assert.equal(r.resultados[0].ok, false);
  assert.match(r.resultados[0].error, /MAURICIO ya tiene una inspecci[oó]n el 07\/04\/2027 a las 9:00AM\./);
  assert.equal(m.val(2, 'ESTADO VISITA'), 'PENDIENTE', 'no escribió nada');
  const ok = m.programar({ modo: 'montar', fila: 2, radicadoConocido: '20271110010',
    inspector: 'DANIEL PEDRAZA', fecha: '07/04/2027', hora: '9:00AM', programadaConocida: '' });
  assert.equal(ok.resultados[0].ok, true, ok.resultados[0].error);
});

test('reprogramar sin inspector usa el de la fila para el choque', opts, () => {
  const m = mundo();
  // La fila 3 es de ALEJANDRO (con tilde en el nombre) y la 9 tiene otra
  // inspección suya (DILIGENCIA con tilde) el 08/04 a las 2:00PM.
  const r = m.programar({ modo: 'reprogramar', fila: 3, radicadoConocido: '20271110011',
    fecha: '08/04/2027', hora: '2:00PM', programadaConocida: '07/04/2027 10:00AM' });
  assert.equal(r.resultados[0].ok, false);
  assert.match(r.resultados[0].error, /ALEJANDRO ya tiene una inspecci[oó]n el 08\/04\/2027 a las 2:00PM\./);
});

// ── P3-5 / P3-6: validaciones de hora y fecha ──
test('hora fuera de la lista fija → Hora inválida', opts, () => {
  const m = mundo();
  const r = m.programar({ modo: 'montar', fila: 2, radicadoConocido: '20271110010',
    inspector: 'DANIEL PEDRAZA', fecha: '08/04/2027', hora: '10:30AM', programadaConocida: '' });
  assert.equal(r.resultados[0].error, 'Hora inválida');
});

test('fecha pasada y festivo se rechazan', opts, () => {
  const m = mundo();
  const pasada = m.programar({ modo: 'montar', fila: 2, radicadoConocido: '20271110010',
    inspector: 'DANIEL PEDRAZA', fecha: '04/04/2027', hora: '8:00AM', programadaConocida: '' });
  assert.equal(pasada.resultados[0].error, 'No se puede programar en una fecha pasada');
  // 10/05/2027: Ascensión (trasladada al lunes), festivo en Colombia.
  const festivo = m.programar({ modo: 'montar', fila: 2, radicadoConocido: '20271110010',
    inspector: 'DANIEL PEDRAZA', fecha: '10/05/2027', hora: '8:00AM', programadaConocida: '' });
  assert.equal(festivo.resultados[0].error, 'Ese día no es hábil');
});

// ── P2-4: la marca de «Por programar» ──
test('dos OPERATIVO decretadas: programar una deja la marca de la otra', opts, () => {
  const m = mundo();
  const r = m.programar({ modo: 'montar', fila: 5, radicadoConocido: 'OPERATIVO',
    inspector: 'ALEJANDRO HERNANDEZ', fecha: '07/04/2027', hora: '11:00AM', programadaConocida: '' });
  assert.equal(r.resultados[0].ok, true, r.resultados[0].error);
  assert.equal(m.val(5, 'INSPECCION_DECRETADA'), '', 'la programada salió de la bandeja');
  assert.equal(m.val(6, 'INSPECCION_DECRETADA'), '04/04/2027 · VICTOR', 'la hermana V2 conserva su marca');
  assert.equal(m.val(5, 'DILIGENCIA'), 'INSPECCION AL LUGAR');
});

test('radicado real: programar una fila limpia la marca de todas las del caso', opts, () => {
  const m = mundo();
  const r = m.programar({ modo: 'montar', fila: 7, radicadoConocido: '20271110013',
    inspector: 'DANIEL PEDRAZA', fecha: '07/04/2027', hora: '8:00AM', programadaConocida: '' });
  assert.equal(r.resultados[0].ok, true, r.resultados[0].error);
  assert.equal(m.val(7, 'INSPECCION_DECRETADA'), '');
  assert.equal(m.val(8, 'INSPECCION_DECRETADA'), '');
});

test('decretarInspeccion quitar con texto V2 solo limpia su fila', opts, () => {
  const m = mundo();
  const r = m.post({ accion: 'decretarInspeccion', fila: 5, radicadoConocido: 'OPERATIVO', quitar: true, ...m.ses });
  assert.equal(r.ok, true, r.error);
  assert.equal(m.val(5, 'INSPECCION_DECRETADA'), '');
  assert.equal(m.val(6, 'INSPECCION_DECRETADA'), '04/04/2027 · VICTOR');
});

// ── P3-10: idempotencia por requestId (dedup genérico de doPost) ──
test('un reintento con el mismo requestId devuelve el resultado guardado sin reescribir', opts, () => {
  const m = mundo();
  const item = { modo: 'montar', fila: 5, radicadoConocido: 'OPERATIVO',
    inspector: 'ALEJANDRO HERNANDEZ', fecha: '07/04/2027', hora: '11:00AM', programadaConocida: '' };
  const r1 = m.programar(item, { requestId: 'R-INSP-1' });
  assert.equal(r1.ok, true, r1.error);
  const marca = m.val(5, 'INSPECCION_DECRETADA');
  const r2 = m.programar(item, { requestId: 'R-INSP-1' });
  assert.equal(r2.deduplicado, true);
  assert.equal(m.val(5, 'INSPECCION_DECRETADA'), marca);
});
