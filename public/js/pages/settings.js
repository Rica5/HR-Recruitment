async function renderSettings() {
  const user = Auth.user();
  const el = document.getElementById('page-content');

  el.innerHTML = `
  <div class="pg-page-wrap">

    <!-- Profil -->
    <div class="card">
      <div class="card-header"><span class="card-title">👤 Profil administrateur</span></div>
      <div class="card-body">
        <div class="pg-flex-16" style="margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid var(--border-soft)">
          <div class="avatar" style="width:56px;height:56px;font-size:20px">${initials(user?.nom||'?')}</div>
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--text)">${user?.nom||'—'}</div>
            <div class="pg-text-xs" style="font-size:13px">${user?.email||'—'}</div>
            <span class="badge badge-accent" style="margin-top:6px">Administrateur</span>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Nom complet</label>
            <input class="form-control" id="s-nom" value="${user?.nom||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-control" id="s-email" type="email" value="${user?.email||''}" disabled style="opacity:.6;cursor:not-allowed">
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveProfile(this)">Enregistrer</button>
      </div>
    </div>

    <!-- Mot de passe -->
    <div class="card">
      <div class="card-header"><span class="card-title">🔒 Changer le mot de passe</span></div>
      <div class="card-body">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Nouveau mot de passe</label>
            <input class="form-control" type="password" id="s-pwd" placeholder="Minimum 6 caractères">
          </div>
          <div class="form-group">
            <label class="form-label">Confirmer</label>
            <input class="form-control" type="password" id="s-pwd2" placeholder="Répétez le mot de passe">
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="changePassword(this)">Mettre à jour</button>
      </div>
    </div>

    <!-- Société -->
    <div class="card">
      <div class="card-header"><span class="card-title">🏢 Société</span></div>
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:16px">
          <img src="${(COMPANY_CONFIG[user?.company] || COMPANY_CONFIG.solumada).logo}" alt="${(COMPANY_CONFIG[user?.company] || COMPANY_CONFIG.solumada).name}" style="max-height:40px;max-width:140px;object-fit:contain">
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--text)">${(COMPANY_CONFIG[user?.company] || COMPANY_CONFIG.solumada).name}</div>
            <div style="font-size:12px;color:var(--text-3);margin-top:2px">Le thème et les données sont associés à votre société.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- n8n config -->
    <div class="card">
      <div class="card-header"><span class="card-title">⚡ Configuration n8n</span></div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">URL n8n Cloud</label>
          <input class="form-control" id="n8n-url" value="https://optimumdev.app.n8n.cloud" readonly style="opacity:.7;font-family:var(--mono);font-size:13px">
        </div>
        <div class="form-group">
          <label class="form-label">WF1 — ID Workflow offre</label>
          <input class="form-control" value="aHs7A6YIopVPV5u3" readonly style="opacity:.7;font-family:var(--mono);font-size:13px">
        </div>
        <div class="form-group">
          <label class="form-label">WF2 — ID Workflow candidature</label>
          <input class="form-control" value="4LmZn4gtORYnL1mP" readonly style="opacity:.7;font-family:var(--mono);font-size:13px">
        </div>
        <p class="pg-text-xs">Pour modifier ces valeurs, éditez le fichier <code class="pg-code">.env</code> sur le serveur.</p>
      </div>
    </div>

    <!-- Déconnexion -->
    <div class="card">
      <div class="card-header"><span class="card-title">🚪 Session</span></div>
      <div class="card-body pg-flex-between">
        <div>
          <div class="pg-title">Connecté en tant qu'administrateur</div>
          <div class="pg-muted">Dernière connexion : ${formatDatetime(user?.lastLogin||new Date())}</div>
        </div>
        <button class="btn btn-danger" onclick="logout()">Se déconnecter</button>
      </div>
    </div>

  </div>`;
}

async function saveProfile(btn) {
  const nom = document.getElementById('s-nom')?.value?.trim();
  if (!nom) { toast('Le nom est requis', 'error'); return; }
  return withLoading(btn, async () => {
    const r = await api.patch('/api/auth/me', { nom });
    if (r?.success) {
      const u = Auth.user(); u.nom = nom; Auth.save(Auth.token(), u);
      toast('Profil mis à jour !', 'success');
      document.getElementById('user-name').textContent = nom;
      document.getElementById('user-avatar').textContent = initials(nom);
    } else toast(r?.error || 'Erreur', 'error');
  });
}

async function changePassword(btn) {
  const newPassword  = document.getElementById('s-pwd')?.value;
  const confirmPassword = document.getElementById('s-pwd2')?.value;
  if (!newPassword || newPassword.length < 6) { toast('Minimum 6 caractères', 'error'); return; }
  if (newPassword !== confirmPassword) { toast('Les mots de passe ne correspondent pas', 'error'); return; }
  return withLoading(btn, async () => {
    const r = await api.patch('/api/auth/me', { password: newPassword });
    if (r?.success) { toast('Mot de passe mis à jour !', 'success'); document.getElementById('s-pwd').value = ''; document.getElementById('s-pwd2').value = ''; }
    else toast(r?.error || 'Erreur', 'error');
  });
}


function logout() {
  if (confirm('Se déconnecter ?')) { Auth.clear(); location.href = '/login'; }
}
