import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { STORE_NAME } from '@/shared/constants'

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const main = mainRef.current
    if (!main) {
      return
    }
    const heading = main.querySelector('h1')
    if (heading instanceof HTMLElement) {
      heading.focus()
    } else {
      main.focus()
    }
  }, [location.pathname])

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center px-4 py-3">
          <Link
            to="/"
            className="text-lg font-bold text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
          >
            {STORE_NAME}
          </Link>
        </div>
      </header>
      <main ref={mainRef} tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-4 text-sm text-gray-500">
          {STORE_NAME} — accesorios de tecnología
        </div>
      </footer>
    </div>
  )
}
