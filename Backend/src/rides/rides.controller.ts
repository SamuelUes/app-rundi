import { Controller, Get, Post, Body, Param, Patch, ValidationPipe, UsePipes, Query, Put } from '@nestjs/common';
import { RidesService } from './rides.service';
import { RequestRideDto } from './dto/request-ride.dto';
import { UpdateRideStatusDto } from './dto/update-ride-status.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { AcceptRideDto } from './dto/accept-ride.dto';
import { CreateVehicleInspectionDto } from './dto/create-vehicle-inspection.dto';
import { RideType } from './entities/ride.entity';

@Controller('rides')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  @Get()
  findAll() {
    return this.ridesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ridesService.findOne(id);
  }

  @Get('client/:clientId')
  findByClient(@Param('clientId') clientId: string) {
    return this.ridesService.findByClient(clientId);
  }

  @Get('driver/:driverId')
  findByDriver(@Param('driverId') driverId: string) {
    return this.ridesService.findByDriver(driverId);
  }

  @Post('request')
  requestRide(@Body() requestRideDto: RequestRideDto) {
    return this.ridesService.requestRide(requestRideDto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateRideStatusDto: UpdateRideStatusDto,
  ) {
    return this.ridesService.updateStatus(id, updateRideStatusDto);
  }

  @Patch(':id/cancel')
  cancelRide(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.ridesService.cancelRide(id, reason);
  }

  @Post('ratings')
  createRating(@Body() createRatingDto: CreateRatingDto) {
    return this.ridesService.createRating(createRatingDto);
  }

  /**
   * Obtener solicitudes de viaje disponibles para conductores
   * Query params: lat, lng, radius, rideType
   */
  @Get('available/list')
  findAvailableRides(
    @Query('lat') lat?: number,
    @Query('lng') lng?: number,
    @Query('radius') radius?: number,
    @Query('rideType') rideType?: RideType,
  ) {
    return this.ridesService.findAvailableRides(lat, lng, radius, rideType);
  }

  /**
   * Aceptar un viaje como conductor
   */
  @Post(':id/accept')
  acceptRide(
    @Param('id') id: string,
    @Body() acceptRideDto: AcceptRideDto,
  ) {
    return this.ridesService.acceptRide(id, acceptRideDto);
  }

  /**
   * Crear inspección de vehículo
   */
  @Post('inspections')
  createInspection(@Body() dto: CreateVehicleInspectionDto) {
    return this.ridesService.createVehicleInspection(dto);
  }

  /**
   * Obtener inspección por ID de viaje
   */
  @Get(':rideId/inspection')
  getInspection(@Param('rideId') rideId: string) {
    return this.ridesService.getInspectionByRideId(rideId);
  }

  /**
   * Actualizar inspección
   */
  @Put('inspections/:id')
  updateInspection(
    @Param('id') id: string,
    @Body() dto: Partial<CreateVehicleInspectionDto>,
  ) {
    return this.ridesService.updateInspection(id, dto);
  }
}
