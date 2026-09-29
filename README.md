# Control Urbano V6 · Inspección N°9 · Alcaldía de Bello

App web React + esbuild para gestión de visitas urbanísticas. Servida vía **GitHub Pages**.

## Build local

```bash
npm install                  # primera vez
node build.js                # genera bundle.min.js minificado
node build.js --dev          # build con sourcemaps, sin minify
npm test                     # tests de node (tests/*.test.js)
npm run lint                 # eslint
```

Tras editar cualquier `.jsx`: regenerar bundle + bumpar `?v=N` en `index.html` y `CACHE_NAME` en `sw.js`.

Publicar: `git push origin main` publica en los dos repos (`cu-v5-dev` y el espejo `CU-V7`, que es la URL del equipo).

## Estructura

- `index.html` · entry point
- `bundle.min.js` · pre-transpilado con esbuild (~270 KB, sin Babel runtime)
- `build.js` + `package.json` · pipeline esbuild (el orden de `ARCHIVOS` importa)
- `*.jsx` · fuentes (16 archivos, regenerar bundle al editar)
- `env.js` · URL del webhook (ignorado por git; plantilla `env.example.js`)
- `tests/` · pruebas de la lógica pura de `utils.js` y `api.js`
- `api.js` · cliente del webhook Apps Script + cache + POT + catastro
- `offline-queue.js` · cola IndexedDB para escrituras sin red
- `sw.js` · Service Worker (SWR + Background Sync)
- `utils.js` · fechas, festivos CO, días hábiles, reglas de visibilidad
- `styles.css` · design tokens (terracota sobre crema)
- `catastro.json` · 52K polígonos + 225K fichas (37 MB)
- `informe/index.html` · generador F-GGO-43 standalone

## Documentación completa

Ver `CLAUDE.md` en el workspace padre — reglas críticas, arquitectura, mapeos de BD, flujos.
