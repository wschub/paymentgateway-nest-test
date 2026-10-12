import {
  createApiError,
  type ApiError,
  type ApiErrorKind,
} from '@/shared/api/api.errors'

const KINDS: ApiErrorKind[] = ['network', 'rateLimited', 'server', 'notFound']

describe('api.errors', () => {
  it.each(KINDS)('creates a plain object error for kind "%s"', (kind) => {
    const error: ApiError = createApiError(kind)

    expect(error.kind).toBe(kind)
    expect(typeof error.message).toBe('string')
    expect(error.message.length).toBeGreaterThan(0)
  })

  it('returns a plain object, never an Error instance', () => {
    for (const kind of KINDS) {
      const error = createApiError(kind)
      expect(Object.getPrototypeOf(error)).toBe(Object.prototype)
      expect(error).not.toBeInstanceOf(Error)
    }
  })

  it('exposes only safe serializable fields', () => {
    const error = createApiError('server')
    expect(Object.keys(error).sort()).toEqual(['kind', 'message'])
    expect(JSON.parse(JSON.stringify(error))).toEqual(error)
  })

  it('rejects an unknown kind at compile time', () => {
    // @ts-expect-error - an unknown kind must not be assignable to ApiErrorKind
    const invalid: ApiErrorKind = 'timeout'
    expect(invalid).toBeDefined()
  })

  it('gives each kind a distinct safe message', () => {
    const messages = KINDS.map((kind) => createApiError(kind).message)
    expect(new Set(messages).size).toBe(KINDS.length)
  })
})
