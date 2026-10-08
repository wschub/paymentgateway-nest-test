import { Product } from './product.entity';

describe('Product', () => {
  const props = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Wireless Mouse',
    description: 'Ergonomic wireless mouse',
    priceInCents: 35000,
    stock: 15,
    imageUrl: '/images/products/wireless-mouse.webp',
    createdAt: new Date('2026-10-07T10:00:00.000Z'),
    updatedAt: new Date('2026-10-07T11:00:00.000Z'),
  };

  it('keeps every attribute of the product', () => {
    const product = new Product(props);

    expect(product).toEqual(props);
  });

  it('allows a product that is out of stock', () => {
    const product = new Product({ ...props, stock: 0 });

    expect(product.stock).toBe(0);
  });

  it('rejects negative stock', () => {
    expect(() => new Product({ ...props, stock: -1 })).toThrow(RangeError);
    expect(() => new Product({ ...props, stock: -1 })).toThrow(
      'stock must be a non-negative integer',
    );
  });

  it('rejects a fractional stock', () => {
    expect(() => new Product({ ...props, stock: 1.5 })).toThrow(
      'stock must be a non-negative integer',
    );
  });

  it('rejects a price that is not a positive integer', () => {
    for (const priceInCents of [0, -100, 9.99]) {
      expect(() => new Product({ ...props, priceInCents })).toThrow(RangeError);
      expect(() => new Product({ ...props, priceInCents })).toThrow(
        'priceInCents must be a positive integer',
      );
    }
  });

  it('rejects an empty id', () => {
    expect(() => new Product({ ...props, id: '   ' })).toThrow(
      'id must not be empty',
    );
  });

  it('rejects an empty name', () => {
    expect(() => new Product({ ...props, name: '' })).toThrow(
      'name must not be empty',
    );
  });
});
