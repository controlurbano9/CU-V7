# TASK-UI-REVIEW — centro-control

## App
URL base: <http://127.0.0.1:8099/qa-centro-control.html>
Proyecto: `C:\Users\Katana\OneDrive\CLAUDE\PROYECTO CODE\cu-v5-dev`

Es un **banco de pruebas**, no la app completa: monta `NuevaVisitaScreen` con
datos falsos y la red stubeada (el formulario real dispara autoguardado remoto
cada 60 s y revisarlo con una visita de verdad escribiría en la base). No hay
login ni navegación: la pantalla se monta directa.

Escenarios por query param — **revisa los cuatro**:
- `?e=nueva` — formulario en blanco, sin fila: aún no hay entregables.
- `?e=faltantes` — visita INICIADA a medio diligenciar (el caso más común).
- `?e=completa` — acta, informe y orden generados + 18 fotos en Drive.
- `?e=offline` — `navigator.onLine` forzado a `false`.

## Qué revisar
Lo recién rediseñado (commit `ebd83d8`), en este orden de importancia:
1. **Panel de estado superior** (`PanelEstadoVisita`, `nueva-visita.jsx:1400`):
   ¿se entiende el estado de la visita en <5 segundos? ¿los chips de progreso se
   leen de un vistazo o se amontonan?
2. **Zona «Entregables de la visita»** (`nueva-visita.jsx:3752-3922`): renglones
   con estado y acciones. ¿Se distingue el estado de cada pieza? ¿Las acciones
   caben sin romperse? ¿El `<details>` de campos faltantes se entiende plegado?
3. **Barra fija de guardado** (`nueva-visita.jsx:4193-4215`): el texto de estado
   y el botón «Guardar cambios». En `?e=offline` debe verse el mensaje de
   sin conexión.
4. El escáner de orden embebido en su renglón (`?e=completa`) — que no parezca
   tarjeta dentro de tarjeta.

Viewports: **1366×768** y **390×844** (el inspector trabaja en celular).

## Cómo (orden obligatorio)
1. Navega con playwright MCP (`browser_navigate`, `browser_snapshot`, `browser_evaluate`).
2. Ejecuta ANTES de opinar los checks objetivos, por escenario y viewport:
   - overflow: `scrollWidth - clientWidth` y elementos con `getBoundingClientRect().right > clientWidth`
   - errores de consola (`browser_console_messages` level=error). Ignora los que
     digan «QA: red deshabilitada» y los 404 de recursos stubeados: son del banco
     de pruebas, no del código.
   - tamaño de los objetivos táctiles en 390 px: ningún botón/enlace de acción
     por debajo de 44 px de alto.
3. Screenshot por viewport y escenario (`browser_take_screenshot` fullPage).
4. Analiza cada PNG con `mcp__zai-mcp-server__analyze_image` pidiendo P1/P2/P3.
   OJO: el Read de imágenes NO entrega contenido inline — visión solo por ese MCP.
5. VERIFICA cada hallazgo antes de reportarlo: medición JS o grep en el código.
   La visión especula ("probablemente causará overflow") — no reportes nada sin
   verificar. Si la medición desmiente a la visión, va a «Descartado».

## Salida — escribe `INFORME-ui-review-centro-control.md` y para
```
# UI REVIEW centro-control <fecha>
## P1 — rotura funcional/visual (con archivo:línea si el bug está en el código)
## P2 — UX
## P3 — consistencia
## Descartado — lo que la visión dijo y la medición desmintió
```
Cada ítem: qué, dónde (escenario/viewport/sección), evidencia.

**No arregles nada**: este TASK es solo diagnóstico. No edites código, no hagas
commit. Escribe el informe y para.
