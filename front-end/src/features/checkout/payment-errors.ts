import {
  createApiError,
  type ApiError,
  type ApiErrorKind,
} from '@/shared/api/api.errors'

/**
 * The next action the UI should offer for a payment error. Only the action is
 * derived from the error `kind`; the visible text is always our own copy and
 * never the raw back-end `message`/`path`/`code` nor any provider text.
 */
export type PaymentErrorAction =
  | 'retry'
  | 'reenterCard'
  | 'adjustQuantity'
  | 'startFresh'
  | 'showStatus'
  | 'acceptContracts'

export interface PaymentErrorGuidance {
  kind: ApiErrorKind
  message: string
  action: PaymentErrorAction
  actionLabel: string
}

interface ActionSpec {
  action: PaymentErrorAction
  actionLabel: string
}

const ACTIONS: Record<ApiErrorKind, ActionSpec> = {
  soldOut: {
    action: 'adjustQuantity',
    actionLabel: 'Ajusta la cantidad o elige otro producto',
  },
  notPayable: {
    action: 'showStatus',
    actionLabel: 'Ver el estado actual de la compra',
  },
  invalidToken: {
    action: 'reenterCard',
    actionLabel: 'Volver a ingresar la tarjeta',
  },
  providerUnavailable: { action: 'retry', actionLabel: 'Reintentar' },
  network: { action: 'retry', actionLabel: 'Reintentar' },
  rateLimited: { action: 'retry', actionLabel: 'Reintentar' },
  providerRejected: { action: 'retry', actionLabel: 'Reintentar' },
  server: { action: 'retry', actionLabel: 'Reintentar' },
  badRequest: { action: 'retry', actionLabel: 'Revisar e intentar de nuevo' },
  idempotencyConflict: {
    action: 'startFresh',
    actionLabel: 'Iniciar una compra nueva',
  },
  notFound: {
    action: 'startFresh',
    actionLabel: 'Iniciar una compra nueva',
  },
  contractsNotAccepted: {
    action: 'acceptContracts',
    actionLabel: 'Acepta ambos contratos',
  },
  statusUnavailable: {
    action: 'showStatus',
    actionLabel: 'Volver a verificar',
  },
}

const FALLBACK_KIND: ApiErrorKind = 'server'

const hasAction = (kind: ApiErrorKind): boolean =>
  Object.prototype.hasOwnProperty.call(ACTIONS, kind)

/**
 * Turns any API error into safe, non-technical copy plus a next action. The
 * message is rebuilt from `kind` alone, so a back-end `message`, `path` or
 * `code` and any provider text can never reach the screen.
 */
export function describePaymentError(
  error: ApiError | null | undefined,
): PaymentErrorGuidance | null {
  if (!error) {
    return null
  }

  const kind: ApiErrorKind = hasAction(error.kind) ? error.kind : FALLBACK_KIND
  const { action, actionLabel } = ACTIONS[kind]

  return {
    kind,
    message: createApiError(kind).message,
    action,
    actionLabel,
  }
}
