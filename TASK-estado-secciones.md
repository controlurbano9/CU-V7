# TASK — Estado por sección en vez de lista de campos faltantes

Decisión del director de producto: **la lista de campos faltantes del tablero
de entregables se elimina** y en su lugar cada sección del formulario dice por
sí misma si está completa. El inspector recorre el formulario de arriba abajo;
la señal debe estar donde diligencia, no en una lista aparte que obliga a
traducir «campo → dónde estaba eso».

Este cambio **borra más código del que añade**. Si al terminar has añadido más
líneas de las que quitaste, te fuiste por otro lado.

## Lo que se quita

En `nueva-visita.jsx`, dentro de la zona de entregables:

- El plegable **«Ver qué campos faltan»** entero (el `<details>`/bloque con la
  lista, el estado que lo abre, y los renglones-botón).
- El helper **`_irASeccion`** y todo lo que lo alimenta.

En `styles.css`: `.ent-faltan`, `.ent-falta-link`, `.ent-falta-sec`,
`.seccion-destacada`, `@keyframes seccionDestaca` y su variante de
`prefers-reduced-motion`. Revisa si `scroll-margin-top` en `.form-seccion`
queda sin usuarios; si nadie más salta a una sección, quítalo también (y su
comentario). **No** toques `--nv-header-h` ni `--header-h`: los usan la
cabecera fija y el tablero.

**No se toca el panel superior (`PanelEstadoVisita`).** Ya se decidió que no
muestra campos faltantes, y sigue sin mostrarlos. No le añadas resumen,
conteo ni chip nuevo.

**No se tocan los tres avisos al generar acta / regenerar acta / informe.**
Siguen validando con `_validarAntesDeActa()` y listando los nombres de los
campos que faltan. Esa alerta bloqueante es ahora la única lista completa que
existe: es deliberado, y es la red de seguridad del cambio.

## Lo que se pone

Un indicador **binario** a la derecha del título de cada sección
(`_Seccion`, `nueva-visita.jsx:579`):

- **Sección completa** → check `✓` verde, discreto.
- **Sección con algo pendiente** → punto ámbar (mismo lenguaje que
  `.ent-dot`, reutiliza las variables de color existentes: no inventes tonos).
- **Sección sin campos obligatorios** → **nada**. Es el caso de «Observaciones
  y conclusiones», que es opcional a propósito: un check verde ahí sería
  mentira y un ámbar, peor.

**Sin número.** Nada de «Faltan 3»: la señal es que falta algo, no cuánto.

**Cuándo aparece el ámbar:** solo **después del primer intento de generar acta
o informe que encuentre campos faltantes**. Mientras el inspector diligencia,
solo se ven los checks verdes de lo que ya completó. Si el ámbar saliera desde
el primer segundo, las 10 secciones estarían marcadas al abrir una visita
nueva, la señal se volvería decorado y se aprendería a ignorarla. Los checks
verdes, en cambio, se ven siempre: son refuerzo de avance, no alarma.

Basta un estado booleano del formulario (p. ej. `mostrarPendientes`), que pasa
a `true` en los tres puntos donde hoy se muestra el aviso de «faltan N
campos». No se persiste en el borrador: es estado de sesión de pantalla.

**Accesibilidad:** el color no puede ser la única señal. Cada indicador lleva
nombre accesible («Sección completa» / «Faltan campos en esta sección») y
`title`. El indicador es informativo, **no** un control: no lo hagas botón ni
foco tabulable — no lleva a ninguna parte.

## Cómo saber el estado de cada sección

`_validarAntesDeActa()` ya devuelve `[{ nombre, seccion }]` y el texto de
`seccion` es **exactamente** el `titulo` de cada `<_Seccion>` (verificado: los
10 títulos de `nueva-visita.jsx:3230-3860` coinciden con los `sec = '...'` del
validador). Pero con eso solo sabes dónde **falta** algo; no distingues
«completa» de «sin obligatorios».

Refactoriza en **un solo recorrido**, sin duplicar las reglas en dos sitios:

- Una función que recorra las validaciones y devuelva las dos cosas: la lista
  de faltantes y el conjunto de secciones que **declararon** al menos un campo
  obligatorio aplicable al estado actual (el `req()` interno registra la
  sección tanto si el campo está como si no).
- `_validarAntesDeActa()` pasa a ser un envoltorio que devuelve solo la lista,
  para que los tres avisos sigan funcionando **sin cambios**.

Ojo con las reglas condicionales, que son la razón de que esto no se pueda
precalcular en una tabla: si `noAtiende` está marcado, «Persona que atiende»
no declara obligatorios y debe quedar **sin indicador**, no en verde. Igual
con la licencia (`licenciaAportada === 'SI'`), la suspensión (`estadoObra !==
'Terminada'`) y la citación (`noCitacion`).

No metas `useMemo`: son ~40 comparaciones por render, no es un problema de
rendimiento y el memo solo añade una lista de dependencias que se desincroniza.

## Invariantes

- Presentación y estado de pantalla: **no toques** `_construirPayload`,
  columnas de BD, `api.js` ni el backend. Lo que se valida no cambia — cambia
  dónde se muestra.
- Hooks antes de cualquier `return` condicional (React #310); aliasing del
  archivo (`useStateNV`, `useEffectNV`).
- Sin dependencias nuevas. No edites `bundle.min.js` a mano.
- Estilos como clases en `styles.css`, con las variables existentes.
- Textos de UI y comentarios en español con acentos correctos.
- No toques `utils.js` ni `tests/`.

## Verificación antes de cerrar

1. `node build.js` sin errores.
2. `npm test` en verde (21/21).
3. `npx eslint nueva-visita.jsx` sin errores nuevos (11 warnings de
   `exhaustive-deps` preexistentes).
4. En el banco (`http://127.0.0.1:8099/qa-centro-control.html`, escenarios
   `?e=faltantes` y `?e=completa`, viewports 390 y 1440) **mide y reporta**:
   - Cuántas secciones salen con check, con punto y sin indicador, antes y
     después de pulsar «Generar» con campos faltantes.
   - Que «Observaciones y conclusiones» **nunca** lleva indicador.
   - Contraste del check y del punto contra el fondo de la sección (≥3:1 para
     elemento gráfico, WCAG 1.4.11) — con la cifra.
   - Que el título de la sección no se descoloca ni envuelve por el indicador
     en 390 px.
   - Que no queda CSS huérfano de lo eliminado (`grep` de las clases).
5. Balance de líneas: di cuántas quitaste y cuántas pusiste.
6. Bumpa `?v=` de `bundle.min.js` y `styles.css` en `index.html`, y
   `CACHE_NAME` en `sw.js`.

## Cierre

Un commit (`git add` solo de los archivos tocados; **no** `git add -A`).
**No hagas push.** Escribe `INFORME-estado-secciones.md` con las mediciones del
punto 4 y para.
