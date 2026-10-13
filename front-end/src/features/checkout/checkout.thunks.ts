import { createAsyncThunk } from '@reduxjs/toolkit'
import { startOver, type CheckoutState } from '@/features/checkout/checkout.slice'
import {
  fetchProduct,
  quantityChanged as productQuantityChanged,
} from '@/features/product/product.slice'
import type { ApiError } from '@/shared/api/api.errors'

export type RestoreOutcome = 'noop' | 'kept' | 'transient' | 'discarded'

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
    return 'kept'
  }

  const error = result.payload as ApiError | undefined
  if (error?.kind === 'notFound') {
    dispatch(startOver())
    return 'discarded'
  }

  return 'transient'
})