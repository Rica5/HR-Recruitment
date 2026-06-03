const mongoose = require('mongoose');
const { COMPANIES, RECOMMANDATIONS, CANDIDATURE_STATUTS, CANAUX } = require('../constants');

const rdvManuelSchema = new mongoose.Schema({
  date:     { type: Date,   default: null },
  heure:    { type: String, default: '' },
  lieu:     { type: String, default: '' },
  note:     { type: String, default: '' },
  type_rdv: { type: String, default: '', enum: ['', 'visio', 'presentiel'] },
}, { _id: false });

const candidatureSchema = new mongoose.Schema({
  offre_id:               { type: String,  required: true, index: true },
  titre_poste:            { type: String,  required: true },
  email_recruteur:        { type: String,  default: '' },
  candidat_nom:           { type: String,  required: true },
  candidat_email:         { type: String,  default: '', index: true },
  candidat_telephone:     { type: String,  default: '' },
  canal_candidature:      { type: String,  default: 'plateforme', enum: CANAUX },
  a_email:                { type: Boolean, default: false },
  a_appeler:              { type: Boolean, default: false },
  cv_filename:            { type: String,  default: '' },
  cv_path:                { type: String,  default: '' },
  lettre_filename:        { type: String,  default: '' },
  lettre_path:            { type: String,  default: '' },
  score:                  { type: Number,  default: null },
  recommandation:         { type: String,  default: '', enum: RECOMMANDATIONS },
  resume_analyse:         { type: String,  default: '' },
  adequation_poste:       { type: String,  default: '' },
  competences_detectees:  { type: String,  default: '' },
  competences_manquantes: { type: String,  default: '' },
  experience_annees:      { type: Number,  default: null },
  niveau_education:       { type: String,  default: '' },
  points_forts:           { type: String,  default: '' },
  points_faibles:         { type: String,  default: '' },
  batch_justification:    { type: String,  default: '' },
  email_invitation_envoye_le: { type: Date, default: null },
  relance_1_envoyee_le:   { type: Date,    default: null },
  relance_2_envoyee_le:   { type: Date,    default: null },
  rdv_pris:               { type: Boolean, default: false },
  non_interesse:          { type: Boolean, default: false },
  rdv_manuel:             { type: rdvManuelSchema, default: null },
  candidat_potentiel:     { type: Boolean, default: false },
  commentaire:            { type: String,  default: '' },
  company:                { type: String,  enum: COMPANIES, index: true },
  statut: {
    type: String,
    default: 'Nouveau',
    enum: CANDIDATURE_STATUTS,
  },
  date_candidature: { type: Date, default: Date.now },
}, { timestamps: true });

// Composite indexes for the most frequent queries (multi-tenant + filtering)
candidatureSchema.index({ company: 1, offre_id: 1 });
candidatureSchema.index({ company: 1, recommandation: 1 });
candidatureSchema.index({ company: 1, score: -1, date_candidature: -1 });

module.exports = mongoose.model('Candidature', candidatureSchema);
