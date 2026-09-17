# UI REVIEW 3 — rediseño de entregables, medido (2026-09-13)

Banco `http://127.0.0.1:8099/qa-centro-control.html`, escenarios `?e=nueva|faltantes|completa|offline`,
viewports 1366×768 y 390×844 (los 8 pares). Render vía playwright MCP; cada hallazgo de visión
verificado en DOM (`getBoundingClientRect`/`getComputedStyle`) o con lectura del código. Capturas de
referencia: `qa3-zona-completa-1366.png`, `qa3-zona-completa-390.png`, `qa3-zona-faltantes-1366.png`,
`qa3-zona-faltantes-390.png` (carpeta `.playwright-mcp/`).

**Sin P1.** El rediseño se cumple en lo esencial: nada se corta, nada desborda (overflow horizontal 0
en los 8 pares), la consola solo suelta el favicon 404 del banco y los objetivos táctiles de la zona
miden 44 px exactos.

---

## P1 — rotura funcional/visual

Ninguna.

## P2 — UX / accesibilidad

### P2-1 · El punto de estado «apagado» no supera el contraste mínimo (1.41:1)
- **Dónde:** renglón «Registro fotográfico» en `faltantes` y `offline` (ambos viewports); también
  sería el estado de la orden sin escanear cuando el renglón dice «Requiere carpeta de Drive».
- **Medición:** `.ent-dot` sin clase de tono usa `var(--surface-3)` → `rgb(222,213,200)` sobre fondo
  real `rgb(255,251,245)` = **ratio 1.41** (WCAG 1.4.11 pide ≥3:1 para gráficos). Los otros dos
  tonos sí pasan: `ed-ok` `rgb(107,122,58)` = **4.56**, `ed-pend` `rgb(141,104,45)` = **4.91**.
  La visión lo reportó en los dos viewports sin conocer la cifra; la medición lo confirma.
- **Efecto:** «Requiere fotos» se lee como «esta fila no tiene punto» — el inspector no distingue
  «no aplica todavía» de «se me cayó el estado».
- **Corrección:** `styles.css:1095-1098` — el tono por defecto de `.ent-dot` necesita un gris medio
  (p. ej. el `--ink-4` o un oliva al 40%); los tres tonos ya tienen `title`+`.sr-only`, así que el
  color es el único canal débil.

## P3 — consistencia

### P3-1 · El botón principal no queda en columna cuando convive con el ↻
- **Dónde:** `completa` a 1366 (única combinación con filas mixtas).
- **Medición:** «Abrir» de las filas con ↻ (orden, acta, informe) va de x=1068.3→1160.3 y el ↻
  termina en 1210.3; «Abrir»/«Generar» de las filas sin ↻ (carpeta, RF) termina en 1210.3. El
  conjunto está alineado al borde derecho, pero el botón principal **brinca 50 px** entre
  renglones, y el punto de estado también (right 1202.7 sin botón vs 1100.7 con botón en
  `faltantes`). El comentario de `styles.css:1104-1106` dice que el `min-width` común «las alinea
  en columna entre renglones»: solo se cumple cuando todas las filas tienen (o ninguna tiene) el ↻
  — en `offline`/`faltantes`, sin ningún ↻, sí quedan en columna perfecta (right 1202.7 × 4).
- **Corrección:** `styles.css:1103` (`.ent-acciones`) — reservar el ancho del grupo acciones
  (botón + hueco de 44 px del ↻) o añadir un placeholder invisible del icono en las filas sin
  acción secundaria. En 390 no ocurre: el wrap deja los botones en left 50.7 uniforme.

### P3-2 · «Abrir» sale subrayado; «Generar» no
- **Medición:** `a.ent-btn` computa `text-decoration: underline` (color `rgb(138,63,38)`) —
  `.btn-accion` (`styles.css:678-689`) no declara `text-decoration: none`, y el `<a>` hereda el
  subrayado del navegador. Los «Generar» (`<button>`) no lo llevan: misma caja, dos metáforas.
- **Corrección:** `styles.css:678` — añadir `text-decoration: none` a `.btn-accion`.

### P3-3 · «F-GGO-46» se parte por el guion en el subtítulo del RF (390 px)
- **Medición:** en `completa` 390, el meta «Fotos de la visita · documento F-GGO-46» ocupa 2 líneas
  y el código «F-GGO-46» en sí ocupa 2 líneas (rects del range en tops 33.5 y 50.5): el navegador
  parte en el guion y queda «F-» / «GGO-46».
- **Corrección:** `styles.css:1088` (`.ent-meta`) o el texto de `nueva-visita.jsx:3944` —
  `white-space: nowrap` en el código, o guion de no separación (`F‑GGO‑46` U+2011).

### P3-4 · «Generar» del registro fotográfico habilitado sin carpeta ni fotos
- **Medición:** en `faltantes` el renglón RF está `ed-apagado`/«Requiere fotos» con meta
  «Disponible al crear la carpeta de Drive», pero su «Generar» computa `disabled:false`,
  `cursor:pointer`, opacidad 1 — idéntico a los dos «Generar» que sí proceden. La visión lo marcó
  P2 en ambos viewports; la lectura del handler lo baja: el clic abre `abrirModalFotos`
  (`nueva-visita.jsx:3976`), el modal de revisión con lista vacía y su «Confirmar y generar»
  deshabilitado — un callejón sin salida suave, no un error.
- **Corrección:** `nueva-visita.jsx:3976` — `disabled={docOcupado || cargandoFotos || (!d.idCarpetaFotos && fotosInfo.subidas === 0)}`, o cambiar el CTA a texto de ayuda.

### P3-5 · Grilla 17+1 a 1366
- **Medición:** 18 celdas en 17 columnas de 56.6 px → segunda fila con una sola celda a la
  izquierda. Es el comportamiento natural de `repeat(auto-fill, minmax(56px,1fr))`
  (`styles.css:1118`) con este ancho de contenedor (1058.7 px); a 390 quedan 4 columnas limpias
  (4×4+2). Menor: se corrige solo eligiendo otro mínimo si molesta; no lo llamaría bug.

### P3-6 · Capitalización de nombres de renglón
- «Acta de Inspección Ocular» (title case) junto a «Informe de inspección» y «Registro
  fotográfico» (sentence case). Defendible — el acta es nombre propio del formato F-GGO-46 — pero
  «Informe de inspección F-GGO-43» también lo es. Solo unificar si hay criterio
  (`nueva-visita.jsx:3877,3903,3942`).

## Descartado — lo que la visión dijo y la medición desmintió

| Dijo la visión | Medición |
|---|---|
| «Generar» más ancho que «Abrir» (1366) | Los 5 `.ent-btn` miden exactamente 92×44 |
| Botones de ~36-40 px de alto (390) | 44.0 px medidos en todos los casos |
| La fila del RF «carece de punto de estado» | Tiene `ed-pend` con `title="Pendiente de generar"` (visible en DOM, 10×10) |
| Puntos sin tooltip/accesibilidad | `title` + `.sr-only` en cada `.ent-estado-wrap` (HTML medido) |
| Miniaturas grises vacías = inconsistente con «18 fotos» | Esperado: `drive.google.com` no carga en el banco; el número sobre franja `rgba(255,255,255,.82)` se dibuja igual y las 18 celdas están intactas (0 colapsadas) |
| El footer fijo tapa la última fila de la grilla | Tras scroll al fondo, última celda termina en y=545.4 y la barra empieza en 751.6 — 206 px de aire (padding inferior total 298 px) |
| «Sin cambios» con contraste insuficiente | `rgb(128,111,90)` sobre `rgb(255,251,245)` = **4.69** ≥ 4.5 AA |
| Errata «hoja de calculo» sin tilde | El DOM dice «hoja de cálculo + PDF», con tilde |
| Chevron del acordeón «Ver qué campos faltan» apunta abajo estando cerrado | `details.open === false` y el CSS usa `▸` cerrado / `▾` abierto (`styles.css:1075-1076`) |
| «Franja oliva oscura vacía» al final de la captura móvil | No existe tal elemento (hijos de body: contenedor raíz + scripts); artefacto de la captura |

---

## Regresiones (los 8 pares)

- **Overflow horizontal:** `scrollWidth − clientWidth = 0` en los 8 pares; ningún elemento con
  `right > clientWidth`.
- **Consola:** solo el favicon 404 del banco (ruido declarado). Ni `CU_MAPS_JS_URL` ni rechazos de
  fetch aparecieron como error en las pasadas.
- **Táctiles:** ningún botón/enlace de la zona por debajo de 44 px (los `.ent-btn` y los ↻ miden
  44×44 exactos). Los `radio-opcion` de 37.3 px están en el formulario general, fuera del área
  rediseñada y preexistentes — anotado, no cuenta contra este cambio.
- **Riesgo 1 — el slot del RF crece con 18 miniaturas:** grilla de 119.3 px a 1366 (2 filas) y
  348.2 px a 390 (5 filas); overflow 0 en ambos, ninguna fila hermana desplazada y el renglón RF
  es el último de la lista, como planeó el diseño (`nueva-visita.jsx:3930-3932`).
- **Riesgo 2 — botón + ↻ en 390 px:** no se salen: la fila envuelve (cuerpo arriba, acciones
  debajo), «Abrir» 92×44 + ↻ 44×44 terminan en x=192.7 con 145 px de margen al borde.
- **Panel superior:** «Faltan N campos» no aparece en ningún escenario. `nueva` → «Visita sin
  guardar…»; `faltantes`/`offline` → «Acta sin generar | Informe sin generar»; `completa` →
  «Registro fotográfico sin generar». El chip verde «Entregables completos» existe
  (`nueva-visita.jsx:1471`) pero ningún fixture lo alcanza (en `completa` el RF sigue pendiente):
  verificado por código, no en render.
- **Barra de guardado en offline:** «Sin conexión — guarda y se enviará al recuperar la señal» +
  «Guardar (se envía con señal)», fija abajo, medido en 390.

---

## Las 8 observaciones

| # | Observación | Veredicto | Evidencia medida |
|---|---|---|---|
| 1 | Botones uniformes «Generar»/«Abrir», mismas dimensiones, ≥44 px | ✅ | 5×`.ent-btn` = **92×44** en `completa` (1366 y 390); 3×92×44 en `faltantes` y `offline` (ambos viewports); 0 en `nueva`. Solo dos textos («Escanear» existe por código, ver #6). ⚠ matiz de columna: ver **P3-1** |
| 2 | Un solo renglón de fotos, sin «Fotos de la visita» aparte | ✅ | No existe ningún `.ent-fila-wrap` con ese nombre; la subida vive en el slot del renglón RF (`nueva-visita.jsx:3958-3960`). La frase sobrevive solo como subtítulo del RF, no como renglón |
| 3 | Grilla de miniaturas ~170 px, cuadrada, numerada, sin huecos | ✅ | 1366: alto **119.3 px** (mejor que el objetivo; antes ~790), 17 columnas, celdas 56.6² — las 18 idénticas, 0 colapsadas, número legible sobre franja blanca. 390: 4 columnas de 64.8², alto 348.2 (18 celdas), 0 fuera de viewport. ⚠ estética 17+1: **P3-5** |
| 4 | Sin renglón de PQR; acceso junto al Radicado | ✅ | `pqrEnZona:false` en `completa`; «Ver PQR» presente junto al campo RADICADO |
| 5 | «Acta de Inspección Ocular» exacto, sin «caracterización» | ✅ | Texto exacto en los 3 escenarios con zona; «caracterizaci…» no aparece ni en la zona ni en el body |
| 6 | Orden de policía en un renglón; ↻ igual que los demás; «Escanear» sin escanear | ✅ (⚠ parcial) | El escáner renderiza su propio `FilaEntregable` (`escaner-orden.jsx:248`), sin bloque aparte. ↻ de la orden («Reemplazar escaneo») = **44×44**, idéntico al de acta, informe y RF (44×44). «Escanear» **no verificable en render**: ningún fixture monta orden sin link (verificado por código, `escaner-orden.jsx:352-358`, `btn-accion ent-btn`) |
| 7 | Estado por punto, sin pills de texto; conteo de fotos permitido; accesible | ✅ | Ninguna pill de texto visible en los 8 pares; los estados van en `title` + `.sr-only`. Único texto: «18 fotos» (`ent-nota`, `completa`). «⇡ N en cola» existe por código (`nueva-visita.jsx:3952`). Contraste: ok 4.56, pend 4.91 ✅; **apagado 1.41 ❌ → P2-1** |
| 8 | Panel superior sin «Faltan N campos»; pendientes aplicables o chip verde | ✅ | «Faltan N campos» ausente en los 4 escenarios (regex sobre `body.innerText`); pendientes concretos por escenario (ver Regresiones). Chip verde existe (`nueva-visita.jsx:1471`), no cubierto por fixture |

**Orden de renglones confirmado** (el RF siempre último): `completa` → Carpeta, Orden, Acta,
Informe, RF. `faltantes`/`offline` → Carpeta, Acta, Informe, RF (sin orden: el fixture no trae
suspensión, el renglón no aplica). `nueva` → sin renglones, texto de guía «Guarda la visita para
crear su carpeta en Drive…».

### Limitaciones del banco (no del rediseño)
- Estado «Escanear» (orden sin link) y chip verde «Entregables completos»: sin fixture, verificados
  por lectura de código.
- «⇡ N en cola»: requeriría encolar fotos reales en IDB; texto y condición verificados en
  `nueva-visita.jsx:3946-3956`.
- `?e=nueva` arranca en el modal de tipo de visita; la zona se mide tras elegir «Visita de
  oficio» (la ruta PQR exige radicado y el stub rechaza la búsqueda).
