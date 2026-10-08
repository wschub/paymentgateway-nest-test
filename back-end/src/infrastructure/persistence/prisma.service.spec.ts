import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const connectionString =
    'postgresql://user:password@localhost:5432/paymentgateway';

  let configService: { getOrThrow: jest.Mock };
  let service: PrismaService;
  let connectSpy: jest.SpyInstance<Promise<void>, []>;
  let disconnectSpy: jest.SpyInstance<Promise<void>, []>;

  beforeEach(() => {
    configService = {
      getOrThrow: jest.fn().mockReturnValue(connectionString),
    };
    service = new PrismaService(configService as unknown as ConfigService);
    connectSpy = jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    disconnectSpy = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);
  });

  it('reads DATABASE_URL through the validated config', () => {
    expect(configService.getOrThrow).toHaveBeenCalledTimes(1);
    expect(configService.getOrThrow).toHaveBeenCalledWith('DATABASE_URL');
  });

  it('exposes the PrismaClient API', () => {
    expect(typeof service.$connect).toBe('function');
    expect(typeof service.$disconnect).toBe('function');
    expect(typeof service.$transaction).toBe('function');
  });

  it('connects on module init', async () => {
    await service.onModuleInit();

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('disconnects on module destroy', async () => {
    await service.onModuleDestroy();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('fails fast when DATABASE_URL is not configured', () => {
    const brokenConfig = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        throw new Error(`Missing required configuration value: ${key}`);
      }),
    };

    expect(
      () => new PrismaService(brokenConfig as unknown as ConfigService),
    ).toThrow('Missing required configuration value: DATABASE_URL');
  });
});
