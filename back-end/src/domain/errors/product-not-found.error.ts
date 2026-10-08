export class ProductNotFoundError extends Error {
  readonly productId: string;

  constructor(productId: string) {
    super(`Product with id "${productId}" was not found`);
    this.name = 'ProductNotFoundError';
    this.productId = productId;
  }
}
