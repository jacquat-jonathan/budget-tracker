import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ChangedElsewhere, GoneElsewhere, SaveError } from '@/components/changed-elsewhere'
import { CorrectionToggle } from '@/components/form/correction-toggle'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBudgetEnded } from '@/features/budgets/budget-ended'
import type { PeriodSummary } from '@/features/budgets/budget-queries'
import { pickPeriod, useOlderPeriodsOption } from '@/features/budgets/older-periods'
import { OlderPeriodsItem } from '@/features/budgets/older-periods-item'
import { useRecordSettled } from '@/features/budgets/record-settled'
import { useEndTransfer } from '@/features/transfers/transfer-mutations'
import {
  useEndPreview,
  useTransferRecord,
  type Transfer,
} from '@/features/transfers/transfer-queries'
import { useTransferViews } from '@/features/transfers/transfer-views'
import { useErrorMessage } from '@/hooks/use-app-mutation'
import { useEditBase } from '@/hooks/use-edit-base'
import { formatCalendarDate } from '@/lib/date'

export function EndTransferDialog({
  budgetId,
  transfer,
  periods,
  currentPeriod,
  onClose,
}: {
  budgetId: string
  transfer: Transfer | null
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
  onClose: () => void
}) {
  return (
    <AlertDialog
      open={transfer !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        {transfer && (
          <EndBody
            budgetId={budgetId}
            opened={transfer}
            periods={periods}
            currentPeriod={currentPeriod}
            onClose={onClose}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

// R-ACCOUNT-234: ending says beforehand what it removes and that what was recorded stays.
function EndBody({
  budgetId,
  opened,
  periods,
  currentPeriod,
  onClose,
}: {
  budgetId: string
  opened: Transfer
  periods: PeriodSummary[]
  currentPeriod: PeriodSummary | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage({ record_changed: 'transfers.changedNotShown' })
  const views = useTransferViews()
  const live = useTransferRecord(budgetId, opened.id)
  const removal = useEditBase(opened, live, views, (record) => !record.is_active)
  const settled = useRecordSettled(budgetId, 'transfer_overview', opened.id, live)
  const transfer = live ?? removal.base ?? opened
  const end = useEndTransfer(budgetId)
  const mustCorrect = useBudgetEnded(budgetId)
  const correctable = periods.filter(
    (period) => !period.is_current && period.seq >= transfer.first_seq,
  )
  const [correct, setCorrect] = useState(mustCorrect)
  const [fromPeriodId, setFromPeriodId] = useState(correctable[0]?.id ?? '')
  const olderPeriods = useOlderPeriodsOption(budgetId)
  const preview = useEndPreview(budgetId, transfer.id, correct ? fromPeriodId || null : null)
  const answer = preview.data
  const outcome = answer?.outcome ?? null
  const refusal = answer?.refusal ?? null
  const deletes = outcome === 'deleted'
  const blocked =
    removal.changed || removal.gone || !settled || outcome === null || preview.isFetching
  const label = (period: PeriodSummary) =>
    t('income.fields.fromPeriod', {
      start: formatCalendarDate(period.start_date),
      end: formatCalendarDate(period.end_date),
    })

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {deletes
            ? t('transfers.end.deleteTitle', { name: transfer.name })
            : t('transfers.end.title', { name: transfer.name })}
        </AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="flex flex-col gap-2" data-testid="end-transfer-outcome">
            <p>
              {preview.isError
                ? errorMessage(preview.error)
                : refusal
                  ? t('transfers.end.refused', { reason: t(`errors.db.${refusal}`) })
                  : outcome === null
                    ? t('common.loading')
                    : deletes
                      ? t('transfers.end.deletes')
                      : correct
                        ? t('transfers.end.fromEarlier')
                        : currentPeriod
                          ? t('transfers.end.ends', {
                              date: formatCalendarDate(currentPeriod.start_date),
                            })
                          : t('transfers.end.endsNoPeriod')}
            </p>
            {answer && outcome === 'ended' && answer.occurrencesRemoved > 0 && (
              <p>{t('transfers.end.removes', { count: answer.occurrencesRemoved })}</p>
            )}
            {answer && outcome === 'ended' && answer.marksKept > 0 && (
              <p data-testid="end-keeps">
                {t('transfers.end.keepsMarks', {
                  count: answer.marksKept,
                  transactions: answer.transactionsKept,
                })}
              </p>
            )}
            {outcome === 'ended' && <p>{t('transfers.end.recordedStays')}</p>}
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      {correctable.length > 0 && (
        <CorrectionToggle
          checked={correct}
          onCheckedChange={setCorrect}
          label={t('transfers.end.earlierLabel')}
          warning={t('transfers.end.earlierWarning')}
          required={mustCorrect ? t('corrections.budgetEnded') : undefined}
        >
          <Field>
            <FieldLabel htmlFor="end-transfer-period">{t('transfers.end.from')}</FieldLabel>
            <Select value={fromPeriodId} onValueChange={pickPeriod(olderPeriods, setFromPeriodId)}>
              <SelectTrigger id="end-transfer-period" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {correctable.map((period) => (
                  <SelectItem key={period.id} value={period.id}>
                    {label(period)}
                  </SelectItem>
                ))}
                <OlderPeriodsItem option={olderPeriods} />
              </SelectContent>
            </Select>
          </Field>
        </CorrectionToggle>
      )}
      {removal.gone && (
        <GoneElsewhere
          ended={live !== null && live !== undefined}
          endedText={t('transfers.endedElsewhere')}
        />
      )}
      {removal.changed && (
        <ChangedElsewhere
          kind="remove"
          changes={removal.theirs}
          onKeepMine={() => {
            removal.adopt()
            end.reset()
          }}
        />
      )}
      <SaveError error={end.error} hidden={blocked} message={errorMessage} />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={end.isPending}>{t('common.cancel')}</AlertDialogCancel>
        <Button
          variant="destructive"
          disabled={end.isPending || blocked || refusal !== null}
          onClick={() =>
            end.mutate(
              {
                transfer,
                revision: (removal.base ?? transfer).revision,
                fromPeriodId: correct ? fromPeriodId || null : null,
              },
              { onSuccess: onClose },
            )
          }
        >
          {end.isPending
            ? t('common.saving')
            : deletes
              ? t('transfers.end.delete')
              : t('transfers.end.confirm')}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
