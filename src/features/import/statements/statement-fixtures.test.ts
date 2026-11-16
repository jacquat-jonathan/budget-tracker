import {
  FIXTURE_NAMES,
  loadExpected,
  loadExpectedEntries,
  loadFixture,
} from '@/test/statement-fixtures'

import { parseStatementDocument, parseStatementText } from './parse-statement'

describe('statement parsers against the anonymised fixtures [R-IMPORT-100]', () => {
  it.each(FIXTURE_NAMES)('%s parses to exactly expected.json', (name) => {
    const result = parseStatementDocument(loadFixture(name))
    if (!result.ok) throw new Error(JSON.stringify(result.refusal))
    expect(result.statement.source).toBe(name)
    expect(result.statement.document).toStrictEqual(loadExpected(name))
  })

  it.each(FIXTURE_NAMES)('%s gives exactly the committed normalised entries', (name) => {
    const result = parseStatementText(loadFixture(name))
    if (!result.ok) throw new Error(JSON.stringify(result.refusal))
    expect(result.statement.entries).toStrictEqual(loadExpectedEntries(name))
    // The result the screens get carries no source-specific document.
    expect(Object.keys(result.statement).sort()).toEqual([
      'controls',
      'entries',
      'identity',
      'period',
      'source',
    ])
  })
})
