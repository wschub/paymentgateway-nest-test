import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderSummary } from '@/features/checkout/OrderSummary'
import { createApiError } from '@/shared/api/api.errors'
import type { TransactionView } from '@/features/checkout/checkout.types'

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
  card: { brand: 'VISA', lastFour: '2222', installments: 2 },
  product: { id: 'p1', name: 'Mouse', quantity: 2 },
  delivery: { status: 'created', address: 'Calle 10 #23', city: 'Bogotá', region: 'Cundinamarca' },
  failureReason: null,
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
})