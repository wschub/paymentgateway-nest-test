import { DataAccessError } from './data-access.error';

describe('DataAccessError', () => {
  const cause = new Error('connect ECONNREFUSED 127.0.0.1:5432');

  it('is an Error with a stable name and message', () => {
    const error = new DataAccessError('Failed to list products');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DataAccessError');
    expect(error.message).toBe('Failed to list products');
  });

  it('keeps the original failure as its cause for logging', () => {
    const error = new DataAccessError('Failed to list products', { cause });

    expect(error.cause).toBe(cause);
  });

  it('works without a cause', () => {
    expect(new DataAccessError('Failed to list products').cause).toBeUndefined();
  });
});
