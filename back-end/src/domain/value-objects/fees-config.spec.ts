import { FeesConfig } from './fees-config';

describe('FeesConfig', () => {
  const props = {
    baseFeeInCents: 3000,
    deliveryFeeInCents: 1500,
    currency: 'COP',
  };

  it('keeps every attribute of the fees config', () => {
    const config = new FeesConfig(props);

    expect(config.baseFeeInCents).toBe(3000);
    expect(config.deliveryFeeInCents).toBe(1500);
    expect(config.currency).toBe('COP');
  });

  it('allows zero fees', () => {
    const config = new FeesConfig({ ...props, baseFeeInCents: 0, deliveryFeeInCents: 0 });

    expect(config.baseFeeInCents).toBe(0);
    expect(config.deliveryFeeInCents).toBe(0);
  });

  it('rejects negative fees', () => {
    expect(() => new FeesConfig({ ...props, baseFeeInCents: -1 })).toThrow(
      'baseFeeInCents must be a non-negative integer',
    );
    expect(() => new FeesConfig({ ...props, deliveryFeeInCents: -500 })).toThrow(
      'deliveryFeeInCents must be a non-negative integer',
    );
  });

  it('rejects fractional fees', () => {
    for (const baseFeeInCents of [9.99, 1.5]) {
      expect(() => new FeesConfig({ ...props, baseFeeInCents })).toThrow(
        'baseFeeInCents must be a non-negative integer',
      );
    }
  });

  it('rejects an empty currency', () => {
    expect(() => new FeesConfig({ ...props, currency: ' ' })).toThrow(
      'currency must be a non-empty string',
    );
  });
});