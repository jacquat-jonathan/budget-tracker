import { catchUpEn } from '@/locales/en/catch-up'
import type { compareEn } from '@/locales/en/compare'
import type { importEn } from '@/locales/en/import'
import type { chargesEn, correctionsEn, debtsEn, subscriptionsEn } from '@/locales/en/step4'
import type { accountsEn, moneyFlowEn, transfersEn } from '@/locales/en/step7'

const core = {
  app: {
    name: 'Budget Tracker',
  },
  common: {
    loading: 'Loading…',
    saving: 'Saving…',
    save: 'Save',
    cancel: 'Cancel',
    actions: 'Actions',
  },
  nav: {
    label: 'Menu',
    dashboard: 'Dashboard',
    budget: 'Budget',
    transactions: 'Transactions',
    subscriptions: 'Subscriptions',
    debts: 'Debts',
    periods: 'Periods',
    compare: 'Compare',
    moneyFlow: 'Money flow',
    accounts: 'Accounts',
    transfers: 'Transfers',
    income: 'Income',
    import: 'Import',
    settings: 'Settings',
    newBudget: 'New budget',
  },
  pages: {
    dashboard: { description: 'Your current period at a glance.' },
    budget: {
      description: 'Categories, subcategories and what you expect to spend each month.',
    },
    transactions: { description: 'Everything you spend and receive, period by period.' },
    subscriptions: { description: 'Recurring charges and when the next one is due.' },
    debts: { description: 'What you owe, how it shrinks and when it will be paid off.' },
    moneyFlow: {
      description:
        'Where the money of a period comes from and where it goes, by the plan or as it happened.',
    },
    accounts: { description: 'The accounts your household keeps money in.' },
    transfers: {
      description:
        'Money that moves between your accounts on a schedule, and this period’s checklist.',
    },
    income: { description: 'The incomes that make up your monthly budget.' },
    settings: { description: 'The budget, the people who share it, and your account.' },
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
    datePlaceholder: 'dd.mm.yyyy',
  },
  validation: {
    bankLabelTooLong: 'Use at most 100 characters.',
    accountKindRequired: 'Choose what kind of account it is.',
    accountRequired: 'Choose an account.',
    sameAccount: 'Choose two different accounts.',
    incomeRequired: 'Choose the income whose payday it follows.',
    dueNotBeforeToday: 'Choose today or a later date, or record what already happened.',
    doneAfterToday: 'The date cannot be after today.',
    emailRequired: 'Enter your email address.',
    emailInvalid: 'Enter a valid email address.',
    passwordRequired: 'Enter your password.',
    passwordTooShort: 'Use at least {{min}} characters.',
    passwordsDontMatch: 'The passwords do not match.',
    displayNameRequired: 'Enter a display name.',
    displayNameTooLong: 'Use at most {{max}} characters.',
    nameRequired: 'Enter a name.',
    nameTooLong: 'Use at most 100 characters.',
    amountRequired: 'Enter an amount.',
    amountInvalid: "Enter an amount such as 5200 or 5'200.50.",
    amountTooSmall: 'The amount must be more than zero.',
    amountTooLarge: "The amount can be at most CHF 10'000'000.",
    dateRequired: 'Enter a date.',
    dateInvalid: 'Enter a date as dd.mm.yyyy, for example 25.01.2027.',
    amountNegative: 'The amount cannot be negative.',
    dateOutsidePeriods: 'Choose a date within the range shown under the field.',
    descriptionTooLong: 'Use at most 500 characters.',
    categoryRequired: 'Choose a category.',
    nextChargeAfterToday:
      'A new next charge must be after today (or tick the correction of an earlier period).',
    interestRate: 'Enter a rate from 0 to 100, with at most three decimals, such as 4.875.',
    linkedIsExpense:
      'A debt payment or a subscription charge is an expense. Remove the link first to make it a refund or an income.',
  },
  auth: {
    signIn: {
      title: 'Sign in',
      description: 'Welcome back. Sign in to your budget.',
      submit: 'Sign in',
      forgotPassword: 'Forgot your password?',
      sessionEndedTitle: 'Your session ended',
      sessionEnded:
        'You were signed out. What you had typed and not yet saved was not kept: enter it again after signing in. You will go back to the page you were on.',
      importInterrupted:
        'An import was being sent from this device when the session ended. What it had recorded is kept. Sign in and open the same file on the Import page to finish it: nothing is recorded twice.',
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
      description: 'Enter a new password for the account {{email}}.',
      submit: 'Save new password',
      cancel: 'Cancel and sign out',
    },
    backToSignIn: 'Back to sign in',
    actions: {
      resendConfirmation: 'Resend the confirmation email',
      requestPasswordReset: 'Request a new password reset link',
    },
    linkError: {
      title: 'This link no longer works',
      expired: 'Email links expire after a while and work only once.',
      invalid: 'This link is incomplete or not valid.',
      networkTitle: 'We could not check this link',
      network:
        'The server could not be reached, so your link has not been used. Check your connection, then try again.',
      retry: 'Try again',
      signedInAs:
        'You are still signed in as {{email}}. This link changed nothing for that account.',
      continue: 'Continue to the app',
      signOutForNew: 'Sign out to request a new link',
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
      reauthenticationNeeded:
        'For your safety, sign out and sign in again, then change your password.',
      rateLimited: 'Too many attempts. Wait a moment, then try again.',
      network: 'Cannot reach the server. Check your connection and try again.',
      offline: 'You are offline: nothing was sent. Try again once the connection is back.',
      generic: 'Something went wrong. Please try again.',
    },
    accountSwitched: {
      title: 'You are now signed in as {{email}}',
      description:
        'The email link you opened was for {{email}}, so this browser switched to that account. {{previous}} is no longer signed in here.',
      descriptionNoPrevious:
        'The email link you opened was for {{email}}, so this browser switched to that account.',
      unknownAccount: 'another account',
      dismiss: 'Got it',
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
  offline: {
    notice: 'You are offline.',
    noticeDetail: 'What is on screen stays; nothing can be saved until the connection is back.',
  },
  pageLoad: {
    title: 'This page could not be loaded',
    offline: 'You are offline. It loads by itself once the connection is back.',
    online: 'Its files could not be downloaded. Check your connection and try again.',
    retry: 'Try again',
  },
  config: {
    missingTitle: 'The app is not configured',
    missingDescription:
      'These environment variables are missing: {{names}}. Copy .env.example to .env.local, fill them in, then restart the dev server or rebuild.',
  },
  states: {
    loadFailed: 'This could not be loaded',
    retry: 'Try again',
    previewFailed: 'The preview could not be loaded: {{reason}} Saving waits until it is shown.',
  },
  errors: {
    forbidden: 'You are not allowed to do this.',
    invalidValue: 'One of the values is not accepted. Check the form and try again.',
    busy: 'The budget is busy and took too long to answer: nothing was changed. Try again in a moment.',
    network: 'Cannot reach the server. Check your connection and try again.',
    offline:
      'You are offline: nothing was saved. Try again once the connection is back; what you typed is still here.',
    networkAdd:
      'The connection failed before the answer came back. What you entered is still here: save again once you are connected. It is safe: it will be recorded only once, even if the first save went through.',
    networkSave:
      'The connection failed: nothing was saved. What you entered is still here: check your connection and save again.',
    generic: 'Something went wrong. Please try again.',
    db: {
      not_authenticated: 'Your session has ended. Sign in again.',
      interest_before_opening:
        'The period’s start cannot move onto or before the opening of a debt that has interest in that period: choose a later start.',
      import_limit_reached:
        "This budget has reached one of its import limits (200 new imports or 20'000 rows within 24 hours, or 2'000 imports kept). Nothing was written. The daily limits free up as the oldest use passes 24 hours.",
      chunk_expired:
        'That part was already recorded, but its answer is no longer kept: it is not imported again. See the import’s rows in the history instead.',
      token_busy:
        'The import token is busy with another call: nothing was done. Send the same part again in a moment.',
      imports_busy:
        'Imports are busy right now: nothing was done. Send the same part again in a moment.',
      budget_busy:
        'The budget is busy with another import: nothing was written. Send the same part again.',
      call_cancelled:
        'The import took too long and was cancelled: nothing was written. Send the same part again.',
      budget_not_found: 'This budget no longer exists, or you are no longer one of its members.',
      income_not_found: 'This income no longer exists.',
      period_not_found: 'This period no longer exists.',
      member_not_found: 'This person is not a member of the budget.',
      invitation_not_found: 'This invitation no longer exists or has expired.',
      not_owner: 'Only the owner of the budget can do this.',
      owner_cannot_leave: 'The owner cannot leave the budget. Delete it instead.',
      member_has_primary_income:
        'This member’s income is the primary income. Make another income primary first.',
      already_member: 'This person is already a member of the budget.',
      invalid_name: 'Enter a name of 1 to 100 characters.',
      invalid_amount: "The amount must be between CHF 0.01 and CHF 10'000'000.",
      invalid_pay_day: 'The pay day must be between 1 and 31.',
      invalid_weekend_rule: 'Choose one of the weekend rules.',
      invalid_email: 'Enter a valid email address.',
      invalid_start_month: 'Choose a month whose pay day has already come, at most 60 months back.',
      invalid_end_date: 'The end date can be at most ten years from now.',
      invalid_boundary:
        'This date does not work: every period must be 7 to 92 days long, and the date must be in the range shown under the field.',
      invalid_period: 'This income did not exist yet in that period. Choose a later one.',
      end_date_before_last_period:
        'This end date is before periods that already exist. Choose a later date.',
      income_is_primary: 'This is the primary income. Make another income primary first.',
      income_ended: 'This income has ended and can no longer be changed.',
      income_not_in_force:
        'This income is not in force in the current period (it starts later, or has ended), so it cannot be the primary one.',
      budget_ended: 'This budget has ended: there is no current period to apply this to.',
      budget_limit_reached: 'You already own 20 budgets, the most you can have.',
      member_limit_reached: 'This budget already has 20 members, the most it can have.',
      invitation_limit_reached:
        'This budget already has 20 pending invitations. Cancel one before inviting someone else.',
      income_limit_reached:
        'This budget already has the most incomes it can hold (50 in force, or 500 in all).',
      record_changed:
        'Someone else changed this in the meantime. What you see has been refreshed: check it, then make your change again.',
      invalid_revision:
        'This change could not be checked against the latest version. Reload and try again.',
      category_not_found: 'This category no longer exists.',
      transaction_not_found: 'This transaction no longer exists.',
      invalid_cadence: 'Choose per month or per year.',
      invalid_kind: 'Choose an expense, a refund or an extra income.',
      invalid_description: 'The note can be at most 500 characters long.',
      invalid_date: 'Enter a valid date.',
      invalid_category: 'An extra income has no category.',
      invalid_parent: 'A subcategory cannot have subcategories of its own.',
      invalid_limit: 'This list could not be loaded. Try again.',
      invalid_cursor: 'This list could not be loaded further. Reload it.',
      date_outside_periods:
        'This date is outside the budget’s periods: it must be between the first period’s start and today.',
      category_required: 'Choose a category.',
      category_is_group:
        'This category has subcategories: choose one of them (a category with subcategories has no amount of its own).',
      category_not_in_force:
        'This category was not in use in the period of this date. Choose another category or another date.',
      category_ended: 'This category has ended (for that period).',
      other_name_required:
        'A name is needed for the subcategory that takes what the category held.',
      category_limit_reached:
        'This budget already has the most categories it can hold (200 in use, or 500 in all).',
      transaction_limit_reached:
        "This budget already holds 50'000 transactions, the most it can hold.",
      category_not_ended: 'This category has not ended, so there is nothing to restore.',
      category_in_use:
        'A subscription or a debt still uses this category. End it, or move it to another category, first.',
      subscription_not_found: 'This subscription no longer exists.',
      debt_not_found: 'This debt no longer exists.',
      adjustment_not_found: 'This balance adjustment no longer exists.',
      subscription_ended: 'This subscription has ended (for that period).',
      debt_ended: 'This debt has ended (for that period).',
      before_debt_opened:
        'This date is before the debt was opened: payments and adjustments start on its opening date.',
      before_transfer_start: 'This date is before the planned transfer starts counting.',
      invalid_first_date:
        'This first date is not valid for the schedule (it must fall on the chosen day, at most ten years ahead).',
      occurrence_required: 'This period has several executions of this transfer: choose which one.',
      catching_up:
        'Nothing was saved: the budget was still catching up on the time since your last visit. It is caught up now: what you entered is still here, save again.',
      charge_held_back:
        "A charge of this subscription is waiting: the budget holds 50'000 transactions, the most it can hold. Its schedule cannot change and it cannot end until that charge is created; delete transactions to make room first.",
      preview_required:
        'This change moves the end of the current period: look at the new end below, then save again.',
      invalid_charge_date:
        'Enter a valid charge date, at most ten years ahead; a new next charge must be after today.',
      invalid_interest_rate:
        'The interest rate must be between 0 and 100 %, with at most three decimals.',
      invalid_link:
        'Only an expense can be a debt payment or a subscription charge, and a debt payment must be in the debt’s category.',
      debt_not_in_force:
        'This debt was not in force in the period of this date. Choose another date.',
      subscription_not_in_force: 'This subscription was not in force in the period of this date.',
      not_a_charge: 'This transaction is not an automatic subscription charge.',
      debt_has_history:
        'This debt already has payments, interest or adjustments, so its starting amount cannot change: adjust its balance instead.',
      subscription_limit_reached:
        'This budget already has the most subscriptions it can hold (50 in force, or 200 in all).',
      debt_limit_reached:
        'This budget already has the most debts it can hold (50 in force, or 200 in all).',
      adjustment_limit_reached:
        'This budget already holds 5000 balance adjustments, the most it can hold.',
      membership_limit_reached:
        'You already belong to 50 budgets (your own included), the most anyone can. Leave one first.',
      request_reused:
        'This form had already been saved with other values (perhaps just before the connection failed). Check the list: saving again now records a new entry.',
      invalid_rows: 'These rows could not be sent: at most 500 rows and 2 MB at a time.',
      invalid_batch: 'This import could not be identified. Start it again.',
      invalid_chunk: 'A part of this import was numbered wrongly. Start it again.',
      invalid_source: 'This kind of file cannot be imported.',
      invalid_expiry: 'A token lasts 1 to 365 days.',
      invalid_fragment:
        'Enter a merchant text of 1 to 100 characters, with at least one letter or digit.',
      import_batch_conflict: 'This import belongs to another budget. Start it again in this one.',
      import_batch_not_found: 'This import no longer exists, or belongs to another budget.',
      merchant_rule_not_found: 'This merchant rule no longer exists.',
      token_not_found: 'This import token no longer exists.',
      batch_undone: 'This import was undone: nothing more can be imported from it.',
      not_to_review: 'This transaction has already been confirmed.',
      category_to_categorise:
        '“To categorise” cannot do this: it is only the place where imported transactions wait for a category. It takes no plan, no subcategory and cannot be the category of a transaction you type, a subscription, a debt or a rule; it cannot end while it holds transactions; and a transaction in it must get a category before it can be confirmed.',
      merchant_rule_exists: 'A rule for this merchant text already exists. Edit that one instead.',
      merchant_rule_limit_reached:
        'This budget already has 500 merchant rules, the most it can hold.',
      token_limit_reached:
        'This budget already has 10 import tokens that can be used, the most it can have. Revoke one first.',
      token_active: 'Revoke this token before deleting it.',
      read_only_call: 'The import script must send its rows by POST.',
      invalid_token:
        'This import token is unknown, has expired or was revoked, or its creator is no longer a member.',
      token_rate_limited: 'This token has sent too much for now. Wait a while and try again.',
      transfer_held_back:
        'A transfer of this budget is waiting for room (the transaction limit): it cannot end until its transaction is created.',
      account_not_found: 'This account no longer exists.',
      transfer_not_found: 'This transfer no longer exists.',
      account_ended: 'This account has been closed (for that period).',
      transfer_ended: 'This transfer has ended (for that period).',
      account_in_use: 'A transfer or an income still uses this account. Change or end it first.',
      account_not_in_force: 'This account is not open in every period this applies to.',
      account_required: 'A transfer needs an account to take from and one to pay into.',
      same_account: 'A transfer needs two different accounts.',
      invalid_account_kind: 'Choose what kind of account this is.',
      invalid_bank_label: 'The bank label can be at most 100 characters long.',
      invalid_schedule: 'Choose one schedule for this transfer.',
      invalid_offset: 'The number of days must be 0 to 31.',
      invalid_day: 'The day must be 1 to 31.',
      invalid_automatic: 'Say whether this transfer is automatic.',
      invalid_arguments: 'These values do not go together. Check the form and try again.',
      transfer_not_in_force: 'This transfer has nothing due in that period.',
      transfer_already_marked:
        'This transfer is already marked for that period. Undo the mark first.',
      transfer_is_automatic: 'An automatic transfer is not marked by hand.',
      transfer_is_manual: 'Only an automatic transfer can be marked not done.',
      nothing_to_undo: 'There is no mark to undo for this transfer in that period.',
      account_limit_reached:
        'This budget already has the most accounts it can hold (50 open, or 200 in all).',
      transfer_limit_reached:
        'This budget already has the most transfers it can hold (50 in force, or 200 in all).',
    },
  },
  concurrent: {
    savedAfterLoss:
      'Saved. The answer was lost on the way, but your change is recorded: the form now shows it.',
    title: 'Someone else changed this while you had it open',
    theirVersion: 'Their version:',
    edit: 'What you typed is still here. Load their version to start again from it, or keep yours: saving then changes only the fields you edited.',
    updatedTitle: 'Someone else changed this; the form now shows their version:',
    goneTitle: 'Someone else deleted this',
    endedTitle: 'Someone else removed this',
    ended:
      'It is no longer in use from the current period, so these changes cannot be saved. Close this window; it is listed with the removed ones and can be restored.',
    gone: 'It no longer exists, so it cannot be saved. Close this window.',
    none: 'none',
    amountPer: {
      monthly: '{{amount}} per month',
      yearly: '{{amount}} per year',
    },
    fields: {
      name: 'Name',
      amount: 'Amount',
      payDay: 'Pay day',
      weekendRule: 'Weekend rule',
      kind: 'Kind',
      date: 'Date',
      category: 'Category',
      note: 'Note',
      endDate: 'End date',
      primary: 'Primary income',
    },
    remove:
      'It has changed since you opened this. Look at it again, then confirm if you still want to.',
    useTheirs: 'Load their version',
    keepMine: 'Keep mine',
    confirmAgain: 'I have looked, continue',
  },
  confirm: {
    typeToConfirm: 'Type “{{text}}” to confirm',
  },
  budgetSwitcher: {
    open: 'Current budget: {{name}}. Switch budget',
    label: 'Your budgets',
    current: 'Current budget',
    create: 'Create a budget',
  },
  budgetLost: {
    title: 'You no longer have access to “{{name}}”',
    description:
      'It was deleted, or you were removed from it. You are now in “{{name}}”. Anything you had typed there and not saved was discarded.',
    descriptionNone:
      'It was deleted, or you were removed from it. Anything you had typed there and not saved was discarded.',
    dismiss: 'Got it',
    import:
      'An import into it was under way on this device: {{confirmed}} of its {{parts}} parts were recorded and stay in that budget for its members. You can no longer continue it from here.',
  },
  budgetEnded: {
    title: 'This budget has ended',
  },
  welcome: {
    title: 'Welcome',
    greeting: 'Welcome, {{name}}',
    greetingNoName: 'Welcome',
    description: 'Set up your first budget to get started, or join one you were invited to.',
    signedInAs: 'Signed in as {{email}}.',
    createTitle: 'Create your budget',
    createDescription:
      'A budget starts from your income and runs from pay day to pay day. You can add more incomes and invite others afterwards.',
  },
  budgets: {
    nameTaken:
      'You already have a budget called “{{name}}”: both will look the same in the budget switcher. You can still save it.',
    fields: {
      name: 'Budget name',
      namePlaceholder: 'Household',
      endDateOptional: 'End date (optional)',
      endDateHelp:
        'Leave empty to run the budget indefinitely. The budget ends with the period that contains this date.',
      startMonth: 'First month',
    },
    create: {
      description: 'A new budget with its first income. It becomes your current budget.',
      budgetSection: 'Budget',
      incomeSection: 'First income',
      incomeHelp:
        'Your income, and the primary one: its pay day starts each period. You can change this later.',
      startSection: 'Start tracking from',
      startMonthCurrent: '{{month}} (the current period)',
      startMonthOption: '{{month}}',
      firstPeriodStarts: 'The first period starts on {{date}}.',
      earlierHelp:
        'Choose an earlier month to enter past spending; the periods since then are created too.',
      submit: 'Create budget',
      success: 'Budget “{{name}}” created.',
    },
  },
  invitations: {
    title: 'Invite someone',
    noEmailTitle: 'No email is sent',
    noEmailDescription:
      'Tell the person yourself. They see the invitation in the app once they sign in with an account whose confirmed email is this address, and then accept or decline it.',
    email: 'Email address',
    invite: 'Invite',
    sent: 'Invitation for {{email}} saved. Let them know.',
    pending: 'Pending invitations',
    none: 'No pending invitations.',
    invitedOn: 'Invited on {{date}}, valid until {{expires}}',
    renew: 'Renew',
    renewFor: 'Renew the invitation for {{email}} for 30 days',
    renewed: 'The invitation for {{email}} is valid for 30 more days.',
    alreadyGone: 'This invitation was already accepted, declined or cancelled.',
    cancel: 'Cancel invitation',
    cancelFor: 'Cancel the invitation for {{email}}',
    cancelled: 'Invitation for {{email}} cancelled.',
    mine: {
      title: 'Invitations for you',
      description: 'You were invited to share these budgets.',
      from: 'From {{name}} ({{email}})',
      dates: 'Sent on {{sent}}, valid until {{expires}}',
      gone: 'This invitation has expired or was cancelled.',
      accept: 'Accept',
      decline: 'Decline',
      accepted: 'You joined “{{name}}”.',
      declined: 'Invitation to “{{name}}” declined.',
      more: 'Show more invitations',
    },
  },
  members: {
    title: 'Members',
    description: 'Everyone here can see and edit everything in the budget.',
    you: '{{name}} (you)',
    unknownName: 'Unnamed member',
    role: {
      owner: 'Owner',
      member: 'Member',
    },
    remove: 'Remove',
    removeTitle: 'Remove {{name}}?',
    removeDescription:
      'They lose access to the budget. Their incomes stop counting from the current period; past periods keep them.',
    removed: '{{name}} was removed from the budget.',
    removePrimaryHelp: 'Their income is the primary income: make another income primary first.',
    leave: 'Leave budget',
    leaveTitle: 'Leave “{{name}}”?',
    leaveDescription:
      'You lose access to this budget. Your incomes stop counting from the current period; past periods keep them. To come back, the owner must invite you again.',
    left: 'You left “{{name}}”.',
    leavePrimaryHelp: 'Your income is the primary income: make another income primary first.',
    ownerCannotLeave: 'As the owner, you cannot leave this budget; you can delete it.',
    manageOwnerOnly: 'Only the owner can invite people and remove members.',
  },
  dashboard: {
    period: {
      title: 'Current period',
      allPeriods: 'All periods',
      dayOf: 'Day {{day}} of {{total}}',
      daysLeft_one: '{{count}} day left',
      daysLeft_other: '{{count}} days left',
      incomeTotal: 'Income this period',
      nextPayDay: 'Next pay day',
      nextPayDayOf: '{{name}}',
      nextPayDayOfManual: '{{name}}, date set by hand',
      budgetEnds: 'Budget ends',
      lastPeriodHelp: 'This is the budget’s last period: no new period starts after it.',
    },
    ended: {
      title: 'This budget has ended',
      description: 'Its last period ended on {{date}}. No new periods are created.',
      descriptionNoDate: 'It has no current period, so no new periods are created.',
      seePeriods: 'See past periods',
      settings: 'Budget settings',
    },
  },
  income: {
    endMovedMeanwhile:
      'Nothing was saved: the current period’s end moved meanwhile (for example, an expected pay date was set by hand). The preview below shows the new end: check it, then save again.',
    add: 'Add income',
    addTitle: 'Add an income',
    addDescription: 'A monthly income that counts in the budget’s total.',
    editTitle: 'Edit income',
    editDescription: 'Change the name or the terms of this income.',
    added: 'Income “{{name}}” added.',
    saved: 'Income “{{name}}” saved.',
    edit: 'Edit',
    makePrimary: 'Make primary',
    madePrimary: '“{{name}}” is now the primary income.',
    remove: 'Remove',
    removeTitle: 'Remove “{{name}}”?',
    removeDescription: 'It stops counting in the budget from the current period.',
    removeFromEarlier: 'It stops counting from the period you choose, which changes past totals.',
    correction: {
      label: 'Correct an earlier period',
      removeLabel: 'Remove it from an earlier period',
      help: 'Only to fix a mistake: normally a change applies from the current period.',
      removeFrom: 'Remove from',
      warning:
        'This changes past periods: their income totals are recomputed from the period you choose until the next change already recorded.',
    },
    correctionAppliesFrom:
      'The new terms apply from the period you chose until the next change already recorded: the totals of those periods change.',
    editPrimaryNote:
      'This is the primary income: no period that has started moves. Only the current period’s expected end follows the new pay date (unless you set it by hand), never before today.',
    primaryTitle: 'Make “{{name}}” the primary income?',
    primaryTransfersNote:
      'Only the periods’ boundaries change; nothing about the transfers is checked again. A transfer on a named income keeps that income’s own paydays, whichever income is the main one. A transfer on the main income’s payday stays once per period: it follows this income only through the periods’ starts.',
    primaryDescription:
      'Periods then follow this income’s pay day. Periods that have started do not move.',
    preview: {
      checking: 'Checking when the next salary would be expected…',
      failed: 'Could not check when the next salary would be expected: {{reason}}',
      expected:
        'The next salary would then be expected on {{date}}: the current period would end on {{end}}.',
      manual: 'The current period’s end was set by hand and stays as set: {{end}}.',
      arrivedDue:
        'With this pay day, this month’s salary was due on {{date}}. After saving, you will be asked whether it has already arrived.',
      arrivedDueMoveStart:
        'With this pay day, this period’s own salary was due on {{date}}, a few days after the period started. After saving, you will be asked whether to move the period’s start to that day.',
      lastPeriod: 'The current period, the budget’s last, would end on {{end}}.',
    },
    arrivedPrompt: {
      title: 'Has this salary already arrived?',
      description:
        'With the new pay day, this month’s salary was due on {{date}}. If it has arrived, record it: otherwise the current period runs on until next month’s salary.',
      notYet: 'Not yet',
      keepStart: 'No, keep it',
      moveStartTitle: 'Did this period’s salary arrive on {{date}}?',
      moveStartDescription:
        'With the new pay day, the salary that started this period on {{start}} was due on {{date}}. If it really arrived on {{date}}, move the period’s start to that day: the previous period then ends the day before.',
      moveStart: 'Move the start',
      record: 'Record the pay date',
    },
    savedNextExpected: 'Income “{{name}}” saved. The next salary is now expected on {{date}}.',
    madePrimaryNextExpected:
      '“{{name}}” is now the primary income. The next salary is now expected on {{date}}.',
    removeHistory:
      'If it already counted in a past period, it is kept there and only ended; otherwise it is deleted.',
    removedEnded: '“{{name}}” ended. Past periods still count it.',
    removedDeleted: '“{{name}}” deleted.',
    primary: 'Primary',
    primaryCannotRemove: 'The primary income cannot be removed. Make another income primary first.',
    monthlyTotal: 'Monthly total',
    nextPayDate: 'Next pay date',
    actionsFor: 'Actions for {{name}}',
    empty: 'No incomes yet',
    payDayOption: 'Day {{day}}',
    payDayWithRule: 'Day {{day}}, {{rule}}',
    endedTitle: 'Ended incomes',
    endedHelp: 'They no longer count, but past periods keep them.',
    endedLabel: 'Ended',
    lastCounted: 'Last counted in the period ending {{date}}',
    endedDescription:
      'No current period: incomes can no longer be added or changed. The owner can clear or move the end date in the settings.',
    endedNoAdd: 'The budget has ended.',
    endedNoEdit: 'The budget has ended: terms can no longer change.',
    addAppliesFrom:
      'It counts from the current period, unless you choose an earlier one. Past periods are otherwise unchanged.',
    addAppliesFromCurrent: 'It counts from the current period. Past periods are unchanged.',
    editAppliesFrom:
      'New terms apply from the current period, which started on {{date}}. Past periods keep the terms they had.',
    editAppliesFromNoPeriod: 'New terms apply from the current period. Past periods keep theirs.',
    owner: {
      deletedAccount: 'Deleted account',
      formerMember: 'Former member',
      formerMemberNamed: '{{name}} (former member)',
    },
    fields: {
      name: 'Name',
      namePlaceholder: 'Salary',
      owner: 'Whose income',
      ownerHelp: 'Yours unless you choose another member.',
      amount: 'Amount per month',
      payDay: 'Pay day',
      payDayHelp:
        'The day of the month it is due. 29, 30 or 31 means the last day in shorter months.',
      weekendRule: 'When pay day falls on a weekend',
      weekendRuleHelp: 'Most employers pay on a working day. Choose what yours does.',
      from: 'Counts from',
      fromCurrent: 'The current period',
      fromPeriod: '{{start}} – {{end}}',
      fromHelp: 'Choose an earlier period if this income was already coming in then.',
    },
    weekendRule: {
      nearest: {
        label: 'Nearest working day',
        short: 'nearest working day',
        description: 'Saturday moves to the Friday before, Sunday to the Monday after.',
      },
      previous: {
        label: 'Friday before',
        short: 'Friday before',
        description: 'Saturday and Sunday both move to the Friday before.',
      },
      next: {
        label: 'Monday after',
        short: 'Monday after',
        description: 'Saturday and Sunday both move to the Monday after.',
      },
      none: {
        label: 'Same day',
        short: 'even on weekends',
        description: 'Paid on that day, even on a Saturday or a Sunday.',
      },
    },
  },
  categories: {
    nameTaken:
      'Another category is already called “{{name}}”: both will look the same in lists. You can still save it.',
    add: 'Add category',
    addFirst: 'Add your first category',
    addTitle: 'Add a category',
    addSubTitle: 'Add a subcategory to “{{name}}”',
    addDescription: 'A category of spending, with the amount you plan for it.',
    editTitle: 'Edit category',
    editSubTitle: 'Edit subcategory',
    editDescription: 'Change its name or the amount you plan for it.',
    created: 'Category “{{name}}” added.',
    saved: 'Category “{{name}}” saved.',
    deleted: '“{{name}}” deleted.',
    ended: '“{{name}}” removed from the current period. Past periods keep it.',
    endedKeptVoid: '“{{name}}” removed. Its transactions are kept and still count.',
    endedFromEarlier: '“{{name}}” removed from the period you chose. Earlier periods keep it.',
    removeEarlierLabel: 'Remove it from an earlier period',
    removeEarlier: 'Remove from that period',
    extendAction: 'Count from an earlier period',
    extend: 'Count from that period',
    extendTitle: 'Count “{{name}}” from an earlier period?',
    extendDescription:
      'For older transactions that need this category: it is planned from an earlier period too.',
    extendFrom: 'Counts from',
    extendNone: 'It already counts from the first period of the budget.',
    extendNoneSub:
      'A subcategory never counts before its group: count “{{group}}” from an earlier period first.',
    extendAmountHelp: 'What it expects in the earlier periods. Later amounts stay as they are.',
    extendOutcome:
      'This changes past periods: from {{start}} on, it is planned in them with this amount, so their plans and results change, until the period it started in.',
    extended: '“{{name}}” now counts from the period you chose.',
    restore: 'Restore',
    restoreFor: 'Restore {{name}}',
    restoreTitle: 'Restore “{{name}}”?',
    restoreDescription: 'It is planned again, with the amount below.',
    restoreAmountHelp: 'What it expects from now on.',
    restoreAsCorrection: 'Restore it as if it had never ended',
    restoreEndedBudget: 'The budget has ended: it can only be restored as if it had never ended.',
    restoreOutcome:
      'It is planned again from the current period, which started on {{start}}. The periods between its end and now expect nothing for it: their totals do not change.',
    restoreCorrectionOutcome:
      'This changes past periods: it is planned again from the period it ended in ({{start}} – {{end}}), as if it had never ended, so the plans and results of every period since change.',
    restoreGroupNote: 'Its subcategories stay as they are: restore the ones you want too.',
    restoreThisPeriodOutcome:
      'It was removed from the current period (which started on {{start}}): it is planned again from that period, as if it had never been removed. Earlier periods do not change.',
    restoreGroupFirst: 'Its group “{{group}}” has ended: restore the group first.',
    restored: '“{{name}}” is planned again.',
    restoredElsewhere:
      'Someone else has already restored “{{name}}”: there is nothing left to restore.',
    becameGroup:
      'Someone else added a subcategory, so “{{name}}” is now a group with no amount of its own. The amount you typed ({{amount}}) cannot be saved here: set it on one of its subcategories. You can still rename it.',
    removeFromEarlier:
      'It stops being planned from the period you choose, which changes past periods. If it never counted before that period and has no transactions, it is deleted.',
    edit: 'Edit',
    addSub: 'Add a subcategory',
    moveUp: 'Move up',
    moveDown: 'Move down',
    remove: 'Remove',
    delete: 'Delete',
    end: 'Remove from now on',
    actionsFor: 'Actions for {{name}}',
    listLabel: 'Categories',
    columns: {
      category: 'Category',
      perMonth: 'Per month',
    },
    group: 'Group',
    groupNote: 'Total of its subcategories',
    yearlyNote: '{{amount}} a year',
    path: '{{parent}} › {{name}}',
    otherName: 'Other',
    empty: 'No categories yet',
    emptyDescription:
      'Split your income into categories such as rent, groceries or insurance, each with the amount you plan to spend per month.',
    emptyGroup: 'No subcategories any more: add one to plan and record spending here.',
    endedBudget: 'There is no current period: categories can no longer be added or changed.',
    endedTitle: 'Removed categories',
    endedHelp: 'They are no longer planned, but past periods keep them and their transactions.',
    endedLabel: 'Removed',
    neverPlanned: 'Removed in the period it was added; its transactions still count',
    lastCounted: 'Last planned in the period ending {{date}}',
    groupHasNoAmount:
      'This category has subcategories: its amount is the total of theirs. Change the amounts on the subcategories.',
    firstSub: {
      becomesGroup:
        '“{{name}}” will become a group of subcategories: it no longer has an amount of its own, and its amount becomes the total of its subcategories.',
      moves:
        '“{{name}}” will become a group of subcategories. What it holds now (its amount, {{amount}} a month, and its transactions) moves to a new subcategory “{{other}}”, so no period’s totals change.',
      movesLinks: 'Its subscriptions and debts move to “{{other}}” too.',
    },
    fields: {
      name: 'Name',
      namePlaceholder: 'Groceries',
      subNamePlaceholder: 'Health insurance',
      cadence: 'Amount entered',
      amountMonthly: 'Amount per month',
      amountYearly: 'Amount per year',
      yearlyHelp:
        'A yearly amount counts one twelfth in each period, rounded to the rappen. The budget shows it per month once saved.',
      from: 'Planned from',
      fromHelp: 'Choose an earlier period to record past spending in this category.',
    },
    cadence: {
      monthly: 'Per month',
      yearly: 'Per year',
    },
    addAppliesFrom:
      'It is planned from the current period, unless you choose an earlier one. Past periods are otherwise unchanged.',
    addAppliesFromCurrent: 'It is planned from the current period. Past periods are unchanged.',
    editAppliesFrom:
      'A new amount applies from the current period, which started on {{date}}. Past periods keep the amount they had.',
    correctionAppliesFrom:
      'The amount applies from the period you chose until the next change already recorded: the plans of those periods change.',
    correctionWarning:
      'This changes past periods: what they expected, and so their results, are recomputed from the period you choose until the next change already recorded.',
    removeDeleteTitle: 'Delete “{{name}}”?',
    removeEndTitle: 'Remove “{{name}}” from now on?',
    removeEarlierTitle: 'Remove “{{name}}” from an earlier period?',
    removeDeletes:
      'It has never been planned in a past period and has no transactions, so it is deleted completely.',
    removeEnds:
      'It is no longer planned from the current period (which started on {{date}}). Past periods keep it as it was.',
    removeEndsNoPeriod: 'It is no longer planned. Past periods keep it as it was.',
    removeKeptVoid:
      'It was added in this period, so it is removed from all plans. Because it has transactions, it is kept without an amount, and they keep counting in their periods.',
    removeKeepsTransactions:
      'Its transactions are never deleted: they keep counting in the periods they are dated in.',
    removeWithSubs_one: 'Its subcategory {{names}} goes with it.',
    removeWithSubs_other: 'Its {{count}} subcategories go with it: {{names}}.',
    totals: {
      period: 'Current period: {{start}} – {{end}}',
      income: 'Income',
      expected: 'Planned',
      left: 'Left to assign',
      overAssigned: 'Assigned beyond the income',
      overAssignedHint:
        'You plan more than the income. This is allowed: lower some amounts if you want it to fit.',
    },
    inUse: {
      title: 'Used by',
      description:
        'A subscription or a debt in force uses this category (or one of its subcategories). End it, or move it to another category, before removing the category.',
      subscription: 'Subscription “{{name}}”',
      debt: 'Debt “{{name}}”',
      cannotTitle: '“{{name}}” cannot be removed yet',
    },
  },
  transactions: {
    frozenTitle: 'Payment of an ended debt',
    frozenDescription:
      'Its debt has ended: this payment is kept as it was and can no longer be changed.',
    add: 'Add transaction',
    addTitle: 'Add a transaction',
    addDescription: 'An expense, a refund, or money coming in besides the salaries.',
    editTitle: 'Edit transaction',
    editDescription: 'Change what was recorded. It moves to the period of its date.',
    added: {
      expense: 'Expense of {{amount}} recorded.',
      refund: 'Refund of {{amount}} recorded.',
      extra_income: 'Extra income of {{amount}} recorded.',
    },
    saved: 'Transaction saved.',
    deleted: 'Transaction deleted.',
    savedInARow_one: 'Saved ({{amount}}). Enter the next one, or close when you are done.',
    savedInARow_other:
      '{{count}} saved, the last one {{amount}}. Enter the next one, or close when you are done.',
    saveAndAdd: 'Save and add another',
    done: 'Done',
    edit: 'Edit',
    delete: 'Delete',
    deleteTitle: 'Delete this transaction?',
    deleteDescription: 'The transaction of {{amount}} on {{date}} is deleted for every member.',
    actionsFor: 'Actions for {{what}}, {{amount}} on {{date}}',
    recordedBy: 'by {{name}}',
    loadMore: 'Show older transactions',
    count_one: '{{count}} transaction shown',
    count_other: '{{count}} transactions shown',
    empty: 'No transactions in this period yet',
    emptyHelp: 'Record what you spend as it happens: it is counted against its category at once.',
    emptyFiltered: 'No transactions match these filters',
    emptyFilteredHelp: 'Choose another period, category or kind.',
    endedBudget:
      'The budget has ended: transactions can still be recorded and corrected in its periods, up to its last day.',
    kind: {
      expense: 'Expense',
      refund: 'Refund',
      extra_income: 'Extra income',
    },
    kindShort: {
      expense: 'Expense',
      refund: 'Refund',
      extra_income: 'Extra income',
    },
    kindPlural: {
      expense: 'Expenses',
      refund: 'Refunds',
      extra_income: 'Extra incomes',
    },
    kindHelp: {
      expense: 'Money spent: it counts against its category.',
      refund: 'Money coming back for a purchase: it reduces what was spent in its category.',
      extra_income:
        'Money coming in besides the salaries (a gift, a sale): it adds to the period’s income, in no category.',
    },
    fields: {
      kind: 'Kind',
      amount: 'Amount',
      date: 'Date',
      dateRange: 'From {{min}} to {{max}} (today at the latest).',
      dateRangeEnded: 'From {{min}} to {{max}}, the budget’s last day.',
      keptCategory: '{{name}} (kept: not planned on this date)',
      keptElsewhere:
        '“{{name}}” is not planned in the period of this date: choose a category again, or keep the date in its own period.',
      categoriesFailed: 'The categories for this date could not be loaded: {{reason}}',
      category: 'Category',
      chooseCategory: 'Choose a category',
      noCategories: 'No category on this date',
      noCategoriesHelp:
        'No category was planned in the period of this date. Add one on the Budget page, or choose another date.',
      description: 'Note (optional)',
      descriptionPlaceholder: 'Migros, pharmacy, train ticket…',
      debt: 'Debt payment',
      debtHelp: 'A payment lowers what remains of the debt.',
      noDebt: 'Not a debt payment',
      paymentOn: 'This is a payment on {{name}}',
    },
    filters: {
      label: 'Filter the transactions',
      period: 'Period',
      allPeriods: 'All periods',
      currentPeriod: '{{range}} (current)',
      category: 'Category',
      allCategories: 'All categories',
      wholeGroup: 'All of “{{name}}”',
      ended: '{{name}} (removed)',
      kind: 'Kind',
      allKinds: 'All kinds',
    },
    paymentTitle: 'Record a payment',
    paymentDescription: 'An expense in the debt’s category: it lowers what remains.',
    awaiting: 'Awaiting confirmation',
    awaitingShort: 'To confirm',
    automatic: 'Automatic',
    paymentOnNote: 'Payment on {{name}}',
    automaticOf: 'Automatic charge of {{name}}',
    subscriptionOf: 'Charge of {{name}}',
    chargeAwaitingNote:
      'An automatic charge of “{{name}}”, awaiting confirmation. Editing it does not confirm it.',
    chargeNote: 'An automatic charge of “{{name}}”.',
    subscriptionNote: 'A charge of the subscription “{{name}}”.',
  },
  progress: {
    title: 'Period progress',
    browse: 'Choose the period',
    older: 'Previous period',
    newer: 'Next period',
    backToCurrent: 'Back to the current period',
    income: 'Income',
    expected: 'Planned',
    spent: 'Spent',
    surplus: 'Surplus',
    deficit: 'Deficit',
    leftToAssign: '{{amount}} left to assign',
    overAssigned: '{{amount}} more than the income',
    listLabel: 'Progress per category',
    columns: {
      category: 'Category',
      expected: 'Planned',
      spent: 'Spent',
      result: 'Left',
    },
    overspent: 'Overspent',
    notInForce: 'Not planned',
    notInForceHint:
      'Not planned in this period (removed, or not yet created), but it has transactions dated in it: they count.',
    spentOf: '{{spent}} spent of {{expected}}',
    seeTransactions: 'See the transactions of {{name}} in this period',
    empty: 'Nothing planned or spent in this period',
    emptyHelp: 'Plan your spending in categories on the Budget page, then record transactions.',
    toBudget: 'Go to the budget',
    plannedIncludes: 'Includes {{amount}} for subscriptions',
    plannedIncludesTransfers: 'Includes {{amount}} for planned transfers',
    plannedIncludesUpTo: 'Includes up to {{amount}} for subscriptions',
    plannedIncludesTransfersUpTo: 'Includes up to {{amount}} for planned transfers',
    rowPlannedIncludes: 'The {{expected}} planned include {{amount}} for subscriptions',
    rowPlannedIncludesTransfers:
      'The {{expected}} planned include {{amount}} for planned transfers',
    includes: 'incl. {{amount}} for subscriptions',
    includesTransfers: 'incl. {{amount}} for planned transfers',
    committedSubscriptions: '{{amount}} committed for subscriptions',
    committedTransfers: '{{amount}} committed for planned transfers',
    overCommitted: 'Committed above plan',
    overCommittedSubscriptions:
      'More is committed than planned: {{subscriptions}} for subscriptions, against {{planned}} planned.',
    overCommittedTransfers:
      'More is committed than planned: {{transfers}} for planned transfers, against {{planned}} planned.',
    overCommittedBoth:
      'More is committed than planned: {{subscriptions}} for subscriptions and {{transfers}} for planned transfers, against {{planned}} planned.',
  },
  periods: {
    older: 'Older periods…',
    showOlder: 'Show older periods (the {{count}} newest are listed)',
    description:
      'Each period runs from one salary to the day before the next. Periods that have happened stay as they were.',
    empty: 'No periods yet',
    current: 'Current',
    manualStart: 'Start set by hand',
    manualEnd: 'End set by hand',
    lastPeriod: 'Last period',
    nextExpected: 'Next salary expected on {{date}} (projected).',
    nextExpectedManual: 'Next salary expected on {{date}} (set by hand).',
    lastPeriodNote: 'The budget’s last period: it ends on {{date}}, and no period starts after it.',
    manualCurrentHint:
      'Set by hand: it stays as set when the pay day changes, until you reset it to the projection.',
    manualPastHint:
      'Set by hand with one of the actions. Moving the start back to the schedule clears the mark.',
    unavailable: {
      budgetEnds:
        'Not available: the budget’s end date ({{date}}) leaves no day on which a new period could start.',
      tooSoon:
        'Not available yet: a period lasts at least 7 days, so a new one can start on {{date}} at the earliest.',
      moveStart:
        'Not available: no day keeps both periods 7 to 92 days long, up to today and within the budget’s end date.',
    },
    range: {
      between: 'From {{min}} to {{max}}.',
      outside: 'This date cannot be saved: choose a day from {{min}} to {{max}}.',
    },
    incomeTotal: 'Income',
    actionsFor: 'Actions for the period {{range}}',
    actions: {
      expected: 'The next salary is expected on another day',
      early: 'The salary arrived early',
      notYet: 'This period’s salary has not arrived yet',
      moveStart: 'This period’s salary actually arrived on another day',
      resetExpected: 'Reset the expected date to the projection',
      moveSchedule: 'Move this period’s start back to the schedule',
      moveScheduleTo: 'Move this period’s start back to the schedule ({{date}})',
    },
    dialogs: {
      moveSchedule: {
        title: 'Move this period’s start back to the schedule?',
        description:
          'The boundary between this period and the previous one goes back to the day the pay schedule gives.',
        field: 'Date',
        range: 'No date is needed.',
      },
      expected: {
        title: 'When is the next salary expected?',
        description:
          'For example when a public holiday moves the pay day. The current period ends the day before.',
        field: 'Next salary expected on',
        range: 'After today ({{today}}).',
      },
      resetExpected: {
        title: 'Reset the expected date?',
        description:
          'The current period ends again the day before the next pay date projected from the primary income.',
        field: 'Date',
        range: 'No date is needed.',
      },
      early: {
        title: 'The salary arrived early',
        description:
          'The current period closes and a new one starts on the day the salary arrived.',
        field: 'Day the salary arrived',
        range: 'Today ({{today}}) or earlier.',
      },
      reopen: {
        title: 'This period’s salary has not arrived yet',
        description:
          'This period is merged into the previous one, which is current again until the salary arrives.',
        field: 'Salary now expected on',
        range:
          'After today ({{today}}). Filled in with the next pay day of the schedule: if the salary is only late, enter the day you now expect it.',
      },
      moveStart: {
        title: 'This period’s salary arrived on another day',
        description:
          'Moves the boundary between this period and the previous one to the day the salary really arrived.',
        field: 'Day the salary arrived',
        range: 'Today ({{today}}) or earlier.',
      },
    },
    refused: 'This cannot be saved as it is: {{reason}}',
    thisPeriod: 'This period: {{start}} – {{end}}.',
    reopen: {
      title: 'What was recorded in this period will apply to the reopened period:',
      more_one: 'And 1 more change, not listed.',
      more_other: 'And {{count}} more changes, not listed.',
      nothing: 'Nothing was recorded in this period: only the dates change.',
      required: 'Saving waits for this list: what it shows is what you confirm.',
      kinds: {
        income: 'Income “{{name}}”',
        category: 'Category “{{name}}”',
        other: '“{{name}}”',
        subscription: 'Subscription “{{name}}”',
        debt: 'Debt “{{name}}”',
        account: 'Account “{{name}}”',
        transfer: 'Planned transfer “{{name}}”',
      },
      changes: {
        added: 'added in this period, it will count from the reopened period.',
        ended: 'its end will apply from the reopened period.',
        removed: 'it will disappear: it would never be in force.',
        terms_changed: 'its new terms will apply to the reopened period.',
        made_primary: 'it becomes the primary income from the reopened period.',
        other: 'this change will move to the reopened period.',
        interest_removed:
          'the interest added when this period started goes; it is added again, once, when the period starts again.',
        transaction_removed:
          'a transaction the app recorded for it goes, even one a member edited: its occurrence is no longer planned or moves. A payday’s comes back when that salary is recorded again.',
        transaction_created: 'its transaction is recorded by the app.',
        transaction_moved:
          'one of its transactions moves to its new due date (it is also listed as going and as recorded).',
        mark_unplanned:
          'a tick made by a member is no longer planned: it stays, flagged, and counts again when that salary is recorded again.',
        mark_planned_again: 'a tick made by a member is planned again.',
      },
      categoryChanges: {
        added: 'added in this period, it will be planned from the reopened period.',
        ended: 'its removal will apply from the reopened period.',
        removed:
          'it will disappear: it would never be planned. If it has transactions, it is kept without an amount and they keep counting in the reopened period.',
        terms_changed: 'its new amount will apply to the reopened period.',
      },
      item: '{{kind}}: {{change}}',
      replaces: 'It replaces what the reopened period had for it.',
      todaysTerms:
        'The reopened period follows the terms in force now: a change made “from now” in this period applies to the reopened one too, so a transfer the app recorded there can move or go.',
      datesOnly:
        'Recording this salary again later (“The salary arrived early”) restores the dates only, not these changes.',
      removedKept: {
        subscription:
          'it will disappear: it would never be in force. If it has charges, it is kept without being in force and they keep counting in the reopened period.',
        debt: 'it will disappear: it would never be in force. If it has payments or adjustments, it is kept without being in force, with them.',
      },
    },
    preview: {
      expected:
        'This period will end on {{end}}; the next one starts when the salary arrives on {{date}}.',
      resetExpected: 'The end of this period will follow the projected pay date again.',
      early: 'This period will end on {{end}}, and a new period starts on {{start}}.',
      reopenUntil:
        'The previous period (from {{start}}) is current again and will end on {{end}}; the salary is then expected on {{date}}. This period disappears.',
      moveStart: 'The previous period will end on {{end}}, and this one starts on {{start}}.',
      moveScheduleTo:
        'This period will start on {{start}}, the day the schedule gives, and the previous one end on {{end}}; the “set by hand” mark is cleared.',
    },
    undo: {
      expected: 'To undo: set another date, or reset it to the projection.',
      resetExpected: 'To undo: set the expected date again.',
      early: 'To undo: on the new period, use “This period’s salary has not arrived yet”.',
      reopen: 'To undo the dates: use “The salary arrived early” with {{date}}.',
      moveStart: 'To undo: move it back to {{date}}.',
    },
    saved: 'Periods updated.',
    reset: 'Reset',
    moveBack: 'Move back',
    moveNoChange: 'This period already starts on {{date}}: moving it there changes nothing.',
    moveScheduleRefused:
      'This start cannot go back to the schedule now: the day the pay schedule gives for it is after today, or it would make a period shorter than 7 days or longer than 92. It stays as it is; you can still move it to a day you choose.',
    changedTitle: 'The periods changed while you had this open',
    changedDescription:
      'Someone else acted on them, or your earlier attempt had already gone through, so nothing was changed now. What you see is up to date: check the dates, then act again if it is still needed.',
    resetDone: 'The expected date follows the projection again.',
    progress: 'Progress',
    progressFor: 'See the progress of the period {{range}}',
    endedDescription: 'Its last period ended on {{date}}; no new periods are created.',
  },
  settings: {
    budget: {
      title: 'Budget',
      description: 'Name, end date and deletion of the current budget.',
      rename: 'Rename',
      renamed: 'Budget renamed.',
      endDate: 'End date',
      endsWith:
        'Entered: {{entered}}. The budget ends with the period that contains this date, so its last day is {{date}}.',
      noEndDate: 'No end date: the budget runs indefinitely.',
      endDateHelp:
        'The budget ends with the period that contains this date; its last day is the day before the next salary. Leave empty and save, or clear it, to run indefinitely.',
      saveEndDate: 'Save end date',
      clearEndDate: 'Run indefinitely',
      endDateSet: 'The budget now ends on {{date}}.',
      endDateCleared: 'The budget now runs indefinitely.',
      endDateOwnerOnly: 'Only the owner can change the end date.',
      deleteTitle: 'Delete the budget',
      deleteHelp:
        'Deletes the budget and everything in it, for every member. This cannot be undone.',
      delete: 'Delete budget',
      deleteConfirmTitle: 'Delete “{{name}}”?',
      deleteConfirmDescription:
        'Its incomes, periods and everything else in it are deleted for every member. This cannot be undone.',
      deleted: 'Budget “{{name}}” deleted.',
      alreadyDeleted: 'This budget was already deleted.',
      deleteOwnerOnly: 'Only the owner can delete the budget.',
    },
    sections: {
      label: 'Settings sections',
      budget: 'Budget',
      members: 'Members',
      import: 'Import',
      importHelp:
        'Adding transactions from outside the app: tokens for a program you trust, and what the import remembers for next time.',
      account: 'My account',
      accountHelp: 'Your own name and password. They are the same in every budget you belong to.',
    },
    password: {
      title: 'Password',
      description:
        'Choose a new password of at least {{min}} characters and type it twice. You stay signed in here; other browsers where you are signed in may have to sign in again.',
      submit: 'Change password',
      saved: 'Password changed.',
    },
    account: {
      title: 'Display name',
      description: 'Signed in as {{email}}. Your display name is what the other members see.',
      descriptionNoEmail: 'Your display name is what the other members see.',
      saved: 'Display name saved.',
    },
  },
  catchUp: catchUpEn,
  ui: {
    skipToContent: 'Skip to content',
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

/**
 * The strings loaded with the pages that use them (src/locales/lazy-strings.ts), not with the
 * first load. Typed here so that every key is checked; present at run time once loaded.
 */
interface LazyStrings {
  corrections: typeof correctionsEn
  subscriptions: typeof subscriptionsEn
  charges: typeof chargesEn
  debts: typeof debtsEn
  compare: typeof compareEn
  import: typeof importEn
  accounts: typeof accountsEn
  transfers: typeof transfersEn
  moneyFlow: typeof moneyFlowEn
}
export type LazyKey = keyof LazyStrings

export const en = core as typeof core & LazyStrings

type DeepStringRecord<T> = { [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]> }

/** Shape every locale must match exactly. */
export type Translation = DeepStringRecord<typeof en>
