import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,        // reflects the request origin in dev; lock this down in production
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,   // needed if you ever send cookies (e.g. calendar_access_token)
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  const config = new DocumentBuilder()
    .setTitle('Calico – Monitorias API')
    .setDescription(
      `REST API for the Calico tutoring platform.\n\n` +
      `**How to authenticate:**\n` +
      `1. Call \`POST /auth/register\` to create an account, or \`POST /auth/login\` to sign in.\n` +
      `2. Copy the \`idToken\` from the response.\n` +
      `3. Click the **Authorize 🔒** button at the top and enter: \`Bearer <idToken>\`.\n` +
      `4. All protected endpoints will now include the token automatically.`,
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'Firebase JWT', description: 'Firebase idToken obtained from /auth/login or /auth/register' },
      'firebase-jwt',
    )
    .build();

  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, config), {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();


