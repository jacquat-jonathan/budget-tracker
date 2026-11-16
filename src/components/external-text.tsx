import { cn } from '@/lib/utils'

/**
 * Text that comes from outside the app (a bank file, a token's name, a merchant): rendered as
 * text only (React escapes it; never as markup or a link), isolated so that right-to-left
 * characters cannot reorder the words around it, and broken anywhere when it has no spaces so
 * that a long string never widens the page.
 */
// R-SECURITY-250: outside text stays text, isolated, and wraps.
export function ExternalText({
  children,
  className,
}: {
  children: string | null
  className?: string
}) {
  return (
    <bdi className={cn('[overflow-wrap:anywhere] break-words', className)} dir="auto">
      {children ?? ''}
    </bdi>
  )
}
