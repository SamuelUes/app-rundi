import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmergencyService } from './emergency.service';
import { LogEmergencyCallDto, UpdateEmergencyCallStatusDto } from './dto/log-emergency-call.dto';

@Controller('emergency')
@UseGuards(JwtAuthGuard)
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}

  @Post('log')
  async logEmergencyCall(@Req() req: any, @Body() dto: LogEmergencyCallDto) {
    const userId = req.user.id;
    const userRole = req.user.role || 'client';
    return this.emergencyService.logEmergencyCall(userId, userRole, dto);
  }

  @Post('update-status')
  async updateStatus(@Req() req: any, @Body() dto: UpdateEmergencyCallStatusDto) {
    const userId = req.user.id;
    return this.emergencyService.updateEmergencyCallStatus(userId, dto);
  }

  @Get('history')
  async getHistory(@Req() req: any) {
    const userId = req.user.id;
    return this.emergencyService.getEmergencyCalls(userId);
  }
}
