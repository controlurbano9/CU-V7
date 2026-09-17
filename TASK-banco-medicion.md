# TASK — Instrumento de medición para las revisiones visuales

Las cuatro revisiones de UI han medido lo mismo —alto de la barra, solapes,
objetivos táctiles, contraste, overflow— y cada vez se ha vuelto a escribir el
JS de medición a mano, punto por punto, contra el navegador por MCP. Eso es el
90 % del reloj de una ronda (40-60 min) y, peor, hace que **qué se mide dependa
de si esa vez alguien se acordó de medirlo**: así sobrevivió tres rondas el P1
de `--header-h`.

Este encargo saca la medición del modelo y la mete en un script. Después de
esto, una revisión visual es: correr el script, mirar los números que
**cambiaron**, y juzgar. Juzgar sigue siendo trabajo del revisor; medir, no.

## Entregable

`qa/medir.mjs` — Node + Playwright directo, **sin framework de test**, sin MCP.

```
node qa/medir.mjs              # mide, escribe qa/medicion.json, imprime resumen
node qa/medir.mjs --diff       # además compara contra qa/baseline.json
node qa/medir.mjs --baseline   # promueve la medición actual a baseline
node qa/medir.mjs --solo 390   # acota la matriz mientras depuras
```

Dependencia nueva: `playwright` como **`devDependency`** (`npm i -D playwright`).
Es la única dependencia nueva autorizada en este encargo. El binario de Chromium
ya está descargado por el plugin de Playwright y vive en
`%LOCALAPPDATA%\ms-playwright`, así que **no debes ejecutar
`npx playwright install`**: si el navegador no aparece, dilo en el informe en
vez de bajar 150 MB.

## Matriz

Escenarios `nueva | faltantes | completa | offline` × viewports 390×844,
1366×768, 1440×900, 1920×1080, más la variante `?offline=1` (añade
`body.is-offline`) sobre `completa`. Todo contra
`http://127.0.0.1:8099/qa-centro-control.html`.

**Nunca contra una visita real:** el formulario dispara autoguardado remoto cada
60 s y escribiría en la BD de producción. El banco tiene la red stubeada; esa es
justamente la razón de que exista.

Si el puerto 8099 no responde, **falla con un mensaje que diga cómo levantarlo**
(`python -m http.server 8099` desde la raíz del repo). No intentes levantar el
servidor tú ni cambiar de puerto.

**Espera a que las fuentes estén listas** (`document.fonts.ready`) antes de
medir nada: Inter y Fraunces vienen de Google Fonts y con la fuente de respaldo
las alturas salen distintas. Es la primera fuente de cifras irreproducibles.

## Qué mide

Cada comprobación devuelve **hechos con id estable** (para poder diffear) y, si
procede, un incumplimiento. Nada de prosa: el script no opina.

1. **Barra superior.** Alto real de `.header` (`getBoundingClientRect`) contra el
   valor computado de `--header-h`. Deben coincidir; la diferencia es el hecho
   que se reporta.
2. **Cobertura de controles.** Para **cada elemento interactivo visible**
   (`button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])`),
   `document.elementFromPoint` en su centro debe devolverlo a él o a un
   descendiente suyo. Si devuelve otra cosa, el control está tapado: **gravedad
   alta**. Repetir con la página arriba del todo, a media altura y al fondo —
   el P1 solo se manifestaba con el formulario scrolleado.
3. **Objetivos táctiles.** Todo control visible por debajo de 44×44 px, con su
   medida. Excluye los que están dentro de un contenedor con
   `pointer-events: none` o `visibility: hidden`.
4. **Contraste.** Ratio WCAG **compuesto de verdad**: resuelve `opacity`
   heredada y apila los fondos translúcidos hasta encontrar uno opaco (la
   `opacity: 0.75` de `.ent-falta-sec` fue un P2 real y un cálculo ingenuo lo
   habría dado por bueno). Umbral 4,5:1 para texto normal, 3:1 para texto grande
   (≥24 px, o ≥18,66 px en negrita) y para elementos gráficos.
5. **Overflow horizontal.** `scrollWidth > clientWidth` en el documento y por
   elemento, con el culpable identificado.
6. **Foco de teclado.** Recorre los tabbables, `focus()` en cada uno, y
   comprueba que tras el scroll mínimo del foco el control no queda bajo ningún
   elemento `position: fixed`/`sticky`. Con la página al fondo, que es donde
   apareció el P3. Un control que **vive dentro** de la cabecera fija no cuenta
   como fallo (falso positivo conocido: «Volver»).
7. **Consola.** Errores y rechazos no capturados. El ruido declarado del banco
   —404 de favicon, `CU_MAPS_JS_URL`, los rechazos del stub de red— va en una
   lista blanca explícita y no cuenta.

## Salida

`qa/medicion.json`:

```json
{
  "fecha": "...", "commit": "<git rev-parse --short HEAD>",
  "hechos":  [{ "id": "390/faltantes/header.alto", "valor": 111.4, "unidad": "px" }],
  "fallos":  [{ "id": "...", "gravedad": "alta|media", "detalle": "..." }]
}
```

Por consola, un resumen corto: nº de hechos, nº de fallos por gravedad, y en
`--diff` **solo lo que cambió** respecto al baseline (tolerancia ±1 px, ±0,1 en
ratios de contraste: el subpíxel y el redondeo de fuentes se mueven solos y un
diff que grita por 0,3 px no lo lee nadie).

`qa/medicion.json` va al `.gitignore`; `qa/medir.mjs` y `qa/baseline.json`, al
repo.

## Calibración — el criterio de cierre

Un instrumento sin calibrar no sirve. Estas cifras están medidas en
`INFORME-ui-review-4.md` y **no las tocó ninguna de las correcciones
posteriores**. Tu script tiene que reproducirlas (±1 px, ±0,1 en contraste):

| Hecho | Esperado |
|---|---|
| `.header` alto @390 (título y usuario a 2 líneas c/u) | 111,4 px |
| `.header` alto @≥768 | 65,1 px |
| `.nv-header` alto @390 `?e=faltantes` | 153,2 px |
| `.nv-header` alto @1366 y @1440 | 189,8 px |
| `.ent-btn` en todos los renglones, los 4 viewports | 92×44 px |
| Grilla de fotos @1440 `?e=completa` | 4 columnas × 61 px, 18 celdas |
| Contraste badge «INICIADO» | 6,62:1 |
| Contraste botón «Volver» | 13,49:1 |
| Contraste título / dirección de la cabecera | 15,22:1 |

Si alguna **no** cuadra, hay dos explicaciones posibles y tienes que decir cuál
es: el script mide mal, o el diseño cambió desde entonces. Averígualo (`git
log -p` de `styles.css` desde `188ac6c`) y dilo con la cifra vieja y la nueva.
No ajustes el número esperado para que pase.

No calibres contra el recorrido de los 22 campos faltantes: ese plegable lo
elimina el cambio que entra justo antes que este.

## Invariantes

- **No toques código de la app.** Ni `nueva-visita.jsx`, ni `styles.css`, ni
  `app.jsx`, ni `index.html`, ni `sw.js`, ni el backend. Este encargo añade
  `qa/medir.mjs`, toca `package.json` (una devDependency) y `.gitignore`. Nada
  más. Si midiendo encuentras un fallo de UI, **repórtalo, no lo arregles**.
- Sin bump de `?v=` ni de `CACHE_NAME`: no se despliega nada al usuario.
- No toques `tests/`, `utils.js` ni el banco `qa-centro-control.html`.
- Comentarios en español con acentos correctos.
- El script es una herramienta, no una obra: sin clases, sin plugins, sin capa
  de configuración para valores que nunca cambian. Un archivo, funciones
  sueltas, la matriz y los umbrales como constantes arriba.

## Verificación antes de cerrar

1. `node qa/medir.mjs` corre entero sin excepción y tarda **menos de 5 minutos**.
   Si tarda más, di cuánto y dónde se va el tiempo.
2. Dos corridas seguidas dan cifras idénticas dentro de la tolerancia. Un
   instrumento que no repite no mide. Repórtalo: cuántos hechos se movieron
   entre corridas y cuánto.
3. La tabla de calibración, punto por punto: esperado, medido, veredicto.
4. `npm test` sigue en 21/21 y `npx eslint .` sin errores nuevos.
5. `qa/baseline.json` generado y commiteado con el estado actual.

## Cierre

Un commit (`git add` solo de lo tocado; **no** `git add -A`). **No hagas push.**
Escribe `INFORME-banco-medicion.md` con la tabla de calibración, la
repetibilidad, el tiempo de corrida y **la lista de fallos que el instrumento
encontró de paso** — esos no los arregles, son el encargo siguiente.
