import * as functions from "firebase-functions";
import { sendToSegment } from "../services/notificationCenter";

type NotificationSegment = "all" | "clients" | "drivers" | "users";

interface AdminNotificationRequest {
  segment: NotificationSegment;
  userIds?: string[];
  title: string | { es: string; en: string };
  body: string | { es: string; en: string };
  data?: Record<string, string>;
  category?: "promo" | "notice" | "account";
}

const isAdmin = (context: any): boolean => {
  const token = context?.auth?.token || {};
  const tokenRole = typeof token.role === "string" ? String(token.role).toLowerCase() : undefined;
  return (
    token?.admin === true ||
    tokenRole === "admin" ||
    tokenRole === "operator" ||
    tokenRole === "support"
  );
};

export const sendAdminNotification = functions.https.onCall(
  async (data: AdminNotificationRequest, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
    }

    if (!isAdmin(context)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Solo administradores pueden enviar notificaciones admin."
      );
    }

    const segment = data?.segment;
    if (!segment || !["all", "clients", "drivers", "users"].includes(segment)) {
      throw new functions.https.HttpsError("invalid-argument", "segment debe ser: all, clients, drivers o users");
    }

    if (segment === "users" && (!data.userIds?.length || !Array.isArray(data.userIds))) {
      throw new functions.https.HttpsError("invalid-argument", "userIds es requerido cuando segment es 'users'");
    }

    if (!data.title || !data.body) {
      throw new functions.https.HttpsError("invalid-argument", "title y body son requeridos");
    }

    const targeted = await sendToSegment({
      segment,
      userIds: data.userIds,
      title: data.title,
      body: data.body,
      data: data.data,
      category: data.category,
    });

    return { success: true, targeted };
  }
);
