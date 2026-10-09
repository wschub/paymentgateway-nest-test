import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataAccessError } from '../src/domain/errors/data-access.error';
import type { ProductRepository } from '../src/domain/ports/product.repository';
import { AppConfigModule } from '../src/infrastructure/config/config.module';
import { configureApp } from '../src/infrastructure/http/configure-app';
import {
  PRODUCTS_REPOSITORY,
  ProductsModule,
} from '../src/infrastructure/modules/products.module';
import { InMemoryProductRepository } from '../src/testing/in-memory-product.repository';

describe('Error handling (e2e)', () => {
  const secret = 'super-secret-wallet-private-key';
  const errorBodyKeys = ['code', 'message', 'path', 'statusCode', 'timestamp'];

  let app: INestApplication<App>;
  let loggerSpy: jest.SpyInstance;

  const startApp = async (repository: ProductRepository) => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, ProductsModule],
    })
      .overrideProvider(PRODUCTS_REPOSITORY)
      .useValue(repository)
      .compile();

    const instance = moduleRef.createNestApplication();
    await configureApp(instance);
    await instance.init();

    return instance;
  };

  afterEach(async () => {
    loggerSpy?.mockRestore();
    await app?.close();
  });

  it('turns a repository DataAccessError into a generic 500 body and logs it without leaking the cause', async () => {
    app = await startApp(new InMemoryProductRepository([], secret));
    loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const response = await request(app.getHttpServer()).get('/products');

    expect(response.status).toBe(500);
    expect(Object.keys(response.body).sort()).toEqual(errorBodyKeys);
    expect(response.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      path: '/products',
      timestamp: expect.any(String),
    });
    expect(response.text).not.toContain(secret);
    expect(response.text).not.toContain('DataAccessError');
    expect(response.text).not.toContain('at ');
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.any(DataAccessError),
      expect.any(String),
    );
  });

  it('also turns an unexpected repository error into the same generic 500 body', async () => {
    const explodingRepository = {
      findAll: async () => {
        throw new Error('connection to internal payments backend rejected');
      },
      findById: async () => null,
    } as unknown as ProductRepository;
    app = await startApp(explodingRepository);
    loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const response = await request(app.getHttpServer()).get('/products');

    expect(response.status).toBe(500);
    expect(Object.keys(response.body).sort()).toEqual(errorBodyKeys);
    expect(response.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      path: '/products',
      timestamp: expect.any(String),
    });
    expect(response.text).not.toContain('connection to internal payments');
    expect(loggerSpy).toHaveBeenCalledWith(expect.any(Error), expect.any(String));
  });
});