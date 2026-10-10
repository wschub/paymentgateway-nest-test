import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CreateTransactionUseCase } from '../../application/use-cases/create-transaction.use-case';
import { GetTransactionUseCase } from '../../application/use-cases/get-transaction.use-case';
import { isValidIdempotencyKey } from '../../domain/rules/transaction.rules';
import { CreateTransactionDto } from './create-transaction.dto';
import { ErrorResponseDto } from './error-response.dto';
import { unwrapResult } from './result-unwrapper';
import { CreateTransactionResponseDto, TransactionResponseDto } from './transaction-response.dto';
import {
  toCreateTransactionResponseDto,
  toTransactionResponseDto,
} from './transaction-response.mapper';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly createTransactionUseCase: CreateTransactionUseCase,
    private readonly getTransactionUseCase: GetTransactionUseCase,
  ) {}

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    description: '16-64 chars of letters, digits, dash or underscore',
    required: true,
  })
  @ApiCreatedResponse({
    type: CreateTransactionResponseDto,
    description: 'The pending purchase was created and stock reserved',
  })
  @ApiOkResponse({
    type: CreateTransactionResponseDto,
    description: 'Replay of an existing purchase for the same idempotency key',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Malformed body or missing/invalid Idempotency-Key header',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'The product does not exist',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Insufficient stock or the idempotency key was reused',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorResponseDto,
    description: 'Unexpected server error',
  })
  async createTransaction(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateTransactionDto,
  ): Promise<CreateTransactionResponseDto> {
    if (
      typeof idempotencyKey !== 'string' ||
      !isValidIdempotencyKey(idempotencyKey)
    ) {
      throw new BadRequestException('Missing or invalid Idempotency-Key header');
    }

    const output = unwrapResult(
      await this.createTransactionUseCase.execute({
        productId: body.productId,
        quantity: body.quantity,
        idempotencyKey,
        customer: {
          fullName: body.customer.fullName,
          email: body.customer.email,
          phone: body.customer.phone,
        },
        delivery: {
          address: body.delivery.address,
          city: body.delivery.city,
          region: body.delivery.region,
          notes: body.delivery.notes,
        },
      }),
    );

    return toCreateTransactionResponseDto(output);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'The purchase id' })
  @ApiOkResponse({
    type: TransactionResponseDto,
    description: 'The current transaction view',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No purchase matches the given id',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorResponseDto,
    description: 'Unexpected server error',
  })
  async getTransaction(@Param('id') id: string): Promise<TransactionResponseDto> {
    const view = unwrapResult(await this.getTransactionUseCase.execute(id));

    return toTransactionResponseDto(view);
  }
}
