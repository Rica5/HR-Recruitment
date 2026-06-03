const express    = require('express');
const router     = express.Router();
const Offre      = require('../models/Offre');
const Candidature = require('../models/Candidature');
const { triggerAIAnalysis, triggerManualWorkflow } = require('../services/n8n');
const { createRateLimiter }    = require('../middleware/rateLimiter');
const { logAudit }             = require('../services/audit');
const { verifyCallbackSecret } = require('../middleware/callbackAuth');
const { upload, handleUploadError } = require('../middleware/upload');
const { sendAcknowledgmentEmail }   = require('../services/email');

// Rate limiter: 5 applications max per IP per 10 minutes
const applicationRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: 'Too many applications sent from this address. Try again in 10 minutes.',
});

// GET /api/public/offre/:id — job offer details (no JWT)
router.get('/offre/:id', async (req, res) => {
  try {
    const offre = await Offre.findOne({ offre_id: req.params.id, statut: 'Active' })
      .select('-exigences_ia -email_recruteur -approbation_inspection');
    if (!offre) return res.status(404).json({ success: false, error: 'Offer not found or closed' });
    res.json({ success: true, offre });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/public/candidature — submit an application (no JWT, with rate limit)
router.post('/candidature', applicationRateLimiter, upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'lettre', maxCount: 1 }]), handleUploadError, async (req, res) => {
  try {
    const data = { ...req.body };

    const offre = await Offre.findOne({ offre_id: data.offre_id, statut: 'Active' });
    if (!offre) return res.status(404).json({ success: false, error: 'Offer not found or closed' });

    if (offre.date_butoire && new Date() > new Date(offre.date_butoire)) {
      const dateStr = new Date(offre.date_butoire).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
      return res.status(410).json({ success: false, error: `The application deadline was ${dateStr}. This offer no longer accepts new applications.` });
    }

    if (data.candidat_email) {
      const existing = await Candidature.findOne({ candidat_email: data.candidat_email, offre_id: data.offre_id });
      if (existing) return res.status(409).json({ success: false, error: 'You have already applied for this offer' });
    }

    if (req.files?.cv?.[0]) {
      data.cv_filename = req.files.cv[0].filename;
      data.cv_path     = `/uploads/${req.files.cv[0].filename}`;
    }
    if (req.files?.lettre?.[0]) {
      data.lettre_filename = req.files.lettre[0].filename;
      data.lettre_path     = `/uploads/${req.files.lettre[0].filename}`;
    }

    data.titre_poste     = offre.titre_poste;
    data.email_recruteur = offre.email_recruteur;
    data.company         = offre.company;
    // Platform channel + contact flags
    data.canal_candidature = 'plateforme';
    data.a_email   = !!data.candidat_email;
    data.a_appeler = !data.candidat_email; // to call if no email

    const candidature = await Candidature.create(data);

    triggerAIAnalysis(candidature, offre).catch(e =>
      console.warn('WF2 not triggered:', e.message)
    );

    // Acknowledgment email to the candidate (fire-and-forget) if an email was provided
    if (candidature.candidat_email) {
      sendAcknowledgmentEmail({ candidature, offre }).catch(e =>
        console.warn('Acknowledgment email not sent:', e.message)
      );
    }

    logAudit({ action: 'CANDIDATURE_RECUE', entity_type: 'candidature', entity_id: candidature._id.toString(), entity_label: candidature.candidat_nom, user_email: 'public', details: { offre_id: data.offre_id, canal: 'plateforme' } });

    res.status(201).json({ success: true, candidature, formule_remerciement: offre.formule_remerciement || '' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/public/candidature/:id/analyse — n8n WF2 callback (protected by shared secret)
router.patch('/candidature/:id/analyse', verifyCallbackSecret, async (req, res) => {
  try {
    const ALLOWED = ['score','recommandation','resume_analyse','adequation_poste',
      'competences_detectees','competences_manquantes','experience_annees',
      'niveau_education','points_forts','points_faibles'];
    const update = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    // Scenario A (auto, no test) → status auto-set based on AI recommendation
    // Scenario B (test_requis or manual qualification) → status stays 'En cours', recruiter decides
    // Scenario C (manual entry) → no AI analysis so this callback is never called
    const cand = await Candidature.findById(req.params.id).select('offre_id');
    const offre = cand ? await Offre.findOne({ offre_id: cand.offre_id }).select('test_requis automatisation_active') : null;
    // Scenario A only: full automation AND no test required
    const scenarioA = offre?.automatisation_active !== false && !offre?.test_requis;

    if (scenarioA) {
      // QUALIFIED → "In progress": n8n will update to "Interview scheduled" when cal.com confirms
      if (update.recommandation === 'QUALIFIE')             update.statut = 'En cours';
      else if (update.recommandation === 'NON_SELECTIONNE') update.statut = 'Refusé';
    } else {
      // Scenario B/C: recruiter always confirms — AI informs, does not decide
      update.statut = 'En cours';
    }

    const candidature = await Candidature.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!candidature) return res.status(404).json({ success: false, error: 'Application not found' });

    logAudit({ action: 'ANALYSE_IA_RECUE', entity_type: 'candidature', entity_id: req.params.id, entity_label: candidature.candidat_nom, user_email: 'n8n', details: { score: update.score, recommandation: update.recommandation } });

    res.json({ success: true, candidature });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/public/candidature/:id/rdv-confirme — n8n callback when cal.com appointment confirmed
router.patch('/candidature/:id/rdv-confirme', verifyCallbackSecret, async (req, res) => {
  try {
    const { date, heure, lieu } = req.body;

    const update = {
      statut:   'Entretien planifié',
      rdv_pris: true,
    };
    if (date || heure || lieu) {
      update.rdv_manuel = {
        date:     date  || null,
        heure:    heure || '',
        lieu:     lieu  || '',
        note:     '',
        type_rdv: '',
      };
    }

    const candidature = await Candidature.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!candidature) return res.status(404).json({ success: false, error: 'Application not found' });

    logAudit({ action: 'RDV_CONFIRME_N8N', entity_type: 'candidature', entity_id: req.params.id, entity_label: candidature.candidat_nom, user_email: 'n8n', details: { date, heure, lieu } });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/public/offre/:offre_id/top-candidats — n8n callback after batch evaluation
router.post('/offre/:offre_id/top-candidats', verifyCallbackSecret, async (req, res) => {
  try {
    const { top_candidats, tous_candidats } = req.body;
    if (!Array.isArray(top_candidats) || top_candidats.length === 0) {
      return res.status(400).json({ success: false, error: 'top_candidats missing or empty' });
    }

    // Update score_final for ALL evaluated candidates
    if (Array.isArray(tous_candidats) && tous_candidats.length > 0) {
      await Promise.all(
        tous_candidats.map(c =>
          c.id && c.score_final != null
            ? Candidature.findByIdAndUpdate(c.id, { score: c.score_final })
            : Promise.resolve()
        )
      );
    }

    // Top N → recommandation QUALIFIE + final score + justification
    await Promise.all(
      top_candidats.map(c =>
        Candidature.findByIdAndUpdate(c.id, {
          recommandation: 'QUALIFIE',
          ...(c.score_final != null ? { score: c.score_final } : {}),
          ...(c.justification ? { batch_justification: c.justification } : {}),
        })
      )
    );

    logAudit({
      action: 'EVALUATION_BATCH_RECUE',
      entity_type: 'offre',
      entity_id: req.params.offre_id,
      entity_label: req.params.offre_id,
      user_email: 'n8n',
      details: { top_count: top_candidats.length, top_ids: top_candidats.map(c => c.id) },
    });

    res.json({ success: true, updated: top_candidats.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/public/batch-cv/callback — n8n WF5 callback after CV extraction
router.post('/batch-cv/callback', verifyCallbackSecret, async (req, res) => {
  try {
    const { candidature_id, candidat_nom, candidat_email, candidat_telephone } = req.body;
    if (!candidature_id)
      return res.status(400).json({ success: false, error: 'candidature_id missing' });

    const candidature = await Candidature.findById(candidature_id);
    if (!candidature) return res.status(404).json({ success: false, error: 'Application not found' });

    const offre = await Offre.findOne({ offre_id: candidature.offre_id });

    const nomFinal   = (candidat_nom        || '').trim() || 'Unnamed candidate';
    const emailFinal = (candidat_email      || '').trim();
    const telFinal   = (candidat_telephone  || '').trim();

    candidature.candidat_nom       = nomFinal;
    candidature.candidat_email     = emailFinal;
    candidature.candidat_telephone = telFinal;
    candidature.a_email            = !!emailFinal;
    candidature.a_appeler          = !emailFinal;
    await candidature.save();

    // Batch CV → always WF2 manual (N8N_WF2_WEBHOOK_URL), regardless of email/scenario
    if (offre && candidature.cv_path) {
      triggerManualWorkflow(candidature, offre).catch(e =>
        console.warn(`WF2 batch not triggered for ${candidature_id}:`, e.message)
      );
    }

    logAudit({
      action: 'BATCH_CV_CALLBACK',
      entity_type: 'candidature',
      entity_id: candidature_id,
      entity_label: nomFinal,
      user_email: 'n8n',
      details: { email: emailFinal, telephone: telFinal },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
