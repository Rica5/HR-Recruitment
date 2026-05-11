let _jobOffers = [], _offerApplications = {};

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
          ${approved ? '<span class="badge badge-green" style="font-size:10px">✓ Inspection</span>' : '<span class="badge badge-amber" style="font-size:10px">⏳ En attente inspection</span>'}
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
          <button class="btn-icon" title="Copier le lien" onclick="event.stopPropagation();copyOfferLink('${o.offre_id}')">🔗</button>
          <button class="btn-icon" title="Modifier" onclick="event.stopPropagation();editOffer('${o.offre_id}')">✏️</button>
          <button class="btn-icon" title="Supprimer" onclick="event.stopPropagation();deleteOffer('${o.offre_id}')">🗑️</button>
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

async function deleteOffer(id) {
  if (!confirm('Supprimer cette offre et toutes ses candidatures ?')) return;
  const r = await api.delete(`/api/offres/${id}`);
  if (r?.success) { toast('Offre supprimée', 'success'); renderOffers(); }
  else toast(r?.error || 'Erreur', 'error');
}

function showOfferDetail(id) {
  const o = _jobOffers.find(x => x.offre_id === id); if (!o) return;
  const offerApplications = _offerApplications[id] || [];
  const modal = document.getElementById('modal-offre');
  document.getElementById('modal-offre-title').textContent = o.titre_poste;
  const approved = o.approbation_inspection?.approuvee;
  const appointmentLink = o.lien_rdv || o.lien_calendar || '';
  document.getElementById('modal-offre-body').innerHTML = `
    <!-- Labour Inspection approval block -->
    <div style="margin-bottom:16px;padding:14px 16px;border-radius:var(--r);border:2px solid ${approved?'#bbf7d0':'#fde68a'};background:${approved?'#f0fdf4':'#fefce8'}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:${approved?'4px':'10px'}">
        <span style="font-size:18px">${approved?'✅':'⏳'}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:${approved?'#166534':'#854d0e'}">
            ${approved ? 'Approuvée par l\'Inspection du Travail' : 'En attente d\'approbation — Inspection du Travail'}
          </div>
          ${approved && o.approbation_inspection.date_approbation ? `<div style="font-size:11px;color:#4ade80">Le ${formatDate(o.approbation_inspection.date_approbation)}</div>` : ''}
          ${!approved ? '<div style="font-size:11px;color:#92400e">L\'offre ne peut pas être activée sans cette approbation.</div>' : ''}
        </div>
        ${!approved ? `<button class="btn btn-sm" style="margin-left:auto;background:#d97706;color:#fff;border:none" onclick="approveOffer('${o.offre_id}')">Approuver</button>` : ''}
      </div>
      ${o.approbation_inspection?.commentaire ? `<div style="font-size:12px;color:var(--text-2);margin-top:4px;padding:6px 8px;background:rgba(0,0,0,.04);border-radius:4px">${o.approbation_inspection.commentaire}</div>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      ${detailRow('Contrat',o.type_contrat)} ${detailRow('Localisation',o.localisation)}
      ${detailRow('Statut',o.statut)} ${o.salaire?detailRow('Salaire',o.salaire):''}
      ${o.annees_experience?detailRow('Expérience',o.annees_experience):''} ${o.langues_requises?detailRow('Langues',o.langues_requises):''}
      ${detailRow('Recruteur',o.email_recruteur)} ${detailRow('Créée le',formatDate(o.date_creation))}

      <!-- Automation scenario -->
      <div style="background:var(--surface-2);border-radius:var(--r);padding:10px 12px;display:flex;flex-direction:column;gap:4px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)">Mode qualification</div>
        <div style="font-size:12px;font-weight:600">
          ${o.test_requis
            ? '<span class="badge badge-amber">C — Test + manuel</span>'
            : (o.automatisation_active
                ? '<span class="badge badge-blue">A — IA + auto-email</span>'
                : '<span class="badge badge-accent">B — IA + manuel</span>')}
        </div>
      </div>
      ${detailRow('Test requis', o.test_requis ? 'Oui' : 'Non')}
    </div>

    <!-- Calendar section -->
    <div style="background:var(--surface-2);border-radius:var(--r);padding:12px 14px;margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:10px">📅 Calendrier</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div><div style="font-size:10px;color:var(--text-3);margin-bottom:2px">Date butoire</div><div style="font-size:12px;font-weight:600">${o.date_butoire?formatDate(o.date_butoire):'—'}</div></div>
        <div><div style="font-size:10px;color:var(--text-3);margin-bottom:2px">Parution prévue</div><div style="font-size:12px;font-weight:600">${o.date_parution_prevue?formatDate(o.date_parution_prevue):'—'}</div></div>
        <div><div style="font-size:10px;color:var(--text-3);margin-bottom:2px">Limite sélection</div><div style="font-size:12px;font-weight:600">${o.date_limite_selection?formatDate(o.date_limite_selection):'—'}</div></div>
      </div>
    </div>

    ${o.test_requis && (o.test_date || o.test_heure || o.test_lieu) ? `
    <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:var(--r);padding:12px 14px;margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#7c3aed;margin-bottom:8px">📋 Test de recrutement</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        ${o.test_date?`<div><span style="font-size:10px;color:#7c3aed">Date</span><br><span style="font-size:12px;font-weight:600">${formatDate(o.test_date)}</span></div>`:''}
        ${o.test_heure?`<div><span style="font-size:10px;color:#7c3aed">Heure</span><br><span style="font-size:12px;font-weight:600">${o.test_heure}</span></div>`:''}
        ${o.test_lieu?`<div><span style="font-size:10px;color:#7c3aed">Lieu</span><br><span style="font-size:12px;font-weight:600">${o.test_lieu}</span></div>`:''}
      </div>
    </div>` : ''}

    ${appointmentLink ? `<div style="background:var(--surface-2);border-radius:var(--r);padding:10px 12px;margin-bottom:12px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:4px">Lien RDV (Cal.com / Calendar)</div><a href="${appointmentLink}" target="_blank" style="font-size:12px;color:var(--accent-mid);word-break:break-all">${appointmentLink}</a></div>` : ''}

    ${o.missions_principales?`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:4px">Missions principales</div><p style="font-size:13px;color:var(--text-2);line-height:1.7">${o.missions_principales}</p></div>`:''}
    ${o.profil_souhaite?`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:4px">Profil souhaité</div><p style="font-size:13px;color:var(--text-2);line-height:1.7">${o.profil_souhaite}</p></div>`:''}
    ${o.competences_requises?`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:4px">Diplôme(s) et compétences requis</div><p style="font-size:13px;color:var(--text-2)">${o.competences_requises}</p></div>`:''}
    ${o.formule_remerciement?`<div style="margin-bottom:12px;padding:10px 12px;background:#f0fdf4;border-radius:var(--r);border:1px solid #bbf7d0"><div style="font-size:10px;font-weight:600;text-transform:uppercase;color:#166534;margin-bottom:4px">Formule de remerciement (postuler.html)</div><p style="font-size:12px;color:#166534;font-style:italic">${o.formule_remerciement}</p></div>`:''}

    <div style="background:var(--surface-2);border-radius:var(--r);padding:12px;margin-bottom:16px">
      <div style="font-size:11px;color:var(--text-3);margin-bottom:4px">Lien de candidature</div>
      <div style="font-size:12px;color:var(--accent-mid);word-break:break-all">${location.origin}/postuler?offre_id=${o.offre_id}</div>
      <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="copyOfferLink('${o.offre_id}')">📋 Copier</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700">Candidatures (${offerApplications.length})</div>
      <button class="btn btn-primary btn-sm" onclick="launchNewApplicationForOffer('${o.offre_id}')">+ Nouvelle candidature</button>
    </div>
    ${offerApplications.length===0?`<div style="text-align:center;padding:20px;color:var(--text-3);font-size:13px">Aucune candidature</div>`:
    `<div style="display:flex;flex-direction:column;gap:6px">${offerApplications.map(c=>`
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface-2);border-radius:var(--r);cursor:pointer" onclick="closeModal('modal-offre');location.href='/candidature/${c._id}'">
        <div class="avatar" style="width:30px;height:30px;font-size:11px">${initials(c.candidat_nom)}</div>
        <div style="flex:1"><div style="font-size:13px;font-weight:600">${c.candidat_nom}</div><div style="font-size:11px;color:var(--text-3)">${c.candidat_email||c.candidat_telephone||'—'}</div></div>
        ${channelBadge(c.canal_candidature)}
        ${c.score!=null?`<span style="font-family:var(--mono);font-size:13px;font-weight:600;color:${scoreColor(c.score)}">${c.score}/10</span>`:''}
        ${c.recommandation?renderBadge(c.recommandation):''}
      </div>`).join('')}</div>`}`;
  modal.style.display = 'flex';
}

async function approveOffer(offerId) {
  const comment = prompt('Commentaire d\'approbation (optionnel) :', '') ?? '';
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

async function submitOffer() {
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
}

function detailRow(label, value) {
  return `<div style="background:var(--surface-2);border-radius:var(--r);padding:10px 12px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:2px">${label}</div><div style="font-size:13px;font-weight:600;color:var(--text)">${value}</div></div>`;
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function offerModalHTML() {
  return `
  <!-- Job offer detail modal -->
  <div id="modal-offre" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:100;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)closeModal('modal-offre')">
    <div style="background:var(--surface);border-radius:var(--r-xl);width:100%;max-width:640px;max-height:85vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg)">
      <div style="padding:20px 24px;border-bottom:1px solid var(--border-soft);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:16px;font-weight:700" id="modal-offre-title"></div>
        <button class="btn-icon" onclick="closeModal('modal-offre')">✕</button>
      </div>
      <div id="modal-offre-body" style="padding:20px 24px;overflow-y:auto;flex:1"></div>
    </div>
  </div>

  <!-- Create/edit job offer modal -->
  <div id="modal-create-offre" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:100;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)closeModal('modal-create-offre')">
    <div style="background:var(--surface);border-radius:var(--r-xl);width:100%;max-width:700px;max-height:90vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg)">
      <div style="padding:20px 24px;border-bottom:1px solid var(--border-soft);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:16px;font-weight:700" id="form-offre-title">Nouvelle offre</div>
        <button class="btn-icon" onclick="closeModal('modal-create-offre')">✕</button>
      </div>
      <div style="padding:24px;overflow-y:auto;flex:1">
        <input type="hidden" id="form-offre-id">
        <div class="form-grid">
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
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">Missions principales <span class="req">*</span></label>
            <textarea class="form-control" id="fo-missions_principales" rows="3" placeholder="Responsabilités, missions…"></textarea>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">Profil souhaité</label>
            <textarea class="form-control" id="fo-profil_souhaite" rows="2" placeholder="Formation, qualités, expérience attendue…"></textarea>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">Diplôme(s) et compétences requis <span class="req">*</span></label>
            <textarea class="form-control" id="fo-competences_requises" rows="2" placeholder="Ex: Licence en informatique, React, 3 ans…"></textarea>
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
            <label class="form-label" style="color:var(--accent-mid)">🤖 Exigences IA (guide le scoring Claude)</label>
            <textarea class="form-control" id="fo-exigences_ia" rows="2" placeholder="Ex: Docker éliminatoire, management obligatoire…" style="border-color:var(--accent-light)"></textarea>
          </div>

          <!-- Calendar section -->
          <div style="grid-column:1/-1;padding:12px 14px;background:var(--surface-2);border-radius:var(--r);border:1px solid var(--border-soft)">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:12px">📅 Calendrier</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
              <div class="form-group" style="margin:0">
                <label class="form-label">Date butoire candidature</label>
                <input class="form-control" type="date" id="fo-date_butoire">
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">Date parution prévue</label>
                <input class="form-control" type="date" id="fo-date_parution_prevue">
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">Date limite sélection</label>
                <input class="form-control" type="date" id="fo-date_limite_selection">
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Statut</label>
            <select class="form-control" id="fo-statut"><option>En pause</option><option>Active</option><option>Fermée</option></select>
          </div>
          <div class="form-group">
            <label class="form-label">🔗 Lien RDV (Cal.com / Google Calendar)</label>
            <input class="form-control" id="fo-lien_rdv" placeholder="https://cal.com/...">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">💬 Formule de remerciement (affichée au candidat après candidature)</label>
            <textarea class="form-control" id="fo-formule_remerciement" rows="2" maxlength="400" placeholder="Ex: Nous vous remercions de l'intérêt porté à notre entreprise…" oninput="updateCharCount(this, 400)"></textarea>
            <p id="fo-formule_remerciement-count" style="font-size:11px;color:var(--text-3);margin:3px 0 0;text-align:right">0 / 400</p>
          </div>

          <!-- Qualification scenario -->
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">Mode de qualification</label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:6px">
              <div id="card-scenario-A" onclick="setScenario('A')" style="cursor:pointer;border:2px solid var(--accent);background:var(--accent-soft,#f0fdf4);border-radius:var(--r);padding:14px;transition:.15s;display:flex;flex-direction:column;gap:5px">
                <input type="radio" name="fo-scenario" value="A" checked style="display:none">
                <div style="font-size:20px">🤖</div>
                <div style="font-size:12px;font-weight:700;color:var(--text)">Scénario A</div>
                <div style="font-size:11px;color:var(--text-3);line-height:1.4">IA analyse + emails envoyés automatiquement</div>
              </div>
              <div id="card-scenario-B" onclick="setScenario('B')" style="cursor:pointer;border:2px solid var(--border);background:var(--surface);border-radius:var(--r);padding:14px;transition:.15s;display:flex;flex-direction:column;gap:5px">
                <input type="radio" name="fo-scenario" value="B" style="display:none">
                <div style="font-size:20px">👤</div>
                <div style="font-size:12px;font-weight:700;color:var(--text)">Scénario B</div>
                <div style="font-size:11px;color:var(--text-3);line-height:1.4">IA analyse, recruteur qualifie manuellement</div>
              </div>
              <div id="card-scenario-C" onclick="setScenario('C')" style="cursor:pointer;border:2px solid var(--border);background:var(--surface);border-radius:var(--r);padding:14px;transition:.15s;display:flex;flex-direction:column;gap:5px">
                <input type="radio" name="fo-scenario" value="C" style="display:none">
                <div style="font-size:20px">📋</div>
                <div style="font-size:12px;font-weight:700;color:var(--text)">Scénario C</div>
                <div style="font-size:11px;color:var(--text-3);line-height:1.4">Test requis, qualification manuelle après</div>
              </div>
            </div>
          </div>

          <!-- Test details (shown if test required) -->
          <div id="fo-test-section" style="display:none;grid-column:1/-1;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:12px 14px;background:#f5f3ff;border-radius:var(--r);border:1px solid #ddd6fe">
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
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid var(--border-soft);display:flex;justify-content:flex-end;gap:10px">
        <button class="btn btn-secondary" onclick="closeModal('modal-create-offre')">Annuler</button>
        <button class="btn btn-primary" onclick="submitOffer()">Enregistrer</button>
      </div>
    </div>
  </div>`;
}

function updateCharCount(el, max) {
  const countEl = document.getElementById(el.id + '-count');
  if (countEl) countEl.textContent = `${el.value.length} / ${max}`;
}
