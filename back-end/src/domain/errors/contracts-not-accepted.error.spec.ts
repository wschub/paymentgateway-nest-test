import { ContractsNotAcceptedError } from './contracts-not-accepted.error';

describe('ContractsNotAcceptedError', () => {
  it('is an Error with a stable name', () => {
    const error = new ContractsNotAcceptedError();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ContractsNotAcceptedError');
  });

  it('mentions the contracts in the message', () => {
    expect(new ContractsNotAcceptedError().message).toContain('contract');
  });
});