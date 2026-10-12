export function getApiUrl(): string {
  const meta = import.meta as ImportMeta & {
    env?: Record<string, string | undefined>
  }
  const url = meta.env?.VITE_API_URL
  if (url && typeof url === 'string' && url.trim().length > 0) {
    return url
  }
  if (meta.env?.DEV) {
    return 'http://localhost:3000'
  }
  return ''
}
export const API_URL = getApiUrl()
