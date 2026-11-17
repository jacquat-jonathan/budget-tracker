import { DB_ERROR_CODES, DbError, dbErrorKey, isNotFoundError } from '@/lib/db-errors'
import i18n from '@/lib/i18n'
import { en } from '@/locales/en/translation'
import { fr } from '@/locales/fr/translation'
import contract from '../../docs/database.md?raw'

/** The stable messages of the contract: the tables of its "Error messages" section. */
function contractCodes(): string[] {
  return tableCodes('## Error messages\n')
}

/** The codes of the table under one heading of the contract. */
function tableCodes(heading: string): string[] {
  const at = contract.indexOf(heading)
  if (at === -1) return []
  const table = contract.slice(at)
  const end = table.indexOf('\n## ', 4)
  const rows = (end === -1 ? table : table.slice(0, end))
    .split('\n')
    .filter((line) => line.startsWith('| `'))
  return rows.flatMap((row) =>
    [...(row.split('|')[1] ?? '').matchAll(/`([a-z_]+)`/g)].map((match) => match[1] ?? ''),
  )
}

describe('database errors are shown as translated text [R-APP-004]', () => {
  it('maps every stable message of the contract to its own key, in both languages', () => {
    for (const code of DB_ERROR_CODES) {
      expect(dbErrorKey({ code: 'P0001', message: code })).toBe(`errors.db.${code}`)
      expect(en.errors.db[code], code).toBeTruthy()
      expect(fr.errors.db[code], code).toBeTruthy()
    }
  })

  it('knows every error code of docs/database.md, and no code the contract dropped', () => {
    const codes = contractCodes()
    expect(codes.length).toBeGreaterThan(20)
    expect([...DB_ERROR_CODES].sort()).toEqual([...new Set(codes)].sort())
  })

  it('lets a call word some codes its own way', () => {
    expect(
      dbErrorKey(
        { code: 'P0001', message: 'budget_not_found' },
        { budget_not_found: 'settings.budget.alreadyDeleted' },
      ),
    ).toBe('settings.budget.alreadyDeleted')
  })

  it('falls back to a generic translated message for anything unknown', () => {
    expect(dbErrorKey({ code: 'P0001', message: 'some_new_code' })).toBe('errors.generic')
    expect(dbErrorKey({ code: 'XX000', message: 'internal error: secret detail' })).toBe(
      'errors.generic',
    )
    expect(dbErrorKey('boom')).toBe('errors.generic')
    expect(dbErrorKey(null)).toBe('errors.generic')
  })

  it('maps privilege, check-constraint and network failures', () => {
    expect(dbErrorKey({ code: '42501', message: 'permission denied for table budgets' })).toBe(
      'errors.forbidden',
    )
    expect(dbErrorKey({ code: '23514', message: 'violates check constraint' })).toBe(
      'errors.invalidValue',
    )
    expect(dbErrorKey(new TypeError('Failed to fetch'))).toBe('errors.network')
    expect(dbErrorKey(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(
      'errors.network',
    )
    // A bug in the client is not "cannot reach the server".
    expect(dbErrorKey(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(
      'errors.generic',
    )
    expect(dbErrorKey({ code: '', message: 'TypeError: Failed to fetch' })).toBe('errors.network')
  })

  it('recognises "not found" answers, also from the client’s own checks', () => {
    expect(isNotFoundError(new DbError('budget_not_found'))).toBe(true)
    expect(isNotFoundError({ code: 'P0001', message: 'invitation_not_found' })).toBe(true)
    expect(isNotFoundError({ code: 'P0001', message: 'not_owner' })).toBe(false)
  })

  it('never shows the raw message', () => {
    const text = i18n.t(dbErrorKey({ code: 'P0001', message: 'not_owner' }))
    expect(text).toBe('Only the owner of the budget can do this.')
  })
})
