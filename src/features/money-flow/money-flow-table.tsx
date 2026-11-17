import { ListIcon, TriangleAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { transactionsOf } from '@/app/paths'
import { groupColor, slotColor } from '@/features/money-flow/money-flow-words'
import {
  accountSlots,
  groupSlots,
  type Basis,
  type MoneyFlow,
} from '@/features/money-flow/money-flow-model'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

interface Column {
  label: string
}

interface TableRow {
  key: string
  header: ReactNode
  /** One cell per amount column; each says its column's name on a phone. */
  cells: ReactNode[]
  testId?: string
  total?: boolean
}

/**
 * A table of amounts that becomes row blocks below 640 px: the name on its own line, then
 * each column's name and amount, the amounts right-aligned in one column with the total block,
 * so they always line up and no column is ever cut. From 640 px it is a plain table. Explicit
 * roles keep it a table for screen readers in both layouts.
 */
function AmountTable({
  caption,
  first,
  columns,
  rows,
  footer,
  testId,
}: {
  caption: string
  first: string
  columns: Column[]
  rows: TableRow[]
  footer: TableRow[]
  testId?: string
}) {
  const block = 'max-sm:block'
  const cell =
    'px-3 py-1 text-right tabular-nums whitespace-nowrap max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-3 max-sm:py-0.5 max-sm:whitespace-normal sm:py-2'
  const row = (item: TableRow) => (
    <tr
      key={item.key}
      role="row"
      className={cn('border-b last:border-0 max-sm:block max-sm:py-2', item.total && 'font-medium')}
      data-testid={item.testId}
    >
      <th
        scope="row"
        role="rowheader"
        className="px-3 py-1 text-left align-top font-medium max-sm:block sm:py-2"
      >
        {item.header}
      </th>
      {item.cells.map((content, index) => (
        <td key={index} role="cell" className={cell}>
          <span className="text-xs font-normal text-muted-foreground sm:hidden">
            {columns[index]?.label}
          </span>
          <span className="flex flex-col items-end text-right">{content}</span>
        </td>
      ))}
    </tr>
  )
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className="font-medium">{caption}</h2>
      <div className="rounded-xl border">
        <table role="table" className={cn('w-full text-sm', block)} data-testid={testId}>
          <caption className="sr-only">{caption}</caption>
          <thead className="max-sm:hidden">
            <tr role="row" className="border-b">
              <th
                scope="col"
                role="columnheader"
                className="px-3 py-2 text-left font-medium text-muted-foreground"
              >
                {first}
              </th>
              {columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  role="columnheader"
                  className="px-3 py-2 text-right font-medium text-muted-foreground"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={block}>{rows.map(row)}</tbody>
          {footer.length > 0 && (
            <tfoot className={cn(block, 'border-t bg-muted/40')}>{footer.map(row)}</tfoot>
          )}
        </table>
      </div>
    </section>
  )
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="mr-1.5 inline-block size-2.5 shrink-0 rounded-sm align-baseline"
      style={{ background: color }}
    />
  )
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-destructive">
      <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <span className="block text-xs font-normal whitespace-normal text-muted-foreground">
      {children}
    </span>
  )
}

/**
 * Every figure of the money flow as text, the diagram's alternative (R-ACCOUNT-235): the
 * incomes and where each arrives, the transfers at their monthly share beside their real
 * amount and cadence (with a link to their transactions, D-525), each account's in, out and
 * what stays (spendable or set aside), and the spending by category group, planned and spent,
 * with the totals the database gives: nothing added up here.
 */
export function MoneyFlowTable({
  flow,
  basis,
  accountName,
  periodId,
}: {
  flow: MoneyFlow
  basis: Basis
  accountName: (id: string | null) => string
  periodId: string
}) {
  const { t } = useTranslation()
  const m = formatMoney
  const total = flow.total
  const slots = accountSlots(flow.accounts)
  const groups = groupSlots(flow.spending)
  const fromTo = (source: string, target: string) =>
    t('transfers.fromTo', { from: accountName(source), to: accountName(target) })
  return (
    <div className="flex flex-col gap-6" data-testid="money-flow-table">
      <AmountTable
        caption={t('moneyFlow.table.incomes')}
        first={t('moneyFlow.table.income')}
        columns={[{ label: t('moneyFlow.table.amount') }]}
        rows={flow.incomes.map((income) => ({
          key: income.id,
          testId: 'flow-income-row',
          header: (
            <>
              {income.name}
              <Note>{t('moneyFlow.table.arrivesOn', { account: accountName(income.target) })}</Note>
            </>
          ),
          cells: [m(income.amount)],
        }))}
        footer={
          total
            ? [
                {
                  key: 'total',
                  total: true,
                  header: t('moneyFlow.table.totalIncomes'),
                  cells: [
                    <span key="t" data-testid="total-incomes">
                      {m(total.incomes)}
                    </span>,
                  ],
                },
              ]
            : []
        }
      />
      {flow.transfers.length > 0 && (
        <AmountTable
          caption={t('moneyFlow.table.transfers')}
          first={t('moneyFlow.table.transfer')}
          columns={[{ label: t('moneyFlow.table.perMonth') }]}
          rows={flow.transfers.map((transfer) => ({
            key: transfer.id,
            testId: 'flow-transfer-row',
            header: (
              <>
                {transfer.name}
                <Note>
                  {fromTo(transfer.source, transfer.target)} ·{' '}
                  {t(
                    transfer.automatic
                      ? 'transfers.mode.automaticShort'
                      : 'transfers.mode.manualShort',
                  )}
                </Note>
                <Link
                  to={transactionsOf({ period: periodId, transfer: transfer.id })}
                  className="mt-0.5 inline-flex items-center gap-1 text-xs font-normal text-primary underline-offset-4 hover:underline"
                  aria-label={t('moneyFlow.table.itsTransactionsFor', { name: transfer.name })}
                >
                  <ListIcon className="size-3" aria-hidden />
                  {t('moneyFlow.table.itsTransactions')}
                </Link>
              </>
            ),
            cells: [
              <>
                {m(transfer.amount)}
                {(transfer.cadence === 'quarterly' || transfer.cadence === 'yearly') && (
                  <Note>
                    {t(`transfers.amountPer.${transfer.cadence}`, { amount: m(transfer.planned) })}
                  </Note>
                )}
              </>,
            ],
          }))}
          footer={
            total
              ? [
                  {
                    key: 'total',
                    total: true,
                    header: t('moneyFlow.table.totalTransfers'),
                    cells: [
                      <span key="t" data-testid="total-transfers">
                        {m(total.transfers)}
                      </span>,
                    ],
                  },
                ]
              : []
          }
        />
      )}
      {(flow.accounts.length > 0 || flow.notAssigned) && (
        <AmountTable
          caption={t('moneyFlow.table.accounts')}
          first={t('moneyFlow.table.account')}
          columns={[
            { label: t('moneyFlow.table.in') },
            { label: t('moneyFlow.table.out') },
            { label: t('moneyFlow.table.stays') },
          ]}
          rows={[
            ...flow.accounts.map((account) => ({
              key: account.id,
              testId: 'flow-account-row',
              header: (
                <>
                  <Dot color={slotColor(slots.get(account.id) ?? 0)} />
                  {account.name}
                  <Note>{t(`accounts.kinds.${account.kind}`)}</Note>
                </>
              ),
              cells: [
                m(account.inflow),
                m(account.outflow),
                <>
                  {account.negative ? (
                    <Warn>
                      {m(account.stays)}
                      <span className="sr-only">{t('moneyFlow.table.negative')}</span>
                    </Warn>
                  ) : (
                    m(account.stays)
                  )}
                  <Note>
                    {account.negative
                      ? t('moneyFlow.table.negativeShort')
                      : account.spendable
                        ? t('moneyFlow.table.spendable')
                        : t('moneyFlow.table.setAside')}
                  </Note>
                </>,
              ],
            })),
            ...(flow.notAssigned
              ? [
                  {
                    key: 'not-assigned',
                    header: t('moneyFlow.notAssigned'),
                    cells: [
                      m(flow.notAssigned.inflow),
                      m(0),
                      <>
                        {m(flow.notAssigned.stays)}
                        <Note>{t('moneyFlow.table.spendable')}</Note>
                      </>,
                    ],
                  },
                ]
              : []),
          ]}
          footer={
            total
              ? [
                  {
                    key: 'spendable',
                    total: true,
                    header: t('moneyFlow.table.totalSpendable'),
                    cells: [
                      '',
                      '',
                      <span key="s" data-testid="total-spendable">
                        {total.spendable < 0 ? (
                          <Warn>{m(total.spendable)}</Warn>
                        ) : (
                          m(total.spendable)
                        )}
                      </span>,
                    ],
                  },
                  {
                    key: 'set-aside',
                    total: true,
                    header: t('moneyFlow.table.totalSetAside'),
                    cells: [
                      '',
                      '',
                      <span key="a" data-testid="total-set-aside">
                        {m(total.setAside)}
                      </span>,
                    ],
                  },
                ]
              : []
          }
        />
      )}
      <SpendingTable flow={flow} basis={basis} groups={groups} />
      <p className="text-xs text-muted-foreground">{t('moneyFlow.table.noBalance')}</p>
    </div>
  )
}

function SpendingTable({
  flow,
  basis,
  groups,
}: {
  flow: MoneyFlow
  basis: Basis
  groups: Map<string, number>
}) {
  const { t } = useTranslation()
  const m = formatMoney
  const total = flow.total
  const omitted = total?.omitted ?? 0
  return (
    <div className="flex flex-col gap-2" data-testid="money-flow-spending">
      <AmountTable
        caption={t('moneyFlow.table.spending')}
        first={t('moneyFlow.table.group')}
        columns={[{ label: t('moneyFlow.table.planned') }, { label: t('moneyFlow.table.spent') }]}
        rows={flow.spending.map((row) => ({
          key: row.id,
          testId: 'flow-spending-row',
          header: (
            <>
              <Dot color={groupColor(groups.get(row.id) ?? 0)} />
              {row.name}
            </>
          ),
          cells: [
            <>
              {m(row.amount)}
              {row.yearly !== null && (
                <Note>{t('moneyFlow.label.yearly', { amount: m(row.yearly) })}</Note>
              )}
              {row.transferShare !== 0 && (
                <Note>{t('moneyFlow.label.viaTransfers', { amount: m(row.transferShare) })}</Note>
              )}
            </>,
            <>
              {row.negative ? (
                <Warn>
                  {m(row.spent)}
                  <span className="sr-only">{t('moneyFlow.table.overPlan')}</span>
                </Warn>
              ) : (
                m(row.spent)
              )}
              {row.negative && <Note>{t('moneyFlow.table.overPlan')}</Note>}
              {row.transferSpent !== 0 && (
                <Note>
                  {t('moneyFlow.label.viaTransfersSpent', { amount: m(row.transferSpent) })}
                </Note>
              )}
            </>,
          ],
        }))}
        footer={
          total
            ? [
                {
                  key: 'total',
                  total: true,
                  header: t('moneyFlow.table.totalSpending'),
                  cells: [
                    <span key="p" data-testid="total-planned">
                      {m(total.plannedSpending)}
                    </span>,
                    <span key="a" data-testid="total-spent">
                      {m(total.actualSpending)}
                    </span>,
                  ],
                },
                {
                  key: 'rest',
                  total: true,
                  header: (
                    <>
                      {t('moneyFlow.table.remains')}
                      <Note>
                        {t('moneyFlow.table.remainsHelp', { amount: m(total.spendable) })}
                      </Note>
                    </>
                  ),
                  cells: [
                    <span key="n" data-testid="total-not-planned">
                      {total.notPlanned < 0 ? (
                        <>
                          <Warn>{m(total.notPlanned)}</Warn>
                          <Note>{t('moneyFlow.table.shortPlanned')}</Note>
                        </>
                      ) : (
                        <>
                          {m(total.notPlanned)}
                          <Note>{t('moneyFlow.table.notPlanned')}</Note>
                        </>
                      )}
                    </span>,
                    <span key="l" data-testid="total-left">
                      {total.left < 0 ? (
                        <>
                          <Warn>{m(total.left)}</Warn>
                          <Note>{t('moneyFlow.table.shortActual')}</Note>
                        </>
                      ) : (
                        <>
                          {m(total.left)}
                          <Note>{t('moneyFlow.table.left')}</Note>
                        </>
                      )}
                    </span>,
                  ],
                },
              ]
            : []
        }
        testId="spending-table"
      />
      {flow.spending.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('moneyFlow.table.noSpending')}</p>
      )}
      {omitted > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="spending-omitted">
          {t('moneyFlow.table.omitted', { count: omitted })}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t(`moneyFlow.table.spendingHelp.${basis}`)}</p>
    </div>
  )
}
