import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { httpRequest, isApiError } from '@/shared/api/http'
import { createApiError, type ApiError } from '@/shared/api/api.errors'
import type { Product } from '@/shared/product'

export type CatalogStatus = 'idle' | 'loading' | 'success' | 'error'

export interface CatalogState {
  items: Product[]
  status: CatalogStatus
  error: ApiError | null
  requestId: string | null
  lastReadAt: string | null
}

const initialState: CatalogState = {
  items: [],
  status: 'idle',
  error: null,
  requestId: null,
  lastReadAt: null,
}

export const fetchCatalog = createAsyncThunk<
  Product[],
  void,
  { rejectValue: ApiError }
>('catalog/fetch', async (_arg, { rejectWithValue }) => {
  const result = await httpRequest<Product[]>('/products')
  if (isApiError(result)) {
    return rejectWithValue(result)
  }
  return result
})

const catalogSlice = createSlice({
  name: 'catalog',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchCatalog.pending, (state, action) => {
      state.requestId = action.meta.requestId
      state.status = 'loading'
      state.error = null
    })
    builder.addCase(fetchCatalog.fulfilled, (state, action) => {
      if (action.meta.requestId !== state.requestId) {
        return
      }
      state.items = action.payload
      state.status = 'success'
      state.error = null
      state.lastReadAt = new Date().toISOString()
    })
    builder.addCase(fetchCatalog.rejected, (state, action) => {
      if (action.meta.requestId !== state.requestId) {
        return
      }
      state.status = 'error'
      state.error = action.payload ?? createApiError('server')
      state.lastReadAt = new Date().toISOString()
    })
  },
})

export default catalogSlice.reducer