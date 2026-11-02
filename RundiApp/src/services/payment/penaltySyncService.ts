/**
 * @deprecated v2: sin entidad penalty separada; la deuda de comisiones cash
 * vive en /v1/payments/pending. No-op de compatibilidad.
 */
class PenaltySyncService {
  async syncPenaltyToSupabase(_penaltyId: string): Promise<{ success: boolean }> {
    return { success: true };
  }

  async syncPenaltiesBatch(_penaltyIds: string[]): Promise<{ success: boolean }> {
    return { success: true };
  }
}

export default new PenaltySyncService();
