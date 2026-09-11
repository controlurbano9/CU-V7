# TASK — «Centro de control de la visita» (rediseño de producto/UX de `nueva-visita.jsx`)

Actúa como **director senior de producto digital** especializado en software para
administración pública, aplicaciones operativas de campo, arquitectura de
información, accesibilidad y QA funcional. No es un encargo de embellecimiento:
es un encargo de **producto**. Si algo del diseño actual está mal, dilo sin
suavizarlo. No defiendas la estructura actual por el hecho de existir.

**Objetivo medible:** que un inspector entienda el estado completo de una visita
en **menos de 5 segundos**, sin leer el formulario entero, y que llegue a la
acción que le toca con menos clics y menos scroll.

---

## 1. Contexto real del producto (no lo infieras, está verificado)

Sistema de Inspección N°9 — Control Urbano, Alcaldía de Bello. App web (React sin
build de framework: JSX compilado con esbuild a `bundle.min.js`). La usan
inspectores en **campo, desde el celular, muchas veces sin señal**, y también
funcionarios en **escritorio** para revisar y cerrar visitas. Un inspector maneja
varias visitas al día, cada una con fotos, PDFs y tres documentos generados.

La pantalla objeto es el formulario de visita: `nueva-visita.jsx` (~4100 líneas),
**10 secciones** más una zona final de entregables. La captura que originó este
encargo muestra solo el tramo final (POT → Observaciones → botones de documentos
→ escáner → Drive → barra fija «Actualizar visita»), pero el diagnóstico debe
cubrir **toda la pantalla**, no solo ese tramo.

### Ciclo de vida de la visita
`PENDIENTE` → `ASIGNADO` → `INICIADO` → `COMPLETADO`. El estado inicial se lee de
BD; abrir una visita no la promueve, solo «Guardar» lo hace.

### Anatomía actual de la zona de entregables (`nueva-visita.jsx`)
| Elemento | Líneas | Comportamiento hoy |
|---|---|---|
| Sección «Observaciones y conclusiones» | 3381-3387 | textarea 6 filas |
| Aviso «Faltan N campos para generar el acta o el informe» | 3400-3416 | lista `_validarAntesDeActa()`; solo visible si `filaEditando` |
| Acta F-GGO-46 | 3421-3445 | sin acta: `Generar acta F-GGO-46` (botón relleno). Con acta: `Ver acta` + botón icono `Regenerar` |
| Informe F-GGO-43 | 3451-3592 | botón outlined; oculto si `COMPLETADO`; valida y abre `window.abrirInformeF43()` |
| `SeccionFotos` | 3598-3604, 3941+ | «Toca para seleccionar fotos», subida secuencial, cola acumulativa |
| `Generar registro fotográfico` | 3605-3611 | abre modal de revisión/reordenamiento y genera el Doc |
| `EscanerOrdenPolicia` (`escaner-orden.jsx`) | 3619-3627 | solo si hay N° de orden real + fila + carpeta; arma PDF con jsPDF en el cliente |
| «Ver carpeta Drive de la visita» | 3882-3893 | ancla gris |
| Barra fija inferior | 3898-3933 | estado offline / «Autoguardado · HH:MM» + botón `Actualizar visita` |

**Nota:** «Abrir carpeta Drive de la visita» aparece **dos veces** en pantalla
(dentro de `SeccionFotos`, línea ~4046+, y al final del formulario) — verifícalo
y trátalo en el diagnóstico.

### Restricciones funcionales que NO se pueden romper
- **Offline primero.** Guardados y subidas se encolan en IndexedDB
  (`offline-queue.js`) y salen solas al recuperar red. La UI debe poder expresar
  «en cola», no solo «guardado/error».
- **Autoguardado remoto cada 60 s** si ya existe `filaEditando` y el snapshot cambió.
  Más un **borrador local** en `localStorage` con debounce de 500 ms.
- **Idempotencia en el backend** (`requestId`/`clientId`): un reintento no duplica.
  Pero la UI hoy no impide del todo lanzar dos generaciones seguidas.
- Acta e informe exigen formulario completo: `_validarAntesDeActa()`.
- El escáner de orden solo existe con `filaEditando` + `d.idCarpetaVisita` + N° de
  orden real; las fotos solo con `d.idCarpetaFotos`.
- Documentos, fotos y escáner **no existen antes del primer guardado**. Esa es una
  transición de estado real de la pantalla y el diseño debe contarla, no ocultarla.

---

## 2. Lo que debes analizar (con criterio, no como checklist ciego)

1. **Jerarquía de acciones.** Clasifica cada acción en primaria / secundaria /
   terciaria / destructiva / automática: generar acta, generar informe, generar
   registro fotográfico, abrir carpeta Drive, seleccionar fotos, escanear orden,
   guardar. Hoy compiten tres botones a ancho completo. Propón una jerarquía única
   y justifícala: **solo una acción primaria visible a la vez**.
2. **Lenguaje de los botones.** Directo, natural, orientado a la acción y
   consistente. Evalúa explícitamente `Actualizar visita` → `Guardar cambios`.
   Los códigos `F-GGO-43`/`F-GGO-46` son metadato, no el nombre de la acción: no
   pueden ser la información dominante. Entrega el **texto exacto** de cada botón.
3. **Estado y progreso.** El inspector debe ver de un vistazo qué está completo,
   pendiente, sin iniciar, procesando o con error, y **qué falta para cerrar la
   visita**. Estados: ✓ Completo · ⚠ Pendiente · ○ Sin iniciar · ⟳ Procesando ·
   ✕ Error. Añade explícitamente el estado **⇡ En cola (sin conexión)**: en esta
   app es tan frecuente como los otros.
4. **Arquitectura de la pantalla.** No asumas correcta la actual. Propón la
   estructura completa (cabecera de visita, datos, progreso, observaciones,
   evidencia, documentos, cierre) y di qué se agrupa, qué se colapsa por defecto y
   qué desaparece.
5. **Densidad.** App operativa, no landing. Menos scroll, menos botones gigantes,
   menos aire muerto; más escaneabilidad y jerarquía. Cuantifica la reducción de
   altura donde puedas.
6. **Documentos y evidencia.** Cada pieza (fotos, orden de policía, acta, informe,
   registro fotográfico, PDF de la PQR) debe mostrar estado, cantidad, tipo, fecha
   cuando sirva, acciones disponibles y errores. Un renglón por pieza, no un botón
   por pieza.
7. **Generación de documentos.** Estados pendiente/generando/generado/error y
   **bloqueo real de dobles lanzamientos** (incluido el doble clic rápido y el
   lanzar acta e informe a la vez).
8. **Guardado siempre visible.** El usuario no puede tener que llegar al final de
   la pantalla para descubrir que hay cambios sin guardar. Guardado correcto,
   cambios pendientes, guardando, en cola, error.
9. **Auditoría QA senior.** Acciones ambiguas o duplicadas, errores de jerarquía,
   estados faltantes, falta de feedback, dobles clics, pérdida de información,
   confirmaciones ausentes, accesibilidad (foco, teclado, `aria-*`, contraste,
   tamaño de objetivo ≥44 px), consistencia de iconografía, responsive de
   escritorio. Cada hallazgo con `archivo:línea`.
10. **Diseño visual.** Profesional, institucional, moderno, sobrio, cálido,
    minimalista. Sin decoración sin función.

**No cuenta como trabajo hecho:** cambiar colores, tipografías, radios o sombras;
añadir iconos; mover botones sin cambiar la arquitectura.

---

## 3. Entregables

### A. `INFORME-centro-control-visita.md` (obligatorio, primero)
Secciones, en este orden:
- **A. Diagnóstico crítico** del diseño actual, con `archivo:línea`.
- **B. Problemas priorizados** P0 (crítico) / P1 (importante) / P2 (mejora).
- **C. Nueva arquitectura de la pantalla** (esquema ASCII del layout, desktop y móvil).
- **D. Nueva jerarquía de botones.**
- **E. Texto exacto de cada botón** (tabla: actual → propuesto → por qué).
- **F. Estados de cada componente**, incluida la matriz de transiciones.
- **G. Propuesta visual de layout.**
- **H. Reglas UX que deben volverse estándar de toda la app.**
- **I. Recomendaciones específicas para escritorio.**
- **J. Recomendaciones QA.**
- **K. Plan de implementación**: qué de lo anterior se implementa en este TASK y
  qué queda propuesto, con el diff previsto por archivo.

Regla dura: **cada afirmación sobre el código va con `archivo:línea` verificado
por lectura o grep**. No parafrasees ni inventes números de línea.

### B. Implementación (alcance ACOTADO — no rediseñes las 10 secciones)
Implementa en el código **solo** esto:
1. **Panel de estado de la visita** al inicio del formulario: estado, radicado o
   N° de orden, dirección, y un resumen de progreso legible en <5 s (campos
   faltantes, evidencia, documentos, qué falta para cerrar).
2. **Zona de entregables unificada**: un componente-lista donde fotos, orden de
   policía, acta, informe y registro fotográfico son **renglones con estado +
   acciones**, reemplazando la pila actual de botones a ancho completo
   (líneas 3393-3627). Guardas de doble lanzamiento incluidas.
3. **Barra de guardado con estado permanente** (3898-3933): sin cambios / cambios
   sin guardar / guardando / guardado HH:MM / en cola / error, y el texto del
   botón corregido.
4. Elimina la duplicación de «Abrir carpeta Drive».

Todo lo demás va **propuesto en el informe, no implementado**. Si algo del alcance
1-4 resulta inviable sin tocar lógica de negocio, no lo fuerces: déjalo en el
informe explicando por qué.

---

## 4. Invariantes — romper cualquiera invalida el TASK

- **No cambies lógica de negocio ni el contrato con el backend**: nada de tocar
  `_construirPayload`, el orden de columnas, `api.js`, `apps_script_unificado.js`,
  ni los nombres de acción. Es capa de presentación + estado de UI.
- **Hooks siempre antes de cualquier `return` condicional** (`useStateNV`,
  `React.useState/useEffect/useRef`). Es una regla crítica del proyecto: violarla
  rompe la app en producción.
- **Sin dependencias nuevas.** Sin Babel en runtime. React viene por CDN global.
- **No edites `bundle.min.js` a mano**: se regenera con `node build.js`.
- Si creas un `.jsx` nuevo, **regístralo en el array `ARCHIVOS` de `build.js`** en
  el orden correcto (las dependencias van antes que quien las usa).
- **Móvil sigue siendo ciudadano de primera**: es una app de campo. Layout
  desktop-first en la propuesta, pero nada puede romperse por debajo de 390 px de
  ancho; objetivos táctiles ≥44 px.
- Estilos nuevos como **clases en `styles.css`** usando las variables ya
  existentes (`--brand-accent`, `--gris-bg`, `--texto-suave`, `--amber`, …), no
  como una nueva montaña de estilos inline.
- Accesibilidad no negociable: `aria-busy` en acciones en curso, `aria-label` en
  botones-icono, foco visible, orden de tabulación coherente, contraste AA.
- Comentarios y textos de UI **en español**, con acentos correctos. Los
  comentarios explican el porqué, no el qué.
- No toques `utils.js`, `visita-detail-modal.jsx` ni `tests/`.

## 5. Verificación antes de cerrar (obligatoria, con evidencia en el commit)
1. `node build.js` sin errores.
2. `npm test` en verde.
3. `npx eslint nueva-visita.jsx escaner-orden.jsx` sin errores nuevos
   (`eslint-plugin-react-hooks` está activo: confirma que no se quejó del orden de hooks).
4. Recorre mentalmente y describe en el informe los cuatro escenarios:
   visita nueva sin guardar · visita INICIADA con campos faltantes ·
   visita con acta+informe+18 fotos · sin conexión con cosas en cola.

## 6. Cierre
Escribe `INFORME-centro-control-visita.md`, implementa el alcance 1-4 y haz
**un solo commit** con todo (`git add -A`; mensaje descriptivo en español).
No hagas push. Luego para.
