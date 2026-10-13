import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { selectSelectedProductId } from '@/features/checkout/checkout.selectors'
import { purchaseStarted } from '@/features/checkout/checkout.slice'
import { restoreProgress } from '@/features/checkout/checkout.thunks'
import { selectProductQuantity } from '@/features/product/product.selectors'
import { fetchProduct, productOpened } from '@/features/product/product.slice'
import { clampQuantity, isPurchasable } from '@/shared/product'

export interface ProductReRead {
  notice: string | null
  requestPurchase: (onStarted?: (quantity: number) => void) => void
  retry: () => void
}

function stockAdjustedMessage(stock: number, quantity: number): string {
  return `Quedan ${stock} unidades disponibles; la cantidad se ajustó a ${quantity}.`
}

export function useProductReRead(id: string): ProductReRead {
  const dispatch = useAppDispatch()
  const selectedProductId = useAppSelector(selectSelectedProductId)
  const quantity = useAppSelector(selectProductQuantity)

  const [notice, setNotice] = useState<string | null>(null)

  const selectedIdRef = useRef(selectedProductId)
  useEffect(() => {
    selectedIdRef.current = selectedProductId
  }, [selectedProductId])

  const quantityRef = useRef(quantity)
  useEffect(() => {
    quantityRef.current = quantity
  }, [quantity])

  const isResumed = useCallback(
    () => selectedIdRef.current !== null && selectedIdRef.current === id,
    [id],
  )

  useEffect(() => {
    if (isResumed()) {
      void dispatch(restoreProgress())
    } else {
      dispatch(productOpened())
      void dispatch(fetchProduct(id))
    }
  }, [id, dispatch, isResumed])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return
      }
      const before = quantityRef.current
      void dispatch(fetchProduct(id)).then((result) => {
        if (!fetchProduct.fulfilled.match(result)) {
          return
        }
        const adjusted = clampQuantity(before, result.payload.stock)
        if (result.payload.stock > 0 && adjusted < before) {
          setNotice(stockAdjustedMessage(result.payload.stock, adjusted))
        }
      })
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [id, dispatch])

  const retry = useCallback(() => {
    if (isResumed()) {
      void dispatch(restoreProgress())
    } else {
      void dispatch(fetchProduct(id))
    }
  }, [dispatch, id, isResumed])

  const requestPurchase = useCallback((onStarted?: (quantity: number) => void) => {
    const before = quantityRef.current
    void dispatch(fetchProduct(id)).then((result) => {
      if (!fetchProduct.fulfilled.match(result)) {
        return
      }
      const fresh = result.payload
      if (!isPurchasable(fresh.stock)) {
        setNotice('El producto se agotó: no es posible iniciar la compra.')
        return
      }
      const adjusted = clampQuantity(before, fresh.stock)
      if (adjusted < before) {
        setNotice(stockAdjustedMessage(fresh.stock, adjusted))
      }
      dispatch(purchaseStarted({ productId: id, quantity: adjusted }))
      onStarted?.(adjusted)
    })
  }, [dispatch, id])

  return { notice, requestPurchase, retry }
}
