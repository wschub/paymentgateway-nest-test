export interface ProductProps {
  id: string;
  name: string;
  description: string;
  priceInCents: number;
  stock: number;
  imageUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Product {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priceInCents: number;
  readonly stock: number;
  readonly imageUrl: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ProductProps) {
    if (typeof props.id !== 'string' || props.id.trim() === '') {
      throw new RangeError('id must not be empty');
    }
    if (typeof props.name !== 'string' || props.name.trim() === '') {
      throw new RangeError('name must not be empty');
    }
    if (!Number.isInteger(props.priceInCents) || props.priceInCents <= 0) {
      throw new RangeError('priceInCents must be a positive integer');
    }
    if (!Number.isInteger(props.stock) || props.stock < 0) {
      throw new RangeError('stock must be a non-negative integer');
    }

    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this.priceInCents = props.priceInCents;
    this.stock = props.stock;
    this.imageUrl = props.imageUrl;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
