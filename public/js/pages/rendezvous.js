let _rdvList             = [];
let _rdvFilter           = 'all';
let _rdvFilterMine       = false;
let _rdvPendingCancel    = null; // { uid, candidatureId }
let _rdvPendingReschedule = null; // { uid, candidatureId, offreId, slotsData, selectedSlot }

async function renderRDV() {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner" style="width:28px;height:28px"></div></div>`;

  const today  = rdvStartOfToday();
  const calRes = await api.get('/api/calcom/bookings?status=upcoming&take=200').catch(() => null);

  _rdvList = (calRes?.bookings || [])
    .filter(b => b.status === 'accepted' && b.start && new Date(b.start) >= today)
    .map(b => {
      const cand = b.candidature;
      return {
        _sortKey:            new Date(b.start),
        uid:                 b.uid,
        calcom_start:        b.start,
        calcom_location:     b.location || '',
        candidat_nom:        cand?.candidat_nom   || b.attendees?.[0]?.name  || '—',
        candidat_email:      cand?.candidat_email  || b.attendees?.[0]?.email || '',
        titre_poste:         cand?.titre_poste    || b.eventType?.title       || '',
        recommandation:      cand?.recommandation  || '',
        email_recruteur:     cand?.email_recruteur || '',
        candidature_id:        cand?._id?.toString()        || null,
        candidature_company:   cand?.company               || null,
        offre_id:              cand?.offre_id              || null,
        candidat_telephone:    cand?.candidat_telephone    || '',
      };
    })
    .sort((a, b) => a._sortKey - b._sortKey);

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
  return _rdvList.filter(item => !item.email_recruteur || emailListIncludes(item.email_recruteur, myEmail));
}

function rdvGetFiltered() {
  const base = rdvGetBaseList();
  const now  = rdvStartOfToday();
  if (_rdvFilter === 'week') {
    const dow   = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const start = new Date(now); start.setDate(start.getDate() - dow);
    const end   = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999);
    return base.filter(item => item._sortKey >= start && item._sortKey <= end);
  }
  if (_rdvFilter === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return base.filter(item => item._sortKey >= start && item._sortKey <= end);
  }
  if (_rdvFilter === 'nextmonth') {
    const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
    return base.filter(item => item._sortKey >= start && item._sortKey <= end);
  }
  return base;
}

function setRdvFilter(f) { _rdvFilter = f; drawRDVPage(); }
function toggleRdvMine()  { _rdvFilterMine = !_rdvFilterMine; drawRDVPage(); }

function rdvCountFor(f) {
  const prev = _rdvFilter;
  _rdvFilter = f;
  const n = rdvGetFiltered().length;
  _rdvFilter = prev;
  return n;
}

function rdvUrgencyBadge(sortKey) {
  const diff = (sortKey - new Date()) / (1000 * 60 * 60);
  if (diff < 24) return `<span class="badge badge-red"   style="font-size:10px">🔴 ${t('rdv.urgency.today')}</span>`;
  if (diff < 72) return `<span class="badge badge-amber" style="font-size:10px">🟡 ${t('rdv.day_prefix')}-${Math.ceil(diff/24)}</span>`;
  return '';
}

// Cal.com stores start in UTC — convert to local company timezone for display
function rdvToLocal(isoUtc, company) {
  const d      = new Date(isoUtc);
  const offset = (company || Auth.user()?.company || 'solumada') === 'optimum' ? 4 : 3;
  return new Date(d.getTime() + offset * 3600000);
}

function rdvDisplayDateTime(item) {
  const local   = rdvToLocal(item.calcom_start, item.candidature_company);
  const dateStr = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
  const heure   = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
  return { date: dateStr, heure };
}

// ─── Cancel modal ───────────────────────────────────────────────────────────

function openRdvCancelModal(uid, candidatureId) {
  _rdvPendingCancel = { uid, candidatureId };
  const existing = document.getElementById('rdv-cancel-modal');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'rdv-cancel-modal';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  el.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r-xl);padding:28px;width:460px;max-width:100%;box-shadow:var(--shadow-lg)" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:var(--text)">${t('rdv.cancel_title')}</h3>
        <button onclick="closeRdvCancelModal()" style="background:none;border:none;cursor:pointer;font-size:22px;color:var(--text-3);line-height:1">×</button>
      </div>
      <div class="form-group" style="margin-bottom:20px">
        <label class="form-label">${t('rdv.cancel_reason_label')} <span style="color:#ef4444">*</span></label>
        <textarea id="rdv-cancel-reason" class="form-control" rows="3" style="resize:none" placeholder="${t('rdv.cancel_reason_placeholder')}">${t('rdv.cancel_default_reason')}</textarea>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="closeRdvCancelModal()">${t('rdv.btn_back')}</button>
        <button class="btn btn-danger" id="rdv-cancel-confirm-btn" onclick="confirmCancelCalcom()">${t('rdv.cancel_confirm_btn')}</button>
      </div>
    </div>`;
  el.addEventListener('click', closeRdvCancelModal);
  document.body.appendChild(el);
  document.getElementById('rdv-cancel-reason')?.focus();
}

function closeRdvCancelModal() {
  document.getElementById('rdv-cancel-modal')?.remove();
  _rdvPendingCancel = null;
}

async function confirmCancelCalcom() {
  if (!_rdvPendingCancel) return;
  const reason = document.getElementById('rdv-cancel-reason')?.value?.trim();
  if (!reason) {
    toast(t('rdv.cancel_reason_required'), 'error');
    return;
  }
  const btn = document.getElementById('rdv-cancel-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  const { uid, candidatureId } = _rdvPendingCancel;
  const r = await api.post(`/api/calcom/bookings/${uid}/cancel`, { reason, candidature_id: candidatureId || '' });
  if (r?.success) {
    closeRdvCancelModal();
    toast(t('rdv.cancelled'), 'success');
    renderRDV();
  } else {
    toast(r?.error || t('toast.error'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = t('rdv.cancel_confirm_btn'); }
  }
}

// ─── Reschedule modal ────────────────────────────────────────────────────────

async function openRdvRescheduleModal(uid, candidatureId, offreId) {
  _rdvPendingReschedule = { uid, candidatureId, offreId, slotsData: null, selectedSlot: null };
  const existing = document.getElementById('rdv-reschedule-modal');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'rdv-reschedule-modal';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
  el.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r-xl);padding:28px;width:540px;max-width:100%;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow-lg)" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h3 style="margin:0;font-size:16px;font-weight:700;color:var(--text)">${t('rdv.reschedule_title')}</h3>
        <button onclick="closeRdvRescheduleModal()" style="background:none;border:none;cursor:pointer;font-size:22px;color:var(--text-3);line-height:1">×</button>
      </div>

      <div id="rdv-rs-loading" style="text-align:center;padding:40px 0">
        <div class="spinner" style="width:26px;height:26px;margin:0 auto 12px"></div>
        <div style="font-size:13px;color:var(--text-3)">${t('rdv.reschedule_loading')}</div>
      </div>

      <div id="rdv-rs-content" style="display:none">
        <div style="margin-bottom:18px">
          <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">${t('rdv.available_dates')}</div>
          <div id="rdv-rs-dates" style="display:flex;flex-wrap:wrap;gap:6px"></div>
        </div>

        <div id="rdv-rs-slots-section" style="display:none;margin-bottom:18px">
          <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">${t('rdv.available_slots')}</div>
          <div id="rdv-rs-slots" style="display:flex;flex-wrap:wrap;gap:6px"></div>
        </div>

        <div class="form-group" style="margin-bottom:20px">
          <label class="form-label">${t('rdv.reason_optional')}</label>
          <input type="text" id="rdv-rs-reason" class="form-control" placeholder="${t('rdv.reason_placeholder')}">
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn btn-secondary" onclick="closeRdvRescheduleModal()">${t('btn.cancel')}</button>
          <button class="btn btn-primary" id="rdv-rs-confirm" disabled onclick="confirmReschedule()">${t('btn.confirm')}</button>
        </div>
      </div>
    </div>`;
  el.addEventListener('click', closeRdvRescheduleModal);
  document.body.appendChild(el);

  // Fetch available slots
  const r = await api.get(`/api/candidatures/calcom/slots?offre_id=${offreId}&days=60`);
  if (!r?.success || !r.dates || !Object.keys(r.dates).length) {
    document.getElementById('rdv-rs-loading').innerHTML = `<div style="color:var(--text-3);font-size:13px;padding:20px 0">${t('rdv.no_slots_found')}</div>`;
    return;
  }

  _rdvPendingReschedule.slotsData = r.dates;
  _rdvRenderDates(r.dates);
  document.getElementById('rdv-rs-loading').style.display  = 'none';
  document.getElementById('rdv-rs-content').style.display  = 'block';
}

function _rdvRenderDates(datesObj) {
  const container = document.getElementById('rdv-rs-dates');
  if (!container) return;
  const company = Auth.user()?.company || 'solumada';
  const sortedDates = Object.keys(datesObj).sort();
  container.innerHTML = sortedDates.map(dateKey => {
    const local = rdvToLocal(`${dateKey}T12:00:00Z`, company); // midday to avoid date shift
    const label = local.toLocaleDateString(LANG === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); // locale intentionally kept from LANG
    return `<button onclick="rdvSelectDate('${dateKey}')" id="rdv-date-${dateKey}" style="padding:7px 12px;border-radius:var(--r);border:1.5px solid var(--border);background:var(--surface-2);color:var(--text-2);font-size:12px;font-weight:600;cursor:pointer;transition:.15s">${label}</button>`;
  }).join('');
}

function rdvSelectDate(dateKey) {
  if (!_rdvPendingReschedule?.slotsData) return;
  _rdvPendingReschedule.selectedSlot = null;
  const confirmBtn = document.getElementById('rdv-rs-confirm');
  if (confirmBtn) confirmBtn.disabled = true;

  // Highlight selected date
  document.querySelectorAll('[id^="rdv-date-"]').forEach(btn => {
    btn.style.background    = 'var(--surface-2)';
    btn.style.borderColor   = 'var(--border)';
    btn.style.color         = 'var(--text-2)';
  });
  const activeBtn = document.getElementById(`rdv-date-${dateKey}`);
  if (activeBtn) {
    activeBtn.style.background  = 'var(--accent)';
    activeBtn.style.borderColor = 'var(--accent)';
    activeBtn.style.color       = 'white';
  }

  const slots   = _rdvPendingReschedule.slotsData[dateKey] || [];
  const company = Auth.user()?.company || 'solumada';
  const slotsEl = document.getElementById('rdv-rs-slots');
  const section = document.getElementById('rdv-rs-slots-section');
  if (!slotsEl || !section) return;

  slotsEl.innerHTML = slots.map(s => {
    const local = rdvToLocal(s.time, company);
    const heure = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
    return `<button onclick="rdvSelectSlot('${s.time}',this)" style="padding:7px 14px;border-radius:var(--r);border:1.5px solid var(--border);background:var(--surface-2);color:var(--text-2);font-size:13px;font-weight:600;cursor:pointer;transition:.15s">${heure}</button>`;
  }).join('');
  section.style.display = 'block';
}

function rdvSelectSlot(isoTime, btn) {
  _rdvPendingReschedule.selectedSlot = isoTime;
  document.querySelectorAll('#rdv-rs-slots button').forEach(b => {
    b.style.background  = 'var(--surface-2)';
    b.style.borderColor = 'var(--border)';
    b.style.color       = 'var(--text-2)';
  });
  btn.style.background  = 'var(--accent)';
  btn.style.borderColor = 'var(--accent)';
  btn.style.color       = 'white';
  const confirmBtn = document.getElementById('rdv-rs-confirm');
  if (confirmBtn) confirmBtn.disabled = false;
}

function closeRdvRescheduleModal() {
  document.getElementById('rdv-reschedule-modal')?.remove();
  _rdvPendingReschedule = null;
}

async function confirmReschedule() {
  if (!_rdvPendingReschedule?.selectedSlot) return;
  const btn = document.getElementById('rdv-rs-confirm');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  const { uid, candidatureId, selectedSlot } = _rdvPendingReschedule;
  const reason = document.getElementById('rdv-rs-reason')?.value?.trim() || '';

  const r = await api.post(`/api/calcom/bookings/${uid}/reschedule`, {
    start:          selectedSlot,
    reason,
    candidature_id: candidatureId || '',
  });

  if (r?.success) {
    closeRdvRescheduleModal();
    toast(t('rdv.rescheduled'), 'success');
    renderRDV();
  } else {
    toast(r?.error || t('toast.error'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = t('btn.confirm'); }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rdvLocationBadge(loc) {
  if (!loc) return '';
  const lower = loc.toLowerCase();
  const isVideo = /^https?:\/\//.test(loc) || lower.includes('zoom') || lower.includes('meet')
    || lower.includes('teams') || lower.includes('office365') || lower.includes('daily') || lower.includes('whereby')
    || lower.startsWith('integrations:');

  if (isVideo) {
    const label = lower.includes('zoom') ? 'Zoom'
      : lower.includes('meet') ? 'Google Meet'
      : (lower.includes('teams') || lower.includes('office365')) ? 'Teams'
      : lower.includes('daily') ? 'Daily.co'
      : lower.includes('whereby') ? 'Whereby'
      : t('rdv.location_video');
    const href = /^https?:\/\//.test(loc) ? loc : null;
    const tag  = href ? 'a' : 'span';
    const extra = href ? `href="${href}" target="_blank" onclick="event.stopPropagation()"` : '';
    return `<${tag} ${extra} style="display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:4px 10px;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:20px;font-size:11px;font-weight:700;color:#2563eb;text-decoration:none;white-space:nowrap">🎥 ${label}</${tag}>`;
  }

  const display = loc.length > 30 ? loc.slice(0, 30) + '…' : loc;
  return `<div style="display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:4px 10px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:20px;font-size:11px;font-weight:700;color:#15803d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px" title="${loc}">📍 ${display}</div>`;
}

// ─── Page render ─────────────────────────────────────────────────────────────

function drawRDVPage() {
  const el    = document.getElementById('page-content');
  const list  = rdvGetFiltered();
  const total = rdvGetBaseList().length;

  const chipStyle = (f) => _rdvFilter === f
    ? 'background:var(--accent);color:white;border-color:var(--accent)'
    : 'background:var(--surface-2);color:var(--text-2);border-color:var(--border)';

  const mineStyle = _rdvFilterMine
    ? 'background:var(--accent-soft);color:var(--accent-dark);border-color:var(--accent);font-weight:700'
    : 'background:var(--surface-2);color:var(--text-2);border-color:var(--border);font-weight:600';

  const interviewsCount = list.length === 1
    ? tf('dashboard.upcoming_interviews', list.length)
    : tf('dashboard.upcoming_interviews_pl', list.length);

  el.innerHTML = `
  <div class="filters-bar" style="margin-bottom:20px">
    <button class="btn btn-sm" onclick="setRdvFilter('all')"       style="${chipStyle('all')};border:1.5px solid;font-weight:600;transition:.15s">${t('rdv.filter_all')} (${total})</button>
    <button class="btn btn-sm" onclick="setRdvFilter('week')"      style="${chipStyle('week')};border:1.5px solid;font-weight:600;transition:.15s">${t('rdv.filter_week')} (${rdvCountFor('week')})</button>
    <button class="btn btn-sm" onclick="setRdvFilter('month')"     style="${chipStyle('month')};border:1.5px solid;font-weight:600;transition:.15s">${t('rdv.filter_month')} (${rdvCountFor('month')})</button>
    <button class="btn btn-sm" onclick="setRdvFilter('nextmonth')" style="${chipStyle('nextmonth')};border:1.5px solid;font-weight:600;transition:.15s">${t('rdv.filter_next_month')} (${rdvCountFor('nextmonth')})</button>
    <button class="btn btn-sm" onclick="toggleRdvMine()" style="${mineStyle};border:1.5px solid;transition:.15s;margin-left:auto">${t('rdv.mine')}</button>
  </div>

  <div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:14px">${interviewsCount}</div>

  ${list.length === 0 ? `
  <div class="empty-state" style="padding:64px 0">
    <div class="empty-icon">📅</div>
    <p>${t('rdv.no_appointments_period')}</p>
    <button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="navigate('candidatures')">${t('rdv.see_applications')}</button>
  </div>` : `
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">
    ${list.map(item => {
      const dt       = rdvDisplayDateTime(item);
      const dStr     = formatDate(dt.date);
      const isOrphan = !item.candidature_id;
      const diff     = (item._sortKey - new Date()) / (1000 * 60 * 60);
      const topColor = diff < 24 ? '#ef4444' : diff < 72 ? '#f59e0b' : 'var(--accent)';

      const clickAction = item.candidature_id
        ? `onclick="window._pendingCandDetail='${item.candidature_id}';navigate('candidatures')"`
        : '';
      const hoverCard = item.candidature_id
        ? `onmouseover="this.style.boxShadow='var(--shadow-sm)';this.style.borderColor='var(--border)'" onmouseout="this.style.boxShadow='none';this.style.borderColor='var(--border-soft)'"`
        : '';

      const rescheduleBtn = item.offre_id
        ? `<button onclick="event.stopPropagation();openRdvRescheduleModal('${item.uid}','${item.candidature_id||''}','${item.offre_id}')" style="flex:1;background:var(--surface-2);border:1.5px solid var(--border);cursor:pointer;color:var(--text-2);font-size:11px;font-weight:600;padding:5px 6px;border-radius:var(--r);transition:.15s" onmouseover="this.style.background='var(--accent-soft)';this.style.borderColor='var(--accent)';this.style.color='var(--accent-dark)'" onmouseout="this.style.background='var(--surface-2)';this.style.borderColor='var(--border)';this.style.color='var(--text-2)'">${t('rdv.btn_reschedule')}</button>`
        : '';
      const cancelBtn = `<button onclick="event.stopPropagation();openRdvCancelModal('${item.uid}','${item.candidature_id||''}')" style="flex:1;background:var(--surface-2);border:1.5px solid var(--border);cursor:pointer;color:var(--text-2);font-size:11px;font-weight:600;padding:5px 6px;border-radius:var(--r);transition:.15s" onmouseover="this.style.background='#fef2f2';this.style.borderColor='#ef4444';this.style.color='#ef4444'" onmouseout="this.style.background='var(--surface-2)';this.style.borderColor='var(--border)';this.style.color='var(--text-2)'">${t('rdv.btn_cancel_action')}</button>`;

      return `
      <div ${hoverCard} style="background:var(--surface);border-radius:var(--r-xl);border:1px solid var(--border-soft);overflow:hidden;display:flex;flex-direction:column;transition:box-shadow var(--transition),border-color var(--transition)">

        <!-- Top urgency bar -->
        <div style="height:3px;background:${topColor}"></div>

        <!-- Clickable body -->
        <div ${clickAction} style="${item.candidature_id?'cursor:pointer':'cursor:default'};padding:14px 14px 10px;flex:1;display:flex;flex-direction:column;gap:0">

          <!-- Name + avatar -->
          <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
            <div class="avatar" style="width:36px;height:36px;font-size:12px;flex-shrink:0">${initials(item.candidat_nom)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.candidat_nom}</div>
              <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">${item.titre_poste || (isOrphan ? t('rdv.no_linked_app') : '')}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0">
              ${item.recommandation ? renderBadge(item.recommandation) : ''}
              ${rdvUrgencyBadge(item._sortKey)}
            </div>
          </div>

          <!-- Separator -->
          <div style="height:1px;background:var(--border-soft);margin-bottom:8px"></div>

          <!-- Contact -->
          <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px">
            ${item.candidat_email     ? `<div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📧 ${item.candidat_email}</div>`     : ''}
            ${item.candidat_telephone ? `<div style="font-size:11px;color:var(--text-3)">📞 ${item.candidat_telephone}</div>`                                                           : ''}
            ${item.email_recruteur    ? `<div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">👔 ${item.email_recruteur}</div>`    : ''}
          </div>

          <!-- Separator -->
          <div style="height:1px;background:var(--border-soft);margin-bottom:8px"></div>

          <!-- Date / time / location -->
          <div style="margin-bottom:4px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:14px;font-weight:800;color:var(--accent-mid)">📅 ${dStr}</span>
              <span style="font-size:13px;font-weight:600;color:var(--text-2)">🕐 ${dt.heure}</span>
            </div>
            ${rdvLocationBadge(item.calcom_location)}
          </div>

        </div>

        <!-- Actions footer -->
        <div style="display:flex;gap:6px;padding:8px 14px 12px">
          ${rescheduleBtn}
          ${cancelBtn}
        </div>

      </div>`;
    }).join('')}
  </div>`}`;
}
