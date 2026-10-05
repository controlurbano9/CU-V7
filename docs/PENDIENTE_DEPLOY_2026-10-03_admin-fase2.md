# Pendiente de deploy — Administración fase 2 (backend) · 2026-10-03

Backend escrito y probado en local (`tests/admin-fase2-backend.test.js`, 9 pruebas que corren el
`doPost` real contra una hoja USUARIOS en memoria). **✅ Desplegado el 2026-10-04 como @134**,
junto con reiterados y agenda por barrio. Respaldo previo:
`_respaldos/PRODUCCION_pre-deploy_2026-10-04_admin-fase2.js`. El frontend de la fase 2 aún no
existe.

## 🚩 Arreglo de seguridad que va incluido

`resetPin` y `toggleActivo` **no comprobaban el rol**: cualquier sesión válida (un inspector)
podía fijar el PIN de cualquier usuario, incluido el del admin, y entrar con él. Ahora las dos
exigen ADMIN (`_soloAdmin`), y un admin no puede desactivarse a sí mismo. Las pruebas fallan
contra el backend anterior y pasan con el nuevo.

Queda fuera de este cambio: `asignarRadicado`, `desasignarRadicado`, `completarRegistro` y
`confirmarAgenda` tampoco comprueban el rol en el backend; solo los esconde el cliente. Es un
caso distinto (no permite tomar una cuenta ajena) y hay que decidir qué roles las usan antes de
cerrarlo.

## Cambios en el backend

| Pieza | Qué hace |
|---|---|
| `buscarUsuarioActivo(ss, nombre, hash, opciones)` | Lee `PIN_TEMPORAL_VENCE` por encabezado. Con un temporal vencido devuelve `null`, salvo `{permitirVencido:true}`. Agrega `pinTemporal` y `pinTemporalVencido`. |
| `_requireAuth` | Con PIN temporal solo deja pasar `cambiarMiPin` y `log`; el resto responde `{ok:false, debeCambiarPin:true}`. |
| `verificarLogin` | Con un temporal vencido: «Tu PIN temporal venció…» (no suma intento). Si no, `debeCambiarPin`. |
| `log` (doPost y doGet) | Usuario de la sesión y hora del servidor (`dd/MM/yyyy HH:mm`); se ignoran `usuario` y `fecha` del cliente. |
| `leerLogAuditoria` | `limite` opcional: encabezado + últimas N filas, y `total`. Sin `limite`, igual que antes. |
| `listarUsuariosAdmin` | Agrega `conPin`, `pinTemporalVence` (texto) y `pinTemporalVencido`. Nunca el hash. |
| `resetearPin` | Además borra el temporal pendiente. |
| `generarPinTemporal` (ADMIN) | `{fila, nombreConocido}` → `{ok, pin, nombre, vence}`. 4 dígitos al azar, sin PINes débiles, válido **72 h** (`PIN_TEMPORAL_HORAS`). Desbloquea los intentos de login. El log no guarda el PIN. |
| `cambiarMiPin` (cualquier sesión) | `{hashNuevo, hashActual?}` → `{ok}`. `hashActual` es obligatorio si el PIN no es temporal. Rechaza un PIN débil o igual al actual. |
| `cambiarRol` (ADMIN) | `{fila, nombreConocido, rol}` → `{ok, nombre, rol}`. Nunca el propio. Escribe la col E y deja log. |
| `leerPendientesAdmin` (ADMIN, lectura) | `{hallazgos, informesRechazados}`: hallazgos con `ESTADO_REVISION = PENDIENTE` e informes rechazados de los últimos 30 días, como objetos por encabezado con `_filaHoja`. |
| `marcarHallazgoRevisado` (ADMIN) | `{filaHoja, radicado, estado:'REVISADO'\|'DESCARTADO'}`. Verifica que el radicado de esa fila sea el esperado. |

**Columna nueva:** `USUARIOS` → `PIN_TEMPORAL_VENCE` (ms epoch; vacía = PIN propio). Se crea sola,
al final del encabezado, la primera vez que se genera un PIN temporal. No se escribe a mano.

## Contrato para el frontend de la fase 2

- **Login:** si la respuesta trae `debeCambiarPin:true`, se guarda la sesión, pero antes de entrar
  a la app se muestra «Elige tu PIN» (dos veces). Luego `cambiarMiPin` y, con el ok,
  **`sesionHash = hashNuevo`** (el hash viejo deja de autenticar).
- **Cualquier respuesta con `debeCambiarPin`** (por ejemplo, una pestaña que quedó abierta) lleva
  a esa misma pantalla.
- **«Cambiar mi PIN»** para todos (menú de usuario): PIN actual + nuevo dos veces → `cambiarMiPin`
  con `hashActual`.
- **Panel de Equipo:**
  - «Generar PIN temporal» → `generarPinTemporal`. Lleva el `requestId` que `gasPost` agrega a
    toda escritura: el dedup guarda la respuesta (con el PIN) hasta 6 h en la caché del script,
    asociada a ese UUID. Lo aceptamos porque así un reintento devuelve **el mismo** PIN en vez de
    generar otro. Se muestra una sola vez, con «vence dd/mm/aaaa hh:mm».
  - Ojo con la cola offline: los pedidos encolados llevan dentro el `sesionHash` del momento, y
    al reenviarlos gana ese valor. Tras `cambiarMiPin` hay que reescribirlos con el hash nuevo
    (ver `TASK-admin-fase2a-pin.md`).
  - Si `pinTemporalVence` existe, el panel lo dice («PIN temporal pendiente, vence …» o «vencido»).
  - Selector de rol → `cambiarRol` con `nombreConocido`.
  - Se quitan «Reset PIN» y `TabResetPin`.
- **Bandeja:** `leerPendientesAdmin` (agregar a `_ACCIONES_SOLO_LECTURA` en `api.js`) y
  «Revisado» / «Descartar» → `marcarHallazgoRevisado`.
- **Actividad / Equipo:** `leerLogAuditoria` con `limite` (por ejemplo 3000) en vez de la hoja entera.

## Orden de despliegue

**Backend primero**, y es seguro: el front actual sigue funcionando.
- El admin pasa el control de rol.
- Las respuestas traen campos de más que el front ignora.
- Nadie puede tener un PIN temporal hasta que exista el botón del front nuevo.

El `log` cambia de inmediato: desde el deploy, el usuario sale de la sesión.

⚠ El deploy sube el `apps_script_unificado.js` **entero**. Incluye también lo que esté sin
desplegar de otras rondas (reiterados de la ronda 10-02, y lo que la sesión de Agenda haya
tocado). Antes de desplegar hay que revisar qué hay pendiente.

## Verificar en real tras el deploy

1. Con sesión de inspector, `resetPin` sobre otra fila → «Acceso restringido».
   (Probarlo desde la consola del navegador; la app ya no lo ofrece.)
2. Reset PIN desde Administración (admin) sigue funcionando.
3. La auditoría muestra «Login V6» con el usuario real y la hora `dd/MM/yyyy HH:mm`.
