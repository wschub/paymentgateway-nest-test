export interface EmptyStateProps {
  message?: string
}

export function EmptyState({
  message = 'No hay productos disponibles por el momento.',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-gray-600">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-12 w-12 text-gray-300"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3 7h18v13H3z" strokeLinejoin="round" />
        <path d="M3 11h18" strokeLinecap="round" />
        <path d="M8 7V5a4 4 0 0 1 8 0v2" strokeLinecap="round" />
      </svg>
      <p className="text-lg font-medium">{message}</p>
    </div>
  )
}
