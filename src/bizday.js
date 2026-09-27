// The college's business day.
//
// Times are stored as UTC instants. A DAY is a day in Riga (config.ageing.timezone),
// because that is where "today", "overdue" and "this month" are meant. Slicing an ISO
// string gives the UTC date, which is still yesterday in Riga until 03:00 (02:00 in
// winter): that put a step planned after midnight in the past, and counted a task due
// yesterday as "due today" for three hours every night. Every day boundary on the
// server comes from here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
export const BUSINESS_TZ = CFG.ageing?.timezone || 'Europe/Riga';

// Minutes the zone is ahead of UTC at that instant (+180 in a Riga summer).
export function offsetMinutes(at, tz = BUSINESS_TZ) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const g = (t) => Number(f.find((p) => p.type === t).value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

// 'YYYY-MM-DD' of that instant in Riga. Accepts an ISO string, a Date, or a date-only
// string (read as that calendar day).
export function localDate(at = new Date(), tz = BUSINESS_TZ) {
  if (typeof at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(at)) return at;
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// The UTC instant at which that Riga calendar day begins. Month and day may overflow
// (day 32, month 13), which is how "the day after" and "next month" are asked for.
export function localMidnight(year, month, day, tz = BUSINESS_TZ) {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const first = guess - offsetMinutes(new Date(guess), tz) * 60000;
  // Re-read the offset at the answer, so a change of summer time between the guess
  // and the answer cannot leave it an hour out.
  return new Date(guess - offsetMinutes(new Date(first), tz) * 60000).toISOString();
}

const parts = (ymd) => ymd.split('-').map(Number);
export const dayStartOf = (ymd) => { const [y, m, d] = parts(ymd); return localMidnight(y, m, d); };
export const dayAfterStartOf = (ymd) => { const [y, m, d] = parts(ymd); return localMidnight(y, m, d + 1); };
// 'YYYY-MM-DD HH:MM' in Riga, for a timestamp a person reads.
export function localDateTime(at = new Date(), tz = BUSINESS_TZ) {
  const d = at instanceof Date ? at : new Date(at);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(',', '');
}
export const todayStart = (now = new Date()) => dayStartOf(localDate(now));
export const tomorrowStart = (now = new Date()) => dayAfterStartOf(localDate(now));
