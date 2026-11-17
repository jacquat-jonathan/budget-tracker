import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import {
  accountSlots,
  groupSlots,
  layoutFlow,
  MAX_DRAWN,
  NOT_ASSIGNED,
  readMoneyFlow,
  REST,
  SET_ASIDE,
  SPENDABLE,
  type FlowLayout,
} from '@/features/money-flow/money-flow-model'
import { formatMoney } from '@/lib/money'
import { householdDb } from '@/test/budget-fixtures'
import { shortNames } from '@/features/money-flow/money-flow-words'
import { cashWalletPlan, chainPlan, workedExamplePlan } from '@/test/money-flow-fixtures'
import { rpcError } from '@/test/mock-db'
import { moneyFlowRows, transferRow, type MoneyFlowPlan } from '@/test/mock-transfers'
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
const text = (element: Element | null | undefined) =>
  (element?.textContent ?? '').replace(/\s/g, ' ')

async function openPage(
  plans: MoneyFlowPlan[] = [workedExamplePlan()],
  path = '/money-flow',
  shown = 'money-flow-table',
) {
  const db = householdDb()
  db.moneyFlowPlans = plans
  mock.current = createSupabaseMock(fakeSession(), db)
  renderRoutes(routes, path)
  await screen.findByTestId(shown)
  return db
}

const label = (id: string) =>
  text(
    screen
      .getAllByTestId('flow-label')
      .find((element) => element.getAttribute('data-node') === id)
      ?.querySelector('[data-testid="flow-node-value"]'),
  )

describe('the mock database’s money flow answers as the database does [R-ACCOUNT-422] [D-524]', () => {
  it('feeds the worked example through get_money_flow and returns its figures', async () => {
    const db = householdDb()
    db.moneyFlowPlans = [workedExamplePlan()]
    const rows = (await db.rpc.get_money_flow({
      p_budget_id: db.tables.my_budgets[0]?.id,
      p_period_id: 'period-2',
    })) as Record<string, unknown>[]
    // Rows in the database's order: incomes, accounts, transfers by name, spending by display
    // order, the total last; every column present, null where the row does not use it.
    expect(rows.map((row) => `${String(row.row_kind)}:${String(row.name)}`)).toEqual([
      'income:Ann’s salary',
      'income:Ben’s salary',
      'account:Main',
      'account:Pillar 3a',
      'account:Savings',
      'transfer:Pillar 3a',
      'transfer:Savings',
      'spending:Home',
      'spending:Food',
      'spending:Transport',
      'spending:Leisure',
      'spending:Saving and pension',
      'total:null',
    ])
    for (const row of rows) expect(Object.keys(row)).toHaveLength(37)
    const of = (kind: string, name: string | null) =>
      rows.find((row) => row.row_kind === kind && row.name === name)!
    expect(of('account', 'Main')).toMatchObject({
      inflow: 1_000_000,
      outflow: 158_800,
      stays: 841_200,
      spendable: true,
      is_negative: false,
      expected: null,
    })
    expect(of('account', 'Pillar 3a')).toMatchObject({
      inflow: 58_800,
      stays: 58_800,
      spendable: false,
    })
    expect(of('account', 'Savings')).toMatchObject({
      inflow: 100_000,
      stays: 100_000,
      spendable: false,
    })
    expect(of('transfer', 'Pillar 3a')).toMatchObject({
      source_id: 'acc-main',
      target_id: 'acc-pillar',
      amount: 58_800,
      planned_amount: 705_600,
      cadence: 'yearly',
    })
    expect(of('transfer', 'Savings')).toMatchObject({
      amount: 100_000,
      planned_amount: 100_000,
      cadence: null,
    })
    expect(of('spending', 'Home')).toMatchObject({
      expected: 215_000,
      transfer_share: 0,
      amount: 215_000,
      spent: 200_000,
    })
    expect(of('spending', 'Food')).toMatchObject({
      expected: 110_000,
      amount: 110_000,
      spent: 72_550,
    })
    expect(of('spending', 'Transport')).toMatchObject({ amount: 30_000, spent: 12_000 })
    expect(of('spending', 'Leisure')).toMatchObject({
      amount: 35_000,
      yearly_amount: 240_000,
      spent: 6_000,
    })
    expect(of('spending', 'Saving and pension')).toMatchObject({
      expected: 158_800,
      transfer_share: 158_800,
      amount: 0,
      yearly_amount: 705_600,
      spent: 0,
      transfer_spent: 100_000,
    })
    expect(of('total', null)).toMatchObject({
      amount: 1_000_000,
      inflow: 1_000_000,
      outflow: 158_800,
      set_aside: 158_800,
      spendable_amount: 841_200,
      planned_spending: 390_000,
      not_planned: 451_200,
      actual_spending: 290_550,
      left_amount: 550_650,
      spending_rows_omitted: 0,
      is_negative: false,
      // R-ACCOUNT-520: the contract's reconciling line of this example.
      summary_income_total: 1_000_000,
      extra_income_left_out: 0,
      summary_planned_total: 548_800,
      set_aside_transfers_planned: 158_800,
      summary_spent_total: 390_550,
      set_aside_transfers_spent: 100_000,
    })
    expect(of('spending', 'Home').summary_spent_total).toBeNull()
  })

  it('caps a group’s transfer share at what it expects, and sorts names as the database’s collation', () => {
    const plan = workedExamplePlan()
    plan.categories[4]!.expected = 100_000
    plan.accounts.push(
      { id: 'acc-b', name: 'bank', kind: 'cash', createdAt: '2026-10-03T08:00:00+00:00' },
      { id: 'acc-B', name: 'Bank', kind: 'cash', createdAt: '2026-10-03T08:01:00+00:00' },
    )
    const rows = moneyFlowRows(plan)
    expect(rows.find((row) => row.name === 'Saving and pension')).toMatchObject({
      expected: 100_000,
      transfer_share: 100_000,
      amount: 0,
    })
    // en_US.UTF-8, as a real stack sorts: lower case before upper case, not byte order.
    expect(rows.filter((row) => row.row_kind === 'account').map((row) => row.name)).toEqual([
      'bank',
      'Bank',
      'Main',
      'Pillar 3a',
      'Savings',
    ])
  })

  it('refuses another budget and another budget’s period, and leaves out the last spending rows past 1000', async () => {
    const db = householdDb()
    db.moneyFlowPlans = [workedExamplePlan()]
    await expect(
      Promise.resolve().then(() =>
        db.rpc.get_money_flow({ p_budget_id: 'other', p_period_id: 'period-2' }),
      ),
    ).rejects.toThrow('budget_not_found')
    await expect(
      Promise.resolve().then(() =>
        db.rpc.get_money_flow({ p_budget_id: db.tables.my_budgets[0]?.id, p_period_id: 'nope' }),
      ),
    ).rejects.toThrow('period_not_found')
    const rows = moneyFlowRows(workedExamplePlan(), 10)
    // 2 incomes, 3 accounts, 2 transfers and the total leave room for 2 spending rows.
    expect(rows.filter((row) => row.row_kind === 'spending').map((row) => row.name)).toEqual([
      'Home',
      'Food',
    ])
    expect(rows.at(-1)).toMatchObject({ spending_rows_omitted: 3, planned_spending: 390_000 })
  })
})

describe('the money flow page [R-ACCOUNT-006] [R-ACCOUNT-235] [R-ACCOUNT-422] [R-ACCOUNT-447]', () => {
  it('shows the database’s total row as four tiles, planned by default', async () => {
    const db = await openPage()
    expect(db.rpc.get_money_flow).toHaveBeenCalledWith({
      p_budget_id: expect.any(String) as string,
      p_period_id: 'period-2',
    })
    const tiles = screen.getByTestId('money-flow-tiles')
    expect(text(within(tiles).getByTestId('tile-incomes'))).toContain(money(1_000_000))
    expect(text(within(tiles).getByTestId('tile-set-aside'))).toContain(money(158_800))
    expect(text(within(tiles).getByTestId('tile-spending'))).toContain(
      `Planned spending${money(390_000)}Out of ${money(841_200)} spendable`,
    )
    expect(text(within(tiles).getByTestId('tile-rest'))).toContain(`Not planned${money(451_200)}`)
    expect(screen.getByRole('heading', { name: /^Planned money flow of the period/ })).toBeVisible()
    expect(within(screen.getByTestId('money-flow-diagram')).getByRole('img')).toHaveAccessibleName(
      /^Planned money flow of the period .*: incomes .*; set aside .*; spendable .*not planned/,
    )
  })

  it('labels every bar with its figure and its word, as the read gives it', async () => {
    await openPage()
    expect(label('income:inc-ann')).toBe(money(600_000))
    expect(label('acc-main')).toBe(`stays ${money(841_200)}, spendable`)
    expect(label('acc-savings')).toBe(`stays ${money(100_000)}, set aside`)
    expect(label(SPENDABLE)).toBe(`spendable ${money(841_200)}`)
    expect(label(SET_ASIDE)).toBe(`set aside ${money(158_800)}`)
    expect(label('group:grp-home')).toBe(`planned ${money(215_000)}`)
    expect(label('group:grp-leisure')).toBe(`planned ${money(35_000)} · ${money(240_000)} a year`)
    expect(label(REST)).toBe(`not planned ${money(451_200)}`)
    // A group whose plan is carried by transfers is not drawn as spending: it is set aside.
    expect(label('group:grp-saving')).toBe('')
    const key = screen.getByTestId('money-flow-key')
    expect(key).toHaveTextContent('Striped: an account whose remainder is set aside')
    expect(key).toHaveTextContent('Outline: spendable, not planned')
  })

  it('every figure is in the tables, with the database’s totals', async () => {
    await openPage()
    const table = screen.getByTestId('money-flow-table')
    const row = (testId: string, name: string) =>
      text(
        within(table)
          .getAllByTestId(testId)
          .find((element) => text(element).includes(name)),
      )
    expect(row('flow-income-row', 'Ann')).toContain(`Arrives on MainAmount${money(600_000)}`)
    expect(text(within(table).getByTestId('total-incomes'))).toBe(money(1_000_000))
    expect(row('flow-transfer-row', 'Pillar 3a')).toContain(
      `Per month${money(58_800)}${money(705_600)} once a year`,
    )
    expect(text(within(table).getByTestId('total-transfers'))).toBe(money(158_800))
    expect(row('flow-account-row', 'Main')).toContain(
      `In${money(1_000_000)}Out${money(158_800)}Stays${money(841_200)}spendable`,
    )
    expect(row('flow-account-row', 'Savings')).toContain(`${money(100_000)}set aside`)
    expect(text(within(table).getByTestId('total-spendable'))).toBe(money(841_200))
    expect(text(within(table).getByTestId('total-set-aside'))).toBe(money(158_800))
    expect(row('flow-spending-row', 'Saving and pension')).toContain(
      `Planned${money(0)}${money(705_600)} a year${money(158_800)} set aside by transfersSpent${money(0)}${money(100_000)} set aside by transfers`,
    )
    expect(text(within(table).getByTestId('total-planned'))).toBe(money(390_000))
    expect(text(within(table).getByTestId('total-spent'))).toBe(money(290_550))
    expect(text(within(table).getByTestId('total-not-planned'))).toBe(
      `${money(451_200)}not planned`,
    )
    expect(text(within(table).getByTestId('total-left'))).toBe(`${money(550_650)}left`)
    expect(table).toHaveTextContent('not its balance')
  })

  it('[R-TRANSACTION-480] links a transfer counted as spending to its transactions in the period [D-525]', async () => {
    const db = householdDb()
    db.moneyFlowPlans = [workedExamplePlan()]
    db.tables.transfer_overview = [
      transferRow({ id: 'tr-pillar', name: 'Pillar 3a', category_id: 'grp-saving' }),
      transferRow({ id: 'tr-savings', name: 'Savings', category_id: null }),
    ]
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/money-flow')
    expect(await screen.findByRole('link', { name: 'Transactions of Pillar 3a' })).toHaveAttribute(
      'href',
      '/transactions?period=period-2&transfer=tr-pillar',
    )
    // Savings records no transactions in this example's read: no link that leads to nothing.
    expect(screen.queryByRole('link', { name: 'Transactions of Savings' })).not.toBeInTheDocument()
  })

  it('on Actual, draws what was spent, keeps the basis in the address and says the period is still running', async () => {
    const db = await openPage()
    await userEvent.click(screen.getByTestId('basis-actual'))
    await screen.findByRole('heading', { name: /^What actually happened in the period/ })
    expect(screen.getByTestId('basis-actual')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('basis-planned')).toHaveAttribute('href', '/money-flow')
    expect(screen.getByTestId('money-flow-running')).toHaveTextContent('still running')
    expect(label('group:grp-home')).toBe(`spent ${money(200_000)} of ${money(215_000)}`)
    expect(label(REST)).toBe(`left ${money(550_650)}`)
    expect(text(screen.getByTestId('tile-spending'))).toContain(`Spent${money(290_550)}`)
    expect(text(screen.getByTestId('tile-rest'))).toContain(`Left${money(550_650)}`)
    expect(within(screen.getByTestId('money-flow-diagram')).getByRole('img')).toHaveAccessibleName(
      /as it happened/,
    )
    // The basis changes the drawing only: the same read.
    expect(db.rpc.get_money_flow).toHaveBeenCalledTimes(1)
  })

  it('opens on Actual from the address; a past period says nothing about running', async () => {
    await openPage([workedExamplePlan('period-1')], '/money-flow?period=period-1&basis=actual')
    await screen.findByRole('heading', { name: /^What actually happened/ })
    expect(screen.queryByTestId('money-flow-running')).not.toBeInTheDocument()
  })

  it('says a shortfall in words in the tiles, the diagram and the table', async () => {
    const plan = workedExamplePlan()
    plan.categories[0]!.expected = 900_000
    plan.categories[0]!.spent = 950_000
    await openPage([plan])
    // planned spending 10 750.00 against 8 412.00 spendable: not planned −2 338.00
    expect(text(screen.getByTestId('tile-rest'))).toContain(
      `Not planned${money(-233_800)}More spending is planned than is spendable.`,
    )
    expect(label(SPENDABLE)).toBe(
      `spendable ${money(841_200)}More is planned than is spendable, which leaves ${money(-233_800)} not planned.`,
    )
    expect(
      screen.queryAllByTestId('flow-label').some((el) => el.getAttribute('data-node') === REST),
    ).toBe(false)
    expect(text(screen.getByTestId('total-not-planned'))).toBe(
      `${money(-233_800)}More is planned than is spendable.`,
    )
    expect(screen.getByTestId('money-flow-key')).toHaveTextContent(
      'Red hatching: the part of a bar past its own figure',
    )
    await userEvent.click(screen.getByTestId('basis-actual'))
    await waitFor(() => {
      expect(text(screen.getByTestId('tile-rest'))).toContain('More was spent than was spendable.')
    })
    // spent 10 405.50 of 8 412.00 spendable: left −1 993.50, said as what was spent.
    expect(label(SPENDABLE)).toBe(
      `spendable ${money(841_200)}More was spent than was spendable, which leaves ${money(-199_350)}.`,
    )
    expect(label('group:grp-home')).toBe(
      `spent ${money(950_000)} of ${money(900_000)}More was spent than planned.`,
    )
  })

  it('says how many spending rows the read left out, near the spending table', async () => {
    const plan = workedExamplePlan()
    const db = householdDb()
    db.moneyFlowPlans = [plan]
    db.rpc.get_money_flow.mockImplementation(() => moneyFlowRows(plan, 10))
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/money-flow')
    expect(await screen.findByTestId('spending-omitted')).toHaveTextContent(
      '3 more category groups are not listed (the read stops at 1000 rows): the totals include them.',
    )
  })

  it('[R-APP-441] after “Try again” on a failed read, the focus is on the page’s heading, not lost', async () => {
    const db = householdDb()
    db.moneyFlowPlans = [workedExamplePlan()]
    const read = db.rpc.get_money_flow.getMockImplementation()!
    db.rpc.get_money_flow.mockImplementation(() => rpcError('period_not_found'))
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/money-flow')
    const retry = await screen.findByRole('button', { name: 'Try again' }, { timeout: 4000 })
    db.rpc.get_money_flow.mockImplementation(read)
    await userEvent.click(retry)
    expect(screen.getByRole('heading', { level: 1, name: 'Money flow' })).toHaveFocus()
    await screen.findByTestId('money-flow-table')
    expect(screen.getByRole('heading', { level: 1, name: 'Money flow' })).toHaveFocus()
  })

  it('reads another period when one is chosen', async () => {
    const db = await openPage([workedExamplePlan(), workedExamplePlan('period-1')])
    await userEvent.click(screen.getByLabelText('Period'))
    await userEvent.click(await screen.findByRole('option', { name: /25\.09\.2026/ }))
    await waitFor(() => {
      expect(db.rpc.get_money_flow).toHaveBeenLastCalledWith({
        p_budget_id: expect.any(String) as string,
        p_period_id: 'period-1',
      })
    })
  })

  it('a household without accounts sees its income, what to set up next, and “not assigned” [D-501]', async () => {
    await openPage([
      {
        periodId: 'period-2',
        incomes: [{ id: 'inc-a', name: 'Salary', amount: 650_000, accountId: null }],
        accounts: [],
        transfers: [],
        categories: [],
      },
    ])
    const next = screen.getByTestId('money-flow-next')
    expect(within(next).getByRole('link', { name: 'Add accounts' })).toHaveAttribute(
      'href',
      '/accounts',
    )
    expect(within(next).queryByRole('link', { name: 'Plan a transfer' })).not.toBeInTheDocument()
    expect(label(NOT_ASSIGNED)).toBe(`stays ${money(650_000)}, spendable`)
    expect(label(REST)).toBe(`not planned ${money(650_000)}`)
    expect(screen.getByTestId('money-flow-spending')).toHaveTextContent(
      'Nothing is planned or spent in any category this period.',
    )
  })

  it('without any income, draws nothing and keeps the spending table', async () => {
    const plan = workedExamplePlan()
    plan.incomes = []
    await openPage([plan])
    expect(screen.queryByTestId('money-flow-diagram')).not.toBeInTheDocument()
    expect(screen.getByText(/No income counts in this period/)).toBeVisible()
    expect(text(screen.getByTestId('tile-rest'))).toContain(
      'More spending is planned than is spendable.',
    )
  })

  it('an empty period says so', async () => {
    await openPage(
      [{ periodId: 'period-2', incomes: [], accounts: [], transfers: [], categories: [] }],
      '/money-flow',
      'basis-planned',
    )
    expect(await screen.findByText('Nothing in this period yet')).toBeVisible()
    expect(screen.queryByTestId('money-flow-table')).not.toBeInTheDocument()
  })
})

describe('the diagram’s layout [R-ACCOUNT-235] [D-545]', () => {
  const flow = readMoneyFlow(moneyFlowRows(workedExamplePlan()))
  const find = (layout: FlowLayout, id: string) => layout.nodes.find((node) => node.id === id)!
  const band = (layout: FlowLayout, id: string) => layout.links.find((link) => link.id === id)!

  it('runs incomes, accounts by their chain of transfers, the pool, then the spending', () => {
    const layout = layoutFlow(flow, { basis: 'planned', cross: 360 })
    expect(find(layout, 'income:inc-ann').tier).toBe(0)
    expect(find(layout, 'acc-main').tier).toBe(1)
    expect(find(layout, 'acc-savings').tier).toBe(2)
    expect(find(layout, SPENDABLE).tier).toBe(3)
    expect(find(layout, SET_ASIDE).tier).toBe(3)
    expect(find(layout, 'group:grp-home').tier).toBe(4)
    expect(find(layout, REST).tier).toBe(4)
    // Main's spendable remainder skips the tier of the set-aside accounts in a lane of its own.
    expect(layout.lanes).toEqual([
      expect.objectContaining({ link: 'stays:acc-main', tier: 2 }) as unknown,
    ])
    expect(band(layout, 'stays:acc-main').points.map((point) => point.tier)).toEqual([1, 2, 3])
    // A group whose plan is carried by transfers is not drawn; the rest of the spendable is.
    expect(layout.nodes.some((node) => node.id === 'group:grp-saving')).toBe(false)
    expect(band(layout, 'rest').value).toBe(451_200)
  })

  it('draws every bar and band at its amount times one scale', () => {
    for (const cross of [300, 900]) {
      const layout = layoutFlow(flow, { basis: 'planned', cross })
      for (const node of layout.nodes) expect(node.size).toBeCloseTo(node.length * layout.scale, 9)
      for (const link of layout.links) expect(link.width).toBeCloseTo(link.value * layout.scale, 9)
      expect(find(layout, 'income:inc-ann').size / find(layout, 'income:inc-ben').size).toBeCloseTo(
        1.5,
        9,
      )
      expect(band(layout, 'spend:grp-home').width).toBeCloseTo(215_000 * layout.scale, 9)
      // The fullest tier fills the room it has, gaps included; nothing goes past it.
      expect(layout.extent).toBeLessThanOrEqual(cross + 0.001)
    }
    const actual = layoutFlow(flow, { basis: 'actual', cross: 300 })
    expect(band(actual, 'spend:grp-home').value).toBe(200_000)
    expect(band(actual, 'rest').value).toBe(550_650)
  })

  it('stacks the bands where they leave and enter a bar, inside it', () => {
    const layout = layoutFlow(flow, { basis: 'planned', cross: 400 })
    const main = find(layout, 'acc-main')
    const leaving = layout.links.filter((link) => link.source === 'acc-main')
    const starts = leaving.map((link) => link.points[0]!.at - link.width / 2).sort((a, b) => a - b)
    expect(starts[0]).toBeCloseTo(main.pos, 6)
    const end = Math.max(...leaving.map((link) => link.points[0]!.at + link.width / 2))
    expect(end).toBeCloseTo(main.pos + main.size, 6)
  })

  it('a group with its own spending and a transfer share is drawn at its own planned amount', () => {
    const plan = workedExamplePlan()
    plan.categories[4]!.expected = 188_800
    const layout = layoutFlow(readMoneyFlow(moneyFlowRows(plan)), { basis: 'planned', cross: 300 })
    expect(find(layout, 'group:grp-saving').length).toBe(30_000)
  })

  it('a shortfall extends the spendable bar, hatched, by what is short', () => {
    const plan = workedExamplePlan()
    plan.categories[0]!.expected = 900_000
    const layout = layoutFlow(readMoneyFlow(moneyFlowRows(plan)), { basis: 'planned', cross: 300 })
    const pool = find(layout, SPENDABLE)
    expect(pool.solid).toBe(841_200)
    expect(pool.length).toBe(841_200 + 233_800)
    expect(pool.warning).toBe(true)
    expect(layout.nodes.some((node) => node.id === REST)).toBe(false)
  })

  it('[R-ACCOUNT-448] colours accounts by creation and groups by display order, never by name or size', () => {
    const before = readMoneyFlow(moneyFlowRows(workedExamplePlan()))
    const renamed = workedExamplePlan()
    renamed.accounts[0]!.name = 'Zulu'
    renamed.categories[0]!.name = 'Zzz'
    const after = readMoneyFlow(moneyFlowRows(renamed))
    expect(accountSlots(after.accounts)).toEqual(accountSlots(before.accounts))
    expect(accountSlots(before.accounts).get('acc-main')).toBe(0)
    expect(accountSlots(before.accounts).get('acc-pillar')).toBe(2)
    expect(groupSlots(after.spending)).toEqual(groupSlots(before.spending))
    expect(groupSlots(before.spending).get('grp-home')).toBe(0)
    expect(groupSlots(before.spending).get('grp-saving')).toBe(4)
  })

  it('draws the eight largest accounts and destinations and counts the others', () => {
    const plan = workedExamplePlan()
    for (let index = 0; index < 12; index += 1) {
      const id = `acc-x${String(index).padStart(2, '0')}`
      plan.accounts.push({
        id,
        name: `Extra ${index}`,
        kind: 'current',
        createdAt: `2026-10-02T08:${String(index).padStart(2, '0')}:00+00:00`,
      })
      plan.transfers.push({
        id: `tr-${id}`,
        name: `To ${index}`,
        from: 'acc-main',
        to: id,
        amount: 1_000 * (index + 1),
      })
      plan.categories.push({
        id: `grp-x${index}`,
        name: `Group ${index}`,
        displayOrder: 10 + index,
        expected: 500 * (index + 1),
      })
    }
    const layout = layoutFlow(readMoneyFlow(moneyFlowRows(plan)), { basis: 'planned', cross: 300 })
    expect(layout.nodes.filter((node) => node.kind === 'account')).toHaveLength(MAX_DRAWN)
    expect(layout.hidden.accounts).toBe(15 - MAX_DRAWN)
    expect(layout.nodes.filter((node) => node.kind === 'spending')).toHaveLength(MAX_DRAWN)
    // 4 of the example's groups plan spending, and 12 more.
    expect(layout.hidden.destinations).toBe(16 - MAX_DRAWN)
    // The largest are drawn: Main, then by what goes through them.
    expect(layout.nodes.some((node) => node.id === 'acc-main')).toBe(true)
    expect(layout.nodes.some((node) => node.id === 'acc-x00')).toBe(false)
    // Bands only between drawn nodes.
    const drawn = new Set(layout.nodes.map((node) => node.id))
    for (const link of layout.links) {
      expect(drawn.has(link.source) && drawn.has(link.target)).toBe(true)
    }
  })

  it('draws money sent back to an earlier account as a return loop', () => {
    const plan = workedExamplePlan()
    plan.transfers.push({
      id: 'tr-back',
      name: 'Back',
      from: 'acc-savings',
      to: 'acc-main',
      amount: 10_000,
    })
    const layout = layoutFlow(readMoneyFlow(moneyFlowRows(plan)), { basis: 'planned', cross: 300 })
    expect(band(layout, 'tr-back').back).toBe(true)
    expect(band(layout, 'tr-savings').back).toBe(false)
  })
})

/** The diagram's width, as the page measures it: left to right from 600 px, else downwards. */
function atWidth(width: number) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 0,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: 0,
    toJSON: () => ({}),
  })
}

const drawn = {
  orientation: () =>
    screen
      .getByTestId('money-flow-diagram')
      .querySelector('[data-orientation]')
      ?.getAttribute('data-orientation'),
  node: (id: string) =>
    screen.getAllByTestId('flow-node').find((element) => element.getAttribute('data-node') === id),
  /** The drawn length of a bar: its solid and hatched parts along the cross axis. */
  length: (id: string) => {
    const node = drawn.node(id)
    const axis = drawn.orientation() === 'sideways' ? 'height' : 'width'
    return [...(node?.querySelectorAll('rect[data-part="solid"], rect[data-part="hatch"]') ?? [])]
      .map((rect) => Number(rect.getAttribute(axis)))
      .reduce((a, b) => a + b, 0)
  },
  parts: (id: string) =>
    [...(drawn.node(id)?.querySelectorAll('[data-part]') ?? [])].map((el) =>
      el.getAttribute('data-part'),
    ),
  fill: (id: string) =>
    drawn.node(id)?.querySelector('rect[data-part="solid"]')?.getAttribute('fill'),
  bands: () =>
    screen.queryAllByTestId('flow-band').map((element) => ({
      link: element.getAttribute('data-link'),
      source: element.getAttribute('data-source'),
      target: element.getAttribute('data-target'),
      part: element.getAttribute('data-part'),
      /** The drawn thickness of its coloured path. */
      stroke: Number(element.querySelector('path:last-of-type')?.getAttribute('stroke-width')),
    })),
}

async function openAt(plan: MoneyFlowPlan, width: number, path = '/money-flow') {
  atWidth(width)
  const db = householdDb()
  db.moneyFlowPlans = [plan]
  mock.current = createSupabaseMock(fakeSession(), db)
  const view = renderRoutes(routes, path)
  await screen.findByTestId('money-flow-table')
  return view
}

describe('what the diagram draws, as drawn [R-ACCOUNT-235] [R-ACCOUNT-447] [R-ACCOUNT-448]', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([1100, 360])(
    'at %i px, bars and bands are drawn at their amounts on one scale, bands inside their bars',
    async (width) => {
      await openAt(workedExamplePlan(), width)
      expect(drawn.orientation()).toBe(width === 1100 ? 'sideways' : 'downwards')
      // A band drawn in parts (top to bottom, one per tier it crosses) counts once.
      const bands = drawn
        .bands()
        .filter((band, index, all) => all.findIndex((other) => other.link === band.link) === index)
      const stroke = (id: string) => bands.find((band) => band.link === id)?.stroke ?? 0
      // Each salary's bar is exactly its band, and Main's bar holds what enters and leaves it.
      expect(drawn.length('income:inc-ann')).toBeCloseTo(stroke('income:inc-ann'), 3)
      expect(drawn.length('income:inc-ben')).toBeCloseTo(stroke('income:inc-ben'), 3)
      expect(drawn.length('income:inc-ann') / drawn.length('income:inc-ben')).toBeCloseTo(1.5, 3)
      const into = (id: string) =>
        bands.filter((b) => b.target === id).reduce((acc, b) => acc + b.stroke, 0)
      const outOf = (id: string) =>
        bands.filter((b) => b.source === id).reduce((acc, b) => acc + b.stroke, 0)
      expect(drawn.length('acc-main')).toBeCloseTo(into('acc-main'), 3)
      expect(drawn.length('acc-main')).toBeCloseTo(outOf('acc-main'), 3)
      expect(drawn.length('pool:spendable')).toBeCloseTo(outOf('pool:spendable'), 3)
      expect(stroke('rest') / stroke('income:inc-ann')).toBeCloseTo(451_200 / 600_000, 3)
    },
  )

  it('stripes the set-aside accounts only, and only what stays on everyday accounts is spendable', async () => {
    await openAt(workedExamplePlan(), 360)
    expect(drawn.parts('acc-savings')).toContain('stripes')
    expect(drawn.parts('acc-pillar')).toContain('stripes')
    expect(drawn.parts('acc-main')).not.toContain('stripes')
    const sources = (target: string) =>
      [
        ...new Set(
          drawn
            .bands()
            .filter((band) => band.target === target)
            .map((band) => band.source ?? ''),
        ),
      ].sort()
    expect(sources('pool:spendable')).toEqual(['acc-main'])
    expect(sources('pool:set-aside')).toEqual(['acc-pillar', 'acc-savings'])
  })

  it('[R-ACCOUNT-448] colours accounts from the first hue and groups from the fifth, as drawn', async () => {
    await openAt(workedExamplePlan(), 1100)
    expect(drawn.fill('acc-main')).toBe('var(--flow-1)')
    expect(drawn.fill('acc-savings')).toBe('var(--flow-2)')
    expect(drawn.fill('group:grp-home')).toBe('var(--flow-5)')
    expect(drawn.fill('group:grp-food')).toBe('var(--flow-6)')
  })

  it('counts the accounts and the groups not drawn, each its own number', async () => {
    const plan = workedExamplePlan()
    for (let index = 0; index < 12; index += 1) {
      const id = `acc-x${String(index).padStart(2, '0')}`
      plan.accounts.push({
        id,
        name: `Extra ${index}`,
        kind: 'current',
        createdAt: `2026-10-02T08:${String(index).padStart(2, '0')}:00+00:00`,
      })
      plan.transfers.push({
        id: `tr-${id}`,
        name: `To ${index}`,
        from: 'acc-main',
        to: id,
        amount: 1_000,
      })
      plan.categories.push({
        id: `grp-x${index}`,
        name: `Group ${index}`,
        displayOrder: 10 + index,
        expected: 500,
      })
    }
    await openAt(plan, 1100)
    const notes = screen.getAllByTestId('flow-more').map((note) => text(note))
    expect(notes).toEqual([
      'And 7 more accounts, not drawn: every figure is in the tables.',
      'And 8 more category groups: every figure is in the tables.',
    ])
  })

  it('[R-ACCOUNT-480] draws every account an income arrives on first, then the largest by flow', async () => {
    const plan = workedExamplePlan()
    plan.accounts.push({
      id: 'acc-tiny',
      name: 'Tiny',
      kind: 'current',
      createdAt: '2026-10-03T08:00:00+00:00',
    })
    plan.incomes.push({ id: 'inc-tip', name: 'Tips', amount: 1_000, accountId: 'acc-tiny' })
    for (let index = 0; index < 9; index += 1) {
      const id = `acc-y${index}`
      plan.accounts.push({
        id,
        name: `Big ${index}`,
        kind: 'savings',
        createdAt: `2026-10-04T08:0${index}:00+00:00`,
      })
      plan.transfers.push({
        id: `tr-${id}`,
        name: `To ${index}`,
        from: 'acc-main',
        to: id,
        amount: 20_000,
      })
    }
    await openAt(plan, 1100)
    expect(drawn.node('acc-tiny')).toBeDefined()
    expect(drawn.bands().some((band) => band.link === 'income:inc-tip')).toBe(true)
    expect(
      screen
        .getAllByTestId('flow-node')
        .filter((n) => n.getAttribute('data-node')?.startsWith('acc-')),
    ).toHaveLength(8)
  })
})

describe('labels say the read’s figures with their words [R-ACCOUNT-447]', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('an account with more out than in says what stays, below nothing, in a sentence', async () => {
    await openAt(chainPlan(), 1100)
    expect(label('acc-holiday')).toBe(
      `stays ${money(-70_000)}More is planned to leave this account than comes in.`,
    )
    expect(label('acc-buffer')).toBe(`stays ${money(60_000)}, set aside`)
  })

  it('on Actual, a group says what it spent of its planned spending and what its transfers set aside', async () => {
    const plan = workedExamplePlan()
    plan.categories[4]!.expected = 188_800
    plan.categories[4]!.spent = 125_000
    await openAt(plan, 1100)
    expect(label('group:grp-saving')).toBe(
      `planned ${money(30_000)} · ${money(705_600)} a year · ${money(158_800)} set aside by transfers`,
    )
    await userEvent.click(screen.getByTestId('basis-actual'))
    await screen.findByRole('heading', { name: /^What actually happened/ })
    expect(label('group:grp-saving')).toBe(
      `spent ${money(25_000)} of ${money(30_000)} · ${money(705_600)} a year · ${money(100_000)} set aside by transfers`,
    )
  })

  it('the diagram’s name carries the totals in their places, planned and actual', async () => {
    await openAt(workedExamplePlan(), 1100)
    const image = within(screen.getByTestId('money-flow-diagram')).getByRole('img')
    const esc = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s')
    expect(image).toHaveAccessibleName(
      new RegExp(
        `incomes ${esc(money(1_000_000))}; set aside ${esc(money(158_800))}; spendable ${esc(money(841_200))}, of which ${esc(money(390_000))} is planned for spending and ${esc(money(451_200))} is not planned`,
      ),
    )
    await userEvent.click(screen.getByTestId('basis-actual'))
    await screen.findByRole('heading', { name: /^What actually happened/ })
    expect(within(screen.getByTestId('money-flow-diagram')).getByRole('img')).toHaveAccessibleName(
      new RegExp(`of which ${esc(money(290_550))} was spent and ${esc(money(550_650))} is left`),
    )
  })
})

describe('a warning is a sentence, and a hatch has one beside it [R-ACCOUNT-482]', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const everyHatchIsSaid = () => {
    for (const node of screen.getAllByTestId('flow-node')) {
      if (!node.querySelector('[data-part="hatch"]')) continue
      const id = node.getAttribute('data-node') ?? ''
      const said = screen
        .getAllByTestId('flow-label')
        .find((element) => element.getAttribute('data-node') === id)
        ?.querySelector('[data-testid="flow-node-warning"]')
      expect(text(said), id).toMatch(/\.$/)
    }
  }

  it('set aside is not hatched when more enters its bar than its figure, nothing being short', async () => {
    await openAt(chainPlan(), 1100)
    expect(drawn.parts('pool:set-aside')).not.toContain('hatch')
    expect(label(SET_ASIDE)).toBe(`set aside ${money(110_000)}`)
    expect(drawn.parts('acc-holiday')).toContain('hatch')
    everyHatchIsSaid()
  })

  it('set aside below nothing is hatched and said in the label, the tile and the table', async () => {
    await openAt(chainPlan(200_000), 1100)
    expect(drawn.parts('pool:set-aside')).toContain('hatch')
    expect(label(SET_ASIDE)).toBe(
      `set aside ${money(-50_000)}These accounts send on more than they receive.`,
    )
    expect(text(screen.getByTestId('tile-set-aside'))).toContain(
      `${money(-50_000)}The savings, pillar, tax and investment accounts send on more than they receive.`,
    )
    expect(text(screen.getByTestId('total-set-aside'))).toContain('send on more than they receive.')
    everyHatchIsSaid()
  })

  it('on Actual the hatch follows what was spent, not the plan', async () => {
    const plan = workedExamplePlan()
    plan.categories[0]!.expected = 900_000
    await openAt(plan, 1100)
    expect(drawn.parts(SPENDABLE)).toContain('hatch')
    everyHatchIsSaid()
    await userEvent.click(screen.getByTestId('basis-actual'))
    await screen.findByRole('heading', { name: /^What actually happened/ })
    expect(drawn.parts(SPENDABLE)).not.toContain('hatch')
    expect(label(SPENDABLE)).toBe(`spendable ${money(841_200)}`)
    expect(screen.getByTestId('money-flow-key').querySelector('[data-key="short"]')).toBeNull()
  })

  it('a shortfall only on Actual is said as what was spent', async () => {
    const plan = workedExamplePlan()
    plan.categories[0]!.spent = 900_000
    await openAt(plan, 1100)
    expect(label(SPENDABLE)).toBe(`spendable ${money(841_200)}`)
    await userEvent.click(screen.getByTestId('basis-actual'))
    await screen.findByRole('heading', { name: /^What actually happened/ })
    expect(label(SPENDABLE)).toBe(
      `spendable ${money(841_200)}More was spent than was spendable, which leaves ${money(-149_350)}.`,
    )
    expect(drawn.parts(SPENDABLE)).toContain('hatch')
    everyHatchIsSaid()
  })
})

describe('money sent back [R-ACCOUNT-483]', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('left to right, is drawn from its source with an arrow, and the legend names it from where to where', async () => {
    await openAt(chainPlan(), 1100)
    expect(drawn.orientation()).toBe('sideways')
    const back = drawn.bands().filter((band) => band.part === 'return')
    expect(back).toEqual([
      expect.objectContaining({ link: 'tr-back', source: 'acc-buffer', target: 'acc-salary' }),
    ])
    const returned = screen
      .getAllByTestId('flow-band')
      .find((band) => band.getAttribute('data-part') === 'return')
    expect(returned?.querySelector('path')?.getAttribute('marker-end')).toMatch(/arrow/)
    expect(returned?.querySelector('path')?.getAttribute('stroke')).toBe('var(--flow-4)')
    const key = screen.getByTestId('money-flow-key')
    expect(text(key.querySelector('[data-key="loop"]'))).toBe(
      `Dashed band with an arrow, money sent back to an earlier account: Back to salary, from Buffer to Salary account, ${money(40_000)} a month`,
    )
    expect(screen.queryByTestId('flow-sent-back')).not.toBeInTheDocument()
  })

  it('top to bottom, is said in words under the diagram and is not in the legend', async () => {
    await openAt(chainPlan(), 360)
    expect(drawn.orientation()).toBe('downwards')
    expect(drawn.bands().some((band) => band.link === 'tr-back')).toBe(false)
    expect(text(screen.getByTestId('flow-sent-back'))).toBe(
      `Sent backBack to salary: from Buffer back to Salary account, ${money(40_000)} a month`,
    )
    expect(screen.getByTestId('money-flow-key').querySelector('[data-key="loop"]')).toBeNull()
  })
})

describe('labels keep their figures whole [R-ACCOUNT-481]', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs left to right when every column holds its labels beside their bars (five tiers in 700 px)', async () => {
    await openAt(workedExamplePlan(), 700)
    expect(drawn.orientation()).toBe('sideways')
  })

  it('a longer chain scrolls left to right in its own named, focusable frame that says so (seven tiers in 700 px)', async () => {
    await openAt(chainPlan(), 700)
    expect(drawn.orientation()).toBe('sideways')
    const frame = screen.getByRole('region', { name: 'Money flow diagram, scrolls sideways' })
    expect(frame).toHaveAttribute('tabindex', '0')
    expect(screen.getByTestId('flow-scroll-hint')).toHaveTextContent('scroll the diagram sideways')
    // The drawing inside is wider than the card: each label keeps its whole width.
    expect(Number.parseFloat(within(frame).getByRole('img').style.width)).toBeGreaterThan(700)
  })

  it('runs top to bottom when even a frame would be too wide (seven tiers in 600 px), or below 600 px', async () => {
    await openAt(chainPlan(), 590)
    expect(drawn.orientation()).toBe('downwards')
    expect(screen.queryByTestId('flow-scroll-frame')).not.toBeInTheDocument()
  })

  it('never cuts a figure: a figure wraps, only a name is shortened, never two to the same text', async () => {
    await openAt(chainPlan(), 1100)
    for (const value of screen.getAllByTestId('flow-node-value')) {
      expect(value.className).not.toMatch(/truncate|line-clamp|ellipsis/)
    }
    expect(shortNames(['Joint household account A', 'Joint household account B'], 90, 13)).toEqual([
      expect.stringMatching(/… ?A$/),
      expect.stringMatching(/… ?B$/),
    ])
    const names = shortNames(['Compte courant 1', 'Compte courant 12', 'Short'], 70, 13)
    expect(new Set(names).size).toBe(3)
    expect(names[2]).toBe('Short')
    // The full name is in the label's title.
    const holiday = screen
      .getAllByTestId('flow-label')
      .find((element) => element.getAttribute('data-node') === 'acc-house')
    expect(holiday?.getAttribute('title')).toMatch(/^Household account/)
  })
})

describe('one reconciling line with the other pages [R-ACCOUNT-557] [R-ACCOUNT-520]', () => {
  it('on the planned basis says the planned difference with the read’s figures, and nothing for incomes without extra income', async () => {
    await openPage()
    const line = await screen.findByTestId('money-flow-reconcile')
    expect(text(within(line).getByTestId('reconcile-planned'))).toBe(
      `The other pages show ${money(548_800)} planned: this page’s ${money(390_000)} plus ${money(158_800)} that transfers put aside.`,
    )
    expect(within(line).queryByTestId('reconcile-incomes')).not.toBeInTheDocument()
    expect(within(line).queryByTestId('reconcile-spent')).not.toBeInTheDocument()
  })

  it('on the actual basis says the spent difference, as the dashboard’s figure', async () => {
    await openPage([workedExamplePlan()], '/money-flow?basis=actual')
    const line = await screen.findByTestId('money-flow-reconcile')
    expect(text(within(line).getByTestId('reconcile-spent'))).toBe(
      `The other pages show ${money(390_550)} spent: this page’s ${money(290_550)} plus ${money(100_000)} that transfers put aside.`,
    )
    expect(within(line).queryByTestId('reconcile-planned')).not.toBeInTheDocument()
  })

  it('says the extra income the flow leaves out on both bases', async () => {
    const plan = { ...workedExamplePlan(), extraIncome: 25_000 }
    await openPage([plan])
    expect(text(await screen.findByTestId('reconcile-incomes'))).toBe(
      `The other pages show incomes of ${money(1_025_000)}: this page’s ${money(1_000_000)} plus ${money(25_000)} of extra income, which is not part of the plan.`,
    )
    await userEvent.click(screen.getByTestId('basis-actual'))
    expect(await screen.findByTestId('reconcile-spent')).toBeInTheDocument()
    expect(screen.getByTestId('reconcile-incomes')).toBeInTheDocument()
  })

  it('says nothing when every difference is zero (a transfer into an everyday account is spending)', async () => {
    await openPage([cashWalletPlan()])
    await screen.findByTestId('money-flow-tiles')
    expect(screen.queryByTestId('money-flow-reconcile')).not.toBeInTheDocument()
  })
})

describe('Planned and Actual are history entries [R-APP-480]', () => {
  it('Back returns to the other view instead of leaving the page', async () => {
    const { router } = await openAt(workedExamplePlan(), 1100)
    await userEvent.click(screen.getByTestId('basis-actual'))
    await screen.findByRole('heading', { name: /^What actually happened/ })
    await router.navigate(-1)
    await screen.findByRole('heading', { name: /^Planned money flow/ })
    expect(router.state.location.pathname).toBe('/money-flow')
    vi.restoreAllMocks()
  })
})

describe('the accounts table', () => {
  it('writes a dash, not CHF 0.00, for what leaves “Not assigned”', async () => {
    await openAt(chainPlan(), 1100)
    expect(text(screen.getByTestId('not-assigned-out'))).toBe('–nothing goes out')
    vi.restoreAllMocks()
  })
})

describe('each group’s own remainder on the Actual basis [R-ACCOUNT-502] [D-567]', () => {
  const leftOf = (name: string) =>
    text(
      within(
        screen
          .getAllByTestId('flow-spending-row')
          .find((element) => text(element).startsWith(name))!,
      ).getByTestId('flow-spending-left'),
    )

  it('shows the read’s left_amount per group, never planned less spent worked out here', async () => {
    const plan = workedExamplePlan()
    const db = householdDb()
    db.moneyFlowPlans = [plan]
    // A read whose remainder is not the page's own arithmetic: the page must show the read's.
    const rows = moneyFlowRows(plan).map((row) =>
      row.row_kind === 'spending' && row.name === 'Home' ? { ...row, left_amount: 12_345 } : row,
    )
    db.rpc.get_money_flow.mockImplementation(() => rows)
    mock.current = createSupabaseMock(fakeSession(), db)
    renderRoutes(routes, '/money-flow?basis=actual')
    await screen.findByTestId('money-flow-table')
    await screen.findByRole('heading', { name: /^What actually happened/ })
    expect(leftOf('Home')).toBe(money(12_345))
    expect(screen.getByTestId('spending-table')).not.toHaveTextContent(money(15_000))
  })

  it('the worked example: every group’s left, the column named on a phone, the totals pooled', async () => {
    await openPage([workedExamplePlan()], '/money-flow?basis=actual')
    await screen.findByRole('heading', { name: /^What actually happened/ })
    expect(leftOf('Home')).toBe(money(15_000))
    expect(leftOf('Food')).toBe(money(37_450))
    expect(leftOf('Transport')).toBe(money(18_000))
    expect(leftOf('Leisure')).toBe(money(29_000))
    expect(leftOf('Saving and pension')).toBe(money(0))
    // The row block says each figure's column (the label shows below 640 px).
    const home = screen
      .getAllByTestId('flow-spending-row')
      .find((element) => text(element).startsWith('Home'))!
    expect(text(home)).toContain(
      `Planned${money(215_000)}Spent${money(200_000)}Left${money(15_000)}`,
    )
    const table = screen.getByTestId('spending-table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => text(cell)),
    ).toEqual(['Category group', 'Planned', 'Spent', 'Left'])
    // The total row keeps the read's pooled figures: no sum of the groups' remainders.
    expect(text(within(table).getByTestId('total-left'))).toBe(`${money(550_650)}left`)
    expect(text(within(table).getByTestId('total-spent'))).toBe(money(290_550))
  })

  it('an overspent group says so in words beside its remainder below nothing', async () => {
    await openPage([chainPlan()], '/money-flow?basis=actual')
    await screen.findByRole('heading', { name: /^What actually happened/ })
    expect(leftOf('Home')).toBe(`${money(-10_000)}more spent than planned`)
    expect(leftOf('Food')).toBe(money(25_000))
  })

  it('on the Planned basis the table has no Left column', async () => {
    await openPage()
    const table = screen.getByTestId('spending-table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => text(cell)),
    ).toEqual(['Category group', 'Planned', 'Spent'])
    expect(within(table).queryByTestId('flow-spending-left')).not.toBeInTheDocument()
  })
})

describe('a linked transfer into an everyday account stays spending [R-ACCOUNT-465] [D-565]', () => {
  it('the mock answers the second worked example as docs/database.md does', () => {
    const rows = moneyFlowRows(cashWalletPlan())
    const of = (kind: string, name: string | null) =>
      rows.find((row) => row.row_kind === kind && row.name === name)!
    expect(of('account', 'Cash')).toMatchObject({
      inflow: 50_000,
      outflow: 0,
      stays: 50_000,
      spendable: true,
    })
    expect(of('account', 'Main')).toMatchObject({
      inflow: 600_000,
      outflow: 50_000,
      stays: 550_000,
      spendable: true,
    })
    expect(of('account', 'Savings')).toMatchObject({
      inflow: 0,
      outflow: 0,
      stays: 0,
      spendable: false,
    })
    expect(of('spending', 'Pocket money')).toMatchObject({
      expected: 50_000,
      transfer_share: 0,
      amount: 50_000,
      spent: 50_000,
      transfer_spent: 0,
      left_amount: 0,
    })
    expect(of('spending', 'Food')).toMatchObject({
      expected: 80_000,
      transfer_share: 0,
      amount: 80_000,
      spent: 30_000,
      left_amount: 50_000,
    })
    expect(of('total', null)).toMatchObject({
      amount: 600_000,
      set_aside: 0,
      spendable_amount: 600_000,
      planned_spending: 130_000,
      not_planned: 470_000,
      actual_spending: 80_000,
      left_amount: 520_000,
    })
  })

  it('the page shows the pocket money as planned and spent, never as set aside by transfers', async () => {
    await openPage([cashWalletPlan()], '/money-flow?basis=actual')
    await screen.findByRole('heading', { name: /^What actually happened/ })
    const table = screen.getByTestId('money-flow-table')
    const pocket = within(table)
      .getAllByTestId('flow-spending-row')
      .find((element) => text(element).startsWith('Pocket money'))!
    expect(text(pocket)).toBe(
      `Pocket moneyPlanned${money(50_000)}Spent${money(50_000)}Left${money(0)}`,
    )
    expect(table).not.toHaveTextContent('set aside by transfers')
    const cash = within(table)
      .getAllByTestId('flow-account-row')
      .find((element) => text(element).startsWith('Cash'))!
    expect(text(cash)).toContain(`Stays${money(50_000)}spendable`)
    expect(text(within(table).getByTestId('total-spendable'))).toBe(money(600_000))
    expect(text(within(table).getByTestId('total-set-aside'))).toBe(money(0))
    expect(text(within(table).getByTestId('total-planned'))).toBe(money(130_000))
    expect(text(within(table).getByTestId('total-spent'))).toBe(money(80_000))
    expect(text(within(table).getByTestId('total-not-planned'))).toBe(
      `${money(470_000)}not planned`,
    )
    expect(text(within(table).getByTestId('total-left'))).toBe(`${money(520_000)}left`)
  })

  it('a share into a set-aside account still leaves the pool, and only its transactions are set aside', () => {
    // The worked example with the Savings standing order sent to a cash wallet instead.
    const plan = workedExamplePlan()
    plan.accounts.push({
      id: 'acc-wallet',
      name: 'Wallet',
      kind: 'cash',
      createdAt: '2026-10-01T08:03:00+00:00',
    })
    plan.transfers[0]!.to = 'acc-wallet'
    const saving = moneyFlowRows(plan).find((row) => row.name === 'Saving and pension')!
    // Only Pillar 3a (third pillar) is set aside: 588.00 of 1 588.00; the Savings 1 000.00 spent
    // into the wallet is spending.
    expect(saving).toMatchObject({
      transfer_share: 58_800,
      amount: 100_000,
      spent: 100_000,
      transfer_spent: 0,
      left_amount: 0,
    })
  })
})
