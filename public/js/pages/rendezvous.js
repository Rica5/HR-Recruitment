let _rdvList       = [];
let _rdvFilter     = 'all';
let _rdvFilterMine = false;

async function renderRDV() {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner" style="width:28px;height:28px"></div></div>`;

  const r = await api.get('/api/candidatures?limit=500');
  const today = rdvStartOfToday();

  _rdvList = (r?.candidatures || [])
    .filter(c => c.rdv_pris && c.rdv_manuel?.date && new Date(c.rdv_manuel.date) >= today)
    .sort((a, b) => new Date(a.rdv_manuel.date) - new Date(b.rdv_manuel.date));

  _rdvFilter     = 'all';
  _rdvFilterMine = false;
  drawRDVPage();
}

function rdvStartOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function rdvGetBaseList() {
  if (!_rdvFilterMine) return _rdvList;
  const myEmail = Auth.user()?.email;
  return _rdvList.filter(c => c.email_recruteur === myEmail);
}

function rdvGetFiltered() {
  const base = rdvGetBaseList();
  const now  = rdvStartOfToday();
  if (_rdvFilter === 'week') {
    const dow   = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const start = new Date(now); start.setDate(start.getDate() - dow);
    const end   = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999);
    return base.filter(c => { const d = new Date(c.rdv_manuel.date); return d >= start && d <= end; });
  }
  if (_rdvFilter === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return base.filter(c => { const d = new Date(c.rdv_manuel.date); return d >= start && d <= end; });
  }
  if (_rdvFilter === 'nextmonth') {
    const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
    return base.filter(c => { const d = new Date(c.rdv_manuel.date); return d >= start && d <= end; });
  }
  return base;
}

function setRdvFilter(f) {
  _rdvFilter = f;
  drawRDVPage();
}

function toggleRdvMine() {
  _rdvFilterMine = !_rdvFilterMine;
  drawRDVPage();
}

function rdvCountFor(f) {
  const prev = _rdvFilter;
  _rdvFilter = f;
  const n = rdvGetFiltered().length;
  _rdvFilter = prev;
  return n;
}

function rdvUrgencyBadge(dateStr) {
  const d    = new Date(dateStr);
  const now  = new Date();
  const diff = (d - now) / (1000 * 60 * 60); // heures
  if (diff < 24)  return `<span class="badge badge-red" style="font-size:10px">🔴 Aujourd'hui</span>`;
  if (diff < 72)  return `<span class="badge badge-amber" style="font-size:10px">🟡 J-${Math.ceil(diff/24)}</span>`;
  return '';
}

function rdvTypeBadge(type) {
  if (type === 'visio')       return `<span class="badge badge-blue" style="font-size:10px">🖥 Visio</span>`;
  if (type === 'presentiel')  return `<span class="badge badge-green" style="font-size:10px">🤝 Présentiel</span>`;
  return '';
}

// When type_rdv is "" the stored time is UTC — offset to local company timezone
function rdvAdjustForTimezone(date, heure, company) {
  if (!heure) return { date, heure };
  const offset = company === 'optimum' ? 2 : 3; // optimum = UTC+2, solumada = UTC+3
  const [hStr, mStr] = heure.split(':');
  const totalMin = parseInt(hStr, 10) * 60 + (parseInt(mStr, 10) || 0) + offset * 60;
  let adjH = Math.floor(totalMin / 60);
  const adjM = totalMin % 60;
  let adjDate = date;
  if (adjH >= 24) {
    adjH -= 24;
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    adjDate = d.toISOString().split('T')[0];
  }
  return {
    date:  adjDate,
    heure: `${String(adjH).padStart(2, '0')}:${String(adjM).padStart(2, '0')}`,
  };
}

function drawRDVPage() {
  const el      = document.getElementById('page-content');
  const list    = rdvGetFiltered();
  const total   = rdvGetBaseList().length;

  const chipStyle = (f) => _rdvFilter === f
    ? 'background:var(--accent);color:white;border-color:var(--accent)'
    : 'background:var(--surface-2);color:var(--text-2);border-color:var(--border)';

  const mineStyle = _rdvFilterMine
    ? 'background:var(--accent-soft);color:var(--accent-dark);border-color:var(--accent);font-weight:700'
    : 'background:var(--surface-2);color:var(--text-2);border-color:var(--border);font-weight:600';

  el.innerHTML = `
  <!-- Chips filtres -->
  <div class="filters-bar" style="margin-bottom:20px">
    <button class="btn btn-sm" onclick="setRdvFilter('all')"       style="${chipStyle('all')};border:1.5px solid;font-weight:600;transition:.15s">Tout (${total})</button>
    <button class="btn btn-sm" onclick="setRdvFilter('week')"      style="${chipStyle('week')};border:1.5px solid;font-weight:600;transition:.15s">Cette semaine (${rdvCountFor('week')})</button>
    <button class="btn btn-sm" onclick="setRdvFilter('month')"     style="${chipStyle('month')};border:1.5px solid;font-weight:600;transition:.15s">Ce mois (${rdvCountFor('month')})</button>
    <button class="btn btn-sm" onclick="setRdvFilter('nextmonth')" style="${chipStyle('nextmonth')};border:1.5px solid;font-weight:600;transition:.15s">Prochain mois (${rdvCountFor('nextmonth')})</button>
    <button class="btn btn-sm" onclick="toggleRdvMine()" style="${mineStyle};border:1.5px solid;transition:.15s;margin-left:auto">👤 Mes RDV</button>
  </div>

  <!-- Compteur -->
  <div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:14px">
    ${list.length} entretien${list.length !== 1 ? 's' : ''} à venir
  </div>

  <!-- Liste -->
  <div style="display:flex;flex-direction:column;gap:10px">
    ${list.length === 0 ? `
    <div class="empty-state" style="padding:64px 0">
      <div class="empty-icon">📅</div>
      <p>Aucun entretien planifié pour cette période</p>
      <button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="navigate('candidatures')">Voir les candidatures</button>
    </div>` : list.map(c => {
      const rdv    = c.rdv_manuel;
      const rdvAdj = (!rdv.type_rdv) ? rdvAdjustForTimezone(rdv.date, rdv.heure, c.company) : { date: rdv.date, heure: rdv.heure };
      const dStr   = formatDate(rdvAdj.date);
      const heure  = rdvAdj.heure ? `à ${rdvAdj.heure}` : '';
      const lieu   = rdv.lieu ? `📍 ${rdv.lieu}` : '';
      return `
    <div onclick="window._pendingCandDetail='${c._id}';navigate('candidatures')" style="display:flex;align-items:center;gap:14px;padding:14px 18px;background:var(--surface);border-radius:var(--r-xl);border:1px solid var(--border-soft);cursor:pointer;transition:all var(--transition)" onmouseover="this.style.boxShadow='var(--shadow)';this.style.borderColor='var(--border)'" onmouseout="this.style.boxShadow='none';this.style.borderColor='var(--border-soft)'">

      <!-- Avatar + info candidat -->
      <div class="avatar" style="width:44px;height:44px;font-size:15px;flex-shrink:0;box-shadow:var(--shadow-xs)">${initials(c.candidat_nom)}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-size:14px;font-weight:700;color:var(--text)">${c.candidat_nom}</span>
          ${c.recommandation ? renderBadge(c.recommandation) : ''}
          ${rdvTypeBadge(rdv.type_rdv)}
          ${rdvUrgencyBadge(rdvAdj.date)}
        </div>
        <div style="font-size:12px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.titre_poste}</div>
      </div>

      <!-- Date + lieu -->
      <div style="text-align:right;flex-shrink:0;min-width:140px">
        <div style="font-size:14px;font-weight:700;color:var(--accent-mid)">📅 ${dStr}</div>
        ${heure ? `<div style="font-size:12px;color:var(--text-2);margin-top:2px">🕐 ${rdvAdj.heure}</div>` : ''}
        ${lieu  ? `<div style="font-size:11px;color:var(--text-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${lieu}</div>` : ''}
      </div>

      <svg style="width:14px;height:14px;color:var(--text-3);flex-shrink:0;margin-left:4px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
    </div>`;
    }).join('')}
  </div>`;
}
