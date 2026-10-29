/**
 * Namespace `common` del locale `es`.
 * Extraído desde `src/i18n/index.ts` (`es.translation.common`).
 */
const common = {
        actions: {
          accept: 'Aceptar',
          cancel: 'Cancelar',
          save: 'Guardar',
          continue: 'Continuar',
          back: 'Atrás',
          close: 'Cerrar',
          confirm: 'Confirmar',
          delete: 'Eliminar',
          edit: 'Editar',
          next: 'Siguiente',
          previous: 'Anterior',
          search: 'Buscar',
          submit: 'Enviar',
          tryAgain: 'Intentar de nuevo',
          start: 'Iniciar',
          stop: 'Detener',
          yes: 'Sí',
          no: 'No',
        },
        datePicker: {
          selectYear: 'Selecciona el año',
        },
        mapPins: {
          origin: 'Origen',
          destination: 'Destino',
          extraStop: 'Parada {{index}}',
        },
        components: {
          camera: {
            unavailableTitle: 'Cámara no disponible',
            unavailableMessage:
              'Este dispositivo no tiene cámara disponible. Puedes elegir una foto de la galería.',
            useGallery: 'Usar galería',
          },
          termsModal: {
            title: 'Términos y condiciones',
            version: 'Versión {{version}}',
            selectorLabel: 'Seleccionar documento',
            body: 'Al usar esta aplicación, aceptas nuestros términos y condiciones.',
            documents: {
              general: {
                label: 'Términos generales',
                version: 'Versión {{version}}',
                body:
                  'PLATAFORMA DE MOVILIDAD RUNDI\n' +
                  'Fecha de vigencia: 24/03/26\n\n' +
                  'I. DEFINICIONES\n' +
                  'Para efectos de estos Términos y Condiciones, se entenderá por:\n' +
                  '• "Rundi" / "Plataforma" / "Nosotros": GrupoRZC, persona natural con RUC 0010205740009M, propietaria de la aplicación móvil denominada "Rundi", que actúa como intermediario tecnológico entre Usuarios y Conductores.\n' +
                  '• "Conductor" / "Usted": Persona natural que se registra en la Plataforma para ofrecer servicios de transporte a Usuarios.\n' +
                  '• "Usuario": Persona que solicita servicios de transporte a través de la Plataforma.\n' +
                  '• "Servicios": Los servicios de transporte terrestre de pasajeros que el Conductor ofrece a los Usuarios.\n' +
                  '• "Comisión": El monto que el Conductor paga a Rundi por el uso de la Plataforma por cada viaje completado.\n' +
                  '• "Tarifa del Viaje": El precio acordado directamente entre el Usuario y el Conductor por los Servicios de transporte.\n\n' +
                  'II. NATURALEZA DE LA RELACIÓN\n' +
                  '2.1. Rundi es una aplicación tecnológica. Rundi no proporciona servicios de transporte. Nuestra función es conectar a Usuarios que necesitan transporte con Conductores independientes que ofrecen dichos servicios.\n' +
                  '2.2. Relación independiente. La relación entre Rundi y el Conductor es de naturaleza mercantil independiente. Nada en estos Términos crea una relación de empleo, sociedad, franquicia, o agencia entre Rundi y el Conductor.\n' +
                  '2.3. Autonomía del Conductor. Usted, como Conductor:\n' +
                  '• Es libre de aceptar o rechazar cualquier solicitud de viaje.\n' +
                  '• Fija el precio de sus Servicios mediante negociación directa con el Usuario.\n' +
                  '• Establece su propio horario de trabajo.\n' +
                  '• Utiliza su propio vehículo y asume los costos operativos del mismo.\n\n' +
                  'III. REGISTRO Y REQUISITOS DEL CONDUCTOR\n' +
                  '3.1. Requisitos de afiliación. Para registrarse como Conductor en la Plataforma, debe cumplir con los siguientes requisitos:\n' +
                  'Requisito\tDescripción\n' +
                  'Edad\tSer mayor de 18 años.\n' +
                  'Licencia de conducir\tPoseer licencia de conducir vigente (categoría 3,1,2 o superior).\n' +
                  'Vehículo\tSer propietario o tener autorización legal para operar un vehículo en buen estado mecánico y con seguro vigente.\n' +
                  'Documentación\tPresentar: copia de cédula de identidad, licencia de conducir, tarjeta de circulación, seguro del vehículo, récord de policía limpio.\n' +
                  'Verificación\tSometerse al proceso de verificación documental y de identidad que Rundi establezca.\n' +
                  '3.2. Actualización de información. El Conductor se obliga a mantener actualizada su información y documentación en la Plataforma.\n' +
                  '3.3. Verificación de antecedentes. Rundi se reserva el derecho de realizar verificaciones de antecedentes policiales y de conducción de los solicitantes.\n\n' +
                  'IV. COMISIONES Y MÉTODOS DE PAGO\n' +
                  '4.1. Estructura de comisiones. Por el uso de la Plataforma, Rundi cobrará al Conductor una comisión por cada viaje completado.\n' +
                  'Concepto\tDetalle\n' +
                  'Comisión por viaje\t15% viajes carro, 7,5% viajes motos, 25% conductor designado carro, 12,5% conductor designado moto\n' +
                  'Forma de cobro\tSaldo en cuenta Rundi, tarjeta de crédito/débito, o puntos de recarga autorizados\n' +
                  'Momento del cargo\tAl finalizar el viaje o cuando el Conductor confirma la llegada al punto de origen\n' +
                  '4.2. Modificación de comisiones. Rundi se reserva el derecho de modificar el porcentaje de comisión. Cualquier cambio será notificado al Conductor con al menos 7 días de antelación a través de la Plataforma. El uso continuado de la Plataforma después de la modificación constituirá aceptación de la nueva comisión.\n' +
                  '4.3. Recargas de saldo. El Conductor podrá recargar saldo en su cuenta Rundi a través de:\n' +
                  '• Tarjetas de crédito o débito\n' +
                  '• Transferencias bancarias\n' +
                  '• Puntos de recarga autorizados (Super Express, AM PM, entre otros)\n' +
                  '4.4. Saldo negativo. Si el saldo en cuenta del Conductor es insuficiente para cubrir la comisión, su acceso a la Plataforma será restringido hasta que regularice su situación. Los saldos negativos deberán ser pagados dentro de los 2 días siguientes a la notificación.\n' +
                  '4.5. Devoluciones. En caso de cancelación del viaje por parte del Usuario antes del inicio, la comisión no será cargada. Si el cargo ya fue realizado, será reembolsado en un plazo máximo de 3 días.\n\n' +
                  'V. FACTURACIÓN Y OBLIGACIONES FISCALES\n' +
                  '5.1. Facturación de comisiones. Rundi emitirá factura electrónica por el monto de las comisiones cobradas al Conductor. La factura desglosará el IVA correspondiente (15%) conforme a la Ley de Concertación Tributaria de Nicaragua.\n' +
                  '5.2. Responsabilidad fiscal del Conductor. EL CONDUCTOR ES EL ÚNICO RESPONSABLE ANTE LAS AUTORIDADES TRIBUTARIAS POR LOS INGRESOS OBTENIDOS DE SUS SERVICIOS DE TRANSPORTE.\n' +
                  'Rundi no retiene ni paga impuestos en nombre del Conductor. El Conductor reconoce que:\n' +
                  '• Los pagos que recibe de los Usuarios constituyen rentas gravadas por la Ley 822.\n' +
                  '• Es su obligación inscribirse en la Dirección General de Ingresos (DGI) si sus ingresos superan los límites establecidos por la ley.\n' +
                  '• Debe cumplir con todas las obligaciones tributarias municipales y nacionales aplicables a su actividad económica.\n' +
                  '5.3. Aviso legal. Rundi recomienda al Conductor consultar sobre sus obligaciones fiscales. La falta de cumplimiento de dichas obligaciones es responsabilidad exclusiva del Conductor.\n\n' +
                  'VI. OPERACIÓN DEL SERVICIO\n' +
                  '6.1. Proceso del viaje. El proceso de cada viaje será el siguiente:\n' +
                  'Paso\tDescripción\n' +
                  '1\tEl Usuario publica su solicitud de viaje y ofrece un precio.\n' +
                  '2\tEl Conductor visualiza la solicitud y puede aceptar, contraofertar o rechazar.\n' +
                  '3\tSi hay acuerdo, se forma un contrato directo entre Usuario y Conductor.\n' +
                  '4\tEl Conductor se dirige al punto de recogida.\n' +
                  '5\tAl llegar, confirma su presencia a través de la app.\n' +
                  '6\tRealiza el servicio de transporte.\n' +
                  '7\tAl finalizar, la comisión se carga al Conductor.\n' +
                  '6.2. Prohibiciones. El Conductor no podrá:\n' +
                  '• Solicitar pagos adicionales fuera de la tarifa acordada en la Plataforma.\n' +
                  '• Permitir que terceros utilicen su cuenta o realicen viajes en su nombre.\n' +
                  '• Prestar servicios bajo los efectos de alcohol, drogas o fatiga.\n' +
                  '• Discriminar a Usuarios por cualquier motivo.\n\n' +
                  'VII. SEGURIDAD Y RESPONSABILIDAD\n' +
                  '7.1. Seguridad de la Plataforma. Rundi implementa medidas de seguridad razonables, incluyendo:\n' +
                  '• Verificación documental de Conductores.\n' +
                  '• Botón de pánico (SOS) para emergencias.\n' +
                  '• Compartición de datos de viaje con contactos de confianza.\n' +
                  '7.2. Limitación de responsabilidad. Rundi NO es responsable por:\n' +
                  '• Daños, accidentes o incidentes ocurridos durante la prestación de los Servicios.\n' +
                  '• Incumplimientos del Conductor respecto de sus obligaciones legales.\n' +
                  '7.3. Seguro. El Conductor debe mantener su vehículo asegurado conforme a la ley nicaragüense (seguro obligatorio de accidentes de tránsito - SOAT, y seguro voluntario si lo desea).\n\n' +
                  'VIII. SUSPENSIÓN Y TERMINACIÓN\n' +
                  '8.1. Causales de suspensión. Rundi podrá suspender temporalmente la cuenta del Conductor en caso de:\n' +
                  '• Bajo desempeño o altas tasas de cancelación.\n' +
                  '• Quejas de Usuarios debidamente verificadas.\n' +
                  '• Incumplimiento de cualquiera de estas disposiciones.\n' +
                  '• Saldo negativo no regularizado.\n' +
                  '8.2. Terminación definitiva. La cuenta será terminada definitivamente por:\n' +
                  '• Uso fraudulento de la Plataforma.\n' +
                  '• Suplantación de identidad.\n' +
                  '• Conductas que pongan en riesgo la seguridad de Usuarios.\n' +
                  '• Incumplimiento grave de la ley nicaragüense.\n\n' +
                  'IX. DISPOSICIONES FINALES\n' +
                  '9.1. Modificaciones. Rundi podrá modificar estos Términos en cualquier momento. Las modificaciones serán notificadas a través de la Plataforma y se considerarán aceptadas si el Conductor continúa usando la app después de 7 días de la notificación.\n' +
                  '9.2. Ley aplicable. Estos Términos se rigen por las leyes de la República de Nicaragua. Cualquier controversia será sometida a los tribunales competentes de la ciudad de Managua.\n' +
                  '9.3. Contacto. Para consultas, el Conductor puede contactar a Rundi a través de:\n' +
                  '• Correo electrónico: support@gruporzc.com\n' +
                  '• Soporte en la aplicación\n\n' +
                  '________________________________________\n' +
                  'DECLARACIÓN DEL CONDUCTOR\n' +
                  'Al registrarme en la Plataforma Rundi, declaro que:\n' +
                  '1. He leído y comprendido estos Términos y Condiciones.\n' +
                  '2. Acepto pagar las comisiones establecidas por el uso de la Plataforma.\n' +
                  '3. Reconozco que soy un contratista independiente y no un empleado de Rundi.\n' +
                  '4. Asumo la responsabilidad exclusiva de cumplir con mis obligaciones fiscales ante la DGI y las Alcaldías.\n' +
                  '5. Me comprometo a prestar mis servicios de transporte cumpliendo con todas las leyes aplicables.\n' +
                  '________________________________________\n' +
                  'Recomendaciones adicionales\n' +
                  '1. Mecanismo de cobro de comisiones: Al igual que inDrive en Nicaragua, puede utilizar el sistema de recargas prepago. Los conductores depositan saldo en puntos autorizados (Super Express, AM PM, etc.) o mediante transferencia bancaria, y usted descuenta la comisión de ese saldo.\n' +
                  '2. Aviso visible en la app: Agregue un mensaje claro en la pantalla de registro de conductores que indique su responsabilidad fiscal. Por ejemplo:\n' +
                  '"Rundi es una plataforma tecnológica que facilita la conexión entre Usuarios y Conductores independientes. Usted, como Conductor, es responsable de cumplir con sus obligaciones tributarias (DGI y Alcaldías) por los ingresos obtenidos a través de sus servicios de transporte."\n' +
                  '3. Documentación del modelo ante la DGI: Cuando presente su declaración de impuestos, asegúrese de que sus ingresos declarados correspondan exclusivamente a las comisiones cobradas a los conductores, no al valor total de los viajes. Guarde los reportes de viajes generados por la app como respaldo.',
              },
              users: {
                label: 'Términos para usuarios',
                version: 'Versión {{version}}',
                body:
                  'PLATAFORMA DE MOVILIDAD RUNDI\n' +
                  'Fecha de vigencia: 24/03/2026\n\n' +
                  'I. DEFINICIONES\n' +
                  '• “Rundi” / “Plataforma” / “Nosotros”: GrupoRZC, persona natural con 0010205740009M, propietaria de la aplicación móvil “Rundi”, que actúa como intermediario tecnológico entre Usuarios y Conductores (movilidad normal) o Conductores Designados.\n' +
                  '• “Usuario”: Persona que solicita servicios a través de la Plataforma, ya sea de movilidad normal o de conductor designado.\n' +
                  '• “Conductor”: Persona natural que utiliza su propio vehículo para prestar servicios de transporte a Usuarios a través de la Plataforma (servicio de movilidad normal).\n' +
                  '• “Conductor Designado”: Persona natural afiliada a Rundi que, a solicitud del Usuario, conduce el vehículo particular del Usuario para trasladarlo a su destino (servicio de conductor designado).\n' +
                  '• “Servicio”: Cualquiera de los servicios ofrecidos por la Plataforma, según sea seleccionado por el Usuario.\n' +
                  '• “Comisión”: El monto que el Conductor o Conductor Designado paga a Rundi por el uso de la Plataforma por cada servicio completado.\n\n' +
                  'II. NATURALEZA DE LA PLATAFORMA\n' +
                  '2.1. Rundi es una plataforma de tecnología que conecta a Usuarios con Conductores o Conductores Designados independientes. No prestamos servicios de transporte ni de conducción. Nuestra única función es facilitar la conexión entre las partes.\n' +
                  '2.2. Los Conductores y Conductores Designados son contratistas independientes, no empleados de Rundi. Cada uno es el único responsable de la prestación de sus servicios.\n\n' +
                  'III. SERVICIOS OFRECIDOS\n' +
                  '3.1. Servicio de movilidad standar (Rundi Móvil):\n' +
                  'El Usuario solicita un viaje y es trasladado por un Conductor que utiliza su propio vehículo. La tarifa se acuerda directamente entre el Usuario y el Conductor a través de la Plataforma. Rundi cobra una comisión al Conductor por el uso de la aplicación.\n' +
                  '3.2. Servicio de conductor designado (Rundi Designado):\n' +
                  'El Usuario solicita que un Conductor Designado se desplace al lugar donde se encuentra el vehículo del Usuario, realice una inspección, y luego conduzca dicho vehículo hasta el destino indicado por el Usuario. El servicio está pensado para Usuarios que por razones de salud, fatiga o consumo de alcohol no pueden conducir.\n\n' +
                  'IV. PROCESO DEL SERVICIO DE CONDUCTOR DESIGNADO\n' +
                  '4.1. Solicitud:\n' +
                  'El Usuario selecciona la opción “Rundi Designado” en la aplicación, indica su ubicación y el destino al que desea ser trasladado.\n' +
                  '4.2. Llegada del Conductor Designado:\n' +
                  'El Conductor Designado acude al lugar indicado en su propio vehículo (medio de traslado) y se presenta ante el Usuario.\n' +
                  '4.3. Inspección del vehículo del Usuario:\n' +
                  'Antes de iniciar la conducción, el Conductor Designado realizará una inspección visual del vehículo del Usuario, con la presencia de éste, y documentará el estado del mismo mediante:\n' +
                  '• Fotografías del exterior e interior del vehículo (neumáticos, carrocería, parabrisas, tablero, asientos, etc.).\n' +
                  '• Acta de inspección que será generada en la aplicación y firmada digitalmente por ambas partes (el Usuario acepta las condiciones en la app).\n' +
                  '4.4. Traslado:\n' +
                  'Una vez finalizada la inspección y obtenida la aceptación del Usuario, el Conductor Designado conduce el vehículo del Usuario hasta el destino acordado.\n' +
                  '4.5. Finalización:\n' +
                  'Al llegar al destino, el Conductor Designado estaciona el vehículo en el lugar indicado por el Usuario, entrega las llaves y finaliza el servicio.\n' +
                  '4.6. Comisión:\n' +
                  'Rundi cobra al Conductor Designado una comisión por el servicio, cuyo porcentaje se establece en los términos aplicables a los conductores designados.\n\n' +
                  'V. RESPONSABILIDADES DEL USUARIO\n' +
                  '5.1. En ambos servicios:\n' +
                  '• El Usuario debe proporcionar información veraz sobre su ubicación y destino.\n' +
                  '• El Usuario se obliga a tratar con respeto a los Conductores y Conductores Designados.\n' +
                  '• El Usuario es responsable de cumplir con las leyes de tránsito cuando sea aplicable.\n' +
                  '5.2. En el servicio de conductor designado:\n' +
                  '• El Usuario declara y garantiza que es el propietario o tiene autorización legal para que un tercero conduzca el vehículo que pondrá a disposición del Conductor Designado.\n' +
                  '• El Usuario es responsable de que el vehículo se encuentre en condiciones mecánicas y legales para circular (revisión técnica, seguro obligatorio, tarjeta de circulación, etc.).\n' +
                  '• El Usuario acepta que el Conductor Designado realice la inspección y que, si durante la inspección se detectan condiciones inseguras (neumáticos lisos, luces defectuosas, fallas mecánicas evidentes, etc.), el Conductor Designado podrá rechazar el servicio sin responsabilidad para Rundi.\n' +
                  '• El Usuario asume que cualquier daño preexistente al vehículo que no haya sido documentado en la inspección inicial no será atribuible al Conductor Designado.\n\n' +
                  'VI. RESPONSABILIDADES DEL CONDUCTOR / CONDUCTOR DESIGNADO\n' +
                  'Las responsabilidades específicas de cada tipo de prestador se encuentran en los documentos de Términos y Condiciones correspondientes. En todo caso, Rundi no será responsable por:\n' +
                  '• La calidad, seguridad o cumplimiento de la normativa de tránsito por parte de los Conductores o Conductores Designados.\n' +
                  '• Daños, accidentes, multas o cualquier incidente ocurrido durante la prestación de los servicios.\n\n' +
                  'VII. PAGOS Y COMISIONES\n' +
                  '7.1. El pago del servicio se realiza directamente entre el Usuario y el Conductor / Conductor Designado, según lo acordado en la aplicación (efectivo, transferencia, etc.). Rundi no recibe ni maneja los pagos entre Usuarios y prestadores.\n' +
                  '7.2. El Conductor o Conductor Designado paga a Rundi una comisión por cada servicio completado, conforme a la estructura de comisiones vigente.\n' +
                  '7.3. En el servicio de conductor designado, el Usuario no paga comisión a Rundi; la comisión es pagada por el Conductor Designado con cargo a sus ingresos.\n\n' +
                  'VIII. LIMITACIÓN DE RESPONSABILIDAD DE RUNDI\n' +
                  '8.1. Rundi actúa únicamente como intermediario tecnológico. En consecuencia, no asumimos responsabilidad alguna por:\n' +
                  '• Accidentes de tránsito, daños a vehículos o lesiones personales ocurridas durante el servicio.\n' +
                  '• Incumplimiento de obligaciones fiscales, laborales o de seguridad social por parte de los Conductores o Conductores Designados.\n' +
                  '• Robos, hurtos o daños a pertenencias dentro del vehículo.\n' +
                  '• Multas de tránsito impuestas durante la conducción.\n' +
                  '8.2. En el servicio de conductor designado, el Usuario acepta que Rundi no es responsable por daños preexistentes al vehículo no documentados en la inspección inicial, ni por daños ocurridos durante la conducción, salvo que se demuestre dolo o negligencia grave del Conductor Designado mediante sentencia judicial firme.\n\n' +
                  'IX. DATOS PERSONALES Y PRIVACIDAD\n' +
                  '9.1. Rundi recopila y trata los datos personales de los Usuarios conforme a nuestra Política de Privacidad, disponible en la aplicación.\n' +
                  '9.2. En el servicio de conductor designado, el Usuario consiente que se tomen fotografías del vehículo y se generen actas que serán almacenadas en nuestros sistemas.\n\n' +
                  'X. MODIFICACIONES Y ACEPTACIÓN\n' +
                  '10.1. Rundi podrá modificar estos Términos en cualquier momento. Las modificaciones serán notificadas a través de la aplicación y se considerarán aceptadas si el Usuario continúa usando la Plataforma después de 7 días de la notificación.\n' +
                  '10.2. El registro y uso de la aplicación implica la aceptación íntegra de estos Términos y Condiciones.\n\n' +
                  'XI. LEY APLICABLE Y JURISDICCIÓN\n' +
                  'Estos Términos se rigen por las leyes de la República de Nicaragua. Cualquier controversia será sometida a los tribunales competentes de la ciudad de Managua.',
              },
              designated_driver: {
                label: 'Términos para conductor designado',
                version: 'Versión {{version}}',
                body:
                  'SERVICIO RUNDI DESIGNADO\n' +
                  'Fecha de vigencia: 24/03/2026\n\n' +
                  'I. DEFINICIONES\n' +
                  '• “Rundi” / “Plataforma” / “Nosotros”: GrupoRZC, persona natural con RUC 0010205740009M, propietaria de la aplicación móvil “Rundi”.\n' +
                  '• “Conductor Designado” / “Usted”: Persona natural que se registra en la Plataforma para prestar el servicio de conducción de vehículos de Usuarios.\n' +
                  '• “Usuario”: Persona que solicita el servicio de conductor designado a través de la aplicación.\n' +
                  '• “Vehículo del Usuario”: El automóvil particular que el Usuario pone a disposición para ser conducido por el Conductor Designado.\n' +
                  '• “Inspección”: Proceso de verificación visual y documental del estado del vehículo del Usuario, realizado por el Conductor Designado antes de iniciar la conducción.\n\n' +
                  'II. NATURALEZA DE LA RELACIÓN\n' +
                  '2.1. El Conductor Designado es un contratista independiente, no un empleado de Rundi. Usted decide libremente si acepta o rechaza solicitudes, establece su horario y utiliza su propio medio de traslado (vehículo propio) para desplazarse al punto de encuentro.\n' +
                  '2.2. Rundi no es responsable por la prestación del servicio de conducción, la cual es de exclusiva responsabilidad del Conductor Designado.\n\n' +
                  'III. REQUISITOS PARA SER CONDUCTOR DESIGNADO\n' +
                  'Para registrarse como Conductor Designado en Rundi, debe cumplir con:\n\n' +
                  'Requisito | Descripción\n' +
                  'Edad | Ser mayor de 21 años.\n' +
                  'Licencia | Poseer licencia de conducir vigente categoría 1,2,3 (o superior) con al menos 3 años de antigüedad.\n' +
                  'Documentación | Copia de cédula de identidad, licencia de conducir, récord de policía limpio (actualizado).\n' +
                  'Vehículo propio | Contar con un vehículo propio en buen estado (para trasladarse al lugar del Usuario).\n' +
                  'Seguro | El vehículo propio debe tener seguro obligatorio (SOA) al día.\n' +
                  'Curso | Aprobar el curso de inducción que Rundi imparta sobre procedimientos de inspección y conducción defensiva.\n\n' +
                  'IV. PROCESO DEL SERVICIO\n' +
                  '4.1. Aceptación:\n' +
                  'Al recibir una solicitud, el Conductor Designado puede aceptarla o rechazarla. Una vez aceptada, debe dirigirse al lugar indicado por el Usuario.\n' +
                  '4.2. Inspección obligatoria:\n' +
                  'Antes de iniciar la conducción del vehículo del Usuario, el Conductor Designado debe realizar la inspección conforme al procedimiento establecido por Rundi:\n' +
                  '• Tomar fotografías claras de:\n' +
                  'o Placas del vehículo.\n' +
                  'o Cuatro neumáticos (incluyendo dibujo y presión aparente).\n' +
                  'o Parabrisas y espejos.\n' +
                  'o Carrocería (frente, laterales, parte trasera).\n' +
                  'o Tablero (registro de kilometraje, testigos).\n' +
                  'o Interior (asientos, espejos, volante).\n' +
                  '• Llenar el acta de inspección en la aplicación, marcando cualquier novedad o daño preexistente.\n' +
                  '• Mostrar el acta al Usuario para su conformidad. El Usuario debe firmar digitalmente en la aplicación.\n' +
                  '4.3. Negativa a prestar el servicio:\n' +
                  'El Conductor Designado podrá rechazar el servicio sin penalización si:\n' +
                  '• El Usuario se niega a la inspección.\n' +
                  '• El vehículo presenta condiciones inseguras (neumáticos lisos, luces apagadas, fallas mecánicas evidentes, falta de seguro obligatorio, etc.).\n' +
                  '• El Usuario o el vehículo se encuentran bajo los efectos de alcohol o drogas (en cuyo caso deberá notificar a Rundi).\n' +
                  '4.4. Conducción:\n' +
                  'Una vez finalizada la inspección y obtenida la aceptación, el Conductor Designado conduce el vehículo del Usuario hasta el destino indicado, respetando las normas de tránsito.\n' +
                  '4.5. Entrega:\n' +
                  'Al llegar al destino, debe estacionar el vehículo en un lugar seguro y entregar las llaves al Usuario. Finalizar el servicio en la aplicación.\n\n' +
                  'V. COMISIONES Y FACTURACIÓN\n' +
                  '5.1. Estructura de comisiones:\n' +
                  'Por cada servicio completado, Rundi cobra al Conductor Designado una comisión del [25 ]% sobre el valor acordado con el Usuario. La comisión se carga al saldo que el Conductor Designado mantiene en la aplicación.\n' +
                  '5.2. Formas de pago de comisiones:\n' +
                  'El Conductor Designado debe mantener saldo suficiente mediante recargas en puntos autorizados (Super Express, AM PM, etc.) o transferencia bancaria. Si el saldo es insuficiente, la cuenta será suspendida hasta regularizarse.\n' +
                  '5.3. Facturación:\n' +
                  'Rundi emitirá factura electrónica por las comisiones cobradas, con el desglose del IVA (15%). El Conductor Designado es el único responsable de cumplir con sus obligaciones fiscales ante la DGI y la Alcaldía por los ingresos obtenidos.\n\n' +
                  'VI. OBLIGACIONES DEL CONDUCTOR DESIGNADO\n' +
                  '6.1. Conducir con prudencia y respetar todas las leyes de tránsito.\n' +
                  '6.2. No consumir alcohol, drogas ni ninguna sustancia que afecte sus capacidades durante el período en que esté disponible en la aplicación.\n' +
                  '6.3. Mantener su vehículo propio en condiciones mecánicas y legales.\n' +
                  '6.4. Realizar la inspección con diligencia y veracidad. Cualquier omisión dolosa de daños preexistentes será causa de terminación inmediata.\n' +
                  '6.5. Informar a Rundi de inmediato si ocurre un accidente o incidente durante el servicio.\n' +
                  '6.6. Tratar al Usuario con respeto y profesionalismo.\n\n' +
                  'VII. LIMITACIÓN DE RESPONSABILIDAD\n' +
                  '7.1. Rundi no es responsable por daños al vehículo del Usuario que ocurran durante la conducción. El Conductor Designado es directamente responsable ante el Usuario y ante las autoridades.\n' +
                  '7.2. Rundi recomienda al Conductor Designado contratar un seguro de responsabilidad civil que cubra eventuales daños a vehículos de terceros (los seguros tradicionales del vehículo del Usuario pueden no cubrir la conducción por un tercero; es responsabilidad del Conductor Designado verificar su cobertura).\n' +
                  '7.3. En caso de un accidente de tránsito, el Conductor Designado deberá seguir el procedimiento establecido por la ley nicaragüense (tomar datos, solicitar presencia de la Policía de Tránsito, etc.) y notificar a Rundi dentro de las 24 horas.\n\n' +
                  'VIII. SUSPENSIÓN Y TERMINACIÓN\n' +
                  '8.1. Rundi podrá suspender o terminar la cuenta del Conductor Designado por:\n' +
                  '• Incumplimiento del procedimiento de inspección.\n' +
                  '• Quejas de Usuarios sobre conducción riesgosa o comportamiento inapropiado.\n' +
                  '• Fraude documental.\n' +
                  '• No mantener saldo suficiente para pagar comisiones.\n' +
                  '• Conducir bajo influencia de alcohol o drogas (terminación inmediata).\n\n' +
                  'IX. DISPOSICIONES FINALES\n' +
                  '9.1. Rundi podrá modificar estos Términos previa notificación a través de la aplicación. El uso continuado después de 7 días constituye aceptación.\n' +
                  '9.2. Estos Términos se rigen por las leyes de Nicaragua. Cualquier controversia será sometida a los tribunales de Managua.\n' +
                  '________________________________________\n' +
                  'DECLARACIÓN DEL CONDUCTOR DESIGNADO\n' +
                  'Al registrarme como Conductor Designado en Rundi, declaro que:\n' +
                  '• He leído y comprendido estos Términos.\n' +
                  '• Acepto realizar la inspección y documentación fotográfica conforme al procedimiento.\n' +
                  '• Reconozco mi condición de contratista independiente.\n' +
                  '• Asumo la responsabilidad total por mi actuación al conducir los vehículos de los Usuarios.',
              },
            },
            checkboxLabel: 'He leído y acepto los términos y condiciones.',
            acceptButton: 'Aceptar',
            saving: 'Guardando...',
            close: 'Cerrar',
          },
          availableRideCard: {
            originFallback: 'Origen desconocido',
            destinationFallback: 'Destino desconocido',
            priceLabel: 'Precio sugerido:',
            priceValue: 'C${{amount}}',
            distanceValue: '{{value}} km',
            distanceUnknown: 'N/D',
          },
          button: {
            loading: 'Cargando...',
          },
          cancelRideDialog: {
            title: '⚠️ Cancelar viaje',
            progress: 'Progreso: {{value}}%',
            requiresReasonMessage:
              'Este viaje está {{progress}}% completado. Proporciona un motivo para cancelarlo.',
            confirmMessage: '¿Seguro que deseas cancelar este viaje?',
            reasonLabel: 'Motivo de cancelación *',
            reasonPlaceholder: 'Ingresa el motivo (mínimo 10 caracteres)',
            charCount: '{{count}}/200 caracteres',
            suggestionsTitle: 'Motivos sugeridos:',
            suggestions: {
              personalEmergency: 'Emergencia personal',
              vehicleIssue: 'Problema con el vehículo',
              changeOfPlans: 'Cambio de planes',
              wrongRoute: 'Ruta incorrecta',
              longDelay: 'Demora excesiva',
            },
            actions: {
              keepRide: 'Mantener viaje',
              confirmCancel: 'Sí, cancelar',
            },
            alerts: {
              reasonRequiredTitle: 'Motivo requerido',
              reasonRequiredMessage: 'Proporciona un motivo con al menos 10 caracteres para cancelar este viaje.',
              errorTitle: 'Error',
              errorMessage: 'No pudimos cancelar el viaje. Intenta de nuevo.',
            },
          },
          emergencyButton: {
            modalTitle: 'Emergencia',
            modalSubtitle: 'Elige el servicio de emergencia que necesitas',
            options: {
              police: {
                title: 'Policía',
                description: 'Emergencias policiales, robos, accidentes',
                number: '118',
              },
              ambulance: {
                title: 'Ambulancia',
                description: 'Emergencias médicas, accidentes, lesiones',
                number: '102',
              },
            },
            cancelLabel: 'Cancelar',
            alerts: {
              callingTitle: 'Emergencia',
              callingMessage: 'Llamando a {{name}} ({{number}})\n\nLa llamada ha sido registrada.',
              cannotCall: 'No pudimos iniciar la llamada telefónica.',
              errorTitle: 'Error',
              errorMessage: 'No pudimos completar la llamada de emergencia.',
            },
          },
          emptyRideList: {
            defaultTitle: 'No hay viajes disponibles ahora',
            defaultDescription: 'Los nuevos viajes aparecerán aquí automáticamente.',
          },
          emptyState: {
            noRides: {
              title: 'Sin viajes disponibles',
              message: 'Cuando haya nuevos viajes, aparecerán aquí.',
              action: 'Actualizar',
            },
            noHistory: {
              title: 'Sin historial de viajes',
              message: 'Los viajes completados aparecerán aquí.',
              action: 'Solicitar viaje',
            },
            noNotifications: {
              title: 'Sin notificaciones',
              message: 'Te avisaremos cuando haya algo nuevo.',
            },
            noSearchResults: {
              title: 'Sin resultados',
              message: 'No encontramos resultados para “{{term}}”.',
              genericMessage: 'Intenta con otra búsqueda.',
            },
            noDrivers: {
              title: 'No hay conductores disponibles',
              message: 'Vuelve a intentarlo en un momento.',
            },
            noConnection: {
              title: 'Sin conexión',
              message: 'Revisa tu conexión a internet e inténtalo de nuevo.',
              action: 'Reintentar',
            },
          },
          etaDisplay: {
            loading: 'Calculando...',
            etaLabel: 'Llegada estimada',
            distanceLabel: '{{value}} km restantes',
            realtime: 'Actualización en tiempo real • Última actualización: {{value}}',
            errors: {
              generic: 'Error al calcular la ETA',
              calculating: 'Calculando...',
            },
            updateTimes: {
              now: 'justo ahora',
              seconds: 'hace {{count}} s',
              minutes: 'hace {{count}} min',
            },
          },
          imagePicker: {
            alerts: {
              permissionsTitle: 'Permisos requeridos',
              permissionsMessage: 'Se necesitan permisos de cámara y galería para continuar.',
              selectTitle: 'Seleccionar imagen',
              selectMessage: 'Elige una opción',
              cameraOption: 'Tomar foto',
              galleryOption: 'Galería',
              cancelOption: 'Cancelar',
              errorTitle: 'Error',
              selectError: 'No pudimos seleccionar la imagen.',
            },
            placeholder: 'Toma o selecciona una foto',
            changeButton: 'Cambiar foto',
          },
          insuranceCompany: {
            selectTitle: 'Compañía de seguro',
            otherOption: 'Otra aseguradora',
          },
          imagePickerButton: {
            alerts: {
              pickTitle: 'Seleccionar imagen',
              pickMessage: 'Elige una opción',
              cameraOption: 'Cámara',
              galleryOption: 'Galería',
              cancelOption: 'Cancelar',
              permissionTitle: 'Permisos',
              permissionMessage: 'Se necesita permiso de cámara para continuar.',
              permissionGalleryMessage: 'Se necesita permiso de galería para continuar.',
              takePhotoError: 'No pudimos tomar la foto.',
              pickError: 'No pudimos seleccionar la imagen.',
              uploadSuccessTitle: 'Éxito',
              uploadSuccessMessage: 'Imagen subida con éxito.',
              uploadErrorTitle: 'Error',
              uploadErrorMessage: 'No pudimos subir la imagen.',
            },
            placeholder: {
              label: 'Toca para seleccionar',
            },
            loadingLabel: 'Cargando…',
          },
          loadingOverlay: {
            defaultMessage: 'Cargando…',
            progressValue: '{{value}}%',
          },
          phoneNumberModal: {
            title: 'Número telefónico',
            subtitle: 'Selecciona tu país e ingresa los dígitos.',
            previewLabel: 'Número actual',
            areaLabel: 'Código de área',
            actions: {
              useNumber: 'Usar este número',
              clearNumber: 'Eliminar número',
            },
            alerts: {
              invalidTitle: 'Teléfono inválido',
              invalidMessage: 'Ingresa un número telefónico internacional válido.',
            },
          },
          photoUploadField: {
            alerts: {
              permissionDeniedTitle: 'Permiso denegado',
              galleryPermission: 'Necesitamos acceso a tu galería.',
              cameraPermission: 'Necesitamos acceso a tu cámara.',
              errorTitle: 'Error',
              selectError: 'No pudimos seleccionar la imagen.',
              captureError: 'No pudimos tomar la foto.',
            },
            options: {
              title: 'Agregar foto',
              message: 'Elige cómo agregar la foto',
              cancel: 'Cancelar',
              gallery: 'Galería',
              camera: 'Cámara',
            },
            buttons: {
              change: 'Cambiar foto',
              add: 'Agregar foto',
            },
          },
          supportChatShortcut: {
            defaultLabel: '¿Necesitas ayuda?',
            defaultDescription: 'Abre el chat de soporte y recibe ayuda personalizada en minutos.',
          },
          deviationAlert: {
            title: {
              warning: 'Posible desviación',
              danger: 'Desviación mayor',
            },
            message: 'El conductor está a {{distance}} de la ruta esperada.',
            distanceLabel: 'Distancia al origen:',
          },
          documentImageViewer: {
            buttons: {
              viewDocument: 'Ver documento',
              front: 'Frente',
              back: 'Reverso',
              close: 'Cerrar',
            },
          },
          driverOfferCard: {
            defaults: {
              driver: 'Conductor',
              vehicle: 'Vehículo',
              vehicleUnknown: 'N/D',
              plateLabel: 'Placa:',
            },
            savings: {
              save: 'Ahorras C${{amount}}',
              extra: 'C${{amount}} más',
              match: 'Precio estimado',
            },
            distance: '📍 Distancia al origen:',
            negotiation: {
              title: '📊 Rango de negociación:',
              min: 'Mínimo',
              max: 'Máximo',
            },
            price: {
              acceptedLabel: '✅ Aceptó tu precio',
              offerLabel: '💰 Ofrece:',
              acceptRide: '🚀 Aceptar e iniciar viaje',
              viewOffer: '💬 Ver oferta y negociar',
              quickAccept: '✅ Aceptar C${{amount}}',
              pending: '⏳ Esperando confirmación',
            },
            biometric: {
              title: 'Verifica tu identidad',
              subtitle: 'Se requiere confirmación biométrica para aceptar este viaje.',
              fingerprint: '👆 Usar huella',
              faceId: '👤 Usar Face ID',
              cancel: 'Cancelar',
              errorTitle: 'Error',
              errorMessage: 'La autenticación biométrica falló.',
            },
          },
          priceNegotiationModal: {
            header: {
              title: 'Negociación de precio',
            },
            driverInfo: {
              label: 'Conductor: {{name}}',
              rating: '{{value}}',
            },
            summary: {
              estimatedLabel: 'Precio estimado:',
              clientLabel: 'Tu precio sugerido:',
              driverLabel: 'El conductor ofrece:',
            },
            state: {
              accepted: {
                title: '¡El conductor aceptó tu precio!',
                subtitle: 'Precio final: C${{amount}}',
                button: 'Aceptar e iniciar viaje',
              },
              counterOffer: {
                title: 'El conductor propone: C${{amount}}',
                subtitle: 'Puedes aceptar la oferta o enviar una contraoferta.',
              },
              waiting: {
                message: 'Esperando la respuesta del conductor...',
              },
            },
            counterOffer: {
              label: 'O envía una contraoferta:',
              rangeHint: 'Rango permitido:',
              minLabel: 'Mínimo',
              maxLabel: 'Máximo',
              placeholder: 'Ej: {{value}}',
              send: 'Enviar',
            },
            actions: {
              acceptOffer: 'Aceptar C${{amount}}',
            },
            alerts: {
              invalidInput: 'Ingresa un precio válido.',
              minPrice: 'El precio mínimo es C${{amount}}.',
              maxPrice: 'El precio máximo es C${{amount}}.',
            },
          },
          rideProgressIndicator: {
            client: {
              freeCancel: '✅ Cancela ahora y no se te cobrará.',
              cashPenalty:
                '⚠️ Si cancelas ahora debes pagar C${{amount}} en efectivo al conductor ({{percent}}% del viaje).',
              cardPenalty: '⚠️ Si cancelas ahora cargaremos {{percent}}% del viaje (C${{amount}}).',
            },
            driver: {
              freeCancel: 'Puedes cancelar sin penalización.',
              cashPenalty: 'Si cancelas ahora se aplicará una penalización (deducida de tus ganancias).',
              cardPenalty: 'Si cancelas ahora se aplicará una penalización (comisión del viaje).',
            },
            stats: '{{value}}%',
          },
          routeHistory: {
            loading: 'Cargando historial de ruta...',
            empty: 'No hay datos de ruta disponibles.',
            errors: {
              load: 'No pudimos cargar el historial de ruta.',
            },
            title: '📊 Estadísticas del viaje',
            stats: {
              points: 'Puntos registrados',
              distance: 'Distancia total',
              duration: 'Duración',
              avgSpeed: 'Velocidad promedio',
              maxSpeed: 'Velocidad máxima',
            },
            duration: {
              short: '{{value}} min',
              long: '{{hours}}h {{minutes}}min',
            },
            timeline: {
              title: '🕐 Línea de tiempo',
              noSpeed: 'Sin velocidad',
              more: '... y {{count}} puntos más',
            },
          },
         },
          statuses: {
            pending: 'Pendiente',
            active: 'Activo',
            completed: 'Completado',
            cancelled: 'Cancelado',
            inProgress: 'En progreso',
            scheduled: 'Programado',
            offline: 'Desconectado',
            online: 'En línea',
            error: 'Error',
          },
          labels: {
            email: 'Correo electrónico',
            phone: 'Teléfono',
            password: 'Contraseña',
            language: 'Idioma',
            theme: 'Tema',
            notifications: 'Notificaciones',
            profile: 'Perfil',
            vehicle: 'Vehículo',
            driver: 'Conductor',
            passenger: 'Pasajero',
            map: 'Mapa',
            settings: 'Configuración',
            home: 'Inicio',
            help: 'Ayuda',
          },
          messages: {
            genericError: 'Algo salió mal. Inténtalo de nuevo.',
            networkError: 'Error de red. Verifica tu conexión.',
            offline: 'Parece que estás sin conexión.',
            confirmExit: '¿Seguro que deseas salir?',
            confirmDelete: '¿Seguro que deseas eliminar esto?',
            loading: 'Cargando...',
          },
          roles: {
            driver: 'Conductor',
            client: 'Cliente',
            designated_driver: 'Conductor designado',
            admin: 'Administrador',
            default: 'Usuario',
          },
          ride: {
            pickup: 'Recogida',
            dropoff: 'Destino',
            eta: 'ETA',
            distance: 'Distancia',
            price: 'Precio',
            payment: 'Pago',
            driver: 'Conductor',
            rider: 'Cliente',
            seat: 'Asiento',
          },
          payment: {
            loading: 'Cargando...',
            header: {
              titleDefault: 'Pago del viaje',
              titlePending: 'Pago pendiente',
              subtitleDefault: 'Completa tu pago de forma segura',
              subtitlePending: 'Tu viaje terminó. Completa el pago para continuar.',
            },
            summary: {
              title: 'Resumen del viaje',
              origin: 'Origen',
              destination: 'Destino',
              distance: 'Distancia',
              notAvailable: 'N/D',
            },
            cost: {
              title: 'Detalle de costos',
              fare: 'Tarifa del viaje',
              tip: 'Propina',
              total: 'Total a pagar',
            },
            tip: {
              title: '¿Quieres agregar una propina?',
              customLabel: 'O ingresa un monto personalizado:',
              placeholder: 'C$0.00',
            },
            paymentMethod: {
              title: 'Método de pago',
              cardTitle: 'Tarjeta de crédito/débito',
              cardSubtitle: 'Selecciona tu banco abajo',
              cashTitle: 'Efectivo',
              cashSubtitle: 'Paga a tu conductor',
              cashUnavailable: 'No disponible para pagos pendientes',
            },
            savedCards: {
              title: 'Tus tarjetas',
              manageLink: 'Administrar →',
              defaultBadge: 'Predeterminada',
              newCardTitle: 'Nueva tarjeta',
              newCardSubtitle: 'Agrega un método de pago',
            },
            banks: {
              title: 'Elige tu banco',
              selectLabel: 'Selecciona tu banco:',
            },
            buttons: {
              payCard: 'Pagar con tarjeta',
              payCardPending: 'Pagar ahora',
              payCash: 'Confirmar pago en efectivo',
            },
            security: {
              message: 'Tu información está protegida con cifrado de nivel bancario.',
            },
            alerts: {
              missingCardNumber: 'Ingresa el número de tarjeta.',
              missingCardHolder: 'Ingresa el nombre del titular.',
              invalidExpiry: 'Ingresa la fecha de expiración en formato MM/AA o MM/AAAA.',
              invalidCVV: 'Ingresa un CVV válido (3 o 4 dígitos).',
              missingBank: 'Selecciona un banco.',
              saveCardSuccessTitle: 'Tarjeta guardada',
              saveCardSuccessMessage: 'Tu tarjeta {{brand}} **** {{last4}} se guardó correctamente.',
              saveCardError: 'No pudimos guardar la tarjeta.',
              changeMethodError: 'No pudimos cambiar el método de pago.',
              cardSuccessTitle: 'Pago completado',
              cardSuccessMessage: 'Tu pago de C${{amount}} se procesó correctamente.',
              cardError: 'No pudimos procesar el pago.',
              cashInfoTitle: 'Pago en efectivo',
              cashInfoMessage: 'Por favor paga C${{amount}} en efectivo a tu conductor. Él confirmará la recepción.',
            },
            biometric: {
              prompt: 'Confirma tu identidad para pagar C${{amount}}',
              error: 'No pudimos confirmar tu identidad. Intenta de nuevo.',
            },
            currencyAmount: 'C${{amount}}',
          },
          backgroundTracking: {
            foregroundService: {
              title: 'Seguimiento de ubicación activo',
              body: 'Tu ubicación se está compartiendo.',
            },
            driver: {
              title: 'Conductor disponible',
              body: 'Compartiendo tu ubicación para recibir viajes cercanos.',
            },
            client: {
              title: 'Viaje bajo monitoreo',
              body: 'Tu viaje sigue activo y estamos monitoreando tu ubicación.',
            },
          },
          auth: {
            errors: {
              notAuthenticated: 'Usuario no autenticado.',
              emailRequired: 'El correo electrónico es obligatorio.',
              passwordMin: 'La contraseña debe tener al menos 6 caracteres.',
              phoneFormatInvalidExample: 'Formato de teléfono inválido. Usa {{example}}.',
              phoneFormatInvalidInternational:
                'Formato de teléfono inválido. Usa un número internacional (+Código de país y número).',
              verificationStartFailed: 'No pudimos iniciar la verificación telefónica. Intenta nuevamente.',
              verificationMissing: 'No encontramos una verificación activa. Solicita un nuevo código.',
              verificationNotFound: 'No encontramos una solicitud de verificación activa. Solicita un nuevo código.',
              codeSixDigits: 'El código debe tener 6 dígitos.',
              codeInvalid: 'El código que ingresaste no es válido. Revisa el SMS e inténtalo otra vez.',
              codeMismatch: 'El código ingresado no coincide con el SMS. Verifícalo e inténtalo nuevamente.',
              codeExpired: 'El código expiró. Toca “Reenviar código” para obtener uno nuevo.',
              tooManyAttempts: 'Has realizado demasiados intentos. Espera unos minutos antes de intentarlo nuevamente.',
              networkIssue:
                'No pudimos completar la solicitud por un problema de red. Verifica tu conexión e intenta de nuevo.',
              smsSendGeneric: 'No pudimos enviar el código SMS. Intenta de nuevo.',
              smsInvalidPhone: 'El número de teléfono no es válido. Usa el formato internacional (+Código y número).',
              smsTooManyRequests: 'Solicitaste demasiados códigos en poco tiempo. Espera unos minutos antes de intentar.',
              smsQuotaExceeded: 'Se alcanzó la cuota de envío de SMS por ahora. Inténtalo más tarde.',
              smsNetworkError: 'No pudimos conectarnos para enviar el SMS. Verifica tu conexión e intenta de nuevo.',
              confirmGenericFailure: 'No pudimos confirmar el código. Intenta nuevamente.',
            },
          },
          searchRide: {
            defaults: {
              locationFallback: 'Ubicación seleccionada',
              origin: 'Punto de origen',
              destination: 'Destino',
              currentLocation: 'Ubicación actual',
              myLocation: 'Mi ubicación',
              serviceFallback: 'Servicio',
            },
            alerts: {
              unavailableZoneTitle: 'Servicio temporalmente indisponible',
              unavailableZoneMessage: 'Esta ubicación está fuera de nuestra cobertura por ahora.',
              selectValidPointTitle: 'Selecciona un punto válido',
              selectValidPointMessage: 'Debes escoger una ubicación exacta.',
              selectValidOriginMessage: 'Debes escoger el punto exacto de origen.',
              selectValidDestinationMessage: 'Debes escoger el destino exacto.',
              selectValidStopMessage: 'Debes escoger la ubicación exacta de la parada.',
              destinationPromptTitle: 'Selecciona tu destino',
              destinationPromptMessage: 'Ahora puedes elegir tu destino final mediante búsqueda o en el mapa.',
              vehiclePhotoRequired: 'Debes proporcionar una foto de tu vehículo para solicitar un conductor designado.',
              vehiclePhotoUploadError: 'La carga de la foto del vehículo falló. Intenta nuevamente.',
              vehiclePhotoProcessTitle: 'Procesando foto',
              vehiclePhotoProcess: 'Estamos procesando tu foto. Espera antes de confirmar.',
              loginRequired: 'Inicia sesión para solicitar un viaje.',
              photoLoginRequired: 'Inicia sesión para subir la foto de tu vehículo.',
              destinationRequired: 'Toca el mapa para seleccionar tu destino.',
              invalidAmount: 'Ingresa un monto válido.',
              priceCalculationFailed: 'No pudimos calcular la ruta.',
              locationUnavailableTitle: 'Ubicación no disponible',
              locationUnavailableMessage: 'Activa tu ubicación o inténtalo más tarde.',
              serviceValidationFailed: 'No pudimos validar la zona seleccionada. Revisa tu conexión e intenta de nuevo.',
              photoPermissionsTitle: 'Permisos necesarios',
              photoPermissionsMessage: 'Se requiere acceso a la cámara.',
              photoOptionsTitle: 'Foto del vehículo',
              photoOptionsMessage: 'Elige una opción',
              photoOptionsCamera: 'Tomar foto',
              photoOptionsGallery: 'Galería',
              photoOptionsCancel: 'Cancelar',
              photoSelectedTitle: 'Foto seleccionada',
              photoSelectedMessage: 'Se cargará cuando confirmes tu viaje.',
              photoUploadedTitle: 'Foto cargada',
              photoUploadedMessage: 'Tu vehículo ha sido registrado.',
              photoUploadFailed: 'La carga de la foto del vehículo falló. Intenta nuevamente.',
              photoCaptureFailed: 'No pudimos capturar la foto. Intenta nuevamente.',
              locationFetchFailed: 'No pudimos obtener la ubicación seleccionada. Prueba otra búsqueda.',
              biometricRequiredTitle: 'Huella requerida',
              biometricRequiredMessage: 'Se requiere autenticación con huella para este servicio.',
              biometricUnavailableTitle: 'Biometría no disponible',
              biometricUnavailableMessage: 'Tu dispositivo no tiene biometría configurada. Continuaremos con un registro manual.',
              biometricGenericError: 'La verificación de huella falló. Intenta nuevamente.',
              identityRequired: 'Debes confirmar tu identidad con tu huella.',
              biometricFallbackLabel: 'Ingresar código',
              requestError: 'No pudimos enviar tu solicitud de viaje.',
              motoSelectedTitle: 'Motocicleta seleccionada',
              designatedDriverMotoTitle: 'Conductor designado en moto',
              singlePassengerMessage: 'Las motocicletas solo pueden llevar 1 pasajero.',
            },
            mapSelection: {
              defaultTitle: 'Selecciona una ubicación',
              originTitle: 'Define el origen',
              originMessage: 'Mueve el mapa hasta tu punto de partida.',
              destinationTitle: 'Selecciona tu destino',
              destinationMessage: 'Mueve el mapa hasta tu destino final.',
              newStopTitle: 'Nueva parada',
              newStopMessage: 'Toca el mapa para agregar la parada {{index}}.',
              editStopTitle: 'Editar parada',
              editStopMessage: 'Toca el mapa para actualizar la parada {{index}}.',
            },
            labels: {
              selectingLocation: 'Selecciona una ubicación',
              setOrigin: 'Definir origen',
              setDestination: 'Elegir destino',
              newStop: 'Nueva parada',
              editStop: 'Editar parada {{index}}',
              extraStopHint: 'Toca el mapa para agregar la parada {{index}}.',
              selectOrigin: 'Elige tu origen exacto.',
              selectDestination: 'Elige tu destino exacto.',
              selectStop: 'Elige la ubicación exacta de la parada.',
              searchPlaceholder: 'Buscar lugares',
              useCurrentLocation: 'Usar ubicación actual',
              favorites: 'Favoritos',
              recent: 'Recientes',
              noResults: 'No se encontraron coincidencias.',
              searching: 'Buscando...',
              passengers: 'Pasajeros',
              paymentMethod: 'Método de pago',
              priceSuggestion: 'Precio sugerido',
              pricePlaceholder: 'C$0.00',
              comment: 'Comentario',
              commentPlaceholder: 'Detalles del viaje...',
              designatedDriverPhoto: 'Foto del vehículo',
              addVehiclePhoto: 'Agregar foto',
              changeVehiclePhoto: 'Cambiar foto',
              removeVehiclePhoto: 'Eliminar foto',
              confirmRequest: 'Confirmar solicitud',
              confirmRequestDisabled: 'Agrega destino y ruta',
              sendingRequest: 'Enviando solicitud…',
              driversAvailableTitle: 'Conductores disponibles',
              driversAvailableDescription: 'Encontramos conductores cercanos',
              driversUnavailableTitle: 'Sin conductores cerca',
              driversUnavailableDescription: 'Te avisaremos cuando haya nuevos conductores disponibles.',
              searchingAddress: 'Buscando dirección…',
              originPlaceholder: 'Selecciona el origen',
              destinationPlaceholder: 'Selecciona tu destino',
              stopLabel: 'Parada {{index}}',
              inlineAddStop: 'Agregar destino extra',
              calculating: 'Calculando…',
              priceApproximation: '~C${{value}}',
              etaValue: '~{{minutes}} min',
              etaUnavailable: 'Sin ETA',
            },
            vehicle: {
              motoLabel: 'Motocicleta',
              motoSubtitle: 'Viajes ágiles y económicos',
              autoLabel: 'Auto',
              autoSubtitle: 'Viajes cómodos para hasta 4 personas',
              designatedLabel: 'Conductor designado',
              designatedSubtitle: 'Conducimos tu auto por ti',
              recommendedBadge: 'Recomendado',
              recommendationLabel: 'Tarifa recomendada',
              modeLabel: 'Conductor designado para:',
              modeAuto: 'Auto',
              modeMoto: 'Motocicleta',
            },
            photo: {
              hint: 'Foto del vehículo (requerida para conductor designado):',
              buttonDefault: 'Tomar/Seleccionar foto',
              buttonChange: 'Cambiar foto',
              buttonProcessing: 'Procesando…',
            },
            summary: {
              title: 'Resumen y precio',
              distance: 'Distancia',
              duration: 'Tiempo',
              estimate: 'Estimado',
              calculatingRoute: 'Calculando ruta…',
            },
            payment: {
              cash: 'Efectivo',
              card: 'Tarjeta',
            },
            availability: {
              checking: 'Buscando conductores cercanos…',
              low: 'Hay pocos o ningún conductor cerca en este momento',
              ok: 'Conductores disponibles',
              unknown: 'Disponibilidad desconocida',
            },
            search: {
              selectionOriginTitle: 'Origen',
              selectionDestinationTitle: 'Destino final',
              selectionNewStopTitle: 'Nueva parada ({{current}}/{{max}})',
              selectionEditStopTitle: 'Editar parada {{index}}',
              selectionGenericTitle: 'Ubicación',
              descriptionOrigin: 'Escribe una dirección o usa tu ubicación actual.',
              descriptionDestination: 'Busca una dirección o selecciónala en el mapa.',
              descriptionExtra: 'Puedes buscar o seleccionar la parada intermedia en el mapa.',
              descriptionGeneric: 'Busca o selecciona una ubicación en el mapa.',
              inputLabel: 'Buscar ubicación',
              placeholderOrigin: 'Buscar origen…',
              placeholderDestination: 'Buscar destino…',
              placeholderDestinationReference: 'Ej: Conchita Palacios',
              placeholderStop: 'Buscar parada…',
              placeholderGeneric: 'Buscar ubicación…',
              close: 'Cerrar',
              useCurrentLocation: 'Usar mi ubicación',
              pickOnMap: 'Seleccionar en el mapa',
              destinationGuidanceTitle: '¿Destino por referencia?',
              destinationGuidanceBody:
                'Si escribes una referencia local, termina seleccionando un resultado o usando el mapa para fijar el punto exacto.',
              destinationGuidanceStep1: '1) Escribe un lugar exacto',
              destinationGuidanceStep2: '2) Fija punto exacto',
              destinationConfirmed: 'Destino confirmado en mapa',
              loading: 'Buscando ubicaciones…',
              error: 'No pudimos buscar ubicaciones.',
            },
            cta: {
              primary: 'Confirmar y solicitar viaje',
              loading: 'Enviando solicitud…',
              submittingOverlay: 'Enviando tu solicitud…',
            },
            accessibility: {
              back: 'Regresar',
              addExtraStop: 'Agregar destino extra',
              payCash: 'Pagar en efectivo',
              payCard: 'Pagar con tarjeta',
            },
          },
         services: {
          biometricService: {
            prompts: {
              reason: 'Confirma tu identidad',
              fallbackLabel: 'Usar PIN',
            },
            errors: {
              notSupported: 'Este dispositivo no soporta biometría.',
              notEnrolled: 'No hay datos biométricos registrados en este dispositivo.',
              authFailed: 'Falló la autenticación biométrica.',
              unknown: 'Error desconocido.',
              appleNotAvailable: 'Iniciar sesión con Apple no está disponible en este dispositivo.',
              appleNoToken: 'Iniciar sesión con Apple no devolvió un token de identidad.',
              appleCanceled: 'Se canceló el inicio de sesión con Apple.',
            },
            modal: {
              title: 'Verificación de identidad',
              scanning: 'Escaneando biometría…',
              pinFallback: 'Escaneo biométrico no disponible. Continúa con el PIN del dispositivo.',
              appleSignIn: 'Verificando tu identidad con Apple ID…',
              success: 'Identidad verificada correctamente.',
              retry: 'Falló la verificación. Reintentando…',
            },
          },
          
          auth: {
            accountLinkingService: {
              errors: {
                notAuthenticated: 'Necesitas iniciar sesión para continuar.',
                smsRequiresNative: 'La verificación por SMS requiere un build nativo de desarrollo o producción.',
                sendCodeFailed: 'No pudimos iniciar la verificación telefónica. Intenta de nuevo.',
                missingVerificationId: 'No pudimos iniciar la verificación telefónica. Intenta de nuevo.',
                noActiveVerification: 'No se encontró una verificación activa. Solicita un nuevo código.',
                smsNotAvailableExpoGo: 'La verificación por SMS no está disponible en Expo Go.',
                nativeAccessFailed: 'No pudimos acceder a Firebase nativo. Usa un build de desarrollo.',
              },
              validation: {
                emailRequired: 'El correo electrónico es obligatorio.',
                passwordLength: 'La contraseña debe tener al menos 6 caracteres.',
                phoneFormat: 'Ingresa un teléfono válido como +505 XXXX XXXX.',
                codeLength: 'El código debe tener 6 dígitos.',
              },
            },
            firebaseAuthService: {
              errors: {
                registerInvalid: 'No pudimos completar tu registro.',
                userProfileNotFound: 'Perfil de usuario no encontrado.',
                profileNotFound: 'Perfil no encontrado.',
                availabilityFailed: 'No pudimos validar la disponibilidad de la cuenta. Intenta más tarde.',
                invalidIdToken: 'idToken inválido para generar la sesión compartida.',
                customTokenMissing: 'La respuesta del servidor no incluyó un token personalizado válido.',
                sessionSyncFailed: 'No pudimos sincronizar la sesión con el backend. Intenta más tarde.',
              },
            },
            googleAuthService: {
              errors: {
                registerFailed: 'No pudimos completar tu registro con Google.',
                emailMissing: 'No pudimos obtener el correo de tu cuenta de Google.',
                loginFailed: 'No pudimos iniciar sesión con Google.',
                profileNotFound: 'Perfil no encontrado.',
              },
            },
            localAuthService: {
              errors: {
                registerFailed: 'No pudimos registrar tu cuenta.',
                loginFailed: 'No pudimos iniciar sesión.',
                logoutFailed: 'No pudimos cerrar sesión. Intenta de nuevo.',
              },
            },
            phoneAuthService: {
              errors: {
                invalidPhoneFormat: 'Ingresa un número internacional válido (+código y número).',
                smsSendFailed: 'No pudimos enviar el código SMS. Intenta nuevamente.',
                invalidPhoneNumber: 'El número de teléfono no es válido. Verifica el formato internacional.',
                smsTooManyRequests: 'Solicitaste demasiados códigos. Espera antes de intentarlo de nuevo.',
                smsQuotaExceeded: 'Se alcanzó la cuota de envío de SMS. Intenta más tarde.',
                smsNetworkError: 'No pudimos conectarnos para enviar el SMS. Revisa tu conexión.',
                noActiveVerification: 'No hay verificación activa. Solicita un nuevo código.',
                codeLength: 'Ingresa el código de 6 dígitos de tu SMS.',
                confirmFailed: 'No pudimos verificar el código. Intenta nuevamente.',
                invalidVerificationCode: 'El código no coincide con el SMS. Revísalo e intenta nuevamente.',
                codeExpired: 'El código ha expirado. Toca “Reenviar código” para obtener uno nuevo.',
                confirmTooManyRequests: 'Intentaste demasiadas veces. Espera antes de volver a intentar.',
                confirmNetworkError: 'No pudimos verificar el código por un problema de red. Revisa tu conexión.',
                smsRequiresBuild: 'La verificación por SMS solo está disponible en builds de desarrollo/producción.',
                nativeFirebaseUnavailable: 'Firebase Auth nativo no está disponible. Usa un build de desarrollo.',
              },
            },
          },
          notificationService: {
            channels: {
              default: 'Notificaciones de Rundi',
              activeRide: 'Viaje activo',
            },
            quickReturnActiveRide: {
              title: 'Vuelve a tu viaje activo',
              body: 'Toca para regresar a los detalles del viaje en curso.',
            },
            newRide: {
              title: 'Nuevo viaje disponible',
              body: 'Viaje desde {{origin}} · {{distance}} · {{price}}',
              originFallback: 'Origen no disponible',
            },
            rideAccepted: {
              title: 'Tu viaje fue aceptado',
              body: '{{driverName}} va en camino.',
              driverFallback: 'Conductor',
            },
            rideStarted: {
              title: 'Tu viaje ha iniciado',
              body: 'Disfruta el recorrido.',
            },
            rideCompleted: {
              title: 'Viaje completado',
              body: 'Gracias por usar Rundi.',
            },
            rideCanceled: {
              title: 'Viaje cancelado',
              body: 'El viaje fue cancelado.',
            },
            formats: {
              priceCordoba: 'C${{amount}}',
              distanceKm: '{{value}} km de distancia',
            },
          },
          alertService: {
            titles: {
              error: 'Error',
              important: 'Importante',
              permissionsRequired: 'Se requieren permisos',
            },
            messages: {
              locationPermissionRequired: 'Se necesita acceso a tu ubicación para usar esta función.',
              locationAccessFailed: 'No pudimos acceder a tu ubicación.',
            },
            buttons: {
              cancel: 'Cancelar',
              confirm: 'Confirmar',
              navigate: 'Navegar',
              understood: 'Entendido',
              goToSettings: 'Ir a Configuración',
            },
          },
          backgroundLocationService: {
            foregroundService: {
              title: 'Seguimiento de ubicación activo',
              body: 'Tu ubicación se está compartiendo.',
            },
            driverStatus: {
              title: 'Conductor disponible',
              body: 'Compartiendo tu ubicación para recibir viajes cercanos.',
            },
            clientStatus: {
              title: 'Viaje bajo monitoreo',
              body: 'Tu viaje está activo y estamos monitoreando tu ubicación.',
            },
          },
          cardsService: {
            errors: {
              addFailed: 'No pudimos agregar la tarjeta.',
              addGeneric: 'Ocurrió un error al agregar la tarjeta.',
              defaultFailed: 'No pudimos establecer la tarjeta predeterminada.',
              defaultGeneric: 'Ocurrió un error al establecer la tarjeta predeterminada.',
              deleteFailed: 'No pudimos eliminar la tarjeta.',
              deleteGeneric: 'Ocurrió un error al eliminar la tarjeta.',
            },
          },
          driversService: {
            errors: {
              availabilityLimit:
                'No puedes conectarte: tienes 10 o más comisiones pendientes. Págalas desde “Pagar comisiones”.',
              notAuthenticated: 'Usuario no autenticado. Inicia sesión.',
              updateFailed: 'No pudimos actualizar el estado del conductor.',
              profileFetchFailed: 'No pudimos cargar el perfil del conductor.',
              profileUpdateFailed: 'No pudimos actualizar el perfil del conductor.',
            },
          },
          earningsService: {
            errors: {
              statsFailed: 'No pudimos cargar tus estadísticas de ganancias.',
              earningsByDayFailed: 'No pudimos cargar las ganancias por día.',
              pendingCashFailed: 'No pudimos cargar tus viajes en efectivo pendientes.',
              createRechargeFailed: 'No pudimos crear la recarga de efectivo.',
              rechargesFailed: 'No pudimos cargar tu historial de recargas.',
            },
          },
          inspectionsService: {
            errors: {
              saveFailed: 'No pudimos guardar la inspección.',
              requiredEvidenceMissing: 'Toma las seis fotos y confirma que los documentos están vigentes.',
              missingData: 'No se devolvieron datos después de guardar la inspección.',
              fetchFailed: 'No pudimos cargar la inspección.',
              listFailed: 'No pudimos cargar la lista de inspecciones.',
            },
          },
          locationTrackingService: {
            errors: {
              savePoint: 'No pudimos guardar el punto de ubicación.',
              saveBatch: 'No pudimos guardar el lote de ubicaciones.',
              routeFailed: 'No pudimos calcular la ruta.',
              routeUnavailable: 'El cálculo de ruta no está disponible ahora.',
              reverseGeocodeFailed: 'No pudimos obtener la dirección.',
              reverseGeocodeUnavailable: 'La búsqueda de direcciones no está disponible ahora.',
              geocodeFailed: 'No pudimos obtener las coordenadas.',
              geocodeUnavailable: 'La búsqueda de coordenadas no está disponible ahora.',
              placesSearchFailed: 'No pudimos buscar lugares cercanos.',
              placesSearchUnavailable: 'La búsqueda no está disponible ahora.',
              distanceFailed: 'No pudimos calcular la distancia.',
              distanceUnavailable: 'El cálculo de distancia no está disponible ahora.',
              deleteRideLocations: 'No pudimos eliminar las ubicaciones del viaje.',
              routeSaveFailed: 'No pudimos guardar la ruta del viaje.',
              updateWaypointFailed: 'No pudimos actualizar el punto intermedio.',
              deleteWaypointFailed: 'No pudimos eliminar el punto intermedio.',
              reorderWaypointsFailed: 'No pudimos reordenar los puntos intermedios.',
            },
          },
          paymentsService: {
            errors: {
              rideIdRequired: 'Se requiere el ID del viaje.',
              amountPositive: 'El monto debe ser mayor que 0.',
              invalidResponse: 'Respuesta del servidor inválida.',
              createFailed: 'No pudimos crear la intención de pago.',
            },
          },
          phoneLoginService: {
            messages: {
              codeSent: 'Enviamos un código a tu número telefónico.',
              codeResent: 'El código de verificación se reenvió.',
            },
            
          },
          priceNegotiationService: {
            errors: {
              invalidNumber: 'El precio debe ser un número válido.',
              minPrice: 'El precio mínimo permitido es C${{value}}.',
              maxPrice: 'El precio máximo permitido es C${{value}}.',
              negotiateFailed: 'No pudimos negociar el precio.',
              notAuthenticated: 'Usuario no autenticado. Vuelve a iniciar sesión.',
              acceptClientPriceFailed: 'No pudimos aceptar el precio del cliente.',
              acceptDriverOfferFailed: 'No pudimos aceptar la oferta del conductor.',
              acceptCounterOfferFailed: 'No pudimos aceptar la contraoferta.',
              rejectCounterOfferFailed: 'No pudimos rechazar la contraoferta.',
              sendOfferFailed: 'No pudimos enviar la oferta.',
            },
          },
          registrationService: {
            errors: {
              requiredNameRole: 'El nombre y el rol son obligatorios.',
              invalidMethod: 'Método de registro inválido.',
              emailPasswordRequired: 'El correo y la contraseña son obligatorios para este método.',
              phoneVerificationRequired: 'Se requiere un número verificado para el registro por SMS.',
              driverDataRequired: 'Se requieren los datos del conductor y del vehículo.',
              googleTokenMissing: 'Falta el token de Google para completar el registro.',
              googleAuthFailed: 'No pudimos autenticarnos con Google.',
              invalidServerResponse: 'Respuesta del servidor inválida.',
              createUserFailed: 'No pudimos crear el usuario.',
              completeDriverFailed: 'No pudimos completar el registro de conductor.',
              upgradePhoneVerification: 'Debes verificar tu teléfono antes de completar el registro de conductor.',
              upgradePreconditionFailed: 'No pudimos actualizar tu cuenta. Revisa tu información e intenta de nuevo.',
              upgradeFailed: 'No pudimos actualizar tu cuenta a conductor. Intenta más tarde.',
            },
            validation: {
              emailInvalid: 'Ingresa un correo válido.',
              nameTooShort: 'El nombre debe tener al menos 2 caracteres.',
              phoneFormat: 'El teléfono debe tener el formato +505 XXXX XXXX.',
              roleInvalid: 'Selecciona un rol válido.',
              passwordLength: 'La contraseña debe tener al menos 6 caracteres.',
              licenseInvalid: 'Ingresa un número de licencia válido.',
              plateInvalid: 'Ingresa una placa válida.',
              brandRequired: 'La marca del vehículo es obligatoria.',
              modelRequired: 'El modelo del vehículo es obligatorio.',
              yearInvalid: 'Ingresa un año de vehículo válido.',
              colorRequired: 'El color del vehículo es obligatorio.',
              typeInvalid: 'Selecciona un tipo de vehículo válido.',
            },
          },
          ridesService: {
            errors: {
              clientIdRequired: 'Se requiere el ID del cliente.',
              locationsRequired: 'Se requieren origen y destino.',
              estimatedPricePositive: 'El precio estimado debe ser mayor que 0.',
              scheduledAtRequired: 'Es requerido colocar hora para agendar.',
              invalidServerResponse: 'Respuesta del servidor inválida.',
              rideDetailsFailed: 'No pudimos cargar los detalles del viaje.',
              driverOnRouteFailed: 'No pudimos actualizar el estado del viaje a “en camino”.',
              driverArrivedFailed: 'No pudimos registrar tu llegada.',
              unsupportedStatus: 'Estado de viaje no soportado: {{status}}.',
            },
          },
          servicesService: {
            messages: {
              defaultName: 'Servicio',
            },
            errors: {
              fetchFailed: 'No pudimos cargar los servicios.',
            },
          },
          supabaseStorage: {
            errors: {
              missingUri: 'Se requiere la URI de la imagen.',
              uploadFailed: 'No pudimos subir la imagen.',
              deleteFailed: 'No pudimos eliminar la imagen.',
            },
          },
          trackingService: {
            errors: {
              subscribeFailed: 'No pudimos suscribirnos al viaje.',
            },
          },
          uploadService: {
            errors: {
              processImage: 'No pudimos procesar la imagen.',
              processImages: 'No pudimos procesar las imágenes.',
            },
          },
          userManagementService: {
            errors: {
              notAuthenticated: 'No se encontró un usuario autenticado.',
              wrongPassword: 'Contraseña incorrecta. Revisa tus credenciales.',
              userNotFound: 'Usuario no encontrado.',
              tooManyRequests: 'Demasiados intentos. Intenta más tarde.',
              deleteAccountFailed: 'No pudimos eliminar tu cuenta. Intenta más tarde.',
              deleteDataFailed: 'No pudimos eliminar los datos del usuario.',
              emailMismatch: 'Ingresa el mismo correo con el que iniciaste sesión.',
            },
          },
          vehiclesService: {
            errors: {
              notAuthenticated: 'Usuario no autenticado.',
              addVehicleFailed: 'No pudimos agregar el vehículo.',
              switchVehicleFailed: 'No pudimos cambiar el vehículo.',
              updateVehicleFailed: 'No pudimos actualizar el vehículo.',
              vehicleIdRequired: 'Se requiere el ID del vehículo.',
            },
          },
          fcm: {
            rideRequested: {
              title: 'Viaje solicitado',
              body: 'Estamos buscando un conductor para ti.',
            },
            proximityRide: {
              title: 'Viaje cercano',
              body: 'Hay un nuevo viaje disponible cerca de ti.',
            },
            fallback: {
              title: 'Nueva notificación',
              body: 'Tienes una nueva actualización en Rundi.',
            },
            alerts: {
              authErrorTitle: 'No autenticado',
              authErrorMessage: 'Inicia sesión para continuar.',
              testSuccessTitle: 'Éxito',
              testSuccessMessage: 'Notificación de prueba enviada.',
              testErrorTitle: 'Error',
              testErrorMessage: 'No pudimos enviar la notificación.',
            },
          },
         },
       };

export default common;
