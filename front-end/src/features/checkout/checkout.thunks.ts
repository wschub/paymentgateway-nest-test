import { createAsyncThunk } from '@reduxjs/toolkit'
import {
  checkoutStepChanged,
  idempotencyKeySet,
  retryAfterFinal,
  startOver,
  transactionReadFailed,
  transactionReadStarted,
  transactionReceived,
  type CheckoutState,
  type DeliveryData,
} from '@/features/checkout/checkout.slice'
import {
  fetchProduct,
  quantityChanged as productQuantityChanged,
} from '@/features/product/product.slice'
import { toTransactionPayload } from '@/features/checkout/delivery.validation'
import { generateIdempotencyKey } from '@/features/checkout/idempotency'
import type { CheckoutConfig, TransactionView } from '@/features/checkout/checkout.types'
import { httpRequest, isApiError } from '@/shared/api/http'
import type { ApiError } from '@/shared/api/api.errors'

export type RestoreOutcome =
  | 'noop'
  | 'kept'
  | 'transient'
  | 'discarded'
  | 'verifying'

interface RestoreProgressState {
  checkout: CheckoutState
}

export const restoreProgress = createAsyncThunk<
  RestoreOutcome,
  void,
  { state: RestoreProgressState }
>('checkout/restoreProgress', async (_arg, { getState, dispatch }) => {
  const { selectedProductId, quantity } = getState().checkout
  if (!selectedProductId) {
    return 'noop'
  }

  const result = await dispatch(fetchProduct(selectedProductId))
  if (fetchProduct.fulfilled.match(result)) {
    dispatch(productQuantityChanged(quantity))
    const { transactionId, currentStep } = getState().checkout
    if (transactionId && currentStep === 'finalStatus') {
      dispatch(checkoutStepChanged('finalStatus'))
      void dispatch(readTransactionStatus(transactionId))
      return 'verifying'
    }
    return 'kept'
  }

  const error = result.payload as ApiError | undefined
  if (error?.kind === 'notFound') {
    dispatch(startOver())
    return 'discarded'
  }

  return 'transient'
})

export const retryPurchase = createAsyncThunk<
  void,
  void,
  { state: RestoreProgressState }
>('checkout/retryPurchase', async (_arg, { dispatch }) => {
  dispatch(idempotencyKeySet(generateIdempotencyKey()))
  dispatch(retryAfterFinal())
})

export const loadCheckoutConfig = createAsyncThunk<
  CheckoutConfig,
  void,
  { rejectValue: ApiError }
>('checkout/loadCheckoutConfig', async (_arg, { rejectWithValue }) => {
  const result = await httpRequest<CheckoutConfig>('/payments/checkout-config')
  if (isApiError(result)) {
    return rejectWithValue(result)
  }
  return result
})

export interface CreateTransactionArgs {
  idempotencyKey: string
  productId: string
  quantity: number
  delivery: DeliveryData
}

export const createTransaction = createAsyncThunk<
  TransactionView,
  CreateTransactionArgs,
  { rejectValue: ApiError }
>('checkout/createTransaction', async (args, { rejectWithValue }) => {
  const { customer, delivery } = toTransactionPayload(args.delivery)
  const result = await httpRequest<TransactionView>('/transactions', {
    method: 'POST',
    headers: { 'Idempotency-Key': args.idempotencyKey },
    body: {
      productId: args.productId,
      quantity: args.quantity,
      customer,
      delivery,
    },
  })
  if (isApiError(result)) {
    return rejectWithValue(result)
  }
  return result
})

export interface PayTransactionArgs {
  transactionId: string
  cardToken: string
  installments: number
}

export const payTransaction = createAsyncThunk<
  TransactionView,
  PayTransactionArgs,
  { rejectValue: ApiError }
>('checkout/payTransaction', async (args, { rejectWithValue }) => {
  const result = await httpRequest<TransactionView>(
    `/transactions/${args.transactionId}/payment`,
    {
      method: 'POST',
      body: {
        cardToken: args.cardToken,
        installments: args.installments,
        acceptedContracts: true,
      },
    },
  )
  if (isApiError(result)) {
    return rejectWithValue(result)
  }
  return result
})

export const readTransactionStatus = createAsyncThunk<
  TransactionView,
  string,
  { state: RestoreProgressState; rejectValue: ApiError }
>(
  'checkout/readTransactionStatus',
  async (transactionId, { dispatch, getState, rejectWithValue, requestId }) => {
    dispatch(transactionReadStarted(requestId))

    const result = await httpRequest<TransactionView>(
      `/transactions/${transactionId}`,
      { map400ToNotFound: true },
    )

    if (getState().checkout.lastReadRequestId !== requestId) {
      if (isApiError(result)) {
        return rejectWithValue(result)
      }
      return result
    }

    if (isApiError(result)) {
      dispatch(transactionReadFailed(result))
      return rejectWithValue(result)
    }

    dispatch(transactionReceived(result))
    return result
  },
)