// Párrafo armado de las conclusiones editable (2026-11-11, decisión del
// usuario): «Editar» lo pasa a la casilla del inspector y CONCLUSION_BASE
// guarda el párrafo del que partió. Lógica en utils.js.
const test = require('node:test');
const assert = require('node:assert');
const U = require('../utils.js');

const A1 = 'A1: Área protegida o afectada';
const A4 = 'A4: Sin licencia o caducada';
const C12 = 'C12: Facilitar usos del suelo no autorizados';
const EN_PROCESO = 'En proceso / iniciada';

const datosA4 = { infraccion: A4, requiere: 'SI', modalidades: ['Modificación'],
  licenciaAportada: 'NO', estadoObra: 'Terminada' };
const ARMADO_A4 = U.conclusionDeterminativa(datosA4);

test('textoConParrafoArmado: el párrafo arriba y lo del inspector debajo', () => {
  assert.equal(U.textoConParrafoArmado('Párrafo.', 'Lo mío.'), 'Párrafo.\nLo mío.');
  assert.equal(U.textoConParrafoArmado('Párrafo.', ''), 'Párrafo.');
  assert.equal(U.textoConParrafoArmado('Párrafo.', '  \n '), 'Párrafo.');
});

test('quitarParrafoArmado: conserva lo de debajo del primer párrafo', () => {
  assert.equal(U.quitarParrafoArmado('Mi versión.\nLo mío.\nOtra línea.'), 'Lo mío.\nOtra línea.');
  assert.equal(U.quitarParrafoArmado('Solo el párrafo.'), '');
  assert.equal(U.quitarParrafoArmado(''), '');
  assert.equal(U.quitarParrafoArmado('\n\nMi versión.\nLo mío.'), 'Lo mío.');
});

test('cambiarParrafoArmado: reemplaza solo el primer párrafo', () => {
  assert.equal(U.cambiarParrafoArmado('Mi versión.\nLo mío.', 'Nuevo.'), 'Nuevo.\nLo mío.');
  assert.equal(U.cambiarParrafoArmado('Mi versión.', 'Nuevo.'), 'Nuevo.');
});

test('parrafoArmadoCambio: avisa solo si hay edición y el armado ya es otro', () => {
  assert.equal(U.parrafoArmadoCambio('', ARMADO_A4), false);           // sin edición
  assert.equal(U.parrafoArmadoCambio(ARMADO_A4, ''), false);           // ya no se arma párrafo
  assert.equal(U.parrafoArmadoCambio(ARMADO_A4, ARMADO_A4), false);
  // La columna guarda el texto con los espacios juntos: no es un cambio.
  assert.equal(U.parrafoArmadoCambio(ARMADO_A4.replace(/ /g, '  '), ARMADO_A4), false);
  const enProceso = U.conclusionDeterminativa(Object.assign({}, datosA4, { estadoObra: EN_PROCESO }));
  assert.equal(U.parrafoArmadoCambio(ARMADO_A4, enProceso), true);
});

test('comportamientosSinNombrar: el párrafo armado nombra todo lo marcado', () => {
  assert.deepEqual(U.comportamientosSinNombrar(ARMADO_A4, A4), []);
  const mixto = U.conclusionDeterminativa({ infraccion: A1 + ' | ' + A4, requiere: 'SI',
    modalidades: ['Ampliación'], licenciaAportada: 'NO', estadoObra: EN_PROCESO, sueloProt: 'SI' });
  assert.deepEqual(U.comportamientosSinNombrar(mixto, A1 + ' | ' + A4), []);
  const conC = U.conclusionDeterminativa({ infraccion: A4 + ' | ' + C12, requiere: 'SI',
    modalidades: ['Ampliación'], licenciaAportada: 'NO', estadoObra: EN_PROCESO });
  assert.deepEqual(U.comportamientosSinNombrar(conC, A4 + ' | ' + C12), []);
  const soloC = U.conclusionDeterminativa({ infraccion: C12 });
  assert.deepEqual(U.comportamientosSinNombrar(soloC, C12), []);
});

test('comportamientosSinNombrar: el texto editado que pierde la cita', () => {
  assert.deepEqual(U.comportamientosSinNombrar('Las obras se hicieron sin licencia.', A4), ['A4']);
  // Sin el artículo 135 no vale aunque diga literal y numeral.
  assert.deepEqual(U.comportamientosSinNombrar('Literal A, numeral 4 de la Ley 1801.', A4), ['A4']);
  // Con otro numeral.
  assert.deepEqual(U.comportamientosSinNombrar('Artículo 135, literal A, numeral 2.', A4), ['A4']);
  // Uno de dos.
  assert.deepEqual(U.comportamientosSinNombrar('Previsto en el artículo 135, literal A, numeral 4.', A1 + ' | ' + A4), ['A1']);
  // Redacción propia del inspector, con mayúsculas y tildes distintas.
  assert.deepEqual(U.comportamientosSinNombrar('Se configura lo del ARTÍCULO 135 literales A y C, numerales 4 y 12.', A4 + ' | ' + C12), []);
});

test('comportamientosSinNombrar: sin comportamientos con código no exige nada', () => {
  assert.deepEqual(U.comportamientosSinNombrar('Texto libre.', 'No se evidencia infracción'), []);
  assert.deepEqual(U.comportamientosSinNombrar('Texto libre.', ''), []);
});

test('el párrafo armado en la casilla del inspector no levanta señales de coherencia', () => {
  const casos = [
    { datos: datosA4, extra: { area: '40', estadoObra: 'Terminada' } },
    { datos: { infraccion: A1 + ' | ' + A4, requiere: 'SI', modalidades: ['Ampliación'], licenciaAportada: 'NO',
        estadoObra: EN_PROCESO, sueloProt: 'SI' }, extra: { area: '25', estadoObra: EN_PROCESO } },
  ];
  casos.forEach(({ datos, extra }) => {
    const armado = U.conclusionDeterminativa(datos);
    const senales = U.revisarTextoLocal(Object.assign({
      actuacion: '', conclusion: U.textoConParrafoArmado(armado, ''),
      infraccion: datos.infraccion, requiereLicencia: datos.requiere, modalidades: datos.modalidades,
      licenciaAportada: datos.licenciaAportada,
    }, extra)).filter(s => s.donde === 'conclusion' && s.tipo === 'coherencia');
    assert.deepEqual(senales.map(s => s.id), [], armado);
  });
});

// 2026-11-12: el párrafo armado editado pasa por una corrección de escritura
// en «Revisar»; la respuesta solo vale si es un retoque.
test('correccionParrafoConclusion: acepta un retoque de escritura y rechaza lo demás', () => {
  const A3 = 'A3: Bien de uso público o espacio público';
  const o = 'Las obras corresponden a una ampliación de la edificación existente, las ampliaciones equieren licencia de construcción en esa modalidad (Decreto 1077 de 2015, art. 2.2.6.1.1.7), sin embargo en este caso no es viable toda vez que la construccion se realizo sobre bienes de uso público. Constituyen el comportamiento de construir en bienes de uso público y terrenos afectados al espacio público, previsto en el articulo 135, literal A, numeral 3, de la Ley 1801 de 2016.';
  const c = o.replace('equieren', 'requieren').replace('construccion se realizo', 'construcción se realizó')
    .replace('articulo', 'artículo').replace('sin embargo en', 'sin embargo, en');
  assert.equal(U.correccionParrafoConclusion(o, c, A3), c);
  assert.equal(U.correccionParrafoConclusion(o, '«' + c + '»', A3), c);
  assert.equal(U.correccionParrafoConclusion(o, o, A3), '');
  assert.equal(U.correccionParrafoConclusion(o, c.replace('numeral 3', 'numeral 4'), A3), '');
  assert.equal(U.correccionParrafoConclusion(o, c.replace('art. 2.2.6.1.1.7', 'art. 2.2.6.1.1.10'), A3), '');
  assert.equal(U.correccionParrafoConclusion(o, c.replace('. Constituyen', '.\nConstituyen'), A3), '');
  assert.equal(U.correccionParrafoConclusion(o, 'Las obras se ejecutaron en espacio público sin licencia y deben demolerse.', A3), '');
  assert.equal(U.correccionParrafoConclusion(o, '', A3), '');
});
