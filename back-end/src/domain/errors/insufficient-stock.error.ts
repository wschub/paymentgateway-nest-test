export class InsufficientStockError extends Error {
  readonly productId: string;
  readonly requestedQuantity: number;
  readonly availableStock: number;

  constructor(
    productId: string,
    requestedQuantity: number,
    availableStock: number,
  ) {
    super(
      `Insufficient stock for product "${productId}": requested ${requestedQuantity}, available ${availableStock}`,
    );
    this.name = 'InsufficientStockError';
    this.productId = productId;
    this.requestedQuantity = requestedQuantity;
    this.availableStock = availableStock;
  }
}