import { formatPriceCOP } from '@/shared/format/money'

const NBSP = '\u00a0'
const normalize = (value: string) => value.replace(new RegExp(NBSP, 'g'), ' ')

describe('formatPriceCOP', () => {
  it('formats 1500000 cents as es-CO currency with no decimals', () => {
    expect(normalize(formatPriceCOP(1500000))).toBe('$ 15.000')
  })

  it('formats zero', () => {
    expect(normalize(formatPriceCOP(0))).toBe('$ 0')
  })

  it('formats small amounts', () => {
    expect(normalize(formatPriceCOP(100))).toBe('$ 1')
    expect(normalize(formatPriceCOP(1500))).toBe('$ 15')
  })

  it('formats very large amounts with grouping separators', () => {
    expect(normalize(formatPriceCOP(35000000))).toBe('$ 350.000')
    expect(normalize(formatPriceCOP(123456789000))).toBe('$ 1.234.567.890')
  })

  it('never emits decimal separators', () => {
    expect(normalize(formatPriceCOP(199))).not.toContain(',')
  })
})
