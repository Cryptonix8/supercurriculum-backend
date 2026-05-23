import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  const app = await NestFactory.create(AppModule);

  // Increase body size limits for file uploads
  // Allow up to 500MB for multipart/form-data (for multiple PDF uploads)
  app.use(json({ limit: '500mb' }));
  app.use(urlencoded({ extended: true, limit: '500mb' }));

  // Increase server timeout for long-running operations (10 minutes)
  const server = app.getHttpServer();
  server.setTimeout(600000); // 600 seconds = 10 minutes
  server.keepAliveTimeout = 620000; // Slightly higher than setTimeout

  // Global prefix for all routes
  app.setGlobalPrefix('api');

  // Enable CORS
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.FRONTEND_URL || ''].filter(Boolean)
      : '*',  // Allow all origins in development
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('Supercurriculum API')
    .setDescription('API for AI-powered learning assistant app')
    .setVersion('1.0')
    .addTag('Authentication', 'User authentication endpoints')
    .addTag('Users', 'User management')
    .addTag('Content', 'Supercurriculum content management')
    .addTag('Assessments', 'Feedback tests and assessments')
    .addTag('Planning', 'Weekly plan generation')
    .addTag('Submissions', 'Task submissions and AI feedback')
    .addTag('AI', 'AI tutor and chat')
    .addTag('Progress', 'Progress tracking and badges')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`
  🚀 Supercurriculum API Server is running!
  
  📍 Server: http://localhost:${port}
  📚 API Docs: http://localhost:${port}/api/docs
  🗄️  Database: Connected to PostgreSQL
  
  Environment: ${process.env.NODE_ENV || 'development'}
  `);
}

bootstrap();

