/**
 * Limpia mensajes antiguos de chats
 * Se ejecuta cada 6 horas
 * Mantiene solo los últimos 100 mensajes por chat
 */

import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';

export const cleanupChatMessages = functions
  .runWith({ memory: '256MB', maxInstances: 1 })
  .pubsub
  .schedule('every 6 hours')  // Cada 6 horas (00:00, 06:00, 12:00, 18:00)
  .timeZone('America/Managua')
  .onRun(async (context) => {
    console.log('🧹 Iniciando limpieza de mensajes de chat...');

    try {
      const db = admin.database();
      const chatsRef = db.ref('/chats');

      let totalCleaned = 0;
      let processedCount = 0;

      // Paginación: procesar en lotes de 100 chats
      const BATCH_SIZE = 100;
      let lastKey: string | null = null;
      let hasMore = true;

      while (hasMore) {
        let query = chatsRef.orderByKey().limitToFirst(BATCH_SIZE);
        if (lastKey) {
          query = chatsRef.orderByKey().startAfter(lastKey).limitToFirst(BATCH_SIZE);
        }

        const snapshot = await query.once('value');

        if (!snapshot.exists()) {
          hasMore = false;
          break;
        }

        const chats = snapshot.val();
        const entries = Object.entries(chats) as [string, any][];

        if (entries.length === 0) {
          hasMore = false;
          break;
        }

        lastKey = entries[entries.length - 1][0];

        for (const [chatId, chat] of entries) {
          processedCount++;

          if (!chat.messages) continue;

          const messagesArray = Object.entries(chat.messages)
            .map(([key, value]: [string, any]) => ({
              key,
              timestamp: value.timestamp || 0
            }))
            .sort((a, b) => b.timestamp - a.timestamp);

          if (messagesArray.length > 100) {
            const toDelete = messagesArray.slice(100);

            console.log(`🗑️ Chat ${chatId}: ${toDelete.length} mensajes a eliminar`);

            const updates: Record<string, null> = {};
            toDelete.forEach(msg => {
              updates[`/chats/${chatId}/messages/${msg.key}`] = null;
            });

            await db.ref().update(updates);
            totalCleaned += toDelete.length;
          }
        }

        if (entries.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      console.log(`✅ Limpieza completada: ${totalCleaned} mensajes eliminados de ${processedCount} chats procesados`);
      return { success: true, cleaned: totalCleaned };

    } catch (error: any) {
      console.error('❌ Error limpiando mensajes:', error);
      return { success: false, error: error.message };
    }
  });
