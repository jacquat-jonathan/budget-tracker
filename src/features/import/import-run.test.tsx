import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { routes } from '@/app/routes'
import { BUDGET_ID, categoriesDb } from '@/test/budget-fixtures'
import { plannedRow, rpcError, stagedPart, type MockDb } from '@/test/mock-db'
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
  it('asks for -1.200 and -4.000, says it was not decidable, and reads them as chosen', async () => {
    const db = categoriesDb()
    open(db)
    await chooseCsv(
      'Date;Amount;Text\n15.03.2026;-1.200;Rent\n16.03.2026;-4.000;Car\n17.03.2026;-350;Fee\n',
    )
    expect(screen.getByTestId('decimal-note')).toHaveTextContent(
      'The amounts do not say which mark separates the decimals: line 2 “-1.200”, line 3 “-4.000” could be thousands or decimals',
    )
    expect(screen.getByRole('button', { name: /Check/ })).toBeDisabled()
    expect(screen.queryByTestId('csv-sample')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('a comma (1 234,50)'))
    const sample = screen.getByTestId('csv-sample')
    expect(sample).toHaveTextContent("CHF 1'200.00")
    expect(sample).toHaveTextContent("CHF 4'000.00")
    await userEvent.click(screen.getByRole('button', { name: 'Check 3 rows' }))
    await importButtonReady()
    expect(
      (db.rpc.preview_import_part.mock.calls[0]?.[0].p_rows as { amount: number }[]).map(
        (row) => row.amount,
      ),
    ).toEqual([120_000, 400_000, 35_000])
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
    expect(db.rpc.preview_import_part.mock.calls[0]?.[0].p_rows).toEqual([
      { date: '2026-03-15', amount: 450, direction: 'debit', description: 'Bakery' },
    ])
  })

  it('refuses a file that is not text before anything is sent', async () => {
    const db = categoriesDb()
    open(db)
    const binary = new Uint8Array(400).map((_, index) => (index * 7) % 32)
    await chooseCsvFile(new File([binary], 'export.csv', { type: 'text/csv' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This file does not hold text')
    expect(db.rpc.preview_import_part).not.toHaveBeenCalled()
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
      expect(db.rpc.preview_import_part).not.toHaveBeenCalled()
    },
    MANY_ROWS_MS,
  )
})

describe('the preview, the run and a busy budget [R-IMPORT-321] [R-IMPORT-322] [R-IMPORT-361] [R-IMPORT-340]', () => {
  it(
    '[R-IMPORT-340] previews the parts in order, one at a time, with what the parts before take, shows the statement’s totals, and nothing again once the import starts or after it',
    async () => {
      const db = categoriesDb()
      let running = 0
      let most = 0
      // Row 1 of part 1 and row 1 of part 2 are both the duplicate of one existing transaction:
      // the part asked first absorbs it, as the write will.
      db.rpc.preview_import_part.mockImplementation(async (args) => {
        running += 1
        most = Math.max(most, running)
        await new Promise((resolve) => setTimeout(resolve, 20))
        running -= 1
        const part = Number(args.p_part)
        const absorbed = part > 1 && db.staged[String(args.p_batch_id)]?.[1] !== undefined
        return stagedPart(
          db,
          args,
          (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
            ...plannedRow(row, index + 1),
            action:
              index === 0 && (part === 1 || (part === 2 && !absorbed))
                ? 'skip_duplicate'
                : 'import',
          })),
        )
      })
      db.rpc.import_transactions.mockImplementation((args) =>
        (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
          ...plannedRow(row, index + 1),
          chunk: Number(args.p_chunk),
          action: index === 0 && args.p_chunk === 1 ? 'skip_duplicate' : 'import',
        })),
      )
      open(db)
      await chooseCsv(csvOf(1_600))
      await userEvent.click(screen.getByRole('button', { name: "Check 1'600 rows" }))
      await importButtonReady()
      expect(db.rpc.preview_import_part.mock.calls.map(([args]) => args.p_part)).toEqual([
        1, 2, 3, 4,
      ])
      expect(
        new Set(db.rpc.preview_import_part.mock.calls.map(([args]) => args.p_batch_id)).size,
      ).toBe(1)
      expect(most).toBe(1)
      expect(screen.getByTestId('count-import')).toHaveTextContent("1'599 to import")
      expect(screen.getByTestId('count-skip_duplicate')).toHaveTextContent(
        '1 already in the budget (duplicate)',
      )
      // Each row's amount is its line's number in francs: all but row 1, as the database sums them.
      expect(screen.getByTestId('kind-expense')).toHaveTextContent(
        "1'599 expenses, CHF 1'280'799.00 out",
      )
      expect(screen.getByTestId('preview-room')).toHaveTextContent(
        "They fit: the budget can take 50'000 more transactions.",
      )
      expect(screen.getByTestId('import-button')).toHaveTextContent("Import 1'599 rows")
      await userEvent.click(screen.getByTestId('import-button'))
      expect(await screen.findByTestId('import-result', {}, { timeout: 6000 })).toHaveTextContent(
        "1'599 transactions imported",
      )
      // What the check said is what the import did.
      expect(screen.queryByTestId('differed')).not.toBeInTheDocument()
      // The import's answers are the truth: no part was previewed again during or after it.
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(db.rpc.preview_import_part).toHaveBeenCalledTimes(4)
    },
    MANY_ROWS_MS,
  )

  it(
    '[R-IMPORT-361] a choice changed in a part asks that part and the ones after it again, never those before',
    async () => {
      const db = categoriesDb()
      // The rows of part 3 are flagged, so the "Skipped" filter shows them first.
      db.rpc.preview_import_part.mockImplementation((args) =>
        stagedPart(
          db,
          args,
          (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
            ...plannedRow(row, index + 1),
            ...(args.p_part === 3 && row.action !== 'import'
              ? { action: 'skip_flagged', flag: 'own_transfer' }
              : {}),
          })),
        ),
      )
      open(db)
      await chooseCsv(csvOf(1_200))
      await userEvent.click(screen.getByRole('button', { name: "Check 1'200 rows" }))
      await importButtonReady()
      db.rpc.preview_import_part.mockClear()
      await userEvent.click(screen.getByRole('button', { name: 'Skipped' }))
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: /Import or skip: Line 1002/ }),
        'import',
      )
      await waitFor(() => expect(db.rpc.preview_import_part).toHaveBeenCalled(), { timeout: 3000 })
      await importButtonReady()
      expect(db.rpc.preview_import_part.mock.calls.map(([args]) => args.p_part)).toEqual([3])
      // A choice in part 1: parts 1, 2 and 3 again, in order.
      db.rpc.preview_import_part.mockClear()
      await userEvent.click(screen.getByRole('button', { name: 'All rows' }))
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: /Import or skip: Line 2,/ }),
        'skip',
      )
      await waitFor(() => expect(db.rpc.preview_import_part).toHaveBeenCalled(), { timeout: 3000 })
      await importButtonReady()
      expect(db.rpc.preview_import_part.mock.calls.map(([args]) => args.p_part)).toEqual([1, 2, 3])
      expect(screen.getByTestId('count-skip_chosen')).toHaveTextContent('1 skipped by you')
    },
    MANY_ROWS_MS,
  )

  it('[R-IMPORT-361] stages the parts again from one the database no longer holds', async () => {
    const db = categoriesDb()
    let pushedOut = false
    db.rpc.preview_import_part.mockImplementation((args) => {
      const answer = stagedPart(
        db,
        args,
        (args.p_rows as Record<string, unknown>[]).map((row, index) => plannedRow(row, index + 1)),
      )
      // Another statement's check pushed part 1 out before part 2 was asked.
      if (args.p_part === 2 && !pushedOut) {
        pushedOut = true
        return { ...answer, parts: [2] }
      }
      return answer
    })
    open(db)
    await chooseCsv(csvOf(700))
    await userEvent.click(screen.getByRole('button', { name: 'Check 700 rows' }))
    await importButtonReady()
    expect(db.rpc.preview_import_part.mock.calls.map(([args]) => args.p_part)).toEqual([1, 2, 1, 2])
    expect(screen.getByTestId('count-import')).toHaveTextContent('700 to import')
  })

  it('[R-IMPORT-370] says when the rows to import do not fit, and offers no import', async () => {
    const db = categoriesDb()
    db.rpc.preview_import_part.mockImplementation((args) =>
      stagedPart(
        db,
        args,
        (args.p_rows as Record<string, unknown>[]).map((row, index) => plannedRow(row, index + 1)),
        2,
      ),
    )
    open(db)
    await chooseCsv(csvOf(3))
    await userEvent.click(screen.getByRole('button', { name: 'Check 3 rows' }))
    expect(await screen.findByTestId('preview-no-room')).toHaveTextContent(
      'This does not fit: 3 rows are set to import, and the budget can take 2 more transactions.',
    )
    expect(screen.getByTestId('import-button')).toBeDisabled()
    expect(screen.getByTestId('import-button')).toHaveTextContent('Too many rows for the room left')
  })

  it('names a "to categorise" category the import will make, and an answer with its new id is no difference', async () => {
    const db = categoriesDb()
    db.rpc.import_transactions.mockImplementation((args) =>
      (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
        ...plannedRow(row, index + 1),
        chunk: Number(args.p_chunk),
        category_id: 'new-to-categorise',
      })),
    )
    open(db)
    await chooseCsv(csvOf(2))
    await userEvent.click(screen.getByRole('button', { name: 'Check 2 rows' }))
    await importButtonReady()
    expect(
      screen.getAllByRole('button', { name: /To categorise \(made by this import\)/ }),
    ).toHaveLength(2)
    await userEvent.click(screen.getByTestId('import-button'))
    expect(await screen.findByTestId('import-result')).toHaveTextContent('2 transactions imported')
    expect(screen.queryByTestId('differed')).not.toBeInTheDocument()
  })

  it('says "busy" for a statement timeout and sends the same part again, never "refused"', async () => {
    const db = categoriesDb()
    let previewTimeouts = 0
    db.rpc.preview_import_part.mockImplementation((args) => {
      if (previewTimeouts < 1) {
        previewTimeouts += 1
        rpcError('canceling statement due to statement timeout', '57014')
      }
      return stagedPart(
        db,
        args,
        (args.p_rows as Record<string, unknown>[]).map((row, index) => plannedRow(row, index + 1)),
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
      expect(db.rpc.preview_import_part).toHaveBeenCalledTimes(2)
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

  it('[R-IMPORT-362] says a row turned out differently with every possible cause, and points to the list only for rows in it', async () => {
    const db = categoriesDb()
    db.rpc.preview_import_part.mockImplementation((args) =>
      stagedPart(
        db,
        args,
        (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
          ...plannedRow(row, index + 1),
          action: index === 1 ? 'skip_duplicate' : 'import',
        })),
      ),
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

describe('an interrupted import resumed [R-IMPORT-323] [R-IMPORT-362]', () => {
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
      db.rpc.preview_import_part.mockClear()
      // A day later: the check made before the interruption is no longer kept.
      db.staged = {}
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
      // The recorded part is not previewed (it would be planned as new): only part 2 is.
      expect(db.rpc.preview_import_part.mock.calls.map(([args]) => args.p_part)).toEqual([2])
      expect(screen.getByTestId('preview-recorded-note')).toHaveTextContent(
        'These counts are those of part 2.',
      )
      expect(screen.getByTestId('count-import')).toHaveTextContent('100 to import')
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

describe('a long preview [R-IMPORT-321] [R-IMPORT-364]', () => {
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

describe('[R-IMPORT-366] a run the database stops says why in its own words', () => {
  it.each([
    [
      'imports_per_day',
      'members have started 200 new imports within the last 24 hours',
      'a new import can start 24 hours after the oldest of those 200',
    ],
    [
      'rows_per_day',
      "has taken 20'000 imported rows within the last 24 hours",
      'rows can be imported again as the oldest of them pass 24 hours',
    ],
    [
      'imports_kept',
      "keeps at most 2'000 imports, and every one of them still holds",
      'This does not free up with time',
    ],
    [null, 'has reached one of its import limits', 'Try again later with the same file'],
  ])(
    '[R-IMPORT-442] says which import limit was reached (%s), what to do and when it frees up; no undo hint',
    async (limit, what, when) => {
      const db = categoriesDb()
      db.rpc.import_transactions.mockImplementation((args) => {
        if (args.p_chunk === 2)
          rpcError('import_limit_reached', 'P0001', limit === null ? undefined : { limit })
        return (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
          ...plannedRow(row, index + 1),
          chunk: Number(args.p_chunk),
        }))
      })
      const view = open(db)
      const text = csvOf(600)
      await chooseCsv(text)
      await userEvent.click(screen.getByRole('button', { name: 'Check 600 rows' }))
      await userEvent.click(await importButtonReady())
      const stopped = await screen.findByTestId('run-stopped')
      expect(stopped).toHaveTextContent('Part 2 was not imported:')
      expect(stopped).toHaveTextContent(what)
      expect(stopped).toHaveTextContent(when)
      expect(stopped).toHaveTextContent('Nothing of this part was written.')
      expect(stopped).not.toHaveTextContent(/undo/i)
      expect(screen.getByText('The part before it is recorded.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
      expect(screen.queryByText(/was refused/)).not.toBeInTheDocument()
      view.unmount()
      open(db)
      expect(await screen.findByTestId('pending-stopped-by')).toHaveTextContent(
        'It stopped at one of the budget’s import limits',
      )
    },
    MANY_ROWS_MS,
  )

  it(
    'says a recorded part’s answer is gone, and sends the parts after it once asked',
    async () => {
      const db = categoriesDb()
      db.rpc.import_transactions.mockImplementation((args) => {
        if (args.p_chunk === 1) rpcError('chunk_expired')
        return (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
          ...plannedRow(row, index + 1),
          chunk: Number(args.p_chunk),
        }))
      })
      const view = open(db)
      const text = csvOf(600)
      await chooseCsv(text)
      await userEvent.click(screen.getByRole('button', { name: 'Check 600 rows' }))
      await userEvent.click(await importButtonReady())
      expect(await screen.findByTestId('run-stopped')).toHaveTextContent(
        'Part 1 had already been recorded, but the budget no longer keeps its answer',
      )
      expect(screen.getByText(/in the history, under this import/)).toBeInTheDocument()
      view.unmount()
      // On resume the start page says so too.
      open(db)
      expect(await screen.findByTestId('pending-stopped-by')).toHaveTextContent(
        'It stopped at a part recorded so long ago that its answer is no longer kept.',
      )
      await chooseCsv(text)
      await userEvent.click(screen.getByRole('button', { name: 'Check 600 rows' }))
      await userEvent.click(await importButtonReady())
      await screen.findByTestId('run-stopped')
      await userEvent.click(screen.getByRole('button', { name: 'Send the parts after part 1' }))
      const result = await screen.findByTestId('import-result')
      expect(result).toHaveTextContent('100 transactions imported')
      expect(screen.getByTestId('expired-parts')).toHaveTextContent(
        'Part 1 had been recorded before and its answer is no longer kept: its rows are not counted here.',
      )
      expect(db.rpc.import_transactions.mock.calls.map(([args]) => args.p_chunk)).toEqual([
        1, 1, 1, 2,
      ])
    },
    MANY_ROWS_MS,
  )
})

describe('[R-IMPORT-367] a remembered choice is worded as the member’s only when a member made it', () => {
  it('says "Last time you chose" for a remembered choice, and nothing for a default', async () => {
    const db = categoriesDb()
    db.rpc.preview_import_part.mockImplementation((args) =>
      stagedPart(
        db,
        args,
        (args.p_rows as Record<string, unknown>[]).map((row, index) => ({
          ...plannedRow(row, index + 1),
          action: 'skip_flagged',
          flag: 'own_transfer',
          // Row 1: a member chose skip last time. Row 2: skipped by default, nothing remembered.
          remembered_choice: index === 0 ? 'skip' : null,
          choice_key: index === 0 ? 'shop 1' : 'shop 2',
        })),
      ),
    )
    open(db)
    await chooseCsv(csvOf(2))
    await userEvent.click(screen.getByRole('button', { name: 'Check 2 rows' }))
    await screen.findByTestId('count-skip_flagged')
    const rows = screen.getAllByTestId('preview-row')
    expect(rows[0]).toHaveTextContent('Last time you chose: skip.')
    expect(rows[1]).not.toHaveTextContent('Last time you chose')
    expect(rows[1]).toHaveTextContent('Money moved between your own accounts: not spending.')
  })
})
