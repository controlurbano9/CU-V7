// ═══════════════════════════════════════════════════════════════
// tests/reporte-evidencias.test.js — Administración › Evidencias
// (2026-11-04). utils.js → qué visitas del mes pueden ir al reporte y cuáles
// se sugieren; apps_script_unificado.js ([SEC:ReporteEvidencias]) → la
// acción generarReporteEvidencias contra una BD y un Drive en memoria.
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
const U = require('../utils.js');

// ── utils.js ───────────────────────────────────────────────────
let _n = 0;
function visita(extra) {
  _n++;
  return Object.assign({
    _idx: _n + 1, ID_VISITA: 'V' + _n, RADICADO: 'R-' + _n,
    'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '15/10/2026',
    'DIRECCION INFRACCION': 'CL ' + _n + ' # 10-20', COMUNA: String((_n % 5) + 1),
    'VISITADOR(ES)': 'INSPECTOR ' + _n,
    'SUSPENSION DE LA OBRA': 'NO', 'N° ORDEN DE POLICIA': '',
    LINK_PDF_ACTA: 'https://drive.google.com/file/d/acta' + _n + 'xxxxxxxx/view',
    LINK_REGISTRO_FOTOS: 'https://docs.google.com/document/d/rf' + _n + 'xxxxxxxx/edit',
  }, extra);
}
const conSusp = (extra) => visita(Object.assign({ 'SUSPENSION DE LA OBRA': 'SI', 'N° ORDEN DE POLICIA': 'OP-' + (_n + 1) }, extra));

test('mes por defecto: el anterior (enero → diciembre del año pasado)', () => {
  assert.equal(U.mesPorDefectoEvidencias(new Date(2026, 10, 4)), '2026-10');
  assert.equal(U.mesPorDefectoEvidencias(new Date(2026, 0, 5)), '2025-12');
  assert.equal(U.nombreMesEvidencias('2026-10'), 'Octubre 2026');
  assert.deepEqual(U.mesesRecientesEvidencias(new Date(2026, 1, 10), 3), ['2026-02', '2026-01', '2025-12']);
});

test('solo completadas con fecha de visita del mes; sin acta o RF no pueden ir', () => {
  const vs = [
    visita({ RADICADO: 'OK' }),
    visita({ RADICADO: 'INICIADA', 'ESTADO VISITA': 'INICIADO' }),
    visita({ RADICADO: 'NOVIEMBRE', 'FECHA DE VISITA': '01/11/2026' }),
    visita({ RADICADO: 'SIN-ACTA', LINK_PDF_ACTA: '' }),
    visita({ RADICADO: 'SIN-RF', LINK_REGISTRO_FOTOS: '' }),
    visita({ RADICADO: 'SOLO-XLSX', LINK_PDF_ACTA: '', LINK_XLSX_ACTA: 'https://docs.google.com/spreadsheets/d/abcdefghijk/edit' }),
  ];
  const c = U.candidatasEvidencias(vs, '2026-10', [], 4);
  assert.deepEqual(c.elegibles.map(e => e.rad).sort(), ['OK', 'SOLO-XLSX']);
  assert.deepEqual(c.noElegibles.map(e => e.rad).sort(), ['SIN-ACTA', 'SIN-RF']);
  assert.deepEqual(c.noElegibles.find(e => e.rad === 'SIN-RF').faltas, ['Registro fotográfico']);
});

test('la suspensión con orden manda; si faltan, se completa con otras', () => {
  const vs = [visita({ RADICADO: 'NADA-1' }), conSusp({ RADICADO: 'SUSP-1' }),
    visita({ RADICADO: 'ORDEN', 'N° ORDEN DE POLICIA': 'OP-9' }),
    conSusp({ RADICADO: 'SUSP-2' }), visita({ RADICADO: 'NADA-2' }),
    visita({ RADICADO: 'SUSP-SIN-ORDEN', 'SUSPENSION DE LA OBRA': 'SI' })];
  const c = U.candidatasEvidencias(vs, '2026-10', [], 4);
  const rad = c.sugeridas.map(k => c.elegibles.find(e => e.clave === k).rad);
  assert.deepEqual(rad.slice(0, 2).sort(), ['SUSP-1', 'SUSP-2']);
  assert.equal(rad[2], 'SUSP-SIN-ORDEN');
  assert.equal(rad[3], 'ORDEN');
  assert.equal(c.conSuspension, 3);
});

test('dentro del mismo nivel prefiere otro inspector y otra dirección', () => {
  const ins = { 'VISITADOR(ES)': 'MAURICIO HERRERA / NELSON CUERVO', COMUNA: '3' };
  const vs = [
    conSusp(Object.assign({ RADICADO: 'M1', 'FECHA DE VISITA': '20/10/2026', 'DIRECCION INFRACCION': 'CL 50 # 40-10' }, ins)),
    conSusp(Object.assign({ RADICADO: 'M2', 'FECHA DE VISITA': '21/10/2026', 'DIRECCION INFRACCION': 'CL 51 # 40-10' }, ins)),
    conSusp({ RADICADO: 'MISMA-DIR', 'FECHA DE VISITA': '22/10/2026', 'DIRECCION INFRACCION': 'Calle 51 # 40 - 10', 'VISITADOR(ES)': 'OTRO', COMUNA: '9' }),
    conSusp({ RADICADO: 'OTRO', 'FECHA DE VISITA': '02/10/2026', 'VISITADOR(ES)': 'ANDREA', COMUNA: '7' }),
  ];
  const c = U.candidatasEvidencias(vs, '2026-10', [], 2);
  const rad = c.sugeridas.map(k => c.elegibles.find(e => e.clave === k).rad);
  // La más reciente primero; la segunda no repite inspector ni dirección.
  assert.equal(rad[0], 'MISMA-DIR');
  assert.equal(rad[1], 'M1');
});

test('una dirección ya reportada en otro mes baja y lo dice', () => {
  const vs = [conSusp({ RADICADO: 'REPETIDA', 'DIRECCION INFRACCION': 'CR 50 # 20-30' }), conSusp({ RADICADO: 'NUEVA' })];
  const hist = [{ MES: '2026-09', DIRECCION: 'CARRERA 50 # 20 - 30', RADICADO: 'X' }];
  const c = U.candidatasEvidencias(vs, '2026-10', hist, 1);
  assert.equal(c.elegibles.find(e => e.clave === c.sugeridas[0]).rad, 'NUEVA');
  assert.ok(c.elegibles.find(e => e.rad === 'REPETIDA').motivos.includes('Dirección ya reportada en Septiembre 2026'));
});

test('historial agrupado por mes, el más reciente primero y en orden', () => {
  const g = U.historialEvidenciasPorMes([
    { MES: '2026-09', ORDEN: '2', RADICADO: 'B', FECHA_GENERACION: '01/10/2026 09:00' },
    { MES: '2026-10', ORDEN: '1', RADICADO: 'C', LINK_CARPETA_MES: 'L' },
    { MES: '2026-09', ORDEN: '1', RADICADO: 'A' },
  ]);
  assert.deepEqual(g.map(x => x.mes), ['2026-10', '2026-09']);
  assert.deepEqual(g[1].visitas.map(v => v.RADICADO), ['A', 'B']);
  assert.equal(g[0].linkCarpeta, 'L');
});

// ── Backend ────────────────────────────────────────────────────
const BACKEND = path.join(__dirname, '..', '..', 'apps_script_unificado.js');
const hay = fs.existsSync(BACKEND);
const opts = { skip: hay ? false : 'apps_script_unificado.js no está en esta copia' };
const sha = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');

function hoja(filas) {
  const s = {
    _v: filas,
    getLastRow() { return s._v.length; },
    getLastColumn() { return Math.max(1, ...s._v.map(r => r.length)); },
    getDataRange() { return s.getRange(1, 1, s._v.length, s.getLastColumn()); },
    getRange(r, c, nr = 1, nc = 1) {
      const leer = () => {
        const out = [];
        for (let i = 0; i < nr; i++) {
          const row = [];
          for (let j = 0; j < nc; j++) { const v = (s._v[r - 1 + i] || [])[c - 1 + j]; row.push(v == null ? '' : v); }
          out.push(row);
        }
        return out;
      };
      const rango = {
        getValues: leer,
        getDisplayValues: () => leer().map(row => row.map(v => String(v))),
        getValue() { return leer()[0][0]; },
        setValue(v) { return rango.setValues([[v]]); },
        setValues(vals) {
          vals.forEach((row, i) => {
            while (s._v.length < r + i) s._v.push([]);
            const fila = s._v[r - 1 + i];
            row.forEach((v, j) => { while (fila.length < c + j) fila.push(''); fila[c - 1 + j] = v; });
          });
          return rango;
        },
        setNumberFormat() { return rango; },
      };
      return rango;
    },
    appendRow(r) { s._v.push(r.slice()); },
    deleteRow(n) { s._v.splice(n - 1, 1); },
    setFrozenRows() {},
    protect() { return { setDescription() {} }; },
  };
  return s;
}

const MIME = { PDF: 'application/pdf', GOOGLE_DOCS: 'application/vnd.google-apps.document',
  GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet' };

function drive() {
  const items = {};
  let sec = 0;
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  function archivo(nombre, mime, padre) {
    const id = 'file' + (++sec) + 'xxxxxxxxxx';
    const f = {
      id, nombre, mime, padre, trashed: false,
      getId: () => id, getName: () => f.nombre, getMimeType: () => f.mime,
      getUrl: () => 'https://drive.google.com/file/d/' + id + '/view',
      makeCopy(n, destino) { return archivo(n, f.mime, destino); },
      getAs(m) { const b = { nombre: f.nombre, mime: m, setName(n) { b.nombre = n; return b; } }; return b; },
      setTrashed(t) { f.trashed = t; }, setSharing() {},
    };
    items[id] = f;
    return f;
  }
  function carpeta(nombre, padre) {
    const id = 'fold' + (++sec) + 'xxxxxxxxxx';
    const c = {
      id, nombre, padre, trashed: false, sharing: null,
      getId: () => id, getName: () => c.nombre,
      hijos: () => Object.values(items).filter(x => x.padre === c && !x.trashed),
      getFolders: () => iter(c.hijos().filter(x => x.esCarpeta)),
      getFiles: () => iter(c.hijos().filter(x => !x.esCarpeta)),
      getFoldersByName: (n) => iter(c.hijos().filter(x => x.esCarpeta && x.nombre === n)),
      getFilesByName: (n) => iter(c.hijos().filter(x => !x.esCarpeta && x.nombre === n)),
      createFolder: (n) => carpeta(n, c),
      createFile: (blob) => archivo(blob.nombre, blob.mime, c),
      setSharing(a, p) { c.sharing = a + '/' + p; },
      setTrashed(t) { c.trashed = t; },
      esCarpeta: true,
    };
    items[id] = c;
    return c;
  }
  const raiz = carpeta('INSPECCIONES', null);
  return {
    items, raiz, archivo, carpeta,
    api: {
      getFolderById: (id) => { if (!items[id] || !items[id].esCarpeta) throw new Error('no existe ' + id); return items[id]; },
      getFileById: (id) => { if (!items[id] || items[id].esCarpeta) throw new Error('no existe ' + id); return items[id]; },
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
    },
  };
}

const ENC_BD = ['RADICADO', 'ESTADO VISITA', 'FECHA DE VISITA', 'DIRECCION INFRACCION', 'VISITADOR(ES)',
  'SUSPENSION DE LA OBRA', 'N° ORDEN DE POLICIA', 'LINK_DRIVE', 'LINK_PDF_ACTA', 'LINK_XLSX_ACTA',
  'LINK_REGISTRO_FOTOS', 'ID_VISITA'];

function mundo() {
  const d = drive();
  const visitaDrive = d.carpeta('Visita 1_15-10-2026', d.raiz);
  const fila = (rad, extra) => {
    const acta = d.archivo('F-GGO-46_' + rad + '.pdf', MIME.PDF, visitaDrive);
    const rf = d.archivo('RF-F-GGO-46_' + rad, MIME.GOOGLE_DOCS, visitaDrive);
    const actaDoc = d.archivo('F-GGO-46_' + rad, MIME.GOOGLE_DOCS, visitaDrive);
    const o = Object.assign({
      RADICADO: rad, 'ESTADO VISITA': 'COMPLETADO', 'FECHA DE VISITA': '15/10/2026',
      'DIRECCION INFRACCION': 'CL 50 # 40-10', 'VISITADOR(ES)': 'MAURICIO HERRERA',
      'SUSPENSION DE LA OBRA': 'SI', 'N° ORDEN DE POLICIA': 'OP-1',
      LINK_DRIVE: 'https://drive.google.com/drive/folders/' + visitaDrive.id,
      LINK_PDF_ACTA: acta.getUrl(), LINK_XLSX_ACTA: '',
      LINK_REGISTRO_FOTOS: 'https://docs.google.com/document/d/' + rf.id + '/edit',
      ID_VISITA: 'ID-' + rad,
    }, extra);
    if (o.LINK_XLSX_ACTA === 'DOC') o.LINK_XLSX_ACTA = 'https://docs.google.com/document/d/' + actaDoc.id + '/edit';
    return ENC_BD.map(h => o[h]);
  };
  const hojas = {
    USUARIOS: hoja([
      ['NOMBRE', 'HASH', 'ACTIVO', 'CARGO', 'ROL'],
      ['DANIEL PEDRAZA', sha('4826'), 'SI', 'Profesional', 'ADMIN'],
      ['NELSON CUERVO', sha('5062'), 'SI', 'Auxiliar', 'INSPECTOR'],
    ]),
    LOG_AUDITORIA: hoja([['FECHA', 'USUARIO', 'ACCION']]),
    'BD VISITAS': hoja([ENC_BD,
      fila('R1'),
      fila('R2', { 'DIRECCION INFRACCION': 'CR 60 / 30-20' }),
      fila('R3', { 'FECHA DE VISITA': new Date(2026, 9, 31, 10, 0) }),   // celda Date real
      fila('INICIADA', { 'ESTADO VISITA': 'INICIADO' }),
      fila('NOV', { 'FECHA DE VISITA': '03/11/2026' }),
      fila('R1-BIS'),                                                    // misma dirección que R1
      fila('SOLO-DOC', { LINK_PDF_ACTA: '', LINK_XLSX_ACTA: 'DOC' }),     // acta en Doc, sin PDF
    ]),
  };
  const ss = {
    getSheetByName: (n) => hojas[n] || null,
    insertSheet: (n) => (hojas[n] = hoja([])),
  };
  const cache = new Map();
  const pad = (n) => String(n).padStart(2, '0');
  const ctx = vm.createContext({
    SpreadsheetApp: { openById: () => ss, flush() {} },
    DriveApp: d.api,
    MimeType: MIME,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_a, t) => Array.from(crypto.createHash('sha256').update(t, 'utf8').digest())
        .map(b => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      formatDate: (dt, _tz, fmt) => String(fmt || 'yyyy-MM-dd')
        .replace('yyyy', dt.getFullYear()).replace('MM', pad(dt.getMonth() + 1)).replace('dd', pad(dt.getDate()))
        .replace('HH', pad(dt.getHours())).replace('mm', pad(dt.getMinutes())),
      sleep() {},
    },
    CacheService: { getScriptCache: () => ({
      get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v),
      remove: k => cache.delete(k), getAll: () => ({}), putAll() {}, removeAll() {},
    }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => ({ s }) }) },
    Session: { getScriptTimeZone: () => 'America/Bogota' },
    Logger: { log() {} },
    console,
  });
  vm.runInContext(fs.readFileSync(BACKEND, 'utf8'), ctx);
  // La carpeta de inspecciones del backend es la raíz del Drive en memoria.
  d.items[vm.runInContext('ID_CARPETA_INSPECCIONES', ctx)] = d.raiz;
  const post = (datos) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(datos) } }).s);
  const admin = { sesionUsuario: 'DANIEL PEDRAZA', sesionHash: sha('4826') };
  const pedir = (...rads) => rads.map(r => {
    const i = hojas['BD VISITAS']._v.findIndex(x => x[0] === r);
    return { idVisita: 'ID-' + r, fila: i + 1, radicado: r };
  });
  const carpetaMes = (nombre) => Object.values(d.items).find(x => x.esCarpeta && x.nombre === nombre && !x.trashed);
  return { ctx, d, hojas, post, admin, pedir, carpetaMes };
}

test('backend: nombres y validaciones puras', opts, () => {
  const { ctx } = mundo();
  assert.equal(ctx._mesReporteEvidencias('2026-13'), null);
  assert.equal(ctx._nombreCarpetaMesEvidencias(ctx._mesReporteEvidencias('2026-10')), 'Evidencias Octubre 2026');
  const usados = {};
  assert.equal(ctx._nombreCarpetaEvidencia('cr 60 / 30-20', usados), 'CR 60 - 30-20');
  assert.equal(ctx._nombreCarpetaEvidencia('CR 60 / 30-20', usados), 'CR 60 - 30-20 (2)');
  assert.equal(ctx._nombreCarpetaEvidencia('', usados), 'SIN DIRECCION');
});

test('backend: solo ADMIN genera el reporte', opts, () => {
  const m = mundo();
  const r = m.post({ accion: 'generarReporteEvidencias', mes: '2026-10', visitas: m.pedir('R1'),
    sesionUsuario: 'NELSON CUERVO', sesionHash: sha('5062') });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Acceso restringido');
  assert.equal(m.carpetaMes('Evidencias Octubre 2026'), undefined);
});

test('backend: crea la carpeta del mes con una subcarpeta por dirección y los dos PDF', opts, () => {
  const m = mundo();
  const r = m.post({ accion: 'generarReporteEvidencias', mes: '2026-10',
    visitas: m.pedir('R1', 'R2', 'R3', 'R1-BIS'), ...m.admin });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.nombreCarpeta, 'Evidencias Octubre 2026');
  assert.equal(r.reemplazado, false);
  const mes = m.carpetaMes('Evidencias Octubre 2026');
  assert.equal(mes.sharing, 'ANYONE_WITH_LINK/VIEW');
  assert.equal(mes.padre.nombre, 'REPORTES DE EVIDENCIAS');
  const subs = mes.hijos().map(x => x.nombre);
  assert.deepEqual(subs, ['CL 50 # 40-10', 'CR 60 - 30-20', 'CL 50 # 40-10 (2)', 'CL 50 # 40-10 (3)']);
  const primera = mes.hijos()[0];
  assert.deepEqual(primera.hijos().map(x => [x.nombre, x.mime]), [
    ['ACTA - R1.pdf', MIME.PDF], ['REGISTRO FOTOGRAFICO - R1.pdf', MIME.PDF]]);
  // Historial: una fila por visita, en orden.
  const h = m.hojas.REPORTES_EVIDENCIAS._v;
  assert.equal(h[0][0], 'MES');
  assert.deepEqual(h.slice(1).map(x => [x[0], x[3], x[4]]),
    [['2026-10', 1, 'R1'], ['2026-10', 2, 'R2'], ['2026-10', 3, 'R3'], ['2026-10', 4, 'R1-BIS']]);
  assert.equal(h[3][7], '31/10/2026', 'la celda Date se lee como fecha de visita');
  assert.match(m.hojas.LOG_AUDITORIA._v.at(-1)[2], /^REPORTE EVIDENCIAS 2026-10: 4 visitas/);
  // leerReportesEvidencias devuelve el historial por encabezado.
  const l = m.post({ accion: 'leerReportesEvidencias', ...m.admin });
  assert.equal(l.filas.length, 4);
  assert.equal(l.filas[0].RADICADO, 'R1');
});

test('backend: generar de nuevo el mes lo reemplaza (carpeta e historial)', opts, () => {
  const m = mundo();
  assert.equal(m.post({ accion: 'generarReporteEvidencias', mes: '2026-10', visitas: m.pedir('R1', 'R2'), ...m.admin }).ok, true);
  const r = m.post({ accion: 'generarReporteEvidencias', mes: '2026-10', visitas: m.pedir('R3'), ...m.admin });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.reemplazado, true);
  const mes = m.carpetaMes('Evidencias Octubre 2026');
  assert.deepEqual(mes.hijos().map(x => x.nombre), ['CL 50 # 40-10']);
  const h = m.hojas.REPORTES_EVIDENCIAS._v.slice(1);
  assert.deepEqual(h.map(x => x[4]), ['R3']);
});

test('backend: rechaza visitas no completadas, de otro mes o que no existen', opts, () => {
  const m = mundo();
  let r = m.post({ accion: 'generarReporteEvidencias', mes: '2026-10', visitas: m.pedir('R1', 'INICIADA'), ...m.admin });
  assert.equal(r.ok, false);
  assert.match(r.error, /INICIADA.*no está completada/);
  r = m.post({ accion: 'generarReporteEvidencias', mes: '2026-10', visitas: m.pedir('NOV'), ...m.admin });
  assert.match(r.error, /no es de ese mes/);
  r = m.post({ accion: 'generarReporteEvidencias', mes: '2026-10',
    visitas: [{ idVisita: 'NO-EXISTE', fila: 2, radicado: 'OTRO' }], ...m.admin });
  assert.match(r.error, /No se encontró/);
  assert.equal(m.carpetaMes('Evidencias Octubre 2026'), undefined, 'no se creó nada');
  assert.equal(m.hojas.REPORTES_EVIDENCIAS, undefined);
});

test('backend: encuentra la visita por ID_VISITA aunque la fila se haya corrido', opts, () => {
  const m = mundo();
  const pedida = m.pedir('R2');
  m.hojas['BD VISITAS']._v.splice(1, 1);   // se borra R1: R2 sube una fila
  const r = m.post({ accion: 'generarReporteEvidencias', mes: '2026-10', visitas: pedida, ...m.admin });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.visitas[0].radicado, 'R2');
});

test('backend: acta sin PDF (solo Doc): genera el PDF en la visita, llena LINK_PDF_ACTA y lo copia', opts, () => {
  const m = mundo();
  const r = m.post({ accion: 'generarReporteEvidencias', mes: '2026-10', visitas: m.pedir('SOLO-DOC'), ...m.admin });
  assert.equal(r.ok, true, r.error);
  const bd = m.hojas['BD VISITAS']._v;
  const fila = bd.find(x => x[0] === 'SOLO-DOC');
  assert.match(fila[ENC_BD.indexOf('LINK_PDF_ACTA')], /drive\.google\.com\/file\/d\//);
  const sub = m.carpetaMes('Evidencias Octubre 2026').hijos()[0];
  assert.deepEqual(sub.hijos().map(x => [x.nombre, x.mime]), [
    ['ACTA - SOLO-DOC.pdf', MIME.PDF], ['REGISTRO FOTOGRAFICO - SOLO-DOC.pdf', MIME.PDF]]);
});
