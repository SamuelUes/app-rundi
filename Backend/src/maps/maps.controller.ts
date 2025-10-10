import { Controller, Get } from '@nestjs/common';
import { MapsService } from './maps.service';

@Controller('maps')
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  /**
   * Obtener el proveedor de mapas disponible
   */
  @Get('provider')
  async getAvailableProvider() {
    return this.mapsService.getAvailableProvider();
  }
}
