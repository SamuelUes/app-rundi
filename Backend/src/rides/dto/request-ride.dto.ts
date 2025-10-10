import { IsUUID, IsNumber, IsString, IsOptional, ValidateNested, Min, Max, IsEnum, IsNotEmpty, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { RideType } from '../entities/ride.entity';

class LocationDto {
  @IsNumber()
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  lat: number;

  @IsNumber()
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  lng: number;

  @IsString()
  @IsNotEmpty({ message: 'Address is required' })
  @MinLength(5, { message: 'Address must be at least 5 characters' })
  address: string;
}

export class RequestRideDto {
  @IsUUID('4', { message: 'clientId must be a valid UUID' })
  clientId: string;

  @ValidateNested()
  @Type(() => LocationDto)
  origin: LocationDto;

  @ValidateNested()
  @Type(() => LocationDto)
  destination: LocationDto;

  @IsEnum(RideType, { message: 'Invalid ride type' })
  @IsOptional()
  rideType?: RideType;

  // Distancia estimada en metros
  @IsNumber()
  @Min(100, { message: 'Distance must be at least 100 meters' })
  @Max(100000, { message: 'Distance cannot exceed 100 km' })
  estimatedDistance: number;

  // Duración estimada en segundos
  @IsNumber()
  @Min(60, { message: 'Duration must be at least 1 minute' })
  @Max(18000, { message: 'Duration cannot exceed 5 hours' })
  estimatedDuration: number;

  // Precio estimado calculado por el frontend
  @IsNumber()
  @Min(50, { message: 'Price must be at least C$50' })
  @Max(10000, { message: 'Price cannot exceed C$10,000' })
  estimatedPrice: number;

  @IsNumber()
  @IsOptional()
  @Min(50)
  clientSuggestedPrice?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
