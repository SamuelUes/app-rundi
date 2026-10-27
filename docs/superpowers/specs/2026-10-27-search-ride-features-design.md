# Search Ride: selector de features y resumen Pro Max

## Objetivo

Rediseñar el selector de servicio y el resumen de `SearchRideScreen` con la dirección Pro Max elegida. El cliente puede revisar y controlar las features asignadas al servicio elegido, entender el efecto en la tarifa y conservar a la vista la distancia y duración estimadas.

## Contexto actual

- `SearchRideVehicleOptions` muestra los servicios disponibles y un resumen de `featureCodes` recibido del cálculo actual. Esos códigos describen ajustes aplicados, no el catálogo de opciones asignadas a cada servicio.
- `SearchRideSummary` contiene distancia, tiempo, precio, pago, precio sugerido, comentario y disponibilidad. La propuesta Pro Max debe resaltar precio y pago, pero también presentar distancia y tiempo con suficiente espacio para que no se trunquen.
- `servicesService.listServices()` llama a la callable `getServices` y actualmente normaliza solo campos básicos del servicio.
- En Supabase existen `features` y `service_feature_assignments`. Las features incluyen código, descripción, estado, ventanas temporales, tipo/valor de precio, prioridad, capacidad de acumulación y metadata. La asignación contiene estado y configuración.
- El catálogo actual incluye `night` (multiplicador 1.1, de 22:00 a 04:00, asignado a los servicios activos del catálogo consultado) y `designated_driver_moto_discount` (descuento de C$70, asignado a conductor designado en moto).
- El precio vigente aplica estas reglas automáticamente. El catálogo de features y los ajustes calculados son datos distintos y no deben confundirse.

## Diseño aprobado

### Selector de servicio

- Mantener la lista vertical de servicios y la tarjeta expandida para el servicio seleccionado.
- En la tarjeta expandida, presentar las features asignadas al servicio en un carrusel horizontal nativo. El carrusel desplaza solo sus elementos; no debe provocar desplazamiento horizontal de toda la pantalla.
- Usar tarjetas compactas con nombre localizado, indicador de estado e impacto de precio (porcentaje, cantidad o condición temporal disponibles en el catálogo).
- Ordenar las activas a la izquierda y las desactivadas a la derecha.
- Mantener suficiente área táctil para cambiar de estado, anunciar el estado con accesibilidad y dejar un fragmento de la siguiente tarjeta visible para comunicar que la fila se desplaza.
- El carrusel debe aceptar una familia de iconos configurable (`Ionicons` o `MaterialIcons`). Corregir la implementación actual de `RideIcon`, cuya rama MaterialIcons se invoca recursivamente.

### Estados y condiciones de las features

- Mostrar únicamente features globalmente habilitadas y asignadas al servicio seleccionado.
- Inicializar cada feature con el comportamiento tarifario existente cuando sus condiciones aplican. La selección del cliente puede desactivarla manualmente.
- Mantener visible `night` fuera de su ventana aplicable, en el grupo de desactivadas a la derecha, con su horario de vigencia. En ese estado no se puede activar. Durante la ventana válida puede activarse o desactivarse.
- El descuento para conductor designado en moto se ofrece solo si ese servicio/modo está seleccionado y sus condiciones están vigentes. Inicia activo de acuerdo con la regla actual, pero se puede desactivar manualmente.
- Una feature que pasa a estar fuera de condición no puede permanecer activa ni alterar el precio. Las modificaciones de servicio, modo de conductor designado y horario recalculan elegibilidad y precio.
- Preservar los cambios manuales durante la sesión mientras el servicio siga en el flujo de solicitud. Las features no aplicables no deben enviarse como seleccionadas.

### Resumen Pro Max

- Presentar distancia y duración estimadas explícitamente como métricas de ruta, en una fila dedicada con unidades: por ejemplo, `3.3 km` y `13 min`. Ninguna debe truncarse para dar espacio al texto de disponibilidad.
- Mostrar la disponibilidad de conductores aparte de las métricas de ruta, con indicador semántico y texto truncado solo si no cabe.
- Destacar el estimado recalculado y el método de pago seleccionado en un bloque compacto.
- Mantener precio sugerido y comentario como filas editables opcionales, conservando sus nombres, orden y callbacks actuales.
- Mantener visible el precio del servicio en su fila para comparar opciones. Evitar que resumen y selector presenten importes contradictorios.
- Mantener el tema actual de la app y los patrones nativos; no introducir otra librería de UI.

## Datos y flujo de precio

1. Extender el resultado de `getServices` para incluir las features activas asignadas a cada servicio, junto con los datos de presentación y de elegibilidad necesarios. `servicesService` normaliza esa forma para la pantalla.
2. Derivar la selección inicial del comportamiento existente del backend. Mantener overrides manuales locales por servicio mientras el formulario permanece activo.
3. Enviar los códigos seleccionados en cada solicitud de cálculo y en la solicitud final del viaje.
4. Calcular de nuevo el precio cuando cambie servicio/modo, horario aplicable o selección de features; reflejar el total en el selector y el resumen.
5. El backend valida cada código contra el servicio, asignación, estado global y condiciones horarias vigentes. No confía en importes, multiplicadores ni elegibilidad enviados por el cliente. La tarifa y su snapshot se generan en el servidor.
6. Si falla la carga del catálogo, mantener los servicios y permitir el flujo compatible con las reglas existentes; no presentar como elegible una feature cuya asignación no se pudo verificar.

No se propone una migración de esquema inicialmente. Las tablas actuales contienen relaciones y reglas suficientes; la selección del cliente es estado de la solicitud. Solo se reconsiderará un campo de persistencia si el backend no puede representar con seguridad un override sin alterar el modelo existente.

## Estados de interfaz y accesibilidad

- Cargando catálogo: mantener la lista de servicios y un estado breve en la sección de features.
- Servicio sin features asignadas: no mostrar un carrusel vacío.
- Feature no elegible por horario/servicio: mostrarla en el extremo derecho como desactivada, con una explicación concisa.
- Recalcular precio: indicar progreso sin bloquear la navegación entre servicios.
- Error de recálculo: conservar la selección visible, marcar que el precio está pendiente/no actualizado y evitar tratarlo como cotización confirmada.
- Cada opción informa nombre, estado, precio/condición y disponibilidad en sus etiquetas accesibles.
- Controles de selección y campos editables mantienen objetivos táctiles de al menos 44 puntos y se verifican con texto ampliado.

## Pruebas y criterios de aceptación

- El catálogo muestra solo features asignadas y activas para cada servicio; servicios sin asignaciones no renderizan un carrusel vacío.
- El servicio seleccionado abre el carrusel horizontal; el gesto horizontal no desplaza la página completa.
- Los elementos activos preceden a los apagados; `night` se bloquea fuera de horario y puede activarse/desactivarse dentro de horario.
- El descuento de conductor designado moto aparece solo para la combinación válida y su override recalcula la tarifa.
- Cambiar servicio, modo u horario produce una selección coherente y nunca envía features no asignadas o no elegibles.
- El backend rechaza/recalcula selecciones manipuladas y el precio persistido coincide con el cálculo validado en servidor.
- Resumen: kilómetros y minutos siguen visibles, disponibilidad se presenta de forma independiente, y el precio del resumen coincide con el del servicio seleccionado.
- Cambiar la familia de iconos no causa recursión ni pierde glifos: verificar Ionicons y MaterialIcons.
- Ejecutar typecheck, tests de pricing/backend pertinentes y pruebas de componentes disponibles. Probar el panel en ancho móvil pequeño y con texto ampliado.

## Fuera de alcance

- Crear nuevas features comerciales o asignaciones que no existan en la base de datos.
- Cambiar la fórmula de comisión, política de pago o la navegación principal de la pantalla.
- Persistir las preferencias manuales entre sesiones o usuarios.
