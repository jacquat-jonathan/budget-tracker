#!/usr/bin/env node
// Import transactions into one budget with an import token (R-IMPORT-006, D-116).
//
//   BUDGET_IMPORT_TOKEN=bti_...  SUPABASE_URL=https://<project>.supabase.co  SUPABASE_ANON_KEY=<publishable key> \
//     node scripts/import/import.mjs rows.csv [--dry-run] [--all-debits] [--source csv] [--from YYYY-MM-DD --to YYYY-MM-DD]
//
// The token comes from the environment only, set by the member before the session starts: it
// is never an argument, never printed and never written anywhere. The script needs no other credential: the publishable key and the token
// reach only the import function, which reads nothing back (docs/import-script.md).
//
// Input: a JSON file (an array of rows in the import row format, docs/database.md › Import)
// or a CSV file with a header line: date (YYYY-MM-DD or DD.MM.YYYY), amount (CHF, "12.50" or
// "1'234.50"), and optionally direction (debit / credit), description, merchant,
// bank_transaction_id, hint. Without a direction, the amount must carry its sign ("-12.50" a
// debit, "+12.50" a credit); an unsigned amount is refused, unless --all-debits says every row
// without a direction is a debit (a card statement). A quote opens a quoted field only at the
// start of a field (elsewhere it is an ordinary character, as in 5" pizza); a quoted field left
// open refuses the file.
//
// --dry-run checks the file locally and sends nothing. Otherwise the rows are sent in chunks
// of 250 (a token call's limit) under one batch id. A chunk answered token_busy or
// imports_busy (another call is working: nothing was done or counted) is sent again after a
// pause; one that fails on the network, on budget_busy, call_cancelled or a statement timeout
// is sent again a few times (the database records it once). Prints the counts; exits non-zero
// when something was refused.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

const CHUNK = 250
const MAX_CHUNKS = 100
const HINTS = [
  'card_bill_payment',
  'own_transfer',
  'transfer_to_person',
  'salary',
  'interest',
  'fee',
  'securities_purchase',
  'cash_withdrawal',
  'refund',
]
const SOURCES = ['csv', 'migros_account', 'migros_card', 'yuh', 'script', 'other']

function fail(message) {
  console.error(`import: ${message}`)
  process.exit(2)
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    allDebits: false,
    source: 'script',
    from: null,
    to: null,
    batchId: null,
  }
  const files = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--all-debits') options.allDebits = true
    else if (arg === '--source') options.source = argv[++i]
    else if (arg === '--from') options.from = argv[++i]
    else if (arg === '--to') options.to = argv[++i]
    else if (arg === '--batch-id') options.batchId = argv[++i]
    else if (arg === '--token' || arg.startsWith('--token='))
      fail('the token is read from BUDGET_IMPORT_TOKEN only, never from an argument')
    else if (arg.startsWith('--')) fail(`unknown option ${arg}`)
    else files.push(arg)
  }
  if (files.length !== 1) fail('give exactly one file (JSON or CSV)')
  if (!SOURCES.includes(options.source)) fail(`--source must be one of ${SOURCES.join(', ')}`)
  return { file: files[0], options }
}

// CSV: comma or semicolon separated, double quotes for fields that contain them. A quote opens
// a quoted field only at the start of a field (after blanks at most); inside an unquoted field
// it is an ordinary character. A quoted field left open would swallow the rest of the file into
// one field: the file is refused.
export function parseCsv(text) {
  const lines = []
  let row = []
  let field = ''
  let quoted = false
  const separator = text.split('\n', 1)[0].includes(';') ? ';' : ','
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field.trim() === '') {
      quoted = true
      field = ''
    } else if (c === separator) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      if (row.some((value) => value.trim() !== '')) lines.push(row)
      row = []
    } else field += c
  }
  if (quoted) fail('the CSV file has a quote that is never closed')
  row.push(field)
  if (row.some((value) => value.trim() !== '')) lines.push(row)
  const [header, ...body] = lines
  if (!header) return []
  const names = header.map((name) => name.trim().toLowerCase())
  return body.map((values) =>
    Object.fromEntries(names.map((name, i) => [name, (values[i] ?? '').trim()])),
  )
}

// "1'234.50", "-12,50", "12" (francs) -> integer rappen, exactly (no floating point).
export function toRappen(text) {
  const match = /^([+-]?)(\d{1,3}(?:['’ ]?\d{3})*|\d+)(?:[.,](\d{1,2}))?$/.exec(text.trim())
  if (!match) return null
  const francs = BigInt(match[2].replace(/['’ ]/g, ''))
  const rappen = francs * 100n + BigInt((match[3] ?? '0').padEnd(2, '0'))
  return { sign: match[1], rappen }
}

function toIsoDate(text) {
  const iso = /^\d{4}-\d{2}-\d{2}$/.exec(text)
  if (iso) return text
  const swiss = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text)
  if (swiss) return `${swiss[3]}-${swiss[2]}-${swiss[1]}`
  return null
}

// The direction: the direction column; else the amount's sign; else, with --all-debits, a
// debit. An unsigned amount without a direction is refused (it is not guessed).
export function csvToRows(records, { allDebits = false } = {}) {
  return records.map((record) => {
    const amount = toRappen(record.amount ?? '')
    const direction =
      record.direction?.trim().toLowerCase() ||
      (amount?.sign === '-'
        ? 'debit'
        : amount?.sign === '+'
          ? 'credit'
          : allDebits
            ? 'debit'
            : null)
    const row = {
      date: toIsoDate(record.date ?? '') ?? record.date,
      amount: amount ? Number(amount.rappen) : record.amount,
      direction: direction ?? 'unsigned_amount',
    }
    for (const key of ['description', 'merchant', 'bank_transaction_id', 'hint']) {
      if (record[key]) row[key] = record[key]
    }
    return row
  })
}

// The checks the database makes on a row's own fields (the budget's own checks happen there).
export function checkRow(row) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return 'invalid_row'
  const allowed = [
    'date',
    'amount',
    'direction',
    'description',
    'merchant',
    'bank_transaction_id',
    'hint',
    'details',
  ]
  if (Object.keys(row).some((key) => !allowed.includes(key))) return 'invalid_row'
  if (
    typeof row.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
    Number.isNaN(Date.parse(`${row.date}T00:00:00Z`)) ||
    new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) !== row.date
  ) {
    return 'invalid_date'
  }
  if (!Number.isInteger(row.amount) || row.amount < 1 || row.amount > 1_000_000_000)
    return 'invalid_amount'
  if (row.direction === 'unsigned_amount') return 'unsigned_amount'
  if (!['debit', 'credit'].includes(row.direction)) return 'invalid_direction'
  if (
    row.description != null &&
    (typeof row.description !== 'string' || row.description.trim().length > 500)
  )
    return 'invalid_description'
  if (row.merchant != null && (typeof row.merchant !== 'string' || row.merchant.length > 200))
    return 'invalid_merchant'
  if (
    row.bank_transaction_id != null &&
    (typeof row.bank_transaction_id !== 'string' || row.bank_transaction_id.trim().length > 100)
  ) {
    return 'invalid_bank_transaction_id'
  }
  if (row.hint != null && !HINTS.includes(row.hint)) return 'invalid_hint'
  if (
    row.details != null &&
    (typeof row.details !== 'object' ||
      Array.isArray(row.details) ||
      JSON.stringify(row.details).length > 2000)
  ) {
    return 'invalid_details'
  }
  return null
}

function readRows(file, options) {
  const text = readFileSync(file, 'utf8')
  if (extname(file).toLowerCase() === '.csv') return csvToRows(parseCsv(text), options)
  const data = JSON.parse(text)
  const rows = Array.isArray(data) ? data : data.rows
  if (!Array.isArray(rows)) fail('the JSON file holds no array of rows')
  return rows
}

// One call. The function answers a refusal in its error column (the call still counts toward
// the token's limits); only invalid_token and read_only_call come back as HTTP errors. The busy
// answers (token_busy: another call of this token is working; imports_busy: every slot for token
// work is taken) did nothing and were not counted: sent again after a growing pause, for about
// three minutes at most. A chunk that failed on the network (up to three tries), on budget_busy
// or call_cancelled (counted; up to three tries) or on a statement timeout (57014, once more) is
// sent again under the same batch id and chunk number: the database records it once.
const BUSY = ['token_busy', 'imports_busy']
const RETRIED = ['budget_busy', 'call_cancelled']
export async function send(url, key, body, { fetchImpl = fetch, pause = 1000 } = {}) {
  let timeouts = 0
  let busy = 0
  let retried = 0
  for (let attempt = 1; ; attempt += 1) {
    let response
    let text
    try {
      response = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/rpc/import_with_token`, {
        method: 'POST',
        headers: { apikey: key, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      text = await response.text()
    } catch (error) {
      if (attempt >= 3) return { error: `network: ${error.message}` }
      await new Promise((resolve) => setTimeout(resolve, pause * attempt))
      continue
    }
    let json
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      return { error: `HTTP ${response.status}` }
    }
    if (!response.ok) {
      if (json?.code === '57014' && timeouts === 0) {
        timeouts += 1
        await new Promise((resolve) => setTimeout(resolve, pause))
        continue
      }
      return { error: json?.message ?? `HTTP ${response.status}`, detail: json?.details }
    }
    const result = Array.isArray(json) ? json[0] : json
    if (BUSY.includes(result?.error) && busy < 40) {
      busy += 1
      await new Promise((resolve) => setTimeout(resolve, pause * Math.min(busy, 5)))
      continue
    }
    if (RETRIED.includes(result?.error) && retried < 2) {
      retried += 1
      await new Promise((resolve) => setTimeout(resolve, pause * retried))
      continue
    }
    if (result?.error) return { error: result.error }
    return { result }
  }
}

async function main() {
  const { file, options } = parseArgs(process.argv.slice(2))
  const rows = readRows(file, options)
  if (rows.length === 0) fail('the file holds no rows')
  if (rows.length > CHUNK * MAX_CHUNKS) fail(`at most ${CHUNK * MAX_CHUNKS} rows in one import`)
  const problems = rows
    .map((row, i) => ({ row: i + 1, reason: checkRow(row) }))
    .filter((p) => p.reason)
  console.log(
    `${rows.length} rows read from ${file}; ${problems.length} would be refused for their own content`,
  )
  for (const p of problems.slice(0, 50)) console.log(`  row ${p.row}: ${p.reason}`)
  if (options.dryRun) {
    console.log('dry run: nothing sent')
    process.exit(problems.length ? 1 : 0)
  }
  const unsigned = problems.filter((p) => p.reason === 'unsigned_amount').length
  if (unsigned)
    fail(
      `${unsigned} rows have an unsigned amount and no direction: add a direction column, sign the amounts, or pass --all-debits`,
    )
  const token = process.env.BUDGET_IMPORT_TOKEN
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!token) fail('BUDGET_IMPORT_TOKEN is not set')
  if (!url || !key) fail('SUPABASE_URL and SUPABASE_ANON_KEY (the publishable key) must be set')
  const batchId = options.batchId ?? randomUUID()
  let received = 0
  const refused = []
  for (let chunk = 1; (chunk - 1) * CHUNK < rows.length; chunk += 1) {
    const part = rows.slice((chunk - 1) * CHUNK, chunk * CHUNK)
    const answer = await send(url, key, {
      p_token: token,
      p_batch_id: batchId,
      p_chunk: chunk,
      p_rows: part,
      p_source: options.source,
      p_statement_from: options.from,
      p_statement_to: options.to,
    })
    if (answer.error) {
      console.error(
        `chunk ${chunk}: refused: ${answer.error}${answer.detail ? ` (${answer.detail})` : ''}`,
      )
      console.error(
        `batch ${batchId}: ${received} rows received before; send again with --batch-id ${batchId} to continue`,
      )
      process.exit(1)
    }
    received += answer.result.received
    for (const r of answer.result.refused_rows)
      refused.push({ row: (chunk - 1) * CHUNK + r.row, reason: r.reason })
    console.log(
      `chunk ${chunk}: ${answer.result.received} received, ${answer.result.refused} refused`,
    )
  }
  console.log(
    `batch ${batchId}: ${received} rows received, ${refused.length} refused; a member reviews them in the app`,
  )
  for (const r of refused.slice(0, 50)) console.log(`  row ${r.row}: ${r.reason}`)
  process.exit(refused.length ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
