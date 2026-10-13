import { useState, type ImgHTMLAttributes } from 'react'

const FALLBACK_SRC = '/images/fallback.svg'

export interface ImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onError'> {
  src: string
  alt: string
  width: number
  height: number
  priority?: boolean
}

export function Image({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
  ...rest
}: ImageProps) {
  const [trackedSrc, setTrackedSrc] = useState(src)
  const [failed, setFailed] = useState(false)

  if (src !== trackedSrc) {
    setTrackedSrc(src)
    setFailed(false)
  }

  const classes = ['w-full', 'h-auto', className].filter(Boolean).join(' ')

  return (
    <img
      src={failed ? FALLBACK_SRC : src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={classes}
      onError={() => {
        if (!failed) {
          setFailed(true)
        }
      }}
      {...rest}
    />
  )
}
