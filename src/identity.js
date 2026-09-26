// Who is already in the database.
//
// This lived inside server.js and was therefore reachable from exactly one route,
// the manual Quick Add. Every automated path - intake qualification, the channel
// adapters - created people without ever asking the question, which is how two
// Emils Baltputnis records ended up sharing the phone +371 20423829.
//
// The rule itself is not new. config/prototype.json has said
// duplicateRule.blockOnMatch: true since 23.09.2026. It was simply never applied
// anywhere except one screen. One matcher, used by everything, is the fix.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

export const normEmail = (v) => String(v || '').trim().toLowerCase();
export const normPhone = (v) => String(v || '').replace(/[^\d+]/g, '');
export const normName = (v) => String(v || '').trim().toLowerCase();

// A phone is compared on its last 8 digits, because the same number is written
// +37120423829, 37120423829 and 20423829 by three different systems.
const PHONE_TAIL = 8;

export async function findMatches(db, { email, phone, name }, { exclude } = {}) {
  const e = normEmail(email);
  const ph = normPhone(phone);
  const n = normName(name);
  if (!e && !ph && !n) return [];

  const hitEmail = (r) => Boolean(e) && normEmail(r.email) === e;
  const hitPhone = (r) => ph.length > 5 && normPhone(r.phone).endsWith(ph.slice(-PHONE_TAIL));
  const hitName = (r) => Boolean(n) && normName(r.name) === n;

  return (await db.prepare(`SELECT id, name, email, phone, status, owner, source_channel, created_at
    FROM people`).all())
    .filter((r) => r.id !== exclude && (hitEmail(r) || hitPhone(r) || hitName(r)))
    .map((r) => ({
      ...r,
      matchedOn: [hitEmail(r) && 'email', hitPhone(r) && 'phone', hitName(r) && 'name'].filter(Boolean),
    }))
    // an email or phone match is a much stronger claim than two people sharing a
    // name, so the strongest candidate is offered first
    .sort((a, b) => strength(b) - strength(a));
}

const strength = (m) =>
  (m.matchedOn.includes('email') ? 4 : 0) +
  (m.matchedOn.includes('phone') ? 2 : 0) +
  (m.matchedOn.includes('name') ? 1 : 0);

// A name on its own is a weak signal - two people really can be called the same
// thing. An email or a phone is strong enough to stop a save on its own.
export const isStrong = (m) => m.matchedOn.some((k) => k === 'email' || k === 'phone');

export async function duplicateCheck(db, contact, opts = {}) {
  if (!CFG.duplicateRule || CFG.duplicateRule.blockOnMatch !== true) return { blocked: false, matches: [] };
  const matches = await findMatches(db, contact, opts);
  return { blocked: matches.length > 0, matches, strong: matches.filter(isStrong) };
}
