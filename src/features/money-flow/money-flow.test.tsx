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
import { workedExamplePlan } from '@/test/money-flow-fixtures'
import { rpcError } from '@/test/mock-db'
import { moneyFlowRows, type MoneyFlowPlan } from '@/test/mock-transfers'
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
    for (const row of rows) expect(Object.keys(row)).toHaveLength(31)
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
    })
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

describe('the money flow page [R-ACCOUNT-006] [R-ACCOUNT-235] [R-ACCOUNT-422]', () => {
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
      `Planned${money(0)}${money(705_600)} a year${money(158_800)} shown as transfersSpent${money(0)}${money(100_000)} moved by transfers`,
    )
    expect(text(within(table).getByTestId('total-planned'))).toBe(money(390_000))
    expect(text(within(table).getByTestId('total-spent'))).toBe(money(290_550))
    expect(text(within(table).getByTestId('total-not-planned'))).toBe(
      `${money(451_200)}not planned`,
    )
    expect(text(within(table).getByTestId('total-left'))).toBe(`${money(550_650)}left`)
    expect(table).toHaveTextContent('not its balance')
  })

  it('links each transfer to its transactions in the period [D-525]', async () => {
    await openPage()
    expect(screen.getByRole('link', { name: 'Transactions of Pillar 3a' })).toHaveAttribute(
      'href',
      '/transactions?period=period-2&transfer=tr-pillar',
    )
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
      `Not planned${money(-233_800)}Short: more spending is planned than is spendable`,
    )
    expect(label(SPENDABLE)).toContain(`short: not planned ${money(-233_800)}`)
    expect(
      screen.queryAllByTestId('flow-label').some((el) => el.getAttribute('data-node') === REST),
    ).toBe(false)
    expect(text(screen.getByTestId('total-not-planned'))).toBe(
      `${money(-233_800)}short: more planned than spendable`,
    )
    expect(screen.getByTestId('money-flow-key')).toHaveTextContent('Red hatching: short')
    await userEvent.click(screen.getByTestId('basis-actual'))
    await waitFor(() => {
      expect(text(screen.getByTestId('tile-rest'))).toContain(
        'Short: more was spent than is spendable',
      )
    })
    expect(label('group:grp-home')).toContain('more than planned')
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
    expect(text(screen.getByTestId('tile-rest'))).toContain('Short')
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

  it('colours accounts by creation and groups by display order, never by name or size', () => {
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
