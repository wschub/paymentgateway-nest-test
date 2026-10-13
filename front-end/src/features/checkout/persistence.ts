import {
  IDEMPOTENCY_KEY_PATTERN,
  INSTALLMENTS_DEFAULT,
  MAX_QUANTITY_PER_PURCHASE,
} from '@/shared/constants'
import type {
  CheckoutState,
  CheckoutStep,
  DeliveryData,
} from '@/features/checkout/checkout.slice'

export const PERSISTENCE_STORAGE_KEY = 'checkout-progress'
export const PERSISTENCE_VERSION = 2
export const PERSISTENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface StorableCheckout {
  version: number
  currentStep: CheckoutStep
  selectedProductId: string | null
  quantity: number
  delivery: DeliveryData | null
  transactionId: string | null
  idempotencyKey: string | null
}

export interface PersistedProgress extends StorableCheckout {
  savedAt: string
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface CheckoutProgressStore {
  getState(): { checkout: CheckoutState }
  subscribe(listener: () => void): () => void
}

const VALID_STEPS: readonly CheckoutStep[] = [
  'product',
  'cardAndDelivery',
  'summary',
  'finalStatus',
]

const DELIVERY_KEYS: readonly string[] = [
  'fullName',
  'email',
  'phone',
  'address',
  'city',
  'region',
  'notes',
]

const defaultStorage = (): StorageLike | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function toStorableCheckout(state: CheckoutState): StorableCheckout {
  return {
    version: PERSISTENCE_VERSION,
    currentStep: state.currentStep,
    selectedProductId: state.selectedProductId,
    quantity: state.quantity,
    delivery: state.delivery,
    transactionId: state.transactionId,
    idempotencyKey: state.idempotencyKey,
  }
}

export function toPersistedDocument(
  state: CheckoutState,
  savedAt = new Date().toISOString(),
): PersistedProgress {
  return { ...toStorableCheckout(state), savedAt }
}

export function toCheckoutState(doc: StorableCheckout): CheckoutState {
  return {
    currentStep: doc.currentStep,
    selectedProductId: doc.selectedProductId,
    quantity: doc.quantity,
    delivery: doc.delivery,
    transactionId: doc.transactionId,
    idempotencyKey: doc.idempotencyKey,
    cardBrand: null,
    cardLastFour: null,
    installments: INSTALLMENTS_DEFAULT,
    contractsAccepted: false,
    paymentStatus: doc.transactionId ? 'pending' : 'idle',
    paymentError: null,
    transaction: null,
    lastReadRequestId: null,
  }
}

export function isPurchaseStarted(value: {
  selectedProductId: unknown
  quantity: unknown
}): boolean {
  return (
    typeof value.selectedProductId === 'string' &&
    value.selectedProductId.length > 0 &&
    typeof value.quantity === 'number' &&
    Number.isInteger(value.quantity) &&
    value.quantity >= 1 &&
    value.quantity <= MAX_QUANTITY_PER_PURCHASE
  )
}

export function shallowStorableEqual(
  a: StorableCheckout | null,
  b: StorableCheckout | null,
): boolean {
  if (a === null || b === null) {
    return a === b
  }
  return (
    a.version === b.version &&
    a.currentStep === b.currentStep &&
    a.selectedProductId === b.selectedProductId &&
    a.quantity === b.quantity &&
    a.delivery === b.delivery &&
    a.transactionId === b.transactionId &&
    a.idempotencyKey === b.idempotencyKey
  )
}

function isValidDelivery(value: unknown): value is DeliveryData | null {
  if (value === null) {
    return true
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (!keys.every((key) => DELIVERY_KEYS.includes(key))) {
    return false
  }
  const required: readonly string[] = [
    'fullName',
    'email',
    'phone',
    'address',
    'city',
    'region',
  ]
  if (!required.every((key) => typeof record[key] === 'string')) {
    return false
  }
  const notes = record.notes
  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    return false
  }
  return true
}

function normalizeDelivery(value: DeliveryData | null): DeliveryData | null {
  if (value === null) {
    return null
  }
  const { notes, ...rest } = value
  if (notes !== undefined && notes !== null) {
    return { ...rest, notes }
  }
  return rest
}

function isValidIdempotencyKey(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && IDEMPOTENCY_KEY_PATTERN.test(value))
}

export function loadPersistedProgress(
  storage: StorageLike | undefined = defaultStorage(),
): StorableCheckout | null {
  if (!storage) {
    return null
  }

  let raw: string | null
  try {
    raw = storage.getItem(PERSISTENCE_STORAGE_KEY)
  } catch {
    return null
  }
  if (raw === null) {
    return null
  }

  const discard = () => {
    try {
      storage.removeItem(PERSISTENCE_STORAGE_KEY)
    } catch {
      // storage failure must never break the app
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    discard()
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    discard()
    return null
  }

  const record = parsed as Record<string, unknown>

  if (record.version !== PERSISTENCE_VERSION) {
    discard()
    return null
  }

  const savedAt = record.savedAt
  if (typeof savedAt !== 'string' || Number.isNaN(Date.parse(savedAt))) {
    discard()
    return null
  }
  const age = Date.now() - Date.parse(savedAt)
  if (!Number.isFinite(age) || age > PERSISTENCE_MAX_AGE_MS) {
    discard()
    return null
  }

  const currentStep = record.currentStep
  if (
    typeof currentStep !== 'string' ||
    !(VALID_STEPS as readonly string[]).includes(currentStep)
  ) {
    discard()
    return null
  }

  const selectedProductId = record.selectedProductId
  const quantity = record.quantity
  if (
    !isPurchaseStarted({ selectedProductId, quantity })
  ) {
    discard()
    return null
  }

  if (!isValidDelivery(record.delivery)) {
    discard()
    return null
  }

  const transactionId = record.transactionId
  if (transactionId !== null && typeof transactionId !== 'string') {
    discard()
    return null
  }

  const idempotencyKey = record.idempotencyKey
  if (!isValidIdempotencyKey(idempotencyKey)) {
    discard()
    return null
  }

  return {
    version: PERSISTENCE_VERSION,
    currentStep: currentStep as CheckoutStep,
    selectedProductId: selectedProductId as string,
    quantity: quantity as number,
    delivery: normalizeDelivery(record.delivery as DeliveryData | null),
    transactionId: transactionId as string | null,
    idempotencyKey,
  }
}

export function subscribeCheckoutProgress(
  store: CheckoutProgressStore,
  storage: StorageLike | undefined = defaultStorage(),
): () => void {
  let lastWritten: StorableCheckout | null = null
  if (storage) {
    lastWritten = loadPersistedProgress(storage)
  }

  return store.subscribe(() => {
    if (!storage) {
      return
    }
    const candidate = toStorableCheckout(store.getState().checkout)

    if (!isPurchaseStarted(candidate)) {
      try {
        if (storage.getItem(PERSISTENCE_STORAGE_KEY) !== null) {
          storage.removeItem(PERSISTENCE_STORAGE_KEY)
        }
      } catch {
        // storage failure must never break the app
      }
      lastWritten = null
      return
    }

    if (shallowStorableEqual(lastWritten, candidate)) {
      return
    }

    try {
      storage.setItem(
        PERSISTENCE_STORAGE_KEY,
        JSON.stringify(toPersistedDocument(store.getState().checkout)),
      )
      lastWritten = candidate
    } catch {
      // storage failure must never break the app
    }
  })
}
