import type { TransactionView } from '../../application/transaction-view';
import type { CreateTransactionOutput } from '../../application/use-cases/create-transaction.use-case';
import {
  CreateTransactionResponseDto,
  TransactionResponseDto,
} from './transaction-response.dto';
import {
  toCreateTransactionResponseDto,
  toTransactionResponseDto,
} from './transaction-response.mapper';

const output: CreateTransactionOutput = {
  id: 'f0e1',
  reference: 'TXN-7K3F9Q2M8XJA4B6C',
  status: 'PENDING',
  quantity: 1,
  amounts: {
    productAmountInCents: 1500000,
    baseFeeInCents: 300000,
    deliveryFeeInCents: 900000,
    totalInCents: 2700000,
  },
};

const view = (overrides: Partial<TransactionView> = {}): TransactionView => ({
  id: 'f0e1',
  reference: 'TXN-7K3F9Q2M8XJA4B6C',
  status: 'APPROVED',
  quantity: 1,
  amounts: {
    productAmountInCents: 1500000,
    baseFeeInCents: 300000,
    deliveryFeeInCents: 900000,
    totalInCents: 2700000,
  },
  card: { brand: 'VISA', lastFour: '4242', installments: 1 },
  product: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Cable Organizer',
    quantity: 1,
  },
  delivery: {
    status: 'ASSIGNED',
    address: 'Calle 1 #2-3',
    city: 'Bogotá',
    region: 'Cundinamarca',
  },
  failureReason: null,
  ...overrides,
});

describe('transaction-response.mapper', () => {
  it('maps the create output to the 201 response shape', () => {
    const dto = toCreateTransactionResponseDto(output);

    expect(dto).toBeInstanceOf(CreateTransactionResponseDto);
    expect(dto).toEqual({
      id: 'f0e1',
      reference: 'TXN-7K3F9Q2M8XJA4B6C',
      status: 'PENDING',
      quantity: 1,
      amounts: {
        productAmountInCents: 1500000,
        baseFeeInCents: 300000,
        deliveryFeeInCents: 900000,
        totalInCents: 2700000,
      },
    });
  });

  it('maps a full transaction view', () => {
    const dto = toTransactionResponseDto(view());

    expect(dto).toBeInstanceOf(TransactionResponseDto);
    expect(dto.card).toEqual({
      brand: 'VISA',
      lastFour: '4242',
      installments: 1,
    });
    expect(dto.product).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Cable Organizer',
      quantity: 1,
    });
    expect(dto.delivery).toEqual({
      status: 'ASSIGNED',
      address: 'Calle 1 #2-3',
      city: 'Bogotá',
      region: 'Cundinamarca',
    });
    expect(dto.failureReason).toBeNull();
  });

  it('maps a view without card data', () => {
    const dto = toTransactionResponseDto(
      view({ card: null, status: 'PENDING' }),
    );

    expect(dto.card).toBeNull();
  });

  it('never exposes card numbers, tokens or secrets in the response', () => {
    const serialized = JSON.stringify(toTransactionResponseDto(view()));

    expect(serialized).not.toContain('number');
    expect(serialized).not.toContain('cvc');
    expect(serialized).not.toContain('cardToken');
    expect(serialized).not.toContain('acceptanceToken');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('secret');
  });
});
