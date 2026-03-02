import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  // Raw body support required by Stripe webhook signature validation
  await app.register(
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@fastify/raw-body'),
    { global: false, encoding: 'utf8', runFirst: true },
  );

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Scanrix API')
    .setDescription('URL-based vulnerability scanning SaaS API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' });

  await app.listen(parseInt(process.env.PORT || '4000', 10), '0.0.0.0');
}

bootstrap();
