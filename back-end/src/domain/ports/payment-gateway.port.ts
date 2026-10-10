export interface MerchantInfo {
  acceptanceToken: string;
  personalDataAuthToken: string;
  contracts: {
    terms: string;
    personalData: string;
  };
  installments: {
    default: number;
    max: number;
  };
}

export type ProviderTransactionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DECLINED'
  | 'VOIDED'
  | 'ERROR'
  | 'UNKNOWN';

export interface ProviderTransaction {
  id: string;
  reference: string;
  status: ProviderTransactionStatus;
  statusMessage: string | null;
  amountInCents: number;
  currency: string;
  cardBrand: string | null;
  cardLastFour: string | null;
  installments: number | null;
  createdAt: Date | null;
}

export interface CreateCardTransactionInput {
  acceptanceToken: string;
  acceptPersonalAuth: string;
  reference: string;
  cardToken: string;
  amountInCents: number;
  currency: string;
  installments: number | null;
  customerEmail: string;
}

export interface PaymentGateway {
  getMerchantInfo(): Promise<MerchantInfo>;
  createCardTransaction(
    input: CreateCardTransactionInput,
  ): Promise<ProviderTransaction>;
  getTransaction(id: string): Promise<ProviderTransaction>;
  findByReference(reference: string): Promise<ProviderTransaction | null>;
}