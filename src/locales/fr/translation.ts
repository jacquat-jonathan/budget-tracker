import type { Translation } from '@/locales/en/translation'

// French typography: a narrow no-break space (U+202F) precedes ? ! : and ;.
export const fr: Translation = {
  app: {
    name: 'Budget Tracker',
    tagline: 'Le budget de votre ménage, période après période.',
  },
  common: {
    loading: 'Chargement…',
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
    periods: { description: 'Les périodes passées et leur comparaison.' },
    moneyFlow: {
      description: 'La répartition de votre argent entre vos comptes après le jour de paie.',
    },
    income: { description: 'Les revenus qui composent votre budget mensuel.' },
    settings: { description: 'Votre profil et vos préférences.' },
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
  },
  validation: {
    emailRequired: 'Saisissez votre adresse e-mail.',
    emailInvalid: 'Saisissez une adresse e-mail valide.',
    passwordRequired: 'Saisissez votre mot de passe.',
    passwordTooShort: 'Utilisez au moins {{min}} caractères.',
    passwordsDontMatch: 'Les mots de passe ne correspondent pas.',
    displayNameRequired: 'Saisissez un nom affiché.',
    displayNameTooLong: 'Utilisez au maximum {{max}} caractères.',
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
      description: 'Saisissez le nouveau mot de passe de votre compte.',
      submit: 'Enregistrer le mot de passe',
      invalidLink: {
        title: 'Ce lien n’est plus valable',
        description:
          'Les liens de réinitialisation expirent au bout d’un certain temps et ne servent qu’une fois. Demandez-en un nouveau.',
        action: 'Demander un nouveau lien',
      },
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
        'Les liens envoyés par e-mail expirent au bout d’un certain temps et ne servent qu’une fois. Demandez-en un nouveau ci-dessous.',
      invalid: 'Ce lien est incomplet ou n’est pas valable. Demandez-en un nouveau ci-dessous.',
      networkTitle: 'Impossible de vérifier ce lien',
      network:
        'Le serveur est injoignable, votre lien n’a donc pas été utilisé. Vérifiez votre connexion, puis réessayez.',
      retry: 'Réessayer',
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
