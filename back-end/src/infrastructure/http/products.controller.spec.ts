import { ok, err } from '../../application/result/result';
import { GetProductByIdUseCase } from '../../application/use-cases/get-product-by-id.use-case';
import { GetProductsUseCase } from '../../application/use-cases/get-products.use-case';
import { Product } from '../../domain/entities/product.entity';
import { DataAccessError } from '../../domain/errors/data-access.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { ProductResponseDto } from './product-response.dto';
import { ProductsController } from './products.controller';

describe('ProductsController', () => {
  const mouse = new Product({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Wireless Mouse',
    description: 'Ergonomic wireless mouse',
    priceInCents: 35000,
    stock: 15,
    imageUrl: '/images/products/wireless-mouse.webp',
    createdAt: new Date('2026-10-07T10:00:00.000Z'),
    updatedAt: new Date('2026-10-07T11:00:00.000Z'),
  });

  const soldOutHeadset = new Product({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'USB-C Headset',
    description: 'Noise cancelling headset',
    priceInCents: 99000,
    stock: 0,
    imageUrl: '/images/products/usb-c-headset.webp',
    createdAt: new Date('2026-10-07T10:00:00.000Z'),
    updatedAt: new Date('2026-10-07T11:00:00.000Z'),
  });

  const dto = (product: Product) =>
    new ProductResponseDto(
      product.id,
      product.name,
      product.description,
      product.priceInCents,
      product.stock,
      product.imageUrl,
    );

  let execute: jest.Mock;
  let executeById: jest.Mock;
  let controller: ProductsController;

  beforeEach(() => {
    execute = jest.fn();
    executeById = jest.fn();
    controller = new ProductsController(
      { execute } as unknown as GetProductsUseCase,
      { execute: executeById } as unknown as GetProductByIdUseCase,
    );
  });

  it('calls the use case and maps the products to ProductResponseDto', async () => {
    execute.mockResolvedValue(ok([mouse, soldOutHeadset]));

    const response = await controller.getProducts();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(response).toEqual([dto(mouse), dto(soldOutHeadset)]);
    expect(response[0]).toBeInstanceOf(ProductResponseDto);
  });

  it('returns an empty list when the catalog is empty', async () => {
    execute.mockResolvedValue(ok([]));

    await expect(controller.getProducts()).resolves.toEqual([]);
  });

  it('forwards the error without deciding the status code itself', async () => {
    const error = new DataAccessError('Product repository is unavailable', {
      cause: new Error('connection refused'),
    });
    execute.mockResolvedValue(err(error));

    await expect(controller.getProducts()).rejects.toBe(error);
  });

  describe('getProductById', () => {
    it('calls the use case with the id and maps the product to ProductResponseDto', async () => {
      executeById.mockResolvedValue(ok(mouse));

      const response = await controller.getProductById(mouse.id);

      expect(executeById).toHaveBeenCalledWith(mouse.id);
      expect(response).toEqual(dto(mouse));
      expect(response).toBeInstanceOf(ProductResponseDto);
    });

    it('forwards a not-found result without deciding the status code itself', async () => {
      const notFound = new ProductNotFoundError(mouse.id);
      executeById.mockResolvedValue(err(notFound));

      await expect(controller.getProductById(mouse.id)).rejects.toBe(notFound);
    });
  });
});