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

import fs from 'node:fs';
import { rememberedAs } from './phonefilter.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// WHICH BUTTONS POP UP (Ritvars, 14.10.2026: "for now, make only calls popup, who clicked number 1 for admissions or
// coordinator Laura"): config.phoneMenu[n].popUp. Button 1 (Admissions) and 2 (Student Coordinator) pop up; button 3
// (Other) does not. Its calls still reach the Inbox and the caller's history as before. An event that names no queue
// (a push whose format we do not know yet) pops: it cannot be told apart, and a missed Admissions call is worse.
const CFG = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'config', 'prototype.json'), 'utf8'));
const MENU = CFG.phoneMenu || {};
export function popsUp(queue, menu = MENU) {
  if (!queue) return true;
  const m = Object.values(menu).find((x) => x && x.queue === queue);
  return Boolean(m && m.popUp);
}

// WHO A CALL POPS UP FOR (Q94, 14.10.2026, MASTER CONTROL with Ritvars): the people of that call's line plus admins,
// never everybody. The line's people are config.phoneMenu[n].handledBy (1 Admissions: Ieva; 2 Coordinator: Laura;
// 3 Other: Tetiana, Arina). Admins: config.admins and every active crm_users admin. Whoever ANSWERED always sees their
// own call. An event whose queue we cannot tell goes to everybody, as before.
export async function adminNames(db) {
  const names = new Set(CFG.admins || []);
  try {
    for (const u of await db.prepare("SELECT display_name FROM crm_users WHERE role = 'admin' AND active = 1").all()) {
      if (u.display_name) names.add(u.display_name);
    }
  } catch { /* no users table yet: the config list */ }
  return [...names];
}
export function seesLine(viewer, queue, admins = [], menu = MENU) {
  if (!viewer) return false;
  const m = queue ? Object.values(menu).find((x) => x && x.queue === queue) : null;
  if (!m) return true;
  if (admins.some((a) => isOperator(a, viewer))) return true;
  return (m.handledBy || []).some((h) => isOperator(h, viewer));
}

// A NUMBER THE PHONE FILTER SETS ASIDE NEVER POPS (Ritvars, 14.10.2026, "Yes, never pop"): Not Admissions, Spam and
// the other phoneFilter.filterArchivedAs reasons, undone by Bring back exactly as in the pull. A caller who is a person
// in Intake always pops: the person is looked for first, the same order as storeCall.
export async function filteredCaller(db, callerNum, who = null) {
  if (!callerNum) return false;
  const w = who || await whoIsCalling(db, callerNum);
  if (w.kind === 'person') return false;
  return Boolean(await rememberedAs(db, callerNum, (CFG.phoneFilter || {}).filterArchivedAs || []));
}

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
  const rows = await db.prepare(`SELECT id, call_id, event, at, queue, caller_num, operator FROM call_events
    WHERE id > ? AND received_at >= ? ORDER BY id LIMIT 50`).all(Number(after), since);
  const events = [];
  const admins = rows.length ? await adminNames(db) : [];
  for (const r of rows) {
    if (!popsUp(r.queue)) continue;     // button 3: no pop-up (14.10.2026)
    const op = r.operator || null;
    const mine = op ? isOperator(op, viewer) : false;
    if (!mine && !seesLine(viewer, r.queue, admins)) continue;   // Q94: that line's people and admins only
    const someoneElse = Boolean(op && !mine && users.some((u) => isOperator(op, u)));
    // a known colleague took it: the others learn that, and nothing about the caller
    if (someoneElse) { events.push({ id: Number(r.id), callId: r.call_id, event: r.event, at: r.at, taken: true }); continue; }
    const who = await whoIsCalling(db, r.caller_num);
    if (await filteredCaller(db, r.caller_num, who)) continue;
    events.push({ id: Number(r.id), callId: r.call_id, event: r.event, at: r.at, operator: op, forYou: mine,
      taken: false, who });
  }
  return { last: Math.max(last, Number(after)), events };
}

// ------------------------------------------------- the notification's words --
// The same four things as the app's corner card: name, new or existing, last note, next step.
// Used by the service worker (src/sw.js), which asks for it after a push knock.
export function noteFor(ev) {
  const w = ev.who || {};
  const title = w.kind === 'person' ? (w.name || 'A person in Intake')
    : w.kind === 'lead' ? (w.name || 'A lead waiting in the Inbox')
    : 'New caller' + (w.last4 ? ' ···' + w.last4 : '');
  const lines = [w.kind === 'person' ? 'Existing' + (w.status ? ' · ' + w.status : '') : 'New'];
  if (w.lastNote) lines.push('Last note: ' + w.lastNote);
  if (w.nextStep) lines.push('Next step: ' + w.nextStep);
  const href = w.kind === 'person' ? '#/person/' + encodeURIComponent(w.id) : w.kind === 'lead' ? '#/inbox' : '#/inbox';
  return { title, body: lines.join('\n'), tag: 'call-' + ev.callId, href };
}

// The call a knock was about: this viewer's newest answered call, else the newest ring, from the
// last two minutes. Nothing taken by a colleague, nothing ended.
export async function latestNote(db, { viewer = '', users = [], now = new Date() } = {}) {
  const top = await db.prepare('SELECT MAX(id) n FROM call_events').get();
  const last = Number((top && top.n) || 0);
  const feed = await callFeed(db, { after: Math.max(0, last - 50), viewer, users, now });
  const since = now.getTime() - 2 * 60000;
  const fresh = feed.events.filter((e) => !e.taken && e.event !== 'ended' && Date.parse(e.at || 0) >= since - 60000);
  const pick = [...fresh].reverse().find((e) => e.event === 'answered' && e.forYou)
    || [...fresh].reverse().find((e) => e.event === 'ringing')
    || [...fresh].reverse()[0];
  return pick ? noteFor(pick) : null;
}
