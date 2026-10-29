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
import { TC, TcInputError, setContactEmail, listCompanies, searchPeople } from './tc.js';
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

// THE GUESTS, REUSED (the owner's pick "TC pages lighter", 29.10.2026): they change only with an import, so they are read
// again only when the import log, the guest count or the delivery count moves, or after 60 s; each caller gets copies
let GO_CACHE = null;   // { db, stamp, at, guests, deliveries }
async function loaded(db) {
  const stamp = JSON.stringify(await db.prepare(`SELECT (SELECT MAX(id) FROM tc_go_imports) AS i, (SELECT COUNT(*) FROM tc_go_guests) AS g,
    (SELECT MAX(COALESCE(updated_at, imported_at)) FROM tc_go_guests) AS u, (SELECT COUNT(*) FROM tc_go_deliveries) AS d`).get());
  const C = GO_CACHE;
  if (!(C && C.db === db && C.stamp === stamp && Date.now() - C.at < 60000)) GO_CACHE = { db, stamp, at: Date.now(), ...(await readLoaded(db)) };
  return { guests: GO_CACHE.guests.map((g) => ({ ...g })), deliveries: GO_CACHE.deliveries.map((d) => ({ ...d })) };
}
async function readLoaded(db) {
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
  return { event: GO.event, stage2: { packStatus: (GO.stage2 && GO.stage2.packStatus) || {} }, imported: last ? { at: last.applied_at } : null, readAt: read ? read.r : null,
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

// ------------------------------------------------------------------ the stage 2 lists per manager --
// The owner's pick A (26.10.2026): a tab per manager, the people that manager sends the RSVP email to, an answer on the
// row when one comes in (read live by the caller, src/tcrsvp.js), answered people first. No "answered" totals.
const S2 = (GO.stage2 && GO.stage2.senders) || [];
const NO_SENDER = 'Not in the Stage 2 split';
const S2_CODES = new Set(S2.map((s) => s.code));

/**
 * Load the sender split: rows [{ ch_contact_id, sender, name, company, position, country, email }]. Without apply it only
 * counts (per sender, new, moved to another sender, gone). With apply it writes in one transaction: a new row is added,
 * a known one takes the newer sender and details, one the split no longer has is marked gone.
 */
export async function stage2Load(db, rows, actor, { apply = false } = {}) {
  const seen = new Set();
  const clean = rows.map((r, i) => {
    const id = txt(r.ch_contact_id, 60);
    if (!id) throw new TcInputError(`Row ${i + 2} has no Client Hub id.`);
    if (seen.has(id)) throw new TcInputError(`${id} is in the split twice.`);
    seen.add(id);
    if (!S2_CODES.has(String(r.sender))) throw new TcInputError(`Row ${i + 2}: unknown sender ${String(r.sender).slice(0, 20)}.`);
    const email = txt(r.email, 200);
    return { id, sender: String(r.sender), name: txt(r.name, 160), company: txt(r.company, 200), position: txt(r.position, 160),
      country: txt(r.country, 80), email: email ? email.toLowerCase() : null };
  });
  const old = new Map((await db.prepare('SELECT ch_contact_id, sender, gone FROM tc_go_stage2').all()).map((r) => [r.ch_contact_id, r]));
  const counts = { rows: clean.length, perSender: Object.fromEntries(S2.map((s) => [s.code, clean.filter((r) => r.sender === s.code).length])),
    added: clean.filter((r) => !old.has(r.id)).length,
    moved: clean.filter((r) => old.has(r.id) && old.get(r.id).sender !== r.sender).length,
    gone: [...old.values()].filter((o) => !Number(o.gone) && !seen.has(o.ch_contact_id)).length };
  if (!apply) return { counts };
  const at = nowIso();
  await db.transaction(async (tx) => {
    for (const r of clean) {
      if (old.has(r.id)) {
        await tx.prepare(`UPDATE tc_go_stage2 SET sender = ?, name = ?, company = ?, position = ?, country = ?, email = ?, gone = 0, loaded_at = ?, loaded_by = ?
          WHERE ch_contact_id = ?`).run(r.sender, r.name, r.company, r.position, r.country, r.email, at, actor, r.id);
      } else {
        await tx.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, position, country, email, gone, loaded_at, loaded_by)
          VALUES (?,?,?,?,?,?,?,0,?,?)`).run(r.id, r.sender, r.name, r.company, r.position, r.country, r.email, at, actor);
      }
    }
    for (const o of old.values()) {
      if (!Number(o.gone) && !seen.has(o.ch_contact_id)) await tx.prepare('UPDATE tc_go_stage2 SET gone = 1, loaded_at = ?, loaded_by = ? WHERE ch_contact_id = ?').run(at, actor, o.ch_contact_id);
    }
  });
  return { counts, applied: true };
}

/** The tabs: [{ code, label, n }] in the configured order (only managers with a list), and which one is mine. */
export async function stage2Senders(db, me = null) {
  const n = new Map((await db.prepare('SELECT sender, COUNT(*) AS n FROM tc_go_stage2 WHERE gone = 0 GROUP BY sender').all()).map((r) => [r.sender, Number(r.n)]));
  const mail = String((me && me.email) || '').toLowerCase();
  const mine = (S2.find((s) => s.email === mail) || {}).code || null;
  return { senders: S2.filter((s) => n.get(s.code)).map((s) => ({ code: s.code, label: s.label, n: n.get(s.code) })), mine };
}

/**
 * One manager's list. answers: [{ chContactId, answer, people, at }] (src/tcrsvp.js answers(), or null when not connected).
 * Answered people first (newest first), then by name. A person Intake knows links to their company.
 */
export async function stage2List(db, code, answers = null) {
  if (!S2_CODES.has(String(code))) throw new TcInputError('There is no such list.');
  const rows = await db.prepare(`SELECT s.ch_contact_id, s.name, s.company, s.position, s.country, s.email, k.company_id, k.id AS contact_id
    FROM tc_go_stage2 s LEFT JOIN tc_company_contacts k ON k.ch_contact_id = s.ch_contact_id AND k.archived_at IS NULL
    WHERE s.sender = ? AND s.gone = 0`).all(String(code));
  const ans = new Map((answers || []).map((a) => [a.chContactId, a]));
  const markOf = await markedFor(db, 'stage2');
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.ch_contact_id) ? false : seen.add(r.ch_contact_id))).map((r) => {
    const a = ans.get(r.ch_contact_id);
    return { name: r.name || '', company: r.company || '', position: r.position || '', country: r.country || '', email: r.email || '',
      companyId: r.company_id ? Number(r.company_id) : null, answer: a ? a.answer : null, people: a ? a.people : null, at: a ? a.at : null,
      marked: markOf(r.company_id, r.contact_id) };
  }).sort((x, y) => (Boolean(y.answer) - Boolean(x.answer)) || String(y.at || '').localeCompare(String(x.at || ''))
    || String(x.name).localeCompare(String(y.name), 'lv'));
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

// ------------------------------------------------------------------ fix an address that bounced --
// The owner's pick A (26.10.2026): the not reached guests Intake holds as a contact, by person in charge (Mine / Team),
// each with a field for the new address. Saving changes the Intake contact's address (logged on its company) and keeps
// the fix in tc_go_fixes. A fix waits in "Fixed, waiting for the next send" (a file for whoever runs the send) until
// Client Hub's extract carries the new address. Intake writes nothing into Client Hub; a guest Intake holds no contact
// for is fixed in Client Hub, as before.
const NR = GO.invitation.filter((s) => s.group === 'notReached').map((s) => s.id);

async function bounceRows(db) {
  const guests = (await loaded(db)).guests.filter((g) => NR.includes(g.invitation));
  const fixes = new Map((await db.prepare(`SELECT f.id, f.guest_id, f.contact_id, f.old_email, f.new_email, f.fixed_at, f.fixed_by FROM tc_go_fixes f
    WHERE f.id IN (SELECT MAX(id) FROM tc_go_fixes GROUP BY guest_id)`).all()).map((f) => [Number(f.guest_id), f]));
  const contacts = new Map((await db.prepare(`SELECT k.id, k.company_id, k.name, k.email, k.ch_contact_id, c.name AS company, c.pic_name, c.pic_email
    FROM tc_company_contacts k JOIN tc_companies c ON c.id = k.company_id WHERE k.archived_at IS NULL AND c.archived_at IS NULL`).all())
    .map((k) => [Number(k.id), k]));
  const who = await whoIs(db, guests);
  return guests.map((g, i) => {
    const f = fixes.get(g.id) || null;
    // a fixed guest stays with the contact the fix changed (its address no longer matches the one that bounced)
    const k = contacts.get(Number(f ? f.contact_id : who[i].contactId)) || null;
    return { g, f, k, onReview: who[i].onReview };
  });
}
const waitingFix = (g, f) => Boolean(f) && emailSha(f.new_email) !== g.email_sha;

/** { rows (Intake contacts only), total, onlyCh, waiting }; each row grouped under its Stage 2 sender and whether it is mine.
 *  The owner's pick A, 29.10.2026: grouped by the Stage 2 sender from AB's split (who sends that contact the RSVP), not by
 *  the TC Excel's Person in charge (it named people who never handed over a contact, and left 72 under "Nobody yet"). */
export async function bounceList(db, me = null) {
  const all = await bounceRows(db);
  const split = new Map((await db.prepare('SELECT ch_contact_id, sender FROM tc_go_stage2 WHERE gone = 0').all()).map((r) => [String(r.ch_contact_id), r.sender]));
  const byCode = new Map(S2.map((s) => [s.code, s]));
  const myEmail = me && me.email ? String(me.email).toLowerCase() : '';
  const rows = all.filter((x) => x.k).map(({ g, f, k }) => {
    const s = byCode.get(split.get(String(g.ch_contact_id)));
    const pic = s ? s.name || s.label : NO_SENDER;
    return { guestId: g.id, hard: g.invitation === 'bounced_hard', why: INV.get(g.invitation).label, contactId: Number(k.id), companyId: Number(k.company_id),
      company: k.company, name: k.name || '', email: f ? f.old_email || '' : k.email || '', fixed: f ? f.new_email : null, pic,
      mine: Boolean(s && myEmail && String(s.email || '').toLowerCase() === myEmail) };
  }).sort((a, b) => (a.pic === NO_SENDER ? 1 : 0) - (b.pic === NO_SENDER ? 1 : 0) || a.pic.localeCompare(b.pic, 'lv') || String(a.company).localeCompare(String(b.company), 'lv')
    || String(a.name).localeCompare(String(b.name), 'lv'));
  return { rows, total: rows.length, onlyCh: all.filter((x) => !x.k && !x.onReview).length, waiting: all.filter((x) => x.k && waitingFix(x.g, x.f)).length };
}

/** Save a new address for one not reached guest that Intake holds as a contact. */
export async function bounceFix(db, guestId, email, actor) {
  const all = await bounceRows(db);
  const x = all.find((r) => r.g.id === Number(guestId));
  if (!x) throw new TcInputError('This person is not on the not reached list.');
  if (!x.k) throw new TcInputError('Intake holds no contact for this person: the address is fixed in Client Hub.');
  const at = nowIso();
  return db.transaction(async (tx) => {
    const to = await setContactEmail(tx, x.k, email, actor, at);
    // the contact keeps its Client Hub id, so the other Grand Opening lists still find it under the new address
    if (!x.k.ch_contact_id && !(await tx.prepare('SELECT id FROM tc_company_contacts WHERE ch_contact_id = ? AND archived_at IS NULL').get(x.g.ch_contact_id))) {
      await tx.prepare('UPDATE tc_company_contacts SET ch_contact_id = ? WHERE id = ?').run(x.g.ch_contact_id, x.k.id);
    }
    await tx.prepare('INSERT INTO tc_go_fixes (guest_id, contact_id, old_email, new_email, fixed_at, fixed_by) VALUES (?,?,?,?,?,?)')
      .run(x.g.id, x.k.id, x.f ? x.f.old_email : x.k.email || null, to, at, actor);
    return { guestId: x.g.id, fixed: to };
  });
}

/** The fixes waiting for the next send, for the file. */
export async function bounceWaiting(db) {
  return (await bounceRows(db)).filter((x) => x.k && waitingFix(x.g, x.f)).map(({ g, f, k }) => ({ chContactId: g.ch_contact_id, company: k.company,
    name: k.name || '', oldEmail: f.old_email || '', newEmail: f.new_email, fixedAt: f.fixed_at, fixedBy: f.fixed_by || '' }))
    .sort((a, b) => String(a.company).localeCompare(String(b.company), 'lv') || String(a.name).localeCompare(String(b.name), 'lv'));
}

// ------------------------------------------------------------------ do not invite / hold --
// The owner's rule (28.10.2026): "Invite or no should be A CAMPAIGN OR EVENT SPECIFIC!" A mark is always for this event
// (every send) or one of its sends (Stage 2 RSVP only), on a whole company or one person; layout B, the list lives on the
// event's page. A hold is temporary (check the company first): Release ends it, Make final turns it into a do-not-invite.
// Nothing is deleted. Intake writes nothing into Client Hub; the file is for whoever runs the send.
const INVITE = GO.invite || { event: 'go', sends: [], why: [] };
const SENDS = new Map(INVITE.sends.map((x) => [x.id, x]));
const WHY = new Map(INVITE.why.map((x) => [x.id, x]));

async function activeMarks(db, where = '', ...args) {
  return db.prepare(`SELECT m.id, m.send, m.why, m.kind, m.company_id, m.contact_id, m.marked_at, m.marked_by, m.final_at, c.name AS company,
    k.name AS person, k.email FROM tc_invite_marks m JOIN tc_companies c ON c.id = m.company_id LEFT JOIN tc_company_contacts k ON k.id = m.contact_id
    WHERE m.event = ? AND m.ended_at IS NULL ${where}`).all(INVITE.event, ...args);
}
const markRow = (m, people) => ({ id: Number(m.id), companyId: Number(m.company_id), company: m.company, contactId: m.contact_id ? Number(m.contact_id) : null,
  person: m.person || '', email: m.email || '', people: m.contact_id ? null : people.get(Number(m.company_id)) || 0, send: m.send,
  sendLabel: (SENDS.get(m.send) || {}).label || m.send, why: m.why, whyLabel: (WHY.get(m.why) || {}).label || m.why, kind: m.kind,
  final: Boolean(m.final_at), by: m.marked_by || '', at: m.marked_at });
async function peopleBy(db) {
  const n = new Map();
  for (const k of await db.prepare('SELECT company_id FROM tc_company_contacts WHERE archived_at IS NULL').all()) n.set(Number(k.company_id), (n.get(Number(k.company_id)) || 0) + 1);
  return n;
}

/** The list on the event's page: newest first. */
export async function marksList(db) {
  const people = await peopleBy(db);
  const rows = (await activeMarks(db)).map((m) => markRow(m, people)).sort((a, b) => String(b.at).localeCompare(String(a.at)) || b.id - a.id);
  return { event: INVITE.event, sends: INVITE.sends, why: INVITE.why, total: rows.length, rows };
}

/** One company's marks, for its page. */
export async function companyMarks(db, companyId) {
  const people = await peopleBy(db);
  return (await activeMarks(db, 'AND m.company_id = ?', Number(companyId))).map((m) => markRow(m, people));
}

/** For a send: (companyId, contactId) -> the mark that keeps that person out of it, or null. */
export async function markedFor(db, send) {
  const list = (await activeMarks(db)).filter((m) => m.send === 'all' || m.send === send);
  const byCo = new Map(), byK = new Map();
  for (const m of list) {
    const v = { kind: m.kind, label: m.kind === 'hold' ? 'Hold' : 'Do not invite' };
    if (m.contact_id) byK.set(Number(m.contact_id), v); else byCo.set(Number(m.company_id), v);
  }
  return (companyId, contactId) => (contactId && byK.get(Number(contactId))) || (companyId && byCo.get(Number(companyId))) || null;
}

/** The search to add: companies by name, then people (name, email, phone). */
export async function markSearch(db, q) {
  const text = String(q ?? '').trim();
  if (text.length < 2) return { rows: [] };
  const people = await peopleBy(db);
  const cos = (await listCompanies(db, { q: text }, { size: 5 })).rows.map((c) => ({ companyId: Number(c.id), contactId: null, label: c.name,
    sub: `company · ${people.get(Number(c.id)) || 0} ${people.get(Number(c.id)) === 1 ? 'person' : 'people'}` }));
  const ps = (await searchPeople(db, text, { limit: 8 })).rows.map((k) => ({ companyId: k.companyId, contactId: k.id, label: k.name || k.email, sub: k.company }));
  return { rows: [...cos, ...ps] };
}

export async function markAdd(db, b, actor) {
  const send = String(b.send || ''), why = String(b.why || '');
  if (!SENDS.has(send)) throw new TcInputError('Pick what it is for.');
  if (!WHY.has(why)) throw new TcInputError('Pick why.');
  const companyId = Number(b.companyId), contactId = b.contactId ? Number(b.contactId) : null;
  const c = await db.prepare('SELECT id FROM tc_companies WHERE id = ? AND archived_at IS NULL').get(companyId);
  if (!c) throw new TcInputError('There is no such company.');
  if (contactId && !(await db.prepare('SELECT id FROM tc_company_contacts WHERE id = ? AND company_id = ? AND archived_at IS NULL').get(contactId, companyId))) {
    throw new TcInputError('There is no such contact at this company.');
  }
  const same = (await activeMarks(db, 'AND m.company_id = ?', companyId)).find((m) => (m.contact_id ? Number(m.contact_id) : null) === contactId && m.send === send);
  if (same) throw new TcInputError('Already on the list for this send.');
  const r = await db.prepare(`INSERT INTO tc_invite_marks (event, send, why, kind, company_id, contact_id, marked_at, marked_by) VALUES (?,?,?,?,?,?,?,?)`)
    .run(INVITE.event, send, why, WHY.get(why).hold ? 'hold' : 'no', companyId, contactId, nowIso(), actor);
  return { id: Number(r.lastInsertRowid) };
}

/** Undo (a do-not-invite) or Release (a hold): the mark ends, the row stays. */
export async function markEnd(db, id, actor) {
  const m = await db.prepare('SELECT id FROM tc_invite_marks WHERE id = ? AND ended_at IS NULL').get(Number(id));
  if (!m) throw new TcInputError('This mark is no longer on the list.');
  await db.prepare('UPDATE tc_invite_marks SET ended_at = ?, ended_by = ? WHERE id = ?').run(nowIso(), actor, Number(id));
  return { ended: Number(id) };
}

/** Make final: a hold becomes a do-not-invite. */
export async function markFinal(db, id, actor) {
  const m = await db.prepare(`SELECT id FROM tc_invite_marks WHERE id = ? AND ended_at IS NULL AND kind = 'hold'`).get(Number(id));
  if (!m) throw new TcInputError('Only a hold can be made final.');
  await db.prepare(`UPDATE tc_invite_marks SET kind = 'no', final_at = ?, final_by = ? WHERE id = ?`).run(nowIso(), actor, Number(id));
  return { final: Number(id) };
}
