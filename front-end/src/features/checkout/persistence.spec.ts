import { configureStore } from '@reduxjs/toolkit'
import checkoutReducer, {
  purchaseStarted,
  quantityChanged,
  restored,
  startOver,
  type CheckoutState,
  type DeliveryData,
} from '@/features/checkout/checkout.slice'
import {
  PERSISTENCE_MAX_AGE_MS,
  PERSISTENCE_STORAGE_KEY,
  PERSISTENCE_VERSION,
  loadPersistedProgress,
  subscribeCheckoutProgress,
  toCheckoutState,
  type PersistedProgress,
  type StorageLike,
} from '@/features/checkout/persistence'
import { INSTALLMENTS_DEFAULT } from '@/shared/constants'

const CARD_LIKE = /card|cvc|cvv|pan|number|expiry|expiration|security/i

const collectKeys = (value: unknown): string[] => {
  const keys: string[] = []
  const walk = (v: unknown) => {
    if (typeof v !== 'object' || v === null) {
      return
    }
    for (const key of Object.keys(v)) {
      keys.push(key)
      walk((v as Record<string, unknown>)[key])
    }
  }
  walk(value)
  return keys
}

const expectNoCardLikeKeys = (value: unknown) => {
  const offending = collectKeys(value).filter((key) => CARD_LIKE.test(key))
  expect(offending).toEqual([])
}

const validStored = (overrides: Partial<PersistedProgress> = {}): PersistedProgress => ({
  version: PERSISTENCE_VERSION,
  savedAt: new Date().toISOString(),
  currentStep: 'product',
  selectedProductId: '11111111-1111-4111-8111-111111111111',
  quantity: 3,
  delivery: null,
  transactionId: null,
  idempotencyKey: null,
  ...overrides,
})

const createFakeStorage = (seeded: Record<string, string> = {}) => {
  const map = new Map(Object.entries(seeded))
  const storage = {
    getItem: jest.fn((key: string) => (map.has(key) ? map.get(key)! : null)),
    setItem: jest.fn((key: string, value: string) => void map.set(key, value)),
    removeItem: jest.fn((key: string) => void map.delete(key)),
  }
  return { storage, map }
}

const makeCheckoutStore = (preloadedState?: { checkout: CheckoutState }) =>
  configureStore({
    reducer: { checkout: checkoutReducer },
    preloadedState,
  })

describe('loadPersistedProgress', () => {
  it('returns null and touches nothing when there is no stored document', () => {
    const { storage } = createFakeStorage()
    expect(loadPersistedProgress(storage)).toBeNull()
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it('returns null without throwing when storage is blocked', () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {},
      removeItem: () => {},
    }
    expect(loadPersistedProgress(blocked)).toBeNull()
  })

  it('returns the validated document', () => {
    const stored = validStored({
      delivery: {
        fullName: 'Ana Pérez',
        email: 'ana@example.com',
        phone: '+573000000000',
        address: 'Calle 1 #2-3',
        city: 'Bogotá',
        region: 'Cundinamarca',
      },
      transactionId: 'tx-1',
    })
    const { storage } = createFakeStorage({ [PERSISTENCE_STORAGE_KEY]: JSON.stringify(stored) })

    const loaded = loadPersistedProgress(storage)

    expect(loaded).toEqual({
      version: PERSISTENCE_VERSION,
      currentStep: 'product',
      selectedProductId: stored.selectedProductId,
      quantity: 3,
      delivery: stored.delivery,
      transactionId: 'tx-1',
      idempotencyKey: null,
    })
  })

  it('loads a valid idempotency key from a version-2 document', () => {
    const stored = validStored({ idempotencyKey: 'Abcdefghijklmnop1234' })
    const { storage } = createFakeStorage({
      [PERSISTENCE_STORAGE_KEY]: JSON.stringify(stored),
    })

    expect(loadPersistedProgress(storage)?.idempotencyKey).toBe(
      'Abcdefghijklmnop1234',
    )
  })

  it('turns a stored document into a preloaded checkout state', () => {
    const stored = validStored()
    const { storage } = createFakeStorage({ [PERSISTENCE_STORAGE_KEY]: JSON.stringify(stored) })
    const loaded = loadPersistedProgress(storage)
    const preloaded = toCheckoutState(loaded!)
    expect(preloaded).toEqual({
      currentStep: 'product',
      selectedProductId: stored.selectedProductId,
      quantity: 3,
      delivery: null,
      transactionId: null,
      idempotencyKey: null,
      cardBrand: null,
      cardLastFour: null,
      installments: INSTALLMENTS_DEFAULT,
      contractsAccepted: false,
      paymentStatus: 'idle',
      paymentError: null,
      transaction: null,
      lastReadRequestId: null,
    })
  })

  it('preloads the verifying state when a transaction id was restored', () => {
    const stored = validStored({
      currentStep: 'finalStatus',
      transactionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      idempotencyKey: 'Abcdefghijklmnop1234',
    })
    const { storage } = createFakeStorage({
      [PERSISTENCE_STORAGE_KEY]: JSON.stringify(stored),
    })

    const preloaded = toCheckoutState(loadPersistedProgress(storage)!)

    expect(preloaded.currentStep).toBe('finalStatus')
    expect(preloaded.transactionId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(preloaded.paymentStatus).toBe('pending')
    expect(preloaded.transaction).toBeNull()
  })

  it.each([
    ['not valid JSON', '{{'],
    ['wrong version', JSON.stringify(validStored({ version: 99 }))],
    ['version 1 (old schema)', JSON.stringify(validStored({ version: 1 }))],
    ['version not an integer', JSON.stringify(validStored({ version: 1.5 }))],
    [
      'missing savedAt',
      JSON.stringify({ ...validStored(), savedAt: undefined }),
    ],
    [
      'savedAt not a date',
      JSON.stringify(validStored({ savedAt: 'tomorrow' })),
    ],
    [
      'expired beyond 24 hours',
      JSON.stringify(
        validStored({
          savedAt: new Date(Date.now() - PERSISTENCE_MAX_AGE_MS - 1).toISOString(),
        }),
      ),
    ],
    [
      'inconsistent currentStep',
      JSON.stringify(validStored({ currentStep: 'unknown' as unknown as 'product' })),
    ],
    [
      'no purchase started (null product)',
      JSON.stringify(validStored({ selectedProductId: null })),
    ],
    [
      'no purchase started (missing quantity)',
      JSON.stringify({ ...validStored(), quantity: undefined }),
    ],
    [
      'quantity below one',
      JSON.stringify(validStored({ quantity: 0 })),
    ],
    [
      'quantity not an integer',
      JSON.stringify(validStored({ quantity: 2.7 })),
    ],
    [
      'quantity above ten',
      JSON.stringify(validStored({ quantity: 11 })),
    ],
    [
      'delivery with an extra key',
      JSON.stringify(
        validStored({
          delivery: {
            fullName: 'Ana Pérez',
            email: 'ana@example.com',
            phone: '+573000000000',
            address: 'Calle 1 #2-3',
            city: 'Bogotá',
            region: 'Cundinamarca',
            cardNumber: '4111111111111111',
          } as unknown as DeliveryData,
        }),
      ),
    ],
    [
      'transaction id not a string',
      JSON.stringify(validStored({ transactionId: 5 as unknown as string })),
    ],
    [
      'missing idempotency key',
      JSON.stringify({ ...validStored(), idempotencyKey: undefined }),
    ],
    [
      'idempotency key too short',
      JSON.stringify(validStored({ idempotencyKey: 'short' })),
    ],
    [
      'idempotency key with disallowed characters',
      JSON.stringify(validStored({ idempotencyKey: 'has spaces and !!!!!!' })),
    ],
    [
      'idempotency key not a string',
      JSON.stringify(validStored({ idempotencyKey: 7 as unknown as string })),
    ],
  ])('discards and clears the stored item when: %s', (_description, raw) => {
    const { storage } = createFakeStorage({ [PERSISTENCE_STORAGE_KEY]: String(raw) })

    expect(loadPersistedProgress(storage)).toBeNull()
    expect(storage.removeItem).toHaveBeenCalledWith(PERSISTENCE_STORAGE_KEY)
  })

  it('ignores unknown top-level keys but still discards invalid core fields', () => {
    const stored = validStored()
    const withNoise = { ...stored, someCardNumber: 'x' }
    const { storage } = createFakeStorage({
      [PERSISTENCE_STORAGE_KEY]: JSON.stringify(withNoise),
    })

    const loaded = loadPersistedProgress(storage)
    expect(loaded).toMatchObject({
      selectedProductId: stored.selectedProductId,
      quantity: 3,
    })
  })

  it('discards a document that is not an object', () => {
    const { storage } = createFakeStorage({ [PERSISTENCE_STORAGE_KEY]: '"nope"' })

    expect(loadPersistedProgress(storage)).toBeNull()
    expect(storage.removeItem).toHaveBeenCalledWith(PERSISTENCE_STORAGE_KEY)
  })

  it.each([
    ['delivery is an array', [1, 2, 3]],
    ['delivery is a string', 'delivery'],
    ['delivery misses a required field', { fullName: 'Ana', email: 'a@b.com' }],
    [
      'delivery notes has the wrong type',
      {
        fullName: 'Ana',
        email: 'a@b.com',
        phone: '1',
        address: 'a',
        city: 'b',
        region: 'c',
        notes: 7,
      },
    ],
  ])('discards when %s', (_description, delivery) => {
    const { storage } = createFakeStorage({
      [PERSISTENCE_STORAGE_KEY]: JSON.stringify(
        validStored({ delivery: delivery as unknown as DeliveryData }),
      ),
    })

    expect(loadPersistedProgress(storage)).toBeNull()
    expect(storage.removeItem).toHaveBeenCalledWith(PERSISTENCE_STORAGE_KEY)
  })

  it('keeps the optional delivery notes when they are a string', () => {
    const { storage } = createFakeStorage({
      [PERSISTENCE_STORAGE_KEY]: JSON.stringify(
        validStored({
          delivery: {
            fullName: 'Ana',
            email: 'a@b.com',
            phone: '1',
            address: 'a',
            city: 'b',
            region: 'c',
            notes: 'ring the bell',
          },
        }),
      ),
    })

    const loaded = loadPersistedProgress(storage)
    expect(loaded?.delivery).toMatchObject({ notes: 'ring the bell' })
  })

  it('returns null when there is no storage available', () => {
    expect(loadPersistedProgress(null as unknown as undefined)).toBeNull()
    expect(loadPersistedProgress()).toBeNull()
  })

  it('returns null when reading storage throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })

    try {
      expect(loadPersistedProgress()).toBeNull()
      expect(() => subscribeCheckoutProgress(makeCheckoutStore())).not.toThrow()
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'localStorage', descriptor)
      }
    }
  })
})

describe('subscribeCheckoutProgress', () => {
  it('writes nothing on startup and for unrelated changes', () => {
    const { storage, map } = createFakeStorage()
    const store = makeCheckoutStore()
    subscribeCheckoutProgress(store, storage)

    store.dispatch({ type: 'noop' })
    store.dispatch(quantityChanged(4))

    expect(storage.setItem).not.toHaveBeenCalled()
    expect(map.size).toBe(0)

    const unsubscribe = subscribeCheckoutProgress(store, storage)
    expect(typeof unsubscribe).toBe('function')
  })

  it('does nothing when no storage is available', () => {
    const store = makeCheckoutStore()
    subscribeCheckoutProgress(store, null as unknown as undefined)

    expect(() =>
      store.dispatch(purchaseStarted({ productId: 'p-1', quantity: 2 })),
    ).not.toThrow()
  })

  it('writes the versioned whitelist the first time a purchase starts', () => {
    const { storage, map } = createFakeStorage()
    const store = makeCheckoutStore()
    subscribeCheckoutProgress(store, storage)

    store.dispatch(purchaseStarted({ productId: 'p-1', quantity: 2 }))

    expect(storage.setItem).toHaveBeenCalledTimes(1)
    const raw = map.get(PERSISTENCE_STORAGE_KEY)!
    expect(raw).toBeTruthy()

    const written = JSON.parse(raw) as PersistedProgress
    expect(Object.keys(written).sort()).toEqual([
      'currentStep',
      'delivery',
      'idempotencyKey',
      'quantity',
      'savedAt',
      'selectedProductId',
      'transactionId',
      'version',
    ])
    expect(written.version).toBe(PERSISTENCE_VERSION)
    expect(written.currentStep).toBe('product')
    expect(written.selectedProductId).toBe('p-1')
    expect(written.quantity).toBe(2)
    expect(written.delivery).toBeNull()
    expect(written.transactionId).toBeNull()
    expect(written.idempotencyKey).toBeNull()
    expect(typeof written.savedAt).toBe('string')
    expect(Number.isNaN(Date.parse(written.savedAt))).toBe(false)
  })

  it('does not write again when the whitelisted part is unchanged', () => {
    const { storage } = createFakeStorage()
    const store = makeCheckoutStore()
    subscribeCheckoutProgress(store, storage)

    store.dispatch(purchaseStarted({ productId: 'p-1', quantity: 2 }))
    const writes = storage.setItem.mock.calls.length

    store.dispatch({ type: 'some/unrelated-action' })
    store.dispatch(quantityChanged(2))

    expect(storage.setItem.mock.calls.length).toBe(writes)
  })

  it('writes again when the whitelisted part changes and refreshes savedAt', () => {
    jest.useFakeTimers()
    const { storage, map } = createFakeStorage()
    const store = makeCheckoutStore()
    subscribeCheckoutProgress(store, storage)

    store.dispatch(purchaseStarted({ productId: 'p-1', quantity: 2 }))
    const firstSavedAt = (
      JSON.parse(map.get(PERSISTENCE_STORAGE_KEY)!) as PersistedProgress
    ).savedAt

    jest.advanceTimersByTime(60_000)
    store.dispatch(quantityChanged(5))

    const second = JSON.parse(map.get(PERSISTENCE_STORAGE_KEY)!) as PersistedProgress
    expect(second.quantity).toBe(5)
    expect(second.selectedProductId).toBe('p-1')
    expect(second.savedAt).not.toBe(firstSavedAt)
    jest.useRealTimers()
  })

  it('is initialized with the validated document so it never overwrites progress with an empty state', () => {
    const stored = validStored()
    const { storage } = createFakeStorage({ [PERSISTENCE_STORAGE_KEY]: JSON.stringify(stored) })
    const store = makeCheckoutStore({ checkout: toCheckoutState(loadPersistedProgress(storage)!) })
    subscribeCheckoutProgress(store, storage)

    store.dispatch(restored(toCheckoutState(loadPersistedProgress(storage)!)))

    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it('never writes while no purchase is started and clears stored progress on startOver', () => {
    const stored = validStored()
    const { storage } = createFakeStorage({ [PERSISTENCE_STORAGE_KEY]: JSON.stringify(stored) })
    const store = makeCheckoutStore({
      checkout: {
        ...toCheckoutState(stored),
        currentStep: 'summary',
      },
    })
    subscribeCheckoutProgress(store, storage)

    store.dispatch(startOver())

    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.removeItem).toHaveBeenCalledWith(PERSISTENCE_STORAGE_KEY)
  })

  it('survives storage that throws on write', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => {},
    }
    const store = makeCheckoutStore()
    subscribeCheckoutProgress(store, storage)

    expect(() => store.dispatch(purchaseStarted({ productId: 'p', quantity: 1 }))).not.toThrow()
  })

  it('survives storage that throws on remove', () => {
    const stored = validStored()
    const storage: StorageLike = {
      getItem: () => JSON.stringify(stored),
      setItem: () => {},
      removeItem: () => {
        throw new Error('cannot remove')
      },
    }
    const store = makeCheckoutStore({ checkout: toCheckoutState(stored) })
    subscribeCheckoutProgress(store, storage)

    expect(() => store.dispatch(startOver())).not.toThrow()
  })
})

describe('serialized document invariant', () => {
  it('persists only whitelisted keys with no card-like names', () => {
    const { storage, map } = createFakeStorage()
    const store = makeCheckoutStore()
    subscribeCheckoutProgress(store, storage)

    store.dispatch(
      purchaseStarted({
        productId: '11111111-1111-4111-8111-111111111111',
        quantity: 2,
      }),
    )

    const raw = map.get(PERSISTENCE_STORAGE_KEY)!
    expectNoCardLikeKeys(raw)
    const parsed = JSON.parse(raw) as unknown
    expectNoCardLikeKeys(parsed)
    expect(Object.keys(parsed as object)).toEqual([
      'version',
      'currentStep',
      'selectedProductId',
      'quantity',
      'delivery',
      'transactionId',
      'idempotencyKey',
      'savedAt',
    ])
  })

  it('keeps card-like keys out of a document written with delivery data', () => {
    const { storage, map } = createFakeStorage()
    const store = makeCheckoutStore()
    subscribeCheckoutProgress(store, storage)

    store.dispatch(
      purchaseStarted({ productId: '11111111-1111-4111-8111-111111111111', quantity: 1 }),
    )
    store.dispatch(
      restored({
        currentStep: 'summary',
        selectedProductId: '11111111-1111-4111-8111-111111111111',
        quantity: 1,
        delivery: {
          fullName: 'Test Buyer',
          email: 'buyer@example.com',
          phone: '+57 300 000 0000',
          address: 'Calle 1 #2-3',
          city: 'Bogotá',
          region: 'Cundinamarca',
          notes: 'At the door',
        },
        transactionId: 'tx-9',
      }),
    )

    const parsed = JSON.parse(map.get(PERSISTENCE_STORAGE_KEY)!) as unknown
    expectNoCardLikeKeys(parsed)
  })
})