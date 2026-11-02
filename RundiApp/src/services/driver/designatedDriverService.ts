/**
 * Designated Driver Service — v2 REST /v1/drivers/me/designated-access.
 */

import {
  getDesignatedDriverRequestStatus as getStatusV2,
  requestDesignatedDriverAccess as requestAccessV2,
} from '../../api/drivers';

class DesignatedDriverService {
  /**
   * Solicitar acceso a Conductor Designado
   */
  async requestDesignatedDriverAccess() {
    try {
      console.log('🚙 Solicitando acceso a Conductor Designado...');
      const requestId = await requestAccessV2();
      const data = { success: true, requestId };
      console.log('✅ Solicitud enviada exitosamente:', data);
      return data;
    } catch (error: any) {
      console.error('❌ Error solicitando acceso:', error);
      throw new Error(error.message || 'Error al solicitar acceso a Conductor Designado');
    }
  }

  /**
   * Obtener estado de solicitud de Conductor Designado
   */
  async getDesignatedDriverRequestStatus() {
    try {
      console.log('📋 Obteniendo estado de solicitud de Conductor Designado...');
      const status = await getStatusV2();
      const data = { success: true, status };
      console.log('✅ Estado de solicitud obtenido:', data);
      return data;
    } catch (error: any) {
      console.error('❌ Error obteniendo estado:', error);
      throw new Error(error.message || 'Error al obtener estado de solicitud');
    }
  }
}

export default new DesignatedDriverService();
