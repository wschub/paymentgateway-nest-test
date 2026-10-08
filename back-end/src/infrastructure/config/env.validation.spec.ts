import { validateEnv } from './env.validation';

const validEnv = (): Record<string, unknown> => ({
  DATABASE_URL: 'postgresql://user:password@localhost:5432/paymentgateway',
  PORT: '3000',
  NODE_ENV: 'test',
  CORS_ORIGINS: 'http://localhost:5173,https://app.example.com',
  RATE_LIMIT_TTL: '60',
  RATE_LIMIT_MAX: '10',
  UNRELATED: 'kept',
});

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
  });

  it('keeps unrelated environment variables', () => {
    const result = validateEnv(validEnv());

    expect(result.UNRELATED).toBe('kept');
  });

  it.each([
    'DATABASE_URL',
    'PORT',
    'NODE_ENV',
    'CORS_ORIGINS',
    'RATE_LIMIT_TTL',
    'RATE_LIMIT_MAX',
  ])('fails fast when %s is missing', (key) => {
    const env = validEnv();
    delete env[key];

    expect(() => validateEnv(env)).toThrow(key);
    expect(() => validateEnv(env)).toThrow(/required and must not be empty/);
  });

  it.each(['DATABASE_URL', 'PORT', 'NODE_ENV', 'CORS_ORIGINS', 'RATE_LIMIT_TTL', 'RATE_LIMIT_MAX'])(
    'fails fast when %s is empty',
    (key) => {
      const env = { ...validEnv(), [key]: '   ' };

      expect(() => validateEnv(env)).toThrow(key);
    },
  );

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
