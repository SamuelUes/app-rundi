import { IsNumber, IsUUID, IsOptional, Min, Max } from 'class-validator';

export class SaveLocationDto {
  @IsUUID()
  rideId: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  speed?: number; // km/h

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number; // grados (0-360)

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number; // metros
}
