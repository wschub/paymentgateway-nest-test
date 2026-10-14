import type { TransactionView } from '@/features/checkout/checkout.types'
import { describePaymentError } from '@/features/checkout/payment-errors'
import { formatPriceCOP } from '@/shared/format/money'
import type { ApiError } from '@/shared/api/api.errors'

export interface OrderSummaryProps {
  transaction: TransactionView
  paying: boolean
  error?: ApiError | null
  onPay: () => void
}

interface AmountRowProps {
  label: string
  cents: number
  emphasis?: boolean
}

function AmountRow({ label, cents, emphasis = false }: AmountRowProps) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        emphasis ? 'text-base font-semibold text-gray-900' : 'text-sm text-gray-700'
      }`}
    >
      <dt>{label}</dt>
      <dd>{formatPriceCOP(cents)}</dd>
    </div>
  )
}

export function OrderSummary({
  transaction,
  paying,
  error = null,
  onPay,
}: OrderSummaryProps) {
  const { amounts, product, card, delivery } = transaction
  const guidance = describePaymentError(error)

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
        <h3 className="text-base font-semibold text-gray-900">{product.name}</h3>
        <p className="text-sm text-gray-600">
          Cantidad: {transaction.quantity}
        </p>
        {card?.brand && card.lastFour ? (
          <p className="text-sm text-gray-600">
            {card.brand} terminada en {card.lastFour}
            {card.installments ? ` — ${card.installments} cuota(s)` : ''}
          </p>
        ) : null}
        {delivery ? (
          <p className="text-sm text-gray-600">
            Entrega en {delivery.city}, {delivery.region}
          </p>
        ) : null}
      </div>

      <dl className="flex flex-col gap-2">
        <AmountRow label="Producto" cents={amounts.productAmountInCents} />
        <AmountRow label="Cargo base" cents={amounts.baseFeeInCents} />
        <AmountRow label="Envío" cents={amounts.deliveryFeeInCents} />
        <AmountRow label="Total" cents={amounts.totalInCents} emphasis />
      </dl>

      {guidance ? (
        <div className="flex flex-col gap-1">
          <p role="alert" className="text-sm font-medium text-red-700">
            {guidance.message}
          </p>
          {guidance.action !== 'retry' ? (
            <p className="text-sm text-gray-700">{guidance.actionLabel}</p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onPay}
        disabled={paying}
        aria-busy={paying}
        className="w-fit rounded-md bg-gray-800 px-5 py-2 font-medium text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {paying ? 'Procesando…' : 'Pagar'}
      </button>
    </div>
  )
}
