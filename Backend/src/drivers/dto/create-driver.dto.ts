import { IsString, IsNumber, IsBoolean, IsOptional, Min, Max, IsUUID } from 'class-validator';

export class CreateDriverDto {
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  userId: string;

  @IsString()
  licenseNumber: string;

  @IsNumber()
  @Min(0, { message: 'Rating must be at least 0' })
  @Max(5, { message: 'Rating must not exceed 5' })
  @IsOptional()
  rating?: number;

  @IsNumber()
  @Min(0, { message: 'Total trips must be at least 0' })
  @IsOptional()
  totalTrips?: number;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @IsNumber()
  @IsOptional()
  currentLat?: number;

  @IsNumber()
  @IsOptional()
  currentLng?: number;
}
