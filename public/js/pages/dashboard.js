async function renderDashboard() {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner" style="width:28px;height:28px"></div></div>`;

  const [statsRes, offresRes, candsRes, madagascarRes] = await Promise.all([
    api.get('/api/offres/stats/summary'),
    api.get('/api/offres'),
    api.get('/api/candidatures?limit=500'),
    api.get('/api/offres/stats/madagascar'),
  ]);

  const stats       = statsRes?.stats  || {};
  const offres      = offresRes?.offres || [];
  const cands       = candsRes?.candidatures || [];
  const mdg         = madagascarRes?.stats   || {};
  const activeOffers = offres.filter(o => o.statut === 'Active');

  // Map candidatures by offer
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

  const candsLbl  = t('dashboard.candidates_lbl');
  const seeAll    = t('dashboard.see_all');
  const noOffers  = t('dashboard.no_active_offers');
  const noCands   = t('dashboard.no_applications');
  const noRdv     = t('dashboard.no_rdv');
  const noOfferRow= t('dashboard.no_offers_row');

  el.innerHTML = `
  <div class="db-kpi-grid">
    ${dbKpi(t('dashboard.active_offers'), stats.activeOffers||0, '#22c55e', '#15803d', svgBriefcase(), t('dashboard.open_positions'), "navigate('offres')")}
    ${dbKpi(t('dashboard.applications'),  stats.totalApplications||0, '#3b82f6', '#1d4ed8', svgUsers(), t('dashboard.total_received'), "navigate('candidatures')")}
    ${dbKpi(t('dashboard.qualified'),     stats.qualified||0, '#10b981', '#047857', svgCheck(), t('dashboard.score_7_plus'), "goToCands('QUALIFIE')")}
    ${dbKpi(t('dashboard.to_review'),     stats.toReview||0,  '#f59e0b', '#b45309', svgEye(), t('dashboard.score_4_6'), "goToCands('A_REVOIR')")}
  </div>

  <div class="db-grid">

    <div class="db-card">
      <div class="db-card-head">
        <span class="db-card-title">${t('dashboard.active_offers_card')}</span>
        <button class="db-card-link" onclick="navigate('offres')">${seeAll}</button>
      </div>
      <div class="db-card-body">
        ${activeOffers.length === 0
          ? `<div class="empty-state" style="padding:24px"><div class="empty-icon">📭</div><p>${noOffers}</p></div>`
          : activeOffers.slice(0, 6).map(o => {
              const oc  = candsByOffre[o.offre_id] || [];
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
                  <div class="db-offer-lbl">${candsLbl}</div>
                </div>
                <svg style="width:14px;height:14px;color:var(--text-3);flex-shrink:0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
              </div>`;
            }).join('')}
      </div>
    </div>

    <div class="db-card">
      <div class="db-card-head">
        <span class="db-card-title">${t('dashboard.recent_apps')}</span>
        <button class="db-card-link" onclick="navigate('candidatures')">${seeAll}</button>
      </div>
      <div class="db-card-body">
        ${cands.length === 0
          ? `<div class="empty-state" style="padding:24px"><div class="empty-icon">👤</div><p>${noCands}</p></div>`
          : cands.slice(0, 6).map(c => `
            <div class="db-cand-row" onclick="goToCand('${c._id}')">
              <div class="avatar" style="width:36px;height:36px;font-size:12px;flex-shrink:0;${avatarColor(c.recommandation)}">${initials(c.candidat_nom)}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--text)">${c.candidat_nom}</div>
                <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.titre_poste}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
                ${c.recommandation ? renderBadge(c.recommandation) : `<span class="badge badge-gray" style="font-size:10px">${t('badge.pending')}</span>`}
                ${c.score != null ? renderScorePill(c.score) : ''}
              </div>
              <svg style="width:13px;height:13px;color:var(--text-3);flex-shrink:0;margin-left:4px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
            </div>`).join('')}
      </div>
    </div>
  </div>

  <div class="db-card" style="margin-bottom:20px">
    <div class="db-card-head">
      <span class="db-card-title">${t('dashboard.summary_title')}</span>
      <button class="db-card-link" onclick="navigate('offres')">${t('dashboard.summary_link')}</button>
    </div>
    <div class="db-table-wrap">
      <table class="db-table">
        <thead><tr>
          <th>${t('dashboard.col_position')}</th>
          <th>${t('dashboard.col_contract')}</th>
          <th>${t('dashboard.col_status')}</th>
          <th>${t('dashboard.col_candidates')}</th>
          <th>${t('dashboard.col_qualified')}</th>
          <th>${t('dashboard.col_to_review')}</th>
          <th>${t('dashboard.col_rejected')}</th>
        </tr></thead>
        <tbody>
          ${offres.length === 0
            ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-3)">${noOfferRow}</td></tr>`
            : offres.map(o => {
                const oc   = candsByOffre[o.offre_id] || [];
                const qual = oc.filter(c => c.recommandation === 'QUALIFIE').length;
                const rev  = oc.filter(c => c.recommandation === 'A_REVOIR').length;
                const rej  = oc.filter(c => c.recommandation === 'NON_SELECTIONNE').length;
                const pct  = maxCands > 0 ? Math.round(oc.length / maxCands * 100) : 0;
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

  <div class="db-card" style="margin-bottom:20px">
    <div class="db-card-head">
      <span class="db-card-title">${t('dashboard.upcoming_rdv')}</span>
      ${upcomingRdvs.length > 0 ? `<button class="db-card-link" onclick="navigate('rendezvous')">${seeAll}</button>` : ''}
    </div>
    <div class="db-card-body">
      ${upcomingRdvs.length === 0
        ? `<div class="empty-state" style="padding:24px"><div class="empty-icon">📅</div><p>${noRdv}</p></div>`
        : upcomingRdvs.map(c => {
            const rdv    = c.rdv_manuel;
            const company = c.company || Auth.user()?.company;
            const rdvAdj  = (!rdv.type_rdv) ? rdvAdjustForTimezone(rdv.date, rdv.heure, company) : { date: rdv.date, heure: rdv.heure };
            const dStr  = formatDate(rdvAdj.date);
            const heure = rdvAdj.heure || '';
            const lieu  = rdv.lieu || '';
            const now   = new Date();
            const diff  = (new Date(rdvAdj.date) - now) / (1000 * 60 * 60);
            const urgBadge = diff < 24
              ? `<span class="badge badge-red" style="font-size:9px;padding:1px 5px">🔴 ${t('rdv.urgency.today')}</span>`
              : diff < 72
                ? `<span class="badge badge-amber" style="font-size:9px;padding:1px 5px">J-${Math.ceil(diff/24)}</span>`
                : '';
            return `<div class="db-cand-row" onclick="goToCand('${c._id}')">
              <div class="avatar" style="width:36px;height:36px;font-size:12px;flex-shrink:0;${avatarColor(c.recommandation)}">${initials(c.candidat_nom)}</div>
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

  <div class="db-card" style="margin-bottom:20px">
    <div class="db-card-head">
      <span class="db-card-title">${t('dashboard.funnel_title')}</span>
    </div>
    <div style="padding:18px 20px">
      ${(() => {
        const received  = cands.length;
        const qualified = cands.filter(c => c.recommandation === 'QUALIFIE').length;
        const interview = cands.filter(c => c.statut === 'Entretien planifié' || c.rdv_pris).length;
        const accepted  = cands.filter(c => c.statut === 'Accepté').length;
        const pct = (n) => received > 0 ? Math.round(n / received * 100) : 0;
        const rows = [
          [t('funnel.received'),  received,  100,          '#3b82f6'],
          [t('funnel.qualified'), qualified, pct(qualified),'#10b981'],
          [t('funnel.interview'), interview, pct(interview),'#8b5cf6'],
          [t('funnel.accepted'),  accepted,  pct(accepted), '#22c55e'],
        ];
        return rows.map(([label, val, p, color]) => `
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
            <div style="width:160px;font-size:13px;color:var(--text-2);flex-shrink:0">${label}</div>
            <div style="flex:1;height:24px;background:var(--surface-3);border-radius:6px;overflow:hidden;position:relative">
              <div style="height:100%;width:${Math.max(p, 3)}%;background:${color};border-radius:6px;transition:width .5s ease"></div>
            </div>
            <div style="width:90px;text-align:right;flex-shrink:0;font-size:13px;font-weight:700;color:var(--text)">${val} <span style="color:var(--text-3);font-weight:500;font-size:11px">(${p}%)</span></div>
          </div>`).join('');
      })()}
    </div>
  </div>

  <div class="db-card">
    <div class="db-card-head">
      <span class="db-card-title">${t('dashboard.mdg_title')}</span>
    </div>
    <div style="padding:16px 20px">
      <div class="db-mdg-grid" style="margin-bottom:20px">
        ${dbMdg(t('dashboard.mdg_approved'),    mdg.offres?.approuvees||0, mdg.offres?.total||0, '#22c55e', t('dashboard.mdg_sub.inspection'))}
        ${dbMdg(t('dashboard.mdg_pending'),     (mdg.offres?.total||0)-(mdg.offres?.approuvees||0), mdg.offres?.total||0, '#f59e0b', t('dashboard.mdg_sub.not_approved'))}
        ${dbMdg(t('dashboard.mdg_to_call'),     mdg.candidatures?.aAppeler||0, mdg.candidatures?.total||0, '#3b82f6', t('dashboard.mdg_sub.no_rdv'))}
        ${dbMdg(t('dashboard.mdg_tests'),       mdg.candidatures?.testConvoques||0, mdg.candidatures?.total||0, '#8b5cf6', t('dashboard.mdg_sub.scenario_c'))}
        ${dbMdg(t('dashboard.mdg_tests_done'),  mdg.candidatures?.testPasses||0, mdg.candidatures?.total||0, '#06b6d4', t('dashboard.mdg_sub.post_test'))}
        ${dbMdg(t('dashboard.mdg_rdv'),         mdg.candidatures?.rdvPris||0, mdg.candidatures?.total||0, '#10b981', t('dashboard.mdg_sub.scheduled'))}
      </div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);margin-bottom:10px">${t('dashboard.mdg_channels')}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${(mdg.canaux||[]).map(c => {
          return `<div class="db-canal-pill">
            <div class="db-canal-val">${c.count}</div>
            <div class="db-canal-lbl">${channelBadge(c._id).replace(/<[^>]*>/g,'').trim() || c._id || '—'}</div>
          </div>`;
        }).join('') || `<span style="font-size:13px;color:var(--text-3)">${t('dashboard.mdg_no_data')}</span>`}
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
  return `<div class="db-mdg-item" style="border-left-color:${color}">
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
