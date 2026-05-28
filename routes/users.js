const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const User     = require('../models/User');
const { signToken } = require('../middleware/auth');
const { logAudit }  = require('../services/audit');
const { sendCredentialsEmail } = require('../services/email');

// GET /api/users — list all users (universal)
router.get('/', async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ company: 1, createdAt: 1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users — create a user (any company)
router.post('/', async (req, res) => {
  try {
    const { nom, email, password, company } = req.body;
    if (!nom || !email || !password)
      return res.status(400).json({ success: false, error: 'Nom, email et mot de passe requis' });
    if (password.length < 6)
      return res.status(400).json({ success: false, error: 'Mot de passe : 6 caractères minimum' });
    if (!company || !['solumada', 'optimum'].includes(company))
      return res.status(400).json({ success: false, error: "Société invalide : 'solumada' ou 'optimum'" });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(409).json({ success: false, error: 'Cet email est déjà utilisé' });

    const user = await User.create({
      nom,
      email,
      password,
      role: 'admin',
      company,
    });

    logAudit({ action: 'USER_CREE', entity_type: 'user', entity_id: user._id.toString(), entity_label: user.nom, user_email: req.user.email, details: { company: user.company } });
    const COMPANY_NAMES = { solumada: 'Solumada', optimum: 'Optimum Solutions' };
    sendCredentialsEmail({
      nom: user.nom,
      email: user.email,
      password,
      loginUrl: `${process.env.BASE_URL}/login`,
      companyName: COMPANY_NAMES[user.company] || user.company,
    }).catch(err => console.error('[EMAIL] Credentials send failed:', err.message));
    res.status(201).json({ success: true, user: user.toSafe() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/users/:id — update user (universal)
router.patch('/:id', async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target)
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });

    const { nom, email, password, company } = req.body;
    if (nom)     target.nom     = nom;
    if (email)   target.email   = email.toLowerCase();
    if (company && ['solumada', 'optimum'].includes(company)) target.company = company;
    if (password) {
      if (password.length < 6)
        return res.status(400).json({ success: false, error: 'Mot de passe : 6 caractères minimum' });
      target.password = password; // pre-save hook hashes it
    }

    await target.save();
    logAudit({ action: 'USER_MODIFIE', entity_type: 'user', entity_id: target._id.toString(), entity_label: target.nom, user_email: req.user.email });
    res.json({ success: true, user: target.toSafe() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/users/:id/toggle-actif — activate or deactivate (cannot self-deactivate)
router.patch('/:id/toggle-actif', async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ success: false, error: 'Impossible de désactiver votre propre compte' });

    const target = await User.findById(req.params.id);
    if (!target)
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });

    target.actif = !target.actif;
    await target.save();
    logAudit({ action: target.actif ? 'USER_ACTIVE' : 'USER_DESACTIVE', entity_type: 'user', entity_id: target._id.toString(), entity_label: target.nom, user_email: req.user.email });
    res.json({ success: true, user: target.toSafe() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
