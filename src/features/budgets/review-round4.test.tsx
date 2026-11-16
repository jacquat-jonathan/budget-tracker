import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { ErrorState } from '@/components/states'
import i18n from '@/lib/i18n'
import { createQueryClient } from '@/lib/query-client'
import { categoriesDb, DEBT_ID, debtRow, periodRow, transactionRow } from '@/test/budget-fixtures'
import { dbError, type MockDb } from '@/test/mock-db'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

const periodId = (seq: number) => `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`

/** `count` periods with uuid ids, the newest current: more than one page of list_periods. */
function manyPeriods(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const seq = index + 1
    const start = new Date(Date.UTC(2016, 0, 1 + index * 30))
    const end = new Date(Date.UTC(2016, 0, 30 + index * 30))
    const last = seq === count
    return periodRow({
      id: periodId(seq),
      seq,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      is_current: last,
      today: last ? start.toISOString().slice(0, 10) : end.toISOString().slice(0, 10),
    })
  })
}

function open(db: MockDb, path: string) {
  mock.current = createSupabaseMock(fakeSession(), db)
  return renderRoutes(routes, path)
}

describe('a read answered catching_up [R-PERIOD-280]', () => {
  it('is never retried as a failure', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry as (
      failures: number,
      error: unknown,
    ) => boolean
    expect(retry(0, dbError('catching_up'))).toBe(false)
    expect(retry(0, new Error('boom'))).toBe(true)
    expect(retry(1, new Error('boom'))).toBe(false)
  })

  it('never shows an error card: it waits for the catch-up', () => {
    render(<ErrorState error={dbError('catching_up')} onRetry={() => undefined} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })
})

describe('transaction dates beyond the first page of periods [R-TRANSACTION-280]', () => {
  it('reach back to the budget’s first period', async () => {
    const db = categoriesDb({ period_summaries: manyPeriods(130) })
    open(db, '/transactions')
    await screen.findByRole('button', { name: 'Add transaction' })
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a transaction' })
    // Period 1 starts on 01.01.2016; the first page of 120 starts at period 11.
    expect(dialog).toHaveTextContent('From 01.01.2016 to')
  })
})

describe('a period named in the address [R-PERIOD-281]', () => {
  it('is read by its id when it is older than the pages loaded, and shown in its filter', async () => {
    const db = categoriesDb({ period_summaries: manyPeriods(130) })
    open(db, `/transactions?period=${periodId(3)}`)
    await screen.findByRole('button', { name: 'Add transaction' })
    await waitFor(() => {
      expect(db.rpc.list_transactions).toHaveBeenCalledWith(
        expect.objectContaining({ p_from_date: '2016-03-01', p_to_date: '2016-03-30' }),
      )
    })
    // Never the current period first (period 130 starts in 2026).
    for (const [args] of db.rpc.list_transactions.mock.calls) {
      expect(args).toMatchObject({ p_from_date: '2016-03-01' })
    }
    expect(screen.getByRole('combobox', { name: 'Period' })).toHaveTextContent(
      '01.03.2016 – 30.03.2016',
    )
  })

  it('a value that is not a uuid is never sent: the default period is shown', async () => {
    const db = categoriesDb({ period_summaries: manyPeriods(3) })
    open(db, '/transactions?period=nonsense')
    await screen.findByRole('button', { name: 'Add transaction' })
    await waitFor(() => {
      expect(db.rpc.list_transactions).toHaveBeenCalledWith(
        expect.objectContaining({ p_from_date: '2016-03-01', p_to_date: '2016-03-30' }),
      )
    })
  })
})

describe('an add whose answer was lost [R-CONCURRENCY-281]', () => {
  it('says it may have been saved and to check the list, never "nothing was saved"', async () => {
    const db = categoriesDb()
    db.rpc.add_transaction.mockImplementationOnce(() => {
      // Recorded; the answer never arrived.
      throw new TypeError('Failed to fetch')
    })
    open(db, '/transactions')
    await screen.findByRole('button', { name: 'Add transaction' })
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a transaction' })
    await userEvent.type(within(dialog).getByLabelText('Amount'), '45.20')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Groceries' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText(
        'The connection failed before the answer came back: it may have been saved. Check the list before saving again, so it is not recorded twice.',
      ),
    ).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('nothing was saved')
  })
})

describe('counts [R-APP-282]', () => {
  it('are grouped like amounts in every message, whatever the language', async () => {
    expect(i18n.t('compare.averages.over', { count: 12_345, lng: 'en' })).toBe(
      "over 12'345 completed periods",
    )
    expect(i18n.t('compare.averages.over', { count: 1, lng: 'en' })).toBe('over 1 completed period')
    await i18n.changeLanguage('fr')
    expect(i18n.t('compare.averages.over', { count: 12_345 })).toContain("12'345")
    await i18n.changeLanguage('en')
  })
})

describe('removing a filter chip [R-SUBSCRIPTION-191]', () => {
  it('moves focus to the period filter once the last chip is gone, never to the page', async () => {
    const db = categoriesDb({
      debt_overview: [debtRow({ id: DEBT_ID, name: 'Bike loan' })],
      transaction_list: [transactionRow()],
    })
    open(db, `/transactions?period=all&debt=${DEBT_ID}`)
    const chips = await screen.findByTestId('link-filters')
    await userEvent.click(
      within(chips).getByRole('button', { name: 'Remove the filter “Debt: Bike loan”' }),
    )
    await waitFor(() => {
      expect(document.activeElement).toBe(document.getElementById('filter-period'))
    })
  })
})
