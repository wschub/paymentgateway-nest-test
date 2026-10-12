import { API_URL } from '@/config'
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
      return createApiError(mapStatusToKind(response.status, options))
    }

    const text = await response.text()
    if (text.trim().length === 0) {
      return createApiError('server')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return createApiError('server')
    }

    if (parsed === null || parsed === undefined) {
      return createApiError('server')
    }

    return parsed as T
  } catch {
    return createApiError('network')
  } finally {
    clearTimeout(timer)
  }
}
