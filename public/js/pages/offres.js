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
  el.innerHTML = `
  <div class="filters-bar">
    <input class="filter-input" id="q-offres" placeholder="🔍 Rechercher…" oninput="filterOffers()">
    <select class="filter-select" id="f-statut" onchange="filterOffers()">
      <option value="">Tous statuts</option>
      <option>Active</option><option>Fermée</option><option>En pause</option>
    </select>
    <select class="filter-select" id="f-contrat" onchange="filterOffers()">
      <option value="">Tous contrats</option>
      <option>CDI</option><option>CDD</option><option>Stage</option><option>Freelance</option><option>Alternance</option>
    </select>
  </div>
  <div id="offres-list"></div>
  ${offerModalHTML()}`;
  renderOfferCards(offers);
}

function renderOfferCards(offers) {
  const el = document.getElementById('offres-list');
  if (!offers.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>Aucune offre trouvée</p><button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="openCreateOffer()">+ Créer une offre</button></div>`;
    return;
  }
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">${offers.map(o => {
    const offerApplications = _offerApplications[o.offre_id] || [];
    const qualifiedCount    = offerApplications.filter(c=>c.recommandation==='QUALIFIE').length;
    const approved = o.approbation_inspection?.approuvee;
    return `<div class="offre-card" onclick="showOfferDetail('${o.offre_id}')">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <span style="font-size:15px;font-weight:700;color:var(--text)">${o.titre_poste}</span>
          ${offerStatusBadge(o.statut)}
          <span class="badge badge-gray">${o.type_contrat}</span>
          ${Auth.user()?.company !== 'optimum' ? (approved ? '<span class="badge badge-green" style="font-size:10px">✓ Inspection</span>' : '<span class="badge badge-amber" style="font-size:10px">⏳ En attente inspection</span>') : ''}
          ${o.automatisation_active ? '<span class="badge badge-blue" style="font-size:10px">🤖 Auto</span>' : ''}
        </div>
        <div class="offre-meta">
          <span>📍 ${o.localisation}</span>
          ${o.salaire ? `<span>💰 ${o.salaire}</span>` : ''}
          <span>🕐 ${formatDate(o.date_creation)}</span>
          <span>✉️ ${o.email_recruteur}</span>
          ${o.date_parution_prevue ? `<span>📢 Parution : ${formatDate(o.date_parution_prevue)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:20px;align-items:center;flex-shrink:0">
        <div class="offre-count"><div class="offre-count-val">${offerApplications.length}</div><div class="offre-count-lbl">Candidats</div></div>
        <div class="offre-count"><div class="offre-count-val" style="color:var(--accent-mid)">${qualifiedCount}</div><div class="offre-count-lbl">Qualifiés</div></div>
        <div style="display:flex;gap:6px">
          ${o.statut === 'Active' ? `<button class="btn-icon" title="Copier le lien" onclick="event.stopPropagation();copyOfferLink('${o.offre_id}')">🔗</button>` : ''}
          <button class="btn-icon" title="Cloner l'offre" onclick="event.stopPropagation();cloneOffer('${o.offre_id}')">⧉</button>
          <button class="btn-icon" title="Modifier" onclick="event.stopPropagation();editOffer('${o.offre_id}')">✏️</button>
          <button class="btn-icon" title="Exporter PDF" onclick="event.stopPropagation();exportOfferPDF('${o.offre_id}')">📄</button>
          <button class="btn-icon" title="Supprimer" onclick="event.stopPropagation();deleteOffer('${o.offre_id}',this)">🗑️</button>
        </div>
        <svg style="width:16px;height:16px;color:var(--text-3)" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function filterOffers() {
  const q = document.getElementById('q-offres')?.value.toLowerCase() || '';
  const s = document.getElementById('f-statut')?.value || '';
  const c = document.getElementById('f-contrat')?.value || '';
  let results = _jobOffers;
  if (q) results = results.filter(o => o.titre_poste.toLowerCase().includes(q) || o.localisation.toLowerCase().includes(q));
  if (s) results = results.filter(o => o.statut === s);
  if (c) results = results.filter(o => o.type_contrat === c);
  renderOfferCards(results);
}

function copyOfferLink(id) { copyText(`${location.origin}/postuler?offre_id=${id}`, '🔗 Lien copié !'); }

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
  if (!confirm('Supprimer cette offre et toutes ses candidatures ?')) return;
  return withLoading(btn, async () => {
    const r = await api.delete(`/api/offres/${id}`);
    if (r?.success) { toast('Offre supprimée', 'success'); renderOffers(); }
    else toast(r?.error || 'Erreur', 'error');
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
      ? '<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:rgba(187,247,208,.25);color:#bbf7d0;border:1px solid rgba(187,247,208,.35)">✓ Inspection OK</span>'
      : '<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:rgba(253,230,138,.2);color:#fde68a;border:1px solid rgba(253,230,138,.3)">⏳ Inspection en attente</span>') : ''}
  `;
  document.getElementById('offre-tab-cands-count').textContent = offerApplications.length;
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
            <div style="font-size:13px;font-weight:700;color:${approved?'#166534':'#854d0e'}">${approved?"Approuvée par l'Inspection du Travail":"En attente d'approbation — Inspection du Travail"}</div>
            ${approved && o.approbation_inspection.date_approbation ? `<div style="font-size:11px;color:#166534;margin-top:2px">Le ${formatDate(o.approbation_inspection.date_approbation)}</div>` : ''}
            ${!approved ? `<div style="font-size:11px;color:#92400e;margin-top:2px">L'offre ne peut pas être activée sans cette approbation.</div>` : ''}
          </div>
          ${!approved ? `<button class="btn btn-sm" style="background:#d97706;color:#fff;border:none;flex-shrink:0;font-weight:700" onclick="approveOffer('${o.offre_id}',this)">Approuver</button>` : ''}
        </div>
        ${o.approbation_inspection?.commentaire ? `<div style="font-size:12px;color:var(--text-2);margin-top:10px;padding:8px 10px;background:rgba(0,0,0,.04);border-radius:6px;font-style:italic">${o.approbation_inspection.commentaire}</div>` : ''}
      </div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
        ${infoChip('📄 Contrat', o.type_contrat)}
        ${infoChip('📍 Localisation', o.localisation)}
        ${infoChip('🔵 Statut', o.statut)}
        ${o.salaire ? infoChip('💰 Salaire', o.salaire) : ''}
        ${o.annees_experience ? infoChip('🕐 Expérience', o.annees_experience) : ''}
        ${o.langues_requises ? infoChip('🌍 Langues', o.langues_requises) : ''}
        ${infoChip('✉️ Recruteur', o.email_recruteur)}
        ${infoChip('📅 Créée le', formatDate(o.date_creation))}
        <div style="background:var(--surface-2);border-radius:var(--r);padding:12px 14px;grid-column:1/-1;display:flex;align-items:center;gap:12px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);flex-shrink:0">Mode qualification</div>
          ${o.test_requis
            ? '<span class="badge badge-amber" style="font-size:12px;padding:4px 12px">📋 C — Test requis + manuel</span>'
            : (o.automatisation_active
                ? '<span class="badge badge-blue" style="font-size:12px;padding:4px 12px">🤖 A — IA + emails auto</span>'
                : '<span class="badge badge-accent" style="font-size:12px;padding:4px 12px">👤 B — IA + manuel</span>')}
        </div>
      </div>

      ${o.missions_principales ? `
      <div style="margin-bottom:16px;padding:16px 18px;background:var(--surface-2);border-radius:var(--r-lg);border-left:3px solid var(--accent)">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--accent);margin-bottom:8px">📋 Missions principales</div>
        <p style="font-size:13px;color:var(--text-2);line-height:1.85;white-space:pre-line">${o.missions_principales}</p>
      </div>` : ''}

      ${o.profil_souhaite ? `
      <div style="margin-bottom:16px;padding:16px 18px;background:#faf5ff;border-radius:var(--r-lg);border-left:3px solid #a78bfa">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7c3aed;margin-bottom:8px">🎯 Profil souhaité</div>
        <p style="font-size:13px;color:var(--text-2);line-height:1.85;white-space:pre-line">${o.profil_souhaite}</p>
      </div>` : ''}

      ${o.competences_requises ? `
      <div style="margin-bottom:16px;padding:16px 18px;background:#eff6ff;border-radius:var(--r-lg);border-left:3px solid #60a5fa">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#2563eb;margin-bottom:8px">🎓 Diplômes & compétences requis</div>
        <p style="font-size:13px;color:var(--text-2);line-height:1.8">${o.competences_requises}</p>
      </div>` : ''}

      ${o.formule_remerciement ? `
      <div style="margin-bottom:16px;padding:14px 16px;background:#f0fdf4;border-radius:var(--r-lg);border:1px solid #bbf7d0">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#166534;margin-bottom:6px">💬 Formule de remerciement</div>
        <p style="font-size:12px;color:#166534;font-style:italic;line-height:1.7">${o.formule_remerciement}</p>
      </div>` : ''}

      ${o.statut === 'Active' ? `
      <div style="padding:16px 18px;background:var(--accent-soft);border-radius:var(--r-lg);border:1px solid var(--accent-light)">
        <div style="font-size:11px;font-weight:700;color:var(--accent);margin-bottom:6px">🔗 Lien de candidature publique</div>
        <div style="font-size:12px;color:var(--accent-mid);word-break:break-all;margin-bottom:10px;font-family:var(--mono)">${location.origin}/postuler?offre_id=${o.offre_id}</div>
        <button class="btn btn-sm" style="background:var(--accent);color:white;border:none;font-weight:600" onclick="copyOfferLink('${o.offre_id}')">📋 Copier le lien</button>
      </div>` : ''}
    </div>

    <!-- ── Tab Candidatures ── -->
    <div class="offre-tab-panel" id="offre-panel-cands" style="display:none">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:10px;flex-wrap:wrap">
        <div style="font-size:14px;font-weight:700;color:var(--text)">${offerApplications.length} candidature${offerApplications.length!==1?'s':''}</div>
        <button class="btn btn-primary btn-sm" onclick="launchNewApplicationForOffer('${o.offre_id}')">+ Nouvelle candidature</button>
      </div>

      ${showBulkSelect && offerApplications.length > 0 ? `
      <div id="offre-bulk-bar" style="display:none;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;background:var(--accent-soft);border:1px solid var(--accent-light);border-radius:var(--r-lg);margin-bottom:12px">
        <span id="offre-bulk-count" style="font-size:12px;font-weight:700;color:var(--accent-mid)">0 candidat sélectionné</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-left:auto">
          <button class="btn btn-sm" style="background:#dcfce7;color:#166534;border:1.5px solid #bbf7d0;font-weight:700" onclick="bulkQualify()">✅ Qualifier</button>
          <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:1.5px solid #fecaca;font-weight:700" onclick="bulkReject()">❌ Éliminer</button>
          ${showTestBadge ? `<button class="btn btn-sm" style="background:#f5f3ff;color:#7c3aed;border:1.5px solid #ddd6fe;font-weight:700" onclick="bulkConvokeTest()">📋 Convoquer au test</button>` : ''}
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:8px;padding:6px 14px;margin-bottom:8px">
        <input type="checkbox" id="offre-cands-select-all" onchange="toggleAllCandSelection(this.checked)" style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent)">
        <label for="offre-cands-select-all" style="font-size:12px;color:var(--text-3);cursor:pointer;user-select:none">Tout sélectionner</label>
      </div>` : ''}

      ${offerApplications.length===0 ? `
      <div class="empty-state" style="padding:48px 0">
        <div class="empty-icon">👤</div>
        <p>Aucune candidature pour cette offre</p>
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
            ${showTestBadge ? (testConvoque ? '<span class="badge" style="background:#ede9fe;color:#7c3aed;border:1px solid #ddd6fe">📋 Test convoqué</span>' : '<span class="badge badge-gray">⏳ À convoquer</span>') : ''}
            ${c.recommandation?renderBadge(c.recommandation):'<span class="badge badge-gray">En attente</span>'}
          </div>
          <svg style="width:14px;height:14px;color:var(--text-3);flex-shrink:0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
        </div>`;}).join('')}
      </div>`}
    </div>

    <!-- ── Tab Calendrier ── -->
    <div class="offre-tab-panel" id="offre-panel-cal" style="display:none">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
        ${calChip('📅 Date butoire', o.date_butoire?formatDate(o.date_butoire):'Non définie', !!o.date_butoire)}
        ${calChip('📢 Parution prévue', o.date_parution_prevue?formatDate(o.date_parution_prevue):'Non définie', !!o.date_parution_prevue)}
        ${calChip('⏱️ Limite sélection', o.date_limite_selection?formatDate(o.date_limite_selection):'Non définie', !!o.date_limite_selection)}
      </div>

      ${o.test_requis && (o.test_date || o.test_heure || o.test_lieu) ? `
      <div style="padding:18px;background:#faf5ff;border:1px solid #ddd6fe;border-radius:var(--r-lg);margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7c3aed;margin-bottom:14px">📋 Test de recrutement</div>
        <div style="display:flex;gap:24px;flex-wrap:wrap">
          ${o.test_date?`<div><div style="font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Date</div><div style="font-size:15px;font-weight:700">${formatDate(o.test_date)}</div></div>`:''}
          ${o.test_heure?`<div><div style="font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Heure</div><div style="font-size:15px;font-weight:700">${o.test_heure}</div></div>`:''}
          ${o.test_lieu?`<div><div style="font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Lieu</div><div style="font-size:15px;font-weight:700">${o.test_lieu}</div></div>`:''}
        </div>
      </div>` : ''}

      ${appointmentLink ? `
      <div style="padding:16px 18px;background:var(--surface-2);border-radius:var(--r-lg);border:1px solid var(--border-soft)">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);margin-bottom:8px">🔗 Lien RDV (Cal.com / Calendar)</div>
        <a href="${appointmentLink}" target="_blank" style="font-size:12px;color:var(--accent-mid);word-break:break-all;display:block;margin-bottom:12px;font-family:var(--mono)">${appointmentLink}</a>
        <a href="${appointmentLink}" target="_blank" class="btn btn-secondary btn-sm">Ouvrir le calendrier ↗</a>
      </div>` : `
      <div class="empty-state" style="padding:48px 0">
        <div class="empty-icon">📅</div>
        <p>Aucun lien de calendrier configuré</p>
        <button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="closeModal('modal-offre');editOffer('${o.offre_id}')">Configurer dans l'offre</button>
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
  if (counter) counter.textContent = `${count} candidat${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''}`;
}

async function _refreshOfferDetailAfterBulk() {
  _selectedCandidateIds.clear();
  await renderOffers();
  if (_currentOfferDetailId) showOfferDetail(_currentOfferDetailId);
}

async function bulkQualify() {
  const ids = [..._selectedCandidateIds];
  if (!ids.length) return;
  if (!confirm(`Qualifier ${ids.length} candidat(s) et envoyer les emails d'invitation ?`)) return;

  let ok = 0, fail = 0;
  toast(`⏳ Qualification de ${ids.length} candidat(s)…`, 'info');

  for (const id of ids) {
    try {
      const patch = await api.patch(`/api/candidatures/${id}`, { recommandation: 'QUALIFIE' });
      if (!patch?.success) { fail++; continue; }
      const mail = await api.post(`/api/candidatures/${id}/envoyer-emails-qualification`, {});
      if (mail?.success) ok++; else fail++;
    } catch { fail++; }
  }

  toast(`✅ Qualifiés : ${ok}${fail ? ` — ⚠️ ${fail} échec(s)` : ''}`, fail ? 'error' : 'success');
  await _refreshOfferDetailAfterBulk();
}

async function bulkReject() {
  const ids = [..._selectedCandidateIds];
  if (!ids.length) return;
  if (!confirm(`Éliminer ${ids.length} candidat(s) et envoyer les emails de refus ?`)) return;

  let ok = 0, fail = 0;
  toast(`⏳ Élimination de ${ids.length} candidat(s)…`, 'info');

  for (const id of ids) {
    try {
      const patch = await api.patch(`/api/candidatures/${id}`, { recommandation: 'NON_SELECTIONNE' });
      if (!patch?.success) { fail++; continue; }
      const mail = await api.post(`/api/candidatures/${id}/envoyer-email-refus`, {});
      if (mail?.success) ok++; else fail++;
    } catch { fail++; }
  }

  toast(`❌ Éliminés : ${ok}${fail ? ` — ⚠️ ${fail} échec(s)` : ''}`, fail ? 'error' : 'success');
  await _refreshOfferDetailAfterBulk();
}

async function bulkConvokeTest() {
  const ids = [..._selectedCandidateIds];
  if (!ids.length) return;
  if (!confirm(`Envoyer la convocation au test à ${ids.length} candidat(s) ?`)) return;

  let ok = 0, fail = 0;
  toast(`⏳ Convocation de ${ids.length} candidat(s)…`, 'info');

  for (const id of ids) {
    try {
      const r = await api.post(`/api/candidatures/${id}/convoquer-test`, {});
      if (r?.success) ok++; else fail++;
    } catch { fail++; }
  }

  toast(`📋 Convoqués : ${ok}${fail ? ` — ⚠️ ${fail} échec(s)` : ''}`, fail ? 'error' : 'success');
  await _refreshOfferDetailAfterBulk();
}

async function approveOffer(offerId, btn) {
  const comment = prompt('Commentaire d\'approbation (optionnel) :', '') ?? '';
  return withLoading(btn, async () => {
    const r = await api.patch(`/api/offres/${offerId}`, {
      approbation_inspection: { approuvee: true, date_approbation: new Date().toISOString(), commentaire: comment },
    });
    if (r?.success) {
      toast('✅ Offre approuvée par l\'Inspection du Travail', 'success');
      const idx = _jobOffers.findIndex(o => o.offre_id === offerId);
      if (idx !== -1) _jobOffers[idx] = r.offre;
      showOfferDetail(offerId);
      renderOfferCards(_jobOffers);
    } else {
      toast(r?.error || 'Erreur lors de l\'approbation', 'error');
    }
  });
}

function editOffer(id) {
  const o = _jobOffers.find(x => x.offre_id === id); if (!o) return;
  openCreateOffer(o);
}

function openCreateOffer(offre = null) {
  document.getElementById('form-offre-title').textContent = offre ? 'Modifier l\'offre' : 'Nouvelle offre d\'emploi';
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
  return withLoading(btn, async () => {
    const id = document.getElementById('form-offre-id').value;
    const data = {};
    ['titre_poste','missions_principales','profil_souhaite','competences_requises','annees_experience','langues_requises',
     'exigences_ia','type_contrat','localisation','salaire','email_recruteur','statut','lien_rdv',
     'test_heure','test_lieu','formule_remerciement'].forEach(f => {
      data[f] = document.getElementById('fo-'+f)?.value || '';
    });

    const scenario = document.querySelector('input[name="fo-scenario"]:checked')?.value || 'A';
    data.test_requis = scenario === 'C';
    data.automatisation_active = scenario === 'A';

    ['date_butoire','date_parution_prevue','date_limite_selection','test_date'].forEach(f => {
      const val = document.getElementById('fo-'+f)?.value;
      data[f] = val || null;
    });

    let r;
    if (id) r = await api.patch(`/api/offres/${id}`, data);
    else { data.offre_id = Date.now().toString(); r = await api.post('/api/offres', data); }

    if (r?.success) {
      toast(id ? 'Offre modifiée !' : 'Offre créée !', 'success');
      closeModal('modal-create-offre');
      renderOffers();
    } else {
      toast(r?.error || 'Erreur', 'error');
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
  ['info','cands','cal'].forEach(t => {
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
        <button onclick="closeModal('modal-offre')" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,.2);border:none;color:white;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;transition:.15s;z-index:1;line-height:1" onmouseover="this.style.background='rgba(255,255,255,.35)'" onmouseout="this.style.background='rgba(255,255,255,.2)'">✕</button>
        <div style="position:relative;z-index:1">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.6);margin-bottom:8px">Offre d'emploi</div>
          <div style="font-size:20px;font-weight:800;color:white;letter-spacing:-.02em;line-height:1.25;margin-bottom:12px;padding-right:44px" id="modal-offre-title"></div>
          <div id="modal-offre-badges" style="display:flex;flex-wrap:wrap;gap:6px"></div>
        </div>
      </div>

      <!-- Tab bar -->
      <div style="display:flex;border-bottom:2px solid var(--border-soft);background:var(--surface);padding:0 20px;flex-shrink:0;overflow-x:auto">
        <button id="tab-offre-info" onclick="switchOffreTab('info')" style="padding:13px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:var(--accent);border-bottom:2px solid var(--accent);margin-bottom:-2px;white-space:nowrap;outline:none;transition:color .15s">📋 Informations</button>
        <button id="tab-offre-cands" onclick="switchOffreTab('cands')" style="padding:13px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:var(--text-3);border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap;outline:none;transition:color .15s;display:flex;align-items:center;gap:6px">👥 Candidatures <span id="offre-tab-cands-count" style="background:var(--surface-3);border-radius:99px;padding:1px 8px;font-size:11px"></span></button>
        <button id="tab-offre-cal" onclick="switchOffreTab('cal')" style="padding:13px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;color:var(--text-3);border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap;outline:none;transition:color .15s">📅 Calendrier</button>
      </div>

      <!-- Scrollable body -->
      <div id="modal-offre-body" style="padding:24px;overflow-y:auto;flex:1"></div>

      <!-- Footer actions -->
      <div style="padding:14px 24px;border-top:1px solid var(--border-soft);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;background:var(--surface-2)">
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="btn-offre-edit">✏️ Modifier</button>
          <button class="btn btn-secondary btn-sm" id="btn-offre-pdf">📄 Exporter PDF</button>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-offre-newcand">+ Nouvelle candidature</button>
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
          <div style="font-size:16px;font-weight:800;color:var(--text);letter-spacing:-.01em" id="form-offre-title">Nouvelle offre</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:1px">Remplissez les informations du poste</div>
        </div>
        <button class="btn-icon" onclick="closeModal('modal-create-offre')" style="flex-shrink:0">✕</button>
      </div>

      <!-- Form body -->
      <div style="padding:24px 28px;overflow-y:auto;flex:1">
        <input type="hidden" id="form-offre-id">

        <!-- Section: Poste -->
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);margin-bottom:14px;display:flex;align-items:center;gap:8px">
          <span style="background:var(--accent);color:white;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px">1</span> Informations du poste
        </div>
        <div class="form-grid" style="margin-bottom:24px">
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">Titre du poste <span class="req">*</span></label>
            <input class="form-control" id="fo-titre_poste" placeholder="Ex: Développeur Full Stack Senior">
          </div>
          <div class="form-group">
            <label class="form-label">Type de contrat <span class="req">*</span></label>
            <select class="form-control" id="fo-type_contrat"><option value="">Sélectionner…</option><option>CDI</option><option>CDD</option><option>Stage</option><option>Freelance</option><option>Alternance</option></select>
          </div>
          <div class="form-group">
            <label class="form-label">Localisation <span class="req">*</span></label>
            <input class="form-control" id="fo-localisation" placeholder="Ex: Antananarivo, Télétravail…">
          </div>
          <div class="form-group">
            <label class="form-label">Années d'expérience</label>
            <input class="form-control" id="fo-annees_experience" placeholder="Ex: 3 ans minimum">
          </div>
          <div class="form-group">
            <label class="form-label">Salaire</label>
            <input class="form-control" id="fo-salaire" placeholder="Ex: 2–4M Ar/mois">
          </div>
          <div class="form-group">
            <label class="form-label">Langues</label>
            <input class="form-control" id="fo-langues_requises" placeholder="Français, Anglais…">
          </div>
          <div class="form-group">
            <label class="form-label">Email recruteur <span class="req">*</span></label>
            <input class="form-control" id="fo-email_recruteur" type="email" placeholder="rh@solumada.mg">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">Missions principales <span class="req">*</span></label>
            <textarea class="form-control" id="fo-missions_principales" rows="3" placeholder="Responsabilités, missions clés…"></textarea>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">Profil souhaité</label>
            <textarea class="form-control" id="fo-profil_souhaite" rows="2" placeholder="Formation, qualités, expérience attendue…"></textarea>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">Diplôme(s) et compétences requis <span class="req">*</span></label>
            <textarea class="form-control" id="fo-competences_requises" rows="2" placeholder="Ex: Licence en informatique, React, 3 ans…"></textarea>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label" style="color:var(--accent-mid)">🤖 Exigences IA (guide le scoring Claude)</label>
            <textarea class="form-control" id="fo-exigences_ia" rows="2" placeholder="Ex: Docker éliminatoire, management obligatoire…" style="border-color:var(--accent-light)"></textarea>
          </div>
        </div>

        <!-- Section: Calendrier -->
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);margin-bottom:14px;display:flex;align-items:center;gap:8px">
          <span style="background:var(--accent);color:white;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px">2</span> Calendrier & statut
        </div>
        <div style="padding:16px 18px;background:var(--surface-2);border-radius:var(--r-lg);border:1px solid var(--border-soft);margin-bottom:24px">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div class="form-group" style="margin:0">
              <label class="form-label">Date butoire</label>
              <input class="form-control" type="date" id="fo-date_butoire">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">Date parution prévue</label>
              <input class="form-control" type="date" id="fo-date_parution_prevue">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">Limite sélection</label>
              <input class="form-control" type="date" id="fo-date_limite_selection">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group" style="margin:0">
              <label class="form-label">Statut</label>
              <select class="form-control" id="fo-statut">
                <option value="En pause">En pause</option>
                <option value="Active" id="fo-statut-active">Active</option>
                <option value="Fermée">Fermée</option>
              </select>
              <div id="fo-statut-hint" style="display:none;font-size:11px;color:#d97706;margin-top:4px;font-weight:500">⚠️ Remplissez le lien RDV pour activer</div>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">🔗 Lien RDV (Cal.com / Calendar)</label>
              <input class="form-control" id="fo-lien_rdv" placeholder="https://cal.com/..." oninput="syncStatutWithCalendar()">
            </div>
          </div>
        </div>

        <!-- Section: Mode de qualification -->
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);margin-bottom:14px;display:flex;align-items:center;gap:8px">
          <span style="background:var(--accent);color:white;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px">3</span> Mode de qualification
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
          <div id="card-scenario-A" onclick="setScenario('A')" style="cursor:pointer;border:2px solid var(--accent);background:var(--accent-soft);border-radius:var(--r-lg);padding:16px;transition:.15s;display:flex;flex-direction:column;gap:6px">
            <input type="radio" name="fo-scenario" value="A" checked style="display:none">
            <div style="font-size:22px">🤖</div>
            <div style="font-size:12px;font-weight:700;color:var(--text)">Scénario A</div>
            <div style="font-size:11px;color:var(--text-3);line-height:1.5">IA analyse + emails envoyés automatiquement</div>
          </div>
          <div id="card-scenario-B" onclick="setScenario('B')" style="cursor:pointer;border:2px solid var(--border);background:var(--surface);border-radius:var(--r-lg);padding:16px;transition:.15s;display:flex;flex-direction:column;gap:6px">
            <input type="radio" name="fo-scenario" value="B" style="display:none">
            <div style="font-size:22px">👤</div>
            <div style="font-size:12px;font-weight:700;color:var(--text)">Scénario B</div>
            <div style="font-size:11px;color:var(--text-3);line-height:1.5">IA analyse, recruteur qualifie manuellement</div>
          </div>
          <div id="card-scenario-C" onclick="setScenario('C')" style="cursor:pointer;border:2px solid var(--border);background:var(--surface);border-radius:var(--r-lg);padding:16px;transition:.15s;display:flex;flex-direction:column;gap:6px">
            <input type="radio" name="fo-scenario" value="C" style="display:none">
            <div style="font-size:22px">📋</div>
            <div style="font-size:12px;font-weight:700;color:var(--text)">Scénario C</div>
            <div style="font-size:11px;color:var(--text-3);line-height:1.5">Test requis, qualification manuelle après</div>
          </div>
        </div>

        <!-- Test details (shown only if scenario C) -->
        <div id="fo-test-section" style="display:none;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:16px 18px;background:#faf5ff;border-radius:var(--r-lg);border:1px solid #ddd6fe;margin-bottom:16px">
          <div class="form-group" style="margin:0">
            <label class="form-label" style="color:#7c3aed">Date du test</label>
            <input class="form-control" type="date" id="fo-test_date">
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" style="color:#7c3aed">Heure</label>
            <input class="form-control" id="fo-test_heure" placeholder="Ex: 09h00">
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" style="color:#7c3aed">Lieu</label>
            <input class="form-control" id="fo-test_lieu" placeholder="Ex: Siège Antananarivo">
          </div>
        </div>

        <!-- Section: Remerciement -->
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">💬 Formule de remerciement (affichée au candidat après candidature)</label>
          <textarea class="form-control" id="fo-formule_remerciement" rows="2" maxlength="400" placeholder="Ex: Nous vous remercions de l'intérêt porté à notre entreprise…" oninput="updateCharCount(this, 400)"></textarea>
          <p id="fo-formule_remerciement-count" style="font-size:11px;color:var(--text-3);margin:4px 0 0;text-align:right">0 / 400</p>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:16px 28px;border-top:1px solid var(--border-soft);display:flex;justify-content:flex-end;gap:10px;background:var(--surface-2);flex-shrink:0">
        <button class="btn btn-secondary" onclick="closeModal('modal-create-offre')">Annuler</button>
        <button class="btn btn-primary" onclick="submitOffer(this)">💾 Enregistrer l'offre</button>
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
  if (!o) { toast('Offre introuvable', 'error'); return; }
  const cfg      = COMPANY_CONFIG[o.company] || COMPANY_CONFIG.solumada;
  const isOpt    = o.company === 'optimum';
  const accent   = isOpt ? '#62A5D2' : '#3E9143';
  const accentDk = isOpt ? '#4a8ab8' : '#2d7a33';
  const accentBg = isOpt ? '#eff6ff' : '#f0fdf4';
  const accentBd = isOpt ? '#bfdbfe' : '#bbf7d0';
  const win = window.open('', '_blank');
  if (!win) { toast('Autorisez les pop-ups pour exporter le PDF', 'error'); return; }
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
