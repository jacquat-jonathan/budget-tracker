import type { Translation } from '@/locales/en/translation'

// French typography: a narrow no-break space (U+202F) precedes ? ! : ; and %, and
// follows « (and precedes »).

export const subscriptionsFr: Translation['subscriptions'] = {
  add: 'Ajouter un abonnement',
  addFirst: 'Ajouter votre premier abonnement',
  addTitle: 'Ajouter un abonnement',
  addDescription:
    'Un prélèvement qui revient : il est enregistré automatiquement à chaque date, et vous confirmez qu’il a bien eu lieu.',
  editTitle: 'Modifier l’abonnement',
  editDescription: 'Changez son nom, son prix, son calendrier ou sa catégorie.',
  created: 'Abonnement « {{name}} » ajouté.',
  saved: 'Abonnement « {{name}} » enregistré.',
  deleted: 'Abonnement « {{name}} » supprimé.',
  ended:
    'Abonnement « {{name}} » terminé. Les périodes passées le conservent, avec ses prélèvements.',
  fields: {
    name: 'Nom',
    namePlaceholder: 'Netflix, salle de sport, téléphone…',
    price: 'Prix par prélèvement',
    cadence: 'Prélevé',
    category: 'Catégorie',
    categoryHelp:
      'Ses prélèvements sont des dépenses de cette catégorie, et son coût mensuel y est engagé.',
    firstCharge: 'Date du premier prélèvement',
    firstChargeHelp:
      'Le calendrier se répète ce jour du mois (le dernier jour du mois s’il est plus court). Seules les dates depuis la période où il compte sont prélevées.',
    nextCharge: 'Nouvelle date du prochain prélèvement (facultatif)',
    nextChargeHelpCorrection:
      'Laissez vide pour garder le calendrier de la période corrigée. Une date saisie devient son prochain prélèvement ; les suivants en découlent.',
    nextChargeHelp:
      'Laissez vide pour garder le calendrier. Une date après aujourd’hui devient le prochain prélèvement ; les suivants en découlent.',
    from: 'Première période où il compte',
    fromHelp:
      'Normalement la période en cours. Une période antérieure est une correction : ses prélèvements depuis sont créés aussitôt, à confirmer.',
    terms: 'Prix et calendrier',
  },
  cadence: {
    monthly: 'Chaque mois',
    quarterly: 'Tous les 3 mois',
    half_yearly: 'Tous les 6 mois',
    yearly: 'Chaque année',
  },
  pricePer: {
    monthly: '{{amount}} par mois',
    quarterly: '{{amount}} tous les 3 mois',
    half_yearly: '{{amount}} tous les 6 mois',
    yearly: '{{amount}} par an',
  },
  termsWithSchedule: '{{price}}, calendrier à partir du {{date}}',
  correctionWarning:
    'Cela modifie des périodes passées : leurs montants engagés et les prélèvements encore à venir suivent les conditions saisies, de la période choisie jusqu’au prochain changement déjà enregistré. Les prélèvements déjà enregistrés ne changent pas.',
  correctionAppliesFrom:
    'Les nouvelles conditions s’appliquent de la période choisie jusqu’au prochain changement déjà enregistré.',
  editAppliesFrom:
    'Les nouvelles conditions s’appliquent dès la période en cours (depuis le {{date}}) ; les périodes passées gardent les leurs. Les prélèvements déjà enregistrés ne changent pas.',
  addAppliesFromEnded:
    'Il compte dès la période choisie : ses prélèvements depuis sont créés aussitôt, à confirmer.',
  addAppliesFrom:
    'Il compte dès le début de la période en cours : une date de prélèvement déjà passée dans cette période est enregistrée aussitôt, à confirmer.',
  preview: {
    title: 'Prochains prélèvements',
    needsDate: 'Saisissez une date pour voir les dates de prélèvement.',
    failed: 'Les dates de prélèvement n’ont pas pu être calculées pour cette date.',
    due: 'enregistré aussitôt, à confirmer',
    new: 'Calculées par le budget à partir de la date du premier prélèvement et de la fréquence.',
    date: 'Le prochain prélèvement est à la date saisie ; les suivants suivent la fréquence.',
    kept: 'Le calendrier reste tel quel.',
    cadence:
      'Avec une nouvelle fréquence et sans nouvelle date, le calendrier continue depuis le prochain prélèvement, le {{date}}.',
    none: 'Aucun prélèvement à ces conditions avant la fin du budget.',
    atOnce_one: 'L’enregistrement crée aussitôt 1 prélèvement, daté dans le passé, à confirmer.',
    atOnce_other:
      'L’enregistrement crée aussitôt {{count}} prélèvements, datés dans le passé, à confirmer.',
    atOnceAtLeast_one:
      'L’enregistrement crée aussitôt au moins {{count}} prélèvement, daté dans le passé.',
    atOnceAtLeast_other:
      'L’enregistrement crée aussitôt au moins {{count}} prélèvements, datés dans le passé, à confirmer.',
    cadenceKeepsDay: 'Ne changer que la fréquence garde le jour du prélèvement : {{day}}.',
    refused: 'Ces conditions ne peuvent pas être enregistrées : {{reason}}',
  },
  day: {
    plain_ordinal_one: 'le {{count}}er',
    plain_ordinal_two: 'le {{count}}',
    plain_ordinal_few: 'le {{count}}',
    plain_ordinal_other: 'le {{count}}',
    late_ordinal_one: 'le {{count}}er, ou le dernier jour d’un mois plus court',
    late_ordinal_two: 'le {{count}}, ou le dernier jour d’un mois plus court',
    late_ordinal_few: 'le {{count}}, ou le dernier jour d’un mois plus court',
    late_ordinal_other: 'le {{count}}, ou le dernier jour d’un mois plus court',
  },
  noFurtherCharge: 'Plus aucun prélèvement avant la fin du budget',
  held: {
    title: 'En attente depuis le {{date}}',
    why: "Le budget contient 50'000 transactions, le maximum : ce prélèvement sera créé dès qu’il y aura de la place.",
  },
  remove: {
    deleteTitle: 'Supprimer « {{name}} » ?',
    endTitle: 'Terminer « {{name}} » ?',
    fromEarlier:
      'Il se termine dès la période choisie : il n’y compte plus et aucun prélèvement n’est créé dès lors. Les périodes précédentes le conservent avec leurs prélèvements.',
    deletesFromEarlier:
      'Il n’a jamais compté avant la période choisie et n’a aucun prélèvement : il est supprimé.',
    refused: 'Il ne peut pas être terminé dès cette période : {{reason}}',
    deletes:
      'Il n’a jamais compté dans une période passée et n’a aucun prélèvement : il est supprimé.',
    ends: 'Il se termine dès la période en cours (depuis le {{date}}) : plus de prélèvements. Les périodes passées le conservent.',
    endsNoPeriod: 'Il se termine : plus de prélèvements. Les périodes passées le conservent.',
    keepsCharges_one: 'Son prélèvement déjà enregistré reste en place.',
    keepsCharges_other: 'Ses {{count}} prélèvements déjà enregistrés restent en place.',
    stillAwaiting_one:
      'Un prélèvement attend encore une confirmation : il reste sur le tableau de bord.',
    stillAwaiting_other:
      '{{count}} prélèvements attendent encore une confirmation : ils restent sur le tableau de bord.',
    earlierLabel: 'Le terminer dès une période antérieure',
    earlierWarning:
      'Cela modifie des périodes passées : dès la période choisie, il ne compte plus et aucun prélèvement n’est créé.',
    delete: 'Supprimer',
    end: 'Terminer l’abonnement',
    endAction: 'Terminer',
  },
  endedBudget:
    'Le budget est terminé : un abonnement peut encore être ajouté, modifié ou terminé comme correction dès l’une de ses périodes, et ses prélèvements confirmés.',
  filterChip: 'Abonnement : {{name}}',
  seeTransactions: 'Voir ses transactions',
  empty: 'Aucun abonnement pour l’instant',
  emptyHelp:
    'Ajoutez les prélèvements qui reviennent, comme le streaming, une assurance ou un abonnement de téléphone : chacun est enregistré à sa date, et vous confirmez qu’il a eu lieu.',
  listLabel: 'Abonnements en cours',
  committedPerMonth: 'Engagé par mois',
  committedHelp_one: 'Un abonnement, compté dans le plan de sa catégorie.',
  committedHelp_other: '{{count}} abonnements, comptés dans le plan de leurs catégories.',
  awaiting_one: '1 prélèvement à confirmer',
  awaiting_other: '{{count}} prélèvements à confirmer',
  nextCharge: 'Prochain prélèvement',
  monthlyCost: 'Par mois',
  actionsFor: 'Actions pour {{name}}',
  edit: 'Modifier',
  endedTitle_one: 'Abonnement terminé ({{count}})',
  endedTitle_other: 'Abonnements terminés ({{count}})',
  endedHelp: 'Les périodes passées les conservent, avec leurs prélèvements.',
  lastCounted: 'Compté pour la dernière fois dans la période terminée le {{date}}',
  endedLabel: 'Terminé',
  endedElsewhere:
    'Il ne compte plus dès la période en cours : ces modifications ne peuvent donc pas être enregistrées. Fermez cette fenêtre ; il figure parmi les abonnements terminés, avec ses prélèvements.',
  changedNotShown:
    'Un autre membre a modifié entre-temps quelque chose que cette fenêtre n’affiche pas (un nom, un remboursement…). Rien n’a été enregistré ; vos saisies sont toujours là : enregistrez de nouveau.',
}

export const chargesFr: Translation['charges'] = {
  title_one: 'Un prélèvement à confirmer',
  title_other: '{{count}} prélèvements à confirmer',
  description:
    'Ces prélèvements d’abonnement ont été enregistrés automatiquement. Ont-ils vraiment eu lieu ?',
  what: '{{name}}, {{amount}} le {{date}}',
  wentThrough: 'Bien prélevé',
  wentThroughFor: 'Bien prélevé : {{what}}',
  didNot: 'Pas prélevé',
  didNotFor: 'Pas prélevé : {{what}}',
  dismissTitle: 'Retirer ce prélèvement ?',
  dismissDescription: 'Le prélèvement {{what}} est retiré du budget.',
  dismissNever:
    'Il ne sera pas recréé pour sa date prévue, le {{date}}. S’il est finalement prélevé plus tard, enregistrez-le comme transaction.',
  dismissConfirm: 'Retirer le prélèvement',
  confirmed: 'Prélèvement de {{name}} ({{amount}}) confirmé.',
  dismissed: 'Prélèvement de {{name}} ({{amount}}) retiré.',
  answeredElsewhere:
    'Un autre membre a déjà répondu pour ce prélèvement. La liste a été actualisée.',
  scheduledFor: '(prévu le {{date}})',
  seeAll_one: 'Et 1 autre : voir les transactions',
  seeAll_other: 'Et {{count}} autres : voir les transactions',
  filterChip: 'En attente de confirmation',
  linkFilters: 'Filtres d’un lien',
  removeFilter: 'Retirer le filtre « {{what}} »',
  confirmAll: 'Tous ont eu lieu',
  confirmAllTitle_one: 'Confirmer le prélèvement en attente ?',
  confirmAllTitle_other: 'Confirmer les {{count}} prélèvements en attente ?',
  confirmAllOneDay_one: 'Le prélèvement du {{date}} est confirmé : il a eu lieu.',
  confirmAllOneDay_other:
    'Les {{count}} prélèvements du {{date}} sont confirmés : ils ont tous eu lieu.',
  confirmAllRange_one: 'Le prélèvement en attente, daté du {{from}} au {{to}}, est confirmé.',
  confirmAllRange_other:
    'Les {{count}} prélèvements en attente, datés du {{from}} au {{to}}, sont confirmés : ils ont tous eu lieu. Pour ceux qui n’ont pas eu lieu, répondez un par un.',
  confirmAllAction_one: 'Le confirmer',
  confirmAllAction_other: 'Confirmer les {{count}}',
  confirmedAll_one: '{{count}} prélèvement confirmé.',
  confirmedAll_other: '{{count}} prélèvements confirmés.',
  confirmedAllOther_one:
    '{{count}} prélèvement confirmé, et non {{stated}} : un autre membre en a répondu entre-temps, ou de nouveaux sont arrivés.',
  confirmedAllOther_other:
    '{{count}} prélèvements confirmés, et non {{stated}} : un autre membre en a répondu entre-temps, ou de nouveaux sont arrivés.',
}

export const debtsFr: Translation['debts'] = {
  add: 'Ajouter une dette',
  addFirst: 'Ajouter une dette',
  addTitle: 'Ajouter une dette',
  addDescription: 'De l’argent que le ménage doit : un prêt, une carte de crédit, un leasing.',
  editTitle: 'Modifier la dette',
  editDescription: 'Changez son nom, sa catégorie, son taux d’intérêt ou son remboursement prévu.',
  created: 'Dette « {{name}} » ajoutée.',
  saved: 'Dette « {{name}} » enregistrée.',
  deleted: 'Dette « {{name}} » supprimée.',
  ended: 'Dette « {{name}} » terminée. Son historique est conservé.',
  fields: {
    name: 'Nom',
    namePlaceholder: 'Prêt auto, carte de crédit…',
    category: 'Catégorie des remboursements',
    categoryHelp: 'Les remboursements de cette dette sont des dépenses de cette catégorie.',
    categoryEditHelp:
      'Pour les remboursements enregistrés désormais ; ceux déjà enregistrés gardent leur catégorie.',
    principal: 'Montant dû au départ',
    principalHelp: 'Ce qui est dû aujourd’hui, ou au début de la période où elle compte.',
    principalLocked:
      'Le montant de départ ne peut plus changer : la dette a des remboursements, des intérêts ou des ajustements. Utilisez « Ajuster le solde » pour correspondre à votre relevé.',
    rate: 'Taux d’intérêt',
    rateOptional: 'Taux d’intérêt annuel, % (facultatif)',
    payment: 'Remboursement prévu par mois',
    termsHelp:
      'Un douzième du taux annuel est ajouté à chaque période. Le remboursement prévu donne la fin attendue.',
    from: 'Première période où elle compte',
    fromHelp:
      'Normalement la période en cours. Une période antérieure est une correction : aucun intérêt n’est ajouté pour les périodes qui existent déjà.',
  },
  noInterest: 'Sans intérêt',
  ratePerYear: '{{rate}} % par an',
  correctionWarning:
    'Cela modifie les conditions enregistrées pour des périodes passées et la projection. Les intérêts déjà ajoutés ne sont jamais recalculés : corrigez un montant erroné avec « Ajuster le solde ».',
  correctionAppliesFrom:
    'Les nouvelles conditions s’appliquent de la période choisie jusqu’au prochain changement déjà enregistré.',
  editAppliesFrom:
    'Les nouvelles conditions s’appliquent dès la période en cours (depuis le {{date}}) ; les périodes passées gardent les leurs.',
  addAppliesFrom: 'Elle compte dès la période en cours, ouverte aujourd’hui.',
  remove: {
    deleteTitle: 'Supprimer « {{name}} » ?',
    endTitle: 'Terminer « {{name}} » ?',
    fromEarlier:
      'Elle se termine dès la période choisie : plus d’intérêts ni de remboursement daté de là. Son historique est conservé.',
    deletesFromEarlier:
      'Elle n’a jamais compté avant la période choisie et n’a ni remboursement, ni intérêt, ni ajustement : elle est supprimée.',
    refused: 'Elle ne peut pas être terminée dès cette période : {{reason}}',
    deletes: 'Elle n’a encore ni remboursement, ni intérêt, ni ajustement : elle est supprimée.',
    ends: 'Elle se termine dès la période en cours (depuis le {{date}}) : plus d’intérêts ni de nouveaux remboursements. Son historique est conservé, tout comme son montant restant ({{amount}}).',
    endsNoPeriod:
      'Elle se termine : plus d’intérêts ni de nouveaux remboursements. Son historique est conservé.',
    earlierLabel: 'La terminer dès une période antérieure',
    earlierWarning:
      'Cela modifie des périodes passées : dès la période choisie, aucun intérêt n’est ajouté et aucun remboursement ne peut y être daté.',
    delete: 'Supprimer',
    end: 'Terminer la dette',
    endAction: 'Terminer',
  },
  adjust: {
    action: 'Ajuster le solde',
    title: 'Ajuster le solde',
    description: 'Faites correspondre le montant restant à votre relevé bancaire.',
    now: '« {{name}} » : {{amount}} restant actuellement.',
    balance: 'Ce que vous devez maintenant',
    balanceHelp:
      'Le montant encore dû aujourd’hui, selon votre banque. Il devient le montant restant actuel, quelle que soit la date indiquée ci-dessous.',
    date: 'Enregistrer l’ajustement le',
    dateHelp:
      'Cette date place seulement l’ajustement dans l’historique et dans sa période. Elle ne fixe pas le solde à ce jour-là : les remboursements et les intérêts enregistrés après elle restent comptés, et l’historique peut donc montrer un autre montant à cette date.',
    note: 'Note (facultatif)',
    notePlaceholder: 'Relevé du 30 novembre',
    difference:
      'Le budget enregistre la différence entre ce montant et les {{amount}} restant actuellement comme un seul ajustement à cette date.',
    save: 'Ajuster',
    done: 'Solde ajusté à {{amount}}.',
    deleted: 'Ajustement supprimé.',
    deleteTitle: 'Supprimer cet ajustement ?',
    deleteDescription:
      'L’ajustement de {{amount}} du {{date}} est supprimé : le montant restant change d’autant.',
    delete: 'Supprimer l’ajustement',
    deleteFor: 'Supprimer l’ajustement de {{amount}} du {{date}}',
    dateRange: 'Du {{min}}, ouverture de la dette, au {{max}}.',
  },
  payoff: {
    none: 'Pas de projection : la dette est terminée.',
    paidOff: 'Remboursée',
    never: 'Ne se termine jamais à ce rythme',
    neverHelp:
      'Le remboursement prévu ne couvre pas les intérêts. Augmentez-le pour voir une date de fin.',
    neverNoPayment: 'Prévoyez un remboursement mensuel pour voir quand elle sera remboursée.',
    ends: 'Se termine vers {{month}}',
    endsNoDate: 'Se termine',
    paymentsLeft_one: '1 remboursement restant',
    paymentsLeft_other: '{{count}} remboursements restants',
    estimate:
      'Une estimation : les prochaines dates de paie suivent le calendrier du revenu principal.',
    overpaid: 'Remboursée · trop-payé de {{amount}}',
    budgetEnded: 'Pas de projection : le budget est terminé.',
    unknown: 'Pas encore de projection.',
    noPayment: 'Aucun remboursement prévu',
    afterBudgetEnd: 'C’est après la fin du budget.',
  },
  endedBudget:
    'Le budget est terminé : une dette peut encore être ajoutée, modifiée ou terminée comme correction dès l’une de ses périodes, et des remboursements enregistrés dans ses périodes.',
  filterChip: 'Dette : {{name}}',
  endedNoEdit: 'Cette dette est terminée : elle ne peut plus être modifiée.',
  seeTransactions: 'Voir ses remboursements',
  frozenPayment:
    'C’est un remboursement de « {{name}} », qui est terminée : il ne peut plus être modifié ni supprimé.',
  frozenView: 'Afficher',
  frozenDelete: 'Sa dette est terminée : il reste tel quel.',
  endedErrors: {
    payment: 'Cette dette est terminée : elle ne reçoit plus de remboursement.',
    frozenPayment:
      'La dette de ce remboursement est terminée : il ne peut plus être modifié ni supprimé.',
    adjust: 'Cette dette est terminée : son solde ne peut plus être ajusté.',
    deleteAdjustment: 'Cette dette est terminée : ses ajustements ne peuvent plus être supprimés.',
    edit: 'Cette dette est terminée : elle ne peut plus être modifiée.',
  },
  payment: {
    dateRange: 'Du {{min}}, ouverture de « {{name}} », au {{max}}.',
    opened:
      'Les remboursements de « {{name}} » peuvent être datés dès le {{date}}, jour de son ouverture.',
    notInForce:
      '« {{name}} » n’était pas en vigueur à cette date : choisissez une autre date, ou aucune dette.',
    categoryFollows:
      'Les remboursements de « {{name}} » vont dans la catégorie de ses conditions à cette date.',
  },
  totalRemaining_one: 'Encore dû sur 1 dette',
  totalRemaining_other: 'Encore dû sur {{count}} dettes',
  empty: 'Aucune dette',
  emptyHelp:
    'Ajoutez un prêt ou un crédit pour le suivre jusqu’à zéro : les remboursements le diminuent, les intérêts s’ajoutent à chaque période.',
  listLabel: 'Dettes en cours',
  endedTitle: 'Dettes terminées',
  endedHelp: 'Leur historique et leur montant restant sont conservés.',
  remainingAmount: '{{amount}} restant',
  remaining: 'Restant',
  paidShare: '{{percent}} % remboursé',
  paidSoFar: '{{amount}} remboursé · {{percent}} %',
  backToList: 'Toutes les dettes',
  notFound: 'Cette dette n’existe pas',
  notFoundHelp: 'Elle a peut-être été supprimée par un autre membre.',
  recordPayment: 'Enregistrer un remboursement',
  actionsFor: 'Autres actions pour {{name}}',
  edit: 'Modifier',
  endedTitleOne: 'Cette dette est terminée',
  endedOneHelp:
    'Son historique est conservé. Aucun intérêt n’est ajouté, aucun nouveau remboursement ne peut être enregistré, et ses remboursements et ajustements ne peuvent plus être modifiés ni supprimés.',
  paid: 'Remboursé',
  interestAdded: 'Intérêts ajoutés',
  adjustments: 'Ajustements',
  principalWas: '{{amount}} dus à l’ouverture, le {{date}}.',
  projection: 'Fin attendue',
  chart: {
    title: 'Évolution',
    description: 'Le montant restant après chaque événement.',
    label_one:
      'Montant restant au fil du temps, 1 événement ; actuellement {{amount}}. Le tableau ci-dessous le détaille.',
    label_other:
      'Montant restant au fil du temps, {{count}} événements ; actuellement {{amount}}. Le tableau ci-dessous les détaille.',
    labelOverpaid_one:
      'Montant restant au fil du temps, 1 événement ; trop-payé actuellement de {{amount}}. Le tableau ci-dessous le détaille.',
    labelOverpaid_other:
      'Montant restant au fil du temps, {{count}} événements ; trop-payé actuellement de {{amount}}. Le tableau ci-dessous les détaille.',
    onlyOpened:
      'Seulement l’ouverture pour l’instant : {{amount}} dus depuis le {{date}}. Le graphique apparaît avec le premier remboursement ou les premiers intérêts.',
    nothing: 'Rien d’enregistré pour l’instant.',
    today: 'Aujourd’hui (aucun nouvel événement)',
    marksNote:
      'Avec autant d’événements, seuls les ajustements de solde sont marqués ; pointez la courbe pour voir chaque événement d’une date, ou lisez l’historique ci-dessous.',
    labelCapped:
      'Montant restant au fil du temps, les {{shown}} premiers événements, jusqu’au {{date}}. Le tableau ci-dessous les détaille.',
    capped:
      'Le graphique montre les {{shown}} premiers événements, jusqu’au {{date}} : l’historique est plus long. Le tableau ci-dessous continue jusqu’aux plus récents.',
  },
  history: {
    title: 'Historique',
    label: 'Historique de {{name}}, du plus ancien au plus récent',
    entry: 'Événement',
    amount: 'Montant',
    balance: 'Restant',
    kind: {
      opened: 'Ouverture',
      interest: 'Intérêts',
      adjustment: 'Ajustement',
      payment: 'Remboursement',
    },
    see: 'Voir',
    seePayment: 'Voir le remboursement de {{amount}} du {{date}} parmi les transactions',
    showMore: 'Afficher {{count}} de plus',
    shownSoFar_one: 'Le dernier événement affiché ; il y en a de plus anciens.',
    shownSoFar_other: 'Les {{count}} derniers événements affichés ; il y en a de plus anciens.',
    shownAll_one: '1 événement.',
    shownAll_other: 'Les {{count}} événements, du plus récent au plus ancien.',
    loadFailed: 'Les événements suivants n’ont pas pu être lus. Réessayez.',
  },
  overpaid: 'Trop-payé',
  overpaidHint: 'Plus a été remboursé que ce qui était dû.',
  overpaidAmount: '{{amount}} de trop-payé',
  nothingOwed: 'Plus rien à rembourser sur vos dettes',
  interestHint: 'Ajoutés au début de chaque période, selon le taux.',
  adjustmentsHint: 'Vos corrections pour correspondre au relevé bancaire (« Ajuster le solde »).',
  endedElsewhere:
    'Elle s’est terminée dès la période en cours : ces modifications ne peuvent donc pas être enregistrées. Fermez cette fenêtre ; son historique et son montant restant sont conservés.',
  changedNotShown:
    'Un autre membre a modifié entre-temps quelque chose que cette fenêtre n’affiche pas (un nom, un remboursement…). Rien n’a été enregistré ; vos saisies sont toujours là : enregistrez de nouveau.',
}

export const correctionsFr: Translation['corrections'] = {
  keptTyped_one:
    'Vous aviez saisi {{fields}} : c’est conservé. Les autres champs montrent maintenant les conditions de la période choisie.',
  keptTyped_other:
    'Vous aviez saisi {{fields}} : c’est conservé. Les autres champs montrent maintenant les conditions de la période choisie.',
  nothingToSave:
    'Rien à enregistrer : chaque champ est tel qu’il est enregistré. Modifiez un champ, ou fermez cette fenêtre.',
  period: 'Corriger à partir de la période',
  showsPeriodTerms:
    'Les champs ci-dessous montrent maintenant ce qui était en vigueur dans cette période. Ne changez que ce qui était faux : ce que vous laissez tel quel reste tel qu’il était.',
  reachUntil:
    'La correction s’applique du {{start}} jusqu’à la période qui se termine le {{end}} ; dès le {{next}}, les conditions enregistrées ensuite restent.',
  reachOn: 'La correction s’applique dès le {{start}}.',
  notInForce:
    'Il n’existait pas dans cette période (pas encore, ou plus) : il n’y a rien à y corriger. Choisissez une autre période.',
  budgetEnded:
    'Le budget est terminé : une modification ne s’applique que comme correction dès l’une de ses périodes.',
  changedNotShown:
    'Un autre membre a modifié entre-temps quelque chose que cette fenêtre n’affiche pas (le revenu principal, une première sous-catégorie…). Rien n’a été enregistré ; vos saisies sont toujours là : enregistrez de nouveau.',
}
