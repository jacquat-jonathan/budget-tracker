/** Écrans de l’étape 7 : comptes, virements planifiés, liste à cocher, flux financiers. */

export const accountsFr = {
  add: 'Ajouter un compte',
  addFirst: 'Ajouter votre premier compte',
  addTitle: 'Ajouter un compte',
  addDescription:
    'Un endroit où votre ménage garde de l’argent : compte salaire, épargne, 3e pilier…',
  editTitle: 'Modifier le compte',
  editDescription:
    'Son nom, son type, sa banque et à qui il appartient. Les changements valent pour toutes les périodes.',
  created: 'Compte « {{name}} » ajouté.',
  saved: 'Compte « {{name}} » enregistré.',
  deleted: 'Compte « {{name}} » supprimé.',
  closed: 'Compte « {{name}} » clôturé. Les périodes passées le gardent.',
  changedNotShown:
    'Quelqu’un a modifié ce compte entre-temps, d’une façon que cette fenêtre ne montre pas. Vérifiez puis enregistrez à nouveau.',
  addNote:
    'Il compte dès la période en cours. Les soldes ne sont pas suivis : l’application planifie seulement ce qui circule.',
  addNoteEnded: 'Le budget est terminé : un compte ne peut être ajouté qu’à l’une de ses périodes.',
  editNote:
    'Un nouveau nom, type, banque ou titulaire s’affiche dans toutes les périodes, passées comprises.',
  listLabel: 'Comptes',
  closedTitle_one: '{{count}} compte clôturé',
  closedTitle_other: '{{count}} comptes clôturés',
  closedHelp:
    'Les périodes passées gardent les comptes clôturés, avec leurs virements et leurs flux.',
  closedFrom: 'Clôturé dès le {{date}}',
  empty: 'Aucun compte pour l’instant',
  emptyHelp:
    'Les comptes sont facultatifs. Ajoutez-les pour planifier les virements après la paie et voir vos flux financiers : le reste de l’application fonctionne sans eux.',
  suggestions: 'La plupart des ménages commencent par un compte salaire et un compte épargne.',
  shared: 'Commun',
  formerMember: '{{name}} (ancien membre)',
  inUse: 'Utilisé',
  inUseHelp: 'Un revenu ou un virement planifié l’utilise.',
  editFor: 'Modifier {{name}}',
  actionsFor: 'Actions pour {{name}}',
  edit: 'Modifier',
  closeAction: 'Clôturer le compte',
  deleteAction: 'Supprimer le compte',
  fields: {
    name: 'Nom',
    namePlaceholder: 'Compte salaire, épargne, compte commun…',
    kind: 'Type',
    kindPlaceholder: 'Choisir un type',
    kindHelp:
      'Dans les flux financiers, ce qui reste sur un compte de tous les jours (compte courant, espèces, carte de crédit, autre) est disponible ; ce qui reste sur un compte d’épargne, de troisième pilier, de réserve d’impôts ou de placement est mis de côté.',
    bankLabel: 'Banque',
    bankLabelOptional: 'Banque (facultatif)',
    bankLabelPlaceholder: 'La banque ou une courte note',
    holder: 'À qui',
    holderHelp: 'Le compte personnel d’un membre, ou un compte commun du ménage.',
    from: 'Pris en compte dès la période',
    fromHelp: 'Une période antérieure, pour planifier aussi ses virements.',
  },
  kinds: {
    current: 'Compte courant ou salaire',
    savings: 'Épargne',
    third_pillar: '3e pilier',
    tax_reserve: 'Réserve d’impôts',
    investment: 'Placement',
    cash: 'Espèces',
    credit_card: 'Carte de crédit',
    other: 'Autre',
  },
  close: {
    title: 'Clôturer « {{name}} » ?',
    deleteTitle: 'Supprimer « {{name}} » ?',
    ends: 'Il est clôturé dès la période commencée le {{date}}. Les périodes antérieures le gardent, avec leurs virements et leurs flux.',
    endsNoPeriod: 'Il est clôturé dès la période choisie. Les périodes antérieures le gardent.',
    endsFromEarlier:
      'Il est clôturé dès la période choisie. Les périodes antérieures le gardent ; les suivantes changent.',
    deletes: 'Rien ne l’a jamais utilisé : il est supprimé.',
    inUse: 'Il ne peut pas encore être clôturé : ceci l’utilise à partir de là.',
    changeFirst: 'Choisissez-leur un autre compte ou terminez-les, puis clôturez celui-ci.',
    usedBy: {
      income: 'Revenu « {{name}} »',
      transfer: 'Virement planifié « {{name}} »',
    },
    refused: 'Il ne peut pas être clôturé : {{reason}}',
    earlierLabel: 'Le clôturer dès une période antérieure',
    earlierWarning: 'Cela change les flux des périodes corrigées.',
    from: 'Clôturé dès',
    confirm: 'Clôturer le compte',
    delete: 'Supprimer le compte',
  },
  income: {
    field: 'Versé sur',
    fieldHelp:
      'Le compte sur lequel ce revenu arrive : c’est là que commencent les flux financiers.',
    none: 'Non attribué',
    viewLabel: 'Versé sur',
  },
}

export const transfersFr = {
  filterChip: 'Virement : {{name}} ({{from}} vers {{to}})',
  filterGone: {
    title: 'Ce virement n’est pas dans ce budget',
    body: 'Il a été supprimé entre-temps, ou l’adresse désigne le virement d’un autre budget. Rien n’est listé pour lui.',
    back: 'Afficher toutes les transactions',
  },
  filterEmpty: {
    uncountedTitle: '« {{name}} » n’enregistre aucune transaction',
    uncounted:
      'Ce virement ne compte pas comme une dépense (il n’est lié à aucune catégorie) : le marquer comme fait n’enregistre aucune transaction. Il figure dans la liste à cocher et dans les flux financiers.',
    noneTitle: 'Aucune transaction de « {{name}} » ici',
    nonePeriod:
      'Aucune n’a été enregistrée pour lui pendant cette période. Choisissez toutes les périodes pour voir les autres.',
  },
  itsTransactions: 'Ses transactions',
  itsTransactionsFor: 'Transactions de {{name}}',
  transaction: {
    badge: 'Virement',
    of: 'Virement planifié « {{name}} »',
    note: 'Enregistrée pour le virement planifié « {{name}} » : son montant, sa date, sa catégorie et sa note se modifient ici ; elle reste une dépense de ce virement.',
    deleteNote:
      'Elle a été enregistrée pour le virement planifié « {{name}} » : la supprimer indique que le virement n’a pas eu lieu (un ordre permanent n’est alors pas fait, un virement manuel est de nouveau à faire).',
  },
  quoted: '« {{name}} »',
  followingIncome_one:
    'Le virement planifié {{names}} suit ce jour de paie : ce qui a été enregistré pour lui reste, et dès sa prochaine échéance il suit le revenu principal.',
  followingIncome_other:
    'Les virements planifiés {{names}} suivent ce jour de paie : ce qui a été enregistré pour eux reste, et dès leur prochaine échéance ils suivent le revenu principal.',
  counts: {
    title: 'Virements planifiés',
    removed_one:
      '{{count}} transaction enregistrée par l’application pour un virement est retirée.',
    removed_other:
      '{{count}} transactions enregistrées par l’application pour des virements sont retirées.',
    created_one: '{{count}} transaction d’un ordre permanent est enregistrée.',
    created_other: '{{count}} transactions d’ordres permanents sont enregistrées.',
    movedKeeps:
      'Seul ce que l’application a enregistré d’elle-même, et que personne n’a modifié depuis, passe à sa nouvelle échéance. Une coche, un virement rendu manuel et une transaction modifiée par un membre restent exactement tels quels.',
    movedNote:
      'Une transaction déplacée à une nouvelle échéance compte une fois de chaque côté : elle est retirée puis enregistrée à nouveau à cette date.',
    unplanned_one:
      '{{count}} coche d’un membre n’est plus prévue : elle reste, signalée, jusqu’à son annulation.',
    unplanned_other:
      '{{count}} coches de membres ne sont plus prévues : elles restent, signalées, jusqu’à leur annulation.',
  },
  card: {
    failedTitle: 'Virements à faire',
    failed: 'Ils n’ont pas pu être comptés pour l’instant. La liste à cocher les montre.',
    title_one: '{{count}} virement à faire',
    title_other: '{{count}} virements à faire',
    description: 'Ceux que vous faites vous-même, cette période et la précédente.',
    overdue_one: 'Dont {{count}} en retard.',
    overdue_other: 'Dont {{count}} en retard.',
    open: 'Ouvrir la liste à cocher',
  },
  add: 'Planifier un virement',
  addFirst: 'Planifier votre premier virement',
  addTitle: 'Planifier un virement',
  addDescription:
    'De l’argent qui passe d’un de vos comptes à un autre selon un calendrier : après la paie ou à jour fixe.',
  editTitle: 'Modifier le virement',
  editDescription:
    'Les nouvelles conditions valent dès maintenant ; les périodes passées gardent les leurs.',
  created: 'Virement « {{name}} » planifié.',
  saved: 'Virement « {{name}} » enregistré.',
  deleted: 'Virement « {{name}} » supprimé.',
  ended: 'Virement « {{name}} » terminé. Ce qui a été enregistré reste.',
  changedNotShown:
    'Quelqu’un a modifié ce virement entre-temps, d’une façon que cette fenêtre ne montre pas. Vérifiez puis enregistrez à nouveau.',
  endedElsewhere:
    'Quelqu’un a terminé ce virement entre-temps : plus rien ne peut changer dès maintenant.',
  endedBudget: 'Le budget est terminé : les virements ne se modifient plus que dans ses périodes.',
  correctionWarning: 'Cela réécrit le plan des périodes corrigées et leurs listes à cocher.',
  correctionAppliesFrom:
    'Les nouvelles conditions valent dès la période choisie jusqu’à son prochain changement. L’aperçu dit d’abord ce qui change.',
  editAppliesFrom:
    'Les nouvelles conditions valent dès la période en cours (dès le {{date}}). Les périodes passées et ce qui a déjà été enregistré restent.',
  addFromToday:
    'Il est planifié dès aujourd’hui : rien d’antérieur à aujourd’hui n’est enregistré.',
  addRecordsPast:
    'Il est planifié dès la période choisie : ce qui était dû depuis est listé, et les ordres permanents liés à une catégorie sont enregistrés tout de suite.',
  needAccounts: 'Ajoutez d’abord vos comptes',
  needAccountsNone:
    'Un virement fait passer de l’argent entre deux de vos comptes. Les comptes sont facultatifs : le reste de l’application fonctionne sans eux.',
  needAccountsOne: 'Vous avez un compte. Un virement relie deux comptes : ajoutez-en un deuxième.',
  goToAccounts: 'Aller aux comptes',
  plannedTitle: 'Virements planifiés',
  empty: 'Aucun virement planifié pour l’instant',
  emptyHelp:
    'Un ordre permanent vers l’épargne le jour de paie, le versement annuel au 3e pilier, la part pour le compte commun…',
  to: 'vers',
  fromTo: '{{from}} vers {{to}}',
  countsIn: 'Compté comme dépense dans {{category}}',
  noCategory: 'Pas compté comme dépense',
  followsPrimary: 'Son revenu a pris fin : il suit désormais le jour de paie du revenu principal.',
  nextDue: 'Prochaine échéance',
  noNextDue: 'Aucune prévue',
  today: 'aujourd’hui',
  monthlyShare: 'Par mois',
  actionsFor: 'Actions pour {{name}}',
  edit: 'Modifier',
  endedTitle_one: '{{count}} virement terminé',
  endedTitle_other: '{{count}} virements terminés',
  endedHelp: 'Les périodes passées gardent les virements terminés, avec ce qui a été enregistré.',
  lastCounted: 'compté pour la dernière fois dans la période finissant le {{date}}',
  errors: {
    toCategorise:
      'Un virement ne peut pas compter dans « à catégoriser » : choisissez une autre catégorie.',
  },
  fields: {
    name: 'Nom',
    namePlaceholder: 'Épargne, 3e pilier, compte commun…',
    accounts: 'Comptes',
    from: 'Depuis',
    to: 'Vers',
    amount: 'Montant',
    amountEach: 'Montant à chaque fois',
    amountPer: {
      quarterly: 'Montant tous les trois mois',
      yearly: 'Montant une fois par an',
    },
    mode: 'Comment il se fait',
    when: 'Quand',
    offset: 'Jour',
    income: 'Paie de qui',
    incomeHelp: 'Celle du revenu principal, sauf si vous en choisissez une autre.',
    primaryIncome: 'Le revenu principal',
    cadence: 'Fréquence',
    day: 'Jour du mois',
    nextDue: 'Prochaine échéance',
    nextDueHelp: 'Il se répète ce jour-là ; aujourd’hui ou plus tard.',
    newNextDue: 'Nouvelle prochaine échéance (facultatif)',
    newNextDueHelp: 'Laissez vide pour garder le calendrier.',
    linked: 'Le compter comme dépense dans une catégorie',
    linkedHelp:
      'Pour l’épargne, le 3e pilier ou les impôts : une fois fait, sa transaction y est enregistrée, sans double saisie.',
    category: 'Catégorie',
    categoryHelp: 'Son montant prévu est engagé dans cette catégorie à chaque période.',
    past: 'Il a déjà eu lieu : enregistrer ce qui s’est passé depuis…',
    pastHelp:
      'Laissez décoché pour commencer aujourd’hui. Coché, ce qui était dû depuis est aussi planifié.',
    pastFrom: 'Depuis',
    thisPeriod: 'Le début de cette période',
  },
  mode: {
    automatic: 'Ordre permanent',
    manual: 'Je le fais moi-même',
    automaticShort: 'Ordre permanent',
    manualShort: 'Manuel',
    automaticHelp: 'La banque s’en charge : il compte comme fait à son échéance, rien à cocher.',
    manualHelp: 'Vous le faites et le cochez dans la liste.',
  },
  schedule: {
    pay_date: 'Après la paie',
    day_of_month: 'À jour fixe',
  },
  cadence: {
    monthly: 'Chaque mois',
    quarterly: 'Tous les trois mois',
    yearly: 'Une fois par an',
  },
  when: {
    payday: 'Le jour de paie',
    after_one: '{{count}} jour après la paie',
    after_other: '{{count}} jours après la paie',
    ofIncome: '{{when}} (« {{income}} »)',
    monthly: 'Chaque mois {{day}}',
    quarterly: 'Tous les trois mois {{day}}',
    yearly: 'Une fois par an {{day}}',
    yearlyOn: 'Une fois par an, le {{date}}',
  },
  amountPer: {
    quarterly: '{{amount}} tous les trois mois',
    yearly: '{{amount}} une fois par an',
  },
  preview: {
    title: 'Ce que fait l’enregistrement',
    needsInput: 'Choisissez les comptes et un montant pour voir les échéances.',
    firstDateInPast:
      'Rien à montrer pour l’instant : la prochaine échéance est avant aujourd’hui. Choisissez aujourd’hui ou une date ultérieure, ou cochez « Il a déjà eu lieu » pour enregistrer ce qui s’est passé.',
    none: 'Aucune échéance à ces conditions dans les périodes à venir.',
    atOnceRow: 'enregistré tout de suite',
    projected: 'estimé',
    followsPrimary:
      'Le revenu choisi n’y est pas en vigueur : il suit le jour de paie du revenu principal.',
    createdAtOnce_one:
      'L’enregistrement crée {{count}} transaction tout de suite : sa date est passée.',
    createdAtOnce_other:
      'L’enregistrement crée {{count}} transactions tout de suite : leurs dates sont passées.',
    nothingAtOnce: 'Rien n’est enregistré tout de suite.',
    nothingBeforeToday: 'Rien d’antérieur à aujourd’hui n’est enregistré.',
    transactionsRemoved_one:
      'Il retire {{count}} transaction que l’application avait enregistrée d’elle-même : sa date n’est plus prévue, ou son échéance change.',
    transactionsRemoved_other:
      'Il retire {{count}} transactions que l’application avait enregistrées d’elle-même : leurs dates ne sont plus prévues, ou leurs échéances changent.',
    movedNote:
      'Une transaction dont l’échéance change est retirée puis enregistrée à nouveau à sa nouvelle échéance : elle compte une fois de chaque côté, rien n’est perdu. L’aperçu ne dit pas lesquelles se déplacent.',
    alreadyRecorded: 'déjà enregistré, reste tel quel',
    marksUnplanned_one:
      '{{count}} coche d’un membre n’est plus prévue : elle reste dans sa liste, signalée, jusqu’à son annulation.',
    marksUnplanned_other:
      '{{count}} coches de membres ne sont plus prévues : elles restent dans leurs listes, signalées, jusqu’à leur annulation.',
  },
  end: {
    title: 'Terminer « {{name}} » ?',
    deleteTitle: 'Supprimer « {{name}} » ?',
    refused: 'Il ne peut pas se terminer maintenant : {{reason}}',
    deletes: 'Il n’a jamais compté et rien n’a été enregistré pour lui : il est supprimé.',
    ends: 'Plus d’échéance dès la période commencée le {{date}}.',
    endsNoPeriod: 'Plus d’échéance dès la période choisie.',
    fromEarlier: 'Plus d’échéance dès la période choisie ; les périodes suivantes changent.',
    removes_one: 'Il retire {{count}} échéance prévue que personne n’a cochée.',
    removes_other: 'Il retire {{count}} échéances prévues que personne n’a cochées.',
    keepsMarks_one:
      '{{count}} coche ({{transactions}} avec sa transaction) reste, signalée comme terminée dans sa liste.',
    keepsMarks_other:
      '{{count}} coches ({{transactions}} avec leurs transactions) restent, signalées comme terminées dans leurs listes.',
    recordedStays: 'Ce qui a été coché et enregistré reste ; les périodes antérieures le gardent.',
    earlierLabel: 'Le terminer dès une période antérieure',
    earlierWarning: 'Cela réécrit le plan et les listes à cocher des périodes corrigées.',
    from: 'Terminé dès',
    confirm: 'Terminer le virement',
    delete: 'Supprimer le virement',
  },
  views: {
    label: 'Vues des virements',
    planned: 'Virements planifiés ({{count}})',
  },
  checklist: {
    title: 'Liste à cocher',
    help: 'Les virements d’une période : cochez ceux que vous faites vous-même.',
    period: 'Période',
    currentPeriod: 'En cours ({{start}} – {{end}})',
    unknownPeriod: 'La période du lien n’appartient pas à ce budget : voici la période en cours.',
    empty: 'Rien n’est prévu dans cette période.',
    allSettled: 'Plus rien à faire dans cette période.',
    settledLabel: 'Faits et réglés',
    settled_one: '{{count}} fait ou réglé',
    settled_other: '{{count}} faits ou réglés',
    previousOpen_one:
      '{{count}} virement est encore à faire dans la période précédente (du {{start}} au {{end}}).',
    previousOpen_other:
      '{{count}} virements sont encore à faire dans la période précédente (du {{start}} au {{end}}).',
    previousOpenLink: 'Ouvrir cette liste',
    more_one: '… et {{count}} autre coche non listée',
    more_other: '… et {{count}} autres coches non listées',
    due: 'échéance le {{date}}',
    noDue: 'plus dû',
    planned: '{{amount}} prévus',
    ended: 'terminé',
    unplannedHelp:
      'Sa date n’est plus prévue (le calendrier ou une paie a changé). Elle reste jusqu’à ce que vous l’annuliez.',
    unplannedEnded: 'Le virement est terminé. Cette coche reste jusqu’à ce que vous l’annuliez.',
    unplannedTransaction: 'L’annuler supprime aussi sa transaction.',
    unplannedTransactionIn: 'L’annuler supprime aussi sa transaction dans {{category}}.',
    heldBackHelp:
      'Le budget contient le maximum de transactions : elle sera enregistrée, à sa date d’échéance, dès qu’il y aura de la place.',
    done: 'Fait',
    doneFor: 'Marquer « {{name}} » comme fait',
    skip: 'Ignorer',
    skipFor: 'Ignorer « {{name}} » cette fois',
    notDone: 'N’a pas eu lieu',
    notDoneFor: '« {{name}} » n’a pas eu lieu',
    undo: 'Annuler',
    undoFor: 'Annuler la coche de « {{name}} »',
    doneTitle: 'Fait : « {{name}} »',
    doneDescription: '{{amount}} prévus, échéance le {{date}}.',
    doneOn: 'Fait le',
    doneOnHelp: 'Aujourd’hui ou avant.',
    doneOnLinked: 'Sa transaction dans {{category}} porte cette date. Aujourd’hui ou avant.',
    amountMoved: 'Montant viré',
    status: {
      toDo: 'À faire',
      overdue: 'En retard',
      upcoming: 'Ordre permanent : considéré comme fait à son échéance',
      done: 'Fait le {{date}}',
      doneBy: 'Fait le {{date}} par {{name}}',
      assumed: 'Fait par ordre permanent le {{date}}',
      skipped: 'Ignoré',
      skippedBy: 'Ignoré par {{name}}',
      notDone: 'N’a pas eu lieu',
      notDoneBy: 'N’a pas eu lieu (selon {{name}})',
      heldBack: 'En attente de place dans le budget',
      unplanned: 'Plus prévu',
      unplannedWas: '{{state}} · plus prévu',
    },
    changedElsewhere:
      'Quelqu’un a coché ou modifié ce virement entre-temps : la liste montre maintenant où il en est.',
    listChanged:
      'La liste de cette période a changé entre-temps : elle est affichée à nouveau telle qu’elle est maintenant. Vérifiez la ligne et réessayez.',
    kind: {
      payday: 'au jour de paie qui a ouvert la période',
      income_payday: 'au jour de paie de son revenu choisi',
      fixed_day: 'à son jour fixe',
    },
    nameWithKind: '{{name}}, {{kind}}',
    markedDone: '« {{name}} » fait : {{amount}}.',
    markedSkipped: '« {{name}} » ignoré pour cette fois.',
    markedNotDone: '« {{name}} » marqué comme non fait.',
    undone: '« {{name}} » est revenu tel qu’il était prévu.',
    undoneUnplanned: '« {{name}} » n’est plus prévu ici : sa coche est retirée.',
    undoneUnplannedWithTransaction:
      '« {{name}} » n’est plus prévu ici : sa coche est retirée, avec sa transaction.',
  },
}

export const moneyFlowFr = {
  period: 'Période',
  currentPeriod: '{{label}} (en cours)',
  notAssigned: 'Non attribué',
  notAssignedHelp:
    '« Non attribué » : les revenus qui n’indiquent pas encore de compte. Précisez dans le revenu où il arrive.',
  bandIncome: '{{name}} : {{amount}}',
  bandTransfer: '{{name}} : {{amount}} par mois',
  basis: {
    label: 'Prévu ou réel',
    planned: 'Prévu',
    actual: 'Réel',
  },
  heading: {
    planned: 'Flux financiers prévus de la période {{period}}',
    actual: 'Ce qui s’est réellement passé pendant la période {{period}}',
  },
  intro: {
    planned:
      'Où vont les revenus de la période selon le plan : vers les comptes, les virements entre eux, ce qui est mis de côté et les dépenses prévues dans chaque groupe de catégories.',
    actual:
      'Les mêmes revenus et virements, avec ce que les transactions de la période ont réellement dépensé dans chaque groupe de catégories.',
  },
  running:
    'Cette période est encore en cours jusqu’au {{end}} : ce qui est dépensé jusqu’ici, pas ses chiffres définitifs.',
  diagramTitle: {
    planned:
      'Flux financiers prévus de la période {{period}} : revenus {{incomes}} ; mis de côté {{setAside}} ; disponible {{spendable}}, dont {{spending}} prévus en dépenses et {{rest}} non prévus. Tous les montants figurent dans les tableaux ci-dessous.',
    actual:
      'Flux financiers de la période {{period}}, tels qu’ils se sont passés : revenus {{incomes}} ; mis de côté {{setAside}} ; disponible {{spendable}}, dont {{spending}} dépensés et {{rest}} restants. Tous les montants figurent dans les tableaux ci-dessous.',
  },
  noIncome:
    'Aucun revenu ne compte dans cette période, rien ne circule encore : les dépenses ci-dessous sont tout ce qu’il y a.',
  empty: 'Rien encore dans cette période',
  emptyHelp:
    'Les flux financiers partent des revenus en vigueur dans une période et finissent par ce qui est prévu ou dépensé dans ses catégories.',
  tiles: {
    incomes: 'Revenus',
    setAside: 'Mis de côté',
    setAsideHelp: 'Reste sur les comptes d’épargne, de pilier, d’impôts et de placement',
    spending: { planned: 'Dépenses prévues', actual: 'Dépensé' },
    ofSpendable: 'Sur {{amount}} disponibles',
    rest: { planned: 'Non prévu', actual: 'Restant' },
    restHelp: {
      planned: 'Disponible, sans dépense prévue',
      actual: 'Disponible et non dépensé',
    },
    short: {
      planned: 'Il est prévu de dépenser davantage que ce qui est disponible.',
      actual: 'On a dépensé davantage que ce qui était disponible.',
    },
    setAsideNegative:
      'Les comptes d’épargne, de pilier, d’impôts et de placement envoient plus qu’ils ne reçoivent.',
  },
  tier: {
    incomes: 'Revenus',
    accounts: 'Comptes',
    pool: 'Disponible et mis de côté',
    destinations: { planned: 'Dépenses prévues', actual: 'Dépensé' },
  },
  spendableName: 'Disponible',
  setAsideName: 'Mis de côté',
  notPlannedName: 'Non prévu',
  leftName: 'Restant',
  label: {
    stays: 'reste {{amount}}',
    staysSpendable: 'reste {{amount}}, disponible',
    staysSetAside: 'reste {{amount}}, mis de côté',
    moreOut: 'Il est prévu de sortir de ce compte plus qu’il n’y entre.',
    spendable: 'disponible {{amount}}',
    spendableNegative: 'On met de côté plus qu’il n’entre.',
    setAside: 'mis de côté {{amount}}',
    setAsideNegative: 'Ces comptes envoient plus qu’ils ne reçoivent.',
    planned: 'prévu {{amount}}',
    spent: 'dépensé {{spent}} sur {{amount}}',
    overPlan: 'On a dépensé plus que prévu.',
    yearly: '{{amount}} par an',
    viaTransfers: '{{amount}} mis de côté par des virements',
    viaTransfersSpent: '{{amount}} mis de côté par des virements',
    notPlanned: 'non prévu {{amount}}',
    left: 'restant {{amount}}',
  },
  short: {
    planned: 'Il est prévu plus que ce qui est disponible, ce qui laisse {{amount}} non prévus.',
    actual: 'On a dépensé plus que ce qui était disponible, ce qui laisse {{amount}}.',
  },
  unplaced:
    '{{income}} arrive sur {{account}}, qui n’est pas dessiné : plus de comptes reçoivent des revenus que le schéma n’en contient. Ses montants figurent dans les tableaux.',
  scrollHint:
    'Ce flux est plus large que la page : faites défiler le schéma de côté pour le voir en entier',
  scrollFrame: 'Schéma des flux financiers, défile de côté',
  sentBack: {
    title: 'Renvoyé',
    item: '{{name}} : de {{from}} en retour vers {{to}}, {{amount}} par mois',
  },
  more: {
    incomes_one: 'Et {{count}} autre revenu : tous les montants figurent dans les tableaux.',
    incomes_other: 'Et {{count}} autres revenus : tous les montants figurent dans les tableaux.',
    accounts_one:
      'Et {{count}} autre compte, non dessiné : tous les montants figurent dans les tableaux.',
    accounts_other:
      'Et {{count}} autres comptes, non dessinés : tous les montants figurent dans les tableaux.',
    destinations_one:
      'Et {{count}} autre groupe de catégories : tous les montants figurent dans les tableaux.',
    destinations_other:
      'Et {{count}} autres groupes de catégories : tous les montants figurent dans les tableaux.',
  },
  key: {
    title: 'Comment le lire',
    income: 'Un revenu',
    account: 'Un compte : sa couleur le suit, quel que soit son nom',
    setAsideAccount:
      'Rayé : un compte dont le reste est mis de côté (épargne, 3e pilier, réserve d’impôts, placement)',
    notAssigned: 'Gris pointillé : les revenus qui n’indiquent aucun compte',
    spendable: 'Gris : ce qui reste sur les comptes courants, disponible ensemble',
    setAside: 'Gris rayé : mis de côté',
    group: {
      planned:
        'Un groupe de catégories : dépenses prévues (sa couleur suit sa place dans le budget)',
      actual:
        'Un groupe de catégories : ce qui a été dépensé (sa couleur suit sa place dans le budget)',
    },
    rest: { planned: 'Contour : disponible, non prévu', actual: 'Contour : disponible, restant' },
    short:
      'Hachures rouges : la partie d’une barre au-delà de son propre montant, là où il sort plus qu’il n’y a ; son étiquette dit pourquoi en toutes lettres',
    repeat: 'Contour en tirets : une couleur réutilisée, à partir de la neuvième',
    loop: 'Bande en tirets avec une flèche, de l’argent renvoyé vers un compte précédent : {{name}}, de {{from}} vers {{to}}, {{amount}} par mois',
    colour:
      'Une bande a la couleur de son point de départ ; une bande qui entre dans un groupe de catégories a la couleur du groupe.',
    thicker:
      'Les plus petits montants sont dessinés un peu plus épais que leur échelle, pour qu’on les voie.',
    scale:
      'Les bandes sont aussi larges que les montants, à une même échelle. Un virement trimestriel ou annuel compte sa part mensuelle. La part d’une catégorie prévue en virements vers des comptes d’épargne, de pilier, d’impôts ou de placement apparaît comme virement, mise de côté, pas comme dépense ; un virement vers un compte courant, comme un porte-monnaie, compte comme dépense.',
    idle: 'Rien de prévu cette période sur : {{names}}.',
  },
  next: {
    title: 'Pour voir davantage de vos flux financiers',
    accounts:
      'Ajoutez vos comptes : là où arrivent les salaires et là où l’argent est mis de côté.',
    accountsAction: 'Ajouter des comptes',
    assign: 'Indiquez sur quel compte arrive chaque revenu.',
    assignAction: 'Aller aux revenus',
    transfers: 'Planifiez les virements après la paie : épargne, compte commun, 3e pilier…',
    transfersAction: 'Planifier un virement',
  },
  table: {
    incomes: 'Revenus',
    income: 'Revenu',
    arrivesOn: 'Arrive sur {{account}}',
    amount: 'Montant',
    totalIncomes: 'Total des revenus',
    transfers: 'Virements',
    transfer: 'Virement',
    perMonth: 'Par mois',
    totalTransfers: 'Total déplacé',
    accounts: 'Comptes',
    account: 'Compte',
    in: 'Entrées',
    out: 'Sorties',
    stays: 'Reste',
    spendable: 'disponible',
    setAside: 'mis de côté',
    negative: '(plus de sorties prévues que d’entrées)',
    negativeShort: 'Il est prévu d’en sortir plus qu’il n’y entre.',
    noOut: 'rien ne sort',
    totalSpendable: 'Disponible',
    totalSetAside: 'Mis de côté',
    noBalance:
      '« Reste » est ce que le plan laisse sur un compte pendant la période, pas son solde : les soldes ne sont pas suivis.',
    spending: 'Dépenses par groupe de catégories',
    group: 'Groupe de catégories',
    planned: 'Prévu',
    spent: 'Dépensé',
    overPlan: 'plus que prévu',
    groupLeft: 'Restant',
    overspent: 'plus dépensé que prévu',
    totalSpending: 'Total',
    remains: 'Ce qui reste',
    remainsHelp: 'Sur {{amount}} disponibles',
    notPlanned: 'non prévu',
    left: 'restant',
    shortPlanned: 'Il est prévu plus que ce qui est disponible.',
    shortActual: 'On a dépensé plus que ce qui était disponible.',
    noSpending: 'Rien n’est prévu ni dépensé dans aucune catégorie cette période.',
    omitted_one:
      '{{count}} autre groupe de catégories n’est pas listé (la lecture s’arrête à 1000 lignes) : les totaux l’incluent.',
    omitted_other:
      '{{count}} autres groupes de catégories ne sont pas listés (la lecture s’arrête à 1000 lignes) : les totaux les incluent.',
    spendingHelp: {
      planned:
        'Prévu : les montants attendus des catégories à leur part mensuelle, moins ce que portent les virements planifiés vers des comptes de mise de côté. Dépensé : les transactions de la période, remboursements déduits, moins celles de ces virements. Un virement vers un compte courant compte comme dépense.',
      actual:
        'Dépensé : les transactions de la période, remboursements déduits, moins celles des virements vers des comptes de mise de côté. Prévu : les montants attendus des catégories à leur part mensuelle, moins ce que portent ces virements. Restant : la dépense prévue d’un groupe moins ce qu’il a dépensé, en dessous de zéro quand on a dépensé plus. Ce qui reste est le restant de tout le montant disponible.',
    },
  },
}
