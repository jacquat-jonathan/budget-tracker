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
        'Cette date ne convient pas : chaque période doit durer de 7 à 92 jours, et la date doit se trouver dans la plage indiquée sous le champ.',
      invalid_period:
        'Ce revenu n’existait pas encore pendant cette période. Choisissez-en une plus récente.',
      end_date_before_last_period:
        'Cette date de fin précède des périodes qui existent déjà. Choisissez une date plus tardive.',
      income_is_primary: 'C’est le revenu principal. Désignez d’abord un autre revenu principal.',
      income_ended: 'Ce revenu a pris fin et ne peut plus être modifié.',
      income_not_in_force:
        'Ce revenu n’est pas en vigueur dans la période en cours (il commence plus tard ou a pris fin) : il ne peut pas être le revenu principal.',
      budget_ended:
        'Ce budget est terminé : il n’y a pas de période en cours à laquelle appliquer ce changement.',
      budget_limit_reached: 'Vous possédez déjà 20 budgets, le maximum autorisé.',
      member_limit_reached: 'Ce budget compte déjà 20 membres, le maximum autorisé.',
      invitation_limit_reached:
        'Ce budget a déjà 20 invitations en attente. Annulez-en une avant d’inviter quelqu’un d’autre.',
      record_changed:
        'Quelqu’un d’autre a modifié cet élément entre-temps. L’affichage a été actualisé : vérifiez-le, puis refaites votre modification.',
      invalid_revision:
        'Cette modification n’a pas pu être comparée à la dernière version. Rechargez la page et réessayez.',
      category_not_found: 'Cette catégorie n’existe plus.',
      transaction_not_found: 'Cette transaction n’existe plus.',
      invalid_cadence: 'Choisissez par mois ou par an.',
      invalid_kind: 'Choisissez une dépense, un remboursement ou un revenu supplémentaire.',
      invalid_description: 'La note peut compter au plus 500 caractères.',
      invalid_date: 'Saisissez une date valide.',
      invalid_category: 'Un revenu supplémentaire n’a pas de catégorie.',
      invalid_parent: 'Une sous-catégorie ne peut pas avoir ses propres sous-catégories.',
      invalid_limit: 'Cette liste n’a pas pu être chargée. Réessayez.',
      invalid_cursor: 'La suite de cette liste n’a pas pu être chargée. Rechargez-la.',
      date_outside_periods:
        'Cette date est en dehors des périodes du budget : elle doit se situer entre le début de la première période et aujourd’hui.',
      category_required: 'Choisissez une catégorie.',
      category_is_group:
        'Cette catégorie a des sous-catégories : choisissez-en une (une catégorie avec sous-catégories n’a pas de montant propre).',
      category_not_in_force:
        'Cette catégorie n’était pas utilisée dans la période de cette date. Choisissez une autre catégorie ou une autre date.',
      category_ended: 'Cette catégorie a pris fin (pour cette période).',
      other_name_required:
        'Il faut un nom pour la sous-catégorie qui reprend ce que contenait la catégorie.',
      category_limit_reached:
        'Ce budget contient déjà le maximum de catégories (200 en usage, ou 2000 au total).',
      transaction_limit_reached:
        'Ce budget contient déjà 200 000 transactions, le maximum possible.',
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
        'Laissez vide pour un budget sans fin. Le budget se termine avec la période qui contient cette date.',
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
      nextPayDayOfManual: '{{name}}, date fixée à la main',
      budgetEnds: 'Fin du budget',
      lastPeriodHelp: 'C’est la dernière période du budget : aucune nouvelle période ne commence ensuite.',
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
    correction: {
      label: 'Corriger une période passée',
      removeLabel: 'Le supprimer depuis une période passée',
      help: 'Seulement pour corriger une erreur : normalement, un changement s’applique dès la période en cours.',
      from: 'Appliquer dès',
      removeFrom: 'Supprimer dès',
      warning:
        'Cela modifie des périodes passées : leurs totaux de revenus sont recalculés dès la période choisie jusqu’au prochain changement déjà enregistré.',
    },
    correctionAppliesFrom:
      'Les nouvelles conditions s’appliquent dès la période choisie jusqu’au prochain changement déjà enregistré : les totaux de ces périodes changent.',
    editPrimaryNote:
      'C’est le revenu principal : aucune période déjà commencée ne bouge. Seule la fin prévue de la période en cours suit la nouvelle date de paie (sauf si vous l’avez fixée à la main), jamais avant aujourd’hui.',
    primaryTitle: 'Faire de « {{name}} » le revenu principal ?',
    primaryDescription:
      'Les périodes suivent alors le jour de paie de ce revenu. Les périodes déjà commencées ne bougent pas.',
    preview: {
      checking: 'Vérification de la date du prochain salaire…',
      failed: 'Impossible de vérifier la date du prochain salaire : {{reason}}',
      expected:
        'Le prochain salaire serait alors attendu le {{date}} : la période en cours se terminerait le {{end}}.',
      manual:
        'La fin de la période en cours a été fixée à la main et reste telle quelle : {{end}}.',
      arrivedDue:
        'Avec ce jour de paie, le salaire de ce mois était dû le {{date}}. Après l’enregistrement, on vous demandera s’il est déjà arrivé.',
      arrivedDueMoveStart:
        'Avec ce jour de paie, le salaire de cette période était dû le {{date}}, quelques jours après son début. Après l’enregistrement, on vous demandera s’il faut déplacer le début de la période à ce jour.',
      lastPeriod: 'La période en cours, la dernière du budget, se terminerait le {{end}}.',
    },
    arrivedPrompt: {
      title: 'Ce salaire est-il déjà arrivé ?',
      description:
        'Avec le nouveau jour de paie, le salaire de ce mois était dû le {{date}}. S’il est arrivé, enregistrez-le ; sinon, la période en cours continue jusqu’au salaire du mois prochain.',
      notYet: 'Pas encore',
      keepStart: 'Non, le garder',
      moveStartTitle: 'Le salaire de cette période est-il arrivé le {{date}} ?',
      moveStartDescription:
        'Avec le nouveau jour de paie, le salaire qui a ouvert cette période le {{start}} était dû le {{date}}. S’il est vraiment arrivé le {{date}}, déplacez le début de la période à ce jour : la période précédente se termine alors la veille.',
      moveStart: 'Déplacer le début',
      record: 'Enregistrer la date de paie',
    },
    savedNextExpected:
      'Revenu « {{name}} » enregistré. Le prochain salaire est désormais attendu le {{date}}.',
    madePrimaryNextExpected:
      '« {{name}} » est maintenant le revenu principal. Le prochain salaire est désormais attendu le {{date}}.',
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
      fromPeriod: '{{start}} – {{end}}',
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
      'Chaque période va d’un salaire à la veille du suivant. Les périodes passées restent telles quelles.',
    empty: 'Aucune période pour l’instant',
    current: 'En cours',
    manualStart: 'Début fixé à la main',
    manualEnd: 'Fin fixée à la main',
    lastPeriod: 'Dernière période',
    nextExpected: 'Prochain salaire attendu le {{date}} (prévision).',
    nextExpectedManual: 'Prochain salaire attendu le {{date}} (fixé à la main).',
    lastPeriodNote: 'Dernière période du budget : elle se termine le {{date}}, et aucune période ne commence ensuite.',
    manualCurrentHint:
      'Fixée à la main : elle reste telle quelle quand le jour de paie change, jusqu’à ce que vous la remettiez sur la prévision.',
    manualPastHint:
      'Enregistrée à la main avec l’une des actions. La marque reste même si la date est ensuite ramenée là où elle était.',
    unavailable: {
      budgetEnds:
        'Indisponible : la date de fin du budget ({{date}}) ne laisse aucun jour où une nouvelle période pourrait commencer.',
      tooSoon:
        'Pas encore disponible : une période dure au moins 7 jours, une nouvelle peut donc commencer au plus tôt le {{date}}.',
      moveStart:
        'Indisponible : aucun jour ne garde les deux périodes entre 7 et 92 jours, jusqu’à aujourd’hui et avant la date de fin du budget.',
    },
    range: {
      between: 'Du {{min}} au {{max}}.',
      outside: 'Cette date ne peut pas être enregistrée : choisissez un jour du {{min}} au {{max}}.',
    },
    incomeTotal: 'Revenus',
    actionsFor: 'Actions pour la période du {{range}}',
    actions: {
      expected: 'Le prochain salaire est attendu un autre jour',
      early: 'Le salaire est arrivé en avance',
      notYet: 'Le salaire de cette période n’est pas encore arrivé',
      moveStart: 'Le salaire de cette période est en fait arrivé un autre jour',
      resetExpected: 'Revenir à la date prévue',
    },
    dialogs: {
      expected: {
        title: 'Quand le prochain salaire est-il attendu ?',
        description:
          'Par exemple quand un jour férié décale la paie. La période en cours se termine la veille.',
        field: 'Prochain salaire attendu le',
        range: 'Après aujourd’hui ({{today}}).',
      },
      resetExpected: {
        title: 'Revenir à la date prévue ?',
        description:
          'La période en cours se termine de nouveau la veille de la prochaine paie prévue d’après le revenu principal.',
        field: 'Date',
        range: 'Aucune date n’est nécessaire.',
      },
      early: {
        title: 'Le salaire est arrivé en avance',
        description:
          'La période en cours se termine et une nouvelle commence le jour où le salaire est arrivé.',
        field: 'Jour d’arrivée du salaire',
        range: 'Aujourd’hui ({{today}}) ou avant.',
      },
      reopen: {
        title: 'Le salaire de cette période n’est pas encore arrivé',
        description:
          'Cette période est fusionnée avec la précédente, qui redevient la période en cours jusqu’à l’arrivée du salaire.',
        field: 'Salaire désormais attendu le (facultatif)',
        range: 'Après aujourd’hui ({{today}}) ; laissez vide pour la date prévue.',
      },
      moveStart: {
        title: 'Le salaire de cette période est arrivé un autre jour',
        description:
          'Déplace la limite entre cette période et la précédente au jour où le salaire est réellement arrivé.',
        field: 'Jour d’arrivée du salaire',
        range: 'Aujourd’hui ({{today}}) ou avant.',
      },
    },
    thisPeriod: 'Cette période : du {{start}} au {{end}}.',
    reopen: {
      title: 'Ce qui a été enregistré dans cette période s’appliquera à la période rouverte :',
      nothing: 'Rien n’a été enregistré dans cette période : seules les dates changent.',
      failed: 'Impossible de lister le contenu de cette période : {{reason}}',
      required: 'L’enregistrement attend cette liste : c’est elle que vous confirmez.',
      kinds: {
        income: 'Revenu « {{name}} »',
        other: '« {{name}} »',
      },
      changes: {
        added: 'ajouté dans cette période, il comptera dès la période rouverte.',
        ended: 'sa fin s’appliquera dès la période rouverte.',
        removed: 'il disparaîtra : il ne serait jamais en vigueur.',
        terms_changed: 'ses nouvelles conditions s’appliqueront à la période rouverte.',
        made_primary: 'il devient le revenu principal dès la période rouverte.',
        other: 'ce changement passera à la période rouverte.',
      },
      item: '{{kind}} : {{change}}',
      replaces: 'Il remplace ce que la période rouverte avait pour lui.',
      datesOnly:
        'Enregistrer de nouveau ce salaire plus tard (« Le salaire est arrivé en avance ») rétablit seulement les dates, pas ces changements.',
    },
    preview: {
      expected:
        'Cette période se terminera le {{end}} ; la suivante commencera à l’arrivée du salaire le {{date}}.',
      resetExpected: 'La fin de cette période suivra de nouveau la date de paie prévue.',
      early:
        'Cette période se terminera le {{end}}, et une nouvelle période commencera le {{start}}.',
      reopenUntil:
        'La période précédente (dès le {{start}}) redevient la période en cours et se terminera le {{end}} ; cette période disparaît.',
      reopenProjected:
        'La période précédente (dès le {{start}}) redevient la période en cours jusqu’à sa fin prévue ; cette période disparaît.',
      moveStart:
        'La période précédente se terminera le {{end}}, et celle-ci commencera le {{start}}.',
    },
    undo: {
      expected: 'Pour annuler : indiquez une autre date, ou revenez à la date prévue.',
      resetExpected: 'Pour annuler : indiquez de nouveau la date attendue.',
      early:
        'Pour annuler : sur la nouvelle période, utilisez « Le salaire de cette période n’est pas encore arrivé ».',
      reopen:
        'Pour annuler les dates : utilisez « Le salaire est arrivé en avance » avec le {{date}}.',
      moveStart: 'Pour annuler : remettez-la au {{date}}.',
    },
    saved: 'Périodes mises à jour.',
    reset: 'Revenir',
    resetDone: 'La date attendue suit de nouveau la prévision.',
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
      endsWith:
        'Date saisie : {{entered}}. Le budget se termine avec la période qui contient cette date ; son dernier jour est donc le {{date}}.',
      noEndDate: 'Pas de date de fin : le budget continue indéfiniment.',
      endDateHelp:
        'Le budget se termine avec la période qui contient cette date ; son dernier jour est la veille du salaire suivant. Laissez vide et enregistrez, ou supprimez-la, pour un budget sans fin.',
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
