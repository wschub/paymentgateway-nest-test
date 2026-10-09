import { SystemClock } from './system-clock';

describe('SystemClock', () => {
  it('returns the current instant', () => {
    const before = Date.now();
    const clock = new SystemClock();

    const now = clock.now().getTime();

    expect(clock.now()).toBeInstanceOf(Date);
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});