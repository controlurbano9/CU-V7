# TASK — Correcciones de la ronda de entregables

Correcciones de la ronda de entregables: el arreglo 1 sale de una revisión del
código; los arreglos 2-6 son los hallazgos medidos de `INFORME-ui-review-3.md`
(review visual, 8 pares escenario×viewport, sin P1). Léelo si necesitas el
detalle de una medición: **las cifras de aquí ya están verificadas, no las
vuelvas a medir para decidir si el arreglo aplica**.

## Arreglo 1 — Botones habilitados sin carpeta en Drive

### El problema (verificado)

La fila en la BD y la carpeta en Drive **se crean en dos llamadas distintas**:
`agregar` crea la fila y `crearCarpetaVisita` es una acción aparte
(`apps_script_unificado.js:859`). Basta con que la segunda falle —sin señal, el
caso normal en campo— para quedar con la visita guardada y **sin carpeta**.

En ese estado, el bloque de entregables ya se renderiza (la puerta es
`filaEditando`, `nueva-visita.jsx:3815`) y los botones de **acta, informe y
registro fotográfico quedan habilitados**: su único `disabled` es `docOcupado`
(`:3882`, `:3890`, `:3913`, `:3921`, `:3968`, `:3976`). El inspector pulsa,
espera, y recibe del backend un `Falta idCarpetaVisita` (`:2458`, `:2966`) que
no le dice qué hacer. Sin señal puede repetirlo varias veces.

No hay riesgo de datos —el backend se defiende bien—: el problema es que la UI
ofrece una acción que sabe que va a fallar.

### El arreglo

Reutiliza lo que ya existe, no inventes nada nuevo:

- Los tres renglones que dependen de la carpeta (acta, informe, registro
  fotográfico) se deshabilitan también cuando **no hay `d.idCarpetaVisita`**:
  la condición pasa a ser `docOcupado || !d.idCarpetaVisita` (y el registro
  conserva su `|| cargandoFotos`).
- Su punto de estado usa el tono **`apagado`** (gris, «todavía no aplica»), que
  ya existe y significa exactamente esto. No inventes un tono nuevo ni un color
  de error: no es un fallo del inspector.
- El texto accesible del punto debe explicar la causa en ese caso concreto
  («Requiere la carpeta en Drive»), no quedarse en el genérico.
- **Un aviso que diga qué hacer.** Cuando hay `filaEditando` pero no
  `idCarpetaVisita`, muestra sobre los renglones un `.ent-aviso` (la clase ya
  existe, se usa en `:3814`) con un texto del tipo: «La carpeta en Drive no se
  creó. Vuelve a guardar cuando tengas señal para poder subir fotos y generar
  los documentos.» Redáctalo tú, pero debe decir **qué pasó** y **qué hacer**.
- El escáner de la orden ya se comporta bien (solo se pinta con
  `idCarpetaVisita`): **no lo toques**.
- La carpeta en Drive, si tiene su propio renglón, sigue mostrándose: es el que
  informa justamente de que no está.

### Qué NO hacer

- No reintentes `crearCarpetaVisita` automáticamente desde aquí. Puede ser una
  buena idea, pero es otra tarea y toca el flujo de guardado.
- No ocultes los renglones: el inspector debe seguir viendo qué entregables
  existen y por qué no puede generarlos todavía (mismo criterio que el aviso de
  «Guarda la visita…»).
- No toques el backend ni el contrato de las acciones.

## Arreglo 2 — El punto de estado «apagado» es invisible (P2-1)

`.ent-dot` sin clase de tono usa `var(--surface-3)` = `rgb(222,213,200)` sobre
fondo `rgb(255,251,245)`: **ratio 1.41**, y WCAG 1.4.11 pide ≥3:1 para
elementos gráficos. «Requiere fotos» se lee como «a esta fila se le cayó el
estado». Los otros dos tonos sí pasan (`ed-ok` 4.56, `ed-pend` 4.91).

`styles.css:1095-1098` — dale al tono por defecto un gris medio que llegue a
**3:1 como mínimo** contra `rgb(255,251,245)` (`--ink-4` es candidato; si no
llega, oscurécelo). **Calcula el ratio y escríbelo en el resumen**; no lo
elijas a ojo. Sigue siendo gris: es «todavía no aplica», no un error.

## Arreglo 3 — El botón principal brinca 50 px entre renglones (P3-1)

A 1366 en `?e=completa`, las filas con ↻ (orden, acta, informe) terminan su
botón principal en x=1160.3 y las filas sin ↻ (carpeta, registro) en x=1210.3:
**50 px de salto** en la columna de acciones, y el punto de estado se desplaza
igual. Sin ningún ↻ (`faltantes`, `offline`) sí quedan alineados. Esto
contradice tanto el comentario de `styles.css:1104-1106` como la observación
que originó el rediseño («los botones deben tener las mismas dimensiones»).

`styles.css:1103` (`.ent-acciones`) — **reserva siempre el hueco de la acción
secundaria**: las filas sin ↻ deben dejar el mismo espacio de 44 px, de modo
que los botones principales caigan en columna en todos los renglones. Hazlo
con un ancho reservado en el contenedor, no metiendo un botón falso en el DOM
(un elemento vacío ensucia el recorrido del lector de pantalla). En 390 px la
fila envuelve y el problema no existe: **no cambies el comportamiento móvil**.

## Arreglo 4 — «Abrir» sale subrayado y «Generar» no (P3-2)

`a.ent-btn` computa `text-decoration: underline`: `.btn-accion`
(`styles.css:678-689`) no declara `text-decoration: none` y el `<a>` hereda el
subrayado del navegador. Misma caja, dos metáforas distintas.

`styles.css:678` — añade `text-decoration: none` a `.btn-accion`. Comprueba que
no rompes ningún otro uso de esa clase fuera de la zona de entregables.

## Arreglo 5 — «F-GGO-46» se parte por el guion en 390 px (P3-3)

En `?e=completa` a 390, el meta del registro fotográfico parte el código en dos
líneas: «F-» / «GGO-46». Un código de formato no se parte.

`nueva-visita.jsx:3944` o `styles.css:1088` — usa guion de no separación
(U+2011, `F‑GGO‑46`) o `white-space: nowrap` sobre el código. Aplica el mismo
criterio a **F-GGO-43** en el renglón del informe, que tiene el mismo riesgo.

## Arreglo 6 — La grilla se estira a 17 columnas en escritorio (P3-5)

A 1366 las 18 fotos salen en 17 columnas de 56.6 px y dejan una segunda fila
con una sola celda: el contenedor mide 1058 px y `repeat(auto-fill,
minmax(56px, 1fr))` lo llena entero. Funciona, pero miniaturas de 56 px en una
tira de 17 se leen peor que unas pocas más grandes.

`styles.css:1118` — limita el ancho de la grilla (p. ej. `max-width` alrededor
de 560 px) y/o sube el mínimo de la celda, de modo que en escritorio queden
celdas más grandes en varias filas en vez de una tira. **No toques el
comportamiento en 390 px**, donde hoy quedan 4 columnas limpias y está bien.

## Lo que el review señaló y NO se arregla

- **P3-4** («Generar» del registro habilitado sin carpeta ni fotos) queda
  cubierto por el **arreglo 1**, que ataca la causa en los tres renglones. Al
  aplicarlo, añade también el caso sin fotos que detectó el review: con carpeta
  pero cero fotos, el botón abre un modal vacío. La condición del registro
  queda `docOcupado || cargandoFotos || !d.idCarpetaVisita ||
  (!d.idCarpetaFotos && fotosInfo.subidas === 0)`.
- **P3-6** (capitalización de «Acta de Inspección Ocular» frente a los otros
  renglones): **no se toca**. Ese nombre lo fijó el director de producto tal
  cual; la inconsistencia es deliberada.

## Invariantes

- Presentación: no toques `_construirPayload`, columnas de BD ni `api.js`.
- Hooks antes de cualquier `return` condicional (React #310); aliasing del
  archivo (`useStateNV`, `useEffectNV`).
- Sin dependencias nuevas. No edites `bundle.min.js` a mano.
- Estilos como clases en `styles.css` con las variables existentes.
- Objetivos táctiles ≥44 px; todo botón-icono con `aria-label`.
- Textos de UI y comentarios en español con acentos correctos.
- No toques `utils.js`, `tests/` ni `qa-centro-control.html`.

## Verificación antes de cerrar

1. `node build.js` sin errores.
2. `npm test` en verde (21/21).
3. `npx eslint nueva-visita.jsx` sin errores nuevos (11 warnings de
   `exhaustive-deps` son preexistentes).
4. Comprueba los tres estados por lectura y, si tienes navegador, en el banco:
   sin guardar → aviso «Guarda la visita…» y ningún renglón; guardada sin
   carpeta → renglones en gris, deshabilitados y aviso nuevo; guardada con
   carpeta → todo habilitado como hoy.
5. Para los arreglos 2, 3 y 6, **mide el resultado** en el banco
   (`?e=completa` y `?e=faltantes`, 1366 y 390) y pon las cifras en el
   resumen: ratio de contraste del punto apagado, posición derecha del botón
   principal en filas con y sin ↻ (deben coincidir), y alto y número de
   columnas de la grilla. Sin cifras, el arreglo no está verificado.
6. Bumpa `?v=` de `bundle.min.js` y de `styles.css` en `index.html`, y
   `CACHE_NAME` en `sw.js`.

## Cierre

Un commit (`git add` solo de los archivos tocados; **no** `git add -A`).
**No hagas push.** Luego para.
