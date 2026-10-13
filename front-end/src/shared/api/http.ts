import { API_URL, IS_DEV } from '@/config'
import {
  createApiError,
  type ApiError,
  type ApiErrorKind,
} from './api.errors'

export const DEFAULT_TIMEOUT_MS = 10_000

export interface HttpOptions {
  timeoutMs?: number
  map400ToNotFound?: boolean
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

function mapStatusToKind(status: number, options: HttpOptions): ApiErrorKind {
  if (status === 404) {
    return 'notFound'
  }
  if (status === 429) {
    return 'rateLimited'
  }
  if (status === 400 && options.map400ToNotFound) {
    return 'notFound'
  }
  return 'server'
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

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      const kind = mapStatusToKind(response.status, options)
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
