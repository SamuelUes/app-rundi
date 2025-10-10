import { IsUUID, IsNumber, IsOptional, Min, ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';

class DriverLocationDto {
  @IsNumber()
  @Min(-90)
  lat: number;

  @IsNumber()
  @Min(-180)
  lng: number;
}

export class AcceptRideDto {
  @IsUUID('4', { message: 'driverId must be a valid UUID' })
  driverId: string;

  @IsUUID('4', { message: 'vehicleId must be a valid UUID' })
  vehicleId: string;

  @ValidateNested()
  @Type(() => DriverLocationDto)
  currentLocation: DriverLocationDto;

  @IsNumber()
  @IsOptional()
  @Min(50, { message: 'Proposed price must be at least C$50' })
  driverProposedPrice?: number;

  @IsString()
  @IsOptional()
  estimatedArrivalTime?: string; // Tiempo estimado de llegada al origen
}
