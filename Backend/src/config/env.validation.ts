import { plainToClass } from 'class-transformer';
import { IsEnum, IsNumber, IsString, validateSync, Min, Max } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(1000)
  @Max(65535)
  PORT: number = 3000;

  // Database
  @IsString()
  DB_HOST: string = 'localhost';

  @IsNumber()
  DB_PORT: number = 5432;

  @IsString()
  DB_USER: string = 'postgres';

  @IsString()
  DB_PASSWORD: string = 'postgres';

  @IsString()
  DB_NAME: string = 'app_uber';

  // Redis
  @IsString()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  REDIS_PORT: number = 6379;

  // Firebase
  @IsString()
  FIREBASE_PROJECT_ID: string = '';

  @IsString()
  FIREBASE_STORAGE_BUCKET: string = '';

  // Stripe
  @IsString()
  STRIPE_SECRET_KEY: string = '';

  @IsString()
  STRIPE_WEBHOOK_SECRET: string = '';

  // JWT
  @IsString()
  JWT_SECRET: string = '';

  @IsString()
  JWT_EXPIRES_IN: string = '7d';

  // App Config
  @IsNumber()
  BASE_FARE_MXN: number = 25;

  @IsNumber()
  PER_KM_FARE_MXN: number = 6;

  @IsNumber()
  MAX_DRIVER_DISTANCE_KM: number = 10;

  @IsNumber()
  SURGE_MULTIPLIER: number = 1.5;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Config validation error: ${errors.toString()}`);
  }

  return validatedConfig;
}
