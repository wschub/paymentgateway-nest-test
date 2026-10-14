import type { ReactNode } from 'react'
import type { ApiError } from '@/shared/api/api.errors'
import type { PaymentStatus as PaymentStatusValue } from '@/features/checkout/checkout.slice'
import type { TransactionView } from '@/features/checkout/checkout.types'
import { describePaymentError } from '@/features/checkout/payment-errors'
import { Spinner } from '@/shared/ui/Spinner'
import { formatPriceCOP } from '@/shared/format/money'

export interface PaymentStatusProps {
  transaction: TransactionView | null
  status: PaymentStatusValue
  error: ApiError | null
  onRecheck: () => void
  onRetry: () => void
  priceChanged?: boolean
}

export function PaymentStatus({
  transaction,
  status,
  error,
  onRecheck,
  onRetry,
  priceChanged = false,
}: PaymentStatusProps) {
  const guidance = describePaymentError(error)

  const priceChangedNotice = priceChanged ? (
    <p role="alert" className="text-sm text-amber-700">
      El precio cambió desde el resumen. El total mostrado es el que cobró el
      servidor.
    </p>
  ) : null

  const recheckButton = (
    <button
      type="button"
      onClick={onRecheck}
      className="w-fit rounded-md border border-gray-400 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
    >
      Volver a verificar
    </button>
  )

  const retryButton = (
    <button
      type="button"
      onClick={onRetry}
      className="w-fit rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
    >
      Intentar de nuevo
    </button>
  )

  const shell = (children: ReactNode) => (
    <section aria-label="Estado del pago" className="flex flex-col gap-3">
      {children}
    </section>
  )

  if (status === 'error') {
    return shell(
      <>
        <h3 className="text-lg font-semibold text-gray-900">
          No pudimos confirmar el pago
        </h3>
        <p role="alert" className="text-base text-red-700">
          {guidance?.message ??
            'Ocurrió un error inesperado. Inténtalo de nuevo en unos momentos.'}
        </p>
        {retryButton}
      </>,
    )
  }

  if (status === 'approved') {
    return shell(
      <>
        <h3 className="text-lg font-semibold text-green-700">¡Pago aprobado!</h3>
        {priceChangedNotice}
        {transaction ? (
          <>
            <p className="text-base text-gray-800">
              Referencia: {transaction.reference}
            </p>
            <p className="text-base text-gray-800">
              Total pagado: {formatPriceCOP(transaction.amounts.totalInCents)}
            </p>
            {transaction.delivery ? (
              <p className="text-sm text-gray-600">
                Entrega asignada a {transaction.delivery.address},{' '}
                {transaction.delivery.city}, {transaction.delivery.region}
              </p>
            ) : null}
          </>
        ) : null}
      </>,
    )
  }

  if (status === 'declined') {
    return shell(
      <>
        <h3 className="text-lg font-semibold text-red-700">Pago rechazado</h3>
        <p className="text-base text-gray-800">
          Puedes intentarlo de nuevo con otra tarjeta.
        </p>
        {transaction ? (
          <p className="text-sm text-gray-600">Referencia: {transaction.reference}</p>
        ) : null}
        {retryButton}
      </>,
    )
  }

  if (status === 'voided') {
    const expired = transaction?.failureReason === 'RESERVATION_EXPIRED'
    return shell(
      <>
        <h3 className="text-lg font-semibold text-gray-900">Compra anulada</h3>
        <p className="text-base text-gray-800">
          {expired
            ? 'La reserva expiró antes de confirmar el pago. Inicia una compra nueva.'
            : 'Esta compra ya no puede completarse. Inicia una compra nueva.'}
        </p>
        {retryButton}
      </>,
    )
  }

  if (status === 'pending') {
    return shell(
      <>
        <div className="flex items-center gap-3">
          <Spinner />
          <h3 className="text-lg font-semibold text-gray-900">
            {transaction ? 'Estamos confirmando tu pago' : 'Verificando el pago…'}
          </h3>
        </div>
        <p role="status" className="text-base text-gray-700">
          {transaction
            ? 'El estado real de tu compra se está consultando en el servidor.'
            : 'Estamos consultando el estado real de tu compra.'}
        </p>
        {transaction ? (
          <p className="text-sm text-gray-600">Referencia: {transaction.reference}</p>
        ) : null}
        {guidance ? (
          <p role="alert" className="text-sm text-amber-700">
            {guidance.message}
          </p>
        ) : null}
        {recheckButton}
      </>,
    )
  }

  return shell(
    <p role="status" className="text-base text-gray-700">
      Procesando el pago…
    </p>,
  )
}
