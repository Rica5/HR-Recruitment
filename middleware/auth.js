const jwt = require('jsonwebtoken');
const User = require('../models/User');

const SECRET = process.env.JWT_SECRET || 'dev_secret';

function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

function signToken(user) {
  return jwt.sign({ id: user._id, email: user.email, nom: user.nom, role: user.role, theme: user.theme, company: user.company }, SECRET, { expiresIn: '7d' });
}

module.exports = { verifyToken, signToken };
