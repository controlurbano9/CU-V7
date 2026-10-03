// ═══════════════════════════════════════════════════════════════
// tests/admin-fase2-backend.test.js — Administración fase 2 en el backend
// (apps_script_unificado.js, [SEC:AdminFase2] + router).
//
// Corre el doPost real contra una hoja USUARIOS falsa en memoria. Cubre lo
// que no se puede romper sin abrir una cuenta ajena: que resetPin/toggleActivo
// exijan ADMIN (antes cualquier sesión fijaba el PIN de otro), y el ciclo del
// PIN temporal (generar → entrar → solo puede cambiarlo → PIN propio).
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

function hoja(filas) {
  const s = {
    _v: filas,
    getLastRow() { return s._v.length; },
    getLastColumn() { return Math.max(...s._v.map(r => r.length)); },
    getDataRange() {
      return { getValues() {
        const w = s.getLastColumn();
        return s._v.map(r => { const c = r.slice(); while (c.length < w) c.push(''); return c; });
      } };
    },
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = [];
            for (let j = 0; j < nc; j++) { const v = (s._v[r - 1 + i] || [])[c - 1 + j]; row.push(v == null ? '' : v); }
            out.push(row);
          }
          return out;
        },
        getValue() { const v = (s._v[r - 1] || [])[c - 1]; return v == null ? '' : v; },
        setValue(v) {
          while (s._v.length < r) s._v.push([]);
          const row = s._v[r - 1];
          while (row.length < c) row.push('');
          row[c - 1] = v;
          return this;
        },
      };
    },
    appendRow(r) { s._v.push(r.slice()); },
    setFrozenRows() {},
    protect() { return { setDescription() {} }; },
  };
  return s;
}

// Mundo nuevo por prueba: USUARIOS con un admin y dos inspectores (sin pepper:
// el hash guardado es el SHA-256 del PIN, como lo manda el cliente).
function mundo() {
  const hojas = {
    USUARIOS: hoja([
      ['NOMBRE', 'HASH', 'ACTIVO', 'CARGO', 'ROL'],
      ['DANIEL PEDRAZA', sha('4826'), 'SI', 'Profesional', 'ADMIN'],
      ['MAURICIO HERRERA', sha('7391'), 'SI', 'Contratista', 'INSPECTOR'],
      ['NELSON CUERVO', sha('5062'), 'SI', 'Auxiliar', 'INSPECTOR'],
    ]),
    LOG_AUDITORIA: hoja([['FECHA', 'USUARIO', 'ACCION']]),
  };
  const ss = {
    getSheetByName: (n) => hojas[n] || null,
    insertSheet: (n) => (hojas[n] = hoja([])),
  };
  const cache = new Map();
  const ctx = vm.createContext({
    SpreadsheetApp: { openById: () => ss },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_a, t) => Array.from(crypto.createHash('sha256').update(t, 'utf8').digest())
        .map(b => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d) => d.toISOString(),
    },
    CacheService: { getScriptCache: () => ({
      get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v),
      remove: k => cache.delete(k), getAll: () => ({}), putAll() {}, removeAll() {},
    }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => ({ s }) }) },
    Logger: { log() {} },
    console,
  });
  vm.runInContext(fs.readFileSync(BACKEND, 'utf8'), ctx);
  const post = (datos) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(datos) } }).s);
  const ses = (nombre, pin) => ({ sesionUsuario: nombre, sesionHash: sha(pin) });
  return { hojas, post, ses, cache, usuarios: hojas.USUARIOS };
}

test('resetPin y toggleActivo exigen ADMIN', opts, () => {
  const m = mundo();
  const r = m.post({ accion: 'resetPin', fila: 2, hash: sha('1111'), ...m.ses('MAURICIO HERRERA', '7391') });
  assert.equal(r.ok, false);
  assert.equal(m.usuarios._v[1][1], sha('4826'), 'el PIN del admin no cambió');
  const t = m.post({ accion: 'toggleActivo', fila: 2, estado: 'NO', ...m.ses('NELSON CUERVO', '5062') });
  assert.equal(t.ok, false);
  assert.equal(m.usuarios._v[1][2], 'SI');
});

test('un admin no se desactiva a sí mismo; a otro sí', opts, () => {
  const m = mundo();
  assert.equal(m.post({ accion: 'toggleActivo', fila: 2, estado: 'NO', ...m.ses('DANIEL PEDRAZA', '4826') }).ok, false);
  assert.equal(m.post({ accion: 'toggleActivo', fila: 4, estado: 'NO', ...m.ses('DANIEL PEDRAZA', '4826') }).ok, true);
  assert.equal(m.usuarios._v[3][2], 'NO');
});

test('PIN temporal: entra, solo puede cambiarlo, y el propio reemplaza al temporal', opts, () => {
  const m = mundo();
  const admin = m.ses('DANIEL PEDRAZA', '4826');
  assert.equal(m.post({ accion: 'generarPinTemporal', fila: 3, nombreConocido: 'MAURICIO HERRERA',
    ...m.ses('NELSON CUERVO', '5062') }).ok, false, 'un inspector no genera PIN temporal');

  const g = m.post({ accion: 'generarPinTemporal', fila: 3, nombreConocido: 'MAURICIO HERRERA', ...admin });
  assert.equal(g.ok, true);
  assert.match(g.pin, /^\d{4}$/);
  assert.equal(m.post({ accion: 'login', nombre: 'MAURICIO HERRERA', hash: sha('7391') }).ok, false, 'el PIN viejo ya no sirve');

  const l = m.post({ accion: 'login', nombre: 'MAURICIO HERRERA', hash: sha(g.pin) });
  assert.equal(l.ok, true);
  assert.equal(l.debeCambiarPin, true);
  const tmp = m.ses('MAURICIO HERRERA', g.pin);
  const otra = m.post({ accion: 'leerHoja', hoja: 'BD VISITAS', ...tmp });
  assert.equal(otra.ok, false);
  assert.equal(otra.debeCambiarPin, true);

  assert.equal(m.post({ accion: 'cambiarMiPin', hashNuevo: sha('1234'), ...tmp }).ok, false, 'PIN débil');
  assert.equal(m.post({ accion: 'cambiarMiPin', hashNuevo: sha(g.pin), ...tmp }).ok, false, 'igual al actual');
  assert.equal(m.post({ accion: 'cambiarMiPin', hashNuevo: sha('8604'), ...tmp }).ok, true);

  assert.equal(m.post({ accion: 'login', nombre: 'MAURICIO HERRERA', hash: sha(g.pin) }).ok, false, 'el temporal murió');
  const l2 = m.post({ accion: 'login', nombre: 'MAURICIO HERRERA', hash: sha('8604') });
  assert.equal(l2.ok, true);
  assert.equal(l2.debeCambiarPin, false);
  const log = m.hojas.LOG_AUDITORIA._v.map(r => r[2]).join('\n');
  assert.match(log, /PIN temporal generado para: MAURICIO HERRERA/);
  assert.doesNotMatch(log, new RegExp(g.pin), 'el PIN nunca va al log');
});

test('PIN temporal vencido: el login lo dice y no suma intento', opts, () => {
  const m = mundo();
  const g = m.post({ accion: 'generarPinTemporal', fila: 4, nombreConocido: 'NELSON CUERVO', ...m.ses('DANIEL PEDRAZA', '4826') });
  const cab = m.usuarios._v[0];
  m.usuarios._v[3][cab.indexOf('PIN_TEMPORAL_VENCE')] = Date.now() - 1000;
  const l = m.post({ accion: 'login', nombre: 'NELSON CUERVO', hash: sha(g.pin) });
  assert.equal(l.ok, false);
  assert.match(l.error, /venció/);
  assert.equal(m.cache.get('cu_login_intentos_NELSON CUERVO'), undefined);
});

test('cambiarMiPin sin PIN temporal exige el PIN actual', opts, () => {
  const m = mundo();
  const s = m.ses('NELSON CUERVO', '5062');
  assert.equal(m.post({ accion: 'cambiarMiPin', hashNuevo: sha('9137'), ...s }).ok, false);
  assert.equal(m.post({ accion: 'cambiarMiPin', hashNuevo: sha('9137'), hashActual: sha('5062'), ...s }).ok, true);
});

test('cambiarRol: solo ADMIN, nunca el propio, con el nombre que vio el cliente', opts, () => {
  const m = mundo();
  const admin = m.ses('DANIEL PEDRAZA', '4826');
  assert.equal(m.post({ accion: 'cambiarRol', fila: 4, nombreConocido: 'NELSON CUERVO', rol: 'SUPERVISOR',
    ...m.ses('MAURICIO HERRERA', '7391') }).ok, false);
  assert.equal(m.post({ accion: 'cambiarRol', fila: 2, nombreConocido: 'DANIEL PEDRAZA', rol: 'INSPECTOR', ...admin }).ok, false);
  assert.equal(m.post({ accion: 'cambiarRol', fila: 4, nombreConocido: 'NELSON CUERVO', rol: 'JEFE', ...admin }).ok, false);
  assert.equal(m.post({ accion: 'cambiarRol', fila: 4, nombreConocido: 'MAURICIO HERRERA', rol: 'SUPERVISOR', ...admin }).ok, false,
    'la fila ya no es de quien el cliente creía');
  assert.equal(m.post({ accion: 'cambiarRol', fila: 4, nombreConocido: 'NELSON CUERVO', rol: 'SUPERVISOR', ...admin }).ok, true);
  assert.equal(m.usuarios._v[3][4], 'SUPERVISOR');
});

test('log: el usuario sale de la sesión, no de lo que declara el cliente', opts, () => {
  const m = mundo();
  m.post({ accion: 'log', usuario: 'DANIEL PEDRAZA', accion_texto: 'Login V6', ...m.ses('NELSON CUERVO', '5062') });
  const ultima = m.hojas.LOG_AUDITORIA._v.slice(-1)[0];
  assert.equal(ultima[1], 'NELSON CUERVO');
});

test('Bandeja: hallazgos pendientes y marcarlos revisados con el radicado que vio el admin', opts, () => {
  const m = mundo();
  m.hojas.HALLAZGOS_PENDIENTES_REVISION = hoja([
    ['FECHA', 'RADICADO', 'FILA', 'INSPECTOR', 'OBSERVACIONES', 'CONCLUSIONES_GENERADAS', 'RECOMENDACIONES_GENERADAS', 'ESTADO_REVISION'],
    ['01/10/2026', 20261090010, 12, 'MAURICIO', 'Muro sin licencia', '', '', 'PENDIENTE'],
    ['02/10/2026', '20261090011', 13, 'NELSON', 'Ya visto', '', '', 'REVISADO'],
  ]);
  const admin = m.ses('DANIEL PEDRAZA', '4826');
  assert.equal(m.post({ accion: 'leerPendientesAdmin', ...m.ses('NELSON CUERVO', '5062') }).ok, false);
  const r = m.post({ accion: 'leerPendientesAdmin', ...admin });
  assert.equal(r.ok, true);
  assert.equal(r.hallazgos.length, 1);
  assert.equal(r.hallazgos[0]._filaHoja, 2);
  assert.equal(m.post({ accion: 'marcarHallazgoRevisado', filaHoja: 2, radicado: '20261090011', estado: 'REVISADO', ...admin }).ok, false,
    'otro radicado en esa fila');
  assert.equal(m.post({ accion: 'marcarHallazgoRevisado', filaHoja: 2, radicado: '20261090010', estado: 'REVISADO', ...admin }).ok, true);
  assert.equal(m.hojas.HALLAZGOS_PENDIENTES_REVISION._v[1][7], 'REVISADO');
});

test('leerLogAuditoria con limite: encabezado + las últimas N filas', opts, () => {
  const m = mundo();
  for (let i = 1; i <= 30; i++) m.hojas.LOG_AUDITORIA.appendRow(['01/10/2026 08:00', 'NELSON CUERVO', 'acción ' + i]);
  const r = m.post({ accion: 'leerLogAuditoria', usuario: 'DANIEL PEDRAZA', hash: sha('4826'), limite: 5, ...m.ses('DANIEL PEDRAZA', '4826') });
  assert.equal(r.ok, true);
  assert.equal(r.values.length, 6);
  assert.equal(r.values[0][2], 'ACCION');
  assert.equal(r.values[5][2], 'acción 30');
  assert.equal(r.total, 30);
});
