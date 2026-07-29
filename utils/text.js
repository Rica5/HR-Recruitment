// Escapes a user-provided string so it can be safely used inside a MongoDB
// $regex query without being interpreted as a regex (prevents ReDoS / injection).
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// email_recruteur holds one or more comma-separated addresses (e.g. "rh1@x.com, rh2@x.com").
function parseEmailList(str) {
  if (!str) return [];
  return String(str).split(',').map(s => s.trim()).filter(Boolean);
}

function isValidEmail(str) {
  return EMAIL_RE.test(str);
}

module.exports = { escapeRegex, parseEmailList, isValidEmail };
