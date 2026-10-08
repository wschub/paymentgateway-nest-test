import { Product } from '../entities/product.entity';
import { ProductRepository } from './product.repository';

describe('ProductRepository port', () => {
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

  const keyboard = new Product({
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Mechanical Keyboard',
    description: 'RGB mechanical keyboard',
    priceInCents: 180000,
    stock: 8,
    imageUrl: '/images/products/mechanical-keyboard.webp',
    createdAt: new Date('2026-10-07T10:00:00.000Z'),
    updatedAt: new Date('2026-10-07T11:00:00.000Z'),
  });

  const inMemoryRepository = (products: Product[]): ProductRepository => ({
    findAll: async () => [...products],
    findById: async (id) => products.find((product) => product.id === id) ?? null,
  });

  it('returns every product through findAll', async () => {
    const repository = inMemoryRepository([mouse, keyboard]);

    await expect(repository.findAll()).resolves.toEqual([mouse, keyboard]);
  });

  it('returns an empty list when the catalog is empty', async () => {
    const repository = inMemoryRepository([]);

    await expect(repository.findAll()).resolves.toEqual([]);
  });

  it('finds a product by id', async () => {
    const repository = inMemoryRepository([mouse, keyboard]);

    await expect(repository.findById(mouse.id)).resolves.toBe(mouse);
  });

  it('returns null for an unknown id', async () => {
    const repository = inMemoryRepository([mouse]);

    await expect(
      repository.findById('99999999-9999-4999-8999-999999999999'),
    ).resolves.toBeNull();
  });
});
