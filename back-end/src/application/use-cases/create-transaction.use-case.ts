import type { Product } from '../../domain/entities/product.entity';
import type { TransactionStatus } from '../../domain/entities/transaction.entity';
import { DataAccessError } from '../../domain/errors/data-access.error';
import { IdempotencyReplayNotSupportedError } from '../../domain/errors/idempotency-replay-not-supported.error';
import { InsufficientStockError } from '../../domain/errors/insufficient-stock.error';
import {
  InvalidTransactionRequestError,
  type InvalidTransactionRequestField,
} from '../../domain/errors/invalid-transaction-request.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import type { Clock } from '../../domain/ports/clock.port';
import type { ProductRepository } from '../../domain/ports/product.repository';
import type { ReferenceGenerator } from '../../domain/ports/reference-generator.port';
import type { TransactionRepository } from '../../domain/ports/transaction.repository';
import {
  isValidCustomerEmail,
  isValidCustomerFullName,
  isValidCustomerPhone,
} from '../../domain/rules/customer.rules';
import {
  isValidDeliveryAddress,
  isValidDeliveryCity,
  isValidDeliveryNotes,
  isValidDeliveryRegion,
} from '../../domain/rules/delivery.rules';
import { isNonEmptyString } from '../../domain/rules/string.rules';
import {
  isValidIdempotencyKey,
  isValidQuantity,
} from '../../domain/rules/transaction.rules';
import type { FeesConfig } from '../../domain/value-objects/fees-config';
import { err, ok, type Result } from '../result/result';

export interface CreateCustomerInput {
  fullName: string;
  email: string;
  phone: string;
}

export interface CreateDeliveryInput {
  address: string;
  city: string;
  region: string;
  notes?: string | null;
}

export interface CreateTransactionInput {
  productId: string;
  quantity: number;
  idempotencyKey: string;
  customer: CreateCustomerInput;
  delivery: CreateDeliveryInput;
}

export interface CreateTransactionAmounts {
  productAmountInCents: number;
  baseFeeInCents: number;
  deliveryFeeInCents: number;
  totalInCents: number;
}

export interface CreateTransactionOutput {
  id: string;
  reference: string;
  status: TransactionStatus;
  quantity: number;
  amounts: CreateTransactionAmounts;
}

export type CreateTransactionError =
  | InvalidTransactionRequestError
  | ProductNotFoundError
  | InsufficientStockError
  | IdempotencyReplayNotSupportedError
  | DataAccessError;

export class CreateTransactionUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly feesConfig: FeesConfig,
    private readonly clock: Clock,
    private readonly referenceGenerator: ReferenceGenerator,
  ) {}

  async execute(
    input: CreateTransactionInput,
  ): Promise<Result<CreateTransactionOutput, CreateTransactionError>> {
    const invalidFields = this.validate(input);
    if (invalidFields.length > 0) {
      return err(new InvalidTransactionRequestError(invalidFields));
    }

    let product: Product;
    try {
      const found = await this.productRepository.findById(input.productId);
      if (found === null) {
        return err(new ProductNotFoundError(input.productId));
      }
      product = found;
    } catch (error) {
      if (error instanceof DataAccessError) {
        return err(error);
      }
      throw error;
    }

    const productAmountInCents = product.priceInCents * input.quantity;
    const baseFeeInCents = this.feesConfig.baseFeeInCents;
    const deliveryFeeInCents = this.feesConfig.deliveryFeeInCents;
    const totalInCents = productAmountInCents + baseFeeInCents + deliveryFeeInCents;

    let reserved;
    try {
      reserved = await this.transactionRepository.createPendingWithReservedStock({
        productId: input.productId,
        reference: this.referenceGenerator.newReference(),
        idempotencyKey: input.idempotencyKey,
        quantity: input.quantity,
        productAmountInCents,
        baseFeeInCents,
        deliveryFeeInCents,
        totalInCents,
        customer: {
          fullName: input.customer.fullName,
          email: input.customer.email,
          phone: input.customer.phone,
        },
        delivery: {
          address: input.delivery.address,
          city: input.delivery.city,
          region: input.delivery.region,
          notes: input.delivery.notes ?? null,
        },
        now: this.clock.now(),
      });
    } catch (error) {
      if (error instanceof DataAccessError) {
        return err(error);
      }
      throw error;
    }

    switch (reserved.kind) {
      case 'created':
        return ok({
          id: reserved.transaction.id,
          reference: reserved.transaction.reference,
          status: reserved.transaction.status,
          quantity: reserved.transaction.quantity,
          amounts: {
            productAmountInCents: reserved.transaction.productAmountInCents,
            baseFeeInCents: reserved.transaction.baseFeeInCents,
            deliveryFeeInCents: reserved.transaction.deliveryFeeInCents,
            totalInCents: reserved.transaction.totalInCents,
          },
        });
      case 'out_of_stock':
        return err(
          new InsufficientStockError(input.productId, input.quantity, product.stock),
        );
      case 'product_not_found':
        return err(new ProductNotFoundError(input.productId));
      case 'duplicate':
        return err(new IdempotencyReplayNotSupportedError());
    }
  }

  private validate(input: CreateTransactionInput): InvalidTransactionRequestField[] {
    const invalidFields: InvalidTransactionRequestField[] = [];

    if (!isNonEmptyString(input.productId)) {
      invalidFields.push('productId');
    }
    if (!isValidQuantity(input.quantity)) {
      invalidFields.push('quantity');
    }
    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      invalidFields.push('idempotencyKey');
    }
    if (!isValidCustomerFullName(input.customer?.fullName)) {
      invalidFields.push('fullName');
    }
    if (!isValidCustomerEmail(input.customer?.email)) {
      invalidFields.push('email');
    }
    if (!isValidCustomerPhone(input.customer?.phone)) {
      invalidFields.push('phone');
    }
    if (!isValidDeliveryAddress(input.delivery?.address)) {
      invalidFields.push('address');
    }
    if (!isValidDeliveryCity(input.delivery?.city)) {
      invalidFields.push('city');
    }
    if (!isValidDeliveryRegion(input.delivery?.region)) {
      invalidFields.push('region');
    }
    if (!isValidDeliveryNotes(input.delivery?.notes)) {
      invalidFields.push('notes');
    }

    return invalidFields;
  }
}