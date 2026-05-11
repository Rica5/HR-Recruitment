let _applications = [], _jobOffersMap = {};
let _pollTimer    = null;
let _currentPage  = 1;
let _filteredList = [];
const PAGE_SIZE   = 30;
let _pendingNewApplicationOfferId = null; // pre-selection from the Offers page

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
    <input class="filter-input" id="q-cands" placeholder="🔍 Nom, email, poste…" oninput="filterApplications()">
    <select class="filter-select" id="f-reco" onchange="filterApplications()">
      <option value="">Toutes recommandations</option>
      <option value="QUALIFIE">✓ Qualifié</option>
      <option value="A_REVOIR">~ À revoir</option>
      <option value="NON_SELECTIONNE">✗ Non retenu</option>
    </select>
    <select class="filter-select" id="f-offre" onchange="filterApplications()">
      <option value="">Toutes les offres</option>
      ${jobOffers.map(o=>`<option value="${o.offre_id}">${o.titre_poste}</option>`).join('')}
    </select>
    <select class="filter-select" id="f-canal" onchange="filterApplications()">
      <option value="">Tous canaux</option>
      <option value="plateforme">🌐 Plateforme</option>
      <option value="email">📧 Email</option>
      <option value="telephone">📞 Téléphone</option>
      <option value="physique">🤝 Physique</option>
    </select>
    ${toCallCount > 0 ? `<button class="btn btn-sm" style="background:#fef3c7;color:#854d0e;border:1.5px solid #fde68a;font-weight:700;white-space:nowrap" onclick="toggleCallFilter()" id="btn-appeler">📞 À appeler (${toCallCount})</button>` : ''}
    <button class="btn btn-secondary btn-sm" onclick="exportCSV()">📥 Export CSV</button>
    <button class="btn btn-primary btn-sm" onclick="openNewApplication()">+ Nouvelle candidature</button>
  </div>
  <div class="card" style="overflow:hidden">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Candidat</th>
            <th>Poste</th>
            <th>Canal</th>
            <th>Score IA</th>
            <th>Recommandation</th>
            <th>Statut suivi</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="cands-tbody"></tbody>
      </table>
    </div>
    <div id="cands-pagination"></div>
  </div>
  ${applicationModalHTML()}`;
  filterApplications();
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

// ── Filters ──
function filterApplications() {
  const q      = document.getElementById('q-cands')?.value.toLowerCase() || '';
  const reco   = document.getElementById('f-reco')?.value || '';
  const offre  = document.getElementById('f-offre')?.value || '';
  const channel = document.getElementById('f-canal')?.value || '';
  let results = _applications;
  if (q) results = results.filter(c => c.candidat_nom.toLowerCase().includes(q)
    || (c.candidat_email||'').toLowerCase().includes(q)
    || c.titre_poste.toLowerCase().includes(q));
  if (reco)    results = results.filter(c => c.recommandation === reco);
  if (offre)   results = results.filter(c => c.offre_id === offre);
  if (channel) results = results.filter(c => c.canal_candidature === channel);
  if (_filterToCall) results = results.filter(c => c.a_appeler && !c.rdv_pris && !c.non_interesse);
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
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">👤</div><p>Aucune candidature trouvée</p></div></td></tr>`;
  } else {
    tbody.innerHTML = slice.map(c => `
      <tr onclick="showApplicationDetail('${c._id}')">
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="avatar">${initials(c.candidat_nom)}</div>
            <div>
              <div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:4px">
                ${c.candidat_nom}
                ${c.a_appeler && !c.rdv_pris && !c.non_interesse ? '<span class="badge badge-amber" style="font-size:9px;padding:1px 5px">📞 APPELER</span>' : ''}
              </div>
              <div style="font-size:11px;color:var(--text-3)">${c.candidat_email || (c.candidat_telephone ? '📞 '+c.candidat_telephone : '—')}</div>
            </div>
          </div>
        </td>
        <td style="font-size:13px;color:var(--text-2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.titre_poste}</td>
        <td>${channelBadge(c.canal_candidature)}</td>
        <td style="min-width:140px">${c.score === null && !c.recommandation ? renderPendingBadge(c._id) : renderScoreBar(c.score)}</td>
        <td>${c.recommandation ? renderBadge(c.recommandation) : '<span class="badge badge-gray">En attente</span>'}</td>
        <td>${applicationStatusBadge(c.statut)}</td>
        <td style="font-size:12px;color:var(--text-3)">${formatDate(c.date_candidature)}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${c.cv_path     ? `<a href="${fileUrl(c.cv_path)}"     target="_blank" class="btn-icon" onclick="event.stopPropagation()" title="CV">📄</a>` : ''}
            ${c.lettre_path ? `<a href="${fileUrl(c.lettre_path)}" target="_blank" class="btn-icon" onclick="event.stopPropagation()" title="Lettre">📝</a>` : ''}
            <button class="btn-icon" style="color:#16a34a;font-weight:700" onclick="event.stopPropagation();quickQualify('${c._id}','QUALIFIE')" title="Qualifier">✓</button>
            <button class="btn-icon" style="color:#dc2626;font-weight:700" onclick="event.stopPropagation();quickQualify('${c._id}','NON_SELECTIONNE')" title="Éliminer">✗</button>
            <button class="btn-icon" onclick="event.stopPropagation();relaunchWorkflow('${c._id}')" title="Relancer l'analyse IA">🔄</button>
            <button class="btn-icon" onclick="event.stopPropagation();if(confirm('Supprimer cette candidature ?'))deleteApplication('${c._id}')" title="Supprimer">🗑️</button>
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
      <button class="btn btn-secondary btn-sm" onclick="goPage(${_currentPage-1})" ${_currentPage===1?'disabled':''}>← Préc.</button>
      <span style="font-size:13px;color:var(--text-2)">${from}–${to} sur <strong>${total}</strong> <span style="color:var(--text-3);margin-left:6px">(page ${_currentPage}/${pages})</span></span>
      <button class="btn btn-secondary btn-sm" onclick="goPage(${_currentPage+1})" ${_currentPage===pages?'disabled':''}>Suiv. →</button>
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
    Analyse…
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
    let updated = false;
    for (const c of stillPending) {
      try {
        const r = await api.get(`/api/candidatures/${c._id}`);
        if (r?.candidature && r.candidature.score !== null) {
          const idx = _applications.findIndex(x => x._id === c._id);
          if (idx !== -1) { _applications[idx] = r.candidature; updated = true; }
        }
      } catch { /* silent */ }
    }
    if (updated) { filterApplications(); toast('Score IA mis à jour', 'success'); }
  }, 5000);
}

function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

// ── Actions ──
async function deleteApplication(id) {
  const r = await api.delete(`/api/candidatures/${id}`);
  if (r?.success) { toast('Candidature supprimée', 'success'); renderApplications(); }
  else toast(r?.error || 'Erreur', 'error');
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
  toast('Export CSV téléchargé !', 'success');
}

// ── Application detail modal ──
function showApplicationDetail(id) {
  const c = _applications.find(x => x._id === id); if (!c) return;
  const offer = _jobOffersMap[c.offre_id] || {};
  const modal = document.getElementById('modal-cand');
  document.getElementById('modal-cand-title').textContent = c.candidat_nom;
  document.getElementById('modal-cand-body').innerHTML = `
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid var(--border-soft)">
    <div class="avatar" style="width:52px;height:52px;font-size:18px">${initials(c.candidat_nom)}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:17px;font-weight:700">${c.candidat_nom}</div>
      <div style="font-size:13px;color:var(--text-3)">
        ${c.candidat_email ? `✉️ ${c.candidat_email}` : ''}
        ${c.candidat_telephone ? ` · 📞 ${c.candidat_telephone}` : ''}
      </div>
      <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${channelBadge(c.canal_candidature)}
        ${c.a_appeler && !c.rdv_pris && !c.non_interesse ? '<span class="badge badge-amber">📞 À APPELER</span>' : ''}
        ${c.rdv_pris ? '<span class="badge badge-green">📅 RDV pris</span>' : ''}
        ${c.non_interesse ? '<span class="badge badge-gray">✗ Non intéressé</span>' : ''}
        ${c.recommandation ? renderBadge(c.recommandation) : ''}
        ${c.score!=null ? `<span style="font-family:var(--mono);font-weight:700;color:${scoreColor(c.score)};font-size:15px">${c.score}/10</span>` : ''}
      </div>
    </div>
  </div>

  ${c.score!=null ? `
  <div style="margin-bottom:18px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <div style="flex:1;height:10px;background:var(--surface-2);border-radius:99px;overflow:hidden">
        <div style="height:100%;width:${c.score*10}%;background:${scoreColor(c.score)};border-radius:99px;transition:width .7s"></div>
      </div>
      <span style="font-family:var(--mono);font-size:16px;font-weight:700;color:${scoreColor(c.score)}">${c.score}/10</span>
    </div>
    ${c.adequation_poste ? `<p style="font-size:13px;color:var(--text-2);line-height:1.7">${c.adequation_poste}</p>` : ''}
  </div>` : ''}

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
    ${c.niveau_education ? detailRowModal('🎓 Éducation',c.niveau_education) : ''}
    ${c.experience_annees!=null ? detailRowModal('🕐 Expérience',c.experience_annees+' ans') : ''}
    ${detailRowModal('📋 Poste',c.titre_poste)}
    ${detailRowModal('📅 Date',formatDatetime(c.date_candidature))}
  </div>

  ${c.competences_detectees ? `<div style="margin-bottom:14px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);font-weight:600;margin-bottom:6px">Compétences détectées</div>${c.competences_detectees.split(',').map(s=>`<span class="skill-tag">${s.trim()}</span>`).join('')}</div>` : ''}
  ${c.competences_manquantes ? `<div style="margin-bottom:14px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);font-weight:600;margin-bottom:6px">Compétences manquantes</div>${c.competences_manquantes.split(',').map(s=>`<span class="skill-tag missing">${s.trim()}</span>`).join('')}</div>` : ''}

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
    ${c.points_forts ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:var(--r);padding:14px"><div style="font-size:11px;font-weight:600;color:#166534;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">✅ Points forts</div><p style="font-size:12px;color:var(--text-2);line-height:1.6">${c.points_forts}</p></div>` : ''}
    ${c.points_faibles ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:var(--r);padding:14px"><div style="font-size:11px;font-weight:600;color:#dc2626;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">⚠️ Points faibles</div><p style="font-size:12px;color:var(--text-2);line-height:1.6">${c.points_faibles}</p></div>` : ''}
  </div>

  ${c.resume_analyse ? `<div style="border-left:3px solid var(--accent);padding-left:14px;margin-bottom:16px"><p style="font-size:13px;color:var(--text-2);line-height:1.8;font-style:italic">${c.resume_analyse}</p></div>` : ''}

  <!-- Email follow-up tracking -->
  ${(c.email_invitation_envoye_le || c.relance_1_envoyee_le || c.relance_2_envoyee_le) ? `
  <div style="margin-bottom:16px;padding:12px 14px;background:var(--surface-2);border-radius:var(--r);border:1px solid var(--border-soft)">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:8px">📧 Suivi emails entretien</div>
    <div style="display:flex;flex-direction:column;gap:4px">
      ${c.email_invitation_envoye_le ? `<div style="font-size:12px">✉️ Invitation envoyée le <strong>${formatDatetime(c.email_invitation_envoye_le)}</strong></div>` : ''}
      ${c.relance_1_envoyee_le ? `<div style="font-size:12px">🔔 Relance 1 envoyée le <strong>${formatDatetime(c.relance_1_envoyee_le)}</strong></div>` : ''}
      ${c.relance_2_envoyee_le ? `<div style="font-size:12px">🔔 Relance 2 envoyée le <strong>${formatDatetime(c.relance_2_envoyee_le)}</strong></div>` : ''}
    </div>
  </div>` : ''}

  <!-- Manual appointment -->
  ${c.rdv_manuel?.date ? `
  <div style="margin-bottom:16px;padding:12px 14px;background:#f0fdf4;border-radius:var(--r);border:1px solid #bbf7d0">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#166534;margin-bottom:6px">📅 RDV Manuel</div>
    <div style="font-size:13px;font-weight:600">${formatDate(c.rdv_manuel.date)}${c.rdv_manuel.heure ? ' à '+c.rdv_manuel.heure : ''}${c.rdv_manuel.lieu ? ' — '+c.rdv_manuel.lieu : ''}</div>
    ${c.rdv_manuel.note ? `<div style="font-size:12px;color:var(--text-2);margin-top:4px">${c.rdv_manuel.note}</div>` : ''}
  </div>` : ''}

  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
    ${c.cv_path     ? `<a href="${fileUrl(c.cv_path)}"     target="_blank" class="btn btn-secondary btn-sm">📄 Voir le CV</a>` : ''}
    ${c.lettre_path ? `<a href="${fileUrl(c.lettre_path)}" target="_blank" class="btn btn-secondary btn-sm">📝 Lettre de motivation</a>` : ''}
  </div>

  <!-- Manual decision -->
  <div style="margin-bottom:18px;padding:16px;background:var(--surface-2);border-radius:var(--r);border:1px solid var(--border-soft)">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);font-weight:600;margin-bottom:10px">Décision manuelle</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <button class="btn btn-sm" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;font-weight:600" onclick="applyDecision('${c._id}','QUALIFIE')">✅ Qualifier</button>
      <button class="btn btn-sm" style="background:#fef9c3;color:#854d0e;border:1px solid #fde68a;font-weight:600" onclick="applyDecision('${c._id}','A_REVOIR')">~ À revoir</button>
      <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-weight:600" onclick="applyDecision('${c._id}','NON_SELECTIONNE')">❌ Éliminer</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" id="btn-relancer-wf" onclick="relaunchWorkflowFromModal('${c._id}')">🔄 Relancer l'analyse IA</button>
      ${offer.test_requis ? `<button class="btn btn-sm" style="background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;font-weight:600" onclick="scheduleTest('${c._id}')">📋 Convoquer au test</button>` : ''}
      <button class="btn btn-sm" style="background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;font-weight:600" onclick="openManualAppointment('${c._id}')">📅 RDV manuel</button>
      ${c.a_appeler && !c.rdv_pris ? `<button class="btn btn-sm" style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;font-weight:600" onclick="markAppointmentBooked('${c._id}')">✅ RDV pris</button>` : ''}
      ${!c.non_interesse ? `<button class="btn btn-sm" style="background:#f8fafc;color:#64748b;border:1px solid #e2e8f0" onclick="markNotInterested('${c._id}')">✗ Pas intéressé</button>` : ''}
    </div>
  </div>

  <div>
    <label class="form-label">Statut suivi</label>
    <select class="form-control" id="cand-statut-sel" style="max-width:240px" onchange="updateApplicationStatus('${c._id}',this.value)">
      ${['Nouveau','En cours','Entretien planifié','Test convoqué','Test passé','Accepté','Refusé','Pas intéressé'].map(s=>`<option ${c.statut===s?'selected':''}>${s}</option>`).join('')}
    </select>
  </div>

  <!-- Inline manual appointment form -->
  <div id="rdv-manuel-form" style="display:none;margin-top:16px;padding:16px;background:var(--surface-2);border-radius:var(--r);border:1px solid #bae6fd">
    <div style="font-size:13px;font-weight:700;color:#0369a1;margin-bottom:12px">📅 Planifier un RDV manuel</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div><label class="form-label">Date</label><input class="form-control" type="date" id="rdv-date"></div>
      <div><label class="form-label">Heure</label><input class="form-control" id="rdv-heure" placeholder="Ex: 10h00"></div>
      <div><label class="form-label">Lieu</label><input class="form-control" id="rdv-lieu" placeholder="Salle réunion A"></div>
      <div><label class="form-label">Note</label><input class="form-control" id="rdv-note" placeholder="Optionnel…"></div>
    </div>
    <button class="btn btn-primary btn-sm" onclick="submitManualAppointment('${c._id}')">Confirmer le RDV</button>
    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('rdv-manuel-form').style.display='none'">Annuler</button>
  </div>`;
  modal.style.display = 'flex';
}

async function updateApplicationStatus(id, statut) {
  const r = await api.patch(`/api/candidatures/${id}`, { statut });
  if (r?.success) {
    const c = _applications.find(x => x._id === id);
    if (c) c.statut = statut;
    filterApplications();
    toast('Statut mis à jour', 'success');
  } else {
    toast(r?.error || 'Erreur mise à jour statut', 'error');
  }
}

async function quickQualify(id, recommandation) {
  const r = await api.patch(`/api/candidatures/${id}`, { recommandation });
  if (r?.success) {
    const c = _applications.find(x => x._id === id);
    if (c) c.recommandation = recommandation;
    filterApplications();
    const labels = { QUALIFIE: '✅ Qualifié', A_REVOIR: '~ À revoir', NON_SELECTIONNE: '❌ Éliminé' };
    toast(`Candidat marqué : ${labels[recommandation] || recommandation}`, 'success');
    if (recommandation === 'QUALIFIE') {
      api.post(`/api/candidatures/${id}/envoyer-emails-qualification`, {})
        .then(re => { if (re?.success) toast('📧 Email d\'invitation envoyé', 'success'); else toast('⚠️ Email non envoyé : ' + (re?.error || 'erreur'), 'error'); })
        .catch(() => toast('⚠️ Impossible d\'envoyer les emails', 'error'));
    } else if (recommandation === 'NON_SELECTIONNE') {
      api.post(`/api/candidatures/${id}/envoyer-email-refus`, {})
        .then(re => { if (re?.success) toast('📧 Email de refus envoyé', 'success'); else toast('⚠️ Email non envoyé', 'error'); })
        .catch(() => {});
    }
  } else {
    toast(r?.error || 'Erreur lors de la mise à jour', 'error');
  }
}

async function applyDecision(id, recommandation) {
  const r = await api.patch(`/api/candidatures/${id}`, { recommandation });
  if (r?.success) {
    const c = _applications.find(x => x._id === id);
    if (c) c.recommandation = recommandation;
    filterApplications();
    toast(`Décision : ${{QUALIFIE:'✅ Qualifié',A_REVOIR:'~ À revoir',NON_SELECTIONNE:'❌ Éliminé'}[recommandation]||recommandation}`, 'success');
    if (recommandation === 'QUALIFIE') {
      api.post(`/api/candidatures/${id}/envoyer-emails-qualification`, {})
        .then(re => { if (re?.success) toast('📧 Email d\'invitation envoyé', 'success'); else toast('⚠️ Email non envoyé : ' + (re?.error || 'erreur'), 'error'); })
        .catch(() => {});
    } else if (recommandation === 'NON_SELECTIONNE') {
      api.post(`/api/candidatures/${id}/envoyer-email-refus`, {})
        .then(re => { if (re?.success) toast('📧 Email de refus envoyé', 'success'); else toast('⚠️ Email non envoyé', 'error'); })
        .catch(() => {});
    }
  } else {
    toast(r?.error || 'Erreur', 'error');
  }
}

async function scheduleTest(id) {
  if (!confirm('Envoyer la convocation au test à ce candidat ?')) return;
  const r = await api.post(`/api/candidatures/${id}/convoquer-test`, {});
  if (r?.success) {
    toast('📋 Convocation test envoyée !', 'success');
    const c = _applications.find(x => x._id === id);
    if (c) c.statut = 'Test convoqué';
    filterApplications();
    showApplicationDetail(id);
  } else {
    toast(r?.error || 'Erreur lors de la convocation', 'error');
  }
}

function openManualAppointment(id) {
  const form = document.getElementById('rdv-manuel-form');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function submitManualAppointment(id) {
  const date  = document.getElementById('rdv-date')?.value;
  const heure = document.getElementById('rdv-heure')?.value || '';
  const lieu  = document.getElementById('rdv-lieu')?.value || '';
  const note  = document.getElementById('rdv-note')?.value || '';
  const r = await api.post(`/api/candidatures/${id}/rdv-manuel`, { date, heure, lieu, note });
  if (r?.success) {
    toast('📅 RDV manuel enregistré !', 'success');
    const c = _applications.find(x => x._id === id);
    if (c) { c.statut = 'Entretien planifié'; c.rdv_pris = true; c.rdv_manuel = r.candidature.rdv_manuel; }
    filterApplications();
    showApplicationDetail(id);
  } else {
    toast(r?.error || 'Erreur lors du RDV manuel', 'error');
  }
}

async function markAppointmentBooked(id) {
  const r = await api.patch(`/api/candidatures/${id}`, { rdv_pris: true, statut: 'Entretien planifié' });
  if (r?.success) {
    const c = _applications.find(x => x._id === id);
    if (c) { c.rdv_pris = true; c.statut = 'Entretien planifié'; }
    filterApplications();
    toast('✅ RDV marqué comme pris', 'success');
    showApplicationDetail(id);
  } else {
    toast(r?.error || 'Erreur', 'error');
  }
}

async function markNotInterested(id) {
  const r = await api.patch(`/api/candidatures/${id}`, { non_interesse: true, statut: 'Pas intéressé' });
  if (r?.success) {
    const c = _applications.find(x => x._id === id);
    if (c) { c.non_interesse = true; c.statut = 'Pas intéressé'; }
    filterApplications();
    toast('Candidat marqué comme non intéressé', 'success');
    showApplicationDetail(id);
  } else {
    toast(r?.error || 'Erreur', 'error');
  }
}

async function relaunchWorkflow(id) {
  toast('Relancement du workflow en cours…', 'info');
  const c = _applications.find(x => x._id === id);
  if (c) { c.score = null; c.recommandation = ''; filterApplications(); }
  const r = await api.post(`/api/candidatures/${id}/relancer-workflow`, {});
  if (r?.success) { toast('🔄 Workflow relancé ! Analyse en cours…', 'success'); startPollingIfNeeded(); }
  else toast(r?.error || 'Erreur lors du relancement', 'error');
}

async function relaunchWorkflowFromModal(id) {
  const btn = document.getElementById('btn-relancer-wf');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Relancement…'; }
  const c = _applications.find(x => x._id === id);
  if (c) { c.score = null; c.recommandation = ''; filterApplications(); }
  const r = await api.post(`/api/candidatures/${id}/relancer-workflow`, {});
  if (r?.success) {
    toast('🔄 Workflow relancé — analyse en cours…', 'success');
    if (btn) btn.textContent = '⏳ Analyse en cours…';
    startPollingIfNeeded();
  } else {
    toast(r?.error || 'Erreur lors du relancement', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Relancer l\'analyse IA'; }
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
  return `<span class="badge ${map[s]||'badge-gray'}">${s||'Nouveau'}</span>`;
}

function applicationModalHTML() {
  return `<div id="modal-cand" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:100;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)closeModal('modal-cand')">
    <div style="background:var(--surface);border-radius:var(--r-xl);width:100%;max-width:680px;max-height:90vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg)">
      <div style="padding:20px 24px;border-bottom:1px solid var(--border-soft);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:16px;font-weight:700" id="modal-cand-title"></div>
        <button class="btn-icon" onclick="closeModal('modal-cand')">✕</button>
      </div>
      <div id="modal-cand-body" style="padding:22px 24px;overflow-y:auto;flex:1"></div>
    </div>
  </div>

  <!-- Manual application entry modal -->
  <div id="modal-nouveau-cand" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:100;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)closeModal('modal-nouveau-cand')">
    <div style="background:var(--surface);border-radius:var(--r-xl);width:100%;max-width:560px;max-height:90vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg)">
      <div style="padding:20px 24px;border-bottom:1px solid var(--border-soft);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:16px;font-weight:700">Nouvelle candidature</div>
        <button class="btn-icon" onclick="closeModal('modal-nouveau-cand')">✕</button>
      </div>
      <div style="padding:24px;overflow-y:auto;flex:1">
        <form id="form-nouveau-cand">
          <div class="form-grid">
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Poste <span class="req">*</span></label>
              <select class="form-control" id="nc-offre_id" required>
                <option value="">Sélectionner une offre…</option>
              </select>
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Nom du candidat <span class="req">*</span></label>
              <input class="form-control" id="nc-nom" placeholder="Prénom Nom" required>
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-control" id="nc-email" type="email" placeholder="candidat@email.com">
            </div>
            <div class="form-group">
              <label class="form-label">Téléphone</label>
              <input class="form-control" id="nc-telephone" placeholder="032 XX XXX XX">
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Canal de candidature</label>
              <select class="form-control" id="nc-canal">
                <option value="plateforme">🌐 Plateforme</option>
                <option value="email">📧 Email</option>
                <option value="telephone" selected>📞 Téléphone</option>
                <option value="physique">🤝 Physique</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">CV (optionnel)</label>
              <input class="form-control" id="nc-cv" type="file" accept=".pdf,.doc,.docx" style="padding:6px">
            </div>
            <div class="form-group">
              <label class="form-label">Lettre de motivation (optionnel)</label>
              <input class="form-control" id="nc-lettre" type="file" accept=".pdf,.doc,.docx" style="padding:6px">
            </div>
          </div>
          <p style="font-size:12px;color:var(--text-3);margin-top:4px">Email ou téléphone requis. Si pas d'email, le candidat sera marqué "À appeler".</p>
        </form>
      </div>
      <div style="padding:16px 24px;border-top:1px solid var(--border-soft);display:flex;justify-content:flex-end;gap:10px">
        <button class="btn btn-secondary" onclick="closeModal('modal-nouveau-cand')">Annuler</button>
        <button class="btn btn-primary" id="btn-submit-nc" onclick="submitNewApplication()">Enregistrer</button>
      </div>
    </div>
  </div>`;
}

function openNewApplication(preselectedOfferId = null) {
  const sel = document.getElementById('nc-offre_id');
  if (sel) {
    const jobOffers = Object.values(_jobOffersMap);
    sel.innerHTML = `<option value="">Sélectionner une offre…</option>` +
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

  if (!offerId) return toast('Sélectionnez une offre', 'error');
  if (!name)    return toast('Nom du candidat requis', 'error');
  if (!email && !phone) return toast('Email ou téléphone requis', 'error');

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
  if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }

  try {
    const res = await fetch('/api/candidatures', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Auth.token()}` },
      body: fd,
    });
    const r = await res.json();
    if (r.success) {
      toast('Candidature enregistrée — analyse IA en cours', 'success');
      closeModal('modal-nouveau-cand');
      renderApplications();
    } else {
      toast(r.error || 'Erreur', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer'; }
    }
  } catch {
    toast('Erreur réseau', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer'; }
  }
}
