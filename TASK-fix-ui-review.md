# TASK — Correcciones del UI review del centro de control

Hallazgos verificados del review visual (`INFORME-ui-review-centro-control.md`,
4 escenarios × 2 viewports sobre el commit `ebd83d8`). El review no encontró
ningún P1; esto son P2/P3 acotados. **Cada arreglo es local**: no rediseñes nada
ni reorganices la pantalla.

## Arreglos (en este orden)

### 1. El escáner no se degrada cuando la orden ya está escaneada (P2-1)
`escaner-orden.jsx:266`. Con la orden ya subida, el renglón de entregables
muestra «Escaneada» + «Ver» y **debajo** sigue colgando el control principal
terracota a ancho completo diciendo «Escanear orden de policía» (1059 px a
1366): dos CTA primarios compitiendo, y el de abajo sugiere trabajo pendiente
que el estado dice que no existe.

El componente ya conoce `link` (`linkInicial`). Cuando hay `link` y no hay
páginas en curso, el control debe:
- decir **«Reemplazar escaneo»** (no «Escanear orden de policía»),
- dejar de verse como acción primaria: peso secundario/outline, no el bloque
  relleno a ancho completo.
Con páginas en curso (`paginas.length > 0`) se conserva «Agregar otra página».
La confirmación de reemplazo que ya existe no se toca.

### 2. `<summary>` de campos faltantes por debajo del umbral táctil (P3-4)
`nueva-visita.jsx:3767-3773` / clase `.ent-faltan summary` en `styles.css`.
Mide 37 px de alto en 390 px; es el único control de la zona rediseñada bajo
44 px. Dale `min-height: var(--tap)` y el padding necesario para que el área
pulsable llegue a 44 px sin engordar la caja en escritorio.

### 3. El aviso de faltantes contradice a los renglones (P3-3)
`nueva-visita.jsx:3767`: el `<details>` «Faltan N campos para generar el acta o
el informe» se muestra aunque **acta e informe ya estén generados**, junto a sus
propias pills «Generada»/«Generado». Solo debe aparecer si queda algo por
generar: ocúltalo cuando `d.linkXlsxActa` **y** `d.linkDocxInforme` ya existan
(si solo uno existe, el aviso sigue siendo válido para el otro — ajusta el texto
para nombrar únicamente el documento que falta).

### 4. Lenguaje de los botones de generación (P3-1)
`nueva-visita.jsx:3894`: dice «Generar» a secas mientras sus hermanos dicen
«Generar acta» y «Generar informe». Debe decir **«Generar registro»**
(el renglón ya aporta el contexto «Registro fotográfico»; no repitas la palabra
completa dos veces en el mismo renglón).

### 5. Tres tratamientos distintos de «regenerar» (P3-2)
Hoy: el acta resuelve regenerar con un botón-icono ↻ (`nueva-visita.jsx:3866`),
el informe mantiene el CTA de texto completo «Generar informe» junto a la pill
«Generado» (`nueva-visita.jsx:3915-3918`), y el registro fotográfico siempre
ofrece el mismo botón. **Unifica el patrón**: cuando la pieza ya está generada,
la acción de rehacerla es el botón-icono ↻ con `aria-label` explícito
(«Regenerar el informe F-GGO-43», etc.) al lado del enlace «Ver»; cuando no está
generada, botón de texto «Generar …». Aplícalo al informe y al registro
fotográfico igual que al acta. El informe ya generado **no** debe seguir
mostrando un CTA de texto.

### 6. Hint que nombra un botón inexistente (P3-7)
`nueva-visita.jsx:3436`: el hint dice «Usa el botón IA para pulir la redacción»;
el botón visible se llama **«Mejorar texto»**. Corrige el hint para nombrarlo
como está en pantalla.

## Invariantes
- Presentación y textos únicamente: no toques `_construirPayload`, columnas de
  BD, `api.js`, ni el contrato con el backend.
- Hooks siempre antes de cualquier `return` condicional.
- Sin dependencias nuevas. No edites `bundle.min.js` a mano (se regenera).
- Estilos nuevos como clases en `styles.css` con las variables existentes.
- Accesibilidad: todo botón-icono con `aria-label`; `aria-busy` mientras procesa;
  objetivos ≥44 px en móvil.
- Textos de UI y comentarios en español con acentos correctos.
- No toques `utils.js`, `tests/`, ni `qa-centro-control.html` (el banco de
  pruebas ya lo corregí yo).

## Verificación antes de cerrar
1. `node build.js` sin errores.
2. `npm test` en verde.
3. `npx eslint nueva-visita.jsx escaner-orden.jsx` sin errores nuevos.
4. Bumpa `?v=` del bundle en `index.html` y `CACHE_NAME` en `sw.js`.

## Cierre
Un solo commit (`git add -A`, mensaje en español). **No hagas push.** Luego para.
