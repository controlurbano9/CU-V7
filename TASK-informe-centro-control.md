# TASK — Informe de producto del rediseño «Centro de control de la visita»

La **implementación ya está hecha** y está sin comitear en el árbol de trabajo
(`nueva-visita.jsx`, `styles.css`, `icons.jsx`, `escaner-orden.jsx`, `index.html`,
`sw.js`, `bundle.min.js`). Ya se verificó: `node build.js` compila, `npm test`
pasa 21/21, `npx eslint` da 0 errores. **No cambies el código**, salvo que
encuentres un error real al analizarlo (si lo encuentras, arréglalo y dilo).

El encargo original está en `TASK-centro-control-visita.md` — léelo: ahí está el
contexto del producto, las restricciones y el detalle de lo que se pedía.

## Lo que falta

1. Lee `git diff` (y `git diff --stat`) para ver exactamente qué cambió.
2. Escribe **`INFORME-centro-control-visita.md`** con el entregable A del TASK
   original, secciones A–K en ese orden:
   - **A. Diagnóstico crítico** del diseño anterior, con `archivo:línea` (usa
     `git show HEAD:nueva-visita.jsx` para citar el estado previo).
   - **B. Problemas priorizados** P0 / P1 / P2, marcando cuáles quedaron
     resueltos en este cambio y cuáles siguen abiertos.
   - **C. Nueva arquitectura de la pantalla** con esquema ASCII (escritorio y móvil).
   - **D. Nueva jerarquía de botones** (primaria / secundaria / terciaria /
     destructiva / automática).
   - **E. Texto exacto de cada botón**: tabla actual → propuesto → por qué.
   - **F. Estados de cada componente**, con la matriz de transiciones e
     incluyendo «⇡ En cola (sin conexión)».
   - **G. Propuesta visual de layout.**
   - **H. Reglas UX que deben volverse estándar de toda la app.**
   - **I. Recomendaciones para escritorio.**
   - **J. Recomendaciones QA**, con lo que quedó sin cubrir.
   - **K. Qué se implementó y qué quedó propuesto**, archivo por archivo, más el
     recorrido de los cuatro escenarios: visita nueva sin guardar · visita
     INICIADA con campos faltantes · visita con acta+informe+18 fotos · sin
     conexión con cosas en cola.

Regla dura: **cada afirmación sobre el código va con `archivo:línea` verificado
por lectura o grep**. Nada de números de línea inventados ni paráfrasis.
Español con acentos correctos.

## Cierre

`git add -A` (incluye los dos TASK) y **un solo commit** con mensaje descriptivo
en español. No hagas push. Luego para.
