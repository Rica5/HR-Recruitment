async function renderDashboard() {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner" style="width:28px;height:28px"></div></div>`;

  const [statsResponse, offersResponse, applicationsResponse, madagascarResponse] = await Promise.all([
    api.get('/api/offres/stats/summary'),
    api.get('/api/offres?statut=Active'),
    api.get('/api/candidatures'),
    api.get('/api/offres/stats/madagascar'),
  ]);
  const stats = statsResponse?.stats || {};
  const jobOffers = offersResponse?.offres || [];
  const applications = applicationsResponse?.candidatures || [];
  const recentApplications = applications.slice(0, 6);
  const madagascarStats = madagascarResponse?.stats || {};

  el.innerHTML = `
  <div class="stats-grid">
    ${statCard('Offres actives', stats.activeOffers||0, svgBriefcase(), 'accent', '↑ actives')}
    ${statCard('Candidatures', stats.totalApplications||0, svgUsers(), 'blue', 'total reçues')}
    ${statCard('Qualifiés', stats.qualified||0, svgCheck(), 'green', 'score ≥ 7')}
    ${statCard('À revoir', stats.toReview||0, svgEye(), 'amber', 'score 4–6')}
  </div>

  <div class="dashboard-2col">
    <!-- Active job offers -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Offres actives</span>
        <button class="btn btn-ghost btn-sm" onclick="navigate('offres')">Voir tout →</button>
      </div>
      <div style="padding:8px 12px">
        ${jobOffers.length === 0
          ? `<div class="empty-state"><div class="empty-icon">📭</div><p>Aucune offre active</p></div>`
          : jobOffers.slice(0,5).map(o => {
            const count = applications.filter(c => c.offre_id === o.offre_id).length;
            return `<div style="display:flex;align-items:center;gap:12px;padding:10px 10px;border-radius:var(--r);cursor:pointer;transition:background var(--transition)" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''" onclick="navigate('offres')">
              <div style="width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0"></div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.titre_poste}</div>
                <div style="font-size:11px;color:var(--text-3)">📍 ${o.localisation} · 📄 ${o.type_contrat}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:15px;font-weight:700;color:var(--text)">${count}</div>
                <div style="font-size:10px;color:var(--text-3)">candidats</div>
              </div>
            </div>`;
          }).join('')}
      </div>
    </div>

    <!-- Recent applications -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Candidatures récentes</span>
        <button class="btn btn-ghost btn-sm" onclick="navigate('candidatures')">Voir tout →</button>
      </div>
      <div style="padding:8px 12px">
        ${recentApplications.length === 0
          ? `<div class="empty-state"><div class="empty-icon">👤</div><p>Aucune candidature</p></div>`
          : recentApplications.map(c => `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:var(--r);cursor:pointer;transition:background var(--transition)" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''" onclick="location.href='/candidature/${c._id}'">
            <div class="avatar" style="width:32px;height:32px;font-size:11px">${initials(c.candidat_nom)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--text)">${c.candidat_nom}</div>
              <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.titre_poste}</div>
            </div>
            <div>${c.recommandation ? renderBadge(c.recommandation) : '<span class="badge badge-gray">—</span>'}</div>
          </div>`).join('')}
      </div>
    </div>
  </div>

  <!-- Summary table -->
  <div class="card">
    <div class="card-header">
      <span class="card-title">Résumé des candidatures par offre</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Offre</th><th>Contrat</th><th>Total</th><th>Qualifiés</th><th>À revoir</th><th>Non retenus</th><th>Statut</th></tr></thead>
        <tbody>
          ${jobOffers.length === 0
            ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-3)">Aucune offre</td></tr>`
            : jobOffers.map(o => {
              const offerApplications = applications.filter(c => c.offre_id === o.offre_id);
              const qualifiedCount  = offerApplications.filter(c=>c.recommandation==='QUALIFIE').length;
              const reviewCount     = offerApplications.filter(c=>c.recommandation==='A_REVOIR').length;
              const rejectedCount   = offerApplications.filter(c=>c.recommandation==='NON_SELECTIONNE').length;
              return `<tr onclick="navigate('offres')">
                <td><span style="font-weight:600;font-size:13px">${o.titre_poste}</span></td>
                <td><span class="badge badge-gray">${o.type_contrat}</span></td>
                <td style="font-weight:600">${offerApplications.length}</td>
                <td><span style="color:#16a34a;font-weight:600">${qualifiedCount}</span></td>
                <td><span style="color:#d97706;font-weight:600">${reviewCount}</span></td>
                <td><span style="color:#dc2626;font-weight:600">${rejectedCount}</span></td>
                <td>${offerStatusBadge(o.statut)}</td>
              </tr>`;
            }).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Madagascar HR Process section -->
  <div class="card">
    <div class="card-header">
      <span class="card-title">🇲🇬 Conformité Processus RH — Madagascar</span>
    </div>
    <div style="padding:16px 20px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px">
        ${renderMadagascarStatMini('Offres approuvées', madagascarStats.offres?.approuvees||0, madagascarStats.offres?.total||0, '#16a34a', '✓ Inspection')}
        ${renderMadagascarStatMini('En attente inspection', (madagascarStats.offres?.total||0)-(madagascarStats.offres?.approuvees||0), madagascarStats.offres?.total||0, '#d97706', '⏳ Non approuvées')}
        ${renderMadagascarStatMini('À appeler', madagascarStats.candidatures?.aAppeler||0, madagascarStats.candidatures?.total||0, '#0369a1', '📞 Sans RDV')}
        ${renderMadagascarStatMini('Tests convoqués', madagascarStats.candidatures?.testConvoques||0, madagascarStats.candidatures?.total||0, '#7c3aed', '📋 Scénario C')}
        ${renderMadagascarStatMini('Tests passés', madagascarStats.candidatures?.testPasses||0, madagascarStats.candidatures?.total||0, '#0891b2', '✅ Post-test')}
        ${renderMadagascarStatMini('RDV confirmés', madagascarStats.candidatures?.rdvPris||0, madagascarStats.candidatures?.total||0, '#16a34a', '📅 Planifiés')}
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);margin-bottom:10px">Répartition des candidatures par canal</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${(madagascarStats.canaux||[]).map(c => {
            const labels = { plateforme:'🌐 Plateforme', email:'📧 Email', appel:'📞 Appel', spontanee:'💼 Spontanée' };
            return `<div style="background:var(--surface-2);border-radius:var(--r);padding:8px 14px;text-align:center">
              <div style="font-size:15px;font-weight:700;color:var(--text)">${c.count}</div>
              <div style="font-size:11px;color:var(--text-3)">${labels[c._id]||c._id||'—'}</div>
            </div>`;
          }).join('') || '<span style="font-size:13px;color:var(--text-3)">Aucune donnée</span>'}
        </div>
      </div>
    </div>
  </div>`;
}

function renderMadagascarStatMini(label, value, total, color, sub) {
  const pct = total > 0 ? Math.round(value / total * 100) : 0;
  return `<div style="background:var(--surface-2);border-radius:var(--r);padding:12px 14px">
    <div style="font-size:18px;font-weight:800;color:${color}">${value}</div>
    <div style="font-size:11px;font-weight:600;color:var(--text);margin:2px 0">${label}</div>
    <div style="font-size:10px;color:var(--text-3)">${sub}</div>
    ${total > 0 ? `<div style="margin-top:6px;height:3px;background:var(--border-soft);border-radius:99px"><div style="height:100%;width:${pct}%;background:${color};border-radius:99px"></div></div>` : ''}
  </div>`;
}

function statCard(label, value, icon, color, trend) {
  const colors = { accent:'var(--accent-light)', blue:'#dbeafe', green:'#dcfce7', amber:'#fef3c7' };
  const textColors = { accent:'var(--accent-mid)', blue:'#2563eb', green:'#16a34a', amber:'#d97706' };
  return `<div class="stat-card">
    <div class="stat-top">
      <div class="stat-icon-wrap" style="background:${colors[color]}">${icon.replace('currentColor', textColors[color])}</div>
      <span class="stat-trend trend-up">${trend}</span>
    </div>
    <div class="stat-value">${value}</div>
    <div class="stat-label">${label}</div>
  </div>`;
}
function svgBriefcase(){ return `<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>`; }
function svgUsers(){     return `<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`; }
function svgCheck(){     return `<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`; }
function svgEye(){       return `<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`; }
