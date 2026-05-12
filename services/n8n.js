const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { logAudit } = require("./audit");

const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ||
  "https://optimumdev.app.n8n.cloud/webhook/candidature-reception";
const N8N_WF2_WEBHOOK_URL =
  process.env.N8N_WF2_WEBHOOK_URL ||
  "https://optimumdev.app.n8n.cloud/webhook/candidature-app";
const N8N_QUALIF_WEBHOOK_URL =
  process.env.N8N_QUALIF_WEBHOOK_URL ||
  "https://optimumdev.app.n8n.cloud/webhook/candidature-mailing";

const MAX_RETRIES = parseInt(process.env.N8N_MAX_RETRIES || "3");
const RETRY_DELAY = parseInt(process.env.N8N_RETRY_DELAY || "4000"); // ms, doubled each attempt

// Network error codes = n8n unreachable → retry allowed
const RETRYABLE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ECONNRESET",
  "ECONNABORTED",
  "EAI_AGAIN",
]);

// Timeout = n8n reachable but workflow is processing (Claude AI, emails…).
// Do NOT retry on timeout to avoid duplicates in n8n.
function isRetryable(err) {
  if (RETRYABLE_CODES.has(err.code)) return true;
  const status = err.response?.status;
  if (status >= 500 && status < 600) return true; // n8n server error
  return false;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Log payload without base64 fields (too large)
function logPayloadSafely(label, payload) {
  const safe = Object.fromEntries(
    Object.entries(payload).map(([k, v]) =>
      k.endsWith("_base64")
        ? [k, `<base64 ${Math.round((v?.length || 0) / 1024)}kb>`]
        : [k, v],
    ),
  );
  console.error(`${label} — payload :`, JSON.stringify(safe, null, 2));
}

/**
 * Triggers WF2 via webhook.
 *
 * Strategy:
 *  - axios timeout = 90s (allows time for Claude + emails before the 48h Wait)
 *  - Retry only on network errors (n8n unreachable) or HTTP 5xx
 *  - NO retry on timeout: n8n received it and is processing → avoids duplicates
 */
async function triggerAIAnalysis(candidature, offre) {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  const payload = {
    callback_url: `${baseUrl}/api/public/candidature`,
    candidature_id: candidature._id.toString(),
    offre_id: candidature.offre_id,
    titre_poste: offre.titre_poste,
    description_poste: offre.missions_principales || "",
    competences_requises: offre.competences_requises || "",
    annees_experience: offre.annees_experience || "",
    langues_requises: offre.langues_requises || "",
    exigences_ia: offre.exigences_ia || "",
    type_contrat: offre.type_contrat || "",
    localisation: offre.localisation || "",
    email_recruteur: offre.email_recruteur,
    test_requis: offre.test_requis === true,
    automatisation_active: offre.automatisation_active !== false,
    lien_calendar: offre.lien_rdv || offre.lien_calendar || "",
    callback_secret: process.env.N8N_CALLBACK_SECRET || "",
    candidat_nom: candidature.candidat_nom,
    candidat_email: candidature.candidat_email,
    candidat_telephone: candidature.candidat_telephone || "",
    date_candidature: candidature.date_candidature,
  };

  // CV → base64
  if (candidature.cv_path) {
    const abs = path.join(
      __dirname,
      "..",
      candidature.cv_path.replace(/^\//, ""),
    );
    if (fs.existsSync(abs)) {
      payload.cv_base64 = fs.readFileSync(abs).toString("base64");
      payload.cv_mimetype = abs.endsWith(".pdf")
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
  }

  // Cover letter → base64
  if (candidature.lettre_path) {
    const abs = path.join(
      __dirname,
      "..",
      candidature.lettre_path.replace(/^\//, ""),
    );
    if (fs.existsSync(abs)) {
      payload.lettre_base64 = fs.readFileSync(abs).toString("base64");
      payload.lettre_mimetype = abs.endsWith(".pdf")
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await axios.post(N8N_WEBHOOK_URL, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 90000, // 90s — allows time for Claude + emails before the 48h Wait
      });
      console.log(
        `✅ WF2 triggered for ${candidature.candidat_nom} — attempt ${attempt}/${MAX_RETRIES} — HTTP ${res.status}`,
      );
      return { success: true, attempts: attempt };
    } catch (err) {
      lastError = err;

      if (!isRetryable(err)) {
        console.warn(
          `⚠️  WF2 non-retryable for ${candidature.candidat_nom} (${err.code || err.message}) — workflow probably running in n8n`,
        );
        logPayloadSafely("WF2 non-retryable", payload);
        logAudit({
          action: "WF_ECHEC",
          entity_type: "candidature",
          entity_id: candidature._id.toString(),
          entity_label: candidature.candidat_nom,
          user_email: "n8n",
          details: {
            workflow: "WF2",
            erreur: err.message,
            code: err.code || "",
          },
        });
        return { success: false, error: err.message, retried: false };
      }

      const delay = RETRY_DELAY * Math.pow(2, attempt - 1); // 4s, 8s, 16s
      if (attempt < MAX_RETRIES) {
        console.warn(
          `⚠️  WF2 attempt ${attempt}/${MAX_RETRIES} failed for ${candidature.candidat_nom} [${err.code}] — retry in ${delay / 1000}s`,
        );
        await wait(delay);
      }
    }
  }

  console.error(
    `❌ WF2 webhook abandoned after ${MAX_RETRIES} attempts for ${candidature.candidat_nom} — ${lastError.message}`,
  );
  logPayloadSafely("WF2 abandon", payload);
  logAudit({
    action: "WF_ECHEC",
    entity_type: "candidature",
    entity_id: candidature._id.toString(),
    entity_label: candidature.candidat_nom,
    user_email: "n8n",
    details: {
      workflow: "WF2",
      erreur: lastError.message,
      tentatives: MAX_RETRIES,
    },
  });
  return { success: false, error: lastError.message, attempts: MAX_RETRIES };
}

/**
 * Triggers AI analysis for a manually entered application.
 * Same flow as WF2: the app already created the application in MongoDB,
 * n8n receives the _id + CV, analyzes with Claude, and calls the callback to update.
 */
async function triggerManualWorkflow(candidature, offre) {
  if (!N8N_WF2_WEBHOOK_URL) {
    console.warn(
      "⚠️  N8N_WF2_WEBHOOK_URL not configured — manual analysis skipped",
    );
    return { success: false, error: "Manual webhook URL not configured" };
  }

  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  const payload = {
    callback_url: `${baseUrl}/api/public/candidature`,
    candidature_id: candidature._id.toString(),
    offre_id: candidature.offre_id,
    titre_poste: offre.titre_poste,
    description_poste: offre.missions_principales || "",
    competences_requises: offre.competences_requises || "",
    annees_experience: offre.annees_experience || "",
    langues_requises: offre.langues_requises || "",
    exigences_ia: offre.exigences_ia || "",
    type_contrat: offre.type_contrat || "",
    localisation: offre.localisation || "",
    email_recruteur: offre.email_recruteur,
    test_requis: offre.test_requis === true,
    automatisation_active: offre.automatisation_active !== false,
    lien_calendar: offre.lien_rdv || offre.lien_calendar || "",
    callback_secret: process.env.N8N_CALLBACK_SECRET || "",
    candidat_nom: candidature.candidat_nom,
    candidat_email: candidature.candidat_email,
    candidat_telephone: candidature.candidat_telephone || "",
    date_candidature: candidature.date_candidature,
    canal_candidature: candidature.canal_candidature || "",
  };

  // CV → base64 (read from disk, already saved by multer)
  if (candidature.cv_path) {
    const abs = path.join(
      __dirname,
      "..",
      candidature.cv_path.replace(/^\//, ""),
    );
    if (fs.existsSync(abs)) {
      payload.cv_base64 = fs.readFileSync(abs).toString("base64");
      payload.cv_mimetype = abs.endsWith(".pdf")
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
  }

  // Cover letter → base64
  if (candidature.lettre_path) {
    const abs = path.join(
      __dirname,
      "..",
      candidature.lettre_path.replace(/^\//, ""),
    );
    if (fs.existsSync(abs)) {
      payload.lettre_base64 = fs.readFileSync(abs).toString("base64");
      payload.lettre_mimetype = abs.endsWith(".pdf")
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await axios.post(N8N_WF2_WEBHOOK_URL, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 90000,
      });
      console.log(
        `✅ Manual WF triggered for ${candidature.candidat_nom} — attempt ${attempt}/${MAX_RETRIES} — HTTP ${res.status}`,
      );
      return { success: true, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) {
        console.warn(
          `⚠️  Manual WF non-retryable for ${candidature.candidat_nom} (${err.code || err.message})`,
        );
        logPayloadSafely("Manual WF non-retryable", payload);
        logAudit({
          action: "WF_ECHEC",
          entity_type: "candidature",
          entity_id: candidature._id.toString(),
          entity_label: candidature.candidat_nom,
          user_email: "n8n",
          details: {
            workflow: "WF_MANUEL",
            erreur: err.message,
            code: err.code || "",
          },
        });
        return { success: false, error: err.message, retried: false };
      }
      const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
      if (attempt < MAX_RETRIES) {
        console.warn(
          `⚠️  Manual WF attempt ${attempt}/${MAX_RETRIES} — retry in ${delay / 1000}s`,
        );
        await wait(delay);
      }
    }
  }

  console.error(
    `❌ Manual WF abandoned after ${MAX_RETRIES} attempts for ${candidature.candidat_nom}`,
  );
  logPayloadSafely("Manual WF abandon", payload);
  logAudit({
    action: "WF_ECHEC",
    entity_type: "candidature",
    entity_id: candidature._id.toString(),
    entity_label: candidature.candidat_nom,
    user_email: "n8n",
    details: {
      workflow: "WF_MANUEL",
      erreur: lastError.message,
      tentatives: MAX_RETRIES,
    },
  });
  return { success: false, error: lastError.message, attempts: MAX_RETRIES };
}

/**
 * Triggers the n8n webhook to send the qualification email (manual or auto).
 */
async function triggerQualificationEmail(candidature, offre) {
  if (!N8N_QUALIF_WEBHOOK_URL) {
    console.warn(
      "⚠️  N8N_QUALIF_WEBHOOK_URL not configured — qualification email skipped",
    );
    return {
      success: false,
      error: "Qualification webhook URL not configured",
    };
  }

  const payload = {
    candidature_id: candidature._id.toString(),
    candidat_nom: candidature.candidat_nom,
    candidat_email: candidature.candidat_email,
    candidat_telephone: candidature.candidat_telephone || "",
    titre_poste: candidature.titre_poste,
    offre_id: candidature.offre_id,
    email_recruteur: offre.email_recruteur,
    lien_rdv: offre.lien_rdv || offre.lien_calendar || "",
    test_requis: offre.test_requis === true,
    test_date: offre.test_date || null,
    test_heure: offre.test_heure || "",
    test_lieu: offre.test_lieu || "",
    callback_secret: process.env.N8N_CALLBACK_SECRET || "",
    base_url: process.env.BASE_URL || "http://localhost:3000",
  };

  try {
    const res = await axios.post(N8N_QUALIF_WEBHOOK_URL, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });
    console.log(
      `✅ Qualification email triggered for ${candidature.candidat_nom} — HTTP ${res.status}`,
    );
    return { success: true };
  } catch (err) {
    console.error(
      `❌ Qualification email not sent for ${candidature.candidat_nom} — ${err.message}`,
    );
    logPayloadSafely("Qualification failure", payload);
    return { success: false, error: err.message };
  }
}

module.exports = {
  triggerAIAnalysis,
  triggerManualWorkflow,
  triggerQualificationEmail,
};
