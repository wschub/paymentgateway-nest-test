import { ok, err } from '../../application/result/result';
import { unwrapResult } from './result-unwrapper';

describe('unwrapResult', () => {
  it('returns the value of an ok result', () => {
    expect(unwrapResult(ok(42))).toBe(42);
  });

  it('throws the error of an err result', () => {
    const error = new Error('boom');

    expect(() => unwrapResult(err(error))).toThrow(error);
  });
});