// PASS ON (patch 152, 16.11.2026). The owner, word for word: "the function to transfer to nominate to somebody and they have to
// accept of nominate further to some different manager, you cant nominate a person who was already nominated before by anyone
// else for this contact. if no one wants the person, it goes to Dmitrijs!" And: "This weeks Thursday 17.00. Have them max two
// reminders. One before the min needed time to complete the task. and one 24h earlier".
//   - a list owner passes a person on his list to another list owner; the person stays on his list, "Passed to X, waiting"
//   - the other owner sees him under "Passed to you": Accept (onto his list; New where the company is already decided) or Pass on
//   - nobody who held or was passed this person before can be picked again; when nobody is left, the person goes to Dmitrijs
//     Semjonovs (CEO), final
//   - every step is a line on the person's company History. Pass on is IN THE APP ONLY: no email (the owner, 16.11.2026: "NĒ, es
//     tev neteicu automatiskas zinas par nodosanu! ... so appa tikai! Automatiskas zinas ir par saraksta izfiltresanu!")
//   - deadline reminders: at most two per owner, only with companies still to decide or people passed to him
import { TC, TcInputError, logTcActivity } from './tc.js';

export const FINAL = 'DS';   // "if no one wants the person, it goes to Dmitrijs!"
const S2 = () => ((((TC.grandOpening || {}).stage2 || {}).senders) || []);
const nameOf = (code) => (S2().find((s) => s.code === code) || {}).name || code;
const nowIso = () => new Date().toISOString();
const when = (iso) => {
  const o = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Riga', weekday: 'long', day: 'numeric', month: 'long' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${o.weekday} ${o.day} ${o.month}`;
};

async function rowOf(db, id) {
  const r = await db.prepare(`SELECT s.id, s.sender, s.name, s.position, s.company, s.email, s.ch_contact_id, MIN(k.id) AS contact_id, MIN(k.company_id) AS company_id
    FROM tc_go_stage2 s LEFT JOIN tc_company_contacts k ON k.ch_contact_id = s.ch_contact_id AND k.archived_at IS NULL
    WHERE s.id = ? AND s.gone = 0 GROUP BY s.id, s.sender, s.name, s.position, s.company, s.email, s.ch_contact_id`).get(Number(id));
  if (!r) throw new TcInputError('This person is not on a list.');
  return r;
}
const passesOf = (db, id) => db.prepare('SELECT * FROM tc_go_passes WHERE stage2_id = ? ORDER BY id').all(Number(id));

/** The owners this person can still be passed to: never the holder, never anyone in the chain so far. */
export async function stillOpen(db, id) {
  const r = await rowOf(db, id);
  const seen = new Set([r.sender, ...(await passesOf(db, id)).flatMap((p) => [p.from_sender, p.to_sender])]);
  return S2().map((s) => s.code).filter((c) => !seen.has(c));
}

async function history(tx, r, body, actor, at) {
  if (r.company_id) await logTcActivity(tx, Number(r.company_id), { kind: 'edit', field: 'go_list', body, actor, at, contactId: r.contact_id ? Number(r.contact_id) : null });
}
// onto list `to`: the person moves; New where `to` already decided the company (patch 145); the old list's marks go
async function moveTo(tx, r, to, at, actor) {
  await tx.prepare('UPDATE tc_go_stage2 SET sender = ? WHERE id = ?').run(to, Number(r.id));
  for (const t of ['tc_go_people_new', 'tc_go_people_out', 'tc_go_assign']) await tx.prepare(`DELETE FROM ${t} WHERE stage2_id = ?`).run(Number(r.id));
  // decided on that list, saved or only in its owner's draft (src/tcmylist.js decidedKeys)
  const { decidedKeys } = await import('./tcmylist.js');
  if (r.company_id && (await decidedKeys(tx)).has(to + '|id:' + Number(r.company_id))) await tx.prepare('INSERT INTO tc_go_people_new (stage2_id, sender, added_at, added_by) VALUES (?,?,?,?)').run(Number(r.id), to, at, actor);
}

/**
 * `code` passes person `id` to `to`. `code` is the person's list owner (nothing pending), or the owner it was passed to (pending).
 * Returns { state: 'pending' | 'final', to }.
 */
export async function passOn(db, code, id, to, actor, at = nowIso()) {
  const r = await rowOf(db, id);
  const chain = await passesOf(db, id);
  const open = chain.find((p) => p.state === 'pending');
  if (open ? open.to_sender !== code : r.sender !== code) throw new TcInputError('Only the list this person is on, or passed to, can pass him on.');
  if (!open && r.sender === FINAL && chain.some((p) => p.state === 'final')) throw new TcInputError('Nobody else is left: this person stays with Dmitrijs Semjonovs.');
  const left = S2().map((s) => s.code).filter((c) => c !== r.sender && c !== code && !chain.some((p) => p.from_sender === c || p.to_sender === c));
  const target = String(to || '');
  if (target && !left.includes(target)) throw new TcInputError('This person was already with that list owner, or passed to him. Pick another.');
  const fin = !target;   // nobody left (or nobody picked when nobody is left): to Dmitrijs, final
  if (fin && left.length) throw new TcInputError('Pick who to pass this person to.');
  return db.transaction(async (tx) => {
    if (open) await tx.prepare(`UPDATE tc_go_passes SET state = 'passed', done_at = ?, done_by = ? WHERE id = ?`).run(at, actor, Number(open.id));
    if (fin) {
      await tx.prepare(`INSERT INTO tc_go_passes (stage2_id, from_sender, to_sender, state, at, by_name, done_at, done_by) VALUES (?,?,?,'final',?,?,?,?)`)
        .run(Number(r.id), code, FINAL, at, actor, at, actor);
      await moveTo(tx, r, FINAL, at, actor);
      await history(tx, r, `Grand Opening: ${nameOf(code)} passed ${r.name || r.email || 'this person'} on; nobody else is left, so to ${nameOf(FINAL)}`, actor, at);
      return { state: 'final', to: FINAL };
    }
    await tx.prepare(`INSERT INTO tc_go_passes (stage2_id, from_sender, to_sender, state, at, by_name) VALUES (?,?,?,'pending',?,?)`).run(Number(r.id), code, target, at, actor);
    await history(tx, r, `Grand Opening: ${nameOf(code)} passed ${r.name || r.email || 'this person'} to ${nameOf(target)}`, actor, at);
    return { state: 'pending', to: target };
  });
}

/** The owner it was passed to accepts: the person goes onto his list. */
export async function accept(db, code, id, actor, at = nowIso()) {
  const r = await rowOf(db, id);
  const open = (await passesOf(db, id)).find((p) => p.state === 'pending');
  if (!open || open.to_sender !== code) throw new TcInputError('This person is not passed to this list.');
  return db.transaction(async (tx) => {
    await tx.prepare(`UPDATE tc_go_passes SET state = 'accepted', done_at = ?, done_by = ? WHERE id = ?`).run(at, actor, Number(open.id));
    await moveTo(tx, r, code, at, actor);
    await history(tx, r, `Grand Opening: ${nameOf(code)} accepted ${r.name || r.email || 'this person'} onto the list (passed on by ${nameOf(open.from_sender)})`, actor, at);
    return { state: 'accepted', to: code };
  });
}

// THE REMINDER EMAILS (the only automatic ones) ARE IN LATVIAN and say they are automated (the owner, 16.11.2026: "Mention obligatory that its Intake automated
// message."), in the "tu" form he uses with the directors
export const AUTO = 'Šī ir automātiska Intake ziņa.';
const lvN = (n, one, many) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : many}`;
const LV_DAY = ['svētdien', 'pirmdien', 'otrdien', 'trešdien', 'ceturtdien', 'piektdien', 'sestdien'];
const LV_MONTH = ['janvārī', 'februārī', 'martā', 'aprīlī', 'maijā', 'jūnijā', 'jūlijā', 'augustā', 'septembrī', 'oktobrī', 'novembrī', 'decembrī'];
/** "ceturtdien, 19. novembrī, plkst. 17:00", Riga time */
export function lvWhen(d) {
  const o = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Riga', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday);
  return `${LV_DAY[wd]}, ${Number(o.day)}. ${LV_MONTH[Number(o.month) - 1]}, plkst. ${o.hour}:${o.minute}`;
}

/** For My Grand Opening list: { passedToYou: [...], waiting: { stage2Id: toName }, involved: { stage2Id: [codes] } }. */
export async function passState(db, code) {
  const all = await db.prepare(`SELECT p.*, s.name, s.position, s.company, s.email, s.sender FROM tc_go_passes p JOIN tc_go_stage2 s ON s.id = p.stage2_id
    WHERE s.gone = 0 ORDER BY p.id`).all();
  const byRow = new Map();
  for (const p of all) { if (!byRow.has(Number(p.stage2_id))) byRow.set(Number(p.stage2_id), []); byRow.get(Number(p.stage2_id)).push(p); }
  const passedToYou = [], waiting = {}, involved = {};
  for (const [id, ps] of byRow) {
    involved[id] = [...new Set(ps.flatMap((p) => [p.from_sender, p.to_sender]))];
    const open = ps.find((p) => p.state === 'pending');
    if (!open) continue;
    if (open.to_sender === code) passedToYou.push({ id, label: open.name || open.email || '', position: open.position || '', company: open.company || '',
      chain: ps.filter((p) => p.state !== 'accepted').map((p) => nameOf(p.from_sender)), at: open.at, when: when(open.at), holder: open.sender, involved: involved[id] });
    if (open.sender === code) waiting[id] = nameOf(open.to_sender);
  }
  return { passedToYou, waiting, involved };
}

// ---------------------------------------------------------------- reminders --
/** The deadline (config tc.json grandOpening.stage2.deadline), or null. */
export const deadline = () => { const d = (((TC.grandOpening || {}).stage2 || {}).deadline) || ''; return d && !Number.isNaN(Date.parse(d)) ? new Date(d) : null; };
/** When each reminder is due for an owner with `companies` still to decide: the morning before at 09:00, and the time his list still needs
 *  (one minute per company, at least 30 minutes) before the deadline. */
export function dueTimes(end, companies) {
  // the first one the morning before, 09:00 (his pick 16.11.2026, not 24 hours before = 17:00, the end of the working day):
  // a 17:00 deadline less 32 hours
  return { day_before: new Date(end.getTime() - 32 * 3600e3), last_call: new Date(end.getTime() - Math.max(30, Number(companies) || 0) * 60e3) };
}

/** Run by the reminder cron: sends what is due, each at most once. `open(code)` = { companies, passed } still open on that list. */
export async function sendReminders(db, open, send, now = new Date()) {
  const end = deadline();
  if (!end || now >= end) return { ok: true, sent: 0, why: end ? 'the deadline has passed' : 'no deadline set' };
  const done = new Set((await db.prepare('SELECT sender, kind FROM tc_go_reminders').all()).map((r) => r.sender + '|' + r.kind));
  let sent = 0;
  const out = [];
  for (const s of S2()) {
    const o = await open(s.code);
    if (!o.companies && !o.passed) continue;
    const due = dueTimes(end, o.companies);
    for (const kind of ['day_before', 'last_call']) {
      if (now < due[kind] || done.has(s.code + '|' + kind)) continue;
      // the day-before one is not sent once the last call is due: two emails, never both at once
      if (kind === 'day_before' && now >= due.last_call) continue;
      const day = kind === 'day_before' ? 'rīt' : 'šodien';
      const mail = { to: s.email, subject: `Intake: tavs Grand Opening saraksts tiek slēgts ${day} plkst. 17:00`,
        text: `Tavs Grand Opening saraksts tiek slēgts ${lvWhen(end)}.\n\nVēl jāizlemj: ${lvN(o.companies, 'uzņēmums', 'uzņēmumi')}\n`
          + (o.passed ? `Nodoti tev: ${lvN(o.passed, 'cilvēks', 'cilvēki')}\n` : '') + `\nhttps://intake.novikontas.org/#/tc/mylist/${encodeURIComponent(s.code)}\n\n${AUTO}\n` };
      // the row first: a second run while this one sends finds it and sends nothing
      try { await db.prepare('INSERT INTO tc_go_reminders (sender, kind, sent_at, companies, passed) VALUES (?,?,?,?,?)').run(s.code, kind, now.toISOString(), o.companies, o.passed); }
      catch (e) { continue; }
      const r = await send(mail);
      await db.prepare('UPDATE tc_go_reminders SET result = ? WHERE sender = ? AND kind = ?').run(r && r.ok ? 'sent' : 'failed: ' + ((r && r.why) || 'unknown'), s.code, kind);
      sent += 1; out.push({ code: s.code, kind, ok: Boolean(r && r.ok) });
    }
  }
  return { ok: true, sent, out };
}
