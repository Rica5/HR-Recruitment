const AuditLog = require('../models/AuditLog');

function logAudit({ action, entity_type = '', entity_id = '', entity_label = '', user_email = '', details = {} }) {
  AuditLog.create({ action, entity_type, entity_id, entity_label, user_email, details })
    .catch(err => console.warn('[AUDIT] Erreur log:', err.message));
}

module.exports = { logAudit };
