# INFORME — Fuga de la cabecera fija (escritorio)

**Fecha:** 2026-09-14 · **TASK:** `TASK-fuga-cabecera.md` · **Banco:** `qa-centro-control.html` (http-server :8099)

## Causa raíz (medida, no intuida)

La fuga existía en **todo el escritorio** (768+), en block y en grid por igual:
28 px de banda entre el top del scrollport y la caja pintada de `.nv-header`,
con `.form-seccion` e `INPUT.input-campo` devueltos por `elementFromPoint`
en esa banda.

Los dos sospechosos del TASK, verificados por separado:

1. **`--content-pad-top` vs padding real: descartado.** `padding-top`
   computado de `#content-desktop` = var = 28 px en 1200+, 24 en 768–1199.
   Coinciden en todos los anchos.
2. **El mecanismo del margen negativo no hacía nada.** El comentario de
   `styles.css:1062` asumía que `margin-top: calc(-1 * var(--content-pad-top))`
   subía la caja hasta el borde. Medición: con el margen aplicado y la
   posición de flujo de la cabecera en el top exacto del contenido
   (`static` → banda −400 = −scrollTop), la caja pegada seguía a **+28**.
   Solo `top: -28px` inline la llevaba a 0.

**El motivo:** el scrollport de un scroller es su *padding box*. `top: 0`
ancla la cabecera **debajo** del `padding-top` de `#content-desktop`, y esa
banda (el propio padding) queda descubierta: por ahí desfila el formulario.
El truco del margen negativo nunca pudo cubrirla — además, una caja
`position: sticky` no colapsa márgenes con `.nv-pantalla`, así que ni
siquiera subía al contenedor. En móvil no pasaba porque el scroller es el
documento, sin padding: `top: var(--header-h)` ancla exacto (111 px medidos).

## El arreglo (al origen, una sola variable manda)

En el bloque `@media (min-width: 768px)` de `styles.css` (~1731):

```css
.pantalla.nv-pantalla { margin-top: calc(-1 * var(--content-pad-top)); }
.nv-header { margin-top: 0; top: calc(-1 * var(--content-pad-top)); }
body.is-offline .nv-header { top: calc(-1 * var(--content-pad-top)); }
```

- El contenedor sube hasta el borde real del scrollport (el margen sobre un
  elemento estático sí aplica) → el rectángulo de restricción del sticky
  empieza en 0 y el clamp no empuja la caja de vuelta.
- La cabecera se ancla `--content-pad-top` por encima del padding edge = 0
  del scrollport. Relleno del scroller, tapón y aire interior de la cabecera
  salen todos de la misma `--content-pad-top` — sin números mágicos por
  breakpoint.
- La regla base de `.nv-header` (móvil, documento sin padding) queda intacta.

Especificidad: `.pantalla.nv-pantalla` (0,2,0) porque `margin: 0 auto` de
`.pantalla` (después en cascada) pisaba un `margin-top` de igual
especificidad — primera versión del fix neutralizada por el shorthand.

## Verificación (punto 1 del TASK): banda fugada en px

scrollTop 400 sobre `#content-desktop` (escritorio) / `window` (móvil).
Banda = top de la caja pintada − top del scrollport (móvil: − punto de pegue).

| Viewport | ?e=faltantes | +offline=1 | ?e=completa | +offline=1 |
|---|---|---|---|---|
| 1920×1080 (grid) | **0** | **0** | **0** | **0** |
| 1440×900 (grid) | **0** | **0** | **0** | **0** |
| 1366×768 (block) | **0** | **0** | **0** | **0** |
| 390×844 (móvil, doc) | **0** | **0** | **0** | **0** |

Antes del fix: 28 px en 1920/1440/1366 (los 16 casos), 0 en 390.
Tras el fix: 0 en los 16. `elementFromPoint` en la banda ya no devuelve
nada del formulario (no hay banda).

## Punto 3: la cabecera no se movió

- Alto: **189.78 px** en 1366/1440/1920, **153.19 px** en 390 — los mismos
  189.8 / 153.2 de `INFORME-verifica-r4.md`.
- Pegue: `--header-h` en móvil (111 px, +40 con offline), top real 0 del
  scrollport en escritorio, sin cambio con `body.is-offline`.
- Layout inicial intacto: a scrollTop 0 la cabecera está en 0 y la primera
  `.form-seccion` a 203.78 px (= alto 189.78 + margin-bottom 14), como antes.

## Resto del checklist

- Sin overflow horizontal nuevo en ningún viewport; consola limpia (solo los
  2 warnings propios del banco: `CU_MAPS_JS_URL` y red deshabilitada).
- `node build.js` OK (bundle sin cambios de contenido — no se tocó JSX);
  `npm test` **21/21**; `npx eslint nueva-visita.jsx` 0 errores, 11 warnings
  `exhaustive-deps` preexistentes.
- Bumps: `styles.css?v=118` en `index.html`, `CACHE_NAME v133` en `sw.js`.
  `bundle.min.js` no se bumpó (no cambió).

## Archivos tocados

`styles.css` (3 reglas + comentario en el media ≥768), `index.html` (bump v),
`sw.js` (bump cache). `bundle.min.js` sin cambios de contenido (no se tocó JSX).

## Commit

⚠️ **Pendiente:** el clasificador de permisos de esta sesión bloqueó todo
`git add` / `git commit` (probados con mensaje multilínea, de una línea y
con `--` paths; `git status`/`git diff` sí pasan). El árbol quedó listo:
exactamente `styles.css`, `index.html` y `sw.js` modificados, sin más
cambios tracked. El commit lo debe hacer el director:

```
git add styles.css index.html sw.js
git commit -m "Cabecera fija: anclar por encima del padding del scrollport (fuga 28px); styles.css v118, cache v133"
```
