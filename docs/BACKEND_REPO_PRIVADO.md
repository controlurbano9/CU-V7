# El backend en un repositorio privado (pasos para hacer a mano)

Hoy `apps_script_unificado.js` vive solo en OneDrive (`PROYECTO CODE/`), sin historial. Sus pruebas
(`tests/audiencias-cupos.test.js`, `tests/audiencias-backend.test.js`, `tests/admin-fase2-backend.test.js`…)
solo corren en un equipo que lo tenga junto a la carpeta del repo. En GitHub Actions se saltan.

El motivo para no versionarlo era que «tiene claves». Ya no es así: las claves de API se leen de las
propiedades del script (`_claveDePropiedades`). Sí trae el ID de la base de datos, los de las
plantillas y un correo, así que **el repositorio tiene que ser privado** (CU-V7 y cu-v5-dev son públicos).

## 1. Bajar el proyecto con clasp

En el equipo, una sola vez:

```bash
npm install -g @google/clasp
clasp login
```

Activa la API de Apps Script en https://script.google.com/home/usersettings.

El ID del script está en el editor: Configuración del proyecto › ID de la secuencia de comandos.

```bash
mkdir cu-backend && cd cu-backend
clasp clone <ID_DEL_SCRIPT>
```

`clasp clone` trae los archivos con el nombre que tienen en el editor (por ejemplo `Código.js`). Si no se
llama `apps_script_unificado.js`, renómbralo en el editor o cambia `BACKEND` en las pruebas.

## 2. Subirlo a un repositorio privado

Crea en GitHub un repositorio **privado** (por ejemplo `cu-backend`) y súbelo:

```bash
git init && git add . && git commit -m "Backend Apps Script"
git remote add origin https://github.com/<usuario>/cu-backend.git
git push -u origin main
```

A partir de ahí, `clasp push` sube los cambios al editor y la publicación sigue siendo
Implementar › Administrar implementaciones › Nueva versión (así la URL no cambia).

## 3. (Opcional) Correr sus pruebas en GitHub Actions de CU-V7

Las pruebas buscan el backend en la carpeta de arriba del repo. En `.github/workflows/pruebas.yml` se puede
agregar, antes de `node --test`:

```yaml
      - uses: actions/checkout@v4
        with:
          repository: <usuario>/cu-backend
          token: ${{ secrets.BACKEND_TOKEN }}
          path: backend
      - run: cp backend/apps_script_unificado.js ..
```

`BACKEND_TOKEN` es un token de GitHub de solo lectura sobre `cu-backend`, guardado como secreto en CU-V7
(Settings › Secrets and variables › Actions). Sin ese secreto, ese paso falla: agrégalo solo cuando el
token exista.
