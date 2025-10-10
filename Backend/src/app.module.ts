import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DriversModule } from './drivers/drivers.module';
import { RidesModule } from './rides/rides.module';
import { PaymentsModule } from './payments/payments.module';
import { TrackingModule } from './tracking/tracking.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './storage/storage.module';
import { MapsModule } from './maps/maps.module';
import { UploadModule } from './upload/upload.module';
import { FirebaseModule } from './firebase/firebase.module';
import { SupabaseModule } from './supabase/supabase.module';
import { EmergencyModule } from './emergency/emergency.module';
import { RideHistoryModule } from './ride-history/ride-history.module';
import { FirebaseAuthMiddleware } from './middlewares/auth.middleware';
import { LoggerMiddleware } from './middlewares/logger.middleware';
import { RateLimitMiddleware } from './middlewares/rate-limit.middleware';
import { validate } from './config/env.validation';
import { getTypeOrmConfig } from './config/database.config';

@Module({
  imports: [
    // Config Module - MUST be first
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate,
    }),
    // TypeORM Module - Conectado a Postgres
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => getTypeOrmConfig(configService),
    }),
    // Feature Modules
    AuthModule,
    UsersModule,
    DriversModule,
    RidesModule,
    PaymentsModule,
    TrackingModule,
    NotificationsModule,
    StorageModule,
    MapsModule,
    UploadModule,
    FirebaseModule,
    SupabaseModule,
    EmergencyModule,
    RideHistoryModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware, RateLimitMiddleware, FirebaseAuthMiddleware)
      .forRoutes('*');
  }
}
