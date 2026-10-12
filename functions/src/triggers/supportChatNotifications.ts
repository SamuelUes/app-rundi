import * as functions from 'firebase-functions/v1';
import { database, firestore } from '../config/firebase';
import { notifySupportChatMessage } from '../api/support_complaints';
import { sendToUser } from '../services/notificationCenter';
import { supabaseGet } from '../supabase/client';
import { PUSH_NOTIFICATIONS_ENABLED } from '../config/constants';

const sendRideChatMessageNotification = async (
  rideId: string,
  messageId: string,
  value: Record<string, any>,
): Promise<boolean> => {
  const [activeRideSnapshot, programmedRideSnapshot] = await Promise.all([
    database.ref(`activeRides/${rideId}`).once('value'),
    database.ref(`programmedRides/${rideId}`).once('value'),
  ]);
  const ride = activeRideSnapshot.val() || programmedRideSnapshot.val();
  if (!ride) return false;

  const fromUserId = typeof value.senderId === 'string' ? value.senderId.trim() : '';
  const messageText = typeof value.message === 'string' ? value.message.trim() : '';
  if (!fromUserId || !messageText) return true;

  const clientId = typeof ride.clientId === 'string' ? ride.clientId : '';
  const driverId = typeof ride.driverId === 'string' ? ride.driverId : '';
  const offers = ride.offers && typeof ride.offers === 'object' ? ride.offers : {};
  const senderIsDriver = fromUserId === driverId || Object.prototype.hasOwnProperty.call(offers, fromUserId) || (
    fromUserId !== clientId && ride.status === 'requested' &&
    (await database.ref(`driversInfo/${fromUserId}`).once('value')).exists()
  );
  let toUserId = '';

  if (fromUserId === clientId) {
    const requestedRecipientId = typeof value.recipientId === 'string' ? value.recipientId.trim() : '';
    if (requestedRecipientId && (requestedRecipientId === driverId || Object.prototype.hasOwnProperty.call(offers, requestedRecipientId))) {
      toUserId = requestedRecipientId;
    } else if (driverId) {
      toUserId = driverId;
    }
  } else if (senderIsDriver) {
    toUserId = clientId;
  }

  if (!toUserId || toUserId === fromUserId) return true;

  const presenceSnapshot = await database.ref(`chats/${rideId}/presence/${toUserId}`).once('value');
  if (presenceSnapshot.val() === true) return true;

  const senderName = typeof value.senderName === 'string' ? value.senderName.trim() : '';
  const messagePreview = messageText.length > 120 ? `${messageText.slice(0, 117)}...` : messageText;

  await sendToUser(toUserId, 'chat_message', {
    fallbackTitle: senderName ? `Nuevo mensaje de ${senderName}` : 'Nuevo mensaje',
    fallbackBody: messagePreview,
    data: {
      rideId,
      senderId: fromUserId,
      senderName,
    },
    notificationKey: `c-${rideId}-${messageId}`,
  });

  return true;
};

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
      if (!PUSH_NOTIFICATIONS_ENABLED) {
        return null;
      }

      const rawComplaintId = context.params.complaintId as string | undefined;
      const complaintId = (rawComplaintId || '').trim();
      if (!complaintId) {
        return null;
      }

      const value = snapshot.val() || {};
      if (await sendRideChatMessageNotification(complaintId, context.params.messageId, value)) {
        return null;
      }

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
        messageId: context.params.messageId,
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
