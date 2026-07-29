/**
 * Rate limiter simple en mémoire (sans dépendance externe).
 * Pour une production à fort trafic, remplacer par redis + express-rate-limit.
 */
function createRateLimiter({ windowMs = 60000, max = 10, message = 'Trop de requêtes, réessayez plus tard.' } = {}) {
  const store = new Map();

  // Nettoyage périodique pour éviter les fuites mémoire
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, times] of store) {
      const fresh = times.filter(t => t > cutoff);
      if (!fresh.length) store.delete(key);
      else store.set(key, fresh);
    }
  }, 5 * 60 * 1000);

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const times = (store.get(ip) || []).filter(t => t > now - windowMs);
    if (times.length >= max) {
      return res.status(429).json({ success: false, error: message });
    }
    times.push(now);
    store.set(ip, times);
    next();
  };
}

module.exports = { createRateLimiter };
