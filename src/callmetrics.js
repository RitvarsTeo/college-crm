// TELEPHONE CALLS (20.11.2026; his words "we need in intake Telephone calls metrics ... BUT NOT A CLUSTER, just the most
// important metrics! All of that on a Single screen with a carousel"; his picks "B: three cards" and "Add 'Called back'
// button"). Five figures, each with its per-day chart and the calls behind it:
//   Time to answer   median ring before pick-up (duration - talk) of answered calls, per day
//   Answered         answered of all calls, %
//   Answered per day average over the working days in the range
//   Overdue per day  a missed call not called back (the Called back button) nor handled (its Inbox card processed, or its
//                    Call back step done) by the end of its working day (answerDeadlines, Intake's own rule); counted only
//                    from OVERDUE_FROM, the day the button went live - nothing before it is counted against anyone
//   Busiest hour     the hour of the day with most calls (Riga time)
// Read only; the PBX's own fields; never a caller's number. Working days = Mon-Fri.
import { answerDeadlines } from './intake.js';
import { markFor, MARKS } from './phonefilter.js';

// a marked number is no student caller, so its calls never count: Internal (staff, a test from our own phones), Spam, and
// Supplier or vendor (his answer 20.11.2026: "No, leave them out")
export const NOT_COUNTED = MARKS;

export const OVERDUE_FROM = '2026-11-20';     // the Called back button's first day (patch release)
const TZ = 'Europe/Riga';
const rigaDay = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ });
const rigaHour = (iso) => Number(new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).slice(0, 2));
const weekday = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
const isWork = (d) => weekday(d) >= 1 && weekday(d) <= 5;
const nextDay = (d) => new Date(Date.parse(d + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
export function median(a) {
  const s = a.filter((v) => v != null && Number.isFinite(v)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Every figure, its per-day series and the calls behind it. `days` = how far back from the last call (default 12 weeks). */
export async function callMetrics(db, { now = new Date(), days = 84, menu = [] } = {}) {
  const last = await db.prepare('SELECT MAX(called_at) AS m FROM pbx_calls').get();
  if (!last || !last.m) return { empty: true, overdueFrom: OVERDUE_FROM };
  // the range runs to YESTERDAY (today is not over), or to the newest call if that is today: working days without a call show
  // as days without a call; lastCall is the newest call
  const lastCall = rigaDay(last.m), yday = rigaDay(new Date(now.getTime() - 864e5).toISOString()), to = yday > lastCall ? yday : lastCall;
  const fromIso = new Date(Date.parse(to + 'T00:00:00Z') - days * 864e5).toISOString();
  const rows = await db.prepare(`SELECT c.uniqueid, c.caller_num, c.called_at, c.queue, c.picked_up, c.operator_name, c.duration_sec, c.talk_sec,
      c.called_back_at, c.called_back_by, c.person_id, i.processed_at, pe.name AS person_name
    FROM pbx_calls c LEFT JOIN inbound i ON i.id = c.inbound_id LEFT JOIN people pe ON pe.id = c.person_id
    WHERE c.called_at >= ? ORDER BY c.called_at`).all(fromIso);
  const tasks = await db.prepare(`SELECT person_id, created_at, done_at FROM tasks WHERE label = 'Call back' AND done_at IS NOT NULL`).all();
  const nowMs = now.getTime();
  const lineOf = (q) => ((menu.find((m) => m && m.queue === q) || {}).role) || q;
  const marked = new Map();
  for (const r of rows) if (r.caller_num && !marked.has(r.caller_num)) {
    const m = await markFor(db, { phone: r.caller_num });
    marked.set(r.caller_num, Boolean(m && NOT_COUNTED.includes(m.mark)));
  }
  const calls = rows.filter((r) => !marked.get(r.caller_num)).map((r) => {
    const answered = Boolean(Number(r.picked_up));
    const wait = answered && r.duration_sec != null && r.talk_sec != null ? Math.max(0, Number(r.duration_sec) - Number(r.talk_sec)) : null;
    let overdue = null;   // null = not counted (answered, before OVERDUE_FROM, or its working day not over yet)
    if (!answered && rigaDay(r.called_at) >= OVERDUE_FROM) {
      const lateAt = Date.parse(answerDeadlines(r.called_at).lateAt);
      const task = r.person_id ? tasks.find((t) => t.person_id === r.person_id && Date.parse(t.created_at) >= Date.parse(r.called_at) - 6e4) : null;
      const handled = [r.called_back_at, r.processed_at, task && task.done_at].filter(Boolean).map(Date.parse).sort((a, b) => a - b)[0];
      if (handled != null && handled <= lateAt) overdue = false;
      else if (nowMs > lateAt) overdue = true;
    }
    return { id: r.uniqueid, at: r.called_at, day: rigaDay(r.called_at), hour: rigaHour(r.called_at), line: lineOf(r.queue), answered,
      operator: r.operator_name || null, waitSec: wait, rangSec: answered ? null : (r.duration_sec == null ? null : Number(r.duration_sec)),
      calledBackAt: r.called_back_at || null, calledBackBy: r.called_back_by || null, overdue, personId: r.person_id || null, name: r.person_name || '' };
  });
  // the working days of the range, a day without calls included
  const first = calls.length ? calls[0].day : to;
  const series = [];
  for (let d = first; d <= to; d = nextDay(d)) if (isWork(d)) {
    const c = calls.filter((x) => x.day === d), ans = c.filter((x) => x.answered);
    series.push({ day: d, calls: c.length, answered: ans.length, missed: c.length - ans.length, waitSec: median(ans.map((x) => x.waitSec)),
      // a day counts once it is over (today's working day may still be called back)
      overdue: d >= OVERDUE_FROM && d < rigaDay(now.toISOString()) ? c.filter((x) => x.overdue === true).length : null });
  }
  const work = calls.filter((x) => isWork(x.day));
  const answered = work.filter((x) => x.answered);
  const byHour = {};
  for (const x of work) byHour[x.hour] = (byHour[x.hour] || 0) + 1;
  const busiest = Object.entries(byHour).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0] || null;
  const odDays = series.filter((s) => s.overdue != null);
  return {
    from: first, to, lastCall, overdueFrom: OVERDUE_FROM,
    figures: {
      waitSec: median(answered.map((x) => x.waitSec)),
      answeredPct: work.length ? Math.round((100 * answered.length) / work.length) : null,
      // over the working days up to the newest call: days past it are days with no call reaching Intake, not days of zero
      answeredPerDay: (() => { const n = series.filter((x) => x.day <= lastCall).length; return n ? Math.round((10 * answered.length) / n) / 10 : null; })(),
      overduePerDay: odDays.length ? Math.round((10 * odDays.reduce((n, s) => n + s.overdue, 0)) / odDays.length) / 10 : null,
      busiestHour: busiest ? Number(busiest[0]) : null, busiestCalls: busiest ? busiest[1] : 0,
      calls: work.length, answered: answered.length, missed: work.length - answered.length,
    },
    series, byHour, calls: work,
  };
}
