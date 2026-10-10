import { BadRequestException } from '@nestjs/common';
import { err, ok } from '../../application/result/result';
import type { CreateTransactionOutput } from '../../application/use-cases/create-transaction.use-case';
import { CreateTransactionUseCase } from '../../application/use-cases/create-transaction.use-case';
import { GetTransactionUseCase } from '../../application/use-cases/get-transaction.use-case';
import type { TransactionView } from '../../application/transaction-view';
import { DataAccessError } from '../../domain/errors/data-access.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { TransactionNotFoundError } from '../../domain/errors/transaction-not-found.error';
import { CreateTransactionDto } from './create-transaction.dto';
import {
  CreateTransactionResponseDto,
  TransactionResponseDto,
} from './transaction-response.dto';
import { TransactionsController } from './transactions.controller';

const IDEMPOTENCY_KEY = 'idem-1234567890-ABCDEF';

const createOutput: CreateTransactionOutput = {
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

const view: TransactionView = {
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
};

const body = (): CreateTransactionDto =>
  ({
    productId: '11111111-1111-4111-8111-111111111111',
    quantity: 1,
    customer: {
      fullName: 'Test Buyer',
      email: 'buyer@example.com',
      phone: '+57 300 000 0000',
    },
    delivery: {
      address: 'Calle 1 #2-3',
      city: 'Bogotá',
      region: 'Cundinamarca',
      notes: 'Ring twice',
    },
  }) as CreateTransactionDto;

describe('TransactionsController', () => {
  let create: jest.Mock;
  let getById: jest.Mock;
  let controller: TransactionsController;

  beforeEach(() => {
    create = jest.fn();
    getById = jest.fn();
    controller = new TransactionsController(
      { execute: create } as unknown as CreateTransactionUseCase,
      { execute: getById } as unknown as GetTransactionUseCase,
    );
  });

  describe('createTransaction', () => {
    it('calls the use case with the body and the idempotency key, then maps the output', async () => {
      create.mockResolvedValue(ok(createOutput));

      const response = await controller.createTransaction(
        IDEMPOTENCY_KEY,
        body(),
      );

      expect(create).toHaveBeenCalledWith({
        productId: '11111111-1111-4111-8111-111111111111',
        quantity: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        customer: {
          fullName: 'Test Buyer',
          email: 'buyer@example.com',
          phone: '+57 300 000 0000',
        },
        delivery: {
          address: 'Calle 1 #2-3',
          city: 'Bogotá',
          region: 'Cundinamarca',
          notes: 'Ring twice',
        },
      });
      expect(response).toBeInstanceOf(CreateTransactionResponseDto);
      expect(response).toEqual({
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

    it('rejects a missing Idempotency-Key header with 400 before calling the use case', async () => {
      await expect(
        controller.createTransaction(undefined, body()),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a malformed idempotency key with 400 and never echoes it', async () => {
      const shortKey = 'too-short';

      await expect(
        controller.createTransaction(shortKey, body()),
      ).rejects.toBeInstanceOf(BadRequestException);

      const error = await controller
        .createTransaction('bad key with spaces', body())
        .catch((caught: unknown) => caught);
      expect(JSON.stringify((error as BadRequestException).getResponse())).not.toContain(
        'bad key with spaces',
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('forwards a not-found result without deciding the status code itself', async () => {
      const notFound = new ProductNotFoundError(
        '11111111-1111-4111-8111-111111111111',
      );
      create.mockResolvedValue(err(notFound));

      await expect(
        controller.createTransaction(IDEMPOTENCY_KEY, body()),
      ).rejects.toBe(notFound);
    });

    it('forwards an infrastructure error without deciding the status code itself', async () => {
      const failure = new DataAccessError('transaction repository is down');
      create.mockResolvedValue(err(failure));

      await expect(
        controller.createTransaction(IDEMPOTENCY_KEY, body()),
      ).rejects.toBe(failure);
    });
  });

  describe('getTransaction', () => {
    it('calls the use case with the id and maps the view', async () => {
      getById.mockResolvedValue(ok<TransactionView>(view));

      const response = await controller.getTransaction('f0e1');

      expect(getById).toHaveBeenCalledWith('f0e1');
      expect(response).toBeInstanceOf(TransactionResponseDto);
      expect(response).toEqual({
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
      });
    });

    it('forwards a not-found result without deciding the status code itself', async () => {
      const notFound = new TransactionNotFoundError('f0e1');
      getById.mockResolvedValue(err(notFound));

      await expect(controller.getTransaction('f0e1')).rejects.toBe(notFound);
    });
  });
});
