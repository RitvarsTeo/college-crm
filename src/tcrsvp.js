// THE RSVP ANSWERS (26.10.2026): the owner's Client Hub pick 10, layout B "One funnel, by person in charge", read LIVE.
//
// The Save the Date's landing page writes each answer (yes / maybe / no, how many people) into Client Hub's database.
// Intake reads them, read-only, on each page load: one view (intake_read.rsvp_answers, docs/client-hub/
// intake_rsvp_reader.sql) through one login (intake_rsvp_reader) that can SELECT that view and nothing else, read-only
// at the role, 5 s statement limit. The address is CLIENT_HUB_RSVP_DATABASE_URL; without it Intake shows no answers
// (fails closed: nothing is guessed, nothing else is reached). The certificate is verified (src/db.js pgSsl, the
// Supabase root Intake already carries). Answers are kept 60 s in memory, so a busy page never becomes many reads.
//
// Who answered is matched live, never copied: the answer's Client Hub contact id -> the Intake contact with that id ->
// its company and person in charge; else the review list's row; else the company as Client Hub writes it.

import { pgSsl } from './db.js';
import { isMine, meKeys } from './tcpic.js';

const TTL_MS = 60 * 1000;
const ANSWERS = ['yes', 'maybe', 'no'];
let cache = null;          // { at, rows }
let fetcher = null;        // tests put their own here

export const configured = (env = process.env) => Boolean(String(env.CLIENT_HUB_RSVP_DATABASE_URL || '').trim());

/** For tests: answer rows without a database. Pass null to go back to the real one. */
export function setFetcher(fn) { fetcher = fn; cache = null; }

async function readClientHub(env) {
  const url = String(env.CLIENT_HUB_RSVP_DATABASE_URL || '').trim();
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: url, ssl: pgSsl(url), connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  await c.connect();
  try {
    const r = await c.query(`SELECT contact_id, person_name, company, answer, guests, updated_at FROM intake_read.rsvp_answers`);
    return r.rows;
  } finally { await c.end().catch(() => {}); }
}

/** The answers as Client Hub has them now (or up to 60 s ago); null when not configured or not reachable. */
export async function answers({ env = process.env, now = Date.now() } = {}) {
  if (!fetcher && !configured(env)) return null;
  if (cache && now - cache.at < TTL_MS) return cache.rows;
  let rows;
  try { rows = await (fetcher || readClientHub)(env); } catch (e) {
    console.error('rsvp: Client Hub could not be read:', e && e.code ? e.code : 'error');
    return cache ? cache.rows : null;
  }
  const clean = (rows || []).filter((r) => ANSWERS.includes(String(r.answer))).map((r) => ({
    chContactId: String(r.contact_id || ''), name: String(r.person_name || '').slice(0, 160), company: String(r.company || '').slice(0, 200),
    answer: String(r.answer), people: r.answer === 'no' ? 0 : Math.max(1, Math.min(10, Number(r.guests) || 1)),
    at: r.updated_at ? new Date(r.updated_at).toISOString() : null }));
  cache = { at: now, rows: clean };
  return clean;
}

async function whoIs(db, list) {
  const byCh = new Map((await db.prepare(`SELECT k.ch_contact_id, k.name, c.id AS company_id, c.name AS company, c.pic_name, c.pic_email
    FROM tc_company_contacts k JOIN tc_companies c ON c.id = k.company_id
    WHERE k.archived_at IS NULL AND c.archived_at IS NULL AND k.ch_contact_id IS NOT NULL`).all()).map((k) => [k.ch_contact_id, k]));
  const review = new Map((await db.prepare(`SELECT ch_contact_id, ch_company FROM tc_review_contacts`).all()).map((r) => [r.ch_contact_id, r]));
  return list.map((a) => {
    const k = byCh.get(a.chContactId);
    if (k) return { ...a, name: k.name || a.name, companyId: Number(k.company_id), company: k.company, pic: k.pic_name || '', picEmail: k.pic_email || '' };
    const r = review.get(a.chContactId);
    return { ...a, companyId: null, company: (r && r.ch_company) || a.company, pic: '', picEmail: '' };
  });
}

/**
 * The page's part: { connected, totals: { answered, yes, maybe, no, coming }, groups: [{ pic, rows }] } newest first,
 * grouped by person in charge (no person in charge last). scope 'mine' keeps the signed-in person's companies only.
 */
export async function rsvpPage(db, { me = null, scope = 'team', env = process.env, now = Date.now() } = {}) {
  const list = await answers({ env, now });
  if (!list) return { connected: false };
  const rows = (await whoIs(db, list)).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const mk = meKeys(me);
  const shown = scope === 'mine' ? rows.filter((r) => isMine({ picEmail: r.picEmail, pic: r.pic, next: null }, mk)) : rows;
  const totals = { answered: rows.length, yes: 0, maybe: 0, no: 0, coming: 0 };
  for (const r of rows) { totals[r.answer] += 1; if (r.answer === 'yes') totals.coming += r.people; }
  const groups = new Map();
  for (const r of shown) {
    const key = r.pic || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ companyId: r.companyId, company: r.company, name: r.name, answer: r.answer, people: r.people, at: r.at });
  }
  const order = [...groups.keys()].sort((a, b) => (!a) - (!b) || groups.get(b).length - groups.get(a).length || a.localeCompare(b, 'lv'));
  return { connected: true, scope, totals, shown: shown.length, groups: order.map((pic) => ({ pic, rows: groups.get(pic) })) };
}

/** One company's answers, for its page: [{ name, answer, people }] (empty when none or not connected). */
export async function rsvpForCompany(db, companyId, { env = process.env, now = Date.now() } = {}) {
  const list = await answers({ env, now });
  if (!list || !list.length) return [];
  const ids = new Set((await db.prepare(`SELECT ch_contact_id FROM tc_company_contacts WHERE company_id = ? AND ch_contact_id IS NOT NULL`)
    .all(Number(companyId))).map((k) => k.ch_contact_id));
  return list.filter((a) => ids.has(a.chContactId)).map((a) => ({ name: a.name, answer: a.answer, people: a.people }));
}
