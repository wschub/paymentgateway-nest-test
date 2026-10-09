import type { Product } from '../domain/entities/product.entity';
import { DataAccessError } from '../domain/errors/data-access.error';
import type { ProductRepository } from '../domain/ports/product.repository';

export class InMemoryProductRepository implements ProductRepository {
  constructor(
    private readonly products: Product[] = [],
    private readonly failureCause?: unknown,
  ) {}

  async findAll(): Promise<Product[]> {
    this.failIfSimulated();

    return [...this.products];
  }

  async findById(id: string): Promise<Product | null> {
    this.failIfSimulated();

    return this.products.find((product) => product.id === id) ?? null;
  }

  private failIfSimulated(): void {
    if (this.failureCause !== undefined) {
      throw new DataAccessError('Product repository is unavailable', {
        cause: this.failureCause,
      });
    }
  }
}
