import { createRouter, RouterProvider, createHashHistory } from '@tanstack/react-router'
import { rootRoute } from './routes/__root'
import { indexRoute } from './routes/index'
import { addRuleRoute } from './routes/add-rule'
import { gatewaysRoute } from './routes/gateways'
import { settingsRoute } from './routes/settings'
import { loginRoute } from './routes/login'

const routeTree = rootRoute.addChildren([indexRoute, addRuleRoute, gatewaysRoute, settingsRoute, loginRoute])

// Hash history is required for Electron production builds: the renderer loads
// from a file:// URL whose pathname is the full filesystem path, which never
// matches any route with the default browser history. Hash history stores the
// route in the URL fragment (#/) so routing works with both file:// and
// the Vite dev server (http://localhost:../).
const router = createRouter({ routeTree, history: createHashHistory() })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export default function App() {
  return <RouterProvider router={router} />
}
