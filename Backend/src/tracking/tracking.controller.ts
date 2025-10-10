import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { SaveLocationDto } from './dto/save-location.dto';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  /**
   * POST /tracking/location
   * Guardar ubicación del conductor durante el viaje
   * Solo se guarda si el viaje está en estado 'in_progress'
   */
  @Post('location')
  @HttpCode(HttpStatus.CREATED)
  async saveLocation(@Body() dto: SaveLocationDto) {
    const location = await this.trackingService.saveLocation(dto);
    return {
      success: true,
      message: 'Ubicación guardada correctamente',
      data: location,
    };
  }

  /**
   * GET /tracking/route/:rideId
   * Obtener historial completo de ruta de un viaje
   */
  @Get('route/:rideId')
  async getRouteHistory(@Param('rideId') rideId: string) {
    const locations = await this.trackingService.getRouteHistory(rideId);
    return {
      success: true,
      data: {
        rideId,
        totalPoints: locations.length,
        route: locations,
      },
    };
  }

  /**
   * GET /tracking/eta/:rideId
   * Calcular ETA (Estimated Time of Arrival)
   */
  @Get('eta/:rideId')
  async calculateETA(
    @Param('rideId') rideId: string,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    const currentLat = parseFloat(lat);
    const currentLng = parseFloat(lng);

    if (isNaN(currentLat) || isNaN(currentLng)) {
      return {
        success: false,
        message: 'Coordenadas inválidas',
      };
    }

    const eta = await this.trackingService.calculateETA(
      rideId,
      currentLat,
      currentLng,
    );

    return {
      success: true,
      data: eta,
    };
  }

  /**
   * GET /tracking/deviation/:rideId
   * Verificar si el conductor se ha desviado de la ruta
   */
  @Get('deviation/:rideId')
  async checkDeviation(
    @Param('rideId') rideId: string,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    const currentLat = parseFloat(lat);
    const currentLng = parseFloat(lng);

    if (isNaN(currentLat) || isNaN(currentLng)) {
      return {
        success: false,
        message: 'Coordenadas inválidas',
      };
    }

    const deviation = await this.trackingService.checkRouteDeviation(
      rideId,
      currentLat,
      currentLng,
    );

    return {
      success: true,
      data: deviation,
    };
  }
}
