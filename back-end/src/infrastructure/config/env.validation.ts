export type NodeEnv = 'development' | 'test' | 'production';

export interface AppEnv {
  DATABASE_URL: string;
  PORT: number;
  NODE_ENV: NodeEnv;
  CORS_ORIGINS: string;
  RATE_LIMIT_TTL: number;
  RATE_LIMIT_MAX: number;
}

export type ValidatedEnv = AppEnv & Record<string, unknown>;

const NODE_ENVS = ['development', 'test', 'production'] as const;

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
  };
};
