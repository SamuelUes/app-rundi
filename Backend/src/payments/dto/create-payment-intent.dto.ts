import { IsUUID, IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsUUID('4', { message: 'rideId must be a valid UUID' })
  rideId: string;

  @IsNumber()
  @Min(1, { message: 'Amount must be at least 1' })
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string = 'mxn';

  @IsString()
  @IsOptional()
  paymentMethod?: string;
}
