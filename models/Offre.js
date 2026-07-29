const mongoose = require('mongoose');
const { COMPANIES, OFFRE_STATUTS, CONTRATS } = require('../constants');

const approbationSchema = new mongoose.Schema({
  approuvee:        { type: Boolean, default: false },
  date_approbation: { type: Date,    default: null  },
  commentaire:      { type: String,  default: ''    },
}, { _id: false });

const offreSchema = new mongoose.Schema({
  offre_id:              { type: String,  required: true, unique: true, index: true },
  titre_poste:           { type: String,  required: true },
  missions_principales:  { type: String,  required: true },
  profil_souhaite:       { type: String,  default: '' },
  competences_requises:  { type: String,  required: true },
  annees_experience:     { type: String,  default: '' },
  langues_requises:      { type: String,  default: '' },
  exigences_ia:          { type: String,  default: '' },
  type_contrat:          { type: String,  required: true, enum: CONTRATS },
  localisation:          { type: String,  required: true },
  salaire:               { type: String,  default: '' },
  email_recruteur:       { type: String,  required: true },
  date_butoire:          { type: Date,    default: null },
  date_parution_prevue:  { type: Date,    default: null },
  date_limite_selection: { type: Date,    default: null },
  test_requis:           { type: Boolean, default: false },
  test_date:             { type: Date,    default: null },
  test_heure:            { type: String,  default: '' },
  test_lieu:             { type: String,  default: '' },
  lien_calendar:         { type: String,  default: '' }, // legacy — kept for compat
  lien_rdv:              { type: String,  default: '' },
  automatisation_active: { type: Boolean, default: true },
  formule_remerciement:  { type: String,  default: '' },
  approbation_inspection:{ type: approbationSchema, default: () => ({}) },
  company:               { type: String,  required: true, enum: COMPANIES, index: true },
  statut:                { type: String,  default: 'En pause', enum: OFFRE_STATUTS },
  date_creation:         { type: Date,    default: Date.now },
}, { timestamps: true });

// Compound indexes for stats and list queries
offreSchema.index({ company: 1, statut: 1 });
offreSchema.index({ company: 1, date_creation: -1 });

// Si test requis → automatisation désactivée (qualification manuelle obligatoire)
offreSchema.pre('save', function(next) {
  if (this.test_requis === true) this.automatisation_active = false;
  next();
});

module.exports = mongoose.model('Offre', offreSchema);
