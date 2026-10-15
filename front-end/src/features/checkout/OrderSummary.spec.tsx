import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderSummary } from '@/features/checkout/OrderSummary'
import { createApiError } from '@/shared/api/api.errors'
import type { TransactionView } from '@/features/checkout/checkout.types'

const TRANSACTION: TransactionView = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  reference: 'TXN-7K3F9Q2M8XJA4B6C',
  status: 'PENDING',
  quantity: 2,
  amounts: {
    productAmountInCents: 3500000,
    baseFeeInCents: 5000,
    deliveryFeeInCents: 10000,
    totalInCents: 3515000,
  },
  card: { brand: 'VISA', lastFour: '2222', installments: 2 },
  product: { id: 'p1', name: 'Mouse', quantity: 2 },
  delivery: { status: 'PENDING', address: 'Calle 10 #23', city: 'Bogotá', region: 'Cundinamarca' },
  failureReason: null,
}

/** Literal `POST /transactions` 201 body: only the creation fields. */
const CREATED: TransactionView = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  reference: 'TXN-7K3F9Q2M8XJA4B6C',
  status: 'PENDING',
  quantity: 2,
  amounts: {
    productAmountInCents: 3500000,
    baseFeeInCents: 5000,
    deliveryFeeInCents: 10000,
    totalInCents: 3515000,
  },
}

describe('OrderSummary', () => {
  it('shows the product, card, delivery and the amount breakdown', () => {
    render(
      <OrderSummary transaction={TRANSACTION} paying={false} onPay={() => {}} />,
    )

    expect(screen.getByText('Mouse')).toBeInTheDocument()
    expect(screen.getByText('Cantidad: 2')).toBeInTheDocument()
    expect(screen.getByText(/VISA terminada en 2222/)).toBeInTheDocument()
    expect(screen.getByText(/2 cuota/)).toBeInTheDocument()
    expect(screen.getByText('Entrega en Bogotá, Cundinamarca')).toBeInTheDocument()
    expect(screen.getByText(/\$\s*35\.000/)).toBeInTheDocument()
    expect(screen.getByText(/\$\s*50/)).toBeInTheDocument()
    expect(screen.getByText(/\$\s*100/)).toBeInTheDocument()
    expect(screen.getByText(/\$\s*35\.150/)).toBeInTheDocument()
  })

  it('takes the product name and the delivery from the fallbacks when the view has none', () => {
    render(
      <OrderSummary
        transaction={CREATED}
        productName="Mouse"
        delivery={{ address: 'Calle 10 #23', city: 'Bogotá', region: 'Cundinamarca' }}
        paying={false}
        onPay={() => {}}
      />,
    )

    expect(screen.getByText('Mouse')).toBeInTheDocument()
    expect(screen.getByText('Cantidad: 2')).toBeInTheDocument()
    expect(screen.getByText('Entrega en Bogotá, Cundinamarca')).toBeInTheDocument()
    expect(screen.getByText('Calle 10 #23')).toBeInTheDocument()
    expect(screen.getByText(/\$\s*35\.150/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeInTheDocument()
  })

  it('shows the server reference verbatim, even before any enrichment (TXN- + 16 chars)', () => {
    render(<OrderSummary transaction={CREATED} paying={false} onPay={() => {}} />)

    // The reference is server-generated; the client displays it as-is.
    expect(screen.getByText(/TXN-7K3F9Q2M8XJA4B6C/)).toBeInTheDocument()
    expect(CREATED.reference).toMatch(/^TXN-[A-Za-z0-9]{16}$/)
  })

  it('does not crash and still shows the amounts with no product or delivery at all', () => {
    render(<OrderSummary transaction={CREATED} paying={false} onPay={() => {}} />)

    expect(screen.getByText('Cantidad: 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeInTheDocument()
  })

  it('calls onPay when the pay button is pressed', async () => {
    const user = userEvent.setup()
    const onPay = jest.fn()
    render(<OrderSummary transaction={TRANSACTION} paying={false} onPay={onPay} />)

    await user.click(screen.getByRole('button', { name: 'Pagar' }))
    expect(onPay).toHaveBeenCalledTimes(1)
  })

  it('disables the pay button and labels progress while paying', () => {
    render(<OrderSummary transaction={TRANSACTION} paying={true} onPay={() => {}} />)

    const button = screen.getByRole('button', { name: 'Procesando…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('shows the payment error when one is present', () => {
    render(
      <OrderSummary
        transaction={TRANSACTION}
        paying={false}
        error={createApiError('providerRejected')}
        onPay={() => {}}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/no fue aprobado/i)
  })

  it('renders our own message for the error kind and never the raw back-end text', () => {
    render(
      <OrderSummary
        transaction={TRANSACTION}
        paying={false}
        error={{
          kind: 'providerUnavailable',
          message: 'PAYMENT_PROVIDER_UNAVAILABLE at /transactions/1/payment (503)',
        }}
        onPay={() => {}}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/no está disponible/i)
    expect(alert).not.toHaveTextContent(/PAYMENT_PROVIDER_UNAVAILABLE/)
    expect(alert).not.toHaveTextContent('/transactions')
  })

  it('offers the next action for an error that needs a different step', () => {
    render(
      <OrderSummary
        transaction={TRANSACTION}
        paying={false}
        error={createApiError('soldOut')}
        onPay={() => {}}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/se agotó/i)
    expect(
      screen.getByText(/Ajusta la cantidad o elige otro producto/i),
    ).toBeInTheDocument()
  })
})