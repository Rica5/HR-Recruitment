async function renderSettings() {
  const user = Auth.user();
  const el = document.getElementById('page-content');
  const cfg = COMPANY_CONFIG[user?.company] || COMPANY_CONFIG.solumada;
  const companyDesc = t('settings.company_desc');
  const n8nDesc = t('settings.n8n_desc');
  const sessionDesc = t('settings.session_desc');
  const lastLoginDesc = tf('settings.last_login_desc', formatDatetime(user?.lastLogin || new Date()));
  const confirmMsg = t('settings.confirm_logout');
  const pwdPlaceholder = t('settings.pwd_placeholder');
  const confirmPwdPlaceholder = t('settings.confirm_pwd_placeholder');

  el.innerHTML = `
  <div class="pg-page-wrap">

    <div class="card">
      <div class="card-header"><span class="card-title">${t('settings.profile_card')}</span></div>
      <div class="card-body">
        <div class="pg-flex-16" style="margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid var(--border-soft)">
          <div class="avatar" style="width:56px;height:56px;font-size:20px">${initials(user?.nom||'?')}</div>
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--text)">${user?.nom||'—'}</div>
            <div class="pg-text-xs" style="font-size:13px">${user?.email||'—'}</div>
            <span class="badge badge-accent" style="margin-top:6px">${t('settings.badge_admin')}</span>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">${t('settings.full_name')}</label>
            <input class="form-control" id="s-nom" value="${user?.nom||''}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('settings.email')}</label>
            <input class="form-control" id="s-email" type="email" value="${user?.email||''}" disabled style="opacity:.6;cursor:not-allowed">
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveProfile(this)">${t('settings.save_btn')}</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">${t('settings.password_card')}</span></div>
      <div class="card-body">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">${t('settings.new_password')}</label>
            <input class="form-control" type="password" id="s-pwd" placeholder="${pwdPlaceholder}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('settings.confirm_password')}</label>
            <input class="form-control" type="password" id="s-pwd2" placeholder="${confirmPwdPlaceholder}">
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="changePassword(this)">${t('settings.update_password')}</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">${t('settings.company_card')}</span></div>
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:16px">
          <img src="${cfg.logo}" alt="${cfg.name}" style="max-height:40px;max-width:140px;object-fit:contain">
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--text)">${cfg.name}</div>
            <div style="font-size:12px;color:var(--text-3);margin-top:2px">${companyDesc}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">⚡ n8n</span></div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">URL n8n Cloud</label>
          <input class="form-control" id="n8n-url" value="…" readonly style="opacity:.7;font-family:var(--mono);font-size:13px">
        </div>
        <div class="form-group">
          <label class="form-label">WF1 — ID Workflow offre</label>
          <input class="form-control" id="n8n-wf1-id" value="…" readonly style="opacity:.7;font-family:var(--mono);font-size:13px">
        </div>
        <div class="form-group">
          <label class="form-label">WF2 — ID Workflow candidature</label>
          <input class="form-control" id="n8n-wf2-id" value="…" readonly style="opacity:.7;font-family:var(--mono);font-size:13px">
        </div>
        <p class="pg-text-xs">${n8nDesc}</p>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">🚪 Session</span></div>
      <div class="card-body pg-flex-between">
        <div>
          <div class="pg-title">${sessionDesc}</div>
          <div class="pg-muted">${lastLoginDesc}</div>
        </div>
        <button class="btn btn-danger" onclick="logout()">${t('settings.logout_btn')}</button>
      </div>
    </div>

  </div>`;

  window._settingsConfirmMsg = confirmMsg;

  api.get('/api/n8n/config').then(r => {
    if (!r?.success) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    set('n8n-url',    r.n8n_base_url);
    set('n8n-wf1-id', r.wf1_id || '—');
    set('n8n-wf2-id', r.wf2_id);
  }).catch(() => {});
}

async function saveProfile(btn) {
  const nom = document.getElementById('s-nom')?.value?.trim();
  if (!nom) { toast(t('toast.profile_name_required'), 'error'); return; }
  return withLoading(btn, async () => {
    const r = await api.patch('/api/auth/me', { nom });
    if (r?.success) {
      const u = Auth.user(); u.nom = nom; Auth.save(Auth.token(), u);
      toast(t('toast.profile_updated'), 'success');
      document.getElementById('user-name').textContent = nom;
      document.getElementById('user-avatar').textContent = initials(nom);
    } else toast(r?.error || t('toast.error'), 'error');
  });
}

async function changePassword(btn) {
  const newPassword     = document.getElementById('s-pwd')?.value;
  const confirmPassword = document.getElementById('s-pwd2')?.value;
  if (!newPassword || newPassword.length < 6) { toast(t('toast.min_6_chars'), 'error'); return; }
  if (newPassword !== confirmPassword) { toast(t('toast.passwords_mismatch'), 'error'); return; }
  return withLoading(btn, async () => {
    const r = await api.patch('/api/auth/me', { password: newPassword });
    if (r?.success) {
      toast(t('toast.password_updated'), 'success');
      document.getElementById('s-pwd').value = '';
      document.getElementById('s-pwd2').value = '';
    } else toast(r?.error || t('toast.error'), 'error');
  });
}

function logout() {
  const msg = window._settingsConfirmMsg || t('settings.confirm_logout');
  if (confirm(msg)) { Auth.clear(); location.href = '/login'; }
}
