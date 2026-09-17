# TASK — Segunda pasada de los entregables de la visita

Observaciones del usuario (director del producto) sobre la zona de entregables
ya rediseñada. **No es un rediseño nuevo**: son ocho correcciones concretas
sobre lo que existe. No reorganices nada que no esté aquí.

Archivos: `nueva-visita.jsx`, `escaner-orden.jsx`, `styles.css`.
Zona: `PanelEstadoVisita` (~1431-1484), `FilaEntregable` (~1491-1511) y el
bloque de entregables (~3798-3992). Lee los tres antes de tocar nada.

## 1. Un solo par de estados en los botones

Hoy conviven «Ver», «Abrir», «Generar acta», «Generar registro», «Generar
informe», «Escanear orden de policía» y botones-icono ↻, con anchos distintos.

- La acción principal de cada renglón tiene **dos textos posibles y nada más**:
  **«Generar»** cuando la pieza no existe, **«Abrir»** cuando ya existe.
  Sin el nombre de la pieza repetido: el renglón ya la nombra.
- Todos esos botones **miden igual**: misma altura (≥44 px) y un `min-width`
  común para que queden alineados en columna entre renglones. Clase única
  (p. ej. `.ent-btn`), sin estilos en línea por renglón.
- La **regeneración** sigue existiendo (el inspector corrige datos y rehace el
  acta), pero como botón-icono ↻ **idéntico en los tres documentos**: mismo
  tamaño, misma posición (a la derecha de «Abrir»), `aria-label` propio. Solo
  aparece cuando la pieza existe. No es un tercer estado: es una acción
  secundaria uniforme.
- La carpeta de Drive y la orden escaneada usan «Abrir» también (hoy una dice
  «Abrir» y la otra «Ver»).

## 2. Fotos y registro fotográfico son una sola pieza

Hoy son dos renglones («Fotos de la visita» y «Registro fotográfico») para lo
mismo: las fotos existen para alimentar el registro.

- **Un solo renglón**: «Registro fotográfico», meta «Fotos de la visita ·
  documento F-GGO-46».
- Su acción principal es la del documento: «Generar» / «Abrir» (+ ↻).
- El control de subida (`SeccionFotos`) queda en el **slot** de ese renglón,
  como está hoy en el de fotos.
- El conteo de fotos se muestra **solo si hay fotos** (ver punto 7).
- Borra el renglón «Fotos de la visita».

## 3. Las fotos subidas no pueden estirar el formulario

Con 18 fotos la lista empuja todo el formulario hacia abajo.

La solución **no** es plegar la lista: es dejar de usar una lista. 18 renglones
de texto son ~790 px de alto; 18 miniaturas en grilla son ~3 filas ≈ 170 px, y
además se ve de un golpe qué se subió.

- Sustituye la lista vertical por una **grilla compacta de miniaturas**:
  `grid-template-columns: repeat(auto-fill, minmax(56px, 1fr))`, celdas
  cuadradas (`aspect-ratio: 1`), `object-fit: cover`, `gap` pequeño. Nada de
  alto fijo en el contenedor: crece por filas.
- Miniatura = `https://drive.google.com/thumbnail?id=<id>&sz=w160`, igual que el
  modal de registro fotográfico (`nueva-visita.jsx:4188`; el CSP ya permite
  `drive.google.com` y `*.googleusercontent.com`). `loading="lazy"`,
  `alt` = nombre de la foto. Si la foto solo existe en local (en cola), usa su
  blob con `URL.createObjectURL` y **revócalo** al desmontar.
- **Sin señal las miniaturas no cargan**, así que la celda necesita fondo
  (`--surface-2`) y el número de orden encima: aunque la imagen falle, se sigue
  viendo cuántas hay. No dejes huecos blancos.
- Cada celda enlaza a `foto.link` (`target="_blank" rel="noopener"`); el tamaño
  de celda ya supera 44 px, así que sirve de objetivo táctil.
- Las fotos **en cola / sin subir** van en la misma grilla pero marcadas
  (borde ámbar + «⇡»): son las que necesitan atención y no pueden perderse
  entre las ya subidas.
- El control «Seleccionar fotos» queda arriba, siempre visible.
- Sin `<details>` aquí. El plegable de «Ver qué campos faltan» no se toca.

## 4. La PQR no es un entregable

Borra el renglón «PQR radicada» (~3831-3842). El acceso al PDF ya existe como
botón «Ver PQR» junto al campo Radicado (~3170) y ahí se queda: es un insumo
de la visita, no algo que la visita produzca.

## 5. Nombre del acta

«Acta de caracterización» → **«Acta de Inspección Ocular»** (así la llama la
inspección). La meta sigue diciendo «F-GGO-46 · hoja de cálculo + PDF». Cambia
también el `aria-label` del ↻ y cualquier texto visible que la nombre en esta
zona. **No** toques nombres de archivo, columnas de BD ni textos del backend.

## 6. El escáner de la orden, dentro de su renglón

Hoy el renglón de la orden y el componente `EscanerOrdenPolicia` son dos
bloques hermanos (~3866-3889): el escáner cuelga aparte con su propio control.

- **`EscanerOrdenPolicia` pasa a renderizar su propio `FilaEntregable`**: es el
  componente que conoce el link, las páginas y el estado, así que que sea dueño
  del renglón completo evita coordinar dos piezas. El padre le pasa lo que hoy
  usa el renglón (`orden`, `linkInicial`, etc.) y deja de renderizar el
  `FilaEntregable` de la orden.
- En la fila de acciones: «Abrir» si ya está escaneada (+ el disparador del
  escáner con el mismo tamaño que los demás botones, texto **«Escanear»** o
  **«Reemplazar»**).
- Las páginas en curso, rotar y subir van en el **slot** del renglón, visibles
  solo cuando hay una sesión de escaneo abierta. Nada de un bloque permanente.
- La confirmación antes de reemplazar un escaneo ya existente **se conserva**
  tal cual.

## 7. Estado por color, no por texto

Hoy cada renglón lleva una pill de texto («Generada», «Escaneada», «Faltan 22
campos», «Con fotos»…). Al usuario le sobran.

- `FilaEntregable` sustituye la pill por un **punto de color** pequeño:
  - **verde** = listo / generado / escaneado,
  - **ámbar** = pendiente o en cola,
  - **gris** = todavía no aplica (sin carpeta de Drive, sin guardar),
  - **rojo** = error.
- Accesibilidad: el punto **no** puede ser solo color. Lleva el texto del
  estado como `title` + texto para lector de pantalla (`.sr-only` o
  `aria-label` en el contenedor del renglón). Mientras procesa, el spinner
  reemplaza al punto y `aria-busy` se mantiene.
- **El único texto de estado que sobrevive** es el conteo de fotos, y solo
  cuando hay: «18 fotos», «⇡ 2 en cola». Sin fotos no se escribe nada.
- Los textos «Faltan N campos» de los renglones de acta e informe desaparecen
  (el punto ámbar los cubre); el detalle sigue en el plegable «Ver qué campos
  faltan», que **no se toca**.

## 8. El panel superior solo lista lo que falta

`PanelEstadoVisita` (~1448-1475) muestra hoy cinco chips siempre, incluido
«Faltan 22 campos» y los entregables ya completos.

- **Fuera el chip de campos faltantes.** Ese dato vive en el plegable de
  entregables, no bajo la dirección.
- Los chips restantes muestran **solo entregables pendientes y solo cuando
  aplican**: acta sin generar, informe sin generar, orden sin escanear (solo si
  `ordenRelevante`), registro fotográfico sin generar. Un entregable ya
  resuelto **no** deja chip.
- Si no queda ninguno pendiente: un solo chip verde «Entregables completos».
- El aviso «Visita sin guardar…» se conserva igual.

## Invariantes

- Presentación y textos únicamente: no toques `_construirPayload`, columnas de
  BD, `api.js` ni el contrato con el backend. Las funciones `generarActa`,
  `regenerarActa`, `abrirModalFotos`, `generarInforme`, `subirOrdenPolicia` y
  el bloqueo compartido `docOcupado` siguen siendo las mismas.
- Hooks: todos antes de cualquier `return` condicional (React #310). Aliasing
  del archivo (`useStateNV`, `useEffectNV`).
- Sin dependencias nuevas. No edites `bundle.min.js` a mano.
- Estilos nuevos como clases en `styles.css` con las variables existentes
  (`--tap`, `--verde`, `--amarillo`, `--rojo`, `--ink-3`…). Nada de colores
  literales nuevos.
- Objetivos táctiles ≥44 px. Todo botón-icono con `aria-label`.
- Textos de UI y comentarios en español con acentos correctos.
- No toques `qa-centro-control.html`, `utils.js` ni `tests/`.

## Verificación antes de cerrar

1. `node build.js` sin errores.
2. `npm test` en verde (21/21).
3. `npx eslint nueva-visita.jsx escaner-orden.jsx` sin errores nuevos.
4. Repasa a ojo los 4 escenarios del banco si tienes navegador; si no, verifica
   por lectura que ningún renglón quedó sin acción ni con dos primarios.
5. Bumpa `?v=` de `bundle.min.js` y de `styles.css` en `index.html`, y
   `CACHE_NAME` en `sw.js`.

## Cierre

Un solo commit (`git add nueva-visita.jsx escaner-orden.jsx styles.css
index.html sw.js bundle.min.js`, mensaje en español; **no** `git add -A`:
hay archivos de otra tarea en el árbol). **No hagas push.** Luego para.
