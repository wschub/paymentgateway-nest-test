import type { CheckoutConfigOutput } from '../../application/use-cases/get-checkout-config.use-case';
import {
  CheckoutConfigResponseDto,
  CheckoutContractsDto,
  CheckoutInstallmentsDto,
} from './checkout-config-response.dto';

export const toCheckoutConfigResponseDto = (
  output: CheckoutConfigOutput,
): CheckoutConfigResponseDto =>
  new CheckoutConfigResponseDto(
    output.publicKey,
    output.baseUrl,
    output.currency,
    new CheckoutContractsDto(
      output.contracts.terms,
      output.contracts.personalData,
    ),
    new CheckoutInstallmentsDto(
      output.installments.default,
      output.installments.max,
    ),
  );
