import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  EMAIL_PATTERN,
  FULL_NAME_MAX_LENGTH,
  PHONE_PATTERN,
} from '../../domain/rules/customer.rules';
import { NOTES_MAX_LENGTH } from '../../domain/rules/delivery.rules';
import { MAX_QUANTITY, MIN_QUANTITY } from '../../domain/rules/transaction.rules';

const trimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCustomerDto {
  @ApiProperty({
    example: 'Test Buyer',
    description: `Non-empty, up to ${FULL_NAME_MAX_LENGTH} characters`,
  })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(FULL_NAME_MAX_LENGTH)
  fullName!: string;

  @ApiProperty({ example: 'buyer@example.com' })
  @IsString()
  @Matches(EMAIL_PATTERN)
  email!: string;

  @ApiProperty({ example: '+57 300 000 0000' })
  @IsString()
  @Matches(PHONE_PATTERN)
  phone!: string;
}

export class CreateDeliveryDto {
  @ApiProperty({ example: 'Calle 1 #2-3' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({ example: 'Bogotá' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ example: 'Cundinamarca' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  region!: string;

  @ApiPropertyOptional({
    example: 'Ring twice',
    description: `Optional, up to ${NOTES_MAX_LENGTH} characters`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(NOTES_MAX_LENGTH)
  notes?: string;
}

export class CreateTransactionDto {
  @ApiProperty({ example: '11111111-1111-4111-8111-111111111111' })
  @IsUUID()
  productId!: string;

  @ApiProperty({
    example: 1,
    minimum: MIN_QUANTITY,
    maximum: MAX_QUANTITY,
    description: `Between ${MIN_QUANTITY} and ${MAX_QUANTITY} units`,
  })
  @IsInt()
  @Min(MIN_QUANTITY)
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiProperty({ type: () => CreateCustomerDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateCustomerDto)
  customer!: CreateCustomerDto;

  @ApiProperty({ type: () => CreateDeliveryDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateDeliveryDto)
  delivery!: CreateDeliveryDto;
}
