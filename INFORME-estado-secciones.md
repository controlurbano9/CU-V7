# INFORME — Estado por sección (TASK-estado-secciones)

Commit `53861d5` · sin push · `node build.js` sin errores (bundle 241,8 KB) · `npm test` 21/21 · `npx eslint nueva-visita.jsx` 0 errores nuevos (11 warnings `exhaustive-deps` preexistentes).

## Qué se hizo

- **Fuera:** plegable «Ver qué campos faltan» (details + lista + renglones-botón), helper `_irASeccion` y su estado, y en CSS `.ent-faltan`, `.ent-falta-link`, `.ent-falta-sec`, `.seccion-destacada`, `@keyframes seccionDestaca` con su variante `prefers-reduced-motion`, y los dos `scroll-margin-top` de `.form-seccion` (el de móvil y el override de escritorio). `--nv-header-h` y `--header-h` intactos.
- **Dentro:** `_Seccion` recibe `estado` y pinta a la derecha del título el check `✓` (`sec-ind-ok`, verde `--green-ink`) o el punto ámbar (`sec-ind-pend`, `--amber`, 10 px como `.ent-dot`). El ámbar solo tras un intento de generar/regenerar fallido (`mostrarPendientes`, booleano de sesión, no va al borrador). Los checks se ven siempre. Sin número.
- **Validador:** un solo recorrido `_evaluarFormulario()` → `{ faltan, seccionesConObligatorios }` (el `req()` registra la sección esté o no el campo). `_validarAntesDeActa()` es envoltorio que devuelve `faltan`: los tres avisos no cambiaron. Sin `useMemo`.
- **A11y:** `role="img"` + `aria-label` («Sección completa» / «Faltan campos en esta sección») + `title`; no es botón ni tabulable.
- **Bumps:** `styles.css?v=117`, `bundle.min.js?v=131`, `CACHE_NAME` `cu-v6-cache-v132`.

## Mediciones del banco (qa-centro-control.html, escenarios reales)

Cuentas sobre las 10 secciones del formulario (el 11.º `.form-seccion` es el título del tablero, sin indicador).

| Escenario | Viewport | Antes de Generar | Tras Generar/Regenerar fallido |
|---|---|---|---|
| `?e=faltantes` | 390 | 3 checks · 0 puntos | 3 checks · 6 puntos · solo Observaciones sin indicador |
| `?e=faltantes` | 1440 | 3 checks · 0 puntos | 3 checks · 6 puntos · Observaciones sin indicador |
| `?e=completa` | 390 | 3 checks · 0 puntos | 3 checks · 6 puntos · Observaciones sin indicador |
| `?e=completa` | 1440 | 3 checks · 0 puntos | 3 checks · 6 puntos · Observaciones sin indicador |

- **«Observaciones y conclusiones» nunca lleva indicador** en ningún escenario ni momento (verificado por título en cada cuenta).
- **Punto ámbar solo tras el intento fallido**: en reposo siempre 0 puntos, en los 4 pares.
- **Contraste** contra `--surface` #FFFBF5: check (`--green-ink` #565E2E) **6,71:1**; punto (`--amber` #8D682D) **4,91:1** — ambos ≥3:1 (WCAG 1.4.11; el check además pasa el 4.5:1 de texto, por eso `--green-ink` y no `--green`).
- **A11y del punto medida en DOM:** `aria-label="Faltan campos en esta sección"`, `title` igual, `role="img"`, no es botón, `tabIndex` −1.

## Envoltura de títulos en 390 px (el punto fino)

Los anchos naturales de los títulos a 390 (contenido de sección: 277 px, texto útil 264 px):

| Título | Natural | ¿Envuelve sin indicador? |
|---|---|---|
| Descripción de la situación encontrada | 346 | sí (línea base del formulario) |
| Funcionarios que realizan la inspección | 353 | sí (línea base) |
| Características de la edificación | 284 (271 de texto) | sí (por 7 px, con o sin indicador — verificado forzando el layout anterior) |
| resto | ≤267 | no |

El indicador **no añade ninguna envoltura nueva**: tras Generar solo siguen envueltos Descripción y Funcionarios, que ya envolvían solos. «Características de la edificación» queda en 1 línea junto a su punto gracias al `margin-right: -11px` de `.sec-ind` (el indicador pisa el padding de la tarjeta en vez de robarle ancho al título). Medido: el texto termina en x=332, el punto ocupa 340–350 y el borde de la tarjeta está en 358 — 8 px de aire con el texto, dentro del padding, sin solape.

## CSS huérfano

`grep -ri "ent-faltan|ent-falta|seccion-destacada|seccionDestaca|_irASeccion"` sobre el repo: 0 coincidencias en código (solo quedan menciones en documentos `.md` de TASKs e informes anteriores).

## Balance de líneas

| Archivo | + | − |
|---|---|---|
| nueva-visita.jsx | 79 | 82 |
| styles.css | 23 | 65 |
| **Fuentes** | **102** | **147** |

Neto −45 líneas en fuentes. Artefactos regenerados: `bundle.min.js` (esbuild), `index.html` (2), `sw.js` (1).

## Notas

- El escenario `?e=completa` del banco completa **entregables** (links, fotos), no los campos del formulario: por eso al regenerar también enciende 6 puntos. Correcto: la validación de secciones es del formulario, no de los entregables.
- Sin tocar: `PanelEstadoVisita`, los tres avisos, `_construirPayload`, columnas BD, `api.js`, backend, `utils.js`, `tests/`.
