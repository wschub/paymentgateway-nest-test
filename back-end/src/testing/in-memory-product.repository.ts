import type { Product } from '../domain/entities/product.entity';
import { DataAccessError } from '../domain/errors/data-access.error';
import type { ProductRepository } from '../domain/ports/product.repository';
import { InMemoryProductStore } from './in-memory-product-store';

export class InMemoryProductRepository implements ProductRepository {
  private readonly store: InMemoryProductStore | null;
  private readonly products: Product[];
  private readonly failureCause: unknown;

  constructor(
    source: Product[] | InMemoryProductStore = [],
    failureCause?: unknown,
  ) {
    if (source instanceof InMemoryProductStore) {
      this.store = source;
      this.products = [];
    } else {
      this.store = null;
      this.products = source;
    }
    this.failureCause = failureCause;
  }

  async findAll(): Promise<Product[]> {
    this.failIfSimulated();

    return this.store === null ? [...this.products] : this.store.list();
  }

  async findById(id: string): Promise<Product | null> {
    this.failIfSimulated();

    if (this.store !== null) {
      return this.store.findById(id);
    }
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
