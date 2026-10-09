import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { configureSwagger } from './configure-swagger';
import { configureApp } from './configure-app';

jest.mock('./configure-swagger');

describe('configureApp', () => {
  const env: Record<string, unknown> = {
    CORS_ORIGINS: 'http://localhost:5173, http://localhost:3001',
    RATE_LIMIT_TTL: 60,
    RATE_LIMIT_MAX: 10,
  };

  let config: ConfigService;
  let app: INestApplication;
  let getOrThrow: jest.Mock;
  let appGet: jest.Mock;
  let use: jest.Mock;
  let enableCors: jest.Mock;
  let useGlobalPipes: jest.Mock;
  let useGlobalFilters: jest.Mock;
  let useGlobalGuards: jest.Mock;

  beforeEach(() => {
    getOrThrow = jest.fn((key: string) => env[key]);
    config = { getOrThrow } as unknown as ConfigService;
    appGet = jest.fn().mockReturnValue(config);
    use = jest.fn();
    enableCors = jest.fn();
    useGlobalPipes = jest.fn();
    useGlobalFilters = jest.fn();
    useGlobalGuards = jest.fn();
    app = {
      use,
      enableCors,
      useGlobalPipes,
      useGlobalFilters,
      useGlobalGuards,
      get: appGet,
    } as unknown as INestApplication;
  });

  it('reads the configuration from the validated config', async () => {
    await configureApp(app);

    expect(appGet).toHaveBeenCalledWith(ConfigService);
    expect(getOrThrow).toHaveBeenCalledWith('CORS_ORIGINS');
    expect(getOrThrow).toHaveBeenCalledWith('RATE_LIMIT_TTL');
    expect(getOrThrow).toHaveBeenCalledWith('RATE_LIMIT_MAX');
  });

  it('registers Helmet as middleware', async () => {
    await configureApp(app);

    expect(use).toHaveBeenCalledTimes(1);
    expect(typeof use.mock.calls[0][0]).toBe('function');
  });

  it('restricts CORS to the configured origins', async () => {
    await configureApp(app);

    expect(enableCors).toHaveBeenCalledWith({
      origin: ['http://localhost:5173', 'http://localhost:3001'],
    });
  });

  it('registers the validation pipe with whitelist, forbid and transform', async () => {
    await configureApp(app);

    const pipe = useGlobalPipes.mock.calls[0][0] as unknown as {
      validatorOptions: { whitelist: boolean; forbidNonWhitelisted: boolean };
      isTransformEnabled: boolean;
    };
    expect(useGlobalPipes).toHaveBeenCalledTimes(1);
    expect(pipe.validatorOptions.whitelist).toBe(true);
    expect(pipe.validatorOptions.forbidNonWhitelisted).toBe(true);
    expect(pipe.isTransformEnabled).toBe(true);
  });

  it('registers the shared exception filter', async () => {
    await configureApp(app);

    expect(useGlobalFilters).toHaveBeenCalledTimes(1);
    expect(useGlobalFilters.mock.calls[0][0]).toBeInstanceOf(AllExceptionsFilter);
  });

  it('registers one global throttler guard with the ttl in milliseconds', async () => {
    await configureApp(app);

    const guard = useGlobalGuards.mock.calls[0][0] as unknown as {
      options: Array<{ ttl: number; limit: number }>;
      headerPrefix: string;
    };
    expect(useGlobalGuards).toHaveBeenCalledTimes(1);
    expect(guard.options).toEqual([{ ttl: 60_000, limit: 10 }]);
    expect(guard.headerPrefix).toBe('X-RateLimit');
  });

  it('configures Swagger with the application instance', async () => {
    (configureSwagger as jest.Mock).mockClear();

    await configureApp(app);

    expect(configureSwagger).toHaveBeenCalledTimes(1);
    expect(configureSwagger).toHaveBeenCalledWith(app);
  });
});
