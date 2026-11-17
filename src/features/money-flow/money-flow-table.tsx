import { TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { MoneyFlow } from '@/features/money-flow/money-flow-model'
import { formatMoney } from '@/lib/money'

/**
 * Every figure of the money flow as text (the diagram's alternative, R-ACCOUNT-235): the
 * incomes and the account each arrives on, the transfers at their monthly share beside their
 * real amount and cadence, and each account's in, out and what stays, with the totals the
 * database gives. Read as tables by a screen reader; each scrolls inside its own frame.
 */
export function MoneyFlowTable({
  flow,
  accountName,
}: {
  flow: MoneyFlow
  accountName: (id: string | null) => string
}) {
  const { t } = useTranslation()
  const th = 'px-2 py-2 text-left font-medium text-muted-foreground sm:px-3'
  const num = 'px-2 py-2 text-right tabular-nums whitespace-nowrap sm:px-3'
  const cell = 'px-2 py-2 sm:px-3'
  return (
    <div className="flex flex-col gap-6" data-testid="money-flow-table">
      <Frame label={t('moneyFlow.table.incomes')}>
        <table className="w-full text-sm">
          <caption className="sr-only">{t('moneyFlow.table.incomes')}</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className={th}>
                {t('moneyFlow.table.income')}
              </th>
              <th scope="col" className={th}>
                {t('moneyFlow.table.into')}
              </th>
              <th scope="col" className={`${th} text-right`}>
                {t('moneyFlow.table.amount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {flow.incomes.map((income) => (
              <tr key={income.id} className="border-b last:border-0">
                <th scope="row" className={`${cell} text-left font-medium`}>
                  {income.name}
                </th>
                <td className={cell}>{accountName(income.target)}</td>
                <td className={num}>{formatMoney(income.amount)}</td>
              </tr>
            ))}
          </tbody>
          {flow.total && (
            <tfoot>
              <tr className="border-t font-medium">
                <th scope="row" colSpan={2} className={`${cell} text-left`}>
                  {t('moneyFlow.table.totalIncomes')}
                </th>
                <td className={num} data-testid="total-incomes">
                  {formatMoney(flow.total.incomes)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </Frame>
      {flow.transfers.length > 0 && (
        <Frame label={t('moneyFlow.table.transfers')}>
          <table className="w-full text-sm">
            <caption className="sr-only">{t('moneyFlow.table.transfers')}</caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className={th}>
                  {t('moneyFlow.table.transfer')}
                </th>
                <th scope="col" className={`${th} hidden sm:table-cell`}>
                  {t('moneyFlow.table.fromTo')}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t('moneyFlow.table.perMonth')}
                </th>
              </tr>
            </thead>
            <tbody>
              {flow.transfers.map((transfer) => (
                <tr key={transfer.id} className="border-b last:border-0">
                  <th scope="row" className={`${cell} text-left font-medium`}>
                    {transfer.name}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {t(
                        transfer.automatic
                          ? 'transfers.mode.automaticShort'
                          : 'transfers.mode.manualShort',
                      )}
                    </span>
                    {/* On a phone the accounts go under the name: three columns do not fit. */}
                    <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                      {t('transfers.fromTo', {
                        from: accountName(transfer.source),
                        to: accountName(transfer.target),
                      })}
                    </span>
                  </th>
                  <td className={`${cell} hidden sm:table-cell`}>
                    {t('transfers.fromTo', {
                      from: accountName(transfer.source),
                      to: accountName(transfer.target),
                    })}
                  </td>
                  <td className={num}>
                    {formatMoney(transfer.amount)}
                    {(transfer.cadence === 'quarterly' || transfer.cadence === 'yearly') && (
                      <span className="block text-xs whitespace-normal text-muted-foreground">
                        {t(`transfers.amountPer.${transfer.cadence}`, {
                          amount: formatMoney(transfer.planned),
                        })}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {flow.total && (
              <tfoot>
                <tr className="border-t font-medium">
                  <th scope="row" colSpan={2} className={`${cell} text-left`}>
                    {t('moneyFlow.table.totalTransfers')}
                  </th>
                  <td className={num} data-testid="total-transfers">
                    {formatMoney(flow.total.transfers)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </Frame>
      )}
      {(flow.accounts.length > 0 || flow.notAssigned) && (
        <Frame label={t('moneyFlow.table.accounts')}>
          <table className="w-full text-xs sm:text-sm">
            <caption className="sr-only">{t('moneyFlow.table.accounts')}</caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className={th}>
                  {t('moneyFlow.table.account')}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t('moneyFlow.table.in')}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t('moneyFlow.table.out')}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t('moneyFlow.table.stays')}
                </th>
              </tr>
            </thead>
            <tbody>
              {flow.accounts.map((account) => (
                <tr
                  key={account.id}
                  className="border-b last:border-0"
                  data-testid="flow-account-row"
                >
                  <th scope="row" className={`${cell} text-left font-medium`}>
                    {account.name}
                    <span className="hidden text-xs font-normal text-muted-foreground sm:block">
                      {t(`accounts.kinds.${account.kind}`)}
                    </span>
                  </th>
                  <td className={num}>{formatMoney(account.inflow)}</td>
                  <td className={num}>{formatMoney(account.outflow)}</td>
                  <td className={num}>
                    {account.negative ? (
                      <span className="inline-flex items-center gap-1 font-medium text-destructive">
                        <TriangleAlertIcon className="size-3.5" aria-hidden />
                        {formatMoney(account.stays)}
                        <span className="sr-only">{t('moneyFlow.table.negative')}</span>
                      </span>
                    ) : (
                      formatMoney(account.stays)
                    )}
                  </td>
                </tr>
              ))}
              {flow.notAssigned && (
                <tr className="border-b last:border-0">
                  <th scope="row" className={`${cell} text-left font-medium`}>
                    {t('moneyFlow.notAssigned')}
                  </th>
                  <td className={num}>{formatMoney(flow.notAssigned.inflow)}</td>
                  <td className={num}>{formatMoney(0)}</td>
                  <td className={num}>{formatMoney(flow.notAssigned.inflow)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Frame>
      )}
      <p className="text-xs text-muted-foreground">{t('moneyFlow.table.noBalance')}</p>
    </div>
  )
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">{label}</h2>
      <div
        className="overflow-x-auto rounded-xl border"
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        {children}
      </div>
    </section>
  )
}
