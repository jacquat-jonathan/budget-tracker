import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useLinkNotice } from '@/features/auth/components/use-link-notice'

/** The link notice as an alert, for signed-out pages and the top of the app. */
export function LinkErrorAlert() {
  const notice = useLinkNotice()
  if (!notice) return null

  return (
    <Alert variant="destructive" data-testid="link-notice">
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription>
        <p>{notice.description}</p>
        {notice.signedInNote && <p className="text-foreground">{notice.signedInNote}</p>}
        <div className="mt-2 flex flex-wrap items-start gap-2">{notice.actions}</div>
      </AlertDescription>
    </Alert>
  )
}
