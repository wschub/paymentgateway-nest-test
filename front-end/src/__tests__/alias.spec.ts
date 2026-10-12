import { API_URL } from '@/config'
import { formatPriceCOP } from '@/shared/format/money'

it('alias resolves config and modules', () => {
  expect(API_URL).toBe('https://api.test')
  expect(formatPriceCOP(1500000)).toBe('$ 15.000')
})
