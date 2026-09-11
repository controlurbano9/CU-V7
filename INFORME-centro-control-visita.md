# INFORME — «Centro de control de la visita» (rediseño de `nueva-visita.jsx`)

**Sistema de Inspección N°9 · Control Urbano, Alcaldía de Bello.** 2026-09-11.

Implementación ya aplicada y sin comitear hasta este commit. Verificación de cierre
re-corrida antes del commit: `npm test` **21/21 en verde** (fail 0), `npx eslint
nueva-visita.jsx escaner-orden.jsx` **0 errores** (10 warnings preexistentes de
`react-hooks/exhaustive-deps`, todos sobre effects de montaje deliberados —ninguno
del orden de hooks, que es la regla crítica). `node build.js` compiló el
`bundle.min.js` que va en este mismo commit.

Convención de citas: `nueva-visita.jsx:NNNN` se refiere al **estado nuevo** (árbol de
trabajo de este commit); `HEAD~1:nueva-visita.jsx:NNNN` (o «antes, línea NNNN») se
refiere al estado previo, verificado con `git show HEAD:nueva-visita.jsx`.

---

## A. Diagnóstico crítico del diseño anterior

El formulario era (y en su tramo medio sigue siendo) una pila vertical de 10 secciones
donde la única respuesta a «¿cómo va esta visita?» era recorrerla completa. Citas del
estado previo (`HEAD~1 = 0895ef8`):

1. **La cabecera decía qué visita era, no cómo iba.** La caja superior solo pintaba
   dirección, radicado/oficio y N° de visita (`HEAD~1:nueva-visita.jsx:2713-2753`;
   definida por `tieneInfoSticky` en `HEAD~1:nueva-visita.jsx:2676`). Ni estado del
   ciclo de vida (`PENDIENTE`/`INICIADO`/…), ni faltantes, ni evidencia, ni
   documentos. El objetivo de «estado en <5 s» era inalcanzable por construcción.

2. **Tres botones a ancho completo compitiendo como si fueran la acción primaria.**
   «Generar acta F-GGO-46» relleno (`HEAD~1:nueva-visita.jsx:3439-3444`),
   «Generar informe F-GGO-43» outlined (`HEAD~1:nueva-visita.jsx:3451-3592`),
   «Generar registro fotográfico» outlined (`HEAD~1:nueva-visita.jsx:3606-3611`).
   Tres «primarias» visibles simultáneamente = ninguna primaria. Además cada una
   repetía el código de formato (F-GGO-43/46) como si fuera el nombre de la acción:
   es metadato de archivo, no lenguaje de inspector.

3. **El botón de la acción más frecuente era el peor nombrado.** «Actualizar visita»
   (`HEAD~1:nueva-visita.jsx:3929`) dice lo que el sistema hace, no lo que el usuario
   quiere: **guardar**. Y mutaba a «Actualizar (se sincronizará)» offline — dos
   conceptos (acción + estado) metidos en el label del botón.

4. **La barra fija informaba el estado solo por ausencia.** Offline se enteraba uno
   porque el texto del botón cambiaba (`HEAD~1:nueva-visita.jsx:3912`); «Cambios sin
   guardar» **no existía en ninguna parte**: el inspector podía llegar al final del
   scroll, tocar «Actualizar visita», y descubrir ahí que llevaba 20 minutos sin
   guardar. El indicador de autoguardado (`HEAD~1:nueva-visita.jsx:3921`) solo decía
   la última hora, no si había cambios pendientes ahora mismo.

5. **Doble lanzamiento sin guarda real.** El botón del informe era un `onClick` inline
   de ~140 líneas **sin `disabled`** (`HEAD~1:nueva-visita.jsx:3451`): un doble clic
   rápido abría el generador dos veces. Acta y RF usaban `disabled={generandoActa}` /
   `disabled={generandoRF}` (`HEAD~1:nueva-visita.jsx:3430,3439,3606`), que solo corta
   tras el re-render —y nada impedía correr acta e informe **a la vez**.

6. **«Abrir carpeta Drive de la visita» aparecía dos veces**: al final del formulario
   (`HEAD~1:nueva-visita.jsx:3881-3893`, link en 3891) y dentro de la sección de fotos
   (`HEAD~1:nueva-visita.jsx:4052`). Dos accesos distintos a lo mismo, con estilos
   distintos (ancla gris grande vs. link de texto).

7. **La transición «antes del primer guardado» era invisible.** Sin `filaEditando`,
   los botones de documentos simplemente no existían; nada explicaba que fotos,
   escáner y documentos nacen al guardar (la carpeta de Drive se crea en el primer
   guardado). El inspector nuevo veía el formulario «recortarse» sin saber por qué.

8. **El aviso de campos faltantes castigaba el scroll.** «Faltan N campos para generar
   el acta o el informe» listaba **todos** los campos desplegados de una vez
   (`HEAD~1:nueva-visita.jsx:3393-3416`), metido entre el textarea de observaciones y
   los botones: 15-20 renglones de lista que empujaban el resto hacia abajo.

9. **La evidencia estaba dispersa y sin conteo global.** Fotos al final
   (`HEAD~1:nueva-visita.jsx:3599-3604`), escáner de orden más abajo
   (`HEAD~1:nueva-visita.jsx:3620-3627`), PQR solo como botón suelto junto al radicado
   (`nueva-visita.jsx:3136` en el nuevo, similar antes), Drive en dos sitios. Al
   reabrir una visita, la pantalla no sabía cuántas fotos había en Drive —solo las
   subidas en la sesión actual— y no leía `LINK_DOCX_INFORME`, así que una visita con
   informe ya generado ofrecía «Generar informe» como si no existiera (corregido en
   `nueva-visita.jsx:416`).

10. **Altura de la zona final.** El tramo observaciones → acta → informe → fotos → RF
    → escáner → Drive → barra sumaba ~4 bloques de botón a ancho completo (48-52 px
    cada uno) + avisos + secciones con título propio. Estimado sobre el DOM anterior:
    **~700-800 px de scroll dedicado a acciones**, sin una sola línea de resumen.

---

## B. Problemas priorizados

| # | Problema | Sev. | Estado en este cambio |
|---|---|---|---|
| 1 | Doble generación de informe (onClick inline sin guarda) | **P0** | ✅ Resuelto: función `generarInforme()` con guarda compartida `_docOcupadoRef` (`nueva-visita.jsx:2739-2740`, `nueva-visita.jsx:1621-1624`) |
| 2 | Acta + informe + RF podían correr a la vez | **P0** | ✅ Resuelto: guarda compartida en los tres (`nueva-visita.jsx:2891-2892`, `nueva-visita.jsx:2996-2997`, `nueva-visita.jsx:2740`) + `docOcupado` deshabilita todos los botones de documento (`nueva-visita.jsx:3036`) |
| 3 | «Cambios sin guardar» no existía | **P0** | ✅ Resuelto: estado `dirty` reactivo (`nueva-visita.jsx:1663`, efecto 5 en `nueva-visita.jsx:1787-1794`) + barra permanente (`nueva-visita.jsx:4193-4207`) |
| 4 | Sin estado global de la visita en <5 s | **P0** | ✅ Resuelto: `PanelEstadoVisita` (`nueva-visita.jsx:1400-1457`, render en `nueva-visita.jsx:3082-3099`) |
| 5 | Tres «primarias» simultáneas; códigos F-GGO como nombre de acción | **P1** | ✅ Resuelto: renglones con acciones compactas; única acción rellena = «Guardar cambios» (`nueva-visita.jsx:3746-3751`) |
| 6 | «Actualizar visita» mal nombrado; estado metido en el label | **P1** | ✅ Resuelto: «Guardar cambios» / «Guardar visita» + estado en barra propia (`nueva-visita.jsx:4212-4214`, `nueva-visita.jsx:4193-4207`) |
| 7 | Carpeta Drive duplicada | **P1** | ✅ Resuelto: único acceso como renglón (`nueva-visita.jsx:3776-3788`); el duplicado final se eliminó y el de `SeccionFotos` se quitó con el cambio de firma (`nueva-visita.jsx:4225` ya no recibe `linkDrive`) |
| 8 | Conteo de fotos falso al reabrir (solo sesión actual) | **P1** | ✅ Resuelto: lectura inicial `listarFotosActa` (efecto 8, `nueva-visita.jsx:1834-1850`) + reporte de `SeccionFotos` (`nueva-visita.jsx:4331-4340`) |
| 9 | Informe ya generado no se conocía al reabrir | **P1** | ✅ Resuelto: `linkDocxInforme` en el estado inicial (`nueva-visita.jsx:416`) + escucha de `informe-f43-subido` (efecto 7, `nueva-visita.jsx:1818-1832`) |
| 10 | «⇡ En cola» invisible como estado de primera clase | **P1** | ✅ Resuelto: barra fija (`nueva-visita.jsx:4202`) + chips del panel y del renglón de fotos (`nueva-visita.jsx:3808-3812`) |
| 11 | Aviso de faltantes = lista interminable desplegada | **P2** | ✅ Resuelto: `<details>` plegado, el número vive en chips (`nueva-visita.jsx:3767-3774`) |
| 12 | Las 10 secciones del formulario siguen siendo una pila larga sin índice/colapso | **P1** | ⏳ **Abierto** — fuera del alcance acotado; propuesto en §C/§I |
| 13 | Escritorio no usa el ancho: columna única central en monitores | **P2** | ⏳ **Abierto** — propuesto en §I |
| 14 | `offlineOnItemSynced` no actualiza `ultimaModConocida` del formulario abierto (conflicto posible tras sincronizar cola) | **P2** | ⏳ **Abierto** — lógica de sincronización, no presentación; documentado en CLAUDE.md como pendiente vivo |
| 15 | Foco/teclado en el nuevo `<details>` y renglones: orden coherente pero sin skip-links de sección | **P2** | ⏳ **Abierto** — propuesto en §H |

---

## C. Nueva arquitectura de la pantalla

### Móvil (ciudadano de primera; nada rompe <390 px)

```
┌──────────────────────────────────────────┐
│ ← Volver            Continuar visita     │
├──────────────────────────────────────────┤
│ [INICIADO] RAD 2026-749  Visita N°2      │  ← PanelEstadoVisita
│ CR 52 64-134 · Niquía · C.4 · 09/08/26  │    (estado + identidad +
│ ●Faltan 3 campos  ●18 fotos  ●Acta ✓    │     5 chips de progreso)
│ ●Orden sin escanear  ●Informe pendiente  │
├──────────────────────────────────────────┤
│ 1. Identificación del caso               │
│ … (10 secciones del formulario)          │
│ …                                        │
│ 10. Observaciones y conclusiones         │
├──────────────────────────────────────────┤
│ ENTREGABLES DE LA VISITA                │
│ ▸ Faltan 3 campos… (plegado, <details>) │
│ 📁 Carpeta en Drive        [Creada] Abrir│
│ 📄 PQR radicada       [Disponible]  Ver │
│ 📷 Fotos de la visita   [18 subidas]     │
│    ┌ Toca para seleccionar fotos ┐       │  ← slot: subida pegada
│    └ [cola con ⇡ si hay]         ┘       │     a su renglón
│ 📄 Orden de policía 2026-09-015          │
│    [Sin escanear] + escáner (slot)       │
│ 📄 Acta de caracterización [Faltan 3] Gen│
│ 📄 Registro fotográfico   [Con fotos] Gen│
│ 📄 Informe de inspección [Pendiente] Gen │
├──────────────────────────────────────────┤
│ │ ● Cambios sin guardar                │ │  ← barra fija:
│ │ [        Guardar cambios           ] │ │     estado + única
└─┴──────────────────────────────────────┴─┘     acción rellena
```

### Escritorio (propuesta; lo implementado es la misma columna, ver §I)

```
┌─────────────────────────────────────────────────────────────┐
│ PanelEstadoVisita (sticky top)      [Guardado ✓ 10:32]      │
├───────────────────────────────┬─────────────────────────────┤
│ 1-5 Identificación/Licencia/  │ ENTREGABLES (sticky right   │
│    Actuación/POT/Obs.         │ en viewport, o columna 2):  │
│                               │ 📁 Carpeta …        Abrir   │
│ 6-10 Dirección/Suspensión/    │ 📄 PQR …               Ver  │
│    …/Observaciones            │ 📷 Fotos … [18]      (slot) │
│                               │ 📄 Orden …  (escáner slot)  │
│                               │ 📄 Acta …    [Generar] [Ver] │
│                               │ 📄 RF …      [Generar]      │
│                               │ 📄 Informe … [Generar] [Ver]│
└───────────────────────────────┴─────────────────────────────┘
```

Qué se agrupa: toda la evidencia y los documentos en **una** sección «Entregables de
la visita» (`nueva-visita.jsx:3752-3753`), ordenada por el flujo real de cierre:
carpeta → PQR → fotos → orden → acta → registro fotográfico → informe. Qué se
colapsa: la lista de campos faltantes (`<details>`, `nueva-visita.jsx:3768`). Qué
desaparece: el segundo «Ver carpeta Drive», la caja de info del header (absorbida
por el panel), y los botones a ancho completo.

---

## D. Nueva jerarquía de botones

| Nivel | Acción | Implementación |
|---|---|---|
| **Primaria** (una sola, rellena) | Guardar cambios / Guardar visita | Barra fija `nueva-visita.jsx:4208-4215` — única `btn-principal` visible de la pantalla |
| **Secundaria** (compactas, una por renglón) | Generar acta · Generar (RF) · Generar informe · Escanear orden | `btn-accion ent-btn`, deshabilitadas en bloque con `docOcupado` (`nueva-visita.jsx:3866,3874,3892`) |
| **Terciaria** (acceso a lo ya existente) | Abrir (carpeta) · Ver (PQR, orden, acta, informe) | Anclas `ent-btn` (`nueva-visita.jsx:3786,3799,3835,3863,3913`) |
| **Destructiva** | Regenerar acta (rehace el documento en Drive) | Icono aislado con `aria-label` explícito (`nueva-visita.jsx:3866-3872`) |
| **Automática** | Autoguardado 60 s, cola offline, sincronización | Nunca botón: se expresa como estado en la barra (`nueva-visita.jsx:4193-4207`) |

Regla que queda establecida: **los códigos F-GGO-43/46 bajan a `meta`** del renglón
(`nueva-visita.jsx:3854,3904`), nunca al label del botón.

---

## E. Texto exacto de cada botón

| Actual (antes) | Propuesto = implementado | Por qué |
|---|---|---|
| «Actualizar visita» / «Actualizar (se sincronizará)» | **«Guardar cambios»** / «Guardar (se envía con señal)» | Verbo del usuario, no del sistema; el estado de red se cuenta en la barra superior, no mutando el label (`nueva-visita.jsx:4212-4214`) |
| «Guardar visita» (nueva visita) | **«Guardar visita»** (sin cambio) | Correcto: es la primera vez, no hay nada que «actualizar» |
| «Generar acta F-GGO-46» | **«Generar acta»** (meta: «F-GGO-46 · hoja de cálculo + PDF») | El código es metadato; la acción es generar el acta (`nueva-visita.jsx:3853-3854,3876`) |
| «Ver acta F-GGO-46» | **«Ver»** (renglón «Acta de caracterización») | El renglón ya nombra la pieza; repetirla en el botón es ruido (`nueva-visita.jsx:3863`) |
| «Generar informe F-GGO-43» | **«Generar informe»** (renglón «Informe de inspección») | Igual que el acta (`nueva-visita.jsx:3903,3917`) |
| «Generar registro fotográfico» | **«Generar»** (renglón «Registro fotográfico») | El nombre vive en el renglón; el botón es la acción (`nueva-visita.jsx:3885,3894`) |
| «Regenerar» (icono) | **Icono ⟳** con `aria-label="Regenerar el acta F-GGO-46"` | Se mantiene: acción destructiva aislada y anunciada a lectores (`nueva-visita.jsx:3866-3867`) |
| «Ver orden 2026-09-015 en Drive» (dentro del escáner) | **«Ver»** en el renglón «Orden de policía 2026-09-015» | La pieza y su número ya nombran el documento; el aviso de escáner queda solo para «en cola» (`escaner-orden.jsx:244-253`) |
| «Ver carpeta Drive de la visita» ×2 | **«Abrir»** (único, renglón «Carpeta en Drive») | Un solo acceso, palabra de acción (`nueva-visita.jsx:3780,3786`) |
| «Guardando...» / «Generando acta...» | «Guardando…» / «Generando…» | Elipsis tipográfica única; el spinner ya dice que es una acción en curso (`nueva-visita.jsx:3876,4211`) |
| «Escanear orden de policía» (botón del escáner) | Sin cambio | Correcto: es la acción real y primera vez que aparece («Agregar otra página» tras escanear, `escaner-orden.jsx:266`) |

---

## F. Estados de cada componente

### Panel de estado (`PanelEstadoVisita`, `nueva-visita.jsx:1400-1457`)

| Chip | ○ Sin iniciar | ✓ Completo | ⚠ Pendiente | ⇡ En cola |
|---|---|---|---|---|
| Formulario | — | «Formulario completo» (verde) | «Faltan N campos» (ámbar) | — |
| Fotos | «Fotos tras guardar» (sin fila) / «Sin fotos» | «N fotos» (verde) | — | «⇡ N fotos en cola» (ámbar + halo, `styles.css:1041`) |
| Orden (si hay N° real) | «Orden sin escanear» | «Orden escaneada» | — | aviso del slot del escáner (`escaner-orden.jsx:253`) |
| Acta | «Acta pendiente» | «Acta generada» | — | — |
| Informe | «Informe pendiente» | «Informe generado» | — | — |

Badge del ciclo de vida: PENDIENTE=ámbar, ASIGNADO=azul, INICIADO=terracota,
COMPLETADO=verde (`_tonoEstadoVisita`, `nueva-visita.jsx:1389-1395`;
`styles.css:1026-1029`). Sin guardar: aviso explicando qué habilita el guardado
(`nueva-visita.jsx:1447-1450`).

### Renglón de entregable (`FilaEntregable`, `nueva-visita.jsx:1460-1480`)

| Pieza | ○ Sin iniciar | ⟳ Procesando | ✓ Completo | ⚠ Pendiente | ⇡ En cola | ✕ Error |
|---|---|---|---|---|---|---|
| Carpeta | «Pendiente» | — (el guardado lo anuncia la barra) | «Creada» | — | — | alerta de `guardar()` («Carpeta Drive no creada», `nueva-visita.jsx:2463-2467`) |
| PQR | no hay renglón (condicional) | — | «Disponible» | — | — | — |
| Fotos | «Sin fotos» | subida: progreso del slot | «N subidas» | — | «⇡ N en cola» | item atascado → `OfflineColaBadge` global |
| Orden | «Sin escanear» | escáner ocupa botón | «Escaneada» | — | aviso del slot | alerta del escáner |
| Acta | «Lista para generar» | «Generando…» + `aria-busy` | «Generada» | «Faltan N campos» | — | alerta de `_ejecutarGenerarActa` |
| RF | «Requiere fotos» | «Generando…» | «Con fotos» | — | cuenta fotos en cola | alerta de `confirmarYGenerarRF` |
| Informe | «Lista para generar» | «Abriendo…» | «Generado» | «Faltan N campos» | — | alerta de `generarInforme` |

### Barra de guardado (`nueva-visita.jsx:4193-4207`) — matriz de transiciones

Prioridad de despliegue (una sola línea visible): `guardando > error > dirty > en
cola > sin conexión > guardado HH:MM > sin cambios`.

```
Sin cambios ──(edita campo)──▶ ● Cambios sin guardar
     │                              │
     │                       [Guardar]/autog.60s
     │                              ▼
     ├──────(guardar falla)─── ✕ No se pudo guardar ──(reintenta)──▶ Guardando…
     │                              │
     ▼                              ▼ (ok online)
Guardando… ──(ok online)──▶ ✓ Guardado · HH:MM ──(edita)──▶ Cambios sin guardar
     │
     └─(ok offline)──▶ ⇡ Guardado en cola ──(cola drena)──▶ ✓ Guardado · HH:MM
                            │  (efecto 6 escucha offlineOnChange, nueva-visita.jsx:1798-1816)
Sin conexión (sin dirty) ──(guardar)──▶ ⇡ Guardado en cola
```

El estado «en cola» de ESTA visita se detecta filtrando la cola IDB por `fila` o
`clientId` (`nueva-visita.jsx:1803-1812`), no solo con el flag global de red.

---

## G. Propuesta visual de layout

Implementado con clases nuevas sobre variables existentes (`styles.css:1004-1096`),
sin paleta nueva:

- **Panel de estado**: superficie + borde suave, badge píldora del ciclo de vida,
  identidad en monoespaciada (`--font-mono`), chips de progreso con punto de color
  (verde/ámbar) en una sola línea que envuelve (`styles.css:1012-1045`).
- **Renglones de entregable**: lista tipo tabla-light — icono 18 px, nombre 13 px/600,
  meta 11 px en `--ink-4`, estado en píldora a la derecha, acciones compactas
  (12 px/8-12 px de padding, `styles.css:1056-1080`). Separadores de 1 px; `min-height:
  var(--tap)` para objetivo táctil (`styles.css:1059`).
- **Barra de guardado**: texto de 11 px centrado sobre el botón, coloreado por estado
  (ámbar pendiente/cola, rojo error) con `aria-live="polite"`
  (`styles.css:1088-1096`, `nueva-visita.jsx:4196`).
- Reducción de altura estimada en la zona final: la pila anterior de ~700-800 px
  (3 botones de 48-52 px a ancho completo + caja Drive + avisos + títulos de sección)
  queda en **6 renglones de ~44 px + barra** ≈ 320-380 px, con más información
  visible (estados y conteos que antes no existían).

---

## H. Reglas UX que deben volverse estándar de toda la app

1. **Una sola acción primaria rellena por pantalla**; las demás acciones son
   compactas y viven junto a su objeto.
2. **El estado de un documento/evidencia es un renglón, no un botón**: nombre + meta
   + píldora de estado + acciones.
3. **«⇡ En cola» es un estado de primera clase** junto a completo/pendiente/error
   (aplicarlo también en Mis visitas y Home, no solo aquí).
4. **El estado de guardado es permanente y visible**, nunca deducible del label de un
   botón.
5. **Los códigos de formato (F-GGO-43/46) van en metadatos**, no en labels.
6. **Acciones destructivas** (regenerar, reemplazar) aisladas y con `aria-label`
   propio; jamás al lado de un botón de solo lectura con el mismo peso.
7. **Toda acción asíncrona**: `disabled` durante el vuelo + `aria-busy` + spinner, y
   guarda de doble clic por `ref` cuando el re-render no alcanza (patrón
   `_docOcupadoRef`, `nueva-visita.jsx:1621-1624`).
8. **Las transiciones de ciclo de vida se cuentan, no se ocultan** (aviso «Guarda la
   visita para…», `nueva-visita.jsx:3759-3762`).
9. Mensajes de alerta citan el botón real («toca "Guardar cambios"»,
   `nueva-visita.jsx:2466,2508`) — sin esta regla, el texto actualizado habría quedado
   mentando un botón que ya no existe.

Pendiente de extender a toda la app: skip-links entre secciones y foco gestionado al
abrir/cerrar los `<details>` y slots (hoy el orden de tabulación es correcto pero no
hay atajos).

---

## I. Recomendaciones para escritorio

1. **Columna derecha sticky para Entregables** (esquema §C): el formulario ocupa
   7/12 y los entregables 5/12 fijos en viewport al llegar a ~1100 px. Hoy todo es
   columna única centrada; el panel de estado y los renglones ya son componentes
   reposicionables sin cambio de lógica.
2. **Panel de estado sticky** bajo el header al hacer scroll (hoy solo es visible al
   inicio).
3. **Densidad**: en escritorio, los renglones pueden bajar a 36-40 px de alto y el
   botón de guardado puede ir al header en lugar de barra fija inferior (la barra fija
   es una solución móvil).
4. Atajos de teclado: Ctrl+S → guardar; focus ring visible en renglones
   (`:focus-visible` sobre `.ent-fila`).

Todo esto queda **propuesto, no implementado**: el alcance del TASK era móvil-primero
y presentación sin re-arquitectura del router/layout.

---

## J. Recomendaciones QA

Verificado sin sesión en real (build verde, tests 21/21, eslint 0 errores, revisión de
código línea a línea). **QA humano pendiente**, en orden de riesgo:

1. **Visita nueva sin guardar → Guardar offline → recuperar señal**: la barra debe
   pasar «⇡ Guardado en cola» → «✓ Guardado · HH:MM» sin recargar (efecto 6,
   `nueva-visita.jsx:1798-1816`). Ojo: `offlineOnChange` existe — verificar que el
   flush por BG Sync con la pestaña cerrada también dispara el refresh al reabrir.
2. **Doble clic rápido en «Generar informe» y en «Generar acta»** a la vez: solo debe
   correr uno (guarda `_docOcupadoRef`, `nueva-visita.jsx:2740,2891,2996`).
3. **Reabrir visita con 18 fotos**: el chip debe decir «18 fotos» (efecto 8 +
   `listarFotosActa`), y tras subir una más, «19» (reporte de `SeccionFotos`,
   `nueva-visita.jsx:4331-4340`). El `Math.max` de los dos conteos evita que el más
   lento pise al más fresco (`nueva-visita.jsx:3039-3044`).
4. **Informe ya generado**: renglón «Generado» con «Ver»; al subir uno nuevo desde el
   iframe/pestaña, el renglón debe actualizarse solo por `postMessage`
   (efecto 7, `nueva-visita.jsx:1818-1832`) — probar en móvil (pestaña nueva: el
   mensaje llega al volver a la pestaña original, no antes).
5. **390 px**: los chips del panel envuelven sin overflow; objetivo táctil de
   renglones ≥44 px (`min-height: var(--tap)`).
6. **Contraste AA** de píldoras `et-*` sobre `--surface` (los pares bg/ink ya se usan
   en el resto de la app).

**No cubierto por este cambio** (heredado/abierto): conflicto de `ultimaModConocida`
tras sincronizar cola con el formulario abierto (pendiente vivo documentado); QA del
escáner con papel real (pendiente del deploy 2026-09-09); índice/colapso de las 10
secciones.

---

## K. Qué se implementó y qué quedó propuesto

### Archivo por archivo

| Archivo | Cambio |
|---|---|
| `nueva-visita.jsx` | Lectura de `linkDocxInforme` (416); componentes `PanelEstadoVisita` (1400) y `FilaEntregable` (1460); estados `abriendoInforme` (1504), `dirty/errorGuardar/enColaGuardado/fotosInfo` (1663-1666); guarda compartida `_docOcupadoRef` (1624); efectos 5-8 (1787-1850); `generarInforme()` extraído del onClick inline (2739-2886); guardas en acta y RF (2891, 2996); zona «Entregables de la visita» completa (3746-3920); barra de guardado con estado (4179-4217); `SeccionFotos` sin tarjeta propia ni link Drive, reporta conteo (4225, 4331-4340) |
| `styles.css` | Bloque «Centro de control» (1004-1096): panel, badges, chips, renglones, píldoras de estado, barra de guardado — solo variables existentes |
| `icons.jsx` | Icono `Camera` para el renglón de fotos (125-128) |
| `escaner-orden.jsx` | Se integra como slot del renglón de orden: sin tarjeta ni título propios, conserva el aviso «en cola» (244-253) |
| `index.html` | `bundle.min.js?v=118` (76) |
| `sw.js` | `CACHE_NAME v119` (9) |
| `bundle.min.js` | Regenerado con `node build.js` |

**Quedó propuesto (no implementado)**: columna derecha sticky de escritorio, panel
sticky al scroll, índice/colapso de las 10 secciones, «⇡ en cola» en tarjetas de Mis
visitas/Home, skip-links. Razón: alcance acotado del TASK (§3.B) — presentación del
tramo final + cabecera, sin tocar router ni layout global.

### Los cuatro escenarios

1. **Visita nueva sin guardar.** El panel muestra «PENDIENTE»/«Sin radicado», chips
   «Fotos tras guardar» y «Visita sin guardar: al guardar se crea la carpeta…»
   (`nueva-visita.jsx:1447-1450`); la zona de entregables muestra el aviso único
   (`nueva-visita.jsx:3759-3762`). El único botón relleno es «Guardar visita». Al
   guardar, `setDirty(false)` y el flujo ya conocido de carpeta Drive.
2. **Visita INICIADA con campos faltantes.** Panel: badge INICIADO (terracota) + chip
   ámbar «Faltan N campos»; en entregables, `<details>` plegado con la lista
   (3767-3774) y los renglones de acta/informe en «Faltan N campos». Si intenta
   generar, la alerta lista los campos (validación compartida `generarInforme`
   2748-2760 / `_validarAntesDeActa`). La barra fija muestra «● Cambios sin guardar»
   apenas toca un campo (efecto 5), y «✓ Guardado · HH:MM» tras guardar o autoguardar
   (1766, 2496).
3. **Visita con acta+informe+18 fotos.** Reabrir: efecto 8 cuenta las 18 de Drive,
   panel «18 fotos» verde, renglones «Acta — Generada [Ver] [⟳]», «Registro
   fotográfico — Con fotos [Generar]», «Informe — Generado [Ver] [Generar informe]»
   (regenerar sigue disponible si no está COMPLETADO). Doble clic en cualquiera:
   bloqueado por `_docOcupadoRef`.
4. **Sin conexión con cosas en cola.** Guardar offline → alerta «Guardado local» +
   barra «⇡ Guardado en cola» (4202); fotos seleccionadas → slot con conteo en cola y
   chip «⇡ N fotos en cola» (3809-3810); orden escaneada sin señal → aviso del slot
   («Orden en cola — se sube sola al recuperar conexión», `escaner-orden.jsx:253`).
   Al recuperar red, la cola drena y `offlineOnChange` re-evalúa el estado
   (1814-1816). Errores persistentes de AS siguen viéndose en el
   `OfflineColaBadge` global (fuera de alcance de este cambio).
