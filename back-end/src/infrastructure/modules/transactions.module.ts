import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfigValues } from '../../application/config-values';
import { CreateTransactionUseCase } from '../../application/use-cases/create-transaction.use-case';
import { GetTransactionUseCase } from '../../application/use-cases/get-transaction.use-case';
import type { Clock } from '../../domain/ports/clock.port';
import type { PaymentGateway } from '../../domain/ports/payment-gateway.port';
import type { ProductRepository } from '../../domain/ports/product.repository';
import type { ReferenceGenerator } from '../../domain/ports/reference-generator.port';
import type { TransactionRepository } from '../../domain/ports/transaction.repository';
import { FeesConfig } from '../../domain/value-objects/fees-config';
import { TransactionsController } from '../http/transactions.controller';
import { HttpPaymentGatewayAdapter } from '../payments/http-payment-gateway.adapter';
import { PrismaTransactionRepository } from '../persistence/prisma-transaction.repository';
import { PrismaService } from '../persistence/prisma.service';
import { CryptoReferenceGenerator } from '../system/crypto-reference-generator';
import { SystemClock } from '../system/system-clock';
import {
  APP_CONFIG_VALUES,
  CLOCK,
  FEES_CONFIG,
  PAYMENT_GATEWAY,
  REFERENCE_GENERATOR,
  TRANSACTION_REPOSITORY,
} from './injection-tokens';
import { PRODUCTS_REPOSITORY, ProductsModule } from './products.module';

@Module({
  imports: [ProductsModule],
  controllers: [TransactionsController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: REFERENCE_GENERATOR, useClass: CryptoReferenceGenerator },
    {
      provide: TRANSACTION_REPOSITORY,
      useFactory: (
        prisma: PrismaService,
        clock: Clock,
      ): TransactionRepository =>
        new PrismaTransactionRepository(prisma, clock),
      inject: [PrismaService, CLOCK],
    },
    {
      // Secrets (private key, integrity secret) are read only inside this
      // factory and never leave the adapter.
      provide: PAYMENT_GATEWAY,
      useFactory: (config: ConfigService): PaymentGateway =>
        new HttpPaymentGatewayAdapter({
          baseUrl: config.getOrThrow<string>('UAT_SANDBOX_URL'),
          publicKey: config.getOrThrow<string>('pub_stagtest'),
          privateKey: config.getOrThrow<string>('prv_stagtest'),
          integritySecret: config.getOrThrow<string>('stagtest_integrity'),
          timeoutMs: config.getOrThrow<number>('PAYMENT_TIMEOUT_MS'),
        }),
      inject: [ConfigService],
    },
    {
      provide: FEES_CONFIG,
      useFactory: (config: ConfigService): FeesConfig =>
        new FeesConfig({
          baseFeeInCents: config.getOrThrow<number>('BASE_FEE_IN_CENTS'),
          deliveryFeeInCents: config.getOrThrow<number>(
            'DELIVERY_FEE_IN_CENTS',
          ),
          currency: 'COP',
        }),
      inject: [ConfigService],
    },
    {
      provide: APP_CONFIG_VALUES,
      useFactory: (config: ConfigService): AppConfigValues => ({
        publicKey: config.getOrThrow<string>('pub_stagtest'),
        baseUrl: config.getOrThrow<string>('UAT_SANDBOX_URL'),
        currency: 'COP',
        paymentClaimLeaseSeconds: config.getOrThrow<number>(
          'PAYMENT_CLAIM_LEASE_SECONDS',
        ),
        reservationTtlSeconds: config.getOrThrow<number>(
          'RESERVATION_TTL_SECONDS',
        ),
      }),
      inject: [ConfigService],
    },
    {
      provide: CreateTransactionUseCase,
      useFactory: (
        products: ProductRepository,
        transactions: TransactionRepository,
        fees: FeesConfig,
        clock: Clock,
        referenceGenerator: ReferenceGenerator,
        config: AppConfigValues,
      ) =>
        new CreateTransactionUseCase(
          products,
          transactions,
          fees,
          clock,
          referenceGenerator,
          config,
        ),
      inject: [
        PRODUCTS_REPOSITORY,
        TRANSACTION_REPOSITORY,
        FEES_CONFIG,
        CLOCK,
        REFERENCE_GENERATOR,
        APP_CONFIG_VALUES,
      ],
    },
    {
      provide: GetTransactionUseCase,
      useFactory: (
        transactions: TransactionRepository,
        gateway: PaymentGateway,
        clock: Clock,
        config: AppConfigValues,
      ) => new GetTransactionUseCase(transactions, gateway, clock, config),
      inject: [
        TRANSACTION_REPOSITORY,
        PAYMENT_GATEWAY,
        CLOCK,
        APP_CONFIG_VALUES,
      ],
    },
  ],
  exports: [
    TRANSACTION_REPOSITORY,
    PAYMENT_GATEWAY,
    CLOCK,
    APP_CONFIG_VALUES,
    CreateTransactionUseCase,
    GetTransactionUseCase,
  ],
})
export class TransactionsModule {}
