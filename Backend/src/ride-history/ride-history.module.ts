import { Module } from '@nestjs/common';
import { RideHistoryController } from './ride-history.controller';
import { RideHistoryService } from './ride-history.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [RideHistoryController],
  providers: [RideHistoryService],
  exports: [RideHistoryService],
})
export class RideHistoryModule {}
