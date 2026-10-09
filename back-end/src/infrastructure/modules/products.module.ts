import { Module } from '@nestjs/common';
import { GetProductByIdUseCase } from '../../application/use-cases/get-product-by-id.use-case';
import { GetProductsUseCase } from '../../application/use-cases/get-products.use-case';
import type { ProductRepository } from '../../domain/ports/product.repository';
import { ProductsController } from '../http/products.controller';
import { PrismaProductRepository } from '../persistence/prisma-product.repository';

export const PRODUCTS_REPOSITORY = Symbol('PRODUCTS_REPOSITORY');

@Module({
  controllers: [ProductsController],
  providers: [
    {
      provide: PRODUCTS_REPOSITORY,
      useClass: PrismaProductRepository,
    },
    {
      provide: GetProductsUseCase,
      useFactory: (repository: ProductRepository) =>
        new GetProductsUseCase(repository),
      inject: [PRODUCTS_REPOSITORY],
    },
    {
      provide: GetProductByIdUseCase,
      useFactory: (repository: ProductRepository) =>
        new GetProductByIdUseCase(repository),
      inject: [PRODUCTS_REPOSITORY],
    },
  ],
})
export class ProductsModule {}