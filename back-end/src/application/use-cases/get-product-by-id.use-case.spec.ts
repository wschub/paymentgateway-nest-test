import { Product } from '../../domain/entities/product.entity';
import { DataAccessError } from '../../domain/errors/data-access.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import type { ProductRepository } from '../../domain/ports/product.repository';
import { InMemoryProductRepository } from '../../testing/in-memory-product.repository';
import { GetProductByIdUseCase } from './get-product-by-id.use-case';

describe('GetProductByIdUseCase', () => {
  const keyboard = new Product({
    id: 'aaaa0000-0000-4000-8000-000000000001',
    name: 'Mechanical Keyboard',
    description: 'RGB mechanical keyboard',
    priceInCents: 180000,
    stock: 8,
    imageUrl: '/images/products/mechanical-keyboard.webp',
    createdAt: new Date('2026-10-07T10:00:00.000Z'),
    updatedAt: new Date('2026-10-07T11:00:00.000Z'),
  });

  const missingId = '00000000-0000-4000-8000-000000000000';

  const useCaseWith = (products: Product[], failureCause?: Error) =>
    new GetProductByIdUseCase(
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

  it('returns ok with the product when it is found', async () => {
    const result = await useCaseWith([keyboard]).execute(keyboard.id);

    expect(result).toEqual({ ok: true, value: keyboard });
  });

  it('returns err(ProductNotFoundError) for an unknown id', async () => {
    const result = await useCaseWith([keyboard]).execute(missingId);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    const error = result.error as ProductNotFoundError;
    expect(error).toBeInstanceOf(ProductNotFoundError);
    expect(error.productId).toBe(missingId);
    expect(error.message).toBe(`Product with id "${missingId}" was not found`);
  });

  it('returns err(DataAccessError) preserving the cause when the repository fails', async () => {
    const cause = new Error('connection refused');
    const result = await useCaseWith([keyboard], cause).execute(keyboard.id);

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
    const useCase = new GetProductByIdUseCase(alwaysFailing(plainError));

    await expect(useCase.execute(keyboard.id)).rejects.toBe(plainError);
  });
});