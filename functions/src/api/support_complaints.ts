import * as functions from "firebase-functions";
import { database } from "../config/firebase";
import { supabasePost, supabaseGet, supabaseUpdate, supabaseUploadJsonToStorage } from "../supabase/client";
import { sendToUser } from "../services/notificationCenter";

/**
 * Tipo base de ticket de soporte expuesto al frontend / CMS
 */
export interface SupportTicket {
  id: string;
  rideId: string | null;
  clientId: string | null;
  driverId: string | null;
  createdByUserId: string;
  createdByRole: string;
  assignedToUserId: string | null;
  category: string;
  status: string;
  priority: string | null;
  title: string;
  description: string | null;
  resolutionNotes: string | null;
  chatLogUrl: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  resolvedAt: number | null;
}

const toTimestamp = (value: any): number | null => {
  if (!value) return null;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

/**
 * Enviar notificación push cuando hay un nuevo mensaje en el chat de soporte.
 * Esto se puede llamar desde triggers de RTDB (por ejemplo, onWrite en chats/{complaintId}/messages/{messageId}).
 */
export const notifySupportChatMessage = async (params: {
  complaintId: string;
  toUserId: string | null | undefined;
  fromUserId: string | null | undefined;
  fromRole?: string | null;
  messagePreview?: string | null;
}) => {
  const { complaintId, toUserId, fromUserId, fromRole, messagePreview } = params;

  if (!complaintId || !toUserId) {
    return;
  }

  try {
    // Cargar ticket para obtener título, categoría y rideId
    const rows = await supabaseGet(
      "cms_complaints",
      { id: complaintId, deleted_at: null },
      "id,ride_id,category,title,created_by_user_id,driver_id,client_id,status,priority",
      { limit: 1, requireServiceRole: true },
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      functions.logger.warn("[notifySupportChatMessage] No se encontró cms_complaints para enviar push", {
        complaintId,
      });

      return;
    }

    const row = rows[0];

    const title = typeof row.title === "string" && row.title.trim().length
      ? row.title.trim()
      : "Nuevo mensaje de soporte";

    const category = String(row.category || "support");
    const rideId = row.ride_id ? String(row.ride_id) : undefined;

    const bodyParts: string[] = [];
    if (fromRole) {
      const normalizedRole = String(fromRole).toLowerCase();
      if (normalizedRole === "operator" || normalizedRole === "support") {
        bodyParts.push("Un operador respondió a tu caso de soporte.");
      } else if (normalizedRole === "admin") {
        bodyParts.push("Un administrador respondió a tu caso de soporte.");
      }
    }

    if (messagePreview && messagePreview.trim().length) {
      bodyParts.push(messagePreview.trim());
    }

    const body = bodyParts.length
      ? bodyParts.join("\n")
      : "Tienes un nuevo mensaje en tu chat de soporte.";

    await sendToUser(toUserId, "support_ticket_message", {
      fallbackTitle: title,
      fallbackBody: body,
      data: {
        complaintId,
        rideId: rideId || undefined,
        category,
        title,
        fromUserId: fromUserId || undefined,
      },
      notificationKey: `support-${complaintId}`,
      expiresInMs: 60 * 60 * 1000,
    });
  } catch (error: any) {
    functions.logger.error("❌ [notifySupportChatMessage] Error enviando notificación de soporte", {
      complaintId,
      toUserId,
      error: error?.message,
    });
  }
};

const mapComplaintToTicket = (row: any): SupportTicket => {
  return {
    id: String(row.id),
    rideId: row.ride_id ?? null,
    clientId: row.client_id ?? null,
    driverId: row.driver_id ?? null,
    createdByUserId: row.created_by_user_id,
    createdByRole: row.created_by_role,
    assignedToUserId: row.assigned_to_user_id ?? null,
    category: row.category,
    status: row.status,
    priority: row.priority ?? null,
    title: row.title,
    description: row.description ?? null,
    resolutionNotes: row.resolution_notes ?? null,
    chatLogUrl: row.chat_log_url ?? null,
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
    resolvedAt: toTimestamp(row.resolved_at),
  };
};

const CHAT_ARCHIVE_BUCKET = "cms-complaints-logs";

const addSupportChatParticipant = async (complaintId: string, userId: string | null | undefined) => {
  if (!complaintId || !userId) return;
  try {
    await database.ref(`supportChatParticipants/${complaintId}/${userId}`).set(true);
  } catch (error: any) {
    functions.logger.warn("⚠️ No se pudo registrar participante del chat de soporte", {
      complaintId,
      userId,
      error: error?.message,
    });
  }
};

const archiveComplaintChat = async (complaintId: string): Promise<string | null> => {
  if (!complaintId) return null;

  try {
    functions.logger.info("🧾 Archivando chat de queja en Supabase Storage", { complaintId });

    const snap = await database.ref(`chats/${complaintId}/messages`).once("value");
    const raw = snap.val() || {};

    const messages = Object.entries<any>(raw).map(([key, value]) => ({
      id: key,
      ...value,
    }));

    const payload = {
      complaintId,
      archivedAt: new Date().toISOString(),
      messages,
    };

    const objectPath = `${complaintId}/${Date.now()}.json`;
    const publicUrl = await supabaseUploadJsonToStorage(CHAT_ARCHIVE_BUCKET, objectPath, payload);

    try {
      await supabaseUpdate("cms_complaints", complaintId, { chat_log_url: publicUrl });
    } catch (error: any) {
      functions.logger.warn("⚠️ No se pudo actualizar chat_log_url después de archivar chat", {
        complaintId,
        error: error?.message,
      });
    }

    return publicUrl;
  } catch (error: any) {
    functions.logger.error("❌ Error archivando chat de queja", {
      complaintId,
      error: error?.message,
    });
    return null;
  }
};

/**
 * Cloud Function: createSupportComplaint
 * Crea una queja en cms_complaints usando Supabase (service role)
 *
 * Espera data:
 * - rideId?: string | null
 * - category?: string (default: "service")
 * - priority?: string | null
 * - title: string
 * - description?: string | null
 * - userRole?: "client" | "driver" | "operator" | "admin" (default: "client")
 */
export const createSupportComplaint = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Autenticacion requerida");
  }

  const userId = context.auth.uid;

  const rawTitle = typeof data?.title === "string" ? data.title.trim() : "";
  if (!rawTitle) {
    throw new functions.https.HttpsError("invalid-argument", "El título de la queja es obligatorio.");
  }

  const rawCategory = typeof data?.category === "string" ? data.category.trim() : "";
  const category = rawCategory || "service";

  const priority = typeof data?.priority === "string" ? data.priority.trim() || null : null;

  const rawDescription = typeof data?.description === "string" ? data.description.trim() : "";
  const description = rawDescription.length > 0 ? rawDescription : null;

  const rawRideId = typeof data?.rideId === "string" ? data.rideId.trim() : "";
  const rideId = rawRideId.length > 0 ? rawRideId : null;

  const rawUserRole = typeof data?.userRole === "string" ? data.userRole.trim().toLowerCase() : "client";
  const allowedRoles = new Set(["client", "driver", "operator", "admin"]);
  const createdByRole = allowedRoles.has(rawUserRole) ? rawUserRole : "client";

  const payload: Record<string, any> = {
    ride_id: rideId,
    client_id: createdByRole === "client" ? userId : null,
    driver_id: createdByRole === "driver" ? userId : null,
    created_by_user_id: userId,
    created_by_role: createdByRole,
    assigned_to_user_id: null,
    category,
    status: "open",
    priority,
    title: rawTitle,
    description,
  };

  try {
    // Evitar duplicados por viaje/categoría para el mismo usuario (solo cuando hay rideId)
    if (rideId) {
      try {
        const existing = await supabaseGet(
          "cms_complaints",
          {
            created_by_user_id: userId,
            ride_id: rideId,
            category,
            deleted_at: null,
          },
          "id,status,ride_id,category,client_id,driver_id,created_by_user_id,created_by_role,assigned_to_user_id,priority,title,description,resolution_notes,chat_log_url,resolved_at,created_at,updated_at",
          {
            limit: 20,
            requireServiceRole: true,
          },
        );

        if (Array.isArray(existing) && existing.length > 0) {
          const existingOpen = existing.find((row: any) => {
            const status = String(row.status || "").toLowerCase();
            return status === "open" || status === "in_progress";
          });

          if (existingOpen) {
            const ticket = mapComplaintToTicket(existingOpen);
            functions.logger.info("ℹ️ Reutilizando queja de soporte existente para este viaje/categoría", {
              complaintId: ticket.id,
              rideId,
              category,
              userId,
            });
            await addSupportChatParticipant(ticket.id, userId);

            return {
              success: true,
              id: ticket.id,
              ticket,
              reused: true,
            };
          }
        }
      } catch (dupError: any) {
        functions.logger.warn("⚠️ No se pudo verificar duplicados de quejas antes de crear una nueva", {
          error: dupError?.message,
          rideId,
          category,
        });
      }
    }

    functions.logger.info("📝 Creando queja de soporte en cms_complaints", {
      userId,
      createdByRole,
      rideId,
      category,
      priority,
    });

    const result = await supabasePost("cms_complaints", payload);
    const row = Array.isArray(result) && result.length > 0 ? result[0] : null;

    if (!row || !row.id) {
      functions.logger.error("❌ Supabase POST no devolvió registro válido para cms_complaints", { result });
      throw new Error("Insert de cms_complaints no devolvió ID");
    }

    const ticket = mapComplaintToTicket(row);
    await addSupportChatParticipant(ticket.id, userId);

    return {
      success: true,
      id: ticket.id,
      ticket,
    };
  } catch (error: any) {
    functions.logger.error("❌ Error creando queja de soporte en cms_complaints", {
      error: error?.message,
      stack: error?.stack,
      userId,
    });

    throw new functions.https.HttpsError(
      "internal",
      "No se pudo crear la queja de soporte. Intenta nuevamente más tarde.",
    );
  }
});


/**
 * Cloud Function: requestSupportCall
 * Registra una solicitud de llamada de soporte vinculada a un complaintId.
 */
export const requestSupportCall = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Autenticacion requerida");
  }

  const uid = context.auth.uid;
  const complaintId = typeof data?.complaintId === "string" ? data.complaintId.trim() : "";

  if (!complaintId) {
    throw new functions.https.HttpsError("invalid-argument", "Se requiere complaintId.");
  }

  try {
    const rows = await supabaseGet(
      "cms_complaints",
      { id: complaintId, deleted_at: null },
      "id,title,ride_id,status,created_by_user_id,client_id,driver_id,assigned_to_user_id",
      { limit: 1, requireServiceRole: true },
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new functions.https.HttpsError("not-found", "No se encontro el caso de soporte.");
    }

    const complaint = rows[0] || {};
    const participants = [
      complaint.created_by_user_id,
      complaint.client_id,
      complaint.driver_id,
    ]
      .filter(Boolean)
      .map((id: any) => String(id));

    if (!participants.includes(uid)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "No tienes permisos para solicitar llamada en este caso.",
      );
    }

    const status = String(complaint.status || "").toLowerCase();
    if (status === "resolved" || status === "rejected") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "No se puede solicitar llamada para un caso cerrado.",
      );
    }

    const requestRef = database.ref(`support_call_requests/${complaintId}`).push();
    const requestId = requestRef.key;
    const now = Date.now();

    await requestRef.set({
      id: requestId,
      complaintId,
      rideId: complaint.ride_id ?? null,
      requestedByUserId: uid,
      assignedToUserId: complaint.assigned_to_user_id ?? null,
      status: "pending",
      source: "support_chat_client",
      createdAt: now,
      updatedAt: now,
    });

    if (complaint.assigned_to_user_id) {
      await sendToUser(String(complaint.assigned_to_user_id), "support_call", {
        fallbackTitle: "Solicitud de llamada de soporte",
        fallbackBody: `El usuario solicito una llamada en el caso ${complaintId}.`,
        data: {
          complaintId,
          requestId: requestId || undefined,
          requestedByUserId: uid,
        },
        notificationKey: `support-call-request-${complaintId}`,
        expiresInMs: 30 * 60 * 1000,
      });
    }

    return {
      success: true,
      complaintId,
      requestId: requestId || null,
      status: "pending",
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    functions.logger.error(" Error registrando solicitud de llamada de soporte", {
      complaintId,
      uid,
      error: error?.message,
      stack: error?.stack,
    });

    throw new functions.https.HttpsError(
      "internal",
      "No se pudo solicitar la llamada de soporte. Intenta nuevamente mas tarde.",
    );
  }
});
/**
 * HTTP endpoint (sin auth) para soft-delete de tickets.
 * Actualiza show='only_platform' en Supabase.
 */
export const deleteSupportTicketHttp = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed', message: 'Solo se permite POST' });
    return;
  }

  const ticketIdRaw = (req.body?.ticketId ?? req.body?.data?.ticketId) as string | undefined;
  const ticketId = typeof ticketIdRaw === 'string' ? ticketIdRaw.trim() : '';

  functions.logger.info('[deleteSupportTicketHttp] Incoming HTTP request', {
    ticketIdProvided: Boolean(ticketId),
    origin: req.headers?.origin ?? null,
    userAgent: req.headers?.['user-agent'] ?? null,
  });

  if (!ticketId) {
    res.status(400).json({ error: 'invalid-argument', message: 'Se requiere un ticketId válido.' });
    return;
  }

  try {
    await supabaseUpdate('cms_complaints', ticketId, { show: 'only_platform' });
    res.status(200).json({ success: true, archivedChatUrl: null });
  } catch (error: any) {
    functions.logger.error('❌ Error eliminando ticket de soporte (HTTP)', {
      ticketId,
      error: error?.message,
      stack: error?.stack,
    });

    res.status(500).json({
      error: 'internal',
      message: 'No se pudo eliminar el ticket de soporte. Intenta nuevamente más tarde.',
    });
  }
});

/**
 * Cloud Function: getSupportTickets
 * Obtiene quejas de cms_complaints en formato de "tickets".
 *
 * data:
 * - scope?: "mine" | "all" (default: "mine"); "all" requiere rol admin/operator en custom claims.
 * - status?: string
 * - category?: string
 * - priority?: string
 * - pageSize?: number (default: 50, max: 200)
 */
export const getSupportTickets = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Autenticacion requerida");
  }

  const uid = context.auth.uid;
  const scope = data?.scope === "all" ? "all" : "mine";

  // Detectar posible rol administrativo desde custom claims (si se configura)
  const token: any = context.auth.token || {};
  const tokenRole = typeof token.role === "string" ? String(token.role).toLowerCase() : undefined;
  const isAdminLike =
    token?.admin === true ||
    tokenRole === "admin" ||
    tokenRole === "operator" ||
    tokenRole === "support";

  const effectiveScope = scope === "all" && isAdminLike ? "all" : "mine";

  const filters: Record<string, any> = {};

  const rawTicketId = typeof data?.ticketId === "string" ? data.ticketId.trim() : "";
  if (rawTicketId) {
    filters.id = rawTicketId;
  }

  // Si no es admin/operator, limitar siempre a tickets creados por el usuario
  if (effectiveScope === "mine") {
    filters.created_by_user_id = uid;
    // Ocultar tickets "borrados" desde la app.
    filters.show = "All";
  }

  // Excluir tickets con soft delete
  filters.deleted_at = null;

  const rawStatus = typeof data?.status === "string" ? data.status.trim() : "";
  if (rawStatus) {
    filters.status = rawStatus;
  }

  const rawCategoryFilter = typeof data?.category === "string" ? data.category.trim() : "";
  if (rawCategoryFilter) {
    filters.category = rawCategoryFilter;
  }

  const rawPriorityFilter = typeof data?.priority === "string" ? data.priority.trim() : "";
  if (rawPriorityFilter) {
    filters.priority = rawPriorityFilter;
  }

  const requestedPageSize = Number.isFinite(data?.pageSize) ? Number(data.pageSize) : 50;
  const pageSize = Math.min(Math.max(requestedPageSize || 50, 1), 200);

  try {
    functions.logger.info("📥 Obteniendo tickets de soporte desde cms_complaints", {
      uid,
      scope: effectiveScope,
      filters,
      pageSize,
    });

    const rows = await supabaseGet(
      "cms_complaints",
      filters,
      [
        "id",
        "ride_id",
        "client_id",
        "driver_id",
        "created_by_user_id",
        "created_by_role",
        "assigned_to_user_id",
        "category",
        "status",
        "priority",
        "title",
        "description",
        "resolution_notes",
        "chat_log_url",
        "resolved_at",
        "created_at",
        "updated_at",
      ].join(","),
      {
        limit: pageSize,
        requireServiceRole: true,
      },
    );

    let tickets: SupportTicket[] = Array.isArray(rows) ? rows.map(mapComplaintToTicket) : [];

    // Ordenar por fecha de creación (más recientes primero)
    tickets = tickets.sort((a, b) => {
      const ta = typeof a.createdAt === "number" ? a.createdAt : 0;
      const tb = typeof b.createdAt === "number" ? b.createdAt : 0;
      return tb - ta;
    });

    return {
      success: true,
      scope: effectiveScope,
      count: tickets.length,
      tickets,
    };
  } catch (error: any) {
    functions.logger.error("❌ Error obteniendo tickets de soporte desde cms_complaints", {
      error: error?.message,
      stack: error?.stack,
      uid,
    });

    throw new functions.https.HttpsError(
      "internal",
      "No se pudieron obtener los tickets de soporte. Intenta nuevamente más tarde.",
    );
  }
});

/**
 * Cloud Function: updateSupportTicket
 * Actualiza estado/prioridad/asignación/notas de resolución de un ticket.
 * Solo permitido para roles admin/operator/support (según custom claims).
 */
export const updateSupportTicket = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Autenticacion requerida");
  }

  const uid = context.auth.uid;
  const token: any = context.auth.token || {};
  const tokenRole = typeof token.role === "string" ? String(token.role).toLowerCase() : undefined;
  const isAdminOrOperator =
    token?.admin === true ||
    tokenRole === "admin" ||
    tokenRole === "operator" ||
    tokenRole === "support";

  if (!isAdminOrOperator) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Solo usuarios operadores o administradores pueden actualizar tickets de soporte.",
    );
  }

  const ticketId = typeof data?.ticketId === "string" ? data.ticketId.trim() : "";
  if (!ticketId) {
    throw new functions.https.HttpsError("invalid-argument", "Se requiere un ticketId válido.");
  }

  const updateData: Record<string, any> = {};

  if (typeof data?.status === "string") {
    const normalizedStatus = data.status.trim().toLowerCase();
    if (normalizedStatus) {
      updateData.status = normalizedStatus;
      if (normalizedStatus === "resolved") {
        updateData.resolved_at = new Date().toISOString();
      }
    }
  }

  if (typeof data?.priority === "string") {
    const normalizedPriority = data.priority.trim().toLowerCase();
    if (normalizedPriority) {
      updateData.priority = normalizedPriority;
    }
  }

  if ("assignedToUserId" in data) {
    const rawAssigned = typeof data.assignedToUserId === "string" ? data.assignedToUserId.trim() : "";
    updateData.assigned_to_user_id = rawAssigned || null;
  }

  if ("resolutionNotes" in data) {
    const rawNotes = typeof data.resolutionNotes === "string" ? data.resolutionNotes.trim() : "";
    updateData.resolution_notes = rawNotes || null;
  }

  if (Object.keys(updateData).length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "No se proporcionaron campos para actualizar en el ticket.",
    );
  }

  try {
    functions.logger.info("✏️ Actualizando ticket de soporte", {
      ticketId,
      uid,
      updateData,
    });

    const updatedRows = await supabaseUpdate("cms_complaints", ticketId, updateData);
    const row = Array.isArray(updatedRows) && updatedRows.length > 0 ? updatedRows[0] : null;

    if (!row) {
      throw new Error("No se encontró el ticket actualizado");
    }

    const ticket = mapComplaintToTicket(row);
    await addSupportChatParticipant(ticketId, ticket.assignedToUserId);

    let archivedChatUrl: string | null = null;
    if (updateData.status === "resolved") {
      archivedChatUrl = await archiveComplaintChat(ticketId);
    }

    return {
      success: true,
      ticket,
      archivedChatUrl,
    };
  } catch (error: any) {
    functions.logger.error("❌ Error actualizando ticket de soporte", {
      ticketId,
      uid,
      error: error?.message,
      stack: error?.stack,
    });

    throw new functions.https.HttpsError(
      "internal",
      "No se pudo actualizar el ticket de soporte. Intenta nuevamente más tarde.",
    );
  }
});

/**
 * Cloud Function: deleteSupportTicket (callable)
 * Soft-delete en Supabase (show='only_platform'). No RTDB, no archivo de chat, sin checks de auth.
 */
export const deleteSupportTicket = functions.https.onCall(async (data, context) => {
  const ticketIdRaw = typeof data?.ticketId === 'string' ? data.ticketId : undefined;
  const ticketId = typeof ticketIdRaw === 'string' ? ticketIdRaw.trim() : '';

  functions.logger.info('[deleteSupportTicket] Incoming callable', {
    ticketIdProvided: Boolean(ticketId),
    hasAuthContext: Boolean(context.auth),
    authUid: context.auth?.uid ?? null,
  });

  if (!ticketId) {
    throw new functions.https.HttpsError('invalid-argument', 'Se requiere un ticketId válido.');
  }

  try {
    await supabaseUpdate('cms_complaints', ticketId, { show: 'only_platform' });

    return {
      success: true,
      archivedChatUrl: null,
    };
  } catch (error: any) {
    functions.logger.error('❌ Error eliminando ticket de soporte (callable)', {
      ticketId,
      error: error?.message,
      stack: error?.stack,
    });

    throw new functions.https.HttpsError(
      'internal',
      'No se pudo eliminar el ticket de soporte. Intenta nuevamente más tarde.',
    );
  }
});
