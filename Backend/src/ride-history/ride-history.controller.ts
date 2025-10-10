import { Controller, Get, Query, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RideHistoryService } from './ride-history.service';
import { GetRideHistoryDto } from './dto/get-ride-history.dto';

@Controller('ride-history')
@UseGuards(JwtAuthGuard)
export class RideHistoryController {
  constructor(private readonly rideHistoryService: RideHistoryService) {}

  @Get('today')
  async getTodayRides(@Req() req: any) {
    const userId = req.user.id;
    const userRole = req.user.role || 'client';
    return this.rideHistoryService.getTodayRides(userId, userRole);
  }

  @Get('history')
  async getRideHistory(@Req() req: any, @Query() dto: GetRideHistoryDto) {
    const userId = req.user.id;
    const userRole = req.user.role || 'client';
    return this.rideHistoryService.getRideHistory(userId, userRole, dto);
  }

  @Get('driver-stats')
  async getDriverStats(@Req() req: any) {
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole !== 'driver') {
      throw new Error('Solo conductores pueden ver estadísticas');
    }

    return this.rideHistoryService.getDriverStats(userId);
  }

  @Get(':rideId')
  async getRideDetails(@Req() req: any, @Param('rideId') rideId: string) {
    const userId = req.user.id;
    return this.rideHistoryService.getRideDetails(rideId, userId);
  }
}
