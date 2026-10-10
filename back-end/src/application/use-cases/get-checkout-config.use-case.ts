import { PaymentProviderUnavailableError } from '../../domain/errors/payment-provider-unavailable.error';
import type { PaymentGateway } from '../../domain/ports/payment-gateway.port';
import type { AppConfigValues } from '../config-values';
import { err, ok, type Result } from '../result/result';

export interface CheckoutConfigOutput {
  publicKey: string;
  baseUrl: string;
  currency: string;
  contracts: {
    terms: string;
    personalData: string;
  };
  installments: {
    default: number;
    max: number;
  };
}

export type GetCheckoutConfigError = PaymentProviderUnavailableError;

export class GetCheckoutConfigUseCase {
  constructor(
    private readonly config: AppConfigValues,
    private readonly paymentGateway: PaymentGateway,
  ) {}

  async execute(): Promise<Result<CheckoutConfigOutput, GetCheckoutConfigError>> {
    let merchantInfo;
    try {
      merchantInfo = await this.paymentGateway.getMerchantInfo();
    } catch (error) {
      if (error instanceof PaymentProviderUnavailableError) {
        return err(error);
      }
      throw error;
    }

    return ok({
      publicKey: this.config.publicKey,
      baseUrl: this.config.baseUrl,
      currency: this.config.currency,
      contracts: merchantInfo.contracts,
      installments: merchantInfo.installments,
    });
  }
}