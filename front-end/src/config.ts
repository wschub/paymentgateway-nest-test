export function getApiUrl(): string {
  const url = import.meta.env.VITE_API_URL
  if (url && typeof url === 'string' && url.trim().length > 0) {
    return url
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:3000'
  }
  return ''
}

export const API_URL = getApiUrl()

export const IS_DEV = Boolean(import.meta.env.DEV)
