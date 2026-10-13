import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import {
  selectCheckoutStep,
  selectPaymentStatus,
  selectTransactionId,
} from '@/features/checkout/checkout.selectors'
import { readTransactionStatus } from '@/features/checkout/checkout.thunks'
import {
  STATUS_POLL_CEILING_MS,
  STATUS_POLL_INTERVAL_MS,
} from '@/shared/constants'

export interface UsePaymentPollingOptions {
  intervalMs?: number
  ceilingMs?: number
}

export function usePaymentPolling(
  options: UsePaymentPollingOptions = {},
): void {
  const { intervalMs = STATUS_POLL_INTERVAL_MS, ceilingMs = STATUS_POLL_CEILING_MS } =
    options

  const dispatch = useAppDispatch()
  const transactionId = useAppSelector(selectTransactionId)
  const paymentStatus = useAppSelector(selectPaymentStatus)
  const currentStep = useAppSelector(selectCheckoutStep)

  const startedAtRef = useRef<number | null>(null)

  const active =
    Boolean(transactionId) &&
    paymentStatus === 'pending' &&
    currentStep === 'finalStatus'

  useEffect(() => {
    if (!active || !transactionId) {
      startedAtRef.current = null
      return
    }

    startedAtRef.current = Date.now()
    const timer = window.setInterval(() => {
      const startedAt = startedAtRef.current
      if (startedAt === null) {
        return
      }
      if (Date.now() - startedAt >= ceilingMs) {
        window.clearInterval(timer)
        return
      }
      void dispatch(readTransactionStatus(transactionId))
    }, intervalMs)

    return () => {
      window.clearInterval(timer)
      startedAtRef.current = null
    }
  }, [active, transactionId, paymentStatus, currentStep, dispatch, intervalMs, ceilingMs])
}
