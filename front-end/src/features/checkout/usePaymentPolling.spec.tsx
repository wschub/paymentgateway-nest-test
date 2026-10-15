import { act, render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { makeStore, type AppStore, type RootState } from '@/app/store'
import { usePaymentPolling } from '@/features/checkout/usePaymentPolling'
import type {
  TransactionStatus,
  TransactionView,
} from '@/features/checkout/checkout.types'
import {
  STATUS_POLL_CEILING_MS,
  STATUS_POLL_INTERVAL_MS,
} from '@/shared/constants'
import { httpRequest } from '@/shared/api/http'

jest.mock('@/shared/api/http', () => ({
  httpRequest: jest.fn(),
  isApiError: (value: unknown) =>
    typeof value === 'object' &&
    value !== null &&
    'kind' in (value as Record<string, unknown>),
}))

const mockedHttpRequest = httpRequest as jest.MockedFunction<typeof httpRequest>

const TRANSACTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function buildTransaction(status: TransactionStatus): TransactionView {
  return {
    id: TRANSACTION_ID,
    reference: 'REF-1',
    status,
    quantity: 2,
    amounts: {
      productAmountInCents: 7000000,
      baseFeeInCents: 500000,
      deliveryFeeInCents: 1200000,
      totalInCents: 8700000,
    },
    card: null,
    product: { id: 'p1', name: 'Mouse', quantity: 2 },
    delivery: null,
    failureReason: null,
  }
}

function Host() {
  usePaymentPolling()
  return <div data-testid="host" />
}

function renderPolling(status: 'pending' | 'approved'): { store: AppStore; unmount: () => void } {
  const store = makeStore({
    checkout: {
      currentStep: 'finalStatus',
      selectedProductId: 'p1',
      quantity: 2,
      delivery: null,
      transactionId: TRANSACTION_ID,
      idempotencyKey: 'key-1234567890abcdef',
      cardBrand: null,
      cardLastFour: null,
      installments: 1,
      contractsAccepted: false,
      paymentStatus: status,
      paymentError: null,
    },
  } as Partial<RootState>)

  const { unmount } = render(
    <Provider store={store}>
      <Host />
    </Provider>,
  )
  return { store, unmount }
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('usePaymentPolling', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockedHttpRequest.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('reads on a fixed interval while the transaction stays pending', async () => {
    mockedHttpRequest.mockResolvedValue(buildTransaction('PENDING'))
    renderPolling('pending')

    await act(async () => {
      jest.advanceTimersByTime(STATUS_POLL_INTERVAL_MS)
    })
    await flush()
    expect(mockedHttpRequest).toHaveBeenCalledTimes(1)

    await act(async () => {
      jest.advanceTimersByTime(STATUS_POLL_INTERVAL_MS)
    })
    await flush()
    expect(mockedHttpRequest).toHaveBeenCalledTimes(2)

    await act(async () => {
      jest.advanceTimersByTime(STATUS_POLL_INTERVAL_MS)
    })
    await flush()
    expect(mockedHttpRequest).toHaveBeenCalledTimes(3)

    expect(mockedHttpRequest).toHaveBeenCalledWith(`/transactions/${TRANSACTION_ID}`, {
      map400ToNotFound: true,
    })
  })

  it('stops polling once the status becomes final', async () => {
    mockedHttpRequest.mockResolvedValue(buildTransaction('APPROVED'))
    const { store } = renderPolling('pending')

    await act(async () => {
      jest.advanceTimersByTime(STATUS_POLL_INTERVAL_MS)
    })
    await flush()

    expect(mockedHttpRequest).toHaveBeenCalledTimes(1)
    expect(store.getState().checkout.paymentStatus).toBe('approved')

    await act(async () => {
      jest.advanceTimersByTime(STATUS_POLL_INTERVAL_MS * 5)
    })
    await flush()

    expect(mockedHttpRequest).toHaveBeenCalledTimes(1)
  })

  it('stops polling immediately when the first read resolves DECLINED', async () => {
    mockedHttpRequest.mockResolvedValue(buildTransaction('DECLINED'))
    const { store } = renderPolling('pending')

    await act(async () => {
      jest.advanceTimersByTime(STATUS_POLL_INTERVAL_MS)
    })
    await flush()

    expect(mockedHttpRequest).toHaveBeenCalledTimes(1)
    expect(store.getState().checkout.paymentStatus).toBe('declined')

    await act(async () => {
      jest.advanceTimersByTime(STATUS_POLL_INTERVAL_MS * 5)
    })
    await flush()

    // A first-poll final status ends polling with no extra request (SC-003).
    expect(mockedHttpRequest).toHaveBeenCalledTimes(1)
  })

  it('switches to the status-unavailable timeout state at the ceiling without a final status (US2.5)', async () => {
    mockedHttpRequest.mockResolvedValue(buildTransaction('PENDING'))
    const { store } = renderPolling('pending')

    await act(async () => {
      jest.advanceTimersByTime(STATUS_POLL_CEILING_MS)
    })
    await flush()

    const atCeiling = mockedHttpRequest.mock.calls.length
    expect(atCeiling).toBeGreaterThan(0)
    expect(atCeiling).toBeLessThanOrEqual(STATUS_POLL_CEILING_MS / STATUS_POLL_INTERVAL_MS)

    // Never a success, never an endless spinner: the ceiling renders the
    // status-unavailable timeout state and releases the lock.
    const checkout = store.getState().checkout
    expect(checkout.paymentStatus).toBe('error')
    expect(checkout.paymentStatus).not.toBe('approved')
    expect(checkout.paymentError).toEqual(
      expect.objectContaining({ kind: 'statusUnavailable' }),
    )

    // The window is over: no automatic poll may outlive the ceiling (SC-003).
    await act(async () => {
      jest.advanceTimersByTime(STATUS_POLL_CEILING_MS)
    })
    await flush()

    expect(mockedHttpRequest.mock.calls.length).toBe(atCeiling)
  })

  it('cancels the interval on unmount', async () => {
    mockedHttpRequest.mockResolvedValue(buildTransaction('PENDING'))
    const { unmount } = renderPolling('pending')

    unmount()

    await act(async () => {
      jest.advanceTimersByTime(STATUS_POLL_INTERVAL_MS * 3)
    })
    await flush()

    expect(mockedHttpRequest).not.toHaveBeenCalled()
  })

  it('never starts polling for an already-final transaction', async () => {
    renderPolling('approved')

    await act(async () => {
      jest.advanceTimersByTime(STATUS_POLL_CEILING_MS)
    })
    await flush()

    expect(mockedHttpRequest).not.toHaveBeenCalled()
  })
})
