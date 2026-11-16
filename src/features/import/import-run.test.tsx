import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { BUDGET_ID, categoriesDb } from '@/test/budget-fixtures'
import { plannedRow, rpcError, type MockDb } from '@/test/mock-db'
import { renderRoutes } from '@/test/render'
import { createSupabaseMock, fakeSession } from '@/test/supabase-mock'

const mock = vi.hoisted(() => ({
  current: null as ReturnType<typeof createSupabaseMock> | null,
}))

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mock.current?.client
  },
}))

// The page and the mapping step are lazy chunks: loaded once here, not in a test's time.
beforeAll(async () => {
  await Promise.all([
    import('@/features/import/import-page'),
    import('@/features/import/csv/csv-mapper'),
  ])
  const view = open(categoriesDb())
  await screen.findByTestId('pdf-input')
  view.unmount()
})

/** Tests that render hundreds of rows through the page: about a second alone, more under load. */
const MANY_ROWS_MS = 15_000

beforeEach(() => {
  localStorage.clear()
})

function open(db: MockDb) {
  mock.current = createSupabaseMock(fakeSession(), db)
  return renderRoutes(routes, '/import')
}

async function chooseCsvFile(file: File) {
  await screen.findByTestId('csv-input')
  await userEvent.upload(screen.getByTestId('csv-input'), file)
}

async function chooseCsv(text: string) {
  await chooseCsvFile(new File([text], 'export.csv', { type: 'text/csv' }))
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

describe('the CSV decimal mark is asked when the amounts do not settle it [R-IMPORT-324]', () => {
  it('asks for -1.200 and -2.000, says it was not decidable, and reads them as chosen', async () => {
    const db = categoriesDb()
    open(db)
    await chooseCsv(
      'Date;Amount;Text\n15.03.2026;-1.200;Rent\n16.03.2026;-2.000;Car\n17.03.2026;-350;Fee\n',
    )
    expect(screen.getByTestId('decimal-note')).toHaveTextContent(
      'The amounts do not say which mark separates the decimals: line 2 “-1.200”, line 3 “-2.000” could be thousands or decimals',
    )
    expect(screen.getByRole('button', { name: /Check/ })).toBeDisabled()
    expect(screen.queryByTestId('csv-sample')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('a comma (1 234,50)'))
    const sample = screen.getByTestId('csv-sample')
    expect(sample).toHaveTextContent("CHF 1'200.00")
    expect(sample).toHaveTextContent("CHF 2'000.00")
    await userEvent.click(screen.getByRole('button', { name: 'Check 3 rows' }))
    await importButtonReady()
    expect(
      (db.rpc.preview_import.mock.calls[0]?.[0].p_rows as { amount: number }[]).map(
        (row) => row.amount,
      ),
    ).toEqual([120_000, 200_000, 35_000])
  })

  it('takes the mark one line settles, and refuses lines that contradict each other', async () => {
    open(categoriesDb())
    await chooseCsv('Date;Amount;Text\n15.03.2026;-1.200;Rent\n16.03.2026;-4,50;Bakery\n')
    expect(screen.getByTestId('decimal-note')).toHaveTextContent(
      'Read from the amounts: decimals after a comma (line 3 “-4,50”)',
    )
    expect(screen.getByTestId('csv-sample')).toHaveTextContent("CHF 1'200.00")
    await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }))

    await chooseCsv('Date;Amount;Text\n15.03.2026;-12.50;Rent\n16.03.2026;-4,50;Bakery\n')
    expect(screen.getByTestId('decimal-note')).toHaveTextContent(
      'some use a point for decimals (line 2 “-12.50”), others a comma (line 3 “-4,50”)',
    )
    expect(screen.getByRole('button', { name: /Check/ })).toBeDisabled()
  })
})

describe('a CSV file is read on the device whatever its encoding, or refused with why [R-IMPORT-324]', () => {
  it('reads a UTF-16 file, removes a NUL from a cell and says so', async () => {
    const text = 'Date;Text;Amount\n15.03.2026;Bak\u0000ery;-4.50\n'
    const bytes = new Uint8Array(2 + text.length * 2)
    bytes.set([0xff, 0xfe])
    Array.from(text).forEach((character, index) => {
      bytes[2 + index * 2] = character.charCodeAt(0)
    })
    const db = categoriesDb()
    open(db)
    await chooseCsvFile(new File([bytes], 'unicode.csv', { type: 'text/csv' }))
    expect(await screen.findByTestId('csv-cleaned')).toHaveTextContent(
      'Line 2 held an invisible control character',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Check 1 row' }))
    await importButtonReady()
    expect(db.rpc.preview_import.mock.calls[0]?.[0].p_rows).toEqual([
      { date: '2026-03-15', amount: 450, direction: 'debit', description: 'Bakery' },
    ])
  })

  it('refuses a file that is not text before anything is sent', async () => {
    const db = categoriesDb()
    open(db)
    const binary = new Uint8Array(400).map((_, index) => (index * 7) % 32)
    await chooseCsvFile(new File([binary], 'export.csv', { type: 'text/csv' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This file does not hold text')
    expect(db.rpc.preview_import).not.toHaveBeenCalled()
  })

  it('opens a file whose first line is data with the header box unticked, and says why [R-IMPORT-082]', async () => {
    open(categoriesDb())
    await chooseCsv('15.03.2026;Bakery;-4.50\n16.03.2026;Shop;-12.00\n')
    expect(screen.getByLabelText('The first line holds the column names')).not.toBeChecked()
    expect(screen.getByTestId('header-note')).toHaveTextContent(
      'The first line holds a date and an amount',
    )
    expect(screen.getByRole('button', { name: 'Check 2 rows' })).toBeEnabled()
  })

  it(
    'refuses a file with more rows than one import takes before anything is sent [R-IMPORT-208]',
    async () => {
      const db = categoriesDb()
      open(db)
      await chooseCsv(csvOf(50_001))
      expect(await screen.findByTestId('csv-too-many')).toHaveTextContent(
        "This file has 50'001 rows: one import takes at most 50'000. Nothing was sent. Split the file",
      )
      expect(screen.getByRole('button', { name: /Check/ })).toBeDisabled()
      expect(db.rpc.preview_import).not.toHaveBeenCalled()
    },
    MANY_ROWS_MS,
  )
})

describe('the preview, the run and a busy budget [R-IMPORT-321] [R-IMPORT-322]', () => {
  it(
    'asks at most two parts at once, and nothing again once the import starts or after it',
    async () => {
      const db = categoriesDb()
      let running = 0
      let most = 0
      db.rpc.preview_import.mockImplementation(async (args) => {
        running += 1
        most = Math.max(most, running)
        await new Promise((resolve) => setTimeout(resolve, 20))
        running -= 1
        return (args.p_rows as Record<string, unknown>[]).map((row, index) =>
          plannedRow(row, index + 1),
        )
      })
      open(db)
      await chooseCsv(csvOf(1_600))
      await userEvent.click(screen.getByRole('button', { name: "Check 1'600 rows" }))
      await importButtonReady()
      expect(db.rpc.preview_import).toHaveBeenCalledTimes(4)
      expect(most).toBe(2)
      await userEvent.click(screen.getByTestId('import-button'))
      expect(await screen.findByTestId('import-result', {}, { timeout: 6000 })).toHaveTextContent(
        "1'600 transactions imported",
      )
      // The import's answers are the truth: no part was previewed again during or after it.
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(db.rpc.preview_import).toHaveBeenCalledTimes(4)
    },
    MANY_ROWS_MS,
  )

  it('says "busy" for a statement timeout and sends the same part again, never "refused"', async () => {
    const db = categoriesDb()
    let previewTimeouts = 0
    db.rpc.preview_import.mockImplementation((args) => {
      if (previewTimeouts < 1) {
        previewTimeouts += 1
        rpcError('canceling statement due to statement timeout', '57014')
      }
      return (args.p_rows as Record<string, unknown>[]).map((row, index) =>
        plannedRow(row, index + 1),
      )
    })
    let importTimeouts = 0
    db.rpc.import_transactions.mockImplementation((args) => {
      if (importTimeouts < 1) {
        importTimeouts += 1
        rpcError('canceling statement due to statement timeout', '57014')
      }
      return (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
        ...plannedRow(row, index + 1),
        chunk: Number(args.p_chunk),
      }))
    })
    open(db)
    await chooseCsv(csvOf(3))
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await userEvent.click(screen.getByRole('button', { name: 'Check 3 rows' }))
      // The preview's timeout is asked again by itself, a second later.
      await vi.advanceTimersByTimeAsync(1_500)
      await importButtonReady()
      expect(db.rpc.preview_import).toHaveBeenCalledTimes(2)
      await userEvent.click(screen.getByTestId('import-button'))
      expect(await screen.findByTestId('run-busy')).toHaveTextContent(
        'The budget was busy and did not answer in time: part 1 was sent again (1 time).',
      )
      await vi.advanceTimersByTimeAsync(1_500)
    } finally {
      vi.useRealTimers()
    }
    expect(await screen.findByTestId('import-result')).toHaveTextContent('3 transactions imported')
    const calls = db.rpc.import_transactions.mock.calls.map(([args]) => args)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    expect(screen.queryByText(/was refused/)).not.toBeInTheDocument()
  })

  it('says a row turned out differently with every possible cause, and points to the list only for rows in it', async () => {
    const db = categoriesDb()
    db.rpc.preview_import.mockImplementation((args) =>
      (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
        ...plannedRow(row, index + 1),
        action: index === 1 ? 'skip_duplicate' : 'import',
      })),
    )
    open(db)
    await chooseCsv(csvOf(2))
    await userEvent.click(screen.getByRole('button', { name: 'Check 2 rows' }))
    await userEvent.click(await importButtonReady())
    const differed = await screen.findByTestId('differed')
    expect(differed).toHaveTextContent('1 row turned out differently than the check said.')
    expect(differed).toHaveTextContent(
      'by an earlier part of this import, by another import (yours or another member’s), or by a change in the budget',
    )
    expect(differed).toHaveTextContent('1 of them was imported although the check said to skip it.')
    expect(differed).not.toHaveTextContent('listed below')
  })

  it('catches the budget up during the run and sends the same part again', async () => {
    const db = categoriesDb()
    let refused = false
    db.rpc.import_transactions.mockImplementation((args) => {
      if (!refused) {
        refused = true
        rpcError('catching_up')
      }
      return (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
        ...plannedRow(row, index + 1),
        chunk: Number(args.p_chunk),
      }))
    })
    open(db)
    await chooseCsv(csvOf(3))
    await userEvent.click(screen.getByRole('button', { name: 'Check 3 rows' }))
    const before = db.rpc.ensure_periods.mock.calls.length
    await userEvent.click(await importButtonReady())
    expect(await screen.findByTestId('import-result')).toHaveTextContent('3 transactions imported')
    expect(db.rpc.ensure_periods.mock.calls.length).toBeGreaterThan(before)
    const calls = db.rpc.import_transactions.mock.calls.map(([args]) => args)
    expect(calls.map((args) => args.p_chunk)).toEqual([1, 1])
    expect(calls[1]).toEqual(calls[0])
  })
})

describe('leaving while an import is sent [R-IMPORT-323]', () => {
  it('asks first while parts are being sent, and not before or after', async () => {
    const db = categoriesDb()
    const gate = { release: null as (() => void) | null }
    db.rpc.import_transactions.mockImplementation(async (args) => {
      await new Promise<void>((resolve) => {
        gate.release = resolve
      })
      return (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
        ...plannedRow(row, index + 1),
        chunk: Number(args.p_chunk),
      }))
    })
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    open(db)
    await chooseCsv(csvOf(2))
    await userEvent.click(screen.getByRole('button', { name: 'Check 2 rows' }))
    const button = await importButtonReady()
    expect(leave()).toBe(false)
    fireEvent.click(button)
    await waitFor(() => expect(gate.release).not.toBeNull())
    expect(leave()).toBe(true)
    gate.release?.()
    await screen.findByTestId('import-result')
    expect(leave()).toBe(false)
  })
})

describe('an interrupted import resumed [R-IMPORT-323]', () => {
  it(
    'locks the rows of the parts already recorded and sends them unchanged',
    async () => {
      const db = categoriesDb()
      // Part 1 recorded, then the connection is lost for good.
      db.rpc.import_transactions.mockImplementation((args) => {
        if (args.p_chunk !== 1) throw new TypeError('Failed to fetch')
        return (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
          ...plannedRow(row, index + 1),
          chunk: 1,
        }))
      })
      const view = open(db)
      const text = csvOf(600)
      await chooseCsv(text)
      await userEvent.click(screen.getByRole('button', { name: 'Check 600 rows' }))
      const button = await importButtonReady()
      vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] })
      try {
        await userEvent.click(button)
        await vi.advanceTimersByTimeAsync(3_000)
        await screen.findByTestId('run-stopped')
      } finally {
        vi.useRealTimers()
      }
      view.unmount()

      db.rpc.import_transactions.mockClear()
      open(db)
      expect(await screen.findByTestId('pending-import')).toHaveTextContent(
        'stopped after part 1 of 2',
      )
      await chooseCsv(text)
      await userEvent.click(screen.getByRole('button', { name: 'Check 600 rows' }))
      expect(await screen.findByTestId('recorded-parts')).toHaveTextContent(
        'Part 1 was already recorded by the interrupted import: its rows are locked.',
      )
      await importButtonReady()
      const rows = screen.getAllByTestId('preview-row')
      const first = rows[0] as HTMLElement
      expect(within(first).getByTestId('row-recorded')).toHaveTextContent(
        'Already recorded in part 1',
      )
      expect(within(first).queryByRole('combobox')).not.toBeInTheDocument()
      expect(within(first).getByRole('checkbox')).toBeDisabled()
      // "Select all" leaves them out.
      await userEvent.click(
        screen.getByRole('checkbox', { name: 'Select all 100 rows this filter shows' }),
      )
      expect(screen.getByTestId('bulk-bar')).toHaveTextContent('100 rows selected')
    },
    MANY_ROWS_MS,
  )
})

describe('a long preview [R-IMPORT-321]', () => {
  it(
    'selects every row the filter shows, drawn or not, and reaches Import from the top',
    async () => {
      const db = categoriesDb()
      open(db)
      await chooseCsv(csvOf(150))
      await userEvent.click(screen.getByRole('button', { name: 'Check 150 rows' }))
      await importButtonReady()
      expect(screen.getAllByTestId('preview-row')).toHaveLength(100)
      await userEvent.click(
        screen.getByRole('button', { name: 'Skip the rows: go to the Import button' }),
      )
      expect(screen.getByTestId('import-button')).toHaveFocus()
      await userEvent.click(
        screen.getByRole('checkbox', { name: 'Select all 150 rows this filter shows' }),
      )
      expect(screen.getByTestId('bulk-bar')).toHaveTextContent('150 rows selected')
      await userEvent.click(
        within(screen.getByTestId('bulk-bar')).getByRole('button', { name: 'Skip' }),
      )
      await waitFor(() =>
        expect(screen.getByTestId('count-skip_chosen')).toHaveTextContent('150 skipped by you'),
      )
      // A keyboard user reaches Import without tabbing through the rows.
      await userEvent.click(
        screen.getByRole('button', { name: 'Skip the rows: go to the Import button' }),
      )
      // Nothing to import now: the bar that holds the button takes the focus.
      expect(screen.getByTestId('import-bar')).toHaveFocus()
      // The bars stay in view: sticky, and the card around them does not clip them.
      expect(screen.getByTestId('import-bar').className).toContain('sticky')
      expect(screen.getByTestId('bulk-bar').className).toContain('top-14')
      expect(screen.getByTestId('import-bar').closest('[data-slot=card]')?.className).toContain(
        'overflow-visible',
      )
      expect(localStorage.getItem(`budget-tracker-import-pending:${BUDGET_ID}`)).toBeNull()
    },
    MANY_ROWS_MS,
  )
})
