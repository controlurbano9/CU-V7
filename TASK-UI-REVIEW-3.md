# TASK-UI-REVIEW 3 — el rediseño de entregables, medido

Tercera pasada sobre el banco de pruebas. Lo que hay que revisar **no se ha
visto nunca en un navegador**: se verificó por lectura del código y por grep
sobre el bundle, nada más. Tu trabajo es el render y la medición.

Método, tools y reglas: los mismos de `TASK-UI-REVIEW-centro-control.md`
(léelo). URL base `http://127.0.0.1:8099/qa-centro-control.html`, escenarios
`?e=nueva|faltantes|completa|offline`, viewports **1366×768** y **390×844**.
Si el MCP de playwright no está disponible, sirve cualquier navegador que
puedas conducir (la pasada anterior se resolvió con un driver CDP propio en
`.qa2/`); lo que **no** vale es reportar sin render.

Nada se afirma sin medirlo en DOM (`getBoundingClientRect`,
`getComputedStyle`) o sin captura analizada con `mcp__zai-mcp-server__analyze_image`.
La visión especula: todo lo que venga de una imagen se confirma con JS.

## Qué cambió y hay que verificar

La zona de entregables se rehízo entera a partir de ocho observaciones del
director de producto. Verifica **una por una** que se cumplen y que no
rompieron nada alrededor:

1. **Botones uniformes.** Solo dos textos en la acción principal: «Generar» y
   «Abrir». Mide el ancho y el alto de **todos** los botones de la zona en los
   dos viewports: deben coincidir entre renglones (clase `.ent-btn`). Alto
   ≥44 px. Reporta la tabla de medidas.
2. **Un solo renglón de fotos.** «Registro fotográfico» con el control de
   subida en su slot; **no** debe existir un renglón «Fotos de la visita».
3. **Grilla de miniaturas** (`.fotos-grilla`, `?e=completa` monta 18 fotos).
   Mide el **alto total** de la grilla: el objetivo era ~170 px frente a los
   ~790 px de la lista anterior. ¿Las celdas son cuadradas? ¿Cuántas columnas
   entran en 390 y en 1366? Las miniaturas apuntan a `drive.google.com` y en
   el banco **no van a cargar**: comprueba que aun así cada celda muestra su
   número sobre fondo y que **no** quedan huecos blancos ni celdas colapsadas.
4. **Sin renglón de PQR** en los entregables (el acceso al PDF sigue junto al
   campo Radicado, ahí sí debe estar).
5. **«Acta de Inspección Ocular»** — ese texto exacto, sin «caracterización» en
   ninguna parte visible de la zona.
6. **Orden de policía en un solo renglón**: el escáner ya no cuelga como bloque
   aparte. Con la orden escaneada (`?e=completa`) la acción de reemplazo es el
   icono ↻, del mismo tamaño que los ↻ de acta, registro e informe (mídelos);
   sin escanear, botón «Escanear».
7. **Estado por punto de color, no por texto.** No debe quedar ninguna pill de
   texto de estado salvo el conteo de fotos («18 fotos», «⇡ N en cola»), y solo
   cuando hay fotos. Mide el **contraste** de cada color de punto contra su
   fondo y comprueba que el estado también está disponible como texto
   accesible (`title`, `aria-label` o `.sr-only`) — color solo no basta.
8. **Panel superior**: bajo la dirección **no** puede aparecer «Faltan N
   campos». Solo entregables pendientes que apliquen, o un único chip verde
   «Entregables completos». Verifica los cuatro escenarios.

Además: el renglón de registro fotográfico quedó **al final** de la lista de
entregables. Confirma el orden real de los renglones en cada escenario.

## Regresiones

Overflow horizontal, errores de consola, objetivos táctiles <44 px y contraste
en toda la zona rediseñada, en los 8 pares escenario×viewport. Ignora el ruido
del banco (favicon 404, `CU_MAPS_JS_URL`, rechazos de fetch del stub, fallos de
carga de `drive.google.com`).

Presta atención especial a dos riesgos de este cambio:
- El slot del registro fotográfico crece con las fotos: ¿empuja o desalinea
  algo con 18 miniaturas?
- Los botones de un renglón conviven con el ↻: ¿se salen de la fila en 390 px?

## Salida — escribe `INFORME-ui-review-3.md` y para

Formato P1 / P2 / P3 / Descartado, cada hallazgo con su medición y el
`archivo:línea` donde se corrige. Añade al final una tabla **«Las 8
observaciones»**: número → ✅ cumplida / ⚠ parcial / ✕ no quedó, con evidencia
medida de cada una.

**No arregles nada**, no edites código fuera de tu directorio de trabajo, no
hagas commit.
