import type { Product } from '../../domain/entities/product.entity';
import { DataAccessError } from '../../domain/errors/data-access.error';
import type { ProductRepository } from '../../domain/ports/product.repository';
import { err, ok, type Result } from '../result/result';

export class GetProductsUseCase {
  constructor(private readonly productRepository: ProductRepository) {}

  async execute(): Promise<Result<Product[], DataAccessError>> {
    try {
      return ok(await this.productRepository.findAll());
    } catch (error) {
      if (error instanceof DataAccessError) {
        return err(error);
      }

      throw error;
    }
  }
}
