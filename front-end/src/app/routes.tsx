import type { RouteObject } from 'react-router-dom'
import { CatalogPage } from '@/features/catalog/CatalogPage'
import { ProductPage } from '@/features/product/ProductPage'
import { NotFoundPage } from '@/app/NotFoundPage'

export const routes: RouteObject[] = [
  { path: '/', element: <CatalogPage /> },
  { path: '/product/:id', element: <ProductPage /> },
  { path: '*', element: <NotFoundPage /> },
]
