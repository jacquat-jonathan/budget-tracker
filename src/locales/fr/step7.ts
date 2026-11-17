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
  actionsFor: 'Actions pour {{name}}',
  edit: 'Modifier',
  closeAction: 'Clôturer le compte',
  deleteAction: 'Supprimer le compte',
  seeTransfers: 'Virements planifiés',
  fields: {
    name: 'Nom',
    namePlaceholder: 'Compte salaire, épargne, compte commun…',
    kind: 'Type',
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
    noAccounts: 'Ajoutez des comptes pour indiquer où ce revenu arrive.',
    paidInto: 'Versé sur {{name}}',
    viewLabel: 'Versé sur',
  },
}

export const transfersFr = {
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
    movedNote: 'Une transaction déplacée à sa nouvelle échéance compte une fois de chaque côté.',
    unplanned_one:
      '{{count}} coche d’un membre n’est plus prévue : elle reste, signalée, jusqu’à son annulation.',
    unplanned_other:
      '{{count}} coches de membres ne sont plus prévues : elles restent, signalées, jusqu’à leur annulation.',
  },
  card: {
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
      'Il retire {{count}} transaction que l’application avait enregistrée pour une date qui n’est plus prévue.',
    transactionsRemoved_other:
      'Il retire {{count}} transactions que l’application avait enregistrées pour des dates qui ne sont plus prévues.',
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
  checklist: {
    title: 'Liste à cocher',
    help: 'Les virements d’une période : cochez ceux que vous faites vous-même.',
    period: 'Période',
    currentPeriod: 'Cette période (du {{start}} au {{end}})',
    unknownPeriod: 'La période du lien n’appartient pas à ce budget : voici la période en cours.',
    empty: 'Rien n’est prévu dans cette période.',
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
    markedDone: '« {{name}} » fait : {{amount}}.',
    markedSkipped: '« {{name}} » ignoré pour cette fois.',
    markedNotDone: '« {{name}} » marqué comme non fait.',
    undone: '« {{name}} » est revenu tel qu’il était prévu.',
  },
}

export const moneyFlowFr = {
  scrollFrame: 'Diagramme des flux financiers, défile horizontalement',
  period: 'Période',
  currentPeriod: '{{label}} (en cours)',
  notAssigned: 'Non attribué',
  notAssignedHelp:
    '« Non attribué » : les revenus qui n’indiquent pas encore de compte. Précisez dans le revenu où il arrive.',
  nodeTitle: 'entrées {{in}}, sorties {{out}}, reste {{stays}}',
  bandIncome: '{{name}} : {{amount}}',
  bandTransfer: '{{name}} : {{amount}} par mois',
  diagramTitle:
    'Flux financiers de la période {{period}} : revenus de {{incomes}}, dont {{transfers}} déplacés par des virements. Tous les montants figurent dans les tableaux ci-dessous.',
  empty: 'Aucun revenu dans cette période',
  emptyHelp: 'Les flux financiers partent des revenus en vigueur dans une période.',
  incomesTotal: 'Revenus de la période',
  transfersTotal: 'Déplacé par les virements (par mois)',
  howToRead:
    'Lisez de gauche à droite : chaque revenu vers son compte, puis les virements. Les bandes sont aussi larges que les montants. Sous un revenu, son montant ; sous un compte, ce que le plan y laisse pendant la période (avec un signe d’alerte quand plus sort qu’il n’entre). Un virement trimestriel ou annuel compte sa part mensuelle.',
  spendingNote:
    'Seulement le plan : ce qui a réellement été dépensé figure dans le budget et les transactions. Aucun solde n’est tenu.',
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
    into: 'Arrive sur',
    amount: 'Montant',
    totalIncomes: 'Total des revenus',
    transfers: 'Virements',
    transfer: 'Virement',
    fromTo: 'De et vers',
    perMonth: 'Par mois',
    totalTransfers: 'Total déplacé',
    accounts: 'Comptes',
    account: 'Compte',
    in: 'Entrées',
    out: 'Sorties',
    stays: 'Reste',
    negative: '(plus de sorties prévues que d’entrées)',
    noBalance:
      '« Reste » est ce que le plan laisse sur un compte pendant la période, pas son solde : les soldes ne sont pas suivis.',
  },
}
