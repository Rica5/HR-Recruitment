// Shared enums used across models, routes and validation.
// Single source of truth to avoid magic-string typos.

const COMPANIES = ['solumada', 'optimum'];

const RECOMMANDATIONS = ['QUALIFIE', 'A_REVOIR', 'NON_SELECTIONNE', ''];

const CANDIDATURE_STATUTS = [
  'Nouveau',
  'En cours',
  'Entretien planifié',
  'Test convoqué',
  'Test passé',
  'Accepté',
  'Refusé',
  'Pas intéressé',
];

const OFFRE_STATUTS = ['Active', 'Fermée', 'En pause'];

const CANAUX = ['plateforme', 'telephone', 'physique', 'email'];

const CONTRATS = ['CDI', 'CDD', 'Stage', 'Freelance', 'Alternance'];

module.exports = {
  COMPANIES,
  RECOMMANDATIONS,
  CANDIDATURE_STATUTS,
  OFFRE_STATUTS,
  CANAUX,
  CONTRATS,
};
