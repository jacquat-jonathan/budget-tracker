import { ArrowLeftIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ExternalText } from '@/components/external-text'
import { NativeSelect } from '@/components/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Notes } from '@/features/import/components/notes'
import type { DraftEntry } from '@/features/import/import-model'
import { formatCalendarDate } from '@/lib/date'
import { formatMoney } from '@/lib/money'

import { MAX_BATCH_ROWS } from '@/features/import/import-model'
import { formatCount } from '@/lib/money'

import {
  amountCells,
  DATE_FORMATS,
  dateFormatsFor,
  decimalEvidence,
  decimalToUse,
  guessMapping,
  looksLikeData,
  mapRecords,
  mappingComplete,
  type CsvAdjustment,
  type CsvMapping,
  type CsvProblem,
  type DateFormat,
  type DecimalMark,
} from './csv-map'
import { readRememberedMapping, rememberMapping } from './csv-mapping-storage'
import { CSV_SEPARATORS, detectSeparator, parseCsv, type CsvSeparator } from './csv-parse'

export interface CsvReady {
  entries: DraftEntry[]
  problems: { line: number; problem: CsvProblem }[]
  adjustments: { line: number; adjustment: CsvAdjustment }[]
}

/** How many rows the live sample shows. */
const SAMPLE = 6
/** How many unreadable lines are listed one by one. */
const LISTED = 50
/** How many lines a note about the decimal mark names. */
const NAMED = 5

/**
 * The mapping step of the CSV import (R-IMPORT-082): which column is the date (and its format,
 * asked whenever the dates could be read more than one way), the amount (one signed column and
 * what its sign means, or money out and money in), the description, and optionally the
 * merchant and the bank's reference; a live sample of the first rows exactly as they will be
 * sent; the lines that cannot be read, with why. The mapping is remembered for this budget on
 * this device.
 */
// R-IMPORT-082: the user maps the columns; nothing is guessed silently.
export function CsvMapper({
  budgetId,
  text,
  onBack,
  onReady,
}: {
  budgetId: string
  text: string
  onBack: () => void
  onReady: (ready: CsvReady) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  // This step loads on its own: it takes the focus itself once it is there.
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  const detected = useMemo(() => detectSeparator(text), [text])
  const [separator, setSeparator] = useState<CsvSeparator>(detected ?? ';')
  const parsed = useMemo(() => parseCsv(text, separator), [text, separator])
  const records = parsed.records
  const header = useMemo(() => records[0]?.cells ?? [], [records])
  const columns = useMemo(
    () => Math.max(0, ...records.slice(0, 50).map((record) => record.cells.length)),
    [records],
  )
  // A new separator or file changes the header's names: the mapping starts again from the one
  // remembered for this header, else from the header's names; the user's edits apply to it.
  const mappingKey = `${separator}\u0001${header.join('\u0000')}`
  const start = useMemo(() => {
    const kept = readRememberedMapping(budgetId, header)
    return kept && kept.separator === separator
      ? { mapping: kept.mapping, remembered: true }
      : { mapping: guessMapping(header, records.slice(1, 50)), remembered: false }
    // The key stands for the header and the separator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappingKey, budgetId])
  const [edited, setEdited] = useState<{
    key: string
    mapping: CsvMapping
    /** The member chose the decimal mark here. */
    decimalSet: boolean
  } | null>(null)
  const own = edited?.key === mappingKey ? edited : null
  const chosen = own ? own.mapping : start.mapping
  const remembered = start.remembered && own === null
  const set = (change: Partial<CsvMapping>) =>
    setEdited({
      key: mappingKey,
      mapping: { ...chosen, ...change },
      decimalSet: (own?.decimalSet ?? false) || 'decimal' in change,
    })
  const body = chosen.hasHeader ? records.slice(1) : records
  // The first line reads as data (a date and an amount): it is a row unless the member says not.
  const firstIsData = useMemo(() => looksLikeData(header), [header])
  // R-IMPORT-324: the decimal mark comes from every amount of the file, or is asked.
  const evidence = useMemo(
    () =>
      decimalEvidence(
        amountCells(body, {
          amountMode: chosen.amountMode,
          amount: chosen.amount,
          debit: chosen.debit,
          credit: chosen.credit,
        }),
      ),
    [body, chosen.amountMode, chosen.amount, chosen.debit, chosen.credit],
  )
  // What the amounts settle wins over a mapping remembered from another file; a choice made
  // here wins over both.
  const decimalChoice: DecimalMark | null =
    own?.decimalSet === true ? chosen.decimal : evidence.state === 'settled' ? null : chosen.decimal
  const decimal = decimalToUse(evidence, decimalChoice)
  const dateValues = useMemo(
    () => (chosen.date === null ? [] : body.map((record) => record.cells[chosen.date ?? 0] ?? '')),
    [body, chosen.date],
  )
  const formats = useMemo(() => dateFormatsFor(dateValues), [dateValues])
  // A format fills the choice by itself only when it alone reads every date.
  const mapping = useMemo<CsvMapping>(
    () => ({
      ...chosen,
      dateFormat:
        chosen.dateFormat === null && formats.length === 1
          ? (formats[0] ?? null)
          : chosen.dateFormat,
      decimal,
    }),
    [chosen, formats, decimal],
  )
  const mapped = useMemo(() => mapRecords(records, mapping), [records, mapping])
  const complete = mappingComplete(mapping)
  // R-IMPORT-208: a batch takes 100 parts of 500 rows; a longer file is refused before sending.
  const tooMany = mapped.rows.length > MAX_BATCH_ROWS
  const named = (cells: readonly { line: number; text: string }[]) =>
    cells
      .slice(0, NAMED)
      .map((cell) => t('import.csv.decimalLine', { line: cell.line, text: cell.text.trim() }))
      .join(', ') + (cells.length > NAMED ? '…' : '')
  const columnName = (index: number) => {
    const name = mapping.hasHeader ? (header[index] ?? '').trim() : ''
    return name !== ''
      ? t('import.csv.columnNamed', { n: index + 1, name })
      : t('import.csv.column', { n: index + 1 })
  }
  const columnOptions = Array.from({ length: columns }, (_, index) => (
    <option key={index} value={index}>
      {columnName(index)}
    </option>
  ))
  const columnField = (
    label: string,
    key: 'date' | 'amount' | 'debit' | 'credit' | 'description' | 'merchant' | 'bankId',
    optional: boolean,
  ) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <NativeSelect
        id={`${id}-${key}`}
        value={mapping[key] ?? ''}
        onChange={(event) => {
          const value = event.target.value === '' ? null : Number(event.target.value)
          set(key === 'date' ? { date: value, dateFormat: null } : { [key]: value })
        }}
      >
        <option value="">
          {optional ? t('import.csv.none') : t('import.csv.dateFormatChoose')}
        </option>
        {columnOptions}
      </NativeSelect>
    </div>
  )
  const ambiguous = mapping.date !== null && formats.length > 1
  const noFormat =
    mapping.date !== null && dateValues.some((value) => value.trim() !== '') && formats.length === 0
  const sample = mapped.rows.slice(0, SAMPLE)

  const ready = () => {
    // A point used only because no amount depends on it is not remembered as a choice.
    const kept = decimalChoice ?? (evidence.state === 'settled' ? decimal : null)
    rememberMapping(budgetId, {
      header: [...header],
      separator,
      mapping: { ...mapping, decimal: kept },
    })
    onReady({
      entries: mapped.rows.map(({ line, row }) => ({ key: line, row })),
      problems: mapped.problems,
      adjustments: mapped.rows.flatMap(({ line, adjustments }) =>
        adjustments.map((adjustment) => ({ line, adjustment })),
      ),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 ref={heading} tabIndex={-1} data-step-heading>
            {t('import.csv.title')}
          </h2>
        </CardTitle>
        <CardDescription>{t('import.csv.help')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {parsed.unclosedQuoteAt !== null && (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden />
            <AlertDescription>
              {t('import.csv.unclosedQuote', { line: parsed.unclosedQuoteAt })}
            </AlertDescription>
          </Alert>
        )}
        {parsed.cleaned.length > 0 && (
          <Alert data-testid="csv-cleaned">
            <InfoIcon aria-hidden />
            <AlertDescription>
              {t('import.csv.cleaned', {
                count: parsed.cleaned.length,
                lines: parsed.cleaned.slice(0, LISTED).join(', '),
              })}
            </AlertDescription>
          </Alert>
        )}
        {remembered && (
          <Alert>
            <InfoIcon aria-hidden />
            <AlertDescription>{t('import.csv.remembered')}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${id}-separator`}>{t('import.csv.separator')}</Label>
            <NativeSelect
              id={`${id}-separator`}
              value={separator}
              onChange={(event) => setSeparator(event.target.value as CsvSeparator)}
            >
              {CSV_SEPARATORS.map((value) => (
                <option key={value} value={value}>
                  {t(`import.csv.separators.${value}`)}
                </option>
              ))}
            </NativeSelect>
            {detected === null && (
              <p className="text-xs text-muted-foreground">{t('import.csv.separatorUnknown')}</p>
            )}
          </div>
          <div className="flex items-center gap-2 sm:mt-6">
            <Checkbox
              id={`${id}-header`}
              checked={mapping.hasHeader}
              onCheckedChange={(next) => set({ hasHeader: next === true })}
            />
            <Label htmlFor={`${id}-header`}>{t('import.csv.hasHeader')}</Label>
          </div>
          {firstIsData && !mapping.hasHeader && (
            <p className="text-xs font-medium sm:col-span-2" data-testid="header-note">
              {t('import.csv.firstLineData')}
            </p>
          )}
        </div>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">{t('import.csv.title')}</legend>
          {columnField(t('import.csv.date'), 'date', false)}
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${id}-format`}>{t('import.csv.dateFormat')}</Label>
            <NativeSelect
              id={`${id}-format`}
              value={mapping.dateFormat ?? ''}
              aria-describedby={ambiguous || noFormat ? `${id}-format-note` : undefined}
              onChange={(event) =>
                set({
                  dateFormat: event.target.value === '' ? null : (event.target.value as DateFormat),
                })
              }
            >
              <option value="">{t('import.csv.dateFormatChoose')}</option>
              {DATE_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </NativeSelect>
            {(ambiguous || noFormat) && (
              <p
                id={`${id}-format-note`}
                className="text-xs font-medium"
                data-testid="date-format-note"
              >
                {ambiguous ? t('import.csv.dateFormatAmbiguous') : t('import.csv.dateFormatNone')}
              </p>
            )}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-sm font-medium">{t('import.csv.amountMode')}</legend>
          <RadioGroup
            value={mapping.amountMode}
            onValueChange={(value) => set({ amountMode: value === 'split' ? 'split' : 'signed' })}
            className="flex flex-col gap-2"
          >
            <Choice id={`${id}-signed`} value="signed" label={t('import.csv.amountSigned')} />
            <Choice id={`${id}-split`} value="split" label={t('import.csv.amountSplit')} />
          </RadioGroup>
          {mapping.amountMode === 'signed' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {columnField(t('import.csv.amount'), 'amount', false)}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium" id={`${id}-negative`}>
                  {t('import.csv.negativeMeans')}
                </span>
                <RadioGroup
                  aria-labelledby={`${id}-negative`}
                  value={mapping.negativeMeans}
                  onValueChange={(value) =>
                    set({ negativeMeans: value === 'credit' ? 'credit' : 'debit' })
                  }
                  className="flex flex-col gap-2"
                >
                  <Choice
                    id={`${id}-neg-debit`}
                    value="debit"
                    label={t('import.csv.negativeDebit')}
                  />
                  <Choice
                    id={`${id}-neg-credit`}
                    value="credit"
                    label={t('import.csv.negativeCredit')}
                  />
                </RadioGroup>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {columnField(t('import.csv.debit'), 'debit', false)}
              {columnField(t('import.csv.credit'), 'credit', false)}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" id={`${id}-decimal`}>
              {t('import.csv.decimal')}
            </span>
            <RadioGroup
              aria-labelledby={`${id}-decimal`}
              aria-describedby={evidence.state !== 'none' ? `${id}-decimal-note` : undefined}
              value={mapping.decimal ?? ''}
              disabled={evidence.state === 'contradictory'}
              onValueChange={(value) => set({ decimal: value === ',' ? ',' : '.' })}
              className="flex flex-wrap gap-x-6 gap-y-2"
            >
              <Choice id={`${id}-point`} value="." label={t('import.csv.decimalPoint')} />
              <Choice id={`${id}-comma`} value="," label={t('import.csv.decimalComma')} />
            </RadioGroup>
            {evidence.state === 'settled' && (
              <p
                id={`${id}-decimal-note`}
                className="text-xs text-muted-foreground"
                data-testid="decimal-note"
              >
                {t(
                  evidence.mark === ','
                    ? 'import.csv.decimalFromComma'
                    : 'import.csv.decimalFromPoint',
                  {
                    lines: named(evidence.mark === ',' ? evidence.comma : evidence.point),
                  },
                )}
              </p>
            )}
            {evidence.state === 'undecided' && (
              <p
                id={`${id}-decimal-note`}
                className="text-xs font-medium"
                data-testid="decimal-note"
              >
                {t('import.csv.decimalUndecided', { lines: named(evidence.ambiguous) })}
              </p>
            )}
            {evidence.state === 'contradictory' && (
              <Alert variant="destructive" id={`${id}-decimal-note`} data-testid="decimal-note">
                <TriangleAlertIcon aria-hidden />
                <AlertDescription>
                  {t('import.csv.decimalContradictory', {
                    point: named(evidence.point),
                    comma: named(evidence.comma),
                  })}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          {columnField(t('import.csv.description'), 'description', true)}
          {columnField(t('import.csv.merchant'), 'merchant', true)}
          {columnField(t('import.csv.bankId'), 'bankId', true)}
        </div>

        <section aria-labelledby={`${id}-sample`} className="flex flex-col gap-2">
          <h3 id={`${id}-sample`} className="text-sm font-medium">
            {t('import.csv.sample')}
          </h3>
          {!complete || sample.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {complete
                ? t('import.csv.noRows')
                : mapping.decimal === null && evidence.state === 'undecided'
                  ? t('import.csv.sampleNeedsDecimal')
                  : t('import.csv.sampleEmpty')}
            </p>
          ) : (
            <ul
              className="flex flex-col divide-y rounded-lg border text-sm"
              data-testid="csv-sample"
            >
              {sample.map(({ line, row }) => (
                <li
                  key={line}
                  className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 p-2.5 sm:grid-cols-[6rem_1fr_auto]"
                >
                  <span className="text-muted-foreground tabular-nums">
                    {formatCalendarDate(row.date)}
                  </span>
                  <span className="min-w-0">
                    <ExternalText>{row.description ?? row.merchant ?? '—'}</ExternalText>
                    {row.merchant && row.description && (
                      <span className="block text-xs text-muted-foreground">
                        <ExternalText>{row.merchant}</ExternalText>
                      </span>
                    )}
                    {row.bank_transaction_id && (
                      <span className="block text-xs text-muted-foreground">
                        <ExternalText>{row.bank_transaction_id}</ExternalText>
                      </span>
                    )}
                  </span>
                  <span className="col-start-2 text-left tabular-nums sm:col-start-auto sm:text-right">
                    {row.direction === 'debit' ? '−' : '+'}
                    {formatMoney(row.amount)}{' '}
                    <span className="text-xs text-muted-foreground">
                      {t(`import.csv.sampleDirection.${row.direction}`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {complete && mapped.problems.length > 0 && (
          <Notes
            title={t('import.csv.problemsTitle', { count: mapped.problems.length })}
            testId="csv-problems"
            items={mapped.problems.slice(0, LISTED).map(({ line, problem }) => ({
              key: `${line}`,
              text: t('import.csv.problemLine', {
                line,
                problem: t(`import.csv.problems.${problem}`),
              }),
            }))}
            more={mapped.problems.length - LISTED}
          />
        )}

        {tooMany && (
          <Alert variant="destructive" data-testid="csv-too-many">
            <TriangleAlertIcon aria-hidden />
            <AlertDescription>
              {t('import.csv.tooMany', {
                count: mapped.rows.length,
                max: formatCount(MAX_BATCH_ROWS),
              })}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeftIcon aria-hidden />
            {t('import.csv.back')}
          </Button>
          <Button
            type="button"
            disabled={!complete || mapped.rows.length === 0 || tooMany}
            onClick={ready}
          >
            {t('import.csv.continue', { count: mapped.rows.length })}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Choice({ id, value, label }: { id: string; value: string; label: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem id={id} value={value} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  )
}
