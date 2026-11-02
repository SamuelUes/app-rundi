/**
 * Google Auth Validator
 * Valida que la configuración de Google OAuth esté correcta
 */

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validar configuración de Google OAuth
 */
export const validateGoogleAuthConfig = (): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Verificar Google Client ID
  const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    errors.push('❌ REACT_APP_GOOGLE_CLIENT_ID no está configurado');
  } else if (!googleClientId.includes('.apps.googleusercontent.com')) {
    errors.push('❌ REACT_APP_GOOGLE_CLIENT_ID tiene formato inválido');
  } else {
    console.log('✅ Google Client ID configurado correctamente');
  }

  // Verificar Firebase API Key
  const firebaseApiKey = process.env.REACT_APP_FIREBASE_API_KEY;
  if (!firebaseApiKey) {
    errors.push('❌ REACT_APP_FIREBASE_API_KEY no está configurado');
  } else {
    console.log('✅ Firebase API Key configurado');
  }

  // Verificar Firebase Auth Domain
  const firebaseAuthDomain = process.env.REACT_APP_FIREBASE_AUTH_DOMAIN;
  if (!firebaseAuthDomain) {
    errors.push('❌ REACT_APP_FIREBASE_AUTH_DOMAIN no está configurado');
  } else {
    console.log('✅ Firebase Auth Domain configurado');
  }

  // Verificar Firebase Project ID
  const firebaseProjectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
  if (!firebaseProjectId) {
    errors.push('❌ REACT_APP_FIREBASE_PROJECT_ID no está configurado');
  } else {
    console.log('✅ Firebase Project ID configurado');
  }

  // Advertencia: Google Web Client ID es opcional
  const googleWebClientId = process.env.REACT_APP_GOOGLE_WEB_CLIENT_ID;
  if (!googleWebClientId) {
    warnings.push('⚠️ REACT_APP_GOOGLE_WEB_CLIENT_ID no está configurado (opcional para Expo)');
  } else {
    console.log('✅ Google Web Client ID configurado');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Mostrar resultado de validación en consola
 */
export const logValidationResult = (result: ValidationResult): void => {
  if (result.isValid) {
    console.log('✅ ¡Configuración de Google OAuth es válida!');
  } else {
    console.error('❌ Errores en configuración de Google OAuth:');
    result.errors.forEach(error => console.error(error));
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️ Advertencias:');
    result.warnings.forEach(warning => console.warn(warning));
  }
};

/**
 * Validar que Firebase esté inicializado
 */
export const validateFirebaseInit = async (): Promise<boolean> => {
  try {
    const { getFirebaseAuth } = await import('../../config/firebase');
    const auth = await getFirebaseAuth();
    
    if (!auth) {
      console.error('❌ Firebase Auth no está inicializado');
      return false;
    }

    console.log('✅ Firebase Auth inicializado correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error inicializando Firebase:', error);
    return false;
  }
};

/**
 * Validar que expo-auth-session esté disponible
 */
export const validateExpoAuthSession = (): boolean => {
  try {
    require('expo-auth-session');
    console.log('✅ expo-auth-session disponible');
    return true;
  } catch (error) {
    console.error('❌ expo-auth-session no está instalado');
    return false;
  }
};

/**
 * Ejecutar todas las validaciones
 */
export const runAllValidations = async (): Promise<boolean> => {
  console.log('🔍 Ejecutando validaciones de Google OAuth...\n');

  const configValid = validateGoogleAuthConfig();
  logValidationResult(configValid);

  const firebaseValid = await validateFirebaseInit();
  const expoValid = validateExpoAuthSession();

  const allValid = configValid.isValid && firebaseValid && expoValid;

  if (allValid) {
    console.log('\n✅ ¡Todas las validaciones pasaron! Google OAuth está listo.');
  } else {
    console.error('\n❌ Algunas validaciones fallaron. Revisa los errores arriba.');
  }

  return allValid;
};
