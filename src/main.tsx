import './index.css'
import '@/lib/zod-config'
import '@/lib/i18n'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ConfigError } from '@/components/config-error'
import { captureAuthRedirect } from '@/features/auth/auth-redirect'
import { MissingEnvError, missingEnvVars } from '@/lib/env'

const root = createRoot(document.getElementById('root') as HTMLElement)
const missing = missingEnvVars()

// R-APP-003: refuse to start without the Supabase settings, naming them.
if (missing.length > 0) {
  // Fail loudly in the console too, with the full explanation.
  console.error(new MissingEnvError(missing))
  root.render(
    <StrictMode>
      <ConfigError missing={missing} />
    </StrictMode>,
  )
} else {
  // Take tokens or errors from an email link out of the URL (and out of browser history)
  // before the router or the Supabase client sees them.
  captureAuthRedirect()
  // Imported only once the configuration is known to be complete: creating the Supabase
  // client throws when it is not.
  void import('@/app/app').then(({ App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}
