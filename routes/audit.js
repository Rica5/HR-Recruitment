const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { escapeRegex } = require('../utils/text');

// GET /api/audit?page=1&limit=50&action=&entity_type=&q=
router.get('/', async (req, res) => {
  try {
    const { action, entity_type, q } = req.query;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (action)      filter.action      = action;
    if (entity_type) filter.entity_type = entity_type;
    if (q) {
      const rx = escapeRegex(q);
      filter.$or = [
        { entity_label: { $regex: rx, $options: 'i' } },
        { user_email:   { $regex: rx, $options: 'i' } },
      ];
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ success: true, logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
