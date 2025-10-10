import { IsEnum, IsUUID, IsOptional } from 'class-validator';
import { RideStatus } from '../entities/ride.entity';

export class UpdateRideStatusDto {
  @IsEnum(RideStatus, { 
    message: 'Status must be one of: pending, accepted, in_progress, completed, cancelled' 
  })
  status: RideStatus;

  @IsUUID('4', { message: 'driverId must be a valid UUID' })
  @IsOptional()
  driverId?: string;
}
