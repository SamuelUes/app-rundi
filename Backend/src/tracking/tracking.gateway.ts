import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface LocationUpdate {
  rideId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  timestamp: string;
}

@WebSocketGateway({ namespace: '/tracking', cors: { origin: '*' } })
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // Mapa de viajes activos: rideId -> Set de socket IDs
  private activeRides = new Map<string, Set<string>>();
  
  // Mapa de conductores conectados: driverId -> socket ID
  private connectedDrivers = new Map<string, string>();

  handleConnection(socket: Socket) {
    console.log(`✅ Cliente conectado: ${socket.id}`);
  }

  handleDisconnect(socket: Socket) {
    console.log(`❌ Cliente desconectado: ${socket.id}`);
    
    // Limpiar de todos los viajes
    this.activeRides.forEach((sockets, rideId) => {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        this.activeRides.delete(rideId);
      }
    });
    
    // Limpiar de conductores conectados
    this.connectedDrivers.forEach((socketId, driverId) => {
      if (socketId === socket.id) {
        this.connectedDrivers.delete(driverId);
        console.log(`🚗 Conductor ${driverId} desconectado`);
      }
    });
  }

  /**
   * Cliente se suscribe a un viaje específico
   */
  @SubscribeMessage('ride:subscribe')
  handleSubscribe(
    @MessageBody() data: { rideId: string },
    @ConnectedSocket() socket: Socket
  ) {
    const { rideId } = data;
    
    // Unirse a la sala del viaje
    socket.join(`ride:${rideId}`);
    
    // Registrar en el mapa
    if (!this.activeRides.has(rideId)) {
      this.activeRides.set(rideId, new Set());
    }
    this.activeRides.get(rideId)!.add(socket.id);

    console.log(`📍 Cliente ${socket.id} suscrito al viaje ${rideId}`);
    
    return { 
      success: true, 
      message: `Suscrito al viaje ${rideId}`,
      subscribers: this.activeRides.get(rideId)!.size
    };
  }

  /**
   * Cliente se desuscribe de un viaje
   */
  @SubscribeMessage('ride:unsubscribe')
  handleUnsubscribe(
    @MessageBody() data: { rideId: string },
    @ConnectedSocket() socket: Socket
  ) {
    const { rideId } = data;
    
    socket.leave(`ride:${rideId}`);
    
    const sockets = this.activeRides.get(rideId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        this.activeRides.delete(rideId);
      }
    }

    console.log(`📍 Cliente ${socket.id} desuscrito del viaje ${rideId}`);
    
    return { success: true };
  }

  /**
   * Conductor actualiza su ubicación
   */
  @SubscribeMessage('location:update')
  handleLocationUpdate(
    @MessageBody() data: LocationUpdate,
    @ConnectedSocket() socket: Socket
  ) {
    const { rideId } = data;
    
    // Emitir a todos los suscritos a este viaje (excepto el emisor)
    socket.to(`ride:${rideId}`).emit('location:updated', {
      ...data,
      timestamp: new Date().toISOString(),
    });

    console.log(`🚗 Ubicación actualizada para viaje ${rideId}: ${data.latitude}, ${data.longitude}`);
    
    return { success: true };
  }

  /**
   * Notificar cambio de estado del viaje
   */
  @SubscribeMessage('ride:status')
  handleRideStatus(
    @MessageBody() data: { rideId: string; status: string; message?: string },
    @ConnectedSocket() socket: Socket
  ) {
    const { rideId, status, message } = data;
    
    // Emitir a todos los suscritos
    this.server.to(`ride:${rideId}`).emit('ride:status:changed', {
      rideId,
      status,
      message,
      timestamp: new Date().toISOString(),
    });

    console.log(`📢 Estado del viaje ${rideId} cambió a: ${status}`);
    
    return { success: true };
  }

  /**
   * Conductor se registra como disponible
   */
  @SubscribeMessage('driver:register')
  handleDriverRegister(
    @MessageBody() data: { driverId: string },
    @ConnectedSocket() socket: Socket
  ) {
    const { driverId } = data;
    this.connectedDrivers.set(driverId, socket.id);
    console.log(`🚗 Conductor ${driverId} registrado y disponible`);
    return { success: true, message: 'Driver registered successfully' };
  }

  /**
   * Conductor se desregistra
   */
  @SubscribeMessage('driver:unregister')
  handleDriverUnregister(
    @MessageBody() data: { driverId: string },
    @ConnectedSocket() socket: Socket
  ) {
    const { driverId } = data;
    this.connectedDrivers.delete(driverId);
    console.log(`🚗 Conductor ${driverId} desregistrado`);
    return { success: true };
  }

  /**
   * Notificar a todos los conductores conectados sobre un nuevo viaje
   */
  notifyNewRide(rideData: any) {
    const connectedCount = this.connectedDrivers.size;
    
    if (connectedCount === 0) {
      console.log('⚠️ No hay conductores conectados para notificar');
      return;
    }

    // Emitir a todos los conductores conectados
    this.connectedDrivers.forEach((socketId, driverId) => {
      this.server.to(socketId).emit('ride:new', {
        ...rideData,
        timestamp: new Date().toISOString(),
      });
    });

    console.log(`📢 Nuevo viaje ${rideData.id} notificado a ${connectedCount} conductores`);
  }

  /**
   * Notificar que un viaje fue aceptado
   */
  notifyRideAccepted(rideId: string, driverData: any) {
    this.server.to(`ride:${rideId}`).emit('ride:accepted', {
      rideId,
      driver: driverData,
      timestamp: new Date().toISOString(),
    });
    
    console.log(`✅ Viaje ${rideId} aceptado - notificación enviada`);
  }

  /**
   * Obtener número de suscriptores de un viaje
   */
  getSubscribersCount(rideId: string): number {
    return this.activeRides.get(rideId)?.size || 0;
  }

  /**
   * Obtener número de conductores conectados
   */
  getConnectedDriversCount(): number {
    return this.connectedDrivers.size;
  }

  /**
   * Enviar mensaje de chat en un viaje
   */
  @SubscribeMessage('chat:message')
  handleChatMessage(
    @MessageBody() data: { 
      rideId: string; 
      senderId: string;
      senderName: string;
      message: string;
      timestamp?: string;
    },
    @ConnectedSocket() socket: Socket
  ) {
    const { rideId, senderId, senderName, message } = data;
    
    // Emitir a todos los suscritos al viaje (excepto el emisor)
    socket.to(`ride:${rideId}`).emit('chat:message', {
      rideId,
      senderId,
      senderName,
      message,
      timestamp: new Date().toISOString(),
    });

    console.log(`💬 Mensaje en viaje ${rideId} de ${senderName}: ${message}`);
    
    return { success: true };
  }

  /**
   * Usuario está escribiendo
   */
  @SubscribeMessage('chat:typing')
  handleChatTyping(
    @MessageBody() data: { rideId: string; userId: string; userName: string },
    @ConnectedSocket() socket: Socket
  ) {
    const { rideId, userId, userName } = data;
    
    socket.to(`ride:${rideId}`).emit('chat:typing', {
      rideId,
      userId,
      userName,
    });
    
    return { success: true };
  }
}

