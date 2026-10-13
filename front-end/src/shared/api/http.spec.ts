import type { ApiError } from '@/shared/api/api.errors'

type MockInit = { status?: number; body?: string }

const makeResponse = ({ status = 200, body }: MockInit) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body ?? '{}',
})

describe('httpRequest', () => {
  let fetchMock: jest.Mock

  beforeEach(() => {
    jest.dontMock('@/config')
    jest.resetModules()
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    jest.dontMock('@/config')
    jest.useRealTimers()
  })

  const load = () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/shared/api/http') as typeof import('@/shared/api/http')

  it('returns parsed JSON on a 2xx response', async () => {
    const { httpRequest } = load()
    fetchMock.mockResolvedValue(
      makeResponse({ body: JSON.stringify([{ id: 'p1' }]) }),
    )

    const result = await httpRequest<{ id: string }[]>('/products')

    expect(result).toEqual([{ id: 'p1' }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/products')
  })

  it('returns a server error and never calls fetch when the base URL is empty', async () => {
    jest.doMock('@/config', () => ({ API_URL: '' }))
    const { httpRequest } = load()

    const result = (await httpRequest('/products')) as ApiError

    expect(result.kind).toBe('server')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps 404 to notFound', async () => {
    const { httpRequest } = load()
    fetchMock.mockResolvedValue(makeResponse({ status: 404 }))
    expect(((await httpRequest('/products/x')) as ApiError).kind).toBe('notFound')
  })

  it('maps 429 to rateLimited', async () => {
    const { httpRequest } = load()
    fetchMock.mockResolvedValue(makeResponse({ status: 429 }))
    expect(((await httpRequest('/products')) as ApiError).kind).toBe(
      'rateLimited',
    )
  })

  it('maps 5xx and other statuses to server', async () => {
    const { httpRequest } = load()
    fetchMock.mockResolvedValueOnce(makeResponse({ status: 500 }))
    expect(((await httpRequest('/products')) as ApiError).kind).toBe('server')
    fetchMock.mockResolvedValueOnce(makeResponse({ status: 418 }))
    expect(((await httpRequest('/products')) as ApiError).kind).toBe('server')
  })

  it('maps 400 to server by default', async () => {
    const { httpRequest } = load()
    fetchMock.mockResolvedValue(makeResponse({ status: 400 }))
    expect(((await httpRequest('/products')) as ApiError).kind).toBe('server')
  })

  it('maps 400 to notFound only when the caller opts in for the product route', async () => {
    const { httpRequest } = load()
    fetchMock.mockResolvedValue(makeResponse({ status: 400 }))
    const result = (await httpRequest('/products/bad-id', {
      map400ToNotFound: true,
    })) as ApiError
    expect(result.kind).toBe('notFound')
  })

  it('treats invalid JSON as a server error', async () => {
    const { httpRequest } = load()
    fetchMock.mockResolvedValue(makeResponse({ body: '<html>boom</html>' }))
    expect(((await httpRequest('/products')) as ApiError).kind).toBe('server')
  })

  it('treats an unexpected/empty body as a server error', async () => {
    const { httpRequest } = load()
    fetchMock.mockResolvedValue(makeResponse({ body: '' }))
    expect(((await httpRequest('/products')) as ApiError).kind).toBe('server')
  })

  it('treats a null JSON body as a server error', async () => {
    const { httpRequest } = load()
    fetchMock.mockResolvedValue(makeResponse({ body: 'null' }))
    expect(((await httpRequest('/products')) as ApiError).kind).toBe('server')
  })

  it('builds a well-formed URL for paths without a leading slash', async () => {
    const { httpRequest } = load()
    fetchMock.mockResolvedValue(makeResponse({ body: '[]' }))
    await httpRequest('products')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/products')
  })

  it('normalises a base URL that ends with a slash', async () => {
    jest.doMock('@/config', () => ({ API_URL: 'https://api.test/' }))
    const { httpRequest } = load()
    fetchMock.mockResolvedValue(makeResponse({ body: '[]' }))
    await httpRequest('/products')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/products')
    jest.dontMock('@/config')
  })

  it('maps a network failure to network', async () => {
    const { httpRequest } = load()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(((await httpRequest('/products')) as ApiError).kind).toBe('network')
  })

  it('maps a timeout to network using the configurable timeout', async () => {
    const { httpRequest } = load()
    jest.useFakeTimers()
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          })
        }),
    )

    const pending = httpRequest('/products', { timeoutMs: 50 })
    jest.advanceTimersByTime(50)
    const result = (await pending) as ApiError

    expect(result.kind).toBe('network')
  })

  it('never surfaces raw status, body or message in the returned error', async () => {
    const { httpRequest } = load()
    fetchMock.mockResolvedValue(
      makeResponse({ status: 500, body: 'SECRET_INTERNAL_DETAIL' }),
    )
    const result = (await httpRequest('/products')) as ApiError

    expect(Object.keys(result).sort()).toEqual(['kind', 'message'])
    expect(JSON.stringify(result)).not.toContain('SECRET_INTERNAL_DETAIL')
    expect(JSON.stringify(result)).not.toContain('500')
  })

  describe('isApiError', () => {
    it('recognises an error produced by the wrapper', async () => {
      const { httpRequest, isApiError } = load()
      fetchMock.mockResolvedValue(makeResponse({ status: 503 }))
      const result = await httpRequest('/products')
      expect(isApiError(result)).toBe(true)
    })

    it('rejects non-error values', () => {
      const { isApiError } = load()
      expect(isApiError(null)).toBe(false)
      expect(isApiError('nope')).toBe(false)
      expect(isApiError({ kind: 1, message: 'x' })).toBe(false)
      expect(isApiError({ kind: 'server' })).toBe(false)
    })
  })

  describe('request logging', () => {
    let debugSpy: jest.SpyInstance

    beforeEach(() => {
      debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {})
    })

    afterEach(() => {
      debugSpy.mockRestore()
    })

    it('does not log when the build is not development', async () => {
      const { httpRequest } = load()
      fetchMock.mockResolvedValue(makeResponse({ status: 500 }))

      await httpRequest('/products')

      expect(debugSpy).not.toHaveBeenCalled()
    })

    describe('in a development build', () => {
      beforeEach(() => {
        jest.doMock('@/config', () => ({
          API_URL: 'https://api.test',
          IS_DEV: true,
        }))
      })

      it('logs exactly one line with kind, status and path on an HTTP failure', async () => {
        const { httpRequest } = load()
        fetchMock.mockResolvedValue(makeResponse({ status: 500 }))

        await httpRequest('/products')

        expect(debugSpy).toHaveBeenCalledTimes(1)
        expect(debugSpy.mock.calls[0][0]).toBe(
          'api request failed kind=server status=500 path=/products',
        )
      })

      it('logs the mapped kind together with its HTTP status', async () => {
        const { httpRequest } = load()
        fetchMock.mockResolvedValue(makeResponse({ status: 404 }))

        await httpRequest('/products/missing')

        expect(debugSpy).toHaveBeenCalledTimes(1)
        expect(debugSpy.mock.calls[0][0]).toBe(
          'api request failed kind=notFound status=404 path=/products/missing',
        )
      })

      it('omits the status when there is no HTTP response', async () => {
        const { httpRequest } = load()
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

        await httpRequest('/products')

        expect(debugSpy).toHaveBeenCalledTimes(1)
        expect(debugSpy.mock.calls[0][0]).toBe(
          'api request failed kind=network path=/products',
        )
      })

      it('logs one line when no base URL is configured', async () => {
        jest.doMock('@/config', () => ({ API_URL: '', IS_DEV: true }))
        const { httpRequest } = load()

        await httpRequest('/products')

        expect(debugSpy).toHaveBeenCalledTimes(1)
        expect(debugSpy.mock.calls[0][0]).toBe(
          'api request failed kind=server path=/products',
        )
      })

      it('logs a malformed success response with its HTTP status', async () => {
        const { httpRequest } = load()
        fetchMock.mockResolvedValue(
          makeResponse({ status: 200, body: '<html>boom</html>' }),
        )

        await httpRequest('/products')

        expect(debugSpy).toHaveBeenCalledTimes(1)
        expect(debugSpy.mock.calls[0][0]).toBe(
          'api request failed kind=server status=200 path=/products',
        )
      })

      it('never logs bodies, headers or query values', async () => {
        const { httpRequest } = load()
        fetchMock.mockResolvedValue(
          makeResponse({ status: 500, body: 'SECRET_BODY_DETAIL' }),
        )

        await httpRequest('/products?token=SECRET_QUERY_VALUE')

        expect(debugSpy).toHaveBeenCalledTimes(1)
        const line = String(debugSpy.mock.calls[0][0])
        expect(line).not.toContain('SECRET_BODY_DETAIL')
        expect(line).not.toContain('SECRET_QUERY_VALUE')
        expect(line).not.toContain('https://api.test')
        expect(line).toBe(
          'api request failed kind=server status=500 path=/products',
        )
      })

      it('does not log anything for a successful request', async () => {
        const { httpRequest } = load()
        fetchMock.mockResolvedValue(makeResponse({ body: '[]' }))

        await httpRequest('/products')

        expect(debugSpy).not.toHaveBeenCalled()
      })
    })
  })
})
