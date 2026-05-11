async function renderN8n() {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner" style="width:28px;height:28px"></div></div>`;

  const workflowsResponse = await api.get('/api/n8n/workflows');
  const workflows = workflowsResponse?.workflows || [];
  const wf2Data = workflows.find(w => w.key === 'wf2');

  el.innerHTML = `

  <!-- Architecture -->
  <div class="card" style="margin-bottom:20px;border-left:4px solid var(--accent)">
    <div class="card-header"><span class="card-title">⚡ Architecture actuelle</span></div>
    <div class="card-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div style="background:var(--surface-2);border-radius:var(--r);padding:16px">
          <div style="font-size:12px;font-weight:700;color:var(--accent-mid);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Application Node.js</div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
            <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0"></span>Formulaire création offre</div>
            <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0"></span>Enregistrement MongoDB</div>
            <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0"></span>Email lien offre → recruteur</div>
            <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0"></span>Formulaire candidature</div>
            <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0"></span>Upload CV + lettre</div>
            <div style="display:flex;align-items:center;gap:8px;color:var(--accent-mid);font-weight:600"><span style="font-size:16px">→</span>Déclenche WF2 via Webhook</div>
          </div>
        </div>
        <div style="background:var(--surface-2);border-radius:var(--r);padding:16px">
          <div style="font-size:12px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">n8n WF2 (Webhook)</div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
            <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:#7c3aed;flex-shrink:0"></span>Reçoit CV + lettre (base64)</div>
            <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:#7c3aed;flex-shrink:0"></span>Analyse Claude IA (score /10)</div>
            <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:#7c3aed;flex-shrink:0"></span>Met à jour MongoDB (PATCH)</div>
            <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:#7c3aed;flex-shrink:0"></span>Email accusé → candidat</div>
            <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:#7c3aed;flex-shrink:0"></span>Email résultat → recruteur</div>
            <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:#7c3aed;flex-shrink:0"></span>Relances agenda (48h + 24h)</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- WF2 status -->
  <div class="card" style="margin-bottom:20px">
    <div class="card-header">
      <span class="card-title">WF2 — Analyse IA Candidature (Webhook)</span>
      <a href="https://optimumdev.app.n8n.cloud/workflow/4LmZn4gtORYnL1mP" target="_blank" class="btn btn-secondary btn-sm">Ouvrir dans n8n ↗</a>
    </div>
    <div class="card-body">
      <div style="display:flex;align-items:center;gap:16px;padding:14px;background:var(--surface-2);border-radius:var(--r)">
        <div style="width:12px;height:12px;border-radius:50%;flex-shrink:0;background:${wf2Data?.active ? '#22c55e' : '#94a3b8'};${wf2Data?.active ? 'box-shadow:0 0 0 3px rgba(34,197,94,.2)' : ''}"></div>
        <div>
          <div style="font-weight:600;font-size:14px">${wf2Data?.error ? '⚠️ Erreur de connexion' : wf2Data?.active ? 'Actif — En attente de candidatures' : 'Inactif'}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px">
            URL Webhook : <code style="background:var(--surface);padding:1px 6px;border-radius:4px;font-size:11px">https://optimumdev.app.n8n.cloud/webhook/candidature-reception</code>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Webhook test -->
  <div class="card" style="margin-bottom:20px">
    <div class="card-header">
      <span class="card-title">🧪 Tester le webhook</span>
      <span class="badge badge-amber">Données de test</span>
    </div>
    <div class="card-body">
      <p style="font-size:13px;color:var(--text-2);margin-bottom:16px">
        Envoie une candidature de test à n8n pour vérifier que le webhook fonctionne correctement.
        Sélectionnez d'abord une offre existante.
      </p>
      <div class="form-group">
        <label class="form-label">Offre de test</label>
        <select class="form-control" id="test-offre-id" style="max-width:400px">
          <option value="">Chargement...</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Email candidat test</label>
        <input class="form-control" id="test-email" value="test@example.com" style="max-width:300px">
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-primary" id="btn-test-wh" onclick="testWebhook()">🚀 Envoyer test</button>
        <span id="test-result" style="font-size:13px;color:var(--text-3)"></span>
      </div>
    </div>
  </div>

  <!-- Recent executions -->
  <div class="card">
    <div class="card-header">
      <span class="card-title">Exécutions récentes — WF2</span>
      <button class="btn btn-ghost btn-sm" onclick="loadExecutions()">↻ Actualiser</button>
    </div>
    <div class="card-body" id="execs-list">
      <div style="text-align:center"><div class="spinner"></div></div>
    </div>
  </div>`;

  // Load offers for the test selector
  const offersResponse = await api.get('/api/offres');
  const sel = document.getElementById('test-offre-id');
  if (offersResponse?.offres?.length) {
    sel.innerHTML = offersResponse.offres.map(o => `<option value="${o.offre_id}">${o.titre_poste}</option>`).join('');
  } else {
    sel.innerHTML = '<option value="">Aucune offre disponible</option>';
  }

  loadExecutions();
}

async function loadExecutions() {
  const el = document.getElementById('execs-list');
  if (!el) return;
  const WF2_ID = '4LmZn4gtORYnL1mP';
  const response = await api.get(`/api/n8n/executions/${WF2_ID}`);
  const executions = response?.executions || [];
  if (!executions.length) {
    el.innerHTML = `<div style="text-align:center;font-size:13px;color:var(--text-3);padding:16px">Aucune exécution récente</div>`;
    return;
  }
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">
    ${executions.slice(0, 10).map(e => {
      const status = e.status || (e.finished ? 'success' : 'running');
      const colors = { success: '#22c55e', error: '#ef4444', running: '#f59e0b', waiting: '#94a3b8' };
      const icons  = { success: '✅', error: '❌', running: '⏳', waiting: '⏸️' };
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface-2);border-radius:var(--r);font-size:13px">
        <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${colors[status]||'#94a3b8'}"></div>
        <span style="font-weight:600">${icons[status]||'—'} ${status}</span>
        <span style="color:var(--text-3);margin-left:auto">${timeAgo(e.startedAt||e.createdAt)}</span>
        ${e.id ? `<span style="font-family:var(--mono);font-size:11px;color:var(--text-3)">#${e.id.slice(-8)}</span>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

async function testWebhook() {
  const btn = document.getElementById('btn-test-wh');
  const resultEl = document.getElementById('test-result');
  const offerId = document.getElementById('test-offre-id').value;
  const email = document.getElementById('test-email').value;

  if (!offerId) { toast('Sélectionnez une offre', 'error'); return; }

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-top-color:#fff"></div> Envoi...';
  resultEl.textContent = '';

  const r = await api.post('/api/n8n/trigger/wf2', {
    candidature_id:   'test-' + Date.now(),
    offre_id:         offerId,
    candidat_nom:     'Candidat Test',
    candidat_email:   email,
    titre_poste:      'Poste Test',
    description_poste:'Test depuis l\'app',
    competences_requises: 'Test',
    type_contrat:     'CDI',
    localisation:     'Antananarivo',
    email_recruteur:  Auth.user()?.email || 'test@test.com',
    cv_base64:        '',
    lettre_base64:    '',
  });

  btn.disabled = false;
  btn.innerHTML = '🚀 Envoyer test';

  if (r?.success) {
    toast('Webhook envoyé !', 'success');
    resultEl.textContent = '✅ WF2 déclenché';
    setTimeout(loadExecutions, 2000);
  } else {
    toast(r?.error || 'Erreur', 'error');
    resultEl.textContent = `❌ ${r?.error || 'Erreur'}`;
  }
}
