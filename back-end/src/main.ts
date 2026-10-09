import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './infrastructure/http/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await configureApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
