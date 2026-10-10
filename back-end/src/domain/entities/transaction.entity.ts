import { isNonEmptyString } from '../rules/string.rules';
import {
  isValidIdempotencyKey,
  isValidInstallments,
  isValidQuantity,
  isValidReference,
} from '../rules/transaction.rules';

export type TransactionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DECLINED'
  | 'VOIDED'
  | 'ERROR';

export interface TransactionProps {
  id: string;
  productId: string;
  customerId: string;
  reference: string;
  idempotencyKey: string;
  status: TransactionStatus;
  quantity: number;
  productAmountInCents: number;
  baseFeeInCents: number;
  deliveryFeeInCents: number;
  totalInCents: number;
  providerTransactionId: string | null;
  installments: number | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  failureReason: string | null;
  paymentStartedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionTransitionInput {
  status: Exclude<TransactionStatus, 'PENDING'>;
  at: Date;
  providerTransactionId?: string | null;
  cardBrand?: string | null;
  cardLastFour?: string | null;
  installments?: number | null;
  failureReason?: string | null;
}

const TRANSACTION_STATUSES: readonly TransactionStatus[] = [
  'PENDING',
  'APPROVED',
  'DECLINED',
  'VOIDED',
  'ERROR',
];

export class Transaction {
  readonly id: string;
  readonly productId: string;
  readonly customerId: string;
  readonly reference: string;
  readonly idempotencyKey: string;
  readonly status: TransactionStatus;
  readonly quantity: number;
  readonly productAmountInCents: number;
  readonly baseFeeInCents: number;
  readonly deliveryFeeInCents: number;
  readonly totalInCents: number;
  readonly providerTransactionId: string | null;
  readonly installments: number | null;
  readonly cardBrand: string | null;
  readonly cardLastFour: string | null;
  readonly failureReason: string | null;
  readonly paymentStartedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: TransactionProps) {
    if (!isNonEmptyString(props.id)) {
      throw new RangeError('id must not be empty');
    }
    if (!isNonEmptyString(props.productId)) {
      throw new RangeError('productId must not be empty');
    }
    if (!isNonEmptyString(props.customerId)) {
      throw new RangeError('customerId must not be empty');
    }
    if (!isValidReference(props.reference)) {
      throw new RangeError(
        'reference must be "TXN-" followed by 16 uppercase letters or digits',
      );
    }
    if (!isValidIdempotencyKey(props.idempotencyKey)) {
      throw new RangeError(
        'idempotencyKey must be 16 to 64 characters of letters, digits, dash or underscore',
      );
    }
    if (!TRANSACTION_STATUSES.includes(props.status)) {
      throw new RangeError(
        'status must be one of PENDING, APPROVED, DECLINED, VOIDED, ERROR',
      );
    }
    if (!isValidQuantity(props.quantity)) {
      throw new RangeError('quantity must be a positive integer');
    }
    if (
      !Number.isInteger(props.productAmountInCents) ||
      props.productAmountInCents <= 0
    ) {
      throw new RangeError('productAmountInCents must be a positive integer');
    }
    if (!Number.isInteger(props.baseFeeInCents) || props.baseFeeInCents < 0) {
      throw new RangeError('baseFeeInCents must be a non-negative integer');
    }
    if (
      !Number.isInteger(props.deliveryFeeInCents) ||
      props.deliveryFeeInCents < 0
    ) {
      throw new RangeError('deliveryFeeInCents must be a non-negative integer');
    }
    if (
      props.totalInCents !==
      props.productAmountInCents +
        props.baseFeeInCents +
        props.deliveryFeeInCents
    ) {
      throw new RangeError(
        'totalInCents must equal productAmountInCents plus baseFeeInCents plus deliveryFeeInCents',
      );
    }
    if (
      props.providerTransactionId !== null &&
      !isNonEmptyString(props.providerTransactionId)
    ) {
      throw new RangeError(
        'providerTransactionId must be a non-empty string or null',
      );
    }
    if (props.installments !== null && !isValidInstallments(props.installments)) {
      throw new RangeError('installments must be a positive integer or null');
    }
    if (props.cardBrand !== null && !isNonEmptyString(props.cardBrand)) {
      throw new RangeError('cardBrand must be a non-empty string or null');
    }
    if (props.cardLastFour !== null && !/^[0-9]{4}$/.test(props.cardLastFour)) {
      throw new RangeError('cardLastFour must be 4 digits or null');
    }
    if (props.failureReason !== null && !isNonEmptyString(props.failureReason)) {
      throw new RangeError('failureReason must be a non-empty string or null');
    }
    if (props.paymentStartedAt !== null && !(props.paymentStartedAt instanceof Date)) {
      throw new RangeError('paymentStartedAt must be a Date or null');
    }
    if (!(props.createdAt instanceof Date)) {
      throw new RangeError('createdAt must be a Date');
    }
    if (!(props.updatedAt instanceof Date)) {
      throw new RangeError('updatedAt must be a Date');
    }

    this.id = props.id;
    this.productId = props.productId;
    this.customerId = props.customerId;
    this.reference = props.reference;
    this.idempotencyKey = props.idempotencyKey;
    this.status = props.status;
    this.quantity = props.quantity;
    this.productAmountInCents = props.productAmountInCents;
    this.baseFeeInCents = props.baseFeeInCents;
    this.deliveryFeeInCents = props.deliveryFeeInCents;
    this.totalInCents = props.totalInCents;
    this.providerTransactionId = props.providerTransactionId;
    this.installments = props.installments;
    this.cardBrand = props.cardBrand;
    this.cardLastFour = props.cardLastFour;
    this.failureReason = props.failureReason;
    this.paymentStartedAt = props.paymentStartedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  transition(input: TransactionTransitionInput): Transaction {
    if (this.status !== 'PENDING') {
      throw new RangeError('only a PENDING transaction can change state');
    }
    if (!(input.at instanceof Date)) {
      throw new RangeError('at must be a Date');
    }
    return new Transaction({
      ...this.toProps(),
      status: input.status,
      updatedAt: input.at,
      providerTransactionId:
        input.providerTransactionId !== undefined
          ? input.providerTransactionId
          : this.providerTransactionId,
      cardBrand:
        input.cardBrand !== undefined ? input.cardBrand : this.cardBrand,
      cardLastFour:
        input.cardLastFour !== undefined
          ? input.cardLastFour
          : this.cardLastFour,
      installments:
        input.installments !== undefined
          ? input.installments
          : this.installments,
      failureReason:
        input.failureReason !== undefined
          ? input.failureReason
          : this.failureReason,
    });
  }

  claimPayment(at: Date): Transaction {
    if (this.status !== 'PENDING') {
      throw new RangeError('only a PENDING transaction can start a payment');
    }
    if (!(at instanceof Date)) {
      throw new RangeError('at must be a Date');
    }
    return new Transaction({ ...this.toProps(), paymentStartedAt: at, updatedAt: at });
  }

  private toProps(): TransactionProps {
    return {
      id: this.id,
      productId: this.productId,
      customerId: this.customerId,
      reference: this.reference,
      idempotencyKey: this.idempotencyKey,
      status: this.status,
      quantity: this.quantity,
      productAmountInCents: this.productAmountInCents,
      baseFeeInCents: this.baseFeeInCents,
      deliveryFeeInCents: this.deliveryFeeInCents,
      totalInCents: this.totalInCents,
      providerTransactionId: this.providerTransactionId,
      installments: this.installments,
      cardBrand: this.cardBrand,
      cardLastFour: this.cardLastFour,
      failureReason: this.failureReason,
      paymentStartedAt: this.paymentStartedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}