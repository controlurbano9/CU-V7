# UI REVIEW centro-control 2026-09-11

Banco de pruebas `qa-centro-control.html` (commit `ebd83d8`), 4 escenarios × 2 viewports
(1366×768, 390×844). Checks objetivos (overflow, consola, táctiles) + screenshot fullPage
por combinación (`cc-*.png` en la raíz) + análisis de visión verificado contra medición
JS / código.

**Resultado global:** sin P1. En los 8 pares escenario×viewport `overflowX = 0`, ningún
elemento fuera de pantalla, y la consola solo arroja lo ignorable (favicon 404,
`CU_MAPS_JS_URL` indefinida y rechazos de fetch del propio stub). Las tres zonas
rediseñadas cumplen el criterio de lectura del estado en <5 s.

## P1 — rotura funcional/visual

Ninguna. En particular, **la barra fija no tapa contenido** (verificado a scroll completo
en 1366: ningún elemento bajo `barTop`; la pantalla reserva `paddingBottom: 140` en
`nueva-visita.jsx:3064` y el QA 120 px). Lo que la visión reportó como solape es el
artefacto típico de `position:fixed` en capturas fullPage.

## P2 — UX

1. **El escáner de orden no se degrada cuando la orden ya está escaneada**
   (`?e=completa`, ambos viewports). El renglón dice «Escaneada» + «Ver», pero debajo
   cuelga el control más pesado de toda la sección: label full-width estilo primario
   (1059 px de ancho a 1366) que dice «Escanear orden de policía»
   (`escaner-orden.jsx:266` — el texto no considera `link`). Compite con «Guardar
   cambios» como doble CTA primario terracota y sugiere una acción pendiente donde el
   estado dice que no la hay. Con `linkInicial` debería ser secundario
   («Reescanear»/«Reemplazar escaneo»). Evidencia: DOM medido + visión coincidente en
   1366 y 390.

2. **El banco de pruebas no puede ejercitar el estado «con fotos»** (afecta a los 4
   escenarios, visible en `completa`). El fixture pasa `ID_CARPETA_FOTOS`/`ID_CARPETA_VISITA`,
   pero `_estadoInicial` (`nueva-visita.jsx:401-402`) solo deriva `idCarpetaVisita` de
   `LINK_DRIVE` y arranca `idCarpetaFotos: ''` — la clave del fixture es letra muerta — y
   `obtenerIdFotos` no está stubbeado (fetch deshabilitado → el efecto de
   `nueva-visita.jsx:1980-1995` nunca recupera el id). Resultado: fila «Fotos de la
   visita» siempre «Sin fotos» y **sin slot de subida**, y las 18 fotos que devuelve el
   stub de `listarFotosActa` nunca se ven en chips ni en «Registro fotográfico».
   Efecto colateral visible: meta «Disponibles al crear la carpeta de Drive» junto a
   Carpeta «Creada» — par contradictorio que en producción solo aparece si
   `obtenerIdFotos` falla al reabrir. Arreglo: stubbear `obtenerIdFotos` en
   `qa-centro-control.html` (junto a `listarFotosActa`). *Nota: la revisión del slot de
   fotos quedó cubierta solo por código, no visualmente.*

## P3 — consistencia

1. **Botón «Generar» a secas** en Registro fotográfico vs «Generar acta»/«Generar
   informe» (`nueva-visita.jsx:3894`).
2. **«Generar informe» junto a pill «Generado»** (`nueva-visita.jsx:3915-3918`): el acta
   resuelve regenerar con un icono ↻ reducido; el informe mantiene el CTA de texto
   completo como si no existiera. Tres filas, tres tratamientos de «regenerar».
3. **`<details>` «Faltan N campos para generar el acta o el informe» se muestra aunque
   ambos documentos ya estén generados** (`nueva-visita.jsx:3767` sin guard
   `!d.linkXlsxActa`) — caso `completa`. En producción requiere vaciar campos después de
   generar (borrador/carga parcial), pero el mensaje es irreconciliable con las pills
   «Generada»/«Generado» de sus propios renglones.
4. **`<summary>` de campos faltantes a 37 px de alto** en 390 — único control de la zona
   rediseñada bajo el umbral táctil de 44 px (escenarios `faltantes`/`completa`/`offline`).
5. **Posición de la pill de estado variable por wrap** en 390: en «Registro
   fotográfico» pill y botón comparten línea; en las demás filas la pill va a línea
   propia. El orden DOM es idéntico (`FilaEntregable`, `nueva-visita.jsx:1460-1480`); lo
   decide el wrap. Escaneo vertical salta de lado entre renglones.
6. **Botones «Generar…» con aspecto habilitado junto a pills de bloqueo**
   («Faltan 22 campos»/«Requiere fotos»). Protegidos por `_validarAntesDeActa()` con
   alerta (`nueva-visita.jsx:2692-2703`) — affordance, no rotura.
7. **Hint «Usa el botón IA para pulir la redacción»** (`nueva-visita.jsx:3436`): el botón
   visible se llama «Mejorar texto».
8. **Offline solo lo comunica la barra inferior**: «Abrir» (Drive) y «Generar…» en
   entregables no avisan que requieren red (`?e=offline`). La barra en sí funciona
   exactamente como debe: «Sin conexión — guarda y se enviará al recuperar la señal» +
   «Guardar (se envía con señal)», verificado en ambos viewports.
9. *(Preexistente, fuera del commit)* chips `radio-opcion` de 36-37 px en todo el
   formulario, bajo 44 px.
10. *(Preexistente, fuera del commit)* `_SelectBarrio` compara case-sensitive
    (`nueva-visita.jsx:772`): un barrio guardado en mayúsculas ('NIQUIA') cae a
    «Otro...» + input libre con el valor. No se pierde el dato, pero se ve como barrio
    no reconocido.

## Descartado — lo que la visión dijo y la medición desmintió

- **«Barra fija tapa la fila CR 52 / campos de Ubicación»** (visión, 3 capturas):
  medido a scroll completo — ningún elemento bajo `barTop`; `paddingBottom:140` real.
  Artefacto del screenshot fullPage con `position:fixed`.
- **«Guardar visita» en vez de «Guardar cambios»** (visión, `nueva`): dinámico por
  diseño — «Guardar visita» sin `filaEditando`, «Guardar cambios» al editar
  (`nueva-visita.jsx:4212-4214`).
- **«Chips pendientes tenues / contraste bajo»** (visión, `nueva` 390): ratio medido
  7.51:1 sobre el fondo efectivo — muy por encima de AA.
- **«Prefijo 2026- 99 - con espaciado irregular»** (visión, `nueva` 390): el DOM dice
  `2026-09-` en JetBrains Mono con `letter-spacing: normal`.
- **«Mapa vacío / Cargando mapa…»** (visión, todos los escenarios): stub del banco de
  pruebas (`CU_MAPS_JS_URL` indefinida + fetch deshabilitado), no del código.
- **«Typo Lantas sucias»** (visión, `offline` 390): código y DOM dicen «D16: Llantas
  sucias» (`nueva-visita.jsx:272`).
- **«Capitalización acta/Informe inconsistente»** (visión, `offline` 1366): el código
  dice «el acta o el informe», ambas minúsculas (`nueva-visita.jsx:3769`).
- **«Fila Fotos sin acción» como bug** (visión, `faltantes`): correcto según los datos
  — sin carpeta no hay nada que subir; queda cubierto por el P2-2 del harness.
- **«Faltan 22 campos en completa = estado desincronizado»** (visión, `completa`): la
  app refleja fielmente el fixture, que no diligencia los campos obligatorios. No es
  bug de la app (el matiz real es el P3-3).
- **«Botón Guardar debería estar deshabilitado con Sin cambios»** (visión): intencional
  — `disabled` solo mientras `guardando`; guardar siempre está disponible.
- **«Dos CTAs de Consulta POT con pesos distintos»** (visión): sección preexistente,
  no tocada por `ebd83d8`.
