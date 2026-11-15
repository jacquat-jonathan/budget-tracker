import type { Translation } from '@/locales/en/translation'

// French typography: a narrow no-break space (U+202F) precedes ? ! : and ;.
export const fr: Translation = {
  app: {
    name: 'Budget Tracker',
    tagline: 'Le budget de votre ménage, période après période.',
  },
  common: {
    loading: 'Chargement…',
    saving: 'Enregistrement…',
    save: 'Enregistrer',
    cancel: 'Annuler',
    actions: 'Actions',
    comingSoon: {
      title: 'Bientôt disponible',
      description: 'Cette section est en préparation. Elle apparaîtra ici dès qu’elle sera prête.',
    },
  },
  nav: {
    label: 'Menu',
    dashboard: 'Tableau de bord',
    budget: 'Budget',
    transactions: 'Transactions',
    subscriptions: 'Abonnements',
    debts: 'Dettes',
    periods: 'Périodes',
    moneyFlow: 'Flux financiers',
    income: 'Revenus',
    settings: 'Paramètres',
    newBudget: 'Nouveau budget',
  },
  pages: {
    dashboard: { description: 'Votre période en cours en un coup d’œil.' },
    budget: {
      description: 'Catégories, sous-catégories et montants prévus chaque mois.',
    },
    transactions: { description: 'Toutes vos dépenses et rentrées, période après période.' },
    subscriptions: { description: 'Vos frais récurrents et la date du prochain prélèvement.' },
    debts: {
      description: 'Ce que vous devez, son évolution et la date prévue du dernier remboursement.',
    },
    periods: {
      description: 'D’un jour de paie au suivant, de la plus récente à la plus ancienne.',
    },
    moneyFlow: {
      description: 'La répartition de votre argent entre vos comptes après le jour de paie.',
    },
    income: { description: 'Les revenus qui composent votre budget mensuel.' },
    settings: { description: 'Le budget, les personnes qui le partagent et votre compte.' },
  },
  userMenu: {
    open: 'Ouvrir le menu du compte',
    signOut: 'Se déconnecter',
    fallbackName: 'Compte',
  },
  language: {
    label: 'Langue',
    en: 'English',
    fr: 'Français',
  },
  theme: {
    label: 'Thème',
    light: 'Clair',
    dark: 'Sombre',
    system: 'Système',
  },
  fields: {
    email: 'E-mail',
    emailPlaceholder: 'vous@exemple.ch',
    password: 'Mot de passe',
    newPassword: 'Nouveau mot de passe',
    confirmPassword: 'Confirmer le mot de passe',
    displayName: 'Nom affiché',
    displayNamePlaceholder: 'Comment souhaitez-vous qu’on vous appelle ?',
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',
    datePlaceholder: 'jj.mm.aaaa',
  },
  validation: {
    emailRequired: 'Saisissez votre adresse e-mail.',
    emailInvalid: 'Saisissez une adresse e-mail valide.',
    passwordRequired: 'Saisissez votre mot de passe.',
    passwordTooShort: 'Utilisez au moins {{min}} caractères.',
    passwordsDontMatch: 'Les mots de passe ne correspondent pas.',
    displayNameRequired: 'Saisissez un nom affiché.',
    displayNameTooLong: 'Utilisez au maximum {{max}} caractères.',
    nameRequired: 'Saisissez un nom.',
    nameTooLong: 'Utilisez au maximum 100 caractères.',
    amountRequired: 'Saisissez un montant.',
    amountInvalid: 'Saisissez un montant comme 5200 ou 5’200.50.',
    amountTooSmall: 'Le montant doit être supérieur à zéro.',
    amountTooLarge: 'Le montant ne peut pas dépasser CHF 10’000’000.',
    dateRequired: 'Saisissez une date.',
    dateInvalid: 'Saisissez une date au format jj.mm.aaaa, par exemple 25.01.2027.',
  },
  auth: {
    signIn: {
      title: 'Connexion',
      description: 'Bon retour parmi nous. Connectez-vous pour accéder à votre budget.',
      submit: 'Se connecter',
      forgotPassword: 'Mot de passe oublié ?',
      noAccount: 'Pas encore de compte ?',
      signUpLink: 'Créer un compte',
    },
    signUp: {
      title: 'Créer votre compte',
      description: 'Cela ne prend qu’une minute.',
      submit: 'Créer le compte',
      haveAccount: 'Vous avez déjà un compte ?',
      signInLink: 'Se connecter',
      checkInbox: {
        title: 'Consultez votre boîte de réception',
        description:
          'Nous avons envoyé un lien de confirmation à {{email}}. Ouvrez-le pour activer votre compte, puis connectez-vous.',
      },
    },
    forgotPassword: {
      title: 'Réinitialiser le mot de passe',
      description:
        'Indiquez votre adresse e-mail et nous vous enverrons un lien pour choisir un nouveau mot de passe.',
      submit: 'Envoyer le lien',
      sent: {
        title: 'Consultez votre boîte de réception',
        description:
          'Si un compte est associé à {{email}}, vous recevrez sous peu un lien pour réinitialiser votre mot de passe.',
      },
    },
    resetPassword: {
      title: 'Choisir un nouveau mot de passe',
      description: 'Saisissez un nouveau mot de passe pour le compte {{email}}.',
      submit: 'Enregistrer le mot de passe',
      cancel: 'Annuler et se déconnecter',
    },
    backToSignIn: 'Retour à la connexion',
    actions: {
      resendConfirmation: 'Renvoyer l’e-mail de confirmation',
      requestPasswordReset: 'Demander un nouveau lien de réinitialisation',
    },
    linkError: {
      title: 'Ce lien ne fonctionne plus',
      expired:
        'Les liens envoyés par e-mail expirent au bout d’un certain temps et ne servent qu’une fois.',
      invalid: 'Ce lien est incomplet ou n’est pas valable.',
      networkTitle: 'Impossible de vérifier ce lien',
      network:
        'Le serveur est injoignable, votre lien n’a donc pas été utilisé. Vérifiez votre connexion, puis réessayez.',
      retry: 'Réessayer',
      signedInAs: 'La session de {{email}} reste ouverte. Ce lien n’a rien modifié sur ce compte.',
      continue: 'Continuer vers l’application',
      signOutForNew: 'Se déconnecter pour demander un nouveau lien',
    },
    resendConfirmation: {
      title: 'Renvoyer l’e-mail de confirmation',
      description:
        'Indiquez l’adresse e-mail utilisée lors de l’inscription et nous vous enverrons un nouveau lien de confirmation.',
      submit: 'Envoyer le lien',
      sent: {
        title: 'Consultez votre boîte de réception',
        description:
          'Si un compte associé à {{email}} attend une confirmation, un nouveau lien est en route.',
      },
    },
    errors: {
      invalidCredentials: 'E-mail ou mot de passe incorrect.',
      emailNotConfirmed:
        'Confirmez d’abord votre adresse e-mail en ouvrant le lien que nous vous avons envoyé.',
      userAlreadyExists: 'Un compte existe déjà avec cette adresse e-mail.',
      weakPassword: 'Ce mot de passe est trop faible. Choisissez-en un plus long ou moins courant.',
      samePassword: 'Choisissez un mot de passe différent de l’actuel.',
      rateLimited: 'Trop de tentatives. Patientez un instant, puis réessayez.',
      network: 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.',
      generic: 'Une erreur s’est produite. Veuillez réessayer.',
    },
    accountSwitched: {
      title: 'Vous êtes maintenant connecté·e en tant que {{email}}',
      description:
        'Le lien que vous avez ouvert était destiné à {{email}} : ce navigateur est donc passé sur ce compte. {{previous}} n’est plus connecté·e ici.',
      descriptionNoPrevious:
        'Le lien que vous avez ouvert était destiné à {{email}} : ce navigateur est donc passé sur ce compte.',
      unknownAccount: 'un autre compte',
      dismiss: 'Compris',
    },
  },
  notFound: {
    title: 'Page introuvable',
    description: 'La page que vous cherchez n’existe pas ou a été déplacée.',
    backHome: 'Retour au tableau de bord',
  },
  errorPage: {
    title: 'Une erreur s’est produite',
    description: 'Une erreur inattendue est survenue. Recharger la page suffit généralement.',
    reload: 'Recharger la page',
  },
  config: {
    missingTitle: 'L’application n’est pas configurée',
    missingDescription:
      'Ces variables d’environnement sont manquantes : {{names}}. Copiez .env.example vers .env.local, renseignez-les, puis redémarrez le serveur de développement ou relancez le build.',
  },
  states: {
    loadFailed: 'Impossible de charger ces données',
    retry: 'Réessayer',
  },
  errors: {
    forbidden: 'Vous n’avez pas le droit de faire cela.',
    invalidValue: 'Une des valeurs n’est pas acceptée. Vérifiez le formulaire et réessayez.',
    network: 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.',
    generic: 'Une erreur s’est produite. Veuillez réessayer.',
    db: {
      not_authenticated: 'Votre session a expiré. Reconnectez-vous.',
      budget_not_found: 'Ce budget n’existe plus, ou vous n’en êtes plus membre.',
      income_not_found: 'Ce revenu n’existe plus.',
      period_not_found: 'Cette période n’existe plus.',
      member_not_found: 'Cette personne n’est pas membre du budget.',
      invitation_not_found: 'Cette invitation n’existe plus ou a expiré.',
      not_owner: 'Seul·e le ou la propriétaire du budget peut faire cela.',
      owner_cannot_leave:
        'Le ou la propriétaire ne peut pas quitter le budget. Supprimez-le plutôt.',
      member_has_primary_income:
        'Le revenu de ce membre est le revenu principal. Désignez d’abord un autre revenu principal.',
      already_member: 'Cette personne est déjà membre du budget.',
      invalid_name: 'Saisissez un nom de 1 à 100 caractères.',
      invalid_amount: 'Le montant doit être compris entre CHF 0.01 et CHF 10’000’000.',
      invalid_pay_day: 'Le jour de paie doit être compris entre 1 et 31.',
      invalid_weekend_rule: 'Choisissez une des règles de week-end.',
      invalid_email: 'Saisissez une adresse e-mail valide.',
      invalid_start_month:
        'Choisissez un mois dont le jour de paie est déjà passé, au plus 60 mois en arrière.',
      invalid_end_date: 'La date de fin peut être au plus dans dix ans.',
      invalid_boundary:
        'Cette date ne convient pas : un salaire peut être au plus à 14 jours de sa date prévue, et une période ne peut être ni vide ni empiéter sur la suivante.',
      invalid_period:
        'Ce revenu n’existait pas encore pendant cette période. Choisissez-en une plus récente.',
      end_date_before_last_period:
        'Cette date de fin précède des périodes qui existent déjà. Choisissez une date plus tardive.',
      boundary_after_today: 'Cette limite ne peut pas être déplacée à aujourd’hui ou plus tard.',
      income_is_primary: 'C’est le revenu principal. Désignez d’abord un autre revenu principal.',
      income_ended: 'Ce revenu a pris fin et ne peut plus être modifié.',
      income_not_in_force:
        'Ce revenu ne commence que dans une période ultérieure : il ne peut pas encore être le revenu principal.',
      budget_ended:
        'Ce budget est terminé : il n’y a pas de période en cours à laquelle appliquer ce changement.',
      budget_limit_reached: 'Vous possédez déjà 20 budgets, le maximum autorisé.',
      member_limit_reached: 'Ce budget compte déjà 20 membres, le maximum autorisé.',
      invitation_limit_reached:
        'Ce budget a déjà 20 invitations en attente. Annulez-en une avant d’inviter quelqu’un d’autre.',
      income_limit_reached:
        'Ce budget compte déjà le maximum de revenus autorisé (50 en vigueur, ou 500 au total).',
    },
  },
  confirm: {
    typeToConfirm: 'Saisissez « {{text}} » pour confirmer',
  },
  budgetSwitcher: {
    open: 'Budget actuel : {{name}}. Changer de budget',
    label: 'Vos budgets',
    current: 'Budget actuel',
    create: 'Créer un budget',
  },
  budgetEnded: {
    title: 'Ce budget est terminé',
  },
  welcome: {
    title: 'Bienvenue',
    greeting: 'Bienvenue, {{name}}',
    greetingNoName: 'Bienvenue',
    description:
      'Créez votre premier budget pour commencer, ou rejoignez celui auquel on vous a invité·e.',
    signedInAs: 'Connecté·e en tant que {{email}}.',
    createTitle: 'Créer votre budget',
    createDescription:
      'Un budget part de votre revenu et va d’un jour de paie au suivant. Vous pourrez ensuite ajouter d’autres revenus et inviter d’autres personnes.',
  },
  budgets: {
    fields: {
      name: 'Nom du budget',
      namePlaceholder: 'Ménage',
      endDateOptional: 'Date de fin (facultative)',
      endDateHelp:
        'Laissez vide pour un budget sans fin. Le budget se termine avec la période du mois de cette date.',
      startMonth: 'Premier mois',
    },
    create: {
      description: 'Un nouveau budget avec son premier revenu. Il devient votre budget actuel.',
      budgetSection: 'Budget',
      incomeSection: 'Premier revenu',
      incomeHelp:
        'Votre revenu, qui sera le revenu principal : son jour de paie ouvre chaque période. Vous pourrez le changer plus tard.',
      startSection: 'Commencer le suivi',
      startMonthCurrent: '{{month}} (la période en cours)',
      startMonthOption: '{{month}}',
      firstPeriodStarts: 'La première période commence le {{date}}.',
      earlierHelp:
        'Choisissez un mois antérieur pour saisir des dépenses passées ; les périodes depuis ce mois sont aussi créées.',
      submit: 'Créer le budget',
      success: 'Budget « {{name}} » créé.',
    },
  },
  invitations: {
    title: 'Inviter quelqu’un',
    noEmailTitle: 'Aucun e-mail n’est envoyé',
    noEmailDescription:
      'Prévenez la personne vous-même. Elle verra l’invitation dans l’application dès qu’elle se connectera avec un compte dont l’adresse confirmée est celle-ci, et pourra alors l’accepter ou la refuser.',
    email: 'Adresse e-mail',
    invite: 'Inviter',
    sent: 'Invitation pour {{email}} enregistrée. Prévenez la personne.',
    pending: 'Invitations en attente',
    none: 'Aucune invitation en attente.',
    invitedOn: 'Invitée le {{date}}, valable jusqu’au {{expires}}',
    renew: 'Renouveler',
    renewFor: 'Renouveler l’invitation de {{email}} pour 30 jours',
    renewed: 'L’invitation de {{email}} est valable 30 jours de plus.',
    alreadyGone: 'Cette invitation a déjà été acceptée, refusée ou annulée.',
    cancel: 'Annuler l’invitation',
    cancelFor: 'Annuler l’invitation de {{email}}',
    cancelled: 'Invitation de {{email}} annulée.',
    mine: {
      title: 'Invitations pour vous',
      description: 'On vous a invité·e à partager ces budgets.',
      from: 'De {{name}} ({{email}})',
      dates: 'Envoyée le {{sent}}, valable jusqu’au {{expires}}',
      gone: 'Cette invitation a expiré ou a été annulée.',
      accept: 'Accepter',
      decline: 'Refuser',
      accepted: 'Vous avez rejoint « {{name}} ».',
      declined: 'Invitation à « {{name}} » refusée.',
    },
  },
  members: {
    title: 'Membres',
    description: 'Chaque membre voit et modifie tout le contenu du budget.',
    you: '{{name}} (vous)',
    unknownName: 'Membre sans nom',
    role: {
      owner: 'Propriétaire',
      member: 'Membre',
    },
    remove: 'Retirer',
    removeTitle: 'Retirer {{name}} ?',
    removeDescription:
      'Cette personne n’aura plus accès au budget. Ses revenus cessent de compter dès la période en cours ; les périodes passées les conservent.',
    removed: '{{name}} a été retiré·e du budget.',
    removePrimaryHelp:
      'Son revenu est le revenu principal : désignez d’abord un autre revenu principal.',
    leave: 'Quitter le budget',
    leaveTitle: 'Quitter « {{name}} » ?',
    leaveDescription:
      'Vous n’aurez plus accès à ce budget. Vos revenus cessent de compter dès la période en cours ; les périodes passées les conservent. Pour revenir, il faudra une nouvelle invitation.',
    left: 'Vous avez quitté « {{name}} ».',
    leavePrimaryHelp:
      'Votre revenu est le revenu principal : désignez d’abord un autre revenu principal.',
    ownerCannotLeave:
      'En tant que propriétaire, vous ne pouvez pas quitter ce budget ; vous pouvez le supprimer.',
    manageOwnerOnly:
      'Seul·e le ou la propriétaire peut inviter des personnes et retirer des membres.',
  },
  dashboard: {
    period: {
      title: 'Période en cours',
      allPeriods: 'Toutes les périodes',
      dayOf: 'Jour {{day}} sur {{total}}',
      daysLeft_one: 'Encore {{count}} jour',
      daysLeft_other: 'Encore {{count}} jours',
      incomeTotal: 'Revenus de la période',
      nextPayDay: 'Prochain jour de paie',
      nextPayDayOf: '{{name}}',
    },
    ended: {
      title: 'Ce budget est terminé',
      description:
        'Sa dernière période s’est terminée le {{date}}. Aucune nouvelle période n’est créée.',
      descriptionNoDate: 'Il n’a pas de période en cours : aucune nouvelle période n’est créée.',
      seePeriods: 'Voir les périodes passées',
      settings: 'Paramètres du budget',
    },
  },
  income: {
    add: 'Ajouter un revenu',
    addTitle: 'Ajouter un revenu',
    addDescription: 'Un revenu mensuel qui compte dans le total du budget.',
    editTitle: 'Modifier le revenu',
    editDescription: 'Changez le nom ou les conditions de ce revenu.',
    added: 'Revenu « {{name}} » ajouté.',
    saved: 'Revenu « {{name}} » enregistré.',
    edit: 'Modifier',
    makePrimary: 'Définir comme principal',
    madePrimary: '« {{name}} » est maintenant le revenu principal.',
    remove: 'Supprimer',
    removeTitle: 'Supprimer « {{name}} » ?',
    removeDescription: 'Il cesse de compter dans le budget dès la période en cours.',
    removeFromEarlier:
      'Il cesse de compter à partir de la période choisie, ce qui modifie des totaux passés.',
    correctionAppliesFrom:
      'Les nouvelles conditions s’appliquent dès la période choisie : les totaux de cette période et des suivantes changent.',
    closesNowTitle: 'Enregistrer clôt la période en cours maintenant',
    closesNow:
      'Avec ce jour de paie, le salaire de {{month}} est dû le {{date}}, date déjà passée : la période en cours se termine et celle de {{month}} commence ce jour-là.',
    correction: {
      label: 'Corriger une période passée',
      removeLabel: 'Le supprimer depuis une période passée',
      help: 'Seulement pour corriger une erreur : normalement, un changement s’applique dès la période en cours.',
      from: 'Appliquer dès',
      removeFrom: 'Supprimer dès',
      warning:
        'Cela modifie des périodes passées : leurs totaux de revenus sont recalculés dès la période choisie.',
    },
    removeHistory:
      'S’il a déjà compté dans une période passée, il y est conservé et prend simplement fin ; sinon, il est effacé.',
    removedEnded: '« {{name}} » a pris fin. Les périodes passées le comptent toujours.',
    removedDeleted: '« {{name}} » effacé.',
    primary: 'Principal',
    primaryCannotRemove:
      'Le revenu principal ne peut pas être supprimé. Désignez d’abord un autre revenu principal.',
    monthlyTotal: 'Total mensuel',
    nextPayDate: 'Prochaine paie',
    actionsFor: 'Actions pour {{name}}',
    empty: 'Aucun revenu pour l’instant',
    payDayOption: 'Le {{day}}',
    payDayWithRule: 'Le {{day}}, {{rule}}',
    endedTitle: 'Revenus terminés',
    endedHelp: 'Ils ne comptent plus, mais les périodes passées les conservent.',
    endedLabel: 'Terminé',
    lastCounted: 'Compté pour la dernière fois dans la période close le {{date}}',
    endedDescription:
      'Pas de période en cours : les revenus ne peuvent plus être ajoutés ni modifiés. Le ou la propriétaire peut supprimer ou déplacer la date de fin dans les paramètres.',
    endedNoAdd: 'Le budget est terminé.',
    endedNoEdit: 'Le budget est terminé : les conditions ne peuvent plus changer.',
    addAppliesFrom:
      'Il compte dès la période en cours, sauf si vous en choisissez une plus ancienne. Les périodes passées ne changent pas autrement.',
    editAppliesFrom:
      'Les nouvelles conditions s’appliquent dès la période en cours, commencée le {{date}}. Les périodes passées gardent leurs conditions.',
    editAppliesFromNoPeriod:
      'Les nouvelles conditions s’appliquent dès la période en cours. Les périodes passées gardent les leurs.',
    editPrimaryNote:
      'C’est le revenu principal : la période en cours garde son début, et sa fin passe à la veille de la prochaine paie (sauf si vous l’avez fixée à la main).',
    owner: {
      deletedAccount: 'Compte supprimé',
      formerMember: 'Ancien membre',
      formerMemberNamed: '{{name}} (ancien membre)',
    },
    fields: {
      name: 'Nom',
      namePlaceholder: 'Salaire',
      owner: 'Revenu de',
      ownerHelp: 'Le vôtre, sauf si vous choisissez un autre membre.',
      amount: 'Montant mensuel',
      payDay: 'Jour de paie',
      payDayHelp:
        'Le jour du mois où il est versé. 29, 30 ou 31 signifie le dernier jour des mois plus courts.',
      weekendRule: 'Quand le jour de paie tombe un week-end',
      weekendRuleHelp:
        'La plupart des employeurs paient un jour ouvrable. Choisissez ce que fait le vôtre.',
      from: 'Compte à partir de',
      fromCurrent: 'La période en cours',
      fromPeriod: '{{month}} (du {{start}} au {{end}})',
      fromHelp:
        'Choisissez une période plus ancienne si ce revenu était déjà versé à ce moment-là.',
    },
    weekendRule: {
      nearest: {
        label: 'Jour ouvrable le plus proche',
        short: 'jour ouvrable le plus proche',
        description: 'Le samedi passe au vendredi d’avant, le dimanche au lundi d’après.',
      },
      previous: {
        label: 'Vendredi d’avant',
        short: 'vendredi d’avant',
        description: 'Le samedi et le dimanche passent tous deux au vendredi d’avant.',
      },
      next: {
        label: 'Lundi d’après',
        short: 'lundi d’après',
        description: 'Le samedi et le dimanche passent tous deux au lundi d’après.',
      },
      none: {
        label: 'Le jour même',
        short: 'même le week-end',
        description: 'Versé ce jour-là, même un samedi ou un dimanche.',
      },
    },
  },
  periods: {
    description:
      'Une période par mois : chacune commence le jour du salaire de ce mois et se termine la veille du suivant.',
    empty: 'Aucune période pour l’instant',
    current: 'En cours',
    manualStart: 'Début fixé à la main',
    manualEnd: 'Fin fixée à la main',
    budgetEnd: 'Dernier mois',
    projectedEnd: 'se termine la veille du prochain salaire prévu',
    incomeTotal: 'Revenus',
    actionsFor: 'Actions pour {{month}}',
    actions: {
      arrived: 'Le salaire de {{month}} est arrivé un autre jour',
      notYet: 'Le salaire de {{month}} n’est pas encore arrivé',
      nextEarly: 'Le salaire de {{month}} est arrivé en avance',
      resetStart: 'Rétablir le début selon le calendrier',
      resetEnd: 'Rétablir la fin selon le calendrier',
    },
    dialogDescription:
      'Quand un salaire n’arrive pas le jour habituel, par exemple à cause d’un jour férié. Chaque période commence le jour où arrive son salaire.',
    scheduledOn: 'Le salaire de {{month}} est prévu le {{date}}.',
    fields: {
      arrivedOn: 'Jour d’arrivée du salaire de {{month}}',
      expectedOn: 'Jour où le salaire de {{month}} est désormais attendu',
    },
    fourteenDays: 'Au plus 14 jours avant ou après la date prévue.',
    preview: {
      moved: '{{previous}} se terminera le {{end}}, et {{month}} commencera le {{start}}.',
      notYet:
        'La période de {{month}} est retirée pour l’instant, et {{previous}} redevient la période en cours jusqu’au {{end}}. Elle reviendra à l’arrivée du salaire.',
      closes:
        'Cette période se terminera le {{end}}, et la période de {{next}} commence le {{start}}.',
      endsEarlier:
        'Cette période se terminera le {{end}} : le salaire de {{next}} est attendu le {{start}}.',
    },
    saved: 'Périodes mises à jour.',
    reset: 'Rétablir selon le calendrier',
    resetTitle: 'Rétablir cette limite selon le calendrier ?',
    resetDescription:
      'La période de {{month}} recommence à sa date de paie prévue, le {{date}}, et la période précédente se termine la veille.',
    resetDescriptionLatest:
      'La période en cours se termine de nouveau la veille du prochain salaire prévu, et suit le calendrier désormais.',
    resetComesBack:
      'Une période close en avance est rouverte, et une période retirée parce que son salaire n’était pas arrivé revient une fois cette date passée.',
    resetDone: 'La limite suit de nouveau le calendrier.',
    endedDescription:
      'Sa dernière période s’est terminée le {{date}} ; aucune nouvelle période n’est créée.',
  },
  settings: {
    budget: {
      title: 'Budget',
      description: 'Nom, date de fin et suppression du budget actuel.',
      rename: 'Renommer',
      renamed: 'Budget renommé.',
      endDate: 'Date de fin',
      endsWith: 'Le budget se termine avec la période de {{month}}, le {{date}}.',
      noEndDate: 'Pas de date de fin : le budget continue indéfiniment.',
      endDateHelp:
        'Le budget se termine avec la période du mois de cette date ; son dernier jour suit le salaire de ce mois. Laissez vide et enregistrez, ou supprimez-la, pour un budget sans fin.',
      saveEndDate: 'Enregistrer la date de fin',
      clearEndDate: 'Continuer indéfiniment',
      endDateSet: 'Le budget se termine maintenant le {{date}}.',
      endDateCleared: 'Le budget continue maintenant indéfiniment.',
      endDateOwnerOnly: 'Seul·e le ou la propriétaire peut modifier la date de fin.',
      deleteTitle: 'Supprimer le budget',
      deleteHelp:
        'Supprime le budget et tout son contenu, pour tous les membres. Cette action est irréversible.',
      delete: 'Supprimer le budget',
      deleteConfirmTitle: 'Supprimer « {{name}} » ?',
      deleteConfirmDescription:
        'Ses revenus, ses périodes et tout le reste sont supprimés pour tous les membres. Cette action est irréversible.',
      deleted: 'Budget « {{name}} » supprimé.',
      alreadyDeleted: 'Ce budget a déjà été supprimé.',
      deleteOwnerOnly: 'Seul·e le ou la propriétaire peut supprimer le budget.',
    },
    account: {
      title: 'Mon compte',
      description:
        'Connecté·e en tant que {{email}}. Votre nom affiché est celui que voient les autres membres.',
      descriptionNoEmail: 'Votre nom affiché est celui que voient les autres membres.',
      saved: 'Nom affiché enregistré.',
    },
  },
  ui: {
    close: 'Fermer',
    more: 'Plus',
    breadcrumb: 'Fil d’Ariane',
    sidebar: {
      title: 'Navigation',
      description: 'Navigation principale de l’application.',
      toggle: 'Afficher ou masquer le menu',
    },
  },
}
