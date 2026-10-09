import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({ example: 'NOT_FOUND' })
  code!: string;

  @ApiProperty({ example: 'Not Found' })
  message!: string;

  @ApiProperty({ example: '/products/11111111-1111-4111-8111-111111111111' })
  path!: string;

  @ApiProperty({ example: '2026-10-08T12:00:00.000Z' })
  timestamp!: string;
}