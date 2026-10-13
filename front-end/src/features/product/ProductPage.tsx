import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import {
  selectProductDetail,
  selectProductError,
  selectProductQuantity,
  selectProductStatus,
} from '@/features/product/product.selectors'
import {
  fetchProduct,
  productOpened,
  quantityChanged,
} from '@/features/product/product.slice'
import { QuantitySelector } from '@/features/product/QuantitySelector'
import {
  selectPurchaseQuantity,
  selectSelectedProductId,
} from '@/features/checkout/checkout.selectors'
import {
  purchaseStarted,
  startOver,
} from '@/features/checkout/checkout.slice'
import { restoreProgress } from '@/features/checkout/checkout.thunks'
import { Image } from '@/shared/ui/Image'
import { Spinner } from '@/shared/ui/Spinner'
import { ErrorState } from '@/shared/ui/ErrorState'
import { formatPriceCOP } from '@/shared/format/money'
import { isPurchasable } from '@/shared/product'
import { STORE_NAME } from '@/shared/constants'

const DETAIL_IMAGE_WIDTH = 400
const DETAIL_IMAGE_HEIGHT = 300

export function ProductPage() {
  const { id = '' } = useParams<{ id: string }>()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const product = useAppSelector(selectProductDetail)
  const status = useAppSelector(selectProductStatus)
  const error = useAppSelector(selectProductError)
  const quantity = useAppSelector(selectProductQuantity)

  const selectedProductId = useAppSelector(selectSelectedProductId)
  const checkoutQuantity = useAppSelector(selectPurchaseQuantity)

  const selectedIdRef = useRef(selectedProductId)
  useEffect(() => {
    selectedIdRef.current = selectedProductId
  }, [selectedProductId])

  useEffect(() => {
    const resumed =
      selectedIdRef.current !== null && selectedIdRef.current === id
    if (resumed) {
      void dispatch(restoreProgress())
    } else {
      dispatch(productOpened())
      void dispatch(fetchProduct(id))
    }
  }, [id, dispatch])

  const resumed = selectedProductId !== null && selectedProductId === id
  const loadedProduct = status === 'success' ? product : null
  const purchasable = loadedProduct ? isPurchasable(loadedProduct.stock) : false
  const notFound = status === 'error' && error?.kind === 'notFound'

  useEffect(() => {
    document.title = loadedProduct
      ? `${loadedProduct.name} — ${STORE_NAME}`
      : `Producto — ${STORE_NAME}`
  }, [loadedProduct])

  const retry = () => {
    if (resumed) {
      void dispatch(restoreProgress())
    } else {
      void dispatch(fetchProduct(id))
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 tabIndex={-1} className="text-2xl font-bold text-gray-900">
        {loadedProduct ? loadedProduct.name : 'Producto'}
      </h1>

      {status === 'idle' || status === 'loading' ? <Spinner /> : null}

      {notFound ? (
        <div role="alert" className="mt-6 flex flex-col items-center gap-4 text-center">
          <p className="text-lg font-medium text-gray-800">
            Este producto ya no está disponible.
          </p>
          <Link
            to="/"
            className="rounded-md bg-gray-800 px-4 py-2 font-medium text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
          >
            Volver a la galería
          </Link>
        </div>
      ) : null}

      {status === 'error' && !notFound && error ? (
        <ErrorState message={error.message} onRetry={retry} />
      ) : null}

      {loadedProduct ? (
        <div className="mt-6 flex flex-col gap-6 md:flex-row">
          <Image
            src={loadedProduct.imageUrl}
            alt={loadedProduct.name}
            width={DETAIL_IMAGE_WIDTH}
            height={DETAIL_IMAGE_HEIGHT}
            priority
            className="rounded-lg bg-gray-100 object-cover md:w-1/2"
          />

          <div className="flex flex-1 flex-col gap-3">
            <p className="text-xl font-semibold text-gray-900">
              {formatPriceCOP(loadedProduct.priceInCents)}
            </p>
            <p className="text-base text-gray-700">{loadedProduct.description}</p>
            <p className="text-sm text-gray-600">
              {purchasable
                ? `${loadedProduct.stock} unidades disponibles`
                : 'Sin unidades disponibles'}
            </p>

            {purchasable ? (
              <>
                <QuantitySelector
                  value={quantity}
                  stock={loadedProduct.stock}
                  onChange={(next) => dispatch(quantityChanged(next))}
                />
                <button
                  type="button"
                  onClick={() =>
                    dispatch(
                      purchaseStarted({ productId: id, quantity }),
                    )
                  }
                  className="w-fit rounded-md bg-gray-800 px-5 py-2 font-medium text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                >
                  Iniciar compra
                </button>
              </>
            ) : (
              <p className="font-semibold text-red-700">
                Agotado: no es posible iniciar la compra.
              </p>
            )}

            {resumed ? (
              <section
                aria-label="Siguiente paso"
                className="mt-2 flex flex-col gap-3 rounded-md border border-gray-300 bg-gray-50 p-4"
              >
                <h2 className="text-base font-semibold text-gray-900">
                  Siguiente paso
                </h2>
                <p className="text-base text-gray-800">
                  Registra los datos de tu tarjeta y de entrega para completar
                  la compra.
                </p>
                <p className="text-sm text-gray-600">
                  Cantidad seleccionada: {checkoutQuantity}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    dispatch(startOver())
                    navigate('/')
                  }}
                  className="w-fit rounded-md border border-gray-400 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
                >
                  Comenzar de nuevo
                </button>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
