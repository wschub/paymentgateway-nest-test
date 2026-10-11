import { Module } from '@nestjs/common';
import type { AppConfigValues } from '../../application/config-values';
import { GetCheckoutConfigUseCase } from '../../application/use-cases/get-checkout-config.use-case';
import { PayTransactionUseCase } from '../../application/use-cases/pay-transaction.use-case';
import type { Clock } from '../../domain/ports/clock.port';
import type { PaymentGateway } from '../../domain/ports/payment-gateway.port';
import type { TransactionRepository } from '../../domain/ports/transaction.repository';
import { PaymentsController } from '../http/payments.controller';
import {
  APP_CONFIG_VALUES,
  CLOCK,
  PAYMENT_GATEWAY,
  TRANSACTION_REPOSITORY,
} from './injection-tokens';
import { TransactionsModule } from './transactions.module';

@Module({
  imports: [TransactionsModule],
  controllers: [PaymentsController],
  providers: [
    {
      provide: GetCheckoutConfigUseCase,
      useFactory: (config: AppConfigValues, gateway: PaymentGateway) =>
        new GetCheckoutConfigUseCase(config, gateway),
      inject: [APP_CONFIG_VALUES, PAYMENT_GATEWAY],
    },
    {
      provide: PayTransactionUseCase,
      useFactory: (
        transactions: TransactionRepository,
        gateway: PaymentGateway,
        clock: Clock,
        config: AppConfigValues,
      ) => new PayTransactionUseCase(transactions, gateway, clock, config),
      inject: [
        TRANSACTION_REPOSITORY,
        PAYMENT_GATEWAY,
        CLOCK,
        APP_CONFIG_VALUES,
      ],
    },
  ],
})
export class PaymentsModule {}
