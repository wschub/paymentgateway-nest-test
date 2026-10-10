import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { GetCheckoutConfigUseCase } from '../../application/use-cases/get-checkout-config.use-case';
import { PayTransactionUseCase } from '../../application/use-cases/pay-transaction.use-case';
import { CheckoutConfigResponseDto } from './checkout-config-response.dto';
import { toCheckoutConfigResponseDto } from './checkout-config-response.mapper';
import { ErrorResponseDto } from './error-response.dto';
import { PayTransactionDto } from './pay-transaction.dto';
import { unwrapResult } from './result-unwrapper';
import { TransactionResponseDto } from './transaction-response.dto';
import { toTransactionResponseDto } from './transaction-response.mapper';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly getCheckoutConfigUseCase: GetCheckoutConfigUseCase,
    private readonly payTransactionUseCase: PayTransactionUseCase,
  ) {}

  @Get('payments/checkout-config')
  @ApiOkResponse({
    type: CheckoutConfigResponseDto,
    description: 'Public, non-secret configuration for the checkout',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Unexpected server error',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorResponseDto,
    description: 'Unexpected server error',
  })
  async getCheckoutConfig(): Promise<CheckoutConfigResponseDto> {
    const output = unwrapResult(await this.getCheckoutConfigUseCase.execute());

    return toCheckoutConfigResponseDto(output);
  }

  @Post('transactions/:id/payment')
  @ApiParam({ name: 'id', description: 'The purchase id' })
  @ApiAcceptedResponse({
    type: TransactionResponseDto,
    description: 'Payment in progress; the current transaction view is returned',
  })
  @ApiOkResponse({
    type: TransactionResponseDto,
    description: 'The provider answered with an already final status',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Malformed body or missing cardToken',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No purchase matches the given id',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The purchase is not payable',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description: 'Contracts not accepted or the payment token is invalid',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'The payment provider rejected the request',
  })
  @ApiInternalServerErrorResponse({
    type: ErrorResponseDto,
    description: 'Unexpected server error',
  })
  async payTransaction(
    @Param('id') id: string,
    @Body() body: PayTransactionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TransactionResponseDto> {
    const view = unwrapResult(
      await this.payTransactionUseCase.execute({
        transactionId: id,
        cardToken: body.cardToken,
        installments: body.installments,
        acceptedContracts: body.acceptedContracts,
      }),
    );

    response.status(
      view.status === 'PENDING' ? HttpStatus.ACCEPTED : HttpStatus.OK,
    );

    return toTransactionResponseDto(view);
  }
}
