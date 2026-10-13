export type ApiErrorKind =
  | 'network'
  | 'rateLimited'
  | 'server'
  | 'notFound'
  | 'soldOut'
  | 'idempotencyConflict'
  | 'notPayable'
  | 'contractsNotAccepted'
  | 'invalidToken'
  | 'providerRejected'
  | 'providerUnavailable'
  | 'badRequest'

export interface ApiError {
  kind: ApiErrorKind
  message: string
}

const SAFE_MESSAGES: Record<ApiErrorKind, string> = {
  network:
    'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  rateLimited:
    'Hay demasiadas solicitudes en este momento. Espera un momento e inténtalo de nuevo.',
  server: 'Ocurrió un error inesperado. Inténtalo de nuevo en unos momentos.',
  notFound: 'No encontramos lo que buscabas.',
  soldOut: 'Este producto se agotó. Ajusta la cantidad o elige otro.',
  idempotencyConflict:
    'Esta compra ya no puede continuar. Inicia una compra nueva.',
  notPayable: 'Esta compra no puede pagarse en su estado actual.',
  contractsNotAccepted: 'Debes aceptar ambos contratos para continuar.',
  invalidToken:
    'No pudimos validar los datos de la tarjeta. Vuelve a ingresarlos.',
  providerRejected: 'El pago no fue aprobado. Inténtalo de nuevo.',
  providerUnavailable:
    'El servicio de pagos no está disponible. Inténtalo de nuevo en unos momentos.',
  badRequest: 'Revisa los datos ingresados e inténtalo de nuevo.',
}

export function createApiError(kind: ApiErrorKind): ApiError {
  return { kind, message: SAFE_MESSAGES[kind] }
}
