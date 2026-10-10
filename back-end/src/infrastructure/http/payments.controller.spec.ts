import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { err, ok } from '../../application/result/result';
import type { CheckoutConfigOutput } from '../../application/use-cases/get-checkout-config.use-case';
import { GetCheckoutConfigUseCase } from '../../application/use-cases/get-checkout-config.use-case';
import { PayTransactionUseCase } from '../../application/use-cases/pay-transaction.use-case';
import type { TransactionView } from '../../application/transaction-view';
import { ContractsNotAcceptedError } from '../../domain/errors/contracts-not-accepted.error';
import { PaymentProviderUnavailableError } from '../../domain/errors/payment-provider-unavailable.error';
import { TransactionNotFoundError } from '../../domain/errors/transaction-not-found.error';
import { TransactionNotPayableError } from '../../domain/errors/transaction-not-payable.error';
import { CheckoutConfigResponseDto } from './checkout-config-response.dto';
import { PayTransactionDto } from './pay-transaction.dto';
import { PaymentsController } from './payments.controller';
import { TransactionResponseDto } from './transaction-response.dto';

const configOutput: CheckoutConfigOutput = {
  publicKey: 'pub_test_public_key',
  baseUrl: 'https://sandbox.invalid/v1',
  currency: 'COP',
  contracts: {
    terms: 'https://sandbox.invalid/permalink/terms',
    personalData: 'https://sandbox.invalid/permalink/personal',
  },
  installments: { default: 1, max: 36 },
};

const view = (status: TransactionView['status']): TransactionView => ({
  id: 'f0e1',
  reference: 'TXN-7K3F9Q2M8XJA4B6C',
  status,
  quantity: 1,
  amounts: {
    productAmountInCents: 1500000,
    baseFeeInCents: 300000,
    deliveryFeeInCents: 900000,
    totalInCents: 2700000,
  },
  card:
    status === 'PENDING'
      ? null
      : { brand: 'VISA', lastFour: '4242', installments: 1 },
  product: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Cable Organizer',
    quantity: 1,
  },
  delivery: {
    status: status === 'APPROVED' ? 'ASSIGNED' : 'PENDING',
    address: 'Calle 1 #2-3',
    city: 'Bogotá',
    region: 'Cundinamarca',
  },
  failureReason: null,
});

const payBody = (): PayTransactionDto =>
  ({
    cardToken: 'tok_test_card',
    installments: 1,
    acceptedContracts: true,
  }) as PayTransactionDto;

describe('PaymentsController', () => {
  let checkout: jest.Mock;
  let pay: jest.Mock;
  let controller: PaymentsController;
  let response: Response & { status: jest.Mock };

  beforeEach(() => {
    checkout = jest.fn();
    pay = jest.fn();
    response = { status: jest.fn() } as unknown as Response & {
      status: jest.Mock;
    };
    controller = new PaymentsController(
      { execute: checkout } as unknown as GetCheckoutConfigUseCase,
      { execute: pay } as unknown as PayTransactionUseCase,
    );
  });

  describe('getCheckoutConfig', () => {
    it('calls the use case and maps the public config', async () => {
      checkout.mockResolvedValue(ok(configOutput));

      const dto = await controller.getCheckoutConfig();

      expect(checkout).toHaveBeenCalledTimes(1);
      expect(dto).toBeInstanceOf(CheckoutConfigResponseDto);
      expect(dto.publicKey).toBe('pub_test_public_key');
      expect(dto.contracts).toEqual({
        terms: 'https://sandbox.invalid/permalink/terms',
        personalData: 'https://sandbox.invalid/permalink/personal',
      });
      expect(dto.installments).toEqual({ default: 1, max: 36 });
    });

    it('forwards the provider-unavailable error without deciding the status code', async () => {
      const failure = new PaymentProviderUnavailableError('network');
      checkout.mockResolvedValue(err(failure));

      await expect(controller.getCheckoutConfig()).rejects.toBe(failure);
    });
  });

  describe('payTransaction', () => {
    it('returns 202 with the mapped view while the payment is pending', async () => {
      pay.mockResolvedValue(ok(view('PENDING')));

      const dto = await controller.payTransaction('f0e1', payBody(), response);

      expect(pay).toHaveBeenCalledWith({
        transactionId: 'f0e1',
        cardToken: 'tok_test_card',
        installments: 1,
        acceptedContracts: true,
      });
      expect(response.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
      expect(dto).toBeInstanceOf(TransactionResponseDto);
      expect(dto.status).toBe('PENDING');
      expect(dto.card).toBeNull();
    });

    it.each<[TransactionView['status']]>([
      ['APPROVED'],
      ['DECLINED'],
      ['VOIDED'],
      ['ERROR'],
    ])('returns 200 when the provider already gave a final status (%s)', async (status) => {
      pay.mockResolvedValue(ok(view(status)));

      const dto = await controller.payTransaction('f0e1', payBody(), response);

      expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(dto.status).toBe(status);
    });

    it('forwards a not-found result without deciding the status code', async () => {
      const notFound = new TransactionNotFoundError('f0e1');
      pay.mockResolvedValue(err(notFound));

      await expect(
        controller.payTransaction('f0e1', payBody(), response),
      ).rejects.toBe(notFound);
      expect(response.status).not.toHaveBeenCalled();
    });

    it('forwards the contracts-not-accepted result', async () => {
      const notAccepted = new ContractsNotAcceptedError();
      pay.mockResolvedValue(err(notAccepted));

      await expect(
        controller.payTransaction('f0e1', payBody(), response),
      ).rejects.toBe(notAccepted);
    });

    it('forwards the not-payable result', async () => {
      const notPayable = new TransactionNotPayableError('f0e1', 'APPROVED');
      pay.mockResolvedValue(err(notPayable));

      await expect(
        controller.payTransaction('f0e1', payBody(), response),
      ).rejects.toBe(notPayable);
    });
  });
});
