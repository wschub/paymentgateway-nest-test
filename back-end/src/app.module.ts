import { Module } from '@nestjs/common';
import { AppConfigModule } from './infrastructure/config/config.module';
import { PaymentsModule } from './infrastructure/modules/payments.module';
import { ProductsModule } from './infrastructure/modules/products.module';
import { TransactionsModule } from './infrastructure/modules/transactions.module';
import { PrismaModule } from './infrastructure/persistence/prisma.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ProductsModule,
    TransactionsModule,
    PaymentsModule,
  ],
})
export class AppModule {}