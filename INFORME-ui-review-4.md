# INFORME-ui-review-4 — cabecera fija, escritorio en dos columnas, campos faltantes clicables

**Fecha:** 2026-09-13 · **Revisor:** GLM (segundo par de ojos, primera pasada sobre `188ac6c` / `c1f7fc0` / `d284991`)
**Banco:** `http://127.0.0.1:8099/qa-centro-control.html` · Escenarios `faltantes`/`completa`/`offline`/`nueva` · Viewports 390×844, 1366×768, 1440×900, 1920×1080.
**CSS fresco verificado:** `.nv-header` computa `position: sticky; top: var(--header-h); margin-top: -28px; padding-top: 28px; z-index: 30` — sí se estaba sirviendo el diseño nuevo.
**Método:** toda cifra de este informe sale de `getBoundingClientRect` / `getComputedStyle` en DOM, o de lectura de código con `archivo:línea`. `browser_run_code_unsafe` no estaba autorizado en esta sesión: la emulación nativa de `prefers-reduced-motion` no fue posible y se verificó por rama JS (stub de `matchMedia`) + regla CSS en fuente. Consola limpia en todos los recorridos (solo el ruido declarado del banco: favicon 404, `CU_MAPS_JS_URL`, rechazos del stub).

---

## P1 — `--header-h: 49px` no es la altura real de la barra superior de la app: en móvil el botón «Volver» queda bajo la barra, intocable

El TASK da por cierto que el tope móvil de `.nv-header` es «`top: var(--header-h)` = 49 px». **No cuadra con la app real.** La barra superior es `.header` (`app.jsx:698`, `styles.css:206`: `position: sticky; top: 0; z-index: 200`, `padding: 12px 20px 11px`) y no existe ninguna regla que la fije a 49 px — `--header-h` (styles.css:75) es una constante suelta.

**Medición** (clon fiel de la estructura JSX de `app.jsx:698-728` insertado en el banco, 390×844, mismas clases y estilos computados):

| Elemento | Valor medido |
|---|---|
| `.header` real a 390 (título y línea de usuario envueltos a 2 líneas c/u) | **111,4 px** |
| h1 «Control Urbano · Insp. N°9» (17 px) | 2 líneas = 52,7 px |
| p «DANIEL PEDRAZA · Inspector de Control Urbano» (11 px) | 2 líneas = 34,1 px |
| Piso sin envolver (imposible a 390: el texto no cabe) | 67,4 px |
| `--header-h` declarado | 49 px |

**Consecuencia en la app real** (el banco no monta `.header`, por eso ahí no se ve): al scrollear, `.nv-header` se pega a `top: 49px` (styles.css:1044) y sus primeros **62,4 px quedan detrás de `.header`** (z 200 vs z 30, fondo `rgba(...,0.94)` + blur, opaco a efectos prácticas). La primera fila de la cabecera — el botón **«← Volver»** (`nueva-visita.jsx:3172`, mide 84,2×44, ocupa y≈65..109 en la banda pegada) — queda **totalmente cubierta: imposible tocarla con la visita scrolleada**. La identidad de la visita (badge de estado, radicado) también queda tapada hasta y≈111. La banda 0..49 libre que medí en el banco con `elementFromPoint` es exactamente el hueco donde esto se manifiesta.

**Agrava en offline:** `body.is-offline .header { margin-top: 40px }` (styles.css:1663) baja la barra a 40..151,4 y la banda cubierta sube a **102,4 px**.

**No es regresión de esta ronda** — antes `--header-h` solo alimentaba el `max-height` de `#content-desktop` y el desfase era invisible. El commit `188ac6c` convirtió la constante vencida en geometría visible. En escritorio el efecto es menor (ver P3-3).

**Dónde se corrige:** `styles.css:75` (poner la altura real por breakpoint — 111,4 px móvil tal como está el markup, o compactar `.header` en móvil y entonces fijar el valor compacto; si se adopta la segunda, la regla nueva va junto a styles.css:206). El caso offline pide además `body.is-offline .nv-header { top: calc(var(--header-h) + 40px) }` junto a styles.css:1663. Alternativa robusta: medir `.header` al montar y actualizar la variable.

---

## P2 — Contraste del rótulo de sección en los faltantes: 2,9:1 (exige 4,5)

`.ent-falta-sec` (styles.css:1185-1189) usa el mismo ámbar `rgb(141,104,45)` que el nombre del campo pero con `opacity: 0.75` sobre fondo `rgb(250,241,221)` (`.ent-faltan`, styles.css:1152). Medido compuesto:

| Texto | Ratio | Exigencia (11-12 px, texto normal) |
|---|---|---|
| Nombre del campo (`opacity` 1) | **4,50:1** | 4,5 → pasa en el límite exacto, sin margen |
| **`.ent-falta-sec` (opacity 0.75)** | **2,90:1** | 4,5 → **falla** |

Es el dato que el TASK anticipaba; confirmado. El nombre de la sección es, además, la mitad de la información del control (dice adónde lleva el salto).

**Dónde se corrige:** `styles.css:1186` — quitar la opacidad (deja 4,50:1, justo) o usar un tono más oscuro para el rótulo (p. ej. el mismo tratamiento de `.ent-nota`/`--ink-3`). Si se saca la opacidad, vigilar que el campo siga pesando más visualmente que el rótulo por peso/ tamaño, no por color.

---

## P2 — La barra fija de guardar tapa el borde inferior del tablero: 11,4 px @1440×900, ~17 px @1920×1080

La ventana del tablero reserva 32 px: `max-height: calc(100vh - var(--header-h) - var(--nv-header-h) - 32px)` (styles.css:1101). La barra fija real mide **92,4 px** (`position: fixed; bottom: 0; z-index: 60`, `nueva-visita.jsx:4335-4340`, con línea de estado + botón de 48,7 px).

| Viewport | Tablero (top + maxH) | Barra top | Solape medido |
|---|---|---|---|
| 1440×900 | 200 + 619 = 819 | 807,6 | **11,4 px** |
| 1920×1080 | 205,8 + 799 (scroll de página intermedio) | 987,6 | **17,2 px** |

Efecto con contenido que llena la ventana (`?e=completa`: scrollHeight **1083** en client **618** — coincide con la medición de Opus): el borde inferior del tablero y el tramo final de su scrollbar quedan bajo la barra; el último renglón (registro fotográfico) puede quedar con su borde cortado. El último control medido (miniatura 18, 61,3 px de alto) quedó a 792,2 < 807,6, aún alcanzable — el solape hoy muerde padding y scrollbar, no un botón entero.

**Dónde se corrige:** `styles.css:1101` — restar la altura real de la barra (~92 px) en lugar de 32 px (o medirla). El mismo ajuste convive con el P1 si `--header-h` cambia.

---

## P3 — El salto a sección se traga el scroll de forma intermitente (scroll suave de Chrome)

El handler siempre corre: en cada clic verifiqué que `scrollIntoView` se invoca con la sección correcta y que el destello se pinta (incluido en los clics donde la página **no** se movió). Pero la animación `behavior: 'smooth'` (`nueva-visita.jsx:3157`) se perdió **3 veces** durante el recorrido de los 22 faltantes cuando los clics se suceden rápido (filas 3-4 del lote, fila 10 con reintento) y 1 vez en aislado justo después de un scroll programático interrumpido; el mismo clic repetido aislado funcionó (scrollY exacto 1695 = destino teórico 1905+20−210). Es el comportamiento conocido de Chrome: un `scrollIntoView` smooth iniciado mientras otro scroll (o su cancelación) está en marcha puede tragarse. El inspector impaciente que toca dos filas seguidas lo pega.

**Dónde se corrige:** `nueva-visita.jsx:3157` — `behavior: 'auto'` siempre (el destello ya señala el destino), o cancelar el scroll anterior antes del nuevo (guard con el elemento previo). Bajo `prefers-reduced-motion` ya es `'auto'` y ese caso no sufre.

---

## P3 — Foco de teclado 46 px bajo la cabecera cuando la página está al fondo

Con la página scrolleada al final (donde el tablero pierde el sticky y sube con el documento), `focus()` sobre «Abrir» del tablero lo dejó en `top: 143,7` con la cabecera hasta 189,8 → **46 px del control bajo la cabecera fija**. El barrido sobre 125 tabbables dio solo este caso real (el otro hit es «Volver», que vive dentro de la cabecera: falso positivo). Falta `scroll-margin-top` en los controles del tablero para el scroll-mínimo del foco.

**Dónde se corrige:** `styles.css:1090` (bloque `.nv-entregables`) — `scroll-margin-top: calc(var(--nv-header-h) + 8px)` en el tablero o en `.ent-btn`/`.ent-fila`.

## P3 — `#content-desktop` se extiende 16,1 px bajo la barra superior en escritorio

`.header` real a ≥768 (probe, padding 10px 24px, sin envolver): **65,1 px** vs `--header-h` 49 px. `max-height: calc(100vh - var(--header-h))` (styles.css:1745) hace que el área de contenido termine 16,1 px más abajo de donde empieza a taparla la barra (opaca, z 200). Cosmético — el contenido pasa por debajo al scrollear, nada queda inaccesible. Se arregla solo si el P1 ajusta `--header-h` por breakpoint.

---

## Descartado / verificado sin hallazgo

**Cambio 1 — cabecera fija.** Se pega en los tres anchos con formulario: 390 `top=49` (banco; en la app real el anclaje correcto lo da el fix del P1), 1366/1440/1920 `top=0` bajo `#content-desktop`-like. Alturas: **153,2 px @390 (18,2 % de 844)** y **189,8 px @1366/1440 (24,7 % de 768, 21,1 % de 900)** — coinciden con las referencias de Opus (153 / 190). `elementFromPoint` en la franja superior (39 puntos por viewport, hasta 150 px de profundidad): **nada del formulario asoma dentro de la banda de la cabecera**; en el banco la franja 0..49 móvil muestra contenido solo porque el banco no monta `.header` — ese hueco es, de hecho, el P1 visto desde el banco. Dirección recortada en móvil: 1 línea (20,1 px) con `nowrap`+`ellipsis`, mantiene el arranque «CR 52 64-134» (la vía y el número van primero; el corte se come barrio/fecha); con una dirección de 210 caracteres sigue en 1 línea y la cabecera no crece (153,2). Contrastes de la cabecera ≥ 6,62:1 (badge INICIADO 6,62 · estado-id/chips 6,89 · Volver 13,49 · título y dirección 15,22). Objetivo táctil de Volver 84,2×44. Modales y overlays por encima de la cabecera: `.dlg-overlay` y `.offline-banner` z 9999, nav 200, FAB 199 > 30 (styles.css:212, 1044, 1314, 1499, 1636).

**Cambio 2 — dos columnas ≥1440.** A **1366 y 390 no cambió nada**: `.nv-pantalla` computa `display: block`, tablero `position: static`, sin `max-height` ni sticky (verificado en computed style; el media query es `min-width: 1440px`, styles.css:1076). A **1440**: grid `minmax(0,1fr) 320px`, gap 24, columna de formulario 1048,7 px (≈ `--content-max` 1100 descontando scrollbar), tablero 320 px sticky `top: 200px`, `max-height` 619 = 900−49−200−32 (la medición de Opus). A **1920**: formulario 1200 px, tablero 320, max-height 799. `--content-max` es 1100 ≥768 y 1200 ≥1920 (styles.css:1775, 1779): el formulario conserva el ancho de hoy; el comentario del CSS cumple. Sin overflow horizontal en los cuatro anchos. Dentro de los 320 px: sin desbordes internos (scrollWidth 303 = clientWidth 303), `.ent-btn` **92×44** en todos los renglones, grilla de fotos **4 columnas de 61 px** con las 18 celdas, escáner de la orden presente, plegable con filas de 44–87 px. Último botón alcanzable con 18 fotos: contenido 1083 en ventana 618, scrollea; último control a 792,2 < 807,6 de la barra. **El punto débil del `--nv-header-h: 200px` no se pudo romper con datos plausibles:** holgura medida 10,2 px; el aviso de carpeta/sin guardar vive en el tablero o exige `!filaEditando` (`nueva-visita.jsx:1482`) y sin fila no hay tablero, así que aviso y tablero no coexisten; una dirección de 210 caracteres sigue en 1 línea a 1440. Ruptura solo con datos patológicos (≈2 líneas extra de envoltura). Orden de tabulación: parte en «Volver» → «Radicado» (primer campo) y sigue el orden del DOM, que no se movió: formulario completo → tablero → barra de guardar; el tablero entra tarde en el orden de Tab pese a estar a la vista — consecuencia aceptada del «el DOM no se movió» que declara el propio cambio. Barra de guardar vs tablero: ver P2-2.

**Cambio 3 — faltantes clicables.** En `?e=faltantes` hay **22 faltantes, no 20** como midió Opus (todos llegan a sección existente). Recorrido completo (tabla campo → sección → `top` del título tras asentarse el scroll): los 22 aterrizan con el título **visible y sin tapar**, a `top 227,8–227,9` con cabecera hasta 202,2 → holgura constante **+25,7 px** (= scroll-margin 210 + padding de sección, en el banco móvil). Casos límite: el primero de la lista (Persona que atiende) y el último (¿Dentro de retiro de quebrada? → Consulta norma POT, con 2393 px de documento por delante: el scroll da de sí, aterriza exacto). Destello: clase puesta al clic (a +250 ms ya está), anillo ámbar 3 px (`rgb(141,104,45)`), **se quita solo** a 1,6 s y la sombra vuelve a la de tarjeta. `prefers-reduced-motion`: con `matchMedia` stubbed a `reduce` el salto es inmediato (título a 227,9 px a los 120 ms — rama `'auto'` de `nueva-visita.jsx:3153-3157`) y el destello se aplica; la regla CSS de respaldo existe en fuente (styles.css:1199-1201: `animation: none` + recuadro persistente). La emulación nativa del media no fue posible en esta sesión (herramienta denegada) — verificado por rama JS + fuente CSS. Objetivos táctiles: 44–87 px por fila. El plegable abierto con 22 filas dentro de los 320 px del tablero no rompe nada (sin overflow, filas 44–87 px); en 390 es ancho completo, igual de limpio. **Avisos de generación: sin `[object Object]`** — los tres pasan por `.map(f => '• ' + f.nombre)` (`nueva-visita.jsx:2762`, `2785`, `2818`); verificado leyendo el código, el banco no genera documentos.

**Escenarios `nueva` y `offline`.** `nueva` abre el selector de tipo de visita (sin formulario ni cabecera: no aplica cabecera fija, como anticipa el TASK), sin overflow. `offline`: cabecera estable 153,2 px sticky, tablero presente, puntos ámbar de estado, 22 faltantes, sin overflow. Nota de app real para offline: el banner desplaza `.header` 40 px (styles.css:1663) — cubre más cabecera de visita todavía; va dentro del fix del P1.

**Coexistencia de los tres cambios.** Sin pisones incompatibles encontrados más allá de lo listado: cabecera fija + tablero sticky comparten `--nv-header-h` (holgura 10,2 px medida), el salto a sección convive con ambos (aterrizaje verificado con cabecera pegada), y el único roce duro es el de la barra de guardar con el tablero (P2-2).

## Contradicciones con lo que decía el TASK / Opus

1. **«`top: var(--header-h)` = 49 px»** — la constante no corresponde a la barra real (111,4 px móvil medidos): P1.
2. **«Opus midió 20» faltantes** — son 22 en `?e=faltantes`.
3. El resto de las cifras de Opus cuadraron: cabecera 153/190, tablero 1083/619, `--nv-header-h` 200, grilla 4×61, `--header-h` reserva del tablero.

*Sin ediciones de código, sin commit. El banco queda en su estado original (las inyecciones DOM de medición se revirtieron en el propio evaluate).*
