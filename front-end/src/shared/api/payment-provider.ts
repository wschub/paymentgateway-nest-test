import { createApiError, type ApiError } from '@/shared/api/api.errors'
import { TOKENIZATION_TIMEOUT_MS } from '@/shared/constants'

export interface TokenizeCardInput {
  baseUrl: string
  publicKey: string
  card: {
    number: string
    cvc: string
    expMonth: string
    expYear: string
    cardholder: string
  }
  timeoutMs?: number
}

export interface TokenizedCard {
  token: string
  brand: string
  lastFour: string
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function readToken(
  parsed: unknown,
): TokenizedCard | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const data = (parsed as Record<string, unknown>).data
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>
  if (!isString(record.id) || !isString(record.brand) || !isString(record.last_four)) {
    return null
  }
  return { token: record.id, brand: record.brand, lastFour: record.last_four }
}

export async function tokenizeCard(
  input: TokenizeCardInput,
): Promise<TokenizedCard | ApiError> {
  const baseUrl = input.baseUrl.trim()
  if (baseUrl.length === 0 || input.publicKey.trim().length === 0) {
    return createApiError('providerUnavailable')
  }

  const url = `${baseUrl.replace(/\/$/, '')}/tokens/cards`
  const controller = new AbortController()
  const timeoutMs = input.timeoutMs ?? TOKENIZATION_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.publicKey}`,
      },
      body: JSON.stringify({
        number: input.card.number,
        cvc: input.card.cvc,
        exp_month: input.card.expMonth,
        exp_year: input.card.expYear,
        card_holder: input.card.cardholder,
      }),
    })

    if (!response.ok) {
      return createApiError(
        response.status >= 400 && response.status < 500
          ? 'invalidToken'
          : 'providerUnavailable',
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(await response.text())
    } catch {
      return createApiError('providerUnavailable')
    }

    return readToken(parsed) ?? createApiError('providerUnavailable')
  } catch {
    return createApiError('network')
  } finally {
    clearTimeout(timer)
  }
}
