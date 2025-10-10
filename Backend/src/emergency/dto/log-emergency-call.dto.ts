import { IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class LocationDto {
  latitude: number;
  longitude: number;
  address?: string;
}

export class LogEmergencyCallDto {
  @IsEnum(['police', 'ambulance'])
  emergencyType: 'police' | 'ambulance';

  @IsOptional()
  @IsUUID()
  rideId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateEmergencyCallStatusDto {
  @IsUUID()
  callId: string;

  @IsEnum(['initiated', 'completed', 'canceled'])
  status: 'initiated' | 'completed' | 'canceled';
}
