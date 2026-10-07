// CONNECT WHATSAPP (07.10.2026). The academy number +371 23111114 stays on the staff phone in the WhatsApp Business app
// and is ALSO connected to our Meta app ("coexistence", Ritvars 07.10.2026: "Yes, coexistence", route "Own Meta app").
// Meta's Embedded Signup runs in the admin's browser and hands back a one-time code; everything after it happens HERE,
// on the server, checked against Meta's "Onboarding WhatsApp Business app users" page the same day:
//   1. the code is exchanged for the business token: GET <graph>/oauth/access_token?client_id&client_secret&code;
//   2. the token is kept ENCRYPTED in sync_state 'whatsapp_oauth' (AES-256-GCM, key from CRM_SESSION_SECRET), the same
//      way as gmail_oauth; never returned, logged or shown;
//   3. the app is subscribed to the account's notifications: POST <graph>/<WABA_ID>/subscribed_apps;
//   4. the two syncs Meta requires within 24 hours, or the number is offboarded: POST <graph>/<PHONE_NUMBER_ID>/smb_app_data
//      with sync_type smb_app_state_sync, then history. Intake does NOT import what they send (history import OFF,
//      MASTER CONTROL 07.10.2026); starting them only keeps the connection alive;
//   5. NO /register: "skip the phone number registration step, as the number is already registered".
// Ids (app, configuration, account, number) are not secrets. The app secret and the token are, and only names of them
// appear in this file.

import crypto from 'node:crypto';

export const META_GRAPH = 'https://graph.facebook.com/v25.0';
export const GRAPH_VERSION = 'v25.0';
export class WhatsAppConnectError extends Error {}

const graph = (env) => env.META_GRAPH_BASE || META_GRAPH;

/** What the browser needs to open Meta's sign-up, and which settings are still missing. Ids only. */
export function connectConfig(env = process.env) {
  const missing = ['META_APP_ID', 'WHATSAPP_ES_CONFIG_ID', 'META_APP_SECRET', 'CRM_SESSION_SECRET'].filter((k) => !env[k]);
  return { appId: env.META_APP_ID || null, configId: env.WHATSAPP_ES_CONFIG_ID || null, graphVersion: GRAPH_VERSION, missing };
}

const clean = (text, secrets) => {
  let out = String(text ?? '');
  for (const s of secrets) if (s) out = out.split(s).join('[redacted]');
  return out;
};

async function call(fetchImpl, url, opts, secrets) {
  let res;
  try { res = await fetchImpl(url, opts); }
  catch (err) { throw new WhatsAppConnectError('the request failed: ' + clean(err && err.message, secrets)); }
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const msg = body && body.error && body.error.message ? ': ' + clean(body.error.message, secrets).slice(0, 120) : '';
    throw new WhatsAppConnectError(`Meta answered ${res.status}${msg}`);
  }
  return body || {};
}

const keyOf = (env) => crypto.createHash('sha256').update('whatsapp-oauth-v1:' + String(env.CRM_SESSION_SECRET || '')).digest();

async function saveToken(db, token, detail, env) {
  if (!env.CRM_SESSION_SECRET) throw new WhatsAppConnectError('CRM_SESSION_SECRET is needed to keep the token encrypted');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(env), iv);
  const ct = Buffer.concat([c.update(String(token), 'utf8'), c.final()]);
  const value = ['w1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
  await db.prepare(`INSERT INTO sync_state (name, value, ran_at, detail) VALUES ('whatsapp_oauth', ?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET value = excluded.value, ran_at = excluded.ran_at, detail = excluded.detail`)
    .run(value, new Date().toISOString(), JSON.stringify(detail));
}

/** The stored business token, or null. For the server's own later calls; never sent anywhere else. */
export async function loadWhatsAppToken(db, env = process.env) {
  if (!db || !env.CRM_SESSION_SECRET) return null;
  const row = await db.prepare("SELECT value FROM sync_state WHERE name = 'whatsapp_oauth'").get();
  const [tag, iv, auth, ct] = String((row && row.value) || '').split('.');
  if (tag !== 'w1') return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', keyOf(env), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(auth, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch { return null; }
}

/** Everything after Meta's sign-up hands back its code. Throws WhatsAppConnectError with one line for the screen. */
export async function finishConnect(db, { code, wabaId, phoneNumberId = null, number = null, env = process.env, fetchImpl = fetch }) {
  const cfg = connectConfig(env);
  if (cfg.missing.length) throw new WhatsAppConnectError('Missing: ' + cfg.missing.join(', '));
  if (!code) throw new WhatsAppConnectError('Meta sent no code: the sign-up was not finished');
  if (!wabaId) throw new WhatsAppConnectError('Meta sent no WhatsApp account id: the sign-up was not finished');
  const secrets = [env.META_APP_SECRET, code];
  const base = graph(env);
  const tok = await call(fetchImpl, `${base}/oauth/access_token?client_id=${encodeURIComponent(env.META_APP_ID)}`
    + `&client_secret=${encodeURIComponent(env.META_APP_SECRET)}&code=${encodeURIComponent(code)}`, { method: 'GET' }, secrets);
  const token = tok.access_token;
  if (!token) throw new WhatsAppConnectError('Meta gave no token');
  secrets.push(token);
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  let pn = phoneNumberId;
  if (!pn) {
    const nums = await call(fetchImpl, `${base}/${encodeURIComponent(wabaId)}/phone_numbers`, { method: 'GET', headers: auth }, secrets);
    const want = String(number || '').replace(/\D/g, '').slice(-8);
    const list = nums.data || [];
    const hit = list.find((n) => want && String(n.display_phone_number || '').replace(/\D/g, '').endsWith(want)) || list[0];
    if (!hit) throw new WhatsAppConnectError('the WhatsApp account has no number');
    pn = String(hit.id);
  }
  await saveToken(db, token, { wabaId, phoneNumberId: pn }, env);
  await call(fetchImpl, `${base}/${encodeURIComponent(wabaId)}/subscribed_apps`, { method: 'POST', headers: auth }, secrets);
  for (const syncType of ['smb_app_state_sync', 'history']) {
    await call(fetchImpl, `${base}/${encodeURIComponent(pn)}/smb_app_data`, { method: 'POST', headers: auth,
      body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: syncType }) }, secrets);
  }
  return { wabaId, phoneNumberId: pn };
}
