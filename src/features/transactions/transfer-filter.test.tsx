import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { BUDGET_ID, categoriesDb, transactionRow } from '@/test/budget-fixtures'
import { accountRow, transferRow } from '@/test/mock-transfers'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'
import { warmPages } from '@/test/warm'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createSupabaseMock> | null }))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

beforeAll(async () => {
  await warmPages('transactions', 'transfers')
}, 10_000)

const PILLAR = '11111111-2222-4333-8444-555555555555'
const OTHER = '99999999-2222-4333-8444-555555555555'
const JOINT = '22222222-2222-4333-8444-555555555555'
const GIFT = '33333333-2222-4333-8444-555555555555'

function filterDb() {
  return categoriesDb({
    account_overview: [
      accountRow({ id: 'acc-main', name: 'Main' }),
      accountRow({ id: 'acc-pillar', name: 'Pillar 3a', kind: 'third_pillar' }),
    ],
    transfer_overview: [
      transferRow({
        id: PILLAR,
        name: 'Pillar 3a',
        from_account_id: 'acc-main',
        from_account_name: 'Main',
        to_account_id: 'acc-pillar',
        to_account_name: 'Pillar 3a',
        category_id: 'cat-pillar',
      }),
      transferRow({ id: JOINT, name: 'Joint', category_id: null }),
      transferRow({ id: GIFT, name: 'Gift', category_id: 'cat-gift' }),
      transferRow({ id: OTHER, budget_id: 'another-budget', name: 'Not ours' }),
    ],
    transaction_list: [
      transactionRow({
        id: 'tx-pillar-oct',
        date: '2026-10-20',
        amount: 705_600,
        description: 'Pillar October',
        transfer_id: PILLAR,
        transfer_name: 'Pillar 3a',
        created_at: '2026-10-20T10:00:00+00:00',
      }),
      transactionRow({
        id: 'tx-pillar-nov',
        date: '2026-11-03',
        amount: 705_600,
        description: 'Pillar November',
        transfer_id: PILLAR,
        transfer_name: 'Pillar 3a',
        created_at: '2026-11-03T10:00:00+00:00',
      }),
      transactionRow({
        id: 'tx-rent',
        date: '2026-11-02',
        description: 'Rent November',
        created_at: '2026-11-02T10:00:00+00:00',
      }),
    ],
  })
}

describe('the transactions of one planned transfer [D-525] [R-TRANSACTION-441]', () => {
  it('lists that transfer’s transactions under a chip naming it and its accounts, with the other filters', async () => {
    const db = filterDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    const { router } = renderRoutes(routes, `/transactions?period=all&transfer=${PILLAR}`)
    const chips = await screen.findByTestId('link-filters')
    expect(chips).toHaveTextContent('Transfer: Pillar 3a (Main to Pillar 3a)')
    await waitFor(() => {
      expect(db.rpc.list_transactions).toHaveBeenCalledWith(
        expect.objectContaining({ p_budget_id: BUDGET_ID, p_transfer_id: PILLAR }),
      )
    })
    expect(await screen.findByText('Pillar November')).toBeVisible()
    expect(screen.getByText('Pillar October')).toBeVisible()
    expect(screen.queryByText('Rent November')).not.toBeInTheDocument()
    // Combined with the period filter, as the other link filters are.
    await userEvent.click(screen.getByLabelText('Period'))
    await userEvent.click(await screen.findByRole('option', { name: /23\.10\.2026/ }))
    await waitFor(() => {
      expect(db.rpc.list_transactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ p_transfer_id: PILLAR, p_from_date: '2026-10-23' }),
      )
    })
    expect(await screen.findByText('Pillar November')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByText('Pillar October')).not.toBeInTheDocument()
    })
    // Removable: the full list again.
    await userEvent.click(
      within(screen.getByTestId('link-filters')).getByRole('button', {
        name: /Remove the filter “Transfer: Pillar 3a/,
      }),
    )
    await waitFor(() => {
      expect(router.state.location.search).not.toContain('transfer=')
    })
    expect(await screen.findByText('Rent November')).toBeVisible()
    expect(db.rpc.list_transactions).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ p_transfer_id: expect.anything() as unknown }),
    )
  })

  it('a transfer that is gone, another budget’s, or not an id says so and offers the full list', async () => {
    for (const id of [OTHER, 'not-an-id', '12345678-2222-4333-8444-555555555555']) {
      const db = filterDb()
      mock.current = createSupabaseMock(fakeSession(), db)
      const { router, unmount } = renderRoutes(routes, `/transactions?period=all&transfer=${id}`)
      const gone = await screen.findByTestId('transfer-gone')
      expect(gone).toHaveTextContent('This transfer is not in this budget')
      // Never the whole list in its place.
      expect(screen.queryByText('Rent November')).not.toBeInTheDocument()
      expect(db.rpc.list_transactions).not.toHaveBeenCalled()
      await userEvent.click(within(gone).getByRole('button', { name: 'Show all transactions' }))
      await waitFor(() => {
        expect(router.state.location.search).toBe('?period=all')
      })
      expect(await screen.findByText('Rent November')).toBeVisible()
      unmount()
    }
  })

  it('a transfer deleted meanwhile: the read answers transfer_not_found and the page says so', async () => {
    const db = filterDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    // The record is still read, then the transfer goes before its transactions are listed.
    const original = db.rpc.list_transactions.getMockImplementation()!
    db.rpc.list_transactions.mockImplementation((args) => {
      db.tables.transfer_overview = db.tables.transfer_overview.filter((row) => row.id !== PILLAR)
      return original(args)
    })
    renderRoutes(routes, `/transactions?period=all&transfer=${PILLAR}`)
    expect(await screen.findByTestId('transfer-gone')).toHaveTextContent(
      'It was deleted meanwhile, or the address names another budget’s transfer.',
    )
  })

  it('the mock answers as the database: another budget’s transfer is transfer_not_found', () => {
    const db = filterDb()
    expect(() =>
      db.rpc.list_transactions({ p_budget_id: BUDGET_ID, p_transfer_id: OTHER }),
    ).toThrow('transfer_not_found')
    const rows = db.rpc.list_transactions({ p_budget_id: BUDGET_ID, p_transfer_id: PILLAR }) as {
      id: string
    }[]
    expect(rows.map((row) => row.id)).toEqual(['tx-pillar-nov', 'tx-pillar-oct'])
  })

  it('[R-TRANSACTION-480] each planned transfer counted as spending links to its transactions; one that is not, not', async () => {
    const db = filterDb()
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/transfers?view=planned')
    const link = await screen.findByRole('link', { name: 'Transactions of Pillar 3a' })
    expect(link).toHaveAttribute('href', `/transactions?period=all&transfer=${PILLAR}`)
    expect(screen.queryByRole('link', { name: 'Transactions of Joint' })).not.toBeInTheDocument()
  })

  it('later pages of a transfer’s transactions keep the transfer filter', async () => {
    const db = filterDb()
    for (let index = 0; index < 60; index += 1) {
      const day = String(1 + (index % 20)).padStart(2, '0')
      db.tables.transaction_list.push(
        transactionRow({
          id: `tx-p-${index}`,
          date: `2026-11-${day}`,
          amount: 100 + index,
          description: `Pillar part ${index}`,
          transfer_id: PILLAR,
          transfer_name: 'Pillar 3a',
          created_at: `2026-11-${day}T10:00:${String(index).padStart(2, '0')}+00:00`,
        }),
      )
    }
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, `/transactions?period=all&transfer=${PILLAR}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Show older transactions' }))
    await waitFor(() => {
      expect(db.rpc.list_transactions).toHaveBeenCalledWith(
        expect.objectContaining({
          p_transfer_id: PILLAR,
          p_before_date: expect.any(String) as string,
        }),
      )
    })
    for (const [args] of db.rpc.list_transactions.mock.calls) {
      expect(args).toMatchObject({ p_transfer_id: PILLAR })
    }
    expect(await screen.findByText('Pillar October')).toBeVisible()
    expect(screen.queryByText('Rent November')).not.toBeInTheDocument()
  })
})

describe('a transfer’s transactions that list nothing say what is true [R-TRANSACTION-480]', () => {
  it('a transfer not counted as spending records no transactions, and says so', async () => {
    mock.current = createSupabaseMock(fakeSession(), filterDb())
    renderRoutes(routes, `/transactions?period=all&transfer=${JOINT}`)
    expect(await screen.findByText('“Joint” records no transactions')).toBeVisible()
    expect(
      screen.getByText(/This transfer is not counted as spending \(it is linked to no category\)/),
    ).toBeVisible()
    expect(screen.queryByText('No transactions match these filters')).not.toBeInTheDocument()
  })

  it('a transfer counted as spending with none in the period says none was recorded in it', async () => {
    mock.current = createSupabaseMock(fakeSession(), filterDb())
    renderRoutes(routes, `/transactions?transfer=${GIFT}`)
    expect(await screen.findByText('No transactions of “Gift” here')).toBeVisible()
    expect(screen.getByText(/None was recorded for it in this period/)).toBeVisible()
  })
})
