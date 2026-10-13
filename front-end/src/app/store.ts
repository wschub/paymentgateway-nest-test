import { combineReducers, configureStore } from '@reduxjs/toolkit'
import catalogReducer, { type CatalogState } from '@/features/catalog/catalog.slice'
import productReducer, {
  type ProductDetailState,
} from '@/features/product/product.slice'
import checkoutReducer, {
  type CheckoutState,
} from '@/features/checkout/checkout.slice'
import {
  loadPersistedProgress,
  subscribeCheckoutProgress,
  toCheckoutState,
  type StorageLike,
} from '@/features/checkout/persistence'
import { restoreProgress } from '@/features/checkout/checkout.thunks'

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

export interface CreateAppStoreOptions {
  preloadedState?: Partial<RootState>
  storage?: StorageLike
  enableStartupValidation?: boolean
}

export const createAppStore = (options: CreateAppStoreOptions = {}) => {
  const {
    preloadedState,
    storage,
    enableStartupValidation = false,
  } = options

  const persisted = loadPersistedProgress(storage)
  const instance = makeStore({
    ...preloadedState,
    checkout:
      preloadedState?.checkout ??
      (persisted ? toCheckoutState(persisted) : undefined),
  })

  subscribeCheckoutProgress(instance, storage)

  if (enableStartupValidation) {
    void instance.dispatch(restoreProgress())
  }

  return instance
}

export const store = createAppStore({ enableStartupValidation: true })

export type AppDispatch = typeof store.dispatch
export type AppStore = ReturnType<typeof makeStore>