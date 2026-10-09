import type { Result } from '../../application/result/result';

export const unwrapResult = <T, E>(result: Result<T, E>): T => {
  if (result.ok) {
    return result.value;
  }

  throw result.error;
};