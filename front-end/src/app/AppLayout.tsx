import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { STORE_NAME } from '@/shared/constants'

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-gray-800 focus:px-4 focus:py-2 focus:font-medium focus:text-white"
      >
        Saltar al contenido principal
      </a>
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
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 focus:outline-none"
      >
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
