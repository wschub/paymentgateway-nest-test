import type { ReactElement } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { CheckoutModal } from '@/features/checkout/CheckoutModal'
import type { CardAndDeliveryFormProps } from '@/features/checkout/CardAndDeliveryForm'
import type { OrderSummaryProps } from '@/features/checkout/OrderSummary'
import type { CheckoutConfig } from '@/features/checkout/checkout.types'
import { makeStore, type AppStore, type RootState } from '@/app/store'
import type { CheckoutState } from '@/features/checkout/checkout.slice'
import { httpRequest } from '@/shared/api/http'
import { createApiError } from '@/shared/api/api.errors'

jest.mock('@/shared/api/http', () => ({
  httpRequest: jest.fn(),
  isApiError: (value: unknown) =>
    typeof value === 'object' &&
    value !== null &&
    'kind' in (value as Record<string, unknown>),
}))

const mockFormProps = jest.fn()
const mockSummaryProps = jest.fn()

jest.mock('@/features/checkout/CardAndDeliveryForm', () => {
  return {
    CardAndDeliveryForm: (props: CardAndDeliveryFormProps) => {
      mockFormProps(props)
      return (
        <div>
          <span data-testid="form-idempotency-key">{props.idempotencyKey}</span>
          <button
            type="button"
            onClick={() =>
              props.onCreated({
                transaction: {
                  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                  reference: 'REF-0001',
                  status: 'PENDING',
                  quantity: 2,
                  amounts: {
                    productAmountInCents: 3500000,
                    baseFeeInCents: 5000,
                    deliveryFeeInCents: 10000,
                    totalInCents: 3515000,
                  },
                  card: null,
                  product: { id: 'p1', name: 'Mouse', quantity: 2 },
                  delivery: {
                    status: 'created',
                    address: 'Calle 10 #23',
                    city: 'Bogotá',
                    region: 'Cundinamarca',
                  },
                  failureReason: null,
                },
                cardToken: 'tok_1',
                brand: 'VISA',
                lastFour: '2222',
                installments: 2,
              })
            }
          >
            Continuar (simulado)
          </button>
        </div>
      )
    },
  }
})

jest.mock('@/features/checkout/OrderSummary', () => {
  return {
    OrderSummary: (props: OrderSummaryProps) => {
      mockSummaryProps(props)
      return (
        <div>
          {props.error ? <p role="alert">{props.error.message}</p> : null}
          <p>Resumen de {props.transaction.product.name}</p>
          <button type="button" onClick={props.onPay} disabled={props.paying}>
            {props.paying ? 'Procesando (simulado)' : 'Pagar (simulado)'}
          </button>
        </div>
      )
    },
  }
})

const mockedHttpRequest = httpRequest as jest.MockedFunction<typeof httpRequest>

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

const TRANSACTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PRODUCT_ID = 'p1'

const preloadedCheckout: CheckoutState = {
  currentStep: 'cardAndDelivery',
  selectedProductId: PRODUCT_ID,
  quantity: 2,
  delivery: null,
  transactionId: null,
  idempotencyKey: 'key-123',
  cardBrand: null,
  cardLastFour: null,
  installments: 1,
  contractsAccepted: false,
  paymentStatus: 'idle',
  paymentError: null,
}

function renderModal(
  checkoutOverrides: Partial<typeof preloadedCheckout> = {},
): { store: AppStore; onClose: jest.Mock; rerenderOpen: (open: boolean) => void } {
  const onClose = jest.fn()
  const store = makeStore({
    checkout: { ...preloadedCheckout, ...checkoutOverrides },
    checkoutConfig: { config: null, status: 'idle', error: null },
  } as Partial<RootState>)
  const element = (open: boolean): ReactElement => (
    <Provider store={store}>
      <CheckoutModal open={open} onClose={onClose} />
    </Provider>
  )
  const { rerender } = render(element(true))
  const rerenderOpen = (open: boolean) => rerender(element(open))
  return { store, onClose, rerenderOpen }
}

const successRoutes = (paymentOutcome: unknown) => {
  mockedHttpRequest.mockImplementation((path: string) => {
    if (path === '/payments/checkout-config') return Promise.resolve(CONFIG)
    return Promise.resolve(paymentOutcome)
  })
}

const paidTransaction = {
  id: TRANSACTION_ID,
  reference: 'REF-0001',
  status: 'APPROVED',
  quantity: 2,
  amounts: {
    productAmountInCents: 3500000,
    baseFeeInCents: 5000,
    deliveryFeeInCents: 10000,
    totalInCents: 3515000,
  },
  card: { brand: 'VISA', lastFour: '2222', installments: 2 },
  product: { id: PRODUCT_ID, name: 'Mouse', quantity: 2 },
  delivery: { status: 'created', address: 'Calle 10 #23', city: 'Bogotá', region: 'Cundinamarca' },
  failureReason: null,
}

async function reachSummary(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('button', { name: 'Continuar (simulado)' })
  await user.click(screen.getByRole('button', { name: 'Continuar (simulado)' }))
  await screen.findByRole('heading', { name: 'Resumen de la compra' })
}

describe('CheckoutModal', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
    mockFormProps.mockClear()
    mockSummaryProps.mockClear()
  })

  it('loads the checkout config when it opens and renders the card form', async () => {
    successRoutes(paidTransaction)
    const { store } = renderModal()

    expect(
      await screen.findByRole('button', { name: 'Continuar (simulado)' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Datos de pago y entrega' }),
    ).toBeInTheDocument()
    expect(mockedHttpRequest).toHaveBeenCalledWith('/payments/checkout-config')
    await waitFor(() =>
      expect(store.getState().checkoutConfig.status).toBe('success'),
    )
  })

  it('passes the idempotency key and product data to the card form', async () => {
    successRoutes(paidTransaction)
    renderModal()

    await screen.findByRole('button', { name: 'Continuar (simulado)' })

    expect(mockFormProps).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'key-123',
        productId: PRODUCT_ID,
        quantity: 2,
      }),
    )
    expect(screen.getByTestId('form-idempotency-key')).toHaveTextContent('key-123')
  })

  it('shows an error state and retries when the config request fails', async () => {
    const user = userEvent.setup()
    mockedHttpRequest.mockResolvedValue(createApiError('network'))
    renderModal()

    expect(await screen.findByRole('alert')).toHaveTextContent(/conectar/i)

    successRoutes(paidTransaction)
    await user.click(screen.getByRole('button', { name: /Reintentar/i }))

    expect(
      await screen.findByRole('button', { name: 'Continuar (simulado)' }),
    ).toBeInTheDocument()
  })

  it('moves to the summary step once the transaction is created', async () => {
    const user = userEvent.setup()
    successRoutes(paidTransaction)
    renderModal()

    await reachSummary(user)

    expect(screen.getByText('Resumen de Mouse')).toBeInTheDocument()
    expect(mockSummaryProps).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: expect.objectContaining({ id: TRANSACTION_ID }),
      }),
    )
  })

  it('pays the created transaction and moves to the final status step', async () => {
    const user = userEvent.setup()
    successRoutes(paidTransaction)
    const { store } = renderModal()

    await reachSummary(user)
    await user.click(screen.getByRole('button', { name: 'Pagar (simulado)' }))

    expect(
      await screen.findByRole('heading', { name: 'Estado del pago' }),
    ).toBeInTheDocument()
    expect(mockedHttpRequest).toHaveBeenCalledWith(
      `/transactions/${TRANSACTION_ID}/payment`,
      {
        method: 'POST',
        body: { cardToken: 'tok_1', installments: 2, acceptedContracts: true },
      },
    )
    await waitFor(() => expect(store.getState().checkout.currentStep).toBe('finalStatus'))
  })

  it('keeps the summary open and shows the error when the payment service is unavailable', async () => {
    const user = userEvent.setup()
    successRoutes(createApiError('providerUnavailable'))
    renderModal()

    await reachSummary(user)
    await user.click(screen.getByRole('button', { name: 'Pagar (simulado)' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no está disponible/i)
    expect(
      screen.getByRole('heading', { name: 'Resumen de la compra' }),
    ).toBeInTheDocument()
    expect(mockSummaryProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ paying: false }),
    )
  })

  it('keeps the summary and the token when the provider rejects the payment so it can be retried', async () => {
    const user = userEvent.setup()
    let paymentAttempts = 0
    mockedHttpRequest.mockImplementation((path: string) => {
      if (path === '/payments/checkout-config') return Promise.resolve(CONFIG)
      paymentAttempts += 1
      if (paymentAttempts === 1) {
        return Promise.resolve(createApiError('providerRejected'))
      }
      return Promise.resolve(paidTransaction)
    })
    renderModal()

    await reachSummary(user)
    await user.click(screen.getByRole('button', { name: 'Pagar (simulado)' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no fue aprobado/i)
    expect(
      screen.getByRole('heading', { name: 'Resumen de la compra' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pagar (simulado)' }))

    expect(
      await screen.findByRole('heading', { name: 'Estado del pago' }),
    ).toBeInTheDocument()
    const paymentCalls = mockedHttpRequest.mock.calls.filter(([path]) =>
      String(path).endsWith('/payment'),
    )
    expect(paymentCalls).toHaveLength(2)
    expect(paymentCalls[1][1]).toEqual({
      method: 'POST',
      body: { cardToken: 'tok_1', installments: 2, acceptedContracts: true },
    })
  })

  it('goes back to the card form with the same transaction and key on an invalid token', async () => {
    const user = userEvent.setup()
    successRoutes(createApiError('invalidToken'))
    const { store } = renderModal()

    await reachSummary(user)
    await user.click(screen.getByRole('button', { name: 'Pagar (simulado)' }))

    expect(
      await screen.findByRole('heading', { name: 'Datos de pago y entrega' }),
    ).toBeInTheDocument()
    const state = store.getState().checkout
    expect(state.currentStep).toBe('cardAndDelivery')
    expect(state.transactionId).toBe(TRANSACTION_ID)
    expect(state.idempotencyKey).toBe('key-123')
    expect(mockFormProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ kind: 'invalidToken' }),
      }),
    )
  })

  it('shows the current status instead of starting a new payment when the purchase is not payable', async () => {
    const user = userEvent.setup()
    const staleTransaction = { ...paidTransaction, status: 'VOIDED' as const }
    mockedHttpRequest.mockImplementation((path: string) => {
      if (path === '/payments/checkout-config') return Promise.resolve(CONFIG)
      if (String(path).endsWith('/payment')) {
        return Promise.resolve(createApiError('notPayable'))
      }
      return Promise.resolve(staleTransaction)
    })
    renderModal()

    await reachSummary(user)
    await user.click(screen.getByRole('button', { name: 'Pagar (simulado)' }))

    expect(
      await screen.findByRole('heading', { name: 'Estado del pago' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Compra anulada' })).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('button', { name: 'Pagar (simulado)' }),
    ).not.toBeInTheDocument()
    expect(
      mockedHttpRequest.mock.calls.filter(([path]) =>
        String(path).endsWith('/payment'),
      ),
    ).toHaveLength(1)
  })

  it('starts a brand new purchase when the idempotency key can no longer continue', async () => {
    const user = userEvent.setup()
    successRoutes(createApiError('idempotencyConflict'))
    const { store } = renderModal()

    await reachSummary(user)
    await user.click(screen.getByRole('button', { name: 'Pagar (simulado)' }))

    expect(
      await screen.findByRole('button', { name: 'Continuar (simulado)' }),
    ).toBeInTheDocument()
    const state = store.getState().checkout
    expect(state.currentStep).toBe('cardAndDelivery')
    expect(state.transactionId).toBeNull()
    expect(state.idempotencyKey).not.toBe('key-123')
  })

  it('calls the payment endpoint once when Pagar is double-clicked', async () => {
    const user = userEvent.setup()
    successRoutes(paidTransaction)
    renderModal()

    await reachSummary(user)
    const payButton = screen.getByRole('button', { name: 'Pagar (simulado)' })

    fireEvent.click(payButton)
    fireEvent.click(payButton)

    expect(
      await screen.findByRole('heading', { name: 'Estado del pago' }),
    ).toBeInTheDocument()
    expect(
      mockedHttpRequest.mock.calls.filter(([path]) =>
        String(path).endsWith('/payment'),
      ),
    ).toHaveLength(1)
  })

  it('closes the modal and hides the dialog', async () => {
    const user = userEvent.setup()
    successRoutes(paidTransaction)
    const { onClose } = renderModal()

    await screen.findByRole('button', { name: 'Continuar (simulado)' })
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('bounds the dialog to the viewport so a 375 px screen has no horizontal overflow', async () => {
    successRoutes(paidTransaction)
    renderModal()

    await screen.findByRole('button', { name: 'Continuar (simulado)' })
    const dialog = document.querySelector('dialog') as HTMLDialogElement

    // Width is the viewport minus a small gutter and capped on wide screens.
    expect(dialog.className).toContain('w-[calc(100vw-2rem)]')
    expect(dialog.className).toContain('max-w-lg')
    expect(dialog.className).toContain('overflow-x-hidden')
  })

  it('closes the native dialog when the open prop becomes false', async () => {
    successRoutes(paidTransaction)
    const { rerenderOpen } = renderModal()

    await screen.findByRole('button', { name: 'Continuar (simulado)' })
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    expect(dialog.open).toBe(true)

    rerenderOpen(false)

    expect(dialog.open).toBe(false)
  })

  it('re-reads the transaction when the user asks to verify again', async () => {
    const user = userEvent.setup()
    mockedHttpRequest.mockImplementation((path: string) => {
      if (path === '/payments/checkout-config') return Promise.resolve(CONFIG)
      return Promise.resolve({ ...paidTransaction, status: 'PENDING' })
    })
    renderModal({
      currentStep: 'finalStatus',
      transactionId: TRANSACTION_ID,
      paymentStatus: 'pending',
    })

    await screen.findByRole('button', { name: 'Volver a verificar' })
    await user.click(screen.getByRole('button', { name: 'Volver a verificar' }))

    await waitFor(() =>
      expect(
        mockedHttpRequest.mock.calls.filter(
          ([path]) => path === `/transactions/${TRANSACTION_ID}`,
        ).length,
      ).toBeGreaterThanOrEqual(2),
    )
  })

  it('traps keyboard focus inside the dialog while it is open', async () => {
    successRoutes(paidTransaction)
    renderModal()

    await screen.findByRole('button', { name: 'Continuar (simulado)' })
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    first.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)

    last.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('ignores keys other than Tab when trapping focus', async () => {
    successRoutes(paidTransaction)
    renderModal()

    await screen.findByRole('button', { name: 'Continuar (simulado)' })
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    const first = dialog.querySelector('button') as HTMLButtonElement
    first.focus()

    fireEvent.keyDown(dialog, { key: 'ArrowDown' })

    expect(document.activeElement).toBe(first)
  })

  it('does not read a transaction when re-checking without a transaction id', async () => {
    const user = userEvent.setup()
    successRoutes(paidTransaction)
    renderModal({
      currentStep: 'finalStatus',
      transactionId: null,
      paymentStatus: 'pending',
    })

    await user.click(
      await screen.findByRole('button', { name: 'Volver a verificar' }),
    )

    expect(
      mockedHttpRequest.mock.calls.some(([path]) =>
        /^\/transactions\/.+/.test(String(path)),
      ),
    ).toBe(false)
  })

  it('renders nothing when no product is selected', async () => {
    successRoutes(paidTransaction)
    renderModal({ selectedProductId: null })

    await screen.findByRole('heading', { name: 'Datos de pago y entrega' })

    expect(
      screen.queryByRole('button', { name: 'Continuar (simulado)' }),
    ).not.toBeInTheDocument()
  })

  it('closes when the dialog fires a cancel event', async () => {
    successRoutes(paidTransaction)
    const { onClose } = renderModal()

    await screen.findByRole('button', { name: 'Continuar (simulado)' })
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows a verifying state after a refresh and only reveals the result once the read settles', async () => {
    let resolveRead: (value: unknown) => void = () => undefined
    mockedHttpRequest.mockImplementation((path: string) => {
      if (path === '/payments/checkout-config') return Promise.resolve(CONFIG)
      return new Promise((resolve) => {
        resolveRead = resolve
      })
    })
    renderModal({
      currentStep: 'finalStatus',
      transactionId: TRANSACTION_ID,
      paymentStatus: 'pending',
    })

    expect(await screen.findByText('Verificando el pago…')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '¡Pago aprobado!' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Pago rechazado' }),
    ).not.toBeInTheDocument()

    expect(mockedHttpRequest).toHaveBeenCalledWith(
      `/transactions/${TRANSACTION_ID}`,
      { map400ToNotFound: true },
    )

    await act(async () => {
      resolveRead(paidTransaction)
    })

    expect(
      await screen.findByRole('heading', { name: '¡Pago aprobado!' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Verificando el pago…')).not.toBeInTheDocument()
  })

  it('returns to card entry with the same key when refreshed on the summary step', async () => {
    successRoutes(paidTransaction)
    renderModal({
      currentStep: 'summary',
      transactionId: TRANSACTION_ID,
      idempotencyKey: 'key-123',
    })

    expect(
      await screen.findByRole('button', { name: 'Continuar (simulado)' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('form-idempotency-key')).toHaveTextContent('key-123')
  })

  it('clears the transaction and issues a new key when retrying after a decline', async () => {
    const user = userEvent.setup()
    mockedHttpRequest.mockImplementation((path: string) => {
      if (path === '/payments/checkout-config') return Promise.resolve(CONFIG)
      return Promise.resolve({ ...paidTransaction, status: 'DECLINED' })
    })
    const { store } = renderModal({
      currentStep: 'finalStatus',
      transactionId: TRANSACTION_ID,
      paymentStatus: 'declined',
    })

    await user.click(
      await screen.findByRole('button', { name: 'Intentar de nuevo' }),
    )

    expect(
      await screen.findByRole('button', { name: 'Continuar (simulado)' }),
    ).toBeInTheDocument()
    const state = store.getState().checkout
    expect(state.currentStep).toBe('cardAndDelivery')
    expect(state.transactionId).toBeNull()
    expect(state.paymentStatus).toBe('idle')
    expect(state.idempotencyKey).not.toBe('key-123')
    expect(screen.getByTestId('form-idempotency-key')).toHaveTextContent(
      state.idempotencyKey ?? '',
    )
  })
})