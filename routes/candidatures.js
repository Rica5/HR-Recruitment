const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const Candidature = require("../models/Candidature");
const Offre = require("../models/Offre");
const {
  triggerAIAnalysis,
  triggerManualWorkflow,
  triggerQualificationEmail,
} = require("../services/n8n");
const { sendRejectionEmail, sendTestSummons } = require("../services/email");
const { logAudit } = require("../services/audit");

// Fields editable by admins via PATCH
const ADMIN_EDITABLE = new Set([
  "statut",
  "recommandation",
  "candidat_nom",
  "candidat_email",
  "candidat_telephone",
  "email_recruteur",
  "score",
  "resume_analyse",
  "adequation_poste",
  "competences_detectees",
  "competences_manquantes",
  "experience_annees",
  "niveau_education",
  "points_forts",
  "points_faibles",
  "titre_poste",
  "canal_candidature",
  "a_email",
  "a_appeler",
  "rdv_pris",
  "non_interesse",
  "email_invitation_envoye_le",
  "relance_1_envoyee_le",
  "relance_2_envoyee_le",
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "..", "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const candidateName = (req.body.candidat_nom || "candidat").replace(
      /[^a-zA-Z0-9]/gi,
      "_",
    );
    const prefix = file.fieldname === "cv" ? "CV" : "Lettre";
    cb(
      null,
      `${prefix}_${candidateName}_${Date.now()}${path.extname(file.originalname)}`,
    );
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/candidatures — manual admin entry → create in MongoDB, then AI analysis via n8n
router.post(
  "/",
  upload.fields([
    { name: "cv", maxCount: 1 },
    { name: "lettre", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const data = { ...req.body };

      const offre = await Offre.findOne({ offre_id: data.offre_id });
      if (!offre)
        return res
          .status(404)
          .json({ success: false, error: "Offre introuvable" });

      if (offre.date_butoire && new Date() > new Date(offre.date_butoire)) {
        const dateStr = new Date(offre.date_butoire).toLocaleDateString(
          "fr-FR",
          { day: "2-digit", month: "long", year: "numeric" },
        );
        return res
          .status(410)
          .json({
            success: false,
            error: `Date butoire dépassée (${dateStr}) — candidature non acceptée`,
          });
      }

      if (data.candidat_email) {
        const existing = await Candidature.findOne({
          candidat_email: data.candidat_email,
          offre_id: data.offre_id,
        });
        if (existing)
          return res
            .status(409)
            .json({
              success: false,
              error: "Ce candidat a déjà postulé pour cette offre",
            });
      }

      if (req.files?.cv?.[0]) {
        data.cv_filename = req.files.cv[0].filename;
        data.cv_path = `/uploads/${req.files.cv[0].filename}`;
      }
      if (req.files?.lettre?.[0]) {
        data.lettre_filename = req.files.lettre[0].filename;
        data.lettre_path = `/uploads/${req.files.lettre[0].filename}`;
      }

      data.titre_poste = offre.titre_poste;
      data.email_recruteur = offre.email_recruteur;
      data.canal_candidature = data.canal_candidature || "plateforme";
      data.a_email = !!data.candidat_email;
      data.a_appeler = !data.candidat_email;

      const candidature = await Candidature.create(data);

      // AI analysis only if a CV is attached
      if (candidature.cv_path) {
        triggerManualWorkflow(candidature, offre).catch((e) =>
          console.warn("Manual WF not triggered:", e.message),
        );
      }

      logAudit({
        action: "CANDIDATURE_MANUELLE",
        entity_type: "candidature",
        entity_id: candidature._id.toString(),
        entity_label: candidature.candidat_nom,
        user_email: req.user.email,
        details: {
          offre_id: offre.offre_id,
          canal: data.canal_candidature,
          avec_cv: !!candidature.cv_path,
        },
      });

      res.status(201).json({ success: true, candidature });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

// GET /api/candidatures
router.get("/", async (req, res) => {
  try {
    const { offre_id, recommandation, a_appeler, q } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const filter = {};
    if (offre_id) filter.offre_id = offre_id;
    if (recommandation) filter.recommandation = recommandation;
    if (a_appeler === "true") filter.a_appeler = true;
    if (q)
      filter.$or = [
        { candidat_nom: { $regex: q, $options: "i" } },
        { candidat_email: { $regex: q, $options: "i" } },
        { titre_poste: { $regex: q, $options: "i" } },
      ];

    const [candidatures, total] = await Promise.all([
      Candidature.find(filter)
        .sort({ score: -1, date_candidature: -1 })
        .skip(skip)
        .limit(limit),
      Candidature.countDocuments(filter),
    ]);

    res.json({
      success: true,
      candidatures,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/candidatures/calcom/slots?offre_id=XXX[&date=YYYY-MM-DD|&days=N]
// Sans &date → retourne { dates: { "2025-05-12": [{time}], … } } pour les N prochains jours
// Avec &date  → retourne { slots: [{time}] } (legacy, un seul jour)
router.get("/calcom/slots", async (req, res) => {
  const { date, offre_id, days } = req.query;
  if (!offre_id)
    return res.status(400).json({ success: false, error: "Paramètre offre_id requis" });

  let username = '', eventTypeSlug = '';
  try {
    const offre = await Offre.findOne({ offre_id });
    const lienRdv = offre?.lien_rdv || offre?.lien_calendar;
    if (!lienRdv)
      return res.status(400).json({ success: false, error: "Cette offre n'a pas de lien cal.com configuré" });

    const calUrl = new URL(lienRdv);
    const parts = calUrl.pathname.split("/").filter(Boolean);
    username = parts[0];
    eventTypeSlug = parts[1];
    if (!username || !eventTypeSlug)
      return res.status(400).json({ success: false, error: "lien_rdv invalide — format attendu : https://cal.com/username/event-slug" });

    let startTime, endTime;
    if (date) {
      startTime = `${date}T00:00:00.000Z`;
      endTime   = `${date}T23:59:59.000Z`;
    } else {
      const numDays = Math.min(parseInt(days || "90", 10), 365);
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end   = new Date(start); end.setDate(end.getDate() + numDays); end.setHours(23, 59, 59, 999);
      startTime = start.toISOString();
      endTime   = end.toISOString();
    }

    // Primary: public endpoint — no auth needed, uses usernameList array format
    let r = null;
    try {
      const qs = new URLSearchParams();
      qs.append('usernameList[0]', username);
      qs.append('eventTypeSlug', eventTypeSlug);
      qs.append('startTime', startTime);
      qs.append('endTime', endTime);
      console.log(`[calcom] slots request: username=${username} slug=${eventTypeSlug}`);
      r = await axios.get(`https://api.cal.com/v2/slots/available?${qs.toString()}`, {
        headers: { "cal-api-version": "2024-08-13" },
        timeout: 10000,
      });
      console.log('[calcom] slots response status:', r.status, '— keys:', Object.keys(r.data?.data || {}));
    } catch (pubErr) {
      console.warn('[calcom] public slots failed:', pubErr.response?.status || pubErr.message);

      // Fallback: resolve eventTypeId via v1 API (needs CALCOM_API_KEY)
      const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
      let eventTypeId = null;
      if (CALCOM_API_KEY) {
        try {
          const etRes = await axios.get("https://api.cal.com/v1/event-types", {
            params: { apiKey: CALCOM_API_KEY },
            timeout: 10000,
          });
          const list = etRes.data?.event_types || [];
          console.log('[calcom] event-types v1:', list.map(e => `${e.id}:${e.slug}`).join(', '));
          const et = list.find(e => e.slug === eventTypeSlug);
          eventTypeId = et?.id ?? null;
        } catch (etErr) {
          console.error('[calcom] event-types v1 error:', etErr.response?.status, etErr.response?.data || etErr.message);
        }
      }

      if (!eventTypeId) {
        const msg = pubErr.response?.data?.message || pubErr.message;
        return res.status(502).json({ success: false, error: `Erreur cal.com : ${msg}` });
      }

      r = await axios.get("https://api.cal.com/v2/slots/available", {
        params: { eventTypeId, startTime, endTime },
        headers: { "cal-api-version": "2024-08-13" },
        timeout: 10000,
      });
    }

    // cal.com v2 response: { data: { slots: { "YYYY-MM-DD": [...] } } }
    // OR sometimes:        { data: { "YYYY-MM-DD": [...] } }
    const dataObj = r.data?.data || {};
    const slotsObj = dataObj.slots && typeof dataObj.slots === 'object'
      ? dataObj.slots   // nested under "slots" key
      : dataObj;        // dates at root of data
    console.log('[calcom] slotsObj keys:', Object.keys(slotsObj).slice(0, 5), '— total days:', Object.keys(slotsObj).length);

    if (date) {
      const slots = Object.values(slotsObj).flat().map(s => ({ time: s.time || s.start }));
      return res.json({ success: true, slots });
    }

    // Range mode : retourner uniquement les jours avec des créneaux
    const dates = {};
    for (const [dateKey, daySlots] of Object.entries(slotsObj)) {
      if (Array.isArray(daySlots) && daySlots.length > 0)
        dates[dateKey] = daySlots.map(s => ({ time: s.time || s.start }));
    }
    console.log('[calcom] available dates:', Object.keys(dates));
    res.json({ success: true, dates });
  } catch (err) {
    const status = err.response?.status;
    const msg    = err.response?.data?.message || err.message;
    const detail = status === 404
      ? `Event type introuvable sur cal.com — vérifiez lien_rdv (username="${username}", slug="${eventTypeSlug}")`
      : `Erreur cal.com : ${msg}`;
    res.status(502).json({ success: false, error: detail });
  }
});

// GET /api/candidatures/:id
router.get("/:id", async (req, res) => {
  try {
    const candidature = await Candidature.findById(req.params.id);
    if (!candidature)
      return res
        .status(404)
        .json({ success: false, error: "Candidature introuvable" });
    res.json({ success: true, candidature });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/candidatures/:id
router.patch("/:id", async (req, res) => {
  try {
    const update = {};
    for (const [key, val] of Object.entries(req.body)) {
      if (ADMIN_EDITABLE.has(key)) update[key] = val;
    }
    if (!Object.keys(update).length)
      return res
        .status(400)
        .json({ success: false, error: "Aucun champ modifiable fourni" });

    const candidature = await Candidature.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true },
    );
    if (!candidature)
      return res
        .status(404)
        .json({ success: false, error: "Candidature introuvable" });
    if (update.statut) {
      logAudit({
        action: "STATUT_CHANGE",
        entity_type: "candidature",
        entity_id: req.params.id,
        entity_label: candidature.candidat_nom,
        user_email: req.user.email,
        details: { statut: update.statut },
      });
    }
    res.json({ success: true, candidature });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/candidatures/:id/envoyer-emails-qualification — delegates to n8n
router.post("/:id/envoyer-emails-qualification", async (req, res) => {
  try {
    const candidature = await Candidature.findById(req.params.id);
    if (!candidature)
      return res
        .status(404)
        .json({ success: false, error: "Candidature introuvable" });
    const offre = await Offre.findOne({ offre_id: candidature.offre_id });
    if (!offre)
      return res
        .status(404)
        .json({ success: false, error: "Offre introuvable" });

    if (!candidature.candidat_email) {
      await Candidature.findByIdAndUpdate(req.params.id, {
        statut: "En cours",
      });
      logAudit({
        action: "QUALIFIE_SANS_EMAIL",
        entity_type: "candidature",
        entity_id: req.params.id,
        entity_label: candidature.candidat_nom,
        user_email: req.user.email,
        details: { offre_id: candidature.offre_id },
      });
      return res.json({
        success: true,
        message: "Candidat qualifié (pas d'email — aucune invitation envoyée)",
      });
    }

    const result = await triggerQualificationEmail(candidature, offre);
    if (!result.success) {
      return res
        .status(502)
        .json({
          success: false,
          error: result.error || "Webhook qualification indisponible",
        });
    }

    // Save send date for reminder tracking
    await Candidature.findByIdAndUpdate(req.params.id, {
      email_invitation_envoye_le: new Date(),
    });
    logAudit({
      action: "EMAIL_QUALIF_ENVOYE",
      entity_type: "candidature",
      entity_id: req.params.id,
      entity_label: candidature.candidat_nom,
      user_email: req.user.email,
      details: { offre_id: candidature.offre_id },
    });
    res.json({
      success: true,
      message: "Email de qualification transmis à n8n",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/candidatures/:id/envoyer-email-refus
router.post("/:id/envoyer-email-refus", async (req, res) => {
  try {
    const candidature = await Candidature.findById(req.params.id);
    if (!candidature)
      return res
        .status(404)
        .json({ success: false, error: "Candidature introuvable" });
    const offre = await Offre.findOne({ offre_id: candidature.offre_id });
    if (!offre)
      return res
        .status(404)
        .json({ success: false, error: "Offre introuvable" });
    await sendRejectionEmail({ candidature, offre });
    res.json({ success: true, message: "Email de refus envoyé" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/candidatures/:id/convoquer-test
router.post("/:id/convoquer-test", async (req, res) => {
  try {
    const candidature = await Candidature.findByIdAndUpdate(
      req.params.id,
      { statut: "Test convoqué" },
      { new: true },
    );
    if (!candidature)
      return res
        .status(404)
        .json({ success: false, error: "Candidature introuvable" });

    const offre = await Offre.findOne({ offre_id: candidature.offre_id });
    if (!offre)
      return res
        .status(404)
        .json({ success: false, error: "Offre introuvable" });

    await sendTestSummons({ candidature, offre });
    res.json({
      success: true,
      message: "Convocation test envoyée",
      candidature,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/candidatures/:id/rdv-manuel
router.post("/:id/rdv-manuel", async (req, res) => {
  try {
    const { date, heure, lieu, note } = req.body;
    const update = {
      rdv_manuel: {
        date: date || null,
        heure: heure || "",
        lieu: lieu || "",
        note: note || "",
      },
      statut: "Entretien planifié",
      rdv_pris: true,
    };
    const candidature = await Candidature.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true },
    );
    if (!candidature)
      return res
        .status(404)
        .json({ success: false, error: "Candidature introuvable" });
    logAudit({
      action: "RDV_PLANIFIE",
      entity_type: "candidature",
      entity_id: req.params.id,
      entity_label: candidature.candidat_nom,
      user_email: req.user.email,
      details: { date: date || "", heure: heure || "", lieu: lieu || "" },
    });
    res.json({ success: true, candidature });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/candidatures/:id/planifier-rdv — cal.com booking + DB update
router.post("/:id/planifier-rdv", async (req, res) => {
  try {
    const { date, heure, lieu, note, slot_iso, type_rdv } = req.body;
    if (!date)
      return res.status(400).json({ success: false, error: "Date requise" });

    const candidature = await Candidature.findById(req.params.id);
    if (!candidature)
      return res
        .status(404)
        .json({ success: false, error: "Candidature introuvable" });
    const offre = await Offre.findOne({ offre_id: candidature.offre_id });
    if (!offre)
      return res
        .status(404)
        .json({ success: false, error: "Offre introuvable" });

    const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
    let calcom_booking_uid = null;

    // [1] Book in cal.com (non-blocking — failure logged but doesn't abort)
    if (CALCOM_API_KEY && offre.lien_rdv && slot_iso) {
      try {
        const calUrl = new URL(offre.lien_rdv);
        const parts = calUrl.pathname.split("/").filter(Boolean);
        const username = parts[0];
        const eventTypeSlug = parts[1];

        const etRes = await axios.get("https://api.cal.com/v2/event-types", {
          params: { username },
          headers: {
            Authorization: `Bearer ${CALCOM_API_KEY}`,
            "cal-api-version": "2024-06-14",
          },
          timeout: 10000,
        });
        // v2 may return flat array or nested eventTypeGroups depending on version
        const raw = etRes.data?.data;
        let eventTypes = [];
        if (Array.isArray(raw)) {
          eventTypes = raw;
        } else if (raw?.eventTypeGroups) {
          eventTypes = (raw.eventTypeGroups || []).flatMap(g => g.eventTypes || []);
        } else if (raw?.eventTypes) {
          eventTypes = raw.eventTypes;
        }
        const eventType = eventTypes.find(et => et.slug === eventTypeSlug);
        const eventTypeId = eventType?.id;

        if (!eventTypeId) {
          console.warn(`⚠️  Cal.com: eventType slug="${eventTypeSlug}" not found. Available: ${eventTypes.map(e=>e.slug).join(', ')}`);
        }
        if (eventTypeId) {
          const bookingBody = {
            eventTypeId,
            start: slot_iso,
            attendee: {
              name: candidature.candidat_nom,
              email: candidature.candidat_email || offre.email_recruteur,
              timeZone: "Africa/Abidjan",
              language: "fr",
            },
            metadata: {
              candidature_id: candidature._id.toString(),
              source: "solumada-rh",
            },
          };
          // Présentiel : envoyer l'adresse comme location dans cal.com
          if (type_rdv === "presentiel" && lieu) bookingBody.location = lieu;

          const bookRes = await axios.post(
            "https://api.cal.com/v2/bookings",
            bookingBody,
            {
              headers: {
                Authorization: `Bearer ${CALCOM_API_KEY}`,
                "cal-api-version": "2024-08-13",
                "Content-Type": "application/json",
              },
              timeout: 15000,
            },
          );
          calcom_booking_uid = bookRes.data?.data?.uid || null;
          console.log(
            `✅ Cal.com booking created: ${calcom_booking_uid} for ${candidature.candidat_nom}`,
          );
        }
      } catch (calErr) {
        console.warn(
          `⚠️  Cal.com booking failed for ${candidature.candidat_nom}: ${calErr.response?.data?.message || calErr.message}`,
        );
      }
    }

    // [2] Update DB immediately (reliable fallback regardless of n8n/cal.com status)
    await Candidature.findByIdAndUpdate(req.params.id, {
      rdv_manuel: {
        date:     slot_iso || date,
        heure:    heure    || "",
        lieu:     lieu     || "",
        note:     note     || "",
        type_rdv: type_rdv || "",
      },
      rdv_pris: true,
      statut: "Entretien planifié",
    });

    logAudit({
      action: "RDV_PLANIFIE",
      entity_type: "candidature",
      entity_id: req.params.id,
      entity_label: candidature.candidat_nom,
      user_email: req.user.email,
      details: { date, heure, lieu, calcom_booking_uid },
    });
    res.json({
      success: true,
      message: "RDV planifié avec succès",
      calcom_booking_uid,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/candidatures/:id/relancer-workflow
router.post("/:id/relancer-workflow", async (req, res) => {
  try {
    const candidature = await Candidature.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          score: null,
          recommandation: "",
          resume_analyse: "",
          adequation_poste: "",
          competences_detectees: "",
          competences_manquantes: "",
          points_forts: "",
          points_faibles: "",
          statut: "En cours",
        },
      },
      { new: true },
    );
    if (!candidature)
      return res
        .status(404)
        .json({ success: false, error: "Candidature introuvable" });

    const offre = await Offre.findOne({ offre_id: candidature.offre_id });
    if (!offre)
      return res
        .status(404)
        .json({ success: false, error: "Offre introuvable" });

    const result = await triggerAIAnalysis(candidature, offre);
    if (result.success) {
      logAudit({
        action: "WF_RELANCE",
        entity_type: "candidature",
        entity_id: req.params.id,
        entity_label: candidature.candidat_nom,
        user_email: req.user.email,
        details: { offre_id: candidature.offre_id },
      });
      res.json({
        success: true,
        message: "Workflow relancé — score réinitialisé",
      });
    } else {
      res
        .status(502)
        .json({
          success: false,
          error: result.error || "Webhook n8n indisponible",
        });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/candidatures/:id
router.delete("/:id", async (req, res) => {
  try {
    const c = await Candidature.findByIdAndDelete(req.params.id);
    if (c?.cv_path) {
      const f = path.join(__dirname, "..", c.cv_path);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    if (c?.lettre_path) {
      const f = path.join(__dirname, "..", c.lettre_path);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    logAudit({
      action: "CANDIDATURE_ELIMINEE",
      entity_type: "candidature",
      entity_id: req.params.id,
      entity_label: c?.candidat_nom || req.params.id,
      user_email: req.user.email,
      details: { offre_id: c?.offre_id },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
