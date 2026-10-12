export interface SpinnerProps {
  label?: string
}

export function Spinner({ label = 'Cargando…' }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="flex items-center justify-center gap-2 py-8 text-gray-600"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-6 w-6 animate-spin text-gray-400"
        fill="none"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          className="opacity-25"
        />
        <path
          d="M22 12a10 10 0 0 1-10 10"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          className="opacity-75"
        />
      </svg>
      <span>{label}</span>
    </div>
  )
}
