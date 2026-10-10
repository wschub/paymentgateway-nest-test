import type { CheckoutConfigOutput } from '../../application/use-cases/get-checkout-config.use-case';
import { CheckoutConfigResponseDto } from './checkout-config-response.dto';
import { toCheckoutConfigResponseDto } from './checkout-config-response.mapper';

const output: CheckoutConfigOutput = {
  publicKey: 'pub_test_public_key',
  baseUrl: 'https://sandbox.invalid/v1',
  currency: 'COP',
  contracts: {
    terms: 'https://sandbox.invalid/permalink/terms',
    personalData: 'https://sandbox.invalid/permalink/personal',
  },
  installments: { default: 1, max: 36 },
};

describe('checkout-config-response.mapper', () => {
  it('maps every public field of the checkout config', () => {
    const dto = toCheckoutConfigResponseDto(output);

    expect(dto).toBeInstanceOf(CheckoutConfigResponseDto);
    expect(dto).toEqual({
      publicKey: 'pub_test_public_key',
      baseUrl: 'https://sandbox.invalid/v1',
      currency: 'COP',
      contracts: {
        terms: 'https://sandbox.invalid/permalink/terms',
        personalData: 'https://sandbox.invalid/permalink/personal',
      },
      installments: { default: 1, max: 36 },
    });
  });

  it('never exposes a private key, token or secret', () => {
    const serialized = JSON.stringify(toCheckoutConfigResponseDto(output));

    expect(serialized).not.toContain('prv_');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('integrity');
  });
});
