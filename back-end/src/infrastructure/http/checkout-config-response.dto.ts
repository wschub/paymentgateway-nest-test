import { ApiProperty } from '@nestjs/swagger';

export class CheckoutContractsDto {
  constructor(terms: string, personalData: string) {
    this.terms = terms;
    this.personalData = personalData;
  }

  @ApiProperty({ example: 'https://host.example.test/permalink/terms' })
  readonly terms: string;

  @ApiProperty({ example: 'https://host.example.test/permalink/personal' })
  readonly personalData: string;
}

export class CheckoutInstallmentsDto {
  constructor(defaultValue: number, max: number) {
    this.default = defaultValue;
    this.max = max;
  }

  @ApiProperty({ example: 1 })
  readonly default: number;

  @ApiProperty({ example: 36 })
  readonly max: number;
}

export class CheckoutConfigResponseDto {
  constructor(
    publicKey: string,
    baseUrl: string,
    currency: string,
    contracts: CheckoutContractsDto,
    installments: CheckoutInstallmentsDto,
  ) {
    this.publicKey = publicKey;
    this.baseUrl = baseUrl;
    this.currency = currency;
    this.contracts = contracts;
    this.installments = installments;
  }

  @ApiProperty({ example: 'pub_****' })
  readonly publicKey: string;

  @ApiProperty({ example: 'https://sandbox.example.test/v1' })
  readonly baseUrl: string;

  @ApiProperty({ example: 'COP' })
  readonly currency: string;

  @ApiProperty({ type: () => CheckoutContractsDto })
  readonly contracts: CheckoutContractsDto;

  @ApiProperty({ type: () => CheckoutInstallmentsDto })
  readonly installments: CheckoutInstallmentsDto;
}
