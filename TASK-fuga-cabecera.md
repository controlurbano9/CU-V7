# TASK — El formulario se asoma por encima de la cabecera fija (escritorio)

Reporte del usuario, con captura, en la app real (pantalla ancha, sidebar
visible, modo dos columnas). Al hacer scroll, **contenido del formulario
aparece en la banda que hay entre la barra de la app y el borde superior de la
cabecera «Continuar visita»**: se ve el renglón «PQR / Radicado · 2022014165»
flotando encima de la cabecera fija, que debería taparlo.

La cabecera sí está pegada y sí es opaca. Lo que falla es que **su tapón no
cubre toda la banda**: queda una franja por la que el formulario desfila.

## El mecanismo que debería impedirlo

`.nv-header` (`styles.css:1068`) se tira hacia arriba y recupera el hueco como
relleno, para tapar el `padding-top` del contenedor cuando queda pegada:

```css
margin-top: calc(-1 * var(--content-pad-top));
padding-top: var(--content-pad-top);
```

Ese truco solo funciona si `--content-pad-top` **es exactamente** el relleno
superior real del scroller. Si el relleno real es mayor, sobra banda y el
formulario se ve por ahí. Ese es el primer sospechoso.

El segundo: desde 1440 `.nv-pantalla` es grid y `.nv-header` ocupa
`grid-column: 1 / -1` (`styles.css:1118`, `1105`). Un margen negativo sobre un
ítem de grid no siempre lo saca del área de su fila como lo haría en flujo
normal, y el bloque pegajoso no puede escapar de su área de grid.

**No elijas entre los dos por intuición: mídelos.** Puede ser uno, el otro o
los dos a la vez.

## Cómo reproducirlo

Banco `http://127.0.0.1:8099/qa-centro-control.html`, escenarios `?e=faltantes`
y `?e=completa`. **Viewports 1920×1080 y 1440×900** (donde el usuario lo vio) y
además 1366×768 y 390×844 para no romper lo que ya funciona.

El banco **ya monta `#sidebar-desktop`** con el mismo umbral que la app
(`ancho >= 900`, `qa-centro-control.html`); no lo vuelvas a inyectar a mano. Si
sin sidebar el layout se rompe, eso ya está corregido: no es este fallo.

El scroller en escritorio es `#content-desktop`, no el documento. **Scrollea ese
elemento**, no `window`.

Mide, con el formulario scrolleado:

1. `padding-top` computado de `#content-desktop` y valor de `--content-pad-top`.
   ¿Coinciden? La diferencia es el tamaño de la fuga.
2. `getBoundingClientRect()` de `#content-desktop` (top del scrollport) y de
   `.nv-header`. **La distancia entre el top del scrollport y el top de la caja
   pintada de la cabecera es la banda fugada.** Debe ser 0.
3. `document.elementFromPoint` en varios puntos de esa banda: si devuelve algo
   del formulario (input, `.form-seccion`, chip de radicado) en vez de la
   cabecera o el contenedor, está confirmado. Reporta qué elemento devuelve.
4. Repite con `?offline=1`.

## El arreglo

Al **origen**, no tapando con un parche:

- Si la causa es que `--content-pad-top` no refleja el relleno real, haz que una
  sola declaración mande sobre las dos cosas — el relleno del scroller y el
  tapón de la cabecera deben salir del mismo sitio, porque el fallo nace de
  tenerlos duplicados y que uno se moviera.
- Si la causa es el grid, la cabecera necesita cubrir su banda sin depender del
  margen negativo.

Lo que **no** vale: subir el `z-index`, porque el problema no es de pintado
sino de geometría; ni poner un número mágico por breakpoint, que es exactamente
lo que produjo el fallo de `--header-h` que costó cuatro revisiones.

Ojo con no romper nada de lo ya verificado en `INFORME-verifica-r4.md`: en
móvil la cabecera se pega a `var(--header-h)` con la barra de la app encima,
en escritorio a `top: 0` dentro de `#content-desktop`, y con `body.is-offline`
baja 40 px en móvil y nada en escritorio.

## Invariantes

- Toca lo mínimo. Esto es un fallo de geometría de la cabecera: no reorganices
  el layout ni el grid de dos columnas.
- No toques `_construirPayload`, columnas de BD, `api.js` ni el backend.
- Hooks antes de cualquier `return` condicional (React #310); aliasing del
  archivo (`useStateNV`, `useEffectNV`).
- Sin dependencias nuevas. No edites `bundle.min.js` a mano (`node build.js`).
- Comentarios y textos en español con acentos correctos.
- No toques `tests/` ni `utils.js`.

## Verificación antes de cerrar

1. Banda fugada **0 px** en 1920, 1440, 1366 y 390, en `?e=faltantes` y
   `?e=completa`, con y sin `?offline=1`. Con la cifra en cada caso.
2. `elementFromPoint` en esa banda ya no devuelve nada del formulario.
3. Que la cabecera **no se haya movido** de donde la dejó la verificación r4:
   alto 153,2 px en 390 y 189,8 px en 1366/1440, pegada a `--header-h` en móvil
   y a 0 en escritorio. Si cambia, di en cuánto y por qué.
4. Sin overflow horizontal nuevo; sin errores de consola nuevos.
5. `node build.js`, `npm test` 21/21, `npx eslint nueva-visita.jsx` sin errores
   nuevos (11 warnings `exhaustive-deps` preexistentes).
6. Bumpa `?v=` de `bundle.min.js` y `styles.css` en `index.html`, y
   `CACHE_NAME` en `sw.js`, **solo si tocaste esos archivos**.

## Cierre

Un commit (`git add` solo de los archivos tocados; **no** `git add -A`).
**No hagas push** — el despliegue lo decide el director.
Escribe `INFORME-fuga-cabecera.md` con la causa raíz medida, el arreglo y la
tabla del punto 1, y para.
