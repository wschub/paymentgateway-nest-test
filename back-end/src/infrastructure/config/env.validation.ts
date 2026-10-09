export type NodeEnv = 'development' | 'test' | 'production';

export interface AppEnv {
  DATABASE_URL: string;
  PORT: number;
  NODE_ENV: NodeEnv;
  CORS_ORIGINS: string;
  RATE_LIMIT_TTL: number;
  RATE_LIMIT_MAX: number;
  pub_stagtest: string;
  prv_stagtest: string;
  stagtest_events: string;
  stagtest_integrity: string;
  UAT_SANDBOX_URL: string;
  BASE_FEE_IN_CENTS: number;
  DELIVERY_FEE_IN_CENTS: number;
  PAYMENT_TIMEOUT_MS: number;
  RESERVATION_TTL_SECONDS: number;
  PAYMENT_CLAIM_LEASE_SECONDS: number;
}

export type ValidatedEnv = AppEnv & Record<string, unknown>;

const NODE_ENVS = ['development', 'test', 'production'] as const;

const OPTION_DEFAULTS = {
  BASE_FEE_IN_CENTS: 300000,
  DELIVERY_FEE_IN_CENTS: 900000,
  PAYMENT_TIMEOUT_MS: 10000,
  RESERVATION_TTL_SECONDS: 900,
  PAYMENT_CLAIM_LEASE_SECONDS: 120,
} as const;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

const isHttpOrigin = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value
    );
  } catch {
    return false;
  }
};

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const readString = (
  env: Record<string, unknown>,
  key: string,
  problems: string[],
): string => {
  const value = env[key];
  if (!isNonEmptyString(value)) {
    problems.push(`${key} is required and must not be empty`);
    return '';
  }
  return value.trim();
};

const readInteger = (
  env: Record<string, unknown>,
  key: string,
  problems: string[],
  isValid: (value: number) => boolean,
  expectation: string,
): number => {
  const raw = readString(env, key, problems);
  if (raw === '') {
    return Number.NaN;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || !isValid(value)) {
    problems.push(`${key} must be ${expectation} (received "${raw}")`);
    return Number.NaN;
  }
  return value;
};

const readOptionalInteger = (
  env: Record<string, unknown>,
  key: string,
  defaultValue: number,
  problems: string[],
  isValid: (value: number) => boolean,
  expectation: string,
): number => {
  const raw = env[key];
  if (raw === undefined || raw === null) {
    return defaultValue;
  }
  const rawString =
    typeof raw === 'string'
      ? raw.trim()
      : typeof raw === 'number'
        ? String(raw)
        : 'UNSUPPORTED_TYPE';
  if (rawString === '') {
    return defaultValue;
  }
  const value = Number(rawString);
  if (!Number.isInteger(value) || !isValid(value)) {
    problems.push(`${key} must be ${expectation} (received "${rawString}")`);
    return defaultValue;
  }
  return value;
};

const readEnum = <T extends string>(
  env: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  problems: string[],
): T => {
  const raw = readString(env, key, problems);
  if (raw === '') {
    return allowed[0];
  }
  if (!(allowed as readonly string[]).includes(raw)) {
    problems.push(
      `${key} must be one of ${allowed.join(', ')} (received "${raw}")`,
    );
    return allowed[0];
  }
  return raw as T;
};

const readDatabaseUrl = (
  env: Record<string, unknown>,
  problems: string[],
): string => {
  const value = readString(env, 'DATABASE_URL', problems);
  if (value !== '' && !/^postgres(ql)?:\/\/\S+$/.test(value)) {
    problems.push('DATABASE_URL must be a postgresql:// connection string');
  }
  return value;
};

const readCorsOrigins = (
  env: Record<string, unknown>,
  problems: string[],
): string => {
  const value = readString(env, 'CORS_ORIGINS', problems);
  if (value === '') {
    return value;
  }
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  if (origins.length === 0) {
    problems.push('CORS_ORIGINS must contain at least one origin');
    return value;
  }
  for (const origin of origins) {
    if (!isHttpOrigin(origin)) {
      problems.push(
        `CORS_ORIGINS contains an invalid origin "${origin}" (expected e.g. http://localhost:5173)`,
      );
    }
  }
  return value;
};

const readHttpUrl = (
  env: Record<string, unknown>,
  key: string,
  problems: string[],
): string => {
  const value = readString(env, key, problems);
  if (value !== '' && !isHttpUrl(value)) {
    problems.push(`${key} must be an http(s) URL`);
  }
  return value;
};

export const validateEnv = (env: Record<string, unknown>): ValidatedEnv => {
  const problems: string[] = [];

  const databaseUrl = readDatabaseUrl(env, problems);
  const port = readInteger(
    env,
    'PORT',
    problems,
    (value) => value >= 1 && value <= 65535,
    'an integer between 1 and 65535',
  );
  const nodeEnv = readEnum(env, 'NODE_ENV', NODE_ENVS, problems);
  const corsOrigins = readCorsOrigins(env, problems);
  const rateLimitTtl = readInteger(
    env,
    'RATE_LIMIT_TTL',
    problems,
    (value) => value >= 1,
    'a positive integer',
  );
  const rateLimitMax = readInteger(
    env,
    'RATE_LIMIT_MAX',
    problems,
    (value) => value >= 1,
    'a positive integer',
  );

  const pubStagtest = readString(env, 'pub_stagtest', problems);
  const prvStagtest = readString(env, 'prv_stagtest', problems);
  const stagtestEvents = readString(env, 'stagtest_events', problems);
  const stagtestIntegrity = readString(env, 'stagtest_integrity', problems);
  const uatSandboxUrl = readHttpUrl(env, 'UAT_SANDBOX_URL', problems);

  const baseFeeInCents = readOptionalInteger(
    env,
    'BASE_FEE_IN_CENTS',
    OPTION_DEFAULTS.BASE_FEE_IN_CENTS,
    problems,
    (value) => value >= 0,
    'a non-negative integer',
  );
  const deliveryFeeInCents = readOptionalInteger(
    env,
    'DELIVERY_FEE_IN_CENTS',
    OPTION_DEFAULTS.DELIVERY_FEE_IN_CENTS,
    problems,
    (value) => value >= 0,
    'a non-negative integer',
  );
  const paymentTimeoutMs = readOptionalInteger(
    env,
    'PAYMENT_TIMEOUT_MS',
    OPTION_DEFAULTS.PAYMENT_TIMEOUT_MS,
    problems,
    (value) => value >= 1,
    'a positive integer',
  );
  const reservationTtlSeconds = readOptionalInteger(
    env,
    'RESERVATION_TTL_SECONDS',
    OPTION_DEFAULTS.RESERVATION_TTL_SECONDS,
    problems,
    (value) => value >= 1,
    'a positive integer',
  );
  const paymentClaimLeaseSeconds = readOptionalInteger(
    env,
    'PAYMENT_CLAIM_LEASE_SECONDS',
    OPTION_DEFAULTS.PAYMENT_CLAIM_LEASE_SECONDS,
    problems,
    (value) => value >= 1,
    'a positive integer',
  );

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${problems
        .map((problem) => `  - ${problem}`)
        .join('\n')}`,
    );
  }

  return {
    ...env,
    DATABASE_URL: databaseUrl,
    PORT: port,
    NODE_ENV: nodeEnv,
    CORS_ORIGINS: corsOrigins,
    RATE_LIMIT_TTL: rateLimitTtl,
    RATE_LIMIT_MAX: rateLimitMax,
    pub_stagtest: pubStagtest,
    prv_stagtest: prvStagtest,
    stagtest_events: stagtestEvents,
    stagtest_integrity: stagtestIntegrity,
    UAT_SANDBOX_URL: uatSandboxUrl,
    BASE_FEE_IN_CENTS: baseFeeInCents,
    DELIVERY_FEE_IN_CENTS: deliveryFeeInCents,
    PAYMENT_TIMEOUT_MS: paymentTimeoutMs,
    RESERVATION_TTL_SECONDS: reservationTtlSeconds,
    PAYMENT_CLAIM_LEASE_SECONDS: paymentClaimLeaseSeconds,
  };
};