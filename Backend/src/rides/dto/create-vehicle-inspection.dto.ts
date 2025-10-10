import { IsString, IsOptional, IsArray, IsBoolean, IsDateString } from 'class-validator';

export class CreateVehicleInspectionDto {
  @IsString()
  rideId: string;

  @IsString()
  licensePlate: string;

  @IsString()
  @IsOptional()
  circulation?: string;

  @IsString()
  @IsOptional()
  insurancePolicy?: string;

  @IsDateString()
  @IsOptional()
  insuranceExpiryDate?: string;

  @IsArray()
  @IsOptional()
  exteriorPhotos?: string[];

  @IsArray()
  @IsOptional()
  interiorPhotos?: string[];

  @IsString()
  @IsOptional()
  clientSignature?: string;

  @IsString()
  @IsOptional()
  observations?: string;

  @IsBoolean()
  @IsOptional()
  approved?: boolean;
}
