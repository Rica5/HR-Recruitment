let _jobOffers = [], _offerApplications = {};
let _selectedCandidateIds = new Set();
let _currentOfferDetailId = null;

async function renderOffers() {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner" style="width:28px;height:28px"></div></div>`;
  const [offersResponse, applicationsResponse] = await Promise.all([api.get('/api/offres'), api.get('/api/candidatures')]);
  _jobOffers = offersResponse?.offres || [];
  const applications = applicationsResponse?.candidatures || [];
  _offerApplications = {};
  applications.forEach(c => { if (!_offerApplications[c.offre_id]) _offerApplications[c.offre_id] = []; _offerApplications[c.offre_id].push(c); });
  drawOffersList(_jobOffers);
}

function drawOffersList(offers) {
  const el = document.getElementById('page-content');
  if (window._pendingOfferDetail) {
    const id = window._pendingOfferDetail;
    window._pendingOfferDetail = null;
    setTimeout(() => showOfferDetail(id), 50);
  }
  const uc = Auth.user()?.company || '';
  el.innerHTML = `
  <div class="filters-bar">
    <input class="filter-input" id="q-offres" placeholder="${t('filter.search_offers')}" oninput="filterOffers()">
    <select class="filter-select" id="f-statut" onchange="filterOffers()">
      <option value="">${t('filter.all_statuses')}</option>
      <option value="Active" selected>${t('status.active')}</option>
      <option value="Fermée">${t('status.closed')}</option>
      <option value="En pause">${t('status.paused')}</option>
    </select>
    <select class="filter-select" id="f-contrat" onchange="filterOffers()">
      <option value="">${t('filter.all_contracts')}</option>
      <option>CDI</option><option>CDD</option>
      <option value="Stage">${t('contract.internship')}</option>
      <option>Freelance</option>
      <option value="Alternance">${t('contract.alternance')}</option>
    </select>
    <select class="filter-select" id="f-company" onchange="filterOffers()">
      <option value="">${t('filter.all_companies')}</option>
      <option value="solumada" ${uc === 'solumada' ? 'selected' : ''}>Solumada</option>
      <option value="optimum"  ${uc === 'optimum'  ? 'selected' : ''}>Optimum Solutions</option>
    </select>
    <select class="filter-select" id="f-owner" onchange="filterOffers()">
      <option value="">${t('filter.all_recruiters')}</option>
      <option value="mine">${t('filter.my_offers')}</option>
    </select>
    <span id="offres-count" style="font-size:13px;color:var(--text-3);white-space:nowrap;align-self:center"></span>
    <button id="btn-reset-filters" class="btn btn-ghost btn-sm" style="display:none;white-space:nowrap" onclick="resetOfferFilters()">✕ ${t('filter.reset')}</button>
  </div>
  <div id="offres-list"></div>
  ${offerModalHTML()}
  ${batchEvalModalHTML()}`;
  filterOffers();
}

function renderOfferCards(offers) {
  const el = document.getElementById('offres-list');
  if (!offers.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>${t('empty.no_offers')}</p><button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="openCreateOffer()">${t('btn.new_offer')}</button></div>`;
    return;
  }
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
${offers.map(o => {
    const apps     = _offerApplications[o.offre_id] || [];
    const qual     = apps.filter(c => c.recommandation === 'QUALIFIE').length;
    const approved = o.approbation_inspection?.approuvee;
    const isOpt    = o.company === 'optimum';
    const cc       = isOpt ? '#62A5D2' : '#22c55e';
    const cn       = isOpt ? 'Optimum' : 'Solumada';
    const hasBatch = apps.some(c => c.score != null);
    const inspBadge = o.company !== 'optimum'
      ? (approved
          ? `<span class="badge badge-green" style="font-size:10px">✓ Insp.</span>`
          : `<span class="badge badge-amber" style="font-size:10px">⏳ Insp.</span>`)
      : '';
    return `
<div class="offre-card" onclick="showOfferDetail('${o.offre_id}')" style="flex-direction:column;align-items:stretch;padding:0;gap:0;cursor:pointer">
  <div style="padding:12px 14px 8px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">
    <span style="font-size:10px;font-weight:700;color:${cc};background:${cc}18;border:1px solid ${cc}35;border-radius:99px;padding:2px 8px;letter-spacing:.02em">${cn}</span>
    ${offerStatusBadge(o.statut)}
    <span class="badge badge-gray" style="font-size:10px">${o.type_contrat}</span>
    ${inspBadge}
    ${o.automatisation_active ? `<span class="badge badge-blue" style="font-size:10px">🤖 Auto</span>` : ''}
  </div>
  <div style="padding:0 14px 8px">
    <div style="font-size:15px;font-weight:700;color:var(--text);line-height:1.3">${o.titre_poste}</div>
  </div>
  <div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:3px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--text-3)">📍 ${o.localisation}</span>
      ${offerDeadlineBadge(o.date_butoire)}
    </div>
    <span style="font-size:12px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">👤 ${o.email_recruteur}</span>
    ${o.salaire ? `<span style="font-size:12px;color:var(--text-3)">💰 ${o.salaire}</span>` : ''}
  </div>
  <div style="padding:10px 14px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--surface-2);border-radius:0 0 var(--r-xl) var(--r-xl)">
    <div style="display:flex;gap:16px">
      <div class="offre-count" style="min-width:auto"><div class="offre-count-val">${apps.length}</div><div class="offre-count-lbl">${t('table.candidate')}</div></div>
      <div class="offre-count" style="min-width:auto"><div class="offre-count-val" style="color:var(--accent-mid)">${qual}</div><div class="offre-count-lbl">${t('reco.qualified')}</div></div>
    </div>
    <div style="display:flex;gap:4px;align-items:center">
      ${o.statut === 'Active' ? `<button class="btn-icon" title="${t('btn.copy_link')}" onclick="event.stopPropagation();copyOfferLink('${o.offre_id}')">🔗</button>` : ''}
      <button class="btn-icon" title="${t('btn.edit')}" onclick="event.stopPropagation();editOffer('${o.offre_id}')">✏️</button>
      <div style="position:relative">
        <button class="btn-icon" title="${LANG==='en'?'More options':'Plus d\'options'}" onclick="event.stopPropagation();toggleOfferMenu('${o.offre_id}')">•••</button>
        <div id="offer-menu-${o.offre_id}" style="display:none;position:absolute;right:0;top:calc(100% + 4px);background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow-lg);min-width:170px;z-index:50;overflow:hidden">
          ${hasBatch ? `<button onclick="event.stopPropagation();closeOfferMenu();openBatchEvalModal('${o.offre_id}')" class="offer-menu-item">🏆 ${t('btn.evaluate_candidates')}</button>` : ''}
          <button onclick="event.stopPropagation();closeOfferMenu();cloneOffer('${o.offre_id}')" class="offer-menu-item">⧉ ${t('btn.clone_offer')}</button>
          <button onclick="event.stopPropagation();closeOfferMenu();exportOfferPDF('${o.offre_id}')" class="offer-menu-item">📄 ${t('btn.export_pdf')}</button>
          <button onclick="event.stopPropagation();closeOfferMenu();deleteOffer('${o.offre_id}',this)" class="offer-menu-item offer-menu-danger">🗑️ ${t('btn.delete')}</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
  }).join('')}
</div>`;
}

function offerDeadlineBadge(date_butoire) {
  if (!date_butoire) return '';
  const days = Math.ceil((new Date(date_butoire) - new Date()) / 86400000);
  if (days < 0) return `<span style="font-size:11px;color:var(--text-3)">⏱ ${formatDate(date_butoire)}</span>`;
  const color  = days <= 7 ? '#ef4444' : days <= 30 ? '#f59e0b' : 'var(--text-3)';
  const weight = days <= 30 ? '600' : '400';
  return `<span style="font-size:11px;color:${color};font-weight:${weight}">⏱ ${formatDate(date_butoire)}</span>`;
}

function toggleOfferMenu(id) {
  const m = document.getElementById(`offer-menu-${id}`);
  const wasOpen = m?.style.display !== 'none';
  closeOfferMenu();
  if (!wasOpen && m) {
    m.style.display = 'block';
    setTimeout(() => {
      const handler = (e) => {
        if (!m.contains(e.target)) { m.style.display = 'none'; document.removeEventListener('click', handler, true); }
      };
      document.addEventListener('click', handler, true);
    }, 0);
  }
}

function closeOfferMenu() {
  document.querySelectorAll('[id^="offer-menu-"]').forEach(m => m.style.display = 'none');
}

function filterOffers() {
  const q    = document.getElementById('q-offres')?.value.toLowerCase() || '';
  const s    = document.getElementById('f-statut')?.value || '';
  const c    = document.getElementById('f-contrat')?.value || '';
  const co   = document.getElementById('f-company')?.value || '';
  const own  = document.getElementById('f-owner')?.value || '';

  let results = _jobOffers;
  if (q)   results = results.filter(o =>
    o.titre_poste.toLowerCase().includes(q) ||
    (o.localisation||'').toLowerCase().includes(q) ||
    (o.offre_id||'').toLowerCase().includes(q) ||
    (o.email_recruteur||'').toLowerCase().includes(q)
  );
  if (s)   results = results.filter(o => o.statut === s);
  if (c)   results = results.filter(o => o.type_contrat === c);
  if (co)  results = results.filter(o => o.company === co);
  if (own === 'mine') results = results.filter(o => o.email_recruteur === Auth.user()?.email);

  // Compteur + bouton reset
  const countEl = document.getElementById('offres-count');
  const resetEl = document.getElementById('btn-reset-filters');
  const active  = !!(q || s || c || co || own);
  if (countEl) countEl.textContent = active
    ? t('filter.offers_count').replace('{n}', results.length)
    : '';
  if (resetEl) resetEl.style.display = active ? '' : 'none';

  renderOfferCards(results);
}

function resetOfferFilters() {
  ['q-offres','f-statut','f-contrat','f-company','f-owner'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  filterOffers();
}

function copyOfferLink(id) { copyText(`${location.origin}/postuler?offre_id=${id}`, t('toast.copied')); }

function syncStatutWithCalendar() {
  const lien = document.getElementById('fo-lien_rdv')?.value?.trim();
  const activeOpt = document.getElementById('fo-statut-active');
  const hint = document.getElementById('fo-statut-hint');
  const statut = document.getElementById('fo-statut');
  if (!activeOpt) return;
  const hasLink = !!lien;
  activeOpt.disabled = !hasLink;
  if (hint) hint.style.display = hasLink ? 'none' : 'block';
  if (!hasLink && statut?.value === 'Active') statut.value = 'En pause';
}

function cloneOffer(id) {
  const o = _jobOffers.find(x => x.offre_id === id);
  if (!o) return;
  openCreateOffer({ ...o, offre_id: null });
}

async function deleteOffer(id, btn) {
  if (!confirm(t('offer.delete_confirm'))) return;
  return withLoading(btn, async () => {
    const r = await api.delete(`/api/offres/${id}`);
    if (r?.success) { toast(t('toast.offer_deleted'), 'success'); renderOffers(); loadCounts(); }
    else toast(r?.error || t('toast.error'), 'error');
  });
}

function showOfferDetail(id) {
  const o = _jobOffers.find(x => x.offre_id === id); if (!o) return;
  _selectedCandidateIds.clear();
  _currentOfferDetailId = id;
  const offerApplications = _offerApplications[id] || [];
  const modal = document.getElementById('modal-offre');
  const approved = o.approbation_inspection?.approuvee;
  const appointmentLink = o.lien_rdv || o.lien_calendar || '';
  const user = Auth.user();
  const showBulkSelect = o.automatisation_active === false;
  const showTestBadge = o.test_requis === true;

  // Hero
  document.getElementById('modal-offre-title').textContent = o.titre_poste;
  document.getElementById('modal-offre-badges').innerHTML = `
    ${offerStatusBadge(o.statut)}
    <span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:rgba(255,255,255,.18);color:white;border:1px solid rgba(255,255,255,.28)">${o.type_contrat}</span>
    ${o.localisation ? `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:rgba(255,255,255,.14);color:rgba(255,255,255,.88);border:1px solid rgba(255,255,255,.22)">📍 ${o.localisation}</span>` : ''}
    ${user?.company !== 'optimum' ? (approved
      ? `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:rgba(187,247,208,.25);color:#bbf7d0;border:1px solid rgba(187,247,208,.35)">${t('offer.badge.inspection_ok')}</span>`
      : `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:rgba(253,230,138,.2);color:#fde68a;border:1px solid rgba(253,230,138,.3)">${t('offer.badge.inspection_pending')}</span>`) : ''}
  `;
  document.getElementById('offre-tab-cands-count').textContent = offerApplications.length;

  // Batch selection tab — visible only if candidates have a batch_justification
  const batchSelected = offerApplications.filter(c => c.batch_justification).sort((a, b) => (b.score || 0) - (a.score || 0));
  const batchBtn = document.getElementById('tab-offre-batch');
  const batchCount = document.getElementById('offre-tab-batch-count');
  if (batchBtn) {
    if (batchSelected.length > 0) {
      batchBtn.style.display = 'flex';
      if (batchCount) batchCount.textContent = batchSelected.length;
    } else {
      batchBtn.style.display = 'none';
    }
  }

  document.getElementById('btn-offre-edit').onclick = () => { closeModal('modal-offre'); editOffer(id); };
  document.getElementById('btn-offre-pdf').onclick  = () => exportOfferPDF(id);
  document.getElementById('btn-offre-newcand').onclick = () => launchNewApplicationForOffer(id);

  // All tab panels
  document.getElementById('modal-offre-body').innerHTML = `

    <!-- ── Tab Info ── -->
    <div class="offre-tab-panel" id="offre-panel-info">
      ${user?.company !== 'optimum' ? `
      <div style="margin-bottom:20px;padding:16px 18px;border-radius:var(--r-lg);border:2px solid ${approved?'#bbf7d0':'#fde68a'};background:${approved?'#f0fdf4':'#fefce8'}">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:26px">${approved?'✅':'⏳'}</span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700;color:${approved?'#166534':'#854d0e'}">${approved?t('offer.inspection.approved'):t('offer.inspection.pending_approval')}</div>
            ${approved && o.approbation_inspection.date_approbation ? `<div style="font-size:11px;color:#166534;margin-top:2px">Le ${formatDate(o.approbation_inspection.date_approbation)}</div>` : ''}
            ${!approved ? `<div style="font-size:11px;color:#92400e;margin-top:2px">${t('offer.inspection.cannot_activate')}</div>` : ''}
          </div>
          ${!approved ? `<button class="btn btn-sm" style="background:#d97706;color:#fff;border:none;flex-shrink:0;font-weight:700" onclick="approveOffer('${o.offre_id}',this)">${t('offer.inspection.btn_approve')}</button>` : ''}
        </div>
        ${o.approbation_inspection?.commentaire ? `<div style="font-size:12px;color:var(--text-2);margin-top:10px;padding:8px 10px;background:rgba(0,0,0,.04);border-radius:6px;font-style:italic">${o.approbation_inspection.commentaire}</div>` : ''}
      </div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
        ${infoChip(t('offer.chip.contract'), o.type_contrat)}
        ${infoChip(t('offer.chip.location'), o.localisation)}
        ${infoChip(t('offer.form.statut'), o.statut)}
        ${o.salaire ? infoChip(t('offer.chip.salary'), o.salaire) : ''}
        ${o.annees_experience ? infoChip(t('offer.chip.experience'), o.annees_experience) : ''}
        ${o.langues_requises ? infoChip(t('offer.form.languages'), o.langues_requises) : ''}
        ${infoChip(t('offer.chip.recruiter'), o.email_recruteur)}
        ${infoChip(t('offer.chip.created_on'), formatDate(o.date_creation))}
        <div style="background:var(--surface-2);border-radius:var(--r);padding:12px 14px;grid-column:1/-1;display:flex;align-items:center;gap:12px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);flex-shrink:0">${t('offer.chip.qualification_mode')}</div>
          ${o.test_requis
            ? `<span class="badge badge-amber" style="font-size:12px;padding:4px 12px">${t('offer.badge.test_c')}</span>`
            : (o.automatisation_active
                ? `<span class="badge badge-blue" style="font-size:12px;padding:4px 12px">${t('offer.badge.auto_a')}</span>`
                : `<span class="badge badge-accent" style="font-size:12px;padding:4px 12px">${t('offer.badge.manual_b')}</span>`)}
        </div>
      </div>

      ${o.missions_principales ? `
      <div style="margin-bottom:16px;padding:16px 18px;background:var(--surface-2);border-radius:var(--r-lg);border-left:3px solid var(--accent)">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--accent);margin-bottom:8px">${t('offer.section.main_missions')}</div>
        <p style="font-size:13px;color:var(--text-2);line-height:1.85;white-space:pre-line">${o.missions_principales}</p>
      </div>` : ''}

      ${o.profil_souhaite ? `
      <div style="margin-bottom:16px;padding:16px 18px;background:#faf5ff;border-radius:var(--r-lg);border-left:3px solid #a78bfa">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7c3aed;margin-bottom:8px">${t('offer.section.desired_profile')}</div>
        <p style="font-size:13px;color:var(--text-2);line-height:1.85;white-space:pre-line">${o.profil_souhaite}</p>
      </div>` : ''}

      ${o.competences_requises ? `
      <div style="margin-bottom:16px;padding:16px 18px;background:#eff6ff;border-radius:var(--r-lg);border-left:3px solid #60a5fa">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#2563eb;margin-bottom:8px">${t('offer.section.qualifications')}</div>
        <p style="font-size:13px;color:var(--text-2);line-height:1.8">${o.competences_requises}</p>
      </div>` : ''}

      ${o.formule_remerciement ? `
      <div style="margin-bottom:16px;padding:14px 16px;background:#f0fdf4;border-radius:var(--r-lg);border:1px solid #bbf7d0">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#166534;margin-bottom:6px">${t('offer.section.thank_you_message')}</div>
        <p style="font-size:12px;color:#166534;font-style:italic;line-height:1.7">${o.formule_remerciement}</p>
      </div>` : ''}

      ${o.statut === 'Active' ? `
      <div style="padding:16px 18px;background:var(--accent-soft);border-radius:var(--r-lg);border:1px solid var(--accent-light)">
        <div style="font-size:11px;font-weight:700;color:var(--accent);margin-bottom:6px">${t('offer.section.public_application_link')}</div>
        <div style="font-size:12px;color:var(--accent-mid);word-break:break-all;margin-bottom:10px;font-family:var(--mono)">${location.origin}/postuler?offre_id=${o.offre_id}</div>
        <button class="btn btn-sm" style="background:var(--accent);color:white;border:none;font-weight:600" onclick="copyOfferLink('${o.offre_id}')">${t('offer.btn.copy_public_link')}</button>
      </div>` : ''}
    </div>

    <!-- ── Tab Candidatures ── -->
    <div class="offre-tab-panel" id="offre-panel-cands" style="display:none">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:10px;flex-wrap:wrap">
        <div style="font-size:14px;font-weight:700;color:var(--text)">${offerApplications.length===1?tf('offer.cand_count_one',offerApplications.length):tf('offer.cand_count_many',offerApplications.length)}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${offerApplications.some(c => c.score != null) ? `<button class="btn btn-sm" style="background:var(--accent-soft);color:var(--accent-mid);border:1.5px solid var(--accent-light);font-weight:700" onclick="openBatchEvalModal('${o.offre_id}')">${t('btn.evaluate_candidates')}</button>` : ''}
          <button class="btn btn-primary btn-sm" onclick="launchNewApplicationForOffer('${o.offre_id}')">${t('btn.new_application')}</button>
        </div>
      </div>

      ${showBulkSelect && offerApplications.length > 0 ? `
      <div id="offre-bulk-bar" style="display:none;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;background:var(--accent-soft);border:1px solid var(--accent-light);border-radius:var(--r-lg);margin-bottom:12px">
        <span id="offre-bulk-count" style="font-size:12px;font-weight:700;color:var(--accent-mid)">0</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-left:auto">
          <button class="btn btn-sm" style="background:#dcfce7;color:#166534;border:1.5px solid #bbf7d0;font-weight:700" onclick="bulkQualify(this)">${t('btn.qualify')}</button>
          <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:1.5px solid #fecaca;font-weight:700" onclick="bulkReject(this)">${t('btn.eliminate')}</button>
          ${showTestBadge ? `<button class="btn btn-sm" style="background:#f5f3ff;color:#7c3aed;border:1.5px solid #ddd6fe;font-weight:700" onclick="bulkConvokeTest(this)">${t('btn.test_summons')}</button>` : ''}
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:8px;padding:6px 14px;margin-bottom:8px">
        <input type="checkbox" id="offre-cands-select-all" onchange="toggleAllCandSelection(this.checked)" style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent)">
        <label for="offre-cands-select-all" style="font-size:12px;color:var(--text-3);cursor:pointer;user-select:none">${t('btn.select_all')}</label>
      </div>` : ''}

      ${offerApplications.length===0 ? `
      <div class="empty-state" style="padding:48px 0">
        <div class="empty-icon">👤</div>
        <p>${t('empty.no_applications')}</p>
      </div>` : `
      <div style="display:flex;flex-direction:column;gap:8px">
        ${offerApplications.map(c=>{
          const isLocked = c.statut === 'Test convoqué' || !c.candidat_email;
          const testConvoque = c.statut === 'Test convoqué';
          return `
        <div onclick="closeModal('modal-offre');window._pendingCandDetail='${c._id}';navigate('candidatures')" style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface-2);border-radius:var(--r-lg);cursor:pointer;border:1px solid var(--border-soft);transition:all var(--transition)" onmouseover="this.style.background='var(--surface-3)';this.style.borderColor='var(--border)'" onmouseout="this.style.background='var(--surface-2)';this.style.borderColor='var(--border-soft)'">
          ${showBulkSelect ? `<input type="checkbox" class="cand-row-checkbox" data-id="${c._id}" ${isLocked?'disabled':''} onclick="event.stopPropagation()" onchange="toggleCandSelection('${c._id}', this.checked)" style="width:16px;height:16px;flex-shrink:0;cursor:${isLocked?'not-allowed':'pointer'};accent-color:var(--accent);opacity:${isLocked?'.45':'1'}">` : ''}
          <div class="avatar" style="width:36px;height:36px;font-size:13px;flex-shrink:0">${initials(c.candidat_nom)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--text)">${c.candidat_nom}</div>
            <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.candidat_email||c.candidat_telephone||'—'}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
            ${channelBadge(c.canal_candidature)}
            ${c.score!=null?`<span style="font-family:var(--mono);font-size:13px;font-weight:700;color:${scoreColor(c.score)}">${c.score}/10</span>`:''}
            ${showTestBadge ? (testConvoque ? `<span class="badge" style="background:#ede9fe;color:#7c3aed;border:1px solid #ddd6fe">${t('offer.badge.test_summoned')}</span>` : `<span class="badge badge-gray">${t('offer.badge.pending_test')}</span>`) : ''}
            ${c.recommandation?renderBadge(c.recommandation):'<span class="badge badge-gray">En attente</span>'}
          </div>
          <svg style="width:14px;height:14px;color:var(--text-3);flex-shrink:0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
        </div>`;}).join('')}
      </div>`}
    </div>

    <!-- ── Tab Calendrier ── -->
    <div class="offre-tab-panel" id="offre-panel-cal" style="display:none">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
        ${calChip(t('offer.form.deadline'), o.date_butoire?formatDate(o.date_butoire):t('offer.calendar.not_set'), !!o.date_butoire)}
        ${calChip(t('offer.calendar.publication_date'), o.date_parution_prevue?formatDate(o.date_parution_prevue):t('offer.calendar.not_set'), !!o.date_parution_prevue)}
        ${calChip(t('offer.calendar.selection_deadline'), o.date_limite_selection?formatDate(o.date_limite_selection):t('offer.calendar.not_set'), !!o.date_limite_selection)}
      </div>

      ${o.test_requis && (o.test_date || o.test_heure || o.test_lieu) ? `
      <div style="padding:18px;background:#faf5ff;border:1px solid #ddd6fe;border-radius:var(--r-lg);margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7c3aed;margin-bottom:14px">${t('offer.section.recruitment_test')}</div>
        <div style="display:flex;gap:24px;flex-wrap:wrap">
          ${o.test_date?`<div><div style="font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${t('offer.test.date')}</div><div style="font-size:15px;font-weight:700">${formatDate(o.test_date)}</div></div>`:''}
          ${o.test_heure?`<div><div style="font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${t('offer.test.time')}</div><div style="font-size:15px;font-weight:700">${o.test_heure}</div></div>`:''}
          ${o.test_lieu?`<div><div style="font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${t('offer.test.location')}</div><div style="font-size:15px;font-weight:700">${o.test_lieu}</div></div>`:''}
        </div>
      </div>` : ''}

      ${appointmentLink ? `
      <div style="padding:16px 18px;background:var(--surface-2);border-radius:var(--r-lg);border:1px solid var(--border-soft)">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);margin-bottom:8px">${t('offer.section.rdv_link')}</div>
        <a href="${appointmentLink}" target="_blank" style="font-size:12px;color:var(--accent-mid);word-break:break-all;display:block;margin-bottom:12px;font-family:var(--mono)">${appointmentLink}</a>
        <a href="${appointmentLink}" target="_blank" class="btn btn-secondary btn-sm">${t('offer.btn.open_calendar')}</a>
      </div>` : `
      <div class="empty-state" style="padding:48px 0">
        <div class="empty-icon">📅</div>
        <p>${t('offer.empty.no_calendar_link')}</p>
        <button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="closeModal('modal-offre');editOffer('${o.offre_id}')">${t('offer.btn.configure_in_offer')}</button>
      </div>`}
    </div>

    <!-- ── Tab Sélection batch ── -->
    <div class="offre-tab-panel" id="offre-panel-batch" style="display:none">
      ${batchSelected.length === 0 ? `
      <div class="empty-state" style="padding:48px 0">
        <div class="empty-icon">🏆</div>
        <p>${t('offer.batch.no_selection')}</p>
        <p style="font-size:12px;color:var(--text-3);margin-top:6px">${t('offer.batch.hint')}</p>
      </div>` : `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${batchSelected.map((c, i) => `
        <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--r-lg);padding:16px;display:flex;gap:14px;align-items:flex-start">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--accent-soft);color:var(--accent-mid);font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">#${i+1}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
              <span style="font-size:14px;font-weight:700;color:var(--text)">${c.candidat_nom}</span>
              ${c.score != null ? `<span style="background:var(--accent-soft);color:var(--accent-mid);border-radius:99px;padding:2px 10px;font-size:12px;font-weight:700">${c.score}/10</span>` : ''}
              <span style="background:#dcfce7;color:#166534;border-radius:99px;padding:2px 10px;font-size:11px;font-weight:700">${t('offer.badge.qualified_caps')}</span>
              ${c.candidat_email ? `<span style="font-size:11px;color:var(--text-3)">${c.candidat_email}</span>` : ''}
            </div>
            <p style="font-size:13px;color:var(--text-2);line-height:1.75;margin:0 0 10px">${c.batch_justification}</p>
            <button onclick="closeModal('modal-offre');navigate('candidature/${c._id}')" style="background:none;border:none;padding:0;font-size:12px;font-weight:700;color:var(--accent-mid);cursor:pointer;text-decoration:underline;text-underline-offset:3px">${t('btn.view_profile')}</button>
          </div>
        </div>`).join('')}
      </div>`}
    </div>
  `;

  switchOffreTab('info');
  modal.style.display = 'flex';
}

function toggleCandSelection(candId, checked) {
  if (checked) _selectedCandidateIds.add(candId);
  else _selectedCandidateIds.delete(candId);
  updateBulkActionBar();
}

function toggleAllCandSelection(checked) {
  document.querySelectorAll('.cand-row-checkbox:not(:disabled)').forEach(cb => {
    cb.checked = checked;
    if (checked) _selectedCandidateIds.add(cb.dataset.id);
    else _selectedCandidateIds.delete(cb.dataset.id);
  });
  updateBulkActionBar();
}

function updateBulkActionBar() {
  const bar = document.getElementById('offre-bulk-bar');
  if (!bar) return;
  const count = _selectedCandidateIds.size;
  bar.style.display = count > 0 ? 'flex' : 'none';
  const counter = document.getElementById('offre-bulk-count');
  if (counter) {
    counter.textContent = count === 1
      ? t('offer.bulk_count_one')
      : tf('offer.bulk_count_many', count);
  }
}

async function _refreshOfferDetailAfterBulk() {
  _selectedCandidateIds.clear();
  await renderOffers();
  if (_currentOfferDetailId) showOfferDetail(_currentOfferDetailId);
}

async function bulkQualify(btn) {
  const ids = [..._selectedCandidateIds];
  if (!ids.length) return;
  if (!confirm(tf('offer.bulk_qualify_confirm', ids.length))) return;

  return withLoading(btn, async () => {
    let ok = 0, fail = 0;
    toast(tf('toast.qualifying_n', ids.length), 'info');
    for (const id of ids) {
      try {
        const patch = await api.patch(`/api/candidatures/${id}`, { recommandation: 'QUALIFIE' });
        if (!patch?.success) { fail++; continue; }
        const mail = await api.post(`/api/candidatures/${id}/envoyer-emails-qualification`, {});
        if (mail?.success) ok++; else fail++;
      } catch { fail++; }
    }
    toast(tf('toast.qualified_ok', ok) + (fail ? ` — ⚠️ ${fail}` : ''), fail ? 'error' : 'success');
    await _refreshOfferDetailAfterBulk();
  });
}

async function bulkReject(btn) {
  const ids = [..._selectedCandidateIds];
  if (!ids.length) return;
  if (!confirm(tf('offer.bulk_reject_confirm', ids.length))) return;

  return withLoading(btn, async () => {
    let ok = 0, fail = 0;
    toast(tf('toast.eliminating_n', ids.length), 'info');
    for (const id of ids) {
      try {
        const patch = await api.patch(`/api/candidatures/${id}`, { recommandation: 'NON_SELECTIONNE' });
        if (!patch?.success) { fail++; continue; }
        const mail = await api.post(`/api/candidatures/${id}/envoyer-email-refus`, {});
        if (mail?.success) ok++; else fail++;
      } catch { fail++; }
    }
    toast(tf('toast.eliminated_ok', ok) + (fail ? ` — ⚠️ ${fail}` : ''), fail ? 'error' : 'success');
    await _refreshOfferDetailAfterBulk();
  });
}

async function bulkConvokeTest(btn) {
  const ids = [..._selectedCandidateIds];
  if (!ids.length) return;
  if (!confirm(tf('offer.bulk_test_confirm', ids.length))) return;

  return withLoading(btn, async () => {
    let ok = 0, fail = 0;
    toast(tf('toast.summoning_n', ids.length), 'info');
    for (const id of ids) {
      try {
        const r = await api.post(`/api/candidatures/${id}/convoquer-test`, {});
        if (r?.success) ok++; else fail++;
      } catch { fail++; }
    }
    toast(tf('toast.summoned_ok', ok) + (fail ? ` — ⚠️ ${fail}` : ''), fail ? 'error' : 'success');
    await _refreshOfferDetailAfterBulk();
  });
}

async function approveOffer(offerId, btn) {
  const comment = prompt(t('offer.approve_comment_prompt'), '') ?? '';
  return withLoading(btn, async () => {
    const r = await api.patch(`/api/offres/${offerId}`, {
      approbation_inspection: { approuvee: true, date_approbation: new Date().toISOString(), commentaire: comment },
    });
    if (r?.success) {
      toast(t('toast.offer_approved'), 'success');
      const idx = _jobOffers.findIndex(o => o.offre_id === offerId);
      if (idx !== -1) _jobOffers[idx] = r.offre;
      showOfferDetail(offerId);
      renderOfferCards(_jobOffers);
    } else {
      toast(r?.error || t('toast.approval_error'), 'error');
    }
  });
}

function editOffer(id) {
  const o = _jobOffers.find(x => x.offre_id === id); if (!o) return;
  openCreateOffer(o);
}

function openCreateOffer(offre = null) {
  document.getElementById('form-offre-title').textContent = offre ? t('offer.form.edit_title') : t('offer.form.new_title');
  document.getElementById('form-offre-id').value = offre?.offre_id || '';

  const textFields = ['titre_poste','missions_principales','profil_souhaite','competences_requises','annees_experience',
    'langues_requises','exigences_ia','type_contrat','localisation','salaire','email_recruteur',
    'statut','lien_rdv','test_heure','test_lieu','formule_remerciement'];
  textFields.forEach(f => {
    const el = document.getElementById('fo-'+f);
    if (el) el.value = offre?.[f] ?? (f === 'statut' ? 'En pause' : '');
  });

  // Compatibility: if lien_rdv empty but lien_calendar is set, pre-fill
  if (offre && !offre.lien_rdv && offre.lien_calendar) {
    const el = document.getElementById('fo-lien_rdv');
    if (el) el.value = offre.lien_calendar;
  }

  // Sync statut select with calendar link state
  syncStatutWithCalendar();

  // Dates
  [['date_butoire','fo-date_butoire'],['date_parution_prevue','fo-date_parution_prevue'],
   ['date_limite_selection','fo-date_limite_selection'],['test_date','fo-test_date']].forEach(([field, elId]) => {
    const el = document.getElementById(elId);
    if (el) el.value = offre?.[field] ? new Date(offre[field]).toISOString().slice(0, 10) : '';
  });

  let scenario = 'A';
  if (offre) {
    if (offre.test_requis) scenario = 'C';
    else if (offre.automatisation_active === false) scenario = 'B';
  }
  setScenario(scenario);

  document.getElementById('modal-create-offre').style.display = 'flex';
}

function setScenario(s) {
  ['A','B','C'].forEach(sc => {
    const card  = document.getElementById('card-scenario-'+sc);
    const radio = card?.querySelector('input[type="radio"]');
    if (!card) return;
    const active = sc === s;
    card.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
    card.style.background  = active ? 'var(--accent-soft,#f0fdf4)' : 'var(--surface)';
    if (radio) radio.checked = active;
  });
  const testSection = document.getElementById('fo-test-section');
  if (testSection) testSection.style.display = s === 'C' ? 'grid' : 'none';
}

async function submitOffer(btn) {
  const id = document.getElementById('form-offre-id').value;
  const data = {};
  ['titre_poste','missions_principales','profil_souhaite','competences_requises','annees_experience','langues_requises',
   'exigences_ia','type_contrat','localisation','salaire','email_recruteur','statut','lien_rdv',
   'test_heure','test_lieu','formule_remerciement'].forEach(f => {
    data[f] = (document.getElementById('fo-'+f)?.value || '').trim();
  });

  // ── Client-side validation before submit ──
  if (!data.titre_poste)   { toast(t('offer.validation.title_required'), 'error'); return; }
  if (!data.localisation)  { toast(t('offer.validation.location_required'), 'error'); return; }
  if (!data.type_contrat)  { toast(t('offer.validation.contract_required'), 'error'); return; }
  if (data.email_recruteur && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email_recruteur)) {
    toast(t('offer.validation.email_invalid'), 'error'); return;
  }

  const scenario = document.querySelector('input[name="fo-scenario"]:checked')?.value || 'A';
  data.test_requis = scenario === 'C';
  data.automatisation_active = scenario === 'A';

  ['date_butoire','date_parution_prevue','date_limite_selection','test_date'].forEach(f => {
    const val = document.getElementById('fo-'+f)?.value;
    data[f] = val || null;
  });

  return withLoading(btn, async () => {
    let r;
    if (id) r = await api.patch(`/api/offres/${id}`, data);
    else { data.offre_id = Date.now().toString(); r = await api.post('/api/offres', data); }

    if (r?.success) {
      toast(id ? t('toast.offer_updated') : t('toast.offer_created'), 'success');
      closeModal('modal-create-offre');
      renderOffers();
      if (!id) loadCounts();
    } else {
      toast(r?.error || t('toast.error'), 'error');
    }
  });
}

function infoChip(label, value) {
  return `<div style="background:var(--surface-2);border-radius:var(--r);padding:12px 14px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:4px">${label}</div><div style="font-size:13px;font-weight:600;color:var(--text)">${value}</div></div>`;
}

function calChip(label, value, active) {
  return `<div style="background:${active?'var(--accent-soft)':'var(--surface-2)'};border-radius:var(--r-lg);padding:16px;border:1px solid ${active?'var(--accent-light)':'var(--border-soft)'}"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:${active?'var(--accent)':'var(--text-3)'};margin-bottom:6px;font-weight:700">${label}</div><div style="font-size:14px;font-weight:700;color:${active?'var(--accent-mid)':'var(--text-3)'}">${value}</div></div>`;
}

function switchOffreTab(tab) {
  document.querySelectorAll('.offre-tab-panel').forEach(p => p.style.display = 'none');
  ['info','cands','cal','batch'].forEach(t => {
    const btn = document.getElementById('tab-offre-'+t);
    if (btn) { btn.style.color = 'var(--text-3)'; btn.style.borderBottomColor = 'transparent'; }
  });
  const panel = document.getElementById('offre-panel-'+tab);
  if (panel) panel.style.display = 'block';
  const activeBtn = document.getElementById('tab-offre-'+tab);
  if (activeBtn) { activeBtn.style.color = 'var(--accent)'; activeBtn.style.borderBottomColor = 'var(--accent)'; }
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function offerModalHTML() {
  return `
  <!-- ── Job offer DETAIL modal ── -->
  <div id="modal-offre" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:100;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)" onclick="if(event.target===this)closeModal('modal-offre')">
    <div class="modal-card" style="background:var(--surface);border-radius:var(--r-2xl);width:100%;max-width:680px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 32px 80px rgba(15,23,42,.28);overflow:hidden;animation:scaleIn .22s cubic-bezier(.22,1,.36,1) both">

      <!-- Gradient hero header -->
      <div style="background:linear-gradient(135deg,var(--grad-start) 0%,var(--grad-end) 100%);padding:26px 28px 20px;position:relative;flex-shrink:0;overflow:hidden">
        <div style="position:absolute;top:-50px;right:-50px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.08);pointer-events:none"></div>
        <div style="position:absolute;bottom:-70px;left:-30px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.05);pointer-events:none"></div>
        <button onclick="closeModal('modal-offre')" class="btn-modal-close" style="position:absolute;top:16px;right:16px">✕</button>
        <div style="position:relative;z-index:1">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.6);margin-bottom:8px">${t('offer.modal.job_offer')}</div>
          <div style="font-size:20px;font-weight:800;color:white;letter-spacing:-.02em;line-height:1.25;margin-bottom:12px;padding-right:44px" id="modal-offre-title"></div>
          <div id="modal-offre-badges" style="display:flex;flex-wrap:wrap;gap:6px"></div>
        </div>
      </div>

      <!-- Tab bar -->
      <div style="display:flex;border-bottom:2px solid var(--border-soft);background:var(--surface);padding:0 20px;flex-shrink:0;overflow-x:auto">
        <button id="tab-offre-info" onclick="switchOffreTab('info')" style="padding:13px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:var(--accent);border-bottom:2px solid var(--accent);margin-bottom:-2px;white-space:nowrap;outline:none;transition:color .15s">${t('offer.tab.info')}</button>
        <button id="tab-offre-cands" onclick="switchOffreTab('cands')" style="padding:13px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:var(--text-3);border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap;outline:none;transition:color .15s;display:flex;align-items:center;gap:6px">${t('offer.tab.candidates')} <span id="offre-tab-cands-count" style="background:var(--surface-3);border-radius:99px;padding:1px 8px;font-size:11px"></span></button>
        <button id="tab-offre-cal" onclick="switchOffreTab('cal')" style="padding:13px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:var(--text-3);border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap;outline:none;transition:color .15s">${t('offer.tab.calendar')}</button>
        <button id="tab-offre-batch" onclick="switchOffreTab('batch')" style="display:none;padding:13px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:var(--text-3);border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap;outline:none;transition:color .15s;align-items:center;gap:6px">${t('offer.tab.selection')} <span id="offre-tab-batch-count" style="background:var(--accent-soft);color:var(--accent-mid);border-radius:99px;padding:1px 8px;font-size:11px;font-weight:700"></span></button>
      </div>

      <!-- Scrollable body -->
      <div id="modal-offre-body" style="padding:24px;overflow-y:auto;flex:1"></div>

      <!-- Footer actions -->
      <div style="padding:14px 24px;border-top:1px solid var(--border-soft);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;background:var(--surface-2)">
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="btn-offre-edit">✏️ ${t('btn.edit')}</button>
          <button class="btn btn-secondary btn-sm" id="btn-offre-pdf">📄 ${t('btn.export_pdf')}</button>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-offre-newcand">+ ${t('btn.new_application')}</button>
      </div>
    </div>
  </div>

  <!-- ── Create/edit job offer modal ── -->
  <div id="modal-create-offre" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:100;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)" onclick="if(event.target===this)closeModal('modal-create-offre')">
    <div class="modal-card" style="background:var(--surface);border-radius:var(--r-2xl);width:100%;max-width:720px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 32px 80px rgba(15,23,42,.28);overflow:hidden;animation:scaleIn .22s cubic-bezier(.22,1,.36,1) both">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,var(--surface-2),var(--surface));padding:22px 28px;border-bottom:1px solid var(--border-soft);display:flex;align-items:center;gap:16px;flex-shrink:0">
        <div style="width:44px;height:44px;background:linear-gradient(135deg,var(--grad-start),var(--grad-end));border-radius:var(--r-lg);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;box-shadow:0 4px 14px var(--accent-glow)">💼</div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:800;color:var(--text);letter-spacing:-.01em" id="form-offre-title">${t('offer.form.new_title')}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:1px">${t('offer.form.subtitle')}</div>
        </div>
        <button class="btn-icon" onclick="closeModal('modal-create-offre')" style="flex-shrink:0">✕</button>
      </div>

      <!-- Form body -->
      <div style="padding:24px 28px;overflow-y:auto;flex:1">
        <input type="hidden" id="form-offre-id">

        <!-- Section: Poste -->
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);margin-bottom:14px;display:flex;align-items:center;gap:8px">
          <span style="background:var(--accent);color:white;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px">1</span> ${t('offer.form.section_info')}
        </div>
        <div class="form-grid" style="margin-bottom:24px">
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">${t('offer.form.title')} <span class="req">*</span></label>
            <input class="form-control" id="fo-titre_poste" placeholder="${t('offer.form.title_placeholder')}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('offer.form.contract')} <span class="req">*</span></label>
            <select class="form-control" id="fo-type_contrat"><option value="">—</option><option>CDI</option><option>CDD</option><option>Stage</option><option>Freelance</option><option>Alternance</option></select>
          </div>
          <div class="form-group">
            <label class="form-label">${t('offer.form.location')} <span class="req">*</span></label>
            <input class="form-control" id="fo-localisation" placeholder="${LANG === 'en' ? 'E.g. Antananarivo, Remote…' : 'Ex: Antananarivo, Télétravail…'}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('offer.form.experience')}</label>
            <input class="form-control" id="fo-annees_experience" placeholder="${t('offer.form.experience_placeholder')}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('offer.form.salary')}</label>
            <input class="form-control" id="fo-salaire" placeholder="${t('offer.form.salary_placeholder')}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('offer.form.languages')}</label>
            <input class="form-control" id="fo-langues_requises" placeholder="${t('offer.form.languages_placeholder')}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('offer.form.recruiter_email')} <span class="req">*</span></label>
            <input class="form-control" id="fo-email_recruteur" type="email" placeholder="rh@solumada.mg">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">${t('offer.form.missions')} <span class="req">*</span></label>
            <textarea class="form-control" id="fo-missions_principales" rows="3" placeholder="${LANG === 'en' ? 'Key responsibilities, main tasks…' : 'Responsabilités, missions clés…'}"></textarea>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">${t('offer.form.profile')}</label>
            <textarea class="form-control" id="fo-profil_souhaite" rows="2" placeholder="${LANG === 'en' ? 'Education, qualities, expected experience…' : 'Formation, qualités, expérience attendue…'}"></textarea>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">${t('offer.form.skills')} <span class="req">*</span></label>
            <textarea class="form-control" id="fo-competences_requises" rows="2" placeholder="${LANG === 'en' ? 'E.g. CS degree, React, 3 years…' : 'Ex: Licence en informatique, React, 3 ans…'}"></textarea>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label" style="color:var(--accent-mid)">🤖 ${t('offer.form.ai_prompt')}</label>
            <textarea class="form-control" id="fo-exigences_ia" rows="2" placeholder="${LANG === 'en' ? 'E.g. Docker mandatory, management required…' : 'Ex: Docker éliminatoire, management obligatoire…'}" style="border-color:var(--accent-light)"></textarea>
          </div>
        </div>

        <!-- Section: Calendrier -->
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);margin-bottom:14px;display:flex;align-items:center;gap:8px">
          <span style="background:var(--accent);color:white;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px">2</span> ${t('offer.form.section_calendar')}
        </div>
        <div style="padding:16px 18px;background:var(--surface-2);border-radius:var(--r-lg);border:1px solid var(--border-soft);margin-bottom:24px">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div class="form-group" style="margin:0">
              <label class="form-label">${t('offer.form.deadline')}</label>
              <input class="form-control" type="date" id="fo-date_butoire">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">${t('offer.form.publish_date')}</label>
              <input class="form-control" type="date" id="fo-date_parution_prevue">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">${t('offer.form.limit')}</label>
              <input class="form-control" type="date" id="fo-date_limite_selection">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group" style="margin:0">
              <label class="form-label">${t('offer.form.statut')}</label>
              <select class="form-control" id="fo-statut">
                <option value="En pause">${t('status.paused')}</option>
                <option value="Active" id="fo-statut-active">${t('status.active')}</option>
                <option value="Fermée">${t('status.closed')}</option>
              </select>
              <div id="fo-statut-hint" style="display:none;font-size:11px;color:#d97706;margin-top:4px;font-weight:500">${t('offer.form.rdv_required_hint')}</div>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">${t('offer.section.rdv_link')}</label>
              <input class="form-control" id="fo-lien_rdv" placeholder="https://cal.com/..." oninput="syncStatutWithCalendar()">
            </div>
          </div>
        </div>

        <!-- Section: Mode de qualification -->
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);margin-bottom:14px;display:flex;align-items:center;gap:8px">
          <span style="background:var(--accent);color:white;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px">3</span> ${t('offer.form.section_qualification')}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
          <div id="card-scenario-A" onclick="setScenario('A')" style="cursor:pointer;border:2px solid var(--accent);background:var(--accent-soft);border-radius:var(--r-lg);padding:16px;transition:.15s;display:flex;flex-direction:column;gap:6px">
            <input type="radio" name="fo-scenario" value="A" checked style="display:none">
            <div style="font-size:22px">🤖</div>
            <div style="font-size:12px;font-weight:700;color:var(--text)">${LANG==='en'?'Scenario A':'Scénario A'}</div>
            <div style="font-size:11px;color:var(--text-3);line-height:1.5">${t('offer.form.scenario_a_desc')}</div>
          </div>
          <div id="card-scenario-B" onclick="setScenario('B')" style="cursor:pointer;border:2px solid var(--border);background:var(--surface);border-radius:var(--r-lg);padding:16px;transition:.15s;display:flex;flex-direction:column;gap:6px">
            <input type="radio" name="fo-scenario" value="B" style="display:none">
            <div style="font-size:22px">👤</div>
            <div style="font-size:12px;font-weight:700;color:var(--text)">${LANG==='en'?'Scenario B':'Scénario B'}</div>
            <div style="font-size:11px;color:var(--text-3);line-height:1.5">${t('offer.form.scenario_b_desc')}</div>
          </div>
          <div id="card-scenario-C" onclick="setScenario('C')" style="cursor:pointer;border:2px solid var(--border);background:var(--surface);border-radius:var(--r-lg);padding:16px;transition:.15s;display:flex;flex-direction:column;gap:6px">
            <input type="radio" name="fo-scenario" value="C" style="display:none">
            <div style="font-size:22px">📋</div>
            <div style="font-size:12px;font-weight:700;color:var(--text)">${LANG==='en'?'Scenario C':'Scénario C'}</div>
            <div style="font-size:11px;color:var(--text-3);line-height:1.5">${t('offer.form.scenario_c_desc')}</div>
          </div>
        </div>

        <!-- Test details (shown only if scenario C) -->
        <div id="fo-test-section" style="display:none;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:16px 18px;background:#faf5ff;border-radius:var(--r-lg);border:1px solid #ddd6fe;margin-bottom:16px">
          <div class="form-group" style="margin:0">
            <label class="form-label" style="color:#7c3aed">${t('offer.form.test_date')}</label>
            <input class="form-control" type="date" id="fo-test_date">
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" style="color:#7c3aed">${t('offer.form.test_time')}</label>
            <input class="form-control" id="fo-test_heure" placeholder="Ex: 09h00">
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" style="color:#7c3aed">${t('offer.form.test_location')}</label>
            <input class="form-control" id="fo-test_lieu" placeholder="${LANG==='en'?'E.g. HQ Antananarivo':'Ex: Siège Antananarivo'}">
          </div>
        </div>

        <!-- Section: Remerciement -->
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">${t('offer.form.thank_you_label')}</label>
          <textarea class="form-control" id="fo-formule_remerciement" rows="2" maxlength="400" placeholder="${LANG==='en'?'E.g. Thank you for your interest in our company…':'Ex: Nous vous remercions de l\'intérêt porté à notre entreprise…'}" oninput="updateCharCount(this, 400)"></textarea>
          <p id="fo-formule_remerciement-count" style="font-size:11px;color:var(--text-3);margin:4px 0 0;text-align:right">0 / 400</p>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:16px 28px;border-top:1px solid var(--border-soft);display:flex;justify-content:flex-end;gap:10px;background:var(--surface-2);flex-shrink:0">
        <button class="btn btn-secondary" onclick="closeModal('modal-create-offre')">${t('btn.cancel')}</button>
        <button class="btn btn-primary" onclick="submitOffer(this)">${t('offer.form.btn_save')}</button>
      </div>
    </div>
  </div>`;
}

function updateCharCount(el, max) {
  const countEl = document.getElementById(el.id + '-count');
  if (countEl) countEl.textContent = `${el.value.length} / ${max}`;
}

function exportOfferPDF(offerId) {
  const o = _jobOffers.find(x => x.offre_id === offerId);
  if (!o) { toast(t('toast.offer_not_found'), 'error'); return; }
  const cfg      = COMPANY_CONFIG[o.company] || COMPANY_CONFIG.solumada;
  const isOpt    = o.company === 'optimum';
  const accent   = isOpt ? '#62A5D2' : '#3E9143';
  const accentDk = isOpt ? '#4a8ab8' : '#2d7a33';
  const accentBg = isOpt ? '#eff6ff' : '#f0fdf4';
  const accentBd = isOpt ? '#bfdbfe' : '#bbf7d0';
  const win = window.open('', '_blank');
  if (!win) { toast(t('toast.allow_popups'), 'error'); return; }
  win.document.write(buildPdfHtml(o, cfg.logo, cfg.name, accent, accentDk, accentBg, accentBd));
  win.document.close();
}

function buildPdfHtml(o, logoUrl, companyName, accent, accentDk, accentBg, accentBd) {
  const today   = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const IMG_URL = 'https://images.unsplash.com/photo-1521737852567-6949f3f9f2b5?auto=format&fit=crop&w=1400&q=80';

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function pdfList(str) {
    if (!str?.trim()) return '<p style="color:#94a3b8;font-style:italic;margin:0;font-size:12px">Non renseigne</p>';
    const lines = str.split('\n').map(s => s.replace(/^[•\-–]\s*/, '').trim()).filter(Boolean);
    if (lines.length <= 1) return '<p style="margin:0;line-height:1.72;color:#475569;font-size:12.5px">' + esc(str) + '</p>';
    return '<ul style="margin:0;padding-left:18px;color:#475569;line-height:1.72;font-size:12.5px">' +
      lines.map(l => '<li style="margin-bottom:3px">' + esc(l) + '</li>').join('') + '</ul>';
  }

  const hasMissions    = !!o.missions_principales?.trim();
  const hasProfil      = !!o.profil_souhaite?.trim();
  const hasCompetences = !!o.competences_requises?.trim();

  function section(bg, borderColor, titleColor, titleLabel, body) {
    return '<div style="padding:16px 18px;background:' + bg + ';border-radius:10px;border-left:4px solid ' + borderColor +
      ';-webkit-print-color-adjust:exact;print-color-adjust:exact">' +
      '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:' +
      titleColor + ';margin-bottom:10px">' + titleLabel + '</div>' + body + '</div>';
  }

  // Content grid
  let contentHtml = '';

  if (hasMissions && hasProfil) {
    contentHtml +=
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">' +
      section('#f0fdf4', accent, accent, 'Missions principales', pdfList(o.missions_principales)) +
      section('#faf5ff', '#a78bfa', '#7c3aed', 'Profil recherché', pdfList(o.profil_souhaite)) +
      '</div>';
  } else {
    if (hasMissions) contentHtml += '<div style="margin-bottom:16px">' +
      section('#f0fdf4', accent, accent, 'Missions principales', pdfList(o.missions_principales)) + '</div>';
    if (hasProfil) contentHtml += '<div style="margin-bottom:16px">' +
      section('#faf5ff', '#a78bfa', '#7c3aed', 'Profil recherché', pdfList(o.profil_souhaite)) + '</div>';
  }

  if (hasCompetences) contentHtml += '<div style="margin-bottom:16px">' +
    section('#eff6ff', '#60a5fa', '#2563eb', 'Diplômes & compétences requis', pdfList(o.competences_requises)) + '</div>';

  // Chips for the hero
  const chipData = [
    o.type_contrat      ? o.type_contrat           : null,
    o.localisation      ? '\u{1F4CD} ' + o.localisation      : null,
    o.annees_experience ? '\u{1F557} ' + o.annees_experience : null,
    o.langues_requises  ? '\u{1F30D} ' + o.langues_requises  : null,
  ].filter(Boolean);

  const chipsHtml = chipData.map(t =>
    '<span style="display:inline-block;background:rgba(255,255,255,.22);border:1.5px solid rgba(255,255,255,.45);' +
    'color:white;border-radius:22px;padding:5px 14px;font-size:12px;font-weight:700;margin:4px 6px 4px 0">' + esc(t) + '</span>'
  ).join('');

  // Footer info items
  const footerItems = [
    o.salaire         ? { label: 'Rémunération',  val: esc(o.salaire) }             : null,
    o.date_butoire    ? { label: 'Date limite',   val: formatDate(o.date_butoire) } : null,
    o.email_recruteur ? { label: 'Postuler à',    val: esc(o.email_recruteur) }     : null,
  ].filter(Boolean);

  const footerHtml = footerItems.length === 0 ? '' :
    '<div style="background:#f8fafc;border-top:2px solid ' + accentBd + ';padding:14px 36px;display:flex;' +
    '-webkit-print-color-adjust:exact;print-color-adjust:exact">' +
    footerItems.map((item, i) =>
      '<div style="flex:1;padding:0 18px;' + (i === 0 ? 'padding-left:0;' : '') +
      (i < footerItems.length - 1 ? 'border-right:1px solid #e2e8f0;' : '') + '">' +
      '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.09em;color:#94a3b8;font-weight:800;margin-bottom:5px">' + item.label + '</div>' +
      '<div style="font-size:14px;font-weight:800;color:#1e293b">' + item.val + '</div></div>'
    ).join('') + '</div>';

  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">' +
    '<title>' + esc(o.titre_poste) + ' — ' + esc(companyName) + '</title>' +
    '<style>' +
    '@page{size:A4;margin:0}' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{font-family:\'Segoe UI\',Arial,sans-serif;background:#fff;color:#1e293b;width:210mm}' +
    '@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}' +
    '</style></head>' +
    '<body onload="setTimeout(print,500)">' +

    // ── Header bande ──
    '<div style="background:linear-gradient(135deg,' + accent + ' 0%,' + accentDk + ' 100%);' +
    'color:white;padding:22px 36px;display:flex;align-items:center;justify-content:space-between;' +
    '-webkit-print-color-adjust:exact;print-color-adjust:exact">' +
      '<div style="display:flex;align-items:center;gap:14px">' +
        '<img src="' + esc(logoUrl) + '" alt="' + esc(companyName) + '" ' +
        'style="height:38px;object-fit:contain;filter:brightness(0) invert(1)" onerror="this.style.display=\'none\'">' +
        '<div>' +
          '<div style="font-size:16px;font-weight:800;letter-spacing:-.02em">' + esc(companyName) + '</div>' +
          '<div style="font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:.14em;margin-top:1px">Offre d\'emploi</div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:11px;opacity:.75">Publiée le ' + today + '</div>' +
    '</div>' +

    // ── HERO : image + overlay + déco + titre + chips ──
    '<div style="position:relative;background-color:' + accentDk + ';' +
    'background-image:url(\'' + IMG_URL + '\');background-size:cover;background-position:center 30%;' +
    'padding:40px 40px 32px;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact">' +

      // Overlay gradient
      '<div style="position:absolute;inset:0;background:linear-gradient(120deg,' + accentDk + 'ee 0%,' + accent + 'cc 60%,rgba(0,0,0,.5) 100%);' +
      '-webkit-print-color-adjust:exact;print-color-adjust:exact"></div>' +

      // Cercle décoratif 1
      '<div style="position:absolute;top:-70px;right:-60px;width:280px;height:280px;border-radius:50%;' +
      'background:rgba(255,255,255,.07);-webkit-print-color-adjust:exact;print-color-adjust:exact"></div>' +

      // Cercle décoratif 2
      '<div style="position:absolute;bottom:-90px;right:100px;width:220px;height:220px;border-radius:50%;' +
      'background:rgba(255,255,255,.05);-webkit-print-color-adjust:exact;print-color-adjust:exact"></div>' +

      // Cercle décoratif 3 (accent glow)
      '<div style="position:absolute;top:10px;left:320px;width:120px;height:120px;border-radius:50%;' +
      'background:rgba(255,255,255,.06);-webkit-print-color-adjust:exact;print-color-adjust:exact"></div>' +

      // Contenu hero
      '<div style="position:relative;z-index:1">' +
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.18em;' +
        'color:rgba(255,255,255,.6);margin-bottom:12px">Poste à pourvoir</div>' +
        '<div style="font-size:32px;font-weight:900;color:white;letter-spacing:-.03em;line-height:1.15;' +
        'margin-bottom:18px;text-shadow:0 2px 12px rgba(0,0,0,.3)">' + esc(o.titre_poste) + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:0">' + chipsHtml + '</div>' +
      '</div>' +

    '</div>' +

    // ── Content area ──
    '<div style="padding:28px 36px 20px">' + contentHtml + '</div>' +

    // ── Footer bar ──
    footerHtml +

    '<div style="text-align:center;padding:8px 36px;font-size:10px;color:#cbd5e1;border-top:1px solid #f1f5f9">' +
      esc(companyName) + ' — Document généré le ' + today +
    '</div>' +

    '</body></html>';
}

// ── Batch candidate evaluation ──────────────────────────────────────────────

function batchEvalModalHTML() {
  return `<div id="modal-batch-eval" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:110;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)" onclick="if(event.target===this)document.getElementById('modal-batch-eval').style.display='none'">
  <div style="background:var(--surface);border-radius:var(--r-2xl);width:100%;max-width:460px;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);overflow:hidden">
    <div style="background:linear-gradient(135deg,var(--grad-start) 0%,var(--grad-end) 100%);padding:22px 24px;display:flex;align-items:center;gap:14px">
      <div style="width:42px;height:42px;background:rgba(255,255,255,.2);border-radius:var(--r-lg);display:flex;align-items:center;justify-content:center;font-size:20px">🏆</div>
      <div style="flex:1">
        <div style="font-size:15px;font-weight:800;color:white">${t('btn.evaluate_candidates')}</div>
        <div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:2px" id="batch-eval-subtitle">${t('offer.batch_eval.subtitle')}</div>
      </div>
      <button onclick="document.getElementById('modal-batch-eval').style.display='none'" class="btn-modal-close">✕</button>
    </div>
    <div style="padding:24px">
      <div style="margin-bottom:20px;padding:14px 16px;background:var(--accent-soft);border-radius:var(--r-lg);border:1px solid var(--accent-light);font-size:13px;color:var(--accent-mid);line-height:1.6">
        ${t('offer.batch.modal_description')}
      </div>
      <div class="form-group" style="margin-bottom:20px">
        <label class="form-label">${t('offer.batch.count_label')}</label>
        <input type="number" id="batch-nb-top" value="20" min="1" max="200" class="form-control" style="text-align:center;font-size:22px;font-weight:700" placeholder="Ex : 20">
      </div>
      <div style="font-size:11px;color:var(--text-3);padding:10px 12px;background:var(--surface-2);border-radius:var(--r);border:1px solid var(--border)">
        ${t('offer.batch.modal_hint')}
      </div>
    </div>
    <div style="padding:14px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px;background:var(--surface-2)">
      <button class="btn btn-secondary" onclick="document.getElementById('modal-batch-eval').style.display='none'">${t('btn.cancel')}</button>
      <button class="btn btn-primary" id="btn-batch-eval-confirm" onclick="confirmBatchEval(this)">${t('offer.batch.btn_launch')}</button>
    </div>
  </div>
</div>`;
}

let _batchEvalOfferId = null;

function openBatchEvalModal(offerId) {
  _batchEvalOfferId = offerId;
  const o = _jobOffers.find(x => x.offre_id === offerId);
  const apps = _offerApplications[offerId] || [];
  const analyzedCount = apps.filter(c => c.score != null).length;
  const subtitle = document.getElementById('batch-eval-subtitle');
  if (subtitle) subtitle.textContent = LANG === 'en'
    ? `${analyzedCount} candidate${analyzedCount !== 1 ? 's' : ''} analyzed — ${o?.titre_poste || offerId}`
    : `${analyzedCount} candidat${analyzedCount !== 1 ? 's' : ''} analysé${analyzedCount !== 1 ? 's' : ''} — ${o?.titre_poste || offerId}`;
  const input = document.getElementById('batch-nb-top');
  if (input) input.value = 20;
  document.getElementById('modal-batch-eval').style.display = 'flex';
}

async function confirmBatchEval(btn) {
  const nb_top = parseInt(document.getElementById('batch-nb-top')?.value, 10);
  if (!nb_top || nb_top < 1) { toast(t('toast.enter_valid_number'), 'error'); return; }
  if (!_batchEvalOfferId) return;

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = LANG === 'en' ? '⏳ Sending…' : '⏳ Envoi…';

  try {
    const r = await api.post(`/api/offres/${_batchEvalOfferId}/evaluer-candidats`, { nb_top });
    if (r?.success) {
      document.getElementById('modal-batch-eval').style.display = 'none';
      toast(`⏳ ${r.message}`, 'info');
    } else {
      toast(r?.error || t('toast.trigger_error'), 'error');
    }
  } catch (e) {
    toast(t('toast.network_error'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}
