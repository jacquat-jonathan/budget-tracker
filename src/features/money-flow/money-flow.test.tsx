import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import {
  layoutMoneyFlow,
  NOT_ASSIGNED,
  readMoneyFlow,
} from '@/features/money-flow/money-flow-model'
import { formatMoney } from '@/lib/money'
import { householdDb } from '@/test/budget-fixtures'
import { moneyFlowRow, type MoneyFlowRow } from '@/test/mock-transfers'
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
  await warmPages('moneyFlow')
}, 10_000)

const money = (rappen: number) => formatMoney(rappen).replace(/\s/g, ' ')

/** Alex's and Sam's salaries, three accounts, a standing order, a yearly pillar, a joint share. */
function householdFlow(periodId = 'period-2'): MoneyFlowRow[] {
  const row = (fields: Partial<MoneyFlowRow>) => moneyFlowRow({ period_id: periodId, ...fields })
  return [
    row({
      row_kind: 'income',
      id: 'inc-a',
      source_id: 'inc-a',
      name: 'Alex salary',
      amount: 650_000,
      target_id: 'acc-a',
    }),
    row({
      row_kind: 'income',
      id: 'inc-s',
      source_id: 'inc-s',
      name: 'Sam salary',
      amount: 480_000,
      target_id: 'acc-s',
    }),
    row({
      row_kind: 'account',
      id: 'acc-a',
      name: 'Alex account',
      account_kind: 'current',
      inflow: 650_000,
      outflow: 258_800,
      stays: 391_200,
      is_negative: false,
    }),
    row({
      row_kind: 'account',
      id: 'acc-s',
      name: 'Sam account',
      account_kind: 'current',
      inflow: 480_000,
      outflow: 520_000,
      stays: -40_000,
      is_negative: true,
    }),
    row({
      row_kind: 'account',
      id: 'acc-j',
      name: 'Joint account',
      account_kind: 'current',
      inflow: 670_000,
      outflow: 0,
      stays: 670_000,
      is_negative: false,
    }),
    row({
      row_kind: 'account',
      id: 'acc-p',
      name: 'Third pillar',
      account_kind: 'third_pillar',
      inflow: 58_800,
      outflow: 0,
      stays: 58_800,
      is_negative: false,
    }),
    row({
      row_kind: 'account',
      id: 'acc-c',
      name: 'Cash',
      account_kind: 'cash',
      inflow: 0,
      outflow: 0,
      stays: 0,
      is_negative: false,
    }),
    row({
      row_kind: 'transfer',
      id: 'tr-j1',
      name: 'Joint share Alex',
      source_id: 'acc-a',
      target_id: 'acc-j',
      amount: 150_000,
      planned_amount: 150_000,
      is_automatic: true,
    }),
    row({
      row_kind: 'transfer',
      id: 'tr-j2',
      name: 'Joint share Sam',
      source_id: 'acc-s',
      target_id: 'acc-j',
      amount: 520_000,
      planned_amount: 520_000,
      is_automatic: false,
    }),
    row({
      row_kind: 'transfer',
      id: 'tr-p',
      name: 'Third pillar',
      source_id: 'acc-a',
      target_id: 'acc-p',
      amount: 58_800,
      planned_amount: 705_600,
      cadence: 'yearly',
      is_automatic: false,
    }),
    row({
      row_kind: 'transfer',
      id: 'tr-t',
      name: 'Taxes',
      source_id: 'acc-a',
      target_id: 'acc-j',
      amount: 50_000,
      planned_amount: 150_000,
      cadence: 'quarterly',
      is_automatic: true,
    }),
    row({ row_kind: 'total', amount: 1_130_000, inflow: 1_130_000, outflow: 778_800 }),
  ]
}

async function openPage(rows = householdFlow()) {
  const db = householdDb()
  db.moneyFlow = rows
  mock.current = createSupabaseMock(fakeSession(), db)
  renderRoutes(routes, '/money-flow')
  await screen.findByTestId('money-flow-table')
  return db
}

describe('the money flow page [R-ACCOUNT-006] [R-ACCOUNT-235]', () => {
  it('shows the database’s figures in the diagram and, every one of them, in the tables [R-ACCOUNT-304]', async () => {
    const db = await openPage()
    expect(db.rpc.get_money_flow).toHaveBeenCalledWith({
      p_budget_id: expect.any(String) as string,
      p_period_id: 'period-2',
    })
    const diagram = screen.getByTestId('money-flow-diagram')
    expect(within(diagram).getByRole('img')).toHaveAccessibleName(/incomes of CHF/)
    const table = screen.getByTestId('money-flow-table')
    const incomes = within(table).getByRole('table', { name: 'Incomes' })
    expect(within(incomes).getByRole('row', { name: /Alex salary/ })).toHaveTextContent(
      `Alex account${money(650_000)}`,
    )
    expect(within(table).getByTestId('total-incomes')).toHaveTextContent(money(1_130_000))
    // A yearly transfer: its monthly share, and the real amount and cadence beside it.
    const transfers = within(table).getByRole('table', { name: 'Transfers' })
    expect(within(transfers).getByRole('row', { name: /^Third pillar/ })).toHaveTextContent(
      `${money(58_800)}${money(705_600)} once a year`,
    )
    expect(within(table).getByTestId('total-transfers')).toHaveTextContent(money(778_800))
    // What stays, flagged when more is planned out than in; never a balance.
    const sam = within(table)
      .getAllByTestId('flow-account-row')
      .find((element) => element.textContent.startsWith('Sam account'))!
    expect(sam).toHaveTextContent(`${money(-40_000)}(more planned out than in)`)
    expect(table).toHaveTextContent('not its balance')
  })

  it('reads another period when one is chosen', async () => {
    const db = await openPage([...householdFlow(), ...householdFlow('period-1')])
    await userEvent.click(screen.getByLabelText('Period'))
    await userEvent.click(await screen.findByRole('option', { name: /25\.09\.2026/ }))
    await waitFor(() => {
      expect(db.rpc.get_money_flow).toHaveBeenLastCalledWith({
        p_budget_id: expect.any(String) as string,
        p_period_id: 'period-1',
      })
    })
  })

  it('a household without accounts sees its income and what to set up next [D-501]', async () => {
    await openPage([
      moneyFlowRow({
        row_kind: 'income',
        id: 'inc-a',
        source_id: 'inc-a',
        name: 'Salary',
        amount: 650_000,
        target_id: null,
      }),
      moneyFlowRow({ row_kind: 'not_assigned', inflow: 650_000, stays: 650_000, outflow: 0 }),
      moneyFlowRow({ row_kind: 'total', amount: 650_000, inflow: 650_000, outflow: 0 }),
    ])
    const next = screen.getByTestId('money-flow-next')
    expect(within(next).getByRole('link', { name: 'Add accounts' })).toHaveAttribute(
      'href',
      '/accounts',
    )
    expect(within(next).queryByRole('link', { name: 'Plan a transfer' })).not.toBeInTheDocument()
    expect(screen.getByTestId('money-flow-diagram')).toHaveTextContent('Not assigned')
  })
})

describe('the diagram’s layout [R-ACCOUNT-235]', () => {
  const flow = readMoneyFlow(householdFlow())

  it('puts incomes left, accounts by their chain of transfers, where money stays on the right', () => {
    const layout = layoutMoneyFlow(flow, { width: 390, barHeight: 220 })
    const column = (id: string) => layout.nodes.find((node) => node.id === id)?.column
    expect(column('income:inc-a')).toBe(0)
    expect(column('acc-a')).toBe(1)
    expect(column('acc-j')).toBe(layout.columns - 1)
    expect(column('acc-p')).toBe(layout.columns - 1)
    // An account with no planned flow is listed, not drawn.
    expect(layout.idle).toEqual(['Cash'])
    // One scale: bands are as wide as their amounts.
    const band = (id: string) => layout.links.find((link) => link.id === id)!.width
    expect(band('tr-j2') / band('tr-j1')).toBeCloseTo(520_000 / 150_000, 5)
    // Nothing drawn outside the width it has.
    for (const node of layout.nodes) expect(node.x + layout.nodeWidth).toBeLessThanOrEqual(390)
  })

  it('draws money sent back to an earlier account as a loop, and "not assigned" as its node', () => {
    const rows = householdFlow().filter((row) => row.row_kind !== 'total')
    rows.push(
      moneyFlowRow({
        row_kind: 'transfer',
        id: 'tr-back',
        name: 'Back',
        source_id: 'acc-j',
        target_id: 'acc-a',
        amount: 10_000,
      }),
    )
    const layout = layoutMoneyFlow(readMoneyFlow(rows), { width: 1000, barHeight: 300 })
    expect(layout.links.find((link) => link.id === 'tr-back')?.back).toBe(true)

    const lonely = readMoneyFlow([
      moneyFlowRow({ row_kind: 'income', id: 'i', name: 'Salary', amount: 1000, target_id: null }),
      moneyFlowRow({ row_kind: 'not_assigned', inflow: 1000 }),
    ])
    const small = layoutMoneyFlow(lonely, { width: 320, barHeight: 200 })
    expect(small.nodes.map((node) => node.id)).toEqual(['income:i', NOT_ASSIGNED])
  })
})
