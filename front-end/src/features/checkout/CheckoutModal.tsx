import { useEffect, useId, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import {
  selectCheckoutConfig,
  selectCheckoutConfigError,
  selectCheckoutConfigStatus,
  selectCheckoutStep,
  selectIdempotencyKey,
  selectPaymentError,
  selectPaymentStatus,
  selectPurchaseQuantity,
  selectSelectedProductId,
  selectTransaction,
  selectTransactionId,
} from '@/features/checkout/checkout.selectors'
import {
  checkoutStepChanged,
  transactionReceived,
} from '@/features/checkout/checkout.slice'
import {
  loadCheckoutConfig,
  payTransaction,
  readTransactionStatus,
  retryPurchase,
} from '@/features/checkout/checkout.thunks'
import {
  CardAndDeliveryForm,
  type CardAndDeliveryFormResult,
} from '@/features/checkout/CardAndDeliveryForm'
import { OrderSummary } from '@/features/checkout/OrderSummary'
import { PaymentStatus } from '@/features/checkout/PaymentStatus'
import { usePaymentPolling } from '@/features/checkout/usePaymentPolling'
import { Spinner } from '@/shared/ui/Spinner'
import { ErrorState } from '@/shared/ui/ErrorState'
import { isApiError } from '@/shared/api/http'
import type { ApiError } from '@/shared/api/api.errors'

export interface CheckoutModalProps {
  open: boolean
  onClose: () => void
}

const STEP_TITLES = {
  cardAndDelivery: 'Datos de pago y entrega',
  summary: 'Resumen de la compra',
  finalStatus: 'Estado del pago',
} as const

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function CheckoutModal({ open, onClose }: CheckoutModalProps) {
  const dispatch = useAppDispatch()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()

  const step = useAppSelector(selectCheckoutStep)
  const config = useAppSelector(selectCheckoutConfig)
  const configStatus = useAppSelector(selectCheckoutConfigStatus)
  const configError = useAppSelector(selectCheckoutConfigError)
  const productId = useAppSelector(selectSelectedProductId)
  const quantity = useAppSelector(selectPurchaseQuantity)
  const idempotencyKey = useAppSelector(selectIdempotencyKey)
  const transaction = useAppSelector(selectTransaction)
  const transactionId = useAppSelector(selectTransactionId)
  const paymentStatus = useAppSelector(selectPaymentStatus)
  const paymentError = useAppSelector(selectPaymentError)

  const [cardToken, setCardToken] = useState<string | null>(null)
  const [createdInstallments, setCreatedInstallments] = useState(1)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<ApiError | null>(null)

  usePaymentPolling()

  const usableConfig =
    config && config.contracts && config.installments ? config : null

  useEffect(() => {
    if (open && configStatus === 'idle') {
      void dispatch(loadCheckoutConfig())
    }
  }, [open, configStatus, dispatch])

  useEffect(() => {
    if (open && step === 'summary' && !cardToken) {
      dispatch(checkoutStepChanged('cardAndDelivery'))
    }
  }, [open, step, cardToken, dispatch])

  useEffect(() => {
    if (open && step === 'finalStatus' && transactionId && !transaction) {
      void dispatch(readTransactionStatus(transactionId))
    }
  }, [open, step, transactionId, transaction, dispatch])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    if (open) {
      headingRef.current?.focus()
    }
  }, [open, step])

  const close = () => {
    setCardToken(null)
    setCreatedInstallments(1)
    setPayError(null)
    setPaying(false)
    onClose()
  }

  const handleCreated = (result: CardAndDeliveryFormResult) => {
    setCardToken(result.cardToken)
    setCreatedInstallments(result.installments)
    setPayError(null)
    dispatch(transactionReceived(result.transaction))
    dispatch(checkoutStepChanged('summary'))
  }

  const handlePay = async () => {
    if (paying || !transaction || !cardToken) return
    setPaying(true)
    setPayError(null)

    const outcome = await dispatch(
      payTransaction({
        transactionId: transaction.id,
        cardToken,
        installments: createdInstallments,
      }),
    )
      .unwrap()
      .catch((error: ApiError) => error)

    if (isApiError(outcome)) {
      setPayError(outcome)
      const keepToken =
        outcome.kind === 'providerUnavailable' || outcome.kind === 'network'
      if (!keepToken) {
        setCardToken(null)
        dispatch(checkoutStepChanged('cardAndDelivery'))
      }
    } else {
      setCardToken(null)
      dispatch(transactionReceived(outcome))
      dispatch(checkoutStepChanged('finalStatus'))
    }
    setPaying(false)
  }

  const recheckPayment = () => {
    setPayError(null)
    if (transactionId) {
      void dispatch(readTransactionStatus(transactionId))
    }
  }

  const retryPayment = () => {
    setPayError(null)
    setCardToken(null)
    void dispatch(retryPurchase())
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (!focusables || focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const title =
    step === 'summary'
      ? STEP_TITLES.summary
      : step === 'finalStatus'
        ? STEP_TITLES.finalStatus
        : STEP_TITLES.cardAndDelivery

  const renderBody = () => {
    if (step === 'finalStatus') {
      return (
        <PaymentStatus
          transaction={transaction}
          status={paymentStatus}
          error={payError ?? paymentError}
          onRecheck={recheckPayment}
          onRetry={retryPayment}
        />
      )
    }
    if (step === 'summary' && transaction) {
      return (
        <OrderSummary
          transaction={transaction}
          paying={paying}
          error={payError}
          onPay={() => {
            void handlePay()
          }}
        />
      )
    }
    if (configStatus === 'idle' || (configStatus === 'loading' && !usableConfig)) {
      return <Spinner label="Cargando la configuración de pago…" />
    }
    if (configStatus === 'error' || !usableConfig) {
      return (
        <ErrorState
          message={
            configError?.message ??
            'No pudimos cargar la configuración de pago. Inténtalo de nuevo.'
          }
          onRetry={() => {
            void dispatch(loadCheckoutConfig())
          }}
        />
      )
    }
    if (productId) {
      return (
        <CardAndDeliveryForm
          config={usableConfig}
          idempotencyKey={idempotencyKey}
          productId={productId}
          quantity={quantity}
          onCreated={handleCreated}
        />
      )
    }
    return null
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onKeyDown={handleKeyDown}
      className="w-full max-w-lg rounded-lg p-6 backdrop:bg-black/40 open:block"
    >
      <div className="flex items-start justify-between gap-4">
        <h2
          id={titleId}
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-bold text-gray-900 focus:outline-none"
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="rounded-md px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-4">{renderBody()}</div>
    </dialog>
  )
}
