import { z } from 'zod'

/**
 * Validation messages are translation keys; forms translate them when rendering, so the
 * language can change while an error is shown.
 */
// R-AUTH-005 R-AUTH-006: password and display name lengths.
export const PASSWORD_MIN_LENGTH = 8
export const DISPLAY_NAME_MAX_LENGTH = 80

// R-AUTH-010: the email is submitted trimmed.
const email = z
  .string()
  .trim()
  .min(1, { error: 'validation.emailRequired' })
  .pipe(z.email({ error: 'validation.emailInvalid' }))

const newPassword = z
  .string()
  .min(1, { error: 'validation.passwordRequired' })
  .min(PASSWORD_MIN_LENGTH, { error: 'validation.passwordTooShort' })

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: 'validation.passwordRequired' }),
})
export type SignInValues = z.infer<typeof signInSchema>

export const signUpSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { error: 'validation.displayNameRequired' })
    .max(DISPLAY_NAME_MAX_LENGTH, { error: 'validation.displayNameTooLong' }),
  email,
  password: newPassword,
})
export type SignUpValues = z.infer<typeof signUpSchema>

export const forgotPasswordSchema = z.object({ email })
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    error: 'validation.passwordsDontMatch',
    path: ['confirmPassword'],
  })
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
