import { IsUUID, IsNumber, IsString, IsOptional, Min, Max, MaxLength } from 'class-validator';

export class CreateRatingDto {
  @IsUUID('4', { message: 'rideId must be a valid UUID' })
  rideId: string;

  @IsUUID('4', { message: 'fromUserId must be a valid UUID' })
  fromUserId: string;

  @IsUUID('4', { message: 'toUserId must be a valid UUID' })
  toUserId: string;

  @IsNumber()
  @Min(1, { message: 'Rating must be at least 1' })
  @Max(5, { message: 'Rating must not exceed 5' })
  score: number;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Comment must not exceed 500 characters' })
  comment?: string;
}
