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

// EVERY contact a person has (Q77, 04.10 -> 07.10.2026): the email and phone on the profile, plus
// every email or phone that reached them since - one a colleague typed when making a caller into a
// lead, or the address of a message attached to them. Matching on the profile alone is how a person
// who first CALLED came back as a brand-new lead the day they wrote.
async function extraContacts(db) {
  const extra = new Map();
  const rows = await db.prepare(`SELECT person_id, field, value FROM field_values
    WHERE person_id IS NOT NULL AND field IN ('email', 'phone') AND value IS NOT NULL AND value <> ''`).all();
  for (const r of rows) {
    if (!extra.has(r.person_id)) extra.set(r.person_id, { emails: [], phones: [] });
    extra.get(r.person_id)[r.field === 'email' ? 'emails' : 'phones'].push(r.value);
  }
  return extra;
}

// One matcher for many contacts: the people and their contacts are read ONCE (the Inbox asks it for
// every waiting row).
export async function contactMatcher(db) {
  const people = await db.prepare(`SELECT id, name, email, phone, status, owner, source_channel, created_at
    FROM people`).all();
  const extra = await extraContacts(db);
  return ({ email, phone, name } = {}, { exclude } = {}) => {
    const e = normEmail(email);
    const ph = normPhone(phone);
    const n = normName(name);
    if (!e && !ph && !n) return [];
    const emailsOf = (r) => [r.email, ...((extra.get(r.id) || {}).emails || [])].map(normEmail).filter(Boolean);
    const phonesOf = (r) => [r.phone, ...((extra.get(r.id) || {}).phones || [])].map(normPhone).filter((x) => x.length > 5);
    const hitEmail = (r) => Boolean(e) && emailsOf(r).includes(e);
    const hitPhone = (r) => ph.length > 5 && phonesOf(r).some((x) => x.endsWith(ph.slice(-PHONE_TAIL)));
    const hitName = (r) => Boolean(n) && normName(r.name) === n;
    return people
      .filter((r) => r.id !== exclude && (hitEmail(r) || hitPhone(r) || hitName(r)))
      .map((r) => ({
        ...r,
        matchedOn: [hitEmail(r) && 'email', hitPhone(r) && 'phone', hitName(r) && 'name'].filter(Boolean),
      }))
      .sort((a, b) => strength(b) - strength(a));
  };
}

// The one person a contact strongly points at (email or phone), or null. Two strong candidates is a
// question for a human, never a coin toss.
export function onlyStrong(matches) {
  const ids = [...new Set(matches.filter(isStrong).map((m) => m.id))];
  return ids.length === 1 ? matches.find((m) => m.id === ids[0]) : null;
}

export async function findMatches(db, { email, phone, name }, { exclude } = {}) {
  return (await contactMatcher(db))({ email, phone, name }, { exclude });
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
