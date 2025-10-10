import { IsString, IsEnum, IsNumber, IsUUID, MinLength, MaxLength, Min, Max } from 'class-validator';
import { VehicleType } from '../entities/vehicle.entity';

export class CreateVehicleDto {
  @IsUUID('4', { message: 'driverId must be a valid UUID' })
  driverId: string;

  @IsEnum(VehicleType, { message: 'Type must be sedan, suv, or van' })
  type: VehicleType;

  @IsString()
  @MinLength(2, { message: 'Brand must be at least 2 characters' })
  @MaxLength(50, { message: 'Brand must not exceed 50 characters' })
  brand: string;

  @IsString()
  @MinLength(2, { message: 'Model must be at least 2 characters' })
  @MaxLength(50, { message: 'Model must not exceed 50 characters' })
  model: string;

  @IsNumber()
  @Min(1980, { message: 'Year must be at least 1980' })
  @Max(new Date().getFullYear() + 1, { message: `Year must not exceed ${new Date().getFullYear() + 1}` })
  year: number;

  @IsString()
  @MinLength(5, { message: 'License plate must be at least 5 characters' })
  @MaxLength(20, { message: 'License plate must not exceed 20 characters' })
  licensePlate: string;

  @IsString()
  @MinLength(3, { message: 'Color must be at least 3 characters' })
  @MaxLength(30, { message: 'Color must not exceed 30 characters' })
  color: string;
}
