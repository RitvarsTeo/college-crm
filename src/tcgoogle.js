// MY WEEK + GMAIL (29.10.2026): the owner's picks - a Gmail card on My week's right (B) and, once a person connects,
// their emails with client contacts and their calendar meetings with client contacts on the day they happened.
//
// Each person connects their OWN Google account, once, read only (gmail.readonly + calendar.readonly). Intake cannot send,
// delete or change anything there. The refresh token is kept encrypted (AES-256-GCM, a key derived from
// CRM_SESSION_SECRET), one row per person; Disconnect revokes it at Google and deletes the row. Nothing from the mailbox
// is stored: a week is read when My week asks for it and kept in memory for a few minutes. Only messages and meetings
// that involve an email address of a client company's contact are shown, and only to the person whose account it is.
import crypto from 'node:crypto';
import { oauthClient, tokenUrl, CONSENT_URL, googleCodeOf, withCode } from '../lib/gmail.js';

export const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly', 'openid', 'email'];
const GMAIL = (env) => env.GMAIL_API_ROOT || 'https://gmail.googleapis.com/gmail/v1';
const CAL = (env) => env.GCAL_API_ROOT || 'https://www.googleapis.com/calendar/v3';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const keyOf = (env) => crypto.createHash('sha256').update('tc-google-v1:' + String(env.CRM_SESSION_SECRET || '')).digest();
const low = (s) => String(s || '').trim().toLowerCase();
const CACHE = new Map();   // user|monday -> { at, items }
const CACHE_MS = 5 * 60 * 1000;

export function consentUrl({ env = process.env, state, redirectUri, email }) {
  const c = oauthClient(env);
  if (!c.ok) return null;
  const u = new URL(CONSENT_URL);
  for (const [k, v] of Object.entries({ client_id: c.id, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', login_hint: email || '', state })) u.searchParams.set(k, v);
  return u.toString();
}

const emailOf = (idToken) => { try { return low(JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8')).email); } catch { return ''; } };

export async function exchangeCode({ env = process.env, code, redirectUri, fetchImpl = fetch }) {
  const c = oauthClient(env);
  if (!c.ok) return { ok: false, why: c.why };
  const res = await fetchImpl(tokenUrl(env), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: String(code || ''), client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri }).toString() });
  if (!res.ok) return { ok: false, why: withCode('Google refused the code', await googleCodeOf(res)) };
  let t; try { t = await res.json(); } catch { return { ok: false, why: 'the token reply was not JSON' }; }
  if (!t.refresh_token) return { ok: false, why: 'Google gave no refresh token; connect again' };
  const granted = String(t.scope || '').split(/\s+/);
  if (!SCOPES.slice(0, 2).every((s) => granted.includes(s))) return { ok: false, why: 'Gmail and Calendar were not both allowed; connect again and tick both' };
  return { ok: true, refreshToken: t.refresh_token, email: emailOf(t.id_token) };
}

function seal(token, env) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyOf(env), iv);
  const ct = Buffer.concat([c.update(String(token), 'utf8'), c.final()]);
  return ['g1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
function open(value, env) {
  const [v, iv, tag, ct] = String(value || '').split('.');
  if (v !== 'g1' || !iv || !tag || !ct) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', keyOf(env), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

/** Save one person's connection. Their Intake email and the Google account must be the same address. */
export async function saveLink(db, userEmail, refreshToken, env = process.env) {
  if (!env.CRM_SESSION_SECRET) throw new Error('CRM_SESSION_SECRET is needed to keep the token encrypted');
  const at = new Date().toISOString(), u = low(userEmail);
  await db.prepare(`INSERT INTO tc_google_links (user_email, token, connected_at) VALUES (?, ?, ?)
    ON CONFLICT (user_email) DO UPDATE SET token = excluded.token, connected_at = excluded.connected_at`).run(u, seal(refreshToken, env), at);
  for (const k of CACHE.keys()) if (k.startsWith(u + '|')) CACHE.delete(k);
}
export async function status(db, userEmail) {
  if (!userEmail) return { connected: false };
  const r = await db.prepare('SELECT connected_at FROM tc_google_links WHERE user_email = ?').get(low(userEmail));
  return r ? { connected: true, email: low(userEmail), since: r.connected_at } : { connected: false };
}
export async function disconnect(db, userEmail, { env = process.env, fetchImpl = fetch } = {}) {
  const u = low(userEmail);
  const r = await db.prepare('SELECT token FROM tc_google_links WHERE user_email = ?').get(u);
  if (r) {
    const t = open(r.token, env);
    if (t) { try { await fetchImpl(REVOKE, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: t }).toString() }); } catch {} }
    await db.prepare('DELETE FROM tc_google_links WHERE user_email = ?').run(u);
  }
  for (const k of CACHE.keys()) if (k.startsWith(u + '|')) CACHE.delete(k);
  return { connected: false };
}

async function accessToken(db, u, env, fetchImpl) {
  const r = await db.prepare('SELECT token FROM tc_google_links WHERE user_email = ?').get(u);
  const refresh = r && open(r.token, env);
  if (!refresh) return null;
  const c = oauthClient(env);
  if (!c.ok) return null;
  const res = await fetchImpl(tokenUrl(env), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: c.id, client_secret: c.secret }).toString() });
  if (res.status === 400 || res.status === 401) return 'gone';   // revoked at Google or the password changed
  if (!res.ok) throw new Error('Google did not answer');
  return (await res.json()).access_token || null;
}

const addrs = (h) => (String(h || '').match(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map(low);
const rigaDay = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Riga' });
async function pool(list, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k]); } })); return out; }

/** Monday..Friday: { connected, items: [{ day, kind: 'email'|'meeting', time?, companyId, company, contact, title, dir? }] }. */
export async function weekItems(db, userEmail, monday, friday, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  const u = low(userEmail);
  if (!u || !(await status(db, u)).connected) return { connected: false, items: [] };
  const key = u + '|' + monday, hit = CACHE.get(key);
  if (hit && now - hit.at < CACHE_MS) return { connected: true, items: hit.items };
  const tok = await accessToken(db, u, env, fetchImpl);
  if (tok === 'gone') { await db.prepare('DELETE FROM tc_google_links WHERE user_email = ?').run(u); return { connected: false, expired: true, items: [] }; }
  if (!tok) return { connected: false, items: [] };
  const contacts = new Map();
  for (const k of await db.prepare(`SELECT k.email, k.name, c.id AS company_id, c.name AS company FROM tc_company_contacts k JOIN tc_companies c ON c.id = k.company_id
    WHERE k.archived_at IS NULL AND c.archived_at IS NULL AND k.email IS NOT NULL AND k.email <> ''`).all()) {
    const e = low(k.email); if (e && e !== u && !contacts.has(e)) contacts.set(e, { companyId: Number(k.company_id), company: k.company, contact: k.name || e });
  }
  const H = { authorization: 'Bearer ' + tok };
  const start = Date.parse(monday + 'T00:00:00+03:00') - 3600000, end = Date.parse(friday + 'T23:59:59+02:00') + 3600000;
  const items = [];
  // Gmail: the week's messages (both ways), then only the ones with a client contact on them; one line per thread a day
  const ids = [];
  let page = '';
  for (let n = 0; n < 3; n++) {
    const q = `after:${Math.floor(start / 1000)} before:${Math.ceil(end / 1000)} -in:chats -category:promotions -category:social`;
    const r = await fetchImpl(`${GMAIL(env)}/users/me/messages?maxResults=100&q=${encodeURIComponent(q)}${page ? '&pageToken=' + page : ''}`, { headers: H });
    if (!r.ok) break;
    const j = await r.json();
    for (const m of j.messages || []) ids.push(m.id);
    if (!(page = j.nextPageToken)) break;
  }
  const seen = new Set();
  const metas = await pool(ids, 8, async (id) => {
    const r = await fetchImpl(`${GMAIL(env)}/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject`, { headers: H });
    return r.ok ? r.json() : null;
  });
  for (const m of metas) {
    if (!m) continue;
    const h = Object.fromEntries((m.payload && m.payload.headers || []).map((x) => [String(x.name).toLowerCase(), x.value]));
    const from = addrs(h.from), others = [...from, ...addrs(h.to), ...addrs(h.cc)];
    const who = others.map((e) => contacts.get(e)).find(Boolean);
    if (!who) continue;
    const day = rigaDay(Number(m.internalDate));
    if (day < monday || day > friday || seen.has(m.threadId + day + who.companyId)) continue;
    seen.add(m.threadId + day + who.companyId);
    items.push({ day, kind: 'email', dir: from.includes(u) ? 'out' : 'in', ...who, title: String(h.subject || '').slice(0, 140) });
  }
  // Calendar: the week's meetings with a client contact among the guests
  const cr = await fetchImpl(`${CAL(env)}/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(new Date(start).toISOString())}&timeMax=${encodeURIComponent(new Date(end).toISOString())}`, { headers: H });
  if (cr.ok) {
    for (const e of (await cr.json()).items || []) {
      if (e.status === 'cancelled') continue;
      const who = (e.attendees || []).map((a) => contacts.get(low(a.email))).find(Boolean);
      if (!who) continue;
      const t = e.start && (e.start.dateTime || e.start.date);
      const day = e.start && e.start.dateTime ? rigaDay(Date.parse(t)) : String(t).slice(0, 10);
      if (day < monday || day > friday) continue;
      const time = e.start && e.start.dateTime ? new Date(Date.parse(t)).toLocaleTimeString('en-GB', { timeZone: 'Europe/Riga', hour: '2-digit', minute: '2-digit' }) : '';
      items.push({ day, kind: 'meeting', time, ...who, title: String(e.summary || '').slice(0, 140) });
    }
  }
  items.sort((a, b) => a.day.localeCompare(b.day) || (a.kind === b.kind ? 0 : a.kind === 'meeting' ? -1 : 1) || String(a.time || '').localeCompare(String(b.time || '')));
  CACHE.set(key, { at: now, items });
  return { connected: true, items };
}
export const _test = { seal, open, addrs };
