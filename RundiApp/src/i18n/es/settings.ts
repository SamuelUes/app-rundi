/**
 * Namespace `settings` del locale `es`.
 * Extraído desde `src/i18n/index.ts` (`es.translation.settings`).
 */
const settings = {
          title: 'Configuración',
          loading: { logout: 'Cerrando sesión...' },
          roles: {
            driver: 'Conductor',
            client: 'Cliente',
            designated_driver: 'Conductor designado',
            admin: 'Administrador',
            default: 'Usuario',
          },
          sections: {
            account: 'Cuenta',
            privacy: 'Privacidad y seguridad',
            about: 'Acerca de',
            language: 'Idioma',
          },
          account: {
            title: 'Mi cuenta',
            description: 'Administra correo, contraseña y teléfono',
            upgradeTitle: 'Quiero conducir',
            upgradeDescription: 'Completa tu información y documentos para ofrecer viajes en Rundi.',
            deleteTitle: 'Eliminar mi cuenta',
            deleteDescription: 'Flujo guiado para solicitar la eliminación',
          },
          privacy: {
            policy: 'Política de privacidad',
            terms: 'Términos y Condiciones',
          },
          about: {
            version: 'Versión',
            versionValue: 'Beta- 1.8',
            domain: 'Dominio',
            domainValue: 'rundiapp.com',
            licenses: 'Licencias de código abierto',
          },
          language: {
            title: 'Idioma de la app',
            description: 'Elige tu idioma preferido.',
            deviceDefault: 'Idioma del dispositivo: {{language}}',
            options: {
              en: 'Inglés',
              es: 'Español',
              zh: 'Chino',
            },
          },
          alerts: {
            buildTitle: 'Compila la app',
            buildMessage:
              'Las notificaciones push solo funcionan en un build de desarrollo o producción. Usa “npx expo run:android” o “npx expo run:ios”.',
            disableTitle: 'Desactivar notificaciones',
            disableMessage:
              'Para desactivar las notificaciones push, abre los ajustes del sistema y revoca los permisos de la app.',
            notAvailableTitle: 'No disponible',
            notAvailableMessage: 'Solo cuentas de cliente pueden iniciar el registro de conductor aquí.',
            smsErrorTitle: 'Error',
            smsErrorMessage: 'No pudimos enviar el código SMS. Intenta nuevamente.',
            genericError: 'Algo salió mal. Intenta de nuevo.',
          },
          actions: {
            logout: 'Cerrar sesión',
            logoutTitle: 'Cerrar sesión',
            logoutMessage: '¿Seguro que quieres cerrar sesión?',
            cancel: 'Cancelar',
            confirm: 'Cerrar sesión',
            accept: 'Aceptar',
          },
        };

export default settings;
