export type ApiErrorKind = 'network' | 'rateLimited' | 'server' | 'notFound'

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
}

export function createApiError(kind: ApiErrorKind): ApiError {
  return { kind, message: SAFE_MESSAGES[kind] }
}
