import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { parseStatementText } from '@/features/import/statements/parse-statement'
import { toImportBatch } from '@/features/import/statements/import-rows'
import type { StatementReadResult } from '@/features/import/statements/types'
import type { Tables } from '@/lib/database.types'
import { BUDGET_ID, categoriesDb, transactionRow } from '@/test/budget-fixtures'
import { plannedRow, rpcError, type MockDb } from '@/test/mock-db'
import { renderRoutes } from '@/test/render'
import { FIXTURE_NAMES, loadFixture, type FixtureName } from '@/test/statement-fixtures'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({
  current: null as ReturnType<typeof createSupabaseMock> | null,
  read: null as null | (() => Promise<StatementReadResult>),
}))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

// The PDF reader itself is proven by the parser tests; here it gives a fixture's parse.
vi.mock('@/features/import/statements', async (original) => ({
  ...(await original<typeof import('@/features/import/statements')>()),
  readStatementFile: () =>
    mock.read?.() ?? Promise.resolve({ ok: false, refusal: { reason: 'unexpected-error' } }),
}))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// The page and the parsers are lazy chunks: loaded once here, not inside the first test's time.
beforeAll(async () => {
  await Promise.all([
    import('@/features/import/import-page'),
    import('@/features/import/csv/csv-mapper'),
    import('@/features/import/statements'),
  ])
  // The first render of the app in a file costs about half a second: paid here, once.
  const view = open(categoriesDb())
  await screen.findByTestId('pdf-input')
  view.unmount()
})

/**
 * The end-to-end tests (a whole fixture, 1200 CSV rows, an import interrupted then resumed)
 * render every row through the page: about 1 to 1.5 s alone, several times that under load.
 */
const WHOLE_STATEMENT_MS = 15_000

beforeEach(() => {
  localStorage.clear()
})

function open(db: MockDb) {
  mock.current = createSupabaseMock(fakeSession(), db)
  return renderRoutes(routes, '/import')
}

async function choosePdf() {
  // By its test id: a role query over the whole page is slow, and the heading is not the point.
  await screen.findByTestId('pdf-input')
  await userEvent.upload(
    screen.getByTestId('pdf-input'),
    new File(['%PDF-1.7 invented'], 'statement.pdf', { type: 'application/pdf' }),
  )
}

async function chooseCsv(text: string) {
  await screen.findByTestId('csv-input')
  await userEvent.upload(
    screen.getByTestId('csv-input'),
    new File([text], 'export.csv', { type: 'text/csv' }),
  )
  await screen.findByText('Map the columns', { selector: 'h2' })
}

async function importButtonReady() {
  const button = await screen.findByTestId('import-button')
  await waitFor(() => expect(button).toBeEnabled(), { timeout: 4000 })
  return button
}

function csvOf(count: number): string {
  const lines = ['Date;Text;Amount']
  for (let index = 0; index < count; index += 1) {
    lines.push(`${String(13 + (index % 15))}.10.2026;Shop ${index + 1};-${index + 1}.00`)
  }
  return lines.join('\n')
}

describe('importing a PDF statement, from its text to the rows sent [R-IMPORT-005] [R-IMPORT-252] [R-IMPORT-321]', () => {
  it.each(FIXTURE_NAMES)(
    '%s: the preview and the import carry the same batch and rows',
    async (name: FixtureName) => {
      const parsed = parseStatementText(loadFixture(name))
      if (!parsed.ok) throw new Error('fixture refused')
      mock.read = () => Promise.resolve(parsed)
      const db = categoriesDb()
      open(db)
      expect(await screen.findByText(/the file is not uploaded/)).toBeInTheDocument()
      await choosePdf()
      const summary = await screen.findByTestId('read-summary')
      expect(summary).toHaveTextContent(`${String(parsed.statement.entries.length)} entr`)
      expect(within(summary).getByTestId('adds-up')).toHaveTextContent(
        `The statement adds up: ${String(parsed.statement.controls.length)} controls checked.`,
      )
      const button = await importButtonReady()
      const expected = toImportBatch(parsed.statement)
      const [previewArgs] = db.rpc.preview_import.mock.calls[0] ?? []
      expect(previewArgs?.p_batch_id).toMatch(UUID)
      expect(previewArgs?.p_rows).toEqual(expected.rows.map(({ row }) => row))
      await userEvent.click(button)
      await screen.findByTestId('import-result')
      expect(db.rpc.import_transactions).toHaveBeenCalledTimes(1)
      expect(db.rpc.import_transactions).toHaveBeenCalledWith({
        p_budget_id: BUDGET_ID,
        p_batch_id: previewArgs?.p_batch_id,
        p_chunk: 1,
        p_rows: expected.rows.map(({ row }) => row),
        p_source: expected.source,
        p_statement_from: expected.statementFrom,
        p_statement_to: expected.statementTo,
        p_to_categorise_name: 'To categorise',
      })
      if (expected.notSent.length > 0) {
        expect(screen.queryByTestId('not-sent')).not.toBeInTheDocument()
      }
    },
    WHOLE_STATEMENT_MS,
  )

  it('lists the entries that produce no row', async () => {
    const parsed = parseStatementText(loadFixture('migros-bank-credit-card'))
    if (!parsed.ok) throw new Error('fixture refused')
    mock.read = () => Promise.resolve(parsed)
    open(categoriesDb())
    await choosePdf()
    expect(await screen.findByTestId('not-sent')).toHaveTextContent(
      'is 0.00: there is nothing to import',
    )
  })
})

describe('a refused statement [R-IMPORT-085] [R-IMPORT-320]', () => {
  it('says why, shows the line on this device only, logs and sends nothing', async () => {
    const logs = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'info'),
    ]
    mock.read = () =>
      Promise.resolve({
        ok: false,
        refusal: {
          reason: 'unreadable-layout',
          source: 'migros-bank-account',
          problem: 'unexpected-line',
          page: 2,
          text: 'Paiement Jane Example IBAN CH00',
        },
      })
    const db = categoriesDb()
    open(db)
    await choosePdf()
    expect(await screen.findByTestId('refusal-text')).toHaveTextContent(
      'A line of this Migros Bank account statement could not be read (an unexpected line, page 2).',
    )
    expect(screen.getByText('Paiement Jane Example IBAN CH00')).toBeInTheDocument()
    expect(db.rpc.preview_import).not.toHaveBeenCalled()
    for (const spy of logs) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('Jane Example')
      spy.mockRestore()
    }
    await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }))
    expect(
      await screen.findByRole('heading', { name: 'What would you like to import?' }),
    ).toBeInTheDocument()
  })
})

describe('the CSV import [R-IMPORT-082] [R-IMPORT-324]', () => {
  it('asks for the date format when the dates could be read two ways, shows the rows as sent, lists unreadable lines', async () => {
    const db = categoriesDb()
    open(db)
    await chooseCsv(
      'Date;Text;Amount\n03.04.2026;Bakery;-4,50\n04.05.2026;"Refund; shoes";12,00\nbad;Nothing;-1,00\n',
    )
    const go = screen.getByRole('button', { name: /Check/ })
    expect(go).toBeDisabled()
    expect(screen.getByTestId('date-format-note')).toHaveTextContent(
      'could be read in more than one way',
    )
    await userEvent.selectOptions(screen.getByLabelText('Date format'), 'DD.MM.YYYY')
    expect(within(screen.getByTestId('csv-sample')).getByText('Refund; shoes')).toBeInTheDocument()
    expect(screen.getByTestId('csv-problems')).toHaveTextContent(
      'Line 4: the date cannot be read in the chosen format',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Check 2 rows' }))
    await importButtonReady()
    expect(db.rpc.preview_import.mock.calls[0]?.[0].p_rows).toEqual([
      { date: '2026-04-03', amount: 450, direction: 'debit', description: 'Bakery' },
      { date: '2026-05-04', amount: 1200, direction: 'credit', description: 'Refund; shoes' },
    ])
  })

  it('remembers the mapping for this budget on this device', async () => {
    open(categoriesDb())
    await chooseCsv('Date;Text;Amount\n03.04.2026;Bakery;-4.50\n')
    await userEvent.selectOptions(screen.getByLabelText('Date format'), 'MM.DD.YYYY')
    await userEvent.click(screen.getByRole('button', { name: 'Check 1 row' }))
    await importButtonReady()
    await userEvent.click(screen.getByRole('button', { name: 'Start again' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Start again' }))
    await chooseCsv('Date;Text;Amount\n03.04.2026;Other;-1.00\n')
    expect(screen.getByText(/The mapping used last time/)).toBeInTheDocument()
    expect(screen.getByLabelText('Date format')).toHaveValue('mm.dd.yyyy')
  })
})

describe('choices change the preview, asked again and never shown stale [R-IMPORT-321]', () => {
  it('sends the member’s choice, marks the rows as being checked meanwhile, and waits before importing', async () => {
    const db = categoriesDb()
    const gate = { release: null as (() => void) | null }
    db.rpc.preview_import.mockImplementation(async (args) => {
      const rows = args.p_rows as Record<string, unknown>[]
      if (rows.some((row) => row.action === 'skip')) {
        await new Promise<void>((resolve) => {
          gate.release = resolve
        })
      }
      return rows.map((row, index) => plannedRow(row, index + 1))
    })
    open(db)
    await chooseCsv('Date;Text;Amount\n13.04.2026;Bakery;-4.50\n14.04.2026;Shoes;-80.00\n')
    await userEvent.click(screen.getByRole('button', { name: 'Check 2 rows' }))
    await importButtonReady()
    expect(screen.getByTestId('count-import')).toHaveTextContent('2 to import')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /Import or skip: Line 3/ }),
      'skip',
    )
    await waitFor(() =>
      expect(screen.getByTestId('import-button')).toHaveTextContent('Wait for the check to finish'),
    )
    expect(screen.getByTestId('import-button')).toBeDisabled()
    await waitFor(() => expect(gate.release).not.toBeNull(), { timeout: 3000 })
    expect(screen.getAllByTestId('preview-row')[1]).toHaveAttribute('aria-busy', 'true')
    gate.release?.()
    await waitFor(() =>
      expect(screen.getByTestId('count-skip_chosen')).toHaveTextContent('1 skipped by you'),
    )
    const last = db.rpc.preview_import.mock.calls.at(-1)?.[0]
    expect((last?.p_rows as Record<string, unknown>[])[1]).toMatchObject({ action: 'skip' })
    await userEvent.click(await importButtonReady())
    await waitFor(() => expect(db.rpc.import_transactions).toHaveBeenCalled())
    expect(db.rpc.import_transactions.mock.calls[0]?.[0].p_rows).toEqual(last?.p_rows)
  })
})

describe('a large import in parts [R-IMPORT-208] [R-IMPORT-322]', () => {
  it(
    'previews and sends 1200 rows in parts of 500, a lost answer sent again under the same part',
    async () => {
      const db = categoriesDb()
      let lost = false
      db.rpc.import_transactions.mockImplementation((args) => {
        if (args.p_chunk === 2 && !lost) {
          lost = true
          throw new TypeError('Failed to fetch')
        }
        return (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
          ...plannedRow(row, index + 1),
          chunk: Number(args.p_chunk),
        }))
      })
      open(db)
      await chooseCsv(csvOf(1200))
      await userEvent.click(screen.getByRole('button', { name: "Check 1'200 rows" }))
      await importButtonReady()
      expect(
        db.rpc.preview_import.mock.calls.map(([args]) => (args.p_rows as unknown[]).length),
      ).toEqual([500, 500, 200])
      // The resend after the lost answer waits half a second: skipped, not slept.
      vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
      try {
        await userEvent.click(screen.getByTestId('import-button'))
        await vi.advanceTimersByTimeAsync(1_000)
      } finally {
        vi.useRealTimers()
      }
      expect(await screen.findByTestId('import-result', {}, { timeout: 6000 })).toHaveTextContent(
        "1'200 transactions imported",
      )
      const chunks = db.rpc.import_transactions.mock.calls.map(([args]) => args.p_chunk)
      expect(chunks).toEqual([1, 2, 2, 3])
      const calls = db.rpc.import_transactions.mock.calls.map(([args]) => args)
      expect(calls[2]).toEqual(calls[1])
      expect(new Set(calls.map((args) => args.p_batch_id)).size).toBe(1)
      expect(localStorage.getItem(`budget-tracker-import-pending:${BUDGET_ID}`)).toBeNull()
    },
    WHOLE_STATEMENT_MS,
  )

  // Proven against the mock database only: the refusal was not reproduced in a browser (that
  // needs a budget filled to 50 000 transactions); the database's own tests cover the refusal.
  it('stops on the transaction limit, says how many would fit, and that nothing of that part was written', async () => {
    const db = categoriesDb()
    db.rpc.import_transactions.mockImplementation(() =>
      rpcError('transaction_limit_reached', 'P0001', { fits: 3 }),
    )
    open(db)
    await chooseCsv(csvOf(5))
    await userEvent.click(screen.getByRole('button', { name: 'Check 5 rows' }))
    await userEvent.click(await importButtonReady())
    expect(await screen.findByTestId('run-stopped')).toHaveTextContent(
      'Part 1 was refused: the budget has room for 3 more transactions, not for every row of that part. Nothing of that part was written.',
    )
  })
})

describe('an interrupted import [R-IMPORT-323]', () => {
  it(
    'is noted on this device without its rows, and the same file goes on under the same batch',
    async () => {
      const db = categoriesDb()
      db.rpc.import_transactions.mockImplementation(() => {
        throw new TypeError('Failed to fetch')
      })
      const view = open(db)
      const text = csvOf(3)
      await chooseCsv(text)
      await userEvent.click(screen.getByRole('button', { name: 'Check 3 rows' }))
      const button = await importButtonReady()
      // The import waits 0.5, 1 and 1.5 s between resends: those waits are skipped, not slept.
      vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
      try {
        await userEvent.click(button)
        await vi.advanceTimersByTimeAsync(3_000)
        expect(await screen.findByTestId('run-stopped')).toHaveTextContent(
          'the connection keeps failing',
        )
      } finally {
        vi.useRealTimers()
      }
      const stored = localStorage.getItem(`budget-tracker-import-pending:${BUDGET_ID}`) ?? ''
      expect(stored).not.toContain('Shop')
      const batchId = (JSON.parse(stored) as { batchId: string }).batchId
      view.unmount()

      open(db)
      expect(await screen.findByTestId('pending-import')).toHaveTextContent(
        'stopped after part 0 of 1',
      )
      await chooseCsv(text)
      await userEvent.click(screen.getByRole('button', { name: 'Check 3 rows' }))
      expect(await screen.findByTestId('resumed')).toBeInTheDocument()
      await waitFor(() =>
        expect(db.rpc.preview_import.mock.calls.at(-1)?.[0].p_batch_id).toBe(batchId),
      )
    },
    WHOLE_STATEMENT_MS,
  )
})

describe('after the import [R-IMPORT-072] [R-IMPORT-204] [R-IMPORT-206]', () => {
  function skippedRow(
    id: string,
    rowNo: number,
    batchId: string,
    row: Record<string, unknown>,
    extra: Partial<Tables<'import_skipped_rows'>>,
  ): Tables<'import_skipped_rows'> {
    return {
      id,
      batch_id: batchId,
      budget_id: BUDGET_ID,
      chunk: 1,
      row_no: rowNo,
      reason: 'duplicate',
      detail: null,
      duplicate_of: null,
      match_of: null,
      row_data: row as never,
      imported_transaction_id: null,
      imported_at: null,
      created_at: '2026-11-15T10:00:00+00:00',
      ...extra,
    }
  }

  /** Four rows: one imported, a duplicate, a salary already planned, a confirmed charge. */
  function afterDb() {
    const db = categoriesDb()
    db.tables.transaction_list.push(
      transactionRow({ id: 'tx-charge', subscription_id: 'sub-1', subscription_name: 'Laser' }),
    )
    db.rpc.import_transactions.mockImplementation((args) => {
      const rows = args.p_rows as Record<string, unknown>[]
      const batchId = String(args.p_batch_id)
      db.tables.import_skipped_rows = [
        skippedRow('skipped-1', 2, batchId, rows[1] ?? {}, { duplicate_of: 'tx-1' }),
        skippedRow('skipped-2', 3, batchId, rows[2] ?? {}, { reason: 'flagged', detail: 'salary' }),
        skippedRow('skipped-3', 4, batchId, rows[3] ?? {}, {
          reason: 'matched',
          match_of: 'tx-charge',
        }),
      ]
      db.tables.import_batch_list = [
        {
          id: batchId,
          budget_id: BUDGET_ID,
          source: 'csv',
          statement_from: null,
          statement_to: null,
          created_by: null,
          created_by_name: 'Alex',
          token_id: null,
          token_name: null,
          created_at: '2026-11-15T10:00:00+00:00',
          chunk_count: 1,
          row_count: 4,
          imported_count: 1,
          duplicate_count: 1,
          flagged_count: 1,
          matched_count: 1,
          chosen_skip_count: 0,
          invalid_count: 0,
          charges_confirmed_count: 1,
          to_review_count: 1,
          undone_at: null,
          undone_by: null,
        },
      ]
      return rows.map((row, index) => ({
        ...plannedRow(row, index + 1),
        chunk: 1,
        action: ['import', 'skip_duplicate', 'skip_flagged', 'confirm_match'][index] ?? 'import',
      }))
    })
    // Imported anyway: the rows say so, and the batch counts them to review.
    db.rpc.import_skipped_anyway.mockImplementation((args) => {
      const ids = args.p_skipped_row_ids as string[]
      for (const row of db.tables.import_skipped_rows)
        if (ids.includes(row.id)) row.imported_transaction_id = `tx-${row.id}`
      const batch = db.tables.import_batch_list[0]
      if (batch) batch.to_review_count = (batch.to_review_count ?? 0) + ids.length
      return ids.map((_, index) => ({
        ...plannedRow({ date: '2026-10-02', amount: 200, direction: 'debit' }, index + 2),
        chunk: 1,
      }))
    })
    db.rpc.undo_import_batch.mockImplementation(() => [
      { deleted: 4, kept_confirmed: 0, kept_linked: 0, charges_confirmed: 1 },
    ])
    return db
  }

  it('asks before importing all skipped rows anyway: how many, of which kinds, and that they count twice', async () => {
    const db = afterDb()
    open(db)
    await chooseCsv(csvOf(4))
    await userEvent.click(screen.getByRole('button', { name: 'Check 4 rows' }))
    await userEvent.click(await importButtonReady())
    const result = await screen.findByTestId('import-result')
    expect(result).toHaveTextContent('1 transaction imported')
    expect(result).toHaveTextContent('1 skipped as a duplicate')
    const skipped = await screen.findByTestId('skipped-rows')
    // The row that confirmed the charge says so, not "already entered".
    expect(
      await within(skipped).findByText(/it confirmed a subscription charge/),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Import all skipped rows anyway' }))
    let dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Import 3 skipped rows anyway?')
    const kinds = await within(dialog).findByTestId('anyway-kinds')
    expect(kinds).toHaveTextContent('1 salary already planned as income')
    expect(kinds).toHaveTextContent('1 subscription charge the import already confirmed')
    expect(kinds).toHaveTextContent('1 already in the budget (a duplicate)')
    expect(dialog).toHaveTextContent('they will count twice in your totals')
    // Cancelled: nothing is sent.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(db.rpc.import_skipped_anyway).not.toHaveBeenCalled()

    // One row that confirmed a charge asks too.
    const rows = within(skipped).getAllByTestId('skipped-row')
    await userEvent.click(
      within(rows[2] as HTMLElement).getByRole('button', { name: /Import anyway/ }),
    )
    dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Import 1 skipped row anyway?')
    expect(dialog).toHaveTextContent('1 subscription charge the import already confirmed')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await userEvent.click(screen.getByRole('button', { name: 'Import all skipped rows anyway' }))
    dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import 3 rows anyway' }))
    await waitFor(() =>
      expect(db.rpc.import_skipped_anyway).toHaveBeenCalledWith({
        p_batch_id: db.rpc.import_transactions.mock.calls[0]?.[0].p_batch_id,
        p_skipped_row_ids: ['skipped-1', 'skipped-2', 'skipped-3'],
      }),
    )
    expect(await screen.findByTestId('anyway-done')).toHaveTextContent('3 rows imported anyway.')
  })

  it('follows what happens after it: counts after "import anyway", the undo’s numbers, the undo itself', async () => {
    const db = afterDb()
    open(db)
    await chooseCsv(csvOf(4))
    await userEvent.click(screen.getByRole('button', { name: 'Check 4 rows' }))
    await userEvent.click(await importButtonReady())
    const skipped = await screen.findByTestId('skipped-rows')
    const row = (await within(skipped).findAllByTestId('skipped-row'))[0] as HTMLElement
    expect(row).toHaveTextContent('Shop 2')
    expect(row).toHaveTextContent('Already in the budget')
    // A duplicate is imported anyway in one click; the focus goes to its new state.
    await userEvent.click(within(row).getByRole('button', { name: /Import anyway/ }))
    await waitFor(() =>
      expect(db.rpc.import_skipped_anyway).toHaveBeenCalledWith({
        p_batch_id: db.rpc.import_transactions.mock.calls[0]?.[0].p_batch_id,
        p_skipped_row_ids: ['skipped-1'],
      }),
    )
    const result = screen.getByTestId('import-result')
    await waitFor(() => expect(result).toHaveTextContent('2 transactions imported'))
    expect(result).toHaveTextContent('Of them, 1 imported anyway afterwards.')
    await waitFor(() => expect(within(row).getByText('Imported anyway')).toHaveFocus())

    await userEvent.click(screen.getByRole('button', { name: 'Undo this import' }))
    const dialog = await screen.findByRole('alertdialog')
    // The batch's own count: the row imported anyway is in it.
    await waitFor(() =>
      expect(within(dialog).getByTestId('undo-to-review')).toHaveTextContent(
        '(2 are still to review)',
      ),
    )
    expect(dialog).toHaveTextContent(
      'Kept: the ones already confirmed, the ones linked to a subscription or a debt',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Undo the import' }))
    expect(await screen.findByTestId('undo-done')).toHaveTextContent(
      'Import undone: 4 deleted, 0 kept as confirmed, 0 kept as linked, 1 charges stay confirmed.',
    )
    expect(result).toHaveTextContent('This import was undone')
    expect(result).not.toHaveTextContent('They count in your totals now')
    expect(screen.queryByRole('button', { name: /Import anyway/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Review the imported/ })).not.toBeInTheDocument()
  })
})

describe('the import page in the app [R-IMPORT-005]', () => {
  it('is in the sidebar', async () => {
    open(categoriesDb())
    const links = await screen.findAllByRole('link', { name: 'Import' })
    expect(links.some((link) => link.getAttribute('href') === '/import')).toBe(true)
  })
})
