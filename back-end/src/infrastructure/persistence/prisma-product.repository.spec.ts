import { Product } from '../../domain/entities/product.entity';
import { DataAccessError } from '../../domain/errors/data-access.error';
import type { PrismaService } from './prisma.service';
import { PrismaProductRepository } from './prisma-product.repository';

describe('PrismaProductRepository', () => {
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Wireless Mouse',
    description: 'Ergonomic wireless mouse',
    priceInCents: 35000,
    stock: 15,
    imageUrl: '/images/products/wireless-mouse.webp',
    createdAt: new Date('2026-10-07T10:00:00.000Z'),
    updatedAt: new Date('2026-10-07T11:00:00.000Z'),
  };

  const mappedProduct = new Product({ ...row });

  let findMany: jest.Mock;
  let findUnique: jest.Mock;
  let repository: PrismaProductRepository;

  const failingWith = async (promise: Promise<unknown>): Promise<DataAccessError> => {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(DataAccessError);
      return error as DataAccessError;
    }

    throw new Error('expected the repository to reject');
  };

  beforeEach(() => {
    findMany = jest.fn();
    findUnique = jest.fn();
    const prisma = {
      product: { findMany, findUnique },
    } as unknown as PrismaService;
    repository = new PrismaProductRepository(prisma);
  });

  it('returns the catalog mapped to domain Products ordered by name', async () => {
    findMany.mockResolvedValue([row]);

    const products = await repository.findAll();

    expect(findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    expect(products).toEqual([mappedProduct]);
    expect(products[0]).toBeInstanceOf(Product);
  });

  it('returns an empty array when the catalog is empty', async () => {
    findMany.mockResolvedValue([]);

    await expect(repository.findAll()).resolves.toEqual([]);
  });

  it('returns the product found by id', async () => {
    findUnique.mockResolvedValue(row);

    const product = await repository.findById(row.id);

    expect(findUnique).toHaveBeenCalledWith({ where: { id: row.id } });
    expect(product).toEqual(mappedProduct);
    expect(product).toBeInstanceOf(Product);
  });

  it('returns null when the product does not exist', async () => {
    findUnique.mockResolvedValue(null);

    await expect(repository.findById(row.id)).resolves.toBeNull();
  });

  it('wraps a Prisma failure from findAll in a DataAccessError keeping the cause', async () => {
    const cause = new Error('connection refused');
    findMany.mockRejectedValue(cause);

    const error = await failingWith(repository.findAll());

    expect(error.cause).toBe(cause);
  });

  it('wraps a Prisma failure from findById in a DataAccessError keeping the cause', async () => {
    const cause = new Error('connection refused');
    findUnique.mockRejectedValue(cause);

    const error = await failingWith(repository.findById(row.id));

    expect(error.cause).toBe(cause);
  });

  it('never copies the raw Prisma message into the DataAccessError', async () => {
    const raw = new Error(
      'ECONNREFUSED postgresql://user:hunter2@localhost:5432/paymentgateway',
    );
    findMany.mockRejectedValue(raw);
    findUnique.mockRejectedValue(raw);

    const errors = [
      await failingWith(repository.findAll()),
      await failingWith(repository.findById(row.id)),
    ];

    for (const error of errors) {
      expect(error.cause).toBe(raw);
      expect(error.message).not.toContain('ECONNREFUSED');
      expect(error.message).not.toContain('hunter2');
    }
  });
});