// The answers of a Meta or LinkedIn lead form, fetched after the notification (C2 + C7, 30.09.2026).
// lib/leads.js talks to the providers; this file puts what they answer onto the New Leads item.
//
// A lead is never held back waiting for its answers: the item is stored first (ids only), then the
// answers are fetched. When that fails - no token yet, the provider down - the lead stays in New
// Leads as it is and lead_answers keeps it for the daily retry (api/cron/lead-answers.js).
//
// What is fetched only FILLS: a value somebody already has on the item or the person is kept.

import { FETCHERS, LeadFetchError, redactLead, TOKEN_ENV } from '../lib/leads.js';

export const MAX_TRIES = 10;
const nowIso = () => new Date().toISOString();

/** Which provider reference an adapted event needs its answers fetched by, or null. */
export function needsAnswers(ev) {
  if (!ev) return null;
  if (ev.channel === 'facebook' && ev.extracted && ev.extracted.intent === 'lead_form') {
    return { channel: 'facebook', ref: ev.externalEventId };
  }
  if (ev.channel === 'linkedin' && ev.externalContactId) return { channel: 'linkedin', ref: ev.externalContactId };
  return null;
}

async function fill(db, row, { env, fetchImpl, at }) {
  const token = env[TOKEN_ENV[row.channel]];
  let got;
  try {
    got = await FETCHERS[row.channel](row.provider_ref, { env, fetchImpl });
  } catch (err) {
    const why = err instanceof LeadFetchError ? err.message : 'the fetch failed: ' + redactLead(err && err.message, token);
    await db.prepare(`UPDATE lead_answers SET tries = tries + 1, last_error = ?, updated_at = ?
      WHERE channel = ? AND external_id = ?`).run(why, at, row.channel, row.external_id);
    return { state: 'pending', why };
  }
  const item = await db.prepare('SELECT * FROM inbound WHERE channel = ? AND external_id = ?').get(row.channel, row.external_id);
  if (item) {
    const text = got.answers.map((a) => `${a.name}: ${a.value}`).join('\n') || null;
    await db.prepare(`UPDATE inbound SET contact_name = COALESCE(contact_name, ?), contact_email = COALESCE(contact_email, ?),
      contact_phone = COALESCE(contact_phone, ?), body = CASE WHEN state = 'new' THEN ? ELSE body END WHERE id = ?`)
      .run(got.name, got.email, got.phone, text, item.id);
    if (got.programme) {
      await db.prepare(`INSERT INTO field_values (person_id, inbound_id, field, value, provenance, recorded_at, recorded_by)
        VALUES (?, ?, 'interest', ?, 'provider', ?, 'machine')`).run(item.person_id || null, item.id, got.programme, at);
    }
    if (item.person_id) {
      await db.prepare(`UPDATE people SET email = COALESCE(email, ?), phone = COALESCE(phone, ?),
        programme = COALESCE(programme, ?) WHERE id = ?`).run(got.email, got.phone, got.programme, item.person_id);
    }
  }
  await db.prepare(`UPDATE lead_answers SET state = 'done', tries = tries + 1, last_error = NULL, updated_at = ?
    WHERE channel = ? AND external_id = ?`).run(at, row.channel, row.external_id);
  return { state: 'done' };
}

/** Called by the webhook for every adapted event. Records what is owed and tries once, now. */
export async function queueLeadAnswers(db, ev, { env = process.env, fetchImpl = fetch, at = nowIso() } = {}) {
  const need = needsAnswers(ev);
  if (!need) return null;
  await db.prepare(`INSERT INTO lead_answers (channel, external_id, provider_ref, state, tries, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', 0, ?, ?) ON CONFLICT (channel, external_id) DO NOTHING`)
    .run(need.channel, ev.externalEventId, need.ref, at, at);
  const row = await db.prepare('SELECT * FROM lead_answers WHERE channel = ? AND external_id = ?').get(need.channel, ev.externalEventId);
  if (row.state === 'done') return { state: 'done' };
  return fill(db, row, { env, fetchImpl, at });
}

/** The daily retry: every lead still owed its answers, up to MAX_TRIES attempts each. */
export async function retryLeadAnswers(db, { env = process.env, fetchImpl = fetch, at = nowIso() } = {}) {
  const rows = await db.prepare(`SELECT * FROM lead_answers WHERE state = 'pending' AND tries < ? ORDER BY created_at`).all(MAX_TRIES);
  let filled = 0;
  const waiting = [];
  for (const row of rows) {
    const r = await fill(db, row, { env, fetchImpl, at });
    if (r.state === 'done') filled++;
    else waiting.push(r.why);
  }
  return { ok: true, tried: rows.length, filled, pending: waiting.length, why: [...new Set(waiting)] };
}
