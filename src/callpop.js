// THE CALL POP-UP (Q6, 04.10.2026; first said 30.09).
//
// When the phone rings, whoever answers should see who is calling and where things stand,
// and be one click from adding a comment. TeleGroup has no push to us, so this is the
// version that works whatever TeleGroup can do: the open, signed-in app asks Intake every
// ~10 seconds for the calls of the last two minutes. Whether a call is in TeleGroup's list
// WHILE it rings, or only after hang-up, is not known yet; one test call after deploy
// answers it, and this code is right either way.
//
// THE TOKEN NEVER LEAVES THE SERVER, and neither does the caller's number: the app is told
// who the caller IS (a person, a lead waiting in the Inbox, or a new caller with the last
// four digits), never the number itself.
//
// WHO SEES A CALL. The operator TeleGroup names is matched to an Intake user. A call answered
// by a known colleague goes to that colleague only. A call nobody has answered yet, or answered
// by a name Intake does not know, goes to everybody signed in: it is the college's queue.

import { fetchCalls, isOurs } from '../lib/pbx.js';
import { fromRigaStamp } from '../lib/riga.js';

export const POP_MINUTES = 2;
// Every open app asks every ~10 s. One TeleGroup read serves them all for this long, per
// server instance, so five colleagues do not make five calls to TeleGroup.
export const CACHE_MS = 8000;
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

// ------------------------------------------------------------- the read --
let cache = null;
export function clearCache() { cache = null; }

export async function liveCalls({ env = process.env, now = new Date(), fetchImpl = fetch } = {}) {
  if (cache && now.getTime() - cache.at < CACHE_MS) return cache.value;
  let value;
  try {
    const got = await fetchCalls({ now, minutes: POP_MINUTES, env, fetchImpl });
    const calls = [];
    for (const c of got.calls) {
      if (!isOurs(c) || !c.uniqueid) continue;
      let at = null;
      try { at = c.created_at ? fromRigaStamp(c.created_at).toISOString() : null; } catch { at = null; }
      calls.push({ id: String(c.uniqueid), at, queue: String(c.queue), state: c.state ?? null,
        operator: c.operator_name ? String(c.operator_name) : null, callerNum: c.caller_num ? String(c.caller_num) : null });
    }
    value = { ok: true, calls };
  } catch (err) {
    // the message from fetchCalls is already redacted; the pop-up only needs to know it failed
    value = { ok: false, calls: [], error: 'The phone system could not be read just now.' };
  }
  cache = { at: now.getTime(), value };
  return value;
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
// `users` is every name Intake knows a colleague by. Only what the pop-up needs goes out.
export async function popsFor(db, { calls, viewer, users = [] }) {
  const out = [];
  for (const c of calls || []) {
    const op = c.operator || null;
    const mine = op ? isOperator(op, viewer) : false;
    const someoneElse = op && !mine && users.some((u) => isOperator(op, u));
    if (someoneElse) continue;            // a known colleague answered it: it is theirs
    out.push({ id: c.id, at: c.at, answered: c.state === 'ANSWER', state: c.state,
      operator: op, forYou: mine, who: await whoIsCalling(db, c.callerNum) });
  }
  return out;
}
