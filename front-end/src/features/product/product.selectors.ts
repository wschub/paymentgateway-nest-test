import type { RootState } from '@/app/store'

export const selectProductDetail = (state: RootState) => state.product.product

export const selectProductStatus = (state: RootState) => state.product.status

export const selectProductError = (state: RootState) => state.product.error

export const selectProductQuantity = (state: RootState) => state.product.quantity
