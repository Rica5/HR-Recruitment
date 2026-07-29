const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  action:       { type: String, required: true },
  entity_type:  { type: String, default: '' },
  entity_id:    { type: String, default: '' },
  entity_label: { type: String, default: '' },
  user_email:   { type: String, default: '' },
  details:      { type: mongoose.Schema.Types.Mixed, default: {} },
  created_at:   { type: Date, default: Date.now },
}, { versionKey: false });

// Compound indexes for filtered + sorted queries
AuditLogSchema.index({ action: 1,      created_at: -1 });
AuditLogSchema.index({ entity_type: 1, created_at: -1 });
AuditLogSchema.index({ user_email: 1,  created_at: -1 });
AuditLogSchema.index({ created_at: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
