export class ProductResponseDto {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly description: string,
    readonly priceInCents: number,
    readonly stock: number,
    readonly imageUrl: string,
  ) {}
}