const ACTION_MAP = {
  OFFRE_CREEE:           ['Offre créée',          'badge-green'],
  OFFRE_MODIFIEE:        ['Offre modifiée',        'badge-blue'],
  OFFRE_SUPPRIMEE:       ['Offre supprimée',       'badge-red'],
  CANDIDATURE_RECUE:     ['Candidature reçue',     'badge-green'],
  CANDIDATURE_MANUELLE:  ['Saisie manuelle',       'badge-blue'],
  CANDIDATURE_QUALIFIEE: ['Candidat qualifié',     'badge-accent'],
  CANDIDATURE_ELIMINEE:  ['Candidature supprimée', 'badge-red'],
  ANALYSE_IA_RECUE:      ['Analyse IA reçue',      'badge-accent'],
  EMAIL_QUALIF_ENVOYE:   ['Email qualification',   'badge-blue'],
  WF_RELANCE:            ['WF relancé',            'badge-amber'],
  WF_ECHEC:              ['WF échoué',             'badge-red'],
  RDV_PLANIFIE:          ['RDV planifié',          'badge-blue'],
  STATUT_CHANGE:         ['Statut changé',         'badge-amber'],
  USER_LOGIN:            ['Connexion',             'badge-gray'],
};

let _auditPage = 1;
let _auditTimer = null;

async function renderAudit() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
  <div class="filters-bar" style="margin-bottom:16px">
    <input class="filter-input" id="a-q" placeholder="Rechercher par nom, email..." style="flex:1;min-width:180px">
    <select class="filter-select" id="a-action" onchange="loadAudit(1)">
      <option value="">Toutes les actions</option>
      <option value="OFFRE_CREEE">Offre créée</option>
      <option value="OFFRE_MODIFIEE">Offre modifiée</option>
      <option value="OFFRE_SUPPRIMEE">Offre supprimée</option>
      <option value="CANDIDATURE_RECUE">Candidature reçue</option>
      <option value="CANDIDATURE_MANUELLE">Saisie manuelle</option>
      <option value="CANDIDATURE_QUALIFIEE">Candidat qualifié</option>
      <option value="CANDIDATURE_ELIMINEE">Candidature supprimée</option>
      <option value="ANALYSE_IA_RECUE">Analyse IA reçue</option>
      <option value="EMAIL_QUALIF_ENVOYE">Email qualification</option>
      <option value="WF_RELANCE">WF relancé</option>
      <option value="WF_ECHEC">WF échoué</option>
      <option value="RDV_PLANIFIE">RDV planifié</option>
      <option value="STATUT_CHANGE">Statut changé</option>
      <option value="USER_LOGIN">Connexion</option>
    </select>
    <select class="filter-select" id="a-type" onchange="loadAudit(1)">
      <option value="">Tous les types</option>
      <option value="offre">Offres</option>
      <option value="candidature">Candidatures</option>
      <option value="user">Connexions</option>
    </select>
    <button class="btn btn-ghost btn-sm" onclick="loadAudit(1)">↻ Actualiser</button>
  </div>

  <div class="card">
    <div class="card-body" style="padding:0" id="audit-body">
      <div style="display:flex;justify-content:center;padding:32px"><div class="spinner" style="width:24px;height:24px"></div></div>
    </div>
  </div>
  <div id="audit-pagination" style="display:flex;justify-content:center;gap:8px;margin-top:16px"></div>`;

  document.getElementById('a-q').addEventListener('input', () => {
    clearTimeout(_auditTimer);
    _auditTimer = setTimeout(() => loadAudit(1), 300);
  });

  loadAudit(1);
}

async function loadAudit(page) {
  if (page !== undefined) _auditPage = page;
  const body = document.getElementById('audit-body');
  if (!body) return;

  const q           = document.getElementById('a-q')?.value.trim() || '';
  const action      = document.getElementById('a-action')?.value || '';
  const entity_type = document.getElementById('a-type')?.value || '';

  const params = new URLSearchParams({ page: _auditPage, limit: 50 });
  if (q)           params.set('q', q);
  if (action)      params.set('action', action);
  if (entity_type) params.set('entity_type', entity_type);

  const r = await api.get('/api/audit?' + params);
  const logs  = r?.logs  || [];
  const total = r?.total || 0;
  const pages = r?.pages || 1;

  if (!logs.length) {
    body.innerHTML = `<div class="empty-state" style="padding:48px"><p>Aucune entrée dans l'historique</p></div>`;
    document.getElementById('audit-pagination').innerHTML = '';
    return;
  }

  body.innerHTML = `
  <div class="table-wrap" style="border-radius:var(--r)">
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;background:var(--surface-2)">
          <th style="padding:10px 16px;font-weight:600;text-align:left;white-space:nowrap">Date</th>
          <th style="padding:10px 16px;font-weight:600;text-align:left">Action</th>
          <th style="padding:10px 16px;font-weight:600;text-align:left">Entité</th>
          <th style="padding:10px 16px;font-weight:600;text-align:left">Utilisateur</th>
          <th style="padding:10px 16px;font-weight:600;text-align:left">Détails</th>
        </tr>
      </thead>
      <tbody>
        ${logs.map(renderAuditRow).join('')}
      </tbody>
    </table>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;font-size:13px;color:var(--text-3);border-top:1px solid var(--border)">
    <span>${total.toLocaleString('fr-FR')} entrée${total > 1 ? 's' : ''}</span>
    <span>Page ${_auditPage} / ${pages}</span>
  </div>`;

  const pg = document.getElementById('audit-pagination');
  if (pg) {
    pg.innerHTML = pages <= 1 ? '' : `
      <button class="btn btn-ghost btn-sm" onclick="loadAudit(${_auditPage - 1})" ${_auditPage <= 1 ? 'disabled' : ''}>&larr; Précédent</button>
      <button class="btn btn-ghost btn-sm" onclick="loadAudit(${_auditPage + 1})" ${_auditPage >= pages ? 'disabled' : ''}>Suivant &rarr;</button>`;
  }
}

function renderAuditRow(log) {
  const [label, cls] = ACTION_MAP[log.action] || [log.action, 'badge-gray'];
  const icon = { offre: '📋', candidature: '👤', user: '🔑' }[log.entity_type] || '•';

  const detailStr = Object.entries(log.details || {})
    .filter(([k, v]) => v !== null && v !== '' && v !== undefined)
    .map(([k, v]) => `<span style="font-size:11px;color:var(--text-3)">${k}:&nbsp;<b style="color:var(--text-2)">${v}</b></span>`)
    .join('<br>');

  return `<tr style="border-top:1px solid var(--border);font-size:13px;transition:background .15s" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background=''">
    <td style="padding:10px 16px;white-space:nowrap;color:var(--text-3);font-size:12px">${formatDatetime(log.created_at)}</td>
    <td style="padding:10px 16px"><span class="badge ${cls}" style="white-space:nowrap">${label}</span></td>
    <td style="padding:10px 16px">
      <div style="display:flex;align-items:center;gap:6px">
        <span>${icon}</span>
        <div>
          <div style="font-weight:500">${log.entity_label || '—'}</div>
          ${log.entity_id ? `<div style="font-size:11px;color:var(--text-3);font-family:var(--mono)">${log.entity_id.slice(-10)}</div>` : ''}
        </div>
      </div>
    </td>
    <td style="padding:10px 16px;color:var(--text-2);font-size:12px">${log.user_email || '—'}</td>
    <td style="padding:10px 16px;line-height:1.8">${detailStr || '<span style="color:var(--text-3)">—</span>'}</td>
  </tr>`;
}
