import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

export function AppPlaceholder() {
  return <h1 className="p-4 text-2xl font-bold">Front-end store</h1>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppPlaceholder />
  </StrictMode>,
)
