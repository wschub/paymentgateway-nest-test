import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { GetProductByIdUseCase } from '../../application/use-cases/get-product-by-id.use-case';
import { GetProductsUseCase } from '../../application/use-cases/get-products.use-case';
import { toProductResponseDto } from './product-response.mapper';
import { unwrapResult } from './result-unwrapper';
import { ProductResponseDto } from './product-response.dto';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly getProductsUseCase: GetProductsUseCase,
    private readonly getProductByIdUseCase: GetProductByIdUseCase,
  ) {}

  @Get()
  async getProducts(): Promise<ProductResponseDto[]> {
    const products = unwrapResult(await this.getProductsUseCase.execute());

    return products.map(toProductResponseDto);
  }

  @Get(':id')
  async getProductById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProductResponseDto> {
    const product = unwrapResult(await this.getProductByIdUseCase.execute(id));

    return toProductResponseDto(product);
  }
}