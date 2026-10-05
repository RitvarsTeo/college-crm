import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, pgUrl } from './db.js';
import { seed } from './seed.js';
import { hasRealData, loadReal } from './real.js';
import { PROVIDERS, runScenario, runOutbound, runFullDemo, listEvents, getEvent, consentFor, consentSummary, DEMO_SEQUENCE } from './simulator.js';
import { logEvent, applyEdit, readHistory, MANUAL, AUTOMATIC, EDITABLE_FIELDS, IMMUTABLE_FIELDS, FIELD_LABELS } from './history.js';
import { stampOpenDay, registerOpenDay, refilterOpen } from './intake.js';
import { queueLeadAnswers } from './leadanswers.js';
import * as gmailB from '../lib/gmail.js';
import * as notify from '../lib/notify.js';
import { receive, listInbound, qualify, archive, funnel, agedCount, handoffToSis, ownerFor, notifiedFor, handoverGap, canReach, surfaceAt, waitingFor, waitingByRole } from './intake.js';
import { readScreenshot, readKind, readBody, readPath, saveFeedback, listFeedback, getScreenshot, setHandled, BadScreenshot, helpOpened, helpCounts } from './feedback.js';
import { findMatches as matchPeople, duplicateCheck, isStrong as isStrongMatch } from './identity.js';
import { lifecycleOf, sisProgress, sisProgressByPerson, SIS_HOLDS_SQL } from './lifecycle.js';
import { firstLook } from './sisfirstlook.js';
import { redactSis, fetchWebStats, WEB_RANGES } from '../lib/sis.js';
import { applicationFunnel } from './applications.js';
import { sisLiveCheck } from './sischeck.js';
import { pbxLive } from '../lib/pbx.js';
import { adapt, adaptAll, toIntake, hasAdapter, adapterIds } from './adapters.js';
import { fixtureFor } from './fixtures.js';
import { buildPayload, scenariosFor, allScenarios, CHANNEL_LABELS, META_GROUP } from './scenarios.js';
import { report as buildReport, reportRows, boldRowsOf, periodOf, maturedConversion, EXPORT_SECTIONS, DEFAULT_SECTIONS } from './reports.js';
import { rowsToXlsx, XLSX_TYPE } from './xlsx.js';
import * as sheets from './sheets.js';
import * as snapshot from './snapshot.js';
import { buildDemo } from './demo.js';
import * as gate from './gate.js';
import * as callpop from './callpop.js';
import { moveCheck } from './stagemove.js';
import { receivePhoneEvent, PHONE_EVENT_SECRET_ENV } from './phoneevent.js';
import * as webpush from './webpush.js';
import { verifyRequest, channelDef, channelIds, integrationIds, integrationDef, allChannelStatus, BadInbound,
         parseInboundBody, handshake, CHANNELS } from './inbound.js';
import * as auth from './auth.js';
import * as google from './google.js';
import { signInFirst, withReturnScript } from './signinfirst.js';
import { bootstrapIfAuthOn } from './bootstrap.js';
import * as channeladmin from './channeladmin.js';
import { todayStart, tomorrowStart, localDate } from './bizday.js';
import { receiveSisApplication, mergeSisDuplicate, syncSis, channelMode, SIS_STAGE } from './sync.js';


const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Installed as a desktop app it is "Novikontas Intake", with the Academy symbol, in its own
// window. The installed window titles itself manifest.name + the page title, so a name here
// that disagrees with the product reads back as "Novikontas Academy CRM - Novikontas Intake".
// One name (the owner, 01.10.2026: the product is Intake). start_url and scope are the whole site, so the Google sign-in round trip leaves
// and comes back into the same window (a full-page redirect, no popup).
export const APP_MANIFEST = {
  id: '/',
  name: 'Novikontas Intake',
  short_name: 'Intake',
  description: 'Every first contact with Novikontas Academy, in one place.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',       // the splash behind the icon: white, like the icon tile (dev kit part 2)
  theme_color: '#000000',           // the installed window's title bar: black in every app (28.09.2026)
  icons: [
    { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/assets/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
const PORT = Number(process.env.PORT || 8800);
// A Secure cookie is never sent over plain http, so testing the door on
// localhost needs it off. Every real host serves https, so this stays unset
// there and the cookie is Secure.
const DEV_INSECURE_COOKIE = String(process.env.CRM_INSECURE_COOKIE || '') === '1';
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
// The Help center's tour and questions (dev kit part 3): one file the CRM keeps and grows.
const HELP = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'help.json'), 'utf8'));
const FIXTURES = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'inbound_fixtures.json'), 'utf8'));

// The prototype now keeps its database in a file. It used to live in memory, and
// a restart silently emptied it while the open browser tab carried on showing
// rows that no longer existed - every link in that stale page then failed.
const DB_FILE = process.env.CRM_DB || path.join(ROOT, 'data', 'crm.db');
// Only SQLite needs the folder. Under Postgres the name is not a path, and on Vercel
// the disk is read-only, so creating it would stop the boot.
if (DB_FILE !== ':memory:' && !pgUrl()) fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = await openDb(DB_FILE);

// ------------------------------------------------------------------ sign-in --
//
// CRM_AUTH=1 turns real sign-in on. It is off by default, which keeps the whole
// existing test suite - which sends x-acting-as - working unchanged, and keeps a
// local copy openable without seeding an account first.
//
// When it is ON, x-acting-as is IGNORED. Not preferred, not fallen back to:
// ignored. A header the browser sets is not an identity, and leaving it as a
// fallback would mean the login could simply be walked around.
const AUTH_ON = auth.authOn();
{
  const cfg = auth.requireConfigured();
  if (!cfg.ok) { console.error('REFUSING TO START. ' + cfg.why); process.exit(1); }
}

// Channel modes are stored so a switch survives a restart, and are loaded INTO
// process.env, which is where every existing reader already looks. No adapter and
// no inbound route had to change.
for (const row of await db.prepare('SELECT channel, mode FROM channel_mode').all()) {
  process.env['CHANNEL_MODE_' + String(row.channel).toUpperCase()] = row.mode;
}

/**
 * Who is making this request, proved. Returns null when sign-in is off, or when
 * the cookie is missing, forged, expired, or belongs to somebody who has since
 * been disabled or had their sessions invalidated.
 *
 * The ROLE is re-read from the database every request and never taken from the
 * cookie, so removing somebody's admin rights takes effect immediately instead of
 * when their cookie happens to expire. Lifted from the Talent Acquisition hub.
 */
async function currentUser(req) {
  if (!AUTH_ON) return null;
  // Once per request. actorOf, viewerOf, adminOf and the gate below all ask, and
  // each ask was a fresh SELECT against crm_users.
  if (req.__user !== undefined) return req.__user;
  req.__user = await resolveUser(req);
  return req.__user;
}

async function resolveUser(req) {
  const token = auth.readCookie(req.headers.cookie);
  const session = auth.readSession(token, process.env.CRM_SESSION_SECRET);
  if (!session) return null;
  const row = await db.prepare(`SELECT id, email, display_name, role, active, session_version
                          FROM crm_users WHERE email = ?`).get(session.email);
  if (!row || Number(row.active) !== 1) return null;
  if (Number(row.session_version) !== Number(session.sessionVersion)) return null;
  return { id: row.id, email: row.email, name: row.display_name || row.email, role: row.role };
}

// ------------------------------------------------------------ Google sign-in --
//
// Adapted from the merged sign-in kit, whose Google files are byte-identical to
// the Talent Acquisition hub's and have been signing people in since September
// 2026. See src/google.js for the verifier and the allowlist.
//
// THE RULE: an account is never created by signing in. A verified
// novikontas.org address with no crm_users row is refused. Without that,
// everybody in the Workspace becomes an Academy CRM user, and the applicants
// Ieva holds are in this database.

const FLOW_COOKIE = 'crm_oauth';
const FLOW_MINUTES = 10;
// apply.novikontas.org web stats, per range, for 15 minutes (the SIS builds them once a night).
const WEB_STATS_CACHE = new Map();

function signFlow(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function readFlow(token, secret) {
  if (typeof token !== 'string' || !token.includes('.') || !secret) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!(Number(parsed.exp) > Date.now())) return null;
    return parsed;
  } catch { return null; }
}

const flowCookie = (value, minutes) =>
  `${FLOW_COOKIE}=${encodeURIComponent(value)}; Path=/api/auth/google; HttpOnly`
  + `; SameSite=Lax${DEV_INSECURE_COOKIE ? '' : '; Secure'}; Max-Age=${minutes * 60}`;

// The period and sections of a report export, checked. A malformed date used to
// reach the period code and fail there.
const reportParams = (url) => {
  const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
  const known = new Set(EXPORT_SECTIONS.map((x) => x.id));
  return { from: day(url.searchParams.get('from')), to: day(url.searchParams.get('to')),
    sections: (url.searchParams.get('sections') || '').split(',').filter((x) => known.has(x)) };
};

// The end of a Google Sheets export (see /api/report.gsheet). Same code exchange and
// the same ID-token checks as signing in, and then one more: Google must answer for
// the person signed in to the CRM, or no sheet is made.
// ------------------------------------------------------ Gmail option B --
// The link an admin hands to whoever holds edu@'s password lasts this long.
const GMAIL_INVITE_HOURS = 48;

const originOf = (req) => `${req.headers['x-forwarded-proto']
  || (DEV_INSECURE_COOKIE || !process.env.VERCEL ? 'http' : 'https')}://${req.headers.host}`;

async function gmailStatus() {
  const b = Boolean(await gmailB.loadGmailRefreshToken(db, process.env));
  const a = gmailB.credentials(process.env).ok;
  const last = await db.prepare("SELECT value, ran_at, detail FROM sync_state WHERE name = 'gmail'").get();
  let lastRun = null;
  if (last) { try { lastRun = { at: last.ran_at, ...JSON.parse(last.detail || '{}') }; } catch { lastRun = { at: last.ran_at }; } }
  return { mailbox: gmailB.MAILBOX, connected: b, how: b ? 'B' : a ? 'A' : null, lastRun };
}

// One plain page for whoever connected edu@. They may have no Intake account, so it never
// sends them into the app.
function gmailPage(res, status, ok, line, heading) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Intake - Gmail</title><style>body{font:16px/1.5 Raleway,system-ui,sans-serif;background:#f5f7fa;color:#14213d;margin:0;display:grid;place-items:center;min-height:100vh}
main{background:#fff;border-radius:12px;padding:32px;max-width:420px;margin:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 8px;color:${heading ? '#14213d' : ok ? '#1b7f4b' : '#b3261e'}}p{margin:0}</style></head>
<body><main><h1>${heading || (ok ? 'Connected' : 'Not connected')}</h1><p>${line}</p></main></body></html>`;
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'set-cookie': flowCookie('', 0) });
  return res.end(html);
}

async function finishGmail(req, res, url, code) {
  const mailbox = gmailB.MAILBOX;
  if (url.searchParams.get('error') || !code) return gmailPage(res, 400, false, `Access was not given. Open the link again and press Allow.`);
  const got = await gmailB.exchangeCode({ env: process.env, code, redirectUri: process.env.GOOGLE_REDIRECT_URI });
  if (!got.ok) return gmailPage(res, 400, false, `Google did not finish: ${got.why}. Open the link again.`);
  if (got.mailbox !== mailbox) {
    return gmailPage(res, 400, false, `You signed in as ${got.mailbox || 'another account'}. Only ${mailbox} can be connected. Open the link again and choose ${mailbox}.`);
  }
  await gmailB.saveGmailRefreshToken(db, got.refreshToken, process.env);
  return gmailPage(res, 200, true, `${mailbox} is connected to Intake, read-only. You can close this page.`);
}

// The feedback email's one-time Allow (04.10.2026). Only the sending account is kept.
async function finishNotify(req, res, url, code) {
  if (url.searchParams.get('error') || !code) return gmailPage(res, 400, false, 'Access was not given. Open the link again and press Allow.');
  const got = await notify.exchangeCode({ env: process.env, code, redirectUri: process.env.GOOGLE_REDIRECT_URI });
  if (!got.ok) return gmailPage(res, 400, false, `Google did not finish: ${got.why}. Open the link again.`);
  if (got.mailbox !== notify.SENDER) {
    return gmailPage(res, 400, false, `You signed in as ${got.mailbox || 'another account'}. Open the link again and choose ${notify.SENDER}.`);
  }
  await notify.saveToken(db, got.refreshToken, process.env);
  return gmailPage(res, 200, true, `New feedback will be emailed to ${notify.SENDER}. You can close this page.`);
}

async function finishSheet(req, res, url, flow, code) {
  const back = (reason) => {
    res.writeHead(303, { location: `/?sheet=${encodeURIComponent(reason)}#/reports`, 'cache-control': 'no-store',
      'set-cookie': flowCookie('', 0) });
    return res.end();
  };
  if (url.searchParams.get('error') || !code) return back(sheets.SHEET_REASON.DECLINED);
  const me = await currentUser(req);
  if (!me || me.id !== flow.uid) return back(sheets.SHEET_REASON.WRONG_ACCOUNT);
  let tokens;
  try {
    const body = new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code' });
    const r = await fetch(google.tokenUrl(), { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    // not read on failure: it can echo the request, which carries the client secret
    if (!r.ok) return back(sheets.SHEET_REASON.FAILED);
    tokens = await r.json();
  } catch { return back(sheets.SHEET_REASON.FAILED); }
  const verified = await google.verifyIdToken(tokens.id_token, { clientId: process.env.GOOGLE_CLIENT_ID,
    nonce: flow.nonce, hostedDomain: google.HOSTED_DOMAIN, jwks: await google.getGoogleJwks() });
  if (!verified.ok || auth.canonicalEmail(verified.email) !== auth.canonicalEmail(me.email)) {
    return back(sheets.SHEET_REASON.WRONG_ACCOUNT);
  }
  if (!tokens.access_token || !String(tokens.scope || 'drive.file').includes('drive.file')) {
    return back(sheets.SHEET_REASON.NO_PERMISSION);
  }
  const rows = await reportRows(db, flow.want || {});
  const periodRow = rows.find((r) => r[0] === 'Period');
  const xlsx = rowsToXlsx(rows, { bold: boldRowsOf(rows), sheetName: 'Report', title: 'Intake report' });
  const up = await sheets.uploadAsSheet({ accessToken: tokens.access_token, xlsx,
    name: `Intake report ${periodRow ? periodRow[1] : ''} (made ${localDate()})`.replace(/\s+/g, ' ').trim() });
  if (!up.ok) return back(up.reason);
  res.writeHead(303, { location: up.link, 'cache-control': 'no-store', 'set-cookie': flowCookie('', 0) });
  return res.end();
}

/** Never blocks a sign-in decision. A bounded code and an email, nothing else. */
async function logAttempt(email, method, outcome) {
  try {
    await db.prepare('INSERT INTO crm_login_attempt (at, email, method, outcome) VALUES (?,?,?,?)')
      .run(nowIso(), email || null, method, outcome);
  } catch { /* the audit write is not worth failing a sign-in over */ }
}

/**
 * The only API paths that work before somebody has signed in.
 *
 * Everything a provider calls stays open: a webhook proves itself with a
 * signature or a shared secret, and a cron route with CRON_SECRET, both of which
 * are stronger than a browser session and neither of which has one.
 */
function openBeforeSignIn(pathname) {
  if (pathname.startsWith('/api/auth/')) return true;        // you need it to sign in
  if (pathname.startsWith('/api/cron/')) return true;        // CRON_SECRET is its auth
  // A REAL CHANNEL only. Never a prefix match - see the comment at the door.
  const inbound = /^\/api\/inbound\/([a-z_]+)$/.exec(pathname);
  if (inbound && channelDef(inbound[1])) return true;
  if (pathname === '/api/intake/application') return true;   // its own secret header is its auth
  if (pathname === '/api/inbound/phone-event') return true;   // PHONE_EVENT_SECRET is its auth (Q6)
  return false;
}

// Guessing at a password should cost something. Per email, in memory, and it is
// deliberately not per IP as well: everybody here shares one office address.
const LOGIN_TRIES = new Map();
const LOGIN_MAX = 8;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
function loginBlocked(email) {
  const rec = LOGIN_TRIES.get(email);
  if (!rec) return false;
  if (Date.now() > rec.until) { LOGIN_TRIES.delete(email); return false; }
  return rec.n >= LOGIN_MAX;
}
function loginFailed(email) {
  const rec = LOGIN_TRIES.get(email);
  if (!rec || Date.now() > rec.until) LOGIN_TRIES.set(email, { n: 1, until: Date.now() + LOGIN_WINDOW_MS });
  else rec.n += 1;
}

// REAL or DEMO, and it is never guessed. The mode is written next to the database
// and read back, so the Console can say which one is on screen without inferring
// it from what happens to be in the tables.
const MODE_FILE = DB_FILE === ':memory:' ? null : DB_FILE + '.mode';
let MODE = 'empty';
try { if (MODE_FILE && fs.existsSync(MODE_FILE)) MODE = fs.readFileSync(MODE_FILE, 'utf8').trim(); } catch {}
function setMode(m) {
  MODE = m;
  try { if (MODE_FILE) fs.writeFileSync(MODE_FILE, m); } catch {}
}
const modeState = async () => ({
  mode: MODE,
  isReal: MODE === 'real',
  isDemo: MODE === 'demo',
  people: (await db.prepare('SELECT COUNT(*) n FROM people').get()).n,
  snapshot: snapshot.info(),
});
let DATASET = { dataset: 'empty', people: 0, selection: 'an empty table' };


async function clearAll() {
  await db.exec(`DELETE FROM events; DELETE FROM tasks; DELETE FROM documents;
           DELETE FROM registrations; DELETE FROM open_days; DELETE FROM consents;
           DELETE FROM sim_events; DELETE FROM field_values; DELETE FROM inbound;
           DELETE FROM people;`);
}

// empty | real | synthetic. Pressed as often as the demo needs.
const DATASETS = ['empty', 'demo', 'synthetic', 'real'];

async function loadDataset(kind) {
  // VALIDATED BEFORE ANYTHING IS CLEARED.
  //
  // clearAll() used to be the first line, so a name this function did not
  // recognise emptied every table and only then fell through to "empty" and
  // answered ok. POST /api/dataset hands it whatever the caller typed, which
  // made a typo a silent way to wipe the database.
  const want = kind == null || kind === '' ? 'empty' : String(kind);
  if (!DATASETS.includes(want)) {
    throw new Error('unknown dataset "' + want + '". Use ' + DATASETS.join(', ') + '.');
  }
  await clearAll();
  kind = want;
  if (kind === 'real') {
    // Belt and braces: the boot check above catches the flag, this catches every
    // other route into the loader, including the Console.
    if (gate.isPublic()) throw new Error('this is a shared copy: demo data only');
    if (!hasRealData()) throw new Error('data/real_people.json is missing');
    DATASET = await loadReal(db, CONFIG.realData);
    setMode('real');
    // The clean snapshot is written HERE, straight after loading from the source
    // file, and never later. Once somebody has been testing in demo mode the live
    // tables are no longer evidence of what the real data looked like.
    await snapshot.write(db, { source: DATASET.source || 'data/real_people.json',
      selection: DATASET.selection || null });
  } else if (kind === 'synthetic') {
    DATASET = { dataset: 'synthetic', ...(await seed(db)), selection: 'invented records shaped by the real proportions' };
  } else if (kind === 'demo') {
    // THIS BRANCH WAS MISSING, and 'demo' is a first-class dataset everywhere
    // else: .env.example lists it, the Console offers it, and the boot path
    // builds it for a fresh shared copy. Here it fell through to the `else` and
    // produced an EMPTY database while answering ok - a silent wrong result.
    // It also made one channels test assert that a demo build is not mistaken
    // for a real connection while there was no demo build to mistake.
    const info = await buildDemo(db, CONFIG);
    setMode('demo');
    DATASET = { dataset: 'demo', people: info.total,
      selection: 'the built-in demo, created through the real inbound path' };
  } else if (kind === 'empty' || kind == null || kind === '') {
    DATASET = { dataset: 'empty', people: 0, selection: 'an empty table, until a channel writes something into it' };
  } else {
    // Unreachable: the name is checked against DATASETS above, before anything
    // is cleared. Kept so that adding a name to that list without adding a
    // branch for it fails loudly instead of quietly emptying the database.
    throw new Error('dataset "' + kind + '" is listed but has no branch.');
  }
  return DATASET;
}

// Boot, and the reason this is not simply await loadDataset(...).
//
// loadDataset clears every table first. That cost nothing while the database
// lived in memory, because a fresh process started empty anyway. Now that it is
// a FILE, running it at boot destroyed everything a tester had entered, on every
// restart - the exact fault the file was meant to fix. So: an existing database
// is left alone, and the configured starting dataset is only applied to a new
// and empty one. DATASET=... still forces a load, which is what the tests use.
const PUBLIC = gate.isPublic();
{
  // A copy on the internet with no door is worse than no copy at all, so this
  // refuses to start rather than starting open.
  const ready = gate.requireConfigured();
  if (!ready.ok) { console.error('REFUSING TO START: ' + ready.why); process.exit(1); }
}

{
  const forced = process.env.DATASET;
  // DEMO DATA ONLY on a shared copy. There is no real sign-in yet, so anybody
  // with the address is anybody they type. Refusing here is the control that
  // makes the address safe to hand out.
  if (PUBLIC && forced === 'real') {
    console.error('REFUSING TO START: DATASET=real with CRM_PUBLIC on. This copy has a shared '
      + 'password, not sign-in, so it may hold demo data only.');
    process.exit(1);
  }
  const kept = (await db.prepare('SELECT COUNT(*) n FROM people').get()).n;
  if (forced) {
    // A typo in DATASET used to empty the database and start anyway. Now it is a
    // refusal, and it names what the valid values are.
    try { await loadDataset(forced); }
    catch (err) { console.error('REFUSING TO START: ' + err.message); process.exit(1); }
  } else if (PUBLIC && !kept) {
    // First boot on a fresh host: give the testers something to look at.
    //
    // ONCE, not once per instance. On Vercel several instances can boot at the same
    // moment against one empty database, and each used to see it empty and build the
    // demo - the first deploy held it three times over. Under Postgres a transaction
    // lock makes the others wait, and they look again before building anything.
    const info = await db.transaction(async (tx) => {
      if (tx.kind === 'pg') await tx.query('SELECT pg_advisory_xact_lock(7240001)');
      const again = (await tx.prepare('SELECT COUNT(*) n FROM people').get()).n;
      return again ? { total: again, kept: true } : buildDemo(tx, CONFIG);
    });
    DATASET = info.kept
      ? { dataset: 'kept', people: info.total, selection: 'another instance built the demo first' }
      : { dataset: 'demo', people: info.total,
          selection: 'the built-in demo, created through the real inbound path' };
  } else if (kept) {
    DATASET = { dataset: 'kept', people: kept,
      selection: 'what was in the database when the server last stopped' };
  } else {
    await loadDataset(CONFIG.startWith || 'empty');
  }
}
// THE ACCOUNTS, AFTER THE DATA AND BEFORE THE DOOR OPENS.
//
// The order matters and it is: database exists -> demo data -> accounts ->
// listen. On Render the database is /tmp and is recreated on every restart, so
// this is the only thing standing between CRM_AUTH=1 and a login screen in
// front of an empty crm_users table.
//
// With sign-in off it does nothing, which is what keeps a laptop working with
// none of these variables set.
{
  const r = await bootstrapIfAuthOn(db, { accounts: CONFIG.accounts, env: process.env, authOn: AUTH_ON });
  if (!r.ok) { console.error(String.fromCharCode(10) + 'REFUSING TO START. ' + r.why); process.exit(1); }
  // Not a refusal: the copy may provision its accounts some other way. But a
  // login screen nobody can pass looks healthy from outside, so it is said out loud.
  if (r.warn) console.error(String.fromCharCode(10) + 'WARNING: ' + r.warn + String.fromCharCode(10));
  // Addresses and counts only. Never a password, never a hash, never a variable value.
  if (r.ran) {
    console.log(`accounts: ${r.created.length} created, ${r.kept.length} already there`
      + (r.created.length ? ` | new: ${r.created.join(', ')}` : ''));
  }
}

console.log(`prototype started ${DATASET.dataset.toUpperCase()}: ${DATASET.people} people`
  + (hasRealData() ? ' | real data available on demand' : ' | no real data file'));

const json = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const body = (req, maxBytes = 512 * 1024) => new Promise((resolve, reject) => {
  let b = '', n = 0;
  req.on('data', (c) => {
    n += c.length;
    if (n > maxBytes) { reject(new BadScreenshot('That message is too big to send.')); req.destroy(); return; }
    b += c;
  });
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new BadScreenshot('That message could not be read.')); } });
  req.on('error', reject);
});
const nowIso = () => new Date().toISOString();
// Signatures are computed over the EXACT bytes a provider sent, so the body has
// to be read as text before anything parses it.
const rawText = (req, maxBytes = 512 * 1024) => new Promise((resolve, reject) => {
  let b = '', n = 0;
  req.on('data', (c) => {
    n += c.length;
    if (n > maxBytes) { reject(new BadScreenshot('that payload is too big')); req.destroy(); return; }
    b += c;
  });
  req.on('end', () => resolve(b));
  req.on('error', reject);
});

// Every delivery attempt, accepted or not. Memory only, and deliberately small:
// this is a diagnostic tail, not an audit log, and it holds no payload and no
// secret.
const INBOUND_LOG = [];
function recordInbound(channel, externalId, outcome, how) {
  INBOUND_LOG.push({ at: nowIso(), channel, externalId, outcome, verified: how });
  if (INBOUND_LOG.length > 500) INBOUND_LOG.splice(0, INBOUND_LOG.length - 500);
}

// Today is a RIGA day (src/bizday.js). It was the UTC day, so for three hours every
// night a task due yesterday counted as due today and was not overdue.
const dayStart = () => todayStart();
const dayEnd = () => tomorrowStart();
const newId = () => 'p' + Math.random().toString(36).slice(2, 7);

// There is no login in the prototype. The caller says who it is, the server
// records that, and nothing is enforced - see /api/whoami for the honest wording.
//
// A ROLE is not a PERSON. `owner` on a record is a role (Admissions). `actor` on
// a history entry is a person (Ieva). Locked 23.09.2026.
const ADMINS = CONFIG.admins || [];
const USERS = CONFIG.users || [];
const USER_NAMES = USERS.map((u) => u.name);
const isAdmin = (who) => ADMINS.includes(String(who || ''));
// Reading the feedback inbox is NOT the same as being an admin, and is not
// derived from it. Marina is an admin and must not see it, so this is its own
// list. Without a login it can only check the name that was selected.
const FEEDBACK_READERS = CONFIG.feedbackReaders || [];
// The whole history, without being an admin (04.10.2026: Admissions needs the full picture).
const HISTORY_READERS = CONFIG.historyReaders || [];
const readsAllHistory = (who) => isAdmin(who) || HISTORY_READERS.includes(String(who || ''));
const canReadFeedback = (who) => FEEDBACK_READERS.includes(String(who || ''));
const isKnownPerson = (who) => USER_NAMES.includes(String(who || '')) || isAdmin(who);
const roleOf = (who) => (USERS.find((u) => u.name === who) || {}).role || null;
// 'unknown user' rather than a quiet default: an entry nobody can be traced to
// should look wrong on the screen, not look like Ieva did it.
// When sign-in is on, a signed session is the ONLY answer. The header and the
// ?as= query string are not consulted at all, so a history entry saying "Ieva"
// means Ieva proved she was Ieva.
const actorOf = async (req, b) => {
  const me = await currentUser(req);
  if (me) return me.name;
  if (AUTH_ON) return 'unknown user';
  return String((b && b.by) || req.headers['x-acting-as'] || 'unknown user');
};
const viewerOf = async (req, url) => {
  const me = await currentUser(req);
  if (me) return me.name;
  if (AUTH_ON) return '';
  return String(url.searchParams.get('as') || req.headers['x-acting-as'] || '');
};

// The admin boundary for the Channels panel.
//
// With sign-in ON this is a real check: a role read from the database this
// request. With sign-in OFF it falls back to the old name list, which is the
// existing, weak, self-declared model - unchanged, and not made to look stronger
// than it is. The panel says which of the two is in force.
async function adminOf(req) {
  const me = await currentUser(req);
  if (me) return auth.canSeeChannels(me.role) ? me : null;
  if (AUTH_ON) return null;
  const who = String(req.headers['x-acting-as'] || '');
  return isAdmin(who) ? { id: null, email: null, name: who, role: 'admin' } : null;
}
const refuseNotAdmin = (res) => json(res, 403, {
  error: 'Channels is for admins only.',
  how: AUTH_ON ? 'Sign in with an admin account.' : 'Select an admin in "Acting as".' });

// Decision 2, locked 23.09.2026. Two different things live on a person's timeline:
//   - the person's own activity: calls, notes, messages, visits, status moves.
//     Everybody who may open the record sees this. Hiding it would make a
//     colleague call the same applicant twice.
//   - an internal correction: "Programme NAV -> ENG, by Laura". This is audit,
//     and a normal user sees only their own. Admins see all of them.
function visibleTimeline(rows, viewer) {
  if (readsAllHistory(viewer)) return rows;
  return rows.filter((e) => e.kind !== 'edit' || e.actor === viewer);
}
const ACTIVITY = [];

// FINISHED MEANS FINISHED (Admissions, 30.09.2026: IEVA-3, IEVA-4, IEVA-5).
//
// Admitted and Not proceeding are the two ends of the journey. A person who has reached one of
// them is done, and the CRM must stop asking for a next step. It was not doing that: /api/summary
// counted a finished person OUT of openPeople and noNextAction and IN to overdue and today, in
// the same response, so an Admitted person kept nagging Ieva in Next Steps.
//
// One name for the rule, used everywhere, because the bug was two copies of the same sentence
// drifting apart.
const FINISHED = ['Admitted', 'Not proceeding'];
const STILL_OPEN_SQL = `pe.status NOT IN ('${FINISHED.join("','")}')`;
const isFinished = (status) => FINISHED.includes(status);

/**
 * Close whatever is still open on a person who has just finished, and say so in their history.
 *
 * This is what Ieva asked for in IEVA-5: when the last admission step is done, the CRM marks the
 * outcome and nothing more. Without it the leftover task lives on for ever, because the only other
 * way a task closes is somebody pressing Done on that exact task.
 */
async function finishOpenTasks(personId, at, why) {
  const open = await db.prepare('SELECT id, label FROM tasks WHERE person_id = ? AND done_at IS NULL').all(personId);
  if (!open.length) return 0;
  await db.prepare("UPDATE tasks SET done_at = ?, outcome = 'Closed: the person is finished' WHERE person_id = ? AND done_at IS NULL")
    .run(at, personId);
  await logEvent(db, { personId, kind: 'task', channel: 'phone', direction: 'note', at,
    origin: AUTOMATIC, actor: null,
    subject: `${open.length === 1 ? 'Open step closed' : open.length + ' open steps closed'}: ${why}`,
    body: open.map((t) => t.label).join(', ') });
  return open.length;
}

// The status follows the events. A completed step moves the person to the stage
// that step belongs to, forwards only, and the move is recorded like any other
// event so nothing changes silently.
const STAGE_ORDER = () => CONFIG.stageOrder || ['New', 'Contacted', 'Follow-up', 'Application', 'Contract', 'Admitted'];
function stageOf(label) {
  for (const g of (CONFIG.nextActions || [])) {
    for (const i of g.items) if (i.label === label) return i.advancesTo || null;
  }
  return null;
}
async function advanceStatus(personId, actionLabel, now) {
  if (!CONFIG.statusFollowsEvents) return null;
  const target = stageOf(actionLabel);
  if (!target) return null;
  const person = await db.prepare('SELECT status FROM people WHERE id = ?').get(personId);
  if (!person) return null;
  const order = STAGE_ORDER();
  const from = order.indexOf(person.status);
  const to = order.indexOf(target);
  // never move backwards, and never touch a person somebody has closed
  if (person.status === 'Not proceeding' || to < 0 || (from >= 0 && to <= from)) return null;
  await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(target, personId);
  // The same rule when the stage moves by itself: a step that finishes somebody closes the rest.
  if (isFinished(target)) await finishOpenTasks(personId, now, `the person is ${target}`);
  if (target === 'Admitted') {
    await db.prepare("UPDATE people SET admitted_at = COALESCE(admitted_at, ?) WHERE id = ?").run(now, personId);
  }
  if (target === 'Contract') {
    await db.prepare("UPDATE people SET contract_at = COALESCE(contract_at, ?) WHERE id = ?").run(now, personId);
  }
  await logEvent(db, { personId, kind: 'status', direction: 'note', at: now, origin: AUTOMATIC, actor: 'Intake',
    subject: `Status: ${person.status} -> ${target}`,
    body: `automatically, because this was done: ${actionLabel}`,
    field: 'status', oldValue: person.status, newValue: target });
  return { from: person.status, to: target };
}

// One matcher, used by the live check in the form AND by the save that refuses.
// Two different rules would mean the warning and the block could disagree.
// One matcher, in src/identity.js, used by every path that can create a person.
// It used to live here, which meant only the manual Add person screen ever asked
// the question.
const findMatches = async (contact) => await matchPeople(db, contact);

// A real, minimal PDF. Not a library, and not a text file with a .pdf name.
function simplePdf(title, lines) {
  const esc = (t) => String(t).replace(/([\\()])/g, '\\$1').replace(/[^\x20-\x7e]/g, '?');
  const page = [];
  page.push('BT /F1 14 Tf 50 790 Td (' + esc(title) + ') Tj ET');
  let y = 764;
  for (const l of lines.slice(0, 60)) {
    page.push('BT /F1 9 Tf 50 ' + y + ' Td (' + esc(l) + ') Tj ET');
    y -= 12;
  }
  const content = page.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n'
    + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return Buffer.from(pdf, 'binary');
}

function channelLabel(id) {
  return (CONFIG.channels && CONFIG.channels[id])
    || (CONFIG.channelAliases && CONFIG.channelAliases[id]) || id || 'unknown';
}

async function personRow(id, viewer) {
  const p = await db.prepare('SELECT * FROM people WHERE id = ?').get(id);
  if (!p) return null;
  const all = await db.prepare('SELECT * FROM events WHERE person_id = ? ORDER BY occurred_at DESC, id DESC').all(id);
  p.timeline = visibleTimeline(all, viewer);
  p.hiddenCorrections = all.length - p.timeline.length;
  p.viewer = viewer || null;
  p.viewerIsAdmin = isAdmin(viewer);
  p.tasks = await db.prepare('SELECT * FROM tasks WHERE person_id = ? ORDER BY due_at ASC').all(id);
  p.documents = await db.prepare('SELECT * FROM documents WHERE person_id = ?').all(id);
  p.registrations = await db.prepare(`SELECT r.*, o.title, o.held_on FROM registrations r JOIN open_days o ON o.id = r.open_day_id WHERE r.person_id = ?`).all(id);
  p.consents = await consentFor(db, id);
  p.lifecycle = await lifecycleOf(db, id);   // dated facts from the SIS; never a stage
  try { p.sis = sisProgress(await db.prepare('SELECT status, changed_at FROM sis_applicants WHERE person_id = ?').all(id)); }
  catch { p.sis = null; }                    // a database without the SIS tables yet
  // structured fields with where they came from. A suggestion is never a fact.
  p.fields = await db.prepare('SELECT * FROM field_values WHERE person_id = ? ORDER BY id').all(id);
  const known = new Set(p.fields.filter((f) => f.value).map((f) => f.field));
  p.missingInfo = (CONFIG.qualification.completionFields || []).filter((f) => !known.has(f));
  p.routedTo = ownerFor(p.qualification || 'raw');
  p.handoverGap = p.qualification === 'hot'
    ? await handoverGap({ role: p.routedTo, channel: p.first_channel || p.source_channel,
      email: p.email, phone: p.phone })
    : null;
  p.simEvents = await db.prepare('SELECT id, at, channel, scenario, direction, decision, status FROM sim_events WHERE person_id = ? ORDER BY id DESC').all(id);
  return p;
}

// The newest check per channel, as one query rather than fourteen.
async function latestChecks() {
  const rows = await db.prepare(`SELECT c.channel, c.at, c.ok, c.kind, c.detail, c.by FROM channel_check c
     JOIN (SELECT channel, MAX(id) id FROM channel_check GROUP BY channel) m ON m.id = c.id`).all();
  return Object.fromEntries(rows.map((r) => [r.channel, r]));
}

// When a PROVIDER last verified the URL against us. This is the only evidence
// that makes a channel CONNECTED, so it is read from the table the inbound GET
// route writes - never from anything our own check does.
async function handshakeRows() {
  const rows = await db.prepare('SELECT channel, verified_at, how FROM channel_handshake').all();
  return Object.fromEntries(rows.map((r) => [r.channel, r]));
}

// What the two scheduled jobs last did. sync_state keeps one row per job: when it
// ran and a small JSON of what it found. Never a secret and never a URL, so it can
// go to the screen as it is. The phone job is stored under its old name 'pbx';
// the screen keys everything by channel id, so it is mapped here and not there.
async function syncRuns() {
  const out = {};
  for (const r of await db.prepare('SELECT name, ran_at, detail FROM sync_state').all()) {
    let detail = null;
    try { detail = JSON.parse(r.detail || 'null'); } catch { detail = null; }
    out[r.name === 'pbx' ? 'phone' : r.name] = { at: r.ran_at, detail };
  }
  return out;
}
// An integration has no adapter and no provider handshake, so it can never earn
// CONNECTED: the only thing its state can say is whether its settings are there.
// What it actually brought in is the run record, which is the honest evidence.
function integrationStatuses(env = process.env) {
  return integrationIds().map((id) => {
    const def = integrationDef(id);
    const settings = (def.secretEnv ? [def.secretEnv] : []).map((name) => ({ name, present: Boolean(env[name]) }));
    const missing = settings.filter((x) => !x.present).map((x) => x.name);
    const mode = String(env['CHANNEL_MODE_' + id.toUpperCase()] || 'off').toLowerCase();
    return {
      channel: id, label: def.label, mechanism: def.mechanism, direction: def.direction,
      state: missing.length ? 'NOT CONFIGURED' : 'CONFIGURED',
      live: mode === 'test' || mode === 'live', mode,
      endpoint: null, settings, missingSettings: missing, allSettingsPresent: missing.length === 0,
      providerHandshakeAt: null, lastEventAt: null, events: 0, canTest: false, isIntegration: true,
      // An integration is owned by somebody too. config/channels.json names Ritvars for
      // SIS and says what he has to do; the channel path has always passed these three
      // and this one did not, so the Channels screen filed SIS under "nobody named".
      ownerPerson: def.ownerPerson || null,
      ownerAction: def.ownerAction || null,
      externalBlocker: def.externalBlocker || null,
    };
  });
}
async function channelCounts() {
  const out = {};
  // ONLY rows a real provider posted. The demo builder and the simulator write
  // through this same table deliberately, so counting everything here would make
  // every channel on the demo copy read as CONNECTED.
  // `filtered` (Q27, 05.10.2026): how many of them a rule set aside, for the Channels figures.
  for (const r of await db.prepare(`SELECT channel, COUNT(*) n, MAX(received_at) last,
                              SUM(CASE WHEN state = 'filtered' THEN 1 ELSE 0 END) f FROM inbound
                              WHERE source = 'provider' GROUP BY channel`).all()) {
    out[r.channel] = { events: Number(r.n), lastEventAt: r.last, lastSuccessAt: r.last, filtered: Number(r.f || 0) };
  }
  return out;
}

async function openTask(id) {
  return await db.prepare('SELECT * FROM tasks WHERE person_id = ? AND done_at IS NULL ORDER BY due_at ASC').get(id);
}

export const handle = async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
    // ------------------------------------------------------------- the door --
    // On a shared copy every page is behind one password. This is not sign-in:
    // inside, identity is still a dropdown. See src/gate.js.
    if (PUBLIC) {
      if (req.method === 'POST' && p === '/access') {
        const raw = await rawText(req, 4096);
        const given = new URLSearchParams(raw).get('password') || '';
        if (!gate.passwordMatches(given, process.env.CRM_ACCESS_PASSWORD)) {
          // Deliberately slow, so guessing costs something.
          await new Promise((r) => setTimeout(r, 400));
          res.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          return res.end(gate.LOGIN_PAGE('That password is not right.'));
        }
        const ticket = gate.mint(process.env.CRM_ACCESS_PASSWORD);
        res.writeHead(303, { location: '/', 'cache-control': 'no-store',
          'set-cookie': gate.cookieHeader(ticket, { secure: !DEV_INSECURE_COOKIE }) });
        return res.end();
      }

      if (!gate.allows(p)) {
        const ticket = gate.readCookie(req.headers.cookie);
        const check = gate.verifyTicket(ticket, process.env.CRM_ACCESS_PASSWORD);
        if (!check.ok) {
          // An API call gets JSON so the screen can react; a page gets the door.
          if (p.startsWith('/api/')) return json(res, 401, { error: 'not signed in', how: 'open / and enter the password' });
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          return res.end(gate.LOGIN_PAGE());
        }
      }
    }

    // ---------------------------------------------- the sign-in door, over the API --
    //
    // WITHOUT THIS THE LOGIN IS DECORATIVE. The screen refuses to draw the CRM
    // for somebody not signed in, but the screen is not the boundary: with
    // CRM_AUTH on and no session at all, GET /api/people answered 200 with the
    // rows in it, and /api/whoami reported the caller as "Ieva" because the route
    // fell back to the first name in the config when nobody was identified.
    //
    // Same shape as gate.allows() in src/gate.js, and deliberately so - including
    // the trap that file records: a PREFIX match on /api/inbound/ also opens
    // /api/inbound/events, which is the observability view and carries sender
    // names and message bodies. Only a path that names a REAL CHANNEL is open.
    if (AUTH_ON && p.startsWith('/api/') && !openBeforeSignIn(p) && !(await currentUser(req))) {
      // A browser TAB (a shared link, a download) goes to the screen that holds it,
      // which shows the sign-in card; code still gets the 401. src/signinfirst.js.
      const back = signInFirst(req, p);
      if (back) { res.writeHead(302, { location: back, 'cache-control': 'no-store' }); return res.end(); }
      return json(res, 401, { error: 'not signed in', how: 'Open / and sign in.' });
    }

    if (req.method === 'GET' && p === '/healthz') {
      return json(res, 200, { ok: true, people: (await db.prepare('SELECT COUNT(*) n FROM people').get()).n });
    }

    // ------------------------------------------------------------- sign-in --
    //
    // Three routes and nothing else. No registration, no password reset by email,
    // no "remember me": an account is created by scripts/manage_users.mjs, by
    // somebody with access to the server.

    if (req.method === 'GET' && p === '/api/auth/me') {
      const me = await currentUser(req);
      const g = google.googleConfigured(process.env);
      return json(res, 200, {
        auth: AUTH_ON,
        user: me ? { name: me.name, email: me.email, role: me.role } : null,
        // Whether the BUTTON should exist at all. A button in front of a flow
        // that is not configured fails on Google's own error page, before any
        // code here runs, so nothing on our side could ever explain it.
        google: AUTH_ON && g.ok,
        googleMissing: g.ok ? [] : g.missing,      // NAMES only, never values
        googleDomain: google.HOSTED_DOMAIN,
        // The panel prints this rather than assuming. With sign-in off, "admin"
        // is a name in a dropdown and the screen has to say so.
        identityIsProved: AUTH_ON,
        honesty: !AUTH_ON
          ? 'Sign-in is OFF on this copy. Who you are is a setting, not a check. Set CRM_AUTH=1 and CRM_SESSION_SECRET to turn it on.'
          : me
          ? 'You are signed in. Who you are is proved by a signed session cookie, and the role is re-read from the database on every request.'
          : 'Sign-in is on. Nobody is signed in on this browser.',
      });
    }

    // GOOGLE SIGN-IN ONLY (Aigars, 28.09.2026). A password is no longer a way in: this
    // route refuses every request, right or wrong, and never sets a cookie. The accounts
    // in crm_users and their roles are unchanged; Google proves who somebody is and
    // crm_users still decides what they may do.
    if (req.method === 'POST' && p === '/api/auth/login') {
      return json(res, 410, { error: 'Password sign-in is switched off. Use Continue with Google.' });
    }

    // GET /api/auth/google/start - begin the authorization code flow.
    //
    // Mints a state and a nonce into a short-lived signed cookie. Both come back
    // in the callback and both are checked there: state proves the callback
    // belongs to a flow THIS browser started, nonce ties the ID token to it.
    if (req.method === 'GET' && p === '/api/auth/google/start') {
      if (!AUTH_ON) return json(res, 400, { error: 'Sign-in is not switched on for this copy.' });
      const cfg = google.googleConfigured(process.env);
      if (!cfg.ok) {
        // NAMES only. Never a value, and never a pretence that it works.
        return json(res, 503, { error: 'google_not_configured',
          message: 'Google sign-in is not configured on this copy.',
          missing: cfg.missing });
      }
      const state = crypto.randomBytes(24).toString('base64url');
      const nonce = crypto.randomBytes(24).toString('base64url');
      const flow = signFlow({ state, nonce, exp: Date.now() + FLOW_MINUTES * 60 * 1000 },
        process.env.CRM_SESSION_SECRET);

      const to = new URL(google.GOOGLE_AUTH_URL);
      to.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
      to.searchParams.set('redirect_uri', process.env.GOOGLE_REDIRECT_URI);
      to.searchParams.set('response_type', 'code');
      to.searchParams.set('scope', 'openid email profile');
      to.searchParams.set('state', state);
      to.searchParams.set('nonce', nonce);
      // A HINT only: it filters the account chooser to the Workspace. A user can
      // edit it out of the URL. The check that matters is hd on the VERIFIED
      // token, in the callback below.
      to.searchParams.set('hd', google.HOSTED_DOMAIN);
      to.searchParams.set('prompt', 'select_account');

      res.writeHead(302, { location: to.toString(), 'cache-control': 'no-store',
        'set-cookie': flowCookie(flow, FLOW_MINUTES) });
      return res.end();
    }

    // GET /api/auth/gmail/connect?invite=... - Gmail option B, opened by whoever holds edu@'s
    // password. The invite is signed by an admin's /api/admin/gmail/link and expires; it is the
    // only thing that opens this door, and the callback still keeps ONLY edu@.
    if (req.method === 'GET' && p === '/api/auth/gmail/connect') {
      const invite = readFlow(url.searchParams.get('invite'), process.env.CRM_SESSION_SECRET);
      if (!invite || invite.purpose !== 'gmail-invite') {
        return gmailPage(res, 403, false, 'This link has expired or is not valid. Ask for a new one.');
      }
      const state = crypto.randomBytes(24).toString('base64url');
      const flow = signFlow({ state, purpose: 'gmail', exp: Date.now() + FLOW_MINUTES * 60 * 1000 },
        process.env.CRM_SESSION_SECRET);
      const to = gmailB.consentUrl({ env: process.env, state, redirectUri: process.env.GOOGLE_REDIRECT_URI });
      if (!to || !process.env.GOOGLE_REDIRECT_URI) return gmailPage(res, 503, false, 'Gmail cannot be connected on this copy yet.');
      res.writeHead(302, { location: to, 'cache-control': 'no-store', 'set-cookie': flowCookie(flow, FLOW_MINUTES) });
      return res.end();
    }

    // GET /api/auth/google/callback - finish it.
    //
    // Every refusal sends the SAME sentence to the same place. The reason is
    // recorded as a bounded code so an administrator can tell them apart; the
    // person refused learns only that they are not authorised.
    if (req.method === 'GET' && p === '/api/auth/google/callback') {
      const refuse = () => {
        res.writeHead(303, { location: '/?error=not_authorised', 'cache-control': 'no-store',
          'set-cookie': flowCookie('', 0) });
        return res.end();
      };
      // Gmail option B rides this same registered address. It is decided by the signed flow cookie
      // that /api/auth/gmail/connect set, before anything about staff sign-in, because the person
      // connecting edu@ needs no Intake account.
      {
        const gf = readFlow(auth.readCookie(req.headers.cookie, FLOW_COOKIE), process.env.CRM_SESSION_SECRET);
        const gs = url.searchParams.get('state');
        if (gf && gf.purpose === 'gmail' && gs && gs === gf.state) return finishGmail(req, res, url, url.searchParams.get('code'));
        if (gf && gf.purpose === 'notify' && gs && gs === gf.state) return finishNotify(req, res, url, url.searchParams.get('code'));
      }
      if (!AUTH_ON) return json(res, 400, { error: 'Sign-in is not switched on for this copy.' });
      const cfg = google.googleConfigured(process.env);
      if (!cfg.ok) return json(res, 503, { error: 'google_not_configured', missing: cfg.missing });

      const flow = readFlow(auth.readCookie(req.headers.cookie, FLOW_COOKIE),
        process.env.CRM_SESSION_SECRET);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (flow && flow.purpose === 'sheet' && state && state === flow.state) {
        return finishSheet(req, res, url, flow, code);
      }
      if (!flow || !state || state !== flow.state || !code) {
        await logAttempt(null, 'google', google.REASON.TOKEN);
        return refuse();
      }

      let tokens;
      try {
        const body = new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: process.env.GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code',
        });
        const r = await fetch(google.tokenUrl(), { method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
        // The body is deliberately NOT read on failure: it can echo the request,
        // and the request carries the client secret.
        if (!r.ok) throw new Error('token endpoint ' + r.status);
        tokens = await r.json();
      } catch {
        await logAttempt(null, 'google', google.REASON.TOKEN);
        return refuse();
      }

      const verified = await google.verifyIdToken(tokens.id_token, {
        clientId: process.env.GOOGLE_CLIENT_ID,
        nonce: flow.nonce,
        hostedDomain: google.HOSTED_DOMAIN,
        jwks: await google.getGoogleJwks(),
      });
      if (!verified.ok) {
        await logAttempt(null, 'google', google.VERIFIER_REASON[verified.reason] || google.REASON.TOKEN);
        return refuse();
      }

      // Normalised the same way every other path normalises it, so a case
      // variant resolves to the one existing account rather than missing it.
      const email = auth.canonicalEmail(verified.email);
      const row = await db.prepare(`SELECT id, email, display_name, role, active, session_version
                              FROM crm_users WHERE email = ?`).get(email);

      // THE ALLOWLIST. A verified company identity is not sufficient by itself.
      const decision = google.decideAccountAccess(row);
      if (!decision.ok) {
        await logAttempt(email, 'google', decision.reason);
        return refuse();
      }
      if (!auth.ROLES.includes(row.role)) {
        await logAttempt(email, 'google', google.REASON.INACTIVE);
        return refuse();
      }

      const token = auth.issueSession({
        id: row.id, email: row.email, name: row.display_name, role: row.role,
        sessionVersion: Number(row.session_version ?? 0),
        authMethod: 'google',          // read from crm_users, never from Google
        authAt: Date.now(),
      }, process.env.CRM_SESSION_SECRET);

      await db.prepare('UPDATE crm_users SET last_login_at = ? WHERE id = ?').run(nowIso(), row.id);
      await logAttempt(email, 'google', 'success_google');
      // A sign-in by any route clears the password throttle for that address.
      LOGIN_TRIES.delete(email);

      res.writeHead(303, { location: '/?auth=google', 'cache-control': 'no-store',
        'set-cookie': [auth.cookieHeader(token, { secure: !DEV_INSECURE_COOKIE }),
          flowCookie('', 0)] });
      return res.end();
    }

    if (req.method === 'POST' && p === '/api/auth/logout') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'set-cookie': auth.clearCookie({ secure: !DEV_INSECURE_COOKIE }) });
      return res.end(JSON.stringify({ ok: true }));
    }

    // ------------------------------------------------------- admin: channels --
    //
    // Admin only, every route, checked on the server. What is shown is the NAME
    // of each setting and whether it is present. A value is never read out, and
    // assertNoSecretValues re-checks the whole payload before it is sent.

    // THE FIRST LOOK AT A REAL SIS REPLY (29.09.2026): admins only, read-only, one GET to the SIS through
    // lib/sis.js. Answers the SHAPE (field names, fill counts, status counts) and never a person, a date
    // value or the token. It exists because production secrets never leave Vercel.
    // RITVARS' LIVE CALL TEST (30.09.2026): is a call in the TeleGroup list while it rings? Admins only,
    // read-only, one GET through lib/pbx.js for the last 2 minutes; never the token (lib/pbx.js pbxLive).
    if (req.method === 'GET' && p === '/api/admin/pbx/live') {
      if (!(await adminOf(req))) return refuseNotAdmin(res);
      return json(res, 200, await pbxLive());
    }

    // THE CALL POP-UP (Q6, 04.10.2026). Every signed-in user, not only admins: whoever answers
    // the phone. The open app asks every few seconds for call events newer than the last it saw.
    // It reads OUR call_events, never TeleGroup, and never gets the caller's number (src/callpop.js).
    if (req.method === 'GET' && p === '/api/calls/events') {
      const viewer = await viewerOf(req, url);
      const users = AUTH_ON
        ? (await db.prepare('SELECT display_name FROM crm_users WHERE active = 1').all()).map((u) => u.display_name).filter(Boolean)
        : USER_NAMES;
      const after = url.searchParams.has('after') ? url.searchParams.get('after') : null;
      // Can a call arrive at all? The phone channel switched on, and a source: the push secret, or
      // the TeleGroup pull's token. Without one the app asks every 5 minutes, not every 3 seconds.
      const enabled = (await channelMode(db, 'phone')) !== 'off'
        && Boolean(process.env[PHONE_EVENT_SECRET_ENV] || process.env.PBX_API_TOKEN);
      return json(res, 200, { enabled, ...(await callpop.callFeed(db, { after, viewer, users })) });
    }

    // WEB PUSH (Q6, 04.10.2026): the browser subscribes once; the service worker asks /api/calls/latest
    // after each knock. Every signed-in colleague; the public key only, never the private one.
    if (req.method === 'GET' && p === '/api/push/key') {
      return json(res, 200, { publicKey: webpush.pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null });
    }
    if (req.method === 'POST' && (p === '/api/push/subscribe' || p === '/api/push/unsubscribe')) {
      const b = await body(req);
      try {
        if (p.endsWith('/unsubscribe')) return json(res, 200, await webpush.unsubscribe(db, b.endpoint));
        return json(res, 200, await webpush.subscribe(db, { endpoint: b.endpoint, userName: await viewerOf(req, url) }));
      } catch (err) { return json(res, 400, { error: err.message }); }
    }
    if (req.method === 'GET' && p === '/api/calls/latest') {
      const viewer = await viewerOf(req, url);
      const users = AUTH_ON
        ? (await db.prepare('SELECT display_name FROM crm_users WHERE active = 1').all()).map((u) => u.display_name).filter(Boolean)
        : USER_NAMES;
      return json(res, 200, { note: await callpop.latestNote(db, { viewer, users }) });
    }

    // THE PHONE SYSTEM PUSHES CALL EVENTS HERE (Q6, 04.10.2026): ringing, answered, ended.
    // A shared secret in x-crm-secret, compared in constant time; the phone channel's mode decides
    // whether it is accepted at all, as for every channel. src/phoneevent.js is the adapter.
    if (req.method === 'POST' && p === '/api/inbound/phone-event') {
      const want = Buffer.from(String(process.env[PHONE_EVENT_SECRET_ENV] || ''));
      const got = Buffer.from(String(req.headers['x-crm-secret'] || ''));
      if (!want.length) return json(res, 503, { error: 'phone events are not configured here', missing: PHONE_EVENT_SECRET_ENV });
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return json(res, 401, { error: 'shared secret did not match' });
      const mode = await channelMode(db, 'phone');
      if (mode === 'off') return json(res, 409, { error: 'the phone channel is off' });
      let raw;
      try { raw = JSON.parse(await rawText(req, 16384) || '{}'); } catch { return json(res, 400, { error: 'the body is not JSON' }); }
      try { return json(res, 200, await receivePhoneEvent(db, raw, { mode })); } catch (err) {
        if (err instanceof BadInbound) return json(res, 400, { error: err.message });
        throw err;
      }
    }

    if (req.method === 'GET' && p === '/api/admin/sis/first-look') {
      if (!(await adminOf(req))) return refuseNotAdmin(res);
      try { return json(res, 200, { ok: true, ...(await firstLook()) }); } catch (err) {
        return json(res, 200, { ok: false, status: err && err.status || null,
          error: redactSis(err && err.message ? err.message : 'the SIS call failed', process.env.SIS_API_TOKEN) });
      }
    }

    // THE SIS, ON DEMAND (01.10.2026). The same syncSis the 05:00 UTC cron runs, for an admin who
    // wants a run now (Vercel's plan allows only a daily schedule). Answers counts, never a person.
    if (req.method === 'POST' && p === '/api/admin/sis/sync') {
      if (!(await adminOf(req))) return refuseNotAdmin(res);
      try { return json(res, 200, await syncSis(db)); } catch (err) {
        return json(res, 200, { ok: false, ran: true, channel: 'sis', status: err && err.status || null,
          error: redactSis(err && err.message ? err.message : 'the SIS run failed', process.env.SIS_API_TOKEN) });
      }
    }
    // The live check against the real SIS: pages, since, refusals, web stats (src/sischeck.js).
    if (req.method === 'GET' && p === '/api/admin/sis/check') {
      if (!(await adminOf(req))) return refuseNotAdmin(res);
      try { return json(res, 200, await sisLiveCheck({ db })); } catch (err) {
        return json(res, 200, { ok: false, error: redactSis(err && err.message ? err.message : 'the check failed', process.env.SIS_API_TOKEN) });
      }
    }
    // apply.novikontas.org visits for the Reports screen (popup A, 01.10.2026). Counts only,
    // so any signed-in user may read them. Built nightly and ending with yesterday, so a copy is kept
    // for 15 minutes per range: well inside the SIS limit of 60 calls a minute.
    if (req.method === 'GET' && p === '/api/web-stats') {
      const range = url.searchParams.get('range') || '30d';
      if (!WEB_RANGES.includes(range)) return json(res, 400, { error: 'range must be one of ' + WEB_RANGES.join(', ') });
      const hit = WEB_STATS_CACHE.get(range);
      if (hit && Date.now() - hit.at < 15 * 60 * 1000) return json(res, 200, { ok: true, cached: true, ...hit.data });
      try {
        const data = await fetchWebStats({ range });
        WEB_STATS_CACHE.set(range, { at: Date.now(), data });
        return json(res, 200, { ok: true, ...data });
      } catch (err) {
        return json(res, 200, { ok: false, status: err && err.status || null,
          error: redactSis(err && err.message ? err.message : 'the SIS call failed', process.env.SIS_API_TOKEN) });
      }
    }

    // Applications in Reports (popup A, 01.10.2026): the SIS funnel by registration week, from the
    // rows already stored here. Counts only and SELECTs only: it never calls the SIS, never runs a
    // sync and never writes, so any signed-in user may read it, like the web stats beside it.
    if (req.method === 'GET' && p === '/api/applications') {
      return json(res, 200, await applicationFunnel(db));
    }

    if (p === '/api/admin/channels' || p.startsWith('/api/admin/channels/')) {
      const me = await adminOf(req);
      if (!me) return refuseNotAdmin(res);
      const parts = p.split('/').filter(Boolean);           // api admin channels [id] [action]
      const id = parts[3] || null;
      const action = parts[4] || null;

      if (req.method === 'GET' && !id) {
        const payload = {
          identityIsProved: AUTH_ON,
          honesty: AUTH_ON
            ? 'Admin is a role read from the database on every request.'
            : 'Sign-in is OFF on this copy, so "admin" here is a name selected in a dropdown, not a proved identity.',
          states: channeladmin.STATES,
          statesMean: {
            'NOT CONFIGURED': 'a setting it needs is missing',
            'CONFIGURED': 'the settings exist, and nothing has yet proved the path works',
            'CONNECTED': 'the provider itself has reached us',
            'ERROR': 'it was checked and the check failed',
          },
          onOffIsSeparate: 'Whether a channel is switched ON is a different question from whether it works. Everything is OFF until an admin turns it on.',
          channels: channeladmin.allStatuses({
            env: process.env, checks: await latestChecks(), handshakes: await handshakeRows(),
            countsByChannel: await channelCounts() }).concat(integrationStatuses()),
          runs: await syncRuns(),
          // Q27 (05.10.2026): the pull times and the SIS chain for the Channels figures. Data only.
          schedule: CHANNELS.schedule || null,
          filtersAll: CHANNELS.filtersAll || [],
          sis: { stages: SIS_STAGE, ...((await channelCounts()).sis || { events: 0 }),
            record: (CHANNELS.integrations && CHANNELS.integrations.sis && CHANNELS.integrations.sis.record) || null },

          // WHICH ENVIRONMENT THIS IS (02.10.2026). The Channels screen was printing
          // "Not set up" for every channel on a local checkout, where no secret exists,
          // and that read as though PRODUCTION were unconfigured. A local environment
          // knows nothing about Vercel's and must never be shown as if it did. These are
          // four different states: local configuration, deployed code, production
          // configured, live verified. Only a provider row proves the last one.
          // the commit proven to be running, and what sits downstream and is NOT a channel
          production: CHANNELS._production || null,
          downstream: CHANNELS.downstream || null,
          environment: {
            name: process.env.VERCEL_ENV || (process.env.VERCEL ? 'vercel' : 'local'),
            isProduction: process.env.VERCEL_ENV === 'production',
            // said plainly, because the screen shows this sentence
            caveat: process.env.VERCEL_ENV === 'production'
              ? null
              : 'This is not production. No secret is set here, so every channel reads as not configured. It says nothing about the live site.',
          },
        };
        channeladmin.assertNoSecretValues(payload, process.env);
        return json(res, 200, payload);
      }

      if (id && !channelDef(id) && !integrationDef(id)) return json(res, 404, { error: 'no such channel: ' + id });

      if (req.method === 'GET' && id && !action) {
        // an integration answers from its own builder: it has no adapter to ask
        if (!channelDef(id)) {
          const one = integrationStatuses().find((x) => x.channel === id);
          channeladmin.assertNoSecretValues(one, process.env);
          return json(res, 200, one);
        }
        const def = channelDef(id);
        const payload = {
          ...channeladmin.statusOf(id, { env: process.env, lastCheck: (await latestChecks())[id] || null,
            handshakeAt: ((await handshakeRows())[id] || {}).verified_at || null,
            handshakeHow: ((await handshakeRows())[id] || {}).how || null,
            counts: (await channelCounts())[id] || {} }),
          connectSteps: def.connectSteps || [],
          howWeGoLive: def.howWeGoLive || null,
          howWeDisable: def.howWeDisable || null,
          checks: await db.prepare(`SELECT at, ok, kind, detail, by FROM channel_check
                              WHERE channel = ? ORDER BY id DESC LIMIT 10`).all(id),
        };
        channeladmin.assertNoSecretValues(payload, process.env);
        return json(res, 200, payload);
      }

      // Run the check. Nothing goes out to a provider and nothing is stored in
      // the Inbox; see checkPlanFor in src/channeladmin.js for what each kind
      // of check does and, just as importantly, what it does not prove.
      if (req.method === 'POST' && id && action === 'check') {
        if (!auth.canTestChannels(me.role)) return refuseNotAdmin(res);
        const r = channeladmin.runCheck(id, { env: process.env });
        if (r.skipped) {
          return json(res, 200, { ok: null, skipped: true, why: r.detail });
        }
        await db.prepare('INSERT INTO channel_check (channel, at, ok, kind, detail, by) VALUES (?,?,?,?,?,?)')
          .run(id, nowIso(), r.ok ? 1 : 0, r.kind, String(r.detail || '').slice(0, 500), me.name);
        const payload = { ...r, channel: id, at: nowIso(), by: me.name };
        channeladmin.assertNoSecretValues(payload, process.env);
        return json(res, 200, payload);
      }

      // Switch a channel ON or OFF. Never automatic, and it refuses unless the
      // settings are there and a check has actually passed - so "enable" cannot
      // be the thing that discovers the channel is broken.
      if (req.method === 'POST' && id && action === 'mode') {
        if (!auth.canEnableChannel(me.role)) return refuseNotAdmin(res);
        const b = await body(req);
        const want = String((b && b.mode) || '').toLowerCase();
        if (!['off', 'test', 'live'].includes(want)) {
          return json(res, 400, { error: 'mode must be off, test or live' });
        }
        if (want !== 'off') {
          const st = channeladmin.statusOf(id, { env: process.env,
            lastCheck: (await latestChecks())[id] || null });
          if (!st.allSettingsPresent) {
            return json(res, 409, { error: `Cannot switch ${id} on: ${st.missingSettings.join(', ')} not set.` });
          }
          if (st.canTest && st.lastCheckOk !== true) {
            return json(res, 409, { error: 'Cannot switch it on until a check has passed. Run the check first.' });
          }
        }
        await db.prepare(`INSERT INTO channel_mode (channel, mode, changed_at, changed_by) VALUES (?,?,?,?)
                    ON CONFLICT(channel) DO UPDATE SET mode = excluded.mode,
                      changed_at = excluded.changed_at, changed_by = excluded.changed_by`)
          .run(id, want, nowIso(), me.name);
        process.env['CHANNEL_MODE_' + id.toUpperCase()] = want;
        return json(res, 200, { ok: true, channel: id, mode: want, live: want === 'live', by: me.name });
      }

      return json(res, 404, { error: 'no such admin route' });
    }


    // Our control room, at its own address. It is deliberately NOT a route inside
    // the CRM: the CRM is the product and carries no way into this.
    if (req.method === 'GET' && (p === '/console' || p === '/console/')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(fs.readFileSync(path.join(ROOT, 'src', 'console.html')));
    }

    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      // never cached: the whole app is this one file, and a tester holding a cached
      // copy would keep reporting bugs that were fixed hours ago
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      // withReturnScript: a hash link survives the Google sign-in. src/signinfirst.js.
      return res.end(withReturnScript(fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8')));
    }
    // The installable-app description: name, the Academy icons, the window. Open before
    // sign-in like the page itself, because the browser reads it on the sign-in screen.
    // The service worker (Q6): at the root so its scope is the whole app; it holds no data.
    if (req.method === 'GET' && p === '/sw.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(path.join(ROOT, 'src', 'sw.js')));
    }
    if (req.method === 'GET' && p === '/manifest.webmanifest') {
      res.writeHead(200, { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'public, max-age=3600' });
      return res.end(JSON.stringify(APP_MANIFEST, null, 2));
    }
    // Browsers ask for /favicon.ico on their own (bookmarks, some tabs). Answer with the symbol.
    if (req.method === 'GET' && p === '/favicon.ico') {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' });
      return res.end(fs.readFileSync(path.join(ROOT, 'src', 'assets', 'icon-192.png')));
    }
    // The brand assets. Only the two authorised logo files, served by an exact
    // name match: no path is ever built out of what the request asked for.
    if (req.method === 'GET' && p.startsWith('/assets/')) {
      // Name -> content type, so the list stays an exact-match allow-list and a
      // new kind of asset cannot be served with the wrong type by accident.
      // na_pattern_tile.png arrived with the sign-in screen: its card mask
      // references it, and without it every page load logged a 404.
      const ALLOWED = {
        'NoAca_logo_darkhor.svg': 'image/svg+xml; charset=utf-8',
        'NoAca_logo_whitehor.svg': 'image/svg+xml; charset=utf-8',
        'NoAca_logo_blackhor.svg': 'image/svg+xml; charset=utf-8',
        'na_pattern_tile.png': 'image/png',
        // The Academy symbol for the browser tab and the installed app (28.09.2026:
        // "always Novikontas Academy logos have to be in web tabs and on desktop").
        // The brandbook symbol on a white tile: NA black, the A's leg Novikontas blue (29.09.2026, every app).
        'NoAca_logo_twotonehor.svg': 'image/svg+xml; charset=utf-8',   // the logo on light (dev kit part 2)
        // the Help center's tour and questions, copied from dev kit part 3 unchanged
        'help-tour.js': 'text/javascript; charset=utf-8',
        'help-center.js': 'text/javascript; charset=utf-8',
        'help-center.css': 'text/css; charset=utf-8',
        'favicon.svg': 'image/svg+xml; charset=utf-8',
        'icon-192.png': 'image/png',
        'icon-512.png': 'image/png',
        'icon-maskable-512.png': 'image/png',
        'apple-touch-icon.png': 'image/png',
      };
      const name = p.slice('/assets/'.length);
      const type = ALLOWED[name];
      if (!type) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=3600' });
      return res.end(fs.readFileSync(path.join(ROOT, 'src', 'assets', name)));
    }

    if (req.method === 'GET' && p === '/api/config') return json(res, 200, { ...CONFIG, dataset: DATASET, help: { tour: HELP.tour, faq: HELP.faq } });

    // --------------------------------------------------------- the database -
    if (req.method === 'POST' && p === '/api/dataset') {
      // Replaces or empties the WHOLE database. With sign-in on this copy holds real people,
      // so only an admin may, as with /api/console/mode. Any signed-in user could before
      // (found 28.09.2026: the shared Admissions account emptied a copy with one request).
      if (AUTH_ON && !(await adminOf(req))) return json(res, 403, { error: 'replacing the database is for admins only' });
      const b = await body(req);
      try {
        const info = await loadDataset(b.kind);
        ACTIVITY.length = 0;
        return json(res, 200, { ok: true, dataset: info, realAvailable: hasRealData() });
      } catch (err) { return json(res, 400, { error: err.message }); }
    }

    if (req.method === 'POST' && p === '/api/reset') {
      // Replaces or empties the WHOLE database. With sign-in on this copy holds real people,
      // so only an admin may, as with /api/console/mode. Any signed-in user could before
      // (found 28.09.2026: the shared Admissions account emptied a copy with one request).
      if (AUTH_ON && !(await adminOf(req))) return json(res, 403, { error: 'replacing the database is for admins only' });
      const info = await loadDataset('empty');
      ACTIVITY.length = 0;
      return json(res, 200, { ok: true, dataset: info });
    }


    // ------------------------------------------------- integration simulator -
    if (req.method === 'GET' && p === '/api/sim/providers') {
      // Promise.all, not just async: .map with an async callback returns an
      // array of PROMISES and nothing would throw - the screen would simply show
      // unresolved objects.
      const channels = await Promise.all(PROVIDERS.channels.map(async (c) => {
        const last = await db.prepare('SELECT at, scenario, decision, status FROM sim_events WHERE channel = ? ORDER BY id DESC LIMIT 1').get(c.id);
        const count = (await db.prepare('SELECT COUNT(*) n FROM sim_events WHERE channel = ?').get(c.id)).n;
        return { ...c, lastEvent: last || null, eventCount: count,
          statusLabel: c.status.live ? 'LIVE' : c.status.providerTested ? 'PROVIDER-TESTED' : 'CONNECTED - SIMULATED ACCOUNT' };
      }));
      return json(res, 200, { honesty: PROVIDERS.honesty, consentPurposes: PROVIDERS.consentPurposes, channels, demoSequence: DEMO_SEQUENCE });
    }

    if (req.method === 'POST' && /^\/api\/sim\/[^/]+\/run$/.test(p)) {
      const id = p.split('/')[3];
      const b = await body(req);
      return json(res, 200, await runScenario(db, id, b.scenario));
    }

    if (req.method === 'POST' && /^\/api\/sim\/[^/]+\/outbound$/.test(p)) {
      const id = p.split('/')[3];
      const b = await body(req);
      return json(res, 200, await runOutbound(db, id, b.personId, b.text));
    }

    if (req.method === 'POST' && p === '/api/sim/demo') {
      return json(res, 200, await runFullDemo(db));
    }

    if (req.method === 'GET' && p === '/api/sim/events') {
      return json(res, 200, await listEvents(db));
    }

    if (req.method === 'GET' && /^\/api\/sim\/events\/\d+$/.test(p)) {
      const ev = await getEvent(db, Number(p.split('/')[4]));
      return ev ? json(res, 200, ev) : json(res, 404, { error: 'not found' });
    }

    if (req.method === 'GET' && p === '/api/consent') {
      return json(res, 200, { summary: await consentSummary(db), purposes: PROVIDERS.consentPurposes,
        recent: await db.prepare(`SELECT c.*, pe.name FROM consents c JOIN people pe ON pe.id = c.person_id ORDER BY c.id DESC LIMIT 40`).all() });
    }

    if (req.method === 'GET' && p === '/api/metrics') {
      const bySource = await db.prepare(`SELECT source_channel channel, COUNT(*) n,
        SUM(CASE WHEN status='Admitted' THEN 1 ELSE 0 END) admitted,
        SUM(CASE WHEN source_campaign IS NOT NULL THEN 1 ELSE 0 END) withCampaign FROM people GROUP BY source_channel ORDER BY n DESC`).all();
      const simEvents = await db.prepare('SELECT channel, direction, COUNT(*) n FROM sim_events GROUP BY channel, direction').all();
      return json(res, 200, { bySource, simEvents,
        crmKnows: ['lead created', 'source and campaign', 'contact details', 'every message', 'follow-up and outcome', 'application', 'contract', 'admission'],
        platformKnows: ['ad impression and click', 'form or message interaction', 'delivery and engagement', 'platform-side conversion signal only if we send it back'],
        returnPath: {
          google: 'Offline conversion import and enhanced conversions for leads move to the Data Manager API: from 15 June 2026 those uploads are blocked in the Google Ads API. Sending an Intake admission back as a conversion means hashed user-provided data through Data Manager, and for EEA traffic it depends on consent mode signals (ad_user_data, ad_personalization).',
          meta: 'An Intake outcome reaches Meta only through the Conversions API with hashed identifiers, and it is a separate build from the lead webhook.',
          mailchimp: 'An Intake outcome reaches Mailchimp as a tag or merge field through the Marketing API.',
          note: 'No platform learns that somebody enrolled unless we tell it. Nothing here sends anything anywhere.'
        } });
    }

    // ------------------------------------------------------------- today ---
    // Decision 11: the work is grouped, the order is the user's, and NOTHING is
    // hidden by re-ordering. An empty group still appears, saying it is clear.
    // Each group reports done/total for the day so a cleared queue reads cleared.
    if (req.method === 'GET' && p === '/api/today') {
      const from = dayStart();
      const to = dayEnd();
      const withTask = (rows) => rows;
      // Today says whose day it is at the top, so it has to BE that person's day.
      // It used to show the whole team's work under a heading naming one person,
      // which is why the sidebar said 4 and this screen said 6. ?scope=all opts
      // back out. An admin holds no role, so an admin sees everything.
      const meRole = roleOf(await viewerOf(req, url));
      const everyone = url.searchParams.get('scope') === 'all' || !meRole;
      const mine = (rows, key = 'owner') => everyone ? rows : rows.filter((r) => r[key] === meRole);

      // NEW LEADS - arrived and nobody has spoken to them yet.
      const newLeadsAll = await db.prepare(`SELECT pe.* FROM people pe
        WHERE pe.created_at >= ? AND pe.status NOT IN ('Admitted','Not proceeding')`).all(from);
      const spokenTo = async (id) => (await db.prepare(`SELECT COUNT(*) n FROM events
        WHERE person_id = ? AND origin = 'manual' AND kind IN ('call','note','task','status')`).get(id)).n > 0;
      // RESOLVED FIRST, then filtered by index. `.filter` with an async predicate
      // keeps every row, because a Promise is always truthy - New leads would
      // have been silently empty.
      const hasBeenSpokenTo = await Promise.all(newLeadsAll.map((r) => spokenTo(r.id)));
      const newLeads = mine(newLeadsAll.filter((r, i) => !hasBeenSpokenTo[i]));
      const newLeadsDone = newLeadsAll.length - newLeads.length;

      // FOLLOW-UPS - a next step due today or already late, plus the ones closed today.
      const openFollow = await db.prepare(`SELECT t.*, pe.name, pe.programme, pe.status FROM tasks t
        JOIN people pe ON pe.id = t.person_id
        WHERE t.done_at IS NULL AND t.due_at < ? ORDER BY t.due_at ASC`).all(to);
      const doneFollow = (await db.prepare(`SELECT COUNT(*) n FROM tasks WHERE done_at >= ? AND done_at < ?`).get(from, to)).n;
      const openFollowMine = mine(openFollow);

      // REPLIES - they wrote to us and nothing has gone back since.
      const replies = await db.prepare(`SELECT pe.id, pe.name, pe.programme, pe.status, pe.source_channel,
          e.subject, e.body, e.occurred_at, e.channel
        FROM events e JOIN people pe ON pe.id = e.person_id
        WHERE e.direction = 'in'
          AND e.occurred_at = (SELECT MAX(e2.occurred_at) FROM events e2 WHERE e2.person_id = pe.id)
          AND pe.status NOT IN ('Admitted','Not proceeding')
        ORDER BY e.occurred_at DESC`).all();
      const answeredToday = (await db.prepare(`SELECT COUNT(*) n FROM events
        WHERE occurred_at >= ? AND occurred_at < ? AND (direction = 'out' OR (origin = 'manual' AND kind IN ('call','note')))`)
        .get(from, to)).n;

      // OTHER ATTENTION - active, and no next step at all. This is the crack people fall through.
      const attention = await db.prepare(`SELECT pe.* FROM people pe
        WHERE pe.status NOT IN ('Admitted','Not proceeding')
          AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL)
        ORDER BY pe.created_at DESC`).all();
      const attentionMine = mine(attention);

      // WAITING ON US - one queue, however it started. Follow-ups and Replies were
      // two tabs answering the same question, "who needs me today?", and a person
      // who had both a due step AND an unanswered message appeared twice. Merged
      // 24.09.2026. Each row still says WHY it is here, because the two need a
      // different action: a planned step is marked done, a message is answered.
      const waiting = new Map();
      for (const t of openFollowMine) {
        waiting.set(t.person_id, { person_id: t.person_id, id: t.person_id, name: t.name,
          programme: t.programme, status: t.status, why: 'step',
          taskId: t.id, label: t.label, due_at: t.due_at });
      }
      for (const r of mine(replies)) {
        const already = waiting.get(r.id);
        const reply = { subject: r.subject, channel: r.channel, occurred_at: r.occurred_at,
          source_channel: r.source_channel };
        if (already) Object.assign(already, reply, { why: 'both' });
        else waiting.set(r.id, { person_id: r.id, id: r.id, name: r.name, programme: r.programme,
          status: r.status, why: 'reply', ...reply });
      }
      // the oldest thing waiting comes first, whichever kind it is
      const waitingRows = [...waiting.values()].sort((a, b) =>
        String(a.due_at || a.occurred_at || '').localeCompare(String(b.due_at || b.occurred_at || '')));

      const group = (id, label, open, done) => ({
        id, label,
        open: open.length, done, total: open.length + done,
        complete: open.length === 0 && done > 0,
        empty: open.length === 0 && done === 0,
        rows: open.slice(0, 25),
      });

      // The labels come from config/prototype.json -> todayGroups, not from
      // strings here. They were in BOTH places, so renaming a tab in the config
      // changed nothing on screen and the two could drift apart silently. One
      // source now; the config is it.
      const groupDef = (id) => CONFIG.todayGroups.find((g) => g.id === id) || {};
      const groupLabel = (id) => groupDef(id).label || id;

      return json(res, 200, {
        groups: [
          group('new_leads', groupLabel('new_leads'), newLeads, newLeadsDone),
          group('waiting', groupLabel('waiting'), waitingRows, doneFollow + answeredToday),
          group('attention', groupLabel('attention'), attentionMine, 0),
        ],
        marks: Object.fromEntries(CONFIG.todayGroups.filter((g) => g.mark).map((g) => [g.id, g.mark])),
        order: CONFIG.todayGroups.map((g) => g.id),
        descriptions: Object.fromEntries(CONFIG.todayGroups.map((g) => [g.id, g.what])),
        scope: everyone ? 'all' : 'mine',
        role: meRole,
      });
    }

    // Decision 12: the three the management asked for, and nothing invented.
    if (req.method === 'GET' && p === '/api/metrics/core') {
      const monthStart = new Date().toISOString().slice(0, 8) + '01T00:00:00.000Z';
      const newLeads = (await db.prepare('SELECT COUNT(*) n FROM people WHERE created_at >= ?').get(monthStart)).n;
      const admitted = (await db.prepare('SELECT COUNT(*) n FROM people WHERE admitted_at >= ?').get(monthStart)).n;
      // Conversion: the ONE definition (src/reports.js maturedConversion, the owner 05.10.2026), over this month's
      // arrivals - so it stays empty until they are matured, which is the point.
      const conv = await maturedConversion(db, periodOf());
      return json(res, 200, {
        month: monthStart.slice(0, 7),
        newLeadsThisMonth: newLeads,
        admissionsThisMonth: admitted,
        conversionPct: conv.pct,
        conversionOf: `${conv.admitted} of ${conv.of} people ${conv.who}`,
        caution: `Admissions this month and conversion count different populations: somebody admitted today may have arrived months ago. Conversion counts only people who arrived ${conv.days}+ days before the end of the period.`,
      });
    }

    // WHERE PEOPLE LEFT THE ACTIVE JOURNEY (Ritvars, 01.10.2026). Not proceeding is an
    // EXIT, not the stage after Contract, and it can happen from any active stage. The
    // Journey screen draws one mark per stage, so it needs the count per stage.
    //
    // The number is read from history, never guessed: every status change writes an
    // events row carrying old_value, so the stage somebody was in when they left is a
    // recorded fact. The LAST such event per person wins - somebody reopened and closed
    // again left from wherever they were the second time.
    if (req.method === 'GET' && p === '/api/journey/exits') {
      const closed = CONFIG.stageRoles && CONFIG.stageRoles.closed;
      const rows = await db.prepare(`SELECT e.person_id, e.old_value, e.id FROM events e
        WHERE e.field = 'status' AND e.new_value = ?
        ORDER BY e.person_id, e.id`).all(closed);
      const lastPerStage = new Map();          // person -> the stage of their newest exit
      for (const r of rows) lastPerStage.set(r.person_id, r.old_value);

      // Only people who are not proceeding NOW. Somebody closed in March and reopened in
      // May is working again, and counting their old exit would show a loss we recovered.
      const nowClosed = new Set((await db.prepare('SELECT id FROM people WHERE status = ?').all(closed)).map((x) => x.id));
      const byStage = {};
      for (const [personId, stage] of lastPerStage) {
        if (!stage || !nowClosed.has(personId)) continue;
        byStage[stage] = (byStage[stage] || 0) + 1;
      }
      // Somebody not proceeding with NO status event behind them: imported, or closed
      // before the history existed. Reported, never silently folded into a stage.
      const counted = Object.values(byStage).reduce((a, b) => a + b, 0);
      return json(res, 200, { byStage, total: nowClosed.size, unrecorded: nowClosed.size - counted });
    }

    if (req.method === 'GET' && p === '/api/summary') {
      const q = async (sql, ...a) => await db.prepare(sql).get(...a);
      const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
      // STILL_OPEN_SQL, not a bare task query: a finished person's leftover task used to appear
      // here as overdue while openPeople and noNextAction below already counted them out.
      const overdue = await db.prepare(`SELECT t.*, pe.name, pe.programme, pe.status FROM tasks t JOIN people pe ON pe.id = t.person_id
        WHERE t.done_at IS NULL AND ${STILL_OPEN_SQL} AND t.due_at < ? ORDER BY t.due_at ASC`).all(dayStart());
      const today = await db.prepare(`SELECT t.*, pe.name, pe.programme, pe.status FROM tasks t JOIN people pe ON pe.id = t.person_id
        WHERE t.done_at IS NULL AND ${STILL_OPEN_SQL} AND t.due_at >= ? AND t.due_at < ? ORDER BY t.due_at ASC`).all(dayStart(), dayEnd());
      return json(res, 200, {
        newLeads7: (await q('SELECT COUNT(*) n FROM people WHERE created_at >= ?', since7)).n,
        newLeadsToday: (await q('SELECT COUNT(*) n FROM people WHERE created_at >= ?', dayStart())).n,
        openPeople: (await q(`SELECT COUNT(*) n FROM people pe WHERE ${STILL_OPEN_SQL}`)).n,
        noNextAction: (await q(`SELECT COUNT(*) n FROM people pe WHERE ${STILL_OPEN_SQL} AND NOT ${SIS_HOLDS_SQL}
          AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL)`)).n,
        admitted30: (await q('SELECT COUNT(*) n FROM people WHERE admitted_at >= ?', since30)).n,
        admittedTotal: (await q('SELECT COUNT(*) n FROM people WHERE status = ?', 'Admitted')).n,
        overdue, today,
        recent: await db.prepare(`SELECT e.*, pe.name FROM events e JOIN people pe ON pe.id = e.person_id
          ORDER BY e.occurred_at DESC LIMIT 12`).all(),
        byStage: await db.prepare('SELECT status, COUNT(*) n FROM people GROUP BY status').all(),
      });
    }

    // ------------------------------------------------------------ people ---
    if (req.method === 'GET' && p === '/api/people') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const f = (k) => url.searchParams.get(k) || '';
      const sort = url.searchParams.get('sort') || 'created_at';
      const dir = (url.searchParams.get('dir') || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      const allowed = ['name', 'programme', 'status', 'owner', 'source_channel', 'created_at', 'last_contact_at'];
      const orderBy = allowed.includes(sort) ? sort : 'created_at';
      let rows = await db.prepare(`SELECT pe.*, (SELECT label FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL ORDER BY due_at LIMIT 1) AS next_action,
        (SELECT due_at FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL ORDER BY due_at LIMIT 1) AS next_action_at,
        (SELECT MIN(occurred_at) FROM lifecycle_events le WHERE le.person_id = pe.id AND le.fact = 'form_started') AS form_started_at,
        (SELECT MIN(occurred_at) FROM lifecycle_events le WHERE le.person_id = pe.id AND le.fact = 'matriculated') AS matriculated_at,
        -- the newest comment somebody wrote (Add a note / Log a call), for the Journey card's one-line preview
        (SELECT body FROM events e WHERE e.person_id = pe.id AND e.origin = 'manual' AND e.kind IN ('note', 'call')
          AND COALESCE(e.body, '') <> '' ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1) AS last_comment
        FROM people pe ORDER BY ${orderBy} ${dir} NULLS LAST`).all();
      // Decision 10: findable by whatever the operator remembers, including the
      // channel's plain name, so "instagram" finds it without knowing the id.
      if (q) {
        const fields = CONFIG.searchFields || ['name', 'email', 'phone'];
        rows = rows.filter((r) => fields.some((f) => String(r[f] ?? '').toLowerCase().includes(q))
          || channelLabel(r.source_channel).toLowerCase().includes(q));
      }
      for (const key of ['status', 'programme', 'owner', 'source_channel', 'nationality']) {
        const v = f(key);
        if (v) rows = rows.filter((r) => String(r[key]) === v);
      }
      if (f('due') === 'overdue') rows = rows.filter((r) => r.next_action_at && r.next_action_at < dayStart());
      if (f('due') === 'none') rows = rows.filter((r) => !r.next_action_at && !['Admitted', 'Not proceeding'].includes(r.status));
      const sis = await sisProgressByPerson(db);   // where each linked person is in the SIS (read back, never a stage)
      for (const r of rows) r.sis = sis[r.id] || null;
      return json(res, 200, { count: rows.length, rows });
    }

    if (req.method === 'GET' && p === '/api/people/fields') {
      return json(res, 200, {
        editable: EDITABLE_FIELDS, labels: FIELD_LABELS, immutable: IMMUTABLE_FIELDS,
        decided: CONFIG.editPolicy || null,
      });
    }

    if (req.method === 'GET' && p === '/api/people/check') {
      return json(res, 200, { matches: await findMatches({
        email: url.searchParams.get('email'),
        phone: url.searchParams.get('phone'),
        name: url.searchParams.get('name'),
      }) });
    }

    if (req.method === 'GET' && /^\/api\/people\/[^/]+$/.test(p)) {
      const person = await personRow(p.split('/')[3], await viewerOf(req, url));
      return person ? json(res, 200, person) : json(res, 404, { error: 'not found' });
    }

    if (req.method === 'POST' && p === '/api/people') {
      const b = await body(req);
      for (const field of CONFIG.requiredOnQuickAdd) if (!b[field]) return json(res, 400, { error: `${field} is required` });
      // Decision 9, locked 23.09.2026: never create a duplicate silently. The save
      // stops, the existing record is shown, and only an explicit statement that
      // this is somebody else gets past it.
      if (CONFIG.duplicateRule?.blockOnMatch && !b.confirmedNotDuplicate) {
        const hits = await findMatches({ email: b.email, phone: b.phone, name: b.name });
        if (hits.length) {
          return json(res, 409, {
            error: 'This person may already be in Intake.',
            matches: hits,
            whatToDo: 'Open the existing record, or confirm in as many words that this is a different person.',
          });
        }
      }
      const id = newId();
      const d = CONFIG.quickAddDefaults;
      const now = nowIso();
      await db.prepare(`INSERT INTO people (id,name,email,phone,programme,study_form,education,status,owner,source_channel,source_campaign,source_detail,created_at,last_contact_at,notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, b.name, b.email || null, b.phone || null, b.programme || null, b.study_form || null, b.education || null,
        b.status || d.status, b.owner || d.owner, b.source_channel || d.source_channel, b.source_campaign || null,
        b.source_detail || ('entered by ' + (b.by || d.owner)), now, now, b.notes || null);
      await logEvent(db, { personId: id, kind: 'create', channel: b.source_channel || d.source_channel, direction: 'note',
        at: now, origin: MANUAL, actor: await actorOf(req, b), subject: 'Added manually',
        body: b.notes || `entered on the ${channelLabel(b.source_channel || d.source_channel)} channel` });
      const label = b.nextAction || d.nextAction;
      if (label) {
        const due = new Date(Date.now() + (Number(b.nextActionDays ?? d.nextActionDays) || 0) * 86400000).toISOString();
        await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)').run(id, label, due, b.owner || d.owner, now);
      }
      return json(res, 200, { id });
    }

    // Backlog 9: edit a person. The field policy lives in history.js, is applied
    // here, and a locked field is refused by name rather than quietly dropped.
    if (req.method === 'POST' && /^\/api\/people\/[^/]+\/edit$/.test(p)) {
      const id = p.split('/')[3];
      const b = await body(req);
      const patch = { ...b };
      delete patch.by;
      const r = await applyEdit(db, id, patch, await actorOf(req, b), nowIso());
      if (r.error === 'not found') return json(res, 404, { error: 'not found' });
      if (r.error) return json(res, 400, r);
      return json(res, 200, { ok: true, changes: r.changes, person: await personRow(id, await actorOf(req, b)) });
    }

    // Q15: what a stage move would need, asked before the page shows any note box. Reads only.
    if (req.method === 'GET' && /^\/api\/people\/[^/]+\/move-check$/.test(p)) {
      const id = p.split('/')[3];
      const before = await db.prepare('SELECT status FROM people WHERE id = ?').get(id);
      if (!before) return json(res, 404, { error: 'not found' });
      return json(res, 200, await moveCheck(db, CONFIG, id, before.status, url.searchParams.get('to') || '', nowIso()));
    }

    if (req.method === 'POST' && /^\/api\/people\/[^/]+\/status$/.test(p)) {
      const id = p.split('/')[3];
      const b = await body(req);
      const before = await db.prepare('SELECT status FROM people WHERE id = ?').get(id);
      if (!before) return json(res, 404, { error: 'not found' });
      // Decision 8: a person is never closed without a reason, and "Other" is not
      // a reason on its own.
      if (b.status === 'Not proceeding') {
        const allowed = CONFIG.closedReasons || [];
        if (!b.reason || !allowed.includes(b.reason)) {
          return json(res, 400, { error: 'A reason is required to stop working with somebody.', reasons: allowed });
        }
        if ((CONFIG.closedReasonNeedsNote || []).includes(b.reason) && !String(b.note || '').trim()) {
          return json(res, 400, { error: `"${b.reason}" needs an explanation.`, reasons: allowed, needsNote: true });
        }
      }
      // Q15 (the owner 05.10.2026): a move back is not saved without a note, or a note or logged call
      // from the last few minutes. config.stageMoveNote.enforce (on since the owner picked the
      // dialog, 05.10.2026); turned off, the move saves exactly as it did before Q15.
      if ((CONFIG.stageMoveNote || {}).enforce === true) {
        const chk = await moveCheck(db, CONFIG, id, before.status, b.status, nowIso());
        if (chk.direction === 'back' && !String(b.note || '').trim() && !chk.covered) {
          return json(res, 400, { error: `A note is needed to move back to ${b.status}.`, needsMoveNote: true, ...chk });
        }
      }
      const now = nowIso();
      await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(b.status, id);
      // Finished means finished: whatever was still planned for them is closed here, not left for
      // somebody to tidy by hand in Next Steps (Admissions, IEVA-3 and IEVA-5, 30.09.2026).
      if (isFinished(b.status)) await finishOpenTasks(id, now, `the person is ${b.status}`);
      if (b.status === 'Contract') await db.prepare('UPDATE people SET contract_at = ? WHERE id = ? AND contract_at IS NULL').run(now, id);
      if (b.status === 'Admitted') await db.prepare('UPDATE people SET admitted_at = ?, student_no = COALESCE(student_no, ?) WHERE id = ?')
        .run(now, '3-5-IM/2026/' + Math.floor(10 + Math.random() * 89), id);
      await logEvent(db, { personId: id, kind: 'status', direction: 'note', at: now, origin: MANUAL,
        actor: await actorOf(req, b),
        subject: `Status: ${before.status} -> ${b.status}` + (b.reason ? ` (${b.reason})` : ''),
        body: b.note || (b.reason ? '' : 'changed by hand'),
        field: 'status', oldValue: before.status, newValue: b.status });
      if (b.reason) await db.prepare('UPDATE people SET closed_reason = ?, closed_note = ? WHERE id = ?')
        .run(b.reason, b.note || null, id);
      // COLD IS NOT REJECTED (Admissions, 30.09.2026). The tag is only meaningful on 'Not proceeding',
      // and moving somebody back to an active stage clears it: a person who is active again is
      // neither cold nor rejected, and leaving a stale tag on them would poison the statistics.
      if (b.status === 'Not proceeding') {
        const tag = CONFIG.closedTags.some((t) => t.id === b.closedTag) ? b.closedTag : null;
        await db.prepare('UPDATE people SET closed_tag = ? WHERE id = ?').run(tag, id);
      } else {
        await db.prepare('UPDATE people SET closed_tag = NULL WHERE id = ?').run(id);
      }
      return json(res, 200, await personRow(id, await actorOf(req, b)));
    }

    if (req.method === 'POST' && /^\/api\/people\/[^/]+\/note$/.test(p)) {
      const id = p.split('/')[3];
      const b = await body(req);
      const now = nowIso();
      await logEvent(db, { personId: id, kind: b.kind || 'note', channel: b.kind === 'call' ? 'phone' : null,
        direction: 'note', at: now, origin: MANUAL, actor: await actorOf(req, b),
        subject: b.subject || 'Note', body: b.body || '' });
      await db.prepare('UPDATE people SET last_contact_at = ? WHERE id = ?').run(now, id);
      return json(res, 200, await personRow(id, await actorOf(req, b)));
    }

    // ------------------------------------------------------------ intake ---
    // The marketing side. Nothing here is connected to a provider: items are
    // pushed in from a fixture file so the flow can be walked through on screen.
    if (req.method === 'GET' && p === '/api/intake') {
      const state = url.searchParams.get('state') || 'new';
      const rows = await listInbound(db, { state });
      return json(res, 200, {
        rows, state,
        counts: {
          new: (await db.prepare("SELECT COUNT(*) n FROM inbound WHERE state = 'new'").get()).n,
          qualified: (await db.prepare("SELECT COUNT(*) n FROM inbound WHERE state = 'qualified'").get()).n,
          archived: (await db.prepare("SELECT COUNT(*) n FROM inbound WHERE state = 'archived'").get()).n,
          filtered: (await db.prepare("SELECT COUNT(*) n FROM inbound WHERE state = 'filtered'").get()).n,
          aged: await agedCount(db),
        },
        levels: CONFIG.qualification.levels,
        routing: CONFIG.routing,
        archiveReasons: CONFIG.intake.archiveReasons,
        ageing: CONFIG.ageing,
      });
    }

    if (req.method === 'POST' && p === '/api/intake/demo') {
      const now = Date.now();
      let added = 0;
      for (const f of FIXTURES.items) {
        const r = await receive(db, { ...f, source: 'demo', receivedAt: new Date(now - f.hoursAgo * 3600000).toISOString() });
        if (!r.duplicate) added++;
      }
      return json(res, 200, { ok: true, added, total: (await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n });
    }

    // One button that builds the whole V1 story, deterministically, so a review
    // always sees the same screens. No provider is contacted.
    if (req.method === 'POST' && p === '/api/demo/scenario') {
      // Replaces or empties the WHOLE database. With sign-in on this copy holds real people,
      // so only an admin may, as with /api/console/mode. Any signed-in user could before
      // (found 28.09.2026: the shared Admissions account emptied a copy with one request).
      if (AUTH_ON && !(await adminOf(req))) return json(res, 403, { error: 'replacing the database is for admins only' });
      await loadDataset('empty');
      ACTIVITY.length = 0;
      await runFullDemo(db);                                   // the older channel walk-through
      const now = Date.now();
      for (const f of FIXTURES.items) {
        await receive(db, { ...f, source: 'demo', receivedAt: new Date(now - f.hoursAgo * 3600000).toISOString() });
      }
      const script = [
        { extId: 'ig_msg_0002', as: 'lead', by: 'Tetiana', confirm: ['interest', 'start', 'education', 'question'],
          next: 'Send the admission terms and the price',
          note: 'Wants Navigation, finished secondary school, asking about the price' },
        { extId: 'fb_msg_0003', as: 'lead', by: 'Tetiana', confirm: ['interest'],
          next: 'Send the programme description',
          note: 'Asked for programme information' },
        { extId: 'wa_msg_0008', as: 'lead', by: 'Tetiana', confirm: ['interest', 'education', 'question', 'phone'],
          next: 'Call and establish interest',
          note: 'Wind turbine programme, finished school, asking when they could start' },
        { extId: 'li_msg_0006', as: 'lead', by: 'Tetiana', confirm: ['interest'],
          next: 'Answer the question',
          note: 'Marine engineering, asked which documents are needed' },
        { extId: 'fb_msg_0009', as: 'unclear', by: 'Tetiana', confirm: [],
          next: 'Call and establish interest',
          note: 'Asked if the course is open but did not say which one' },
      ];
      const out = [];
      const refused = [];
      for (const step of script) {
        const row = await db.prepare('SELECT id FROM inbound WHERE external_id = ?').get(step.extId);
        if (!row) continue;
        // These are demo people who genuinely are different people, so the walk-through
        // says so rather than tripping the duplicate rule it is meant to demonstrate.
        const r = await qualify(db, row.id, { qualification: step.as, createPerson: true,
          by: step.by, note: step.note, confirmFields: step.confirm,
          nextAction: step.next, differentPerson: true });
        // The return value is READ. This loop used to push whatever came back and
        // report its length as a success count, so when the gates started refusing
        // every step the demo still announced 'qualified: 5' with nothing qualified.
        if (r && r.ok) out.push(r); else refused.push({ extId: step.extId, error: r && r.error });
      }
      if (refused.length) {
        return json(res, 500, { error: 'the demo walk-through could not complete', refused });
      }
      for (const [extId, reason] of [['ig_msg_0005', 'Not a prospective student']]) {
        const row = await db.prepare('SELECT id FROM inbound WHERE external_id = ?').get(extId);
        if (row) await archive(db, row.id, { reason, by: 'Tetiana' });
      }
      // one person carried the whole way, so the funnel has an end as well as a start
      const hot = await db.prepare("SELECT id FROM people WHERE qualification = 'lead' ORDER BY id LIMIT 1").get();
      if (hot) {
        for (const st of [CONFIG.stageRoles.application, 'Contract', CONFIG.stageRoles.admitted]) {
          const before = (await db.prepare('SELECT status FROM people WHERE id = ?').get(hot.id)).status;
          await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(st, hot.id);
          await logEvent(db, { personId: hot.id, kind: 'status', direction: 'note', at: nowIso(),
            origin: MANUAL, actor: 'Ieva', subject: `Status: ${before} -> ${st}`,
            body: 'moved by Admissions', field: 'status', oldValue: before, newValue: st });
        }
        await db.prepare('UPDATE people SET admitted_at = ? WHERE id = ?').run(nowIso(), hot.id);
        await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
          .run(hot.id, 'Collect the medical certificate',
            new Date(Date.now() - 2 * 86400000).toISOString(), 'Admissions', nowIso());
      }
      const warm = await db.prepare("SELECT id FROM people WHERE qualification = 'unclear' ORDER BY id LIMIT 1").get();
      if (warm) await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
        .run(warm.id, 'Send the programme description', new Date(Date.now() + 86400000).toISOString(),
          'Marketing', nowIso());
      // so the badge still tells the truth after a reload
      DATASET = { dataset: 'demo', people: (await db.prepare('SELECT COUNT(*) n FROM people').get()).n,
        selection: 'the deterministic V1 walk-through: channels, intake, qualification, one admission' };
      return json(res, 200, { ok: true,
        people: DATASET.people,
        inbound: (await db.prepare('SELECT COUNT(*) n FROM inbound').get()).n,
        qualified: out.length });
    }

    // THE APPLICATION FAST PATH (30.09.2026, src/sync.js receiveSisApplication). A public URL: the
    // header x-crm-application-secret must equal SIS_APPLICATION_SECRET, set in Vercel by Ritvars.
    // No value configured refuses everything. The secret is never echoed, logged or stored.
    if (req.method === 'POST' && p === '/api/intake/application') {
      const want = Buffer.from(String(process.env.SIS_APPLICATION_SECRET || ''));
      const got = Buffer.from(String(req.headers['x-crm-application-secret'] || ''));
      if (!want.length || want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
        return json(res, 401, { error: 'this application was not accepted' });
      }
      const r = await receiveSisApplication(db, await body(req));
      if (!r.ok) return json(res, r.status, { error: r.error });
      return json(res, 200, r);
    }

    // "Same person as..." on a person the SIS created (30.09.2026, src/sync.js mergeSisDuplicate).
    if (req.method === 'POST' && /^\/api\/people\/[^/]+\/merge-into$/.test(p)) {
      const b = await body(req);
      const r = await mergeSisDuplicate(db, p.split('/')[3], b.targetId, { by: await actorOf(req, b) });
      if (!r.ok) return json(res, r.error === 'not found' ? 404 : 400, { error: r.error });
      return json(res, 200, r);
    }

    // ------------------------------------------------- Gmail option B (01.10.2026) --
    // "Sign in once as edu@ and approve read-only access" (Ritvars chose B, 01.10.2026).
    // An admin asks for a link (48 hours). Whoever holds edu@'s password opens it, signs in
    // as edu@ and approves gmail.readonly; that person needs no Intake account. Google comes
    // back to the sign-in address it already knows (GOOGLE_REDIRECT_URI), so nothing has to
    // be registered in Google Cloud. Only edu@novikontas.org is ever kept. The refresh token
    // is stored encrypted (lib/gmail.js); nothing secret goes in a URL, a reply or a log.
    if (req.method === 'GET' && p === '/api/admin/gmail/status') {
      if (!(await adminOf(req))) return refuseNotAdmin(res);
      return json(res, 200, await gmailStatus());
    }
    // GET, so an admin can simply open it while signed in; a page shows the link to pass on.
    if (req.method === 'GET' && p === '/api/admin/gmail/link') {
      if (!(await adminOf(req))) return refuseNotAdmin(res);
      if (!process.env.CRM_SESSION_SECRET) return json(res, 503, { error: 'CRM_SESSION_SECRET is not set' });
      const c = gmailB.oauthClient(process.env);
      if (!c.ok || !process.env.GOOGLE_REDIRECT_URI) {
        return json(res, 503, { error: c.ok ? 'GOOGLE_REDIRECT_URI is not set' : c.why });
      }
      const exp = Date.now() + GMAIL_INVITE_HOURS * 3600 * 1000;
      const invite = signFlow({ purpose: 'gmail-invite', exp }, process.env.CRM_SESSION_SECRET);
      const link = `${originOf(req)}/api/auth/gmail/connect?invite=${invite}`;
      if (url.searchParams.get('format') === 'json') {
        return json(res, 200, { mailbox: gmailB.MAILBOX, link, expires: new Date(exp).toISOString() });
      }
      const until = new Date(exp).toLocaleString('en-GB', { timeZone: 'Europe/Riga', dateStyle: 'medium', timeStyle: 'short' });
      return gmailPage(res, 200, true, `Link for ${gmailB.MAILBOX}, valid until ${until} (Riga):<br><br>`
        + `<input readonly style="width:100%;font:14px monospace;padding:8px" onclick="this.select()" value="${link}">`, 'Gmail link');
    }
    // GET /api/admin/notify/connect - opened once, signed in as an admin, to let Intake email new
    // feedback from ritvars.vilcins@novikontas.org (04.10.2026). Google asks to Allow "send email".
    if (req.method === 'GET' && p === '/api/admin/notify/connect') {
      if (!(await adminOf(req))) return refuseNotAdmin(res);
      if (!process.env.CRM_SESSION_SECRET || !process.env.GOOGLE_REDIRECT_URI) return gmailPage(res, 503, false, 'Email cannot be connected on this copy yet.');
      const state = crypto.randomBytes(24).toString('base64url');
      const flow = signFlow({ state, purpose: 'notify', exp: Date.now() + FLOW_MINUTES * 60 * 1000 }, process.env.CRM_SESSION_SECRET);
      const to = notify.consentUrl({ env: process.env, state, redirectUri: process.env.GOOGLE_REDIRECT_URI });
      if (!to) return gmailPage(res, 503, false, 'The Google client is not set on this copy.');
      res.writeHead(302, { location: to, 'cache-control': 'no-store', 'set-cookie': flowCookie(flow, FLOW_MINUTES) });
      return res.end();
    }
    // The email filter over what already waits in the Inbox (popup A, 01.10.2026). Admins only.
    // Q31: the widened filter over every channel's waiting rows. GET says what it WOULD move and moves
    // nothing; POST with {"apply": true} moves them. On production only on the owner's yes.
    if (p === '/api/admin/inbox/refilter' && (req.method === 'GET' || req.method === 'POST')) {
      if (!(await adminOf(req))) return refuseNotAdmin(res);
      const b = req.method === 'POST' ? await body(req) : {};
      return json(res, 200, { ok: true, ...(await refilterOpen(db, { apply: req.method === 'POST' && b.apply === true })) });
    }
    // Retired 05.10.2026 (Q31): it moved rows without saying first what it would move.
    if (req.method === 'POST' && p === '/api/admin/gmail/refilter') {
      return json(res, 410, { error: 'retired: it moved rows without a preview',
        use: 'GET /api/admin/inbox/refilter to see what would move, then POST it with {"apply": true}' });
    }
    if (req.method === 'POST' && p === '/api/admin/gmail/disconnect') {
      if (!(await adminOf(req))) return refuseNotAdmin(res);
      await gmailB.forgetGmailRefreshToken(db);
      return json(res, 200, { ok: true, ...(await gmailStatus()) });
    }

    if (req.method === 'POST' && p === '/api/intake/receive') {
      const b = await body(req);
      if (!b.channel) return json(res, 400, { error: 'channel is required' });
      return json(res, 200, await receive(db, { ...b, source: b.source || 'manual' }));
    }

    if (req.method === 'POST' && /^\/api\/intake\/\d+\/qualify$/.test(p)) {
      const id = Number(p.split('/')[3]);
      const b = await body(req);
      const r = await qualify(db, id, { ...b, by: await actorOf(req, b) });
      if (r.error) return json(res, 400, r);
      // Aigars's complaint was "I do two steps and nothing happens": the row
      // vanished and nothing said where the person went. The answer to that is
      // not another screen, it is telling the caller the outcome, so the Inbox
      // can say it. Additive only - intake.qualify() is untouched.
      if (r.personId) {
        const person = await db.prepare(`SELECT id, name, status, owner, programme FROM people WHERE id = ?`).get(r.personId);
        const task = await db.prepare(`SELECT label, due_at FROM tasks
          WHERE person_id = ? AND done_at IS NULL ORDER BY due_at LIMIT 1`).get(r.personId);
        r.landed = person ? { ...person, next: task ? task.label : null,
          dueAt: task ? task.due_at : null } : null;
      }
      return json(res, 200, r);
    }

    if (req.method === 'POST' && /^\/api\/intake\/\d+\/archive$/.test(p)) {
      const id = Number(p.split('/')[3]);
      const b = await body(req);
      const r = await archive(db, id, { ...b, by: await actorOf(req, b) });
      if (r.error) return json(res, 400, r);
      const row = await db.prepare('SELECT contact_name, contact_handle FROM inbound WHERE id = ?').get(id);
      r.landed = { archived: true, who: row ? (row.contact_name || row.contact_handle || 'it') : 'it',
        reason: b.reason || null };
      return json(res, 200, r);
    }

    // Notifications, in the only shape that works without a login: what is
    // waiting for the person you are acting as. An admin is not notified - they
    // are shown who has what waiting, which is the question they actually ask.
    if (req.method === 'GET' && p === '/api/waiting') {
      const who = await viewerOf(req, url);
      const role = roleOf(who);
      if (isAdmin(who)) {
        return json(res, 200, { actor: who, isAdmin: true, byRole: await waitingByRole(db),
          note: 'An admin sees every queue. Nothing is addressed to them personally.' });
      }
      return json(res, 200, {
        actor: who, isAdmin: false, role,
        mine: role ? await waitingFor(db, role) : { role: null, intake: 0, leads: 0, overdue: 0, aged: 0, total: 0 },
        note: 'You are shown what is routed to your role. A contact nobody can read yet never reaches Admissions.',
      });
    }

    // ------------------------------------------------------------ exports ---
    // The same report, four ways out. Nothing here is a new number: every row
    // comes from the funnel the screen shows.
    if (req.method === 'GET' && /^\/api\/export\/funnel\.(csv|xlsx|pdf|gsheet)$/.test(p)) {
      const fmt = p.split('.').pop();
      const f = await funnel(db);
      const rows = [
        ['Section', 'Item', 'Count'],
        ...f.steps.map((x) => ['Funnel', x.step, x.count]),
        ...f.byStage.map((x) => ['Stage', x.stage, x.people]),
        ...f.byStage.map((x) => ['Stage without a next step', x.stage, x.stuck]),
        ...f.byChannel.map((x) => ['Channel contacts', channelLabel(x.channel), x.contacts]),
        ...f.byChannel.map((x) => ['Channel leads', channelLabel(x.channel), x.leads]),
        ...f.dropOut.map((x) => ['Why people left', x.reason, x.n]),
        ['Attention', 'Waiting since yesterday', f.agedInbound],
        ['Attention', 'Overdue actions', f.overdueActions],
        ['Attention', 'Active with no next step', f.noNextAction],
        ['Filtered', 'Obvious sales pitches never shown', f.filtered],
      ];
      const stamp = localDate();
      const csv = rows.map((r) => r.map((c) => {
        const v = String(c ?? '');
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',')).join('\r\n');

      if (fmt === 'csv' || fmt === 'gsheet') {
        // Google Sheets imports a CSV directly, so the honest answer for
        // "Google Sheets" in a local prototype is the same file it would import.
        res.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="academy-crm-report-${stamp}.csv"`,
        });
        return res.end('\uFEFF' + csv);
      }
      if (fmt === 'xlsx') {
        // A real workbook: src/xlsx.js writes the zip the format needs.
        res.writeHead(200, { 'content-type': XLSX_TYPE,
          'content-disposition': `attachment; filename="academy-crm-report-${stamp}.xlsx"` });
        return res.end(rowsToXlsx(rows, { bold: [0], sheetName: 'Funnel', title: 'Intake funnel' }));
      }
      // PDF: a minimal single-page document written by hand, no library.
      const lines = rows.map((r) => `${r[0]} | ${r[1]} | ${r[2]}`);
      return res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="academy-crm-report-${stamp}.pdf"`,
      }), res.end(simplePdf(`Intake report ${stamp}`, lines));
    }

    if (req.method === 'GET' && p === '/api/funnel') {
      return json(res, 200, await funnel(db));
    }

    if (req.method === 'POST' && /^\/api\/people\/[^/]+\/sis$/.test(p)) {
      const id = p.split('/')[3];
      const b = await body(req);
      const r = await handoffToSis(db, id, await actorOf(req, b));
      return r.error ? json(res, 400, r) : json(res, 200, r);
    }

    // ----------------------------------------------------------- history ---
    // Backlog 10, 11, 12: one log, both origins, admins only.
    if (req.method === 'GET' && p === '/api/whoami') {
      // NEVER fall back to the first name in the config. With sign-in on and
      // nobody signed in, this route reported the caller as "Ieva" - an identity
      // nobody had proved, on the one route whose whole job is to say who you are.
      const who = AUTH_ON ? ((await currentUser(req)) || {}).name || '' : (await viewerOf(req, url) || USER_NAMES[0] || '');
      return json(res, 200, {
        actor: who, role: roleOf(who), isAdmin: isAdmin(who), known: isKnownPerson(who),
        users: USERS, admins: ADMINS, roles: CONFIG.owners || [],
        authentication: false,
        roleIsNotAPerson: 'The owner of a record is a ROLE (Admissions). The actor on a history entry is a PERSON (Ieva). A real login has to identify the person.',
        honesty: CONFIG.historyHonesty || 'There is no login in this prototype. Who you are is a setting, not a check.',
      });
    }

    if (req.method === 'GET' && p === '/api/history') {
      const who = url.searchParams.get('as') || req.headers['x-acting-as'] || '';
      if (!who) {
        return json(res, 400, { error: 'Nobody is selected in "Acting as".' });
      }
      // Decided 23.09.2026: an admin sees the whole log. Anybody else sees the
      // history of their own actions and nothing else.
      const admin = isAdmin(who);
      const all = readsAllHistory(who);
      const scope = all ? '' : who;
      return json(res, 200, {
        actor: who, isAdmin: admin,
        scope: all ? 'everything' : 'own actions only',
        scopeNote: admin
          ? 'You are an admin, so the whole log is shown: every person, both origins.'
          : all ? 'Admissions sees the whole log: every person, both origins.'
          : 'You are not an admin, so this is the history of your own actions. Everything else in the log is admin-only.',
        roleWarning: all ? null
          : 'Identity is a setting, not a login: this shows everything recorded under the name "' + who + '". Nothing stops somebody else picking that name in the sidebar.',
        admins: ADMINS,
        honesty: CONFIG.historyHonesty || '',
        ...(await readHistory(db, {
          origin: url.searchParams.get('origin') || '',
          kind: url.searchParams.get('kind') || '',
          personId: url.searchParams.get('personId') || '',
          actor: scope,
          limit: Number(url.searchParams.get('limit') || 200),
        })),
      });
    }

    // ------------------------------------------------------------- tasks ---
    if (req.method === 'GET' && p === '/api/tasks') {
      const scope = url.searchParams.get('scope') || 'open';
      // STILL_OPEN_SQL here too (Ieva 30.09 10:23: "I changed the status, but he still shows under
      // Next Steps as overdue"). A step added AFTER the admission slips past the close-on-status
      // rule; a finished person's leftover is on their own page under "Still open", never in a list.
      let sql = `SELECT t.*, pe.name, pe.programme, pe.status, pe.phone, pe.source_channel FROM tasks t JOIN people pe ON pe.id = t.person_id WHERE t.done_at IS NULL AND ${STILL_OPEN_SQL}`;
      const args = [];
      if (scope === 'overdue') { sql += ' AND t.due_at < ?'; args.push(dayStart()); }
      if (scope === 'today') { sql += ' AND t.due_at >= ? AND t.due_at < ?'; args.push(dayStart(), dayEnd()); }
      if (scope === 'week') { sql += ' AND t.due_at < ?'; args.push(new Date(Date.now() + 7 * 86400000).toISOString()); }
      sql += ' ORDER BY t.due_at ASC';
      return json(res, 200, await db.prepare(sql).all(...args));
    }

    if (req.method === 'POST' && /^\/api\/tasks\/\d+\/complete$/.test(p)) {
      const id = Number(p.split('/')[3]);
      const b = await body(req);
      const t = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (!t) return json(res, 404, { error: 'not found' });
      // A person is never left without a next step: closing one requires the next.
      const person = await db.prepare('SELECT status FROM people WHERE id = ?').get(t.person_id);
      const closed = ['Admitted', 'Not proceeding'].includes(person && person.status);
      if (CONFIG.nextActionRequired && !closed && !b.nextLabel) {
        return json(res, 400, { error: 'The next step is required: every open person must keep one.' });
      }
      const now = nowIso();
      await db.prepare('UPDATE tasks SET done_at = ?, outcome = ? WHERE id = ?').run(now, b.outcome || 'Done', id);
      await logEvent(db, { personId: t.person_id, kind: 'task', channel: 'phone', direction: 'note', at: now,
        origin: MANUAL, actor: await actorOf(req, b) || t.owner,
        subject: `${t.label}: ${b.outcome || 'done'}`, body: b.note || '' });
      await db.prepare('UPDATE people SET last_contact_at = ? WHERE id = ?').run(now, t.person_id);
      // the step that was just completed decides the stage
      const moved = await advanceStatus(t.person_id, t.label, now);
      // If that step finished them, no next step is planned even when one was sent. Otherwise the
      // last step of the journey would immediately open another one, which is exactly what Ieva
      // hit: "changing the last task in Still open leaves it open" (IEVA-4).
      const after = await db.prepare('SELECT status FROM people WHERE id = ?').get(t.person_id);
      if (b.nextLabel && !isFinished(after && after.status)) {
        const due = b.nextDate ? new Date(b.nextDate + 'T09:00:00.000Z').toISOString() : new Date(Date.now() + 3 * 86400000).toISOString();
        await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)').run(t.person_id, b.nextLabel, due, t.owner, now);
      }
      return json(res, 200, { ok: true, moved, person: await personRow(t.person_id, await actorOf(req, b)) });
    }

    if (req.method === 'POST' && /^\/api\/tasks\/\d+\/reschedule$/.test(p)) {
      const id = Number(p.split('/')[3]);
      const b = await body(req);
      const due = b.due ? new Date(b.due + 'T09:00:00.000Z').toISOString() : new Date(Date.now() + 86400000).toISOString();
      await db.prepare('UPDATE tasks SET due_at = ? WHERE id = ?').run(due, id);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && /^\/api\/people\/[^/]+\/task$/.test(p)) {
      const id = p.split('/')[3];
      const b = await body(req);
      const due = b.due ? new Date(b.due + 'T09:00:00.000Z').toISOString() : new Date(Date.now() + 86400000).toISOString();
      await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
        .run(id, b.label || 'Get in touch', due, b.owner || 'Admissions', nowIso());
      return json(res, 200, await personRow(id, await actorOf(req, b)));
    }

    // ------------------------------------------------------------ intake ---
    if (req.method === 'GET' && p === '/api/intake') {
      const rows = await db.prepare(`SELECT e.*, pe.name, pe.status, pe.source_channel AS person_source FROM events e JOIN people pe ON pe.id = e.person_id
        WHERE e.kind = 'channel' ORDER BY e.occurred_at DESC LIMIT 60`).all();
      const byChannel = await db.prepare(`SELECT source_channel channel, COUNT(*) n,
        SUM(CASE WHEN status = 'Admitted' THEN 1 ELSE 0 END) admitted FROM people GROUP BY source_channel ORDER BY n DESC`).all();
      return json(res, 200, { rows, byChannel });
    }

    // ---------------------------------------------------------- open days --
    if (req.method === 'GET' && p === '/api/opendays') {
      const days = await db.prepare('SELECT * FROM open_days ORDER BY held_on DESC').all();
      for (const d of days) {
        d.registrations = await db.prepare(`SELECT r.*, pe.name, pe.status, pe.programme FROM registrations r JOIN people pe ON pe.id = r.person_id
          WHERE r.open_day_id = ? ORDER BY r.slot`).all(d.id);
        d.came = d.registrations.filter((r) => r.attended === 1).length;
        d.applied = d.registrations.filter((r) => ['Application', 'Contract', 'Admitted'].includes(r.status)).length;
      }
      return json(res, 200, days);
    }

    if (req.method === 'POST' && /^\/api\/registrations\/\d+\/attendance$/.test(p)) {
      const id = Number(p.split('/')[3]);
      const b = await body(req);
      await db.prepare('UPDATE registrations SET attended = ? WHERE id = ?').run(b.attended ? 1 : 0, id);
      const r = await db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
      const now = nowIso();
      await logEvent(db, { personId: r.person_id, kind: 'note', channel: 'event', direction: 'note', at: now,
        origin: MANUAL, actor: await actorOf(req, b),
        subject: b.attended ? 'Attended the visit' : 'Did not attend',
        body: 'marked by hand on the open day list' });
      if (b.attended) await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
        .run(r.person_id, 'Follow up after the visit', new Date(Date.now() + 2 * 86400000).toISOString(), 'Admissions', now);
      return json(res, 200, { ok: true });
    }

    // ----------------------------------------------------------- reports ---
    if (req.method === 'GET' && p === '/api/reports') {
      const byStage = await db.prepare('SELECT status, COUNT(*) n FROM people GROUP BY status').all();
      const bySource = await db.prepare(`SELECT source_channel channel, COUNT(*) n,
        SUM(CASE WHEN status='Admitted' THEN 1 ELSE 0 END) admitted FROM people GROUP BY source_channel ORDER BY n DESC`).all();
      const byProgramme = await db.prepare('SELECT programme, COUNT(*) n FROM people GROUP BY programme ORDER BY n DESC').all();
      const durations = (await db.prepare(`SELECT education, programme, created_at, contract_at FROM people WHERE contract_at IS NOT NULL`).all())
        .map((r) => ({ ...r, days: Math.round((Date.parse(r.contract_at) - Date.parse(r.created_at)) / 86400000) }))
        // an unknown first-contact date has no duration, rather than a nonsense one
        .filter((r) => Number.isFinite(r.days));
      const med = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
      const groups = {};
      for (const d of durations) {
        const key = d.education === 'Other' ? 'International / other' : d.education;
        (groups[key] ||= []).push(d.days);
      }
      return json(res, 200, {
        byStage, bySource, byProgramme,
        total: (await db.prepare('SELECT COUNT(*) n FROM people').get()).n,
        openTasks: (await db.prepare('SELECT COUNT(*) n FROM tasks WHERE done_at IS NULL').get()).n,
        overdueTasks: (await db.prepare('SELECT COUNT(*) n FROM tasks WHERE done_at IS NULL AND due_at < ?').get(dayStart())).n,
        timeToContract: Object.entries(groups).map(([k, v]) => ({ group: k, n: v.length, median: med(v) })).sort((a, b) => b.n - a.n),
      });
    }

    // ------------------------------------------------------ inbound channels -
    //
    // One endpoint shape for every channel that can send us something:
    //
    //   POST /api/inbound/<channel>
    //
    // verify -> adapt -> normalised event -> the same queue a simulated event
    // uses. There is no shortcut into CAR anywhere, so what is tested locally is
    // the path a real provider will take.
    //
    // NOTHING here is live. A channel only accepts a payload when its mode is
    // 'test' or 'live', and no mode is set in this repository.
    // The handshake. A provider asks whether we are really here BEFORE it ever
    // sends a message, and will not save the subscription until we answer
    // correctly. Meta wants its exact hub.challenge back as plain text;
    // Mailchimp just wants the GET to succeed. This route did not exist until
    // 24.09.2026, which made connecting Facebook impossible - it never got as
    // far as a message.
    // `events` is a route, not a channel, so the pattern alone is not enough:
    // it swallowed GET /api/inbound/events and the observability view went blank.
    if (req.method === 'GET' && /^\/api\/inbound\/[a-z_]+$/.test(p)
        && channelDef(p.split('/')[3])) {
      const channel = p.split('/')[3];
      const h = handshake(channel, url, process.env);
      if (h.ok) {
        if (h.record !== false) await db.prepare(`INSERT INTO channel_handshake (channel, verified_at, how, remote)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(channel) DO UPDATE SET verified_at = excluded.verified_at,
                      how = excluded.how, remote = excluded.remote`)
          .run(channel, new Date().toISOString(), h.how,
               String(req.headers['user-agent'] || '').slice(0, 200) || null);
        res.writeHead(h.status, { 'Content-Type': h.contentType || 'text/plain' });
        return res.end(h.body == null ? '' : String(h.body));
      }
      return json(res, h.status, { error: 'the handshake was not accepted', why: h.how,
        missingSecret: Boolean(h.missingSecret) });
    }

    if (req.method === 'POST' && /^\/api\/inbound\/[a-z_]+$/.test(p)) {
      const channel = p.split('/')[3];
      const def = channelDef(channel);
      if (!def || !hasAdapter(channel)) return json(res, 404, { error: 'no adapter for ' + channel });

      // The Channels screen's switch (channel_mode table) first, the Vercel setting second: the same
      // rule the pollers use. Reading only the environment meant a switch reached one instance only.
      const mode = await channelMode(db, channel);
      // The x-crm-simulated header counts ONLY on a copy without sign-in (local and the
      // tests) or for a signed-in admin. It used to count for anybody, and this route is
      // open before sign-in, so on the hosted copy anyone could skip the signature check
      // and the off switch and put a lead into New Leads (found 28.09.2026). Anybody else
      // takes the real path: off answers 409, on needs the provider's own signature.
      const simulated = req.headers['x-crm-simulated'] === '1' && (!AUTH_ON || Boolean(await adminOf(req)));
      if (mode === 'off' && !simulated) {
        return json(res, 409, { error: `the ${channel} channel is off`,
          how: 'set CHANNEL_MODE_' + channel.toUpperCase() + ' to test or live, or send a simulated event' });
      }

      const rawBody = await rawText(req, 3 * 1024 * 1024);
      // A simulated event is never signature-checked, and says so in the record.
      const check = simulated
        ? { ok: true, how: 'simulated locally, not signature checked' }
        : verifyRequest(channel, req, { secret: def.secretEnv ? process.env[def.secretEnv] : null, rawBody, url });
      if (!check.ok) {
        recordInbound(channel, null, 'refused', check.how);
        return json(res, 401, { error: 'this event was not accepted', why: check.how,
          missingSecret: Boolean(check.missingSecret) });
      }

      // Not every provider sends JSON. Mailchimp only ever sends form-encoded,
      // and Gmail arrives inside a Pub/Sub envelope.
      const read = parseInboundBody(channel, req.headers['content-type'], rawBody);
      if (!read.ok) {
        recordInbound(channel, null, 'error', read.how);
        return json(res, 400, { error: read.how });
      }
      const payload = read.payload;
      // The website form secret may come as a form field (Tilda's API key); it is never stored.
      if (channel === 'website') delete payload.crm_secret;
      // Tilda checks a new webhook with test=test and wants "ok" back; nothing is stored.
      const tilda = channel === 'website' && (payload.tranid != null || payload.test === 'test');
      if (tilda && payload.test === 'test' && payload.tranid == null) {
        recordInbound(channel, null, 'handshake', 'Tilda test request');
        res.writeHead(200, { 'content-type': 'text/plain' });
        return res.end('ok');
      }

      // An agent lead is attributed to the partner whose token was VERIFIED. A payload that
      // names a different partner is refused rather than believed (28.09.2026).
      if (check.partner) {
        if (payload.partner_id != null && String(payload.partner_id) !== check.partner.id) {
          recordInbound(channel, null, 'refused', 'payload partner does not match the token');
          return json(res, 401, { error: 'this event was not accepted', why: 'the payload names a different partner than the token' });
        }
        payload.partner_id = check.partner.id;
      }

      try {
        // EVERY message in the delivery, not the first. Meta can put several entries in
        // one envelope, several changes in an entry, several messaging events in a
        // change, and WhatsApp several messages in one value; all of those used to be
        // read as [0] and the rest dropped, with a 200 going back to the provider.
        const evs = adaptAll(channel, payload);
        const done = [];
        for (const ev of evs) {
          if (ev.attribution && channel === 'agent') ev.attribution = { ...ev.attribution, verified: Boolean(check.partner) };
          // Idempotency: await receive() returns {duplicate:true} when it has already
          // seen this channel + external id. A provider retry is normal.
          // Mailchimp is activity about somebody, never an enquiry (config mailchimp._note,
          // 24.09.2026: "a newsletter subscriber is not a lead"; routed so on 01.10.2026). It is
          // kept, set aside with that reason, and goes on the person's timeline when we know them.
          const mc = channel === 'mailchimp';
          const r = await receive(db, { ...toIntake(ev), source: simulated ? 'simulated' : 'provider',
            ...(mc ? { filterWhy: 'Mailchimp audience activity: a newsletter subscriber is not a lead' } : {}) });
          if (mc && !r.duplicate && ev.senderEmail) {
            const known = [...new Set((await matchPeople(db, { email: ev.senderEmail })).filter(isStrongMatch).map((m) => m.id))];
            if (known.length === 1) {
              await logEvent(db, { personId: known[0], kind: 'channel', channel: 'mailchimp', direction: 'in',
                at: ev.receivedAt, origin: AUTOMATIC, actor: 'Mailchimp', subject: `Mailchimp: ${ev.messageSubject || 'event'}`,
                body: ev.senderEmail });
            }
          }
          // C2 + C7: a Meta or LinkedIn lead carries ids only; its answers are fetched now, and by
          // the daily retry if that fails. The lead is already stored either way.
          if (!r.duplicate && r.id) {
            try { await queueLeadAnswers(db, ev); } catch { /* the retry picks it up */ }
          }
          // C4: the same booking again may carry attendance; that is news, not a repeat.
          let attendance = false;
          if (channel === 'open_day' && r.id) {
            attendance = await stampOpenDay(db, r.id, { slot: ev.raw._slot, attended: ev.raw._attended });
            if (attendance) await registerOpenDay(db, r.id);
          }
          recordInbound(channel, ev.externalEventId, r.duplicate ? 'duplicate' : r.filtered ? 'filtered' : 'queued', check.how);
          done.push({ externalEventId: ev.externalEventId, inboundId: r.id,
            outcome: r.duplicate && attendance ? 'attendance recorded'
              : r.duplicate ? 'already had it' : r.filtered ? 'filtered out before the queue' : 'waiting to be looked at' });
        }
        const first = done[0];
        // Tilda reads only the word "ok" and retries otherwise (help.tilda.cc/formswebhook).
        if (tilda) { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
        return json(res, 200, { ok: true, channel, externalEventId: first.externalEventId,
          outcome: first.outcome, inboundId: first.id ?? first.inboundId,
          messages: done.length, all: done, verified: check.how, read: read.as });
      } catch (err) {
        recordInbound(channel, null, 'error', err.message);
        if (err instanceof BadInbound) return json(res, 400, { error: err.message, detail: err.detail });
        throw err;
      }
    }

    // A local test event. It goes through the SAME adapter, the same filter and
    // the same queue a real provider event will, so what is tested here is the
    // real path and not a shortcut into CAR.
    if (req.method === 'POST' && /^\/api\/inbound\/[a-z_]+\/simulate$/.test(p)) {
      const channel = p.split('/')[3];
      if (!hasAdapter(channel)) return json(res, 404, { error: 'no adapter for ' + channel });
      const b = await body(req);
      const raw = b.payload || fixtureFor(channel, { sameId: b.sameId === true });
      if (!raw) return json(res, 404, { error: 'no fixture for ' + channel });
      try {
        const ev = adapt(channel, raw);
        const r = await receive(db, { ...toIntake(ev), source: 'simulated' });
        recordInbound(channel, ev.externalEventId,
          r.duplicate ? 'duplicate' : r.filtered ? 'filtered' : 'queued', 'simulated locally');
        return json(res, 200, { ok: true, channel, externalEventId: ev.externalEventId,
          outcome: r.duplicate ? 'already had it' : r.filtered ? 'filtered out before the queue'
            : 'waiting to be looked at',
          inboundId: r.id, verified: 'simulated locally, not signature checked' });
      } catch (err) {
        recordInbound(channel, null, 'error', err.message);
        if (err instanceof BadInbound) return json(res, 400, { error: err.message, detail: err.detail });
        throw err;
      }
    }

    // The KPI report. One period, chosen by whoever is running the meeting.
    if (req.method === 'GET' && p === '/api/report') {
      return json(res, 200, await buildReport(db, {
        from: url.searchParams.get('from'), to: url.searchParams.get('to') }));
    }

    if (req.method === 'GET' && p === '/api/report/sections') {
      return json(res, 200, { sections: EXPORT_SECTIONS, defaults: DEFAULT_SECTIONS });
    }

    if (req.method === 'GET' && p === '/api/report.csv') {
      const rows = await reportRows(db, reportParams(url));
      const csv = rows.map((r) => (r || []).map((c) =>
        `"${String(c === undefined || c === null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const stamp = localDate();
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="academy-crm-kpi-${stamp}.csv"` });
      return res.end('\ufeff' + csv);
    }

    // The same rows as the CSV, as a real Excel workbook.
    if (req.method === 'GET' && p === '/api/report.xlsx') {
      const rows = await reportRows(db, reportParams(url));
      const file = rowsToXlsx(rows, { bold: boldRowsOf(rows), sheetName: 'Report', title: 'Intake report' });
      res.writeHead(200, { 'content-type': XLSX_TYPE, 'cache-control': 'no-store',
        'content-disposition': `attachment; filename="academy-crm-kpi-${localDate()}.xlsx"` });
      return res.end(file);
    }

    // The same rows again, as a Google Sheet in the signed-in person's own Drive. This
    // starts a Google consent for drive.file (only files the CRM creates) and comes
    // back through the ONE registered callback, which knows this flow by its purpose.
    if (req.method === 'GET' && p === '/api/report.gsheet') {
      const me = await currentUser(req);
      if (!AUTH_ON || !me) return json(res, 400, { error: 'Google Sheets needs Google sign-in, which is not on for this copy.' });
      const cfg = google.googleConfigured(process.env);
      if (!cfg.ok) return json(res, 503, { error: 'google_not_configured', missing: cfg.missing });
      const state = crypto.randomBytes(24).toString('base64url');
      const nonce = crypto.randomBytes(24).toString('base64url');
      const flow = signFlow({ state, nonce, purpose: 'sheet', uid: me.id, want: reportParams(url),
        exp: Date.now() + FLOW_MINUTES * 60 * 1000 }, process.env.CRM_SESSION_SECRET);
      const to = new URL(google.GOOGLE_AUTH_URL);
      to.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
      to.searchParams.set('redirect_uri', process.env.GOOGLE_REDIRECT_URI);
      to.searchParams.set('response_type', 'code');
      to.searchParams.set('scope', sheets.SHEETS_SCOPE);
      to.searchParams.set('state', state);
      to.searchParams.set('nonce', nonce);
      to.searchParams.set('hd', google.HOSTED_DOMAIN);
      to.searchParams.set('login_hint', me.email);
      to.searchParams.set('include_granted_scopes', 'true');
      res.writeHead(302, { location: to.toString(), 'cache-control': 'no-store',
        'set-cookie': flowCookie(flow, FLOW_MINUTES) });
      return res.end();
    }

    // ------------------------------------------------- real and demo state -
    if (req.method === 'GET' && p === '/api/console/state') {
      return json(res, 200, { ...(await modeState()), dataset: DATASET, realAvailable: hasRealData() });
    }

    // Switching to demo, resetting demo, and restoring real data are all
    // destructive, so each one requires the caller to say what it is doing.
    // A typo in a fetch must not be able to wipe the real database.
    if (req.method === 'POST' && p === '/api/console/mode') {
      // With sign-in on this copy holds REAL people (decided 27.09.2026), and the file they
      // came from never leaves the PC - so a wipe here cannot be undone from the server.
      // Only an admin may replace the database.
      if (AUTH_ON && !(await adminOf(req)))
        return json(res, 403, { error: 'replacing the database is for admins only' });
      const b = await body(req);
      const want = String(b.mode || '');
      if (b.confirm !== 'yes') {
        return json(res, 428, { error: 'this replaces everything in the database',
          needsConfirm: true, mode: want, currently: await modeState() });
      }

      if (want === 'demo') {
        // never overwrite the real snapshot on the way in
        await clearAll();
        const info = await buildDemo(db, CONFIG);
        setMode('demo');
        DATASET = { dataset: 'demo', people: info.total,
          selection: 'a deliberately small demo environment, built through the real inbound path' };
        return json(res, 200, { ok: true, ...(await modeState()), built: info });
      }

      if (want === 'real') {
        if (!snapshot.exists()) {
          if (!hasRealData()) return json(res, 409, { error: 'there is no real data on this machine' });
          const info = await loadDataset('real');
          return json(res, 200, { ok: true, ...(await modeState()), loaded: info, from: 'source file' });
        }
        const r = await snapshot.restore(db);
        if (r.error) return json(res, 500, { error: r.error });
        setMode('real');
        DATASET = { dataset: 'real', people: r.counts.people,
          selection: 'restored from the clean snapshot taken when the real database was loaded' };
        return json(res, 200, { ok: true, ...(await modeState()), restored: r, from: 'snapshot' });
      }

      if (want === 'empty') {
        await clearAll();
        setMode('empty');
        DATASET = { dataset: 'empty', people: 0, selection: 'an empty database' };
        return json(res, 200, { ok: true, ...(await modeState()) });
      }

      return json(res, 400, { error: 'mode must be real, demo or empty' });
    }

    // ---------------------------------------------------------- the console -
    // Our control room. Everything here drives the REAL path: a payload is built
    // in the provider's shape, handed to the adapter, filtered, and lands in the
    // Inbox. Nothing writes to a table directly, because a demo that fakes the
    // end state proves nothing about the product.
    if (req.method === 'GET' && p === '/api/console/scenarios') {
      return json(res, 200, {
        channels: channelIds(),
        channelLabels: CHANNEL_LABELS,
        metaGroup: META_GROUP,
        scenarios: allScenarios(),
      });
    }

    // DEV CONTROL: one simulated call, event by event, through the same receivePhoneEvent the
    // webhook uses (Q6). A number we already have, or a new one; the same call id for its three
    // events, and the same event again is a retry.
    if (req.method === 'POST' && p === '/api/console/phone-event') {
      const b = await body(req);
      const event = String(b.event || 'ringing');
      let caller = '+3712' + String(Math.floor(1000000 + Math.random() * 8999999));
      if (b.person === 'existing') {
        const p0 = await db.prepare(`SELECT phone FROM people WHERE phone IS NOT NULL ORDER BY created_at DESC LIMIT 1`).get();
        if (!p0) return json(res, 409, { error: 'there is nobody with a phone number yet', how: 'load some demo data first' });
        caller = p0.phone;
      } else if (b.caller) caller = String(b.caller);
      const callId = String(b.callId || ('sim-' + Date.now().toString(36)));
      const payload = { call_id: callId, event, at: new Date().toISOString(), caller, queue: '1001*Q-ADMISSION',
        operator: event === 'ringing' ? null : (b.operator || null) };
      try {
        const r = await receivePhoneEvent(db, payload, { mode: 'test' });
        return json(res, 200, { ...r, callId, caller });
      } catch (err) {
        if (err instanceof BadInbound) return json(res, 400, { error: err.message });
        throw err;
      }
    }

    if (req.method === 'POST' && p === '/api/console/send') {
      const b = await body(req);
      const channel = String(b.channel || '');
      const scenario = String(b.scenario || 'study_enquiry');
      if (!hasAdapter(channel)) return json(res, 400, { error: 'unknown channel: ' + channel });

      // an existing-person scenario borrows a real person's details, so the
      // duplicate check fires for a genuine reason rather than a rigged one
      let existing = null;
      if (b.person === 'existing' || scenario === 'existing_person' || scenario === 'duplicate_attempt') {
        existing = await db.prepare(`SELECT name, email, phone FROM people
          WHERE (email IS NOT NULL OR phone IS NOT NULL) ORDER BY created_at DESC LIMIT 1`).get() || null;
        if (!existing) return json(res, 409, {
          error: 'there is nobody in the database yet, so there is nobody to match against',
          how: 'load some demo data first' });
      }

      const payload = buildPayload(channel, scenario, { sameId: b.sameId === true, existing,
        message: typeof b.message === 'string' && b.message.trim() ? b.message.trim() : null });
      try {
        const ev = adapt(channel, payload);
        const r = await receive(db, toIntake(ev));
        recordInbound(channel, ev.externalEventId,
          r.duplicate ? 'duplicate' : r.filtered ? 'filtered' : 'queued', 'console');
        const outcome = r.duplicate ? 'The same event again - stored once'
          : r.filtered ? 'Filtered before the Inbox'
          : 'Waiting in the Inbox';
        const explain = r.duplicate
          ? 'A provider retry. It matched on the channel and the provider id, so nothing was written twice.'
          : r.filtered
          ? 'A commercial pitch. It is stored and findable, and it is kept out of the funnel, so nobody has to archive it by hand.'
          : existing
          ? `It came in as ${existing.name}, who is already in the database. Qualifying it will offer that person rather than making a second one.`
          : 'Open the Inbox and decide what it is. Nothing becomes an applicant on its own.';
        return json(res, 200, { ok: true, channel: CHANNEL_LABELS[channel] || channel,
          externalEventId: ev.externalEventId, inboundId: r.id, outcome, explain,
          personId: null, filtered: Boolean(r.filtered), duplicate: Boolean(r.duplicate) });
      } catch (err) {
        recordInbound(channel, null, 'error', err.message);
        if (err instanceof BadInbound) return json(res, 400, { error: err.message, detail: err.detail });
        throw err;
      }
    }

    // The connection register: what is ready, what is waiting, and on whom.
    if (req.method === 'GET' && p === '/api/connections') {
      const counts = {};
      for (const id of channelIds()) {
        const row = await db.prepare(`SELECT COUNT(*) n, MAX(received_at) last FROM inbound WHERE channel = ?`).get(id);
        const ok = await db.prepare(`SELECT MAX(received_at) last FROM inbound WHERE channel = ? AND state != 'filtered'`).get(id);
        const hs = await db.prepare('SELECT verified_at, how FROM channel_handshake WHERE channel = ?').get(id);
        counts[id] = { events: row.n, lastEventAt: row.last, lastSuccessAt: ok.last,
          handshakeAt: hs ? hs.verified_at : null, handshakeHow: hs ? hs.how : null };
      }
      return json(res, 200, {
        channels: allChannelStatus(process.env, counts),
        adapters: adapterIds(),
        note: 'No secret value is ever returned by this endpoint, only whether one is present.',
      });
    }

    // What happened to each thing that arrived. The diagnostic view that matters
    // once real channels start flowing.
    if (req.method === 'GET' && p === '/api/inbound/events') {
      const rows = await db.prepare(`SELECT i.id, i.channel, i.external_id, i.received_at, i.state,
          i.qualification, i.person_id, i.archive_reason, i.processed_by, i.processed_at,
          pe.name AS person_name
        FROM inbound i LEFT JOIN people pe ON pe.id = i.person_id
        ORDER BY i.received_at DESC LIMIT 200`).all();
      return json(res, 200, {
        rows: rows.map((r) => ({
          id: r.id, channel: r.channel, externalId: r.external_id, receivedAt: r.received_at,
          // the journey, in the words the screens use
          filtered: r.state === 'filtered',
          inCar: r.state === 'new',
          qualified: r.state === 'qualified',
          archived: r.state === 'archived',
          matchedPerson: r.person_id ? { id: r.person_id, name: r.person_name } : null,
          becameLead: r.qualification === 'lead',
          outcome: r.state === 'filtered' ? 'filtered before the queue'
            : r.state === 'new' ? 'waiting in CAR'
            : r.state === 'qualified' ? (r.qualification === 'lead' ? 'became a lead' : 'kept, still unclear')
            : 'marked not relevant',
          by: r.processed_by, at: r.processed_at,
        })),
        deliveries: INBOUND_LOG.slice(-200).reverse(),
      });
    }

    // ------------------------------------------------------------- feedback -
    // Anybody using the app can report a bug or an idea from the screen they are
    // on. Reading it back is admin-only. NOTE: there is no login yet, so 'admin'
    // here means the name in the actor picker. It is a workflow rule, not a
    // security boundary, and it becomes one only when authentication exists.
    if (req.method === 'POST' && p === '/api/feedback') {
      const b = await body(req, 3 * 1024 * 1024);
      const saved = await saveFeedback(db, {
        kind: readKind(b.kind),
        body: readBody(b.body),
        path: readPath(b.path),
        screenshot: readScreenshot(b.screenshot),
        by: await actorOf(req, b),
        at: nowIso(),
      });
      // Saved first; the email is after it and can never fail the feedback (04.10.2026).
      const mailed = await notify.sendFeedbackEmail(db, { id: saved.id, kind: readKind(b.kind), body: readBody(b.body),
        path: readPath(b.path), by: await actorOf(req, b), at: nowIso(), screenshot: saved.screenshot, origin: originOf(req) });
      return json(res, 200, { ok: true, ...saved, emailed: mailed.ok });
    }

    // The Help center's questions (dev kit part 3): anybody signed in counts one open of a
    // question. The counts are background analytics for the builders: the Help center shows the
    // questions in the order of config/help.json and never reads them (the owner, 01.10.2026: Help is
    // not a popularity system). Behind the sign-in door above.
    if (req.method === 'POST' && p === '/api/help/opened') {
      const b = await body(req, 4096);
      await helpOpened(db, b.id, nowIso());
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && p === '/api/help/counts') return json(res, 200, { counts: await helpCounts(db) });

    // The notification. Nothing in this app can send an email, so being told
    // happens inside the app: a count of what has not been handled yet.
    if (req.method === 'GET' && p === '/api/feedback/waiting') {
      const who = await viewerOf(req, url);
      if (!canReadFeedback(who)) return json(res, 200, { open: 0, mayRead: false });
      return json(res, 200, { mayRead: true,
        open: (await db.prepare('SELECT COUNT(*) n FROM feedback WHERE handled_at IS NULL').get()).n,
        readers: FEEDBACK_READERS });
    }

    if (req.method === 'GET' && p === '/api/admin/feedback') {
      if (!canReadFeedback(await viewerOf(req, url)))
        return json(res, 403, { error: `the feedback inbox is for ${FEEDBACK_READERS.join(' and ')} only` });
      return json(res, 200, { rows: await listFeedback(db) });
    }

    if (req.method === 'GET' && /^\/api\/admin\/feedback\/\d+\/screenshot$/.test(p)) {
      if (!canReadFeedback(await viewerOf(req, url)))
        return json(res, 403, { error: `the feedback inbox is for ${FEEDBACK_READERS.join(' and ')} only` });
      const shot = await getScreenshot(db, Number(p.split('/')[4]));
      if (!shot) return json(res, 404, { error: 'not found' });
      // The stored type is the sniffed one. nosniff stops a browser second-guessing it.
      res.writeHead(200, {
        'content-type': shot.mime_type,
        'x-content-type-options': 'nosniff',
        'content-disposition': 'inline',
        'cache-control': 'private, max-age=300',
      });
      return res.end(Buffer.from(shot.data));
    }

    if (req.method === 'PATCH' && /^\/api\/admin\/feedback\/\d+$/.test(p)) {
      if (!canReadFeedback(await viewerOf(req, url)))
        return json(res, 403, { error: `the feedback inbox is for ${FEEDBACK_READERS.join(' and ')} only` });
      const b = await body(req);
      const r = await setHandled(db, Number(p.split('/')[4]), Boolean(b.handled), await actorOf(req, b), nowIso());
      return r.error ? json(res, 404, r) : json(res, 200, r);
    }

    return json(res, 404, { error: 'not found' });
  } catch (err) {
    if (err instanceof BadScreenshot) return json(res, 400, { error: err.message });
    return json(res, 500, { error: err.message });
  }
};

// ON VERCEL THERE IS NO SERVER TO START. The platform owns the socket and calls
// handle() through api/index.js, once per request, on an instance that has already
// run everything above - database, demo data, accounts - exactly once.
if (!process.env.VERCEL) {
  const server = http.createServer(handle);

  // The port is read back from the socket rather than echoed from PORT, because
  // PORT=0 means "pick one" and echoing 0 tells nobody anything.
  server.on('error', (err) => {
    // A port already in use used to be swallowed, and a stale server then answered
    // for the new one - a whole suite passed against code that had never loaded.
    console.error('REFUSING TO START. ' + err.message);
    process.exit(1);
  });
  server.listen(PORT, () => console.log(`Intake on http://localhost:${server.address().port}`));
}
