import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateTransactionDto } from './create-transaction.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const validBody = (): Record<string, unknown> => ({
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
});

const transform = (body: unknown): Promise<CreateTransactionDto> =>
  pipe.transform(body, { type: 'body', metatype: CreateTransactionDto });

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

describe('CreateTransactionDto', () => {
  it('accepts a well-formed body and builds the nested DTOs', async () => {
    const dto = await transform(validBody());

    expect(dto).toBeInstanceOf(CreateTransactionDto);
    expect(dto.productId).toBe('11111111-1111-4111-8111-111111111111');
    expect(dto.quantity).toBe(1);
    expect(dto.customer.fullName).toBe('Test Buyer');
    expect(dto.delivery.notes).toBe('Ring twice');
  });

  it('accepts a body without the optional delivery notes', async () => {
    const body = validBody();
    (body.delivery as Record<string, unknown>).notes = undefined;

    await expect(transform(body)).resolves.toBeInstanceOf(CreateTransactionDto);
  });

  it('rejects a productId that is not a uuid', async () => {
    await expectRejected({ ...validBody(), productId: 'not-a-uuid' });
  });

  it('rejects a quantity that is not an integer between 1 and 10', async () => {
    await expectRejected({ ...validBody(), quantity: 0 });
    await expectRejected({ ...validBody(), quantity: 1.5 });
    await expectRejected({ ...validBody(), quantity: '2' });
    await expectRejected({ ...validBody(), quantity: 11 }, '11');
  });

  it('rejects a missing customer or delivery', async () => {
    const withoutCustomer = validBody();
    delete withoutCustomer.customer;
    await expectRejected(withoutCustomer);

    const withoutDelivery = validBody();
    delete withoutDelivery.delivery;
    await expectRejected(withoutDelivery);
  });

  it('rejects invalid customer data', async () => {
    await expectRejected({
      ...validBody(),
      customer: {
        fullName: '',
        email: 'buyer@example.com',
        phone: '+57 300 000 0000',
      },
    });
    await expectRejected({
      ...validBody(),
      customer: {
        fullName: 'a'.repeat(121),
        email: 'buyer@example.com',
        phone: '+57 300 000 0000',
      },
    });
    await expectRejected({
      ...validBody(),
      customer: {
        fullName: 'Test Buyer',
        email: 'not-an-email',
        phone: '+57 300 000 0000',
      },
    });
    await expectRejected({
      ...validBody(),
      customer: {
        fullName: 'Test Buyer',
        email: 'buyer@example.com',
        phone: '123',
      },
    });
  });

  it('rejects invalid delivery data', async () => {
    await expectRejected({
      ...validBody(),
      delivery: { address: ' ', city: 'Bogotá', region: 'Cundinamarca' },
    });
    await expectRejected({
      ...validBody(),
      delivery: { address: 'Calle 1', city: '', region: 'Cundinamarca' },
    });
    await expectRejected({
      ...validBody(),
      delivery: { address: 'Calle 1', city: 'Bogotá', region: '' },
    });
    await expectRejected({
      ...validBody(),
      delivery: {
        address: 'Calle 1',
        city: 'Bogotá',
        region: 'Cundinamarca',
        notes: 'x'.repeat(501),
      },
    });
  });

  it('rejects client-sent amounts without echoing the values', async () => {
    await expectRejected(
      { ...validBody(), amounts: { totalInCents: 1357911 } },
      '1357911',
    );
    await expectRejected(
      { ...validBody(), productAmountInCents: 999999 },
      '999999',
    );
    await expectRejected({ ...validBody(), totalInCents: 246802468 }, '246802468');
  });

  it('rejects card-secret fields on the create body without echoing them', async () => {
    await expectRejected(
      { ...validBody(), number: '4242424242424242' },
      '4242424242424242',
    );
    await expectRejected({ ...validBody(), cvc: '737' }, '737');
  });
});
