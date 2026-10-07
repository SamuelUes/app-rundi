# Entorno local integrado — Diseño

## Objetivo

Agregar un comando opt-in para levantar la base de datos y Storage de Supabase localmente, Firebase Emulator Suite y Expo, de modo que el Frontend de simuladores pueda usar servicios locales sin cambiar el comportamiento de los comandos de desarrollo existentes ni depender de endpoints serverless desplegados.

## Contexto confirmado

- `Frontend/package.json` tiene `start:dev`, que cambia `Frontend/.env` a `.env.development` y arranca Expo. Se debe conservar sin cambios de comportamiento.
- `Frontend/src/config/backendConfig.ts` soporta los modos Firebase y NestJS local; `USE_FIREBASE_EMULATORS` activa los emuladores. El cliente Axios y `useCalls` también construyen URLs HTTP directas desde `API_BASE_URL_FIREBASE`/`PLATFORM_API_BASE_URL`; conectar los SDKs a los emuladores no redirige esas peticiones automáticamente.
- `Frontend/src/config/firebase.ts` conecta Firebase Auth/Firestore/Realtime Database/Functions a puertos que actualmente no coinciden con `firebase.json` para Firestore y RTDB.
- `Frontend/src/config/supabase.ts` crea el cliente usando variables de entorno y `Frontend/src/services/supabaseStorage.ts` obtiene un JWT con la callable Firebase `getSupabaseJwt` antes de cargar archivos. El login telefónico usa además el SDK nativo `@react-native-firebase/auth`, que debe apuntar al mismo Auth Emulator.
- `functions/src/api/auth.ts` acepta `SUPABASE_JWT_SECRET` para firmar ese JWT. Las Functions también usan variables de configuración de Supabase, por lo que su entorno local debe apuntar al stack local.
- `supabase/config.toml` y cuatro migraciones ya existen, pero `.gitignore` los oculta; la configuración existente usa `project_id = "rundi"` y Postgres 15. Se preservarán, auditando especialmente la migración inicial antes de aplicarla. `database/supabase-only.sql` es la fuente de referencia; no se reemplazará ni se creará una segunda migración baseline.
- Docker ya tiene las imágenes `supabase/storage-api` y `supabase/postgres` descargadas, según la captura proporcionada. El CLI puede requerir descargar otras imágenes para los servicios de Supabase.
- La CLI Firebase instalada es `15.24.0`; Firebase Emulator Suite requiere Java 21 o superior, mientras que la versión activa local es Java 17. El comando debe detectarlo y explicar el requisito sin cambiar el JDK global.

## Diseño

### 1. Comando local separado

Agregar `npm run start:local` a `Frontend/package.json` y un script coordinador local en el repositorio. Desde una sola invocación, el coordinador:

1. Verifica Docker (instalado e iniciado), las CLI de Supabase/Firebase y Java 21+; si falta un requisito o Java está por debajo de 21, explica cómo resolverlo sin modificar configuración del sistema automáticamente.
2. Crea o valida una red Docker dedicada (`rundi-local-loopback`) con `com.docker.network.bridge.host_binding_ipv4=127.0.0.1` y arranca Supabase con esa red. Postgres y Storage serán locales; Studio quedará disponible en loopback; ningún puerto Supabase se publicará en la LAN.
3. Aplica la migración local versionada y la configuración de Storage necesaria para los buckets que consume el Frontend, preservando RLS/policies existentes.
4. Inicia Firebase Emulator Suite con los emuladores necesarios para Auth, Firestore, Realtime Database y Functions, usando puertos consistentes con `firebase.json`.
5. Lanza Expo en modo desarrollo con una configuración local de mayor precedencia que `.env`, sin copiar ni reescribir `.env` o `.env.development`.
6. `stop:docker` detiene solo los contenedores Supabase de este proyecto; `stop:firebase` termina solo el Firebase Emulator iniciado por este runner; `stop:all` hace ambas cosas. Ctrl-C ejecuta el mismo cleanup. Ningún comando apaga Docker Desktop, detiene otros proyectos ni borra volúmenes/datos.

El comando será explícitamente local y opt-in; `start`, `start:dev`, `start:prod` y sus archivos de entorno existentes mantendrán su función actual.

### 2. Configuración aislada por entorno

- Añadir los archivos de configuración local necesarios para Supabase CLI y Firebase Emulator.
- La configuración local compartida (Supabase CLI y runner) no contendrá credenciales de producción. Los valores generados por Supabase (URL, anon key, service-role key y JWT secret) se obtendrán del CLI y se inyectarán solo en los procesos locales correspondientes, sin guardarlos en el bundle del Frontend ni en archivos versionados.
- Expo usará la URL local de Supabase y la anon key local. Para los simuladores iOS usará loopback; en el emulador estándar de Android resolverá loopback al host especial `10.0.2.2`. El Firebase JS SDK y el SDK nativo de Auth usarán `USE_FIREBASE_EMULATORS=true` y la misma resolución de host por plataforma.
- El proceso de Firebase Functions Emulator usará la URL local de Supabase y un service-role key/JWT secret locales. Nunca se pasarán claves privilegiadas al bundle del Frontend.
- La función `getSupabaseJwt` se ejecutará desde Firebase Emulator y firmará JWTs aceptados por el Supabase local. Las peticiones de la app no llamarán a Cloud Functions desplegadas.
- Ajustar los puertos de conexión del Frontend para coincidir con `firebase.json`; no cambiar los puertos existentes de `firebase.json` salvo que haya una razón técnica verificada.
- Redirigir también las llamadas HTTP directas (cliente Axios y endpoints de `useCalls`) al URL de Functions Emulator `http://<host>:5001/rundi-dev/us-central1`; el emulador usará el proyecto Firebase local `rundi-dev`. No basta con conectar `httpsCallable` al emulador.
- El runner registra la identidad del proceso/grupo Firebase Emulator en estado local ignorado dentro de `Frontend/.expo`, para que `stop:firebase` solo termine la instancia que inició este proyecto.

### 3. Esquema y Storage

- Revisar `database/supabase-only.sql` y la documentación/migraciones disponibles para identificar esquema, RLS, políticas y buckets necesarios.
- Auditar y validar las migraciones locales existentes contra el esquema fuente. No crear un segundo baseline ni modificar `database/supabase-only.sql`; aplicar correcciones mínimas a la migración existente solo si la ejecución local demuestra errores, sin relajar RLS ni tocar el proyecto remoto.
- Configurar los buckets locales referenciados por las funciones del Frontend y conservar sus políticas de acceso. Si no hay una política segura que permita el flujo local autenticado, detenerse y documentar el impedimento en vez de abrir el bucket a acceso anónimo.
- El estado local se conserva entre reinicios; un reset destructivo de la base de datos no forma parte del comando de arranque.

## Límites

- No cambiar arquitectura ni reemplazar el modo Firebase/NestJS ya existente.
- No modificar datos ni configuración del proyecto Supabase remoto.
- No habilitar conexiones desde teléfonos físicos/LAN en esta primera versión; el alcance son simuladores/emuladores en la máquina de desarrollo.
- No automatizar la instalación de Docker Desktop ni alterar variables globales del sistema.
- No prometer que todo el backend de producción está emulado: solo las dependencias invocadas por la app en el flujo cubierto se deben redirigir localmente; cualquier integración externa no emulada debe quedar identificada en la guía de uso.

## Verificación y criterios de aceptación

1. El comando local falla de forma clara y segura cuando Docker/CLI no están disponibles, sin cambiar `.env`.
2. Con Docker y CLI disponibles, una sola invocación inicia Supabase local, Firebase Emulator y Expo; la salida indica URLs y puertos locales útiles.
3. El Frontend conserva el modo Firebase de desarrollo existente y, al usar el nuevo comando, conecta sus clientes a Firebase Emulator y Supabase local.
4. La app puede autenticarse contra Auth Emulator, invocar `getSupabaseJwt` contra Functions Emulator y cargar/consultar datos o archivos locales conforme a las políticas existentes.
5. Las conexiones de Firestore/Realtime Database usan exactamente los puertos configurados en `firebase.json`.
6. Ctrl-C termina los procesos iniciados, mantiene los datos locales y no deja emuladores huérfanos.
7. Una verificación de configuración demuestra que ningún endpoint de Firebase/Supabase remoto ni credencial privilegiada se inserta en el Frontend durante el modo local.
8. Los comandos de desarrollo actuales y el contenido de los archivos `.env` existentes no se alteran.
9. Los puertos publicados por Supabase solo tienen `HostIp=127.0.0.1`; `stop:docker`, `stop:firebase` y `stop:all` no afectan servicios ajenos ni eliminan volúmenes.
