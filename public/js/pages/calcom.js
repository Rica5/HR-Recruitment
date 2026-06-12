async function renderCalcom() {
  const el = document.getElementById('page-content');

  el.innerHTML = `
  <style id="calcom-grid-style">
    #calcom-page-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;padding:20px 24px}
    @media(max-width:900px){#calcom-page-grid{grid-template-columns:1fr}}
  </style>
  <div id="calcom-page-grid">

    <!-- LEFT: Event Types -->
    <div class="card">
      <div class="card-header">
        <div>
          <span class="card-title">📋 ${t('calcom.event_types_title')}</span>
          <div style="font-size:12px;color:var(--text-3);margin-top:3px">
            ${t('calcom.event_types_desc')}
          </div>
        </div>
      </div>
      <div class="card-body">
        <div id="calcom-et-list"><div class="spinner" style="margin:20px auto"></div></div>

        <div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--border)">
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px">
            ${t('calcom.new_event_type')}
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">${t('calcom.et_title_label')} *</label>
              <input class="form-control" id="cal-et-title"
                placeholder="${t('calcom.et_title_placeholder')}">
            </div>
            <div class="form-group">
              <label class="form-label">${t('calcom.et_duration_label')} *</label>
              <select class="form-control" id="cal-et-duration">
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="45" selected>45 min</option>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
              </select>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Description</label>
              <input class="form-control" id="cal-et-desc"
                placeholder="${t('calcom.et_desc_placeholder')}">
            </div>
            <div class="form-group">
              <label class="form-label">${t('calcom.et_schedule_label')}</label>
              <select class="form-control" id="cal-et-schedule">
                <option value="">— ${t('calcom.et_schedule_default')} —</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="form-label">
              ${t('calcom.et_offers_label')}
            </label>
            <select class="form-control" id="cal-et-offers" multiple style="min-height:80px">
              <option value="" disabled>${t('calcom.et_offers_loading')}</option>
            </select>
            <div style="font-size:11px;color:var(--text-3);margin-top:4px">
              ${t('calcom.et_offers_ctrl_hint')}
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="createEventType(this)">
            ${t('calcom.et_create_btn')}
          </button>
        </div>
      </div>
    </div>

    <!-- RIGHT: Availability Schedules -->
    <div class="card">
      <div class="card-header">
        <div>
          <span class="card-title">🕐 ${t('calcom.schedules_title')}</span>
          <div style="font-size:12px;color:var(--text-3);margin-top:3px">
            ${t('calcom.schedules_desc')}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="openCreateSchedule()">
          + ${t('calcom.schedules_new_btn')}
        </button>
      </div>
      <div class="card-body">
        <div id="calcom-sched-list"><div class="spinner" style="margin:20px auto"></div></div>
      </div>
    </div>

  </div>`;

  loadCalcomData();
}

async function loadCalcomData() {
  const [etRes, schedRes, offresRes] = await Promise.all([
    api.get('/api/calcom/event-types').catch(() => null),
    api.get('/api/calcom/schedules').catch(() => null),
    api.get('/api/offres').catch(() => null),
  ]);

  if (schedRes?.success) {
    window._calcomSchedules = schedRes.schedules || [];
    const sel = document.getElementById('cal-et-schedule');
    if (sel) {
      schedRes.schedules.forEach(s => {
        sel.insertAdjacentHTML('beforeend', `<option value="${s.id}">${s.name}</option>`);
      });
    }
    renderScheduleList(schedRes.schedules);
  } else {
    const el = document.getElementById('calcom-sched-list');
    if (el) el.innerHTML = `<p style="color:var(--text-3);font-size:13px">
      ${t('calcom.error_load_schedules')}
    </p>`;
  }

  if (etRes?.success) {
    window._calcomEventTypes = etRes.eventTypes || [];
    renderEventTypeList(etRes.eventTypes);
  } else {
    const el = document.getElementById('calcom-et-list');
    if (el) el.innerHTML = `<p style="color:var(--text-3);font-size:13px">
      ${t('calcom.error_load_et')}
    </p>`;
  }

  if (offresRes?.success) {
    window._calcomOffres = offresRes.offres || [];
    renderOffreSelector(window._calcomOffres);
  }
}

function renderOffreSelector(offres) {
  const sel = document.getElementById('cal-et-offers');
  if (!sel) return;
  const visible = (offres || []).filter(o => o.statut !== 'Fermée');
  if (!visible.length) {
    sel.innerHTML = `<option value="" disabled>${t('calcom.no_offers')}</option>`;
    return;
  }
  sel.innerHTML = visible.map(o =>
    `<option value="${o.offre_id}">${o.titre_poste} — ${o.offre_id}</option>`
  ).join('');
}

function renderEventTypeList(eventTypes) {
  const el = document.getElementById('calcom-et-list');
  if (!el) return;
  if (!eventTypes.length) {
    el.innerHTML = `<div class="empty-state" style="padding:16px 0">
      <p style="margin:0;color:var(--text-3);font-size:13px">
        ${t('calcom.no_event_types')}
      </p>
    </div>`;
    return;
  }
  el.innerHTML = eventTypes.map(et => `
    <div style="padding:14px 0;border-bottom:1px solid var(--border-soft);display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
      <div style="min-width:0;flex:1">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <strong style="font-size:14px;color:var(--text)">${et.title}</strong>
          <span class="badge badge-blue">${et.lengthInMinutes} min</span>
        </div>
        ${et.description ? `<div style="font-size:12px;color:var(--text-3);margin-top:3px">${et.description}</div>` : ''}
        <div style="font-size:12px;color:var(--text-2);margin-top:5px;word-break:break-all;font-family:var(--mono)">${et.bookingUrl}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-sm btn-secondary" onclick="copyCalcomUrl('${et.bookingUrl}')" title="${t('calcom.copy_url')}">
          📋 ${t('calcom.copy')}
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteEventType(${et.id})" title="${t('calcom.delete')}">🗑</button>
      </div>
    </div>`
  ).join('');
}

function renderScheduleList(schedules) {
  const el = document.getElementById('calcom-sched-list');
  if (!el) return;
  if (!schedules.length) {
    el.innerHTML = `<div class="empty-state" style="padding:16px 0">
      <p style="margin:0;color:var(--text-3);font-size:13px">
        ${t('calcom.no_schedules')}
      </p>
    </div>`;
    return;
  }
  const dayNames = LANG === 'en'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  el.innerHTML = schedules.map(s => {
    const recurSummary = (s.availability || []).map(a => {
      const days = (a.days || []).map(d => dayNames[d]).join(', ');
      return `${days}: ${a.startTime || '?'}–${a.endTime || '?'}`;
    }).join(' | ');
    const overrideCount = (s.dateOverrides || []).length;
    const availSummary = recurSummary
      || (overrideCount
        ? tf('calcom.specific_dates_count', overrideCount)
        : t('calcom.no_slots_defined'));
    return `
    <div style="padding:14px 0;border-bottom:1px solid var(--border-soft);display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
      <div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <strong style="font-size:14px;color:var(--text)">${s.name}</strong>
          ${s.isDefault ? `<span class="badge badge-accent">${t('calcom.default_badge')}</span>` : ''}
        </div>
        <div style="font-size:12px;color:var(--text-3);margin-top:3px">${s.timeZone}</div>
        <div style="font-size:12px;color:var(--text-2);margin-top:3px">${availSummary}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-sm btn-ghost" onclick="openEditSchedule(${s.id})">
          ${t('calcom.edit')}
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteSchedule(${s.id})" title="${t('calcom.delete')}">🗑</button>
      </div>
    </div>`;
  }).join('');
}

async function deleteSchedule(id) {
  if (!confirm(t('calcom.delete_schedule_confirm'))) return;
  const r = await api.delete(`/api/calcom/schedules/${id}`);
  if (r?.success) {
    toast(t('calcom.schedule_deleted'), 'success');
    window._calcomSchedules = (window._calcomSchedules || []).filter(s => s.id !== id);
    renderScheduleList(window._calcomSchedules);
    const sel = document.getElementById('cal-et-schedule');
    if (sel) {
      const opt = sel.querySelector(`option[value="${id}"]`);
      if (opt) opt.remove();
    }
  } else {
    toast(r?.error || t('calcom.error'), 'error');
  }
}

async function createEventType(btn) {
  const title           = document.getElementById('cal-et-title')?.value?.trim();
  const lengthInMinutes = document.getElementById('cal-et-duration')?.value;
  const description     = document.getElementById('cal-et-desc')?.value?.trim();
  const scheduleId      = document.getElementById('cal-et-schedule')?.value;
  const offresSelect    = document.getElementById('cal-et-offers');
  const selectedOffres  = offresSelect
    ? Array.from(offresSelect.selectedOptions).map(o => o.value).filter(Boolean)
    : [];

  if (!title) {
    toast(t('calcom.et_title_required'), 'error');
    return;
  }

  return withLoading(btn, async () => {
    const r = await api.post('/api/calcom/event-types', {
      title,
      lengthInMinutes: Number(lengthInMinutes),
      ...(description && { description }),
      ...(scheduleId  && { scheduleId: Number(scheduleId) }),
    });
    if (r?.success) {
      if (selectedOffres.length) {
        const bookingUrl = r.eventType.bookingUrl;
        await Promise.all(
          selectedOffres.map(id => api.patch(`/api/offres/${id}`, { lien_rdv: bookingUrl }))
        );
        toast(tf('calcom.et_created_linked', selectedOffres.length), 'success');
      } else {
        toast(t('calcom.et_created'), 'success');
      }
      document.getElementById('cal-et-title').value = '';
      document.getElementById('cal-et-desc').value  = '';
      if (offresSelect) Array.from(offresSelect.options).forEach(o => o.selected = false);
      window._calcomEventTypes = [...(window._calcomEventTypes || []), r.eventType];
      renderEventTypeList(window._calcomEventTypes);
    } else {
      toast(r?.error || t('calcom.error'), 'error');
    }
  });
}

async function deleteEventType(id) {
  if (!confirm(t('calcom.delete_et_confirm'))) return;
  const r = await api.delete(`/api/calcom/event-types/${id}`);
  if (r?.success) {
    toast(t('calcom.et_deleted'), 'success');
    window._calcomEventTypes = (window._calcomEventTypes || []).filter(et => et.id !== id);
    renderEventTypeList(window._calcomEventTypes);
  } else {
    toast(r?.error || t('calcom.error'), 'error');
  }
}

function copyCalcomUrl(url) {
  navigator.clipboard.writeText(url).then(() => {
    toast(t('calcom.url_copied'), 'success');
  }).catch(() => {
    toast(url, 'info');
  });
}

function openCreateSchedule() {
  const defaultDays = [1, 2, 3, 4, 5];

  window._editingOverrides  = [];
  window._newOverrideSlots  = [{ startTime: '09:00', endTime: '17:00' }];

  const tzOptions = [
    { tz: 'Indian/Antananarivo', label: 'Madagascar (UTC+3)' },
    { tz: 'Indian/Mauritius',    label: LANG === 'en' ? 'Mauritius (UTC+4)' : 'Île Maurice (UTC+4)' },
  ].map(({ tz, label }) => `<option value="${tz}">${label}</option>`).join('');

  const dayPillHtml = (LANG === 'en'
    ? [{ label: 'Mon', val: 1 }, { label: 'Tue', val: 2 }, { label: 'Wed', val: 3 }, { label: 'Thu', val: 4 }, { label: 'Fri', val: 5 }, { label: 'Sat', val: 6 }, { label: 'Sun', val: 0 }]
    : [{ label: 'Lun', val: 1 }, { label: 'Mar', val: 2 }, { label: 'Mer', val: 3 }, { label: 'Jeu', val: 4 }, { label: 'Ven', val: 5 }, { label: 'Sam', val: 6 }, { label: 'Dim', val: 0 }]
  ).map(({ label, val }) =>
    `<button type="button" class="day-pill${defaultDays.includes(val) ? ' active' : ''}" data-day="${val}" onclick="this.classList.toggle('active')">${label}</button>`
  ).join('');

  document.getElementById('modal-edit-schedule')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <style id="day-pill-style">
      .day-pill{display:inline-flex;align-items:center;justify-content:center;padding:6px 14px;border-radius:20px;border:1.5px solid var(--border);background:var(--surface);color:var(--text-2);font-size:12px;font-weight:600;cursor:pointer;transition:background .15s,color .15s,border-color .15s;user-select:none}
      .day-pill.active{background:var(--accent);border-color:var(--accent);color:#fff}
      .day-pill:hover:not(.active){background:var(--surface-3);border-color:var(--accent)}
      .sched-2col{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
      @media(max-width:720px){.sched-2col{grid-template-columns:1fr}}
    </style>
    <div id="modal-edit-schedule" style="position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);overflow-y:auto;padding:16px 12px;display:flex;align-items:flex-start;justify-content:center">
      <div class="card" style="width:min(1100px,97vw);margin:0 auto">
        <div class="card-header" style="position:sticky;top:0;background:var(--surface);z-index:1;border-radius:var(--r-lg) var(--r-lg) 0 0">
          <div style="min-width:0">
            <span class="card-title">🕐 ${t('calcom.new_schedule_title')}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-primary btn-sm" onclick="saveNewSchedule(this)">
              ${t('calcom.create_btn')}
            </button>
            <button class="btn btn-ghost btn-sm" onclick="_closeEditScheduleModal()">
              ${t('calcom.cancel_btn')}
            </button>
          </div>
        </div>
        <div class="card-body">

          <div class="form-grid" style="margin-bottom:20px">
            <div class="form-group">
              <label class="form-label">${t('calcom.sched_name_label')} *</label>
              <input class="form-control" id="edit-sched-name" placeholder="${t('calcom.sched_name_placeholder')}">
            </div>
            <div class="form-group">
              <label class="form-label">${t('calcom.timezone_label')} *</label>
              <select class="form-control" id="edit-sched-tz">${tzOptions}</select>
            </div>
          </div>

          <div class="sched-2col">

            <div style="background:var(--surface-2);border-radius:var(--r-lg);border:1px solid var(--border);overflow:hidden">
              <div style="padding:14px 18px;border-bottom:1px solid var(--border);background:var(--surface-3)">
                <div style="font-size:13px;font-weight:700;color:var(--text)">🔁 ${t('calcom.weekly_title')}</div>
                <div style="font-size:12px;color:var(--text-3);margin-top:2px">${t('calcom.weekly_desc')}</div>
              </div>
              <div style="padding:18px">
                <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">${t('calcom.active_days')}</div>
                <div id="edit-sched-days" style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:18px">${dayPillHtml}</div>
                <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">${t('calcom.hours')}</div>
                <div style="display:flex;gap:10px;align-items:center">
                  <div class="form-group" style="margin:0;flex:1">
                    <label class="form-label" style="font-size:11px">${t('calcom.from')}</label>
                    <input class="form-control" type="time" id="edit-sched-start" value="09:00">
                  </div>
                  <span style="font-size:20px;color:var(--text-3);padding-top:20px">→</span>
                  <div class="form-group" style="margin:0;flex:1">
                    <label class="form-label" style="font-size:11px">${t('calcom.to')}</label>
                    <input class="form-control" type="time" id="edit-sched-end" value="17:00">
                  </div>
                </div>
              </div>
            </div>

            <div style="background:var(--surface-2);border-radius:var(--r-lg);border:1px solid var(--border);overflow:hidden">
              <div style="padding:14px 18px;border-bottom:1px solid var(--border);background:var(--surface-3)">
                <div style="font-size:13px;font-weight:700;color:var(--text)">📅 ${t('calcom.specific_dates_title')}</div>
                <div style="font-size:12px;color:var(--text-3);margin-top:2px">${t('calcom.specific_dates_desc')}</div>
              </div>
              <div style="padding:18px">
                <div id="edit-overrides-list" style="margin-bottom:16px"></div>
                <div style="border:1.5px dashed var(--border);border-radius:var(--r-lg);padding:16px;background:var(--surface)">
                  <div style="font-size:12px;font-weight:700;color:var(--text-2);margin-bottom:12px;display:flex;align-items:center;gap:6px">
                    <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:var(--accent);border-radius:50%;color:#fff;font-size:13px;font-weight:700">+</span>
                    ${t('calcom.add_specific_date')}
                  </div>
                  <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
                    <div class="form-group" style="margin:0;flex:1;min-width:150px">
                      <label class="form-label" style="font-size:11px">Date *</label>
                      <input type="date" class="form-control" id="ovr-date">
                    </div>
                    <label style="display:flex;align-items:center;gap:7px;font-size:13px;padding-bottom:8px;cursor:pointer;user-select:none;white-space:nowrap">
                      <input type="checkbox" id="ovr-unavail"
                        onchange="document.getElementById('ovr-slots-section').style.display=this.checked?'none':'block'">
                      ${t('calcom.all_day_unavailable')}
                    </label>
                  </div>
                  <div id="ovr-slots-section">
                    <div style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">
                      ${t('calcom.time_slots')}
                    </div>
                    <div id="ovr-slots-list"></div>
                    <button class="btn btn-sm btn-ghost" style="margin-top:6px;border:1.5px dashed var(--border)" onclick="addSlotToNewOverride()">
                      + ${t('calcom.add_another_slot')}
                    </button>
                  </div>
                  <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-soft)">
                    <button class="btn btn-primary btn-sm" onclick="confirmOverrideRow()">
                      ${t('calcom.add_to_list')}
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div style="display:flex;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
            <button class="btn btn-primary" onclick="saveNewSchedule(this)">
              ${t('calcom.create_schedule_btn')}
            </button>
            <button class="btn btn-ghost" onclick="_closeEditScheduleModal()">
              ${t('calcom.cancel_btn')}
            </button>
          </div>
        </div>
      </div>
    </div>`
  );

  renderOverrideRows();
  renderNewOverrideSlots();
}

async function saveNewSchedule(btn) {
  const name      = document.getElementById('edit-sched-name')?.value?.trim();
  const timeZone  = document.getElementById('edit-sched-tz')?.value;
  const startTime = document.getElementById('edit-sched-start')?.value;
  const endTime   = document.getElementById('edit-sched-end')?.value;
  const days      = [...document.querySelectorAll('#edit-sched-days .day-pill.active')].map(b => Number(b.dataset.day));

  const dateOverrides = (window._editingOverrides || []).map(o => ({
    date:         o.date,
    availability: o.unavailable ? [] : o.slots,
  }));

  if (!name) {
    toast(t('calcom.sched_name_required'), 'error');
    return;
  }
  if (!days.length && !dateOverrides.length) {
    toast(t('calcom.sched_day_required'), 'error');
    return;
  }

  return withLoading(btn, async () => {
    const r = await api.post('/api/calcom/schedules', {
      name, timeZone,
      availability: days.length ? [{ days, startTime, endTime }] : [],
      dateOverrides,
    });
    if (r?.success) {
      toast(t('calcom.schedule_created'), 'success');
      _closeEditScheduleModal();
      window._calcomSchedules = [...(window._calcomSchedules || []), r.schedule];
      renderScheduleList(window._calcomSchedules);
      const sel = document.getElementById('cal-et-schedule');
      if (sel && r.schedule) {
        sel.insertAdjacentHTML('beforeend', `<option value="${r.schedule.id}">${r.schedule.name}</option>`);
      }
    } else {
      toast(r?.error || t('calcom.error'), 'error');
    }
  });
}

function _closeEditScheduleModal() {
  document.getElementById('modal-edit-schedule')?.remove();
  document.getElementById('day-pill-style')?.remove();
}

function openEditSchedule(scheduleId) {
  const s = (window._calcomSchedules || []).find(x => x.id === scheduleId);
  if (!s) return;

  const avail      = s.availability?.[0] || {};
  const activeDays = avail.days || [1, 2, 3, 4, 5];
  const startTime  = avail.startTime || '09:00';
  const endTime    = avail.endTime   || '17:00';

  // Init date overrides state
  window._editingOverrides = (s.dateOverrides || []).map(o => ({
    date:        o.date,
    unavailable: !o.availability?.length,
    slots:       o.availability || [],
  }));
  // Init the "new override" form slots (always 1 empty slot ready)
  window._newOverrideSlots = [{ startTime: '09:00', endTime: '17:00' }];

  const tzOptions = [
    { tz: 'Indian/Antananarivo', label: 'Madagascar (UTC+3)' },
    { tz: 'Indian/Mauritius',    label: LANG === 'en' ? 'Mauritius (UTC+4)' : 'Île Maurice (UTC+4)' },
  ].map(({ tz, label }) => `<option value="${tz}"${s.timeZone === tz ? ' selected' : ''}>${label}</option>`).join('');

  const dayPillHtml = (LANG === 'en'
    ? [{ label: 'Mon', val: 1 }, { label: 'Tue', val: 2 }, { label: 'Wed', val: 3 }, { label: 'Thu', val: 4 }, { label: 'Fri', val: 5 }, { label: 'Sat', val: 6 }, { label: 'Sun', val: 0 }]
    : [{ label: 'Lun', val: 1 }, { label: 'Mar', val: 2 }, { label: 'Mer', val: 3 }, { label: 'Jeu', val: 4 }, { label: 'Ven', val: 5 }, { label: 'Sam', val: 6 }, { label: 'Dim', val: 0 }]
  ).map(({ label, val }) =>
    `<button type="button" class="day-pill${activeDays.includes(val) ? ' active' : ''}" data-day="${val}" onclick="this.classList.toggle('active')">${label}</button>`
  ).join('');

  document.getElementById('modal-edit-schedule')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <style id="day-pill-style">
      .day-pill{display:inline-flex;align-items:center;justify-content:center;padding:6px 14px;border-radius:20px;border:1.5px solid var(--border);background:var(--surface);color:var(--text-2);font-size:12px;font-weight:600;cursor:pointer;transition:background .15s,color .15s,border-color .15s;user-select:none}
      .day-pill.active{background:var(--accent);border-color:var(--accent);color:#fff}
      .day-pill:hover:not(.active){background:var(--surface-3);border-color:var(--accent)}
      .sched-2col{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
      @media(max-width:720px){.sched-2col{grid-template-columns:1fr}}
    </style>
    <div id="modal-edit-schedule" style="position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);overflow-y:auto;padding:16px 12px;display:flex;align-items:flex-start;justify-content:center">
      <div class="card" style="width:min(1100px,97vw);margin:0 auto">
        <div class="card-header" style="position:sticky;top:0;background:var(--surface);z-index:1;border-radius:var(--r-lg) var(--r-lg) 0 0">
          <div style="min-width:0">
            <span class="card-title">${s.name}</span>
            <span style="font-size:12px;color:var(--text-3);margin-left:8px">${t('calcom.edit_schedule_label')}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-primary btn-sm" onclick="saveEditSchedule(${scheduleId}, this)">
              ${t('calcom.save_btn')}
            </button>
            <button class="btn btn-ghost btn-sm" onclick="_closeEditScheduleModal()">
              ${t('calcom.cancel_btn')}
            </button>
          </div>
        </div>
        <div class="card-body">

          <!-- Name + Timezone -->
          <div class="form-grid" style="margin-bottom:20px">
            <div class="form-group">
              <label class="form-label">${t('calcom.sched_name_label')}</label>
              <input class="form-control" id="edit-sched-name" value="${s.name}">
            </div>
            <div class="form-group">
              <label class="form-label">${t('calcom.timezone_label')}</label>
              <select class="form-control" id="edit-sched-tz">${tzOptions}</select>
            </div>
          </div>

          <!-- Two-column layout -->
          <div class="sched-2col">

            <!-- LEFT: Weekly recurring -->
            <div style="background:var(--surface-2);border-radius:var(--r-lg);border:1px solid var(--border);overflow:hidden">
              <div style="padding:14px 18px;border-bottom:1px solid var(--border);background:var(--surface-3)">
                <div style="font-size:13px;font-weight:700;color:var(--text)">🔁 ${t('calcom.weekly_title')}</div>
                <div style="font-size:12px;color:var(--text-3);margin-top:2px">${t('calcom.weekly_desc')}</div>
              </div>
              <div style="padding:18px">
                <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">${t('calcom.active_days')}</div>
                <div id="edit-sched-days" style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:18px">${dayPillHtml}</div>
                <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">${t('calcom.hours')}</div>
                <div style="display:flex;gap:10px;align-items:center">
                  <div class="form-group" style="margin:0;flex:1">
                    <label class="form-label" style="font-size:11px">${t('calcom.from')}</label>
                    <input class="form-control" type="time" id="edit-sched-start" value="${startTime}">
                  </div>
                  <span style="font-size:20px;color:var(--text-3);padding-top:20px">→</span>
                  <div class="form-group" style="margin:0;flex:1">
                    <label class="form-label" style="font-size:11px">${t('calcom.to')}</label>
                    <input class="form-control" type="time" id="edit-sched-end" value="${endTime}">
                  </div>
                </div>
              </div>
            </div>

            <!-- RIGHT: Date overrides -->
            <div style="background:var(--surface-2);border-radius:var(--r-lg);border:1px solid var(--border);overflow:hidden">
              <div style="padding:14px 18px;border-bottom:1px solid var(--border);background:var(--surface-3)">
                <div style="font-size:13px;font-weight:700;color:var(--text)">📅 ${t('calcom.specific_dates_title')}</div>
                <div style="font-size:12px;color:var(--text-3);margin-top:2px">${t('calcom.specific_dates_override_desc')}</div>
              </div>
              <div style="padding:18px">

                <!-- Existing overrides list -->
                <div id="edit-overrides-list" style="margin-bottom:16px"></div>

                <!-- Add new date form — always visible -->
                <div style="border:1.5px dashed var(--border);border-radius:var(--r-lg);padding:16px;background:var(--surface)">
                  <div style="font-size:12px;font-weight:700;color:var(--text-2);margin-bottom:12px;display:flex;align-items:center;gap:6px">
                    <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:var(--accent);border-radius:50%;color:#fff;font-size:13px;font-weight:700">+</span>
                    ${t('calcom.add_specific_date')}
                  </div>
                  <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
                    <div class="form-group" style="margin:0;flex:1;min-width:150px">
                      <label class="form-label" style="font-size:11px">Date *</label>
                      <input type="date" class="form-control" id="ovr-date">
                    </div>
                    <label style="display:flex;align-items:center;gap:7px;font-size:13px;padding-bottom:8px;cursor:pointer;user-select:none;white-space:nowrap">
                      <input type="checkbox" id="ovr-unavail"
                        onchange="document.getElementById('ovr-slots-section').style.display=this.checked?'none':'block'">
                      ${t('calcom.all_day_unavailable')}
                    </label>
                  </div>
                  <div id="ovr-slots-section">
                    <div style="font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">
                      ${t('calcom.time_slots')}
                    </div>
                    <div id="ovr-slots-list"></div>
                    <button class="btn btn-sm btn-ghost" style="margin-top:6px;border:1.5px dashed var(--border)" onclick="addSlotToNewOverride()">
                      + ${t('calcom.add_another_slot')}
                    </button>
                  </div>
                  <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-soft)">
                    <button class="btn btn-primary btn-sm" onclick="confirmOverrideRow()">
                      ${t('calcom.add_to_list')}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <div style="display:flex;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
            <button class="btn btn-primary" onclick="saveEditSchedule(${scheduleId}, this)">
              ${t('calcom.save_changes_btn')}
            </button>
            <button class="btn btn-ghost" onclick="_closeEditScheduleModal()">
              ${t('calcom.cancel_btn')}
            </button>
          </div>
        </div>
      </div>
    </div>`
  );

  renderOverrideRows();
  renderNewOverrideSlots();
}

async function saveEditSchedule(scheduleId, btn) {
  const name      = document.getElementById('edit-sched-name')?.value?.trim();
  const timeZone  = document.getElementById('edit-sched-tz')?.value;
  const startTime = document.getElementById('edit-sched-start')?.value;
  const endTime   = document.getElementById('edit-sched-end')?.value;
  const days      = [...document.querySelectorAll('#edit-sched-days .day-pill.active')].map(btn => Number(btn.dataset.day));

  const dateOverrides = (window._editingOverrides || []).map(o => ({
    date:         o.date,
    availability: o.unavailable ? [] : o.slots,
  }));

  if (!name) {
    toast(t('calcom.sched_name_required'), 'error');
    return;
  }
  if (!days.length && !dateOverrides.length) {
    toast(t('calcom.sched_day_required'), 'error');
    return;
  }

  return withLoading(btn, async () => {
    const r = await api.patch(`/api/calcom/schedules/${scheduleId}`, {
      name,
      timeZone,
      availability: days.length ? [{ days, startTime, endTime }] : [],
      dateOverrides,
    });
    if (r?.success) {
      toast(t('calcom.schedule_updated'), 'success');
      document.getElementById('modal-edit-schedule')?.remove();
      document.getElementById('day-pill-style')?.remove();
      window._calcomSchedules = (window._calcomSchedules || []).map(s =>
        s.id === scheduleId ? (r.schedule || s) : s
      );
      renderScheduleList(window._calcomSchedules);
    } else {
      toast(r?.error || t('calcom.error'), 'error');
    }
  });
}

// ── Date override helpers ──

function renderOverrideRows() {
  const el = document.getElementById('edit-overrides-list');
  if (!el) return;
  const overrides = window._editingOverrides || [];
  if (!overrides.length) {
    el.innerHTML = `<div style="padding:12px;background:var(--surface-2);border-radius:var(--r);text-align:center">
      <p style="font-size:12px;color:var(--text-3);margin:0">
        ${t('calcom.no_overrides')}
      </p>
    </div>`;
    return;
  }
  el.innerHTML = overrides.map((o, i) => {
    const slotsHtml = o.unavailable
      ? `<span class="badge badge-red">${t('calcom.unavailable_all_day')}</span>`
      : (o.slots || []).map(s => `<span class="badge badge-green" style="font-family:var(--mono);font-size:11px">${s.startTime}–${s.endTime}</span>`).join(' ')
        || `<span style="font-size:12px;color:var(--text-3)">${t('calcom.no_slots')}</span>`;
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r);background:var(--surface-2);margin-bottom:6px">
      <span style="font-size:13px;font-weight:700;color:var(--text);min-width:105px;font-family:var(--mono)">${o.date}</span>
      <span style="flex:1;display:flex;flex-wrap:wrap;gap:4px;align-items:center">${slotsHtml}</span>
      <button class="btn btn-sm btn-danger" style="padding:3px 8px;flex-shrink:0" onclick="removeOverride(${i})">✕</button>
    </div>`;
  }).join('');
}

function confirmOverrideRow() {
  const dateEl   = document.getElementById('ovr-date');
  const unavail  = document.getElementById('ovr-unavail')?.checked;
  const date     = dateEl?.value;

  if (!date) {
    toast(t('calcom.override_date_required'), 'error');
    return;
  }
  if ((window._editingOverrides || []).some(o => o.date === date)) {
    toast(t('calcom.override_date_exists'), 'error');
    return;
  }
  const slots = unavail ? [] : (window._newOverrideSlots || []);
  if (!unavail && !slots.length) {
    toast(t('calcom.override_slot_required'), 'error');
    return;
  }

  window._editingOverrides = [...(window._editingOverrides || []), {
    date, unavailable: !!unavail, slots: [...slots],
  }];

  // Reset form for next entry
  if (dateEl) dateEl.value = '';
  const unavailEl = document.getElementById('ovr-unavail');
  if (unavailEl) unavailEl.checked = false;
  const slotsSec = document.getElementById('ovr-slots-section');
  if (slotsSec) slotsSec.style.display = 'block';
  window._newOverrideSlots = [{ startTime: '09:00', endTime: '17:00' }];
  renderNewOverrideSlots();
  renderOverrideRows();
}

function removeOverride(index) {
  window._editingOverrides = (window._editingOverrides || []).filter((_, i) => i !== index);
  renderOverrideRows();
}

function renderNewOverrideSlots() {
  const el = document.getElementById('ovr-slots-list');
  if (!el) return;
  const slots = window._newOverrideSlots || [];
  if (!slots.length) { el.innerHTML = ''; return; }
  el.innerHTML = slots.map((s, i) => `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:7px">
      <input type="time" class="form-control" style="width:115px" value="${s.startTime}"
        onchange="updateNewOverrideSlot(${i},'startTime',this.value)">
      <span style="font-size:14px;color:var(--text-3)">–</span>
      <input type="time" class="form-control" style="width:115px" value="${s.endTime}"
        onchange="updateNewOverrideSlot(${i},'endTime',this.value)">
      ${slots.length > 1
        ? `<button class="btn btn-sm btn-ghost" style="padding:4px 8px;color:var(--text-3)" onclick="removeSlotFromNewOverride(${i})">✕</button>`
        : '<div style="width:36px"></div>'}
    </div>`
  ).join('');
}

function addSlotToNewOverride() {
  window._newOverrideSlots = [...(window._newOverrideSlots || []), { startTime: '09:00', endTime: '17:00' }];
  renderNewOverrideSlots();
}

function removeSlotFromNewOverride(i) {
  window._newOverrideSlots = (window._newOverrideSlots || []).filter((_, idx) => idx !== i);
  renderNewOverrideSlots();
}

function updateNewOverrideSlot(i, field, val) {
  if (window._newOverrideSlots?.[i]) window._newOverrideSlots[i][field] = val;
}
