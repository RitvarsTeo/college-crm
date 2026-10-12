// The admissions sheet, READ ONLY (Q89, the owner 12.10.2026): "connect the drive link with the app. check if
// any new info comes in and update the app accordingly. Until you see that 100% leads are made in the app."
//
// The Google side only: the one-time Allow by the sheet's owner, the stored sign-in, and reading two tabs.
// It never writes to the sheet, and the scope it asks for cannot: spreadsheets.readonly.
//
// ACCESS, least privilege. The same OAuth client Intake already signs in with (GOOGLE_CLIENT_ID / _SECRET),
// so there is NO new secret. edu@novikontas.org, who owns the sheet, approves ONE read-only scope once; its
// refresh token is kept encrypted in sync_state 'sheet_oauth', apart from the Gmail sign-in, so Gmail gains
// nothing. "openid email" only tells us WHICH account approved, so nothing but edu@ is ever kept.
//
// NOTHING HERE PRINTS A SECRET. The refresh token is encrypted at rest (key from CRM_SESSION_SECRET) and is
// never returned, logged or put in a URL.

import crypto from 'node:crypto';
import { oauthClient, CONSENT_URL, tokenUrl, googleCodeOf, withCode } from './gmail.js';

export const OWNER = 'edu@novikontas.org';
export const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/spreadsheets.readonly'];
const STATE = 'sheet_oauth';
const sheetsRoot = (env = process.env) => env.SHEETS_API_ROOT || 'https://sheets.googleapis.com/v4';
const userinfoUrl = (env = process.env) => env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo';

const keyOf = (env) => crypto.createHash('sha256').update('sheet-oauth-v1:' + String(env.CRM_SESSION_SECRET || '')).digest();

export async function saveSheetToken(db, token, env = process.env) {
  if (!env.CRM_SESSION_SECRET) throw new Error('CRM_SESSION_SECRET is needed to keep the token encrypted');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(env), iv);
  const ct = Buffer.concat([c.update(String(token), 'utf8'), c.final()]);
  const value = ['s1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
  await db.prepare(`INSERT INTO sync_state (name, value, ran_at, detail) VALUES (?, ?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET value = excluded.value, ran_at = excluded.ran_at, detail = excluded.detail`)
    .run(STATE, value, new Date().toISOString(), JSON.stringify({ owner: OWNER }));
}

export async function loadSheetToken(db, env = process.env) {
  if (!db || !env.CRM_SESSION_SECRET) return null;
  const row = await db.prepare('SELECT value FROM sync_state WHERE name = ?').get(STATE);
  if (!row || !row.value) return null;
  const [tag, iv, auth, ct] = String(row.value).split('.');
  if (tag !== 's1') return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', keyOf(env), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(auth, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

export function consentUrl({ env = process.env, state, redirectUri }) {
  const c = oauthClient(env);
  if (!c.ok) return null;
  const u = new URL(CONSENT_URL);
  u.searchParams.set('client_id', c.id);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES.join(' '));
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('login_hint', OWNER);
  u.searchParams.set('state', state);
  return u.toString();
}

/** The code for a refresh token, and WHICH account approved. The caller keeps it only for OWNER. */
export async function exchangeCode({ env = process.env, code, redirectUri, fetchImpl = fetch }) {
  const c = oauthClient(env);
  if (!c.ok) return { ok: false, why: c.why };
  const res = await fetchImpl(tokenUrl(env), { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: String(code || ''),
      client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri }).toString() });
  if (!res.ok) return { ok: false, why: withCode('Google refused the code', await googleCodeOf(res)) };
  let t;
  try { t = await res.json(); } catch { return { ok: false, why: 'the token reply was not JSON' }; }
  if (!t.refresh_token) return { ok: false, why: 'Google gave no refresh token; connect again' };
  const who = await fetchImpl(userinfoUrl(env), { headers: { authorization: 'Bearer ' + t.access_token } });
  if (!who.ok) return { ok: false, why: 'Google did not say which account approved' };
  const me = await who.json();
  return { ok: true, refreshToken: t.refresh_token, account: String(me.email || '').toLowerCase() };
}

export async function accessToken({ env = process.env, refreshToken, fetchImpl = fetch }) {
  const c = oauthClient(env);
  if (!c.ok) return { ok: false, why: c.why };
  const res = await fetchImpl(tokenUrl(env), { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken,
      client_id: c.id, client_secret: c.secret }).toString() });
  if (!res.ok) return { ok: false, why: withCode('Google refused the stored sign-in; connect the sheet again', await googleCodeOf(res)) };
  let t;
  try { t = await res.json(); } catch { return { ok: false, why: 'the token reply was not JSON' }; }
  return { ok: true, token: t.access_token };
}

/** The spreadsheet's tab names, so a configured tab is found without case or punctuation. */
export async function tabTitles({ env = process.env, token, spreadsheetId, fetchImpl = fetch }) {
  const url = `${sheetsRoot(env)}/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`;
  const res = await fetchImpl(url, { headers: { authorization: 'Bearer ' + token, accept: 'application/json' } });
  if (!res.ok) return { ok: false, status: res.status, why: withCode('the sheet could not be opened', await googleCodeOf(res)) };
  let d;
  try { d = await res.json(); } catch { return { ok: false, why: 'the sheet reply was not JSON' }; }
  return { ok: true, titles: (d.sheets || []).map((s) => s && s.properties && s.properties.title).filter(Boolean) };
}
export const sameTab = (a, b) => squashTab(a) === squashTab(b);
const squashTab = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** One tab, as the sheet shows it (formatted values: dates as typed, phones as text). Rows of cells. */
export async function readTab({ env = process.env, token, spreadsheetId, tab, fetchImpl = fetch }) {
  const range = encodeURIComponent(`'${String(tab).replace(/'/g, "''")}'`);
  const url = `${sheetsRoot(env)}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`;
  const res = await fetchImpl(url, { headers: { authorization: 'Bearer ' + token, accept: 'application/json' } });
  if (!res.ok) return { ok: false, status: res.status, why: withCode(`the tab "${tab}" could not be read`, await googleCodeOf(res)) };
  let d;
  try { d = await res.json(); } catch { return { ok: false, why: 'the sheet reply was not JSON' }; }
  return { ok: true, values: Array.isArray(d.values) ? d.values : [] };
}

// ------------------------------------------------------------- the rows --
// Columns are found by their HEADER, never by position, so a column the team adds or moves breaks nothing.
// A header is compared without case, spaces or punctuation, by its start: "First contact (dd/mm/yyyy)" is
// firstcontact. The header row is the first row that names the lead.
export const COLUMNS = {
  no: 'no', name: 'leadnamesurname', programme: 'studyprogram', education: 'education',
  firstContact: 'firstcontact', phone: 'leadphone', email: 'leademail', source: 'source',
  status: 'status', notes: 'notes', nextAction: 'nextactiondate', docs: 'docs', onboarding: 'onboarding',
};
const squash = (v) => String(v == null ? '' : v).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

export function rowsOf(values) {
  const at = (values || []).findIndex((r) => (r || []).some((c) => squash(c).startsWith(COLUMNS.name)));
  if (at < 0) return { ok: false, why: 'no "Lead Name Surname" header', rows: [] };
  const head = values[at].map(squash);
  const col = {};
  for (const [k, key] of Object.entries(COLUMNS)) {
    const i = head.findIndex((h) => (k === 'no' ? h === 'no' || h === 'nr' : h.startsWith(key)));
    if (i >= 0) col[k] = i;
  }
  const rows = [];
  values.slice(at + 1).forEach((r, i) => {
    const cell = (k) => (col[k] == null ? null : (r[col[k]] == null || String(r[col[k]]).trim() === '' ? null : String(r[col[k]]).trim()));
    const name = cell('name');
    if (!name) return;
    rows.push({ line: at + 2 + i, ...Object.fromEntries(Object.keys(COLUMNS).map((k) => [k, cell(k)])) });
  });
  return { ok: true, rows, columns: Object.keys(col) };
}

// "dd/mm/yyyy" (also dd.mm.yyyy, d/m/yy) as a Riga calendar day, YYYY-MM-DD. Anything else is NOT a date.
export function sheetDay(v) {
  const m = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\s*$/.exec(String(v || ''));
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mo = Number(m[2]); const d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const t = new Date(iso + 'T12:00:00Z');
  return t.getUTCMonth() + 1 === mo ? iso : null;            // 31/02 is not a day
}
