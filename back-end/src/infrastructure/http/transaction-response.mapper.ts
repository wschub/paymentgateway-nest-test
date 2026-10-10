import type { TransactionView } from '../../application/transaction-view';
import type { CreateTransactionOutput } from '../../application/use-cases/create-transaction.use-case';
import {
  CreateTransactionResponseDto,
  TransactionAmountsDto,
  TransactionCardDto,
  TransactionDeliveryDto,
  TransactionProductDto,
  TransactionResponseDto,
} from './transaction-response.dto';

const toAmounts = (amounts: {
  productAmountInCents: number;
  baseFeeInCents: number;
  deliveryFeeInCents: number;
  totalInCents: number;
}): TransactionAmountsDto =>
  new TransactionAmountsDto(
    amounts.productAmountInCents,
    amounts.baseFeeInCents,
    amounts.deliveryFeeInCents,
    amounts.totalInCents,
  );

export const toCreateTransactionResponseDto = (
  output: CreateTransactionOutput,
): CreateTransactionResponseDto =>
  new CreateTransactionResponseDto(
    output.id,
    output.reference,
    output.status,
    output.quantity,
    toAmounts(output.amounts),
  );

export const toTransactionResponseDto = (
  view: TransactionView,
): TransactionResponseDto =>
  new TransactionResponseDto(
    view.id,
    view.reference,
    view.status,
    view.quantity,
    toAmounts(view.amounts),
    view.card === null
      ? null
      : new TransactionCardDto(
          view.card.brand,
          view.card.lastFour,
          view.card.installments,
        ),
    new TransactionProductDto(
      view.product.id,
      view.product.name,
      view.product.quantity,
    ),
    view.delivery === null
      ? null
      : new TransactionDeliveryDto(
          view.delivery.status,
          view.delivery.address,
          view.delivery.city,
          view.delivery.region,
        ),
    view.failureReason,
  );
