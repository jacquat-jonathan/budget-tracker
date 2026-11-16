#!/usr/bin/env node
// Smoke test of the database contract over the real API (PostgREST and Auth), as the
// browser calls it: sign-up, the main step 2, 3 and 4 RPCs and views, the error contract
// (P0001 with a stable message), what an anonymous visitor and a non-member get, and two
// members racing the same boundary operation and the same subscription charge. Run it
// against a full local stack:
//
//   npx supabase start        # the whole stack, not only the database
//   npm run db:smoke          # reads the URL and keys from `npx supabase status`
//
// or with SUPABASE_URL and SUPABASE_ANON_KEY set (and SMOKE_DB_URL, the local database, for
// the check that needs to age a throwaway budget; skipped without it). It creates throwaway users and budgets
// (emails ending in @smoke.test) and leaves them; `npm run db:reset` removes them. Exits
// non-zero on the first broken expectation. See docs/local-supabase.md.
import { execFileSync } from 'node:child_process'

function stackEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY, db: process.env.SMOKE_DB_URL }
  }
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' })
  const get = (name) => out.match(new RegExp(`^${name}="?([^"\\n]+)"?$`, 'm'))?.[1]
  const url = get('API_URL')
  const anon = get('PUBLISHABLE_KEY') ?? get('ANON_KEY')
  if (!url || !anon) throw new Error('cannot read API_URL and the anon key from `npx supabase status`')
  return { url, anon, db: process.env.SMOKE_DB_URL ?? get('DB_URL') }
}

const { url, anon, db } = stackEnv()
let checks = 0

function fail(message, detail) {
  console.error(`FAIL ${message}`)
  if (detail !== undefined) console.error(JSON.stringify(detail, null, 2))
  process.exit(1)
}
function check(condition, message, detail) {
  checks += 1
  if (!condition) fail(message, detail)
  console.log(`ok ${checks} ${message}`)
}

async function request(user, method, path, body) {
  const headers = { apikey: anon, 'content-type': 'application/json', Prefer: 'return=representation' }
  if (user) headers.Authorization = `Bearer ${user.token}`
  const response = await fetch(`${url}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: response.status, body: json }
}
const rpc = (user, name, args = {}) => request(user, 'POST', `/rest/v1/rpc/${name}`, args)
const get = (user, path) => request(user, 'GET', `/rest/v1/${path}`)
const ok = (res) => res.status >= 200 && res.status < 300
const refused = (res, message) => res.status >= 400 && res.body?.code === 'P0001' && res.body?.message === message

async function signUp(name) {
  const email = `${name}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@smoke.test`
  const res = await request(null, 'POST', '/auth/v1/signup', {
    email,
    password: 'smoke-password-1',
    data: { display_name: name },
  })
  if (!res.body?.access_token) fail(`sign-up of ${name} (is email confirmation off locally?)`, res.body)
  return { token: res.body.access_token, id: res.body.user.id, email }
}

const alice = await signUp('Alice')
const bob = await signUp('Bob')
const mallory = await signUp('Mallory')

// --- step 2 ---------------------------------------------------------------------------
const today = (await rpc(alice, 'get_today')).body
check(/^\d{4}-\d{2}-\d{2}$/.test(today), 'get_today answers a calendar date')
const start = new Date(`${today}T00:00:00Z`)
start.setUTCMonth(start.getUTCMonth() - 2)
const created = await rpc(alice, 'create_budget', {
  p_name: 'Smoke',
  p_income_name: 'Salary',
  p_amount: 650000,
  p_pay_day: 25,
  p_start_month: start.toISOString().slice(0, 10),
})
check(ok(created) && typeof created.body === 'string', 'create_budget returns the budget id', created)
const budget = created.body
const invitation = await rpc(alice, 'invite_member', { p_budget_id: budget, p_email: bob.email })
check(ok(invitation), 'invite_member', invitation)
check(ok(await rpc(bob, 'accept_invitation', { p_invitation_id: invitation.body })), 'accept_invitation')
const periods = (await get(alice, `period_summaries?budget_id=eq.${budget}&order=seq`)).body
check(Array.isArray(periods) && periods.length >= 2 && periods.at(-1).is_current, 'period_summaries lists the periods, the last current', periods)
const myBudget = (await get(alice, `my_budgets?id=eq.${budget}`)).body[0]
const renamed = await rpc(bob, 'rename_budget', { p_budget_id: budget, p_name: 'Ours', p_expected_revision: myBudget.revision })
check(ok(renamed) && renamed.body === myBudget.revision + 1, 'rename_budget returns the next revision', renamed)
const stale = await rpc(alice, 'rename_budget', { p_budget_id: budget, p_name: 'Mine', p_expected_revision: myBudget.revision })
check(refused(stale, 'record_changed'), 'a stale rename is refused with P0001 record_changed', stale)
const direct = await request(alice, 'PATCH', `/rest/v1/budgets?id=eq.${budget}`, { name: 'Direct' })
check(direct.status >= 400 && direct.body?.code === '42501', 'there is no direct rename (no privilege)', direct)
const income = (await get(alice, `income_overview?budget_id=eq.${budget}`)).body[0]
const preview = (await rpc(alice, 'preview_update_income', { p_income_id: income.id, p_pay_day: 26 })).body?.[0]
check(preview && preview.end_date, 'preview_update_income answers the end the write would give', preview)
const edited = await rpc(alice, 'update_income', {
  p_income_id: income.id,
  p_expected_revision: income.revision,
  p_name: 'Pay',
  p_pay_day: 26,
  p_previewed_end_date: preview.end_date,
})
check(ok(edited) && edited.body === income.revision + 1, 'update_income renames and changes the terms in one call', edited)

// --- step 3 ---------------------------------------------------------------------------
const food = await rpc(alice, 'create_category', { p_budget_id: budget, p_name: 'Food', p_amount: 60000, p_from_period_id: periods[0].id })
check(ok(food) && food.body[0]?.name === 'Food', 'create_category returns the category', food)
const yearly = await rpc(alice, 'create_category', { p_budget_id: budget, p_name: 'Tax', p_amount: 150, p_cadence: 'yearly' })
check(ok(yearly) && yearly.body[0]?.monthly_amount === 13, 'a yearly CHF 1.50 is 13 rappen a month', yearly)
const tx = await rpc(bob, 'add_transaction', {
  p_budget_id: budget,
  p_kind: 'expense',
  p_amount: 1234,
  p_date: today,
  p_category_id: food.body[0].id,
  p_description: 'Market',
})
check(ok(tx) && tx.body[0]?.recorded_by_name === 'Bob', 'add_transaction returns the row, with who recorded it', tx)
check(refused(await rpc(bob, 'add_transaction', { p_budget_id: budget, p_kind: 'expense', p_amount: 1, p_date: '2999-01-01', p_category_id: food.body[0].id }), 'date_outside_periods'),
  'a date after today is refused')
const page = await rpc(alice, 'list_transactions', { p_budget_id: budget, p_limit: 10 })
check(ok(page) && page.body.length === 1 && page.body[0].period_id === periods.at(-1).id, 'list_transactions pages them, with their period', page)
const progress = await rpc(alice, 'get_period_progress', { p_period_id: periods.at(-1).id })
const foodRow = progress.body?.find((row) => row.name === 'Food')
check(ok(progress) && foodRow?.spent === 1234 && foodRow?.expected === 60000 && foodRow?.parent_id === null, 'get_period_progress', progress)
const totals = (await get(alice, `period_summaries?id=eq.${periods.at(-1).id}`)).body[0]
check(totals.spent_total === 1234 && totals.expected_total === 60013, 'period_summaries carries the totals', totals)
const choices = await rpc(alice, 'list_categories_for_date', { p_budget_id: budget, p_date: today })
check(ok(choices) && choices.body.length === 2, 'list_categories_for_date', choices)
const updated = await rpc(alice, 'update_transaction', {
  p_transaction_id: tx.body[0].id,
  p_expected_revision: tx.body[0].revision,
  p_kind: 'refund',
  p_amount: 1234,
  p_date: today,
  p_category_id: food.body[0].id,
})
check(ok(updated) && updated.body[0].revision === tx.body[0].revision + 1, 'update_transaction returns the next revision', updated)
const reordered = await rpc(alice, 'reorder_categories', { p_budget_id: budget, p_category_ids: [yearly.body[0].id, food.body[0].id] })
check(ok(reordered), 'reorder_categories at the top level needs no parent', reordered)

// --- step 4 ---------------------------------------------------------------------------
const sub = await rpc(alice, 'create_subscription', {
  p_budget_id: budget,
  p_name: 'Phone',
  p_price: 2990,
  p_cadence: 'monthly',
  p_category_id: food.body[0].id,
  p_first_charge_date: today,
})
check(ok(sub) && sub.body[0]?.charge_count === 1 && sub.body[0]?.next_charge_date > today,
  'create_subscription charges today at once and shows the next charge', sub)
const awaiting = await rpc(bob, 'list_charges_awaiting_confirmation', { p_budget_id: budget })
const charge = awaiting.body?.[0]
check(ok(awaiting) && awaiting.body.length === 1 && charge.subscription_name === 'Phone' && charge.review_state === 'awaiting_confirmation',
  'list_charges_awaiting_confirmation lists it for the dashboard', awaiting)
const confirmArgs = { p_transaction_id: charge.id, p_expected_revision: charge.revision }
const confirmRace = await Promise.all([
  rpc(alice, 'confirm_subscription_charge', confirmArgs),
  rpc(bob, 'dismiss_subscription_charge', confirmArgs),
])
check(confirmRace.filter(ok).length === 1 && confirmRace.filter((res) => refused(res, 'record_changed')).length === 1,
  'a confirmation and a "did not go through" at once: one wins, the other gets record_changed', confirmRace)
const committed = (await get(alice, `period_summaries?id=eq.${periods.at(-1).id}`)).body[0]
check(committed.committed_total === 2990, 'period_summaries carries the committed total', committed)
const debt = await rpc(alice, 'create_debt', {
  p_budget_id: budget,
  p_name: 'Car',
  p_principal: 1000000,
  p_category_id: food.body[0].id,
  p_monthly_payment: 50000,
  p_interest_rate: 4.875,
})
check(ok(debt) && debt.body[0]?.interest_rate === 4.875 && debt.body[0]?.payoff === 'ends', 'create_debt takes a decimal rate and projects the end', debt)
const payment = await rpc(bob, 'add_transaction', {
  p_budget_id: budget,
  p_kind: 'expense',
  p_amount: 50000,
  p_date: today,
  p_category_id: food.body[0].id,
  p_debt_id: debt.body[0].id,
})
check(ok(payment) && payment.body[0]?.debt_name === 'Car', 'add_transaction records a payment linked to the debt', payment)
const adjusted = await rpc(alice, 'adjust_debt_balance', {
  p_debt_id: debt.body[0].id,
  p_expected_revision: debt.body[0].revision,
  p_balance: 940000,
  p_note: 'Statement',
})
check(ok(adjusted) && adjusted.body[0]?.remaining === 940000, 'adjust_debt_balance makes the remaining amount the balance entered', adjusted)
const history = await rpc(bob, 'get_debt_history', { p_debt_id: debt.body[0].id })
check(ok(history) && history.body.map((row) => row.kind).join() === 'opened,payment,adjustment' && history.body.at(-1).balance === 940000,
  'get_debt_history lists the entries with the balance after each', history)
check(refused(await rpc(mallory, 'get_debt_history', { p_debt_id: debt.body[0].id }), 'debt_not_found'),
  'a non-member gets debt_not_found')
const outsiderDebts = await get(mallory, `debt_overview?budget_id=eq.${budget}`)
check(ok(outsiderDebts) && outsiderDebts.body.length === 0, 'a non-member reads no debts', outsiderDebts)
const anonSubs = await get(null, `subscription_overview?budget_id=eq.${budget}`)
check(anonSubs.status >= 400 && anonSubs.body?.code === '42501', 'an anonymous visitor cannot read subscriptions (no privilege)', anonSubs)

// --- step 4 review additions ------------------------------------------------------------
const debtTotals = await get(bob, `debt_totals?budget_id=eq.${budget}`)
check(ok(debtTotals) && debtTotals.body[0]?.remaining_total === 940000 && debtTotals.body[0]?.owing_count === 1,
  'debt_totals gives what is still owed and how many debts owe', debtTotals)
const debtRow = (await get(bob, `debt_overview?id=eq.${debt.body[0].id}`)).body[0]
check(debtRow.paid_percent === 5 && debtRow.overpaid_by === 0 && debtRow.expected_end_after_budget_end === false,
  'debt_overview carries the paid share, the overpayment and the budget-end flag', debtRow)
const page1 = await rpc(bob, 'get_debt_history', { p_debt_id: debt.body[0].id, p_limit: 2 })
const last = page1.body?.at(-1)
const page2 = await rpc(bob, 'get_debt_history', {
  p_debt_id: debt.body[0].id,
  p_limit: 2,
  p_after_date: last?.date,
  p_after_kind: last?.kind,
  p_after_created_at: last?.created_at,
  p_after_id: last?.entry_id,
})
check(ok(page1) && ok(page2) && page1.body.length === 2 && page2.body.map((row) => row.kind).join() === 'adjustment' && page2.body[0].balance === 940000,
  'get_debt_history pages through the history with a cursor', [page1, page2])
const debtTerms = await rpc(bob, 'get_debt_terms', { p_debt_id: debt.body[0].id, p_period_id: periods.at(-1).id })
check(ok(debtTerms) && debtTerms.body[0]?.in_force === true && debtTerms.body[0]?.category_id === food.body[0].id,
  'get_debt_terms gives the terms in force in a period', debtTerms)
const inUse = await rpc(alice, 'end_category', { p_category_id: food.body[0].id, p_expected_revision: (await get(alice, `category_overview?id=eq.${food.body[0].id}`)).body[0].revision })
check(refused(inUse, 'category_in_use') && JSON.parse(inUse.body?.details ?? '[]').some((user) => user.kind === 'debt' && user.name === 'Car'),
  'category_in_use names what uses the category in its details', inUse)
const subPreview = await rpc(alice, 'preview_update_subscription', { p_subscription_id: sub.body[0].id, p_cadence: 'quarterly', p_count: 2 })
check(ok(subPreview) && subPreview.body.length === 2, 'preview_update_subscription answers with the write\'s arguments', subPreview)
const relinked = await rpc(bob, 'update_transaction', {
  p_transaction_id: payment.body[0].id,
  p_expected_revision: payment.body[0].revision,
  p_kind: 'expense',
  p_amount: 50000,
  p_date: today,
  p_category_id: food.body[0].id,
  p_relink: true,
})
check(ok(relinked) && relinked.body[0]?.debt_id === null, 'update_transaction with p_relink changes the link in the same call', relinked)
const budgetRow = (await get(bob, `my_budgets?id=eq.${budget}`)).body[0]
check(budgetRow.caught_up === true && budgetRow.charges_awaiting === 0, 'my_budgets says it is caught up and counts the charges awaiting', budgetRow)
const confirmedAll = await rpc(bob, 'confirm_subscription_charges', { p_budget_id: budget })
check(ok(confirmedAll) && confirmedAll.body === 0, 'confirm_subscription_charges confirms what awaits (nothing here)', confirmedAll)

// --- step 5: period comparison --------------------------------------------------------
const trend = await rpc(bob, 'get_period_trend', { p_budget_id: budget, p_count: 6 })
const summaries = (await get(alice, `period_summaries?budget_id=eq.${budget}&order=seq`)).body
check(ok(trend) && trend.body.length === Math.min(6, summaries.length) && trend.body.at(-1).is_current === true &&
  trend.body.every((row) => row.spent_total === summaries.find((s) => s.id === row.period_id)?.spent_total),
  'get_period_trend gives the last periods with their period_summaries figures', trend)
const lines = await rpc(bob, 'get_category_trend', { p_budget_id: budget, p_count: 6 })
check(ok(lines) && lines.body.every((line) => JSON.stringify(line.period_ids) === JSON.stringify(trend.body.map((p) => p.period_id))) &&
  trend.body.every((period, i) =>
    lines.body.filter((row) => row.parent_id === null).reduce((sum, row) => sum + row.spent[i], 0) === period.spent_total),
  'get_category_trend: one row per line, the periods of the trend, the top-level lines add up to each spent total', lines)
// A budget whose lines times periods pass the API's 1000 rows (45 categories, 24 periods):
// the answer must still be complete (R-APP-170).
const wideStart = new Date(`${today}T00:00:00Z`)
wideStart.setUTCMonth(wideStart.getUTCMonth() - 30)
const wide = (await rpc(alice, 'create_budget', {
  p_name: 'Wide', p_income_name: 'Salary', p_amount: 650000, p_pay_day: 25, p_start_month: wideStart.toISOString().slice(0, 10),
})).body
const widePeriods = (await rpc(alice, 'list_periods', { p_budget_id: wide, p_limit: 200 })).body
check(Array.isArray(widePeriods) && widePeriods.length >= 24, 'list_periods pages the periods, newest first', widePeriods)
for (let i = 0; i < 45; i += 1) {
  const cat = await rpc(alice, 'create_category', {
    p_budget_id: wide, p_name: `Line ${String(i).padStart(2, '0')}`, p_amount: 1000 + i, p_from_period_id: widePeriods.at(-1).id,
  })
  if (!ok(cat)) fail('create_category for the wide budget', cat)
  const period = widePeriods[i % 24]
  const tx = await rpc(alice, 'add_transaction', {
    p_budget_id: wide, p_kind: 'expense', p_amount: 100 + i, p_date: period.start_date, p_category_id: cat.body[0].id,
  })
  if (!ok(tx)) fail('add_transaction for the wide budget', tx)
}
const wideTrend = (await rpc(alice, 'get_period_trend', { p_budget_id: wide, p_count: 24 })).body
const wideLines = await rpc(alice, 'get_category_trend', { p_budget_id: wide, p_count: 24 })
check(ok(wideLines) && wideLines.body.length === 45 && wideLines.body.every((line) => line.spent.length === 24) &&
  wideTrend.every((period, i) => wideLines.body.reduce((sum, row) => sum + (row.parent_id === null ? row.spent[i] : 0), 0) === period.spent_total),
  'over HTTP, 45 lines over 24 periods (1080 rows in a row-per-period shape) arrive complete and add up', wideLines.body.length)
const sideBySide = await rpc(bob, 'get_period_comparison', { p_budget_id: budget })
check(ok(sideBySide) && sideBySide.body[0]?.kind === 'total' && sideBySide.body[0].b_period_id === trend.body.at(-1).period_id,
  'get_period_comparison starts with the totals, B the current period by default', sideBySide)
check(refused(await rpc(mallory, 'get_period_trend', { p_budget_id: budget }), 'budget_not_found'), 'a non-member gets no trend')
const anonTrend = await rpc(null, 'get_period_trend', { p_budget_id: budget })
check(anonTrend.status >= 400, 'an anonymous visitor cannot call the comparison', anonTrend)

// --- a budget 40 years behind: every call but the catch-up answers catching_up, quickly ---
if (db) {
  const aged = (await rpc(alice, 'create_budget', { p_name: 'Aged', p_income_name: 'Salary', p_amount: 650000, p_pay_day: 25 })).body
  // the throwaway budget's only period moved 40 years back, as if nobody had opened it since
  execFileSync('psql', [db, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c',
    `update public.periods set start_date = start_date - interval '40 years', end_date = end_date - interval '40 years' where budget_id = '${aged}'`])
  const agedIncome = (await get(alice, `my_budgets?id=eq.${aged}`)).body[0].primary_income_id
  const started = Date.now()
  const previewAged = await rpc(alice, 'preview_update_income', { p_income_id: agedIncome, p_amount: 700000 })
  const reopenAged = await rpc(alice, 'preview_reopen', { p_budget_id: aged })
  check(refused(previewAged, 'catching_up') && refused(reopenAged, 'catching_up') && Date.now() - started < 8000,
    'previews on a budget 40 years behind answer catching_up, not a timeout', [previewAged, reopenAged])
  const step = await rpc(alice, 'ensure_periods', { p_budget_id: aged })
  check(ok(step) && step.body > 0 && step.body <= 120, 'ensure_periods does one bounded step', step)
} else {
  console.log('skip: no SMOKE_DB_URL, the aged-budget check needs the local database')
}

// --- access ---------------------------------------------------------------------------
const anonRead = await get(null, `transaction_list?budget_id=eq.${budget}`)
check(anonRead.status >= 400 && anonRead.body?.code === '42501', 'an anonymous visitor cannot read transactions (no privilege)', anonRead)
const anonCall = await rpc(null, 'list_transactions', { p_budget_id: budget })
check(anonCall.status >= 400, 'an anonymous visitor cannot list them', anonCall)
const outsider = await get(mallory, `category_overview?budget_id=eq.${budget}`)
check(ok(outsider) && outsider.body.length === 0, 'a non-member reads no categories', outsider)
check(refused(await rpc(mallory, 'get_period_progress', { p_period_id: periods.at(-1).id }), 'period_not_found'),
  'a non-member gets period_not_found, never forbidden')
check(refused(await rpc(mallory, 'add_transaction', { p_budget_id: budget, p_kind: 'extra_income', p_amount: 1, p_date: today }), 'budget_not_found'),
  'a non-member cannot record a transaction')

// --- two members reopen the same period at once ---------------------------------------
const current = (await get(alice, `period_summaries?budget_id=eq.${budget}&is_current=eq.true`)).body[0]
const args = { p_budget_id: budget, p_period_id: current.id, p_expected_revision: current.revision }
const race = await Promise.all([rpc(alice, 'reopen_previous_period', args), rpc(bob, 'reopen_previous_period', args)])
check(race.filter(ok).length === 1 && race.filter((res) => refused(res, 'record_changed')).length === 1,
  'two members reopening at once: one succeeds, the other gets record_changed', race)
const after = (await get(alice, `period_summaries?budget_id=eq.${budget}&order=seq`)).body
check(after.length === periods.length - 1, 'exactly one period was merged', after)

console.log(`all ${checks} checks passed against ${url}`)
