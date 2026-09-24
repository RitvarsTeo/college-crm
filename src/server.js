import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { seed } from './seed.js';
import { hasRealData, loadReal } from './real.js';
import { PROVIDERS, runScenario, runOutbound, runFullDemo, listEvents, getEvent, consentFor, consentSummary, DEMO_SEQUENCE } from './simulator.js';
import { logEvent, applyEdit, readHistory, MANUAL, AUTOMATIC, EDITABLE_FIELDS, IMMUTABLE_FIELDS, FIELD_LABELS } from './history.js';
import { receive, listInbound, qualify, archive, funnel, agedCount, handoffToSis, ownerFor, notifiedFor, handoverGap, canReach, surfaceAt, waitingFor, waitingByRole } from './intake.js';
import { readScreenshot, readKind, readBody, readPath, saveFeedback, listFeedback, getScreenshot, setHandled, BadScreenshot } from './feedback.js';
import { findMatches as matchPeople, duplicateCheck } from './identity.js';
import { adapt, toIntake, hasAdapter, adapterIds } from './adapters.js';
import { fixtureFor } from './fixtures.js';
import { buildPayload, scenariosFor, allScenarios, CHANNEL_LABELS, META_GROUP } from './scenarios.js';
import { report as buildReport, reportRows, periodOf, EXPORT_SECTIONS, DEFAULT_SECTIONS } from './reports.js';
import * as snapshot from './snapshot.js';
import { buildDemo } from './demo.js';
import { verifyRequest, channelDef, channelIds, allChannelStatus, BadInbound } from './inbound.js';


const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT || 8800);
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const FIXTURES = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'inbound_fixtures.json'), 'utf8'));

// The prototype now keeps its database in a file. It used to live in memory, and
// a restart silently emptied it while the open browser tab carried on showing
// rows that no longer existed - every link in that stale page then failed.
const DB_FILE = process.env.CRM_DB || path.join(ROOT, 'data', 'crm.db');
if (DB_FILE !== ':memory:') fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = openDb(DB_FILE);

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
const modeState = () => ({
  mode: MODE,
  isReal: MODE === 'real',
  isDemo: MODE === 'demo',
  people: db.prepare('SELECT COUNT(*) n FROM people').get().n,
  snapshot: snapshot.info(),
});
let DATASET = { dataset: 'empty', people: 0, selection: 'an empty table' };


function clearAll() {
  db.exec(`DELETE FROM events; DELETE FROM tasks; DELETE FROM documents;
           DELETE FROM registrations; DELETE FROM open_days; DELETE FROM consents;
           DELETE FROM sim_events; DELETE FROM field_values; DELETE FROM inbound;
           DELETE FROM people;`);
}

// empty | real | synthetic. Pressed as often as the demo needs.
function loadDataset(kind) {
  clearAll();
  if (kind === 'real') {
    if (!hasRealData()) throw new Error('data/real_people.json is missing');
    DATASET = loadReal(db, CONFIG.realData);
    setMode('real');
    // The clean snapshot is written HERE, straight after loading from the source
    // file, and never later. Once somebody has been testing in demo mode the live
    // tables are no longer evidence of what the real data looked like.
    snapshot.write(db, { source: DATASET.source || 'data/real_people.json',
      selection: DATASET.selection || null });
  } else if (kind === 'synthetic') {
    DATASET = { dataset: 'synthetic', ...seed(db), selection: 'invented records shaped by the real proportions' };
  } else {
    DATASET = { dataset: 'empty', people: 0, selection: 'an empty table, until a channel writes something into it' };
  }
  return DATASET;
}

// Boot, and the reason this is not simply loadDataset(...).
//
// loadDataset clears every table first. That cost nothing while the database
// lived in memory, because a fresh process started empty anyway. Now that it is
// a FILE, running it at boot destroyed everything a tester had entered, on every
// restart - the exact fault the file was meant to fix. So: an existing database
// is left alone, and the configured starting dataset is only applied to a new
// and empty one. DATASET=... still forces a load, which is what the tests use.
{
  const forced = process.env.DATASET;
  const kept = db.prepare('SELECT COUNT(*) n FROM people').get().n;
  if (forced) {
    loadDataset(forced);
  } else if (kept) {
    DATASET = { dataset: 'kept', people: kept,
      selection: 'what was in the database when the server last stopped' };
  } else {
    loadDataset(CONFIG.startWith || 'empty');
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

const dayStart = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').toISOString();
const dayEnd = () => new Date(Date.parse(dayStart()) + 86400000).toISOString();
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
const canReadFeedback = (who) => FEEDBACK_READERS.includes(String(who || ''));
const isKnownPerson = (who) => USER_NAMES.includes(String(who || '')) || isAdmin(who);
const roleOf = (who) => (USERS.find((u) => u.name === who) || {}).role || null;
// 'unknown user' rather than a quiet default: an entry nobody can be traced to
// should look wrong on the screen, not look like Ieva did it.
const actorOf = (req, b) => String((b && b.by) || req.headers['x-acting-as'] || 'unknown user');
const viewerOf = (req, url) => String(url.searchParams.get('as') || req.headers['x-acting-as'] || '');

// Decision 2, locked 23.09.2026. Two different things live on a person's timeline:
//   - the person's own activity: calls, notes, messages, visits, status moves.
//     Everybody who may open the record sees this. Hiding it would make a
//     colleague call the same applicant twice.
//   - an internal correction: "Programme NAV -> ENG, by Laura". This is audit,
//     and a normal user sees only their own. Admins see all of them.
function visibleTimeline(rows, viewer) {
  if (isAdmin(viewer)) return rows;
  return rows.filter((e) => e.kind !== 'edit' || e.actor === viewer);
}
const ACTIVITY = [];

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
function advanceStatus(personId, actionLabel, now) {
  if (!CONFIG.statusFollowsEvents) return null;
  const target = stageOf(actionLabel);
  if (!target) return null;
  const person = db.prepare('SELECT status FROM people WHERE id = ?').get(personId);
  if (!person) return null;
  const order = STAGE_ORDER();
  const from = order.indexOf(person.status);
  const to = order.indexOf(target);
  // never move backwards, and never touch a person somebody has closed
  if (person.status === 'Not proceeding' || to < 0 || (from >= 0 && to <= from)) return null;
  db.prepare('UPDATE people SET status = ? WHERE id = ?').run(target, personId);
  if (target === 'Admitted') {
    db.prepare("UPDATE people SET admitted_at = COALESCE(admitted_at, ?) WHERE id = ?").run(now, personId);
  }
  if (target === 'Contract') {
    db.prepare("UPDATE people SET contract_at = COALESCE(contract_at, ?) WHERE id = ?").run(now, personId);
  }
  logEvent(db, { personId, kind: 'status', direction: 'note', at: now, origin: AUTOMATIC, actor: 'CRM',
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
const findMatches = (contact) => matchPeople(db, contact);

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

function personRow(id, viewer) {
  const p = db.prepare('SELECT * FROM people WHERE id = ?').get(id);
  if (!p) return null;
  const all = db.prepare('SELECT * FROM events WHERE person_id = ? ORDER BY occurred_at DESC, id DESC').all(id);
  p.timeline = visibleTimeline(all, viewer);
  p.hiddenCorrections = all.length - p.timeline.length;
  p.viewer = viewer || null;
  p.viewerIsAdmin = isAdmin(viewer);
  p.tasks = db.prepare('SELECT * FROM tasks WHERE person_id = ? ORDER BY due_at ASC').all(id);
  p.documents = db.prepare('SELECT * FROM documents WHERE person_id = ?').all(id);
  p.registrations = db.prepare(`SELECT r.*, o.title, o.held_on FROM registrations r JOIN open_days o ON o.id = r.open_day_id WHERE r.person_id = ?`).all(id);
  p.consents = consentFor(db, id);
  // structured fields with where they came from. A suggestion is never a fact.
  p.fields = db.prepare('SELECT * FROM field_values WHERE person_id = ? ORDER BY id').all(id);
  const known = new Set(p.fields.filter((f) => f.value).map((f) => f.field));
  p.missingInfo = (CONFIG.qualification.completionFields || []).filter((f) => !known.has(f));
  p.routedTo = ownerFor(p.qualification || 'raw');
  p.handoverGap = p.qualification === 'hot'
    ? handoverGap({ role: p.routedTo, channel: p.first_channel || p.source_channel,
      email: p.email, phone: p.phone })
    : null;
  p.simEvents = db.prepare('SELECT id, at, channel, scenario, direction, decision, status FROM sim_events WHERE person_id = ? ORDER BY id DESC').all(id);
  return p;
}

function openTask(id) {
  return db.prepare('SELECT * FROM tasks WHERE person_id = ? AND done_at IS NULL ORDER BY due_at ASC').get(id);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
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
      return res.end(fs.readFileSync(path.join(ROOT, 'src', 'app.html')));
    }
    // The brand assets. Only the two authorised logo files, served by an exact
    // name match: no path is ever built out of what the request asked for.
    if (req.method === 'GET' && p.startsWith('/assets/')) {
      const ALLOWED = { 'NoAca_logo_darkhor.svg': 1, 'NoAca_logo_whitehor.svg': 1,
        'NoAca_logo_blackhor.svg': 1 };
      const name = p.slice('/assets/'.length);
      if (!ALLOWED[name]) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=3600' });
      return res.end(fs.readFileSync(path.join(ROOT, 'src', 'assets', name)));
    }

    if (req.method === 'GET' && p === '/api/config') return json(res, 200, { ...CONFIG, dataset: DATASET });

    // --------------------------------------------------------- the database -
    if (req.method === 'POST' && p === '/api/dataset') {
      const b = await body(req);
      try {
        const info = loadDataset(b.kind);
        ACTIVITY.length = 0;
        return json(res, 200, { ok: true, dataset: info, realAvailable: hasRealData() });
      } catch (err) { return json(res, 400, { error: err.message }); }
    }

    if (req.method === 'POST' && p === '/api/reset') {
      const info = loadDataset('empty');
      ACTIVITY.length = 0;
      return json(res, 200, { ok: true, dataset: info });
    }


    // ------------------------------------------------- integration simulator -
    if (req.method === 'GET' && p === '/api/sim/providers') {
      const channels = PROVIDERS.channels.map((c) => {
        const last = db.prepare('SELECT at, scenario, decision, status FROM sim_events WHERE channel = ? ORDER BY id DESC LIMIT 1').get(c.id);
        const count = db.prepare('SELECT COUNT(*) n FROM sim_events WHERE channel = ?').get(c.id).n;
        return { ...c, lastEvent: last || null, eventCount: count,
          statusLabel: c.status.live ? 'LIVE' : c.status.providerTested ? 'PROVIDER-TESTED' : 'CONNECTED - SIMULATED ACCOUNT' };
      });
      return json(res, 200, { honesty: PROVIDERS.honesty, consentPurposes: PROVIDERS.consentPurposes, channels, demoSequence: DEMO_SEQUENCE });
    }

    if (req.method === 'POST' && /^\/api\/sim\/[^/]+\/run$/.test(p)) {
      const id = p.split('/')[3];
      const b = await body(req);
      return json(res, 200, runScenario(db, id, b.scenario));
    }

    if (req.method === 'POST' && /^\/api\/sim\/[^/]+\/outbound$/.test(p)) {
      const id = p.split('/')[3];
      const b = await body(req);
      return json(res, 200, runOutbound(db, id, b.personId, b.text));
    }

    if (req.method === 'POST' && p === '/api/sim/demo') {
      return json(res, 200, runFullDemo(db));
    }

    if (req.method === 'GET' && p === '/api/sim/events') {
      return json(res, 200, listEvents(db));
    }

    if (req.method === 'GET' && /^\/api\/sim\/events\/\d+$/.test(p)) {
      const ev = getEvent(db, Number(p.split('/')[4]));
      return ev ? json(res, 200, ev) : json(res, 404, { error: 'not found' });
    }

    if (req.method === 'GET' && p === '/api/consent') {
      return json(res, 200, { summary: consentSummary(db), purposes: PROVIDERS.consentPurposes,
        recent: db.prepare(`SELECT c.*, pe.name FROM consents c JOIN people pe ON pe.id = c.person_id ORDER BY c.id DESC LIMIT 40`).all() });
    }

    if (req.method === 'GET' && p === '/api/metrics') {
      const bySource = db.prepare(`SELECT source_channel channel, COUNT(*) n,
        SUM(CASE WHEN status='Admitted' THEN 1 ELSE 0 END) admitted,
        SUM(CASE WHEN source_campaign IS NOT NULL THEN 1 ELSE 0 END) withCampaign FROM people GROUP BY source_channel ORDER BY n DESC`).all();
      const simEvents = db.prepare('SELECT channel, direction, COUNT(*) n FROM sim_events GROUP BY channel, direction').all();
      return json(res, 200, { bySource, simEvents,
        crmKnows: ['lead created', 'source and campaign', 'contact details', 'every message', 'follow-up and outcome', 'application', 'contract', 'admission'],
        platformKnows: ['ad impression and click', 'form or message interaction', 'delivery and engagement', 'platform-side conversion signal only if we send it back'],
        returnPath: {
          google: 'Offline conversion import and enhanced conversions for leads move to the Data Manager API: from 15 June 2026 those uploads are blocked in the Google Ads API. Sending a CRM admission back as a conversion means hashed user-provided data through Data Manager, and for EEA traffic it depends on consent mode signals (ad_user_data, ad_personalization).',
          meta: 'A CRM outcome reaches Meta only through the Conversions API with hashed identifiers, and it is a separate build from the lead webhook.',
          mailchimp: 'A CRM outcome reaches Mailchimp as a tag or merge field through the Marketing API.',
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
      const meRole = roleOf(viewerOf(req, url));
      const everyone = url.searchParams.get('scope') === 'all' || !meRole;
      const mine = (rows, key = 'owner') => everyone ? rows : rows.filter((r) => r[key] === meRole);

      // NEW LEADS - arrived and nobody has spoken to them yet.
      const newLeadsAll = db.prepare(`SELECT pe.* FROM people pe
        WHERE pe.created_at >= ? AND pe.status NOT IN ('Admitted','Not proceeding')`).all(from);
      const spokenTo = (id) => db.prepare(`SELECT COUNT(*) n FROM events
        WHERE person_id = ? AND origin = 'manual' AND kind IN ('call','note','task','status')`).get(id).n > 0;
      const newLeads = mine(newLeadsAll.filter((r) => !spokenTo(r.id)));
      const newLeadsDone = newLeadsAll.length - newLeads.length;

      // FOLLOW-UPS - a next step due today or already late, plus the ones closed today.
      const openFollow = db.prepare(`SELECT t.*, pe.name, pe.programme, pe.status FROM tasks t
        JOIN people pe ON pe.id = t.person_id
        WHERE t.done_at IS NULL AND t.due_at < ? ORDER BY t.due_at ASC`).all(to);
      const doneFollow = db.prepare(`SELECT COUNT(*) n FROM tasks WHERE done_at >= ? AND done_at < ?`).get(from, to).n;
      const openFollowMine = mine(openFollow);

      // REPLIES - they wrote to us and nothing has gone back since.
      const replies = db.prepare(`SELECT pe.id, pe.name, pe.programme, pe.status, pe.source_channel,
          e.subject, e.body, e.occurred_at, e.channel
        FROM events e JOIN people pe ON pe.id = e.person_id
        WHERE e.direction = 'in'
          AND e.occurred_at = (SELECT MAX(e2.occurred_at) FROM events e2 WHERE e2.person_id = pe.id)
          AND pe.status NOT IN ('Admitted','Not proceeding')
        ORDER BY e.occurred_at DESC`).all();
      const answeredToday = db.prepare(`SELECT COUNT(*) n FROM events
        WHERE occurred_at >= ? AND occurred_at < ? AND (direction = 'out' OR (origin = 'manual' AND kind IN ('call','note')))`)
        .get(from, to).n;

      // OTHER ATTENTION - active, and no next step at all. This is the crack people fall through.
      const attention = db.prepare(`SELECT pe.* FROM people pe
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

      return json(res, 200, {
        groups: [
          group('new_leads', 'New leads', newLeads, newLeadsDone),
          group('waiting', 'Waiting on us', waitingRows, doneFollow + answeredToday),
          group('attention', 'Other attention', attentionMine, 0),
        ],
        order: CONFIG.todayGroups.map((g) => g.id),
        descriptions: Object.fromEntries(CONFIG.todayGroups.map((g) => [g.id, g.what])),
        scope: everyone ? 'all' : 'mine',
        role: meRole,
      });
    }

    // Decision 12: the three the management asked for, and nothing invented.
    if (req.method === 'GET' && p === '/api/metrics/core') {
      const monthStart = new Date().toISOString().slice(0, 8) + '01T00:00:00.000Z';
      const newLeads = db.prepare('SELECT COUNT(*) n FROM people WHERE created_at >= ?').get(monthStart).n;
      const admitted = db.prepare('SELECT COUNT(*) n FROM people WHERE admitted_at >= ?').get(monthStart).n;
      // Conversion of THIS month's arrivals, which is not the same as admissions
      // this month - somebody admitted today may have arrived in March.
      const cohort = db.prepare('SELECT COUNT(*) n FROM people WHERE created_at >= ?').get(monthStart).n;
      const cohortAdmitted = db.prepare("SELECT COUNT(*) n FROM people WHERE created_at >= ? AND status = 'Admitted'").get(monthStart).n;
      return json(res, 200, {
        month: monthStart.slice(0, 7),
        newLeadsThisMonth: newLeads,
        admissionsThisMonth: admitted,
        conversionPct: cohort ? Math.round((cohortAdmitted / cohort) * 1000) / 10 : null,
        conversionOf: `${cohortAdmitted} of ${cohort} people who arrived this month`,
        caution: 'Admissions this month and conversion this month count different populations: somebody admitted today may have arrived months ago. The conversion figure follows this month\'s arrivals.',
      });
    }

    if (req.method === 'GET' && p === '/api/summary') {
      const q = (sql, ...a) => db.prepare(sql).get(...a);
      const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const overdue = db.prepare(`SELECT t.*, pe.name, pe.programme, pe.status FROM tasks t JOIN people pe ON pe.id = t.person_id
        WHERE t.done_at IS NULL AND t.due_at < ? ORDER BY t.due_at ASC`).all(dayStart());
      const today = db.prepare(`SELECT t.*, pe.name, pe.programme, pe.status FROM tasks t JOIN people pe ON pe.id = t.person_id
        WHERE t.done_at IS NULL AND t.due_at >= ? AND t.due_at < ? ORDER BY t.due_at ASC`).all(dayStart(), dayEnd());
      return json(res, 200, {
        newLeads7: q('SELECT COUNT(*) n FROM people WHERE created_at >= ?', since7).n,
        newLeadsToday: q('SELECT COUNT(*) n FROM people WHERE created_at >= ?', dayStart()).n,
        openPeople: q("SELECT COUNT(*) n FROM people WHERE status NOT IN ('Admitted','Not proceeding')").n,
        noNextAction: q(`SELECT COUNT(*) n FROM people pe WHERE pe.status NOT IN ('Admitted','Not proceeding')
          AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL)`).n,
        admitted30: q('SELECT COUNT(*) n FROM people WHERE admitted_at >= ?', since30).n,
        admittedTotal: q('SELECT COUNT(*) n FROM people WHERE status = ?', 'Admitted').n,
        overdue, today,
        recent: db.prepare(`SELECT e.*, pe.name FROM events e JOIN people pe ON pe.id = e.person_id
          ORDER BY e.occurred_at DESC LIMIT 12`).all(),
        byStage: db.prepare('SELECT status, COUNT(*) n FROM people GROUP BY status').all(),
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
      let rows = db.prepare(`SELECT pe.*, (SELECT label FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL ORDER BY due_at LIMIT 1) AS next_action,
        (SELECT due_at FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL ORDER BY due_at LIMIT 1) AS next_action_at
        FROM people pe ORDER BY ${orderBy} ${dir}`).all();
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
      return json(res, 200, { count: rows.length, rows });
    }

    if (req.method === 'GET' && p === '/api/people/fields') {
      return json(res, 200, {
        editable: EDITABLE_FIELDS, labels: FIELD_LABELS, immutable: IMMUTABLE_FIELDS,
        decided: CONFIG.editPolicy || null,
      });
    }

    if (req.method === 'GET' && p === '/api/people/check') {
      return json(res, 200, { matches: findMatches({
        email: url.searchParams.get('email'),
        phone: url.searchParams.get('phone'),
        name: url.searchParams.get('name'),
      }) });
    }

    if (req.method === 'GET' && /^\/api\/people\/[^/]+$/.test(p)) {
      const person = personRow(p.split('/')[3], viewerOf(req, url));
      return person ? json(res, 200, person) : json(res, 404, { error: 'not found' });
    }

    if (req.method === 'POST' && p === '/api/people') {
      const b = await body(req);
      for (const field of CONFIG.requiredOnQuickAdd) if (!b[field]) return json(res, 400, { error: `${field} is required` });
      // Decision 9, locked 23.09.2026: never create a duplicate silently. The save
      // stops, the existing record is shown, and only an explicit statement that
      // this is somebody else gets past it.
      if (CONFIG.duplicateRule?.blockOnMatch && !b.confirmedNotDuplicate) {
        const hits = findMatches({ email: b.email, phone: b.phone, name: b.name });
        if (hits.length) {
          return json(res, 409, {
            error: 'This person may already be in the CRM.',
            matches: hits,
            whatToDo: 'Open the existing record, or confirm in as many words that this is a different person.',
          });
        }
      }
      const id = newId();
      const d = CONFIG.quickAddDefaults;
      const now = nowIso();
      db.prepare(`INSERT INTO people (id,name,email,phone,programme,study_form,education,status,owner,source_channel,source_campaign,source_detail,created_at,last_contact_at,notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, b.name, b.email || null, b.phone || null, b.programme || null, b.study_form || null, b.education || null,
        b.status || d.status, b.owner || d.owner, b.source_channel || d.source_channel, b.source_campaign || null,
        b.source_detail || ('entered by ' + (b.by || d.owner)), now, now, b.notes || null);
      logEvent(db, { personId: id, kind: 'create', channel: b.source_channel || d.source_channel, direction: 'note',
        at: now, origin: MANUAL, actor: actorOf(req, b), subject: 'Added manually',
        body: b.notes || `entered on the ${channelLabel(b.source_channel || d.source_channel)} channel` });
      const label = b.nextAction || d.nextAction;
      if (label) {
        const due = new Date(Date.now() + (Number(b.nextActionDays ?? d.nextActionDays) || 0) * 86400000).toISOString();
        db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)').run(id, label, due, b.owner || d.owner, now);
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
      const r = applyEdit(db, id, patch, actorOf(req, b), nowIso());
      if (r.error === 'not found') return json(res, 404, { error: 'not found' });
      if (r.error) return json(res, 400, r);
      return json(res, 200, { ok: true, changes: r.changes, person: personRow(id, actorOf(req, b)) });
    }

    if (req.method === 'POST' && /^\/api\/people\/[^/]+\/status$/.test(p)) {
      const id = p.split('/')[3];
      const b = await body(req);
      const before = db.prepare('SELECT status FROM people WHERE id = ?').get(id);
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
      const now = nowIso();
      db.prepare('UPDATE people SET status = ? WHERE id = ?').run(b.status, id);
      if (b.status === 'Contract') db.prepare('UPDATE people SET contract_at = ? WHERE id = ? AND contract_at IS NULL').run(now, id);
      if (b.status === 'Admitted') db.prepare('UPDATE people SET admitted_at = ?, student_no = COALESCE(student_no, ?) WHERE id = ?')
        .run(now, '3-5-IM/2026/' + Math.floor(10 + Math.random() * 89), id);
      logEvent(db, { personId: id, kind: 'status', direction: 'note', at: now, origin: MANUAL,
        actor: actorOf(req, b),
        subject: `Status: ${before.status} -> ${b.status}` + (b.reason ? ` (${b.reason})` : ''),
        body: b.note || (b.reason ? '' : 'changed by hand'),
        field: 'status', oldValue: before.status, newValue: b.status });
      if (b.reason) db.prepare('UPDATE people SET closed_reason = ?, closed_note = ? WHERE id = ?')
        .run(b.reason, b.note || null, id);
      return json(res, 200, personRow(id, actorOf(req, b)));
    }

    if (req.method === 'POST' && /^\/api\/people\/[^/]+\/note$/.test(p)) {
      const id = p.split('/')[3];
      const b = await body(req);
      const now = nowIso();
      logEvent(db, { personId: id, kind: b.kind || 'note', channel: b.kind === 'call' ? 'phone' : null,
        direction: 'note', at: now, origin: MANUAL, actor: actorOf(req, b),
        subject: b.subject || 'Note', body: b.body || '' });
      db.prepare('UPDATE people SET last_contact_at = ? WHERE id = ?').run(now, id);
      return json(res, 200, personRow(id, actorOf(req, b)));
    }

    // ------------------------------------------------------------ intake ---
    // The marketing side. Nothing here is connected to a provider: items are
    // pushed in from a fixture file so the flow can be walked through on screen.
    if (req.method === 'GET' && p === '/api/intake') {
      const state = url.searchParams.get('state') || 'new';
      const rows = listInbound(db, { state });
      return json(res, 200, {
        rows, state,
        counts: {
          new: db.prepare("SELECT COUNT(*) n FROM inbound WHERE state = 'new'").get().n,
          qualified: db.prepare("SELECT COUNT(*) n FROM inbound WHERE state = 'qualified'").get().n,
          archived: db.prepare("SELECT COUNT(*) n FROM inbound WHERE state = 'archived'").get().n,
          filtered: db.prepare("SELECT COUNT(*) n FROM inbound WHERE state = 'filtered'").get().n,
          aged: agedCount(db),
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
        const r = receive(db, { ...f, receivedAt: new Date(now - f.hoursAgo * 3600000).toISOString() });
        if (!r.duplicate) added++;
      }
      return json(res, 200, { ok: true, added, total: db.prepare('SELECT COUNT(*) n FROM inbound').get().n });
    }

    // One button that builds the whole V1 story, deterministically, so a review
    // always sees the same screens. No provider is contacted.
    if (req.method === 'POST' && p === '/api/demo/scenario') {
      loadDataset('empty');
      ACTIVITY.length = 0;
      runFullDemo(db);                                   // the older channel walk-through
      const now = Date.now();
      for (const f of FIXTURES.items) {
        receive(db, { ...f, receivedAt: new Date(now - f.hoursAgo * 3600000).toISOString() });
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
        const row = db.prepare('SELECT id FROM inbound WHERE external_id = ?').get(step.extId);
        if (!row) continue;
        // These are demo people who genuinely are different people, so the walk-through
        // says so rather than tripping the duplicate rule it is meant to demonstrate.
        const r = qualify(db, row.id, { qualification: step.as, createPerson: true,
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
        const row = db.prepare('SELECT id FROM inbound WHERE external_id = ?').get(extId);
        if (row) archive(db, row.id, { reason, by: 'Tetiana' });
      }
      // one person carried the whole way, so the funnel has an end as well as a start
      const hot = db.prepare("SELECT id FROM people WHERE qualification = 'lead' ORDER BY id LIMIT 1").get();
      if (hot) {
        for (const st of [CONFIG.stageRoles.application, 'Contract', CONFIG.stageRoles.admitted]) {
          const before = db.prepare('SELECT status FROM people WHERE id = ?').get(hot.id).status;
          db.prepare('UPDATE people SET status = ? WHERE id = ?').run(st, hot.id);
          logEvent(db, { personId: hot.id, kind: 'status', direction: 'note', at: nowIso(),
            origin: MANUAL, actor: 'Ieva', subject: `Status: ${before} -> ${st}`,
            body: 'moved by Admissions', field: 'status', oldValue: before, newValue: st });
        }
        db.prepare('UPDATE people SET admitted_at = ? WHERE id = ?').run(nowIso(), hot.id);
        db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
          .run(hot.id, 'Collect the medical certificate',
            new Date(Date.now() - 2 * 86400000).toISOString(), 'Admissions', nowIso());
      }
      const warm = db.prepare("SELECT id FROM people WHERE qualification = 'unclear' ORDER BY id LIMIT 1").get();
      if (warm) db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
        .run(warm.id, 'Send the programme description', new Date(Date.now() + 86400000).toISOString(),
          'Marketing', nowIso());
      // so the badge still tells the truth after a reload
      DATASET = { dataset: 'demo', people: db.prepare('SELECT COUNT(*) n FROM people').get().n,
        selection: 'the deterministic V1 walk-through: channels, intake, qualification, one admission' };
      return json(res, 200, { ok: true,
        people: DATASET.people,
        inbound: db.prepare('SELECT COUNT(*) n FROM inbound').get().n,
        qualified: out.length });
    }

    if (req.method === 'POST' && p === '/api/intake/receive') {
      const b = await body(req);
      if (!b.channel) return json(res, 400, { error: 'channel is required' });
      return json(res, 200, receive(db, b));
    }

    if (req.method === 'POST' && /^\/api\/intake\/\d+\/qualify$/.test(p)) {
      const id = Number(p.split('/')[3]);
      const b = await body(req);
      const r = qualify(db, id, { ...b, by: actorOf(req, b) });
      return r.error ? json(res, 400, r) : json(res, 200, r);
    }

    if (req.method === 'POST' && /^\/api\/intake\/\d+\/archive$/.test(p)) {
      const id = Number(p.split('/')[3]);
      const b = await body(req);
      const r = archive(db, id, { ...b, by: actorOf(req, b) });
      return r.error ? json(res, 400, r) : json(res, 200, r);
    }

    // Notifications, in the only shape that works without a login: what is
    // waiting for the person you are acting as. An admin is not notified - they
    // are shown who has what waiting, which is the question they actually ask.
    if (req.method === 'GET' && p === '/api/waiting') {
      const who = viewerOf(req, url);
      const role = roleOf(who);
      if (isAdmin(who)) {
        return json(res, 200, { actor: who, isAdmin: true, byRole: waitingByRole(db),
          note: 'An admin sees every queue. Nothing is addressed to them personally.' });
      }
      return json(res, 200, {
        actor: who, isAdmin: false, role,
        mine: role ? waitingFor(db, role) : { role: null, intake: 0, leads: 0, overdue: 0, aged: 0, total: 0 },
        note: 'You are shown what is routed to your role. A contact nobody can read yet never reaches Admissions.',
      });
    }

    // ------------------------------------------------------------ exports ---
    // The same report, four ways out. Nothing here is a new number: every row
    // comes from the funnel the screen shows.
    if (req.method === 'GET' && /^\/api\/export\/funnel\.(csv|xlsx|pdf|gsheet)$/.test(p)) {
      const fmt = p.split('.').pop();
      const f = funnel(db);
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
      const stamp = new Date().toISOString().slice(0, 10);
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
        // A real .xlsx needs a zip writer, which this prototype does not carry.
        // Excel opens this file and keeps the columns, and the name says what it
        // is rather than pretending to be something it is not.
        res.writeHead(200, {
          'content-type': 'application/vnd.ms-excel; charset=utf-8',
          'content-disposition': `attachment; filename="academy-crm-report-${stamp}.xls"`,
        });
        return res.end('\uFEFF' + rows.map((r) => r.join('\t')).join('\r\n'));
      }
      // PDF: a minimal single-page document written by hand, no library.
      const lines = rows.map((r) => `${r[0]} | ${r[1]} | ${r[2]}`);
      return res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="academy-crm-report-${stamp}.pdf"`,
      }), res.end(simplePdf(`Academy CRM report ${stamp}`, lines));
    }

    if (req.method === 'GET' && p === '/api/funnel') {
      return json(res, 200, funnel(db));
    }

    if (req.method === 'POST' && /^\/api\/people\/[^/]+\/sis$/.test(p)) {
      const id = p.split('/')[3];
      const b = await body(req);
      const r = handoffToSis(db, id, actorOf(req, b));
      return r.error ? json(res, 400, r) : json(res, 200, r);
    }

    // ----------------------------------------------------------- history ---
    // Backlog 10, 11, 12: one log, both origins, admins only.
    if (req.method === 'GET' && p === '/api/whoami') {
      const who = viewerOf(req, url) || (USER_NAMES[0] || '');
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
      const scope = admin ? '' : who;
      return json(res, 200, {
        actor: who, isAdmin: admin,
        scope: admin ? 'everything' : 'own actions only',
        scopeNote: admin
          ? 'You are an admin, so the whole log is shown: every person, both origins.'
          : 'You are not an admin, so this is the history of your own actions. Everything else in the log is admin-only.',
        roleWarning: admin ? null
          : 'Identity is a setting, not a login: this shows everything recorded under the name "' + who + '". Nothing stops somebody else picking that name in the sidebar.',
        admins: ADMINS,
        honesty: CONFIG.historyHonesty || '',
        ...readHistory(db, {
          origin: url.searchParams.get('origin') || '',
          kind: url.searchParams.get('kind') || '',
          personId: url.searchParams.get('personId') || '',
          actor: scope,
          limit: Number(url.searchParams.get('limit') || 200),
        }),
      });
    }

    // ------------------------------------------------------------- tasks ---
    if (req.method === 'GET' && p === '/api/tasks') {
      const scope = url.searchParams.get('scope') || 'open';
      let sql = `SELECT t.*, pe.name, pe.programme, pe.status, pe.phone, pe.source_channel FROM tasks t JOIN people pe ON pe.id = t.person_id WHERE t.done_at IS NULL`;
      const args = [];
      if (scope === 'overdue') { sql += ' AND t.due_at < ?'; args.push(dayStart()); }
      if (scope === 'today') { sql += ' AND t.due_at >= ? AND t.due_at < ?'; args.push(dayStart(), dayEnd()); }
      if (scope === 'week') { sql += ' AND t.due_at < ?'; args.push(new Date(Date.now() + 7 * 86400000).toISOString()); }
      sql += ' ORDER BY t.due_at ASC';
      return json(res, 200, db.prepare(sql).all(...args));
    }

    if (req.method === 'POST' && /^\/api\/tasks\/\d+\/complete$/.test(p)) {
      const id = Number(p.split('/')[3]);
      const b = await body(req);
      const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (!t) return json(res, 404, { error: 'not found' });
      // A person is never left without a next step: closing one requires the next.
      const person = db.prepare('SELECT status FROM people WHERE id = ?').get(t.person_id);
      const closed = ['Admitted', 'Not proceeding'].includes(person && person.status);
      if (CONFIG.nextActionRequired && !closed && !b.nextLabel) {
        return json(res, 400, { error: 'The next step is required: every open person must keep one.' });
      }
      const now = nowIso();
      db.prepare('UPDATE tasks SET done_at = ?, outcome = ? WHERE id = ?').run(now, b.outcome || 'Done', id);
      logEvent(db, { personId: t.person_id, kind: 'task', channel: 'phone', direction: 'note', at: now,
        origin: MANUAL, actor: actorOf(req, b) || t.owner,
        subject: `${t.label}: ${b.outcome || 'done'}`, body: b.note || '' });
      db.prepare('UPDATE people SET last_contact_at = ? WHERE id = ?').run(now, t.person_id);
      // the step that was just completed decides the stage
      const moved = advanceStatus(t.person_id, t.label, now);
      if (b.nextLabel) {
        const due = b.nextDate ? new Date(b.nextDate + 'T09:00:00.000Z').toISOString() : new Date(Date.now() + 3 * 86400000).toISOString();
        db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)').run(t.person_id, b.nextLabel, due, t.owner, now);
      }
      return json(res, 200, { ok: true, moved, person: personRow(t.person_id, actorOf(req, b)) });
    }

    if (req.method === 'POST' && /^\/api\/tasks\/\d+\/reschedule$/.test(p)) {
      const id = Number(p.split('/')[3]);
      const b = await body(req);
      const due = b.due ? new Date(b.due + 'T09:00:00.000Z').toISOString() : new Date(Date.now() + 86400000).toISOString();
      db.prepare('UPDATE tasks SET due_at = ? WHERE id = ?').run(due, id);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && /^\/api\/people\/[^/]+\/task$/.test(p)) {
      const id = p.split('/')[3];
      const b = await body(req);
      const due = b.due ? new Date(b.due + 'T09:00:00.000Z').toISOString() : new Date(Date.now() + 86400000).toISOString();
      db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
        .run(id, b.label || 'Get in touch', due, b.owner || 'Admissions', nowIso());
      return json(res, 200, personRow(id, actorOf(req, b)));
    }

    // ------------------------------------------------------------ intake ---
    if (req.method === 'GET' && p === '/api/intake') {
      const rows = db.prepare(`SELECT e.*, pe.name, pe.status, pe.source_channel AS person_source FROM events e JOIN people pe ON pe.id = e.person_id
        WHERE e.kind = 'channel' ORDER BY e.occurred_at DESC LIMIT 60`).all();
      const byChannel = db.prepare(`SELECT source_channel channel, COUNT(*) n,
        SUM(CASE WHEN status = 'Admitted' THEN 1 ELSE 0 END) admitted FROM people GROUP BY source_channel ORDER BY n DESC`).all();
      return json(res, 200, { rows, byChannel });
    }

    // ---------------------------------------------------------- open days --
    if (req.method === 'GET' && p === '/api/opendays') {
      const days = db.prepare('SELECT * FROM open_days ORDER BY held_on DESC').all();
      for (const d of days) {
        d.registrations = db.prepare(`SELECT r.*, pe.name, pe.status, pe.programme FROM registrations r JOIN people pe ON pe.id = r.person_id
          WHERE r.open_day_id = ? ORDER BY r.slot`).all(d.id);
        d.came = d.registrations.filter((r) => r.attended === 1).length;
        d.applied = d.registrations.filter((r) => ['Application', 'Contract', 'Admitted'].includes(r.status)).length;
      }
      return json(res, 200, days);
    }

    if (req.method === 'POST' && /^\/api\/registrations\/\d+\/attendance$/.test(p)) {
      const id = Number(p.split('/')[3]);
      const b = await body(req);
      db.prepare('UPDATE registrations SET attended = ? WHERE id = ?').run(b.attended ? 1 : 0, id);
      const r = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
      const now = nowIso();
      logEvent(db, { personId: r.person_id, kind: 'note', channel: 'event', direction: 'note', at: now,
        origin: MANUAL, actor: actorOf(req, b),
        subject: b.attended ? 'Attended the visit' : 'Did not attend',
        body: 'marked by hand on the open day list' });
      if (b.attended) db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)')
        .run(r.person_id, 'Follow up after the visit', new Date(Date.now() + 2 * 86400000).toISOString(), 'Admissions', now);
      return json(res, 200, { ok: true });
    }

    // ----------------------------------------------------------- reports ---
    if (req.method === 'GET' && p === '/api/reports') {
      const byStage = db.prepare('SELECT status, COUNT(*) n FROM people GROUP BY status').all();
      const bySource = db.prepare(`SELECT source_channel channel, COUNT(*) n,
        SUM(CASE WHEN status='Admitted' THEN 1 ELSE 0 END) admitted FROM people GROUP BY source_channel ORDER BY n DESC`).all();
      const byProgramme = db.prepare('SELECT programme, COUNT(*) n FROM people GROUP BY programme ORDER BY n DESC').all();
      const durations = db.prepare(`SELECT education, programme, created_at, contract_at FROM people WHERE contract_at IS NOT NULL`).all()
        .map((r) => ({ ...r, days: Math.round((Date.parse(r.contract_at) - Date.parse(r.created_at)) / 86400000) }));
      const med = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
      const groups = {};
      for (const d of durations) {
        const key = d.education === 'Other' ? 'International / other' : d.education;
        (groups[key] ||= []).push(d.days);
      }
      return json(res, 200, {
        byStage, bySource, byProgramme,
        total: db.prepare('SELECT COUNT(*) n FROM people').get().n,
        openTasks: db.prepare('SELECT COUNT(*) n FROM tasks WHERE done_at IS NULL').get().n,
        overdueTasks: db.prepare('SELECT COUNT(*) n FROM tasks WHERE done_at IS NULL AND due_at < ?').get(dayStart()).n,
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
    if (req.method === 'POST' && /^\/api\/inbound\/[a-z_]+$/.test(p)) {
      const channel = p.split('/')[3];
      const def = channelDef(channel);
      if (!def || !hasAdapter(channel)) return json(res, 404, { error: 'no adapter for ' + channel });

      const mode = String(process.env['CHANNEL_MODE_' + channel.toUpperCase()] || 'off').toLowerCase();
      const simulated = req.headers['x-crm-simulated'] === '1';
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

      let payload;
      try { payload = rawBody ? JSON.parse(rawBody) : {}; }
      catch { return json(res, 400, { error: 'the payload is not readable JSON' }); }

      try {
        const ev = adapt(channel, payload);
        // Idempotency: receive() returns {duplicate:true} when it has already
        // seen this channel + external id. A provider retry is normal.
        const r = receive(db, toIntake(ev));
        recordInbound(channel, ev.externalEventId, r.duplicate ? 'duplicate' : r.filtered ? 'filtered' : 'queued', check.how);
        return json(res, 200, { ok: true, channel, externalEventId: ev.externalEventId,
          outcome: r.duplicate ? 'already had it' : r.filtered ? 'filtered out before the queue' : 'waiting to be looked at',
          inboundId: r.id, verified: check.how });
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
        const r = receive(db, toIntake(ev));
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
      return json(res, 200, buildReport(db, {
        from: url.searchParams.get('from'), to: url.searchParams.get('to') }));
    }

    if (req.method === 'GET' && p === '/api/report/sections') {
      return json(res, 200, { sections: EXPORT_SECTIONS, defaults: DEFAULT_SECTIONS });
    }

    if (req.method === 'GET' && p === '/api/report.csv') {
      const picked = (url.searchParams.get('sections') || '').split(',').filter(Boolean);
      const rows = reportRows(db, { from: url.searchParams.get('from'),
        to: url.searchParams.get('to'), sections: picked });
      const csv = rows.map((r) => (r || []).map((c) =>
        `"${String(c === undefined || c === null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const stamp = new Date().toISOString().slice(0, 10);
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="academy-crm-kpi-${stamp}.csv"` });
      return res.end('\ufeff' + csv);
    }

    // ------------------------------------------------- real and demo state -
    if (req.method === 'GET' && p === '/api/console/state') {
      return json(res, 200, { ...modeState(), dataset: DATASET, realAvailable: hasRealData() });
    }

    // Switching to demo, resetting demo, and restoring real data are all
    // destructive, so each one requires the caller to say what it is doing.
    // A typo in a fetch must not be able to wipe the real database.
    if (req.method === 'POST' && p === '/api/console/mode') {
      const b = await body(req);
      const want = String(b.mode || '');
      if (b.confirm !== 'yes') {
        return json(res, 428, { error: 'this replaces everything in the database',
          needsConfirm: true, mode: want, currently: modeState() });
      }

      if (want === 'demo') {
        // never overwrite the real snapshot on the way in
        clearAll();
        const info = buildDemo(db, CONFIG);
        setMode('demo');
        DATASET = { dataset: 'demo', people: info.total,
          selection: 'a deliberately small demo environment, built through the real inbound path' };
        return json(res, 200, { ok: true, ...modeState(), built: info });
      }

      if (want === 'real') {
        if (!snapshot.exists()) {
          if (!hasRealData()) return json(res, 409, { error: 'there is no real data on this machine' });
          const info = loadDataset('real');
          return json(res, 200, { ok: true, ...modeState(), loaded: info, from: 'source file' });
        }
        const r = snapshot.restore(db);
        if (r.error) return json(res, 500, { error: r.error });
        setMode('real');
        DATASET = { dataset: 'real', people: r.counts.people,
          selection: 'restored from the clean snapshot taken when the real database was loaded' };
        return json(res, 200, { ok: true, ...modeState(), restored: r, from: 'snapshot' });
      }

      if (want === 'empty') {
        clearAll();
        setMode('empty');
        DATASET = { dataset: 'empty', people: 0, selection: 'an empty database' };
        return json(res, 200, { ok: true, ...modeState() });
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

    if (req.method === 'POST' && p === '/api/console/send') {
      const b = await body(req);
      const channel = String(b.channel || '');
      const scenario = String(b.scenario || 'study_enquiry');
      if (!hasAdapter(channel)) return json(res, 400, { error: 'unknown channel: ' + channel });

      // an existing-person scenario borrows a real person's details, so the
      // duplicate check fires for a genuine reason rather than a rigged one
      let existing = null;
      if (b.person === 'existing' || scenario === 'existing_person' || scenario === 'duplicate_attempt') {
        existing = db.prepare(`SELECT name, email, phone FROM people
          WHERE (email IS NOT NULL OR phone IS NOT NULL) ORDER BY created_at DESC LIMIT 1`).get() || null;
        if (!existing) return json(res, 409, {
          error: 'there is nobody in the database yet, so there is nobody to match against',
          how: 'load some demo data first' });
      }

      const payload = buildPayload(channel, scenario, { sameId: b.sameId === true, existing,
        message: typeof b.message === 'string' && b.message.trim() ? b.message.trim() : null });
      try {
        const ev = adapt(channel, payload);
        const r = receive(db, toIntake(ev));
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
        const row = db.prepare(`SELECT COUNT(*) n, MAX(received_at) last FROM inbound WHERE channel = ?`).get(id);
        const ok = db.prepare(`SELECT MAX(received_at) last FROM inbound WHERE channel = ? AND state != 'filtered'`).get(id);
        counts[id] = { events: row.n, lastEventAt: row.last, lastSuccessAt: ok.last };
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
      const rows = db.prepare(`SELECT i.id, i.channel, i.external_id, i.received_at, i.state,
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
      const saved = saveFeedback(db, {
        kind: readKind(b.kind),
        body: readBody(b.body),
        path: readPath(b.path),
        screenshot: readScreenshot(b.screenshot),
        by: actorOf(req, b),
        at: nowIso(),
      });
      return json(res, 200, { ok: true, ...saved });
    }

    // The notification. Nothing in this app can send an email, so being told
    // happens inside the app: a count of what has not been handled yet.
    if (req.method === 'GET' && p === '/api/feedback/waiting') {
      const who = viewerOf(req, url);
      if (!canReadFeedback(who)) return json(res, 200, { open: 0, mayRead: false });
      return json(res, 200, { mayRead: true,
        open: db.prepare('SELECT COUNT(*) n FROM feedback WHERE handled_at IS NULL').get().n,
        readers: FEEDBACK_READERS });
    }

    if (req.method === 'GET' && p === '/api/admin/feedback') {
      if (!canReadFeedback(viewerOf(req, url)))
        return json(res, 403, { error: `the feedback inbox is for ${FEEDBACK_READERS.join(' and ')} only` });
      return json(res, 200, { rows: listFeedback(db) });
    }

    if (req.method === 'GET' && /^\/api\/admin\/feedback\/\d+\/screenshot$/.test(p)) {
      if (!canReadFeedback(viewerOf(req, url)))
        return json(res, 403, { error: `the feedback inbox is for ${FEEDBACK_READERS.join(' and ')} only` });
      const shot = getScreenshot(db, Number(p.split('/')[4]));
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
      if (!canReadFeedback(viewerOf(req, url)))
        return json(res, 403, { error: `the feedback inbox is for ${FEEDBACK_READERS.join(' and ')} only` });
      const b = await body(req);
      const r = setHandled(db, Number(p.split('/')[4]), Boolean(b.handled), actorOf(req, b), nowIso());
      return r.error ? json(res, 404, r) : json(res, 200, r);
    }

    return json(res, 404, { error: 'not found' });
  } catch (err) {
    if (err instanceof BadScreenshot) return json(res, 400, { error: err.message });
    return json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => console.log(`Academy CRM prototype on http://localhost:${PORT}`));
