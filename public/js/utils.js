/* ── Company branding config ── */
const COMPANY_CONFIG = {
  solumada: { logo: 'https://www.solumada.mg/wp-content/uploads/2024/05/New-one.png', name: 'Solumada', theme: 'solumada' },
  optimum:  { logo: 'https://optimumsolutions.eu/wp-content/uploads/2023/04/text-annotations-1.png', name: 'Optimum Solutions', theme: 'optimum' },
};

/* ── Auth ── */
const Auth = {
  token: () => localStorage.getItem('rh_token'),
  user:  () => { try { return JSON.parse(localStorage.getItem('rh_user')); } catch { return null; } },
  save:  (token, user) => { localStorage.setItem('rh_token', token); localStorage.setItem('rh_user', JSON.stringify(user)); },
  clear: () => { localStorage.removeItem('rh_token'); localStorage.removeItem('rh_user'); },
  isLogged: () => !!localStorage.getItem('rh_token'),
  theme: () => localStorage.getItem('rh_theme') || Auth.user()?.theme || 'solumada',
};

/* ── API ── */
const api = {
  _fetch: async (url, opts = {}) => {
    const res = await fetch(url, {
      ...opts,
      headers: {
        ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(Auth.token() ? { 'Authorization': `Bearer ${Auth.token()}` } : {}),
        'X-Lang': (Auth.user()?.company === 'optimum') ? 'en' : 'fr',
        ...(opts.headers || {}),
      },
    });
    if (res.status === 401) { Auth.clear(); location.href = '/login'; return; }
    return res.json();
  },
  get:    (url)           => api._fetch(url),
  post:   (url, data)     => api._fetch(url, { method: 'POST',  body: data instanceof FormData ? data : JSON.stringify(data) }),
  patch:  (url, data)     => api._fetch(url, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (url)           => api._fetch(url, { method: 'DELETE' }),
};

/* ── Anti double-click: disable button while async action runs ── */
function withLoading(btn, asyncFn) {
  if (!btn || btn.disabled) return Promise.resolve();
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="width:13px;height:13px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:2px"></span>`;
  return Promise.resolve(asyncFn()).finally(() => {
    btn.disabled = false;
    btn.innerHTML = orig;
  });
}

/* ── Theme ── */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('rh_theme', theme);
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
}
async function switchTheme(theme) {
  applyTheme(theme);
  await api.patch('/api/auth/theme', { theme });
}

/* ── Toast ── */
function toast(msg, type = 'info', duration = 3200) {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

/* ── Score helpers ── */
function scoreColor(s) {
  if (s >= 7) return '#16a34a';
  if (s >= 4) return '#d97706';
  return '#dc2626';
}
function renderBadge(recommendation) {
  const map = {
    QUALIFIE:        ['badge-green', t('reco.qualified')],
    A_REVOIR:        ['badge-amber', t('reco.to_review')],
    NON_SELECTIONNE: ['badge-red',   t('reco.rejected')],
  };
  const [cls, label] = map[recommendation] || ['badge-gray', '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}
function renderScoreBar(score) {
  if (score == null) return `<span class="badge badge-gray">${t('badge.pending')}</span>`;
  const c = scoreColor(score);
  return `<div class="score-wrap"><div class="score-bar"><div class="score-fill" style="width:${score*10}%;background:${c}"></div></div><span class="score-num" style="color:${c}">${score}/10</span></div>`;
}

// Compact colored pill — use in tables instead of the full bar
function renderScorePill(score) {
  if (score == null) return `<span class="badge badge-gray">${t('badge.pending')}</span>`;
  const s = parseFloat(score);
  const [fg, bg, br] = s >= 7
    ? ['#15803d', '#dcfce7', '#bbf7d0']
    : s >= 4
    ? ['#854d0e', '#fef9c3', '#fde68a']
    : ['#991b1b', '#fee2e2', '#fecaca'];
  return `<span style="display:inline-flex;align-items:baseline;gap:1px;background:${bg};color:${fg};border:1px solid ${br};border-radius:7px;padding:3px 9px;font-family:var(--mono);font-weight:800;font-size:13px;letter-spacing:-.02em">${s}<span style="font-size:10px;opacity:.55;font-weight:500;margin-left:1px">/10</span></span>`;
}

// Avatar background gradient by AI recommendation
function avatarColor(recommendation) {
  if (recommendation === 'QUALIFIE')        return 'background:linear-gradient(135deg,#16a34a,#22c55e)';
  if (recommendation === 'A_REVOIR')        return 'background:linear-gradient(135deg,#d97706,#f59e0b)';
  if (recommendation === 'NON_SELECTIONNE') return 'background:linear-gradient(135deg,#dc2626,#ef4444)';
  return 'background:linear-gradient(140deg,var(--grad-start),var(--grad-end))';
}

/* ── Dates ── */
const _dateLocale = LANG === 'en' ? 'en-GB' : 'fr-FR';
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(_dateLocale, { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDatetime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(_dateLocale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function timeAgo(d) {
  if (!d) return '—';
  const diff = Date.now() - new Date(d);
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), days = Math.floor(h / 24);
  if (LANG === 'en') {
    if (days > 0) return `${days}d ago`;
    if (h > 0)    return `${h}h ago`;
    if (m > 0)    return `${m}min ago`;
    return 'just now';
  }
  if (days > 0) return `il y a ${days}j`;
  if (h > 0)    return `il y a ${h}h`;
  if (m > 0)    return `il y a ${m}min`;
  return 'à l\'instant';
}

/* ── Misc ── */
// Debounce: returns a wrapper that delays calling fn until `wait` ms after the last call
function debounce(fn, wait = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}
function initials(name) { return (name || '?').split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2); }
// email_recruteur holds one or more comma-separated addresses — checks membership instead of equality
function emailListIncludes(field, email) {
  if (!field || !email) return false;
  const needle = String(email).trim().toLowerCase();
  return String(field).split(',').map(s => s.trim().toLowerCase()).includes(needle);
}
function copyText(text, msg) {
  navigator.clipboard.writeText(text).then(() => toast(msg || t('toast.copied'), 'success'));
}
function offerStatusBadge(s) {
  const labels = { 'Active': t('status.active'), 'Fermée': t('status.closed'), 'En pause': t('status.paused') };
  const cls    = { 'Active': 'badge-green', 'Fermée': 'badge-gray', 'En pause': 'badge-amber' };
  return `<span class="badge ${cls[s] || 'badge-gray'}">${labels[s] || s}</span>`;
}
function channelBadge(channel) {
  const map = {
    plateforme: ['badge-blue',  t('channel.platform')],
    telephone:  ['badge-amber', t('channel.phone')],
    physique:   ['badge-gray',  t('channel.physical')],
    email:      ['badge-accent', t('channel.email')],
  };
  const [cls, label] = map[channel] || ['badge-gray', channel || '—'];
  return `<span class="badge ${cls}" style="font-size:10px">${label}</span>`;
}

/* ── Upload zones ── */
function initUploadZone(zoneId, inputId) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const dt = new DataTransfer();
    if (e.dataTransfer.files[0]) dt.items.add(e.dataTransfer.files[0]);
    input.files = dt.files; input.dispatchEvent(new Event('change'));
  });
  input.addEventListener('change', () => {
    const f = input.files[0];
    zone.classList.toggle('has-file', !!f);
    const icon = zone.querySelector('.uz-icon'); if (icon) icon.textContent = f ? '✅' : (inputId.includes('cv') ? '📄' : '📝');
    const name = zone.querySelector('.uz-name'); if (name) name.textContent = f ? f.name : '';
  });
}

/* ── Tabs ── */
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const parent = btn.closest('[data-tabgroup]') || document;
      parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      parent.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(btn.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });
}

/* ── Protected files ── */
function fileUrl(storedPath) {
  if (!storedPath) return '#';
  const filename = storedPath.split('/').pop();
  return `/api/uploads/${encodeURIComponent(filename)}?token=${Auth.token()}`;
}

/* ── Guard ── */
function requireAuth() {
  if (!Auth.isLogged()) { location.href = '/login'; return false; }
  applyTheme(Auth.theme());
  return true;
}

/* ── Sidebar active state ── */
function setActiveNav(page) {
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

// Cal.com stores times as UTC — convert date+heure strings to company local timezone
function rdvAdjustForTimezone(date, heure, company) {
  if (!date || !heure) return { date, heure };
  try {
    const iso    = `${date}T${heure}:00.000Z`;
    const d      = new Date(iso);
    if (isNaN(d.getTime())) return { date, heure };
    const offset = ((company || Auth.user()?.company || 'solumada') === 'optimum') ? 4 : 3;
    const local  = new Date(d.getTime() + offset * 3600000);
    return {
      date:  `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`,
      heure: `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`,
    };
  } catch {
    return { date, heure };
  }
}
