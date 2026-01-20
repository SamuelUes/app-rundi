import * as functions from 'firebase-functions';
import { auth, firestore } from '../config/firebase';

interface SyncUserRolePayload {
  userId?: string;
}

const ADMIN_LIKE_ROLES = new Set(['admin', 'operator', 'support']);

async function applyCustomClaimsFromRole(userId: string, role: string | null): Promise<void> {
  const userRecord = await auth.getUser(userId);
  const prevClaims = (userRecord.customClaims || {}) as Record<string, any>;

  const nextClaims: Record<string, any> = { ...prevClaims };

  // Limpiar claves relacionadas con rol para evitar inconsistencias
  delete nextClaims.role;
  delete nextClaims.admin;

  if (role) {
    nextClaims.role = role;
    if (role === 'admin') {
      nextClaims.admin = true;
    }
  }

  await auth.setCustomUserClaims(userId, nextClaims);
}

/**
 * Sincroniza el rol de un usuario desde la tabla cms_users hacia Firebase Auth custom claims.
 *
 * data:
 * - userId?: string (por defecto context.auth.uid)
 */
export const syncUserRoleFromCms = functions.https.onCall(async (data: SyncUserRolePayload, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Autenticación requerida');
  }

  const targetUserIdRaw = typeof data?.userId === 'string' ? data.userId.trim() : context.auth.uid;
  const targetUserId = targetUserIdRaw || context.auth.uid;

  if (!targetUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId es requerido para sincronizar rol');
  }

  try {
    // Leer documento correspondiente en colección Firestore "cms-users"
    const docSnap = await firestore.collection('cms-users').doc(targetUserId).get();

    if (!docSnap.exists) {
      functions.logger.warn('[syncUserRoleFromCms] No se encontró documento en cms-users (Firestore) para usuario', {
        userId: targetUserId,
      });

      await applyCustomClaimsFromRole(targetUserId, null);
      return { success: true, userId: targetUserId, role: null };
    }

    const cmsUser = docSnap.data() as any;
    const rawRole = typeof cmsUser.role === 'string' ? cmsUser.role.trim().toLowerCase() : '';
    const role = rawRole || null;

    await applyCustomClaimsFromRole(targetUserId, role);

    return {
      success: true,
      userId: targetUserId,
      role,
      isAdminLike: role ? ADMIN_LIKE_ROLES.has(role) : false,
    };
  } catch (error: any) {
    functions.logger.error('❌ [syncUserRoleFromCms] Error sincronizando rol de usuario', {
      userId: targetUserId,
      error: error?.message,
    });
    throw new functions.https.HttpsError(
      'internal',
      error?.message || 'No se pudo sincronizar el rol del usuario desde cms_users',
    );
  }
});
