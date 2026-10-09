import type { Clock } from './clock.port';

describe('Clock port', () => {
  it('exposes the current instant through now()', () => {
    const now = new Date('2026-10-09T10:00:00.000Z');
    const clock: Clock = { now: () => now };

    expect(clock.now()).toBe(now);
  });
});