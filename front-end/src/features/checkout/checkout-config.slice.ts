import { createSlice } from '@reduxjs/toolkit'
import { loadCheckoutConfig } from '@/features/checkout/checkout.thunks'
import type { CheckoutConfig } from '@/features/checkout/checkout.types'
import { createApiError, type ApiError } from '@/shared/api/api.errors'

export type CheckoutConfigStatus = 'idle' | 'loading' | 'success' | 'error'

export interface CheckoutConfigState {
  config: CheckoutConfig | null
  status: CheckoutConfigStatus
  error: ApiError | null
}

const initialState: CheckoutConfigState = {
  config: null,
  status: 'idle',
  error: null,
}

export const checkoutConfigSlice = createSlice({
  name: 'checkoutConfig',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadCheckoutConfig.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(loadCheckoutConfig.fulfilled, (state, action) => {
        state.status = 'success'
        state.config = action.payload
        state.error = null
      })
      .addCase(loadCheckoutConfig.rejected, (state, action) => {
        state.status = 'error'
        state.config = null
        state.error = action.payload ?? createApiError('server')
      })
  },
})

export default checkoutConfigSlice.reducer
