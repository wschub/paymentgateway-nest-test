import { generateIdempotencyKey } from '@/features/checkout/idempotency'
import { IDEMPOTENCY_KEY_PATTERN } from '@/shared/constants'

const realCrypto = globalThis.crypto

function installCrypto(value: unknown): void {
  Object.defineProperty(globalThis, 'crypto', {
    value,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  installCrypto(realCrypto)
})

describe('generateIdempotencyKey', () => {
  it('uses crypto.randomUUID when it produces a pattern-valid key', () => {
    const randomUUID = jest.fn(() => 'abcdef12-3456-4789-8abc-def012345678')
    const getRandomValues = jest.fn()
    installCrypto({ randomUUID, getRandomValues })

    const key = generateIdempotencyKey()

    expect(key).toBe('abcdef12-3456-4789-8abc-def012345678')
    expect(IDEMPOTENCY_KEY_PATTERN.test(key)).toBe(true)
    expect(randomUUID).toHaveBeenCalledTimes(1)
    expect(getRandomValues).not.toHaveBeenCalled()
  })

  it('falls back to crypto.getRandomValues when randomUUID is absent', () => {
    const getRandomValues = jest.fn((array: Uint8Array) => {
      for (let index = 0; index < array.length; index += 1) {
        array[index] = index + 1
      }
      return array
    })
    installCrypto({ getRandomValues })

    const key = generateIdempotencyKey()

    expect(IDEMPOTENCY_KEY_PATTERN.test(key)).toBe(true)
    expect(key.length).toBeGreaterThanOrEqual(16)
    expect(key.length).toBeLessThanOrEqual(64)
    expect(getRandomValues).toHaveBeenCalledTimes(1)
    const passed = getRandomValues.mock.calls[0][0]
    expect(passed).toBeInstanceOf(Uint8Array)
    expect(passed.length).toBeGreaterThan(0)
  })

  it('produces a different secure key per call when only getRandomValues exists', () => {
    let counter = 0
    const getRandomValues = jest.fn((array: Uint8Array) => {
      for (let index = 0; index < array.length; index += 1) {
        array[index] = (index + counter) % 256
      }
      counter += 1
      return array
    })
    installCrypto({ getRandomValues })

    const first = generateIdempotencyKey()
    const second = generateIdempotencyKey()

    expect(IDEMPOTENCY_KEY_PATTERN.test(first)).toBe(true)
    expect(IDEMPOTENCY_KEY_PATTERN.test(second)).toBe(true)
    expect(first).not.toBe(second)
  })

  it('falls back to getRandomValues when randomUUID yields a non-matching value', () => {
    const getRandomValues = jest.fn((array: Uint8Array) => {
      array.fill(7)
      return array
    })
    installCrypto({ randomUUID: () => 'too-short', getRandomValues })

    const key = generateIdempotencyKey()

    expect(IDEMPOTENCY_KEY_PATTERN.test(key)).toBe(true)
    expect(getRandomValues).toHaveBeenCalledTimes(1)
  })

  it('throws a clear error when crypto is unavailable', () => {
    installCrypto(undefined)

    expect(() => generateIdempotencyKey()).toThrow(/getRandomValues/i)
  })

  it('throws when crypto exists without getRandomValues', () => {
    installCrypto({ randomUUID: undefined })

    expect(() => generateIdempotencyKey()).toThrow(/getRandomValues/i)
  })
})
