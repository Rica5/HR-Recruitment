'use strict';

// Batch state persisted across polls (cleared on reset or page unload)
let _batchState = null; // { offre_id, nb_top, items, pollTimer, startTime, results, wf4Triggered }

async function renderBatchCV() {
  const el = document.getElementById('page-content');
  if (!el) return;
  el.innerHTML = _batchState ? buildProgressView(_batchState) : buildFormView();
  if (_batchState) {
    startPolling();
  } else {
    await loadOffresForBatch();
  }
}

// ─── Form view ────────────────────────────────────────────────────────────────

function buildFormView() {
  const sizeLabel = t('batch.file_hint');
  return `
<div style="max-width:680px;margin:0 auto;padding:24px 0">

  <div class="card" style="margin-bottom:20px;overflow:hidden">
    <div style="background:linear-gradient(135deg,var(--grad-start) 0%,var(--grad-end) 100%);padding:28px">
      <div style="display:flex;align-items:center;gap:16px">
        <div style="width:52px;height:52px;background:rgba(255,255,255,.2);border-radius:var(--r-xl);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">📁</div>
        <div>
          <div style="font-size:18px;font-weight:800;color:white;margin-bottom:4px">${t('batch.title')}</div>
          <div style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.5">${t('msg.wf4_ranking_auto')}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-body" style="padding:28px">

      <div class="form-group" style="margin-bottom:22px">
        <label class="form-label" style="font-weight:700">${t('batch.offer_label')}</label>
        <select id="batch-offre-select" class="form-control">
          <option value="">${t('msg.loading_offers')}</option>
        </select>
      </div>

      <div class="form-group" style="margin-bottom:22px">
        <label class="form-label" style="font-weight:700">
          ${t('batch.files_label')}
          <span style="color:var(--text-3);font-weight:400;font-size:12px;margin-left:6px">${sizeLabel}</span>
        </label>
        <label id="batch-dropzone" for="batch-file-input"
          style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:32px 20px;border:2px dashed var(--border);border-radius:var(--r-xl);cursor:pointer;transition:var(--transition);background:var(--surface-2)"
          ondragover="event.preventDefault();this.style.borderColor='var(--accent)';this.style.background='var(--accent-soft)'"
          ondragleave="this.style.borderColor='var(--border)';this.style.background='var(--surface-2)'"
          ondrop="handleBatchDrop(event)">
          <div style="font-size:36px">📂</div>
          <div style="font-size:14px;font-weight:600;color:var(--text)">${t('msg.drag_drop')}</div>
          <div style="font-size:12px;color:var(--text-3)">${t('msg.or_browse')}</div>
          <input type="file" id="batch-file-input" multiple accept=".pdf,.doc,.docx" style="display:none" onchange="updateBatchFilePreview()">
        </label>
      </div>

      <div id="batch-file-preview" style="display:none;margin-bottom:22px;max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface-2)"></div>

      <div class="form-group" style="margin-bottom:28px">
        <label class="form-label" style="font-weight:700">${t('batch.nb_top_label')}</label>
        <div style="display:flex;align-items:center;gap:14px">
          <input type="number" id="batch-nb-top" value="20" min="1" max="200" class="form-control"
            style="width:120px;text-align:center;font-size:22px;font-weight:800">
          <div style="font-size:12px;color:var(--text-3);line-height:1.5">
            ${t('msg.nb_top_hint')}<br>
            <span id="batch-nb-top-hint" style="color:var(--accent-mid)"></span>
          </div>
        </div>
      </div>

      <button class="btn btn-primary" style="width:100%;padding:14px;font-size:15px" onclick="submitBatchImport(this)">
        ${t('batch.launch_btn')}
      </button>

    </div>
  </div>
</div>`;
}

async function loadOffresForBatch() {
  const r = await api.get('/api/offres');
  const sel = document.getElementById('batch-offre-select');
  if (!sel || !r?.offres) return;
  sel.innerHTML = `<option value="">${t('msg.choose_offer')}</option>` +
    r.offres.map(o => `<option value="${o.offre_id}">${o.titre_poste} — ${offerStatusBadge(o.statut).replace(/<[^>]+>/g, '')}</option>`).join('');
}

function handleBatchDrop(event) {
  event.preventDefault();
  const dz = document.getElementById('batch-dropzone');
  if (dz) { dz.style.borderColor = 'var(--border)'; dz.style.background = 'var(--surface-2)'; }
  const input = document.getElementById('batch-file-input');
  if (!input || !event.dataTransfer?.files) return;
  const dt = new DataTransfer();
  Array.from(event.dataTransfer.files)
    .filter(f => /\.(pdf|docx?)$/i.test(f.name))
    .forEach(f => dt.items.add(f));
  input.files = dt.files;
  updateBatchFilePreview();
}

function updateBatchFilePreview() {
  const input   = document.getElementById('batch-file-input');
  const preview = document.getElementById('batch-file-preview');
  const nbTop   = document.getElementById('batch-nb-top');
  const hint    = document.getElementById('batch-nb-top-hint');

  if (!input?.files?.length) {
    if (preview) preview.style.display = 'none';
    return;
  }
  const files = Array.from(input.files);
  if (nbTop) nbTop.value = files.length;
  if (hint) hint.textContent = tf('msg.nb_top_updated', files.length);

  const sizeUnit = t('batch.size_unit');
  if (preview) {
    preview.style.display = 'block';
    preview.innerHTML = files.map((f, i) =>
      `<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;font-size:12px;${i > 0 ? 'border-top:1px solid var(--border)' : ''}">
        <span>📄</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)">${f.name}</span>
        <span style="color:var(--text-3);flex-shrink:0">${(f.size / 1024).toFixed(0)} ${sizeUnit}</span>
      </div>`
    ).join('');
  }
}

async function submitBatchImport(btn) {
  const offre_id = document.getElementById('batch-offre-select')?.value;
  const nb_top   = parseInt(document.getElementById('batch-nb-top')?.value, 10) || 20;
  const input    = document.getElementById('batch-file-input');

  if (!offre_id) { toast(t('toast.select_offer_first'), 'error'); return; }
  if (!input?.files?.length) { toast(t('toast.add_cv_first'), 'error'); return; }

  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('batch.sending');

  const fd = new FormData();
  fd.append('offre_id', offre_id);
  Array.from(input.files).forEach(f => fd.append('cvs', f));

  try {
    const res = await fetch('/api/candidatures/batch-cv', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Auth.token()}` },
      body: fd,
    });
    const r = await res.json();

    if (r?.success) {
      _batchState = {
        offre_id,
        nb_top,
        items: r.created,
        pollTimer: null,
        startTime: Date.now(),
        results: {},
        wf4Triggered: false,
      };
      renderBatchCV();
    } else {
      toast(r?.error || t('toast.import_error'), 'error');
      btn.disabled = false;
      btn.textContent = origText;
    }
  } catch (e) {
    toast(t('toast.network_error'), 'error');
    btn.disabled = false;
    btn.textContent = origText;
  }
}

// ─── Progress view ────────────────────────────────────────────────────────────

function buildProgressView(state) {
  const total = state.items.length;
  const done  = state.items.filter(i => state.results[i.id]?.score != null).length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  const rows = state.items.map(item => {
    const c = state.results[item.id];
    return `<tr id="batch-row-${item.id}" style="border-bottom:1px solid var(--border)">
      <td style="padding:10px 14px;font-size:12px;color:var(--text-3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${item.filename}">${item.filename}</td>
      <td style="padding:10px 14px" id="batch-status-${item.id}">${renderBatchRowStatus(c)}</td>
      <td style="padding:10px 14px;font-size:13px;color:var(--text)" id="batch-nom-${item.id}">${c && c.candidat_nom !== 'Extraction en cours…' ? c.candidat_nom : '—'}</td>
      <td style="padding:10px 14px;font-size:12px;color:var(--text-3)" id="batch-email-${item.id}">${c && c.candidat_nom !== 'Extraction en cours…' ? (c.candidat_email || '—') : '—'}</td>
      <td style="padding:10px 14px;font-size:13px;font-weight:700;color:var(--text)" id="batch-score-${item.id}">${c?.score != null ? c.score + '/10' : '—'}</td>
      <td style="padding:10px 14px" id="batch-reco-${item.id}">${c?.score != null && c.recommandation ? renderBadge(c.recommandation) : '—'}</td>
    </tr>`;
  }).join('');

  const thStyle = 'padding:10px 14px;font-size:11px;font-weight:700;color:var(--text-3);text-align:left;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap';

  return `
<div style="max-width:1000px;margin:0 auto;padding:24px 0">

  <div class="card" style="margin-bottom:16px">
    <div class="card-body" style="padding:20px 24px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px">
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--text)">
            ${t('batch.progress_header')} —
            <span id="batch-progress-text">${tf('msg.analyzed_of', done, total)}</span>
          </div>
          <div style="font-size:12px;color:var(--text-3);margin-top:3px">${tf('batch.offer_info', state.offre_id, state.nb_top)}</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="resetBatch()">${t('batch.new_batch_btn')}</button>
      </div>

      <div style="height:10px;background:var(--surface-3);border-radius:5px;overflow:hidden;margin-bottom:16px">
        <div id="batch-progress-bar" style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--grad-start),var(--grad-end));border-radius:5px;transition:width .4s ease"></div>
      </div>

      <div id="batch-wf4-banner" style="display:none;padding:14px 18px;background:linear-gradient(135deg,var(--grad-start),var(--grad-end));border-radius:var(--r-lg);color:white;font-size:14px;font-weight:600;align-items:center;gap:10px"></div>
    </div>
  </div>

  <div class="card">
    <div class="table-wrap">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface-2);border-bottom:2px solid var(--border)">
            <th style="${thStyle}">${t('table.file')}</th>
            <th style="${thStyle}">${t('table.status')}</th>
            <th style="${thStyle}">${t('table.extracted_name')}</th>
            <th style="${thStyle}">${t('table.email')}</th>
            <th style="${thStyle}">${t('table.score')}</th>
            <th style="${thStyle}">${t('table.recommendation')}</th>
          </tr>
        </thead>
        <tbody id="batch-table-body">${rows}</tbody>
      </table>
    </div>
  </div>

</div>`;
}

function renderBatchRowStatus(c) {
  // 'Extraction en cours…' is a DB placeholder value — keep comparison in French
  if (!c || c.candidat_nom === 'Extraction en cours…') {
    return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:3px 8px;background:#fef3c7;color:#92400e;border-radius:20px;font-weight:600">${t('batch.status.extracting')}</span>`;
  }
  if (c.score == null) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:3px 8px;background:#dbeafe;color:#1e40af;border-radius:20px;font-weight:600">${t('batch.status.analyzing')}</span>`;
  }
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:3px 8px;background:#dcfce7;color:#15803d;border-radius:20px;font-weight:600">${tf('batch.status.done', c.score)}</span>`;
}

// ─── Polling ─────────────────────────────────────────────────────────────────

function startPolling() {
  pollBatchStatus();
  if (_batchState) _batchState.pollTimer = setInterval(pollBatchStatus, 4000);
}

async function pollBatchStatus() {
  if (!_batchState) return;
  if (Date.now() - _batchState.startTime > 300000) { stopPolling(); return; }

  const ids = _batchState.items.map(i => i.id).join(',');
  const r = await api.get(`/api/candidatures/batch-status?ids=${ids}`);
  if (!r?.success) return;

  r.candidatures.forEach(c => { _batchState.results[c._id] = c; });
  updateProgressUI();

  const allDone = _batchState.items.every(i => _batchState.results[i.id]?.score != null);
  if (allDone) {
    stopPolling();
    if (!_batchState.wf4Triggered) {
      _batchState.wf4Triggered = true;
      triggerAutoWF4();
    }
  }
}

function updateProgressUI() {
  if (!_batchState) return;

  const total = _batchState.items.length;
  const done  = _batchState.items.filter(i => _batchState.results[i.id]?.score != null).length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  const progressText = document.getElementById('batch-progress-text');
  if (progressText) progressText.textContent = tf('msg.analyzed_of', done, total);

  const progressBar = document.getElementById('batch-progress-bar');
  if (progressBar) progressBar.style.width = pct + '%';

  for (const item of _batchState.items) {
    const c = _batchState.results[item.id];
    if (!c) continue;

    const statusEl = document.getElementById(`batch-status-${item.id}`);
    if (statusEl) statusEl.innerHTML = renderBatchRowStatus(c);

    const isPlaceholder = c.candidat_nom === 'Extraction en cours…';

    if (!isPlaceholder) {
      const nomEl = document.getElementById(`batch-nom-${item.id}`);
      if (nomEl) nomEl.textContent = c.candidat_nom || '—';

      const emailEl = document.getElementById(`batch-email-${item.id}`);
      if (emailEl) emailEl.textContent = c.candidat_email || '—';
    }

    if (c.score != null) {
      const scoreEl = document.getElementById(`batch-score-${item.id}`);
      if (scoreEl) scoreEl.textContent = c.score + '/10';

      const recoEl = document.getElementById(`batch-reco-${item.id}`);
      if (recoEl && c.recommandation) recoEl.innerHTML = renderBadge(c.recommandation);
    }
  }
}

async function triggerAutoWF4() {
  const r = await api.post(`/api/offres/${_batchState.offre_id}/evaluer-candidats`, {
    nb_top: _batchState.nb_top,
  });

  const banner = document.getElementById('batch-wf4-banner');
  if (banner) {
    banner.style.display = 'flex';
    if (r?.success) {
      banner.innerHTML = `
        <span>${tf('msg.ranking_in_progress', _batchState.nb_top)}</span>
        <button onclick="navigate('offres')" style="margin-left:auto;flex-shrink:0;background:rgba(255,255,255,.25);border:none;color:white;padding:6px 16px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:700">${t('batch.view_offer')}</button>`;
      toast(tf('toast.wf4_launched', _batchState.nb_top), 'success');
    } else {
      banner.style.background = 'var(--surface-3)';
      banner.style.border = '1px solid var(--border)';
      banner.style.color = 'var(--text)';
      banner.innerHTML = `⚠️ ${tf('msg.wf4_error', r?.error || t('msg.unknown_error'))}`;
      toast(t('toast.wf4_not_triggered'), 'error');
    }
  }
}

function stopPolling() {
  if (_batchState?.pollTimer) {
    clearInterval(_batchState.pollTimer);
    _batchState.pollTimer = null;
  }
}

function resetBatch() {
  stopPolling();
  _batchState = null;
  renderBatchCV();
}
