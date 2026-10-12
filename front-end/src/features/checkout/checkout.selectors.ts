import type { RootState } from '@/app/store'
import type { DeliveryData } from '@/features/checkout/checkout.slice'

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

export const selectHasStartedPurchase = (state: RootState) =>
  state.checkout.selectedProductId !== null

export const selectDeliveryProvided = (state: RootState) =>
  state.checkout.delivery !== null