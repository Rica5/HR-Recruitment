async function renderSettings() {
  const user = Auth.user();
  const el = document.getElementById('page-content');

  el.innerHTML = `
  <div style="max-width:680px;display:flex;flex-direction:column;gap:20px">

    <!-- Profil -->
    <div class="card">
      <div class="card-header"><span class="card-title">👤 Profil administrateur</span></div>
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid var(--border-soft)">
          <div class="avatar" style="width:56px;height:56px;font-size:20px">${initials(user?.nom||'?')}</div>
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--text)">${user?.nom||'—'}</div>
            <div style="font-size:13px;color:var(--text-3)">${user?.email||'—'}</div>
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
        <button class="btn btn-primary btn-sm" onclick="saveProfile()">Enregistrer</button>
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
        <button class="btn btn-secondary btn-sm" onclick="changePassword()">Mettre à jour</button>
      </div>
    </div>

    <!-- Thème -->
    <div class="card">
      <div class="card-header"><span class="card-title">🎨 Thème de l'interface</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">
          <div id="theme-card-solumada" onclick="selectTheme('solumada')" style="border:2px solid ${(user?.theme||'solumada')==='solumada'?'var(--accent)':'var(--border)'};border-radius:var(--r-lg);padding:18px;cursor:pointer;transition:all var(--transition);background:${(user?.theme||'solumada')==='solumada'?'var(--accent-light)':'var(--surface-2)'}">
            <div style="width:36px;height:36px;background:#22c55e;border-radius:10px;margin-bottom:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">S</div>
            <div style="font-size:14px;font-weight:700">Solumada</div>
            <div style="font-size:12px;color:var(--text-3);margin-top:3px">Vert naturel #22c55e</div>
            <div style="display:flex;gap:4px;margin-top:10px">${['#22c55e','#16a34a','#dcfce7','#f0fdf4'].map(c=>`<div style="width:18px;height:18px;border-radius:4px;background:${c}"></div>`).join('')}</div>
          </div>
          <div id="theme-card-optimum" onclick="selectTheme('optimum')" style="border:2px solid ${user?.theme==='optimum'?'#62A5D2':'var(--border)'};border-radius:var(--r-lg);padding:18px;cursor:pointer;transition:all var(--transition);background:${user?.theme==='optimum'?'#e0f0fa':'var(--surface-2)'}">
            <div style="width:36px;height:36px;background:#62A5D2;border-radius:10px;margin-bottom:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">O</div>
            <div style="font-size:14px;font-weight:700">Optimum</div>
            <div style="font-size:12px;color:var(--text-3);margin-top:3px">Bleu professionnel #62A5D2</div>
            <div style="display:flex;gap:4px;margin-top:10px">${['#62A5D2','#2b7ab0','#e0f0fa','#f0f8ff'].map(c=>`<div style="width:18px;height:18px;border-radius:4px;background:${c}"></div>`).join('')}</div>
          </div>
        </div>
        <p style="font-size:12px;color:var(--text-3)">Le thème est sauvegardé dans votre profil et appliqué sur tous vos appareils.</p>
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
        <p style="font-size:12px;color:var(--text-3)">Pour modifier ces valeurs, éditez le fichier <code style="background:var(--surface-2);padding:1px 6px;border-radius:4px">.env</code> sur le serveur.</p>
      </div>
    </div>

    <!-- Déconnexion -->
    <div class="card">
      <div class="card-header"><span class="card-title">🚪 Session</span></div>
      <div class="card-body" style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:13px;font-weight:600">Connecté en tant qu'administrateur</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px">Dernière connexion : ${formatDatetime(user?.lastLogin||new Date())}</div>
        </div>
        <button class="btn btn-danger" onclick="logout()">Se déconnecter</button>
      </div>
    </div>

  </div>`;
}

async function saveProfile() {
  const nom = document.getElementById('s-nom')?.value?.trim();
  if (!nom) { toast('Le nom est requis', 'error'); return; }
  const r = await api.patch('/api/auth/me', { nom });
  if (r?.success) {
    const u = Auth.user(); u.nom = nom; Auth.save(Auth.token(), u);
    toast('Profil mis à jour !', 'success');
    document.getElementById('user-name').textContent = nom;
    document.getElementById('user-avatar').textContent = initials(nom);
  } else toast(r?.error || 'Erreur', 'error');
}

async function changePassword() {
  const newPassword  = document.getElementById('s-pwd')?.value;
  const confirmPassword = document.getElementById('s-pwd2')?.value;
  if (!newPassword || newPassword.length < 6) { toast('Minimum 6 caractères', 'error'); return; }
  if (newPassword !== confirmPassword) { toast('Les mots de passe ne correspondent pas', 'error'); return; }
  const r = await api.patch('/api/auth/me', { password: newPassword });
  if (r?.success) { toast('Mot de passe mis à jour !', 'success'); document.getElementById('s-pwd').value = ''; document.getElementById('s-pwd2').value = ''; }
  else toast(r?.error || 'Erreur', 'error');
}

async function selectTheme(theme) {
  await switchTheme(theme);
  // Update card visuals
  ['solumada','optimum'].forEach(t => {
    const card = document.getElementById(`theme-card-${t}`);
    if (!card) return;
    const isActive = t === theme;
    const borderColor = t === 'optimum' ? '#62A5D2' : 'var(--accent)';
    const bgColor = t === 'optimum' ? '#e0f0fa' : 'var(--accent-light)';
    card.style.border = `2px solid ${isActive ? borderColor : 'var(--border)'}`;
    card.style.background = isActive ? bgColor : 'var(--surface-2)';
  });
  toast(`Thème ${theme} appliqué !`, 'success');
}

function logout() {
  if (confirm('Se déconnecter ?')) { Auth.clear(); location.href = '/login'; }
}
