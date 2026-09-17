# TASK — Cliente: respetar la selección de fotos del registro fotográfico

## Contexto

El modal del registro fotográfico **ya permite quitar fotos**: cada renglón
tiene «Quitar del registro» (`nueva-visita.jsx:4186-4199`) que la saca de
`modalFotos`. Ese botón **no tenía efecto en el documento final**: el backend
recorría además la carpeta de Drive y volvía a meter al final, sin descripción,
toda foto que no viniera en el payload.

**El backend ya está arreglado** (fuera de este repo, lo hice yo): cuando el
payload trae `seleccionExplicita: true` y al menos una foto, la lista del
payload es definitiva y la carpeta no se recorre. Sin esa bandera se conserva el
merge de siempre, que es la red para la foto subida sin señal que sincronizó
tarde. **No toques ni busques el archivo del backend**: no está en este repo.

Falta el lado del cliente, que es todo lo que tienes que hacer.

## 1. Mandar la bandera

En `confirmarYGenerarRF` (`nueva-visita.jsx:3041-3055`), agrega
`seleccionExplicita: true` al payload de `generarRegistroFotos`, junto a
`regenerar: true`.

**Solo ahí.** La bandera significa «un humano revisó esta lista y la confirmó»,
y ese es el único punto del código donde eso ocurre. Verifica con grep si hay
otro invocador de `generarRegistroFotos` (mira también `informe/index.html`); si
existe alguno que genere sin pasar por el modal, **no** le pongas la bandera y
dilo en el resumen final.

## 2. Que se vea que quitar surtió efecto

Hoy el inspector quita 13 fotos de 25 y nada en pantalla cambia: el botón sigue
diciendo «Confirmar y generar». Necesita confirmación antes de generar.

- Al abrir el modal, guarda cuántas fotos trajo `listarFotosActa`
  (`abrirModalFotos`, ~`:3006-3030`) en un ref o state — **no** lo recalcules
  después, porque la lista se va modificando.
- Si `modalFotos.length` es menor que ese total, el botón de confirmar
  (`:4215-4224`) dice **«Generar con N de M fotos»**. Si son iguales, se queda
  con «Confirmar y generar» tal cual.
- Los estados que ya tiene ese botón (deshabilitado con lista vacía, spinner y
  `aria-busy` mientras hay descripciones generándose, y su texto en esos casos)
  **no se tocan**: el texto nuevo es solo para el caso normal.

## 3. Lo que NO se cambia

- El botón «Quitar del registro» y su `aria-label` están bien: la foto **sigue
  en Drive** y el texto ya lo dice. No los renombres.
- No agregues borrado de fotos de Drive: no existe acción de backend para eso y
  son evidencia de una actuación administrativa.
- No persistas la selección entre aperturas del modal. Al regenerar se vuelve a
  listar la carpeta y el inspector vuelve a elegir; es decisión tomada.
- No toques la grilla de miniaturas del formulario (`fotos-grilla`,
  `_celdaFoto`): ahí las fotos no se seleccionan, solo se confirman.
- No toques el arrastre para reordenar, ni la generación de descripciones con
  IA, ni `_construirDatosF46`.

## Invariantes

- Sin cambios en columnas de BD ni en el contrato de otras acciones.
- Hooks antes de cualquier `return` condicional (React #310); aliasing del
  archivo (`useStateNV`, `useEffectNV`).
- Sin dependencias nuevas. No edites `bundle.min.js` a mano.
- Textos de UI y comentarios en español con acentos correctos.
- No toques `utils.js`, `tests/` ni `qa-centro-control.html`.

## Verificación antes de cerrar

1. `node build.js` sin errores.
2. `npm test` en verde (21/21).
3. `npx eslint nueva-visita.jsx` sin errores nuevos (11 warnings de
   `exhaustive-deps` son preexistentes).
4. Bumpa `?v=` de `bundle.min.js` en `index.html` y `CACHE_NAME` en `sw.js`.

## Cierre

Un commit (`git add nueva-visita.jsx index.html sw.js bundle.min.js`, mensaje en
español; **no** `git add -A`: hay archivos de otras tareas en el árbol). **No
hagas push.** Luego para.
