# functions-v2 — backend Go (Cloud Run)

Servicios Go para la arquitectura v2 (`docs/111-New-Arch.md`). **Coexiste** con
`functions/` (Node/TS); no lo reemplaza. La migración es incremental con
adaptadores y cutover explícito.

## Layout

```
cmd/
  api/        Cloud Run service — API REST v1 (commands, validación, auth)
  consumer/   Job/Service — sweeper Outbox SQL → proyecciones Firestore
  scheduler/  Job — presencia vencida, expiración de ofertas, sweeps
internal/
  config/     Config validada al arranque (env, no secretas)
  middleware/ RequestID, Firebase ID token, App Check (monitor/enforce), RBAC
  db/         pgx pool vía Cloud SQL Go Connector (private IP)
  fs/         Cliente Firestore + constantes de colecciones DATA-MAIN_/REALTIME_/SAAS_/SYSTEM_
  outbox/     Inserción de eventos en la misma TX de negocio
  apperr/     Errores de dominio → HTTP
  rides/      request, accept (atómico), cancel, negotiate, complete (fare+comisión+pago), transition
  payments/   confirm-cash (driver confirma efectivo; 409 si no hay pago pendiente)
  tasks/      Producer Cloud Tasks (OIDC) + handler delayed-ride-status
  fcm/        Multicast FCM con reporte de tokens inválidos
```

## Decisiones implementadas

- **AcceptRide concurrente-safe**: `UPDATE ... WHERE status='requested' AND
  driver_id IS NULL ... RETURNING` — dos conductores, exactamente uno gana; el
  perdedor recibe 409.
- **Outbox transaccional**: evento en la misma TX; el consumer proyecta a
  Firestore con versionado (solo `version > appliedVersion`, idempotente).
- **Ofertas recuperables**: el consumer reserva candidatos y vencimientos en
  `ride_offers`, publica documentos con ID determinista sin reabrir estados
  terminales y solo marca `ride.requested` publicado tras completar el despacho.
  El job periódico recupera fallos y aplica backoff/dead-letter del outbox.
- **IDs duales explícitos**: `rides.id` UUID (interno) ↔
  `firebase_ride_id` (doc vivo `REALTIME_trips_live`); `driver_id`/`client_id`
  son Firebase UIDs.
- **App Check gradual**: `APP_CHECK_ENFORCE=monitor` por defecto.
- **REST nuevo**, no mirror de callables: los endpoints se derivan de los
  comandos actuales (`acceptRide`, `updateRideStatus`, …) bajo `/v1/`.

## Activación del consumer y despliegue manual

Después de crear, aceptar, confirmar o cancelar un viaje, la API intenta
encolar durante un máximo de un segundo una Cloud Task que invoca el job
`rundi-consumer` de la misma región. El outbox es la fuente durable: si la
tarea no se crea, la API conserva el resultado del comando y el Scheduler
recupera el evento en el siguiente barrido. La respuesta de Cloud Tasks solo
confirma la invocación del job, no su finalización; supervisar ejecuciones,
antigüedad del outbox y eventos `failed`.

Para habilitarlo manualmente, comprobar que:

- La cola `CLOUD_TASKS_QUEUE`, `REGION` y el job `rundi-consumer` existen en el
  mismo proyecto; `CLOUD_TASKS_SA_EMAIL` identifica la cuenta firmante.
- La cuenta de la API tiene `roles/cloudtasks.enqueuer` sobre la cola y
  `roles/iam.serviceAccountUser` sobre la cuenta firmante; esta tiene
  `roles/run.invoker` sobre `rundi-consumer`. Cloud Tasks necesita sus permisos
  de servicio para generar el token OAuth.
- El Scheduler de recuperación sigue activo. El script versionado contempla
  estos bindings; revisarlo antes de ejecutarlo, ya que también configura
  recursos y secretos. Desplegar primero el consumer actualizado y después la
  API evita que el job anterior marque eventos sin el nuevo despacho durable.
- Viajes programados: `deploy.sh` crea el job `rundi-programmed` (misma imagen
  de `rundi-scheduler` con `SCHEDULER_ONLY=programmed`) y su tick por minuto —
  la gracia de promoción es de 2 min. El tick general de 5 min sigue corriendo
  el mismo `Process` como respaldo.
- Mantener `FIRESTORE_DATABASE_ID` vacío. No se requiere migración SQL nueva.

Las ofertas Firestore son recuperables e idempotentes; los pushes FCM son
best-effort, no exactly-once: un fallo o caída tras crear una oferta puede
dejarla sin push. La aceptación sigue siendo transaccional en SQL. Las tareas
perdidas, la latencia real de Cloud Run y el cierre eventual de ofertas tras
aceptar/cancelar deben verificarse en el entorno desplegado.

La integración local de despacho se ejecuta únicamente contra una base
descartable llamada `rundi_test` en localhost, con migraciones `0001`–`0008`,
y el emulador Firestore local:

```sh
RUN_LOCAL_DISPATCH_INTEGRATION=1 TEST_DATABASE_URL='postgres://.../rundi_test' \
FIRESTORE_EMULATOR_HOST=127.0.0.1:19033 \
go test ./cmd/consumer -run TestDispatchRecoveryIntegration -count=1
```

## Pendiente (próximas fases)

- [ ] Endpoints restantes: pricing cálculo, designated-crew, ratings,
      compliance, admin, matching/drivers eligibles.
- [ ] Activación inmediata de proyecciones para otros comandos, cuando se
      justifique; los comandos de viaje indicados arriba ya despiertan el job.
- [ ] Validar las tareas y sus permisos en el entorno desplegado.
- [ ] FCM: resolver tokens desde DATA-MAIN_users/fcmTokens y depurar inválidos.
- [ ] Tests de integración con emuladores: idempotencia outbox, reglas
      Firestore, flujo completo request→accept→complete→confirm-cash.
- [ ] Deploy config (Cloud Run, jobs, triggers Scheduler/Tasks) — **sin
      desplegar hasta autorización**.
