import { err, flatMap, map, match, ok, type Result } from './result';

describe('Result', () => {
  describe('ok', () => {
    it('creates a success carrying the value', () => {
      expect(ok(42)).toEqual({ ok: true, value: 42 });
    });

    it('is flagged as success', () => {
      expect(ok('done').ok).toBe(true);
    });
  });

  describe('err', () => {
    it('creates a failure carrying the error', () => {
      expect(err('boom')).toEqual({ ok: false, error: 'boom' });
    });

    it('is flagged as failure', () => {
      expect(err('boom').ok).toBe(false);
    });
  });

  describe('map', () => {
    it('transforms the value of a success', () => {
      expect(map(ok(2), (value) => value * 3)).toEqual({ ok: true, value: 6 });
    });

    it('keeps a failure untouched', () => {
      const failure: Result<number, string> = err('nope');

      expect(map(failure, (value: number) => value * 3)).toBe(failure);
    });

    it('does not run the function on a failure', () => {
      const transform = jest.fn((value: number) => value * 3);

      map(err('nope'), transform);

      expect(transform).not.toHaveBeenCalled();
    });

    it('preserves the error type while changing the value type', () => {
      const result: Result<string, number> = map(ok(21), (value) =>
        String(value * 2),
      );

      expect(result).toEqual({ ok: true, value: '42' });
    });
  });

  describe('flatMap', () => {
    it('chains a success into another result', () => {
      const parse = (raw: string): Result<number, string> => {
        const parsed = Number(raw);
        return Number.isNaN(parsed) ? err('not a number') : ok(parsed);
      };

      expect(flatMap(ok('42'), parse)).toEqual({ ok: true, value: 42 });
    });

    it('propagates the inner failure', () => {
      const parse = (raw: string): Result<number, string> => {
        const parsed = Number(raw);
        return Number.isNaN(parsed) ? err('not a number') : ok(parsed);
      };

      expect(flatMap(ok('abc'), parse)).toEqual({
        ok: false,
        error: 'not a number',
      });
    });

    it('short-circuits on a failure without calling the function', () => {
      const next = jest.fn((value: number): Result<string, string> =>
        ok(String(value)),
      );
      const failure: Result<number, string> = err('stop');

      expect(flatMap(failure, next)).toBe(failure);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('match', () => {
    it('uses the ok handler for a success', () => {
      const success: Result<number, string> = ok(10);
      const result = match(success, {
        ok: (value: number) => `value: ${value}`,
        err: (error: string) => `error: ${error}`,
      });

      expect(result).toBe('value: 10');
    });

    it('uses the err handler for a failure', () => {
      const failure: Result<number, string> = err('kaboom');
      const result = match(failure, {
        ok: (value: number) => `value: ${value}`,
        err: (error: string) => `error: ${error}`,
      });

      expect(result).toBe('error: kaboom');
    });

    it('collapses both branches into the same return type', () => {
      const toStatus = (result: Result<number, string>): number =>
        match(result, {
          ok: () => 200,
          err: () => 500,
        });

      expect(toStatus(ok(1))).toBe(200);
      expect(toStatus(err('x'))).toBe(500);
    });
  });
});
