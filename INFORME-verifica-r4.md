# INFORME — Verificación de las correcciones del UI review 4

**Fecha:** 2026-09-13 · **Método:** todo medido en DOM (`getBoundingClientRect` / `getComputedStyle`), visión solo como apoyo. Banco: `qa-centro-control.html` con la estructura real de `app.jsx` (`#app-principal` → `#app-wrapper` → `.header` + `#content-desktop`). Viewports 390×844, 1366×768, 1440×900, 1920×1080. Nada se editó, nada se commiteó.

**Veredicto: los 6 puntos de la review quedan arreglados.** Pero la verificación destapó **un defecto nuevo del banco de pruebas** (P1 del banco, no del producto) que hay que corregir antes de la próxima QA de escritorio: el banco no monta `#sidebar-desktop` y a partir de 1200 px `#content-desktop` cae en la columna del sidebar del grid de `#app-wrapper` (`grid-template-columns: var(--sidebar-w) 1fr`), midiendo 272 px. Con eso el formulario colapsa: a 1440 el grid de `.nv-pantalla` computa `0px 320px` y las secciones miden **41,3 px** de ancho. La app real sí lo monta (`app.jsx:754`), así que no es un fallo de producto — pero sin corregirlo, cualquier cifra de escritorio del banco es inválida. **Todas las mediciones de escritorio de este informe se tomaron con el nodo inyectado en runtime** (`<div id="sidebar-desktop" style="display:flex">` antes de `#content-desktop`), réplica exacta de lo que hace la app; con él, `#content-desktop` mide 1168 px a 1440 y el layout es el correcto.

---

## 1. P1 — la barra ya no tapa la cabecera de la visita → **ARREGLADO**

| Viewport | `.header` real | `--header-h` publicado | Coincide |
|---|---|---|---|
| 390×844 | 111,4 px | 111 px | ✅ |
| 1366×768 | 65,1 px | 65 px | ✅ |
| 1440×900 | 65,1 px | 65 px | ✅ |
| 1920×1080 | 65,1 px | 65 px | ✅ |

Coincide con la medición previa del clon (111,4 en 390, 65,1 en ≥768): el efecto ResizeObserver de `app.jsx` (comentario «Altura real de la barra superior») y la copia del banco publican el mismo valor.

- **«Volver» tocable en 390 con el formulario scrolleado** (el hallazgo que motivó todo): scrolleado al fondo (scrollY 6216,7), `document.elementFromPoint` en el centro del botón devuelve **el botón**. Sin scrollear también. CONFIRMADO arreglado.
- **`?offline=1` en 390:** la barra baja 40 px (`.header` top 40, bottom 151,4), `body.is-offline .nv-header` computa `top: 151px` (= 111 + 40: la regla consume el `--header-h` real, no la constante vencida — con 49 px habría quedado en 89). La cabecera queda en 151,4: **hueco de 0,0 px**, no asoma el formulario. «Volver» hit-test OK. Igual en `?e=completa&offline=1` (hueco 0,0).
- **`#content-desktop` (P3-3) cierra exacto** con `--header-h` real: 1366 → bottom 768,1 (max-height 703 = 768−65); 1440 → 900,1 (835 = 900−65); 1920 → 1080,1. Ya no se extiende bajo la barra.

## 2. Salto a sección con las dos barras encima → **ARREGLADO**

Recorridos los 22 faltantes con clics encadenados cada 30 ms (el caso que el `behavior: 'smooth'` se tragaba 3 de 22), midiendo la holgura `top` del título − `bottom` de la cabecera de la visita **inmediatamente tras cada clic**:

| Viewport | Aterrizajes | Holgura min–max | Negativos |
|---|---|---|---|
| 390×844 (`scroll-margin-top` = `--header-h` + `--nv-header-h`) | 22/22 | 24,5 – 25,1 px | **0** |
| 1366×768 (override: solo `--nv-header-h`, computa 200 px) | 22/22 | 4,0 – 4,5 px | **0** |
| 1440×900 (idem) | 22/22 | 4,0 – 4,5 px | **0** |

Ningún título tapado. El salto instantáneo aterriza los 22 incluso tocándolos en ráfaga. En escritorio el override funciona: `scroll-margin-top: 200px` solo (la barra de la app queda fuera del scroller `#content-desktop`) y la holgura baja a ~4 px, que es el padding interno de la sección.

## 3. Contraste del rótulo de sección (P2) → **ARREGLADO**

Medido compuesto en DOM (color computado sobre fondo efectivo componiendo todas las capas alfa):

- `.ent-falta-sec`: `rgb(120, 88, 38)` sobre `rgb(250, 241, 221)` → **5,80:1**. Confirma la cifra; supera AA (4,5:1). `opacity` computada: **1** (la 0,75 ya no está).
- Jerarquía frente al nombre del campo: rótulo **11 px / 600**, nombre **12 px / 400** (contraste del nombre: 4,50:1, pasa AA). ⚠️ Cifra corregida de la review: el nombre mide **12 px**, no 13 — la jerarquía sigue sostenida por tamaño (12 vs 11) y peso, pero el "13 vs 11" que se citó era vencido.

## 4. Barra de guardar vs tablero (P2) → **ARREGLADO**

Con `?e=completa` (18 fotos + escáner), tablero en su posición peor (página scrolleada, sticky activo):

| Viewport | Tablero bottom | Barra top | Solape | max-height computado |
|---|---|---|---|---|
| 1440×900 | 702,5 px | 807,6 px | **0 px** | 531 px = 900 − 65 − **200** − 104 |
| 1920×1080 | 882,5 px | 987,6 px | **0 px** | 711 px = 1080 − 65 − **200** − 104 |

- El último control del tablero (link «18», contador de fotos) queda **alcanzable**: bottom 670,0 < 807,6 a 1440; 850,0 < 987,6 a 1920. Ya no pasa lo de «contenido 1083 en ventana 618».
- Nota de medición: en escritorio `--nv-header-h` es **200 px** (override ≥768), no 160 — el 160 es el valor móvil. El descuento de 104 px cuadra con la var de escritorio.

## 5. Foco de teclado (P3) → **ARREGLADO**

Barrido de los 26 controles enfocables del tablero con la página scrolleada al fondo (y el tablero re-encarrilado a su tope interno, peor caso):

- 1440×900: **0 violaciones** — ningún control queda bajo la cabecera de la visita al recibir foco.
- 1366×768: **0 violaciones**.

Detalle menor, sin efecto medible: `scroll-margin-top` de `.nv-entregables` computa **200 px** donde `calc(var(--nv-header-h) + 8px)` con la var en 200 daría 208. Chromium lo resuelve así; con 0 violaciones en los dos escritorios medidos, no hay nada que corregir — lo dejo escrito solo para que la cifra del CSS no se cite como 208.

## 6. Regresiones → **LIMPIO** (con un defecto nuevo, del banco)

- **Overflow horizontal:** ninguno en 390, 1366, 1440 ni 1920 (`scrollWidth ≤ clientWidth`).
- **Errores de consola nuevos:** ninguno de los arreglos. Los de la sesión son los conocidos: 404 del favicon, y el 404 del salto `/macros/echo` de Google disparado por `listarInspectoresActivos` (ver WEBHOOK RESILIENTE en CLAUDE.md — es el segundo salto colgado, no nuestro script). Los avisos `CU_MAPS_JS_URL indefinida` y `carpeta-auto … red deshabilitada` son del banco (sin claves ni red).
- **Tablero de dos columnas vs formulario (la decisión «gana el formulario»):** con el sidebar presente, a **1440** el formulario mide **712,7 px** (grid `712,7px 320px`) — por encima del piso de ~600. A **1366** el corte nuevo funciona: el modo dos columnas no aplica (`grid-template-columns: none`) y el formulario va a una columna de **967,3 px**. A 1920: formulario 1192,7 px. Cumple lo decidido.
- **Objetivos táctiles <44 px en 390** (`?e=completa&offline=1`, 105 clicables visibles): solo 1 — el botón «Salir» del header (55×27). **Preexistente**, no viene de esta ronda (está en la app real igual), pero lo dejo anotado: es el único objetivo bajo el piso táctil de 44 del proyecto.
- **Cifras que cambiaron legítimamente por el banco nuevo** (no son fallos): el ancho disponible en escritorio ahora descuenta sidebar (272) + padding; el `--nv-header-h` de escritorio es 200 y el móvil 160.

---

## Pendiente de esta verificación (fuera de alcance, una línea cada uno)

1. **Corregir el banco: añadir `#sidebar-desktop`** entre `.header` y `#content-desktop` (como `app.jsx:754`, con `display:flex`). Sin eso, toda QA de escritorio sale rota. Es una línea en `qa-centro-control.html`; quedará para quien toque código — esta tarea no editaba nada.
2. Nota menor: el banco promete «nada sale a la red», pero `listarInspectoresActivos` escapa al stub de `fetch` y golpea el `/exec` real (lectura inofensiva, ensucia la consola con el 404 del eco de Google). Vale revisar si el stub debe ir antes de que `api.js` capture la referencia.

**Conclusión: los seis arreglos resisten la medición. Listos para desplegar backend + front juntos (backend primero), con la verificación en real que ya pide el ESTADO (generar un RF quitando fotos y contarlas en el documento).**
