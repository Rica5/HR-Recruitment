const express = require('express');
const router = express.Router();
const Offre = require('../models/Offre');
const Candidature = require('../models/Candidature');
const { sendJobOfferEmail } = require('../services/email');
const { logAudit } = require('../services/audit');
const { triggerBatchEvaluation } = require('../services/n8n');
const { escapeRegex } = require('../utils/text');

router.post('/', async (req, res) => {
  try {
    const data = req.body;
    if (!data.offre_id) data.offre_id = Date.now().toString();
    data.company = req.user.company;

    if (data.statut === 'Active' && (!data.lien_rdv || !data.lien_rdv.trim())) {
      return res.status(400).json({ success: false, error: "A calendar link (RDV) is required to activate the offer." });
    }
    if (data.statut === 'Active' && data.company !== 'optimum' && !data.approbation_inspection?.approuvee) {
      return res.status(403).json({ success: false, error: "Offer not approved by Labor Inspection. Check approval before activating the offer." });
    }

    const offre = await Offre.create(data);
    const applicationLink = `${process.env.BASE_URL || 'http://localhost:3000'}/postuler?offre_id=${offre.offre_id}`;
    sendJobOfferEmail({ offre, applicationLink }).catch(e => console.warn('Email not sent:', e.message));
    logAudit({ action: 'OFFRE_CREEE', entity_type: 'offre', entity_id: offre.offre_id, entity_label: offre.titre_poste, user_email: req.user.email, details: { statut: offre.statut, localisation: offre.localisation } });
    res.status(201).json({ success: true, offre, lien_candidature: applicationLink });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, error: 'Offer ID already exists' });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stats/summary', async (req, res) => {
  try {
    const co = req.user.company;
    const [totalOffers, activeOffers, totalApplications, qualified, toReview, rejected] = await Promise.all([
      Offre.countDocuments({ company: co }),
      Offre.countDocuments({ company: co, statut: 'Active' }),
      Candidature.countDocuments({ company: co }),
      Candidature.countDocuments({ company: co, recommandation: 'QUALIFIE' }),
      Candidature.countDocuments({ company: co, recommandation: 'A_REVOIR' }),
      Candidature.countDocuments({ company: co, recommandation: 'NON_SELECTIONNE' }),
    ]);
    res.json({ success: true, stats: { totalOffers, activeOffers, totalApplications, qualified, toReview, rejected } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Madagascar HR process compliance statistics
router.get('/stats/madagascar', async (req, res) => {
  try {
    const co = req.user.company;
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
      Offre.countDocuments({ company: co }),
      Offre.countDocuments({ company: co, statut: 'Active' }),
      Offre.countDocuments({ company: co, statut: 'En pause' }),
      Offre.countDocuments({ company: co, statut: 'Fermée' }),
      Offre.countDocuments({ company: co, 'approbation_inspection.approuvee': true }),
      Candidature.countDocuments({ company: co }),
      Candidature.countDocuments({ company: co, a_appeler: true, rdv_pris: false, non_interesse: false }),
      Candidature.countDocuments({ company: co, statut: 'Test convoqué' }),
      Candidature.countDocuments({ company: co, statut: 'Test passé' }),
      Candidature.countDocuments({ company: co, rdv_pris: true }),
      Candidature.countDocuments({ company: co, non_interesse: true }),
      Candidature.aggregate([{ $match: { company: co } }, { $group: { _id: '$canal_candidature', count: { $sum: 1 } } }]),
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
    if (q) { const rx = escapeRegex(q); filter.$or = [{ titre_poste: { $regex: rx, $options: 'i' } }, { localisation: { $regex: rx, $options: 'i' } }]; }
    const jobOffers = await Offre.find(filter).sort({ date_creation: -1 }).lean();
    res.json({ success: true, offres: jobOffers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const offre = await Offre.findOne({ offre_id: req.params.id });
    if (!offre) return res.status(404).json({ success: false, error: 'Offer not found' });
    res.json({ success: true, offre });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/candidatures', async (req, res) => {
  try {
    const exists = await Offre.findOne({ offre_id: req.params.id }, '_id').lean();
    if (!exists) return res.status(404).json({ success: false, error: 'Offer not found' });
    const applications = await Candidature.find({ offre_id: req.params.id })
      .sort({ score: -1, date_candidature: -1 })
      .limit(500)
      .lean();
    res.json({ success: true, candidatures: applications });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    delete req.body.company;

    if (req.body.statut === 'Active') {
      // Fetch once, validate, then save — avoids second round-trip to DB
      const current = await Offre.findOne({ offre_id: req.params.id });
      if (!current) return res.status(404).json({ success: false, error: 'Offer not found' });
      const lienRdv = req.body.lien_rdv ?? current.lien_rdv;
      if (!lienRdv || !lienRdv.trim()) {
        return res.status(400).json({ success: false, error: "A calendar link (RDV) is required to activate the offer." });
      }
      if (current.company !== 'optimum' && !current.approbation_inspection?.approuvee) {
        return res.status(403).json({ success: false, error: "Offer not approved by Labor Inspection. Check approval before activating the offer." });
      }
      Object.assign(current, req.body);
      await current.save();
      logAudit({ action: 'OFFRE_MODIFIEE', entity_type: 'offre', entity_id: req.params.id, entity_label: current.titre_poste, user_email: req.user.email, details: { fields: Object.keys(req.body).join(', ') } });
      return res.json({ success: true, offre: current });
    }

    const offre = await Offre.findOneAndUpdate({ offre_id: req.params.id }, req.body, { new: true });
    if (!offre) return res.status(404).json({ success: false, error: 'Offer not found' });
    logAudit({ action: 'OFFRE_MODIFIEE', entity_type: 'offre', entity_id: req.params.id, entity_label: offre.titre_poste, user_email: req.user.email, details: { fields: Object.keys(req.body).join(', ') } });
    res.json({ success: true, offre });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const offre = await Offre.findOneAndDelete({ offre_id: req.params.id });
    if (!offre) return res.status(404).json({ success: false, error: 'Offer not found' });
    await Candidature.deleteMany({ offre_id: req.params.id });
    logAudit({ action: 'OFFRE_SUPPRIMEE', entity_type: 'offre', entity_id: req.params.id, entity_label: offre.titre_poste, user_email: req.user.email });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/offres/:id/evaluer-candidats — triggers batch AI evaluation of candidates
router.post('/:id/evaluer-candidats', async (req, res) => {
  try {
    const nb_top = parseInt(req.body.nb_top, 10);
    if (!nb_top || nb_top < 1 || nb_top > 200) {
      return res.status(400).json({ success: false, error: 'nb_top must be an integer between 1 and 200' });
    }

    const offre = await Offre.findOne({ offre_id: req.params.id });
    if (!offre) return res.status(404).json({ success: false, error: 'Offer not found' });

    const candidatures = await Candidature.find({
      offre_id: req.params.id,
      score: { $ne: null },
    }).sort({ score: -1 });

    if (candidatures.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No candidates individually analyzed for this offer. Wait for individual AI analyses to complete.',
      });
    }

    // Reset previous batch selection before launching new one
    await Candidature.updateMany(
      { offre_id: req.params.id, batch_justification: { $ne: '' } },
      { $set: { batch_justification: '' } }
    );

    triggerBatchEvaluation(offre, candidatures, nb_top);

    logAudit({
      action: 'EVALUATION_BATCH_DECLENCHEE',
      entity_type: 'offre',
      entity_id: offre.offre_id,
      entity_label: offre.titre_poste,
      user_email: req.user.email,
      details: { nb_candidats: candidatures.length, nb_top },
    });

    res.json({
      success: true,
      message: `Evaluation in progress for ${candidatures.length} candidate(s). Results available in 30–60 seconds.`,
      nb_candidats: candidatures.length,
      nb_top,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
