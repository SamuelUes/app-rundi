import * as functions from 'firebase-functions';
import { firestore } from '../config/firebase';
import { notifySupportChatMessage } from '../api/support_complaints';
import { supabaseGet } from '../supabase/client';

// Flag opcional para desactivar push desde configuración de entorno
const FUNCTIONS_PUSH_NOTIFICATIONS_ENABLED =
  process.env.FUNCTIONS_PUSH_NOTIFICATIONS_ENABLED !== 'false';

/**
 * Trigger de Realtime Database:
 * Se ejecuta cuando se crea un nuevo mensaje en chats/{complaintId}/messages/{messageId}.
 * Si el mensaje proviene de un operador/admin/support, envía una notificación push
 * al usuario creador del ticket de soporte.
 */
export const onSupportChatMessage = functions.database
  .ref('chats/{complaintId}/messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    try {
      if (!FUNCTIONS_PUSH_NOTIFICATIONS_ENABLED) {
        return null;
      }

      const rawComplaintId = context.params.complaintId as string | undefined;
      const complaintId = (rawComplaintId || '').trim();
      if (!complaintId) {
        return null;
      }

      const value = snapshot.val() || {};
      const rawSenderId = typeof value.senderId === 'string' ? value.senderId.trim() : '';
      const fromUserId = rawSenderId || null;
      const rawMessage = typeof value.message === 'string' ? value.message : '';
      const messageText = rawMessage.trim();

      if (!fromUserId || !messageText) {
        return null;
      }

      // Cargar la queja para obtener el usuario creador (cliente/conductor)
      const complaints = await supabaseGet(
        'cms_complaints',
        { id: complaintId },
        'id,created_by_user_id,created_by_role',
        { limit: 1, requireServiceRole: true },
      );

      if (!Array.isArray(complaints) || complaints.length === 0) {
        return null;
      }

      const complaint = complaints[0] as any;
      const toUserId = typeof complaint.created_by_user_id === 'string'
        ? complaint.created_by_user_id
        : null;

      // No notificar si el propio usuario es quien envía el mensaje
      if (!toUserId || toUserId === fromUserId) {
        return null;
      }

      // Buscar rol del remitente en colección Firestore "cms-users" para asegurarnos que sea operador/admin/support
      let fromRole: string | null = null;
      try {
        const docSnap = await firestore.collection('cms-users').doc(fromUserId).get();
        if (docSnap.exists) {
          const data = docSnap.data() as any;
          if (data && typeof data.role === 'string') {
            fromRole = data.role.trim().toLowerCase();
          }
        }
      } catch (roleError) {
        functions.logger.warn('[onSupportChatMessage] Error leyendo Firestore cms-users para rol de remitente', {
          complaintId,
          fromUserId,
          error: (roleError as any)?.message,
        });
      }

      const allowedRoles = new Set(['admin', 'operator', 'support']);
      if (!fromRole || !allowedRoles.has(fromRole)) {
        // No enviar notificación si no es rol de operador/soporte
        return null;
      }

      const messagePreview = messageText.length > 120
        ? `${messageText.slice(0, 117)}...`
        : messageText;

      await notifySupportChatMessage({
        complaintId,
        toUserId,
        fromUserId,
        fromRole,
        messagePreview,
      });

      return null;
    } catch (error) {
      functions.logger.error('❌ [onSupportChatMessage] Error procesando mensaje de soporte', {
        error: (error as any)?.message,
      });
      return null;
    }
  });
