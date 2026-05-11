const express = require('express');
const router = express.Router();
const Offre = require('../models/Offre');
const Candidature = require('../models/Candidature');
const { sendJobOfferEmail } = require('../services/email');
const { logAudit } = require('../services/audit');

router.post('/', async (req, res) => {
  try {
    const data = req.body;
    if (!data.offre_id) data.offre_id = Date.now().toString();
    const offre = await Offre.create(data);
    const applicationLink = `${process.env.BASE_URL || 'http://localhost:3000'}/postuler?offre_id=${offre.offre_id}`;
    sendJobOfferEmail({ offre, applicationLink }).catch(e => console.warn('Email not sent:', e.message));
    logAudit({ action: 'OFFRE_CREEE', entity_type: 'offre', entity_id: offre.offre_id, entity_label: offre.titre_poste, user_email: req.user.email, details: { statut: offre.statut, localisation: offre.localisation } });
    res.status(201).json({ success: true, offre, lien_candidature: applicationLink });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, error: 'ID offre déjà existant' });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stats/summary', async (req, res) => {
  try {
    const [totalOffers, activeOffers, totalApplications, qualified, toReview, rejected] = await Promise.all([
      Offre.countDocuments(),
      Offre.countDocuments({ statut: 'Active' }),
      Candidature.countDocuments(),
      Candidature.countDocuments({ recommandation: 'QUALIFIE' }),
      Candidature.countDocuments({ recommandation: 'A_REVOIR' }),
      Candidature.countDocuments({ recommandation: 'NON_SELECTIONNE' }),
    ]);
    res.json({ success: true, stats: { totalOffers, activeOffers, totalApplications, qualified, toReview, rejected } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Madagascar HR process compliance statistics
router.get('/stats/madagascar', async (req, res) => {
  try {
    const [
      totalOffers,
      activeOffers,
      pausedOffers,
      closedOffers,
      approvedOffers,
      totalApplications,
      toCall,
      scheduledTests,
      completedTests,
      appointmentsBooked,
      notInterested,
      channels,
    ] = await Promise.all([
      Offre.countDocuments(),
      Offre.countDocuments({ statut: 'Active' }),
      Offre.countDocuments({ statut: 'En pause' }),
      Offre.countDocuments({ statut: 'Fermée' }),
      Offre.countDocuments({ 'approbation_inspection.approuvee': true }),
      Candidature.countDocuments(),
      Candidature.countDocuments({ a_appeler: true, rdv_pris: false, non_interesse: false }),
      Candidature.countDocuments({ statut: 'Test convoqué' }),
      Candidature.countDocuments({ statut: 'Test passé' }),
      Candidature.countDocuments({ rdv_pris: true }),
      Candidature.countDocuments({ non_interesse: true }),
      Candidature.aggregate([{ $group: { _id: '$canal_candidature', count: { $sum: 1 } } }]),
    ]);
    res.json({
      success: true,
      stats: {
        offres: { total: totalOffers, actives: activeOffers, enPause: pausedOffers, fermees: closedOffers, approuvees: approvedOffers },
        candidatures: { total: totalApplications, aAppeler: toCall, testConvoques: scheduledTests, testPasses: completedTests, rdvPris: appointmentsBooked, nonInteresse: notInterested },
        canaux: channels,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { statut, q } = req.query;
    const filter = {};
    if (statut) filter.statut = statut;
    if (q) filter.$or = [{ titre_poste: { $regex: q, $options: 'i' } }, { localisation: { $regex: q, $options: 'i' } }];
    const jobOffers = await Offre.find(filter).sort({ date_creation: -1 });
    res.json({ success: true, offres: jobOffers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const offre = await Offre.findOne({ offre_id: req.params.id });
    if (!offre) return res.status(404).json({ success: false, error: 'Offre introuvable' });
    res.json({ success: true, offre });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/candidatures', async (req, res) => {
  try {
    const applications = await Candidature.find({ offre_id: req.params.id }).sort({ score: -1, date_candidature: -1 });
    res.json({ success: true, candidatures: applications });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    // Block setting to "Active" if not approved by Labour Inspection
    if (req.body.statut === 'Active') {
      const current = await Offre.findOne({ offre_id: req.params.id });
      if (!current) return res.status(404).json({ success: false, error: 'Offre introuvable' });
      if (!current.approbation_inspection?.approuvee) {
        return res.status(403).json({
          success: false,
          error: 'Offre non approuvée par l\'Inspection du Travail. Cochez l\'approbation avant d\'activer l\'offre.',
        });
      }
    }
    const offre = await Offre.findOneAndUpdate({ offre_id: req.params.id }, req.body, { new: true });
    if (!offre) return res.status(404).json({ success: false, error: 'Offre introuvable' });
    logAudit({ action: 'OFFRE_MODIFIEE', entity_type: 'offre', entity_id: req.params.id, entity_label: offre.titre_poste, user_email: req.user.email, details: { fields: Object.keys(req.body).join(', ') } });
    res.json({ success: true, offre });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const offre = await Offre.findOneAndDelete({ offre_id: req.params.id });
    await Candidature.deleteMany({ offre_id: req.params.id });
    logAudit({ action: 'OFFRE_SUPPRIMEE', entity_type: 'offre', entity_id: req.params.id, entity_label: offre?.titre_poste || req.params.id, user_email: req.user.email });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
