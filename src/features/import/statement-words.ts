import type { TFunction } from 'i18next'

import type {
  StatementControl,
  StatementRefusal,
  StatementSource,
} from '@/features/import/statements/types'
import { formatCalendarDate } from '@/lib/date'
import { formatCount, formatMoney } from '@/lib/money'

/** A control's figure: CHF in rappen; another currency in its minor unit, with its code. */
function figure(control: StatementControl, value: number): string {
  if (control.currency === 'CHF') return formatMoney(value)
  return `${control.currency} ${formatMoney(value, { currency: false })}`
}

function megabytes(bytes: number): string {
  return `${(Math.round(bytes / 104_857.6) / 10).toFixed(1)} MB`
}

/**
 * What a refusal of the statement reader means, in the user's language, for every reason the
 * reader gives. The line a layout refusal carries is not part of this text: it is shown apart,
 * on this device only, and never logged or sent.
 */
// R-IMPORT-085: every refusal is explained in words.
export function refusalText(t: TFunction, refusal: StatementRefusal): string {
  const source = (value: StatementSource) => t(`import.sources.${value}`)
  const page = (value: number | null) => (value === null ? '' : t('import.onPage', { page: value }))
  switch (refusal.reason) {
    case 'unsupported-language':
      return t('import.refusal.unsupported-language', {
        language: t(`import.languages.${refusal.language}`),
      })
    case 'unreadable-layout':
      return t('import.refusal.unreadable-layout', {
        source: source(refusal.source),
        problem: t(`import.problems.${refusal.problem}`),
        page: page(refusal.page),
      })
    case 'implausible-date':
      return t('import.refusal.implausible-date', {
        entry: refusal.entry,
        source: source(refusal.source),
        purchase: formatCalendarDate(refusal.purchaseDate),
        control: t(`import.dateControls.${refusal.control}`),
        booking: formatCalendarDate(refusal.bookingDate),
      })
    case 'does-not-add-up':
      return t('import.refusal.does-not-add-up', {
        source: source(refusal.source),
        control: t(`import.controls.${refusal.control.id}`),
        printed: figure(refusal.control, refusal.control.printed),
        computed: figure(refusal.control, refusal.control.computed),
        page: page(refusal.control.page),
      })
    case 'unsupported-currency':
      return t('import.refusal.unsupported-currency', {
        source: source(refusal.source),
        currency: refusal.currency,
      })
    case 'file-too-large':
      return t('import.refusal.file-too-large', {
        size: megabytes(refusal.bytes),
        max: megabytes(refusal.maxBytes),
      })
    case 'too-many-pages':
      return t('import.refusal.too-many-pages', { pages: refusal.pages, max: refusal.maxPages })
    case 'too-many-text-items':
      return t('import.refusal.too-many-text-items', {
        perPage: formatCount(refusal.maxPerPage),
        perDocument: formatCount(refusal.maxPerDocument),
        page: page(refusal.page),
      })
    case 'unexpected-page-size':
      return t('import.refusal.unexpected-page-size', {
        page: refusal.page,
        width: Math.round(refusal.width),
        height: Math.round(refusal.height),
      })
    case 'timed-out':
      return t('import.refusal.timed-out', { seconds: Math.round(refusal.limitMs / 1000) })
    default:
      return t(`import.refusal.${refusal.reason}`)
  }
}
const KNOWN_REASONS = [
  'invalid_row',
  'invalid_date',
  'invalid_amount',
  'invalid_direction',
  'invalid_description',
  'invalid_merchant',
  'invalid_bank_transaction_id',
  'invalid_hint',
  'invalid_details',
  'invalid_kind',
  'invalid_category',
  'invalid_action',
  'choice_not_allowed',
  'date_outside_periods',
  'category_not_found',
  'category_is_group',
  'category_not_in_force',
  'category_to_categorise',
] as const

export function reasonText(t: TFunction, reason: string | null): string {
  const known = (KNOWN_REASONS as readonly string[]).includes(reason ?? '')
  return t(
    `import.preview.reasons.${known ? (reason as (typeof KNOWN_REASONS)[number]) : 'unknown'}`,
  )
}
