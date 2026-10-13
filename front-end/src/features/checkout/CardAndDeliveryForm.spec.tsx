import type { ReactElement } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { CardAndDeliveryForm, type CardAndDeliveryFormResult } from '@/features/checkout/CardAndDeliveryForm'
import type { CheckoutConfig, TransactionView } from '@/features/checkout/checkout.types'
import { makeStore, type AppStore } from '@/app/store'
import { tokenizeCard } from '@/shared/api/payment-provider'
import { httpRequest } from '@/shared/api/http'
import { createApiError } from '@/shared/api/api.errors'

jest.mock('@/shared/api/http', () => ({
  httpRequest: jest.fn(),
  isApiError: (value: unknown) =>
    typeof value === 'object' &&
    value !== null &&
    'kind' in (value as Record<string, unknown>),
}))

jest.mock('@/shared/api/payment-provider', () => ({
  tokenizeCard: jest.fn(),
}))

const mockedHttpRequest = httpRequest as jest.MockedFunction<typeof httpRequest>
const mockedTokenizeCard = tokenizeCard as jest.MockedFunction<typeof tokenizeCard>

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

const TRANSACTION: TransactionView = {
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
  delivery: { status: 'created', address: 'Calle 10 #23', city: 'Bogotá', region: 'Cundinamarca' },
  failureReason: null,
}

const IDEMPOTENCY_KEY = 'key-123'
const PRODUCT_ID = 'p1'
const QUANTITY = 2

const VALID_DELIVERY = {
  fullName: 'Juan Pérez',
  email: 'juan@example.com',
  phone: '3101234567',
  address: 'Calle 10 #23',
  city: 'Bogotá',
  region: 'Cundinamarca',
}

const VALID_CARD = {
  number: '4222222222222',
  expiry: '09/29',
  cvc: '123',
  cardholder: 'Juan Perez',
}

function renderForm(props: {
  idempotencyKey?: string | null
  onCreated?: (result: CardAndDeliveryFormResult) => void
} = {}): AppStore {
  const store = makeStore()
  const onCreated = props.onCreated ?? jest.fn()
  const element: ReactElement = (
    <Provider store={store}>
      <CardAndDeliveryForm
        config={CONFIG}
        idempotencyKey={props.idempotencyKey === undefined ? IDEMPOTENCY_KEY : props.idempotencyKey}
        productId={PRODUCT_ID}
        quantity={QUANTITY}
        onCreated={onCreated}
      />
    </Provider>
  )
  render(element)
  return store
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nombre completo'), VALID_DELIVERY.fullName)
  await user.type(screen.getByLabelText('Correo electrónico'), VALID_DELIVERY.email)
  await user.type(screen.getByLabelText('Teléfono'), VALID_DELIVERY.phone)
  await user.type(screen.getByLabelText('Dirección'), VALID_DELIVERY.address)
  await user.type(screen.getByLabelText('Ciudad'), VALID_DELIVERY.city)
  await user.type(screen.getByLabelText('Departamento'), VALID_DELIVERY.region)
  await user.type(screen.getByLabelText('Número de tarjeta'), VALID_CARD.number)
  await user.type(screen.getByLabelText('Vencimiento (MM/AA)'), VALID_CARD.expiry)
  await user.type(screen.getByLabelText('CVC'), VALID_CARD.cvc)
  await user.type(screen.getByLabelText('Nombre del titular'), VALID_CARD.cardholder)
  await user.click(screen.getByRole('checkbox', { name: /Acepto los términos/i }))
  await user.click(screen.getByRole('checkbox', { name: /Autorizo el tratamiento/i }))
}

describe('CardAndDeliveryForm', () => {
  beforeEach(() => {
    mockedHttpRequest.mockReset()
    mockedTokenizeCard.mockReset()
    mockedTokenizeCard.mockResolvedValue({ token: 'tok_1', brand: 'VISA', lastFour: '2222' })
  })

  it('persists the delivery fields into the checkout state as they are typed', async () => {
    const user = userEvent.setup()
    const store = renderForm()

    await user.type(screen.getByLabelText('Nombre completo'), VALID_DELIVERY.fullName)
    await user.type(screen.getByLabelText('Ciudad'), VALID_DELIVERY.city)

    await waitFor(() => {
      expect(store.getState().checkout.delivery?.fullName).toBe(VALID_DELIVERY.fullName)
      expect(store.getState().checkout.delivery?.city).toBe(VALID_DELIVERY.city)
    })
  })

  it('submits a valid form: tokenizes the card, creates the transaction and reports the result', async () => {
    const user = userEvent.setup()
    const onCreated = jest.fn()
    const store = renderForm({ onCreated })
    mockedHttpRequest.mockResolvedValue(TRANSACTION)

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })

    expect(mockedTokenizeCard).toHaveBeenCalledWith({
      baseUrl: CONFIG.baseUrl,
      publicKey: CONFIG.publicKey,
      card: {
        number: VALID_CARD.number,
        cvc: VALID_CARD.cvc,
        expMonth: '09',
        expYear: '29',
        cardholder: VALID_CARD.cardholder,
      },
    })
    expect(mockedHttpRequest).toHaveBeenCalledWith('/transactions', {
      method: 'POST',
      headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
      body: {
        productId: PRODUCT_ID,
        quantity: QUANTITY,
        customer: {
          fullName: VALID_DELIVERY.fullName,
          email: VALID_DELIVERY.email,
          phone: VALID_DELIVERY.phone,
        },
        delivery: {
          address: VALID_DELIVERY.address,
          city: VALID_DELIVERY.city,
          region: VALID_DELIVERY.region,
        },
      },
    })
    expect(onCreated).toHaveBeenCalledWith({
      transaction: TRANSACTION,
      cardToken: 'tok_1',
      brand: 'VISA',
      lastFour: '2222',
      installments: 1,
    })

    const checkout = store.getState().checkout
    expect(checkout.cardBrand).toBe('VISA')
    expect(checkout.cardLastFour).toBe('2222')
    expect(checkout.installments).toBe(1)
    expect(checkout.contractsAccepted).toBe(true)
    expect(checkout.delivery?.fullName).toBe(VALID_DELIVERY.fullName)
  })

  it('shows inline validation errors when submitting empty and never tokenizes', async () => {
    const user = userEvent.setup()
    const onCreated = jest.fn()
    renderForm({ onCreated })

    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByText(/Ingresa el nombre completo/i)).toBeInTheDocument()
    expect(screen.getByText(/correo electrónico válido/i)).toBeInTheDocument()
    expect(screen.getByText(/teléfono válido/i)).toBeInTheDocument()
    expect(screen.getByText(/número de tarjeta válido/i)).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
    expect(mockedTokenizeCard).not.toHaveBeenCalled()
  })

  it('validates a field when it loses focus', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Correo electrónico'), 'no-es-un-email')
    await user.tab()

    expect(screen.getByText(/correo electrónico válido/i)).toBeInTheDocument()
  })

  it('requires both contracts to be accepted before continuing', async () => {
    const user = userEvent.setup()
    const onCreated = jest.fn()
    mockedHttpRequest.mockResolvedValue(TRANSACTION)
    renderForm({ onCreated })

    await user.type(screen.getByLabelText('Nombre completo'), VALID_DELIVERY.fullName)
    await user.type(screen.getByLabelText('Correo electrónico'), VALID_DELIVERY.email)
    await user.type(screen.getByLabelText('Teléfono'), VALID_DELIVERY.phone)
    await user.type(screen.getByLabelText('Dirección'), VALID_DELIVERY.address)
    await user.type(screen.getByLabelText('Ciudad'), VALID_DELIVERY.city)
    await user.type(screen.getByLabelText('Departamento'), VALID_DELIVERY.region)
    await user.type(screen.getByLabelText('Número de tarjeta'), VALID_CARD.number)
    await user.type(screen.getByLabelText('Vencimiento (MM/AA)'), VALID_CARD.expiry)
    await user.type(screen.getByLabelText('CVC'), VALID_CARD.cvc)
    await user.type(screen.getByLabelText('Nombre del titular'), VALID_CARD.cardholder)

    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/aceptar ambos contratos/i)
    expect(mockedTokenizeCard).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('blocks the submission when there is no idempotency key', async () => {
    const user = userEvent.setup()
    const onCreated = jest.fn()
    renderForm({ idempotencyKey: null, onCreated })

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/No pudimos iniciar la compra/i)
    expect(mockedTokenizeCard).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('shows the API error when the transaction cannot be created', async () => {
    const user = userEvent.setup()
    const onCreated = jest.fn()
    mockedHttpRequest.mockResolvedValue(createApiError('soldOut'))
    renderForm({ onCreated })

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/se agotó/i)
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('shows the tokenization error and stops when the provider rejects the card', async () => {
    const user = userEvent.setup()
    const onCreated = jest.fn()
    mockedTokenizeCard.mockResolvedValue(createApiError('invalidToken'))
    renderForm({ onCreated })

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/datos de la tarjeta/i)
    expect(mockedHttpRequest).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })
})