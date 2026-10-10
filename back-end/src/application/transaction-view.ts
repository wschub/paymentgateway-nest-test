import type { DeliveryStatus } from '../domain/entities/delivery.entity';
import type { TransactionStatus } from '../domain/entities/transaction.entity';
import type { TransactionDetails } from '../domain/ports/transaction.repository';

export interface TransactionView {
  id: string;
  reference: string;
  status: TransactionStatus;
  quantity: number;
  amounts: {
    productAmountInCents: number;
    baseFeeInCents: number;
    deliveryFeeInCents: number;
    totalInCents: number;
  };
  card: {
    brand: string | null;
    lastFour: string | null;
    installments: number | null;
  } | null;
  product: {
    id: string;
    name: string;
    quantity: number;
  };
  delivery: {
    status: DeliveryStatus;
    address: string;
    city: string;
    region: string;
  } | null;
  failureReason: string | null;
}

export const buildTransactionView = (
  details: TransactionDetails,
): TransactionView => {
  const { transaction, delivery, product } = details;
  return {
    id: transaction.id,
    reference: transaction.reference,
    status: transaction.status,
    quantity: transaction.quantity,
    amounts: {
      productAmountInCents: transaction.productAmountInCents,
      baseFeeInCents: transaction.baseFeeInCents,
      deliveryFeeInCents: transaction.deliveryFeeInCents,
      totalInCents: transaction.totalInCents,
    },
    card:
      transaction.cardBrand !== null || transaction.cardLastFour !== null
        ? {
            brand: transaction.cardBrand,
            lastFour: transaction.cardLastFour,
            installments: transaction.installments,
          }
        : null,
    product: {
      id: product.id,
      name: product.name,
      quantity: transaction.quantity,
    },
    delivery: {
      status: delivery.status,
      address: delivery.address,
      city: delivery.city,
      region: delivery.region,
    },
    failureReason: transaction.failureReason,
  };
};