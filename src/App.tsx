import { createRouter, RouterProvider } from '@tanstack/react-router'
import { rootRoute } from './routes/__root'
import { indexRoute } from './routes/index'
import { addRuleRoute } from './routes/add-rule'
import { settingsRoute } from './routes/settings'

const routeTree = rootRoute.addChildren([indexRoute, addRuleRoute, settingsRoute])

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export default function App() {
  return <RouterProvider router={router} />
}
