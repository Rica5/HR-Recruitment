const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const Candidature = require('../models/Candidature');
const Offre       = require('../models/Offre');
const { triggerAIAnalysis, triggerManualWorkflow, triggerQualificationEmail } = require('../services/n8n');
const { sendRejectionEmail, sendTestSummons } = require('../services/email');
const { logAudit } = require('../services/audit');

// Fields editable by admins via PATCH
const ADMIN_EDITABLE = new Set([
  'statut', 'recommandation', 'candidat_telephone', 'email_recruteur',
  'score', 'resume_analyse', 'adequation_poste', 'competences_detectees',
  'competences_manquantes', 'experience_annees', 'niveau_education',
  'points_forts', 'points_faibles', 'titre_poste',
  'canal_candidature', 'a_email', 'a_appeler', 'rdv_pris', 'non_interesse',
  'email_invitation_envoye_le', 'relance_1_envoyee_le', 'relance_2_envoyee_le',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const candidateName = (req.body.candidat_nom || 'candidat').replace(/[^a-zA-Z0-9]/gi, '_');
    const prefix = file.fieldname === 'cv' ? 'CV' : 'Lettre';
    cb(null, `${prefix}_${candidateName}_${Date.now()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/candidatures — manual admin entry → create in MongoDB, then AI analysis via n8n
router.post('/', upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'lettre', maxCount: 1 }]), async (req, res) => {
  try {
    const data = { ...req.body };

    const offre = await Offre.findOne({ offre_id: data.offre_id });
    if (!offre) return res.status(404).json({ success: false, error: 'Offre introuvable' });

    if (offre.date_butoire && new Date() > new Date(offre.date_butoire)) {
      const dateStr = new Date(offre.date_butoire).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
      return res.status(410).json({ success: false, error: `Date butoire dépassée (${dateStr}) — candidature non acceptée` });
    }

    if (data.candidat_email) {
      const existing = await Candidature.findOne({ candidat_email: data.candidat_email, offre_id: data.offre_id });
      if (existing) return res.status(409).json({ success: false, error: 'Ce candidat a déjà postulé pour cette offre' });
    }

    if (req.files?.cv?.[0]) {
      data.cv_filename = req.files.cv[0].filename;
      data.cv_path     = `/uploads/${req.files.cv[0].filename}`;
    }
    if (req.files?.lettre?.[0]) {
      data.lettre_filename = req.files.lettre[0].filename;
      data.lettre_path     = `/uploads/${req.files.lettre[0].filename}`;
    }

    data.titre_poste      = offre.titre_poste;
    data.email_recruteur  = offre.email_recruteur;
    data.canal_candidature = data.canal_candidature || 'plateforme';
    data.a_email   = !!data.candidat_email;
    data.a_appeler = !data.candidat_email;

    const candidature = await Candidature.create(data);

    // AI analysis only if a CV is attached
    if (candidature.cv_path) {
      triggerManualWorkflow(candidature, offre).catch(e =>
        console.warn('Manual WF not triggered:', e.message)
      );
    }

    logAudit({ action: 'CANDIDATURE_MANUELLE', entity_type: 'candidature', entity_id: candidature._id.toString(), entity_label: candidature.candidat_nom, user_email: req.user.email, details: { offre_id: offre.offre_id, canal: data.canal_candidature, avec_cv: !!candidature.cv_path } });

    res.status(201).json({ success: true, candidature });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/candidatures
router.get('/', async (req, res) => {
  try {
    const { offre_id, recommandation, a_appeler, q } = req.query;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (offre_id)       filter.offre_id       = offre_id;
    if (recommandation) filter.recommandation  = recommandation;
    if (a_appeler === 'true') filter.a_appeler = true;
    if (q) filter.$or = [
      { candidat_nom:   { $regex: q, $options: 'i' } },
      { candidat_email: { $regex: q, $options: 'i' } },
      { titre_poste:    { $regex: q, $options: 'i' } },
    ];

    const [candidatures, total] = await Promise.all([
      Candidature.find(filter).sort({ score: -1, date_candidature: -1 }).skip(skip).limit(limit),
      Candidature.countDocuments(filter),
    ]);

    res.json({ success: true, candidatures, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/candidatures/:id
router.get('/:id', async (req, res) => {
  try {
    const candidature = await Candidature.findById(req.params.id);
    if (!candidature) return res.status(404).json({ success: false, error: 'Candidature introuvable' });
    res.json({ success: true, candidature });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/candidatures/:id
router.patch('/:id', async (req, res) => {
  try {
    const update = {};
    for (const [key, val] of Object.entries(req.body)) {
      if (ADMIN_EDITABLE.has(key)) update[key] = val;
    }
    if (!Object.keys(update).length)
      return res.status(400).json({ success: false, error: 'Aucun champ modifiable fourni' });

    const candidature = await Candidature.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!candidature) return res.status(404).json({ success: false, error: 'Candidature introuvable' });
    if (update.statut) {
      logAudit({ action: 'STATUT_CHANGE', entity_type: 'candidature', entity_id: req.params.id, entity_label: candidature.candidat_nom, user_email: req.user.email, details: { statut: update.statut } });
    }
    res.json({ success: true, candidature });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/candidatures/:id/envoyer-emails-qualification — delegates to n8n
router.post('/:id/envoyer-emails-qualification', async (req, res) => {
  try {
    const candidature = await Candidature.findById(req.params.id);
    if (!candidature) return res.status(404).json({ success: false, error: 'Candidature introuvable' });
    const offre = await Offre.findOne({ offre_id: candidature.offre_id });
    if (!offre) return res.status(404).json({ success: false, error: 'Offre introuvable' });

    const result = await triggerQualificationEmail(candidature, offre);
    if (!result.success) {
      return res.status(502).json({ success: false, error: result.error || 'Webhook qualification indisponible' });
    }

    // Save send date for reminder tracking
    await Candidature.findByIdAndUpdate(req.params.id, { email_invitation_envoye_le: new Date() });
    logAudit({ action: 'EMAIL_QUALIF_ENVOYE', entity_type: 'candidature', entity_id: req.params.id, entity_label: candidature.candidat_nom, user_email: req.user.email, details: { offre_id: candidature.offre_id } });
    res.json({ success: true, message: 'Email de qualification transmis à n8n' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/candidatures/:id/envoyer-email-refus
router.post('/:id/envoyer-email-refus', async (req, res) => {
  try {
    const candidature = await Candidature.findById(req.params.id);
    if (!candidature) return res.status(404).json({ success: false, error: 'Candidature introuvable' });
    const offre = await Offre.findOne({ offre_id: candidature.offre_id });
    if (!offre) return res.status(404).json({ success: false, error: 'Offre introuvable' });
    await sendRejectionEmail({ candidature, offre });
    res.json({ success: true, message: 'Email de refus envoyé' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/candidatures/:id/convoquer-test
router.post('/:id/convoquer-test', async (req, res) => {
  try {
    const candidature = await Candidature.findByIdAndUpdate(
      req.params.id,
      { statut: 'Test convoqué' },
      { new: true }
    );
    if (!candidature) return res.status(404).json({ success: false, error: 'Candidature introuvable' });

    const offre = await Offre.findOne({ offre_id: candidature.offre_id });
    if (!offre) return res.status(404).json({ success: false, error: 'Offre introuvable' });

    await sendTestSummons({ candidature, offre });
    res.json({ success: true, message: 'Convocation test envoyée', candidature });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/candidatures/:id/rdv-manuel
router.post('/:id/rdv-manuel', async (req, res) => {
  try {
    const { date, heure, lieu, note } = req.body;
    const update = {
      rdv_manuel: { date: date || null, heure: heure || '', lieu: lieu || '', note: note || '' },
      statut: 'Entretien planifié',
      rdv_pris: true,
    };
    const candidature = await Candidature.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!candidature) return res.status(404).json({ success: false, error: 'Candidature introuvable' });
    logAudit({ action: 'RDV_PLANIFIE', entity_type: 'candidature', entity_id: req.params.id, entity_label: candidature.candidat_nom, user_email: req.user.email, details: { date: date || '', heure: heure || '', lieu: lieu || '' } });
    res.json({ success: true, candidature });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/candidatures/:id/relancer-workflow
router.post('/:id/relancer-workflow', async (req, res) => {
  try {
    const candidature = await Candidature.findByIdAndUpdate(
      req.params.id,
      { $set: { score: null, recommandation: '', resume_analyse: '', adequation_poste: '',
                competences_detectees: '', competences_manquantes: '', points_forts: '',
                points_faibles: '', statut: 'En cours' } },
      { new: true }
    );
    if (!candidature) return res.status(404).json({ success: false, error: 'Candidature introuvable' });

    const offre = await Offre.findOne({ offre_id: candidature.offre_id });
    if (!offre) return res.status(404).json({ success: false, error: 'Offre introuvable' });

    const result = await triggerAIAnalysis(candidature, offre);
    if (result.success) {
      logAudit({ action: 'WF_RELANCE', entity_type: 'candidature', entity_id: req.params.id, entity_label: candidature.candidat_nom, user_email: req.user.email, details: { offre_id: candidature.offre_id } });
      res.json({ success: true, message: 'Workflow relancé — score réinitialisé' });
    } else {
      res.status(502).json({ success: false, error: result.error || 'Webhook n8n indisponible' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/candidatures/:id
router.delete('/:id', async (req, res) => {
  try {
    const c = await Candidature.findByIdAndDelete(req.params.id);
    if (c?.cv_path)     { const f = path.join(__dirname, '..', c.cv_path);     if (fs.existsSync(f)) fs.unlinkSync(f); }
    if (c?.lettre_path) { const f = path.join(__dirname, '..', c.lettre_path); if (fs.existsSync(f)) fs.unlinkSync(f); }
    logAudit({ action: 'CANDIDATURE_ELIMINEE', entity_type: 'candidature', entity_id: req.params.id, entity_label: c?.candidat_nom || req.params.id, user_email: req.user.email, details: { offre_id: c?.offre_id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
