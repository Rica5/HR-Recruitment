const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const User     = require('../models/User');
const { signToken } = require('../middleware/auth');
const { logAudit }  = require('../services/audit');
const { sendCredentialsEmail } = require('../services/email');
const { be } = require('../middleware/i18n');

// GET /api/users — list all users (cross-company for admin management)
router.get('/', async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ company: 1, createdAt: 1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users — create a user within the current admin's company
router.post('/', async (req, res) => {
  try {
    const { nom, email, password } = req.body;
    if (!nom || !email || !password)
      return res.status(400).json({ success: false, error: be(req, 'Nom, email et mot de passe requis', 'Name, email and password required') });
    if (password.length < 6)
      return res.status(400).json({ success: false, error: be(req, 'Mot de passe : 6 caractères minimum', 'Password: minimum 6 characters') });

    // Company is always the admin's own — never trust req.body.company
    const company = req.user.company;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(409).json({ success: false, error: be(req, 'Cet email est déjà utilisé', 'This email is already in use') });

    const user = await User.create({
      nom,
      email,
      password,
      role: 'admin',
      company,
    });

    logAudit({ action: 'USER_CREE', entity_type: 'user', entity_id: user._id.toString(), entity_label: user.nom, user_email: req.user.email, details: { company: user.company } });
    sendCredentialsEmail({
      nom: user.nom,
      email: user.email,
      password,
      loginUrl: `${process.env.BASE_URL}/login`,
      company: user.company,
    }).catch(err => {
      console.error('[EMAIL] Credentials send failed:', err.response?.data || err.message);
      logAudit({ action: 'EMAIL_ECHEC', entity_type: 'user', entity_id: user._id.toString(), entity_label: user.nom, user_email: req.user.email, details: { type: 'sendCredentialsEmail', error: err.response?.data?.error || err.message } });
    });
    res.status(201).json({ success: true, user: user.toSafe() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/users/:id — update any user (company can be changed)
router.patch('/:id', async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target)
      return res.status(404).json({ success: false, error: be(req, 'Utilisateur introuvable', 'User not found') });

    const { nom, email, password, company } = req.body;
    if (nom)     target.nom   = nom;
    if (email)   target.email = email.toLowerCase();
    if (company && ['solumada', 'optimum'].includes(company)) target.company = company;
    if (password) {
      if (password.length < 6)
        return res.status(400).json({ success: false, error: be(req, 'Mot de passe : 6 caractères minimum', 'Password: minimum 6 characters') });
      target.password = password;
    }

    await target.save();
    logAudit({ action: 'USER_MODIFIE', entity_type: 'user', entity_id: target._id.toString(), entity_label: target.nom, user_email: req.user.email, details: { company: target.company } });
    res.json({ success: true, user: target.toSafe() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/users/:id/toggle-actif — activate or deactivate (cannot self-deactivate)
router.patch('/:id/toggle-actif', async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ success: false, error: be(req, 'Impossible de désactiver votre propre compte', 'Cannot deactivate your own account') });

    const target = await User.findById(req.params.id);
    if (!target)
      return res.status(404).json({ success: false, error: be(req, 'Utilisateur introuvable', 'User not found') });

    target.actif = !target.actif;
    await target.save();
    logAudit({ action: target.actif ? 'USER_ACTIVE' : 'USER_DESACTIVE', entity_type: 'user', entity_id: target._id.toString(), entity_label: target.nom, user_email: req.user.email });
    res.json({ success: true, user: target.toSafe() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
