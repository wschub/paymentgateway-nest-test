import { Product, type ProductProps } from '../domain/entities/product.entity';

export type ReserveStockResult =
  | 'reserved'
  | 'product_not_found'
  | 'insufficient_stock';

export class InMemoryProductStore {
  private readonly records = new Map<string, ProductProps>();

  constructor(products: ReadonlyArray<Product | ProductProps> = []) {
    for (const product of products) {
      const props = InMemoryProductStore.toProps(product);
      this.records.set(props.id, props);
    }
  }

  list(): Product[] {
    return [...this.records.values()].map((props) => new Product(props));
  }

  findById(id: string): Product | null {
    const props = this.records.get(id);
    return props === undefined ? null : new Product(props);
  }

  nameOf(id: string): string | null {
    return this.records.get(id)?.name ?? null;
  }

  reserve(id: string, quantity: number): ReserveStockResult {
    const props = this.records.get(id);
    if (props === undefined) {
      return 'product_not_found';
    }
    if (props.stock < quantity) {
      return 'insufficient_stock';
    }
    props.stock -= quantity;
    return 'reserved';
  }

  release(id: string, quantity: number): void {
    const props = this.records.get(id);
    if (props !== undefined) {
      props.stock += quantity;
    }
  }

  private static toProps(product: Product | ProductProps): ProductProps {
    if (product instanceof Product) {
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        priceInCents: product.priceInCents,
        stock: product.stock,
        imageUrl: product.imageUrl,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };
    }
    return { ...product };
  }
}
