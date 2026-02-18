import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './modules/app.module';
import { FleetwideExceptionFilter } from './filters/fleetwide-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 8080;
  const host = config.get<string>('HOST') ?? '0.0.0.0';
  const frontendUrl = config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new FleetwideExceptionFilter());
  app.enableCors({ origin: frontendUrl });

  await app.listen(port, host);
  console.log(`Server running at http://${host}:${port}`);
}

bootstrap();
