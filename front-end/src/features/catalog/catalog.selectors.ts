import type { RootState } from '@/app/store'

export const selectCatalogItems = (state: RootState) => state.catalog.items

export const selectCatalogStatus = (state: RootState) => state.catalog.status

export const selectCatalogError = (state: RootState) => state.catalog.error
