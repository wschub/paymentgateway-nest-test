import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { httpRequest, isApiError } from '@/shared/api/http'
import { createApiError, type ApiError } from '@/shared/api/api.errors'
import { clampQuantity, type Product } from '@/shared/product'

export type ProductStatus = 'idle' | 'loading' | 'success' | 'error'

export interface ProductDetailState {
  product: Product | null
  status: ProductStatus
  error: ApiError | null
  quantity: number
  requestId: string | null
  lastReadAt: string | null
}

const initialState: ProductDetailState = {
  product: null,
  status: 'idle',
  error: null,
  quantity: 1,
  requestId: null,
  lastReadAt: null,
}

export const fetchProduct = createAsyncThunk<Product, string, { rejectValue: ApiError }>(
  'product/fetch',
  async (id, { rejectWithValue }) => {
    const result = await httpRequest<Product>(`/products/${id}`, {
      map400ToNotFound: true,
    })
    if (isApiError(result)) {
      return rejectWithValue(result)
    }
    return result
  },
)

const productSlice = createSlice({
  name: 'product',
  initialState,
  reducers: {
    productOpened(state) {
      state.quantity = 1
    },
    quantityChanged(state, action: PayloadAction<number>) {
      if (!state.product) {
        return
      }
      state.quantity = clampQuantity(action.payload, state.product.stock)
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchProduct.pending, (state, action) => {
      state.requestId = action.meta.requestId
      state.error = null
      if (state.product === null) {
        state.status = 'loading'
      }
    })
    builder.addCase(fetchProduct.fulfilled, (state, action) => {
      if (action.meta.requestId !== state.requestId) {
        return
      }
      state.product = action.payload
      state.status = 'success'
      state.error = null
      state.quantity = clampQuantity(state.quantity, action.payload.stock)
      state.lastReadAt = new Date().toISOString()
    })
    builder.addCase(fetchProduct.rejected, (state, action) => {
      if (action.meta.requestId !== state.requestId) {
        return
      }
      state.status = 'error'
      state.error = action.payload ?? createApiError('server')
      state.lastReadAt = new Date().toISOString()
    })
  },
})

export const { quantityChanged, productOpened } = productSlice.actions

export default productSlice.reducer