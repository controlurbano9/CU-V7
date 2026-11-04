# Pendiente de deploy — Reporte mensual de evidencias (backend) · 2026-11-04

El frontend (Administración › **Evidencias**) ya está en este repo. **Sin este backend la pestaña
abre, pero «Generar carpeta» responde «Acción no reconocida»** y el historial sale vacío con error.

Probado en local contra el `doPost` real con BD y Drive en memoria
(`tests/reporte-evidencias.test.js`, 7 pruebas de backend + 6 de la lógica del cliente).
No se ha probado contra Drive real: la primera ejecución conviene hacerla con un mes ya cerrado y
revisar la carpeta.

## Qué pidió el usuario (2026-11-04)

- Cada mes se pasan carpetas de visitas **completadas** con **acta y registro fotográfico**,
  normalmente **4**, las más representativas **con orden de suspensión**; si no hay 4, se completa
  con otras.
- El mes es el de **FECHA DE VISITA**.
- Entrega: **carpeta compartida en Drive**. Cada subcarpeta se llama como **la dirección**.
- **Solo ADMIN**. Queda **historial** de lo reportado.

## Cambios en el backend (`[SEC:ReporteEvidencias]`, al final del archivo)

| Pieza | Qué hace |
|---|---|
| `generarReporteEvidencias` (ADMIN) | `{mes:'YYYY-MM', visitas:[{idVisita, fila, radicado}]}` (1 a 8, en orden) → `{ok, nombreCarpeta, linkCarpeta, reemplazado, visitas:[{radicado, direccion, carpeta, linkCarpeta}]}`. Con lock. Busca cada visita por `ID_VISITA` (o por fila + radicado), vuelve a validar que esté COMPLETADA, que la fecha de visita sea del mes y que tenga acta y RF. Crea `Evidencias <Mes> <Año>` y dentro una subcarpeta por visita con `ACTA - <radicado>.pdf` y `REGISTRO FOTOGRAFICO - <radicado>.pdf`. Deja log en LOG_AUDITORIA. |
| `leerReportesEvidencias` (ADMIN, lectura) | `{ok, filas}`: la hoja REPORTES_EVIDENCIAS por encabezado. |
| Router | Los dos `case` junto a `marcarHallazgoRevisado`, con `_soloAdmin`. |

### Detalles a saber

- **Dónde queda:** `REPORTES DE EVIDENCIAS/Evidencias Octubre 2026/` dentro de
  `ID_CARPETA_INSPECCIONES`. Para usar otra carpeta, crear la propiedad del script
  `ID_CARPETA_REPORTES_EVIDENCIAS` con su ID (sin deploy).
- **Compartida:** la carpeta del mes queda «cualquiera con el enlace, solo lectura», como las
  carpetas de visita.
- **Acta:** se copia el PDF de `LINK_PDF_ACTA`. Si la visita solo tiene el acta en Doc/Sheet
  (`LINK_XLSX_ACTA`), se genera el PDF con `generarPdfDesdeActa` (el mismo del cierre), queda
  también en la carpeta de la visita y se llena `LINK_PDF_ACTA`.
- **Registro fotográfico:** el Doc de `LINK_REGISTRO_FOTOS` se exporta a PDF (si ya es PDF, se copia).
- **Nombre de la subcarpeta:** la dirección en mayúsculas; `/` pasa a `-`; dos visitas a la misma
  dirección en el mes llevan ` (2)`.
- **Generar de nuevo el mismo mes lo reemplaza:** lo que había en la carpeta del mes va a la
  papelera (recuperable 30 días) y el historial de ese mes se reescribe.
- Si falla a mitad (por ejemplo, un archivo sin permiso), responde el error y **no** escribe el
  historial; la carpeta queda incompleta y se rehace al volver a generar.

**Hoja nueva:** `REPORTES_EVIDENCIAS` (se crea sola la primera vez): MES, FECHA_GENERACION,
GENERADO_POR, ORDEN, RADICADO, ID_VISITA, DIRECCION, FECHA_VISITA, VISITADOR, SUSPENSION,
N_ORDEN_POLICIA, LINK_CARPETA_VISITA, LINK_CARPETA_REPORTE, LINK_CARPETA_MES. No se edita a mano.

## Frontend (este repo)

- `reporte-evidencias.jsx` — pestaña **Evidencias** en Administración.
- `utils.js` — `candidatasEvidencias`, `sugerirEvidencias`, `historialEvidenciasPorMes`, etc.
  Orden de la sugerencia: nivel (suspensión con N° de orden > suspensión sin N° > orden sin
  suspensión > nada) y, dentro del nivel, orden escaneada (+10), infracción del catálogo (+10),
  dirección ya reportada otro mes (−15), otro inspector (−20 por cada una ya elegida del mismo),
  otra comuna (−10) y nunca la misma dirección dos veces si hay otra opción.
- `api.js` — `leerReportesEvidencias`, `generarReporteEvidencias`.
- Versiones: api 142, utils 171, bundle 313, styles 225, sw v341.

## Pasos de deploy

1. Respaldo del script en producción.
2. Pegar `apps_script_unificado.js` en el editor y publicar nueva versión (la URL no cambia).
3. Administración › Evidencias → elegir un mes cerrado → Generar → abrir la carpeta y revisar los
   PDF.
