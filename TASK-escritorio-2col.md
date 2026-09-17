# TASK — Escritorio: formulario + tablero de entregables en dos columnas

## El problema

En escritorio la pantalla de visita es **una sola tira vertical**: encabezado,
diez secciones de formulario (~840 líneas de JSX) y, al final de todo, los
entregables. El ancho ya se aprovecha *dentro* de cada sección
(`.form-grid-2col`, dos columnas desde 768 px, `--content-max` 1100/1200 px),
pero la página sigue siendo una columna de bloques apilados.

Eso choca con el uso real: **el escritorio es la oficina** — revisar, corregir
y generar documentos. Ese ciclo es «ver qué falta → corregir → generar», y hoy
obliga a subir y bajar la página entera en cada vuelta. (El móvil es el campo y
ahí la tira vertical está bien: **no se toca**.)

## Qué hacer

Solo en **escritorio ancho (`min-width: 1200px`)**, la pantalla de visita pasa a
dos columnas:

- **Izquierda:** el formulario, tal como está hoy (secciones con su grid
  interno de dos columnas). Es la columna que manda el ancho.
- **Derecha, ~320 px y `sticky`:** el bloque de entregables, visible sin scroll
  mientras se recorre el formulario.
- **Ancho completo arriba:** el encabezado actual (título, «Volver» y
  `PanelEstadoVisita`). No lo muevas ni lo metas en ninguna columna.

Por debajo de 1200 px **todo queda exactamente como hoy**, en una columna y con
los entregables al final. Es una mejora aditiva, no un rediseño.

### Cómo, en concreto

1. **JSX, dos cambios mínimos y nada más:**
   - Al contenedor de la pantalla (`nueva-visita.jsx:3122`,
     `<div className="pantalla activa">`) añádele una clase propia, p. ej.
     `nv-pantalla`. `.pantalla` la usan otras pantallas: el layout nuevo **no**
     puede colgar de ella.
   - Al `div` de entregables (`:3809`, `className="form-seccion"`) añádele una
     clase, p. ej. `nv-entregables`, para poder colocarlo en la columna derecha.
   - **No muevas nada de sitio en el DOM.** La colocación es toda por CSS: con
     el DOM intacto, el orden de lectura y de tabulación sigue siendo el mismo
     en móvil, que es donde se llena el formulario.
2. **CSS (`styles.css`), dentro del `@media (min-width: 1200px)` que ya existe:**
   - `.nv-pantalla { display: grid; grid-template-columns: minmax(0, 1fr) 320px; column-gap: 24px; align-items: start; }`
   - El encabezado (primer hijo) ocupa las dos columnas.
   - Las `.form-seccion` que **no** sean `.nv-entregables` van a la columna 1;
     `.nv-entregables` va a la columna 2, fila 2, con
     `position: sticky; top: <alto del header>;`
   - `.nv-entregables` necesita `max-height: calc(100vh - var(--header-h) - 48px)`
     y `overflow-y: auto`: con 18 miniaturas y el escáner abierto esa columna
     desborda la pantalla, y sin esto el final queda inalcanzable. **Verifica
     este caso**, no lo des por bueno.
   - Sube `--content-max` lo necesario para que la columna del formulario no
     quede más estrecha que hoy (hoy 1100 px de contenido; con 320 px de
     tablero + 24 px de hueco hacen falta ~1450 px de contenido para no
     encogerla). Si no cabe en 1366 px de pantalla, **prioriza el formulario**:
     que el tablero se active solo cuando sobre el espacio, subiendo el punto
     de corte a 1440 px. Decídelo **midiendo** en el banco, no a ojo, y explica
     la decisión en el resumen.
   - `minmax(0, 1fr)` y no `1fr`: con `1fr` el contenido ancho (textareas, mapa)
     desborda la columna en vez de encogerse.
3. **Comprueba que dentro del tablero la caja no rompe nada**: `.form-grid-2col`
   dentro de una columna de 320 px debe caer a una sola columna, y los botones
   `.ent-btn` seguir alineados y ≥44 px.

## Fuera de alcance

- El índice de secciones y los enlaces a campos faltantes: **otra tarea**. Aquí
  solo el layout.
- Nada de acordeones ni de plegar secciones.
- No toques el móvil ni el rango 768–1199 px.
- No toques el contenido de los entregables (renglones, botones, grilla de
  fotos): solo dónde se colocan.
- No toques la barra fija de «Guardar cambios».

## Invariantes

- Presentación: no toques `_construirPayload`, columnas de BD, `api.js` ni el
  contrato con el backend.
- Hooks antes de cualquier `return` condicional (React #310).
- Sin dependencias nuevas. No edites `bundle.min.js` a mano.
- Estilos con las variables existentes (`--content-max`, `--header-h`, `--tap`…).
- Textos de UI y comentarios en español con acentos correctos.
- No toques `utils.js`, `tests/` ni `qa-centro-control.html`.

## Verificación antes de cerrar

Además de `node build.js`, `npm test` (21/21) y
`npx eslint nueva-visita.jsx` sin errores nuevos:

1. **Mide en el banco** (`http://127.0.0.1:8099/qa-centro-control.html?e=completa`)
   en **1366×768**, **1600×900** y **390×844**:
   - ancho real de la columna del formulario en cada uno (no debe ser menor que
     hoy en 1366),
   - que el tablero queda visible sin scroll y que **se puede llegar a su
     último botón** con 18 fotos cargadas,
   - que en 390 no cambió absolutamente nada.
2. Sin overflow horizontal en ninguno de los tres.
3. Bumpa `?v=` de `styles.css` y `bundle.min.js` en `index.html`, y
   `CACHE_NAME` en `sw.js`.

## Cierre

Un commit (`git add nueva-visita.jsx styles.css index.html sw.js
bundle.min.js`, mensaje en español; **no** `git add -A`). **No hagas push.**
En el resumen indica las medidas obtenidas y el punto de corte que elegiste.
Luego para.
