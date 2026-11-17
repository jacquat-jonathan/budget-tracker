import type { LazyKey, Translation } from '@/locales/en/translation'
import { catchUpFr } from '@/locales/fr/catch-up'

// French typography: a narrow no-break space (U+202F) precedes ? ! : and ;.
const core: Omit<Translation, LazyKey> = {
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
    compare: 'Comparer',
    moneyFlow: 'Flux financiers',
    accounts: 'Comptes',
    transfers: 'Virements',
    income: 'Revenus',
    import: 'Importer',
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
    compare: {
      description:
        'Comment vos périodes se comparent : la tendance, chaque catégorie au fil du temps, et deux périodes côte à côte.',
    },
    moneyFlow: {
      description:
        'D’où vient l’argent d’une période et où il va, selon le plan ou tel que cela s’est passé.',
    },
    accounts: { description: 'Les comptes sur lesquels votre ménage garde son argent.' },
    transfers: {
      description:
        'L’argent qui passe d’un compte à l’autre selon un calendrier, et la liste à cocher de la période.',
    },
    income: { description: 'Les revenus qui composent votre budget mensuel.' },
    import: {
      description:
        'Importez un relevé bancaire ou un fichier CSV plutôt que de saisir chaque transaction.',
    },
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
    bankLabelTooLong: 'Utilisez au plus 100 caractères.',
    accountRequired: 'Choisissez un compte.',
    sameAccount: 'Choisissez deux comptes différents.',
    incomeRequired: 'Choisissez le revenu dont il suit le jour de paie.',
    dueNotBeforeToday:
      'Choisissez aujourd’hui ou une date plus tardive, ou enregistrez ce qui a déjà eu lieu.',
    doneAfterToday: 'La date ne peut pas être postérieure à aujourd’hui.',
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
    amountInvalid: "Saisissez un montant comme 5200 ou 5'200.50.",
    amountTooSmall: 'Le montant doit être supérieur à zéro.',
    amountTooLarge: "Le montant ne peut pas dépasser CHF 10'000'000.",
    dateRequired: 'Saisissez une date.',
    dateInvalid: 'Saisissez une date au format jj.mm.aaaa, par exemple 25.01.2027.',
    amountNegative: 'Le montant ne peut pas être négatif.',
    dateOutsidePeriods: 'Choisissez une date dans la plage indiquée sous le champ.',
    descriptionTooLong: 'Utilisez au plus 500 caractères.',
    categoryRequired: 'Choisissez une catégorie.',
    nextChargeAfterToday:
      'Un nouveau prochain prélèvement doit être après aujourd’hui (ou cochez la correction d’une période antérieure).',
    interestRate: 'Saisissez un taux de 0 à 100, avec au plus trois décimales, par exemple 4.875.',
    linkedIsExpense:
      'Un remboursement de dette ou un prélèvement d’abonnement est une dépense. Retirez d’abord le lien pour en faire un remboursement reçu ou un revenu.',
  },
  auth: {
    signIn: {
      title: 'Connexion',
      description: 'Bon retour parmi nous. Connectez-vous pour accéder à votre budget.',
      submit: 'Se connecter',
      forgotPassword: 'Mot de passe oublié ?',
      importInterrupted:
        'Une importation était en cours d’envoi depuis cet appareil quand la session s’est terminée. Ce qu’elle avait enregistré est conservé. Connectez-vous et ouvrez le même fichier sur la page Importer pour la terminer : rien n’est enregistré deux fois.',
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
    previewFailed:
      'L’aperçu n’a pas pu être chargé : {{reason}} L’enregistrement attend qu’il s’affiche.',
  },
  errors: {
    forbidden: 'Vous n’avez pas le droit de faire cela.',
    invalidValue: 'Une des valeurs n’est pas acceptée. Vérifiez le formulaire et réessayez.',
    busy: 'Le budget est occupé et a mis trop de temps à répondre : rien n’a été changé. Réessayez dans un moment.',
    network: 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.',
    networkAdd:
      'La connexion a été coupée avant la réponse. Ce que vous avez saisi est toujours là : enregistrez à nouveau une fois connecté. Sans risque : ce sera enregistré une seule fois, même si le premier enregistrement a abouti.',
    networkSave:
      'La connexion a échoué : rien n’a été enregistré. Vos saisies sont toujours là : vérifiez votre connexion et enregistrez de nouveau.',
    generic: 'Une erreur s’est produite. Veuillez réessayer.',
    db: {
      not_authenticated: 'Votre session a expiré. Reconnectez-vous.',
      interest_before_opening:
        'Le début de la période ne peut pas être placé à l’ouverture ou avant l’ouverture d’une dette qui a des intérêts dans cette période : choisissez un début plus tardif.',
      import_limit_reached:
        "Ce budget a atteint une de ses limites d’importation (200 nouvelles importations ou 20'000 lignes en 24 heures, ou 2'000 importations conservées). Rien n’a été écrit. Les limites journalières se libèrent à mesure que l’utilisation la plus ancienne dépasse 24 heures.",
      chunk_expired:
        'Cette partie a déjà été enregistrée, mais sa réponse n’est plus conservée : elle n’est pas importée à nouveau. Consultez les lignes de l’importation dans l’historique.',
      token_busy:
        'Le jeton d’importation est occupé par un autre appel : rien n’a été fait. Renvoyez la même partie dans un moment.',
      imports_busy:
        'Les importations sont occupées pour l’instant : rien n’a été fait. Renvoyez la même partie dans un moment.',
      budget_busy:
        'Le budget est occupé par une autre importation : rien n’a été écrit. Renvoyez la même partie.',
      call_cancelled:
        'L’importation a pris trop de temps et a été annulée : rien n’a été écrit. Renvoyez la même partie.',
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
      invalid_amount: "Le montant doit être compris entre CHF 0.01 et CHF 10'000'000.",
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
        'Ce budget contient déjà le maximum de catégories (200 en usage, ou 500 au total).',
      transaction_limit_reached:
        "Ce budget contient déjà 50'000 transactions, le maximum possible.",
      category_not_ended: 'Cette catégorie n’a pas pris fin : il n’y a rien à restaurer.',
      category_in_use:
        'Un abonnement ou une dette utilise encore cette catégorie. Terminez-le ou déplacez-le d’abord dans une autre catégorie.',
      subscription_not_found: 'Cet abonnement n’existe plus.',
      debt_not_found: 'Cette dette n’existe plus.',
      adjustment_not_found: 'Cet ajustement de solde n’existe plus.',
      subscription_ended: 'Cet abonnement est terminé (pour cette période).',
      debt_ended: 'Cette dette est terminée (pour cette période).',
      before_transfer_start: 'Cette date précède le début du virement planifié.',
      invalid_first_date:
        'Cette première date ne convient pas au calendrier (elle doit tomber le jour choisi, au plus dix ans à l’avance).',
      occurrence_required:
        'Cette période compte plusieurs exécutions de ce virement : choisissez laquelle.',
      before_debt_opened:
        'Cette date précède l’ouverture de la dette : remboursements et ajustements commencent à sa date d’ouverture.',
      catching_up:
        'Rien n’a été enregistré : le budget rattrapait encore le temps écoulé depuis votre dernière visite. C’est fait : vos saisies sont toujours là, enregistrez de nouveau.',
      charge_held_back:
        "Un prélèvement de cet abonnement attend : le budget contient 50'000 transactions, le maximum. Son calendrier ne peut pas changer et il ne peut pas être terminé avant que ce prélèvement soit créé ; supprimez d’abord des transactions pour faire de la place.",
      preview_required:
        'Cette modification déplace la fin de la période en cours : regardez la nouvelle fin ci-dessous, puis enregistrez de nouveau.',
      invalid_charge_date:
        'Saisissez une date de prélèvement valide, au plus dix ans à l’avance ; un nouveau prochain prélèvement doit être après aujourd’hui.',
      invalid_interest_rate:
        'Le taux d’intérêt doit être compris entre 0 et 100 %, avec au plus trois décimales.',
      invalid_link:
        'Seule une dépense peut être un remboursement de dette ou un prélèvement d’abonnement, et un remboursement doit être dans la catégorie de la dette.',
      debt_not_in_force:
        'Cette dette n’était pas en cours dans la période de cette date. Choisissez une autre date.',
      subscription_not_in_force:
        'Cet abonnement n’était pas en cours dans la période de cette date.',
      not_a_charge: 'Cette transaction n’est pas un prélèvement automatique d’abonnement.',
      debt_has_history:
        'Cette dette a déjà des remboursements, des intérêts ou des ajustements : son montant de départ ne peut plus changer. Ajustez plutôt son solde.',
      subscription_limit_reached:
        'Ce budget contient déjà le maximum d’abonnements (50 en cours, ou 200 au total).',
      debt_limit_reached:
        'Ce budget contient déjà le maximum de dettes (50 en cours, ou 200 au total).',
      adjustment_limit_reached: 'Ce budget contient déjà 5000 ajustements de solde, le maximum.',
      income_limit_reached:
        'Ce budget compte déjà le maximum de revenus autorisé (50 en vigueur, ou 500 au total).',
      membership_limit_reached:
        'Vous faites déjà partie de 50 budgets (les vôtres compris), le maximum. Quittez-en un d’abord.',
      request_reused:
        'Ce formulaire avait déjà été enregistré avec d’autres valeurs (peut-être juste avant la coupure de connexion). Vérifiez la liste : enregistrer à nouveau maintenant crée une nouvelle entrée.',
      invalid_rows: 'Ces lignes n’ont pas pu être envoyées : 500 lignes et 2 Mo au plus à la fois.',
      invalid_batch: 'Cette importation n’a pas pu être identifiée. Recommencez-la.',
      invalid_chunk: 'Une partie de cette importation était mal numérotée. Recommencez-la.',
      invalid_source: 'Ce genre de fichier ne peut pas être importé.',
      invalid_expiry: 'Un jeton dure de 1 à 365 jours.',
      invalid_fragment:
        'Saisissez un texte de commerçant de 1 à 100 caractères, avec au moins une lettre ou un chiffre.',
      import_batch_conflict:
        'Cette importation appartient à un autre budget. Recommencez-la dans celui-ci.',
      import_batch_not_found: 'Cette importation n’existe plus, ou appartient à un autre budget.',
      merchant_rule_not_found: 'Cette règle de commerçant n’existe plus.',
      token_not_found: 'Ce jeton d’importation n’existe plus.',
      batch_undone: 'Cette importation a été annulée : plus rien ne peut en être importé.',
      not_to_review: 'Cette transaction a déjà été confirmée.',
      category_to_categorise:
        '« À catégoriser » ne le permet pas : ce n’est que l’endroit où les transactions importées attendent une catégorie. Elle ne prend ni montant prévu ni sous-catégorie, ne peut pas être la catégorie d’une transaction saisie, d’un abonnement, d’une dette ou d’une règle, ne peut pas prendre fin tant qu’elle contient des transactions, et une transaction qui s’y trouve doit recevoir une catégorie avant d’être confirmée.',
      merchant_rule_exists:
        'Une règle existe déjà pour ce texte de commerçant. Modifiez plutôt celle-ci.',
      merchant_rule_limit_reached: 'Ce budget a déjà 500 règles de commerçant, le maximum.',
      token_limit_reached:
        'Ce budget a déjà 10 jetons d’importation utilisables, le maximum. Révoquez-en un d’abord.',
      token_active: 'Révoquez ce jeton avant de le supprimer.',
      read_only_call: 'Le script d’importation doit envoyer ses lignes par POST.',
      invalid_token:
        'Ce jeton d’importation est inconnu, a expiré ou a été révoqué, ou la personne qui l’a créé n’est plus membre.',
      token_rate_limited: 'Ce jeton a trop envoyé pour le moment. Attendez un peu, puis réessayez.',
      transfer_held_back:
        'Un virement de ce budget attend de la place (la limite de transactions) : il ne peut pas prendre fin avant que sa transaction soit créée.',
      account_not_found: 'Ce compte n’existe plus.',
      transfer_not_found: 'Ce virement n’existe plus.',
      account_ended: 'Ce compte a été clôturé (pour cette période).',
      transfer_ended: 'Ce virement a pris fin (pour cette période).',
      account_in_use:
        'Un virement ou un revenu utilise encore ce compte. Modifiez-le ou mettez-y fin d’abord.',
      account_not_in_force: 'Ce compte n’est pas ouvert dans chaque période concernée.',
      account_required: 'Un virement a besoin d’un compte de départ et d’un compte d’arrivée.',
      same_account: 'Un virement a besoin de deux comptes différents.',
      invalid_account_kind: 'Choisissez le genre de compte.',
      invalid_bank_label: 'Le libellé bancaire peut compter 100 caractères au plus.',
      invalid_schedule: 'Choisissez un seul rythme pour ce virement.',
      invalid_offset: 'Le nombre de jours doit être de 0 à 31.',
      invalid_day: 'Le jour doit être de 1 à 31.',
      invalid_automatic: 'Indiquez si ce virement est automatique.',
      invalid_arguments: 'Ces valeurs ne vont pas ensemble. Vérifiez le formulaire et réessayez.',
      transfer_not_in_force: 'Ce virement n’a rien de prévu dans cette période.',
      transfer_already_marked:
        'Ce virement est déjà marqué pour cette période. Annulez d’abord la marque.',
      transfer_is_automatic: 'Un virement automatique ne se marque pas à la main.',
      transfer_is_manual: 'Seul un virement automatique peut être marqué non effectué.',
      nothing_to_undo: 'Il n’y a pas de marque à annuler pour ce virement dans cette période.',
      account_limit_reached:
        'Ce budget a déjà le maximum de comptes (50 ouverts, ou 200 au total).',
      transfer_limit_reached:
        'Ce budget a déjà le maximum de virements (50 en vigueur, ou 200 au total).',
    },
  },
  concurrent: {
    savedAfterLoss:
      'Enregistré. La réponse s’est perdue en route, mais votre modification est enregistrée : le formulaire l’affiche.',
    title: 'Quelqu’un d’autre a modifié cet élément pendant que vous l’aviez ouvert',
    theirVersion: 'Sa version :',
    edit: 'Ce que vous avez saisi est toujours là. Chargez sa version pour repartir de celle-ci, ou gardez la vôtre : l’enregistrement ne modifiera alors que les champs que vous avez changés.',
    updatedTitle:
      'Quelqu’un d’autre a modifié cet élément ; le formulaire affiche maintenant sa version :',
    goneTitle: 'Quelqu’un d’autre a supprimé cet élément',
    endedTitle: 'Quelqu’un d’autre a retiré cet élément',
    ended:
      'Il n’est plus utilisé à partir de la période en cours : ces modifications ne peuvent donc pas être enregistrées. Fermez cette fenêtre ; il figure parmi les éléments retirés et peut être restauré.',
    gone: 'Il n’existe plus et ne peut donc pas être enregistré. Fermez cette fenêtre.',
    none: 'aucune',
    amountPer: {
      monthly: '{{amount}} par mois',
      yearly: '{{amount}} par an',
    },
    fields: {
      name: 'Nom',
      amount: 'Montant',
      payDay: 'Jour de paie',
      weekendRule: 'Règle du week-end',
      kind: 'Type',
      date: 'Date',
      category: 'Catégorie',
      note: 'Note',
      endDate: 'Date de fin',
      primary: 'Revenu principal',
    },
    remove:
      'Cet élément a changé depuis que vous avez ouvert cette fenêtre. Vérifiez-le, puis confirmez si vous le souhaitez toujours.',
    useTheirs: 'Charger sa version',
    keepMine: 'Garder la mienne',
    confirmAgain: 'J’ai vérifié, continuer',
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
  budgetLost: {
    title: 'Vous n’avez plus accès à « {{name}} »',
    description:
      'Il a été supprimé, ou vous n’en faites plus partie. Vous êtes maintenant dans « {{name}} ». Ce que vous y aviez saisi sans l’enregistrer a été abandonné.',
    descriptionNone:
      'Il a été supprimé, ou vous n’en faites plus partie. Ce que vous y aviez saisi sans l’enregistrer a été abandonné.',
    dismiss: 'Compris',
    import:
      'Une importation y était en cours depuis cet appareil : {{confirmed}} de ses {{parts}} parties ont été enregistrées et restent dans ce budget pour ses membres. Vous ne pouvez plus la poursuivre d’ici.',
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
      more: 'Afficher plus d’invitations',
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
      lastPeriodHelp:
        'C’est la dernière période du budget : aucune nouvelle période ne commence ensuite.',
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
    endMovedMeanwhile:
      'Rien n’a été enregistré : la fin de la période en cours a changé entre-temps (par exemple, une date de paie attendue a été fixée à la main). L’aperçu ci-dessous montre la nouvelle fin : vérifiez-la, puis enregistrez de nouveau.',
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
    primaryTransfersNote:
      'Seules les limites des périodes changent ; rien n’est revu pour les virements. Un virement sur un revenu choisi garde les jours de paie propres de ce revenu, quel que soit le revenu principal. Un virement au jour de paie du revenu principal reste une fois par période : il ne suit ce revenu qu’à travers les débuts de période.',
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
  categories: {
    add: 'Ajouter une catégorie',
    addFirst: 'Ajouter votre première catégorie',
    addTitle: 'Ajouter une catégorie',
    addSubTitle: 'Ajouter une sous-catégorie à « {{name}} »',
    addDescription: 'Une catégorie de dépenses, avec le montant que vous prévoyez pour elle.',
    editTitle: 'Modifier la catégorie',
    editSubTitle: 'Modifier la sous-catégorie',
    editDescription: 'Changez son nom ou le montant que vous prévoyez pour elle.',
    created: 'Catégorie « {{name}} » ajoutée.',
    saved: 'Catégorie « {{name}} » enregistrée.',
    deleted: '« {{name}} » supprimée.',
    ended:
      '« {{name}} » retirée à partir de la période en cours. Les périodes passées la conservent.',
    endedKeptVoid: '« {{name}} » retirée. Ses transactions sont gardées et comptent toujours.',
    endedFromEarlier:
      '« {{name}} » retirée à partir de la période choisie. Les périodes précédentes la gardent.',
    removeEarlierLabel: 'La retirer à partir d’une période antérieure',
    removeEarlier: 'Retirer à partir de cette période',
    extendAction: 'La compter depuis une période antérieure',
    extend: 'La compter depuis cette période',
    extendTitle: 'Compter « {{name}} » depuis une période antérieure ?',
    extendDescription:
      'Pour des transactions plus anciennes qui ont besoin de cette catégorie : elle est aussi prévue dans une période antérieure.',
    extendFrom: 'Comptée depuis',
    extendNone: 'Elle compte déjà depuis la première période du budget.',
    extendNoneSub:
      'Une sous-catégorie ne compte jamais avant son groupe : comptez d’abord « {{group}} » depuis une période antérieure.',
    extendAmountHelp:
      'Ce qu’elle prévoit dans les périodes antérieures. Les montants suivants restent tels quels.',
    extendOutcome:
      'Cela modifie des périodes passées : à partir du {{start}}, elle y est prévue avec ce montant, ce qui change leurs prévisions et leurs résultats, jusqu’à la période où elle a commencé.',
    extended: '« {{name}} » compte maintenant depuis la période choisie.',
    restore: 'Restaurer',
    restoreFor: 'Restaurer {{name}}',
    restoreTitle: 'Restaurer « {{name}} » ?',
    restoreDescription: 'Elle est de nouveau prévue, avec le montant ci-dessous.',
    restoreAmountHelp: 'Ce qu’elle prévoit à partir de maintenant.',
    restoreAsCorrection: 'La restaurer comme si elle n’avait jamais pris fin',
    restoreEndedBudget:
      'Le budget est terminé : elle ne peut être restaurée que comme si elle n’avait jamais pris fin.',
    restoreOutcome:
      'Elle est de nouveau prévue à partir de la période en cours, commencée le {{start}}. Les périodes entre sa fin et maintenant ne prévoient rien pour elle : leurs totaux ne changent pas.',
    restoreCorrectionOutcome:
      'Cela modifie des périodes passées : elle est de nouveau prévue à partir de la période où elle a pris fin ({{start}} – {{end}}), comme si elle n’avait jamais pris fin, ce qui change les prévisions et les résultats de toutes les périodes depuis.',
    restoreThisPeriodOutcome:
      'Elle a été retirée à partir de la période en cours (commencée le {{start}}) : elle y est de nouveau prévue, comme si elle n’avait jamais été retirée. Les périodes précédentes ne changent pas.',
    restoreGroupNote:
      'Ses sous-catégories restent telles quelles : restaurez aussi celles que vous voulez.',
    restoreGroupFirst: 'Son groupe « {{group}} » a pris fin : restaurez d’abord le groupe.',
    restored: '« {{name}} » est de nouveau prévue.',
    restoredElsewhere:
      'Quelqu’un d’autre a déjà restauré « {{name}} » : il n’y a plus rien à restaurer.',
    becameGroup:
      'Quelqu’un d’autre a ajouté une sous-catégorie : « {{name}} » est donc un groupe, sans montant propre. Le montant saisi ({{amount}}) ne peut pas être enregistré ici : indiquez-le sur l’une de ses sous-catégories. Vous pouvez encore la renommer.',
    removeFromEarlier:
      'Elle n’est plus prévue à partir de la période choisie, ce qui modifie des périodes passées. Si elle n’a jamais compté avant cette période et n’a aucune transaction, elle est supprimée.',
    edit: 'Modifier',
    addSub: 'Ajouter une sous-catégorie',
    moveUp: 'Monter',
    moveDown: 'Descendre',
    remove: 'Retirer',
    delete: 'Supprimer',
    end: 'Retirer à partir de maintenant',
    actionsFor: 'Actions pour {{name}}',
    listLabel: 'Catégories',
    columns: {
      category: 'Catégorie',
      perMonth: 'Par mois',
    },
    group: 'Groupe',
    groupNote: 'Total de ses sous-catégories',
    yearlyNote: '{{amount}} par an',
    path: '{{parent}} › {{name}}',
    otherName: 'Autres',
    empty: 'Aucune catégorie pour l’instant',
    emptyDescription:
      'Répartissez vos revenus en catégories, comme le loyer, les courses ou les assurances, chacune avec le montant que vous prévoyez de dépenser par mois.',
    emptyGroup:
      'Plus aucune sous-catégorie : ajoutez-en une pour y prévoir et y enregistrer des dépenses.',
    endedBudget:
      'Il n’y a pas de période en cours : les catégories ne peuvent plus être ajoutées ni modifiées.',
    endedTitle: 'Catégories retirées',
    endedHelp:
      'Elles ne sont plus prévues, mais les périodes passées les conservent avec leurs transactions.',
    endedLabel: 'Retirée',
    neverPlanned:
      'Retirée dans la période où elle a été ajoutée ; ses transactions comptent toujours',
    lastCounted: 'Prévue pour la dernière fois dans la période se terminant le {{date}}',
    groupHasNoAmount:
      'Cette catégorie a des sous-catégories : son montant est le total des leurs. Modifiez les montants des sous-catégories.',
    firstSub: {
      becomesGroup:
        '« {{name}} » deviendra un groupe de sous-catégories : elle n’aura plus de montant propre, et son montant sera le total de ses sous-catégories.',
      moves:
        '« {{name}} » deviendra un groupe de sous-catégories. Ce qu’elle contient maintenant (son montant, {{amount}} par mois, et ses transactions) passe dans une nouvelle sous-catégorie « {{other}} », de sorte qu’aucun total de période ne change.',
      movesLinks: 'Ses abonnements et ses dettes passent aussi dans « {{other}} ».',
    },
    fields: {
      name: 'Nom',
      namePlaceholder: 'Courses',
      subNamePlaceholder: 'Assurance maladie',
      cadence: 'Montant saisi',
      amountMonthly: 'Montant par mois',
      amountYearly: 'Montant par an',
      yearlyHelp:
        'Un montant annuel compte pour un douzième dans chaque période, arrondi au centime. Le budget l’affiche par mois une fois enregistré.',
      from: 'Prévue à partir de',
      fromHelp: 'Choisissez une période antérieure pour y enregistrer des dépenses passées.',
    },
    cadence: {
      monthly: 'Par mois',
      yearly: 'Par an',
    },
    addAppliesFrom:
      'Elle est prévue à partir de la période en cours, sauf si vous en choisissez une antérieure. Les périodes passées ne changent pas autrement.',
    editAppliesFrom:
      'Un nouveau montant s’applique à partir de la période en cours, commencée le {{date}}. Les périodes passées gardent le montant qu’elles avaient.',
    correctionAppliesFrom:
      'Le montant s’applique à partir de la période choisie jusqu’au prochain changement déjà enregistré : les prévisions de ces périodes changent.',
    correctionWarning:
      'Cela modifie des périodes passées : ce qu’elles prévoyaient, et donc leurs résultats, est recalculé à partir de la période choisie jusqu’au prochain changement déjà enregistré.',
    removeDeleteTitle: 'Supprimer « {{name}} » ?',
    removeEndTitle: 'Retirer « {{name}} » à partir de maintenant ?',
    removeEarlierTitle: 'Retirer « {{name}} » dès une période antérieure ?',
    removeDeletes:
      'Elle n’a jamais été prévue dans une période passée et n’a aucune transaction : elle est donc supprimée entièrement.',
    removeEnds:
      'Elle n’est plus prévue à partir de la période en cours (commencée le {{date}}). Les périodes passées la gardent telle quelle.',
    removeEndsNoPeriod: 'Elle n’est plus prévue. Les périodes passées la gardent telle quelle.',
    removeKeptVoid:
      'Elle a été ajoutée dans cette période : elle est donc retirée de toutes les prévisions. Comme elle a des transactions, elle est gardée sans montant, et elles continuent de compter dans leurs périodes.',
    removeKeepsTransactions:
      'Ses transactions ne sont jamais supprimées : elles continuent de compter dans les périodes où elles sont datées.',
    removeWithSubs_one: 'Sa sous-catégorie {{names}} est retirée avec elle.',
    removeWithSubs_other: 'Ses {{count}} sous-catégories sont retirées avec elle : {{names}}.',
    totals: {
      period: 'Période en cours : {{start}} – {{end}}',
      income: 'Revenus',
      expected: 'Prévu',
      left: 'Reste à répartir',
      overAssigned: 'Réparti au-delà des revenus',
      overAssignedHint:
        'Vous prévoyez plus que vos revenus. C’est permis : baissez certains montants si vous voulez que cela tienne.',
    },
    inUse: {
      title: 'Utilisée par',
      description:
        'Un abonnement ou une dette en cours utilise cette catégorie (ou une de ses sous-catégories). Terminez-le ou déplacez-le dans une autre catégorie avant de retirer la catégorie.',
      subscription: 'Abonnement « {{name}} »',
      debt: 'Dette « {{name}} »',
      cannotTitle: '« {{name}} » ne peut pas encore être retirée',
    },
  },
  transactions: {
    frozenTitle: 'Paiement d’une dette terminée',
    frozenDescription:
      'Sa dette est terminée : ce paiement reste tel qu’il était et ne peut plus être modifié.',
    add: 'Ajouter une transaction',
    addTitle: 'Ajouter une transaction',
    addDescription: 'Une dépense, un remboursement, ou de l’argent qui entre en plus des salaires.',
    editTitle: 'Modifier la transaction',
    editDescription: 'Corrigez ce qui a été enregistré. Elle passe dans la période de sa date.',
    added: {
      expense: 'Dépense de {{amount}} enregistrée.',
      refund: 'Remboursement de {{amount}} enregistré.',
      extra_income: 'Revenu supplémentaire de {{amount}} enregistré.',
    },
    saved: 'Transaction enregistrée.',
    deleted: 'Transaction supprimée.',
    savedInARow_one:
      'Enregistrée ({{amount}}). Saisissez la suivante, ou fermez quand vous avez terminé.',
    savedInARow_other:
      '{{count}} enregistrées, la dernière de {{amount}}. Saisissez la suivante, ou fermez quand vous avez terminé.',
    saveAndAdd: 'Enregistrer et continuer',
    done: 'Terminé',
    edit: 'Modifier',
    delete: 'Supprimer',
    deleteTitle: 'Supprimer cette transaction ?',
    deleteDescription:
      'La transaction de {{amount}} du {{date}} est supprimée pour tous les membres.',
    actionsFor: 'Actions pour {{what}}, {{amount}} le {{date}}',
    recordedBy: 'par {{name}}',
    loadMore: 'Afficher les transactions plus anciennes',
    count_one: '{{count}} transaction affichée',
    count_other: '{{count}} transactions affichées',
    empty: 'Aucune transaction dans cette période pour l’instant',
    emptyHelp:
      'Enregistrez vos dépenses au fur et à mesure : elles sont aussitôt comptées dans leur catégorie.',
    emptyFiltered: 'Aucune transaction ne correspond à ces filtres',
    emptyFilteredHelp: 'Choisissez une autre période, catégorie ou un autre type.',
    endedBudget:
      'Le budget est terminé : les transactions peuvent encore être enregistrées et corrigées dans ses périodes, jusqu’à son dernier jour.',
    kind: {
      expense: 'Dépense',
      refund: 'Remboursement',
      extra_income: 'Revenu supplémentaire',
    },
    kindShort: {
      expense: 'Dépense',
      refund: 'Remboursement',
      extra_income: 'Autre revenu',
    },
    kindPlural: {
      expense: 'Dépenses',
      refund: 'Remboursements',
      extra_income: 'Revenus supplémentaires',
    },
    kindHelp: {
      expense: 'De l’argent dépensé : il compte dans sa catégorie.',
      refund: 'De l’argent rendu pour un achat : il réduit ce qui a été dépensé dans sa catégorie.',
      extra_income:
        'De l’argent qui entre en plus des salaires (un cadeau, une vente) : il s’ajoute aux revenus de la période, sans catégorie.',
    },
    fields: {
      kind: 'Type',
      amount: 'Montant',
      date: 'Date',
      dateRange: 'Du {{min}} au {{max}} (aujourd’hui au plus tard).',
      dateRangeEnded: 'Du {{min}} au {{max}}, dernier jour du budget.',
      keptCategory: '{{name}} (conservée : non prévue à cette date)',
      keptElsewhere:
        '« {{name}} » n’est pas prévue dans la période de cette date : choisissez de nouveau une catégorie, ou gardez une date de sa propre période.',
      categoriesFailed: 'Les catégories de cette date n’ont pas pu être chargées : {{reason}}',
      category: 'Catégorie',
      chooseCategory: 'Choisissez une catégorie',
      noCategories: 'Aucune catégorie à cette date',
      noCategoriesHelp:
        'Aucune catégorie n’était prévue dans la période de cette date. Ajoutez-en une sur la page Budget, ou choisissez une autre date.',
      description: 'Note (facultative)',
      descriptionPlaceholder: 'Migros, pharmacie, billet de train…',
      debt: 'Remboursement de dette',
      debtHelp: 'Un remboursement diminue ce qui reste dû sur la dette.',
      noDebt: 'Pas un remboursement de dette',
      paymentOn: 'C’est un remboursement de {{name}}',
    },
    filters: {
      label: 'Filtrer les transactions',
      period: 'Période',
      allPeriods: 'Toutes les périodes',
      currentPeriod: '{{range}} (en cours)',
      category: 'Catégorie',
      allCategories: 'Toutes les catégories',
      wholeGroup: 'Tout « {{name}} »',
      ended: '{{name}} (retirée)',
      kind: 'Type',
      allKinds: 'Tous les types',
    },
    paymentTitle: 'Enregistrer un remboursement',
    paymentDescription: 'Une dépense dans la catégorie de la dette : elle diminue ce qui reste dû.',
    awaiting: 'À confirmer',
    awaitingShort: 'À confirmer',
    automatic: 'Automatique',
    paymentOnNote: 'Remboursement de {{name}}',
    automaticOf: 'Prélèvement automatique de {{name}}',
    subscriptionOf: 'Prélèvement de {{name}}',
    chargeAwaitingNote:
      'Un prélèvement automatique de « {{name}} », à confirmer. Le modifier ne le confirme pas.',
    chargeNote: 'Un prélèvement automatique de « {{name}} ».',
    subscriptionNote: 'Un prélèvement de l’abonnement « {{name}} ».',
  },
  progress: {
    title: 'Avancement de la période',
    browse: 'Choisir la période',
    older: 'Période précédente',
    newer: 'Période suivante',
    backToCurrent: 'Revenir à la période en cours',
    income: 'Revenus',
    expected: 'Prévu',
    spent: 'Dépensé',
    surplus: 'Excédent',
    deficit: 'Déficit',
    leftToAssign: '{{amount}} restent à répartir',
    overAssigned: '{{amount}} de plus que les revenus',
    listLabel: 'Avancement par catégorie',
    columns: {
      category: 'Catégorie',
      expected: 'Prévu',
      spent: 'Dépensé',
      result: 'Reste',
    },
    overspent: 'Dépassé',
    notInForce: 'Non prévue',
    notInForceHint:
      'Non prévue dans cette période (retirée, ou pas encore créée), mais des transactions y sont datées : elles comptent.',
    spentOf: '{{spent}} dépensés sur {{expected}}',
    seeTransactions: 'Voir les transactions de {{name}} dans cette période',
    empty: 'Rien de prévu ni de dépensé dans cette période',
    emptyHelp:
      'Prévoyez vos dépenses par catégorie sur la page Budget, puis enregistrez vos transactions.',
    toBudget: 'Aller au budget',
    committedExceeds:
      'Les abonnements à eux seuls font {{committed}}, plus que les {{planned}} prévus.',
    plannedIncludes: 'Dont {{amount}} pour des abonnements',
    rowPlannedIncludes: 'Les {{expected}} prévus comprennent {{amount}} d’abonnements',
    includes: 'dont {{amount}} d’abonnements',
  },
  periods: {
    older: 'Périodes plus anciennes…',
    showOlder: 'Afficher les périodes plus anciennes (les {{count}} plus récentes sont listées)',
    description:
      'Chaque période va d’un salaire à la veille du suivant. Les périodes passées restent telles quelles.',
    empty: 'Aucune période pour l’instant',
    current: 'En cours',
    manualStart: 'Début fixé à la main',
    manualEnd: 'Fin fixée à la main',
    lastPeriod: 'Dernière période',
    nextExpected: 'Prochain salaire attendu le {{date}} (prévision).',
    nextExpectedManual: 'Prochain salaire attendu le {{date}} (fixé à la main).',
    lastPeriodNote:
      'Dernière période du budget : elle se termine le {{date}}, et aucune période ne commence ensuite.',
    manualCurrentHint:
      'Fixée à la main : elle reste telle quelle quand le jour de paie change, jusqu’à ce que vous la remettiez sur la prévision.',
    manualPastHint:
      'Fixée à la main avec l’une des actions. Ramener le début sur le calendrier de paie efface la marque.',
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
      outside:
        'Cette date ne peut pas être enregistrée : choisissez un jour du {{min}} au {{max}}.',
    },
    incomeTotal: 'Revenus',
    actionsFor: 'Actions pour la période du {{range}}',
    actions: {
      expected: 'Le prochain salaire est attendu un autre jour',
      early: 'Le salaire est arrivé en avance',
      notYet: 'Le salaire de cette période n’est pas encore arrivé',
      moveStart: 'Le salaire de cette période est en fait arrivé un autre jour',
      resetExpected: 'Revenir à la date prévue',
      moveSchedule: 'Ramener le début de cette période sur le calendrier de paie',
      moveScheduleTo: 'Ramener le début de cette période sur le calendrier de paie ({{date}})',
    },
    dialogs: {
      moveSchedule: {
        title: 'Ramener le début de cette période sur le calendrier de paie ?',
        description:
          'La limite entre cette période et la précédente revient au jour que donne le calendrier de paie.',
        field: 'Date',
        range: 'Aucune date n’est nécessaire.',
      },
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
      more_one: 'Et 1 autre changement, non listé.',
      more_other: 'Et {{count}} autres changements, non listés.',
      nothing: 'Rien n’a été enregistré dans cette période : seules les dates changent.',
      failed: 'Impossible de lister le contenu de cette période : {{reason}}',
      required: 'L’enregistrement attend cette liste : c’est elle que vous confirmez.',
      kinds: {
        income: 'Revenu « {{name}} »',
        category: 'Catégorie « {{name}} »',
        other: '« {{name}} »',
        subscription: 'Abonnement « {{name}} »',
        debt: 'Dette « {{name}} »',
        account: 'Compte « {{name}} »',
        transfer: 'Virement planifié « {{name}} »',
      },
      changes: {
        added: 'ajouté dans cette période, il comptera dès la période rouverte.',
        ended: 'sa fin s’appliquera dès la période rouverte.',
        removed: 'il disparaîtra : il ne serait jamais en vigueur.',
        terms_changed: 'ses nouvelles conditions s’appliqueront à la période rouverte.',
        made_primary: 'il devient le revenu principal dès la période rouverte.',
        other: 'ce changement passera à la période rouverte.',
        interest_removed:
          'les intérêts ajoutés au début de cette période sont retirés ; ils sont ajoutés de nouveau, une fois, quand la période recommence.',
        transaction_removed:
          'la transaction que l’application avait enregistrée pour son jour de paie est retirée ; elle revient quand ce salaire est de nouveau enregistré.',
        transaction_created: 'sa transaction est enregistrée par l’application.',
        mark_unplanned:
          'une coche d’un membre n’est plus prévue : elle reste, signalée, et compte de nouveau quand ce salaire est de nouveau enregistré.',
        mark_planned_again: 'une coche d’un membre est de nouveau prévue.',
      },
      categoryChanges: {
        added: 'ajoutée dans cette période, elle sera prévue à partir de la période rouverte.',
        ended: 'son retrait s’appliquera à partir de la période rouverte.',
        removed:
          'elle disparaîtra : elle ne serait jamais prévue. Si elle a des transactions, elle est gardée sans montant et elles continuent de compter dans la période rouverte.',
        terms_changed: 'son nouveau montant s’appliquera à la période rouverte.',
      },
      item: '{{kind}} : {{change}}',
      replaces: 'Il remplace ce que la période rouverte avait pour lui.',
      datesOnly:
        'Enregistrer de nouveau ce salaire plus tard (« Le salaire est arrivé en avance ») rétablit seulement les dates, pas ces changements.',
      removedKept: {
        subscription:
          'il disparaîtra : il ne serait jamais en cours. S’il a des prélèvements, il est conservé sans être en cours et ils continuent de compter dans la période rouverte.',
        debt: 'elle disparaîtra : elle ne serait jamais en cours. Si elle a des remboursements ou des ajustements, elle est conservée sans être en cours, avec eux.',
      },
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
      moveSchedule:
        'La limite revient au jour que donne le calendrier de paie, et sa marque « fixée à la main » disparaît.',
      moveScheduleTo:
        'Cette période commencera le {{start}}, jour que donne le calendrier de paie, et la précédente se terminera le {{end}} ; la marque « fixée à la main » disparaît.',
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
    moveBack: 'Ramener',
    moveNoChange: 'Cette période commence déjà le {{date}} : la déplacer à ce jour ne change rien.',
    moveScheduleRefused:
      'Ce début ne peut pas revenir sur le calendrier de paie maintenant : le jour que donne le calendrier est après aujourd’hui, ou une période ferait moins de 7 jours ou plus de 92. Il reste tel quel ; vous pouvez toujours le déplacer au jour de votre choix.',
    changedTitle: 'Les périodes ont changé pendant que cette fenêtre était ouverte',
    changedDescription:
      'Quelqu’un d’autre a agi sur elles, ou votre tentative précédente avait déjà abouti : rien n’a donc été modifié maintenant. Ce que vous voyez est à jour : vérifiez les dates, puis recommencez si c’est encore nécessaire.',
    resetDone: 'La date attendue suit de nouveau la prévision.',
    progress: 'Avancement',
    progressFor: 'Voir l’avancement de la période du {{range}}',
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
  catchUp: catchUpFr,
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

// The lazy groups (src/locales/lazy-strings.ts) are added once their pages load.
export const fr = core as Translation
