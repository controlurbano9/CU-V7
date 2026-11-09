// Actas mejor sustentadas (2026-11-05): vigencia de la licencia, conclusión
// determinativa (A38) y reglas R22-R29, R31 y juicio. Spec:
// docs/PROPUESTA_2026-11-05_actas-informes-sustentacion.md § 6.1, 6.1-b, 6.3.
const test = require('node:test');
const assert = require('node:assert');
const U = require('../utils.js');

const ids = s => s.map(x => x.id).sort();
const A2 = 'A2: Desconociendo la licencia';
const A3 = 'A3: Bien de uso público o espacio público';
const A4 = 'A4: Sin licencia o caducada';
const EN_PROCESO = 'En proceso / iniciada';

// ── vigenciaLicencia ─────────────────────────────────────────
test('vigenciaLicencia: obra nueva antes y después del Decreto 1783 de 2021', () => {
  assert.deepEqual(U.vigenciaLicencia({ fecha: '2020-07-17', tipo: 'Licencia de construcción — Obra nueva', fechaVisita: '2026-10-05' }),
    { estado: 'VENCIDA', meses: 24, vence: '17/07/2022', venceProrroga: '17/07/2023' });
  assert.deepEqual(U.vigenciaLicencia({ fecha: '2022-03-01', tipo: 'Licencia de construcción — Obra nueva', fechaVisita: '2025-01-10' }),
    { estado: 'VIGENTE', meses: 36, vence: '01/03/2025', venceProrroga: '01/03/2026' });
});

test('vigenciaLicencia: adecuación 2026-05-29 visita 2026-09-23 → VIGENTE', () => {
  assert.equal(U.vigenciaLicencia({ fecha: '2026-05-29', tipo: 'Licencia de construcción — Adecuación', fechaVisita: '2026-09-23' }).estado, 'VIGENTE');
});

test('vigenciaLicencia: prórroga de 12 meses para la ampliación 2021-12-31', () => {
  const base = { fecha: '2021-12-31', tipo: 'Licencia de construcción — Ampliación' };
  const v = U.vigenciaLicencia(Object.assign({}, base, { fechaVisita: '2023-06-01' }));
  assert.equal(v.estado, 'VIGENTE');
  assert.equal(v.vence, '31/12/2023');
  assert.equal(v.venceProrroga, '31/12/2024');
  assert.equal(U.vigenciaLicencia(Object.assign({}, base, { fechaVisita: '2024-06-01' })).estado, 'PRORROGA');
  assert.equal(U.vigenciaLicencia(Object.assign({}, base, { fechaVisita: '2025-01-02' })).estado, 'VENCIDA');
});

test('vigenciaLicencia: lo que dijo el inspector y lo que no se puede computar', () => {
  assert.equal(U.vigenciaLicencia({ fecha: '2026-05-29', tipo: 'Licencia de construcción — Adecuación',
    obs: 'La licencia se encuentra caducada', fechaVisita: '2026-09-23' }).estado, 'VENCIDA');
  assert.equal(U.vigenciaLicencia({}).estado, 'SIN_DATO');
  // El reconocimiento no tiene plazo de ejecución.
  assert.equal(U.vigenciaLicencia({ fecha: '2024-02-01', tipo: 'Reconocimiento', fechaVisita: '2026-01-01' }).estado, 'SIN_DATO');
});

test('vigenciaLicencia: 31/01 + 1 mes cae en el último día de febrero', () => {
  assert.equal(U.vigenciaLicencia({ fecha: '2021-08-31', tipo: 'Licencia de subdivisión', fechaVisita: '2026-01-01' }).vence, '28/02/2022');
});

// ── R22 y R08 ────────────────────────────────────────────────
const LIC_2020 = { fechaLicencia: '2020-07-17', tipoLicencia: 'Licencia de construcción — Obra nueva', fechaVisita: '2026-10-05' };
const LIC_VIGENTE = { fechaLicencia: '2026-05-29', tipoLicencia: 'Licencia de construcción — Adecuación', fechaVisita: '2026-09-23' };

test('R22: A2 con licencia vencida, según el estado de la obra', () => {
  const s = U.revisarTextoLocal(Object.assign({ actuacion: 'Ampliación en ejecución.', infraccion: A2,
    licenciaAportada: 'SI', estadoObra: EN_PROCESO, area: '30' }, LIC_2020));
  const r22 = s.find(x => x.id === 'R22');
  assert.match(r22.mensaje, /sigue en ejecución/);
  // La única regla nueva que pide justificación (2026-11-05).
  assert.equal(r22.tipo, 'coherencia');
  const t = U.revisarTextoLocal(Object.assign({ actuacion: 'Ampliación terminada.', infraccion: A2,
    licenciaAportada: 'SI', estadoObra: 'Terminada', area: '30' }, LIC_2020));
  // Terminada: aviso, sin justificación (R22b).
  const r22b = t.find(x => x.id === 'R22b');
  assert.match(r22b.mensaje, /se ejecutaron mientras/);
  assert.equal(r22b.tipo, 'aviso');
  // Vigente: no hay nada que preguntar.
  assert.equal(U.revisarTextoLocal(Object.assign({ actuacion: 'Adecuación.', infraccion: A2,
    licenciaAportada: 'SI', area: '30' }, LIC_VIGENTE)).filter(x => x.id === 'R22').length, 0);
});

test('R08: A4 con licencia vencida es coherente; con vigente no', () => {
  assert.equal(U.revisarTextoLocal(Object.assign({ actuacion: 'Obra nueva.', infraccion: A4,
    licenciaAportada: 'SI', area: '30' }, LIC_2020)).filter(x => x.id === 'R08').length, 0);
  assert.ok(U.revisarTextoLocal(Object.assign({ actuacion: 'Adecuación.', infraccion: A4,
    licenciaAportada: 'SI', area: '30' }, LIC_VIGENTE)).some(x => x.id === 'R08'));
});

// ── R23: verbo rector ────────────────────────────────────────
const TEXTO_8867 = 'Se observa la ejecución en proceso de una unidad habitacional en el segundo piso.';
const R23_BASE = { actuacion: TEXTO_8867, infraccion: '', area: '40',
  modalidades: ['Ampliación'], requiereLicencia: 'SI', estadoObra: EN_PROCESO };

test('R23: caso 2026-008867 — la ampliación sin nombre ni verbo', () => {
  const s = U.revisarTextoLocal(R23_BASE);
  const r23 = s.find(x => x.id === 'R23');
  assert.ok(r23);
  assert.equal(r23.tipo, 'forma'); // la corrige la propuesta de «Revisar» (2026-11-05)
  assert.match(r23.mensaje, /nombrar la intervención como ampliación y usar el verbo construir en presente \(«se está construyendo»\)/);
});

test('R23: nombre y verbo en el tiempo que toca → sin señal', () => {
  assert.equal(U.revisarTextoLocal(Object.assign({}, R23_BASE,
    { actuacion: 'Se está construyendo una ampliación de la edificación existente.' })).filter(x => x.id === 'R23').length, 0);
  assert.equal(U.revisarTextoLocal(Object.assign({}, R23_BASE,
    { actuacion: 'Se construyó una ampliación.', estadoObra: 'Terminada' })).filter(x => x.id === 'R23').length, 0);
});

test('R23: terminada y el texto en presente progresivo cita lo que dice hoy', () => {
  const s = U.revisarTextoLocal(Object.assign({}, R23_BASE,
    { actuacion: 'Se está construyendo una ampliación en el segundo piso.', estadoObra: 'Terminada' }));
  const msg = s.find(x => x.id === 'R23').mensaje;
  assert.match(msg, /en pasado \(«se construyó»\)/);
  assert.ok(msg.endsWith('Hoy dice «se está construyendo».'), msg);
});

test('R23: varias modalidades — todos los nombres y cada verbo', () => {
  const base = Object.assign({}, R23_BASE,
    { modalidades: ['Modificación', 'Adecuación'], estadoObra: 'Terminada' });
  assert.equal(U.revisarTextoLocal(Object.assign({}, base,
    { actuacion: 'Se intervino una modificación y una adecuación de la edificación.' })).filter(x => x.id === 'R23').length, 0);
  const s = U.revisarTextoLocal(Object.assign({}, base, { actuacion: 'Se hicieron trabajos.' }));
  assert.match(s.find(x => x.id === 'R23').mensaje, /como modificación y adecuación y usar el verbo intervenir/);
});

// ── R24 / R25 ────────────────────────────────────────────────
test('R24: la descripción amplía y Verificación documental no lo cuenta', () => {
  const s = U.revisarTextoLocal({ actuacion: 'Se subieron los muros perimetrales para alzar la cubierta.',
    infraccion: A4, area: '30', requiereLicencia: 'NO' });
  const r24 = s.find(x => x.id === 'R24');
  assert.ok(r24);
  assert.match(r24.mensaje, /«las obras no requieren licencia»/);
});

test('R25: chip sin hecho en el texto; D18 con escombros sí lo tiene', () => {
  const base = { actuacion: 'Se observó la obra.', area: '10' };
  const s = U.revisarTextoLocal(Object.assign({}, base, { infraccion: 'D18: Sin retirar andamios ni escombros' }));
  const r25 = s.find(x => x.id === 'R25');
  assert.ok(r25);
  assert.match(r25.mensaje, /Está marcado D18 \(Sin retirar andamios ni escombros\) y el texto no describe el hecho: qué residuos, escombros o andamios\./);
  assert.equal(U.revisarTextoLocal(Object.assign({}, base,
    { actuacion: 'Hay escombros en el andén.', infraccion: 'D18: Sin retirar andamios ni escombros' }))
    .filter(x => x.id === 'R25').length, 0);
});

test('R25: C11 con usos «Se desconoce» aunque el texto tenga palabras', () => {
  const s = U.revisarTextoLocal({ actuacion: 'Se observa un local en el primer piso.',
    infraccion: 'C11: Contravenir usos del suelo', area: '10', usos: 'Se desconoce' });
  assert.match(s.find(x => x.id === 'R25').mensaje, /qué uso funciona en el inmueble \(Usos actuales dice «Se desconoce»\)/);
});

// ── R27 / R28 / R29 / R31 / juicio ───────────────────────────
test('R27: sin acceso y con tipificación', () => {
  const s = U.revisarTextoLocal({ actuacion: 'No fue posible ingresar al inmueble.', infraccion: A4, area: '40' });
  const r27 = s.find(x => x.id === 'R27');
  assert.ok(r27);
  assert.match(r27.mensaje, /El texto dice «no fue posible ingresar»/);
});

test('R28: el texto decreta la suspensión y la casilla no', () => {
  const s = U.revisarTextoLocal({ actuacion: 'Se procede a imponer medida de suspensión de la obra.',
    infraccion: A4, area: '40', suspension: 'N/A', estadoObra: EN_PROCESO });
  assert.ok(s.some(x => x.id === 'R28'));
});

test('R29: «No se pudo medir» y el texto trae m²; alturas y retiros no cuentan', () => {
  const s = U.revisarTextoLocal({ actuacion: 'Se construyó un tercer piso de 45 m2 sobre la cubierta.',
    infraccion: A4, area: '', areaNoMedible: true });
  const r29 = s.find(x => x.id === 'R29');
  assert.ok(r29);
  assert.equal(r29.tipo, 'aviso');
  assert.match(r29.mensaje, /el texto menciona «45 m2»/);
  // 20261057389 y 20261126691: centímetros de paramento y metros de retiro no son área.
  assert.equal(U.revisarTextoLocal({ actuacion: 'La fachada sale 80 centímetros del paramento y tiene un retiro de 10,70 metros.',
    infraccion: A4, area: '', areaNoMedible: true }).filter(x => x.id === 'R29').length, 0);
});

// ── Excepciones de los avisos (2026-11-05, «que no avise innecesariamente») ──
test('R27: no avisa si lo que no se vio es una parte o si se describe desde afuera', () => {
  const parte = U.revisarTextoLocal({ actuacion: 'Se inspeccionaron los apartamentos del tercer nivel. No fue posible ingresar al apartamento posterior.',
    infraccion: A2, area: '40', licenciaAportada: 'SI' });
  assert.equal(parte.filter(x => x.id === 'R27').length, 0);
  const afuera = U.revisarTextoLocal({ actuacion: 'No fue posible ingresar al inmueble. Desde el exterior se observa un tercer piso en mampostería.',
    infraccion: A4, area: '40' });
  assert.equal(afuera.filter(x => x.id === 'R27').length, 0);
  // A3 se ve desde la calle.
  assert.equal(U.revisarTextoLocal({ actuacion: 'No fue posible ingresar al inmueble. Hay una cubierta en el antejardín.',
    infraccion: A3, area: '10' }).filter(x => x.id === 'R27').length, 0);
});

test('R28: no avisa con negación ni con una suspensión anterior', () => {
  const base = { infraccion: A4, area: '40', suspension: 'N/A', estadoObra: 'Terminada' };
  assert.equal(U.revisarTextoLocal(Object.assign({ actuacion: 'No se impone medida de suspensión porque la obra está terminada.' }, base))
    .filter(x => x.id === 'R28').length, 0);
  assert.equal(U.revisarTextoLocal(Object.assign({ actuacion: 'Se verificó la medida de suspensión impuesta en la visita anterior.' }, base))
    .filter(x => x.id === 'R28').length, 0);
});

test('R24: no avisa con negación, con lo aprobado ni por subir muros con Modificación', () => {
  const base = { infraccion: 'No se evidencia infracción', area: '', areaNoAplica: true, requiereLicencia: 'NO' };
  assert.equal(U.revisarTextoLocal(Object.assign({ actuacion: 'El tercer piso contemplado en la licencia no fue desarrollado.' }, base))
    .filter(x => x.id === 'R24').length, 0);
  assert.ok(U.revisarTextoLocal(Object.assign({ actuacion: 'Se subieron los muros perimetrales para alzar la cubierta.' }, base))
    .some(x => x.id === 'R24' && x.tipo === 'aviso'));
  assert.equal(U.revisarTextoLocal({ actuacion: 'Se subieron los muros perimetrales para alzar la cubierta.',
    infraccion: A4, area: '20', requiereLicencia: 'SI', modalidades: ['Modificación'] }).filter(x => x.id === 'R24').length, 0);
});

test('R31: no avisa si el texto ya habla de la licencia', () => {
  assert.equal(U.revisarTextoLocal({ actuacion: 'La administración del conjunto no aprobó la obra. No se aportó licencia de construcción.',
    infraccion: A4, area: '20' }).filter(x => x.id === 'R31').length, 0);
});

test('juicio: la sanción en condicional se queda; la anunciada como segura no', () => {
  const cond = U.revisarTextoLocal({ actuacion: 'Se le informó que podrán iniciarse las acciones administrativas y sancionatorias a que haya lugar.',
    infraccion: A4, area: '20' });
  assert.equal(cond.filter(x => x.id === 'juicio').length, 0);
  const segura = U.revisarTextoLocal({ actuacion: 'Esta Inspección iniciará las acciones administrativas y sancionatorias pertinentes.',
    infraccion: A4, area: '20' });
  assert.ok(segura.some(x => x.id === 'juicio'));
});

test('vigenciaLicencia: «no vencida», prorrogada y revalidada en las observaciones', () => {
  assert.equal(U.vigenciaLicencia({ fecha: '2026-05-29', tipo: 'Licencia de construcción — Adecuación',
    obs: 'Licencia no vencida', fechaVisita: '2026-09-23' }).estado, 'VIGENTE');
  assert.equal(U.vigenciaLicencia({ fecha: '2021-12-31', tipo: 'Licencia de construcción — Ampliación',
    obs: 'Licencia prorrogada', fechaVisita: '2024-06-01' }).estado, 'VIGENTE');
  assert.equal(U.vigenciaLicencia({ fecha: '2020-07-17', tipo: 'Licencia de construcción — Obra nueva',
    obs: 'Con revalidación', fechaVisita: '2026-10-05' }).estado, 'SIN_DATO');
});

test('pistaIntervencion: lo que viaja a «Revisar» con la descripción', () => {
  assert.equal(U.pistaIntervencion({ infraccion: 'A1: Área protegida o afectada', modalidades: ['Ampliación'], estadoObra: EN_PROCESO }),
    'una ampliación de la edificación existente; verbo «construir»; la obra está en proceso: «se está construyendo una ampliación de la edificación existente».');
  assert.equal(U.pistaIntervencion({ infraccion: 'No se evidencia infracción', modalidades: ['Adecuación'], estadoObra: 'Terminada' }), '');
});

test('conclusionDeterminativa: sin número ni fecha de licencia no deja huecos', () => {
  const t = U.conclusionDeterminativa({ infraccion: 'No se evidencia infracción', requiere: 'SI', modalidades: ['Adecuación'],
    licenciaAportada: 'SI' });
  assert.ok(!/ por ,|por \./.test(t));
  assert.match(t, /amparadas por la licencia aportada\./);
});

test('R31 y juicio: la copropiedad no es la licencia; el acta no juzga', () => {
  const s = U.revisarTextoLocal({ actuacion: 'La administración del conjunto autorizó la apropiación ilegal del antejardín.',
    infraccion: A3, area: '10' });
  assert.ok(s.some(x => x.id === 'R31' && x.tipo === 'aviso'));
  const j = s.find(x => x.id === 'juicio');
  assert.ok(j);
  assert.equal(j.tipo, 'forma');
  assert.match(j.mensaje, /\(«ilegal»\): el acta describe hechos/);
});

// ── conclusionDeterminativa ──────────────────────────────────
const EJ1 = U.conclusionDeterminativa({ infraccion: 'A1: Área protegida o afectada', requiere: 'SI',
  modalidades: ['Ampliación'], licenciaAportada: 'NO', estadoObra: EN_PROCESO, sueloProt: 'SI', poligono: 'ZR-1-C5',
  sueloProtCategoria: 'ZPAP-3' });
const EJ2 = U.conclusionDeterminativa({ infraccion: A4, requiere: 'SI',
  modalidades: ['Ampliación'], licenciaAportada: 'NO', estadoObra: 'Terminada' });
const EJ3 = U.conclusionDeterminativa({ infraccion: 'No se evidencia infracción', requiere: 'SI',
  modalidades: ['Adecuación'], licenciaAportada: 'SI', licenciaN: 'C1L-369-2026', fechaLicencia: '2026-05-29',
  tipoLicencia: 'Licencia de construcción — Adecuación', fechaVisita: '2026-09-23',
  pisos: '3', alturaPisos: '3', destinaciones: '8', destActuales: '8' });

test('conclusionDeterminativa: ejemplo 1 (A1, ampliación, sin licencia)', () => {
  assert.equal(EJ1,
    'Las obras corresponden a una ampliación de la edificación existente, que requiere licencia de construcción en esa modalidad (Decreto 1077 de 2015, art. 2.2.6.1.1.7), y no se aportó licencia. ' +
    'Por construirse en suelo de protección (ZPAP-3), constituyen el comportamiento de construir en áreas protegidas, previsto en el artículo 135, literal A, numeral 1, de la Ley 1801 de 2016, y no pueden legalizarse mediante licencia ni reconocimiento.');
});

test('conclusionDeterminativa: A1 nombra la categoría de protección y la amenaza, no el uso del suelo', () => {
  const base = { infraccion: 'A1: Área protegida o afectada', requiere: 'SI', modalidades: ['Ampliación'],
    licenciaAportada: 'NO', sueloProt: 'SI', poligono: 'ZR-1-C5' };
  const sinDetalle = U.conclusionDeterminativa(base);
  assert.ok(sinDetalle.includes('Por construirse en suelo de protección, constituyen'));
  assert.ok(!sinDetalle.includes('ZR-1-C5'));
  const t = U.conclusionDeterminativa(Object.assign({}, base, { sueloProtCategoria: 'ZIM-4: Zona de Interés Municipal',
    amenaza: 'SI', amenazaTipo: 'Movimiento en masa', amenazaCategoria: 'Alta' }));
  assert.ok(t.includes('Por construirse en suelo de protección (ZIM-4: Zona de Interés Municipal) y en zona de amenaza alta por movimiento en masa, constituyen'));
  assert.ok(U.conclusionDeterminativa(Object.assign({}, base, { amenaza: 'SI' }))
    .includes('en suelo de protección y en zona de amenaza, constituyen'));
  assert.ok(!U.conclusionDeterminativa(Object.assign({}, base, { amenaza: 'NO', amenazaTipo: 'Inundación' })).includes('amenaza'));
});

test('conclusionDeterminativa: ejemplo 2 (A4, terminada)', () => {
  assert.equal(EJ2,
    'Las obras corresponden a una ampliación de la edificación existente, que requiere licencia de construcción en esa modalidad (Decreto 1077 de 2015, art. 2.2.6.1.1.7), y no se aportó licencia. ' +
    'Constituyen el comportamiento de construir sin licencia, previsto en el artículo 135, literal A, numeral 4, de la Ley 1801 de 2016. ' +
    'Para legalizarlas se requiere licencia de construcción en esa modalidad o, si procede, el reconocimiento de la edificación.');
});

test('conclusionDeterminativa: ejemplo 3 (sin infracción, licencia vigente)', () => {
  assert.equal(EJ3,
    'Las obras observadas corresponden a una adecuación de la edificación existente, amparadas por la licencia C1L-369-2026 del 29/05/2026, vigente a la fecha de la visita, y lo construido coincide con los pisos y destinaciones aprobados. ' +
    'No se configura comportamiento contrario a la integridad urbanística del artículo 135 de la Ley 1801 de 2016.');
});

test('conclusionDeterminativa: lote mixto A1 + A4', () => {
  const s = U.conclusionDeterminativa({ infraccion: 'A1: Área protegida o afectada | ' + A4, requiere: 'SI',
    modalidades: ['Ampliación'], licenciaAportada: 'NO', estadoObra: EN_PROCESO, sueloProt: 'SI' });
  assert.ok(s.includes('Lo ejecutado en suelo de protección no puede legalizarse'));
  assert.ok(s.includes('Para el resto, se requiere'));
});

test('conclusionDeterminativa: A2 con más pisos que los aprobados', () => {
  const s = U.conclusionDeterminativa({ infraccion: A2, requiere: 'SI', modalidades: ['Ampliación'],
    licenciaAportada: 'SI', licenciaN: 'C1L-100-2025', fechaLicencia: '2025-02-01',
    alturaPisos: '6', pisos: '4', destinaciones: '8', destActuales: '8', fechaVisita: '2026-01-01' });
  assert.ok(s.includes('aprueba 4 pisos, mientras en sitio se encontraron 6'));
});

test('conclusionDeterminativa: «No se pudo determinar» y sin chips', () => {
  assert.equal(U.conclusionDeterminativa({ infraccion: 'No se pudo determinar' }),
    'Por lo anterior, no se califica comportamiento contrario a la integridad urbanística del artículo 135 de la Ley 1801 de 2016.');
  assert.equal(U.conclusionDeterminativa({ infraccion: '' }), '');
});

test('R28: en una visita de seguimiento la suspensión del texto es la de la primera visita', () => {
  const e = { actuacion: 'Se verificó que se impuso medida de suspensión de la obra.', infraccion: A4, area: '40',
    suspension: 'NO', estadoObra: EN_PROCESO };
  assert.ok(U.revisarTextoLocal(e).some(x => x.id === 'R28'));
  assert.equal(U.revisarTextoLocal(Object.assign({ nVisita: 2 }, e)).filter(x => x.id === 'R28').length, 0);
});

test('conclusionDeterminativa: dos comportamientos dicen «numerales»', () => {
  const t = U.conclusionDeterminativa({ infraccion: 'A1: Área protegida o afectada | ' + A4, requiere: 'SI',
    modalidades: ['Ampliación'], licenciaAportada: 'NO', estadoObra: EN_PROCESO, sueloProt: 'SI' });
  assert.match(t, /literal A, numerales 1 y 4,/);
});
