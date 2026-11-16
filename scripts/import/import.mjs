#!/usr/bin/env node
// Import transactions into one budget with an import token (R-IMPORT-006, D-116).
//
//   BUDGET_IMPORT_TOKEN=bti_...  SUPABASE_URL=https://<project>.supabase.co  SUPABASE_ANON_KEY=<publishable key> \
//     node scripts/import/import.mjs rows.csv [--dry-run] [--source csv] [--from YYYY-MM-DD --to YYYY-MM-DD]
//
// The token comes from the environment only: it is never an argument, never printed and never
// written anywhere. The script needs no other credential: the publishable key and the token
// reach only the import function, which reads nothing back (docs/import-script.md).
//
// Input: a JSON file (an array of rows in the import row format, docs/database.md › Import)
// or a CSV file with a header line: date (YYYY-MM-DD or DD.MM.YYYY), amount (CHF, "12.50" or
// "1'234.50"; negative for a debit unless a direction column says), and optionally direction
// (debit / credit), description, merchant, bank_transaction_id, hint.
//
// --dry-run checks the file locally and sends nothing. Otherwise the rows are sent in chunks
// of 500 under one batch id; a chunk that fails on the network is sent again (the database
// records it once). Prints the counts; exits non-zero when something was refused.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

const CHUNK = 500
const MAX_CHUNKS = 100
const HINTS = ['card_bill_payment', 'own_transfer', 'transfer_to_person', 'salary', 'interest', 'fee',
  'securities_purchase', 'cash_withdrawal', 'refund']
const SOURCES = ['csv', 'migros_account', 'migros_card', 'yuh', 'script', 'other']

function fail(message) {
  console.error(`import: ${message}`)
  process.exit(2)
}

function parseArgs(argv) {
  const options = { dryRun: false, source: 'script', from: null, to: null, batchId: null, toCategoriseName: null }
  const files = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--source') options.source = argv[++i]
    else if (arg === '--from') options.from = argv[++i]
    else if (arg === '--to') options.to = argv[++i]
    else if (arg === '--batch-id') options.batchId = argv[++i]
    else if (arg === '--to-categorise-name') options.toCategoriseName = argv[++i]
    else if (arg === '--token' || arg.startsWith('--token=')) fail('the token is read from BUDGET_IMPORT_TOKEN only, never from an argument')
    else if (arg.startsWith('--')) fail(`unknown option ${arg}`)
    else files.push(arg)
  }
  if (files.length !== 1) fail('give exactly one file (JSON or CSV)')
  if (!SOURCES.includes(options.source)) fail(`--source must be one of ${SOURCES.join(', ')}`)
  return { file: files[0], options }
}

// CSV: comma or semicolon separated, double quotes for fields that contain them.
function parseCsv(text) {
  const lines = []
  let row = []
  let field = ''
  let quoted = false
  const separator = text.split('\n', 1)[0].includes(';') ? ';' : ','
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1 }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === separator) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1
      row.push(field); field = ''
      if (row.some((value) => value.trim() !== '')) lines.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((value) => value.trim() !== '')) lines.push(row)
  const [header, ...body] = lines
  if (!header) return []
  const names = header.map((name) => name.trim().toLowerCase())
  return body.map((values) => Object.fromEntries(names.map((name, i) => [name, (values[i] ?? '').trim()])))
}

// "1'234.50", "-12,50", "12" (francs) -> integer rappen, exactly (no floating point).
export function toRappen(text) {
  const match = /^([+-]?)(\d{1,3}(?:['’ ]?\d{3})*|\d+)(?:[.,](\d{1,2}))?$/.exec(text.trim())
  if (!match) return null
  const francs = BigInt(match[2].replace(/['’ ]/g, ''))
  const rappen = francs * 100n + BigInt((match[3] ?? '0').padEnd(2, '0'))
  return { negative: match[1] === '-', rappen }
}

function toIsoDate(text) {
  const iso = /^\d{4}-\d{2}-\d{2}$/.exec(text)
  if (iso) return text
  const swiss = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text)
  if (swiss) return `${swiss[3]}-${swiss[2]}-${swiss[1]}`
  return null
}

function csvToRows(records) {
  return records.map((record) => {
    const amount = toRappen(record.amount ?? '')
    const row = {
      date: toIsoDate(record.date ?? '') ?? record.date,
      amount: amount ? Number(amount.rappen) : record.amount,
      direction: record.direction || (amount?.negative ? 'debit' : 'credit'),
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
  const allowed = ['date', 'amount', 'direction', 'description', 'merchant', 'bank_transaction_id', 'hint', 'details']
  if (Object.keys(row).some((key) => !allowed.includes(key))) return 'invalid_row'
  if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      Number.isNaN(Date.parse(`${row.date}T00:00:00Z`)) || new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) !== row.date) {
    return 'invalid_date'
  }
  if (!Number.isInteger(row.amount) || row.amount < 1 || row.amount > 1_000_000_000) return 'invalid_amount'
  if (!['debit', 'credit'].includes(row.direction)) return 'invalid_direction'
  if (row.description != null && (typeof row.description !== 'string' || row.description.trim().length > 500)) return 'invalid_description'
  if (row.merchant != null && (typeof row.merchant !== 'string' || row.merchant.length > 200)) return 'invalid_merchant'
  if (row.bank_transaction_id != null && (typeof row.bank_transaction_id !== 'string' || row.bank_transaction_id.trim().length > 100)) {
    return 'invalid_bank_transaction_id'
  }
  if (row.hint != null && !HINTS.includes(row.hint)) return 'invalid_hint'
  if (row.details != null && (typeof row.details !== 'object' || Array.isArray(row.details) || JSON.stringify(row.details).length > 2000)) {
    return 'invalid_details'
  }
  return null
}

function readRows(file) {
  const text = readFileSync(file, 'utf8')
  if (extname(file).toLowerCase() === '.csv') return csvToRows(parseCsv(text))
  const data = JSON.parse(text)
  const rows = Array.isArray(data) ? data : data.rows
  if (!Array.isArray(rows)) fail('the JSON file holds no array of rows')
  return rows
}

async function send(url, key, body) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/import_with_token`, {
        method: 'POST',
        headers: { apikey: key, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const text = await response.text()
      const json = text ? JSON.parse(text) : null
      if (!response.ok) return { error: json?.message ?? `HTTP ${response.status}`, detail: json?.details }
      return { result: Array.isArray(json) ? json[0] : json }
    } catch (error) {
      // the network failed: send the same chunk again (recorded once by the database)
      if (attempt >= 3) return { error: `network: ${error.message}` }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
  }
}

async function main() {
  const { file, options } = parseArgs(process.argv.slice(2))
  const rows = readRows(file)
  if (rows.length === 0) fail('the file holds no rows')
  if (rows.length > CHUNK * MAX_CHUNKS) fail(`at most ${CHUNK * MAX_CHUNKS} rows in one import`)
  const problems = rows.map((row, i) => ({ row: i + 1, reason: checkRow(row) })).filter((p) => p.reason)
  console.log(`${rows.length} rows read from ${file}; ${problems.length} would be refused for their own content`)
  for (const p of problems.slice(0, 50)) console.log(`  row ${p.row}: ${p.reason}`)
  if (options.dryRun) {
    console.log('dry run: nothing sent')
    process.exit(problems.length ? 1 : 0)
  }
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
      p_token: token, p_batch_id: batchId, p_chunk: chunk, p_rows: part, p_source: options.source,
      p_statement_from: options.from, p_statement_to: options.to, p_to_categorise_name: options.toCategoriseName,
    })
    if (answer.error) {
      console.error(`chunk ${chunk}: refused: ${answer.error}${answer.detail ? ` (${answer.detail})` : ''}`)
      console.error(`batch ${batchId}: ${received} rows received before; send again with --batch-id ${batchId} to continue`)
      process.exit(1)
    }
    received += answer.result.received
    for (const r of answer.result.refused_rows) refused.push({ row: (chunk - 1) * CHUNK + r.row, reason: r.reason })
    console.log(`chunk ${chunk}: ${answer.result.received} received, ${answer.result.refused} refused`)
  }
  console.log(`batch ${batchId}: ${received} rows received, ${refused.length} refused; a member reviews them in the app`)
  for (const r of refused.slice(0, 50)) console.log(`  row ${r.row}: ${r.reason}`)
  process.exit(refused.length ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
