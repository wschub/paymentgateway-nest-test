import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { MIN_INSTALLMENTS } from '../../domain/rules/transaction.rules';

export class PayTransactionDto {
  @ApiProperty({ example: 'tok_test_...' })
  @IsString()
  @IsNotEmpty()
  cardToken!: string;

  @ApiPropertyOptional({
    example: 1,
    minimum: MIN_INSTALLMENTS,
    description: 'Optional; defaults to 1',
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_INSTALLMENTS)
  installments?: number;

  @ApiProperty({
    example: true,
    description: 'Must be accepted in the use case; the DTO only checks the type',
  })
  @IsBoolean()
  acceptedContracts!: boolean;
}
