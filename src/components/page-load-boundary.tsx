import { CloudOffIcon, RotateCwIcon } from 'lucide-react'
import { Component, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PageLoadError } from '@/app/lazy-page'
import { Button } from '@/components/ui/button'
import { isOffline, useOffline } from '@/lib/online'

/** A failure this soon after "try again" counts as that try failing. */
const RETRY_WINDOW_MS = 30_000

interface Props {
  children: ReactNode
  /** Reloads the whole page; replaced in tests. */
  reload?: () => void
}

interface State {
  error: { value: unknown } | null
}

/**
 * Around the routed page: a page whose code could not be downloaded says so, offers to try
 * again, and tries again by itself when the browser comes back online. Any other error is
 * thrown on from here, to the router's error page (a boundary's own render error goes to the
 * boundary above it).
 *
 * Trying again first renders the page again (lazyPage asks for its code anew). Chromium keeps
 * a failed module download and answers the same failure without asking the server again, so
 * when that second try fails while the browser is online, the whole page is reloaded: nothing
 * typed is lost, since the page never loaded.
 */
export class PageLoadBoundary extends Component<Props, State> {
  state: State = { error: null }
  /** When the last "try again" was started (by the button or the browser coming online). */
  private retriedAt = 0

  static getDerivedStateFromError(error: unknown): State {
    return { error: { value: error } }
  }

  componentDidMount() {
    window.addEventListener('online', this.retry)
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.retry)
  }

  componentDidUpdate() {
    // Failed again shortly after trying again, while online: the browser kept the failure.
    if (!(this.state.error?.value instanceof PageLoadError)) return
    if (Date.now() - this.retriedAt < RETRY_WINDOW_MS && !isOffline()) {
      this.retriedAt = 0
      ;(this.props.reload ?? (() => window.location.reload()))()
    }
  }

  retry = () => {
    if (!(this.state.error?.value instanceof PageLoadError)) return
    this.retriedAt = Date.now()
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (error === null) return this.props.children
    if (error.value instanceof PageLoadError) return <PageLoadFailed onRetry={this.retry} />
    throw error.value
  }
}

function PageLoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  const offline = useOffline()
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center"
      data-testid="page-load-failed"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <CloudOffIcon className="size-6 text-muted-foreground" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold">{t('pageLoad.title')}</h1>
      <p className="text-sm text-muted-foreground">
        {offline ? t('pageLoad.offline') : t('pageLoad.online')}
      </p>
      <Button onClick={onRetry}>
        <RotateCwIcon aria-hidden />
        {t('pageLoad.retry')}
      </Button>
    </div>
  )
}
