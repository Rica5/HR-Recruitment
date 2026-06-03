// Escapes a user-provided string so it can be safely used inside a MongoDB
// $regex query without being interpreted as a regex (prevents ReDoS / injection).
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
