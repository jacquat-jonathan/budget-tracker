import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '@/features/auth/schemas'

const valid = { displayName: 'Alex', email: 'alex@example.com', password: 'long-enough' }

function errorsFor(values: unknown): string[] {
  const result = signUpSchema.safeParse(values)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('sign-up display name [R-AUTH-006]', () => {
  it('is required, also when it is only spaces', () => {
    expect(errorsFor({ ...valid, displayName: '' })).toEqual(['validation.displayNameRequired'])
    expect(errorsFor({ ...valid, displayName: '   ' })).toEqual(['validation.displayNameRequired'])
  })

  it(`has at most ${DISPLAY_NAME_MAX_LENGTH} characters`, () => {
    expect(DISPLAY_NAME_MAX_LENGTH).toBe(80)
    expect(errorsFor({ ...valid, displayName: 'a'.repeat(80) })).toEqual([])
    expect(errorsFor({ ...valid, displayName: 'a'.repeat(81) })).toEqual([
      'validation.displayNameTooLong',
    ])
  })
})

describe('new passwords [R-AUTH-005]', () => {
  it(`need at least ${PASSWORD_MIN_LENGTH} characters at sign-up and on reset`, () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
    expect(errorsFor({ ...valid, password: '1234567' })).toEqual(['validation.passwordTooShort'])
    expect(errorsFor({ ...valid, password: '12345678' })).toEqual([])
    expect(
      resetPasswordSchema.safeParse({ password: '1234567', confirmPassword: '1234567' }).success,
    ).toBe(false)
    expect(
      resetPasswordSchema.safeParse({ password: '12345678', confirmPassword: '12345678' }).success,
    ).toBe(true)
  })
})

describe('email addresses [R-AUTH-010]', () => {
  it('are submitted trimmed', () => {
    expect(signInSchema.parse({ email: '  alex@example.com ', password: 'x' }).email).toBe(
      'alex@example.com',
    )
    expect(signUpSchema.parse({ ...valid, email: ' alex@example.com' }).email).toBe(
      'alex@example.com',
    )
  })
})
