# TASK — Verificar las correcciones de tu review 4

Tu `INFORME-ui-review-4.md` encontró un P1, dos P2 y tres P3. Están
corregidos. Esto es **solo verificación**: medir si los arreglos hacen lo que
prometen y si rompieron algo. Nada se despliega hasta que esto salga limpio.

**El banco cambió, y cambió por tu P1.** Tenías razón en que `--header-h` era
una constante vencida, y la razón de fondo de que sobreviviera tres revisiones
es que `qa-centro-control.html` montaba la pantalla suelta, sin barra superior.
Ahora monta la estructura real de `app.jsx` (`#app-principal` →
`#app-wrapper` → `.header` + `#content-desktop`) y trae el mismo efecto que la
app para publicar el alto real de la barra en `--header-h`. Además carga
`styles.css` y los JS con cache-buster: **ya no hace falta el truco del
`?b=`**, cada recarga trae lo último.

- URL `http://127.0.0.1:8099/qa-centro-control.html`, escenarios
  `?e=nueva|faltantes|completa|offline`.
- Viewports 390×844, 1366×768, 1440×900, 1920×1080.
- Mismo método de siempre: **toda cifra de `getBoundingClientRect` /
  `getComputedStyle`**, la visión no decide nada.
- Novedad útil: **`?offline=1`** añade `body.is-offline` (lo que hace el banner
  de sin conexión: baja la barra 40 px). Combínalo: `?e=completa&offline=1`.

## Lo que hay que medir

### 1. P1 — la barra ya no tapa la cabecera de la visita

`--header-h` lo escribe ahora `app.jsx` midiendo `.header` con un
`ResizeObserver` (`app.jsx`, efecto «Altura real de la barra superior»), y el
banco hace lo mismo. `:root` conserva 49 px solo como valor de arranque
(`styles.css:75`).

- Alto real de `.header` y valor de `--header-h` en los cuatro viewports.
  ¿Coinciden? Tu medición previa del clon daba 111,4 px en 390 y 65,1 en ≥768.
- **En 390, con el formulario scrolleado: ¿el botón «Volver» es tocable?**
  `document.elementFromPoint` en su centro debe devolver el botón (o un hijo
  suyo), no `.header`. Es el hallazgo que motivó todo: confírmalo o túmbalo.
- Lo mismo con `?offline=1`, donde la barra baja 40 px: hay una regla nueva
  `body.is-offline .nv-header { top: calc(var(--header-h) + 40px) }`
  (`styles.css`, junto a `.nv-header`). Verifica que la cabecera de la visita
  baja con la barra y que no queda un hueco por el que asome el formulario.
- `#content-desktop` (tu P3-3): con `--header-h` real, ¿sigue extendiéndose
  bajo la barra? Debería cerrar exacto.

### 2. Salto a sección con las dos barras encima

`--nv-header-h` bajó de 210 a **160** (móvil) porque ya no incluye la barra de
la app; el `scroll-margin-top` de `.form-seccion` pasó a
`calc(var(--header-h) + var(--nv-header-h))`, con override a solo
`var(--nv-header-h)` en ≥768 (ahí el scroller es `#content-desktop` y la barra
queda fuera).

- **Recorre otra vez los 22 faltantes en 390** y reporta la holgura entre el
  fondo de la cabecera de la visita y el `top` del título. Debe ser pequeña y
  **positiva**; negativa = título tapado, que es el fallo que esto arregla.
- Lo mismo en 1366 y 1440 (donde el override debe dejarlo como estaba).
- El salto es ahora **instantáneo** (`behavior: 'auto'` siempre,
  `nueva-visita.jsx`, en `_irASeccion`): tu P3 decía que el suave se tragaba
  3 de 22. **Encadena clics rápidos y confirma que ahora aterrizan los 22.**

### 3. Contraste del rótulo de sección (tu P2)

`.ent-falta-sec` perdió la `opacity: 0.75` y usa `rgb(120,88,38)`. Calculado
**5,80:1** sobre `rgb(250,241,221)`. **Mídelo compuesto en DOM** y confirma o
corrige la cifra. Comprueba de paso que el nombre del campo sigue pesando más
que el rótulo (por tamaño, 13 vs 11).

### 4. Barra de guardar vs tablero (tu P2)

La ventana del tablero pasó a descontar 104 px abajo en vez de 32
(`styles.css`, `.nv-entregables`). **Mide el solape a 1440×900 y 1920×1080**:
debe ser 0 o el tablero debe terminar por encima de la barra. Y con
`?e=completa` confirma que el último control del tablero sigue alcanzable
(antes: contenido 1083 en ventana 618).

### 5. Foco de teclado (tu P3)

`.nv-entregables` tiene ahora `scroll-margin-top: calc(var(--nv-header-h) +
8px)`. Repite tu barrido de tabbables con la página al fondo: ningún control
del tablero debe quedar bajo la cabecera al recibir foco.

### 6. Regresiones

El banco ahora tiene barra, sidebar y contenedor con scroll: **algunas de tus
cifras anteriores van a cambiar legítimamente** (el ancho del formulario a 1440
ya descuenta la barra lateral de 272 px, que el banco antes no montaba). No lo
reportes como fallo: repórtalo como cifra nueva y di cuál era la vieja. Lo que
sí es fallo: overflow horizontal, solapes, objetivos <44 px, contrastes bajo
umbral, errores de consola nuevos, y **el tablero de dos columnas estrechando
el formulario por debajo de lo aceptable** ahora que el sidebar está presente
— si a 1440 el formulario cae por debajo de ~600 px, dilo con la cifra: la
decisión tomada fue que **si el tablero estrecha el formulario, gana el
formulario** y el corte sube.

## Salida — `INFORME-verifica-r4.md` y para

Por cada punto: **arreglado / no arreglado / arreglado pero rompe X**, con la
cifra. Si algún arreglo no resiste la medición, dilo sin adornos. **No edites
código, no hagas commit.**
