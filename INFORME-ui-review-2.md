# UI REVIEW 2 — verificación de las correcciones · 2026-09-12

Commit bajo revisión: **`53c9d23`** (servido por el bundle del banco; ver nota final sobre el
árbol de trabajo). Banco: `http://127.0.0.1:8099/qa-centro-control.html`.

**Método.** Playwright MCP no estaba disponible en esta sesión; se manejó Edge headless
(Edg/152) por **CDP directo** (WebSocket nativo de node): 8 combos escenario×viewport
renderizados, medición JS en DOM (overflow, táctiles, rects, estilos computados, contraste),
consola capturada por evento, 9 screenshots fullPage analizados con `analyze_image`, y cada
hallazgo de visión re-verificado por medición o grep antes de reportarse.

**Cobertura:** 8/8 combos renderizados. Overflow horizontal **0** en los ocho
(`scrollWidth === clientWidth`, sin elementos con `right > clientWidth`). Consola **0**
errores fuera del ruido del harness (favicon, fetch del stub). Táctiles <44px: entre
botones/enlaces de acción solo «Ver PQR» (41px); los inputs/radios/checkboxes de 17–38px son
controles de formulario preexistentes, fuera del criterio «botón/enlace de acción».

---

## P1 — rotura funcional/visual

Ninguno. Ni por medición ni por visión sobrevivió algo a la verificación.

## P2 — UX

1. **El contador interno de fotos se contradice consigo mismo** (`?e=offline`, tras
   seleccionar una foto): la lista interna dice «**1 foto(s) subida(s)**» mientras el único
   ítem debajo dice «qa-foto.jpg **· pendiente**» con borde punteado ámbar — nada se ha
   subido a Drive. Medido en DOM (`slotTexto`: `Toca para seleccionar fotos1 foto(s)
   subida(s)qa-foto.jpg· pendiente`) y confirmado por visión. En el HEAD el encabezado vive
   en `SeccionFotos` (nueva-visita.jsx, `fotos.length + ' foto(s) subida(s)'` sobre la
   lista, ~4397). ⚠️ **Ya hay fix sin commit en el árbol de trabajo** (borra el encabezado:
   «Sin encabezado de conteo: la pill del renglón ya lo dice») — no re-arreglar.

2. **El slot de fotos no lista las fotos previas de Drive** (persiste del informe estático
   anterior, ahora visto en render): en `?e=completa` el renglón dice «18 subidas» (el
   conteo llega por `listarFotosActa`) pero el slot solo contiene el control de subida
   (slotH 52px, `slotTexto` = «Toca para seleccionar fotos»); las 18 siguen visibles solo
   vía el modal de registro fotográfico. ⚠️ **También tiene fix sin commit**: `SeccionFotos`
   ahora las lista (efecto nuevo con `listarFotosActa` + dedup por nombre) y unifica el
   reporte de conteo por `onFotosChange` sin `Math.max`. No re-arreglar.

3. **Mapa en «Cargando mapa…» perpetuo sin conexión** (`?e=offline`, ambos viewports;
   también afecta al mapa de producción cuando no hay señal): la sección Ubicación queda un
   contenedor vacío de gran altura cuyo único indicador es un microtexto fuera de la caja;
   no hay estado offline ni skeleton. **Preexistente y fuera de las tres zonas
   rediseñadas** — se reporta porque la visión lo señaló en los 4 escenarios y contradice
   el resto del manejo offline (barra y botón sí lo comunican bien).

## P3 — consistencia

1. **«Sin fotos» con contraste 3.87:1** (umbral 4.5 para texto de 11px): mismo par de
   colores en el chip del panel de estado y en la pill `et-apagado` del renglón de fotos
   (`?e=faltantes`/`?e=offline`). Zona rediseñada; los demás estados («Faltan 22 campos»,
   «Pendiente») miden 4.5 exactos.
2. **«Ver PQR» mide 41px de alto** (<44) junto al campo Radicado, en 390 y 1366. Es el
   único botón de acción por debajo del mínimo en toda la app medida.
3. **«Faltan 22 campos» aparece 3 veces simultáneas** con tres tratamientos (chip del panel,
   aviso plegable de entregables, badges de las filas acta e informe — contadas por hoja en
   DOM). Intencional pero ruidoso; el aviso plegable ya existía como el detalle.
4. **«Registro fotográfico: Con fotos» (tono ok) por una foto que solo está en cola**:
   `estadoTono` cuenta `subidas + enCola` (nueva-visita.jsx:3876-3878), pero con la visita
   offline no se puede generar el RF (generadores bloqueados sin señal). Estado optimista;
   con el fix del árbol de trabajo sigue contando `enCola`.
5. **«Toca para seleccionar fotos» en escritorio** — microcopy táctil fijo a 1366px.
6. **«Abrir» (carpeta Drive) vs «Ver» (documentos)** — verbos distintos para la misma idea
   (abrir en Drive). Defendible; se anota por consistencia.

Hallazgos del modal de `?e=nueva` (tarjeta resaltada sin indicador de selección, centrado
vertical, iconografía emoji): preexistentes al rediseño y fuera de las tres zonas — no se
desarrollan.

## Descartado — lo que la visión dijo y la medición desmintió

- **«La barra fija tapa contenido»** (dicho en 4 screenshots): artefacto de captura fullPage
  con `position:fixed`. Scroll al fondo + intersección de rects contra la barra: **0
  elementos tapados** (el wrapper del banco reserva 120px de padding inferior; el escenario
  aparece igual en producción vía `paddingBottom`).
- **«2026-09-015 se parte en dos líneas»** (completa-390): `getClientRects()` del título =
  **1 línea**.
- **«Card-in-card en Entregables»** (completa-1366): `ent-fila-wrap` y `ent-fila` sin fondo
  ni borde (transparentes, border 0px); solo la sección contenedora tiene caja. Filas por
  divisores, como en la primera pasada.
- **«Chip "Informe generada" (concordancia)»**: el código dice «Informe generado»
  (nueva-visita.jsx:1442) y «Acta generada» (1438), ambos correctos.
- **«Generar registro se ve gris/deshabilitado y los otros dos no»** (faltantes-390): los
  tres botones «Generar …» miden igual — habilitados, 44px, mismo bg `rgb(251,233,224)` y
  color `rgb(138,63,38)`.
- **«↻ sin etiqueta, target pequeño»**: `aria-label` «Regenerar el acta F-GGO-46» /
  «Regenerar el informe F-GGO-43» presentes y medidos 44×44 exactos.
- **«Separador · colgante al partir la línea de dirección»**: 1 línea (rect único).
- **«Placeholder termina en dos puntos suspensivos»**: el fuente tiene «...» (línea 3724).
- **«Barrio "Otro..." sin campo para especificar»**: el input «Escribir nombre del barrio»
  existe y está visible junto al select.
- **«Contraste insuficiente de los hints»**: «Mejorar texto…» mide **7.51:1** (11px).
- **«← Volver al inicio táctil pequeño»**: 0 elementos <44px en `?e=nueva`-390.
- **«● Cambios sin guardar» apareció una vez** en `completa`-390 (corrida 2) sin interacción
  previa: no se reprodujo en 4 sondes × 6 lecturas (2.5–15 s) en ningún viewport. Sin
  reproducibilidad no se reporta como bug; queda registrado por si se vuelve a ver.

---

## Estado de los 6 arreglos

| # | Arreglo | Veredicto | Evidencia (medida en DOM, HEAD `53c9d23`) |
|---|---|---|---|
| 1 | Escáner: «Reemplazar escaneo» + peso secundario, sin competir con «Guardar cambios» | ✅ | `?e=completa`, ambos viewports: botón 44px, bg `rgb(236,229,217)` (superficie-2), borde tenue 18%, fs13/weight500; «Guardar cambios» 50px, bg terracota `rgb(172,80,49)`, fs16/600 — jerarquías netas. El slot `ent-slot-orden` no añade caja propia (hijo transparente, sin borde): no hay tarjeta dentro de tarjeta. |
| 2 | `<summary>` de faltantes ≥44px en 390 + marcador | ✅ | Medido: **alto exacto 44px** (ancho 270), marcador `▸` en `::before`, `display:flex` (el nativo eliminado). Igual en 1366 (1036px de ancho). |
| 3 | Aviso de faltantes oculto con acta+informe; nombra solo el que falte | ✅ | En `?e=completa` no existe `<summary>` ni `<details>` de faltantes (medido). El caso «falta solo uno» no tiene fixture en el banco; la lógica está verificada estáticamente (condición y texto «el informe»/«el acta», nueva-visita.jsx:3757-3758, informe anterior). |
| 4 | Botón «Generar registro» en el renglón de RF | ✅ | Presente y habilitado (44px) en faltantes, offline y completa — en completa con estado «Con fotos» (ver P3-4). |
| 5 | Patrón de regeneración unificado | ✅ | Acta e informe: «Ver» + botón-icono ↻ con `aria-label` «Regenerar …», 44×44 medidos. RF sin `linkRegistroFotos`: botón de texto «Generar registro» (44px), igual patrón que «Generar acta»/«Generar informe» sin generar (los tres idénticos en estilo/altura — medido). |
| 6 | Hint de Actuación nombrando «Mejorar texto» | ✅ | Visible en los 4 escenarios: «Texto descriptivo… Usa «Mejorar texto» para pulir la redacción con IA.» — 11px, contraste 7.51:1. |

### Foco 1 — fila de fotos y control de subida (lo que no se pudo ver la vez pasada)

- **El renglón informa cantidad y estado**: pill del renglón «**18 subidas**» (`et-ok`) en
  `?e=completa`; «Sin fotos» (`et-apagado`) en faltantes/offline; tras seleccionar una foto
  en offline, «**⇡ 1 en cola**» (tono cola). Medido en DOM.
- **El control encaja sin tarjeta-dentro-de-tarjeta**: `ent-slot-fotos` sin fondo ni borde;
  el control de subida es un `<label>` dropzone de 52px (borde brand, fondo suave) dentro
  del padding del renglón. Visión lo confirmó independiente de la medición.
- **«Subidas» vs «en cola» se distinguen** en dos niveles: pill del renglón (⇡ ámbar) e
  ítems «· pendiente» con borde punteado ámbar (verificado en vivo inyectando un archivo
  real por CDP). El matiz que queda es el P2-1: el contador interno «1 foto(s) subida(s)»
  miente mientras hay pendientes — ya corregido en el árbol sin commit.

### Regresiones — cubiertas

Overflow 0/8, consola 0/8, táctiles (solo «Ver PQR» 41px), contraste en las tres zonas
rediseñadas (solo «Sin fotos» 3.87:1). Sin regresiones P1/P2 introducidas por `53c9d23` en
las zonas rediseñadas — los dos P2 del slot de fotos son arrastres del estado anterior, no
rompes del commit, y ya tienen fix pendiente de commit.

---

## Nota sobre el árbol de trabajo

Durante la corrida aparecieron **cambios sin commit en `nueva-visita.jsx`** (30+/26−, no
estaban en el `git status` del arranque de la sesión): mueven la lectura de fotos de Drive a
`SeccionFotos` (que ahora lista las previas), eliminan el encabezado «N foto(s) subida(s)» y
simplifican el conteo del panel. Esos cambios **no** estaban en el bundle medido (el banco
sirve `bundle.min.js` de `53c9d23`), así que P2-1 y P2-2 describen el HEAD — y ya están
resueltos en el árbol. Falta `node build.js` + bump de caché para que el fix llegue al
bundle.

**No se arregló nada, no se editó código, no se hizo commit** (los scripts y capturas
temporales de `.qa2/` se borraron al terminar).
