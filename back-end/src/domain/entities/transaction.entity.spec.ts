import {
  Transaction,
  type TransactionProps,
  type TransactionStatus,
} from './transaction.entity';

describe('Transaction', () => {
  const props: TransactionProps = {
    id: '22222222-2222-4222-8222-222222222222',
    productId: '11111111-1111-4111-8111-111111111111',
    customerId: '33333333-3333-4333-8333-333333333333',
    reference: 'TXN-7K3F9Q2M8XJA4B6C',
    idempotencyKey: 'order_0001_abcdefgh',
    status: 'PENDING',
    quantity: 2,
    productAmountInCents: 70000,
    baseFeeInCents: 3000,
    deliveryFeeInCents: 1500,
    totalInCents: 74500,
    providerTransactionId: null,
    installments: null,
    cardBrand: null,
    cardLastFour: null,
    failureReason: null,
    paymentStartedAt: null,
    createdAt: new Date('2026-10-09T10:00:00.000Z'),
    updatedAt: new Date('2026-10-09T10:00:00.000Z'),
  };

  it('keeps every attribute of the transaction', () => {
    const transaction = new Transaction(props);

    expect(transaction.id).toBe(props.id);
    expect(transaction.productId).toBe(props.productId);
    expect(transaction.customerId).toBe(props.customerId);
    expect(transaction.reference).toBe(props.reference);
    expect(transaction.idempotencyKey).toBe(props.idempotencyKey);
    expect(transaction.status).toBe('PENDING');
    expect(transaction.quantity).toBe(2);
    expect(transaction.productAmountInCents).toBe(70000);
    expect(transaction.baseFeeInCents).toBe(3000);
    expect(transaction.deliveryFeeInCents).toBe(1500);
    expect(transaction.totalInCents).toBe(74500);
    expect(transaction.providerTransactionId).toBeNull();
    expect(transaction.installments).toBeNull();
    expect(transaction.cardBrand).toBeNull();
    expect(transaction.cardLastFour).toBeNull();
    expect(transaction.failureReason).toBeNull();
    expect(transaction.paymentStartedAt).toBeNull();
    expect(transaction.createdAt).toEqual(new Date('2026-10-09T10:00:00.000Z'));
    expect(transaction.updatedAt).toEqual(new Date('2026-10-09T10:00:00.000Z'));
  });

  describe('reference format', () => {
    it('rejects a reference without the TXN- prefix', () => {
      expect(() => new Transaction({ ...props, reference: '7K3F9Q2M8XJA4B6C' })).toThrow(
        'reference must be "TXN-" followed by 16 uppercase letters or digits',
      );
    });

    it('rejects a reference that is not 16 characters after the prefix', () => {
      for (const reference of ['TXN-7K3F9Q2M8XJA4B6', 'TXN-7K3F9Q2M8XJA4B6CD']) {
        expect(() => new Transaction({ ...props, reference })).toThrow(
          'reference must be "TXN-" followed by 16 uppercase letters or digits',
        );
      }
    });

    it('rejects a reference that is not uppercase', () => {
      expect(() =>
        new Transaction({ ...props, reference: 'TXN-7k3f9q2m8xja4b6c' }),
      ).toThrow('reference must be "TXN-" followed by 16 uppercase letters or digits');
    });

    it('accepts a reference with mixed uppercase letters and digits', () => {
      const transaction = new Transaction({ ...props, reference: 'TXN-A1B2C3D4E5F6G7H8' });

      expect(transaction.reference).toBe('TXN-A1B2C3D4E5F6G7H8');
    });
  });

  describe('idempotency key rule', () => {
    it('rejects a key shorter than 16 characters', () => {
      expect(() => new Transaction({ ...props, idempotencyKey: 'short-key' })).toThrow(
        'idempotencyKey must be 16 to 64 characters of letters, digits, dash or underscore',
      );
    });

    it('rejects a key longer than 64 characters', () => {
      expect(() =>
        new Transaction({ ...props, idempotencyKey: 'a'.repeat(65) }),
      ).toThrow(
        'idempotencyKey must be 16 to 64 characters of letters, digits, dash or underscore',
      );
    });

    it('rejects characters outside letters, digits, dash and underscore', () => {
      for (const idempotencyKey of ['aaaaaaaaaaaaaaaa!', 'aaaaaaaaaaaaaaaa.a']) {
        expect(() => new Transaction({ ...props, idempotencyKey })).toThrow(
          'idempotencyKey must be 16 to 64 characters of letters, digits, dash or underscore',
        );
      }
    });

    it('accepts letters, digits, dash and underscore', () => {
      const transaction = new Transaction({
        ...props,
        idempotencyKey: 'A1_b_ccdd_eeff_gg_hh',
      });

      expect(transaction.idempotencyKey).toBe('A1_b_ccdd_eeff_gg_hh');
    });
  });

  describe('status transition rules', () => {
    it('accepts every documented status value', () => {
      for (const status of ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'] as const) {
        const transaction = new Transaction({ ...props, status });
        expect(transaction.status).toBe(status);
      }
    });

    it('rejects an unknown status', () => {
      expect(() =>
        new Transaction({ ...props, status: 'EXPIRED' as TransactionStatus }),
      ).toThrow('status must be one of PENDING, APPROVED, DECLINED, VOIDED, ERROR');
    });

    it('transitions from PENDING to a final status', () => {
      const at = new Date('2026-10-09T10:05:00.000Z');
      const transaction = new Transaction(props).transition({
        status: 'APPROVED',
        at,
        providerTransactionId: 'provider-1',
        cardBrand: 'VISA',
        cardLastFour: '4242',
        installments: 3,
      });

      expect(transaction.status).toBe('APPROVED');
      expect(transaction.providerTransactionId).toBe('provider-1');
      expect(transaction.cardBrand).toBe('VISA');
      expect(transaction.cardLastFour).toBe('4242');
      expect(transaction.installments).toBe(3);
      expect(transaction.updatedAt).toEqual(at);
    });

    it('only allows a PENDING transaction to change state', () => {
      const approved = new Transaction({ ...props, status: 'APPROVED' });

      expect(() => approved.transition({ status: 'VOIDED', at: new Date() })).toThrow(
        'only a PENDING transaction can change state',
      );
    });

    it('keeps terminal states immutable', () => {
      for (const status of ['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'] as const) {
        const terminal = new Transaction({ ...props, status });
        expect(() =>
          terminal.transition({ status: 'VOIDED', at: new Date() }),
        ).toThrow('only a PENDING transaction can change state');
      }
    });
  });

  describe('payment claim', () => {
    it('claims payment only while PENDING', () => {
      const at = new Date('2026-10-09T10:02:00.000Z');
      const claimed = new Transaction(props).claimPayment(at);

      expect(claimed.status).toBe('PENDING');
      expect(claimed.paymentStartedAt).toEqual(at);
    });

    it('rejects a claim once a final status is reached', () => {
      const approved = new Transaction({ ...props, status: 'APPROVED' });

      expect(() => approved.claimPayment(new Date())).toThrow(
        'only a PENDING transaction can start a payment',
      );
    });
  });

  describe('money invariants', () => {
    it('rejects a quantity that is not a positive integer', () => {
      for (const quantity of [0, -1, 1.5]) {
        expect(() => new Transaction({ ...props, quantity })).toThrow(
          'quantity must be a positive integer',
        );
      }
    });

    it('rejects a product amount that is not a positive integer', () => {
      for (const productAmountInCents of [0, -1, 9.99]) {
        expect(() => new Transaction({ ...props, productAmountInCents })).toThrow(
          'productAmountInCents must be a positive integer',
        );
      }
    });

    it('rejects negative fees', () => {
      expect(() => new Transaction({ ...props, baseFeeInCents: -1 })).toThrow(
        'baseFeeInCents must be a non-negative integer',
      );
      expect(() => new Transaction({ ...props, deliveryFeeInCents: -500 })).toThrow(
        'deliveryFeeInCents must be a non-negative integer',
      );
    });

    it('rejects a total that is not the exact sum of product plus fees', () => {
      for (const totalInCents of [74501, 74499]) {
        expect(() => new Transaction({ ...props, totalInCents })).toThrow(
          'totalInCents must equal productAmountInCents plus baseFeeInCents plus deliveryFeeInCents',
        );
      }
    });
  });

  describe('card fields', () => {
    it('rejects installments below 1', () => {
      for (const installments of [0, 1.5]) {
        expect(() => new Transaction({ ...props, installments })).toThrow(
          'installments must be a positive integer or null',
        );
      }
    });

    it('accepts installments of 1', () => {
      const transaction = new Transaction({ ...props, installments: 1 });

      expect(transaction.installments).toBe(1);
    });

    it('rejects a card last four that is not 4 digits', () => {
      for (const cardLastFour of ['12', '12ab', '12345']) {
        expect(() => new Transaction({ ...props, cardLastFour })).toThrow(
          'cardLastFour must be 4 digits or null',
        );
      }
    });
  });
});