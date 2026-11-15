import { DB_ERROR_CODES, DbError, dbErrorKey, isNotFoundError } from '@/lib/db-errors'
import i18n from '@/lib/i18n'
import { en } from '@/locales/en/translation'
import { fr } from '@/locales/fr/translation'

describe('database errors are shown as translated text [R-APP-004]', () => {
  it('maps every stable message of the contract to its own key, in both languages', () => {
    for (const code of DB_ERROR_CODES) {
      expect(dbErrorKey({ code: 'P0001', message: code })).toBe(`errors.db.${code}`)
      expect(en.errors.db[code], code).toBeTruthy()
      expect(fr.errors.db[code], code).toBeTruthy()
    }
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
