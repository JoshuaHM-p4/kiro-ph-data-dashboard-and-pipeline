import { createFileRoute, redirect } from '@tanstack/react-router'

// The landing page now lives at /dashboard. Redirect / before it renders.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' })
  },
})
