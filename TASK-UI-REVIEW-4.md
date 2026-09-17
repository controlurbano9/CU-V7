# TASK-UI-REVIEW 4 — cabecera fija, escritorio en dos columnas y campos faltantes clicables

Cuarta pasada sobre el banco de pruebas. Lo que hay que revisar son **tres
cambios de hoy, hechos por Opus**, y esta es la primera vez que los mira
alguien distinto de quien los escribió. Están commiteados (`188ac6c`,
`c1f7fc0`, `d284991`) y **a punto de desplegarse a producción**: lo que
encuentres aquí se corrige antes de salir.

## Método

- URL base `http://127.0.0.1:8099/qa-centro-control.html` (el servidor ya
  está levantado; si no, `python -m http.server 8099` en `cu-v5-dev/`).
- Escenarios: `?e=nueva|faltantes|completa|offline`.
- Viewports: **390×844**, **1366×768**, **1440×900** y **1920×1080**. Los dos
  últimos son nuevos: el layout de dos columnas solo existe desde 1440.
- Herramientas: playwright MCP (`mcp__plugin_playwright_playwright__*`). Las
  capturas se analizan con `mcp__zai-mcp-server__analyze_image` — `Read` de
  imágenes no las entrega inline.
- **Nada se afirma sin medirlo en DOM** (`getBoundingClientRect`,
  `getComputedStyle`). La visión especula: todo lo que venga de una imagen se
  confirma con JS. En la pasada anterior la visión inventó 10 hallazgos que la
  medición desmintió.
- ⚠️ **El banco carga `styles.css` y `bundle.min.js` sin `?v=`**, así que el
  navegador te puede servir una versión vieja y medirías el diseño anterior.
  Antes de empezar, comprueba que `.nv-header` computa `position: sticky`; si
  no, fuerza recarga (cambia el `href` del `<link>` a `styles.css?b=<ts>` o
  duplica el html con cache-buster). **Si mides el CSS viejo, el informe entero
  no sirve.**
- Ignora el ruido del banco: favicon 404, `CU_MAPS_JS_URL`, rechazos de fetch
  del stub («red deshabilitada»), fallos de carga de `drive.google.com`.

## Cambio 1 — La cabecera de la visita quedó fija (`188ac6c`)

Antes subía con el scroll. Ahora `.nv-header` es `position: sticky` para que
el inspector sepa siempre qué visita está diligenciando y pueda salir sin
volver arriba. El tope depende de quién scrollea: en móvil el documento, bajo
el `.app-header` (`top: var(--header-h)` = 49 px); en escritorio
`#content-desktop`, que tiene `overflow-y: auto` (`top: 0`). Un margen negativo
más un padding de `--content-pad-top` hacen que la cabecera tape el padding
superior del contenedor.

**En móvil (<768 px) la cabecera fija va recortada a propósito**: se ocultan el
`.page-title` (decía «Continuar visita», genérico) y el `.estado-resumen`, y
`.estado-dir` queda a una línea con puntos suspensivos. Fija entera medía
208 px de 844 (25%).

Verifica y **mide**:

1. Que se queda fija al hacer scroll en los cuatro viewports y en los cuatro
   escenarios que tengan formulario (`?e=nueva` abre el modal de tipo de
   visita, ahí no aplica: dilo y sigue).
2. **Que no asoma nada por encima de la cabecera al subir el formulario.** Es
   el riesgo principal del margen negativo. Comprueba con
   `document.elementFromPoint` en varios puntos de la franja superior.
3. Alto de la cabecera pegada y su porcentaje del viewport en cada ancho.
   Referencias medidas por Opus: **153 px en 390** y **190 px en 1366/1440**.
   Si te sale otra cosa, dilo.
4. Que en 390 la dirección cortada **sigue diciendo lo esencial** (la vía y el
   número). Si el corte se come el número de la casa, es un P2.
5. Que la cabecera no tapa nada con lo que haya que interactuar: abre los
   desplegables y modales de las primeras secciones y mira si la cabecera se
   superpone mal (z-index 30).
6. Contraste y objetivos táctiles dentro de la cabecera (el botón «Volver»).

## Cambio 2 — Escritorio ancho en dos columnas (`c1f7fc0`)

Desde **1440 px** la pantalla de visita es un grid: formulario a la izquierda y
tablero de entregables (`.nv-entregables`, 320 px) `sticky` a la derecha, bajo
la cabecera, que ocupa el ancho completo. Por debajo de 1440 no cambia nada. La
colocación es solo CSS: **el DOM no se movió**, así que el orden de lectura y
de tabulación sigue siendo el de siempre.

Verifica y **mide**:

1. Que a **1366 y 390 no cambió absolutamente nada** respecto al layout
   anterior (una columna, entregables al final).
2. A **1440 y 1920**: ancho real de la columna del formulario, ancho y posición
   del tablero, y que no hay overflow horizontal.
3. **Que se llega al último botón del tablero** con 18 fotos cargadas
   (`?e=completa`). El tablero tiene `overflow-y: auto` y `max-height`; si su
   contenido no cabe, debe poder recorrerse. Opus midió 1083 px de contenido en
   una ventana de 619.
4. **El sticky del tablero usa una constante, `--nv-header-h: 200px`**, mientras
   la cabecera real mide 190. Comprueba si hay algún caso (dirección larga que
   envuelva, radicado largo, aviso de carpeta ausente) donde la cabecera crezca
   por encima de 200 px y el tablero quede tapado. **Este es el punto débil
   conocido del cambio: búscale el caso que lo rompe.**
5. Que dentro de 320 px nada se sale ni se solapa: botones `.ent-btn` (deben
   seguir en 92×44), grilla de fotos (debe dar 4 columnas de ~61 px), el
   escáner de la orden, el plegable de campos faltantes.
6. Orden de tabulación: recorre con Tab desde la cabecera y confirma que sigue
   el orden visual/lógico y que el foco nunca queda invisible bajo la cabecera
   fija o fuera del área con scroll del tablero.
7. Que la barra fija de «Guardar cambios» no se solapa con el tablero.

## Cambio 3 — Campos faltantes clicables (`d284991`)

Cada renglón del plegable «Ver qué campos faltan» es ahora un botón que lleva a
la **sección** donde se diligencia el campo (no al campo: no hay id estable), y
la sección destella 1,6 s al llegar. El ancla es el título de la sección;
`.form-seccion` tiene `scroll-margin-top: var(--nv-header-h)` para que la
cabecera fija no tape el título.

Verifica y **mide**:

1. **Recorre los faltantes uno por uno** en `?e=faltantes` (Opus midió 20) y en
   `?e=nueva`/`?e=offline` si los hay: cada clic debe llevar a una sección que
   existe y dejar su **título visible y no tapado** por la cabecera. Reporta la
   tabla campo → sección → `top` del título tras el salto.
2. Los casos límite: el primero de la lista y el último (secciones al final del
   documento, donde el scroll ya no da más de sí).
3. Que el destello se ve y se quita solo, y que con `prefers-reduced-motion:
   reduce` no hay animación pero sí señal (debe quedar el recuadro).
4. Objetivo táctil de cada renglón ≥44 px y contraste del texto secundario
   (`.ent-falta-sec`, `opacity: 0.75` sobre fondo ámbar) — **mídelo**, es
   candidato a no llegar a 4.5:1.
5. Con la lista abierta y 20 campos, ¿rompe algo dentro del tablero de 320 px
   en 1440? ¿Y en 390?
6. Que los tres avisos que listan campos faltantes al intentar generar acta o
   informe **siguen mostrando los nombres** y no `[object Object]`: el tipo de
   dato cambió de string a `{ nombre, seccion }`. No puedes generar documentos
   en el banco, así que verifícalo leyendo el código (`nueva-visita.jsx`, busca
   `slice(0, 20).map`) y dilo en el informe.

## Regresiones en toda la zona

Overflow horizontal, errores de consola, objetivos táctiles <44 px y contraste,
en **todos** los pares escenario×viewport que apliquen. Presta atención a que
los tres cambios conviven: la cabecera fija + el tablero sticky + el salto a
sección se pisan entre sí con facilidad.

## Salida — escribe `INFORME-ui-review-4.md` y para

Formato P1 / P2 / P3 / Descartado, cada hallazgo con su medición y el
`archivo:línea` donde se corrige. Un hallazgo sin cifra medida no es un
hallazgo. Si algo que digo aquí que Opus midió no te cuadra, **dilo**: prefiero
una contradicción medida a un informe de acuerdo.

**No arregles nada**, no edites código, no hagas commit.
