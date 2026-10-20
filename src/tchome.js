// TRAINING CENTRE HOME AND THE CLIENT BOOK (round 3, 20.10.2026).
//
// The owner's picks, 20.10.2026 (MASTER PITCHER board 3, M1; board 1, A): TC Home is metrics first, like the Academy Home -
// a year selector, a Today strip in the Needs you slot (Planned today, This week; no overdue figure), four cards for the
// year (Delegates, Client companies came back / new, New clients, Countries), Delegates by year with the client companies
// under each year, the donut "Our companies, by last course", This week (mine) and the year's biggest clients. The Client
// book ranks the clients (All / Mine / TC / ENERGY / OPITO) and lists "Welcome back": strong two and three years ago,
// nothing this year.
//
// THE RULES THE FIGURES KEEP. A group's TOTAL row is in no figure (it repeats its subsidiaries). Training Centre is B2B:
// nothing here reads an Academy person. Every figure is one of the Companies list's filters (src/tc.js matches: year,
// cohort, last), so a click opens exactly the companies it counts. 2024 is a number like any other (the owner's pick: no
// hatching). Nothing reads as somebody being late: a contact not done yet is in Planned today, never "overdue".
//
// Pure data functions, the database first, like src/tc.js.

import { companyFacts, tcWindow, addDays, lastBucket } from './tc.js';
import { meKeys, isMine } from './tcpic.js';

export const FIRST_YEAR = 2020;   // the Excel's course history starts in 2020
const byLv = (a, b) => String(a).localeCompare(String(b), 'lv');
const yearOf = (v) => { const y = Number(v); return Number.isInteger(y) && y >= 1990 && y <= 2100 ? y : null; };
const got = (c, y) => (c.years[y] || 0);

/** The working week's Friday (Mon-Fri); on a Saturday or a Sunday, the coming week's. */
export function fridayOf(ymd) {
  const dow = new Date(ymd + 'T12:00:00Z').getUTCDay();   // 0 Sunday .. 6 Saturday
  return addDays(ymd, (5 - dow + 7) % 7);
}

/** The years the selector offers, the year it opens on, and the day the course counts run to. */
async function yearsOf(db, counted, now) {
  const thisYear = Number(tcWindow(now).today.slice(0, 4));
  const ys = [...new Set(counted.flatMap((c) => Object.entries(c.years).filter(([, n]) => n > 0).map(([y]) => Number(y))))]
    .filter((y) => y <= thisYear).sort((a, b) => b - a);
  const r = await db.prepare('SELECT MAX(as_of) AS d FROM tc_company_courses').get();
  const countsTo = (r && r.d) || null;
  const fromCounts = countsTo ? Number(String(countsTo).slice(0, 4)) : null;
  const opens = ys.includes(fromCounts) ? fromCounts : ys[0] || thisYear;
  return { years: ys, opens, countsTo, thisYear };
}

const rankRow = (Y, span) => (c) => ({ id: c.id, name: c.name, country: c.country, areas: c.areas, n: got(c, Y),
  spark: span.map((y) => got(c, y)), pic: c.pic, picKey: c.picKey,
  next: c.next ? { due: c.next.due, label: c.next.label } : null });

/** My open next contacts (the person in charge's, or the task's owner's), each with the company and the contact. */
async function myTasks(db, mk) {
  if (!mk) return [];
  const rows = await db.prepare(`SELECT t.id, t.company_id, t.due_at, t.label, t.owner, c.name, c.country, c.pic_name, c.pic_email,
    k.name AS contact FROM tc_tasks t JOIN tc_companies c ON c.id = t.company_id
    LEFT JOIN tc_company_contacts k ON k.id = t.contact_id AND k.archived_at IS NULL
    WHERE t.done_at IS NULL AND c.archived_at IS NULL ORDER BY t.due_at, c.name`).all();
  return rows.filter((t) => isMine({ picEmail: t.pic_email, pic: t.pic_name, next: { owner: t.owner } }, mk));
}

/** TC Home for one year. `me` is the signed-in person ({ email, name }); `year` the selector's, else the year it opens on. */
export async function homeYear(db, { year = null, me = null, now = new Date(), biggest = 6 } = {}) {
  const w = tcWindow(now);
  const all = await companyFacts(db);
  const counted = all.filter((c) => !c.groupTotal);
  const Y0 = await yearsOf(db, counted, now);
  const Y = yearOf(year) || Y0.opens;
  const span = []; for (let y = Math.min(FIRST_YEAR, Y); y <= Y; y++) span.push(y);

  const clients = counted.filter((c) => got(c, Y) > 0);
  const before = (c) => Object.entries(c.years).some(([y, n]) => Number(y) < Y && n > 0);
  const back = clients.filter(before), fresh = clients.filter((c) => !before(c));
  const byYear = span.map((y) => ({ year: y, n: counted.reduce((s, c) => s + got(c, y), 0), clients: counted.filter((c) => got(c, y) > 0).length }));
  const cur = byYear.find((r) => r.year === Y), prev = byYear.find((r) => r.year === Y - 1) || null;
  const countries = (rows) => new Set(rows.map((c) => c.country).filter(Boolean)).size;

  const buckets = { recent: 0, mid: 0, old: 0, none: 0 };
  let latest = Y;
  for (const c of counted) {
    const b = lastBucket(c, Y); buckets[b] += 1;
    if (b === 'recent') latest = Math.max(latest, ...Object.entries(c.years).filter(([, n]) => n > 0).map(([y]) => Number(y)));
  }
  const two = (y) => String(y).slice(-2);

  const mk = meKeys(me);
  const mine = await myTasks(db, mk);
  const friday = fridayOf(w.today);
  const week = mine.filter((t) => t.due_at <= friday);
  return {
    asOf: w.today, year: Y, years: Y0.years, countsTo: Y0.countsTo, firstYear: span[0],
    today: { friday, planned: mine.filter((t) => t.due_at <= w.today).length, week: week.length },
    delegates: { n: cur.n, prev: prev ? { year: prev.year, n: prev.n } : null, spark: byYear.map((r) => r.n) },
    clients: { n: clients.length, back: back.length, fresh: fresh.length },
    newClients: { n: fresh.length, delegates: fresh.reduce((s, c) => s + got(c, Y), 0),
      largest: [...fresh].sort((a, b) => got(b, Y) - got(a, Y) || byLv(a.name, b.name)).slice(0, 3).map((c) => ({ id: c.id, name: c.name, n: got(c, Y) })) },
    countries: { clients: countries(clients), all: countries(counted) },
    byYear,
    donut: { total: counted.length, rows: [
      { id: 'recent', label: latest > Y ? `Trained ${Y}-${two(latest)}` : `Trained ${Y}`, n: buckets.recent },
      { id: 'mid', label: `Trained ${Y - 2}-${two(Y - 1)}`, n: buckets.mid },
      { id: 'old', label: `Trained before ${Y - 2}`, n: buckets.old },
      { id: 'none', label: 'No course yet', n: buckets.none }] },
    // a contact not done yet shows on today with the day it was planned for, never as late
    week: week.map((t) => ({ taskId: Number(t.id), companyId: Number(t.company_id), name: t.name, country: t.country || '', contact: t.contact || '',
      label: t.label, due: t.due_at, day: t.due_at < w.today ? w.today : t.due_at, from: t.due_at < w.today ? t.due_at : null })),
    biggest: { year: Y, span, rows: [...clients].sort((a, b) => got(b, Y) - got(a, Y) || byLv(a.name, b.name)).slice(0, biggest).map(rankRow(Y, span)) },
  };
}

/**
 * The Client book for one year: the clients ranked by that year's delegates (area: TC | ENERGY | OPITO | PROJECTS;
 * mine: the signed-in person's), and Welcome back - delegates in Y-3 and Y-2 together, none in Y, the most first.
 */
export async function book(db, { year = null, area = '', mine = false, me = null, now = new Date() } = {}) {
  const all = await companyFacts(db);
  const counted = all.filter((c) => !c.groupTotal);
  const Y0 = await yearsOf(db, counted, now);
  const Y = yearOf(year) || Y0.opens;
  const span = []; for (let y = Math.min(FIRST_YEAR, Y); y <= Y; y++) span.push(y);
  const mk = meKeys(me);
  const ranked = counted.filter((c) => got(c, Y) > 0)
    .filter((c) => !area || c.areas.includes(area))
    .filter((c) => !mine || isMine(c, mk))
    .sort((a, b) => got(b, Y) - got(a, Y) || byLv(a.name, b.name));
  const was = (c) => got(c, Y - 3) + got(c, Y - 2);
  const welcome = counted.filter((c) => was(c) > 0 && got(c, Y) === 0).sort((a, b) => was(b) - was(a) || byLv(a.name, b.name));
  return {
    year: Y, years: Y0.years, countsTo: Y0.countsTo, span, area: area || '', mine: Boolean(mine),
    mineCount: mk ? counted.filter((c) => got(c, Y) > 0 && isMine(c, mk)).length : 0,
    biggest: { total: ranked.length, top: ranked.length ? got(ranked[0], Y) : 0, rows: ranked.slice(0, 200).map(rankRow(Y, span)) },
    welcome: { from: Y - 3, to: Y - 2, total: welcome.length,
      rows: welcome.slice(0, 60).map((c) => ({ id: c.id, name: c.name, country: c.country, n: was(c), pic: c.pic,
        next: c.next ? { due: c.next.due, label: c.next.label } : null })) },
  };
}
