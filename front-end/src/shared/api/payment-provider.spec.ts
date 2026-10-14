import { tokenizeCard } from '@/shared/api/payment-provider'
import type { ApiError } from '@/shared/api/api.errors'

const CARD = {
  number: '4242424242424242',
  cvc: '123',
  expMonth: '12',
  expYear: '29',
  cardholder: 'Test Buyer',
}

const input = () => ({
  baseUrl: 'https://sandbox.gateway.test/v1',
  publicKey: 'pub_test_abc',
  card: { ...CARD },
})

const makeResponse = (status: number, payload: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
})

describe('tokenizeCard', () => {
  let fetchMock: jest.Mock
  let consoleSpy: jest.SpyInstance

  beforeEach(() => {
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined)
    jest
      .spyOn(console, 'info')
      .mockImplementation(() => undefined)
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('returns the single-use token with brand and last four on success', async () => {
    fetchMock.mockResolvedValue(
      makeResponse(201, {
        status: 'CREATED',
        data: {
          id: 'tok_test_123',
          brand: 'VISA',
          last_four: '4242',
          name: 'VISA',
        },
      }),
    )

    const result = await tokenizeCard(input())

    expect(result).toEqual({ token: 'tok_test_123', brand: 'VISA', lastFour: '4242' })
  })

  it('posts to {baseUrl}/tokens/cards with the bearer key and provider field names', async () => {
    fetchMock.mockResolvedValue(
      makeResponse(201, {
        status: 'CREATED',
        data: { id: 'tok_1', brand: 'VISA', last_four: '4242', name: 'VISA' },
      }),
    )

    await tokenizeCard(input())

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://sandbox.gateway.test/v1/tokens/cards')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer pub_test_abc')
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual({
      number: '4242424242424242',
      cvc: '123',
      exp_month: '12',
      exp_year: '29',
      card_holder: 'Test Buyer',
    })
  })

  it.each([
    ['4242 4242 4242 4242', '4242424242424242'],
    ['4242-4242-4242-4242', '4242424242424242'],
    ['  4242 4242 4242 4242  ', '4242424242424242'],
  ])(
    'normalizes the displayed number %p to digits only before POSTing it',
    async (displayed, digits) => {
      fetchMock.mockResolvedValue(
        makeResponse(201, {
          status: 'CREATED',
          data: { id: 'tok_1', brand: 'VISA', last_four: '4242', name: 'VISA' },
        }),
      )

      await tokenizeCard({ ...input(), card: { ...CARD, number: displayed } })

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(String(init.body)) as Record<string, string>
      expect(body.number).toBe(digits)
      expect(body.number).toMatch(/^\d{12,19}$/)
    },
  )

  it('normalizes every card field before POSTing it', async () => {
    fetchMock.mockResolvedValue(
      makeResponse(201, {
        status: 'CREATED',
        data: { id: 'tok_1', brand: 'VISA', last_four: '4242', name: 'VISA' },
      }),
    )

    await tokenizeCard({
      ...input(),
      card: {
        number: '4242 4242 4242 4242',
        cvc: '1 23',
        expMonth: '8',
        expYear: '2029',
        cardholder: '  Test Buyer  ',
      },
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      number: '4242424242424242',
      cvc: '123',
      exp_month: '08',
      exp_year: '29',
      card_holder: 'Test Buyer',
    })
  })

  it('never logs the card number or CVC', async () => {
    fetchMock.mockResolvedValue(
      makeResponse(201, {
        status: 'CREATED',
        data: { id: 'tok_1', brand: 'VISA', last_four: '4242', name: 'VISA' },
      }),
    )

    await tokenizeCard(input())

    const logged = [
      ...consoleSpy.mock.calls,
      ...(console.info as jest.Mock).mock.calls,
      ...(console.warn as jest.Mock).mock.calls,
      ...(console.error as jest.Mock).mock.calls,
      ...(console.log as jest.Mock).mock.calls,
    ]
    const serialized = JSON.stringify(logged)
    expect(serialized).not.toContain(CARD.number)
    expect(serialized).not.toContain(CARD.cvc)
  })

  it.each([400, 402, 422])('maps a %i validation failure to invalidToken', async (status) => {
    fetchMock.mockResolvedValue(makeResponse(status, { message: 'bad card' }))

    const result = (await tokenizeCard(input())) as ApiError

    expect(result.kind).toBe('invalidToken')
  })

  it.each([500, 502, 503])('maps a %i provider failure to providerUnavailable', async (status) => {
    fetchMock.mockResolvedValue(makeResponse(status, { message: 'boom' }))

    const result = (await tokenizeCard(input())) as ApiError

    expect(result.kind).toBe('providerUnavailable')
  })

  it('maps an unreadable or unexpected response to providerUnavailable', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { status: 'CREATED' }))

    const result = (await tokenizeCard(input())) as ApiError

    expect(result.kind).toBe('providerUnavailable')
  })

  it('maps a transport failure to network', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed to fetch'))

    const result = (await tokenizeCard(input())) as ApiError

    expect(result.kind).toBe('network')
  })

  it('maps a timeout to network', async () => {
    jest.useFakeTimers()
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )

    const pending = tokenizeCard({ ...input(), timeoutMs: 50 })
    jest.advanceTimersByTime(60)

    const result = (await pending) as ApiError
    expect(result.kind).toBe('network')
  })
})
