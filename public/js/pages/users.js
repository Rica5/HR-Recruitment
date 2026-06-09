let _users = [];

async function renderUsers() {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner" style="width:28px;height:28px"></div></div>`;
  await loadUsers();
}

async function loadUsers() {
  const r = await api.get('/api/users');
  _users = r?.users || [];
  drawUsersPage();
}

function drawUsersPage() {
  const el = document.getElementById('page-content');
  const currentUser = Auth.user();
  const activeLabel   = t('users.active');
  const inactiveLabel = t('users.inactive');

  el.innerHTML = `
  <div class="users-page">
    <div class="card" style="overflow:hidden">
      <div class="card-header">
        <span class="card-title">👥 ${t('users.title')}</span>
        <button class="btn btn-primary btn-sm" onclick="openUserModal()">${t('btn.create_user')}</button>
      </div>
      <div class="table-wrap">
        <table class="users-table">
          <thead>
            <tr>
              <th>${t('table.name')}</th>
              <th>${t('table.email')}</th>
              <th class="users-col-company">${t('table.company')}</th>
              <th>${t('table.status')}</th>
              <th class="users-col-date">${t('users.last_login')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${_users.length === 0
              ? `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👤</div><p>${t('empty.no_users')}</p></div></td></tr>`
              : _users.map(u => `
              <tr>
                <td>
                  <div class="users-user-cell">
                    <div class="avatar" style="width:34px;height:34px;font-size:13px;flex-shrink:0">${initials(u.nom)}</div>
                    <div class="users-user-info">
                      <span class="users-user-name">${u.nom}</span>
                      <span class="users-user-role">${u.role}</span>
                    </div>
                  </div>
                </td>
                <td class="users-email">${u.email}</td>
                <td class="users-col-company">${companyBadge(u.company)}</td>
                <td>${u.actif !== false ? `<span class="badge badge-green">${activeLabel}</span>` : `<span class="badge badge-gray">${inactiveLabel}</span>`}</td>
                <td class="users-date users-col-date">${u.lastLogin ? formatDatetime(u.lastLogin) : t('users.never')}</td>
                <td>
                  <div class="users-actions">
                    <button class="btn-icon" title="${t('btn.edit')}" onclick="openUserModal('${u._id}')">✏️</button>
                    ${u.email !== currentUser?.email ? `<button class="btn-icon" title="${t('btn.toggle_active')}" onclick="toggleUserActif('${u._id}')">${u.actif !== false ? '🔒' : '🔓'}</button>` : ''}
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  ${userModalHTML()}`;
}

function companyBadge(company) {
  const cfg = COMPANY_CONFIG[company] || COMPANY_CONFIG.solumada;
  return `<span class="badge badge-accent" style="font-size:11px">${cfg.name}</span>`;
}

function userModalHTML() {
  const pwdHint = t('users.pwd_hint');
  const subtitleLabel = t('users.subtitle');
  return `
  <div id="modal-user" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:100;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)" onclick="if(event.target===this)closeUserModal()">
    <div class="modal-card" style="background:var(--surface);border-radius:var(--r-2xl);width:100%;max-width:460px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow-lg)">

      <div style="background:linear-gradient(135deg,var(--grad-start),var(--grad-end));padding:22px 24px 18px;position:relative;overflow:hidden;flex-shrink:0">
        <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.08);pointer-events:none"></div>
        <div style="position:absolute;bottom:-20px;left:40px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.06);pointer-events:none"></div>
        <div style="display:flex;align-items:center;gap:14px;position:relative;z-index:1">
          <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">👤</div>
          <div style="flex:1;min-width:0">
            <div id="user-modal-title" style="font-size:17px;font-weight:800;color:#fff;letter-spacing:-.02em">${t('users.modal_create')}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.65);margin-top:2px;font-weight:500">${subtitleLabel}</div>
          </div>
          <button class="btn-icon" onclick="closeUserModal()" style="background:rgba(255,255,255,.15);color:#fff;border-color:transparent;flex-shrink:0">✕</button>
        </div>
      </div>

      <div style="padding:24px;overflow-y:auto;flex:1">
        <input type="hidden" id="user-modal-id">
        <div class="form-grid">
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">${t('form.full_name')} <span class="req">*</span></label>
            <input class="form-control" id="um-nom" placeholder="Jean Dupont">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">${t('form.email')} <span class="req">*</span></label>
            <input class="form-control" type="email" id="um-email" placeholder="jean@exemple.mg">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label">${t('users.company')} <span class="req">*</span></label>
            <select class="form-control" id="um-company">
              <option value="solumada">Solumada</option>
              <option value="optimum">Optimum Solutions</option>
            </select>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label class="form-label" id="um-pwd-label">${t('form.password')} <span class="req">*</span></label>
            <div style="display:flex;gap:8px">
              <input class="form-control" type="text" id="um-pwd" placeholder="${pwdHint}" style="flex:1;font-family:var(--mono);font-size:13px;letter-spacing:.03em">
              <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('um-pwd').value=generatePassword()" style="flex-shrink:0;padding:0 12px;font-size:16px">🔄</button>
            </div>
          </div>
        </div>
      </div>

      <div style="padding:16px 24px;border-top:1px solid var(--border-soft);display:flex;gap:10px;justify-content:flex-end;flex-shrink:0;background:var(--surface-2)">
        <button class="btn btn-secondary btn-sm" onclick="closeUserModal()">${t('btn.cancel')}</button>
        <button class="btn btn-primary" onclick="submitUser(this)">${t('btn.save')}</button>
      </div>
    </div>
  </div>`;
}

function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function openUserModal(userId) {
  const modal = document.getElementById('modal-user');
  const u = userId ? _users.find(x => x._id === userId) : null;
  document.getElementById('user-modal-id').value = userId || '';
  document.getElementById('user-modal-title').textContent = u ? t('users.modal_edit') : t('users.modal_create');
  document.getElementById('um-nom').value     = u?.nom   || '';
  document.getElementById('um-email').value   = u?.email || '';
  document.getElementById('um-company').value = u?.company || Auth.user()?.company || 'solumada';

  const pwdInput = document.getElementById('um-pwd');
  const pwdLabel = document.getElementById('um-pwd-label');
  if (u) {
    pwdInput.value = '';
    pwdLabel.innerHTML = `${t('form.password')} <span style="color:var(--text-3);font-weight:400">${t('users.pwd_leave_blank')}</span>`;
  } else {
    pwdInput.value = generatePassword();
    pwdLabel.innerHTML = `${t('form.password')} <span class="req">*</span> <span style="color:var(--text-3);font-weight:400;font-size:11px">${t('users.pwd_auto_generated')}</span>`;
  }

  modal.style.display = 'flex';
}

function closeUserModal() {
  document.getElementById('modal-user').style.display = 'none';
}

async function submitUser(btn) {
  const id = document.getElementById('user-modal-id').value;
  const nom = document.getElementById('um-nom').value.trim();
  const email = document.getElementById('um-email').value.trim();
  const password = document.getElementById('um-pwd').value;

  if (!nom || !email) { toast(t('toast.user_name_email_required'), 'error'); return; }
  if (!id && (!password || password.length < 6)) { toast(t('toast.password_required_min6'), 'error'); return; }
  if (password && password.length < 6) { toast(t('toast.min_6_chars'), 'error'); return; }

  const company = document.getElementById('um-company').value;
  const data = { nom, email, company };
  if (password) data.password = password;

  return withLoading(btn, async () => {
    let r;
    if (id) r = await api.patch(`/api/users/${id}`, data);
    else r = await api.post('/api/users', data);

    if (r?.success) {
      toast(id ? t('toast.user_updated') : t('toast.user_created'), 'success');
      closeUserModal();
      await loadUsers();
    } else {
      toast(r?.error || t('toast.error'), 'error');
    }
  });
}

async function toggleUserActif(userId) {
  const u = _users.find(x => x._id === userId);
  if (!u) return;
  const action = u.actif !== false ? t('users.toggle_deactivate') : t('users.toggle_reactivate');
  const confirmMsg = tf('users.toggle_confirm', action);
  if (!confirm(confirmMsg)) return;
  const r = await api.patch(`/api/users/${userId}/toggle-actif`, {});
  if (r?.success) {
    toast(r.user.actif ? t('toast.user_activated') : t('toast.user_deactivated'), 'success');
    await loadUsers();
  } else {
    toast(r?.error || t('toast.error'), 'error');
  }
}
