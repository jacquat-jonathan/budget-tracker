import { CheckCircle2Icon, FileSpreadsheetIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Notes } from '@/features/import/components/notes'
import type { ImportAdjustment, ImportBatch } from '@/features/import/statements/import-rows'
import type { ParsedStatement } from '@/features/import/statements/types'
import type { CsvAdjustment, CsvProblem } from '@/features/import/csv/csv-map'
import { formatCalendarDate } from '@/lib/date'

/** What was read: a statement (and its notes), or a CSV file (and its unreadable lines). */
export type ReadInfo =
  | {
      kind: 'pdf'
      statement: Pick<ParsedStatement, 'source' | 'identity' | 'controls'> & { entryCount: number }
      notSent: ImportBatch['notSent']
      adjustments: ImportAdjustment[]
    }
  | {
      kind: 'csv'
      rowCount: number
      problems: { line: number; problem: CsvProblem }[]
      adjustments: { line: number; adjustment: CsvAdjustment }[]
    }

const LISTED = 50

/**
 * What the reader recognised (source, period or bill date, how many entries, how many printed
 * figures it checked), and the entries that produce no row or were shortened to fit, in words.
 */
export function ReadSummary({ info }: { info: ReadInfo }) {
  const { t } = useTranslation()
  if (info.kind === 'csv') {
    return (
      <div className="flex flex-col gap-3" data-testid="read-summary">
        <p className="flex items-center gap-2 text-sm">
          <FileSpreadsheetIcon className="size-4 text-muted-foreground" aria-hidden />
          {t('import.sources.csv')} · {t('import.recognised.entries', { count: info.rowCount })}
        </p>
        {info.problems.length > 0 && (
          <Notes
            title={t('import.csv.problemsTitle', { count: info.problems.length })}
            items={info.problems.slice(0, LISTED).map(({ line, problem }) => ({
              key: `p${line}`,
              text: t('import.csv.problemLine', {
                line,
                problem: t(`import.csv.problems.${problem}`),
              }),
            }))}
            more={info.problems.length - LISTED}
            testId="read-problems"
          />
        )}
        {info.adjustments.length > 0 && (
          <Notes
            title={t('import.csv.adjustedTitle')}
            items={info.adjustments.slice(0, LISTED).map(({ line, adjustment }) => ({
              key: `a${line}${adjustment}`,
              text: t(`import.csv.adjusted.${adjustment}`, { line }),
            }))}
            more={info.adjustments.length - LISTED}
          />
        )}
      </div>
    )
  }
  const { statement } = info
  const source = t(`import.sources.${statement.source}`)
  const identity =
    statement.identity.kind === 'period'
      ? t('import.recognised.period', {
          source,
          from: formatCalendarDate(statement.identity.from),
          to: formatCalendarDate(statement.identity.to),
        })
      : statement.identity.dueDate
        ? t('import.recognised.billDue', {
            source,
            date: formatCalendarDate(statement.identity.billDate),
            due: formatCalendarDate(statement.identity.dueDate),
          })
        : t('import.recognised.bill', {
            source,
            date: formatCalendarDate(statement.identity.billDate),
          })
  return (
    <div className="flex flex-col gap-3" data-testid="read-summary">
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium">{identity}</p>
        <p>{t('import.recognised.entries', { count: statement.entryCount })}</p>
        <p className="flex items-center gap-2" data-testid="adds-up">
          <CheckCircle2Icon className="size-4 shrink-0 text-positive" aria-hidden />
          {t('import.recognised.addsUp', { count: statement.controls.length })}
        </p>
      </div>
      {info.notSent.length > 0 && (
        <Notes
          title={t('import.recognised.notSentTitle')}
          items={info.notSent.map(({ n, code }) => ({
            key: `n${n}`,
            text: t(`import.recognised.notSent.${code}`, { n }),
          }))}
          more={0}
          testId="not-sent"
        />
      )}
      {info.adjustments.length > 0 && (
        <Notes
          title={t('import.recognised.adjustmentsTitle')}
          items={info.adjustments.map((adjustment, index) => ({
            key: `a${index}`,
            text:
              adjustment.field === 'details'
                ? t('import.recognised.adjustments.details', {
                    n: adjustment.n,
                    keys: adjustment.keys
                      .map((key) =>
                        t(
                          `import.preview.detailKeys.${key === 'original_amount' || key === 'original_currency' ? 'original' : key}`,
                        ),
                      )
                      .filter((name, at, all) => all.indexOf(name) === at)
                      .join(', '),
                  })
                : t(`import.recognised.adjustments.${adjustment.field}`, { n: adjustment.n }),
          }))}
          more={0}
          testId="adjustments"
        />
      )}
    </div>
  )
}
