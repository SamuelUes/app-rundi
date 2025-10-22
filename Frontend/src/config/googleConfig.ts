/**
 * Google Configuration
 * Configuración de Google OAuth para autenticación
 */

// Google OAuth Client ID
// Obtén esto de: https://console.cloud.google.com/
// 1. Crea un proyecto en Google Cloud Console
// 2. Habilita Google Sign-In API
// 3. Crea credenciales OAuth 2.0 para aplicación móvil
// 4. Copia el Client ID aquí

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '1040329608349-t11k2f7tu1gtrh8fpogu3n1gmf2gi8p3.apps.googleusercontent.com';

// Validar que el Client ID esté configurado
if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
  console.warn(
    '⚠️ ADVERTENCIA: Google Client ID no está configurado. ' +
    'Por favor, configura GOOGLE_CLIENT_ID en googleConfig.ts o en variables de entorno.'
  );
}

export const GOOGLE_CONFIG = {
  clientId: GOOGLE_CLIENT_ID,
  scopes: ['profile', 'email'],
  redirectUrl: 'https://auth.expo.io/@your-username/your-app-slug',
};
