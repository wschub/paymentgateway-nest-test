import type { Clock } from '../../domain/ports/clock.port';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}