import * as functions from "firebase-functions";
// import * as admin from "firebase-admin";

export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  console.log(`🆕 Usuario creado: ${user.uid}`);
  // Aquí puedes agregar lógica adicional
});

export const onUserDeleted = functions.auth.user().onDelete(async (user) => {
  console.log(`🗑️ Usuario eliminado: ${user.uid}`);
  // Limpiar datos del usuario
});
