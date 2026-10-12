import { MAX_QUANTITY_PER_PURCHASE } from '@/shared/constants'

export interface Product {
  id: string
  name: string
  description: string
  priceInCents: number
  stock: number
  imageUrl: string
}

export function maxSelectableQuantity(stock: number): number {
  if (!Number.isFinite(stock) || stock <= 0) {
    return 0
  }
  return Math.min(Math.floor(stock), MAX_QUANTITY_PER_PURCHASE)
}

export function clampQuantity(quantity: number, stock: number): number {
  const max = maxSelectableQuantity(stock)
  if (max <= 0) {
    return 0
  }
  if (!Number.isFinite(quantity)) {
    return 1
  }
  const floored = Math.floor(quantity)
  if (floored < 1) {
    return 1
  }
  return Math.min(max, floored)
}

export function isPurchasable(stock: number): boolean {
  return Number.isFinite(stock) && stock > 0
}