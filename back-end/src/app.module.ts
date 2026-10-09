import { Module } from '@nestjs/common';
import { AppConfigModule } from './infrastructure/config/config.module';
import { ProductsModule } from './infrastructure/modules/products.module';
import { PrismaModule } from './infrastructure/persistence/prisma.module';

@Module({
  imports: [AppConfigModule, PrismaModule, ProductsModule],
})
export class AppModule {}