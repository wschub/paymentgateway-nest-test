import { IDEMPOTENCY_KEY_PATTERN } from '@/shared/constants'

function fallbackKey(): string {
  const time = Date.now().toString(36)
  const random = `${Math.random().toString(36).slice(2, 12)}${Math.random()
    .toString(36)
    .slice(2, 12)}`
  const key = `${time}-${random}`.replace(/[^A-Za-z0-9_-]/g, '')
  return key.length >= 16 ? key : `${key}${'0'.repeat(16 - key.length)}`
}

export function generateIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid && IDEMPOTENCY_KEY_PATTERN.test(uuid)) {
    return uuid
  }
  return fallbackKey()
}
