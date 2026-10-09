import { ApiProperty } from '@nestjs/swagger';

export class ProductResponseDto {
  constructor(
    id: string,
    name: string,
    description: string,
    priceInCents: number,
    stock: number,
    imageUrl: string,
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.priceInCents = priceInCents;
    this.stock = stock;
    this.imageUrl = imageUrl;
  }

  @ApiProperty({ example: '11111111-1111-4111-8111-111111111111' })
  readonly id: string;

  @ApiProperty({ example: 'Wireless Mouse' })
  readonly name: string;

  @ApiProperty({ example: 'Ergonomic wireless mouse' })
  readonly description: string;

  @ApiProperty({ example: 35000 })
  readonly priceInCents: number;

  @ApiProperty({ example: 15 })
  readonly stock: number;

  @ApiProperty({ example: '/images/products/wireless-mouse.webp' })
  readonly imageUrl: string;
}