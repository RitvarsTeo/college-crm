// THE YEAR SET (Q59, the owner 06.10.2026: "periods need to be just a whole year! ... In the drop down, its only a
// year choice! Whole calendar year from start to finish, one year ... It can be clickable, so as to look at many years
// combined! Any years combined!"). The app-wide filter is a SET of whole calendar years (Riga years, 1 Jan to 31 Dec),
// any combination; periods inside them (a month) are chosen in the app, on Reports only.
//
// A set becomes RANGES [from, to) of ISO instants: neighbouring years join into one range, a gap starts a new one, so
// 2024 + 2026 is two ranges and 2024 + 2025 is one. Every list and count reads the same ranges through rangesSql().
import { localMidnight } from './bizday.js';

const okYear = (y) => Number.isInteger(y) && y >= 2000 && y <= 2100;

// "2024,2026" (or [2024, 2026]) -> [2024, 2026], sorted, each once; anything that is not a year is dropped.
export function yearsOf(v) {
  const list = Array.isArray(v) ? v : String(v ?? '').split(',');
  return [...new Set(list.map((x) => Number(String(x).trim())).filter(okYear))].sort((a, b) => a - b);
}

// Whole calendar years -> ranges, neighbours joined.
export function yearRanges(years) {
  const out = [];
  for (const y of yearsOf(years)) {
    const a = localMidnight(y, 1, 1), b = localMidnight(y + 1, 1, 1);
    const last = out[out.length - 1];
    if (last && last[1] === a) last[1] = b; else out.push([a, b]);
  }
  return out;
}

// The request's set: ?y=2024,2026 (Q59). The old single ?y=YYYY&m=M of Q45 still means that one month, so an old
// link or a caller that never heard of the set keeps working. No y (or nothing that is a year) = every year: null.
export function scopeRanges(searchParams) {
  const years = yearsOf(searchParams.get('y'));
  if (!years.length) return null;
  const m = Number(searchParams.get('m'));
  if (years.length === 1 && m >= 1 && m <= 12) return [[localMidnight(years[0], m, 1), localMidnight(years[0], m + 1, 1)]];
  return yearRanges(years);
}

// `col` inside the ranges, as SQL with its arguments: "(col >= ? AND col < ?) OR (...)". No ranges = no condition.
export function rangesSql(col, ranges) {
  if (!ranges || !ranges.length) return ['1 = 1', []];
  return [`(${ranges.map(() => `(${col} >= ? AND ${col} < ?)`).join(' OR ')})`, ranges.flat()];
}
