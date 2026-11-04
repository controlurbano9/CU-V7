// ═══════════════════════════════════════════════════════════════
// tests/audiencias-backend.test.js — acciones de Audiencias en el backend
// (apps_script_unificado.js, [SEC:Audiencias]), de punta a punta.
//
// Corre el doPost real contra hojas falsas en memoria (USUARIOS, AUDIENCIAS,
// NOVEDADES_AGENDA, BD VISITAS…), con «hoy» fijo en el lunes 05/04/2027 a las
// 10:00. Cubre lo agregado el 2026-11-04: no liberar una audiencia pasada,
// reprogramar, ids sin choque, texto plano en las celdas de fecha, la caché
// de agendaAudiencias, las citaciones pegadas en el Excel y apartar sin lock.
//
// Como las demás pruebas del backend, se salta si apps_script_unificado.js no
// está junto a la carpeta del repo.
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

// ── Hoja falsa: lo que usa [SEC:Audiencias] de SpreadsheetApp ──
function hoja(filas) {
  const s = {
    _v: filas.map(r => r.slice()),
    _fmt: {},            // 'fila,col' → formato puesto con setNumberFormat
    lecturas: 0,         // getValues/getDisplayValues de filas de datos
    escrituras: 0,       // setValue/setValues
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
        getValues() { if (r > 1) s.lecturas++; return celdas(); },
        getDisplayValues() {
          if (r > 1) s.lecturas++;
          return celdas().map(row => row.map(v => v instanceof Date
            ? dos(v.getDate()) + '/' + dos(v.getMonth() + 1) + '/' + v.getFullYear() : String(v)));
        },
        getValue() { return celdas()[0][0]; },
        getDisplayValue() { return String(celdas()[0][0]); },
        setValue(v) { s.escrituras++; poner(0, 0, v); return rango; },
        setValues(m) { s.escrituras++; m.forEach((row, i) => row.forEach((v, j) => poner(i, j, v))); return rango; },
        setNumberFormat(f) {
          for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) s._fmt[(r + i) + ',' + (c + j)] = f;
          return rango;
        },
        setFontWeight() { return rango; },
        // Lo usa _filasDeIdVisita: celdas iguales al texto, con su fila.
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
    appendRow(row) { s.escrituras++; s._v.push(row.slice()); },
    deleteRow(r) { s.escrituras++; s._v.splice(r - 1, 1); },
    setFrozenRows() {},
  };
  return s;
}

const AUD = ['ID_CUPO', 'FECHA', 'DIA', 'HORA', 'SUSTANCIADOR', 'FILA_EXCEL',
  'ESTADO', 'RADICADO', 'ORDEN_POLICIA', 'ID_VISITA', 'EXPEDIENTE', 'CITADO',
  'RESERVADO_POR', 'RESERVADO_EN', 'MOTIVO', 'CUPO_ANTERIOR',
  'DOCUMENTO_CITADO', 'APARTADO_PARA', 'APARTADO_EN'];
const BD = ['RADICADO', 'ID_VISITA', 'ESTADO VISITA', 'DIRECCION', 'N° ORDEN DE POLICIA', 'FECHA CITACION'];

function filaCupo(o) { return AUD.map(h => (o[h] == null ? '' : o[h])); }

// Mundo nuevo por prueba. «Hoy» = lunes 05/04/2027 10:00 (dentro del vm).
// Cupos: 01/04 (pasado, citado), 06/04 (a menos de 3 días hábiles), 12, 13 y
// 14/04 libres con dos sustanciadores, y la cita del 12/04 9:00 con VICTOR.
function mundo(extraCupos) {
  const cupos = [
    { ID_CUPO: '20270401-0900-VICTOR', FECHA: '01/04/2027', HORA: '9:00AM', SUSTANCIADOR: 'VICTOR QUIROZ',
      ESTADO: 'RESERVADO', RADICADO: '20271110001', ID_VISITA: 'V-1', RESERVADO_POR: 'MAURICIO HERRERA',
      RESERVADO_EN: '25/03/2027 08:10' },
    { ID_CUPO: '20270406-0900-VICTOR', FECHA: '06/04/2027', HORA: '9:00AM', SUSTANCIADOR: 'VICTOR QUIROZ' },
    { ID_CUPO: '20270412-0900-VICTOR', FECHA: '12/04/2027', HORA: '9:00AM', SUSTANCIADOR: 'VICTOR QUIROZ',
      ESTADO: 'RESERVADO', RADICADO: '20271110002', ID_VISITA: 'V-2', RESERVADO_POR: 'MAURICIO HERRERA',
      RESERVADO_EN: '29/03/2027 11:40', CITADO: 'Carlos Ramírez' },
    { ID_CUPO: '20270412-0900-PATRICIA', FECHA: '12/04/2027', HORA: '9:00AM', SUSTANCIADOR: 'PATRICIA LOPEZ' },
    { ID_CUPO: '20270413-0900-VICTOR', FECHA: '13/04/2027', HORA: '9:00AM', SUSTANCIADOR: 'VICTOR QUIROZ' },
    { ID_CUPO: '20270413-0900-PATRICIA', FECHA: '13/04/2027', HORA: '9:00AM', SUSTANCIADOR: 'PATRICIA LOPEZ' },
    { ID_CUPO: '20270414-0900-VICTOR', FECHA: '14/04/2027', HORA: '9:00AM', SUSTANCIADOR: 'VICTOR QUIROZ' },
    { ID_CUPO: '20270414-0900-PATRICIA', FECHA: '14/04/2027', HORA: '9:00AM', SUSTANCIADOR: 'PATRICIA LOPEZ' },
    { ID_CUPO: '20270415-0900-VICTOR', FECHA: '15/04/2027', HORA: '9:00AM', SUSTANCIADOR: 'VICTOR QUIROZ' },
    { ID_CUPO: '20270419-0900-VICTOR', FECHA: '19/04/2027', HORA: '9:00AM', SUSTANCIADOR: 'VICTOR QUIROZ' },
    { ID_CUPO: '20270420-0900-VICTOR', FECHA: '20/04/2027', HORA: '9:00AM', SUSTANCIADOR: 'VICTOR QUIROZ' },
  ].concat(extraCupos || []);
  const hojas = {
    USUARIOS: hoja([
      ['NOMBRE', 'HASH', 'ACTIVO', 'CARGO', 'ROL'],
      ['DANIEL PEDRAZA', sha('4826'), 'SI', 'Profesional', 'ADMIN'],
      ['MAURICIO HERRERA', sha('7391'), 'SI', 'Contratista', 'INSPECTOR'],
      ['PATRICIA LOPEZ', sha('2468'), 'SI', 'Sustanciadora', 'SUPERVISOR'],
    ]),
    LOG_AUDITORIA: hoja([['FECHA', 'USUARIO', 'ACCION']]),
    AUDIENCIAS: hoja([AUD].concat(cupos.map(filaCupo))),
    'BD VISITAS': hoja([
      BD,
      ['20271110001', 'V-1', 'COMPLETADO', 'CL 50 # 32-10', '', '01/04/2027 · 9:00 AM'],
      ['20271110002', 'V-2', 'COMPLETADO', 'CR 48 # 63-21', '', '12/04/2027 · 9:00 AM'],
      ['20271110003', 'V-3', 'INICIADO', 'CL 45 # 75A-12', '', ''],
    ]),
  };
  const ss = {
    getSheetByName: (n) => hojas[n] || null,
    insertSheet: (n) => (hojas[n] = hoja([])),
  };
  const cache = new Map();
  let locks = 0;
  const ctx = vm.createContext({
    SpreadsheetApp: { openById: () => ss },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (a, t) => Array.from(crypto.createHash(a).update(t, 'utf8').digest())
        .map(b => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(bytes.map(b => (b < 0 ? b + 256 : b))).toString('base64'),
      getUuid: () => crypto.randomUUID(),
      // Patrones que usa el backend: dd/MM/yyyy, yyyy-MM-dd, yyyyMMdd, HH:mm.
      formatDate: (d, _tz, p) => String(p)
        .replace('yyyy', d.getFullYear()).replace('MM', dos(d.getMonth() + 1))
        .replace('dd', dos(d.getDate())).replace('HH', dos(d.getHours())).replace('mm', dos(d.getMinutes())),
    },
    CacheService: { getScriptCache: () => ({
      get: k => (cache.has(k) ? cache.get(k) : null),
      put: (k, v) => cache.set(k, String(v)),
      remove: k => cache.delete(k),
      getAll: ks => { const o = {}; ks.forEach(k => { if (cache.has(k)) o[k] = cache.get(k); }); return o; },
      putAll: o => Object.keys(o).forEach(k => cache.set(k, String(o[k]))),
      removeAll: ks => ks.forEach(k => cache.delete(k)),
    }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { locks++; return true; }, waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => ({ s }) }) },
    Logger: { log() {} },
    console,
  });
  // «Hoy» fijo: new Date() sin argumentos y Date.now() dan el 05/04/2027 10:00.
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
  const ses = {
    admin: { sesionUsuario: 'DANIEL PEDRAZA', sesionHash: sha('4826') },
    insp: { sesionUsuario: 'MAURICIO HERRERA', sesionHash: sha('7391') },
    sup: { sesionUsuario: 'PATRICIA LOPEZ', sesionHash: sha('2468') },
  };
  const aud = hojas.AUDIENCIAS;
  const col = (h) => AUD.indexOf(h);
  const cupo = (id) => {
    const r = aud._v.findIndex((f, i) => i > 0 && f[0] === id);
    if (r < 0) return null;
    const o = { _fila: r + 1 };
    AUD.forEach((h, j) => { o[h] = aud._v[r][j] == null ? '' : aud._v[r][j]; });
    return o;
  };
  const citacion = (idVisita) => {
    const bd = hojas['BD VISITAS'];
    const f = bd._v.find(r => r[1] === idVisita);
    return f ? f[BD.indexOf('FECHA CITACION')] : null;
  };
  return { hojas, post, ses, aud, col, cupo, citacion, cache, locks: () => locks };
}

// ── Liberar ──
test('liberar: una audiencia pasada no se libera y la visita conserva su fecha', opts, () => {
  const m = mundo();
  const r = m.post({ accion: 'liberarCupo', idCupo: '20270401-0900-VICTOR', ...m.ses.admin });
  assert.equal(r.ok, false);
  assert.match(r.error, /ya pasó/);
  assert.equal(m.cupo('20270401-0900-VICTOR').ESTADO, 'RESERVADO');
  assert.equal(m.citacion('V-1'), '01/04/2027 · 9:00 AM');
});

test('liberar: una futura queda libre y la visita sin fecha de citación', opts, () => {
  const m = mundo();
  const r = m.post({ accion: 'liberarCupo', idCupo: '20270412-0900-VICTOR', ...m.ses.admin });
  assert.equal(r.ok, true, r.error);
  assert.equal(m.cupo('20270412-0900-VICTOR').ESTADO, '');
  assert.equal(m.citacion('V-2'), '');
});

// ── Reprogramar ──
test('reprogramar: pasa la cita al cupo nuevo bajo un solo paso', opts, () => {
  const m = mundo();
  const r = m.post({ accion: 'reprogramarCupo', idCupo: '20270412-0900-VICTOR',
    idCupoNuevo: '20270413-0900-PATRICIA', motivo: 'Vacaciones de Víctor', ...m.ses.admin });
  assert.equal(r.ok, true, r.error);
  const nuevo = m.cupo('20270413-0900-PATRICIA');
  assert.equal(nuevo.ESTADO, 'RESERVADO');
  assert.equal(nuevo.RADICADO, '20271110002');
  assert.equal(nuevo.ID_VISITA, 'V-2');
  assert.equal(nuevo.CITADO, 'Carlos Ramírez');
  assert.equal(nuevo.CUPO_ANTERIOR, '20270412-0900-VICTOR');
  // Quien la pidió y cuándo no cambian.
  assert.equal(nuevo.RESERVADO_POR, 'MAURICIO HERRERA');
  assert.equal(nuevo.RESERVADO_EN, '29/03/2027 11:40');
  assert.match(nuevo.MOTIVO, /^Reprogramada por DANIEL PEDRAZA el 05\/04\/2027 10:00: Vacaciones de Víctor$/);
  const viejo = m.cupo('20270412-0900-VICTOR');
  assert.equal(viejo.ESTADO, '');
  assert.equal(viejo.RADICADO, '');
  assert.equal(m.citacion('V-2'), '13/04/2027 · 9:00 AM');
  // La agenda lo muestra con su nota.
  const a = m.post({ accion: 'agendaAudiencias', ...m.ses.admin });
  const enAgenda = a.cupos.find(c => c.idCupo === '20270413-0900-PATRICIA');
  assert.equal(enAgenda.estado, 'RESERVADO');
  assert.equal(enAgenda.cupoAnterior, '20270412-0900-VICTOR');
  assert.match(enAgenda.nota, /Reprogramada/);
});

test('reprogramar: repetir la misma llamada no falla ni duplica', opts, () => {
  const m = mundo();
  const p = { accion: 'reprogramarCupo', idCupo: '20270412-0900-VICTOR', idCupoNuevo: '20270413-0900-PATRICIA', ...m.ses.admin };
  assert.equal(m.post(p).ok, true);
  const r2 = m.post(p);
  assert.equal(r2.ok, true, r2.error);
  assert.equal(r2.yaHecho, true);
  assert.equal(m.aud._v.filter(f => f[m.col('RADICADO')] === '20271110002').length, 1);
});

test('reprogramar: solo el admin; ni a un cupo a menos de 3 días hábiles, ni una pasada, ni a uno ocupado', opts, () => {
  const m = mundo();
  const base = { accion: 'reprogramarCupo', idCupo: '20270412-0900-VICTOR' };
  const insp = m.post({ ...base, idCupoNuevo: '20270413-0900-PATRICIA', ...m.ses.insp });
  assert.equal(insp.ok, false);
  assert.match(insp.error, /Acceso restringido/);
  const pronto = m.post({ ...base, idCupoNuevo: '20270406-0900-VICTOR', ...m.ses.admin });
  assert.equal(pronto.ok, false);
  assert.match(pronto.error, /3 días hábiles/);
  const pasada = m.post({ accion: 'reprogramarCupo', idCupo: '20270401-0900-VICTOR',
    idCupoNuevo: '20270413-0900-PATRICIA', ...m.ses.admin });
  assert.equal(pasada.ok, false);
  assert.match(pasada.error, /ya pasó/);
  const mismo = m.post({ ...base, idCupoNuevo: '20270412-0900-VICTOR', ...m.ses.admin });
  assert.equal(mismo.ok, false);
  // Nada cambió.
  assert.equal(m.cupo('20270412-0900-VICTOR').ESTADO, 'RESERVADO');
  assert.equal(m.cupo('20270413-0900-PATRICIA').ESTADO, '');
});

// ── Agregar cupos: ids sin choque ──
test('agregar: dos sustanciadores con el mismo primer nombre no comparten id', opts, () => {
  const m = mundo();
  const r = m.post({ accion: 'agregarCupos', cupos: [
    { fecha: '21/04/2027', hora: '9:00AM', sustanciador: 'JUAN PEREZ' },
    { fecha: '21/04/2027', hora: '9:00AM', sustanciador: 'JUAN GOMEZ' },
    { fecha: '21/04/2027', hora: '9:00AM', sustanciador: 'JUAN' },
  ], ...m.ses.admin });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.creados.map(c => c.idCupo),
    ['20270421-0900-JUAN', '20270421-0900-JUAN-GOMEZ', '20270421-0900-JUAN-2']);
  // La fecha queda escrita como texto plano, no como fecha de Sheets.
  const fila = m.cupo('20270421-0900-JUAN')._fila;
  assert.equal(m.aud._fmt[fila + ',' + (m.col('FECHA') + 1)], '@');
  assert.equal(m.cupo('20270421-0900-JUAN').FECHA, '21/04/2027');
});

// ── Bloquear: rechazados ──
test('bloquear: un cupo por apartar se rechaza con su motivo y el libre se bloquea', opts, () => {
  const m = mundo([{ ID_CUPO: '20270422-0900-VICTOR', FECHA: '22/04/2027', HORA: '9:00AM',
    SUSTANCIADOR: 'VICTOR QUIROZ', ESTADO: 'POR_APARTAR' }]);
  const r = m.post({ accion: 'bloquearCupos', ids: ['20270414-0900-VICTOR', '20270422-0900-VICTOR'],
    motivo: '=Vacaciones', ...m.ses.admin });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.bloqueados, 1);
  assert.deepEqual(r.rechazados, [{ idCupo: '20270422-0900-VICTOR', motivo: 'Estado POR_APARTAR' }]);
  const nov = m.hojas.NOVEDADES_AGENDA;
  assert.equal(nov._v.length, 2);
  assert.equal(nov._v[1][1], '14/04/2027');
  assert.equal(nov._fmt['2,2'], '@');
  // El motivo va sanitizado (antes appendRow lo escribía tal cual).
  assert.equal(nov._v[1][5], "'=Vacaciones");
});

// ── Reservar ──
test('reservar: la hora de la reserva queda en texto plano y el «ya tiene cita» dice cuándo', opts, () => {
  const m = mundo();
  const r = m.post({ accion: 'reservarCupo', idCupo: '20270414-0900-PATRICIA', radicado: '20271110003', ...m.ses.insp });
  assert.equal(r.ok, true, r.error);
  const c = m.cupo('20270414-0900-PATRICIA');
  assert.equal(c.RESERVADO_EN, '05/04/2027 10:00');
  assert.equal(m.aud._fmt[c._fila + ',' + (m.col('RESERVADO_EN') + 1)], '@');
  const otra = m.post({ accion: 'reservarCupo', idCupo: '20270415-0900-VICTOR', radicado: '20271110003', ...m.ses.insp });
  assert.equal(otra.ok, false);
  assert.equal(otra.motivo, 'yaCitado');
  assert.match(otra.error, /14\/04\/2027 a las 9:00 AM con PATRICIA LOPEZ/);
});

// ── Caché de agendaAudiencias ──
test('agenda: la segunda lectura sale de la caché y una escritura la renueva', opts, () => {
  const m = mundo();
  const bd = m.hojas['BD VISITAS'];
  const a1 = m.post({ accion: 'agendaAudiencias', incluirPasadas: true, ...m.ses.insp });
  assert.equal(a1.ok, true, a1.error);
  const lecturas = bd.lecturas;
  const a2 = m.post({ accion: 'agendaAudiencias', incluirPasadas: true, firma: a1.firma, ...m.ses.insp });
  assert.equal(a2.sinCambios, true);
  assert.equal(bd.lecturas, lecturas, 'sin cambios no vuelve a leer BD VISITAS');
  assert.equal(m.post({ accion: 'reservarCupo', idCupo: '20270414-0900-PATRICIA', radicado: '20271110003', ...m.ses.insp }).ok, true);
  const a3 = m.post({ accion: 'agendaAudiencias', incluirPasadas: true, firma: a1.firma, ...m.ses.insp });
  assert.notEqual(a3.sinCambios, true);
  assert.ok(bd.lecturas > lecturas, 'tras escribir vuelve a armarla');
  assert.equal(a3.cupos.find(c => c.idCupo === '20270414-0900-PATRICIA').estado, 'RESERVADO');
  // El admin y el inspector no comparten la entrada (el admin recibe completadas).
  const adm = m.post({ accion: 'agendaAudiencias', incluirPasadas: true, ...m.ses.admin });
  assert.ok(Array.isArray(adm.completadas));
  assert.equal(a3.completadas, null);
});

test('agenda: una respuesta grande se guarda en trozos y vuelve igual', opts, () => {
  const extra = [];
  for (let i = 0; i < 400; i++) {
    extra.push({ ID_CUPO: 'X' + i, FECHA: '21/04/2027', HORA: '2:00PM', SUSTANCIADOR: 'SUSTANCIADOR ' + i });
  }
  const m = mundo(extra);
  const a1 = m.post({ accion: 'agendaAudiencias', ...m.ses.insp });
  const n = Number(Array.from(m.cache.entries()).find(([k]) => /^aud:.*:n$/.test(k))[1]);
  assert.ok(n > 1, 'más de un trozo (' + n + ')');
  const a2 = m.post({ accion: 'agendaAudiencias', ...m.ses.insp });
  assert.deepEqual(a2, a1);
});

// ── Citaciones pegadas en el Excel ──
test('pegadas: marcar, repetir sin duplicar, desmarcar; solo el admin', opts, () => {
  const m = mundo();
  const marcar = (ids, pegada, s) => m.post({ accion: 'marcarPegadasExcel', ids, pegada, ...(s || m.ses.admin) });
  assert.equal(marcar(['20270412-0900-VICTOR', 'visita-V-9']).cambios, 2);
  assert.equal(marcar(['20270412-0900-VICTOR']).cambios, 0);
  let a = m.post({ accion: 'agendaAudiencias', ...m.ses.admin });
  assert.deepEqual(Object.keys(a.pegadas).sort(), ['20270412-0900-VICTOR', 'visita-V-9']);
  assert.equal(a.pegadas['visita-V-9'].por, 'DANIEL PEDRAZA');
  assert.equal(a.pegadas['visita-V-9'].en, '05/04/2027 10:00');
  assert.equal(marcar(['visita-V-9'], false).cambios, 1);
  a = m.post({ accion: 'agendaAudiencias', ...m.ses.admin });
  assert.deepEqual(Object.keys(a.pegadas), ['20270412-0900-VICTOR']);
  const insp = marcar(['20270412-0900-VICTOR'], true, m.ses.insp);
  assert.equal(insp.ok, false);
  // El inspector no recibe las marcas.
  assert.equal(m.post({ accion: 'agendaAudiencias', ...m.ses.insp }).pegadas, null);
});

// ── Apartar sin lock ──
test('apartar: con sus 3 vigentes y nada vencido no toma el lock ni escribe', opts, () => {
  const m = mundo();
  const r1 = m.post({ accion: 'apartarCupos', ...m.ses.insp });
  assert.equal(r1.ok, true, r1.error);
  assert.equal(r1.apartados.length, 3);
  const locks = m.locks(), escrituras = m.aud.escrituras;
  const r2 = m.post({ accion: 'apartarCupos', ...m.ses.insp });
  assert.equal(r2.ok, true);
  assert.deepEqual(r2.apartados.map(c => c.idCupo).sort(), r1.apartados.map(c => c.idCupo).sort());
  assert.equal(m.locks(), locks, 'no tomó el lock');
  assert.equal(m.aud.escrituras, escrituras, 'no escribió');
});

// ── Acciones quitadas ──
test('listaDiariaExcel y listarNovedades ya no existen (agendaAudiencias trae las dos cosas)', opts, () => {
  const m = mundo();
  assert.match(m.post({ accion: 'listaDiariaExcel', ...m.ses.admin }).error, /no reconocida/);
  assert.match(m.post({ accion: 'listarNovedades', ...m.ses.admin }).error, /no reconocida/);
});
