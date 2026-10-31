# DESIGN.md — Sistema visual «Valla de obra»

Rama `rediseno` (worktree `cu-v5-dev-rediseno`; nació en `rediseno-katana`). Documentado el 2026-10-28 a partir del
artefacto construido: `styles.css` (bloques «VALLA DE OBRA 01–08»), `index.html`,
los INFORME de las TASK 01–08 y la revisión final medida (`INFORME-valla-revision-final.md`).
El contrato de dirección vive en `.impeccable/surfaces/index-html.md`; la estructura conservada
es la de la revisión de arquitectura 2026-10-27 (`docs/REVISION_ARQUITECTURA_2026-10-27.md`,
rama `rediseno`; no está en este worktree, se cita por lo que las TASK y el contrato citan de ella).

---

## 1. La tesis

La app se lee como la **valla informativa** que el inspector verifica en cada obra. Rechaza el
tablero de oficina encogido en el teléfono: **un foco por pantalla**, datos rotulados,
**legible al sol**. Campo primero (`PRODUCT.md`, principio 1): lo que el inspector necesita en
la calle manda sobre lo que el admin quiere ver; la oficina tiene pantalla grande para adaptarse.

El mundo (contrato, OWN-WORLD): placa blanca sobre fondo `#F6F5F2`, tinta casi negra,
**amarillo de obra solo donde se señala lo activo**, estados en azul/verde/rojo con su palabra,
Barlow + Barlow Semi Condensed, cinco tamaños de letra, filetes de 1 px, radio 8–10.

## 2. Tokens

Declarados en `:root` (`styles.css:21-167`). Todo valor nuevo sale de aquí; nada fuera de escala.

### 2.1 Color

| Token | Valor | Uso | Fuente |
|---|---|---|---|
| `--ink` | `#15140F` | tinta principal; la acción principal llena es tinta (`--brand` es alias de tinta) | `styles.css:23`, `:35` |
| `--ink-2` | `#2B2923` | tinta secundaria | `styles.css:24` |
| `--ink-3` | `#4A4740` | texto secundario, rótulos, iconos neutros | `styles.css:25` |
| `--ink-4` | `#6B675E` | texto terciario / placeholders (≥5:1 sobre papel) | `styles.css:26` |
| `--line` | `rgba(21,20,15,.10)` | borde sutil | `styles.css:27` |
| `--line-2` | `rgba(21,20,15,.18)` | borde nítido (los filetes de 1 px de placa van en este) | `styles.css:28` |
| `--paper` | `#F6F5F2` | fondo de la app | `styles.css:29` |
| `--surface` | `#FFFFFF` | placa (tarjetas, paneles, menús) | `styles.css:30` |
| `--surface-2` | `#ECEAE4` | neutro destacado / selección neutra | `styles.css:31` |
| `--surface-3` | `#E0DED7` | neutro más marcado | `styles.css:32` |
| `--carril` | `#EFEEEA` | fondo de carril (columna de día, lista); opaco a propósito | `styles.css:69` |
| `--brand-ink` | `#2E2C25` | hover de la acción llena de tinta | `styles.css:36` |
| `--brand-bg` | `var(--surface-2)` | tinte de acción secundaria (botón en tinte): **neutro**, ya no amarillo | `styles.css:39` |
| `--valla-bg` | `#FFF4C2` | firma pálida: día de hoy, selección y foco — **nunca un botón** (sección 3) | `styles.css:54` |
| `--info` / `--info-bg` | `#1F5FBF` / `#E4ECF8` | iniciada / informativo | `styles.css:40-41` |
| `--green` / `--green-bg` / `--green-ink` | `#1E7A46` / `#E2F0E7` / `#17603A` | completada / éxito | `styles.css:42-44` |
| `--amber` / `--amber-bg` | `#A35200` / `#FBEBD9` | asignada / atención (naranja tostado, **distinto** del amarillo de la valla) | `styles.css:45-46` |
| `--red` / `--red-bg` | `#C8261E` / `#F8E3E1` | error / urgente | `styles.css:47-48` |
| `--valla` | `#F2C200` | la firma: placa de la siguiente visita, lo activo, la selección (sección 3) | `styles.css:50` |
| `--valla-ink` | `#15140F` | texto sobre `--valla` (10,97:1) | `styles.css:51` |

### 2.2 Tipografía

| Token | Familia | Para qué | Fuente |
|---|---|---|---|
| `--font-sans` | `'Barlow'` (400–700) | todo el texto: cuerpo, formularios, listas, botones | `styles.css:76`; carga en `index.html:33` |
| `--font-cond` | `'Barlow Semi Condensed'` (600–800) | direcciones, títulos de pantalla, rótulos de grupo, cifras grandes, horas, radicados | `styles.css:77` |

No hay tercera letra ni serif: `--font-serif` y `--font-mono` son alias de las anteriores
(`styles.css:78-83`). El cuerpo activa `font-variant-numeric: tabular-nums` para toda la app
(`styles.css:183`).

### 2.3 Escala de letra

Solo seis valores; nada por debajo de 13 px (`styles.css:86`; regla en `TASK-valla-00-LEEME.md:38`).
La revisión final no encontró tamaños fuera de escala en la app (`INFORME-valla-revision-final.md:87-93`).

| Token | Tamaño | Uso típico |
|---|---|---|
| `--fs-1` | 13 px | etiquetas de campo, metadatos, estado de la tarjeta |
| `--fs-2` | 15 px | texto de lista, chips, dirección en renglón |
| `--fs-3` | 17 px | cuerpo (base del `body`), títulos de sección/panel, radicado en cabecera |
| `--fs-4` | 22 px | dirección de ficha (condensada 800), cifras |
| `--fs-5` | 30 px | dirección de la placa (condensada 800) |
| `--fs-display` | 40 px | display |

### 2.4 Radios, filetes, espaciado

| Grupo | Tokens | Valor |
|---|---|---|
| Radios del sistema | `--r-ctl` 6 · `--r-card` 8 · `--r-panel` 12 | control · tarjeta · panel (`styles.css:62-66`) |
| Radios heredados | `--r-sm` 6 · `--r` 10 · `--r-lg` 16 · `--r-full` 999 | quedan mientras migran (`styles.css:58-61`) |
| Filetes | 1 px en `--line` / `--line-2` | placa, menús, chips; excepción: la placa lleva borde de tinta 2 px en la pieza base y sin filete en la Valla |
| Espaciado | `--s-1…9` | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 (base 4, `styles.css:54-55`) |
| Elevación | `--shadow-sm`, `--shadow-md` | dos sombras; las placas del sistema van **sin sombra**, con filete (`styles.css:4997`, `:5128`) |

## 3. La regla del amarillo

**`--valla` `rgb(242,194,0)` solo está permitido en:**

1. La **placa de la siguiente visita** (`.mv-sig`, `styles.css:4819`).
2. El **ítem o pestaña activa** (raya superior de la pestaña, `styles.css:4779`; borde izquierdo
   del ítem lateral, `styles.css:4788`; subrayado de
   pestaña de Administración, `styles.css:5126`; «hoy» de Audiencias, `styles.css:5095`).
3. La **selección** (`.tv.sel` filete interior 2 px, `styles.css:4578`; radio de opción elegida
   en «Pedir cita», `styles.css:5114`; `::selection` global, `styles.css:194`).
4. El **botón del Login** (`.btn-login`, `styles.css:5160` — es la única acción de esa pantalla).
5. El **círculo de iniciales del perfil** (`.cab-perfil`, `styles.css:4766`) — decisión de
   `TASK-valla-01-marco-y-tarjeta.md:16`.

**El amarillo pálido `--valla-bg` (`#FFF4C2`)** es la misma firma rebajada y tiene tres usos:
la cabecera del día de hoy en la Semana, lo seleccionado (día de la tira, chip de inspector,
sugerencia de Buscar) y el contorno de foco. **Nunca en un botón**: hasta el 2026-10-28 era el
fondo de «Ver PQR», «Ruta», «Revisar informe»… y gastaba la firma en acciones secundarias
(decisión del usuario; los botones en tinte pasaron a `--brand-bg` = `--surface-2`).

**Nunca como color de estado.** Para eso están `--info`, `--green`, `--amber`, `--red`
(comentario en `styles.css:49`). El tinte translúcido `--brand-glow` `rgba(242,194,0,.45)`
(`styles.css:38`) es la misma firma en los anillos de foco — la letra de la regla habla de
`--valla` pleno; el glow no señala estado, acompaña el foco. `--amber` es naranja tostado (`#A35200`) precisamente para no
chocar con el amarillo. En el formulario no hay nada activo que señalar: cero `--valla`
(`styles.css:4957-4958`). La revisión final **verificó la regla midiendo el DOM**: ningún
amarillo fuera de los cinco usos permitidos (`INFORME-valla-revision-final.md:94-97`).

## 4. La tarjeta única de visita (`.tv-*`)

Una sola tarjeta para Semana, Alertas, Mis visitas y Buscar (`visita-card.jsx`;
`styles.css:4562-4628`). El estado se comunica **duplicado**: un **anillo** (`EstadoAnillo`, `visita-card.jsx`)
**más la palabra** — el color solo no basta (accesibilidad, `PRODUCT.md`). Placa blanca con filete
de 1 px en `--line-2` y radio `--r-card`.

| Estado | Forma del anillo | Color | Clase |
|---|---|---|---|
| Pendiente | aro vacío | `--ink-4` | `.anillo-pendiente` |
| Asignada | aro con un cuarto lleno | `--amber` | `.anillo-asignado` |
| Iniciada | aro con la mitad llena | `--info` | `.anillo-iniciado` |
| Completada | círculo lleno con ✓ | `--green` | `.anillo-completado` |
| Cerrada | aro con una raya | `--ink-4` | `.anillo-cerrado` |

La dirección va en **condensada 700** (`.tv-dir`, `styles.css:4799`; `--fs-3` en tarjeta,
`--fs-2` en renglón). En celular la acción baja a su propio renglón a 44 px (`styles.css:4607-4610`);
desde 900 vuelve al lado (`styles.css:4739-4745`). La selección es un filete interior de 2 px
amarillo (`.tv.sel`, `styles.css:4578`).

## 5. El anillo de estado y la tarjeta completada

El **anillo se llena con el recorrido del caso** (decisión del usuario, 2026-10-30; reemplaza la barra lateral de 3 px, que no se distinguía sin color): tarjeta `.tv`, visitas del caso en la ficha y estado del formulario. Va siempre con la palabra del estado. La raya lateral de 3 px en amarillo queda solo para lo activo: el menú lateral, la candidata elegida en Norma y «hoy» en Audiencias. No se usa para decorar avisos ni cajas: esos dicen lo suyo con el fondo o el texto.

Lo completado **se atenúa, no desaparece** (decisión del usuario, 2026-10-30, en vez del sello con
filete verde que traía la TASK 01): anillo verde + la palabra «Completada» como en los demás estados
y toda la tarjeta al 62 % (`.tv-e-completado`). Elegida, enfocada o bajo el puntero vuelve a color
pleno. La atenuación baja el contraste a propósito: lo que importa de esa tarjeta ya está hecho.

## 6. La placa de la siguiente visita (`.mv-sig*`)

Vive en **Mis visitas**, no en Inicio (Inicio es de admin y supervisor; decisión del contrato,
`index-html.md:13`). Es el único elemento con fondo amarillo pleno.

- Fondo `--valla`, texto `--valla-ink` (10,97:1), radio de panel `--r-panel`, padding 16,
  sin borde (`styles.css:4819-4823`).
- Dirección grande en **condensada 800 a 30 px** (`--fs-5`), envuelve a dos renglones, no se corta
  (`.mv-sig-dir`, `styles.css:4825`).
- Radicado · barrio · comuna en Barlow 600 a 17 (`styles.css:4827`).
- Acciones a **52 px**: «Iniciar» lleno de tinta con texto blanco (18,44:1) y «Cómo llegar» al
  12 % de tinta (8,69:1 sobre el fondo compuesto) (`styles.css:4831-4839`). En celular suben a
  44 px mínimo con el bloque 08.
- La cita urgente va en **tinta a 700, no en rojo**: `--red` sobre `--valla` mide 3,33:1 y no pasa AA
  (`styles.css:4814-4816`; cálculo en `INFORME-valla-02-mis-visitas.md:53-57`).
- Selección en escritorio: filete exterior de 3 px de **tinta** — el amarillo sería invisible
  sobre la placa (`styles.css:4846`).

## 7. Los toques de campo

**Mínimo 44 px en celular** (media `max-width: 899px`, bloque «VALLA DE OBRA 08»,
`styles.css:5177-5183`). La regla es del **pulgar, no del mouse**: en escritorio los controles
quedan como estaban (`styles.css:5172-5176`). Los controles densos en fila (chips de filtro)
usan `--tap-min: 36px` (`styles.css:115`). Producto lo pide en `PRODUCT.md:68` («áreas de toque
de 44 px en tareas de campo») y el LEEME en `TASK-valla-00-LEEME.md:39`.

La revisión final lo **verificó midiendo el DOM a 390 px**: encontró «Iniciar» a 28 px en las
listas, «Cómo llegar» a 28, la dirección de la placa a 33, el menú de perfil a 40 y los campos
a ~42, y los corrigió todos; re-medición final: 0 toques bajos en los tres roles
(`INFORME-valla-revision-final.md:39-55`). Algunos suben más cuando son la acción de la placa:
52 px (sección 6).

## 8. Cabecera y navegación

| Elemento | Regla | Fuente |
|---|---|---|
| Cabecera móvil (<900) | barra **negra** `--ink` de 56 px, título «Control Urbano» en `--surface` condensada 700, ↻ en `--surface`, logo sobre placa blanca de 32 px | `styles.css:4755-4762`; contrato FIRST VIEWPORT |
| Error de ↻ sobre negro | `--red` no llega a 4,5:1 sobre la barra: va en `--red-bg` | `styles.css:4763-4765` |
| Pestañas abajo | 72 px de alto; la activa: texto `--ink` 600 + **raya superior amarilla de 3 px** (18 %–82 % del ancho); inactivas `--ink-3`; sin fondo de color | `styles.css:4774-4782` |
| Barra lateral (≥900) | ítem activo: fondo placa blanca + **borde izquierdo amarillo de 3 px**; «+ Nueva visita» lleno de tinta | `styles.css:4785-4791` |
| «+» (fab) | negro de 56 px; sus menús en placa blanca con filete de 1 px | `styles.css:4794-4795` |
| Menú de perfil | iniciales en círculo `--valla` (sección 3); menú placa blanca, opciones a 48 px | `styles.css:4766`, `:4657-4661` |
| Login | fondo de tinta plana, formulario en placa con radio de panel, botón lleno de `--valla` | `styles.css:5144-5162` |

El mismo gesto de la raya de 3 px marca «hoy» en Audiencias (`styles.css:5095`). En la Semana de
Inicio, «hoy» lleva el borde de tinta de 2 px de la placa de la siguiente visita (decisión del
usuario, 2026-10-30): la raya se curvaba con el radio de la columna.

## 8b. Decisiones del 2026-10-28 (revisión con skills, resuelta por Claude)

Decisiones del usuario sobre lo que encontró la revisión (`INFORME-revision-skills.md`), todas
medidas en los bancos a 375/390, 1366/1440 y 1920:

| Regla | Qué quiere decir | Dónde |
|---|---|---|
| **Un botón lleno por pantalla** | La acción de cada tarjeta (`.tv-btn`) va en tinte; llena solo en la placa de la siguiente visita. En el formulario el único lleno es «Guardar»: «Generar»/«Abrir» de los entregables van en tinte | `.tv-btn`, `.nv-entregables .ent-btn` |
| **Rojo solo para lo urgente** | Audiencia en ≤3 días, demora de ≥5 días hábiles y errores. «Falta: …», «vencida», contadores de pestaña van en tinta | `.tv-falta`, `.nv-falta`, `.adm-tab-n` |
| **Un solo reloj** | Desde la asignación: «N días sin iniciar» / «N días sin completar»; pendiente sin asignar = «sin asignar» | `_tvDias` (`utils.js`) |
| **Puntos de estado de 10 px** | Mismo punto en secciones del formulario (verde completa / ámbar pendiente, ya no ✓) y entregables; centrado con el título | `.sec-ind-*`, `.ent-dot` |
| **Sin tarjetas anidadas** | «Predio», «Norma POT» y «Revisión del texto» son bloques planos separados por una línea dentro de su sección; la única caja es la ficha catastral | `.predio-panel`, `.norma-panel`, `#nv-revisar-bloque` |
| **Por qué está apagado** | Un «Generar» deshabilitado dice el motivo en un solo aviso (`.ent-motivo`); sin carpeta de Drive no se pintan botones apagados | `nueva-visita.jsx` |
| **Formulario más corto, todo visible** | Art. 135 en rejilla (`.chips-rejilla`), ficha catastral resumida con la ubicación confirmada, mapa con tope de 400 px, fotos en una fila con «+N» | `styles.css`, `nueva-visita.jsx` |
| **Leyenda del mapa por capa** | Un renglón por color (retiro, amenaza, suelo de protección, DRMI) y solo la categoría que cae en el pin, con nombre limpio | `leyendaPOTPorCapa` (`utils.js`) |
| **Agenda en el menú del celular** | Abajo, como mucho 5 pestañas | `app.jsx` |

## 9. Movimiento

Las transiciones existentes son **cortas (0,08–0,35 s)** y solo donde comunican estado: menús,
hoja del informe, sello (`INFORME-valla-revision-final.md:99-104`). Sin animaciones nuevas en el
rediseño. El bloque global `@media (prefers-reduced-motion: reduce)` en `styles.css:2231-2237`
(anotado en `:2228-2230`) reduce animaciones y transiciones a 0,01 ms — las anula sin romper
las que comunican estado. Requisito de `PRODUCT.md:69`.

## 10. De dónde sale cada decisión

- **Contrato de dirección** `.impeccable/surfaces/index-html.md`: tesis, OWN-WORLD (paleta,
  tipografía, escala, filetes, radio), STORY (sello, placa con dirección enorme), FIRST VIEWPORT
  (barra negra 56 px, pestañas 72 px, placa en Mis visitas), FINISH (este documento).
- **Revisión de arquitectura 2026-10-27** (`docs/REVISION_ARQUITECTURA_2026-10-27.md`, rama
  `rediseno`; citada por el contrato y las TASK): la estructura no se tocó — tarjeta única
  (decisión 1), la Semana señala lo que está en Atención (decisión 2), la placa vive en Mis
  visitas (decisión 3), formulario **todo visible**, ni pasos ni plegado (decisión 5,
  `styles.css:4695-4697`).
- **Decisiones del usuario** citadas en TASK/INFORME: el rediseño se publica **completo y una
  sola vez** (`TASK-valla-00-LEEME.md:28`); formulario todo visible; «hoy» sin fondo amarillo, con borde de tinta; chips del formulario a 44 px y los de filtro a 36
  (`styles.css:5011-5015`); sin versiones subidas.
- **TASK-valla-01 línea 16**: el círculo amarillo de iniciales del perfil.
- **TASK-valla-02**: la placa con texto `--valla-ink`, acciones a 52 px, selección de escritorio
  en tinta, rótulos de grupo en condensada.
- **Revisión final medida** (`INFORME-valla-revision-final.md`, 2026-10-28, Playwright + DOM,
  a 390/1200/1366): regla del amarillo conforme, toques corregidos y verificados, escala y
  contraste limpios en la app, sin desbordes ni errores de consola.

## 11. Qué NO es el sistema

- **No es un tablero de oficina encogido**: un foco por pantalla; la oficina se adapta a la
  pantalla grande, no al revés (contrato THESIS; `PRODUCT.md` principio 1).
- **El amarillo no es un color de estado**: los estados van en azul/verde/ámbar/rojo con su
  palabra (sección 3).
- **La hoja del informe F-GGO-43 queda fuera del sistema**: sigue igual al Word de la Alcaldía
  (10/11/14 px incluidos, decisión de la TASK 07); el rediseño pinta solo el cromo del generador
  (`INFORME-valla-revision-final.md:87-89`).
- **Nada desaparece** (contrato STORY). Lo completado conserva su contenido, atenuado (sección 5).
- Los logos institucionales y los nombres F-GGO-46 / F-GGO-43 no cambian (`PRODUCT.md:46`).
