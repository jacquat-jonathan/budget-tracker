import { useTranslation } from 'react-i18next'

/** A short list of notes in a disclosure (open at first), the rest counted. */
export function Notes({
  title,
  items,
  more,
  testId,
}: {
  title: string
  items: { key: string; text: string }[]
  more: number
  testId?: string
}) {
  const { t } = useTranslation()
  return (
    <details className="rounded-lg border p-3 text-sm" data-testid={testId} open>
      <summary className="cursor-pointer font-medium">{title}</summary>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
        {items.map((item) => (
          <li key={item.key} className="[overflow-wrap:anywhere]">
            {item.text}
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="mt-1 text-muted-foreground">{t('import.andMore', { count: more })}</p>
      )}
    </details>
  )
}
