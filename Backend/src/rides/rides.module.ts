import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RidesService } from './rides.service';
import { RidesController } from './rides.controller';
import { Ride } from './entities/ride.entity';
import { Rating } from './entities/rating.entity';
import { VehicleInspection } from './entities/vehicle-inspection.entity';
import { TrackingModule } from '../tracking/tracking.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ride, Rating, VehicleInspection]),
    forwardRef(() => TrackingModule),
    forwardRef(() => PaymentsModule),
  ],
  controllers: [RidesController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}
