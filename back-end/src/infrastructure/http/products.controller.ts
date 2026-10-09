import { Controller, Get } from '@nestjs/common';
import { GetProductsUseCase } from '../../application/use-cases/get-products.use-case';
import { toProductResponseDto } from './product-response.mapper';
import { unwrapResult } from './result-unwrapper';
import { ProductResponseDto } from './product-response.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly getProductsUseCase: GetProductsUseCase) {}

  @Get()
  async getProducts(): Promise<ProductResponseDto[]> {
    const products = unwrapResult(await this.getProductsUseCase.execute());

    return products.map(toProductResponseDto);
  }
}