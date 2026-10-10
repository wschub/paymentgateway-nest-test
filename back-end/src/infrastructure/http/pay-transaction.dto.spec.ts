import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PayTransactionDto } from './pay-transaction.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const validBody = (): Record<string, unknown> => ({
  cardToken: 'tok_test_...',
  installments: 1,
  acceptedContracts: true,
});

const transform = (body: unknown): Promise<PayTransactionDto> =>
  pipe.transform(body, { type: 'body', metatype: PayTransactionDto });

const expectRejected = async (
  body: unknown,
  forbiddenValue?: string,
): Promise<BadRequestException> => {
  const error = await transform(body).then(
    () => {
      throw new Error('expected the body to be rejected');
    },
    (caught: unknown) => caught,
  );

  expect(error).toBeInstanceOf(BadRequestException);
  const exception = error as BadRequestException;
  if (forbiddenValue !== undefined) {
    expect(JSON.stringify(exception.getResponse())).not.toContain(
      forbiddenValue,
    );
  }
  return exception;
};

describe('PayTransactionDto', () => {
  it('accepts a well-formed body', async () => {
    const dto = await transform(validBody());

    expect(dto).toBeInstanceOf(PayTransactionDto);
    expect(dto.cardToken).toBe('tok_test_...');
    expect(dto.installments).toBe(1);
    expect(dto.acceptedContracts).toBe(true);
  });

  it('lets acceptedContracts=false through so the use case can answer 422', async () => {
    const dto = await transform({ ...validBody(), acceptedContracts: false });

    expect(dto.acceptedContracts).toBe(false);
  });

  it('accepts a body without the optional installments', async () => {
    const body = validBody();
    delete body.installments;

    const dto = await transform(body);

    expect(dto.installments).toBeUndefined();
  });

  it('rejects a non-boolean acceptedContracts', async () => {
    await expectRejected({ ...validBody(), acceptedContracts: 'true' });
    await expectRejected({ ...validBody(), acceptedContracts: 1 });
  });

  it('rejects a missing cardToken', async () => {
    const body = validBody();
    delete body.cardToken;
    await expectRejected(body);
    await expectRejected({ ...validBody(), cardToken: '' });
  });

  it('rejects invalid installments', async () => {
    await expectRejected({ ...validBody(), installments: 0 });
    await expectRejected({ ...validBody(), installments: 1.5 });
    await expectRejected({ ...validBody(), installments: '2' });
  });

  it('rejects card-secret and amount fields without echoing the values', async () => {
    await expectRejected(
      { ...validBody(), number: '4242424242424242' },
      '4242424242424242',
    );
    await expectRejected({ ...validBody(), cvc: '737' }, '737');
    await expectRejected({ ...validBody(), amountInCents: 1234567 }, '1234567');
    await expectRejected(
      { ...validBody(), amounts: { totalInCents: 7654321 } },
      '7654321',
    );
    await expectRejected({ ...validBody(), totalInCents: 1122334 }, '1122334');
  });
});
