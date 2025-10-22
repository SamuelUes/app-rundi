/**
 * Designated Driver Service
 * Servicio para gestionar solicitudes de acceso a Conductor Designado
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

class DesignatedDriverService {
  /**
   * Solicitar acceso a Conductor Designado
   */
  async requestDesignatedDriverAccess() {
    try {
      console.log('🚙 Solicitando acceso a Conductor Designado...');
      
      const functions = await getFirebaseFunctions();
      const requestAccessFn = httpsCallable(functions, 'requestDesignatedDriverAccess');
      
      const result: any = await requestAccessFn({});
      
      console.log('✅ Solicitud enviada exitosamente:', result.data);
      
      return result.data;
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
      
      const functions = await getFirebaseFunctions();
      const getStatusFn = httpsCallable(functions, 'getDesignatedDriverRequestStatus');
      
      const result: any = await getStatusFn({});
      
      console.log('✅ Estado de solicitud obtenido:', result.data);
      
      return result.data;
    } catch (error: any) {
      console.error('❌ Error obteniendo estado:', error);
      throw new Error(error.message || 'Error al obtener estado de solicitud');
    }
  }
}

export default new DesignatedDriverService();
