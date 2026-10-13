import { IDEMPOTENCY_KEY_PATTERN } from '@/shared/constants'

const KEY_BYTE_LENGTH = 18
const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const MISSING_CRYPTO_MESSAGE =
  'No se pudo generar una clave de idempotencia segura: crypto.getRandomValues no está disponible en este navegador.'

const PATTERN_MISMATCH_MESSAGE =
  'La clave de idempotencia generada no cumple el formato requerido.'

export function base64UrlEncode(bytes: Uint8Array): string {
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const byte0 = bytes[index]
    const byte1 = index + 1 < bytes.length ? bytes[index + 1] : undefined
    const byte2 = index + 2 < bytes.length ? bytes[index + 2] : undefined

    output += BASE64URL_ALPHABET[byte0 >> 2]
    output += BASE64URL_ALPHABET[
      ((byte0 & 0x03) << 4) | (byte1 === undefined ? 0 : byte1 >> 4)
    ]
    if (byte1 === undefined) {
      break
    }
    output += BASE64URL_ALPHABET[
      ((byte1 & 0x0f) << 2) | (byte2 === undefined ? 0 : byte2 >> 6)
    ]
    if (byte2 === undefined) {
      break
    }
    output += BASE64URL_ALPHABET[byte2 & 0x3f]
  }
  return output
}

export function assertValidKey(key: string): string {
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new Error(PATTERN_MISMATCH_MESSAGE)
  }
  return key
}

function randomKey(): string {
  const cryptoObject = globalThis.crypto
  if (!cryptoObject || typeof cryptoObject.getRandomValues !== 'function') {
    throw new Error(MISSING_CRYPTO_MESSAGE)
  }

  const bytes = new Uint8Array(KEY_BYTE_LENGTH)
  cryptoObject.getRandomValues(bytes)

  return assertValidKey(base64UrlEncode(bytes))
}

export function generateIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (typeof uuid === 'string' && IDEMPOTENCY_KEY_PATTERN.test(uuid)) {
    return uuid
  }
  return randomKey()
}
