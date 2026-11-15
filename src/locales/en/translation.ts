export const en = {
  app: {
    name: 'Budget Tracker',
    tagline: 'Your household budget, period by period.',
  },
  common: {
    loading: 'Loading…',
    comingSoon: {
      title: 'Coming soon',
      description: 'This section is on its way. It will appear here once it is ready.',
    },
  },
  nav: {
    label: 'Menu',
    dashboard: 'Dashboard',
    budget: 'Budget',
    transactions: 'Transactions',
    subscriptions: 'Subscriptions',
    debts: 'Debts',
    periods: 'Periods',
    moneyFlow: 'Money flow',
    income: 'Income',
    settings: 'Settings',
  },
  pages: {
    dashboard: { description: 'Your current period at a glance.' },
    budget: {
      description: 'Categories, subcategories and what you expect to spend each month.',
    },
    transactions: { description: 'Everything you spend and receive, period by period.' },
    subscriptions: { description: 'Recurring charges and when the next one is due.' },
    debts: { description: 'What you owe, how it shrinks and when it will be paid off.' },
    periods: { description: 'Past periods and how they compare.' },
    moneyFlow: { description: 'How money moves between your accounts after payday.' },
    income: { description: 'The incomes that make up your monthly budget.' },
    settings: { description: 'Your profile and app preferences.' },
  },
  userMenu: {
    open: 'Open the account menu',
    signOut: 'Sign out',
    fallbackName: 'Account',
  },
  language: {
    label: 'Language',
    en: 'English',
    fr: 'Français',
  },
  theme: {
    label: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
  fields: {
    email: 'Email',
    emailPlaceholder: 'you@example.com',
    password: 'Password',
    newPassword: 'New password',
    confirmPassword: 'Confirm password',
    displayName: 'Display name',
    displayNamePlaceholder: 'How should we call you?',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
  },
  validation: {
    emailRequired: 'Enter your email address.',
    emailInvalid: 'Enter a valid email address.',
    passwordRequired: 'Enter your password.',
    passwordTooShort: 'Use at least {{min}} characters.',
    passwordsDontMatch: 'The passwords do not match.',
    displayNameRequired: 'Enter a display name.',
    displayNameTooLong: 'Use at most {{max}} characters.',
  },
  auth: {
    signIn: {
      title: 'Sign in',
      description: 'Welcome back. Sign in to your budget.',
      submit: 'Sign in',
      forgotPassword: 'Forgot your password?',
      noAccount: 'No account yet?',
      signUpLink: 'Create one',
    },
    signUp: {
      title: 'Create your account',
      description: 'It only takes a minute.',
      submit: 'Create account',
      haveAccount: 'Already have an account?',
      signInLink: 'Sign in',
      checkInbox: {
        title: 'Check your inbox',
        description:
          'We sent a confirmation link to {{email}}. Open it to activate your account, then sign in.',
      },
    },
    forgotPassword: {
      title: 'Reset your password',
      description: 'Enter your email address and we will send you a link to choose a new password.',
      submit: 'Send reset link',
      sent: {
        title: 'Check your inbox',
        description:
          'If an account exists for {{email}}, you will receive a link to reset your password shortly.',
      },
    },
    resetPassword: {
      title: 'Choose a new password',
      description: 'Enter the new password for your account.',
      submit: 'Save new password',
      invalidLink: {
        title: 'This link is no longer valid',
        description:
          'Password reset links expire after a while and work only once. Request a new one.',
        action: 'Request a new link',
      },
      cancel: 'Cancel and sign out',
    },
    backToSignIn: 'Back to sign in',
    actions: {
      resendConfirmation: 'Resend the confirmation email',
      requestPasswordReset: 'Request a new password reset link',
    },
    linkError: {
      title: 'This link no longer works',
      expired: 'Email links expire after a while and work only once. Request a new one below.',
      invalid: 'This link is incomplete or not valid. Request a new one below.',
      networkTitle: 'We could not check this link',
      network:
        'The server could not be reached, so your link has not been used. Check your connection, then try again.',
      retry: 'Try again',
    },
    resendConfirmation: {
      title: 'Resend the confirmation email',
      description:
        'Enter the email address you signed up with and we will send you a new confirmation link.',
      submit: 'Send the link',
      sent: {
        title: 'Check your inbox',
        description:
          'If an account for {{email}} is waiting for confirmation, a new link is on its way.',
      },
    },
    errors: {
      invalidCredentials: 'Incorrect email or password.',
      emailNotConfirmed: 'Confirm your email address first: open the link we sent you.',
      userAlreadyExists: 'An account with this email address already exists.',
      weakPassword: 'This password is too weak. Choose a longer or less common one.',
      samePassword: 'Choose a password different from your current one.',
      rateLimited: 'Too many attempts. Wait a moment, then try again.',
      network: 'Cannot reach the server. Check your connection and try again.',
      generic: 'Something went wrong. Please try again.',
    },
  },
  notFound: {
    title: 'Page not found',
    description: 'The page you are looking for does not exist or has moved.',
    backHome: 'Back to the dashboard',
  },
  errorPage: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred. Reloading the page usually helps.',
    reload: 'Reload the page',
  },
  config: {
    missingTitle: 'The app is not configured',
    missingDescription:
      'These environment variables are missing: {{names}}. Copy .env.example to .env.local, fill them in, then restart the dev server or rebuild.',
  },
  ui: {
    close: 'Close',
    more: 'More',
    breadcrumb: 'Breadcrumb',
    sidebar: {
      title: 'Navigation',
      description: 'Main navigation of the app.',
      toggle: 'Show or hide the menu',
    },
  },
}

type DeepStringRecord<T> = { [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]> }

/** Shape every locale must match exactly. */
export type Translation = DeepStringRecord<typeof en>
