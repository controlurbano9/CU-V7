# Pendiente de deploy — Audiencias: lógica y arquitectura (backend) · 2026-11-04

Backend escrito y probado en local contra una copia de `apps_script_unificado.js`:

- `tests/audiencias-backend.test.js`: 13 pruebas que corren el `doPost` real contra hojas en memoria, con «hoy» fijo en el 05/04/2027. Contra el backend anterior fallan 12. La que pasa (liberar una cita futura) cuida lo que no debía cambiar.
- `tests/audiencias-cupos.test.js`: las funciones puras.

Con el backend junto a la carpeta del repo corren las 757 pruebas y pasan todas.
**Sin desplegar.** El archivo completo y el diff se entregaron aparte (no van en este repo, que es público).

## Orden

1. Respaldo del código en producción (como `_respaldos/PRODUCCION_pre-deploy_2026-11-04_audiencias.js`).
2. Backend: pegar el archivo completo en el editor y publicar una **versión nueva de la misma implementación**:
   Implementar › Administrar implementaciones › editar › Nueva versión. Así la URL del webhook no cambia.
3. Cliente: `git push` de la rama a `main`.

Los dos órdenes son seguros:
- **Cliente nuevo con backend viejo:** «Reprogramar» y «Marcar pegada» responden «Acción no reconocida», y todas las citaciones salen como pendientes. Lo demás funciona igual.
- **Backend nuevo con cliente viejo:** el cliente viejo no usa las dos acciones que se quitaron (desde el 22/10 lee todo con `agendaAudiencias`).

## Cambios en el backend ([SEC:Audiencias] y router)

| Pieza | Qué hace |
|---|---|
| `_decisionLiberarCupo` (nueva, pura) · `liberarCupo` | Una audiencia de un día ya pasado **no se libera**. Antes se liberaba y, si el caso no tenía otra cita, se borraba la FECHA CITACION real de la visita. |
| `reprogramarCupo` (nueva, ADMIN) · `_decisionReprogramarCupo` (pura) | `{idCupo, idCupoNuevo, motivo?}`. Bajo un solo lock, el cupo nuevo queda RESERVADO con los datos del caso y con `CUPO_ANTERIOR` y `MOTIVO = «Reprogramada por … el …»`. El de antes queda LIBRE y la FECHA CITACION de la visita pasa a la nueva. Las reglas son las mismas de una reserva (3 días hábiles, novedades, ocupado). Repetir la llamada no duplica (`yaHecho`). |
| `marcarPegadasExcel` (nueva, ADMIN) · `_leerPegadasExcel` | `{ids, pegada?}`: marca o desmarca citaciones como pegadas en el Excel del despacho. **Hoja nueva `EXCEL_PEGADAS`** (`ID`, `PEGADA_EN`, `PEGADA_POR`), que se crea sola. `agendaAudiencias` devuelve `pegadas` al admin. |
| `agendaAudiencias` → caché · `_armarAgendaAudiencias` | La respuesta se guarda 60 s en `CacheService` (en trozos de 45.000 caracteres). La clave lleva una versión que cambia con cada escritura de audiencias, el rol, los parámetros y el día. Antes cada llamada leía AUDIENCIAS y ~20 columnas de BD VISITAS aunque respondiera «sin cambios». Lo que cambie en BD VISITAS por fuera (completar una visita) se ve a más tardar en 60 s. |
| `_invalidarAgendaAudiencias` | La llaman, al terminar de escribir, todas las acciones que tocan AUDIENCIAS, NOVEDADES_AGENDA o EXCEL_PEGADAS, y `_aplicarCitacionReservada`. |
| `apartarCupos` | Primero lee **sin lock**. Si quien llama ya tiene sus 3 vigentes y no hay apartados vencidos de nadie, responde sin escribir y sin tomar el lock de todo el script. |
| `_idCupoUnico` (nueva, pura) · `_planAgregarCupos` | El id del Office Script usa solo el primer nombre. Si ya existe, se agrega el segundo nombre y, si aun así choca, `-2`, `-3`. Los ids existentes no cambian. |
| `_escribirCamposCupo` · `_agregarFilasTexto` (nueva) | Todo se escribe como texto plano (`@`). Antes Sheets podía convertir `DD/MM/YYYY HH:mm` en fecha según la configuración regional y perder la hora de la reserva. Las filas de novedades ahora se sanitizan (antes `appendRow` escribía el motivo tal cual). `bloquearCupos` escribe todas sus novedades en una sola llamada. |
| `reservarCupo` | El «ya tiene cita» dice cuándo y con quién: «Este caso ya tiene audiencia el 14/04/2027 a las 9:00 AM con …». |
| **Quitadas:** `listaDiariaExcel`, `listarNovedades` | Nadie las llamaba desde el 22/10: `agendaAudiencias` trae las dos cosas. |

## Cambios en el cliente (este repo)

- **Rechazos visibles:** bloquear y eliminar muestran lo que el servidor rechazó, con el motivo en palabras (`textoRechazoCupo`). Los «por apartar» ya no se mandan a bloquear.
- **Tope de 400:** «Agregar cupos» no deja pasar de 400 por pedido, el límite del servidor (`problemaCantidadCupos`).
- **Citas pasadas:** sin «Liberar» ni «Reprogramar».
- **Reprogramar** (admin): desde la hoja de la cita y desde las citaciones afectadas por una novedad.
- **«Citaciones visitas completadas»:** «Copiar las N para el Excel», «Marcar pegada» y «Desmarcar», y las ya pegadas aparte.
- **Apartar cupos:** una vez al día por equipo, o si faltan (`_hayQueApartarCupos`).
- **«Pedir cita» desde el «+»:** ya no lee la agenda entera.
- **Tras escribir:** recarga sin pintar primero la copia vieja.
- **Refresco cada 15 minutos** (antes 5), además de al volver a la pestaña y al volver la señal.
- **Limpieza:** fuera `agruparAudienciasPorDia`, `agruparAudienciasPorSustanciador` y `proximoDiaAudiencias` (las vistas Hoy y Semana ya no existen), y `listaDiariaExcelAudiencias` y `listarNovedadesAudiencias` de `api.js`.
