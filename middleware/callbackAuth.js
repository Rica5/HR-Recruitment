// Verifies the shared secret on n8n → app callbacks.
// SECURITY: if N8N_CALLBACK_SECRET is not configured server-side, ALL callbacks
// are rejected (fail-closed) instead of being accepted blindly.
function verifyCallbackSecret(req, res, next) {
  const expected = process.env.N8N_CALLBACK_SECRET;
  const provided = req.headers['x-callback-secret'];

  if (!expected) {
    console.error('[CALLBACK] N8N_CALLBACK_SECRET not configured — rejecting callback');
    return res.status(503).json({ success: false, error: 'Callback authentication not configured' });
  }
  if (provided !== expected) {
    console.warn(`[CALLBACK] Invalid secret from ${req.ip}`);
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

module.exports = { verifyCallbackSecret };
