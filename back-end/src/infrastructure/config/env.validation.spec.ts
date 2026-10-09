import { validateEnv } from './env.validation';

const validEnv = (): Record<string, unknown> => ({
  DATABASE_URL: 'postgresql://user:password@localhost:5432/paymentgateway',
  PORT: '3000',
  NODE_ENV: 'test',
  CORS_ORIGINS: 'http://localhost:5173,https://app.example.com',
  RATE_LIMIT_TTL: '60',
  RATE_LIMIT_MAX: '10',
  pub_stagtest: 'pub_stagtest_test',
  prv_stagtest: 'prv_stagtest_test',
  stagtest_events: 'stagtest_events_test',
  stagtest_integrity: 'stagtest_integrity_test',
  UAT_SANDBOX_URL: 'https://api-sandbox.example.com/v1',
  UNRELATED: 'kept',
});

const REQUIRED_KEYS = [
  'DATABASE_URL',
  'PORT',
  'NODE_ENV',
  'CORS_ORIGINS',
  'RATE_LIMIT_TTL',
  'RATE_LIMIT_MAX',
  'pub_stagtest',
  'prv_stagtest',
  'stagtest_events',
  'stagtest_integrity',
  'UAT_SANDBOX_URL',
];

describe('validateEnv', () => {
  it('accepts a complete environment and coerces numeric values', () => {
    const result = validateEnv(validEnv());

    expect(result.PORT).toBe(3000);
    expect(result.RATE_LIMIT_TTL).toBe(60);
    expect(result.RATE_LIMIT_MAX).toBe(10);
    expect(result.NODE_ENV).toBe('test');
    expect(result.DATABASE_URL).toBe(
      'postgresql://user:password@localhost:5432/paymentgateway',
    );
    expect(result.CORS_ORIGINS).toBe(
      'http://localhost:5173,https://app.example.com',
    );
    expect(result.pub_stagtest).toBe('pub_stagtest_test');
    expect(result.prv_stagtest).toBe('prv_stagtest_test');
    expect(result.stagtest_events).toBe('stagtest_events_test');
    expect(result.stagtest_integrity).toBe('stagtest_integrity_test');
    expect(result.UAT_SANDBOX_URL).toBe('https://api-sandbox.example.com/v1');
  });

  it('keeps unrelated environment variables', () => {
    const result = validateEnv(validEnv());

    expect(result.UNRELATED).toBe('kept');
  });

  it.each(REQUIRED_KEYS)('fails fast when %s is missing', (key) => {
    const env = validEnv();
    delete env[key];

    expect(() => validateEnv(env)).toThrow(key);
    expect(() => validateEnv(env)).toThrow(/required and must not be empty/);
  });

  it.each(REQUIRED_KEYS)('fails fast when %s is empty', (key) => {
    const env = { ...validEnv(), [key]: '   ' };

    expect(() => validateEnv(env)).toThrow(key);
  });

  it.each(['abc', '0', '70000', '-1', '12.5'])(
    'rejects PORT value %s',
    (port) => {
      expect(() => validateEnv({ ...validEnv(), PORT: port })).toThrow(
        /PORT must be an integer between 1 and 65535/,
      );
    },
  );

  it.each(['staging', 'prod', 'PRODUCTION'])(
    'rejects NODE_ENV value %s',
    (nodeEnv) => {
      expect(() =>
        validateEnv({ ...validEnv(), NODE_ENV: nodeEnv }),
      ).toThrow(/NODE_ENV must be one of development, test, production/);
    },
  );

  it.each(['0', '-5', 'fast'])(
    'rejects RATE_LIMIT_TTL value %s',
    (ttl) => {
      expect(() => validateEnv({ ...validEnv(), RATE_LIMIT_TTL: ttl })).toThrow(
        /RATE_LIMIT_TTL must be a positive integer/,
      );
    },
  );

  it.each(['0', '-1', 'many'])(
    'rejects RATE_LIMIT_MAX value %s',
    (max) => {
      expect(() => validateEnv({ ...validEnv(), RATE_LIMIT_MAX: max })).toThrow(
        /RATE_LIMIT_MAX must be a positive integer/,
      );
    },
  );

  it.each([
    'localhost:5432/paymentgateway',
    'mysql://user:pass@localhost:3306/db',
    'postgresql://',
  ])('rejects DATABASE_URL value %s', (databaseUrl) => {
    expect(() => validateEnv({ ...validEnv(), DATABASE_URL: databaseUrl })).toThrow(
      /DATABASE_URL must be a postgresql:\/\/ connection string/,
    );
  });

  it.each([
    'ftp://files.example.com/v1',
    'not-a-url',
    'localhost:5432',
    'https://',
  ])('rejects UAT_SANDBOX_URL value %s', (url) => {
    expect(() => validateEnv({ ...validEnv(), UAT_SANDBOX_URL: url })).toThrow(
      /UAT_SANDBOX_URL must be an http\(s\) URL/,
    );
  });

  it.each([
    'not-an-origin',
    '*',
    'ftp://files.example.com',
    'http://localhost:5173/with-path',
    'localhost:5173',
  ])('rejects CORS_ORIGINS containing %s', (origin) => {
    expect(() => validateEnv({ ...validEnv(), CORS_ORIGINS: origin })).toThrow(
      /CORS_ORIGINS contains an invalid origin/,
    );
  });

  it('rejects an empty CORS_ORIGINS list', () => {
    expect(() => validateEnv({ ...validEnv(), CORS_ORIGINS: ' , ' })).toThrow(
      /CORS_ORIGINS must contain at least one origin/,
    );
  });

  it('applies the default fee and timer values when they are absent', () => {
    const result = validateEnv(validEnv());

    expect(result.BASE_FEE_IN_CENTS).toBe(300000);
    expect(result.DELIVERY_FEE_IN_CENTS).toBe(900000);
    expect(result.PAYMENT_TIMEOUT_MS).toBe(10000);
    expect(result.RESERVATION_TTL_SECONDS).toBe(900);
    expect(result.PAYMENT_CLAIM_LEASE_SECONDS).toBe(120);
  });

  it('coerces explicit fee and timer overrides', () => {
    const result = validateEnv({
      ...validEnv(),
      BASE_FEE_IN_CENTS: '150000',
      DELIVERY_FEE_IN_CENTS: '0',
      PAYMENT_TIMEOUT_MS: '5000',
      RESERVATION_TTL_SECONDS: '600',
      PAYMENT_CLAIM_LEASE_SECONDS: '60',
    });

    expect(result.BASE_FEE_IN_CENTS).toBe(150000);
    expect(result.DELIVERY_FEE_IN_CENTS).toBe(0);
    expect(result.PAYMENT_TIMEOUT_MS).toBe(5000);
    expect(result.RESERVATION_TTL_SECONDS).toBe(600);
    expect(result.PAYMENT_CLAIM_LEASE_SECONDS).toBe(60);
  });

  it.each(['-1', '-5', '12.5', 'fast'])(
    'rejects BASE_FEE_IN_CENTS value %s',
    (fee) => {
      expect(() =>
        validateEnv({ ...validEnv(), BASE_FEE_IN_CENTS: fee }),
      ).toThrow(/BASE_FEE_IN_CENTS must be a non-negative integer/);
    },
  );

  it.each(['-1', '-25', '12.5', 'abc'])(
    'rejects DELIVERY_FEE_IN_CENTS value %s',
    (fee) => {
      expect(() =>
        validateEnv({ ...validEnv(), DELIVERY_FEE_IN_CENTS: fee }),
      ).toThrow(/DELIVERY_FEE_IN_CENTS must be a non-negative integer/);
    },
  );

  it.each(['0', '-1', '10.5', 'fast'])(
    'rejects PAYMENT_TIMEOUT_MS value %s',
    (timeout) => {
      expect(() =>
        validateEnv({ ...validEnv(), PAYMENT_TIMEOUT_MS: timeout }),
      ).toThrow(/PAYMENT_TIMEOUT_MS must be a positive integer/);
    },
  );

  it.each(['0', '-1', '1.5', 'fast'])(
    'rejects RESERVATION_TTL_SECONDS value %s',
    (ttl) => {
      expect(() =>
        validateEnv({ ...validEnv(), RESERVATION_TTL_SECONDS: ttl }),
      ).toThrow(/RESERVATION_TTL_SECONDS must be a positive integer/);
    },
  );

  it.each(['0', '-1', '2.5', 'fast'])(
    'rejects PAYMENT_CLAIM_LEASE_SECONDS value %s',
    (lease) => {
      expect(() =>
        validateEnv({ ...validEnv(), PAYMENT_CLAIM_LEASE_SECONDS: lease }),
      ).toThrow(/PAYMENT_CLAIM_LEASE_SECONDS must be a positive integer/);
    },
  );

  it('reports every problem in a single error', () => {
    const env: Record<string, unknown> = {
      ...validEnv(),
      PORT: 'abc',
      NODE_ENV: 'nope',
    };
    delete env.DATABASE_URL;

    expect(() => validateEnv(env)).toThrow(/Invalid environment configuration:/);
    try {
      validateEnv(env);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL is required');
      expect(message).toContain('PORT must be an integer');
      expect(message).toContain('NODE_ENV must be one of');
      expect(message.trim().split('\n')).toHaveLength(4);
    }
  });

  it('throws an Error instance', () => {
    expect(() => validateEnv({})).toThrow(Error);
  });
});