import { Product } from '../../domain/entities/product.entity';
import { DataAccessError } from '../../domain/errors/data-access.error';
import type { ProductRepository } from '../../domain/ports/product.repository';
import { InMemoryProductRepository } from '../../testing/in-memory-product.repository';
import { GetProductsUseCase } from './get-products.use-case';

describe('GetProductsUseCase', () => {
  const mouse = new Product({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Wireless Mouse',
    description: 'Ergonomic wireless mouse',
    priceInCents: 35000,
    stock: 15,
    imageUrl: '/images/products/wireless-mouse.webp',
    createdAt: new Date('2026-10-07T10:00:00.000Z'),
    updatedAt: new Date('2026-10-07T11:00:00.000Z'),
  });

  const soldOutHeadset = new Product({
    id: '33333333-3333-4333-8333-333333333333',
    name: 'USB-C Headset',
    description: 'Noise cancelling headset',
    priceInCents: 99000,
    stock: 0,
    imageUrl: '/images/products/usb-c-headset.webp',
    createdAt: new Date('2026-10-07T10:00:00.000Z'),
    updatedAt: new Date('2026-10-07T11:00:00.000Z'),
  });

  const useCaseWith = (products: Product[], failureCause?: Error) =>
    new GetProductsUseCase(
      new InMemoryProductRepository(products, failureCause),
    );

  const alwaysFailing = (error: Error): ProductRepository => ({
    findAll: async () => {
      throw error;
    },
    findById: async () => {
      throw error;
    },
  });

  it('returns the full catalog', async () => {
    const result = await useCaseWith([mouse, soldOutHeadset]).execute();

    expect(result).toEqual({ ok: true, value: [mouse, soldOutHeadset] });
  });

  it('returns ok with an empty array when the catalog is empty', async () => {
    const result = await useCaseWith([]).execute();

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('still lists a product whose stock is 0', async () => {
    const result = await useCaseWith([soldOutHeadset]).execute();

    expect(result).toEqual({ ok: true, value: [soldOutHeadset] });
  });

  it('returns err(DataAccessError) when the repository throws one', async () => {
    const cause = new Error('connection refused');
    const result = await useCaseWith([], cause).execute();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(DataAccessError);
    expect(result.error.message).toBe('Product repository is unavailable');
    expect(result.error.cause).toBe(cause);
  });

  it('rethrows an error that is not a DataAccessError', async () => {
    const plainError = new Error('socket hang up');
    const useCase = new GetProductsUseCase(alwaysFailing(plainError));

    await expect(useCase.execute()).rejects.toBe(plainError);
  });
});
