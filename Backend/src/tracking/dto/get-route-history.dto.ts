import { IsUUID } from 'class-validator';

export class GetRouteHistoryDto {
  @IsUUID()
  rideId: string;
}
