# Pendiente de deploy — un guardado no puede pisar la fila de otra visita (2026-09-28)

## Qué pasó

El 2026-09-25 la fila 1592 de BD VISITAS amaneció con los datos de `20261079955`
(la visita real está en la 1591), y `20261084284` (CL 52 52-66, Perez, asignada a
Alejandro Hernández el 24/09) desapareció de la BD.

Rastro en LOG_AUDITORIA:

| Hora | Evento | Lectura |
|---|---|---|
| 24/09 14:36 | `fila 1592: ESTADO ASIGNADO → INICIADO` (Daniel) | `20261079955` vivía en la 1592 |
| 24/09 16:39 | `fila 1592: ASIGNADA → ALEJANDRO (PENDIENTE → ASIGNADO)` | la 1592 ya era **otra** visita: se borró una fila más arriba y todas subieron una posición |
| 25/09 | fila 1592 escrita por Daniel, sin línea de log | el guardado no cambió el estado, así que no quedó en el log |

Mecanismo (`nueva-visita.jsx`):

1. El borrador local se guarda con la clave **`cu_draft_v1_fila_<N>`**. En ese
   dispositivo quedó `cu_draft_v1_fila_1592` con los datos de `20261079955`.
2. Al abrir la visita que ahora ocupaba la 1592, el borrador se restauró sin
   preguntar encima de los datos de BD (radicado, dirección, actuación…). Estado y
   fecha de asignación vienen de otro lado (`estadoVisita` y `datosIniciales`), y
   por eso la fila quedó `ASIGNADO` con fecha 25/09, que eran los de Alejandro.
3. La visita de Alejandro no tenía `LINK_DRIVE`, así que el efecto
   «carpeta-auto» hizo `obtenerOCrear` con la dirección y la fecha restauradas,
   encontró la carpeta de `20261079955` y **guardó solo**, sin ningún clic.
4. El backend no lo frenó: el control de `ULTIMA_MODIFICACION` no actúa cuando esa
   celda está vacía en la fila de destino, y en una ASIGNADA nunca se había estampado.

## Qué cambia

- **Front:** `borradorEsDeLaFila()` (`utils.js`). Si un borrador de otro radicado
  aparece bajo esa fila, se borra en vez de restaurarse. Los borradores guardan
  ahora `_radicadoFila`; en los viejos se compara el radicado del formulario.
- **Front → backend:** cada `actualizar` manda `radicadoConocido`, que es el
  radicado de la fila al abrir o el último guardado (`_radicadoFilaRef`).
- **Backend (`actualizar`, AP-FILA):** si la fila tiene otro radicado, no escribe,
  responde `filaMovida:true` y deja la línea `Guardado BLOQUEADO` en LOG_AUDITORIA.
  Esto cubre también un formulario abierto o un guardado en cola offline cuando
  alguien borra una fila en el Sheet.

Compatible en cualquier orden: un backend viejo ignora el campo, y un front viejo
no lo manda (sin control, igual que hoy).

## Deploy (desde Katana)

1. Respaldo: `clasp-prod/Código.js` → `_respaldos/PRODUCCION_pre-deploy_2026-09-28_fila-movida.js`.
2. `node herramientas/probar-mejora-texto/sincronizar.js`.
3. `cp apps_script_unificado.js clasp-prod/Código.js`, y en otro comando: `clasp push --force && clasp deploy -i <deploymentId> -d "AP-FILA radicadoConocido"`.
4. Front: `npm test`, que debe incluir `tests/fila-movida.test.js`. Aquí no se pudo
   correr porque no hay Node; el helper se probó en el navegador. Después commit y
   `git push origin main` (dos push URLs).

## Verificación

- Abrir una visita, guardar: guarda normal. En DevTools, el body de `actualizar`
  trae `radicadoConocido`.
- Prueba del bloqueo sin tocar datos reales: en DevTools, antes de abrir una visita
  de la fila N, poner `localStorage['cu_draft_v1_fila_N'] = JSON.stringify({_ts:Date.now(), _d:{radicado:'OTRO'}})`.
  Al abrir, la consola dice `borrador descartado` y el formulario muestra los datos de BD.

## Recuperar lo perdido (manual, en el Sheet)

- Fila 1592: en Historial de versiones, buscar la del 24/09 después de las 16:39 y
  copiar esa fila (`20261084284`) encima de la 1592 actual. No restaurar la
  versión completa.
- Revisar `20261092195` (CR 59 27B-140, Amazonia, Forms 15/09): tampoco está en BD.

## Rollback

Backend: volver a desplegar el respaldo. Front: revertir el commit (el campo extra
es inocuo para el backend viejo).

## Qué no cubre

`asignarRadicado`, `completarRegistro` y las escrituras de links (acta, informe,
vigilancia) todavía confían en el número de fila. Escriben celdas sueltas, no la
fila entera, así que el daño sería menor, pero una fila corrida las mandaría
igual a la visita equivocada.
