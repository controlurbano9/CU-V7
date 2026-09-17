# TASK-ui-espacio-y-datos — 6 mejoras de UI frontend (Sistema Inspección N°9)

> One-shot: no puedes preguntar. Todo está decidido y verificado con líneas exactas.
> Trabajas SOLO en `cu-v5-dev/` (repo git). **NO** edites `index.html`, `sw.js`, `api.js`
> ni corras `node build.js` — el build, bumps de versión y deploy los hace el director después.
> Regla de hooks: useState/useEffect/useRef SIEMPRE antes de cualquier early return (aliasing por archivo ya existente).
> Al terminar TODO: un solo commit git. No hagas push.

## Cambio 1 — Cabecera compacta con botón Guardar (nueva-visita.jsx + styles.css)

Hoy: `.nv-header` sticky (nueva-visita.jsx:3276-3304) con título «Continuar visita» + botón «← Volver» + `PanelEstadoVisita`; aparte, barra fija inferior (~92 px) con indicador `.barra-estado-gs` y botón `guardar` (nueva-visita.jsx:4413-4451). El usuario pide: botón Guardar en la cabecera, eliminar barra inferior, título y espacio muerto.

**nueva-visita.jsx:**
1. Línea 3271: quitar `style={{ paddingBottom: 140 }}`.
2. Líneas 3221-3223: eliminar `tituloPantalla` (su único uso es la línea 3278).
3. Reescribir `.nv-header` (3276-3304):
   - Fila principal: botón Volver como icono `←` compacto (`aria-label="Volver"`, `title="Volver"`, handler `_confirmarVolver` intacto, `btn-neutro` con `padding: 8px 10px`, fontSize 14) + `PanelEstadoVisita` (mismas props de 3287-3302, intactas) + nuevo bloque `<div className="nv-acciones">` con:
     - el indicador de guardado `.barra-estado-gs` con el MISMO contenido y clases condicionales de 4427-4441 (guardando/error/dirty/enColaGuardado/enLinea/ultimoGuardadoMs) y `aria-live="polite"`;
     - el botón `onClick={guardar} disabled={guardando} aria-busy={guardando} className="btn-principal"` con `style={{ margin: 0, padding: '10px 12px', fontSize: 14 }}` y texto corto: `guardando ? 'Guardando…' : 'Guardar'` (los textos largos de la barra no caben; el offline lo comunica el indicador).
4. Líneas 4413-4451: borrar la barra fija completa (contenedor `position:fixed` + indicador + botón) — ya viven en la cabecera.
5. En `PanelEstadoVisita` (1504-1548): mover el bloque `.estado-dir` (1514-1520) DENTRO de `.estado-panel-top` como último hijo. Chips de pendientes (1525-1539) y `.estado-aviso` (1540-1545) intactos.
6. NO se mueve ningún hook (verificado: `guardar`, `guardando`, `errorGuardar`, `dirty`, `enColaGuardado`, `enLinea`, `ultimoGuardadoMs` son del componente raíz, antes del return).

**styles.css:**
1. Reglas nuevas junto a `.nv-header` (tras línea 1084):
   - `.nv-header .estado-panel { flex: 1; min-width: 0; background: transparent; border: 0; padding: 0; gap: 4px; }` (la cabecera ya es la caja)
   - `.nv-header .estado-panel-top { flex-wrap: nowrap; min-width: 0; }`
   - `.nv-header .estado-dir { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }`
   - `.nv-acciones { display: flex; flex-direction: column; align-items: stretch; gap: 4px; flex-shrink: 0; width: 128px; }`
   - `.nv-acciones .barra-estado-gs { margin-bottom: 0; min-height: 0; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`
2. Media ≤767 (1089-1095): quitar la regla `.nv-header .page-title { display: none }` (dead) y la truncación de `.estado-dir` (queda en la regla base). Conservar ocultar `.estado-resumen`.
3. `--nv-header-h`: MIDE el alto real de `.nv-header` en el banco QA (ver QA) y fija: línea 86 (base, esperado ~120 px) y línea 1731 (media ≥900, esperado ~140 px) con +8 px de margen. Ambas en este commit.
4. Línea 1132: cambiar `- 104px` por `- var(--content-pad-top)` (la barra ya no existe). Actualizar el comentario 1128-1131.
5. Reglas offline 1080 y 1747: NO tocarlas (la cabecera sigue sticky).
6. Si en 360 px la fila desborda: en el media ≤767 permitir que `.estado-panel-top` haga wrap. Solo si la medición lo exige.

## Cambio 2 — Buscar por NOMBRE PERSONA ATIENDE (buscar.jsx + visita-card.jsx)

1. `buscar.jsx:277`: añadir `'NOMBRE PERSONA ATIENDE'` al array `hay` (la línea 278 ya aplica `.toUpperCase().includes(lq)`).
2. `buscar.jsx:334`: placeholder → `"Radicado, orden de policía, dirección, barrio, persona que atiende..."`.
3. `visita-card.jsx`: prop nueva `mostrarPersonaAtiende` replicando EXACTAMENTE el patrón de `mostrarOrden` (firma ~93, doc 74-82, lectura del campo tras 107: `const personaAtiende = mostrarPersonaAtiende ? ((f['NOMBRE PERSONA ATIENDE'] || '').toString().trim()) : '';`, incluirlo en `tieneMeta` ~117, render tras 160: `{personaAtiende && <span><span style={{opacity: 0.7}}>Atiende:</span> {personaAtiende}</span>}`).
4. `buscar.jsx:609-611`: pasar `mostrarPersonaAtiende` a `VisitaCard` (junto a `mostrarOrden`). Home y Mis visitas NO lo muestran.

## Cambio 3 — Consulta de Norma en 2 columnas, ≥1440 (consulta-norma.jsx + styles.css)

1. `consulta-norma.jsx:350`: raíz → `className="pantalla activa pad-bottom cn-pantalla"`.
2. Envolver en dos divs: `<div className="cn-col">` desde el título (351) hasta la card de error (427); `<div className="cn-col cn-col-der">` desde la alerta municipal (430) hasta la card Norma POT (556). Solo mover JSX, cero lógica. Los hooks (120-237) quedan intactos antes del return.
3. styles.css, bloque nuevo (declarado después del bloque de `.pantalla.nv-pantalla`, ~1146):
```css
@media (min-width: 1440px) {
  .pantalla.cn-pantalla {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;
    column-gap: 24px;
    align-items: start;
    max-width: calc(var(--content-max) + 404px);
  }
}
```
Sin sticky en la columna derecha. **Corte 1440, no 1200** (decisión del usuario).

## Cambio 4 — Inicio: stats en fila de 4 + 2 columnas, ≥1200 (home.jsx + styles.css)

1. `home.jsx:201`: raíz → `className="pantalla activa pad-bottom home-pantalla"`.
2. Envolver las secciones «Asignadas hoy» (236-258) y «Alertas» (261-275) en `<div className="home-2col">`. Error (228-232) y footer (277-282) quedan fuera, a ancho completo.
3. styles.css:
```css
@media (min-width: 1200px) {
  .home-pantalla .stats-grid-2x2 { grid-template-columns: repeat(4, 1fr); }
  .home-2col {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    column-gap: 24px;
    align-items: start;
  }
}
```

## Cambio 5 — «Realizadas este mes» por FECHA DE VISITA (home.jsx)

Reemplazar `home.jsx:60-63` (bloque que cuenta `COMPLETADO` con `FECHA DEVOLUCION`) por:
```js
if (e === 'INICIADO' || e === 'COMPLETADO') {
  const dVis = parsearFecha(f['FECHA DE VISITA'] || '');
  if (dVis && dVis.getMonth() === mesActual && dVis.getFullYear() === anioActual) mes++;
}
```
Label «Realizadas este mes» (215-216) sin cambios. `parsearFecha`, `mesActual`, `anioActual` ya existen en el useMemo (42-45).

## Cambio 6 — Agenda: fecha del radicado en la tarjeta (agenda.jsx)

`agenda.jsx:391-393`: junto al radicado, añadir la fecha `it.fechaRad` (ya viaja en el payload) en estilo secundario: `<span style={{ fontWeight: 400, color: 'var(--texto-suave)', fontSize: 10 }}>{it.fechaRad}</span>` dentro del flex existente (mismo patrón visual que VisitaCard 132-136). Aplicar solo si `it.fechaRad` existe.

## QA — medición en el banco (solo cabecera)

Abre `qa-centro-control.html` con Playwright MCP (`mcp__plugin_playwright_playwright__*`) en los escenarios existentes (`?e=nueva|faltantes|completa|offline` — revisa qué parámetros acepta el banco) × viewports 360, 390, 768, 900, 1366, 1440, 1680. MIDE en DOM (nunca a ojo — la visión especula):
- Alto real de `.nv-header` por breakpoint → fuente de `--nv-header-h` (86 y 1731, +8 px).
- Botón Guardar 100 % visible con área ≥44 px en 360; sin overflow horizontal del documento.
- `.estado-dir` con ellipsis (offsetWidth ≈ scrollWidth o menor).
- Chips de pendientes solo con fila editada; `.estado-aviso` visible sin fila.
- En ≥1440: `.nv-entregables` sticky no se solapa con la cabecera.
- Offline: cabecera baja 40 px sin tapar la barra de la app.

Home y Norma no tienen mock en el banco: verifícalas en el banco SOLO si es posible montarlas; si no, deja nota en el commit de qué no se pudo medir. No inventes mediciones.

## Cierre

1. Todos los cambios 1-6 aplicados en las fuentes JSX/CSS (NO bundle, NO index.html, NO sw.js).
2. QA de cabecera medida en DOM según la sección QA; `--nv-header-h` fijado con valores medidos.
3. `git add` + **un commit** con mensaje descriptivo tipo `ui: cabecera compacta con guardar, 2col home/norma, buscar por persona que atiende, stats y agenda`.
4. NO hagas push, NO corras build.
