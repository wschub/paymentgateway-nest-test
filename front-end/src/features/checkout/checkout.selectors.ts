import type { RootState } from '@/app/store'
import type {
  DeliveryData,
  PaymentStatus,
} from '@/features/checkout/checkout.slice'
import type { CheckoutConfigStatus } from '@/features/checkout/checkout-config.slice'
import type {
  CheckoutConfig,
  TransactionView,
} from '@/features/checkout/checkout.types'
import type { ApiError } from '@/shared/api/api.errors'

export const selectCheckoutStep = (state: RootState) =>
  state.checkout.currentStep

export const selectSelectedProductId = (state: RootState) =>
  state.checkout.selectedProductId

export const selectPurchaseQuantity = (state: RootState) =>
  state.checkout.quantity

export const selectDeliveryDetails = (
  state: RootState,
): DeliveryData | null => state.checkout.delivery

export const selectTransactionId = (state: RootState) =>
  state.checkout.transactionId

export const selectIdempotencyKey = (state: RootState) =>
  state.checkout.idempotencyKey

export const selectCardBrand = (state: RootState) => state.checkout.cardBrand

export const selectCardLastFour = (state: RootState) =>
  state.checkout.cardLastFour

export const selectInstallments = (state: RootState) =>
  state.checkout.installments

export const selectContractsAccepted = (state: RootState) =>
  state.checkout.contractsAccepted

export const selectPaymentStatus = (state: RootState): PaymentStatus =>
  state.checkout.paymentStatus

export const selectPaymentError = (state: RootState): ApiError | null =>
  state.checkout.paymentError

export const selectTransaction = (
  state: RootState,
): TransactionView | null => state.checkout.transaction ?? null

export const selectHasStartedPurchase = (state: RootState) =>
  state.checkout.selectedProductId !== null

export const selectDeliveryProvided = (state: RootState) =>
  state.checkout.delivery !== null

export const selectCheckoutConfig = (state: RootState): CheckoutConfig | null =>
  state.checkoutConfig.config

export const selectCheckoutConfigStatus = (
  state: RootState,
): CheckoutConfigStatus => state.checkoutConfig.status

export const selectCheckoutConfigError = (
  state: RootState,
): ApiError | null => state.checkoutConfig.error
