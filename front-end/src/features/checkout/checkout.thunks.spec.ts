import { configureStore } from '@reduxjs/toolkit'
import checkoutReducer, {
  type CheckoutState,
} from '@/features/checkout/checkout.slice'
import productReducer from '@/features/product/product.slice'
import {
  createTransaction,
  ensureIdempotencyKey,
  finalizeCheckout,
  loadCheckoutConfig,
  payTransaction,
  readTransactionStatus,
  restoreProgress,
  retryPurchase,
} from '@/features/checkout/checkout.thunks'
import checkoutConfigReducer from '@/features/checkout/checkout-config.slice'
import type {
  CheckoutConfig,
  TransactionCreated,
  TransactionView,
} from '@/features/checkout/checkout.types'
import {
  PERSISTENCE_STORAGE_KEY,
  subscribeCheckoutProgress,
  type StorageLike,
} from '@/features/checkout/persistence'
import { httpRequest } from '@/shared/api/http'
import { createApiError } from '@/shared/api/api.errors'
import { IDEMPOTENCY_KEY_PATTERN } from '@/shared/constants'
import type { Product } from '@/shared/product'

jest.mock('@/shared/api/http', () => ({
  httpRequest: jest.fn(),
  isApiError: (value: unknown) =>
    typeof value === 'object' &&
    value !== null &&
    'kind' in (value as Record<string, unknown>),
}))

const mockedHttpRequest = httpRequest as jest.MockedFunction<typeof httpRequest>

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111'

const buildProduct = (stock: number, id = PRODUCT_ID): Product => ({
  id,
  name: 'Wireless Mouse',
  description: 'Ergonomic wireless mouse',
  priceInCents: 3500000,
  stock,
  imageUrl: '/images/products/mouse.webp',
})

const startedCheckout = (): CheckoutState => ({
  currentStep: 'product',
  selectedProductId: PRODUCT_ID,
  quantity: 3,
  delivery: null,
  transactionId: null,
  idempotencyKey: null,
  cardBrand: null,
  cardLastFour: null,
  installments: 1,
  contractsAccepted: false,
  paymentStatus: 'idle',
  paymentError: null,
})

const DELIVERY_RESTORED = {
  fullName: 'Test Buyer',
  email: 'buyer@example.com',
  phone: '+57 300 000 0000',
  address: 'Calle 1 #2-3',
  city: 'Bogotá',
  region: 'Cundinamarca',
}

const fullyStartedCheckout = (): CheckoutState => ({
  ...startedCheckout(),
  currentStep: 'summary',
  delivery: DELIVERY_RESTORED,
  transactionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  idempotencyKey: 'key-1234567890abcdef',
})

const makeStore = (checkout: CheckoutState) =>
  configureStore({
    reducer: { checkout: checkoutReducer, product: productReducer },
    preloadedState: { checkout },
  })

describe('restoreProgress thunk', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
  })

  it('is a no-op when no purchase has started', async () => {
    const store = makeStore({
      currentStep: 'product',
      selectedProductId: null,
      quantity: 1,
      delivery: null,
      transactionId: null,
      idempotencyKey: null,
      cardBrand: null,
      cardLastFour: null,
      installments: 1,
      contractsAccepted: false,
      paymentStatus: 'idle',
      paymentError: null,
    })

    const outcome = await store.dispatch(restoreProgress()).unwrap()

    expect(outcome).toBe('noop')
    expect(mockedHttpRequest).not.toHaveBeenCalled()
  })

  it('keeps the restored progress when the product still exists', async () => {
    mockedHttpRequest.mockResolvedValue(buildProduct(10))
    const store = makeStore(startedCheckout())

    const outcome = await store.dispatch(restoreProgress()).unwrap()

    expect(outcome).toBe('kept')
    expect(store.getState().checkout.selectedProductId).toBe(PRODUCT_ID)
    expect(store.getState().checkout.quantity).toBe(3)
    expect(store.getState().product.product?.id).toBe(PRODUCT_ID)
    expect(store.getState().product.quantity).toBe(3)
    expect(mockedHttpRequest).toHaveBeenCalledWith(`/products/${PRODUCT_ID}`, {
      map400ToNotFound: true,
    })
  })

  it('discards all progress when the product was not found', async () => {
    mockedHttpRequest.mockResolvedValue(createApiError('notFound'))
    const store = makeStore(startedCheckout())

    const outcome = await store.dispatch(restoreProgress()).unwrap()

    expect(outcome).toBe('discarded')
    expect(store.getState().checkout.selectedProductId).toBeNull()
    expect(store.getState().checkout.quantity).toBe(1)
  })

  it('discards every persisted field when a malformed product id becomes a 400 mapped to notFound', async () => {
    mockedHttpRequest.mockResolvedValue(createApiError('notFound'))
    const store = makeStore(fullyStartedCheckout())

    const outcome = await store.dispatch(restoreProgress()).unwrap()

    expect(outcome).toBe('discarded')
    expect(mockedHttpRequest).toHaveBeenCalledWith(`/products/${PRODUCT_ID}`, {
      map400ToNotFound: true,
    })
    const cleared = store.getState().checkout
    expect(cleared.selectedProductId).toBeNull()
    expect(cleared.quantity).toBe(1)
    expect(cleared.delivery).toBeNull()
    expect(cleared.transactionId).toBeNull()
    expect(cleared.idempotencyKey).toBeNull()
  })

  it.each(['rateLimited', 'network', 'server', 'badRequest'] as const)(
    'keeps progress on a transient %s error so it can retry later',
    async (kind) => {
      mockedHttpRequest.mockResolvedValue(createApiError(kind))
      const store = makeStore(fullyStartedCheckout())

      const outcome = await store.dispatch(restoreProgress()).unwrap()

      expect(outcome).toBe('transient')
      expect(store.getState().checkout.selectedProductId).toBe(PRODUCT_ID)
      expect(store.getState().checkout.quantity).toBe(3)
      expect(store.getState().checkout.transactionId).toBe(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      )
      expect(store.getState().checkout.idempotencyKey).toBe('key-1234567890abcdef')
    },
  )

  it('keeps progress when the request rejects without a payload', async () => {
    mockedHttpRequest.mockRejectedValue(new Error('boom'))
    const store = makeStore(startedCheckout())

    const outcome = await store.dispatch(restoreProgress()).unwrap()

    expect(outcome).toBe('transient')
    expect(store.getState().checkout.selectedProductId).toBe(PRODUCT_ID)
  })

  it('does not write while validating and clears storage only when discarding', async () => {
    const map = new Map<string, string>()
    const storage: StorageLike = {
      getItem: (key) => (map.has(key) ? map.get(key)! : null),
      setItem: jest.fn((key, value) => void map.set(key, value)),
      removeItem: jest.fn((key) => void map.delete(key)),
    }

    mockedHttpRequest.mockResolvedValue(createApiError('network'))
    const store = makeStore(startedCheckout())
    map.set(
      PERSISTENCE_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        savedAt: new Date().toISOString(),
        ...startedCheckout(),
      }),
    )
    subscribeCheckoutProgress(store, storage)

    await store.dispatch(restoreProgress()).unwrap()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(map.has(PERSISTENCE_STORAGE_KEY)).toBe(true)

    mockedHttpRequest.mockResolvedValue(createApiError('notFound'))
    await store.dispatch(restoreProgress()).unwrap()
    expect(storage.removeItem).toHaveBeenCalledWith(PERSISTENCE_STORAGE_KEY)
    expect(map.has(PERSISTENCE_STORAGE_KEY)).toBe(false)
  })

  it('re-reads a restored transaction instead of creating or paying again', async () => {
    mockedHttpRequest.mockImplementation((path: string) => {
      if (path.startsWith('/products/')) return Promise.resolve(buildProduct(10))
      return Promise.resolve(buildTransaction({ status: 'PENDING' }))
    })
    const store = makeStore({ ...fullyStartedCheckout(), currentStep: 'finalStatus' })

    const outcome = await store.dispatch(restoreProgress()).unwrap()

    expect(outcome).toBe('verifying')
    expect(mockedHttpRequest).toHaveBeenCalledWith(
      '/transactions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      { map400ToNotFound: true },
    )
    const paths = mockedHttpRequest.mock.calls.map(([path]) => path)
    expect(paths.some((path) => path === '/transactions')).toBe(false)
    expect(paths.some((path) => path.endsWith('/payment'))).toBe(false)
    expect(store.getState().checkout.currentStep).toBe('finalStatus')
  })

  it('lands on the final status screen without polling-replay when the lookup resolves a final status (FR-013a)', async () => {
    mockedHttpRequest.mockImplementation((path: string) => {
      if (path.startsWith('/products/')) return Promise.resolve(buildProduct(10))
      return Promise.resolve(buildTransaction({ status: 'APPROVED' }))
    })
    const store = makeStore({ ...fullyStartedCheckout(), currentStep: 'finalStatus' })

    const outcome = await store.dispatch(restoreProgress()).unwrap()

    expect(outcome).toBe('verifying')
    const checkout = store.getState().checkout
    expect(checkout.currentStep).toBe('finalStatus')
    expect(checkout.paymentStatus).toBe('approved')
    expect(checkout.transaction?.status).toBe('APPROVED')
  })

  it('discards the document and starts over when the restored transaction is unknown (FR-011)', async () => {
    const map = new Map<string, string>()
    const storage: StorageLike = {
      getItem: (key) => (map.has(key) ? map.get(key)! : null),
      setItem: jest.fn((key, value) => void map.set(key, value)),
      removeItem: jest.fn((key) => void map.delete(key)),
    }
    mockedHttpRequest.mockImplementation((path: string) => {
      if (path.startsWith('/products/')) return Promise.resolve(buildProduct(10))
      return Promise.resolve(createApiError('notFound'))
    })
    const store = makeStore({
      ...fullyStartedCheckout(),
      currentStep: 'finalStatus',
    })
    map.set(
      PERSISTENCE_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        savedAt: new Date().toISOString(),
        ...fullyStartedCheckout(),
      }),
    )
    subscribeCheckoutProgress(store, storage)

    const outcome = await store.dispatch(restoreProgress()).unwrap()

    expect(outcome).toBe('discarded')
    expect(store.getState().checkout.transactionId).toBeNull()
    expect(store.getState().checkout.idempotencyKey).toBeNull()
    expect(storage.removeItem).toHaveBeenCalledWith(PERSISTENCE_STORAGE_KEY)
    expect(map.has(PERSISTENCE_STORAGE_KEY)).toBe(false)
  })

  it('keeps the document and reports a recovery error when the lookup fails transiently', async () => {
    const map = new Map<string, string>()
    const storage: StorageLike = {
      getItem: (key) => (map.has(key) ? map.get(key)! : null),
      setItem: jest.fn((key, value) => void map.set(key, value)),
      removeItem: jest.fn((key) => void map.delete(key)),
    }
    mockedHttpRequest.mockImplementation((path: string) => {
      if (path.startsWith('/products/')) return Promise.resolve(buildProduct(10))
      return Promise.resolve(createApiError('network'))
    })
    const store = makeStore({
      ...fullyStartedCheckout(),
      currentStep: 'finalStatus',
    })
    map.set(
      PERSISTENCE_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        savedAt: new Date().toISOString(),
        ...fullyStartedCheckout(),
      }),
    )
    subscribeCheckoutProgress(store, storage)

    const outcome = await store.dispatch(restoreProgress()).unwrap()

    expect(outcome).toBe('transient')
    expect(store.getState().checkout.transactionId).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    )
    expect(store.getState().checkout.paymentError?.kind).toBe('network')
    expect(map.has(PERSISTENCE_STORAGE_KEY)).toBe(true)
  })
})

const CONFIG: CheckoutConfig = {
  publicKey: 'pub_test_abc',
  baseUrl: 'https://sandbox.gateway.test/v1',
  currency: 'COP',
  contracts: {
    terms: 'https://store.test/terms',
    personalData: 'https://store.test/personal-data',
  },
  installments: { default: 1, max: 12 },
}

const buildTransaction = (
  overrides: Partial<TransactionView> = {},
): TransactionView => ({
  id: 'tx-1',
  reference: 'REF-1',
  status: 'PENDING',
  quantity: 2,
  amounts: {
    productAmountInCents: 7000000,
    baseFeeInCents: 500000,
    deliveryFeeInCents: 1200000,
    totalInCents: 8700000,
  },
  card: null,
  product: { id: PRODUCT_ID, name: 'Wireless Mouse', quantity: 2 },
  delivery: null,
  failureReason: null,
  ...overrides,
})

/**
 * Literal `POST /transactions` response: only `id`, `reference`, `status`,
 * `quantity` and `amounts` — the enrichment comes from the read/pay endpoints.
 */
const buildCreated = (
  overrides: Partial<TransactionCreated> = {},
): TransactionCreated => ({
  id: 'tx-1',
  reference: 'REF-1',
  status: 'PENDING',
  quantity: 2,
  amounts: {
    productAmountInCents: 7000000,
    baseFeeInCents: 500000,
    deliveryFeeInCents: 1200000,
    totalInCents: 8700000,
  },
  ...overrides,
})

const DELIVERY = {
  fullName: 'Test Buyer',
  email: 'buyer@example.com',
  phone: '+57 300 000 0000',
  address: 'Calle 1 #2-3',
  city: 'Bogotá',
  region: 'Cundinamarca',
}

const makeConfigStore = () =>
  configureStore({ reducer: { checkoutConfig: checkoutConfigReducer } })

describe('loadCheckoutConfig thunk', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
  })

  it('loads the config once and stores it', async () => {
    mockedHttpRequest.mockResolvedValue(CONFIG)
    const store = makeConfigStore()

    await store.dispatch(loadCheckoutConfig()).unwrap()

    expect(mockedHttpRequest).toHaveBeenCalledWith('/payments/checkout-config')
    expect(store.getState().checkoutConfig.config).toEqual(CONFIG)
    expect(store.getState().checkoutConfig.status).toBe('success')
    expect(store.getState().checkoutConfig.error).toBeNull()
  })

  it('surfaces a 503 as providerUnavailable with a retryable status', async () => {
    mockedHttpRequest.mockResolvedValue(createApiError('providerUnavailable'))
    const store = makeConfigStore()

    const error = await store.dispatch(loadCheckoutConfig()).unwrap().catch((e) => e)

    expect(error.kind).toBe('providerUnavailable')
    expect(store.getState().checkoutConfig.status).toBe('error')
    expect(store.getState().checkoutConfig.error?.kind).toBe('providerUnavailable')
    expect(store.getState().checkoutConfig.config).toBeNull()
  })
})

describe('finalizeCheckout thunk', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
  })

  it('clears every checkout field, removes the persisted document and refetches stock', async () => {
    const map = new Map<string, string>()
    const storage: StorageLike = {
      getItem: (key) => (map.has(key) ? map.get(key)! : null),
      setItem: jest.fn((key, value) => void map.set(key, value)),
      removeItem: jest.fn((key) => void map.delete(key)),
    }
    mockedHttpRequest.mockResolvedValue(buildProduct(7))
    const store = makeStore({
      ...fullyStartedCheckout(),
      currentStep: 'finalStatus',
      paymentStatus: 'approved',
      transaction: buildTransaction({ status: 'APPROVED' }),
    })
    map.set(
      PERSISTENCE_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        savedAt: new Date().toISOString(),
        ...fullyStartedCheckout(),
      }),
    )
    subscribeCheckoutProgress(store, storage)

    await store.dispatch(finalizeCheckout()).unwrap()

    // startOver semantics: every checkout field back to the clean state.
    const cleared = store.getState().checkout
    expect(cleared.currentStep).toBe('product')
    expect(cleared.selectedProductId).toBeNull()
    expect(cleared.transactionId).toBeNull()
    expect(cleared.idempotencyKey).toBeNull()
    expect(cleared.delivery).toBeNull()
    expect(cleared.transaction).toBeNull()
    expect(cleared.paymentError).toBeNull()
    expect(cleared.paymentStatus).toBe('idle')

    // The persisted document is removed by the clear and is gone afterwards.
    expect(storage.removeItem).toHaveBeenCalledWith(PERSISTENCE_STORAGE_KEY)
    expect(map.has(PERSISTENCE_STORAGE_KEY)).toBe(false)

    // A fresh product read replaces the pre-purchase stock (FR-016, SC-006).
    expect(mockedHttpRequest).toHaveBeenCalledWith(`/products/${PRODUCT_ID}`, {
      map400ToNotFound: true,
    })
    expect(store.getState().product.product?.stock).toBe(7)
  })

  it('clears state without fetching when no product was selected', async () => {
    const store = makeStore({
      currentStep: 'product',
      selectedProductId: null,
      quantity: 1,
      delivery: null,
      transactionId: null,
      idempotencyKey: null,
      cardBrand: null,
      cardLastFour: null,
      installments: 1,
      contractsAccepted: false,
      paymentStatus: 'idle',
      paymentError: null,
    })

    await store.dispatch(finalizeCheckout()).unwrap()

    expect(mockedHttpRequest).not.toHaveBeenCalled()
  })
})

describe('createTransaction thunk', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
  })

  const args = {
    idempotencyKey: 'key-1234567890abcdef',
    productId: PRODUCT_ID,
    quantity: 2,
    delivery: DELIVERY,
  }

  it('POSTs the purchase without any amount field and returns the view', async () => {
    mockedHttpRequest.mockResolvedValue(buildCreated())
    const store = makeConfigStore()

    const created = await store.dispatch(createTransaction(args)).unwrap()

    expect(created.id).toBe('tx-1')
    expect(mockedHttpRequest).toHaveBeenCalledWith('/transactions', {
      method: 'POST',
      headers: { 'Idempotency-Key': args.idempotencyKey },
      body: {
        productId: PRODUCT_ID,
        quantity: 2,
        customer: {
          fullName: DELIVERY.fullName,
          email: DELIVERY.email,
          phone: DELIVERY.phone,
        },
        delivery: {
          address: DELIVERY.address,
          city: DELIVERY.city,
          region: DELIVERY.region,
        },
      },
    })

    const body = (mockedHttpRequest.mock.calls[0][1] as { body: Record<string, unknown> }).body
    expect(Object.keys(body)).toEqual(['productId', 'quantity', 'customer', 'delivery'])
    expect(JSON.stringify(body)).not.toMatch(/amount/i)
  })

  it('treats a 200 idempotent replay like a 201 creation', async () => {
    mockedHttpRequest.mockResolvedValue(buildCreated({ status: 'PENDING' }))
    const store = makeConfigStore()

    await expect(store.dispatch(createTransaction(args)).unwrap()).resolves.toMatchObject({
      id: 'tx-1',
    })
  })

  it('sends the identical Idempotency-Key header on every retry of the same purchase', async () => {
    mockedHttpRequest
      .mockResolvedValueOnce(createApiError('network'))
      .mockResolvedValueOnce(buildCreated())
    const store = makeConfigStore()

    await store.dispatch(createTransaction(args)).unwrap().catch(() => undefined)
    await store.dispatch(createTransaction(args)).unwrap()

    const keys = mockedHttpRequest.mock.calls.map(
      ([, options]) =>
        (options as { headers?: Record<string, string> }).headers?.[
          'Idempotency-Key'
        ],
    )
    expect(keys).toEqual([args.idempotencyKey, args.idempotencyKey])
    expect(keys[0]).toMatch(IDEMPOTENCY_KEY_PATTERN)
  })

  it.each(['soldOut', 'notFound', 'badRequest', 'idempotencyConflict', 'rateLimited'] as const)(
    'rejects with %s',
    async (kind) => {
      mockedHttpRequest.mockResolvedValue(createApiError(kind))
      const store = makeConfigStore()

      const error = await store.dispatch(createTransaction(args)).unwrap().catch((e) => e)

      expect(error.kind).toBe(kind)
    },
  )

  it('rejects a 429 rate limit once and never auto-retries (FR-008)', async () => {
    mockedHttpRequest
      .mockResolvedValueOnce(createApiError('rateLimited'))
      .mockResolvedValueOnce(buildCreated())
    const store = makeConfigStore()

    const error = await store
      .dispatch(createTransaction(args))
      .unwrap()
      .catch((e) => e)

    // One request only: rate limits are acted on manually, never hammered.
    expect(error.kind).toBe('rateLimited')
    expect(
      mockedHttpRequest.mock.calls.filter(([path]) => path === '/transactions'),
    ).toHaveLength(1)
  })
})

describe('payTransaction thunk', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
  })

  const args = {
    transactionId: 'tx-1',
    cardToken: 'tok_single_use',
    installments: 3,
  }

  it('sends the token argument and accepted contracts, never reading it from state', async () => {
    mockedHttpRequest.mockResolvedValue(buildTransaction())
    const store = makeStore(startedCheckout())

    await store.dispatch(payTransaction(args)).unwrap()

    expect(mockedHttpRequest).toHaveBeenCalledWith('/transactions/tx-1/payment', {
      method: 'POST',
      body: {
        cardToken: 'tok_single_use',
        installments: 3,
        acceptedContracts: true,
      },
    })
    expect(JSON.stringify(store.getState().checkout)).not.toContain('tok_single_use')
  })

  it('handles a 202 with the PENDING view', async () => {
    mockedHttpRequest.mockResolvedValue(buildTransaction({ status: 'PENDING' }))
    const store = makeStore(startedCheckout())

    const view = await store.dispatch(payTransaction(args)).unwrap()

    expect(view.status).toBe('PENDING')
  })

  it.each([
    'notPayable',
    'contractsNotAccepted',
    'invalidToken',
    'providerRejected',
    'providerUnavailable',
    'network',
    'rateLimited',
  ] as const)('rejects with %s so the caller can act on the token', async (kind) => {
    mockedHttpRequest.mockResolvedValue(createApiError(kind))
    const store = makeStore(startedCheckout())

    const error = await store.dispatch(payTransaction(args)).unwrap().catch((e) => e)

    expect(error.kind).toBe(kind)
  })

  it('re-calls payTransaction with the same token after a transient failure, with no new purchase', async () => {
    mockedHttpRequest
      .mockResolvedValueOnce(createApiError('providerUnavailable'))
      .mockResolvedValueOnce(buildTransaction())
    const store = makeStore(startedCheckout())

    await store.dispatch(payTransaction(args)).unwrap().catch(() => undefined)
    await store.dispatch(payTransaction(args)).unwrap()

    const paymentCalls = mockedHttpRequest.mock.calls.filter(
      ([path]) => path === '/transactions/tx-1/payment',
    )
    expect(paymentCalls).toHaveLength(2)
    for (const [, options] of paymentCalls) {
      expect((options as { body: { cardToken: string } }).body.cardToken).toBe('tok_single_use')
    }
    expect(mockedHttpRequest.mock.calls.some(([path]) => path === '/transactions')).toBe(false)
  })
  it('rejects a 502 provider rejection once; the shopper, not the thunk, retries it', async () => {
    mockedHttpRequest
      .mockResolvedValueOnce(createApiError('providerRejected'))
      .mockResolvedValueOnce(buildTransaction())
    const store = makeStore(startedCheckout())

    const error = await store
      .dispatch(payTransaction(args))
      .unwrap()
      .catch((e) => e)

    // Generic payment-rejected state, no automatic retry of the charged call.
    expect(error.kind).toBe('providerRejected')
    expect(
      mockedHttpRequest.mock.calls.filter(([path]) => String(path).endsWith('/payment')),
    ).toHaveLength(1)

    // A manual retry re-sends the same token; the server reconciles.
    await store.dispatch(payTransaction(args)).unwrap()
    expect(
      mockedHttpRequest.mock.calls.filter(([path]) => String(path).endsWith('/payment')),
    ).toHaveLength(2)
  })
})

describe('readTransactionStatus thunk', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
  })

  const pendingCheckout = (): CheckoutState => ({
    ...startedCheckout(),
    currentStep: 'finalStatus',
    transactionId: 'tx-1',
    idempotencyKey: 'key-1234567890abcdef',
    paymentStatus: 'pending',
  })

  it('GETs the transaction and stores the view and its payment status', async () => {
    mockedHttpRequest.mockResolvedValue(buildTransaction({ status: 'APPROVED' }))
    const store = makeStore(pendingCheckout())

    await store.dispatch(readTransactionStatus('tx-1')).unwrap()

    expect(mockedHttpRequest).toHaveBeenCalledWith('/transactions/tx-1', {
      map400ToNotFound: true,
    })
    expect(store.getState().checkout.transaction?.status).toBe('APPROVED')
    expect(store.getState().checkout.paymentStatus).toBe('approved')
    expect(store.getState().checkout.paymentError).toBeNull()
  })

  it('keeps the pending status while the provider has not settled', async () => {
    mockedHttpRequest.mockResolvedValue(buildTransaction({ status: 'PENDING' }))
    const store = makeStore(pendingCheckout())

    await store.dispatch(readTransactionStatus('tx-1')).unwrap()

    expect(store.getState().checkout.paymentStatus).toBe('pending')
  })

  it('rejects with notFound for an unknown transaction id and surfaces a final error', async () => {
    mockedHttpRequest.mockResolvedValue(createApiError('notFound'))
    const store = makeStore(pendingCheckout())

    const error = await store
      .dispatch(readTransactionStatus('missing'))
      .unwrap()
      .catch((e) => e)

    expect(error.kind).toBe('notFound')
    expect(store.getState().checkout.paymentStatus).toBe('error')
    expect(store.getState().checkout.paymentError?.kind).toBe('notFound')
  })

  it('stays pending on a transient read failure so it can retry', async () => {
    mockedHttpRequest.mockResolvedValue(createApiError('network'))
    const store = makeStore(pendingCheckout())

    await store.dispatch(readTransactionStatus('tx-1')).unwrap().catch(() => undefined)

    expect(store.getState().checkout.paymentStatus).toBe('pending')
    expect(store.getState().checkout.paymentError?.kind).toBe('network')
  })

  it('ignores an out-of-order response so only the latest read applies', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined
    let resolveSecond: (value: unknown) => void = () => undefined
    mockedHttpRequest
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveFirst = resolve
        }),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveSecond = resolve
        }),
      )
    const store = makeStore(pendingCheckout())

    const first = store.dispatch(readTransactionStatus('tx-1'))
    const second = store.dispatch(readTransactionStatus('tx-1'))

    resolveSecond(buildTransaction({ status: 'APPROVED' }))
    await second
    resolveFirst(buildTransaction({ status: 'PENDING' }))
    await first

    expect(store.getState().checkout.transaction?.status).toBe('APPROVED')
    expect(store.getState().checkout.paymentStatus).toBe('approved')
  })
})

describe('retryPurchase thunk', () => {
  it('clears the final transaction and issues a new key before retrying', async () => {
    const store = makeStore({
      ...fullyStartedCheckout(),
      currentStep: 'finalStatus',
      transactionId: 'tx-final',
      transaction: buildTransaction({ status: 'DECLINED' }),
      paymentStatus: 'declined',
      paymentError: createApiError('badRequest'),
    })
    const previousKey = store.getState().checkout.idempotencyKey

    await store.dispatch(retryPurchase())

    const state = store.getState().checkout
    expect(state.currentStep).toBe('cardAndDelivery')
    expect(state.transactionId).toBeNull()
    expect(state.transaction).toBeNull()
    expect(state.paymentStatus).toBe('idle')
    expect(state.paymentError).toBeNull()
    expect(state.idempotencyKey).not.toBe(previousKey)
    expect(state.idempotencyKey).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(state.selectedProductId).toBe(PRODUCT_ID)
    expect(state.quantity).toBe(3)
    expect(state.delivery).toEqual(DELIVERY_RESTORED)
  })
})

describe('ensureIdempotencyKey thunk', () => {
  it('generates a key matching the pattern when none exists', async () => {
    const store = makeStore(startedCheckout())

    const key = await store.dispatch(ensureIdempotencyKey()).unwrap()

    expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(store.getState().checkout.idempotencyKey).toBe(key)
  })

  it('reuses the existing key instead of generating a new one', async () => {
    const store = makeStore(fullyStartedCheckout())
    const previous = store.getState().checkout.idempotencyKey

    const key = await store.dispatch(ensureIdempotencyKey()).unwrap()

    expect(key).toBe(previous)
    expect(store.getState().checkout.idempotencyKey).toBe(previous)
  })
})