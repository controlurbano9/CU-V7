# TASK-UI-REVIEW 2 — verificación de las correcciones

> **Relanzamiento.** El intento anterior se quedó sin navegador (playwright MCP
> no venía en el allowlist) y produjo un `INFORME-ui-review-2.md` con
> verificación **solo estática**: los seis arreglos quedaron 4 ✅ / 2 ⚠ parcial
> (1 y 2, los que exigen ver y medir) y las regresiones sin cubrir. Esta corrida
> **sí** tiene `mcp__plugin_playwright_playwright__*`, `analyze_image` y Bash.
> Lo estático ya está hecho; lo que se necesita de ti es **el render y la
> medición en DOM**: los 8 pares escenario×viewport, la fila de fotos, el alto
> real del `<summary>` en 390, el peso visual del escáner en `?e=completa`, y
> overflow/consola/táctiles/contraste. **Sobrescribe** `INFORME-ui-review-2.md`
> con el resultado medido (no lo anexes).

Segunda pasada sobre el banco de pruebas, ahora con el commit `53c9d23` (las
correcciones P2/P3) y con el harness arreglado: `obtenerIdFotos` está stubeado,
así que **la fila de fotos y su control de subida sí se montan** en `?e=completa`
y `?e=offline` — en la primera pasada quedaron sin revisar visualmente.

Método, tools y reglas: los mismos de `TASK-UI-REVIEW-centro-control.md`
(léelo). URL base `http://127.0.0.1:8099/qa-centro-control.html`, escenarios
`?e=nueva|faltantes|completa|offline`, viewports **1366×768** y **390×844**,
checks objetivos antes de opinar, y nada se reporta sin verificar por medición
JS o grep.

## Foco de esta pasada

1. **Fila de fotos y su control de subida** (`?e=completa`: 18 fotos;
   `?e=offline`): lo que no se pudo ver la vez pasada. ¿El renglón informa
   cantidad y estado? ¿El control de subida encaja dentro del renglón sin
   parecer tarjeta dentro de tarjeta? ¿Se distingue «subidas» de «en cola»?
2. **Los seis arreglos**, uno por uno — confirma que quedaron y que no rompieron
   nada alrededor:
   - Escáner con orden ya escaneada: debe decir «Reemplazar escaneo» y tener
     peso secundario, sin competir con «Guardar cambios» (`?e=completa`).
   - `<summary>` de campos faltantes: área pulsable ≥44 px en 390
     (mídelo, no lo estimes) y el marcador ▸/▾ visible.
   - Aviso de faltantes oculto cuando acta e informe ya están generados
     (`?e=completa`), y con el texto nombrando solo el documento que falte
     cuando falte uno.
   - Botón «Generar registro» en el renglón de registro fotográfico.
   - Patrón de regeneración unificado: pieza generada = «Ver» + botón-icono ↻
     con `aria-label`; sin generar = botón de texto. Debe ser igual en acta,
     informe y registro.
   - Hint de Actuación/Observaciones nombrando «Mejorar texto».
3. **Regresiones**: overflow, consola, táctiles <44 px y contraste en las tres
   zonas rediseñadas. Ignora el ruido del harness (favicon 404,
   `CU_MAPS_JS_URL`, rechazos de fetch del stub).

## Salida — escribe `INFORME-ui-review-2.md` y para

Mismo formato (P1 / P2 / P3 / Descartado). Añade al final una sección
**«Estado de los 6 arreglos»**: tabla arreglo → ✅ verificado / ⚠ parcial /
✕ no quedó, con la evidencia de cada uno.

**No arregles nada**, no edites código, no hagas commit.
