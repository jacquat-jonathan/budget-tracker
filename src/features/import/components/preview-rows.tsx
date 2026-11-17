import type { TFunction } from 'i18next'
import {
  BellRingIcon,
  CheckCircle2Icon,
  CircleSlashIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ExternalText } from '@/components/external-text'
import { NativeSelect } from '@/components/native-select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { Category } from '@/features/categories/category-queries'
import { CategoryDialog } from '@/features/import/components/category-dialog'
import { withChoice, type Choices, type RowChoice } from '@/features/import/import-model'
import {
  rowAction,
  type ExistingTransaction,
  type ImportRowResult,
  type RowAction,
} from '@/features/import/import-queries'
import type { ImportRowDetails } from '@/features/import/statements/import-rows'
import { reasonText } from '@/features/import/statement-words'
import type { EntryAnswer } from '@/features/import/use-import'
import { formatCalendarDate } from '@/lib/date'
import { formatCount, formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

/** How many rows are drawn at first, and added with "show more". */
const PAGE = 100

type Filter = 'all' | 'import' | 'skipped' | 'invalid'

function group(action: RowAction): Exclude<Filter, 'all'> {
  if (action === 'import') return 'import'
  if (action === 'invalid') return 'invalid'
  return 'skipped'
}

/** Import or skip, as the row stands now (the member's choice, else the database's). */
function effectiveAction(answer: EntryAnswer, choice: RowChoice | undefined): 'import' | 'skip' {
  if (choice?.action) return choice.action
  return answer.result && rowAction(answer.result) === 'import' ? 'import' : 'skip'
}

/** The change of a row's action to `to`: a choice when it differs from the default, else none. */
function actionChange(answer: EntryAnswer, choice: RowChoice | undefined, to: 'import' | 'skip') {
  if (effectiveAction(answer, choice) === to) return null
  // With a choice the default is the other way: going back clears it.
  return choice?.action ? { action: undefined } : { action: to }
}

function kindChange(
  answer: EntryAnswer,
  choice: RowChoice | undefined,
  to: 'refund' | 'extra_income',
) {
  if (answer.entry.row.direction !== 'credit') return null
  const shown = choice?.kind ?? (answer.result?.kind === 'extra_income' ? 'extra_income' : 'refund')
  if (shown === to) return null
  return choice?.kind ? { kind: undefined } : { kind: to }
}

export interface PreviewRowsProps {
  budgetId: string
  draftKind: 'pdf' | 'csv'
  answers: EntryAnswer[]
  choices: Choices
  onChoices: (next: Choices) => void
  existing: ReadonlyMap<string, ExistingTransaction> | undefined
  categories: readonly Category[] | undefined
  /** Rows of parts an interrupted import already recorded, with their part: not changeable. */
  locked?: ReadonlyMap<number, number>
}

const NONE_LOCKED: ReadonlyMap<number, number> = new Map()

/** A checkbox with a hit area of at least 24 by 24 pixels around its 16-pixel box. */
function Target({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="-m-1 flex size-6 shrink-0 cursor-pointer items-center justify-center"
    >
      {children}
    </label>
  )
}

/**
 * One row per statement line, in statement order: its date, description and amount with its
 * direction, what the database proposes (and why), the kind and the category, the remembered
 * choice and the planned salary when there are, the extra data on request; the member changes
 * import or skip, refund or extra income and the category, for a row or for a selection. Each
 * change is asked again; a row whose answer is on its way says so.
 */
// R-IMPORT-102: every row shows the statement's extra data on request.
export function PreviewRows({
  budgetId,
  draftKind,
  answers,
  choices,
  onChoices,
  existing,
  categories,
  locked = NONE_LOCKED,
}: PreviewRowsProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<Filter>('all')
  const [shown, setShown] = useState(PAGE)
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [categoryFor, setCategoryFor] = useState<{
    keys: number[]
    date: string
    current: string | null
  } | null>(null)
  const byId = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories],
  )
  const visible = useMemo(
    () =>
      answers.filter(
        (answer) =>
          filter === 'all' || (answer.result && group(rowAction(answer.result)) === filter),
      ),
    [answers, filter],
  )
  const drawn = visible.slice(0, shown)
  // "Select all" covers every row the filter shows, drawn or not, except the locked ones.
  const selectable = useMemo(
    () => visible.filter((answer) => !locked.has(answer.entry.key)),
    [visible, locked],
  )
  const allSelected =
    selectable.length > 0 && selectable.every((answer) => selected.has(answer.entry.key))

  const change = (
    keys: readonly number[],
    compute: (answer: EntryAnswer, choice: RowChoice | undefined) => Partial<RowChoice> | null,
  ) => {
    let next = choices
    for (const key of keys) {
      if (locked.has(key)) continue
      const answer = answers.find((item) => item.entry.key === key)
      if (!answer) continue
      const delta = compute(answer, next[key])
      if (delta) next = withChoice(next, key, delta)
    }
    if (next !== choices) onChoices(next)
  }
  const selectedKeys = [...selected]
  const categoryName = (id: string | null) => {
    const category = id ? byId.get(id) : undefined
    if (!category) return null
    const parent = category.parent_id ? byId.get(category.parent_id) : undefined
    return parent ? `${parent.name} › ${category.name}` : category.name
  }
  const existingText = (id: string | null) => {
    const row = id ? existing?.get(id) : undefined
    if (!row) return t('import.preview.existingUnknown')
    return row.description
      ? t('import.preview.existing', {
          date: formatCalendarDate(row.date),
          amount: formatMoney(row.amount),
          description: row.description,
        })
      : t('import.preview.existingNoDescription', {
          date: formatCalendarDate(row.date),
          amount: formatMoney(row.amount),
        })
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t('import.preview.filter')}
      >
        {(['all', 'import', 'skipped', 'invalid'] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filter === value ? 'default' : 'outline'}
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value)
              setShown(PAGE)
            }}
          >
            {t(`import.preview.filters.${value}`)}
          </Button>
        ))}
      </div>
      {/* R-IMPORT-364: below the app's header (h-14) while the rows scroll; on a phone one line that scrolls
          sideways inside itself rather than three lines over the rows. */}
      <div
        className="sticky top-14 z-10 flex flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border bg-background/95 p-2 backdrop-blur sm:flex-wrap sm:overflow-x-visible"
        role="group"
        aria-label={t('import.preview.bulk.label')}
        data-testid="bulk-bar"
      >
        <div className="flex shrink-0 items-center gap-2 pr-2">
          <Target htmlFor="preview-select-all">
            <Checkbox
              id="preview-select-all"
              checked={allSelected}
              onCheckedChange={(next) => {
                const keys = selectable.map((answer) => answer.entry.key)
                setSelected((now) => {
                  const out = new Set(now)
                  for (const key of keys)
                    if (next === true) out.add(key)
                    else out.delete(key)
                  return out
                })
              }}
              aria-label={t('import.preview.selectAllCount', { count: selectable.length })}
            />
          </Target>
          <span className="text-sm whitespace-nowrap" aria-live="polite">
            {t('import.preview.selected', { count: selected.size })}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={selected.size === 0}
          onClick={() =>
            change(selectedKeys, (answer, choice) => actionChange(answer, choice, 'import'))
          }
        >
          {t('import.preview.bulk.import')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={selected.size === 0}
          onClick={() =>
            change(selectedKeys, (answer, choice) => actionChange(answer, choice, 'skip'))
          }
        >
          {t('import.preview.bulk.skip')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={selected.size === 0}
          onClick={() =>
            change(selectedKeys, (answer, choice) => kindChange(answer, choice, 'refund'))
          }
        >
          {t('import.preview.bulk.refund')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={selected.size === 0}
          onClick={() =>
            change(selectedKeys, (answer, choice) => kindChange(answer, choice, 'extra_income'))
          }
        >
          {t('import.preview.bulk.extra')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={selected.size === 0}
          onClick={() => {
            const dates = answers
              .filter((answer) => selected.has(answer.entry.key))
              .map((answer) => answer.entry.row.date)
            const latest = dates.reduce((max, date) => (date > max ? date : max), dates[0] ?? '')
            setCategoryFor({ keys: selectedKeys, date: latest, current: null })
          }}
        >
          {t('import.preview.bulk.category')}
        </Button>
        {selected.size > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0"
            onClick={() => setSelected(new Set())}
          >
            {t('import.preview.bulk.clear')}
          </Button>
        )}
      </div>

      <ol
        className="flex flex-col divide-y rounded-xl border"
        aria-label={t('import.preview.rowsLabel')}
        data-testid="preview-rows"
      >
        {drawn.map((answer) => (
          <PreviewRow
            key={answer.entry.key}
            answer={answer}
            draftKind={draftKind}
            choice={choices[answer.entry.key]}
            lockedPart={locked.get(answer.entry.key) ?? null}
            selected={selected.has(answer.entry.key)}
            onSelect={(on) =>
              setSelected((now) => {
                const out = new Set(now)
                if (on) out.add(answer.entry.key)
                else out.delete(answer.entry.key)
                return out
              })
            }
            onAction={(to) =>
              change([answer.entry.key], (item, choice) => actionChange(item, choice, to))
            }
            onKind={(to) =>
              change([answer.entry.key], (item, choice) => kindChange(item, choice, to))
            }
            onCategory={() =>
              setCategoryFor({
                keys: [answer.entry.key],
                date: answer.entry.row.date,
                current: choices[answer.entry.key]?.categoryId ?? null,
              })
            }
            categoryName={categoryName}
            existingText={existingText}
          />
        ))}
      </ol>
      {visible.length > drawn.length && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setShown((now) => now + PAGE)}
        >
          {t('import.preview.showMore', { count: Math.min(PAGE, visible.length - drawn.length) })}
        </Button>
      )}
      {categoryFor && (
        <CategoryDialog
          budgetId={budgetId}
          open
          onOpenChange={(open) => {
            if (!open) setCategoryFor(null)
          }}
          date={categoryFor.date}
          count={categoryFor.keys.length}
          current={categoryFor.current}
          onChoose={(categoryId) =>
            change(categoryFor.keys, (answer) =>
              answer.entry.row.direction === 'credit' &&
              (choices[answer.entry.key]?.kind ?? answer.result?.kind) === 'extra_income'
                ? null
                : { categoryId: categoryId ?? undefined },
            )
          }
        />
      )}
    </div>
  )
}

function StatusIcon({ action }: { action: RowAction }) {
  const className = 'mt-0.5 size-4 shrink-0'
  if (action === 'import')
    return <CheckCircle2Icon className={cn(className, 'text-positive')} aria-hidden />
  if (action === 'invalid')
    return <TriangleAlertIcon className={cn(className, 'text-destructive')} aria-hidden />
  if (action === 'confirm_match')
    return <BellRingIcon className={cn(className, 'text-muted-foreground')} aria-hidden />
  return <CircleSlashIcon className={cn(className, 'text-muted-foreground')} aria-hidden />
}

function PreviewRow({
  answer,
  draftKind,
  choice,
  lockedPart,
  selected,
  onSelect,
  onAction,
  onKind,
  onCategory,
  categoryName,
  existingText,
}: {
  answer: EntryAnswer
  draftKind: 'pdf' | 'csv'
  choice: RowChoice | undefined
  lockedPart: number | null
  selected: boolean
  onSelect: (on: boolean) => void
  onAction: (to: 'import' | 'skip') => void
  onKind: (to: 'refund' | 'extra_income') => void
  onCategory: () => void
  categoryName: (id: string | null) => string | null
  existingText: (id: string | null) => string
}) {
  const { t } = useTranslation()
  const { entry, result, stale } = answer
  const { row } = entry
  const label =
    draftKind === 'pdf'
      ? t('import.preview.entry', { n: entry.key })
      : t('import.preview.line', { n: entry.key })
  const action = result ? rowAction(result) : null
  const effective = effectiveAction(answer, choice)
  const kind = result?.kind ?? (row.direction === 'debit' ? 'expense' : 'refund')
  const shownKind = row.direction === 'credit' ? (choice?.kind ?? kind) : 'expense'
  const rowName = `${label}, ${formatCalendarDate(row.date)}, ${row.description ?? row.merchant ?? ''}`
  const checkboxId = `preview-select-${entry.key}`
  return (
    <li
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 p-3 transition-opacity',
        stale && 'opacity-70',
      )}
      aria-busy={stale || result === undefined}
      data-testid="preview-row"
      data-action={action ?? 'pending'}
    >
      <Target htmlFor={checkboxId}>
        <Checkbox
          id={checkboxId}
          checked={selected}
          disabled={lockedPart !== null}
          onCheckedChange={(next) => onSelect(next === true)}
          aria-label={t('import.preview.select', { row: rowName })}
        />
      </Target>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex min-w-0 flex-col">
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatCalendarDate(row.date)} · {label}
            </span>
            <span className="min-w-0 font-medium">
              {row.description || row.merchant ? (
                <ExternalText>{row.description ?? row.merchant ?? ''}</ExternalText>
              ) : (
                <span className="text-muted-foreground">{t('import.preview.noDescription')}</span>
              )}
            </span>
          </div>
          <span className="shrink-0 tabular-nums" data-testid="row-amount">
            <span aria-hidden>{row.direction === 'debit' ? '−' : '+'}</span>
            {formatMoney(row.amount)}
            <span className="ml-1 text-xs text-muted-foreground">
              {t(`import.preview.money.${row.direction}`)}
            </span>
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
          <div className="flex min-w-0 items-start gap-2 text-sm" data-testid="row-status">
            {lockedPart !== null && result === undefined ? null : result === undefined ||
              action === null ? (
              <>
                <LoaderCircleIcon
                  className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground"
                  aria-hidden
                />
                <span className="text-muted-foreground">{t('import.preview.checking')}</span>
              </>
            ) : (
              <>
                <StatusIcon action={action} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn(action === 'invalid' && 'text-destructive', 'font-medium')}>
                    {statusText(t, result, action)}
                    {stale && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ({t('import.preview.checking')})
                      </span>
                    )}
                  </span>
                  <RowNotes result={result} action={action} existingText={existingText} />
                </div>
              </>
            )}
          </div>

          {lockedPart !== null && (
            <p className="text-xs text-muted-foreground" data-testid="row-recorded">
              {t('import.preview.recordedRow', { part: lockedPart })}
            </p>
          )}
          {lockedPart === null && result !== undefined && action !== 'invalid' && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
              <NativeSelect
                aria-label={`${t('import.preview.actionChoice')}: ${rowName}`}
                value={effective}
                onChange={(event) => onAction(event.target.value === 'import' ? 'import' : 'skip')}
                className="w-32"
              >
                <option value="import">{t('import.preview.choose.import')}</option>
                <option value="skip">{t('import.preview.choose.skip')}</option>
              </NativeSelect>
              {row.direction === 'credit' ? (
                <NativeSelect
                  aria-label={`${t('import.preview.kind')}: ${rowName}`}
                  value={shownKind}
                  onChange={(event) =>
                    onKind(event.target.value === 'extra_income' ? 'extra_income' : 'refund')
                  }
                  className="w-auto max-w-full"
                >
                  <option value="refund">{t('import.preview.kinds.refund')}</option>
                  <option value="extra_income">{t('import.preview.kinds.extra_income')}</option>
                </NativeSelect>
              ) : (
                <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
                  {t('import.preview.kinds.expense')}
                </span>
              )}
              {shownKind === 'extra_income' ? (
                <span className="text-xs text-muted-foreground">
                  {t('import.preview.noCategory')}
                </span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 max-w-full min-w-0 justify-start"
                  onClick={onCategory}
                  aria-label={`${t('import.preview.categoryChoose', { name: categoryLabel(t, result, choice, categoryName) })}: ${rowName}`}
                >
                  <span className="truncate">{categoryLabel(t, result, choice, categoryName)}</span>
                </Button>
              )}
            </div>
          )}
          {lockedPart === null &&
            action === 'invalid' &&
            result?.reason?.startsWith('category_') && (
              <div>
                <Button type="button" variant="outline" size="sm" onClick={onCategory}>
                  {t('import.preview.bulk.category')}
                </Button>
              </div>
            )}
        </div>
        <DetailsBlock row={row} />
      </div>
    </li>
  )
}

type T = TFunction

function statusText(t: T, result: ImportRowResult, action: RowAction): string {
  switch (action) {
    case 'skip_flagged':
      return t('import.preview.actions.skip_flagged', {
        flag: result.flag ? t(`import.preview.flags.${result.flag as 'salary'}`) : '',
      })
    case 'invalid':
      return t('import.preview.actions.invalid', { reason: reasonText(t, result.reason) })
    default:
      return t(`import.preview.actions.${action}`)
  }
}

function categoryLabel(
  t: T,
  result: ImportRowResult,
  choice: RowChoice | undefined,
  categoryName: (id: string | null) => string | null,
): string {
  if (choice?.categoryId) {
    return t('import.preview.categoryChosen', { name: categoryName(choice.categoryId) ?? '…' })
  }
  if (result.category_source === 'rule') {
    return t('import.preview.categoryFromRule', { name: categoryName(result.category_id) ?? '…' })
  }
  if (result.category_source === 'choice') {
    return t('import.preview.categoryChosen', { name: categoryName(result.category_id) ?? '…' })
  }
  // A "to categorise" category that does not exist yet has no id in the preview (D-455):
  // the first part written makes it.
  return result.category_id === null
    ? t('import.preview.toCategoriseNew')
    : t('import.preview.toCategorise')
}

function RowNotes({
  result,
  action,
  existingText,
}: {
  result: ImportRowResult
  action: RowAction
  existingText: (id: string | null) => string
}) {
  const { t } = useTranslation()
  const notes: ReactNode[] = []
  if (action === 'skip_duplicate') {
    notes.push(t('import.preview.duplicateOf', { transaction: existingText(result.duplicate_of) }))
    notes.push(t('import.preview.importAnywayHint'))
  }
  if (action === 'skip_matched' || action === 'confirm_match') {
    notes.push(t('import.preview.matchOf', { transaction: existingText(result.match_of) }))
    if (result.match_is_charge) notes.push(t('import.preview.matchIsCharge'))
    notes.push(t('import.preview.importAnywayHint'))
  }
  if (
    result.flag &&
    ['card_bill_payment', 'own_transfer', 'transfer_to_person', 'salary'].includes(result.flag)
  ) {
    notes.push(t(`import.preview.flagNote.${result.flag as 'salary'}`))
  }
  if (result.remembered_choice === 'import' || result.remembered_choice === 'skip') {
    notes.push(
      t('import.preview.remembered', {
        choice: t(`import.preview.rememberedChoice.${result.remembered_choice}`),
      }),
    )
  }
  if (result.salary_income_amount !== null && result.amount !== null) {
    notes.push(
      t('import.preview.salary', {
        planned: formatMoney(result.salary_income_amount),
        amount: formatMoney(result.amount),
      }),
    )
  }
  if (notes.length === 0) return null
  return (
    <span className="flex flex-col text-xs text-muted-foreground">
      {notes.map((note, index) => (
        <span key={index}>{note}</span>
      ))}
    </span>
  )
}

/** Currencies without a minor unit: their amounts are whole. */
const WHOLE_CURRENCIES = new Set(['JPY', 'KRW', 'ISK', 'CLP', 'VND', 'XOF', 'XAF'])

/** An original amount in its currency's minor unit, as printed by the statement. */
function formatOriginal(currency: string, minor: number): string {
  if (WHOLE_CURRENCIES.has(currency)) return `${currency} ${formatCount(minor)}`
  return `${currency} ${formatMoney(minor, { currency: false })}`
}

/** The statement's extra data for a row, on request (a disclosure: the list stays compact). */
function DetailsBlock({ row }: { row: EntryAnswer['entry']['row'] }) {
  const { t } = useTranslation()
  const details: ImportRowDetails = row.details ?? {}
  const items: { key: string; label: string; value: string }[] = []
  const add = (key: string, label: string, value: string | undefined) => {
    if (value !== undefined && value !== '') items.push({ key, label, value })
  }
  add('purchase_time', t('import.preview.detailKeys.purchase_time'), details.purchase_time)
  add(
    'booking_date',
    t('import.preview.detailKeys.booking_date'),
    details.booking_date ? formatCalendarDate(details.booking_date) : undefined,
  )
  add(
    'value_date',
    t('import.preview.detailKeys.value_date'),
    details.value_date ? formatCalendarDate(details.value_date) : undefined,
  )
  add('card', t('import.preview.detailKeys.card'), details.card)
  if (details.original_currency && details.original_amount !== undefined) {
    add(
      'original',
      t('import.preview.detailKeys.original'),
      formatOriginal(details.original_currency, details.original_amount),
    )
  }
  add('exchange_rate', t('import.preview.detailKeys.exchange_rate'), details.exchange_rate)
  add(
    'fee',
    t('import.preview.detailKeys.fee'),
    details.fee !== undefined ? formatMoney(details.fee) : undefined,
  )
  add(
    'merchant_category',
    t('import.preview.detailKeys.merchant_category'),
    details.merchant_category,
  )
  add('security', t('import.preview.detailKeys.security'), details.security)
  add('location', t('import.preview.detailKeys.location'), details.location)
  if (row.merchant && row.description && row.merchant !== row.description) {
    add('merchant', t('import.preview.detailKeys.merchant'), row.merchant)
  }
  add(
    'bank_transaction_id',
    t('import.preview.detailKeys.bank_transaction_id'),
    row.bank_transaction_id,
  )
  if (items.length === 0) return null
  return (
    <details className="group text-sm">
      <summary className="w-fit cursor-pointer rounded text-xs text-muted-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        {t('import.preview.details')}
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-lg bg-muted/40 p-2 text-xs">
        {items.map((item) => (
          <div key={item.key} className="contents">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="min-w-0">
              <ExternalText>{item.value}</ExternalText>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
