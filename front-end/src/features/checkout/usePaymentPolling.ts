import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import {
  selectCheckoutStep,
  selectPaymentStatus,
  selectTransactionId,
} from '@/features/checkout/checkout.selectors'
import { paymentFailed, transactionReadStarted } from '@/features/checkout/checkout.slice'
import { readTransactionStatus } from '@/features/checkout/checkout.thunks'
import { createApiError } from '@/shared/api/api.errors'
import {
  STATUS_POLL_CEILING_MS,
  STATUS_POLL_INTERVAL_MS,
} from '@/shared/constants'

/**
 * Sentinel written to `lastReadRequestId` at the polling ceiling: it makes any
 * status read still in flight resolve to a no-op (the thunk's `lastReadRequestId`
 * guard), so its stale answer cannot revive the flow after the window closed.
 */
const CEILING_READ_GUARD = 'polling-ceiling-reached'

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
  // Latest committed status, so a ceiling tick that races the last in-flight
  // read can never overwrite an already-final status with the timeout state.
  const statusRef = useRef(paymentStatus)
  useEffect(() => {
    statusRef.current = paymentStatus
  }, [paymentStatus])

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
        startedAtRef.current = null
        // The 40 s window ended without a final status: the outcome is unknown
        // client-side, so show the status-unavailable timeout state (US2.5) —
        // never a success, never an endless spinner. The shopper can ask the
        // server again manually ("Volver a verificar"), and a later recovery
        // (GET /transactions/:id) still discovers the real outcome.
        if (statusRef.current === 'pending') {
          // Drop any read still in flight, then show the timeout state.
          dispatch(transactionReadStarted(CEILING_READ_GUARD))
          dispatch(paymentFailed(createApiError('statusUnavailable')))
        }
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
