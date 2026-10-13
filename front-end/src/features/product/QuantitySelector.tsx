import { useId } from 'react'
import { clampQuantity, maxSelectableQuantity } from '@/shared/product'

export interface QuantitySelectorProps {
  value: number
  stock: number
  onChange: (value: number) => void
  label?: string
}

export function QuantitySelector({
  value,
  stock,
  onChange,
  label = 'Cantidad',
}: QuantitySelectorProps) {
  const inputId = useId()
  const max = maxSelectableQuantity(stock)
  const disabled = max <= 0

  const emit = (next: number) => {
    onChange(clampQuantity(next, stock))
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="inline-flex w-fit items-stretch overflow-hidden rounded-md border border-gray-300">
        <button
          type="button"
          onClick={() => emit(value - 1)}
          disabled={disabled || value <= 1}
          aria-label="Disminuir cantidad"
          className="px-3 py-2 text-lg font-semibold text-gray-800 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const raw = event.target.value
            if (raw === '') {
              return
            }
            const parsed = Number.parseInt(raw, 10)
            if (Number.isNaN(parsed)) {
              return
            }
            emit(parsed)
          }}
          className="w-16 border-x border-gray-300 text-center text-base text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() => emit(value + 1)}
          disabled={disabled || value >= max}
          aria-label="Aumentar cantidad"
          className="px-3 py-2 text-lg font-semibold text-gray-800 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {`Cantidad: ${value} de ${max}`}
      </p>
    </div>
  )
}
