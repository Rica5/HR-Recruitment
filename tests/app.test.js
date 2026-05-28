/**
 * Solumada Recrutement App — Suite de Tests Complète
 *
 * Couverture :
 *  - Middleware JWT (verifyToken)
 *  - Modèles Mongoose (User, Offre, Candidature) — hooks pre-save, méthodes
 *  - Routes Auth    : login, setup, me, theme, forgot/reset password
 *  - Routes Offres  : CRUD, stats, inspection travail, multi-tenant
 *  - Routes Candidatures : CRUD, actions, pagination, whitelist champs
 *  - Routes Users   : CRUD, toggle-actif, isolation company
 *  - Routes Public  : GET offre active, callback n8n analyse/rdv
 *  - Isolation multi-tenant stricte (Solumada ↔ Optimum)
 *  - Payload JWT (company, theme, role)
 *
 * Stack : Jest + Supertest + mongodb-memory-server
 */

// ─────────────────────────────────────────────
// Variables d'environnement de test
// ─────────────────────────────────────────────
process.env.JWT_SECRET        = 'test_secret_solumada_jest_2024';
process.env.BASE_URL          = 'http://localhost:3000';
process.env.NODE_ENV          = 'test';
process.env.N8N_CALLBACK_SECRET = 'test_callback_secret';

// ─────────────────────────────────────────────
// Mocks (doivent être déclarés avant les require)
// ─────────────────────────────────────────────
jest.mock('../services/email', () => ({
  sendJobOfferEmail:      jest.fn().mockResolvedValue({}),
  sendRejectionEmail:     jest.fn().mockResolvedValue({}),
  sendTestSummons:        jest.fn().mockResolvedValue({}),
  sendInterviewReminder:  jest.fn().mockResolvedValue({}),
  sendCredentialsEmail:   jest.fn().mockResolvedValue({}),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({}),
}));

jest.mock('../services/n8n', () => ({
  triggerAIAnalysis:         jest.fn().mockResolvedValue({ success: true }),
  triggerManualWorkflow:     jest.fn().mockResolvedValue({ success: true }),
  triggerQualificationEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../services/audit', () => ({
  logAudit: jest.fn(),
}));

jest.mock('../middleware/rateLimiter', () => ({
  createRateLimiter: () => (req, res, next) => next(),
}));

// ─────────────────────────────────────────────
// Imports
// ─────────────────────────────────────────────
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose  = require('mongoose');
const request   = require('supertest');
const express   = require('express');
const jwt       = require('jsonwebtoken');

const User        = require('../models/User');
const Offre       = require('../models/Offre');
const Candidature = require('../models/Candidature');
const { signToken, verifyToken } = require('../middleware/auth');

// ─────────────────────────────────────────────
// Construction de l'app de test
// ─────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/api/auth',         require('../routes/auth'));
  app.use('/api/public',       require('../routes/public'));
  app.use('/api/offres',       verifyToken, require('../routes/offres'));
  app.use('/api/candidatures', verifyToken, require('../routes/candidatures'));
  app.use('/api/users',        verifyToken, require('../routes/users'));

  return app;
}

// ─────────────────────────────────────────────
// Setup global
// ─────────────────────────────────────────────
let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  app = buildApp();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, 30000);

afterEach(async () => {
  const cols = mongoose.connection.collections;
  for (const key of Object.keys(cols)) {
    await cols[key].deleteMany({});
  }
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
async function createUser(overrides = {}) {
  return User.create({
    nom:     'Admin Test',
    email:   `admin_${Date.now()}@test.com`,
    password:'password123',
    role:    'admin',
    company: 'solumada',
    ...overrides,
  });
}

async function getToken(overrides = {}) {
  const user = await createUser(overrides);
  return { token: signToken(user), user };
}

async function createOffer(company = 'solumada', overrides = {}) {
  return Offre.create({
    offre_id:             `offre-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    titre_poste:          'Développeur Backend',
    missions_principales: 'Développer des APIs REST',
    competences_requises: 'Node.js, MongoDB',
    type_contrat:         'CDI',
    localisation:         'Antananarivo',
    email_recruteur:      'rh@test.com',
    company,
    statut:               'En pause',
    ...overrides,
  });
}

async function createCandidature(offre_id, company = 'solumada', overrides = {}) {
  return Candidature.create({
    offre_id,
    titre_poste:    'Développeur Backend',
    candidat_nom:   `Candidat_${Date.now()}`,
    candidat_email: `cand_${Date.now()}@test.com`,
    company,
    ...overrides,
  });
}

// ═════════════════════════════════════════════
// 1. MIDDLEWARE — verifyToken
// ═════════════════════════════════════════════
describe('Middleware — verifyToken', () => {
  test('401 sans token Authorization', async () => {
    const res = await request(app).get('/api/offres');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('401 avec token malformé', async () => {
    const res = await request(app)
      .get('/api/offres')
      .set('Authorization', 'Bearer ceci_est_faux');
    expect(res.status).toBe(401);
  });

  test('401 avec token expiré', async () => {
    const expired = jwt.sign(
      { id: 'fake', email: 'x@x.com', company: 'solumada' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .get('/api/offres')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  test('200 avec token valide', async () => {
    const { token } = await getToken();
    const res = await request(app)
      .get('/api/offres')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ═════════════════════════════════════════════
// 2. MODÈLE User
// ═════════════════════════════════════════════
describe('Modèle User — hooks & méthodes', () => {
  test('le mot de passe est hashé avant le premier save', async () => {
    const user = await createUser();
    expect(user.password).not.toBe('password123');
    expect(user.password).toMatch(/^\$2[ab]\$/); // format bcrypt
  });

  test('le mot de passe n\'est pas re-hashé si non modifié', async () => {
    const user = await createUser();
    const hashBefore = user.password;
    user.nom = 'Nouveau Nom';
    await user.save();
    expect(user.password).toBe(hashBefore);
  });

  test('checkPassword — retourne true pour le bon mot de passe', async () => {
    const user = await createUser();
    expect(await user.checkPassword('password123')).toBe(true);
  });

  test('checkPassword — retourne false pour un mauvais mot de passe', async () => {
    const user = await createUser();
    expect(await user.checkPassword('mauvaismdp')).toBe(false);
  });

  test('toSafe — exclut le champ password', async () => {
    const user = await createUser();
    const safe = user.toSafe();
    expect(safe.password).toBeUndefined();
    expect(safe.email).toBeDefined();
    expect(safe.nom).toBeDefined();
  });

  test('theme suit automatiquement le company lors du save', async () => {
    const user = await createUser({ company: 'optimum' });
    expect(user.theme).toBe('optimum');
  });

  test('email est stocké en lowercase', async () => {
    const user = await createUser({ email: 'UPPER@TEST.COM' });
    expect(user.email).toBe('upper@test.com');
  });

  test('actif vaut true par défaut', async () => {
    const user = await createUser();
    expect(user.actif).toBe(true);
  });
});

// ═════════════════════════════════════════════
// 3. MODÈLE Offre
// ═════════════════════════════════════════════
describe('Modèle Offre — hooks', () => {
  test('test_requis=true désactive automatiquement automatisation_active', async () => {
    const offre = await createOffer('solumada', { test_requis: true, automatisation_active: true });
    expect(offre.automatisation_active).toBe(false);
  });

  test('test_requis=false conserve automatisation_active=true', async () => {
    const offre = await createOffer('solumada', { test_requis: false, automatisation_active: true });
    expect(offre.automatisation_active).toBe(true);
  });

  test('statut par défaut = "En pause"', async () => {
    const offre = await createOffer('solumada');
    expect(offre.statut).toBe('En pause');
  });

  test('approbation_inspection initialisée avec approuvee=false', async () => {
    const offre = await createOffer('solumada');
    expect(offre.approbation_inspection.approuvee).toBe(false);
  });
});

// ═════════════════════════════════════════════
// 4. AUTH — /api/auth/setup
// ═════════════════════════════════════════════
describe('Auth — POST /api/auth/setup', () => {
  test('201 — crée le premier admin si aucun user n\'existe', async () => {
    const res = await request(app)
      .post('/api/auth/setup')
      .send({ nom: 'Admin', email: 'admin@test.com', password: 'pass123', company: 'solumada' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.company).toBe('solumada');
  });

  test('403 — setup déjà effectué (au moins un user existe)', async () => {
    await createUser({ email: 'existing@test.com' });
    const res = await request(app)
      .post('/api/auth/setup')
      .send({ nom: 'Admin2', email: 'admin2@test.com', password: 'pass123', company: 'solumada' });
    expect(res.status).toBe(403);
  });

  test('400 — company invalide', async () => {
    const res = await request(app)
      .post('/api/auth/setup')
      .send({ nom: 'Admin', email: 'admin@test.com', password: 'pass123', company: 'inconnu' });
    expect(res.status).toBe(400);
  });

  test('le token retourné contient le company', async () => {
    const res = await request(app)
      .post('/api/auth/setup')
      .send({ nom: 'Admin', email: 'jwt@test.com', password: 'pass123', company: 'optimum' });
    const decoded = jwt.decode(res.body.token);
    expect(decoded.company).toBe('optimum');
  });
});

// ═════════════════════════════════════════════
// 5. AUTH — /api/auth/login
// ═════════════════════════════════════════════
describe('Auth — POST /api/auth/login', () => {
  test('200 — login réussi avec le bon mot de passe', async () => {
    const user = await createUser({ email: 'login@test.com' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.password).toBeUndefined();
  });

  test('le token login contient company, role, theme', async () => {
    const user = await createUser({ email: 'tokenpay@test.com', company: 'optimum' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' });
    const decoded = jwt.decode(res.body.token);
    expect(decoded.company).toBe('optimum');
    expect(decoded.role).toBe('admin');
    expect(decoded.theme).toBe('optimum');
  });

  test('401 — mauvais mot de passe', async () => {
    const user = await createUser({ email: 'bad@test.com' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'MAUVAIS' });
    expect(res.status).toBe(401);
  });

  test('401 — email inconnu', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inexistant@test.com', password: 'pass' });
    expect(res.status).toBe(401);
  });

  test('401 — user inactif ne peut pas se connecter', async () => {
    const user = await createUser({ email: 'inactive@test.com', actif: false });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' });
    expect(res.status).toBe(401);
  });

  test('400 — email ou mot de passe manquant', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com' }); // pas de password
    expect(res.status).toBe(400);
  });

  test('400 — body vide', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

// ═════════════════════════════════════════════
// 6. AUTH — /api/auth/me
// ═════════════════════════════════════════════
describe('Auth — GET /api/auth/me', () => {
  test('200 — retourne le profil de l\'utilisateur connecté', async () => {
    const { token, user } = await getToken({ email: 'me@test.com' });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.password).toBeUndefined();
  });

  test('401 — sans token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('Auth — PATCH /api/auth/me', () => {
  test('met à jour le nom', async () => {
    const { token } = await getToken();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ nom: 'Nouveau Nom' });
    expect(res.status).toBe(200);
    expect(res.body.user.nom).toBe('Nouveau Nom');
  });

  test('met à jour le mot de passe (hashé en DB)', async () => {
    const { token, user } = await getToken();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'nouveaumdp123' });
    expect(res.status).toBe(200);
    const updated = await User.findById(user._id);
    expect(await updated.checkPassword('nouveaumdp123')).toBe(true);
  });

  test('400 — mot de passe trop court (< 6 caractères)', async () => {
    const { token } = await getToken();
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: '123' });
    expect(res.status).toBe(400);
  });
});

describe('Auth — PATCH /api/auth/theme', () => {
  test('met à jour le thème et retourne un nouveau token', async () => {
    const { token } = await getToken();
    const res = await request(app)
      .patch('/api/auth/theme')
      .set('Authorization', `Bearer ${token}`)
      .send({ theme: 'optimum' });
    expect(res.status).toBe(200);
    expect(res.body.user.theme).toBe('optimum');
    expect(res.body.token).toBeDefined();
  });
});

// ═════════════════════════════════════════════
// 7. AUTH — Réinitialisation mot de passe
// ═════════════════════════════════════════════
describe('Auth — Mot de passe oublié / Réinitialisation', () => {
  test('POST /forgot-password — 200 même si l\'email est inconnu (sécurité)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'inexistant@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /forgot-password — génère un resetToken si l\'email existe', async () => {
    const user = await createUser({ email: 'forgot@test.com' });
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: user.email });
    const updated = await User.findById(user._id);
    expect(updated.resetToken).toBeDefined();
    expect(updated.resetTokenExpiry).toBeDefined();
    expect(updated.resetTokenExpiry.getTime()).toBeGreaterThan(Date.now());
  });

  test('POST /forgot-password — 400 si email manquant', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({});
    expect(res.status).toBe(400);
  });

  test('POST /reset-password — réinitialise le mot de passe avec un token valide', async () => {
    const user = await createUser({ email: 'reset@test.com' });
    const token = 'valid_reset_token_abc123';
    user.resetToken      = token;
    user.resetTokenExpiry = new Date(Date.now() + 3_600_000); // 1h
    await user.save();

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'nouveaumdp456' });
    expect(res.status).toBe(200);

    const updated = await User.findById(user._id);
    expect(updated.resetToken).toBeUndefined();
    expect(updated.resetTokenExpiry).toBeUndefined();
    expect(await updated.checkPassword('nouveaumdp456')).toBe(true);
  });

  test('POST /reset-password — 400 si token invalide', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'token_inexistant', password: 'mdp123456' });
    expect(res.status).toBe(400);
  });

  test('POST /reset-password — 400 si token expiré', async () => {
    const user = await createUser({ email: 'resetexp@test.com' });
    user.resetToken       = 'expired_token';
    user.resetTokenExpiry = new Date(Date.now() - 3_600_000); // expiré il y a 1h
    await user.save();

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'expired_token', password: 'mdp123456' });
    expect(res.status).toBe(400);
  });

  test('POST /reset-password — 400 si mot de passe trop court', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'xxx', password: '123' });
    expect(res.status).toBe(400);
  });

  test('POST /reset-password — 400 si champs manquants', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'xxx' }); // pas de password
    expect(res.status).toBe(400);
  });
});

// ═════════════════════════════════════════════
// 8. OFFRES — CRUD de base
// ═════════════════════════════════════════════
describe('Offres — CRUD', () => {
  let token;

  beforeEach(async () => {
    ({ token } = await getToken({ email: 'rh@test.com', company: 'solumada' }));
  });

  test('GET / — liste uniquement les offres du company de l\'utilisateur', async () => {
    await createOffer('solumada');
    await createOffer('optimum'); // ne doit pas être visible
    const res = await request(app)
      .get('/api/offres')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.offres).toHaveLength(1);
    expect(res.body.offres[0].company).toBe('solumada');
  });

  test('GET / — filtre par statut', async () => {
    await createOffer('solumada', { statut: 'Active' });
    await createOffer('solumada', { statut: 'Fermée' });
    const res = await request(app)
      .get('/api/offres?statut=Active')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.offres).toHaveLength(1);
    expect(res.body.offres[0].statut).toBe('Active');
  });

  test('GET / — filtre par recherche textuelle (q)', async () => {
    await createOffer('solumada', { titre_poste: 'Chef de Projet' });
    await createOffer('solumada', { titre_poste: 'Comptable Senior' });
    const res = await request(app)
      .get('/api/offres?q=chef')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.offres).toHaveLength(1);
    expect(res.body.offres[0].titre_poste).toBe('Chef de Projet');
  });

  test('POST / — crée une offre (company forcé par le serveur)', async () => {
    const res = await request(app)
      .post('/api/offres')
      .set('Authorization', `Bearer ${token}`)
      .send({
        titre_poste:          'Développeur Node.js',
        missions_principales: 'Développer des APIs',
        competences_requises: 'Node.js',
        type_contrat:         'CDI',
        localisation:         'Tana',
        email_recruteur:      'rh@test.com',
      });
    expect(res.status).toBe(201);
    expect(res.body.offre.titre_poste).toBe('Développeur Node.js');
    expect(res.body.offre.company).toBe('solumada'); // forcé côté serveur
    expect(res.body.lien_candidature).toContain(res.body.offre.offre_id);
  });

  test('POST / — l\'offre_id est généré automatiquement si absent', async () => {
    const res = await request(app)
      .post('/api/offres')
      .set('Authorization', `Bearer ${token}`)
      .send({
        titre_poste:          'Comptable',
        missions_principales: 'Gérer la compta',
        competences_requises: 'Excel',
        type_contrat:         'CDD',
        localisation:         'Tana',
        email_recruteur:      'rh@test.com',
      });
    expect(res.status).toBe(201);
    expect(res.body.offre.offre_id).toBeDefined();
  });

  test('GET /:id — retourne une offre spécifique', async () => {
    const offre = await createOffer('solumada');
    const res = await request(app)
      .get(`/api/offres/${offre.offre_id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.offre.offre_id).toBe(offre.offre_id);
  });

  test('GET /:id — 404 si l\'offre appartient à un autre company', async () => {
    const offre = await createOffer('optimum');
    const res = await request(app)
      .get(`/api/offres/${offre.offre_id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('GET /:id — 404 si offre_id inexistant', async () => {
    const res = await request(app)
      .get('/api/offres/offre-inexistante-9999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('PATCH /:id — met à jour les champs d\'une offre', async () => {
    const offre = await createOffer('solumada');
    const res = await request(app)
      .patch(`/api/offres/${offre.offre_id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ localisation: 'Fianarantsoa', salaire: '1 500 000 MGA' });
    expect(res.status).toBe(200);
    expect(res.body.offre.localisation).toBe('Fianarantsoa');
    expect(res.body.offre.salaire).toBe('1 500 000 MGA');
  });

  test('PATCH /:id — ne peut pas modifier le company', async () => {
    const offre = await createOffer('solumada');
    await request(app)
      .patch(`/api/offres/${offre.offre_id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'optimum' });
    const updated = await Offre.findOne({ offre_id: offre.offre_id });
    expect(updated.company).toBe('solumada');
  });

  test('PATCH /:id — 404 si offre appartient à un autre company', async () => {
    const offre = await createOffer('optimum');
    const res = await request(app)
      .patch(`/api/offres/${offre.offre_id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ localisation: 'Hack' });
    expect(res.status).toBe(404);
  });

  test('DELETE /:id — supprime l\'offre et toutes ses candidatures', async () => {
    const offre = await createOffer('solumada');
    await createCandidature(offre.offre_id, 'solumada');
    await createCandidature(offre.offre_id, 'solumada');

    const res = await request(app)
      .delete(`/api/offres/${offre.offre_id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const offreRestante = await Offre.findOne({ offre_id: offre.offre_id });
    expect(offreRestante).toBeNull();

    const candsRestantes = await Candidature.countDocuments({ offre_id: offre.offre_id });
    expect(candsRestantes).toBe(0);
  });

  test('DELETE /:id — 404 si offre appartient à un autre company', async () => {
    const offre = await createOffer('optimum');
    const res = await request(app)
      .delete(`/api/offres/${offre.offre_id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════
// 9. OFFRES — Inspection du Travail (Solumada)
// ═════════════════════════════════════════════
describe('Offres — Règle Inspection du Travail', () => {
  test('Solumada : 403 si activation sans approbation inspection', async () => {
    const { token } = await getToken({ email: 'sol@test.com', company: 'solumada' });
    const offre = await createOffer('solumada');
    const res = await request(app)
      .patch(`/api/offres/${offre.offre_id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ statut: 'Active' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Inspection');
  });

  test('Solumada : 200 si activation avec approbation inspection', async () => {
    const { token } = await getToken({ email: 'sol2@test.com', company: 'solumada' });
    const offre = await createOffer('solumada', {
      approbation_inspection: { approuvee: true, date_approbation: new Date() },
    });
    const res = await request(app)
      .patch(`/api/offres/${offre.offre_id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ statut: 'Active' });
    expect(res.status).toBe(200);
    expect(res.body.offre.statut).toBe('Active');
  });

  test('Optimum : bypass — peut activer sans approbation inspection', async () => {
    const { token } = await getToken({ email: 'opt@test.com', company: 'optimum' });
    const offre = await createOffer('optimum');
    const res = await request(app)
      .patch(`/api/offres/${offre.offre_id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ statut: 'Active' });
    expect(res.status).toBe(200);
    expect(res.body.offre.statut).toBe('Active');
  });

  test('PATCH vers "En pause" ou "Fermée" ne nécessite pas d\'approbation', async () => {
    const { token } = await getToken({ email: 'sol3@test.com', company: 'solumada' });
    const offre = await createOffer('solumada');
    const res = await request(app)
      .patch(`/api/offres/${offre.offre_id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ statut: 'Fermée' });
    expect(res.status).toBe(200);
    expect(res.body.offre.statut).toBe('Fermée');
  });
});

// ═════════════════════════════════════════════
// 10. OFFRES — Stats
// ═════════════════════════════════════════════
describe('Offres — Statistiques', () => {
  let token;

  beforeEach(async () => {
    ({ token } = await getToken({ email: 'stat@test.com', company: 'solumada' }));
  });

  test('GET /stats/summary — retourne les stats du company', async () => {
    const activeOffer = await createOffer('solumada', { statut: 'Active' });
    await createOffer('solumada', { statut: 'Fermée' });
    await createOffer('optimum', { statut: 'Active' }); // autre company — pas compté
    await createCandidature(activeOffer.offre_id, 'solumada', { recommandation: 'QUALIFIE', score: 8 });
    await createCandidature(activeOffer.offre_id, 'solumada', { recommandation: 'A_REVOIR',  score: 5 });

    const res = await request(app)
      .get('/api/offres/stats/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.stats.activeOffers).toBe(1);
    expect(res.body.stats.totalOffers).toBe(2);
    expect(res.body.stats.totalApplications).toBe(2);
    expect(res.body.stats.qualified).toBe(1);
    expect(res.body.stats.toReview).toBe(1);
  });

  test('GET /stats/madagascar — retourne les stats Madagascar du company', async () => {
    const offre = await createOffer('solumada', {
      approbation_inspection: { approuvee: true },
    });
    await createCandidature(offre.offre_id, 'solumada', { rdv_pris: true });

    const res = await request(app)
      .get('/api/offres/stats/madagascar')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.stats.offres.approuvees).toBe(1);
    expect(res.body.stats.candidatures.rdvPris).toBe(1);
  });

  test('GET /:id/candidatures — retourne les candidatures de l\'offre triées par score', async () => {
    const offre = await createOffer('solumada');
    await createCandidature(offre.offre_id, 'solumada', { score: 3 });
    await createCandidature(offre.offre_id, 'solumada', { score: 9 });
    await createCandidature(offre.offre_id, 'solumada', { score: 6 });

    const res = await request(app)
      .get(`/api/offres/${offre.offre_id}/candidatures`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.candidatures).toHaveLength(3);
    expect(res.body.candidatures[0].score).toBe(9); // trié score DESC
  });
});

// ═════════════════════════════════════════════
// 11. CANDIDATURES — CRUD
// ═════════════════════════════════════════════
describe('Candidatures — CRUD', () => {
  let token, offre;

  beforeEach(async () => {
    ({ token } = await getToken({ email: 'rh@test.com', company: 'solumada' }));
    offre = await createOffer('solumada');
  });

  test('GET / — liste uniquement les candidatures du company', async () => {
    await createCandidature(offre.offre_id, 'solumada');
    await createCandidature(offre.offre_id, 'optimum'); // autre company
    const res = await request(app)
      .get('/api/candidatures')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.candidatures).toHaveLength(1);
    expect(res.body.candidatures[0].company).toBe('solumada');
  });

  test('GET / — filtre par recommandation', async () => {
    await createCandidature(offre.offre_id, 'solumada', { recommandation: 'QUALIFIE' });
    await createCandidature(offre.offre_id, 'solumada', { recommandation: 'A_REVOIR' });
    const res = await request(app)
      .get('/api/candidatures?recommandation=QUALIFIE')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.candidatures).toHaveLength(1);
    expect(res.body.candidatures[0].recommandation).toBe('QUALIFIE');
  });

  test('GET / — filtre par recherche textuelle (q)', async () => {
    await createCandidature(offre.offre_id, 'solumada', { candidat_nom: 'Alice Martin' });
    await createCandidature(offre.offre_id, 'solumada', { candidat_nom: 'Bob Smith', candidat_email: 'bob@test.com' });
    const res = await request(app)
      .get('/api/candidatures?q=alice')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.candidatures).toHaveLength(1);
    expect(res.body.candidatures[0].candidat_nom).toBe('Alice Martin');
  });

  test('GET / — pagination : page 1, limit 3 sur 5 candidatures', async () => {
    for (let i = 0; i < 5; i++) {
      await createCandidature(offre.offre_id, 'solumada', {
        candidat_email: `c${i}@test.com`,
        candidat_nom:   `Candidat ${i}`,
      });
    }
    const res = await request(app)
      .get('/api/candidatures?page=1&limit=3')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.candidatures).toHaveLength(3);
    expect(res.body.total).toBe(5);
    expect(res.body.pages).toBe(2);
    expect(res.body.page).toBe(1);
  });

  test('GET / — pagination : page 2', async () => {
    for (let i = 0; i < 5; i++) {
      await createCandidature(offre.offre_id, 'solumada', {
        candidat_email: `pag${i}@test.com`,
        candidat_nom:   `Paginé ${i}`,
      });
    }
    const res = await request(app)
      .get('/api/candidatures?page=2&limit=3')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.candidatures).toHaveLength(2); // 5 - 3 = 2 sur la page 2
  });

  test('GET /:id — retourne une candidature spécifique', async () => {
    const cand = await createCandidature(offre.offre_id, 'solumada');
    const res = await request(app)
      .get(`/api/candidatures/${cand._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.candidature._id).toBe(cand._id.toString());
  });

  test('GET /:id — 404 si candidature appartient à un autre company', async () => {
    const cand = await createCandidature(offre.offre_id, 'optimum');
    const res = await request(app)
      .get(`/api/candidatures/${cand._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('PATCH /:id — met à jour les champs de la whitelist', async () => {
    const cand = await createCandidature(offre.offre_id, 'solumada');
    const res = await request(app)
      .patch(`/api/candidatures/${cand._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ statut: 'En cours', score: 8, recommandation: 'QUALIFIE' });
    expect(res.status).toBe(200);
    expect(res.body.candidature.statut).toBe('En cours');
    expect(res.body.candidature.score).toBe(8);
    expect(res.body.candidature.recommandation).toBe('QUALIFIE');
  });

  test('PATCH /:id — commentaire recruteur (champ whitelist)', async () => {
    const cand = await createCandidature(offre.offre_id, 'solumada');
    const res = await request(app)
      .patch(`/api/candidatures/${cand._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ commentaire: 'Candidat très motivé, à rappeler.' });
    expect(res.status).toBe(200);
    expect(res.body.candidature.commentaire).toBe('Candidat très motivé, à rappeler.');
  });

  test('PATCH /:id — ignore les champs hors whitelist', async () => {
    const cand = await createCandidature(offre.offre_id, 'solumada');
    await request(app)
      .patch(`/api/candidatures/${cand._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'optimum', offre_id: 'hack', statut: 'Accepté' });
    const updated = await Candidature.findById(cand._id);
    expect(updated.company).toBe('solumada');         // inchangé
    expect(updated.offre_id).toBe(offre.offre_id);    // inchangé
    expect(updated.statut).toBe('Accepté');           // autorisé
  });

  test('PATCH /:id — 400 si aucun champ de la whitelist fourni', async () => {
    const cand = await createCandidature(offre.offre_id, 'solumada');
    const res = await request(app)
      .patch(`/api/candidatures/${cand._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ champ_inconnu: 'valeur', autre_champ: 'xyz' });
    expect(res.status).toBe(400);
  });

  test('PATCH /:id — 404 si candidature d\'un autre company', async () => {
    const cand = await createCandidature(offre.offre_id, 'optimum');
    const res = await request(app)
      .patch(`/api/candidatures/${cand._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ statut: 'En cours' });
    expect(res.status).toBe(404);
  });

  test('DELETE /:id — supprime la candidature du bon company', async () => {
    const cand = await createCandidature(offre.offre_id, 'solumada');
    const res = await request(app)
      .delete(`/api/candidatures/${cand._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const restant = await Candidature.findById(cand._id);
    expect(restant).toBeNull();
  });

  test('DELETE /:id — ne supprime pas la candidature d\'un autre company', async () => {
    const cand = await createCandidature(offre.offre_id, 'optimum');
    await request(app)
      .delete(`/api/candidatures/${cand._id}`)
      .set('Authorization', `Bearer ${token}`); // token solumada
    const restant = await Candidature.findById(cand._id);
    expect(restant).not.toBeNull(); // toujours en DB
  });
});

// ═════════════════════════════════════════════
// 12. CANDIDATURES — Actions
// ═════════════════════════════════════════════
describe('Candidatures — Actions spécifiques', () => {
  let token, offre, cand;

  beforeEach(async () => {
    ({ token } = await getToken({ email: 'rh@test.com', company: 'solumada' }));
    offre = await createOffer('solumada');
    cand  = await createCandidature(offre.offre_id, 'solumada', {
      candidat_nom:   'Jean Dupont',
      candidat_email: 'jean@dupont.com',
    });
  });

  test('POST /:id/rdv-manuel — planifie un RDV et met statut "Entretien planifié"', async () => {
    const res = await request(app)
      .post(`/api/candidatures/${cand._id}/rdv-manuel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-07-01', heure: '09:00', lieu: 'Bureau Tana', note: 'Présentiel' });
    expect(res.status).toBe(200);
    expect(res.body.candidature.rdv_pris).toBe(true);
    expect(res.body.candidature.statut).toBe('Entretien planifié');
    expect(res.body.candidature.rdv_manuel.lieu).toBe('Bureau Tana');
  });

  test('POST /:id/relancer-workflow — remet le score et la recommandation à zéro', async () => {
    await Candidature.findByIdAndUpdate(cand._id, { score: 9, recommandation: 'QUALIFIE', statut: 'Entretien planifié' });
    const res = await request(app)
      .post(`/api/candidatures/${cand._id}/relancer-workflow`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const updated = await Candidature.findById(cand._id);
    expect(updated.score).toBeNull();
    expect(updated.recommandation).toBe('');
    expect(updated.statut).toBe('En cours');
  });

  test('POST /:id/envoyer-emails-qualification — 200 (n8n mocké)', async () => {
    const res = await request(app)
      .post(`/api/candidatures/${cand._id}/envoyer-emails-qualification`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /:id/envoyer-emails-qualification — 200 même sans email (qualifié sans invitation)', async () => {
    const candSansEmail = await createCandidature(offre.offre_id, 'solumada', {
      candidat_nom:   'Sans Email',
      candidat_email: '',
    });
    const res = await request(app)
      .post(`/api/candidatures/${candSansEmail._id}/envoyer-emails-qualification`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("pas d'email");
  });

  test('POST /:id/envoyer-email-refus — 200', async () => {
    const res = await request(app)
      .post(`/api/candidatures/${cand._id}/envoyer-email-refus`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('POST /:id/rdv-manuel — 404 si candidature inexistante', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/candidatures/${fakeId}/rdv-manuel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-07-01', heure: '09:00' });
    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════
// 13. USERS — CRUD
// ═════════════════════════════════════════════
describe('Users — CRUD', () => {
  let token, adminUser;

  beforeEach(async () => {
    ({ token, user: adminUser } = await getToken({ email: 'admin@test.com', company: 'solumada' }));
  });

  test('GET / — liste les users du même company (sans password)', async () => {
    await createUser({ email: 'user2@test.com', company: 'solumada' });
    await createUser({ email: 'opt@test.com',   company: 'optimum' }); // pas visible

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.users.every(u => u.company === 'solumada')).toBe(true);
    expect(res.body.users.every(u => u.password === undefined)).toBe(true);
    expect(res.body.users.some(u => u.email === 'opt@test.com')).toBe(false);
  });

  test('POST / — crée un user dans le même company', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ nom: 'Nouvel User', email: 'newuser@test.com', password: 'motdepasse123' });
    expect(res.status).toBe(201);
    expect(res.body.user.company).toBe('solumada'); // hérité du token
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.role).toBe('admin');
  });

  test('POST / — 409 si email déjà utilisé', async () => {
    await createUser({ email: 'dup@test.com' });
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ nom: 'Dup', email: 'dup@test.com', password: 'pass123456' });
    expect(res.status).toBe(409);
  });

  test('POST / — 400 si mot de passe trop court', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ nom: 'User', email: 'short@test.com', password: '123' });
    expect(res.status).toBe(400);
  });

  test('POST / — 400 si champs obligatoires manquants', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ nom: 'User seulement' }); // email et password manquants
    expect(res.status).toBe(400);
  });

  test('PATCH /:id — met à jour le nom', async () => {
    const target = await createUser({ email: 'target@test.com', company: 'solumada' });
    const res = await request(app)
      .patch(`/api/users/${target._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nom: 'Nom Modifié' });
    expect(res.status).toBe(200);
    expect(res.body.user.nom).toBe('Nom Modifié');
  });

  test('PATCH /:id — met à jour le mot de passe (hashé)', async () => {
    const target = await createUser({ email: 'targetpwd@test.com', company: 'solumada' });
    await request(app)
      .patch(`/api/users/${target._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'nouveaupass123' });
    const updated = await User.findById(target._id);
    expect(await updated.checkPassword('nouveaupass123')).toBe(true);
  });

  test('PATCH /:id — 400 si nouveau mot de passe trop court', async () => {
    const target = await createUser({ email: 'shortpwd@test.com', company: 'solumada' });
    const res = await request(app)
      .patch(`/api/users/${target._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: '12' });
    expect(res.status).toBe(400);
  });

  test('PATCH /:id — 404 si user appartient à un autre company', async () => {
    const other = await createUser({ email: 'other@test.com', company: 'optimum' });
    const res = await request(app)
      .patch(`/api/users/${other._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nom: 'Hack' });
    expect(res.status).toBe(404);
  });

  test('PATCH /:id/toggle-actif — désactive un user actif', async () => {
    const target = await createUser({ email: 'toggle@test.com', company: 'solumada' });
    const res = await request(app)
      .patch(`/api/users/${target._id}/toggle-actif`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.actif).toBe(false);
  });

  test('PATCH /:id/toggle-actif — réactive un user inactif', async () => {
    const target = await createUser({ email: 'toggleback@test.com', company: 'solumada', actif: false });
    const res = await request(app)
      .patch(`/api/users/${target._id}/toggle-actif`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.actif).toBe(true);
  });

  test('PATCH /:id/toggle-actif — 400 : impossible de se désactiver soi-même', async () => {
    const { token: selfToken, user: self } = await getToken({ email: 'self@test.com', company: 'solumada' });
    const res = await request(app)
      .patch(`/api/users/${self._id}/toggle-actif`)
      .set('Authorization', `Bearer ${selfToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('propre compte');
  });

  test('PATCH /:id/toggle-actif — 404 si user d\'un autre company', async () => {
    const other = await createUser({ email: 'othertog@test.com', company: 'optimum' });
    const res = await request(app)
      .patch(`/api/users/${other._id}/toggle-actif`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════
// 14. PUBLIC — Routes sans authentification
// ═════════════════════════════════════════════
describe('Public — GET /api/public/offre/:id', () => {
  test('200 — retourne une offre active (sans champs sensibles)', async () => {
    const offre = await createOffer('solumada', { statut: 'Active', email_recruteur: 'secret@rh.com' });
    const res = await request(app).get(`/api/public/offre/${offre.offre_id}`);
    expect(res.status).toBe(200);
    expect(res.body.offre.titre_poste).toBeDefined();
    expect(res.body.offre.email_recruteur).toBeUndefined();       // caché
    expect(res.body.offre.exigences_ia).toBeUndefined();          // caché
    expect(res.body.offre.approbation_inspection).toBeUndefined(); // caché
  });

  test('404 — offre en pause non accessible publiquement', async () => {
    const offre = await createOffer('solumada', { statut: 'En pause' });
    const res = await request(app).get(`/api/public/offre/${offre.offre_id}`);
    expect(res.status).toBe(404);
  });

  test('404 — offre fermée non accessible publiquement', async () => {
    const offre = await createOffer('solumada', { statut: 'Fermée' });
    const res = await request(app).get(`/api/public/offre/${offre.offre_id}`);
    expect(res.status).toBe(404);
  });

  test('404 — offre inexistante', async () => {
    const res = await request(app).get('/api/public/offre/offre-inexistante-9999');
    expect(res.status).toBe(404);
  });
});

describe('Public — PATCH /api/public/candidature/:id/analyse (callback n8n)', () => {
  test('200 — met à jour les champs d\'analyse avec le bon secret', async () => {
    const offre = await createOffer('solumada');
    const cand  = await createCandidature(offre.offre_id, 'solumada');

    const res = await request(app)
      .patch(`/api/public/candidature/${cand._id}/analyse`)
      .set('X-Callback-Secret', 'test_callback_secret')
      .send({
        score:          8,
        recommandation: 'QUALIFIE',
        resume_analyse: 'Excellent profil',
        points_forts:   'Expérience solide',
        points_faibles: 'Peu de français',
      });
    expect(res.status).toBe(200);
    const updated = await Candidature.findById(cand._id);
    expect(updated.score).toBe(8);
    expect(updated.recommandation).toBe('QUALIFIE');
    expect(updated.resume_analyse).toBe('Excellent profil');
  });

  test('403 — mauvais secret de callback', async () => {
    const offre = await createOffer('solumada');
    const cand  = await createCandidature(offre.offre_id, 'solumada');
    const res = await request(app)
      .patch(`/api/public/candidature/${cand._id}/analyse`)
      .set('X-Callback-Secret', 'mauvais_secret')
      .send({ score: 8, recommandation: 'QUALIFIE' });
    expect(res.status).toBe(403);
  });

  test('404 — candidature inexistante', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .patch(`/api/public/candidature/${fakeId}/analyse`)
      .set('X-Callback-Secret', 'test_callback_secret')
      .send({ score: 5, recommandation: 'A_REVOIR' });
    expect(res.status).toBe(404);
  });
});

describe('Public — PATCH /api/public/candidature/:id/rdv-confirme (callback n8n)', () => {
  test('200 — confirme un RDV et met statut "Entretien planifié"', async () => {
    const offre = await createOffer('solumada');
    const cand  = await createCandidature(offre.offre_id, 'solumada');

    const res = await request(app)
      .patch(`/api/public/candidature/${cand._id}/rdv-confirme`)
      .set('X-Callback-Secret', 'test_callback_secret')
      .send({ date: '2026-07-15', heure: '10:00', lieu: 'Visio Zoom' });
    expect(res.status).toBe(200);
    const updated = await Candidature.findById(cand._id);
    expect(updated.statut).toBe('Entretien planifié');
    expect(updated.rdv_pris).toBe(true);
  });
});

// ═════════════════════════════════════════════
// 15. ISOLATION MULTI-TENANT
// ═════════════════════════════════════════════
describe('Isolation multi-tenant (Solumada ↔ Optimum)', () => {
  let solToken, optToken, solOffre, optOffre;

  beforeEach(async () => {
    ({ token: solToken } = await getToken({ email: 'sol@test.com', company: 'solumada' }));
    ({ token: optToken } = await getToken({ email: 'opt@test.com', company: 'optimum' }));
    solOffre = await createOffer('solumada');
    optOffre = await createOffer('optimum');
  });

  test('Solumada ne voit pas les offres Optimum dans GET /offres', async () => {
    const res = await request(app).get('/api/offres').set('Authorization', `Bearer ${solToken}`);
    const ids = res.body.offres.map(o => o.offre_id);
    expect(ids).toContain(solOffre.offre_id);
    expect(ids).not.toContain(optOffre.offre_id);
  });

  test('Optimum ne voit pas les offres Solumada dans GET /offres', async () => {
    const res = await request(app).get('/api/offres').set('Authorization', `Bearer ${optToken}`);
    const ids = res.body.offres.map(o => o.offre_id);
    expect(ids).toContain(optOffre.offre_id);
    expect(ids).not.toContain(solOffre.offre_id);
  });

  test('Solumada ne peut pas accéder à une offre Optimum en GET /:id', async () => {
    const res = await request(app)
      .get(`/api/offres/${optOffre.offre_id}`)
      .set('Authorization', `Bearer ${solToken}`);
    expect(res.status).toBe(404);
  });

  test('Solumada ne voit pas les candidatures Optimum', async () => {
    await createCandidature(optOffre.offre_id, 'optimum');
    const res = await request(app).get('/api/candidatures').set('Authorization', `Bearer ${solToken}`);
    expect(res.body.candidatures).toHaveLength(0);
  });

  test('Solumada ne voit pas les users Optimum dans GET /api/users', async () => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${solToken}`);
    expect(res.body.users.every(u => u.company === 'solumada')).toBe(true);
  });

  test('Les stats de summary ne comptent que le company connecté', async () => {
    await createCandidature(solOffre.offre_id, 'solumada', { recommandation: 'QUALIFIE', score: 8 });
    await createCandidature(optOffre.offre_id, 'optimum',  { recommandation: 'QUALIFIE', score: 9 });

    const solRes = await request(app)
      .get('/api/offres/stats/summary')
      .set('Authorization', `Bearer ${solToken}`);
    expect(solRes.body.stats.qualified).toBe(1); // 1 qualifié solumada seulement

    const optRes = await request(app)
      .get('/api/offres/stats/summary')
      .set('Authorization', `Bearer ${optToken}`);
    expect(optRes.body.stats.qualified).toBe(1); // 1 qualifié optimum seulement
  });

  test('Un user Solumada ne peut pas créer un user dans Optimum', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${solToken}`)
      .send({ nom: 'Hack User', email: 'hack@optimum.com', password: 'hackpass123' });
    expect(res.status).toBe(201);
    expect(res.body.user.company).toBe('solumada'); // forcé par le serveur !
  });
});

// ═════════════════════════════════════════════
// 16. signToken — Payload JWT
// ═════════════════════════════════════════════
describe('signToken — payload JWT complet', () => {
  test('contient id, email, nom, role, theme, company', async () => {
    const user  = await createUser({ email: 'jwtcheck@test.com', company: 'optimum' });
    const token = signToken(user);
    const decoded = jwt.decode(token);

    expect(decoded.id).toBeDefined();
    expect(decoded.email).toBe('jwtcheck@test.com');
    expect(decoded.nom).toBeDefined();
    expect(decoded.role).toBe('admin');
    expect(decoded.company).toBe('optimum');
    expect(decoded.theme).toBe('optimum');
  });

  test('le token expire dans 7 jours', async () => {
    const user    = await createUser({ email: 'expiry@test.com' });
    const token   = signToken(user);
    const decoded = jwt.decode(token);
    const sevenDays = 7 * 24 * 60 * 60;
    const diff = decoded.exp - decoded.iat;
    expect(diff).toBe(sevenDays);
  });
});
