async function renderDashboard() {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner" style="width:28px;height:28px"></div></div>`;

  const [statsRes, offresRes, candsRes, madagascarRes] = await Promise.all([
    api.get('/api/offres/stats/summary'),
    api.get('/api/offres'),
    api.get('/api/candidatures?limit=500'),
    api.get('/api/offres/stats/madagascar'),
  ]);

  const stats      = statsRes?.stats || {};
  const offres     = offresRes?.offres || [];
  const cands      = candsRes?.candidatures || [];
  const mdg        = madagascarRes?.stats || {};
  const activeOffers = offres.filter(o => o.statut === 'Active');

  // Map candidatures par offre
  const candsByOffre = {};
  cands.forEach(c => {
    if (!candsByOffre[c.offre_id]) candsByOffre[c.offre_id] = [];
    candsByOffre[c.offre_id].push(c);
  });

  const maxCands = Math.max(...offres.map(o => (candsByOffre[o.offre_id]||[]).length), 1);

  const todayDb  = new Date(); todayDb.setHours(0, 0, 0, 0);
  const myEmail  = Auth.user()?.email;
  const upcomingRdvs = cands
    .filter(c => c.rdv_pris && c.rdv_manuel?.date && new Date(c.rdv_manuel.date) >= todayDb && c.email_recruteur === myEmail)
    .sort((a, b) => new Date(a.rdv_manuel.date) - new Date(b.rdv_manuel.date))
    .slice(0, 10);

  el.innerHTML = `
  <!-- KPI Cards -->
  <div class="db-kpi-grid">
    ${dbKpi('Offres actives', stats.activeOffers||0, '#22c55e', '#15803d', svgBriefcase(), "Postes ouverts en ce moment", "navigate('offres')")}
    ${dbKpi('Candidatures', stats.totalApplications||0, '#3b82f6', '#1d4ed8', svgUsers(), "Dossiers reçus au total", "navigate('candidatures')")}
    ${dbKpi('Qualifiés', stats.qualified||0, '#10b981', '#047857', svgCheck(), "Score ≥ 7 · Recommandés", "goToCands('QUALIFIE')")}
    ${dbKpi('À revoir', stats.toReview||0, '#f59e0b', '#b45309', svgEye(), "Score 4–6 · À évaluer", "goToCands('A_REVOIR')")}
  </div>

  <!-- Two columns -->
  <div class="db-grid">

    <!-- Offres actives -->
    <div class="db-card">
      <div class="db-card-head">
        <span class="db-card-title">🟢 Offres actives</span>
        <button class="db-card-link" onclick="navigate('offres')">Voir tout →</button>
      </div>
      <div class="db-card-body">
        ${activeOffers.length === 0
          ? `<div class="empty-state" style="padding:24px"><div class="empty-icon">📭</div><p>Aucune offre active</p></div>`
          : activeOffers.slice(0, 6).map(o => {
              const oc = candsByOffre[o.offre_id] || [];
              const pct = Math.round(oc.length / maxCands * 100);
              return `<div class="db-offer-row" onclick="goToOffer('${o.offre_id}')">
                <div class="db-offer-dot"></div>
                <div style="flex:1;min-width:0">
                  <div class="db-offer-name">${o.titre_poste}</div>
                  <div class="db-offer-meta">📍 ${o.localisation} · ${o.type_contrat}</div>
                  <div class="db-offer-bar-wrap"><div class="db-offer-bar" style="width:${pct}%"></div></div>
                </div>
                <div class="db-offer-count">
                  <div class="db-offer-num">${oc.length}</div>
                  <div class="db-offer-lbl">candidats</div>
                </div>
                <svg style="width:14px;height:14px;color:var(--text-3);flex-shrink:0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
              </div>`;
            }).join('')}
      </div>
    </div>

    <!-- Candidatures récentes -->
    <div class="db-card">
      <div class="db-card-head">
        <span class="db-card-title">🕐 Candidatures récentes</span>
        <button class="db-card-link" onclick="navigate('candidatures')">Voir tout →</button>
      </div>
      <div class="db-card-body">
        ${cands.length === 0
          ? `<div class="empty-state" style="padding:24px"><div class="empty-icon">👤</div><p>Aucune candidature</p></div>`
          : cands.slice(0, 6).map(c => `
            <div class="db-cand-row" onclick="goToCand('${c._id}')">
              <div class="avatar" style="width:34px;height:34px;font-size:12px;flex-shrink:0">${initials(c.candidat_nom)}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--text)">${c.candidat_nom}</div>
                <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.titre_poste}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
                ${c.recommandation ? renderBadge(c.recommandation) : '<span class="badge badge-gray" style="font-size:10px">En attente</span>'}
                ${c.score != null ? `<span style="font-size:11px;font-weight:700;color:${scoreColor(c.score)};font-family:var(--mono)">${c.score}/10</span>` : ''}
              </div>
              <svg style="width:13px;height:13px;color:var(--text-3);flex-shrink:0;margin-left:4px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
            </div>`).join('')}
      </div>
    </div>
  </div>

  <!-- Summary table -->
  <div class="db-card" style="margin-bottom:20px">
    <div class="db-card-head">
      <span class="db-card-title">📊 Résumé par offre</span>
      <button class="db-card-link" onclick="navigate('offres')">Gérer les offres →</button>
    </div>
    <div class="db-table-wrap">
      <table class="db-table">
        <thead><tr>
          <th>Poste</th><th>Contrat</th><th>Statut</th>
          <th>Candidats</th><th>Qualifiés</th><th>À revoir</th><th>Non retenus</th>
        </tr></thead>
        <tbody>
          ${offres.length === 0
            ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-3)">Aucune offre</td></tr>`
            : offres.map(o => {
                const oc      = candsByOffre[o.offre_id] || [];
                const qual    = oc.filter(c => c.recommandation === 'QUALIFIE').length;
                const rev     = oc.filter(c => c.recommandation === 'A_REVOIR').length;
                const rej     = oc.filter(c => c.recommandation === 'NON_SELECTIONNE').length;
                const pct     = maxCands > 0 ? Math.round(oc.length / maxCands * 100) : 0;
                return `<tr onclick="goToOffer('${o.offre_id}')">
                  <td style="font-weight:600;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.titre_poste}</td>
                  <td><span class="badge badge-gray">${o.type_contrat}</span></td>
                  <td>${offerStatusBadge(o.statut)}</td>
                  <td>
                    <div class="db-bar-cell">
                      <div class="db-mini-bar"><div class="db-mini-fill" style="width:${pct}%;background:linear-gradient(to right,var(--grad-start),var(--grad-end))"></div></div>
                      <span style="font-weight:700;min-width:20px">${oc.length}</span>
                    </div>
                  </td>
                  <td><div class="db-bar-cell"><div class="db-mini-bar"><div class="db-mini-fill" style="width:${oc.length?Math.round(qual/oc.length*100):0}%;background:#22c55e"></div></div><span style="color:#16a34a;font-weight:700">${qual}</span></div></td>
                  <td><div class="db-bar-cell"><div class="db-mini-bar"><div class="db-mini-fill" style="width:${oc.length?Math.round(rev/oc.length*100):0}%;background:#f59e0b"></div></div><span style="color:#d97706;font-weight:700">${rev}</span></div></td>
                  <td><div class="db-bar-cell"><div class="db-mini-bar"><div class="db-mini-fill" style="width:${oc.length?Math.round(rej/oc.length*100):0}%;background:#ef4444"></div></div><span style="color:#dc2626;font-weight:700">${rej}</span></div></td>
                </tr>`;
              }).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Prochains rendez-vous -->
  <div class="db-card" style="margin-bottom:20px">
    <div class="db-card-head">
      <span class="db-card-title">📅 Prochains rendez-vous</span>
      ${upcomingRdvs.length > 0 ? `<button class="db-card-link" onclick="navigate('rendezvous')">Voir tous →</button>` : ''}
    </div>
    <div class="db-card-body">
      ${upcomingRdvs.length === 0
        ? `<div class="empty-state" style="padding:24px"><div class="empty-icon">📅</div><p>Aucun entretien planifié</p></div>`
        : upcomingRdvs.map(c => {
            const rdv    = c.rdv_manuel;
            const company = c.company || Auth.user()?.company;
            const rdvAdj  = (!rdv.type_rdv) ? rdvAdjustForTimezone(rdv.date, rdv.heure, company) : { date: rdv.date, heure: rdv.heure };
            const dStr  = formatDate(rdvAdj.date);
            const heure = rdvAdj.heure || '';
            const lieu  = rdv.lieu  || '';
            const now   = new Date();
            const diff  = (new Date(rdvAdj.date) - now) / (1000 * 60 * 60);
            const urgBadge = diff < 24
              ? '<span class="badge badge-red" style="font-size:9px;padding:1px 5px">🔴 Auj.</span>'
              : diff < 72
                ? `<span class="badge badge-amber" style="font-size:9px;padding:1px 5px">J-${Math.ceil(diff/24)}</span>`
                : '';
            return `<div class="db-cand-row" onclick="goToCand('${c._id}')">
              <div class="avatar" style="width:34px;height:34px;font-size:12px;flex-shrink:0">${initials(c.candidat_nom)}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:5px">${c.candidat_nom} ${urgBadge}</div>
                <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.titre_poste}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:12px;font-weight:700;color:var(--accent-mid)">📅 ${dStr}</div>
                ${heure ? `<div style="font-size:11px;color:var(--text-3)">🕐 ${heure}</div>` : ''}
                ${lieu  ? `<div style="font-size:10px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px">📍 ${lieu}</div>` : ''}
              </div>
              <svg style="width:13px;height:13px;color:var(--text-3);flex-shrink:0;margin-left:4px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
            </div>`;
          }).join('')}
    </div>
  </div>

  <!-- Madagascar section -->
  <div class="db-card">
    <div class="db-card-head">
      <span class="db-card-title">🇲🇬 Conformité RH — Madagascar</span>
    </div>
    <div style="padding:16px 20px">
      <div class="db-mdg-grid" style="margin-bottom:20px">
        ${dbMdg('Offres approuvées', mdg.offres?.approuvees||0, mdg.offres?.total||0, '#22c55e', '✓ Inspection du Travail')}
        ${dbMdg('En attente inspection', (mdg.offres?.total||0)-(mdg.offres?.approuvees||0), mdg.offres?.total||0, '#f59e0b', '⏳ Non approuvées')}
        ${dbMdg('À appeler', mdg.candidatures?.aAppeler||0, mdg.candidatures?.total||0, '#3b82f6', '📞 Sans RDV confirmé')}
        ${dbMdg('Tests convoqués', mdg.candidatures?.testConvoques||0, mdg.candidatures?.total||0, '#8b5cf6', '📋 Scénario C')}
        ${dbMdg('Tests passés', mdg.candidatures?.testPasses||0, mdg.candidatures?.total||0, '#06b6d4', '✅ Post-test')}
        ${dbMdg('RDV confirmés', mdg.candidatures?.rdvPris||0, mdg.candidatures?.total||0, '#10b981', '📅 Planifiés')}
      </div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);margin-bottom:10px">Canaux de candidature</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${(mdg.canaux||[]).map(c => {
          const labels = { plateforme:'🌐 Plateforme', telephone:'📞 Téléphone', physique:'🤝 Physique' };
          return `<div class="db-canal-pill">
            <div class="db-canal-val">${c.count}</div>
            <div class="db-canal-lbl">${labels[c._id]||c._id||'—'}</div>
          </div>`;
        }).join('') || '<span style="font-size:13px;color:var(--text-3)">Aucune donnée</span>'}
      </div>
    </div>
  </div>`;

  // Animate counters
  el.querySelectorAll('.db-kpi-val[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    if (!target) return;
    let start = null;
    const duration = 900;
    function step(ts) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(ease * target);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  });
}

function goToOffer(offreId) {
  window._pendingOfferDetail = offreId;
  navigate('offres');
}

function goToCand(candId) {
  window._pendingCandDetail = candId;
  navigate('candidatures');
}

function goToCands(reco) {
  navigate('candidatures');
}

function dbKpi(label, value, colorA, colorB, icon, sub, onclick) {
  return `<div class="db-kpi" style="background:linear-gradient(135deg,${colorA},${colorB});box-shadow:0 6px 24px ${colorA}44" onclick="${onclick}">
    <div class="db-kpi-icon">${icon}</div>
    <div class="db-kpi-val" data-target="${value}">0</div>
    <div class="db-kpi-label">${label}</div>
    <div class="db-kpi-sub">${sub}</div>
    <svg class="db-kpi-arrow" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,.6)" stroke-width="2"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
  </div>`;
}

function dbMdg(label, value, total, color, sub) {
  const pct = total > 0 ? Math.round(value / total * 100) : 0;
  return `<div class="db-mdg-item">
    <div class="db-mdg-val" style="color:${color}">${value}</div>
    <div class="db-mdg-label">${label}</div>
    <div class="db-mdg-sub">${sub}</div>
    <div class="db-mdg-bar"><div class="db-mdg-fill" style="width:${pct}%;background:${color}"></div></div>
  </div>`;
}

function scoreColor(s) { return s >= 7 ? '#16a34a' : s >= 4 ? '#d97706' : '#dc2626'; }

function svgBriefcase(){ return `<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,.9)" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>`; }
function svgUsers(){     return `<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,.9)" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`; }
function svgCheck(){     return `<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,.9)" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`; }
function svgEye(){       return `<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,.9)" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`; }
