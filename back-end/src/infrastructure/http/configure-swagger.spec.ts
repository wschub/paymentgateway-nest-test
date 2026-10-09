import type { INestApplication } from '@nestjs/common';
import { configureSwagger } from './configure-swagger';

const mockCreateDocument = jest.fn(() => ({ paths: {} }));
const mockSetup = jest.fn();

jest.mock('@nestjs/swagger', () => {
  const actual = jest.requireActual('@nestjs/swagger');
  return {
    ...actual,
    SwaggerModule: {
      ...actual.SwaggerModule,
      get createDocument() {
        return mockCreateDocument;
      },
      get setup() {
        return mockSetup;
      },
    },
  };
});

describe('configureSwagger', () => {
  it('creates the document with API metadata and mounts it under docs', () => {
    const use = jest.fn();
    const app = { use } as unknown as INestApplication;

    configureSwagger(app);

    expect(mockCreateDocument).toHaveBeenCalledTimes(1);
    expect(mockCreateDocument).toHaveBeenCalledWith(
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