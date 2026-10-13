import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function ScrollAndFocusManager() {
  const location = useLocation()

  useEffect(() => {
    const heading = document.querySelector('h1')
    const target =
      heading instanceof HTMLElement ? heading : document.querySelector('main')
    if (target instanceof HTMLElement) {
      target.focus()
    }
  }, [location.pathname])

  return null
}
