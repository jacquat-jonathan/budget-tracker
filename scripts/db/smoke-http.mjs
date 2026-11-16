#!/usr/bin/env node
// Smoke test of the database contract over the real API (PostgREST and Auth), as the
// browser calls it: sign-up, the main step 2 and step 3 RPCs and views, the error contract
// (P0001 with a stable message), what an anonymous visitor and a non-member get, and two
// members racing the same boundary operation. Run it against a full local stack:
//
//   npx supabase start        # the whole stack, not only the database
//   npm run db:smoke          # reads the URL and keys from `npx supabase status`
//
// or with SUPABASE_URL and SUPABASE_ANON_KEY set. It creates throwaway users and budgets
// (emails ending in @smoke.test) and leaves them; `npm run db:reset` removes them. Exits
// non-zero on the first broken expectation. See docs/local-supabase.md.
import { execFileSync } from 'node:child_process'

function stackEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY }
  }
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' })
  const get = (name) => out.match(new RegExp(`^${name}="?([^"\\n]+)"?$`, 'm'))?.[1]
  const url = get('API_URL')
  const anon = get('PUBLISHABLE_KEY') ?? get('ANON_KEY')
  if (!url || !anon) throw new Error('cannot read API_URL and the anon key from `npx supabase status`')
  return { url, anon }
}

const { url, anon } = stackEnv()
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
