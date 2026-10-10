import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Customer as PrismaCustomerRow,
  Delivery as PrismaDeliveryRow,
  Product as PrismaProductRow,
  Transaction as PrismaTransactionRow,
} from '@prisma/client';
import { Customer } from '../../domain/entities/customer.entity';
import { Delivery, type DeliveryStatus } from '../../domain/entities/delivery.entity';
import {
  Transaction,
  type TransactionStatus,
} from '../../domain/entities/transaction.entity';
import { DataAccessError } from '../../domain/errors/data-access.error';
import type { Clock } from '../../domain/ports/clock.port';
import type {
  AttachProviderTransactionInput,
  CreatePendingWithReservedStockInput,
  CreatePendingWithReservedStockResult,
  FinalizeInput,
  FinalizeResult,
  TransactionDetails,
  TransactionRepository,
} from '../../domain/ports/transaction.repository';
import { PrismaService } from './prisma.service';

type TransactionRowWithRelations = PrismaTransactionRow & {
  customer: PrismaCustomerRow;
  delivery: PrismaDeliveryRow | null;
  product: PrismaProductRow;
};

const LOAD_MESSAGE = 'Unable to load the transaction';
const CREATE_MESSAGE = 'Unable to create the transaction';
const CLAIM_MESSAGE = 'Unable to claim the payment of the transaction';
const ATTACH_MESSAGE = 'Unable to attach the provider transaction';
const RELEASE_CLAIM_MESSAGE = 'Unable to release the payment claim';
const FINALIZE_MESSAGE = 'Unable to finalize the transaction';
const EXPIRE_MESSAGE = 'Unable to release the expired reservations';

@Injectable()
export class PrismaTransactionRepository implements TransactionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly reservationTtlSeconds: number,
  ) {}

  async findById(id: string): Promise<TransactionDetails | null> {
    try {
      const row = await this.prisma.transaction.findUnique({
        where: { id },
        include: { customer: true, delivery: true, product: true },
      });
      return this.toDetails(row);
    } catch (error) {
      throw this.wrap(error, LOAD_MESSAGE);
    }
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<TransactionDetails | null> {
    try {
      const row = await this.prisma.transaction.findUnique({
        where: { idempotencyKey },
        include: { customer: true, delivery: true, product: true },
      });
      return this.toDetails(row);
    } catch (error) {
      throw this.wrap(error, LOAD_MESSAGE);
    }
  }

  async createPendingWithReservedStock(
    input: CreatePendingWithReservedStockInput,
  ): Promise<CreatePendingWithReservedStockResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const reserved = await tx.product.updateMany({
          where: { id: input.productId, stock: { gte: input.quantity } },
          data: { stock: { decrement: input.quantity } },
        });
        if (reserved.count === 0) {
          const product = await tx.product.findUnique({
            where: { id: input.productId },
          });
          return product === null
            ? ({ kind: 'product_not_found' } as const)
            : ({ kind: 'out_of_stock' } as const);
        }

        const customer = await tx.customer.create({
          data: {
            fullName: input.customer.fullName,
            email: input.customer.email,
            phone: input.customer.phone,
          },
        });
        const created = await tx.transaction.create({
          data: {
            reference: input.reference,
            idempotencyKey: input.idempotencyKey,
            status: 'PENDING',
            quantity: input.quantity,
            productAmountInCents: input.productAmountInCents,
            baseFeeInCents: input.baseFeeInCents,
            deliveryFeeInCents: input.deliveryFeeInCents,
            totalInCents: input.totalInCents,
            productId: input.productId,
            customerId: customer.id,
            paymentStartedAt: null,
            createdAt: input.now,
            updatedAt: input.now,
          },
        });
        await tx.delivery.create({
          data: {
            transactionId: created.id,
            status: 'PENDING',
            address: input.delivery.address,
            city: input.delivery.city,
            region: input.delivery.region,
            postalCode: null,
            notes: input.delivery.notes,
          },
        });

        return {
          kind: 'created' as const,
          transaction: this.toTransaction(created),
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findByIdempotencyKey(input.idempotencyKey);
        if (existing !== null) {
          return { kind: 'duplicate', transaction: existing.transaction };
        }
      }
      throw this.wrap(error, CREATE_MESSAGE);
    }
  }

  async claimPayment(
    transactionId: string,
    now: Date,
    leaseSeconds: number,
  ): Promise<boolean> {
    try {
      const staleBefore = new Date(now.getTime() - leaseSeconds * 1000);
      const claimed = await this.prisma.transaction.updateMany({
        where: {
          id: transactionId,
          status: 'PENDING',
          providerTransactionId: null,
          OR: [
            { paymentStartedAt: null },
            { paymentStartedAt: { lt: staleBefore } },
          ],
        },
        data: { paymentStartedAt: now, updatedAt: this.clock.now() },
      });
      return claimed.count === 1;
    } catch (error) {
      throw this.wrap(error, CLAIM_MESSAGE);
    }
  }

  async attachProviderTransaction(
    input: AttachProviderTransactionInput,
  ): Promise<void> {
    try {
      await this.prisma.transaction.updateMany({
        where: { id: input.transactionId, providerTransactionId: null },
        data: {
          providerTransactionId: input.providerTransactionId,
          updatedAt: this.clock.now(),
        },
      });
    } catch (error) {
      throw this.wrap(error, ATTACH_MESSAGE);
    }
  }

  async releasePaymentClaim(transactionId: string): Promise<void> {
    try {
      await this.prisma.transaction.updateMany({
        where: {
          id: transactionId,
          status: 'PENDING',
          providerTransactionId: null,
        },
        data: { paymentStartedAt: null, updatedAt: this.clock.now() },
      });
    } catch (error) {
      throw this.wrap(error, RELEASE_CLAIM_MESSAGE);
    }
  }

  async finalize(input: FinalizeInput): Promise<FinalizeResult> {
    try {
      const now = this.clock.now();
      return await this.prisma.$transaction(async (tx) => {
        const finalized = await tx.transaction.updateMany({
          where: { id: input.transactionId, status: 'PENDING' },
          data: {
            status: input.status,
            providerTransactionId: input.providerTransactionId ?? undefined,
            cardBrand: input.cardBrand ?? undefined,
            cardLastFour: input.cardLastFour ?? undefined,
            installments: input.installments ?? undefined,
            failureReason:
              input.status === 'APPROVED'
                ? undefined
                : (input.failureReason ?? undefined),
            updatedAt: now,
          },
        });

        const current = await tx.transaction.findUnique({
          where: { id: input.transactionId },
        });
        if (current === null) {
          throw new DataAccessError(LOAD_MESSAGE);
        }
        if (finalized.count !== 1) {
          return { finalized: false, transaction: this.toTransaction(current) };
        }

        if (input.status === 'APPROVED') {
          await tx.delivery.updateMany({
            where: { transactionId: input.transactionId, status: 'PENDING' },
            data: { status: 'ASSIGNED', assignedAt: now },
          });
        } else {
          await tx.product.updateMany({
            where: { id: current.productId },
            data: { stock: { increment: current.quantity } },
          });
        }

        return { finalized: true, transaction: this.toTransaction(current) };
      });
    } catch (error) {
      throw this.wrap(error, FINALIZE_MESSAGE);
    }
  }

  async releaseExpiredReservations(now: Date): Promise<number> {
    try {
      const cutoff = new Date(now.getTime() - this.reservationTtlSeconds * 1000);
      const expired = await this.prisma.transaction.findMany({
        where: {
          status: 'PENDING',
          paymentStartedAt: null,
          createdAt: { lt: cutoff },
        },
        select: { id: true, productId: true, quantity: true },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      let released = 0;
      for (const expiredRow of expired) {
        const voided = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.transaction.updateMany({
            where: {
              id: expiredRow.id,
              status: 'PENDING',
              paymentStartedAt: null,
            },
            data: {
              status: 'VOIDED',
              failureReason: 'RESERVATION_EXPIRED',
              updatedAt: now,
            },
          });
          if (updated.count !== 1) {
            return false;
          }
          await tx.product.updateMany({
            where: { id: expiredRow.productId },
            data: { stock: { increment: expiredRow.quantity } },
          });
          return true;
        });
        if (voided) {
          released += 1;
        }
      }
      return released;
    } catch (error) {
      throw this.wrap(error, EXPIRE_MESSAGE);
    }
  }

  private wrap(error: unknown, message: string): DataAccessError {
    if (error instanceof DataAccessError) {
      return error;
    }
    return new DataAccessError(message, { cause: error });
  }

  private toDetails(
    row: TransactionRowWithRelations | null,
  ): TransactionDetails | null {
    if (row === null || row.delivery === null) {
      return null;
    }
    return {
      transaction: this.toTransaction(row),
      customer: this.toCustomer(row.customer),
      delivery: this.toDelivery(row.delivery),
      product: { id: row.product.id, name: row.product.name },
    };
  }

  private toTransaction(row: PrismaTransactionRow): Transaction {
    return new Transaction({
      id: row.id,
      productId: row.productId,
      customerId: row.customerId,
      reference: row.reference,
      idempotencyKey: row.idempotencyKey,
      status: row.status as TransactionStatus,
      quantity: row.quantity,
      productAmountInCents: row.productAmountInCents,
      baseFeeInCents: row.baseFeeInCents,
      deliveryFeeInCents: row.deliveryFeeInCents,
      totalInCents: row.totalInCents,
      providerTransactionId: row.providerTransactionId,
      installments: row.installments,
      cardBrand: row.cardBrand,
      cardLastFour: row.cardLastFour,
      failureReason: row.failureReason,
      paymentStartedAt: row.paymentStartedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toCustomer(row: PrismaCustomerRow): Customer {
    return new Customer({
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
    });
  }

  private toDelivery(row: PrismaDeliveryRow): Delivery {
    return new Delivery({
      id: row.id,
      transactionId: row.transactionId,
      status: row.status as DeliveryStatus,
      address: row.address,
      city: row.city,
      region: row.region,
      notes: row.notes,
      assignedAt: row.assignedAt,
    });
  }
}