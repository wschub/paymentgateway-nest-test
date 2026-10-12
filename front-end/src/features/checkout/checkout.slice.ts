import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { MAX_QUANTITY_PER_PURCHASE } from '@/shared/constants'
import { clampQuantity } from '@/shared/product'

export type CheckoutStep = 'product' | 'cardAndDelivery' | 'summary' | 'finalStatus'

export interface DeliveryData {
  fullName: string
  email: string
  phone: string
  address: string
  city: string
  region: string
  notes?: string
}

export interface CheckoutState {
  currentStep: CheckoutStep
  selectedProductId: string | null
  quantity: number
  delivery: DeliveryData | null
  transactionId: string | null
}

export interface PurchaseStartedPayload {
  productId: string
  quantity: number
}

export interface RestoredPayload {
  currentStep: CheckoutStep
  selectedProductId: string | null
  quantity: number
  delivery: DeliveryData | null
  transactionId: string | null
}

const initialState: CheckoutState = {
  currentStep: 'product',
  selectedProductId: null,
  quantity: 1,
  delivery: null,
  transactionId: null,
}

export const checkoutSlice = createSlice({
  name: 'checkout',
  initialState,
  reducers: {
    purchaseStarted(state, action: PayloadAction<PurchaseStartedPayload>) {
      state.currentStep = 'product'
      state.selectedProductId = action.payload.productId
      state.quantity = clampQuantity(
        action.payload.quantity,
        MAX_QUANTITY_PER_PURCHASE,
      )
    },
    quantityChanged(state, action: PayloadAction<number>) {
      state.quantity = clampQuantity(
        action.payload,
        MAX_QUANTITY_PER_PURCHASE,
      )
    },
    startOver: () => initialState,
    restored(state, action: PayloadAction<RestoredPayload>) {
      state.currentStep = action.payload.currentStep
      state.selectedProductId = action.payload.selectedProductId
      state.quantity = action.payload.quantity
      state.delivery = action.payload.delivery
      state.transactionId = action.payload.transactionId
    },
  },
})

export const { purchaseStarted, quantityChanged, startOver, restored } =
  checkoutSlice.actions

export default checkoutSlice.reducer