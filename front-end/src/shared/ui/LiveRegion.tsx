export type LiveRegionPoliteness = 'polite' | 'assertive'

export interface LiveRegionProps {
  message?: string
  politeness?: LiveRegionPoliteness
}

export function LiveRegion({
  message = '',
  politeness = 'polite',
}: LiveRegionProps) {
  return (
    <div
      role={politeness === 'assertive' ? 'alert' : 'status'}
      aria-live={politeness}
      className="sr-only"
    >
      {message}
    </div>
  )
}
