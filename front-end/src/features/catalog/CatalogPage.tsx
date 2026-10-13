import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { fetchCatalog } from '@/features/catalog/catalog.slice'
import {
  selectCatalogError,
  selectCatalogItems,
  selectCatalogStatus,
} from '@/features/catalog/catalog.selectors'
import { ProductCard } from '@/features/catalog/ProductCard'
import { Spinner } from '@/shared/ui/Spinner'
import { EmptyState } from '@/shared/ui/EmptyState'
import { ErrorState } from '@/shared/ui/ErrorState'
import { STORE_NAME } from '@/shared/constants'

const PRIORITY_IMAGE_COUNT = 3

export function CatalogPage() {
  const dispatch = useAppDispatch()
  const items = useAppSelector(selectCatalogItems)
  const status = useAppSelector(selectCatalogStatus)
  const error = useAppSelector(selectCatalogError)

  useEffect(() => {
    void dispatch(fetchCatalog())
  }, [dispatch])

  useEffect(() => {
    document.title = `Catálogo — ${STORE_NAME}`
  }, [])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 tabIndex={-1} className="text-2xl font-bold text-gray-900">
        Catálogo
      </h1>

      {status === 'loading' || status === 'idle' ? <Spinner /> : null}

      {status === 'error' && error ? (
        <ErrorState
          message={error.message}
          onRetry={() => void dispatch(fetchCatalog())}
        />
      ) : null}

      {status === 'success' && items.length === 0 ? <EmptyState /> : null}

      {status === 'success' && items.length > 0 ? (
        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((product, index) => (
            <li key={product.id}>
              <ProductCard
                product={product}
                priority={index < PRIORITY_IMAGE_COUNT}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
