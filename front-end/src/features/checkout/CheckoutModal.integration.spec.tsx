import type { ReactElement } from 'react'
import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { CheckoutModal } from '@/features/checkout/CheckoutModal'
import { createAppStore, type AppStore } from '@/app/store'
import type { CheckoutState } from '@/features/checkout/checkout.slice'
import {
  PERSISTENCE_STORAGE_KEY,
  toCheckoutState,
  type StorageLike,
} from '@/features/checkout/persistence'
import { IDEMPOTENCY_KEY_PATTERN } from '@/shared/constants'
import type {
  CheckoutConfig,
  TransactionStatus,
  TransactionView,
} from '@/features/checkout/checkout.types'
import { API_URL } from '@/config'

/**
 * End-to-end US3 edge-case tests. Unlike `CheckoutModal.spec.tsx` (which mocks
 * the child components and the HTTP client), this suite wires the real modal,
 * form, thunks and store together and only mocks global `fetch`, so it
 * exercises the actual request bodies and the token/key lifecycle.
 */

const CARD_NUMBER = '4242424242424242'
const SPACED_CARD_NUMBER = '4242 4242 4242 4242'
const CVC = '123'
const PRODUCT_ID = 'p1'
const START_KEY = 'key-abcdefghijklmnop'

const CONFIG: CheckoutConfig = {
  publicKey: 'pk_test',
  baseUrl: 'https://pay.test',
  currency: 'COP',
  contracts: {
    terms: 'https://pay.test/terms',
    personalData: 'https://pay.test/privacy',
  },
  installments: { default: 1, max: 12 },
}

/**
 * Literal transaction view (contract): the body of `POST /transactions/:id/payment`
 * (202 while pending, 200 when final) and `GET /transactions/:id` (200) — all the
 * enrichment keys are present. Delivery is `ASSIGNED` only when approved.
 */
function view(
  status: TransactionStatus = 'PENDING',
  overrides: Partial<TransactionView> = {},
): TransactionView {
  return {
    id: 'tx-1',
    reference: 'REF-1',
    status,
    quantity: 2,
    amounts: {
      productAmountInCents: 7000000,
      baseFeeInCents: 500000,
      deliveryFeeInCents: 1200000,
      totalInCents: 8700000,
    },
    card: null,
    product: { id: PRODUCT_ID, name: 'Mouse', quantity: 2 },
    delivery: {
      status: status === 'APPROVED' ? 'ASSIGNED' : 'PENDING',
      address: 'Calle 10 #23',
      city: 'Bogotá',
      region: 'Cundinamarca',
    },
    failureReason: null,
    ...overrides,
  }
}

interface RecordedCall {
  url: string
  method: string
  body: unknown
}

let recorded: RecordedCall[]
let createdSeq: number
let tokenSeq: number
let paymentQueue: Array<{ status: number; body?: unknown }>
let readBody: TransactionView | undefined

function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () =>
      Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response
}

const fetchMock = jest.fn(
  (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    let parsedBody: unknown
    if (typeof init?.body === 'string') {
      try {
        parsedBody = JSON.parse(init.body)
      } catch {
        parsedBody = init.body
      }
    }
    recorded.push({ url, method, body: parsedBody })

    const path = url.startsWith(API_URL)
      ? url.slice(API_URL.length)
      : new URL(url).pathname

    if (path === '/tokens/cards') {
      tokenSeq += 1
      return Promise.resolve(
        jsonResponse(200, {
          data: { id: `tok_${tokenSeq}`, brand: 'VISA', last_four: '4242' },
        }),
      )
    }
    if (path === '/payments/checkout-config') {
      return Promise.resolve(jsonResponse(200, CONFIG))
    }
    if (/^\/transactions\/[^/]+\/payment$/.test(path)) {
      const next = paymentQueue.shift() ?? { status: 202, body: view() }
      return Promise.resolve(jsonResponse(next.status, next.body))
    }
    if (path === '/transactions') {
      createdSeq += 1
      // Literal `POST /transactions` 201 body (contract): no product, card,
      // delivery or failureReason — those only come from `GET /transactions/:id`.
      return Promise.resolve(
        jsonResponse(201, {
          id: `tx-${createdSeq}`,
          reference: `REF-${createdSeq}`,
          status: 'PENDING',
          quantity: 2,
          amounts: {
            productAmountInCents: 7000000,
            baseFeeInCents: 500000,
            deliveryFeeInCents: 1200000,
            totalInCents: 8700000,
          },
        }),
      )
    }
    if (/^\/transactions\/[^/]+$/.test(path)) {
      return Promise.resolve(jsonResponse(200, readBody ?? view()))
    }
    return Promise.resolve(jsonResponse(404, { code: 'NOT_FOUND' }))
  },
)

interface FakeStorage extends StorageLike {
  data: Record<string, string>
}

function createStorage(): FakeStorage {
  const data: Record<string, string> = {}
  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = String(value)
    },
    removeItem: (key: string) => {
      delete data[key]
    },
  }
}

const onClose = jest.fn()

function renderModal(
  overrides: Partial<CheckoutState> = {},
  storage: FakeStorage = createStorage(),
): { store: AppStore; storage: FakeStorage } {
  const store = createAppStore({
    storage,
    preloadedState: {
      checkout: {
        currentStep: 'cardAndDelivery',
        selectedProductId: PRODUCT_ID,
        quantity: 2,
        delivery: null,
        transactionId: null,
        idempotencyKey: START_KEY,
        cardBrand: null,
        cardLastFour: null,
        installments: 1,
        contractsAccepted: false,
        paymentStatus: 'idle',
        paymentError: null,
        transaction: null,
        lastReadRequestId: null,
        ...overrides,
      },
      checkoutConfig: { config: null, status: 'idle', error: null },
      product: {
        product: {
          id: PRODUCT_ID,
          name: 'Mouse',
          description: 'Un mouse',
          priceInCents: 3500000,
          stock: 10,
          imageUrl: '',
        },
        status: 'success',
        error: null,
        quantity: 2,
        requestId: null,
        lastReadAt: null,
      },
    },
  })
  const element: ReactElement = (
    <Provider store={store}>
      <Harness />
    </Provider>
  )
  render(element)
  return { store, storage }
}

function Harness(): ReactElement {
  const [open, setOpen] = useState(true)
  return (
    <CheckoutModal
      open={open}
      onClose={() => {
        onClose()
        setOpen(false)
      }}
    />
  )
}

function fillForm(cardNumber: string = CARD_NUMBER): void {
  fireEvent.change(screen.getByLabelText('Nombre completo'), {
    target: { value: 'Juan Pérez' },
  })
  fireEvent.change(screen.getByLabelText('Correo electrónico'), {
    target: { value: 'juan@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Teléfono'), {
    target: { value: '3000000000' },
  })
  fireEvent.change(screen.getByLabelText('Dirección'), {
    target: { value: 'Calle 10 #23' },
  })
  fireEvent.change(screen.getByLabelText('Ciudad'), {
    target: { value: 'Bogotá' },
  })
  fireEvent.change(screen.getByLabelText('Departamento'), {
    target: { value: 'Cundinamarca' },
  })
  fireEvent.change(screen.getByLabelText('Número de tarjeta'), {
    target: { value: cardNumber },
  })
  fireEvent.change(screen.getByLabelText('Vencimiento (MM/AA)'), {
    target: { value: '12/29' },
  })
  fireEvent.change(screen.getByLabelText('CVC'), { target: { value: CVC } })
  fireEvent.change(screen.getByLabelText('Nombre del titular'), {
    target: { value: 'Juan Pérez' },
  })
  fireEvent.click(
    screen.getByRole('checkbox', { name: /términos y condiciones/i }),
  )
  fireEvent.click(screen.getByRole('checkbox', { name: /datos personales/i }))
}

async function reachSummaryWithCard(
  cardNumber: string = CARD_NUMBER,
): Promise<void> {
  await screen.findByRole('button', { name: 'Continuar' })
  fillForm(cardNumber)
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  await screen.findByRole('heading', { name: 'Resumen de la compra' })
}

const providerTokenizeCalls = (): RecordedCall[] =>
  recorded.filter((call) => call.url.endsWith('/tokens/cards'))

const ourApiCalls = (): RecordedCall[] =>
  recorded.filter((call) => call.url.startsWith(API_URL))

const ourApiPath = (call: RecordedCall): string =>
  call.url.slice(API_URL.length).split('?')[0]

const createPosts = (): RecordedCall[] =>
  ourApiCalls().filter(
    (call) => call.method === 'POST' && ourApiPath(call) === '/transactions',
  )

const paymentPosts = (): RecordedCall[] =>
  ourApiCalls().filter(
    (call) =>
      call.method === 'POST' &&
      /^\/transactions\/[^/]+\/payment$/.test(ourApiPath(call)),
  )

const statusReads = (): RecordedCall[] =>
  ourApiCalls().filter((call) =>
    /^\/transactions\/[^/]+$/.test(ourApiPath(call)),
  )

const tokenOf = (call: RecordedCall): string =>
  (call.body as { cardToken: string }).cardToken

beforeEach(() => {
  recorded = []
  createdSeq = 0
  tokenSeq = 0
  paymentQueue = []
  readBody = undefined
  onClose.mockClear()
  fetchMock.mockClear()
  global.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  jest.useRealTimers()
})

describe('CheckoutModal US3 edge cases (end to end)', () => {
  it('renders the summary from the POST /transactions body plus the form state', async () => {
    renderModal()
    await reachSummaryWithCard()

    // Product name comes from the selected product (the creation body has none).
    expect(screen.getByText('Mouse')).toBeInTheDocument()
    expect(screen.getByText(/Cantidad:\s*2/)).toBeInTheDocument()
    // Delivery comes from the form state (the creation body has none).
    expect(screen.getByText(/Calle 10 #23/)).toBeInTheDocument()
    // The three amounts plus the total, straight from the creation body.
    expect(screen.getByText(/70\.000/)).toBeInTheDocument()
    expect(screen.getByText(/5\.000/)).toBeInTheDocument()
    expect(screen.getByText(/12\.000/)).toBeInTheDocument()
    expect(screen.getByText(/87\.000/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeInTheDocument()
  })

  it('tokenizes and creates the purchase only once when Continuar is double-clicked', async () => {
    renderModal()
    await screen.findByRole('button', { name: 'Continuar' })
    fillForm()

    const button = screen.getByRole('button', { name: 'Continuar' })
    fireEvent.click(button)
    fireEvent.click(button)

    await screen.findByRole('heading', { name: 'Resumen de la compra' })
    expect(providerTokenizeCalls()).toHaveLength(1)
    expect(createPosts()).toHaveLength(1)
  })

  it.each(['4242 4242 4242 4242', '4242-4242-4242-4242'])(
    'sends the card number to the provider as digits only when typed as %s',
    async (typed) => {
      renderModal()
      await screen.findByRole('button', { name: 'Continuar' })
      fillForm(typed)
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
      await screen.findByRole('heading', { name: 'Resumen de la compra' })

      const [call] = providerTokenizeCalls()
      const body = call.body as Record<string, string>
      expect(body.number).toBe(CARD_NUMBER)
      expect(body.number).toMatch(/^\d{12,19}$/)
    },
  )

  it('reuses the same token and the same key on a 503 retry and issues no new POST /transactions', async () => {
    paymentQueue = [{ status: 503 }, { status: 202, body: view('PENDING') }]
    const { store } = renderModal()

    await reachSummaryWithCard()
    const key = store.getState().checkout.idempotencyKey

    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no está disponible/i,
    )
    expect(
      screen.getByRole('heading', { name: 'Resumen de la compra' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }))
    await screen.findByRole('heading', { name: 'Estado del pago' })

    const payments = paymentPosts()
    expect(payments).toHaveLength(2)
    expect(tokenOf(payments[0])).toBe('tok_1')
    expect(tokenOf(payments[1])).toBe('tok_1')
    expect(createPosts()).toHaveLength(1)
    expect(store.getState().checkout.idempotencyKey).toBe(key)
  })

  it('enters pending from the literal POST payment 202 body and re-reads via GET /transactions/:id', async () => {
    // POST /transactions/:id/payment → 202 with the current view (contract).
    paymentQueue = [{ status: 202, body: view('PENDING') }]
    // GET /transactions/:id → 200 with the current view (contract).
    readBody = view('PENDING')
    const { store } = renderModal()
    await reachSummaryWithCard()

    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }))

    expect(
      await screen.findByRole('heading', { name: 'Estamos confirmando tu pago' }),
    ).toBeInTheDocument()
    const [payment] = paymentPosts()
    expect(payment).toBeDefined()
    expect(store.getState().checkout.paymentStatus).toBe('pending')

    // The manual re-check is the polling path: it hits GET /transactions/:id.
    fireEvent.click(screen.getByRole('button', { name: 'Volver a verificar' }))
    await waitFor(() => expect(statusReads().length).toBeGreaterThan(0))
    expect(statusReads().some((call) => ourApiPath(call) === '/transactions/tx-1')).toBe(
      true,
    )
  })

  it('keeps the same transaction and key and gives the card back on an invalid token', async () => {
    paymentQueue = [{ status: 422, body: { code: 'INVALID_PAYMENT_TOKEN' } }]
    const { store } = renderModal()
    await reachSummaryWithCard()

    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }))

    await screen.findByRole('heading', { name: 'Datos de pago y entrega' })
    const state = store.getState().checkout
    expect(state.transactionId).toBe('tx-1')
    expect(state.idempotencyKey).toBe(START_KEY)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /datos de la tarjeta/i,
    )
    expect(
      screen.getByText(/Volver a ingresar la tarjeta/i),
    ).toBeInTheDocument()
  })

  it.each<TransactionStatus>(['DECLINED', 'VOIDED', 'ERROR'])(
    'clears the transaction, issues a new key and discards the token after a final %s',
    async (status) => {
      paymentQueue = [
        {
          status: 200,
          body: view(status, {
            failureReason:
              status === 'VOIDED' ? 'RESERVATION_EXPIRED' : null,
          }),
        },
      ]
      const { store } = renderModal()
      await reachSummaryWithCard()
      const firstKey = store.getState().checkout.idempotencyKey

      fireEvent.click(screen.getByRole('button', { name: 'Pagar' }))
      await screen.findByRole('button', { name: 'Intentar de nuevo' })

      fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
      await screen.findByRole('button', { name: 'Continuar' })

      const state = store.getState().checkout
      expect(state.transactionId).toBeNull()
      expect(state.idempotencyKey).not.toBe(firstKey)
      expect(state.idempotencyKey).toMatch(IDEMPOTENCY_KEY_PATTERN)

      // The card has to be re-entered: no token is reused, so the retried
      // payment goes out with a brand new token.
      fillForm()
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
      await screen.findByRole('heading', { name: 'Resumen de la compra' })
      fireEvent.click(screen.getByRole('button', { name: 'Pagar' }))
      await screen.findByRole('heading', { name: 'Estado del pago' })

      const tokens = paymentPosts().map(tokenOf)
      expect(tokens).toEqual(['tok_1', 'tok_2'])
      expect(providerTokenizeCalls()).toHaveLength(2)
    },
  )

  it('keeps the pending state with the manual re-check and stops polling at the 40 s ceiling', async () => {
    jest.useFakeTimers()
    readBody = view('PENDING')
    renderModal({
      currentStep: 'finalStatus',
      transactionId: 'tx-1',
      paymentStatus: 'pending',
      transaction: view('PENDING'),
    })
    await act(async () => {})

    expect(
      screen.getByRole('heading', { name: 'Estamos confirmando tu pago' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Volver a verificar' }),
    ).toBeInTheDocument()

    await act(async () => {
      await jest.advanceTimersByTimeAsync(40000)
    })
    const afterCeiling = statusReads().length
    expect(afterCeiling).toBeGreaterThan(0)

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10000)
    })
    expect(statusReads()).toHaveLength(afterCeiling)

    fireEvent.click(screen.getByRole('button', { name: 'Volver a verificar' }))
    await act(async () => {})
    expect(statusReads()).toHaveLength(afterCeiling + 1)
  })

  it('closing after Continuar starts no payment and keeps the pending purchase persisted', async () => {
    const { storage } = renderModal()
    await reachSummaryWithCard()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(paymentPosts()).toHaveLength(0)

    const doc = JSON.parse(storage.data[PERSISTENCE_STORAGE_KEY]) as {
      currentStep: string
      transactionId: string | null
      idempotencyKey: string | null
    }
    expect(doc.currentStep).toBe('summary')
    expect(doc.transactionId).toBe('tx-1')
    expect(doc.idempotencyKey).toBe(START_KEY)
  })

  it('shows a closed PENDING purchase as voided once the server expires the reservation', async () => {
    readBody = view('VOIDED', { failureReason: 'RESERVATION_EXPIRED' })
    const persisted = toCheckoutState({
      version: 2,
      currentStep: 'summary',
      selectedProductId: PRODUCT_ID,
      quantity: 2,
      delivery: null,
      transactionId: 'tx-1',
      idempotencyKey: START_KEY,
    })
    renderModal({ ...persisted, currentStep: 'finalStatus' })

    expect(
      await screen.findByText(
        /La reserva expiró antes de confirmar el pago/i,
      ),
    ).toBeInTheDocument()
    expect(paymentPosts()).toHaveLength(0)
  })

  it('warns and shows the server total when the charged amount changed', async () => {
    paymentQueue = [
      {
        status: 200,
        body: view('APPROVED', {
          amounts: {
            productAmountInCents: 7000000,
            baseFeeInCents: 500000,
            deliveryFeeInCents: 1500000,
            totalInCents: 9000000,
          },
        }),
      },
    ]
    renderModal()
    await reachSummaryWithCard()

    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }))

    await screen.findByRole('heading', { name: '¡Pago aprobado!' })
    expect(screen.getByRole('alert')).toHaveTextContent(/precio cambió/i)
    expect(screen.getByText(/90\.000/)).toBeInTheDocument()
  })

  it('Finalizar on the approved screen clears every trace, closes the modal and refetches stock', async () => {
    paymentQueue = [{ status: 200, body: view('APPROVED') }]
    const { store, storage } = renderModal()
    await reachSummaryWithCard()
    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }))
    await screen.findByRole('heading', { name: '¡Pago aprobado!' })

    const productReadsBefore = ourApiCalls().filter((call) =>
      /^\/products\//.test(ourApiPath(call)),
    ).length

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))

    // All local checkout progress is gone (FR-015, US4.4).
    const cleared = store.getState().checkout
    expect(cleared.currentStep).toBe('product')
    expect(cleared.transactionId).toBeNull()
    expect(cleared.idempotencyKey).toBeNull()
    expect(cleared.transaction).toBeNull()
    expect(cleared.paymentError).toBeNull()
    expect(cleared.paymentStatus).toBe('idle')
    expect(storage.data[PERSISTENCE_STORAGE_KEY]).toBeUndefined()

    // The product page re-reads its stock from the server (FR-016, SC-006).
    const productReadsAfter = ourApiCalls().filter((call) =>
      /^\/products\//.test(ourApiPath(call)),
    )
    expect(productReadsAfter.length).toBe(productReadsBefore + 1)
  })

  it('Finalizar on a declined screen clears the purchase while keeping the retried state clean', async () => {
    paymentQueue = [{ status: 200, body: view('DECLINED') }]
    const { store, storage } = renderModal()
    await reachSummaryWithCard()
    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }))
    await screen.findByRole('heading', { name: 'Pago rechazado' })

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    const cleared = store.getState().checkout
    expect(cleared.currentStep).toBe('product')
    expect(cleared.transactionId).toBeNull()
    expect(cleared.idempotencyKey).toBeNull()
    expect(cleared.paymentStatus).toBe('idle')
    expect(storage.data[PERSISTENCE_STORAGE_KEY]).toBeUndefined()
    // No new purchase was created behind the scenes.
    expect(createPosts()).toHaveLength(1)
  })

  it('never leaks the card number or the CVC into state, storage or our API (SC-005)', async () => {
    paymentQueue = [{ status: 200, body: view('APPROVED') }]
    const { store, storage } = renderModal()

    await reachSummaryWithCard(SPACED_CARD_NUMBER)
    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }))
    await screen.findByRole('heading', { name: '¡Pago aprobado!' })

    const leaks = [CARD_NUMBER, SPACED_CARD_NUMBER, CVC]

    const state = store.getState()
    for (const value of leaks) {
      expect(JSON.stringify(state)).not.toContain(value)
    }

    for (const value of Object.values(storage.data)) {
      for (const secret of leaks) {
        expect(value).not.toContain(secret)
      }
    }

    for (const call of ourApiCalls()) {
      const body = JSON.stringify(call.body ?? null)
      for (const secret of leaks) {
        expect(body).not.toContain(secret)
      }
    }

    const forbidden = [
      'card',
      'cvc',
      'cvv',
      'pan',
      'expiry',
      'expiration',
      'securityCode',
    ]
    expect(Object.keys(state).filter((key) => forbidden.includes(key))).toEqual(
      [],
    )
    expect(
      Object.keys(state.checkout).filter(
        (key) => forbidden.includes(key),
      ),
    ).toEqual([])

    const doc = JSON.parse(
      storage.data[PERSISTENCE_STORAGE_KEY],
    ) as Record<string, unknown>
    const docKeys = Object.keys(doc)
    expect(docKeys.filter((key) => forbidden.includes(key))).toEqual([])
    expect(docKeys).not.toContain('cardBrand')
    expect(docKeys).not.toContain('cardLastFour')
  })
})
