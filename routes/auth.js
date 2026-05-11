const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { signToken, verifyToken } = require('../middleware/auth');
const { logAudit } = require('../services/audit');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email et mot de passe requis' });
    const user = await User.findOne({ email, actif: true });
    if (!user || !(await user.checkPassword(password)))
      return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
    user.lastLogin = new Date();
    await user.save();
    logAudit({ action: 'USER_LOGIN', entity_type: 'user', entity_id: user._id.toString(), entity_label: user.nom, user_email: user.email, details: { ip: req.ip } });
    res.json({ success: true, token: signToken(user), user: user.toSafe() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/auth/theme
router.patch('/theme', verifyToken, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user.id, { theme: req.body.theme }, { new: true }).select('-password');
    res.json({ success: true, user, token: signToken(user) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/setup — créer admin initial (une seule fois)
router.post('/setup', async (req, res) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) return res.status(403).json({ success: false, error: 'Setup déjà effectué' });
    const { nom, email, password } = req.body;
    const user = await User.create({ nom, email, password, role: 'admin' });
    res.status(201).json({ success: true, token: signToken(user), user: user.toSafe() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/auth/me — mettre à jour profil
router.patch('/me', verifyToken, async (req, res) => {
  try {
    const { nom, password } = req.body;
    const updates = {};
    if (nom) updates.nom = nom;
    if (password) {
      if (password.length < 6) return res.status(400).json({ success: false, error: 'Mot de passe trop court' });
      const bcrypt = require('bcryptjs');
      updates.password = await bcrypt.hash(password, 12);
    }
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    res.json({ success: true, user, token: signToken(user) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
