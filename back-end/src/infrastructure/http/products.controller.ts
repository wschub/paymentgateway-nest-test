import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { GetProductByIdUseCase } from '../../application/use-cases/get-product-by-id.use-case';
import { GetProductsUseCase } from '../../application/use-cases/get-products.use-case';
import { ErrorResponseDto } from './error-response.dto';
import { toProductResponseDto } from './product-response.mapper';
import { unwrapResult } from './result-unwrapper';
import { ProductResponseDto } from './product-response.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly getProductsUseCase: GetProductsUseCase,
    private readonly getProductByIdUseCase: GetProductByIdUseCase,
  ) {}

  @Get()
  @ApiOkResponse({
    type: ProductResponseDto,
    isArray: true,
    description: 'The full product catalog',
  })
  async getProducts(): Promise<ProductResponseDto[]> {
    const products = unwrapResult(await this.getProductsUseCase.execute());

    return products.map(toProductResponseDto);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'The product uuid', format: 'uuid' })
  @ApiOkResponse({
    type: ProductResponseDto,
    description: 'The requested product',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'The id is not a well-formed uuid',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No product matches the given id',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorResponseDto,
    description: 'Unexpected server error',
  })
  async getProductById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProductResponseDto> {
    const product = unwrapResult(await this.getProductByIdUseCase.execute(id));

    return toProductResponseDto(product);
  }
}