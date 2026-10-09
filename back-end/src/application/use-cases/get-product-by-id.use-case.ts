import type { Product } from '../../domain/entities/product.entity';
import { DataAccessError } from '../../domain/errors/data-access.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import type { ProductRepository } from '../../domain/ports/product.repository';
import { err, ok, type Result } from '../result/result';

export class GetProductByIdUseCase {
  constructor(private readonly productRepository: ProductRepository) {}

  async execute(
    productId: string,
  ): Promise<Result<Product, DataAccessError | ProductNotFoundError>> {
    try {
      const product = await this.productRepository.findById(productId);

      if (product === null) {
        return err(new ProductNotFoundError(productId));
      }

      return ok(product);
    } catch (error) {
      if (error instanceof DataAccessError) {
        return err(error);
      }

      throw error;
    }
  }
}