import {
  combineReducers,
  configureStore,
} from '@reduxjs/toolkit'
import catalogReducer, { type CatalogState } from '@/features/catalog/catalog.slice'
import productReducer, {
  type ProductDetailState,
} from '@/features/product/product.slice'
import checkoutReducer, { type CheckoutState } from '@/features/checkout/checkout.slice'

export type RootState = {
  catalog: CatalogState
  product: ProductDetailState
  checkout: CheckoutState
}

const rootReducer = combineReducers({
  catalog: catalogReducer,
  product: productReducer,
  checkout: checkoutReducer,
})

export const makeStore = (preloadedState?: Partial<RootState>) =>
  configureStore({
    reducer: rootReducer,
    preloadedState,
  })

export const store = makeStore()

export type AppDispatch = typeof store.dispatch
export type AppStore = ReturnType<typeof makeStore>