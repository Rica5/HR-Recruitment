const express      = require('express');
const router       = express.Router();
const axios        = require('axios');
const Candidature  = require('../models/Candidature');
const { be }       = require('../middleware/i18n');

const CAL_BASE = 'https://api.cal.com/v2';

function calHeaders() {
  return {
    Authorization:     `Bearer ${process.env.CALCOM_API_KEY}`,
    'cal-api-version': '2024-06-14',
    'Content-Type':    'application/json',
  };
}

let _cachedMe     = null;
let _meExpiry     = 0;
async function getMe() {
  if (_cachedMe && Date.now() < _meExpiry) return _cachedMe;
  const r  = await axios.get(`${CAL_BASE}/me`, { headers: calHeaders() });
  _cachedMe = {
    username: r.data?.data?.username || '',
    timeZone: r.data?.data?.timeZone || 'UTC',
  };
  _meExpiry = Date.now() + 60 * 60 * 1000; // 1h TTL
  return _cachedMe;
}
async function getUsername() { return (await getMe()).username; }

function normalizeEventTypes(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw?.eventTypeGroups) return (raw.eventTypeGroups).flatMap(g => g.eventTypes || []);
  if (raw?.eventTypes)      return raw.eventTypes;
  return [];
}

// Cal.com v2 API uses string day names; the frontend uses numbers (0=Sun … 6=Sat)
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function daysToNames(days) {
  return (days || []).map(d => typeof d === 'number' ? DAY_NAMES[d] : d).filter(Boolean);
}

function namesToDays(names) {
  return (names || []).map(n => typeof n === 'string' ? DAY_NAMES.indexOf(n) : n).filter(d => d >= 0);
}

function normalizeAvailabilityOut(availability) {
  return (availability || []).map(a => ({ ...a, days: daysToNames(a.days) }));
}

function normalizeAvailabilityIn(availability) {
  return (availability || []).map(a => ({ ...a, days: namesToDays(a.days) }));
}

// Cal.com expects flat dateOverrides: [{date, startTime, endTime}] — one object per slot
// Frontend uses nested: [{date, availability:[{startTime,endTime}]}]
function flattenDateOverrides(overrides) {
  const result = [];
  for (const o of overrides || []) {
    if (!o.availability?.length) continue; // skip unavailable-all-day entries
    for (const slot of o.availability) {
      result.push({ date: o.date, startTime: slot.startTime, endTime: slot.endTime });
    }
  }
  return result;
}

// Group Cal.com's flat format back to nested for the frontend
function groupDateOverrides(flat) {
  const map = new Map();
  for (const o of flat || []) {
    if (!map.has(o.date)) map.set(o.date, { date: o.date, availability: [] });
    if (o.startTime && o.endTime)
      map.get(o.date).availability.push({ startTime: o.startTime, endTime: o.endTime });
  }
  return Array.from(map.values());
}

function normalizeSchedule(s) {
  return {
    ...s,
    availability:  normalizeAvailabilityIn(s.availability),
    dateOverrides: groupDateOverrides(s.overrides || s.dateOverrides),
  };
}

// GET /api/calcom/event-types
router.get('/event-types', async (req, res) => {
  try {
    const [etRes, username] = await Promise.all([
      axios.get(`${CAL_BASE}/event-types`, { headers: calHeaders() }),
      getUsername(),
    ]);
    const eventTypes = normalizeEventTypes(etRes.data?.data).map(et => ({
      id:              et.id,
      title:           et.title,
      slug:            et.slug,
      lengthInMinutes: et.lengthInMinutes,
      description:     et.description || '',
      scheduleId:      et.scheduleId || null,
      locations:       et.locations  || [],
      bookingUrl:      `https://cal.com/${username}/${et.slug}`,
    }));
    res.json({ success: true, eventTypes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/calcom/event-types
router.post('/event-types', async (req, res) => {
  const { title, lengthInMinutes, description, scheduleId, locations } = req.body;
  if (!title || !lengthInMinutes)
    return res.status(400).json({ success: false, error: be(req, 'title et lengthInMinutes sont requis', 'title and lengthInMinutes are required') });
  try {
    const slug    = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const payload = { title, slug, lengthInMinutes: Number(lengthInMinutes) };
    if (description)                               payload.description = description;
    if (scheduleId)                                payload.scheduleId  = Number(scheduleId);
    if (Array.isArray(locations) && locations.length) payload.locations = locations;

    const [etRes, username] = await Promise.all([
      axios.post(`${CAL_BASE}/event-types`, payload, { headers: calHeaders() }),
      getUsername(),
    ]);
    const et = etRes.data?.data;
    res.json({
      success: true,
      eventType: { ...et, locations: et.locations || [], bookingUrl: `https://cal.com/${username}/${et.slug}` },
    });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.message || err.message,
    });
  }
});

// DELETE /api/calcom/event-types/:id
router.delete('/event-types/:id', async (req, res) => {
  try {
    await axios.delete(`${CAL_BASE}/event-types/${req.params.id}`, { headers: calHeaders() });
    res.json({ success: true });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.message || err.message,
    });
  }
});

// PATCH /api/calcom/event-types/:id
router.patch('/event-types/:id', async (req, res) => {
  try {
    const { title, lengthInMinutes, description, locations } = req.body;
    const payload = {};
    if (title)                                        payload.title           = title;
    if (lengthInMinutes)                              payload.lengthInMinutes = Number(lengthInMinutes);
    if (description !== undefined)                    payload.description     = description;
    if (Array.isArray(locations) && locations.length) payload.locations       = locations;

    const [etRes, username] = await Promise.all([
      axios.patch(`${CAL_BASE}/event-types/${req.params.id}`, payload, { headers: calHeaders() }),
      getUsername(),
    ]);
    const et = etRes.data?.data;
    res.json({
      success: true,
      eventType: { ...et, locations: et.locations || [], bookingUrl: `https://cal.com/${username}/${et.slug}` },
    });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.message || err.message,
    });
  }
});

// GET /api/calcom/schedules
router.get('/schedules', async (req, res) => {
  try {
    const r = await axios.get(`${CAL_BASE}/schedules`, { headers: calHeaders() });
    const schedules = (r.data?.data || []).map(normalizeSchedule);
    res.json({ success: true, schedules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/calcom/schedules
router.post('/schedules', async (req, res) => {
  const { name, timeZone, availability, dateOverrides } = req.body;
  if (!name || !timeZone)
    return res.status(400).json({ success: false, error: be(req, 'name et timeZone sont requis', 'name and timeZone are required') });
  try {
    // Step 1: create the schedule (Cal.com ignores dateOverrides on POST)
    const createPayload = { name, timeZone, isDefault: false };
    if (Array.isArray(availability) && availability.length)
      createPayload.availability = normalizeAvailabilityOut(availability);

    const createRes = await axios.post(`${CAL_BASE}/schedules`, createPayload, { headers: calHeaders() });
    const schedule  = createRes.data?.data;

    // Step 2: if no recurring days, PATCH to clear Cal.com's default Mon-Fri
    if (!Array.isArray(availability) || !availability.length) {
      try {
        await axios.patch(`${CAL_BASE}/schedules/${schedule.id}`, { availability: [] }, { headers: calHeaders() });
      } catch (_) {}
    }

    // Step 3: PATCH to set date overrides (separate call — Cal.com ignores overrides when sent with availability)
    const flat = flattenDateOverrides(dateOverrides);
    if (flat.length) {
      try {
        const patchRes = await axios.patch(
          `${CAL_BASE}/schedules/${schedule.id}`,
          { overrides: flat },
          { headers: calHeaders() },
        );
        return res.json({ success: true, schedule: normalizeSchedule(patchRes.data?.data || schedule) });
      } catch (_) { /* overrides PATCH failed — return what we have */ }
    }

    res.json({ success: true, schedule: normalizeSchedule(schedule) });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.message || err.message,
    });
  }
});

// DELETE /api/calcom/schedules/:id
router.delete('/schedules/:id', async (req, res) => {
  try {
    await axios.delete(`${CAL_BASE}/schedules/${req.params.id}`, { headers: calHeaders() });
    res.json({ success: true });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.message || err.message,
    });
  }
});

// PATCH /api/calcom/schedules/:id
router.patch('/schedules/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    if (Array.isArray(body.availability) && body.availability.length)
      body.availability = normalizeAvailabilityOut(body.availability);
    else
      delete body.availability;
    if (Array.isArray(body.dateOverrides)) {
      body.overrides = flattenDateOverrides(body.dateOverrides);
      delete body.dateOverrides;
    }
    const r = await axios.patch(
      `${CAL_BASE}/schedules/${req.params.id}`,
      body,
      { headers: calHeaders() },
    );
    res.json({ success: true, schedule: normalizeSchedule(r.data?.data) });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.message || err.message,
    });
  }
});

// POST /api/calcom/bookings/:uid/cancel
router.post('/bookings/:uid/cancel', async (req, res) => {
  try {
    const { reason, candidature_id } = req.body;
    await axios.post(
      `${CAL_BASE}/bookings/${req.params.uid}/cancel`,
      { cancellationReason: reason || 'Annulé par le recruteur' },
      { headers: { ...calHeaders(), 'cal-api-version': '2024-08-13' }, timeout: 15000 },
    );

    if (candidature_id) {
      await Candidature.findByIdAndUpdate(candidature_id, {
        $set: { rdv_pris: false, rdv_manuel: null, statut: 'En cours' },
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.message || err.message,
    });
  }
});

// POST /api/calcom/bookings/:uid/reschedule
router.post('/bookings/:uid/reschedule', async (req, res) => {
  try {
    const { start, reason, candidature_id } = req.body;
    if (!start) return res.status(400).json({ success: false, error: be(req, 'start est requis', 'start is required') });

    const r = await axios.post(
      `${CAL_BASE}/bookings/${req.params.uid}/reschedule`,
      { start, reschedulingReason: reason || 'Reprogrammé par le recruteur' },
      { headers: { ...calHeaders(), 'cal-api-version': '2024-08-13' }, timeout: 15000 },
    );

    if (candidature_id) {
      await Candidature.findByIdAndUpdate(candidature_id, {
        $set: { rdv_manuel: { date: new Date(start), heure: '', lieu: '', note: '', type_rdv: '' } },
      });
    }

    res.json({ success: true, booking: r.data?.data || null });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.message || err.message,
    });
  }
});

// GET /api/calcom/bookings?status=upcoming&take=100
router.get('/bookings', async (req, res) => {
  try {
    const { status = 'upcoming', take = '100' } = req.query;
    const r = await axios.get(`${CAL_BASE}/bookings`, {
      params:  { status, take: Math.min(parseInt(take) || 100, 200) },
      headers: { ...calHeaders(), 'cal-api-version': '2024-08-13' },
      timeout: 15000,
    });

    const raw      = r.data?.data;
    const bookings = Array.isArray(raw) ? raw : (Array.isArray(raw?.bookings) ? raw.bookings : []);

    // Batch DB lookups
    const metaIds = bookings.map(b => b.metadata?.candidature_id).filter(Boolean);
    const emails  = [...new Set(bookings.map(b => b.attendees?.[0]?.email).filter(Boolean))];

    const [byId, byEmail] = await Promise.all([
      metaIds.length ? Candidature.find({ _id: { $in: metaIds } }).lean() : Promise.resolve([]),
      emails.length  ? Candidature.find({ candidat_email: { $in: emails } }).sort({ date_candidature: -1 }).lean() : Promise.resolve([]),
    ]);

    const idMap    = new Map(byId.map(c => [c._id.toString(), c]));
    const emailMap = new Map();
    for (const c of byEmail) {
      if (!emailMap.has(c.candidat_email)) emailMap.set(c.candidat_email, c);
    }

    const userCompany = req.user.company;
    const { timeZone: organizerTimeZone } = await getMe().catch(() => ({ timeZone: 'UTC' }));

    const enriched = bookings.map(b => {
      const metaCandId = b.metadata?.candidature_id;
      const email      = b.attendees?.[0]?.email;
      let cand = metaCandId ? idMap.get(metaCandId) : null;
      if (!cand && email) cand = emailMap.get(email) || null;

      // Only show bookings belonging to this company (or unlinked orphans)
      if (cand && cand.company !== userCompany) return null;

      return {
        uid:       b.uid,
        status:    b.status,
        start:     b.start,
        end:       b.end,
        location:  b.location || '',
        attendees: (b.attendees || []).map(a => ({ name: a.name, email: a.email })),
        eventType: b.eventType ? { id: b.eventType.id, title: b.eventType.title, slug: b.eventType.slug } : null,
        metadata:  b.metadata || {},
        candidature: cand ? {
          _id:                cand._id,
          candidat_nom:       cand.candidat_nom,
          candidat_email:     cand.candidat_email,
          candidat_telephone: cand.candidat_telephone || '',
          titre_poste:        cand.titre_poste,
          offre_id:           cand.offre_id,
          recommandation:     cand.recommandation,
          email_recruteur:    cand.email_recruteur,
          company:            cand.company,
        } : null,
      };
    }).filter(Boolean);

    res.json({ success: true, bookings: enriched, organizerTimeZone });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data?.message || err.message,
    });
  }
});

module.exports = router;
