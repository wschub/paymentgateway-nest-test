export function formatPriceCOP(cents: number): string {
  const n = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  })
  return n.format(cents / 100)
}
