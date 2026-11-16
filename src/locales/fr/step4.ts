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
  },
  remove: {
    action: 'Terminer ou supprimer',
    deleteTitle: 'Supprimer « {{name}} » ?',
    endTitle: 'Terminer « {{name}} » ?',
    fromEarlier:
      'Dès la période choisie, il ne compte plus et aucun prélèvement n’est créé. S’il n’a jamais compté avant cette période et n’a aucun prélèvement, il est supprimé ; sinon il se termine là, et les périodes précédentes le conservent avec leurs prélèvements.',
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
    endOrDeleteTitle: 'Terminer ou supprimer « {{name}} » ?',
    endOrDelete: 'Terminer ou supprimer',
  },
  endedBudget: 'Le budget est terminé : les abonnements ne peuvent plus être ajoutés ni modifiés.',
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
    action: 'Terminer ou supprimer',
    deleteTitle: 'Supprimer « {{name}} » ?',
    endTitle: 'Terminer « {{name}} » ?',
    fromEarlier:
      'Dès la période choisie : plus d’intérêts ni de remboursement daté de là. Si elle n’a jamais compté avant cette période et n’a ni remboursement, ni intérêt, ni ajustement, elle est supprimée ; sinon elle se termine là et garde son historique.',
    deletes: 'Elle n’a encore ni remboursement, ni intérêt, ni ajustement : elle est supprimée.',
    ends: 'Elle se termine dès la période en cours (depuis le {{date}}) : plus d’intérêts ni de nouveaux remboursements. Son historique est conservé, tout comme son montant restant ({{amount}}).',
    endsNoPeriod:
      'Elle se termine : plus d’intérêts ni de nouveaux remboursements. Son historique est conservé.',
    earlierLabel: 'La terminer dès une période antérieure',
    earlierWarning:
      'Cela modifie des périodes passées : dès la période choisie, aucun intérêt n’est ajouté et aucun remboursement ne peut y être daté.',
    delete: 'Supprimer',
    end: 'Terminer la dette',
    endOrDeleteTitle: 'Terminer ou supprimer « {{name}} » ?',
    endOrDelete: 'Terminer ou supprimer',
  },
  adjust: {
    action: 'Ajuster le solde',
    title: 'Ajuster le solde',
    description: 'Faites correspondre le montant restant à votre relevé bancaire.',
    now: '« {{name}} » : {{amount}} restant actuellement.',
    balance: 'Solde sur votre relevé',
    balanceHelp: 'Ce que la banque indique que vous devez encore.',
    date: 'Date du relevé',
    note: 'Note (facultatif)',
    notePlaceholder: 'Relevé du 30 novembre',
    difference:
      'Le budget enregistre la différence entre ce solde et le montant restant comme un ajustement : les remboursements enregistrés entre-temps restent comptés.',
    save: 'Ajuster',
    done: 'Solde ajusté à {{amount}}.',
    deleted: 'Ajustement supprimé.',
    deleteTitle: 'Supprimer cet ajustement ?',
    deleteDescription:
      'L’ajustement de {{amount}} du {{date}} est supprimé : le montant restant change d’autant.',
    delete: 'Supprimer l’ajustement',
    deleteFor: 'Supprimer l’ajustement de {{amount}} du {{date}}',
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
  },
  endedBudget: 'Le budget est terminé : les dettes ne peuvent plus être ajoutées ni modifiées.',
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
    'Son historique est conservé. Aucun intérêt n’est ajouté et aucun nouveau remboursement ne peut être enregistré.',
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
    onlyOpened:
      'Seulement l’ouverture pour l’instant : {{amount}} dus depuis le {{date}}. Le graphique apparaît avec le premier remboursement ou les premiers intérêts.',
    nothing: 'Rien d’enregistré pour l’instant.',
    today: 'Aujourd’hui (aucun nouvel événement)',
    marksNote:
      'Avec autant d’événements, seuls les ajustements de solde sont marqués ; pointez la courbe pour voir chaque événement d’une date, ou lisez l’historique ci-dessous.',
  },
  history: {
    title: 'Historique',
    label: 'Historique de {{name}}, du plus récent au plus ancien',
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
    showLatest: 'N’afficher que les {{count}} derniers',
    showAll: 'Afficher les {{count}} événements',
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
  period: 'Corriger à partir de la période',
  showsPeriodTerms:
    'Les champs ci-dessous montrent maintenant ce qui était en vigueur dans cette période. Ne changez que ce qui était faux : ce que vous laissez tel quel reste tel qu’il était.',
}
