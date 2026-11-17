// The import script's own parts: reading CSV and sending a chunk (R-IMPORT-006).
import { describe, expect, it } from 'vitest'
import { csvToRows, parseCsv, send } from './import.mjs'

describe('the import script reads CSV [R-IMPORT-349]', () => {
  it('keeps a quote inside an unquoted field as a character: the two-pizza file sends 3 rows', () => {
    const text =
      'date;amount;description\n2026-11-10;-5.00;5" pizza\n2026-11-11;-7.00;7" pizza\n2026-11-12;-1.00;water\n'
    const rows = csvToRows(parseCsv(text))
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.description)).toEqual(['5" pizza', '7" pizza', 'water'])
  })

  it('still reads a quoted field with a separator and a doubled quote', () => {
    const rows = parseCsv('date,amount,description\n2026-11-10,-5.00,"Coop, ""Bern"""\n')
    expect(rows).toEqual([{ date: '2026-11-10', amount: '-5.00', description: 'Coop, "Bern"' }])
  })
})

function answers(...bodies) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push(JSON.parse(init.body))
    const body = bodies[Math.min(calls.length - 1, bodies.length - 1)]
    return { ok: true, status: 200, text: async () => JSON.stringify([body]) }
  }
  return { calls, fetchImpl }
}

describe('the import script sends a chunk [R-SECURITY-340]', () => {
  it('waits and sends again while the token or every slot is busy', async () => {
    const { calls, fetchImpl } = answers(
      { received: 0, refused: 0, refused_rows: [], error: 'token_busy' },
      { received: 0, refused: 0, refused_rows: [], error: 'imports_busy' },
      { received: 2, refused: 0, refused_rows: [], error: null },
    )
    const answer = await send('http://x', 'key', { p_chunk: 1 }, { fetchImpl, pause: 0 })
    expect(answer.result.received).toBe(2)
    expect(calls).toHaveLength(3)
  })

  it('tries budget_busy again a few times only, then reports it', async () => {
    const { calls, fetchImpl } = answers({
      received: 0,
      refused: 0,
      refused_rows: [],
      error: 'budget_busy',
    })
    const answer = await send('http://x', 'key', { p_chunk: 1 }, { fetchImpl, pause: 0 })
    expect(answer.error).toBe('budget_busy')
    expect(calls).toHaveLength(3)
  })
})
