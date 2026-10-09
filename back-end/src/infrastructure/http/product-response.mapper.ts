import type { Product } from '../../domain/entities/product.entity';
import { ProductResponseDto } from './product-response.dto';

export const toProductResponseDto = (product: Product): ProductResponseDto =>
  new ProductResponseDto(
    product.id,
    product.name,
    product.description,
    product.priceInCents,
    product.stock,
    product.imageUrl,
  );