import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './infrastructure/config/config.module';
import { PrismaModule } from './infrastructure/persistence/prisma.module';

@Module({
  imports: [AppConfigModule, PrismaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
