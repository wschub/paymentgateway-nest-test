import { InsufficientStockError } from './insufficient-stock.error';

describe('InsufficientStockError', () => {
  const productId = '11111111-1111-4111-8111-111111111111';

  it('is an Error with a stable name', () => {
    const error = new InsufficientStockError(productId, 3, 1);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InsufficientStockError');
  });

  it('keeps the requested context', () => {
    const error = new InsufficientStockError(productId, 3, 1);

    expect(error.productId).toBe(productId);
    expect(error.requestedQuantity).toBe(3);
    expect(error.availableStock).toBe(1);
  });

  it('mentions the product and quantities in the message', () => {
    const message = new InsufficientStockError(productId, 3, 1).message;

    expect(message).toContain(productId);
    expect(message).toContain('3');
    expect(message).toContain('1');
  });
});