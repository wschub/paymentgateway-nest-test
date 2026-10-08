import { ProductNotFoundError } from './product-not-found.error';

describe('ProductNotFoundError', () => {
  const id = '00000000-0000-4000-8000-000000000000';

  it('is an Error with a stable name', () => {
    const error = new ProductNotFoundError(id);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ProductNotFoundError');
  });

  it('keeps the id that was requested', () => {
    expect(new ProductNotFoundError(id).productId).toBe(id);
  });

  it('mentions the id in the message', () => {
    expect(new ProductNotFoundError(id).message).toContain(id);
  });
});
