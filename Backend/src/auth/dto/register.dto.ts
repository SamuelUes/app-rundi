import { IsEmail, IsString, IsEnum, IsOptional, MinLength, MaxLength, IsNumber, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../users/entities/user.entity';
import { VehicleType } from '../../drivers/entities/vehicle.entity';

export class DriverDataDto {
  @IsString()
  @MinLength(5, { message: 'License number must be at least 5 characters' })
  licenseNumber: string;

  @IsDateString()
  @IsOptional()
  licenseExpiry?: string;

  @IsString()
  @IsOptional()
  licensePhoto?: string;
}

export class VehicleDataDto {
  @IsString()
  @MinLength(3, { message: 'Plate must be at least 3 characters' })
  plate: string;

  @IsString()
  brand: string;

  @IsString()
  model: string;

  @IsNumber()
  year: number;

  @IsString()
  color: string;

  @IsEnum(VehicleType)
  type: VehicleType;

  @IsString()
  @IsOptional()
  photo?: string;

  // Documentos del vehículo
  @IsString()
  @IsOptional()
  registrationNumber?: string;

  @IsDateString()
  @IsOptional()
  registrationExpiry?: string;

  @IsString()
  @IsOptional()
  registrationPhoto?: string;

  @IsString()
  @IsOptional()
  insuranceNumber?: string;

  @IsString()
  @IsOptional()
  insuranceCompany?: string;

  @IsDateString()
  @IsOptional()
  insuranceExpiry?: string;

  @IsString()
  @IsOptional()
  insurancePhoto?: string;
}

export class RegisterDto {
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email: string;

  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(100, { message: 'Password must not exceed 100 characters' })
  password: string;

  @IsEnum(UserRole, { message: 'Role must be either client, driver or admin' })
  role: UserRole;

  @IsString()
  @IsOptional()
  @MinLength(7, { message: 'Phone must be at least 7 characters' })
  @MaxLength(20, { message: 'Phone must not exceed 20 characters' })
  phone?: string;

  // Datos del conductor (requeridos si role === 'driver')
  @ValidateNested()
  @Type(() => DriverDataDto)
  @IsOptional()
  driverData?: DriverDataDto;

  // Datos del vehículo (requeridos si role === 'driver')
  @ValidateNested()
  @Type(() => VehicleDataDto)
  @IsOptional()
  vehicleData?: VehicleDataDto;
}
