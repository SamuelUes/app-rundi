/**
 * PUSH NOTIFICATION SERVICE
 *
 * Legacy adapter (NO source of truth).
 * La ingestión y enrutamiento de notificaciones push se maneja en useNotifications.
 */

class PushNotificationService {
  private initialized = false;

  /**
   * Inicializar servicio legacy (no-op)
   */
  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    console.log('[pushNotificationService] Legacy mode activo: usar useNotifications + notificationService.');
  }

  /**
   * Enviar notificación de prueba (legacy no-op)
   */
  async sendTestNotification() {
    console.log('[pushNotificationService] Legacy mode: usar callable sendTestNotification backend.');
  }
}

export default new PushNotificationService();
