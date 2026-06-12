let _applications = [], _jobOffersMap = {};
let _pollTimer    = null;
let _currentPage  = 1;
let _filteredList = [];
const PAGE_SIZE   = 30;
let _pendingNewApplicationOfferId = null;
let _filterQ = '', _filterReco = '', _filterOffre = '', _filterCanal = '', _filterScore = ''; // pre-selection from the Offers page

// Cal.com RDV scheduling state
let _rdvCalcomCandidatureId = null;
let _rdvCalcomOffreId       = null;
let _rdvCalcomSelectedSlot  = null; // { iso: '2025-05-15T09:00:00Z', heure: '09:00', date: '2025-05-15' }
let _calcomSlotsByDate      = {};   // { "2025-05-15": [{time}], … }
let _rdvCalcomTypeRdv       = '';   // '' | 'visio' | 'presentiel'

// ── Main load ──
async function renderApplications() {
  stopPolling();
  const el = document.getElementById('page-content');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner" style="width:28px;height:28px"></div></div>`;
  const [applicationsResponse, offersResponse] = await Promise.all([api.get('/api/candidatures?limit=500'), api.get('/api/offres')]);
  _applications = applicationsResponse?.candidatures || [];
  _jobOffersMap = {};
  (offersResponse?.offres || []).forEach(o => { _jobOffersMap[o.offre_id] = o; });
  drawApplicationsList(_applications, offersResponse?.offres || []);
  startPollingIfNeeded();
}

// ── Page HTML structure ──
function drawApplicationsList(applications, jobOffers) {
  const el = document.getElementById('page-content');
  const toCallCount = applications.filter(c => c.a_appeler && !c.rdv_pris && !c.non_interesse).length;
  el.innerHTML = `
  <div class="filters-bar">
    <input class="filter-input" id="q-cands" placeholder="${t('filter.search_placeholder')}" oninput="debouncedFilterApplications()">
    <select class="filter-select" id="f-reco" onchange="filterApplications()">
      <option value="">${t('filter.all_recommendations')}</option>
      <option value="QUALIFIE">${t('reco.qualified')}</option>
      <option value="A_REVOIR">${t('reco.to_review')}</option>
      <option value="NON_SELECTIONNE">${t('reco.rejected')}</option>
    </select>
    <select class="filter-select" id="f-offre" onchange="filterApplications()">
      <option value="">${t('filter.all_offers')}</option>
      ${jobOffers.map(o=>`<option value="${o.offre_id}">${o.titre_poste}</option>`).join('')}
    </select>
    <select class="filter-select" id="f-canal" onchange="filterApplications()">
      <option value="">${t('filter.all_channels')}</option>
      <option value="plateforme">${t('channel.platform')}</option>
      <option value="telephone">${t('channel.phone')}</option>
      <option value="physique">${t('channel.physical')}</option>
      <option value="email">${t('channel.email')}</option>
    </select>
    <select class="filter-select" id="f-score" onchange="filterApplications()">
      <option value="">${t('filter.all_scores')}</option>
      <option value="high">${t('filter.score_high')}</option>
      <option value="mid">${t('filter.score_mid')}</option>
      <option value="low">${t('filter.score_low')}</option>
    </select>
    ${toCallCount > 0 ? `<button class="btn btn-sm" style="background:#fef3c7;color:#854d0e;border:1.5px solid #fde68a;font-weight:700;white-space:nowrap" onclick="toggleCallFilter()" id="btn-appeler">${t('btn.to_call')} (${toCallCount})</button>` : ''}
    <button class="btn btn-sm" style="background:#fdf4ff;color:#7c3aed;border:1.5px solid #e9d5ff;font-weight:700;white-space:nowrap" onclick="togglePotentielsFilter()" id="btn-potentiels">${t('btn.potentials')}</button>
    <button class="btn btn-secondary btn-sm" onclick="exportCSV()">${t('btn.export_csv')}</button>
    <button class="btn btn-primary btn-sm" onclick="openNewApplication()">${t('btn.new_application')}</button>
  </div>
  <div class="card" style="overflow:hidden">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t('table.candidate')}</th>
            <th>${t('table.position')}</th>
            <th>${t('table.channel')}</th>
            <th>${t('table.ai_score')}</th>
            <th>${t('table.recommendation')}</th>
            <th>${t('table.tracking_status')}</th>
            <th>${t('table.date')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="cands-tbody"></tbody>
      </table>
    </div>
    <div id="cands-pagination"></div>
  </div>
  ${applicationModalHTML()}`;
  if (_filterQ)     { const e = document.getElementById('q-cands'); if (e) e.value = _filterQ; }
  if (_filterReco)  { const e = document.getElementById('f-reco');  if (e) e.value = _filterReco; }
  if (_filterOffre) { const e = document.getElementById('f-offre'); if (e) e.value = _filterOffre; }
  if (_filterCanal) { const e = document.getElementById('f-canal'); if (e) e.value = _filterCanal; }
  if (_filterScore) { const e = document.getElementById('f-score'); if (e) e.value = _filterScore; }
  if (_filterToCall)     { const b = document.getElementById('btn-appeler');  if (b) b.style.background = '#fde68a'; }
  if (_filterPotentiels) { const b = document.getElementById('btn-potentiels'); if (b) b.style.background = '#e9d5ff'; }
  filterApplications();
  if (window._pendingCandDetail) {
    const id = window._pendingCandDetail;
    window._pendingCandDetail = null;
    setTimeout(() => showApplicationDetail(id), 50);
  }
  if (_pendingNewApplicationOfferId) {
    const offerId = _pendingNewApplicationOfferId;
    _pendingNewApplicationOfferId = null;
    openNewApplication(offerId);
  }
}

let _filterToCall = false;
function toggleCallFilter() {
  _filterToCall = !_filterToCall;
  const btn = document.getElementById('btn-appeler');
  if (btn) btn.style.background = _filterToCall ? '#fde68a' : '#fef3c7';
  filterApplications();
}

let _filterPotentiels = false;
function togglePotentielsFilter() {
  _filterPotentiels = !_filterPotentiels;
  const btn = document.getElementById('btn-potentiels');
  if (btn) btn.style.background = _filterPotentiels ? '#e9d5ff' : '#fdf4ff';
  filterApplications();
}

// ── Filters ──
// Debounced version for the search box (avoids re-filtering on every keystroke)
const debouncedFilterApplications = debounce(() => filterApplications(), 250);

function filterApplications() {
  const q      = document.getElementById('q-cands')?.value.toLowerCase() || '';
  const reco   = document.getElementById('f-reco')?.value || '';
  const offre  = document.getElementById('f-offre')?.value || '';
  const channel = document.getElementById('f-canal')?.value || '';
  const score  = document.getElementById('f-score')?.value || '';
  _filterQ = q; _filterReco = reco; _filterOffre = offre; _filterCanal = channel; _filterScore = score;
  let results = _applications;
  if (q) results = results.filter(c => c.candidat_nom.toLowerCase().includes(q)
    || (c.candidat_email||'').toLowerCase().includes(q)
    || c.titre_poste.toLowerCase().includes(q));
  if (reco)    results = results.filter(c => c.recommandation === reco);
  if (offre)   results = results.filter(c => c.offre_id === offre);
  if (channel) results = results.filter(c => c.canal_candidature === channel);
  if (score === 'high') results = results.filter(c => c.score != null && c.score >= 7);
  else if (score === 'mid') results = results.filter(c => c.score != null && c.score >= 4 && c.score < 7);
  else if (score === 'low') results = results.filter(c => c.score != null && c.score < 4);
  if (_filterToCall) results = results.filter(c => c.a_appeler && !c.rdv_pris && !c.non_interesse);
  if (_filterPotentiels) results = results.filter(c => c.candidat_potentiel);
  _filteredList = results;
  _currentPage  = 1;
  renderPage();
}

// ── Page render ──
function renderPage() {
  const tbody = document.getElementById('cands-tbody');
  if (!tbody) return;

  const total = _filteredList.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  _currentPage = Math.min(_currentPage, pages);
  const start = (_currentPage - 1) * PAGE_SIZE;
  const slice = _filteredList.slice(start, start + PAGE_SIZE);

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">👤</div><p>${t('empty.no_applications')}</p></div></td></tr>`;
  } else {
    tbody.innerHTML = slice.map(c => `
      <tr onclick="showApplicationDetail('${c._id}')">
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="avatar" style="${avatarColor(c.recommandation)}">${initials(c.candidat_nom)}</div>
            <div>
              <div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:4px">
                ${c.candidat_nom}
                ${c.candidat_potentiel ? `<span class="badge" style="font-size:9px;padding:1px 5px;background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe">${t('badge.in_pool')}</span>` : ''}
                ${c.a_appeler && !c.rdv_pris && !c.non_interesse ? `<span class="badge badge-amber" style="font-size:9px;padding:1px 5px">${t('badge.to_call')}</span>` : ''}
              </div>
              <div style="font-size:11px;color:var(--text-3)">${c.candidat_email || (c.candidat_telephone ? '📞 '+c.candidat_telephone : '—')}</div>
            </div>
          </div>
        </td>
        <td style="font-size:13px;color:var(--text-2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.titre_poste}</td>
        <td>${channelBadge(c.canal_candidature)}</td>
        <td>${c.score === null && !c.recommandation ? renderPendingBadge(c._id) : renderScorePill(c.score)}</td>
        <td>${c.recommandation ? renderBadge(c.recommandation) : `<span class="badge badge-gray">${t('badge.pending')}</span>`}</td>
        <td>${applicationStatusBadge(c.statut)}</td>
        <td style="font-size:12px;color:var(--text-3);white-space:nowrap">${formatDate(c.date_candidature)}</td>
        <td>
          <div class="row-actions">
            ${c.cv_path     ? `<a href="${fileUrl(c.cv_path)}"     target="_blank" class="btn-icon" onclick="event.stopPropagation()" title="CV">📄</a>` : ''}
            ${c.lettre_path ? `<a href="${fileUrl(c.lettre_path)}" target="_blank" class="btn-icon" onclick="event.stopPropagation()" title="Lettre">📝</a>` : ''}
            ${((_jobOffersMap[c.offre_id]||{}).test_requis&&!['Test convoqué','Test passé'].includes(c.statut))?`<button class="btn-icon" style="color:#cbd5e1;cursor:not-allowed;font-weight:700" disabled title="${t('cand.decision.test_required_first')}">✓</button>`:`<button class="btn-icon" style="color:#16a34a;font-weight:700" onclick="event.stopPropagation();quickQualify('${c._id}','QUALIFIE',this)" title="${t('cand.decision.qualify')}">✓</button>`}
            <button class="btn-icon" style="color:#dc2626;font-weight:700" onclick="event.stopPropagation();quickQualify('${c._id}','NON_SELECTIONNE',this)" title="${t('cand.decision.eliminate')}">✗</button>
            <button class="btn-icon" onclick="event.stopPropagation();relaunchWorkflow('${c._id}')" title="${t('btn.relaunch_workflow')}">🔄</button>
            <button class="btn-icon" onclick="event.stopPropagation();if(confirm(t('msg.delete_application_confirm')||'Supprimer ?'))deleteApplication('${c._id}')" title="${t('btn.delete')}">🗑️</button>
          </div>
        </td>
      </tr>`).join('');
  }

  renderPagination(total, pages);
}

// ── Pagination ──
function renderPagination(total, pages) {
  const el = document.getElementById('cands-pagination');
  if (!el) return;
  if (pages <= 1) { el.innerHTML = ''; return; }
  const from = (_currentPage - 1) * PAGE_SIZE + 1;
  const to   = Math.min(_currentPage * PAGE_SIZE, total);
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;justify-content:center;padding:14px 0;border-top:1px solid var(--border-soft)">
      <button class="btn btn-secondary btn-sm" onclick="goPage(${_currentPage-1})" ${_currentPage===1?'disabled':''}>${t('pagination.prev')}</button>
      <span style="font-size:13px;color:var(--text-2)">${from}–${to} ${LANG==='en'?'of':'sur'} <strong>${total}</strong> <span style="color:var(--text-3);margin-left:6px">(${LANG==='en'?'page':'page'} ${_currentPage}/${pages})</span></span>
      <button class="btn btn-secondary btn-sm" onclick="goPage(${_currentPage+1})" ${_currentPage===pages?'disabled':''}>${t('pagination.next')}</button>
    </div>`;
}

function goPage(p) {
  _currentPage = p;
  renderPage();
  document.querySelector('.table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── "Analysis in progress" badge ──
function renderPendingBadge(id) {
  return `<span class="badge badge-gray" id="pending-${id}" style="display:inline-flex;align-items:center;gap:5px">
    <span style="width:7px;height:7px;border-radius:50%;background:#94a3b8;display:inline-block;animation:pulse 1.4s infinite"></span>
    ${t('cand.badge.pending')}
  </span>`;
}

// ── Polling ──
function startPollingIfNeeded() {
  stopPolling();
  const pending = _applications.filter(c => c.score === null && !c.recommandation);
  if (!pending.length) return;
  _pollTimer = setInterval(async () => {
    const stillPending = _applications.filter(c => c.score === null && !c.recommandation);
    if (!stillPending.length) { stopPolling(); return; }
    try {
      // One lightweight request for all pending ids
      const ids = stillPending.map(c => c._id).join(',');
      const r = await api.get(`/api/candidatures/batch-status?ids=${ids}`);
      if (!r?.success) return;
      const nowScored = (r.candidatures || []).filter(sc => sc.score !== null && sc.score !== undefined);
      if (!nowScored.length) return;
      // Refetch full objects only for the few that just got a score
      let updated = false;
      await Promise.all(nowScored.map(async sc => {
        const full = await api.get(`/api/candidatures/${sc._id}`);
        if (full?.candidature) {
          const idx = _applications.findIndex(x => x._id === sc._id);
          if (idx !== -1) { _applications[idx] = full.candidature; updated = true; }
        }
      }));
      if (updated) { filterApplications(); toast(t('toast.score_updated'), 'success'); }
    } catch { /* silent — will retry next tick */ }
  }, 5000);
}

function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

// ── Actions ──
async function deleteApplication(id) {
  const r = await api.delete(`/api/candidatures/${id}`);
  if (r?.success) { toast(t('toast.deleted'), 'success'); renderApplications(); loadCounts(); }
  else toast(r?.error || t('toast.error'), 'error');
}

function exportCSV() {
  const headers = ['Nom','Email','Téléphone','Canal','Poste','Score','Recommandation','Éducation','Expérience','Compétences détectées','Points forts','Points faibles','Date'];
  const rows = _applications.map(c => [
    c.candidat_nom, c.candidat_email, c.candidat_telephone, c.canal_candidature||'', c.titre_poste,
    c.score||'', c.recommandation||'', c.niveau_education||'', c.experience_annees||'',
    c.competences_detectees||'', c.points_forts||'', c.points_faibles||'', formatDate(c.date_candidature)
  ].map(v => `"${String(v).replace(/"/g,'""')}"`));
  const csv  = [headers.join(','), ...rows.map(r=>r.join(','))].join('\n');
  const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `candidatures_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast(t('toast.csv_downloaded'), 'success');
}

// ── Switch candidature tabs ──
function switchCandTab(tab) {
  document.querySelectorAll('.cand-tab-panel').forEach(p => p.style.display = 'none');
  ['analyse','decision','infos'].forEach(t => {
    const btn = document.getElementById('tab-cand-'+t);
    if (btn) { btn.style.color = 'var(--text-3)'; btn.style.borderBottomColor = 'transparent'; }
  });
  const panel = document.getElementById('cand-panel-'+tab);
  if (panel) panel.style.display = 'block';
  const activeBtn = document.getElementById('tab-cand-'+tab);
  if (activeBtn) { activeBtn.style.color = 'var(--accent)'; activeBtn.style.borderBottomColor = 'var(--accent)'; }
}

// ── Application detail modal ──
function showApplicationDetail(id) {
  const c = _applications.find(x => x._id === id); if (!c) return;
  const offer = _jobOffersMap[c.offre_id] || {};
  const testBlocked = !!(offer.test_requis && !['Test convoqué', 'Test passé'].includes(c.statut));
  const modal = document.getElementById('modal-cand');

  // Update hero
  const heroAvatar = document.getElementById('modal-cand-hero-avatar');
  const heroName   = document.getElementById('modal-cand-hero-name');
  const heroBadges = document.getElementById('modal-cand-hero-badges');
  const heroScore  = document.getElementById('modal-cand-hero-score');
  if (heroAvatar) heroAvatar.textContent = initials(c.candidat_nom);
  if (heroName)   heroName.textContent   = c.candidat_nom;
  if (heroBadges) heroBadges.innerHTML = `
    ${channelBadge(c.canal_candidature)}
    ${c.recommandation ? renderBadge(c.recommandation) : ''}
    ${(c.canal_candidature !== 'plateforme' || c.a_appeler) && !c.rdv_pris && !c.non_interesse ? `<span class="badge badge-amber" style="font-size:10px">${t('badge.to_call')}</span>` : ''}
    ${c.rdv_pris ? `<span class="badge badge-green" style="font-size:10px">${t('badge.appointment_booked')}</span>` : ''}
    ${c.non_interesse ? `<span class="badge badge-gray" style="font-size:10px">${t('badge.not_interested')}</span>` : ''}
  `;
  if (heroScore) {
    if (c.score != null) {
      heroScore.style.display = 'block';
      heroScore.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
          <div style="flex:1;height:5px;background:rgba(255,255,255,.25);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${c.score*10}%;background:white;border-radius:99px;transition:width .8s cubic-bezier(.22,1,.36,1)"></div>
          </div>
          <span style="font-family:var(--mono);font-size:15px;font-weight:800;color:white">${c.score}/10</span>
        </div>`;
    } else {
      heroScore.style.display = 'none';
      heroScore.innerHTML = '';
    }
  }

  // Body with all three tab panels
  document.getElementById('modal-cand-body').innerHTML = `

    <!-- ── Tab: Analyse IA ── -->
    <div class="cand-tab-panel" id="cand-panel-analyse">
      ${!c.score && !c.recommandation ? `
      <div style="text-align:center;padding:48px 20px">
        <div style="font-size:52px;margin-bottom:14px">🤖</div>
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px">${t('cand.analysis_in_progress_title')}</div>
        <div style="font-size:13px;color:var(--text-3);line-height:1.6;margin-bottom:20px">${t('cand.analysis_in_progress_text').replace('\n', '<br>')}</div>
        <button class="btn btn-secondary btn-sm" id="btn-relancer-wf" onclick="relaunchWorkflowFromModal('${c._id}')">${t('btn.relaunch_workflow')}</button>
      </div>` : `
      ${c.adequation_poste ? `<p style="font-size:13px;color:var(--text-2);line-height:1.85;margin-bottom:20px;padding:16px 18px;background:var(--surface-2);border-radius:var(--r-lg);border-left:3px solid var(--accent)">${c.adequation_poste}</p>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        ${c.niveau_education ? `<div style="background:var(--surface-2);border-radius:var(--r);padding:12px 14px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:4px">🎓 ${t('table.education')}</div><div style="font-size:13px;font-weight:600">${c.niveau_education}</div></div>` : ''}
        ${c.experience_annees!=null ? `<div style="background:var(--surface-2);border-radius:var(--r);padding:12px 14px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:4px">🕐 ${t('table.experience')}</div><div style="font-size:13px;font-weight:600">${c.experience_annees} ${LANG==='en' ? (c.experience_annees>1?'years':'year') : ('an'+(c.experience_annees>1?'s':''))}</div></div>` : ''}
      </div>

      ${c.competences_detectees ? `
      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:8px">${t('cand.section.detected_skills')}</div>
        <div>${c.competences_detectees.split(',').map(s=>`<span class="skill-tag">${s.trim()}</span>`).join('')}</div>
      </div>` : ''}

      ${c.competences_manquantes ? `
      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:8px">${t('cand.section.missing_skills')}</div>
        <div>${c.competences_manquantes.split(',').map(s=>`<span class="skill-tag missing">${s.trim()}</span>`).join('')}</div>
      </div>` : ''}

      ${(c.points_forts || c.points_faibles) ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        ${c.points_forts ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:var(--r-lg);padding:16px"><div style="font-size:11px;font-weight:700;color:#166534;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">${t('cand.section.strengths')}</div><p style="font-size:12px;color:var(--text-2);line-height:1.7">${c.points_forts}</p></div>` : ''}
        ${c.points_faibles ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:var(--r-lg);padding:16px"><div style="font-size:11px;font-weight:700;color:#dc2626;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">${t('cand.section.weaknesses')}</div><p style="font-size:12px;color:var(--text-2);line-height:1.7">${c.points_faibles}</p></div>` : ''}
      </div>` : ''}

      ${c.resume_analyse ? `
      <div style="padding:14px 18px;background:var(--surface-2);border-left:3px solid var(--accent);border-radius:0 var(--r-lg) var(--r-lg) 0;margin-bottom:16px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);margin-bottom:6px">${t('cand.section.analysis_summary')}</div>
        <p style="font-size:13px;color:var(--text-2);line-height:1.85;font-style:italic">${c.resume_analyse}</p>
      </div>` : ''}

      ${c.batch_justification ? `
      <div style="padding:14px 16px;background:linear-gradient(135deg,rgba(34,197,94,.07) 0%,rgba(34,197,94,.03) 100%);border-radius:var(--r-lg);border:1.5px solid #bbf7d0;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:16px">🏆</span>
          <span style="font-size:11px;font-weight:800;color:var(--accent-mid);text-transform:uppercase;letter-spacing:.05em">${t('cand.section.batch_selected')}</span>
        </div>
        <p style="font-size:13px;color:var(--text);line-height:1.75;margin:0">${c.batch_justification}</p>
      </div>` : ''}
      `}
    </div>

    <!-- ── Tab: Décision ── -->
    <div class="cand-tab-panel" id="cand-panel-decision" style="display:none">

      <!-- Decision buttons -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px">
        ${testBlocked
          ? `<button style="display:flex;flex-direction:column;align-items:center;gap:7px;padding:16px 8px;background:#f1f5f9;color:#94a3b8;border:2px solid #e2e8f0;border-radius:var(--r-lg);cursor:not-allowed;font-weight:700;font-size:12px" disabled title="${t('cand.decision.test_required_first')}"><span style="font-size:24px;opacity:.4">✅</span>${t('cand.decision.qualify')}<span style="font-size:10px;font-weight:400">${t('cand.decision.test_required')}</span></button>`
          : `<button onclick="applyDecision('${c._id}','QUALIFIE',this)" style="display:flex;flex-direction:column;align-items:center;gap:7px;padding:16px 8px;background:#dcfce7;color:#166534;border:2px solid #bbf7d0;border-radius:var(--r-lg);cursor:pointer;font-weight:700;font-size:12px;transition:all .15s" onmouseover="this.style.background='#bbf7d0';this.style.transform='translateY(-2px)'" onmouseout="this.style.background='#dcfce7';this.style.transform='none'"><span style="font-size:24px">✅</span>${t('cand.decision.qualify')}</button>`}
        <button onclick="applyDecision('${c._id}','A_REVOIR',this)" style="display:flex;flex-direction:column;align-items:center;gap:7px;padding:16px 8px;background:#fef9c3;color:#854d0e;border:2px solid #fde68a;border-radius:var(--r-lg);cursor:pointer;font-weight:700;font-size:12px;transition:all .15s" onmouseover="this.style.background='#fde68a';this.style.transform='translateY(-2px)'" onmouseout="this.style.background='#fef9c3';this.style.transform='none'"><span style="font-size:24px">🔄</span>${t('cand.decision.to_review')}</button>
        <button onclick="applyDecision('${c._id}','NON_SELECTIONNE',this)" style="display:flex;flex-direction:column;align-items:center;gap:7px;padding:16px 8px;background:#fee2e2;color:#991b1b;border:2px solid #fecaca;border-radius:var(--r-lg);cursor:pointer;font-weight:700;font-size:12px;transition:all .15s" onmouseover="this.style.background='#fecaca';this.style.transform='translateY(-2px)'" onmouseout="this.style.background='#fee2e2';this.style.transform='none'"><span style="font-size:24px">❌</span>${t('cand.decision.eliminate')}</button>
      </div>

      <!-- Secondary actions -->
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;padding:14px 16px;background:var(--surface-2);border-radius:var(--r-lg);border:1px solid var(--border-soft)">
        <button class="btn btn-secondary btn-sm" id="btn-relancer-wf" onclick="relaunchWorkflowFromModal('${c._id}')">${t('btn.relaunch_workflow')}</button>
        ${offer.test_requis ? (offer.test_date ? `<button class="btn btn-sm" style="background:#f5f3ff;color:#7c3aed;border:1.5px solid #ddd6fe;font-weight:600" onclick="scheduleTest('${c._id}')">${t('btn.test_summons')}</button>` : `<button class="btn btn-sm" style="background:#f8fafc;color:#94a3b8;border:1.5px solid #e2e8f0;font-weight:600;cursor:not-allowed" disabled title="${LANG==='en'?'Set test date in offer first':'Définir la date du test dans l\'offre d\'abord'}">${t('btn.test_summons')}</button>`) : ''}
        ${offer.lien_rdv ? `<button class="btn btn-sm" style="background:linear-gradient(135deg,var(--grad-start),var(--grad-end));color:white;border:none;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.15)" onclick="openRdvCalcom('${c._id}','${c.offre_id}')">📅 ${LANG==='en'?'Book appointment (Cal.com)':'Prise de RDV cal.com'}</button>` : ''}
        ${!c.non_interesse ? `<button class="btn btn-sm" style="background:#f8fafc;color:#64748b;border:1.5px solid #e2e8f0;font-weight:500" onclick="markNotInterested('${c._id}')">✗ ${t('btn.not_interested')}</button>` : ''}
      </div>

      <!-- Status selector -->
      <div style="margin-bottom:20px;padding:16px;background:var(--surface-2);border-radius:var(--r-lg);border:1px solid var(--border-soft)">
        <label class="form-label" style="margin-bottom:10px;display:block">${t('form.status')}</label>
        <select class="form-control" id="cand-statut-sel" onchange="updateApplicationStatus('${c._id}',this.value)">
          ${['Nouveau','En cours','Entretien planifié','Test convoqué','Test passé','Accepté','Refusé','Pas intéressé'].map(s=>`<option value="${s}" ${c.statut===s?'selected':''}>${statusLabel(s)}</option>`).join('')}
        </select>
      </div>

      <!-- Candidat potentiel toggle -->
      <div style="padding:14px 16px;background:var(--surface-2);border-radius:var(--r-lg);border:1px solid var(--border-soft)">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);margin-bottom:10px">${t('cand.pool.section_label')}</div>
        <button id="btn-potentiel-toggle" onclick="togglePotentiel('${c._id}',this)"
          style="display:flex;align-items:center;gap:10px;width:100%;padding:12px 16px;border-radius:var(--r-lg);cursor:pointer;font-size:13px;font-weight:600;border:2px solid;transition:all .15s;${c.candidat_potentiel ? 'background:#f5f3ff;color:#7c3aed;border-color:#ddd6fe' : 'background:var(--surface);color:var(--text-2);border-color:var(--border)'}">
          <span style="font-size:20px">⭐</span>
          <div style="text-align:left">
            <div>${c.candidat_potentiel ? t('cand.pool.is_potential') : t('cand.pool.mark_as_potential')}</div>
            <div style="font-size:11px;font-weight:400;opacity:.7">${c.candidat_potentiel ? t('cand.pool.click_to_remove') : t('cand.pool.future_offers')}</div>
          </div>
          ${c.candidat_potentiel ? `<span style="margin-left:auto;font-size:11px;padding:3px 8px;background:#ede9fe;border-radius:20px;color:#7c3aed">${t('cand.pool.active_badge')}</span>` : ''}
        </button>
      </div>

      <!-- Manual RDV (hidden) -->
    </div>

    <!-- ── Tab: Infos ── -->
    <div class="cand-tab-panel" id="cand-panel-infos" style="display:none">

      <!-- Edit candidate info -->
      <div style="background:var(--surface-2);border-radius:var(--r-lg);padding:18px;margin-bottom:16px;border:1px solid var(--border-soft)">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);margin-bottom:14px">${t('cand.section.candidate_info')}</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
          <div>
            <label class="form-label">${t('form.full_name')}</label>
            <input class="form-control" id="cand-edit-nom" value="${c.candidat_nom}" placeholder="${LANG==='en'?'First Last':'Prénom Nom'}">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label class="form-label">${t('form.email')}</label>
              <input class="form-control" id="cand-edit-email" value="${c.candidat_email || ''}" placeholder="email@exemple.com" type="email">
            </div>
            <div>
              <label class="form-label">${t('form.phone')}</label>
              <input class="form-control" id="cand-edit-tel" value="${c.candidat_telephone || ''}" placeholder="032 XX XXX XX">
            </div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveCandidatInfo('${c._id}',this)">${t('cand.form.btn_save')}</button>
      </div>

      <!-- Documents -->
      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);margin-bottom:8px">${t('cand.section.documents')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${c.cv_path
            ? `<a href="${fileUrl(c.cv_path)}" target="_blank" class="btn btn-secondary btn-sm">${t('cand.btn.view_cv')}</a>`
            : `<div style="display:flex;align-items:center;gap:8px;width:100%;flex-wrap:wrap">
                <label style="flex:1;min-width:160px;display:flex;align-items:center;gap:8px;padding:9px 14px;background:var(--surface-2);border:1.5px dashed var(--border);border-radius:var(--r);cursor:pointer;font-size:12px;color:var(--text-2)" for="cv-upload-${c._id}">
                  📎 <span id="cv-upload-label-${c._id}">${t('cand.form.choose_cv')}</span>
                </label>
                <input type="file" id="cv-upload-${c._id}" accept=".pdf,.doc,.docx" style="display:none" onchange="document.getElementById('cv-upload-label-${c._id}').textContent=this.files[0]?.name||t('cand.form.choose_cv')">
                <button class="btn btn-primary btn-sm" onclick="uploadCvForCandidate('${c._id}',this)">${t('cand.btn.upload')}</button>
               </div>`
          }
          ${c.lettre_path ? `<a href="${fileUrl(c.lettre_path)}" target="_blank" class="btn btn-secondary btn-sm">${t('cand.btn.view_cover_letter')}</a>` : ''}
        </div>
      </div>

      <!-- Meta info -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:var(--surface-2);border-radius:var(--r);padding:12px 14px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:6px">Canal</div>
          <div>${channelBadge(c.canal_candidature)}</div>
        </div>
        <div style="background:var(--surface-2);border-radius:var(--r);padding:12px 14px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:4px">${t('cand.form.application_date')}</div>
          <div style="font-size:12px;font-weight:600">${formatDatetime(c.date_candidature)}</div>
        </div>
      </div>

      <!-- Email tracking -->
      ${(c.email_invitation_envoye_le || c.relance_1_envoyee_le || c.relance_2_envoyee_le) ? `
      <div style="margin-bottom:16px;padding:14px 16px;background:var(--surface-2);border-radius:var(--r-lg);border:1px solid var(--border-soft)">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:8px">${t('cand.section.interview_email_tracking')}</div>
        ${c.email_invitation_envoye_le ? `<div style="font-size:12px;margin-bottom:4px">${t('cand.email.invitation')} — <strong>${formatDatetime(c.email_invitation_envoye_le)}</strong></div>` : ''}
        ${c.relance_1_envoyee_le ? `<div style="font-size:12px;margin-bottom:4px">${t('cand.email.follow_up_1')} — <strong>${formatDatetime(c.relance_1_envoyee_le)}</strong></div>` : ''}
        ${c.relance_2_envoyee_le ? `<div style="font-size:12px">${t('cand.email.follow_up_2')} — <strong>${formatDatetime(c.relance_2_envoyee_le)}</strong></div>` : ''}
      </div>` : ''}

      <!-- RDV Manuel confirmed -->
      ${c.rdv_manuel?.date ? `
      <div style="margin-bottom:16px;padding:14px 16px;background:#f0fdf4;border-radius:var(--r-lg);border:1px solid #bbf7d0">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#166534;margin-bottom:6px">${t('cand.section.manual_rdv')}</div>
        <div style="font-size:13px;font-weight:600">${c.rdv_manuel.date?.includes('T') ? formatDatetime(c.rdv_manuel.date) : (formatDate(c.rdv_manuel.date) + (c.rdv_manuel.heure ? (LANG==='en'?' at ':' à ') + c.rdv_manuel.heure : ''))}${c.rdv_manuel.lieu ? ' — '+c.rdv_manuel.lieu : ''}</div>
        ${c.rdv_manuel.note ? `<div style="font-size:12px;color:var(--text-2);margin-top:4px">${c.rdv_manuel.note}</div>` : ''}
      </div>` : ''}

      <!-- Recruiter note -->
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);margin-bottom:8px">${t('cand.section.recruiter_notes')}</div>
        <textarea id="cand-commentaire-${c._id}" rows="4" class="form-control" style="resize:vertical;font-size:13px" placeholder="${t('cand.form.notes_placeholder')}" onblur="saveCommentaire('${c._id}',this.value)">${c.commentaire || ''}</textarea>
      </div>
    </div>
  `;

  const defaultTab = (c.score != null || c.recommandation) ? 'analyse' : 'decision';
  switchCandTab(defaultTab);
  modal.style.display = 'flex';
}

async function saveCandidatInfo(id, btn) {
  const nom = document.getElementById('cand-edit-nom')?.value?.trim();
  const email = document.getElementById('cand-edit-email')?.value?.trim();
  const telephone = document.getElementById('cand-edit-tel')?.value?.trim();
  if (!nom) { toast(t('toast.name_required'), 'error'); return; }
  return withLoading(btn, async () => {
    const r = await api.patch(`/api/candidatures/${id}`, { candidat_nom: nom, candidat_email: email, candidat_telephone: telephone });
    if (r?.success) {
      const c = _applications.find(x => x._id === id);
      if (c) { c.candidat_nom = nom; c.candidat_email = email; c.candidat_telephone = telephone; }
      const heroName = document.getElementById('modal-cand-hero-name');
      if (heroName) heroName.textContent = nom;
      const av = document.getElementById('modal-cand-hero-avatar');
      if (av) av.textContent = initials(nom);
      filterApplications();
      toast(t('toast.info_updated'), 'success');
    } else {
      toast(r?.error || t('toast.update_error'), 'error');
    }
  });
}

async function saveCommentaire(id, val) {
  await api.patch(`/api/candidatures/${id}`, { commentaire: val });
  const c = _applications.find(x => x._id === id);
  if (c) c.commentaire = val;
}

async function updateApplicationStatus(id, statut) {
  const r = await api.patch(`/api/candidatures/${id}`, { statut });
  if (r?.success) {
    const c = _applications.find(x => x._id === id);
    if (c) c.statut = statut;
    filterApplications();
    toast(t('toast.status_updated'), 'success');
  } else {
    toast(r?.error || t('toast.status_update_error'), 'error');
  }
}

async function quickQualify(id, recommandation, btn) {
  return withLoading(btn, async () => {
    const r = await api.patch(`/api/candidatures/${id}`, { recommandation });
    if (r?.success) {
      const c = _applications.find(x => x._id === id);
      if (c) c.recommandation = recommandation;
      filterApplications();
      const labels = { QUALIFIE: t('decision.qualified'), A_REVOIR: t('decision.to_review'), NON_SELECTIONNE: t('decision.eliminated') };
      toast(tf('toast.marked_as', labels[recommandation] || recommandation), 'success');
      if (recommandation === 'QUALIFIE') {
        api.post(`/api/candidatures/${id}/envoyer-emails-qualification`, {})
          .then(re => { if (re?.success) toast(t('toast.invitation_sent'), 'success'); else toast(t('toast.email_not_sent') + ' : ' + (re?.error || ''), 'error'); })
          .catch(() => toast(t('toast.email_send_failed'), 'error'));
      } else if (recommandation === 'NON_SELECTIONNE') {
        api.post(`/api/candidatures/${id}/envoyer-email-refus`, {})
          .then(re => { if (re?.success) toast(t('toast.rejection_email_sent'), 'success'); else toast(t('toast.email_not_sent'), 'error'); })
          .catch(() => {});
      }
    } else {
      toast(r?.error || t('toast.update_general_error'), 'error');
    }
  });
}

async function applyDecision(id, recommandation, btn) {
  return withLoading(btn, async () => {
    const statutMap = { QUALIFIE: 'En cours', A_REVOIR: 'En cours', NON_SELECTIONNE: 'Refusé' };
    const newStatut = statutMap[recommandation];
    const r = await api.patch(`/api/candidatures/${id}`, { recommandation, statut: newStatut });
    if (r?.success) {
      const c = _applications.find(x => x._id === id);
      if (c) { c.recommandation = recommandation; c.statut = newStatut; }
      filterApplications();
      // Sync status selector in modal if visible
      const sel = document.getElementById('cand-statut-sel');
      if (sel) sel.value = newStatut;
      toast(tf('toast.decision', {QUALIFIE:t('decision.qualified'),A_REVOIR:t('decision.to_review'),NON_SELECTIONNE:t('decision.eliminated')}[recommandation]||recommandation), 'success');
      if (recommandation === 'QUALIFIE') {
        api.post(`/api/candidatures/${id}/envoyer-emails-qualification`, {})
          .then(re => { if (re?.success) toast(t('toast.invitation_sent'), 'success'); else toast(t('toast.email_not_sent') + ' : ' + (re?.error || ''), 'error'); })
          .catch(() => {});
      } else if (recommandation === 'NON_SELECTIONNE') {
        api.post(`/api/candidatures/${id}/envoyer-email-refus`, {})
          .then(re => { if (re?.success) toast(t('toast.rejection_email_sent'), 'success'); else toast(t('toast.email_not_sent'), 'error'); })
          .catch(() => {});
      }
    } else {
      toast(r?.error || t('toast.error'), 'error');
    }
  });
}

async function scheduleTest(id) {
  if (!confirm(t('msg.test_summons_confirm'))) return;
  const r = await api.post(`/api/candidatures/${id}/convoquer-test`, {});
  if (r?.success) {
    const c = _applications.find(x => x._id === id);
    if (c) c.statut = 'Test convoqué';
    filterApplications();
    const sel = document.getElementById('cand-statut-sel');
    if (sel) sel.value = 'Test convoqué';
    toast(t('toast.test_summons_sent'), 'success');
  } else {
    toast(r?.error || t('toast.test_summons_error'), 'error');
  }
}

function openManualAppointment(id) {
  const form = document.getElementById('rdv-manuel-form');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

// ── Cal.com — Prise de rendez-vous ──

function openRdvCalcom(id, offreId) {
  _rdvCalcomCandidatureId = id;
  _rdvCalcomOffreId       = offreId;
  _rdvCalcomSelectedSlot  = null;
  _calcomSlotsByDate      = {};
  _rdvCalcomTypeRdv       = '';

  const c = _applications.find(x => x._id === id);
  const subtitleEl = document.getElementById('rdv-calcom-subtitle');
  if (subtitleEl && c) subtitleEl.textContent = `${c.candidat_nom} · ${c.titre_poste}`;

  document.getElementById('rdv-calcom-slots-section').style.display = 'none';
  document.getElementById('rdv-calcom-slots').innerHTML = '';
  document.getElementById('rdv-calcom-type-section').style.display = 'none';
  document.getElementById('rdv-calcom-adresse-section').style.display = 'none';
  const adresseEl = document.getElementById('rdv-calcom-adresse');
  if (adresseEl) adresseEl.value = '';

  const confirmBtn = document.getElementById('btn-confirm-rdv-calcom');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.style.opacity = '.45'; confirmBtn.textContent = t('rdv.btn.confirm'); }

  document.getElementById('modal-rdv-calcom').style.display = 'flex';
  loadAvailableDates();
}

async function loadAvailableDates() {
  const datesEl = document.getElementById('rdv-calcom-dates');
  if (!datesEl) return;

  datesEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;color:var(--text-3);font-size:13px;padding:10px 0;width:100%">
      <div class="spinner" style="width:16px;height:16px;border-width:2px;flex-shrink:0"></div>
      ${LANG==='en'?'Loading cal.com availability…':'Chargement des disponibilités cal.com…'}
    </div>`;

  try {
    const r = await api.get(`/api/candidatures/calcom/slots?days=90&offre_id=${_rdvCalcomOffreId}`);

    if (!r?.success) {
      datesEl.innerHTML = `<div style="font-size:13px;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;width:100%">⚠️ ${r?.error || (LANG==='en'?'Cal.com error':'Erreur cal.com')}</div>`;
      return;
    }

    _calcomSlotsByDate = r.dates || {};
    const dateKeys = Object.keys(_calcomSlotsByDate).sort();

    if (!dateKeys.length) {
      datesEl.innerHTML = `
        <div style="text-align:center;padding:24px 0;color:var(--text-3);width:100%">
          <div style="font-size:30px;margin-bottom:8px">📭</div>
          <div style="font-size:13px;font-weight:700;color:var(--text-2)">${LANG==='en'?'No availability in the next 90 days':'Aucune disponibilité dans les 90 prochains jours'}</div>
        </div>`;
      return;
    }

    datesEl.innerHTML = dateKeys.map(dateStr => {
      const d = new Date(dateStr + 'T12:00:00');
      const label = d.toLocaleDateString(LANG === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
      const count = _calcomSlotsByDate[dateStr].length;
      return `<button
        class="rdv-date-pill"
        data-date="${dateStr}"
        onclick="selectCalcomDate('${dateStr}')"
        style="border:2px solid var(--border);border-radius:10px;padding:9px 14px;cursor:pointer;font-weight:700;font-size:13px;background:var(--surface);color:var(--text);transition:all .18s;white-space:nowrap;outline:none;display:flex;flex-direction:column;align-items:center;gap:2px">
        <span>${label}</span>
        <span style="font-size:10px;font-weight:500;opacity:.6">${LANG==='en'?`${count} slot${count>1?'s':''}`:(`${count} créneau${count > 1 ? 'x' : ''}`)}</span>
      </button>`;
    }).join('');

  } catch {
    datesEl.innerHTML = `<div style="font-size:13px;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;width:100%">${LANG==='en'?'Network error — check your connection':'Erreur réseau — vérifiez votre connexion'}</div>`;
  }
}

function selectCalcomDate(dateStr) {
  _rdvCalcomSelectedSlot = null;
  const confirmBtn = document.getElementById('btn-confirm-rdv-calcom');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.style.opacity = '.45'; }

  // Highlight selected date pill
  document.querySelectorAll('.rdv-date-pill').forEach(b => {
    const sel = b.dataset.date === dateStr;
    b.style.background  = sel ? 'var(--accent)' : 'var(--surface)';
    b.style.color       = sel ? 'white'          : 'var(--text)';
    b.style.borderColor = sel ? 'var(--accent)'  : 'var(--border)';
    b.style.boxShadow   = sel ? '0 4px 12px rgba(0,0,0,.18)' : 'none';
  });

  const slotsSection = document.getElementById('rdv-calcom-slots-section');
  const slotsEl      = document.getElementById('rdv-calcom-slots');
  slotsSection.style.display = 'block';

  const slots = _calcomSlotsByDate[dateStr] || [];
  slotsEl.innerHTML = slots.map(s => {
    const timeLabel = new Date(s.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `<button
      class="rdv-slot-pill"
      data-iso="${s.time}"
      data-heure="${timeLabel}"
      data-date="${dateStr}"
      onclick="selectCalcomSlot(this)"
      style="border:2px solid var(--border);border-radius:10px;padding:9px 18px;cursor:pointer;font-family:var(--mono);font-weight:700;font-size:14px;background:var(--surface);color:var(--text);transition:all .18s;white-space:nowrap;outline:none">
      ${timeLabel}
    </button>`;
  }).join('');
}

function selectCalcomSlot(btn) {
  document.querySelectorAll('.rdv-slot-pill').forEach(b => {
    b.style.background  = 'var(--surface)';
    b.style.color       = 'var(--text)';
    b.style.borderColor = 'var(--border)';
    b.style.boxShadow   = 'none';
  });
  btn.style.background  = 'var(--accent)';
  btn.style.color       = 'white';
  btn.style.borderColor = 'var(--accent)';
  btn.style.boxShadow   = '0 4px 12px rgba(0,0,0,.18)';

  _rdvCalcomSelectedSlot = { iso: btn.dataset.iso, heure: btn.dataset.heure, date: btn.dataset.date };

  // Reveal Step 3, reset type selection, keep Confirm disabled until type chosen
  _rdvCalcomTypeRdv = '';
  document.getElementById('rdv-calcom-type-section').style.display = 'block';
  document.getElementById('rdv-calcom-adresse-section').style.display = 'none';
  document.querySelectorAll('.rdv-type-pill').forEach(p => {
    p.style.borderColor = 'var(--border)';
    p.style.background  = 'var(--surface)';
    p.style.color       = 'var(--text)';
  });
  updateConfirmBtn();
}

function selectRdvType(type) {
  _rdvCalcomTypeRdv = type;
  document.querySelectorAll('.rdv-type-pill').forEach(p => {
    const sel = p.dataset.type === type;
    p.style.borderColor = sel ? 'var(--accent)' : 'var(--border)';
    p.style.background  = sel ? 'var(--accent-light, #f0fdf4)' : 'var(--surface)';
    p.style.color       = sel ? 'var(--accent)'  : 'var(--text)';
    p.style.fontWeight  = sel ? '800' : '600';
  });
  const adresseSection = document.getElementById('rdv-calcom-adresse-section');
  if (type === 'presentiel') {
    adresseSection.style.display = 'block';
    document.getElementById('rdv-calcom-adresse')?.focus();
  } else {
    adresseSection.style.display = 'none';
    const el = document.getElementById('rdv-calcom-adresse');
    if (el) el.value = '';
  }
  updateConfirmBtn();
}

function updateConfirmBtn() {
  const adresse = document.getElementById('rdv-calcom-adresse')?.value?.trim() || '';
  const canConfirm = !!_rdvCalcomSelectedSlot && !!_rdvCalcomTypeRdv &&
    (_rdvCalcomTypeRdv === 'visio' || adresse.length > 0);
  const confirmBtn = document.getElementById('btn-confirm-rdv-calcom');
  if (confirmBtn) { confirmBtn.disabled = !canConfirm; confirmBtn.style.opacity = canConfirm ? '1' : '.45'; }
}

async function submitRdvCalcom() {
  if (!_rdvCalcomSelectedSlot || !_rdvCalcomCandidatureId || !_rdvCalcomTypeRdv) return;

  const btn = document.getElementById('btn-confirm-rdv-calcom');
  if (btn) { btn.disabled = true; btn.style.opacity = '.7'; btn.textContent = LANG==='en'?'⏳ Booking…':'⏳ Réservation en cours…'; }

  const lieu = _rdvCalcomTypeRdv === 'visio'
    ? 'Visio'
    : document.getElementById('rdv-calcom-adresse')?.value?.trim() || '';

  try {
    const r = await api.post(`/api/candidatures/${_rdvCalcomCandidatureId}/planifier-rdv`, {
      date:     _rdvCalcomSelectedSlot.date,
      heure:    _rdvCalcomSelectedSlot.heure,
      slot_iso: _rdvCalcomSelectedSlot.iso,
      type_rdv: _rdvCalcomTypeRdv,
      lieu,
    });

    if (r?.success) {
      const c = _applications.find(x => x._id === _rdvCalcomCandidatureId);
      if (c) { c.rdv_pris = true; c.statut = 'Entretien planifié'; }
      filterApplications();
      closeModal('modal-rdv-calcom');
      toast(t('toast.appointment_calcom'), 'success');
      showApplicationDetail(_rdvCalcomCandidatureId);
    } else {
      toast(r?.error || t('toast.appointment_error'), 'error');
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = t('rdv.btn.confirm'); }
    }
  } catch {
    toast(t('toast.network_error'), 'error');
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = t('rdv.btn.confirm'); }
  }
}

async function submitManualAppointment(id, btn) {
  const date  = document.getElementById('rdv-date')?.value;
  const heure = document.getElementById('rdv-heure')?.value || '';
  const lieu  = document.getElementById('rdv-lieu')?.value || '';
  const note  = document.getElementById('rdv-note')?.value || '';
  return withLoading(btn, async () => {
    const r = await api.post(`/api/candidatures/${id}/rdv-manuel`, { date, heure, lieu, note });
    if (r?.success) {
      toast(t('toast.manual_rdv_saved'), 'success');
      const c = _applications.find(x => x._id === id);
      if (c) { c.statut = 'Entretien planifié'; c.rdv_pris = true; c.rdv_manuel = r.candidature.rdv_manuel; }
      filterApplications();
      showApplicationDetail(id);
    } else {
      toast(r?.error || t('toast.manual_rdv_error'), 'error');
    }
  });
}

async function markAppointmentBooked(id) {
  const r = await api.patch(`/api/candidatures/${id}`, { rdv_pris: true, statut: 'Entretien planifié' });
  if (r?.success) {
    const c = _applications.find(x => x._id === id);
    if (c) { c.rdv_pris = true; c.statut = 'Entretien planifié'; }
    filterApplications();
    toast(t('toast.rdv_marked'), 'success');
    showApplicationDetail(id);
  } else {
    toast(r?.error || t('toast.error'), 'error');
  }
}

async function togglePotentiel(id, btn) {
  const app = _applications.find(x => x._id === id);
  if (!app) return;
  const newVal = !app.candidat_potentiel;
  const r = await api.patch(`/api/candidatures/${id}`, { candidat_potentiel: newVal });
  if (r?.success) {
    app.candidat_potentiel = newVal;
    filterApplications();
    // Update button in place without re-rendering the whole modal
    if (btn) {
      btn.style.background   = newVal ? '#f5f3ff' : 'var(--surface)';
      btn.style.color        = newVal ? '#7c3aed' : 'var(--text-2)';
      btn.style.borderColor  = newVal ? '#ddd6fe' : 'var(--border)';
      btn.innerHTML = `<span style="font-size:20px">⭐</span>
        <div style="text-align:left">
          <div>${newVal ? t('cand.pool.is_potential') : t('cand.pool.mark_as_potential')}</div>
          <div style="font-size:11px;font-weight:400;opacity:.7">${newVal ? t('cand.pool.click_to_remove') : t('cand.pool.future_offers')}</div>
        </div>
        ${newVal ? `<span style="margin-left:auto;font-size:11px;padding:3px 8px;background:#ede9fe;border-radius:20px;color:#7c3aed">${t('cand.pool.active_badge')}</span>` : ''}`;
    }
    toast(newVal ? t('toast.added_to_pool') : t('toast.removed_from_pool'), 'success');
  } else {
    toast(r?.error || t('toast.error'), 'error');
  }
}

async function markNotInterested(id) {
  const r = await api.patch(`/api/candidatures/${id}`, { non_interesse: true, statut: 'Pas intéressé' });
  if (r?.success) {
    const c = _applications.find(x => x._id === id);
    if (c) { c.non_interesse = true; c.statut = 'Pas intéressé'; }
    filterApplications();
    toast(t('toast.not_interested_marked'), 'success');
    showApplicationDetail(id);
  } else {
    toast(r?.error || t('toast.error'), 'error');
  }
}

async function uploadCvForCandidate(id, btn) {
  const input = document.getElementById(`cv-upload-${id}`);
  if (!input?.files?.[0]) { toast(t('toast.select_cv_first'), 'error'); return; }
  if (btn) { btn.disabled = true; btn.textContent = LANG==='en'?'⏳ Uploading…':'⏳ Upload…'; }
  const fd = new FormData();
  fd.append('cv', input.files[0]);
  try {
    const resp = await fetch(`/api/candidatures/${id}/upload-cv`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Auth.token()}` },
      body: fd,
    });
    const data = await resp.json();
    if (data.success) {
      toast(t('toast.cv_uploaded'), 'success');
      const app = _applications.find(x => x._id === id);
      if (app) { app.cv_path = data.cv_path; app.cv_filename = data.cv_filename; }
      showApplicationDetail(id);
    } else {
      toast(data.error || t('toast.upload_error'), 'error');
      if (btn) { btn.disabled = false; btn.textContent = t('cand.btn.upload'); }
    }
  } catch (e) {
    toast(t('toast.upload_error'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = t('cand.btn.upload'); }
  }
}

async function relaunchWorkflow(id) {
  const c = _applications.find(x => x._id === id);
  if (!c?.cv_path) { toast(t('toast.cv_required_for_workflow'), 'error'); return; }
  toast(t('toast.workflow_relaunching'), 'info');
  c.score = null; c.recommandation = ''; filterApplications();
  const r = await api.post(`/api/candidatures/${id}/relancer-workflow`, {});
  if (r?.success) { toast(t('toast.workflow_relaunched'), 'success'); startPollingIfNeeded(); }
  else toast(r?.error || t('toast.relaunch_error'), 'error');
}

async function relaunchWorkflowFromModal(id) {
  const c = _applications.find(x => x._id === id);
  if (!c?.cv_path) { toast(t('toast.cv_required_for_workflow'), 'error'); return; }
  const btn = document.getElementById('btn-relancer-wf');
  if (btn) { btn.disabled = true; btn.textContent = LANG==='en'?'⏳ Relaunching…':'⏳ Relancement…'; }
  if (c) { c.score = null; c.recommandation = ''; filterApplications(); }
  const r = await api.post(`/api/candidatures/${id}/relancer-workflow`, {});
  if (r?.success) {
    toast(t('toast.workflow_relaunched'), 'success');
    if (btn) btn.textContent = LANG==='en'?'⏳ Analysis in progress…':'⏳ Analyse en cours…';
    startPollingIfNeeded();
  } else {
    toast(r?.error || t('toast.relaunch_error'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = t('btn.relaunch_workflow'); }
  }
}

// ── Helpers ──
function detailRowModal(label, value) {
  return `<div style="background:var(--surface-2);border-radius:var(--r);padding:10px 12px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:2px">${label}</div><div style="font-size:13px;font-weight:600">${value}</div></div>`;
}

function applicationStatusBadge(s) {
  const map = {
    'Nouveau':'badge-gray', 'En cours':'badge-blue', 'Entretien planifié':'badge-accent',
    'Test convoqué':'badge-purple', 'Test passé':'badge-blue',
    'Accepté':'badge-green', 'Refusé':'badge-red', 'Pas intéressé':'badge-gray',
  };
  return `<span class="badge ${map[s]||'badge-gray'}">${statusLabel(s||'Nouveau')}</span>`;
}

function applicationModalHTML() {
  return `
  <!-- ── Candidature DETAIL modal ── -->
  <div id="modal-cand" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:100;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)" onclick="if(event.target===this)closeModal('modal-cand')">
    <div class="modal-card" style="background:var(--surface);border-radius:var(--r-2xl);width:100%;max-width:680px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 32px 80px rgba(15,23,42,.28);overflow:hidden;animation:scaleIn .22s cubic-bezier(.22,1,.36,1) both">

      <!-- Gradient hero header -->
      <div style="background:linear-gradient(135deg,var(--grad-start) 0%,var(--grad-end) 100%);padding:22px 24px 18px;position:relative;flex-shrink:0;overflow:hidden">
        <div style="position:absolute;top:-40px;right:-40px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.08);pointer-events:none"></div>
        <div style="position:absolute;bottom:-50px;left:-20px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.05);pointer-events:none"></div>
        <button onclick="closeModal('modal-cand')" class="btn-modal-close" style="position:absolute;top:14px;right:14px">✕</button>
        <div style="position:relative;z-index:1;display:flex;align-items:center;gap:16px">
          <div id="modal-cand-hero-avatar" class="avatar" style="width:52px;height:52px;font-size:18px;flex-shrink:0;border:3px solid rgba(255,255,255,.35);box-shadow:0 4px 14px rgba(0,0,0,.2)"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:19px;font-weight:800;color:white;letter-spacing:-.02em;line-height:1.2;margin-bottom:7px" id="modal-cand-hero-name"></div>
            <div id="modal-cand-hero-badges" style="display:flex;flex-wrap:wrap;gap:5px"></div>
            <div id="modal-cand-hero-score" style="display:none"></div>
          </div>
        </div>
      </div>

      <!-- Tab bar -->
      <div style="display:flex;border-bottom:2px solid var(--border-soft);background:var(--surface);padding:0 16px;flex-shrink:0;overflow-x:auto">
        <button id="tab-cand-analyse" onclick="switchCandTab('analyse')" style="padding:12px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:var(--accent);border-bottom:2px solid var(--accent);margin-bottom:-2px;white-space:nowrap;outline:none;transition:color .15s">${t('cand.tab.analysis')}</button>
        <button id="tab-cand-decision" onclick="switchCandTab('decision')" style="padding:12px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:var(--text-3);border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap;outline:none;transition:color .15s">${t('cand.tab.decision')}</button>
        <button id="tab-cand-infos" onclick="switchCandTab('infos')" style="padding:12px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:var(--text-3);border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap;outline:none;transition:color .15s">${t('cand.tab.infos')}</button>
      </div>

      <!-- Scrollable body -->
      <div id="modal-cand-body" style="padding:22px;overflow-y:auto;flex:1"></div>
    </div>
  </div>

  <!-- Prise de rendez-vous cal.com -->
  <div id="modal-rdv-calcom" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.65);z-index:200;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)" onclick="if(event.target===this)closeModal('modal-rdv-calcom')">
    <div style="background:var(--surface);border-radius:var(--r-2xl);width:100%;max-width:520px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 28px 64px rgba(0,0,0,.22);overflow:hidden;animation:scaleIn .22s cubic-bezier(.22,1,.36,1) both">

      <!-- Gradient hero header -->
      <div style="background:linear-gradient(135deg,var(--grad-start),var(--grad-end));padding:26px 24px 22px;position:relative;flex-shrink:0">
        <button onclick="closeModal('modal-rdv-calcom')" class="btn-modal-close" style="position:absolute;top:14px;right:14px">✕</button>
        <div style="font-size:26px;margin-bottom:6px">📅</div>
        <div style="font-size:17px;font-weight:800;color:white;letter-spacing:-.01em">${t('rdv.modal.title')}</div>
        <div id="rdv-calcom-subtitle" style="font-size:12.5px;color:rgba(255,255,255,.78);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
      </div>

      <!-- Body -->
      <div style="padding:24px;overflow-y:auto;flex:1">

        <!-- Step 1 — dates disponibles -->
        <div style="margin-bottom:22px">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:10px;display:flex;align-items:center;gap:6px">
            <span style="background:var(--accent);color:white;width:18px;height:18px;border-radius:50%;font-size:10px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">1</span>
            ${t('rdv.step.available_dates')}
          </div>
          <div id="rdv-calcom-dates" style="display:flex;flex-wrap:wrap;gap:8px;min-height:44px"></div>
        </div>

        <!-- Step 2 — créneaux horaires -->
        <div id="rdv-calcom-slots-section" style="display:none;margin-bottom:22px">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:10px;display:flex;align-items:center;gap:6px">
            <span style="background:var(--accent);color:white;width:18px;height:18px;border-radius:50%;font-size:10px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">2</span>
            ${t('rdv.step.available_slots')}
          </div>
          <div id="rdv-calcom-slots" style="display:flex;flex-wrap:wrap;gap:8px;min-height:44px"></div>
        </div>

        <!-- Step 3 — type de rencontre -->
        <div id="rdv-calcom-type-section" style="display:none;margin-bottom:22px">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:10px;display:flex;align-items:center;gap:6px">
            <span style="background:var(--accent);color:white;width:18px;height:18px;border-radius:50%;font-size:10px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">3</span>
            ${t('rdv.step.meeting_type')}
          </div>
          <div style="display:flex;gap:10px;margin-bottom:14px">
            <button class="rdv-type-pill" data-type="visio" onclick="selectRdvType('visio')"
              style="flex:1;border:2px solid var(--border);border-radius:10px;padding:12px 10px;cursor:pointer;font-size:13px;font-weight:600;background:var(--surface);color:var(--text);transition:all .18s;display:flex;flex-direction:column;align-items:center;gap:4px;outline:none">
              <span style="font-size:22px">📹</span>
              <span>${t('rdv.type.video')}</span>
              <span style="font-size:10px;opacity:.55;font-weight:500">${t('rdv.type.video_hint')}</span>
            </button>
            <button class="rdv-type-pill" data-type="presentiel" onclick="selectRdvType('presentiel')"
              style="flex:1;border:2px solid var(--border);border-radius:10px;padding:12px 10px;cursor:pointer;font-size:13px;font-weight:600;background:var(--surface);color:var(--text);transition:all .18s;display:flex;flex-direction:column;align-items:center;gap:4px;outline:none">
              <span style="font-size:22px">📍</span>
              <span>${t('rdv.type.in_person')}</span>
              <span style="font-size:10px;opacity:.55;font-weight:500">${t('rdv.type.in_person_hint')}</span>
            </button>
          </div>
          <div id="rdv-calcom-adresse-section" style="display:none">
            <input id="rdv-calcom-adresse" type="text" placeholder="${t('rdv.placeholder.address')}"
              oninput="updateConfirmBtn()"
              style="width:100%;padding:10px 14px;border:2px solid var(--border);border-radius:var(--r);font-size:13px;font-family:var(--font);background:var(--surface-2);color:var(--text);outline:none;transition:.15s;box-sizing:border-box"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div style="padding:16px 24px;border-top:1px solid var(--border-soft);display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <button class="btn btn-secondary" onclick="closeModal('modal-rdv-calcom')">${t('btn.cancel')}</button>
        <button id="btn-confirm-rdv-calcom" disabled onclick="submitRdvCalcom()"
          style="background:linear-gradient(135deg,var(--grad-start),var(--grad-end));color:white;border:none;padding:10px 22px;border-radius:var(--r);font-weight:700;font-size:14px;cursor:pointer;opacity:.45;transition:.2s;min-width:170px">
          ${t('rdv.btn.confirm')}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Nouvelle candidature modal ── -->
  <div id="modal-nouveau-cand" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:100;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)" onclick="if(event.target===this)closeModal('modal-nouveau-cand')">
    <div class="modal-card" style="background:var(--surface);border-radius:var(--r-2xl);width:100%;max-width:560px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 32px 80px rgba(15,23,42,.28);overflow:hidden;animation:scaleIn .22s cubic-bezier(.22,1,.36,1) both">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,var(--surface-2),var(--surface));padding:20px 24px;border-bottom:1px solid var(--border-soft);display:flex;align-items:center;gap:14px;flex-shrink:0">
        <div style="width:42px;height:42px;background:linear-gradient(135deg,var(--grad-start),var(--grad-end));border-radius:var(--r-lg);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;box-shadow:0 4px 14px var(--accent-glow)">👤</div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:800;color:var(--text)">${t('cand.modal.title')}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:1px">${t('cand.modal.subtitle')}</div>
        </div>
        <button class="btn-icon" onclick="closeModal('modal-nouveau-cand')">✕</button>
      </div>

      <div style="padding:22px 24px;overflow-y:auto;flex:1">
        <form id="form-nouveau-cand">
          <div class="form-grid">
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">${t('form.position')} <span class="req">*</span></label>
              <select class="form-control" id="nc-offre_id" required>
                <option value="">${t('cand.form.select_offer')}</option>
              </select>
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">${t('cand.form.candidate_name')} <span class="req">*</span></label>
              <input class="form-control" id="nc-nom" placeholder="${LANG==='en'?'First Last':'Prénom Nom'}" required>
            </div>
            <div class="form-group">
              <label class="form-label">${t('form.email')}</label>
              <input class="form-control" id="nc-email" type="email" placeholder="candidat@email.com">
            </div>
            <div class="form-group">
              <label class="form-label">${t('form.phone')}</label>
              <input class="form-control" id="nc-telephone" placeholder="032 XX XXX XX">
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">${t('form.channel')}</label>
              <select class="form-control" id="nc-canal">
                <option value="plateforme" selected>${t('channel.platform')}</option>
                <option value="telephone">${t('channel.phone')}</option>
                <option value="physique">${t('channel.physical')}</option>
                <option value="email">${t('channel.email')}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">${t('cand.form.cv_optional')}</label>
              <input class="form-control" id="nc-cv" type="file" accept=".pdf,.doc,.docx" style="padding:6px">
            </div>
            <div class="form-group">
              <label class="form-label">${t('cand.form.letter_optional')}</label>
              <input class="form-control" id="nc-lettre" type="file" accept=".pdf,.doc,.docx" style="padding:6px">
            </div>
          </div>
          <p style="font-size:12px;color:var(--text-3);margin-top:8px">${t('cand.form.contact_info_hint')}</p>
        </form>
      </div>

      <div style="padding:14px 24px;border-top:1px solid var(--border-soft);display:flex;justify-content:flex-end;gap:10px;background:var(--surface-2);flex-shrink:0">
        <button class="btn btn-secondary" onclick="closeModal('modal-nouveau-cand')">${t('btn.cancel')}</button>
        <button class="btn btn-primary" id="btn-submit-nc" onclick="submitNewApplication()">${t('cand.form.btn_save')}</button>
      </div>
    </div>
  </div>`;
}

function openNewApplication(preselectedOfferId = null) {
  const sel = document.getElementById('nc-offre_id');
  if (sel) {
    const jobOffers = Object.values(_jobOffersMap);
    sel.innerHTML = `<option value="">${t('cand.form.select_offer')}</option>` +
      jobOffers.map(o => `<option value="${o.offre_id}">${o.titre_poste} ${o.statut !== 'Active' ? '('+o.statut+')' : ''}</option>`).join('');
    if (preselectedOfferId) sel.value = preselectedOfferId;
  }
  const form = document.getElementById('form-nouveau-cand');
  if (form) form.reset();
  if (preselectedOfferId && sel) sel.value = preselectedOfferId; // reset() clears value, restore it
  document.getElementById('modal-nouveau-cand').style.display = 'flex';
}

function launchNewApplicationForOffer(offerId) {
  closeModal('modal-offre');
  _pendingNewApplicationOfferId = offerId;
  navigate('candidatures');
}

async function submitNewApplication() {
  const offerId = document.getElementById('nc-offre_id').value;
  const name    = document.getElementById('nc-nom').value.trim();
  const email   = document.getElementById('nc-email').value.trim();
  const phone   = document.getElementById('nc-telephone').value.trim();
  const channel = document.getElementById('nc-canal').value;

  if (!offerId) return toast(t('toast.select_offer'), 'error');
  if (!name)    return toast(t('toast.candidate_name_required'), 'error');
  if (!email && !phone) return toast(t('toast.email_or_phone_required'), 'error');
  const offre = _jobOffersMap[offerId];
  if (offre?.automatisation_active && !email) return toast(t('toast.email_required_auto'), 'error');

  const fd = new FormData();
  fd.append('offre_id', offerId);
  fd.append('candidat_nom', name);
  if (email) fd.append('candidat_email', email);
  if (phone) fd.append('candidat_telephone', phone);
  fd.append('canal_candidature', channel);

  const cvFile          = document.getElementById('nc-cv')?.files?.[0];
  const coverLetterFile = document.getElementById('nc-lettre')?.files?.[0];
  if (cvFile)          fd.append('cv', cvFile);
  if (coverLetterFile) fd.append('lettre', coverLetterFile);

  const btn = document.getElementById('btn-submit-nc');
  return withLoading(btn, async () => {
    const res = await fetch('/api/candidatures', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Auth.token()}` },
      body: fd,
    });
    const r = await res.json();
    if (r.success) {
      toast(t('toast.application_saved'), 'success');
      closeModal('modal-nouveau-cand');
      renderApplications();
      loadCounts();
    } else {
      toast(r.error || t('toast.error'), 'error');
    }
  });
}
