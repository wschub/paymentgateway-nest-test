import { Link } from 'react-router-dom'
import { Image } from '@/shared/ui/Image'
import { formatPriceCOP } from '@/shared/format/money'
import { isPurchasable, type Product } from '@/shared/product'

const CARD_IMAGE_WIDTH = 300
const CARD_IMAGE_HEIGHT = 200

export interface ProductCardProps {
  product: Product
  priority?: boolean
}

function unitsLabel(stock: number): string {
  return stock === 1 ? '1 unidad disponible' : `${stock} unidades disponibles`
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  const available = isPurchasable(product.stock)

  const content = (
    <>
      <Image
        src={product.imageUrl}
        alt={product.name}
        width={CARD_IMAGE_WIDTH}
        height={CARD_IMAGE_HEIGHT}
        priority={priority}
        className="rounded-t-lg bg-gray-100 object-cover"
      />
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h2 className="text-lg font-semibold text-gray-900">{product.name}</h2>
        <p className="text-base font-medium text-gray-800">
          {formatPriceCOP(product.priceInCents)}
        </p>
        <p className="text-sm text-gray-600">{unitsLabel(product.stock)}</p>
        {!available ? (
          <p className="mt-1 text-sm font-semibold text-red-700">Agotado</p>
        ) : null}
      </div>
    </>
  )

  if (!available) {
    return (
      <article
        aria-disabled="true"
        className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white opacity-75"
      >
        {content}
      </article>
    )
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-400">
      <Link
        to={`/product/${product.id}`}
        className="flex h-full flex-col rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
      >
        {content}
      </Link>
    </article>
  )
}
