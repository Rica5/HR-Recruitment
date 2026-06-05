require("dotenv").config();
const express    = require("express");
const path       = require("path");
const fs         = require("fs");
const cors       = require("cors");
const mongoose   = require("mongoose");
const jwt        = require("jsonwebtoken");
const compression = require("compression");
const helmet     = require("helmet");

const authRouter         = require("./routes/auth");
const offresRouter       = require("./routes/offres");
const candidaturesRouter = require("./routes/candidatures");
const n8nRouter          = require("./routes/n8n");
const publicRouter       = require("./routes/public");
const auditRouter        = require("./routes/audit");
const usersRouter        = require("./routes/users");
const { verifyToken }    = require("./middleware/auth");
const Offre              = require("./models/Offre");
const Candidature        = require("./models/Candidature");
const User               = require("./models/User");

const app        = express();
const PORT       = process.env.PORT || 3000;
const IS_PROD    = process.env.NODE_ENV === "production";

// ── Startup configuration checks ──
if (IS_PROD && !process.env.JWT_SECRET)
  throw new Error("JWT_SECRET is required in production");
if (IS_PROD && !process.env.N8N_CALLBACK_SECRET)
  throw new Error("N8N_CALLBACK_SECRET is required in production");
if (IS_PROD && !process.env.MONGODB_URI)
  throw new Error("MONGODB_URI is required in production");
if (IS_PROD && !process.env.BASE_URL)
  throw new Error("BASE_URL is required in production");
if (!process.env.JWT_SECRET)           console.warn("⚠️  JWT_SECRET not defined — using default secret (dev only)");
if (!process.env.N8N_CALLBACK_SECRET)  console.warn("⚠️  N8N_CALLBACK_SECRET not defined — n8n callbacks will be rejected");
if (!process.env.EMAIL_USER)           console.warn("⚠️  EMAIL_USER not defined — email sending disabled");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

// ── Trust proxy (nginx reverse proxy on Droplet) ──
app.set("trust proxy", 1);

// ── Security headers ──
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "https:", "data:"],
      connectSrc: ["'self'", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── Compression ──
app.use(compression());

// ── CORS ──
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean)
  : (process.env.BASE_URL ? [process.env.BASE_URL] : null);
app.use(cors(allowedOrigins ? { origin: allowedOrigins, credentials: true } : {}));

// ── Global middlewares ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ── Health check (no auth — pour monitoring / load balancer) ──
app.get("/health", (_req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbOk    = dbState === 1;
  res.status(dbOk ? 200 : 503).json({
    status:    dbOk ? "ok" : "degraded",
    uptime:    Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    mongodb:   dbOk ? "connected" : "disconnected",
    version:   process.env.npm_package_version || "2.0.0",
  });
});

app.get("/readiness", (_req, res) => {
  if (mongoose.connection.readyState !== 1)
    return res.status(503).json({ status: "not_ready", reason: "MongoDB disconnected" });
  res.json({ status: "ready" });
});

// ── JWT-protected file download ──
const UPLOADS_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(path.join(__dirname, "uploads"));

app.get("/api/uploads/:filename", (req, res) => {
  const token = req.query.token || (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).send("Unauthorized");
  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).send("Invalid token");
  }
  const filename = path.basename(req.params.filename);
  const filePath = path.resolve(path.join(UPLOADS_DIR, filename));
  if (!filePath.startsWith(UPLOADS_DIR + path.sep)) return res.status(403).send("Forbidden");
  if (!fs.existsSync(filePath)) return res.status(404).send("File not found");
  res.sendFile(filePath);
});

// ── API Routes ──
app.use("/api/auth",         authRouter);
app.use("/api/public",       publicRouter);
app.use("/api/offres",       verifyToken, offresRouter);
app.use("/api/candidatures", verifyToken, candidaturesRouter);
app.use("/api/n8n",          verifyToken, n8nRouter);
app.use("/api/audit",        verifyToken, auditRouter);
app.use("/api/users",        verifyToken, usersRouter);

// ── Public pages ──
app.get("/login",    (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/postuler", (req, res) => res.sendFile(path.join(__dirname, "public", "postuler.html")));

// ── SPA catch-all ──
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "app.html")));

// ── Centralized error handler ──
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl} —`, err.stack || err.message || err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: IS_PROD ? "An unexpected error occurred" : (err.message || "Server error"),
  });
});

// ── MongoDB connection + startup ──
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/solumada_recruitment", {
    connectTimeoutMS:          10000,
    socketTimeoutMS:           45000,
    serverSelectionTimeoutMS:  5000,
  })
  .then(async () => {
    console.log("✅ MongoDB connected");

    // ── One-time migration: set default company on legacy documents ──
    await User.updateMany({ company: { $exists: false } }, { $set: { company: 'solumada', theme: 'solumada' } });
    await Offre.updateMany({ company: { $exists: false } }, { $set: { company: 'solumada' } });
    await Candidature.updateMany({ company: { $exists: false } }, { $set: { company: 'solumada' } });

    // ── Crons — run only on PM2 instance 0 (or single-process mode) to avoid duplicate jobs ──
    const isMainInstance = !process.env.PM2_INSTANCE_ID || process.env.PM2_INSTANCE_ID === '0';

    // ── Cron 1: auto-close expired job offers ──
    async function closeExpiredJobOffers() {
      try {
        const result = await Offre.updateMany(
          { date_butoire: { $lt: new Date() }, statut: "Active" },
          { $set: { statut: "Fermée" } }
        );
        if (result.modifiedCount > 0)
          console.log(`[CRON] ${result.modifiedCount} expired job offer(s) automatically closed`);
      } catch (err) {
        console.error("[CRON] Error closing job offers:", err.message);
      }
    }

    // ── Cron 2: interview reminders (D+2 and D+4 after invitation) ──
    async function sendInterviewReminders() {
      try {
        const { sendInterviewReminder } = require("./services/email");
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

        const toRemind1 = await Candidature.find({
          recommandation:             "QUALIFIE",
          email_invitation_envoye_le: { $lt: fortyEightHoursAgo, $ne: null },
          rdv_pris:                   false,
          non_interesse:              false,
          relance_1_envoyee_le:       null,
          candidat_email:             { $ne: "" },
        });

        for (const cand of toRemind1) {
          const offre = await Offre.findOne({ offre_id: cand.offre_id });
          if (!offre) continue;
          try {
            await sendInterviewReminder({ candidature: cand, offre, numRelance: 1 });
            await Candidature.findByIdAndUpdate(cand._id, { relance_1_envoyee_le: new Date() });
          } catch (e) {
            console.warn(`[CRON] Reminder 1 not sent to ${cand.candidat_email}:`, e.message);
          }
        }

        const toRemind2 = await Candidature.find({
          recommandation:       "QUALIFIE",
          relance_1_envoyee_le: { $lt: fortyEightHoursAgo, $ne: null },
          rdv_pris:             false,
          non_interesse:        false,
          relance_2_envoyee_le: null,
          candidat_email:       { $ne: "" },
        });

        for (const cand of toRemind2) {
          const offre = await Offre.findOne({ offre_id: cand.offre_id });
          if (!offre) continue;
          try {
            await sendInterviewReminder({ candidature: cand, offre, numRelance: 2 });
            await Candidature.findByIdAndUpdate(cand._id, { relance_2_envoyee_le: new Date() });
          } catch (e) {
            console.warn(`[CRON] Reminder 2 not sent to ${cand.candidat_email}:`, e.message);
          }
        }

        const total = toRemind1.length + toRemind2.length;
        if (total > 0)
          console.log(`[CRON] ${toRemind1.length} reminder(s) 1 and ${toRemind2.length} reminder(s) 2 sent`);
      } catch (err) {
        console.error("[CRON] Error sending interview reminders:", err.message);
      }
    }

    if (isMainInstance) {
      closeExpiredJobOffers();
      sendInterviewReminders();
      setInterval(closeExpiredJobOffers,  60 * 60 * 1000);
      setInterval(sendInterviewReminders, 60 * 60 * 1000);
    }

    app.listen(PORT, () => {
      console.log(`\n🚀 Solumada Recrutement\n   ➜  http://localhost:${PORT}\n`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB:", err.message);
    process.exit(1);
  });
