# Callable Auth Hardening — Diseño

## Objetivo

Corregir el error `FirebaseError: unauthenticated` al crear el código de seguimiento compartido y localizar otros callables que puedan sufrir la misma carrera entre restauración de sesión e invocación. Mantener las verificaciones de identidad y autorización del backend, la opción de invocar funciones públicas y el comportamiento flexible de sesiones autenticadas/no autenticadas donde corresponda.

## Contexto confirmado

- `createRideShareToken` exige `context.auth` y además comprueba que quien llama sea cliente o conductor participante del viaje. Estas barreras son correctas y no deben eliminarse.
- `RideTrackingScreenNewDesign.tsx` captura el error y actualmente construye como fallback un enlace con el `rideId` real. Esto evita el fallo de compartir, pero expone un identificador que el diseño de códigos temporales pretende no divulgar.
- `getFirebaseFunctions()` espera la inicialización de Firebase, pero no espera explícitamente a que Firebase Auth termine de restaurar su estado persistido. El estado de usuario de la app también puede cargarse desde AsyncStorage, por lo que no debe asumirse que dicho estado implica que Functions ya recibirá un token.
- Hay 39 archivos de Functions con referencias a `unauthenticated` o `context.auth`; parte de ellos contienen funciones administrativas, helpers o varias funciones dentro de un archivo. Se requiere inventariar callables exportados e invocadores reales antes de aplicar cambios transversales.
- El árbol ya contiene cambios del usuario, incluido `RideTrackingScreenNewDesign.tsx` y múltiples archivos no relacionados. Se preservarán; no se revertirá ni se incluirá en un commit ningún cambio preexistente.

## Diseño

### 1. Inicialización de Auth sin imponer login

Esperar a que Firebase Auth haya resuelto su estado persistido antes de entregar los servicios Firebase a las invocaciones de Functions. Esta espera solo sincroniza la inicialización: no inicia sesión, no fuerza una renovación global del token, no convierte funciones públicas en privadas y no bloquea el uso de Firebase cuando el resultado legítimo es `currentUser === null`.

La revisión de invocadores determinará qué callables requieren usuario y si necesitan una espera autenticada explícita en el cliente. La decisión de exigir identidad seguirá residiendo en el backend de cada operación protegida.

### 2. Compartición segura del viaje

La pantalla solo creará el enlace de seguimiento si obtiene correctamente el código temporal. Ante falta de sesión, error de red u otro fallo, informará que no se pudo preparar el enlace y permitirá reintentar; no construirá un enlace alternativo con `rideId` ni degradará los controles de participación de la callable.

### 3. Auditoría de las demás Functions

Construir una matriz de funciones callable exportadas que rechazan usuarios sin autenticación, sus clientes/invocadores y su expectativa de sesión (protegida, pública/opcional, trigger/administrativa). Corregir solo los flujos cliente donde la invocación pueda adelantarse a la restauración de Auth o donde se use un estado de app como sustituto de una sesión Firebase. No cambiar la política de autenticación de las funciones sin requisito funcional y análisis de seguridad específico.

No se consideran candidatas a reparación cliente las HTTP endpoints, triggers, tareas programadas o funciones administrativas que no sean invocadas desde una sesión normal de la app; se documentarán por separado cuando compartan el mismo mensaje o helper de autenticación.

## Errores y flexibilidad

- Las funciones protegidas continúan fallando de forma segura si el usuario no inició sesión o el token no es válido.
- Los errores de autorización (`permission-denied`) no se traducen como errores de sesión ni activan fallbacks menos seguros.
- Las funciones públicas continúan invocables sin sesión.
- La pantalla de compartir comunica el fallo y ofrece reintento, sin divulgar IDs internos del viaje.

## Verificación y criterios de aceptación

1. Una prueba/chequeo demuestra que la inicialización espera a que Auth resuelva el estado persistido antes de devolver servicios para invocaciones.
2. Un usuario autenticado puede llamar `createRideShareToken`; un usuario anónimo sigue recibiendo `unauthenticated`, y un usuario ajeno al viaje sigue recibiendo `permission-denied`.
3. Si la creación del código falla, el enlace compartido no contiene `rideId` y se muestra un error recuperable.
4. Las funciones públicas auditadas siguen funcionando sin usuario autenticado.
5. El inventario distingue callables protegidas y no callable/non-client invokers, y las correcciones quedan limitadas a call sites con riesgo comprobado.
6. Typecheck, lint y pruebas relevantes pasan; cualquier error preexistente o externo al cambio queda identificado y no se modifica incidentalmente.

## Límites

- No debilitar autenticación, autorización por participante, reglas de base de datos ni controles de sesión.
- No cambiar todas las Functions protegidas a endpoints públicos ni introducir credenciales/tokens en parámetros de payload.
- No realizar despliegues Firebase ni cambios de configuración remota.
- No alterar cambios no relacionados presentes en el working tree.
