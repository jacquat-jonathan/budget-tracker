/** Écrans de l’étape 7 : comptes, virements planifiés, liste à cocher, flux financiers. */

export const accountsFr = {
  add: 'Ajouter un compte',
  addFirst: 'Ajouter votre premier compte',
  addTitle: 'Ajouter un compte',
  addDescription:
    'Un endroit où votre ménage garde de l’argent : compte salaire, épargne, 3e pilier…',
  editTitle: 'Modifier le compte',
  editDescription:
    'Son nom, son type, sa banque et à qui il appartient. Les changements valent pour toutes les périodes.',
  created: 'Compte « {{name}} » ajouté.',
  saved: 'Compte « {{name}} » enregistré.',
  deleted: 'Compte « {{name}} » supprimé.',
  closed: 'Compte « {{name}} » clôturé. Les périodes passées le gardent.',
  changedNotShown:
    'Quelqu’un a modifié ce compte entre-temps, d’une façon que cette fenêtre ne montre pas. Vérifiez puis enregistrez à nouveau.',
  addNote:
    'Il compte dès la période en cours. Les soldes ne sont pas suivis : l’application planifie seulement ce qui circule.',
  addNoteEnded: 'Le budget est terminé : un compte ne peut être ajouté qu’à l’une de ses périodes.',
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
    'Les comptes sont facultatifs. Ajoutez-les pour planifier les virements après la paie et voir vos flux financiers : le reste de l’application fonctionne sans eux.',
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
    from: 'Compte dès',
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
    title: 'Clôturer « {{name}} » ?',
    deleteTitle: 'Supprimer « {{name}} » ?',
    ends: 'Il est clôturé dès la période commencée le {{date}}. Les périodes antérieures le gardent, avec leurs virements et leurs flux.',
    endsNoPeriod: 'Il est clôturé dès la période choisie. Les périodes antérieures le gardent.',
    endsFromEarlier:
      'Il est clôturé dès la période choisie. Les périodes antérieures le gardent ; les suivantes changent.',
    deletes: 'Rien ne l’a jamais utilisé : il est supprimé.',
    inUse: 'Il ne peut pas encore être clôturé : ceci l’utilise à partir de là.',
    changeFirst: 'Choisissez-leur un autre compte ou terminez-les, puis clôturez celui-ci.',
    usedBy: {
      income: 'Revenu « {{name}} »',
      transfer: 'Virement planifié « {{name}} »',
    },
    refused: 'Il ne peut pas être clôturé : {{reason}}',
    earlierLabel: 'Le clôturer dès une période antérieure',
    earlierWarning: 'Cela change les flux des périodes corrigées.',
    from: 'Clôturé dès',
    confirm: 'Clôturer le compte',
    delete: 'Supprimer le compte',
  },
  income: {
    field: 'Versé sur',
    fieldHelp:
      'Le compte sur lequel ce revenu arrive : c’est là que commencent les flux financiers.',
    none: 'Non attribué',
    noAccounts: 'Ajoutez des comptes pour indiquer où ce revenu arrive.',
    paidInto: 'Versé sur {{name}}',
    viewLabel: 'Versé sur',
  },
}
