const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const Offre      = require('../models/Offre');
const Candidature = require('../models/Candidature');
const { triggerAIAnalysis }    = require('../services/n8n');
const { createRateLimiter }    = require('../middleware/rateLimiter');
const { logAudit }             = require('../services/audit');

// ── Multer ──
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

// Rate limiter: 5 applications max per IP per 10 minutes
const applicationRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: 'Trop de candidatures envoyées depuis cette adresse. Réessayez dans 10 minutes.',
});

// GET /api/public/offre/:id — job offer details (no JWT)
router.get('/offre/:id', async (req, res) => {
  try {
    const offre = await Offre.findOne({ offre_id: req.params.id, statut: 'Active' })
      .select('-exigences_ia -email_recruteur -approbation_inspection');
    if (!offre) return res.status(404).json({ success: false, error: 'Offre introuvable ou fermée' });
    res.json({ success: true, offre });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/public/candidature — submit an application (no JWT, with rate limit)
router.post('/candidature', applicationRateLimiter, upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'lettre', maxCount: 1 }]), async (req, res) => {
  try {
    const data = { ...req.body };

    const offre = await Offre.findOne({ offre_id: data.offre_id, statut: 'Active' });
    if (!offre) return res.status(404).json({ success: false, error: 'Offre introuvable ou fermée' });

    if (offre.date_butoire && new Date() > new Date(offre.date_butoire)) {
      const dateStr = new Date(offre.date_butoire).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
      return res.status(410).json({ success: false, error: `La date limite de candidature était le ${dateStr}. Cette offre n'accepte plus de nouvelles candidatures.` });
    }

    if (data.candidat_email) {
      const existing = await Candidature.findOne({ candidat_email: data.candidat_email, offre_id: data.offre_id });
      if (existing) return res.status(409).json({ success: false, error: 'Vous avez déjà postulé à cette offre' });
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

    logAudit({ action: 'CANDIDATURE_RECUE', entity_type: 'candidature', entity_id: candidature._id.toString(), entity_label: candidature.candidat_nom, user_email: 'public', details: { offre_id: data.offre_id, canal: 'plateforme' } });

    res.status(201).json({ success: true, candidature, formule_remerciement: offre.formule_remerciement || '' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/public/candidature/:id/analyse — n8n WF2 callback (protected by shared secret)
router.patch('/candidature/:id/analyse', async (req, res) => {
  const secret   = req.headers['x-callback-secret'];
  const expected = process.env.N8N_CALLBACK_SECRET;
  if (expected && secret !== expected) {
    console.warn(`[CALLBACK] Invalid secret from ${req.ip}`);
    return res.status(403).json({ success: false, error: 'Accès non autorisé' });
  }

  try {
    const ALLOWED = ['score','recommandation','resume_analyse','adequation_poste',
      'competences_detectees','competences_manquantes','experience_annees',
      'niveau_education','points_forts','points_faibles'];
    const update = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    // Scénario A (auto, pas de test) → statut auto selon reco IA
    // Scénario B (test_requis ou qualification manuelle) → statut reste 'En cours', le recruteur décide
    // Scénario C (saisie manuelle) → pas d'analyse IA donc ce callback n'est pas appelé
    const cand = await Candidature.findById(req.params.id).select('offre_id');
    const offre = cand ? await Offre.findOne({ offre_id: cand.offre_id }).select('test_requis automatisation_active') : null;
    // Scénario A uniquement : automatisation complète ET pas de test requis
    const scenarioA = offre?.automatisation_active !== false && !offre?.test_requis;

    if (scenarioA) {
      // QUALIFIE → "En cours" : n8n passera à "Entretien planifié" directement en DB quand le RDV cal.com est confirmé
      if (update.recommandation === 'QUALIFIE')             update.statut = 'En cours';
      else if (update.recommandation === 'NON_SELECTIONNE') update.statut = 'Refusé';
    } else {
      // Scénario B/C : recruteur confirme toujours — l'IA informe, ne décide pas
      update.statut = 'En cours';
    }

    const candidature = await Candidature.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!candidature) return res.status(404).json({ success: false, error: 'Candidature introuvable' });

    logAudit({ action: 'ANALYSE_IA_RECUE', entity_type: 'candidature', entity_id: req.params.id, entity_label: candidature.candidat_nom, user_email: 'n8n', details: { score: update.score, recommandation: update.recommandation } });

    res.json({ success: true, candidature });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/public/candidature/:id/rdv-confirme — n8n callback quand RDV cal.com confirmé
router.patch('/candidature/:id/rdv-confirme', async (req, res) => {
  const secret   = req.headers['x-callback-secret'];
  const expected = process.env.N8N_CALLBACK_SECRET;
  if (expected && secret !== expected) {
    console.warn(`[CALLBACK RDV] Invalid secret from ${req.ip}`);
    return res.status(403).json({ success: false, error: 'Accès non autorisé' });
  }

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
    if (!candidature) return res.status(404).json({ success: false, error: 'Candidature introuvable' });

    logAudit({ action: 'RDV_CONFIRME_N8N', entity_type: 'candidature', entity_id: req.params.id, entity_label: candidature.candidat_nom, user_email: 'n8n', details: { date, heure, lieu } });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
