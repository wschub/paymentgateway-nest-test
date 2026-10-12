import {
  clampQuantity,
  isPurchasable,
  maxSelectableQuantity,
} from '@/shared/product'
import { MAX_QUANTITY_PER_PURCHASE } from '@/shared/constants'

describe('maxSelectableQuantity', () => {
  it('caps at MAX_QUANTITY_PER_PURCHASE', () => {
    expect(MAX_QUANTITY_PER_PURCHASE).toBe(10)
    expect(maxSelectableQuantity(1)).toBe(1)
    expect(maxSelectableQuantity(9)).toBe(9)
    expect(maxSelectableQuantity(10)).toBe(10)
    expect(maxSelectableQuantity(11)).toBe(10)
    expect(maxSelectableQuantity(500)).toBe(10)
  })

  it('returns 0 for zero, negative or non-finite stock', () => {
    expect(maxSelectableQuantity(0)).toBe(0)
    expect(maxSelectableQuantity(-3)).toBe(0)
    expect(maxSelectableQuantity(NaN)).toBe(0)
  })
})

describe('clampQuantity', () => {
  it('returns 0 when there is no stock (blocked semantics)', () => {
    expect(clampQuantity(3, 0)).toBe(0)
    expect(clampQuantity(1, -1)).toBe(0)
  })

  it('keeps a valid quantity between 1 and the stock maximum', () => {
    expect(clampQuantity(3, 9)).toBe(3)
    expect(clampQuantity(5, 1)).toBe(1)
    expect(clampQuantity(9, 9)).toBe(9)
  })

  it('caps at min(stock, MAX_QUANTITY_PER_PURCHASE)', () => {
    expect(clampQuantity(12, 10)).toBe(10)
    expect(clampQuantity(15, 11)).toBe(10)
    expect(clampQuantity(15, 500)).toBe(10)
    expect(clampQuantity(50, 3)).toBe(3)
  })

  it('handles non-integer quantities as whole numbers', () => {
    expect(clampQuantity(2.7, 500)).toBe(2)
    expect(clampQuantity(2.7, 1)).toBe(1)
  })

  it('handles negative quantities', () => {
    expect(clampQuantity(-5, 500)).toBe(1)
  })

  it('handles NaN quantities', () => {
    expect(clampQuantity(NaN, 500)).toBe(1)
    expect(clampQuantity(NaN, 0)).toBe(0)
  })
})

describe('isPurchasable', () => {
  it('requires stock greater than zero', () => {
    expect(isPurchasable(0)).toBe(false)
    expect(isPurchasable(-1)).toBe(false)
    expect(isPurchasable(1)).toBe(true)
    expect(isPurchasable(10)).toBe(true)
    expect(isPurchasable(500)).toBe(true)
  })
})