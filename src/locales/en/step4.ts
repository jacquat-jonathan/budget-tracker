/** Step 4 screens: subscriptions, the charges to confirm, debts. Part of `en`. */

export const subscriptionsEn = {
  add: 'Add subscription',
  addFirst: 'Add your first subscription',
  addTitle: 'Add a subscription',
  addDescription:
    'A recurring charge: it is recorded automatically on each charge date, and you confirm it went through.',
  editTitle: 'Edit subscription',
  editDescription: 'Change its name, price, schedule or category.',
  created: 'Subscription “{{name}}” added.',
  saved: 'Subscription “{{name}}” saved.',
  deleted: 'Subscription “{{name}}” deleted.',
  ended: 'Subscription “{{name}}” ended. Past periods keep it and its charges.',
  fields: {
    name: 'Name',
    namePlaceholder: 'Netflix, gym, phone…',
    price: 'Price per charge',
    cadence: 'Charged',
    category: 'Category',
    categoryHelp:
      'Its charges are expenses in this category, and its monthly cost is committed there.',
    firstCharge: 'First charge date',
    firstChargeHelp:
      'The schedule repeats on this day of the month (the month’s last day when it is shorter). Only dates from the period it counts from are charged.',
    nextCharge: 'New next charge date (optional)',
    nextChargeHelp:
      'Leave empty to keep the schedule. A date after today becomes the next charge; the later ones follow from it.',
    from: 'First period it counts in',
    fromHelp:
      'Normally the current period. An earlier period is a correction: its charges since then are created at once, to confirm.',
    terms: 'Price and schedule',
  },
  cadence: {
    monthly: 'Every month',
    quarterly: 'Every 3 months',
    half_yearly: 'Every 6 months',
    yearly: 'Every year',
  },
  pricePer: {
    monthly: '{{amount}} per month',
    quarterly: '{{amount}} every 3 months',
    half_yearly: '{{amount}} every 6 months',
    yearly: '{{amount}} per year',
  },
  termsWithSchedule: '{{price}}, schedule from {{date}}',
  correctionWarning:
    'This changes past periods: their committed figures and the charges still to come follow the terms you enter, from the period you choose until the next change already recorded. Charges already recorded do not change.',
  correctionAppliesFrom:
    'The new terms apply from the period you chose until the next change already recorded.',
  editAppliesFrom:
    'New terms apply from the current period (from {{date}}); past periods keep theirs. Charges already recorded do not change.',
  addAppliesFrom:
    'It counts from the start of the current period: a charge date already passed in this period is recorded at once, for you to confirm.',
  preview: {
    title: 'Upcoming charges',
    needsDate: 'Enter a date to see the charge dates.',
    failed: 'The charge dates could not be computed for this date.',
    due: 'recorded at once, to confirm',
    new: 'Calculated by the budget from the first charge date and the cadence.',
    date: 'The next charge is on the date you entered; the later ones follow at the cadence.',
    kept: 'The schedule stays as it is.',
    cadence:
      'With a new cadence and no new date, the schedule continues from the next charge, {{date}}.',
    none: 'No charge on these terms before the budget ends.',
    atOnce_one: 'Saving records 1 charge at once, dated in the past, for you to confirm.',
    atOnce_other:
      'Saving records {{count}} charges at once, dated in the past, for you to confirm.',
    atOnceAtLeast_one: 'Saving records at least {{count}} charge at once, dated in the past.',
    atOnceAtLeast_other:
      'Saving records at least {{count}} charges at once, dated in the past, for you to confirm.',
    cadenceKeepsDay: 'Changing only how often keeps the charge day: {{day}}.',
    refused: 'These terms cannot be saved: {{reason}}',
  },
  day: {
    plain_ordinal_one: 'on the {{count}}st',
    plain_ordinal_two: 'on the {{count}}nd',
    plain_ordinal_few: 'on the {{count}}rd',
    plain_ordinal_other: 'on the {{count}}th',
    late_ordinal_one: 'on the {{count}}st, or on the last day of a shorter month',
    late_ordinal_two: 'on the {{count}}nd, or on the last day of a shorter month',
    late_ordinal_few: 'on the {{count}}rd, or on the last day of a shorter month',
    late_ordinal_other: 'on the {{count}}th, or on the last day of a shorter month',
  },
  noFurtherCharge: 'No further charge before the budget ends',
  held: {
    title: 'Waiting since {{date}}',
    why: 'The budget holds 50 000 transactions, the most it can hold: this charge is created once there is room.',
  },
  remove: {
    deleteTitle: 'Delete “{{name}}”?',
    endTitle: 'End “{{name}}”?',
    fromEarlier:
      'It ends from the period you chose: it no longer counts there and no charge is created from then on. The periods before keep it with their charges.',
    deletesFromEarlier:
      'It never counted before the period you chose and has no charge, so it is deleted.',
    refused: 'It cannot be ended from that period: {{reason}}',
    deletes: 'It never counted in a past period and has no charge, so it is deleted.',
    ends: 'It ends from the current period (from {{date}}): no more charges. Past periods keep it.',
    endsNoPeriod: 'It ends: no more charges. Past periods keep it.',
    keepsCharges_one: 'Its charge already recorded stays where it is.',
    keepsCharges_other: 'Its {{count}} charges already recorded stay where they are.',
    stillAwaiting_one: 'One charge still awaits confirmation: it stays on the dashboard.',
    stillAwaiting_other: '{{count}} charges still await confirmation: they stay on the dashboard.',
    earlierLabel: 'End it from an earlier period',
    earlierWarning:
      'This changes past periods: from the period you choose, it no longer counts and no charge is created.',
    delete: 'Delete',
    end: 'End subscription',
    endAction: 'End',
  },
  endedBudget:
    'The budget has ended: a subscription can still be added, changed or ended as a correction from one of its periods, and its charges answered.',
  filterChip: 'Subscription: {{name}}',
  seeTransactions: 'See its transactions',
  empty: 'No subscriptions yet',
  emptyHelp:
    'Add the charges that come back, like streaming, insurance or a phone plan: each is recorded on its date, and you confirm it went through.',
  listLabel: 'Subscriptions in force',
  committedPerMonth: 'Committed per month',
  committedHelp_one: 'One subscription, counted within its category’s plan.',
  committedHelp_other: '{{count}} subscriptions, counted within their categories’ plans.',
  awaiting_one: '1 charge to confirm',
  awaiting_other: '{{count}} charges to confirm',
  nextCharge: 'Next charge',
  monthlyCost: 'Per month',
  actionsFor: 'Actions for {{name}}',
  edit: 'Edit',
  endedTitle_one: 'Ended subscription ({{count}})',
  endedTitle_other: 'Ended subscriptions ({{count}})',
  endedHelp: 'Past periods keep them and their charges.',
  lastCounted: 'Last counted in the period ending {{date}}',
  endedLabel: 'Ended',
  endedElsewhere:
    'It no longer counts from the current period, so these changes cannot be saved. Close this window: it is listed with the ended subscriptions, its charges kept.',
  changedNotShown:
    'Another member changed something this window does not show meanwhile (a name, a payment…). Nothing was saved; what you entered is still here: save again.',
}

export const chargesEn = {
  title_one: 'A charge to confirm',
  title_other: '{{count}} charges to confirm',
  description:
    'These subscription charges were recorded automatically. Did they really go through?',
  what: '{{name}}, {{amount}} on {{date}}',
  wentThrough: 'It went through',
  wentThroughFor: 'It went through: {{what}}',
  didNot: 'It did not go through',
  didNotFor: 'It did not go through: {{what}}',
  dismissTitle: 'Remove this charge?',
  dismissDescription: 'The charge {{what}} is removed from the budget.',
  dismissNever:
    'It will not be created again for its scheduled date, {{date}}. If it is charged later after all, record it as a transaction.',
  dismissConfirm: 'Remove the charge',
  confirmed: 'Charge of {{name}} ({{amount}}) confirmed.',
  dismissed: 'Charge of {{name}} ({{amount}}) removed.',
  answeredElsewhere: 'Another member already answered this charge. The list has been refreshed.',
  scheduledFor: '(scheduled for {{date}})',
  seeAll_one: 'And 1 more: see the transactions',
  seeAll_other: 'And {{count}} more: see the transactions',
  filterChip: 'Awaiting confirmation',
  linkFilters: 'Filters from a link',
  removeFilter: 'Remove the filter “{{what}}”',
  confirmAll: 'All went through',
  confirmAllTitle_one: 'Confirm the charge awaiting?',
  confirmAllTitle_other: 'Confirm all {{count}} charges awaiting?',
  confirmAllOneDay_one: 'The charge dated {{date}} is confirmed: it went through.',
  confirmAllOneDay_other:
    'The {{count}} charges dated {{date}} are confirmed: they all went through.',
  confirmAllRange_one: 'The charge awaiting, dated from {{from}} to {{to}}, is confirmed.',
  confirmAllRange_other:
    'The {{count}} charges awaiting, dated from {{from}} to {{to}}, are confirmed: they all went through. Any that did not, answer one by one instead.',
  confirmAllAction_one: 'Confirm it',
  confirmAllAction_other: 'Confirm all {{count}}',
  confirmedAll_one: '1 charge confirmed.',
  confirmedAll_other: '{{count}} charges confirmed.',
  confirmedAllOther_one:
    '1 charge confirmed, not {{stated}}: another member answered some meanwhile, or new ones came.',
  confirmedAllOther_other:
    '{{count}} charges confirmed, not {{stated}}: another member answered some meanwhile, or new ones came.',
}

export const debtsEn = {
  add: 'Add debt',
  addFirst: 'Add a debt',
  addTitle: 'Add a debt',
  addDescription: 'Money the household owes: a loan, a credit card, a leasing.',
  editTitle: 'Edit debt',
  editDescription: 'Change its name, category, interest rate or planned payment.',
  created: 'Debt “{{name}}” added.',
  saved: 'Debt “{{name}}” saved.',
  deleted: 'Debt “{{name}}” deleted.',
  ended: 'Debt “{{name}}” ended. Its history stays.',
  fields: {
    name: 'Name',
    namePlaceholder: 'Car loan, credit card…',
    category: 'Category of the payments',
    categoryHelp: 'Payments on this debt are expenses in this category.',
    categoryEditHelp:
      'For payments recorded from now on; those already recorded keep their category.',
    principal: 'Amount owed at the start',
    principalHelp: 'What is owed today, or when the period it counts from began.',
    principalLocked:
      'The starting amount can no longer change: the debt has payments, interest or adjustments. Use “Adjust balance” to match your statement.',
    rate: 'Interest rate',
    rateOptional: 'Interest rate per year, % (optional)',
    payment: 'Planned payment per month',
    termsHelp:
      'One twelfth of the yearly rate is added each period. The planned payment gives the expected end.',
    from: 'First period it counts in',
    fromHelp:
      'Normally the current period. An earlier period is a correction: no interest is added for periods that already exist.',
  },
  noInterest: 'No interest',
  ratePerYear: '{{rate}} % per year',
  correctionWarning:
    'This changes the terms recorded for past periods and the projection. Interest already added is never recomputed: fix a wrong amount with “Adjust balance”.',
  correctionAppliesFrom:
    'The new terms apply from the period you chose until the next change already recorded.',
  editAppliesFrom:
    'New terms apply from the current period (from {{date}}); past periods keep theirs.',
  addAppliesFrom: 'It counts from the current period, opened today.',
  remove: {
    deleteTitle: 'Delete “{{name}}”?',
    endTitle: 'End “{{name}}”?',
    fromEarlier:
      'It ends from the period you chose: no more interest and no payment dated from then on. Its history stays.',
    deletesFromEarlier:
      'It never counted before the period you chose and has no payment, interest or adjustment, so it is deleted.',
    refused: 'It cannot be ended from that period: {{reason}}',
    deletes: 'It has no payment, interest or adjustment yet, so it is deleted.',
    ends: 'It ends from the current period (from {{date}}): no more interest and no new payments. Its history stays, and so does its remaining amount ({{amount}}).',
    endsNoPeriod: 'It ends: no more interest and no new payments. Its history stays.',
    earlierLabel: 'End it from an earlier period',
    earlierWarning:
      'This changes past periods: from the period you choose, no interest is added and no payment can be dated.',
    delete: 'Delete',
    end: 'End debt',
    endAction: 'End',
  },
  adjust: {
    action: 'Adjust balance',
    title: 'Adjust the balance',
    description: 'Make the remaining amount match your bank statement.',
    now: '“{{name}}”: {{amount}} remaining now.',
    balance: 'Balance on your statement',
    balanceHelp: 'What the bank says you still owe.',
    date: 'Date of the statement',
    note: 'Note (optional)',
    notePlaceholder: 'Statement of 30 November',
    difference:
      'The budget stores the difference between this balance and the remaining amount as an adjustment, so payments recorded meanwhile stay counted.',
    save: 'Adjust',
    done: 'Balance adjusted to {{amount}}.',
    deleted: 'Adjustment deleted.',
    deleteTitle: 'Delete this adjustment?',
    deleteDescription:
      'The adjustment of {{amount}} on {{date}} is deleted: the remaining amount changes by as much.',
    delete: 'Delete adjustment',
    deleteFor: 'Delete the adjustment of {{amount}} on {{date}}',
    dateRange: 'From {{min}}, when the debt was opened, to {{max}}.',
  },
  payoff: {
    none: 'No projection: the debt has ended.',
    paidOff: 'Paid off',
    never: 'Never ends at this payment',
    neverHelp: 'The planned payment does not cover the interest. Raise it to see an end date.',
    neverNoPayment: 'Plan a monthly payment to see when it will be paid off.',
    ends: 'Ends around {{month}}',
    endsNoDate: 'Ends',
    paymentsLeft_one: '1 payment left',
    paymentsLeft_other: '{{count}} payments left',
    estimate: 'An estimate: future pay dates follow the primary income’s schedule.',
    overpaid: 'Paid off · overpaid by {{amount}}',
    budgetEnded: 'No projection: the budget has ended.',
    unknown: 'No projection yet.',
    noPayment: 'No planned payment',
    afterBudgetEnd: 'This is after the budget ends.',
  },
  endedBudget:
    'The budget has ended: a debt can still be added, changed or ended as a correction from one of its periods, and payments recorded within its periods.',
  filterChip: 'Debt: {{name}}',
  endedNoEdit: 'This debt has ended: it can no longer be changed.',
  seeTransactions: 'See its payments',
  frozenPayment:
    'This is a payment on “{{name}}”, which has ended: it can no longer be changed or deleted.',
  frozenView: 'View',
  frozenDelete: 'Its debt has ended: it stays as it is.',
  endedErrors: {
    payment: 'This debt has ended: it takes no new payment.',
    frozenPayment:
      'This payment’s debt has ended: the payment can no longer be changed or deleted.',
    adjust: 'This debt has ended: its balance can no longer be adjusted.',
    deleteAdjustment: 'This debt has ended: its adjustments can no longer be deleted.',
    edit: 'This debt has ended: it can no longer be changed.',
  },
  payment: {
    dateRange: 'From {{min}}, when “{{name}}” was opened, to {{max}}.',
    opened: 'Payments on “{{name}}” can be dated from {{date}}, the day it was opened.',
    notInForce: '“{{name}}” was not in force on this date: choose another date, or no debt.',
    categoryFollows: 'Payments on “{{name}}” are in the category of its terms on that date.',
  },
  totalRemaining_one: 'Still owed on 1 debt',
  totalRemaining_other: 'Still owed on {{count}} debts',
  empty: 'No debts',
  emptyHelp:
    'Add a loan or a credit to follow it down to zero: payments lower it, interest is added each period.',
  listLabel: 'Debts in force',
  endedTitle: 'Ended debts',
  endedHelp: 'Their history and remaining amount stay.',
  remainingAmount: '{{amount}} remaining',
  remaining: 'Remaining',
  paidShare: '{{percent}} % paid off',
  paidSoFar: '{{amount}} paid · {{percent}} %',
  backToList: 'All debts',
  notFound: 'This debt does not exist',
  notFoundHelp: 'It may have been deleted by another member.',
  recordPayment: 'Record a payment',
  actionsFor: 'More actions for {{name}}',
  edit: 'Edit',
  endedTitleOne: 'This debt has ended',
  endedOneHelp:
    'Its history stays. No interest is added, no new payment can be recorded, and its payments and adjustments can no longer be changed or deleted.',
  paid: 'Paid',
  interestAdded: 'Interest added',
  adjustments: 'Adjustments',
  principalWas: '{{amount}} owed when it was opened on {{date}}.',
  projection: 'Expected end',
  chart: {
    title: 'Evolution',
    description: 'The remaining amount after each event.',
    label_one: 'Remaining amount over time, 1 event; now {{amount}}. The table below lists it.',
    label_other:
      'Remaining amount over time, {{count}} events; now {{amount}}. The table below lists them.',
    onlyOpened:
      'Only the opening so far: {{amount}} owed since {{date}}. The chart appears with the first payment or interest.',
    nothing: 'Nothing recorded yet.',
    today: 'Today (no new event)',
    marksNote:
      'With this many events, only balance adjustments are marked; point at the line for every event of a date, or read the history below.',
    labelCapped:
      'Remaining amount over time, the first {{count, number}} events, up to {{date}}. The table below lists them.',
    capped:
      'The chart shows the first {{count, number}} events, up to {{date}}: the history is longer. The table below goes on to the latest.',
  },
  history: {
    title: 'History',
    label: 'History of {{name}}, oldest first',
    entry: 'Event',
    amount: 'Amount',
    balance: 'Remaining',
    kind: {
      opened: 'Opened',
      interest: 'Interest',
      adjustment: 'Adjustment',
      payment: 'Payment',
    },
    see: 'See',
    seePayment: 'See the payment of {{amount}} on {{date}} among the transactions',
    showMore: 'Show {{count}} more',
    shownSoFar_one: 'The latest event shown; there are older ones.',
    shownSoFar_other: 'The latest {{count}} events shown; there are older ones.',
    shownAll_one: '1 event.',
    shownAll_other: 'All {{count}} events, newest first.',
    loadFailed: 'The next events could not be read. Try again.',
  },
  overpaid: 'Overpaid',
  overpaidHint: 'More was paid than was owed.',
  overpaidAmount: '{{amount}} overpaid',
  nothingOwed: 'Nothing left to pay on your debts',
  interestHint: 'Added at the start of each period, from the rate.',
  adjustmentsHint: 'Changes you made to match the bank statement (“Adjust balance”).',
  endedElsewhere:
    'It ended from the current period, so these changes cannot be saved. Close this window: its history and remaining amount stay.',
  changedNotShown:
    'Another member changed something this window does not show meanwhile (a name, a payment…). Nothing was saved; what you entered is still here: save again.',
}

export const correctionsEn = {
  period: 'Correct from the period',
  showsPeriodTerms:
    'The fields below now show what was in force in that period. Change only what was wrong: what you leave as it is stays as it was.',
  reachUntil:
    'The correction applies from {{start}} up to the period ending {{end}}; from {{next}}, the terms recorded later stay.',
  reachOn: 'The correction applies from {{start}} on.',
  notInForce:
    'It did not exist in that period (not yet, or no longer), so there is nothing to correct there. Choose another period.',
  budgetEnded:
    'The budget has ended: a change applies only as a correction from one of its periods.',
  changedNotShown:
    'Another member changed something this window does not show meanwhile (which income is the primary one, a first subcategory…). Nothing was saved; what you entered is still here: save again.',
}

export const catchUpEn = {
  title: 'Catching up on the time since your last visit…',
  help: 'The budget is creating the periods, charges and interest since then. This can take a few seconds.',
}
