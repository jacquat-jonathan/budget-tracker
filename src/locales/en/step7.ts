/** Step 7 screens: accounts, planned transfers, the checklist, the money flow. Part of `en`. */

export const accountsEn = {
  add: 'Add account',
  addFirst: 'Add your first account',
  addTitle: 'Add an account',
  addDescription: 'A place your household keeps money: a salary account, savings, a third pillar…',
  editTitle: 'Edit account',
  editDescription: 'Its name, kind, bank and whose it is. Changes show in every period.',
  created: 'Account “{{name}}” added.',
  saved: 'Account “{{name}}” saved.',
  deleted: 'Account “{{name}}” deleted.',
  closed: 'Account “{{name}}” closed. Past periods keep it.',
  changedNotShown:
    'Someone changed this account meanwhile in a way this window does not show. Check it and save again.',
  addNote:
    'It counts from the current period. Balances are not tracked: the app only plans what moves.',
  addNoteEnded: 'The budget has ended: an account can only be added to one of its periods.',
  editNote: 'A new name, kind, bank or holder shows in every period, past ones included.',
  listLabel: 'Accounts',
  closedTitle_one: '{{count}} closed account',
  closedTitle_other: '{{count}} closed accounts',
  closedHelp: 'Past periods keep closed accounts, with their transfers and flows.',
  closedFrom: 'Closed from {{date}}',
  empty: 'No accounts yet',
  emptyHelp:
    'Accounts are optional. Add them to plan the transfers after payday and to see your money flow: the rest of the app works without them.',
  suggestions: 'Most households start with a salary account and a savings account.',
  shared: 'Shared',
  formerMember: '{{name}} (former member)',
  inUse: 'In use',
  inUseHelp: 'An income or a planned transfer uses it.',
  editFor: 'Edit {{name}}',
  actionsFor: 'Actions for {{name}}',
  edit: 'Edit',
  closeAction: 'Close account',
  deleteAction: 'Delete account',
  fields: {
    name: 'Name',
    namePlaceholder: 'Salary account, savings, joint account…',
    kind: 'Kind',
    kindPlaceholder: 'Choose a kind',
    kindHelp:
      'In the money flow, what stays on an everyday account (current, cash, credit card, other) is spendable; what stays on a savings, third pillar, tax reserve or investment account is set aside.',
    bankLabel: 'Bank',
    bankLabelOptional: 'Bank (optional)',
    bankLabelPlaceholder: 'The bank or a short note',
    holder: 'Whose account',
    holderHelp: 'A member’s own account, or one the household shares.',
    from: 'Counts from',
    fromHelp: 'An earlier period, to plan its transfers too.',
  },
  kinds: {
    current: 'Current or salary account',
    savings: 'Savings',
    third_pillar: 'Third pillar',
    tax_reserve: 'Tax reserve',
    investment: 'Investment',
    cash: 'Cash',
    credit_card: 'Credit card',
    other: 'Other',
  },
  close: {
    title: 'Close “{{name}}”?',
    deleteTitle: 'Delete “{{name}}”?',
    ends: 'It closes from the period that started on {{date}}. Earlier periods keep it, with their transfers and flows.',
    endsNoPeriod: 'It closes from the period you choose. Earlier periods keep it.',
    endsFromEarlier:
      'It closes from the period you chose. Earlier periods keep it; the periods after change.',
    deletes: 'Nothing ever used it: it is deleted.',
    inUse: 'It cannot be closed yet: these use it from then on.',
    changeFirst: 'Choose another account for them, or end them, then close this one.',
    usedBy: {
      income: 'Income “{{name}}”',
      transfer: 'Planned transfer “{{name}}”',
    },
    refused: 'It cannot be closed: {{reason}}',
    earlierLabel: 'Close it from an earlier period',
    earlierWarning: 'This changes the flows of the periods you correct.',
    from: 'Closed from',
    confirm: 'Close account',
    delete: 'Delete account',
  },
  income: {
    field: 'Paid into',
    fieldHelp: 'The account this income arrives on: it is where the money flow starts.',
    none: 'Not assigned',
    viewLabel: 'Paid into',
  },
}

export const transfersEn = {
  filterChip: 'Transfer: {{name}} ({{from}} to {{to}})',
  filterGone: {
    title: 'This transfer is not in this budget',
    body: 'It was deleted meanwhile, or the address names another budget’s transfer. Nothing is listed for it.',
    back: 'Show all transactions',
  },
  filterEmpty: {
    uncountedTitle: '“{{name}}” records no transactions',
    uncounted:
      'This transfer is not counted as spending (it is linked to no category), so marking it done records no transaction. It shows in the checklist and the money flow.',
    noneTitle: 'No transactions of “{{name}}” here',
    nonePeriod: 'None was recorded for it in this period. Choose all periods to see the others.',
  },
  itsTransactions: 'Its transactions',
  itsTransactionsFor: 'Its transactions: {{name}}',
  transaction: {
    badge: 'Transfer',
    of: 'Planned transfer “{{name}}”',
    ofOccurrence: 'Planned transfer “{{name}}”, {{occurrence}}',
    note: 'Recorded for the planned transfer “{{name}}”: its amount, date, category and note can change here; it stays an expense of that transfer.',
    deleteNote:
      'It was recorded for the planned transfer “{{name}}”: deleting it says the transfer did not happen (a standing order is then not done, a manual one to do again).',
  },
  quoted: '“{{name}}”',
  followingIncome_one:
    'The planned transfer {{names}} follows this payday: what was recorded for it stays, and from its next occurrence it follows the main income.',
  followingIncome_other:
    'The planned transfers {{names}} follow this payday: what was recorded for them stays, and from their next occurrence they follow the main income.',
  counts: {
    title: 'Planned transfers',
    removed_one: '{{count}} transaction the app recorded for a transfer is removed.',
    removed_other: '{{count}} transactions the app recorded for transfers are removed.',
    created_one: '{{count}} transaction of a standing order is recorded.',
    created_other: '{{count}} transactions of standing orders are recorded.',
    movedKeeps:
      'Only what the app recorded by itself, and nobody changed since, moves to its new due date. A tick, a transfer made manual and a transaction a member edited stay exactly as they are.',
    movedOnly_one:
      '{{count}} transaction the app recorded moves to its new due date: removed on the old date, recorded again on the new one.',
    movedOnly_other:
      '{{count}} transactions the app recorded move to their new due dates: removed on the old dates, recorded again on the new ones.',
    movedOf_one:
      'Of these, {{count}} is one transaction moved to its new due date: it counts once as removed and once as recorded.',
    movedOf_other:
      'Of these, {{count}} are transactions moved to their new due dates: each counts once as removed and once as recorded.',
    editedGoes:
      'A transaction a member edited goes too when its occurrence itself goes; one whose date only moves stays where the member left it.',
    unplanned_one:
      '{{count}} tick made by a member is no longer planned: it stays, flagged, until undone.',
    unplanned_other:
      '{{count}} ticks made by members are no longer planned: they stay, flagged, until undone.',
  },
  card: {
    failedTitle: 'Transfers to make',
    failed: 'They could not be counted just now. The checklist shows them.',
    title_one: '{{count}} transfer to make',
    title_other: '{{count}} transfers to make',
    description: 'The ones you do yourself, this period and the one before.',
    overdue_one: '{{count}} of them is overdue.',
    overdue_other: '{{count}} of them are overdue.',
    open: 'Open the checklist',
  },
  add: 'Plan a transfer',
  addFirst: 'Plan your first transfer',
  addTitle: 'Plan a transfer',
  addDescription:
    'Money that moves from one of your accounts to another on a schedule: after payday or on a fixed day.',
  editTitle: 'Edit transfer',
  editDescription: 'New terms apply from now; past periods keep theirs.',
  created: 'Transfer “{{name}}” planned.',
  saved: 'Transfer “{{name}}” saved.',
  deleted: 'Transfer “{{name}}” deleted.',
  ended: 'Transfer “{{name}}” ended. What was recorded stays.',
  changedNotShown:
    'Someone changed this transfer meanwhile in a way this window does not show. Check it and save again.',
  endedElsewhere: 'Someone ended this transfer meanwhile: nothing can be changed from now.',
  endedBudget: 'The budget has ended: transfers can only be changed in its periods.',
  correctionWarning: 'This rewrites the plan of the periods you correct, and their checklists.',
  correctionAppliesFrom:
    'The new terms apply from the period you chose until its next change. The preview says first what changes.',
  editAppliesFrom:
    '“From now” means from the start of the current period, {{date}}, not from today: this period’s occurrences follow the new terms too. Members’ ticks stay; what the app recorded by itself can move or go, as the preview says. Past periods keep their terms.',
  addFromToday: 'It plans from today.',
  addRecordsPast:
    'It plans from the period you chose: what was due since then is listed, and standing orders linked to a category are recorded at once.',
  needAccounts: 'Add your accounts first',
  needAccountsNone:
    'A transfer moves money between two of your accounts. Accounts are optional: the rest of the app works without them.',
  needAccountsOne: 'You have one account. A transfer moves money between two: add another one.',
  goToAccounts: 'Go to accounts',
  plannedTitle: 'Planned transfers',
  empty: 'No planned transfers yet',
  emptyHelp:
    'A standing order to savings on payday, a yearly third-pillar payment, the share for the joint account…',
  to: 'to',
  fromTo: '{{from}} to {{to}}',
  countsIn: 'Counts as spending in {{category}}',
  noCategory: 'Not counted as spending',
  followsPrimary: 'Its income has ended: it now follows the main income’s payday.',
  nextDue: 'Next due, not yet recorded',
  noNextDue: 'None planned',
  today: 'today',
  monthlyShare: 'Per month',
  actionsFor: 'Actions for {{name}}',
  edit: 'Edit',
  endedTitle_one: '{{count}} ended transfer',
  endedTitle_other: '{{count}} ended transfers',
  endedHelp: 'Past periods keep ended transfers, with what was recorded for them.',
  lastCounted: 'last counted in the period ending {{date}}',
  errors: {
    toCategorise: 'A transfer cannot count in “to categorise”: choose another category.',
  },
  fields: {
    name: 'Name',
    namePlaceholder: 'Savings, third pillar, joint account…',
    accounts: 'Accounts',
    from: 'From',
    to: 'To',
    accountPlaceholder: 'Choose an account',
    amount: 'Amount',
    amountEach: 'Amount each time',
    amountPer: {
      quarterly: 'Amount every three months',
      yearly: 'Amount once a year',
    },
    mode: 'How it is done',
    when: 'When',
    offset: 'Day',
    namedIncome: 'Which income',
    namedIncomeHelp: 'Its own pay day and weekend rule give the dates.',
    cadence: 'How often',
    day: 'Day of the month',
    nextDue: 'Next due date',
    nextDueHelp: 'It repeats on this day; today or later.',
    newNextDue: 'New next due date (optional)',
    newNextDueHelp: 'Leave empty to keep the schedule.',
    linked: 'Count it as spending in a category',
    linkedHelp:
      'For savings, a third pillar or taxes: when it is done, its transaction is recorded there, so you do not enter it twice.',
    category: 'Category',
    categoryHelp: 'Its planned amount is committed in this category every period.',
    past: 'It already ran: record what happened since…',
    pastHelp: 'Leave this off to start from today. On, what was due since then is planned too.',
    pastFrom: 'Since',
    thisPeriod: 'The start of this period',
  },
  mode: {
    automatic: 'Standing order',
    manual: 'I do it myself',
    automaticShort: 'Standing order',
    manualShort: 'Manual',
    automaticHelp: 'The bank does it: it counts as done on its due date, nothing to tick off.',
    manualHelp: 'You make it and tick it off in the checklist.',
  },
  cadence: {
    monthly: 'Every month',
    quarterly: 'Every three months',
    yearly: 'Once a year',
  },
  when: {
    payday: 'On payday',
    after_one: '{{count}} day after payday',
    after_other: '{{count}} days after payday',
    ofIncome: '{{when}} (“{{income}}”)',
    ofMain: '{{when}} (main income)',
    monthly: 'Every month {{day}}',
    quarterly: 'Every three months {{day}}',
    yearly: 'Once a year {{day}}',
    yearlyOn: 'Once a year on {{date}}',
    weekend: {
      previous: '{{when}}, the working day before at weekends',
      next: '{{when}}, the next working day at weekends',
      nearest: '{{when}}, the nearest working day at weekends',
    },
  },
  amountPer: {
    quarterly: '{{amount}} every three months',
    yearly: '{{amount}} once a year',
  },
  preview: {
    title: 'What saving does',
    needsInput: 'Choose the accounts and an amount to see the due dates.',
    firstDateInPast:
      'Nothing to show yet: the next due date is before today. Choose today or a later date, or tick “It already ran” to record what happened.',
    none: 'No occurrence on these terms in the coming periods.',
    atOnceRow: 'recorded now',
    projected: 'estimated',
    followsPrimary: 'Its chosen income is not in force there: it follows the main income’s payday.',
    createdAtOnce_one: 'Saving records {{count}} transaction at once: its date has passed.',
    createdAtOnce_other: 'Saving records {{count}} transactions at once: their dates have passed.',
    nothingAtOnce: 'Nothing is recorded at once.',
    nothingBeforeToday: 'Nothing dated before today is recorded.',
    transactionsRemoved_one:
      'It removes {{count}} transaction the app recorded by itself: its date is no longer planned, or its due date moves.',
    transactionsRemoved_other:
      'It removes {{count}} transactions the app recorded by itself: their dates are no longer planned, or their due dates move.',
    alreadyRecorded: 'already recorded, stays as it is',
    movedOnly_one:
      'It moves {{count}} transaction the app recorded by itself to its new due date: removed on the old date, recorded again on the new one.',
    movedOnly_other:
      'It moves {{count}} transactions the app recorded by itself to their new due dates: removed on the old dates, recorded again on the new ones.',
    movedOf_one:
      'Of these, {{count}} is one transaction moved to its new due date: it counts once as removed and once as recorded.',
    movedOf_other:
      'Of these, {{count}} are transactions moved to their new due dates: each counts once as removed and once as recorded.',
    editedGoes:
      'A transaction a member edited goes too when its occurrence itself goes; one whose date only moves stays where the member left it.',
    oldToDosDropped_one:
      '{{count}} to-do of this period under the old schedule is not ticked off: it is dropped, and only the new schedule’s occurrences remain.',
    oldToDosDropped_other:
      '{{count}} to-dos of this period under the old schedule are not ticked off: they are dropped, and only the new schedule’s occurrences remain.',
    marksUnplanned_one:
      '{{count}} tick a member made is no longer planned: it stays in its checklist, flagged, until undone.',
    marksUnplanned_other:
      '{{count}} ticks members made are no longer planned: they stay in their checklists, flagged, until undone.',
  },
  end: {
    title: 'End “{{name}}”?',
    deleteTitle: 'Delete “{{name}}”?',
    refused: 'It cannot end now: {{reason}}',
    deletes: 'It never counted and nothing was recorded for it: it is deleted.',
    ends: 'No more occurrences from the period that started on {{date}}.',
    endsNoPeriod: 'No more occurrences from the period you choose.',
    fromEarlier: 'No more occurrences from the period you chose; the periods after it change.',
    removes_one: 'It removes {{count}} planned occurrence that nobody ticked off.',
    removes_other: 'It removes {{count}} planned occurrences that nobody ticked off.',
    keepsMarks_one:
      '{{count}} tick ({{transactions}} with its transaction) stays, listed as ended in its checklist.',
    keepsMarks_other:
      '{{count}} ticks ({{transactions}} with their transactions) stay, listed as ended in their checklists.',
    recordedStays: 'What was ticked off and recorded stays; earlier periods keep it.',
    earlierLabel: 'End it from an earlier period',
    earlierWarning: 'This rewrites the plan and the checklists of the periods you correct.',
    from: 'Ended from',
    confirm: 'End transfer',
    delete: 'Delete transfer',
  },
  views: {
    label: 'Transfers views',
    planned: 'Planned transfers ({{count}})',
  },
  occurrence: {
    period: 'for the period {{start}} to {{end}}',
    periodOther: 'kept from the period {{start}} to {{end}}, not this one',
    periodGone: 'kept from the period a reopen merged into this one, not this period’s own',
    incomePayday: 'on the payday of “{{income}}”, {{date}}',
    incomePaydayOn: 'on the payday of “{{income}}”',
    incomePaydayAfter_one: '{{count}} day after the payday of “{{income}}” ({{date}})',
    incomePaydayAfter_other: '{{count}} days after the payday of “{{income}}” ({{date}})',
    incomePaydayUnnamed: 'on the payday of an income, {{date}}',
    incomePaydayDropped: 'on a payday of an income this transfer no longer follows, {{date}}',
    incomePaydayDroppedOn: 'on a payday of an income this transfer no longer follows',
    incomePaydayDroppedAfter_one:
      '{{count}} day after a payday of an income this transfer no longer follows ({{date}})',
    incomePaydayDroppedAfter_other:
      '{{count}} days after a payday of an income this transfer no longer follows ({{date}})',
    fixedDay: 'fixed day {{date}}',
    fixedDayMoved: 'fixed day {{date}}, moved off the weekend',
  },
  kinds: {
    label: 'When it runs',
    period: 'On the main income’s payday',
    periodHelp: 'Once per period, on the day the main salary really arrives.',
    income_payday: 'On a named income’s payday',
    income_paydayHelp:
      'On each scheduled pay date of the income you name, even when it is not the main income and whenever its salary is actually recorded.',
    fixed_day: 'On a fixed day of the month',
    fixed_dayHelp: 'On the same day every month, three months or year, with a rule for weekends.',
    explain:
      'The main income’s payday follows the day the main salary really arrives, whoever the main income is; a named income’s payday follows that income’s own calendar. On the main income’s payday it runs once per period, so a period stretched by a later salary can skip a calendar month: name the income for a monthly rhythm.',
    exampleTitle: 'An example',
    example:
      'Ann, paid on the 25th, is the main income; Ben is paid on the 10th. On 12 December Ben becomes the main income, so the period that started on 25 November runs to 9 January. On the main income’s payday: 25 Nov, 10 Jan, 10 Feb, none in December. On Ann’s payday: 25 Nov, 25 Dec, 25 Jan. On Ben’s payday: 10 Nov, 10 Dec, 10 Jan, 10 Feb.',
  },
  weekendRule: {
    label: 'On a Saturday or Sunday',
    none: 'On that day all the same',
    previous: 'The working day before',
    next: 'The next working day',
    nearest: 'The nearest working day',
    help: {
      none: 'It is due on that day, even when it falls on a Saturday or a Sunday.',
      previous:
        'A Saturday or a Sunday goes to the Friday before. The checklist still shows the scheduled date; only the due date moves.',
      next: 'A Saturday or a Sunday goes to the Monday after. The checklist still shows the scheduled date; only the due date moves.',
      nearest:
        'A Saturday goes to the Friday, a Sunday to the Monday. The checklist still shows the scheduled date; only the due date moves.',
    },
  },
  checklist: {
    title: 'Checklist',
    help: 'The transfers of a period: tick off the ones you make yourself.',
    period: 'Period',
    currentPeriod: 'This period ({{start}} to {{end}})',
    unknownPeriod: 'The period in the link is not one of this budget: here is the current one.',
    empty: 'Nothing is planned in this period.',
    allSettled: 'Nothing left to do in this period.',
    settledLabel: 'Done and settled',
    settled_one: '{{count}} done or settled',
    settled_other: '{{count}} done or settled',
    previousOpen_one:
      '{{count}} transfer is still to do in the period before ({{start}} to {{end}}).',
    previousOpen_other:
      '{{count}} transfers are still to do in the period before ({{start}} to {{end}}).',
    previousOpenLink: 'Open that checklist',
    more_one: '… and {{count}} more tick not listed',
    more_other: '… and {{count}} more ticks not listed',
    due: 'due {{date}}',
    noDue: 'no longer due',
    planned: 'planned {{amount}}',
    ended: 'ended',
    unplannedHelp:
      'Its date is no longer planned (the schedule or a payday moved). It stays until you undo it.',
    unplannedEnded: 'The transfer has ended. This tick stays until you undo it.',
    unplannedTransaction: 'Undo removes it with its transaction.',
    unplannedTransactionIn: 'Undo removes it with its transaction in {{category}}.',
    heldBackHelp:
      'The budget holds the most transactions it can: it is recorded, dated its due date, once there is room.',
    done: 'Done',
    doneFor: 'Mark “{{name}}” as done',
    skip: 'Skip',
    skipFor: 'Skip “{{name}}” this time',
    notDone: 'Did not happen',
    notDoneFor: '“{{name}}” did not happen',
    undo: 'Undo',
    undoFor: 'Undo the tick of “{{name}}”',
    doneTitle: 'Done: “{{name}}”',
    doneDescription: '{{amount}} planned, due {{date}}.',
    doneOn: 'Done on',
    doneOnHelp: 'Today or earlier.',
    doneOnLinked: 'Its transaction in {{category}} is dated this day. Today or earlier.',
    amountMoved: 'Amount moved',
    status: {
      toDo: 'To do',
      overdue: 'Overdue',
      upcoming: 'Standing order: will be assumed done on its due date',
      done: 'Done on {{date}}',
      doneBy: 'Done on {{date}} by {{name}}',
      assumed: 'Done by standing order on {{date}}',
      skipped: 'Skipped',
      skippedBy: 'Skipped by {{name}}',
      notDone: 'Did not happen',
      notDoneBy: 'Did not happen (said by {{name}})',
      heldBack: 'Waiting for room in the budget',
      unplanned: 'No longer planned',
      unplannedWas: '{{state}} · no longer planned',
    },
    changedElsewhere:
      'Someone ticked or changed this transfer meanwhile: the checklist now shows where it stands.',
    listChanged:
      'This period’s checklist changed meanwhile: it is shown again as it now stands. Check the row and try again.',
    nameWithKind: '{{name}}, {{kind}}',
    markedDone: '“{{name}}” done: {{amount}}.',
    markedSkipped: '“{{name}}” skipped for this time.',
    markedNotDone: '“{{name}}” marked as not done.',
    undone: '“{{name}}” is back as it was planned.',
    undoneUnplanned: '“{{name}}” is no longer planned here: its tick is removed.',
    undoneUnplannedWithTransaction:
      '“{{name}}” is no longer planned here: its tick is removed, with its transaction.',
  },
}

export const moneyFlowEn = {
  period: 'Period',
  currentPeriod: '{{label}} (current)',
  notAssigned: 'Not assigned',
  notAssignedHelp:
    '“Not assigned”: incomes that name no account yet. Say in the income where it arrives.',
  bandIncome: '{{name}}: {{amount}}',
  bandTransfer: '{{name}}: {{amount}} a month',
  basis: {
    label: 'Planned or actual',
    planned: 'Planned',
    actual: 'Actual',
  },
  heading: {
    planned: 'Planned money flow of the period {{period}}',
    actual: 'What actually happened in the period {{period}}',
  },
  intro: {
    planned:
      'Where the period’s incomes go by the plan: into the accounts, the transfers between them, what is set aside, and the spending planned in each category group.',
    actual:
      'The same incomes and transfers, with what the period’s transactions actually spent in each category group.',
  },
  running:
    'This period is still running until {{end}}: what is spent so far, not its final figures.',
  diagramTitle: {
    planned:
      'Planned money flow of the period {{period}}: incomes {{incomes}}; set aside {{setAside}}; spendable {{spendable}}, of which {{spending}} is planned for spending and {{rest}} is not planned. Every figure is in the tables below.',
    actual:
      'Money flow of the period {{period}}, as it happened: incomes {{incomes}}; set aside {{setAside}}; spendable {{spendable}}, of which {{spending}} was spent and {{rest}} is left. Every figure is in the tables below.',
  },
  noIncome:
    'No income counts in this period, so nothing flows yet: the spending below is all there is.',
  empty: 'Nothing in this period yet',
  emptyHelp:
    'The money flow starts with the incomes in force in a period and ends with what is planned or spent in its categories.',
  tiles: {
    incomes: 'Incomes',
    setAside: 'Set aside',
    setAsideHelp: 'Stays on savings, pillar, tax and investment accounts',
    spending: { planned: 'Planned spending', actual: 'Spent' },
    ofSpendable: 'Out of {{amount}} spendable',
    rest: { planned: 'Not planned', actual: 'Left' },
    restHelp: {
      planned: 'Spendable, with no spending planned for it',
      actual: 'Spendable and not spent',
    },
    short: {
      planned: 'More spending is planned than is spendable.',
      actual: 'More was spent than was spendable.',
    },
    setAsideNegative:
      'The savings, pillar, tax and investment accounts send on more than they receive.',
  },
  reconcile: {
    incomes:
      'The other pages show incomes of {{summary}}: this page’s {{flow}} plus {{extra}} of extra income, which is not part of the plan.',
    planned:
      'The other pages show {{summary}} planned: this page’s {{flow}} plus {{transfers}} that transfers put aside.',
    spent:
      'The other pages show {{summary}} spent: this page’s {{flow}} plus {{transfers}} that transfers put aside.',
  },
  tier: {
    incomes: 'Incomes',
    accounts: 'Accounts',
    pool: 'Spendable and set aside',
    destinations: { planned: 'Planned spending', actual: 'Spent' },
  },
  spendableName: 'Spendable',
  setAsideName: 'Set aside',
  notPlannedName: 'Not planned',
  leftName: 'Left',
  label: {
    stays: 'stays {{amount}}',
    staysSpendable: 'stays {{amount}}, spendable',
    staysSetAside: 'stays {{amount}}, set aside',
    moreOut: 'More is planned to leave this account than comes in.',
    spendable: 'spendable {{amount}}',
    spendableNegative: 'More is set aside than comes in.',
    setAside: 'set aside {{amount}}',
    setAsideNegative: 'These accounts send on more than they receive.',
    planned: 'planned {{amount}}',
    spent: 'spent {{spent}} of {{amount}}',
    overPlan: 'More was spent than planned.',
    yearly: '{{amount}} a year',
    viaTransfers: '{{amount}} set aside by transfers',
    viaTransfersSpent: '{{amount}} set aside by transfers',
    notPlanned: 'not planned {{amount}}',
    left: 'left {{amount}}',
  },
  short: {
    planned: 'More is planned than is spendable, which leaves {{amount}} not planned.',
    actual: 'More was spent than was spendable, which leaves {{amount}}.',
  },
  unplaced:
    '{{income}} arrives on {{account}}, which is not drawn: more accounts receive incomes than the diagram holds. Its figures are in the tables.',
  scrollHint: 'This flow is wider than the page: scroll the diagram sideways to see all of it',
  scrollFrame: 'Money flow diagram, scrolls sideways',
  sentBack: {
    title: 'Sent back',
    item: '{{name}}: from {{from}} back to {{to}}, {{amount}} a month',
  },
  more: {
    incomes_one: 'And {{count}} more income: every figure is in the tables.',
    incomes_other: 'And {{count}} more incomes: every figure is in the tables.',
    accounts_one: 'And {{count}} more account, not drawn: every figure is in the tables.',
    accounts_other: 'And {{count}} more accounts, not drawn: every figure is in the tables.',
    destinations_one: 'And {{count}} more category group: every figure is in the tables.',
    destinations_other: 'And {{count}} more category groups: every figure is in the tables.',
  },
  key: {
    title: 'How to read it',
    income: 'An income',
    account: 'An account: its colour stays with it, whatever its name',
    setAsideAccount:
      'Striped: an account whose remainder is set aside (savings, third pillar, tax reserve, investment)',
    notAssigned: 'Dotted grey: incomes that name no account',
    spendable: 'Grey: what stays on the everyday accounts, spendable together',
    setAside: 'Grey, striped: set aside',
    group: {
      planned: 'A category group: planned spending (its colour follows its place in the budget)',
      actual: 'A category group: what was spent (its colour follows its place in the budget)',
    },
    rest: { planned: 'Outline: spendable, not planned', actual: 'Outline: spendable, left' },
    short:
      'Red hatching: the part of a bar past its own figure, where more goes out than there is; its label says why in words',
    repeat: 'Dashed outline: a colour used again, from the ninth on',
    loop: 'Dashed band with an arrow, money sent back to an earlier account: {{name}}, from {{from}} to {{to}}, {{amount}} a month',
    scale:
      'Bands are as wide as the amounts, on one scale. A quarterly or yearly transfer counts its monthly share. A category’s share planned as transfers to savings, pillar, tax or investment accounts shows as the transfer, set aside, not as spending; a transfer to an everyday account, such as a cash wallet, counts as spending.',
    colour:
      'A band has the colour of where it comes from; a band into a category group has the group’s colour.',
    thicker:
      'The smallest amounts are drawn a little thicker than their scale, so they can be seen.',
    idle: 'Nothing planned this period on: {{names}}.',
  },
  next: {
    title: 'To see more of your money flow',
    accounts: 'Add your accounts: where the salaries arrive and where money is put aside.',
    accountsAction: 'Add accounts',
    assign: 'Say which account each income arrives on.',
    assignAction: 'Go to income',
    transfers: 'Plan the transfers after payday: savings, the joint account, the third pillar…',
    transfersAction: 'Plan a transfer',
  },
  table: {
    incomes: 'Incomes',
    income: 'Income',
    arrivesOn: 'Arrives on {{account}}',
    amount: 'Amount',
    totalIncomes: 'Total incomes',
    transfers: 'Transfers',
    transfer: 'Transfer',
    perMonth: 'Per month',
    totalTransfers: 'Total moved',
    accounts: 'Accounts',
    account: 'Account',
    in: 'In',
    out: 'Out',
    stays: 'Stays',
    spendable: 'spendable',
    setAside: 'set aside',
    negative: '(more planned out than in)',
    negativeShort: 'More is planned to leave than comes in.',
    noOut: 'nothing goes out',
    totalSpendable: 'Spendable',
    totalSetAside: 'Set aside',
    noBalance:
      '“Stays” is what the plan leaves on an account this period, not its balance: balances are not tracked.',
    spending: 'Spending by category group',
    group: 'Category group',
    planned: 'Planned',
    spent: 'Spent',
    overPlan: 'more than planned',
    groupLeft: 'Left',
    overspent: 'more spent than planned',
    totalSpending: 'Total',
    remains: 'What remains',
    remainsHelp: 'Of {{amount}} spendable',
    notPlanned: 'not planned',
    left: 'left',
    shortPlanned: 'More is planned than is spendable.',
    shortActual: 'More was spent than was spendable.',
    noSpending: 'Nothing is planned or spent in any category this period.',
    omitted_one:
      '{{count}} more category group is not listed (the read stops at 1000 rows): the totals include it.',
    omitted_other:
      '{{count}} more category groups are not listed (the read stops at 1000 rows): the totals include them.',
    spendingHelp: {
      planned:
        'Planned: the categories’ expectations at their monthly share, less what planned transfers to set-aside accounts carry. Spent: the period’s transactions, refunds deducted, less those transfers’ own. A transfer to an everyday account counts as spending.',
      actual:
        'Spent: the period’s transactions, refunds deducted, less those of transfers to set-aside accounts. Planned: the categories’ expectations at their monthly share, less what those transfers carry. Left: a group’s planned spending less what it spent, below nothing when more was spent. What remains is left of the whole spendable amount.',
    },
  },
}
