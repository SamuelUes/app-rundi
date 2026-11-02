/**
 * @deprecated v2: la sincronización driver↔SQL es responsabilidad del backend
 * (proyecciones outbox → Firestore). No-op de compatibilidad.
 */
class DriverServiceSyncService {
  async syncDriverServiceToSupabase(_driverServiceId: string): Promise<{ success: boolean }> {
    return { success: true };
  }

  async syncDriverServicesBatch(_driverServiceIds: string[]): Promise<{ success: boolean }> {
    return { success: true };
  }
}

export default new DriverServiceSyncService();
