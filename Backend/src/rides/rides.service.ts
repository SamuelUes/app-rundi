import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ride, RideStatus, RideType, CancelReason } from './entities/ride.entity';
import { Rating } from './entities/rating.entity';
import { VehicleInspection } from './entities/vehicle-inspection.entity';
import { RequestRideDto } from './dto/request-ride.dto';
import { UpdateRideStatusDto } from './dto/update-ride-status.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { AcceptRideDto } from './dto/accept-ride.dto';
import { CreateVehicleInspectionDto } from './dto/create-vehicle-inspection.dto';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class RidesService {
  constructor(
    @InjectRepository(Ride)
    private readonly rideRepository: Repository<Ride>,
    @InjectRepository(Rating)
    private readonly ratingRepository: Repository<Rating>,
    @InjectRepository(VehicleInspection)
    private readonly inspectionRepository: Repository<VehicleInspection>,
    @Inject(forwardRef(() => TrackingGateway))
    private readonly trackingGateway: TrackingGateway,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
  ) {}

  async findAll(): Promise<Ride[]> {
    return this.rideRepository.find({
      relations: ['client', 'driver', 'payment', 'ratings'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Ride> {
    const ride = await this.rideRepository.findOne({
      where: { id },
      relations: ['client', 'driver', 'payment', 'ratings'],
    });
    if (!ride) {
      throw new NotFoundException(`Ride with ID ${id} not found`);
    }
    return ride;
  }

  async findByClient(clientId: string): Promise<Ride[]> {
    return this.rideRepository.find({
      where: { clientId },
      relations: ['driver', 'payment'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByDriver(driverId: string): Promise<Ride[]> {
    return this.rideRepository.find({
      where: { driverId },
      relations: ['client', 'payment'],
      order: { createdAt: 'DESC' },
    });
  }

  async requestRide(requestRideDto: RequestRideDto): Promise<Ride> {
    // Validar que origen y destino sean diferentes
    const distance = this.calculateDistance(
      requestRideDto.origin.lat,
      requestRideDto.origin.lng,
      requestRideDto.destination.lat,
      requestRideDto.destination.lng,
    );

    if (distance < 0.1) {
      throw new BadRequestException('Origin and destination must be at least 100 meters apart');
    }

    // Validar que el precio estimado sea razonable
    const minPrice = 50;
    const maxPrice = (requestRideDto.estimatedDistance / 1000) * 50 + 100; // Precio máximo razonable
    
    if (requestRideDto.estimatedPrice < minPrice || requestRideDto.estimatedPrice > maxPrice) {
      throw new BadRequestException(`Estimated price must be between C$${minPrice} and C$${maxPrice.toFixed(0)}`);
    }

    const ride = this.rideRepository.create({
      clientId: requestRideDto.clientId,
      originLat: requestRideDto.origin.lat,
      originLng: requestRideDto.origin.lng,
      originAddress: requestRideDto.origin.address,
      destinationLat: requestRideDto.destination.lat,
      destinationLng: requestRideDto.destination.lng,
      destinationAddress: requestRideDto.destination.address,
      rideType: requestRideDto.rideType || RideType.NORMAL,
      clientSuggestedPrice: requestRideDto.clientSuggestedPrice,
      notes: requestRideDto.notes,
      status: RideStatus.REQUESTED,
      estimatedDistance: requestRideDto.estimatedDistance,
      estimatedDuration: requestRideDto.estimatedDuration,
      estimatedFare: requestRideDto.estimatedPrice,
    });

    const savedRide = await this.rideRepository.save(ride);
    console.log(`✅ Nueva solicitud de viaje creada: ${savedRide.id}`);
    
    // Notificar a conductores conectados
    this.trackingGateway.notifyNewRide({
      id: savedRide.id,
      originAddress: savedRide.originAddress,
      destinationAddress: savedRide.destinationAddress,
      estimatedDistance: savedRide.estimatedDistance,
      estimatedDuration: savedRide.estimatedDuration,
      estimatedFare: savedRide.estimatedFare,
      clientSuggestedPrice: savedRide.clientSuggestedPrice, // ✅ Incluir precio sugerido
      rideType: savedRide.rideType,
      createdAt: savedRide.createdAt,
    });
    
    return savedRide;
  }

  /**
   * Calcular distancia entre dos puntos (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distancia en km
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  async updateStatus(rideId: string, updateRideStatusDto: UpdateRideStatusDto): Promise<Ride> {
    const ride = await this.findOne(rideId);
    
    // Validar transiciones de estado
    this.validateStatusTransition(ride.status, updateRideStatusDto.status);
    
    Object.assign(ride, updateRideStatusDto);
    
    const updatedRide = await this.rideRepository.save(ride);

    // Si el viaje se completa, capturar el pago automáticamente
    if (updateRideStatusDto.status === RideStatus.COMPLETED) {
      try {
        await this.paymentsService.capturePayment(rideId);
        console.log(`💰 Pago capturado automáticamente para viaje ${rideId}`);
      } catch (error) {
        console.error(`❌ Error capturando pago para viaje ${rideId}:`, error);
        // No lanzar error para no bloquear la finalización del viaje
      }
    }
    
    return updatedRide;
  }

  async cancelRide(rideId: string, reason?: string): Promise<Ride> {
    const ride = await this.findOne(rideId);
    
    if (ride.status === RideStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed ride');
    }
    
    ride.status = RideStatus.CANCELED;
    const canceledRide = await this.rideRepository.save(ride);

    // Cancelar autorización de pago si existe
    try {
      await this.paymentsService.cancelPaymentAuthorization(rideId);
      console.log(`🔄 Autorización de pago cancelada para viaje ${rideId}`);
    } catch (error) {
      console.error(`❌ Error cancelando autorización para viaje ${rideId}:`, error);
      // No lanzar error para no bloquear la cancelación del viaje
    }

    return canceledRide;
  }

  async createRating(createRatingDto: CreateRatingDto): Promise<Rating> {
    const rating = this.ratingRepository.create(createRatingDto);
    return this.ratingRepository.save(rating);
  }

  /**
   * Obtener solicitudes de viaje disponibles para conductores
   * Filtra por tipo de viaje y ubicación
   */
  async findAvailableRides(
    lat?: number,
    lng?: number,
    radius?: number,
    rideType?: RideType,
  ): Promise<Ride[]> {
    const queryBuilder = this.rideRepository
      .createQueryBuilder('ride')
      .leftJoinAndSelect('ride.client', 'client')
      .where('ride.status = :status', { status: RideStatus.REQUESTED })
      .orderBy('ride.createdAt', 'DESC');

    // Filtrar por tipo de viaje
    if (rideType) {
      queryBuilder.andWhere('ride.rideType = :rideType', { rideType });
    }

    // TODO: Filtrar por radio de distancia usando lat/lng
    // Esto requeriría una función de distancia geográfica en la BD
    
    return queryBuilder.getMany();
  }

  /**
   * Aceptar un viaje como conductor
   */
  async acceptRide(rideId: string, acceptRideDto: AcceptRideDto): Promise<Ride> {
    const ride = await this.findOne(rideId);

    // Validar que el viaje esté disponible
    if (ride.status !== RideStatus.REQUESTED) {
      throw new BadRequestException('This ride is no longer available');
    }

    if (ride.driverId) {
      throw new BadRequestException('This ride has already been accepted by another driver');
    }

    // Validar que el conductor no tenga viajes activos
    const activeRides = await this.rideRepository.count({
      where: {
        driverId: acceptRideDto.driverId,
        status: RideStatus.IN_PROGRESS,
      },
    });

    if (activeRides > 0) {
      throw new BadRequestException('Driver already has an active ride');
    }

    // Validar que el conductor no tenga viajes aceptados pendientes
    const acceptedRides = await this.rideRepository.count({
      where: {
        driverId: acceptRideDto.driverId,
        status: RideStatus.ACCEPTED,
      },
    });

    if (acceptedRides > 0) {
      throw new BadRequestException('Driver already has an accepted ride pending');
    }

    // Validar precio propuesto si existe
    if (acceptRideDto.driverProposedPrice !== undefined) {
      const minPrice = ride.estimatedFare * 0.8; // Mínimo 80% del precio estimado
      const maxPrice = ride.estimatedFare * 1.5; // Máximo 150% del precio estimado

      if (acceptRideDto.driverProposedPrice < minPrice || acceptRideDto.driverProposedPrice > maxPrice) {
        throw new BadRequestException(
          `Driver proposed price must be between C$${minPrice.toFixed(0)} and C$${maxPrice.toFixed(0)}`
        );
      }
    }

    // Actualizar viaje
    ride.driverId = acceptRideDto.driverId;
    // TODO: Agregar vehicleId a la entidad Ride
    
    if (acceptRideDto.driverProposedPrice !== undefined) {
      ride.driverProposedPrice = acceptRideDto.driverProposedPrice;
    }
    
    ride.status = RideStatus.ACCEPTED;
    ride.acceptedAt = new Date();

    const updatedRide = await this.rideRepository.save(ride);
    console.log(`✅ Viaje ${rideId} aceptado por conductor ${acceptRideDto.driverId}`);

    // Programar auto-cancelación si no se inicia en 10 minutos
    this.scheduleAutoCancellation(rideId);

    return updatedRide;
  }

  /**
   * Programar auto-cancelación si el conductor no inicia el viaje en 10 minutos
   */
  private scheduleAutoCancellation(rideId: string) {
    setTimeout(async () => {
      try {
        const ride = await this.rideRepository.findOne({ where: { id: rideId } });
        
        // Si el viaje sigue en estado 'accepted' después de 10 minutos, cancelar
        if (ride && ride.status === RideStatus.ACCEPTED) {
          ride.status = RideStatus.CANCELED;
          ride.canceledAt = new Date();
          ride.cancelReason = CancelReason.TIMEOUT;
          ride.cancelNote = 'El conductor no inició el viaje en 10 minutos';
          
          await this.rideRepository.save(ride);
          console.log(`⏰ Viaje ${rideId} auto-cancelado por timeout`);
          
          // TODO: Notificar al cliente vía WebSocket
        }
      } catch (error) {
        console.error(`Error en auto-cancelación del viaje ${rideId}:`, error);
      }
    }, 10 * 60 * 1000); // 10 minutos
  }

  private validateStatusTransition(currentStatus: string, newStatus: string): void {
    const validTransitions: Record<string, string[]> = {
      [RideStatus.REQUESTED]: [RideStatus.ACCEPTED, RideStatus.CANCELED],
      [RideStatus.ACCEPTED]: [RideStatus.IN_PROGRESS, RideStatus.CANCELED],
      [RideStatus.IN_PROGRESS]: [RideStatus.COMPLETED, RideStatus.CANCELED],
      [RideStatus.COMPLETED]: [],
      [RideStatus.CANCELED]: [],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  /**
   * Crear inspección de vehículo
   */
  async createVehicleInspection(dto: CreateVehicleInspectionDto): Promise<VehicleInspection> {
    // Verificar que el viaje existe
    const ride = await this.findOne(dto.rideId);
    
    if (ride.rideType !== RideType.DESIGNATED_DRIVER) {
      throw new BadRequestException('La inspección solo aplica para viajes de conductor designado');
    }

    const inspection = this.inspectionRepository.create(dto);
    return this.inspectionRepository.save(inspection);
  }

  /**
   * Obtener inspección por ID de viaje
   */
  async getInspectionByRideId(rideId: string): Promise<VehicleInspection | null> {
    return this.inspectionRepository.findOne({
      where: { rideId },
      relations: ['ride'],
    });
  }

  /**
   * Actualizar inspección
   */
  async updateInspection(id: string, dto: Partial<CreateVehicleInspectionDto>): Promise<VehicleInspection> {
    const inspection = await this.inspectionRepository.findOne({ where: { id } });
    
    if (!inspection) {
      throw new NotFoundException('Inspección no encontrada');
    }

    Object.assign(inspection, dto);
    return this.inspectionRepository.save(inspection);
  }
}
