import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config/api';
import i18n from '../i18n';

class TrackingService {
  private socket: Socket | null = null;
  private currentRideId: string | null = null;
  private tr(path: string, options?: Record<string, any>) {
    return i18n.t(`services.trackingService.${path}`, options) as string;
  }

  /**
   * Conectar al servidor de tracking
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      const url = API_BASE_URL.replace('/api', '');
      this.socket = io(`${url}/tracking`, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      });

      this.socket.on('connect', () => {
        console.log('✅ Conectado al servidor de tracking');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Error de conexión:', error);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        console.log('❌ Desconectado del servidor de tracking');
      });
    });
  }

  /**
   * Suscribirse a un viaje específico
   */
  async subscribeToRide(rideId: string): Promise<void> {
    if (!this.socket?.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit('ride:subscribe', { rideId }, (response: any) => {
        if (response.success) {
          this.currentRideId = rideId;
          console.log(`📍 Suscrito al viaje ${rideId}`);
          resolve();
        } else {
          reject(new Error(this.tr('errors.subscribeFailed')));
        }
      });
    });
  }

  /**
   * Desuscribirse de un viaje
   */
  unsubscribeFromRide(rideId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('ride:unsubscribe', { rideId });
      if (this.currentRideId === rideId) {
        this.currentRideId = null;
      }
      console.log(`📍 Desuscrito del viaje ${rideId}`);
    }
  }

  /**
   * Actualizar ubicación del conductor (solo para conductores)
   */
  updateLocation(data: {
    rideId: string;
    driverId: string;
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
  }): void {
    if (this.socket?.connected) {
      this.socket.emit('location:update', {
        ...data,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Escuchar actualizaciones de ubicación
   */
  onLocationUpdate(callback: (data: {
    rideId: string;
    driverId: string;
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
    timestamp: string;
  }) => void): void {
    if (this.socket) {
      this.socket.on('location:updated', callback);
    }
  }

  /**
   * Notificar cambio de estado del viaje
   */
  updateRideStatus(rideId: string, status: string, message?: string): void {
    if (this.socket?.connected) {
      this.socket.emit('ride:status', { rideId, status, message });
    }
  }

  /**
   * Escuchar cambios de estado del viaje
   */
  onRideStatusChange(callback: (data: {
    rideId: string;
    status: string;
    message?: string;
    timestamp: string;
  }) => void): void {
    if (this.socket) {
      this.socket.on('ride:status:changed', callback);
    }
  }

  /**
   * Remover listeners
   */
  removeListener(event: string, callback?: Function): void {
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback as any);
      } else {
        this.socket.off(event);
      }
    }
  }

  /**
   * Desconectar
   */
  disconnect(): void {
    if (this.socket) {
      if (this.currentRideId) {
        this.unsubscribeFromRide(this.currentRideId);
      }
      this.socket.disconnect();
      this.socket = null;
      console.log('❌ Desconectado del tracking');
    }
  }

  /**
   * Verificar si está conectado
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export default new TrackingService();
