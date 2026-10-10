import { ApiProperty } from '@nestjs/swagger';
import type { DeliveryStatus } from '../../domain/entities/delivery.entity';
import type { TransactionStatus } from '../../domain/entities/transaction.entity';

export class TransactionAmountsDto {
  constructor(
    productAmountInCents: number,
    baseFeeInCents: number,
    deliveryFeeInCents: number,
    totalInCents: number,
  ) {
    this.productAmountInCents = productAmountInCents;
    this.baseFeeInCents = baseFeeInCents;
    this.deliveryFeeInCents = deliveryFeeInCents;
    this.totalInCents = totalInCents;
  }

  @ApiProperty({ example: 1500000 })
  readonly productAmountInCents: number;

  @ApiProperty({ example: 300000 })
  readonly baseFeeInCents: number;

  @ApiProperty({ example: 900000 })
  readonly deliveryFeeInCents: number;

  @ApiProperty({ example: 2700000 })
  readonly totalInCents: number;
}

export class TransactionCardDto {
  constructor(
    brand: string | null,
    lastFour: string | null,
    installments: number | null,
  ) {
    this.brand = brand;
    this.lastFour = lastFour;
    this.installments = installments;
  }

  @ApiProperty({ example: 'VISA', nullable: true })
  readonly brand: string | null;

  @ApiProperty({ example: '4242', nullable: true })
  readonly lastFour: string | null;

  @ApiProperty({ example: 1, nullable: true })
  readonly installments: number | null;
}

export class TransactionProductDto {
  constructor(id: string, name: string, quantity: number) {
    this.id = id;
    this.name = name;
    this.quantity = quantity;
  }

  @ApiProperty({ example: '11111111-1111-4111-8111-111111111111' })
  readonly id: string;

  @ApiProperty({ example: 'Cable Organizer' })
  readonly name: string;

  @ApiProperty({ example: 1 })
  readonly quantity: number;
}

export class TransactionDeliveryDto {
  constructor(
    status: DeliveryStatus,
    address: string,
    city: string,
    region: string,
  ) {
    this.status = status;
    this.address = address;
    this.city = city;
    this.region = region;
  }

  @ApiProperty({ example: 'ASSIGNED' })
  readonly status: DeliveryStatus;

  @ApiProperty({ example: 'Calle 1 #2-3' })
  readonly address: string;

  @ApiProperty({ example: 'Bogotá' })
  readonly city: string;

  @ApiProperty({ example: 'Cundinamarca' })
  readonly region: string;
}

export class CreateTransactionResponseDto {
  constructor(
    id: string,
    reference: string,
    status: TransactionStatus,
    quantity: number,
    amounts: TransactionAmountsDto,
  ) {
    this.id = id;
    this.reference = reference;
    this.status = status;
    this.quantity = quantity;
    this.amounts = amounts;
  }

  @ApiProperty({ example: 'f0e1...' })
  readonly id: string;

  @ApiProperty({ example: 'TXN-7K3F9Q2M8XJA4B6C' })
  readonly reference: string;

  @ApiProperty({ example: 'PENDING' })
  readonly status: TransactionStatus;

  @ApiProperty({ example: 1 })
  readonly quantity: number;

  @ApiProperty({ type: () => TransactionAmountsDto })
  readonly amounts: TransactionAmountsDto;
}

export class TransactionResponseDto {
  constructor(
    id: string,
    reference: string,
    status: TransactionStatus,
    quantity: number,
    amounts: TransactionAmountsDto,
    card: TransactionCardDto | null,
    product: TransactionProductDto,
    delivery: TransactionDeliveryDto | null,
    failureReason: string | null,
  ) {
    this.id = id;
    this.reference = reference;
    this.status = status;
    this.quantity = quantity;
    this.amounts = amounts;
    this.card = card;
    this.product = product;
    this.delivery = delivery;
    this.failureReason = failureReason;
  }

  @ApiProperty({ example: 'f0e1...' })
  readonly id: string;

  @ApiProperty({ example: 'TXN-7K3F9Q2M8XJA4B6C' })
  readonly reference: string;

  @ApiProperty({ example: 'APPROVED' })
  readonly status: TransactionStatus;

  @ApiProperty({ example: 1 })
  readonly quantity: number;

  @ApiProperty({ type: () => TransactionAmountsDto })
  readonly amounts: TransactionAmountsDto;

  @ApiProperty({ type: () => TransactionCardDto, nullable: true })
  readonly card: TransactionCardDto | null;

  @ApiProperty({ type: () => TransactionProductDto })
  readonly product: TransactionProductDto;

  @ApiProperty({ type: () => TransactionDeliveryDto, nullable: true })
  readonly delivery: TransactionDeliveryDto | null;

  @ApiProperty({ example: null, nullable: true })
  readonly failureReason: string | null;
}
