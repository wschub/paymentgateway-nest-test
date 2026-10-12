import React from 'react'
import { render, screen } from '@testing-library/react'
import {
  makeStore,
  store,
  type AppDispatch,
  type RootState,
} from '@/app/store'
import { AppProviders } from '@/app/providers'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { fetchCatalog } from '@/features/catalog/catalog.slice'
import { createApiError } from '@/shared/api/api.errors'

describe('store', () => {
  it('combines the catalog, product and checkout reducers', () => {
    const state: RootState = store.getState()
    expect(Object.keys(state).sort()).toEqual([
      'catalog',
      'checkout',
      'product',
    ])
  })

  it('creates an isolated store per call via makeStore', () => {
    const first = makeStore()
    const second = makeStore()
    expect(first).not.toBe(second)
    expect(first.getState().catalog.status).toBe('idle')
    expect(second.getState().catalog.status).toBe('idle')
  })

  it('honours a preloaded checkout state', () => {
    const instance = makeStore({
      catalog: undefined,
      product: undefined,
      checkout: {
        currentStep: 'summary',
        selectedProductId: '11111111-1111-4111-8111-111111111111',
        quantity: 3,
        delivery: null,
        transactionId: 'tx-1',
      },
    })
    expect(instance.getState().checkout).toMatchObject({
      currentStep: 'summary',
      quantity: 3,
      transactionId: 'tx-1',
    })
  })

  it('keeps the state JSON-serializable with plain error objects', () => {
    const instance = makeStore()
    instance.dispatch({
      type: fetchCatalog.pending.type,
      meta: { requestId: 'r1', requestStatus: 'pending', arg: undefined },
    })
    instance.dispatch({
      type: fetchCatalog.rejected.type,
      payload: createApiError('server'),
      error: { message: 'Rejected' },
      meta: {
        requestId: 'r1',
        requestStatus: 'rejected',
        arg: undefined,
        rejectedWithValue: true,
      },
    })

    const roundTrip = JSON.parse(JSON.stringify(instance.getState())) as RootState
    expect(roundTrip.catalog.error?.kind).toBe('server')
    expect(roundTrip.catalog.error?.message).toBe(
      createApiError('server').message,
    )
  })

  it('keeps the serializability middleware enabled', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const instance = makeStore()

    instance.dispatch({
      type: 'test/non-serializable',
      payload: new Date(), // not a plain serializable value
    })

    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('exports an AppDispatch type compatible with the default store', () => {
    const dispatch: AppDispatch = store.dispatch
    expect(typeof dispatch).toBe('function')
  })
})

describe('typed hooks and provider', () => {
  function Probe() {
    const dispatch = useAppDispatch()
    const step = useAppSelector((state) => state.checkout.currentStep)
    return React.createElement(
      'div',
      null,
      String(typeof dispatch === 'function' && step === 'product'),
    )
  }

  it('provides the store and the typed hooks to components', () => {
    render(
      React.createElement(
        AppProviders,
        null,
        React.createElement(Probe),
      ),
    )
    expect(screen.getByText('true')).toBeInTheDocument()
  })
})