const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  action:       { type: String, required: true, index: true },
  entity_type:  { type: String, default: '' },
  entity_id:    { type: String, default: '' },
  entity_label: { type: String, default: '' },
  user_email:   { type: String, default: '' },
  details:      { type: mongoose.Schema.Types.Mixed, default: {} },
  created_at:   { type: Date, default: Date.now, index: true },
}, { versionKey: false });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
