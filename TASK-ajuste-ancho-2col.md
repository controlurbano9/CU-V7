# TASK-ajuste-ancho-2col — aprovechar ancho en pantallas grandes + afinar Consulta de Norma

> One-shot: no puedes preguntar. Todo verificado contra el repo (commit base: `b11d7ef`).
> Trabajas SOLO en `cu-v5-dev/`. **NO** edites `index.html`, `sw.js`, `api.js`, `bundle.min.js`
> ni corras `node build.js` — build, bumps y deploy los hace el director después.
> Solo JSX movido, cero lógica. Al terminar TODO: un solo commit git, sin push.

## Contexto

El commit anterior aplicó los layouts 2col. Dos afinaciones pedidas por el usuario:
1. En pantallas grandes sigue sobrando espacio lateral (hoy `--content-max`: 740 base / 1100 ≥1200 / 1200 ≥1600).
2. En Consulta de Norma la columna derecha queda a la altura del título («se mete al título») porque el título está DENTRO de `.cn-col`; además el mapa (600 px) es muy alto — más ancho y menos alto = más información sin scroll.

## Cambio A — ancho global (styles.css)

1. Tras la línea 1832 (cierre del `@media (min-width: 1200px)` de `:root`), insertar:
   ```css
   @media (min-width: 1440px) {
     :root { --content-max: 1280px; }
   }
   ```
2. Línea 1834 (`@media (min-width: 1600px)`): `--content-max: 1200px` → `1480px`.

Efecto esperado en cadena: `.pantalla`, `.pantalla.nv-pantalla` (max-width `calc(var(--content-max) + 344px)`) y `.pantalla.cn-pantalla` (ver C) se estiran solos — no toques esos `calc` salvo el de C. En 1920 el contenido llega a ~1480 con ~36 px por lado. No cambies ningún otro valor.

## Cambio B — título fuera de las columnas (consulta-norma.jsx)

Mover las líneas 355-358 (`.page-title` «Consultar norma POT» + subtítulo 356-358) ANTES de la línea 354 (`<div className="cn-col">`), quedando justo después del comentario de 351-353. Resultado: título y subtítulo a ancho completo, y las dos columnas arrancan alineadas en la parte superior. El cierre `</div>{/* .cn-col */}` (línea 432) no se toca.

## Cambio C — columna derecha de norma más ancha (styles.css)

- Línea 1183: `grid-template-columns: minmax(0, 1fr) 380px` → `minmax(0, 1fr) 440px`.
- Línea 1186: `max-width: calc(var(--content-max) + 404px)` → `calc(var(--content-max) + 464px)`.

La columna izquierda se reduce sola (es `1fr`).

## Cambio D — mapa más bajo en ≥1440 (styles.css)

Dentro del `@media (min-width: 1440px)` de `.pantalla.cn-pantalla` (líneas 1180-1188), añadir:
```css
.mapa-norma { height: 460px; }
```
Gana sobre la regla de 600 px del media ≥1200 (línea 1006) por orden en el archivo. En pantallas menores el mapa queda como está.

## Invariantes

- No tocar hooks ni lógica JSX: solo mover JSX (cambio B).
- Todo en medias ≥1440 — móvil, tablet 768-899 y el rango 900-1439 no cambian.
- Especificidad: los selectores 2col existentes son de 2 clases (`.pantalla.cn-pantalla`, `.pantalla.nv-pantalla`) — no debilitarlos.
- No editar `index.html`, `sw.js`, `api.js`, `bundle.min.js`. No correr build.

## QA — medición en DOM (Playwright contra `qa-centro-control.html`, nunca a ojo)

- Viewports 1440, 1680, 1920: sin overflow horizontal del documento; `.pantalla` montada en el banco usa el ancho nuevo (~1280 / ~1480); el tablero `.nv-entregables` sticky intacto, sin solaparse con la cabecera compacta.
- 1366 y 390: nada cambia (1100 / 740).
- Norma y Home no tienen mock en el banco: **no inventes mediciones** — deja nota en el commit de qué se midió y qué no.

## Cierre

1. Cambios A-D aplicados.
2. QA medida según la sección QA.
3. `git add` + **un commit**: `ui: ancho pantallas grandes + ajuste columnas consulta norma`.
4. Sin push, sin build.
