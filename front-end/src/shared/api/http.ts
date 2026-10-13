import { API_URL, IS_DEV } from '@/config'
import {
  createApiError,
  type ApiError,
  type ApiErrorKind,
} from './api.errors'

export const DEFAULT_TIMEOUT_MS = 10_000

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface HttpOptions {
  timeoutMs?: number
  map400ToNotFound?: boolean
  method?: HttpMethod
  body?: unknown
  headers?: Record<string, string>
}

const CODE_KINDS: Record<number, Record<string, ApiErrorKind>> = {
  409: {
    INSUFFICIENT_STOCK: 'soldOut',
    IDEMPOTENCY_KEY_REUSED: 'idempotencyConflict',
    TRANSACTION_NOT_PAYABLE: 'notPayable',
  },
  422: {
    CONTRACTS_NOT_ACCEPTED: 'contractsNotAccepted',
    INVALID_PAYMENT_TOKEN: 'invalidToken',
  },
}

function logRequestFailure(
  kind: ApiErrorKind,
  path: string,
  status?: number,
): void {
  if (!IS_DEV) {
    return
  }
  const safePath = path.split(/[?#]/)[0]
  const tokens = ['api request failed', `kind=${kind}`]
  if (typeof status === 'number') {
    tokens.push(`status=${status}`)
  }
  tokens.push(`path=${safePath}`)
  console.debug(tokens.join(' '))
}

export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.kind === 'string' && typeof candidate.message === 'string'
  )
}

function mapStatusToKind(
  status: number,
  code: string | undefined,
  options: HttpOptions,
): ApiErrorKind {
  if (status === 404) {
    return 'notFound'
  }
  if (status === 429) {
    return 'rateLimited'
  }
  if (status === 400) {
    return options.map400ToNotFound ? 'notFound' : 'badRequest'
  }
  if (status === 502) {
    return 'providerRejected'
  }
  if (status === 503) {
    return 'providerUnavailable'
  }
  const byCode = CODE_KINDS[status]
  if (byCode && typeof code === 'string' && byCode[code]) {
    return byCode[code]
  }
  return 'server'
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text()
    if (text.trim().length === 0) {
      return undefined
    }
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null) {
      const code = (parsed as Record<string, unknown>).code
      if (typeof code === 'string') {
        return code
      }
    }
  } catch {
    // an unreadable error body is fine; the status alone still maps to a kind
  }
  return undefined
}

export async function httpRequest<T>(
  path: string,
  options: HttpOptions = {},
): Promise<T | ApiError> {
  if (API_URL.trim().length === 0) {
    logRequestFailure('server', path)
    return createApiError('server')
  }

  const url = `${API_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  }
  if (options.body !== undefined && headers['Content-Type'] === undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    signal: controller.signal,
    headers,
  }
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body)
  }

  try {
    const response = await fetch(url, init)

    if (!response.ok) {
      const code = await readErrorCode(response)
      const kind = mapStatusToKind(response.status, code, options)
      logRequestFailure(kind, path, response.status)
      return createApiError(kind)
    }

    const text = await response.text()
    if (text.trim().length === 0) {
      logRequestFailure('server', path, response.status)
      return createApiError('server')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      logRequestFailure('server', path, response.status)
      return createApiError('server')
    }

    if (parsed === null || parsed === undefined) {
      logRequestFailure('server', path, response.status)
      return createApiError('server')
    }

    return parsed as T
  } catch {
    logRequestFailure('network', path)
    return createApiError('network')
  } finally {
    clearTimeout(timer)
  }
}
