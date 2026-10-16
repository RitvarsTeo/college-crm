// ONE NAME PER PROGRAMME (the owner, 16.10.2026, after Admissions: filtering Journey by "OS" showed only admitted
// students). The SIS writes short codes (OS, MTM, WTT, OR) while leads carry the Intake names (MT OS, MT MTM, MT WTT,
// MT MR), so one programme was two values on the Programme filter. config.sis.programmeMap holds the owner's mapping;
// every import passes its programme through intakeProgramme() before it is stored or shown:
//   the SIS pull and webhook (src/sync.js storeSisRow), the admissions sheet (src/sheetsync.js readRow),
//   a lead form's fetched answers (src/leadanswers.js).
// A value not in the map is kept exactly as it came, never guessed; the SIS run counts it (unknownProgrammes).
//
// The rows stored before the map are put right by programmeNamesRepair(), a one-off for admins (the route
// /api/admin/people/programme-names): the preview (apply:false, the default) counts old -> new per table, with ids only
// and no names, and changes nothing; apply:true rewrites them, each person's change logged in their History as a
// machine edit. Running it twice changes nothing the second time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logEvent, AUTOMATIC } from './history.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

export const programmeMap = (cfg = CFG) => (cfg && cfg.sis && cfg.sis.programmeMap) || {};

/** The Intake name for a programme as an import gave it. Unknown values (and empty ones) come back unchanged. */
export function intakeProgramme(value, cfg = CFG) {
  if (value == null) return value;
  const key = String(value).trim();
  const map = programmeMap(cfg);
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : value;
}

/** True for a non-empty value that is neither an Intake programme nor in the map: kept as it came, and reported. */
export function unknownProgramme(value, cfg = CFG) {
  if (value == null || String(value).trim() === '') return false;
  const key = String(value).trim();
  return !(cfg.programmes || []).includes(key) && !Object.prototype.hasOwnProperty.call(programmeMap(cfg), key);
}

export const REPAIR_NOTE = 'one name per programme';
export const REPAIR_ACTOR = 'Intake';
const changed = (r) => Number((r && (r.changes ?? r.rowCount)) || 0);

// THE ONE-OFF REPAIR. Three places hold a programme for a person: people.programme (the Programme the app shows and
// filters by), field_values 'interest' (what the SIS or a form said the person wants; the person page reads it) and
// sis_applicants.programme_code (Reports > Applications groups by it). Nothing else is touched: the History keeps what
// it said at the time.
export async function programmeNamesRepair(db, { apply = false, by, at = new Date().toISOString(), cfg = CFG } = {}) {
  if (apply && !by) return { error: 'who is applying this?' };
  const map = programmeMap(cfg);
  const olds = Object.keys(map);
  const label = (old) => `${old} -> ${map[old]}`;
  const marks = olds.map(() => '?').join(', ');
  const zero = () => Object.fromEntries(olds.map((o) => [label(o), 0]));
  if (!olds.length) return { applied: false, map, people: {}, interest: {}, sisApplicants: {}, ids: { people: [] } };

  const people = await db.prepare(`SELECT id, programme FROM people WHERE programme IN (${marks}) ORDER BY id`).all(...olds);
  const interest = await db.prepare(`SELECT programme_old, COUNT(*) AS n FROM (SELECT value AS programme_old FROM field_values
    WHERE field = 'interest' AND value IN (${marks})) x GROUP BY programme_old`).all(...olds);
  const sis = await db.prepare(`SELECT programme_code, COUNT(*) AS n FROM sis_applicants WHERE programme_code IN (${marks})
    GROUP BY programme_code`).all(...olds);

  const out = { applied: Boolean(apply), map, people: zero(), interest: zero(), sisApplicants: zero(),
    ids: { people: people.map((p) => p.id) } };
  for (const p of people) out.people[label(p.programme)]++;
  for (const r of interest) out.interest[label(r.programme_old)] = Number(r.n);
  for (const r of sis) out.sisApplicants[label(r.programme_code)] = Number(r.n);
  out.total = { people: people.length, interest: interest.reduce((s, r) => s + Number(r.n), 0),
    sisApplicants: sis.reduce((s, r) => s + Number(r.n), 0) };
  // what is neither an Intake name nor in the map: left exactly as it is, counted so somebody can decide
  const unknown = (rows, key) => Object.fromEntries(rows.filter((r) => unknownProgramme(r[key], cfg)).map((r) => [r[key], Number(r.n)]));
  out.unknown = {
    people: unknown(await db.prepare('SELECT programme, COUNT(*) AS n FROM people GROUP BY programme').all(), 'programme'),
    sisApplicants: unknown(await db.prepare('SELECT programme_code, COUNT(*) AS n FROM sis_applicants GROUP BY programme_code').all(), 'programme_code'),
  };
  if (!apply) return out;

  const done = { people: 0, interest: 0, sisApplicants: 0 };
  await db.transaction(async (tx) => {
    for (const p of people) {
      const to = map[p.programme];
      // only a row that still says the old name: a person changed since the preview is left alone
      const r = await tx.prepare('UPDATE people SET programme = ? WHERE id = ? AND programme = ?').run(to, p.id, p.programme);
      if (!changed(r)) continue;
      done.people++;
      await logEvent(tx, { personId: p.id, kind: 'edit', direction: 'note', at, origin: AUTOMATIC, actor: REPAIR_ACTOR,
        subject: `Programme ${p.programme} -> ${to} (${REPAIR_NOTE})`, body: `one-off, applied by ${by}`,
        field: 'programme', oldValue: p.programme, newValue: to });
    }
    for (const old of olds) {
      done.interest += changed(await tx.prepare(`UPDATE field_values SET value = ? WHERE field = 'interest' AND value = ?`).run(map[old], old));
      done.sisApplicants += changed(await tx.prepare('UPDATE sis_applicants SET programme_code = ? WHERE programme_code = ?').run(map[old], old));
    }
    await tx.prepare(`INSERT INTO sync_state (name, value, ran_at, detail) VALUES ('programme_names_repair', ?, ?, ?)
      ON CONFLICT (name) DO UPDATE SET value = excluded.value, ran_at = excluded.ran_at, detail = excluded.detail`)
      .run(String(done.people), at, JSON.stringify({ by, ...done }));
  });
  return { ...out, done };
}
