import * as functions from "firebase-functions";
// import * as admin from "firebase-admin";

export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  console.log(`🆕 Usuario creado: ${user.uid}`);
  // Aquí puedes agregar lógica adicional
});

// ELIMINADO: onUserDeleted - Reemplazado por deleteUserFromSupabase en user/deleteUserData.ts
// La función deleteUserFromSupabase maneja toda la lógica de eliminación de datos
// tanto en Firebase como en Supabase
