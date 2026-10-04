// THE CALL POP-UP (Q6, 04.10.2026; first said 30.09).
//
// When the phone rings, whoever answers should see who is calling and where things stand, and be
// one click from adding a comment. The phone system PUSHES its call events to us (src/phoneevent.js
// stores them in call_events). Vercel has no websockets, so the open, signed-in app asks OUR
// database every few seconds for events newer than the last one it saw. It never asks TeleGroup.
//
// THE CALLER'S NUMBER NEVER LEAVES THE SERVER: the app is told who the caller IS (a person, a lead
// waiting in the Inbox, or a new caller with the last four digits), never the number.
//
// WHO SEES A CALL. "Ringing" with no operator yet goes to everybody signed in: it is the college's
// queue. "Answered" goes to the colleague who answered (TeleGroup's operator name matched to an
// Intake user); the others are told only that it was taken, so their card can close. Answered by
// a name Intake does not know, it stays with everybody.

// An app that was closed does not catch up on old calls: only events from the last few minutes.
export const FEED_MINUTES = 5;
const PHONE_TAIL = 8;

const digits = (v) => String(v || '').replace(/\D/g, '');
const tail = (v) => digits(v).slice(-PHONE_TAIL);

// "Līga Šmite", "liga smite" and "LIGA  SMITE" are one name.
export const plainName = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().toLowerCase().replace(/\s+/g, ' ');

// Is the operator TeleGroup named this viewer? The whole name, or, where Intake knows a
// colleague by one word ("Ieva"), that word as the operator's first name.
export function isOperator(operator, viewer) {
  const o = plainName(operator);
  const v = plainName(viewer);
  if (!o || !v) return false;
  if (o === v) return true;
  return !v.includes(' ') && o.split(' ')[0] === v;
}

// ------------------------------------------------------------ the caller --
// A person first (last 8 digits, as everywhere else in Intake), then a lead still waiting in
// the Inbox, then nobody: a new caller.
export async function whoIsCalling(db, callerNum) {
  const t = tail(callerNum);
  if (t.length < 7) return { kind: 'unknown', isNew: true, last4: digits(callerNum).slice(-4) || null };
  const people = await db.prepare('SELECT id, name, status, owner, phone FROM people WHERE phone IS NOT NULL').all();
  const p = people.find((x) => tail(x.phone) === t);
  if (p) {
    const note = await db.prepare(`SELECT body, occurred_at FROM events WHERE person_id = ? AND origin = 'manual'
      AND kind IN ('note', 'call') AND COALESCE(body, '') <> '' ORDER BY occurred_at DESC, id DESC LIMIT 1`).get(p.id);
    const task = await db.prepare(`SELECT label, due_at FROM tasks WHERE person_id = ? AND done_at IS NULL
      ORDER BY due_at ASC LIMIT 1`).get(p.id);
    return { kind: 'person', isNew: false, id: p.id, name: p.name || null, status: p.status || null,
      owner: p.owner || null, lastNote: note ? cut(note.body) : null, lastNoteAt: note ? note.occurred_at : null,
      nextStep: task ? task.label : null, nextStepAt: task ? task.due_at : null };
  }
  const waiting = await db.prepare(`SELECT id, contact_name, contact_phone, received_at FROM inbound
    WHERE state = 'new' AND contact_phone IS NOT NULL ORDER BY received_at DESC`).all();
  const w = waiting.find((x) => tail(x.contact_phone) === t);
  if (w) return { kind: 'lead', isNew: true, inboundId: Number(w.id), name: w.contact_name || null, since: w.received_at };
  return { kind: 'unknown', isNew: true, last4: digits(callerNum).slice(-4) || null };
}

const cut = (s, n = 140) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const head = t.slice(0, n);
  const sp = head.lastIndexOf(' ');
  return (sp > n * 0.6 ? head.slice(0, sp) : head) + '…';
};

// --------------------------------------------------------- who sees what --
// No `after`: the app has just opened. It gets the newest id and NO events, so nothing pops on
// a load or a reload. With `after`: every newer event this viewer should see.
export async function callFeed(db, { after = null, viewer = '', users = [], now = new Date() } = {}) {
  const top = await db.prepare('SELECT MAX(id) n FROM call_events').get();
  const last = Number((top && top.n) || 0);
  if (after === null || after === undefined || after === '' || !Number.isFinite(Number(after))) return { last, events: [] };
  const since = new Date(now.getTime() - FEED_MINUTES * 60000).toISOString();
  const rows = await db.prepare(`SELECT id, call_id, event, at, caller_num, operator FROM call_events
    WHERE id > ? AND received_at >= ? ORDER BY id LIMIT 50`).all(Number(after), since);
  const events = [];
  for (const r of rows) {
    const op = r.operator || null;
    const mine = op ? isOperator(op, viewer) : false;
    const someoneElse = Boolean(op && !mine && users.some((u) => isOperator(op, u)));
    // a known colleague took it: the others learn that, and nothing about the caller
    if (someoneElse) { events.push({ id: Number(r.id), callId: r.call_id, event: r.event, at: r.at, taken: true }); continue; }
    events.push({ id: Number(r.id), callId: r.call_id, event: r.event, at: r.at, operator: op, forYou: mine,
      taken: false, who: await whoIsCalling(db, r.caller_num) });
  }
  return { last: Math.max(last, Number(after)), events };
}
