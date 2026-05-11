const express = require('express');
const router = express.Router();
const axios = require('axios');

const N8N_BASE    = process.env.N8N_BASE_URL    || 'https://optimumdev.app.n8n.cloud';
const N8N_KEY     = process.env.N8N_API_KEY     || '';
const N8N_WH_URL  = process.env.N8N_WEBHOOK_URL || 'https://optimumdev.app.n8n.cloud/webhook/candidature-reception';
const WF2_ID      = process.env.N8N_WF2_ID      || '4LmZn4gtORYnL1mP';

const headers = () => ({ 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' });

// GET /api/n8n/workflows — statut WF2
router.get('/workflows', async (req, res) => {
  try {
    const r = await axios.get(`${N8N_BASE}/api/v1/workflows/${WF2_ID}`, { headers: headers() });
    res.json({ success: true, workflows: [{ key: 'wf2', id: WF2_ID, name: r.data.name, active: r.data.active }] });
  } catch (err) {
    res.json({ success: true, workflows: [{ key: 'wf2', id: WF2_ID, error: err.message }] });
  }
});

// GET /api/n8n/executions/:wfId — exécutions récentes
router.get('/executions/:wfId', async (req, res) => {
  try {
    const r = await axios.get(`${N8N_BASE}/api/v1/executions?workflowId=${req.params.wfId}&limit=10`, { headers: headers() });
    res.json({ success: true, executions: r.data.data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/n8n/trigger/wf2 — déclencher WF2 via webhook
router.post('/trigger/wf2', async (req, res) => {
  try {
    const r = await axios.post(N8N_WH_URL, req.body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    res.json({ success: true, status: r.status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/n8n/links
router.get('/links', (req, res) => {
  res.json({
    success: true,
    links: {
      dashboard: N8N_BASE,
      wf2: `${N8N_BASE}/workflow/${WF2_ID}`,
    }
  });
});

module.exports = router;
