const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

export function formatPriceCOP(cents: number): string {
  return copFormatter.format(cents / 100)
}
