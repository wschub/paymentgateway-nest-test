import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { configureSwagger } from './configure-swagger';

jest.mock('@nestjs/swagger', () => ({
  ...jest.requireActual('@nestjs/swagger'),
  SwaggerModule: {
    createDocument: jest.fn(() => ({ paths: {} })),
    setup: jest.fn(),
  },
}));

describe('configureSwagger', () => {
  it('creates the document with API metadata and mounts it under docs', () => {
    const use = jest.fn();
    const app = { use } as unknown as INestApplication;

    configureSwagger(app);

    expect(SwaggerModule.createDocument).toHaveBeenCalledTimes(1);
    expect(SwaggerModule.createDocument).toHaveBeenCalledWith(
      app,
      expect.objectContaining({
        info: expect.objectContaining({
          title: 'Payment Gateway API',
          version: '1.0',
        }),
        tags: expect.arrayContaining([
          expect.objectContaining({ name: 'products' }),
        ]),
      }),
    );
    const mockSetup = SwaggerModule.setup as jest.Mock;
    expect(mockSetup).toHaveBeenCalledTimes(1);
    expect(mockSetup).toHaveBeenCalledWith('docs', app, {
      paths: {},
    });
  });

  it('adds a middleware that relaxes the CSP only for the docs routes', () => {
    const use = jest.fn();
    const app = { use } as unknown as INestApplication;

    configureSwagger(app);

    expect(use).toHaveBeenCalledTimes(1);
    const middleware = use.mock.calls[0][0] as (
      req: { url: string },
      res: { setHeader: jest.Mock },
      next: jest.Mock,
    ) => void;

    const setHeader = jest.fn();
    const next = jest.fn();

    middleware({ url: '/products' }, { setHeader }, next);
    expect(setHeader).not.toHaveBeenCalled();

    middleware({ url: '/docs-json' }, { setHeader }, next);
    expect(setHeader).toHaveBeenCalledTimes(1);
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining("script-src 'self' 'unsafe-inline' 'unsafe-eval'"),
    );

    middleware({ url: '/docs/assets/swagger-ui.css' }, { setHeader }, next);
    expect(setHeader).toHaveBeenCalledTimes(2);

    expect(next).toHaveBeenCalledTimes(3);
  });
});