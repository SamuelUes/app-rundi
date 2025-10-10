import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Servir archivos estáticos (uploads)
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });
  
  // CORS Configuration
  const isProduction = process.env.NODE_ENV === 'production';
  const corsOrigin = isProduction
    ? [
        'https://driveangel.online',
        'https://www.driveangel.online',
        'https://api.driveangel.online',
      ]
    : '*'; // En desarrollo permitir todo

  app.enableCors({ 
    origin: corsOrigin,
    credentials: true,
  });
  
  app.setGlobalPrefix('api');
  const port = process.env.PORT || 3000;
  const domain = process.env.DOMAIN || 'driveangel.online';
  
  // Escuchar en 0.0.0.0 para permitir conexiones desde red local
  await app.listen(port, '0.0.0.0');
  
  // eslint-disable-next-line no-console
  console.log(`\n🚀 DriveAngel.ni Backend`);
  console.log(`📍 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`🌐 Domain: ${domain}\n`);
  
  if (isProduction) {
    console.log(`Backend running on:`);
    console.log(`  - Production: https://api.${domain}`);
  } else {
    console.log(`Backend running on:`);
    console.log(`  - Local:   http://localhost:${port}/api`);
    console.log(`  - Network: http://192.168.1.18:${port}/api`);
    console.log(`  - Emulator: http://10.0.2.2:${port}/api (con adb reverse)`);
  }
}

bootstrap();
