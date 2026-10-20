// THE GRAND OPENING (21.10.2026): the owner's pick G1, board 5, "Grand Opening" in the Training Centre menu with Not
// reached, Audience and Delivery; the invitation page is his Client Hub pick (Q6a 16.10, labels C7 20.10) redrawn in
// Intake. Client Hub is untouched: its figures come in through an admin import of a read-only extract
// (_training-centre/tools/go_extract.mjs), and that extract carries no name and no address.
//
//   IMPORT   go_guests.csv, go_sends.csv, go_deliveries.csv. PREVIEW writes nothing and answers counts (and the page's
//            figures as they would be); APPLY needs the preview's hash, runs in one transaction, writes only what
//            changed (a second apply of the same files changes nothing) and logs itself in tc_go_imports. A guest the
//            newer extract no longer has is marked gone, never deleted.
//   THE PAGE the cards (sent, reached, not reached, not in the invitation), What came back (per reached guest, the
//            best over every send that reached them: a person, can't tell, a security scanner only, no open), the
//            three boxes. Words from config/tc.json grandOpening.
//   PEOPLE   who a guest is, read live: the Intake contact with that Client Hub id, else the review list's row, else an
//            Intake contact with the same email address (its hash), else the company as Client Hub writes it.

import crypto from 'node:crypto';
import { TC, TcInputError } from './tc.js';
import { ImportError, parseCsv } from './tcimport.js';

const GO = TC.grandOpening;
const INV = new Map(GO.invitation.map((s) => [s.id, s]));
const BACK = GO.cameBack.map((c) => c.id);
const RANK = { person: 3, cant_tell: 2, scanner: 1, none: 0 };
const DELIVERY = ['delivered', 'soft_bounce', 'hard_bounce'];
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const emailSha = (email) => sha(String(email || '').trim().toLowerCase()).slice(0, 32);
const txt = (v, n = 300) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
const flag = (v) => (String(v ?? '').trim() === '1' || String(v).trim() === 'true' ? 1 : 0);
const nowIso = () => new Date().toISOString();

const NEEDS = {
  'go_guests.csv': ['ch_contact_id', 'company', 'country', 'email_sha', 'state', 'reason_code', 'opted_out'],
  'go_sends.csv': ['send', 'label', 'first_sent_at', 'read_at'],
  'go_deliveries.csv': ['ch_contact_id', 'send', 'delivery', 'open', 'click', 'calendar', 'opted_out'],
};

// ------------------------------------------------------------------ the figures, from rows in memory --

/** guests [{ id, invitation }], deliveries [{ guest_id, delivery, came_back, clicked, calendar, opted_out }] */
export function figures(guests, deliveries) {
  const per = new Map();
  for (const d of deliveries) {
    if (d.delivery !== 'delivered') continue;
    const p = per.get(d.guest_id) || { back: 'none', clicked: 0, calendar: 0, optedOut: 0 };
    const b = BACK.includes(d.came_back) ? d.came_back : 'none';
    if (RANK[b] > RANK[p.back]) p.back = b;
    if (Number(d.clicked)) p.clicked = 1;
    if (Number(d.calendar)) p.calendar = 1;
    if (Number(d.opted_out)) p.optedOut = 1;
    per.set(d.guest_id, p);
  }
  const by = (id) => guests.filter((g) => g.invitation === id).length;
  const group = (gr) => GO.invitation.filter((s) => s.group === gr).map((s) => ({ id: s.id, label: s.label, n: by(s.id) }));
  const reachedGuests = guests.filter((g) => g.invitation === 'reached');
  const back = Object.fromEntries(BACK.map((b) => [b, 0]));
  let clicked = 0, calendar = 0, optedOutNoOpen = 0, optedOut = 0;
  for (const g of reachedGuests) {
    const p = per.get(g.id) || { back: 'none', clicked: 0, calendar: 0, optedOut: 0 };
    const b = GO.clickCountsAsPerson && p.clicked ? 'person' : p.back;
    back[b] += 1;
    clicked += p.clicked;
    calendar += p.calendar;
    if (p.optedOut || Number(g.opted_out)) { optedOut += 1; if (b === 'none') optedOutNoOpen += 1; }
  }
  const notReached = group('notReached'), notIn = group('notIn');
  const nr = notReached.reduce((n, x) => n + x.n, 0), ni = notIn.reduce((n, x) => n + x.n, 0);
  return {
    sent: reachedGuests.length + nr, reached: reachedGuests.length, notReached: nr, notIn: ni,
    notReachedWhy: notReached, notInWhy: notIn,
    cameBack: GO.cameBack.map((c) => ({ id: c.id, label: c.label, n: back[c.id] })),
    clicked, calendar, optedOut, optedOutNoOpen,
  };
}

// ------------------------------------------------------------------ the import --

function readAll(files) {
  const out = {};
  for (const name of GO.files) {
    const rows = parseCsv(files[name]);
    const missing = NEEDS[name].filter((c) => !rows.columns.includes(c));
    if (missing.length) throw new ImportError(`${name} is missing the column${missing.length > 1 ? 's' : ''} ${missing.join(', ')}.`);
    out[name] = rows;
  }
  return out;
}

export function plan(files) {
  const f = readAll(files);
  const rejected = [];
  const guests = new Map();
  f['go_guests.csv'].forEach((r, i) => {
    const id = txt(r.ch_contact_id, 80);
    const state = String(r.state || '').trim();
    if (!id) return rejected.push({ file: 'go_guests.csv', line: i + 2, reason: 'no Client Hub contact id' });
    if (guests.has(id)) return rejected.push({ file: 'go_guests.csv', line: i + 2, reason: 'the same guest twice' });
    if (!INV.has(state)) return rejected.push({ file: 'go_guests.csv', line: i + 2, reason: `an invitation state not known: ${state || 'none'}` });
    guests.set(id, { ch: id, company: txt(r.company, 200), country: txt(r.country, 80), sha: /^[0-9a-f]{32}$/.test(String(r.email_sha).trim()) ? String(r.email_sha).trim() : null,
      invitation: state, reason: txt(r.reason_code, 80), optedOut: flag(r.opted_out) });
  });
  const sends = new Map();
  f['go_sends.csv'].forEach((r, i) => {
    const key = txt(r.send, 40), label = txt(r.label, 60);
    if (!key || !label) return rejected.push({ file: 'go_sends.csv', line: i + 2, reason: 'a send with no key or no label' });
    if (sends.has(key)) return rejected.push({ file: 'go_sends.csv', line: i + 2, reason: 'the same send twice' });
    sends.set(key, { key, label, first: txt(r.first_sent_at, 40), read: txt(r.read_at, 40) });
  });
  const deliveries = new Map();
  f['go_deliveries.csv'].forEach((r, i) => {
    const g = txt(r.ch_contact_id, 80), s = txt(r.send, 40), d = String(r.delivery || '').trim();
    const line = i + 2;
    if (!guests.has(g)) return rejected.push({ file: 'go_deliveries.csv', line, reason: 'a guest not in go_guests.csv' });
    if (!sends.has(s)) return rejected.push({ file: 'go_deliveries.csv', line, reason: 'a send not in go_sends.csv' });
    if (!DELIVERY.includes(d)) return rejected.push({ file: 'go_deliveries.csv', line, reason: `a delivery not known: ${d || 'none'}` });
    const back = String(r.open || '').trim();
    deliveries.set(g + '|' + s, { ch: g, send: s, delivery: d, back: d === 'delivered' ? (BACK.includes(back) ? back : 'none') : null,
      clicked: flag(r.click), calendar: flag(r.calendar), optedOut: flag(r.opted_out) });
  });
  const hash = sha(JSON.stringify({ v: 1, files: GO.files.map((n) => sha(String(files[n]))) }));
  return { hash, guests, sends, deliveries, rejected };
}

const same = (a, b) => (a ?? null) === (b ?? null);

export async function previewImport(db, files) {
  const p = plan(files);
  const hereG = new Map((await db.prepare('SELECT * FROM tc_go_guests').all()).map((r) => [r.ch_contact_id, r]));
  const hereS = new Map((await db.prepare('SELECT * FROM tc_go_sends').all()).map((r) => [r.send_key, r]));
  const hereD = new Map((await db.prepare(`SELECT g.ch_contact_id, s.send_key, d.* FROM tc_go_deliveries d
    JOIN tc_go_guests g ON g.id = d.guest_id JOIN tc_go_sends s ON s.id = d.send_id`).all()).map((r) => [r.ch_contact_id + '|' + r.send_key, r]));
  const k = { guests: { inFile: p.guests.size, new: 0, changed: 0, same: 0, goneNow: 0 }, sends: { inFile: p.sends.size, new: 0, changed: 0, same: 0 },
    deliveries: { inFile: p.deliveries.size, new: 0, changed: 0, same: 0 } };
  for (const g of p.guests.values()) {
    const h = hereG.get(g.ch);
    g.change = !h ? 'new' : (same(h.ch_company, g.company) && same(h.country, g.country) && same(h.email_sha, g.sha) && h.invitation === g.invitation
      && same(h.reason_code, g.reason) && Number(h.opted_out) === g.optedOut && !Number(h.gone)) ? 'same' : 'changed';
    k.guests[g.change] += 1;
  }
  const gone = [...hereG.values()].filter((h) => !p.guests.has(h.ch_contact_id) && !Number(h.gone));
  k.guests.goneNow = gone.length;
  for (const s of p.sends.values()) {
    const h = hereS.get(s.key);
    s.change = !h ? 'new' : (h.label === s.label && same(h.first_sent_at, s.first) && same(h.read_at, s.read)) ? 'same' : 'changed';
    k.sends[s.change] += 1;
  }
  for (const d of p.deliveries.values()) {
    const h = hereD.get(d.ch + '|' + d.send);
    d.change = !h ? 'new' : (h.delivery === d.delivery && same(h.came_back, d.back) && Number(h.clicked) === d.clicked && Number(h.calendar) === d.calendar
      && Number(h.opted_out) === d.optedOut) ? 'same' : 'changed';
    k.deliveries[d.change] += 1;
  }
  // the page as these files would draw it
  const gl = [...p.guests.values()].map((g) => ({ id: g.ch, invitation: g.invitation, opted_out: g.optedOut }));
  const dl = [...p.deliveries.values()].map((d) => ({ guest_id: d.ch, delivery: d.delivery, came_back: d.back, clicked: d.clicked, calendar: d.calendar, opted_out: d.optedOut }));
  const counts = { hash: p.hash, ...k, rejected: p.rejected.length, rejectedRows: p.rejected.slice(0, 50), page: figures(gl, dl) };
  return { counts, plan: { ...p, gone } };
}

async function upsert(tx, table, cols, rows, conflict, chunk = 200) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    await tx.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES ${part.map(() => '(' + cols.map(() => '?').join(',') + ')').join(',')}
      ON CONFLICT (${conflict.join(', ')}) DO UPDATE SET ${cols.filter((c) => !conflict.includes(c) && c !== 'imported_at').map((c) => `${c} = excluded.${c}`).join(', ')}`)
      .run(...part.flat());
  }
}

export async function applyImport(db, files, { hash } = {}, actor = 'admin') {
  if (!hash) throw new ImportError('Run the preview first and send its hash: nothing is written without it.');
  const { counts, plan: p } = await previewImport(db, files);
  if (hash !== p.hash) throw new ImportError('The files are not the ones previewed. Run the preview again.');
  const at = nowIso();
  const changed = counts.guests.new + counts.guests.changed + counts.guests.goneNow + counts.sends.new + counts.sends.changed
    + counts.deliveries.new + counts.deliveries.changed;
  if (!changed) return { applied: true, changed: 0, ...counts };
  await db.transaction(async (tx) => {
    const g = [...p.guests.values()].filter((x) => x.change !== 'same');
    await upsert(tx, 'tc_go_guests', ['ch_contact_id', 'ch_company', 'country', 'email_sha', 'invitation', 'reason_code', 'opted_out', 'gone', 'imported_at', 'updated_at'],
      g.map((x) => [x.ch, x.company, x.country, x.sha, x.invitation, x.reason, x.optedOut, 0, at, at]), ['ch_contact_id']);
    for (const h of p.gone) await tx.prepare('UPDATE tc_go_guests SET gone = 1, updated_at = ? WHERE id = ?').run(at, h.id);
    const s = [...p.sends.values()].filter((x) => x.change !== 'same');
    await upsert(tx, 'tc_go_sends', ['send_key', 'label', 'first_sent_at', 'read_at', 'imported_at'], s.map((x) => [x.key, x.label, x.first, x.read, at]), ['send_key']);
    const gid = new Map((await tx.prepare('SELECT id, ch_contact_id FROM tc_go_guests').all()).map((r) => [r.ch_contact_id, Number(r.id)]));
    const sid = new Map((await tx.prepare('SELECT id, send_key FROM tc_go_sends').all()).map((r) => [r.send_key, Number(r.id)]));
    const d = [...p.deliveries.values()].filter((x) => x.change !== 'same');
    await upsert(tx, 'tc_go_deliveries', ['guest_id', 'send_id', 'delivery', 'came_back', 'clicked', 'calendar', 'opted_out'],
      d.map((x) => [gid.get(x.ch), sid.get(x.send), x.delivery, x.back, x.clicked, x.calendar, x.optedOut]), ['guest_id', 'send_id']);
    const { page, rejectedRows, ...log } = counts;
    await tx.prepare('INSERT INTO tc_go_imports (hash, counts, applied_at, applied_by) VALUES (?,?,?,?)').run(p.hash, JSON.stringify({ ...log, page }), at, actor);
  });
  return { applied: true, changed, ...counts };
}

// ------------------------------------------------------------------ the page --

async function loaded(db) {
  const guests = await db.prepare('SELECT id, ch_contact_id, ch_company, country, email_sha, invitation, reason_code, opted_out FROM tc_go_guests WHERE gone = 0').all();
  const deliveries = await db.prepare(`SELECT d.guest_id, d.send_id, d.delivery, d.came_back, d.clicked, d.calendar, d.opted_out FROM tc_go_deliveries d
    JOIN tc_go_guests g ON g.id = d.guest_id WHERE g.gone = 0`).all();
  return { guests: guests.map((g) => ({ ...g, id: Number(g.id) })), deliveries: deliveries.map((d) => ({ ...d, guest_id: Number(d.guest_id), send_id: Number(d.send_id) })) };
}

export async function goCount(db) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM tc_go_guests WHERE gone = 0').get();
  if (!Number(r.n)) return { guests: 0, notReached: 0 };
  const n = await db.prepare(`SELECT COUNT(*) AS n FROM tc_go_guests WHERE gone = 0 AND invitation IN (${GO.invitation.filter((s) => s.group === 'notReached').map(() => '?').join(',')})`)
    .get(...GO.invitation.filter((s) => s.group === 'notReached').map((s) => s.id));
  return { guests: Number(r.n), notReached: Number(n.n) };
}

export async function goPage(db) {
  const { guests, deliveries } = await loaded(db);
  const last = await db.prepare('SELECT applied_at, applied_by FROM tc_go_imports ORDER BY id DESC LIMIT 1').get();
  const read = await db.prepare('SELECT MAX(read_at) AS r FROM tc_go_sends').get();
  return { event: GO.event, imported: last ? { at: last.applied_at } : null, readAt: read ? read.r : null,
    figures: guests.length ? figures(guests, deliveries) : null };
}

/** Who each guest is in Intake, read live; never a name copied into the guest rows. */
async function whoIs(db, guests) {
  const byCh = new Map((await db.prepare(`SELECT k.id, k.company_id, k.name, k.email, k.position, k.ch_contact_id, c.name AS company FROM tc_company_contacts k
    JOIN tc_companies c ON c.id = k.company_id WHERE k.archived_at IS NULL AND c.archived_at IS NULL`).all()).flatMap((k) => {
    const row = { contactId: Number(k.id), companyId: Number(k.company_id), name: k.name || '', email: k.email || '', position: k.position || '', company: k.company };
    return [[k.ch_contact_id ? 'ch:' + k.ch_contact_id : null, row], [k.email ? 'sha:' + emailSha(k.email) : null, row]].filter(([key]) => key);
  }).reverse());
  const review = new Map((await db.prepare(`SELECT id, ch_contact_id, name, email, position, ch_company, status FROM tc_review_contacts`).all())
    .map((r) => [r.ch_contact_id, r]));
  return guests.map((g) => {
    const k = byCh.get('ch:' + g.ch_contact_id) || (g.email_sha ? byCh.get('sha:' + g.email_sha) : null);
    if (k) return { ...k, onReview: false };
    const r = review.get(g.ch_contact_id);
    if (r && r.status === 'open') return { name: r.name || '', email: r.email || '', position: r.position || '', company: r.ch_company || g.ch_company || '', companyId: null, onReview: true };
    return { name: '', email: '', position: '', company: g.ch_company || '', companyId: null, onReview: false };
  });
}

/** group: notReached | notIn | reached | all; state: one invitation id */
export async function goPeople(db, { group = 'notReached', state = '' } = {}) {
  const { guests, deliveries } = await loaded(db);
  const ids = GO.invitation.filter((s) => group === 'all' || s.group === group).map((s) => s.id);
  if (state && !INV.has(state)) throw new TcInputError('There is no such invitation state.');
  const list = guests.filter((g) => (state ? g.invitation === state : ids.includes(g.invitation)));
  const back = new Map();
  for (const d of deliveries) {
    if (d.delivery !== 'delivered') continue;
    const b = GO.clickCountsAsPerson && Number(d.clicked) ? 'person' : (BACK.includes(d.came_back) ? d.came_back : 'none');
    const cur = back.get(d.guest_id);
    if (cur === undefined || RANK[b] > RANK[cur]) back.set(d.guest_id, b);
  }
  const who = await whoIs(db, list);
  const rows = list.map((g, i) => ({ id: g.id, invitation: g.invitation, why: INV.get(g.invitation).label, cameBack: g.invitation === 'reached' ? (back.get(g.id) || 'none') : null,
    country: g.country || '', ...who[i] }))
    .sort((a, b) => GO.invitation.findIndex((s) => s.id === a.invitation) - GO.invitation.findIndex((s) => s.id === b.invitation)
      || String(a.company).localeCompare(String(b.company), 'lv') || String(a.name).localeCompare(String(b.name), 'lv'));
  const tally = Object.fromEntries(GO.invitation.filter((s) => ids.includes(s.id)).map((s) => [s.id, guests.filter((g) => g.invitation === s.id).length]));
  return { group, state, states: GO.invitation.filter((s) => ids.includes(s.id)), tally, cameBack: GO.cameBack, rows };
}

export async function goSends(db) {
  const sends = await db.prepare('SELECT id, send_key, label, first_sent_at, read_at FROM tc_go_sends ORDER BY first_sent_at, send_key').all();
  const { deliveries } = await loaded(db);
  return { sends: sends.map((s) => {
    const d = deliveries.filter((x) => x.send_id === Number(s.id));
    const del = d.filter((x) => x.delivery === 'delivered');
    const back = (b) => del.filter((x) => (GO.clickCountsAsPerson && Number(x.clicked) ? 'person' : x.came_back || 'none') === b).length;
    return { id: Number(s.id), label: s.label, firstSentAt: s.first_sent_at, readAt: s.read_at, sent: d.length, delivered: del.length,
      hard: d.filter((x) => x.delivery === 'hard_bounce').length, soft: d.filter((x) => x.delivery === 'soft_bounce').length,
      person: back('person'), cantTell: back('cant_tell'), scanner: back('scanner'), none: back('none'),
      clicked: del.filter((x) => Number(x.clicked)).length, calendar: del.filter((x) => Number(x.calendar)).length };
  }), cameBack: GO.cameBack };
}
