import { BrowserRouter, useRoutes } from 'react-router-dom'
import { routes } from '@/app/routes'
import { AppLayout } from '@/app/AppLayout'
import { ScrollAndFocusManager } from '@/app/ScrollAndFocusManager'

export function AppRoutes() {
  const element = useRoutes(routes)
  return (
    <AppLayout>
      <ScrollAndFocusManager />
      {element}
    </AppLayout>
  )
}

export function BrowserRouterApp() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
