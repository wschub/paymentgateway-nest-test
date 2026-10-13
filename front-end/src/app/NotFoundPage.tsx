import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { STORE_NAME } from '@/shared/constants'

export function NotFoundPage() {
  useEffect(() => {
    document.title = `Página no encontrada — ${STORE_NAME}`
  }, [])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 text-center">
      <h1 tabIndex={-1} className="text-2xl font-bold text-gray-900">
        Página no encontrada
      </h1>
      <p className="mt-3 text-gray-700">
        La dirección que abriste no existe o fue movida.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md bg-gray-800 px-4 py-2 font-medium text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
      >
        Volver a la galería
      </Link>
    </div>
  )
}
