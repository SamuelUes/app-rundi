import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RideLocation } from './entities/ride-location.entity';
import { Ride } from '../rides/entities/ride.entity';
import { SaveLocationDto } from './dto/save-location.dto';

@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(RideLocation)
    private rideLocationRepository: Repository<RideLocation>,
    @InjectRepository(Ride)
    private rideRepository: Repository<Ride>,
  ) {}

  /**
   * Guardar ubicación del conductor durante el viaje
   * Solo se guarda si el viaje está en estado 'in_progress'
   */
  async saveLocation(dto: SaveLocationDto): Promise<RideLocation> {
    // Verificar que el viaje existe y está en progreso
    const ride = await this.rideRepository.findOne({
      where: { id: dto.rideId },
    });

    if (!ride) {
      throw new NotFoundException('Viaje no encontrado');
    }

    // Solo guardar si el viaje está en progreso
    if (ride.status !== 'in_progress') {
      throw new BadRequestException(
        `No se puede guardar ubicación. El viaje está en estado: ${ride.status}. Solo se guarda cuando está "in_progress"`,
      );
    }

    // Crear y guardar la ubicación
    const location = this.rideLocationRepository.create({
      ride,
      latitude: dto.latitude,
      longitude: dto.longitude,
      speed: dto.speed,
      heading: dto.heading,
      accuracy: dto.accuracy,
      timestamp: new Date(),
    });

    return await this.rideLocationRepository.save(location);
  }

  /**
   * Obtener historial completo de ruta de un viaje
   */
  async getRouteHistory(rideId: string): Promise<RideLocation[]> {
    const ride = await this.rideRepository.findOne({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Viaje no encontrado');
    }

    // Obtener todas las ubicaciones ordenadas por timestamp
    const locations = await this.rideLocationRepository.find({
      where: { ride: { id: rideId } },
      order: { timestamp: 'ASC' },
    });

    return locations;
  }

  /**
   * Calcular ETA (Estimated Time of Arrival)
   * Basado en distancia restante y velocidad promedio
   */
  async calculateETA(rideId: string, currentLat: number, currentLng: number): Promise<{
    etaMinutes: number;
    etaTime: string;
    distanceRemaining: number;
  }> {
    const ride = await this.rideRepository.findOne({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Viaje no encontrado');
    }

    // Calcular distancia restante (Haversine)
    const distanceRemaining = this.calculateDistance(
      currentLat,
      currentLng,
      ride.destinationLat,
      ride.destinationLng,
    );

    // Obtener velocidad promedio de las últimas 5 ubicaciones
    const recentLocations = await this.rideLocationRepository.find({
      where: { ride: { id: rideId } },
      order: { timestamp: 'DESC' },
      take: 5,
    });

    let avgSpeed = 30; // Default 30 km/h
    if (recentLocations.length > 0) {
      const speeds = recentLocations
        .filter(loc => loc.speed && loc.speed > 5) // Filtrar velocidades muy bajas
        .map(loc => loc.speed);
      
      if (speeds.length > 0) {
        avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      }
    }

    // Calcular ETA en minutos
    const etaMinutes = Math.round((distanceRemaining / avgSpeed) * 60);

    // Calcular hora de llegada
    const arrivalTime = new Date();
    arrivalTime.setMinutes(arrivalTime.getMinutes() + etaMinutes);
    const etaTime = arrivalTime.toLocaleTimeString('es-NI', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      etaMinutes,
      etaTime,
      distanceRemaining: Math.round(distanceRemaining * 1000) / 1000, // Redondear a 3 decimales
    };
  }

  /**
   * Verificar si el conductor se ha desviado de la ruta
   */
  async checkRouteDeviation(
    rideId: string,
    currentLat: number,
    currentLng: number,
  ): Promise<{
    isDeviated: boolean;
    deviationDistance: number;
  }> {
    const ride = await this.rideRepository.findOne({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Viaje no encontrado');
    }

    // Calcular distancia desde el punto actual hasta el destino
    const distanceToDestination = this.calculateDistance(
      currentLat,
      currentLng,
      ride.destinationLat,
      ride.destinationLng,
    );

    // Obtener la última ubicación guardada
    const lastLocation = await this.rideLocationRepository.findOne({
      where: { ride: { id: rideId } },
      order: { timestamp: 'DESC' },
    });

    if (!lastLocation) {
      return { isDeviated: false, deviationDistance: 0 };
    }

    // Calcular distancia desde la última ubicación guardada
    const distanceFromLastPoint = this.calculateDistance(
      currentLat,
      currentLng,
      lastLocation.latitude,
      lastLocation.longitude,
    );

    // Si se movió más de 0.5 km (500m) desde el último punto sin acercarse al destino
    const MAX_DEVIATION = 0.5; // km
    const isDeviated = distanceFromLastPoint > MAX_DEVIATION;

    return {
      isDeviated,
      deviationDistance: Math.round(distanceFromLastPoint * 1000), // en metros
    };
  }

  /**
   * Calcular distancia entre dos puntos (Haversine formula)
   * Retorna distancia en kilómetros
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Limpiar ubicaciones antiguas (opcional, para mantenimiento)
   */
  async cleanOldLocations(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.rideLocationRepository
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }
}
