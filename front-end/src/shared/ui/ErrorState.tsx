export interface ErrorStateProps {
  message: string
  onRetry: () => void
  retryLabel?: string
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Reintentar',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 py-12 text-center"
    >
      <p className="text-lg font-medium text-red-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-gray-800 px-4 py-2 font-medium text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
      >
        {retryLabel}
      </button>
    </div>
  )
}
