import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuantitySelector } from '@/features/product/QuantitySelector'

function Harness({ stock, initial = 1 }: { stock: number; initial?: number }) {
  const [value, setValue] = useState(initial)
  return <QuantitySelector value={value} stock={stock} onChange={setValue} />
}

describe('QuantitySelector', () => {
  it('renders a labeled numeric input bounded by the smaller of stock and ten', () => {
    render(<Harness stock={15} />)

    const input = screen.getByRole('spinbutton', { name: 'Cantidad' })
    expect(input).toHaveAttribute('type', 'number')
    expect(input).toHaveAttribute('min', '1')
    expect(input).toHaveAttribute('max', '10')
    expect(input).toHaveValue(1)
  })

  it('caps the upper bound at the available stock when it is below ten', () => {
    render(<Harness stock={3} />)

    expect(screen.getByRole('spinbutton', { name: 'Cantidad' })).toHaveAttribute(
      'max',
      '3',
    )
  })

  it('steps the quantity with the minus and plus buttons', async () => {
    const user = userEvent.setup()
    render(<Harness stock={5} />)

    const input = screen.getByRole('spinbutton', { name: 'Cantidad' })
    await user.click(screen.getByRole('button', { name: 'Aumentar cantidad' }))
    await user.click(screen.getByRole('button', { name: 'Aumentar cantidad' }))
    expect(input).toHaveValue(3)

    await user.click(screen.getByRole('button', { name: 'Disminuir cantidad' }))
    expect(input).toHaveValue(2)
  })

  it('never lets the quantity go below one or above the maximum', async () => {
    const user = userEvent.setup()
    render(<Harness stock={2} initial={2} />)

    const minus = screen.getByRole('button', { name: 'Disminuir cantidad' })
    const plus = screen.getByRole('button', { name: 'Aumentar cantidad' })
    expect(plus).toBeDisabled()
    expect(minus).toBeEnabled()

    await user.click(minus)
    expect(screen.getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue(1)
    expect(minus).toBeDisabled()
  })

  it('clamps a typed value into the allowed range', () => {
    render(<Harness stock={4} />)

    const input = screen.getByRole('spinbutton', { name: 'Cantidad' })
    fireEvent.change(input, { target: { value: '99' } })
    expect(input).toHaveValue(4)

    fireEvent.change(input, { target: { value: '0' } })
    expect(input).toHaveValue(1)

    fireEvent.change(input, { target: { value: '' } })
    expect(input).toHaveValue(1)
  })

  it('announces the current quantity through a polite live region', async () => {
    const user = userEvent.setup()
    render(<Harness stock={5} />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Cantidad: 1 de 5')

    await user.click(screen.getByRole('button', { name: 'Aumentar cantidad' }))
    expect(status).toHaveTextContent('Cantidad: 2 de 5')
  })

  it('disables the control when there is no stock', () => {
    render(<Harness stock={0} />)

    expect(screen.getByRole('spinbutton', { name: 'Cantidad' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Aumentar cantidad' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Disminuir cantidad' }),
    ).toBeDisabled()
  })
})
