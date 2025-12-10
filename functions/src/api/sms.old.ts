import * as functions from 'firebase-functions';

const buildDeprecatedResponse = (action: 'enviar' | 'verificar' | 'reanviar' | 'limpieza') => {
  return {
    success: false,
    message: `El servicio SMS propio fue descontinuado. Usa Firebase Auth Phone (${action}) desde el cliente.`,
  };
};

const throwDeprecatedError = () => {
  throw new functions.https.HttpsError(
    'failed-precondition',
    'El servicio SMS interno fue descontinuado. Usa Firebase Auth Phone directamente desde el cliente.'
  );
};

export const sendSmsCode = functions.https.onCall(async () => {
  throwDeprecatedError();
});

export const resendSmsCode = functions.https.onCall(async () => {
  throwDeprecatedError();
});

export const verifySmsCode = functions.https.onCall(async () => {
  throwDeprecatedError();
});

export const cleanupExpiredSmsCode = functions.https.onCall(async () => {
  return buildDeprecatedResponse('limpieza');
});
