import { CloudOffIcon, RotateCwIcon } from 'lucide-react'
import { Component, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PageLoadError } from '@/app/lazy-page'
import { Button } from '@/components/ui/button'
import { useOffline } from '@/lib/online'

interface Props {
  children: ReactNode
}

interface State {
  error: { value: unknown } | null
}

/**
 * Around the routed page: a page whose code could not be downloaded says so, offers to try
 * again, and tries again by itself when the browser comes back online. Any other error is
 * thrown on from here, to the router's error page (a boundary's own render error goes to the
 * boundary above it).
 */
export class PageLoadBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: { value: error } }
  }

  componentDidMount() {
    window.addEventListener('online', this.retry)
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.retry)
  }

  retry = () => {
    if (this.state.error?.value instanceof PageLoadError) this.setState({ error: null })
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
