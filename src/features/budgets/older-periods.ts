import { useTranslation } from 'react-i18next'

import { MORE_VALUE, type MoreOption } from '@/components/form/select-field'
import { usePeriods } from '@/features/budgets/budget-queries'

/**
 * The last entry of every period picker while older periods exist than those read
 * (list_periods pages, R-PERIOD-191): choosing it reads the next page; the list then holds
 * them. Undefined when every period is read.
 */
// R-PERIOD-192: every period picker reaches the oldest period, a page at a time, and says so.
export function useOlderPeriodsOption(budgetId: string): MoreOption | undefined {
  const { t } = useTranslation()
  const periods = usePeriods(budgetId)
  if (!periods.hasOlder) return undefined
  return {
    label: periods.loadingOlder ? t('common.loading') : t('periods.older'),
    onSelect: () => void periods.loadOlder(),
  }
}

/** A plain Select's change handler that runs the entry's action instead of choosing it. */
export function pickPeriod(option: MoreOption | undefined, set: (value: string) => void) {
  return (value: string) => {
    if (value === MORE_VALUE) option?.onSelect()
    else set(value)
  }
}
